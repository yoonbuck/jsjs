/**
 * @param {unknown} actual
 * @param {unknown} expected
 * @returns {void}
 */
export function assertSame(actual, expected) {
  if (!sameValue(actual, expected)) {
    throw new Error(
      `Expected ${formatValue(actual)} to deeply equal ${formatValue(expected)}`,
    );
  }
}

/**
 * @template {new (...args: any[]) => Error} T
 * @param {() => unknown} fn
 * @param {T} ErrorType
 * @returns {Error}
 */
export function assertThrows(fn, ErrorType) {
  try {
    fn();
  } catch (error) {
    if (error instanceof ErrorType) {
      return error;
    }

    throw new Error(
      `Expected ${ErrorType.name} but got ${error instanceof Error ? error.name : typeof error}`,
    );
  }

  throw new Error(`Expected function to throw ${ErrorType.name}`);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatValue(value) {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

/**
 * @param {unknown} actual
 * @param {unknown} expected
 * @returns {boolean}
 */
function sameValue(actual, expected) {
  if (Object.is(actual, expected)) {
    return true;
  }

  if (!isComparableObject(actual) || !isComparableObject(expected)) {
    return false;
  }

  if (Object.getPrototypeOf(actual) !== Object.getPrototypeOf(expected)) {
    return false;
  }

  if (Array.isArray(actual)) {
    return sameArray(
      /** @type {readonly unknown[]} */ (actual),
      /** @type {readonly unknown[]} */ (expected),
    );
  }

  return sameRecord(
    /** @type {Record<string, unknown>} */ (actual),
    /** @type {Record<string, unknown>} */ (expected),
  );
}

/**
 * @param {readonly unknown[]} actual
 * @param {readonly unknown[]} expected
 * @returns {boolean}
 */
function sameArray(actual, expected) {
  if (actual.length !== expected.length) {
    return false;
  }

  for (let index = 0; index < actual.length; index += 1) {
    if (!sameValue(actual[index], expected[index])) {
      return false;
    }
  }

  return true;
}

/**
 * @param {Record<string, unknown>} actual
 * @param {Record<string, unknown>} expected
 * @returns {boolean}
 */
function sameRecord(actual, expected) {
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);

  if (actualKeys.length !== expectedKeys.length) {
    return false;
  }

  for (const key of actualKeys) {
    if (!Object.prototype.hasOwnProperty.call(expected, key)) {
      return false;
    }

    if (!sameValue(actual[key], expected[key])) {
      return false;
    }
  }

  return true;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown> | readonly unknown[]}
 */
function isComparableObject(value) {
  return typeof value === 'object' && value !== null;
}
