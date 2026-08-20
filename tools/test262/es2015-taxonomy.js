/**
 * Pure, host-neutral classification for the pinned ES2015 Test262 inventory.
 *
 * Filesystem access, YAML decoding, checkout validation, and execution belong
 * to the audit boundary. This module accepts only already supplied facts.
 */

import { expandVariants, parseTest262Metadata } from './metadata.js';
import { isTest262FixtureDependencyPath, sortStrings } from './selection.js';

export const ES2015_POLICY_FILE = 'tools/test262/es2015-policy.json';
export const ES2015_ANCHORS_FILE = 'tools/test262/es2015-anchors.json';
export const ES2015_TAXONOMY_VERSION = 1;
export const ES2015_WHOLE_TREE_PARTITIONS = Object.freeze([
  'annex-b',
  'core',
  'harness-validation',
  'later-or-non-es2015',
  'malformed',
  'unknown-edition',
]);

const POLICY_KEYS = Object.freeze([
  'version',
  'repository',
  'revision',
  'specification',
  'es2015Features',
  'laterFeatures',
  'neutralFeatures',
  'laterFlags',
  'pathRules',
]);
const SPECIFICATION_KEYS = Object.freeze(['source', 'sourceSha256']);
const PATH_RULE_KEYS = Object.freeze(['prefix', 'partition', 'reason']);
const ANCHOR_KEYS = Object.freeze([
  'version',
  'source',
  'sourceSha256',
  'anchors',
]);
const REPOSITORY = 'https://github.com/tc39/test262.git';
const REVISION = 'b363f29d3c43c626dc852744ad64a0b48a003693';
const SPECIFICATION_SOURCE = 'https://262.ecma-international.org/6.0/';
const SPECIFICATION_SHA256 =
  '4d4243dc2f04c9cdd09498f2cc2af6f6cdc07b0430da5578e7cf440d4f7846a0';
const ROOT_PREFIX = 'test/';
const KNOWN_PARTITIONS = Object.freeze([
  'annex-b',
  'core',
  'later-or-non-es2015',
]);
const UNSELECTED_ES2015_PARTITIONS = new Set(['annex-b', 'core']);
const KNOWN_FLAGS = new Set([
  'onlyStrict',
  'noStrict',
  'module',
  'raw',
  'async',
  'generated',
  'CanBlockIsFalse',
  'CanBlockIsTrue',
  'non-deterministic',
]);
const EXECUTION_STATUSES = new Set(['passed', 'failed', 'skipped']);

/**
 * @typedef {{
 *   type: 'test',
 *   file: string,
 *   variant: string,
 *   status: 'passed' | 'failed' | 'skipped',
 * }} Es2015ExecutionRecord
 */

export class Es2015TaxonomyError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'Es2015TaxonomyError';
  }
}

/**
 * @param {string} text
 */
export function parseEs2015Policy(text) {
  const record = parseJson(text, ES2015_POLICY_FILE);
  requireExactKeys(record, POLICY_KEYS, ES2015_POLICY_FILE);

  if (record.version !== ES2015_TAXONOMY_VERSION) {
    throw new Es2015TaxonomyError(
      `${ES2015_POLICY_FILE} must declare version ${ES2015_TAXONOMY_VERSION}`,
    );
  }
  if (record.repository !== REPOSITORY || record.revision !== REVISION) {
    throw new Es2015TaxonomyError(
      `${ES2015_POLICY_FILE} must retain the reviewed Test262 repository and revision`,
    );
  }

  const specification = object(record.specification, 'specification');
  requireExactKeys(
    specification,
    SPECIFICATION_KEYS,
    `${ES2015_POLICY_FILE} specification`,
  );
  if (
    specification.source !== SPECIFICATION_SOURCE ||
    specification.sourceSha256 !== SPECIFICATION_SHA256
  ) {
    throw new Es2015TaxonomyError(
      `${ES2015_POLICY_FILE} must retain the reviewed Sixth Edition source identity`,
    );
  }

  const es2015Features = stringList(record.es2015Features, 'es2015Features');
  const laterFeatures = stringList(record.laterFeatures, 'laterFeatures');
  const neutralFeatures = stringList(record.neutralFeatures, 'neutralFeatures');
  const laterFlags = stringList(record.laterFlags, 'laterFlags');
  const pathRules = pathRulesFrom(record.pathRules);
  const seenFeatures = new Set();

  for (const [name, features] of [
    ['es2015Features', es2015Features],
    ['laterFeatures', laterFeatures],
    ['neutralFeatures', neutralFeatures],
  ]) {
    for (const feature of features) {
      if (seenFeatures.has(feature)) {
        throw new Es2015TaxonomyError(
          `${ES2015_POLICY_FILE} repeats feature ${feature} in ${name}`,
        );
      }
      seenFeatures.add(feature);
    }
  }

  return Object.freeze({
    version: ES2015_TAXONOMY_VERSION,
    repository: REPOSITORY,
    revision: REVISION,
    specification: Object.freeze({
      source: SPECIFICATION_SOURCE,
      sourceSha256: SPECIFICATION_SHA256,
    }),
    es2015Features: Object.freeze(es2015Features),
    laterFeatures: Object.freeze(laterFeatures),
    neutralFeatures: Object.freeze(neutralFeatures),
    laterFlags: Object.freeze(laterFlags),
    pathRules: Object.freeze(pathRules),
  });
}

