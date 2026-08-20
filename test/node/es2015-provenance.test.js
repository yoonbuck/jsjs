import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { assertSame, assertThrows } from '../harness/assert.js';
import {
  ES2015_PROVENANCE_DECISION_CODES,
  ES2015_PROVENANCE_FILE,
  ES2015_PROVENANCE_VERSION,
  Es2015ProvenanceError,
  buildProvenanceFoundation,
  canonicalDecisionSha256,
  parseEs2015DecisionFragment,
  parseEs2015ProvenanceManifest,
  renderBatchLedger,
  renderProvenanceIssueBody,
  validateDecisionFragments,
  validateProvenanceFoundation,
} from '../../tools/test262/es2015-provenance.js';
import {
  createProvenanceCheckDependencies,
  Es2015ProvenanceCheckError,
  main as provenanceCheck,
} from '../../tools/test262/es2015-provenance-check.js';
import {
  Es2015TaxonomyError,
  buildEs2015Inventory,
  classifyEs2015Inventory,
  parseEs2015Anchors,
  parseEs2015Policy,
  renderEs2015Taxonomy,
  summarizeEs2015Classification,
} from '../../tools/test262/es2015-taxonomy.js';

/**
 * @typedef {ReturnType<typeof buildProvenanceFoundation>} ProvenanceManifest
 * @typedef {ProvenanceManifest['batches'][number]} ProvenanceBatch
 * @typedef {ProvenanceBatch['entries'][number]} ProvenanceBatchEntry
 * @typedef {{ path: string, variants: number, partition: string, finalClass: string, features: readonly string[], flags: readonly string[], includes: readonly string[] }} ClassificationRecord
 * @typedef {{ rootCount: number, variantCount: number, pathSha256: string, entryLedgerSha256: string }} ApprovedBatchSummary
 * @typedef {readonly { type: 'test', file: string, variant: 'non-strict' | 'strict', status: 'passed' }[]} ExecutionRecords
 */

const readFileSyncText =
  /** @type {(path: URL, encoding: string) => string} */ (
    /** @type {any} */ (fs).readFileSync
  );

const TEST262_REPOSITORY = 'https://github.com/tc39/test262.git';
const TEST262_REVISION = 'b363f29d3c43c626dc852744ad64a0b48a003693';
const TAXONOMY_BASELINE = '54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7';
const SPECIFICATION_SOURCE = 'https://262.ecma-international.org/6.0/';
const SPECIFICATION_SHA256 =
  '4d4243dc2f04c9cdd09498f2cc2af6f6cdc07b0430da5578e7cf440d4f7846a0';
const TAXONOMY_PATH = 'tools/test262/es2015-taxonomy.json';
const PROVENANCE_DECISIONS_DIRECTORY =
  'tools/test262/es2015-provenance-decisions';
const ISSUE_MAP_PATH = '/fixture/es2015-provenance-created-issues.json';
const RANGE_BASE_SHA = 'a'.repeat(40);
const RANGE_HEAD_SHA = 'b'.repeat(40);
const FOUNDATION_BOOTSTRAP_COMMIT = '8d75b48af2ee7ab04e7c5006980417227ec34568';
const FOUNDATION_BOOTSTRAP_MANIFEST_SHA256 =
  'ad3e55a061f1156fc267655ac8cb977f6a54f934cc56a5efa5689c7fc620ae04';
const ISSUE_77_LEXICAL_MAINTENANCE_BASE_SHA =
  '99c439f2efd287479f40d8d0e6ac2dd9aab81e10';
const FOUNDATION_ALLOWED_PATHS = Object.freeze([
  '.github/workflows/ci.yml',
  '.prettierignore',
  'docs/conformance.md',
  'docs/superpowers/plans/2026-08-19-unknown-edition-provenance.md',
  'docs/superpowers/specs/2026-08-19-unknown-edition-provenance-design.md',
  'docs/testing.md',
  'package.json',
  'test/node/es2015-provenance.test.js',
  'test/node/es2015-taxonomy.test.js',
  'test/node/repository-invariants.test.js',
  'test/node/workflow-contract.test.js',
  'test/run-node.js',
  'tools/ci/pipeline.js',
  'tools/test262/es2015-audit.js',
  'tools/test262/es2015-provenance-check.js',
  'tools/test262/es2015-provenance-decisions/UA.json',
  'tools/test262/es2015-provenance-decisions/UB.json',
  'tools/test262/es2015-provenance-decisions/UL1.json',
  'tools/test262/es2015-provenance-decisions/UL2.json',
  'tools/test262/es2015-provenance-decisions/UL3.json',
  'tools/test262/es2015-provenance-decisions/UL4.json',
  'tools/test262/es2015-provenance-decisions/US1.json',
  'tools/test262/es2015-provenance-decisions/US2.json',
  'tools/test262/es2015-provenance-decisions/US3.json',
  'tools/test262/es2015-provenance-decisions/US4.json',
  'tools/test262/es2015-provenance-decisions/US5.json',
  'tools/test262/es2015-provenance-decisions/US6.json',
  'tools/test262/es2015-provenance-decisions/US7.json',
  'tools/test262/es2015-provenance.js',
  'tools/test262/es2015-provenance.json',
  'tools/test262/es2015-taxonomy.js',
]);
const FOUNDATION_DELETIONS = Object.freeze([
  '.superpowers/sdd/2026-08-15-async-runtime-modules-release/agent-chain-boundary-report.md',
  '.superpowers/sdd/2026-08-15-async-runtime-modules-release/agent-chain-quality-fix-report.md',
  '.superpowers/sdd/2026-08-15-async-runtime-modules-release/generator-preflight-report.md',
  '.superpowers/sdd/2026-08-15-async-runtime-modules-release/origin-main-blocker-report.md',
  '.superpowers/sdd/2026-08-15-async-runtime-modules-release/pr-gate-runtime-fix-report.md',
  '.superpowers/sdd/2026-08-15-async-runtime-modules-release/recovery-release-gate-report.md',
  '.superpowers/sdd/2026-08-15-async-runtime-modules-release/whole-milestone-review-fix-report.md',
]);
const DECISION_GENERATED_PATHS = Object.freeze([
  'docs/conformance.md',
  'docs/test262-report.jsonl',
  'tools/test262/es2015-audit-evidence.json',
  'tools/test262/es2015-taxonomy.json',
]);
const ISSUE_77_LEXICAL_MAINTENANCE_PATHS = Object.freeze([
  'README.md',
  'docs/architecture.md',
  'docs/conformance.md',
  'docs/limitations.md',
  'docs/superpowers/plans/2026-08-19-es2015-lexical-new-target.md',
  'docs/superpowers/specs/2026-08-19-es2015-lexical-new-target-design.md',
  'docs/test262-report.jsonl',
  'docs/testing.md',
  'src/api.js',
  'src/evaluator/dynamic-function.js',
  'src/evaluator/eval.js',
  'src/evaluator/expressions.js',
  'src/evaluator/generator-expression-frames.js',
  'src/evaluator/modules.js',
  'src/parser.js',
  'src/runtime/environment.js',
  'src/runtime/function-object.js',
  'test/arrow-functions.test.js',
  'test/ci/es2015-syntax-test262.test.js',
  'test/ci/full-contract.test.js',
  'test/classes.test.js',
  'test/dynamic-function.test.js',
  'test/environments.test.js',
  'test/eval.test.js',
  'test/function-parameters.test.js',
  'test/function-realm.test.js',
  'test/functions.test.js',
  'test/generator-function.test.js',
  'test/module-loader.test.js',
  'test/module-parser.test.js',
  'test/node/es2015-provenance.test.js',
  'test/node/upstream-select.test.js',
  'test/parser.test.js',
  'test/template-literals.test.js',
  'tools/test262/es2015-audit-evidence.json',
  'tools/test262/es2015-provenance-check.js',
  'tools/test262/es2015-provenance.js',
  'tools/test262/es2015-provenance.json',
  'tools/test262/es2015-taxonomy.json',
  'tools/test262/es5-selection.json',
  'tools/test262/upstream-subset.json',
]);
const ISSUE_77_LEXICAL_GENERATED_PATHS = Object.freeze([
  'docs/conformance.md',
  'docs/test262-report.jsonl',
  'tools/test262/es2015-audit-evidence.json',
  'tools/test262/es2015-provenance.json',
  'tools/test262/es2015-taxonomy.json',
  'tools/test262/upstream-subset.json',
]);
const EMPTY_DECISION_FRAGMENTS = Object.freeze(
  ES2015_PROVENANCE_DECISION_CODES.map(
    (code) => `${PROVENANCE_DECISIONS_DIRECTORY}/${code}.json`,
  ),
);
const FOUNDATION_MAINTENANCE_ALLOWED_PATHS = Object.freeze([
  '.github/workflows/ci.yml',
  'docs/conformance.md',
  'docs/superpowers/plans/2026-08-19-unknown-edition-provenance.md',
  'docs/superpowers/plans/2026-08-20-provenance-foundation-maintenance.md',
  'docs/superpowers/specs/2026-08-19-unknown-edition-provenance-design.md',
  'docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md',
  'docs/testing.md',
  'test/node/es2015-provenance.test.js',
  'test/node/workflow-contract.test.js',
  'tools/ci/pipeline.js',
  'tools/test262/es2015-provenance-check.js',
  'tools/test262/es2015-provenance-decisions/UA.json',
  'tools/test262/es2015-provenance-decisions/UB.json',
  'tools/test262/es2015-provenance-decisions/UL1.json',
  'tools/test262/es2015-provenance-decisions/UL2.json',
  'tools/test262/es2015-provenance-decisions/UL3.json',
  'tools/test262/es2015-provenance-decisions/UL4.json',
  'tools/test262/es2015-provenance-decisions/US1.json',
  'tools/test262/es2015-provenance-decisions/US2.json',
  'tools/test262/es2015-provenance-decisions/US3.json',
  'tools/test262/es2015-provenance-decisions/US4.json',
  'tools/test262/es2015-provenance-decisions/US5.json',
  'tools/test262/es2015-provenance-decisions/US6.json',
  'tools/test262/es2015-provenance-decisions/US7.json',
  'tools/test262/es2015-provenance.js',
  'tools/test262/es2015-provenance.json',
]);
const CAPTURED_FOUNDATION_RANGE_PROFILE = Object.freeze({
  name: 'foundation',
  baseFoundation: 'absent',
  requiredPaths: FOUNDATION_ALLOWED_PATHS,
  allowedPaths: FOUNDATION_ALLOWED_PATHS,
  requiredDeletions: FOUNDATION_DELETIONS,
  allowedDeletions: FOUNDATION_DELETIONS,
  emptyDecisionFragments: EMPTY_DECISION_FRAGMENTS,
  decisionFragment: null,
  generatedPaths: Object.freeze([
    '.github/workflows/ci.yml',
    ...EMPTY_DECISION_FRAGMENTS,
    ES2015_PROVENANCE_FILE,
  ]),
});
const CAPTURED_FOUNDATION_MAINTENANCE_RANGE_PROFILE = Object.freeze({
  name: 'foundation-maintenance',
  baseFoundation: 'present',
  requiredPaths: Object.freeze([]),
  allowedPaths: FOUNDATION_MAINTENANCE_ALLOWED_PATHS,
  requiredDeletions: Object.freeze([]),
  allowedDeletions: Object.freeze([]),
  emptyDecisionFragments: EMPTY_DECISION_FRAGMENTS,
  decisionFragment: null,
  generatedPaths: Object.freeze([
    '.github/workflows/ci.yml',
    ES2015_PROVENANCE_FILE,
  ]),
});
const CAPTURED_ISSUE_77_LEXICAL_MAINTENANCE_RANGE_PROFILE = Object.freeze({
  name: 'maintenance:issue77-lexical',
  baseFoundation: 'present',
  requiredPaths: ISSUE_77_LEXICAL_MAINTENANCE_PATHS,
  allowedPaths: ISSUE_77_LEXICAL_MAINTENANCE_PATHS,
  requiredDeletions: Object.freeze([]),
  allowedDeletions: Object.freeze([]),
  emptyDecisionFragments: Object.freeze([]),
  decisionFragment: null,
  generatedPaths: ISSUE_77_LEXICAL_GENERATED_PATHS,
});
/** @param {string} code */
function capturedDecisionRangeProfile(code) {
  const decisionFragment = `${PROVENANCE_DECISIONS_DIRECTORY}/${code}.json`;
  return Object.freeze({
    name: `decision:${code}`,
    baseFoundation: 'present',
    requiredPaths: Object.freeze([decisionFragment]),
    allowedPaths: Object.freeze([
      'docs/conformance.md',
      'docs/test262-report.jsonl',
      'tools/test262/es2015-audit-evidence.json',
      decisionFragment,
      'tools/test262/es2015-taxonomy.json',
    ]),
    requiredDeletions: Object.freeze([]),
    allowedDeletions: Object.freeze([]),
    emptyDecisionFragments: Object.freeze([]),
    decisionFragment,
    generatedPaths: DECISION_GENERATED_PATHS,
  });
}
const PRODUCTION_TAXONOMY_TEXT = readFileSyncText(
  new URL('../../tools/test262/es2015-taxonomy.json', import.meta.url),
  'utf8',
);
const PRODUCTION_UL3_PATH =
  'test/language/expressions/await/await-BindingIdentifier-in-global.js';
/** @type {Readonly<{ baseLedger: { rootCount: number, variantCount: number, pathSha256: string }, batches: Record<string, ApprovedBatchSummary> }>} */
const APPROVED_PRODUCTION_FOUNDATION = Object.freeze({
  baseLedger: Object.freeze({
    rootCount: 2312,
    variantCount: 4054,
    pathSha256:
      '56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc',
  }),
  batches: Object.freeze({
    UA: Object.freeze({
      rootCount: 314,
      variantCount: 323,
      pathSha256:
        'd29150e412486095bac0103f5d7e913917269870a9769cd8343a5cc9638af98e',
      entryLedgerSha256:
        'a6664c97c45fd047a4d136b62f2121b630fa742c6e21594111457e367d88cc09',
    }),
    UB: Object.freeze({
      rootCount: 32,
      variantCount: 64,
      pathSha256:
        '4e21b1884213e2831ffe58fb5c5128f17d417168aeabeac3c3817f8f6350623a',
      entryLedgerSha256:
        '99441828b25381a9ce86cbad7bdaaeb612100d2425990f0689f08bf6f7059a1a',
    }),
    UL1: Object.freeze({
      rootCount: 434,
      variantCount: 835,
      pathSha256:
        '1bad4b5aed5f665cfcd270a57c90553b1fe4a1dabb1334fa950527b1113b937a',
      entryLedgerSha256:
        'f5044351e9319bacd6d07fdbb4f6eb995f87ab7a2c307893fbd173fcacf9b1f5',
    }),
    UL2: Object.freeze({
      rootCount: 182,
      variantCount: 364,
      pathSha256:
        'b5e8412e46d0bb2d976de247d312269b9ac34fa9cda77d15a2aa11c1eb0abb45',
      entryLedgerSha256:
        '2516f31b492778b05737a34c24aead5520ba0804b824c4fb0af54b49fca75640',
    }),
    UL3: Object.freeze({
      rootCount: 109,
      variantCount: 212,
      pathSha256:
        'af158f399b1827dd2012030fbec2fdbbb28f184c011a310550928eb718dca406',
      entryLedgerSha256:
        '4b4543298d376734ef7a58ce6eb2a84ed1b0997a588e509ec25a36705378c6e8',
    }),
    UL4: Object.freeze({
      rootCount: 48,
      variantCount: 48,
      pathSha256:
        '9316f73cad2c6608ad14d6e837e5383100bb2ebd0a4feb2ba9f198ee35e5d3ac',
      entryLedgerSha256:
        '4ecb3fa2541b0ba3932c61bd5b92d3a137561202036b6009bfbdf2f25a997b58',
    }),
    US1: Object.freeze({
      rootCount: 210,
      variantCount: 406,
      pathSha256:
        '63ff657590ebb5aa167c19975344817789a9a67b820ce0092f990376afa873f7',
      entryLedgerSha256:
        'f1ef59740d3a9cbae631e0c65cd7d4aa24bd6619129d76179ca7d32e795b184f',
    }),
    US2: Object.freeze({
      rootCount: 176,
      variantCount: 352,
      pathSha256:
        '3b3db618ae579287c0cbe5a77124c883c3129395bf83fe7523dc1f32e3fe7d15',
      entryLedgerSha256:
        '5acbdcb3fdaf4e9fc95a157aac51e20041cc38b47de8717d655eb9b32e5cbfdb',
    }),
    US3: Object.freeze({
      rootCount: 99,
      variantCount: 190,
      pathSha256:
        '42d21ddbd59de80f8c14b1508c3502c8c0bc023061ff24c16160f1bfaec7daa1',
      entryLedgerSha256:
        '06922dfb4dc6fa2d2e07e7bcbf8364fcd8fc943921820a15c057b17e55fb8528',
    }),
    US4: Object.freeze({
      rootCount: 176,
      variantCount: 318,
      pathSha256:
        '19bc8b322158aa59af8d0b5efd38cf58885be50fdb6394b56cc94a2b94754c0b',
      entryLedgerSha256:
        'e548e96a5d68e6117c454d0117831f81445d0eec93f7b873ea82a6d7673a7d66',
    }),
    US5: Object.freeze({
      rootCount: 306,
      variantCount: 540,
      pathSha256:
        'fdc5ed38ef91366ee6bd9f8aa8d49917b5d9bbc2746cfd62a50f22a22cd03df5',
      entryLedgerSha256:
        '87d0388e420d5ffdde58c81705b19daca1d3488e3de4330b1cc8e9ad63bd36f0',
    }),
    US6: Object.freeze({
      rootCount: 48,
      variantCount: 89,
      pathSha256:
        '90dfecd04460d739d4a7242b6ff14c4ef83abcf3e73d7893b392138372ce1cf1',
      entryLedgerSha256:
        'c7c524d8b8cd8f0094f631be7d16abcc7f946db86546aaf6339d9cd9853d6a16',
    }),
    US7: Object.freeze({
      rootCount: 178,
      variantCount: 313,
      pathSha256:
        '1e2cda5adef593ae134f0ab0e759091f57522821460c904c7f44c4217c891e28',
      entryLedgerSha256:
        '6fa9daa7322394f0f96b754ef6674ccb80b916cd4209c2308f7591eaf46f7e23',
    }),
  }),
});
const CLASSIFICATION_POLICY = JSON.stringify({
  version: 1,
  repository: TEST262_REPOSITORY,
  revision: TEST262_REVISION,
  specification: {
    source: SPECIFICATION_SOURCE,
    sourceSha256: SPECIFICATION_SHA256,
  },
  es2015Features: ['let'],
  laterFeatures: ['async-functions'],
  neutralFeatures: ['neutral-feature'],
  laterFlags: ['CanBlockIsFalse', 'CanBlockIsTrue'],
  pathRules: [
    {
      prefix: 'test/annexB/',
      partition: 'annex-b',
      reason: 'Annex B roots stay separate from core.',
    },
  ],
});
const CLASSIFICATION_ANCHORS = JSON.stringify({
  version: 1,
  source: SPECIFICATION_SOURCE,
  sourceSha256: SPECIFICATION_SHA256,
  anchors: ['sec-anchor'],
});

