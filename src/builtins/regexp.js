import { EngineObject } from '../runtime/object.js';
import { EngineArray } from '../runtime/array-object.js';
import { EngineRegExp } from '../runtime/regexp-object.js';
import { compilePattern } from '../runtime/regexp-compat.js';
import { parseFlags, RegExpSyntaxError } from '../runtime/regexp-syntax.js';
import { toBoolean, toInteger, toString } from '../runtime/conversion.js';
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

      return constructRegExp(realm, regExpPrototype, pattern, flags);
    },
    construct(args) {
      const [pattern, flags] = args;

      return constructRegExp(realm, regExpPrototype, pattern, flags);
    },
  });

  regExpPrototype.defineOwnProperty('constructor', {
    value: regExpConstructor,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  installExecMethod(realm, regExpPrototype);
  installTestMethod(realm, regExpPrototype);
  installToStringMethod(realm, regExpPrototype);

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
 * Implements ES5 15.10.6.2 `RegExp.prototype.exec(string)` as a standalone
 * abstract operation rather than a property of `%RegExp.prototype%`,
 * because two other call sites need the *algorithm* and not the
 * (guest-overridable) `exec` property: 15.10.6.3 `RegExp.prototype.test`
 * below, per its literal spec text "the result obtained by evaluating
 * `RegExp.prototype.exec (String( string ))` as if that expression were the
 * `MemberExpression` in ... a `new` expression", and Task 3's
 * `String.prototype.match`/`replace`/`search`/`split`.
 *
 * Steps 4/6/9.a/11 read/write `lastIndex`/`global` through `R`'s own
 * `[[Get]]`/`[[Put]]` (`EngineObject.get`/`put`), not the constructor's
 * internal `flags` field, so a guest rewrite of `lastIndex` (or, in
 * principle, an own `global` — though that property is non-configurable
 * per 15.10.7.2) is honoured exactly as ES5 specifies. `[[Put]]` is called
 * with `throwOnError = true`, so a guest-frozen `lastIndex` makes `exec`
 * throw a guest `TypeError` instead of silently failing to update it.
 *
 * @param {Realm} realm
 * @param {unknown} thisValue
 * @param {unknown} string
 * @returns {EngineArray | null}
 */
export function regExpExec(realm, thisValue, string) {
  if (!isRegExpObject(thisValue)) {
    throw new GuestErrorSignal(
      'TypeError',
      'RegExp.prototype.exec called on a value that is not a RegExp object',
    );
  }

  const R = /** @type {EngineRegExp} */ (thisValue);
  // ToString(undefined) is the literal text "undefined": exec() with no
  // argument therefore searches for that string, not an empty pattern.
  const S = toString(string, realm);
  const length = S.length;

  let i = toInteger(R.get('lastIndex', realm), realm);
  const global = toBoolean(R.get('global', realm));

  if (!global) {
    i = 0;
  }

  /** @type {import('../runtime/regexp-compat.js').MatchResult | null} */
  let matchResult = null;

  while (matchResult === null) {
    if (i < 0 || i > length) {
      // ES5 15.10.6.2 step 9.a.i unconditionally resets `lastIndex` to 0 on
      // total match failure; this reset is not gated on `global` — the
      // `global` check only guards the *success* path's `lastIndex` update
      // to the match end position (step 11, below).
      R.put('lastIndex', 0, true, realm);
      return null;
    }

    matchResult = R.matchAt(S, i);

    if (matchResult === null) {
      i += 1;
    }
  }

  const e = matchResult.endIndex;

  if (global) {
    R.put('lastIndex', e, true, realm);
  }

  const n = R.capturingGroups;
  const result = new EngineArray(realm.intrinsics.arrayPrototype);

  // ES5 15.10.6.2 steps 14-20 define '0'..'n' before 'index'/'input', but
  // this engine's own-property enumeration order is insertion order, and
  // ES5 leaves own-property enumeration order implementation-defined
  // (there is no `[[OwnPropertyKeys]]` ordering requirement until ES2015).
  // Every shipping engine lists '0'..'n' before 'index'/'input' in
  // `Object.keys`, so the elements are defined first to match that de
  // facto convention rather than the spec's incidental step order.
  defineResultProperty(result, '0', matchResult.matched);

  for (let group = 1; group <= n; group += 1) {
    defineResultProperty(
      result,
      String(group),
      matchResult.captures[group - 1],
    );
  }

  defineResultProperty(result, 'index', i);
  defineResultProperty(result, 'input', S);

  return result;
}

/**
 * @param {EngineArray} result
 * @param {string} name
 * @param {unknown} value
 * @returns {void}
 */
function defineResultProperty(result, name, value) {
  result.defineOwnProperty(name, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Installs `RegExp.prototype.exec` (ES5 15.10.6.2), `length` 1, with the
 * standard method descriptor (`{ writable: true, enumerable: false,
 * configurable: true }`) every other built-in method in this engine uses
 * (`primitive-wrappers.js`, `array.js`).
 *
 * @param {Realm} realm
 * @param {EngineRegExp} regExpPrototype
 * @returns {void}
 */
function installExecMethod(realm, regExpPrototype) {
  defineMethod(
    regExpPrototype,
    'exec',
    realm.createNativeFunction({
      name: 'exec',
      length: 1,
      call(thisValue, args) {
        return regExpExec(realm, thisValue, args[0]);
      },
    }),
  );
}

/**
 * Implements ES5 15.10.6.3 `RegExp.prototype.test(string)`: "the result
 * obtained by evaluating the `RegExp.prototype.exec` algorithm", not the
 * (possibly guest-overwritten) `exec` property — `test` calls `regExpExec`
 * directly so overwriting `RegExp.prototype.exec` from guest code cannot
 * change what `test` does.
 *
 * @param {Realm} realm
 * @param {EngineRegExp} regExpPrototype
 * @returns {void}
 */
function installTestMethod(realm, regExpPrototype) {
  defineMethod(
    regExpPrototype,
    'test',
    realm.createNativeFunction({
      name: 'test',
      length: 1,
      call(thisValue, args) {
        return regExpExec(realm, thisValue, args[0]) !== null;
      },
    }),
  );
}

/**
 * Implements ES5 15.10.6.4 `RegExp.prototype.toString()`:
 * `'/' + ToString(source) + '/'` plus a fixed `gim`-ordered flag suffix,
 * regardless of the order flags were supplied in when the pattern was
 * constructed (`new RegExp('a', 'mig').toString() === '/a/gim'`).
 * `RegExp.prototype.toString()` (the empty pattern, no flags) is
 * `'/(?:)/'`.
 *
 * @param {Realm} realm
 * @param {EngineRegExp} regExpPrototype
 * @returns {void}
 */
function installToStringMethod(realm, regExpPrototype) {
  defineMethod(
    regExpPrototype,
    'toString',
    realm.createNativeFunction({
      name: 'toString',
      length: 0,
      call(thisValue) {
        if (!isRegExpObject(thisValue)) {
          throw new GuestErrorSignal(
            'TypeError',
            'RegExp.prototype.toString called on a value that is not a RegExp object',
          );
        }

        const R = /** @type {EngineRegExp} */ (thisValue);
        const source = toString(R.get('source', realm), realm);
        let flagsText = '';

        if (toBoolean(R.get('global', realm))) {
          flagsText += 'g';
        }

        if (toBoolean(R.get('ignoreCase', realm))) {
          flagsText += 'i';
        }

        if (toBoolean(R.get('multiline', realm))) {
          flagsText += 'm';
        }

        return '/' + source + '/' + flagsText;
      },
    }),
  );
}

/**
 * @param {EngineObject} target
 * @param {string} name
 * @param {unknown} value
 * @returns {void}
 */
function defineMethod(target, name, value) {
  target.defineOwnProperty(name, {
    value,
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
    regExpConstructor.get('prototype', realm)
  );

  return buildRegExp(realm, regExpPrototype, patternSource, flagsText);
}

/**
 * Implements the pattern/flags resolution ES5 15.10.4.1 (construct) and
 * 15.10.3.1's "otherwise, behave exactly as construct" fallback share: if
 * `pattern` is a RegExp object, `flags` must be `undefined` (else a guest
 * `TypeError`) and the new object copies that object's own pattern source
 * and flags; otherwise `pattern`/`flags` are ES5 15.10.4.1's `P`/`F`, coerced
 * with `ToString` in that order.
 *
 * @param {Realm} realm
 * @param {EngineObject} prototype
 * @param {unknown} pattern
 * @param {unknown} flags
 * @returns {EngineRegExp}
 */
function constructRegExp(realm, prototype, pattern, flags) {
  if (isRegExpObject(pattern)) {
    if (flags !== undefined) {
      throw new GuestErrorSignal(
        'TypeError',
        'Cannot supply flags when constructing a RegExp from a RegExp object',
      );
    }

    const source = /** @type {EngineRegExp} */ (pattern);
    return buildRegExp(
      realm,
      prototype,
      source.patternSource,
      flagsToString(source.flags),
    );
  }

  return buildRegExp(realm, prototype, pattern, flags);
}

/**
 * @param {Realm} realm
 * @param {EngineObject} prototype
 * @param {unknown} pattern
 * @param {unknown} flags
 * @returns {EngineRegExp}
 */
function buildRegExp(realm, prototype, pattern, flags) {
  // ES5 15.10.4.1: P is coerced before F, so a `toString` side effect on
  // `pattern` is observable before one on `flags`.
  const patternSource = pattern === undefined ? '' : toString(pattern, realm);
  const flagsText = flags === undefined ? '' : toString(flags, realm);

  // Note: ES5 15.10.4.1 checks Pattern (step 4) before flags (step 5), but
  // here we validate flags first. This is unobservable: both throw SyntaxError,
  // and both ToString coercions (on pattern and flags) already happened above
  // in the correct order, so no side effect can detect which validation ran.
  let parsedFlags;

  try {
    parsedFlags = parseFlags(flagsText);
  } catch (error) {
    throw convertSyntaxError(error);
  }

  let compiled;

  try {
    compiled = compilePattern(
      patternSource,
      parsedFlags,
      undefined,
      realm.stackGuard,
    );
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
