/**
 * Immutable exact-path authorization for the audited ES2015 Test262 promotion.
 *
 * The manifest is intentionally separate from features.json: it records the
 * metadata and transitive harness dependencies reviewed for each individual
 * root, rather than claiming a feature works throughout Test262.
 */

import { createHash } from 'node:crypto';
import { sortStrings } from './selection.js';
import { upstreamSubsetPaths } from './upstream.js';

export const ES2015_PROMOTION_FILE = 'tools/test262/es2015-promotion.json';
export const ES2015_H0_OWNER_MAP_FILE =
  'tools/test262/es2015-h0-owner-map.json';
export const ES2015_H0_DISPOSITION_FILE =
  'tools/test262/es2015-h0-disposition.json';
export const ES2015_H0_OWNER_DELTAS_FILE =
  'tools/test262/es2015-h0-owner-deltas.json';
export const ES2015_H0_PROMOTION_FILE =
  'tools/test262/es2015-h0-promotion.json';
export const ES2015_H0_BASELINE_FILE = 'tools/test262/es2015-h0-baseline.json';
export const ES2015_H0_PATHS_FILE = 'tools/test262/es2015-h0-paths.json';
export const ES2015_PROMOTION_VERSION = 1;
export const ES2015_PROMOTION_GROUP = 'es2015/audit-passing-promotion';
export const ES2015_H0_PROMOTION_GROUP = 'es2015/h0-cross-realm-passed';

const MANIFEST_KEYS = Object.freeze([
  'version',
  'repository',
  'revision',
  'sourceTaxonomySha256',
  'ledgerSha256',
  'rootCount',
  'variantCount',
  'entries',
]);
const H0_PROMOTION_KEYS = Object.freeze([
  'version',
  'repository',
  'revision',
  'sourceTaxonomySha256',
  'h0LedgerSha256',
  'h0RootCount',
  'h0VariantCount',
  'dispositionSha256',
  'promotedLedgerSha256',
  'promotedRootCount',
  'promotedVariantCount',
  'entries',
]);
const ENTRY_KEYS = Object.freeze([
  'path',
  'variants',
  'features',
  'includeFeatures',
]);
const H0_PATHS_KEYS = Object.freeze([
  'version',
  'repository',
  'revision',
  'sourceTaxonomySha256',
  'ledgerSha256',
  'rootCount',
  'variantCount',
  'paths',
]);
const OWNER_MAP_KEYS = Object.freeze([
  'version',
  'repository',
  'revision',
  'owners',
  'rules',
]);
const OWNER_KEYS = Object.freeze(['code', 'issue', 'blocker', 'title']);
const OWNER_RULE_KEYS = Object.freeze([
  'name',
  'primaryOwner',
  'pathPrefix',
  'failureSignatures',
  'secondaryEvidence',
]);
const SECONDARY_EVIDENCE_KEYS = Object.freeze(['owner', 'signature']);
const H0_DISPOSITION_KEYS = Object.freeze([
  'version',
  'repository',
  'revision',
  'sourceTaxonomySha256',
  'h0LedgerSha256',
  'h0RootCount',
  'h0VariantCount',
  'executionEvidenceSha256',
  'ownerMapSha256',
  'executionPassedVariantCount',
  'executionFailedVariantCount',
  'completePassedRootCount',
  'completePassedVariantCount',
  'reassignedRootCount',
  'reassignedVariantCount',
  'allFailedRootCount',
  'allFailedVariantCount',
  'mixedRootCount',
  'mixedVariantCount',
  'dispositions',
]);
const H0_PASSED_DISPOSITION_KEYS = Object.freeze([
  'path',
  'status',
  'variants',
  'requiredVariants',
  'evidence',
]);
const H0_REASSIGNED_DISPOSITION_KEYS = Object.freeze([
  'path',
  'status',
  'variants',
  'requiredVariants',
  'primaryOwner',
  'failureSignatures',
  'secondaryEvidence',
  'evidence',
]);
const H0_EVIDENCE_KEYS = Object.freeze([
  'variant',
  'status',
  'reason',
  'message',
  'signature',
]);
const H0_PASSED_EVIDENCE_KEYS = Object.freeze(['variant', 'status']);
const H0_OWNER_DELTAS_KEYS = Object.freeze([
  'version',
  'repository',
  'revision',
  'h0LedgerSha256',
  'dispositionSha256',
  'promotionSha256',
  'trackingIssue',
  'provenance',
  'crossRealm',
  'deltas',
  'promotionGroup',
]);
const H0_OWNER_DELTA_PROVENANCE_KEYS = Object.freeze([
  'sourceTaxonomySha256',
  'executionEvidenceSha256',
  'ownerMapSha256',
]);
const H0_CROSS_REALM_DELTA_KEYS = Object.freeze([
  'blocker',
  'removedRoots',
  'removedVariants',
  'remainingRoots',
  'remainingVariants',
]);
const H0_OWNER_DELTA_KEYS = Object.freeze([
  'owner',
  'direction',
  'roots',
  'variants',
  'paths',
  'pathsSha256',
  'variantEvidenceSha256',
]);
const H0_BASELINE_KEYS = Object.freeze([
  'version',
  'finalBaseCommit',
  'repository',
  'revision',
  'finalBaseTaxonomySha256',
  'h0LedgerSha256',
  'h0RootCount',
  'h0VariantCount',
  'h0ClassificationSha256',
  'nonH0ClassificationSha256',
  'partitionStatusSummary',
  'partitionStatusSummarySha256',
]);
const H0_BASELINE_SUMMARY_KEYS = Object.freeze([
  'roots',
  'variants',
  'partitions',
  'statuses',
]);
const H0_BASELINE_PARTITION_KEYS = Object.freeze(['name', 'roots', 'variants']);
const H0_BASELINE_STATUS_KEYS = Object.freeze([
  'status',
  'blocker',
  'roots',
  'variants',
]);
const H0_EVIDENCE_BUNDLE_KEYS = Object.freeze([
  'pin',
  'pathsText',
  'baselineText',
  'dispositionText',
  'ownerMapText',
  'ownerDeltasText',
  'promotionText',
]);
const REVIEWED_TAXONOMY_DOCUMENT_KEYS = Object.freeze([
  'version',
  'pin',
  'policy',
  'inputs',
  'summary',
  'statusTables',
  'classifications',
]);
const REVIEWED_TAXONOMY_INPUT_KEYS = Object.freeze([
  'policySha256',
  'anchorsSha256',
  'subsetSha256',
  'featuresSha256',
  'selectedEvidenceSha256',
  'auditEvidenceSha256',
  'promotionSha256',
]);
const REVISION_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const REVIEWED_P0_ROOT_COUNT = 83;
const REVIEWED_P0_VARIANT_COUNT = 164;
const REVIEWED_P0_PATH_SHA256 =
  'b2657db74331391b156f87e1e831665ef4ae3a738d48836e476c13828b1aeff4';
const REVIEWED_P0_SOURCE_STATUS = 'blocked:lexical-grammar-and-new-target';
const REVIEWED_P0_SOURCE_BLOCKER = 'lexical-grammar-and-new-target';
const REVIEWED_P0_REASSIGNED_STATUS =
  'blocked:remaining-standard-library-additions';
const REVIEWED_P0_REASSIGNED_BLOCKER = 'remaining-standard-library-additions';
const REVIEWED_P0_INPUT_TRANSITIONS = Object.freeze({
  subsetSha256: Object.freeze([
    'cceaaf9807c0d32c32be5b0800a140612afddf9acf49bcdc0cf8f0102562fb39',
    'e76d5624e999b852df2c8c1bdb7dfebdcc5952083eb175f7ab67bd39ad75e4d8',
  ]),
  selectedEvidenceSha256: Object.freeze([
    '9de8674a603263d5d80d9e48d255879efa061b648cc9cb32eff399941a6927df',
    'c559d673e7ff2af88343eadf58b292db45d71ef99915699cc5d8e5310a73fc27',
  ]),
  auditEvidenceSha256: Object.freeze([
    'd560df3e1a9af905115324d529a0a101943d30fa0af8a8102b2dd344121ba9e4',
    '58f92e072306bfe99f8b9a57bf959469100b0e54816bef3263ec9b6c075a4990',
  ]),
});
const REVIEWED_P0_STATIC_INPUT_KEYS = Object.freeze([
  'policySha256',
  'anchorsSha256',
  'featuresSha256',
  'promotionSha256',
]);
/** @type {readonly string[]} */
const EMPTY_FEATURES = Object.freeze([]);
const entriesByManifest = new WeakMap();
const ROADMAP_OWNERS = Object.freeze({
  T1: Object.freeze({
    code: 'T1',
    issue: 75,
    blocker: 'unknown-edition',
    title: 'Adjudicate unknown Test262 edition provenance',
  }),
  H0: Object.freeze({
    code: 'H0',
    issue: 76,
    blocker: 'test262-cross-realm-host',
    title: 'Implement portable harness-only Test262 cross-Realm support',
  }),
  P0: Object.freeze({
    code: 'P0',
    issue: 77,
    blocker: 'lexical-grammar-and-new-target',
    title: 'Complete ES2015 lexical grammar and new.target',
  }),
  P1: Object.freeze({
    code: 'P1',
    issue: 78,
    blocker: 'early-errors-and-declaration-instantiation',
    title: 'Complete core ES2015 early errors and declaration instantiation',
  }),
  M0: Object.freeze({
    code: 'M0',
    issue: 79,
    blocker: 'proxy-and-reflect-metaobject',
    title: 'Formalize the ES2015 object internal-method contract',
  }),
  M1: Object.freeze({
    code: 'M1',
    issue: 80,
    blocker: 'proxy-and-reflect-metaobject',
    title: 'Complete ES2015 Reflect atop the internal-method contract',
  }),
  M2: Object.freeze({
    code: 'M2',
    issue: 81,
    blocker: 'proxy-and-reflect-metaobject',
    title: 'Implement ES2015 Proxy traps, revocation, and invariants',
  }),
  S0: Object.freeze({
    code: 'S0',
    issue: 82,
    blocker: 'symbol-protocol-dispatch',
    title: 'Complete non-RegExp ES2015 Symbol protocol dispatch',
  }),
  C0: Object.freeze({
    code: 'C0',
    issue: 83,
    blocker: 'keyed-collections',
    title: 'Implement the ordered collection kernel and ES2015 Map',
  }),
  C1: Object.freeze({
    code: 'C1',
    issue: 84,
    blocker: 'keyed-collections',
    title: 'Implement ES2015 Set and live collection iterators',
  }),
  C2: Object.freeze({
    code: 'C2',
    issue: 85,
    blocker: 'keyed-collections',
    title: 'Implement ES2015 WeakMap and WeakSet with private weak storage',
  }),
  C3: Object.freeze({
    code: 'C3',
    issue: 86,
    blocker: 'keyed-collections',
    title:
      'Integrate ES2015 collections across Realms, iterables, and consumers',
  }),
  B0: Object.freeze({
    code: 'B0',
    issue: 87,
    blocker: 'binary-data-and-typed-arrays',
    title: 'Implement Data Blocks, byte codecs, and ES2015 ArrayBuffer',
  }),
  B1: Object.freeze({
    code: 'B1',
    issue: 88,
    blocker: 'binary-data-and-typed-arrays',
    title: 'Implement ES2015 DataView',
  }),
  B2: Object.freeze({
    code: 'B2',
    issue: 89,
    blocker: 'binary-data-and-typed-arrays',
    title: 'Implement integer-indexed exotica and TypedArray constructors',
  }),
  B3: Object.freeze({
    code: 'B3',
    issue: 90,
    blocker: 'binary-data-and-typed-arrays',
    title:
      'Complete ES2015 TypedArray methods, species, iterators, and integration',
  }),
  R0: Object.freeze({
    code: 'R0',
    issue: 91,
    blocker: 'regexp-unicode-and-sticky',
    title: 'Implement ES2015 RegExp grammar, u/y, state, and probed backend',
  }),
  R1: Object.freeze({
    code: 'R1',
    issue: 92,
    blocker: 'symbol-protocol-dispatch',
    title: 'Complete RegExp/String Symbol protocol integration',
  }),
  L0: Object.freeze({
    code: 'L0',
    issue: 93,
    blocker: 'remaining-standard-library-additions',
    title: 'Complete ES2015 Array and Object additions',
  }),
  L1: Object.freeze({
    code: 'L1',
    issue: 94,
    blocker: 'remaining-standard-library-additions',
    title: 'Complete ES2015 String, Number, and Math additions',
  }),
  L2: Object.freeze({
    code: 'L2',
    issue: 95,
    blocker: 'remaining-standard-library-additions',
    title: 'Complete ES2015 Function, Date, Error, and JSON additions',
  }),
  G0: Object.freeze({
    code: 'G0',
    issue: 96,
    blocker: 'remaining-language-runtime-semantics',
    title: 'Complete remaining core ES2015 language runtime semantics',
  }),
  G1: Object.freeze({
    code: 'G1',
    issue: 97,
    blocker: 'proper-tail-calls',
    title: 'Implement mandatory ES2015 proper tail calls',
  }),
  V0: Object.freeze({
    code: 'V0',
    issue: 98,
    blocker: 'mandatory-sixth-edition-matrix',
    title: 'Build and close the mandatory Sixth Edition clause coverage matrix',
  }),
  A0: Object.freeze({
    code: 'A0',
    issue: 99,
    blocker: 'annex-b-web-compatibility',
    title: 'Complete optional Annex B web compatibility',
  }),
  F0: Object.freeze({
    code: 'F0',
    issue: 100,
    blocker: 'core-es2015-conformance',
    title: 'Integrate and publish core ECMAScript 2015 conformance',
  }),
});

/**
 * @typedef {Readonly<{
 *   path: string,
 *   variants: number,
 *   features: readonly string[],
 *   includeFeatures: readonly string[],
 * }>} Es2015PromotionEntry
 *
 * @typedef {Readonly<{
 *   version: number,
 *   repository: string,
 *   revision: string,
 *   sourceTaxonomySha256: string,
 *   ledgerSha256: string,
 *   rootCount: number,
 *   variantCount: number,
 *   entries: readonly Es2015PromotionEntry[],
 * }>} Es2015T0Promotion
 *
 * @typedef {Readonly<{
 *   groupName: string,
 *   version: number,
 *   repository: string,
 *   revision: string,
 *   sourceTaxonomySha256: string,
 *   h0LedgerSha256: string,
 *   h0RootCount: number,
 *   h0VariantCount: number,
 *   dispositionSha256: string,
 *   promotedLedgerSha256: string,
 *   promotedRootCount: number,
 *   promotedVariantCount: number,
 *   ledgerSha256: string,
 *   rootCount: number,
 *   variantCount: number,
 *   entries: readonly Es2015PromotionEntry[],
 * }>} Es2015H0Promotion
 *
 * @typedef {Es2015T0Promotion | Es2015H0Promotion} Es2015Promotion
 */

export class Es2015PromotionError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'Es2015PromotionError';
  }
}

/**
 * @param {string} text
 * @returns {Es2015Promotion}
 */
