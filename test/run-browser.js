/**
 * Runs the test suites in a browser page.
 *
 * By default it runs the portable registry from `test/suites.js`, the same list
 * `run-node.js` and `run-jsc.js` take their work from, and emits the same
 * JSON-lines result protocol into the page. `?test=…` query parameters run
 * individual suite modules instead, which is how a hand-driven browser session
 * narrows a failure.
 */

import { runTests } from './harness/runner.js';
import { PORTABLE_SUITES } from './suites.js';

/**
 * @typedef {import('./harness/runner.js').TestResult} TestResult
 * @typedef {import('./suites.js').TestSuite} TestSuite
 */

/** @type {TestResult[]} */
const results = [];

main().then(
  () => {
    publish(null);
  },
  (error) => {
    const output = document.getElementById('output');
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);

    if (output) {
      output.textContent += `${message}\n`;
    }

    publish(message);
  },
);

/**
 * Publishes the finished run on the page so an automated launcher
 * (`test/run-browser-playwright.js`) can read structured results instead of
 * scraping rendered text.
 *
 * @param {string | null} error
 * @returns {void}
 */
function publish(error) {
  /** @type {any} */ (window).__jsjsBrowserRun = { done: true, results, error };
}

async function main() {
  const output = document.getElementById('output');
  const requested = new URLSearchParams(location.search).getAll('test');

  if (!output) {
    throw new Error('Missing output element');
  }

  /** @type {readonly TestSuite[]} */
  const suites =
    requested.length > 0
      ? await Promise.all(requested.map((file) => loadSuite(file)))
      : PORTABLE_SUITES;

  for (const suite of suites) {
    await runTests(suite.tests, (result) => {
      results.push(result);
      output.textContent += `${JSON.stringify(result)}\n`;
    });
  }
}

/**
 * @param {string} file A URL relative to this module.
 * @returns {Promise<TestSuite>}
 */
async function loadSuite(file) {
  const module = await import(new URL(file, import.meta.url).href);
  const tests = module.default ?? module.tests;

  if (!Array.isArray(tests)) {
    throw new Error(`Expected ${file} to export a test array`);
  }

  return { file, tests };
}
