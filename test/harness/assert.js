/**
 * @param {unknown} actual
 * @param {unknown} expected
 * @param {string} [message] Appended to the failure, for assertions whose
 *   values do not explain themselves.
 * @returns {void}
 */
export function assertSame(actual, expected, message) {
  if (!sameValue(actual, expected)) {
    throw new Error(
      `Expected ${formatValue(actual)} to be the same value as ${formatValue(expected)}${
        message === undefined ? '' : `: ${message}`
      }`,
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
  return Object.is(actual, expected);
}
