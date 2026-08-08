import { EngineObject } from '../runtime/object.js';
import { EngineArray } from '../runtime/array-object.js';
import { ArrayIterator, StringIterator } from '../runtime/iterator-object.js';
import { GuestErrorSignal } from '../runtime/completion.js';
import { createIterResultObject } from '../runtime/iterator.js';
import {
  checkObjectCoercible,
  toInteger,
  toObject,
  toString,
} from '../runtime/conversion.js';
import { charCodeOfCodeUnit, codeUnitsBetween } from '../runtime/code-units.js';

/**
 * The iterator-protocol intrinsics and the two built-in iterators ECMA-262
 * ships in this milestone: `%IteratorPrototype%` (§25.1.2), the common
 * `[@@iterator]() { return this; }` root every built-in iterator inherits;
 * `%ArrayIteratorPrototype%` (§22.1.5.2) and `%StringIteratorPrototype%`
 * (§21.1.5.2); and the methods that mint their instances —
 * `Array.prototype.values`/`keys`/`entries`/`[@@iterator]` and
 * `String.prototype[@@iterator]`.
 *
 * Everything here is per-realm like every other built-in. The one shared thing
 * it uses is the agent's `@@iterator` well-known symbol, which is what makes the
 * iterators these methods return usable as a cross-realm protocol: an object
 * from one realm iterated by another realm's `for`-`of` is found through the
 * same key.
 *
 * @typedef {import('../runtime/realm.js').Realm} Realm
 * @typedef {import('./shared.js').NativeFunction} NativeFunction
 *
 * @typedef {{
 *   iteratorPrototype: EngineObject,
 *   arrayIteratorPrototype: EngineObject,
 *   stringIteratorPrototype: EngineObject,
 * }} IteratorIntrinsics
 */

/** The inclusive upper bound of ECMA-262 `ToLength`, i.e. `2^53 - 1`. */
const MAX_SAFE_INTEGER = 9007199254740991;

/**
 * Builds this realm's iterator prototypes. Called after the fundamental
 * intrinsics exist (it inherits `%Object.prototype%`) and after the agent is in
 * place (it reads `@@iterator`), but it needs no constructor, so it can run at
 * any later point in realm construction.
 *
 * @param {Realm} realm
 * @returns {IteratorIntrinsics}
 */
export function createIteratorIntrinsics(realm) {
  const iteratorSymbol = realm.agent.wellKnownSymbols.iterator;
  const toStringTagSymbol = realm.agent.wellKnownSymbols.toStringTag;

  const iteratorPrototype = new EngineObject(realm.intrinsics.objectPrototype);
  // §25.1.2.1 %IteratorPrototype%[@@iterator]: returns `this`, so any object
  // whose prototype chain reaches %IteratorPrototype% is itself iterable.
  defineBuiltinMethod(
    iteratorPrototype,
    iteratorSymbol,
    realm.createNativeFunction({
      name: '[Symbol.iterator]',
      length: 0,
      call(thisValue) {
        return thisValue;
      },
    }),
  );

  const arrayIteratorPrototype = new EngineObject(iteratorPrototype);
  defineBuiltinMethod(
    arrayIteratorPrototype,
    'next',
    realm.createNativeFunction({
      name: 'next',
      length: 0,
      call(thisValue) {
        return arrayIteratorNext(realm, thisValue);
      },
    }),
  );
  defineToStringTag(
    arrayIteratorPrototype,
    toStringTagSymbol,
    'Array Iterator',
  );

  const stringIteratorPrototype = new EngineObject(iteratorPrototype);
  defineBuiltinMethod(
    stringIteratorPrototype,
    'next',
    realm.createNativeFunction({
      name: 'next',
      length: 0,
      call(thisValue) {
        return stringIteratorNext(realm, thisValue);
      },
    }),
  );
  defineToStringTag(
    stringIteratorPrototype,
    toStringTagSymbol,
    'String Iterator',
  );

  return { iteratorPrototype, arrayIteratorPrototype, stringIteratorPrototype };
}

/**
 * Installs the iterator-producing methods onto the already-built
 * `%Array.prototype%` and `%String.prototype%`. Runs after
 * {@link createIteratorIntrinsics} so the prototypes the instances inherit
 * exist.
 *
 * @param {Realm} realm
 * @param {IteratorIntrinsics} intrinsics
 * @returns {void}
 */
export function installIteratorMethods(realm, intrinsics) {
  const iteratorSymbol = realm.agent.wellKnownSymbols.iterator;
  const { arrayPrototype, stringPrototype } = realm.intrinsics;
  const { arrayIteratorPrototype, stringIteratorPrototype } = intrinsics;

  const values = realm.createNativeFunction({
    name: 'values',
    length: 0,
    call(thisValue) {
      return new ArrayIterator(
        arrayIteratorPrototype,
        toObject(realm, thisValue),
        'value',
      );
    },
  });
  const keys = realm.createNativeFunction({
    name: 'keys',
    length: 0,
    call(thisValue) {
      return new ArrayIterator(
        arrayIteratorPrototype,
        toObject(realm, thisValue),
        'key',
      );
    },
  });
  const entries = realm.createNativeFunction({
    name: 'entries',
    length: 0,
    call(thisValue) {
      return new ArrayIterator(
        arrayIteratorPrototype,
        toObject(realm, thisValue),
        'key+value',
      );
    },
  });

  defineBuiltinMethod(arrayPrototype, 'values', values);
  defineBuiltinMethod(arrayPrototype, 'keys', keys);
  defineBuiltinMethod(arrayPrototype, 'entries', entries);
  // §22.1.3.30: Array.prototype[@@iterator] is the very same function object as
  // Array.prototype.values, not a distinct wrapper.
  defineBuiltinMethod(arrayPrototype, iteratorSymbol, values);

  defineBuiltinMethod(
    stringPrototype,
    iteratorSymbol,
    realm.createNativeFunction({
      name: '[Symbol.iterator]',
      length: 0,
      call(thisValue) {
        checkObjectCoercible(thisValue);
        return new StringIterator(stringIteratorPrototype, toString(thisValue));
      },
    }),
  );
}

