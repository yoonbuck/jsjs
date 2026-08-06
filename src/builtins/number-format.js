import { toString } from '../runtime/conversion.js';
import { GuestErrorSignal } from '../runtime/completion.js';

/**
 * Portable decimal formatting for `Number.prototype.toFixed`,
 * `toExponential`, and `toPrecision` (ECMA-262 5.1 §15.7.4.5-§15.7.4.7).
 *
 * All three algorithms are specified against the *exact* mathematical value
 * of the receiver's double, not against its shortest decimal spelling: they
 * ask for the integer `n` whose scaled value is nearest to `x`, with ties
 * resolved to the larger `n`. That distinction is observable —
 * `(1.005).toFixed(2)` is "1.00" because the double written `1.005` is
 * exactly 1.004999999999999893…, while `(1000000000000000128).toFixed(0)`
 * prints all nineteen exact digits even though `ToString` of the same value
 * is "1000000000000000100" — so this module reconstructs the exact decimal
 * expansion instead of reusing any shortest-form conversion.
 *
 * The reconstruction uses only exact primitive arithmetic. Every finite
 * double is `m x 2^k` for integers `m < 2^53` and `k`, so:
 *
 * - `m` and `k` are recovered by halving/doubling (exact for powers of two)
 *   and one exact scaling by `2^52`;
 * - for `k >= 0` the exact value is the integer `m x 2^k`;
 * - for `k < 0` it is `m x 5^-k` scaled by `10^k`, because
 *   `m / 2^-k = m x 5^-k / 10^-k`.
 *
 * The integer `m x 2^k` or `m x 5^-k` is held in a little-endian array of
 * base-10^7 limbs and grown one factor at a time; each limb product stays
 * below 5 x 10^7, far inside the exactly representable integers, and the
 * limb splitting uses `%` and an exact subtraction rather than a rounded
 * division. The widest case (the smallest denormal, `k = -1126`) needs
 * about 1100 passes over roughly 115 limbs, which is bounded work.
 *
 * Rounding then happens on that exact digit string, so comparing the first
 * discarded digit against '5' decides "nearest, ties to larger" exactly:
 * the remaining digits can only break a tie in the same direction the first
 * digit already indicates.
 *
 * Two places legitimately need the *shortest* decimal form rather than the
 * exact one, and both are specified that way: `toFixed`'s `x >= 10^21`
 * fallback names `ToString(x)` outright, and `toExponential` with
 * `fractionDigits` omitted asks for the smallest digit count that still
 * round-trips — which is exactly the `s`, `k`, and `n` of ES5 9.8.1's
 * `ToString`. Both go through the engine's own `ToString` conversion (whose
 * output this module parses back into digits and an exponent), never
 * through a host `Number.prototype` formatting method.
 *
 * ## Deliberate ES5-errata deviations
 *
 * Three observable behaviors here follow the ES2015+/real-engine correction
 * of a literal ES5.1 defect rather than the literal 5.1 text, because every
 * shipping engine (and every later edition of the spec) has always behaved
 * this way and a literal-ES5 reading would be an obscure, untested corner
 * nobody relies on:
 *
 * 1. **`toExponential` zero-width.** Literal ES5 15.7.4.6 step 8.a resets
 *    `f` to 0 when `x` is 0, before building `m`, so `(0).toExponential(5)`
 *    would literally be `"0e+0"`. Every engine (and the ES2015+ successor
 *    to that step) instead keeps the caller's requested digit count, so
 *    `(0).toExponential(5)` is `"0.00000e+0"`. See the `value === 0` branch
 *    of `numberToExponential` below.
 * 2. **`toFixed` receiver-vs-argument order.** Literal ES5 15.7.4.5 coerces
 *    and range-checks `fractionDigits` (steps 1-2) *before* validating the
 *    receiver as a Number value (step 3), so a bad receiver with an
 *    out-of-range digit count would literally throw `RangeError`. ES2015+
 *    (and every engine) validates the receiver first instead — the same
 *    order ES5 already used for `toExponential` and `toPrecision` — so
 *    `Number.prototype.toFixed.call({}, 21)` throws `TypeError`. This
 *    implementation follows the engine order: `createPrimitiveWrapperIntrinsics`
 *    in `primitive-wrappers.js` validates the receiver via `thisNumberValue`
 *    before coercing `fractionDigits`.
 * 3. **`toPrecision(1)` in exponential notation.** Literal ES5 15.7.4.7 step
 *    10.c always splits `m` into `a + "." + b` (steps 10.c.i-ii), even when
 *    `b` is empty at `p = 1`, producing a trailing dot: `(123).toPrecision(1)`
 *    would literally be `"1.e+2"`. ES2015+ added an explicit `p !== 1` guard
 *    around that split (an errata fix), so every engine gives `"1e+2"`. See
 *    the `p !== 1` check in `numberToPrecision` below.
 */

