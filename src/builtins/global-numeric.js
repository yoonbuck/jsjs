import { toInt32, toNumber, toString } from '../runtime/conversion.js';
import { charCodeOfCodeUnit, codeUnitsBetween } from '../runtime/code-units.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 * @typedef {import('../runtime/object.js').EngineObject} EngineObject
 * @typedef {import('./shared.js').NativeFunction} NativeFunction
 *
 * @typedef {{
 *   parseIntFunction: NativeFunction,
 *   parseFloatFunction: NativeFunction,
 *   isNaNFunction: NativeFunction,
 *   isFiniteFunction: NativeFunction,
 * }} NumericGlobalIntrinsics
 */

/**
 * The code units ES5 7.2/7.3 make a `StrWhiteSpaceChar`: `WhiteSpace` (tab,
 * vertical tab, form feed, space, no-break space, the byte-order mark, and
 * the Unicode `Zs` category) together with `LineTerminator` (line feed,
 * carriage return, and the line/paragraph separators).
 *
 * U+180E is deliberately absent. It was a `Zs` space separator until Unicode
 * 6.3 reclassified it as a format character, and the version this project
 * pins is far past that, so `parseInt("\u180E1")` must be NaN rather than 1.
 */
const STR_WHITE_SPACE = new Set([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x00a0, 0x1680, 0x2000,
  0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009,
  0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
]);

const INFINITY_TEXT = 'Infinity';

/** Base-10^7 limbs keep every intermediate product exactly representable. */
const LIMB_BASE = 10000000;
const LIMB_DIGITS = 7;
const OVERFLOW_CHECK_LIMBS = 45;

/**
 * Builds this realm's four numeric global functions (ES5 15.1.2): `parseInt`,
 * `parseFloat`, `isNaN`, and `isFinite`.
 *
 * None of them delegates to the host functions of the same name. The host
 * `parseInt` would silently supply its own whitespace set, its own radix
 * validation, and its own `0x` rule; the point of this module is that all
 * three are the guest-observable semantics this engine defines, read out of
 * the ES5 grammar one code unit at a time.
 *
 * @param {Realm} realm
 * @returns {NumericGlobalIntrinsics}
 */
export function createNumericGlobalIntrinsics(realm) {
  const parseIntFunction = realm.createNativeFunction({
    name: 'parseInt',
    length: 2,
    call(_thisValue, args) {
      return parseIntegerLiteral(args[0], args[1]);
    },
  });
  const parseFloatFunction = realm.createNativeFunction({
    name: 'parseFloat',
    length: 1,
    call(_thisValue, args) {
      return parseDecimalLiteral(args[0]);
    },
  });
  const isNaNFunction = realm.createNativeFunction({
    name: 'isNaN',
    length: 1,
    call(_thisValue, args) {
      return Number.isNaN(toNumber(args[0]));
    },
  });
  const isFiniteFunction = realm.createNativeFunction({
    name: 'isFinite',
    length: 1,
    call(_thisValue, args) {
      return Number.isFinite(toNumber(args[0]));
    },
  });

  return {
    parseIntFunction,
    parseFloatFunction,
    isNaNFunction,
    isFiniteFunction,
  };
}

/**
 * Publishes the four functions on the global object with ES5 15.1's standard
 * attributes for a global function property.
 *
 * @param {EngineObject} globalObject
 * @param {NumericGlobalIntrinsics} intrinsics
 * @returns {void}
 */
