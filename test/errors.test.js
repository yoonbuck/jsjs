import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';
import { Reference, putValue } from '../src/runtime/reference.js';
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
    /** @type {EngineObject} */ (completion.value).getPrototypeOf()
  );

  while (current !== null) {
    if (current === proto) {
      return /** @type {EngineObject} */ (completion.value);
    }

    current = current.getPrototypeOf();
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
        'URIError',
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
      assertSame(e.getPrototypeOf(), proto);
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

      assertSame(e.getPrototypeOf(), typeErrorProto);
      assertSame(typeErrorProto.getPrototypeOf(), errorProto);
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

      assertSame(e.getPrototypeOf(), proto);
      assertSame(proto.getPrototypeOf(), errorProto);
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
        'URIError',
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

      assertSame(typeErrorProto.getPrototypeOf(), errorProto);
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
  // Runtime throw conversion: strict Reference rejection → guest TypeError
  // ---------------------------------------------------------------------------
  {
    name: 'strict property Reference on a non-writable property throws GuestErrorSignal',
    run() {
      const o = new EngineObject(null);
      o.defineOwnProperty('x', {
        value: 1,
        writable: false,
        enumerable: true,
        configurable: false,
      });

      assertThrows(
        () => putValue(new Reference(o, 'x', true, o), 2),
        GuestErrorSignal,
      );
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

  // ---------------------------------------------------------------------------
  // EvalError (15.11.6.1) — installed for completeness even though no engine
  // algorithm throws it.
  // ---------------------------------------------------------------------------
  {
    name: 'EvalError is installed as a callable global constructor',
    run() {
      const realm = createRealm();
      assertSame(evaluateScript(realm, 'typeof EvalError;').value, 'function');
      assertSame(evaluateScript(realm, 'EvalError.length;').value, 1);
    },
  },
  {
    name: 'EvalError inherits from Error.prototype and has correct name and message',
    run() {
      const realm = createRealm();
      const result = evaluateScript(realm, 'new EvalError("boom");');
      const e = /** @type {EngineObject} */ (result.value);
      const ctor = /** @type {any} */ (realm.globalObject.get('EvalError'));
      const proto = /** @type {EngineObject} */ (ctor.get('prototype'));
      const errorCtor = /** @type {any} */ (realm.globalObject.get('Error'));
      const errorProto = /** @type {EngineObject} */ (
        errorCtor.get('prototype')
      );

      assertSame(e.getPrototypeOf(), proto);
      assertSame(proto.getPrototypeOf(), errorProto);
      assertSame(proto.get('name'), 'EvalError');
      assertSame(proto.get('message'), '');
      assertSame(e.get('message'), 'boom');
      assertSame(proto.get('constructor'), ctor);
    },
  },
  {
    name: 'EvalError instances and prototype expose the Error class tag',
    run() {
      const realm = createRealm();
      assertSame(
        evaluateScript(
          realm,
          'Object.prototype.toString.call(new EvalError());',
        ).value,
        '[object Error]',
      );
      assertSame(
        evaluateScript(
          realm,
          'Object.prototype.toString.call(EvalError.prototype);',
        ).value,
        '[object Error]',
      );
    },
  },
  {
    name: 'EvalError() called as a function behaves like construction',
    run() {
      const realm = createRealm();
      const result = evaluateScript(
        realm,
        'var e = EvalError("x"); e instanceof EvalError && e instanceof Error;',
      );
      assertSame(result.value, true);
    },
  },
  {
    name: 'realm.createGuestError builds an EvalError instance',
    run() {
      const realm = createRealm();
      const instance = realm.createGuestError('EvalError', 'boom');
      const ctor = /** @type {any} */ (realm.globalObject.get('EvalError'));
      const proto = /** @type {EngineObject} */ (ctor.get('prototype'));
      assertSame(instance.getPrototypeOf(), proto);
      assertSame(instance.get('message'), 'boom');
    },
  },
  {
    name: 'EvalError global and prototype carry the native-error property descriptors',
    run() {
      const realm = createRealm();

      // 15.1: the global binding is a writable, non-enumerable, configurable
      // data property, exactly like every other native-error constructor.
      const globalDescriptor = /** @type {any} */ (
        realm.globalObject.getOwnProperty('EvalError')
      );
      assertSame(globalDescriptor !== undefined, true);
      assertSame(globalDescriptor.writable, true);
      assertSame(globalDescriptor.enumerable, false);
      assertSame(globalDescriptor.configurable, true);

      // 15.11.7.6: the constructor's `prototype` is a locked-down data
      // property — non-writable, non-enumerable, non-configurable.
      const ctor = /** @type {any} */ (realm.globalObject.get('EvalError'));
      const prototypeDescriptor = /** @type {any} */ (
        ctor.getOwnProperty('prototype')
      );
      assertSame(prototypeDescriptor !== undefined, true);
      assertSame(prototypeDescriptor.writable, false);
      assertSame(prototypeDescriptor.enumerable, false);
      assertSame(prototypeDescriptor.configurable, false);
    },
  },

  // ---------------------------------------------------------------------------
  // Error.prototype.toString (15.11.4.4)
  // ---------------------------------------------------------------------------
  {
    name: 'Error.prototype.toString is an own, non-enumerable, length-0 method',
    run() {
      const realm = createRealm();
      const errorCtor = /** @type {any} */ (realm.globalObject.get('Error'));
      const proto = /** @type {EngineObject} */ (errorCtor.get('prototype'));

      const descriptor = /** @type {any} */ (proto.getOwnProperty('toString'));
      assertSame(descriptor !== undefined, true);
      assertSame(descriptor.writable, true);
      assertSame(descriptor.enumerable, false);
      assertSame(descriptor.configurable, true);
      assertSame(
        evaluateScript(realm, 'Error.prototype.hasOwnProperty("toString");')
          .value,
        true,
      );
      assertSame(
        evaluateScript(realm, 'Error.prototype.toString.length;').value,
        0,
      );
      assertSame(
        evaluateScript(realm, 'typeof Error.prototype.toString;').value,
        'function',
      );
    },
  },
  {
    name: 'Error.prototype.toString joins name and message per 15.11.4.4',
    run() {
      const realm = createRealm();
      assertSame(
        evaluateScript(realm, 'new Error("boom").toString();').value,
        'Error: boom',
      );
      assertSame(
        evaluateScript(realm, 'new TypeError("nope").toString();').value,
        'TypeError: nope',
      );
      assertSame(
        evaluateScript(realm, 'new RangeError("r").toString();').value,
        'RangeError: r',
      );
    },
  },
  {
    name: 'Error.prototype.toString defaults an undefined name to "Error" and an undefined message to ""',
    run() {
      const realm = createRealm();
      // No message -> message is "" -> return name.
      assertSame(
        evaluateScript(realm, 'new Error().toString();').value,
        'Error',
      );
      assertSame(
        evaluateScript(realm, 'new Error("").toString();').value,
        'Error',
      );
      // Undefined name defaults to "Error".
      assertSame(
        evaluateScript(
          realm,
          'Error.prototype.toString.call({ message: "m" });',
        ).value,
        'Error: m',
      );
      assertSame(
        evaluateScript(realm, 'Error.prototype.toString.call({});').value,
        'Error',
      );
    },
  },
  {
    name: 'Error.prototype.toString returns the non-empty half when one of name/message is empty',
    run() {
      const realm = createRealm();
      // Empty name -> return message.
      assertSame(
        evaluateScript(
          realm,
          'Error.prototype.toString.call({ name: "", message: "msg" });',
        ).value,
        'msg',
      );
      // Empty message -> return name.
      assertSame(
        evaluateScript(
          realm,
          'Error.prototype.toString.call({ name: "N", message: "" });',
        ).value,
        'N',
      );
      // Both empty -> "".
      assertSame(
        evaluateScript(
          realm,
          'Error.prototype.toString.call({ name: "", message: "" });',
        ).value,
        '',
      );
    },
  },
  {
    name: 'Error.prototype.toString coerces name and message with ToString, reading name before message',
    run() {
      const realm = createRealm();
      assertSame(
        evaluateScript(
          realm,
          'Error.prototype.toString.call({ name: 24, message: 42 });',
        ).value,
        '24: 42',
      );
      assertSame(
        evaluateScript(
          realm,
          'var log = []; ' +
            'var o = { get name() { log.push("n"); return "G"; }, ' +
            'get message() { log.push("m"); return "msg"; } }; ' +
            'Error.prototype.toString.call(o) + "|" + log.join(",");',
        ).value,
        'G: msg|n,m',
      );
    },
  },
  {
    name: 'Error.prototype.toString throws a guest TypeError when this is not an object',
    run() {
      const realm = createRealm();
      assertGuestThrow(
        evaluateScript(realm, 'Error.prototype.toString.call(undefined);'),
        'TypeError',
        realm,
      );
      assertGuestThrow(
        evaluateScript(realm, 'Error.prototype.toString.call(5);'),
        'TypeError',
        realm,
      );
    },
  },
];

export default tests;
