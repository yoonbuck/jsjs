import { EngineObject } from '../runtime/object.js';
import { toString } from '../runtime/conversion.js';
import { requireObjectReceiver } from './shared.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 * @typedef {import('../runtime/object.js').EngineObject} EngineObjectType
 *
 * @typedef {{
 *   errorPrototype: EngineObject,
 *   evalErrorPrototype: EngineObject,
 *   typeErrorPrototype: EngineObject,
 *   referenceErrorPrototype: EngineObject,
 *   syntaxErrorPrototype: EngineObject,
 *   rangeErrorPrototype: EngineObject,
 *   uriErrorPrototype: EngineObject,
 * }} ErrorIntrinsics
 */

/**
 * The native error names this engine installs. ECMA-262 15.11.6 lists six
 * (`EvalError`, `RangeError`, `ReferenceError`, `SyntaxError`, `TypeError`,
 * `URIError`) and 15.11 requires the global object to expose all of them.
 *
 * Five of these name an error some algorithm in this engine actually throws.
 * `EvalError` is different: ES5.1 defines the constructor and its prototype
 * but nothing in the specification ever throws one — it survives only for
 * backwards compatibility. It is still installed here so the constructor,
 * its prototype chain, and `instanceof EvalError` all behave like every real
 * engine and like the other five.
 */
const ERROR_NAMES = /** @type {const} */ ([
  'EvalError',
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'RangeError',
  'URIError',
]);

/**
 * The intrinsic key each native error prototype is published under.
 *
 * This is a table rather than a name transformation because the readable key
 * for `URIError` is `uriErrorPrototype`, which no lowercase-the-first-letter
 * rule produces — that rule yields `uRIErrorPrototype`. Writing the mapping
 * out once keeps `createErrorIntrinsics` and `createGuestError` reading the
 * same key for the same error, which is the only property that matters here.
 */
const ERROR_PROTOTYPE_KEYS = Object.freeze({
  Error: 'errorPrototype',
  EvalError: 'evalErrorPrototype',
  TypeError: 'typeErrorPrototype',
  ReferenceError: 'referenceErrorPrototype',
  SyntaxError: 'syntaxErrorPrototype',
  RangeError: 'rangeErrorPrototype',
  URIError: 'uriErrorPrototype',
});

/**
 * Builds one `[[ErrorPrototype]]` object inheriting from `errorPrototype`,
 * with own non-enumerable `name` (the subclass name string) and `message`
 * (`''`) properties per ECMA-262 15.11.6/15.11.7. The `constructor` property
 * is left for `buildErrorConstructor` to fill in after the constructor
 * object is created.
 *
 * @param {EngineObject} errorPrototype
 * @param {string} name
 * @returns {EngineObject}
 */
