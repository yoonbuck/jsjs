import { GuestErrorSignal, ThrowSignal } from '../runtime/completion.js';
import { isCallable } from '../runtime/descriptors.js';
import { EngineObject } from '../runtime/object.js';
import {
  PromiseObject,
  createResolvingFunctions,
  rejectPromise,
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
        rejectPromise(promise, abruptValue(realm, error));
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
  return prototype instanceof EngineObject ? prototype : defaultPrototype;
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
