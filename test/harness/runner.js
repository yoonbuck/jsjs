/**
 * @typedef {{
 *   name: string,
 *   run: () => unknown | Promise<unknown>,
 * } | (() => unknown | Promise<unknown>)} TestCase
 *
 * @typedef {{
 *   name: string,
 *   status: 'passed' | 'failed',
 *   error?: {
 *     name: string,
 *     message: string,
 *   },
 * }} TestResult
 */

/**
 * @param {readonly TestCase[]} tests
 * @param {(result: TestResult) => void} [reporter]
 * @returns {Promise<TestResult[]>}
 */
export async function runTests(tests, reporter = () => {}) {
  const results = [];

  for (const [index, test] of tests.entries()) {
    const entry = normalizeTest(test, index);

    try {
      await entry.run();

      /** @type {TestResult} */
      const result = { name: entry.name, status: 'passed' };
      results.push(result);
      reporter(result);
    } catch (error) {
      /** @type {TestResult} */
      const result = {
        name: entry.name,
        status: 'failed',
        error: {
          name: error instanceof Error ? error.name : 'Error',
          message: error instanceof Error ? error.message : String(error),
        },
      };
      results.push(result);
      reporter(result);
    }
  }

  return results;
}

/**
 * @param {TestCase} test
 * @param {number} index
 * @returns {{ name: string, run: () => unknown | Promise<unknown> }}
 */
function normalizeTest(test, index) {
  if (typeof test === 'function') {
    return {
      name: test.name || `test-${index + 1}`,
      run: test,
    };
  }

  return test;
}