/** The base of one limb in the big-integer representation. */
const LIMB_BASE = 1e7;

/** The number of decimal digits one limb holds. */
const LIMB_DIGITS = 7;

/** The number of fraction bits in an IEEE-754 double's significand. */
const SIGNIFICAND_FRACTION_BITS = 52;

/** `2^52`, the exact scale that turns a `[1, 2)` significand into an integer. */
const SIGNIFICAND_SCALE = 2 ** SIGNIFICAND_FRACTION_BITS;

/** `10^21`, the value at which `toFixed` switches to `ToString` (§15.7.4.5). */
const FIXED_NOTATION_LIMIT = 1e21;

const DIGIT_CHARACTERS = '0123456789';
const ZERO_CODE = 48;
const FIVE_CODE = 53;
const NINE_CODE = 57;

/**
 * ECMA-262 5.1 §15.7.4.5 `Number.prototype.toFixed` steps 2-9, with `f`
 * already coerced by `ToInteger`. The range check precedes every value
 * test, so `NaN.toFixed(21)` throws rather than returning "NaN".
 *
 * @param {number} x The receiver's number value.
 * @param {number} f `ToInteger(fractionDigits)`.
 * @returns {string}
 */
export function numberToFixed(x, f) {
  if (f < 0 || f > 20) {
    throw new GuestErrorSignal(
      'RangeError',
      'toFixed() digits must be between 0 and 20',
    );
  }

  if (Number.isNaN(x)) {
    return 'NaN';
  }

  let sign = '';
  let value = x;

  if (value < 0) {
    // -0 deliberately takes the positive path: -0 < 0 is false, so ES5
    // prints it unsigned.
    sign = '-';
    value = -value;
  }

  if (value >= FIXED_NOTATION_LIMIT) {
    // Covers +Infinity as well, which ToString renders as "Infinity".
    return sign + toString(value);
  }

  let m = fixedPointDigits(value, f);

  if (f !== 0) {
    let k = m.length;

    if (k <= f) {
      m = repeatZeros(f + 1 - k) + m;
      k = f + 1;
    }

    m = `${m.slice(0, k - f)}.${m.slice(k - f)}`;
  }

  return sign + m;
}

/**
 * ECMA-262 5.1 §15.7.4.6 `Number.prototype.toExponential` steps 3-14, with
 * `f` already coerced by `ToInteger`. NaN and the infinities return before
 * the range check, so `NaN.toExponential(-1)` is "NaN".
 *
 * @param {number} x The receiver's number value.
 * @param {number} f `ToInteger(fractionDigits)`.
 * @param {boolean} shortest Whether `fractionDigits` was undefined, which
 *   replaces `f` with the smallest round-tripping digit count (step 9.b).
 * @returns {string}
 */
export function numberToExponential(x, f, shortest) {
  if (Number.isNaN(x)) {
    return 'NaN';
  }

  let sign = '';
  let value = x;

  if (value < 0) {
    sign = '-';
    value = -value;
  }

  if (!Number.isFinite(value)) {
    return `${sign}Infinity`;
  }

  if (f < 0 || f > 20) {
    throw new GuestErrorSignal(
      'RangeError',
      'toExponential() digits must be between 0 and 20',
    );
  }

  let m;
  let e;
  let fractionCount = f;

  if (value === 0) {
    // Deliberate ES5-errata deviation (see the module JSDoc's "Deliberate
    // ES5-errata deviations" §1): literal ES5 step 8.a resets f to 0 here,
    // so `(0).toExponential(5)` would literally be "0e+0". Every engine
    // instead keeps the caller's requested width, so this uses the f the
    // caller asked for (0 itself when `shortest` is true, since
    // ToInteger(undefined) is 0) rather than overwriting it.
    m = repeatZeros(f + 1);
    e = 0;
  } else {
    const rounded = shortest
      ? shortestDecimal(value)
      : roundToSignificantDigits(value, f + 1);

    m = rounded.digits;
    e = rounded.exponent;

    if (shortest) {
      fractionCount = m.length - 1;
    }
  }

  if (fractionCount !== 0) {
    m = `${m.slice(0, 1)}.${m.slice(1)}`;
  }

  return sign + m + exponentSuffix(e);
}

