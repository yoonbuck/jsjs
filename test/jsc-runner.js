import { runTests } from './harness/runner.js';

const print = /** @type {(text: string) => void} */ (globalThis.print);

/**
 * @typedef {import('./suites.js').TestSuite} TestSuite
 */

/**
 * @param {() => Promise<number>} run
 * @returns {void}
 */
export function startJscRun(run) {
  Promise.resolve()
    .then(run)
    .then(
      (failed) => {
        if (failed > 0) {
          exitJscFailure('JSC test run failed');
        }
      },
      (error) => {
        print(formatJscError(error));
        exitJscFailure('JSC test runner rejected');
      },
    );
}

/**
 * @param {readonly TestSuite[]} suites
 * @returns {Promise<number>}
 */
export async function runJscSuites(suites) {
  let failed = 0;

  for (const suite of suites) {
    const results = await runTests(suite.tests, (result) => {
      print(JSON.stringify(result));
    });

    failed += results.filter((result) => result.status !== 'passed').length;
  }

  return failed;
}

/**
 * @param {string} message
 * @returns {never | void}
 */
function exitJscFailure(message) {
  if (typeof globalThis.setTimeout === 'function') {
    globalThis.setTimeout(() => {
      throw new Error(message);
    }, 0);
    return;
  }

  if (typeof globalThis.quit === 'function') {
    globalThis.quit(1);
    return;
  }

  throw new Error(message);
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function formatJscError(error) {
  if (error instanceof Error) {
    const header = `${error.name}: ${error.message}`;

    if (typeof error.stack === 'string' && error.stack.length > 0) {
      return error.stack.includes(header)
        ? error.stack
        : `${header}\n${error.stack}`;
    }

    return header;
  }

  return String(error);
}
