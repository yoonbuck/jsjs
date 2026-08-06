import { EngineObject } from './object.js';

/**
 * @typedef {import('./regexp-syntax.js').FlagSet} FlagSet
 * @typedef {import('./regexp-compat.js').CompiledPattern} CompiledPattern
 * @typedef {import('./regexp-compat.js').MatchResult} MatchResult
 */

/**
 * The guest-visible representation of a RegExp object (ECMA-262 5.1
 * §15.10.6/§15.10.7). `[[Class]]` is `"RegExp"`.
 *
 * `patternSource` (the original pattern text `P`), `flags`, and `compiled`
 * (the host-backed matcher `regexp-compat.js` produced for that
 * `source`/`flags` pair) are engine-internal host fields, not guest
 * properties — the same allowance `EnginePrimitiveObject.primitiveValue`
 * uses in `primitive-object.js`. `builtins/regexp.js`'s
 * `createRegExpFromPattern` is the only place that constructs one from
 * scratch; Task 2's `exec`/`test` will read `compiled`/`flags` through
 * `matchAt`/`capturingGroups` and this class's fields, and Task 2's literals
 * and `toString` will read `patternSource`/`flags` directly.
 */
export class EngineRegExp extends EngineObject {
  /**
   * @param {EngineObject | null} prototype
   * @param {string} patternSource The original pattern text P that `compiled` was built from.
   * @param {FlagSet} flags
   * @param {CompiledPattern} compiled
   */
  constructor(prototype, patternSource, flags, compiled) {
    super(prototype, 'RegExp');

    /** @type {string} */
    this.patternSource = patternSource;
    /** @type {FlagSet} */
    this.flags = flags;
    /** @type {CompiledPattern} */
    this.compiled = compiled;
    /** @type {number} */
    this.capturingGroups = compiled.capturingGroups;

    // ES5 15.10.7: own, non-writable, non-enumerable, non-configurable
    // data properties for source/global/ignoreCase/multiline, then a
    // writable (but still non-enumerable, non-configurable) `lastIndex`.
    this.defineOwnProperty('source', {
      value: escapePatternSource(patternSource),
      writable: false,
      enumerable: false,
      configurable: false,
    });
    this.defineOwnProperty('global', {
      value: flags.global,
      writable: false,
      enumerable: false,
      configurable: false,
    });
    this.defineOwnProperty('ignoreCase', {
      value: flags.ignoreCase,
      writable: false,
      enumerable: false,
      configurable: false,
    });
    this.defineOwnProperty('multiline', {
      value: flags.multiline,
      writable: false,
      enumerable: false,
      configurable: false,
    });
    this.defineOwnProperty('lastIndex', {
      value: 0,
      writable: true,
      enumerable: false,
      configurable: false,
    });
  }

  /**
   * Delegates to the compiled matcher's `[[Match]]`-shaped `matchAt` (ES5
   * 15.10.2.1): attempts a match starting exactly at `index` in `input`,
   * never scanning forward. Task 2's `exec`/`test` are the guest-visible
   * callers.
   *
   * @param {string} input
   * @param {number} index
   * @returns {MatchResult | null}
   */
  matchAt(input, index) {
    return this.compiled.matchAt(input, index);
  }
}

/**
 * Raw line/paragraph separators ES5 15.10.4.1 step 10 escapes in `source`.
 * @type {{ [char: string]: string }}
 */
const LINE_TERMINATOR_ESCAPES = {
  '\n': '\\n',
  '\r': '\\r',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/**
 * Implements ES5 15.10.4.1 step 10: "a String in the form of a Pattern
 * equivalent to P, in which certain characters are escaped", the algorithm
 * behind `RegExp.prototype.source` (and, via that, `toString`'s literal
 * round-trip in Task 2). An empty pattern becomes `'(?:)'`. Otherwise, a
 * single left-to-right scan tracks two bits of state: whether the previous
 * character was an (unescaped) backslash — in which case the current
 * character is already part of an escape sequence and is copied through
 * verbatim rather than re-escaped — and whether the scan is currently inside
 * a `[`…`]` character class, since `/` (and only `/`) escapes differently
 * there. Every raw U+000A/U+000D/U+2028/U+2029 becomes `\n`/`\r`/`\u2028`/
 * `\u2029` unconditionally, unescaped-and-outside-a-class `/` becomes `\/`,
 * and everything else is copied through unchanged. The result is built by
 * `+=` concatenation only, never `.replace()`.
 *
 * @param {string} patternSource
 * @returns {string}
 */
export function escapePatternSource(patternSource) {
  if (patternSource === '') {
    return '(?:)';
  }

  let result = '';
  let inClass = false;
  let index = 0;

  while (index < patternSource.length) {
    const unit = patternSource[index];

    if (unit === '\\') {
      // An escape sequence: copy the backslash and whatever it escapes
      // through unchanged, so an already-escaped `/` is never re-escaped.
      const next = patternSource[index + 1];
      result += next === undefined ? unit : unit + next;
      index += next === undefined ? 1 : 2;
      continue;
    }

    if (unit === '[') {
      inClass = true;
      result += unit;
      index += 1;
      continue;
    }

    if (unit === ']') {
      inClass = false;
      result += unit;
      index += 1;
      continue;
    }

    if (unit === '/' && !inClass) {
      result += '\\/';
      index += 1;
      continue;
    }

    const lineTerminatorEscape = LINE_TERMINATOR_ESCAPES[unit];

    result += lineTerminatorEscape === undefined ? unit : lineTerminatorEscape;
    index += 1;
  }

  return result;
}
