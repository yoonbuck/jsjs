/**
 * Node adapter for the portable Test262 runner.
 *
 * The adapter is deliberately thin: it turns a directory of test files into the
 * `Test262Host` protocol (`readTest`, `readInclude`, `readManifest`,
 * `listTests`), parses a CLI, and writes the shared report. Which tests run and
 * what a record looks like are decided by `tools/test262/selection.js` and
 * `tools/test262/runner.js`, which never import this file.
 *
 * Roots are resolved against the repository, not the current working
 * directory, so npm scripts behave the same no matter where they are invoked
 * from.
 */

import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRealm, evaluateScript } from '../../../src/index.js';
import { runTest262 } from '../runner.js';
import {
  DEFAULT_HARNESS_DIRECTORY,
  TEST262_MANIFEST_FILE,
} from '../selection.js';

/**
 * @typedef {import('../runner.js').Test262Host} Test262Host
 */

const REPOSITORY_ROOT = new URL('../../../', import.meta.url);

/**
 * @param {{ root: string | URL, harnessDirectory?: string }} options
 * @returns {Test262Host}
 */
export function createNodeTest262Host(options) {
  const root = toDirectoryUrl(options.root);
  const harnessDirectory =
    options.harnessDirectory ?? DEFAULT_HARNESS_DIRECTORY;

  return {
    readTest(file) {
      return readFile(new URL(file, root), 'utf8');
    },
    readInclude(name) {
      return readFile(new URL(`${harnessDirectory}/${name}`, root), 'utf8');
    },
    readManifest() {
      return readFile(new URL(TEST262_MANIFEST_FILE, root), 'utf8');
    },
    async listTests() {
      return listJavaScriptFiles(root, '', harnessDirectory);
    },
  };
}

/**
 * @param {readonly string[]} argv
 * @returns {Promise<number>}
 */
export async function main(argv) {
  const options = parseArguments(argv);
  const host = createNodeTest262Host({
    root: options.root,
    harnessDirectory: options.harnessDirectory,
  });
  const { lines, failed } = await runTest262({
    engine: { createRealm, evaluateScript },
    host,
    paths: options.paths,
    includeMalformed: options.includeMalformed,
    supportedFeatures: options.features,
    skipFeatures: options.skipFeatures,
  });

  for (const line of lines) {
    process.stdout.write(`${line}\n`);
  }

  return failed > 0 ? 1 : 0;
}

/**
 * @param {readonly string[]} argv
 * @returns {{
 *   root: string,
 *   harnessDirectory: string,
 *   features: string[],
 *   skipFeatures: string[],
 *   includeMalformed: boolean,
 *   paths: string[],
 * }}
 */
function parseArguments(argv) {
  let root = 'test/fixtures/test262';
  let harnessDirectory = DEFAULT_HARNESS_DIRECTORY;
  /** @type {string[]} */
  let features = [];
  /** @type {string[]} */
  let skipFeatures = [];
  let includeMalformed = false;
  /** @type {string[]} */
  const paths = [];

  for (const argument of argv) {
    if (argument.startsWith('--root=')) {
      root = argument.slice('--root='.length);
    } else if (argument.startsWith('--harness=')) {
      harnessDirectory = argument.slice('--harness='.length);
    } else if (argument.startsWith('--features=')) {
      features = splitList(argument.slice('--features='.length));
    } else if (argument.startsWith('--skip-features=')) {
      skipFeatures = splitList(argument.slice('--skip-features='.length));
    } else if (argument === '--include-malformed') {
      includeMalformed = true;
    } else if (argument.startsWith('--')) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      paths.push(argument);
    }
  }

  return {
    root,
    harnessDirectory,
    features,
    skipFeatures,
    includeMalformed,
    paths,
  };
}

/**
 * @param {string} value
 * @returns {string[]}
 */
function splitList(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/**
 * @param {URL} root
 * @param {string} prefix
 * @param {string} harnessDirectory
 * @returns {Promise<string[]>}
 */
async function listJavaScriptFiles(root, prefix, harnessDirectory) {
  const entries = await readdir(new URL(prefix, root), { withFileTypes: true });
  /** @type {string[]} */
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (`${prefix}${entry.name}` === harnessDirectory) {
        continue;
      }

      files.push(
        ...(await listJavaScriptFiles(
          root,
          `${prefix}${entry.name}/`,
          harnessDirectory,
        )),
      );
    } else if (entry.name.endsWith('.js')) {
      files.push(`${prefix}${entry.name}`);
    }
  }

  return files;
}

/**
 * @param {string | URL} root
 * @returns {URL}
 */
function toDirectoryUrl(root) {
  if (root instanceof URL) {
    return root.href.endsWith('/') ? root : new URL(`${root.href}/`);
  }

  const text = root.endsWith('/') ? root : `${root}/`;

  return text.startsWith('file:')
    ? new URL(text)
    : new URL(text, REPOSITORY_ROOT);
}

if (isDirectInvocation()) {
  main(process.argv.slice(2)).then(
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
}

/**
 * True when this module is the process entry point rather than an import from
 * the shared test suite, which loads it only for its host implementation.
 *
 * @returns {boolean}
 */
function isDirectInvocation() {
  const entry = process.argv[1];

  return (
    typeof entry === 'string' && pathToFileURL(entry).href === import.meta.url
  );
}
