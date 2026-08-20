import { GuestErrorSignal } from './completion.js';
import {
  EngineObject,
  enterObjectOperationRealm,
  exitObjectOperationRealm,
} from './object.js';
import { SuperReferenceBase } from './super-reference.js';

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
 * @returns {base is EngineObject | SuperReferenceBase}
 */
function isPropertyReferenceBase(base) {
  return base instanceof EngineObject || base instanceof SuperReferenceBase;
}

/**
 * @param {unknown} globalObject
 * @returns {globalObject is EngineObject}
 */
function isGlobalSetTarget(globalObject) {
  return globalObject instanceof EngineObject;
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
 * @returns {base is EngineObject}
 */
function isPrimitiveWrapperBase(base) {
  return base instanceof EngineObject;
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

  const base = reference.base;

  if (isEnvironmentRecord(base)) {
    return linkValueToGeneratorHostChain(
      callerRealm,
      base.getBindingValue(
        reference.referencedName,
        reference.strict,
        callerRealm,
      ),
    );
  }

  if (hasPrimitiveBase(reference) && isPrimitiveWrapperBase(base)) {
    linkPropertyReferenceBase(callerRealm, base);
    return getPropertyReferenceValue(reference, base, callerRealm);
  }

  if (isPropertyReferenceBase(base)) {
    linkPropertyReferenceBase(callerRealm, base);
    return getPropertyReferenceValue(reference, base, callerRealm);
  }

  throw new TypeError('Unsupported reference base');
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
 * Temporarily exposes a caller Realm on a target Agent that already participates
 * in the caller's synchronous or generator host chain.
 *
 * @template T
 * @param {import('./realm.js').Realm | undefined} callerRealm
 * @param {import('./agent.js').Agent} targetAgent
 * @param {() => T} callback
 * @returns {T}
 */
export function withLinkedActiveExecutionRealm(
  callerRealm,
  targetAgent,
  callback,
) {
  if (callerRealm === undefined || callerRealm.agent === targetAgent) {
    return callback();
  }

  return targetAgent.withLinkedActiveExecutionRealm(
    callerRealm.agent,
    callback,
  );
}

/**
 * Implements ECMA-262 8.7.2 `PutValue`. An unresolvable reference is *not*
 * an error in non-strict code: the assignment creates (or updates) a
 * property on the global object of the realm the reference came from, with
 * the `Throw` flag false. Strict references still throw a `ReferenceError`,
 * which is what keeps `x = 5` from silently declaring a global in strict
 * code.
 *
 * A property reference whose base is a primitive passes that primitive as the
 * receiver to the wrapper object's receiver-aware Set operation.
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
    return putUnresolvableValue(reference, value, callerRealm);
  }

  const base = reference.base;

  if (isEnvironmentRecord(base)) {
    base.setMutableBinding(
      reference.referencedName,
      value,
      reference.strict,
      callerRealm,
    );
    return value;
  }

  if (hasPrimitiveBase(reference) && isPrimitiveWrapperBase(base)) {
    linkPropertyReferenceBase(callerRealm, base);
    return putPropertyReferenceValue(reference, base, value, callerRealm);
  }

  if (isPropertyReferenceBase(base)) {
    linkPropertyReferenceBase(callerRealm, base);
    return putPropertyReferenceValue(reference, base, value, callerRealm);
  }

  throw new TypeError('Unsupported reference base');
}

/**
 * @param {Reference} reference
 * @param {EngineObject | SuperReferenceBase} object
 * @param {unknown} value
 * @param {import('./realm.js').Realm | undefined} callerRealm
 * @returns {unknown}
 */
function putPropertyReferenceValue(reference, object, value, callerRealm) {
  enterObjectOperationRealm(callerRealm);

  try {
    if (
      !object.set(reference.referencedName, value, reference.thisValue) &&
      reference.strict
    ) {
      throw new GuestErrorSignal('TypeError', 'Cannot assign to property');
    }

    return value;
  } finally {
    exitObjectOperationRealm(callerRealm);
  }
}

/**
 * @param {Reference} reference
 * @param {EngineObject | SuperReferenceBase} object
 * @param {import('./realm.js').Realm | undefined} callerRealm
 * @returns {unknown}
 */
function getPropertyReferenceValue(reference, object, callerRealm) {
  enterObjectOperationRealm(callerRealm);

  try {
    return linkValueToGeneratorHostChain(
      callerRealm,
      object.get(reference.referencedName, reference.thisValue),
    );
  } finally {
    exitObjectOperationRealm(callerRealm);
  }
}

/**
 * @param {import('./realm.js').Realm | undefined} callerRealm
 * @param {EngineObject | SuperReferenceBase} base
 * @returns {void}
 */
function linkPropertyReferenceBase(callerRealm, base) {
  if (base instanceof SuperReferenceBase) {
    linkValueToGeneratorHostChain(callerRealm, base.superBase);
    linkValueToGeneratorHostChain(callerRealm, base.receiver);
    return;
  }

  linkValueToGeneratorHostChain(callerRealm, base);
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
 * @param {import('./realm.js').Realm} [callerRealm]
 * @returns {unknown}
 */
function putUnresolvableValue(reference, value, callerRealm) {
  const globalObject = /** @type {any} */ (reference).globalObject;

  if (reference.strict || !isGlobalSetTarget(globalObject)) {
    throw new GuestErrorSignal(
      'ReferenceError',
      `${String(reference.referencedName)} is not defined`,
    );
  }

  enterObjectOperationRealm(callerRealm);

  try {
    globalObject.set(reference.referencedName, value, globalObject);
    return value;
  } finally {
    exitObjectOperationRealm(callerRealm);
  }
}
