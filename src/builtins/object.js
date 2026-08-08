import { EngineObject } from '../runtime/object.js';
import { EngineArray } from '../runtime/array-object.js';
import { GuestErrorSignal } from '../runtime/completion.js';
import { isDataDescriptor } from '../runtime/descriptors.js';
import { toObject, toPropertyKey } from '../runtime/conversion.js';
import { WELL_KNOWN_SYMBOLS } from '../runtime/symbol.js';
import {
  fromPropertyDescriptor,
  requireCallable,
  requireObjectReceiver,
  toPropertyDescriptor,
} from './shared.js';

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

        const object = toObject(realm, thisValue);
        // ES2015 19.1.3.6 steps 15-16 layered onto ES5.1 15.2.4.2's
        // [[Class]] tag: an own or inherited `@@toStringTag` wins, but only
        // when it is a String, so every ES5 tag is unchanged (no ES5 object
        // carries the property) and a non-string tag falls back rather than
        // being coerced.
        const tag = object.get(WELL_KNOWN_SYMBOLS.toStringTag);

        return `[object ${typeof tag === 'string' ? tag : object.getClassName()}]`;
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
        // ES5.1 15.2.4.5 steps 1-2 (ES2015 19.1.3.2 steps 1-2): the key
        // coercion runs before ToObject(this), so a throwing V-coercion must
        // pre-empt a throwing/absent `this`. ES2015 replaced ToString with
        // ToPropertyKey so a symbol key is looked up by identity.
        const propertyKey = toPropertyKey(args[0]);
        return (
          toObject(realm, thisValue).getOwnProperty(propertyKey) !== undefined
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
        // ES5.1 15.2.4.7 steps 1-2 (ES2015 19.1.3.4 steps 1-2): P is derived
        // from V before O = ToObject(this), so a throwing V-coercion must
        // pre-empt a throwing/absent `this` (e.g. a bare, unbound call).
        const propertyKey = toPropertyKey(args[0]);
        const descriptor = toObject(realm, thisValue).getOwnProperty(
          propertyKey,
        );
        return descriptor !== undefined && descriptor.enumerable === true;
      },
    }),
  );
  installObjectReflectionMethods(realm, objectConstructor);

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

/**
 * @param {Realm} realm
 * @param {import('./shared.js').NativeFunction} objectConstructor
 * @returns {void}
 */
