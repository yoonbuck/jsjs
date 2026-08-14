import {
  GuestErrorSignal,
  ThrowSignal,
  createNormalCompletion,
} from './completion.js';
import { isCallable, isConstructor } from './descriptors.js';
import { getFunctionRealm } from './function-realm.js';
import { EngineObject } from './object.js';
import { isRealm } from './realm.js';

/**
 * @typedef {import('./descriptors.js').CallableLike} CallableLike
 * @typedef {import('./realm.js').Realm} Realm
 *
 * @typedef {{
 *   capability: PromiseCapabilityRecord | null,
 *   type: 'fulfill' | 'reject',
 *   handler: CallableLike | null,
 * }} PromiseReactionRecord
 *
 * @typedef {{
 *   promise: EngineObject,
 *   resolve: CallableLike,
 *   reject: CallableLike,
 * }} PromiseCapabilityRecord
 */

export class PromiseObject extends EngineObject {
  /**
   * @param {Realm} realm
   * @param {EngineObject | null} prototype
   */
  constructor(realm, prototype) {
    super(prototype);
    this.realm = realm;
    /** @type {'pending' | 'fulfilled' | 'rejected'} */
    this.promiseState = 'pending';
    /** @type {unknown} */
    this.promiseResult = undefined;
    /** @type {PromiseReactionRecord[]} */
    this.promiseFulfillReactions = [];
    /** @type {PromiseReactionRecord[]} */
    this.promiseRejectReactions = [];
    this.promiseIsHandled = false;
    /** @type {PromiseObject[]} */
    this.promiseAdoptionTargets = [];
  }
}

/**
 * @param {unknown} constructor
 * @param {Realm} currentRealm
 * @returns {PromiseCapabilityRecord}
 */
export function newPromiseCapability(constructor, currentRealm) {
  if (!isConstructor(constructor)) {
    throw new GuestErrorSignal(
      'TypeError',
      'Promise capability constructor is not a constructor',
    );
  }

  /** @type {CallableLike | undefined} */
  let resolve;
  /** @type {CallableLike | undefined} */
  let reject;
  const executor = currentRealm.createNativeFunction({
    name: '',
    length: 2,
    call(_thisValue, args) {
      if (resolve !== undefined || reject !== undefined) {
        throw new GuestErrorSignal(
          'TypeError',
          'Promise capability executor already invoked',
        );
      }

      resolve = /** @type {CallableLike} */ (args[0]);
      reject = /** @type {CallableLike} */ (args[1]);
      return undefined;
    },
  });
  const promise = constructor.constructFunction([executor]);

  if (!(promise instanceof EngineObject)) {
    throw new GuestErrorSignal(
      'TypeError',
      'Promise capability constructor did not return an object',
    );
  }
  if (!isCallable(resolve) || !isCallable(reject)) {
    throw new GuestErrorSignal(
      'TypeError',
      'Promise capability executor did not provide callable resolving functions',
    );
  }

  return { promise, resolve, reject };
}

/**
 * @param {PromiseObject} promise
 * @param {Realm} currentRealm
 * @returns {{ resolve: CallableLike, reject: CallableLike }}
 */
export function createResolvingFunctions(promise, currentRealm) {
  const alreadyResolved = { value: false };
  const resolve = currentRealm.createNativeFunction({
    name: '',
    length: 1,
    call(_thisValue, args) {
      if (alreadyResolved.value) {
        return undefined;
      }
      alreadyResolved.value = true;

      const resolution = args[0];
      if (resolution === promise) {
        rejectPromise(
          promise,
          currentRealm.createGuestError(
            'TypeError',
            'Cannot resolve a Promise with itself',
          ),
        );
        return undefined;
      }

      if (!(resolution instanceof EngineObject)) {
        fulfillPromise(promise, resolution);
        return undefined;
      }

      /** @type {unknown} */
      let then;
      try {
        then = resolution.get('then');
      } catch (error) {
        rejectPromise(promise, abruptValue(currentRealm, error));
        return undefined;
      }

      if (hasMissingPromiseThen(resolution, then)) {
        adoptPromise(promise, resolution);
        return undefined;
      }

      if (!isCallable(then)) {
        fulfillPromise(promise, resolution);
        return undefined;
      }

      promise.realm.agent.enqueueJob(
        newPromiseResolveThenableJob(promise, resolution, then, currentRealm),
      );
      return undefined;
    },
  });
  const reject = currentRealm.createNativeFunction({
    name: '',
    length: 1,
    call(_thisValue, args) {
      if (alreadyResolved.value) {
        return undefined;
      }
      alreadyResolved.value = true;
      rejectPromise(promise, args[0]);
      return undefined;
    },
  });

  return { resolve, reject };
}

