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
import {
  formatCoverageLines,
  renderCoverageSummary,
  replaceGeneratedBlock,
  summarizeTest262Coverage,
} from './coverage.js';
import { createJsjsTest262Engine } from './engine.js';
import {
  mergePromotionSubset,
  parseEs2015Promotion,
  promotionPaths,
} from './es2015-promotion.js';
import {
  P1C_COLLATERAL_BASE_CLASSIFICATIONS,
  P1C_COLLATERAL_BLOCKED_CLASSIFICATIONS,
  P1C_COLLATERAL_PATHS,
} from './es2015-p1c-collateral.js';
import { serializeUpstreamSubset } from './es5-selection.js';
import {
  buildEs2015Inventory,
  summarizeEs2015Classification,
} from './es2015-taxonomy.js';
import { featureNames, parseFeatureManifest } from './features.js';
import { readTest262HarnessDefinitions } from './harness-definitions.js';
import { assertPinnedCheckout, readTest262Pin } from './pin.js';
import {
  createSummaryRecord,
  createTestRecord,
  formatRecordLine,
  formatReportLines,
} from './report.js';
import { runTest262Suite } from './runner.js';
import {
  formatUpstreamSummaryLines,
  parseUpstreamSubset,
  summarizeUpstreamRun,
  upstreamSubsetPaths,
} from './upstream.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const TAXONOMY_FILE = 'tools/test262/es2015-taxonomy.json';
const AUDIT_EVIDENCE_FILE = 'tools/test262/es2015-audit-evidence.json';
const SUBSET_FILE = 'tools/test262/upstream-subset.json';
const REPORT_FILE = 'docs/test262-report.jsonl';
const CONFORMANCE_FILE = 'docs/conformance.md';
const FEATURES_FILE = 'tools/test262/features.json';
const P1C_BLOCKER = 'early-errors-and-declaration-instantiation';
const P1C_PATH_PATTERN = /^test\/language\/statements\/try\/.+\.js$/u;
const P1C_COMPARE_ARRAY_INCLUDES = Object.freeze(['compareArray.js']);
const P1C_FEATURE_PROFILE_COUNTS = Object.freeze({
  '[]': 2,
  '["Symbol.iterator","destructuring-binding"]': 8,
  '["Symbol.iterator","destructuring-binding","generators"]': 1,
  '["destructuring-binding"]': 58,
  '["destructuring-binding","generators"]': 11,
  '["let"]': 1,
});
const P1C_EVIDENCE_PATHS = Object.freeze([
  'tools/test262/es2015-p1c-baseline.json',
  'tools/test262/es2015-p1c-disposition.json',
  'tools/test262/es2015-p1c-owner-deltas.json',
  'tools/test262/es2015-p1c-owner-map.json',
  'tools/test262/es2015-p1c-paths.json',
  'tools/test262/es2015-p1c-promotion.json',
]);
const P1C_PROJECT_PATHS = Object.freeze([CONFORMANCE_FILE, REPORT_FILE]);
const P1C_REPLACE_PATHS = Object.freeze([
  AUDIT_EVIDENCE_FILE,
  TAXONOMY_FILE,
  SUBSET_FILE,
]);
const P1C_PROTECTED_OUTPUT_PATHS = Object.freeze([
  ...P1C_PROJECT_PATHS,
  ...P1C_REPLACE_PATHS,
]);

export const P1C_PROMOTION_GROUP = 'es2015/p1c-catch-binding';
export const P1C_ISSUE_NUMBER = 116;
export const P1C_ISSUE_TITLE =
  'Implement ES2015 destructuring catch parameters and catch environments';
export const P1C_PARENT_ISSUE = 78;
export const P1C_PARENT_TITLE =
  'Complete core ES2015 early errors and declaration instantiation';
export const P1C = Object.freeze({
  roots: 81,
  variants: 161,
  sha256: 'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5',
});

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
 * }} P1CClassification
 * @typedef {{
 *   type: 'test',
 *   file: string,
 *   variant: string | null,
 *   status: 'passed' | 'failed' | 'skipped',
 *   reason?: string,
 *   message?: string,
 *   features?: readonly string[],
 * }} P1CExecutionRecord
 * @typedef {{
 *   version: 1,
 *   ledger: { roots: number, variants: number, sha256: string },
 *   records: readonly P1CExecutionRecord[],
 * }} P1CExecution
 * @typedef {{
 *   version: 1,
 *   paths: readonly string[],
 *   records: readonly P1CExecutionRecord[],
 * }} P1CCollateralExecution
 * @typedef {{
 *   buildScratch: boolean,
 *   ledger: string,
 *   execution: string | null,
 *   output: string,
 * }} P1CCliOptions
 */

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** @param {string} left @param {string} right */
function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * @param {readonly string[]} left
 * @param {readonly string[]} right
 * @returns {boolean}
 */
