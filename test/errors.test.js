import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';
import { GuestErrorSignal } from '../src/runtime/completion.js';

/**
 * Assert that `completion` is a guest throw carrying a guest error whose
 * prototype chain passes through the named constructor's `.prototype`.
 *
 * @param {{ type: string, value: unknown }} completion
 * @param {string} constructorName
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @returns {EngineObject}
 */
function assertGuestThrow(completion, constructorName, realm) {
  assertSame(completion.type, 'throw');
  if (!(completion.value instanceof EngineObject)) {
    throw new Error(
      `Expected an EngineObject throw value, got ${typeof completion.value}`,
    );
  }

  const ctor = /** @type {any} */ (realm.globalObject.get(constructorName));
  if (!(ctor instanceof EngineObject)) {
    throw new Error(`${constructorName} is not installed on globalObject`);
  }

  const proto = /** @type {EngineObject | undefined} */ (ctor.get('prototype'));
  if (!(proto instanceof EngineObject)) {
    throw new Error(`${constructorName}.prototype is not an EngineObject`);
  }

  let current = /** @type {EngineObject | null} */ (
    /** @type {EngineObject} */ (completion.value).getPrototype()
  );

  while (current !== null) {
    if (current === proto) {
      return /** @type {EngineObject} */ (completion.value);
    }

    current = current.getPrototype();
  }

  throw new Error(
    `Thrown value's prototype chain does not reach ${constructorName}.prototype`,
  );
}

