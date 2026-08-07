/**
 * Whole-suite Test262 coverage.
 *
 * A conformance number is only meaningful next to its denominator. The curated
 * subset in `upstream-subset.json` says what this engine runs; this module says
 * how much of the *pinned tree* that is, in the two units Test262 is counted in:
 *
 * - **Files** — every `test/**\/*.js` file in the tree except `_FIXTURE.js`
 *   support files, which upstream's `INTERPRETING.md` defines as inputs to other
 *   tests rather than tests themselves.
 * - **(file, variant) records** — what those files expand into once the
 *   strict/non-strict/raw rules are applied, which is the unit the runner
 *   reports and therefore the unit a pass rate has to be quoted in.
 *
 * The expansion reads frontmatter and nothing else: no unselected test is ever
 * executed, so the denominator costs one pass over the tree rather than a full
 * conformance run of a suite this engine cannot yet survive.
 *
 * Two rules keep the number honest. A file whose frontmatter this tooling cannot
 * parse still counts as a file, but expands into no records and is reported
 * separately — quietly dropping it would shrink the denominator and inflate the
 * percentage. A file that cannot be *read* is an error rather than a zero: a
 * truncated tree must fail loudly instead of reporting better coverage of a
 * smaller suite.
 *
 * Like the rest of `tools/test262/`, this module touches no host API. File
 * access arrives through the injected `Test262Host`, so the same code covers the
 * fixture tree in any runtime and the pinned upstream checkout in Node.
 */

import {
  Test262MetadataError,
  expandVariants,
  parseTest262Metadata,
} from './metadata.js';
import { sortTestPaths } from './selection.js';

/**
 * The file whose generated block carries the compact coverage summary.
 * Defined here — not in `tools/ci/pipeline.js` — so portable suites can
 * import the constant without pulling in Node builtins.
 */
export const COVERAGE_DOCUMENT_FILE = 'docs/conformance.md';

/** Markers delimiting the generated block in the coverage document. */
export const COVERAGE_MARKER_BEGIN = '<!-- test262-coverage:begin -->';
export const COVERAGE_MARKER_END = '<!-- test262-coverage:end -->';

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

/**
 * Upstream marks support files a test imports — never runs on their own — with
 * this suffix. Counting them as tests would inflate the denominator with files
 * no engine is expected to pass.
 */
export const NON_TEST_SUFFIX = '_FIXTURE.js';

/** The upstream directory that holds tests; everything else is tooling. */
export const TEST_ROOT_PREFIX = 'test/';

/** Decimal places every reported percentage is rounded to. */
export const PERCENT_PRECISION = 3;

/**
 * @typedef {import('./runner.js').Test262Host} Test262Host
 * @typedef {import('./report.js').Test262TestRecord} Test262TestRecord
 *
 * @typedef {{
 *   files: readonly string[],
 *   malformed: readonly string[],
 *   variants: ReadonlyMap<string, number>,
 *   totals: { files: number, records: number, malformed: number },
 * }} Test262Inventory
 *
 * @typedef {{
 *   total: number,
 *   selected: number,
 *   attempted: number,
 *   passed: number,
 *   selectedPercent: number,
 *   attemptedPercent: number,
 *   passedPercent: number,
 * }} Test262CoverageScope
 *
 * @typedef {{
 *   files: Test262CoverageScope & { malformed: number },
 *   records: Test262CoverageScope,
 * }} Test262Coverage
 */

/**
 * Raised when the tree cannot be inventoried: a host that cannot list it, or a
 * file that cannot be read.
 */
export class Test262CoverageError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'Test262CoverageError';
  }
}

