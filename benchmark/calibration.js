/**
 * @param {(count: number) => { elapsedMs: number, checksum: number }} runBatch
 * @param {{
 *   expectedChecksum: number,
 *   targetSampleMs: number,
 *   maxBatchSize: number,
 *   context: string,
 * }} options
 * @returns {{ batchSize: number, elapsedMs: number, checksum: number }}
 */
export function calibrateBatchSize(runBatch, options) {
  const targetSampleMs = positiveFiniteOption(
    options.targetSampleMs,
    'targetSampleMs',
  );
  const maxBatchSize = positiveIntegerOption(
    options.maxBatchSize,
    'maxBatchSize',
  );
  const probeFloorMs = measurableProbeFloorMs(targetSampleMs);
  let probeCount = 1;
  let probe = checkedBatchResult(
    runBatch(probeCount),
    options.expectedChecksum,
    options.context,
  );

  while (probe.elapsedMs < probeFloorMs && probeCount < maxBatchSize) {
    probeCount = Math.min(maxBatchSize, probeCount * 2);
    probe = checkedBatchResult(
      runBatch(probeCount),
      options.expectedChecksum,
      options.context,
    );
  }

  if (probe.elapsedMs < probeFloorMs) {
    return Object.freeze({
      batchSize: probeCount,
      elapsedMs: probe.elapsedMs,
      checksum: probe.checksum,
    });
  }

  const batchSize = clampBatchSize(
    Math.max(
      probeCount,
      Math.ceil(targetSampleMs / (probe.elapsedMs / probeCount)),
    ),
    maxBatchSize,
  );
  const confirmed = checkedBatchResult(
    runBatch(batchSize),
    options.expectedChecksum,
    options.context,
  );

  return Object.freeze({
    batchSize,
    elapsedMs: confirmed.elapsedMs,
    checksum: confirmed.checksum,
  });
}

/**
 * @param {number} value
 * @param {number} maxBatchSize
 * @returns {number}
 */
function clampBatchSize(value, maxBatchSize) {
  if (value < 1) {
    return 1;
  }

  if (value > maxBatchSize) {
    return maxBatchSize;
  }

  return value;
}

/**
 * @param {{ elapsedMs: number, checksum: number }} result
 * @param {number} expectedChecksum
 * @param {string} context
 * @returns {{ elapsedMs: number, checksum: number }}
 */
function checkedBatchResult(result, expectedChecksum, context) {
  if (!Number.isFinite(result.elapsedMs) || result.elapsedMs <= 0) {
    throw new RangeError(
      `${context} elapsedMs must be a positive finite number`,
    );
  }

  if (result.checksum !== expectedChecksum) {
    throw new Error(
      `${context} checksum mismatch: expected ${expectedChecksum}, got ${result.checksum}`,
    );
  }

  return result;
}

/**
 * Treat a probe as measurable once it has accumulated a meaningful fraction of
 * the requested target; anything smaller can still be dominated by a coarse
 * clock's epsilon-sized positive delta.
 *
 * @param {number} targetSampleMs
 * @returns {number}
 */
function measurableProbeFloorMs(targetSampleMs) {
  return targetSampleMs / 8;
}

/**
 * @param {number} value
 * @param {string} name
 * @returns {number}
 */
function positiveFiniteOption(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }

  return value;
}

/**
 * @param {number} value
 * @param {string} name
 * @returns {number}
 */
function positiveIntegerOption(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }

  return value;
}