export function parseEs2015Promotion(text) {
  const record = parseJson(text, ES2015_PROMOTION_FILE);
  const hasH0Ledger = hasOwn(record, 'h0LedgerSha256');
  const hasPromotedLedger = hasOwn(record, 'promotedLedgerSha256');
  if (hasH0Ledger !== hasPromotedLedger) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} must not mix T0 and H0 promotion discriminators`,
    );
  }
  return hasH0Ledger
    ? parseH0PromotionRecord(record)
    : parseT0PromotionRecord(record);
}

/**
 * @param {Record<string, any>} record
 */
function parseT0PromotionRecord(record) {
  requireExactKeys(record, MANIFEST_KEYS, ES2015_PROMOTION_FILE);
  if (record.version !== ES2015_PROMOTION_VERSION) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} must declare version ${ES2015_PROMOTION_VERSION}`,
    );
  }
  if (typeof record.repository !== 'string' || record.repository === '') {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} must name the Test262 repository`,
    );
  }
  if (
    typeof record.revision !== 'string' ||
    !REVISION_PATTERN.test(record.revision)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} must pin a full Test262 revision`,
    );
  }
  for (const key of ['sourceTaxonomySha256', 'ledgerSha256']) {
    if (
      typeof record[key] !== 'string' ||
      !SHA256_PATTERN.test(/** @type {string} */ (record[key]))
    ) {
      throw new Es2015PromotionError(
        `${ES2015_PROMOTION_FILE} ${key} must be a SHA-256 digest`,
      );
    }
  }
  if (
    !positiveInteger(record.rootCount) ||
    !positiveInteger(record.variantCount)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} rootCount and variantCount must be positive integers`,
    );
  }
  if (!Array.isArray(record.entries) || record.entries.length === 0) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} must contain exact promotion entries`,
    );
  }

  const entries = record.entries.map((entry, index) =>
    parseEntry(entry, index),
  );
  const paths = entries.map((entry) => entry.path);

  if (new Set(paths).size !== paths.length) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} must not repeat a promoted path`,
    );
  }
  if (!sameStrings(paths, sortStrings([...paths]))) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} entries must be code-unit sorted by path`,
    );
  }
  if (record.rootCount !== entries.length) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} rootCount does not match its entries`,
    );
  }
  const variantCount = entries.reduce(
    (total, entry) => total + entry.variants,
    0,
  );
  if (record.variantCount !== variantCount) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} variantCount does not match its entries`,
    );
  }
  if (sha256(`${paths.join('\n')}\n`) !== record.ledgerSha256) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} ledgerSha256 does not match its exact paths`,
    );
  }

  const manifest = /** @type {Es2015T0Promotion} */ (
    Object.freeze({
      version: ES2015_PROMOTION_VERSION,
      repository: record.repository,
      revision: record.revision,
      sourceTaxonomySha256: record.sourceTaxonomySha256,
      ledgerSha256: record.ledgerSha256,
      rootCount: record.rootCount,
      variantCount: record.variantCount,
      entries: Object.freeze(entries),
    })
  );
  entriesByManifest.set(
    manifest,
    new Map(entries.map((entry) => [entry.path, entry])),
  );
  return manifest;
}

/**
 * @param {Record<string, any>} record
 */
function parseH0PromotionRecord(record) {
  requireExactKeys(record, H0_PROMOTION_KEYS, ES2015_H0_PROMOTION_FILE);
  if (record.version !== ES2015_PROMOTION_VERSION) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PROMOTION_FILE} must declare version ${ES2015_PROMOTION_VERSION}`,
    );
  }
  if (typeof record.repository !== 'string' || record.repository === '') {
    throw new Es2015PromotionError(
      `${ES2015_H0_PROMOTION_FILE} must name the Test262 repository`,
    );
  }
  if (
    typeof record.revision !== 'string' ||
    !REVISION_PATTERN.test(record.revision)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PROMOTION_FILE} must pin a full Test262 revision`,
    );
  }
  for (const key of [
    'sourceTaxonomySha256',
    'h0LedgerSha256',
    'dispositionSha256',
    'promotedLedgerSha256',
  ]) {
    if (
      typeof record[key] !== 'string' ||
      !SHA256_PATTERN.test(/** @type {string} */ (record[key]))
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_PROMOTION_FILE} ${key} must be a SHA-256 digest`,
      );
    }
  }
  if (
    !positiveInteger(record.h0RootCount) ||
    !positiveInteger(record.h0VariantCount) ||
    !positiveInteger(record.promotedRootCount) ||
    !positiveInteger(record.promotedVariantCount)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PROMOTION_FILE} counts must be positive integers`,
    );
  }
  if (
    record.promotedRootCount > record.h0RootCount ||
    record.promotedVariantCount > record.h0VariantCount
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PROMOTION_FILE} promoted counts cannot exceed H0 source counts`,
    );
  }
  if (!Array.isArray(record.entries) || record.entries.length === 0) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PROMOTION_FILE} must contain pass-only promotion entries`,
    );
  }

  const entries = record.entries.map((entry, index) =>
    parseEntry(entry, index, ES2015_H0_PROMOTION_FILE),
  );
  const paths = entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PROMOTION_FILE} must not repeat a promoted path`,
    );
  }
  if (!sameStrings(paths, sortStrings([...paths]))) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PROMOTION_FILE} entries must be code-unit sorted by path`,
    );
  }
  if (record.promotedRootCount !== entries.length) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PROMOTION_FILE} promotedRootCount does not match its entries`,
    );
  }
  const variantCount = entries.reduce(
    (total, entry) => total + entry.variants,
    0,
  );
  if (record.promotedVariantCount !== variantCount) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PROMOTION_FILE} promotedVariantCount does not match its entries`,
    );
  }
  if (sha256(`${paths.join('\n')}\n`) !== record.promotedLedgerSha256) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PROMOTION_FILE} promotedLedgerSha256 does not match its exact paths`,
    );
  }

  const manifest = /** @type {Es2015H0Promotion} */ (
    Object.freeze({
      groupName: ES2015_H0_PROMOTION_GROUP,
      version: ES2015_PROMOTION_VERSION,
      repository: record.repository,
      revision: record.revision,
      sourceTaxonomySha256: record.sourceTaxonomySha256,
      h0LedgerSha256: record.h0LedgerSha256,
      h0RootCount: record.h0RootCount,
      h0VariantCount: record.h0VariantCount,
      dispositionSha256: record.dispositionSha256,
      promotedLedgerSha256: record.promotedLedgerSha256,
      promotedRootCount: record.promotedRootCount,
      promotedVariantCount: record.promotedVariantCount,
      ledgerSha256: record.promotedLedgerSha256,
      rootCount: record.promotedRootCount,
      variantCount: record.promotedVariantCount,
      entries: Object.freeze(entries),
    })
  );
  entriesByManifest.set(
    manifest,
    new Map(entries.map((entry) => [entry.path, entry])),
  );
  return manifest;
}

/** @param {Es2015Promotion} promotion */
function promotionGroupName(promotion) {
  return isH0Promotion(promotion)
    ? promotion.groupName
    : ES2015_PROMOTION_GROUP;
}

/**
 * @param {Es2015Promotion} promotion
 * @returns {promotion is Es2015H0Promotion}
 */
function isH0Promotion(promotion) {
  return 'h0LedgerSha256' in promotion;
}

/**
 * @param {ReturnType<typeof parseEs2015Promotion>} manifest
 * @returns {readonly string[]}
 */
export function promotionPaths(manifest) {
  manifestEntries(manifest);
  return Object.freeze(manifest.entries.map((entry) => entry.path));
}

/**
 * Validates the live root facts against the immutable manifest and returns only
 * the dependencies authorized for this exact promoted root. A non-promoted
 * root receives no additional support.
 *
 * @param {ReturnType<typeof parseEs2015Promotion>} manifest
 * @param {string} file
 * @param {{ features?: readonly string[] }} metadata
 * @param {readonly string[]} includeClosure
 * @returns {readonly string[]}
 */
export function supportedFeaturesForPromotedPath(
  manifest,
  file,
  metadata,
  includeClosure,
) {
  const entry = manifestEntries(manifest).get(file);
  if (entry === undefined) {
    return EMPTY_FEATURES;
  }

  const features = normalizedStringList(
    metadata?.features,
    `${file} metadata features`,
  );
  const includes = normalizedStringList(
    includeClosure,
    `${file} include feature closure`,
  );
  if (!sameStrings(features, entry.features)) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} metadata dependencies drifted for ${file}`,
    );
  }
  if (!sameStrings(includes, entry.includeFeatures)) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} include dependencies drifted for ${file}`,
    );
  }
  return Object.freeze(
    sortStrings([...entry.features, ...entry.includeFeatures]),
  );
}

/**
 * Checks the pinned environment and independently gathered root facts before
 * exact-path authorization is used by a Node boundary.
 *
 * @param {ReturnType<typeof parseEs2015Promotion>} manifest
 * @param {{
 *   pin: { repository: string, revision: string },
 *   policy: {
 *     es2015Features: readonly string[],
 *     neutralFeatures: readonly string[],
 *     laterFeatures: readonly string[],
 *   },
 *   selectedPaths: ReadonlySet<string> | readonly string[],
 *   inventory?: readonly {
 *     path: string,
 *     variants: number,
 *     metadata: { features?: readonly string[] } | null,
 *     includeFeatures: readonly string[],
 *   }[],
 *   sourceTaxonomyText?: string,
 * }} options
 */
export function validateEs2015Promotion(manifest, options) {
  const entries = manifestEntries(manifest);
  const pin = options?.pin;
  if (
    typeof pin?.repository !== 'string' ||
    typeof pin?.revision !== 'string' ||
    manifest.repository !== pin.repository ||
    manifest.revision !== pin.revision
  ) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} does not match the pinned Test262 repository and revision`,
    );
  }

  const selected = stringSet(options?.selectedPaths, 'selected paths');
  for (const path of entries.keys()) {
    if (!selected.has(path)) {
      throw new Es2015PromotionError(
        `${ES2015_PROMOTION_FILE} path ${path} is not selected`,
      );
    }
  }

  const policy = options?.policy;
  if (
    !Array.isArray(policy?.es2015Features) ||
    !Array.isArray(policy?.neutralFeatures) ||
    !Array.isArray(policy?.laterFeatures)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} requires the reviewed ES2015 policy`,
    );
  }
  const allowed = new Set([
    ...policy.es2015Features,
    ...policy.neutralFeatures,
  ]);
  const later = new Set(policy.laterFeatures);

  for (const entry of entries.values()) {
    for (const feature of [...entry.features, ...entry.includeFeatures]) {
      if (later.has(feature)) {
        throw new Es2015PromotionError(
          `${ES2015_PROMOTION_FILE} authorizes later dependency ${feature} for ${entry.path}`,
        );
      }
      if (!allowed.has(feature)) {
        throw new Es2015PromotionError(
          `${ES2015_PROMOTION_FILE} authorizes unknown non-ES2015 dependency ${feature} for ${entry.path}`,
        );
      }
    }
  }

  if (options?.sourceTaxonomyText !== undefined) {
    if (sha256(options.sourceTaxonomyText) !== manifest.sourceTaxonomySha256) {
      throw new Es2015PromotionError(
        `${ES2015_PROMOTION_FILE} source taxonomy hash does not match`,
      );
    }
  }

  if (options?.inventory === undefined) {
    return;
  }

  const inventory = new Map();
  for (const root of options.inventory) {
    if (
      typeof root !== 'object' ||
      root === null ||
      typeof root.path !== 'string' ||
      inventory.has(root.path)
    ) {
      throw new Es2015PromotionError(
        `${ES2015_PROMOTION_FILE} inventory contains an invalid or duplicate root`,
      );
    }
    inventory.set(root.path, root);
  }
  for (const entry of entries.values()) {
    const root = inventory.get(entry.path);
    if (root === undefined) {
      throw new Es2015PromotionError(
        `${ES2015_PROMOTION_FILE} path ${entry.path} is missing from the pinned inventory`,
      );
    }
    if (root.variants !== entry.variants || root.metadata === null) {
      throw new Es2015PromotionError(
        `${ES2015_PROMOTION_FILE} root facts drifted for ${entry.path}`,
      );
    }
    supportedFeaturesForPromotedPath(
      manifest,
      entry.path,
      root.metadata,
      root.includeFeatures,
    );
  }
}

/**
 * Validates immutable promotion facts at a Node boundary, then returns the
 * per-file callback the portable runner uses while deciding feature skips.
 *
 * @param {{
 *   promotionText: string,
 *   pin: { repository: string, revision: string },
 *   policy: {
 *     es2015Features: readonly string[],
 *     neutralFeatures: readonly string[],
 *     laterFeatures: readonly string[],
 *   },
 *   subset: import('./upstream.js').Test262UpstreamSubset,
 *   inventory: readonly {
 *     path: string,
 *     variants: number,
 *     metadata: { features?: readonly string[] } | null,
 *     includeFeatures: readonly string[],
 *   }[],
 * }} options
 */
export function createEs2015PromotionAuthorization(options) {
  const promotion = parseEs2015Promotion(options.promotionText);
  const groupName = promotionGroupName(promotion);
  const groups = options.subset.groups.filter(
    (group) => group.name === groupName,
  );
  const paths = promotionPaths(promotion);

  if (groups.length !== 1 || !sameStrings(groups[0].paths, paths)) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} must match exactly one ${groupName} subset group`,
    );
  }
  validateEs2015Promotion(promotion, {
    pin: options.pin,
    policy: options.policy,
    selectedPaths: upstreamSubsetPaths(options.subset),
    inventory: options.inventory,
  });

  const roots = new Map(options.inventory.map((root) => [root.path, root]));
  /**
   * @param {string} file
   * @param {{ features?: readonly string[] }} metadata
   */
  return (file, metadata) =>
    supportedFeaturesForPromotedPath(
      promotion,
      file,
      metadata,
      roots.get(file)?.includeFeatures ?? [],
    );
}

/**
 * Validates all reviewed exact promotion sources and returns one runner
 * callback. Non-promoted roots receive no feature widening.
 *
 * @param {{
 *   promotionTexts: readonly string[],
 *   pin: { repository: string, revision: string },
 *   policy: {
 *     es2015Features: readonly string[],
 *     neutralFeatures: readonly string[],
 *     laterFeatures: readonly string[],
 *   },
 *   subset: import('./upstream.js').Test262UpstreamSubset,
 *   inventory: readonly {
 *     path: string,
 *     variants: number,
 *     metadata: { features?: readonly string[] } | null,
 *     includeFeatures: readonly string[],
 *   }[],
 * }} options
 */
export function createEs2015PromotionAuthorizations(options) {
  const promotions = options.promotionTexts.map((text) =>
    parseEs2015Promotion(text),
  );
  const roots = new Map(options.inventory.map((root) => [root.path, root]));
  const promotedPaths = new Set();
  for (const promotion of promotions) {
    const groupName = promotionGroupName(promotion);
    const groups = options.subset.groups.filter(
      (group) => group.name === groupName,
    );
    const paths = promotionPaths(promotion);
    if (groups.length !== 1 || !sameStrings(groups[0].paths, paths)) {
      throw new Es2015PromotionError(
        `${groupName} must select exactly the reviewed promotion paths`,
      );
    }
    for (const path of paths) {
      if (promotedPaths.has(path)) {
        throw new Es2015PromotionError(
          `${groupName} overlaps another reviewed promotion source at ${path}`,
        );
      }
      promotedPaths.add(path);
    }
    validateEs2015Promotion(promotion, {
      pin: options.pin,
      policy: options.policy,
      selectedPaths: upstreamSubsetPaths(options.subset),
      inventory: options.inventory.filter((root) => paths.includes(root.path)),
    });
  }

  return (
    /** @type {string} */ file,
    /** @type {{ features?: readonly string[] }} */ metadata,
  ) => {
    for (const promotion of promotions) {
      const entry = manifestEntries(promotion).get(file);
      if (entry !== undefined) {
        return supportedFeaturesForPromotedPath(
          promotion,
          file,
          metadata,
          roots.get(file)?.includeFeatures ?? [],
        );
      }
    }
    return EMPTY_FEATURES;
  };
}

/**
 * Adds the reviewed exact promotion to the generated ES5 selection without
 * making its paths candidates of the broad ES5 policy.
 *
 * @param {import('./upstream.js').Test262UpstreamSubset} subset
 * @param {ReturnType<typeof parseEs2015Promotion>} promotion
 * @returns {import('./upstream.js').Test262UpstreamSubset}
 */
export function mergePromotionSubset(subset, promotion) {
  const paths = promotionPaths(promotion);
  const selected = new Set(upstreamSubsetPaths(subset));
  const groupName = promotionGroupName(promotion);

  if (subset.groups.some((group) => group.name === groupName)) {
    throw new Es2015PromotionError(
      groupName === ES2015_PROMOTION_GROUP
        ? `${ES2015_PROMOTION_FILE} promotion group is already present`
        : `${ES2015_PROMOTION_FILE} promotion group ${groupName} is already present`,
    );
  }
  for (const path of paths) {
    if (selected.has(path)) {
      throw new Es2015PromotionError(
        `${ES2015_PROMOTION_FILE} path ${path} overlaps the generated ES5 selection`,
      );
    }
  }

  const group = Object.freeze({
    name: groupName,
    summary:
      groupName === ES2015_H0_PROMOTION_GROUP
        ? 'Exact H0 cross-Realm roots with complete passed dispositions.'
        : 'Exact audited ES2015 roots with immutable per-path feature authorization.',
    paths: Object.freeze([...paths]),
  });
  const groups = [...subset.groups, group].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );

  return Object.freeze({
    version: subset.version,
    repository: subset.repository,
    revision: subset.revision,
    groups: Object.freeze(groups),
  });
}

/**
 * Adds several reviewed exact promotions to the generated selection.
 *
 * @param {import('./upstream.js').Test262UpstreamSubset} subset
 * @param {readonly ReturnType<typeof parseEs2015Promotion>[]} promotions
 * @returns {import('./upstream.js').Test262UpstreamSubset}
 */
export function mergePromotionSubsets(subset, promotions) {
  let merged = subset;
  for (const promotion of promotions) {
    merged = mergePromotionSubset(merged, promotion);
  }
  return merged;
}

/**
 * @param {string} text
 * @param {{
 *   pin?: { repository: string, revision: string },
 *   paths?: ReturnType<typeof parseEs2015H0Paths>,
 *   ownerMapText?: string,
 * }} [options]
 */
export function parseEs2015H0Disposition(text, options = {}) {
  const record = parseJson(text, ES2015_H0_DISPOSITION_FILE);
  requireExactKeys(record, H0_DISPOSITION_KEYS, ES2015_H0_DISPOSITION_FILE);
  validateRepositoryRevision(record, ES2015_H0_DISPOSITION_FILE, true);
  for (const key of [
    'sourceTaxonomySha256',
    'h0LedgerSha256',
    'executionEvidenceSha256',
    'ownerMapSha256',
  ]) {
    if (
      typeof record[key] !== 'string' ||
      !SHA256_PATTERN.test(/** @type {string} */ (record[key]))
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} ${key} must be a SHA-256 digest`,
      );
    }
  }
  for (const key of [
    'h0RootCount',
    'h0VariantCount',
    'executionPassedVariantCount',
    'executionFailedVariantCount',
    'completePassedRootCount',
    'completePassedVariantCount',
    'reassignedRootCount',
    'reassignedVariantCount',
    'allFailedRootCount',
    'allFailedVariantCount',
    'mixedRootCount',
    'mixedVariantCount',
  ]) {
    if (!nonNegativeInteger(record[key])) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} ${key} must be a non-negative integer`,
      );
    }
  }
  if (!Array.isArray(record.dispositions) || record.dispositions.length === 0) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} must contain H0 dispositions`,
    );
  }

  const dispositions = record.dispositions.map((entry, index) =>
    parseDispositionEntry(entry, index),
  );
  const paths = dispositions.map((entry) => entry.path);
  assertSortedUnique(paths, `${ES2015_H0_DISPOSITION_FILE} dispositions`);
  if (record.h0RootCount !== dispositions.length) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} h0RootCount does not match dispositions`,
    );
  }
  if (sha256(`${paths.join('\n')}\n`) !== record.h0LedgerSha256) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} h0LedgerSha256 does not match disposition paths`,
    );
  }

  const counts = dispositionCounts(dispositions);
  for (const [key, value] of Object.entries(counts)) {
    if (record[key] !== value) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} ${key} does not match dispositions`,
      );
    }
  }
  if (
    record.executionEvidenceSha256 !==
    h0ExecutionEvidenceSha256(
      record.repository,
      record.revision,
      dispositionExecutionRecords(dispositions),
    )
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} execution evidence hash does not match dispositions`,
    );
  }

  const disposition = Object.freeze({
    version: ES2015_PROMOTION_VERSION,
    repository: record.repository,
    revision: record.revision,
    sourceTaxonomySha256: record.sourceTaxonomySha256,
    h0LedgerSha256: record.h0LedgerSha256,
    h0RootCount: record.h0RootCount,
    h0VariantCount: record.h0VariantCount,
    executionEvidenceSha256: record.executionEvidenceSha256,
    ownerMapSha256: record.ownerMapSha256,
    executionPassedVariantCount: record.executionPassedVariantCount,
    executionFailedVariantCount: record.executionFailedVariantCount,
    completePassedRootCount: record.completePassedRootCount,
    completePassedVariantCount: record.completePassedVariantCount,
    reassignedRootCount: record.reassignedRootCount,
    reassignedVariantCount: record.reassignedVariantCount,
    allFailedRootCount: record.allFailedRootCount,
    allFailedVariantCount: record.allFailedVariantCount,
    mixedRootCount: record.mixedRootCount,
    mixedVariantCount: record.mixedVariantCount,
    dispositions: Object.freeze(dispositions),
  });
  if (options.pin !== undefined) {
    assertPinMatches(disposition, options.pin, ES2015_H0_DISPOSITION_FILE);
  }
  if (options.paths !== undefined) {
    assertH0IdentityMatchesPaths(
      disposition,
      options.paths,
      ES2015_H0_DISPOSITION_FILE,
    );
    if (
      !sameStrings(
        disposition.dispositions.map((entry) => entry.path),
        options.paths.paths,
      )
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} dispositions do not match the immutable H0 paths`,
      );
    }
  }
  if (
    options.ownerMapText !== undefined &&
    disposition.ownerMapSha256 !== sha256(options.ownerMapText)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} owner-map evidence is stale`,
    );
  }
  return disposition;
}

