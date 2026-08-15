/**
 * JavaScriptCore (`jsc` shell) adapter for the portable Test262 runner.
 *
 * The shell has no directory listing and no `fetch`, so file access goes
 * through its `readFile`/`read` global and the selection comes from the same
 * checked-in manifest the browser adapter uses, parsed by `selection.js`. Like
 * the other adapters this file contributes no test semantics: it only maps host
 * APIs onto the `Test262Host` protocol.
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
 *   readFileImpl?: (path: string) => string,
 * }} options
 * @returns {Test262Host}
 */
export function createJscTest262Host(options) {
  const root = toDirectoryPath(options.root);
  const harnessDirectory =
    options.harnessDirectory ?? DEFAULT_HARNESS_DIRECTORY;
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
    readModule(file) {
      return readFileImpl(`${root}${file}`);
    },
    readInclude(name) {
      return readFileImpl(`${root}${harnessDirectory}/${name}`);
    },
    readManifest() {
      return readFileImpl(`${root}${TEST262_MANIFEST_FILE}`);
    },
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
