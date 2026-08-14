import { createRealm, evaluateScript } from '../src/index.js';
import {
  createAbruptRealmCallable,
  getFunctionRealm,
} from '../src/runtime/function-realm.js';
import { createGuestError } from '../src/builtins/errors.js';
import { assertSame } from './harness/assert.js';

/**
 * @param {unknown} value
 * @returns {import('../src/runtime/descriptors.js').CallableLike}
 */
function callable(value) {
  return /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
    value
  );
}

function nativeAbruptLookupOwner() {
  const currentError = TypeError;
  const callable = Proxy.revocable(function () {}, {});
  callable.revoke();
  return Promise.resolve(1)
    .then(callable.proxy)
    .catch((error) => error instanceof currentError);
}

export default [
  {
    name: 'GetFunctionRealm follows ECMAScript and native function ownership',
    run: () => {
      const realm = createRealm();
      const closure = evaluateScript(realm, '(function handler() {})').value;
      const native = realm.globalObject.get('parseInt');
      assertSame(getFunctionRealm(callable(closure)).value, realm);
      assertSame(getFunctionRealm(callable(native)).value, realm);
      assertSame(
        getFunctionRealm(callable(realm.intrinsics.functionPrototype)).value,
        realm,
      );
    },
  },
  {
    name: 'GetFunctionRealm recursively follows a bound target',
    run: () => {
      const realmA = createRealm();
      const realmB = createRealm();
      const target = evaluateScript(realmA, '(function target() {})').value;
      realmB.globalObject.defineOwnProperty('target', {
        value: target,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const bound = evaluateScript(realmB, 'target.bind(null)').value;
      assertSame(getFunctionRealm(callable(bound)).value, realmA);
    },
  },
  {
    name: 'GetFunctionRealm follows long bound chains without a host stack overflow',
    run: () => {
      const realm = createRealm();
      const target = callable(
        evaluateScript(realm, '(function target() {})').value,
      );
      const bind = callable(realm.intrinsics.functionPrototype.get('bind'));
      let bound = target;

      for (let index = 0; index < 30_000; index += 1) {
        bound = callable(bind.callFunction(bound, [null]));
      }

      assertSame(getFunctionRealm(bound).value, realm);
    },
  },
  {
    name: 'internal callable exotic can model abrupt Realm lookup',
    run: () => {
      const realm = createRealm();
      const thrown = createGuestError(realm, 'TypeError', 'revoked');
      const lookup = getFunctionRealm(createAbruptRealmCallable(realm, thrown));
      assertSame(lookup.type, 'throw');
      assertSame(lookup.value, thrown);
    },
  },
  {
    name: 'native revoked callable lookup reports the current error Realm',
    async run() {
      assertSame(await nativeAbruptLookupOwner(), true);
    },
  },
];
