import { EngineObject } from '../runtime/object.js';
import { toNumber } from '../runtime/conversion.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 * @typedef {import('./shared.js').NativeFunction} NativeFunction
 *
 * @typedef {{ mathObject: EngineObject }} MathIntrinsics
 */

/**
 * The ES5 15.8.1 value properties, each an approximation the specification
 * states to about 20 significant decimal digits. They are written out here
 * rather than read from a host `Math` constant so the realm's numbers come
 * from this project's own text: the double nearest each of these literals is
 * exactly the double every conforming implementation must use.
 */
const CONSTANTS = Object.freeze({
  E: 2.7182818284590452354,
  LN10: 2.302585092994046,
  LN2: 0.6931471805599453,
  LOG2E: 1.4426950408889634,
  LOG10E: 0.4342944819032518,
  PI: 3.1415926535897932,
  SQRT1_2: 0.7071067811865476,
  SQRT2: 1.4142135623730951,
});

const { PI } = CONSTANTS;
const HALF_PI = PI / 2;
const QUARTER_PI = PI / 4;
const THREE_QUARTER_PI = (3 * PI) / 4;

/**
 * Builds this realm's `Math` object (ES5 15.8): an ordinary object whose
 * `[[Class]]` is `"Math"`, whose `[[Prototype]]` is `%Object.prototype%`, and
 * which has neither `[[Call]]` nor `[[Construct]]` — so `Math()` and
 * `new Math()` are both TypeErrors raised by the engine's own call machinery
 * rather than by anything Math defines.
 *
 * Every function installed here owns its specification's special cases
 * explicitly: NaN propagation, signed zero, the infinities, argument order,
 * and the `ToNumber` coercion of each argument. The remaining continuous part
 * of the transcendental functions is the "implementation-dependent
 * approximation" ES5 15.8.2 explicitly permits, and is the only part taken
 * from host arithmetic; nothing guest-observable about ordering, sign, or
 * error behaviour is left to the host.
 *
 * @param {Realm} realm
 * @returns {MathIntrinsics}
 */
