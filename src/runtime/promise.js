import {
  GuestErrorSignal,
  ThrowSignal,
  createNormalCompletion,
} from './completion.js';
import { callCallable, constructCallable } from './capabilities.js';
import { isCallable, isConstructor } from './descriptors.js';
import { getFunctionRealm } from './function-realm.js';
import { EngineArray } from './array-object.js';
import { toObject } from './conversion.js';
import { EngineObject } from './object.js';
import { iteratorClose, iteratorStep, iteratorValue } from './iterator.js';
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
    super(prototype, 'Object', realm.agent);
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
    this.promiseRejectionHandleReported = false;
    this.promiseReactionEnqueueInProgress = false;
    /** @type {import('./jobs.js').JobRecord[]} */
    this.promiseReactionJobs = [];
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
  const promise = constructCallable(
    constructor,
    [executor],
    constructor,
    currentRealm,
  );

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
 * ECMA-262 §25.4.4.1.1 `PerformPromiseAll`, using the ES2015 form that
 * observes and invokes `C.resolve` once for each iterated value.
 *
 * @param {import('./iterator.js').IteratorRecord} iteratorRecord
 * @param {EngineObject} constructor
 * @param {PromiseCapabilityRecord} resultCapability
 * @param {Realm} currentRealm
 * @returns {EngineObject}
 */
export function performPromiseAll(
  iteratorRecord,
  constructor,
  resultCapability,
  currentRealm,
) {
  const values = new EngineArray(currentRealm.intrinsics.arrayPrototype);
  const remainingElementsCount = { value: 1 };
  let index = 0;

  while (true) {
    /** @type {EngineObject | false} */
    let next;
    try {
      next = iteratorStep(iteratorRecord);
    } catch (error) {
      return rejectPromiseCapability(currentRealm, resultCapability, error);
    }

    if (next === false) {
      remainingElementsCount.value -= 1;
      if (remainingElementsCount.value === 0) {
        resolvePromiseAllCapability(resultCapability, values, currentRealm);
      }
      return resultCapability.promise;
    }

    /** @type {unknown} */
    let nextValue;
    try {
      nextValue = iteratorValue(next, currentRealm);
    } catch (error) {
      return rejectPromiseCapability(currentRealm, resultCapability, error);
    }

    values.defineOwnProperty(String(index), {
      value: undefined,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    const resolveElement = createPromiseAllResolveElementFunction(
      index,
      values,
      resultCapability,
      remainingElementsCount,
      currentRealm,
    );
    remainingElementsCount.value += 1;

    try {
      const nextPromise = promiseResolve(constructor, nextValue, currentRealm);
      invokeThen(
        currentRealm,
        nextPromise,
        resolveElement,
        resultCapability.reject,
      );
    } catch (error) {
      return rejectAfterIteratorClose(
        currentRealm,
        iteratorRecord,
        resultCapability,
        error,
      );
    }

    index += 1;
  }
}

/**
 * ECMA-262 §25.4.4.3.1 `PerformPromiseRace`, using the ES2015 form that
 * observes and invokes `C.resolve` once for each iterated value.
 *
 * @param {import('./iterator.js').IteratorRecord} iteratorRecord
 * @param {EngineObject} constructor
 * @param {PromiseCapabilityRecord} resultCapability
 * @param {Realm} currentRealm
 * @returns {EngineObject}
 */
export function performPromiseRace(
  iteratorRecord,
  constructor,
  resultCapability,
  currentRealm,
) {
  while (true) {
    /** @type {EngineObject | false} */
    let next;
    try {
      next = iteratorStep(iteratorRecord);
    } catch (error) {
      return rejectPromiseCapability(currentRealm, resultCapability, error);
    }

    if (next === false) {
      return resultCapability.promise;
    }

    /** @type {unknown} */
    let nextValue;
    try {
      nextValue = iteratorValue(next, currentRealm);
    } catch (error) {
      return rejectPromiseCapability(currentRealm, resultCapability, error);
    }

    try {
      const nextPromise = promiseResolve(constructor, nextValue, currentRealm);
      invokeThen(
        currentRealm,
        nextPromise,
        resultCapability.resolve,
        resultCapability.reject,
      );
    } catch (error) {
      return rejectAfterIteratorClose(
        currentRealm,
        iteratorRecord,
        resultCapability,
        error,
      );
    }
  }
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
  };
  const rejectReaction = {
    capability: resultCapability,
    type: /** @type {const} */ ('reject'),
    handler: isCallable(onRejected) ? onRejected : null,
  };

  if (promise.promiseState === 'pending') {
    promise.promiseFulfillReactions.push(fulfillReaction);
    promise.promiseRejectReactions.push(rejectReaction);
    markPromiseHandled(promise);
  } else if (promise.promiseState === 'fulfilled') {
    enqueuePromiseJob(
      promise.realm.agent,
      newPromiseReactionJob(
        fulfillReaction,
        promise.promiseResult,
        currentRealm,
      ),
    );
    markPromiseHandled(promise);
  } else {
    enqueueRejectedPromiseReaction(
      promise,
      rejectReaction,
      promise.promiseResult,
      currentRealm,
    );
  }

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
        handlerResult = callCallable(
          reaction.handler,
          undefined,
          [argument],
          /** @type {Realm} */ (jobRealm ?? currentRealm),
        );
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
  const constructor = object.get('constructor', object);

  if (constructor === undefined) {
    return defaultConstructor;
  }
  if (!(constructor instanceof EngineObject)) {
    throw new GuestErrorSignal(
      'TypeError',
      'Promise constructor property is not an object',
    );
  }

  const constructorAgent = constructor.agent;
  if (constructorAgent === null) {
    throw new GuestErrorSignal(
      'TypeError',
      'Promise constructor object has no owning Agent',
    );
  }

  const species = constructor.getWellKnownSymbol('species', currentRealm);

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
          currentRealm,
        );
        return undefined;
      }

      if (!(resolution instanceof EngineObject)) {
        fulfillPromise(promise, resolution, currentRealm);
        return undefined;
      }

      /** @type {unknown} */
      let then;
      try {
        then = resolution.get('then', resolution);
      } catch (error) {
        rejectPromise(promise, abruptValue(currentRealm, error), currentRealm);
        return undefined;
      }

      if (!isCallable(then)) {
        fulfillPromise(promise, resolution, currentRealm);
        return undefined;
      }

      enqueuePromiseJob(
        promise.realm.agent,
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
      rejectPromise(promise, args[0], currentRealm);
      return undefined;
    },
  });

  return { resolve, reject };
}

