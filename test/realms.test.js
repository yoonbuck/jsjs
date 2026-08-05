import { assertSame, assertThrows } from './harness/assert.js';
import { EngineObject } from '../src/runtime/object.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

const HOST_ONLY_GLOBAL_NAMES = [
  'process',
  'globalThis',
  'require',
  'Object',
  'Array',
  'console',
];

const tests = [
  {
    name: 'createRealm produces an isolated global object backed by fresh intrinsics',
    run() {
      const realm = createRealm();

      assertSame(realm.globalObject instanceof EngineObject, true);
      assertSame(
        realm.globalObject.getPrototype(),
        realm.intrinsics.objectPrototype,
      );
      assertSame(
        realm.intrinsics.functionPrototype.getPrototype(),
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
    name: 'evaluateScript rejects unsupported statement nodes explicitly',
    run() {
      const realm = createRealm();

      // `for-in` is not implemented, so `ForInStatement` is still an
      // explicitly unsupported node.
      const error = assertThrows(
        () => evaluateScript(realm, 'for (var k in {}) {}'),
        Error,
      );
      assertSame(/Unsupported AST node/.test(error.message), true);
      assertSame(/** @type {any} */ (error).nodeType, 'ForInStatement');
    },
  },
  {
    name: 'evaluateScript rejects unsupported expression statements explicitly',
    run() {
      const realm = createRealm();

      // `~` (bitwise NOT) is still unsupported; verify the engine reports it
      // explicitly rather than silently passing or crashing.
      const error = assertThrows(() => evaluateScript(realm, '~0;'), Error);
      assertSame(/** @type {any} */ (error).name, 'UnsupportedOperatorError');
    },
  },
  {
    name: 'evaluateScript still surfaces genuine syntax errors',
    run() {
      const realm = createRealm();

      assertThrows(() => evaluateScript(realm, '{'), SyntaxError);
    },
  },
];

export default tests;
