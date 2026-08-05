/**
 * @typedef {string | symbol} PropertyKey
 *
 * @typedef {{
 *   value?: unknown,
 *   writable?: boolean,
 *   get?: (() => unknown) | CallableLike | undefined,
 *   set?: ((value: unknown) => void) | CallableLike | undefined,
 *   enumerable?: boolean,
 *   configurable?: boolean,
 * }} PropertyDescriptorRecord
 *
 * @typedef {PropertyDescriptorRecord & {
 *   enumerable: boolean,
 *   configurable: boolean,
 * }} CompletePropertyDescriptor
 *
 * @typedef {{
 *   callFunction: (thisValue: unknown, args: readonly unknown[]) => unknown,
 * }} CallableLike
 */

/**
 * Implements ECMA-262 9.11 `IsCallable` for engine values: an engine
 * object is callable when it implements the engine's call protocol.
 *
 * It lives in this module because `descriptors.js` imports nothing, so
 * every layer that needs the predicate — property access, `typeof`, and
 * accessor validation below — can share one definition without creating an
 * import cycle with the object model or the function specialization that
 * defines callable objects.
 *
 * @param {unknown} value
 * @returns {value is CallableLike}
 */
export function isCallable(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (/** @type {any} */ (value).callFunction) === 'function'
  );
}

/**
 * @param {PropertyDescriptorRecord | CompletePropertyDescriptor | undefined} descriptor
 * @returns {boolean}
 */
export function isAccessorDescriptor(descriptor) {
  if (!descriptor) {
    return false;
  }

  return 'get' in descriptor || 'set' in descriptor;
}

/**
 * @param {PropertyDescriptorRecord | CompletePropertyDescriptor | undefined} descriptor
 * @returns {boolean}
 */
export function isDataDescriptor(descriptor) {
  if (!descriptor) {
    return false;
  }

  return 'value' in descriptor || 'writable' in descriptor;
}

/**
 * @param {PropertyDescriptorRecord | CompletePropertyDescriptor | undefined} descriptor
 * @returns {boolean}
 */
export function isGenericDescriptor(descriptor) {
  if (!descriptor) {
    return false;
  }

  return !isAccessorDescriptor(descriptor) && !isDataDescriptor(descriptor);
}

/**
 * @param {PropertyDescriptorRecord | CompletePropertyDescriptor} descriptor
 * @returns {PropertyDescriptorRecord}
 */
export function validatePropertyDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') {
    throw new TypeError('Property descriptor must be an object');
  }

  const copy = copyDescriptorFields(descriptor);

  if (
    'get' in copy &&
    copy.get !== undefined &&
    typeof copy.get !== 'function' &&
    !isCallable(copy.get)
  ) {
    throw new TypeError('Getter must be callable or undefined');
  }

  if (
    'set' in copy &&
    copy.set !== undefined &&
    typeof copy.set !== 'function' &&
    !isCallable(copy.set)
  ) {
    throw new TypeError('Setter must be callable or undefined');
  }

  if (isAccessorDescriptor(copy) && isDataDescriptor(copy)) {
    throw new TypeError('Property descriptor cannot be both data and accessor');
  }

  return copy;
}

/**
 * @param {PropertyDescriptorRecord | CompletePropertyDescriptor} descriptor
 * @returns {CompletePropertyDescriptor}
 */
export function completePropertyDescriptor(descriptor) {
  const validated = validatePropertyDescriptor(descriptor);

  if (isAccessorDescriptor(validated)) {
    return {
      get: 'get' in validated ? validated.get : undefined,
      set: 'set' in validated ? validated.set : undefined,
      enumerable:
        'enumerable' in validated ? Boolean(validated.enumerable) : false,
      configurable:
        'configurable' in validated ? Boolean(validated.configurable) : false,
    };
  }

  return {
    value: 'value' in validated ? validated.value : undefined,
    writable: 'writable' in validated ? Boolean(validated.writable) : false,
    enumerable:
      'enumerable' in validated ? Boolean(validated.enumerable) : false,
    configurable:
      'configurable' in validated ? Boolean(validated.configurable) : false,
  };
}

/**
 * @param {PropertyDescriptorRecord | CompletePropertyDescriptor} descriptor
 * @returns {PropertyDescriptorRecord}
 */
export function copyPropertyDescriptor(descriptor) {
  return copyDescriptorFields(descriptor);
}

/**
 * @param {PropertyDescriptorRecord | CompletePropertyDescriptor} descriptor
 * @returns {PropertyDescriptorRecord}
 */
function copyDescriptorFields(descriptor) {
  /** @type {PropertyDescriptorRecord} */
  const copy = {};

  if ('value' in descriptor) {
    copy.value = descriptor.value;
  }

  if ('writable' in descriptor) {
    copy.writable = Boolean(descriptor.writable);
  }

  if ('get' in descriptor) {
    copy.get = descriptor.get;
  }

  if ('set' in descriptor) {
    copy.set = descriptor.set;
  }

  if ('enumerable' in descriptor) {
    copy.enumerable = Boolean(descriptor.enumerable);
  }

  if ('configurable' in descriptor) {
    copy.configurable = Boolean(descriptor.configurable);
  }

  return copy;
}
