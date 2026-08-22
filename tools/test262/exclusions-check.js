/**
 * Stale-exclusion check for the ES5 Test262 selection.
 *
 * Runs the engine against every per-file exclusion in `es5-selection.json` and
 * reports any non-host-dependent exclusion that now **passes** — meaning the
 * exclusion is stale and should be removed. Host-dependent exclusions remain
 * intentionally outside the ES5 selection even when the portable host can run
 * them successfully.
 *
 * **Scope:** every per-file `path` exclusion must exist in the pinned checkout
 * and is checked. A missing path is a policy error, never a skip. `prefix`
 * entries and whole excluded directories are out of scope — a prefix
 * legitimately covers files that do not exist yet, and directory exclusions are
 * structural policy, not per-file verdicts.
 *
 * **Unverifiable tests:** if a test cannot be run because of unsupported flags
 * or runner infrastructure, it is reported as unverifiable rather than counted
 * as evidence that the exclusion is still needed.
 *
 * Exit code: non-zero when any stale exclusion, unapproved unverifiable
 * result, or stale unverifiable approval is found.
 *
 * Usage: `node tools/test262/exclusions-check.js`
 */

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createNodeTest262Host } from './adapters/node.js';
import { createJsjsTest262Engine } from './engine.js';
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
export const EXCLUSIONS_UNVERIFIABLE_FILE =
  'tools/test262/exclusions-unverifiable.json';
const UNVERIFIABLE_FAILURE_REASONS = new Set([
  'engine-error',
  'load-error',
  'metadata-error',
  'harness-error',
]);

/**
 * @typedef {{
 *   path: string,
 *   diagnostics: readonly string[],
 *   reason: string,
 * }} UnverifiableApproval
 */

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
 *   diagnostics?: string[],
 * }} ExclusionCheckResult
 */

/**
 * Checks all per-file exclusions for staleness.
 *
 * @param {{
 *   pin: { repository: string, revision: string, checkoutPath: string },
 *   selectionText?: string,
 *   supportedFeatures: readonly string[],
 *   runFile?: typeof runTest262File,
 * }} options
 * @returns {Promise<ExclusionCheckResult[]>}
 */
