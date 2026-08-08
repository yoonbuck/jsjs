import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { contentTypeOf, resolveRepositoryPath } from '../run-browser.js';
import { assertCleanSourceState } from '../source-state.js';
import { captureProtocolProfiles } from './protocol.js';
import {
  buildProfileSidecar,
  profileArtifactContents,
  profileOutputDirectory,
  resolveProfileWorkload,
  writeProfileArtifactsAtomically,
} from './run-node.js';

const ORIGIN = 'http://jsjs.localhost';
const CHROMIUM_SETUP_MESSAGE =
  'Chromium is unavailable; run npx playwright install --with-deps --only-shell chromium';

/**
 * @typedef {{
 *   route: (pattern: string, handler: (route: any, request: any) => Promise<void>) => Promise<unknown>,
 *   goto: (url: string) => Promise<unknown>,
 *   evaluate: (fn: (...args: any[]) => unknown, args: Record<string, unknown>) => Promise<unknown>,
 *   context: () => { newCDPSession: (page: unknown) => Promise<{ send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>> }> },
 * }} ProfileBrowserPage
 *
 * @typedef {{
 *   runtimeVersion: string,
 *   expectedChecksum: number,
 *   elapsedMilliseconds: number,
 *   result: { checksum: number, iterations: number },
 * }} BrowserProfileCaptureResult
 *
 * @typedef {{
 *   version?: () => string,
 *   newPage: () => Promise<ProfileBrowserPage>,
 *   close: () => Promise<void>,
 * }} ProfileBrowser
 */

/**
 * @param {{
 *   host: 'chromium',
 *   workload: string,
 *   mode: 'cold' | 'steady',
 *   metric: 'cpu' | 'allocation',
 *   runId: string,
 *   warmups: number,
 *   iterations: number,
 *   cpuSamplingIntervalMicroseconds: number,
 *   allocationSamplingIntervalBytes: number,
 *   outputDirectory: string,
 *   source: { gitCommit: string, gitDirty: false },
 * }} options
 * @param {{
 *   launch?: () => Promise<ProfileBrowser>,
 *   createCDPSession?: (page: ProfileBrowserPage) => Promise<{ send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>> }>,
 *   captureProfiles?: typeof captureProtocolProfiles,
 *   generatedAt?: string,
 * }} [dependencies]
 * @returns {Promise<ReturnType<typeof buildProfileSidecar>>}
 */
export async function runChromiumProfile(options, dependencies = {}) {
  const workload = resolveProfileWorkload(options.workload);
  const generatedAt = dependencies.generatedAt ?? new Date().toISOString();
  const launch = dependencies.launch ?? (() => chromium.launch());
  const source = assertCleanSourceState(options.source);
  let browser;

  try {
    browser = await launch();
  } catch (error) {
    throw chromiumSetupError(error);
  }

  try {
    const page = /** @type {ProfileBrowserPage} */ (await browser.newPage());
    await page.route(`${ORIGIN}/**/*`, createRepositoryRouteHandler());
    await page.goto(`${ORIGIN}/benchmark/run-browser.html`);
    await prepareBrowserProfilePage(page, workload, options);

    const session = await (
      dependencies.createCDPSession ??
      ((targetPage) => targetPage.context().newCDPSession(targetPage))
    )(/** @type {ProfileBrowserPage} */ (page));
    const captureProfiles =
      dependencies.captureProfiles ?? captureProtocolProfiles;
    const capture = await captureProfiles({
      post: (method, params) =>
        /** @type {any} */ (session).send(method, params),
      metric: options.metric,
      cpuSamplingIntervalMicroseconds: options.cpuSamplingIntervalMicroseconds,
      allocationSamplingIntervalBytes: options.allocationSamplingIntervalBytes,
      run() {
        return measureBrowserProfilePage(page, workload, options);
      },
    });
    const version =
      typeof browser.version === 'function' ? browser.version() : 'chromium';
    const sidecar = buildProfileSidecar({
      host: 'chromium',
      runtime: Object.freeze({
        name: 'chromium',
        version,
        ...(typeof capture.result.runtimeVersion === 'string' &&
        capture.result.runtimeVersion.length > 0
          ? { userAgent: capture.result.runtimeVersion }
          : {}),
      }),
      source,
      generatedAt,
      captureOptions: options,
      captureResult: capture.result,
      cpuProfile: capture.cpuProfile,
      allocationProfile: capture.allocationProfile,
    });

    await writeProfileArtifactsAtomically(
      profileOutputDirectory(options.outputDirectory, 'chromium'),
      profileArtifactContents(
        sidecar,
        capture.cpuProfile,
        capture.allocationProfile,
      ),
    );

    return sidecar;
  } finally {
    await browser.close();
  }
}