/**
 * ECMA-262 5.1 §15.7.4.7 `Number.prototype.toPrecision` steps 4-14, with
 * `p` already coerced by `ToInteger` and the undefined-precision
 * short-circuit (step 2) handled by the caller. NaN and the infinities
 * return before the range check.
 *
 * @param {number} x The receiver's number value.
 * @param {number} p `ToInteger(precision)`.
 * @returns {string}
 */
export function numberToPrecision(x, p) {
  if (Number.isNaN(x)) {
    return 'NaN';
  }

  let sign = '';
  let value = x;

  if (value < 0) {
    sign = '-';
    value = -value;
  }

  if (!Number.isFinite(value)) {
    return `${sign}Infinity`;
  }

  if (p < 1 || p > 21) {
    throw new GuestErrorSignal(
      'RangeError',
      'toPrecision() argument must be between 1 and 21',
    );
  }

  let m;
  let e;

  if (value === 0) {
    m = repeatZeros(p);
    e = 0;
  } else {
    const rounded = roundToSignificantDigits(value, p);

    m = rounded.digits;
    e = rounded.exponent;
  }

  if (e < -6 || e >= p) {
    // The exponent is the one that survives rounding, so a carry can move a
    // value across this boundary: 9.9e-7 to one digit is 1e-6, which prints
    // as "0.000001" rather than "1e-6".
    if (p !== 1) {
      // Deliberate ES5-errata deviation (see the module JSDoc's "Deliberate
      // ES5-errata deviations" §3): literal ES5 step 10.c.i-ii always
      // splits m into `a + "." + b`, so p=1 (b empty) would literally
      // produce a trailing dot, e.g. "1.e+2". ES2015+ added this `p !== 1`
      // guard as an errata fix, matching every engine's "1e+2".
      m = `${m.slice(0, 1)}.${m.slice(1)}`;
    }

    return sign + m + exponentSuffix(e);
  }

  if (e === p - 1) {
    return sign + m;
  }

  if (e >= 0) {
    return `${sign}${m.slice(0, e + 1)}.${m.slice(e + 1)}`;
  }

  return `${sign}0.${repeatZeros(-(e + 1))}${m}`;
}

/**
 * The decimal digits of `n`, the integer nearest to `value x 10^f` with
 * ties resolved to the larger `n` (§15.7.4.5 step 8), with no leading
 * zeroes.
 *
 * @param {number} value A finite value in `[0, 10^21)`.
 * @param {number} f
 * @returns {string}
 */
function fixedPointDigits(value, f) {
  if (value === 0) {
    return '0';
  }

  const exact = exactDecimal(value);
  // `value x 10^f` lies in `[10^(exponent + f), 10^(exponent + f + 1))`, so
  // its integer part has this many digits.
  const integerDigitCount = exact.exponent + f + 1;

  if (integerDigitCount <= 0) {
    // `value x 10^f < 1`. It rounds up to 1 only when it is at least 0.5,
    // which requires both a leading integer-digit slot and a leading digit
    // of at least 5.
    return integerDigitCount === 0 && exact.digits.charCodeAt(0) >= FIVE_CODE
      ? '1'
      : '0';
  }

  const rounded = roundDigits(exact.digits, exact.exponent, integerDigitCount);
  // A carry ("99.9" to 3 digits becomes "100") raises the exponent, which
  // widens `n` by one digit.
  const width = rounded.exponent + f + 1;

  return rounded.digits + repeatZeros(width - rounded.digits.length);
}

/**
 * Rounds `value` to `precision` significant decimal digits, nearest with
 * ties to the larger magnitude, padding an exactly shorter expansion with
 * trailing zeroes.
 *
 * @param {number} value A finite value greater than 0.
 * @param {number} precision
 * @returns {{ digits: string, exponent: number }} `digits` has exactly
 *   `precision` characters and `exponent` is the power of ten of its
 *   leading digit.
 */
