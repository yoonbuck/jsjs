import { EngineArray } from '../runtime/array-object.js';
import { toBoolean, toInteger, toString } from '../runtime/conversion.js';
import { codeUnitsBetween } from '../runtime/code-units.js';
import { regExpExec } from './regexp.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 * @typedef {import('../runtime/regexp-object.js').EngineRegExp} EngineRegExp
 */

/**
 * The RegExp-driven half of ES5's `String.prototype` pattern methods:
 * `match` (15.5.4.10), `replace` (15.5.4.11's RegExp branch), `search`
 * (15.5.4.12), and `split` (15.5.4.14's RegExp branch). `string-pattern.js`
 * keeps the literal, string-separator algorithms ES5 still specifies without
 * a RegExp (`replace`/`split` with a String argument); `builtins/
 * primitive-wrappers.js` decides, per method and per argument, which half to
 * call, and owns argument coercion — every function here already receives
 * an `EngineRegExp` and the already-`ToString`ed subject string.
 *
 * `match` and `replace` are specified in terms of `RegExp.prototype.exec`
 * (`regexp.js`'s `regExpExec`, which alone reads and updates `lastIndex`),
 * so `matchWithRegExp` and `replaceWithRegExp` both call it and share its
 * global-flag/zero-width-match/`lastIndex`-bump loop (ES5 15.5.4.10 steps
 * 4-10, reused verbatim by 15.5.4.11's "in the same manner as ... match").
 * `search` and `split` explicitly ignore `lastIndex` and `global` and never
 * write `lastIndex` ("the lastIndex and global properties of regexp are
 * ignored" -- 15.5.4.12; 15.5.4.14.1's SplitMatch is defined directly in
 * terms of `[[Match]]`), so `searchWithRegExp` and `splitWithRegExp` call
 * `EngineRegExp.matchAt` (`[[Match]]`) directly instead.
 */

/**
 * ES5 15.5.4.10 steps 4-10. A non-global `rx` reduces to exactly one
 * `regExpExec` call -- its result (the exec-shaped array, or `null`) is
 * `match`'s own result. A global `rx` resets `lastIndex` to 0 first, then
 * repeatedly calls `regExpExec` until it returns `null`, collecting each
 * match's whole matched string (never its captures, `index`, or `input`)
 * into a plain data-property array, and bumping `lastIndex` one code unit
 * past a match that left it unchanged so a zero-width pattern still visits
 * every position instead of looping forever. `null` when nothing matched at
 * all -- never an empty array.
 *
 * @param {Realm} realm
 * @param {EngineRegExp} rx
 * @param {string} S
 * @returns {EngineArray | null}
 */
export function matchWithRegExp(realm, rx, S) {
  const global = toBoolean(rx.get('global', realm));

  if (!global) {
    return regExpExec(realm, rx, S);
  }

  rx.put('lastIndex', 0, true, realm);

  const A = new EngineArray(realm.intrinsics.arrayPrototype);
  let previousLastIndex = 0;
  let n = 0;

  while (true) {
    const result = regExpExec(realm, rx, S);

    if (result === null) {
      break;
    }

    const thisIndex = toInteger(rx.get('lastIndex', realm), realm);

    if (thisIndex === previousLastIndex) {
      rx.put('lastIndex', thisIndex + 1, true, realm);
      previousLastIndex = thisIndex + 1;
    } else {
      previousLastIndex = thisIndex;
    }

    defineDataProperty(A, String(n), toString(result.get('0', realm), realm));
    n += 1;
  }

  return n === 0 ? null : A;
}

/**
 * ES5 15.5.4.11's RegExp branch: "the search ... is done in the same manner
 * as in `String.prototype.match`, including the update of `searchValue.
 * lastIndex`", so this shares `matchWithRegExp`'s exact global-flag/
 * zero-width-bump loop over `regExpExec`, but builds a replacement string
 * instead of a match array. For every match, in order, `computeReplacement`
 * is asked for the replacement text -- the caller owns the callable-versus-
 * literal choice (and, for a literal replacement, its `ToString`, which ES5
 * leaves implicit but every engine performs once, up front, before this
 * function is even called, so it happens whether or not `rx` matches
 * anything) -- and the result is spliced in between the text carried over
 * from the previous match's end and this match's start; the final tail
 * after the last match (or the whole string, when there was none) is
 * appended once the loop ends.
 *
 * @param {Realm} realm
 * @param {EngineRegExp} rx
 * @param {string} S
 * @param {(
 *   matched: string,
 *   position: number,
 *   captures: readonly (string | undefined)[],
 *   S: string,
 * ) => string} computeReplacement
 * @returns {string}
 */