/**
 * @param {ProfileBrowserPage} page
 * @param {{ name?: string, source: string, expectedChecksum: number }} workload
 * @param {{
 *   mode: 'cold' | 'steady',
 *   warmups: number,
 *   iterations: number,
 * }} options
 * @returns {Promise<void>}
 */
async function prepareBrowserProfilePage(page, workload, options) {
  await page.evaluate(
    /**
     * @param {{
     *   modulePath: string,
     *   phase: 'warmup',
     *   workload: { name?: string, source: string, expectedChecksum: number },
     *   mode: 'cold' | 'steady',
     *   warmups: number,
     *   iterations: number,
     * }} args
     */
    async (args) => {
      const { modulePath, workload, mode, warmups, iterations } = args;
      const module =
        /** @type {{ prepareBrowserProfilePage: typeof import('./run-browser-page.js').prepareBrowserProfilePage }} */ (
          await import(modulePath)
        );

      return module.prepareBrowserProfilePage({
        workload,
        mode,
        warmups,
        iterations,
      });
    },
    {
      modulePath: '/benchmark/profile/run-browser-page.js',
      phase: 'warmup',
      workload,
      mode: options.mode,
      warmups: options.warmups,
      iterations: options.iterations,
    },
  );
}

/**
 * @param {ProfileBrowserPage} page
 * @param {{ name?: string, source: string, expectedChecksum: number }} workload
 * @param {{
 *   mode: 'cold' | 'steady',
 *   warmups: number,
 *   iterations: number,
 * }} options
 * @returns {Promise<BrowserProfileCaptureResult>}
 */
async function measureBrowserProfilePage(page, workload, options) {
  const measured = await page.evaluate(
    /**
     * @param {{
     *   modulePath: string,
     *   phase: 'measure',
     *   workload: { name?: string, source: string, expectedChecksum: number },
     *   mode: 'cold' | 'steady',
     *   warmups: number,
     *   iterations: number,
     * }} args
     */
    async (args) => {
      const { modulePath, workload, mode, warmups, iterations } = args;
      const module =
        /** @type {{ runBrowserProfilePage: typeof import('./run-browser-page.js').runBrowserProfilePage }} */ (
          await import(modulePath)
        );

      return module.runBrowserProfilePage({
        workload,
        mode,
        warmups,
        iterations,
      });
    },
    {
      modulePath: '/benchmark/profile/run-browser-page.js',
      phase: 'measure',
      workload,
      mode: options.mode,
      warmups: options.warmups,
      iterations: options.iterations,
    },
  );

  return /** @type {BrowserProfileCaptureResult} */ (measured);
}

/**
 * @returns {(route: { fulfill: (response: { status: number, contentType?: string, body: string }) => Promise<void> }, request: { url: () => string }) => Promise<void>}
 */
function createRepositoryRouteHandler() {
  return async (route, request) => {
    try {
      const url = new URL(request.url());

      if (url.pathname === '/benchmark/run-browser.html') {
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: '<!doctype html>\n<html>\n  <body></body>\n</html>',
        });
        return;
      }

      const fileUrl = resolveRepositoryPath(url.pathname);
      const body = await readFile(fileUrl, 'utf8');

      await route.fulfill({
        status: 200,
        contentType: contentTypeOf(fileUrl.pathname),
        body,
      });
    } catch {
      await route.fulfill({ status: 404, body: 'Not found' });
    }
  };
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