function roundToSignificantDigits(value, precision) {
  const exact = exactDecimal(value);

  return roundDigits(exact.digits, exact.exponent, precision);
}

/**
 * @param {string} digits The exact digits, with no leading zeroes.
 * @param {number} exponent The power of ten of `digits[0]`.
 * @param {number} precision
 * @returns {{ digits: string, exponent: number }}
 */
function roundDigits(digits, exponent, precision) {
  if (digits.length <= precision) {
    return {
      digits: digits + repeatZeros(precision - digits.length),
      exponent,
    };
  }

  const kept = digits.slice(0, precision);

  if (digits.charCodeAt(precision) < FIVE_CODE) {
    return { digits: kept, exponent };
  }

  const incremented = incrementDigits(kept);

  return incremented.length > precision
    ? { digits: incremented.slice(0, precision), exponent: exponent + 1 }
    : { digits: incremented, exponent };
}

/**
 * @param {string} digits
 * @returns {string} `digits` plus one; one character longer when every
 *   digit was a 9.
 */
function incrementDigits(digits) {
  let index = digits.length - 1;

  while (index >= 0 && digits.charCodeAt(index) === NINE_CODE) {
    index -= 1;
  }

  if (index < 0) {
    return `1${repeatZeros(digits.length)}`;
  }

  const raised = DIGIT_CHARACTERS[digits.charCodeAt(index) - ZERO_CODE + 1];

  return (
    digits.slice(0, index) + raised + repeatZeros(digits.length - index - 1)
  );
}

/**
 * The complete decimal expansion of a double, which is always finite: every
 * double is `m x 2^k`, and both `2^k` and `2^-k = 5^k / 10^k` terminate in
 * base ten.
 *
 * @param {number} value A finite value greater than 0.
 * @returns {{ digits: string, exponent: number }} `digits` carries no
 *   leading or trailing zeroes and `exponent` is the power of ten of its
 *   leading digit, so the exact value is
 *   `0.digits x 10^(exponent + 1)`.
 */
function exactDecimal(value) {
  if (!(value > 0) || !Number.isFinite(value)) {
    // Every current caller (fixedPointDigits, roundToSignificantDigits)
    // already filters out 0, negatives, NaN, and the infinities before
    // reaching here, so this only guards a future caller: both scaling
    // loops below never terminate for 0 (the `< 1` loop keeps doubling
    // zero) or +Infinity (the `>= 2` loop never shrinks it below 2). This
    // is an internal invariant, not a guest-observable error, so it uses a
    // host exception rather than `GuestErrorSignal` and is not exported.
    throw new RangeError('exactDecimal requires a finite value greater than 0');
  }

  let significand = value;
  let binaryExponent = 0;

  while (significand >= 2) {
    significand /= 2;
    binaryExponent += 1;
  }

  while (significand < 1) {
    // Exact for denormals too: doubling a denormal never loses a bit.
    significand *= 2;
    binaryExponent -= 1;
  }

  const limbs = limbsFromInteger(significand * SIGNIFICAND_SCALE);
  binaryExponent -= SIGNIFICAND_FRACTION_BITS;

  let tenScale = 0;

  if (binaryExponent >= 0) {
    for (let count = 0; count < binaryExponent; count += 1) {
      multiplyLimbs(limbs, 2);
    }
  } else {
    tenScale = -binaryExponent;

    for (let count = 0; count < tenScale; count += 1) {
      multiplyLimbs(limbs, 5);
    }
  }

  const digits = limbsToDecimalString(limbs);

  return {
    digits: stripTrailingZeros(digits),
    exponent: digits.length - 1 - tenScale,
  };
}

/**
 * The shortest decimal digits that round-trip to `value`, recovered from
 * the engine's own `ToString` (ES5 9.8.1 chooses exactly the shortest `s`
 * with `10^(k-1) <= s < 10^k`, which is what §15.7.4.6 step 9.b asks for).
 *
 * @param {number} value A finite value greater than 0.
 * @returns {{ digits: string, exponent: number }}
 */
