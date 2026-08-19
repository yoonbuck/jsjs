/**
 * The pinned upstream Test262 subset.
 *
 * `upstream-subset.json` names the exact tests CI runs from a real `tc39/test262`
 * checkout. Two properties make it worth having as a checked-in file rather than
 * a glob:
 *
 * - It is *explicit*. A glob over the upstream tree would change meaning every
 *   time the pin moves, so a green run would say nothing about which tests
 *   actually ran. Every path here was verified to pass with this engine, so a
 *   new failure is a real regression rather than a newly-matched test.
 * - It is *pinned*. The subset records the same repository and revision as
 *   `package.json`, so running it against a different upstream tree is an error
 *   rather than a quietly different result.
 *
 * The subset is grouped only so the milestone report can say which parts of the
 * language the baseline covers; groups carry no execution semantics. Local
 * fixtures stay in `test/fixtures/test262` and are run by a separate command —
 * they exercise the *runner*, this exercises the *engine* against real upstream
 * tests.
 *
 * Like every other module under `tools/test262`, this one touches no filesystem
 * and no host API: it parses text and summarizes records, so it is importable
 * from any host and testable without a checkout.
 */

import { sortStrings } from './selection.js';

/** Repository-relative path to the subset manifest, for messages and callers. */
export const UPSTREAM_SUBSET_FILE = 'tools/test262/upstream-subset.json';

/** The only subset schema version this tooling understands. */
export const UPSTREAM_SUBSET_VERSION = 1;

const SUBSET_KEYS = Object.freeze([
  'version',
  'repository',
  'revision',
  'groups',
]);
const GROUP_KEYS = Object.freeze(['name', 'summary', 'paths']);
const REVISION_PATTERN = /^[0-9a-f]{40}$/;

/**
 * @typedef {{
 *   name: string,
 *   summary: string,
 *   paths: readonly string[],
 * }} Test262UpstreamGroup
 *
 * @typedef {{
 *   version: number,
 *   repository: string,
 *   revision: string,
 *   groups: readonly Test262UpstreamGroup[],
 * }} Test262UpstreamSubset
 *
 * @typedef {import('./report.js').Test262TestRecord} Test262TestRecord
 *
 * @typedef {{
 *   group: string,
 *   files: number,
 *   records: number,
 *   passed: number,
 *   failed: number,
 *   skipped: number,
 * }} Test262UpstreamGroupSummary
 *
 * @typedef {{
 *   groups: readonly Test262UpstreamGroupSummary[],
 *   features: {
 *     supported: readonly string[],
 *     tagged: readonly string[],
 *     untagged: number,
 *   },
 * }} Test262UpstreamSummary
 */

/**
 * Raised when the subset manifest is not a well-formed, deterministic selection:
 * an unreadable shape, an unknown key, an abbreviated revision, an empty or
 * duplicated group, an unsorted or duplicated path, or a path that does not name
 * an upstream test file.
 */
export class Test262UpstreamSubsetError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'Test262UpstreamSubsetError';
  }
}

/**
 * @param {{
 *   summary: { failed: number, skipped: number },
 *   coverage: {
 *     files: { selected: number, attempted: number, passed: number },
 *     records: { selected: number, attempted: number, passed: number },
 *   },
 * }} result
 * @returns {boolean}
 */
export function upstreamRunResultPasses(result) {
  /**
   * @param {{ selected: number, attempted: number, passed: number }} scope
   */
  const complete = (scope) =>
    scope.selected === scope.attempted && scope.attempted === scope.passed;

  return (
    result.summary.failed === 0 &&
    result.summary.skipped === 0 &&
    complete(result.coverage.files) &&
    complete(result.coverage.records)
  );
}

/**
 * @param {string} text
 * @returns {Test262UpstreamSubset}
 */
