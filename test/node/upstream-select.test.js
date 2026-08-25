import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertSame } from '../harness/assert.js';
import { assertThrows } from '../harness/assert.js';
import { parseTest262Metadata } from '../../tools/test262/metadata.js';
import {
  ES5_SELECTION_VERSION,
  matchExclusion,
  parseEs5Selection,
} from '../../tools/test262/es5-selection.js';
import {
  ES2015_H0_PROMOTION_GROUP,
  ES2015_PROMOTION_GROUP,
  assertExactH0DispositionDelta,
  assertEs2015H0BaselineMatchesTaxonomy,
  assertEs2015H0ExecutionMatchesDisposition,
  buildEs2015H0Baseline,
  buildEs2015H0Disposition,
  buildEs2015H0OwnerDeltas,
  buildEs2015Promotion,
  createEs2015PromotionAuthorization,
  createEs2015PromotionAuthorizations,
  Es2015PromotionError,
  mergePromotionSubset,
  mergePromotionSubsets,
  parseEs2015H0Baseline,
  parseEs2015H0Disposition,
  parseEs2015H0OwnerDeltas,
  parseEs2015H0OwnerMap,
  parseEs2015H0Paths,
  parseEs2015Promotion,
  promotionPaths,
  supportedFeaturesForPromotedPath,
  validateEs2015H0EvidenceBundle,
  validateEs2015Promotion,
} from '../../tools/test262/es2015-promotion.js';
import {
  inspectEngineGrammar,
  selectPaths,
} from '../../tools/test262/upstream-select-paths.js';
import { assertPinnedCheckout } from '../../tools/test262/pin.js';
import {
  parseUpstreamSubset,
  upstreamSubsetPaths,
} from '../../tools/test262/upstream.js';
import {
  ES2015_M1_PROMOTION_FILE,
  ES2015_P1C_PROMOTION_FILE,
  ES2015_ROADMAP_PROMOTION_FILES,
  readOptionalRoadmapFile,
} from '../../tools/test262/es2015-roadmap-promotions.js';
import {
  createPromotionReportFeaturesForPath,
  createPromotionReportFeaturesForPromotions,
} from '../../tools/test262/promotion-report-features.js';

const { structuredClone } = globalThis;
const EXCLUDED_PATH = 'test/staging/not-read.js';
const REPOSITORY_ROOT = new URL('../../', import.meta.url);
const MODULE_PATH = 'test/built-ins/Array/module.js';
const MODULE_CODE_PATH = 'test/language/module-code/basic.js';
const ELIGIBLE_PATH = 'test/built-ins/Array/eligible.js';
const ORDINARY_PATH = 'test/built-ins/Array/ordinary.js';
const GENERATOR_DECLARATION_PATH =
  'test/built-ins/Array/generator-declaration.js';
const YIELD_FREE_GENERATOR_PATH =
  'test/built-ins/Array/yield-free-generator.js';
const OBJECT_GENERATOR_PATH = 'test/built-ins/Array/object-generator.js';
const CLASS_GENERATOR_PATH = 'test/built-ins/Array/class-generator.js';
const HARNESS_USER_PATH = 'test/built-ins/Array/generator-harness.js';
const GENERATOR_HARNESS = 'generator.js';
const FOCUSED_TAGGED_GENERATOR_PATH =
  'test/built-ins/GeneratorPrototype/next/consecutive-yields.js';
const FOCUSED_UNTAGGED_CLASS_GENERATOR_PATH =
  'test/language/computed-property-names/class/method/generator.js';
const FOCUSED_UNTAGGED_OBJECT_GENERATOR_PATH =
  'test/language/computed-property-names/object/method/generator.js';
const PINNED_CLASS_GENERATOR_NEIGHBOR =
  'test/language/expressions/class/cpn-class-expr-computed-property-name-from-generator-function-declaration.js';
const PINNED_OBJECT_GENERATOR_NEIGHBOR =
  'test/language/expressions/object/cpn-obj-lit-computed-property-name-from-generator-function-declaration.js';
const COMPUTED_PROPERTY_FRONTMATTER =
  '/*---\nfeatures: [computed-property-names]\n---*/\n';
const PROMOTION_PIN = Object.freeze({
  repository: 'https://example.invalid/test262.git',
  revision: '0123456789012345678901234567890123456789',
});
const PROMOTION_PATHS = Object.freeze([
  'test/language/exact.js',
  'test/language/neighbor.js',
]);
const PROMOTION_LEDGER_SHA256 =
  'eaeedcaba2a38a70dddc59794e093318d1edc1dacb41ba64966a593c5dea43ff';
const EMPTY_LEDGER_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const DURABLE_LEDGER_SHA256 =
  '3f2c617b8639c8048afb1a42b95218250b20b6d51b9313f39473b4ddc1c7c646';
const PRE_PROMOTION_TAXONOMY_SHA256 =
  'ce05cbdf15ee3262651520f81ca7e904e021cd4dfcbb29d787b69b4f8f897e31';
const PRE_PROMOTION_GROUPS_SHA256 =
  '6d8aa96442ef3219ab6d39df4ce452a973f43f4b03644d0258f67c9127d873a4';
const P1C_PROMOTION_GROUP = 'es2015/p1c-catch-binding';
const M1_TRACKED_SOURCE_FEATURE_ORDER = Object.freeze({
  'test/built-ins/Reflect/Symbol.toStringTag.js': Object.freeze([
    'Symbol.toStringTag',
    'Reflect',
  ]),
  'test/built-ins/Reflect/apply/arguments-list-is-not-array-like-but-still-valid.js':
    Object.freeze(['Reflect', 'arrow-function', 'Symbol']),
  'test/built-ins/Reflect/apply/arguments-list-is-not-array-like.js':
    Object.freeze(['Reflect', 'arrow-function', 'Symbol']),
  'test/built-ins/Reflect/apply/not-a-constructor.js': Object.freeze([
    'Reflect.construct',
    'Reflect',
    'arrow-function',
  ]),
  'test/built-ins/Reflect/construct/not-a-constructor.js': Object.freeze([
    'Reflect.construct',
    'Reflect',
    'arrow-function',
  ]),
  'test/built-ins/Reflect/defineProperty/not-a-constructor.js': Object.freeze([
    'Reflect.construct',
    'Reflect',
    'arrow-function',
  ]),
  'test/built-ins/Reflect/deleteProperty/not-a-constructor.js': Object.freeze([
    'Reflect.construct',
    'Reflect',
    'arrow-function',
  ]),
  'test/built-ins/Reflect/get/not-a-constructor.js': Object.freeze([
    'Reflect.construct',
    'Reflect',
    'arrow-function',
  ]),
  'test/built-ins/Reflect/getOwnPropertyDescriptor/not-a-constructor.js':
    Object.freeze(['Reflect.construct', 'Reflect', 'arrow-function']),
  'test/built-ins/Reflect/getPrototypeOf/not-a-constructor.js': Object.freeze([
    'Reflect.construct',
    'Reflect',
    'arrow-function',
  ]),
  'test/built-ins/Reflect/has/not-a-constructor.js': Object.freeze([
    'Reflect.construct',
    'Reflect',
    'arrow-function',
  ]),
  'test/built-ins/Reflect/isExtensible/not-a-constructor.js': Object.freeze([
    'Reflect.construct',
    'Reflect',
    'arrow-function',
  ]),
  'test/built-ins/Reflect/preventExtensions/not-a-constructor.js':
    Object.freeze(['Reflect.construct', 'Reflect', 'arrow-function']),
  'test/built-ins/Reflect/set/not-a-constructor.js': Object.freeze([
    'Reflect.construct',
    'Reflect',
    'Reflect.set',
    'arrow-function',
  ]),
  'test/built-ins/Reflect/setPrototypeOf/not-a-constructor.js': Object.freeze([
    'Reflect.construct',
    'Reflect',
    'Reflect.setPrototypeOf',
    'arrow-function',
  ]),
});
const M1_REPORT_ORDER_DIVERGENT_PATHS = Object.freeze(
  Object.keys(M1_TRACKED_SOURCE_FEATURE_ORDER),
);
const M1_REPORT_TRACKED_EVIDENCE_PATHS = Object.freeze([
  'tools/test262/es2015-audit-evidence.json',
  'tools/test262/es2015-h0-promotion.json',
  'tools/test262/es2015-m1-promotion.json',
  'tools/test262/es2015-p1c-promotion.json',
  'tools/test262/es2015-promotion.json',
]);
const H0_PIN = Object.freeze({
  repository: 'https://github.com/tc39/test262.git',
  revision: 'b363f29d3c43c626dc852744ad64a0b48a003693',
});
const M0_PROMOTION = Object.freeze({
  groupName: 'es2015/m0-object-internal-methods',
  version: 2,
  repository: H0_PIN.repository,
  revision: H0_PIN.revision,
  sourceTaxonomySha256:
    '6f60af3b4416b537257cc7c3d418ed918978b7e14b1e5fc6567db9e379dc5908',
  ledgerSha256: EMPTY_LEDGER_SHA256,
  rootCount: 0,
  variantCount: 0,
  entries: Object.freeze([]),
});

/** @param {string} path */
async function readM1ReportEvidence(path) {
  assertSame(
    M1_REPORT_TRACKED_EVIDENCE_PATHS.includes(path),
    true,
    `M1 report-order test must use tracked evidence, not ${path}`,
  );
  return readFile(new URL(path, REPOSITORY_ROOT), 'utf8');
}
const H0_REASSIGNED_PATH = 'test/built-ins/Proxy/h0-failed.js';
const H0_PASSED_PATH = 'test/language/h0-passed.js';
const H0_PATHS = Object.freeze([H0_REASSIGNED_PATH, H0_PASSED_PATH]);
const H0_TAXONOMY_SHA256 =
  '885db168f02087d727cc430c8de2716fed6f74f5c6df9d5a963c979f15a07fa1';
const H0_LEDGER_SHA256 =
  '8b6f637f9a636c8db6560041c76a741e91536d0d11c353fcca1213c8c452b6b7';
const H0_OWNER_MAP_SHA256 =
  '892246f02ee8896c05c13117b1b2b5dbe77355eaf33856df3e32af88b0365c8e';
const H0_EXECUTION_SHA256 =
  '421f6411484e7dca2590b9420aefae11884db6ee0d2e4a90a6b6972d80af95a4';
