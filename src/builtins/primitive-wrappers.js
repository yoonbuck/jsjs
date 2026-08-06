import {
  createPrimitiveWrapper,
  thisBooleanValue,
  thisStringValue,
} from '../runtime/primitive-object.js';
import { toBoolean, toNumber, toString } from '../runtime/conversion.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 * @typedef {import('../runtime/object.js').EngineObject} EngineObject
 *
 * @typedef {{
 *   stringConstructor: import('./shared.js').NativeFunction,
 *   numberConstructor: import('./shared.js').NativeFunction,
 *   booleanConstructor: import('./shared.js').NativeFunction,
 * }} PrimitiveWrapperIntrinsics
 */

/**
 * Wires the `String`, `Number`, and `Boolean` constructors onto the
 * `%String.prototype%`/`%Number.prototype%`/`%Boolean.prototype%`
 * intrinsics `builtins/fundamental.js` already created, and installs the
 * two prototype methods this milestone's shared tests require directly
 * (`Boolean.prototype.toString`, `String.prototype.valueOf`). The full
 * `String`/`Number`/`Boolean` prototype method families are out of scope
 * here and land in their own milestone tasks.
 *
 * @param {Realm} realm
 * @returns {PrimitiveWrapperIntrinsics}
 */
export function createPrimitiveWrapperIntrinsics(realm) {
  const { stringPrototype, numberPrototype, booleanPrototype } =
    realm.intrinsics;

  const stringConstructor = createWrapperConstructor(realm, {
    name: 'String',
    prototype: stringPrototype,
    convert: toString,
    defaultValue: '',
  });
  const numberConstructor = createWrapperConstructor(realm, {
    name: 'Number',
    prototype: numberPrototype,
    convert: toNumber,
    defaultValue: 0,
  });
  const booleanConstructor = createWrapperConstructor(realm, {
    name: 'Boolean',
    prototype: booleanPrototype,
    convert: toBoolean,
    defaultValue: false,
  });

  defineMethod(
    stringPrototype,
    'valueOf',
    realm.createNativeFunction({
      name: 'valueOf',
      length: 0,
      call(thisValue) {
        return thisStringValue(thisValue);
      },
    }),
  );
  defineMethod(
    booleanPrototype,
    'toString',
    realm.createNativeFunction({
      name: 'toString',
      length: 0,
      call(thisValue) {
        return thisBooleanValue(thisValue) ? 'true' : 'false';
      },
    }),
  );

  return { stringConstructor, numberConstructor, booleanConstructor };
}

/**
 * @param {EngineObject} globalObject
 * @param {PrimitiveWrapperIntrinsics} intrinsics
 * @returns {void}
 */
export function installPrimitiveWrapperConstructors(globalObject, intrinsics) {
  defineMethod(globalObject, 'String', intrinsics.stringConstructor);
  defineMethod(globalObject, 'Number', intrinsics.numberConstructor);
  defineMethod(globalObject, 'Boolean', intrinsics.booleanConstructor);
}

/**
 * Builds a wrapper constructor (ECMA-262 5.1 §15.5.1/§15.5.2 String,
 * §15.6.1/§15.6.2 Boolean, §15.7.1/§15.7.2 Number shape): called as a
 * function it converts its argument (or uses the type's default when none
 * is given) and returns the resulting primitive directly; called with
 * `new` it boxes that same primitive as a wrapper object against this
 * realm's prototype for the type.
 *
 * @param {Realm} realm
 * @param {{
 *   name: string,
 *   prototype: EngineObject,
 *   convert: (value: unknown) => string | number | boolean,
 *   defaultValue: string | number | boolean,
 * }} options
 * @returns {import('./shared.js').NativeFunction}
 */
function createWrapperConstructor(
  realm,
  { name, prototype, convert, defaultValue },
) {
  const constructor = realm.createNativeFunction({
    name,
    length: 1,
    prototype,
    call(_thisValue, args) {
      return args.length === 0 ? defaultValue : convert(args[0]);
    },
    construct(args) {
      const value = args.length === 0 ? defaultValue : convert(args[0]);
      return createPrimitiveWrapper(realm, value);
    },
  });

  prototype.defineOwnProperty('constructor', {
    value: constructor,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  return constructor;
}

/**
 * @param {EngineObject} target
 * @param {string} name
 * @param {unknown} value
 * @returns {void}
 */
function defineMethod(target, name, value) {
  target.defineOwnProperty(name, {
    value,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