/**
 * @param {number} index
 * @param {EngineArray} values
 * @param {PromiseCapabilityRecord} resultCapability
 * @param {{ value: number }} remainingElementsCount
 * @param {Realm} currentRealm
 * @returns {CallableLike}
 */
function createPromiseAllResolveElementFunction(
  index,
  values,
  resultCapability,
  remainingElementsCount,
  currentRealm,
) {
  const alreadyCalled = { value: false };

  return currentRealm.createNativeFunction({
    name: '',
    length: 1,
    call(_thisValue, args) {
      if (alreadyCalled.value) {
        return undefined;
      }
      alreadyCalled.value = true;

      values.defineOwnProperty(String(index), {
        value: args[0],
        writable: true,
        enumerable: true,
        configurable: true,
      });
      remainingElementsCount.value -= 1;

      if (remainingElementsCount.value === 0) {
        callCallable(
          resultCapability.resolve,
          undefined,
          [values],
          currentRealm,
        );
      }

      return undefined;
    },
  });
}

/**
 * `PerformPromiseAll` turns an abrupt final capability resolve into exactly one
 * rejection of that capability. Its callers have already finished iteration, so
 * this deliberately does not use `IteratorClose`.
 *
 * @param {PromiseCapabilityRecord} resultCapability
 * @param {EngineArray} values
 * @param {Realm} currentRealm
 * @returns {void}
 */
function resolvePromiseAllCapability(resultCapability, values, currentRealm) {
  try {
    callCallable(resultCapability.resolve, undefined, [values], currentRealm);
  } catch (error) {
    callCallable(
      resultCapability.reject,
      undefined,
      [abruptValue(currentRealm, error)],
      currentRealm,
    );
  }
}

/**
 * ES2015's `Invoke(C, "resolve", « value »)`, deliberately kept inside the
 * iteration loop so an accessor is observed for every source value.
 *
 * @param {EngineObject} constructor
 * @param {unknown} value
 * @param {Realm} currentRealm
 * @returns {unknown}
 */
function promiseResolve(constructor, value, currentRealm) {
  const resolve = constructor.get('resolve', constructor);

  if (!isCallable(resolve)) {
    throw new GuestErrorSignal(
      'TypeError',
      'Promise resolve method is not callable',
    );
  }

  return callCallable(resolve, constructor, [value], currentRealm);
}

/**
 * @param {Realm} currentRealm
 * @param {unknown} promise
 * @param {CallableLike} onFulfilled
 * @param {CallableLike} onRejected
 * @returns {unknown}
 */
function invokeThen(currentRealm, promise, onFulfilled, onRejected) {
  const promiseObject = toObject(currentRealm, promise);
  const then = promiseObject.get('then', promise);

  if (!isCallable(then)) {
    throw new GuestErrorSignal(
      'TypeError',
      'Promise then method is not callable',
    );
  }

  return callCallable(then, promise, [onFulfilled, onRejected], currentRealm);
}

/**
 * @param {Realm} currentRealm
 * @param {import('./iterator.js').IteratorRecord} iteratorRecord
 * @param {PromiseCapabilityRecord} resultCapability
 * @param {unknown} error
 * @returns {EngineObject}
 */
