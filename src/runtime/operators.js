import { toNumber, toPrimitive, toString } from './conversion.js';

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
 * @returns {boolean}
 */
export function abstractEqualityComparison(left, right) {
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
    return abstractEqualityComparison(left, toNumber(right));
  }

  if (leftType === 'String' && rightType === 'Number') {
    return abstractEqualityComparison(toNumber(left), right);
  }

  if (leftType === 'Boolean') {
    return abstractEqualityComparison(toNumber(left), right);
  }

  if (rightType === 'Boolean') {
    return abstractEqualityComparison(left, toNumber(right));
  }

  if (
    (leftType === 'String' || leftType === 'Number') &&
    rightType === 'Object'
  ) {
    return abstractEqualityComparison(left, toPrimitive(right));
  }

  if (
    leftType === 'Object' &&
    (rightType === 'String' || rightType === 'Number')
  ) {
    return abstractEqualityComparison(toPrimitive(left), right);
  }

  return false;
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @returns {string | number}
 */
export function add(left, right) {
  const leftPrimitive = toPrimitive(left);
  const rightPrimitive = toPrimitive(right);

  if (typeof leftPrimitive === 'string' || typeof rightPrimitive === 'string') {
    return toString(leftPrimitive) + toString(rightPrimitive);
  }

  return toNumber(leftPrimitive) + toNumber(rightPrimitive);
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @returns {number}
 */
export function subtract(left, right) {
  return toNumber(left) - toNumber(right);
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @returns {number}
 */
export function multiply(left, right) {
  return toNumber(left) * toNumber(right);
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @returns {number}
 */
export function divide(left, right) {
  return toNumber(left) / toNumber(right);
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @returns {number}
 */
export function remainder(left, right) {
  return toNumber(left) % toNumber(right);
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @param {boolean} [leftFirst=true]
 * @returns {boolean | undefined}
 */
export function abstractRelationalComparison(left, right, leftFirst = true) {
  let leftPrimitive;
  let rightPrimitive;

  if (leftFirst) {
    leftPrimitive = toPrimitive(left, 'number');
    rightPrimitive = toPrimitive(right, 'number');
  } else {
    rightPrimitive = toPrimitive(right, 'number');
    leftPrimitive = toPrimitive(left, 'number');
  }

  if (typeof leftPrimitive === 'string' && typeof rightPrimitive === 'string') {
    return leftPrimitive < rightPrimitive;
  }

  const leftNumber = toNumber(leftPrimitive);
  const rightNumber = toNumber(rightPrimitive);

  if (Number.isNaN(leftNumber) || Number.isNaN(rightNumber)) {
    return undefined;
  }

  return leftNumber < rightNumber;
}

/**
 * @param {unknown} value
 * @returns {'Undefined' | 'Null' | 'Boolean' | 'Number' | 'String' | 'Object'}
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
    default:
      return 'Object';
  }
}
