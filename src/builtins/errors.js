import { EngineObject } from '../runtime/object.js';
import { EngineFunction } from '../runtime/function-object.js';
import { createReturnCompletion } from '../runtime/completion.js';

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
 * }} ErrorIntrinsics
 */

/**
 * The four native error names this milestone installs. ECMA-262 15.11.6 lists
 * six (`EvalError`, `RangeError`, `ReferenceError`, `SyntaxError`,
 * `TypeError`, `URIError`); this engine implements the four that are needed
 * for current guest-visible semantics.
 */
const ERROR_NAMES = /** @type {const} */ ([
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'RangeError',
]);

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
  const proto = new EngineObject(errorPrototype);
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
 * and returns that object. Because the execute body always returns an
 * `EngineObject`, `EngineFunction#constructFunction` uses the returned
 * object as the result of `new Error(…)`, discarding the pre-built instance
 * — the semantics remain identical to 15.11.2.1 since both paths produce
 * an identical object.
 *
 * The function's auto-generated `prototype` property (set by `EngineFunction`'s
 * constructor) is replaced with `errorPrototype` and made non-writable per
 * 15.11.3.1. `errorPrototype.constructor` is then pointed back to the
 * returned constructor per 15.11.4/15.11.7.
 *
 * @param {Realm} realm
 * @param {string} name
 * @param {EngineObject} errorPrototype
 * @returns {EngineFunction}
 */
function buildErrorConstructor(realm, name, errorPrototype) {
  const ctor = new EngineFunction({
    realm,
    parameterNames: ['message'],
    scope: realm.globalEnvironment,
    strict: false,
    /**
     * @param {EngineFunction} _fn
     * @param {unknown} _thisValue
     * @param {readonly unknown[]} args
     * @returns {{ type: string, value: unknown }}
     */
    execute(_fn, _thisValue, args) {
      const instance = new EngineObject(errorPrototype);

      if (args[0] !== undefined) {
        instance.defineOwnProperty('message', {
          value: String(args[0]),
          writable: true,
          enumerable: false,
          configurable: true,
        });
      }

      return createReturnCompletion(instance);
    },
  });

  // Replace the auto-generated prototype with the error prototype object
  // and mark it non-writable (15.11.3.1).
  ctor.defineOwnProperty('prototype', {
    value: errorPrototype,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  // Wire constructor back-reference (15.11.4.1 / 15.11.7.7).
  errorPrototype.defineOwnProperty('constructor', {
    value: ctor,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  // Name of the error subclass, per 15.11.7.9 (the auto-generated name from
  // EngineFunction is empty; we shadow it with the real error name here).
  ctor.defineOwnProperty('name', {
    value: name,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  return ctor;
}

/**
 * Builds all five ES5 error constructors and their prototypes for one realm
 * (ECMA-262 15.11). The `%Error.prototype%` object carries `name: "Error"`
 * and `message: ""` as own non-enumerable data properties; each native error
 * prototype inherits from it and shadows only `name` with its own type
 * string. This gives every error instance a consistent `.name`/`.message`
 * read path through the prototype chain.
 *
 * Call this **after** `realm.globalEnvironment` is available (the
 * constructor objects need it as their lexical scope) but **before** any
 * guest code runs.
 *
 * @param {Realm} realm
 * @returns {ErrorIntrinsics & {
 *   errorConstructor: EngineFunction,
 *   typeErrorConstructor: EngineFunction,
 *   referenceErrorConstructor: EngineFunction,
 *   syntaxErrorConstructor: EngineFunction,
 *   rangeErrorConstructor: EngineFunction,
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
  // constructor inherits from %Function.prototype% (via EngineFunction).
  /** @type {Record<string, EngineObject>} */
  const nativePrototypes = {};
  /** @type {Record<string, EngineFunction>} */
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
    typeErrorConstructor: /** @type {EngineFunction} */ (
      nativeConstructors['TypeError']
    ),
    referenceErrorPrototype: nativePrototypes['ReferenceError'],
    referenceErrorConstructor: /** @type {EngineFunction} */ (
      nativeConstructors['ReferenceError']
    ),
    syntaxErrorPrototype: nativePrototypes['SyntaxError'],
    syntaxErrorConstructor: /** @type {EngineFunction} */ (
      nativeConstructors['SyntaxError']
    ),
    rangeErrorPrototype: nativePrototypes['RangeError'],
    rangeErrorConstructor: /** @type {EngineFunction} */ (
      nativeConstructors['RangeError']
    ),
  };
}

/**
 * Installs the five error constructors on `globalObject` as non-enumerable,
 * writable, configurable data properties per ECMA-262 15.1.
 *
 * @param {EngineObject} globalObject
 * @param {ReturnType<typeof createErrorIntrinsics>} errorIntrinsics
 * @returns {void}
 */
export function installErrorConstructors(globalObject, errorIntrinsics) {
  /** @type {[string, EngineFunction][]} */
  const ctors = [
    ['Error', errorIntrinsics.errorConstructor],
    ['TypeError', errorIntrinsics.typeErrorConstructor],
    ['ReferenceError', errorIntrinsics.referenceErrorConstructor],
    ['SyntaxError', errorIntrinsics.syntaxErrorConstructor],
    ['RangeError', errorIntrinsics.rangeErrorConstructor],
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
 * The prototype key mapping follows the intrinsic property names added by
 * `createErrorIntrinsics`: `"TypeError"` → `intrinsics.typeErrorPrototype`,
 * etc. An unknown type name falls back to `intrinsics.errorPrototype`.
 *
 * @param {import('../runtime/realm.js').Realm} realm
 * @param {string} typeName
 * @param {string} message
 * @returns {EngineObject}
 */
export function createGuestError(realm, typeName, message) {
  const intrinsics = /** @type {any} */ (realm.intrinsics);

  const protoKey = `${typeName.charAt(0).toLowerCase()}${typeName.slice(1)}Prototype`;
  const proto =
    intrinsics[protoKey] instanceof EngineObject
      ? /** @type {EngineObject} */ (intrinsics[protoKey])
      : intrinsics.errorPrototype;

  const instance = new EngineObject(proto);

  instance.defineOwnProperty('message', {
    value: message,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  return instance;
}