/**
 * @param {string} text
 */
export function parseEs2015Anchors(text) {
  const record = parseJson(text, ES2015_ANCHORS_FILE);
  requireExactKeys(record, ANCHOR_KEYS, ES2015_ANCHORS_FILE);

  if (
    record.version !== ES2015_TAXONOMY_VERSION ||
    record.source !== SPECIFICATION_SOURCE ||
    record.sourceSha256 !== SPECIFICATION_SHA256
  ) {
    throw new Es2015TaxonomyError(
      `${ES2015_ANCHORS_FILE} does not identify the reviewed Sixth Edition source`,
    );
  }

  const anchors = stringList(record.anchors, 'anchors', ES2015_ANCHORS_FILE);

  return Object.freeze({
    version: ES2015_TAXONOMY_VERSION,
    source: SPECIFICATION_SOURCE,
    sourceSha256: SPECIFICATION_SHA256,
    anchors: Object.freeze(anchors),
  });
}

/**
 * Builds inventory facts without touching a host API. A root supplies parsed
 * metadata, or source text when parsing is intentionally left to this portable
 * boundary.
 *
 * @param {{
 *   roots: readonly {
 *     path: string,
 *     source?: string,
 *     metadata?: object,
 *     metadataError?: string,
 *     includeFeatures?: readonly string[],
 *   }[],
 *   includeDefinitions?: ReadonlyMap<string, unknown> | Record<string, unknown>,
 * }} options
 */
export function buildEs2015Inventory(options) {
  if (!Array.isArray(options?.roots)) {
    throw new Es2015TaxonomyError('ES2015 inventory requires root descriptors');
  }

  const definitions = definitionsMap(options.includeDefinitions);
  const paths = new Set();
  const inventory = options.roots.map((root) => {
    if (typeof root !== 'object' || root === null) {
      throw new Es2015TaxonomyError('ES2015 roots must be objects');
    }
    const path = root.path;
    assertRootPath(path);
    if (paths.has(path)) {
      throw new Es2015TaxonomyError(`ES2015 inventory repeats root ${path}`);
    }
    paths.add(path);
    if (root.includeFeatures !== undefined) {
      throw new Es2015TaxonomyError(
        `ES2015 root ${path} must resolve include features from include definitions`,
      );
    }

    const parsed = parseRootMetadata(root);
    if (parsed.error !== null) {
      return Object.freeze({
        path,
        metadata: null,
        metadataError: parsed.error,
        variants: 0,
        executionVariants: Object.freeze([]),
        includeFeatures: Object.freeze([]),
      });
    }

    const metadata = normalizeMetadata(parsed.metadata);
    const executionVariants = expandVariants(/** @type {any} */ (metadata));
    const includeFeatures = resolveIncludeFeatures(
      metadata.includes,
      definitions,
    );

    return Object.freeze({
      path,
      metadata,
      metadataError: null,
      variants: executionVariants.length,
      executionVariants: Object.freeze(executionVariants),
      includeFeatures: Object.freeze(sortStrings(includeFeatures)),
    });
  });

  return Object.freeze(inventory);
}

/**
 * @param {{
 *   policy: ReturnType<typeof parseEs2015Policy>,
 *   anchors: ReturnType<typeof parseEs2015Anchors>,
 *   inventory: readonly object[],
 *   selected?: ReadonlySet<string> | readonly string[],
 *   selectedResults?: ReadonlyMap<string, readonly Es2015ExecutionRecord[]> | Record<string, readonly Es2015ExecutionRecord[]>,
 *   auditResults?: ReadonlyMap<string, readonly Es2015ExecutionRecord[]> | Record<string, readonly Es2015ExecutionRecord[]>,
 *   blockers?: ReadonlyMap<string, string> | Record<string, string>,
 *   intentionalDeviations?: ReadonlySet<string> | readonly string[],
 *   reviewedProvenance?: ReadonlyMap<string, object> | Record<string, object>,
 * }} options
 */
