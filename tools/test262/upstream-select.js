/**
 * Derives the broad ES5.1 upstream subset from the pinned Test262 checkout.
 *
 * `test262:upstream` runs whatever `tools/test262/upstream-subset.json` names;
 * this command is what *writes* that file. Rather than hand-curating thousands
 * of paths, it walks the pinned tree once and keeps every test that the ES5.1
 * selection policy (`tools/test262/es5-selection.js` + `es5-selection.json`)
 * says is in scope: a script (not a module) that parses under the engine's
 * supported grammar, lives under an in-scope directory, is either in the
 * known-good subset or declares a claimed issue-expansion feature, and avoids
 * classified exclusions. Everything host-specific — reading the tree, parsing
 * with the engine, and writing the manifest — lives here; the policy itself is
 * pure and host-free so the same decisions can be tested without a checkout.
 *
 * The same three guards `test262:upstream` uses protect this command, because a
 * subset derived from the wrong tree is worse than no subset at all: the
 * checkout must exist and its `HEAD` must be exactly the pinned revision (both
 * reused from `upstream-run.js`), and the manifest this command writes carries
 * that same repository and revision so the two commands can never disagree.
 *
 * `--check` writes nothing and fails when the committed manifest is stale, which
 * is how the local contract proves `tools/test262/upstream-subset.json` is the
 * real, current output of this generator rather than a drifted hand-edit.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  ES5_SELECTION_FILE,
  buildUpstreamSubset,
  parseEs5Selection,
  serializeUpstreamSubset,
} from './es5-selection.js';
import {
  UPSTREAM_SUBSET_FILE,
  parseUpstreamSubset,
  upstreamSubsetPaths,
} from './upstream.js';
import { assertPinnedCheckout, readTest262Pin } from './upstream-run.js';
import { inspectEngineGrammar, selectPaths } from './upstream-select-paths.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);

/** The preserved selection from immediately before issue #25 grammar widening. */
export const KNOWN_GOOD_SUBSET_FILE = 'tools/test262/known-good-subset.json';

/** The Test262 subtree the selection walks; harness and tooling live outside it. */
const TEST_SUBTREE = 'test';

/** The harness directory whose includes must themselves parse under the grammar. */
const HARNESS_DIRECTORY = 'harness';

/**
 * @param {string} path Repository-relative.
 * @returns {Promise<string>}
 */
function readRepositoryFile(path) {
  return readFile(new URL(path, REPOSITORY_ROOT_URL), 'utf8');
}

/**
 * Lists every `.js` test under the checkout's `test/` subtree, as paths relative
 * to the checkout (`test/...`). Test262's `_FIXTURE` helpers are not tests and
 * are skipped exactly as the upstream harness skips them.
 *
 * @param {string} checkoutPath Repository-relative path to the pinned checkout.
 * @returns {Promise<string[]>}
 */
async function listTestFiles(checkoutPath) {
  /** @type {string[]} */
  const files = [];

  /**
   * @param {string} relativeDirectory Checkout-relative, with a trailing slash.
   * @returns {Promise<void>}
   */
  async function walk(relativeDirectory) {
    const entries = await readdir(
      new URL(`${checkoutPath}/${relativeDirectory}`, REPOSITORY_ROOT_URL),
      { withFileTypes: true },
    );

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name !== '_FIXTURE') {
          await walk(`${relativeDirectory}${entry.name}/`);
        }
      } else if (
        entry.name.endsWith('.js') &&
        !entry.name.endsWith('_FIXTURE.js')
      ) {
        files.push(`${relativeDirectory}${entry.name}`);
      }
    }
  }

  await walk(`${TEST_SUBTREE}/`);

  return files;
}

/**
 * Reads every harness include and records whether it parses under the broad
 * selection grammar. A test that pulls in an include the policy rejects cannot
 * run.
 *
 * @param {string} checkoutPath
 * @param {import('./es5-selection.js').Es5SelectionPolicy} policy
 * @returns {Promise<Map<string, ReturnType<typeof inspectEngineGrammar>>>}
 */
