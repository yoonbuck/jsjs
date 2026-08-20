import { EngineArray } from '../runtime/array-object.js';
import { GuestErrorSignal } from '../runtime/completion.js';
import {
  defineOwnPropertyOrThrow,
  deletePropertyOrThrow,
} from '../runtime/object.js';
import {
  toInteger,
  toNumber,
  toObject,
  toString,
  toUint32,
} from '../runtime/conversion.js';
import { isCallable } from '../runtime/descriptors.js';
import { strictEqualityComparison } from '../runtime/operators.js';
import { requireCallable } from './shared.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 * @typedef {import('../runtime/object.js').EngineObject} EngineObject
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
      defineOwnPropertyOrThrow(array, 'length', { value: args[0] });
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
  installNonMutatingArrayMethods(realm, arrayPrototype);

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
    let length = arrayLikeLength(object, realm);

    for (const value of args) {
      object.put(String(length), value, true, realm);
      length += 1;
    }

    object.put('length', length, true, realm);
    return length;
  });
  defineNativeMethod(realm, arrayPrototype, 'pop', 0, (thisValue) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object, realm);

    if (length === 0) {
      object.put('length', 0, true, realm);
      return undefined;
    }

    const index = String(length - 1);
    const element = object.get(index, realm);
    deletePropertyOrThrow(object, index);
    object.put('length', length - 1, true, realm);
    return element;
  });
  defineNativeMethod(realm, arrayPrototype, 'shift', 0, (thisValue) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object, realm);

    if (length === 0) {
      object.put('length', 0, true, realm);
      return undefined;
    }

    const first = object.get('0', realm);

    for (let index = 1; index < length; index += 1) {
      const from = String(index);
      const to = String(index - 1);

      if (object.hasProperty(from)) {
        object.put(to, object.get(from, realm), true, realm);
      } else {
        deletePropertyOrThrow(object, to);
      }
    }

    deletePropertyOrThrow(object, String(length - 1));
    object.put('length', length - 1, true, realm);
    return first;
  });
  defineNativeMethod(realm, arrayPrototype, 'unshift', 1, (thisValue, args) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object, realm);
    const itemCount = args.length;

    for (let index = length; index > 0; index -= 1) {
      const from = String(index - 1);
      const to = String(index + itemCount - 1);

      if (object.hasProperty(from)) {
        object.put(to, object.get(from, realm), true, realm);
      } else {
        deletePropertyOrThrow(object, to);
      }
    }

    for (let index = 0; index < itemCount; index += 1) {
      object.put(String(index), args[index], true, realm);
    }

    const newLength = length + itemCount;
    object.put('length', newLength, true, realm);
    return newLength;
  });
  defineNativeMethod(realm, arrayPrototype, 'reverse', 0, (thisValue) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object, realm);
    const middle = Math.floor(length / 2);

    for (let lower = 0; lower < middle; lower += 1) {
      const upper = length - lower - 1;
      const lowerName = String(lower);
      const upperName = String(upper);
      const lowerExists = object.hasProperty(lowerName);
      const lowerValue = lowerExists ? object.get(lowerName, realm) : undefined;
      const upperExists = object.hasProperty(upperName);
      const upperValue = upperExists ? object.get(upperName, realm) : undefined;

      if (lowerExists && upperExists) {
        object.put(lowerName, upperValue, true, realm);
        object.put(upperName, lowerValue, true, realm);
      } else if (!lowerExists && upperExists) {
        object.put(lowerName, upperValue, true, realm);
        deletePropertyOrThrow(object, upperName);
      } else if (lowerExists) {
        deletePropertyOrThrow(object, lowerName);
        object.put(upperName, lowerValue, true, realm);
      }
    }

    return object;
  });
  defineNativeMethod(realm, arrayPrototype, 'sort', 1, (thisValue, args) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object, realm);
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

      const value = object.get(name, realm);

      if (value === undefined) {
        undefinedCount += 1;
      } else {
        insertSorted(sorted, value, compare, realm);
      }
    }

    let writeIndex = 0;

    for (const value of sorted) {
      object.put(String(writeIndex), value, true, realm);
      writeIndex += 1;
    }

    for (let index = 0; index < undefinedCount; index += 1) {
      object.put(String(writeIndex), undefined, true, realm);
      writeIndex += 1;
    }

    while (writeIndex < length) {
      deletePropertyOrThrow(object, String(writeIndex));
      writeIndex += 1;
    }

    return object;
  });
  defineNativeMethod(realm, arrayPrototype, 'splice', 2, (thisValue, args) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object, realm);
    const relativeStart = toInteger(args[0], realm);
    const actualStart =
      relativeStart < 0
        ? maximum(length + relativeStart, 0)
        : minimum(relativeStart, length);
    // Production ES5 engines delete through the end when deleteCount is omitted,
    // despite ES5.1's literal undefined-deleteCount wording.
    const deleteCount =
      args.length < 2
        ? args.length === 0
          ? 0
          : length - actualStart
        : minimum(maximum(toInteger(args[1], realm), 0), length - actualStart);
    const itemCount = args.length > 2 ? args.length - 2 : 0;
    const removed = new EngineArray(realm.intrinsics.arrayPrototype);

    for (let index = 0; index < deleteCount; index += 1) {
      const from = String(actualStart + index);

      if (object.hasProperty(from)) {
        removed.defineOwnProperty(String(index), {
          value: object.get(from, realm),
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    }

    defineOwnPropertyOrThrow(removed, 'length', { value: deleteCount });

    if (itemCount < deleteCount) {
      for (let index = actualStart; index < length - deleteCount; index += 1) {
        const from = String(index + deleteCount);
        const to = String(index + itemCount);

        if (object.hasProperty(from)) {
          object.put(to, object.get(from, realm), true, realm);
        } else {
          deletePropertyOrThrow(object, to);
        }
      }

      for (
        let index = length;
        index > length - deleteCount + itemCount;
        index -= 1
      ) {
        deletePropertyOrThrow(object, String(index - 1));
      }
    } else if (itemCount > deleteCount) {
      for (let index = length - deleteCount; index > actualStart; index -= 1) {
        const from = String(index + deleteCount - 1);
        const to = String(index + itemCount - 1);

        if (object.hasProperty(from)) {
          object.put(to, object.get(from, realm), true, realm);
        } else {
          deletePropertyOrThrow(object, to);
        }
      }
    }

    for (let index = 0; index < itemCount; index += 1) {
      object.put(String(actualStart + index), args[index + 2], true, realm);
    }

    object.put('length', length - deleteCount + itemCount, true, realm);
    return removed;
  });
}

