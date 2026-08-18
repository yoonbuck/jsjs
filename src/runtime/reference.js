import { GuestErrorSignal } from './completion.js';
import { isAccessorDescriptor, isDataDescriptor } from './descriptors.js';
import { EngineObject, callAccessor } from './object.js';

/**
 * A Reference record (ECMA-262 8.7). `base` is the *resolution target* the
 * engine reads and writes through: an environment record, an object, or
 * `undefined`/`null` for an unresolvable reference.
 *
 * `thisValue` carries the reference's original base *value* — the spec's
 * `GetBase(V)`. For an ordinary property reference that value is the same
 * object as `base`; for a property reference on a primitive it is the
 * primitive itself, while `base` holds the transient `ToObject` wrapper
 * that resolves the lookup (11.2.1 step 6). Keeping both is what lets
 * 8.7.1/8.7.2's *special* `[[Get]]`/`[[Put]]` — and 11.2.3's method-call
 * `this` binding — hand the primitive to guest code instead of a wrapper
 * that is discarded the moment the reference is consumed.
 */
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
 *   getBindingValue: (
 *     name: string | symbol,
 *     strict: boolean,
 *     callerRealm?: import('./realm.js').Realm,
 *   ) => unknown,
 *   setMutableBinding: (
 *     name: string | symbol,
 *     value: unknown,
 *     strict: boolean,
 *     callerRealm?: import('./realm.js').Realm,
 *   ) => void,
 *   deleteBinding: (name: string | symbol) => boolean,
 *   implicitThisValue: () => unknown,
 * }}
 */
export function isEnvironmentRecord(base) {
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
 *   getReferencedValue: (
 *     name: string | symbol,
 *     callerRealm?: import('./realm.js').Realm,
 *   ) => unknown,
 *   setReferencedValue: (
 *     name: string | symbol,
 *     value: unknown,
 *     strict: boolean,
 *     callerRealm?: import('./realm.js').Realm,
 *   ) => void,
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
 * Implements ECMA-262 8.7 `HasPrimitiveBase`: the reference's base *value*
 * is a String, Number, Boolean, or Symbol primitive. `null` and `undefined`
 * never reach here — `CheckObjectCoercible` rejects them while the property
 * reference is being built (11.2.1 step 5) — and an environment-record
 * reference carries no base value at all.
 *
 * @param {Reference} reference
 * @returns {reference is Reference & { thisValue: string | number | boolean | symbol }}
 */
function hasPrimitiveBase(reference) {
  const value = reference.thisValue;

  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'symbol'
  );
}

/**
 * @param {unknown} base
 * @returns {base is {
 *   canPut: (name: string | symbol) => boolean,
 *   getOwnProperty: (name: string | symbol) => import('./descriptors.js').CompletePropertyDescriptor | undefined,
 *   getProperty: (name: string | symbol) => import('./descriptors.js').PropertyDescriptorRecord | undefined,
 * }}
 */
function isPrimitiveWrapperBase(base) {
  return (
    !!base &&
    typeof base === 'object' &&
    typeof (/** @type {any} */ (base).canPut) === 'function' &&
    typeof (/** @type {any} */ (base).getOwnProperty) === 'function' &&
    typeof (/** @type {any} */ (base).getProperty) === 'function'
  );
}

/**
 * Implements ECMA-262 8.7.1 `GetValue`.
 *
 * @param {Reference} reference
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {unknown}
 */
export function getValue(reference, callerRealm) {
  if (!isReference(reference)) {
    throw new TypeError('Expected a Reference record');
  }

  if (reference.base === null || reference.base === undefined) {
    throw new GuestErrorSignal(
      'ReferenceError',
      `${String(reference.referencedName)} is not defined`,
    );
  }

  if (isEnvironmentRecord(reference.base)) {
    return linkValueToGeneratorHostChain(
      callerRealm,
      reference.base.getBindingValue(
        reference.referencedName,
        reference.strict,
        callerRealm,
      ),
    );
  }

  if (hasPrimitiveBase(reference) && isPrimitiveWrapperBase(reference.base)) {
    return getPrimitiveBaseValue(reference, reference.base, callerRealm);
  }

  if (isPropertyReferenceBase(reference.base)) {
    linkValueToGeneratorHostChain(callerRealm, reference.base);
    return linkValueToGeneratorHostChain(
      callerRealm,
      reference.base.getReferencedValue(reference.referencedName, callerRealm),
    );
  }

  throw new TypeError('Unsupported reference base');
}

/**
 * The *special* `[[Get]]` of ECMA-262 8.7.1, used when the reference's
 * base is a primitive. It is deliberately not the wrapper object's
 * ordinary `[[Get]]`: an accessor found on the wrapper's prototype is
 * called with the **primitive** as its `this` value, so a strict getter on
 * `String.prototype` sees `"x"` rather than the transient wrapper that the
 * lookup was resolved against and that is discarded immediately after.
 * Data properties (including a String wrapper's `length` and its lazily
 * synthesised index properties) are read straight off the descriptor.
 *
 * @param {Reference} reference
 * @param {{
 *   getProperty: (name: string | symbol) => import('./descriptors.js').PropertyDescriptorRecord | undefined,
 * }} object The transient `ToObject` wrapper for the primitive base.
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {unknown}
 */
