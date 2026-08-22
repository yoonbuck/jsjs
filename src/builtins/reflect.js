import { EngineArray } from '../runtime/array-object.js';
import { GuestErrorSignal } from '../runtime/completion.js';
import { EngineObject, defineOwnPropertyOrThrow } from '../runtime/object.js';
import { toPropertyKey } from '../runtime/conversion.js';
import {
  fromPropertyDescriptor,
  requireObjectReceiver,
  toPropertyDescriptor,
} from './shared.js';

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
    'defineProperty',
    3,
    (_this, args) => {
      const target = requireObjectReceiver(
        args[0],
        'Reflect.defineProperty requires an object',
      );
      const key = toPropertyKey(args[1], realm);
      const descriptor = toPropertyDescriptor(args[2]);
      return target.defineOwnProperty(key, descriptor);
    },
  );

  defineReflectMethod(
    realm,
    reflectObject,
    'deleteProperty',
    2,
    (_this, args) => {
      const target = requireObjectReceiver(
        args[0],
        'Reflect.deleteProperty requires an object',
      );
      return target.delete(toPropertyKey(args[1], realm));
    },
  );

  defineReflectMethod(
    realm,
    reflectObject,
    'getOwnPropertyDescriptor',
    2,
    (_this, args) => {
      const target = requireObjectReceiver(
        args[0],
        'Reflect.getOwnPropertyDescriptor requires an object',
      );
      return fromPropertyDescriptor(
        realm,
        target.getOwnProperty(toPropertyKey(args[1], realm)),
      );
    },
  );

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

  defineReflectMethod(realm, reflectObject, 'has', 2, (_this, args) => {
    const target = requireObjectReceiver(
      args[0],
      'Reflect.has requires an object',
    );
    return target.hasProperty(toPropertyKey(args[1], realm));
  });

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

  defineReflectMethod(
    realm,
    reflectObject,
    'setPrototypeOf',
    2,
    (_this, args) => {
      const target = requireObjectReceiver(
        args[0],
        'Reflect.setPrototypeOf requires an object',
      );
      const prototype = args[1];

      if (prototype !== null && !(prototype instanceof EngineObject)) {
        throw new GuestErrorSignal(
          'TypeError',
          'Reflect.setPrototypeOf prototype must be an object or null',
        );
      }

      return target.setPrototypeOf(prototype);
    },
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