function sameStrings(left, right) {
  return (
    [...left].sort(compareStrings).join('\u0000') ===
    [...right].sort(compareStrings).join('\u0000')
  );
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function parseP1CLedger(text) {
  const paths = text.endsWith('\n')
    ? text.slice(0, -1).split('\n')
    : text.split('\n');
  if (
    paths.length === 0 ||
    paths.some((sourcePath) => !P1C_PATH_PATTERN.test(sourcePath)) ||
    paths.join('\u0000') !== [...paths].sort(compareStrings).join('\u0000') ||
    new Set(paths).size !== paths.length
  ) {
    throw new Error(
      'P1C ledger must contain sorted unique catch-binding Test262 roots',
    );
  }
  return paths;
}

/**
 * @param {string} text
 * @param {{ classifications?: readonly P1CClassification[] }} taxonomy
 * @returns {string[]}
 */
export function verifyP1CLedger(text, taxonomy) {
  const paths = parseP1CLedger(text);
  if (
    paths.length !== P1C.roots ||
    sha256(text) !== P1C.sha256 ||
    !Array.isArray(taxonomy?.classifications)
  ) {
    throw new Error('P1C ledger does not match the reviewed 81-root SHA-256');
  }

  const classifications = new Map(
    taxonomy.classifications.map((entry) => [entry.path, entry]),
  );
  let variants = 0;
  for (const sourcePath of paths) {
    const entry = classifications.get(sourcePath);
    if (
      entry?.partition !== 'core' ||
      entry.status !== `blocked:${P1C_BLOCKER}` ||
      entry.blocker !== P1C_BLOCKER ||
      !Number.isInteger(entry.variants) ||
      entry.variants <= 0 ||
      !Array.isArray(entry.features) ||
      !Array.isArray(entry.flags) ||
      !Array.isArray(entry.includes) ||
      !Array.isArray(entry.provenance)
    ) {
      throw new Error(`P1C BASE classification mismatch: ${sourcePath}`);
    }
    variants += entry.variants;
  }
  if (variants !== P1C.variants) {
    throw new Error('P1C taxonomy variants do not match the reviewed ledger');
  }
  return paths;
}

/**
 * @param {{
 *   ledgerText: string,
 *   taxonomy: { classifications?: readonly P1CClassification[] },
 *   readRoot: (path: string) => Promise<string> | string,
 *   includeDefinitions?: ReadonlyMap<string, unknown> | Record<string, unknown>,
 * }} options
 */
export async function buildP1CInventory(options) {
  if (typeof options.readRoot !== 'function') {
    throw new Error('P1C inventory requires a root reader');
  }
  const paths = verifyP1CLedger(options.ledgerText, options.taxonomy);
  const inventory = buildEs2015Inventory({
    roots: await Promise.all(
      paths.map(async (sourcePath) => ({
        path: sourcePath,
        source: await options.readRoot(sourcePath),
      })),
    ),
    includeDefinitions: options.includeDefinitions,
  });
  validateP1CInventory(inventory, options.taxonomy, paths);
  return inventory;
}

/**
 * @param {{
 *   environment?: Record<string, string | undefined>,
 *   ledgerText?: string,
 *   taxonomy?: any,
 *   pin?: { repository: string, revision: string },
 *   host?: import('./runner.js').Test262Host,
 *   engine?: import('./runner.js').Test262Engine,
 *   supportedFeatures?: readonly string[],
 * }} options
 */
export async function runP1CFocused(options) {
  const environment = options?.environment ?? process.env;
  if (environment.TZ !== 'UTC') {
    throw new Error('Focused P1C Test262 execution requires TZ=UTC');
  }
  const taxonomy =
    /** @type {{ pin: { repository: string, revision: string }, classifications: readonly P1CClassification[] } | undefined } */ (
      options?.taxonomy
    );
  const pin = options?.pin;
  if (
    taxonomy === undefined ||
    pin === undefined ||
    taxonomy.pin.repository !== pin.repository ||
    taxonomy.pin.revision !== pin.revision
  ) {
    throw new Error('P1C taxonomy does not match the pinned Test262 checkout');
  }
  if (options?.host === undefined || options?.engine === undefined) {
    throw new Error('Focused P1C execution requires a Test262 host and engine');
  }

  const ledgerText = options.ledgerText ?? '';
  const paths = verifyP1CLedger(ledgerText, taxonomy);
  const byPath = new Map(
    taxonomy.classifications.map((entry) => [entry.path, entry]),
  );
  const supportedFeatures = new Set(options?.supportedFeatures ?? []);
  const { records } = await runTest262Suite({
    engine: options.engine,
    host: options.host,
    paths,
    supportedFeaturesForPath(file, metadata) {
      const entry = byPath.get(file);
      if (
        entry === undefined ||
        !sameStrings(metadata.features, entry.features) ||
        !sameStrings(metadata.flags, entry.flags) ||
        !sameStrings(metadata.includes, entry.includes)
      ) {
        throw new Error(`P1C metadata drift: ${file}`);
      }
      if (
        options?.supportedFeatures !== undefined &&
        metadata.features.some((feature) => !supportedFeatures.has(feature))
      ) {
        throw new Error(`P1C feature manifest drift: ${file}`);
      }
      return [...metadata.features];
    },
  });
  const document = {
    version: 1,
    ledger: {
      roots: P1C.roots,
      variants: P1C.variants,
      sha256: P1C.sha256,
    },
    records,
  };
  try {
    validateP1CRecords(records, paths, byPath);
  } catch (error) {
    if (error instanceof Error) {
      Object.assign(error, { p1cExecution: document });
    }
    throw error;
  }
  return document;
}

/**
 * @param {{
 *   environment?: Record<string, string | undefined>,
 *   host: import('./runner.js').Test262Host,
 *   engine: import('./runner.js').Test262Engine,
 *   supportedFeatures?: readonly string[],
 * }} options
 * @returns {Promise<P1CCollateralExecution>}
 */
export async function runP1CCollateralFocused(options) {
  const environment = options?.environment ?? process.env;
  if (environment.TZ !== 'UTC') {
    throw new Error('Focused P1C collateral Test262 execution requires TZ=UTC');
  }
  if (options?.host === undefined || options?.engine === undefined) {
    throw new Error(
      'Focused P1C collateral execution requires a Test262 host and engine',
    );
  }

  const byPath = new Map(
    P1C_COLLATERAL_BASE_CLASSIFICATIONS.map((entry) => [entry.path, entry]),
  );
  const supportedFeatures = new Set(options.supportedFeatures ?? []);
  const { records } = await runTest262Suite({
    engine: options.engine,
    host: options.host,
    paths: P1C_COLLATERAL_PATHS,
    supportedFeaturesForPath(file, metadata) {
      const entry = byPath.get(file);
      if (
        entry === undefined ||
        !sameStrings(metadata.features, entry.features) ||
        !sameStrings(metadata.flags, entry.flags) ||
        !sameStrings(metadata.includes, entry.includes)
      ) {
        throw new Error(`P1C collateral metadata drift: ${file}`);
      }
      if (
        options.supportedFeatures !== undefined &&
        metadata.features.some((feature) => !supportedFeatures.has(feature))
      ) {
        throw new Error(`P1C collateral feature manifest drift: ${file}`);
      }
      return [...metadata.features];
    },
    reportFeaturesForPath(file) {
      const entry = byPath.get(file);
      if (entry === undefined) {
        throw new Error(`P1C collateral metadata drift: ${file}`);
      }
      return [...entry.features];
    },
  });
  const document = {
    version: /** @type {const} */ (1),
    paths: P1C_COLLATERAL_PATHS,
    records,
  };
  validateP1CCollateralExecution(document);
  return document;
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
export function buildP1CAuthorityEvidence(options) {
  const taxonomy =
    /** @type {{ pin: { repository: string, revision: string }, classifications: P1CClassification[] }} */ (
      JSON.parse(options.taxonomyText)
    );
  const paths = verifyP1CLedger(options.ledgerText, taxonomy);
  const byPath = new Map(
    taxonomy.classifications.map((entry) => [entry.path, entry]),
  );
  const inventoryByPath = new Map(
    options.inventory.map((entry) => [entry.path, entry]),
  );
  if (inventoryByPath.size !== options.inventory.length) {
    throw new Error('P1C pinned inventory repeats a root');
  }
  const baseline = paths.map((sourcePath) => {
    const entry = byPath.get(sourcePath);
    if (entry === undefined) {
      throw new Error(`P1C taxonomy lacks reviewed root: ${sourcePath}`);
    }
    return entry;
  });
  const executionByPath = validateP1CExecution(options.execution, baseline);
  const destinations = paths.map((sourcePath) =>
    p1cDestination(
      sourcePath,
      (executionByPath.get(sourcePath) ?? []).every(
        (record) => record.status === 'passed',
      ),
    ),
  );
  const disposition = { destinations };
  if (
    options.disposition !== undefined &&
    JSON.stringify(options.disposition) !== JSON.stringify(disposition)
  ) {
    throw new Error('P1C disposition does not match the reviewed outcome');
  }
  const entries = paths.map((sourcePath) => {
    const entry = byPath.get(sourcePath);
    const inventoryRoot = inventoryByPath.get(sourcePath);
    if (
      entry === undefined ||
      inventoryRoot === undefined ||
      inventoryRoot.metadata === null ||
      !sameStrings(inventoryRoot.metadata.features, entry.features) ||
      !sameStrings(inventoryRoot.metadata.includes, entry.includes) ||
      inventoryRoot.includeFeatures.length !== 0
    ) {
      throw new Error(`P1C pinned inventory drift: ${sourcePath}`);
    }
    return {
      path: sourcePath,
      variants: entry.variants,
      features: [...inventoryRoot.metadata.features],
      includeFeatures: [...inventoryRoot.includeFeatures],
    };
  });
  const promotion = {
    groupName: P1C_PROMOTION_GROUP,
    version: 2,
    repository: taxonomy.pin.repository,
    revision: taxonomy.pin.revision,
    sourceTaxonomySha256: sha256(options.taxonomyText),
    ledgerSha256: sha256(options.ledgerText),
    rootCount: entries.length,
    variantCount: entries.reduce((total, entry) => total + entry.variants, 0),
    entries,
  };
  parseEs2015Promotion(JSON.stringify(promotion));
  return {
    paths,
    baseline,
    disposition,
    ownerDeltas: [],
    ownerMap: [],
    promotion,
  };
}

/**
 * @param {{
 *   taxonomyText: string,
 *   auditEvidenceText: string,
 *   subsetText: string,
 *   evidence: ReturnType<typeof buildP1CAuthorityEvidence>,
 *   execution: any,
 *   collateralExecution: P1CCollateralExecution,
 *   inventory: readonly any[],
 * }} options
 */
export function projectP1CCoreOutputs(options) {
  const collateralRecords = validateP1CCollateralExecution(
    options.collateralExecution,
  ).map((record) =>
    createTestRecord({
      file: record.file,
      variant: record.variant,
      status: 'failed',
    }),
  );
  const expectedEvidence = buildP1CAuthorityEvidence({
    ledgerText: `${options.evidence.paths.join('\n')}\n`,
    taxonomyText: options.taxonomyText,
    execution: options.execution,
    inventory: options.inventory,
  });
  if (JSON.stringify(options.evidence) !== JSON.stringify(expectedEvidence)) {
    throw new Error('P1C projection requires exact authority evidence');
  }
  const executionByPath = validateP1CExecution(
    options.execution,
    options.evidence.baseline,
  );
  /** @type {Map<string, P1CExecutionRecord>} */
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
    /** @type {{ version: number, repository: string, revision: string, auditRecords: P1CExecutionRecord[], blockers: Record<string, string>, intentionalDeviations: readonly string[] }} */ (
      JSON.parse(options.auditEvidenceText)
    );
  const collateralPathSet = new Set(P1C_COLLATERAL_PATHS);
  if (
    baseAudit.auditRecords.some((record) =>
      collateralPathSet.has(record.file),
    ) ||
    P1C_COLLATERAL_PATHS.some((sourcePath) =>
      Object.prototype.hasOwnProperty.call(baseAudit.blockers, sourcePath),
    )
  ) {
    throw new Error('P1C collateral audit requires an unmodified BASE');
  }
  const consumedExecution = new Set();
  const auditRecords = [
    ...baseAudit.auditRecords.map((record) => {
      const key = `${record.file}\u0000${record.variant ?? ''}`;
      const execution = executionByKey.get(key);
      if (execution === undefined) return record;
      consumedExecution.add(key);
      return execution;
    }),
    ...collateralRecords,
  ].sort((left, right) =>
    compareStrings(
      `${left.file}\u0000${left.variant ?? ''}`,
      `${right.file}\u0000${right.variant ?? ''}`,
    ),
  );
  if (consumedExecution.size !== P1C.variants) {
    throw new Error('P1C audit projection lacks exact BASE audit variants');
  }
  const blockers = Object.fromEntries(
    [
      ...Object.entries(baseAudit.blockers).filter(
        ([sourcePath]) =>
          !options.evidence.disposition.destinations.some(
            (destination) => destination.path === sourcePath,
          ),
      ),
      ...P1C_COLLATERAL_PATHS.map((sourcePath) => [sourcePath, P1C_BLOCKER]),
    ].sort(([left], [right]) => compareStrings(left, right)),
  );
  const auditEvidenceText = renderP1CJson({
    version: baseAudit.version,
    repository: baseAudit.repository,
    revision: baseAudit.revision,
    auditRecords,
    blockers,
    intentionalDeviations: baseAudit.intentionalDeviations,
  });

  const promotionText = renderP1CJson(options.evidence.promotion);
  const baseSubset = parseUpstreamSubset(options.subsetText);
  const collateralSubsetCounts = new Map(
    P1C_COLLATERAL_PATHS.map((sourcePath) => [sourcePath, 0]),
  );
  const correctedBaseSubset = {
    ...baseSubset,
    groups: baseSubset.groups.map((group) => ({
      ...group,
      paths: group.paths.filter((sourcePath) => {
        if (!collateralSubsetCounts.has(sourcePath)) return true;
        if (group.name !== 'language/expressions') {
          throw new Error(
            `P1C collateral subset path has the wrong group: ${sourcePath}`,
          );
        }
        collateralSubsetCounts.set(
          sourcePath,
          (collateralSubsetCounts.get(sourcePath) ?? 0) + 1,
        );
        return false;
      }),
    })),
  };
  for (const [sourcePath, count] of collateralSubsetCounts) {
    if (count !== 1) {
      throw new Error(
        `P1C collateral subset requires one BASE path: ${sourcePath}`,
      );
    }
  }
  const subsetText = serializeUpstreamSubset(
    mergePromotionSubset(
      correctedBaseSubset,
      parseEs2015Promotion(promotionText),
    ),
  );
  const baseTaxonomy =
    /** @type {Record<string, any> & { classifications: P1CClassification[], inputs: Record<string, string> }} */ (
      JSON.parse(options.taxonomyText)
    );
  const destinations = new Map(
    options.evidence.disposition.destinations.map((entry) => [
      entry.path,
      entry,
    ]),
  );
  const baselineByPath = new Map(
    options.evidence.baseline.map((entry) => [entry.path, entry]),
  );
  const collateralBaseByPath = new Map(
    P1C_COLLATERAL_BASE_CLASSIFICATIONS.map((entry) => [entry.path, entry]),
  );
  const collateralBlockedByPath = new Map(
    P1C_COLLATERAL_BLOCKED_CLASSIFICATIONS.map((entry) => [entry.path, entry]),
  );
  const consumedCollateralClassifications = new Set();
  const classifications = baseTaxonomy.classifications.map((entry) => {
    const collateralBase = collateralBaseByPath.get(entry.path);
    if (collateralBase !== undefined) {
      if (JSON.stringify(entry) !== JSON.stringify(collateralBase)) {
        throw new Error(
          `P1C collateral BASE classification mismatch: ${entry.path}`,
        );
      }
      consumedCollateralClassifications.add(entry.path);
      const blocked = collateralBlockedByPath.get(entry.path);
      if (blocked === undefined) {
        throw new Error(
          `P1C collateral blocked classification missing: ${entry.path}`,
        );
      }
      return blocked;
    }
    const destination = destinations.get(entry.path);
    if (destination === undefined) return entry;
    if (
      JSON.stringify(stableP1CClassification(entry)) !==
      JSON.stringify(stableP1CClassification(baselineByPath.get(entry.path)))
    ) {
      throw new Error(
        `P1C baseline does not match BASE taxonomy: ${entry.path}`,
      );
    }
    return {
      ...entry,
      status: destination.status,
      blocker: null,
    };
  });
  if (consumedCollateralClassifications.size !== P1C_COLLATERAL_PATHS.length) {
    throw new Error(
      'P1C collateral taxonomy does not contain the exact four BASE paths',
    );
  }
  return {
    taxonomyText: renderP1CJson({
      ...baseTaxonomy,
      summary: summarizeEs2015Classification(classifications),
      statusTables: p1cStatusTables(classifications),
      classifications,
    }),
    auditEvidenceText,
    subsetText,
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
export function buildP1CReportArtifacts(options) {
  const subset = parseUpstreamSubset(options.subsetText);
  const selectedPaths = upstreamSubsetPaths(subset);
  const selected = new Set(selectedPaths);
  const taxonomy = /** @type {{ classifications: P1CClassification[] }} */ (
    JSON.parse(options.taxonomyText)
  );
  const taxonomyByPath = new Map(
    taxonomy.classifications.map((entry) => [entry.path, entry]),
  );
  const promotion = parseEs2015Promotion(options.promotionText);
  if (
    !('groupName' in promotion) ||
    promotion.groupName !== P1C_PROMOTION_GROUP ||
    promotion.rootCount !== P1C.roots ||
    promotion.variantCount !== P1C.variants
  ) {
    throw new Error('P1C report projection requires the exact promotion');
  }
  const promotedPaths = promotionPaths(promotion);
  const promoted = new Set(promotedPaths);
  const groups = subset.groups.filter(
    (entry) => entry.name === P1C_PROMOTION_GROUP,
  );
  if (
    groups.length !== 1 ||
    groups[0].paths.join('\u0000') !== promotedPaths.join('\u0000')
  ) {
    throw new Error('P1C report projection requires the exact subset group');
  }

  const report = parseP1CReport(options.reportText);
  const baseRecordsByPath = groupP1CRecords(
    report.records.filter(
      (record) => !promoted.has(record.file) && selected.has(record.file),
    ),
    'BASE report',
  );
  const collateralRecordsByPath = groupP1CRecords(
    report.records.filter((record) =>
      P1C_COLLATERAL_PATHS.includes(record.file),
    ),
    'P1C collateral BASE report',
  );
  for (const sourcePath of P1C_COLLATERAL_PATHS) {
    const records = collateralRecordsByPath.get(sourcePath);
    if (
      records?.length !== 2 ||
      records[0].variant !== 'non-strict' ||
      records[1].variant !== 'strict' ||
      records.some(
        (record) =>
          record.status !== 'passed' ||
          JSON.stringify(record.features) !==
            '["destructuring-binding","default-parameters"]',
      )
    ) {
      throw new Error(`P1C collateral BASE report mismatch: ${sourcePath}`);
    }
  }
  for (const record of report.records) {
    if (
      !selected.has(record.file) &&
      !promoted.has(record.file) &&
      !P1C_COLLATERAL_PATHS.includes(record.file)
    ) {
      throw new Error(`P1C BASE report names a foreign root: ${record.file}`);
    }
  }

  const audit = /** @type {{ auditRecords: P1CExecutionRecord[] }} */ (
    JSON.parse(options.auditEvidenceText)
  );
  const promotionByPath = new Map(
    promotion.entries.map((entry) => [entry.path, entry]),
  );
  const promotedRecordsByPath = groupP1CRecords(
    audit.auditRecords
      .filter((record) => promoted.has(record.file))
      .map((record) => {
        const entry = promotionByPath.get(record.file);
        if (entry === undefined || record.status !== 'passed') {
          throw new Error(
            `P1C report promotion requires passing audit evidence: ${record.file}`,
          );
        }
        return createTestRecord({
          file: record.file,
          variant: record.variant,
          status: record.status,
          features: entry.features,
        });
      }),
    'P1C promotion audit evidence',
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
        `P1C report projection lacks exact selected variants: ${sourcePath}`,
      );
    }
    records.push(...sourceRecords);
  }
  const projectedRecordCount = [
    ...baseRecordsByPath.values(),
    ...promotedRecordsByPath.values(),
  ].reduce((total, entries) => total + entries.length, 0);
  if (records.length !== projectedRecordCount) {
    throw new Error('P1C report projection contains foreign selected records');
  }

  const summary = createSummaryRecord(records);
  const variants = new Map(
    [...groupP1CRecords(records, 'projected report')].map(
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
    reportPath: REPORT_FILE,
    reportLinkPath: 'test262-report.jsonl',
  });
  return {
    reportText,
    conformanceText: replaceGeneratedBlock(options.conformanceText, block),
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
export function buildP1CPendingAuthority(options) {
  requireExactTextPaths(
    options.evidenceTexts,
    P1C_EVIDENCE_PATHS,
    'P1C evidence texts',
  );
  requireExactTextPaths(
    options.baseOutputs,
    P1C_PROTECTED_OUTPUT_PATHS,
    'P1C BASE protected outputs',
  );
  requireExactTextPaths(
    options.projectedOutputs,
    P1C_PROTECTED_OUTPUT_PATHS,
    'P1C projected protected outputs',
  );
  if (options.baseOutputs[TAXONOMY_FILE] !== options.baseTaxonomyText) {
    throw new Error('P1C authority BASE taxonomy bytes are inconsistent');
  }

  const evidence = P1C_EVIDENCE_PATHS.map((sourcePath) => ({
    path: sourcePath,
    sha256: sha256(options.evidenceTexts[sourcePath]),
  }));
  const promotionSha256 = sha256(
    options.evidenceTexts['tools/test262/es2015-p1c-promotion.json'],
  );
  const ownerDeltasSha256 = sha256(
    options.evidenceTexts['tools/test262/es2015-p1c-owner-deltas.json'],
  );
  const protectedOutputs = [
    ...P1C_PROJECT_PATHS.map((sourcePath) => {
      const baseSha256 = sha256(options.baseOutputs[sourcePath]);
      const headSha256 = sha256(options.projectedOutputs[sourcePath]);
      if (baseSha256 === headSha256) {
        throw new Error(`P1C protected projection is empty: ${sourcePath}`);
      }
      return {
        path: sourcePath,
        operation: 'project',
        baseSha256,
        headSha256: null,
        projectionSha256: sha256(
          `${sourcePath}\u0000${P1C.sha256}\u0000${promotionSha256}\u0000${ownerDeltasSha256}\u0000`,
        ),
      };
    }),
    ...P1C_REPLACE_PATHS.map((sourcePath) => {
      const baseSha256 = sha256(options.baseOutputs[sourcePath]);
      const headSha256 = sha256(options.projectedOutputs[sourcePath]);
      if (baseSha256 === headSha256) {
        throw new Error(`P1C protected replacement is empty: ${sourcePath}`);
      }
      return {
        path: sourcePath,
        operation: 'replace-exact',
        baseSha256,
        headSha256,
        projectionSha256: null,
      };
    }),
    ...evidence.map((entry) => ({
      path: entry.path,
      operation: 'add-exact',
      baseSha256: null,
      headSha256: entry.sha256,
      projectionSha256: null,
    })),
  ].sort((left, right) => compareStrings(left.path, right.path));
  return {
    code: 'P1C',
    issue: P1C_ISSUE_NUMBER,
    parentIssue: 70,
    state: 'pending',
    source: {
      baseTaxonomySha256: sha256(options.baseTaxonomyText),
      rootCount: P1C.roots,
      variantCount: P1C.variants,
      pathSha256: P1C.sha256,
      entryLedgerSha256: null,
    },
    reconciliation: null,
    evidence,
    protectedOutputs,
    destinations: [
      {
        status: 'selected-passing',
        blocker: null,
        issue: P1C_ISSUE_NUMBER,
      },
    ],
  };
}

/**
 * @param {URL} repositoryRootUrl
 * @param {string} outputPath
 */
export async function resolveP1COutputPath(repositoryRootUrl, outputPath) {
  if (
    typeof outputPath !== 'string' ||
    outputPath === '' ||
    path.isAbsolute(outputPath) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(outputPath)
  ) {
    throw new Error('P1C output path must be repository-relative');
  }
  const root = await realpath(fileURLToPath(repositoryRootUrl));
  const candidate = path.resolve(root, outputPath);
  assertInsideRepository(root, candidate, outputPath);
  const parent = path.dirname(candidate);
  await mkdir(parent, { recursive: true });
  const physicalParent = await realpath(parent);
  assertInsideRepository(root, physicalParent, outputPath);
  const target = path.join(physicalParent, path.basename(candidate));
  try {
    const stat = await lstat(target);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`P1C output path ${outputPath} must be a regular file`);
    }
  } catch (error) {
    if (/** @type {any} */ (error)?.code !== 'ENOENT') {
      throw error;
    }
  }
  return target;
}

/**
 * @param {readonly string[]} argv
 * @param {{
 *   environment?: Record<string, string | undefined>,
 *   readPin?: () => Promise<{ repository: string, revision: string, checkoutPath: string }>,
 *   assertPinnedCheckout?: (pin: { repository: string, revision: string, checkoutPath: string }) => Promise<void>,
 *   readRoot?: (path: string) => Promise<string>,
 *   readIncludeDefinitions?: () => Promise<ReadonlyMap<string, unknown> | Record<string, unknown>>,
 *   runCollateralFocused?: typeof runP1CCollateralFocused,
 * }} [dependencies]
 */
export async function main(argv = [], dependencies = {}) {
  const options = parseP1COptions(argv);
  const environment = dependencies.environment ?? process.env;
  if (environment.TZ !== 'UTC') {
    throw new Error('Focused P1C Test262 tooling requires TZ=UTC');
  }
  return options.buildScratch
    ? buildP1CScratch(options, dependencies)
    : executeP1CCorpus(options, environment);
}

/**
 * @param {readonly string[]} argv
 * @returns {P1CCliOptions}
 */
function parseP1COptions(argv) {
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
      throw new Error(`Unknown P1C option: ${argument}`);
    }
  }
  if (ledger === null || ledger === '' || output === null || output === '') {
    throw new Error('P1C tooling requires --ledger and --output');
  }
  if (buildScratch) {
    if (execution === null || execution === '') {
      throw new Error('P1C build-scratch requires --execution');
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
async function executeP1CCorpus(options, environment) {
  const [ledgerPath, taxonomyPath, featuresPath, outputPath] =
    await Promise.all([
      resolveP1CInputPath(REPOSITORY_ROOT_URL, options.ledger),
      resolveP1CInputPath(REPOSITORY_ROOT_URL, TAXONOMY_FILE),
      resolveP1CInputPath(REPOSITORY_ROOT_URL, FEATURES_FILE),
      resolveP1COutputPath(REPOSITORY_ROOT_URL, options.output),
    ]);
  const pin = await readTest262Pin(REPOSITORY_ROOT_URL);
  await assertPinnedCheckout(pin, REPOSITORY_ROOT_URL);
  const [ledgerText, taxonomyText, featuresText] = await Promise.all([
    readFile(ledgerPath, 'utf8'),
    readFile(taxonomyPath, 'utf8'),
    readFile(featuresPath, 'utf8'),
  ]);
  const taxonomy = JSON.parse(taxonomyText);
  const supportedFeatures = featureNames(parseFeatureManifest(featuresText));
  const host = createNodeTest262Host({
    root: new URL(
      `${pin.checkoutPath.replace(/\/$/u, '')}/`,
      REPOSITORY_ROOT_URL,
    ),
  });
  const includeDefinitions = await readTest262HarnessDefinitions(
    pin.checkoutPath,
    REPOSITORY_ROOT_URL,
  );
  await buildP1CInventory({
    ledgerText,
    taxonomy,
    readRoot: (sourcePath) => host.readTest(sourcePath),
    includeDefinitions,
  });
  let document;
  try {
    document = await runP1CFocused({
      environment,
      ledgerText,
      taxonomy,
      pin,
      host,
      engine: createJsjsTest262Engine(),
      supportedFeatures,
    });
  } catch (error) {
    const failedDocument = /** @type {any} */ (error)?.p1cExecution;
    if (failedDocument === undefined) throw error;
    await writeP1CFileAtomically(outputPath, renderP1CJson(failedDocument));
    writeP1CExecutionSummary(failedDocument);
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
  await writeP1CFileAtomically(outputPath, renderP1CJson(document));
  writeP1CExecutionSummary(document);
  return 0;
}

/** @param {any} document */
function writeP1CExecutionSummary(document) {
  const byPath = groupP1CRecords(document.records, 'P1C execution summary');
  const completePassRoots = [...byPath.values()].filter((records) =>
    records.every((record) => record.status === 'passed'),
  ).length;
  const completePassVariants = [...byPath.values()]
    .filter((records) => records.every((record) => record.status === 'passed'))
    .reduce((total, records) => total + records.length, 0);
  process.stdout.write(
    `P1C focused Test262: ${document.ledger.roots} roots / ${document.ledger.variants} variants; ${completePassRoots} complete-pass roots / ${completePassVariants} variants; ${document.ledger.roots - completePassRoots} residual roots / ${document.ledger.variants - completePassVariants} variants\n`,
  );
}

/**
 * @param {{ ledger: string, execution: string | null, output: string }} options
 * @param {{
 *   readPin?: () => Promise<{ repository: string, revision: string, checkoutPath: string }>,
 *   assertPinnedCheckout?: (pin: { repository: string, revision: string, checkoutPath: string }) => Promise<void>,
 *   readRoot?: (path: string) => Promise<string>,
 *   readIncludeDefinitions?: () => Promise<ReadonlyMap<string, unknown> | Record<string, unknown>>,
 *   environment?: Record<string, string | undefined>,
 *   runCollateralFocused?: typeof runP1CCollateralFocused,
 * }} dependencies
 */
async function buildP1CScratch(options, dependencies) {
  if (options.execution === null) {
    throw new Error('P1C build-scratch requires execution evidence');
  }
  const [
    ledgerPath,
    executionPath,
    taxonomyPath,
    auditPath,
    subsetPath,
    reportPath,
    conformancePath,
    featuresPath,
    scratchRoot,
  ] = await Promise.all([
    resolveP1CInputPath(REPOSITORY_ROOT_URL, options.ledger),
    resolveP1CInputPath(REPOSITORY_ROOT_URL, options.execution),
    resolveP1CInputPath(REPOSITORY_ROOT_URL, TAXONOMY_FILE),
    resolveP1CInputPath(REPOSITORY_ROOT_URL, AUDIT_EVIDENCE_FILE),
    resolveP1CInputPath(REPOSITORY_ROOT_URL, SUBSET_FILE),
    resolveP1CInputPath(REPOSITORY_ROOT_URL, REPORT_FILE),
    resolveP1CInputPath(REPOSITORY_ROOT_URL, CONFORMANCE_FILE),
    resolveP1CInputPath(REPOSITORY_ROOT_URL, FEATURES_FILE),
    resolveP1CScratchRoot(REPOSITORY_ROOT_URL, options.output),
  ]);
  const [
    ledgerText,
    executionText,
    taxonomyText,
    auditEvidenceText,
    subsetText,
    reportText,
    conformanceText,
    featuresText,
  ] = await Promise.all([
    readFile(ledgerPath, 'utf8'),
    readFile(executionPath, 'utf8'),
    readFile(taxonomyPath, 'utf8'),
    readFile(auditPath, 'utf8'),
    readFile(subsetPath, 'utf8'),
    readFile(reportPath, 'utf8'),
    readFile(conformancePath, 'utf8'),
    readFile(featuresPath, 'utf8'),
  ]);
  const execution = JSON.parse(executionText);
  const taxonomy = JSON.parse(taxonomyText);
  const pin = await (
    dependencies.readPin ?? (() => readTest262Pin(REPOSITORY_ROOT_URL))
  )();
  if (
    taxonomy?.pin?.repository !== pin.repository ||
    taxonomy?.pin?.revision !== pin.revision
  ) {
    throw new Error('P1C taxonomy does not match the pinned Test262 checkout');
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
  const engine = createJsjsTest262Engine();
  const readRoot =
    dependencies.readRoot ?? ((sourcePath) => host.readTest(sourcePath));
  const readIncludeDefinitions =
    dependencies.readIncludeDefinitions ??
    (() =>
      readTest262HarnessDefinitions(pin.checkoutPath, REPOSITORY_ROOT_URL));
  const inventory = await buildP1CInventory({
    ledgerText,
    taxonomy,
    readRoot,
    includeDefinitions: await readIncludeDefinitions(),
  });
  const collateralExecution = await (
    dependencies.runCollateralFocused ?? runP1CCollateralFocused
  )({
    environment: dependencies.environment ?? process.env,
    host,
    engine,
    supportedFeatures: featureNames(parseFeatureManifest(featuresText)),
  });
  const evidence = buildP1CAuthorityEvidence({
    ledgerText,
    taxonomyText,
    execution,
    inventory,
  });
  const projectedCore = projectP1CCoreOutputs({
    taxonomyText,
    auditEvidenceText,
    subsetText,
    evidence,
    execution,
    collateralExecution,
    inventory,
  });
  const reportArtifacts = buildP1CReportArtifacts({
    reportText,
    conformanceText,
    subsetText: projectedCore.subsetText,
    taxonomyText: projectedCore.taxonomyText,
    auditEvidenceText: projectedCore.auditEvidenceText,
    promotionText: renderP1CJson(evidence.promotion),
    featuresText,
  });
  const projectedTaxonomyText = finalizeP1CTaxonomyProjection({
    taxonomyText: projectedCore.taxonomyText,
    subsetText: projectedCore.subsetText,
    reportText: reportArtifacts.reportText,
    auditEvidenceText: projectedCore.auditEvidenceText,
  });
  const evidenceTexts = buildP1CEvidenceTexts(evidence);
  const authority = buildP1CPendingAuthority({
    baseTaxonomyText: taxonomyText,
    evidenceTexts,
    baseOutputs: {
      [CONFORMANCE_FILE]: conformanceText,
      [REPORT_FILE]: reportText,
      [AUDIT_EVIDENCE_FILE]: auditEvidenceText,
      [TAXONOMY_FILE]: taxonomyText,
      [SUBSET_FILE]: subsetText,
    },
    projectedOutputs: {
      [CONFORMANCE_FILE]: reportArtifacts.conformanceText,
      [REPORT_FILE]: reportArtifacts.reportText,
      [AUDIT_EVIDENCE_FILE]: projectedCore.auditEvidenceText,
      [TAXONOMY_FILE]: projectedTaxonomyText,
      [SUBSET_FILE]: projectedCore.subsetText,
    },
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
      'evidence/es2015-p1c-paths.json',
      evidenceTexts['tools/test262/es2015-p1c-paths.json'],
    ],
    [
      'evidence/es2015-p1c-baseline.json',
      evidenceTexts['tools/test262/es2015-p1c-baseline.json'],
    ],
    [
      'evidence/es2015-p1c-disposition.json',
      evidenceTexts['tools/test262/es2015-p1c-disposition.json'],
    ],
    [
      'evidence/es2015-p1c-owner-deltas.json',
      evidenceTexts['tools/test262/es2015-p1c-owner-deltas.json'],
    ],
    [
      'evidence/es2015-p1c-owner-map.json',
      evidenceTexts['tools/test262/es2015-p1c-owner-map.json'],
    ],
    [
      'evidence/es2015-p1c-promotion.json',
      evidenceTexts['tools/test262/es2015-p1c-promotion.json'],
    ],
    ['projected/docs/conformance.md', reportArtifacts.conformanceText],
    ['projected/docs/test262-report.jsonl', reportArtifacts.reportText],
    [
      'projected/tools/test262/es2015-audit-evidence.json',
      projectedCore.auditEvidenceText,
    ],
    ['projected/tools/test262/es2015-taxonomy.json', projectedTaxonomyText],
    ['projected/tools/test262/upstream-subset.json', projectedCore.subsetText],
    ['authority-record.json', renderP1CJson(authority)],
    ['collateral-execution.json', renderP1CJson(collateralExecution)],
    ['protected-projection.json', renderP1CJson(protectedProjection)],
  ]);
  const byPath = groupP1CRecords(execution.records, 'P1C scratch execution');
  const completePassRoots = [...byPath.values()].filter((records) =>
    records.every((record) => record.status === 'passed'),
  ).length;
  const completePassVariants = [...byPath.values()]
    .filter((records) => records.every((record) => record.status === 'passed'))
    .reduce((total, records) => total + records.length, 0);
  const fileSha256 = Object.fromEntries(
    [...files]
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([file, text]) => [file, sha256(text)]),
  );
  const summary = {
    version: 1,
    ledger: {
      roots: P1C.roots,
      variants: P1C.variants,
      sha256: P1C.sha256,
    },
    outcome: {
      completePassRoots,
      completePassVariants,
      residualRoots: P1C.roots - completePassRoots,
      residualVariants: P1C.variants - completePassVariants,
    },
    collateral: {
      roots: P1C_COLLATERAL_PATHS.length,
      variants: collateralExecution.records.length,
      failed: collateralExecution.records.filter(
        (record) => record.status === 'failed',
      ).length,
      sha256: sha256(renderP1CJson(collateralExecution)),
    },
    authoritySha256: sha256(`${JSON.stringify(authority)}\n`),
    protectedProjectionSha256,
    fileSha256,
  };
  files.set('summary.json', renderP1CJson(summary));
  await writeP1CScratchBundle(scratchRoot, files);
  process.stdout.write(
    `P1C scratch evidence: ${P1C.roots} roots / ${P1C.variants} variants; ${completePassRoots} complete-pass roots / ${completePassVariants} variants; ${P1C.roots - completePassRoots} residual roots / ${P1C.variants - completePassVariants} variants\n`,
  );
  return 0;
}

/**
 * @param {ReturnType<typeof buildP1CAuthorityEvidence>} evidence
 * @returns {Record<string, string>}
 */
function buildP1CEvidenceTexts(evidence) {
  return {
    'tools/test262/es2015-p1c-paths.json': renderP1CJson(evidence.paths),
    'tools/test262/es2015-p1c-baseline.json': renderP1CJson(evidence.baseline),
    'tools/test262/es2015-p1c-disposition.json': renderP1CJson(
      evidence.disposition,
    ),
    'tools/test262/es2015-p1c-owner-deltas.json': renderP1CJson(
      evidence.ownerDeltas,
    ),
    'tools/test262/es2015-p1c-owner-map.json': renderP1CJson(evidence.ownerMap),
    'tools/test262/es2015-p1c-promotion.json': renderP1CJson(
      evidence.promotion,
    ),
  };
}

/**
 * @param {{
 *   taxonomyText: string,
 *   subsetText: string,
 *   reportText: string,
 *   auditEvidenceText: string,
 * }} options
 */
function finalizeP1CTaxonomyProjection(options) {
  const taxonomy =
    /** @type {Record<string, any> & { inputs: Record<string, string> }} */ (
      JSON.parse(options.taxonomyText)
    );
  return renderP1CJson({
    ...taxonomy,
    inputs: {
      ...taxonomy.inputs,
      subsetSha256: sha256(options.subsetText),
      selectedEvidenceSha256: sha256(options.reportText),
      auditEvidenceSha256: sha256(options.auditEvidenceText),
    },
  });
}

/**
 * @param {readonly any[]} inventory
 * @param {{ classifications?: readonly P1CClassification[] }} taxonomy
 * @param {readonly string[]} paths
 */
function validateP1CInventory(inventory, taxonomy, paths) {
  if (
    inventory.length !== P1C.roots ||
    !Array.isArray(taxonomy.classifications)
  ) {
    throw new Error(
      'P1C pinned inventory does not cover the exact reviewed roots',
    );
  }
  const byPath = new Map(
    taxonomy.classifications.map((entry) => [entry.path, entry]),
  );
  let variants = 0;
  let compareArrayRoots = 0;
  let noStrictRoots = 0;
  let dualVariantRoots = 0;
  const featureCounts = new Map();

  for (let index = 0; index < paths.length; index += 1) {
    const sourcePath = paths[index];
    const root = inventory[index];
    const entry = byPath.get(sourcePath);
    if (
      entry === undefined ||
      root?.path !== sourcePath ||
      root.metadata === null ||
      root.metadataError !== null
    ) {
      throw new Error(`P1C pinned inventory drift: ${sourcePath}`);
    }
    if (
      root.variants !== entry.variants ||
      !sameStrings(root.metadata.features, entry.features) ||
      !sameStrings(root.metadata.flags, entry.flags) ||
      !sameStrings(root.metadata.includes, entry.includes)
    ) {
      throw new Error(`P1C pinned inventory drift: ${sourcePath}`);
    }
    if (root.includeFeatures.length !== 0) {
      throw new Error(`P1C include-feature closure drift: ${sourcePath}`);
    }

    variants += root.variants;
    if (sameStrings(root.metadata.includes, P1C_COMPARE_ARRAY_INCLUDES)) {
      compareArrayRoots += 1;
    } else if (root.metadata.includes.length !== 0) {
      throw new Error(`P1C pinned inventory includes drift: ${sourcePath}`);
    }
    if (sameStrings(root.metadata.flags, ['noStrict'])) {
      noStrictRoots += 1;
    }
    if (root.variants === 2) {
      dualVariantRoots += 1;
    }
    const key = JSON.stringify(root.metadata.features);
    featureCounts.set(key, (featureCounts.get(key) ?? 0) + 1);
  }
  if (variants !== P1C.variants) {
    throw new Error(
      'P1C pinned inventory variants do not match the reviewed ledger',
    );
  }
  if (compareArrayRoots !== 1) {
    throw new Error('P1C pinned inventory compareArray.js count drifted');
  }
  if (noStrictRoots !== 1 || dualVariantRoots !== 80) {
    throw new Error('P1C pinned inventory strict/non-strict shape drifted');
  }
  if (!sameExactCounts(featureCounts, P1C_FEATURE_PROFILE_COUNTS)) {
    throw new Error('P1C pinned inventory feature counts drifted');
  }
}

/**
 * @param {readonly P1CExecutionRecord[]} records
 * @param {readonly string[]} paths
 * @param {ReadonlyMap<string, P1CClassification>} classifications
 * @returns {Map<string, P1CExecutionRecord[]>}
 */
function validateP1CRecords(records, paths, classifications) {
  /** @type {Map<string, P1CExecutionRecord[]>} */
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
      throw new Error('P1C execution returned a foreign or duplicate record');
    }
    if (record.status === 'skipped') {
      throw new Error(`P1C execution skipped ${record.file}`);
    }
    keys.add(key);
    pathRecords.push(record);
  }
  for (const sourcePath of paths) {
    const classification = classifications.get(sourcePath);
    const pathRecords = recordsByPath.get(sourcePath) ?? [];
    if (pathRecords.length !== classification?.variants) {
      throw new Error(`P1C execution lacks exact variants: ${sourcePath}`);
    }
    if (pathRecords.some((record) => record.status !== 'passed')) {
      throw new Error(`P1C root did not completely pass: ${sourcePath}`);
    }
  }
  if (records.length !== P1C.variants) {
    throw new Error('P1C execution does not cover all 161 reviewed variants');
  }
  return recordsByPath;
}

/**
 * @param {P1CExecution} execution
 * @param {readonly P1CClassification[]} baseline
 * @returns {Map<string, P1CExecutionRecord[]>}
 */
function validateP1CExecution(execution, baseline) {
  if (
    execution?.version !== 1 ||
    execution?.ledger?.roots !== P1C.roots ||
    execution?.ledger?.variants !== P1C.variants ||
    execution?.ledger?.sha256 !== P1C.sha256 ||
    !Array.isArray(execution?.records)
  ) {
    throw new Error('P1C execution evidence has the wrong reviewed identity');
  }
  const paths = baseline.map((entry) => entry.path);
  const classifications = new Map(baseline.map((entry) => [entry.path, entry]));
  return validateP1CRecords(execution.records, paths, classifications);
}

/**
 * @param {P1CCollateralExecution} execution
 * @returns {readonly P1CExecutionRecord[]}
 */
function validateP1CCollateralExecution(execution) {
  if (
    execution?.version !== 1 ||
    !Array.isArray(execution?.paths) ||
    JSON.stringify(execution.paths) !== JSON.stringify(P1C_COLLATERAL_PATHS) ||
    !Array.isArray(execution?.records) ||
    execution.records.length !== P1C_COLLATERAL_PATHS.length * 2
  ) {
    throw new Error('P1C collateral execution has the wrong exact identity');
  }
  const variants = ['non-strict', 'strict'];
  for (let index = 0; index < execution.records.length; index += 1) {
    const record = execution.records[index];
    const sourcePath = P1C_COLLATERAL_PATHS[Math.floor(index / 2)];
    const variant = variants[index % 2];
    const classification =
      P1C_COLLATERAL_BASE_CLASSIFICATIONS[Math.floor(index / 2)];
    if (
      record?.type !== 'test' ||
      record.file !== sourcePath ||
      record.variant !== variant ||
      record.status !== 'failed' ||
      record.reason !== 'parse-error' ||
      record.message !==
        'SyntaxError: rest elements are not supported in this context' ||
      JSON.stringify(record.features) !==
        JSON.stringify(classification.features)
    ) {
      throw new Error(
        `P1C collateral execution drift: ${sourcePath} (${variant})`,
      );
    }
  }
  return execution.records;
}

/**
 * @param {string} sourcePath
 * @param {boolean} passed
 */
function p1cDestination(sourcePath, passed) {
  if (!passed) {
    throw new Error(`P1C root did not completely pass: ${sourcePath}`);
  }
  return {
    path: sourcePath,
    status: 'selected-passing',
    blocker: null,
    issue: P1C_ISSUE_NUMBER,
  };
}

/**
 * @param {ReadonlyMap<string, number>} actual
 * @param {Readonly<Record<string, number>>} expected
 */
function sameExactCounts(actual, expected) {
  const expectedKeys = Object.keys(expected).sort(compareStrings);
  const actualKeys = [...actual.keys()].sort(compareStrings);
  if (
    expectedKeys.length !== actualKeys.length ||
    expectedKeys.some((key, index) => key !== actualKeys[index])
  ) {
    return false;
  }
  return expectedKeys.every((key) => actual.get(key) === expected[key]);
}

/** @param {P1CClassification | undefined} entry */
function stableP1CClassification(entry) {
  if (entry === undefined) return undefined;
  const stable = { ...entry };
  Reflect.deleteProperty(stable, 'status');
  Reflect.deleteProperty(stable, 'blocker');
  return stable;
}

/** @param {readonly any[]} classifications */
function p1cStatusTables(classifications) {
  return {
    core: p1cCountTable(
      classifications.filter((entry) => entry.partition === 'core'),
      (entry) => entry.status,
    ),
    annexB: p1cCountTable(
      classifications.filter((entry) => entry.partition === 'annex-b'),
      (entry) => entry.status,
    ),
    blockers: p1cCountTable(
      classifications.filter((entry) => entry.blocker !== null),
      (entry) => entry.blocker,
    ),
  };
}

/**
 * @param {readonly any[]} entries
 * @param {(entry: any) => string} keyOf
 */
function p1cCountTable(entries, keyOf) {
  const totals = new Map();
  for (const entry of entries) {
    const key = keyOf(entry);
    const total = totals.get(key) ?? { roots: 0, variants: 0 };
    total.roots += 1;
    total.variants += entry.variants;
    totals.set(key, total);
  }
  return [...totals]
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([name, total]) => ({ name, ...total }));
}