async function readHarnessParsing(checkoutPath, policy) {
  const entries = await readdir(
    new URL(`${checkoutPath}/${HARNESS_DIRECTORY}`, REPOSITORY_ROOT_URL),
    { withFileTypes: true },
  );
  /** @type {Map<string, ReturnType<typeof inspectEngineGrammar>>} */
  const parsing = new Map();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) {
      continue;
    }

    const source = await readRepositoryFile(
      `${checkoutPath}/${HARNESS_DIRECTORY}/${entry.name}`,
    );

    parsing.set(entry.name, inspectEngineGrammar(source, policy));
  }

  return parsing;
}

/**
 * @param {readonly string[]} argv
 * @returns {Promise<number>}
 */
export async function main(argv = []) {
  const check = parseOptions(argv);
  const pin = await readTest262Pin();

  await assertPinnedCheckout(pin);

  const [policyText, knownGoodText] = await Promise.all([
    readRepositoryFile(ES5_SELECTION_FILE),
    readRepositoryFile(KNOWN_GOOD_SUBSET_FILE),
  ]);
  const policy = parseEs5Selection(policyText);
  const knownGoodSubset = parseUpstreamSubset(knownGoodText);

  if (
    knownGoodSubset.repository !== pin.repository ||
    knownGoodSubset.revision !== pin.revision
  ) {
    throw new Error(
      `${KNOWN_GOOD_SUBSET_FILE} must match the pinned Test262 repository and revision`,
    );
  }
  const previouslySelected = new Set(upstreamSubsetPaths(knownGoodSubset));
  const [files, harnessParsing] = await Promise.all([
    listTestFiles(pin.checkoutPath),
    readHarnessParsing(pin.checkoutPath, policy),
  ]);
  const paths = await selectPaths({
    files,
    policy,
    previouslySelected,
    harnessParsing,
    readSource: (path) => readRepositoryFile(`${pin.checkoutPath}/${path}`),
  });
  const subset = buildUpstreamSubset({
    repository: pin.repository,
    revision: pin.revision,
    paths,
  });
  const manifest = serializeUpstreamSubset(subset);

  // Prove the generator's own output satisfies the schema `test262:upstream`
  // enforces, so a policy change can never write a manifest that command
  // rejects.
  parseUpstreamSubset(manifest);

  const current = await readGeneratedFile(UPSTREAM_SUBSET_FILE);

  if (current === manifest) {
    process.stdout.write(
      `${UPSTREAM_SUBSET_FILE} is current: ${paths.length} paths across ${subset.groups.length} groups\n`,
    );

    return 0;
  }

  if (check) {
    process.stderr.write(
      `${UPSTREAM_SUBSET_FILE} is stale; run npm run test262:select\n`,
    );

    return 1;
  }

  await writeFile(
    new URL(UPSTREAM_SUBSET_FILE, REPOSITORY_ROOT_URL),
    manifest,
    'utf8',
  );
  process.stdout.write(
    `Wrote ${UPSTREAM_SUBSET_FILE}: ${paths.length} paths across ${subset.groups.length} groups\n`,
  );

  return 0;
}

/**
 * @param {readonly string[]} argv
 * @returns {boolean} Whether to check the manifest instead of writing it.
 */
function parseOptions(argv) {
  for (const argument of argv) {
    if (argument !== '--check') {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return argv.includes('--check');
}

/**
 * @param {string} path Repository-relative.
 * @returns {Promise<string | null>}
 */
async function readGeneratedFile(path) {
  try {
    return await readRepositoryFile(path);
  } catch {
    return null;
  }
}

if (isDirectInvocation()) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.exitCode = 1;
      process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
    },
  );
}

/**
 * True when this module is the process entry point rather than an import.
 *
 * @returns {boolean}
 */
function isDirectInvocation() {
  const entry = process.argv[1];

  return (
    typeof entry === 'string' && pathToFileURL(entry).href === import.meta.url
  );
}
