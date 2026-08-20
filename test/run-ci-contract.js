/**
 * Runs the safe local CI contract.
 *
 * The suites in `test/ci/` fall into two categories:
 *
 * 1. The safe local subset of `full-contract.test.js`, which executes the
 *    project's real non-upstream commands — vendor, format, lint, type check,
 *    the Node sweep, a headless browser, and the local fixture suite.
 *
 * Exact-pinned Test262 semantic suites and the broad upstream run are excluded:
 * the generated exact-SHA CI jobs own those executions.
 *
 * That is why they have their own entry point instead of being registered with
 * `test/run-node.js`: `npm run test:node` stays deterministic and
 * machine-independent, while `npm run ci:contract` is the safe local
 * command-level subset.
 *
 * Usage: `node test/run-ci-contract.js`
 */

import { runTests } from './harness/runner.js';
import { LOCAL_CI_CONTRACT_TESTS } from './ci/full-contract.test.js';

/**
 * @typedef {import('./suites.js').TestSuite} TestSuite
 */

/** @type {readonly TestSuite[]} */
const CI_CONTRACT_SUITES = Object.freeze([
  Object.freeze({
    file: 'test/ci/full-contract.test.js',
    tests: LOCAL_CI_CONTRACT_TESTS,
  }),
]);

main().catch((error) => {
  process.exitCode = 1;
  process.stdout.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
});

async function main() {
  let failed = 0;

  for (const suite of CI_CONTRACT_SUITES) {
    const results = await runTests(suite.tests, (result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    });

    failed += results.filter((result) => result.status !== 'passed').length;
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}
