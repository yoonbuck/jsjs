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
 *   currentRealm: Realm,
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
 * @param {unknown} onFulfilled
 * @param {unknown} onRejected
 * @param {PromiseCapabilityRecord} resultCapability
 * @param {Realm} currentRealm
 * @returns {EngineObject}
 */
export function performPromiseThen(
  promise,
  onFulfilled,
  onRejected,
  resultCapability,
  currentRealm,
) {
  const fulfillReaction = {
    capability: resultCapability,
    type: /** @type {const} */ ('fulfill'),
    handler: isCallable(onFulfilled) ? onFulfilled : null,
    currentRealm,
  };
  const rejectReaction = {
    capability: resultCapability,
    type: /** @type {const} */ ('reject'),
    handler: isCallable(onRejected) ? onRejected : null,
    currentRealm,
  };

  if (promise.promiseState === 'pending') {
    promise.promiseFulfillReactions.push(fulfillReaction);
    promise.promiseRejectReactions.push(rejectReaction);
  } else if (promise.promiseState === 'fulfilled') {
    promise.realm.agent.enqueueJob(
      newPromiseReactionJob(
        fulfillReaction,
        promise.promiseResult,
        currentRealm,
      ),
    );
  } else {
    promise.realm.agent.enqueueJob(
      newPromiseReactionJob(
        rejectReaction,
        promise.promiseResult,
        currentRealm,
      ),
    );
  }

  if (promise.promiseState === 'rejected' && !promise.promiseIsHandled) {
    trackPromiseRejection(promise, 'handle');
  }
  promise.promiseIsHandled = true;

  return resultCapability.promise;
}

/**
 * @param {PromiseReactionRecord} reaction
 * @param {unknown} argument
 * @param {Realm} currentRealm
 * @returns {import('./jobs.js').JobRecord}
 */
export function newPromiseReactionJob(reaction, argument, currentRealm) {
  const jobRealm = getReactionJobRealm(reaction.handler, currentRealm);

  return {
    realm: jobRealm,
    arguments: [],
    kind: 'promise-reaction',
    callback() {
      /** @type {unknown} */
      let handlerResult;

      if (reaction.handler === null) {
        if (reaction.type === 'reject') {
          return callPromiseCapability(
            reaction.capability,
            'reject',
            argument,
            /** @type {Realm} */ (jobRealm ?? currentRealm),
          );
        }

        return callPromiseCapability(
          reaction.capability,
          'resolve',
          argument,
          /** @type {Realm} */ (jobRealm ?? currentRealm),
        );
      }

      try {
        handlerResult = reaction.handler.callFunction(undefined, [argument]);
      } catch (error) {
        return callPromiseCapability(
          reaction.capability,
          'reject',
          abruptValue(/** @type {Realm} */ (jobRealm), error),
          /** @type {Realm} */ (jobRealm),
        );
      }

      return callPromiseCapability(
        reaction.capability,
        'resolve',
        handlerResult,
        /** @type {Realm} */ (jobRealm),
      );
    },
  };
}

/**
 * @param {EngineObject} object
 * @param {unknown} defaultConstructor
 * @param {Realm} currentRealm
 * @returns {unknown}
 */
export function speciesConstructor(object, defaultConstructor, currentRealm) {
  const constructor = object.get('constructor');

  if (constructor === undefined) {
    return defaultConstructor;
  }
  if (!(constructor instanceof EngineObject)) {
    throw new GuestErrorSignal(
      'TypeError',
      'Promise constructor property is not an object',
    );
  }

  const species = constructor.get(currentRealm.agent.wellKnownSymbols.species);

  if (species === undefined || species === null) {
    return defaultConstructor;
  }
  if (!isConstructor(species)) {
    throw new GuestErrorSignal(
      'TypeError',
      'Promise species constructor is not a constructor',
    );
  }

  return species;
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
  promise.promiseFulfillReactions = [];
  promise.promiseRejectReactions = [];
  promise.promiseState = state;
  promise.promiseResult = result;

  triggerPromiseReactions(reactions, result);
  if (state === 'rejected' && !promise.promiseIsHandled) {
    trackPromiseRejection(promise, 'reject');
  }
}

/**
 * @param {PromiseReactionRecord[]} reactions
 * @param {unknown} argument
 * @returns {void}
 */
function triggerPromiseReactions(reactions, argument) {
  let didThrow = false;
  /** @type {unknown} */
  let firstError;

  for (const reaction of reactions) {
    try {
      reaction.currentRealm.agent.enqueueJob(
        newPromiseReactionJob(reaction, argument, reaction.currentRealm),
      );
    } catch (error) {
      if (!didThrow) {
        didThrow = true;
        firstError = error;
      }
    }
  }

  if (didThrow) {
    throw firstError;
  }
}

/**
 * @param {CallableLike | null} handler
 * @param {Realm} currentRealm
 * @returns {Realm | null}
 */
function getReactionJobRealm(handler, currentRealm) {
  if (handler === null) {
    return null;
  }

  const realmCompletion = getFunctionRealm(handler);
  if (realmCompletion.type === 'normal' && isRealm(realmCompletion.value)) {
    return realmCompletion.value;
  }

  return currentRealm;
}

/**
 * @param {PromiseCapabilityRecord | null} capability
 * @param {'resolve' | 'reject'} operation
 * @param {unknown} value
 * @param {Realm} realm
 * @returns {{ type: 'normal' | 'throw', value: unknown }}
 */
function callPromiseCapability(capability, operation, value, realm) {
  if (capability === null) {
    return createNormalCompletion(undefined);
  }

  try {
    capability[operation].callFunction(undefined, [value]);
    return createNormalCompletion(undefined);
  } catch (error) {
    return { type: 'throw', value: abruptValue(realm, error) };
  }
}

/**
 * @param {PromiseObject} promise
 * @param {'reject' | 'handle'} operation
 * @returns {void}
 */
function trackPromiseRejection(promise, operation) {
  const tracker = promise.realm.agent.jobHost?.promiseRejectionTracker;
  if (tracker === undefined) {
    return;
  }

  try {
    tracker(promise, operation);
  } catch (error) {
    promise.realm.agent.recordHostHookFailure(error);
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