const H0_DISPOSITION_SHA256 =
  '4fbe4e446bf58199040c7b0d89935a3f67451b52521378249e2a4c69d465b654';
const H0_PROMOTION_SHA256 =
  'b4673dbda18a9d67c24776f59389d64f1ce15571296d399aaf2f9aac78971d1f';
const H0_PROMOTED_LEDGER_SHA256 =
  '95bc15dcd19a543fa370209a7cb09ccb9437dd56c91e653e9577332e36d45a31';
const H0_FAILED_PATH_SHA256 =
  '980d4332f61451f311f3e04658b090ad004b10b06daba4bfcf0add538fa9536a';
const H0_ALL_VARIANT_EVIDENCE_SHA256 =
  'ae2a9fd795897df281758cc64427a5f6b40a2b97b57941208ab0c730c2cf0051';
const H0_FAILED_VARIANT_EVIDENCE_SHA256 =
  'ade673e2f2be79207c29dd25df277c9ec7970c5c22d8f568d83d5f5284dae380';
const H0_CLASSIFICATION_SHA256 =
  '8c2d82e05def877841245c04308c1cf3f7d8b7b8cbe2ee2ee577d75185ba6218';
const H0_NON_CLASSIFICATION_SHA256 =
  '38c567f65c770b1988a07b8faa3a9d633acf67cfb1e2ce8616df83e6f721c160';
const H0_SUMMARY_SHA256 =
  'b390c131025312e26680454888fe0af3737e2f21c2f07513854b2dc4eeac4ce0';
const H0_FINAL_BASE_COMMIT = '1'.repeat(40);
const H0_OWNER_M0 = Object.freeze({
  code: 'M0',
  issue: 79,
  blocker: 'proxy-and-reflect-metaobject',
  title: 'Formalize the ES2015 object internal-method contract',
});
const H0_OWNER_M2 = Object.freeze({
  code: 'M2',
  issue: 81,
  blocker: 'proxy-and-reflect-metaobject',
  title: 'Implement ES2015 Proxy traps, revocation, and invariants',
});
const H0_OWNER = Object.freeze({
  code: 'H0',
  issue: 76,
  blocker: 'test262-cross-realm-host',
  title: 'Implement portable harness-only Test262 cross-Realm support',
});

/** @param {unknown} value */
function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const H0_SOURCE_TAXONOMY = Object.freeze({
  version: 3,
  pin: H0_PIN,
  classifications: Object.freeze([
    Object.freeze({
      path: H0_REASSIGNED_PATH,
      variants: 2,
      partition: 'core',
      status: 'blocked:test262-cross-realm-host',
      blocker: 'test262-cross-realm-host',
      features: Object.freeze([]),
      flags: Object.freeze([]),
      includes: Object.freeze([]),
      provenance: Object.freeze(['es6id']),
    }),
    Object.freeze({
      path: H0_PASSED_PATH,
      variants: 2,
      partition: 'core',
      status: 'blocked:test262-cross-realm-host',
      blocker: 'test262-cross-realm-host',
      features: Object.freeze(['cross-realm']),
      flags: Object.freeze([]),
      includes: Object.freeze([]),
      provenance: Object.freeze(['feature:cross-realm']),
    }),
    Object.freeze({
      path: 'test/language/unrelated.js',
      variants: 1,
      partition: 'core',
      status: 'blocked:proxy-and-reflect-metaobject',
      blocker: 'proxy-and-reflect-metaobject',
      features: Object.freeze([]),
      flags: Object.freeze(['noStrict']),
      includes: Object.freeze([]),
      provenance: Object.freeze(['es6id']),
    }),
  ]),
});
const H0_SOURCE_TAXONOMY_TEXT = json(H0_SOURCE_TAXONOMY);
const H0_PATHS_MANIFEST = Object.freeze({
  version: 1,
  repository: H0_PIN.repository,
  revision: H0_PIN.revision,
  sourceTaxonomySha256: H0_TAXONOMY_SHA256,
  ledgerSha256: H0_LEDGER_SHA256,
  rootCount: 2,
  variantCount: 4,
  paths: H0_PATHS,
});
const H0_PATHS_TEXT = json(H0_PATHS_MANIFEST);
const H0_OWNER_MAP = Object.freeze({
  version: 1,
  repository: H0_PIN.repository,
  revision: H0_PIN.revision,
  owners: Object.freeze([H0_OWNER_M0, H0_OWNER_M2]),
  rules: Object.freeze([
    Object.freeze({
      name: 'proxy-ordinary-object-throw',
      primaryOwner: 'M2',
      pathPrefix: 'test/built-ins/Proxy/',
      failureSignatures: Object.freeze(['unexpected-throw:Object']),
      secondaryEvidence: Object.freeze([
        Object.freeze({
          owner: 'M0',
          signature: 'ordinary-object-internal-method-contract',
        }),
      ]),
    }),
  ]),
});
const H0_OWNER_MAP_TEXT = json(H0_OWNER_MAP);
const H0_EXECUTION_RECORDS = Object.freeze([
  Object.freeze({
    type: 'test',
    file: H0_REASSIGNED_PATH,
    variant: 'non-strict',
    status: 'failed',
    reason: 'unexpected-throw',
    message: 'Object',
  }),
  Object.freeze({
    type: 'test',
    file: H0_REASSIGNED_PATH,
    variant: 'strict',
    status: 'failed',
    reason: 'unexpected-throw',
    message: 'Object',
  }),
  Object.freeze({
    type: 'test',
    file: H0_PASSED_PATH,
    variant: 'non-strict',
    status: 'passed',
  }),
  Object.freeze({
    type: 'test',
    file: H0_PASSED_PATH,
    variant: 'strict',
    status: 'passed',
  }),
]);
const H0_EXECUTION_TEXT = json({
  version: 1,
  repository: H0_PIN.repository,
  revision: H0_PIN.revision,
  records: H0_EXECUTION_RECORDS,
});
const H0_DISPOSITIONS = Object.freeze([
  Object.freeze({
    path: H0_REASSIGNED_PATH,
    status: 'reassigned',
    variants: 2,
    requiredVariants: Object.freeze(['non-strict', 'strict']),
    primaryOwner: H0_OWNER_M2,
    failureSignatures: Object.freeze(['unexpected-throw:Object']),
    secondaryEvidence: Object.freeze([
      Object.freeze({
        owner: H0_OWNER_M0,
        signature: 'ordinary-object-internal-method-contract',
      }),
    ]),
    evidence: Object.freeze([
      Object.freeze({
        variant: 'non-strict',
        status: 'failed',
        reason: 'unexpected-throw',
        message: 'Object',
        signature: 'unexpected-throw:Object',
      }),
      Object.freeze({
        variant: 'strict',
        status: 'failed',
        reason: 'unexpected-throw',
        message: 'Object',
        signature: 'unexpected-throw:Object',
      }),
    ]),
  }),
  Object.freeze({
    path: H0_PASSED_PATH,
    status: 'passed',
    variants: 2,
    requiredVariants: Object.freeze(['non-strict', 'strict']),
    evidence: Object.freeze([
      Object.freeze({ variant: 'non-strict', status: 'passed' }),
      Object.freeze({ variant: 'strict', status: 'passed' }),
    ]),
  }),
]);
const H0_DISPOSITION = Object.freeze({
  version: 1,
  repository: H0_PIN.repository,
  revision: H0_PIN.revision,
  sourceTaxonomySha256: H0_TAXONOMY_SHA256,
  h0LedgerSha256: H0_LEDGER_SHA256,
  h0RootCount: 2,
  h0VariantCount: 4,
  executionEvidenceSha256: H0_EXECUTION_SHA256,
  ownerMapSha256: H0_OWNER_MAP_SHA256,
  executionPassedVariantCount: 2,
  executionFailedVariantCount: 2,
  completePassedRootCount: 1,
  completePassedVariantCount: 2,
  reassignedRootCount: 1,
  reassignedVariantCount: 2,
  allFailedRootCount: 1,
  allFailedVariantCount: 2,
  mixedRootCount: 0,
  mixedVariantCount: 0,
  dispositions: H0_DISPOSITIONS,
});
const H0_DISPOSITION_TEXT = json(H0_DISPOSITION);
const H0_PROMOTION = Object.freeze({
  version: 1,
  repository: H0_PIN.repository,
  revision: H0_PIN.revision,
  sourceTaxonomySha256: H0_TAXONOMY_SHA256,
  h0LedgerSha256: H0_LEDGER_SHA256,
  h0RootCount: 2,
  h0VariantCount: 4,
  dispositionSha256: H0_DISPOSITION_SHA256,
  promotedLedgerSha256: H0_PROMOTED_LEDGER_SHA256,
  promotedRootCount: 1,
  promotedVariantCount: 2,
  entries: Object.freeze([
    Object.freeze({
      path: H0_PASSED_PATH,
      variants: 2,
      features: Object.freeze(['cross-realm']),
      includeFeatures: Object.freeze([]),
    }),
  ]),
});
const H0_PROMOTION_TEXT = json(H0_PROMOTION);
const H0_BASELINE = Object.freeze({
  version: 1,
  finalBaseCommit: H0_FINAL_BASE_COMMIT,
  repository: H0_PIN.repository,
  revision: H0_PIN.revision,
  finalBaseTaxonomySha256: H0_TAXONOMY_SHA256,
  h0LedgerSha256: H0_LEDGER_SHA256,
  h0RootCount: 2,
  h0VariantCount: 4,
  h0ClassificationSha256: H0_CLASSIFICATION_SHA256,
  nonH0ClassificationSha256: H0_NON_CLASSIFICATION_SHA256,
  partitionStatusSummary: Object.freeze({
    roots: 3,
    variants: 5,
    partitions: Object.freeze([
      Object.freeze({ name: 'core', roots: 3, variants: 5 }),
    ]),
    statuses: Object.freeze([
      Object.freeze({
        status: 'blocked:proxy-and-reflect-metaobject',
        blocker: 'proxy-and-reflect-metaobject',
        roots: 1,
        variants: 1,
      }),
      Object.freeze({
        status: 'blocked:test262-cross-realm-host',
        blocker: 'test262-cross-realm-host',
        roots: 2,
        variants: 4,
      }),
    ]),
  }),
  partitionStatusSummarySha256: H0_SUMMARY_SHA256,
});
const H0_BASELINE_TEXT = json(H0_BASELINE);
const H0_OWNER_DELTAS = Object.freeze({
  version: 1,
  repository: H0_PIN.repository,
  revision: H0_PIN.revision,
  h0LedgerSha256: H0_LEDGER_SHA256,
  dispositionSha256: H0_DISPOSITION_SHA256,
  promotionSha256: H0_PROMOTION_SHA256,
  trackingIssue: 70,
  provenance: Object.freeze({
    sourceTaxonomySha256: H0_TAXONOMY_SHA256,
    executionEvidenceSha256: H0_EXECUTION_SHA256,
    ownerMapSha256: H0_OWNER_MAP_SHA256,
  }),
  crossRealm: Object.freeze({
    blocker: 'test262-cross-realm-host',
    removedRoots: 2,
    removedVariants: 4,
    remainingRoots: 0,
    remainingVariants: 0,
  }),
  deltas: Object.freeze([
    Object.freeze({
      owner: H0_OWNER,
      direction: 'removed',
      roots: 2,
      variants: 4,
      paths: H0_PATHS,
      pathsSha256: H0_LEDGER_SHA256,
      variantEvidenceSha256: H0_ALL_VARIANT_EVIDENCE_SHA256,
    }),
    Object.freeze({
      owner: H0_OWNER_M2,
      direction: 'added',
      roots: 1,
      variants: 2,
      paths: Object.freeze([H0_REASSIGNED_PATH]),
      pathsSha256: H0_FAILED_PATH_SHA256,
      variantEvidenceSha256: H0_FAILED_VARIANT_EVIDENCE_SHA256,
    }),
  ]),
  promotionGroup: ES2015_H0_PROMOTION_GROUP,
});
const H0_OWNER_DELTAS_TEXT = json(H0_OWNER_DELTAS);
const H0_AFTER_TAXONOMY_TEXT = json({
  ...H0_SOURCE_TAXONOMY,
  classifications: [
    {
      ...H0_SOURCE_TAXONOMY.classifications[0],
      status: 'blocked:proxy-and-reflect-metaobject',
      blocker: 'proxy-and-reflect-metaobject',
    },
    {
      ...H0_SOURCE_TAXONOMY.classifications[1],
      status: 'selected-passing',
      blocker: null,
    },
    H0_SOURCE_TAXONOMY.classifications[2],
  ],
});
const H0_INVENTORY = Object.freeze([
  Object.freeze({
    path: H0_REASSIGNED_PATH,
    variants: 2,
    executionVariants: Object.freeze(['non-strict', 'strict']),
    metadata: Object.freeze({
      features: Object.freeze([]),
      flags: Object.freeze([]),
      includes: Object.freeze([]),
    }),
    includeFeatures: Object.freeze([]),
  }),
  Object.freeze({
    path: H0_PASSED_PATH,
    variants: 2,
    executionVariants: Object.freeze(['non-strict', 'strict']),
    metadata: Object.freeze({
      features: Object.freeze(['cross-realm']),
      flags: Object.freeze([]),
      includes: Object.freeze([]),
    }),
    includeFeatures: Object.freeze([]),
  }),
]);

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * @param {Partial<{
 *   entries: object[],
 *   rootCount: number,
 *   variantCount: number,
 *   ledgerSha256: string,
 * }>} [overrides]
 */
