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
  const initial = checkedBatchResult(
    runBatch(1),
    options.expectedChecksum,
    options.context,
  );
  const batchSize = clampBatchSize(
    Math.ceil(options.targetSampleMs / initial.elapsedMs),
    options.maxBatchSize,
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
    throw new RangeError(`${context} elapsedMs must be a positive finite number`);
  }

  if (result.checksum !== expectedChecksum) {
    throw new Error(
      `${context} checksum mismatch: expected ${expectedChecksum}, got ${result.checksum}`,
    );
  }

  return result;
}