/**
 * @param {Realm} realm
 * @param {EngineObject} arrayPrototype
 * @returns {void}
 */
function installNonMutatingArrayMethods(realm, arrayPrototype) {
  const objectToString = requireCallable(
    realm.intrinsics.objectPrototype.get('toString'),
    'Object toString intrinsic is not callable',
  );

  defineNativeMethod(realm, arrayPrototype, 'toString', 0, (thisValue) => {
    const object = toObject(realm, thisValue);
    const join = object.get('join', realm);

    if (isCallable(join)) {
      return join.callFunction(object, [], realm);
    }

    return objectToString.callFunction(object, [], realm);
  });
  defineNativeMethod(
    realm,
    arrayPrototype,
    'toLocaleString',
    0,
    (thisValue) => {
      const object = toObject(realm, thisValue);
      const length = arrayLikeLength(object, realm);
      let result = '';

      for (let index = 0; index < length; index += 1) {
        if (index > 0) {
          result += ',';
        }

        const element = object.get(String(index), realm);

        if (element === null || element === undefined) {
          continue;
        }

        // ES5 15.4.4.3 steps 8.a-8.d (and 10.d.i-10.d.iv for the tail):
        // every non-nullish element is boxed with ToObject exactly once,
        // "toLocaleString" is read off that wrapper, and the call receives
        // the *wrapper* as its this value. Boxing once and reusing it is
        // what makes an inherited Object.prototype.toLocaleString observable
        // on a primitive element, and what makes a strict callee — which
        // never re-boxes this — still see an object.
        const elementObject = toObject(realm, element);
        const toLocaleString = requireCallable(
          elementObject.get('toLocaleString', realm),
          'Array element toLocaleString property is not callable',
        );

        result += toString(
          toLocaleString.callFunction(elementObject, [], realm),
          realm,
        );
      }

      return result;
    },
  );
  defineNativeMethod(realm, arrayPrototype, 'concat', 1, (thisValue, args) => {
    const result = new EngineArray(realm.intrinsics.arrayPrototype);
    let nextIndex = 0;

    /**
     * @param {unknown} value
     * @returns {void}
     */
    function append(value) {
      if (value instanceof EngineArray) {
        const length = arrayLikeLength(value, realm);

        for (let index = 0; index < length; index += 1) {
          const name = String(index);

          if (value.hasProperty(name)) {
            createDataProperty(
              result,
              String(nextIndex),
              value.get(name, realm),
            );
          }

          nextIndex += 1;
        }
        return;
      }

      createDataProperty(result, String(nextIndex), value);
      nextIndex += 1;
    }

    append(toObject(realm, thisValue));
    for (const value of args) {
      append(value);
    }
    defineOwnPropertyOrThrow(result, 'length', { value: nextIndex });
    return result;
  });
  defineNativeMethod(realm, arrayPrototype, 'join', 1, (thisValue, args) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object, realm);
    const separator = args[0] === undefined ? ',' : toString(args[0], realm);
    let result = '';

    for (let index = 0; index < length; index += 1) {
      if (index > 0) {
        result += separator;
      }

      const element = object.get(String(index), realm);

      if (element !== null && element !== undefined) {
        result += toString(element, realm);
      }
    }

    return result;
  });
  defineNativeMethod(realm, arrayPrototype, 'slice', 2, (thisValue, args) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object, realm);
    const start = clampRelativeIndex(toInteger(args[0], realm), length);
    const end =
      args[1] === undefined
        ? length
        : clampRelativeIndex(toInteger(args[1], realm), length);
    const result = new EngineArray(realm.intrinsics.arrayPrototype);
    let nextIndex = 0;

    for (let index = start; index < end; index += 1) {
      const name = String(index);

      if (object.hasProperty(name)) {
        createDataProperty(result, String(nextIndex), object.get(name, realm));
      }

      nextIndex += 1;
    }

    defineOwnPropertyOrThrow(result, 'length', { value: nextIndex });
    return result;
  });
  defineNativeMethod(realm, arrayPrototype, 'indexOf', 1, (thisValue, args) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object, realm);

    if (length === 0) {
      return -1;
    }

    const fromIndex = args.length > 1 ? toInteger(args[1], realm) : 0;

    if (fromIndex >= length) {
      return -1;
    }

    let index = fromIndex >= 0 ? fromIndex : maximum(length + fromIndex, 0);
    // ToInteger leaves -0 unchanged, and a >= 0 comparison treats -0 as
    // non-negative, so a `fromIndex` of -0 would otherwise seed `index`
    // with -0 and surface it as the found result below.
    if (index === 0) {
      index = 0;
    }

    while (index < length) {
      const name = String(index);

      if (
        object.hasProperty(name) &&
        strictEqualityComparison(object.get(name, realm), args[0])
      ) {
        return index;
      }

      index += 1;
    }

    return -1;
  });
  defineNativeMethod(
    realm,
    arrayPrototype,
    'lastIndexOf',
    1,
    (thisValue, args) => {
      const object = toObject(realm, thisValue);
      const length = arrayLikeLength(object, realm);

      if (length === 0) {
        return -1;
      }

      const fromIndex =
        args.length > 1 ? toInteger(args[1], realm) : length - 1;

      if (fromIndex < -length) {
        return -1;
      }

      let index =
        fromIndex >= 0 ? minimum(fromIndex, length - 1) : length + fromIndex;
      // Same -0 normalization as indexOf above: ToInteger leaves -0
      // unchanged, so a `fromIndex` of -0 must not surface as a -0 result.
      if (index === 0) {
        index = 0;
      }

      while (index >= 0) {
        const name = String(index);

        if (
          object.hasProperty(name) &&
          strictEqualityComparison(object.get(name, realm), args[0])
        ) {
          return index;
        }

        index -= 1;
      }

      return -1;
    },
  );
  defineIterationMethod(
    realm,
    arrayPrototype,
    'every',
    (callbackResult) => {
      if (!callbackResult) {
        return { done: true, value: false };
      }

      return undefined;
    },
    true,
  );
  defineIterationMethod(
    realm,
    arrayPrototype,
    'some',
    (callbackResult) => {
      if (callbackResult) {
        return { done: true, value: true };
      }

      return undefined;
    },
    false,
  );
  defineIterationMethod(
    realm,
    arrayPrototype,
    'forEach',
    () => undefined,
    undefined,
  );
  defineNativeMethod(realm, arrayPrototype, 'map', 1, (thisValue, args) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object, realm);
    const callback = requireCallable(
      args[0],
      'Array map callback is not callable',
    );
    const result = new EngineArray(realm.intrinsics.arrayPrototype);
    defineOwnPropertyOrThrow(result, 'length', { value: length });

    for (let index = 0; index < length; index += 1) {
      const name = String(index);

      if (!object.hasProperty(name)) {
        continue;
      }

      createDataProperty(
        result,
        name,
        callback.callFunction(
          args[1],
          [object.get(name, realm), index, object],
          realm,
        ),
      );
    }

    return result;
  });
  defineNativeMethod(realm, arrayPrototype, 'filter', 1, (thisValue, args) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object, realm);
    const callback = requireCallable(
      args[0],
      'Array filter callback is not callable',
    );
    const result = new EngineArray(realm.intrinsics.arrayPrototype);
    let nextIndex = 0;

    for (let index = 0; index < length; index += 1) {
      const name = String(index);

      if (!object.hasProperty(name)) {
        continue;
      }

      const value = object.get(name, realm);

      if (callback.callFunction(args[1], [value, index, object], realm)) {
        createDataProperty(result, String(nextIndex), value);
        nextIndex += 1;
      }
    }

    return result;
  });
  defineReduceMethod(realm, arrayPrototype, 'reduce', false);
  defineReduceMethod(realm, arrayPrototype, 'reduceRight', true);
}