/** @param {unknown} value */
function json(value) {
  return JSON.stringify(value);
}

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** @param {readonly ProvenanceBatchEntry[]} entries */
function entryLedgerText(entries) {
  return `${entries.map((entry) => json([entry.path, entry.variants, entry.priorClass])).join('\n')}\n`;
}

/** @param {readonly ProvenanceBatchEntry[]} entries */
function entryLedgerSha256(entries) {
  return sha256(entryLedgerText(entries));
}

/** @param {unknown} value */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** @returns {readonly ClassificationRecord[]} */
function foundationClassifications() {
  return [
    {
      path: 'test/annexB/z-last.js',
      variants: 1,
      partition: 'unknown-edition',
      finalClass: 'unknown-edition',
      features: [],
      flags: [],
      includes: [],
    },
    {
      path: 'test/annexB/a-first.js',
      variants: 2,
      partition: 'unknown-edition',
      finalClass: 'unknown-edition',
      features: [],
      flags: [],
      includes: [],
    },
    {
      path: 'test/language/ignored.js',
      variants: 3,
      partition: 'core',
      finalClass: 'core',
      features: [],
      flags: [],
      includes: [],
    },
  ];
}

/** @type {readonly ClassificationRecord[] | undefined} */
let cachedProductionClassifications;

/** @returns {readonly ClassificationRecord[]} */
function productionClassifications() {
  if (cachedProductionClassifications !== undefined) {
    return cachedProductionClassifications;
  }
  const taxonomy = JSON.parse(
    readFileSyncText(
      new URL('../../tools/test262/es2015-taxonomy.json', import.meta.url),
      'utf8',
    ),
  );
  cachedProductionClassifications = taxonomy.classifications.map(
    (/** @type {any} */ record) => ({
      path: record.path,
      variants: record.variants,
      partition: record.partition,
      finalClass: record.status,
      features: record.features,
      flags: record.flags,
      includes: record.includes,
    }),
  );
  return /** @type {readonly ClassificationRecord[]} */ (
    cachedProductionClassifications
  );
}

/** @returns {ProvenanceManifest} */
function productionManifest() {
  return buildProvenanceFoundation(productionClassifications());
}

function approvedProvenanceManifestText() {
  return `${JSON.stringify(productionManifest(), null, 2)}\n`;
}

function driftedTaxonomyText() {
  const taxonomy = JSON.parse(PRODUCTION_TAXONOMY_TEXT);
  const targetPath = productionManifest().baseLedger.paths[0];
  const record = taxonomy.classifications.find(
    (/** @type {any} */ entry) => entry.path === targetPath,
  );
  record.variants += 1;
  return `${JSON.stringify(taxonomy, null, 2)}\n`;
}

function reclassifiedTaxonomyText() {
  const taxonomy = JSON.parse(PRODUCTION_TAXONOMY_TEXT);
  const targetPath = productionManifest().baseLedger.paths[0];
  const record = taxonomy.classifications.find(
    (/** @type {any} */ entry) => entry.path === targetPath,
  );
  record.partition = 'core';
  record.status = 'audit-passing-unselected';
  return `${JSON.stringify(taxonomy, null, 2)}\n`;
}

/** @param {ProvenanceManifest} manifest @param {string} code */
function emptyDecisionFragmentText(manifest, code) {
  return `${JSON.stringify(
    {
      version: manifest.version,
      taxonomyBaseline: manifest.taxonomyBaseline,
      repository: manifest.repository,
      revision: manifest.revision,
      specification: manifest.specification,
      parent: manifest.parent,
      code,
      decisions: [],
    },
    null,
    2,
  )}\n`;
}

/** @param {ProvenanceManifest} manifest @param {string} code */
function completePendingDecisionFragmentText(manifest, code) {
  const batch = manifest.batches.find((entry) => entry.code === code);
  if (batch === undefined) {
    throw new Error(`expected production manifest batch ${code}`);
  }
  const decisions = batch.entries.map((entry) => {
    const decision = {
      ...decisionWithoutHash(),
      path: entry.path,
      variants: entry.variants,
      priorClass: entry.priorClass,
      review: {
        reviewer: 'pending',
        reviewedAt: 'pending',
        artifact: 'pending',
      },
    };
    return {
      ...decision,
      artifactSha256: canonicalDecisionSha256(decision),
    };
  });
  return `${JSON.stringify(
    {
      version: manifest.version,
      taxonomyBaseline: manifest.taxonomyBaseline,
      repository: manifest.repository,
      revision: manifest.revision,
      specification: manifest.specification,
      parent: manifest.parent,
      code,
      decisions,
    },
    null,
    2,
  )}\n`;
}

/** @param {ProvenanceManifest} manifest @param {string} code */
function completeReviewedDecisionFragmentText(manifest, code) {
  const batch = manifest.batches.find((entry) => entry.code === code);
  if (batch === undefined) {
    throw new Error(`expected production manifest batch ${code}`);
  }
  const decisions = batch.entries.map((entry) => {
    const decision = {
      ...decisionWithoutHash(),
      path: entry.path,
      variants: entry.variants,
      priorClass: entry.priorClass,
    };
    return {
      ...decision,
      artifactSha256: canonicalDecisionSha256(decision),
    };
  });
  return `${JSON.stringify(
    {
      version: manifest.version,
      taxonomyBaseline: manifest.taxonomyBaseline,
      repository: manifest.repository,
      revision: manifest.revision,
      specification: manifest.specification,
      parent: manifest.parent,
      code,
      decisions,
    },
    null,
    2,
  )}\n`;
}

/** @param {ProvenanceBatch} batch */
function refreshBatchLedger(batch) {
  batch.rootCount = batch.entries.length;
  batch.variantCount = batch.entries.reduce(
    (sum, entry) => sum + entry.variants,
    0,
  );
  batch.pathSha256 = sha256(
    `${batch.entries.map((entry) => entry.path).join('\n')}\n`,
  );
  batch.entryLedgerSha256 = entryLedgerSha256(batch.entries);
}

/** @param {ProvenanceManifest} manifest */
function findNonUl3BatchEntry(manifest) {
  for (const batch of manifest.batches) {
    if (batch.code === 'UL3') continue;
    const entry = batch.entries[0];
    if (entry !== undefined) {
      return {
        code: batch.code,
        path: entry.path,
      };
    }
  }
  throw new Error('expected a non-UL3 production batch entry');
}

/** @param {ProvenanceManifest} manifest */
function findVariantRedistributionPair(manifest) {
  for (const batch of manifest.batches) {
    if (batch.code === 'UL3') continue;
    for (const source of batch.entries) {
      if (source.variants <= 1) continue;
      for (const target of batch.entries) {
        if (target.path === source.path) continue;
        return {
          code: batch.code,
          sourcePath: source.path,
          targetPath: target.path,
        };
      }
    }
  }
  throw new Error(
    'expected production manifest entries that can redistribute variants',
  );
}

function tamperedPriorClassManifest() {
  const classifications = clone(productionClassifications());
  const manifest = clone(productionManifest());
  const target = findNonUl3BatchEntry(manifest);
  const batch = manifest.batches.find(
    (/** @type {ProvenanceBatch} */ entry) => entry.code === target.code,
  );
  const entry = batch?.entries.find(
    (/** @type {ProvenanceBatchEntry} */ candidate) =>
      candidate.path === target.path,
  );
  if (entry === undefined) {
    throw new Error(
      'expected a production manifest entry to mutate priorClass',
    );
  }
  entry.priorClass = `${entry.priorClass}:tampered`;
  if (batch === undefined) {
    throw new Error(
      'expected a production manifest batch to mutate priorClass',
    );
  }
  refreshBatchLedger(batch);
  const classification = classifications.find(
    (/** @type {ClassificationRecord} */ record) => record.path === target.path,
  );
  if (classification === undefined) {
    throw new Error(
      'expected a production classification to mutate priorClass',
    );
  }
  classification.finalClass = `${classification.finalClass}:tampered`;
  return {
    manifest,
    classifications,
    code: target.code,
    path: target.path,
  };
}

function redistributedVariantsManifest() {
  const classifications = clone(productionClassifications());
  const manifest = clone(productionManifest());
  const target = findVariantRedistributionPair(manifest);
  const batch = manifest.batches.find(
    (/** @type {ProvenanceBatch} */ entry) => entry.code === target.code,
  );
  const source = batch?.entries.find(
    (/** @type {ProvenanceBatchEntry} */ entry) =>
      entry.path === target.sourcePath,
  );
  const destination = batch?.entries.find(
    (/** @type {ProvenanceBatchEntry} */ entry) =>
      entry.path === target.targetPath,
  );
  if (source === undefined || destination === undefined) {
    throw new Error(
      'expected production manifest entries to redistribute variants',
    );
  }
  source.variants -= 1;
  destination.variants += 1;
  if (batch === undefined) {
    throw new Error(
      'expected a production manifest batch to redistribute variants',
    );
  }
  refreshBatchLedger(batch);
  const sourceClassification = classifications.find(
    (/** @type {ClassificationRecord} */ record) =>
      record.path === target.sourcePath,
  );
  const destinationClassification = classifications.find(
    (/** @type {ClassificationRecord} */ record) =>
      record.path === target.targetPath,
  );
  if (
    sourceClassification === undefined ||
    destinationClassification === undefined
  ) {
    throw new Error(
      'expected production classifications to redistribute variants',
    );
  }
  sourceClassification.variants -= 1;
  destinationClassification.variants += 1;
  return {
    manifest,
    classifications,
    code: target.code,
    path: target.sourcePath,
  };
}

function validManifestValue() {
  return buildProvenanceFoundation(foundationClassifications());
}

function decisionWithoutHash() {
  return {
    path: 'test/language/example.js',
    variants: 2,
    priorClass: 'unknown-edition',
    finalPartition: 'core',
    finalStatus: 'blocked:remaining-language-runtime-semantics',
    evidenceKind: 'sixth-edition-clause',
    specification: {
      source: SPECIFICATION_SOURCE,
      sourceSha256: SPECIFICATION_SHA256,
      clause: '12.3.1',
      anchor: 'sec-identifiers',
    },
    metadata: {
      es5id: null,
      es6id: null,
      esid: 'pending',
      features: [],
      includeFeatures: [],
      includes: [],
      flags: [],
    },
    history: [
      {
        repository: TEST262_REPOSITORY,
        commit: '0123456789012345678901234567890123456789',
        note: 'Corroborating history only.',
      },
    ],
    rationale: 'The asserted semantics are required by Sixth Edition 12.3.1.',
    review: {
      reviewer: 'copilot-provenance-review',
      reviewedAt: '2026-08-20T00:00:00Z',
      artifact: 'https://github.com/yoonbuck/jsjs/pull/123#issuecomment-1',
    },
    destination: {
      blocker: 'remaining-language-runtime-semantics',
      issue: 96,
    },
  };
}

function validDecision() {
  const value = decisionWithoutHash();
  return {
    ...value,
    artifactSha256: canonicalDecisionSha256(value),
  };
}

function validDecisionFragmentValue() {
  return {
    version: ES2015_PROVENANCE_VERSION,
    taxonomyBaseline: TAXONOMY_BASELINE,
    repository: TEST262_REPOSITORY,
    revision: TEST262_REVISION,
    specification: {
      source: SPECIFICATION_SOURCE,
      sourceSha256: SPECIFICATION_SHA256,
    },
    parent: {
      code: 'T1',
      issue: 75,
    },
    code: 'UL3',
    decisions: [validDecision()],
  };
}

function productionDecisionWithoutHash() {
  return {
    ...decisionWithoutHash(),
    path: PRODUCTION_UL3_PATH,
  };
}

function productionDecisionFragmentValue() {
  const decision = productionDecisionWithoutHash();
  return {
    ...validDecisionFragmentValue(),
    decisions: [
      {
        ...decision,
        artifactSha256: canonicalDecisionSha256(decision),
      },
    ],
  };
}

/** @param {{ decisions: { artifactSha256: string }[] }} fragment */
function refreshFragmentHash(fragment) {
  fragment.decisions[0].artifactSha256 = canonicalDecisionSha256(
    fragment.decisions[0],
  );
  return fragment;
}

const COMPLETE_ISSUE_MAP = Object.freeze({
  U0: 100,
  UA: 101,
  UB: 102,
  UL: 103,
  UL1: 104,
  UL2: 105,
  UL3: 106,
  UL4: 107,
  US: 108,
  US1: 109,
  US2: 110,
  US3: 111,
  US4: 112,
  US5: 113,
  US6: 114,
  US7: 115,
});
const WRAPPED_ISSUE_MAP = Object.freeze({
  version: 1,
  parent: 75,
  baseLedgerSha256:
    '56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc',
  issues: Object.freeze(
    Object.fromEntries(
      Object.entries(COMPLETE_ISSUE_MAP).map(([code, number], index) => [
        code,
        Object.freeze({
          number,
          id: 1000 + index,
          nodeId: `I_fixture_${code}`,
          state: code === 'U0' ? 'closed' : 'open',
        }),
      ]),
    ),
  ),
});
const REVIEWED_BLOCKER_OWNERS = Object.freeze({
  'annex-b-web-compatibility': Object.freeze([99]),
  'binary-data-and-typed-arrays': Object.freeze([87, 88, 89, 90]),
  'early-errors-and-declaration-instantiation': Object.freeze([78]),
  'keyed-collections': Object.freeze([83, 84, 85, 86]),
  'lexical-grammar-and-new-target': Object.freeze([77]),
  'proper-tail-calls': Object.freeze([97]),
  'proxy-and-reflect-metaobject': Object.freeze([79, 80, 81]),
  'regexp-unicode-and-sticky': Object.freeze([91, 92]),
  'remaining-language-runtime-semantics': Object.freeze([96]),
  'remaining-standard-library-additions': Object.freeze([92, 93, 94, 95]),
  'symbol-protocol-dispatch': Object.freeze([82, 92]),
  'test262-cross-realm-host': Object.freeze([76]),
});

function classificationPolicy() {
  return parseEs2015Policy(CLASSIFICATION_POLICY);
}

function classificationAnchors() {
  return parseEs2015Anchors(CLASSIFICATION_ANCHORS);
}

/** @param {string} path */
function passedExecution(path) {
  return /** @type {ExecutionRecords} */ ([
    {
      type: 'test',
      file: path,
      variant: 'non-strict',
      status: 'passed',
    },
    {
      type: 'test',
      file: path,
      variant: 'strict',
      status: 'passed',
    },
  ]);
}

/** @param {string} path @returns {ReadonlyMap<string, ExecutionRecords>} */
function singleExecutionResult(path) {
  /** @type {Map<string, ExecutionRecords>} */
  const results = new Map();
  results.set(path, passedExecution(path));
  return results;
}

/** @param {string} code */
function productionBatchPath(code) {
  const batch = productionManifest().batches.find(
    (entry) => entry.code === code,
  );
  const path = batch?.entries[0]?.path;
  if (typeof path !== 'string') {
    throw new Error(`expected production manifest entry for ${code}`);
  }
  return path;
}

/** @param {{ code: string, path: string, finalPartition: string, finalStatus: string }} options */
function reviewedDecisionWithoutHash(options) {
  return {
    ...decisionWithoutHash(),
    path: options.path,
    finalPartition: options.finalPartition,
    finalStatus: options.finalStatus,
    metadata: {
      es5id: null,
      es6id: null,
      esid: null,
      features: [],
      includeFeatures: [],
      includes: [],
      flags: [],
    },
    destination: options.finalStatus.startsWith('blocked:')
      ? {
          blocker: options.finalStatus.slice('blocked:'.length),
          issue: 96,
        }
      : { blocker: null, issue: null },
  };
}

