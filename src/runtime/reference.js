import { createUnresolvableReferenceError } from './errors.js';

export class Reference {
  /**
   * @param {object | undefined | null} base
   * @param {string | symbol} referencedName
   * @param {boolean} [strict=false]
   * @param {unknown} [thisValue=undefined]
   */
  constructor(base, referencedName, strict = false, thisValue = undefined) {
    this.base = base;
    this.referencedName = referencedName;
    this.strict = Boolean(strict);
    this.thisValue = thisValue;
  }
}

/**
 * @param {unknown} reference
 * @returns {reference is Reference}
 */
function isReference(reference) {
  return (
    !!reference &&
    typeof reference === 'object' &&
    'base' in reference &&
    'referencedName' in reference &&
    'strict' in reference
  );
}

/**
 * @param {unknown} base
 * @returns {base is {
 *   getBindingValue: (name: string | symbol, strict: boolean) => unknown,
 *   setMutableBinding: (name: string | symbol, value: unknown, strict: boolean) => void,
 * }}
 */
function isEnvironmentRecord(base) {
  return (
    !!base &&
    typeof base === 'object' &&
    typeof (/** @type {any} */ (base).getBindingValue) === 'function' &&
    typeof (/** @type {any} */ (base).setMutableBinding) === 'function'
  );
}

/**
 * @param {unknown} base
 * @returns {base is object}
 */
function isObjectLike(base) {
  return !!base && (typeof base === 'object' || typeof base === 'function');
}

/**
 * @param {Reference} reference
 * @returns {unknown}
 */
export function getValue(reference) {
  if (!isReference(reference)) {
    throw new TypeError('Expected a Reference record');
  }

  if (reference.base === null || reference.base === undefined) {
    throw createUnresolvableReferenceError(String(reference.referencedName));
  }

  if (isEnvironmentRecord(reference.base)) {
    return reference.base.getBindingValue(
      reference.referencedName,
      reference.strict,
    );
  }

  if (isObjectLike(reference.base)) {
    return /** @type {any} */ (reference.base)[reference.referencedName];
  }

  throw new TypeError('Unsupported reference base');
}

/**
 * @param {Reference} reference
 * @param {unknown} value
 * @returns {unknown}
 */
export function putValue(reference, value) {
  if (!isReference(reference)) {
    throw new TypeError('Expected a Reference record');
  }

  if (reference.base === null || reference.base === undefined) {
    throw createUnresolvableReferenceError(String(reference.referencedName));
  }

  if (isEnvironmentRecord(reference.base)) {
    reference.base.setMutableBinding(
      reference.referencedName,
      value,
      reference.strict,
    );
    return value;
  }

  if (isObjectLike(reference.base)) {
    /** @type {any} */ (reference.base)[reference.referencedName] = value;
    return value;
  }

  throw new TypeError('Unsupported reference base');
}