/**
 * @param {Realm} realm
 * @param {EngineObject} arrayPrototype
 * @param {'every' | 'some' | 'forEach'} name
 * @param {(callbackResult: unknown) => { done: true, value: unknown } | undefined} visit
 * @param {unknown} completedValue
 * @returns {void}
 */
function defineIterationMethod(
  realm,
  arrayPrototype,
  name,
  visit,
  completedValue,
) {
  defineNativeMethod(realm, arrayPrototype, name, 1, (thisValue, args) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object, realm);
    const callback = requireCallable(
      args[0],
      `Array ${name} callback is not callable`,
    );

    for (let index = 0; index < length; index += 1) {
      const property = String(index);

      if (!object.hasProperty(property)) {
        continue;
      }

      const completion = visit(
        callback.callFunction(
          args[1],
          [object.get(property, realm), index, object],
          realm,
        ),
      );

      if (completion !== undefined) {
        return completion.value;
      }
    }

    return completedValue;
  });
}

/**
 * @param {Realm} realm
 * @param {EngineObject} arrayPrototype
 * @param {'reduce' | 'reduceRight'} name
 * @param {boolean} rightToLeft
 * @returns {void}
 */
function defineReduceMethod(realm, arrayPrototype, name, rightToLeft) {
  defineNativeMethod(realm, arrayPrototype, name, 1, (thisValue, args) => {
    const object = toObject(realm, thisValue);
    const length = arrayLikeLength(object, realm);
    const callback = requireCallable(
      args[0],
      `Array ${name} callback is not callable`,
    );
    let index = rightToLeft ? length - 1 : 0;
    const step = rightToLeft ? -1 : 1;
    /** @type {unknown} */
    let accumulator;

    if (args.length > 1) {
      accumulator = args[1];
    } else {
      let found = false;

      while (rightToLeft ? index >= 0 : index < length) {
        const property = String(index);

        if (object.hasProperty(property)) {
          accumulator = object.get(property, realm);
          found = true;
          index += step;
          break;
        }

        index += step;
      }

      if (!found) {
        throw new GuestErrorSignal(
          'TypeError',
          'Reduce of empty array with no initial value',
        );
      }
    }

    while (rightToLeft ? index >= 0 : index < length) {
      const property = String(index);

      if (object.hasProperty(property)) {
        accumulator = callback.callFunction(
          undefined,
          [accumulator, object.get(property, realm), index, object],
          realm,
        );
      }

      index += step;
    }

    return accumulator;
  });
}