function promotionFixture(overrides = {}) {
  return {
    version: 1,
    repository: PROMOTION_PIN.repository,
    revision: PROMOTION_PIN.revision,
    sourceTaxonomySha256:
      '1111111111111111111111111111111111111111111111111111111111111111',
    ledgerSha256: PROMOTION_LEDGER_SHA256,
    rootCount: 2,
    variantCount: 3,
    entries: [
      {
        path: 'test/language/exact.js',
        variants: 2,
        features: ['exact-path-feature'],
        includeFeatures: ['include-path-feature'],
      },
      {
        path: 'test/language/neighbor.js',
        variants: 1,
        features: [],
        includeFeatures: [],
      },
    ],
    ...overrides,
  };
}

/**
 * @param {Partial<{
 *   groupName: string,
 *   entries: readonly object[],
 *   rootCount: number,
 *   variantCount: number,
 *   ledgerSha256: string,
 * }>} [overrides]
 */
function namedPromotionFixture(overrides = {}) {
  return {
    groupName: 'es2015/m1-proxy-runtime',
    version: 2,
    repository: PROMOTION_PIN.repository,
    revision: PROMOTION_PIN.revision,
    sourceTaxonomySha256:
      '1111111111111111111111111111111111111111111111111111111111111111',
    ledgerSha256: PROMOTION_LEDGER_SHA256,
    rootCount: 2,
    variantCount: 3,
    entries: promotionFixture().entries,
    ...overrides,
  };
}

function p1cPromotionEntries() {
  return Array.from({ length: 81 }, (_, index) => ({
    path: `test/language/statements/try/p1c-${String(index).padStart(3, '0')}.js`,
    variants: index === 80 ? 1 : 2,
    features: index === 0 ? ['destructuring-binding'] : [],
    includeFeatures: index === 0 ? ['p1c-include-feature'] : [],
  }));
}

/**
 * @param {readonly { path: string }[]} entries
 * @returns {string}
 */
function promotionLedgerSha256(entries) {
  return sha256(`${entries.map((entry) => entry.path).join('\n')}\n`);
}

/**
 * @param {Partial<{
 *   groupName: string,
 *   entries: readonly {
 *     path: string,
 *     variants: number,
 *     features: readonly string[],
 *     includeFeatures: readonly string[],
 *   }[],
 *   rootCount: number,
 *   variantCount: number,
 *   ledgerSha256: string,
 * }>} [overrides]
 */
function p1cPromotionFixture(overrides = {}) {
  const entries = overrides.entries ?? p1cPromotionEntries();
  return namedPromotionFixture({
    groupName: P1C_PROMOTION_GROUP,
    entries,
    rootCount: overrides.rootCount ?? entries.length,
    variantCount:
      overrides.variantCount ??
      entries.reduce((total, entry) => total + entry.variants, 0),
    ledgerSha256: overrides.ledgerSha256 ?? promotionLedgerSha256(entries),
    ...overrides,
  });
}

const P1C_PROMOTION_TEXT = json(p1cPromotionFixture());
const P1C_PROMOTION = parseEs2015Promotion(P1C_PROMOTION_TEXT);
const P1C_AUTHORIZED_PATH = P1C_PROMOTION.entries[0].path;

/**
 * @param {Partial<{
 *   pin: { repository: string, revision: string },
 *   policy: {
 *     es2015Features: readonly string[],
 *     neutralFeatures: readonly string[],
 *     laterFeatures: readonly string[],
 *   },
 *   selectedPaths: readonly string[],
 *   inventory: readonly {
 *     path: string,
 *     variants: number,
 *     metadata: { features?: readonly string[] } | null,
 *     includeFeatures: readonly string[],
 *   }[],
 * }>} [overrides]
 */
function promotionValidationOptions(overrides = {}) {
  return {
    pin: PROMOTION_PIN,
    policy: {
      es2015Features: ['exact-path-feature'],
      neutralFeatures: ['include-path-feature'],
      laterFeatures: ['later-path-feature'],
    },
    selectedPaths: PROMOTION_PATHS,
    inventory: [
      {
        path: 'test/language/exact.js',
        variants: 2,
        metadata: { features: ['exact-path-feature'] },
        includeFeatures: ['include-path-feature'],
      },
      {
        path: 'test/language/neighbor.js',
        variants: 1,
        metadata: { features: [] },
        includeFeatures: [],
      },
    ],
    ...overrides,
  };
}

/**
 * @param {readonly string[]} expansionFeatures
 * @param {readonly object[]} [featureAreas]
 */
function createPolicy(expansionFeatures, featureAreas = []) {
  return parseEs5Selection(
    JSON.stringify({
      version: ES5_SELECTION_VERSION,
      excludedDirectories: ['test/staging'],
      builtins: ['Array', 'GeneratorPrototype'],
      excludedLanguageDirectories: ['module-code'],
      featureAreas,
      expansionFeatures,
      exclusions: [],
    }),
  );
}

const POLICY = createPolicy(['computed-property-names']);
const GENERATOR_POLICY = createPolicy([
  'computed-property-names',
  'generators',
]);
const GENERATOR_SOURCES = new Map([
  [ORDINARY_PATH, 'var ordinary = 1;'],
  [
    GENERATOR_DECLARATION_PATH,
    `${COMPUTED_PROPERTY_FRONTMATTER}function* generated() { yield 1; }`,
  ],
  [
    YIELD_FREE_GENERATOR_PATH,
    `${COMPUTED_PROPERTY_FRONTMATTER}function* empty() {}`,
  ],
  [
    OBJECT_GENERATOR_PATH,
    `${COMPUTED_PROPERTY_FRONTMATTER}var object = { *['value']() { yield 1; } };`,
  ],
  [
    CLASS_GENERATOR_PATH,
    `${COMPUTED_PROPERTY_FRONTMATTER}class Example { *['value']() { yield 1; } }`,
  ],
]);

/**
 * @param {Map<string, string>} sources
 * @param {import('../../tools/test262/es5-selection.js').Es5SelectionPolicy} policy
 * @param {ReadonlyMap<string, {
 *   parsesUnderEngineGrammar: boolean,
 *   usesGeneratorSyntax: boolean,
 * }>} [harnessParsing]
 */
function selectKnownGood(sources, policy, harnessParsing = new Map()) {
  return selectPaths({
    policy,
    previouslySelected: new Set(sources.keys()),
    files: [...sources.keys()],
    harnessParsing,
    readSource: (path) => {
      const source = sources.get(path);

      if (source === undefined) {
        throw new Error(`unexpected source read: ${path}`);
      }

      return source;
    },
  });
}

/**
 * @param {string} cwd
 * @param {readonly string[]} args
 */
function runGit(cwd, args) {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'git command failed');
  }

  return result.stdout.trim();
}

/**
 * @param {() => Promise<unknown>} action
 */
async function rejectionFrom(action) {
  try {
    await action();
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }

  throw new Error('Expected the dirty pinned checkout to be rejected');
}

