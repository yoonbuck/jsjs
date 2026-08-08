import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { validateHostReport } from './report.js';

const REPOSITORY_ROOT = new URL('../', import.meta.url);
const ORIGIN = 'http://jsjs.localhost';

const CONTENT_TYPES = new Map([
  ['html', 'text/html; charset=utf-8'],
  ['js', 'text/javascript; charset=utf-8'],
  ['mjs', 'text/javascript; charset=utf-8'],
  ['json', 'application/json; charset=utf-8'],
]);

const CHROMIUM_SETUP_MESSAGE =
  'Chromium is unavailable; run npx playwright install --with-deps --only-shell chromium';

/**
 * @param {{
 *   profile: string,
 *   warmups: number,
 *   samples: number,
 *   targetSampleMs: number,
 *   maxBatchSize: number,
 *   workloads: readonly {
 *     name: string,
 *     source: string,
 *     expectedChecksum: number,
 *   }[],
 * }} config
 * @param {{
 *   launch?: () => Promise<import('playwright').Browser>,
 *   generatedAt?: string,
 *   runId?: string,
 * }} [options]
 */
export async function runChromiumBenchmark(config, options = {}) {
  const launch = options.launch ?? (() => chromium.launch());
  let browser;

  try {
    browser = await launch();
  } catch (error) {
    throw chromiumSetupError(error);
  }

  try {
    const generatedAt = options.generatedAt ?? new Date().toISOString();
    const runId = options.runId ?? `chromium-${generatedAt}`;
    const version =
      typeof browser.version === 'function' ? browser.version() : 'chromium';
    const page = await browser.newPage();

    await page.route(`${ORIGIN}/**/*`, async (route, request) => {
      try {
        if (new URL(request.url()).pathname === '/benchmark/run-browser.html') {
          await route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: browserLoaderPage(),
          });
          return;
        }

        const fileUrl = resolveRepositoryPath(new URL(request.url()).pathname);
        const body = await readFile(fileUrl, 'utf8');

        await route.fulfill({
          status: 200,
          contentType: contentTypeOf(fileUrl.pathname),
          body,
        });
      } catch {
        await route.fulfill({ status: 404, body: 'Not found' });
      }
    });
    await page.goto(`${ORIGIN}/benchmark/run-browser.html`);

    const report = await page.evaluate(
      async ({
        benchmarkConfig,
        benchmarkGeneratedAt,
        benchmarkRunId,
        benchmarkVersion,
        modulePath,
      }) => {
        const { runBrowserPageBenchmark } =
          /** @type {{ runBrowserPageBenchmark: typeof import('./run-browser-page.js').runBrowserPageBenchmark }} */ (
            await import(modulePath)
          );

        return runBrowserPageBenchmark(benchmarkConfig, {
          generatedAt: benchmarkGeneratedAt,
          runId: benchmarkRunId,
          version: benchmarkVersion,
        });
      },
      {
        benchmarkConfig: config,
        benchmarkGeneratedAt: generatedAt,
        benchmarkRunId: runId,
        benchmarkVersion: version,
        modulePath: '/benchmark/run-browser-page.js',
      },
    );

    return parseChromiumReport(report);
  } finally {
    await browser.close();
  }
}

/**
 * @template T
 * @param {unknown} report
 * @param {(value: unknown) => T} [validate]
 * @returns {T}
 */
export function parseChromiumReport(report, validate) {
  const parse =
    validate ?? /** @type {(value: unknown) => T} */ (validateHostReport);

  return parse(report);
}

/**
 * @param {string} pathname
 * @returns {URL}
 */
export function resolveRepositoryPath(pathname) {
  const relativePath = decodeURIComponent(pathname).replace(/^\/+/, '');

  if (relativePath.length === 0) {
    throw new Error(`Cannot serve repository root for ${pathname}`);
  }

  const fileUrl = new URL(relativePath, REPOSITORY_ROOT);

  if (!fileUrl.href.startsWith(REPOSITORY_ROOT.href)) {
    throw new Error(`Cannot serve path outside repository: ${pathname}`);
  }

  return fileUrl;
}

/**
 * @param {string} path
 * @returns {string}
 */
export function contentTypeOf(path) {
  const extension = path.slice(path.lastIndexOf('.') + 1);

  return CONTENT_TYPES.get(extension) ?? 'application/octet-stream';
}

/**
 * @returns {string}
 */
function browserLoaderPage() {
  return `<!doctype html>
<html>
  <body></body>
</html>`;
}

/**
 * @param {unknown} error
 * @returns {Error}
 */
function chromiumSetupError(error) {
  if (
    error instanceof Error &&
    /Executable doesn't exist|Please run the following command/i.test(
      error.message,
    )
  ) {
    return new Error(CHROMIUM_SETUP_MESSAGE);
  }

  return error instanceof Error ? error : new Error(String(error));
}
