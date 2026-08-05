import { EngineArray } from '../runtime/array-object.js';
import { EngineObject } from '../runtime/object.js';

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
