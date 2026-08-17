import { GuestErrorSignal, ThrowSignal } from '../runtime/completion.js';
import { toObject } from '../runtime/conversion.js';
import { isCallable, isConstructor } from '../runtime/descriptors.js';
import { getFunctionRealm } from '../runtime/function-realm.js';
import { EngineObject } from '../runtime/object.js';
import { isRealm } from '../runtime/realm.js';
import { getIterator } from '../runtime/iterator.js';
import {
  PromiseObject,
  createResolvingFunctions,
  newPromiseCapability,
  performPromiseAll,
  performPromiseRace,
  performPromiseThen,
  speciesConstructor,
} from '../runtime/promise.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 *
 * @typedef {{
 *   promisePrototype: EngineObject,
 *   promiseConstructor: import('./shared.js').NativeFunction,
 * }} PromiseIntrinsics
 */

/**
 * @param {Realm} realm
 * @returns {PromiseIntrinsics}
 */
export function createPromiseIntrinsics(realm) {
  const promisePrototype = new EngineObject(realm.intrinsics.objectPrototype);
  const promiseConstructor = realm.createNativeFunction({
    name: 'Promise',
    length: 1,
    prototype: promisePrototype,
    call() {
      throw new GuestErrorSignal(
        'TypeError',
        'Promise constructor cannot be invoked without new',
      );
    },
    construct(args, functionObject, newTarget) {
      const executor = args[0];
      if (!isCallable(executor)) {
        throw new GuestErrorSignal(
          'TypeError',
          'Promise executor is not callable',
        );
      }

      const promise = new PromiseObject(
        realm,
        prototypeFromNewTarget(newTarget, promisePrototype),
      );
      const resolvingFunctions = createResolvingFunctions(promise, realm);

      try {
        executor.callFunction(undefined, [
          resolvingFunctions.resolve,
          resolvingFunctions.reject,
        ]);
      } catch (error) {
        resolvingFunctions.reject.callFunction(undefined, [
          abruptValue(realm, error),
        ]);
      }

      return promise;
    },
  });

  promisePrototype.defineOwnProperty('constructor', {
    value: promiseConstructor,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  promisePrototype.defineOwnProperty(realm.agent.wellKnownSymbols.toStringTag, {
    value: 'Promise',
    writable: false,
    enumerable: false,
    configurable: true,
  });
  defineBuiltinMethod(
    promisePrototype,
    'then',
    realm.createNativeFunction({
      name: 'then',
      length: 2,
      call(thisValue, args) {
        if (!(thisValue instanceof PromiseObject)) {
          throw new GuestErrorSignal(
            'TypeError',
            'Promise.prototype.then called on an incompatible receiver',
          );
        }

        const constructor = speciesConstructor(
          thisValue,
          promiseConstructor,
          realm,
        );
        const resultCapability = newPromiseCapability(constructor, realm);
        return performPromiseThen(
          thisValue,
          args[0],
          args[1],
          resultCapability,
          realm,
        );
      },
    }),
  );
  defineBuiltinMethod(
    promisePrototype,
    'catch',
    realm.createNativeFunction({
      name: 'catch',
      length: 1,
      call(thisValue, args) {
        const then = toObject(realm, thisValue).get('then');
        if (!isCallable(then)) {
          throw new GuestErrorSignal(
            'TypeError',
            'Promise.prototype.catch receiver has a non-callable then',
          );
        }

        return then.callFunction(thisValue, [undefined, args[0]]);
      },
    }),
  );
  promiseConstructor.defineOwnProperty(realm.agent.wellKnownSymbols.species, {
    get: realm.createNativeFunction({
      name: 'get [Symbol.species]',
      length: 0,
      call(thisValue) {
        return thisValue;
      },
    }),
    enumerable: false,
    configurable: true,
  });
  defineBuiltinMethod(
    promiseConstructor,
    'resolve',
    realm.createNativeFunction({
      name: 'resolve',
      length: 1,
      call(thisValue, args) {
        if (!(thisValue instanceof EngineObject)) {
          throw new GuestErrorSignal(
            'TypeError',
            'Promise.resolve called on a non-constructor',
          );
        }

        const resolution = args[0];
        if (
          resolution instanceof PromiseObject &&
          resolution.get('constructor') === thisValue
        ) {
          return resolution;
        }

        const capability = newPromiseCapability(thisValue, realm);
        capability.resolve.callFunction(undefined, [resolution]);
        return capability.promise;
      },
    }),
  );
  defineBuiltinMethod(
    promiseConstructor,
    'reject',
    realm.createNativeFunction({
      name: 'reject',
      length: 1,
      call(thisValue, args) {
        if (!isConstructor(thisValue)) {
          throw new GuestErrorSignal(
            'TypeError',
            'Promise.reject called on a non-constructor',
          );
        }

        const capability = newPromiseCapability(thisValue, realm);
        capability.reject.callFunction(undefined, [args[0]]);
        return capability.promise;
      },
    }),
  );
  defineBuiltinMethod(
    promiseConstructor,
    'all',
    realm.createNativeFunction({
      name: 'all',
      length: 1,
      call(thisValue, args) {
        const resultCapability = newPromiseCapability(thisValue, realm);
        const constructor = /** @type {EngineObject} */ (thisValue);
        /** @type {import('../runtime/iterator.js').IteratorRecord} */
        let iteratorRecord;

        try {
          iteratorRecord = getIterator(realm, args[0]);
        } catch (error) {
          resultCapability.reject.callFunction(undefined, [
            abruptValue(realm, error),
          ]);
          return resultCapability.promise;
        }

        return performPromiseAll(
          iteratorRecord,
          constructor,
          resultCapability,
          realm,
        );
      },
    }),
  );
  defineBuiltinMethod(
    promiseConstructor,
    'race',
    realm.createNativeFunction({
      name: 'race',
      length: 1,
      call(thisValue, args) {
        const resultCapability = newPromiseCapability(thisValue, realm);
        const constructor = /** @type {EngineObject} */ (thisValue);
        /** @type {import('../runtime/iterator.js').IteratorRecord} */
        let iteratorRecord;

        try {
          iteratorRecord = getIterator(realm, args[0]);
        } catch (error) {
          resultCapability.reject.callFunction(undefined, [
            abruptValue(realm, error),
          ]);
          return resultCapability.promise;
        }

        return performPromiseRace(
          iteratorRecord,
          constructor,
          resultCapability,
          realm,
        );
      },
    }),
  );

  return { promisePrototype, promiseConstructor };
}

/**
 * @param {EngineObject} globalObject
 * @param {PromiseIntrinsics} intrinsics
 * @returns {void}
 */
export function installPromiseConstructor(globalObject, intrinsics) {
  globalObject.defineOwnProperty('Promise', {
    value: intrinsics.promiseConstructor,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * @param {unknown} newTarget
 * @param {EngineObject} defaultPrototype
 * @returns {EngineObject}
 */
function prototypeFromNewTarget(newTarget, defaultPrototype) {
  if (!(newTarget instanceof EngineObject)) {
    return defaultPrototype;
  }

  const prototype = newTarget.get('prototype');
  if (prototype instanceof EngineObject) {
    return prototype;
  }
  if (!isCallable(newTarget)) {
    return defaultPrototype;
  }

  const realmCompletion = getFunctionRealm(newTarget);
  if (realmCompletion.type === 'throw') {
    throw new ThrowSignal(realmCompletion.value);
  }
  if (!isRealm(realmCompletion.value)) {
    throw new GuestErrorSignal(
      'TypeError',
      'Promise newTarget Realm lookup did not return a Realm',
    );
  }

  return /** @type {EngineObject} */ (
    realmCompletion.value.intrinsics.promisePrototype
  );
}

/**
 * @param {Realm} realm
 * @param {unknown} error
 * @returns {unknown}
 */
function abruptValue(realm, error) {
  if (error instanceof ThrowSignal) {
    return error.value;
  }
  if (error instanceof GuestErrorSignal) {
    return realm.createGuestError(error.typeName, error.guestMessage);
  }

  throw error;
}

/**
 * @param {EngineObject} target
 * @param {string | symbol} name
 * @param {import('./shared.js').NativeFunction} method
 * @returns {void}
 */
function defineBuiltinMethod(target, name, method) {
  target.defineOwnProperty(name, {
    value: method,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
