/**
 * Shared control flow for running the portable suites in the `jsc` shell.
 *
 * The shell has no `process.exitCode`, so failure has to be signalled by the
 * one mechanism that actually moves its exit status. That mechanism — and why
 * the timer-thrown error is the only authoritative one on the validated shell
 * — lives in `tools/jsc/exit.js`; this file only decides *when* to use it.
 */

import { formatJscError, signalJscFailure } from '../tools/jsc/exit.js';
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
          signalJscFailure('JSC test run failed');
        }
      },
      (error) => {
        print(formatJscError(error));
        signalJscFailure('JSC test runner rejected');
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