export function replaceWithRegExp(realm, rx, S, computeReplacement) {
  const global = toBoolean(rx.get('global', realm));

  if (global) {
    rx.put('lastIndex', 0, true, realm);
  }

  let output = '';
  let tailStart = 0;
  let previousLastIndex = 0;

  while (true) {
    const match = regExpExec(realm, rx, S);

    if (match === null) {
      break;
    }

    if (global) {
      const thisIndex = toInteger(rx.get('lastIndex', realm), realm);

      if (thisIndex === previousLastIndex) {
        rx.put('lastIndex', thisIndex + 1, true, realm);
        previousLastIndex = thisIndex + 1;
      } else {
        previousLastIndex = thisIndex;
      }
    }

    const position = toInteger(match.get('index', realm), realm);
    const matched = toString(match.get('0', realm), realm);
    const captures = readCaptures(rx, match);

    output += codeUnitsBetween(S, tailStart, position);
    output += computeReplacement(matched, position, captures, S);
    tailStart = position + matched.length;

    if (!global) {
      break;
    }
  }

  output += codeUnitsBetween(S, tailStart, S.length);

  return output;
}

/**
 * ES5 15.5.4.12: "The `lastIndex` and `global` properties of `regexp` are
 * ignored ... the `lastIndex` property of `regexp` is left unchanged", so
 * this scans `EngineRegExp.matchAt` (`[[Match]]`) directly from position 0
 * rather than going through `regExpExec`.
 *
 * @param {EngineRegExp} rx
 * @param {string} S
 * @returns {number} The position of the first match, or `-1`.
 */
export function searchWithRegExp(rx, S) {
  for (let index = 0; index <= S.length; index += 1) {
    if (rx.matchAt(S, index) !== null) {
      return index;
    }
  }

  return -1;
}

/**
 * ES5 15.5.4.14 with a RegExp separator, using 15.5.4.14.1's `SplitMatch` as
 * `EngineRegExp.matchAt` (`[[Match]]`) directly -- `lastIndex` and `global`
 * are ignored here too, exactly as for `search`. An empty subject splits to
 * `[]` when the separator matches the empty string there (an empty match
 * would otherwise produce an infinite run of empty elements) and to `[S]`
 * otherwise. Otherwise the loop scans for the next position at or after `q`
 * where the separator matches without producing an empty element at the
 * current start, and interleaves each such match's captures in order
 * (`undefined` for one that did not participate) between it and the
 * unsplit-so-far text -- returning early the instant `lengthA` reaches
 * `limit`, mid-capture if need be.
 *
 * @param {Realm} realm
 * @param {EngineRegExp} rx
 * @param {string} S
 * @param {number} lim An already-`ToUint32`-converted length cap.
 * @returns {EngineArray}
 */
export function splitWithRegExp(realm, rx, S, lim) {
  const A = new EngineArray(realm.intrinsics.arrayPrototype);
  let lengthA = 0;

  /**
   * @param {string | undefined} element
   * @returns {void}
   */
  function push(element) {
    defineDataProperty(A, String(lengthA), element);
    lengthA += 1;
  }

  if (lim === 0) {
    return A;
  }

  const s = S.length;

  if (s === 0) {
    if (rx.matchAt(S, 0) !== null) {
      return A;
    }

    push(S);
    return A;
  }

  let p = 0;
  let q = p;

  while (q !== s) {
    const z = rx.matchAt(S, q);

    if (z === null) {
      q += 1;
      continue;
    }

    const e = z.endIndex;

    if (e === p) {
      q += 1;
      continue;
    }

    push(codeUnitsBetween(S, p, q));

    if (lengthA === lim) {
      return A;
    }

    p = e;

    for (let group = 0; group < z.captures.length; group += 1) {
      push(z.captures[group]);

      if (lengthA === lim) {
        return A;
      }
    }

    q = p;
  }

  push(codeUnitsBetween(S, p, s));

  return A;
}

/**
 * The `1`..`n` capture Strings (or `undefined` for one that did not
 * participate) already computed by `regExpExec` on `match`, read back off
 * its result array rather than re-derived.
 *
 * @param {EngineRegExp} rx
 * @param {EngineArray} match
 * @returns {(string | undefined)[]}
 */
function readCaptures(rx, match) {
  const n = rx.capturingGroups;
  /** @type {(string | undefined)[]} */
  const captures = [];

  for (let group = 1; group <= n; group += 1) {
    captures.push(/** @type {string | undefined} */ (match.get(String(group))));
  }

  return captures;
}

/**
 * @param {EngineArray} target
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
