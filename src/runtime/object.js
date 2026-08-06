import {
  completePropertyDescriptor,
  copyPropertyDescriptor,
  isAccessorDescriptor,
  isCallable,
  isDataDescriptor,
  validatePropertyDescriptor,
} from './descriptors.js';
import { GuestErrorSignal } from './completion.js';

/**
 * @typedef {import('./descriptors.js').CompletePropertyDescriptor} CompletePropertyDescriptor
 * @typedef {import('./descriptors.js').PropertyDescriptorRecord} PropertyDescriptorRecord
 * @typedef {import('./descriptors.js').PropertyKey} PropertyKey
 */

export class EngineObject {
  /**
   * @param {EngineObject | null} [prototype=null]
   * @param {string} [className='Object']
   */
  constructor(prototype = null, className = 'Object') {
    if (prototype !== null && !(prototype instanceof EngineObject)) {
      throw new TypeError(
        'EngineObject prototype must be an EngineObject or null',
      );
    }

    this._prototype = prototype;
    this._className = className;
    this._extensible = true;
    /** @type {Map<PropertyKey, CompletePropertyDescriptor>} */
    this._properties = new Map();
  }

  /**
   * @returns {string}
   */
  getClassName() {
    return this._className;
  }

  /**
   * @returns {EngineObject | null}
   */
  getPrototype() {
    return this._prototype;
  }

  /**
   * @returns {boolean}
   */
  isExtensible() {
    return this._extensible;
  }

  /**
   * @returns {EngineObject}
   */
  preventExtensions() {
    this._extensible = false;
    return this;
  }

  /**
   * @returns {PropertyKey[]}
   */
  ownPropertyKeys() {
    return [...this._properties.keys()];
  }

  /**
   * @param {PropertyKey} name
   * @returns {CompletePropertyDescriptor | undefined}
   */
  getOwnProperty(name) {
    const descriptor = this._properties.get(name);
    return descriptor === undefined
      ? undefined
      : /** @type {CompletePropertyDescriptor} */ (
          copyPropertyDescriptor(descriptor)
        );
  }

  /**
   * @param {PropertyKey} name
   * @returns {PropertyDescriptorRecord | undefined}
   */
  getProperty(name) {
    const own = this.getOwnProperty(name);
    if (own !== undefined) {
      return own;
    }

    return this._prototype === null
      ? undefined
      : this._prototype.getProperty(name);
  }

  /**
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  hasProperty(name) {
    return this.getProperty(name) !== undefined;
  }

  /**
   * @param {PropertyKey} name
   * @returns {unknown}
   */
  get(name) {
    const descriptor = this.getProperty(name);

    if (descriptor === undefined) {
      return undefined;
    }

    if (isDataDescriptor(descriptor)) {
      return descriptor.value;
    }

    return descriptor.get === undefined
      ? undefined
      : callAccessor(descriptor.get, this, []);
  }

  /**
   * @param {PropertyKey} name
   * @returns {boolean}
   */
  canPut(name) {
    const own = this.getOwnProperty(name);

    if (own !== undefined) {
      return isAccessorDescriptor(own)
        ? own.set !== undefined
        : Boolean(own.writable);
    }

    if (this._prototype === null) {
      return this._extensible;
    }

    const inherited = this._prototype.getProperty(name);

    if (inherited === undefined) {
      return this._extensible;
    }

    if (isAccessorDescriptor(inherited)) {
      return inherited.set !== undefined;
    }

    return this._extensible && Boolean(inherited.writable);
  }

