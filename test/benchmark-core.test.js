import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm, evaluateScript } from '../src/index.js';
import {
  createJsjsExecutors,
  createNativeExecutors,
} from '../benchmark/executors.js';
import {
  REPORT_SCHEMA_VERSION,
  validateHostReport,
} from '../benchmark/report.js';
import { measureBatch, runHostBenchmark } from '../benchmark/run.js';
import { monotonicNowFrom } from '../benchmark/host.js';
import { PROFILES, resolveBenchmarkConfig } from '../benchmark/config.js';
import { calibrateBatchSize } from '../benchmark/calibration.js';
import {
  coefficientOfVariation,
  geometricMean,
  median,
  percentile95,
  summarizeSamples,
} from '../benchmark/statistics.js';
import { WORKLOADS, workloadsForProfile } from '../benchmark/workloads.js';

const SOURCE = Object.freeze({
  gitCommit: '0123456789abcdef0123456789abcdef01234567',
  gitDirty: false,
});

/**
 * @param {number} actual
 * @param {number} expected
 * @param {number} tolerance
 * @returns {void}
 */
function assertWithin(actual, expected, tolerance) {
  assertSame(Math.abs(actual - expected) <= tolerance, true);
}

/**
 * @param {unknown} value
 * @returns {any}
 */
function cloneValue(value) {
  return /** @type {any} */ (JSON.parse(JSON.stringify(value)));
}

/**
 * @param {{
 *   results: readonly {
 *     boundary: string,
 *     mode: 'cold' | 'steady',
 *     lanes: {
 *       native: {
 *         batchSize: number,
 *         samplesMs: readonly number[],
 *         normalizedSamplesMs: readonly number[],
 *       },
 *       jsjs: {
 *         batchSize: number,
 *         samplesMs: readonly number[],
 *         normalizedSamplesMs: readonly number[],
 *       },
 *     },
 *     slowdown: number,
 *   }[],
 * }} report
 * @param {'cold' | 'steady'} mode
 * @returns {{
 *   boundary: string,
 *   mode: 'cold' | 'steady',
 *   lanes: {
 *     native: {
 *       batchSize: number,
 *       samplesMs: readonly number[],
 *       normalizedSamplesMs: readonly number[],
 *     },
 *     jsjs: {
 *       batchSize: number,
 *       samplesMs: readonly number[],
 *       normalizedSamplesMs: readonly number[],
 *     },
 *   },
 *   slowdown: number,
 * }}
 */
function findResult(report, mode) {
  const result = report.results.find((entry) => entry.mode === mode);

  if (result === undefined) {
    throw new Error(`Missing benchmark result for mode ${mode}`);
  }

  return result;
}

