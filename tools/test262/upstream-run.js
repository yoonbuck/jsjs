/**
 * Runs the pinned upstream Test262 subset.
 *
 * This is the command CI runs, and it is deliberately separate from
 * `test262:fixtures`. The fixture suite exercises the *runner* against a tiny
 * hand-written tree — metadata parsing, variants, negative expectations — and
 * proves nothing about conformance. This command exercises the *engine* against
 * real `tc39/test262` tests, read from a real checkout of the exact revision
 * `package.json` pins.
 *
 * Three things are checked before a single test runs, because a conformance
 * number measured against the wrong tree is worse than no number at all: the
 * checkout must exist, its `HEAD` must be exactly the pinned revision, and the
 * subset manifest must name that same repository and revision. Any mismatch
 * fails with the commands needed to fix it rather than running a different set
 * of tests and reporting success.
 *
 * The run produces two generated artifacts from one string each, so they can
 * never disagree with each other:
 *
 * - `docs/test262-report.jsonl` — every per-test record, the per-group baseline,
 *   the whole-suite inventory and coverage, and the summary. CI uploads this
 *   file even when the run fails, which is when the per-test records are worth
 *   reading.
 * - The coverage block in `docs/conformance.md` — a compact table, because a
 *   document that inlines two hundred JSON lines is a report nobody reads.
 *
 * Stdout is the compact summary rather than the whole report: it is what a CI
 * log should show at a glance, and any failing records go to stderr next to it.
 * `--check` writes nothing and fails when either artifact is stale, which is how
 * the local contract proves the committed files are the real output.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRealm, evaluateScript } from '../../src/index.js';
import { createNodeTest262Host } from './adapters/node.js';
import { formatRecordLine, formatReportLines } from './report.js';
import { runTest262Suite } from './runner.js';
import { TEST262_REPORT_FILE, COVERAGE_DOCUMENT_FILE } from '../ci/pipeline.js';
import {
  FEATURES_MANIFEST_FILE,
  featureNames,
  parseFeatureManifest,
} from './features.js';
import {
  collectTest262Inventory,
  formatCoverageLines,
  renderCoverageSummary,
  summarizeTest262Coverage,
} from './coverage.js';
import {
  UPSTREAM_SUBSET_FILE,
  formatUpstreamSummaryLines,
  parseUpstreamSubset,
  summarizeUpstreamRun,
  upstreamSubsetPaths,
} from './upstream.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);

/** Re-exported for consumers that import from this module. */
export { COVERAGE_DOCUMENT_FILE };

/**
 * @deprecated Use COVERAGE_DOCUMENT_FILE. Kept for migration compatibility.
 */
export const README_FILE = 'README.md';

/** Markers delimiting the generated block in the coverage document. */
export const COVERAGE_MARKER_BEGIN = '<!-- test262-coverage:begin -->';
export const COVERAGE_MARKER_END = '<!-- test262-coverage:end -->';

/**
 * Computes a relative path from one repository-relative file to another, for
 * use as a Markdown link target. Only handles the common case where both paths
 * use forward slashes (repository-relative POSIX paths).
 *
 * @param {string} from Repository-relative path of the document.
 * @param {string} to Repository-relative path of the target.
 * @returns {string}
 */
function relativePath(from, to) {
  const fromDir = from.slice(0, from.lastIndexOf('/'));
  const toDir = to.slice(0, to.lastIndexOf('/'));
  const toFile = to.slice(to.lastIndexOf('/') + 1);

  if (fromDir === toDir) {
    return toFile;
  }

  // Fall back to the full path when the directories differ in a way that a
  // simple same-directory check cannot resolve.
  return to;
}

/**
 * @param {string} path Repository-relative.
 * @returns {Promise<string>}
 */
function readRepositoryFile(path) {
  return readFile(new URL(path, REPOSITORY_ROOT_URL), 'utf8');
}

/**
 * @returns {Promise<{ repository: string, revision: string, checkoutPath: string }>}
 */
export async function readTest262Pin() {
  const manifest = JSON.parse(await readRepositoryFile('package.json'));
  const pin = manifest.test262;

  if (
    pin === undefined ||
    typeof pin.repository !== 'string' ||
    typeof pin.revision !== 'string' ||
    typeof pin.checkoutPath !== 'string'
  ) {
    throw new Error('package.json must pin the upstream Test262 tree');
  }

  return pin;
}

/**
 * @param {{ repository: string, revision: string, checkoutPath: string }} pin
 * @returns {string}
 */
function checkoutHint(pin) {
  return [
    'Check the pinned upstream tree out first:',
    `  git clone --filter=blob:none ${pin.repository} ${pin.checkoutPath}`,
    `  git -C ${pin.checkoutPath} checkout ${pin.revision}`,
  ].join('\n');
}

/**
 * Confirms the checkout really is the pinned revision. A detached `HEAD` holds
 * the raw commit id, which is exactly what a pinned checkout must have; a
 * branch reference means someone checked out something else.
 *
 * @param {{ repository: string, revision: string, checkoutPath: string }} pin
 * @returns {Promise<void>}
 */
export async function assertPinnedCheckout(pin) {
  /** @type {string} */
  let head;

  try {
    head = (await readRepositoryFile(`${pin.checkoutPath}/.git/HEAD`)).trim();
  } catch {
    throw new Error(
      `${pin.checkoutPath} is not a git checkout.\n${checkoutHint(pin)}`,
    );
  }

  if (head !== pin.revision) {
    throw new Error(
      `${pin.checkoutPath} is at ${head}, but package.json pins ${pin.revision}.\n${checkoutHint(
        pin,
      )}`,
    );
  }
}