function shortestDecimal(value) {
  const text = toString(value);
  const markerIndex = text.indexOf('e');
  const mantissa = markerIndex < 0 ? text : text.slice(0, markerIndex);
  const scale =
    markerIndex < 0 ? 0 : parseSignedInteger(text.slice(markerIndex + 1));
  const pointIndex = mantissa.indexOf('.');
  const integerPart = pointIndex < 0 ? mantissa : mantissa.slice(0, pointIndex);
  const fractionPart = pointIndex < 0 ? '' : mantissa.slice(pointIndex + 1);

  let digits = integerPart + fractionPart;
  let exponent = scale + integerPart.length - 1;
  let leading = 0;

  while (
    leading < digits.length - 1 &&
    digits.charCodeAt(leading) === ZERO_CODE
  ) {
    leading += 1;
    exponent -= 1;
  }

  digits = stripTrailingZeros(digits.slice(leading));

  return { digits, exponent };
}

/**
 * @param {string} text A decimal integer, optionally signed.
 * @returns {number}
 */
function parseSignedInteger(text) {
  const negative = text.charCodeAt(0) === 45;
  const start = negative || text.charCodeAt(0) === 43 ? 1 : 0;
  let magnitude = 0;

  for (let index = start; index < text.length; index += 1) {
    magnitude = magnitude * 10 + (text.charCodeAt(index) - ZERO_CODE);
  }

  return negative ? -magnitude : magnitude;
}

/**
 * @param {number} value A non-negative integer below `2^53`.
 * @returns {number[]} Little-endian base-`LIMB_BASE` limbs.
 */
function limbsFromInteger(value) {
  /** @type {number[]} */
  const limbs = [];
  let remaining = value;

  while (remaining > 0) {
    const limb = remaining % LIMB_BASE;

    limbs.push(limb);
    // Exact: `remaining - limb` is a multiple of `LIMB_BASE`.
    remaining = (remaining - limb) / LIMB_BASE;
  }

  return limbs.length === 0 ? [0] : limbs;
}

/**
 * Multiplies `limbs` in place by a small factor.
 *
 * @param {number[]} limbs
 * @param {number} factor A factor small enough that
 *   `factor x (LIMB_BASE - 1) + factor` stays exactly representable.
 * @returns {void}
 */
function multiplyLimbs(limbs, factor) {
  let carry = 0;

  for (let index = 0; index < limbs.length; index += 1) {
    const product = limbs[index] * factor + carry;
    const limb = product % LIMB_BASE;

    limbs[index] = limb;
    carry = (product - limb) / LIMB_BASE;
  }

  while (carry > 0) {
    const limb = carry % LIMB_BASE;

    limbs.push(limb);
    carry = (carry - limb) / LIMB_BASE;
  }
}

/**
 * @param {readonly number[]} limbs Little-endian base-`LIMB_BASE` limbs.
 * @returns {string} The decimal digits, with no leading zeroes.
 */
function limbsToDecimalString(limbs) {
  let text = integerToDecimalString(limbs[limbs.length - 1]);

  for (let index = limbs.length - 2; index >= 0; index -= 1) {
    const limb = integerToDecimalString(limbs[index]);

    text += repeatZeros(LIMB_DIGITS - limb.length) + limb;
  }

  return text;
}

/**
 * @param {number} value A non-negative integer.
 * @returns {string}
 */
function integerToDecimalString(value) {
  if (value === 0) {
    return '0';
  }

  let text = '';
  let remaining = value;

  while (remaining > 0) {
    const digit = remaining % 10;

    text = DIGIT_CHARACTERS[digit] + text;
    remaining = (remaining - digit) / 10;
  }

  return text;
}

/**
 * @param {string} text
 * @returns {string} `text` without trailing zeroes, keeping one digit.
 */
function stripTrailingZeros(text) {
  let end = text.length;

  while (end > 1 && text.charCodeAt(end - 1) === ZERO_CODE) {
    end -= 1;
  }

  return text.slice(0, end);
}

/**
 * §15.7.4.6 steps 11-13 and §15.7.4.7 step 10.c: an explicit sign, a zero
 * exponent spelled "+0", and no zero padding.
 *
 * @param {number} exponent
 * @returns {string}
 */
function exponentSuffix(exponent) {
  const sign = exponent < 0 ? '-' : '+';

  return `e${sign}${integerToDecimalString(Math.abs(exponent))}`;
}

/**
 * @param {number} count A count that may be negative or -0, both of which
 *   produce the empty string.
 * @returns {string}
 */
function repeatZeros(count) {
  return count > 0 ? '0'.repeat(count) : '';
}
