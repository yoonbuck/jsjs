/**
 * Headless browser launcher for the shared local test suite.
 *
 * The suite and the Test262 runner are written to be host-neutral, so the only
 * browser-specific work is serving the repository over HTTP and reading the
 * results the page publishes. Playwright's request interception serves files
 * straight from disk, which keeps this launcher free of a real web server and
 * makes every request explicit.
 *
 * Usage: `node test/run-browser-playwright.js [test/foo.test.js ...]`
 */

import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const REPOSITORY_ROOT = new URL('../', import.meta.url);
const ORIGIN = 'http://jsjs.localhost';

const CONTENT_TYPES = new Map([
  ['html', 'text/html; charset=utf-8'],
  ['js', 'text/javascript; charset=utf-8'],
  ['mjs', 'text/javascript; charset=utf-8'],
  ['json', 'application/json; charset=utf-8'],
]);

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    process.exitCode = 1;
    process.stdout.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
  },
);

/**
 * @returns {Promise<number>}
 */
async function main() {
  // With no arguments the page runs the shared registry from `test/suites.js`,
  // so the browser sweep cannot drift from the Node and `jsc` sweeps.
  const query = process.argv
    .slice(2)
    .map((file) => `test=${encodeURIComponent(`../${file}`)}`)
    .join('&');
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();

    await page.route('**/*', async (route, request) => {
      const path = new URL(request.url()).pathname.replace(/^\//, '');

      try {
        const body = await readFile(new URL(path, REPOSITORY_ROOT), 'utf8');

        await route.fulfill({
          status: 200,
          contentType: contentTypeOf(path),
          body,
        });
      } catch {
        await route.fulfill({ status: 404, body: `Not found: ${path}` });
      }
    });

    await page.goto(`${ORIGIN}/test/run-browser.html?${query}`);
    await page.waitForFunction(
      '(window.__jsjsBrowserRun && window.__jsjsBrowserRun.done) === true',
      undefined,
      { timeout: 120000 },
    );

    const run =
      /** @type {{ results: { name: string, status: string }[], error: string | null }} */ (
        await page.evaluate('window.__jsjsBrowserRun')
      );

    for (const result of run.results) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }

    if (run.error !== null) {
      process.stdout.write(`${run.error}\n`);
      return 1;
    }

    return run.results.some((result) => result.status !== 'passed') ? 1 : 0;
  } finally {
    await browser.close();
  }
}

/**
 * @param {string} path
 * @returns {string}
 */
function contentTypeOf(path) {
  const extension = path.slice(path.lastIndexOf('.') + 1);

  return CONTENT_TYPES.get(extension) ?? 'application/octet-stream';
}