/** @param {readonly { code: string, path: string, finalPartition: string, finalStatus: string }[]} decisions */
function reviewedProvenanceMap(decisions) {
  const fragments = new Map();
  for (const spec of decisions) {
    const decision = reviewedDecisionWithoutHash(spec);
    const fragment = fragments.get(spec.code) ?? {
      ...validDecisionFragmentValue(),
      code: spec.code,
      decisions: [],
    };
    fragment.decisions.push({
      ...decision,
      artifactSha256: canonicalDecisionSha256(decision),
    });
    fragments.set(spec.code, fragment);
  }
  const parsed = new Map(
    [...fragments].map(([code, value]) => [
      code,
      parseEs2015DecisionFragment(json(value), code),
    ]),
  );
  assertSame(
    json(
      productionManifest().rangeProfiles.find(
        (profile) => profile.name === 'decision:UA',
      )?.generatedPaths,
    ),
    json(DECISION_GENERATED_PATHS),
  );
  const validated = validateDecisionFragments(productionManifest(), parsed, {
    allowPendingReview: false,
  });
  return new Map(
    decisions.map((spec) => {
      const decision = validated.get(spec.path);
      if (decision === undefined) {
        throw new Error(`validated provenance is missing ${spec.path}`);
      }
      return [spec.path, Object.freeze({ code: spec.code, ...decision })];
    }),
  );
}

/**
 * @param {{
 *   code: string,
 *   path: string,
 *   finalPartition: string,
 *   finalStatus: string,
 *   metadata?: {
 *     es5id: string | null,
 *     es6id: string | null,
 *     esid: string | null,
 *     features: readonly string[],
 *     includeFeatures: readonly string[],
 *     includes: readonly string[],
 *     flags: readonly string[],
 *   },
 * }} spec
 */
function reviewedProvenanceStub(spec) {
  const batch = productionManifest().batches.find(
    (entry) => entry.code === spec.code,
  );
  const ledgerEntry = batch?.entries.find((entry) => entry.path === spec.path);
  if (ledgerEntry === undefined) {
    throw new Error(
      `expected reviewed provenance ledger entry for ${spec.code} ${spec.path}`,
    );
  }
  const decision = reviewedDecisionWithoutHash(spec);
  return new Map([
    [
      spec.path,
      Object.freeze({
        code: spec.code,
        path: spec.path,
        variants: ledgerEntry.variants,
        priorClass: ledgerEntry.priorClass,
        finalPartition: spec.finalPartition,
        finalStatus: spec.finalStatus,
        metadata: spec.metadata ?? decision.metadata,
        artifactSha256: canonicalDecisionSha256(decision),
      }),
    ],
  ]);
}

/**
 * @param {() => Promise<unknown>} action
 * @returns {Promise<Error>}
 */
