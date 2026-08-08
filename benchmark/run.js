import { calibrateBatchSize } from './calibration.js';
import { createJsjsExecutors, createNativeExecutors } from './executors.js';
import { REPORT_SCHEMA_VERSION } from './report.js';
import { summarizeSamples } from './statistics.js';

/** @type {Readonly<Record<'cold' | 'steady', string>>} */
const BOUNDARIES = Object.freeze({
  cold: 'Cold uses one unbatched invocation per sample: native constructs a unique Function source and invokes it; jsjs creates a fresh realm and evaluates the workload source.',
  steady:
    'Native steady invokes one precompiled host function; jsjs steady invokes one pre-created guest function in one pre-created realm.',
});

/** @type {readonly ('cold' | 'steady')[]} */
const MODES = Object.freeze(['cold', 'steady']);

/**
 * @param {{
 *   host: string,
 *   version: string,
 *   now: () => number,
 *   engine: {
 *     createExecutors?: (workload: {
 *       name: string,
 *       source: string,
 *       expectedChecksum: number,
 *     }) => {
 *       native: { cold: () => number, steady: () => number },
 *       jsjs: { cold: () => number, steady: () => number },
 *     },
 *   } & Record<string, unknown>,
 *   config: {
 *     profile: string,
 *     warmups: number,
 *     samples: number,
 *     targetSampleMs: number,
 *     maxBatchSize: number,
 *     workloads: readonly {
 *       name: string,
 *       source: string,
 *       expectedChecksum: number,
 *     }[],
 *   },
 *   generatedAt: string,
 *   runId: string,
 * }} options
 * @returns {{
 *   schemaVersion: 2,
 *   generatedAt: string,
 *   runId: string,
 *   host: string,
 *   version: string,
 *   config: {
 *     profile: string,
 *     warmups: number,
 *     samples: number,
 *     targetSampleMs: number,
 *     maxBatchSize: number,
 *     workloads: readonly {
 *       name: string,
 *       source: string,
 *       expectedChecksum: number,
 *     }[],
 *   },
 *   results: readonly {
 *     workload: string,
 *     mode: 'cold' | 'steady',
 *     boundary: string,
 *     checksum: number,
 *     lanes: {
 *       native: LaneResult,
 *       jsjs: LaneResult,
 *     },
 *     slowdown: number,
 *   }[],
 * }}
 */
export function runHostBenchmark({
  host,
  version,
  now,
  engine,
  config,
  generatedAt,
  runId,
}) {
  const results = [];

  for (const workload of config.workloads) {
    const executors = createExecutors(engine, workload);

    for (const mode of MODES) {
      const native = sampleLane(executors.native[mode], {
        config,
        expectedChecksum: workload.expectedChecksum,
        now,
        context: `${mode} native ${workload.name}`,
        mode,
      });
      const jsjs = sampleLane(executors.jsjs[mode], {
        config,
        expectedChecksum: workload.expectedChecksum,
        now,
        context: `${mode} jsjs ${workload.name}`,
        mode,
      });

      results.push(
        Object.freeze({
          workload: workload.name,
          mode,
          boundary: BOUNDARIES[mode],
          checksum: workload.expectedChecksum,
          lanes: Object.freeze({
            native,
            jsjs,
          }),
          slowdown: jsjs.summary.median / native.summary.median,
        }),
      );
    }
  }

  return Object.freeze({
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt,
    runId,
    host,
    version,
    config,
    results: Object.freeze(results),
  });
}

/**
 * @typedef {{
 *   batchSize: number,
 *   samplesMs: readonly number[],
 *   normalizedSamplesMs: readonly number[],
 *   summary: {
 *     median: number,
 *     p95: number,
 *     coefficientOfVariation: number,
 *   },
 * }} LaneResult
 */

/**
 * @param {{
 *   createExecutors?: (workload: {
 *     name: string,
 *     source: string,
 *     expectedChecksum: number,
 *   }) => {
 *     native: { cold: () => number, steady: () => number },
 *     jsjs: { cold: () => number, steady: () => number },
 *   },
 *   createRealm?: () => { globalObject: object },
 *   evaluateScript?: (
 *     realm: { globalObject: object },
 *     source: string,
 *   ) => { type: string, value: unknown },
 * }} engine
 * @param {{ name: string, source: string, expectedChecksum: number }} workload
 * @returns {{
 *   native: { cold: () => number, steady: () => number },
 *   jsjs: { cold: () => number, steady: () => number },
 * }}
 */
function createExecutors(engine, workload) {
  if (typeof engine.createExecutors === 'function') {
    return engine.createExecutors(workload);
  }

  return Object.freeze({
    native: createNativeExecutors(workload),
    jsjs: createJsjsExecutors(/** @type {any} */ (engine), workload),
  });
}

/**
 * @param {() => number} execute
 * @param {{
 *   config: {
 *     warmups: number,
 *     samples: number,
 *     targetSampleMs: number,
 *     maxBatchSize: number,
 *   },
 *   expectedChecksum: number,
 *   now: () => number,
 *   context: string,
 *   mode: 'cold' | 'steady',
 * }} options
 * @returns {LaneResult}
 */
function sampleLane(execute, options) {
  /** @param {number} count */
  const runBatch = (count) =>
    measureBatch(execute, count, {
      now: options.now,
      expectedChecksum: options.expectedChecksum,
      context: options.context,
    });
  const batchSize =
    options.mode === 'cold'
      ? 1
      : calibrateBatchSize(runBatch, {
          expectedChecksum: options.expectedChecksum,
          targetSampleMs: options.config.targetSampleMs,
          maxBatchSize: options.config.maxBatchSize,
          context: options.context,
        }).batchSize;

  for (let index = 0; index < options.config.warmups; index += 1) {
    runBatch(batchSize);
  }

  const samplesMs = [];
  const normalizedSamplesMs = [];

  for (let index = 0; index < options.config.samples; index += 1) {
    const measurement = runBatch(batchSize);
    samplesMs.push(measurement.elapsedMs);
    normalizedSamplesMs.push(measurement.elapsedMs / batchSize);
  }

  return Object.freeze({
    batchSize,
    samplesMs: Object.freeze(samplesMs),
    normalizedSamplesMs: Object.freeze(normalizedSamplesMs),
    summary: summarizeSamples(normalizedSamplesMs),
  });
}

/**
 * @param {() => number} execute
 * @param {number} count
 * @param {{
 *   now: () => number,
 *   expectedChecksum: number,
 *   context: string,
 * }} options
 * @returns {{ elapsedMs: number, checksum: number }}
 */
export function measureBatch(execute, count, options) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new RangeError(
      `${options.context} batch count must be a positive integer`,
    );
  }

  const startedAt = options.now();
  let checksum = execute();
  /** @type {{ invocation: number, checksum: number } | null} */
  let mismatch =
    checksum !== options.expectedChecksum
      ? {
          invocation: 1,
          checksum,
        }
      : null;

  for (let index = 1; index < count && mismatch === null; index += 1) {
    checksum = execute();

    if (checksum !== options.expectedChecksum) {
      mismatch = {
        invocation: index + 1,
        checksum,
      };
      break;
    }
  }

  const elapsedMs = options.now() - startedAt;

  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    throw new RangeError(
      `${options.context} elapsedMs must be a positive finite number`,
    );
  }

  if (mismatch !== null) {
    throw new Error(
      `${options.context} checksum mismatch at batch invocation ${mismatch.invocation} of ${count}: expected ${options.expectedChecksum}, got ${mismatch.checksum}`,
    );
  }

  return {
    elapsedMs,
    checksum,
  };
}
