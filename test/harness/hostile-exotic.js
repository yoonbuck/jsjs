import { EngineObject } from '../../src/runtime/object.js';
import { createIterResultObject } from '../../src/runtime/iterator.js';

/**
 * Test-only exotic whose Table 5 methods never consult EngineObject's ordinary
 * property representation.
 */
export class HostileExotic extends EngineObject {
  /**
   * @param {EngineObject | null} prototype
   * @param {EngineObject | undefined} iterator
   */
  constructor(prototype, iterator) {
    super(prototype);
    /** @type {unknown[][]} */
    this.calls = [];
    /** @type {Map<string | symbol, unknown>} */
    this.virtual = new Map();
    this.prototypeResult = prototype;
    this.extensibleResult = true;
    this.iterator = iterator;
    /** @type {Map<string, unknown>} */
    this.abrupt = new Map();
    /** @type {(import('../../src/runtime/realm.js').Realm | null)[]} */
    this.activeRealms = [];
  }

  /**
   * @param {string} name
   * @param {unknown} value
   * @param {...unknown} args
   * @returns {unknown}
   */
  record(name, value, ...args) {
    this.calls.push([name, ...args]);
    this.activeRealms.push(this.agent?.activeExecutionRealm ?? null);
    const abrupt = this.abrupt.get(name);

    if (abrupt !== undefined) {
      throw abrupt;
    }

    return value;
  }

  getPrototypeOf() {
    return /** @type {EngineObject | null} */ (
      this.record('getPrototypeOf', this.prototypeResult)
    );
  }

  /**
   * @param {EngineObject | null} value
   * @returns {boolean}
   */
  setPrototypeOf(value) {
    return /** @type {boolean} */ (this.record('setPrototypeOf', false, value));
  }

  /**
   * @returns {boolean}
   */
  isExtensible() {
    return /** @type {boolean} */ (
      this.record('isExtensible', this.extensibleResult)
    );
  }

  /**
   * @returns {boolean}
   */
  preventExtensions() {
    return /** @type {boolean} */ (this.record('preventExtensions', false));
  }

  /**
   * @param {string | symbol} key
   * @returns {any}
   */
  getOwnProperty(key) {
    return this.record('getOwnProperty', this.virtual.get(key), key);
  }

  /**
   * @param {string | symbol} key
   * @returns {boolean}
   */
  hasProperty(key) {
    return /** @type {boolean} */ (
      this.record('hasProperty', this.virtual.has(key), key)
    );
  }

  /**
   * @param {string | symbol} key
   * @param {unknown} receiver
   * @returns {unknown}
   */
  get(key, receiver) {
    return this.record('get', `get:${String(key)}`, key, receiver);
  }

  /**
   * @param {string | symbol} key
   * @param {unknown} value
   * @param {unknown} receiver
   * @returns {boolean}
   */
  set(key, value, receiver) {
    return /** @type {boolean} */ (
      this.record('set', false, key, value, receiver)
    );
  }

  /**
   * @param {string | symbol} key
   * @returns {boolean}
   */
  delete(key) {
    return /** @type {boolean} */ (this.record('delete', false, key));
  }

  /**
   * @param {string | symbol} key
   * @param {import('../../src/runtime/descriptors.js').PropertyDescriptorRecord} descriptor
   * @returns {boolean}
   */
  defineOwnProperty(key, descriptor) {
    return /** @type {boolean} */ (
      this.record('defineOwnProperty', false, key, descriptor)
    );
  }

  /**
   * @returns {EngineObject}
   */
  enumerate() {
    return /** @type {EngineObject} */ (
      this.record('enumerate', this.iterator)
    );
  }

  /**
   * @returns {(string | symbol)[]}
   */
  ownPropertyKeys() {
    return /** @type {(string | symbol)[]} */ (
      this.record('ownPropertyKeys', [...this.virtual.keys()])
    );
  }
}

/**
 * @param {import('../../src/runtime/realm.js').Realm} realm
 * @param {readonly string[]} values
 * @returns {EngineObject}
 */
export function createEnumerationIterator(realm, values) {
  const iterator = new EngineObject(realm.intrinsics.objectPrototype);
  let index = 0;
  const next = realm.createNativeFunction({
    name: 'next',
    length: 0,
    call() {
      const value = values[index];
      index += 1;
      return createIterResultObject(realm, value, value === undefined);
    },
  });

  iterator.defineOwnProperty('next', {
    value: next,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  return iterator;
}
