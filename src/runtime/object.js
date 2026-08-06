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
 * Computes the `ForInStatement` enumeration order (ECMA-262 12.6.4): every
 * enumerable string-keyed own property across `object`'s prototype chain,
 * each name visited at most once. A name already seen anywhere earlier in
 * the chain is never revisited later even when it isn't enumerable there —
 * that's exactly the spec's shadowing rule ("a property of a prototype is
 * not enumerated if it is 'shadowed' because some previous object in the
 * prototype chain has a property with the same name", regardless of that
 * earlier property's own enumerability). Symbol keys are skipped outright:
 * ES5 has no symbols, and later editions exclude them from `for-in` too.
 * Order within one object follows `ownPropertyKeys()` (insertion order),
 * matching `Object.keys`.
 *
 * @param {EngineObject} object
 * @returns {string[]}
 */
export function enumerableKeysForIn(object) {
  const seen = new Set();
  /** @type {string[]} */
  const result = [];

  for (
    let current = /** @type {EngineObject | null} */ (object);
    current !== null;
    current = current.getPrototype()
  ) {
    for (const key of current.ownPropertyKeys()) {
      if (typeof key !== 'string' || seen.has(key)) {
        continue;
      }

      seen.add(key);

      const descriptor = current.getOwnProperty(key);
      if (descriptor !== undefined && descriptor.enumerable === true) {
        result.push(key);
      }
    }
  }

  return result;
}

/**
 * Re-checks one enumerated name against the live object graph, which
 * `evaluateForInStatement` does immediately before running the body for
 * that name (ECMA-262 12.6.4: "If a property that has not yet been visited
 * during enumeration is deleted, then it will not be visited").
 *
 * The check repeats exactly the lookup `enumerableKeysForIn` used to
 * decide the name in the first place — walk the prototype chain, stop at
 * the first object with an own property of that name, and answer with that
 * property's enumerability — so the shadowing rule stays consistent
 * between the snapshot and the re-check. Deleting an own property that
 * shadowed an enumerable inherited one therefore leaves the name live (the
 * inherited property is what the body now sees), while deleting one that
 * shadowed a *non-enumerable* inherited property drops the name, and so
 * does making the property non-enumerable mid-loop: 12.6.4 step 6 asks for
 * the next property "whose [[Enumerable]] attribute is true" each time
 * round, not for the attribute it had at loop entry.
 *
 * Those last two cases are where real engines disagree — JavaScriptCore
 * answers as this does, V8 keeps such a name because its re-check is a
 * bare `HasProperty` — which is the spec telling us it left the choice
 * open: 12.6.4 fixes only the deletion rule and leaves "the mechanics and
 * order of enumerating the properties" implementation-defined. Answering
 * with the same walk the snapshot used is the self-consistent choice: a
 * name whose first own occurrence is non-enumerable never enters the
 * snapshot, so it should not survive in it either.
 *
 * @param {EngineObject} object
 * @param {string} key
 * @returns {boolean}
 */
export function isEnumerableForIn(object, key) {
  for (
    let current = /** @type {EngineObject | null} */ (object);
    current !== null;
    current = current.getPrototype()
  ) {
    const descriptor = current.getOwnProperty(key);

    if (descriptor !== undefined) {
      return descriptor.enumerable === true;
    }
  }

  return false;
}

/**
 * Invokes a function value that the object model holds internally — an
 * accessor's getter/setter, a `toString`/`valueOf` method found during
 * `[[DefaultValue]]`, or an accessor reached through the special
 * `[[Get]]`/`[[Put]]` that a Reference with a primitive base uses
 * (ECMA-262 8.7.1/8.7.2), which supplies the primitive itself as
 * `thisValue`.
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
export function callAccessor(accessor, thisValue, args) {
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