/**
 * @param {{
 *   pathsManifestText: string,
 *   baselineTaxonomyText: string,
 *   executionEvidenceText: string,
 *   ownerMapText: string,
 *   pin: { repository: string, revision: string },
 *   inventory: readonly any[],
 * }} options
 */
export function buildEs2015H0Disposition(options) {
  const pathsManifest = parseH0PathsManifest(options.pathsManifestText);
  assertPinMatches(pathsManifest, options.pin, ES2015_H0_DISPOSITION_FILE);
  const taxonomy = taxonomyClassifications(options.baselineTaxonomyText);
  const ownerMap = parseEs2015H0OwnerMap(options.ownerMapText, options.pin);
  const evidence = parseH0ExecutionEvidence(options.executionEvidenceText);
  assertPinMatches(evidence, options.pin, ES2015_H0_DISPOSITION_FILE);
  const inventory = inventoryByPath(options.inventory);
  const evidenceByPath = executionRecordsByPath(evidence.records);
  const taxonomyByPath = new Map(taxonomy.map((entry) => [entry.path, entry]));
  /** @type {any[]} */
  const dispositions = [];

  for (const path of pathsManifest.paths) {
    const taxonomyEntry = taxonomyByPath.get(path);
    if (
      taxonomyEntry === undefined ||
      taxonomyEntry.partition !== 'core' ||
      taxonomyEntry.blocker !== 'test262-cross-realm-host'
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} H0 root ${path} is not a core test262-cross-realm-host blocker`,
      );
    }
    const root = inventory.get(path);
    if (root === undefined) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} inventory is missing H0 root ${path}`,
      );
    }
    const variants = requiredVariants(root, path);
    if (taxonomyEntry.variants !== variants.length) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} taxonomy variant count drifted for ${path}`,
      );
    }
    const records = evidenceByPath.get(path);
    if (records === undefined) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} execution evidence is missing H0 root ${path}`,
      );
    }
    assertExactVariantRecords(
      records,
      variants,
      `${ES2015_H0_DISPOSITION_FILE} ${path}`,
    );
    const statuses = new Set(
      records.map((/** @type {any} */ record) => record.status),
    );
    if (statuses.has('skipped')) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} H0 evidence must not skip ${path}`,
      );
    }
    if (statuses.size === 1 && statuses.has('passed')) {
      dispositions.push(
        freezeDisposition({
          path,
          status: 'passed',
          variants: variants.length,
          requiredVariants: variants,
          evidence: records.map((/** @type {any} */ record) =>
            Object.freeze({ variant: record.variant, status: 'passed' }),
          ),
        }),
      );
      continue;
    }
    if (!statuses.has('failed')) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} H0 evidence for ${path} has unknown statuses`,
      );
    }
    const failedRecords = records.filter(
      (/** @type {any} */ record) => record.status === 'failed',
    );
    const reassignment = matchOwnerRules(path, failedRecords, ownerMap);
    dispositions.push(
      freezeDisposition({
        path,
        status: 'reassigned',
        variants: variants.length,
        requiredVariants: variants,
        primaryOwner: reassignment.primaryOwner,
        failureSignatures: reassignment.failureSignatures,
        secondaryEvidence: reassignment.secondaryEvidence,
        evidence: records.map((/** @type {any} */ record) => {
          if (record.status === 'passed') {
            return Object.freeze({
              variant: record.variant,
              status: 'passed',
            });
          }
          return Object.freeze({
            variant: record.variant,
            status: 'failed',
            reason: record.reason,
            message: record.message,
            signature: normalizeFailureSignature(record),
          });
        }),
      }),
    );
  }
  for (const path of evidenceByPath.keys()) {
    if (!pathsManifest.pathSet.has(path)) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} execution evidence names foreign H0 root ${path}`,
      );
    }
  }

  dispositions.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  const counts = dispositionCounts(dispositions);
  if (
    counts.executionPassedVariantCount + counts.executionFailedVariantCount !==
    pathsManifest.variantCount
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} disposition variants do not cover the H0 manifest`,
    );
  }
  if (
    counts.completePassedVariantCount + counts.reassignedVariantCount !==
    pathsManifest.variantCount
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} root disposition variants do not cover the H0 manifest`,
    );
  }

  return Object.freeze({
    version: ES2015_PROMOTION_VERSION,
    repository: pathsManifest.repository,
    revision: pathsManifest.revision,
    sourceTaxonomySha256: sha256(options.baselineTaxonomyText),
    h0LedgerSha256: pathsManifest.ledgerSha256,
    h0RootCount: pathsManifest.rootCount,
    h0VariantCount: counts.h0VariantCount,
    executionEvidenceSha256: h0ExecutionEvidenceSha256(
      evidence.repository,
      evidence.revision,
      evidence.records,
    ),
    ownerMapSha256: sha256(options.ownerMapText),
    executionPassedVariantCount: counts.executionPassedVariantCount,
    executionFailedVariantCount: counts.executionFailedVariantCount,
    completePassedRootCount: counts.completePassedRootCount,
    completePassedVariantCount: counts.completePassedVariantCount,
    reassignedRootCount: counts.reassignedRootCount,
    reassignedVariantCount: counts.reassignedVariantCount,
    allFailedRootCount: counts.allFailedRootCount,
    allFailedVariantCount: counts.allFailedVariantCount,
    mixedRootCount: counts.mixedRootCount,
    mixedVariantCount: counts.mixedVariantCount,
    dispositions: Object.freeze(dispositions),
  });
}

/**
 * @param {{
 *   sourceTaxonomyText: string,
 *   dispositionText: string,
 *   pin: { repository: string, revision: string },
 *   inventory: readonly any[],
 * }} options
 */
export function buildEs2015Promotion(options) {
  const disposition = parseEs2015H0Disposition(options.dispositionText);
  assertPinMatches(disposition, options.pin, ES2015_H0_PROMOTION_FILE);
  if (sha256(options.sourceTaxonomyText) !== disposition.sourceTaxonomySha256) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PROMOTION_FILE} source taxonomy hash does not match disposition`,
    );
  }
  const inventory = inventoryByPath(options.inventory);
  const passed = disposition.dispositions.filter(
    (entry) => entry.status === 'passed',
  );
  const entries = passed.map((entry) => {
    const root = inventory.get(entry.path);
    if (root === undefined || root.metadata === null) {
      throw new Es2015PromotionError(
        `${ES2015_H0_PROMOTION_FILE} inventory is missing passed H0 root ${entry.path}`,
      );
    }
    if (root.variants !== entry.variants) {
      throw new Es2015PromotionError(
        `${ES2015_H0_PROMOTION_FILE} inventory variant count drifted for ${entry.path}`,
      );
    }
    return Object.freeze({
      path: entry.path,
      variants: entry.variants,
      features: Object.freeze(
        sortedStringList(
          root.metadata.features ?? [],
          `${entry.path} features`,
        ),
      ),
      includeFeatures: Object.freeze(
        sortedStringList(
          root.includeFeatures ?? [],
          `${entry.path} includeFeatures`,
        ),
      ),
    });
  });
  entries.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  const paths = entries.map((entry) => entry.path);
  const manifest = Object.freeze({
    version: ES2015_PROMOTION_VERSION,
    repository: disposition.repository,
    revision: disposition.revision,
    sourceTaxonomySha256: disposition.sourceTaxonomySha256,
    h0LedgerSha256: disposition.h0LedgerSha256,
    h0RootCount: disposition.h0RootCount,
    h0VariantCount: disposition.h0VariantCount,
    dispositionSha256: sha256(options.dispositionText),
    promotedLedgerSha256: sha256(`${paths.join('\n')}\n`),
    promotedRootCount: entries.length,
    promotedVariantCount: entries.reduce(
      (total, entry) => total + entry.variants,
      0,
    ),
    entries: Object.freeze(entries),
  });
  parseEs2015Promotion(JSON.stringify(manifest));
  return manifest;
}

/**
 * @param {{
 *   beforeTaxonomyText: string,
 *   afterTaxonomyText: string,
 *   dispositionText: string,
 *   promotionText: string,
 *   sourceTaxonomySha256?: string,
 * }} options
 */
export function buildEs2015H0OwnerDeltas(options) {
  const disposition = parseEs2015H0Disposition(options.dispositionText);
  const promotion = parseEs2015Promotion(options.promotionText);
  if (
    (options.sourceTaxonomySha256 ?? sha256(options.beforeTaxonomyText)) !==
    disposition.sourceTaxonomySha256
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} source taxonomy does not match disposition provenance`,
    );
  }
  if (
    !isH0Promotion(promotion) ||
    promotion.groupName !== ES2015_H0_PROMOTION_GROUP
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} requires the H0 promotion manifest`,
    );
  }
  if (
    promotion.h0LedgerSha256 !== disposition.h0LedgerSha256 ||
    promotion.h0RootCount !== disposition.h0RootCount ||
    promotion.h0VariantCount !== disposition.h0VariantCount ||
    promotion.dispositionSha256 !== sha256(options.dispositionText)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} promotion does not match disposition provenance`,
    );
  }
  const before = taxonomyByPath(options.beforeTaxonomyText);
  const after = taxonomyByPath(options.afterTaxonomyText);
  /** @type {any[]} */
  const removed = [];
  /** @type {Map<string, { owner: any, entries: any[] }>} */
  const added = new Map();

  for (const entry of disposition.dispositions) {
    const beforeEntry = before.get(entry.path);
    const afterEntry = after.get(entry.path);
    if (
      beforeEntry?.blocker === 'test262-cross-realm-host' &&
      afterEntry?.blocker !== 'test262-cross-realm-host'
    ) {
      removed.push(entry);
    }
    if (entry.status === 'reassigned') {
      const key = entry.primaryOwner.code;
      const current = added.get(key) ?? {
        owner: entry.primaryOwner,
        entries: [],
      };
      current.entries.push(entry);
      added.set(key, current);
    }
  }

  const deltas = [
    h0OwnerDelta(roadmapOwner('H0'), 'removed', removed),
    ...[...added.values()]
      .sort((left, right) => compareStrings(left.owner.code, right.owner.code))
      .map((delta) => h0OwnerDelta(delta.owner, 'added', delta.entries)),
  ];
  const removedDelta = deltas[0];
  const remaining = disposition.dispositions.filter((entry) => {
    const afterEntry = after.get(entry.path);
    return afterEntry?.blocker === 'test262-cross-realm-host';
  });

  return Object.freeze({
    version: ES2015_PROMOTION_VERSION,
    repository: disposition.repository,
    revision: disposition.revision,
    h0LedgerSha256: disposition.h0LedgerSha256,
    dispositionSha256: sha256(options.dispositionText),
    promotionSha256: sha256(options.promotionText),
    trackingIssue: 70,
    provenance: Object.freeze({
      sourceTaxonomySha256: disposition.sourceTaxonomySha256,
      executionEvidenceSha256: disposition.executionEvidenceSha256,
      ownerMapSha256: disposition.ownerMapSha256,
    }),
    crossRealm: Object.freeze({
      blocker: 'test262-cross-realm-host',
      removedRoots: removedDelta.roots,
      removedVariants: removedDelta.variants,
      remainingRoots: remaining.length,
      remainingVariants: remaining.reduce(
        (total, entry) => total + entry.variants,
        0,
      ),
    }),
    deltas: Object.freeze(deltas),
    promotionGroup: promotionGroupName(promotion),
  });
}

/**
 * @param {string} text
 * @param {{
 *   pin?: { repository: string, revision: string },
 *   paths?: ReturnType<typeof parseEs2015H0Paths>,
 *   dispositionText?: string,
 *   promotionText?: string,
 * }} [options]
 */
export function parseEs2015H0OwnerDeltas(text, options = {}) {
  const record = parseJson(text, ES2015_H0_OWNER_DELTAS_FILE);
  requireExactKeys(record, H0_OWNER_DELTAS_KEYS, ES2015_H0_OWNER_DELTAS_FILE);
  validateRepositoryRevision(record, ES2015_H0_OWNER_DELTAS_FILE);
  for (const key of [
    'h0LedgerSha256',
    'dispositionSha256',
    'promotionSha256',
  ]) {
    if (
      typeof record[key] !== 'string' ||
      !SHA256_PATTERN.test(/** @type {string} */ (record[key]))
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_OWNER_DELTAS_FILE} ${key} must be a SHA-256 digest`,
      );
    }
  }
  if (record.trackingIssue !== 70) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} must track issue #70`,
    );
  }
  const provenance = parseH0OwnerDeltaProvenance(record.provenance);
  const crossRealm = parseH0CrossRealmDelta(record.crossRealm);
  if (!Array.isArray(record.deltas) || record.deltas.length === 0) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} must contain owner deltas`,
    );
  }
  const deltas = record.deltas.map((entry, index) =>
    parseH0OwnerDelta(entry, index),
  );
  const [removed, ...added] = deltas;
  if (
    removed.owner.code !== 'H0' ||
    removed.direction !== 'removed' ||
    added.some(
      (entry) => entry.direction !== 'added' || entry.owner.code === 'H0',
    )
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} must begin with one H0 removal followed by owner additions`,
    );
  }
  assertSortedUnique(
    added.map((entry) => entry.owner.code),
    `${ES2015_H0_OWNER_DELTAS_FILE} added owner codes`,
  );
  if (
    crossRealm.removedRoots !== removed.roots ||
    crossRealm.removedVariants !== removed.variants
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} cross-Realm removal counts are stale`,
    );
  }
  if (record.promotionGroup !== ES2015_H0_PROMOTION_GROUP) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} must name ${ES2015_H0_PROMOTION_GROUP}`,
    );
  }
  const ownerDeltas = Object.freeze({
    version: ES2015_PROMOTION_VERSION,
    repository: record.repository,
    revision: record.revision,
    h0LedgerSha256: record.h0LedgerSha256,
    dispositionSha256: record.dispositionSha256,
    promotionSha256: record.promotionSha256,
    trackingIssue: record.trackingIssue,
    provenance,
    crossRealm,
    deltas: Object.freeze(deltas),
    promotionGroup: record.promotionGroup,
  });
  if (options.pin !== undefined) {
    assertPinMatches(ownerDeltas, options.pin, ES2015_H0_OWNER_DELTAS_FILE);
  }
  if (options.paths !== undefined) {
    if (
      ownerDeltas.repository !== options.paths.repository ||
      ownerDeltas.revision !== options.paths.revision ||
      ownerDeltas.h0LedgerSha256 !== options.paths.ledgerSha256
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_OWNER_DELTAS_FILE} does not match the immutable H0 paths`,
      );
    }
  }
  if (
    options.dispositionText !== undefined &&
    ownerDeltas.dispositionSha256 !== sha256(options.dispositionText)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} disposition evidence is stale`,
    );
  }
  if (
    options.promotionText !== undefined &&
    ownerDeltas.promotionSha256 !== sha256(options.promotionText)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} promotion evidence is stale`,
    );
  }
  return ownerDeltas;
}

/**
 * @param {any} owner
 * @param {'removed' | 'added'} direction
 * @param {readonly any[]} entries
 */
function h0OwnerDelta(owner, direction, entries) {
  const sortedEntries = [...entries].sort((left, right) =>
    compareStrings(left.path, right.path),
  );
  const paths = sortedEntries.map((entry) => entry.path);
  return Object.freeze({
    owner,
    direction,
    roots: paths.length,
    variants: sortedEntries.reduce((total, entry) => total + entry.variants, 0),
    paths: Object.freeze(paths),
    pathsSha256: sha256(`${paths.join('\n')}\n`),
    variantEvidenceSha256: h0VariantEvidenceSha256(sortedEntries),
  });
}

/** @param {unknown} value */
function parseH0OwnerDeltaProvenance(value) {
  const record = object(value, `${ES2015_H0_OWNER_DELTAS_FILE} provenance`);
  requireExactKeys(
    record,
    H0_OWNER_DELTA_PROVENANCE_KEYS,
    `${ES2015_H0_OWNER_DELTAS_FILE} provenance`,
  );
  for (const key of H0_OWNER_DELTA_PROVENANCE_KEYS) {
    if (
      typeof record[key] !== 'string' ||
      !SHA256_PATTERN.test(/** @type {string} */ (record[key]))
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_OWNER_DELTAS_FILE} provenance ${key} must be a SHA-256 digest`,
      );
    }
  }
  return Object.freeze({
    sourceTaxonomySha256: record.sourceTaxonomySha256,
    executionEvidenceSha256: record.executionEvidenceSha256,
    ownerMapSha256: record.ownerMapSha256,
  });
}