/**
 * @param {string} text
 * @returns {{
 *   records: P1CExecutionRecord[],
 *   inventory: { files: number, records: number, malformed: number },
 * }}
 */
function parseP1CReport(text) {
  /** @type {P1CExecutionRecord[]} */
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
        `P1C report line ${index + 1} is invalid JSON: ${
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
        throw new Error(`P1C report line ${index + 1} has an invalid test`);
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
        throw new Error(`P1C report line ${index + 1} has invalid inventory`);
      }
      inventory = value;
    }
  }
  if (inventory === null) {
    throw new Error('P1C report lacks whole-suite inventory');
  }
  return { records, inventory };
}

/**
 * @param {readonly P1CExecutionRecord[]} records
 * @param {string} label
 * @returns {Map<string, P1CExecutionRecord[]>}
 */
function groupP1CRecords(records, label) {
  /** @type {Map<string, P1CExecutionRecord[]>} */
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
    Object.keys(values).sort(compareStrings).join('\u0000') !==
      [...paths].sort(compareStrings).join('\u0000')
  ) {
    throw new Error(`${label} must cover the exact protected paths`);
  }
  for (const sourcePath of paths) {
    if (typeof values[sourcePath] !== 'string') {
      throw new Error(`${label} must contain text for ${sourcePath}`);
    }
  }
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
    throw new Error(`P1C path ${displayPath} is outside the repository root`);
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
        throw new Error(`P1C output path ${candidate} has a dangling symlink`);
      }
    } catch (error) {
      if (/** @type {any} */ (error)?.code !== 'ENOENT') {
        throw error;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(
        `P1C output path ${candidate} has no existing physical ancestor`,
      );
    }
    missing.unshift(path.basename(current));
    current = parent;
  }
}

/**
 * @param {URL} repositoryRootUrl
 * @param {string} inputPath
 */
async function resolveP1CInputPath(repositoryRootUrl, inputPath) {
  if (
    typeof inputPath !== 'string' ||
    inputPath === '' ||
    path.isAbsolute(inputPath) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(inputPath)
  ) {
    throw new Error('P1C input path must be repository-relative');
  }
  const root = await realpath(fileURLToPath(repositoryRootUrl));
  const candidate = path.resolve(root, inputPath);
  assertInsideRepository(root, candidate, inputPath);
  const physical = await realpath(candidate);
  assertInsideRepository(root, physical, inputPath);
  const stat = await lstat(physical);
  if (!stat.isFile()) {
    throw new Error(`P1C input path ${inputPath} must be a regular file`);
  }
  return physical;
}

/**
 * @param {URL} repositoryRootUrl
 * @param {string} outputPath
 */
async function resolveP1CScratchRoot(repositoryRootUrl, outputPath) {
  if (
    typeof outputPath !== 'string' ||
    outputPath === '' ||
    path.isAbsolute(outputPath) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(outputPath)
  ) {
    throw new Error('P1C scratch output must be repository-relative');
  }
  const root = await realpath(fileURLToPath(repositoryRootUrl));
  const candidate = path.resolve(root, outputPath);
  assertInsideRepository(root, candidate, outputPath);
  try {
    if ((await lstat(candidate)).isSymbolicLink()) {
      throw new Error(`P1C scratch output ${outputPath} must not be a symlink`);
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
      `P1C scratch output ${outputPath} must not traverse a symlink`,
    );
  }
  await mkdir(physicalCandidate, { recursive: true });
  const physical = await realpath(physicalCandidate);
  assertInsideRepository(root, physical, outputPath);
  if (physical !== candidate) {
    throw new Error(
      `P1C scratch output ${outputPath} must not traverse a symlink`,
    );
  }
  return physical;
}

/**
 * @param {string} target
 * @param {string} text
 */
async function writeP1CFileAtomically(target, text) {
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.p1c-${randomUUID()}`,
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
async function writeP1CScratchBundle(scratchRoot, files) {
  const staging = path.join(scratchRoot, `.build-${randomUUID()}`);
  const topLevelFiles = [
    'authority-record.json',
    'collateral-execution.json',
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
    for (const file of topLevelFiles) {
      await rm(path.join(scratchRoot, file), { force: true });
      await rename(path.join(staging, file), path.join(scratchRoot, file));
    }
  } catch (error) {
    for (const file of topLevelFiles) {
      await rm(path.join(scratchRoot, file), { force: true });
    }
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/** @param {unknown} value */
function renderP1CJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
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
