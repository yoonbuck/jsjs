/**
 * @param {readonly number[]} values
 * @returns {number}
 */
export function median(values) {
  return medianFromSorted(sortAscending(numericValuesOnly(values)));
}

/**
 * @param {readonly number[]} values
 * @returns {number}
 */
export function percentile95(values) {
  return percentile95FromSorted(sortAscending(numericValuesOnly(values)));
}

/**
 * @param {readonly number[]} values
 * @returns {number}
 */
export function coefficientOfVariation(values) {
  return coefficientOfVariationFromValues(numericValuesOnly(values));
}

/**
 * @param {readonly number[]} values
 * @returns {number}
 */
export function geometricMean(values) {
  const numericValues = numericValuesOnly(values, true);
  const total = numericValues.reduce((sum, value) => sum + Math.log(value), 0);
  return Math.exp(total / numericValues.length);
}

/**
 * @param {readonly number[]} values
 * @returns {{ median: number, p95: number, coefficientOfVariation: number }}
 */
export function summarizeSamples(values) {
  const numericValues = numericValuesOnly(values, true);
  const sorted = sortAscending(numericValues);

  return Object.freeze({
    median: medianFromSorted(sorted),
    p95: percentile95FromSorted(sorted),
    coefficientOfVariation: coefficientOfVariationFromValues(numericValues),
  });
}

/**
 * @param {readonly number[]} values
 * @param {boolean} [requirePositive]
 * @returns {number[]}
 */
function numericValuesOnly(values, requirePositive = false) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new RangeError('Expected at least one numeric value');
  }

  return values.map((value) => {
    if (!Number.isFinite(value)) {
      throw new RangeError('Expected finite numeric values');
    }

    if (requirePositive && value <= 0) {
      throw new RangeError('Expected positive numeric values');
    }

    return value;
  });
}

/**
 * @param {readonly number[]} values
 * @returns {number[]}
 */
function sortAscending(values) {
  return values.slice().sort((left, right) => left - right);
}

/**
 * @param {readonly number[]} values
 * @returns {number}
 */
function medianFromSorted(values) {
  const midpoint = Math.floor(values.length / 2);

  return values.length % 2 === 0
    ? (values[midpoint - 1] + values[midpoint]) / 2
    : values[midpoint];
}

/**
 * @param {readonly number[]} values
 * @returns {number}
 */
function percentile95FromSorted(values) {
  return values[Math.ceil(values.length * 0.95) - 1];
}

/**
 * @param {readonly number[]} values
 * @returns {number}
 */
function coefficientOfVariationFromValues(values) {
  const mean = values.reduce((total, value) => total + value, 0) / values.length;

  if (mean <= 0) {
    throw new RangeError('Expected a positive mean');
  }

  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) /
    values.length;

  return Math.sqrt(variance) / mean;
}
