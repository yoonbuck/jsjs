/**
 * The engine's UTF-16 code-unit primitives.
 *
 * Engine strings are host primitive strings, so reading a code unit *by
 * index* (`value[index]`) and reading `length` are representation glue, the
 * same allowance `runtime/primitive-object.js` documents for the boxed
 * String index-property model. Turning a code unit into its numeric value
 * and back is not: doing that with host `String.prototype.charCodeAt` would
 * hand the guest-visible semantics of `String.prototype.charCodeAt` straight
 * to the host, which this engine does not do for any built-in.
 *
 * There is exactly one host primitive here that has no pure-JS equivalent:
 * building a *single* code unit from a number (`String.fromCharCode`). It is
 * isolated in `codeUnitFromCharCode` below, and it is the only host String
 * built-in the whole String family touches; `test/node/repository-invariants.test.js`
 * fails if a second one appears, or if it appears outside this module.
 * Everything else -- including the number a code unit denotes -- is derived
 * from that one primitive by this module's own algorithm.
 */

/** The number of distinct UTF-16 code units: `2^16`. */
const CODE_UNIT_COUNT = 65536;

/**
 * Caches the code units already resolved by `charCodeOfCodeUnit`. The key
 * space is the 65536 single-code-unit strings, so the cache is bounded by
 * construction and fills lazily -- only units a guest program actually asks
 * about are ever entered.
 *
 * @type {Map<string, number>}
 */
const codeByUnit = new Map();

/**
 * The one host primitive this engine keeps: a number (already reduced by the
 * caller's `ToUint16`) to the single UTF-16 code unit it denotes.
 *
 * The range guard is what keeps the host from silently doing the engine's
 * work: host `String.fromCharCode` re-applies its own ToUint16, so without
 * it a caller that forgot `toUint16` (or reduced incorrectly) would still
 * produce spec-correct output and no test could tell. The guard is an
 * internal-invariant violation, not a guest-observable error, so it throws a
 * host `RangeError` like the other engine invariants in `src/`.
 *
 * @param {number} code An integer in `[0, 2^16)`, i.e. a ToUint16 result.
 * @returns {string} A string of exactly one code unit.
 */
export function codeUnitFromCharCode(code) {
  if (
    !Number.isInteger(code) ||
    code < 0 ||
    code >= CODE_UNIT_COUNT ||
    Object.is(code, -0)
  ) {
    throw new RangeError(
      'codeUnitFromCharCode requires a ToUint16 result: an integer in [0, 65536), never -0',
    );
  }

  return String.fromCharCode(code);
}

/**
 * The inverse: the numeric value of a single UTF-16 code unit, computed by
 * the engine rather than read out of host `String.prototype.charCodeAt`.
 *
 * Single-code-unit strings sort by code-unit value under the language's own
 * relational comparison (ES5 11.8.5 compares strings code unit by code
 * unit), so the code of `unit` is the smallest `code` whose
 * `codeUnitFromCharCode(code)` is not less than `unit`. A binary search over
 * `[0, 2^16)` finds it in exactly 16 comparisons -- bounded, deterministic,
 * allocation-free, and identical on every host -- and the result is memoized
 * so repeated reads of the same unit cost one map lookup.
 *
 * @param {string} unit A string of exactly one code unit.
 * @returns {number} An integer in `[0, 2^16)`.
 */
export function charCodeOfCodeUnit(unit) {
  if (typeof unit !== 'string' || unit.length !== 1) {
    throw new RangeError(
      'charCodeOfCodeUnit requires a string of exactly one code unit',
    );
  }

  const cached = codeByUnit.get(unit);

  if (cached !== undefined) {
    return cached;
  }

  let low = 0;
  let high = CODE_UNIT_COUNT - 1;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);

    if (unit <= codeUnitFromCharCode(middle)) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }

  codeByUnit.set(unit, low);

  return low;
}