  /**
   * @param {PropertyKey} name
   * @param {unknown} value
   * @param {boolean} [throwOnError=false]
   * @returns {boolean}
   */
  put(name, value, throwOnError = false) {
    if (!this.canPut(name)) {
      return rejectOperation(throwOnError, 'Cannot assign to property');
    }

    const own = this.getOwnProperty(name);
    if (own !== undefined && isDataDescriptor(own)) {
      return this.defineOwnProperty(name, { value }, throwOnError);
    }

    if (own !== undefined && isAccessorDescriptor(own)) {
      if (own.set === undefined) {
        return rejectOperation(
          throwOnError,
          'Cannot assign to accessor property',
        );
      }

      callAccessor(own.set, this, [value]);
      return true;
    }

    const inherited =
      this._prototype === null ? undefined : this._prototype.getProperty(name);

    if (inherited !== undefined && isAccessorDescriptor(inherited)) {
      if (inherited.set === undefined) {
        return rejectOperation(
          throwOnError,
          'Cannot assign to accessor property',
        );
      }

      callAccessor(inherited.set, this, [value]);
      return true;
    }

    return this.defineOwnProperty(
      name,
      {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      },
      throwOnError,
    );
  }

  /**
   * @param {PropertyKey} name
   * @param {PropertyDescriptorRecord} descriptor
   * @param {boolean} [throwOnError=false]
   * @returns {boolean}
   */
  defineOwnProperty(name, descriptor, throwOnError = false) {
    const candidate = validatePropertyDescriptor(descriptor);
    const current = this.getOwnProperty(name);

    if (current === undefined) {
      if (!this._extensible) {
        return rejectOperation(
          throwOnError,
          'Cannot define property on non-extensible object',
        );
      }

      this._properties.set(name, completePropertyDescriptor(candidate));
      return true;
    }

    if (
      isEmptyDescriptor(candidate) ||
      isDescriptorSubsetEqual(current, candidate)
    ) {
      return true;
    }

    if (!current.configurable) {
      if (candidate.configurable === true) {
        return rejectOperation(
          throwOnError,
          'Cannot make a non-configurable property configurable',
        );
      }

      if (
        'enumerable' in candidate &&
        candidate.enumerable !== current.enumerable
      ) {
        return rejectOperation(
          throwOnError,
          'Cannot change enumerable on a non-configurable property',
        );
      }
    }

    const currentIsData = isDataDescriptor(current);
    const candidateIsData = isDataDescriptor(candidate);
    const candidateIsAccessor = isAccessorDescriptor(candidate);

    if (
      (candidateIsData || candidateIsAccessor) &&
      currentIsData !== candidateIsData
    ) {
      if (!current.configurable) {
        return rejectOperation(
          throwOnError,
          'Cannot change descriptor kind of a non-configurable property',
        );
      }

      const converted = candidateIsAccessor
        ? completePropertyDescriptor({
            get: undefined,
            set: undefined,
            enumerable: current.enumerable,
            configurable: current.configurable,
            ...candidate,
          })
        : completePropertyDescriptor({
            value: undefined,
            writable: false,
            enumerable: current.enumerable,
            configurable: current.configurable,
            ...candidate,
          });

      this._properties.set(name, converted);
      return true;
    }

    if (currentIsData) {
      if (!current.configurable && !current.writable) {
        if (candidate.writable === true) {
          return rejectOperation(
            throwOnError,
            'Cannot make a non-configurable non-writable property writable',
          );
        }

        if (
          'value' in candidate &&
          !Object.is(candidate.value, current.value)
        ) {
          return rejectOperation(
            throwOnError,
            'Cannot change value of a non-configurable non-writable property',
          );
        }
      }

      this._properties.set(
        name,
        completePropertyDescriptor({
          ...current,
          ...candidate,
        }),
      );
      return true;
    }

    if (!current.configurable) {
      if ('get' in candidate && candidate.get !== current.get) {
        return rejectOperation(
          throwOnError,
          'Cannot change getter of a non-configurable property',
        );
      }

      if ('set' in candidate && candidate.set !== current.set) {
        return rejectOperation(
          throwOnError,
          'Cannot change setter of a non-configurable property',
        );
      }
    }

    this._properties.set(
      name,
      completePropertyDescriptor({
        ...current,
        ...candidate,
      }),
    );
    return true;
  }

