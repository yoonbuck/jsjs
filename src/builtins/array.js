import { EngineArray } from '../runtime/array-object.js';
import { EngineObject } from '../runtime/object.js';
import {
  toInteger,
  toNumber,
  toObject,
  toString,
  toUint32,
} from '../runtime/conversion.js';
import { requireCallable } from './shared.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 */

/**
 * @param {Realm} realm
 * @returns {{ arrayConstructor: import('./shared.js').NativeFunction }}
 */
export function createArrayIntrinsics(realm) {
  const { arrayPrototype } = realm.intrinsics;

  /**
   * @param {readonly unknown[]} args
   * @returns {EngineArray}
   */
  function createArray(args) {
    const array = new EngineArray(arrayPrototype);

    if (args.length === 1 && typeof args[0] === 'number') {
      array.defineOwnProperty('length', { value: args[0] }, true);
      return array;
    }

    for (let index = 0; index < args.length; index += 1) {
      array.defineOwnProperty(String(index), {
        value: args[index],
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    return array;
  }

  const arrayConstructor = realm.createNativeFunction({
    name: 'Array',
    length: 1,
    prototype: arrayPrototype,
    call(_thisValue, args) {
      return createArray(args);
    },
    construct(args) {
      return createArray(args);
    },
  });

  arrayPrototype.defineOwnProperty('constructor', {
    value: arrayConstructor,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  defineNativeMethod(
    realm,
    arrayConstructor,
    'isArray',
    1,
    (_thisValue, args) => args[0] instanceof EngineArray,
  );
  installMutatingArrayMethods(realm, arrayPrototype);

  return { arrayConstructor };
}

/**
 * @param {EngineObject} globalObject
 * @param {{ arrayConstructor: import('./shared.js').NativeFunction }} intrinsics
 * @returns {void}
 */
export function installArrayConstructor(globalObject, intrinsics) {
  globalObject.defineOwnProperty('Array', {
    value: intrinsics.arrayConstructor,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * @param {Realm} realm
 * @param {EngineObject} target
 * @param {string} name
 * @param {number} length
 * @param {import('./shared.js').NativeFunctionOptions['call']} call
 * @returns {void}
 */
function defineNativeMethod(realm, target, name, length, call) {
  target.defineOwnProperty(name, {
    value: realm.createNativeFunction({ name, length, call }),
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * @param {Realm} realm
 * @param {EngineObject} arrayPrototype
 * @returns {void}
 */
function installMutatingArrayMethods(realm, arrayPrototype) {
  defineNativeMethod(realm, arrayPrototype, 'push', 1, (thisValue, args) => {
    const object = toObject(realm, thisValue);
    let length = arrayLikeLength(object);

    for (const value of args) {
      object.put(String(length), value, true);
      length += 1;
    }

    object.put('length', length, true);
    return length;
  });
  defineNativeMethod(realm, arrayPrototype, 'pop', 0, (thisValue) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object);

    if (length === 0) {
      object.put('length', 0, true);
      return undefined;
    }

    const index = String(length - 1);
    const element = object.get(index);
    object.delete(index, true);
    object.put('length', length - 1, true);
    return element;
  });
  defineNativeMethod(realm, arrayPrototype, 'shift', 0, (thisValue) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object);

    if (length === 0) {
      object.put('length', 0, true);
      return undefined;
    }

    const first = object.get('0');

    for (let index = 1; index < length; index += 1) {
      const from = String(index);
      const to = String(index - 1);

      if (object.hasProperty(from)) {
        object.put(to, object.get(from), true);
      } else {
        object.delete(to, true);
      }
    }

    object.delete(String(length - 1), true);
    object.put('length', length - 1, true);
    return first;
  });
  defineNativeMethod(realm, arrayPrototype, 'unshift', 1, (thisValue, args) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object);
    const itemCount = args.length;

    for (let index = length; index > 0; index -= 1) {
      const from = String(index - 1);
      const to = String(index + itemCount - 1);

      if (object.hasProperty(from)) {
        object.put(to, object.get(from), true);
      } else {
        object.delete(to, true);
      }
    }

    for (let index = 0; index < itemCount; index += 1) {
      object.put(String(index), args[index], true);
    }

    const newLength = length + itemCount;
    object.put('length', newLength, true);
    return newLength;
  });
  defineNativeMethod(realm, arrayPrototype, 'reverse', 0, (thisValue) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object);
    const middle = Math.floor(length / 2);

    for (let lower = 0; lower < middle; lower += 1) {
      const upper = length - lower - 1;
      const lowerName = String(lower);
      const upperName = String(upper);
      const lowerExists = object.hasProperty(lowerName);
      const lowerValue = lowerExists ? object.get(lowerName) : undefined;
      const upperExists = object.hasProperty(upperName);
      const upperValue = upperExists ? object.get(upperName) : undefined;

      if (lowerExists && upperExists) {
        object.put(lowerName, upperValue, true);
        object.put(upperName, lowerValue, true);
      } else if (!lowerExists && upperExists) {
        object.put(lowerName, upperValue, true);
        object.delete(upperName, true);
      } else if (lowerExists) {
        object.delete(lowerName, true);
        object.put(upperName, lowerValue, true);
      }
    }

    return object;
  });
  defineNativeMethod(realm, arrayPrototype, 'sort', 1, (thisValue, args) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object);
    const compareArgument = args[0];
    const compare =
      compareArgument === undefined
        ? undefined
        : requireCallable(
            compareArgument,
            'Array sort comparator is not callable',
          );
    /** @type {unknown[]} */
    const sorted = [];
    let undefinedCount = 0;

    for (let index = 0; index < length; index += 1) {
      const name = String(index);

      if (!object.hasProperty(name)) {
        continue;
      }

      const value = object.get(name);

      if (value === undefined) {
        undefinedCount += 1;
      } else {
        insertSorted(sorted, value, compare);
      }
    }

    let writeIndex = 0;

    for (const value of sorted) {
      object.put(String(writeIndex), value, true);
      writeIndex += 1;
    }

    for (let index = 0; index < undefinedCount; index += 1) {
      object.put(String(writeIndex), undefined, true);
      writeIndex += 1;
    }

    while (writeIndex < length) {
      object.delete(String(writeIndex), true);
      writeIndex += 1;
    }

    return object;
  });
  defineNativeMethod(realm, arrayPrototype, 'splice', 2, (thisValue, args) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object);
    const relativeStart = toInteger(args[0]);
    const actualStart =
      relativeStart < 0
        ? maximum(length + relativeStart, 0)
        : minimum(relativeStart, length);
    const deleteCount =
      args.length < 2
        ? args.length === 0
          ? 0
          : length - actualStart
        : minimum(maximum(toInteger(args[1]), 0), length - actualStart);
    const itemCount = args.length > 2 ? args.length - 2 : 0;
    const removed = new EngineArray(realm.intrinsics.arrayPrototype);

    for (let index = 0; index < deleteCount; index += 1) {
      const from = String(actualStart + index);

      if (object.hasProperty(from)) {
        removed.defineOwnProperty(String(index), {
          value: object.get(from),
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    }

    removed.defineOwnProperty('length', { value: deleteCount }, true);

    if (itemCount < deleteCount) {
      for (let index = actualStart; index < length - deleteCount; index += 1) {
        const from = String(index + deleteCount);
        const to = String(index + itemCount);

        if (object.hasProperty(from)) {
          object.put(to, object.get(from), true);
        } else {
          object.delete(to, true);
        }
      }

      for (
        let index = length;
        index > length - deleteCount + itemCount;
        index -= 1
      ) {
        object.delete(String(index - 1), true);
      }
    } else if (itemCount > deleteCount) {
      for (let index = length - deleteCount; index > actualStart; index -= 1) {
        const from = String(index + deleteCount - 1);
        const to = String(index + itemCount - 1);

        if (object.hasProperty(from)) {
          object.put(to, object.get(from), true);
        } else {
          object.delete(to, true);
        }
      }
    }

    for (let index = 0; index < itemCount; index += 1) {
      object.put(String(actualStart + index), args[index + 2], true);
    }

    object.put('length', length - deleteCount + itemCount, true);
    return removed;
  });
}

/**
 * @param {EngineObject} object
 * @returns {number}
 */
function arrayLikeLength(object) {
  return toUint32(object.get('length'));
}

/**
 * @param {unknown[]} sorted
 * @param {unknown} value
 * @param {import('../runtime/descriptors.js').CallableLike | undefined} compare
 * @returns {void}
 */
function insertSorted(sorted, value, compare) {
  let index = sorted.length;

  while (
    index > 0 &&
    compareArrayValues(sorted[index - 1], value, compare) > 0
  ) {
    sorted[index] = sorted[index - 1];
    index -= 1;
  }

  sorted[index] = value;
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @param {import('../runtime/descriptors.js').CallableLike | undefined} compare
 * @returns {number}
 */
function compareArrayValues(left, right, compare) {
  if (compare !== undefined) {
    const result = toNumber(compare.callFunction(undefined, [left, right]));
    return Number.isNaN(result) ? 0 : result;
  }

  const leftString = toString(left);
  const rightString = toString(right);

  if (leftString < rightString) {
    return -1;
  }

  return leftString > rightString ? 1 : 0;
}

/**
 * @param {number} left
 * @param {number} right
 * @returns {number}
 */
function minimum(left, right) {
  return left < right ? left : right;
}

/**
 * @param {number} left
 * @param {number} right
 * @returns {number}
 */
function maximum(left, right) {
  return left > right ? left : right;
}