/**
 * Whether a listed path is one of the suite's own tests.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isTest262TestPath(path) {
  return (
    typeof path === 'string' &&
    path.startsWith(TEST_ROOT_PREFIX) &&
    path.endsWith('.js') &&
    !path.endsWith(NON_TEST_SUFFIX)
  );
}

/**
 * Reads every test's frontmatter and expands it into a record count.
 *
 * Explicit `paths` win over a listing, the same precedence `selection.js`
 * applies, so a caller can inventory exactly the files it names — including the
 * deliberately broken ones a fixture tree keeps outside its test directory.
 *
 * @param {{ host: Test262Host, paths?: readonly string[] }} options
 * @returns {Promise<Test262Inventory>}
 */
export async function collectTest262Inventory(options) {
  const { host } = options;
  const paths = sortTestPaths(
    options.paths ?? (await listTest262TestPaths(host)),
  );
  /** @type {Map<string, number>} */
  const variants = new Map();
  /** @type {string[]} */
  const malformed = [];
  let records = 0;

  for (const file of paths) {
    /** @type {string} */
    let source;

    try {
      source = await host.readTest(file);
    } catch (error) {
      throw new Test262CoverageError(
        `cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    /** @type {number} */
    let count;

    try {
      count = expandVariants(parseTest262Metadata(source)).length;
    } catch (error) {
      if (error instanceof Test262MetadataError) {
        malformed.push(file);
        continue;
      }

      throw error;
    }

    variants.set(file, count);
    records += count;
  }

  return Object.freeze({
    files: Object.freeze([...paths]),
    malformed: Object.freeze(malformed),
    variants: variants,
    totals: Object.freeze({
      files: paths.length,
      records,
      malformed: malformed.length,
    }),
  });
}

/**
 * @param {Test262Host} host
 * @returns {Promise<string[]>}
 */
async function listTest262TestPaths(host) {
  if (typeof host.listTests !== 'function') {
    throw new Test262CoverageError(
      'this host cannot list the tree, so the whole-suite denominator is unknown',
    );
  }

  return [...(await host.listTests())].filter((path) =>
    isTest262TestPath(path),
  );
}

/**
 * Measures a finished run against the inventory.
 *
 * The three counts answer three different questions, and collapsing them would
 * lose the distinction that matters: `selected` is what the subset asks for,
 * `attempted` is what actually executed (a skipped test is selected but never
 * attempted), and `passed` is what conformance can be claimed for. A file counts
 * as passed only when every one of its records passed.
 *
 * @param {{
 *   inventory: Test262Inventory,
 *   records: readonly Test262TestRecord[],
 *   selected?: readonly string[],
 * }} options
 * @returns {Test262Coverage}
 */
export function summarizeTest262Coverage(options) {
  const { inventory, records } = options;
  const selected = sortTestPaths([
    ...new Set(options.selected ?? records.map((record) => record.file)),
  ]);
  /** @type {Map<string, { total: number, attempted: number, passed: number }>} */
  const byFile = new Map();
  let attemptedRecords = 0;
  let passedRecords = 0;

  for (const record of records) {
    const counts = byFile.get(record.file) ?? {
      total: 0,
      attempted: 0,
      passed: 0,
    };

    counts.total += 1;

    if (record.status !== 'skipped') {
      counts.attempted += 1;
      attemptedRecords += 1;
    }

    if (record.status === 'passed') {
      counts.passed += 1;
      passedRecords += 1;
    }

    byFile.set(record.file, counts);
  }

  let attemptedFiles = 0;
  let passedFiles = 0;

  for (const counts of byFile.values()) {
    if (counts.attempted > 0) {
      attemptedFiles += 1;
    }

    if (counts.passed === counts.total) {
      passedFiles += 1;
    }
  }

  const selectedRecords = selected.reduce(
    (total, file) => total + (inventory.variants.get(file) ?? 0),
    0,
  );

  return Object.freeze({
    files: Object.freeze({
      ...scope(
        inventory.totals.files,
        selected.length,
        attemptedFiles,
        passedFiles,
      ),
      malformed: inventory.totals.malformed,
    }),
    records: Object.freeze(
      scope(
        inventory.totals.records,
        selectedRecords,
        attemptedRecords,
        passedRecords,
      ),
    ),
  });
}

/**
 * @param {number} total
 * @param {number} selected
 * @param {number} attempted
 * @param {number} passed
 * @returns {Test262CoverageScope}
 */
function scope(total, selected, attempted, passed) {
  return {
    total,
    selected,
    attempted,
    passed,
    selectedPercent: percentageOf(selected, total),
    attemptedPercent: percentageOf(attempted, total),
    passedPercent: percentageOf(passed, total),
  };
}

/**
 * Rounds to a fixed precision so two runs of the same inputs serialize
 * identically; an empty tree reports zero rather than `NaN`.
 *
 * @param {number} part
 * @param {number} total
 * @returns {number}
 */
export function percentageOf(part, total) {
  if (total === 0) {
    return 0;
  }

  return Number(((part / total) * 100).toFixed(PERCENT_PRECISION));
}

/**
 * Renders the coverage records, in the same fixed key order the rest of the
 * report uses.
 *
 * @param {Test262Coverage} coverage
 * @returns {string[]}
 */
export function formatCoverageLines(coverage) {
  return [
    JSON.stringify({
      type: 'inventory',
      files: coverage.files.total,
      records: coverage.records.total,
      malformed: coverage.files.malformed,
    }),
    formatScopeLine('files', coverage.files),
    formatScopeLine('records', coverage.records),
  ];
}

/**
 * @param {string} name
 * @param {Test262CoverageScope} values
 * @returns {string}
 */
function formatScopeLine(name, values) {
  return JSON.stringify({
    type: 'coverage',
    scope: name,
    total: values.total,
    selected: values.selected,
    attempted: values.attempted,
    passed: values.passed,
    selectedPercent: values.selectedPercent,
    attemptedPercent: values.attemptedPercent,
    passedPercent: values.passedPercent,
  });
}

/**
 * Renders the compact Markdown summary the coverage document carries, in place
 * of the per-test records that now live in the detailed report.
 *
 * @param {{ coverage: Test262Coverage, reportPath: string, reportLinkPath?: string }} options
 * @returns {string}
 */
export function renderCoverageSummary(options) {
  const { coverage, reportPath } = options;
  const reportLinkPath = options.reportLinkPath ?? reportPath;

  return [
    ...renderTable([
      [
        'Denominator',
        'Whole suite',
        'Selected',
        'Attempted',
        'Passed',
        'Passing',
      ],
      ['Files', ...scopeCells(coverage.files)],
      ['(file, variant)', ...scopeCells(coverage.records)],
    ]),
    '',
    `${formatCount(coverage.files.malformed)} of the ${formatCount(
      coverage.files.total,
    )} files carry frontmatter this tooling cannot parse; they count as files and expand into no (file, variant) records.`,
    `Full per-test records: [${reportPath}](${reportLinkPath}).`,
  ].join('\n');
}

/**
 * @param {Test262CoverageScope} values
 * @returns {string[]}
 */
function scopeCells(values) {
  return [
    formatCount(values.total),
    formatCount(values.selected),
    formatCount(values.attempted),
    formatCount(values.passed),
    `${values.passedPercent}%`,
  ];
}

/**
 * Pads cells the way Prettier formats a Markdown table, so a generated block
 * survives `npm run format` unchanged.
 *
 * @param {readonly (readonly string[])[]} rows
 * @returns {string[]}
 */
function renderTable(rows) {
  const [header, ...body] = rows;
  const widths = header.map((_, column) =>
    Math.max(3, ...rows.map((row) => row[column].length)),
  );
  /**
   * @param {readonly string[]} row
   * @returns {string}
   */
  const line = (row) =>
    `| ${row.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`;

  return [
    line(header),
    `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`,
    ...body.map((row) => line(row)),
  ];
}

/**
 * Groups thousands with commas, by hand: `toLocaleString` is locale-dependent,
 * and a generated file cannot depend on the host's locale.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatCount(value) {
  const digits = String(value);
  /** @type {string[]} */
  const groups = [];

  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  }

  return groups.join(',');
}
