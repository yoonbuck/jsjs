/**
 * The ES2015 iteration abstract operations (ECMA-262 §7.4): the small,
 * host-free algorithms that drive every iterator protocol consumer — `for`-`of`
 * today, and array/string destructuring, spread, and the collection
 * constructors later.
 *
 * An **Iterator Record** here is the `{ iterator, nextMethod, done }` shape
 * §7.4 threads through the operations: `iterator` is the guest iterator object,
 * `nextMethod` is the `next` function looked up once when the record is created
 * (so a later redefinition of `next` cannot be observed mid-iteration), and
 * `done` records whether the record's consumer has already stopped. The
 * executing Agent is retained too, so a later `next`/`return`/`throw` after a
 * suspension can transiently relink the actual iterator's Agent to the new
 * synchronous generator chain.
 *
 * Nothing in this module reaches into the host: it calls guest functions
 * through `callCallable`, reads guest properties through `[[Get]]`, and reports
 * failures as `GuestErrorSignal`s the nearest realm-aware boundary materialises
 * into guest errors, exactly like the rest of the runtime. The one realm the
 * operations carry is for `CreateIterResultObject`'s prototype and for wrapping
 * a primitive receiver in `GetMethod`. An EngineObject's protocol key comes
 * from its owning agent; primitives use the executing realm's agent while they
 * are wrapped.
 */

import { EngineObject, getWithObjectOperationRealm } from './object.js';
import { callCallable } from './capabilities.js';
import { GuestErrorSignal } from './completion.js';
import { isCallable } from './descriptors.js';
import { toBoolean, toObject } from './conversion.js';
import { withLinkedActiveExecutionRealm } from './reference.js';

/**
 * @typedef {import('./realm.js').Realm} Realm
 * @typedef {import('./agent.js').Agent} Agent
 * @typedef {import('./descriptors.js').PropertyKey} PropertyKey
 * @typedef {import('./descriptors.js').CallableLike} CallableLike
 *
 * @typedef {{
 *   iterator: EngineObject,
 *   nextMethod: unknown,
 *   done: boolean,
 *   realm?: Realm,
 * }} IteratorRecord
 */

/**
 * ECMA-262 §7.3.9 `GetMethod ( V, P )`, layered on §7.3.2 `GetV`: read the
 * property `P` of `V` (autoboxing a primitive `V` the way `GetV` does), treat
 * `undefined`/`null` as "no method", and require anything else to be callable.
 * `for`-`of` over a primitive string routes through here, so `V` is not always
 * an object.
 *
 * @param {Realm} realm
 * @param {unknown} value
 * @param {PropertyKey} key
 * @returns {CallableLike | undefined}
 */
export function getMethod(realm, value, key) {
  const receiver =
    value instanceof EngineObject ? value : toObject(realm, value);

  linkGeneratorHostChainToAgent(realm.agent, receiver.agent);
  const func = getWithObjectOperationRealm(realm, receiver, key, value);
  linkGeneratorHostChainToValue(realm.agent, func);

  if (func === undefined || func === null) {
    return undefined;
  }

  if (!isCallable(func)) {
    throw new GuestErrorSignal(
      'TypeError',
      `${describeKey(key)} is not a function`,
    );
  }

  return /** @type {CallableLike} */ (func);
}

/**
 * ECMA-262 §7.4.7 `CreateIterResultObject ( value, done )`: an ordinary object
 * inheriting the realm's `%Object.prototype%` with own, fully mutable `value`
 * and `done` data properties. Built-in iterators return one of these from
 * every `next` call.
 *
 * @param {Realm} realm
 * @param {unknown} value
 * @param {boolean} done
 * @returns {EngineObject}
 */
