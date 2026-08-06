import { charCodeOfCodeUnit, codeUnitsBetween } from '../runtime/code-units.js';
import { spaceSeparatorRanges } from './unicode-case-data.js';

/**
 * The engine-side implementations of the ES5 String methods that search or
 * compare a string without a pattern: `indexOf`, `lastIndexOf`,
 * `localeCompare`, and `trim`.
 *
 * Everything here works on code units read by index, exactly like
 * `runtime/code-units.js` — no host `String.prototype.indexOf`,
 * `lastIndexOf`, `localeCompare`, or `trim` is involved, because those are
 * precisely the operations being defined. `test/node/repository-invariants.test.js`
 * fails if that boundary erodes.
 */

/**
 * ES5 7.2 `WhiteSpace` minus the Zs category: TAB, VT, FF, and BOM. (SP and
 * NBSP are Zs, so they arrive through `SPACE_SEPARATORS` below.)
 */
const EXPLICIT_WHITESPACE = [0x0009, 0x000b, 0x000c, 0xfeff];

/** ES5 7.3 `LineTerminator`: LF, CR, LS, and PS. */
const LINE_TERMINATORS = [0x000a, 0x000d, 0x2028, 0x2029];

/**
 * The "any other Unicode space separator (category Zs)" clause of ES5 7.2,
 * expanded from the pinned Unicode version's own data rather than from a
 * hand-written list, so it moves with the pin and never silently disagrees
 * with the case tables. Note U+180E is *not* here: it left Zs in Unicode 6.3
 * and is Cf in the pinned version, so `trim` must leave it alone.
 */
const SPACE_SEPARATORS = expandRanges(spaceSeparatorRanges);

/** @type {Set<number>} */
const WHITESPACE = new Set([
  ...EXPLICIT_WHITESPACE,
  ...LINE_TERMINATORS,
  ...SPACE_SEPARATORS,
]);

/**
 * @param {readonly number[]} ranges Flat `start, end` pairs.
 * @returns {number[]}
 */
function expandRanges(ranges) {
  /** @type {number[]} */
  const values = [];

  for (let index = 0; index < ranges.length; index += 2) {
    for (let code = ranges[index]; code <= ranges[index + 1]; code += 1) {
      values.push(code);
    }
  }

  return values;
}

/**
 * @param {string} value
 * @param {number} index
 * @returns {boolean}
 */
function isWhitespaceAt(value, index) {
  return WHITESPACE.has(charCodeOfCodeUnit(value[index]));
}

/**
 * Whether `search` occurs in `value` starting exactly at `position`.
 *
 * @param {string} value
 * @param {string} search
 * @param {number} position
 * @returns {boolean}
 */
function matchesAt(value, search, position) {
  for (let offset = 0; offset < search.length; offset += 1) {
    if (value[position + offset] !== search[offset]) {
      return false;
    }
  }

  return true;
}

/**
 * ES5 15.5.4.7 step 8: the smallest `k` not smaller than `start` at which
 * `search` occurs, or `-1`. An empty `search` therefore matches at `start`
 * itself (once `start` has been clamped into `[0, length]` by the caller).
 *
 * @param {string} value
 * @param {string} search
 * @param {number} start An integer in `[0, value.length]`.
 * @returns {number}
 */
export function stringIndexOf(value, search, start) {
  const last = value.length - search.length;

  for (let position = start; position <= last; position += 1) {
    if (matchesAt(value, search, position)) {
      return position;
    }
  }

  return -1;
}

/**
 * ES5 15.5.4.8 step 8: the largest `k` not larger than `start` at which
 * `search` occurs *and still fits inside* `value`, or `-1`.
 *
 * @param {string} value
 * @param {string} search
 * @param {number} start An integer in `[0, value.length]`.
 * @returns {number}
 */
export function stringLastIndexOf(value, search, start) {
  const first = Math.min(start, value.length - search.length);

  for (let position = first; position >= 0; position -= 1) {
    if (matchesAt(value, search, position)) {
      return position;
    }
  }

  return -1;
}

/**
 * The engine's locale-independent string ordering, used by
 * `String.prototype.localeCompare` (ES5 15.5.4.9, whose ordering is
 * implementation-defined but must be a *consistent* comparison function).
 *
 * The definition chosen here is plain code-unit lexicographic order — the
 * same order ES5 11.8.5 gives the relational operators — computed from code
 * unit numbers this engine derives itself. It is total, antisymmetric, and
 * transitive by construction, and it cannot vary with a host locale, an ICU
 * build, or an environment variable.
 *
 * @param {string} left
 * @param {string} right
 * @returns {-1 | 0 | 1}
 */
export function compareCodeUnits(left, right) {
  const shared = Math.min(left.length, right.length);

  for (let index = 0; index < shared; index += 1) {
    const leftCode = charCodeOfCodeUnit(left[index]);
    const rightCode = charCodeOfCodeUnit(right[index]);

    if (leftCode !== rightCode) {
      return leftCode < rightCode ? -1 : 1;
    }
  }

  if (left.length === right.length) {
    return 0;
  }

  return left.length < right.length ? -1 : 1;
}

/**
 * ES5 15.5.4.20: removes the longest prefix and suffix made only of
 * `StrWhiteSpaceChar`s (the union of 7.2 `WhiteSpace` and 7.3
 * `LineTerminator`).
 *
 * @param {string} value
 * @returns {string}
 */
export function trimString(value) {
  let start = 0;
  let end = value.length;

  while (start < end && isWhitespaceAt(value, start)) {
    start += 1;
  }

  while (end > start && isWhitespaceAt(value, end - 1)) {
    end -= 1;
  }

  return codeUnitsBetween(value, start, end);
}
