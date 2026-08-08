/**
 * Runs the full local CI contract.
 *
 * The suites in `test/ci/` fall into two categories:
 *
 * 1. Pipeline-mirror suites (e.g. `full-contract.test.js`) that execute the
 *    project's real commands — vendor, format, lint, type check, the Node
 *    sweep, a headless browser, the local fixture suite, and the pinned
 *    upstream Test262 subset — so they are slow, need a browser and an
 *    upstream checkout, and must never run from inside one of the jobs they
 *    describe.
 *
 * 2. Checkout-dependent suites (e.g. `exclusions-check.test.js`) that need a
 *    real upstream Test262 checkout but do not invoke CI commands. They live
 *    here rather than in `test/node/` because they cannot pass without
 *    `vendor/test262`.
 *
 * That is why they have their own entry point instead of being registered with
 * `test/run-node.js`: `npm run test:node` stays deterministic and
 * machine-independent, and `npm run ci:contract` is the one command that
 * reproduces the whole pipeline locally.
 *
 * Usage: `node test/run-ci-contract.js`
 */

import { runTests } from './harness/runner.js';
import fullContract from './ci/full-contract.test.js';
import exclusionsCheck from './ci/exclusions-check.test.js';
import es2015ObjectFunctionTest262 from './ci/es2015-object-function-test262.test.js';

/**
 * @typedef {import('./suites.js').TestSuite} TestSuite
 */

/** @type {readonly TestSuite[]} */
const CI_CONTRACT_SUITES = Object.freeze([
  Object.freeze({
    file: 'test/ci/full-contract.test.js',
    tests: fullContract,
  }),
  Object.freeze({
    file: 'test/ci/exclusions-check.test.js',
    tests: exclusionsCheck,
  }),
  Object.freeze({
    file: 'test/ci/es2015-object-function-test262.test.js',
    tests: es2015ObjectFunctionTest262,
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
