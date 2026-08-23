import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNodeTest262Host } from './adapters/node.js';
import { createJsjsTest262Engine } from './engine.js';
import {
  mergePromotionSubset,
  parseEs2015Promotion,
  promotionPaths,
} from './es2015-promotion.js';
import { parseEs5Selection, serializeUpstreamSubset } from './es5-selection.js';
import { featureNames, parseFeatureManifest } from './features.js';
import { readTest262HarnessDefinitions } from './harness-definitions.js';
import {
  formatCoverageLines,
  renderCoverageSummary,
  replaceGeneratedBlock,
  summarizeTest262Coverage,
} from './coverage.js';
import {
  createSummaryRecord,
  createTestRecord,
  formatRecordLine,
  formatReportLines,
} from './report.js';
import { runTest262Suite } from './runner.js';
import { assertPinnedCheckout, readTest262Pin } from './pin.js';
import {
  buildEs2015Inventory,
  summarizeEs2015Classification,
} from './es2015-taxonomy.js';
import {
  formatUpstreamSummaryLines,
  parseUpstreamSubset,
  summarizeUpstreamRun,
  upstreamSubsetPaths,
} from './upstream.js';

export const M1_PROMOTION_GROUP = 'es2015/m1-reflect';

export const M1 = Object.freeze({
  roots: 113,
  variants: 226,
  sha256: '65529ed8f9bdf88576314e95f4f164ac2c613e9ec44f0aae042a79aa5f8706b4',
});

export const M1_PROXY_PATHS = Object.freeze([
  'test/built-ins/Reflect/defineProperty/return-abrupt-from-result.js',
  'test/built-ins/Reflect/deleteProperty/return-abrupt-from-result.js',
  'test/built-ins/Reflect/getOwnPropertyDescriptor/return-abrupt-from-result.js',
  'test/built-ins/Reflect/getPrototypeOf/return-abrupt-from-result.js',
  'test/built-ins/Reflect/has/return-abrupt-from-result.js',
  'test/built-ins/Reflect/isExtensible/return-abrupt-from-result.js',
  'test/built-ins/Reflect/ownKeys/return-abrupt-from-result.js',
  'test/built-ins/Reflect/preventExtensions/return-abrupt-from-result.js',
  'test/built-ins/Reflect/preventExtensions/return-boolean-from-proxy-object.js',
  'test/built-ins/Reflect/setPrototypeOf/return-abrupt-from-result.js',
]);

export const M1_CONSTRUCTOR_INCLUDE_PATHS = Object.freeze([
  'test/built-ins/Reflect/apply/not-a-constructor.js',
  'test/built-ins/Reflect/construct/not-a-constructor.js',
  'test/built-ins/Reflect/defineProperty/not-a-constructor.js',
  'test/built-ins/Reflect/deleteProperty/not-a-constructor.js',
  'test/built-ins/Reflect/get/not-a-constructor.js',
  'test/built-ins/Reflect/getOwnPropertyDescriptor/not-a-constructor.js',
  'test/built-ins/Reflect/getPrototypeOf/not-a-constructor.js',
  'test/built-ins/Reflect/has/not-a-constructor.js',
  'test/built-ins/Reflect/isExtensible/not-a-constructor.js',
  'test/built-ins/Reflect/preventExtensions/not-a-constructor.js',
  'test/built-ins/Reflect/set/not-a-constructor.js',
  'test/built-ins/Reflect/setPrototypeOf/not-a-constructor.js',
]);

export const M1_STALE_EXCLUSION_PATHS = Object.freeze([
  'test/built-ins/Object/internals/DefineOwnProperty/consistent-value-function-arguments.js',
  'test/built-ins/Object/internals/DefineOwnProperty/consistent-value-function-caller.js',
  'test/built-ins/Object/internals/DefineOwnProperty/consistent-value-regexp-dollar1.js',
  'test/built-ins/Object/internals/DefineOwnProperty/consistent-writable-regexp-dollar1.js',
  'test/staging/sm/Array/unshift-with-enumeration.js',
  'test/staging/sm/object/bug-1206700.js',
  'test/staging/sm/strict/primitive-assignment.js',
]);

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const M1_SCRATCH_ROOT = '.superpowers/issue-80/m1';
const TAXONOMY_FILE = 'tools/test262/es2015-taxonomy.json';
const AUDIT_EVIDENCE_FILE = 'tools/test262/es2015-audit-evidence.json';
const SUBSET_FILE = 'tools/test262/upstream-subset.json';
const SELECTION_FILE = 'tools/test262/es5-selection.json';
const REPORT_FILE = 'docs/test262-report.jsonl';
const CONFORMANCE_FILE = 'docs/conformance.md';
const FEATURES_FILE = 'tools/test262/features.json';
const PROVENANCE_FILE = 'tools/test262/es2015-provenance.json';
const M1_BASELINE_FILE = 'tools/test262/es2015-m1-baseline.json';
const M1_DISPOSITION_FILE = 'tools/test262/es2015-m1-disposition.json';
const M1_SELECTION_BASE_SHA256 =
  '533e0b9fc165a026d64c4e64d783cf2585de7236600acacf228f06d27f23d8c8';
const M1_SELECTION_HEAD_SHA256 =
  '78ac694beb258be0b67c7788137c736b0b30cf7457e3a903d364d38c038b48df';

/**
 * @typedef {{
 *   path: string,
 *   variants: number,
 *   partition: string,
 *   status: string,
 *   blocker: string | null,
 *   features: readonly string[],
 *   flags: readonly string[],
 *   includes: readonly string[],
 *   provenance: readonly string[],
 * }} M1Classification
 * @typedef {import('./report.js').Test262TestRecord} M1ExecutionRecord
 * @typedef {{
 *   version: 1,
 *   ledger: { roots: number, variants: number, sha256: string },
 *   records: readonly M1ExecutionRecord[],
 * }} M1Execution
 * @typedef {{
 *   buildScratch: boolean,
 *   ledger: string,
 *   execution: string | null,
 *   output: string,
 * }} M1CliOptions
 */

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function parseM1Ledger(text) {
  const paths = text.endsWith('\n')
    ? text.slice(0, -1).split('\n')
    : text.split('\n');
  if (
    paths.length === 0 ||
    paths.some((path) => !/^test\/built-ins\/Reflect\/.+\.js$/u.test(path)) ||
    paths.join('\u0000') !== [...paths].sort().join('\u0000') ||
    new Set(paths).size !== paths.length
  ) {
    throw new Error('M1 ledger must contain sorted unique Reflect roots');
  }
  return paths;
}

/**
 * @param {string} selectionText
 * @returns {{ baseText: string, headText: string }}
 */
export function projectM1Selection(selectionText) {
  if (sha256(selectionText) !== M1_SELECTION_BASE_SHA256) {
    throw new Error('M1 selection projection requires the exact BASE bytes');
  }
  const base = parseEs5Selection(selectionText);
  let headText = selectionText;
  for (const sourcePath of M1_STALE_EXCLUSION_PATHS) {
    const matches = base.exclusions.filter(
      (entry) => entry.path === sourcePath,
    );
    if (matches.length !== 1) {
      throw new Error(
        `M1 selection projection lacks exact exclusion: ${sourcePath}`,
      );
    }
    const block = `${JSON.stringify(matches[0], null, 2)
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n')},\n`;
    if (headText.split(block).length !== 2) {
      throw new Error(
        `M1 selection projection cannot preserve exact bytes: ${sourcePath}`,
      );
    }
    headText = headText.replace(block, '');
  }
  const head = parseEs5Selection(headText);
  const expectedExclusions = base.exclusions.filter(
    (entry) =>
      entry.path === undefined ||
      !M1_STALE_EXCLUSION_PATHS.includes(entry.path),
  );
  if (
    JSON.stringify(head.exclusions) !== JSON.stringify(expectedExclusions) ||
    sha256(headText) !== M1_SELECTION_HEAD_SHA256
  ) {
    throw new Error('M1 selection projection produced unexpected HEAD bytes');
  }
  return { baseText: selectionText, headText };
}

