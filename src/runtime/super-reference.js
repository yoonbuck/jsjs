import { EngineObject, callAccessor } from './object.js';
import { isAccessorDescriptor, isDataDescriptor } from './descriptors.js';
import { GuestErrorSignal } from './completion.js';

/**
 * @typedef {import('./descriptors.js').PropertyKey} PropertyKey
 */

/**
 * A `Reference` base (ECMA-262 8.7) for `super.prop`/`super[expr]`,
 * satisfying the duck-typed `isPropertyReferenceBase` interface
 * `src/runtime/reference.js`'s `getValue`/`putValue` already dispatch to
 * (`getReferencedValue`/`setReferencedValue`). It implements
 * `MakeSuperPropertyReference` (ECMA-262 12.3.5.1): the property lookup
 * starts at the method's `[[HomeObject]]`'s prototype, but accessors are
 * invoked with the method's `this` (the `receiver`) rather than with the
 * object the lookup happened to find the property on — the one way a
 * `super` reference differs from an ordinary property reference on the home
 * object's prototype directly.
 */
export class SuperReferenceBase {
  /**
   * @param {EngineObject} homeObject
   * @param {unknown} receiver
   */
  constructor(homeObject, receiver) {
    /** @type {EngineObject} */
    this.homeObject = homeObject;
    /** @type {unknown} */
    this.receiver = receiver;
  }

  /**
   * @param {PropertyKey} name
   * @returns {unknown}
   */
  getReferencedValue(name) {
    const superBase = this.homeObject.getPrototype();

    if (superBase === null) {
      return undefined;
    }

    const descriptor = superBase.getProperty(name);

    if (descriptor === undefined) {
      return undefined;
    }

    if (isDataDescriptor(descriptor)) {
      return descriptor.value;
    }

    return descriptor.get === undefined
      ? undefined
      : callAccessor(descriptor.get, this.receiver, []);
  }

  /**
   * @param {PropertyKey} name
   * @param {unknown} value
   * @param {boolean} [strict=false]
   * @returns {void}
   */
  setReferencedValue(name, value, strict = false) {
    setPropertyWithReceiver(
      this.homeObject.getPrototype(),
      this.receiver,
      name,
      value,
      strict,
    );
  }
}

/**
 * Implements ECMA-262 9.1.9 `OrdinarySet` with an explicit `Receiver`,
 * distinct from the object the lookup started at. Ordinary (non-`super`)
 * property assignment never needs this — `EngineObject#put` always uses the
 * same object as both the lookup start and the receiver — so this is kept
 * as its own free function rather than folded into `EngineObject#put`,
 * used only by `SuperReferenceBase#setReferencedValue`.
 *
 * @param {EngineObject | null} startObject
 * @param {unknown} receiver
 * @param {PropertyKey} name
 * @param {unknown} value
 * @param {boolean} throwOnError
 * @returns {boolean}
 */
export function setPropertyWithReceiver(
  startObject,
  receiver,
  name,
  value,
  throwOnError,
) {
  const ownDescriptor =
    startObject === null ? undefined : startObject.getOwnProperty(name);

  if (ownDescriptor === undefined) {
    const parent = startObject === null ? null : startObject.getPrototype();

    if (parent !== null) {
      return setPropertyWithReceiver(
        parent,
        receiver,
        name,
        value,
        throwOnError,
      );
    }

    return createDataPropertyOnReceiver(
      receiver,
      name,
      value,
      throwOnError,
      false,
    );
  }

  if (isDataDescriptor(ownDescriptor)) {
    if (!ownDescriptor.writable) {
      return reject(
        throwOnError,
        'Cannot assign to a read-only property inherited through super',
      );
    }

    return createDataPropertyOnReceiver(
      receiver,
      name,
      value,
      throwOnError,
      true,
    );
  }

  if (!isAccessorDescriptor(ownDescriptor) || ownDescriptor.set === undefined) {
    return reject(
      throwOnError,
      'Cannot assign to a property with no setter inherited through super',
    );
  }

  callAccessor(ownDescriptor.set, receiver, [value]);
  return true;
}

/**
 * @param {unknown} receiver
 * @param {PropertyKey} name
 * @param {unknown} value
 * @param {boolean} throwOnError
 * @param {boolean} checkExistingOwnProperty
 * @returns {boolean}
 */
function createDataPropertyOnReceiver(
  receiver,
  name,
  value,
  throwOnError,
  checkExistingOwnProperty,
) {
  if (!(receiver instanceof EngineObject)) {
    return reject(
      throwOnError,
      'Cannot create a property on a non-object super receiver',
    );
  }

  if (checkExistingOwnProperty) {
    const existing = receiver.getOwnProperty(name);

    if (existing !== undefined) {
      if (isAccessorDescriptor(existing)) {
        return reject(
          throwOnError,
          'Cannot assign a data value over an inherited accessor through super',
        );
      }

      if (existing.writable === false) {
        return reject(
          throwOnError,
          'Cannot assign to a read-only own property through super',
        );
      }

      return receiver.defineOwnProperty(name, { value }, throwOnError);
    }
  }

  return receiver.defineOwnProperty(
    name,
    { value, writable: true, enumerable: true, configurable: true },
    throwOnError,
  );
}

/**
 * @param {boolean} throwOnError
 * @param {string} message
 * @returns {false}
 */
function reject(throwOnError, message) {
  if (throwOnError) {
    throw new GuestErrorSignal('TypeError', message);
  }

  return false;
}
