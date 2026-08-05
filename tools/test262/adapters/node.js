/**
 * Node adapter for the portable Test262 runner.
 *
 * The adapter is deliberately thin: it turns a directory of test files into
 * the `Test262Host` protocol (`readTest`, `readInclude`, `readManifest`,
 * `listTests`) and provides a CLI entry point. All test semantics live in
 * `tools/test262/runner.js`, which never imports this file.
 *
 * Roots are resolved against the repository, not the current working
 * directory, so npm scripts behave the same no matter where they are invoked
 * from.
 */

import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRealm, evaluateScript } from '../../../src/index.js';
import { runTest262Suite } from '../runner.js';
import { formatReport } from '../report.js';

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
  const harnessDirectory = options.harnessDirectory ?? 'harness';

  return {
    readTest(file) {
      return readFile(new URL(file, root), 'utf8');
    },
    readInclude(name) {
      return readFile(new URL(`${harnessDirectory}/${name}`, root), 'utf8');
    },
    readManifest() {
      return readFile(new URL('manifest.json', root), 'utf8');
    },
    async listTests() {
      const files = await listJavaScriptFiles(root, '', harnessDirectory);
      return files.sort();
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
  const paths = await resolvePaths(host, options);
  const { records, summary } = await runTest262Suite({
    engine: { createRealm, evaluateScript },
    host,
    paths,
    supportedFeatures: options.features,
    skipFeatures: options.skipFeatures,
  });

  process.stdout.write(formatReport([...records, summary]));

  return summary.failed > 0 ? 1 : 0;
}

/**
 * @param {Test262Host} host
 * @param {ReturnType<typeof parseArguments>} options
 * @returns {Promise<string[]>}
 */
async function resolvePaths(host, options) {
  if (options.paths.length > 0) {
    return [...options.paths];
  }

  /** @type {string | null} */
  let manifestText = null;

  try {
    manifestText = host.readManifest ? await host.readManifest() : null;
  } catch {
    manifestText = null;
  }

  if (manifestText === null) {
    return host.listTests ? [...(await host.listTests())] : [];
  }

  const manifest = JSON.parse(manifestText);
  const tests = Array.isArray(manifest.tests) ? manifest.tests : [];
  const malformed =
    options.includeMalformed && Array.isArray(manifest.malformed)
      ? manifest.malformed
      : [];

  return [...tests, ...malformed];
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
  let harnessDirectory = 'harness';
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