/**
 * @param {PromiseObject} promise
 * @param {unknown} value
 * @returns {void}
 */
export function fulfillPromise(promise, value) {
  settlePromise(promise, 'fulfilled', value);
}

/**
 * @param {PromiseObject} promise
 * @param {unknown} reason
 * @returns {void}
 */
export function rejectPromise(promise, reason) {
  settlePromise(promise, 'rejected', reason);
}

/**
 * @param {PromiseObject} promise
 * @param {EngineObject} thenable
 * @param {CallableLike} then
 * @param {Realm} [currentRealm]
 * @returns {import('./jobs.js').JobRecord}
 */
export function newPromiseResolveThenableJob(
  promise,
  thenable,
  then,
  currentRealm = promise.realm,
) {
  const jobRealm = getThenableJobRealm(then, currentRealm);

  return {
    realm: /** @type {Realm} */ (jobRealm),
    arguments: [],
    kind: 'promise-resolve-thenable',
    callback() {
      const resolvingFunctions = createResolvingFunctions(
        promise,
        /** @type {Realm} */ (jobRealm),
      );

      try {
        then.callFunction(thenable, [
          resolvingFunctions.resolve,
          resolvingFunctions.reject,
        ]);
      } catch (error) {
        resolvingFunctions.reject.callFunction(undefined, [
          abruptValue(/** @type {Realm} */ (jobRealm), error),
        ]);
      }

      return createNormalCompletion(undefined);
    },
  };
}

/**
 * A normal GetFunctionRealm completion is only successful when it carries an
 * actual Realm. A malformed internal callable exotic falls back to the
 * resolving function's captured Realm instead of creating a null-Realm job.
 *
 * @param {CallableLike} then
 * @param {Realm} currentRealm
 * @returns {Realm}
 */
function getThenableJobRealm(then, currentRealm) {
  const realmCompletion = getFunctionRealm(then);
  if (realmCompletion.type === 'normal' && isRealm(realmCompletion.value)) {
    return realmCompletion.value;
  }

  return currentRealm;
}

/**
 * Task 4 installs Promise.prototype.then. Until then, guest Promise objects
 * need this bridge to preserve Promise adoption. Ordinary Get happens first,
 * so any own or inherited then property keeps its standard thenable behavior;
 * installing the intrinsic naturally makes the bridge condition false.
 *
 * @param {EngineObject} resolution
 * @param {unknown} then
 * @returns {resolution is PromiseObject}
 */
function hasMissingPromiseThen(resolution, then) {
  return (
    resolution instanceof PromiseObject &&
    then === undefined &&
    resolution.getProperty('then') === undefined &&
    resolution.realm.intrinsics.promisePrototype instanceof EngineObject &&
    resolution.realm.intrinsics.promisePrototype.getOwnProperty('then') ===
      undefined
  );
}

/**
 * @param {PromiseObject} target
 * @param {PromiseObject} source
 * @returns {void}
 */
function adoptPromise(target, source) {
  if (source.promiseState === 'pending') {
    source.promiseAdoptionTargets.push(target);
    return;
  }

  if (source.promiseState === 'fulfilled') {
    fulfillPromise(target, source.promiseResult);
    return;
  }

  rejectPromise(target, source.promiseResult);
}

/**
 * @param {PromiseObject} promise
 * @param {'fulfilled' | 'rejected'} state
 * @param {unknown} result
 * @returns {void}
 */
function settlePromise(promise, state, result) {
  if (promise.promiseState !== 'pending') {
    return;
  }

  const reactions =
    state === 'fulfilled'
      ? promise.promiseFulfillReactions
      : promise.promiseRejectReactions;
  const adoptionTargets = promise.promiseAdoptionTargets;
  promise.promiseFulfillReactions = [];
  promise.promiseRejectReactions = [];
  promise.promiseAdoptionTargets = [];
  promise.promiseState = state;
  promise.promiseResult = result;

  // Promise reaction registration is added with Promise.prototype.then. The
  // lists still clear here so settling preserves the one-way slot invariant.
  void reactions;

  for (const target of adoptionTargets) {
    if (state === 'fulfilled') {
      fulfillPromise(target, result);
    } else {
      rejectPromise(target, result);
    }
  }
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
