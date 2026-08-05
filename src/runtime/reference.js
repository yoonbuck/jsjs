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
 * An unresolvable reference: identifier resolution found no environment
 * record in the chain that binds the name (ECMA-262 8.7
 * `IsUnresolvableReference`). Reading one always throws a `ReferenceError`,
 * but a *non-strict* assignment to one creates a property on the global
 * object instead (8.7.2 step 3.b), so the record carries the global object
 * of the realm whose environment chain produced it.
 *
 * That global object is engine-owned state threaded from the realm through
 * `getIdentifierReference`; nothing here reaches for a host global. A
 * reference built outside any realm's environment chain carries `null` and
 * has nowhere to create the property, so assigning to it throws.
 */
export class UnresolvableReference extends Reference {
  /**
   * @param {string | symbol} referencedName
   * @param {boolean} strict
   * @param {import('./object.js').EngineObject | null} globalObject
   */
  constructor(referencedName, strict, globalObject) {
    super(undefined, referencedName, strict);
    this.globalObject = globalObject;
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
 * @returns {base is {
 *   getReferencedValue: (name: string | symbol) => unknown,
 *   setReferencedValue: (name: string | symbol, value: unknown, strict: boolean) => void,
 * }}
 */
function isPropertyReferenceBase(base) {
  return (
    !!base &&
    typeof base === 'object' &&
    typeof (/** @type {any} */ (base).getReferencedValue) === 'function' &&
    typeof (/** @type {any} */ (base).setReferencedValue) === 'function'
  );
}

/**
 * @param {unknown} globalObject
 * @returns {globalObject is {
 *   put: (name: string | symbol, value: unknown, throwOnError: boolean) => boolean,
 * }}
 */
function isGlobalPutTarget(globalObject) {
  return (
    !!globalObject &&
    typeof globalObject === 'object' &&
    typeof (/** @type {any} */ (globalObject).put) === 'function'
  );
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

  if (isPropertyReferenceBase(reference.base)) {
    return reference.base.getReferencedValue(reference.referencedName);
  }

  throw new TypeError('Unsupported reference base');
}

/**
 * Implements ECMA-262 8.7.2 `PutValue`. An unresolvable reference is *not*
 * an error in non-strict code: the assignment creates (or updates) a
 * property on the global object of the realm the reference came from, with
 * the `Throw` flag false. Strict references still throw a `ReferenceError`,
 * which is what keeps `x = 5` from silently declaring a global in strict
 * code.
 *
 * @param {Reference} reference
 * @param {unknown} value
 * @returns {unknown}
 */
export function putValue(reference, value) {
  if (!isReference(reference)) {
    throw new TypeError('Expected a Reference record');
  }

  if (reference.base === null || reference.base === undefined) {
    return putUnresolvableValue(reference, value);
  }

  if (isEnvironmentRecord(reference.base)) {
    reference.base.setMutableBinding(
      reference.referencedName,
      value,
      reference.strict,
    );
    return value;
  }

  if (isPropertyReferenceBase(reference.base)) {
    reference.base.setReferencedValue(
      reference.referencedName,
      value,
      reference.strict,
    );
    return value;
  }

  throw new TypeError('Unsupported reference base');
}

/**
 * The unresolvable half of `PutValue` (8.7.2 step 3).
 *
 * A reference that carries no global object — one built directly rather
 * than by identifier resolution against a realm's environment chain — has
 * no engine-owned object to define the property on, so it throws rather
 * than falling back to anything host-provided.
 *
 * @param {Reference} reference
 * @param {unknown} value
 * @returns {unknown}
 */
function putUnresolvableValue(reference, value) {
  const globalObject = /** @type {any} */ (reference).globalObject;

  if (reference.strict || !isGlobalPutTarget(globalObject)) {
    throw createUnresolvableReferenceError(String(reference.referencedName));
  }

  globalObject.put(reference.referencedName, value, false);
  return value;
}