const tests = [
  {
    name: 'host reports require clean source metadata',
    run() {
      let nowMs = 0;
      const report = runHostBenchmark({
        host: 'fixture',
        version: '1',
        now: () => nowMs,
        engine: {
          createExecutors() {
            return {
              native: {
                cold() {
                  nowMs += 1;
                  return 326514743;
                },
                steady() {
                  nowMs += 1;
                  return 326514743;
                },
              },
              jsjs: {
                cold() {
                  nowMs += 2;
                  return 326514743;
                },
                steady() {
                  nowMs += 2;
                  return 326514743;
                },
              },
            };
          },
        },
        config: resolveBenchmarkConfig({
          profile: 'smoke',
          warmups: 1,
          samples: 3,
          workloads: ['arithmetic-loops'],
        }),
        generatedAt: '2026-08-07T00:00:00.000Z',
        runId: 'fixture-run',
        source: SOURCE,
      });
      const missingSource = cloneValue(report);
      const badSchema = cloneValue(report);
      const missingRunId = cloneValue(report);
      const badChecksum = cloneValue(report);
      const badSampleCount = cloneValue(report);
      const emptyWorkloads = cloneValue(report);

      delete missingSource.source;
      badSchema.schemaVersion = REPORT_SCHEMA_VERSION + 1;
      delete missingRunId.runId;
      badChecksum.results[0].checksum += 1;
      badSampleCount.results[0].lanes.native.samplesMs.pop();
      emptyWorkloads.config.workloads = [];
      emptyWorkloads.results = [];

      assertSame(validateHostReport(report), report);
      assertSame(
        assertThrows(
          () => validateHostReport(missingSource),
          TypeError,
        ).message.includes('source'),
        true,
      );
      assertSame(
        assertThrows(
          () => validateHostReport(badSchema),
          TypeError,
        ).message.includes('schemaVersion'),
        true,
      );
      assertSame(
        assertThrows(
          () => validateHostReport(missingRunId),
          TypeError,
        ).message.includes('runId'),
        true,
      );
      assertSame(
        assertThrows(
          () => validateHostReport(badChecksum),
          TypeError,
        ).message.includes('results[0].checksum'),
        true,
      );
      assertSame(
        assertThrows(
          () => validateHostReport(badSampleCount),
          TypeError,
        ).message.includes('results[0].lanes.native.samplesMs'),
        true,
      );
      assertSame(
        assertThrows(
          () => validateHostReport(emptyWorkloads),
          TypeError,
        ).message.includes('config.workloads'),
        true,
      );
    },
  },
  {
    name: 'host benchmark measures deterministic native and jsjs batches per mode',
    run() {
      let nowMs = 0;
      let executorFactories = 0;
      const report = runHostBenchmark({
        host: 'fixture',
        version: '1',
        now: () => nowMs,
        engine: {
          createExecutors() {
            executorFactories += 1;

            return {
              native: {
                cold() {
                  nowMs += 1;
                  return 326514743;
                },
                steady() {
                  nowMs += 1;
                  return 326514743;
                },
              },
              jsjs: {
                cold() {
                  nowMs += 2;
                  return 326514743;
                },
                steady() {
                  nowMs += 2;
                  return 326514743;
                },
              },
            };
          },
        },
        config: resolveBenchmarkConfig({
          profile: 'smoke',
          warmups: 1,
          samples: 3,
          workloads: ['arithmetic-loops'],
        }),
        generatedAt: '2026-08-07T00:00:00.000Z',
        runId: 'fixture-run',
        source: SOURCE,
      });
      const coldResult = findResult(report, 'cold');
      const steadyResult = findResult(report, 'steady');

      assertSame(report.schemaVersion, REPORT_SCHEMA_VERSION);
      assertSame(report.results.length, 2);
      assertSame(executorFactories, 1);
      assertSame(coldResult.lanes.native.batchSize, 1);
      assertSame(coldResult.lanes.native.samplesMs.join(','), '1,1,1');
      assertSame(
        coldResult.lanes.native.normalizedSamplesMs.join(','),
        '1,1,1',
      );
      assertSame(coldResult.lanes.jsjs.batchSize, 1);
      assertSame(coldResult.lanes.jsjs.samplesMs.join(','), '2,2,2');
      assertSame(coldResult.lanes.jsjs.normalizedSamplesMs.join(','), '2,2,2');
      assertSame(steadyResult.lanes.native.batchSize, 5);
      assertSame(steadyResult.lanes.jsjs.batchSize, 3);
      assertSame(coldResult.slowdown, 2);
      assertSame(steadyResult.slowdown, 2);
      assertSame(
        coldResult.boundary.includes('one unbatched invocation'),
        true,
      );
    },
  },
  {
    name: 'host benchmark rejects cold checksum mismatches from unbatched warmup and measured invocations',
    run() {
      const expectedChecksum = 326514743;
      const badInvocations = Object.freeze({
        warmup: 1,
        measured: 2,
      });

      for (const [, badInvocation] of Object.entries(badInvocations)) {
        let nowMs = 0;
        let nativeColdCalls = 0;
        const error = assertThrows(
          () =>
            runHostBenchmark({
              host: 'fixture',
              version: '1',
              now: () => nowMs,
              engine: {
                createExecutors() {
                  return {
                    native: {
                      cold() {
                        nativeColdCalls += 1;
                        nowMs += 1;
                        if (nativeColdCalls === badInvocation) {
                          return expectedChecksum + 1;
                        }
                        return expectedChecksum;
                      },
                      steady() {
                        nowMs += 1;
                        return expectedChecksum;
                      },
                    },
                    jsjs: {
                      cold() {
                        nowMs += 1;
                        return expectedChecksum;
                      },
                      steady() {
                        nowMs += 1;
                        return expectedChecksum;
                      },
                    },
                  };
                },
              },
              config: resolveBenchmarkConfig({
                profile: 'smoke',
                warmups: 1,
                samples: 1,
                workloads: ['arithmetic-loops'],
              }),
              generatedAt: '2026-08-07T00:00:00.000Z',
              runId: 'fixture-run',
              source: SOURCE,
            }),
          Error,
        );
        assertSame(error.message.includes('arithmetic-loops'), true);
        assertSame(error.message.includes('cold'), true);
        assertSame(error.message.includes('native'), true);
        assertSame(nativeColdCalls, badInvocation);
      }
    },
  },
  {
    name: 'host benchmark rejects unmeasurable cold samples with host workload mode and lane context',
    run() {
      const rawTimes = [0, 1, 1, 1];
      const error = assertThrows(
        () =>
          runHostBenchmark({
            host: 'coarse-host',
            version: '1',
            now: monotonicNowFrom(() => rawTimes.shift() ?? 1),
            engine: {
              createExecutors() {
                return {
                  native: {
                    cold() {
                      return 326514743;
                    },
                    steady() {
                      return 326514743;
                    },
                  },
                  jsjs: {
                    cold() {
                      return 326514743;
                    },
                    steady() {
                      return 326514743;
                    },
                  },
                };
              },
            },
            config: resolveBenchmarkConfig({
              profile: 'smoke',
              warmups: 1,
              samples: 1,
              workloads: ['arithmetic-loops'],
            }),
            generatedAt: '2026-08-07T00:00:00.000Z',
            runId: 'coarse-clock-run',
            source: SOURCE,
          }),
        RangeError,
      );

      for (const fragment of [
        'coarse-host',
        'arithmetic-loops',
        'cold',
        'native',
        'clock',
      ]) {
        assertSame(error.message.includes(fragment), true);
      }
    },
  },
  {
    name: 'measured batches reject non-positive and non-integer counts before timing or execution',
    run() {
      for (const count of [0, -1, 1.5]) {
        let executeCalls = 0;
        let nowCalls = 0;
        const error = assertThrows(
          () =>
            measureBatch(
              () => {
                executeCalls += 1;
                return 17;
              },
              count,
              {
                now: () => {
                  nowCalls += 1;
                  return nowCalls;
                },
                expectedChecksum: 17,
                context: 'fixture lane',
              },
            ),
          RangeError,
        );

        assertSame(
          error.message,
          'fixture lane batch count must be a positive integer',
        );
        assertSame(executeCalls, 0);
        assertSame(nowCalls, 0);
      }
    },
  },
  {
    name: 'measured batches report invalid elapsed time before checksum mismatch on aborting batches',
    run() {
      let nowCalls = 0;
      let executeCalls = 0;
      const error = assertThrows(
        () =>
          measureBatch(
            () => {
              executeCalls += 1;
              return 9;
            },
            1,
            {
              now: () => {
                nowCalls += 1;
                return nowCalls === 1 ? 5 : Number.NaN;
              },
              expectedChecksum: 17,
              context: 'fixture lane',
            },
          ),
        RangeError,
      );

      assertSame(
        error.message,
        'fixture lane elapsedMs must be a positive finite number',
      );
      assertSame(executeCalls, 1);
      assertSame(nowCalls, 2);
    },
  },
  {
    name: 'native steady executors preserve plain function this binding',
    run() {
      const executors = createNativeExecutors({
        name: 'this-fixture',
        source: '(function () { return this === globalThis ? 1 : 0; }())',
        expectedChecksum: 1,
      });

      assertSame(executors.cold(), 1);
      assertSame(executors.steady(), 1);
    },
  },
  {
    name: 'native executors compile unique cold sources each time and steady source once',
    run() {
      /** @type {string[]} */
      const compileSources = [];
      let coldCalls = 0;
      let steadyCalls = 0;
      const executors = createNativeExecutors(
        {
          name: 'fixture',
          source: '(function () { return 17; }())',
          expectedChecksum: 17,
        },
        /** @param {string} source */
        (source) => {
          compileSources.push(source);

          if (source.includes('return function () { return 17; };')) {
            return () => () => {
              steadyCalls += 1;
              return 17;
            };
          }

          return () => {
            coldCalls += 1;
            return 17;
          };
        },
      );

      assertSame(executors.cold(), 17);
      assertSame(executors.cold(), 17);
      assertSame(executors.steady(), 17);
      assertSame(executors.steady(), 17);
      assertSame(coldCalls, 2);
      assertSame(steadyCalls, 2);
      assertSame(compileSources.length, 3);
      assertSame(
        compileSources[1].includes('return (function () { return 17; }());'),
        true,
      );
      assertSame(
        compileSources[2].includes('return (function () { return 17; }());'),
        true,
      );
      assertSame(compileSources[1] === compileSources[2], false);
      assertSame(
        compileSources.filter(
          (source) => source === 'return function () { return 17; };',
        ).length,
        1,
      );
    },
  },
  {
    name: 'jsjs steady executors read guest functions through the real realm API',
    run() {
      const executors = createJsjsExecutors(
        { createRealm, evaluateScript },
        {
          name: 'fixture',
          source: '(function () { return 17; }())',
          expectedChecksum: 17,
        },
      );

      assertSame(executors.steady(), 17);
      assertSame(executors.steady(), 17);
    },
  },
  {
    name: 'jsjs cold executors preserve negative int32 checksums and reject invalid ones with context',
    run() {
      /**
       * @param {unknown} coldValue
       * @returns {{
       *   createRealm: () => { globalObject: Record<string, unknown> },
       *   evaluateScript: (
       *     realm: { globalObject: Record<string, unknown> },
       *     source: string,
       *   ) => { type: 'normal', value: unknown },
       * }}
       */
      function createEngine(coldValue) {
        return {
          createRealm() {
            return { globalObject: {} };
          },
          evaluateScript(realm, source) {
            if (source.includes('__jsjsBenchmark')) {
              realm.globalObject.__jsjsBenchmark = {
                callFunction() {
                  return 17;
                },
              };
              return { type: 'normal', value: undefined };
            }

            return { type: 'normal', value: coldValue };
          },
        };
      }

      const workload = {
        name: 'calls-recursion',
        source: '(function () { return 17; }())',
        expectedChecksum: -1100296460,
      };
      const validExecutors = createJsjsExecutors(
        createEngine(workload.expectedChecksum),
        workload,
      );

      assertSame(validExecutors.cold(), workload.expectedChecksum);

      for (const invalidValue of [17.5, 2147483648]) {
        const invalidExecutors = createJsjsExecutors(
          createEngine(invalidValue),
          workload,
        );
        const error = assertThrows(() => invalidExecutors.cold(), RangeError);

        assertSame(error.message.includes('calls-recursion'), true);
        assertSame(error.message.includes('cold jsjs'), true);
      }
    },
  },
  {
    name: 'jsjs executors isolate cold calls and reuse one steady guest function',
    run() {
      /** @type {{ globalObject: Record<string, unknown> }[]} */
      const createdRealms = [];
      /** @type {string[]} */
      const evaluatedSources = [];
      /** @type {{ thisValue: unknown, args: readonly unknown[], self: unknown }[]} */
      const steadyInvocations = [];
      const steadyGuestFunction = {
        /**
         * @param {unknown} thisValue
         * @param {readonly unknown[]} args
         * @returns {number}
         */
        callFunction(thisValue, args) {
          steadyInvocations.push({ thisValue, args, self: this });
          return 17;
        },
      };
      const engine = {
        createRealm() {
          const realm = { globalObject: {} };
          createdRealms.push(realm);
          return realm;
        },
        /**
         * @param {{ globalObject: Record<string, unknown> }} realm
         * @param {string} source
         * @returns {{ type: 'normal', value: unknown }}
         */
        evaluateScript(realm, source) {
          evaluatedSources.push(source);

          if (source.includes('__jsjsBenchmark')) {
            realm.globalObject.__jsjsBenchmark = steadyGuestFunction;
            return { type: 'normal', value: undefined };
          }

          return { type: 'normal', value: 17 };
        },
      };
      const executors = createJsjsExecutors(engine, {
        name: 'fixture',
        source: '(function () { return 17; }())',
        expectedChecksum: 17,
      });

      assertSame(executors.cold(), 17);
      assertSame(executors.cold(), 17);
      assertSame(executors.steady(), 17);
      assertSame(executors.steady(), 17);
      assertSame(createdRealms.length, 3);
      assertSame(
        evaluatedSources.filter(
          (source) => source === '(function () { return 17; }())',
        ).length,
        2,
      );
      assertSame(
        evaluatedSources.some((source) =>
          source.includes('function __jsjsBenchmark()'),
        ),
        true,
      );
      assertSame(steadyInvocations.length, 2);
      assertSame(steadyInvocations[0].thisValue, undefined);
      assertSame(Array.isArray(steadyInvocations[0].args), true);
      assertSame(steadyInvocations[0].args.length, 0);
      assertSame(steadyInvocations[0].self, steadyGuestFunction);
      assertSame(steadyInvocations[1].self, steadyGuestFunction);
    },
  },
  {
    name: 'benchmark workloads have committed checksums',
    run() {
      assertSame(
        WORKLOADS.map(
          ({ name, expectedChecksum }) => `${name}:${expectedChecksum}`,
        ).join(','),
        [
          'arithmetic-loops:1397312734',
          'calls-recursion:-1100296460',
          'object-properties:1122746965',
          'arrays:778416596',
          'strings:677005',
          'json:18589934',
          'regexp:8900000',
          'number-invalid-megabyte:1048576',
        ].join(','),
      );
      assertSame(Object.isFrozen(WORKLOADS), true);
      assertSame(Object.isFrozen(WORKLOADS[0]), true);
    },
  },
  {
    name: 'numeric conversion smoke covers a 1 MiB no-whitespace invalid string',
    run() {
      const workload = workloadsForProfile('smoke').find(
        ({ name }) => name === 'number-invalid-megabyte',
      );

      assertSame(workload !== undefined, true);
      assertSame(workload?.source.includes('text.length === 1048576'), true);
      assertSame(workload?.source.includes('Number(text)'), true);
      assertSame(
        Function(`return ${workload?.source};`)(),
        workload?.expectedChecksum,
      );
    },
  },
  {
    name: 'smoke profile keeps every workload with reduced deterministic source',
    run() {
      const smoke = workloadsForProfile('smoke');
      assertSame(smoke.length, WORKLOADS.length);
      assertSame(
        smoke.every((entry) => entry.source.length > 0),
        true,
      );
      assertSame(
        smoke.every((entry) => Number.isInteger(entry.expectedChecksum)),
        true,
      );
      assertSame(
        smoke.some((entry, index) => entry.source !== WORKLOADS[index].source),
        true,
      );
    },
  },
  {
    name: 'smoke profile scales work inside each checksum-preserving invocation',
    run() {
      const smoke = workloadsForProfile('smoke');

      assertSame(
        smoke.every((entry) =>
          entry.source.includes('__jsjsBenchmarkRepeat < 32'),
        ),
        true,
      );
      assertSame(
        smoke.every(
          (entry) =>
            Function(`return ${entry.source};`)() === entry.expectedChecksum,
        ),
        true,
      );
    },
  },
  {
    name: 'benchmark configuration rejects invalid sample settings',
    run() {
      assertSame(PROFILES.default.samples, 9);
      assertSame(PROFILES.smoke.samples, 3);
      assertThrows(() => resolveBenchmarkConfig({ samples: 0 }), RangeError);
      assertThrows(
        () => resolveBenchmarkConfig({ profile: 'missing' }),
        RangeError,
      );
      assertThrows(
        () => resolveBenchmarkConfig({ profile: 'toString' }),
        RangeError,
      );
      assertThrows(() => workloadsForProfile('toString'), RangeError);
      assertThrows(
        () =>
          resolveBenchmarkConfig({
            profile: 'smoke',
            workloads: ['arithmetic-loops', 'arithmetic-loops'],
          }),
        RangeError,
      );
    },
  },
  {
    name: 'benchmark statistics use defined median p95 CV and geomean semantics',
    run() {
      const expectedGeometricMean = Math.exp(
        (Math.log(4) + Math.log(4 * (1 + Number.EPSILON))) / 2,
      );

      assertSame(median([4, 1, 3, 2]), 2.5);
      assertSame(percentile95([1, 2, 3, 4, 5]), 5);
      assertSame(coefficientOfVariation([2, 2, 2]), 0);
      assertWithin(
        geometricMean([4, 4 * (1 + Number.EPSILON)]),
        expectedGeometricMean,
        Number.EPSILON,
      );
      assertThrows(() => median([]), RangeError);
      assertThrows(() => geometricMean([1, 0]), RangeError);
    },
  },
  {
    name: 'benchmark sample summaries freeze median p95 and CV values',
    run() {
      const summary = summarizeSamples([2, 2, 2]);
      assertSame(
        JSON.stringify(summary),
        JSON.stringify({
          median: 2,
          p95: 2,
          coefficientOfVariation: 0,
        }),
      );
      assertSame(Object.isFrozen(summary), true);
    },
  },
  {
    name: 'calibration clears coarse clock granularity before extrapolating toward the target',
    run() {
      /** @type {number[]} */
      const calls = [];
      const result = calibrateBatchSize(
        (count) => {
          calls.push(count);
          return {
            elapsedMs: count < 4 ? Number.EPSILON : count * 2,
            checksum: 17,
          };
        },
        {
          expectedChecksum: 17,
          targetSampleMs: 10,
          maxBatchSize: 128,
          context: 'steady jsjs coarse fixture',
        },
      );
      assertSame(result.batchSize, 5);
      assertSame(result.elapsedMs, 10);
      assertSame(result.checksum, 17);
      assertSame(calls.join(','), '1,2,4,5');
    },
  },
  {
    name: 'calibration grows toward the target without exceeding its bound',
    run() {
      /** @type {number[]} */
      const calls = [];
      const result = calibrateBatchSize(
        (count) => {
          calls.push(count);
          return { elapsedMs: count * 2, checksum: 17 };
        },
        {
          expectedChecksum: 17,
          targetSampleMs: 10,
          maxBatchSize: 4,
          context: 'steady native fixture',
        },
      );
      assertSame(result.batchSize, 4);
      assertSame(calls.join(','), '1,4');
    },
  },
  {
    name: 'calibration returns the max probe when clock granularity never clears before the bound',
    run() {
      /** @type {number[]} */
      const calls = [];
      const result = calibrateBatchSize(
        (count) => {
          calls.push(count);
          return {
            elapsedMs: Number.EPSILON,
            checksum: 17,
          };
        },
        {
          expectedChecksum: 17,
          targetSampleMs: 10,
          maxBatchSize: 4,
          context: 'steady native unresolved fixture',
        },
      );
      assertSame(result.batchSize, 4);
      assertSame(result.elapsedMs, Number.EPSILON);
      assertSame(result.checksum, 17);
      assertSame(calls.join(','), '1,2,4');
    },
  },
  {
    name: 'calibration confirmation never shrinks below the first measurable coarse-clock probe',
    run() {
      /** @type {number[]} */
      const calls = [];
      const result = calibrateBatchSize(
        (count) => {
          calls.push(count);
          return {
            elapsedMs: count === 4 ? 20 : Number.EPSILON,
            checksum: 17,
          };
        },
        {
          expectedChecksum: 17,
          targetSampleMs: 10,
          maxBatchSize: 128,
          context: 'cold native confirmation fixture',
        },
      );
      assertSame(result.batchSize, 4);
      assertSame(result.elapsedMs, 20);
      assertSame(result.checksum, 17);
      assertSame(calls.join(','), '1,2,4,4');
    },
  },
  {
    name: 'calibration identifies checksum failures with context',
    run() {
      const error = assertThrows(
        () =>
          calibrateBatchSize(() => ({ elapsedMs: 1, checksum: 9 }), {
            expectedChecksum: 17,
            targetSampleMs: 10,
            maxBatchSize: 4,
            context: 'cold jsjs arrays',
          }),
        Error,
      );
      assertSame(error.message.includes('cold jsjs arrays'), true);
    },
  },
  {
    name: 'calibration rejects zero and non-finite elapsed times',
    run() {
      assertThrows(
        () =>
          calibrateBatchSize(() => ({ elapsedMs: 0, checksum: 17 }), {
            expectedChecksum: 17,
            targetSampleMs: 10,
            maxBatchSize: 4,
            context: 'zero fixture',
          }),
        RangeError,
      );
      assertThrows(
        () =>
          calibrateBatchSize(
            () => ({ elapsedMs: Number.POSITIVE_INFINITY, checksum: 17 }),
            {
              expectedChecksum: 17,
              targetSampleMs: 10,
              maxBatchSize: 4,
              context: 'infinite fixture',
            },
          ),
        RangeError,
      );
    },
  },
  {
    name: 'calibration rejects invalid target sample and max batch options before probing',
    run() {
      let calls = 0;
      const runBatch = () => {
        calls += 1;
        return { elapsedMs: 1, checksum: 17 };
      };

      assertThrows(
        () =>
          calibrateBatchSize(runBatch, {
            expectedChecksum: 17,
            targetSampleMs: Number.NaN,
            maxBatchSize: 4,
            context: 'nan target fixture',
          }),
        RangeError,
      );
      assertSame(calls, 0);

      assertThrows(
        () =>
          calibrateBatchSize(runBatch, {
            expectedChecksum: 17,
            targetSampleMs: 10,
            maxBatchSize: Number.NaN,
            context: 'nan max fixture',
          }),
        RangeError,
      );
      assertSame(calls, 0);
    },
  },
];

export default tests;
