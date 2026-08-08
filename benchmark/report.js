export const REPORT_SCHEMA_VERSION = 2;

const MODES = Object.freeze(['cold', 'steady']);

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function validateHostReport(value) {
  const report = objectAt(value, 'report');

  exactNumberAt(report.schemaVersion, 'schemaVersion', REPORT_SCHEMA_VERSION);
  nonEmptyStringAt(report.generatedAt, 'generatedAt');
  nonEmptyStringAt(report.runId, 'runId');
  nonEmptyStringAt(report.host, 'host');
  nonEmptyStringAt(report.version, 'version');

  const config = objectAt(report.config, 'config');
  nonEmptyStringAt(config.profile, 'config.profile');
  positiveIntegerAt(config.warmups, 'config.warmups');
  positiveIntegerAt(config.samples, 'config.samples');
  positiveFiniteAt(config.targetSampleMs, 'config.targetSampleMs');
  positiveIntegerAt(config.maxBatchSize, 'config.maxBatchSize');

  const workloads = arrayAt(config.workloads, 'config.workloads');
  const workloadMap = new Map();

  if (workloads.length === 0) {
    throw new TypeError('config.workloads must contain at least one workload');
  }

  workloads.forEach((entry, index) => {
    const path = `config.workloads[${index}]`;
    const workload = objectAt(entry, path);

    nonEmptyStringAt(workload.name, `${path}.name`);
    nonEmptyStringAt(workload.source, `${path}.source`);
    integerAt(workload.expectedChecksum, `${path}.expectedChecksum`);

    if (workloadMap.has(workload.name)) {
      throw new TypeError(`${path}.name must be unique`);
    }

    workloadMap.set(workload.name, workload.expectedChecksum);
  });

  const results = arrayAt(report.results, 'results');
  const seenPairs = new Set();

  if (results.length !== workloads.length * MODES.length) {
    throw new TypeError(
      `results must contain exactly ${workloads.length * MODES.length} workload/mode rows`,
    );
  }

  results.forEach((entry, index) => {
    const path = `results[${index}]`;
    const result = objectAt(entry, path);

    nonEmptyStringAt(result.workload, `${path}.workload`);
    modeAt(result.mode, `${path}.mode`);
    nonEmptyStringAt(result.boundary, `${path}.boundary`);
    integerAt(result.checksum, `${path}.checksum`);
    positiveFiniteAt(result.slowdown, `${path}.slowdown`);

    const expectedChecksum = workloadMap.get(result.workload);

    if (expectedChecksum === undefined) {
      throw new TypeError(`${path}.workload must match config.workloads`);
    }

    if (result.checksum !== expectedChecksum) {
      throw new TypeError(
        `${path}.checksum must match config.workloads for ${result.workload}`,
      );
    }

    const pairKey = `${result.workload}:${result.mode}`;

    if (seenPairs.has(pairKey)) {
      throw new TypeError(`${path} duplicates workload/mode pair ${pairKey}`);
    }

    seenPairs.add(pairKey);

    const lanes = objectAt(result.lanes, `${path}.lanes`);
    validateLane(lanes.native, `${path}.lanes.native`, config.samples);
    validateLane(lanes.jsjs, `${path}.lanes.jsjs`, config.samples);
  });

  workloads.forEach((workload, workloadIndex) => {
    MODES.forEach((mode) => {
      const pairKey = `${workload.name}:${mode}`;

      if (!seenPairs.has(pairKey)) {
        throw new TypeError(
          `results missing workload/mode pair ${pairKey} from config.workloads[${workloadIndex}]`,
        );
      }
    });
  });

  return value;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {number} expectedSamples
 * @returns {void}
 */
function validateLane(value, path, expectedSamples) {
  const lane = objectAt(value, path);

  positiveIntegerAt(lane.batchSize, `${path}.batchSize`);
  const samplesMs = numericArrayAt(
    lane.samplesMs,
    `${path}.samplesMs`,
    expectedSamples,
    true,
  );
  const normalizedSamplesMs = numericArrayAt(
    lane.normalizedSamplesMs,
    `${path}.normalizedSamplesMs`,
    expectedSamples,
    true,
  );
  const summary = objectAt(lane.summary, `${path}.summary`);

  positiveFiniteAt(summary.median, `${path}.summary.median`);
  positiveFiniteAt(summary.p95, `${path}.summary.p95`);
  nonNegativeFiniteAt(
    summary.coefficientOfVariation,
    `${path}.summary.coefficientOfVariation`,
  );

  if (samplesMs.length !== expectedSamples) {
    throw new TypeError(
      `${path}.samplesMs must contain ${expectedSamples} entries`,
    );
  }

  if (normalizedSamplesMs.length !== expectedSamples) {
    throw new TypeError(
      `${path}.normalizedSamplesMs must contain ${expectedSamples} entries`,
    );
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {Record<string, any>}
 */
function objectAt(value, path) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }

  return /** @type {Record<string, any>} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {any[]}
 */
function arrayAt(value, path) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array`);
  }

  return /** @type {any[]} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {number} expectedLength
 * @param {boolean} requirePositive
 * @returns {number[]}
 */
function numericArrayAt(value, path, expectedLength, requirePositive) {
  const array = arrayAt(value, path);

  if (array.length !== expectedLength) {
    throw new TypeError(`${path} must contain ${expectedLength} entries`);
  }

  return /** @type {number[]} */ (
    array.map((entry, index) => {
      const entryPath = `${path}[${index}]`;

      if (!Number.isFinite(entry)) {
        throw new TypeError(`${entryPath} must be a finite number`);
      }

      if (requirePositive && entry <= 0) {
        throw new TypeError(`${entryPath} must be a positive finite number`);
      }

      return /** @type {number} */ (entry);
    })
  );
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {void}
 */
function nonEmptyStringAt(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {void}
 */
function positiveIntegerAt(value, path) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${path} must be a positive integer`);
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {void}
 */
function integerAt(value, path) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TypeError(`${path} must be an integer`);
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {void}
 */
function positiveFiniteAt(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${path} must be a positive finite number`);
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {void}
 */
function nonNegativeFiniteAt(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${path} must be a non-negative finite number`);
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {number} expected
 * @returns {void}
 */
function exactNumberAt(value, path, expected) {
  if (typeof value !== 'number' || !Object.is(value, expected)) {
    throw new TypeError(`${path} must equal ${expected}`);
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {void}
 */
function modeAt(value, path) {
  if (value !== 'cold' && value !== 'steady') {
    throw new TypeError(`${path} must be "cold" or "steady"`);
  }
}
