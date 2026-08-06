import { EngineObject } from './object.js';
import { EnginePrimitiveObject } from './primitive-object.js';
import { GuestErrorSignal } from './completion.js';

/**
 * @param {unknown} value
 * @returns {value}
 */
export function checkObjectCoercible(value) {
  if (value === null || value === undefined) {
    throw new GuestErrorSignal('TypeError', 'Cannot convert null or undefined');
  }

  return value;
}

/**
 * @param {import('./realm.js').Realm} realm
 * @param {unknown} value
 * @returns {EngineObject}
 */
export function toObject(realm, value) {
  checkObjectCoercible(value);

  if (value instanceof EngineObject) {
    return value;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return new EnginePrimitiveObject(realm.intrinsics.objectPrototype, value);
  }

  throw new TypeError(`Cannot convert ${typeof value} to an object`);
}

/**
 * @param {unknown} value
 * @param {'string' | 'number' | 'default'} [preferredType='default']
 * @returns {string | number | boolean | null | undefined}
 */
export function toPrimitive(value, preferredType = 'default') {
  if (isPrimitive(value)) {
    return value;
  }

  if (value instanceof EngineObject) {
    return value.defaultValue(
      preferredType === 'default' ? 'number' : preferredType,
    );
  }

  throw new TypeError('Unsupported object coercion');
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function toBoolean(value) {
  if (value === undefined || value === null) {
    return false;
  }

  switch (typeof value) {
    case 'boolean':
      return value;
    case 'number':
      return value !== 0 && !Number.isNaN(value);
    case 'string':
      return value.length > 0;
    default:
      return true;
  }
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function toNumber(value) {
  const primitive = isPrimitive(value) ? value : toPrimitive(value, 'number');

  if (primitive === undefined) {
    return NaN;
  }

  if (primitive === null) {
    return 0;
  }

  switch (typeof primitive) {
    case 'boolean':
      return primitive ? 1 : 0;
    case 'number':
      return primitive;
    case 'string':
      return stringToNumber(primitive);
    default:
      throw new TypeError('Cannot convert value to number');
  }

  /**
   * Converts the ES5 StringNumericLiteral grammar without accepting newer
   * host-language forms such as binary, octal, or numeric-separator literals.
   *
   * @param {string} value
   * @returns {number}
   */
  function stringToNumber(value) {
    const source = value.replace(
      /^[\u0009-\u000d\u0020\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\u0009-\u000d\u0020\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$/g,
      '',
    );

    if (source === '') {
      return 0;
    }

    if (/^[+-]?Infinity$/.test(source)) {
      return source[0] === '-' ? -Infinity : Infinity;
    }

    if (/^0[xX][0-9a-fA-F]+$/.test(source)) {
      return Number.parseInt(source.slice(2), 16);
    }

    if (
      !/^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/.test(source)
    ) {
      return NaN;
    }

    return Number(source);
  }
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function toInteger(value) {
  const number = toNumber(value);

  if (Number.isNaN(number)) {
    return 0;
  }

  if (number === 0 || !Number.isFinite(number)) {
    return number;
  }

  return Math.sign(number) * Math.floor(Math.abs(number));
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function toString(value) {
  const primitive = isPrimitive(value) ? value : toPrimitive(value, 'string');

  if (primitive === undefined) {
    return 'undefined';
  }

  if (primitive === null) {
    return 'null';
  }

  switch (typeof primitive) {
    case 'boolean':
      return primitive ? 'true' : 'false';
    case 'number':
    case 'string':
      return String(primitive);
    default:
      throw new TypeError('Cannot convert value to string');
  }
}

/**
 * @param {unknown} value
 * @returns {value is string | number | boolean | null | undefined}
 */
function isPrimitive(value) {
  return (
    value === null || (typeof value !== 'object' && typeof value !== 'function')
  );
}

/**
 * ECMA-262 5.1 §9.5 ToInt32.
 *
 * @param {unknown} value
 * @returns {number}
 */
export function toInt32(value) {
  const number = toNumber(value);

  if (!Number.isFinite(number)) {
    return +0;
  }

  const posInt = Math.sign(number) * Math.floor(Math.abs(number));
  let int32bit = posInt % 2 ** 32;

  if (int32bit < 0) {
    int32bit += 2 ** 32;
  }

  if (int32bit >= 2 ** 31) {
    return int32bit - 2 ** 32;
  }

  // Normalize -0 to +0: the spec's ToInt32 result set is [-2^31, 2^31),
  // which does not include -0 (only integer values are in the result).
  return int32bit === 0 ? 0 : int32bit;
}

/**
 * ECMA-262 5.1 §9.6 ToUint32.
 *
 * @param {unknown} value
 * @returns {number}
 */
export function toUint32(value) {
  const number = toNumber(value);

  if (!Number.isFinite(number)) {
    return +0;
  }

  const posInt = Math.sign(number) * Math.floor(Math.abs(number));
  let int32bit = posInt % 2 ** 32;

  if (int32bit < 0) {
    int32bit += 2 ** 32;
  }

  // Normalize -0 to +0: the spec's ToUint32 result set is [0, 2^32), which
  // does not include -0.
  return int32bit === 0 ? 0 : int32bit;
}
