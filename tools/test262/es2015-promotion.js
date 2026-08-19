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
export const ES2015_PROMOTION_VERSION = 1;
export const ES2015_PROMOTION_GROUP = 'es2015/audit-passing-promotion';

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
const ENTRY_KEYS = Object.freeze([
  'path',
  'variants',
  'features',
  'includeFeatures',
]);
const REVISION_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const EMPTY_FEATURES = Object.freeze([]);
const entriesByManifest = new WeakMap();

export class Es2015PromotionError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'Es2015PromotionError';
  }
}

/**
 * @param {string} text
 */
export function parseEs2015Promotion(text) {
  const record = parseJson(text);
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

  const manifest = Object.freeze({
    version: ES2015_PROMOTION_VERSION,
    repository: record.repository,
    revision: record.revision,
    sourceTaxonomySha256: record.sourceTaxonomySha256,
    ledgerSha256: record.ledgerSha256,
    rootCount: record.rootCount,
    variantCount: record.variantCount,
    entries: Object.freeze(entries),
  });
  entriesByManifest.set(
    manifest,
    new Map(entries.map((entry) => [entry.path, entry])),
  );
  return manifest;
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
  const groups = options.subset.groups.filter(
    (group) => group.name === ES2015_PROMOTION_GROUP,
  );
  const paths = promotionPaths(promotion);

  if (groups.length !== 1 || !sameStrings(groups[0].paths, paths)) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} must match exactly one ${ES2015_PROMOTION_GROUP} subset group`,
    );
  }
  validateEs2015Promotion(promotion, {
    pin: options.pin,
    policy: options.policy,
    selectedPaths: upstreamSubsetPaths(options.subset),
    inventory: options.inventory,
  });

  const roots = new Map(options.inventory.map((root) => [root.path, root]));
  return (file, metadata) =>
    supportedFeaturesForPromotedPath(
      promotion,
      file,
      metadata,
      roots.get(file)?.includeFeatures ?? [],
    );
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

  if (subset.groups.some((group) => group.name === ES2015_PROMOTION_GROUP)) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} promotion group is already present`,
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
    name: ES2015_PROMOTION_GROUP,
    summary:
      'Exact audited ES2015 roots with immutable per-path feature authorization.',
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
 * @param {unknown} value
 * @param {number} index
 */
function parseEntry(value, index) {
  const record = object(value, `${ES2015_PROMOTION_FILE} entry ${index}`);
  requireExactKeys(
    record,
    ENTRY_KEYS,
    `${ES2015_PROMOTION_FILE} entry ${index}`,
  );
  if (
    typeof record.path !== 'string' ||
    !record.path.startsWith('test/') ||
    !record.path.endsWith('.js')
  ) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} entry ${index} must name a Test262 root`,
    );
  }
  if (!positiveInteger(record.variants)) {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} entry ${record.path} must have a positive variant count`,
    );
  }
  return Object.freeze({
    path: record.path,
    variants: record.variants,
    features: Object.freeze(
      sortedStringList(
        record.features,
        `${ES2015_PROMOTION_FILE} entry ${record.path} features`,
      ),
    ),
    includeFeatures: Object.freeze(
      sortedStringList(
        record.includeFeatures,
        `${ES2015_PROMOTION_FILE} entry ${record.path} includeFeatures`,
      ),
    ),
  });
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string[]}
 */
function sortedStringList(value, label) {
  const sorted = normalizedStringList(value, label);
  if (!sameStrings(value, sorted)) {
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
  return Number.isInteger(value) && value > 0;
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

/** @param {unknown} value */
function parseJson(value) {
  if (typeof value !== 'string') {
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} must be JSON text`,
    );
  }
  try {
    return object(JSON.parse(value), ES2015_PROMOTION_FILE);
  } catch (error) {
    if (error instanceof Es2015PromotionError) {
      throw error;
    }
    throw new Es2015PromotionError(
      `${ES2015_PROMOTION_FILE} is not valid JSON: ${
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

/** @param {readonly string[]} left @param {readonly string[]} right */
function sameStrings(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}