/** @param {unknown} value */
function parseH0CrossRealmDelta(value) {
  const record = object(value, `${ES2015_H0_OWNER_DELTAS_FILE} crossRealm`);
  requireExactKeys(
    record,
    H0_CROSS_REALM_DELTA_KEYS,
    `${ES2015_H0_OWNER_DELTAS_FILE} crossRealm`,
  );
  if (record.blocker !== 'test262-cross-realm-host') {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} crossRealm blocker is invalid`,
    );
  }
  for (const key of [
    'removedRoots',
    'removedVariants',
    'remainingRoots',
    'remainingVariants',
  ]) {
    if (!nonNegativeInteger(record[key])) {
      throw new Es2015PromotionError(
        `${ES2015_H0_OWNER_DELTAS_FILE} crossRealm ${key} must be a non-negative integer`,
      );
    }
  }
  return Object.freeze({
    blocker: record.blocker,
    removedRoots: record.removedRoots,
    removedVariants: record.removedVariants,
    remainingRoots: record.remainingRoots,
    remainingVariants: record.remainingVariants,
  });
}

/** @param {unknown} value @param {number} index */
function parseH0OwnerDelta(value, index) {
  const record = object(value, `${ES2015_H0_OWNER_DELTAS_FILE} delta ${index}`);
  requireExactKeys(
    record,
    H0_OWNER_DELTA_KEYS,
    `${ES2015_H0_OWNER_DELTAS_FILE} delta ${index}`,
  );
  const owner = parseDispositionOwner(
    record.owner,
    `${ES2015_H0_OWNER_DELTAS_FILE} delta ${index}`,
  );
  if (!['removed', 'added'].includes(record.direction)) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} delta ${index} has invalid direction`,
    );
  }
  if (
    !nonNegativeInteger(record.roots) ||
    !nonNegativeInteger(record.variants)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} delta ${index} counts must be non-negative integers`,
    );
  }
  const paths = sortedStringList(
    record.paths,
    `${ES2015_H0_OWNER_DELTAS_FILE} delta ${index} paths`,
  );
  if (
    paths.some((path) => !path.startsWith('test/') || !path.endsWith('.js')) ||
    record.roots !== paths.length ||
    record.pathsSha256 !== sha256(`${paths.join('\n')}\n`)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} delta ${index} paths are stale`,
    );
  }
  if (
    typeof record.variantEvidenceSha256 !== 'string' ||
    !SHA256_PATTERN.test(record.variantEvidenceSha256)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} delta ${index} variant evidence hash must be a SHA-256 digest`,
    );
  }
  return Object.freeze({
    owner,
    direction: record.direction,
    roots: record.roots,
    variants: record.variants,
    paths: Object.freeze(paths),
    pathsSha256: record.pathsSha256,
    variantEvidenceSha256: record.variantEvidenceSha256,
  });
}

/** @param {readonly any[]} entries */
function h0VariantEvidenceSha256(entries) {
  const records = entries.flatMap((entry) =>
    entry.evidence.map((/** @type {any} */ evidence) => ({
      path: entry.path,
      variant: evidence.variant,
      status: evidence.status,
      ...(evidence.status === 'failed'
        ? {
            reason: evidence.reason,
            message: evidence.message,
            signature: evidence.signature,
          }
        : {}),
    })),
  );
  return sha256(
    `${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
  );
}

/**
 * @param {{
 *   before?: string,
 *   baseline?: string,
 *   preservedTaxonomyText?: string,
 *   currentTaxonomyText?: string,
 *   after: string,
 *   disposition: string,
 *   promotion: string,
 *   ownerDeltas: string | object,
 *   pathsManifest?: string,
 *   ownerMap?: string,
 * }} options
 */
export function assertExactH0DispositionDelta(options) {
  if (
    (options.before !== undefined && typeof options.before !== 'string') ||
    (options.baseline !== undefined && typeof options.baseline !== 'string') ||
    (options.preservedTaxonomyText !== undefined &&
      typeof options.preservedTaxonomyText !== 'string') ||
    (options.currentTaxonomyText !== undefined &&
      typeof options.currentTaxonomyText !== 'string') ||
    (options.before === undefined && options.baseline === undefined) ||
    typeof options.after !== 'string' ||
    typeof options.disposition !== 'string' ||
    typeof options.promotion !== 'string'
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} exact validation requires final-base artifact text or compact baseline identity`,
    );
  }
  if (
    (options.preservedTaxonomyText !== undefined ||
      options.currentTaxonomyText !== undefined) &&
    options.baseline === undefined
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} taxonomy transition text requires compact baseline identity`,
    );
  }
  if (
    options.before !== undefined &&
    options.currentTaxonomyText !== undefined
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} current taxonomy must be supplied through before or currentTaxonomyText, not both`,
    );
  }
  if (
    (options.pathsManifest === undefined) !==
      (options.ownerMap === undefined) ||
    (options.pathsManifest !== undefined &&
      (typeof options.pathsManifest !== 'string' ||
        typeof options.ownerMap !== 'string'))
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} exact validation requires both H0 manifest and owner-map text`,
    );
  }
  const afterEntries = taxonomyClassifications(options.after);
  const disposition = parseEs2015H0Disposition(options.disposition);
  const promotion = parseEs2015Promotion(options.promotion);
  const ownerDeltas =
    typeof options.ownerDeltas === 'string'
      ? parseEs2015H0OwnerDeltas(options.ownerDeltas)
      : parseEs2015H0OwnerDeltas(JSON.stringify(options.ownerDeltas));
  const baseline =
    options.baseline === undefined
      ? null
      : parseEs2015H0Baseline(options.baseline);
  const pathsManifest =
    options.pathsManifest === undefined
      ? null
      : parseH0PathsManifest(options.pathsManifest);
  const pathsManifestText = options.pathsManifest;
  const ownerMapText = options.ownerMap;
  if (baseline !== null && pathsManifest === null) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} baseline validation requires H0 manifest and owner-map text`,
    );
  }
  const h0Paths = disposition.dispositions.map((entry) => entry.path);
  const h0 = new Set(h0Paths);
  const passed = disposition.dispositions.filter(
    (entry) => entry.status === 'passed',
  );
  const reassigned = disposition.dispositions.filter(
    (entry) => entry.status === 'reassigned',
  );
  const passedPaths = passed.map((entry) => entry.path);
  const reassignedPaths = reassigned.map((entry) => entry.path);
  const passedVariantCount = passed.reduce(
    (total, entry) => total + entry.variants,
    0,
  );
  const reassignedVariantCount = reassigned.reduce(
    (total, entry) => total + entry.variants,
    0,
  );
  if (
    !sameStrings(sortStrings([...passedPaths, ...reassignedPaths]), h0Paths) ||
    passed.length + reassigned.length !== disposition.h0RootCount ||
    passedVariantCount + reassignedVariantCount !== disposition.h0VariantCount
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} passed and reassigned roots do not cover immutable H0`,
    );
  }
  if (!isH0Promotion(promotion)) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PROMOTION_FILE} must use the H0 promotion schema`,
    );
  }
  if (
    promotion.groupName !== ES2015_H0_PROMOTION_GROUP ||
    promotion.sourceTaxonomySha256 !== disposition.sourceTaxonomySha256 ||
    promotion.h0LedgerSha256 !== disposition.h0LedgerSha256 ||
    promotion.h0RootCount !== disposition.h0RootCount ||
    promotion.h0VariantCount !== disposition.h0VariantCount ||
    promotion.dispositionSha256 !== sha256(options.disposition) ||
    promotion.promotedRootCount !== passed.length ||
    promotion.promotedVariantCount !== passedVariantCount
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PROMOTION_FILE} provenance or complete-pass counts are stale`,
    );
  }
  if (!sameStrings(promotionPaths(promotion), passedPaths)) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PROMOTION_FILE} must contain exactly passed H0 dispositions`,
    );
  }
  const currentBeforeEntries =
    options.before === undefined
      ? reconstructCurrentBaseEntries(afterEntries, disposition)
      : taxonomyClassifications(options.before);
  const currentBeforeText =
    options.before === undefined
      ? `${JSON.stringify({ classifications: currentBeforeEntries })}\n`
      : options.before;
  if (baseline !== null && pathsManifest !== null) {
    if (options.before === undefined) {
      assertCompactH0BaselineMatchesEntries({
        baseline,
        entries: currentBeforeEntries,
        pathsManifest,
        preservedTaxonomyText: options.preservedTaxonomyText,
        currentTaxonomyText: options.currentTaxonomyText,
        pin: {
          repository: pathsManifest.repository,
          revision: pathsManifest.revision,
        },
      });
    } else {
      if (
        typeof options.baseline !== 'string' ||
        typeof options.before !== 'string' ||
        typeof options.pathsManifest !== 'string'
      ) {
        throw new Es2015PromotionError(
          `${ES2015_H0_OWNER_DELTAS_FILE} exact validation requires current-base taxonomy text`,
        );
      }
      assertEs2015H0BaselineMatchesTaxonomy({
        baselineText: options.baseline,
        taxonomyText: options.before,
        ...(options.preservedTaxonomyText === undefined
          ? {}
          : { preservedTaxonomyText: options.preservedTaxonomyText }),
        pathsManifestText: options.pathsManifest,
        pin: {
          repository: pathsManifest.repository,
          revision: pathsManifest.revision,
        },
      });
    }
  }
  const currentBefore = new Map(
    currentBeforeEntries.map((entry) => [entry.path, entry]),
  );
  const after = new Map(afterEntries.map((entry) => [entry.path, entry]));
  if (
    pathsManifest !== null &&
    typeof pathsManifestText === 'string' &&
    typeof ownerMapText === 'string'
  ) {
    const sourceTaxonomySha256 =
      baseline === null
        ? sha256(currentBeforeText)
        : baseline.finalBaseTaxonomySha256;
    if (
      disposition.repository !== pathsManifest.repository ||
      disposition.revision !== pathsManifest.revision ||
      disposition.sourceTaxonomySha256 !== sourceTaxonomySha256 ||
      disposition.h0LedgerSha256 !== pathsManifest.ledgerSha256 ||
      disposition.h0RootCount !== pathsManifest.rootCount ||
      disposition.h0VariantCount !== pathsManifest.variantCount ||
      !sameStrings(h0Paths, pathsManifest.paths)
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} does not match the immutable final-base H0 selector`,
      );
    }
    const currentBaseSelector = currentBeforeEntries
      .filter(
        (entry) =>
          entry.partition === 'core' &&
          entry.blocker === 'test262-cross-realm-host',
      )
      .sort((left, right) => compareStrings(left.path, right.path));
    if (
      !sameStrings(
        currentBaseSelector.map((entry) => entry.path),
        pathsManifest.paths,
      ) ||
      currentBaseSelector.reduce(
        (total, entry) => total + entry.variants,
        0,
      ) !== pathsManifest.variantCount
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} current-base core selector differs from immutable H0`,
      );
    }
    const executionRecords = disposition.dispositions.flatMap((entry) =>
      entry.evidence.map((/** @type {any} */ evidence) => ({
        type: 'test',
        file: entry.path,
        variant: evidence.variant,
        status: evidence.status,
        ...(evidence.status === 'failed'
          ? { reason: evidence.reason, message: evidence.message }
          : {}),
      })),
    );
    assertEs2015H0ExecutionMatchesDisposition({
      pathsManifestText,
      disposition,
      records: executionRecords,
      ownerMapText,
      pin: {
        repository: pathsManifest.repository,
        revision: pathsManifest.revision,
      },
    });
  }
  for (const [path] of after) {
    if (!currentBefore.has(path)) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} after taxonomy added unexpected root ${path}`,
      );
    }
  }
  for (const entry of disposition.dispositions) {
    const beforeEntry = currentBefore.get(entry.path);
    const afterEntry = after.get(entry.path);
    if (beforeEntry?.blocker !== 'test262-cross-realm-host') {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} current-base taxonomy is not the immutable H0 selector for ${entry.path}`,
      );
    }
    if (
      beforeEntry.variants !== entry.variants ||
      entry.requiredVariants.length !== entry.variants
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} H0 variant count drifted for ${entry.path}`,
      );
    }
    if (afterEntry === undefined) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} after taxonomy lost H0 root ${entry.path}`,
      );
    }
    const expectedAfter = {
      ...beforeEntry,
      ...(entry.status === 'passed'
        ? { status: 'selected-passing', blocker: null }
        : {
            status: `blocked:${entry.primaryOwner.blocker}`,
            blocker: entry.primaryOwner.blocker,
          }),
    };
    if (JSON.stringify(afterEntry) !== JSON.stringify(expectedAfter)) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} H0 root ${entry.path} moved outside its reviewed disposition`,
      );
    }
  }
  for (const [path, beforeEntry] of currentBefore) {
    if (h0.has(path)) continue;
    const afterEntry = after.get(path);
    if (JSON.stringify(beforeEntry) !== JSON.stringify(afterEntry)) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} non-H0 taxonomy moved unexpectedly at ${path}`,
      );
    }
  }
  const remainingCoreSelector = afterEntries.filter(
    (entry) =>
      entry.partition === 'core' &&
      entry.blocker === 'test262-cross-realm-host',
  );
  if (
    remainingCoreSelector.length !== 0 ||
    remainingCoreSelector.reduce(
      (total, entry) => total + entry.variants,
      0,
    ) !== 0
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} post-H0 core selector is not zero`,
    );
  }
  assertExactH0TaxonomyTotals(currentBeforeEntries, afterEntries, disposition);
  const expectedOwnerDeltas = buildEs2015H0OwnerDeltas({
    beforeTaxonomyText: currentBeforeText,
    afterTaxonomyText: options.after,
    dispositionText: options.disposition,
    promotionText: options.promotion,
    ...(baseline === null
      ? {}
      : { sourceTaxonomySha256: baseline.finalBaseTaxonomySha256 }),
  });
  if (JSON.stringify(ownerDeltas) !== JSON.stringify(expectedOwnerDeltas)) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} is stale or tampered`,
    );
  }
}

/**
 * @param {readonly any[]} afterEntries
 * @param {ReturnType<typeof parseEs2015H0Disposition>} disposition
 */
function reconstructCurrentBaseEntries(afterEntries, disposition) {
  const byPath = new Map(
    disposition.dispositions.map((entry) => [entry.path, entry]),
  );
  return afterEntries.map((entry) => {
    if (!byPath.has(entry.path)) return entry;
    return {
      ...entry,
      status: 'blocked:test262-cross-realm-host',
      blocker: 'test262-cross-realm-host',
    };
  });
}

/**
 * @param {readonly any[]} beforeEntries
 * @param {readonly any[]} afterEntries
 * @param {ReturnType<typeof parseEs2015H0Disposition>} disposition
 */
function assertExactH0TaxonomyTotals(beforeEntries, afterEntries, disposition) {
  const expectedStatuses = taxonomyCountTable(
    beforeEntries,
    (entry) => `${entry.status}\u0000${entry.blocker ?? ''}`,
  );
  const beforeByPath = new Map(
    beforeEntries.map((entry) => [entry.path, entry]),
  );
  for (const entry of disposition.dispositions) {
    const before = beforeByPath.get(entry.path);
    if (before === undefined) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} lost H0 root while computing totals`,
      );
    }
    addTaxonomyCount(
      expectedStatuses,
      `${before.status}\u0000${before.blocker ?? ''}`,
      -1,
      -before.variants,
    );
    if (entry.status === 'passed') {
      addTaxonomyCount(
        expectedStatuses,
        'selected-passing\u0000',
        1,
        entry.variants,
      );
    } else {
      addTaxonomyCount(
        expectedStatuses,
        `blocked:${entry.primaryOwner.blocker}\u0000${entry.primaryOwner.blocker}`,
        1,
        entry.variants,
      );
    }
  }
  assertSameTaxonomyCountTable(
    expectedStatuses,
    taxonomyCountTable(
      afterEntries,
      (entry) => `${entry.status}\u0000${entry.blocker ?? ''}`,
    ),
    'status',
  );
  assertSameTaxonomyCountTable(
    taxonomyCountTable(beforeEntries, (entry) => entry.partition),
    taxonomyCountTable(afterEntries, (entry) => entry.partition),
    'partition',
  );
}

/**
 * @param {readonly any[]} entries
 * @param {(entry: any) => string} keyFor
 */
function taxonomyCountTable(entries, keyFor) {
  const counts = new Map();
  for (const entry of entries) {
    addTaxonomyCount(counts, keyFor(entry), 1, entry.variants);
  }
  return counts;
}

/**
 * @param {Map<string, { roots: number, variants: number }>} counts
 * @param {string} key
 * @param {number} roots
 * @param {number} variants
 */
function addTaxonomyCount(counts, key, roots, variants) {
  const current = counts.get(key) ?? { roots: 0, variants: 0 };
  const next = {
    roots: current.roots + roots,
    variants: current.variants + variants,
  };
  if (next.roots === 0 && next.variants === 0) {
    counts.delete(key);
    return;
  }
  counts.set(key, next);
}

/**
 * @param {ReadonlyMap<string, { roots: number, variants: number }>} expected
 * @param {ReadonlyMap<string, { roots: number, variants: number }>} actual
 * @param {string} label
 */