/**
 * ECMA-262 §22.1.5.2.1 `%ArrayIteratorPrototype%.next`.
 *
 * @param {Realm} realm
 * @param {unknown} thisValue
 * @returns {EngineObject}
 */
function arrayIteratorNext(realm, thisValue) {
  if (!(thisValue instanceof ArrayIterator)) {
    throw new GuestErrorSignal(
      'TypeError',
      'Array Iterator.prototype.next called on an incompatible receiver',
    );
  }

  const array = thisValue.iteratedObject;

  if (array === undefined) {
    return createIterResultObject(realm, undefined, true);
  }

  const index = thisValue.nextIndex;
  const length = toLength(array.get('length'));

  if (index >= length) {
    thisValue.iteratedObject = undefined;
    return createIterResultObject(realm, undefined, true);
  }

  thisValue.nextIndex = index + 1;

  if (thisValue.kind === 'key') {
    return createIterResultObject(realm, index, false);
  }

  const elementValue = array.get(String(index));

  if (thisValue.kind === 'value') {
    return createIterResultObject(realm, elementValue, false);
  }

  return createIterResultObject(
    realm,
    createArrayFromList(realm, [index, elementValue]),
    false,
  );
}

/**
 * ECMA-262 §21.1.5.2.1 `%StringIteratorPrototype%.next`, yielding one code
 * point (never a lone surrogate half of a well-formed pair) at a time.
 *
 * @param {Realm} realm
 * @param {unknown} thisValue
 * @returns {EngineObject}
 */
function stringIteratorNext(realm, thisValue) {
  if (!(thisValue instanceof StringIterator)) {
    throw new GuestErrorSignal(
      'TypeError',
      'String Iterator.prototype.next called on an incompatible receiver',
    );
  }

  const string = thisValue.iteratedString;

  if (string === undefined) {
    return createIterResultObject(realm, undefined, true);
  }

  const position = thisValue.nextIndex;
  const length = string.length;

  if (position >= length) {
    thisValue.iteratedString = undefined;
    return createIterResultObject(realm, undefined, true);
  }

  const unitCount = codePointUnitCount(string, position, length);
  const resultString = codeUnitsBetween(string, position, position + unitCount);
  thisValue.nextIndex = position + unitCount;

  return createIterResultObject(realm, resultString, false);
}

/**
 * The number of UTF-16 code units the code point at `position` spans: two for a
 * well-formed surrogate pair, one otherwise (including a lone surrogate).
 *
 * @param {string} string
 * @param {number} position
 * @param {number} length
 * @returns {1 | 2}
 */
function codePointUnitCount(string, position, length) {
  const first = charCodeOfCodeUnit(string[position]);

  if (first < 0xd800 || first > 0xdbff || position + 1 >= length) {
    return 1;
  }

  const second = charCodeOfCodeUnit(string[position + 1]);

  return second >= 0xdc00 && second <= 0xdfff ? 2 : 1;
}

/**
 * ECMA-262 §7.1.15 `ToLength`, using the engine's own `ToInteger` and clamping
 * to `[0, 2^53 - 1]`.
 *
 * @param {unknown} value
 * @returns {number}
 */
function toLength(value) {
  const integer = toInteger(value);

  if (integer <= 0) {
    return 0;
  }

  return Math.min(integer, MAX_SAFE_INTEGER);
}

/**
 * Builds a dense guest array over `values`, for the `[index, value]` entries an
 * Array Iterator yields in `key+value` mode.
 *
 * @param {Realm} realm
 * @param {readonly unknown[]} values
 * @returns {EngineArray}
 */
function createArrayFromList(realm, values) {
  const array = new EngineArray(realm.intrinsics.arrayPrototype);

  for (let index = 0; index < values.length; index += 1) {
    array.defineOwnProperty(String(index), {
      value: values[index],
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  return array;
}

/**
 * @param {EngineObject} target
 * @param {import('../runtime/descriptors.js').PropertyKey} key
 * @param {NativeFunction} method
 * @returns {void}
 */
function defineBuiltinMethod(target, key, method) {
  target.defineOwnProperty(key, {
    value: method,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * @param {EngineObject} target
 * @param {symbol} toStringTagSymbol
 * @param {string} tag
 * @returns {void}
 */
function defineToStringTag(target, toStringTagSymbol, tag) {
  target.defineOwnProperty(toStringTagSymbol, {
    value: tag,
    writable: false,
    enumerable: false,
    configurable: true,
  });
}