  /**
   * @param {PropertyKey} name
   * @param {boolean} [throwOnError=false]
   * @returns {boolean}
   */
  delete(name, throwOnError = false) {
    const descriptor = this.getOwnProperty(name);

    if (descriptor === undefined) {
      return true;
    }

    if (!descriptor.configurable) {
      return rejectOperation(
        throwOnError,
        'Cannot delete a non-configurable property',
      );
    }

    this._properties.delete(name);
    return true;
  }

  /**
   * @param {'string' | 'number' | 'default'} [hint='number']
   * @returns {string | number | boolean | null | undefined}
   */
  defaultValue(hint = 'number') {
    const methodNames =
      hint === 'string' ? ['toString', 'valueOf'] : ['valueOf', 'toString'];

    for (const name of methodNames) {
      const method = this.get(name);

      if (typeof method !== 'function' && !isCallable(method)) {
        continue;
      }

      const result = callAccessor(/** @type {any} */ (method), this, []);

      if (isPrimitive(result)) {
        return result;
      }
    }

    throw new GuestErrorSignal(
      'TypeError',
      'Cannot convert object to primitive value',
    );
  }

  /**
   * @param {PropertyKey} name
   * @returns {unknown}
   */
  getReferencedValue(name) {
    return this.get(name);
  }

  /**
   * @param {PropertyKey} name
   * @param {unknown} value
   * @param {boolean} [strict=false]
   * @returns {void}
   */
  setReferencedValue(name, value, strict = false) {
    this.put(name, value, strict);
  }
}

/**
 * Invokes a function value that the object model holds internally — an
 * accessor's getter/setter or a `toString`/`valueOf` method found during
 * `[[DefaultValue]]`.
 *
 * Two callable shapes reach this point: engine functions created by guest
 * code, which use the engine call protocol, and plain host callbacks,
 * which engine-internal code (realm bootstrapping, tests) may install
 * directly. Guest values are never host functions, so the host branch can
 * never be reached from guest code.
 *
 * @param {((...args: any[]) => unknown) | import('./descriptors.js').CallableLike} accessor
 * @param {unknown} thisValue
 * @param {unknown[]} args
 * @returns {unknown}
 */
function callAccessor(accessor, thisValue, args) {
  if (typeof accessor === 'function') {
    return accessor.call(thisValue, ...args);
  }

  if (isCallable(accessor)) {
    return accessor.callFunction(thisValue, args);
  }

  throw new TypeError('Accessor is not callable');
}

/**
 * Signals a guest-visible property-operation rejection. When `throwOnError`
 * is true, throws a `GuestErrorSignal` so the nearest realm-aware boundary
 * (`EngineFunction#callFunction`, `evaluateScript`, or the `runToCompletion`
 * helper in `evaluateTryStatement`) can convert it into a proper guest
 * `TypeError` throw completion. When false, returns `false` so
 * callers that propagate boolean success flags (e.g. non-strict `[[Put]]`)
 * can continue without an exception.
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

/**
 * @param {CompletePropertyDescriptor} current
 * @param {PropertyDescriptorRecord} candidate
 * @returns {boolean}
 */
function isDescriptorSubsetEqual(current, candidate) {
  if ('value' in candidate && !Object.is(candidate.value, current.value)) {
    return false;
  }

  if ('writable' in candidate && candidate.writable !== current.writable) {
    return false;
  }

  if ('get' in candidate && candidate.get !== current.get) {
    return false;
  }

  if ('set' in candidate && candidate.set !== current.set) {
    return false;
  }

  if (
    'enumerable' in candidate &&
    candidate.enumerable !== current.enumerable
  ) {
    return false;
  }

  if (
    'configurable' in candidate &&
    candidate.configurable !== current.configurable
  ) {
    return false;
  }

  return true;
}

/**
 * @param {PropertyDescriptorRecord} descriptor
 * @returns {boolean}
 */
function isEmptyDescriptor(descriptor) {
  return Object.keys(descriptor).length === 0;
}

/**
 * @param {unknown} value
 * @returns {value is string | number | boolean | null | undefined}
 */
function isPrimitive(value) {
  return (
    value === null || (typeof value !== 'object' && typeof value !== 'function')
  );
}