/**
 * @param {{
 *   ledgerText: string,
 *   taxonomyText: string,
 *   execution: any,
 *   inventory: readonly any[],
 *   disposition?: any,
 * }} options
 */
export function buildM1AuthorityEvidence(options) {
  const taxonomy =
    /** @type {{ pin: { repository: string, revision: string }, classifications: M1Classification[] }} */ (
      JSON.parse(options.taxonomyText)
    );
  const paths = verifyM1Ledger(options.ledgerText, taxonomy);
  const byPath = new Map(
    taxonomy.classifications.map((entry) => [entry.path, entry]),
  );
  const inventoryByPath = new Map(
    options.inventory.map((entry) => [entry.path, entry]),
  );
  if (inventoryByPath.size !== options.inventory.length) {
    throw new Error('M1 pinned inventory repeats a root');
  }
  const baseline = paths.map((sourcePath) => {
    const entry = byPath.get(sourcePath);
    if (entry === undefined) {
      throw new Error(`M1 taxonomy lacks reviewed root: ${sourcePath}`);
    }
    return entry;
  });
  const executionByPath = validateM1Execution(options.execution, baseline);
  const destinations = paths.map((sourcePath) => {
    const records = executionByPath.get(sourcePath) ?? [];
    return m1Destination(
      sourcePath,
      records.every((record) => record.status === 'passed'),
    );
  });
  const disposition = { destinations };
  if (
    options.disposition !== undefined &&
    JSON.stringify(options.disposition) !== JSON.stringify(disposition)
  ) {
    throw new Error('M1 disposition does not match the reviewed outcome');
  }
  const promoted = destinations
    .filter((destination) => destination.status === 'selected-passing')
    .map((destination) => destination.path);
  const promotedSet = new Set(promoted);
  const ownerDeltas = destinations.filter(
    (destination) => !promotedSet.has(destination.path),
  );
  const ownerMap = uniqueM1Destinations(
    ownerDeltas.map(({ status, blocker, issue }) => ({
      status: status.startsWith('blocked:') ? 'blocked' : status,
      blocker,
      issue,
    })),
  );
  const entries = promoted.map((sourcePath) => {
    const entry = byPath.get(sourcePath);
    if (entry === undefined) {
      throw new Error(`M1 promotion lacks taxonomy root: ${sourcePath}`);
    }
    const inventoryRoot = inventoryByPath.get(sourcePath);
    if (
      inventoryRoot === undefined ||
      inventoryRoot.metadata === null ||
      !sameStrings(inventoryRoot.metadata.features, entry.features) ||
      !sameStrings(inventoryRoot.metadata.includes, entry.includes)
    ) {
      throw new Error(`M1 pinned inventory drift: ${sourcePath}`);
    }
    return {
      path: sourcePath,
      variants: entry.variants,
      features: [...inventoryRoot.metadata.features],
      includeFeatures: [...inventoryRoot.includeFeatures],
    };
  });
  const promotedPathsText =
    promoted.length === 0 ? '' : `${promoted.join('\n')}\n`;
  const promotion = {
    groupName: M1_PROMOTION_GROUP,
    version: 2,
    repository: taxonomy.pin.repository,
    revision: taxonomy.pin.revision,
    sourceTaxonomySha256: sha256(options.taxonomyText),
    ledgerSha256: sha256(promotedPathsText),
    rootCount: entries.length,
    variantCount: entries.reduce((total, entry) => total + entry.variants, 0),
    entries,
  };
  parseEs2015Promotion(JSON.stringify(promotion));
  return {
    paths,
    baseline,
    disposition,
    ownerDeltas,
    ownerMap,
    promotion,
  };
}

/**
 * @param {{
 *   baseTaxonomyText: string,
 *   evidenceTexts: Record<string, string>,
 *   baseOutputs: Record<string, string>,
 *   projectedOutputs: Record<string, string>,
 * }} options
 */
export function buildM1PendingAuthority(options) {
  const evidencePaths = [
    'tools/test262/es2015-m1-baseline.json',
    'tools/test262/es2015-m1-disposition.json',
    'tools/test262/es2015-m1-owner-deltas.json',
    'tools/test262/es2015-m1-owner-map.json',
    'tools/test262/es2015-m1-paths.json',
    'tools/test262/es2015-m1-promotion.json',
  ];
  const projectedPaths = [
    'docs/conformance.md',
    'docs/test262-report.jsonl',
    'tools/test262/es2015-audit-evidence.json',
    'tools/test262/es2015-taxonomy.json',
    'tools/test262/es5-selection.json',
    'tools/test262/upstream-subset.json',
  ];
  requireExactTextPaths(
    options.evidenceTexts,
    evidencePaths,
    'M1 evidence texts',
  );
  requireExactTextPaths(
    options.baseOutputs,
    projectedPaths,
    'M1 BASE protected outputs',
  );
  requireExactTextPaths(
    options.projectedOutputs,
    projectedPaths,
    'M1 projected protected outputs',
  );
  if (
    options.baseOutputs['tools/test262/es2015-taxonomy.json'] !==
    options.baseTaxonomyText
  ) {
    throw new Error('M1 authority BASE taxonomy bytes are inconsistent');
  }
  const selection = projectM1Selection(
    options.baseOutputs['tools/test262/es5-selection.json'],
  );
  if (
    selection.headText !==
    options.projectedOutputs['tools/test262/es5-selection.json']
  ) {
    throw new Error('M1 authority selection projection is inconsistent');
  }

  const evidence = evidencePaths.map((path) => ({
    path,
    sha256: sha256(options.evidenceTexts[path]),
  }));
  const promotionSha256 = sha256(
    options.evidenceTexts['tools/test262/es2015-m1-promotion.json'],
  );
  const ownerDeltasSha256 = sha256(
    options.evidenceTexts['tools/test262/es2015-m1-owner-deltas.json'],
  );
  const protectedOutputs = [
    ...projectedPaths.map((path) => {
      const baseSha256 = sha256(options.baseOutputs[path]);
      const headSha256 = sha256(options.projectedOutputs[path]);
      if (
        path === 'tools/test262/es2015-audit-evidence.json' ||
        path === 'tools/test262/es5-selection.json'
      ) {
        if (baseSha256 === headSha256) {
          if (path === 'tools/test262/es2015-audit-evidence.json') {
            throw new Error('M1 audit projection must replace nonempty bytes');
          }
          throw new Error('M1 selection projection must replace exact bytes');
        }
        return {
          path,
          operation: 'replace-exact',
          baseSha256,
          headSha256,
          projectionSha256: null,
        };
      }
      if (baseSha256 === headSha256) {
        throw new Error(`M1 protected projection is empty: ${path}`);
      }
      return {
        path,
        operation: 'project',
        baseSha256,
        headSha256: null,
        projectionSha256: sha256(
          `${path}\u0000${M1.sha256}\u0000${promotionSha256}\u0000${ownerDeltasSha256}\u0000`,
        ),
      };
    }),
    ...evidence.map((entry) => ({
      path: entry.path,
      operation: 'add-exact',
      baseSha256: null,
      headSha256: entry.sha256,
      projectionSha256: null,
    })),
  ].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  return {
    code: 'M1',
    issue: 80,
    parentIssue: 70,
    state: 'pending',
    source: {
      baseTaxonomySha256: sha256(options.baseTaxonomyText),
      rootCount: M1.roots,
      variantCount: M1.variants,
      pathSha256: M1.sha256,
      entryLedgerSha256: null,
    },
    reconciliation: null,
    evidence,
    protectedOutputs,
    destinations: [
      {
        status: 'blocked',
        blocker: 'proxy-and-reflect-metaobject',
        issue: 81,
      },
      {
        status: 'selected-passing',
        blocker: null,
        issue: 80,
      },
    ],
  };
}

