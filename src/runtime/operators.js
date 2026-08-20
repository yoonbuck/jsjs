import {
  toNumber,
  toPrimitive,
  toString,
  toInt32,
  toUint32,
} from './conversion.js';
import { isCallable } from './capabilities.js';

/**
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
export function strictEqualityComparison(left, right) {
  const leftType = getSpecificationType(left);
  const rightType = getSpecificationType(right);

  if (leftType !== rightType) {
    return false;
  }

  if (leftType === 'Undefined' || leftType === 'Null') {
    return true;
  }

  if (leftType === 'Number') {
    if (Number.isNaN(/** @type {number} */ (left))) {
      return false;
    }

    if (Number.isNaN(/** @type {number} */ (right))) {
      return false;
    }
  }

  return left === right;
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {boolean}
 */
export function abstractEqualityComparison(left, right, callerRealm) {
  const leftType = getSpecificationType(left);
  const rightType = getSpecificationType(right);

  if (leftType === rightType) {
    return strictEqualityComparison(left, right);
  }

  if (
    (leftType === 'Null' && rightType === 'Undefined') ||
    (leftType === 'Undefined' && rightType === 'Null')
  ) {
    return true;
  }

  if (leftType === 'Number' && rightType === 'String') {
    return abstractEqualityComparison(
      left,
      toNumber(right, callerRealm),
      callerRealm,
    );
  }

  if (leftType === 'String' && rightType === 'Number') {
    return abstractEqualityComparison(
      toNumber(left, callerRealm),
      right,
      callerRealm,
    );
  }

  if (leftType === 'Boolean') {
    return abstractEqualityComparison(
      toNumber(left, callerRealm),
      right,
      callerRealm,
    );
  }

  if (rightType === 'Boolean') {
    return abstractEqualityComparison(
      left,
      toNumber(right, callerRealm),
      callerRealm,
    );
  }

  if (
    (leftType === 'String' || leftType === 'Number' || leftType === 'Symbol') &&
    rightType === 'Object'
  ) {
    return abstractEqualityComparison(
      left,
      toPrimitive(right, 'default', callerRealm),
      callerRealm,
    );
  }

  if (
    leftType === 'Object' &&
    (rightType === 'String' || rightType === 'Number' || rightType === 'Symbol')
  ) {
    return abstractEqualityComparison(
      toPrimitive(left, 'default', callerRealm),
      right,
      callerRealm,
    );
  }

  return false;
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {string | number}
 */
export function add(left, right, callerRealm) {
  const leftPrimitive = toPrimitive(left, 'default', callerRealm);
  const rightPrimitive = toPrimitive(right, 'default', callerRealm);

  if (typeof leftPrimitive === 'string' || typeof rightPrimitive === 'string') {
    return (
      toString(leftPrimitive, callerRealm) +
      toString(rightPrimitive, callerRealm)
    );
  }

  return (
    toNumber(leftPrimitive, callerRealm) + toNumber(rightPrimitive, callerRealm)
  );
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {number}
 */
export function subtract(left, right, callerRealm) {
  return toNumber(left, callerRealm) - toNumber(right, callerRealm);
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {number}
 */
export function multiply(left, right, callerRealm) {
  return toNumber(left, callerRealm) * toNumber(right, callerRealm);
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {number}
 */
export function divide(left, right, callerRealm) {
  return toNumber(left, callerRealm) / toNumber(right, callerRealm);
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {number}
 */
export function remainder(left, right, callerRealm) {
  return toNumber(left, callerRealm) % toNumber(right, callerRealm);
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @param {boolean} [leftFirst=true]
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {boolean | undefined}
 */
export function abstractRelationalComparison(
  left,
  right,
  leftFirst = true,
  callerRealm,
) {
  let leftPrimitive;
  let rightPrimitive;

  if (leftFirst) {
    leftPrimitive = toPrimitive(left, 'number', callerRealm);
    rightPrimitive = toPrimitive(right, 'number', callerRealm);
  } else {
    rightPrimitive = toPrimitive(right, 'number', callerRealm);
    leftPrimitive = toPrimitive(left, 'number', callerRealm);
  }

  if (typeof leftPrimitive === 'string' && typeof rightPrimitive === 'string') {
    return leftPrimitive < rightPrimitive;
  }

  const leftNumber = toNumber(leftPrimitive, callerRealm);
  const rightNumber = toNumber(rightPrimitive, callerRealm);

  if (Number.isNaN(leftNumber) || Number.isNaN(rightNumber)) {
    return undefined;
  }

  return leftNumber < rightNumber;
}

/**
 * ECMA-262 5.1 §11.7.1 Left shift.
 *
 * @param {unknown} left
 * @param {unknown} right
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {number}
 */
export function leftShift(left, right, callerRealm) {
  return toInt32(left, callerRealm) << (toUint32(right, callerRealm) & 0x1f);
}

/**
 * ECMA-262 5.1 §11.7.2 Signed right shift.
 *
 * @param {unknown} left
 * @param {unknown} right
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {number}
 */
export function signedRightShift(left, right, callerRealm) {
  return toInt32(left, callerRealm) >> (toUint32(right, callerRealm) & 0x1f);
}

/**
 * ECMA-262 5.1 §11.7.3 Unsigned right shift.
 *
 * @param {unknown} left
 * @param {unknown} right
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {number}
 */
export function unsignedRightShift(left, right, callerRealm) {
  return toUint32(left, callerRealm) >>> (toUint32(right, callerRealm) & 0x1f);
}

/**
 * ECMA-262 5.1 §11.10 Bitwise AND.
 *
 * @param {unknown} left
 * @param {unknown} right
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {number}
 */
export function bitwiseAND(left, right, callerRealm) {
  return toInt32(left, callerRealm) & toInt32(right, callerRealm);
}

/**
 * ECMA-262 5.1 §11.10 Bitwise XOR.
 *
 * @param {unknown} left
 * @param {unknown} right
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {number}
 */
export function bitwiseXOR(left, right, callerRealm) {
  return toInt32(left, callerRealm) ^ toInt32(right, callerRealm);
}

/**
 * ECMA-262 5.1 §11.10 Bitwise OR.
 *
 * @param {unknown} left
 * @param {unknown} right
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {number}
 */
export function bitwiseOR(left, right, callerRealm) {
  return toInt32(left, callerRealm) | toInt32(right, callerRealm);
}

/**
 * Implements the abstract semantics behind ECMA-262's `typeof` operator
 * (11.4.3's result table), independent of the `UnaryExpression` dispatch
 * that applies it. Callable engine objects report `'function'`; every
 * other non-primitive value reports `'object'`.
 *
 * @param {unknown} value
 * @returns {'undefined' | 'object' | 'boolean' | 'number' | 'string' | 'symbol' | 'function'}
 */
export function typeOf(value) {
  if (value === undefined) {
    return 'undefined';
  }

  if (value === null) {
    return 'object';
  }

  switch (typeof value) {
    case 'boolean':
      return 'boolean';
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    case 'symbol':
      return 'symbol';
    case 'function':
      return 'function';
    default:
      return isCallable(value) ? 'function' : 'object';
  }
}

/**
 * @param {unknown} value
 * @returns {'Undefined' | 'Null' | 'Boolean' | 'Number' | 'String' | 'Symbol' | 'Object'}
 */
function getSpecificationType(value) {
  if (value === undefined) {
    return 'Undefined';
  }

  if (value === null) {
    return 'Null';
  }

  switch (typeof value) {
    case 'boolean':
      return 'Boolean';
    case 'number':
      return 'Number';
    case 'string':
      return 'String';
    case 'symbol':
      return 'Symbol';
    default:
      return 'Object';
  }
}
