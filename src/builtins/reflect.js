import { EngineArray } from '../runtime/array-object.js';
import { EngineObject, defineOwnPropertyOrThrow } from '../runtime/object.js';
import { requireObjectReceiver } from './shared.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 */

/**
 * @param {Realm} realm
 * @param {EngineObject} target
 * @param {string} name
 * @param {number} length
 * @param {import('./shared.js').NativeFunctionOptions['call']} call
 * @returns {void}
 */
function defineReflectMethod(realm, target, name, length, call) {
  target.defineOwnProperty(name, {
    value: realm.createNativeFunction({ name, length, call }),
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * @param {Realm} realm
 * @param {readonly unknown[]} values
 * @returns {EngineArray}
 */
function createArrayFromList(realm, values) {
  const result = new EngineArray(realm.intrinsics.arrayPrototype);

  for (let index = 0; index < values.length; index += 1) {
    defineOwnPropertyOrThrow(result, String(index), {
      value: values[index],
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  return result;
}

/**
 * @param {Realm} realm
 * @returns {{ reflectObject: EngineObject }}
 */
export function createReflectIntrinsics(realm) {
  const reflectObject = new EngineObject(realm.intrinsics.objectPrototype);

  reflectObject.defineOwnProperty(realm.agent.wellKnownSymbols.toStringTag, {
    value: 'Reflect',
    writable: false,
    enumerable: false,
    configurable: true,
  });

  defineReflectMethod(
    realm,
    reflectObject,
    'getPrototypeOf',
    1,
    (_this, args) =>
      requireObjectReceiver(
        args[0],
        'Reflect.getPrototypeOf requires an object',
      ).getPrototypeOf(),
  );

  defineReflectMethod(realm, reflectObject, 'isExtensible', 1, (_this, args) =>
    requireObjectReceiver(
      args[0],
      'Reflect.isExtensible requires an object',
    ).isExtensible(),
  );

  defineReflectMethod(realm, reflectObject, 'ownKeys', 1, (_this, args) =>
    createArrayFromList(
      realm,
      requireObjectReceiver(
        args[0],
        'Reflect.ownKeys requires an object',
      ).ownPropertyKeys(),
    ),
  );

  defineReflectMethod(
    realm,
    reflectObject,
    'preventExtensions',
    1,
    (_this, args) =>
      requireObjectReceiver(
        args[0],
        'Reflect.preventExtensions requires an object',
      ).preventExtensions(),
  );

  return { reflectObject };
}

/**
 * @param {EngineObject} globalObject
 * @param {{ reflectObject: EngineObject }} intrinsics
 * @returns {void}
 */
export function installReflectObject(globalObject, intrinsics) {
  globalObject.defineOwnProperty('Reflect', {
    value: intrinsics.reflectObject,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