/**
 * @param {readonly string[]} argv
 * @returns {Promise<number>}
 */
export async function main(argv = []) {
  const check = parseOptions(argv);
  const pin = await readTest262Pin();

  await assertPinnedCheckout(pin);

  const subset = parseUpstreamSubset(
    await readRepositoryFile(UPSTREAM_SUBSET_FILE),
  );

  if (subset.repository !== pin.repository) {
    throw new Error(
      `${UPSTREAM_SUBSET_FILE} selects tests from ${subset.repository}, but package.json pins ${pin.repository}`,
    );
  }

  if (subset.revision !== pin.revision) {
    throw new Error(
      `${UPSTREAM_SUBSET_FILE} was curated at ${subset.revision}, but package.json pins ${pin.revision}. Re-verify the subset against the new revision before moving the pin.`,
    );
  }

  const supportedFeatures = featureNames(
    parseFeatureManifest(await readRepositoryFile(FEATURES_MANIFEST_FILE)),
  );
  const host = createNodeTest262Host({ root: pin.checkoutPath });
  const paths = upstreamSubsetPaths(subset);
  const { records, summary } = await runTest262Suite({
    engine: { createRealm, evaluateScript },
    host,
    paths,
    supportedFeatures,
  });
  const coverage = summarizeTest262Coverage({
    inventory: await collectTest262Inventory({ host }),
    records,
    selected: paths,
  });
  const report = `${[
    ...formatReportLines(records),
    ...formatUpstreamSummaryLines(
      summarizeUpstreamRun({ subset, records, supportedFeatures }),
    ),
    ...formatCoverageLines(coverage),
    formatRecordLine(summary),
  ].join('\n')}\n`;
  const block = renderCoverageSummary({
    coverage,
    reportPath: TEST262_REPORT_FILE,
    reportLinkPath: relativePath(COVERAGE_DOCUMENT_FILE, TEST262_REPORT_FILE),
  });

  process.stdout.write(`${block}\n`);
  writeFailures(records);

  const stale = await synchronizeArtifacts({ report, block, check });

  if (stale.length > 0) {
    process.stderr.write(
      `${stale.join('\n')}\n${stale.length} generated file(s) are stale; run npm run test262:upstream\n`,
    );

    return 1;
  }

  return summary.failed > 0 ? 1 : 0;
}

/**
 * @param {readonly string[]} argv
 * @returns {boolean} Whether to check the generated files instead of writing.
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
 * Failing records go to stderr rather than into the compact stdout summary: a
 * red run's log has to name what broke, and a green run's log stays short.
 *
 * @param {readonly import('./report.js').Test262TestRecord[]} records
 * @returns {void}
 */
function writeFailures(records) {
  const failures = records.filter((record) => record.status === 'failed');

  if (failures.length > 0) {
    process.stderr.write(`${formatReportLines(failures).join('\n')}\n`);
  }
}

/**
 * Writes — or, in `--check` mode, only compares — the two generated artifacts.
 *
 * The detailed report is written even when tests failed, because that is exactly
 * when CI's uploaded artifact matters; `--check` writes nothing at all, so a
 * contract can assert the committed files are already the real output.
 *
 * @param {{ report: string, block: string, check: boolean }} options
 * @returns {Promise<string[]>} The stale files, in `--check` mode.
 */
async function synchronizeArtifacts(options) {
  const { report, block, check } = options;
  const coverageDoc = await readRepositoryFile(COVERAGE_DOCUMENT_FILE);
  const updated = replaceGeneratedBlock(coverageDoc, block);
  /** @type {string[]} */
  const stale = [];

  for (const [path, contents] of [
    [TEST262_REPORT_FILE, report],
    [COVERAGE_DOCUMENT_FILE, updated],
  ]) {
    const current = await readGeneratedFile(path);

    if (current === contents) {
      continue;
    }

    if (check) {
      stale.push(path);
      continue;
    }

    await writeFile(new URL(path, REPOSITORY_ROOT_URL), contents, 'utf8');
  }

  return stale;
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

/**
 * Replaces the marked block, leaving every other byte of the document alone.
 *
 * @param {string} document
 * @param {string} block
 * @returns {string}
 */
export function replaceGeneratedBlock(document, block) {
  const begin = document.indexOf(COVERAGE_MARKER_BEGIN);
  const end = document.indexOf(COVERAGE_MARKER_END);

  if (begin === -1 || end < begin) {
    throw new Error(
      `${COVERAGE_DOCUMENT_FILE} must delimit the generated coverage block with ${COVERAGE_MARKER_BEGIN} and ${COVERAGE_MARKER_END}`,
    );
  }

  return `${document.slice(0, begin + COVERAGE_MARKER_BEGIN.length)}\n\n${block}\n\n${document.slice(end)}`;
}

/**
 * The generated block's content, as `replaceGeneratedBlock` wrote it.
 *
 * @param {string} document
 * @returns {string}
 */
export function readGeneratedBlock(document) {
  const begin = document.indexOf(COVERAGE_MARKER_BEGIN);
  const end = document.indexOf(COVERAGE_MARKER_END);

  if (begin === -1 || end < begin) {
    throw new Error(
      `${COVERAGE_DOCUMENT_FILE} has no generated coverage block between ${COVERAGE_MARKER_BEGIN} and ${COVERAGE_MARKER_END}`,
    );
  }

  return document.slice(begin + COVERAGE_MARKER_BEGIN.length, end).trim();
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