export function parseUpstreamSubset(text) {
  /** @type {unknown} */
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Test262UpstreamSubsetError(
      `${UPSTREAM_SUBSET_FILE} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Test262UpstreamSubsetError(
      `${UPSTREAM_SUBSET_FILE} must contain a JSON object`,
    );
  }

  const record = /** @type {Record<string, unknown>} */ (parsed);

  requireExactKeys(record, SUBSET_KEYS, UPSTREAM_SUBSET_FILE);

  if (record.version !== UPSTREAM_SUBSET_VERSION) {
    throw new Test262UpstreamSubsetError(
      `${UPSTREAM_SUBSET_FILE} must declare version ${UPSTREAM_SUBSET_VERSION}`,
    );
  }

  if (typeof record.repository !== 'string' || record.repository === '') {
    throw new Test262UpstreamSubsetError(
      `${UPSTREAM_SUBSET_FILE} must name the upstream repository`,
    );
  }

  if (
    typeof record.revision !== 'string' ||
    !REVISION_PATTERN.test(record.revision)
  ) {
    throw new Test262UpstreamSubsetError(
      `${UPSTREAM_SUBSET_FILE} must pin a full 40-character upstream revision`,
    );
  }

  if (!Array.isArray(record.groups) || record.groups.length === 0) {
    throw new Test262UpstreamSubsetError(
      `${UPSTREAM_SUBSET_FILE} must select at least one group of tests`,
    );
  }

  const groups = record.groups.map((group) => parseGroup(group));
  const names = groups.map((group) => group.name);

  if (new Set(names).size !== names.length) {
    throw new Test262UpstreamSubsetError(
      `${UPSTREAM_SUBSET_FILE} names a group more than once`,
    );
  }

  if (!isSorted(names)) {
    throw new Test262UpstreamSubsetError(
      `${UPSTREAM_SUBSET_FILE} must list groups sorted by name`,
    );
  }

  const paths = groups.flatMap((group) => [...group.paths]);

  if (new Set(paths).size !== paths.length) {
    throw new Test262UpstreamSubsetError(
      `${UPSTREAM_SUBSET_FILE} selects the same test in more than one group`,
    );
  }

  return Object.freeze({
    version: UPSTREAM_SUBSET_VERSION,
    repository: record.repository,
    revision: record.revision,
    groups: Object.freeze(groups),
  });
}

/**
 * @param {unknown} group
 * @returns {Test262UpstreamGroup}
 */
function parseGroup(group) {
  if (typeof group !== 'object' || group === null || Array.isArray(group)) {
    throw new Test262UpstreamSubsetError(
      `${UPSTREAM_SUBSET_FILE} groups must be objects`,
    );
  }

  const record = /** @type {Record<string, unknown>} */ (group);

  requireExactKeys(record, GROUP_KEYS, `${UPSTREAM_SUBSET_FILE} groups`);

  const { name, summary, paths } = record;

  if (typeof name !== 'string' || name === '') {
    throw new Test262UpstreamSubsetError(
      `${UPSTREAM_SUBSET_FILE} groups must have a non-empty name`,
    );
  }

  if (typeof summary !== 'string' || summary.trim() === '') {
    throw new Test262UpstreamSubsetError(
      `${UPSTREAM_SUBSET_FILE} group ${name} must say what it covers`,
    );
  }

  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Test262UpstreamSubsetError(
      `${UPSTREAM_SUBSET_FILE} group ${name} must select at least one test`,
    );
  }

  for (const path of paths) {
    if (
      typeof path !== 'string' ||
      !path.startsWith('test/') ||
      !path.endsWith('.js')
    ) {
      throw new Test262UpstreamSubsetError(
        `${UPSTREAM_SUBSET_FILE} group ${name} selects ${String(
          path,
        )}, which is not an upstream test path`,
      );
    }
  }

  const selected = /** @type {string[]} */ (paths);

  if (new Set(selected).size !== selected.length) {
    throw new Test262UpstreamSubsetError(
      `${UPSTREAM_SUBSET_FILE} group ${name} selects the same test twice`,
    );
  }

  if (!isSorted(selected)) {
    throw new Test262UpstreamSubsetError(
      `${UPSTREAM_SUBSET_FILE} group ${name} must list its tests sorted`,
    );
  }

  return Object.freeze({
    name,
    summary,
    paths: Object.freeze([...selected]),
  });
}

/**
 * @param {Record<string, unknown>} record
 * @param {readonly string[]} keys
 * @param {string} subject
 * @returns {void}
 */
function requireExactKeys(record, keys, subject) {
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) {
      throw new Test262UpstreamSubsetError(
        `${subject} carry an unknown key: ${key}`,
      );
    }
  }

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Test262UpstreamSubsetError(`${subject} must declare ${key}`);
    }
  }
}

/**
 * @param {readonly string[]} values
 * @returns {boolean}
 */
function isSorted(values) {
  return values.join('\u0000') === sortStrings([...values]).join('\u0000');
}

/**
 * Every path the subset selects, in the order the runner will report them.
 *
 * @param {Test262UpstreamSubset} subset
 * @returns {string[]}
 */
export function upstreamSubsetPaths(subset) {
  return sortStrings(subset.groups.flatMap((group) => [...group.paths]));
}

/**
 * Summarizes a completed upstream run per group, plus what the run can say
 * about optional features.
 *
 * The feature counts are deliberately modest, because an honest summary of an
 * untagged baseline is more useful than an invented one: `supported` is what the
 * feature manifest claims, `tagged` is the feature tags actually seen on the
 * tests that ran, and `untagged` counts the records that carried no tag at all.
 * With today's manifest empty and the baseline subset intentionally untagged,
 * this reports exactly that — no feature claims, no skips — instead of implying
 * per-feature progress the run never measured.
 *
 * @param {{
 *   subset: Test262UpstreamSubset,
 *   records: readonly Test262TestRecord[],
 *   supportedFeatures: readonly string[],
 * }} options
 * @returns {Test262UpstreamSummary}
 */
export function summarizeUpstreamRun(options) {
  const { subset, records, supportedFeatures } = options;
  /** @type {Map<string, string>} */
  const groupOfPath = new Map();

  for (const group of subset.groups) {
    for (const path of group.paths) {
      groupOfPath.set(path, group.name);
    }
  }

  /** @type {Map<string, Test262UpstreamGroupSummary>} */
  const summaries = new Map(
    subset.groups.map((group) => [
      group.name,
      {
        group: group.name,
        files: group.paths.length,
        records: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
      },
    ]),
  );
  /** @type {Set<string>} */
  const tagged = new Set();
  let untagged = 0;

  for (const record of records) {
    const groupName = groupOfPath.get(record.file);

    if (groupName === undefined) {
      throw new Test262UpstreamSubsetError(
        `${record.file} ran but is not selected by ${UPSTREAM_SUBSET_FILE}`,
      );
    }

    const summary = /** @type {Test262UpstreamGroupSummary} */ (
      summaries.get(groupName)
    );

    summary.records += 1;

    if (record.status === 'passed') {
      summary.passed += 1;
    } else if (record.status === 'failed') {
      summary.failed += 1;
    } else {
      summary.skipped += 1;
    }

    const features = record.features ?? [];

    if (features.length === 0) {
      untagged += 1;
    } else {
      for (const feature of features) {
        tagged.add(feature);
      }
    }
  }

  return Object.freeze({
    groups: Object.freeze(
      subset.groups.map((group) =>
        Object.freeze({
          .../** @type {Test262UpstreamGroupSummary} */ (
            summaries.get(group.name)
          ),
        }),
      ),
    ),
    features: Object.freeze({
      supported: Object.freeze(sortStrings(supportedFeatures)),
      tagged: Object.freeze(sortStrings([...tagged])),
      untagged,
    }),
  });
}

/**
 * Renders the summary as JSON lines, in the same fixed key order the rest of
 * the report uses, so two runs of the same inputs are byte-identical.
 *
 * @param {Test262UpstreamSummary} summary
 * @returns {string[]}
 */
export function formatUpstreamSummaryLines(summary) {
  return [
    ...summary.groups.map((group) =>
      JSON.stringify({
        type: 'baseline',
        group: group.group,
        files: group.files,
        records: group.records,
        passed: group.passed,
        failed: group.failed,
        skipped: group.skipped,
      }),
    ),
    JSON.stringify({
      type: 'features',
      supported: [...summary.features.supported],
      tagged: [...summary.features.tagged],
      untagged: summary.features.untagged,
    }),
  ];
}
