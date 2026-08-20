import {
  EngineObject,
  ordinaryDefineOwnProperty,
  ordinaryDelete,
  ordinaryGetOwnProperty,
  ordinaryOwnPropertyKeys,
} from './object.js';
import { toNumber, toUint32 } from './conversion.js';
import { GuestErrorSignal } from './completion.js';

/**
 * @typedef {import('./descriptors.js').PropertyDescriptorRecord} PropertyDescriptorRecord
 * @typedef {import('./descriptors.js').PropertyKey} PropertyKey
 */

const MAX_ARRAY_LENGTH = 4294967295;

/**
 * An array exotic object (ECMA-262 15.4): an ordinary engine object whose
 * `[[DefineOwnProperty]]` keeps the `length` property and the array index
 * properties consistent — defining an index at or beyond `length` grows
 * `length`, and lowering `length` deletes the elements above it.
 */
export class EngineArray extends EngineObject {
  /**
   * @param {EngineObject | null} [prototype=null]
   */
  constructor(prototype = null) {
    super(prototype, 'Array');

    ordinaryDefineOwnProperty(this, 'length', {
      value: 0,
      writable: true,
      enumerable: false,
      configurable: false,
    });
  }

  /**
   * @param {PropertyKey} name
   * @param {PropertyDescriptorRecord} descriptor
   * @returns {boolean}
   */
  defineOwnProperty(name, descriptor) {
    if (name === 'length') {
      return this._defineLength(descriptor);
    }

    const index = toArrayIndex(name);

    if (index === undefined) {
      return ordinaryDefineOwnProperty(this, name, descriptor);
    }

    return this._defineIndex(index, name, descriptor);
  }

  /**
   * @returns {number}
   */
  _length() {
    const descriptor = /** @type {PropertyDescriptorRecord} */ (
      ordinaryGetOwnProperty(this, 'length')
    );
    return /** @type {number} */ (descriptor.value);
  }

  /**
   * Implements the `length` half of ECMA-262 15.4.5.1: validate the new
   * length, then (when shrinking) delete every element at or above it,
   * stopping at the first element that refuses to be deleted and leaving
   * `length` just above it.
   *
   * @param {PropertyDescriptorRecord} descriptor
   * @returns {boolean}
   */
  _defineLength(descriptor) {
    const current = /** @type {PropertyDescriptorRecord} */ (
      ordinaryGetOwnProperty(this, 'length')
    );

    if (!('value' in descriptor)) {
      return ordinaryDefineOwnProperty(this, 'length', descriptor);
    }

    const newLength = toUint32(descriptor.value);

    if (newLength !== toNumber(descriptor.value)) {
      throw new GuestErrorSignal('RangeError', 'Invalid array length');
    }

    /** @type {PropertyDescriptorRecord} */
    const lengthDescriptor = { ...descriptor, value: newLength };
    const oldLength = /** @type {number} */ (current.value);

    if (newLength >= oldLength) {
      return ordinaryDefineOwnProperty(this, 'length', lengthDescriptor);
    }

    if (!current.writable) {
      return false;
    }

    // A `length` update that also clears `writable` must stay writable
    // until the elements above the new length have been deleted.
    const newWritable = lengthDescriptor.writable !== false;

    if (!newWritable) {
      lengthDescriptor.writable = true;
    }

    if (!ordinaryDefineOwnProperty(this, 'length', lengthDescriptor)) {
      return false;
    }

    for (const index of this._indicesAtOrAbove(newLength)) {
      if (ordinaryDelete(this, String(index))) {
        continue;
      }

      if (
        !ordinaryDefineOwnProperty(this, 'length', {
          value: index + 1,
          writable: newWritable,
        })
      ) {
        return false;
      }

      return false;
    }

    if (
      !newWritable &&
      !ordinaryDefineOwnProperty(this, 'length', { writable: false })
    ) {
      return false;
    }

    return true;
  }

  /**
   * Implements the array-index half of ECMA-262 15.4.5.1: an index at or
   * beyond `length` may only be defined when `length` is writable, and
   * doing so raises `length` to one past that index.
   *
   * @param {number} index
   * @param {PropertyKey} name
   * @param {PropertyDescriptorRecord} descriptor
   * @returns {boolean}
   */
  _defineIndex(index, name, descriptor) {
    const current = /** @type {PropertyDescriptorRecord} */ (
      ordinaryGetOwnProperty(this, 'length')
    );
    const oldLength = /** @type {number} */ (current.value);

    if (index >= oldLength && !current.writable) {
      return false;
    }

    if (!ordinaryDefineOwnProperty(this, name, descriptor)) {
      return false;
    }

    if (
      index >= oldLength &&
      !ordinaryDefineOwnProperty(this, 'length', { value: index + 1 })
    ) {
      return false;
    }

    return true;
  }

  /**
   * Existing own array indices at or above `length`, in descending order.
   * Walking the own keys instead of counting down from the old length
   * keeps shrinking a sparse array proportional to its elements rather
   * than to its length.
   *
   * @param {number} length
   * @returns {number[]}
   */
  _indicesAtOrAbove(length) {
    /** @type {number[]} */
    const indices = [];

    for (const key of ordinaryOwnPropertyKeys(this)) {
      const index = toArrayIndex(key);

      if (index !== undefined && index >= length) {
        indices.push(index);
      }
    }

    return indices.sort((left, right) => right - left);
  }
}

/**
 * Converts a property key to the array index it names, or `undefined` when
 * it names an ordinary property. A key is an array index only when it is
 * the canonical decimal string of an integer below 2^32-1, so `"01"`,
 * `"1.0"`, `"-1"`, and `"4294967295"` are ordinary properties.
 *
 * Uses a character-scan fast path to avoid `Number()` and `String()` round-
 * trips. Code-unit reads use indexed access (`name[i]`) and arithmetic
 * coercion (`c - '0'`) rather than host String prototype methods, satisfying
 * the repository invariant.
 *
 * @param {PropertyKey} name
 * @returns {number | undefined}
 */
export function toArrayIndex(name) {
  if (typeof name !== 'string') {
    return undefined;
  }

  const len = name.length;

  // Empty or too long: '4294967294' (max valid) has 10 chars.
  if (len === 0 || len > 10) {
    return undefined;
  }

  const first = name[0];

  // Single-character fast path: '0'–'9' are valid single-digit indices.
  if (len === 1) {
    if (first >= '0' && first <= '9') {
      return /** @type {number} */ (
        /** @type {any} */ (first) - /** @type {any} */ ('0')
      );
    }
    return undefined;
  }

  // Multi-digit: first char must be '1'–'9' to exclude leading zeros and
  // non-digit prefixes such as '+', '-', space, and letters.
  if (first < '1' || first > '9') {
    return undefined;
  }

  let val = /** @type {number} */ (
    /** @type {any} */ (first) - /** @type {any} */ ('0')
  );

  for (let i = 1; i < len; i++) {
    const c = name[i];
    if (c < '0' || c > '9') {
      return undefined;
    }
    val =
      val * 10 +
      /** @type {number} */ (/** @type {any} */ (c) - /** @type {any} */ ('0'));
  }

  // Reject 4294967295 (2^32-1) and any overflow.
  if (val >= MAX_ARRAY_LENGTH) {
    return undefined;
  }

  return val;
}
