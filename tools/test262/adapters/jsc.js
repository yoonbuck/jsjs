/**
 * JavaScriptCore (`jsc` shell) adapter for the portable Test262 runner.
 *
 * The shell has no directory listing and no `fetch`, so file access goes
 * through its `readFile`/`read` global and the test list comes from the same
 * checked-in `manifest.json` the browser adapter uses. Like the other
 * adapters this file contributes no test semantics: it only maps host APIs
 * onto the `Test262Host` protocol and prints the shared report.
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
 *   readFileImpl?: (path: string) => string,
 * }} options
 * @returns {Test262Host}
 */
export function createJscTest262Host(options) {
  const root = toDirectoryPath(options.root);
  const harnessDirectory = options.harnessDirectory ?? 'harness';
  const readFileImpl =
    options.readFileImpl ??
    /** @type {((path: string) => string) | undefined} */ (
      globalThis.readFile ?? globalThis.read
    );

  if (typeof readFileImpl !== 'function') {
    throw new TypeError('The JSC Test262 host needs a readFile implementation');
  }

  return {
    readTest(file) {
      return readFileImpl(`${root}${file}`);
    },
    readInclude(name) {
      return readFileImpl(`${root}${harnessDirectory}/${name}`);
    },
    readManifest() {
      return readFileImpl(`${root}manifest.json`);
    },
  };
}

/**
 * @param {{
 *   engine: Test262Engine,
 *   host: Test262Host,
 *   supportedFeatures?: readonly string[],
 *   skipFeatures?: readonly string[],
 *   includeMalformed?: boolean,
 * }} options
 * @returns {Promise<{ lines: string[], failed: number }>}
 */
export async function runJscTest262Manifest(options) {
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
 * Normalizes a `file:` URL or plain directory path into the trailing-slash
 * path string the shell's `readFile` expects.
 *
 * @param {string | URL} root
 * @returns {string}
 */
function toDirectoryPath(root) {
  const text = typeof root === 'string' ? root : String(root);
  const path = text.startsWith('file://')
    ? decodeURIComponent(text.slice('file://'.length))
    : text;

  return path.endsWith('/') ? path : `${path}/`;
}
