import { assertSame, assertThrows } from './harness/assert.js';
import { EngineObject } from '../src/runtime/object.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

const HOST_ONLY_GLOBAL_NAMES = ['process', 'globalThis', 'require', 'console'];

const tests = [
  {
    name: 'createRealm produces an isolated global object backed by fresh intrinsics',
    run() {
      const realm = createRealm();

      assertSame(realm.globalObject instanceof EngineObject, true);
      assertSame(
        realm.globalObject.getPrototypeOf(),
        realm.intrinsics.objectPrototype,
      );
      assertSame(
        realm.intrinsics.functionPrototype.getPrototypeOf(),
        realm.intrinsics.objectPrototype,
      );
    },
  },
  {
    name: 'each realm receives a fresh intrinsic graph',
    run() {
      const realmOne = createRealm();
      const realmTwo = createRealm();

      assertSame(
        realmOne.intrinsics.objectPrototype ===
          realmTwo.intrinsics.objectPrototype,
        false,
      );
      assertSame(
        realmOne.intrinsics.functionPrototype ===
          realmTwo.intrinsics.functionPrototype,
        false,
      );
      assertSame(realmOne.globalObject === realmTwo.globalObject, false);
      assertSame(
        realmOne.globalEnvironment === realmTwo.globalEnvironment,
        false,
      );
    },
  },
  {
    name: 'the realm global object is isolated from host globals',
    run() {
      const realm = createRealm();

      for (const name of HOST_ONLY_GLOBAL_NAMES) {
        assertSame(realm.globalObject.hasProperty(name), false);
      }

      /** @type {any} */ (globalThis).__jsjsHostLeakProbe__ = 'host-value';
      assertSame(
        realm.globalObject.hasProperty('__jsjsHostLeakProbe__'),
        false,
      );
      delete (/** @type {any} */ (globalThis).__jsjsHostLeakProbe__);

      realm.globalObject.defineOwnProperty('guestOnly', {
        value: 42,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(
        Object.prototype.hasOwnProperty.call(globalThis, 'guestOnly'),
        false,
      );
    },
  },
  {
    name: 'the realm global environment satisfies the environment record protocol',
    run() {
      const realm = createRealm();

      realm.globalEnvironment.createGlobalVarBinding('answer', false);
      realm.globalEnvironment.setMutableBinding('answer', 42, true);

      assertSame(realm.globalEnvironment.getBindingValue('answer', true), 42);
      assertSame(realm.globalObject.get('answer'), 42);
    },
  },
  {
    name: 'evaluateScript evaluates an empty script to a normal completion',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(realm, '');

      assertSame(completion.type, 'normal');
      assertSame(completion.value, undefined);
    },
  },
  {
    name: 'evaluateScript exposes its Realm only during guest execution',
    run() {
      const realm = createRealm();
      /** @type {import('../src/runtime/realm.js').Realm | null} */
      let observed = null;
      const observe = realm.createNativeFunction({
        name: 'observe',
        length: 0,
        call() {
          observed = realm.agent.activeExecutionRealm;
        },
      });

      realm.globalObject.defineOwnProperty('observe', {
        value: observe,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertSame(evaluateScript(realm, 'observe();').type, 'normal');
      assertSame(observed, realm);
      assertSame(realm.agent.activeExecutionRealm, null);
    },
  },
  {
    name: 'evaluateScript supports the with statement through the public API',
    run() {
      const realm = createRealm();

      // `with` was the last explicitly unsupported statement node; it now
      // resolves identifiers against its object environment like a real
      // engine, so the public API evaluates it end to end.
      const completion = evaluateScript(
        realm,
        'var o = { a: 41 }; var r; with (o) { r = a; } r;',
      );
      assertSame(completion.type, 'normal');
      assertSame(completion.value, 41);
    },
  },
  {
    name: 'evaluateScript supports for-in enumeration',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'var keys = []; for (var k in { a: 1, b: 2 }) { keys.push(k); } keys.join(",");',
      );

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 'a,b');
    },
  },
  {
    name: 'evaluateScript evaluates bitwise NOT through the public API',
    run() {
      const realm = createRealm();

      // `~` used to be an explicitly unsupported operator; it now evaluates
      // like the binary bitwise operators (ToInt32 then complement).
      const completion = evaluateScript(realm, '~0;');
      assertSame(completion.type, 'normal');
      assertSame(completion.value, -1);
    },
  },
  {
    name: 'evaluateScript still surfaces genuine syntax errors',
    run() {
      const realm = createRealm();

      assertThrows(() => evaluateScript(realm, '{'), SyntaxError);
    },
  },
  {
    name: 'a script-level lexical binding stays off the realm global object',
    run() {
      const realm = createRealm();

      evaluateScript(realm, 'let scriptLexical = 1; const scriptConst = 2;');

      assertSame(realm.globalObject.get('scriptLexical'), undefined);
      assertSame(realm.globalObject.hasProperty('scriptLexical'), false);
      assertSame(realm.globalObject.get('scriptConst'), undefined);
      assertSame(realm.globalObject.hasProperty('scriptConst'), false);
      assertSame(evaluateScript(realm, 'scriptLexical + scriptConst').value, 3);
    },
  },
  {
    name: 'lexical bindings from one script are visible to a later script in the same realm',
    run() {
      const realm = createRealm();

      evaluateScript(realm, 'let shared = 41;');
      const completion = evaluateScript(realm, 'shared + 1');

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 42);
    },
  },
];

export default tests;