export function installNumericGlobals(globalObject, intrinsics) {
  /** @type {[string, NativeFunction][]} */
  const entries = [
    ['parseInt', intrinsics.parseIntFunction],
    ['parseFloat', intrinsics.parseFloatFunction],
    ['isNaN', intrinsics.isNaNFunction],
    ['isFinite', intrinsics.isFiniteFunction],
  ];

  for (const [name, value] of entries) {
    globalObject.defineOwnProperty(name, {
      value,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
}

/**
 * ES5 15.1.2.2 `parseInt(string, radix)`.
 *
 * The coercion order is guest-observable and fixed by the specification:
 * `ToString(string)` runs first (step 1) and `ToInt32(radix)` second (step
 * 6), so a `radix` whose `valueOf` throws still sees the string's `toString`
 * called before it.
 *
 * @param {unknown} stringArgument
 * @param {unknown} radixArgument
 * @returns {number}
 */
function parseIntegerLiteral(stringArgument, radixArgument) {
  const inputString = toString(stringArgument);
  let index = skipStrWhiteSpace(inputString, 0);
  let sign = 1;

  if (index < inputString.length) {
    const unit = inputString[index];

    if (unit === '-') {
      sign = -1;
      index += 1;
    } else if (unit === '+') {
      index += 1;
    }
  }

  let radix = toInt32(radixArgument);
  let stripPrefix = true;

  if (radix === 0) {
    radix = 10;
  } else if (radix < 2 || radix > 36) {
    return NaN;
  } else if (radix !== 16) {
    stripPrefix = false;
  }

  if (
    stripPrefix &&
    index + 1 < inputString.length &&
    inputString[index] === '0' &&
    (inputString[index + 1] === 'x' || inputString[index + 1] === 'X')
  ) {
    index += 2;
    radix = 16;
  }

  const start = index;

  while (
    index < inputString.length &&
    radixDigitValue(charCodeOfCodeUnit(inputString[index]), radix) >= 0
  ) {
    index += 1;
  }

  if (index === start) {
    return NaN;
  }

  const magnitude = digitRunToNumber(
    codeUnitsBetween(inputString, start, index),
    radix,
  );

  // Negating rather than multiplying is what makes `parseInt("-0")` produce
  // -0 instead of +0.
  return sign < 0 ? -magnitude : magnitude;
}

/**
 * ES5 15.1.2.3 `parseFloat(string)`: the longest prefix of the
 * whitespace-trimmed argument that is a `StrDecimalLiteral`, converted to its
 * mathematical value.
 *
 * @param {unknown} stringArgument
 * @returns {number}
 */
function parseDecimalLiteral(stringArgument) {
  const inputString = toString(stringArgument);
  const start = skipStrWhiteSpace(inputString, 0);
  const end = scanStrDecimalLiteral(inputString, start);

  if (end < 0) {
    return NaN;
  }

  // The scanned prefix is exactly a StrDecimalLiteral and carries no
  // whitespace, so the engine's own ToNumber computes its MV -- including
  // the -0 of "-0" and the infinities of "Infinity".
  return toNumber(codeUnitsBetween(inputString, start, end));
}

/**
 * @param {string} value
 * @param {number} from
 * @returns {number} The index of the first code unit that is not a
 *   `StrWhiteSpaceChar`, or `value.length` if there is none.
 */
function skipStrWhiteSpace(value, from) {
  let index = from;

  while (
    index < value.length &&
    STR_WHITE_SPACE.has(charCodeOfCodeUnit(value[index]))
  ) {
    index += 1;
  }

  return index;
}

/**
 * Scans the ES5 9.3.1 `StrDecimalLiteral` grammar, returning the end index of
 * the *longest* prefix that satisfies it, or `-1` when no prefix does.
 *
 * "Longest" is the whole point: `parseFloat("1e")` is 1, not NaN, because
 * `1` is a `StrDecimalLiteral` and `1e` is not, so a truncated exponent (or a
 * truncated fraction, or a truncated `Infinity`) falls back to the last
 * position that was still valid rather than failing the parse.
 *
 * @param {string} value
 * @param {number} start
 * @returns {number}
 */
function scanStrDecimalLiteral(value, start) {
  let index = start;

  if (index < value.length && (value[index] === '+' || value[index] === '-')) {
    index += 1;
  }

  if (matchesAt(value, index, INFINITY_TEXT)) {
    return index + INFINITY_TEXT.length;
  }

  const integerStart = index;

  while (isDecimalDigitAt(value, index)) {
    index += 1;
  }

  const hasIntegerDigits = index > integerStart;
  let end = hasIntegerDigits ? index : -1;

  if (index < value.length && value[index] === '.') {
    let afterDot = index + 1;
    const fractionStart = afterDot;

    while (isDecimalDigitAt(value, afterDot)) {
      afterDot += 1;
    }

    // `DecimalDigits . DecimalDigits_opt` makes "5." valid, and
    // `. DecimalDigits` makes ".5" valid; a lone "." is neither.
    if (hasIntegerDigits || afterDot > fractionStart) {
      end = afterDot;
      index = afterDot;
    }
  }

  if (end < 0) {
    return -1;
  }

  if (index < value.length && (value[index] === 'e' || value[index] === 'E')) {
    let exponent = index + 1;

    if (
      exponent < value.length &&
      (value[exponent] === '+' || value[exponent] === '-')
    ) {
      exponent += 1;
    }

    const exponentDigitsStart = exponent;

    while (isDecimalDigitAt(value, exponent)) {
      exponent += 1;
    }

    // An ExponentPart only extends the prefix when it is complete.
    if (exponent > exponentDigitsStart) {
      end = exponent;
    }
  }

  return end;
}

/**
 * @param {string} value
 * @param {number} index
 * @returns {boolean}
 */
function isDecimalDigitAt(value, index) {
  return index < value.length && value[index] >= '0' && value[index] <= '9';
}

/**
 * @param {string} value
 * @param {number} index
 * @param {string} text
 * @returns {boolean}
 */
function matchesAt(value, index, text) {
  if (index + text.length > value.length) {
    return false;
  }

  for (let offset = 0; offset < text.length; offset += 1) {
    if (value[index + offset] !== text[offset]) {
      return false;
    }
  }

  return true;
}

/**
 * The value of one radix-R digit, or `-1` when the code unit is not a digit
 * in that radix. ES5 15.1.2.2 step 11 admits both cases of the Latin letters
 * for radices above 10.
 *
 * @param {number} code
 * @param {number} radix
 * @returns {number}
 */
function radixDigitValue(code, radix) {
  let value = -1;

  if (code >= 0x30 && code <= 0x39) {
    value = code - 0x30;
  } else if (code >= 0x61 && code <= 0x7a) {
    value = code - 0x61 + 10;
  } else if (code >= 0x41 && code <= 0x5a) {
    value = code - 0x41 + 10;
  }

  return value >= 0 && value < radix ? value : -1;
}

/**
 * ES5 15.1.2.2 steps 12-13: the Number value *for* the mathematical integer
 * the digit run denotes — that is, the correctly rounded one.
 *
 * Accumulating `total = total * radix + digit` in a double would not be that
 * value: past 2^53 each step rounds, and the errors compound, so
 * `parseInt("ffffffffffffffffffff", 16)` would land an ulp or more away from
 * the right answer. Instead the digits are accumulated exactly in base-10^7
 * limbs (every intermediate `limb * radix + carry` stays under 2^53, so no
 * step rounds), rendered as a decimal string, and handed to the engine's own
 * `ToNumber`, whose decimal-string conversion is correctly rounded by
 * definition. Radix 10 skips the re-encoding, since the digit run already
 * *is* that decimal string. Once an exact non-decimal prefix itself converts
 * to Infinity, every longer prefix must do so too, so accumulation stops there
 * instead of growing limbs for the rest of an arbitrarily long digit run.
 *
 * @param {string} digits
 * @param {number} radix
 * @returns {number}
 */
function digitRunToNumber(digits, radix) {
  if (radix === 10) {
    return toNumber(digits);
  }

  /** @type {number[]} Little-endian base-10^7 limbs. */
  const limbs = [0];

  for (let index = 0; index < digits.length; index += 1) {
    let carry = radixDigitValue(charCodeOfCodeUnit(digits[index]), radix);

    for (let limb = 0; limb < limbs.length; limb += 1) {
      const product = limbs[limb] * radix + carry;

      limbs[limb] = product % LIMB_BASE;
      carry = Math.floor(product / LIMB_BASE);
    }

    while (carry > 0) {
      limbs.push(carry % LIMB_BASE);
      carry = Math.floor(carry / LIMB_BASE);
    }

    // Forty-five base-10^7 limbs is the first size that can hold a 309-digit
    // integer. Smaller positive integers cannot overflow a binary64 Number.
    if (
      limbs.length >= OVERFLOW_CHECK_LIMBS &&
      toNumber(limbsToDecimal(limbs)) === Infinity
    ) {
      return Infinity;
    }
  }

  return toNumber(limbsToDecimal(limbs));
}

/**
 * @param {number[]} limbs Little-endian base-10^7 limbs.
 * @returns {string}
 */
function limbsToDecimal(limbs) {
  let decimal = String(limbs[limbs.length - 1]);

  for (let limb = limbs.length - 2; limb >= 0; limb -= 1) {
    decimal += padLimb(limbs[limb]);
  }

  return decimal;
}

/**
 * @param {number} limb
 * @returns {string}
 */
function padLimb(limb) {
  let text = String(limb);

  while (text.length < LIMB_DIGITS) {
    text = `0${text}`;
  }

  return text;
}
