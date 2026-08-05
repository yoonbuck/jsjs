import { runTests } from './harness/runner.js';

/**
 * @typedef {import('./harness/runner.js').TestResult} TestResult
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
  const testFiles = new URLSearchParams(location.search).getAll('test');

  if (!output) {
    throw new Error('Missing output element');
  }

  const files = testFiles.length > 0 ? testFiles : ['./foundation.test.js'];

  for (const file of files) {
    const module = await import(new URL(file, import.meta.url).href);
    const tests = module.default ?? module.tests;

    if (!Array.isArray(tests)) {
      throw new Error(`Expected ${file} to export a test array`);
    }

    await runTests(tests, (result) => {
      results.push(result);
      output.textContent += `${JSON.stringify(result)}\n`;
    });
  }
}
