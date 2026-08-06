import { EngineArray } from '../runtime/array-object.js';
import { EngineObject } from '../runtime/object.js';
import { codeUnitsBetween } from '../runtime/code-units.js';
import { createUnsupportedOperationError } from '../runtime/errors.js';
import { stringIndexOf } from './string-search.js';

/**
 * The string-pattern half of ES5's `String.prototype` pattern methods:
 * `match`, `replace`, `search`, and `split`.
 *
 * `replace` and `split` are fully specified for a *string* pattern (ES5
 * 15.5.4.11 and 15.5.4.14 search for `ToString(searchValue)` literally), so
 * they are implemented here in full. `match` and `search` (15.5.4.10 and
 * 15.5.4.12) always build `new RegExp(pattern)` even from a string, and this
 * engine has no RegExp yet — no constructor, and regular expression literals
 * throw `UnsupportedNodeError`. The boundary drawn here is therefore:
 *
 *   - a pattern object whose `[[Class]]` is `"RegExp"` is refused by all four
 *     methods, loudly, with an `UnsupportedOperationError` — never quietly
 *     `ToString`ed into some other search;
 *   - a *string* pattern for `match`/`search` is answered only when it
 *     contains no RegExp syntax character. Such a pattern is a sequence of
 *     `PatternCharacter`s, which matches itself literally, so the literal
 *     search below returns exactly what `new RegExp(pattern)` would. Any
 *     other pattern needs a real RegExp engine and is refused the same way.
 *
 * Both refusals are engine-limitation errors rather than guest completions,
 * matching how the evaluator refuses a regular expression literal: a guest
 * `try`/`catch` cannot turn them into ordinary control flow and mistake them
 * for specified behaviour.
 *
 * As everywhere else in the String family, the searching itself is done on
 * code units read by index (`string-search.js`, `runtime/code-units.js`); no
 * host `String.prototype.match`/`replace`/`search`/`split` is involved.
 */

/**
 * `SyntaxCharacter` (ES5 15.10.1) — everything a `PatternCharacter` may not
 * be. A string pattern free of these characters is a literal.
 */
const REGEXP_SYNTAX_CHARACTERS = new Set([
  '^',
  '$',
  '\\',
  '.',
  '*',
  '+',
  '?',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '|',
]);

/**
 * Refuses a real RegExp pattern. Only the `[[Class]]` is consulted, exactly
 * as ES5 15.5.4.10-14 specify, so an ordinary object that merely carries
 * `source`/`global`/`exec` properties is *not* refused: it is a plain object
 * and its pattern is `ToString(value)`.
 *
 * @param {unknown} pattern
 * @param {string} methodName
 * @returns {void}
 */
export function rejectRegExpPattern(pattern, methodName) {
  if (pattern instanceof EngineObject && pattern.getClassName() === 'RegExp') {
    throw createUnsupportedOperationError(
      `String#${methodName} with a RegExp pattern`,
    );
  }
}

/**
 * Refuses a string pattern that only a real RegExp engine could answer.
 *
 * @param {string} pattern
 * @param {string} methodName
 * @returns {string}
 */
export function requireLiteralPattern(pattern, methodName) {
  for (let index = 0; index < pattern.length; index += 1) {
    if (REGEXP_SYNTAX_CHARACTERS.has(pattern[index])) {
      throw createUnsupportedOperationError(
        `String#${methodName} with a RegExp pattern containing ${pattern[index]}`,
      );
    }
  }

  return pattern;
}

/**
 * ES5 15.5.4.10 for a literal pattern: the result has the shape
 * `RegExp.prototype.exec` gives a non-global match (15.10.6.2 steps 15-19) —
 * element 0 is the matched substring, plus `index` and `input` — or `null`.
 *
 * @param {import('../runtime/realm.js').Realm} realm
 * @param {string} value
 * @param {string} pattern
 * @returns {EngineArray | null}
 */
export function matchLiteralPattern(realm, value, pattern) {
  const index = stringIndexOf(value, pattern, 0);

  if (index < 0) {
    return null;
  }

  const result = new EngineArray(
    /** @type {any} */ (realm.intrinsics).arrayPrototype,
  );

  defineDataProperty(result, '0', pattern);
  defineDataProperty(result, 'index', index);
  defineDataProperty(result, 'input', value);

  return result;
}

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
 * Expands the ES5 Table 22 replacement tokens for a *string* pattern: `$$`,
 * `$&`, `` $` ``, and `$'`. `$1`-`$99` are not expanded, because a string
 * pattern has no captures at all and Table 22 leaves that case
 * implementation-defined; the token text is kept, which is what shipping
 * engines do. Any other `$` sequence is literal text.
 *
 * @param {string} replacement
 * @param {string} matched
 * @param {number} position
 * @param {string} value
 * @returns {string}
 */
export function expandReplacement(replacement, matched, position, value) {
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
