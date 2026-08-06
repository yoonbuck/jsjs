import { EngineObject } from './object.js';

/**
 * @typedef {import('./descriptors.js').CompletePropertyDescriptor} CompletePropertyDescriptor
 * @typedef {import('./descriptors.js').PropertyKey} PropertyKey
 */

/**
 * Internal wrapper used by ES5 ToObject until the public boxed-primitive
 * constructor families are installed.
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
