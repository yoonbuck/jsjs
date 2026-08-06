import { EngineArray } from '../runtime/array-object.js';
import { charCodeOfCodeUnit, codeUnitsBetween } from '../runtime/code-units.js';
import { stringIndexOf } from './string-search.js';

/**
 * @typedef {import('../runtime/object.js').EngineObject} EngineObject
 */

/**
 * The string-separator half of ES5's `String.prototype` pattern methods:
 * `match`, `replace`, `search`, and `split`.
 *
 * `replace` and `split` are each fully specified with a *string* pattern —
 * ES5 15.5.4.11's non-`RegExp` branch and 15.5.4.14 with a String
 * `separator` both search for `ToString(searchValue)` literally, never
 * building a `RegExp` from it — so that literal-search algorithm
 * (`replaceFirst`, `splitOnString`) lives here in full, alongside
 * `expandReplacement`, ES5 Table 22's replacement-token expansion shared by
 * both the literal branch (with an empty `captures` array) and
 * `string-regexp.js`'s RegExp-driven `replaceWithRegExp`.
 *
 * `match` and `search` have no such literal branch: ES5 15.5.4.10 and
 * 15.5.4.12 always coerce their pattern into a `RegExp` first (`new
 * RegExp(pattern)` when it is not one already), so their algorithms —
 * `matchWithRegExp`, `searchWithRegExp` — live in `string-regexp.js` next to
 * `replaceWithRegExp` and `splitWithRegExp`, the RegExp-driven half of
 * `replace` and `split`. `builtins/primitive-wrappers.js` is what decides,
 * per method, which half to call.
 *
 * As everywhere else in the String family, the searching itself is done on
 * code units read by index (`string-search.js`, `runtime/code-units.js`); no
 * host `String.prototype.match`/`replace`/`search`/`split` is involved.
 */

/**
 * ES5 15.5.4.11's non-RegExp branch. `matched` is the search string itself,
 * so the substitution below only needs the match position.
 *
 * @param {string} value
 * @param {string} search
 * @param {(matched: string, position: number, whole: string) => string} replacer
 *   Produces the replacement text for the single match, already converted to
 *   a String by the caller (which owns the functional-versus-literal choice
 *   and its coercion order).
 * @returns {string}
 */
export function replaceFirst(value, search, replacer) {
  const position = stringIndexOf(value, search, 0);

  if (position < 0) {
    return value;
  }

  return (
    codeUnitsBetween(value, 0, position) +
    replacer(search, position, value) +
    codeUnitsBetween(value, position + search.length, value.length)
  );
}

/**
 * Expands the ES5 Table 22 replacement tokens: `$$`, `$&`, `` $` ``, `$'`,
 * and now `$1`-`$9`/`$01`-`$99`, shared by both pattern halves — the
 * string-separator branch above calls this with an empty `captures`, and
 * `string-regexp.js`'s `replaceWithRegExp` calls it with the match's actual
 * captures.
 *
 * A one- or two-digit `$n`/`$nn` names a 1-based capture index. Shipping
 * engines prefer the two-digit reading when it names a capture that exists
 * (`nn` between 1 and `captures.length`), fall back to the one-digit reading
 * on the same condition, and otherwise leave the `$` and its digits as
 * literal text — Table 22 leaves a capture index above the group count
 * implementation-defined, and that fallback is also what keeps the
 * string-pattern branch's `captures.length === 0` case behaving exactly as
 * it always has: `$1` stays literal text because no capture index is ever
 * in range. A capture that did not participate in the match (`undefined`)
 * expands to the empty string. Any other `$` sequence is literal text.
 *
 * @param {string} replacement
 * @param {string} matched
 * @param {number} position
 * @param {string} value
 * @param {readonly (string | undefined)[]} captures
 * @returns {string}
 */