function rejectAfterIteratorClose(
  currentRealm,
  iteratorRecord,
  resultCapability,
  error,
) {
  iteratorClose(currentRealm, iteratorRecord, true);
  return rejectPromiseCapability(currentRealm, resultCapability, error);
}

/**
 * @param {Realm} currentRealm
 * @param {PromiseCapabilityRecord} resultCapability
 * @param {unknown} error
 * @returns {EngineObject}
 */
function rejectPromiseCapability(currentRealm, resultCapability, error) {
  callCallable(
    resultCapability.reject,
    undefined,
    [abruptValue(currentRealm, error)],
    currentRealm,
  );
  return resultCapability.promise;
}

/**
 * @param {PromiseObject} promise
 * @param {unknown} value
 * @param {Realm} [currentRealm]
 * @returns {void}
 */
export function fulfillPromise(promise, value, currentRealm = promise.realm) {
  settlePromise(promise, 'fulfilled', value, currentRealm);
}

/**
 * @param {PromiseObject} promise
 * @param {unknown} reason
 * @param {Realm} [currentRealm]
 * @returns {void}
 */
export function rejectPromise(promise, reason, currentRealm = promise.realm) {
  settlePromise(promise, 'rejected', reason, currentRealm);
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
        callCallable(
          then,
          thenable,
          [resolvingFunctions.resolve, resolvingFunctions.reject],
          /** @type {Realm} */ (jobRealm),
        );
      } catch (error) {
        callCallable(
          resolvingFunctions.reject,
          undefined,
          [abruptValue(/** @type {Realm} */ (jobRealm), error)],
          /** @type {Realm} */ (jobRealm),
        );
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
 * @param {Realm} currentRealm
 * @returns {void}
 */
function settlePromise(promise, state, result, currentRealm) {
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

  triggerPromiseReactions(promise, reactions, result, currentRealm);
  if (state === 'rejected' && !promise.promiseIsHandled) {
    trackPromiseRejection(promise, 'reject');
  }
}

/**
 * @param {PromiseObject} promise
 * @param {PromiseReactionRecord[]} reactions
 * @param {unknown} argument
 * @param {Realm} currentRealm
 * @returns {void}
 */
function triggerPromiseReactions(promise, reactions, argument, currentRealm) {
  let didThrow = false;
  /** @type {unknown} */
  let firstError;

  for (const reaction of reactions) {
    try {
      enqueuePromiseJob(
        promise.realm.agent,
        newPromiseReactionJob(reaction, argument, currentRealm),
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
 * A non-null Job Realm selects both the execution context and the Agent queue
 * that owns it. Null-Realm jobs stay on the Promise's Agent.
 *
 * @param {import('./agent.js').Agent} promiseAgent
 * @param {import('./jobs.js').JobRecord} job
 * @returns {void}
 */
function enqueuePromiseJob(promiseAgent, job) {
  (job.realm?.agent ?? promiseAgent).enqueueJob(job);
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
    callCallable(capability[operation], undefined, [value], realm);
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
 * @param {PromiseObject} promise
 * @returns {void}
 */
function markPromiseHandled(promise) {
  if (promise.promiseIsHandled) {
    return;
  }

  promise.promiseIsHandled = true;
  if (
    promise.promiseState === 'rejected' &&
    !promise.promiseRejectionHandleReported
  ) {
    promise.promiseRejectionHandleReported = true;
    trackPromiseRejection(promise, 'handle');
  }
}

/**
 * The rejection tracker can synchronously attach another handler. Buffer jobs
 * until the original handler is retained so that tracking precedes scheduling
 * without reversing their registration order.
 *
 * @param {PromiseObject} promise
 * @param {PromiseReactionRecord} reaction
 * @param {unknown} argument
 * @param {Realm} currentRealm
 * @returns {void}
 */
function enqueueRejectedPromiseReaction(
  promise,
  reaction,
  argument,
  currentRealm,
) {
  const job = newPromiseReactionJob(reaction, argument, currentRealm);
  if (promise.promiseReactionEnqueueInProgress) {
    promise.promiseReactionJobs.push(job);
    return;
  }

  promise.promiseReactionEnqueueInProgress = true;
  promise.promiseReactionJobs.push(job);
  let didThrow = false;
  /** @type {unknown} */
  let firstError;

  try {
    markPromiseHandled(promise);
    for (
      let index = 0;
      index < promise.promiseReactionJobs.length;
      index += 1
    ) {
      try {
        enqueuePromiseJob(
          promise.realm.agent,
          promise.promiseReactionJobs[index],
        );
      } catch (error) {
        if (!didThrow) {
          didThrow = true;
          firstError = error;
        }
      }
    }
  } finally {
    promise.promiseReactionJobs = [];
    promise.promiseReactionEnqueueInProgress = false;
  }

  if (didThrow) {
    throw firstError;
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