export function classifyEs2015Inventory(options) {
  const { policy, anchors, inventory } = options ?? {};
  if (
    policy === undefined ||
    anchors === undefined ||
    !Array.isArray(inventory)
  ) {
    throw new Es2015TaxonomyError(
      'ES2015 classification requires policy, anchors, and inventory',
    );
  }

  const knownFeatures = new Set([
    ...policy.es2015Features,
    ...policy.laterFeatures,
    ...policy.neutralFeatures,
  ]);
  const anchorSet = new Set(anchors.anchors);
  const selected = stringSet(options.selected);
  const selectedResults = valueMap(options.selectedResults);
  const auditResults = valueMap(options.auditResults);
  const blockers = valueMap(options.blockers);
  const intentionalDeviations = stringSet(options.intentionalDeviations);
  const reviewedProvenance = valueMap(
    options.reviewedProvenance,
    'reviewed provenance map',
  );
  const paths = new Set();
  const executionVariants = new Map();
  const entries = inventory.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Es2015TaxonomyError('ES2015 inventory entries must be objects');
    }
    const path = entry.path;
    assertRootPath(path);
    if (paths.has(path)) {
      throw new Es2015TaxonomyError(
        `ES2015 classification repeats root ${path}`,
      );
    }
    paths.add(path);
    executionVariants.set(path, inventoryExecutionVariants(entry, path));
    return entry;
  });
  validateExecutionResults(selectedResults, executionVariants, 'selected');
  validateExecutionResults(auditResults, executionVariants, 'audit');

  const contexts = entries.map((entry) => ({
    path: entry.path,
    metadata: entry.metadata,
    metadataError: entry.metadataError,
    variants: entry.variants,
    includeFeatures: entry.includeFeatures,
    policy,
    knownFeatures,
    anchorSet,
    selected,
    selectedResults,
    auditResults,
    blockers,
    intentionalDeviations,
    reviewedProvenance,
  }));
  const preliminaryRecords = contexts.map((context) =>
    classifyRoot(context, true),
  );
  validateUnselectedEvidenceScope({
    records: preliminaryRecords,
    selected,
    auditResults,
    blockers,
    intentionalDeviations,
  });
  validateUnselectedEvidenceCompleteness({
    records: preliminaryRecords,
    selected,
    auditResults,
  });
  const records = contexts.map((context) => classifyRoot(context));

  return Object.freeze(
    records.sort((left, right) => compareStrings(left.path, right.path)),
  );
}

/**
 * @param {readonly {
 *   path: string, variants: number, partition: string, status: string
 * }[]} classifications
 */
export function summarizeEs2015Classification(classifications) {
  if (!Array.isArray(classifications)) {
    throw new Es2015TaxonomyError('ES2015 summary requires classifications');
  }
  const paths = new Set();
  const totals = new Map(
    ES2015_WHOLE_TREE_PARTITIONS.map((name) => [
      name,
      { roots: 0, variants: 0 },
    ]),
  );
  let variants = 0;

  for (const record of classifications) {
    if (typeof record !== 'object' || record === null) {
      throw new Es2015TaxonomyError('ES2015 classifications must be objects');
    }
    assertRootPath(record.path);
    if (paths.has(record.path)) {
      throw new Es2015TaxonomyError(
        `ES2015 summary repeats root ${record.path}`,
      );
    }
    paths.add(record.path);
    if (!Number.isInteger(record.variants) || record.variants < 0) {
      throw new Es2015TaxonomyError(
        `ES2015 root ${record.path} has an invalid variant count`,
      );
    }
    if (!ES2015_WHOLE_TREE_PARTITIONS.includes(record.partition)) {
      throw new Es2015TaxonomyError(
        `ES2015 root ${record.path} has unknown partition ${String(record.partition)}`,
      );
    }
    variants += record.variants;
    const total = totals.get(record.partition);
    if (total === undefined) {
      throw new Es2015TaxonomyError(
        `ES2015 root ${record.path} has unknown partition ${String(record.partition)}`,
      );
    }
    total.roots += 1;
    total.variants += record.variants;
  }

  const roots = classifications.length;
  const partitions = ES2015_WHOLE_TREE_PARTITIONS.map((name) => {
    const total = totals.get(name);
    if (total === undefined) {
      throw new Es2015TaxonomyError(
        `ES2015 whole-tree partition ${name} is missing`,
      );
    }
    return Object.freeze({
      name,
      roots: total.roots,
      variants: total.variants,
      rootsPercent: percentage(total.roots, roots),
      variantsPercent: percentage(total.variants, variants),
    });
  });

  return Object.freeze({
    roots,
    variants,
    partitions: Object.freeze(partitions),
  });
}

/**
 * @param {{
 *   summary: ReturnType<typeof summarizeEs2015Classification>,
 *   classifications?: readonly object[],
 * }} report
 */
