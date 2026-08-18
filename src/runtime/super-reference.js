import { EngineObject, callAccessor } from './object.js';
import { isDataDescriptor } from './descriptors.js';
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
   * @param {EngineObject | null} superBase
   * @param {unknown} receiver
   */
  constructor(superBase, receiver) {
    /** @type {EngineObject | null} */
    this.superBase = superBase;
    /** @type {unknown} */
    this.receiver = receiver;
  }

  /**
   * @param {PropertyKey} name
   * @param {import('./realm.js').Realm} [callerRealm]
   * @returns {unknown}
   */
  getReferencedValue(name, callerRealm) {
    const superBase = this.superBase;

    if (superBase === null) {
      throw new GuestErrorSignal(
        'TypeError',
        'Cannot read a property through a null super base',
      );
    }

    linkSuperTargetToGeneratorHostChain(callerRealm, superBase);
    linkSuperTargetToGeneratorHostChain(callerRealm, this.receiver);
    const descriptor = superBase.getProperty(name);

    if (descriptor === undefined) {
      return undefined;
    }

    if (isDataDescriptor(descriptor)) {
      return descriptor.value;
    }

    return descriptor.get === undefined
      ? undefined
      : callAccessor(descriptor.get, this.receiver, [], callerRealm);
  }

  /**
   * @param {PropertyKey} name
   * @param {unknown} value
   * @param {boolean} [strict=false]
   * @param {import('./realm.js').Realm} [callerRealm]
   * @returns {void}
   */
  setReferencedValue(name, value, strict = false, callerRealm) {
    const superBase = this.superBase;

    if (superBase === null) {
      throw new GuestErrorSignal(
        'TypeError',
        'Cannot set a property through a null super base',
      );
    }

    linkSuperTargetToGeneratorHostChain(callerRealm, superBase);
    linkSuperTargetToGeneratorHostChain(callerRealm, this.receiver);
    superBase.set(name, value, this.receiver, strict, callerRealm);
  }

  /**
   * @param {PropertyKey} _name
   * @returns {never}
   */
  delete(_name) {
    throw new GuestErrorSignal(
      'ReferenceError',
      'Unsupported reference to a super property',
    );
  }
}

/**
 * @param {import('./realm.js').Realm | undefined} callerRealm
 * @param {unknown} value
 * @returns {void}
 */
function linkSuperTargetToGeneratorHostChain(callerRealm, value) {
  if (
    callerRealm !== undefined &&
    value instanceof EngineObject &&
    value.agent !== null
  ) {
    callerRealm.agent.linkGeneratorHostChain(value.agent);
  }
}