/**
 * @param {{
 *   taxonomyText: string,
 *   auditEvidenceText: string,
 *   subsetText: string,
 *   reportText: string,
 *   conformanceText: string,
 *   featuresText: string,
 *   evidence: ReturnType<typeof buildM1AuthorityEvidence>,
 *   execution: any,
 *   inventory: readonly any[],
 * }} options
 */
export function projectM1CoreOutputs(options) {
  const expectedEvidence = buildM1AuthorityEvidence({
    ledgerText: `${options.evidence.paths.join('\n')}\n`,
    taxonomyText: options.taxonomyText,
    execution: options.execution,
    inventory: options.inventory,
  });
  if (JSON.stringify(options.evidence) !== JSON.stringify(expectedEvidence)) {
    throw new Error('M1 projection requires exact authority evidence');
  }
  const executionByPath = validateM1Execution(
    options.execution,
    options.evidence.baseline,
  );
  /** @type {Map<string, M1ExecutionRecord>} */
  const executionByKey = new Map();
  for (const records of executionByPath.values()) {
    for (const record of records) {
      executionByKey.set(
        `${record.file}\u0000${record.variant ?? ''}`,
        createTestRecord({
          file: record.file,
          variant: record.variant,
          status: record.status,
        }),
      );
    }
  }
  const baseAudit =
    /** @type {{ version: number, repository: string, revision: string, auditRecords: M1ExecutionRecord[], blockers: Record<string, string>, intentionalDeviations: readonly string[] }} */ (
      JSON.parse(options.auditEvidenceText)
    );
  const consumedExecution = new Set();
  const auditRecords = baseAudit.auditRecords.map((record) => {
    const key = `${record.file}\u0000${record.variant ?? ''}`;
    const execution = executionByKey.get(key);
    if (execution === undefined) return record;
    consumedExecution.add(key);
    return execution;
  });
  if (consumedExecution.size !== M1.variants) {
    throw new Error('M1 audit projection lacks exact BASE audit variants');
  }
  const blockerEntries = new Map(Object.entries(baseAudit.blockers));
  for (const destination of options.evidence.disposition.destinations) {
    if (destination.status === 'selected-passing') {
      blockerEntries.delete(destination.path);
    } else {
      if (destination.blocker === null) {
        throw new Error(
          `M1 blocked destination lacks a blocker: ${destination.path}`,
        );
      }
      blockerEntries.set(destination.path, destination.blocker);
    }
  }
  const blockers = Object.fromEntries(
    [...blockerEntries].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
  const auditEvidenceText = renderM1Json({
    version: baseAudit.version,
    repository: baseAudit.repository,
    revision: baseAudit.revision,
    auditRecords,
    blockers,
    intentionalDeviations: baseAudit.intentionalDeviations,
  });

  const promotionText = renderM1Json(options.evidence.promotion);
  const promotion = parseEs2015Promotion(promotionText);
  const subsetText = serializeUpstreamSubset(
    mergePromotionSubset(parseUpstreamSubset(options.subsetText), promotion),
  );
  const baseTaxonomy =
    /** @type {Record<string, any> & { inputs: Record<string, string>, classifications: M1Classification[] }} */ (
      JSON.parse(options.taxonomyText)
    );
  const destinations = new Map(
    options.evidence.disposition.destinations.map(
      (/** @type {any} */ entry) => [entry.path, entry],
    ),
  );
  const baselineByPath = new Map(
    options.evidence.baseline.map((/** @type {M1Classification} */ entry) => [
      entry.path,
      entry,
    ]),
  );
  const classifications = baseTaxonomy.classifications.map((entry) => {
    const destination = destinations.get(entry.path);
    if (destination === undefined) return entry;
    if (
      JSON.stringify(entry) !== JSON.stringify(baselineByPath.get(entry.path))
    ) {
      throw new Error(
        `M1 baseline does not match BASE taxonomy: ${entry.path}`,
      );
    }
    return {
      ...entry,
      status: destination.status,
      blocker: destination.status.startsWith('blocked:')
        ? destination.blocker
        : null,
    };
  });
  const preliminaryTaxonomyText = renderM1Json({
    ...baseTaxonomy,
    summary: summarizeEs2015Classification(classifications),
    statusTables: m1StatusTables(classifications),
    classifications,
  });
  const reportArtifacts = buildM1ReportArtifacts({
    reportText: options.reportText,
    conformanceText: options.conformanceText,
    subsetText,
    taxonomyText: preliminaryTaxonomyText,
    auditEvidenceText,
    promotionText,
    featuresText: options.featuresText,
  });
  const taxonomyText = renderM1Json({
    ...baseTaxonomy,
    inputs: {
      ...baseTaxonomy.inputs,
      subsetSha256: sha256(subsetText),
      selectedEvidenceSha256: sha256(reportArtifacts.reportText),
      auditEvidenceSha256: sha256(auditEvidenceText),
      m1DispositionSha256: sha256(renderM1Json(options.evidence.disposition)),
      m1PromotionSha256: sha256(promotionText),
    },
    summary: summarizeEs2015Classification(classifications),
    statusTables: m1StatusTables(classifications),
    classifications,
  });
  return {
    taxonomyText,
    auditEvidenceText,
    subsetText,
    reportText: reportArtifacts.reportText,
    conformanceText: reportArtifacts.conformanceText,
  };
}

/**
 * @param {{
 *   reportText: string,
 *   conformanceText: string,
 *   subsetText: string,
 *   taxonomyText: string,
 *   auditEvidenceText: string,
 *   promotionText: string,
 *   featuresText: string,
 * }} options
 */
export function buildM1ReportArtifacts(options) {
  const subset = parseUpstreamSubset(options.subsetText);
  const selectedPaths = upstreamSubsetPaths(subset);
  const selected = new Set(selectedPaths);
  const taxonomy = /** @type {{ classifications: M1Classification[] }} */ (
    JSON.parse(options.taxonomyText)
  );
  const taxonomyByPath = new Map(
    taxonomy.classifications.map((entry) => [entry.path, entry]),
  );
  const promotion = parseEs2015Promotion(options.promotionText);
  if (
    !('groupName' in promotion) ||
    promotion.groupName !== M1_PROMOTION_GROUP ||
    promotion.rootCount !== 103 ||
    promotion.variantCount !== 206
  ) {
    throw new Error('M1 report projection requires the exact promotion');
  }
  const promotedPaths = promotionPaths(promotion);
  const promoted = new Set(promotedPaths);
  const groups = subset.groups.filter(
    (entry) => entry.name === M1_PROMOTION_GROUP,
  );
  if (
    groups.length !== 1 ||
    groups[0].paths.join('\u0000') !== promotedPaths.join('\u0000')
  ) {
    throw new Error('M1 report projection requires the exact subset group');
  }

  const report = parseM1Report(options.reportText);
  const baseRecordsByPath = groupM1Records(
    report.records.filter((record) => !promoted.has(record.file)),
    'BASE report',
  );
  for (const record of report.records) {
    if (!selected.has(record.file) && !promoted.has(record.file)) {
      throw new Error(`M1 BASE report names a foreign root: ${record.file}`);
    }
  }

  const audit = /** @type {{ auditRecords: M1ExecutionRecord[] }} */ (
    JSON.parse(options.auditEvidenceText)
  );
  const promotionByPath = new Map(
    promotion.entries.map((entry) => [entry.path, entry]),
  );
  const promotedRecordsByPath = groupM1Records(
    audit.auditRecords
      .filter((record) => promoted.has(record.file))
      .map((record) => {
        const entry = promotionByPath.get(record.file);
        if (entry === undefined || record.status !== 'passed') {
          throw new Error(
            `M1 report promotion requires passing audit evidence: ${record.file}`,
          );
        }
        return createTestRecord({
          file: record.file,
          variant: record.variant,
          status: record.status,
          features: entry.features,
        });
      }),
    'M1 promotion audit evidence',
  );
  const records = [];
  for (const sourcePath of selectedPaths) {
    const entry = taxonomyByPath.get(sourcePath);
    const sourceRecords = promoted.has(sourcePath)
      ? promotedRecordsByPath.get(sourcePath)
      : baseRecordsByPath.get(sourcePath);
    if (
      entry === undefined ||
      sourceRecords === undefined ||
      sourceRecords.length !== entry.variants
    ) {
      throw new Error(
        `M1 report projection lacks exact selected variants: ${sourcePath}`,
      );
    }
    records.push(...sourceRecords);
  }
  const projectedRecordCount = [
    ...baseRecordsByPath.values(),
    ...promotedRecordsByPath.values(),
  ].reduce((total, entries) => total + entries.length, 0);
  if (records.length !== projectedRecordCount) {
    throw new Error('M1 report projection contains foreign selected records');
  }

  const summary = createSummaryRecord(records);
  const variants = new Map(
    [...groupM1Records(records, 'projected report')].map(
      ([sourcePath, entries]) => [sourcePath, entries.length],
    ),
  );
  const inventory = {
    files: [],
    malformed: [],
    variants,
    totals: {
      files: report.inventory.files,
      records: report.inventory.records,
      malformed: report.inventory.malformed,
    },
  };
  const coverage = summarizeTest262Coverage({
    inventory,
    records,
    selected: selectedPaths,
  });
  const reportText = `${[
    ...formatReportLines(records),
    ...formatUpstreamSummaryLines(
      summarizeUpstreamRun({
        subset,
        records,
        supportedFeatures: featureNames(
          parseFeatureManifest(options.featuresText),
        ),
      }),
    ),
    ...formatCoverageLines(coverage),
    formatRecordLine(summary),
  ].join('\n')}\n`;
  const block = renderCoverageSummary({
    coverage,
    reportPath: 'docs/test262-report.jsonl',
    reportLinkPath: 'test262-report.jsonl',
  });
  return {
    reportText,
    conformanceText: replaceGeneratedBlock(options.conformanceText, block),
  };
}

/** @param {unknown} value */
function renderM1Json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** @param {readonly any[]} classifications */
function m1StatusTables(classifications) {
  return {
    core: m1CountTable(
      classifications.filter((entry) => entry.partition === 'core'),
      (entry) => entry.status,
    ),
    annexB: m1CountTable(
      classifications.filter((entry) => entry.partition === 'annex-b'),
      (entry) => entry.status,
    ),
    blockers: m1CountTable(
      classifications.filter((entry) => entry.blocker !== null),
      (entry) => entry.blocker,
    ),
  };
}

/**
 * @param {readonly any[]} entries
 * @param {(entry: any) => string} keyOf
 */
function m1CountTable(entries, keyOf) {
  const totals = new Map();
  for (const entry of entries) {
    const key = keyOf(entry);
    const total = totals.get(key) ?? { roots: 0, variants: 0 };
    total.roots += 1;
    total.variants += entry.variants;
    totals.set(key, total);
  }
  return [...totals]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, total]) => ({ name, ...total }));
}