export function renderEs2015Taxonomy(report) {
  if (
    typeof report !== 'object' ||
    report === null ||
    report.summary === undefined
  ) {
    throw new Es2015TaxonomyError('ES2015 report requires a summary');
  }
  const summary = report.summary;
  const lines = ['Partition | Roots | Variants | Roots % | Variants %'];

  for (const partition of summary.partitions) {
    lines.push(
      `${partition.name} | ${partition.roots} | ${partition.variants} | ${Number(partition.rootsPercent).toFixed(3)} | ${Number(partition.variantsPercent).toFixed(3)}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

/**
 * @param {any} context
 * @param {boolean} [withoutStatus]
 */
function classifyRoot(context, withoutStatus = false) {
  const baseRecord = classifyBaseRoot(context, withoutStatus);
  const reviewed = reviewedDecision(
    context.reviewedProvenance.get(context.path),
    context.path,
  );
  if (reviewed === null) {
    return baseRecord;
  }
  if (baseRecord.status !== 'unknown-edition') {
    if (withoutStatus) {
      return baseRecord;
    }
    throw new Es2015TaxonomyError(
      `ES2015 reviewed provenance for ${context.path} expected prior class ${reviewed.priorClass}, got ${baseRecord.status}`,
    );
  }
  return applyReviewedDecision(context, baseRecord, reviewed, withoutStatus);
}

/**
 * @param {any} context
 * @param {boolean} [withoutStatus]
 */
function classifyBaseRoot(context, withoutStatus = false) {
  const {
    path,
    metadataError,
    policy,
    knownFeatures,
    selected,
    selectedResults,
    auditResults,
    blockers,
    intentionalDeviations,
  } = context;
  if (typeof context.variants !== 'number' || context.variants < 0) {
    throw new Es2015TaxonomyError(`ES2015 root ${path} has invalid variants`);
  }
  if (metadataError !== null && metadataError !== undefined) {
    return record(
      path,
      0,
      'malformed',
      'malformed',
      null,
      [],
      [],
      [],
      [`metadata-error:${String(metadataError)}`],
    );
  }

  const metadata = normalizeMetadata(context.metadata);
  const features = [...metadata.features];
  const flags = [...metadata.flags];
  const includes = [...metadata.includes];
  const includeFeatures = normalizedStringValues(
    context.includeFeatures ?? [],
    `${path} includeFeatures`,
  );
  for (const feature of [...features, ...includeFeatures]) {
    if (!knownFeatures.has(feature)) {
      throw new Es2015TaxonomyError(
        `ES2015 root ${path} uses unknown feature ${feature}`,
      );
    }
  }
  for (const flag of flags) {
    if (!KNOWN_FLAGS.has(flag)) {
      throw new Es2015TaxonomyError(
        `ES2015 root ${path} uses unknown flag ${flag}`,
      );
    }
  }

  if (path.startsWith('test/harness/')) {
    return record(
      path,
      context.variants,
      'harness-validation',
      'harness-validation',
      null,
      features,
      flags,
      includes,
      ['harness'],
    );
  }

  const rules = policy.pathRules.filter((/** @type {any} */ rule) =>
    path.startsWith(rule.prefix),
  );
  const laterEvidence = [
    ...features
      .filter((feature) => policy.laterFeatures.includes(feature))
      .map((feature) => `feature:${feature}`),
    ...includeFeatures
      .filter((feature) => policy.laterFeatures.includes(feature))
      .map((feature) => `include-feature:${feature}`),
    ...flags
      .filter((flag) => policy.laterFlags.includes(flag))
      .map((flag) => `flag:${flag}`),
    ...rules
      .filter(
        (/** @type {any} */ rule) => rule.partition === 'later-or-non-es2015',
      )
      .map((/** @type {any} */ rule) => `path:${rule.prefix}`),
  ];
  if (laterEvidence.length > 0) {
    return record(
      path,
      context.variants,
      'later-or-non-es2015',
      'later-or-non-es2015',
      null,
      features,
      flags,
      includes,
      sortStrings(laterEvidence),
    );
  }

  const affirmative = [
    ...(metadata.es5id === null ? [] : ['es5id']),
    ...(metadata.es6id === null ? [] : ['es6id']),
    ...(metadata.esid !== null && context.anchorSet.has(metadata.esid)
      ? [`anchor:${metadata.esid}`]
      : []),
    ...features
      .filter((feature) => policy.es2015Features.includes(feature))
      .map((feature) => `feature:${feature}`),
  ];
  if (affirmative.length === 0) {
    return record(
      path,
      context.variants,
      'unknown-edition',
      'unknown-edition',
      null,
      features,
      flags,
      includes,
      [],
    );
  }

  const partition = rules.some(
    (/** @type {any} */ rule) => rule.partition === 'annex-b',
  )
    ? 'annex-b'
    : 'core';
  const status = withoutStatus
    ? { name: partition, blocker: null }
    : classifiedStatus(
        path,
        selected,
        selectedResults,
        auditResults,
        blockers,
        intentionalDeviations,
      );
  return record(
    path,
    context.variants,
    partition,
    status.name,
    status.blocker,
    features,
    flags,
    includes,
    sortStrings([
      ...affirmative,
      ...rules
        .filter((/** @type {any} */ rule) => rule.partition === 'annex-b')
        .map((/** @type {any} */ rule) => `path:${rule.prefix}`),
    ]),
  );
}

/**
 * @param {any} context
 * @param {ReturnType<typeof record>} baseRecord
 * @param {{
 *   code: string,
 *   path: string,
 *   priorClass: string,
 *   finalPartition: string,
 *   finalStatus: string,
 *   artifactSha256: string,
 * }} reviewed
 * @param {boolean} withoutStatus
 */
function applyReviewedDecision(context, baseRecord, reviewed, withoutStatus) {
  if (reviewed.priorClass !== baseRecord.status) {
    throw new Es2015TaxonomyError(
      `ES2015 reviewed provenance for ${context.path} expected prior class ${reviewed.priorClass}, got ${baseRecord.status}`,
    );
  }
  if (
    reviewed.finalPartition !== 'annex-b' &&
    reviewed.finalPartition !== 'core' &&
    reviewed.finalPartition !== 'later-or-non-es2015'
  ) {
    throw new Es2015TaxonomyError(
      `ES2015 reviewed provenance for ${context.path} has unsupported final partition ${reviewed.finalPartition}`,
    );
  }
  const status =
    reviewed.finalPartition === 'core'
      ? withoutStatus
        ? { name: 'core', blocker: null }
        : classifiedStatus(
            context.path,
            context.selected,
            context.selectedResults,
            context.auditResults,
            context.blockers,
            context.intentionalDeviations,
          )
      : { name: reviewed.finalPartition, blocker: null };
  if (!withoutStatus && reviewed.finalStatus !== status.name) {
    throw new Es2015TaxonomyError(
      `ES2015 reviewed provenance for ${context.path} expected status ${reviewed.finalStatus}, got ${status.name}`,
    );
  }
  return record(
    context.path,
    baseRecord.variants,
    reviewed.finalPartition,
    status.name,
    status.blocker,
    baseRecord.features,
    baseRecord.flags,
    baseRecord.includes,
    sortStrings([
      ...context.policy.pathRules
        .filter(
          (/** @type {any} */ rule) =>
            reviewed.finalPartition === 'annex-b' &&
            rule.partition === 'annex-b' &&
            context.path.startsWith(rule.prefix),
        )
        .map((/** @type {any} */ rule) => `path:${rule.prefix}`),
      `review:${reviewed.code}:${reviewed.artifactSha256}`,
    ]),
  );
}

/**
 * @param {unknown} value
 * @param {string} path
 */
function reviewedDecision(value, path) {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Es2015TaxonomyError(
      `ES2015 reviewed provenance for ${path} must be an object`,
    );
  }
  const decision = value;
  if (
    typeof decision.code !== 'string' ||
    decision.code === '' ||
    decision.path !== path ||
    typeof decision.priorClass !== 'string' ||
    decision.priorClass === '' ||
    typeof decision.finalPartition !== 'string' ||
    decision.finalPartition === '' ||
    typeof decision.finalStatus !== 'string' ||
    decision.finalStatus === '' ||
    typeof decision.artifactSha256 !== 'string' ||
    decision.artifactSha256 === ''
  ) {
    throw new Es2015TaxonomyError(
      `ES2015 reviewed provenance for ${path} is invalid`,
    );
  }
  return {
    code: decision.code,
    path: decision.path,
    priorClass: decision.priorClass,
    finalPartition: decision.finalPartition,
    finalStatus: decision.finalStatus,
    artifactSha256: decision.artifactSha256,
  };
}

/**
 * @param {string} path
 * @param {Set<string>} selected
 * @param {Map<string, any>} selectedResults
 * @param {Map<string, any>} auditResults
 * @param {Map<string, any>} blockers
 * @param {Set<string>} intentionalDeviations
 */
function classifiedStatus(
  path,
  selected,
  selectedResults,
  auditResults,
  blockers,
  intentionalDeviations,
) {
  if (intentionalDeviations.has(path)) {
    return { name: 'intentional-deviation', blocker: null };
  }
  const blocker = blockers.get(path);
  if (typeof blocker === 'string' && blocker !== '') {
    return { name: `blocked:${blocker}`, blocker };
  }
  if (selected.has(path) && resultPassed(selectedResults.get(path))) {
    return { name: 'selected-passing', blocker: null };
  }
  if (!selected.has(path) && resultPassed(auditResults.get(path))) {
    return { name: 'audit-passing-unselected', blocker: null };
  }
  throw new Es2015TaxonomyError(
    `ES2015 unselected root ${path} has failed audit execution evidence without a blocker or intentional deviation`,
  );
}

/**
 * Audit execution, blocker, and intentional-deviation evidence must cover only
 * roots whose classification can use it: unselected ES2015 core or Annex B
 * roots. This rejects stale evidence that would otherwise be silently ignored.
 *
 * @param {{
 *   records: readonly any[],
 *   selected: Set<string>,
 *   auditResults: Map<string, any>,
 *   blockers: Map<string, any>,
 *   intentionalDeviations: Set<string>,
 * }} options
 */
function validateUnselectedEvidenceScope(options) {
  const classifications = new Map(
    options.records.map((record) => [record.path, record]),
  );

  /**
   * @param {string} path
   * @param {string} source
   */
  function assertScope(path, source) {
    const classification = classifications.get(path);
    if (
      classification === undefined ||
      options.selected.has(path) ||
      !UNSELECTED_ES2015_PARTITIONS.has(classification.partition)
    ) {
      throw new Es2015TaxonomyError(
        `ES2015 ${source} names root outside the unselected ES2015 inventory ${path}`,
      );
    }
  }

  for (const path of options.auditResults.keys()) {
    assertScope(path, 'audit evidence');
  }
  for (const [path, blocker] of options.blockers) {
    if (typeof blocker !== 'string' || blocker === '') {
      throw new Es2015TaxonomyError(
        `ES2015 audit blocker evidence for ${path} is invalid`,
      );
    }
    assertScope(path, 'audit blocker evidence');
  }
  for (const path of options.intentionalDeviations) {
    assertScope(path, 'intentional deviation evidence');
  }
}

/**
 * Every unselected core or Annex B root must have complete execution evidence.
 * This runs after root partitioning but before final status classification.
 *
 * @param {{
 *   records: readonly any[],
 *   selected: Set<string>,
 *   auditResults: Map<string, any>,
 * }} options
 */
function validateUnselectedEvidenceCompleteness(options) {
  for (const record of options.records) {
    if (
      !options.selected.has(record.path) &&
      UNSELECTED_ES2015_PARTITIONS.has(record.partition) &&
      !options.auditResults.has(record.path)
    ) {
      throw new Es2015TaxonomyError(
        `ES2015 unselected root ${record.path} requires exact audit execution evidence`,
      );
    }
  }
}

/**
 * @param {string} path
 * @param {number} variants
 * @param {string} partition
 * @param {string} status
 * @param {string | null} blocker
 * @param {readonly string[]} features
 * @param {readonly string[]} flags
 * @param {readonly string[]} includes
 * @param {readonly string[]} provenance
 */
function record(
  path,
  variants,
  partition,
  status,
  blocker,
  features,
  flags,
  includes,
  provenance,
) {
  return Object.freeze({
    path,
    variants,
    partition,
    status,
    blocker,
    features: Object.freeze(sortStrings(features)),
    flags: Object.freeze(sortStrings(flags)),
    includes: Object.freeze(sortStrings(includes)),
    provenance: Object.freeze(sortStrings(provenance)),
  });
}

/**
 * @param {any} entry
 * @param {string} path
 * @returns {readonly string[]}
 */
function inventoryExecutionVariants(entry, path) {
  if (entry.metadataError !== null && entry.metadataError !== undefined) {
    if (entry.variants !== 0) {
      throw new Es2015TaxonomyError(
        `ES2015 root ${path} has invalid variants for malformed metadata`,
      );
    }
    return [];
  }

  const variants = expandVariants(
    /** @type {any} */ (normalizeMetadata(entry.metadata)),
  );
  if (entry.variants !== variants.length) {
    throw new Es2015TaxonomyError(
      `ES2015 root ${path} has an invalid variant count`,
    );
  }
  if (entry.executionVariants !== undefined) {
    const supplied = normalizedStringValues(
      entry.executionVariants,
      `${path} execution variants`,
    );
    if (supplied.join('\u0000') !== variants.join('\u0000')) {
      throw new Es2015TaxonomyError(
        `ES2015 root ${path} has inconsistent execution variants`,
      );
    }
  }
  return variants;
}

/**
 * @param {Map<string, any>} results
 * @param {Map<string, readonly string[]>} expectedVariants
 * @param {string} source
 */
function validateExecutionResults(results, expectedVariants, source) {
  for (const [path, records] of results) {
    const expected = expectedVariants.get(path);
    if (expected === undefined) {
      const description =
        source === 'audit'
          ? 'audit evidence names root outside the unselected ES2015 inventory'
          : `${source} execution names root outside inventory`;
      throw new Es2015TaxonomyError(`ES2015 ${description} ${path}`);
    }
    if (!Array.isArray(records) || records.length !== expected.length) {
      throw new Es2015TaxonomyError(
        `ES2015 ${source} execution for ${path} must contain ${expected.length} records`,
      );
    }

    const variants = new Set();
    for (const execution of records) {
      if (
        typeof execution !== 'object' ||
        execution === null ||
        Array.isArray(execution) ||
        execution.type !== 'test' ||
        execution.file !== path ||
        typeof execution.variant !== 'string' ||
        !EXECUTION_STATUSES.has(execution.status)
      ) {
        throw new Es2015TaxonomyError(
          `ES2015 ${source} execution for ${path} must contain Test262 test records`,
        );
      }
      variants.add(execution.variant);
    }

    if (
      variants.size !== expected.length ||
      expected.some((variant) => !variants.has(variant))
    ) {
      throw new Es2015TaxonomyError(
        `ES2015 ${source} execution for ${path} has incorrect variants`,
      );
    }
  }
}

/** @param {any} root */
function parseRootMetadata(root) {
  if (typeof root.metadataError === 'string' && root.metadataError !== '') {
    return { metadata: null, error: root.metadataError };
  }
  if (root.metadata !== undefined) {
    return { metadata: root.metadata, error: null };
  }
  if (typeof root.source !== 'string') {
    throw new Es2015TaxonomyError(
      `ES2015 root ${root.path} requires metadata or source text`,
    );
  }
  try {
    return { metadata: parseTest262Metadata(root.source), error: null };
  } catch (error) {
    return {
      metadata: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** @param {any} value */
function normalizeMetadata(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Es2015TaxonomyError('ES2015 metadata must be an object');
  }
  const metadata = value;
  return Object.freeze({
    description:
      typeof metadata.description === 'string' ? metadata.description : '',
    esid: nullableString(metadata.esid, 'esid'),
    es5id: nullableString(metadata.es5id, 'es5id'),
    es6id: nullableString(metadata.es6id, 'es6id'),
    features: Object.freeze(
      normalizedStringValues(metadata.features ?? [], 'features'),
    ),
    flags: Object.freeze(normalizedStringValues(metadata.flags ?? [], 'flags')),
    includes: Object.freeze(
      normalizedStringValues(metadata.includes ?? [], 'includes'),
    ),
  });
}

/** @param {unknown} value @param {string} field */
function nullableString(value, field) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Es2015TaxonomyError(`ES2015 metadata ${field} must be a string`);
  }
  return value;
}

/** @param {any} value */
function definitionsMap(value) {
  if (value === undefined) {
    return new Map();
  }
  if (value instanceof Map) {
    return new Map(value);
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return new Map(Object.entries(value));
  }
  throw new Es2015TaxonomyError(
    'ES2015 include definitions must be a map or object',
  );
}

/** @param {readonly string[]} includes @param {Map<string, any>} definitions */
function resolveIncludeFeatures(includes, definitions) {
  /** @type {string[]} */
  const features = [];
  const visiting = new Set();
  const resolved = new Set();

  /** @param {string} name */
  function visit(name) {
    const identity = includeIdentity(name);
    if (resolved.has(identity)) return;
    if (visiting.has(identity)) {
      throw new Es2015TaxonomyError(
        `ES2015 include dependency cycle includes ${name}`,
      );
    }
    const aliases = includeAliases(name).filter((alias) =>
      definitions.has(alias),
    );
    if (aliases.length === 0) {
      throw new Es2015TaxonomyError(`ES2015 include ${name} is unknown`);
    }
    visiting.add(identity);
    for (const alias of aliases) {
      const facts = includeFacts(definitions.get(alias), alias);
      for (const nested of facts.includes) visit(nested);
      features.push(...facts.features);
    }
    visiting.delete(identity);
    resolved.add(identity);
  }

  for (const include of includes) visit(include);
  return normalizedStringValues(features, 'include features');
}

/** @param {string} name */
function includeAliases(name) {
  return name.endsWith('.js')
    ? [name.slice(0, -'.js'.length), name]
    : [name, `${name}.js`];
}

/** @param {string} name */
function includeIdentity(name) {
  return name.endsWith('.js') ? name.slice(0, -'.js'.length) : name;
}

/** @param {any} value @param {string} name */
function includeFacts(value, name) {
  if (Array.isArray(value)) {
    return {
      features: normalizedStringValues(value, `${name} features`),
      includes: [],
    };
  }
  if (typeof value !== 'object' || value === null) {
    throw new Es2015TaxonomyError(`ES2015 include ${name} has invalid facts`);
  }
  const facts = value;
  for (const key of Object.keys(facts)) {
    if (key !== 'features' && key !== 'includes') {
      throw new Es2015TaxonomyError(
        `ES2015 include ${name} has unknown key ${key}`,
      );
    }
  }
  return {
    features: normalizedStringValues(facts.features ?? [], `${name} features`),
    includes: normalizedStringValues(facts.includes ?? [], `${name} includes`),
  };
}

/** @param {any} value */
function pathRulesFrom(value) {
  if (!Array.isArray(value)) {
    throw new Es2015TaxonomyError(
      `${ES2015_POLICY_FILE} pathRules must be an array`,
    );
  }
  const rules = value.map((entry) => {
    const rule = object(entry, 'pathRules entry');
    requireExactKeys(
      rule,
      PATH_RULE_KEYS,
      `${ES2015_POLICY_FILE} pathRules entry`,
    );
    if (
      typeof rule.prefix !== 'string' ||
      !rule.prefix.startsWith(ROOT_PREFIX) ||
      rule.prefix === ROOT_PREFIX
    ) {
      throw new Es2015TaxonomyError(
        `${ES2015_POLICY_FILE} path rules must name a prefix below test/`,
      );
    }
    if (!KNOWN_PARTITIONS.includes(rule.partition)) {
      throw new Es2015TaxonomyError(
        `${ES2015_POLICY_FILE} path rule ${rule.prefix} has an unknown partition`,
      );
    }
    if (typeof rule.reason !== 'string' || rule.reason.trim() === '') {
      throw new Es2015TaxonomyError(
        `${ES2015_POLICY_FILE} path rule ${rule.prefix} requires a reason`,
      );
    }
    return Object.freeze({
      prefix: rule.prefix,
      partition: rule.partition,
      reason: rule.reason,
    });
  });
  const prefixes = rules.map((rule) => rule.prefix);
  assertSortedUnique(prefixes, 'pathRules');
  return rules;
}

/** @param {string} text @param {string} label */
function parseJson(text, label) {
  if (typeof text !== 'string') {
    throw new Es2015TaxonomyError(`${label} must be JSON text`);
  }
  try {
    return object(JSON.parse(text), label);
  } catch (error) {
    if (error instanceof Es2015TaxonomyError) throw error;
    throw new Es2015TaxonomyError(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {Record<string, any>}
 */
function object(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Es2015TaxonomyError(`${label} must be an object`);
  }
  return /** @type {Record<string, any>} */ (value);
}

/**
 * @param {Record<string, any>} record
 * @param {readonly string[]} expected
 * @param {string} label
 */
function requireExactKeys(record, expected, label) {
  for (const key of Object.keys(record)) {
    if (!expected.includes(key)) {
      throw new Es2015TaxonomyError(`${label} has an unknown key: ${key}`);
    }
  }
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Es2015TaxonomyError(`${label} is missing key: ${key}`);
    }
  }
}

/** @param {any} value @param {string} field @param {string} [subject] */
function stringList(value, field, subject = ES2015_POLICY_FILE) {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || entry === '')
  ) {
    throw new Es2015TaxonomyError(
      `${subject} ${field} must be non-empty strings`,
    );
  }
  const values = [...value];
  assertSortedUnique(values, field, subject);
  return values;
}

/** @param {any} value @param {string} field */
function normalizedStringValues(value, field) {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || entry === '')
  ) {
    throw new Es2015TaxonomyError(`ES2015 ${field} must be non-empty strings`);
  }
  return sortStrings([...new Set(value)]);
}

/**
 * @param {readonly string[]} values
 * @param {string} field
 * @param {string} [subject]
 */
function assertSortedUnique(values, field, subject = ES2015_POLICY_FILE) {
  if (new Set(values).size !== values.length) {
    throw new Es2015TaxonomyError(
      `${subject} ${field} must not repeat entries`,
    );
  }
  if (values.join('\u0000') !== sortStrings(values).join('\u0000')) {
    throw new Es2015TaxonomyError(
      `${subject} ${field} must be code-unit sorted`,
    );
  }
}

/** @param {unknown} path */
function assertRootPath(path) {
  if (
    typeof path !== 'string' ||
    !path.startsWith(ROOT_PREFIX) ||
    !path.endsWith('.js') ||
    isTest262FixtureDependencyPath(path)
  ) {
    throw new Es2015TaxonomyError(
      `ES2015 root must be a non-fixture test/*.js path: ${String(path)}`,
    );
  }
}

/** @param {any} value */
function stringSet(value) {
  if (value === undefined) return new Set();
  if (value instanceof Set || Array.isArray(value)) {
    return new Set(normalizedStringValues([...value], 'path set'));
  }
  throw new Es2015TaxonomyError('ES2015 path set must be a set or array');
}

/** @param {any} value */
function valueMap(value, label = 'result map') {
  if (value === undefined) return new Map();
  if (value instanceof Map) return new Map(value);
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return new Map(Object.entries(value));
  }
  throw new Es2015TaxonomyError(`ES2015 ${label} must be a map or object`);
}

/** @param {any} value */
function resultPassed(value) {
  if (value === 'passed') return true;
  if (Array.isArray(value))
    return value.length > 0 && value.every(resultPassed);
  return (
    typeof value === 'object' && value !== null && value.status === 'passed'
  );
}

/** @param {number} part @param {number} total */
function percentage(part, total) {
  return total === 0 ? 0 : Number(((part / total) * 100).toFixed(3));
}

/** @param {string} left @param {string} right */
function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
