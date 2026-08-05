import { EngineObject } from './object.js';

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
      for (let index = 0; index < primitiveValue.length; index += 1) {
        this.defineOwnProperty(String(index), {
          value: primitiveValue[index],
          writable: false,
          enumerable: true,
          configurable: false,
        });
      }

      this.defineOwnProperty('length', {
        value: primitiveValue.length,
        writable: false,
        enumerable: false,
        configurable: false,
      });
    }
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
