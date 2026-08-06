import {
  createPrimitiveWrapper,
  thisBooleanValue,
  thisNumberValue,
  thisStringValue,
} from '../runtime/primitive-object.js';
import {
  toBoolean,
  toInteger,
  toNumber,
  toString,
} from '../runtime/conversion.js';
import { GuestErrorSignal } from '../runtime/completion.js';

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
 * complete `Boolean.prototype` and `Number.prototype` method families
 * (`toString`/`valueOf`/`toLocaleString`, plus the `Number` constructor's
 * ES5 constants) along with the one `String.prototype` method (`valueOf`)
 * this milestone's shared tests require directly. The full `String`
 * prototype method family (and `Number`'s `toFixed`/`toExponential`/
 * `toPrecision` formatting methods) are out of scope here and land in
 * their own milestone tasks.
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

  defineConstant(numberConstructor, 'MAX_VALUE', Number.MAX_VALUE);
  defineConstant(numberConstructor, 'MIN_VALUE', Number.MIN_VALUE);
  defineConstant(numberConstructor, 'NaN', NaN);
  defineConstant(numberConstructor, 'NEGATIVE_INFINITY', -Infinity);
  defineConstant(numberConstructor, 'POSITIVE_INFINITY', Infinity);

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
    numberPrototype,
    'valueOf',
    realm.createNativeFunction({
      name: 'valueOf',
      length: 0,
      call(thisValue) {
        return thisNumberValue(thisValue);
      },
    }),
  );
  defineMethod(
    numberPrototype,
    'toString',
    realm.createNativeFunction({
      name: 'toString',
      length: 1,
      call(thisValue, args) {
        // ES5 15.7.4.2: the receiver is validated before the radix argument
        // is coerced at all (an incompatible receiver throws even when the
        // radix argument would itself throw while being coerced).
        const number = thisNumberValue(thisValue);
        const radixArgument = args[0];

        if (radixArgument === undefined) {
          return numberToStringRadix(number, 10);
        }

        const radix = toInteger(radixArgument);

        if (radix < 2 || radix > 36) {
          throw new GuestErrorSignal(
            'RangeError',
            'toString() radix must be between 2 and 36',
          );
        }

        return numberToStringRadix(number, radix);
      },
    }),
  );
  defineMethod(
    numberPrototype,
    'toLocaleString',
    realm.createNativeFunction({
      name: 'toLocaleString',
      length: 0,
      call(thisValue) {
        // Delegates only to the engine's own base-10 Number::ToString
        // algorithm, never to a (possibly guest-overridden) `this.toString`
        // property, matching ES5 15.7.4.3's non-generic contract.
        return numberToStringRadix(thisNumberValue(thisValue), 10);
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
  defineMethod(
    booleanPrototype,
    'valueOf',
    realm.createNativeFunction({
      name: 'valueOf',
      length: 0,
      call(thisValue) {
        return thisBooleanValue(thisValue);
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

/**
 * @param {EngineObject} target
 * @param {string} name
 * @param {unknown} value
 * @returns {void}
 */
function defineConstant(target, name, value) {
  target.defineOwnProperty(name, {
    value,
    writable: false,
    enumerable: false,
    configurable: false,
  });
}

const RADIX_DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * The maximum number of fractional digits `numberToStringRadix` generates
 * for a non-terminating fraction in radices other than 10. ES5 15.7.4.2
 * leaves the non-decimal radix representation implementation-defined; this
 * bound only prevents an unbounded loop for values (like binary-irrational
 * decimal fractions) whose expansion in the target radix never terminates,
 * and is large enough that every terminating fraction this suite exercises
 * finishes long before the cap is reached.
 */
const MAX_RADIX_FRACTION_DIGITS = 1100;

/**
 * Implements ES5 9.8.1's Number::ToString special cases (NaN, signed
 * zero, and the infinities) for every radix, and 15.7.4.2's radix-10
 * "same as ToString" rule by reusing the shared engine `toString`
 * conversion (proven equivalent to the spec's Number::ToString algorithm:
 * both produce the shortest decimal digit string that round-trips to the
 * same Number value). Non-decimal radices are converted with a portable
 * digit-by-digit algorithm using only primitive arithmetic (`Math.floor`,
 * `Math.abs`, `%`, `*`, `-`) — never a host `Number.prototype` method —
 * mirroring the same digit-extraction approach `runtime/conversion.js`'s
 * `toInt32`/`toUint32` already use for other radix-free numeric coercions.
 *
 * @param {number} number
 * @param {number} radix
 * @returns {string}
 */
function numberToStringRadix(number, radix) {
  if (Number.isNaN(number)) {
    return 'NaN';
  }

  if (number === 0) {
    // Covers -0 too: 9.8.1 renders both signed zeros as unsigned "0".
    return '0';
  }

  if (!Number.isFinite(number)) {
    return number > 0 ? 'Infinity' : '-Infinity';
  }

  if (radix === 10) {
    return toString(number);
  }

  const negative = number < 0;
  const magnitude = Math.abs(number);
  let integerPart = Math.floor(magnitude);
  let fractionPart = magnitude - integerPart;

  let digits = integerPart === 0 ? '0' : '';

  while (integerPart > 0) {
    const remainder = integerPart % radix;
    digits = RADIX_DIGITS[remainder] + digits;
    integerPart = Math.floor(integerPart / radix);
  }

  if (fractionPart > 0) {
    digits += '.';

    for (
      let count = 0;
      fractionPart > 0 && count < MAX_RADIX_FRACTION_DIGITS;
      count += 1
    ) {
      fractionPart *= radix;

      const digit = Math.floor(fractionPart);

      digits += RADIX_DIGITS[digit];
      fractionPart -= digit;
    }
  }

  return negative ? `-${digits}` : digits;
}