function assertSameTaxonomyCountTable(expected, actual, label) {
  if (expected.size !== actual.size) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} ${label} totals do not balance`,
    );
  }
  for (const [key, count] of expected) {
    const actualCount = actual.get(key);
    if (
      actualCount === undefined ||
      actualCount.roots !== count.roots ||
      actualCount.variants !== count.variants
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} ${label} totals do not balance`,
      );
    }
  }
}

/**
 * @param {{
 *   pathsManifestText: string,
 *   disposition: ReturnType<typeof parseEs2015H0Disposition>,
 *   records: readonly any[],
 *   ownerMapText: string,
 *   pin: { repository: string, revision: string },
 * }} options
 */
export function assertEs2015H0ExecutionMatchesDisposition(options) {
  const pathsManifest = parseH0PathsManifest(options.pathsManifestText);
  assertPinMatches(pathsManifest, options.pin, ES2015_H0_DISPOSITION_FILE);
  const disposition = parseEs2015H0Disposition(
    JSON.stringify(options.disposition),
  );
  const ownerMap = parseEs2015H0OwnerMap(options.ownerMapText, options.pin);
  if (
    disposition.repository !== pathsManifest.repository ||
    disposition.revision !== pathsManifest.revision ||
    disposition.h0LedgerSha256 !== pathsManifest.ledgerSha256 ||
    disposition.h0RootCount !== pathsManifest.rootCount ||
    disposition.h0VariantCount !== pathsManifest.variantCount
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} does not match the immutable H0 manifest`,
    );
  }
  if (disposition.ownerMapSha256 !== sha256(options.ownerMapText)) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} owner-map evidence is stale`,
    );
  }
  const records = normalizeExecutionRecords(options.records);
  if (
    h0ExecutionEvidenceSha256(
      disposition.repository,
      disposition.revision,
      records,
    ) !== disposition.executionEvidenceSha256
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} execution evidence hash is stale`,
    );
  }
  const byPath = executionRecordsByPath(records);
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const entry of disposition.dispositions) {
    const pathRecords = byPath.get(entry.path);
    if (pathRecords === undefined) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} execution is missing ${entry.path}`,
      );
    }
    assertExactVariantRecords(
      pathRecords,
      entry.requiredVariants,
      `${ES2015_H0_DISPOSITION_FILE} execution ${entry.path}`,
    );
    if (entry.status === 'passed') {
      for (const record of pathRecords) {
        if (record.status !== 'passed') {
          throw new Es2015PromotionError(
            `${ES2015_H0_DISPOSITION_FILE} passed disposition failed for ${entry.path}`,
          );
        }
      }
    } else {
      const expectedSignatures = new Set(
        entry.evidence
          .filter((/** @type {any} */ record) => record.status === 'failed')
          .map((/** @type {any} */ record) => record.signature),
      );
      const passedVariants = new Set(
        entry.evidence
          .filter((/** @type {any} */ record) => record.status === 'passed')
          .map((/** @type {any} */ record) => record.variant),
      );
      /** @type {any[]} */
      const failedRecords = [];
      for (const record of pathRecords) {
        if (record.status === 'passed') {
          if (!passedVariants.has(record.variant)) {
            throw new Es2015PromotionError(
              `${ES2015_H0_DISPOSITION_FILE} has unreviewed passed variant evidence for ${entry.path}`,
            );
          }
          continue;
        }
        if (record.status !== 'failed') {
          throw new Es2015PromotionError(
            `${ES2015_H0_DISPOSITION_FILE} reassigned disposition did not fail for ${entry.path}`,
          );
        }
        if (!expectedSignatures.has(normalizeFailureSignature(record))) {
          throw new Es2015PromotionError(
            `${ES2015_H0_DISPOSITION_FILE} has unreviewed failure evidence for ${entry.path}`,
          );
        }
        failedRecords.push(record);
      }
      const reassignment = matchOwnerRules(entry.path, failedRecords, ownerMap);
      if (reassignment.primaryOwner.code !== entry.primaryOwner.code) {
        throw new Es2015PromotionError(
          `${ES2015_H0_DISPOSITION_FILE} reassigned owner is stale for ${entry.path}`,
        );
      }
      if (
        !sameStrings(reassignment.failureSignatures, entry.failureSignatures)
      ) {
        throw new Es2015PromotionError(
          `${ES2015_H0_DISPOSITION_FILE} reassigned signatures are stale for ${entry.path}`,
        );
      }
      if (
        !sameStrings(
          reassignment.secondaryEvidence.map(
            (/** @type {any} */ evidence) =>
              `${evidence.owner.code}\u0000${evidence.signature}`,
          ),
          entry.secondaryEvidence.map(
            (/** @type {any} */ evidence) =>
              `${evidence.owner.code}\u0000${evidence.signature}`,
          ),
        )
      ) {
        throw new Es2015PromotionError(
          `${ES2015_H0_DISPOSITION_FILE} reassigned secondary evidence is stale for ${entry.path}`,
        );
      }
    }
  }
  for (const path of byPath.keys()) {
    if (!pathsManifest.pathSet.has(path)) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} execution names a foreign H0 path ${path}`,
      );
    }
  }
  for (const record of records) {
    if (record.status === 'passed') passed += 1;
    else if (record.status === 'failed') failed += 1;
    else skipped += 1;
  }
  if (
    passed !== disposition.executionPassedVariantCount ||
    failed !== disposition.executionFailedVariantCount
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} raw execution counts are stale`,
    );
  }
  return Object.freeze({
    total: records.length,
    passed,
    failed,
    skipped,
  });
}

/**
 * @param {unknown} value
 * @param {number} index
 */
function parseEntry(value, index, file = ES2015_PROMOTION_FILE) {
  const record = object(value, `${file} entry ${index}`);
  requireExactKeys(record, ENTRY_KEYS, `${file} entry ${index}`);
  if (
    typeof record.path !== 'string' ||
    !record.path.startsWith('test/') ||
    !record.path.endsWith('.js')
  ) {
    throw new Es2015PromotionError(
      `${file} entry ${index} must name a Test262 root`,
    );
  }
  if (!positiveInteger(record.variants)) {
    throw new Es2015PromotionError(
      `${file} entry ${record.path} must have a positive variant count`,
    );
  }
  return Object.freeze({
    path: record.path,
    variants: record.variants,
    features: Object.freeze(
      sortedStringList(
        record.features,
        `${file} entry ${record.path} features`,
      ),
    ),
    includeFeatures: Object.freeze(
      sortedStringList(
        record.includeFeatures,
        `${file} entry ${record.path} includeFeatures`,
      ),
    ),
  });
}

/**
 * @param {Record<string, any>} record
 * @param {string} label
 * @param {boolean} [allowZeroVersion]
 */
function validateRepositoryRevision(record, label, allowZeroVersion = false) {
  if (record.version !== ES2015_PROMOTION_VERSION && !allowZeroVersion) {
    throw new Es2015PromotionError(
      `${label} must declare version ${ES2015_PROMOTION_VERSION}`,
    );
  }
  if (record.version !== ES2015_PROMOTION_VERSION) {
    throw new Es2015PromotionError(
      `${label} must declare version ${ES2015_PROMOTION_VERSION}`,
    );
  }
  if (typeof record.repository !== 'string' || record.repository === '') {
    throw new Es2015PromotionError(`${label} must name the Test262 repository`);
  }
  if (
    typeof record.revision !== 'string' ||
    !REVISION_PATTERN.test(record.revision)
  ) {
    throw new Es2015PromotionError(`${label} must pin a full Test262 revision`);
  }
}

/**
 * @param {string} text
 * @param {{ repository: string, revision: string }} pin
 */
export function parseEs2015H0Paths(text, pin) {
  const paths = parseH0PathsManifest(text);
  assertPinMatches(paths, pin, ES2015_H0_PATHS_FILE);
  return paths;
}

/** @param {string} text */
function parseH0PathsManifest(text) {
  const record = parseJson(text, ES2015_H0_PATHS_FILE);
  requireExactKeys(record, H0_PATHS_KEYS, ES2015_H0_PATHS_FILE);
  validateRepositoryRevision(record, ES2015_H0_PATHS_FILE);
  for (const key of ['sourceTaxonomySha256', 'ledgerSha256']) {
    if (
      typeof record[key] !== 'string' ||
      !SHA256_PATTERN.test(/** @type {string} */ (record[key]))
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_PATHS_FILE} ${key} must be a SHA-256 digest`,
      );
    }
  }
  if (
    !positiveInteger(record.rootCount) ||
    !positiveInteger(record.variantCount)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PATHS_FILE} counts must be positive integers`,
    );
  }
  const paths = sortedStringList(record.paths, `${ES2015_H0_PATHS_FILE} paths`);
  if (paths.length !== record.rootCount) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PATHS_FILE} rootCount does not match paths`,
    );
  }
  if (sha256(`${paths.join('\n')}\n`) !== record.ledgerSha256) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PATHS_FILE} ledgerSha256 does not match paths`,
    );
  }
  return Object.freeze({
    version: ES2015_PROMOTION_VERSION,
    repository: record.repository,
    revision: record.revision,
    sourceTaxonomySha256: record.sourceTaxonomySha256,
    ledgerSha256: record.ledgerSha256,
    rootCount: record.rootCount,
    variantCount: record.variantCount,
    paths: Object.freeze(paths),
    pathSet: new Set(paths),
  });
}

/**
 * Builds the compact, tracked identity of the final base used for H0
 * reconciliation. It intentionally records classification identities rather
 * than embedding a session-local taxonomy snapshot.
 *
 * @param {{
 *   finalBaseCommit: string,
 *   taxonomyText: string,
 *   pathsManifestText: string,
 * }} options
 */
export function buildEs2015H0Baseline(options) {
  if (
    typeof options.finalBaseCommit !== 'string' ||
    !REVISION_PATTERN.test(options.finalBaseCommit)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} finalBaseCommit must be a full commit SHA`,
    );
  }
  const pathsManifest = parseH0PathsManifest(options.pathsManifestText);
  const taxonomy = baselineTaxonomy(options.taxonomyText);
  const taxonomySha256 = sha256(options.taxonomyText);
  if (pathsManifest.sourceTaxonomySha256 !== taxonomySha256) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} H0 paths do not match the final-base taxonomy`,
    );
  }
  assertPinMatches(taxonomy.pin, pathsManifest, ES2015_H0_BASELINE_FILE);
  const facts = h0BaselineClassificationFacts(
    taxonomy.classifications,
    pathsManifest,
  );
  const partitionStatusSummary = h0PartitionStatusSummary(
    taxonomy.classifications,
  );
  return parseEs2015H0Baseline(
    JSON.stringify({
      version: ES2015_PROMOTION_VERSION,
      finalBaseCommit: options.finalBaseCommit,
      repository: pathsManifest.repository,
      revision: pathsManifest.revision,
      finalBaseTaxonomySha256: taxonomySha256,
      h0LedgerSha256: pathsManifest.ledgerSha256,
      h0RootCount: pathsManifest.rootCount,
      h0VariantCount: pathsManifest.variantCount,
      h0ClassificationSha256: facts.h0ClassificationSha256,
      nonH0ClassificationSha256: facts.nonH0ClassificationSha256,
      partitionStatusSummary,
      partitionStatusSummarySha256: canonicalSha256(partitionStatusSummary),
    }),
  );
}

/**
 * @param {string} text
 * @param {{ repository: string, revision: string }} [pin]
 */
export function parseEs2015H0Baseline(text, pin) {
  const record = parseJson(text, ES2015_H0_BASELINE_FILE);
  requireExactKeys(record, H0_BASELINE_KEYS, ES2015_H0_BASELINE_FILE);
  validateRepositoryRevision(record, ES2015_H0_BASELINE_FILE);
  if (
    typeof record.finalBaseCommit !== 'string' ||
    !REVISION_PATTERN.test(record.finalBaseCommit)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} finalBaseCommit must be a full commit SHA`,
    );
  }
  for (const key of [
    'finalBaseTaxonomySha256',
    'h0LedgerSha256',
    'h0ClassificationSha256',
    'nonH0ClassificationSha256',
    'partitionStatusSummarySha256',
  ]) {
    if (
      typeof record[key] !== 'string' ||
      !SHA256_PATTERN.test(/** @type {string} */ (record[key]))
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_BASELINE_FILE} ${key} must be a SHA-256 digest`,
      );
    }
  }
  if (
    !positiveInteger(record.h0RootCount) ||
    !positiveInteger(record.h0VariantCount)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} H0 counts must be positive integers`,
    );
  }
  const partitionStatusSummary = parseH0PartitionStatusSummary(
    record.partitionStatusSummary,
  );
  if (
    canonicalSha256(partitionStatusSummary) !==
    record.partitionStatusSummarySha256
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} partition/status summary hash is stale`,
    );
  }
  const baseline = Object.freeze({
    version: ES2015_PROMOTION_VERSION,
    finalBaseCommit: record.finalBaseCommit,
    repository: record.repository,
    revision: record.revision,
    finalBaseTaxonomySha256: record.finalBaseTaxonomySha256,
    h0LedgerSha256: record.h0LedgerSha256,
    h0RootCount: record.h0RootCount,
    h0VariantCount: record.h0VariantCount,
    h0ClassificationSha256: record.h0ClassificationSha256,
    nonH0ClassificationSha256: record.nonH0ClassificationSha256,
    partitionStatusSummary,
    partitionStatusSummarySha256: record.partitionStatusSummarySha256,
  });
  if (pin !== undefined) {
    assertPinMatches(baseline, pin, ES2015_H0_BASELINE_FILE);
  }
  return baseline;
}

/**
 * Verifies an explicit full final-base taxonomy snapshot against the compact
 * committed identity before generation or checking uses it.
 *
 * @param {{
 *   baselineText: string,
 *   taxonomyText: string,
 *   preservedTaxonomyText?: string,
 *   pathsManifestText: string,
 *   pin: { repository: string, revision: string },
 * }} options
 */
export function assertEs2015H0BaselineMatchesTaxonomy(options) {
  const baseline = parseEs2015H0Baseline(options.baselineText);
  const pathsManifest = parseH0PathsManifest(options.pathsManifestText);
  const current = baselineTaxonomy(options.taxonomyText);
  assertPinMatches(current.pin, options.pin, ES2015_H0_BASELINE_FILE);
  if (sha256(options.taxonomyText) === baseline.finalBaseTaxonomySha256) {
    assertH0BaselineMatchesEntries({
      baseline,
      entries: current.classifications,
      pathsManifest,
      pin: options.pin,
    });
    return;
  }
  if (typeof options.preservedTaxonomyText !== 'string') {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} current taxonomy differs from the final base and requires preserved taxonomy text`,
    );
  }
  const currentDocument = reviewedTaxonomyDocument(
    options.taxonomyText,
    `${ES2015_H0_BASELINE_FILE} current taxonomy`,
  );
  const preserved = assertPreservedH0BaselineTaxonomy({
    baseline,
    pathsManifest,
    pin: options.pin,
    preservedTaxonomyText: options.preservedTaxonomyText,
  });
  assertReviewedTaxonomyDocumentTransition(
    preserved,
    currentDocument,
    pathsManifest,
  );
}

/**
 * @param {{
 *   baseline: ReturnType<typeof parseEs2015H0Baseline>,
 *   pathsManifest: ReturnType<typeof parseH0PathsManifest>,
 *   pin: { repository: string, revision: string },
 *   preservedTaxonomyText: string,
 * }} options
 */
function assertPreservedH0BaselineTaxonomy(options) {
  const preserved = reviewedTaxonomyDocument(
    options.preservedTaxonomyText,
    `${ES2015_H0_BASELINE_FILE} preserved taxonomy`,
  );
  assertH0BaselineMatchesEntries({
    baseline: options.baseline,
    entries: preserved.classifications,
    pathsManifest: options.pathsManifest,
    pin: options.pin,
  });
  if (
    sha256(options.preservedTaxonomyText) !==
    options.baseline.finalBaseTaxonomySha256
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} preserved taxonomy hash does not match the pinned final base`,
    );
  }
  assertPinMatches(preserved.pin, options.pin, ES2015_H0_BASELINE_FILE);
  return preserved;
}

/**
 * @param {{
 *   baseline: ReturnType<typeof parseEs2015H0Baseline>,
 *   entries: readonly any[],
 *   pathsManifest: ReturnType<typeof parseH0PathsManifest>,
 *   pin: { repository: string, revision: string },
 * }} options
 */
