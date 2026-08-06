import {
  createPrimitiveWrapper,
  thisBooleanValue,
  thisNumberValue,
  thisStringValue,
} from '../runtime/primitive-object.js';
import {
  checkObjectCoercible,
  toBoolean,
  toInteger,
  toNumber,
  toString,
  toUint16,
} from '../runtime/conversion.js';
import { GuestErrorSignal } from '../runtime/completion.js';
import {
  numberToExponential,
  numberToFixed,
  numberToPrecision,
} from './number-format.js';

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
 * (`toString`/`valueOf`/`toLocaleString` and the `toFixed`/
 * `toExponential`/`toPrecision` formatting methods, plus the `Number`
 * constructor's ES5 constants) along with `String`'s fundamental method
 * family: `String.fromCharCode` and `String.prototype`'s `toString`,
 * `valueOf`, `charAt`, `charCodeAt`, `concat`, `slice`, `substring`, and
 * `substr`. String's search/transformation/pattern methods (`indexOf`,
 * `toLowerCase`, `match`, `replace`, etc.) are out of scope here and land
 * in their own milestone task.
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
    stringPrototype,
    'toString',
    realm.createNativeFunction({
      name: 'toString',
      length: 0,
      call(thisValue) {
        return thisStringValue(thisValue);
      },
    }),
  );
  defineMethod(
    stringPrototype,
    'charAt',
    realm.createNativeFunction({
      name: 'charAt',
      length: 1,
      call(thisValue, args) {
        // ES5 15.5.4.4 is generic: CheckObjectCoercible + ToString(this),
        // not the strict "this string value" check toString/valueOf use.
        const value = stringMethodReceiver(thisValue);
        const position = toInteger(args[0]);

        return position < 0 || position >= value.length ? '' : value[position];
      },
    }),
  );
  defineMethod(
    stringPrototype,
    'charCodeAt',
    realm.createNativeFunction({
      name: 'charCodeAt',
      length: 1,
      call(thisValue, args) {
        const value = stringMethodReceiver(thisValue);
        const position = toInteger(args[0]);

        return position < 0 || position >= value.length
          ? NaN
          : value.charCodeAt(position);
      },
    }),
  );
  defineMethod(
    stringPrototype,
    'concat',
    realm.createNativeFunction({
      name: 'concat',
      length: 1,
      call(thisValue, args) {
        let value = stringMethodReceiver(thisValue);

        for (const arg of args) {
          value += toString(arg);
        }

        return value;
      },
    }),
  );
  defineMethod(
    stringPrototype,
    'slice',
    realm.createNativeFunction({
      name: 'slice',
      length: 2,
      call(thisValue, args) {
        // ES5 15.5.4.13: unlike substring, out-of-order start/end are never
        // swapped -- `from > to` simply yields a zero-length (empty) result.
        const value = stringMethodReceiver(thisValue);
        const length = value.length;
        const relativeStart = toInteger(args[0]);
        const endArgument = args[1];
        const relativeEnd =
          endArgument === undefined ? length : toInteger(endArgument);

        const from =
          relativeStart < 0
            ? Math.max(length + relativeStart, 0)
            : Math.min(relativeStart, length);
        const to =
          relativeEnd < 0
            ? Math.max(length + relativeEnd, 0)
            : Math.min(relativeEnd, length);

        return codeUnitsBetween(value, from, to);
      },
    }),
  );
  defineMethod(
    stringPrototype,
    'substring',
    realm.createNativeFunction({
      name: 'substring',
      length: 2,
      call(thisValue, args) {
        // ES5 15.5.4.15: both bounds clamp to [0, length] independently, and
        // an out-of-order pair is swapped rather than yielding "".
        const value = stringMethodReceiver(thisValue);
        const length = value.length;
        const startInteger = toInteger(args[0]);
        const endArgument = args[1];
        const endInteger =
          endArgument === undefined ? length : toInteger(endArgument);

        const finalStart = clampToLength(startInteger, length);
        const finalEnd = clampToLength(endInteger, length);

        return codeUnitsBetween(
          value,
          Math.min(finalStart, finalEnd),
          Math.max(finalStart, finalEnd),
        );
      },
    }),
  );
  defineMethod(
    stringPrototype,
    'substr',
    realm.createNativeFunction({
      name: 'substr',
      length: 2,
      call(thisValue, args) {
        // Annex B.2.3: a negative start wraps relative to length (clamped to
        // 0), and an omitted length argument defaults to +Infinity rather
        // than going through ToInteger(undefined) (which would be 0).
        const value = stringMethodReceiver(thisValue);
        const length = value.length;
        let start = toInteger(args[0]);
        const lengthArgument = args[1];
        const requestedLength =
          lengthArgument === undefined ? Infinity : toInteger(lengthArgument);

        if (start < 0) {
          start = Math.max(length + start, 0);
        }

        const resultLength = Math.min(
          Math.max(requestedLength, 0),
          length - start,
        );

        return resultLength <= 0
          ? ''
          : codeUnitsBetween(value, start, start + resultLength);
      },
    }),
  );
  defineMethod(
    stringConstructor,
    'fromCharCode',
    realm.createNativeFunction({
      name: 'fromCharCode',
      length: 1,
      call(_thisValue, args) {
        // ES5 15.5.3.2: each argument is reduced with ToUint16 left to
        // right (so both the coercion order and any thrown error's identity
        // match the arguments' original order), then mapped to its UTF-16
        // code unit. `String.fromCharCode` is the only way to construct a
        // single code unit from a number without host help; every other
        // decision here (coercion, looping, error propagation) is
        // engine-defined, matching the same "primitive string
        // indexing/length" allowance `primitive-object.js` documents for
        // reading code units.
        let result = '';

        for (const arg of args) {
          result += String.fromCharCode(toUint16(arg));
        }

        return result;
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
    numberPrototype,
    'toFixed',
    realm.createNativeFunction({
      name: 'toFixed',
      length: 1,
      call(thisValue, args) {
        // Deliberate ES5-errata deviation: literal ES5 15.7.4.5 coerces and
        // range-checks `fractionDigits` (steps 1-2) *before* validating the
        // receiver (step 3), so a bad receiver with an out-of-range digit
        // count would literally throw RangeError. ES2015+ and every real
        // engine validate the receiver first instead — the same order ES5
        // already used for `toExponential`/`toPrecision` below — so
        // `Number.prototype.toFixed.call({}, 21)` throws TypeError, and an
        // incompatible receiver throws even when coercing the argument
        // would itself throw (or itself be out of range). See
        // `number-format.js`'s module JSDoc for the full errata-policy
        // rationale.
        const number = thisNumberValue(thisValue);

        return numberToFixed(number, toInteger(args[0]));
      },
    }),
  );
  defineMethod(
    numberPrototype,
    'toExponential',
    realm.createNativeFunction({
      name: 'toExponential',
      length: 1,
      call(thisValue, args) {
        const number = thisNumberValue(thisValue);
        const fractionDigits = args[0];

        return numberToExponential(
          number,
          toInteger(fractionDigits),
          fractionDigits === undefined,
        );
      },
    }),
  );
  defineMethod(
    numberPrototype,
    'toPrecision',
    realm.createNativeFunction({
      name: 'toPrecision',
      length: 1,
      call(thisValue, args) {
        const number = thisNumberValue(thisValue);
        const precision = args[0];

        if (precision === undefined) {
          // ES5 15.7.4.7 step 2 returns ToString(x) before `precision` is
          // coerced or range checked, so `NaN.toPrecision()` is "NaN".
          return numberToStringRadix(number, 10);
        }

        return numberToPrecision(number, toInteger(precision));
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
 * ES5's generic `String.prototype` methods (`charAt`, `charCodeAt`,
 * `concat`, `slice`, `substring`, `substr`) accept any receiver: each
 * begins with `CheckObjectCoercible(this)` followed by `ToString(this)`,
 * not the strict "this string value" check `toString`/`valueOf` use via
 * `thisStringValue`. `checkObjectCoercible` throws a guest `TypeError` for
 * `null`/`undefined`; every other receiver flows through the shared engine
 * `toString` conversion, so a receiver's own `toString`/`valueOf` still run
 * in the normal `ToPrimitive` order.
 *
 * @param {unknown} thisValue
 * @returns {string}
 */
function stringMethodReceiver(thisValue) {
  checkObjectCoercible(thisValue);

  return toString(thisValue);
}

/**
 * Clamps an already-`ToInteger`-converted index into `[0, length]`
 * (ES5 15.5.4.15 steps 6-7's `min(max(value, 0), length)` shape), used by
 * `substring` for both of its bounds.
 *
 * @param {number} value
 * @param {number} length
 * @returns {number}
 */
function clampToLength(value, length) {
  return Math.min(Math.max(value, 0), length);
}

/**
 * Reads the code units of `value` in the half-open range `[from, to)` one
 * bracket-indexed code unit at a time -- never `String.prototype.slice`/
 * `substring`/`substr` -- consistent with the "primitive string
 * indexing/length" allowance `runtime/primitive-object.js` documents:
 * engine strings are host primitive strings, so reading one code unit by
 * index is representation glue, while the range/clamp/swap math that
 * produces `from`/`to` at each call site is fully engine-defined. When
 * `to <= from` (an empty, swapped, or fully out-of-range pair) the loop
 * never executes and this returns `""`.
 *
 * @param {string} value
 * @param {number} from
 * @param {number} to
 * @returns {string}
 */
function codeUnitsBetween(value, from, to) {
  let result = '';

  for (let index = from; index < to; index += 1) {
    result += value[index];
  }

  return result;
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