/**
 * @param {EngineObject} object
 * @param {string} name
 * @param {unknown} value
 * @returns {void}
 */
function createDataProperty(object, name, value) {
  defineOwnPropertyOrThrow(object, name, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * @param {number} relativeIndex
 * @param {number} length
 * @returns {number}
 */
function clampRelativeIndex(relativeIndex, length) {
  return relativeIndex < 0
    ? maximum(length + relativeIndex, 0)
    : minimum(relativeIndex, length);
}

/**
 * @param {EngineObject} object
 * @param {Realm} callerRealm
 * @returns {number}
 */
function arrayLikeLength(object, callerRealm) {
  return toUint32(object.get('length', callerRealm), callerRealm);
}

/**
 * @param {unknown[]} sorted
 * @param {unknown} value
 * @param {import('../runtime/descriptors.js').CallableLike | undefined} compare
 * @param {Realm} callerRealm
 * @returns {void}
 */
function insertSorted(sorted, value, compare, callerRealm) {
  let index = sorted.length;

  while (
    index > 0 &&
    compareArrayValues(sorted[index - 1], value, compare, callerRealm) > 0
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
 * @param {Realm} callerRealm
 * @returns {number}
 */
function compareArrayValues(left, right, compare, callerRealm) {
  if (compare !== undefined) {
    const result = toNumber(
      compare.callFunction(undefined, [left, right], callerRealm),
      callerRealm,
    );
    return Number.isNaN(result) ? 0 : result;
  }

  const leftString = toString(left, callerRealm);
  const rightString = toString(right, callerRealm);

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