function assertH0BaselineMatchesEntries(options) {
  const { baseline, entries, pathsManifest, pin } = options;
  assertPinMatches(baseline, pin, ES2015_H0_BASELINE_FILE);
  assertPinMatches(pathsManifest, pin, ES2015_H0_BASELINE_FILE);
  if (baseline.finalBaseTaxonomySha256 !== pathsManifest.sourceTaxonomySha256) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} H0 paths do not match the final-base taxonomy`,
    );
  }
  if (
    baseline.repository !== pathsManifest.repository ||
    baseline.revision !== pathsManifest.revision ||
    baseline.h0LedgerSha256 !== pathsManifest.ledgerSha256 ||
    baseline.h0RootCount !== pathsManifest.rootCount ||
    baseline.h0VariantCount !== pathsManifest.variantCount
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} does not match the immutable H0 ledger`,
    );
  }
  const facts = h0BaselineClassificationFacts(entries, pathsManifest);
  if (facts.h0ClassificationSha256 !== baseline.h0ClassificationSha256) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} H0 classification hash does not match`,
    );
  }
  if (facts.nonH0ClassificationSha256 !== baseline.nonH0ClassificationSha256) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} non-H0 classification hash does not match`,
    );
  }
  const summary = h0PartitionStatusSummary(entries);
  if (
    canonicalSha256(summary) !== baseline.partitionStatusSummarySha256 ||
    canonicalJson(summary) !== canonicalJson(baseline.partitionStatusSummary)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} partition/status summary does not balance`,
    );
  }
}

/**
 * Reconciles the compact preserved identity with the exact reviewed P0
 * transition into the current taxonomy while H0 remains byte-identical.
 *
 * @param {{
 *   baseline: ReturnType<typeof parseEs2015H0Baseline>,
 *   entries: readonly any[],
 *   pathsManifest: ReturnType<typeof parseH0PathsManifest>,
 *   preservedTaxonomyText?: string,
 *   currentTaxonomyText?: string,
 *   pin: { repository: string, revision: string },
 * }} options
 */
function assertCompactH0BaselineMatchesEntries(options) {
  const { baseline, entries, pathsManifest, pin } = options;
  assertPinMatches(baseline, pin, ES2015_H0_BASELINE_FILE);
  assertPinMatches(pathsManifest, pin, ES2015_H0_BASELINE_FILE);
  if (
    baseline.finalBaseTaxonomySha256 !== pathsManifest.sourceTaxonomySha256 ||
    baseline.repository !== pathsManifest.repository ||
    baseline.revision !== pathsManifest.revision ||
    baseline.h0LedgerSha256 !== pathsManifest.ledgerSha256 ||
    baseline.h0RootCount !== pathsManifest.rootCount ||
    baseline.h0VariantCount !== pathsManifest.variantCount
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} does not match the immutable H0 ledger`,
    );
  }
  if (
    entries.some(
      (entry) => !positiveInteger(entry.variants) || entry.partition === '',
    )
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} current taxonomy classifications are invalid`,
    );
  }
  assertSortedUnique(
    entries.map((entry) => entry.path),
    `${ES2015_H0_BASELINE_FILE} current taxonomy classifications`,
  );
  const facts = h0BaselineClassificationFacts(entries, pathsManifest);
  if (facts.h0ClassificationSha256 !== baseline.h0ClassificationSha256) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} H0 classification hash does not match`,
    );
  }
  if (facts.nonH0ClassificationSha256 === baseline.nonH0ClassificationSha256) {
    if (options.currentTaxonomyText !== undefined) {
      const currentDocument = reviewedTaxonomyDocument(
        options.currentTaxonomyText,
        `${ES2015_H0_BASELINE_FILE} current taxonomy`,
      );
      if (
        sha256(options.currentTaxonomyText) !==
          baseline.finalBaseTaxonomySha256 ||
        JSON.stringify(currentDocument.classifications) !==
          JSON.stringify(entries)
      ) {
        throw new Es2015PromotionError(
          `${ES2015_H0_BASELINE_FILE} current taxonomy text does not match the exact final base`,
        );
      }
    }
    assertH0BaselineMatchesEntries({
      baseline,
      entries,
      pathsManifest,
      pin,
    });
    return;
  }
  if (
    typeof options.preservedTaxonomyText !== 'string' ||
    typeof options.currentTaxonomyText !== 'string'
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} current taxonomy differs from the final base and requires preserved and current taxonomy text`,
    );
  }
  const currentDocument = reviewedTaxonomyDocument(
    options.currentTaxonomyText,
    `${ES2015_H0_BASELINE_FILE} current taxonomy`,
  );
  if (
    JSON.stringify(currentDocument.classifications) !== JSON.stringify(entries)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} current taxonomy text does not match the reconstructed pre-H0 classifications`,
    );
  }
  const preserved = assertPreservedH0BaselineTaxonomy({
    baseline,
    pathsManifest,
    pin,
    preservedTaxonomyText: options.preservedTaxonomyText,
  });
  assertReviewedTaxonomyDocumentTransition(
    preserved,
    currentDocument,
    pathsManifest,
  );
}

/**
 * @param {string} text
 * @param {string} label
 */
function reviewedTaxonomyDocument(text, label) {
  const record = parseJson(text, label);
  requireExactKeys(record, REVIEWED_TAXONOMY_DOCUMENT_KEYS, label);
  const inputs = object(record.inputs, `${label} inputs`);
  requireExactKeys(inputs, REVIEWED_TAXONOMY_INPUT_KEYS, `${label} inputs`);
  for (const key of REVIEWED_TAXONOMY_INPUT_KEYS) {
    if (
      typeof inputs[key] !== 'string' ||
      !SHA256_PATTERN.test(/** @type {string} */ (inputs[key]))
    ) {
      throw new Es2015PromotionError(
        `${label} input ${key} must be a SHA-256 digest`,
      );
    }
  }
  object(record.policy, `${label} policy`);
  object(record.summary, `${label} summary`);
  object(record.statusTables, `${label} statusTables`);
  const taxonomy = baselineTaxonomy(text);
  const expectedStatusTables = reviewedTaxonomyStatusTables(
    taxonomy.classifications,
  );
  if (
    JSON.stringify(record.statusTables) !== JSON.stringify(expectedStatusTables)
  ) {
    throw new Es2015PromotionError(
      `${label} statusTables are not the canonical classification aggregate`,
    );
  }
  return Object.freeze({
    version: record.version,
    pin: taxonomy.pin,
    policy: record.policy,
    inputs,
    summary: record.summary,
    statusTables: record.statusTables,
    classifications: taxonomy.classifications,
  });
}

/**
 * @param {ReturnType<typeof reviewedTaxonomyDocument>} preserved
 * @param {ReturnType<typeof reviewedTaxonomyDocument>} current
 * @param {ReturnType<typeof parseH0PathsManifest>} pathsManifest
 */
function assertReviewedTaxonomyDocumentTransition(
  preserved,
  current,
  pathsManifest,
) {
  const exactKeys =
    /** @type {readonly ('version' | 'pin' | 'policy' | 'summary')[]} */ ([
      'version',
      'pin',
      'policy',
      'summary',
    ]);
  for (const key of exactKeys) {
    if (JSON.stringify(preserved[key]) !== JSON.stringify(current[key])) {
      throw new Es2015PromotionError(
        `${ES2015_H0_BASELINE_FILE} reviewed P0 transition changed taxonomy ${key}`,
      );
    }
  }
  for (const key of REVIEWED_P0_STATIC_INPUT_KEYS) {
    if (preserved.inputs[key] !== current.inputs[key]) {
      throw new Es2015PromotionError(
        `${ES2015_H0_BASELINE_FILE} reviewed P0 transition changed unrelated input ${key}`,
      );
    }
  }
  for (const [key, [preservedSha256, currentSha256]] of Object.entries(
    REVIEWED_P0_INPUT_TRANSITIONS,
  )) {
    if (
      preserved.inputs[key] !== preservedSha256 ||
      current.inputs[key] !== currentSha256
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_BASELINE_FILE} reviewed P0 transition has unauthorized input ${key}`,
      );
    }
  }
  assertReviewedP0Transition(
    preserved.classifications,
    current.classifications,
    pathsManifest,
  );
}

/** @param {readonly any[]} classifications */
function reviewedTaxonomyStatusTables(classifications) {
  return {
    core: reviewedTaxonomyCountTable(
      classifications.filter((entry) => entry.partition === 'core'),
      (entry) => entry.status,
    ),
    annexB: reviewedTaxonomyCountTable(
      classifications.filter((entry) => entry.partition === 'annex-b'),
      (entry) => entry.status,
    ),
    blockers: reviewedTaxonomyCountTable(
      classifications.filter((entry) => entry.blocker !== null),
      (entry) => entry.blocker,
    ),
  };
}

/**
 * @param {readonly any[]} entries
 * @param {(entry: any) => string} nameFor
 */
function reviewedTaxonomyCountTable(entries, nameFor) {
  const totals = new Map();
  for (const entry of entries) {
    const name = nameFor(entry);
    const total = totals.get(name) ?? { roots: 0, variants: 0 };
    total.roots += 1;
    total.variants += entry.variants;
    totals.set(name, total);
  }
  return sortStrings([...totals.keys()]).map((name) => ({
    name,
    ...totals.get(name),
  }));
}

/**
 * @param {readonly any[]} preservedEntries
 * @param {readonly any[]} currentEntries
 * @param {ReturnType<typeof parseH0PathsManifest>} pathsManifest
 */
function assertReviewedP0Transition(
  preservedEntries,
  currentEntries,
  pathsManifest,
) {
  const preservedPaths = preservedEntries.map((entry) => entry.path);
  const currentPaths = currentEntries.map((entry) => entry.path);
  if (!sameStrings(preservedPaths, currentPaths)) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} reviewed P0 transition must preserve the exact taxonomy key set`,
    );
  }

  /** @type {{ preserved: any, current: any }[]} */
  const changed = [];
  for (let index = 0; index < preservedEntries.length; index += 1) {
    const preserved = preservedEntries[index];
    const current = currentEntries[index];
    if (preserved.variants !== current.variants) {
      throw new Es2015PromotionError(
        `${ES2015_H0_BASELINE_FILE} reviewed P0 transition changed variant count for ${preserved.path}`,
      );
    }
    if (pathsManifest.pathSet.has(preserved.path)) {
      if (JSON.stringify(preserved) !== JSON.stringify(current)) {
        throw new Es2015PromotionError(
          `${ES2015_H0_BASELINE_FILE} reviewed P0 transition changed H0 record ${preserved.path}`,
        );
      }
      continue;
    }
    if (JSON.stringify(preserved) !== JSON.stringify(current)) {
      changed.push({ preserved, current });
    }
  }

  const changedPaths = changed.map(({ preserved }) => preserved.path);
  const changedVariants = changed.reduce(
    (total, { preserved }) => total + preserved.variants,
    0,
  );
  if (
    changed.length !== REVIEWED_P0_ROOT_COUNT ||
    changedVariants !== REVIEWED_P0_VARIANT_COUNT ||
    sha256(`${changedPaths.join('\n')}\n`) !== REVIEWED_P0_PATH_SHA256
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} current taxonomy does not match the reviewed P0 path ledger`,
    );
  }

  let remainingStandardLibraryReassignments = 0;
  for (const { preserved, current } of changed) {
    if (
      preserved.partition !== 'core' ||
      preserved.status !== REVIEWED_P0_SOURCE_STATUS ||
      preserved.blocker !== REVIEWED_P0_SOURCE_BLOCKER
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_BASELINE_FILE} reviewed P0 source is invalid at ${preserved.path}`,
      );
    }
    const selected =
      current.status === 'selected-passing' && current.blocker === null;
    const auditPassing =
      current.status === 'audit-passing-unselected' && current.blocker === null;
    const reassigned =
      current.status === REVIEWED_P0_REASSIGNED_STATUS &&
      current.blocker === REVIEWED_P0_REASSIGNED_BLOCKER;
    if (!selected && !auditPassing && !reassigned) {
      throw new Es2015PromotionError(
        `${ES2015_H0_BASELINE_FILE} reviewed P0 destination is invalid at ${preserved.path}`,
      );
    }
    if (reassigned) {
      remainingStandardLibraryReassignments += 1;
    }
    const expected = {
      ...preserved,
      status: current.status,
      blocker: current.blocker,
    };
    if (JSON.stringify(expected) !== JSON.stringify(current)) {
      throw new Es2015PromotionError(
        `${ES2015_H0_BASELINE_FILE} reviewed P0 transition changed non-status facts at ${preserved.path}`,
      );
    }
  }
  if (remainingStandardLibraryReassignments !== 1) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} reviewed P0 transition must contain one remaining-standard-library-additions reassignment`,
    );
  }

  assertSameReviewedP0CountTable(
    taxonomyCountTable(preservedEntries, (entry) => entry.partition),
    taxonomyCountTable(currentEntries, (entry) => entry.partition),
    'partition',
  );
  const expectedStatuses = taxonomyCountTable(
    preservedEntries,
    (entry) => `${entry.status}\u0000${entry.blocker ?? ''}`,
  );
  for (const { preserved, current } of changed) {
    addTaxonomyCount(
      expectedStatuses,
      `${preserved.status}\u0000${preserved.blocker ?? ''}`,
      -1,
      -preserved.variants,
    );
    addTaxonomyCount(
      expectedStatuses,
      `${current.status}\u0000${current.blocker ?? ''}`,
      1,
      current.variants,
    );
  }
  assertSameReviewedP0CountTable(
    expectedStatuses,
    taxonomyCountTable(
      currentEntries,
      (entry) => `${entry.status}\u0000${entry.blocker ?? ''}`,
    ),
    'status',
  );
}

/**
 * @param {ReadonlyMap<string, { roots: number, variants: number }>} expected
 * @param {ReadonlyMap<string, { roots: number, variants: number }>} actual
 * @param {string} label
 */
function assertSameReviewedP0CountTable(expected, actual, label) {
  if (expected.size !== actual.size) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} reviewed P0 ${label} totals do not balance`,
    );
  }
  for (const [key, count] of expected) {
    const actualCount = actual.get(key);
    if (
      actualCount === undefined ||
      actualCount.roots !== count.roots ||
      actualCount.variants !== count.variants
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_BASELINE_FILE} reviewed P0 ${label} totals do not balance`,
      );
    }
  }
}

/**
 * @param {readonly any[]} entries
 * @param {ReturnType<typeof parseH0PathsManifest>} pathsManifest
 */
function h0BaselineClassificationFacts(entries, pathsManifest) {
  const h0Entries = entries
    .filter(
      (entry) =>
        entry.partition === 'core' &&
        entry.blocker === 'test262-cross-realm-host',
    )
    .sort((left, right) => compareStrings(left.path, right.path));
  if (
    !sameStrings(
      h0Entries.map((entry) => entry.path),
      pathsManifest.paths,
    ) ||
    h0Entries.reduce((total, entry) => total + entry.variants, 0) !==
      pathsManifest.variantCount
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} final-base H0 selector differs from the immutable ledger`,
    );
  }
  const h0Paths = new Set(pathsManifest.paths);
  return {
    h0ClassificationSha256: canonicalClassificationSha256(h0Entries),
    nonH0ClassificationSha256: canonicalClassificationSha256(
      entries.filter((entry) => !h0Paths.has(entry.path)),
    ),
  };
}

/** @param {readonly any[]} entries */
function h0PartitionStatusSummary(entries) {
  const partitions = new Map();
  const statuses = new Map();
  for (const entry of entries) {
    addH0BaselineCount(partitions, entry.partition, entry.variants);
    addH0BaselineCount(
      statuses,
      `${entry.status}\u0000${entry.blocker ?? ''}`,
      entry.variants,
    );
  }
  return {
    roots: entries.length,
    variants: entries.reduce((total, entry) => total + entry.variants, 0),
    partitions: [...partitions]
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([name, count]) => ({ name, ...count })),
    statuses: [...statuses]
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([key, count]) => {
        const [status, blocker] = key.split('\u0000');
        return { status, blocker: blocker === '' ? null : blocker, ...count };
      }),
  };
}

/**
 * @param {Map<string, { roots: number, variants: number }>} counts
 * @param {string} key
 * @param {number} variants
 */
function addH0BaselineCount(counts, key, variants) {
  const count = counts.get(key) ?? { roots: 0, variants: 0 };
  count.roots += 1;
  count.variants += variants;
  counts.set(key, count);
}

/** @param {unknown} value */
function parseH0PartitionStatusSummary(value) {
  const record = object(
    value,
    `${ES2015_H0_BASELINE_FILE} partitionStatusSummary`,
  );
  requireExactKeys(
    record,
    H0_BASELINE_SUMMARY_KEYS,
    `${ES2015_H0_BASELINE_FILE} partitionStatusSummary`,
  );
  if (
    !nonNegativeInteger(record.roots) ||
    !nonNegativeInteger(record.variants) ||
    !Array.isArray(record.partitions) ||
    record.partitions.length === 0 ||
    !Array.isArray(record.statuses) ||
    record.statuses.length === 0
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} partition/status summary is invalid`,
    );
  }
  const partitions = record.partitions.map((entry, index) => {
    const partition = object(
      entry,
      `${ES2015_H0_BASELINE_FILE} partition ${index}`,
    );
    requireExactKeys(
      partition,
      H0_BASELINE_PARTITION_KEYS,
      `${ES2015_H0_BASELINE_FILE} partition ${index}`,
    );
    if (
      typeof partition.name !== 'string' ||
      partition.name === '' ||
      !nonNegativeInteger(partition.roots) ||
      !nonNegativeInteger(partition.variants)
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_BASELINE_FILE} partition ${index} is invalid`,
      );
    }
    return {
      name: partition.name,
      roots: partition.roots,
      variants: partition.variants,
    };
  });
  assertSortedUnique(
    partitions.map((partition) => partition.name),
    `${ES2015_H0_BASELINE_FILE} partitions`,
  );
  const statuses = record.statuses.map((entry, index) => {
    const status = object(entry, `${ES2015_H0_BASELINE_FILE} status ${index}`);
    requireExactKeys(
      status,
      H0_BASELINE_STATUS_KEYS,
      `${ES2015_H0_BASELINE_FILE} status ${index}`,
    );
    if (
      typeof status.status !== 'string' ||
      status.status === '' ||
      (status.blocker !== null && typeof status.blocker !== 'string') ||
      !nonNegativeInteger(status.roots) ||
      !nonNegativeInteger(status.variants)
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_BASELINE_FILE} status ${index} is invalid`,
      );
    }
    return {
      status: status.status,
      blocker: status.blocker,
      roots: status.roots,
      variants: status.variants,
    };
  });
  assertSortedUnique(
    statuses.map((status) => `${status.status}\u0000${status.blocker ?? ''}`),
    `${ES2015_H0_BASELINE_FILE} statuses`,
  );
  if (
    partitions.reduce((total, partition) => total + partition.roots, 0) !==
      record.roots ||
    partitions.reduce((total, partition) => total + partition.variants, 0) !==
      record.variants ||
    statuses.reduce((total, status) => total + status.roots, 0) !==
      record.roots ||
    statuses.reduce((total, status) => total + status.variants, 0) !==
      record.variants
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} partition/status summary does not balance`,
    );
  }
  return Object.freeze({
    roots: record.roots,
    variants: record.variants,
    partitions: Object.freeze(
      partitions.map((partition) => Object.freeze(partition)),
    ),
    statuses: Object.freeze(statuses.map((status) => Object.freeze(status))),
  });
}

