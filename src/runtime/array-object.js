import { EngineObject } from './object.js';
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

    super.defineOwnProperty('length', {
      value: 0,
      writable: true,
      enumerable: false,
      configurable: false,
    });
  }

  /**
   * @param {PropertyKey} name
   * @param {PropertyDescriptorRecord} descriptor
   * @param {boolean} [throwOnError=false]
   * @returns {boolean}
   */
  defineOwnProperty(name, descriptor, throwOnError = false) {
    if (name === 'length') {
      return this._defineLength(descriptor, throwOnError);
    }

    const index = toArrayIndex(name);

    if (index === undefined) {
      return super.defineOwnProperty(name, descriptor, throwOnError);
    }

    return this._defineIndex(index, name, descriptor, throwOnError);
  }

  /**
   * @returns {number}
   */
  _length() {
    const descriptor = /** @type {import('./descriptors.js').CompletePropertyDescriptor} */ (
      super._peekOwnDescriptor('length')
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
   * @param {boolean} throwOnError
   * @returns {boolean}
   */
  _defineLength(descriptor, throwOnError) {
    const current = /** @type {import('./descriptors.js').CompletePropertyDescriptor} */ (
      super._peekOwnDescriptor('length')
    );

    if (!('value' in descriptor)) {
      return super.defineOwnProperty('length', descriptor, throwOnError);
    }

    const newLength = toUint32(descriptor.value);

    if (newLength !== toNumber(descriptor.value)) {
      throw new GuestErrorSignal('RangeError', 'Invalid array length');
    }

    /** @type {PropertyDescriptorRecord} */
    const lengthDescriptor = { ...descriptor, value: newLength };
    const oldLength = /** @type {number} */ (current.value);

    if (newLength >= oldLength) {
      return super.defineOwnProperty('length', lengthDescriptor, throwOnError);
    }

    if (!current.writable) {
      return rejectOperation(
        throwOnError,
        'Cannot change the length of a non-writable array length',
      );
    }

    // A `length` update that also clears `writable` must stay writable
    // until the elements above the new length have been deleted.
    const newWritable = lengthDescriptor.writable !== false;

    if (!newWritable) {
      lengthDescriptor.writable = true;
    }

    if (!super.defineOwnProperty('length', lengthDescriptor, throwOnError)) {
      return false;
    }

    for (const index of this._indicesAtOrAbove(newLength)) {
      if (super.delete(String(index), false)) {
        continue;
      }

      super.defineOwnProperty(
        'length',
        { value: index + 1, writable: newWritable },
        false,
      );

      return rejectOperation(
        throwOnError,
        'Cannot delete a non-configurable array element',
      );
    }

    if (!newWritable) {
      super.defineOwnProperty('length', { writable: false }, false);
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
   * @param {boolean} throwOnError
   * @returns {boolean}
   */
  _defineIndex(index, name, descriptor, throwOnError) {
    const current = /** @type {import('./descriptors.js').CompletePropertyDescriptor} */ (
      super._peekOwnDescriptor('length')
    );
    const oldLength = /** @type {number} */ (current.value);
    const currentWritable = current.writable;

    if (index >= oldLength && !currentWritable) {
      return rejectOperation(
        throwOnError,
        'Cannot add an element beyond a non-writable array length',
      );
    }

    if (!super.defineOwnProperty(name, descriptor, throwOnError)) {
      return false;
    }

    if (index >= oldLength) {
      super.defineOwnProperty('length', { value: index + 1 }, false);
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

    for (const key of super.ownPropertyKeys()) {
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
      return first - '0'; // arithmetic coercion, not a host String method
    }
    return undefined;
  }

  // Multi-digit: first char must be '1'–'9' to exclude leading zeros and
  // non-digit prefixes such as '+', '-', space, and letters.
  if (first < '1' || first > '9') {
    return undefined;
  }

  let val = first - '0';

  for (let i = 1; i < len; i++) {
    const c = name[i];
    if (c < '0' || c > '9') {
      return undefined;
    }
    val = val * 10 + (c - '0');
  }

  // Reject 4294967295 (2^32-1) and any overflow.
  if (val >= MAX_ARRAY_LENGTH) {
    return undefined;
  }

  return val;
}

/**
 * Signals a guest-visible array-operation rejection, matching the same
 * mechanism as `rejectOperation` in `object.js`. When `throwOnError` is
 * true, throws a `GuestErrorSignal` so the nearest realm-aware boundary
 * can materialise a proper guest `TypeError` throw completion.
 *
 * @param {boolean} throwOnError
 * @param {string} message
 * @returns {false}
 */
function rejectOperation(throwOnError, message) {
  if (throwOnError) {
    throw new GuestErrorSignal('TypeError', message);
  }

  return false;
}
