import { EngineObject } from '../runtime/object.js';
import { toString } from '../runtime/conversion.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 * @typedef {import('../runtime/object.js').EngineObject} EngineObjectType
 *
 * @typedef {{
 *   errorPrototype: EngineObject,
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
 * `URIError`); these five are the ones some algorithm in this engine can
 * actually throw. `EvalError` is left out because ES5 itself says nothing in
 * the specification throws it — it exists only for compatibility — and this
 * engine has no `eval` to change that.
 */
const ERROR_NAMES = /** @type {const} */ ([
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
        value: toString(args[0]),
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