/** @param {string} text */
function baselineTaxonomy(text) {
  const record = parseJson(text, 'ES2015 taxonomy');
  const pin = object(record.pin, 'ES2015 taxonomy pin');
  if (
    typeof pin.repository !== 'string' ||
    pin.repository === '' ||
    typeof pin.revision !== 'string' ||
    !REVISION_PATTERN.test(pin.revision)
  ) {
    throw new Es2015PromotionError('ES2015 taxonomy pin is invalid');
  }
  const classifications = taxonomyClassifications(record);
  assertSortedUnique(
    classifications.map((entry) => entry.path),
    'ES2015 taxonomy classifications',
  );
  if (
    classifications.some(
      (entry) => !positiveInteger(entry.variants) || entry.partition === '',
    )
  ) {
    throw new Es2015PromotionError(
      'ES2015 taxonomy classifications are invalid',
    );
  }
  return {
    pin: { repository: pin.repository, revision: pin.revision },
    classifications,
  };
}

/** @param {readonly any[]} entries */
function canonicalClassificationSha256(entries) {
  return canonicalSha256(
    [...entries].sort((left, right) => compareStrings(left.path, right.path)),
  );
}

/** @param {unknown} value @returns {string} */
function canonicalSha256(value) {
  return sha256(`${canonicalJson(value)}\n`);
}

/** @param {unknown} value @returns {string} */
function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const record = /** @type {Record<string, unknown>} */ (value);
    return `{${Object.keys(record)
      .sort(compareStrings)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} canonical identity contains an unsupported value`,
    );
  }
  return serialized;
}

/**
 * @param {{ repository: string, revision: string }} value
 * @param {{ repository: string, revision: string }} pin
 * @param {string} label
 */
function assertPinMatches(value, pin, label) {
  if (value.repository !== pin.repository || value.revision !== pin.revision) {
    throw new Es2015PromotionError(
      `${label} does not match the pinned Test262 repository and revision`,
    );
  }
}

/**
 * @param {{
 *   repository: string,
 *   revision: string,
 *   sourceTaxonomySha256: string,
 *   h0LedgerSha256: string,
 *   h0RootCount: number,
 *   h0VariantCount: number,
 * }} value
 * @param {ReturnType<typeof parseEs2015H0Paths>} paths
 * @param {string} label
 */
function assertH0IdentityMatchesPaths(value, paths, label) {
  if (
    value.repository !== paths.repository ||
    value.revision !== paths.revision ||
    value.sourceTaxonomySha256 !== paths.sourceTaxonomySha256 ||
    value.h0LedgerSha256 !== paths.ledgerSha256 ||
    value.h0RootCount !== paths.rootCount ||
    value.h0VariantCount !== paths.variantCount
  ) {
    throw new Es2015PromotionError(
      `${label} does not match the immutable H0 paths`,
    );
  }
}

/**
 * @param {string | object} source
 * @returns {any[]}
 */
function taxonomyClassifications(source) {
  const taxonomy =
    typeof source === 'string'
      ? parseJson(source, 'ES2015 taxonomy')
      : object(source, 'ES2015 taxonomy');
  if (!Array.isArray(taxonomy.classifications)) {
    throw new Es2015PromotionError(
      'ES2015 taxonomy must expose classifications',
    );
  }
  return taxonomy.classifications.map((entry, index) => {
    const record = object(entry, `ES2015 taxonomy classification ${index}`);
    if (
      typeof record.path !== 'string' ||
      typeof record.variants !== 'number' ||
      typeof record.partition !== 'string' ||
      typeof record.status !== 'string' ||
      (record.blocker !== null && typeof record.blocker !== 'string')
    ) {
      throw new Es2015PromotionError(
        `ES2015 taxonomy classification ${index} is invalid`,
      );
    }
    return record;
  });
}

/** @param {string | object} source */
function taxonomyByPath(source) {
  const map = new Map();
  for (const entry of taxonomyClassifications(source)) {
    if (map.has(entry.path)) {
      throw new Es2015PromotionError(
        `ES2015 taxonomy repeats classification ${entry.path}`,
      );
    }
    map.set(entry.path, entry);
  }
  return map;
}

/**
 * @param {string} text
 * @param {{ repository: string, revision: string }} pin
 */
export function parseEs2015H0OwnerMap(text, pin) {
  const record = parseJson(text, ES2015_H0_OWNER_MAP_FILE);
  requireExactKeys(record, OWNER_MAP_KEYS, ES2015_H0_OWNER_MAP_FILE);
  validateRepositoryRevision(record, ES2015_H0_OWNER_MAP_FILE);
  assertPinMatches(
    /** @type {{ repository: string, revision: string }} */ (record),
    pin,
    ES2015_H0_OWNER_MAP_FILE,
  );
  if (!Array.isArray(record.owners) || record.owners.length === 0) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_MAP_FILE} must contain reviewed owners`,
    );
  }
  const owners = record.owners.map((entry, index) => parseOwner(entry, index));
  const ownerCodes = owners.map((owner) => owner.code);
  assertSortedUnique(ownerCodes, `${ES2015_H0_OWNER_MAP_FILE} owner codes`);
  const ownersByCode = new Map(owners.map((owner) => [owner.code, owner]));
  if (!Array.isArray(record.rules) || record.rules.length === 0) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_MAP_FILE} must contain reviewed owner rules`,
    );
  }
  const rules = record.rules.map((entry, index) =>
    parseOwnerRule(entry, index, ownersByCode),
  );
  assertSortedUnique(
    rules.map((rule) => rule.name),
    `${ES2015_H0_OWNER_MAP_FILE} rule names`,
  );
  return Object.freeze({
    version: ES2015_PROMOTION_VERSION,
    repository: record.repository,
    revision: record.revision,
    owners: Object.freeze(owners),
    ownersByCode,
    rules: Object.freeze(rules),
  });
}

/**
 * Parses and cross-validates the six immutable H0 evidence artifacts.
 *
 * @param {{
 *   pin: { repository: string, revision: string },
 *   pathsText: string,
 *   baselineText: string,
 *   dispositionText: string,
 *   ownerMapText: string,
 *   ownerDeltasText: string,
 *   promotionText: string,
 * }} bundle
 */
export function validateEs2015H0EvidenceBundle(bundle) {
  const record = object(bundle, 'ES2015 H0 evidence bundle');
  requireExactKeys(
    record,
    H0_EVIDENCE_BUNDLE_KEYS,
    'ES2015 H0 evidence bundle',
  );
  const pin = object(record.pin, 'ES2015 H0 evidence bundle pin');
  if (
    typeof pin.repository !== 'string' ||
    typeof pin.revision !== 'string' ||
    !REVISION_PATTERN.test(pin.revision)
  ) {
    throw new Es2015PromotionError('ES2015 H0 evidence bundle pin is invalid');
  }
  for (const key of H0_EVIDENCE_BUNDLE_KEYS.slice(1)) {
    if (typeof record[key] !== 'string') {
      throw new Es2015PromotionError(
        `ES2015 H0 evidence bundle ${key} must be artifact text`,
      );
    }
  }

  const normalizedPin = {
    repository: pin.repository,
    revision: pin.revision,
  };
  const pathsText = /** @type {string} */ (record.pathsText);
  const baselineText = /** @type {string} */ (record.baselineText);
  const dispositionText = /** @type {string} */ (record.dispositionText);
  const ownerMapText = /** @type {string} */ (record.ownerMapText);
  const ownerDeltasText = /** @type {string} */ (record.ownerDeltasText);
  const promotionText = /** @type {string} */ (record.promotionText);
  const paths = parseEs2015H0Paths(pathsText, normalizedPin);
  const baseline = parseEs2015H0Baseline(baselineText, normalizedPin);
  const ownerMap = parseEs2015H0OwnerMap(ownerMapText, normalizedPin);
  const disposition = parseEs2015H0Disposition(dispositionText, {
    pin: normalizedPin,
    paths,
    ownerMapText,
  });
  const promotion = parseEs2015Promotion(promotionText);
  const ownerDeltas = parseEs2015H0OwnerDeltas(ownerDeltasText, {
    pin: normalizedPin,
    paths,
    dispositionText,
    promotionText,
  });

  if (
    baseline.finalBaseTaxonomySha256 !== paths.sourceTaxonomySha256 ||
    baseline.h0LedgerSha256 !== paths.ledgerSha256 ||
    baseline.h0RootCount !== paths.rootCount ||
    baseline.h0VariantCount !== paths.variantCount
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_BASELINE_FILE} does not match the immutable H0 paths`,
    );
  }
  if (
    !isH0Promotion(promotion) ||
    promotion.groupName !== ES2015_H0_PROMOTION_GROUP
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PROMOTION_FILE} must use the exact H0 promotion schema`,
    );
  }
  assertH0IdentityMatchesPaths(promotion, paths, ES2015_H0_PROMOTION_FILE);
  if (
    promotion.dispositionSha256 !== sha256(dispositionText) ||
    ownerDeltas.dispositionSha256 !== sha256(dispositionText) ||
    ownerDeltas.promotionSha256 !== sha256(promotionText) ||
    disposition.ownerMapSha256 !== sha256(ownerMapText) ||
    ownerDeltas.provenance.sourceTaxonomySha256 !==
      paths.sourceTaxonomySha256 ||
    ownerDeltas.provenance.executionEvidenceSha256 !==
      disposition.executionEvidenceSha256 ||
    ownerDeltas.provenance.ownerMapSha256 !== disposition.ownerMapSha256
  ) {
    throw new Es2015PromotionError(
      'ES2015 H0 evidence bundle provenance hashes do not agree',
    );
  }

  assertDispositionMatchesOwnerMap(disposition, ownerMap);
  const passed = disposition.dispositions.filter(
    (entry) => entry.status === 'passed',
  );
  if (
    promotion.entries.length !== passed.length ||
    promotion.entries.some(
      (entry, index) =>
        entry.path !== passed[index].path ||
        entry.variants !== passed[index].variants,
    )
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_PROMOTION_FILE} must contain exactly complete-pass H0 dispositions`,
    );
  }

  const [removed, ...added] = ownerDeltas.deltas;
  const dispositionPaths = disposition.dispositions.map((entry) => entry.path);
  const dispositionVariants = disposition.dispositions.reduce(
    (total, entry) => total + entry.variants,
    0,
  );
  if (
    !sameStrings(removed.paths, dispositionPaths) ||
    removed.roots !== disposition.dispositions.length ||
    removed.variants !== dispositionVariants ||
    removed.variantEvidenceSha256 !==
      h0VariantEvidenceSha256(disposition.dispositions) ||
    ownerDeltas.crossRealm.remainingRoots !== 0 ||
    ownerDeltas.crossRealm.remainingVariants !== 0
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} H0 removal is not exact`,
    );
  }

  /** @type {Map<string, any[]>} */
  const reassignedByOwner = new Map();
  for (const entry of disposition.dispositions) {
    if (entry.status !== 'reassigned') continue;
    const entries = reassignedByOwner.get(entry.primaryOwner.code) ?? [];
    entries.push(entry);
    reassignedByOwner.set(entry.primaryOwner.code, entries);
  }
  const expectedOwners = sortStrings([...reassignedByOwner.keys()]);
  if (
    added.length !== expectedOwners.length ||
    !sameStrings(
      added.map((delta) => delta.owner.code),
      expectedOwners,
    )
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_DELTAS_FILE} owner additions do not match reassigned H0 dispositions`,
    );
  }
  for (const delta of added) {
    const entries = /** @type {any[]} */ (
      reassignedByOwner.get(delta.owner.code)
    );
    const pathsForOwner = entries.map((entry) => entry.path);
    const variantsForOwner = entries.reduce(
      (total, entry) => total + entry.variants,
      0,
    );
    if (
      !sameStrings(delta.paths, pathsForOwner) ||
      delta.roots !== entries.length ||
      delta.variants !== variantsForOwner ||
      delta.variantEvidenceSha256 !== h0VariantEvidenceSha256(entries)
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_OWNER_DELTAS_FILE} owner ${delta.owner.code} addition is stale`,
      );
    }
  }

  return Object.freeze({
    paths,
    baseline,
    disposition,
    ownerMap,
    ownerDeltas,
    promotion,
  });
}

/** @param {unknown} value @param {number} index */
function parseOwner(value, index) {
  const record = object(value, `${ES2015_H0_OWNER_MAP_FILE} owner ${index}`);
  requireExactKeys(
    record,
    OWNER_KEYS,
    `${ES2015_H0_OWNER_MAP_FILE} owner ${index}`,
  );
  const roadmap = /** @type {Record<string, any>} */ (ROADMAP_OWNERS)[
    record.code
  ];
  if (
    roadmap === undefined ||
    record.issue !== roadmap.issue ||
    record.blocker !== roadmap.blocker ||
    record.title !== roadmap.title
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_MAP_FILE} owner ${String(record.code)} must match an existing roadmap issue`,
    );
  }
  if (record.code === 'H0' || record.code === 'F0') {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_MAP_FILE} cannot reassign H0 roots to ${record.code}`,
    );
  }
  return roadmapOwner(record.code);
}

/**
 * @param {unknown} value
 * @param {number} index
 * @param {Map<string, any>} ownersByCode
 */
function parseOwnerRule(value, index, ownersByCode) {
  const record = object(value, `${ES2015_H0_OWNER_MAP_FILE} rule ${index}`);
  requireExactKeys(
    record,
    OWNER_RULE_KEYS,
    `${ES2015_H0_OWNER_MAP_FILE} rule ${index}`,
  );
  if (typeof record.name !== 'string' || record.name === '') {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_MAP_FILE} rule ${index} must have a name`,
    );
  }
  const primaryOwner = ownersByCode.get(record.primaryOwner);
  if (primaryOwner === undefined) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_MAP_FILE} rule ${record.name} uses an unknown owner`,
    );
  }
  if (
    typeof record.pathPrefix !== 'string' ||
    !record.pathPrefix.startsWith('test/') ||
    record.pathPrefix === 'test/'
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_MAP_FILE} rule ${record.name} must use a concrete Test262 path prefix`,
    );
  }
  const failureSignatures = sortedStringList(
    record.failureSignatures,
    `${ES2015_H0_OWNER_MAP_FILE} rule ${record.name} signatures`,
  );
  if (failureSignatures.length === 0) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_MAP_FILE} rule ${record.name} must review at least one failure signature`,
    );
  }
  if (!Array.isArray(record.secondaryEvidence)) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_MAP_FILE} rule ${record.name} secondaryEvidence must be an array`,
    );
  }
  const secondaryEvidence = record.secondaryEvidence.map(
    (entry, entryIndex) => {
      const secondary = object(
        entry,
        `${ES2015_H0_OWNER_MAP_FILE} rule ${record.name} secondary ${entryIndex}`,
      );
      requireExactKeys(
        secondary,
        SECONDARY_EVIDENCE_KEYS,
        `${ES2015_H0_OWNER_MAP_FILE} rule ${record.name} secondary ${entryIndex}`,
      );
      const owner = ownersByCode.get(secondary.owner);
      if (owner === undefined) {
        throw new Es2015PromotionError(
          `${ES2015_H0_OWNER_MAP_FILE} rule ${record.name} secondary evidence uses an unknown owner`,
        );
      }
      if (
        typeof secondary.signature !== 'string' ||
        secondary.signature === ''
      ) {
        throw new Es2015PromotionError(
          `${ES2015_H0_OWNER_MAP_FILE} rule ${record.name} secondary evidence needs a signature`,
        );
      }
      return Object.freeze({ owner, signature: secondary.signature });
    },
  );
  return Object.freeze({
    name: record.name,
    primaryOwner,
    pathPrefix: record.pathPrefix,
    failureSignatures: Object.freeze(failureSignatures),
    secondaryEvidence: Object.freeze(secondaryEvidence),
  });
}

/** @param {string} code */
function roadmapOwner(code) {
  const owner = /** @type {Record<string, any>} */ (ROADMAP_OWNERS)[code];
  if (owner === undefined) {
    throw new Es2015PromotionError(`Unknown roadmap owner ${code}`);
  }
  return Object.freeze({ ...owner });
}

/** @param {readonly any[]} dispositions */
function dispositionExecutionRecords(dispositions) {
  return dispositions.flatMap((entry) =>
    entry.evidence.map((/** @type {any} */ evidence) => ({
      type: 'test',
      file: entry.path,
      variant: evidence.variant,
      status: evidence.status,
      ...(evidence.status === 'failed'
        ? { reason: evidence.reason, message: evidence.message }
        : {}),
    })),
  );
}

/**
 * @param {string} repository
 * @param {string} revision
 * @param {readonly any[]} records
 */
function h0ExecutionEvidenceSha256(repository, revision, records) {
  const canonicalRecords = records.map((record) => ({
    type: 'test',
    file: record.file,
    variant: record.variant,
    status: record.status,
    ...(record.status === 'failed'
      ? { reason: record.reason, message: record.message }
      : {}),
  }));
  return sha256(
    `${JSON.stringify(
      {
        version: ES2015_PROMOTION_VERSION,
        repository,
        revision,
        records: canonicalRecords,
      },
      null,
      2,
    )}\n`,
  );
}

/** @param {string} text */
function parseH0ExecutionEvidence(text) {
  const trimmed = text.trim();
  if (trimmed === '') {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} execution evidence must not be empty`,
    );
  }
  if (trimmed.startsWith('{')) {
    const record = parseJson(
      text,
      `${ES2015_H0_DISPOSITION_FILE} execution evidence`,
    );
    const records =
      record.records ?? record.executionRecords ?? record.auditRecords;
    if (!Array.isArray(records)) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} execution evidence must contain records`,
      );
    }
    return Object.freeze({
      repository: record.repository,
      revision: record.revision,
      records: Object.freeze(normalizeExecutionRecords(records)),
    });
  }
  const records = trimmed
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((record) => record.type === 'test');
  return Object.freeze({
    repository: undefined,
    revision: undefined,
    records: Object.freeze(normalizeExecutionRecords(records)),
  });
}

/** @param {readonly any[]} records */
function normalizeExecutionRecords(records) {
  const normalized = records.map((record, index) => {
    const value = object(
      record,
      `${ES2015_H0_DISPOSITION_FILE} execution record ${index}`,
    );
    if (
      value.type !== 'test' ||
      typeof value.file !== 'string' ||
      value.file === '' ||
      typeof value.variant !== 'string' ||
      value.variant === '' ||
      typeof value.status !== 'string' ||
      !['passed', 'failed', 'skipped'].includes(value.status)
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} execution record ${index} is invalid`,
      );
    }
    if (
      value.status === 'failed' &&
      (typeof value.reason !== 'string' ||
        value.reason === '' ||
        typeof value.message !== 'string' ||
        value.message === '')
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} failed execution record ${index} needs concrete reason and message`,
      );
    }
    return Object.freeze({
      type: 'test',
      file: value.file,
      variant: value.variant,
      status: value.status,
      ...(value.reason === undefined ? {} : { reason: value.reason }),
      ...(value.message === undefined ? {} : { message: value.message }),
    });
  });
  assertSortedUnique(
    normalized.map((record) => `${record.file}\u0000${record.variant}`),
    `${ES2015_H0_DISPOSITION_FILE} execution records`,
  );
  return normalized;
}

/** @param {readonly any[]} inventory */
function inventoryByPath(inventory) {
  if (!Array.isArray(inventory)) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} requires H0 inventory`,
    );
  }
  const values = new Map();
  for (const root of inventory) {
    if (typeof root?.path !== 'string' || values.has(root.path)) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} inventory contains an invalid or duplicate root`,
      );
    }
    values.set(root.path, root);
  }
  return values;
}

/** @param {any} root @param {string} path */
function requiredVariants(root, path) {
  const variants = sortedStringList(
    root.executionVariants,
    `${path} execution variants`,
  );
  if (root.variants !== variants.length) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} inventory variant count drifted for ${path}`,
    );
  }
  return Object.freeze(variants);
}

