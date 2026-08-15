/**
 * Browser adapter for the portable Test262 runner.
 *
 * Browsers cannot enumerate directories, so this host offers no `listTests` and
 * the selection comes from the checked-in manifest that `selection.js` owns;
 * everything else is plain `fetch`. This module contains no DOM access and no
 * Node built-ins, so it can be imported from the shared test suite in every
 * runtime — the page is responsible for rendering, this file only loads text.
 */

import {
  DEFAULT_HARNESS_DIRECTORY,
  TEST262_MANIFEST_FILE,
} from '../selection.js';

/**
 * @typedef {import('../runner.js').Test262Host} Test262Host
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
  const harnessDirectory =
    options.harnessDirectory ?? DEFAULT_HARNESS_DIRECTORY;
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
    readModule(file) {
      return readText(file);
    },
    readInclude(name) {
      return readText(`${harnessDirectory}/${name}`);
    },
    readManifest() {
      return readText(TEST262_MANIFEST_FILE);
    },
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
