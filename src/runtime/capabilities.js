import { GuestErrorSignal } from './completion.js';

/**
 * @typedef {{
 *   callFunction: (
 *     thisValue: unknown,
 *     args: readonly unknown[],
 *     callerRealm?: import('./realm.js').Realm,
 *   ) => unknown,
 *   getFunctionRealm: () => import('./function-realm.js').JobCompletion,
 * }} CallableLike
 *
 * @typedef {CallableLike & {
 *   constructFunction: (
 *     args?: readonly unknown[],
 *     newTarget?: unknown,
 *     callerRealm?: import('./realm.js').Realm,
 *   ) => import('./object.js').EngineObject,
 * }} ConstructorLike
 */

const CALLABLES = new WeakSet();
const CONSTRUCTORS = new WeakSet();

/**
 * Grants an engine-owned object the Table 6 [[Call]] capability. Only trusted
 * engine function construction paths may call this registration point.
 *
 * @param {object | Function} value
 * @returns {void}
 */
export function registerCallable(value) {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  ) {
    throw new TypeError('Callable capability requires an object');
  }

  CALLABLES.add(value);
}

/**
 * Grants an engine-owned object the Table 6 [[Construct]] capability.
 *
 * @param {object | Function} value
 * @returns {void}
 */
export function registerConstructor(value) {
  registerCallable(value);
  CONSTRUCTORS.add(value);
}

/**
 * @param {unknown} value
 * @returns {value is CallableLike}
 */
export function isCallable(value) {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    CALLABLES.has(value)
  );
}

/**
 * @param {unknown} value
 * @returns {value is ConstructorLike}
 */
export function isConstructor(value) {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    CONSTRUCTORS.has(value)
  );
}

/**
 * Dispatches an engine [[Call]] only after checking its private capability.
 *
 * @param {unknown} value
 * @param {unknown} thisValue
 * @param {readonly unknown[]} argumentsList
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {unknown}
 */
export function callCallable(value, thisValue, argumentsList, callerRealm) {
  if (!isCallable(value)) {
    throw new GuestErrorSignal('TypeError', 'Value is not callable');
  }

  return value.callFunction(thisValue, argumentsList, callerRealm);
}

/**
 * Dispatches an engine [[Construct]] only after checking its private
 * capability.
 *
 * @param {unknown} value
 * @param {readonly unknown[]} argumentsList
 * @param {unknown} newTarget
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {import('./object.js').EngineObject}
 */
export function constructCallable(
  value,
  argumentsList,
  newTarget,
  callerRealm,
) {
  if (!isConstructor(value)) {
    throw new GuestErrorSignal('TypeError', 'Value is not a constructor');
  }

  return value.constructFunction(argumentsList, newTarget, callerRealm);
}
