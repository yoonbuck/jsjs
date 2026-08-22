import { GuestErrorSignal } from './completion.js';

/**
 * @typedef {import('./descriptors.js').PropertyKey} PropertyKey
 * @typedef {import('./object.js').EngineObject} EngineObject
 */

/**
 * A `Reference` base (ECMA-262 8.7) for `super.prop`/`super[expr]`,
 * satisfying `src/runtime/reference.js`'s property-reference dispatch. It
 * implements `MakeSuperPropertyReference` (ECMA-262 12.3.5.1): the lookup
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
   * @returns {unknown}
   */
  get(name) {
    const superBase = this.superBase;

    if (superBase === null) {
      throw new GuestErrorSignal(
        'TypeError',
        'Cannot read a property through a null super base',
      );
    }

    return superBase.get(name, this.receiver);
  }

  /**
   * @param {PropertyKey} name
   * @param {unknown} value
   * @returns {boolean}
   */
  set(name, value) {
    const superBase = this.superBase;

    if (superBase === null) {
      throw new GuestErrorSignal(
        'TypeError',
        'Cannot set a property through a null super base',
      );
    }

    return superBase.set(name, value, this.receiver);
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
