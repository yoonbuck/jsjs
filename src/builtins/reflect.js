import { EngineArray } from '../runtime/array-object.js';
import { EngineObject, defineOwnPropertyOrThrow } from '../runtime/object.js';
import { requireObjectReceiver } from './shared.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 */

/**
 * @param {Realm} realm
 * @returns {{ reflectObject: EngineObject }}
 */
export function createReflectIntrinsics(realm) {
  const reflectObject = new EngineObject(realm.intrinsics.objectPrototype);
  const ownKeys = realm.createNativeFunction({
    name: 'ownKeys',
    length: 1,
    call(_thisValue, args) {
      const target = requireObjectReceiver(
        args[0],
        'Reflect.ownKeys requires an object',
      );
      const keys = target.ownPropertyKeys();
      const result = new EngineArray(realm.intrinsics.arrayPrototype);

      for (let index = 0; index < keys.length; index += 1) {
        defineOwnPropertyOrThrow(result, String(index), {
          value: keys[index],
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }

      return result;
    },
  });

  reflectObject.defineOwnProperty('ownKeys', {
    value: ownKeys,
    writable: true,
    enumerable: false,
    configurable: true,
  });

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