const GENERATOR_HARNESS_USER_SOURCES = new Map([
  [
    HARNESS_USER_PATH,
    `/*---
includes: [${GENERATOR_HARNESS}]
---*/
var ordinary = 1;`,
  ],
  [
    FOCUSED_TAGGED_GENERATOR_PATH,
    `/*---
features: [generators]
includes: [${GENERATOR_HARNESS}]
---*/
function* focused() { yield 1; }`,
  ],
]);

export default [
  {
    name: 'ES2015 promotion manifest authorizes only reviewed exact dependencies',
    run: () => {
      const manifest = parseEs2015Promotion(JSON.stringify(promotionFixture()));
      const metadata = parseTest262Metadata(
        '/*---\ndescription: exact promotion fixture\nfeatures: [exact-path-feature]\n---*/\n',
      );

      assertSame(Object.isFrozen(manifest), true);
      assertSame(Object.isFrozen(manifest.entries), true);
      assertSame(
        JSON.stringify(promotionPaths(manifest)),
        JSON.stringify(PROMOTION_PATHS),
      );
      assertSame(
        JSON.stringify(
          supportedFeaturesForPromotedPath(
            manifest,
            'test/language/exact.js',
            metadata,
            ['include-path-feature'],
          ),
        ),
        '["exact-path-feature","include-path-feature"]',
      );
      assertSame(
        JSON.stringify(
          supportedFeaturesForPromotedPath(
            manifest,
            'test/language/not-promoted.js',
            metadata,
            ['include-path-feature'],
          ),
        ),
        '[]',
      );
      assertThrows(
        () =>
          supportedFeaturesForPromotedPath(
            manifest,
            'test/language/exact.js',
            parseTest262Metadata(
              '/*---\ndescription: drifted metadata\nfeatures: [different-feature]\n---*/\n',
            ),
            ['include-path-feature'],
          ),
        Es2015PromotionError,
      );
      assertThrows(
        () =>
          supportedFeaturesForPromotedPath(
            manifest,
            'test/language/exact.js',
            metadata,
            ['different-include-feature'],
          ),
        Es2015PromotionError,
      );
      validateEs2015Promotion(manifest, promotionValidationOptions());
    },
  },
  {
    name: 'ES2015 promotion rejects malformed paths, counts, pins, and later dependencies',
    run: () => {
      const exact = promotionFixture().entries[0];
      const neighbor = promotionFixture().entries[1];
      const malformed = [
        promotionFixture({ entries: [exact, exact] }),
        promotionFixture({ entries: [neighbor, exact] }),
        promotionFixture({ rootCount: 3 }),
        promotionFixture({
          ledgerSha256:
            '0000000000000000000000000000000000000000000000000000000000000000',
        }),
      ];

      for (const value of malformed) {
        assertThrows(
          () => parseEs2015Promotion(JSON.stringify(value)),
          Es2015PromotionError,
        );
      }

      const manifest = parseEs2015Promotion(JSON.stringify(promotionFixture()));
      assertThrows(
        () =>
          validateEs2015Promotion(
            manifest,
            promotionValidationOptions({
              pin: {
                ...PROMOTION_PIN,
                revision: '9876543210987654321098765432109876543210',
              },
            }),
          ),
        Es2015PromotionError,
      );
      assertThrows(
        () =>
          validateEs2015Promotion(
            manifest,
            promotionValidationOptions({
              selectedPaths: ['test/language/exact.js'],
            }),
          ),
        Es2015PromotionError,
      );
      assertThrows(
        () =>
          validateEs2015Promotion(
            manifest,
            promotionValidationOptions({
              inventory: [promotionValidationOptions().inventory[0]],
            }),
          ),
        Es2015PromotionError,
      );

      const later = parseEs2015Promotion(
        JSON.stringify(
          promotionFixture({
            entries: [
              {
                ...exact,
                features: ['later-path-feature'],
              },
              neighbor,
            ],
          }),
        ),
      );
      assertThrows(
        () =>
          validateEs2015Promotion(
            later,
            promotionValidationOptions({
              inventory: [
                {
                  ...promotionValidationOptions().inventory[0],
                  metadata: { features: ['later-path-feature'] },
                },
                promotionValidationOptions().inventory[1],
              ],
            }),
          ),
        Es2015PromotionError,
      );
    },
  },
  {
    name: 'ES2015 named version-2 promotions accept exact empty and non-empty ledgers',
    run: () => {
      const empty = parseEs2015Promotion(json(M0_PROMOTION));
      const named = /** @type {any} */ (
        parseEs2015Promotion(json(namedPromotionFixture()))
      );
      const base = parseUpstreamSubset(
        json({
          version: 1,
          repository: H0_PIN.repository,
          revision: H0_PIN.revision,
          groups: [
            {
              name: 'baseline',
              summary: 'Synthetic baseline.',
              paths: ['test/language/base.js'],
            },
          ],
        }),
      );
      const merged = mergePromotionSubset(base, empty);

      assertSame(JSON.stringify(empty), JSON.stringify(M0_PROMOTION));
      assertSame(Object.isFrozen(empty), true);
      assertSame(Object.isFrozen(empty.entries), true);
      assertSame(JSON.stringify(promotionPaths(empty)), '[]');
      validateEs2015Promotion(empty, {
        pin: H0_PIN,
        policy: {
          es2015Features: [],
          neutralFeatures: [],
          laterFeatures: [],
        },
        selectedPaths: [],
        inventory: [],
      });
      assertSame(
        JSON.stringify(
          merged.groups.find((group) => group.name === M0_PROMOTION.groupName)
            ?.paths,
        ),
        '[]',
      );

      assertSame(named.groupName, 'es2015/m1-proxy-runtime');
      assertSame(
        JSON.stringify(promotionPaths(named)),
        JSON.stringify(PROMOTION_PATHS),
      );
      validateEs2015Promotion(named, promotionValidationOptions());
    },
  },
  {
    name: 'ES2015 named version-2 promotions reject malformed schemas and ledgers',
    run: () => {
      const exact = /** @type {any} */ (promotionFixture().entries[0]);
      const neighbor = /** @type {any} */ (promotionFixture().entries[1]);
      const missingGroupName = /** @type {any} */ (
        structuredClone(M0_PROMOTION)
      );
      delete missingGroupName.groupName;
      const malformed = [
        missingGroupName,
        { ...M0_PROMOTION, unexpected: true },
        { ...M0_PROMOTION, groupName: 'es2015/M0-object-internal-methods' },
        { ...M0_PROMOTION, groupName: 'es2015/' },
        { ...M0_PROMOTION, groupName: 'm0-object-internal-methods' },
        { ...M0_PROMOTION, groupName: ES2015_PROMOTION_GROUP },
        { ...M0_PROMOTION, groupName: ES2015_H0_PROMOTION_GROUP },
        { ...M0_PROMOTION, rootCount: -1 },
        { ...M0_PROMOTION, variantCount: -1 },
        { ...M0_PROMOTION, rootCount: 1 },
        { ...M0_PROMOTION, variantCount: 1 },
        { ...M0_PROMOTION, ledgerSha256: '0'.repeat(64) },
        namedPromotionFixture({
          entries: [exact, exact],
          rootCount: 2,
          variantCount: 4,
          ledgerSha256: sha256(`${exact.path}\n${exact.path}\n`),
        }),
        namedPromotionFixture({
          entries: [neighbor, exact],
          ledgerSha256: sha256(`${neighbor.path}\n${exact.path}\n`),
        }),
        namedPromotionFixture({ rootCount: 3 }),
        namedPromotionFixture({ variantCount: 4 }),
        namedPromotionFixture({ ledgerSha256: '0'.repeat(64) }),
        namedPromotionFixture({
          entries: [{ ...exact, unexpected: true }, neighbor],
        }),
        promotionFixture({
          rootCount: 0,
          variantCount: 0,
          ledgerSha256: EMPTY_LEDGER_SHA256,
          entries: [],
        }),
      ];

      for (const value of malformed) {
        assertThrows(
          () => parseEs2015Promotion(json(value)),
          Es2015PromotionError,
        );
      }
    },
  },
  {
    name: 'ES2015 H0 evidence adapters parse exact synthetic schemas without changing T0 output',
    run: () => {
      const t0 = parseEs2015Promotion(json(promotionFixture()));
      const promotion = parseEs2015Promotion(H0_PROMOTION_TEXT);
      const paths = parseEs2015H0Paths(H0_PATHS_TEXT, H0_PIN);
      const baseline = parseEs2015H0Baseline(H0_BASELINE_TEXT, H0_PIN);
      const disposition = parseEs2015H0Disposition(H0_DISPOSITION_TEXT, {
        pin: H0_PIN,
        paths,
        ownerMapText: H0_OWNER_MAP_TEXT,
      });
      const ownerMap = parseEs2015H0OwnerMap(H0_OWNER_MAP_TEXT, H0_PIN);
      const ownerDeltas = parseEs2015H0OwnerDeltas(H0_OWNER_DELTAS_TEXT, {
        pin: H0_PIN,
        paths,
        dispositionText: H0_DISPOSITION_TEXT,
        promotionText: H0_PROMOTION_TEXT,
      });
      const h0Promotion = /** @type {any} */ (promotion);

      assertSame(Object.prototype.hasOwnProperty.call(t0, 'groupName'), false);
      assertSame(JSON.stringify(t0), JSON.stringify(promotionFixture()));
      assertSame(h0Promotion.groupName, ES2015_H0_PROMOTION_GROUP);
      assertSame(promotion.ledgerSha256, H0_PROMOTED_LEDGER_SHA256);
      assertSame(promotion.rootCount, 1);
      assertSame(promotion.variantCount, 2);
      assertSame(
        JSON.stringify(promotionPaths(promotion)),
        `["${H0_PASSED_PATH}"]`,
      );
      assertSame(JSON.stringify(paths.paths), JSON.stringify(H0_PATHS));
      assertSame(paths.rootCount, 2);
      assertSame(paths.variantCount, 4);
      assertSame(baseline.finalBaseCommit, H0_FINAL_BASE_COMMIT);
      assertSame(baseline.partitionStatusSummary.roots, 3);
      assertSame(disposition.dispositions[0].primaryOwner.code, 'M2');
      assertSame(disposition.completePassedRootCount, 1);
      assertSame(ownerMap.repository, H0_PIN.repository);
      assertSame(ownerMap.revision, H0_PIN.revision);
      assertSame(ownerMap.ownersByCode.get('M2')?.issue, 81);
      assertSame(ownerDeltas.deltas[0].owner.code, 'H0');
      assertSame(ownerDeltas.deltas[1].owner.code, 'M2');
      assertSame(Object.isFrozen(promotion), true);
      assertSame(Object.isFrozen(paths.paths), true);
      assertSame(Object.isFrozen(baseline.partitionStatusSummary), true);
      assertSame(Object.isFrozen(disposition.dispositions), true);
      assertSame(Object.isFrozen(ownerMap.rules), true);
      assertSame(Object.isFrozen(ownerDeltas.deltas), true);
    },
  },
  {
    name: 'ES2015 H0 evidence adapters reject mixed, incomplete, stale, unordered, and duplicate facts',
    run: () => {
      const mixed = {
        ...promotionFixture(),
        h0LedgerSha256: H0_LEDGER_SHA256,
      };
      assertSame(
        assertThrows(
          () => parseEs2015Promotion(json(mixed)),
          Es2015PromotionError,
        ).message,
        'tools/test262/es2015-promotion.json must not mix T0 and H0 promotion discriminators',
      );

      const partial = /** @type {any} */ (structuredClone(H0_PROMOTION));
      delete partial.promotedLedgerSha256;
      assertSame(
        assertThrows(
          () => parseEs2015Promotion(json(partial)),
          Es2015PromotionError,
        ).message,
        'tools/test262/es2015-promotion.json must not mix T0 and H0 promotion discriminators',
      );

      const unknownPaths = {
        ...H0_PATHS_MANIFEST,
        unexpected: true,
      };
      const missingBaseline = /** @type {any} */ (structuredClone(H0_BASELINE));
      delete missingBaseline.h0ClassificationSha256;
      const badPromotionCount = {
        ...H0_PROMOTION,
        promotedRootCount: 2,
      };
      const badDispositionOrder = {
        ...H0_DISPOSITION,
        dispositions: [...H0_DISPOSITIONS].reverse(),
      };
      const badBaselineHash = {
        ...H0_BASELINE,
        partitionStatusSummarySha256: '0'.repeat(64),
      };
      const duplicatePaths = {
        ...H0_PATHS_MANIFEST,
        paths: [H0_REASSIGNED_PATH, H0_REASSIGNED_PATH],
        ledgerSha256: sha256(`${H0_REASSIGNED_PATH}\n${H0_REASSIGNED_PATH}\n`),
      };
      const duplicateVariants = /** @type {any} */ (
        structuredClone(H0_DISPOSITION)
      );
      duplicateVariants.dispositions[0].requiredVariants = [
        'non-strict',
        'non-strict',
      ];
      const duplicateOwners = {
        ...H0_OWNER_MAP,
        owners: [H0_OWNER_M0, H0_OWNER_M0],
      };

      const malformed = [
        () => parseEs2015H0Paths(json(unknownPaths), H0_PIN),
        () => parseEs2015H0Baseline(json(missingBaseline), H0_PIN),
        () => parseEs2015Promotion(json(badPromotionCount)),
        () => parseEs2015H0Disposition(json(badDispositionOrder)),
        () => parseEs2015H0Baseline(json(badBaselineHash), H0_PIN),
        () => parseEs2015H0Paths(json(duplicatePaths), H0_PIN),
        () => parseEs2015H0Disposition(json(duplicateVariants)),
        () => parseEs2015H0OwnerMap(json(duplicateOwners), H0_PIN),
        () =>
          parseEs2015H0Paths(H0_PATHS_TEXT, {
            ...H0_PIN,
            revision: '0'.repeat(40),
          }),
      ];
      for (const parse of malformed) {
        assertThrows(parse, Es2015PromotionError);
      }
    },
  },
  {
    name: 'ES2015 H0 compatibility builders and assertions preserve literal evidence identities',
    run: () => {
      const baseline = buildEs2015H0Baseline({
        finalBaseCommit: H0_FINAL_BASE_COMMIT,
        taxonomyText: H0_SOURCE_TAXONOMY_TEXT,
        pathsManifestText: H0_PATHS_TEXT,
      });
      const disposition = buildEs2015H0Disposition({
        pathsManifestText: H0_PATHS_TEXT,
        baselineTaxonomyText: H0_SOURCE_TAXONOMY_TEXT,
        executionEvidenceText: H0_EXECUTION_TEXT,
        ownerMapText: H0_OWNER_MAP_TEXT,
        pin: H0_PIN,
        inventory: H0_INVENTORY,
      });
      const promotion = buildEs2015Promotion({
        sourceTaxonomyText: H0_SOURCE_TAXONOMY_TEXT,
        dispositionText: H0_DISPOSITION_TEXT,
        pin: H0_PIN,
        inventory: H0_INVENTORY,
      });
      const ownerDeltas = buildEs2015H0OwnerDeltas({
        beforeTaxonomyText: H0_SOURCE_TAXONOMY_TEXT,
        afterTaxonomyText: H0_AFTER_TAXONOMY_TEXT,
        dispositionText: H0_DISPOSITION_TEXT,
        promotionText: H0_PROMOTION_TEXT,
      });

      assertSame(json(baseline), H0_BASELINE_TEXT);
      assertSame(json(disposition), H0_DISPOSITION_TEXT);
      assertSame(json(promotion), H0_PROMOTION_TEXT);
      assertSame(json(ownerDeltas), H0_OWNER_DELTAS_TEXT);
      assertEs2015H0BaselineMatchesTaxonomy({
        baselineText: H0_BASELINE_TEXT,
        taxonomyText: H0_SOURCE_TAXONOMY_TEXT,
        pathsManifestText: H0_PATHS_TEXT,
        pin: H0_PIN,
      });
      assertSame(
        JSON.stringify(
          assertEs2015H0ExecutionMatchesDisposition({
            pathsManifestText: H0_PATHS_TEXT,
            disposition,
            records: H0_EXECUTION_RECORDS,
            ownerMapText: H0_OWNER_MAP_TEXT,
            pin: H0_PIN,
          }),
        ),
        '{"total":4,"passed":2,"failed":2,"skipped":0}',
      );
      assertExactH0DispositionDelta({
        before: H0_SOURCE_TAXONOMY_TEXT,
        after: H0_AFTER_TAXONOMY_TEXT,
        disposition: H0_DISPOSITION_TEXT,
        promotion: H0_PROMOTION_TEXT,
        ownerDeltas: H0_OWNER_DELTAS_TEXT,
        pathsManifest: H0_PATHS_TEXT,
        ownerMap: H0_OWNER_MAP_TEXT,
      });
    },
  },
  {
    name: 'ES2015 promotion authorization and merge APIs compose T0, H0, and M1',
    run: () => {
      const m1Path = 'test/language/m1-reflect.js';
      const t0Text = json({
        ...promotionFixture(),
        repository: H0_PIN.repository,
        revision: H0_PIN.revision,
      });
      const m1Text = json({
        groupName: 'es2015/m1-reflect',
        version: 2,
        repository: H0_PIN.repository,
        revision: H0_PIN.revision,
        sourceTaxonomySha256: '2'.repeat(64),
        ledgerSha256: sha256(`${m1Path}\n`),
        rootCount: 1,
        variantCount: 2,
        entries: [
          {
            path: m1Path,
            variants: 2,
            features: ['m1-feature'],
            includeFeatures: ['m1-include-feature'],
          },
        ],
      });
      const t0 = parseEs2015Promotion(t0Text);
      const h0 = parseEs2015Promotion(H0_PROMOTION_TEXT);
      const m1 = parseEs2015Promotion(m1Text);
      const base = parseUpstreamSubset(
        json({
          version: 1,
          repository: H0_PIN.repository,
          revision: H0_PIN.revision,
          groups: [
            {
              name: 'baseline',
              summary: 'Synthetic baseline.',
              paths: ['test/language/base.js'],
            },
          ],
        }),
      );
      const h0Only = mergePromotionSubset(base, h0);
      const merged = mergePromotionSubsets(base, [t0, h0, m1]);
      const inventory = [
        ...promotionValidationOptions().inventory,
        H0_INVENTORY[1],
        {
          path: m1Path,
          variants: 2,
          metadata: { features: ['m1-feature'] },
          includeFeatures: ['m1-include-feature'],
        },
      ];
      const policy = {
        es2015Features: ['cross-realm', 'exact-path-feature', 'm1-feature'],
        neutralFeatures: ['include-path-feature', 'm1-include-feature'],
        laterFeatures: ['later-path-feature'],
      };
      const h0Authorization = createEs2015PromotionAuthorization({
        promotionText: H0_PROMOTION_TEXT,
        pin: H0_PIN,
        policy,
        subset: h0Only,
        inventory: [H0_INVENTORY[1]],
      });
      const authorizations = createEs2015PromotionAuthorizations({
        promotionTexts: [t0Text, H0_PROMOTION_TEXT, m1Text],
        pin: H0_PIN,
        policy,
        subset: merged,
        inventory,
      });

      assertSame(
        JSON.stringify(h0Only.groups.map((group) => group.name)),
        '["baseline","es2015/h0-cross-realm-passed"]',
      );
      assertSame(
        JSON.stringify(merged.groups.map((group) => group.name)),
        '["baseline","es2015/audit-passing-promotion","es2015/h0-cross-realm-passed","es2015/m1-reflect"]',
      );
      assertSame(
        JSON.stringify(
          h0Authorization(H0_PASSED_PATH, { features: ['cross-realm'] }),
        ),
        '["cross-realm"]',
      );
      assertSame(
        JSON.stringify(
          authorizations('test/language/exact.js', {
            features: ['exact-path-feature'],
          }),
        ),
        '["exact-path-feature","include-path-feature"]',
      );
      assertSame(
        JSON.stringify(
          authorizations(H0_PASSED_PATH, { features: ['cross-realm'] }),
        ),
        '["cross-realm"]',
      );
      assertSame(
        JSON.stringify(authorizations(m1Path, { features: ['m1-feature'] })),
        '["m1-feature","m1-include-feature"]',
      );
      assertSame(
        JSON.stringify(
          authorizations('test/language/base.js', { features: [] }),
        ),
        '[]',
      );
    },
  },
  {
    name: 'roadmap promotions preserve prior groups and add one unique optional P1C group',
    run: async () => {
      assertSame(
        ES2015_P1C_PROMOTION_FILE,
        'tools/test262/es2015-p1c-promotion.json',
      );
      assertSame(
        JSON.stringify(ES2015_ROADMAP_PROMOTION_FILES),
        JSON.stringify([ES2015_M1_PROMOTION_FILE, ES2015_P1C_PROMOTION_FILE]),
      );
      assertSame(
        /** @type {any} */ (P1C_PROMOTION).groupName,
        P1C_PROMOTION_GROUP,
      );
      assertSame(P1C_PROMOTION.version, 2);
      assertSame(P1C_PROMOTION.rootCount, 81);
      assertSame(P1C_PROMOTION.variantCount, 161);

      const [promotionText, h0PromotionText, m1PromotionText, subsetText] =
        await Promise.all([
          readFile(
            new URL('tools/test262/es2015-promotion.json', REPOSITORY_ROOT),
            'utf8',
          ),
          readFile(
            new URL('tools/test262/es2015-h0-promotion.json', REPOSITORY_ROOT),
            'utf8',
          ),
          readFile(
            new URL('tools/test262/es2015-m1-promotion.json', REPOSITORY_ROOT),
            'utf8',
          ),
          readFile(
            new URL('tools/test262/upstream-subset.json', REPOSITORY_ROOT),
            'utf8',
          ),
        ]);
      const t0 = parseEs2015Promotion(promotionText);
      const h0 = parseEs2015Promotion(h0PromotionText);
      const m1 = parseEs2015Promotion(m1PromotionText);
      const subset = parseUpstreamSubset(subsetText);
      const generated = parseUpstreamSubset(
        json({
          version: subset.version,
          repository: subset.repository,
          revision: subset.revision,
          groups: subset.groups.filter(
            (group) =>
              group.name !== ES2015_PROMOTION_GROUP &&
              group.name !== ES2015_H0_PROMOTION_GROUP &&
              group.name !== 'es2015/m1-reflect' &&
              group.name !== P1C_PROMOTION_GROUP,
          ),
        }),
      );
      const withoutP1C = mergePromotionSubsets(generated, [t0, h0, m1]);
      const withP1C = mergePromotionSubsets(generated, [
        t0,
        h0,
        m1,
        P1C_PROMOTION,
      ]);

      assertSame(withoutP1C.groups.length, subset.groups.length - 1);
      assertSame(withP1C.groups.length, withoutP1C.groups.length + 1);
      assertSame(
        JSON.stringify(
          withP1C.groups
            .filter((group) => group.name === P1C_PROMOTION_GROUP)
            .map((group) => group.paths),
        ),
        JSON.stringify([promotionPaths(P1C_PROMOTION)]),
      );
      assertSame(
        JSON.stringify(
          withP1C.groups.filter((group) => group.name !== P1C_PROMOTION_GROUP),
        ),
        JSON.stringify(withoutP1C.groups),
      );
    },
  },
  {
    name: 'roadmap promotions reject P1C overlap and rethrow unsupported optional reads',
    run: async () => {
      const [promotionText, h0PromotionText, m1PromotionText, subsetText] =
        await Promise.all([
          readFile(
            new URL('tools/test262/es2015-promotion.json', REPOSITORY_ROOT),
            'utf8',
          ),
          readFile(
            new URL('tools/test262/es2015-h0-promotion.json', REPOSITORY_ROOT),
            'utf8',
          ),
          readFile(
            new URL('tools/test262/es2015-m1-promotion.json', REPOSITORY_ROOT),
            'utf8',
          ),
          readFile(
            new URL('tools/test262/upstream-subset.json', REPOSITORY_ROOT),
            'utf8',
          ),
        ]);
      const t0 = parseEs2015Promotion(promotionText);
      const h0 = parseEs2015Promotion(h0PromotionText);
      const m1 = parseEs2015Promotion(m1PromotionText);
      const subset = parseUpstreamSubset(subsetText);
      const generated = parseUpstreamSubset(
        json({
          version: subset.version,
          repository: subset.repository,
          revision: subset.revision,
          groups: subset.groups.filter(
            (group) =>
              group.name !== ES2015_PROMOTION_GROUP &&
              group.name !== ES2015_H0_PROMOTION_GROUP &&
              group.name !== 'es2015/m1-reflect' &&
              group.name !== P1C_PROMOTION_GROUP,
          ),
        }),
      );

      for (const overlapPath of [
        promotionPaths(t0)[0],
        promotionPaths(h0)[0],
        promotionPaths(m1)[0],
      ]) {
        const overlapPromotion = parseEs2015Promotion(
          json(
            p1cPromotionFixture({
              entries: [
                {
                  path: overlapPath,
                  variants: 1,
                  features: [],
                  includeFeatures: [],
                },
              ],
              rootCount: 1,
              variantCount: 1,
              ledgerSha256: sha256(`${overlapPath}\n`),
            }),
          ),
        );
        assertThrows(
          () =>
            mergePromotionSubsets(generated, [t0, h0, m1, overlapPromotion]),
          Es2015PromotionError,
        );
      }

      assertSame(
        await readOptionalRoadmapFile(ES2015_P1C_PROMOTION_FILE, async () => {
          const error = new Error('missing optional fixture');
          Object.assign(error, { code: 'ENOENT' });
          throw error;
        }),
        null,
      );

      const readError = new Error('unsupported optional fixture error');
      Object.assign(readError, { code: 'EIO' });
      let rejected = null;
      try {
        await readOptionalRoadmapFile(ES2015_P1C_PROMOTION_FILE, async () => {
          throw readError;
        });
      } catch (error) {
        rejected = error;
      }
      assertSame(rejected, readError);
    },
  },
  {
    name: 'P1C promotion authorization stays exact and leaves exclusions empty',
    run: async () => {
      const selection = parseEs5Selection(
        await readFile(
          new URL('tools/test262/es5-selection.json', REPOSITORY_ROOT),
          'utf8',
        ),
      );
      const subset = mergePromotionSubset(
        parseUpstreamSubset(
          json({
            version: 1,
            repository: PROMOTION_PIN.repository,
            revision: PROMOTION_PIN.revision,
            groups: [
              {
                name: 'baseline',
                summary: 'Synthetic baseline.',
                paths: ['test/language/base.js'],
              },
            ],
          }),
        ),
        P1C_PROMOTION,
      );
      const authorizations = createEs2015PromotionAuthorizations({
        promotionTexts: [P1C_PROMOTION_TEXT],
        pin: PROMOTION_PIN,
        policy: {
          es2015Features: ['destructuring-binding'],
          neutralFeatures: ['p1c-include-feature'],
          laterFeatures: [],
        },
        subset,
        inventory: [
          ...P1C_PROMOTION.entries.map((entry) => ({
            path: entry.path,
            variants: entry.variants,
            metadata: { features: [...entry.features] },
            includeFeatures: [...entry.includeFeatures],
          })),
          {
            path: 'test/language/statements/try/p1c-foreign.js',
            variants: 2,
            metadata: { features: ['destructuring-binding'] },
            includeFeatures: ['p1c-include-feature'],
          },
        ],
      });
      const metadata = parseTest262Metadata(
        '/*---\ndescription: exact P1C fixture\nfeatures: [destructuring-binding]\n---*/\n',
      );

      assertSame(
        JSON.stringify(authorizations(P1C_AUTHORIZED_PATH, metadata)),
        '["destructuring-binding","p1c-include-feature"]',
      );
      assertSame(
        JSON.stringify(
          authorizations(
            'test/language/statements/try/p1c-foreign.js',
            metadata,
          ),
        ),
        '[]',
      );
      assertSame(
        P1C_PROMOTION.entries.filter((entry) =>
          matchExclusion(entry.path, selection.exclusions),
        ).length,
        0,
      );
    },
  },
  {
    name: 'ES2015 H0 evidence bundle validates every cross-artifact identity',
    run: () => {
      const bundle = validateEs2015H0EvidenceBundle({
        pin: H0_PIN,
        pathsText: H0_PATHS_TEXT,
        baselineText: H0_BASELINE_TEXT,
        dispositionText: H0_DISPOSITION_TEXT,
        ownerMapText: H0_OWNER_MAP_TEXT,
        ownerDeltasText: H0_OWNER_DELTAS_TEXT,
        promotionText: H0_PROMOTION_TEXT,
      });

      assertSame(bundle.paths.ledgerSha256, H0_LEDGER_SHA256);
      assertSame(bundle.baseline.finalBaseCommit, H0_FINAL_BASE_COMMIT);
      assertSame(bundle.disposition.dispositions.length, 2);
      assertSame(bundle.ownerMap.owners.length, 2);
      assertSame(bundle.ownerDeltas.deltas.length, 2);
      assertSame(
        /** @type {any} */ (bundle.promotion).groupName,
        ES2015_H0_PROMOTION_GROUP,
      );
      assertSame(Object.isFrozen(bundle), true);

      const stalePromotion = {
        ...H0_PROMOTION,
        dispositionSha256: '9'.repeat(64),
      };
      assertThrows(
        () =>
          validateEs2015H0EvidenceBundle({
            pin: H0_PIN,
            pathsText: H0_PATHS_TEXT,
            baselineText: H0_BASELINE_TEXT,
            dispositionText: H0_DISPOSITION_TEXT,
            ownerMapText: H0_OWNER_MAP_TEXT,
            ownerDeltasText: H0_OWNER_DELTAS_TEXT,
            promotionText: json(stalePromotion),
          }),
        Es2015PromotionError,
      );
    },
  },
  {
    name: 'upstream promotion authorization verifies the exact selected group before a runner uses it',
    run: () => {
      const subset = parseUpstreamSubset(
        JSON.stringify({
          version: 1,
          repository: PROMOTION_PIN.repository,
          revision: PROMOTION_PIN.revision,
          groups: [
            {
              name: 'es2015/audit-passing-promotion',
              summary: 'Exact promotion fixture.',
              paths: PROMOTION_PATHS,
            },
          ],
        }),
      );
      const authorization = createEs2015PromotionAuthorization({
        promotionText: JSON.stringify(promotionFixture()),
        pin: PROMOTION_PIN,
        policy: promotionValidationOptions().policy,
        subset,
        inventory: promotionValidationOptions().inventory,
      });
      const metadata = parseTest262Metadata(
        '/*---\ndescription: exact promotion fixture\nfeatures: [exact-path-feature]\n---*/\n',
      );

      assertSame(
        JSON.stringify(authorization('test/language/exact.js', metadata)),
        '["exact-path-feature","include-path-feature"]',
      );
      assertSame(
        JSON.stringify(
          authorization('test/language/not-promoted.js', metadata),
        ),
        '[]',
      );
      assertThrows(
        () =>
          createEs2015PromotionAuthorization({
            promotionText: JSON.stringify(promotionFixture()),
            pin: PROMOTION_PIN,
            policy: promotionValidationOptions().policy,
            subset: parseUpstreamSubset(
              JSON.stringify({
                version: 1,
                repository: PROMOTION_PIN.repository,
                revision: PROMOTION_PIN.revision,
                groups: [
                  {
                    name: 'es2015/audit-passing-promotion',
                    summary: 'Missing promoted root.',
                    paths: ['test/language/exact.js'],
                  },
                ],
              }),
            ),
            inventory: promotionValidationOptions().inventory,
          }),
        Es2015PromotionError,
      );
    },
  },
  {
    name: 'upstream selection preserves the exact promotion group outside the ES5 generator',
    run: () => {
      const base = parseUpstreamSubset(
        JSON.stringify({
          version: 1,
          repository: PROMOTION_PIN.repository,
          revision: PROMOTION_PIN.revision,
          groups: [
            {
              name: 'baseline',
              summary: 'Generated baseline root.',
              paths: ['test/language/base.js'],
            },
            {
              name: 'harness',
              summary: 'Generated later group.',
              paths: ['test/language/other.js'],
            },
          ],
        }),
      );
      const before = JSON.stringify(base.groups);
      const promotion = parseEs2015Promotion(
        JSON.stringify(promotionFixture()),
      );
      const merged = mergePromotionSubset(base, promotion);

      assertSame(
        JSON.stringify(merged.groups.map((group) => group.name)),
        JSON.stringify([
          'baseline',
          'es2015/audit-passing-promotion',
          'harness',
        ]),
      );
      assertSame(
        JSON.stringify(
          merged.groups.find(
            (group) => group.name === 'es2015/audit-passing-promotion',
          )?.paths,
        ),
        JSON.stringify(PROMOTION_PATHS),
      );
      assertSame(JSON.stringify(base.groups), before);
      assertSame(
        assertThrows(
          () => mergePromotionSubset(merged, promotion),
          Es2015PromotionError,
        ).message,
        'tools/test262/es2015-promotion.json promotion group is already present',
      );
      assertThrows(
        () =>
          mergePromotionSubset(
            parseUpstreamSubset(
              JSON.stringify({
                version: 1,
                repository: PROMOTION_PIN.repository,
                revision: PROMOTION_PIN.revision,
                groups: [
                  {
                    name: 'baseline',
                    summary: 'Overlapping generated root.',
                    paths: ['test/language/exact.js'],
                  },
                ],
              }),
            ),
            promotion,
          ),
        Es2015PromotionError,
      );
    },
  },
  {
    name: 'checked-in ES2015 promotions exactly match their durable ledgers and generated subset groups',
    run: async () => {
      const [
        promotionText,
        h0PromotionText,
        m1PromotionText,
        p1cPromotionText,
        subsetText,
      ] = await Promise.all([
        readFile(
          new URL('tools/test262/es2015-promotion.json', REPOSITORY_ROOT),
          'utf8',
        ),
        readFile(
          new URL('tools/test262/es2015-h0-promotion.json', REPOSITORY_ROOT),
          'utf8',
        ),
        readFile(
          new URL('tools/test262/es2015-m1-promotion.json', REPOSITORY_ROOT),
          'utf8',
        ),
        readFile(
          new URL('tools/test262/es2015-p1c-promotion.json', REPOSITORY_ROOT),
          'utf8',
        ),
        readFile(
          new URL('tools/test262/upstream-subset.json', REPOSITORY_ROOT),
          'utf8',
        ),
      ]);
      const manifest = parseEs2015Promotion(promotionText);
      const h0Manifest = parseEs2015Promotion(h0PromotionText);
      const m1Manifest = parseEs2015Promotion(m1PromotionText);
      const p1cManifest = parseEs2015Promotion(p1cPromotionText);
      const subset = parseUpstreamSubset(subsetText);
      const promotion = subset.groups.filter(
        (group) => group.name === 'es2015/audit-passing-promotion',
      );
      const h0Promotion = subset.groups.filter(
        (group) => group.name === ES2015_H0_PROMOTION_GROUP,
      );
      const m1Promotion = subset.groups.filter(
        (group) => group.name === 'es2015/m1-reflect',
      );
      const p1cPromotion = subset.groups.filter(
        (group) => group.name === P1C_PROMOTION_GROUP,
      );
      const preExistingGroups = subset.groups.filter(
        (group) =>
          group.name !== 'es2015/audit-passing-promotion' &&
          group.name !== ES2015_H0_PROMOTION_GROUP &&
          group.name !== 'es2015/m1-reflect' &&
          group.name !== P1C_PROMOTION_GROUP,
      );
      const paths = promotionPaths(manifest);
      const h0Paths = promotionPaths(h0Manifest);
      const m1Paths = promotionPaths(m1Manifest);
      const p1cPaths = promotionPaths(p1cManifest);

      assertSame(manifest.rootCount, 6323);
      assertSame(manifest.variantCount, 11955);
      assertSame(manifest.ledgerSha256, DURABLE_LEDGER_SHA256);
      assertSame(manifest.sourceTaxonomySha256, PRE_PROMOTION_TAXONOMY_SHA256);
      assertSame(sha256(`${paths.join('\n')}\n`), DURABLE_LEDGER_SHA256);
      assertSame(promotion.length, 1);
      assertSame(JSON.stringify(promotion[0]?.paths), JSON.stringify(paths));
      assertSame(h0Promotion.length, 1);
      assertSame(
        JSON.stringify(h0Promotion[0]?.paths),
        JSON.stringify(h0Paths),
      );
      assertSame(m1Promotion.length, 1);
      assertSame(
        JSON.stringify(m1Promotion[0]?.paths),
        JSON.stringify(m1Paths),
      );
      assertSame(p1cManifest.rootCount, 81);
      assertSame(p1cManifest.variantCount, 161);
      assertSame(p1cPromotion.length, 1);
      assertSame(
        JSON.stringify(p1cPromotion[0]?.paths),
        JSON.stringify(p1cPaths),
      );
      assertSame(
        JSON.stringify(
          upstreamSubsetPaths(subset).filter((path) => paths.includes(path)),
        ),
        JSON.stringify(paths),
      );
      assertSame(preExistingGroups.length, 58);
      assertSame(
        sha256(JSON.stringify(preExistingGroups)),
        PRE_PROMOTION_GROUPS_SHA256,
      );
    },
  },
  {
    name: 'upstream report feature authority is scoped to exact M1 and P1C roots',
    run: async () => {
      const createReportFeatures = createPromotionReportFeaturesForPromotions;
      assertSame(typeof createReportFeatures, 'function');
      assertSame(typeof createPromotionReportFeaturesForPath, 'function');
      if (typeof createReportFeatures !== 'function') return;
      const [
        promotionText,
        h0PromotionText,
        m1PromotionText,
        p1cPromotionText,
        auditEvidenceText,
      ] = await Promise.all([
        readM1ReportEvidence('tools/test262/es2015-promotion.json'),
        readM1ReportEvidence('tools/test262/es2015-h0-promotion.json'),
        readM1ReportEvidence('tools/test262/es2015-m1-promotion.json'),
        readM1ReportEvidence('tools/test262/es2015-p1c-promotion.json'),
        readM1ReportEvidence('tools/test262/es2015-audit-evidence.json'),
      ]);
      const promotion = parseEs2015Promotion(promotionText);
      const h0Promotion = parseEs2015Promotion(h0PromotionText);
      const m1Promotion = parseEs2015Promotion(m1PromotionText);
      const p1cPromotion = parseEs2015Promotion(p1cPromotionText);
      const auditEvidence = JSON.parse(auditEvidenceText);
      const reportFeaturesForPath = createReportFeatures([
        m1Promotion,
        p1cPromotion,
      ]);
      const m1Paths = new Set(m1Promotion.entries.map((entry) => entry.path));
      const m1AuditRecords = auditEvidence.auditRecords.filter(
        (/** @type {any} */ record) => m1Paths.has(record.file),
      );
      const p1cPaths = new Set(p1cPromotion.entries.map((entry) => entry.path));
      const p1cAuditRecords = auditEvidence.auditRecords.filter(
        (/** @type {any} */ record) => p1cPaths.has(record.file),
      );

      assertSame(m1Promotion.entries.length, 103);
      assertSame(m1AuditRecords.length, 206);
      assertSame(p1cPromotion.entries.length, 81);
      assertSame(p1cAuditRecords.length, 161);
      for (const entry of m1Promotion.entries) {
        assertSame(
          JSON.stringify(reportFeaturesForPath(entry.path)),
          JSON.stringify(entry.features),
          `M1 report feature authority drifted for ${entry.path}`,
        );
        const records = m1AuditRecords.filter(
          (/** @type {any} */ record) => record.file === entry.path,
        );
        assertSame(
          JSON.stringify(
            records.map((/** @type {any} */ record) => [
              record.variant,
              record.status,
            ]),
          ),
          JSON.stringify([
            ['non-strict', 'passed'],
            ['strict', 'passed'],
          ]),
          `tracked M1 audit evidence drifted for ${entry.path}`,
        );
      }
      for (const entry of p1cPromotion.entries) {
        assertSame(
          JSON.stringify(reportFeaturesForPath(entry.path)),
          JSON.stringify(entry.features),
          entry.path,
        );
        assertSame(
          p1cAuditRecords
            .filter((/** @type {any} */ record) => record.file === entry.path)
            .every((/** @type {any} */ record) => record.status === 'passed'),
          true,
          `tracked P1C audit evidence drifted for ${entry.path}`,
        );
      }

      const sourceFeaturesByPath = new Map(
        Object.entries(M1_TRACKED_SOURCE_FEATURE_ORDER),
      );
      const divergent = [];
      for (const entry of m1Promotion.entries) {
        const sourceFeatures =
          sourceFeaturesByPath.get(entry.path) ?? entry.features;
        if (
          JSON.stringify(reportFeaturesForPath(entry.path)) !==
          JSON.stringify(sourceFeatures)
        ) {
          divergent.push(entry.path);
        }
      }
      assertSame(
        JSON.stringify(divergent),
        JSON.stringify(M1_REPORT_ORDER_DIVERGENT_PATHS),
      );
      const p1cDivergent = [];
      for (const entry of p1cPromotion.entries) {
        if (
          JSON.stringify(reportFeaturesForPath(entry.path)) !==
          JSON.stringify(entry.features)
        ) {
          p1cDivergent.push(entry.path);
        }
      }
      assertSame(JSON.stringify(p1cDivergent), '[]');
      assertSame(
        promotionPaths(promotion).every(
          (path) => reportFeaturesForPath(path) === undefined,
        ),
        true,
      );
      assertSame(
        promotionPaths(h0Promotion).every(
          (path) => reportFeaturesForPath(path) === undefined,
        ),
        true,
      );
      assertSame(
        reportFeaturesForPath('test/language/nonpromotion.js'),
        undefined,
      );
      assertSame(
        assertThrows(
          () =>
            createReportFeatures([
              m1Promotion,
              parseEs2015Promotion(
                json(
                  namedPromotionFixture({
                    groupName: 'es2015/p1c-overlap',
                    entries: [
                      {
                        path: m1Promotion.entries[0].path,
                        variants: 1,
                        features: [],
                        includeFeatures: [],
                      },
                    ],
                    rootCount: 1,
                    variantCount: 1,
                    ledgerSha256: sha256(`${m1Promotion.entries[0].path}\n`),
                  }),
                ),
              ),
            ]),
          Error,
        ).message,
        `Promotion report features repeat path ${m1Promotion.entries[0].path}`,
      );
    },
  },
  {
    name: 'upstream selection reads only structurally eligible paths before metadata decisions',
    run: async () => {
      /** @type {string[]} */
      const reads = [];
      const sources = new Map([
        [MODULE_PATH, '/*---\nflags: [module]\n---*/\n'],
        [ELIGIBLE_PATH, ''],
      ]);
      const paths = await selectPaths({
        policy: POLICY,
        previouslySelected: new Set([MODULE_PATH, ELIGIBLE_PATH]),
        files: [EXCLUDED_PATH, MODULE_PATH, ELIGIBLE_PATH],
        harnessParsing: new Map(),
        readSource: async (path) => {
          reads.push(path);
          const source = sources.get(path);

          if (source === undefined) {
            throw new Error(`unexpected source read: ${path}`);
          }

          return source;
        },
      });

      assertSame(
        JSON.stringify(reads),
        JSON.stringify([MODULE_PATH, ELIGIBLE_PATH]),
        'structurally excluded paths must not be read while module metadata is read before rejection',
      );
      assertSame(JSON.stringify(paths), JSON.stringify([ELIGIBLE_PATH]));
    },
  },
  {
    name: 'upstream selection excludes module-code paths before reading source',
    run: async () => {
      /** @type {string[]} */
      const reads = [];
      const paths = await selectPaths({
        policy: POLICY,
        previouslySelected: new Set([MODULE_CODE_PATH, ELIGIBLE_PATH]),
        files: [MODULE_CODE_PATH, ELIGIBLE_PATH],
        harnessParsing: new Map(),
        readSource: (path) => {
          reads.push(path);
          return '';
        },
      });

      assertSame(JSON.stringify(reads), JSON.stringify([ELIGIBLE_PATH]));
      assertSame(JSON.stringify(paths), JSON.stringify([ELIGIBLE_PATH]));
    },
  },
  {
    name: 'upstream selection admits only exact generator feature areas',
    run: async () => {
      const policy = createPolicy(
        ['computed-property-names', 'generators'],
        [
          {
            prefix: FOCUSED_TAGGED_GENERATOR_PATH,
            features: ['generators'],
            generatorSyntax: true,
            reason: 'Exact focused tagged generator root.',
          },
          {
            prefix: FOCUSED_UNTAGGED_CLASS_GENERATOR_PATH,
            features: [],
            generatorSyntax: true,
            reason: 'Exact focused untagged class generator root.',
          },
          {
            prefix: FOCUSED_UNTAGGED_OBJECT_GENERATOR_PATH,
            features: [],
            generatorSyntax: true,
            reason: 'Exact focused untagged object generator root.',
          },
          {
            prefix: 'test/language/expressions/class',
            features: ['computed-property-names'],
            reason: 'Broad computed class coverage.',
          },
          {
            prefix: 'test/language/expressions/object',
            features: ['computed-property-names'],
            reason: 'Broad computed object coverage.',
          },
        ],
      );
      const sources = new Map([
        [
          FOCUSED_TAGGED_GENERATOR_PATH,
          '/*---\nfeatures: [generators]\n---*/\nfunction* g() { yield 1; }',
        ],
        [
          FOCUSED_UNTAGGED_CLASS_GENERATOR_PATH,
          '/*---\ndescription: focused class\n---*/\nclass C { *g() { yield 1; } }',
        ],
        [
          FOCUSED_UNTAGGED_OBJECT_GENERATOR_PATH,
          '/*---\ndescription: focused object\n---*/\nvar o = { *g() { yield 1; } };',
        ],
        [
          PINNED_CLASS_GENERATOR_NEIGHBOR,
          `${COMPUTED_PROPERTY_FRONTMATTER}class C { [function* () {}] () {} }`,
        ],
        [
          PINNED_OBJECT_GENERATOR_NEIGHBOR,
          `${COMPUTED_PROPERTY_FRONTMATTER}var o = { [function* () {}] () {} };`,
        ],
      ]);
      const paths = await selectPaths({
        policy,
        previouslySelected: new Set(),
        files: [...sources.keys()],
        harnessParsing: new Map(),
        readSource: (path) => {
          const source = sources.get(path);

          if (source === undefined) {
            throw new Error(`unexpected source read: ${path}`);
          }

          return source;
        },
      });

      assertSame(
        JSON.stringify(paths),
        JSON.stringify([
          FOCUSED_TAGGED_GENERATOR_PATH,
          FOCUSED_UNTAGGED_CLASS_GENERATOR_PATH,
          FOCUSED_UNTAGGED_OBJECT_GENERATOR_PATH,
        ]),
      );
      assertSame(
        JSON.stringify(
          policy.featureAreas
            .filter((area) =>
              [
                FOCUSED_TAGGED_GENERATOR_PATH,
                FOCUSED_UNTAGGED_CLASS_GENERATOR_PATH,
                FOCUSED_UNTAGGED_OBJECT_GENERATOR_PATH,
              ].includes(area.prefix),
            )
            .map((area) => area.features),
        ),
        '[["generators"],[],[]]',
        'syntax authorization must preserve each pinned metadata feature list',
      );
    },
  },
  {
    name: 'upstream selection defers generator syntax until generators expansion',
    run: async () => {
      const paths = await selectKnownGood(GENERATOR_SOURCES, POLICY);

      assertSame(JSON.stringify(paths), JSON.stringify([ORDINARY_PATH]));
    },
  },
  {
    name: 'generator expansion alone does not admit generator syntax without exact areas',
    run: async () => {
      const paths = await selectKnownGood(GENERATOR_SOURCES, GENERATOR_POLICY);

      assertSame(JSON.stringify(paths), JSON.stringify([ORDINARY_PATH]));
    },
  },
  {
    name: 'generator-bearing harnesses require the including exact-file authorization',
    run: async () => {
      const policy = createPolicy(
        ['computed-property-names', 'generators'],
        [
          {
            prefix: FOCUSED_TAGGED_GENERATOR_PATH,
            features: ['generators'],
            generatorSyntax: true,
            reason: 'Exact focused generator root.',
          },
        ],
      );
      const selected = await selectKnownGood(
        GENERATOR_HARNESS_USER_SOURCES,
        policy,
        new Map([
          [
            GENERATOR_HARNESS,
            inspectEngineGrammar(
              'function* harnessGenerator() { yield 1; }',
              policy,
            ),
          ],
        ]),
      );

      assertSame(
        JSON.stringify(selected),
        JSON.stringify([FOCUSED_TAGGED_GENERATOR_PATH]),
        'an ordinary baseline candidate must not inherit generator syntax from the global expansion, while the exact authorized root remains eligible',
      );
    },
  },
  {
    name: 'pinned checkout validation rejects tracked and untracked tree changes',
    async run() {
      const checkoutUrl = new URL(
        `.test262-pin-${randomUUID()}/`,
        import.meta.url,
      );
      const checkoutPath = fileURLToPath(checkoutUrl);

      try {
        await mkdir(checkoutUrl);
        runGit(checkoutPath, ['init', '--quiet']);
        runGit(checkoutPath, ['config', 'user.name', 'JSJS Tests']);
        runGit(checkoutPath, ['config', 'user.email', 'tests@example.invalid']);
        await writeFile(new URL('tracked.js', checkoutUrl), 'clean\n', 'utf8');
        runGit(checkoutPath, ['add', 'tracked.js']);
        runGit(checkoutPath, ['commit', '--quiet', '-m', 'fixture']);
        const revision = runGit(checkoutPath, ['rev-parse', 'HEAD']);
        runGit(checkoutPath, ['checkout', '--quiet', '--detach', revision]);
        const pin = {
          repository: 'https://example.invalid/test262.git',
          revision,
          checkoutPath,
        };

        await assertPinnedCheckout(pin);

        await writeFile(
          new URL('tracked.js', checkoutUrl),
          'modified\n',
          'utf8',
        );
        const tracked = await rejectionFrom(() => assertPinnedCheckout(pin));
        assertSame(tracked.message.includes('uncommitted changes'), true);

        runGit(checkoutPath, ['checkout', '--', 'tracked.js']);
        await writeFile(new URL('untracked.js', checkoutUrl), 'new\n', 'utf8');
        const untracked = await rejectionFrom(() => assertPinnedCheckout(pin));
        assertSame(untracked.message.includes('uncommitted changes'), true);
      } finally {
        await rm(checkoutUrl, { recursive: true, force: true });
      }
    },
  },
];