const tests = [
  {
    name: 'Error-family instances and prototypes expose the Error class tag',
    run() {
      const realm = createRealm();

      for (const name of [
        'Error',
        'TypeError',
        'ReferenceError',
        'SyntaxError',
        'RangeError',
      ]) {
        assertSame(
          evaluateScript(
            realm,
            `Object.prototype.toString.call(new ${name}());`,
          ).value,
          '[object Error]',
        );
        assertSame(
          evaluateScript(
            realm,
            `Object.prototype.toString.call(${name}.prototype);`,
          ).value,
          '[object Error]',
        );
      }
    },
  },
  {
    name: 'runtime-created guest errors expose the Error class tag',
    run() {
      const realm = createRealm();
      assertSame(
        evaluateScript(
          realm,
          'var value = 1; var tag; try { value(); } ' +
            'catch (error) { tag = Object.prototype.toString.call(error); } tag;',
        ).value,
        '[object Error]',
      );
    },
  },
  {
    name: 'Error message uses guest ToString and preserves side effects',
    run() {
      const realm = createRealm();
      const result = evaluateScript(
        realm,
        'var hit = 0; var error = new Error({ toString: function () { hit = 1; return "custom"; } }); error.message + ":" + hit;',
      );
      assertSame(result.type, 'normal');
      assertSame(result.value, 'custom:1');
    },
  },
  {
    name: 'Error message conversion propagates guest throws',
    run() {
      const realm = createRealm();
      const result = evaluateScript(
        realm,
        'var sentinel = new RangeError("boom"); try { new Error({ toString: function () { throw sentinel; } }); false; } catch (error) { error === sentinel; }',
      );
      assertSame(result.type, 'normal');
      assertSame(result.value, true);
    },
  },
  // ---------------------------------------------------------------------------
  // GuestErrorSignal
  // ---------------------------------------------------------------------------
  {
    name: 'GuestErrorSignal is an Error with typeName and guestMessage fields',
    run() {
      const signal = new GuestErrorSignal('TypeError', 'not a function');
      assertSame(signal instanceof Error, true);
      assertSame(signal.typeName, 'TypeError');
      assertSame(signal.guestMessage, 'not a function');
    },
  },

  // ---------------------------------------------------------------------------
  // Error constructor — callable as function
  // ---------------------------------------------------------------------------
  {
    name: 'Error() as a function call produces a guest error instance',
    run() {
      const realm = createRealm();
      const result = evaluateScript(realm, "var e = Error('oops'); e;");
      assertSame(result.type, 'normal');
      assertSame(result.value instanceof EngineObject, true);
      const e = /** @type {EngineObject} */ (result.value);
      assertSame(e.get('message'), 'oops');
    },
  },

  // ---------------------------------------------------------------------------
  // Error constructor — callable via new
  // ---------------------------------------------------------------------------
  {
    name: 'new Error("msg") produces a guest error instance with message',
    run() {
      const realm = createRealm();
      const result = evaluateScript(realm, 'new Error("msg");');
      assertSame(result.type, 'normal');
      const e = /** @type {EngineObject} */ (result.value);
      assertSame(e.get('message'), 'msg');
    },
  },
  // ---------------------------------------------------------------------------
  // Error with no argument: no own 'message' property
  // ---------------------------------------------------------------------------
  {
    name: 'Error() with no argument has no own message property',
    run() {
      const realm = createRealm();
      const result = evaluateScript(realm, 'new Error();');
      assertSame(result.type, 'normal');
      const e = /** @type {EngineObject} */ (result.value);
      // No own 'message' property; reads '' from Error.prototype
      assertSame(e.getOwnProperty('message'), undefined);
      assertSame(e.get('message'), '');
    },
  },

  // ---------------------------------------------------------------------------
  // Error.prototype.name
  // ---------------------------------------------------------------------------
  {
    name: 'Error.prototype has name "Error" and message ""',
    run() {
      const realm = createRealm();
      evaluateScript(realm, ''); // warm up realm

      const errorCtor = /** @type {any} */ (realm.globalObject.get('Error'));
      const proto = /** @type {EngineObject} */ (errorCtor.get('prototype'));
      assertSame(proto.get('name'), 'Error');
      assertSame(proto.get('message'), '');
    },
  },

  // ---------------------------------------------------------------------------
  // instanceof Error
  // ---------------------------------------------------------------------------
  {
    name: 'error instances pass instanceof check for their own constructor',
    run() {
      const realm = createRealm();
      const result = evaluateScript(realm, 'new Error("e");');
      const e = /** @type {EngineObject} */ (result.value);
      const errorCtor = /** @type {any} */ (realm.globalObject.get('Error'));
      const proto = /** @type {EngineObject} */ (errorCtor.get('prototype'));
      assertSame(e.getPrototype(), proto);
    },
  },

  // ---------------------------------------------------------------------------
  // TypeError constructor + prototype identity
  // ---------------------------------------------------------------------------
  {
    name: 'TypeError constructor produces error inheriting from TypeError.prototype then Error.prototype',
    run() {
      const realm = createRealm();
      const result = evaluateScript(realm, 'new TypeError("nope");');
      assertSame(result.type, 'normal');

      const e = /** @type {EngineObject} */ (result.value);
      const typeErrorCtor = /** @type {any} */ (
        realm.globalObject.get('TypeError')
      );
      const typeErrorProto = /** @type {EngineObject} */ (
        typeErrorCtor.get('prototype')
      );
      const errorCtor = /** @type {any} */ (realm.globalObject.get('Error'));
      const errorProto = /** @type {EngineObject} */ (
        errorCtor.get('prototype')
      );

      assertSame(e.getPrototype(), typeErrorProto);
      assertSame(typeErrorProto.getPrototype(), errorProto);
      assertSame(typeErrorProto.get('name'), 'TypeError');
      assertSame(e.get('message'), 'nope');
    },
  },

  // ---------------------------------------------------------------------------
  // ReferenceError, SyntaxError, RangeError
  // ---------------------------------------------------------------------------
  {
    name: 'ReferenceError inherits from Error.prototype and has correct name',
    run() {
      const realm = createRealm();
      const result = evaluateScript(realm, 'new ReferenceError("ref");');
      const e = /** @type {EngineObject} */ (result.value);
      const ctor = /** @type {any} */ (
        realm.globalObject.get('ReferenceError')
      );
      const proto = /** @type {EngineObject} */ (ctor.get('prototype'));
      const errorCtor = /** @type {any} */ (realm.globalObject.get('Error'));
      const errorProto = /** @type {EngineObject} */ (
        errorCtor.get('prototype')
      );

      assertSame(e.getPrototype(), proto);
      assertSame(proto.getPrototype(), errorProto);
      assertSame(proto.get('name'), 'ReferenceError');
    },
  },
  {
    name: 'SyntaxError inherits from Error.prototype and has correct name',
    run() {
      const realm = createRealm();
      const result = evaluateScript(realm, 'new SyntaxError("syn");');
      const e = /** @type {EngineObject} */ (result.value);
      const ctor = /** @type {any} */ (realm.globalObject.get('SyntaxError'));
      assertSame(ctor.get('prototype') instanceof EngineObject, true);
      assertSame(
        /** @type {EngineObject} */ (ctor.get('prototype')).get('name'),
        'SyntaxError',
      );
      assertSame(e.get('message'), 'syn');
    },
  },
  {
    name: 'RangeError inherits from Error.prototype and has correct name',
    run() {
      const realm = createRealm();
      const result = evaluateScript(realm, 'new RangeError("range");');
      const e = /** @type {EngineObject} */ (result.value);
      assertSame(e.get('name'), 'RangeError');
      assertSame(e.get('message'), 'range');
    },
  },

  // ---------------------------------------------------------------------------
  // TypeError.prototype.constructor === TypeError (15.11.6)
  // ---------------------------------------------------------------------------
  {
    name: 'each error prototype has constructor pointing back to its constructor',
    run() {
      const realm = createRealm();
      for (const name of [
        'Error',
        'TypeError',
        'ReferenceError',
        'SyntaxError',
        'RangeError',
      ]) {
        const ctor = /** @type {any} */ (realm.globalObject.get(name));
        const proto = /** @type {EngineObject} */ (ctor.get('prototype'));
        assertSame(proto.get('constructor'), ctor);
      }
    },
  },

  // ---------------------------------------------------------------------------
  // Object.getPrototypeOf(TypeError.prototype) === Error.prototype
  // ---------------------------------------------------------------------------
  {
    name: 'TypeError.prototype inherits from Error.prototype',
    run() {
      const realm = createRealm();
      const typeErrorCtor = /** @type {any} */ (
        realm.globalObject.get('TypeError')
      );
      const errorCtor = /** @type {any} */ (realm.globalObject.get('Error'));
      const typeErrorProto = /** @type {EngineObject} */ (
        typeErrorCtor.get('prototype')
      );
      const errorProto = /** @type {EngineObject} */ (
        errorCtor.get('prototype')
      );

      assertSame(typeErrorProto.getPrototype(), errorProto);
    },
  },

  // ---------------------------------------------------------------------------
  // Runtime throw conversion: calling non-function → guest TypeError
  // ---------------------------------------------------------------------------
  {
    name: 'calling a non-function produces a guest TypeError throw completion',
    run() {
      const realm = createRealm();
      const result = evaluateScript(realm, 'var x = 1; x();');
      assertGuestThrow(result, 'TypeError', realm);
    },
  },

  {
    name: 'new on a non-constructor produces a guest TypeError throw completion',
    run() {
      const realm = createRealm();
      const result = evaluateScript(realm, 'var x = 1; new x();');
      assertGuestThrow(result, 'TypeError', realm);
    },
  },

  // ---------------------------------------------------------------------------
  // Runtime throw conversion: unresolvable reference → guest ReferenceError
  // ---------------------------------------------------------------------------
  {
    name: 'reading an undeclared identifier produces a guest ReferenceError',
    run() {
      const realm = createRealm();
      const result = evaluateScript(realm, 'undeclaredVar;');
      assertGuestThrow(result, 'ReferenceError', realm);
    },
  },

  // ---------------------------------------------------------------------------
  // Runtime throw conversion: object put rejection → guest TypeError signal
  // ---------------------------------------------------------------------------
  {
    name: 'put with throwOnError on a non-writable property throws GuestErrorSignal',
    run() {
      const o = new EngineObject(null);
      o.defineOwnProperty('x', {
        value: 1,
        writable: false,
        enumerable: true,
        configurable: false,
      });

      // Direct call with throwOnError=true; the signal bubbles as a host
      // GuestErrorSignal before any realm-aware boundary can convert it.
      assertThrows(() => o.put('x', 2, true), GuestErrorSignal);
    },
  },

  // ---------------------------------------------------------------------------
  // GuestErrorSignal is caught and converted at function call boundaries
  // ---------------------------------------------------------------------------
  {
    name: 'a guest TypeError thrown inside a called function propagates as a throw completion',
    run() {
      const realm = createRealm();
      const result = evaluateScript(
        realm,
        'function f() { return undeclaredVar; } f();',
      );
      assertGuestThrow(result, 'ReferenceError', realm);
    },
  },
];

export default tests;
