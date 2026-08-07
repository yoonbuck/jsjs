/**
 * Stale-exclusion check for the ES5 Test262 selection.
 *
 * Runs the engine against every per-file exclusion in `es5-selection.json` and
 * reports any that now **pass** — meaning the exclusion is stale and should be
 * removed.
 *
 * **Scope:** only per-file `path` exclusions whose file exists in the pinned
 * checkout are checked. `prefix` entries and whole excluded directories are out
 * of scope — a prefix legitimately covers files that do not exist yet, and
 * directory exclusions are structural policy, not per-file verdicts.
 *
 * **Unverifiable tests:** if a test cannot be run (e.g. it carries the `module`
 * flag), it is reported as unverifiable rather than silently skipped.
 *
 * Exit code: non-zero when any stale exclusion is found.
 *
 * Usage: `node tools/test262/exclusions-check.js`
 */

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRealm, evaluateScript } from '../../src/index.js';
import { createNodeTest262Host } from './adapters/node.js';
import { parseEs5Selection, ES5_SELECTION_FILE } from './es5-selection.js';
import { parseTest262Metadata } from './metadata.js';
import { runTest262File, UNSUPPORTED_FLAGS } from './runner.js';
import { readTest262Pin, assertPinnedCheckout } from './upstream-run.js';
import {
  FEATURES_MANIFEST_FILE,
  featureNames,
  parseFeatureManifest,
} from './features.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);

/**
 * @param {string} path Repository-relative.
 * @returns {Promise<string>}
 */
function readRepositoryFile(path) {
  return readFile(new URL(path, REPOSITORY_ROOT_URL), 'utf8');
}

/**
 * @typedef {{
 *   path: string,
 *   category: string,
 *   verdict: 'passed' | 'failed' | 'unverifiable',
 *   message?: string,
 * }} ExclusionCheckResult
 */

/**
 * Checks all per-file exclusions for staleness.
 *
 * @param {{
 *   checkoutPath: string,
 *   supportedFeatures: readonly string[],
 * }} options
 * @returns {Promise<ExclusionCheckResult[]>}
 */
export async function checkExclusions(options) {
  const { checkoutPath, supportedFeatures } = options;
  const policy = parseEs5Selection(
    await readRepositoryFile(ES5_SELECTION_FILE),
  );
  const host = createNodeTest262Host({ root: checkoutPath });
  const engine = { createRealm, evaluateScript };

  /** @type {ExclusionCheckResult[]} */
  const results = [];

  for (const exclusion of policy.exclusions) {
    if (!exclusion.path) continue;

    // Check if the file exists
    /** @type {string} */
    let source;
    try {
      source = await host.readTest(exclusion.path);
    } catch {
      // File does not exist in the pinned checkout — skip silently
      continue;
    }

    // Check if the test has unsupported flags (unverifiable)
    /** @type {import('./metadata.js').Test262Metadata} */
    let metadata;
    try {
      metadata = parseTest262Metadata(source);
    } catch {
      results.push({
        path: exclusion.path,
        category: exclusion.category,
        verdict: 'unverifiable',
        message: 'cannot parse metadata',
      });
      continue;
    }

    const unsupportedFlag = metadata.flags.find((f) =>
      UNSUPPORTED_FLAGS.includes(f),
    );
    if (unsupportedFlag) {
      results.push({
        path: exclusion.path,
        category: exclusion.category,
        verdict: 'unverifiable',
        message: `unsupported flag: ${unsupportedFlag}`,
      });
      continue;
    }

    // Run the test
    const records = await runTest262File({
      engine,
      host,
      file: exclusion.path,
      supportedFeatures,
    });

    const allPassed = records.every((r) => r.status === 'passed');
    const allSkipped = records.every((r) => r.status === 'skipped');

    if (allSkipped) {
      results.push({
        path: exclusion.path,
        category: exclusion.category,
        verdict: 'unverifiable',
        message: records[0]?.message ?? 'skipped',
      });
    } else if (allPassed) {
      results.push({
        path: exclusion.path,
        category: exclusion.category,
        verdict: 'passed',
      });
    } else {
      results.push({
        path: exclusion.path,
        category: exclusion.category,
        verdict: 'failed',
      });
    }
  }

  return results;
}

/**
 * @param {readonly string[]} _argv
 * @returns {Promise<number>}
 */
export async function main(_argv = []) {
  const pin = await readTest262Pin();
  await assertPinnedCheckout(pin);

  const supportedFeatures = featureNames(
    parseFeatureManifest(await readRepositoryFile(FEATURES_MANIFEST_FILE)),
  );

  const results = await checkExclusions({
    checkoutPath: pin.checkoutPath,
    supportedFeatures,
  });

  const passed = results.filter((r) => r.verdict === 'passed');
  const failed = results.filter((r) => r.verdict === 'failed');
  const unverifiable = results.filter((r) => r.verdict === 'unverifiable');

  process.stdout.write(
    `Exclusion check: ${failed.length} correctly excluded, ${unverifiable.length} unverifiable, ${passed.length} stale\n`,
  );

  if (passed.length > 0) {
    process.stderr.write('\nStale exclusions (tests now pass):\n');
    for (const r of passed) {
      process.stderr.write(`  ${r.path} [${r.category}]\n`);
    }
    process.stderr.write(
      `\n${passed.length} stale exclusion(s) found. Remove them from ${ES5_SELECTION_FILE}.\n`,
    );
  }

  return passed.length > 0 ? 1 : 0;
}

// Entry point when run directly

/**
 * @returns {boolean}
 */
function isDirectInvocation() {
  const entry = process.argv[1];
  return (
    typeof entry === 'string' && pathToFileURL(entry).href === import.meta.url
  );
}

if (isDirectInvocation()) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