export function createIterResultObject(realm, value, done) {
  const result = new EngineObject(realm.intrinsics.objectPrototype);

  result.defineOwnProperty('value', {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  result.defineOwnProperty('done', {
    value: done,
    writable: true,
    enumerable: true,
    configurable: true,
  });

  return result;
}

/**
 * Captures the public iterator protocol operations for an already-created
 * iterator. `[[Enumerate]]` returns an iterator directly, unlike `@@iterator`,
 * but both consumers must observe and validate `next` the same way.
 *
 * @param {unknown} iterator
 * @param {Realm} [realm]
 * @returns {IteratorRecord}
 */
export function getIteratorRecord(iterator, realm) {
  if (!(iterator instanceof EngineObject)) {
    throw new GuestErrorSignal(
      'TypeError',
      'Enumerate result is not an object',
    );
  }

  if (realm !== undefined) {
    linkGeneratorHostChainToAgent(realm.agent, iterator.agent);
  }

  const nextMethod = getWithObjectOperationRealm(
    realm,
    iterator,
    'next',
    iterator,
  );

  if (realm !== undefined) {
    linkGeneratorHostChainToValue(realm.agent, nextMethod);
  }

  if (!isCallable(nextMethod)) {
    throw new GuestErrorSignal(
      'TypeError',
      'Enumerate iterator next is not callable',
    );
  }

  return {
    iterator,
    nextMethod,
    done: false,
    realm,
  };
}

/**
 * Dispatches the public ES2015 `[[Enumerate]]` operation while making the
 * evaluating Realm visible to a separately owned target Agent. The target can
 * therefore allocate its public iterator and iterator results in the Realm
 * that evaluates the `for-in` statement. A direct context-free
 * `EngineObject#enumerate()` call remains responsible for rejecting its lack
 * of an active Realm.
 *
 * @param {Realm} realm
 * @param {EngineObject} object
 * @returns {IteratorRecord}
 */
export function getEnumerateIteratorRecord(realm, object) {
  const targetAgent = object.agent;

  if (targetAgent === null || targetAgent === realm.agent) {
    return getIteratorRecord(object.enumerate(), realm);
  }

  const link = targetAgent.enterSynchronousAgentLink(realm.agent);

  try {
    return withLinkedActiveExecutionRealm(realm, targetAgent, () =>
      getIteratorRecord(object.enumerate(), realm),
    );
  } finally {
    targetAgent.exitSynchronousCallChain(link);
  }
}

/**
 * ECMA-262 §7.4.1 `GetIterator ( obj [ , hint [ , method ] ] )`, sync hint. When
 * no `method` is supplied it is resolved via `GetMethod` on the `@@iterator`
 * key; an `obj` with no such method is not iterable and is a `TypeError`. The
 * method is called with `obj` as its `this`, its result must be an object, and
 * that object's `next` is captured once into the returned record.
 *
 * @param {Realm} realm
 * @param {unknown} obj
 * @param {CallableLike} [method]
 * @returns {IteratorRecord}
 */
export function getIterator(realm, obj, method) {
  /** @type {unknown} */
  let iteratorMethod = method;
  const iterableAgent = obj instanceof EngineObject ? obj.agent : realm.agent;

  linkGeneratorHostChainToAgent(realm.agent, iterableAgent);

  if (iteratorMethod === undefined) {
    if (iterableAgent === null) {
      throw new TypeError('EngineObject protocol lookup requires an agent');
    }

    iteratorMethod =
      obj instanceof EngineObject
        ? obj.getWellKnownSymbol('iterator', realm)
        : getMethod(realm, obj, iterableAgent.wellKnownSymbols.iterator);
  }

  if (iteratorMethod === undefined || !isCallable(iteratorMethod)) {
    throw new GuestErrorSignal(
      'TypeError',
      `${describeValue(obj)} is not iterable`,
    );
  }

  linkGeneratorHostChainToValue(realm.agent, iteratorMethod);
  const iterator = callCallable(iteratorMethod, obj, [], realm);

  if (!(iterator instanceof EngineObject)) {
    throw new GuestErrorSignal(
      'TypeError',
      'Result of the Symbol.iterator method is not an object',
    );
  }

  return getIteratorRecord(iterator, realm);
}

/**
 * Calls an iterator method with the same argument and result validation used by
 * `IteratorNext`. Delegated `yield` uses this for dynamically resolved
 * `throw`/`return` methods as well as the Iterator Record's captured `next`.
 *
 * @param {EngineObject} iterator
 * @param {unknown} method
 * @param {{ value: unknown }} [sent] The value to forward to `next`, wrapped so
 *   forwarding `undefined` stays distinguishable from forwarding nothing.
 * @param {Realm} [callerRealm]
 * @returns {EngineObject}
 */
export function iteratorNextWithMethod(iterator, method, sent, callerRealm) {
  if (!isCallable(method)) {
    throw new GuestErrorSignal('TypeError', 'iterator.next is not a function');
  }

  const iteratorMethod = /** @type {CallableLike} */ (method);
  const activeAgent = callerRealm?.agent ?? iterator.agent ?? undefined;

  if (activeAgent !== undefined) {
    linkGeneratorHostChainToAgent(activeAgent, iterator.agent);
    linkGeneratorHostChainToValue(activeAgent, iteratorMethod);
  }

  const result = callCallable(
    iteratorMethod,
    iterator,
    sent === undefined ? [] : [sent.value],
    callerRealm,
  );

  if (!(result instanceof EngineObject)) {
    throw new GuestErrorSignal('TypeError', 'Iterator result is not an object');
  }

  if (activeAgent !== undefined) {
    linkGeneratorHostChainToAgent(activeAgent, result.agent);
  }

  return result;
}

/**
 * ECMA-262 §7.4.2 `IteratorNext ( iteratorRecord [ , value ] )`: call the
 * record's captured `next` method on its iterator, forwarding `value` only when
 * the caller supplied one, and require the result to be an object.
 *
 * @param {IteratorRecord} record
 * @param {{ value: unknown }} [sent]
 * @returns {EngineObject}
 */
export function iteratorNext(record, sent) {
  return iteratorNextWithMethod(
    record.iterator,
    record.nextMethod,
    sent,
    record.realm,
  );
}

/**
 * ECMA-262 §7.4.3 `IteratorComplete ( iterResult )`.
 *
 * @param {EngineObject} result
 * @param {Realm} [realm]
 * @returns {boolean}
 */
export function iteratorComplete(result, realm) {
  return toBoolean(getWithObjectOperationRealm(realm, result, 'done', result));
}

/**
 * ECMA-262 §7.4.4 `IteratorValue ( iterResult )`.
 *
 * @param {EngineObject} result
 * @param {Realm} [realm]
 * @returns {unknown}
 */
export function iteratorValue(result, realm) {
  const value = getWithObjectOperationRealm(realm, result, 'value', result);

  if (realm !== undefined) {
    linkGeneratorHostChainToValue(realm.agent, value);
  }

  return value;
}

/**
 * ECMA-262 §7.4.5 `IteratorStep ( iteratorRecord )`: advance the iterator and
 * return its result object, or `false` once the iterator reports completion.
 *
 * @param {IteratorRecord} record
 * @returns {EngineObject | false}
 */
export function iteratorStep(record) {
  const result = iteratorNext(record);

  return iteratorComplete(result, record.realm) ? false : result;
}

/**
 * ECMA-262 §7.4.6 `IteratorClose ( iteratorRecord, completion )`, expressed for
 * this engine's split between value-carrying completions and host-thrown
 * signals.
 *
 * `completionIsThrow` is the one bit of the enclosing completion this operation
 * needs: whether the consumer is unwinding because of a throw. When it is, the
 * original throw always wins — every failure of `return` (a missing-but-broken
 * lookup, `return` itself throwing, or a non-object result) is swallowed so the
 * caller can re-raise the throw it already holds (§7.4.6 step 5). When it is
 * not, the `return` call's own abrupt outcome replaces the caller's completion:
 * a thrown error propagates (step 6) and a non-object result is a `TypeError`
 * (step 7). A `return` method that is absent is a no-op either way (step 4.b).
 *
 * @param {Realm} realm
 * @param {IteratorRecord} record
 * @param {boolean} completionIsThrow
 * @returns {void}
 */
export function iteratorClose(realm, record, completionIsThrow) {
  const { iterator } = record;

  /** @type {unknown} */
  let innerValue;
  /** @type {unknown} */
  let innerError;
  let innerThrew = false;

  try {
    linkGeneratorHostChainToAgent(realm.agent, iterator.agent);
    const returnMethod = getMethod(realm, iterator, 'return');

    if (returnMethod === undefined) {
      // §7.4.6 step 4.b: no `return` to call, so the caller's completion stands
      // unchanged whether it is normal or a throw.
      return;
    }

    linkGeneratorHostChainToValue(realm.agent, returnMethod);
    innerValue = callCallable(returnMethod, iterator, [], realm);
  } catch (error) {
    innerThrew = true;
    innerError = error;
  }

  if (completionIsThrow) {
    // §7.4.6 step 5: the throw the caller is already unwinding with wins, so
    // every outcome of `return` — including its own throw — is discarded.
    return;
  }

  if (innerThrew) {
    // §7.4.6 step 6.
    throw innerError;
  }

  if (!(innerValue instanceof EngineObject)) {
    // §7.4.6 step 7.
    throw new GuestErrorSignal(
      'TypeError',
      'Iterator return method returned a non-object value',
    );
  }
}

/**
 * @param {PropertyKey} key
 * @returns {string}
 */
function describeKey(key) {
  return typeof key === 'symbol' ? String(key) : key;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function describeValue(value) {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  return typeof value === 'symbol' ? String(value) : String(value);
}

/**
 * @param {Agent} callerAgent
 * @param {Agent | null} targetAgent
 * @returns {void}
 */
function linkGeneratorHostChainToAgent(callerAgent, targetAgent) {
  if (targetAgent !== null && targetAgent !== callerAgent) {
    callerAgent.linkGeneratorHostChain(targetAgent);
  }
}

/**
 * @param {Agent} callerAgent
 * @param {unknown} value
 * @returns {void}
 */
function linkGeneratorHostChainToValue(callerAgent, value) {
  if (value instanceof EngineObject) {
    linkGeneratorHostChainToAgent(callerAgent, value.agent);
  }
}