function getPrimitiveBaseValue(reference, object, callerRealm) {
  const descriptor = object.getProperty(reference.referencedName);

  if (descriptor === undefined) {
    return undefined;
  }

  if (isDataDescriptor(descriptor)) {
    return linkValueToGeneratorHostChain(callerRealm, descriptor.value);
  }

  return linkValueToGeneratorHostChain(
    callerRealm,
    descriptor.get === undefined
      ? undefined
      : callAccessor(descriptor.get, reference.thisValue, [], callerRealm),
  );
}

/**
 * @param {import('./realm.js').Realm | undefined} callerRealm
 * @param {unknown} value
 * @returns {unknown}
 */
export function linkValueToGeneratorHostChain(callerRealm, value) {
  if (
    callerRealm !== undefined &&
    value instanceof EngineObject &&
    value.agent !== null
  ) {
    callerRealm.agent.linkGeneratorHostChain(value.agent);
  }

  return value;
}

/**
 * Implements ECMA-262 8.7.2 `PutValue`. An unresolvable reference is *not*
 * an error in non-strict code: the assignment creates (or updates) a
 * property on the global object of the realm the reference came from, with
 * the `Throw` flag false. Strict references still throw a `ReferenceError`,
 * which is what keeps `x = 5` from silently declaring a global in strict
 * code.
 *
 * A property reference whose base is a primitive takes the *special*
 * `[[Put]]` of the same section rather than the wrapper object's ordinary
 * one — see `putPrimitiveBaseValue`.
 *
 * @param {Reference} reference
 * @param {unknown} value
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {unknown}
 */
export function putValue(reference, value, callerRealm) {
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
      callerRealm,
    );
    return value;
  }

  if (hasPrimitiveBase(reference) && isPrimitiveWrapperBase(reference.base)) {
    return putPrimitiveBaseValue(reference, reference.base, value, callerRealm);
  }

  if (isPropertyReferenceBase(reference.base)) {
    linkValueToGeneratorHostChain(callerRealm, reference.base);
    reference.base.setReferencedValue(
      reference.referencedName,
      value,
      reference.strict,
      callerRealm,
    );
    return value;
  }

  throw new TypeError('Unsupported reference base');
}

/**
 * The *special* `[[Put]]` of ECMA-262 8.7.2, used when the reference's
 * base is a primitive. The wrapper `ToObject` produced is transient, so
 * the algorithm refuses every write that would only land on it:
 *
 * - step 2: `[[CanPut]]` is false (a String wrapper's `length` and index
 *   properties, or an inherited setter-less accessor) — throw in strict
 *   code, otherwise return;
 * - step 4: the wrapper has an own data property — throw in strict code,
 *   otherwise return;
 * - steps 5–6: an own or inherited **accessor** with a setter is called
 *   with the *primitive* as its `this` value, for strict and non-strict
 *   references alike, so a strict setter observes `"x"` rather than the
 *   wrapper (a non-strict setter re-boxes it in 10.4.3, unchanged);
 * - step 7: anything else would create an own property on the transient
 *   object — throw in strict code, otherwise return.
 *
 * The non-strict paths are silent no-ops, which is what keeps
 * `"x".missing = 1` legal and unobservable; the strict paths throw a guest
 * `TypeError` raised as a `GuestErrorSignal`, exactly like every other
 * strict property-assignment rejection, so the nearest realm-aware
 * boundary turns it into a catchable guest throw in the usual order
 * (after the right-hand side has been evaluated).
 *
 * @param {Reference} reference
 * @param {{
 *   canPut: (name: string | symbol) => boolean,
 *   getOwnProperty: (name: string | symbol) => import('./descriptors.js').CompletePropertyDescriptor | undefined,
 *   getProperty: (name: string | symbol) => import('./descriptors.js').PropertyDescriptorRecord | undefined,
 * }} object The transient `ToObject` wrapper for the primitive base.
 * @param {unknown} value
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {unknown}
 */
function putPrimitiveBaseValue(reference, object, value, callerRealm) {
  const name = reference.referencedName;

  if (!object.canPut(name)) {
    return rejectPrimitivePut(reference, value, 'Cannot assign to property');
  }

  if (isDataDescriptor(object.getOwnProperty(name))) {
    return rejectPrimitivePut(
      reference,
      value,
      'Cannot assign to a data property of a primitive value',
    );
  }

  const descriptor = object.getProperty(name);

  if (
    descriptor !== undefined &&
    isAccessorDescriptor(descriptor) &&
    descriptor.set !== undefined
  ) {
    callAccessor(descriptor.set, reference.thisValue, [value], callerRealm);
    return value;
  }

  return rejectPrimitivePut(
    reference,
    value,
    'Cannot create a property on a primitive value',
  );
}

/**
 * Rejects one of the special `[[Put]]` steps above: a guest `TypeError`
 * for a strict reference, a silent no-op for a non-strict one.
 *
 * @param {Reference} reference
 * @param {unknown} value
 * @param {string} message
 * @returns {unknown}
 */
function rejectPrimitivePut(reference, value, message) {
  if (reference.strict) {
    throw new GuestErrorSignal('TypeError', message);
  }

  return value;
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
    throw new GuestErrorSignal(
      'ReferenceError',
      `${String(reference.referencedName)} is not defined`,
    );
  }

  globalObject.put(reference.referencedName, value, false);
  return value;
}
