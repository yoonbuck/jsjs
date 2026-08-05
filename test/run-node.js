/**
 * Runs the test suites under Node.
 *
 * With no arguments it runs the portable registry from `test/suites.js` plus the
 * Node-only suites in `test/node/`, which need a filesystem and therefore cannot
 * run in the browser or the `jsc` shell. A path argument runs that single suite,
 * which is how focused runs stay cheap.
 *
 * Usage: `node test/run-node.js [test/foo.test.js]`
 */

import { runTests } from './harness/runner.js';
import { PORTABLE_SUITES } from './suites.js';
import repositoryInvariants from './node/repository-invariants.test.js';

/**
 * @typedef {import('./suites.js').TestSuite} TestSuite
 */

/** @type {readonly TestSuite[]} */
const NODE_ONLY_SUITES = Object.freeze([
  Object.freeze({
    file: 'test/node/repository-invariants.test.js',
    tests: repositoryInvariants,
  }),
]);

main().catch((error) => {
  process.exitCode = 1;
  process.stdout.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
});

async function main() {
  const [, , testPath] = process.argv;
  const suites = testPath
    ? [await loadSuite(testPath)]
    : [...PORTABLE_SUITES, ...NODE_ONLY_SUITES];
  let failed = 0;

  for (const suite of suites) {
    const results = await runTests(suite.tests, (result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    });

    failed += results.filter((result) => result.status !== 'passed').length;
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

/**
 * @param {string} testPath Repository-relative path to a suite module.
 * @returns {Promise<TestSuite>}
 */
async function loadSuite(testPath) {
  const testModule = await import(
    new URL(`../${testPath}`, import.meta.url).href
  );
  const tests = testModule.default ?? testModule.tests;

  if (!Array.isArray(tests)) {
    throw new Error(`Expected ${testPath} to export a test array`);
  }

  return { file: testPath, tests };
}
