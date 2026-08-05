import { EngineObject } from '../runtime/object.js';
import { toObject, toString } from '../runtime/conversion.js';
import { requireCallable } from './shared.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 */

/**
 * @param {Realm} realm
 * @returns {{ objectConstructor: import('./shared.js').NativeFunction }}
 */
export function createObjectIntrinsics(realm) {
  const { objectPrototype } = realm.intrinsics;

  /**
   * @param {readonly unknown[]} args
   * @returns {EngineObject}
   */
  function createObject(args) {
    const value = args[0];

    if (value === null || value === undefined) {
      return new EngineObject(objectPrototype);
    }

    return toObject(realm, value);
  }

  const objectConstructor = realm.createNativeFunction({
    name: 'Object',
    length: 1,
    prototype: objectPrototype,
    call(_thisValue, args) {
      return createObject(args);
    },
    construct(args) {
      return createObject(args);
    },
  });

  objectPrototype.defineOwnProperty('constructor', {
    value: objectConstructor,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  defineMethod(
    objectPrototype,
    'toString',
    realm.createNativeFunction({
      name: 'toString',
      length: 0,
      call(thisValue) {
        if (thisValue === undefined) {
          return '[object Undefined]';
        }

        if (thisValue === null) {
          return '[object Null]';
        }

        return `[object ${toObject(realm, thisValue).getClassName()}]`;
      },
    }),
  );
  defineMethod(
    objectPrototype,
    'toLocaleString',
    realm.createNativeFunction({
      name: 'toLocaleString',
      length: 0,
      call(thisValue) {
        const object = toObject(realm, thisValue);
        const method = requireCallable(
          object.get('toString'),
          'toString is not callable',
        );
        return method.callFunction(object, []);
      },
    }),
  );
  defineMethod(
    objectPrototype,
    'valueOf',
    realm.createNativeFunction({
      name: 'valueOf',
      length: 0,
      call(thisValue) {
        return toObject(realm, thisValue);
      },
    }),
  );
  defineMethod(
    objectPrototype,
    'hasOwnProperty',
    realm.createNativeFunction({
      name: 'hasOwnProperty',
      length: 1,
      call(thisValue, args) {
        return (
          toObject(realm, thisValue).getOwnProperty(toString(args[0])) !==
          undefined
        );
      },
    }),
  );
  defineMethod(
    objectPrototype,
    'isPrototypeOf',
    realm.createNativeFunction({
      name: 'isPrototypeOf',
      length: 1,
      call(thisValue, args) {
        const value = args[0];

        if (!(value instanceof EngineObject)) {
          return false;
        }

        const object = toObject(realm, thisValue);
        let current = value.getPrototype();

        while (current !== null) {
          if (current === object) {
            return true;
          }

          current = current.getPrototype();
        }

        return false;
      },
    }),
  );
  defineMethod(
    objectPrototype,
    'propertyIsEnumerable',
    realm.createNativeFunction({
      name: 'propertyIsEnumerable',
      length: 1,
      call(thisValue, args) {
        const descriptor = toObject(realm, thisValue).getOwnProperty(
          toString(args[0]),
        );
        return descriptor !== undefined && descriptor.enumerable === true;
      },
    }),
  );

  return { objectConstructor };
}

/**
 * @param {EngineObject} globalObject
 * @param {{ objectConstructor: import('./shared.js').NativeFunction }} intrinsics
 * @returns {void}
 */
export function installObjectConstructor(globalObject, intrinsics) {
  globalObject.defineOwnProperty('Object', {
    value: intrinsics.objectConstructor,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * @param {EngineObject} target
 * @param {string} name
 * @param {import('./shared.js').NativeFunction} method
 * @returns {void}
 */
function defineMethod(target, name, method) {
  target.defineOwnProperty(name, {
    value: method,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
