/**
 * Runs the test suites under Node.
 *
 * With no arguments it runs the portable registry from `test/suites.js` plus the
 * Node-only suites in `test/node/`, which need a filesystem and therefore cannot
 * run in the browser or the `jsc` shell. A path argument runs that single suite,
 * which is how focused runs stay cheap.
 *
 * The suites in `test/ci/` are deliberately not registered here. They execute
 * the whole CI pipeline as real subprocesses (including this runner), so
 * registering them would make this sweep recursive, slow, and dependent on a
 * browser and an upstream Test262 checkout being present. `npm run ci:contract`
 * runs them through `test/run-ci-contract.js` instead.
 *
 * Usage: `node test/run-node.js [test/foo.test.js]`
 */

import { runTests } from './harness/runner.js';
import { PORTABLE_SUITES } from './suites.js';
import benchmarkCli from './node/benchmark-cli.test.js';
import benchmarkHosts from './node/benchmark-hosts.test.js';
import repositoryInvariants from './node/repository-invariants.test.js';
import workflowContract from './node/workflow-contract.test.js';

/**
 * @typedef {import('./suites.js').TestSuite} TestSuite
 */

/** @type {readonly TestSuite[]} */
const NODE_ONLY_SUITES = Object.freeze([
  Object.freeze({
    file: 'test/node/benchmark-cli.test.js',
    tests: benchmarkCli,
  }),
  Object.freeze({
    file: 'test/node/benchmark-hosts.test.js',
    tests: benchmarkHosts,
  }),
  Object.freeze({
    file: 'test/node/repository-invariants.test.js',
    tests: repositoryInvariants,
  }),
  Object.freeze({
    file: 'test/node/workflow-contract.test.js',
    tests: workflowContract,
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
