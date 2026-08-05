import { EngineObject } from './object.js';

/**
 * @param {unknown} value
 * @returns {value}
 */
export function checkObjectCoercible(value) {
  if (value === null || value === undefined) {
    throw new TypeError('Cannot convert null or undefined');
  }

  return value;
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
      return Number(primitive);
    default:
      throw new TypeError('Cannot convert value to number');
  }
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