async function rejected(action) {
  try {
    await action();
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error('Expected rejection');
}

/**
 * @param {{
 *   timezone?: string,
 *   files?: ReadonlyMap<string, string>,
 *   decisionDirectoryEntries?: readonly string[],
 * }} [options]
 */
function provenanceCheckDependencies(options = {}) {
  const manifest = productionManifest();
  /** @type {Map<string, string>} */
  const files = new Map([
    [TAXONOMY_PATH, PRODUCTION_TAXONOMY_TEXT],
    [ES2015_PROVENANCE_FILE, approvedProvenanceManifestText()],
  ]);
  for (const code of ES2015_PROVENANCE_DECISION_CODES) {
    files.set(
      `${PROVENANCE_DECISIONS_DIRECTORY}/${code}.json`,
      emptyDecisionFragmentText(manifest, code),
    );
  }

  for (const [path, text] of options.files?.entries() ?? []) {
    files.set(path, text);
  }
  /** @type {string[]} */
  const writes = [];
  /** @type {string[]} */
  const stdout = [];
  /** @type {string[]} */
  const stderr = [];
  const decisionDirectoryEntries =
    options.decisionDirectoryEntries ??
    [...files.keys()]
      .filter((path) => path.startsWith(`${PROVENANCE_DECISIONS_DIRECTORY}/`))
      .map((path) => path.slice(PROVENANCE_DECISIONS_DIRECTORY.length + 1))
      .sort();

  return {
    environment: /** @type {Record<string, string | undefined>} */ ({
      TZ: options.timezone ?? 'UTC',
    }),
    readFile: async (/** @type {string} */ path) => {
      const value = files.get(path);
      if (value === undefined) {
        const error = new Error(`missing fixture file ${path}`);
        Object.assign(error, { code: 'ENOENT' });
        throw error;
      }
      return value;
    },
    readdir: async (/** @type {string} */ path) => {
      if (path !== PROVENANCE_DECISIONS_DIRECTORY) {
        const error = new Error(`missing fixture directory ${path}`);
        Object.assign(error, { code: 'ENOENT' });
        throw error;
      }
      return decisionDirectoryEntries;
    },
    writeFile: async (
      /** @type {string} */ path,
      /** @type {string} */ text,
    ) => {
      writes.push(path);
      files.set(path, text);
    },
    stdout: (/** @type {string} */ text) => stdout.push(text),
    stderr: (/** @type {string} */ text) => stderr.push(text),
    files,
    writes,
    outputs: { stdout, stderr },
  };
}

/** @param {readonly { status: string, path: string, sourcePath?: string }[]} changes */
function rangeDiffText(changes) {
  const fields = [];
  for (const change of changes) {
    fields.push(change.status);
    if (change.status.startsWith('R') || change.status.startsWith('C')) {
      fields.push(change.sourcePath ?? 'source.js', change.path);
    } else {
      fields.push(change.path);
    }
  }
  return fields.length === 0 ? '' : `${fields.join('\0')}\0`;
}

/** @param {string} profile */
function rangeMarker(profile) {
  return `<!-- es2015-provenance-pr parent:T1 parent-issue:75 profile:${profile} base-ledger-sha256:${APPROVED_PRODUCTION_FOUNDATION.baseLedger.pathSha256} -->`;
}

function maintenanceRangeMarker() {
  return rangeMarker('foundation-maintenance');
}

function foundationBootstrapManifestText() {
  const manifest = JSON.parse(approvedProvenanceManifestText());
  manifest.rangeProfiles = manifest.rangeProfiles.filter(
    (/** @type {{ name: string }} */ profile) =>
      profile.name !== 'foundation-maintenance' &&
      profile.name !== 'maintenance:issue77-lexical',
  );
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  assertSame(
    createHash('sha256').update(text).digest('hex'),
    FOUNDATION_BOOTSTRAP_MANIFEST_SHA256,
  );
  return text;
}

/**
 * @param {string} profile
 * @param {{ baseSha?: string, headSha?: string, marker?: string }} options
 */
function rangeArguments(profile, options = {}) {
  return [
    '--check-range',
    `--base=${options.baseSha ?? RANGE_BASE_SHA}`,
    `--head=${options.headSha ?? RANGE_HEAD_SHA}`,
    `--profile=${profile}`,
    `--marker=${options.marker ?? rangeMarker(profile)}`,
  ];
}

/**
 * @param {{
 *   changes: readonly { status: string, path: string, sourcePath?: string }[],
 *   baseHasFoundation?: boolean,
 *   baseManifestText?: string | null,
 *   baseSha?: string,
 *   headManifestText?: string,
 *   headSha?: string,
 *   headFiles?: ReadonlyMap<string, string>,
 *   mergeBase?: string,
 * }} options
 */
function rangeCheckDependencies(options) {
  const dependencies = provenanceCheckDependencies();
  const baseSha = options.baseSha ?? RANGE_BASE_SHA;
  const headSha = options.headSha ?? RANGE_HEAD_SHA;
  const headFiles = new Map(dependencies.files);
  for (const path of FOUNDATION_ALLOWED_PATHS) {
    if (!headFiles.has(path)) headFiles.set(path, `fixture ${path}\n`);
  }
  if (options.headManifestText !== undefined) {
    headFiles.set(ES2015_PROVENANCE_FILE, options.headManifestText);
  }
  for (const [path, text] of options.headFiles ?? []) {
    headFiles.set(path, text);
  }
  const baseFiles = new Map();
  const baseManifestText =
    options.baseManifestText === undefined
      ? options.baseHasFoundation === true
        ? approvedProvenanceManifestText()
        : null
      : options.baseManifestText;
  if (baseManifestText !== null) {
    baseFiles.set(ES2015_PROVENANCE_FILE, baseManifestText);
  }
  for (const path of FOUNDATION_DELETIONS) {
    baseFiles.set(path, `removed fixture ${path}\n`);
  }
  return {
    ...dependencies,
    files: headFiles,
    resolveCommit: async (/** @type {string} */ revision) => {
      if (revision !== baseSha && revision !== headSha) {
        throw new Error(`unexpected fixture commit ${revision}`);
      }
      return revision;
    },
    mergeBase: async (
      /** @type {string} */ base,
      /** @type {string} */ head,
    ) => {
      if (base !== baseSha || head !== headSha) {
        throw new Error(`unexpected fixture range ${base}..${head}`);
      }
      return options.mergeBase ?? baseSha;
    },
    gitDiff: async (/** @type {string} */ base, /** @type {string} */ head) => {
      if (base !== baseSha || head !== headSha) {
        throw new Error(`unexpected fixture range ${base}..${head}`);
      }
      return rangeDiffText(options.changes);
    },
    readGitFile: async (
      /** @type {string} */ revision,
      /** @type {string} */ path,
    ) => {
      if (revision === baseSha) return baseFiles.get(path) ?? null;
      if (revision === headSha) return headFiles.get(path) ?? null;
      throw new Error(`unexpected fixture commit ${revision}`);
    },
  };
}

export default [
  {
    name: 'ES2015 provenance exports the approved contract constants',
    run: () => {
      assertSame(ES2015_PROVENANCE_VERSION, 2);
      assertSame(
        ES2015_PROVENANCE_FILE,
        'tools/test262/es2015-provenance.json',
      );
      assertSame(
        json(ES2015_PROVENANCE_DECISION_CODES),
        json([
          'UA',
          'UB',
          'UL1',
          'UL2',
          'UL3',
          'UL4',
          'US1',
          'US2',
          'US3',
          'US4',
          'US5',
          'US6',
          'US7',
        ]),
      );
      assertSame(productionManifest().taxonomyBaseline, TAXONOMY_BASELINE);
      const manifest = productionManifest();
      const foundationProfile = manifest.rangeProfiles.find(
        (profile) => profile.name === 'foundation',
      );
      const maintenanceProfile = manifest.rangeProfiles.find(
        (profile) => profile.name === 'foundation-maintenance',
      );
      const issue77MaintenanceProfile = manifest.rangeProfiles.find(
        (profile) => profile.name === 'maintenance:issue77-lexical',
      );
      const decisionProfiles = manifest.rangeProfiles.filter((profile) =>
        profile.name.startsWith('decision:'),
      );
      assertSame(
        json(manifest.rangeProfiles.map((profile) => profile.name)),
        json([
          'foundation',
          'foundation-maintenance',
          'maintenance:issue77-lexical',
          ...ES2015_PROVENANCE_DECISION_CODES.map((code) => `decision:${code}`),
        ]),
      );
      assertSame(
        json(maintenanceProfile),
        json(CAPTURED_FOUNDATION_MAINTENANCE_RANGE_PROFILE),
      );
      assertSame(
        json(issue77MaintenanceProfile),
        json(CAPTURED_ISSUE_77_LEXICAL_MAINTENANCE_RANGE_PROFILE),
      );
      assertSame(
        json(foundationProfile),
        json(CAPTURED_FOUNDATION_RANGE_PROFILE),
      );
      assertSame(
        json(decisionProfiles),
        json(
          ES2015_PROVENANCE_DECISION_CODES.map((code) =>
            capturedDecisionRangeProfile(code),
          ),
        ),
      );
    },
  },
  {
    name: 'ES2015 provenance rejects unreviewed manifest and decision fragment JSON',
    run: () => {
      const manifestKeysError = assertThrows(
        () => parseEs2015ProvenanceManifest('{}'),
        Es2015ProvenanceError,
      );
      assertSame(
        manifestKeysError.message,
        'tools/test262/es2015-provenance.json must contain exact keys',
      );
      const fragmentKeysError = assertThrows(
        () => parseEs2015DecisionFragment('{"version":1}', 'UA'),
        Es2015ProvenanceError,
      );
      assertSame(
        fragmentKeysError.message,
        'UA decision fragment must contain exact keys',
      );

      const validManifest = validManifestValue();
      const badVersion = clone(validManifest);
      badVersion.version = 3;
      assertSame(
        assertThrows(
          () => parseEs2015ProvenanceManifest(json(badVersion)),
          Es2015ProvenanceError,
        ).message,
        `${ES2015_PROVENANCE_FILE} must declare version ${ES2015_PROVENANCE_VERSION}`,
      );

      const badTaxonomyBaseline = clone(validManifest);
      badTaxonomyBaseline.taxonomyBaseline = '0'.repeat(40);
      assertSame(
        assertThrows(
          () => parseEs2015ProvenanceManifest(json(badTaxonomyBaseline)),
          Es2015ProvenanceError,
        ).message,
        `${ES2015_PROVENANCE_FILE} must retain the reviewed jsjs taxonomy baseline`,
      );

      const badRepository = clone(validManifest);
      badRepository.repository = 'https://example.invalid/test262.git';
      assertSame(
        assertThrows(
          () => parseEs2015ProvenanceManifest(json(badRepository)),
          Es2015ProvenanceError,
        ).message,
        `${ES2015_PROVENANCE_FILE} must retain the reviewed Test262 repository and revision`,
      );

      const badSpecification = clone(validManifest);
      badSpecification.specification.source = 'https://example.invalid/spec';
      assertSame(
        assertThrows(
          () => parseEs2015ProvenanceManifest(json(badSpecification)),
          Es2015ProvenanceError,
        ).message,
        `${ES2015_PROVENANCE_FILE} must retain the reviewed Sixth Edition source identity`,
      );

      const badParent = clone(validManifest);
      badParent.parent.issue = 74;
      assertSame(
        assertThrows(
          () => parseEs2015ProvenanceManifest(json(badParent)),
          Es2015ProvenanceError,
        ).message,
        `${ES2015_PROVENANCE_FILE} must retain parent T1 / #75`,
      );

      const badCode = clone(validManifest);
      badCode.batches[0].code = 'UX';
      assertSame(
        assertThrows(
          () => parseEs2015ProvenanceManifest(json(badCode)),
          Es2015ProvenanceError,
        ).message,
        `${ES2015_PROVENANCE_FILE} batch codes must be approved U* decision codes`,
      );

      const duplicatePaths = clone(validManifest);
      duplicatePaths.baseLedger.paths = [
        'test/annexB/a-first.js',
        'test/annexB/a-first.js',
      ];
      assertSame(
        assertThrows(
          () => parseEs2015ProvenanceManifest(json(duplicatePaths)),
          Es2015ProvenanceError,
        ).message,
        `${ES2015_PROVENANCE_FILE} baseLedger.paths must be code-unit sorted unique paths`,
      );

      const validFragment = validDecisionFragmentValue();
      const badFragmentRevision = clone(validFragment);
      badFragmentRevision.revision = '0123456789012345678901234567890123456789';
      assertSame(
        assertThrows(
          () => parseEs2015DecisionFragment(json(badFragmentRevision), 'UL3'),
          Es2015ProvenanceError,
        ).message,
        'UL3 decision fragment must retain the reviewed Test262 repository and revision',
      );

      const badFragmentSpecification = clone(validFragment);
      badFragmentSpecification.specification.sourceSha256 = '0'.repeat(64);
      assertSame(
        assertThrows(
          () =>
            parseEs2015DecisionFragment(json(badFragmentSpecification), 'UL3'),
          Es2015ProvenanceError,
        ).message,
        'UL3 decision fragment must retain the reviewed Sixth Edition source identity',
      );

      const badFragmentParent = clone(validFragment);
      badFragmentParent.parent.code = 'U9';
      assertSame(
        assertThrows(
          () => parseEs2015DecisionFragment(json(badFragmentParent), 'UL3'),
          Es2015ProvenanceError,
        ).message,
        'UL3 decision fragment must retain parent T1 / #75',
      );

      const badExpectedCode = clone(validFragment);
      badExpectedCode.code = 'UX';
      assertSame(
        assertThrows(
          () => parseEs2015DecisionFragment(json(badExpectedCode), 'UX'),
          Es2015ProvenanceError,
        ).message,
        'UX is not an approved ES2015 provenance decision code',
      );

      const duplicateFeatures = clone(validFragment);
      duplicateFeatures.decisions[0].metadata.features = ['let', 'let'];
      assertSame(
        assertThrows(
          () => parseEs2015DecisionFragment(json(duplicateFeatures), 'UL3'),
          Es2015ProvenanceError,
        ).message,
        'UL3 decision for test/language/example.js metadata.features must be code-unit sorted unique strings',
      );
    },
  },
  {
    name: 'ES2015 provenance validates deterministic batch partitions and ledgers',
    run: () => {
      const classifications = productionClassifications();
      const manifest = productionManifest();
      validateProvenanceFoundation(manifest, classifications);

      const unsortedBase = clone(manifest);
      unsortedBase.baseLedger.paths = [
        ...unsortedBase.baseLedger.paths,
      ].reverse();
      assertSame(
        assertThrows(
          () => validateProvenanceFoundation(unsortedBase, classifications),
          Es2015ProvenanceError,
        ).message,
        `${ES2015_PROVENANCE_FILE} base ledger must remain code-unit sorted`,
      );
      const duplicateBatchPath = clone(manifest);
      duplicateBatchPath.batches[0].entries = [
        clone(duplicateBatchPath.batches[0].entries[0]),
        clone(duplicateBatchPath.batches[0].entries[0]),
        clone(duplicateBatchPath.batches[0].entries[0]),
      ];
      assertSame(
        assertThrows(
          () =>
            validateProvenanceFoundation(duplicateBatchPath, classifications),
          Es2015ProvenanceError,
        ).message,
        'UA batch ledger must not repeat base paths',
      );

      const overlap = clone(manifest);
      const sharedEntry = clone(overlap.batches[0].entries[0]);
      overlap.batches[1].entries = [sharedEntry];
      overlap.batches[1].rootCount = 1;
      overlap.batches[1].variantCount = sharedEntry.variants;
      overlap.batches[1].pathSha256 = sha256(`${sharedEntry.path}\n`);
      assertSame(
        assertThrows(
          () => validateProvenanceFoundation(overlap, classifications),
          Es2015ProvenanceError,
        ).message,
        `Base path ${sharedEntry.path} appears in more than one provenance batch`,
      );

      const missingBase = clone(manifest);
      const removedBase = missingBase.baseLedger.paths[1];
      missingBase.baseLedger.paths = [missingBase.baseLedger.paths[0]];
      missingBase.baseLedger.rootCount = 1;
      missingBase.baseLedger.variantCount =
        manifest.baseLedger.variantCount -
        manifest.batches[0].entries[1].variants;
      missingBase.baseLedger.pathSha256 = sha256(
        `${missingBase.baseLedger.paths[0]}\n`,
      );
      assertSame(
        assertThrows(
          () => validateProvenanceFoundation(missingBase, classifications),
          Es2015ProvenanceError,
        ).message,
        `UA batch ledger has unexpected non-base path ${removedBase}`,
      );

      const unexpectedBase = clone(manifest);
      unexpectedBase.baseLedger.paths = [
        ...unexpectedBase.baseLedger.paths,
        'test/annexB/unexpected.js',
      ].sort();
      unexpectedBase.baseLedger.rootCount += 1;
      unexpectedBase.baseLedger.variantCount += 1;
      unexpectedBase.baseLedger.pathSha256 = sha256(
        `${unexpectedBase.baseLedger.paths.join('\n')}\n`,
      );
      assertSame(
        assertThrows(
          () => validateProvenanceFoundation(unexpectedBase, classifications),
          Es2015ProvenanceError,
        ).message,
        'Base path test/annexB/unexpected.js does not appear in any provenance batch',
      );

      const wrongBatchRoots = clone(manifest);
      wrongBatchRoots.batches[0].rootCount = 99;
      assertSame(
        assertThrows(
          () => validateProvenanceFoundation(wrongBatchRoots, classifications),
          Es2015ProvenanceError,
        ).message,
        'UA root count does not match its reviewed ledger',
      );

      const wrongBatchVariants = clone(manifest);
      wrongBatchVariants.batches[0].variantCount = 99;
      assertSame(
        assertThrows(
          () =>
            validateProvenanceFoundation(wrongBatchVariants, classifications),
          Es2015ProvenanceError,
        ).message,
        'UA variant count does not match its reviewed ledger',
      );

      const wrongBatchHash = clone(manifest);
      wrongBatchHash.batches[0].pathSha256 = '0'.repeat(64);
      assertSame(
        assertThrows(
          () => validateProvenanceFoundation(wrongBatchHash, classifications),
          Es2015ProvenanceError,
        ).message,
        'UA path ledger SHA-256 does not match its reviewed bytes',
      );

      const wrongBaseHash = clone(manifest);
      wrongBaseHash.baseLedger.pathSha256 = '0'.repeat(64);
      assertSame(
        assertThrows(
          () => validateProvenanceFoundation(wrongBaseHash, classifications),
          Es2015ProvenanceError,
        ).message,
        `${ES2015_PROVENANCE_FILE} base ledger SHA-256 does not match its reviewed bytes`,
      );

      const wrongSelector = clone(manifest);
      wrongSelector.batches[0].selector = 'test/built-ins/**';
      assertSame(
        assertThrows(
          () => validateProvenanceFoundation(wrongSelector, classifications),
          Es2015ProvenanceError,
        ).message,
        'UA must retain selector test/annexB/**',
      );
    },
  },
  {
    name: 'ES2015 provenance pins immutable production entry ledgers without host filesystem reads',
    run: () => {
      const moduleSource = readFileSyncText(
        new URL('../../tools/test262/es2015-provenance.js', import.meta.url),
        'utf8',
      );
      assertSame(moduleSource.includes('node:fs'), false);

      const classifications = productionClassifications();
      const manifest = productionManifest();
      validateProvenanceFoundation(manifest, classifications);
      assertSame(
        manifest.baseLedger.rootCount,
        APPROVED_PRODUCTION_FOUNDATION.baseLedger.rootCount,
      );
      assertSame(
        manifest.baseLedger.variantCount,
        APPROVED_PRODUCTION_FOUNDATION.baseLedger.variantCount,
      );
      assertSame(
        manifest.baseLedger.pathSha256,
        APPROVED_PRODUCTION_FOUNDATION.baseLedger.pathSha256,
      );

      for (const code of ES2015_PROVENANCE_DECISION_CODES) {
        const batch = manifest.batches.find(
          (/** @type {ProvenanceBatch} */ entry) => entry.code === code,
        );
        const expected = APPROVED_PRODUCTION_FOUNDATION.batches[code];
        if (batch === undefined || expected === undefined) {
          throw new Error(`missing approved production batch ${code}`);
        }
        assertSame(
          batch.rootCount,
          expected.rootCount,
          `${code} root count must stay immutable`,
        );
        assertSame(
          batch.variantCount,
          expected.variantCount,
          `${code} variant count must stay immutable`,
        );
        assertSame(
          batch.pathSha256,
          expected.pathSha256,
          `${code} path hash must stay immutable`,
        );
        assertSame(
          batch.entryLedgerSha256,
          expected.entryLedgerSha256,
          `${code} entry ledger hash must stay immutable`,
        );
        assertSame(
          entryLedgerSha256(batch.entries),
          expected.entryLedgerSha256,
          `${code} checked-in taxonomy must derive the pinned entry ledger hash`,
        );
      }

      const alteredClassifications = classifications.filter(
        (/** @type {ClassificationRecord} */ record) =>
          record.path !==
          'test/annexB/built-ins/RegExp/RegExp-invalid-control-escape-character-class-range.js',
      );
      const alteredManifest = buildProvenanceFoundation(alteredClassifications);
      assertSame(
        assertThrows(
          () =>
            validateProvenanceFoundation(
              alteredManifest,
              alteredClassifications,
            ),
          Es2015ProvenanceError,
        ).message,
        `${ES2015_PROVENANCE_FILE} base ledger root count does not match the approved immutable ledger`,
      );
    },
  },
  {
    name: 'ES2015 provenance pins reviewed blocker-to-roadmap-owner pairs',
    run: () => {
      const manifest = productionManifest();
      assertSame(
        json(
          Object.fromEntries(
            manifest.blockerOwners.map((entry) => [
              entry.blocker,
              entry.issues,
            ]),
          ),
        ),
        json(REVIEWED_BLOCKER_OWNERS),
      );

      for (const [blocker, issues] of Object.entries(REVIEWED_BLOCKER_OWNERS)) {
        for (const issue of issues) {
          const fragmentValue = clone(productionDecisionFragmentValue());
          fragmentValue.decisions[0].finalStatus = `blocked:${blocker}`;
          fragmentValue.decisions[0].destination = { blocker, issue };
          refreshFragmentHash(fragmentValue);
          validateDecisionFragments(
            manifest,
            {
              UL3: parseEs2015DecisionFragment(json(fragmentValue), 'UL3'),
            },
            { allowPendingReview: false },
          );
        }

        const wrongIssue = issues.includes(76) ? 77 : 76;
        const wrongPair = clone(productionDecisionFragmentValue());
        wrongPair.decisions[0].finalStatus = `blocked:${blocker}`;
        wrongPair.decisions[0].destination = {
          blocker,
          issue: wrongIssue,
        };
        refreshFragmentHash(wrongPair);
        assertSame(
          assertThrows(
            () =>
              validateDecisionFragments(
                manifest,
                {
                  UL3: parseEs2015DecisionFragment(json(wrongPair), 'UL3'),
                },
                { allowPendingReview: false },
              ),
            Es2015ProvenanceError,
          ).message,
          `UL3 decision for ${PRODUCTION_UL3_PATH} blocker ${blocker} is not owned by issue #${wrongIssue}`,
        );
      }

      const trackingIssue = clone(productionDecisionFragmentValue());
      trackingIssue.decisions[0].destination.issue = 98;
      refreshFragmentHash(trackingIssue);
      assertSame(
        assertThrows(
          () =>
            validateDecisionFragments(
              manifest,
              {
                UL3: parseEs2015DecisionFragment(json(trackingIssue), 'UL3'),
              },
              { allowPendingReview: false },
            ),
          Es2015ProvenanceError,
        ).message,
        `UL3 decision for ${PRODUCTION_UL3_PATH} blocker remaining-language-runtime-semantics is not owned by issue #98`,
      );
    },
  },
  {
    name: 'ES2015 provenance canonicalizes and validates reviewed decision fragments',
    run: () => {
      const manifest = productionManifest();
      const fragment = parseEs2015DecisionFragment(
        json(productionDecisionFragmentValue()),
        'UL3',
      );
      const validated = validateDecisionFragments(
        manifest,
        new Map([['UL3', fragment]]),
        {
          allowPendingReview: false,
        },
      );
      const decision = validated.get(PRODUCTION_UL3_PATH);
      if (decision === undefined) {
        throw new Error(
          'validated decisions must include the exact batch path',
        );
      }
      assertSame(
        decision.artifactSha256,
        canonicalDecisionSha256(productionDecisionWithoutHash()),
      );
      assertSame(Object.isFrozen(decision), true);
      assertSame(Object.isFrozen(decision.metadata), true);
      assertSame(Object.isFrozen(decision.metadata.features), true);
      assertSame(Object.isFrozen(fragment.decisions), true);

      const historyOnly = clone(productionDecisionFragmentValue());
      historyOnly.decisions[0].evidenceKind = 'history-only';
      refreshFragmentHash(historyOnly);
      assertSame(
        assertThrows(
          () =>
            validateDecisionFragments(
              manifest,
              { UL3: parseEs2015DecisionFragment(json(historyOnly), 'UL3') },
              { allowPendingReview: false },
            ),
          Es2015ProvenanceError,
        ).message,
        `UL3 decision for ${PRODUCTION_UL3_PATH} cannot rely on history alone`,
      );

      const missingIncludeClosure = clone(productionDecisionFragmentValue());
      delete missingIncludeClosure.decisions[0].metadata.includeFeatures;
      assertSame(
        assertThrows(
          () => parseEs2015DecisionFragment(json(missingIncludeClosure), 'UL3'),
          Es2015ProvenanceError,
        ).message,
        `UL3 decision for ${PRODUCTION_UL3_PATH} metadata must contain exact keys`,
      );

      const nonUtcReview = clone(productionDecisionFragmentValue());
      nonUtcReview.decisions[0].review.reviewedAt = '2026-08-19T17:00:00-07:00';
      refreshFragmentHash(nonUtcReview);
      assertSame(
        assertThrows(
          () =>
            validateDecisionFragments(
              manifest,
              { UL3: parseEs2015DecisionFragment(json(nonUtcReview), 'UL3') },
              { allowPendingReview: false },
            ),
          Es2015ProvenanceError,
        ).message,
        `UL3 decision for ${PRODUCTION_UL3_PATH} review.reviewedAt must be a canonical UTC RFC3339 timestamp`,
      );

      for (const reviewedAt of [
        '0000-01-01T00:00:00Z',
        '2026-02-30T00:00:00Z',
        '2026-13-01T00:00:00Z',
        '2026-08-19T24:00:00Z',
        '2026-08-19T23:60:00Z',
        '2026-08-19T23:59:60Z',
        '2026-08-19T00:00:00.000Z',
        '2026-08-19t00:00:00z',
      ]) {
        const invalidReviewTime = clone(productionDecisionFragmentValue());
        invalidReviewTime.decisions[0].review.reviewedAt = reviewedAt;
        refreshFragmentHash(invalidReviewTime);
        assertSame(
          assertThrows(
            () =>
              validateDecisionFragments(
                manifest,
                {
                  UL3: parseEs2015DecisionFragment(
                    json(invalidReviewTime),
                    'UL3',
                  ),
                },
                { allowPendingReview: false },
              ),
            Es2015ProvenanceError,
          ).message,
          `UL3 decision for ${PRODUCTION_UL3_PATH} review.reviewedAt must be a canonical UTC RFC3339 timestamp`,
          reviewedAt,
        );
      }

      const malformedReviewUrl = clone(productionDecisionFragmentValue());
      malformedReviewUrl.decisions[0].review.artifact =
        'https://example.com/review';
      refreshFragmentHash(malformedReviewUrl);
      assertSame(
        assertThrows(
          () =>
            validateDecisionFragments(
              manifest,
              {
                UL3: parseEs2015DecisionFragment(
                  json(malformedReviewUrl),
                  'UL3',
                ),
              },
              { allowPendingReview: false },
            ),
          Es2015ProvenanceError,
        ).message,
        `UL3 decision for ${PRODUCTION_UL3_PATH} review.artifact must be a reviewed GitHub jsjs URL`,
      );

      const selfHashDrift = clone(productionDecisionFragmentValue());
      selfHashDrift.decisions[0].artifactSha256 = '0'.repeat(64);
      assertSame(
        assertThrows(
          () =>
            validateDecisionFragments(
              manifest,
              { UL3: parseEs2015DecisionFragment(json(selfHashDrift), 'UL3') },
              { allowPendingReview: false },
            ),
          Es2015ProvenanceError,
        ).message,
        `UL3 decision for ${PRODUCTION_UL3_PATH} artifactSha256 does not match the canonical record`,
      );

      const invalidPair = clone(productionDecisionFragmentValue());
      invalidPair.decisions[0].finalPartition = 'annex-b';
      refreshFragmentHash(invalidPair);
      assertSame(
        assertThrows(
          () =>
            validateDecisionFragments(
              manifest,
              { UL3: parseEs2015DecisionFragment(json(invalidPair), 'UL3') },
              { allowPendingReview: false },
            ),
          Es2015ProvenanceError,
        ).message,
        `UL3 decision for ${PRODUCTION_UL3_PATH} has an invalid final partition/status pair`,
      );

      const unknownBlocker = clone(productionDecisionFragmentValue());
      unknownBlocker.decisions[0].finalStatus = 'blocked:unknown-gap';
      unknownBlocker.decisions[0].destination.blocker = 'unknown-gap';
      refreshFragmentHash(unknownBlocker);
      assertSame(
        assertThrows(
          () =>
            validateDecisionFragments(
              manifest,
              { UL3: parseEs2015DecisionFragment(json(unknownBlocker), 'UL3') },
              { allowPendingReview: false },
            ),
          Es2015ProvenanceError,
        ).message,
        `UL3 decision for ${PRODUCTION_UL3_PATH} names unknown blocker unknown-gap`,
      );

      const missingDestinationIssue = clone(productionDecisionFragmentValue());
      missingDestinationIssue.decisions[0].destination.issue = null;
      refreshFragmentHash(missingDestinationIssue);
      assertSame(
        assertThrows(
          () =>
            validateDecisionFragments(
              manifest,
              {
                UL3: parseEs2015DecisionFragment(
                  json(missingDestinationIssue),
                  'UL3',
                ),
              },
              { allowPendingReview: false },
            ),
          Es2015ProvenanceError,
        ).message,
        `UL3 decision for ${PRODUCTION_UL3_PATH} requires a destination issue`,
      );

      const whitespaceClause = clone(productionDecisionFragmentValue());
      whitespaceClause.decisions[0].specification.clause = '   ';
      assertSame(
        assertThrows(
          () => parseEs2015DecisionFragment(json(whitespaceClause), 'UL3'),
          Es2015ProvenanceError,
        ).message,
        `UL3 decision for ${PRODUCTION_UL3_PATH} specification must name a reviewed clause`,
      );

      const whitespaceAnchor = clone(productionDecisionFragmentValue());
      whitespaceAnchor.decisions[0].evidenceKind = 'sixth-edition-anchor';
      whitespaceAnchor.decisions[0].specification.clause = null;
      whitespaceAnchor.decisions[0].specification.anchor = '   ';
      assertSame(
        assertThrows(
          () => parseEs2015DecisionFragment(json(whitespaceAnchor), 'UL3'),
          Es2015ProvenanceError,
        ).message,
        `UL3 decision for ${PRODUCTION_UL3_PATH} specification must name a reviewed anchor`,
      );

      const strictPendingReviewer = clone(productionDecisionFragmentValue());
      strictPendingReviewer.decisions[0].review = {
        reviewer: 'pending',
        reviewedAt: 'pending',
        artifact: 'pending',
      };
      refreshFragmentHash(strictPendingReviewer);
      assertSame(
        assertThrows(
          () =>
            validateDecisionFragments(
              manifest,
              {
                UL3: parseEs2015DecisionFragment(
                  json(strictPendingReviewer),
                  'UL3',
                ),
              },
              { allowPendingReview: false },
            ),
          Es2015ProvenanceError,
        ).message,
        `UL3 decision for ${PRODUCTION_UL3_PATH} review.reviewer must not be pending in strict validation`,
      );

      const partialPendingReview = clone(productionDecisionFragmentValue());
      partialPendingReview.decisions[0].review.reviewer = 'pending';
      refreshFragmentHash(partialPendingReview);
      assertSame(
        assertThrows(
          () => parseEs2015DecisionFragment(json(partialPendingReview), 'UL3'),
          Es2015ProvenanceError,
        ).message,
        `UL3 decision for ${PRODUCTION_UL3_PATH} pending review fields must all be pending`,
      );

      const pendingDraft = clone(productionDecisionFragmentValue());
      pendingDraft.decisions[0].review = {
        reviewer: 'pending',
        reviewedAt: 'pending',
        artifact: 'pending',
      };
      refreshFragmentHash(pendingDraft);
      const draftValidated = validateDecisionFragments(
        manifest,
        { UL3: parseEs2015DecisionFragment(json(pendingDraft), 'UL3') },
        { allowPendingReview: true },
      );
      assertSame(
        draftValidated.get(PRODUCTION_UL3_PATH)?.review.reviewer,
        'pending',
      );
    },
  },
  {
    name: 'ES2015 provenance fails closed before complete decisions and rendering',
    run: () => {
      const fragment = parseEs2015DecisionFragment(
        json(productionDecisionFragmentValue()),
        'UL3',
      );
      const tamperedPriorClass = tamperedPriorClassManifest();
      const priorClassMessage = `${tamperedPriorClass.code} entry ledger SHA-256 does not match the approved immutable ledger`;
      assertSame(
        assertThrows(
          () =>
            validateProvenanceFoundation(
              tamperedPriorClass.manifest,
              tamperedPriorClass.classifications,
            ),
          Es2015ProvenanceError,
        ).message,
        priorClassMessage,
      );
      assertSame(
        assertThrows(
          () =>
            validateDecisionFragments(
              tamperedPriorClass.manifest,
              { UL3: fragment },
              {
                allowPendingReview: false,
              },
            ),
          Es2015ProvenanceError,
        ).message,
        priorClassMessage,
      );
      assertSame(
        assertThrows(
          () =>
            renderBatchLedger(
              tamperedPriorClass.manifest,
              tamperedPriorClass.code,
            ),
          Es2015ProvenanceError,
        ).message,
        priorClassMessage,
      );
      assertSame(
        assertThrows(
          () =>
            renderProvenanceIssueBody(
              tamperedPriorClass.manifest,
              tamperedPriorClass.code,
              COMPLETE_ISSUE_MAP,
            ),
          Es2015ProvenanceError,
        ).message,
        priorClassMessage,
      );

      const redistributedVariants = redistributedVariantsManifest();
      const variantMessage = `${redistributedVariants.code} entry ledger SHA-256 does not match the approved immutable ledger`;
      assertSame(
        assertThrows(
          () =>
            validateProvenanceFoundation(
              redistributedVariants.manifest,
              redistributedVariants.classifications,
            ),
          Es2015ProvenanceError,
        ).message,
        variantMessage,
      );
      assertSame(
        assertThrows(
          () =>
            validateDecisionFragments(
              redistributedVariants.manifest,
              { UL3: fragment },
              {
                allowPendingReview: false,
              },
            ),
          Es2015ProvenanceError,
        ).message,
        variantMessage,
      );
      assertSame(
        assertThrows(
          () =>
            renderBatchLedger(
              redistributedVariants.manifest,
              redistributedVariants.code,
            ),
          Es2015ProvenanceError,
        ).message,
        variantMessage,
      );
      assertSame(
        assertThrows(
          () =>
            renderProvenanceIssueBody(
              redistributedVariants.manifest,
              redistributedVariants.code,
              COMPLETE_ISSUE_MAP,
            ),
          Es2015ProvenanceError,
        ).message,
        variantMessage,
      );

      assertSame(
        assertThrows(
          () =>
            validateDecisionFragments(
              productionManifest(),
              {},
              {
                allowPendingReview: false,
                requireCompleteCodes: ['UL3'],
              },
            ),
          Es2015ProvenanceError,
        ).message,
        'UL3 decision fragment is required when complete-code validation is enabled',
      );

      const incompleteCode = parseEs2015DecisionFragment(
        json({ ...productionDecisionFragmentValue(), decisions: [] }),
        'UL3',
      );
      assertSame(
        assertThrows(
          () =>
            validateDecisionFragments(
              productionManifest(),
              { UL3: incompleteCode },
              {
                allowPendingReview: true,
                requireCompleteCodes: ['UL3'],
              },
            ),
          Es2015ProvenanceError,
        ).message,
        'UL3 must contain reviewed decisions for every ledger path',
      );
    },
  },
  {
    name: 'ES2015 taxonomy keeps empty reviewed provenance byte-identical',
    run: () => {
      const inventory = buildEs2015Inventory({
        roots: [
          {
            path: 'test/language/reviewed-core.js',
            metadata: {
              description: 'A selected ES2015 root.',
              es5id: '15.1',
              es6id: null,
              esid: null,
              features: [],
              flags: [],
              includes: [],
            },
          },
          {
            path: 'test/language/reviewed-unknown.js',
            metadata: {
              description: 'An unchanged unknown root.',
              es5id: null,
              es6id: null,
              esid: null,
              features: [],
              flags: [],
              includes: [],
            },
          },
        ],
      });
      const selected = new Set(['test/language/reviewed-core.js']);
      const selectedResults = singleExecutionResult(
        'test/language/reviewed-core.js',
      );
      const withoutReviewed = classifyEs2015Inventory({
        policy: classificationPolicy(),
        anchors: classificationAnchors(),
        inventory,
        selected,
        selectedResults,
      });
      const withEmptyReviewed = classifyEs2015Inventory({
        policy: classificationPolicy(),
        anchors: classificationAnchors(),
        inventory,
        selected,
        selectedResults,
        reviewedProvenance: new Map(),
      });

      const withoutSummary = summarizeEs2015Classification(withoutReviewed);
      const withSummary = summarizeEs2015Classification(withEmptyReviewed);
      assertSame(json(withEmptyReviewed), json(withoutReviewed));
      assertSame(json(withSummary), json(withoutSummary));
      assertSame(
        renderEs2015Taxonomy({ summary: withSummary }),
        renderEs2015Taxonomy({ summary: withoutSummary }),
      );
    },
  },
  {
    name: 'ES2015 taxonomy reclassifies only exact unknown roots from reviewed provenance',
    run: () => {
      const corePath = PRODUCTION_UL3_PATH;
      const annexPath = productionBatchPath('UA');
      const laterPath = productionBatchPath('UB');
      const reviewed = reviewedProvenanceMap([
        {
          code: 'UL3',
          path: corePath,
          finalPartition: 'core',
          finalStatus: 'selected-passing',
        },
        {
          code: 'UA',
          path: annexPath,
          finalPartition: 'annex-b',
          finalStatus: 'annex-b',
        },
        {
          code: 'UB',
          path: laterPath,
          finalPartition: 'later-or-non-es2015',
          finalStatus: 'later-or-non-es2015',
        },
      ]);
      const inventory = buildEs2015Inventory({
        roots: [
          corePath,
          annexPath,
          laterPath,
          'test/language/untouched.js',
        ].map((path) => ({
          path,
          metadata: {
            description: `Fixture ${path}`,
            es5id: null,
            es6id: null,
            esid: null,
            features: [],
            flags: [],
            includes: [],
          },
        })),
      });
      const classifications = classifyEs2015Inventory({
        policy: classificationPolicy(),
        anchors: classificationAnchors(),
        inventory,
        selected: new Set([corePath]),
        selectedResults: singleExecutionResult(corePath),
        auditResults: singleExecutionResult(annexPath),
        reviewedProvenance: reviewed,
      });
      const byPath = new Map(
        classifications.map((record) => [record.path, record]),
      );

      assertSame(
        json([
          {
            path: corePath,
            partition: byPath.get(corePath)?.partition,
            status: byPath.get(corePath)?.status,
            provenance: byPath.get(corePath)?.provenance,
          },
          {
            path: annexPath,
            partition: byPath.get(annexPath)?.partition,
            status: byPath.get(annexPath)?.status,
            provenance: byPath.get(annexPath)?.provenance,
          },
          {
            path: laterPath,
            partition: byPath.get(laterPath)?.partition,
            status: byPath.get(laterPath)?.status,
            provenance: byPath.get(laterPath)?.provenance,
          },
          {
            path: 'test/language/untouched.js',
            partition: byPath.get('test/language/untouched.js')?.partition,
            status: byPath.get('test/language/untouched.js')?.status,
            provenance: byPath.get('test/language/untouched.js')?.provenance,
          },
        ]),
        json([
          {
            path: corePath,
            partition: 'core',
            status: 'selected-passing',
            provenance: [
              `review:UL3:${reviewed.get(corePath)?.artifactSha256}`,
            ],
          },
          {
            path: annexPath,
            partition: 'annex-b',
            status: 'annex-b',
            provenance: [
              'path:test/annexB/',
              `review:UA:${reviewed.get(annexPath)?.artifactSha256}`,
            ],
          },
          {
            path: laterPath,
            partition: 'later-or-non-es2015',
            status: 'later-or-non-es2015',
            provenance: [
              `review:UB:${reviewed.get(laterPath)?.artifactSha256}`,
            ],
          },
          {
            path: 'test/language/untouched.js',
            partition: 'unknown-edition',
            status: 'unknown-edition',
            provenance: [],
          },
        ]),
      );
    },
  },
  {
    name: 'ES2015 reviewed provenance metadata must close over the exact pinned inventory',
    run: () => {
      const path = productionBatchPath('US7');
      const exactMetadata = {
        es5id: null,
        es6id: null,
        esid: null,
        features: ['neutral-feature'],
        includeFeatures: ['neutral-feature'],
        includes: ['helper.js'],
        flags: ['onlyStrict'],
      };
      const inventory = buildEs2015Inventory({
        roots: [
          {
            path,
            metadata: {
              description: 'Metadata closure fixture.',
              es5id: null,
              es6id: null,
              esid: null,
              features: ['neutral-feature'],
              includes: ['helper.js'],
              flags: ['onlyStrict'],
            },
          },
        ],
        includeDefinitions: {
          'helper.js': { features: ['neutral-feature'] },
        },
      });
      const exactReviewed = reviewedProvenanceStub({
        code: 'US7',
        path,
        finalPartition: 'later-or-non-es2015',
        finalStatus: 'later-or-non-es2015',
        metadata: exactMetadata,
      });
      const exact = classifyEs2015Inventory({
        policy: classificationPolicy(),
        anchors: classificationAnchors(),
        inventory,
        reviewedProvenance: exactReviewed,
      });
      assertSame(exact[0].partition, 'later-or-non-es2015');

      /** @type {readonly [string, any][]} */
      const mismatches = [
        ['es5id', '15.1'],
        ['es6id', '12.1'],
        ['esid', 'sec-fixture'],
        ['features', []],
        ['flags', []],
        ['includes', []],
        ['includeFeatures', []],
      ];
      for (const [field, value] of mismatches) {
        const metadata = /** @type {any} */ ({
          ...exactMetadata,
          [field]: value,
        });
        const error = assertThrows(
          () =>
            classifyEs2015Inventory({
              policy: classificationPolicy(),
              anchors: classificationAnchors(),
              inventory,
              reviewedProvenance: reviewedProvenanceStub({
                code: 'US7',
                path,
                finalPartition: 'later-or-non-es2015',
                finalStatus: 'later-or-non-es2015',
                metadata,
              }),
            }),
          Es2015TaxonomyError,
        );
        assertSame(
          error.message,
          `ES2015 reviewed provenance for ${path} metadata.${field} does not match the pinned inventory`,
        );
      }
    },
  },
  {
    name: 'ES2015 provenance retains structural harness and malformed destinations with exact accounting',
    run: () => {
      const metadata = {
        es5id: null,
        es6id: null,
        esid: null,
        features: [],
        includeFeatures: [],
        includes: [],
        flags: [],
      };
      const harnessPath = 'test/harness/reviewed-harness.js';
      const malformedPath = 'test/language/reviewed-malformed.js';
      const harnessDecision = Object.freeze({
        code: 'UA',
        path: harnessPath,
        variants: 2,
        priorClass: 'unknown-edition',
        finalPartition: 'harness-validation',
        finalStatus: 'harness-validation',
        metadata,
        artifactSha256: '1'.repeat(64),
      });
      const malformedDecision = Object.freeze({
        code: 'UL3',
        path: malformedPath,
        variants: 2,
        priorClass: 'unknown-edition',
        finalPartition: 'malformed',
        finalStatus: 'malformed',
        metadata,
        artifactSha256: '2'.repeat(64),
      });
      /** @type {Map<string, any>} */
      const structuralReviewed = new Map();
      structuralReviewed.set(harnessPath, harnessDecision);
      structuralReviewed.set(malformedPath, malformedDecision);
      const inventory = buildEs2015Inventory({
        roots: [
          {
            path: harnessPath,
            metadata: {
              description: 'Harness validation fixture.',
              es5id: null,
              es6id: null,
              esid: null,
              features: [],
              includes: [],
              flags: [],
            },
          },
          {
            path: malformedPath,
            metadataError: 'invalid frontmatter',
          },
        ],
      });
      const classifications = classifyEs2015Inventory({
        policy: classificationPolicy(),
        anchors: classificationAnchors(),
        inventory,
        reviewedProvenance: structuralReviewed,
      });
      const byPath = new Map(
        classifications.map((record) => [record.path, record]),
      );
      assertSame(
        json({
          harness: {
            partition: byPath.get(harnessPath)?.partition,
            status: byPath.get(harnessPath)?.status,
            variants: byPath.get(harnessPath)?.variants,
            provenance: byPath.get(harnessPath)?.provenance,
          },
          malformed: {
            partition: byPath.get(malformedPath)?.partition,
            status: byPath.get(malformedPath)?.status,
            variants: byPath.get(malformedPath)?.variants,
            provenance: byPath.get(malformedPath)?.provenance,
            immutablePriorVariants: malformedDecision.variants,
          },
        }),
        json({
          harness: {
            partition: 'harness-validation',
            status: 'harness-validation',
            variants: 2,
            provenance: ['harness', `review:UA:${'1'.repeat(64)}`],
          },
          malformed: {
            partition: 'malformed',
            status: 'malformed',
            variants: 0,
            provenance: [
              'metadata-error:invalid frontmatter',
              `review:UL3:${'2'.repeat(64)}`,
            ],
            immutablePriorVariants: 2,
          },
        }),
      );
      const summary = summarizeEs2015Classification(classifications);
      assertSame(summary.roots, 2);
      assertSame(summary.variants, 2);
      assertSame(
        summary.partitions.find((entry) => entry.name === 'malformed')
          ?.variants,
        0,
      );

      const wrongStructuralDestination = new Map([
        [
          harnessPath,
          {
            ...harnessDecision,
            finalPartition: 'core',
            finalStatus: 'audit-passing-unselected',
          },
        ],
      ]);
      assertSame(
        assertThrows(
          () =>
            classifyEs2015Inventory({
              policy: classificationPolicy(),
              anchors: classificationAnchors(),
              inventory: [inventory[0]],
              reviewedProvenance: wrongStructuralDestination,
            }),
          Es2015TaxonomyError,
        ).message,
        `ES2015 reviewed provenance for ${harnessPath} must retain structural destination harness-validation`,
      );

      const malformedFragment = clone(productionDecisionFragmentValue());
      malformedFragment.decisions[0].finalPartition = 'malformed';
      malformedFragment.decisions[0].finalStatus = 'malformed';
      malformedFragment.decisions[0].destination = {
        blocker: null,
        issue: null,
      };
      malformedFragment.decisions[0].variants = 0;
      refreshFragmentHash(malformedFragment);
      assertSame(
        assertThrows(
          () =>
            validateDecisionFragments(
              productionManifest(),
              {
                UL3: parseEs2015DecisionFragment(
                  json(malformedFragment),
                  'UL3',
                ),
              },
              { allowPendingReview: false },
            ),
          Es2015ProvenanceError,
        ).message,
        `UL3 decision for ${PRODUCTION_UL3_PATH} must retain the reviewed variant count`,
      );
    },
  },
  {
    name: 'ES2015 taxonomy rejects conflicting reviewed provenance evidence',
    run: () => {
      const policy = classificationPolicy();
      const anchors = classificationAnchors();
      const laterCases = [
        {
          label: 'feature evidence',
          path: productionBatchPath('UL1'),
          code: 'UL1',
          metadata: {
            description: 'Later feature evidence.',
            es5id: null,
            es6id: null,
            esid: null,
            features: ['async-functions'],
            flags: [],
            includes: [],
          },
        },
        {
          label: 'include evidence',
          path: productionBatchPath('UL2'),
          code: 'UL2',
          metadata: {
            description: 'Later include evidence.',
            es5id: null,
            es6id: null,
            esid: null,
            features: [],
            flags: [],
            includes: ['later.js'],
          },
          includeDefinitions: {
            'later.js': { features: ['async-functions'] },
          },
        },
        {
          label: 'flag evidence',
          path: productionBatchPath('UL4'),
          code: 'UL4',
          metadata: {
            description: 'Later flag evidence.',
            es5id: null,
            es6id: null,
            esid: null,
            features: [],
            flags: ['CanBlockIsTrue'],
            includes: [],
          },
        },
      ];

      for (const scenario of laterCases) {
        const error = assertThrows(
          () =>
            classifyEs2015Inventory({
              policy,
              anchors,
              inventory: buildEs2015Inventory({
                roots: [
                  {
                    path: scenario.path,
                    metadata: scenario.metadata,
                  },
                ],
                includeDefinitions: scenario.includeDefinitions,
              }),
              reviewedProvenance: reviewedProvenanceStub({
                code: scenario.code,
                path: scenario.path,
                finalPartition: 'core',
                finalStatus: 'audit-passing-unselected',
                metadata: {
                  es5id: scenario.metadata.es5id,
                  es6id: scenario.metadata.es6id,
                  esid: scenario.metadata.esid,
                  features: scenario.metadata.features,
                  includeFeatures:
                    scenario.label === 'include evidence'
                      ? ['async-functions']
                      : [],
                  includes: scenario.metadata.includes,
                  flags: scenario.metadata.flags,
                },
              }),
            }),
          Es2015TaxonomyError,
        );
        assertSame(
          error.message,
          `ES2015 reviewed provenance for ${scenario.path} expected prior class unknown-edition, got later-or-non-es2015`,
          scenario.label,
        );
      }

      const statusPath = productionBatchPath('US1');
      const statusMismatch = assertThrows(
        () =>
          classifyEs2015Inventory({
            policy,
            anchors,
            inventory: buildEs2015Inventory({
              roots: [
                {
                  path: statusPath,
                  metadata: {
                    description: 'Reviewed status mismatch.',
                    es5id: null,
                    es6id: null,
                    esid: null,
                    features: [],
                    flags: [],
                    includes: [],
                  },
                },
              ],
            }),
            auditResults: singleExecutionResult(statusPath),
            reviewedProvenance: reviewedProvenanceStub({
              code: 'US1',
              path: statusPath,
              finalPartition: 'core',
              finalStatus: 'selected-passing',
              metadata: {
                es5id: null,
                es6id: null,
                esid: null,
                features: [],
                includeFeatures: [],
                includes: [],
                flags: [],
              },
            }),
          }),
        Es2015TaxonomyError,
      );
      assertSame(
        statusMismatch.message,
        `ES2015 reviewed provenance for ${statusPath} expected status selected-passing, got audit-passing-unselected`,
      );

      const priorClassPath = productionBatchPath('US2');
      const priorClassMismatch = assertThrows(
        () =>
          classifyEs2015Inventory({
            policy,
            anchors,
            inventory: buildEs2015Inventory({
              roots: [
                {
                  path: priorClassPath,
                  metadata: {
                    description: 'Already classified core root.',
                    es5id: null,
                    es6id: '13.2',
                    esid: null,
                    features: [],
                    flags: [],
                    includes: [],
                  },
                },
              ],
            }),
            auditResults: singleExecutionResult(priorClassPath),
            reviewedProvenance: reviewedProvenanceStub({
              code: 'US2',
              path: priorClassPath,
              finalPartition: 'core',
              finalStatus: 'audit-passing-unselected',
              metadata: {
                es5id: null,
                es6id: '13.2',
                esid: null,
                features: [],
                includeFeatures: [],
                includes: [],
                flags: [],
              },
            }),
          }),
        Es2015TaxonomyError,
      );
      assertSame(
        priorClassMismatch.message,
        `ES2015 reviewed provenance for ${priorClassPath} expected prior class unknown-edition, got audit-passing-unselected`,
      );
    },
  },
  {
    name: 'ES2015 provenance accepts only the authoritative wrapped issue map and native parents',
    run: () => {
      const manifest = productionManifest();
      const baseHash = manifest.baseLedger.pathSha256;
      const directCodes = new Set(['U0', 'UA', 'UB', 'UL', 'US']);
      const atomicCodes = new Set(['U0', ...ES2015_PROVENANCE_DECISION_CODES]);

      for (const code of Object.keys(WRAPPED_ISSUE_MAP.issues)) {
        const body = renderProvenanceIssueBody(
          manifest,
          code,
          WRAPPED_ISSUE_MAP,
        );
        assertSame(
          body.startsWith(
            `<!-- es2015-provenance-issue parent:T1 parent-issue:75 code:${code} base-ledger-sha256:${baseHash} -->\n`,
          ),
          true,
          `${code} authoritative marker`,
        );
        assertSame(
          body.includes(`jsjs taxonomy baseline: ${TAXONOMY_BASELINE}.`),
          true,
          `${code} taxonomy baseline`,
        );
        const expectedParent = directCodes.has(code)
          ? 'Native parent: T1 (#75).'
          : code.startsWith('UL')
            ? 'Native parent: UL (#103).'
            : 'Native parent: US (#108).';
        assertSame(
          body.includes(expectedParent),
          true,
          `${code} native parent`,
        );
        assertSame(
          body.includes(
            'After merge, rerun reclassification under TZ=UTC and update affected downstream issue ledgers before closing.',
          ),
          true,
          `${code} post-merge gate`,
        );
        if (atomicCodes.has(code)) {
          assertSame(
            body.includes(
              'Changes are limited to taxonomy/provenance tooling, data, and documentation; guest semantic fixes are prohibited.',
            ),
            true,
            `${code} atomic scope`,
          );
        } else {
          assertSame(
            body.includes('This grouping node owns no commit'),
            true,
            `${code} grouping ownership`,
          );
        }
      }

      const invalidMaps = [
        {
          value: { ...WRAPPED_ISSUE_MAP, parent: 74 },
          message: 'Issue map must retain parent issue #75',
        },
        {
          value: { ...WRAPPED_ISSUE_MAP, baseLedgerSha256: '0'.repeat(64) },
          message: 'Issue map must retain the immutable base ledger SHA-256',
        },
        {
          value: { ...WRAPPED_ISSUE_MAP, extra: true },
          message: 'Issue map must contain exact keys',
        },
        {
          value: {
            ...WRAPPED_ISSUE_MAP,
            issues: {
              ...WRAPPED_ISSUE_MAP.issues,
              UX: WRAPPED_ISSUE_MAP.issues.UA,
            },
          },
          message: 'Issue map issues must contain exact U* codes',
        },
        {
          value: {
            ...WRAPPED_ISSUE_MAP,
            issues: {
              ...WRAPPED_ISSUE_MAP.issues,
              UA: { ...WRAPPED_ISSUE_MAP.issues.UA, extra: true },
            },
          },
          message: 'Issue map entry UA must contain exact keys',
        },
        {
          value: {
            ...WRAPPED_ISSUE_MAP,
            issues: {
              ...WRAPPED_ISSUE_MAP.issues,
              UA: {
                ...WRAPPED_ISSUE_MAP.issues.UA,
                number: WRAPPED_ISSUE_MAP.issues.UB.number,
              },
            },
          },
          message: 'Issue map reuses issue #102 for UA and UB',
        },
        {
          value: {
            ...WRAPPED_ISSUE_MAP,
            issues: {
              ...WRAPPED_ISSUE_MAP.issues,
              UA: {
                ...WRAPPED_ISSUE_MAP.issues.UA,
                id: WRAPPED_ISSUE_MAP.issues.UB.id,
              },
            },
          },
          message: 'Issue map reuses REST id 1002 for UA and UB',
        },
        {
          value: {
            ...WRAPPED_ISSUE_MAP,
            issues: {
              ...WRAPPED_ISSUE_MAP.issues,
              UA: {
                ...WRAPPED_ISSUE_MAP.issues.UA,
                nodeId: WRAPPED_ISSUE_MAP.issues.UB.nodeId,
              },
            },
          },
          message: 'Issue map reuses node id I_fixture_UB for UA and UB',
        },
        {
          value: {
            ...WRAPPED_ISSUE_MAP,
            issues: {
              ...WRAPPED_ISSUE_MAP.issues,
              UA: { ...WRAPPED_ISSUE_MAP.issues.UA, state: 'pending' },
            },
          },
          message: 'Issue map entry UA state must be open or closed',
        },
      ];
      for (const scenario of invalidMaps) {
        assertSame(
          assertThrows(
            () => renderProvenanceIssueBody(manifest, 'UA', scenario.value),
            Es2015ProvenanceError,
          ).message,
          scenario.message,
        );
      }
      assertSame(
        assertThrows(
          () => renderProvenanceIssueBody(manifest, 'UA', COMPLETE_ISSUE_MAP),
          Es2015ProvenanceError,
        ).message,
        'Issue map must contain exact keys',
      );
    },
  },
  {
    name: 'ES2015 provenance renders deterministic initial issue bodies without issue numbers',
    run: () => {
      const manifest = productionManifest();
      const initialUaBody = renderProvenanceIssueBody(manifest, 'UA');
      const repeatedInitialUaBody = renderProvenanceIssueBody(manifest, 'UA');
      const initialU0Body = renderProvenanceIssueBody(manifest, 'U0');
      const initialUlBody = renderProvenanceIssueBody(manifest, 'UL');

      assertSame(initialUaBody, repeatedInitialUaBody);
      assertSame(initialUaBody.endsWith('\n'), true);
      assertSame(initialU0Body.endsWith('\n'), true);
      assertSame(initialUlBody.endsWith('\n'), true);
      assertSame(initialUaBody.includes('Issue: #'), false);
      assertSame(initialU0Body.includes('Issue: #'), false);
      assertSame(initialUlBody.includes('Issue: #'), false);
      assertSame(initialUaBody.includes('Dependencies: U0.'), true);
      assertSame(initialUaBody.includes('Dependencies: U0 (#'), false);
      assertSame(initialU0Body.includes('Dependencies: none.'), true);
      assertSame(
        initialUlBody.includes('Dependencies: UL1, UL2, UL3, UL4.'),
        true,
      );
      assertSame(initialUlBody.includes('Dependencies: UL1 (#'), false);
      assertSame(initialUaBody.includes('Native parent: T1 (#75).'), true);
      assertSame(initialU0Body.includes('Native parent: T1 (#75).'), true);
      assertSame(initialUlBody.includes('Native parent: T1 (#75).'), true);
    },
  },
  {
    name: 'ES2015 provenance renders deterministic issue bodies with exact dependency markers',
    run: () => {
      const manifest = productionManifest();
      const EDITION_EVIDENCE_PROHIBITION =
        'History, age, path/directory, and source/text similarity may prioritize review but can never decide edition.';
      const uaLedger = renderBatchLedger(manifest, 'UA');
      const uaBody = renderProvenanceIssueBody(
        manifest,
        'UA',
        WRAPPED_ISSUE_MAP,
      );
      const u0Body = renderProvenanceIssueBody(
        manifest,
        'U0',
        WRAPPED_ISSUE_MAP,
      );
      const ulBody = renderProvenanceIssueBody(
        manifest,
        'UL',
        WRAPPED_ISSUE_MAP,
      );
      const usBody = renderProvenanceIssueBody(
        manifest,
        'US',
        WRAPPED_ISSUE_MAP,
      );

      for (const [code, body] of [
        ['UA', uaBody],
        ['U0', u0Body],
        ['UL', ulBody],
        ['US', usBody],
      ]) {
        assertSame(
          body.endsWith('\n'),
          true,
          `${code} body must end with a newline`,
        );
      }

      assertSame(uaLedger.endsWith('\n'), true);
      assertSame(
        uaLedger.startsWith(
          'test/annexB/built-ins/RegExp/RegExp-invalid-control-escape-character-class-range.js\n',
        ),
        true,
      );
      const marker = `parent:T1 parent-issue:75 code:UA base-ledger-sha256:${manifest.baseLedger.pathSha256}`;
      assertSame(uaBody.includes(marker), true);
      assertSame(
        uaBody.includes(
          'Base ledger: 2312 roots / 4054 variants / SHA-256 56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc.',
        ),
        true,
      );
      assertSame(
        uaBody.includes(
          'Batch ledger: 314 roots / 323 variants / SHA-256 d29150e412486095bac0103f5d7e913917269870a9769cd8343a5cc9638af98e.',
        ),
        true,
      );
      assertSame(
        uaBody.includes(
          `Test262 pin: ${TEST262_REPOSITORY} @ ${TEST262_REVISION}`,
        ),
        true,
      );
      assertSame(
        uaBody.includes(
          `Sixth Edition pin: ${SPECIFICATION_SOURCE} @ ${SPECIFICATION_SHA256}`,
        ),
        true,
      );
      assertSame(uaBody.includes('Scope: Annex B'), true);
      assertSame(
        uaBody.includes(
          'Non-goals: guest runtime behavior, tools/test262/features.json, and broad selection changes.',
        ),
        true,
      );
      assertSame(
        uaBody.includes(
          'History, age, path/directory, and source/text similarity may prioritize review but can never decide edition.',
        ),
        true,
      );
      assertSame(
        uaBody.includes('Guest production changes are prohibited.'),
        true,
      );
      assertSame(
        uaBody.includes(
          'Independent specification review and independent quality/provenance review are required.',
        ),
        true,
      );
      assertSame(
        uaBody.includes('Generate artifacts and timestamps with TZ=UTC.'),
        true,
      );
      assertSame(
        uaBody.includes(
          'Local Test262 commands are limited to metadata/audit checks or exact targeted paths only.',
        ),
        true,
      );
      assertSame(uaBody.includes('Require exact-head CI before merge.'), true);
      assertSame(
        uaBody.includes('Require exact-head CodeQL before merge.'),
        true,
      );
      for (const code of Object.keys(WRAPPED_ISSUE_MAP.issues)) {
        for (const body of [
          renderProvenanceIssueBody(manifest, code),
          renderProvenanceIssueBody(manifest, code, WRAPPED_ISSUE_MAP),
        ]) {
          assertSame(body.includes(EDITION_EVIDENCE_PROHIBITION), true, code);
          assertSame(body.includes('..'), false, code);
        }
      }
      assertSame(uaBody.includes('Dependencies: U0 (#100).'), true);
      assertSame(uaBody.includes('Native parent: T1 (#75).'), true);
      assertSame(u0Body.includes('zero classification decisions'), true);
      assertSame(ulBody.includes('owns no commit'), true);
      assertSame(
        ulBody.includes(
          'Dependencies: UL1 (#104), UL2 (#105), UL3 (#106), UL4 (#107).',
        ),
        true,
      );
      assertSame(usBody.includes('owns no commit'), true);
      assertSame(
        usBody.includes(
          'Dependencies: US1 (#109), US2 (#110), US3 (#111), US4 (#112), US5 (#113), US6 (#114), US7 (#115).',
        ),
        true,
      );

      assertSame(
        assertThrows(
          () => renderBatchLedger(manifest, 'UX'),
          Es2015ProvenanceError,
        ).message,
        'UX is not a known provenance ledger code',
      );
      assertSame(
        assertThrows(
          () => renderProvenanceIssueBody(manifest, 'UA', { U0: 100 }),
          Es2015ProvenanceError,
        ).message,
        'Issue map must contain exact keys',
      );
      assertSame(
        assertThrows(
          () => renderProvenanceIssueBody(manifest, 'UA', null),
          Es2015ProvenanceError,
        ).message,
        'Issue map must be an object',
      );
    },
  },
  {
    name: 'ES2015 provenance checks and rendering use the immutable manifest after taxonomy reclassification',
    run: async () => {
      const files = new Map([[TAXONOMY_PATH, reclassifiedTaxonomyText()]]);
      const checkDependencies = provenanceCheckDependencies({ files });
      assertSame(await provenanceCheck(['--check'], checkDependencies), 0);

      const ledgerDependencies = provenanceCheckDependencies({ files });
      assertSame(
        await provenanceCheck(['--render-ledger=UA'], ledgerDependencies),
        0,
      );
      assertSame(
        ledgerDependencies.outputs.stdout.join(''),
        renderBatchLedger(productionManifest(), 'UA'),
      );

      const completeDependencies = provenanceCheckDependencies({ files });
      const completeError = await rejected(() =>
        provenanceCheck(['--check', '--complete=UA'], completeDependencies),
      );
      assertSame(
        completeError.message,
        'UA must contain reviewed decisions for every ledger path',
      );
    },
  },
  {
    name: 'ES2015 provenance Git boundary distinguishes a missing base file',
    run: async () => {
      const dependencies = createProvenanceCheckDependencies({
        environment: { TZ: 'UTC' },
      });
      assertSame(
        await dependencies.readGitFile(
          'HEAD',
          'tools/test262/definitely-not-present.json',
        ),
        null,
      );
    },
  },
  {
    name: 'ES2015 provenance range policy accepts exact foundation and decision ranges',
    run: async () => {
      const foundationChanges = [
        ...FOUNDATION_ALLOWED_PATHS.map((path) => ({ status: 'A', path })),
        ...FOUNDATION_DELETIONS.map((path) => ({ status: 'D', path })),
      ];
      assertSame(
        await provenanceCheck(
          rangeArguments('foundation'),
          rangeCheckDependencies({
            changes: foundationChanges,
            baseHasFoundation: false,
          }),
        ),
        0,
      );

      const decisionFragmentPath = `${PROVENANCE_DECISIONS_DIRECTORY}/UL3.json`;
      const decisionFragmentText = completeReviewedDecisionFragmentText(
        productionManifest(),
        'UL3',
      );
      assertSame(
        await provenanceCheck(
          rangeArguments('decision:UL3'),
          rangeCheckDependencies({
            changes: [
              { status: 'M', path: decisionFragmentPath },
              { status: 'M', path: 'tools/test262/es2015-taxonomy.json' },
            ],
            baseHasFoundation: true,
            headFiles: new Map([[decisionFragmentPath, decisionFragmentText]]),
          }),
        ),
        0,
      );
    },
  },
  {
    name: 'ES2015 provenance range policy accepts maintenance from the U0 bootstrap and an initialized base',
    run: async () => {
      const bootstrapBaseManifest = foundationBootstrapManifestText();
      const maintenanceChange = {
        status: 'M',
        path: 'tools/test262/es2015-provenance-check.js',
      };
      assertSame(
        await provenanceCheck(
          rangeArguments('foundation-maintenance', {
            baseSha: FOUNDATION_BOOTSTRAP_COMMIT,
            marker: maintenanceRangeMarker(),
          }),
          rangeCheckDependencies({
            changes: [maintenanceChange],
            baseSha: FOUNDATION_BOOTSTRAP_COMMIT,
            baseManifestText: bootstrapBaseManifest,
          }),
        ),
        0,
      );
      assertSame(
        await provenanceCheck(
          rangeArguments('foundation-maintenance', {
            marker: maintenanceRangeMarker(),
          }),
          rangeCheckDependencies({
            changes: [maintenanceChange],
            baseManifestText: approvedProvenanceManifestText(),
          }),
        ),
        0,
      );
      assertSame(
        await provenanceCheck(
          rangeArguments('maintenance:issue77-lexical', {
            baseSha: ISSUE_77_LEXICAL_MAINTENANCE_BASE_SHA,
          }),
          rangeCheckDependencies({
            baseSha: ISSUE_77_LEXICAL_MAINTENANCE_BASE_SHA,
            changes: ISSUE_77_LEXICAL_MAINTENANCE_PATHS.map((path) => ({
              status: 'M',
              path,
            })),
            baseManifestText: approvedProvenanceManifestText(),
          }),
        ),
        0,
      );
    },
  },
  {
    name: 'ES2015 provenance maintenance ranges select authorization from the trusted base before reading head policy',
    run: async () => {
      const bootstrapBaseManifest = foundationBootstrapManifestText();
      const maintenanceChange = {
        status: 'M',
        path: 'tools/test262/es2015-provenance-check.js',
      };
      const wrongBootstrapCommit = 'c'.repeat(40);
      for (const scenario of [
        {
          args: rangeArguments('foundation-maintenance', {
            baseSha: wrongBootstrapCommit,
            marker: maintenanceRangeMarker(),
          }),
          dependencies: rangeCheckDependencies({
            changes: [maintenanceChange],
            baseSha: wrongBootstrapCommit,
            baseManifestText: bootstrapBaseManifest,
          }),
          message:
            'foundation-maintenance range requires the exact U0 bootstrap base and manifest',
        },
        {
          args: rangeArguments('foundation-maintenance', {
            baseSha: FOUNDATION_BOOTSTRAP_COMMIT,
            marker: maintenanceRangeMarker(),
          }),
          dependencies: rangeCheckDependencies({
            changes: [maintenanceChange],
            baseSha: FOUNDATION_BOOTSTRAP_COMMIT,
            baseManifestText: `${bootstrapBaseManifest} `,
          }),
          message:
            'foundation-maintenance range requires the exact U0 bootstrap base and manifest',
        },
      ]) {
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(scenario.args, scenario.dependencies),
            )
          ).message,
          scenario.message,
        );
      }

      /** @type {{ rangeProfiles: { name: string, allowedPaths: string[] }[] }} */
      const broadenedHeadManifest = JSON.parse(
        approvedProvenanceManifestText(),
      );
      const maintenanceProfile = broadenedHeadManifest.rangeProfiles.find(
        (profile) => profile.name === 'foundation-maintenance',
      );
      if (maintenanceProfile === undefined) {
        throw new Error('missing foundation-maintenance fixture profile');
      }
      maintenanceProfile.allowedPaths.push('src/runtime/forbidden.js');
      maintenanceProfile.allowedPaths.sort();
      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              rangeArguments('foundation-maintenance', {
                marker: maintenanceRangeMarker(),
              }),
              rangeCheckDependencies({
                changes: [{ status: 'M', path: 'src/runtime/forbidden.js' }],
                baseManifestText: approvedProvenanceManifestText(),
                headManifestText: json(broadenedHeadManifest),
              }),
            ),
          )
        ).message,
        'foundation-maintenance range forbids changed path src/runtime/forbidden.js',
      );

      for (const path of [
        'src/runtime/forbidden.js',
        'tools/test262/features.json',
        'tools/test262/upstream-subset.json',
        'tools/test262/es2015-taxonomy.json',
      ]) {
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                rangeArguments('foundation-maintenance', {
                  marker: maintenanceRangeMarker(),
                }),
                rangeCheckDependencies({
                  changes: [{ status: 'M', path }],
                  baseManifestText: approvedProvenanceManifestText(),
                }),
              ),
            )
          ).message,
          `foundation-maintenance range forbids changed path ${path}`,
        );
      }

      const nonEmptyFragmentPath = `${PROVENANCE_DECISIONS_DIRECTORY}/UL3.json`;
      const nonEmptyFragment = `${JSON.stringify(
        productionDecisionFragmentValue(),
        null,
        2,
      )}\n`;
      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              rangeArguments('foundation-maintenance', {
                marker: maintenanceRangeMarker(),
              }),
              rangeCheckDependencies({
                changes: [maintenanceChange],
                baseManifestText: approvedProvenanceManifestText(),
                headFiles: new Map([[nonEmptyFragmentPath, nonEmptyFragment]]),
              }),
            ),
          )
        ).message,
        `foundation-maintenance range requires an exact empty decision fragment at ${nonEmptyFragmentPath}`,
      );

      for (const scenario of [
        {
          change: {
            status: 'R100',
            sourcePath: 'docs/old.md',
            path: maintenanceChange.path,
          },
          message:
            'foundation-maintenance range forbids rename docs/old.md -> tools/test262/es2015-provenance-check.js',
        },
        {
          change: {
            status: 'C100',
            sourcePath: 'docs/source.md',
            path: maintenanceChange.path,
          },
          message:
            'foundation-maintenance range forbids copy docs/source.md -> tools/test262/es2015-provenance-check.js',
        },
        {
          change: { status: 'D', path: maintenanceChange.path },
          message:
            'foundation-maintenance range forbids deleted path tools/test262/es2015-provenance-check.js',
        },
      ]) {
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                rangeArguments('foundation-maintenance', {
                  marker: maintenanceRangeMarker(),
                }),
                rangeCheckDependencies({
                  changes: [scenario.change],
                  baseManifestText: approvedProvenanceManifestText(),
                }),
              ),
            )
          ).message,
          scenario.message,
        );
      }

      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              rangeArguments('unknown', {
                marker: rangeMarker('unknown'),
              }),
              rangeCheckDependencies({
                changes: [maintenanceChange],
                baseManifestText: approvedProvenanceManifestText(),
                headManifestText: '{not valid JSON',
              }),
            ),
          )
        ).message,
        'Unknown provenance range profile unknown',
      );

      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              rangeArguments('foundation'),
              rangeCheckDependencies({
                changes: [
                  ...FOUNDATION_ALLOWED_PATHS.map((path) => ({
                    status: 'M',
                    path,
                  })),
                ],
                baseManifestText: approvedProvenanceManifestText(),
              }),
            ),
          )
        ).message,
        'foundation range requires a base without the initialized provenance foundation',
      );
    },
  },
  {
    name: 'ES2015 provenance decision ranges require one exact complete strictly reviewed batch',
    run: async () => {
      const manifest = productionManifest();
      const decisionFragmentPath = `${PROVENANCE_DECISIONS_DIRECTORY}/UL3.json`;
      const complete = JSON.parse(
        completeReviewedDecisionFragmentText(manifest, 'UL3'),
      );
      const partial = {
        ...complete,
        decisions: complete.decisions.slice(0, 1),
      };
      const otherFragmentPath = `${PROVENANCE_DECISIONS_DIRECTORY}/UL2.json`;
      const wrongCode = JSON.parse(emptyDecisionFragmentText(manifest, 'UL2'));
      wrongCode.code = 'UL3';
      const scenarios = [
        {
          files: new Map([
            [decisionFragmentPath, `${JSON.stringify(partial, null, 2)}\n`],
          ]),
          message: 'UL3 must contain reviewed decisions for every ledger path',
        },
        {
          files: new Map([
            [
              decisionFragmentPath,
              completePendingDecisionFragmentText(manifest, 'UL3'),
            ],
          ]),
          message: `UL3 decision for ${complete.decisions[0].path} review.reviewer must not be pending in strict validation`,
        },
        {
          files: new Map([
            [
              decisionFragmentPath,
              completeReviewedDecisionFragmentText(manifest, 'UL3'),
            ],
            [otherFragmentPath, `${JSON.stringify(wrongCode, null, 2)}\n`],
          ]),
          message: 'UL2 decision fragment must retain code UL2',
        },
      ];
      for (const scenario of scenarios) {
        const error = await rejected(() =>
          provenanceCheck(
            rangeArguments('decision:UL3'),
            rangeCheckDependencies({
              changes: [
                { status: 'M', path: decisionFragmentPath },
                {
                  status: 'M',
                  path: 'tools/test262/es2015-taxonomy.json',
                },
              ],
              baseHasFoundation: true,
              headFiles: scenario.files,
            }),
          ),
        );
        assertSame(error.message, scenario.message);
      }
    },
  },
  {
    name: 'ES2015 provenance range policy rejects forbidden production, selection, tooling, and fragment paths',
    run: async () => {
      const foundationChanges = [
        ...FOUNDATION_ALLOWED_PATHS.map((path) => ({ status: 'A', path })),
        ...FOUNDATION_DELETIONS.map((path) => ({ status: 'D', path })),
      ];
      for (const path of [
        'src/runtime/forbidden.js',
        'tools/test262/features.json',
        'tools/test262/upstream-subset.json',
        'tools/test262/es2015-anchors.json',
      ]) {
        const error = await rejected(() =>
          provenanceCheck(
            rangeArguments('foundation'),
            rangeCheckDependencies({
              changes: [...foundationChanges, { status: 'M', path }],
            }),
          ),
        );
        assertSame(
          error.message,
          `foundation range forbids changed path ${path}`,
        );
      }

      const decisionFragmentPath = `${PROVENANCE_DECISIONS_DIRECTORY}/UL3.json`;
      const decisionFragmentText = `${JSON.stringify(
        productionDecisionFragmentValue(),
        null,
        2,
      )}\n`;
      for (const path of [
        `${PROVENANCE_DECISIONS_DIRECTORY}/UL2.json`,
        'tools/test262/es2015-provenance.js',
        'src/runtime/forbidden.js',
        'tools/test262/features.json',
        'tools/test262/upstream-subset.json',
      ]) {
        const error = await rejected(() =>
          provenanceCheck(
            rangeArguments('decision:UL3'),
            rangeCheckDependencies({
              changes: [
                { status: 'M', path: decisionFragmentPath },
                { status: 'M', path },
              ],
              baseHasFoundation: true,
              headFiles: new Map([
                [decisionFragmentPath, decisionFragmentText],
              ]),
            }),
          ),
        );
        assertSame(
          error.message,
          `decision:UL3 range forbids changed path ${path}`,
        );
      }
    },
  },
  {
    name: 'ES2015 provenance range policy rejects renames, copies, deletes, unknown statuses, and empty ranges',
    run: async () => {
      const cases = [
        {
          changes: [
            {
              status: 'R100',
              sourcePath: 'src/old.js',
              path: 'tools/test262/es2015-provenance.js',
            },
          ],
          message:
            'foundation range forbids rename src/old.js -> tools/test262/es2015-provenance.js',
        },
        {
          changes: [
            {
              status: 'C100',
              sourcePath: 'src/source.js',
              path: 'tools/test262/es2015-provenance.js',
            },
          ],
          message:
            'foundation range forbids copy src/source.js -> tools/test262/es2015-provenance.js',
        },
        {
          changes: [{ status: 'D', path: 'docs/testing.md' }],
          message: 'foundation range forbids deleted path docs/testing.md',
        },
        {
          changes: [{ status: 'D', path: '.superpowers/unapproved.md' }],
          message:
            'foundation range forbids deleted path .superpowers/unapproved.md',
        },
        {
          changes: [{ status: 'T', path: 'docs/testing.md' }],
          message: 'foundation range has unknown git status T',
        },
        {
          changes: [],
          message: 'foundation range must not be empty',
        },
      ];
      for (const scenario of cases) {
        const error = await rejected(() =>
          provenanceCheck(
            rangeArguments('foundation'),
            rangeCheckDependencies({ changes: scenario.changes }),
          ),
        );
        assertSame(error.message, scenario.message);
      }
    },
  },
  {
    name: 'ES2015 provenance range policy rejects fake profiles, markers, bases, and content',
    run: async () => {
      const foundationChanges = [
        ...FOUNDATION_ALLOWED_PATHS.map((path) => ({ status: 'A', path })),
        ...FOUNDATION_DELETIONS.map((path) => ({ status: 'D', path })),
      ];
      const scenarios = [
        {
          args: [
            '--check-range',
            `--base=${RANGE_BASE_SHA}`,
            `--head=${RANGE_HEAD_SHA}`,
            '--profile=maintenance',
            `--marker=${rangeMarker('maintenance')}`,
          ],
          dependencies: rangeCheckDependencies({
            changes: foundationChanges,
          }),
          message: 'Unknown provenance range profile maintenance',
        },
        {
          args: [
            ...rangeArguments('foundation').slice(0, -1),
            `--marker=${rangeMarker('foundation').replace('56a730c9', '06a730c9')}`,
          ],
          dependencies: rangeCheckDependencies({
            changes: foundationChanges,
          }),
          message: 'Provenance PR marker does not match foundation policy',
        },
        {
          args: rangeArguments('foundation'),
          dependencies: rangeCheckDependencies({
            changes: foundationChanges,
            baseHasFoundation: true,
          }),
          message:
            'foundation range requires a base without the initialized provenance foundation',
        },
        {
          args: rangeArguments('decision:UL3'),
          dependencies: rangeCheckDependencies({
            changes: [
              {
                status: 'M',
                path: `${PROVENANCE_DECISIONS_DIRECTORY}/UL3.json`,
              },
            ],
          }),
          message:
            'decision:UL3 range requires an initialized provenance foundation in the base',
        },
        {
          args: rangeArguments('maintenance:issue77-lexical', {
            baseSha: ISSUE_77_LEXICAL_MAINTENANCE_BASE_SHA,
          }),
          dependencies: rangeCheckDependencies({
            baseSha: ISSUE_77_LEXICAL_MAINTENANCE_BASE_SHA,
            changes: ISSUE_77_LEXICAL_MAINTENANCE_PATHS.map((path) => ({
              status: 'M',
              path,
            })),
          }),
          message:
            'maintenance:issue77-lexical range requires an initialized provenance foundation in the base',
        },
        {
          args: rangeArguments('maintenance:issue77-lexical'),
          dependencies: rangeCheckDependencies({
            changes: ISSUE_77_LEXICAL_MAINTENANCE_PATHS.map((path) => ({
              status: 'M',
              path,
            })),
            baseManifestText: approvedProvenanceManifestText(),
          }),
          message:
            'maintenance:issue77-lexical range requires base 99c439f2efd287479f40d8d0e6ac2dd9aab81e10',
        },
        {
          args: [
            '--check-range',
            '--base=main',
            `--head=${RANGE_HEAD_SHA}`,
            '--profile=foundation',
            `--marker=${rangeMarker('foundation')}`,
          ],
          dependencies: rangeCheckDependencies({
            changes: foundationChanges,
          }),
          message: '--base must be an explicit full commit SHA',
        },
      ];
      for (const scenario of scenarios) {
        const error = await rejected(() =>
          provenanceCheck(scenario.args, scenario.dependencies),
        );
        assertSame(error.message, scenario.message);
      }

      const nonEmptyFragmentPath = `${PROVENANCE_DECISIONS_DIRECTORY}/UL3.json`;
      const nonEmptyFragment = `${JSON.stringify(
        productionDecisionFragmentValue(),
        null,
        2,
      )}\n`;
      const contentError = await rejected(() =>
        provenanceCheck(
          rangeArguments('foundation'),
          rangeCheckDependencies({
            changes: foundationChanges,
            headFiles: new Map([[nonEmptyFragmentPath, nonEmptyFragment]]),
          }),
        ),
      );
      assertSame(
        contentError.message,
        `foundation range requires an exact empty decision fragment at ${nonEmptyFragmentPath}`,
      );
    },
  },
  {
    name: 'ES2015 provenance CI range mode requires a marker for exact-U0 foundation-owned paths',
    run: async () => {
      const dependencies = rangeCheckDependencies({
        changes: [{ status: 'M', path: 'package.json' }],
        baseSha: FOUNDATION_BOOTSTRAP_COMMIT,
        baseManifestText: foundationBootstrapManifestText(),
      });
      dependencies.environment = {
        TZ: 'UTC',
        GITHUB_EVENT_NAME: 'pull_request',
        PROVENANCE_PR_BODY: 'No marker',
      };
      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              [
                '--check-range',
                `--base=${FOUNDATION_BOOTSTRAP_COMMIT}`,
                `--head=${RANGE_HEAD_SHA}`,
                '--pr-body-env=PROVENANCE_PR_BODY',
              ],
              dependencies,
            ),
          )
        ).message,
        'A provenance-owned PR range requires one authoritative provenance marker',
      );
    },
  },
  {
    name: 'ES2015 provenance CI range mode derives one trusted profile marker from the PR body',
    run: async () => {
      const foundationChanges = [
        ...FOUNDATION_ALLOWED_PATHS.map((path) => ({ status: 'A', path })),
        ...FOUNDATION_DELETIONS.map((path) => ({ status: 'D', path })),
      ];
      const ciArgs = [
        '--check-range',
        `--base=${RANGE_BASE_SHA}`,
        `--head=${RANGE_HEAD_SHA}`,
        '--pr-body-env=PROVENANCE_PR_BODY',
      ];
      const valid = rangeCheckDependencies({ changes: foundationChanges });
      valid.environment = {
        TZ: 'UTC',
        GITHUB_EVENT_NAME: 'pull_request',
        PROVENANCE_PR_BODY: `U0\n\n${rangeMarker('foundation')}\n`,
      };
      assertSame(await provenanceCheck(ciArgs, valid), 0);

      const maintenanceOnlyPath =
        'docs/superpowers/plans/2026-08-20-provenance-foundation-maintenance.md';
      for (const { baseSha, baseManifestText } of [
        {
          baseSha: FOUNDATION_BOOTSTRAP_COMMIT,
          baseManifestText: foundationBootstrapManifestText(),
        },
        {
          baseSha: RANGE_BASE_SHA,
          baseManifestText: approvedProvenanceManifestText(),
        },
      ]) {
        const unmarkedMaintenance = rangeCheckDependencies({
          changes: [{ status: 'M', path: maintenanceOnlyPath }],
          baseSha,
          baseManifestText,
        });
        unmarkedMaintenance.environment = {
          TZ: 'UTC',
          GITHUB_EVENT_NAME: 'pull_request',
          PROVENANCE_PR_BODY: 'No marker',
        };
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                [
                  '--check-range',
                  `--base=${baseSha}`,
                  `--head=${RANGE_HEAD_SHA}`,
                  '--pr-body-env=PROVENANCE_PR_BODY',
                ],
                unmarkedMaintenance,
              ),
            )
          ).message,
          'A provenance-owned PR range requires one authoritative provenance marker',
        );
      }

      const duplicate = rangeCheckDependencies({
        changes: foundationChanges,
      });
      duplicate.environment = {
        TZ: 'UTC',
        GITHUB_EVENT_NAME: 'pull_request',
        PROVENANCE_PR_BODY: `${rangeMarker('foundation')}\n${rangeMarker('foundation')}`,
      };
      assertSame(
        (await rejected(() => provenanceCheck(ciArgs, duplicate))).message,
        'PR body must contain exactly one authoritative provenance marker',
      );

      const unmarkedProtected = rangeCheckDependencies({
        changes: foundationChanges,
      });
      unmarkedProtected.environment = {
        TZ: 'UTC',
        GITHUB_EVENT_NAME: 'pull_request',
        PROVENANCE_PR_BODY: 'No marker',
      };
      assertSame(
        (await rejected(() => provenanceCheck(ciArgs, unmarkedProtected)))
          .message,
        'A provenance-owned PR range requires one authoritative provenance marker',
      );

      for (const path of [
        ...new Set([...FOUNDATION_ALLOWED_PATHS, ...DECISION_GENERATED_PATHS]),
      ]) {
        const unmarked = rangeCheckDependencies({
          changes: [{ status: 'M', path }],
        });
        unmarked.environment = {
          TZ: 'UTC',
          GITHUB_EVENT_NAME: 'pull_request',
          PROVENANCE_PR_BODY: 'No marker',
        };
        assertSame(
          (await rejected(() => provenanceCheck(ciArgs, unmarked))).message,
          'A provenance-owned PR range requires one authoritative provenance marker',
          path,
        );
      }

      for (const changes of [
        [
          { status: 'M', path: '.github/workflows/ci.yml' },
          { status: 'M', path: 'tools/ci/pipeline.js' },
        ],
        [{ status: 'M', path: 'tools/test262/es2015-audit.js' }],
        [
          {
            status: 'R100',
            sourcePath:
              'docs/superpowers/specs/2026-08-19-unknown-edition-provenance-design.md',
            path: 'docs/renamed-design.md',
          },
        ],
        [
          {
            status: 'R100',
            sourcePath: 'docs/unowned.md',
            path: 'docs/testing.md',
          },
        ],
        [
          {
            status: 'C100',
            sourcePath: 'tools/test262/es2015-taxonomy.js',
            path: 'docs/copied-taxonomy.js',
          },
        ],
      ]) {
        const unmarked = rangeCheckDependencies({ changes });
        unmarked.environment = {
          TZ: 'UTC',
          GITHUB_EVENT_NAME: 'pull_request',
          PROVENANCE_PR_BODY: 'No marker',
        };
        assertSame(
          (await rejected(() => provenanceCheck(ciArgs, unmarked))).message,
          'A provenance-owned PR range requires one authoritative provenance marker',
        );
      }

      for (const scenario of [
        {
          change: {
            status: 'R100',
            sourcePath:
              'docs/superpowers/specs/2026-08-19-unknown-edition-provenance-design.md',
            path: 'docs/renamed-design.md',
          },
          message:
            'foundation range forbids rename docs/superpowers/specs/2026-08-19-unknown-edition-provenance-design.md -> docs/renamed-design.md',
        },
        {
          change: {
            status: 'C100',
            sourcePath: 'tools/test262/es2015-taxonomy.js',
            path: 'docs/copied-taxonomy.js',
          },
          message:
            'foundation range forbids copy tools/test262/es2015-taxonomy.js -> docs/copied-taxonomy.js',
        },
      ]) {
        const marked = rangeCheckDependencies({ changes: [scenario.change] });
        marked.environment = {
          TZ: 'UTC',
          GITHUB_EVENT_NAME: 'pull_request',
          PROVENANCE_PR_BODY: rangeMarker('foundation'),
        };
        assertSame(
          (await rejected(() => provenanceCheck(ciArgs, marked))).message,
          scenario.message,
        );
      }

      const unmarkedUnrelated = rangeCheckDependencies({
        changes: [{ status: 'M', path: 'README.md' }],
      });
      unmarkedUnrelated.environment = {
        TZ: 'UTC',
        GITHUB_EVENT_NAME: 'pull_request',
        PROVENANCE_PR_BODY: 'No marker',
      };
      assertSame(await provenanceCheck(ciArgs, unmarkedUnrelated), 0);

      const wrongEvent = rangeCheckDependencies({
        changes: foundationChanges,
      });
      wrongEvent.environment = {
        TZ: 'UTC',
        GITHUB_EVENT_NAME: 'push',
        PROVENANCE_PR_BODY: rangeMarker('foundation'),
      };
      assertSame(
        (await rejected(() => provenanceCheck(ciArgs, wrongEvent))).message,
        'Provenance PR range checking requires a pull_request event',
      );
    },
  },
  {
    name: 'ES2015 provenance CLI permits pending review only for an exact complete check',
    run: async () => {
      for (const args of [
        ['--allow-pending-review'],
        ['--check', '--allow-pending-review'],
        ['--render-ledger=UA', '--allow-pending-review'],
        ['--initialize', '--allow-pending-review'],
      ]) {
        const error = await rejected(() =>
          provenanceCheck(args, provenanceCheckDependencies()),
        );
        assertSame(
          error.message,
          '--allow-pending-review requires --check --complete=CODE',
          args.join(' '),
        );
      }

      const repeated = await rejected(() =>
        provenanceCheck(
          [
            '--check',
            '--complete=UL4',
            '--allow-pending-review',
            '--allow-pending-review',
          ],
          provenanceCheckDependencies(),
        ),
      );
      assertSame(
        repeated.message,
        'The --allow-pending-review option must not be repeated',
      );

      const pendingPath = `${PROVENANCE_DECISIONS_DIRECTORY}/UL4.json`;
      const pendingFiles = new Map([
        [
          pendingPath,
          completePendingDecisionFragmentText(productionManifest(), 'UL4'),
        ],
      ]);
      const strictError = await rejected(() =>
        provenanceCheck(
          ['--check', '--complete=UL4'],
          provenanceCheckDependencies({ files: pendingFiles }),
        ),
      );
      assertSame(
        strictError.message.includes(
          'review.reviewer must not be pending in strict validation',
        ),
        true,
      );
      assertSame(
        await provenanceCheck(
          ['--check', '--complete=UL4', '--allow-pending-review'],
          provenanceCheckDependencies({ files: pendingFiles }),
        ),
        0,
      );
    },
  },
  {
    name: 'ES2015 provenance CLI rejects invalid options, non-UTC runs, and non-empty initialize overwrites',
    run: async () => {
      const unknownOption = await rejected(() =>
        provenanceCheck(['--wat'], provenanceCheckDependencies()),
      );
      assertSame(unknownOption instanceof Es2015ProvenanceCheckError, true);
      assertSame(unknownOption.message, 'Unknown option --wat');

      const conflicting = await rejected(() =>
        provenanceCheck(
          ['--initialize', '--check'],
          provenanceCheckDependencies(),
        ),
      );
      assertSame(conflicting instanceof Es2015ProvenanceCheckError, true);
      assertSame(
        conflicting.message,
        'Exactly one of --initialize, --check, --check-range, --render-ledger=CODE, or --render-issue=CODE is required',
      );

      const nonUtc = await rejected(() =>
        provenanceCheck(
          [],
          provenanceCheckDependencies({ timezone: 'America/Los_Angeles' }),
        ),
      );
      assertSame(nonUtc instanceof Es2015ProvenanceCheckError, true);
      assertSame(nonUtc.message.includes('UTC'), true);

      const nonEmptyDependencies = provenanceCheckDependencies({
        files: new Map([
          [
            `${PROVENANCE_DECISIONS_DIRECTORY}/UL3.json`,
            json(productionDecisionFragmentValue()),
          ],
        ]),
      });
      const nonEmpty = await rejected(() =>
        provenanceCheck(['--initialize'], nonEmptyDependencies),
      );
      assertSame(nonEmpty instanceof Es2015ProvenanceCheckError, true);
      assertSame(
        nonEmpty.message,
        `${PROVENANCE_DECISIONS_DIRECTORY}/UL3.json must not overwrite non-empty reviewed decisions`,
      );
      assertSame(nonEmptyDependencies.writes.length, 0);

      const driftedDependencies = provenanceCheckDependencies({
        files: new Map([[TAXONOMY_PATH, driftedTaxonomyText()]]),
      });
      const drifted = await rejected(() =>
        provenanceCheck(['--initialize'], driftedDependencies),
      );
      assertSame(drifted instanceof Es2015ProvenanceCheckError, true);
      assertSame(drifted.message.includes('approved immutable ledger'), true);
      assertSame(driftedDependencies.writes.length, 0);
    },
  },
  {
    name: 'ES2015 provenance CLI initializes the exact manifest and empty fragments',
    run: async () => {
      const dependencies = provenanceCheckDependencies({
        files: new Map([
          [
            TAXONOMY_PATH,
            readFileSyncText(
              new URL(
                '../../tools/test262/es2015-taxonomy.json',
                import.meta.url,
              ),
              'utf8',
            ),
          ],
        ]),
        decisionDirectoryEntries: [],
      });
      assertSame(await provenanceCheck(['--initialize'], dependencies), 0);
      assertSame(dependencies.writes.length, 14);
      assertSame(
        dependencies.files.get(ES2015_PROVENANCE_FILE),
        approvedProvenanceManifestText(),
      );
      for (const code of ES2015_PROVENANCE_DECISION_CODES) {
        assertSame(
          dependencies.files.get(
            `${PROVENANCE_DECISIONS_DIRECTORY}/${code}.json`,
          ),
          emptyDecisionFragmentText(productionManifest(), code),
        );
      }

      const legacyUa = JSON.parse(
        emptyDecisionFragmentText(productionManifest(), 'UA'),
      );
      legacyUa.version = 1;
      delete legacyUa.taxonomyBaseline;
      const migrationDependencies = provenanceCheckDependencies({
        files: new Map([
          [
            `${PROVENANCE_DECISIONS_DIRECTORY}/UA.json`,
            `${JSON.stringify(legacyUa, null, 2)}\n`,
          ],
        ]),
      });
      assertSame(
        await provenanceCheck(['--initialize'], migrationDependencies),
        0,
      );
      assertSame(
        migrationDependencies.files.get(
          `${PROVENANCE_DECISIONS_DIRECTORY}/UA.json`,
        ),
        emptyDecisionFragmentText(productionManifest(), 'UA'),
      );
    },
  },
  {
    name: 'ES2015 provenance CLI check rejects missing or extra files, reports drift paths, and requires complete fragments',
    run: async () => {
      assertSame(
        await provenanceCheck(['--check'], provenanceCheckDependencies()),
        0,
      );

      const drift = provenanceCheckDependencies({
        files: new Map([[ES2015_PROVENANCE_FILE, 'drift\n']]),
      });
      const driftError = await rejected(() =>
        provenanceCheck(['--check'], drift),
      );
      assertSame(driftError instanceof Es2015ProvenanceCheckError, true);
      assertSame(
        driftError.message,
        `${ES2015_PROVENANCE_FILE} is not valid JSON: Unexpected token 'd', "drift\n" is not valid JSON`,
      );

      const missing = provenanceCheckDependencies({
        decisionDirectoryEntries: ES2015_PROVENANCE_DECISION_CODES.filter(
          (code) => code !== 'US7',
        ).map((code) => `${code}.json`),
      });
      missing.files.delete(`${PROVENANCE_DECISIONS_DIRECTORY}/US7.json`);
      const missingError = await rejected(() =>
        provenanceCheck(['--check'], missing),
      );
      assertSame(missingError instanceof Es2015ProvenanceCheckError, true);
      assertSame(
        missingError.message,
        `${PROVENANCE_DECISIONS_DIRECTORY}/US7.json is missing`,
      );

      const extra = provenanceCheckDependencies({
        decisionDirectoryEntries: [
          ...ES2015_PROVENANCE_DECISION_CODES.map((code) => `${code}.json`),
          'UX.json',
        ],
      });
      const extraError = await rejected(() =>
        provenanceCheck(['--check'], extra),
      );
      assertSame(extraError instanceof Es2015ProvenanceCheckError, true);
      assertSame(
        extraError.message,
        `${PROVENANCE_DECISIONS_DIRECTORY}/UX.json is not an approved provenance fragment`,
      );

      const extraNonJson = provenanceCheckDependencies({
        decisionDirectoryEntries: [
          ...ES2015_PROVENANCE_DECISION_CODES.map((code) => `${code}.json`),
          '.DS_Store',
        ],
      });
      const extraNonJsonError = await rejected(() =>
        provenanceCheck(['--check'], extraNonJson),
      );
      assertSame(extraNonJsonError instanceof Es2015ProvenanceCheckError, true);
      assertSame(
        extraNonJsonError.message,
        `${PROVENANCE_DECISIONS_DIRECTORY}/.DS_Store is not an approved provenance fragment`,
      );

      const incompleteError = await rejected(() =>
        provenanceCheck(
          ['--check', '--complete=UA'],
          provenanceCheckDependencies(),
        ),
      );
      assertSame(incompleteError instanceof Es2015ProvenanceCheckError, true);
      assertSame(
        incompleteError.message,
        'UA must contain reviewed decisions for every ledger path',
      );
    },
  },
  {
    name: 'ES2015 provenance CLI renders deterministic ledgers and issues',
    run: async () => {
      const ledgerDependencies = provenanceCheckDependencies();
      assertSame(
        await provenanceCheck(['--render-ledger=UA'], ledgerDependencies),
        0,
      );
      assertSame(
        ledgerDependencies.outputs.stdout.join(''),
        renderBatchLedger(productionManifest(), 'UA'),
      );

      const initialU0Dependencies = provenanceCheckDependencies();
      assertSame(
        await provenanceCheck(['--render-issue=U0'], initialU0Dependencies),
        0,
      );
      assertSame(
        initialU0Dependencies.outputs.stdout.join(''),
        renderProvenanceIssueBody(productionManifest(), 'U0'),
      );

      const initialUlDependencies = provenanceCheckDependencies();
      assertSame(
        await provenanceCheck(['--render-issue=UL'], initialUlDependencies),
        0,
      );
      assertSame(
        initialUlDependencies.outputs.stdout.join(''),
        renderProvenanceIssueBody(productionManifest(), 'UL'),
      );

      const initialUaDependencies = provenanceCheckDependencies();
      assertSame(
        await provenanceCheck(['--render-issue=UA'], initialUaDependencies),
        0,
      );
      const initialUaOutput = initialUaDependencies.outputs.stdout.join('');
      assertSame(
        initialUaOutput,
        renderProvenanceIssueBody(productionManifest(), 'UA'),
      );
      const repeatedInitialUaDependencies = provenanceCheckDependencies();
      assertSame(
        await provenanceCheck(
          ['--render-issue=UA'],
          repeatedInitialUaDependencies,
        ),
        0,
      );
      assertSame(
        repeatedInitialUaDependencies.outputs.stdout.join(''),
        initialUaOutput,
      );

      const issueDependencies = provenanceCheckDependencies({
        files: new Map([[ISSUE_MAP_PATH, json(WRAPPED_ISSUE_MAP)]]),
      });
      assertSame(
        await provenanceCheck(
          ['--render-issue=UA', `--issue-map=${ISSUE_MAP_PATH}`],
          issueDependencies,
        ),
        0,
      );
      assertSame(
        issueDependencies.outputs.stdout.join(''),
        renderProvenanceIssueBody(
          productionManifest(),
          'UA',
          WRAPPED_ISSUE_MAP,
        ),
      );

      const incompleteIssueMap = provenanceCheckDependencies({
        files: new Map([[ISSUE_MAP_PATH, json({ U0: 100 })]]),
      });
      const issueError = await rejected(() =>
        provenanceCheck(
          ['--render-issue=U0', `--issue-map=${ISSUE_MAP_PATH}`],
          incompleteIssueMap,
        ),
      );
      assertSame(issueError instanceof Es2015ProvenanceCheckError, true);
      assertSame(issueError.message, 'Issue map must contain exact keys');

      const extraIssueMap = provenanceCheckDependencies({
        files: new Map([
          [
            ISSUE_MAP_PATH,
            json({
              ...WRAPPED_ISSUE_MAP,
              issues: {
                ...WRAPPED_ISSUE_MAP.issues,
                UX: WRAPPED_ISSUE_MAP.issues.UA,
              },
            }),
          ],
        ]),
      });
      const extraIssueError = await rejected(() =>
        provenanceCheck(
          ['--render-issue=UA', `--issue-map=${ISSUE_MAP_PATH}`],
          extraIssueMap,
        ),
      );
      assertSame(extraIssueError instanceof Es2015ProvenanceCheckError, true);
      assertSame(
        extraIssueError.message,
        'Issue map issues must contain exact U* codes',
      );
    },
  },
];