/**
 * @param {string} text
 * @returns {{
 *   records: M1ExecutionRecord[],
 *   inventory: { files: number, records: number, malformed: number },
 * }}
 */
function parseM1Report(text) {
  /** @type {M1ExecutionRecord[]} */
  const records = [];
  /** @type {{ files: number, records: number, malformed: number } | null} */
  let inventory = null;
  for (const [index, line] of text.split('\n').entries()) {
    if (line === '') continue;
    let value;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new Error(
        `M1 report line ${index + 1} is invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (value?.type === 'test') {
      const allowed = new Set([
        'type',
        'file',
        'variant',
        'status',
        'reason',
        'message',
        'features',
      ]);
      if (
        Object.keys(value).some((key) => !allowed.has(key)) ||
        typeof value.file !== 'string' ||
        (value.variant !== null && typeof value.variant !== 'string') ||
        !['passed', 'failed', 'skipped'].includes(value.status)
      ) {
        throw new Error(`M1 report line ${index + 1} has an invalid test`);
      }
      records.push(
        createTestRecord({
          file: value.file,
          variant: value.variant,
          status: /** @type {'passed' | 'failed' | 'skipped'} */ (value.status),
          ...(value.reason === undefined ? {} : { reason: value.reason }),
          ...(value.message === undefined ? {} : { message: value.message }),
          ...(value.features === undefined ? {} : { features: value.features }),
        }),
      );
    } else if (value?.type === 'inventory') {
      if (
        inventory !== null ||
        !Number.isInteger(value.files) ||
        !Number.isInteger(value.records) ||
        !Number.isInteger(value.malformed)
      ) {
        throw new Error(`M1 report line ${index + 1} has invalid inventory`);
      }
      inventory = value;
    }
  }
  if (inventory === null) {
    throw new Error('M1 report lacks whole-suite inventory');
  }
  return { records, inventory };
}

/**
 * @param {readonly M1ExecutionRecord[]} records
 * @param {string} label
 * @returns {Map<string, M1ExecutionRecord[]>}
 */
function groupM1Records(records, label) {
  /** @type {Map<string, M1ExecutionRecord[]>} */
  const grouped = new Map();
  const keys = new Set();
  for (const record of records) {
    const key = `${record.file}\u0000${record.variant ?? ''}`;
    if (keys.has(key)) {
      throw new Error(
        `${label} repeats selected variant ${record.file} (${String(
          record.variant,
        )})`,
      );
    }
    keys.add(key);
    const entries = grouped.get(record.file) ?? [];
    entries.push(record);
    grouped.set(record.file, entries);
  }
  return grouped;
}

/**
 * @param {Record<string, string>} values
 * @param {readonly string[]} paths
 * @param {string} label
 */
function requireExactTextPaths(values, paths, label) {
  if (
    typeof values !== 'object' ||
    values === null ||
    Array.isArray(values) ||
    Object.keys(values).sort().join('\u0000') !==
      [...paths].sort().join('\u0000')
  ) {
    throw new Error(`${label} must cover the exact protected paths`);
  }
  for (const path of paths) {
    if (typeof values[path] !== 'string') {
      throw new Error(`${label} must contain text for ${path}`);
    }
  }
}

/**
 * @param {URL} repositoryRootUrl
 * @param {string} outputPath
 */
export async function resolveM1OutputPath(repositoryRootUrl, outputPath) {
  if (
    typeof outputPath !== 'string' ||
    outputPath === '' ||
    path.isAbsolute(outputPath) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(outputPath)
  ) {
    throw new Error('M1 output path must be repository-relative');
  }
  const root = await realpath(fileURLToPath(repositoryRootUrl));
  const candidate = path.resolve(root, outputPath);
  assertInsideRepository(root, candidate, outputPath);
  const logicalScratchRoot = path.resolve(root, M1_SCRATCH_ROOT);
  assertInsideM1Scratch(logicalScratchRoot, candidate, outputPath);
  const scratchRoot = await resolveM1ScratchRoot(
    repositoryRootUrl,
    M1_SCRATCH_ROOT,
  );
  const physicalCandidate = await resolvePhysicalOutputTarget(candidate);
  assertInsideM1Scratch(scratchRoot, physicalCandidate, outputPath);
  await mkdir(path.dirname(physicalCandidate), { recursive: true });
  const physicalParent = await realpath(path.dirname(physicalCandidate));
  assertInsideM1Scratch(scratchRoot, physicalParent, outputPath, true);
  const target = path.join(physicalParent, path.basename(physicalCandidate));
  try {
    const stat = await lstat(target);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`M1 output path ${outputPath} must be a regular file`);
    }
  } catch (error) {
    if (/** @type {any} */ (error)?.code !== 'ENOENT') {
      throw error;
    }
  }
  return target;
}

/**
 * @param {{
 *   environment?: Record<string, string | undefined>,
 *   ledgerText?: string,
 *   taxonomy?: any,
 *   pin?: { repository: string, revision: string },
 *   host?: import('./runner.js').Test262Host,
 *   engine?: import('./runner.js').Test262Engine,
 * }} options
 */
export async function runM1Focused(options) {
  const environment = options?.environment ?? process.env;
  if (environment.TZ !== 'UTC') {
    throw new Error('Focused M1 Test262 execution requires TZ=UTC');
  }
  const taxonomy = options?.taxonomy;
  const pin = options?.pin;
  if (
    taxonomy === undefined ||
    pin === undefined ||
    taxonomy?.pin?.repository !== pin.repository ||
    taxonomy?.pin?.revision !== pin.revision
  ) {
    throw new Error('M1 taxonomy does not match the pinned Test262 checkout');
  }
  if (options?.host === undefined || options?.engine === undefined) {
    throw new Error('Focused M1 execution requires a Test262 host and engine');
  }

  const ledgerText = options.ledgerText ?? '';
  const paths = verifyM1Ledger(ledgerText, taxonomy);
  const byPath = new Map(
    taxonomy.classifications.map((/** @type {M1Classification} */ entry) => [
      entry.path,
      entry,
    ]),
  );
  const { records } = await runTest262Suite({
    engine: options.engine,
    host: options.host,
    paths,
    supportedFeaturesForPath(file, metadata) {
      const entry = byPath.get(file);
      const metadataFeatures = [...metadata.features];
      if (
        entry === undefined ||
        !sameStrings(metadataFeatures, entry.features)
      ) {
        throw new Error(`M1 metadata feature drift: ${file}`);
      }
      return metadataFeatures;
    },
  });
  const document = {
    version: 1,
    ledger: {
      roots: M1.roots,
      variants: M1.variants,
      sha256: M1.sha256,
    },
    records,
  };
  try {
    validateM1Records(records, paths, byPath);
  } catch (error) {
    if (error instanceof Error) {
      Object.assign(error, { m1Execution: document });
    }
    throw error;
  }
  return document;
}

/**
 * @param {string} text
 * @param {{ classifications?: readonly any[] }} taxonomy
 * @returns {string[]}
 */
export function verifyM1Ledger(text, taxonomy) {
  const paths = parseM1Ledger(text);
  if (
    paths.length !== M1.roots ||
    sha256(text) !== M1.sha256 ||
    !Array.isArray(taxonomy?.classifications)
  ) {
    throw new Error('M1 ledger does not match the reviewed 113-root SHA-256');
  }
  const classifications = new Map(
    taxonomy.classifications.map((/** @type {M1Classification} */ entry) => [
      entry.path,
      entry,
    ]),
  );
  let variants = 0;
  for (const sourcePath of paths) {
    const entry = classifications.get(sourcePath);
    if (
      entry?.partition !== 'core' ||
      entry.status !== 'blocked:proxy-and-reflect-metaobject' ||
      entry.blocker !== 'proxy-and-reflect-metaobject' ||
      entry.variants !== 2 ||
      !Array.isArray(entry.features) ||
      !Array.isArray(entry.flags) ||
      !Array.isArray(entry.includes) ||
      !Array.isArray(entry.provenance)
    ) {
      throw new Error(`M1 BASE classification mismatch: ${sourcePath}`);
    }
    variants += entry.variants;
  }
  if (variants !== M1.variants) {
    throw new Error('M1 taxonomy variants do not match the reviewed ledger');
  }
  return paths;
}

/**
 * @param {{
 *   taxonomyText: string,
 *   baselineText: string,
 *   dispositionText: string,
 *   provenanceText: string,
 * }} options
 */
export function reconstructAppliedM1SourceTaxonomy(options) {
  const manifest = JSON.parse(options.provenanceText);
  const authority = manifest.roadmapAuthorities?.find(
    (/** @type {any} */ entry) => entry.code === 'M1',
  );
  if (
    authority === undefined ||
    authority.state !== 'applied' ||
    authority.reconciliation !== null
  ) {
    throw new Error('Focused M1 execution requires the applied M1 authority');
  }
  const evidenceByPath = new Map(
    authority.evidence.map((/** @type {any} */ entry) => [entry.path, entry]),
  );
  if (
    sha256(options.baselineText) !==
      evidenceByPath.get(M1_BASELINE_FILE)?.sha256 ||
    sha256(options.dispositionText) !==
      evidenceByPath.get(M1_DISPOSITION_FILE)?.sha256
  ) {
    throw new Error('Focused M1 execution evidence does not match authority');
  }

  const baseline = JSON.parse(options.baselineText);
  const disposition = JSON.parse(options.dispositionText);
  const destinations = disposition?.destinations;
  if (
    !Array.isArray(baseline) ||
    !Array.isArray(destinations) ||
    baseline.length !== M1.roots ||
    destinations.length !== M1.roots
  ) {
    throw new Error('Focused M1 execution evidence has the wrong root count');
  }
  const paths = baseline.map((/** @type {any} */ entry) => entry.path);
  if (
    authority.source.rootCount !== M1.roots ||
    authority.source.variantCount !== M1.variants ||
    authority.source.pathSha256 !== M1.sha256 ||
    paths.some(
      (/** @type {string} */ sourcePath, /** @type {number} */ index) =>
        destinations[index]?.path !== sourcePath,
    ) ||
    sha256(`${paths.join('\n')}\n`) !== M1.sha256 ||
    baseline.reduce(
      (/** @type {number} */ total, /** @type {any} */ entry) =>
        total + entry.variants,
      0,
    ) !== M1.variants
  ) {
    throw new Error(
      'Focused M1 execution evidence has the wrong source identity',
    );
  }

  const taxonomy = JSON.parse(options.taxonomyText);
  if (!Array.isArray(taxonomy.classifications)) {
    throw new Error('Focused M1 execution requires taxonomy classifications');
  }
  const currentByPath = new Map(
    taxonomy.classifications.map((/** @type {any} */ entry) => [
      entry.path,
      entry,
    ]),
  );
  const baselineByPath = new Map();
  for (let index = 0; index < baseline.length; index += 1) {
    const source = baseline[index];
    const destination = destinations[index];
    const current = currentByPath.get(source.path);
    if (
      current === undefined ||
      current.status !== destination.status ||
      current.blocker !== destination.blocker
    ) {
      throw new Error(`Focused M1 applied taxonomy mismatch: ${source.path}`);
    }
    const stableSource = { ...source };
    const stableCurrent = { ...current };
    Reflect.deleteProperty(stableSource, 'status');
    Reflect.deleteProperty(stableSource, 'blocker');
    Reflect.deleteProperty(stableCurrent, 'status');
    Reflect.deleteProperty(stableCurrent, 'blocker');
    if (JSON.stringify(stableSource) !== JSON.stringify(stableCurrent)) {
      throw new Error(`Focused M1 applied taxonomy drift: ${source.path}`);
    }
    baselineByPath.set(source.path, source);
  }
  return {
    ...taxonomy,
    classifications: taxonomy.classifications.map(
      (/** @type {any} */ entry) => baselineByPath.get(entry.path) ?? entry,
    ),
  };
}

/**
 * @param {readonly M1ExecutionRecord[]} records
 * @param {readonly string[]} paths
 * @param {ReadonlyMap<string, M1Classification>} classifications
 * @returns {Map<string, M1ExecutionRecord[]>}
 */
function validateM1Records(records, paths, classifications) {
  /** @type {Map<string, M1ExecutionRecord[]>} */
  const recordsByPath = new Map(paths.map((sourcePath) => [sourcePath, []]));
  const keys = new Set();
  for (const record of records) {
    const pathRecords = recordsByPath.get(record.file);
    const key = `${record.file}\u0000${record.variant ?? ''}`;
    if (
      pathRecords === undefined ||
      keys.has(key) ||
      !['passed', 'failed', 'skipped'].includes(record.status)
    ) {
      throw new Error('M1 execution returned a foreign or duplicate record');
    }
    if (record.status === 'skipped') {
      throw new Error(
        `M1 execution contains a skipped variant: ${record.file}`,
      );
    }
    keys.add(key);
    pathRecords.push(record);
  }
  const proxyPaths = new Set(M1_PROXY_PATHS);
  for (const sourcePath of paths) {
    const pathRecords = recordsByPath.get(sourcePath) ?? [];
    const classification = classifications.get(sourcePath);
    if (pathRecords.length !== classification?.variants) {
      throw new Error(`M1 execution lacks exact variants: ${sourcePath}`);
    }
    const completePass = pathRecords.every(
      (record) => record.status === 'passed',
    );
    if (proxyPaths.has(sourcePath)) {
      if (completePass) {
        throw new Error(`M1 Proxy residual unexpectedly passed: ${sourcePath}`);
      }
      if (!pathRecords.some((record) => record.status === 'failed')) {
        throw new Error(
          `M1 Proxy residual lacks reviewed failure evidence: ${sourcePath}`,
        );
      }
    } else if (!completePass) {
      throw new Error(`M1 Reflect root did not completely pass: ${sourcePath}`);
    }
  }
  if (records.length !== M1.variants) {
    throw new Error('M1 execution does not cover all 226 reviewed variants');
  }
  return recordsByPath;
}

/**
 * @param {M1Execution} execution
 * @param {readonly M1Classification[]} baseline
 * @returns {Map<string, M1ExecutionRecord[]>}
 */
function validateM1Execution(execution, baseline) {
  if (
    execution?.version !== 1 ||
    execution?.ledger?.roots !== M1.roots ||
    execution?.ledger?.variants !== M1.variants ||
    execution?.ledger?.sha256 !== M1.sha256 ||
    !Array.isArray(execution?.records)
  ) {
    throw new Error('M1 execution evidence has the wrong reviewed identity');
  }
  const paths = baseline.map((entry) => entry.path);
  const classifications = new Map(baseline.map((entry) => [entry.path, entry]));
  return validateM1Records(execution.records, paths, classifications);
}

/**
 * @param {string} sourcePath
 * @param {boolean} passed
 */
function m1Destination(sourcePath, passed) {
  if (M1_PROXY_PATHS.includes(sourcePath)) {
    if (passed) {
      throw new Error(`M1 Proxy residual unexpectedly passed: ${sourcePath}`);
    }
    return {
      path: sourcePath,
      status: 'blocked:proxy-and-reflect-metaobject',
      blocker: 'proxy-and-reflect-metaobject',
      issue: 81,
    };
  }
  if (!passed) {
    throw new Error(`M1 Reflect root did not completely pass: ${sourcePath}`);
  }
  return {
    path: sourcePath,
    status: 'selected-passing',
    blocker: null,
    issue: 80,
  };
}

/**
 * @param {readonly {
 *   status: string,
 *   blocker: string | null,
 *   issue: number,
 * }[]} destinations
 */
function uniqueM1Destinations(destinations) {
  const unique = new Map();
  for (const destination of destinations) {
    const key = `${destination.status}\u0000${destination.blocker ?? ''}\u0000${destination.issue}`;
    unique.set(key, destination);
  }
  return [...unique]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, destination]) => destination);
}

/**
 * @param {readonly string[]} left
 * @param {readonly string[]} right
 */
function sameStrings(left, right) {
  return [...left].sort().join('\u0000') === [...right].sort().join('\u0000');
}

/**
 * @param {string} root
 * @param {string} candidate
 * @param {string} displayPath
 */
function assertInsideRepository(root, candidate, displayPath) {
  const relative = path.relative(root, candidate);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`M1 path ${displayPath} is outside the repository root`);
  }
}

/**
 * @param {string} root
 * @param {string} candidate
 * @param {string} displayPath
 * @param {boolean} [allowRoot]
 */
function assertInsideM1Scratch(
  root,
  candidate,
  displayPath,
  allowRoot = false,
) {
  const relative = path.relative(root, candidate);
  if (
    (!allowRoot && relative === '') ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `M1 output path ${displayPath} is outside the M1 scratch root ${M1_SCRATCH_ROOT}`,
    );
  }
}

/** @param {string} candidate */
async function resolvePhysicalOutputTarget(candidate) {
  const missing = [];
  let current = candidate;
  while (true) {
    try {
      return path.join(await realpath(current), ...missing);
    } catch (error) {
      if (/** @type {any} */ (error)?.code !== 'ENOENT') {
        throw error;
      }
    }
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error(`M1 output path ${candidate} has a dangling symlink`);
      }
    } catch (error) {
      if (/** @type {any} */ (error)?.code !== 'ENOENT') {
        throw error;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(
        `M1 output path ${candidate} has no existing physical ancestor`,
      );
    }
    missing.unshift(path.basename(current));
    current = parent;
  }
}

/**
 * @param {readonly string[]} argv
 * @param {{
 *   environment?: Record<string, string | undefined>,
 *   readPin?: () => Promise<{ repository: string, revision: string, checkoutPath: string }>,
 *   assertPinnedCheckout?: (pin: { repository: string, revision: string, checkoutPath: string }) => Promise<void>,
 *   readRoot?: (path: string) => Promise<string>,
 *   readIncludeDefinitions?: () => Promise<ReadonlyMap<string, unknown> | Record<string, unknown>>,
 * }} [dependencies]
 */
export async function main(argv = [], dependencies = {}) {
  const options = parseM1Options(argv);
  const environment = dependencies.environment ?? process.env;
  if (environment.TZ !== 'UTC') {
    throw new Error('Focused M1 Test262 tooling requires TZ=UTC');
  }
  return options.buildScratch
    ? buildM1Scratch(options, dependencies)
    : executeM1Corpus(options, environment);
}

/**
 * @param {readonly string[]} argv
 * @returns {M1CliOptions}
 */
function parseM1Options(argv) {
  let buildScratch = false;
  let ledger = null;
  let execution = null;
  let output = null;
  for (const argument of argv) {
    if (argument === '--build-scratch') {
      if (buildScratch) {
        throw new Error('--build-scratch may be specified once');
      }
      buildScratch = true;
    } else if (argument.startsWith('--ledger=')) {
      if (ledger !== null) throw new Error('--ledger may be specified once');
      ledger = argument.slice('--ledger='.length);
    } else if (argument.startsWith('--execution=')) {
      if (execution !== null) {
        throw new Error('--execution may be specified once');
      }
      execution = argument.slice('--execution='.length);
    } else if (argument.startsWith('--output=')) {
      if (output !== null) throw new Error('--output may be specified once');
      output = argument.slice('--output='.length);
    } else {
      throw new Error(`Unknown M1 option: ${argument}`);
    }
  }
  if (ledger === null || ledger === '' || output === null || output === '') {
    throw new Error('M1 tooling requires --ledger and --output');
  }
  if (buildScratch) {
    if (execution === null || execution === '') {
      throw new Error('M1 build-scratch requires --execution');
    }
  } else if (execution !== null) {
    throw new Error('--execution requires --build-scratch');
  }
  return { buildScratch, ledger, execution, output };
}

/**
 * @param {{ ledger: string, output: string }} options
 * @param {Record<string, string | undefined>} environment
 */
async function executeM1Corpus(options, environment) {
  const [
    ledgerPath,
    taxonomyPath,
    baselinePath,
    dispositionPath,
    provenancePath,
    outputPath,
  ] = await Promise.all([
    resolveM1InputPath(REPOSITORY_ROOT_URL, options.ledger),
    resolveM1InputPath(REPOSITORY_ROOT_URL, TAXONOMY_FILE),
    resolveM1InputPath(REPOSITORY_ROOT_URL, M1_BASELINE_FILE),
    resolveM1InputPath(REPOSITORY_ROOT_URL, M1_DISPOSITION_FILE),
    resolveM1InputPath(REPOSITORY_ROOT_URL, PROVENANCE_FILE),
    resolveM1OutputPath(REPOSITORY_ROOT_URL, options.output),
  ]);
  const pin = await readTest262Pin(REPOSITORY_ROOT_URL);
  await assertPinnedCheckout(pin, REPOSITORY_ROOT_URL);
  const [
    ledgerText,
    taxonomyText,
    baselineText,
    dispositionText,
    provenanceText,
  ] = await Promise.all([
    readFile(ledgerPath, 'utf8'),
    readFile(taxonomyPath, 'utf8'),
    readFile(baselinePath, 'utf8'),
    readFile(dispositionPath, 'utf8'),
    readFile(provenancePath, 'utf8'),
  ]);
  const taxonomy = reconstructAppliedM1SourceTaxonomy({
    taxonomyText,
    baselineText,
    dispositionText,
    provenanceText,
  });
  let document;
  try {
    document = await runM1Focused({
      environment,
      ledgerText,
      taxonomy,
      pin,
      host: createNodeTest262Host({
        root: new URL(
          `${pin.checkoutPath.replace(/\/$/u, '')}/`,
          REPOSITORY_ROOT_URL,
        ),
      }),
      engine: createJsjsTest262Engine(),
    });
  } catch (error) {
    const failedDocument = /** @type {any} */ (error)?.m1Execution;
    if (failedDocument === undefined) throw error;
    await writeM1FileAtomically(outputPath, renderM1Json(failedDocument));
    writeM1ExecutionSummary(failedDocument);
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
  await writeM1FileAtomically(outputPath, renderM1Json(document));
  writeM1ExecutionSummary(document);
  return 0;
}

/** @param {any} document */
function writeM1ExecutionSummary(document) {
  const byPath = groupM1Records(document.records, 'M1 execution summary');
  const completePassRoots = [...byPath.values()].filter((records) =>
    records.every((record) => record.status === 'passed'),
  ).length;
  const completePassVariants = [...byPath.values()]
    .filter((records) => records.every((record) => record.status === 'passed'))
    .reduce((total, records) => total + records.length, 0);
  process.stdout.write(
    `M1 focused Test262: ${document.ledger.roots} roots / ${document.ledger.variants} variants; ${completePassRoots} complete-pass roots / ${completePassVariants} variants; ${document.ledger.roots - completePassRoots} residual roots / ${document.ledger.variants - completePassVariants} variants\n`,
  );
}

/**
 * @param {{ ledger: string, execution: string | null, output: string }} options
 * @param {{
 *   readPin?: () => Promise<{ repository: string, revision: string, checkoutPath: string }>,
 *   assertPinnedCheckout?: (pin: { repository: string, revision: string, checkoutPath: string }) => Promise<void>,
 *   readRoot?: (path: string) => Promise<string>,
 *   readIncludeDefinitions?: () => Promise<ReadonlyMap<string, unknown> | Record<string, unknown>>,
 * }} dependencies
 */
async function buildM1Scratch(options, dependencies) {
  if (options.execution === null) {
    throw new Error('M1 build-scratch requires execution evidence');
  }
  const [
    ledgerPath,
    executionPath,
    taxonomyPath,
    auditPath,
    subsetPath,
    selectionPath,
    reportPath,
    conformancePath,
    featuresPath,
    scratchRoot,
  ] = await Promise.all([
    resolveM1InputPath(REPOSITORY_ROOT_URL, options.ledger),
    resolveM1InputPath(REPOSITORY_ROOT_URL, options.execution),
    resolveM1InputPath(REPOSITORY_ROOT_URL, TAXONOMY_FILE),
    resolveM1InputPath(REPOSITORY_ROOT_URL, AUDIT_EVIDENCE_FILE),
    resolveM1InputPath(REPOSITORY_ROOT_URL, SUBSET_FILE),
    resolveM1InputPath(REPOSITORY_ROOT_URL, SELECTION_FILE),
    resolveM1InputPath(REPOSITORY_ROOT_URL, REPORT_FILE),
    resolveM1InputPath(REPOSITORY_ROOT_URL, CONFORMANCE_FILE),
    resolveM1InputPath(REPOSITORY_ROOT_URL, FEATURES_FILE),
    resolveM1ScratchRoot(REPOSITORY_ROOT_URL, options.output),
  ]);
  const [
    ledgerText,
    executionText,
    taxonomyText,
    auditEvidenceText,
    subsetText,
    selectionText,
    reportText,
    conformanceText,
    featuresText,
  ] = await Promise.all([
    readFile(ledgerPath, 'utf8'),
    readFile(executionPath, 'utf8'),
    readFile(taxonomyPath, 'utf8'),
    readFile(auditPath, 'utf8'),
    readFile(subsetPath, 'utf8'),
    readFile(selectionPath, 'utf8'),
    readFile(reportPath, 'utf8'),
    readFile(conformancePath, 'utf8'),
    readFile(featuresPath, 'utf8'),
  ]);
  const execution = JSON.parse(executionText);
  const taxonomy = JSON.parse(taxonomyText);
  const paths = verifyM1Ledger(ledgerText, taxonomy);
  const pin = await (
    dependencies.readPin ?? (() => readTest262Pin(REPOSITORY_ROOT_URL))
  )();
  if (
    taxonomy?.pin?.repository !== pin.repository ||
    taxonomy?.pin?.revision !== pin.revision
  ) {
    throw new Error('M1 taxonomy does not match the pinned Test262 checkout');
  }
  await (
    dependencies.assertPinnedCheckout ??
    ((currentPin) => assertPinnedCheckout(currentPin, REPOSITORY_ROOT_URL))
  )(pin);
  const host = createNodeTest262Host({
    root: new URL(
      `${pin.checkoutPath.replace(/\/$/u, '')}/`,
      REPOSITORY_ROOT_URL,
    ),
  });
  const readRoot =
    dependencies.readRoot ?? ((sourcePath) => host.readTest(sourcePath));
  const readIncludeDefinitions =
    dependencies.readIncludeDefinitions ??
    (() =>
      readTest262HarnessDefinitions(pin.checkoutPath, REPOSITORY_ROOT_URL));
  const inventory = buildEs2015Inventory({
    roots: await Promise.all(
      paths.map(async (sourcePath) => ({
        path: sourcePath,
        source: await readRoot(sourcePath),
      })),
    ),
    includeDefinitions: await readIncludeDefinitions(),
  });
  const evidence = buildM1AuthorityEvidence({
    ledgerText,
    taxonomyText,
    execution,
    inventory,
  });
  const projected = projectM1CoreOutputs({
    taxonomyText,
    auditEvidenceText,
    subsetText,
    reportText,
    conformanceText,
    featuresText,
    evidence,
    execution,
    inventory,
  });
  const selection = projectM1Selection(selectionText);
  const evidenceTexts = {
    'tools/test262/es2015-m1-paths.json': renderM1Json(evidence.paths),
    'tools/test262/es2015-m1-baseline.json': renderM1Json(evidence.baseline),
    'tools/test262/es2015-m1-disposition.json': renderM1Json(
      evidence.disposition,
    ),
    'tools/test262/es2015-m1-owner-deltas.json': renderM1Json(
      evidence.ownerDeltas,
    ),
    'tools/test262/es2015-m1-owner-map.json': renderM1Json(evidence.ownerMap),
    'tools/test262/es2015-m1-promotion.json': renderM1Json(evidence.promotion),
  };
  const baseOutputs = {
    [CONFORMANCE_FILE]: conformanceText,
    [REPORT_FILE]: reportText,
    [AUDIT_EVIDENCE_FILE]: auditEvidenceText,
    [TAXONOMY_FILE]: taxonomyText,
    [SELECTION_FILE]: selection.baseText,
    [SUBSET_FILE]: subsetText,
  };
  const projectedOutputs = {
    [CONFORMANCE_FILE]: projected.conformanceText,
    [REPORT_FILE]: projected.reportText,
    [AUDIT_EVIDENCE_FILE]: projected.auditEvidenceText,
    [TAXONOMY_FILE]: projected.taxonomyText,
    [SELECTION_FILE]: selection.headText,
    [SUBSET_FILE]: projected.subsetText,
  };
  const authority = buildM1PendingAuthority({
    baseTaxonomyText: taxonomyText,
    evidenceTexts,
    baseOutputs,
    projectedOutputs,
  });
  const protectedProjection = authority.protectedOutputs.map((output) => ({
    path: output.path,
    operation: output.operation,
    sha256:
      output.operation === 'project'
        ? output.projectionSha256
        : output.headSha256,
  }));
  const protectedProjectionSha256 = sha256(
    `${JSON.stringify(protectedProjection)}\n`,
  );
  /** @type {Map<string, string>} */
  const files = new Map([
    [
      'evidence/es2015-m1-paths.json',
      evidenceTexts['tools/test262/es2015-m1-paths.json'],
    ],
    [
      'evidence/es2015-m1-baseline.json',
      evidenceTexts['tools/test262/es2015-m1-baseline.json'],
    ],
    [
      'evidence/es2015-m1-disposition.json',
      evidenceTexts['tools/test262/es2015-m1-disposition.json'],
    ],
    [
      'evidence/es2015-m1-owner-deltas.json',
      evidenceTexts['tools/test262/es2015-m1-owner-deltas.json'],
    ],
    [
      'evidence/es2015-m1-owner-map.json',
      evidenceTexts['tools/test262/es2015-m1-owner-map.json'],
    ],
    [
      'evidence/es2015-m1-promotion.json',
      evidenceTexts['tools/test262/es2015-m1-promotion.json'],
    ],
    ['projected/docs/conformance.md', projected.conformanceText],
    ['projected/docs/test262-report.jsonl', projected.reportText],
    [
      'projected/tools/test262/es2015-audit-evidence.json',
      projected.auditEvidenceText,
    ],
    ['projected/tools/test262/es2015-taxonomy.json', projected.taxonomyText],
    ['projected/tools/test262/es5-selection.json', selection.headText],
    ['projected/tools/test262/upstream-subset.json', projected.subsetText],
    ['authority-record.json', renderM1Json(authority)],
    ['protected-projection.json', renderM1Json(protectedProjection)],
  ]);
  const byPath = groupM1Records(execution.records, 'M1 scratch execution');
  const completePass = [...byPath.values()].filter((records) =>
    records.every((record) => record.status === 'passed'),
  );
  const completePassVariants = completePass.reduce(
    (total, records) => total + records.length,
    0,
  );
  const fileSha256 = Object.fromEntries(
    [...files]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([file, text]) => [file, sha256(text)]),
  );
  const summary = {
    version: 1,
    ledger: {
      roots: M1.roots,
      variants: M1.variants,
      sha256: M1.sha256,
    },
    outcome: {
      completePassRoots: completePass.length,
      completePassVariants,
      residualRoots: M1.roots - completePass.length,
      residualVariants: M1.variants - completePassVariants,
    },
    authoritySha256: sha256(`${JSON.stringify(authority)}\n`),
    protectedProjectionSha256,
    fileSha256,
  };
  files.set('summary.json', renderM1Json(summary));
  await writeM1ScratchBundle(scratchRoot, files);
  process.stdout.write(
    `M1 scratch evidence: ${M1.roots} roots / ${M1.variants} variants; ${completePass.length} complete-pass roots / ${completePassVariants} variants; ${M1.roots - completePass.length} residual roots / ${M1.variants - completePassVariants} variants\n`,
  );
  return 0;
}

/**
 * @param {URL} repositoryRootUrl
 * @param {string} inputPath
 */
async function resolveM1InputPath(repositoryRootUrl, inputPath) {
  if (
    typeof inputPath !== 'string' ||
    inputPath === '' ||
    path.isAbsolute(inputPath) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(inputPath)
  ) {
    throw new Error('M1 input path must be repository-relative');
  }
  const root = await realpath(fileURLToPath(repositoryRootUrl));
  const candidate = path.resolve(root, inputPath);
  assertInsideRepository(root, candidate, inputPath);
  const physical = await realpath(candidate);
  assertInsideRepository(root, physical, inputPath);
  const stat = await lstat(physical);
  if (!stat.isFile()) {
    throw new Error(`M1 input path ${inputPath} must be a regular file`);
  }
  return physical;
}

/**
 * @param {URL} repositoryRootUrl
 * @param {string} outputPath
 */
async function resolveM1ScratchRoot(repositoryRootUrl, outputPath) {
  if (outputPath !== M1_SCRATCH_ROOT) {
    throw new Error(
      `M1 build-scratch output must be exactly ${M1_SCRATCH_ROOT}`,
    );
  }
  const root = await realpath(fileURLToPath(repositoryRootUrl));
  const candidate = path.resolve(root, outputPath);
  assertInsideRepository(root, candidate, outputPath);
  try {
    if ((await lstat(candidate)).isSymbolicLink()) {
      throw new Error(`M1 scratch output ${outputPath} must not be a symlink`);
    }
  } catch (error) {
    if (/** @type {any} */ (error)?.code !== 'ENOENT') {
      throw error;
    }
  }
  const physicalCandidate = await resolvePhysicalOutputTarget(candidate);
  assertInsideRepository(root, physicalCandidate, outputPath);
  if (physicalCandidate !== candidate) {
    throw new Error(
      `M1 scratch output ${outputPath} must not traverse a symlink`,
    );
  }
  await mkdir(physicalCandidate, { recursive: true });
  const physical = await realpath(physicalCandidate);
  assertInsideRepository(root, physical, outputPath);
  if (physical !== candidate) {
    throw new Error(
      `M1 scratch output ${outputPath} must not traverse a symlink`,
    );
  }
  return physical;
}

/**
 * @param {string} target
 * @param {string} text
 */
async function writeM1FileAtomically(target, text) {
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.m1-${randomUUID()}`,
  );
  try {
    await writeFile(temporary, text, 'utf8');
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

/**
 * @param {string} scratchRoot
 * @param {ReadonlyMap<string, string>} files
 */
async function writeM1ScratchBundle(scratchRoot, files) {
  const staging = path.join(scratchRoot, `.build-${randomUUID()}`);
  const successFiles = [
    'authority-record.json',
    'protected-projection.json',
    'summary.json',
  ];
  try {
    await mkdir(staging);
    for (const [relative, text] of files) {
      const target = path.join(staging, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, text, 'utf8');
    }
    await rm(path.join(scratchRoot, 'summary.json'), { force: true });
    for (const directory of ['evidence', 'projected']) {
      await rm(path.join(scratchRoot, directory), {
        recursive: true,
        force: true,
      });
      await rename(
        path.join(staging, directory),
        path.join(scratchRoot, directory),
      );
    }
    for (const file of successFiles) {
      await rm(path.join(scratchRoot, file), { force: true });
      await rename(path.join(staging, file), path.join(scratchRoot, file));
    }
  } catch (error) {
    for (const file of successFiles) {
      await rm(path.join(scratchRoot, file), { force: true });
    }
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (status) => {
      process.exitCode = status;
    },
    (error) => {
      process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
      process.exitCode = 1;
    },
  );
}
