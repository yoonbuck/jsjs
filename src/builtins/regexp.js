import { EngineObject } from '../runtime/object.js';
import { EngineRegExp } from '../runtime/regexp-object.js';
import { compilePattern } from '../runtime/regexp-compat.js';
import { parseFlags, RegExpSyntaxError } from '../runtime/regexp-syntax.js';
import { toString } from '../runtime/conversion.js';
import { GuestErrorSignal } from '../runtime/completion.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 *
 * @typedef {{
 *   regExpConstructor: import('./shared.js').NativeFunction,
 * }} RegExpIntrinsics
 */

/**
 * Builds `%RegExp%` and `%RegExp.prototype%` (ECMA-262 5.1 §15.10.3–§15.10.7)
 * following the shape of `builtins/primitive-wrappers.js` and
 * `builtins/array.js`: a `createRegExpIntrinsics(realm)` that builds the
 * intrinsics and an `installRegExpConstructor` that publishes them on the
 * global object, called from `runtime/realm.js` in that order.
 *
 * Unlike every other built-in prototype in this engine, `%RegExp.prototype%`
 * (15.10.6) is itself a fully-formed instance of the type it is the
 * prototype for: an `EngineRegExp` with the empty pattern and no flags,
 * `[[Prototype]]` `%Object.prototype%`, so `RegExp.prototype.source` is
 * `'(?:)'` and `global`/`ignoreCase`/`multiline` are all `false`.
 *
 * @param {Realm} realm
 * @returns {RegExpIntrinsics}
 */
export function createRegExpIntrinsics(realm) {
  const { objectPrototype } = realm.intrinsics;

  const regExpPrototype = new EngineRegExp(
    objectPrototype,
    '',
    { global: false, ignoreCase: false, multiline: false },
    compilePattern('', { global: false, ignoreCase: false, multiline: false }),
  );

  const regExpConstructor = realm.createNativeFunction({
    name: 'RegExp',
    length: 2,
    prototype: regExpPrototype,
    call(_thisValue, args) {
      // ES5 15.10.3.1: identity return is the *only* way call diverges from
      // construct; every other case — including a RegExp `pattern` with
      // `flags` defined, which must still throw — "behaves exactly as
      // construct".
      const [pattern, flags] = args;

      if (isRegExpObject(pattern) && flags === undefined) {
        return pattern;
      }

      return constructRegExp(regExpPrototype, pattern, flags);
    },
    construct(args) {
      const [pattern, flags] = args;

      return constructRegExp(regExpPrototype, pattern, flags);
    },
  });

  regExpPrototype.defineOwnProperty('constructor', {
    value: regExpConstructor,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  return { regExpConstructor };
}

/**
 * @param {EngineObject} globalObject
 * @param {RegExpIntrinsics} intrinsics
 * @returns {void}
 */
export function installRegExpConstructor(globalObject, intrinsics) {
  globalObject.defineOwnProperty('RegExp', {
    value: intrinsics.regExpConstructor,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * The shared factory ES5 15.10.4.1's `new RegExp(pattern, flags)` construct
 * path and 15.10.3.1's call path (for a non-RegExp `pattern`, or `flags !==
 * undefined`) both reduce to, and that Task 2's regular expression literals
 * and Task 3's String methods (`match`/`replace`/`search`/`split`) will also
 * call directly with an already-known pattern/flags pair. Converts a bad
 * pattern or bad flags into a **guest** `SyntaxError` (`GuestErrorSignal`,
 * converted to a real guest throw by `builtins/shared.js`'s
 * `runNativeBody`) — never a host exception — since malformed regular
 * expression text is exactly as guest-recoverable as any other `SyntaxError`
 * in this engine.
 *
 * @param {Realm} realm
 * @param {string} patternSource
 * @param {string} flagsText
 * @returns {EngineRegExp}
 */
export function createRegExpFromPattern(realm, patternSource, flagsText) {
  // `realm.intrinsics`'s static type only carries the fundamental and error
  // intrinsics (see `runtime/realm.js`); every constructor `Object.assign`ed
  // in afterwards, `regExpConstructor` included, is only reachable through
  // this same any-cast `builtins/errors.js` already uses for the same
  // reason.
  const intrinsics = /** @type {any} */ (realm.intrinsics);
  const regExpConstructor =
    /** @type {import('./shared.js').NativeFunction} */ (
      intrinsics.regExpConstructor
    );
  const regExpPrototype = /** @type {EngineObject} */ (
    regExpConstructor.get('prototype')
  );

  return buildRegExp(regExpPrototype, patternSource, flagsText);
}

/**
 * Implements the pattern/flags resolution ES5 15.10.4.1 (construct) and
 * 15.10.3.1's "otherwise, behave exactly as construct" fallback share: if
 * `pattern` is a RegExp object, `flags` must be `undefined` (else a guest
 * `TypeError`) and the new object copies that object's own pattern source
 * and flags; otherwise `pattern`/`flags` are ES5 15.10.4.1's `P`/`F`, coerced
 * with `ToString` in that order.
 *
 * @param {EngineObject} prototype
 * @param {unknown} pattern
 * @param {unknown} flags
 * @returns {EngineRegExp}
 */
function constructRegExp(prototype, pattern, flags) {
  if (isRegExpObject(pattern)) {
    if (flags !== undefined) {
      throw new GuestErrorSignal(
        'TypeError',
        'Cannot supply flags when constructing a RegExp from a RegExp object',
      );
    }

    const source = /** @type {EngineRegExp} */ (pattern);
    return buildRegExp(
      prototype,
      source.patternSource,
      flagsToString(source.flags),
    );
  }

  return buildRegExp(prototype, pattern, flags);
}

/**
 * @param {EngineObject} prototype
 * @param {unknown} pattern
 * @param {unknown} flags
 * @returns {EngineRegExp}
 */
function buildRegExp(prototype, pattern, flags) {
  // ES5 15.10.4.1: P is coerced before F, so a `toString` side effect on
  // `pattern` is observable before one on `flags`.
  const patternSource = pattern === undefined ? '' : toString(pattern);
  const flagsText = flags === undefined ? '' : toString(flags);

  let parsedFlags;

  try {
    parsedFlags = parseFlags(flagsText);
  } catch (error) {
    throw convertSyntaxError(error);
  }

  let compiled;

  try {
    compiled = compilePattern(patternSource, parsedFlags);
  } catch (error) {
    throw convertSyntaxError(error);
  }

  return new EngineRegExp(prototype, patternSource, parsedFlags, compiled);
}

/**
 * @param {unknown} error
 * @returns {unknown}
 */
function convertSyntaxError(error) {
  if (error instanceof RegExpSyntaxError) {
    return new GuestErrorSignal('SyntaxError', error.message);
  }

  return error;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isRegExpObject(value) {
  return value instanceof EngineObject && value.getClassName() === 'RegExp';
}

/**
 * @param {import('../runtime/regexp-syntax.js').FlagSet} flags
 * @returns {string}
 */
function flagsToString(flags) {
  return (
    (flags.global ? 'g' : '') +
    (flags.ignoreCase ? 'i' : '') +
    (flags.multiline ? 'm' : '')
  );
}
