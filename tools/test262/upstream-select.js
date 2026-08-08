/**
 * Derives the broad ES5.1 upstream subset from the pinned Test262 checkout.
 *
 * `test262:upstream` runs whatever `tools/test262/upstream-subset.json` names;
 * this command is what *writes* that file. Rather than hand-curating thousands
 * of paths, it walks the pinned tree once and keeps every test that the ES5.1
 * selection policy (`tools/test262/es5-selection.js` + `es5-selection.json`)
 * says is in scope: a script (not a module) that parses under the engine's
 * supported grammar, lives under an in-scope directory, declares no `features:`
 * tag outside what a `featureAreas` claim covers for its path, and is not
 * carved out by a classified exclusion. Everything host-specific — reading the
 * tree, parsing with the engine, and writing the manifest — lives here; the
 * policy itself is pure and host-free so the same decisions can be tested
 * without a checkout.
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
import { parseScript } from '../../src/parser.js';
import {
  ES5_SELECTION_FILE,
  buildUpstreamSubset,
  isCandidatePath,
  matchExclusion,
  parseEs5Selection,
  scanFrontmatter,
  serializeUpstreamSubset,
} from './es5-selection.js';
import { UPSTREAM_SUBSET_FILE, parseUpstreamSubset } from './upstream.js';
import { assertPinnedCheckout, readTest262Pin } from './upstream-run.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);

/** The Test262 subtree the selection walks; harness and tooling live outside it. */
const TEST_SUBTREE = 'test';

/** The harness directory whose includes must themselves parse under the grammar. */
const HARNESS_DIRECTORY = 'harness';

/**
 * A candidate whose structural filters can only pass once the file is read; the
 * pre-filter uses it to skip reading tests an excluded directory already
 * rejects, so the walk parses in-scope files only.
 *
 * @type {import('./es5-selection.js').Es5CandidateInfo}
 */
const READABLE_CANDIDATE = Object.freeze({
  declaresFeatures: false,
  features: Object.freeze([]),
  isModule: false,
  parsesUnderEngineGrammar: true,
  includesParseUnderEngineGrammar: true,
});

/**
 * @param {string} path Repository-relative.
 * @returns {Promise<string>}
 */
function readRepositoryFile(path) {
  return readFile(new URL(path, REPOSITORY_ROOT_URL), 'utf8');
}

/**
 * Whether a source parses under the engine's supported grammar — ES5.1 plus the
 * lexical declarations the engine now accepts. Using the engine's own
 * `parseScript` (rather than a bare Acorn call at a fixed `ecmaVersion`) keeps
 * selection honest as the grammar grows: whatever the engine can parse is
 * exactly what is in scope. Selection asks only the yes/no question, so a parse
 * failure — including the engine's ES2015-not-yet-supported early errors and
 * its stack-overflow-to-`SyntaxError` conversion — is a "no", never a throw.
 *
 * @param {string} source
 * @returns {boolean}
 */
function parsesUnderEngineGrammar(source) {
  try {
    parseScript(source);

    return true;
  } catch {
    return false;
  }
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
 * Reads every harness include and records whether it parses under the engine's
 * supported grammar. A test that pulls in an include the grammar rejects cannot
 * itself run, so such a test is not in scope even when its own body parses.
 *
 * @param {string} checkoutPath
 * @returns {Promise<Map<string, boolean>>}
 */
async function readHarnessParsing(checkoutPath) {
  const entries = await readdir(
    new URL(`${checkoutPath}/${HARNESS_DIRECTORY}`, REPOSITORY_ROOT_URL),
    { withFileTypes: true },
  );
  /** @type {Map<string, boolean>} */
  const parsing = new Map();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) {
      continue;
    }

    const source = await readRepositoryFile(
      `${checkoutPath}/${HARNESS_DIRECTORY}/${entry.name}`,
    );

    parsing.set(entry.name, parsesUnderEngineGrammar(source));
  }

  return parsing;
}

/**
 * Applies the selection policy to the pinned tree and returns the selected
 * paths, sorted. Structural filters that depend only on the path run before the
 * file is read, so an excluded directory or a classified exclusion costs no I/O.
 *
 * @param {{
 *   checkoutPath: string,
 *   policy: import('./es5-selection.js').Es5SelectionPolicy,
 * }} options
 * @returns {Promise<string[]>}
 */
async function selectPaths(options) {
  const { checkoutPath, policy } = options;
  const files = await listTestFiles(checkoutPath);
  const harnessParsing = await readHarnessParsing(checkoutPath);
  /** @type {string[]} */
  const selected = [];

  for (const path of files) {
    if (!isCandidatePath(path, READABLE_CANDIDATE, policy)) {
      continue;
    }

    if (matchExclusion(path, policy.exclusions) !== null) {
      continue;
    }

    const source = await readRepositoryFile(`${checkoutPath}/${path}`);
    const frontmatter = scanFrontmatter(source);
    const info = {
      declaresFeatures: frontmatter.hasFeatures,
      features: frontmatter.features,
      isModule: frontmatter.isModule,
      parsesUnderEngineGrammar: parsesUnderEngineGrammar(source),
      includesParseUnderEngineGrammar: frontmatter.includes.every(
        (name) => harnessParsing.get(name) !== false,
      ),
    };

    if (isCandidatePath(path, info, policy)) {
      selected.push(path);
    }
  }

  return selected;
}

/**
 * @param {readonly string[]} argv
 * @returns {Promise<number>}
 */
export async function main(argv = []) {
  const check = parseOptions(argv);
  const pin = await readTest262Pin();

  await assertPinnedCheckout(pin);

  const policy = parseEs5Selection(
    await readRepositoryFile(ES5_SELECTION_FILE),
  );
  const paths = await selectPaths({ checkoutPath: pin.checkoutPath, policy });
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
