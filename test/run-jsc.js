/**
 * Runs the portable suites in the JavaScriptCore (`jsc`) shell.
 *
 * `jsc -m test/run-jsc.js` is the third runtime the same suites run in, next to
 * `run-node.js` and `run-browser.js`, and it emits the same JSON-lines result
 * protocol so the three runs can be compared line for line. The shell has no
 * argument vector, so there is nothing to select: it always runs the whole
 * registry from `test/suites.js`.
 */

import { runTests } from './harness/runner.js';
import { PORTABLE_SUITES } from './suites.js';

const print = /** @type {(text: string) => void} */ (globalThis.print);
const quit = /** @type {((code?: number) => void) | undefined} */ (
  globalThis.quit
);

// Promise chaining rather than top level await: the project's host floor is
// ES2020, where top level await does not exist yet.
main().then(
  (failed) => {
    if (failed > 0 && typeof quit === 'function') {
      quit(1);
    }
  },
  (error) => {
    print(String((error && error.stack) || error));

    if (typeof quit === 'function') {
      quit(1);
    }
  },
);

/**
 * @returns {Promise<number>}
 */
async function main() {
  let failed = 0;

  for (const suite of PORTABLE_SUITES) {
    const results = await runTests(suite.tests, (result) => {
      print(JSON.stringify(result));
    });

    failed += results.filter((result) => result.status !== 'passed').length;
  }

  return failed;
}