export async function checkExclusions(options) {
  const { pin, supportedFeatures } = options;
  const runFile = options.runFile ?? runTest262File;

  await assertPinnedCheckout(pin);

  const policy = parseEs5Selection(
    options.selectionText ?? (await readRepositoryFile(ES5_SELECTION_FILE)),
  );
  const host = createNodeTest262Host({ root: pin.checkoutPath });
  const engine = createJsjsTest262Engine();

  /** @type {ExclusionCheckResult[]} */
  const results = [];

  for (const exclusion of policy.exclusions) {
    if (!exclusion.path) continue;

    /** @type {string} */
    let source;
    try {
      source = await host.readTest(exclusion.path);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${ES5_SELECTION_FILE} excludes ${exclusion.path}, but it cannot be read from the pinned Test262 checkout at ${pin.checkoutPath}: ${detail}\nUpdate ${ES5_SELECTION_FILE} to correct or remove the path.`,
      );
    }

    // Check if the test has unsupported flags (unverifiable)
    /** @type {import('./metadata.js').Test262Metadata} */
    let metadata;
    try {
      metadata = parseTest262Metadata(source);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      results.push({
        path: exclusion.path,
        category: exclusion.category,
        verdict: 'unverifiable',
        message: `metadata-error: ${detail}`,
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
    const records = await runFile({
      engine,
      host,
      file: exclusion.path,
      supportedFeatures,
    });

    const infrastructureFailures = records.filter(
      (record) =>
        record.reason !== undefined &&
        UNVERIFIABLE_FAILURE_REASONS.has(record.reason),
    );
    const nonPassingRecords = records.filter(
      (record) => record.status !== 'passed',
    );
    const allPassed = records.every((r) => r.status === 'passed');
    const allSkipped = records.every((r) => r.status === 'skipped');

    if (infrastructureFailures.length > 0) {
      const diagnostics = nonPassingRecords.map(recordDiagnostic);
      results.push({
        path: exclusion.path,
        category: exclusion.category,
        verdict: 'unverifiable',
        message: diagnostics.join('; '),
        diagnostics,
      });
    } else if (records.length === 0) {
      results.push({
        path: exclusion.path,
        category: exclusion.category,
        verdict: 'unverifiable',
        message: 'runner produced no test records',
      });
    } else if (allSkipped) {
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
        message: nonPassingRecords.map(recordDiagnostic).join('; '),
      });
    }
  }

  return results;
}

/**
 * @param {string} text
 * @returns {readonly Readonly<UnverifiableApproval>[]}
 */
export function parseUnverifiableAllowlist(text) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${EXCLUSIONS_UNVERIFIABLE_FILE} is invalid JSON: ${detail}`,
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(`${EXCLUSIONS_UNVERIFIABLE_FILE} must contain an object`);
  }
  assertExactKeys(
    parsed,
    ['entries', 'schemaVersion'],
    EXCLUSIONS_UNVERIFIABLE_FILE,
  );
  if (parsed.schemaVersion !== 2) {
    throw new Error(`${EXCLUSIONS_UNVERIFIABLE_FILE} schemaVersion must be 2`);
  }
  if (!Array.isArray(parsed.entries)) {
    throw new Error(`${EXCLUSIONS_UNVERIFIABLE_FILE} entries must be an array`);
  }

  const paths = new Set();
  const entries = parsed.entries.map((value, index) => {
    const location = `${EXCLUSIONS_UNVERIFIABLE_FILE} entries[${index}]`;
    if (!isRecord(value)) {
      throw new Error(`${location} must be an object`);
    }
    assertExactKeys(value, ['diagnostics', 'path', 'reason'], location);
    const path = requireNonEmptyString(value.path, `${location}.path`);
    const diagnostics = requireNonEmptyStringArray(
      value.diagnostics,
      `${location}.diagnostics`,
    );
    const reason = requireNonEmptyString(value.reason, `${location}.reason`);

    if (paths.has(path)) {
      throw new Error(
        `${EXCLUSIONS_UNVERIFIABLE_FILE} has duplicate path: ${path}`,
      );
    }
    paths.add(path);
    return Object.freeze({ path, diagnostics, reason });
  });

  return Object.freeze(entries);
}

/**
 * Applies the reviewed unverifiable policy without changing raw execution
 * verdicts. An approval matches only one exact path and one exact, ordered
 * diagnostic list. Any variant, reason, message, order, or count drift reopens
 * the whole result for review. An approval not consumed by a current
 * unverifiable result is stale.
 *
 * @param {readonly ExclusionCheckResult[]} results
 * @param {readonly UnverifiableApproval[]} approvals
 * @returns {{
 *   correctlyExcluded: ExclusionCheckResult[],
 *   staleExclusions: ExclusionCheckResult[],
 *   approvedUnverifiable: (ExclusionCheckResult & { reviewReason: string })[],
 *   unapprovedUnverifiable: ExclusionCheckResult[],
 *   staleApprovals: UnverifiableApproval[],
 *   exitCode: 0 | 1,
 * }}
 */
export function evaluateExclusionGate(results, approvals) {
  const approvalsByPath = new Map();
  for (const approval of approvals) {
    if (approvalsByPath.has(approval.path)) {
      throw new Error(
        `Unverifiable approvals duplicate path: ${approval.path}`,
      );
    }
    approvalsByPath.set(approval.path, approval);
  }

  const matchedApprovalPaths = new Set();
  const approvedUnverifiable = [];
  const unapprovedUnverifiable = [];

  for (const result of results) {
    if (result.verdict !== 'unverifiable') {
      continue;
    }

    const approval = approvalsByPath.get(result.path);
    const diagnostics =
      result.diagnostics ??
      (result.message === undefined ? [] : [result.message]);
    if (
      approval !== undefined &&
      diagnostics.length > 0 &&
      diagnostics.length === approval.diagnostics.length &&
      diagnostics.every(
        (diagnostic, index) => diagnostic === approval.diagnostics[index],
      )
    ) {
      matchedApprovalPaths.add(approval.path);
      approvedUnverifiable.push({
        ...result,
        reviewReason: approval.reason,
      });
    } else {
      unapprovedUnverifiable.push(result);
    }
  }

  const correctlyExcluded = results.filter(
    (result) =>
      result.verdict === 'failed' ||
      (result.verdict === 'passed' && result.category === 'host-dependent'),
  );
  const staleExclusions = results.filter(
    (result) =>
      result.verdict === 'passed' && result.category !== 'host-dependent',
  );
  const staleApprovals = approvals.filter(
    (approval) => !matchedApprovalPaths.has(approval.path),
  );
  const exitCode =
    staleExclusions.length > 0 ||
    unapprovedUnverifiable.length > 0 ||
    staleApprovals.length > 0
      ? 1
      : 0;

  return {
    correctlyExcluded,
    staleExclusions,
    approvedUnverifiable,
    unapprovedUnverifiable,
    staleApprovals,
    exitCode,
  };
}

/**
 * @param {import('./report.js').Test262TestRecord} record
 * @returns {string}
 */
function recordDiagnostic(record) {
  const variant = record.variant ?? 'unflagged';
  const reason = record.reason ?? record.status;
  return record.message === undefined
    ? `${variant}: ${reason}`
    : `${variant}: ${reason}: ${record.message}`;
}

/**
 * @param {readonly string[]} _argv
 * @returns {Promise<number>}
 */
export async function main(_argv = []) {
  const pin = await readTest262Pin();

  const supportedFeatures = featureNames(
    parseFeatureManifest(await readRepositoryFile(FEATURES_MANIFEST_FILE)),
  );

  const results = await checkExclusions({
    pin,
    supportedFeatures,
  });
  const approvals = parseUnverifiableAllowlist(
    await readRepositoryFile(EXCLUSIONS_UNVERIFIABLE_FILE),
  );
  const gate = evaluateExclusionGate(results, approvals);

  process.stdout.write(
    `Exclusion check: ${gate.correctlyExcluded.length} correctly excluded, ${gate.approvedUnverifiable.length} approved unverifiable, ${gate.unapprovedUnverifiable.length} unverifiable, ${gate.staleExclusions.length} stale\n`,
  );

  if (gate.unapprovedUnverifiable.length > 0) {
    process.stderr.write('\nUnapproved unverifiable exclusions:\n');
    for (const result of gate.unapprovedUnverifiable) {
      process.stderr.write(
        `  ${result.path} [${result.category}]: ${result.message ?? 'no diagnostic'}\n`,
      );
    }
  }

  if (gate.staleApprovals.length > 0) {
    process.stderr.write('\nStale unverifiable approvals:\n');
    for (const approval of gate.staleApprovals) {
      process.stderr.write(`  ${approval.path}: ${approval.reason}\n`);
    }
  }

  if (gate.staleExclusions.length > 0) {
    process.stderr.write('\nStale exclusions (tests now pass):\n');
    for (const r of gate.staleExclusions) {
      process.stderr.write(`  ${r.path} [${r.category}]\n`);
    }
    process.stderr.write(
      `\n${gate.staleExclusions.length} stale exclusion(s) found. Remove them from ${ES5_SELECTION_FILE}.\n`,
    );
  }

  return gate.exitCode;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {Record<string, unknown>} value
 * @param {readonly string[]} expected
 * @param {string} location
 * @returns {void}
 */
function assertExactKeys(value, expected, location) {
  const keys = Object.keys(value).sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${location} must contain exactly: ${expected.join(', ')}`);
  }
}

/**
 * @param {unknown} value
 * @param {string} location
 * @returns {string}
 */
function requireNonEmptyString(value, location) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${location} must be a non-empty string`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} location
 * @returns {readonly string[]}
 */
function requireNonEmptyStringArray(value, location) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => typeof entry !== 'string' || entry.trim() === '')
  ) {
    throw new Error(
      `${location} must be a non-empty array of non-empty strings`,
    );
  }

  return Object.freeze([...value]);
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