export function createMathIntrinsics(realm) {
  const mathObject = new EngineObject(realm.intrinsics.objectPrototype, 'Math');

  for (const [name, value] of Object.entries(CONSTANTS)) {
    mathObject.defineOwnProperty(name, {
      value,
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }

  /** @type {[string, number, (args: readonly unknown[]) => number][]} */
  const functions = [
    ['abs', 1, (args) => mathAbs(toNumber(args[0]))],
    ['acos', 1, (args) => mathAcos(toNumber(args[0]))],
    ['asin', 1, (args) => mathAsin(toNumber(args[0]))],
    ['atan', 1, (args) => mathAtan(toNumber(args[0]))],
    ['atan2', 2, (args) => mathAtan2(toNumber(args[0]), toNumber(args[1]))],
    ['ceil', 1, (args) => mathCeil(toNumber(args[0]))],
    ['cos', 1, (args) => mathCos(toNumber(args[0]))],
    ['exp', 1, (args) => mathExp(toNumber(args[0]))],
    ['floor', 1, (args) => mathFloor(toNumber(args[0]))],
    ['log', 1, (args) => mathLog(toNumber(args[0]))],
    ['max', 2, (args) => mathMax(coerceAll(args))],
    ['min', 2, (args) => mathMin(coerceAll(args))],
    ['pow', 2, (args) => mathPow(toNumber(args[0]), toNumber(args[1]))],
    ['random', 0, () => mathRandom()],
    ['round', 1, (args) => mathRound(toNumber(args[0]))],
    ['sin', 1, (args) => mathSin(toNumber(args[0]))],
    ['sqrt', 1, (args) => mathSqrt(toNumber(args[0]))],
    ['tan', 1, (args) => mathTan(toNumber(args[0]))],
  ];

  for (const [name, length, body] of functions) {
    mathObject.defineOwnProperty(name, {
      value: realm.createNativeFunction({
        name,
        length,
        call: (_thisValue, args) => body(args),
      }),
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }

  return { mathObject };
}

/**
 * Publishes `Math` on the global object with ES5 15.1's standard attributes
 * for a global object-valued property: writable and configurable, but not
 * enumerable.
 *
 * @param {EngineObject} globalObject
 * @param {MathIntrinsics} intrinsics
 * @returns {void}
 */
export function installMathObject(globalObject, { mathObject }) {
  globalObject.defineOwnProperty('Math', {
    value: mathObject,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * ES5 15.8.2.11/15.8.2.12 step 1: `ToNumber` runs on *every* argument, in
 * argument order, before any comparison happens. A short-circuit on the
 * first NaN would skip the observable `valueOf` calls of later arguments.
 *
 * @param {readonly unknown[]} args
 * @returns {number[]}
 */
function coerceAll(args) {
  /** @type {number[]} */
  const numbers = [];

  for (let index = 0; index < args.length; index += 1) {
    numbers.push(toNumber(args[index]));
  }

  return numbers;
}

/**
 * ES5 15.8.2.1.
 *
 * @param {number} x
 * @returns {number}
 */
function mathAbs(x) {
  if (Number.isNaN(x)) {
    return NaN;
  }

  // Covers -0, whose absolute value is +0 rather than itself.
  if (x === 0) {
    return 0;
  }

  return x < 0 ? -x : x;
}

/**
 * ES5 15.8.2.9. The `-floor(-x)` identity is the specification's own note,
 * and it is what makes `ceil(-0.5)` produce `-0` instead of `+0`.
 *
 * @param {number} x
 * @returns {number}
 */
function mathCeil(x) {
  if (Number.isNaN(x) || x === 0 || !Number.isFinite(x)) {
    return x;
  }

  return -Math.floor(-x);
}

/**
 * ES5 15.8.2.9's companion, 15.8.2.9 `floor`. NaN, both zeros, and both
 * infinities are returned unchanged, which is also what preserves `-0`.
 *
 * @param {number} x
 * @returns {number}
 */
function mathFloor(x) {
  if (Number.isNaN(x) || x === 0 || !Number.isFinite(x)) {
    return x;
  }

  return Math.floor(x);
}

/**
 * ES5 15.8.2.15. Ties round toward +Infinity, so `round(-3.5)` is `-3`.
 *
 * The specification's own note warns that `floor(x + 0.5)` is *not* an
 * implementation of this: it disagrees for `-0.5 <= x < 0` (where the result
 * must be `-0`) and for the double just below `0.5`, where `x + 0.5` rounds
 * up to exactly `1`. Comparing the fraction `x - floor(x)` against `0.5`
 * avoids both: the subtraction of a finite double and its floor is exact, so
 * no rounding happens before the comparison.
 *
 * @param {number} x
 * @returns {number}
 */
function mathRound(x) {
  if (Number.isNaN(x) || x === 0 || !Number.isFinite(x)) {
    return x;
  }

  if (x > 0 && x < 0.5) {
    return 0;
  }

  if (x < 0 && x >= -0.5) {
    return -0;
  }

  const lower = Math.floor(x);

  return x - lower >= 0.5 ? lower + 1 : lower;
}

/**
 * ES5 15.8.2.11. The comparison is 11.8.5's, except that `+0` counts as
 * larger than `-0` — a distinction `>` alone cannot make.
 *
 * @param {readonly number[]} numbers
 * @returns {number}
 */
function mathMax(numbers) {
  let result = -Infinity;

  for (const number of numbers) {
    if (Number.isNaN(number)) {
      return NaN;
    }

    if (number > result || (number === 0 && Object.is(result, -0))) {
      result = number;
    }
  }

  return result;
}

/**
 * ES5 15.8.2.12, mirroring `mathMax`: `-0` counts as smaller than `+0`.
 *
 * @param {readonly number[]} numbers
 * @returns {number}
 */
function mathMin(numbers) {
  let result = Infinity;

  for (const number of numbers) {
    if (Number.isNaN(number)) {
      return NaN;
    }

    if (number < result || (Object.is(number, -0) && result === 0)) {
      result = number;
    }
  }

  return result;
}

/**
 * ES5 15.8.2.13's special-case table, in the specification's own order. Only
 * the final "implementation-dependent approximation" step reaches host
 * arithmetic; every case that ES5 pins down exactly — including the ones a
 * naive `x ** y` gets wrong, such as `pow(1, Infinity)` being NaN and the
 * odd/even integer exponent rules that decide the sign of a zero or infinite
 * result — is decided here.
 *
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function mathPow(x, y) {
  if (Number.isNaN(y)) {
    return NaN;
  }

  // A zero exponent wins over every base, NaN included.
  if (y === 0) {
    return 1;
  }

  if (Number.isNaN(x)) {
    return NaN;
  }

  const absoluteX = mathAbs(x);

  if (!Number.isFinite(y)) {
    if (absoluteX === 1) {
      return NaN;
    }

    const growsWithoutBound = absoluteX > 1 === y > 0;

    return growsWithoutBound ? Infinity : 0;
  }

  const oddInteger = Number.isInteger(y) && mathAbs(y % 2) === 1;

  if (absoluteX === Infinity) {
    const negativeResult = x < 0 && oddInteger;

    if (y > 0) {
      return negativeResult ? -Infinity : Infinity;
    }

    return negativeResult ? -0 : 0;
  }

  if (x === 0) {
    const negativeResult = Object.is(x, -0) && oddInteger;

    if (y > 0) {
      return negativeResult ? -0 : 0;
    }

    return negativeResult ? -Infinity : Infinity;
  }

  // A negative finite base raised to a non-integral finite exponent has no
  // real value.
  if (x < 0 && !Number.isInteger(y)) {
    return NaN;
  }

  return Math.pow(x, y);
}

/**
 * ES5 15.8.2.17.
 *
 * @param {number} x
 * @returns {number}
 */
function mathSqrt(x) {
  if (Number.isNaN(x) || x === 0 || x === Infinity) {
    return x;
  }

  if (x < 0) {
    return NaN;
  }

  return Math.sqrt(x);
}

/**
 * ES5 15.8.2.8.
 *
 * @param {number} x
 * @returns {number}
 */
function mathExp(x) {
  if (Number.isNaN(x)) {
    return NaN;
  }

  if (x === 0) {
    return 1;
  }

  if (x === Infinity) {
    return Infinity;
  }

  if (x === -Infinity) {
    return 0;
  }

  return Math.exp(x);
}

/**
 * ES5 15.8.2.10.
 *
 * @param {number} x
 * @returns {number}
 */
function mathLog(x) {
  if (Number.isNaN(x)) {
    return NaN;
  }

  // Both zeros, not just +0.
  if (x === 0) {
    return -Infinity;
  }

  if (x < 0) {
    return NaN;
  }

  if (x === 1) {
    return 0;
  }

  if (x === Infinity) {
    return Infinity;
  }

  return Math.log(x);
}

/**
 * ES5 15.8.2.16.
 *
 * @param {number} x
 * @returns {number}
 */
function mathSin(x) {
  if (Number.isNaN(x) || !Number.isFinite(x)) {
    return NaN;
  }

  // Returns x itself so -0 stays -0.
  if (x === 0) {
    return x;
  }

  return Math.sin(x);
}

/**
 * ES5 15.8.2.7.
 *
 * @param {number} x
 * @returns {number}
 */
function mathCos(x) {
  if (Number.isNaN(x) || !Number.isFinite(x)) {
    return NaN;
  }

  if (x === 0) {
    return 1;
  }

  return Math.cos(x);
}

/**
 * ES5 15.8.2.18.
 *
 * @param {number} x
 * @returns {number}
 */
function mathTan(x) {
  if (Number.isNaN(x) || !Number.isFinite(x)) {
    return NaN;
  }

  if (x === 0) {
    return x;
  }

  return Math.tan(x);
}

/**
 * ES5 15.8.2.3.
 *
 * @param {number} x
 * @returns {number}
 */
function mathAsin(x) {
  if (Number.isNaN(x) || x > 1 || x < -1) {
    return NaN;
  }

  if (x === 0) {
    return x;
  }

  return Math.asin(x);
}

/**
 * ES5 15.8.2.2.
 *
 * @param {number} x
 * @returns {number}
 */
function mathAcos(x) {
  if (Number.isNaN(x) || x > 1 || x < -1) {
    return NaN;
  }

  if (x === 1) {
    return 0;
  }

  return Math.acos(x);
}

/**
 * ES5 15.8.2.4.
 *
 * @param {number} x
 * @returns {number}
 */
function mathAtan(x) {
  if (Number.isNaN(x)) {
    return NaN;
  }

  if (x === 0) {
    return x;
  }

  if (x === Infinity) {
    return HALF_PI;
  }

  if (x === -Infinity) {
    return -HALF_PI;
  }

  return Math.atan(x);
}

/**
 * ES5 15.8.2.5's full two-argument table. `y` is the first argument and `x`
 * the second, which is the ordering the whole table depends on, and the sign
 * of a zero argument selects between results as different as `+0` and `+PI`.
 *
 * @param {number} y
 * @param {number} x
 * @returns {number}
 */
function mathAtan2(y, x) {
  if (Number.isNaN(y) || Number.isNaN(x)) {
    return NaN;
  }

  const xIsNegative = x < 0 || Object.is(x, -0);

  if (y === 0) {
    if (Object.is(y, -0)) {
      return xIsNegative ? -PI : -0;
    }

    return xIsNegative ? PI : 0;
  }

  if (x === 0) {
    return y > 0 ? HALF_PI : -HALF_PI;
  }

  const yIsInfinite = !Number.isFinite(y);
  const xIsInfinite = !Number.isFinite(x);

  if (yIsInfinite && xIsInfinite) {
    if (y > 0) {
      return x > 0 ? QUARTER_PI : THREE_QUARTER_PI;
    }

    return x > 0 ? -QUARTER_PI : -THREE_QUARTER_PI;
  }

  if (yIsInfinite) {
    return y > 0 ? HALF_PI : -HALF_PI;
  }

  if (xIsInfinite) {
    if (x > 0) {
      return y > 0 ? 0 : -0;
    }

    return y > 0 ? PI : -PI;
  }

  return Math.atan2(y, x);
}

/**
 * ES5 15.8.2.14. The specification requires a value in `[0, 1)` "chosen
 * randomly or pseudo randomly with approximately uniform distribution ...
 * using an implementation-dependent algorithm or strategy". There is nothing
 * observable to specify beyond the range, so the host's generator *is* the
 * implementation-dependent strategy; the range is re-asserted here so a host
 * that ever returned `1` could not leak that through this realm.
 *
 * @returns {number}
 */
function mathRandom() {
  const value = Math.random();

  if (!(value >= 0) || !(value < 1)) {
    throw new RangeError(
      'the host random source must produce a value in [0, 1)',
    );
  }

  return value;
}