function buildNativeErrorPrototype(errorPrototype, name) {
  const proto = new EngineObject(errorPrototype, 'Error');
  proto.defineOwnProperty('name', {
    value: name,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  proto.defineOwnProperty('message', {
    value: '',
    writable: true,
    enumerable: false,
    configurable: true,
  });
  return proto;
}

/**
 * Builds one error constructor function (ECMA-262 15.11.1/15.11.2).
 *
 * When called — as either a function or a constructor — it creates a fresh
 * object inheriting from `errorPrototype`, sets an own `message` property
 * only when the first argument is not `undefined` (matching real engines so
 * that `.message` resolves to `""` from the prototype in the no-arg case),
 * and returns that object. The shared native-function factory installs
 * identical call and construct hooks, so `Error(message)` and
 * `new Error(message)` both delegate to the same realm-local algorithm.
 *
 * The native-function factory also installs the constructor's `prototype`
 * property with the standard built-in attributes (`[[Writable]]: false`,
 * `[[Enumerable]]: false`, `[[Configurable]]: false`); this helper only
 * needs to wire `errorPrototype.constructor` back to the created function.
 *
 * @param {Realm} realm
 * @param {string} name
 * @param {EngineObject} errorPrototype
 * @returns {import('./shared.js').NativeFunction}
 */
function buildErrorConstructor(realm, name, errorPrototype) {
  /**
   * @param {readonly unknown[]} args
   * @returns {EngineObject}
   */
  function createErrorInstance(args) {
    const instance = new EngineObject(errorPrototype, 'Error');

    if (args[0] !== undefined) {
      instance.defineOwnProperty('message', {
        value: toString(args[0], realm),
        writable: true,
        enumerable: false,
        configurable: true,
      });
    }

    return instance;
  }

  const ctor = realm.createNativeFunction({
    name,
    length: 1,
    prototype: errorPrototype,
    call(_thisValue, args) {
      return createErrorInstance(args);
    },
    construct(args) {
      return createErrorInstance(args);
    },
  });

  // Wire constructor back-reference (15.11.4.1 / 15.11.7.7).
  errorPrototype.defineOwnProperty('constructor', {
    value: ctor,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  return ctor;
}

/**
 * Installs `Error.prototype.toString` (ECMA-262 5.1 §15.11.4.4).
 *
 * The algorithm reads `name` and `message` off the `this` value through their
 * ordinary `[[Get]]` (so inherited defaults and accessor properties are
 * honoured), defaults a missing `name` to `"Error"` and a missing `message`
 * to `""`, and then joins them: an empty half is dropped so a bare name or a
 * bare message round-trips unchanged, and otherwise the result is
 * `name + ": " + message`. A non-object receiver is rejected with a guest
 * `TypeError` per step 2.
 *
 * The method is installed with the standard built-in attributes
 * (`[[Writable]]: true`, `[[Enumerable]]: false`, `[[Configurable]]: true`).
 *
 * @param {Realm} realm
 * @param {EngineObject} errorPrototype
 * @returns {void}
 */
function installErrorPrototypeToString(realm, errorPrototype) {
  errorPrototype.defineOwnProperty('toString', {
    value: realm.createNativeFunction({
      name: 'toString',
      length: 0,
      call(thisValue) {
        const object = requireObjectReceiver(
          thisValue,
          'Error.prototype.toString called on a non-object',
        );

        const rawName = object.get('name', object);
        const name = rawName === undefined ? 'Error' : toString(rawName, realm);

        const rawMessage = object.get('message', object);
        const message =
          rawMessage === undefined ? '' : toString(rawMessage, realm);

        if (message === '') {
          return name;
        }
        if (name === '') {
          return message;
        }
        return `${name}: ${message}`;
      },
    }),
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * Builds all six ES5 error constructors and their prototypes for one realm
 * (ECMA-262 15.11). The `%Error.prototype%` object carries `name: "Error"`
 * and `message: ""` as own non-enumerable data properties; each native error
 * prototype inherits from it and shadows only `name` with its own type
 * string. This gives every error instance a consistent `.name`/`.message`
 * read path through the prototype chain.
 *
 * Call this after the realm's global object/environment exist but before
 * any guest code runs.
 *
 * @param {Realm} realm
 * @returns {ErrorIntrinsics & {
 *   errorConstructor: import('./shared.js').NativeFunction,
 *   evalErrorConstructor: import('./shared.js').NativeFunction,
 *   typeErrorConstructor: import('./shared.js').NativeFunction,
 *   referenceErrorConstructor: import('./shared.js').NativeFunction,
 *   syntaxErrorConstructor: import('./shared.js').NativeFunction,
 *   rangeErrorConstructor: import('./shared.js').NativeFunction,
 *   uriErrorConstructor: import('./shared.js').NativeFunction,
 * }}
 */
export function createErrorIntrinsics(realm) {
  const { objectPrototype } = realm.intrinsics;

  // %Error.prototype% — the root of all error prototype chains (15.11.4).
  const errorPrototype = buildNativeErrorPrototype(objectPrototype, 'Error');

  const errorConstructor = buildErrorConstructor(
    realm,
    'Error',
    errorPrototype,
  );

  // %Error.prototype% carries its own toString (15.11.4.4); every native
  // error prototype inherits it rather than Object.prototype.toString.
  installErrorPrototypeToString(realm, errorPrototype);

  // Each native error subtype: prototype inherits from %Error.prototype%,
  // constructor inherits from %Function.prototype% via the native factory.
  /** @type {Record<string, EngineObject>} */
  const nativePrototypes = {};
  /** @type {Record<string, import('./shared.js').NativeFunction>} */
  const nativeConstructors = {};

  for (const name of ERROR_NAMES) {
    const proto = buildNativeErrorPrototype(errorPrototype, name);
    const ctor = buildErrorConstructor(realm, name, proto);
    nativePrototypes[name] = proto;
    nativeConstructors[name] = ctor;
  }

  return {
    errorPrototype,
    errorConstructor,
    evalErrorPrototype: nativePrototypes['EvalError'],
    evalErrorConstructor: /** @type {import('./shared.js').NativeFunction} */ (
      nativeConstructors['EvalError']
    ),
    typeErrorPrototype: nativePrototypes['TypeError'],
    typeErrorConstructor: /** @type {import('./shared.js').NativeFunction} */ (
      nativeConstructors['TypeError']
    ),
    referenceErrorPrototype: nativePrototypes['ReferenceError'],
    referenceErrorConstructor:
      /** @type {import('./shared.js').NativeFunction} */ (
        nativeConstructors['ReferenceError']
      ),
    syntaxErrorPrototype: nativePrototypes['SyntaxError'],
    syntaxErrorConstructor:
      /** @type {import('./shared.js').NativeFunction} */ (
        nativeConstructors['SyntaxError']
      ),
    rangeErrorPrototype: nativePrototypes['RangeError'],
    rangeErrorConstructor: /** @type {import('./shared.js').NativeFunction} */ (
      nativeConstructors['RangeError']
    ),
    uriErrorPrototype: nativePrototypes['URIError'],
    uriErrorConstructor: /** @type {import('./shared.js').NativeFunction} */ (
      nativeConstructors['URIError']
    ),
  };
}

/**
 * Installs the six error constructors on `globalObject` as non-enumerable,
 * writable, configurable data properties per ECMA-262 15.1.
 *
 * @param {EngineObject} globalObject
 * @param {ReturnType<typeof createErrorIntrinsics>} errorIntrinsics
 * @returns {void}
 */
export function installErrorConstructors(globalObject, errorIntrinsics) {
  /** @type {[string, import('./shared.js').NativeFunction][]} */
  const ctors = [
    ['Error', errorIntrinsics.errorConstructor],
    ['EvalError', errorIntrinsics.evalErrorConstructor],
    ['TypeError', errorIntrinsics.typeErrorConstructor],
    ['ReferenceError', errorIntrinsics.referenceErrorConstructor],
    ['SyntaxError', errorIntrinsics.syntaxErrorConstructor],
    ['RangeError', errorIntrinsics.rangeErrorConstructor],
    ['URIError', errorIntrinsics.uriErrorConstructor],
  ];

  for (const [name, ctor] of ctors) {
    globalObject.defineOwnProperty(name, {
      value: ctor,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
}

/**
 * Creates a guest `EngineObject` that is an instance of the named error
 * constructor, with an own `message` property when `message` is not
 * `undefined`. This is the internal factory that `GuestErrorSignal`
 * consumers call after locating the appropriate prototype in `intrinsics`.
 *
 * The prototype key mapping is `ERROR_PROTOTYPE_KEYS` above:
 * `"TypeError"` → `intrinsics.typeErrorPrototype`, `"URIError"` →
 * `intrinsics.uriErrorPrototype`, and so on. An unknown type name falls back
 * to `intrinsics.errorPrototype`.
 *
 * @param {import('../runtime/realm.js').Realm} realm
 * @param {string} typeName
 * @param {string} message
 * @returns {EngineObject}
 */
export function createGuestError(realm, typeName, message) {
  const intrinsics = /** @type {any} */ (realm.intrinsics);

  const protoKey = /** @type {Record<string, string>} */ (ERROR_PROTOTYPE_KEYS)[
    typeName
  ];
  const proto =
    protoKey !== undefined && intrinsics[protoKey] instanceof EngineObject
      ? /** @type {EngineObject} */ (intrinsics[protoKey])
      : intrinsics.errorPrototype;

  const instance = new EngineObject(proto, 'Error');

  instance.defineOwnProperty('message', {
    value: message,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  return instance;
}