function installObjectReflectionMethods(realm, objectConstructor) {
  defineNativeMethod(
    realm,
    objectConstructor,
    'getPrototypeOf',
    1,
    (_this, args) => requireObjectArgument(args[0]).getPrototype(),
  );
  defineNativeMethod(
    realm,
    objectConstructor,
    'setPrototypeOf',
    2,
    (_this, args) => {
      const target = args[0];
      const proto = args[1];

      if (target === null || target === undefined) {
        throw new GuestErrorSignal(
          'TypeError',
          'Cannot convert undefined or null to object',
        );
      }

      if (proto !== null && !(proto instanceof EngineObject)) {
        throw new GuestErrorSignal(
          'TypeError',
          'Object prototype may only be an object or null',
        );
      }

      if (!(target instanceof EngineObject)) {
        return target;
      }

      if (!target.setPrototypeOf(proto)) {
        throw new GuestErrorSignal(
          'TypeError',
          'Object.setPrototypeOf could not set the requested prototype',
        );
      }

      return target;
    },
  );
  defineNativeMethod(realm, objectConstructor, 'is', 2, (_this, args) =>
    Object.is(args[0], args[1]),
  );
  defineNativeMethod(
    realm,
    objectConstructor,
    'getOwnPropertyDescriptor',
    2,
    (_this, args) =>
      fromPropertyDescriptor(
        realm,
        requireObjectArgument(args[0]).getOwnProperty(toPropertyKey(args[1])),
      ),
  );
  defineNativeMethod(
    realm,
    objectConstructor,
    'getOwnPropertyNames',
    1,
    (_this, args) =>
      createArrayFromList(
        realm,
        requireObjectArgument(args[0])
          .ownPropertyKeys()
          .filter((key) => typeof key === 'string'),
      ),
  );
  // ES2015 19.1.2.8. The string/symbol split is the whole point of the two
  // methods: `getOwnPropertyNames` keeps ES5.1's string-only answer and this
  // one reports exactly the keys that answer now omits, each in the same
  // own-key order.
  defineNativeMethod(
    realm,
    objectConstructor,
    'getOwnPropertySymbols',
    1,
    (_this, args) =>
      createArrayFromList(
        realm,
        toObject(realm, args[0])
          .ownPropertyKeys()
          .filter((key) => typeof key === 'symbol'),
      ),
  );
  defineNativeMethod(realm, objectConstructor, 'create', 2, (_this, args) => {
    const prototype = args[0];

    if (prototype !== null && !(prototype instanceof EngineObject)) {
      throw new GuestErrorSignal(
        'TypeError',
        'Object prototype may only be an object or null',
      );
    }

    const object = new EngineObject(prototype);

    if (args.length > 1 && args[1] !== undefined) {
      defineProperties(realm, object, args[1]);
    }

    return object;
  });
  defineNativeMethod(
    realm,
    objectConstructor,
    'defineProperty',
    3,
    (_this, args) => {
      const object = requireObjectArgument(args[0]);
      const name = toPropertyKey(args[1]);
      const descriptor = toPropertyDescriptor(args[2]);
      object.defineOwnProperty(name, descriptor, true);
      return object;
    },
  );
  defineNativeMethod(
    realm,
    objectConstructor,
    'defineProperties',
    2,
    (_this, args) =>
      defineProperties(realm, requireObjectArgument(args[0]), args[1]),
  );
  defineNativeMethod(realm, objectConstructor, 'seal', 1, (_this, args) => {
    const object = requireObjectArgument(args[0]);

    for (const name of object.ownPropertyKeys()) {
      object.defineOwnProperty(name, { configurable: false }, true);
    }

    object.preventExtensions();
    return object;
  });
  defineNativeMethod(realm, objectConstructor, 'freeze', 1, (_this, args) => {
    const object = requireObjectArgument(args[0]);

    for (const name of object.ownPropertyKeys()) {
      const descriptor = object.getOwnProperty(name);
      object.defineOwnProperty(
        name,
        isDataDescriptor(descriptor)
          ? { writable: false, configurable: false }
          : { configurable: false },
        true,
      );
    }

    object.preventExtensions();
    return object;
  });
  defineNativeMethod(
    realm,
    objectConstructor,
    'preventExtensions',
    1,
    (_this, args) => requireObjectArgument(args[0]).preventExtensions(),
  );
  defineNativeMethod(realm, objectConstructor, 'isSealed', 1, (_this, args) => {
    const object = requireObjectArgument(args[0]);

    if (object.isExtensible()) {
      return false;
    }

    for (const name of object.ownPropertyKeys()) {
      if (object.getOwnProperty(name)?.configurable !== false) {
        return false;
      }
    }

    return true;
  });
  defineNativeMethod(realm, objectConstructor, 'isFrozen', 1, (_this, args) => {
    const object = requireObjectArgument(args[0]);

    if (object.isExtensible()) {
      return false;
    }

    for (const name of object.ownPropertyKeys()) {
      const descriptor = object.getOwnProperty(name);

      if (
        descriptor?.configurable !== false ||
        (isDataDescriptor(descriptor) && descriptor.writable !== false)
      ) {
        return false;
      }
    }

    return true;
  });
  defineNativeMethod(
    realm,
    objectConstructor,
    'isExtensible',
    1,
    (_this, args) => requireObjectArgument(args[0]).isExtensible(),
  );
  defineNativeMethod(realm, objectConstructor, 'keys', 1, (_this, args) => {
    const object = requireObjectArgument(args[0]);
    const names = [];

    for (const name of object.ownPropertyKeys()) {
      // ES2015 19.1.2.14 keeps `Object.keys` string-only: symbol keys are
      // reported by `getOwnPropertySymbols` alone.
      if (
        typeof name === 'string' &&
        object.getOwnProperty(name)?.enumerable === true
      ) {
        names.push(name);
      }
    }

    return createArrayFromList(realm, names);
  });
}

/**
 * @param {Realm} realm
 * @param {EngineObject} object
 * @param {unknown} propertiesValue
 * @returns {EngineObject}
 */
function defineProperties(realm, object, propertiesValue) {
  const properties = toObject(realm, propertiesValue);
  /** @type {{ name: string | symbol, descriptor: import('../runtime/descriptors.js').PropertyDescriptorRecord }[]} */
  const definitions = [];

  for (const name of properties.ownPropertyKeys()) {
    if (properties.getOwnProperty(name)?.enumerable !== true) {
      continue;
    }

    definitions.push({
      name,
      descriptor: toPropertyDescriptor(properties.get(name)),
    });
  }

  for (const { name, descriptor } of definitions) {
    object.defineOwnProperty(name, descriptor, true);
  }

  return object;
}

/**
 * @param {Realm} realm
 * @param {readonly (string | symbol)[]} values
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
 * @param {unknown} value
 * @returns {EngineObject}
 */
function requireObjectArgument(value) {
  return requireObjectReceiver(value, 'Object method requires an object');
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
  defineMethod(
    target,
    name,
    realm.createNativeFunction({ name, length, call }),
  );
}
