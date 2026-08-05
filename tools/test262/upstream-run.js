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
 * The report is written twice — to stdout for local use and to
 * `TEST262_REPORT_FILE` for CI to upload as an artifact even when the run fails
 * — from the same string, so the artifact can never disagree with the log.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRealm, evaluateScript } from '../../src/index.js';
import { createNodeTest262Host } from './adapters/node.js';
import { formatRecordLine, formatReportLines } from './report.js';
import { runTest262Suite } from './runner.js';
import { TEST262_REPORT_FILE } from '../ci/pipeline.js';
import {
  FEATURES_MANIFEST_FILE,
  featureNames,
  parseFeatureManifest,
} from './features.js';
import {
  UPSTREAM_SUBSET_FILE,
  formatUpstreamSummaryLines,
  parseUpstreamSubset,
  summarizeUpstreamRun,
  upstreamSubsetPaths,
} from './upstream.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);

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
async function readTest262Pin() {
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
async function assertPinnedCheckout(pin) {
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
 * @returns {Promise<number>}
 */
export async function main() {
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
  const { records, summary } = await runTest262Suite({
    engine: { createRealm, evaluateScript },
    host: createNodeTest262Host({ root: pin.checkoutPath }),
    paths: upstreamSubsetPaths(subset),
    supportedFeatures,
  });
  const report = `${[
    ...formatReportLines(records),
    ...formatUpstreamSummaryLines(
      summarizeUpstreamRun({ subset, records, supportedFeatures }),
    ),
    formatRecordLine(summary),
  ].join('\n')}\n`;

  process.stdout.write(report);

  await writeFile(
    new URL(TEST262_REPORT_FILE, REPOSITORY_ROOT_URL),
    report,
    'utf8',
  );

  return summary.failed > 0 ? 1 : 0;
}

if (isDirectInvocation()) {
  main().then(
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
