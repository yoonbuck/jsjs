/**
 * Browser adapter for the portable Test262 runner.
 *
 * Browsers cannot enumerate directories, so the test list comes from a
 * checked-in `manifest.json` next to the tests; everything else is plain
 * `fetch`. This module contains no DOM access and no Node built-ins, so it can
 * be imported from the shared test suite in every runtime — the page is
 * responsible for rendering, this file only loads text.
 */

import { runTest262Suite } from '../runner.js';
import { formatReportLines } from '../report.js';

/**
 * @typedef {import('../runner.js').Test262Host} Test262Host
 * @typedef {import('../runner.js').Test262Engine} Test262Engine
 */

/**
 * @param {{
 *   root: string | URL,
 *   harnessDirectory?: string,
 *   fetchImpl?: (input: string) => Promise<{ ok: boolean, status: number, text(): Promise<string> }>,
 * }} options
 * @returns {Test262Host}
 */
export function createBrowserTest262Host(options) {
  const root = toDirectoryUrl(options.root);
  const harnessDirectory = options.harnessDirectory ?? 'harness';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== 'function') {
    throw new TypeError(
      'The browser Test262 host needs a fetch implementation',
    );
  }

  /**
   * @param {string} path
   * @returns {Promise<string>}
   */
  const readText = async (path) => {
    const url = new URL(path, root).href;
    const response = await fetchImpl(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${path}`);
    }

    return response.text();
  };

  return {
    readTest(file) {
      return readText(file);
    },
    readInclude(name) {
      return readText(`${harnessDirectory}/${name}`);
    },
    readManifest() {
      return readText('manifest.json');
    },
  };
}

/**
 * Runs the manifest of a fixture/test262 tree and returns the report lines,
 * leaving output rendering to the page that called it.
 *
 * @param {{
 *   engine: Test262Engine,
 *   host: Test262Host,
 *   supportedFeatures?: readonly string[],
 *   skipFeatures?: readonly string[],
 *   includeMalformed?: boolean,
 * }} options
 * @returns {Promise<{ lines: string[], failed: number }>}
 */
export async function runTest262Manifest(options) {
  const { host } = options;

  if (!host.readManifest) {
    throw new TypeError('The Test262 host cannot read a manifest');
  }

  const manifest = JSON.parse(await host.readManifest());
  const tests = Array.isArray(manifest.tests) ? manifest.tests : [];
  const malformed =
    options.includeMalformed && Array.isArray(manifest.malformed)
      ? manifest.malformed
      : [];
  const { records, summary } = await runTest262Suite({
    engine: options.engine,
    host,
    paths: [...tests, ...malformed],
    supportedFeatures: options.supportedFeatures,
    skipFeatures: options.skipFeatures,
  });

  return {
    lines: formatReportLines([...records, summary]),
    failed: summary.failed,
  };
}

/**
 * @param {string | URL} root
 * @returns {URL}
 */
function toDirectoryUrl(root) {
  const base =
    typeof globalThis.location === 'undefined'
      ? undefined
      : globalThis.location.href;
  const text = root instanceof URL ? root.href : root;

  return new URL(text.endsWith('/') ? text : `${text}/`, base);
}