/** @param {readonly any[]} records */
function executionRecordsByPath(records) {
  const values = new Map();
  for (const record of records) {
    const entries = values.get(record.file) ?? [];
    entries.push(record);
    values.set(record.file, entries);
  }
  return values;
}

/**
 * @param {readonly any[]} records
 * @param {readonly string[]} variants
 * @param {string} label
 */
function assertExactVariantRecords(records, variants, label) {
  if (records.length !== variants.length) {
    throw new Es2015PromotionError(
      `${label} must contain ${variants.length} complete variant records`,
    );
  }
  const actual = sortStrings(records.map((record) => record.variant));
  if (!sameStrings(actual, variants)) {
    throw new Es2015PromotionError(`${label} has incorrect variants`);
  }
}

/**
 * @param {string} path
 * @param {readonly any[]} records
 * @param {{ rules: readonly any[], owners: readonly any[] }} ownerMap
 */
function matchOwnerRules(path, records, ownerMap) {
  const signatures = sortStrings([
    ...new Set(records.map((record) => normalizeFailureSignature(record))),
  ]);
  /** @type {any[]} */
  const matched = [];
  for (const signature of signatures) {
    const matches = ownerMap.rules.filter(
      (rule) =>
        path.startsWith(rule.pathPrefix) &&
        rule.failureSignatures.includes(signature),
    );
    if (matches.length === 0) {
      throw new Es2015PromotionError(
        `${ES2015_H0_OWNER_MAP_FILE} has no reviewed owner for ${path} failure ${signature}`,
      );
    }
    matched.push(...matches);
  }
  const ownerOrder = new Map(
    ownerMap.owners.map((owner, index) => [owner.code, index]),
  );
  matched.sort((left, right) => {
    const leftOrder = ownerOrder.get(left.primaryOwner.code) ?? 0;
    const rightOrder = ownerOrder.get(right.primaryOwner.code) ?? 0;
    return leftOrder - rightOrder || compareStrings(left.name, right.name);
  });
  const primaryOwners = new Set(matched.map((rule) => rule.primaryOwner.code));
  if (primaryOwners.size !== 1) {
    throw new Es2015PromotionError(
      `${ES2015_H0_OWNER_MAP_FILE} failed variants for ${path} map to different primary owners`,
    );
  }
  const primaryOwner = matched[0].primaryOwner;
  /** @type {Map<string, any>} */
  const secondary = new Map();
  for (const rule of matched) {
    for (const entry of rule.secondaryEvidence) {
      secondary.set(`${entry.owner.code}\u0000${entry.signature}`, entry);
    }
  }
  return Object.freeze({
    primaryOwner,
    failureSignatures: Object.freeze(signatures),
    secondaryEvidence: Object.freeze(
      [...secondary.values()].sort((left, right) =>
        compareStrings(
          `${left.owner.code}\u0000${left.signature}`,
          `${right.owner.code}\u0000${right.signature}`,
        ),
      ),
    ),
  });
}

/**
 * @param {ReturnType<typeof parseEs2015H0Disposition>} disposition
 * @param {ReturnType<typeof parseEs2015H0OwnerMap>} ownerMap
 */
function assertDispositionMatchesOwnerMap(disposition, ownerMap) {
  for (const entry of disposition.dispositions) {
    if (entry.status !== 'reassigned') continue;
    const failed = entry.evidence
      .filter((/** @type {any} */ evidence) => evidence.status === 'failed')
      .map((/** @type {any} */ evidence) => ({
        reason: evidence.reason,
        message: evidence.message,
      }));
    const reassignment = matchOwnerRules(entry.path, failed, ownerMap);
    if (
      reassignment.primaryOwner.code !== entry.primaryOwner.code ||
      !sameStrings(reassignment.failureSignatures, entry.failureSignatures) ||
      !sameStrings(
        reassignment.secondaryEvidence.map(
          (/** @type {any} */ evidence) =>
            `${evidence.owner.code}\u0000${evidence.signature}`,
        ),
        entry.secondaryEvidence.map(
          (/** @type {any} */ evidence) =>
            `${evidence.owner.code}\u0000${evidence.signature}`,
        ),
      )
    ) {
      throw new Es2015PromotionError(
        `${ES2015_H0_DISPOSITION_FILE} owner-map reassignment is stale for ${entry.path}`,
      );
    }
  }
}

/** @param {{ reason?: string, message?: string }} record */
function normalizeFailureSignature(record) {
  if (
    typeof record.reason !== 'string' ||
    record.reason === '' ||
    typeof record.message !== 'string' ||
    record.message === ''
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} failed record needs concrete failure evidence`,
    );
  }
  return `${record.reason}:${record.message.replace(/\s+/gu, ' ').trim()}`;
}

/** @param {any} entry */
function freezeDisposition(entry) {
  return Object.freeze({
    ...entry,
    requiredVariants: Object.freeze([...entry.requiredVariants]),
    evidence: Object.freeze(
      entry.evidence.map((/** @type {any} */ e) => Object.freeze({ ...e })),
    ),
    ...(entry.failureSignatures === undefined
      ? {}
      : { failureSignatures: Object.freeze([...entry.failureSignatures]) }),
    ...(entry.secondaryEvidence === undefined
      ? {}
      : {
          secondaryEvidence: Object.freeze(
            entry.secondaryEvidence.map((/** @type {any} */ e) =>
              Object.freeze({ ...e }),
            ),
          ),
        }),
  });
}

/** @param {unknown} value @param {number} index */
function parseDispositionEntry(value, index) {
  const record = object(
    value,
    `${ES2015_H0_DISPOSITION_FILE} disposition ${index}`,
  );
  const keys =
    record.status === 'passed'
      ? H0_PASSED_DISPOSITION_KEYS
      : H0_REASSIGNED_DISPOSITION_KEYS;
  requireExactKeys(
    record,
    keys,
    `${ES2015_H0_DISPOSITION_FILE} disposition ${index}`,
  );
  if (
    typeof record.path !== 'string' ||
    !record.path.startsWith('test/') ||
    !record.path.endsWith('.js') ||
    !positiveInteger(record.variants)
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} disposition ${index} is invalid`,
    );
  }
  const required = sortedStringList(
    record.requiredVariants,
    `${ES2015_H0_DISPOSITION_FILE} ${record.path} variants`,
  );
  if (required.length !== record.variants) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} ${record.path} variant count does not match variants`,
    );
  }
  if (
    !Array.isArray(record.evidence) ||
    record.evidence.length !== required.length
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} ${record.path} evidence must cover every variant`,
    );
  }
  const allowedVariantStatuses =
    record.status === 'passed' ? ['passed'] : ['passed', 'failed'];
  const evidence = record.evidence.map((entry, entryIndex) =>
    parseDispositionEvidence(entry, entryIndex, allowedVariantStatuses),
  );
  assertExactVariantRecords(
    evidence,
    required,
    `${ES2015_H0_DISPOSITION_FILE} ${record.path} disposition evidence`,
  );
  if (record.status === 'passed') {
    return freezeDisposition({
      path: record.path,
      status: 'passed',
      variants: record.variants,
      requiredVariants: required,
      evidence,
    });
  }
  if (record.status !== 'reassigned') {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} ${record.path} has unknown disposition status`,
    );
  }
  const primaryOwner = parseDispositionOwner(record.primaryOwner, record.path);
  const failureSignatures = sortedStringList(
    record.failureSignatures,
    `${ES2015_H0_DISPOSITION_FILE} ${record.path} failure signatures`,
  );
  const failedEvidence = evidence.filter((entry) => entry.status === 'failed');
  if (failedEvidence.length === 0) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} ${record.path} reassignment needs failed variant evidence`,
    );
  }
  const evidenceSignatures = sortStrings([
    ...new Set(failedEvidence.map((entry) => entry.signature)),
  ]);
  if (!sameStrings(failureSignatures, evidenceSignatures)) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} ${record.path} failure signatures do not match evidence`,
    );
  }
  if (!Array.isArray(record.secondaryEvidence)) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} ${record.path} secondaryEvidence must be an array`,
    );
  }
  const secondaryEvidence = record.secondaryEvidence.map(
    (entry, entryIndex) => {
      const secondary = object(
        entry,
        `${ES2015_H0_DISPOSITION_FILE} ${record.path} secondary ${entryIndex}`,
      );
      requireExactKeys(
        secondary,
        SECONDARY_EVIDENCE_KEYS,
        `${ES2015_H0_DISPOSITION_FILE} ${record.path} secondary ${entryIndex}`,
      );
      return Object.freeze({
        owner: parseDispositionOwner(secondary.owner, record.path),
        signature: secondary.signature,
      });
    },
  );
  assertSortedUnique(
    secondaryEvidence.map(
      (entry) => `${entry.owner.code}\u0000${entry.signature}`,
    ),
    `${ES2015_H0_DISPOSITION_FILE} ${record.path} secondary evidence`,
  );
  return freezeDisposition({
    path: record.path,
    status: 'reassigned',
    variants: record.variants,
    requiredVariants: required,
    primaryOwner,
    failureSignatures,
    secondaryEvidence,
    evidence,
  });
}

/**
 * @param {unknown} value
 * @param {number} index
 * @param {readonly string[]} allowedStatuses
 */
function parseDispositionEvidence(value, index, allowedStatuses) {
  const record = object(
    value,
    `${ES2015_H0_DISPOSITION_FILE} disposition evidence ${index}`,
  );
  const status = record.status;
  requireExactKeys(
    record,
    status === 'passed' ? H0_PASSED_EVIDENCE_KEYS : H0_EVIDENCE_KEYS,
    `${ES2015_H0_DISPOSITION_FILE} disposition evidence ${index}`,
  );
  if (
    typeof record.variant !== 'string' ||
    record.variant === '' ||
    (status !== 'passed' && status !== 'failed') ||
    !allowedStatuses.includes(status) ||
    record.status !== status
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} disposition evidence ${index} is invalid`,
    );
  }
  if (status === 'passed') {
    return Object.freeze({ variant: record.variant, status: 'passed' });
  }
  if (
    typeof record.reason !== 'string' ||
    record.reason === '' ||
    typeof record.message !== 'string' ||
    record.message === '' ||
    typeof record.signature !== 'string' ||
    record.signature === ''
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} disposition evidence ${index} needs concrete failure evidence`,
    );
  }
  return Object.freeze({
    variant: record.variant,
    status: 'failed',
    reason: record.reason,
    message: record.message,
    signature: record.signature,
  });
}

/** @param {unknown} value @param {string} path */
function parseDispositionOwner(value, path) {
  const record = object(value, `${ES2015_H0_DISPOSITION_FILE} ${path} owner`);
  requireExactKeys(
    record,
    OWNER_KEYS,
    `${ES2015_H0_DISPOSITION_FILE} ${path} owner`,
  );
  const owner = /** @type {Record<string, any>} */ (ROADMAP_OWNERS)[
    record.code
  ];
  if (
    owner === undefined ||
    owner.issue !== record.issue ||
    owner.blocker !== record.blocker ||
    owner.title !== record.title
  ) {
    throw new Es2015PromotionError(
      `${ES2015_H0_DISPOSITION_FILE} ${path} owner must match an existing roadmap issue`,
    );
  }
  return roadmapOwner(record.code);
}

/** @param {readonly any[]} dispositions */
function dispositionCounts(dispositions) {
  let h0RootCount = 0;
  let h0VariantCount = 0;
  let executionPassedVariantCount = 0;
  let executionFailedVariantCount = 0;
  let completePassedRootCount = 0;
  let completePassedVariantCount = 0;
  let reassignedRootCount = 0;
  let reassignedVariantCount = 0;
  let allFailedRootCount = 0;
  let allFailedVariantCount = 0;
  let mixedRootCount = 0;
  let mixedVariantCount = 0;
  for (const entry of dispositions) {
    h0RootCount += 1;
    h0VariantCount += entry.variants;
    if (entry.status === 'passed') {
      completePassedRootCount += 1;
      completePassedVariantCount += entry.variants;
    } else if (entry.status === 'reassigned') {
      reassignedRootCount += 1;
      reassignedVariantCount += entry.variants;
      if (
        entry.evidence.every(
          (/** @type {any} */ evidence) => evidence.status === 'failed',
        )
      ) {
        allFailedRootCount += 1;
        allFailedVariantCount += entry.variants;
      } else {
        mixedRootCount += 1;
        mixedVariantCount += entry.variants;
      }
    }
    for (const evidence of entry.evidence) {
      if (evidence.status === 'passed') {
        executionPassedVariantCount += 1;
      } else if (evidence.status === 'failed') {
        executionFailedVariantCount += 1;
      }
    }
  }
  return Object.freeze({
    h0RootCount,
    h0VariantCount,
    executionPassedVariantCount,
    executionFailedVariantCount,
    completePassedRootCount,
    completePassedVariantCount,
    reassignedRootCount,
    reassignedVariantCount,
    allFailedRootCount,
    allFailedVariantCount,
    mixedRootCount,
    mixedVariantCount,
  });
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string[]}
 */
function sortedStringList(value, label) {
  const sorted = normalizedStringList(value, label);
  if (!Array.isArray(value) || !sameStrings(value, sorted)) {
    throw new Es2015PromotionError(`${label} must be code-unit sorted`);
  }
  return sorted;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string[]}
 */
function normalizedStringList(value, label) {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item === '')
  ) {
    throw new Es2015PromotionError(`${label} must contain non-empty strings`);
  }
  if (new Set(value).size !== value.length) {
    throw new Es2015PromotionError(`${label} must not repeat values`);
  }
  return sortStrings([...value]);
}

/** @param {unknown} value */
function positiveInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** @param {unknown} value */
function nonNegativeInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {Set<string>}
 */
function stringSet(value, label) {
  if (value instanceof Set) {
    return new Set(value);
  }
  if (Array.isArray(value)) {
    return new Set(value);
  }
  throw new Es2015PromotionError(`${ES2015_PROMOTION_FILE} requires ${label}`);
}

/**
 * @param {unknown} manifest
 * @returns {Map<string, any>}
 */
function manifestEntries(manifest) {
  if (typeof manifest !== 'object' || manifest === null) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} must be parsed before use`,
    );
  }
  const entries = entriesByManifest.get(/** @type {object} */ (manifest));
  if (entries === undefined) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} must be parsed before use`,
    );
  }
  return entries;
}

/** @param {unknown} value @param {string} [label] */
function parseJson(value, label = ES2015_PROMOTION_FILE) {
  if (typeof value !== 'string') {
    throw new Es2015PromotionError(`${label} must be JSON text`);
  }
  try {
    return object(JSON.parse(value), label);
  } catch (error) {
    if (error instanceof Es2015PromotionError) {
      throw error;
    }
    throw new Es2015PromotionError(
      `${label} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
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
    throw new Es2015PromotionError(`${label} must be an object`);
  }
  return /** @type {Record<string, any>} */ (value);
}

/**
 * @param {Record<string, unknown>} record
 * @param {readonly string[]} expected
 * @param {string} label
 */
function requireExactKeys(record, expected, label) {
  for (const key of Object.keys(record)) {
    if (!expected.includes(key)) {
      throw new Es2015PromotionError(`${label} has unknown key ${key}`);
    }
  }
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Es2015PromotionError(`${label} is missing key ${key}`);
    }
  }
}

/** @param {Record<string, unknown>} record @param {string} key */
function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** @param {readonly string[]} left @param {readonly string[]} right */
function sameStrings(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

/** @param {string} left @param {string} right */
function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** @param {readonly string[]} values @param {string} label */
function assertSortedUnique(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Es2015PromotionError(`${label} must not repeat values`);
  }
  if (!sameStrings([...values], sortStrings([...values]))) {
    throw new Es2015PromotionError(`${label} must be code-unit sorted`);
  }
}

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}
