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
 * Linearly interpolated quantile of an unsorted sample.
 *
 * Bootstrap intervals need a continuous quantile: the nearest-rank `p95` used
 * for per-sample summaries would quantize a 20,000-draw distribution to steps
 * far coarser than the effect sizes being resolved.
 *
 * @param {readonly number[]} values
 * @param {number} probability
 * @returns {number}
 */
export function quantile(values, probability) {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError('Expected a probability in [0, 1]');
  }

  const sorted = sortAscending(numericValuesOnly(values));
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * Deterministic 32-bit PRNG (mulberry32).
 *
 * Bootstrap intervals are evidence, so they must be reproducible from the
 * recorded seed alone: `Math.random` would make two analyses of the same
 * capture set disagree.
 *
 * @param {number} seed
 * @returns {() => number}
 */
export function createSeededRandom(seed) {
  if (!Number.isInteger(seed)) {
    throw new RangeError('Expected an integer seed');
  }

  let state = seed | 0;

  return function nextRandom() {
    state = (state + 0x6d2b79f5) | 0;

    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Exact two-sided sign-test p-value over nonzero paired deltas.
 *
 * The tail sums are exact integer binomial sums, so the returned p-value is a
 * rational multiple of a power of two rather than a normal approximation that
 * would drift at the small pair counts these comparisons run at.
 *
 * @param {number} positive
 * @param {number} negative
 * @returns {number}
 */
export function exactSignTestPValue(positive, negative) {
  nonNegativeIntegerOnly(positive);
  nonNegativeIntegerOnly(negative);

  const nonzero = positive + negative;

  if (nonzero === 0) {
    return 1;
  }

  const lowerTail = binomialTailSum(nonzero, 0, positive);
  const upperTail = binomialTailSum(nonzero, positive, nonzero);
  const smallerTail = lowerTail < upperTail ? lowerTail : upperTail;
  const probability = ratioToNumber(smallerTail, 1n << BigInt(nonzero));

  return Math.min(1, 2 * probability);
}

/**
 * The smallest number of nonzero paired deltas whose most extreme exact
 * two-sided sign test can still fall below `alpha`.
 *
 * @param {number} alpha
 * @returns {number}
 */
export function minimumNonzeroPairsForExactSignificance(alpha) {
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= 1) {
    throw new RangeError('Expected a significance level in (0, 1)');
  }

  for (let pairs = 1; pairs <= 1024; pairs += 1) {
    if (exactSignTestPValue(pairs, 0) < alpha) {
      return pairs;
    }
  }

  throw new RangeError('No attainable pair count for the requested alpha');
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
 * @param {number} value
 * @returns {void}
 */
function nonNegativeIntegerOnly(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError('Expected a non-negative integer count');
  }
}

/**
 * `sum(C(total, index))` for `index` in `[from, to]`, as an exact integer.
 *
 * @param {number} total
 * @param {number} from
 * @param {number} to
 * @returns {bigint}
 */
function binomialTailSum(total, from, to) {
  let coefficient = 1n;
  let sum = 0n;

  for (let index = 0; index <= total; index += 1) {
    if (index >= from && index <= to) {
      sum += coefficient;
    }

    coefficient = (coefficient * BigInt(total - index)) / BigInt(index + 1);
  }

  return sum;
}

/**
 * @param {bigint} numerator
 * @param {bigint} denominator
 * @returns {number}
 */
function ratioToNumber(numerator, denominator) {
  if (numerator === 0n) {
    return 0;
  }

  const exponent = bigintBitLength(numerator) - bigintBitLength(denominator);
  const shift = 52 - exponent;
  const scaledNumerator =
    shift >= 0 ? numerator << BigInt(shift) : numerator >> BigInt(-shift);
  const significand = Number(
    (scaledNumerator + denominator / 2n) / denominator,
  );

  return scaleByPowerOfTwo(significand, exponent - 52);
}

/**
 * @param {bigint} value
 * @returns {number}
 */
function bigintBitLength(value) {
  return value.toString(2).length;
}

/**
 * @param {number} value
 * @param {number} exponent
 * @returns {number}
 */
function scaleByPowerOfTwo(value, exponent) {
  const firstExponent =
    exponent < -1022 ? -1022 : exponent > 1023 ? 1023 : exponent;

  return value * 2 ** firstExponent * 2 ** (exponent - firstExponent);
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
  const mean =
    values.reduce((total, value) => total + value, 0) / values.length;

  if (mean <= 0) {
    throw new RangeError('Expected a positive mean');
  }

  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) /
    values.length;

  return Math.sqrt(variance) / mean;
}