export function expandReplacement(
  replacement,
  matched,
  position,
  value,
  captures,
) {
  let result = '';

  for (let index = 0; index < replacement.length; index += 1) {
    const unit = replacement[index];

    if (unit !== '$' || index + 1 >= replacement.length) {
      result += unit;
      continue;
    }

    const next = replacement[index + 1];

    if (next === '$') {
      result += '$';
    } else if (next === '&') {
      result += matched;
    } else if (next === '`') {
      result += codeUnitsBetween(value, 0, position);
    } else if (next === "'") {
      result += codeUnitsBetween(
        value,
        position + matched.length,
        value.length,
      );
    } else if (isAsciiDigit(next)) {
      const oneDigitValue = digitValue(next);
      const secondDigit = replacement[index + 2];
      const twoDigitValue = isAsciiDigit(secondDigit)
        ? oneDigitValue * 10 + digitValue(secondDigit)
        : -1;

      if (twoDigitValue >= 1 && twoDigitValue <= captures.length) {
        result += captures[twoDigitValue - 1] ?? '';
        // The shared `index += 1` below accounts for one digit; a
        // two-digit capture index consumes a second.
        index += 1;
      } else if (oneDigitValue >= 1 && oneDigitValue <= captures.length) {
        result += captures[oneDigitValue - 1] ?? '';
      } else {
        // Neither reading names a capture that exists: the `$` stands for
        // itself and its digits are reconsidered as literal text on the
        // following iterations.
        result += unit;
        continue;
      }
    } else {
      // Not a token: the `$` stands for itself and the next code unit is
      // reconsidered from the top on the following iteration.
      result += unit;
      continue;
    }

    index += 1;
  }

  return result;
}

/**
 * @param {string | undefined} unit
 * @returns {boolean}
 */
function isAsciiDigit(unit) {
  return unit !== undefined && unit >= '0' && unit <= '9';
}

/**
 * @param {string} unit A single ASCII digit code unit.
 * @returns {number}
 */
function digitValue(unit) {
  return charCodeOfCodeUnit(unit) - charCodeOfCodeUnit('0');
}

/**
 * ES5 15.5.4.14 steps 9-14 with a string separator, including its
 * `SplitMatch` (15.5.4.14.1) as a literal code-unit comparison.
 *
 * @param {import('../runtime/realm.js').Realm} realm
 * @param {string} value
 * @param {string | undefined} separator An undefined separator is step 10's
 *   "the whole string, unsplit" case, never a search for `"undefined"`.
 * @param {number} limit An already-`ToUint32`-converted length cap.
 * @returns {EngineArray}
 */
export function splitOnString(realm, value, separator, limit) {
  const result = new EngineArray(
    /** @type {any} */ (realm.intrinsics).arrayPrototype,
  );
  let length = 0;

  /**
   * @param {string} element
   * @returns {void}
   */
  function push(element) {
    defineDataProperty(result, String(length), element);
    length += 1;
  }

  if (limit === 0) {
    return result;
  }

  if (separator === undefined) {
    push(value);

    return result;
  }

  if (value.length === 0) {
    // Step 11: an empty receiver splits into nothing at all when the
    // separator matches the empty string, and into `[""]` when it does not.
    if (separator.length > 0) {
      push(value);
    }

    return result;
  }

  let start = 0;
  let position = 0;

  while (position < value.length) {
    const end = splitMatch(value, position, separator);

    // Step 13.b/13.c.i: no match, or a match that would produce an empty
    // element at the current start, just advances one code unit.
    if (end < 0 || end === start) {
      position += 1;
      continue;
    }

    push(codeUnitsBetween(value, start, position));

    if (length === limit) {
      return result;
    }

    start = end;
    position = end;
  }

  push(codeUnitsBetween(value, start, value.length));

  return result;
}

/**
 * ES5 15.5.4.14.1 `SplitMatch` for a string matcher: the index just past a
 * match of `separator` starting exactly at `position`, or `-1` for failure.
 *
 * @param {string} value
 * @param {number} position
 * @param {string} separator
 * @returns {number}
 */
function splitMatch(value, position, separator) {
  if (position + separator.length > value.length) {
    return -1;
  }

  for (let offset = 0; offset < separator.length; offset += 1) {
    if (value[position + offset] !== separator[offset]) {
      return -1;
    }
  }

  return position + separator.length;
}

/**
 * @param {EngineObject} target
 * @param {string} name
 * @param {unknown} value
 * @returns {void}
 */
function defineDataProperty(target, name, value) {
  target.defineOwnProperty(name, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}
