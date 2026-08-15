/**
 * @typedef {import('./descriptors.js').CallableLike} CallableLike
 * @typedef {import('./realm.js').Realm} Realm
 * @typedef {{ type: 'normal' | 'throw', value: unknown }} JobCompletion
 */

/**
 * @param {CallableLike} callable
 * @returns {JobCompletion} Normal contains Realm; Throw contains guest value.
 */
export function getFunctionRealm(callable) {
  return callable.getFunctionRealm();
}

/**
 * @param {Realm} _realm
 * @param {unknown} thrownValue
 * @returns {CallableLike}
 */
export function createAbruptRealmCallable(_realm, thrownValue) {
  return {
    callFunction() {
      return undefined;
    },
    getFunctionRealm() {
      return { type: 'throw', value: thrownValue };
    },
  };
}
