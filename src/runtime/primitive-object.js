import { EngineObject } from './object.js';
import { GuestErrorSignal } from './completion.js';

/**
 * @typedef {import('./descriptors.js').CompletePropertyDescriptor} CompletePropertyDescriptor
 * @typedef {import('./descriptors.js').PropertyKey} PropertyKey
 * @typedef {import('./realm.js').Realm} Realm
 */

/**
 * The guest-visible representation of a boxed primitive (`String`, `Number`,
 * or `Boolean` object). `ToObject` and property-access autoboxing use it
 * directly; `builtins/primitive-wrappers.js` wires the public `String`,
 * `Number`, and `Boolean` constructors and prototype methods on top of the
 * per-realm prototypes it boxes against (`createPrimitiveWrapper` below).
 */
export class EnginePrimitiveObject extends EngineObject {
  /**
   * @param {EngineObject} prototype
   * @param {string | number | boolean} primitiveValue
   */
  constructor(prototype, primitiveValue) {
    super(prototype, primitiveClassName(primitiveValue));
    this.primitiveValue = primitiveValue;

    if (typeof primitiveValue === 'string') {
      this.defineOwnProperty('length', {
        value: primitiveValue.length,
        writable: false,
        enumerable: false,
        configurable: false,
      });
    }
  }

  /**
   * @param {PropertyKey} name
   * @returns {CompletePropertyDescriptor | undefined}
   */
  getOwnProperty(name) {
    const ordinary = super.getOwnProperty(name);

    if (ordinary !== undefined) {
      return ordinary;
    }

    const index = stringIndex(this.primitiveValue, name);
    return index === undefined
      ? undefined
      : {
          value: /** @type {string} */ (this.primitiveValue)[index],
          writable: false,
          enumerable: true,
          configurable: false,
        };
  }

  /**
   * @returns {PropertyKey[]}
   */
  ownPropertyKeys() {
    if (typeof this.primitiveValue !== 'string') {
      return super.ownPropertyKeys();
    }

    /** @type {PropertyKey[]} */
    const keys = [];

    for (let index = 0; index < this.primitiveValue.length; index += 1) {
      keys.push(String(index));
    }

    for (const key of super.ownPropertyKeys()) {
      keys.push(key);
    }

    return keys;
  }

  /**
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  hasProperty(name) {
    return (
      stringIndex(this.primitiveValue, name) !== undefined ||
      super.hasProperty(name)
    );
  }
}

/**
 * Boxes `value` against the realm-owned wrapper prototype for its type
 * (ECMA-262 5.1 §9.9 `ToObject`'s String/Number/Boolean cases). Every
 * caller that needs a boxed primitive — `ToObject`, autoboxing on member
 * access, and the `String`/`Number`/`Boolean` constructors' `[[Construct]]`
 * behavior — goes through this single helper so wrapper identity always
 * resolves to the correct per-realm prototype.
 *
 * @param {Realm} realm
 * @param {string | number | boolean} value
 * @returns {EnginePrimitiveObject}
 */
export function createPrimitiveWrapper(realm, value) {
  return new EnginePrimitiveObject(wrapperPrototypeFor(realm, value), value);
}

/**
 * @param {Realm} realm
 * @param {string | number | boolean} value
 * @returns {EngineObject}
 */
function wrapperPrototypeFor(realm, value) {
  switch (typeof value) {
    case 'string':
      return realm.intrinsics.stringPrototype;
    case 'number':
      return realm.intrinsics.numberPrototype;
    default:
      return realm.intrinsics.booleanPrototype;
  }
}

/**
 * Implements ES5 15.5.5.1-shaped "this string value" checks shared by
 * `String.prototype` methods: accepts a string primitive or a String
 * wrapper object (from *any* realm — receiver compatibility is judged by
 * primitive type, not by realm identity) and rejects everything else.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function thisStringValue(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (
    value instanceof EnginePrimitiveObject &&
    typeof value.primitiveValue === 'string'
  ) {
    return value.primitiveValue;
  }

  throw new GuestErrorSignal(
    'TypeError',
    'this is not a String primitive or String object',
  );
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function thisNumberValue(value) {
  if (typeof value === 'number') {
    return value;
  }

  if (
    value instanceof EnginePrimitiveObject &&
    typeof value.primitiveValue === 'number'
  ) {
    return value.primitiveValue;
  }

  throw new GuestErrorSignal(
    'TypeError',
    'this is not a Number primitive or Number object',
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function thisBooleanValue(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (
    value instanceof EnginePrimitiveObject &&
    typeof value.primitiveValue === 'boolean'
  ) {
    return value.primitiveValue;
  }

  throw new GuestErrorSignal(
    'TypeError',
    'this is not a Boolean primitive or Boolean object',
  );
}

/**
 * @param {string | number | boolean} value
 * @returns {'String' | 'Number' | 'Boolean'}
 */
function primitiveClassName(value) {
  switch (typeof value) {
    case 'string':
      return 'String';
    case 'number':
      return 'Number';
    default:
      return 'Boolean';
  }
}

/**
 * @param {string | number | boolean} value
 * @param {PropertyKey} name
 * @returns {number | undefined}
 */
function stringIndex(value, name) {
  if (typeof value !== 'string' || typeof name !== 'string') {
    return undefined;
  }

  const index = Number(name);

  return Number.isInteger(index) &&
    index >= 0 &&
    index < value.length &&
    String(index) === name
    ? index
    : undefined;
}
