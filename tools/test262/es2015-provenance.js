/**
 * Pure, host-neutral provenance contracts for the ES2015 unknown-edition ledger.
 */

import { createHash } from 'node:crypto';
import { isTest262FixtureDependencyPath, sortStrings } from './selection.js';

/**
 * @typedef {{ source: string, sourceSha256: string }} IdentitySpecification
 * @typedef {{ code: string, issue: number }} ProvenanceParent
 * @typedef {{ path: string, variants: number, priorClass: string }} ProvenanceBatchEntry
 * @typedef {{ rootCount: number, variantCount: number, pathSha256: string, paths: readonly string[] }} ProvenanceBaseLedger
 * @typedef {{ code: string, selector: string, scope: string, rootCount: number, variantCount: number, pathSha256: string, entryLedgerSha256: string, entries: readonly ProvenanceBatchEntry[] }} ProvenanceBatch
 * @typedef {{ blocker: string, issues: readonly number[] }} ProvenanceBlockerOwner
 * @typedef {{ name: string, baseFoundation: 'absent' | 'present', requiredPaths: readonly string[], allowedPaths: readonly string[], requiredDeletions: readonly string[], allowedDeletions: readonly string[], emptyDecisionFragments: readonly string[], decisionFragment: string | null, generatedPaths: readonly string[] }} ProvenanceRangeProfile
 * @typedef {'pending' | 'applied'} RoadmapAuthorityState
 * @typedef {'add-exact' | 'replace-exact' | 'project'} RoadmapOutputOperation
 * @typedef {{ path: string, operation: RoadmapOutputOperation, baseSha256: string | null, headSha256: string | null, projectionSha256: string | null }} RoadmapProtectedOutput
 * @typedef {{ status: 'selected-passing' | 'audit-passing-unselected' | 'blocked', blocker: string | null, issue: number }} RoadmapDestination
 * @typedef {{ preservedTaxonomySha256: string, authorityTaxonomySha256: string, selectorPathSha256: string, rootCount: number, variantCount: number, missingCount: number, extraCount: number, proofSha256: string }} RoadmapReconciliation
 * @typedef {{ code: string, issue: number, parentIssue: number, state: RoadmapAuthorityState, source: { baseTaxonomySha256: string, rootCount: number, variantCount: number, pathSha256: string, entryLedgerSha256: string | null }, reconciliation: RoadmapReconciliation | null, evidence: readonly { path: string, sha256: string }[], protectedOutputs: readonly RoadmapProtectedOutput[], destinations: readonly RoadmapDestination[] }} RoadmapAuthority
 * @typedef {{ version: number, taxonomyBaseline: string, repository: string, revision: string, specification: IdentitySpecification, parent: ProvenanceParent, blockerOwners: readonly ProvenanceBlockerOwner[], rangeProfiles: readonly ProvenanceRangeProfile[], baseLedger: ProvenanceBaseLedger, batches: readonly ProvenanceBatch[], roadmapAuthorities?: readonly RoadmapAuthority[] }} ProvenanceManifest
 * @typedef {{ repository: string, commit: string, note: string }} ReviewedDecisionHistoryEntry
 * @typedef {{ reviewer: string, reviewedAt: string, artifact: string }} ReviewedDecisionReview
 * @typedef {{ blocker: string | null, issue: number | null }} ReviewedDecisionDestination
 * @typedef {{ es5id: string | null, es6id: string | null, esid: string | null, features: readonly string[], includeFeatures: readonly string[], includes: readonly string[], flags: readonly string[] }} ReviewedDecisionMetadata
 * @typedef {{ path: string, variants: number, priorClass: string, finalPartition: string, finalStatus: string, evidenceKind: string, specification: { source: string, sourceSha256: string, clause: string | null, anchor: string | null }, metadata: ReviewedDecisionMetadata, history: readonly ReviewedDecisionHistoryEntry[], rationale: string, review: ReviewedDecisionReview, destination: ReviewedDecisionDestination, artifactSha256: string | null }} ReviewedDecision
 * @typedef {{ version: number, taxonomyBaseline: string, repository: string, revision: string, specification: IdentitySpecification, parent: ProvenanceParent, code: string, decisions: readonly ReviewedDecision[] }} ProvenanceDecisionFragment
 * @typedef {{ path: string, variants: number, partition: string, finalClass: string }} ClassificationRecord
 * @typedef {{ title: string, scope: string, parentCode: string, dependencies: readonly string[], aggregateCodes: readonly string[], extra?: string }} IssueDefinition
 * @typedef {{ code: string, selector: string, scope: string }} BatchDefinition
 * @typedef {{ rootCount: number, variantCount: number, pathSha256: string, entryLedgerSha256: string }} ApprovedBatchLedger
 */

export const ES2015_PROVENANCE_MANIFEST_VERSIONS = Object.freeze([2, 3]);
export const ES2015_PROVENANCE_DECISION_VERSION = 2;
export const ES2015_PROVENANCE_VERSION = ES2015_PROVENANCE_DECISION_VERSION;
export const P0_APPLIED_ROADMAP_AUTHORITY = deepFreeze({
  code: 'P0',
  issue: 77,
  parentIssue: 70,
  state: 'applied',
  source: {
    baseTaxonomySha256:
      'e7746b6da6038c1fda83e1e6cbecbe9fb3e7b97bdf89a311c0a3f34a686c7953',
    rootCount: 83,
    variantCount: 164,
    pathSha256:
      'b2657db74331391b156f87e1e831665ef4ae3a738d48836e476c13828b1aeff4',
    entryLedgerSha256:
      '3b23ac8dbc2ae703d466d49e26d827516e4a863406a45acb4e8356c86c32d664',
  },
  reconciliation: null,
  evidence: [],
  protectedOutputs: [
    {
      path: 'docs/conformance.md',
      operation: 'replace-exact',
      baseSha256:
        '3799ff93e726fdd181377417b6307801dc1ae1d5e884181d0bc4c4bd68ba2466',
      headSha256:
        '22b8f8c5368e922919987f53aa273b8cc4234435e2adf72ffcba164082e01f85',
      projectionSha256: null,
    },
    {
      path: 'docs/test262-report.jsonl',
      operation: 'replace-exact',
      baseSha256:
        '9de8674a603263d5d80d9e48d255879efa061b648cc9cb32eff399941a6927df',
      headSha256:
        'c559d673e7ff2af88343eadf58b292db45d71ef99915699cc5d8e5310a73fc27',
      projectionSha256: null,
    },
    {
      path: 'tools/test262/es2015-audit-evidence.json',
      operation: 'replace-exact',
      baseSha256:
        'd560df3e1a9af905115324d529a0a101943d30fa0af8a8102b2dd344121ba9e4',
      headSha256:
        '58f92e072306bfe99f8b9a57bf959469100b0e54816bef3263ec9b6c075a4990',
      projectionSha256: null,
    },
    {
      path: 'tools/test262/es2015-taxonomy.json',
      operation: 'replace-exact',
      baseSha256:
        'e7746b6da6038c1fda83e1e6cbecbe9fb3e7b97bdf89a311c0a3f34a686c7953',
      headSha256:
        'dcc14a00a21c8e76351f75a24ec6e2ff52db9bd02f63d3ece0e4d6634121d662',
      projectionSha256: null,
    },
    {
      path: 'tools/test262/es5-selection.json',
      operation: 'replace-exact',
      baseSha256:
        '20f0fc1d84bcec4efb934ef46b23a532d41502d6fcf88a307231d647a2c700f8',
      headSha256:
        '533e0b9fc165a026d64c4e64d783cf2585de7236600acacf228f06d27f23d8c8',
      projectionSha256: null,
    },
    {
      path: 'tools/test262/upstream-subset.json',
      operation: 'replace-exact',
      baseSha256:
        'cceaaf9807c0d32c32be5b0800a140612afddf9acf49bcdc0cf8f0102562fb39',
      headSha256:
        'e76d5624e999b852df2c8c1bdb7dfebdcc5952083eb175f7ab67bd39ad75e4d8',
      projectionSha256: null,
    },
  ],
  destinations: [
    {
      status: 'audit-passing-unselected',
      blocker: null,
      issue: 77,
    },
    {
      status: 'blocked',
      blocker: 'remaining-standard-library-additions',
      issue: 95,
    },
    {
      status: 'selected-passing',
      blocker: null,
      issue: 77,
    },
  ],
});
export const H0_PENDING_ROADMAP_AUTHORITY = deepFreeze({
  code: 'H0',
  issue: 76,
  parentIssue: 70,
  state: 'pending',
  source: {
    baseTaxonomySha256:
      'dcc14a00a21c8e76351f75a24ec6e2ff52db9bd02f63d3ece0e4d6634121d662',
    rootCount: 135,
    variantCount: 267,
    pathSha256:
      '3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950',
    entryLedgerSha256: null,
  },
  reconciliation: {
    preservedTaxonomySha256:
      'e7746b6da6038c1fda83e1e6cbecbe9fb3e7b97bdf89a311c0a3f34a686c7953',
    authorityTaxonomySha256:
      'dcc14a00a21c8e76351f75a24ec6e2ff52db9bd02f63d3ece0e4d6634121d662',
    selectorPathSha256:
      '3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950',
    rootCount: 135,
    variantCount: 267,
    missingCount: 0,
    extraCount: 0,
    proofSha256:
      '10f0381153294c2be9c764b00cfa44d535e4c2af61f26d1d8cc9650787a21ca8',
  },
  evidence: [
    {
      path: 'tools/test262/es2015-h0-baseline.json',
      sha256:
        '01c9f90704fe9ea6d892c4e758817fbe9bc30368486a58f12b47068e6b2080ec',
    },
    {
      path: 'tools/test262/es2015-h0-disposition.json',
      sha256:
        'a48db4417e1ad41298e0d24bb6e1ef1925d6a812ab59a1541ce14ec2a06df857',
    },
    {
      path: 'tools/test262/es2015-h0-owner-deltas.json',
      sha256:
        'ddb0001ef1ba607e785ba63560305144b8cd39c95c76b85c2375c38562b1618b',
    },
    {
      path: 'tools/test262/es2015-h0-owner-map.json',
      sha256:
        'd50f58ed621eac896fceb325f54480d33c9680c0f6b264a6cbce5812c7f4f44b',
    },
    {
      path: 'tools/test262/es2015-h0-paths.json',
      sha256:
        'bf3c2ed9c9e259bb25d3c5289a57c4daa5576b6d68d868df74f73c7a95bef893',
    },
    {
      path: 'tools/test262/es2015-h0-promotion.json',
      sha256:
        'a5ad87badd75c547f4f4e2fb0b5d0536b4969ea3bf97676333f970434e5cfa2c',
    },
  ],
  protectedOutputs: [
    {
      path: 'docs/conformance.md',
      operation: 'project',
      baseSha256:
        '22b8f8c5368e922919987f53aa273b8cc4234435e2adf72ffcba164082e01f85',
      headSha256: null,
      projectionSha256:
        'c44ef2d084be750bca79a574ae041c2a757d452c71f2dffaf59badc7c6a9fcb8',
    },
    {
      path: 'docs/test262-report.jsonl',
      operation: 'project',
      baseSha256:
        'c559d673e7ff2af88343eadf58b292db45d71ef99915699cc5d8e5310a73fc27',
      headSha256: null,
      projectionSha256:
        'a13390c77ffb89cdad7b043924c2d4318e8f27dd8e4f38bab943363b5e9b73cd',
    },
    {
      path: 'tools/test262/es2015-h0-baseline.json',
      operation: 'add-exact',
      baseSha256: null,
      headSha256:
        '01c9f90704fe9ea6d892c4e758817fbe9bc30368486a58f12b47068e6b2080ec',
      projectionSha256: null,
    },
    {
      path: 'tools/test262/es2015-h0-disposition.json',
      operation: 'add-exact',
      baseSha256: null,
      headSha256:
        'a48db4417e1ad41298e0d24bb6e1ef1925d6a812ab59a1541ce14ec2a06df857',
      projectionSha256: null,
    },
    {
      path: 'tools/test262/es2015-h0-owner-deltas.json',
      operation: 'add-exact',
      baseSha256: null,
      headSha256:
        'ddb0001ef1ba607e785ba63560305144b8cd39c95c76b85c2375c38562b1618b',
      projectionSha256: null,
    },
    {
      path: 'tools/test262/es2015-h0-owner-map.json',
      operation: 'add-exact',
      baseSha256: null,
      headSha256:
        'd50f58ed621eac896fceb325f54480d33c9680c0f6b264a6cbce5812c7f4f44b',
      projectionSha256: null,
    },
    {
      path: 'tools/test262/es2015-h0-paths.json',
      operation: 'add-exact',
      baseSha256: null,
      headSha256:
        'bf3c2ed9c9e259bb25d3c5289a57c4daa5576b6d68d868df74f73c7a95bef893',
      projectionSha256: null,
    },
    {
      path: 'tools/test262/es2015-h0-promotion.json',
      operation: 'add-exact',
      baseSha256: null,
      headSha256:
        'a5ad87badd75c547f4f4e2fb0b5d0536b4969ea3bf97676333f970434e5cfa2c',
      projectionSha256: null,
    },
    {
      path: 'tools/test262/es2015-taxonomy.json',
      operation: 'project',
      baseSha256:
        'dcc14a00a21c8e76351f75a24ec6e2ff52db9bd02f63d3ece0e4d6634121d662',
      headSha256: null,
      projectionSha256:
        'dc96bb2a162db339d13cdb119a86e29ec0e3dbe31fee29780fc1cc1995c87c02',
    },
    {
      path: 'tools/test262/upstream-subset.json',
      operation: 'project',
      baseSha256:
        'e76d5624e999b852df2c8c1bdb7dfebdcc5952083eb175f7ab67bd39ad75e4d8',
      headSha256: null,
      projectionSha256:
        '257c3e960ba14b8ebabd2ba92e7777d2a26b8a456ae6123c71e4e2349dd9ba6f',
    },
  ],
  destinations: [
    {
      status: 'blocked',
      blocker: 'binary-data-and-typed-arrays',
      issue: 87,
    },
    {
      status: 'blocked',
      blocker: 'binary-data-and-typed-arrays',
      issue: 88,
    },
    {
      status: 'blocked',
      blocker: 'binary-data-and-typed-arrays',
      issue: 89,
    },
    {
      status: 'blocked',
      blocker: 'early-errors-and-declaration-instantiation',
      issue: 78,
    },
    {
      status: 'blocked',
      blocker: 'keyed-collections',
      issue: 83,
    },
    {
      status: 'blocked',
      blocker: 'keyed-collections',
      issue: 84,
    },
    {
      status: 'blocked',
      blocker: 'keyed-collections',
      issue: 85,
    },
    {
      status: 'blocked',
      blocker: 'proper-tail-calls',
      issue: 97,
    },
    {
      status: 'blocked',
      blocker: 'proxy-and-reflect-metaobject',
      issue: 79,
    },
    {
      status: 'blocked',
      blocker: 'proxy-and-reflect-metaobject',
      issue: 81,
    },
    {
      status: 'blocked',
      blocker: 'regexp-unicode-and-sticky',
      issue: 91,
    },
    {
      status: 'blocked',
      blocker: 'remaining-language-runtime-semantics',
      issue: 96,
    },
    {
      status: 'blocked',
      blocker: 'remaining-standard-library-additions',
      issue: 93,
    },
    {
      status: 'blocked',
      blocker: 'remaining-standard-library-additions',
      issue: 94,
    },
    {
      status: 'blocked',
      blocker: 'remaining-standard-library-additions',
      issue: 95,
    },
    {
      status: 'blocked',
      blocker: 'symbol-protocol-dispatch',
      issue: 92,
    },
    {
      status: 'selected-passing',
      blocker: null,
      issue: 76,
    },
  ],
});
/** @type {readonly RoadmapAuthority[]} */
export const APPROVED_INITIAL_ROADMAP_AUTHORITIES = deepFreeze([
  H0_PENDING_ROADMAP_AUTHORITY,
  P0_APPLIED_ROADMAP_AUTHORITY,
]);
export const ES2015_PROVENANCE_FILE = 'tools/test262/es2015-provenance.json';
export const ES2015_PROVENANCE_DECISION_CODES = Object.freeze([
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
]);

const TEST262_REPOSITORY = 'https://github.com/tc39/test262.git';
const TEST262_REVISION = 'b363f29d3c43c626dc852744ad64a0b48a003693';
const TAXONOMY_BASELINE = '54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7';
const SPECIFICATION_SOURCE = 'https://262.ecma-international.org/6.0/';
const SPECIFICATION_SHA256 =
  '4d4243dc2f04c9cdd09498f2cc2af6f6cdc07b0430da5578e7cf440d4f7846a0';
const PARENT_CODE = 'T1';
const PARENT_ISSUE = 75;
const ROOT_PREFIX = 'test/';
const EMPTY_LEDGER_SHA256 = sha256('\n');
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;
const REVIEW_URL =
  /^https:\/\/github\.com\/yoonbuck\/jsjs\/(?:pull|issues)\/\d+#issuecomment-\d+$/;
const APPROVED_BLOCKER_OWNERS = Object.freeze([
  Object.freeze({ blocker: 'annex-b-web-compatibility', issues: [99] }),
  Object.freeze({
    blocker: 'binary-data-and-typed-arrays',
    issues: [87, 88, 89, 90],
  }),
  Object.freeze({
    blocker: 'early-errors-and-declaration-instantiation',
    issues: [78],
  }),
  Object.freeze({ blocker: 'keyed-collections', issues: [83, 84, 85, 86] }),
  Object.freeze({
    blocker: 'lexical-grammar-and-new-target',
    issues: [77],
  }),
  Object.freeze({ blocker: 'proper-tail-calls', issues: [97] }),
  Object.freeze({
    blocker: 'proxy-and-reflect-metaobject',
    issues: [79, 80, 81],
  }),
  Object.freeze({ blocker: 'regexp-unicode-and-sticky', issues: [91, 92] }),
  Object.freeze({
    blocker: 'remaining-language-runtime-semantics',
    issues: [96],
  }),
  Object.freeze({
    blocker: 'remaining-standard-library-additions',
    issues: [92, 93, 94, 95],
  }),
  Object.freeze({ blocker: 'symbol-protocol-dispatch', issues: [82, 92] }),
  Object.freeze({ blocker: 'test262-cross-realm-host', issues: [76] }),
]);
/** @type {ReadonlyMap<string, ReadonlySet<number>>} */
const BLOCKER_ISSUES = new Map(
  APPROVED_BLOCKER_OWNERS.map((entry) => [
    entry.blocker,
    new Set(entry.issues),
  ]),
);
const PROVENANCE_DECISIONS_DIRECTORY =
  'tools/test262/es2015-provenance-decisions';
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
  ...ES2015_PROVENANCE_DECISION_CODES.map(
    (code) => `${PROVENANCE_DECISIONS_DIRECTORY}/${code}.json`,
  ),
  'tools/test262/es2015-provenance.js',
  ES2015_PROVENANCE_FILE,
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
const EMPTY_DECISION_FRAGMENTS = Object.freeze(
  ES2015_PROVENANCE_DECISION_CODES.map(
    (code) => `${PROVENANCE_DECISIONS_DIRECTORY}/${code}.json`,
  ),
);
const FOUNDATION_MAINTENANCE_ALLOWED_PATHS = Object.freeze(
  sortStrings([
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
    ...EMPTY_DECISION_FRAGMENTS,
    'tools/test262/es2015-provenance.js',
    ES2015_PROVENANCE_FILE,
  ]),
);
const DECISION_GENERATED_PATHS = Object.freeze([
  'docs/conformance.md',
  'docs/test262-report.jsonl',
  'tools/test262/es2015-audit-evidence.json',
  'tools/test262/es2015-taxonomy.json',
]);
const ISSUE_77_LEXICAL_MAINTENANCE_PATHS = Object.freeze(
  sortStrings([
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
    ES2015_PROVENANCE_FILE,
    'tools/test262/es2015-taxonomy.json',
    'tools/test262/es5-selection.json',
    'tools/test262/upstream-subset.json',
  ]),
);
const ISSUE_77_LEXICAL_GENERATED_PATHS = Object.freeze(
  sortStrings([
    'docs/conformance.md',
    'docs/test262-report.jsonl',
    'tools/test262/es2015-audit-evidence.json',
    ES2015_PROVENANCE_FILE,
    'tools/test262/es2015-taxonomy.json',
    'tools/test262/upstream-subset.json',
  ]),
);
const APPROVED_RANGE_PROFILES = Object.freeze([
  Object.freeze({
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
  }),
  Object.freeze({
    name: 'foundation-maintenance',
    baseFoundation: 'present',
    requiredPaths: Object.freeze([]),
    allowedPaths: FOUNDATION_MAINTENANCE_ALLOWED_PATHS,
    requiredDeletions: Object.freeze([]),
    allowedDeletions: Object.freeze([]),
    emptyDecisionFragments: EMPTY_DECISION_FRAGMENTS,
    decisionFragment: null,
    generatedPaths: Object.freeze(
      sortStrings(['.github/workflows/ci.yml', ES2015_PROVENANCE_FILE]),
    ),
  }),
  Object.freeze({
    name: 'maintenance:issue77-lexical',
    baseFoundation: 'present',
    requiredPaths: ISSUE_77_LEXICAL_MAINTENANCE_PATHS,
    allowedPaths: ISSUE_77_LEXICAL_MAINTENANCE_PATHS,
    requiredDeletions: Object.freeze([]),
    allowedDeletions: Object.freeze([]),
    emptyDecisionFragments: Object.freeze([]),
    decisionFragment: null,
    generatedPaths: ISSUE_77_LEXICAL_GENERATED_PATHS,
  }),
  ...ES2015_PROVENANCE_DECISION_CODES.map((code) => {
    const decisionFragment = `${PROVENANCE_DECISIONS_DIRECTORY}/${code}.json`;
    return Object.freeze({
      name: `decision:${code}`,
      baseFoundation: 'present',
      requiredPaths: Object.freeze([decisionFragment]),
      allowedPaths: Object.freeze(
        sortStrings([decisionFragment, ...DECISION_GENERATED_PATHS]),
      ),
      requiredDeletions: Object.freeze([]),
      allowedDeletions: Object.freeze([]),
      emptyDecisionFragments: Object.freeze([]),
      decisionFragment,
      generatedPaths: DECISION_GENERATED_PATHS,
    });
  }),
]);
const APPROVED_SCHEMA_V3_RANGE_PROFILES = Object.freeze(
  APPROVED_RANGE_PROFILES.filter(
    (profile) => profile.name !== 'maintenance:issue77-lexical',
  ),
);

const MANIFEST_KEYS = Object.freeze([
  'version',
  'taxonomyBaseline',
  'repository',
  'revision',
  'specification',
  'parent',
  'blockerOwners',
  'rangeProfiles',
  'baseLedger',
  'batches',
]);
const MANIFEST_V3_KEYS = Object.freeze([
  ...MANIFEST_KEYS,
  'roadmapAuthorities',
]);
const SPECIFICATION_KEYS = Object.freeze(['source', 'sourceSha256']);
const PARENT_KEYS = Object.freeze(['code', 'issue']);
const BASE_LEDGER_KEYS = Object.freeze([
  'rootCount',
  'variantCount',
  'pathSha256',
  'paths',
]);
const BATCH_KEYS = Object.freeze([
  'code',
  'selector',
  'scope',
  'rootCount',
  'variantCount',
  'pathSha256',
  'entryLedgerSha256',
  'entries',
]);
const BATCH_ENTRY_KEYS = Object.freeze(['path', 'variants', 'priorClass']);
const ROADMAP_AUTHORITY_KEYS = Object.freeze([
  'code',
  'issue',
  'parentIssue',
  'state',
  'source',
  'reconciliation',
  'evidence',
  'protectedOutputs',
  'destinations',
]);
const ROADMAP_AUTHORITY_SOURCE_KEYS = Object.freeze([
  'baseTaxonomySha256',
  'rootCount',
  'variantCount',
  'pathSha256',
  'entryLedgerSha256',
]);
const ROADMAP_RECONCILIATION_KEYS = Object.freeze([
  'preservedTaxonomySha256',
  'authorityTaxonomySha256',
  'selectorPathSha256',
  'rootCount',
  'variantCount',
  'missingCount',
  'extraCount',
  'proofSha256',
]);
const ROADMAP_EVIDENCE_KEYS = Object.freeze(['path', 'sha256']);
const ROADMAP_PROTECTED_OUTPUT_KEYS = Object.freeze([
  'path',
  'operation',
  'baseSha256',
  'headSha256',
  'projectionSha256',
]);
const ROADMAP_DESTINATION_KEYS = Object.freeze(['status', 'blocker', 'issue']);
const FRAGMENT_KEYS = Object.freeze([
  'version',
  'taxonomyBaseline',
  'repository',
  'revision',
  'specification',
  'parent',
  'code',
  'decisions',
]);
const DECISION_KEYS = Object.freeze([
  'path',
  'variants',
  'priorClass',
  'finalPartition',
  'finalStatus',
  'evidenceKind',
  'specification',
  'metadata',
  'history',
  'rationale',
  'review',
  'destination',
  'artifactSha256',
]);
const DECISION_SPECIFICATION_KEYS = Object.freeze([
  'source',
  'sourceSha256',
  'clause',
  'anchor',
]);
const DECISION_METADATA_KEYS = Object.freeze([
  'es5id',
  'es6id',
  'esid',
  'features',
  'includeFeatures',
  'includes',
  'flags',
]);
const HISTORY_KEYS = Object.freeze(['repository', 'commit', 'note']);
const REVIEW_KEYS = Object.freeze(['reviewer', 'reviewedAt', 'artifact']);
const DESTINATION_KEYS = Object.freeze(['blocker', 'issue']);
const BLOCKER_OWNER_KEYS = Object.freeze(['blocker', 'issues']);
const RANGE_PROFILE_KEYS = Object.freeze([
  'name',
  'baseFoundation',
  'requiredPaths',
  'allowedPaths',
  'requiredDeletions',
  'allowedDeletions',
  'emptyDecisionFragments',
  'decisionFragment',
  'generatedPaths',
]);
const ISSUE_MAP_KEYS = Object.freeze([
  'version',
  'parent',
  'baseLedgerSha256',
  'issues',
]);
const ISSUE_MAP_ENTRY_KEYS = Object.freeze(['number', 'id', 'nodeId', 'state']);
const DECISION_KEYS_WITHOUT_HASH = Object.freeze(
  DECISION_KEYS.filter((key) => key !== 'artifactSha256'),
);
const ALL_RENDER_CODES = Object.freeze([
  'U0',
  'UA',
  'UB',
  'UL',
  'UL1',
  'UL2',
  'UL3',
  'UL4',
  'US',
  'US1',
  'US2',
  'US3',
  'US4',
  'US5',
  'US6',
  'US7',
]);
const ALL_RENDER_CODE_SET = new Set(ALL_RENDER_CODES);
const LANGUAGE_ASSIGNMENT_TOPICS = new Set([
  'assignmenttargettype',
  'assignment',
  'compound-assignment',
  'postfix-decrement',
  'postfix-increment',
  'prefix-decrement',
  'prefix-increment',
]);
const LANGUAGE_OBJECT_TOPICS = new Set(['object', 'class']);
const LANGUAGE_ENVIRONMENT_TOPICS = new Set([
  'arguments-object',
  'module-code',
  'eval-code',
  'function-code',
]);
const STAGING_US1_TOPICS = new Set([
  'Array',
  'TypedArray',
  'ArrayBuffer',
  'DataView',
  'Map',
  'Set',
  'Promise',
]);
const STAGING_US2_TOPICS = new Set(['RegExp', 'String', 'JSON']);
const STAGING_US3_TOPICS = new Set([
  'Math',
  'Number',
  'Date',
  'global',
  'Boolean',
  'Error',
  'Exceptions',
]);
const STAGING_US4_TOPICS = new Set([
  'Function',
  'object',
  'Symbol',
  'Proxy',
  'Reflect',
]);
const STAGING_US5_TOPICS = new Set([
  'class',
  'strict',
  'expressions',
  'lexical-environment',
  'generators',
  'eval',
  'statements',
  'syntax',
  'destructuring',
  'module',
  'literals',
  'argumentsLengthOpt.js',
]);
const STAGING_US6_TOPICS = new Set([
  'PrivateName',
  'async-functions',
  'fields',
  'BigInt',
  'AsyncGenerators',
]);
const STAGING_US7_TOPICS = new Set(['regress', 'extensions', 'misc', 'types']);
const SPECIAL_US6_PATH =
  'test/staging/built-ins/Array/prototype/flatMap/callback-with-side-effects.js';

/** @type {Readonly<Record<string, IssueDefinition>>} */
const ISSUE_DEFINITIONS = Object.freeze({
  U0: Object.freeze({
    title: 'Provenance tooling foundation',
    scope: 'Pure provenance tooling, rendering, and validation only',
    parentCode: 'T1',
    dependencies: Object.freeze([]),
    aggregateCodes: Object.freeze([]),
    extra: 'This node makes zero classification decisions.',
  }),
  UA: Object.freeze({
    title: 'Annex B decisions',
    scope: 'Annex B',
    parentCode: 'T1',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['UA']),
  }),
  UB: Object.freeze({
    title: 'Built-in decisions',
    scope: 'Built-ins',
    parentCode: 'T1',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['UB']),
  }),
  UL: Object.freeze({
    title: 'Language decisions',
    scope: 'Language decision grouping',
    parentCode: 'T1',
    dependencies: Object.freeze(['UL1', 'UL2', 'UL3', 'UL4']),
    aggregateCodes: Object.freeze(['UL1', 'UL2', 'UL3', 'UL4']),
    extra:
      'This grouping node owns no commit and closes only after its atomic children merge and reclassification balances exactly.',
  }),
  UL1: Object.freeze({
    title: 'Assignment and update semantics',
    scope: 'Assignment and update semantics',
    parentCode: 'UL',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['UL1']),
  }),
  UL2: Object.freeze({
    title: 'Object and class definitions',
    scope: 'Object and class definitions',
    parentCode: 'UL',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['UL2']),
  }),
  UL3: Object.freeze({
    title: 'Grammar and control semantics',
    scope: 'Grammar and control semantics',
    parentCode: 'UL',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['UL3']),
  }),
  UL4: Object.freeze({
    title: 'Environments and modules',
    scope: 'Environments and modules',
    parentCode: 'UL',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['UL4']),
  }),
  US: Object.freeze({
    title: 'Staging decisions',
    scope: 'SpiderMonkey staging decision grouping',
    parentCode: 'T1',
    dependencies: Object.freeze([
      'US1',
      'US2',
      'US3',
      'US4',
      'US5',
      'US6',
      'US7',
    ]),
    aggregateCodes: Object.freeze([
      'US1',
      'US2',
      'US3',
      'US4',
      'US5',
      'US6',
      'US7',
    ]),
    extra:
      'This grouping node owns no commit and closes only after its atomic children merge and reclassification balances exactly.',
  }),
  US1: Object.freeze({
    title: 'Containers and binary data',
    scope: 'Containers and binary data',
    parentCode: 'US',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['US1']),
  }),
  US2: Object.freeze({
    title: 'Patterns, text, and JSON',
    scope: 'Patterns, text, and JSON',
    parentCode: 'US',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['US2']),
  }),
  US3: Object.freeze({
    title: 'Numeric, date, and global semantics',
    scope: 'Numeric, date, and global semantics',
    parentCode: 'US',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['US3']),
  }),
  US4: Object.freeze({
    title: 'Metaobject, function, and Symbol semantics',
    scope: 'Metaobject, function, and Symbol semantics',
    parentCode: 'US',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['US4']),
  }),
  US5: Object.freeze({
    title: 'Staging language runtime',
    scope: 'Staging language runtime',
    parentCode: 'US',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['US5']),
  }),
  US6: Object.freeze({
    title: 'Affirmative post-ES2015 candidates',
    scope: 'Affirmative post-ES2015 candidates',
    parentCode: 'US',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['US6']),
  }),
  US7: Object.freeze({
    title: 'Residual manual semantics',
    scope: 'Residual manual semantics',
    parentCode: 'US',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['US7']),
  }),
});

/** @type {readonly BatchDefinition[]} */
const BATCH_DEFINITIONS = Object.freeze(
  ES2015_PROVENANCE_DECISION_CODES.map((code) =>
    Object.freeze({
      code,
      selector: selectorForCode(code),
      scope: ISSUE_DEFINITIONS[code].scope,
    }),
  ),
);
const APPROVED_BASE_LEDGER = Object.freeze({
  rootCount: 2312,
  variantCount: 4054,
  pathSha256:
    '56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc',
});
/** @type {Readonly<Record<string, ApprovedBatchLedger>>} */
const APPROVED_BATCH_LEDGERS = Object.freeze({
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
});

export class Es2015ProvenanceError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'Es2015ProvenanceError';
  }
}

/** @param {string} text */
export function parseEs2015ProvenanceManifest(text) {
  return validateRoadmapAuthorityManifest(
    parseJson(text, ES2015_PROVENANCE_FILE),
  );
}

/** @param {unknown} authority */
export function canonicalRoadmapAuthoritySha256(authority) {
  const normalized = normalizeRoadmapAuthority(
    /** @type {Record<string, any>} */ (structuredClone(authority)),
    'roadmap authority',
  );
  return sha256(`${JSON.stringify(normalized)}\n`);
}

/** @param {unknown} manifest */
export function validateRoadmapAuthorityManifest(manifest) {
  return deepFreeze(
    normalizeManifestRecord(object(manifest, ES2015_PROVENANCE_FILE), {
      exactLists: true,
      exactTopLevelMessage: `${ES2015_PROVENANCE_FILE} must contain exact keys`,
    }),
  );
}

/**
 * @param {string} baseTaxonomy
 * @param {string} authorityTaxonomy
 * @param {unknown} authority
 * @returns {RoadmapReconciliation | null}
 */
export function validateRoadmapReconciliation(
  baseTaxonomy,
  authorityTaxonomy,
  authority,
) {
  const normalizedAuthority = normalizeRoadmapAuthority(
    /** @type {Record<string, any>} */ (structuredClone(authority)),
    'roadmap authority',
  );
  const reconciliation = normalizedAuthority.reconciliation;
  if (reconciliation === null) {
    return null;
  }
  const baseTaxonomySha256 = sha256(baseTaxonomy);
  if (baseTaxonomySha256 !== normalizedAuthority.source.baseTaxonomySha256) {
    throw new Es2015ProvenanceError(
      `${normalizedAuthority.code} roadmap authority base taxonomy SHA-256 does not match authority.source.baseTaxonomySha256`,
    );
  }
  if (baseTaxonomySha256 !== reconciliation.authorityTaxonomySha256) {
    throw new Es2015ProvenanceError(
      `${normalizedAuthority.code} roadmap authority reconciliation authority taxonomy SHA-256 does not match the reviewed base taxonomy`,
    );
  }
  const preservedTaxonomySha256 = sha256(authorityTaxonomy);
  if (preservedTaxonomySha256 !== reconciliation.preservedTaxonomySha256) {
    throw new Es2015ProvenanceError(
      `${normalizedAuthority.code} roadmap authority reconciliation preserved taxonomy SHA-256 does not match the reviewed source taxonomy`,
    );
  }

  const baseSelector = summarizeRoadmapReconciliationSelector(
    baseTaxonomy,
    `${normalizedAuthority.code} roadmap authority base taxonomy`,
  );
  const preservedSelector = summarizeRoadmapReconciliationSelector(
    authorityTaxonomy,
    `${normalizedAuthority.code} roadmap authority preserved taxonomy`,
  );
  validateRoadmapReconciliationSelector(
    baseSelector,
    normalizedAuthority,
    reconciliation,
    `${normalizedAuthority.code} roadmap authority base taxonomy`,
  );
  validateRoadmapReconciliationSelector(
    preservedSelector,
    normalizedAuthority,
    reconciliation,
    `${normalizedAuthority.code} roadmap authority preserved taxonomy`,
  );

  const basePathSet = new Set(baseSelector.paths);
  const preservedPathSet = new Set(preservedSelector.paths);
  const missingCount = countRoadmapPathDifference(
    preservedSelector.paths,
    basePathSet,
  );
  const extraCount = countRoadmapPathDifference(
    baseSelector.paths,
    preservedPathSet,
  );
  if (
    missingCount !== reconciliation.missingCount ||
    extraCount !== reconciliation.extraCount
  ) {
    throw new Es2015ProvenanceError(
      `${normalizedAuthority.code} roadmap authority reconciliation must retain exact selector membership`,
    );
  }
  const actualProofSha256 = roadmapReconciliationProofSha256({
    preservedTaxonomySha256,
    authorityTaxonomySha256: baseTaxonomySha256,
    selectorPathSha256: baseSelector.pathSha256,
    rootCount: baseSelector.rootCount,
    variantCount: baseSelector.variantCount,
    missingCount,
    extraCount,
    proofSha256: reconciliation.proofSha256,
  });
  if (actualProofSha256 !== reconciliation.proofSha256) {
    throw new Es2015ProvenanceError(
      `${normalizedAuthority.code} roadmap authority reconciliation proof does not match the reviewed taxonomy artifacts`,
    );
  }
  return deepFreeze({
    ...reconciliation,
    proofSha256: actualProofSha256,
  });
}

/** @param {unknown} manifest */
export function renderEs2015ProvenanceManifest(manifest) {
  return `${JSON.stringify(validateRoadmapAuthorityManifest(manifest), null, 2)}\n`;
}

/** @param {string} text @param {string} expectedCode */
export function parseEs2015DecisionFragment(text, expectedCode) {
  assertDecisionCode(expectedCode);
  return deepFreeze(
    normalizeDecisionFragmentRecord(
      parseJson(text, `${expectedCode} decision fragment`),
      expectedCode,
      { exactLists: true },
    ),
  );
}

/**
 * @param {readonly ClassificationRecord[]} classifications
 * @param {{ version?: number, roadmapAuthorities?: readonly RoadmapAuthority[] }} [options]
 * @returns {ProvenanceManifest}
 */
export function buildProvenanceFoundation(classifications, options = {}) {
  if (!Array.isArray(classifications)) {
    throw new Es2015ProvenanceError(
      'ES2015 provenance foundation requires classifications',
    );
  }
  const version = options.version ?? 2;
  if (!ES2015_PROVENANCE_MANIFEST_VERSIONS.includes(version)) {
    throw new Es2015ProvenanceError(
      `ES2015 provenance foundation must declare manifest version ${ES2015_PROVENANCE_MANIFEST_VERSIONS.join(' or ')}`,
    );
  }
  const hasRoadmapAuthorities = Object.prototype.hasOwnProperty.call(
    options,
    'roadmapAuthorities',
  );
  if (version === 3 && !hasRoadmapAuthorities) {
    throw new Es2015ProvenanceError(
      'ES2015 provenance foundation version 3 requires roadmapAuthorities option',
    );
  }
  const roadmapAuthorities = hasRoadmapAuthorities
    ? options.roadmapAuthorities
    : [];
  if (version === 2) {
    if (!Array.isArray(roadmapAuthorities) || roadmapAuthorities.length !== 0) {
      throw new Es2015ProvenanceError(
        'ES2015 provenance foundation version 2 must not include roadmap authorities',
      );
    }
  }
  const normalizedRoadmapAuthorities =
    version === 3
      ? normalizeRoadmapAuthorities(
          roadmapAuthorities,
          `${ES2015_PROVENANCE_FILE} roadmapAuthorities`,
        )
      : undefined;

  const unknownRecords = classifications
    .filter((record) => {
      const normalized = normalizeClassificationRecord(record);
      return normalized.partition === 'unknown-edition';
    })
    .map((record) => normalizeClassificationRecord(record));
  const baseEntries = sortStrings(unknownRecords.map((record) => record.path));
  assertUnique(baseEntries, 'ES2015 provenance base ledger paths');
  /** @type {Map<string, ProvenanceBatchEntry[]>} */
  const batchEntries = new Map(
    ES2015_PROVENANCE_DECISION_CODES.map((code) => [code, []]),
  );

  for (const record of unknownRecords) {
    const code = decisionCodeForPath(record.path);
    const entries = batchEntries.get(code);
    if (entries === undefined) {
      throw new Es2015ProvenanceError(`Unknown provenance batch ${code}`);
    }
    entries.push(
      Object.freeze({
        path: record.path,
        variants: record.variants,
        priorClass: record.finalClass,
      }),
    );
  }

  const batches = BATCH_DEFINITIONS.map((definition) => {
    const entries = sortEntries(batchEntries.get(definition.code) ?? []);
    const paths = entries.map((entry) => entry.path);
    return Object.freeze({
      code: definition.code,
      selector: definition.selector,
      scope: definition.scope,
      rootCount: entries.length,
      variantCount: entries.reduce((sum, entry) => sum + entry.variants, 0),
      pathSha256: hashPaths(paths),
      entryLedgerSha256: hashEntryLedger(entries),
      entries: Object.freeze(entries),
    });
  });

  const foundation = {
    version,
    taxonomyBaseline: TAXONOMY_BASELINE,
    repository: TEST262_REPOSITORY,
    revision: TEST262_REVISION,
    specification: {
      source: SPECIFICATION_SOURCE,
      sourceSha256: SPECIFICATION_SHA256,
    },
    parent: {
      code: PARENT_CODE,
      issue: PARENT_ISSUE,
    },
    blockerOwners: APPROVED_BLOCKER_OWNERS,
    rangeProfiles:
      version === 3
        ? APPROVED_SCHEMA_V3_RANGE_PROFILES
        : APPROVED_RANGE_PROFILES,
    baseLedger: {
      rootCount: baseEntries.length,
      variantCount: unknownRecords.reduce(
        (sum, entry) => sum + entry.variants,
        0,
      ),
      pathSha256: hashPaths(baseEntries),
      paths: baseEntries,
    },
    batches,
  };

  return deepFreeze(
    version === 3
      ? {
          ...foundation,
          roadmapAuthorities: /** @type {readonly RoadmapAuthority[]} */ (
            normalizedRoadmapAuthorities
          ),
        }
      : foundation,
  );
}

/**
 * @param {unknown} manifest
 * @param {readonly ClassificationRecord[]} [classifications]
 * @param {{ expectedRoadmapAuthorities?: readonly RoadmapAuthority[] }} [options]
 */
export function validateProvenanceFoundation(
  manifest,
  classifications,
  options = {},
) {
  const normalizedManifest = normalizeManifestRecord(
    object(manifest, ES2015_PROVENANCE_FILE),
    {
      exactLists: false,
      exactTopLevelMessage: `${ES2015_PROVENANCE_FILE} must contain exact keys`,
    },
  );
  validateManifestStructure(normalizedManifest);
  const hasExpectedRoadmapAuthorities = Object.prototype.hasOwnProperty.call(
    options,
    'expectedRoadmapAuthorities',
  );
  const expectedRoadmapAuthorities = hasExpectedRoadmapAuthorities
    ? normalizeRoadmapAuthorities(
        options.expectedRoadmapAuthorities,
        `${ES2015_PROVENANCE_FILE} expected roadmapAuthorities`,
      )
    : undefined;
  if (classifications !== undefined) {
    if (normalizedManifest.version === 3 && !hasExpectedRoadmapAuthorities) {
      throw new Es2015ProvenanceError(
        `${ES2015_PROVENANCE_FILE} version 3 validation requires expected roadmapAuthorities`,
      );
    }
    const expected = buildProvenanceFoundation(classifications, {
      version: normalizedManifest.version,
      ...(normalizedManifest.version === 3
        ? {
            roadmapAuthorities: /** @type {readonly RoadmapAuthority[]} */ (
              expectedRoadmapAuthorities
            ),
          }
        : {}),
    });
    validateManifestAgainstExpected(
      normalizedManifest,
      expected,
      'reviewed ledger',
    );
  } else if (
    normalizedManifest.version === 3 &&
    hasExpectedRoadmapAuthorities
  ) {
    validateRoadmapAuthoritiesAgainstExpected(
      normalizedManifest.roadmapAuthorities ?? [],
      /** @type {readonly RoadmapAuthority[]} */ (expectedRoadmapAuthorities),
      'reviewed ledger',
    );
  }
  validateImmutableApprovedFoundation(normalizedManifest);
}

/** @param {ProvenanceManifest} manifest */
function validateManifestStructure(manifest) {
  const actualBasePaths = [...manifest.baseLedger.paths];
  if (!isSorted(actualBasePaths)) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} base ledger must remain code-unit sorted`,
    );
  }
  assertUniqueBasePaths(
    actualBasePaths,
    `${ES2015_PROVENANCE_FILE} base ledger`,
  );
  if (manifest.baseLedger.rootCount !== actualBasePaths.length) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} base ledger root count does not match its reviewed bytes`,
    );
  }
  if (manifest.baseLedger.pathSha256 !== hashPaths(actualBasePaths)) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} base ledger SHA-256 does not match its reviewed bytes`,
    );
  }

  const actualBaseSet = new Set(actualBasePaths);
  const batchPathOwners = new Map();
  let batchVariantCount = 0;
  for (const definition of BATCH_DEFINITIONS) {
    const actual = batchByCode(manifest, definition.code);
    if (actual.selector !== definition.selector) {
      throw new Es2015ProvenanceError(
        `${definition.code} must retain selector ${definition.selector}`,
      );
    }
    if (actual.scope !== definition.scope) {
      throw new Es2015ProvenanceError(
        `${definition.code} must retain scope ${definition.scope}`,
      );
    }
    const actualPaths = actual.entries.map((entry) => entry.path);
    if (!isSorted(actualPaths)) {
      throw new Es2015ProvenanceError(
        `${actual.code} batch ledger must remain code-unit sorted`,
      );
    }
    const duplicates = duplicatesOf(actualPaths);
    if (duplicates.length > 0) {
      throw new Es2015ProvenanceError(
        `${actual.code} batch ledger must not repeat base paths`,
      );
    }
    for (const entry of actual.entries) {
      const owner = batchPathOwners.get(entry.path);
      if (owner !== undefined) {
        throw new Es2015ProvenanceError(
          `Base path ${entry.path} appears in more than one provenance batch`,
        );
      }
      batchPathOwners.set(entry.path, actual.code);
      if (!actualBaseSet.has(entry.path)) {
        throw new Es2015ProvenanceError(
          `${actual.code} batch ledger has unexpected non-base path ${entry.path}`,
        );
      }
      batchVariantCount += entry.variants;
    }
    if (actual.entryLedgerSha256 !== hashEntryLedger(actual.entries)) {
      throw new Es2015ProvenanceError(
        `${actual.code} entry ledger SHA-256 does not match its reviewed bytes`,
      );
    }
    if (actual.rootCount !== actual.entries.length) {
      throw new Es2015ProvenanceError(
        `${actual.code} root count does not match its reviewed ledger`,
      );
    }
    if (
      actual.variantCount !==
      actual.entries.reduce((sum, entry) => sum + entry.variants, 0)
    ) {
      throw new Es2015ProvenanceError(
        `${actual.code} variant count does not match its reviewed ledger`,
      );
    }
    if (actual.pathSha256 !== hashPaths(actualPaths)) {
      throw new Es2015ProvenanceError(
        `${actual.code} path ledger SHA-256 does not match its reviewed bytes`,
      );
    }
  }

  for (const path of actualBasePaths) {
    if (!batchPathOwners.has(path)) {
      throw new Es2015ProvenanceError(
        `Base path ${path} does not appear in any provenance batch`,
      );
    }
  }
  if (manifest.baseLedger.variantCount !== batchVariantCount) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} base ledger variant count does not match its reviewed bytes`,
    );
  }
}

/** @param {ProvenanceManifest} manifest @param {ProvenanceManifest} expected @param {string} ledgerLabel */
function validateManifestAgainstExpected(manifest, expected, ledgerLabel) {
  const actualBasePaths = manifest.baseLedger.paths;
  const expectedBasePaths = expected.baseLedger.paths;
  const actualBaseSet = new Set(actualBasePaths);
  const expectedBaseSet = new Set(expectedBasePaths);
  for (const path of expectedBasePaths) {
    if (!actualBaseSet.has(path)) {
      throw new Es2015ProvenanceError(`Base ledger is missing path ${path}`);
    }
  }
  for (const path of actualBasePaths) {
    if (!expectedBaseSet.has(path)) {
      throw new Es2015ProvenanceError(
        `Base ledger has unexpected path ${path}`,
      );
    }
  }
  for (const definition of BATCH_DEFINITIONS) {
    const actual = batchByCode(manifest, definition.code);
    const expectedBatch = batchByCode(expected, definition.code);
    const actualPaths = actual.entries.map((entry) => entry.path);
    const actualPathSet = new Set(actualPaths);
    const expectedPathSet = new Set(
      expectedBatch.entries.map((entry) => entry.path),
    );
    for (const path of expectedPathSet) {
      if (!actualPathSet.has(path)) {
        throw new Es2015ProvenanceError(
          `${actual.code} batch ledger is missing path ${path}`,
        );
      }
    }
    for (const path of actualPaths) {
      if (!expectedPathSet.has(path)) {
        throw new Es2015ProvenanceError(
          `${actual.code} batch ledger has unexpected path ${path}`,
        );
      }
    }
    const expectedEntries = new Map(
      expectedBatch.entries.map((entry) => [entry.path, entry]),
    );
    for (const entry of actual.entries) {
      const expectedEntry = expectedEntries.get(entry.path);
      if (expectedEntry === undefined) {
        throw new Es2015ProvenanceError(
          `${actual.code} batch ledger has unexpected path ${entry.path}`,
        );
      }
      if (entry.variants !== expectedEntry.variants) {
        throw new Es2015ProvenanceError(
          `${actual.code} variant count for ${entry.path} does not match the ${ledgerLabel}`,
        );
      }
      if (entry.priorClass !== expectedEntry.priorClass) {
        throw new Es2015ProvenanceError(
          `${actual.code} prior class for ${entry.path} does not match the ${ledgerLabel}`,
        );
      }
    }
    if (actual.rootCount !== expectedBatch.rootCount) {
      throw new Es2015ProvenanceError(
        `${actual.code} root count does not match the ${ledgerLabel}`,
      );
    }
    if (actual.variantCount !== expectedBatch.variantCount) {
      throw new Es2015ProvenanceError(
        `${actual.code} variant count does not match the ${ledgerLabel}`,
      );
    }
    if (actual.pathSha256 !== expectedBatch.pathSha256) {
      throw new Es2015ProvenanceError(
        `${actual.code} path ledger SHA-256 does not match the ${ledgerLabel}`,
      );
    }
    if (actual.entryLedgerSha256 !== expectedBatch.entryLedgerSha256) {
      throw new Es2015ProvenanceError(
        `${actual.code} entry ledger SHA-256 does not match the ${ledgerLabel}`,
      );
    }
  }
  if (manifest.baseLedger.rootCount !== expected.baseLedger.rootCount) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} base ledger root count does not match the ${ledgerLabel}`,
    );
  }
  if (manifest.baseLedger.variantCount !== expected.baseLedger.variantCount) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} base ledger variant count does not match the ${ledgerLabel}`,
    );
  }
  if (manifest.baseLedger.pathSha256 !== expected.baseLedger.pathSha256) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} base ledger SHA-256 does not match the ${ledgerLabel}`,
    );
  }
  if (manifest.version !== expected.version) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} version does not match the ${ledgerLabel}`,
    );
  }
  if (manifest.version === 3) {
    validateRoadmapAuthoritiesAgainstExpected(
      manifest.roadmapAuthorities ?? [],
      expected.roadmapAuthorities ?? [],
      ledgerLabel,
    );
  }
}

/**
 * @param {readonly RoadmapAuthority[]} actual
 * @param {readonly RoadmapAuthority[]} expected
 * @param {string} ledgerLabel
 */
function validateRoadmapAuthoritiesAgainstExpected(
  actual,
  expected,
  ledgerLabel,
) {
  const actualCodes = actual.map((authority) => authority.code);
  const expectedCodes = expected.map((authority) => authority.code);
  for (const code of expectedCodes) {
    if (!actualCodes.includes(code)) {
      throw new Es2015ProvenanceError(
        `${code} roadmap authority is missing from the ${ledgerLabel}`,
      );
    }
  }
  for (const code of actualCodes) {
    if (!expectedCodes.includes(code)) {
      throw new Es2015ProvenanceError(
        `${code} roadmap authority is unexpected in the ${ledgerLabel}`,
      );
    }
  }
  const expectedByCode = new Map(
    expected.map((authority) => [authority.code, authority]),
  );
  for (const authority of actual) {
    const expectedAuthority = expectedByCode.get(authority.code);
    if (expectedAuthority === undefined) {
      throw new Es2015ProvenanceError(
        `${authority.code} roadmap authority is unexpected in the ${ledgerLabel}`,
      );
    }
    if (
      canonicalRoadmapAuthoritySha256(authority) !==
      canonicalRoadmapAuthoritySha256(expectedAuthority)
    ) {
      throw new Es2015ProvenanceError(
        `${authority.code} roadmap authority does not match the ${ledgerLabel}`,
      );
    }
  }
}

/** @param {ProvenanceManifest} manifest */
function validateImmutableApprovedFoundation(manifest) {
  const approvedRangeProfiles =
    manifest.version === 3
      ? APPROVED_SCHEMA_V3_RANGE_PROFILES
      : APPROVED_RANGE_PROFILES;
  if (manifest.baseLedger.rootCount !== APPROVED_BASE_LEDGER.rootCount) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} base ledger root count does not match the approved immutable ledger`,
    );
  }
  if (manifest.baseLedger.variantCount !== APPROVED_BASE_LEDGER.variantCount) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} base ledger variant count does not match the approved immutable ledger`,
    );
  }
  if (manifest.baseLedger.pathSha256 !== APPROVED_BASE_LEDGER.pathSha256) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} base ledger SHA-256 does not match the approved immutable ledger`,
    );
  }
  for (const batch of manifest.batches) {
    const approved = APPROVED_BATCH_LEDGERS[batch.code];
    if (approved === undefined) {
      throw new Es2015ProvenanceError(
        `${batch.code} is not an approved ES2015 provenance decision code`,
      );
    }
    if (batch.rootCount !== approved.rootCount) {
      throw new Es2015ProvenanceError(
        `${batch.code} root count does not match the approved immutable ledger`,
      );
    }
    if (batch.variantCount !== approved.variantCount) {
      throw new Es2015ProvenanceError(
        `${batch.code} variant count does not match the approved immutable ledger`,
      );
    }
    if (batch.pathSha256 !== approved.pathSha256) {
      throw new Es2015ProvenanceError(
        `${batch.code} path ledger SHA-256 does not match the approved immutable ledger`,
      );
    }
    if (batch.entryLedgerSha256 !== approved.entryLedgerSha256) {
      throw new Es2015ProvenanceError(
        `${batch.code} entry ledger SHA-256 does not match the approved immutable ledger`,
      );
    }
  }
  if (
    JSON.stringify(manifest.blockerOwners) !==
    JSON.stringify(APPROVED_BLOCKER_OWNERS)
  ) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} blocker owners do not match the approved immutable roadmap pairs`,
    );
  }
  if (
    JSON.stringify(manifest.rangeProfiles) !==
    JSON.stringify(approvedRangeProfiles)
  ) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} range profiles do not match the approved immutable policy`,
    );
  }
}

/**
 * @param {unknown} manifest
 * @param {unknown} fragments
 * @param {{ allowPendingReview?: boolean, requireCompleteCodes?: readonly string[] }} [options]
 * @returns {ReadonlyMap<string, ReviewedDecision>}
 */
export function validateDecisionFragments(manifest, fragments, options = {}) {
  const normalizedManifest = normalizeManifestRecord(
    object(manifest, ES2015_PROVENANCE_FILE),
    {
      exactLists: false,
      exactTopLevelMessage: `${ES2015_PROVENANCE_FILE} must contain exact keys`,
    },
  );
  validateProvenanceFoundation(normalizedManifest);
  const allowPendingReview = options.allowPendingReview === true;
  const requireCompleteCodes = normalizeRequiredCodes(
    options.requireCompleteCodes,
  );
  const fragmentMap = normalizeFragments(fragments);
  /** @type {Map<string, ReviewedDecision>} */
  const decisions = new Map();

  for (const [code, value] of fragmentMap) {
    const fragment = normalizeDecisionFragmentRecord(
      object(value, `${code} decision fragment`),
      code,
      {
        exactLists: true,
      },
    );
    const batch = batchByCode(normalizedManifest, code);
    const expectedPaths = new Set(batch.entries.map((entry) => entry.path));
    const fragmentPaths = new Set();

    for (const rawDecision of fragment.decisions) {
      const decision = normalizeDecisionRecord(rawDecision, {
        code,
        exactLists: true,
        allowPendingReview,
        requireArtifactSha256: true,
        skipSemanticValidation: false,
      });
      if (!expectedPaths.has(decision.path)) {
        throw new Es2015ProvenanceError(
          `${code} decision for ${decision.path} is not in the ${code} ledger`,
        );
      }
      if (fragmentPaths.has(decision.path) || decisions.has(decision.path)) {
        throw new Es2015ProvenanceError(
          `${code} repeats reviewed decision ${decision.path}`,
        );
      }
      fragmentPaths.add(decision.path);
      const expectedEntry = batch.entries.find(
        (entry) => entry.path === decision.path,
      );
      if (expectedEntry === undefined) {
        throw new Es2015ProvenanceError(
          `${code} decision for ${decision.path} is not in the ${code} ledger`,
        );
      }
      if (decision.variants !== expectedEntry.variants) {
        throw new Es2015ProvenanceError(
          `${code} decision for ${decision.path} must retain the reviewed variant count`,
        );
      }
      if (decision.priorClass !== expectedEntry.priorClass) {
        throw new Es2015ProvenanceError(
          `${code} decision for ${decision.path} must retain the reviewed prior class`,
        );
      }
      decisions.set(decision.path, deepFreeze(decision));
    }

    if (
      requireCompleteCodes.has(code) &&
      fragmentPaths.size !== expectedPaths.size
    ) {
      throw new Es2015ProvenanceError(
        `${code} must contain reviewed decisions for every ledger path`,
      );
    }
  }
  for (const code of requireCompleteCodes) {
    if (!fragmentMap.has(code)) {
      throw new Es2015ProvenanceError(
        `${code} decision fragment is required when complete-code validation is enabled`,
      );
    }
  }

  return new Map(decisions);
}

/** @param {unknown} decision */
export function canonicalDecisionSha256(decision) {
  const candidate = { ...object(decision, 'decision') };
  delete candidate.artifactSha256;
  const normalized = normalizeDecisionRecord(candidate, {
    code: 'decision',
    exactLists: true,
    allowPendingReview: true,
    requireArtifactSha256: false,
    skipSemanticValidation: true,
  });
  const canonical = canonicalDecisionRecord(normalized, false);
  return sha256(JSON.stringify(canonical));
}

/** @param {unknown} manifest @param {string} code */
export function renderBatchLedger(manifest, code) {
  if (!ES2015_PROVENANCE_DECISION_CODES.includes(code)) {
    throw new Es2015ProvenanceError(
      `${code} is not a known provenance ledger code`,
    );
  }
  const normalizedManifest = normalizeManifestRecord(
    object(manifest, ES2015_PROVENANCE_FILE),
    {
      exactLists: false,
      exactTopLevelMessage: `${ES2015_PROVENANCE_FILE} must contain exact keys`,
    },
  );
  validateProvenanceFoundation(normalizedManifest);
  const batch = batchByCode(normalizedManifest, code);
  return `${batch.entries.map((entry) => entry.path).join('\n')}\n`;
}

/** @param {unknown} manifest @param {string} code @param {unknown} [issueMap] */
export function renderProvenanceIssueBody(manifest, code, issueMap) {
  const definition = ISSUE_DEFINITIONS[code];
  if (definition === undefined) {
    throw new Es2015ProvenanceError(
      `${code} is not a known provenance issue code`,
    );
  }
  const normalizedManifest = normalizeManifestRecord(
    object(manifest, ES2015_PROVENANCE_FILE),
    {
      exactLists: false,
      exactTopLevelMessage: `${ES2015_PROVENANCE_FILE} must contain exact keys`,
    },
  );
  validateProvenanceFoundation(normalizedManifest);
  const issues = normalizeIssueMap(issueMap);
  const ledger = renderLedgerSummary(normalizedManifest, code);
  const dependencies = definition.dependencies.map((dependencyCode) =>
    issues === null
      ? dependencyCode
      : renderIssueReference(dependencyCode, issues),
  );
  const nativeParent =
    definition.parentCode === PARENT_CODE
      ? `${PARENT_CODE} (#${PARENT_ISSUE})`
      : issues === null
        ? definition.parentCode
        : renderIssueReference(definition.parentCode, issues);
  const grouping = code === 'UL' || code === 'US';
  const lines = [
    `<!-- es2015-provenance-issue parent:T1 parent-issue:75 code:${code} base-ledger-sha256:${normalizedManifest.baseLedger.pathSha256} -->`,
    `# ${code} — ${definition.title}`,
    '',
    ...(issues === null
      ? []
      : [`Issue: ${renderIssueReference(code, issues)}.`]),
    `Roadmap parent: T1 / #75.`,
    `Native parent: ${nativeParent}.`,
    `Base ledger: ${normalizedManifest.baseLedger.rootCount} roots / ${normalizedManifest.baseLedger.variantCount} variants / SHA-256 ${normalizedManifest.baseLedger.pathSha256}.`,
    `Batch ledger: ${ledger.rootCount} roots / ${ledger.variantCount} variants / SHA-256 ${ledger.pathSha256}.`,
    `jsjs taxonomy baseline: ${TAXONOMY_BASELINE}.`,
    `Test262 pin: ${TEST262_REPOSITORY} @ ${TEST262_REVISION}.`,
    `Sixth Edition pin: ${SPECIFICATION_SOURCE} @ ${SPECIFICATION_SHA256}.`,
    `Scope: ${definition.scope}.`,
    'Non-goals: guest runtime behavior, tools/test262/features.json, and broad selection changes.',
    'Evidence method: reviewed Sixth Edition or later-spec proof only.',
    'History, age, path/directory, and source/text similarity may prioritize review but can never decide edition.',
    dependencies.length === 0
      ? 'Dependencies: none.'
      : `Dependencies: ${dependencies.join(', ')}.`,
    'Independent specification review and independent quality/provenance review are required.',
    'Generate artifacts and timestamps with TZ=UTC.',
    'Local Test262 commands are limited to metadata/audit checks or exact targeted paths only.',
    'Require exact-head CI before merge.',
    'Require exact-head CodeQL before merge.',
    'After merge, rerun reclassification under TZ=UTC and update affected downstream issue ledgers before closing.',
    'Guest production changes are prohibited.',
    ...(grouping
      ? []
      : [
          'Changes are limited to taxonomy/provenance tooling, data, and documentation; guest semantic fixes are prohibited.',
        ]),
  ];

  if (definition.extra !== undefined) {
    lines.push(definition.extra);
  }

  return `${lines.join('\n')}\n`;
}

/** @param {string} code */
function selectorForCode(code) {
  switch (code) {
    case 'UA':
      return 'test/annexB/**';
    case 'UB':
      return 'test/built-ins/**';
    case 'UL1':
      return 'test/language/expressions/{assignmenttargettype,assignment,compound-assignment,postfix-decrement,postfix-increment,prefix-decrement,prefix-increment}/**';
    case 'UL2':
      return 'test/language/expressions/{object,class}/** + test/language/statements/class/**';
    case 'UL3':
      return 'remaining test/language/** after UL1, UL2, and UL4';
    case 'UL4':
      return 'test/language/{arguments-object,module-code,eval-code,function-code}/**';
    case 'US1':
      return 'test/staging/sm/{Array,TypedArray,ArrayBuffer,DataView,Map,Set,Promise}/**';
    case 'US2':
      return 'test/staging/sm/{RegExp,String,JSON}/**';
    case 'US3':
      return 'test/staging/sm/{Math,Number,Date,global,Boolean,Error,Exceptions}/**';
    case 'US4':
      return 'test/staging/sm/{Function,object,Symbol,Proxy,Reflect}/**';
    case 'US5':
      return 'test/staging/sm/{class,strict,expressions,lexical-environment,generators,eval,statements,syntax,destructuring,module,literals,argumentsLengthOpt.js}/**';
    case 'US6':
      return 'test/staging/sm/{PrivateName,async-functions,fields,BigInt,AsyncGenerators}/** + test/staging/built-ins/Array/prototype/flatMap/callback-with-side-effects.js';
    case 'US7':
      return 'test/staging/sm/{regress,extensions,misc,types}/**';
    default:
      throw new Es2015ProvenanceError(
        `${code} is not an approved ES2015 provenance decision code`,
      );
  }
}

/** @param {unknown} value @param {string} label */
function parseJson(value, label) {
  if (typeof value !== 'string') {
    throw new Es2015ProvenanceError(`${label} must be JSON text`);
  }
  try {
    return object(JSON.parse(value), label);
  } catch (error) {
    if (error instanceof Es2015ProvenanceError) throw error;
    throw new Es2015ProvenanceError(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** @param {unknown} value @param {string} label */
function object(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Es2015ProvenanceError(`${label} must be an object`);
  }
  return /** @type {Record<string, any>} */ (value);
}

/**
 * @param {Record<string, any>} record
 * @param {readonly string[]} expectedKeys
 * @param {string} message
 */
function requireExactKeys(record, expectedKeys, message) {
  const keys = Object.keys(record);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => !expectedKeys.includes(key)) ||
    expectedKeys.some(
      (key) => !Object.prototype.hasOwnProperty.call(record, key),
    )
  ) {
    throw new Es2015ProvenanceError(message);
  }
}

/**
 * @param {Record<string, any>} record
 * @param {{ exactLists: boolean, exactTopLevelMessage: string }} options
 * @returns {ProvenanceManifest}
 */
function normalizeManifestRecord(record, options) {
  if (record.version === 3) {
    requireExactKeys(record, MANIFEST_V3_KEYS, options.exactTopLevelMessage);
    return {
      ...normalizeManifestFoundationRecord(record, options, 3),
      roadmapAuthorities: normalizeRoadmapAuthorities(
        record.roadmapAuthorities,
        `${ES2015_PROVENANCE_FILE} roadmapAuthorities`,
      ),
    };
  }
  requireExactKeys(record, MANIFEST_KEYS, options.exactTopLevelMessage);
  return normalizeManifestFoundationRecord(record, options, 2);
}

/**
 * @param {Record<string, any>} record
 * @param {{ exactLists: boolean }} options
 * @param {2 | 3} version
 * @returns {ProvenanceManifest}
 */
function normalizeManifestFoundationRecord(record, options, version) {
  if (record.version !== version) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} must declare version ${ES2015_PROVENANCE_MANIFEST_VERSIONS.join(' or ')}`,
    );
  }
  if (record.taxonomyBaseline !== TAXONOMY_BASELINE) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} must retain the reviewed jsjs taxonomy baseline`,
    );
  }
  validateReviewedRepositoryRevision(
    record.repository,
    record.revision,
    `${ES2015_PROVENANCE_FILE} must retain the reviewed Test262 repository and revision`,
  );
  const specification = normalizeIdentitySpecification(
    object(record.specification, `${ES2015_PROVENANCE_FILE} specification`),
    `${ES2015_PROVENANCE_FILE} specification must contain exact keys`,
    `${ES2015_PROVENANCE_FILE} must retain the reviewed Sixth Edition source identity`,
  );
  const parent = normalizeParent(
    object(record.parent, `${ES2015_PROVENANCE_FILE} parent`),
    `${ES2015_PROVENANCE_FILE} parent must contain exact keys`,
    `${ES2015_PROVENANCE_FILE} must retain parent T1 / #75`,
  );
  const blockerOwners = normalizeBlockerOwners(record.blockerOwners);
  const rangeProfiles = normalizeRangeProfiles(record.rangeProfiles, version);
  const baseLedger = normalizeBaseLedger(
    object(record.baseLedger, `${ES2015_PROVENANCE_FILE} baseLedger`),
    options.exactLists,
  );
  if (!Array.isArray(record.batches)) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} batches must be an array`,
    );
  }
  const batches = record.batches.map((batch) =>
    normalizeBatchRecord(
      object(batch, `${ES2015_PROVENANCE_FILE} batch`),
      options.exactLists,
    ),
  );
  const codes = batches.map((batch) => batch.code);
  if (
    codes.join('\u0000') !== ES2015_PROVENANCE_DECISION_CODES.join('\u0000')
  ) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} batch codes must be approved U* decision codes`,
    );
  }
  return {
    version,
    taxonomyBaseline: TAXONOMY_BASELINE,
    repository: TEST262_REPOSITORY,
    revision: TEST262_REVISION,
    specification,
    parent,
    blockerOwners,
    rangeProfiles,
    baseLedger,
    batches,
  };
}

/**
 * @param {Record<string, any>} record
 * @param {string} expectedCode
 * @param {{ exactLists: boolean }} options
 * @returns {ProvenanceDecisionFragment}
 */
function normalizeDecisionFragmentRecord(record, expectedCode, options) {
  requireExactKeys(
    record,
    FRAGMENT_KEYS,
    `${expectedCode} decision fragment must contain exact keys`,
  );
  if (record.version !== ES2015_PROVENANCE_DECISION_VERSION) {
    throw new Es2015ProvenanceError(
      `${expectedCode} decision fragment must declare version ${ES2015_PROVENANCE_DECISION_VERSION}`,
    );
  }
  if (record.taxonomyBaseline !== TAXONOMY_BASELINE) {
    throw new Es2015ProvenanceError(
      `${expectedCode} decision fragment must retain the reviewed jsjs taxonomy baseline`,
    );
  }
  validateReviewedRepositoryRevision(
    record.repository,
    record.revision,
    `${expectedCode} decision fragment must retain the reviewed Test262 repository and revision`,
  );
  const specification = normalizeIdentitySpecification(
    object(
      record.specification,
      `${expectedCode} decision fragment specification`,
    ),
    `${expectedCode} decision fragment specification must contain exact keys`,
    `${expectedCode} decision fragment must retain the reviewed Sixth Edition source identity`,
  );
  const parent = normalizeParent(
    object(record.parent, `${expectedCode} decision fragment parent`),
    `${expectedCode} decision fragment parent must contain exact keys`,
    `${expectedCode} decision fragment must retain parent T1 / #75`,
  );
  if (record.code !== expectedCode) {
    throw new Es2015ProvenanceError(
      `${expectedCode} decision fragment must retain code ${expectedCode}`,
    );
  }
  if (!Array.isArray(record.decisions)) {
    throw new Es2015ProvenanceError(
      `${expectedCode} decision fragment decisions must be an array`,
    );
  }
  const decisions = record.decisions.map((decision) =>
    normalizeDecisionRecord(object(decision, `${expectedCode} decision`), {
      code: expectedCode,
      exactLists: options.exactLists,
      allowPendingReview: true,
      requireArtifactSha256: true,
      skipSemanticValidation: false,
    }),
  );
  const paths = decisions.map((decision) => decision.path);
  if (options.exactLists) {
    assertSortedUniquePaths(
      paths,
      `${expectedCode} decision fragment decisions`,
    );
  }
  return {
    version: ES2015_PROVENANCE_DECISION_VERSION,
    taxonomyBaseline: TAXONOMY_BASELINE,
    repository: TEST262_REPOSITORY,
    revision: TEST262_REVISION,
    specification,
    parent,
    code: expectedCode,
    decisions: Object.freeze(decisions),
  };
}

/**
 * @param {Record<string, any>} record
 * @param {{ code: string, exactLists: boolean, allowPendingReview: boolean, requireArtifactSha256: boolean, skipSemanticValidation?: boolean }} options
 * @returns {ReviewedDecision}
 */
function normalizeDecisionRecord(record, options) {
  const pathLabel = `${options.code} decision`;
  const path = typeof record.path === 'string' ? record.path : undefined;
  const decisionLabel =
    typeof path === 'string'
      ? `${options.code} decision for ${path}`
      : pathLabel;
  requireExactKeys(
    record,
    options.requireArtifactSha256 ? DECISION_KEYS : DECISION_KEYS_WITHOUT_HASH,
    `${decisionLabel} must contain exact keys`,
  );
  assertRootPath(record.path, `${decisionLabel} path`);
  if (!Number.isInteger(record.variants) || record.variants < 0) {
    throw new Es2015ProvenanceError(
      `${decisionLabel} must retain a non-negative variant count`,
    );
  }
  if (typeof record.priorClass !== 'string' || record.priorClass === '') {
    throw new Es2015ProvenanceError(
      `${decisionLabel} must retain a prior class`,
    );
  }
  const finalPartition = normalizePartition(
    record.finalPartition,
    decisionLabel,
  );
  const finalStatus = normalizeStatus(record.finalStatus, decisionLabel);
  if (!options.skipSemanticValidation) {
    validatePartitionStatusPair(finalPartition, finalStatus, decisionLabel);
  }
  const evidenceKind = normalizeEvidenceKind(
    record.evidenceKind,
    decisionLabel,
  );
  const specification = normalizeDecisionSpecification(
    object(record.specification, `${decisionLabel} specification`),
    evidenceKind,
    decisionLabel,
  );
  const metadata = normalizeDecisionMetadata(
    object(record.metadata, `${decisionLabel} metadata`),
    options.exactLists,
    decisionLabel,
  );
  const history = normalizeHistory(record.history, decisionLabel);
  if (typeof record.rationale !== 'string' || record.rationale.trim() === '') {
    throw new Es2015ProvenanceError(`${decisionLabel} requires a rationale`);
  }
  const review = normalizeReview(
    object(record.review, `${decisionLabel} review`),
    options.allowPendingReview,
    decisionLabel,
    options.skipSemanticValidation === true,
  );
  const destination = normalizeDestination(
    object(record.destination, `${decisionLabel} destination`),
    finalStatus,
    decisionLabel,
    options.skipSemanticValidation === true,
  );
  if (
    options.requireArtifactSha256 &&
    (typeof record.artifactSha256 !== 'string' ||
      !isHex64(record.artifactSha256))
  ) {
    throw new Es2015ProvenanceError(
      `${decisionLabel} artifactSha256 must be a SHA-256 hex string`,
    );
  }
  const normalized = {
    path: record.path,
    variants: record.variants,
    priorClass: record.priorClass,
    finalPartition,
    finalStatus,
    evidenceKind,
    specification,
    metadata,
    history,
    rationale: record.rationale,
    review,
    destination,
    artifactSha256:
      typeof record.artifactSha256 === 'string' ? record.artifactSha256 : null,
  };
  if (
    !options.skipSemanticValidation &&
    normalized.evidenceKind === 'history-only'
  ) {
    throw new Es2015ProvenanceError(
      `${decisionLabel} cannot rely on history alone`,
    );
  }
  const expectedHash = sha256(
    JSON.stringify(canonicalDecisionRecord(normalized, false)),
  );
  if (
    options.requireArtifactSha256 &&
    normalized.artifactSha256 !== expectedHash
  ) {
    throw new Es2015ProvenanceError(
      `${decisionLabel} artifactSha256 does not match the canonical record`,
    );
  }
  return {
    ...normalized,
    artifactSha256: options.requireArtifactSha256
      ? /** @type {string} */ (normalized.artifactSha256)
      : expectedHash,
  };
}

/** @param {Record<string, any>} record @param {boolean} exactLists @returns {ProvenanceBaseLedger} */
function normalizeBaseLedger(record, exactLists) {
  requireExactKeys(
    record,
    BASE_LEDGER_KEYS,
    `${ES2015_PROVENANCE_FILE} baseLedger must contain exact keys`,
  );
  const paths = normalizePathList(
    record.paths,
    `${ES2015_PROVENANCE_FILE} baseLedger.paths`,
    exactLists,
  );
  return {
    rootCount: nonNegativeInteger(
      record.rootCount,
      `${ES2015_PROVENANCE_FILE} baseLedger.rootCount`,
    ),
    variantCount: nonNegativeInteger(
      record.variantCount,
      `${ES2015_PROVENANCE_FILE} baseLedger.variantCount`,
    ),
    pathSha256: sha256Hex(
      record.pathSha256,
      `${ES2015_PROVENANCE_FILE} baseLedger.pathSha256`,
    ),
    paths,
  };
}

/** @param {Record<string, any>} record @param {boolean} exactLists @returns {ProvenanceBatch} */
function normalizeBatchRecord(record, exactLists) {
  requireExactKeys(
    record,
    BATCH_KEYS,
    `${ES2015_PROVENANCE_FILE} batch must contain exact keys`,
  );
  if (typeof record.code !== 'string' || record.code === '') {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} batch code must be a string`,
    );
  }
  if (typeof record.selector !== 'string' || record.selector.trim() === '') {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} batch ${record.code} must retain a selector`,
    );
  }
  if (typeof record.scope !== 'string' || record.scope.trim() === '') {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} batch ${record.code} must retain a scope`,
    );
  }
  if (!Array.isArray(record.entries)) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} batch ${record.code} entries must be an array`,
    );
  }
  const entries = record.entries.map((entry) =>
    normalizeBatchEntry(
      object(entry, `${ES2015_PROVENANCE_FILE} batch ${record.code} entry`),
    ),
  );
  if (exactLists) {
    assertSortedUniquePaths(
      entries.map((entry) => entry.path),
      `${ES2015_PROVENANCE_FILE} batch ${record.code} entries`,
    );
  }
  return {
    code: record.code,
    selector: record.selector,
    scope: record.scope,
    rootCount: nonNegativeInteger(
      record.rootCount,
      `${ES2015_PROVENANCE_FILE} batch ${record.code}.rootCount`,
    ),
    variantCount: nonNegativeInteger(
      record.variantCount,
      `${ES2015_PROVENANCE_FILE} batch ${record.code}.variantCount`,
    ),
    pathSha256: sha256Hex(
      record.pathSha256,
      `${ES2015_PROVENANCE_FILE} batch ${record.code}.pathSha256`,
    ),
    entryLedgerSha256: sha256Hex(
      record.entryLedgerSha256,
      `${ES2015_PROVENANCE_FILE} batch ${record.code}.entryLedgerSha256`,
    ),
    entries,
  };
}

/** @param {Record<string, any>} record @returns {ProvenanceBatchEntry} */
function normalizeBatchEntry(record) {
  requireExactKeys(
    record,
    BATCH_ENTRY_KEYS,
    'provenance batch entry must contain exact keys',
  );
  assertRootPath(record.path, 'provenance batch entry path');
  if (!Number.isInteger(record.variants) || record.variants < 0) {
    throw new Es2015ProvenanceError(
      `provenance batch entry ${record.path} must retain a non-negative variant count`,
    );
  }
  if (typeof record.priorClass !== 'string' || record.priorClass === '') {
    throw new Es2015ProvenanceError(
      `provenance batch entry ${record.path} must retain a prior class`,
    );
  }
  return {
    path: record.path,
    variants: record.variants,
    priorClass: record.priorClass,
  };
}

/** @param {Record<string, any>} record @param {string} keysMessage @param {string} pinsMessage @returns {IdentitySpecification} */
function normalizeIdentitySpecification(record, keysMessage, pinsMessage) {
  requireExactKeys(record, SPECIFICATION_KEYS, keysMessage);
  if (
    record.source !== SPECIFICATION_SOURCE ||
    record.sourceSha256 !== SPECIFICATION_SHA256
  ) {
    throw new Es2015ProvenanceError(pinsMessage);
  }
  return {
    source: SPECIFICATION_SOURCE,
    sourceSha256: SPECIFICATION_SHA256,
  };
}

/** @param {Record<string, any>} record @param {string} keysMessage @param {string} parentMessage @returns {ProvenanceParent} */
function normalizeParent(record, keysMessage, parentMessage) {
  requireExactKeys(record, PARENT_KEYS, keysMessage);
  if (record.code !== PARENT_CODE || record.issue !== PARENT_ISSUE) {
    throw new Es2015ProvenanceError(parentMessage);
  }
  return {
    code: PARENT_CODE,
    issue: PARENT_ISSUE,
  };
}

/** @param {Record<string, any>} record @param {string} evidenceKind @param {string} label @returns {{ source: string, sourceSha256: string, clause: string | null, anchor: string | null }} */
function normalizeDecisionSpecification(record, evidenceKind, label) {
  requireExactKeys(
    record,
    DECISION_SPECIFICATION_KEYS,
    `${label} specification must contain exact keys`,
  );
  const clause = nullableEvidenceString(
    record.clause,
    `${label} specification.clause`,
  );
  const anchor = nullableEvidenceString(
    record.anchor,
    `${label} specification.anchor`,
  );
  if (
    evidenceKind.startsWith('sixth-edition') &&
    (record.source !== SPECIFICATION_SOURCE ||
      record.sourceSha256 !== SPECIFICATION_SHA256)
  ) {
    throw new Es2015ProvenanceError(
      `${label} specification must retain the reviewed Sixth Edition source identity`,
    );
  }
  if (evidenceKind === 'sixth-edition-clause' && clause === null) {
    throw new Es2015ProvenanceError(
      `${label} specification must name a reviewed clause`,
    );
  }
  if (evidenceKind === 'sixth-edition-anchor' && anchor === null) {
    throw new Es2015ProvenanceError(
      `${label} specification must name a reviewed anchor`,
    );
  }
  if (typeof record.source !== 'string' || record.source.trim() === '') {
    throw new Es2015ProvenanceError(
      `${label} specification.source must be a string`,
    );
  }
  if (!isHex64(record.sourceSha256)) {
    throw new Es2015ProvenanceError(
      `${label} specification.sourceSha256 must be a SHA-256 hex string`,
    );
  }
  return {
    source: record.source,
    sourceSha256: record.sourceSha256,
    clause,
    anchor,
  };
}

/** @param {Record<string, any>} record @param {boolean} exactLists @param {string} label @returns {ReviewedDecisionMetadata} */
function normalizeDecisionMetadata(record, exactLists, label) {
  requireExactKeys(
    record,
    DECISION_METADATA_KEYS,
    `${label} metadata must contain exact keys`,
  );
  return {
    es5id: nullableString(record.es5id, `${label} metadata.es5id`),
    es6id: nullableString(record.es6id, `${label} metadata.es6id`),
    esid: nullableString(record.esid, `${label} metadata.esid`),
    features: normalizeStringList(
      record.features,
      `${label} metadata.features`,
      exactLists,
    ),
    includeFeatures: normalizeStringList(
      record.includeFeatures,
      `${label} metadata.includeFeatures`,
      exactLists,
    ),
    includes: normalizeStringList(
      record.includes,
      `${label} metadata.includes`,
      exactLists,
    ),
    flags: normalizeStringList(
      record.flags,
      `${label} metadata.flags`,
      exactLists,
    ),
  };
}

/** @param {unknown} value @param {string} label @returns {readonly ReviewedDecisionHistoryEntry[]} */
function normalizeHistory(value, label) {
  if (!Array.isArray(value)) {
    throw new Es2015ProvenanceError(`${label} history must be an array`);
  }
  return Object.freeze(
    value.map((entry, index) => {
      const record = object(entry, `${label} history[${index}]`);
      requireExactKeys(
        record,
        HISTORY_KEYS,
        `${label} history[${index}] must contain exact keys`,
      );
      if (record.repository !== TEST262_REPOSITORY) {
        throw new Es2015ProvenanceError(
          `${label} history[${index}] must retain the reviewed Test262 repository`,
        );
      }
      if (
        typeof record.commit !== 'string' ||
        !/^[0-9a-f]{40}$/.test(record.commit)
      ) {
        throw new Es2015ProvenanceError(
          `${label} history[${index}] commit must be a full hex SHA`,
        );
      }
      if (typeof record.note !== 'string' || record.note.trim() === '') {
        throw new Es2015ProvenanceError(
          `${label} history[${index}] note must be a string`,
        );
      }
      return Object.freeze({
        repository: TEST262_REPOSITORY,
        commit: record.commit,
        note: record.note,
      });
    }),
  );
}

/** @param {Record<string, any>} record @param {boolean} allowPendingReview @param {string} label @param {boolean} skipSemanticValidation @returns {ReviewedDecisionReview} */
function normalizeReview(
  record,
  allowPendingReview,
  label,
  skipSemanticValidation,
) {
  requireExactKeys(
    record,
    REVIEW_KEYS,
    `${label} review must contain exact keys`,
  );
  const pending =
    record.reviewer === 'pending' &&
    record.reviewedAt === 'pending' &&
    record.artifact === 'pending';
  const hasPendingField =
    record.reviewer === 'pending' ||
    record.reviewedAt === 'pending' ||
    record.artifact === 'pending';
  if (record.reviewer === 'pending' && !allowPendingReview) {
    throw new Es2015ProvenanceError(
      `${label} review.reviewer must not be pending in strict validation`,
    );
  }
  if (!skipSemanticValidation && hasPendingField && !pending) {
    throw new Es2015ProvenanceError(
      `${label} pending review fields must all be pending`,
    );
  }
  if (pending) {
    if (!allowPendingReview) {
      throw new Es2015ProvenanceError(
        `${label} review.reviewer must not be pending in strict validation`,
      );
    }
    return {
      reviewer: 'pending',
      reviewedAt: 'pending',
      artifact: 'pending',
    };
  }
  if (typeof record.reviewer !== 'string' || record.reviewer.trim() === '') {
    throw new Es2015ProvenanceError(
      `${label} review.reviewer must be a string`,
    );
  }
  if (skipSemanticValidation) {
    if (
      typeof record.reviewedAt !== 'string' ||
      record.reviewedAt.trim() === '' ||
      typeof record.artifact !== 'string' ||
      record.artifact.trim() === ''
    ) {
      throw new Es2015ProvenanceError(`${label} review fields must be strings`);
    }
    return {
      reviewer: record.reviewer,
      reviewedAt: record.reviewedAt,
      artifact: record.artifact,
    };
  }
  if (
    typeof record.reviewedAt !== 'string' ||
    !isCanonicalUtcRfc3339(record.reviewedAt)
  ) {
    throw new Es2015ProvenanceError(
      `${label} review.reviewedAt must be a canonical UTC RFC3339 timestamp`,
    );
  }
  if (
    typeof record.artifact !== 'string' ||
    !REVIEW_URL.test(record.artifact)
  ) {
    throw new Es2015ProvenanceError(
      `${label} review.artifact must be a reviewed GitHub jsjs URL`,
    );
  }
  return {
    reviewer: record.reviewer,
    reviewedAt: record.reviewedAt,
    artifact: record.artifact,
  };
}

/** @param {Record<string, any>} record @param {string} finalStatus @param {string} label @param {boolean} skipSemanticValidation @returns {ReviewedDecisionDestination} */
function normalizeDestination(
  record,
  finalStatus,
  label,
  skipSemanticValidation,
) {
  requireExactKeys(
    record,
    DESTINATION_KEYS,
    `${label} destination must contain exact keys`,
  );
  const blocker = nullableString(
    record.blocker,
    `${label} destination.blocker`,
  );
  const issue = nullableInteger(record.issue, `${label} destination.issue`);
  if (skipSemanticValidation) {
    return { blocker, issue };
  }
  if (finalStatus.startsWith('blocked:')) {
    const namedBlocker = finalStatus.slice('blocked:'.length);
    const issues = BLOCKER_ISSUES.get(namedBlocker);
    if (blocker !== namedBlocker || issues === undefined) {
      throw new Es2015ProvenanceError(
        `${label} names unknown blocker ${namedBlocker}`,
      );
    }
    if (issue === null) {
      throw new Es2015ProvenanceError(`${label} requires a destination issue`);
    }
    if (!issues.has(issue)) {
      throw new Es2015ProvenanceError(
        `${label} blocker ${namedBlocker} is not owned by issue #${issue}`,
      );
    }
  } else if (blocker !== null || issue !== null) {
    throw new Es2015ProvenanceError(
      `${label} destination applies only to blocked core decisions`,
    );
  }
  return { blocker, issue };
}

/** @param {unknown} value @returns {readonly ProvenanceBlockerOwner[]} */
function normalizeBlockerOwners(value) {
  if (!Array.isArray(value)) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} blockerOwners must be an array`,
    );
  }
  const owners = value.map((entry, index) => {
    const record = object(
      entry,
      `${ES2015_PROVENANCE_FILE} blockerOwners[${index}]`,
    );
    requireExactKeys(
      record,
      BLOCKER_OWNER_KEYS,
      `${ES2015_PROVENANCE_FILE} blockerOwners[${index}] must contain exact keys`,
    );
    if (typeof record.blocker !== 'string' || record.blocker === '') {
      throw new Es2015ProvenanceError(
        `${ES2015_PROVENANCE_FILE} blockerOwners[${index}].blocker must be a string`,
      );
    }
    if (
      !Array.isArray(record.issues) ||
      record.issues.some(
        (issue) => !Number.isSafeInteger(issue) || issue <= 0,
      ) ||
      new Set(record.issues).size !== record.issues.length ||
      record.issues.some(
        (issue, issueIndex) =>
          issueIndex > 0 && issue <= record.issues[issueIndex - 1],
      )
    ) {
      throw new Es2015ProvenanceError(
        `${ES2015_PROVENANCE_FILE} blockerOwners[${index}].issues must be sorted unique positive issue numbers`,
      );
    }
    return Object.freeze({
      blocker: record.blocker,
      issues: Object.freeze([...record.issues]),
    });
  });
  assertSortedUniqueStrings(
    owners.map((entry) => entry.blocker),
    `${ES2015_PROVENANCE_FILE} blockerOwners`,
  );
  return Object.freeze(owners);
}

/** @param {unknown} value @param {2 | 3} version @returns {readonly ProvenanceRangeProfile[]} */
function normalizeRangeProfiles(value, version) {
  if (!Array.isArray(value)) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} rangeProfiles must be an array`,
    );
  }
  const profiles = value.map((entry, index) => {
    const label = `${ES2015_PROVENANCE_FILE} rangeProfiles[${index}]`;
    const record = object(entry, label);
    requireExactKeys(
      record,
      RANGE_PROFILE_KEYS,
      `${label} must contain exact keys`,
    );
    if (typeof record.name !== 'string' || record.name === '') {
      throw new Es2015ProvenanceError(`${label}.name must be a string`);
    }
    if (
      record.baseFoundation !== 'absent' &&
      record.baseFoundation !== 'present'
    ) {
      throw new Es2015ProvenanceError(
        `${label}.baseFoundation must be absent or present`,
      );
    }
    const requiredPaths = normalizeRepositoryPathList(
      record.requiredPaths,
      `${label}.requiredPaths`,
    );
    const allowedPaths = normalizeRepositoryPathList(
      record.allowedPaths,
      `${label}.allowedPaths`,
    );
    const requiredDeletions = normalizeRepositoryPathList(
      record.requiredDeletions,
      `${label}.requiredDeletions`,
    );
    const allowedDeletions = normalizeRepositoryPathList(
      record.allowedDeletions,
      `${label}.allowedDeletions`,
    );
    const emptyDecisionFragments = normalizeRepositoryPathList(
      record.emptyDecisionFragments,
      `${label}.emptyDecisionFragments`,
    );
    const generatedPaths = normalizeRepositoryPathList(
      record.generatedPaths,
      `${label}.generatedPaths`,
    );
    const decisionFragment = nullableString(
      record.decisionFragment,
      `${label}.decisionFragment`,
    );
    if (decisionFragment !== null && !validRepositoryPath(decisionFragment)) {
      throw new Es2015ProvenanceError(
        `${label}.decisionFragment must be a repository-relative path or null`,
      );
    }
    for (const path of requiredPaths) {
      if (!allowedPaths.includes(path)) {
        throw new Es2015ProvenanceError(
          `${label}.requiredPaths must be a subset of allowedPaths`,
        );
      }
    }
    for (const path of requiredDeletions) {
      if (!allowedDeletions.includes(path)) {
        throw new Es2015ProvenanceError(
          `${label}.requiredDeletions must be a subset of allowedDeletions`,
        );
      }
    }
    for (const path of [...emptyDecisionFragments, ...generatedPaths]) {
      if (!allowedPaths.includes(path)) {
        throw new Es2015ProvenanceError(
          `${label} content-owned paths must be allowed`,
        );
      }
    }
    if (decisionFragment !== null && !allowedPaths.includes(decisionFragment)) {
      throw new Es2015ProvenanceError(
        `${label}.decisionFragment must be an allowed path`,
      );
    }
    if (allowedDeletions.some((path) => allowedPaths.includes(path))) {
      throw new Es2015ProvenanceError(
        `${label} must not both change and delete one path`,
      );
    }
    return Object.freeze({
      name: record.name,
      baseFoundation: record.baseFoundation,
      requiredPaths,
      allowedPaths,
      requiredDeletions,
      allowedDeletions,
      emptyDecisionFragments,
      decisionFragment,
      generatedPaths,
    });
  });
  const expectedNames = (
    version === 3 ? APPROVED_SCHEMA_V3_RANGE_PROFILES : APPROVED_RANGE_PROFILES
  ).map((profile) => profile.name);
  if (
    profiles.map((profile) => profile.name).join('\u0000') !==
    expectedNames.join('\u0000')
  ) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} rangeProfiles must contain the approved profiles`,
    );
  }
  return Object.freeze(profiles);
}

/** @param {unknown} value @param {string} label @returns {readonly RoadmapAuthority[]} */
function normalizeRoadmapAuthorities(value, label) {
  if (!Array.isArray(value)) {
    throw new Es2015ProvenanceError(`${label} must be an array`);
  }
  const authorities = value.map((entry, index) =>
    normalizeRoadmapAuthority(entry, `${label}[${index}]`),
  );
  const codes = authorities.map((authority) => authority.code);
  if (!isSorted(codes) || new Set(codes).size !== codes.length) {
    throw new Es2015ProvenanceError(
      `${label} must be code-unit sorted unique by code`,
    );
  }
  const issues = authorities.map((authority) => authority.issue);
  if (new Set(issues).size !== issues.length) {
    throw new Es2015ProvenanceError(`${label} must not reuse issue numbers`);
  }
  return Object.freeze(authorities);
}

/** @param {unknown} value @param {string} label @returns {RoadmapAuthority} */
function normalizeRoadmapAuthority(value, label) {
  const record = object(value, label);
  requireExactKeys(
    record,
    ROADMAP_AUTHORITY_KEYS,
    `${label} must contain exact keys`,
  );
  const code = normalizeRoadmapAuthorityCode(record.code, `${label}.code`);
  return {
    code,
    issue: positiveInteger(record.issue, `${label}.issue`),
    parentIssue: positiveInteger(record.parentIssue, `${label}.parentIssue`),
    state: normalizeRoadmapAuthorityState(record.state, `${label}.state`),
    source: normalizeRoadmapAuthoritySource(record.source, `${label}.source`),
    reconciliation:
      record.reconciliation === null
        ? null
        : normalizeRoadmapReconciliation(
            record.reconciliation,
            `${label}.reconciliation`,
          ),
    evidence: normalizeRoadmapEvidenceList(
      record.evidence,
      `${label}.evidence`,
    ),
    protectedOutputs: normalizeRoadmapProtectedOutputs(
      record.protectedOutputs,
      `${label}.protectedOutputs`,
    ),
    destinations: normalizeRoadmapDestinations(
      record.destinations,
      `${label}.destinations`,
    ),
  };
}

/** @param {unknown} value @param {string} label @returns {string} */
function normalizeRoadmapAuthorityCode(value, label) {
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    value !== value.trim()
  ) {
    throw new Es2015ProvenanceError(`${label} must be a non-empty string`);
  }
  if (
    value === 'foundation' ||
    value.startsWith('decision:') ||
    value.startsWith('maintenance:')
  ) {
    throw new Es2015ProvenanceError(
      `${label} must not use reserved authority code ${value}`,
    );
  }
  return value;
}

/** @param {unknown} value @param {string} label @returns {RoadmapAuthorityState} */
function normalizeRoadmapAuthorityState(value, label) {
  if (value !== 'pending' && value !== 'applied') {
    throw new Es2015ProvenanceError(`${label} must be pending or applied`);
  }
  return value;
}

/** @param {unknown} value @param {string} label @returns {RoadmapAuthority['source']} */
function normalizeRoadmapAuthoritySource(value, label) {
  const record = object(value, label);
  requireExactKeys(
    record,
    ROADMAP_AUTHORITY_SOURCE_KEYS,
    `${label} must contain exact keys`,
  );
  return {
    baseTaxonomySha256: sha256Hex(
      record.baseTaxonomySha256,
      `${label}.baseTaxonomySha256`,
    ),
    rootCount: nonNegativeInteger(record.rootCount, `${label}.rootCount`),
    variantCount: nonNegativeInteger(
      record.variantCount,
      `${label}.variantCount`,
    ),
    pathSha256: sha256Hex(record.pathSha256, `${label}.pathSha256`),
    entryLedgerSha256: nullableSha256Hex(
      record.entryLedgerSha256,
      `${label}.entryLedgerSha256`,
    ),
  };
}

/** @param {unknown} value @param {string} label @returns {RoadmapReconciliation} */
function normalizeRoadmapReconciliation(value, label) {
  const record = object(value, label);
  requireExactKeys(
    record,
    ROADMAP_RECONCILIATION_KEYS,
    `${label} must contain exact keys`,
  );
  const reconciliation = {
    preservedTaxonomySha256: sha256Hex(
      record.preservedTaxonomySha256,
      `${label}.preservedTaxonomySha256`,
    ),
    authorityTaxonomySha256: sha256Hex(
      record.authorityTaxonomySha256,
      `${label}.authorityTaxonomySha256`,
    ),
    selectorPathSha256: sha256Hex(
      record.selectorPathSha256,
      `${label}.selectorPathSha256`,
    ),
    rootCount: nonNegativeInteger(record.rootCount, `${label}.rootCount`),
    variantCount: nonNegativeInteger(
      record.variantCount,
      `${label}.variantCount`,
    ),
    missingCount: nonNegativeInteger(
      record.missingCount,
      `${label}.missingCount`,
    ),
    extraCount: nonNegativeInteger(record.extraCount, `${label}.extraCount`),
    proofSha256: sha256Hex(record.proofSha256, `${label}.proofSha256`),
  };
  const expectedProofSha256 = roadmapReconciliationProofSha256(reconciliation);
  if (reconciliation.proofSha256 !== expectedProofSha256) {
    throw new Es2015ProvenanceError(
      `${label}.proofSha256 must match the canonical reconciliation proof`,
    );
  }
  return {
    ...reconciliation,
    proofSha256: expectedProofSha256,
  };
}

/** @param {unknown} value @param {string} label @returns {readonly { path: string, sha256: string }[]} */
function normalizeRoadmapEvidenceList(value, label) {
  if (!Array.isArray(value)) {
    throw new Es2015ProvenanceError(`${label} must be an array`);
  }
  const evidence = value.map((entry, index) =>
    normalizeRoadmapEvidence(entry, `${label}[${index}]`),
  );
  assertSortedUniquePaths(
    evidence.map((entry) => entry.path),
    label,
  );
  return Object.freeze(evidence);
}

/** @param {unknown} value @param {string} label @returns {{ path: string, sha256: string }} */
function normalizeRoadmapEvidence(value, label) {
  const record = object(value, label);
  requireExactKeys(
    record,
    ROADMAP_EVIDENCE_KEYS,
    `${label} must contain exact keys`,
  );
  return {
    path: normalizeRoadmapRepositoryPath(record.path, `${label}.path`),
    sha256: sha256Hex(record.sha256, `${label}.sha256`),
  };
}

/** @param {unknown} value @param {string} label @returns {readonly RoadmapProtectedOutput[]} */
function normalizeRoadmapProtectedOutputs(value, label) {
  if (!Array.isArray(value)) {
    throw new Es2015ProvenanceError(`${label} must be an array`);
  }
  const protectedOutputs = value.map((entry, index) =>
    normalizeRoadmapProtectedOutput(entry, `${label}[${index}]`),
  );
  assertSortedUniquePaths(
    protectedOutputs.map((entry) => entry.path),
    label,
  );
  return Object.freeze(protectedOutputs);
}

/** @param {unknown} value @param {string} label @returns {RoadmapProtectedOutput} */
function normalizeRoadmapProtectedOutput(value, label) {
  const record = object(value, label);
  requireExactKeys(
    record,
    ROADMAP_PROTECTED_OUTPUT_KEYS,
    `${label} must contain exact keys`,
  );
  const operation = normalizeRoadmapOutputOperation(
    record.operation,
    `${label}.operation`,
  );
  const baseSha256 = nullableSha256Hex(
    record.baseSha256,
    `${label}.baseSha256`,
  );
  const headSha256 = nullableSha256Hex(
    record.headSha256,
    `${label}.headSha256`,
  );
  const projectionSha256 = nullableSha256Hex(
    record.projectionSha256,
    `${label}.projectionSha256`,
  );
  switch (operation) {
    case 'add-exact':
      if (
        baseSha256 !== null ||
        headSha256 === null ||
        projectionSha256 !== null
      ) {
        throw new Es2015ProvenanceError(
          `${label} add-exact outputs must use baseSha256:null, headSha256:sha256, projectionSha256:null`,
        );
      }
      break;
    case 'replace-exact':
      if (
        baseSha256 === null ||
        headSha256 === null ||
        projectionSha256 !== null
      ) {
        throw new Es2015ProvenanceError(
          `${label} replace-exact outputs must use baseSha256:sha256, headSha256:sha256, projectionSha256:null`,
        );
      }
      break;
    case 'project':
      if (
        baseSha256 === null ||
        headSha256 !== null ||
        projectionSha256 === null
      ) {
        throw new Es2015ProvenanceError(
          `${label} project outputs must use baseSha256:sha256, headSha256:null, projectionSha256:sha256`,
        );
      }
      break;
  }
  return {
    path: normalizeRoadmapRepositoryPath(record.path, `${label}.path`),
    operation,
    baseSha256,
    headSha256,
    projectionSha256,
  };
}

/** @param {unknown} value @param {string} label @returns {RoadmapOutputOperation} */
function normalizeRoadmapOutputOperation(value, label) {
  if (
    value !== 'add-exact' &&
    value !== 'replace-exact' &&
    value !== 'project'
  ) {
    throw new Es2015ProvenanceError(
      `${label} must be add-exact, replace-exact, or project`,
    );
  }
  return value;
}

/** @param {unknown} value @param {string} label @returns {readonly RoadmapDestination[]} */
function normalizeRoadmapDestinations(value, label) {
  if (!Array.isArray(value)) {
    throw new Es2015ProvenanceError(`${label} must be an array`);
  }
  const destinations = value.map((entry, index) =>
    normalizeRoadmapDestination(entry, `${label}[${index}]`),
  );
  for (let index = 1; index < destinations.length; index += 1) {
    if (
      compareRoadmapDestinations(
        destinations[index - 1],
        destinations[index],
      ) >= 0
    ) {
      throw new Es2015ProvenanceError(
        `${label} must be sorted unique by status, blocker, and issue`,
      );
    }
  }
  return Object.freeze(destinations);
}

/** @param {unknown} value @param {string} label @returns {RoadmapDestination} */
function normalizeRoadmapDestination(value, label) {
  const record = object(value, label);
  requireExactKeys(
    record,
    ROADMAP_DESTINATION_KEYS,
    `${label} must contain exact keys`,
  );
  const status = normalizeRoadmapDestinationStatus(
    record.status,
    `${label}.status`,
  );
  const blocker = nullableString(record.blocker, `${label}.blocker`);
  const issue = positiveInteger(record.issue, `${label}.issue`);
  if (status === 'blocked') {
    if (blocker === null || blocker.trim() === '') {
      throw new Es2015ProvenanceError(
        `${label}.blocker must name an approved blocker`,
      );
    }
    const issues = BLOCKER_ISSUES.get(blocker);
    if (issues === undefined || !issues.has(issue)) {
      throw new Es2015ProvenanceError(
        `${label}.blocker must map to the exact approved issue`,
      );
    }
  } else if (blocker !== null) {
    throw new Es2015ProvenanceError(`${label}.blocker must be null`);
  }
  return {
    status,
    blocker,
    issue,
  };
}

/** @param {unknown} value @param {string} label @returns {'selected-passing' | 'audit-passing-unselected' | 'blocked'} */
function normalizeRoadmapDestinationStatus(value, label) {
  if (
    value !== 'selected-passing' &&
    value !== 'audit-passing-unselected' &&
    value !== 'blocked'
  ) {
    throw new Es2015ProvenanceError(
      `${label} must be selected-passing, audit-passing-unselected, or blocked`,
    );
  }
  return value;
}

/** @param {RoadmapDestination} left @param {RoadmapDestination} right */
function compareRoadmapDestinations(left, right) {
  if (left.status !== right.status) {
    return left.status < right.status ? -1 : 1;
  }
  const leftBlocker = left.blocker ?? '';
  const rightBlocker = right.blocker ?? '';
  if (leftBlocker !== rightBlocker) {
    return leftBlocker < rightBlocker ? -1 : 1;
  }
  return left.issue - right.issue;
}

/** @param {unknown} value @param {string} label @returns {string} */
function normalizeRoadmapRepositoryPath(value, label) {
  if (typeof value !== 'string' || !validRepositoryPath(value)) {
    throw new Es2015ProvenanceError(
      `${label} must be a repository-relative path`,
    );
  }
  return value;
}

/**
 * @param {string} text
 * @param {string} label
 * @returns {{ rootCount: number, variantCount: number, pathSha256: string, paths: readonly string[] }}
 */
function summarizeRoadmapReconciliationSelector(text, label) {
  const record = parseJson(text, label);
  if (record.version !== 3) {
    throw new Es2015ProvenanceError(`${label} must declare version 3`);
  }
  if (!Array.isArray(record.classifications)) {
    throw new Es2015ProvenanceError(
      `${label}.classifications must be an array`,
    );
  }
  const selected = [];
  let variantCount = 0;
  for (let index = 0; index < record.classifications.length; index += 1) {
    const entry = object(
      record.classifications[index],
      `${label}.classifications[${index}]`,
    );
    const path = normalizeRoadmapRepositoryPath(
      entry.path,
      `${label}.classifications[${index}].path`,
    );
    const variants = nonNegativeInteger(
      entry.variants,
      `${label}.classifications[${index}].variants`,
    );
    const partition = nullableString(
      entry.partition,
      `${label}.classifications[${index}].partition`,
    );
    const status = nullableString(
      entry.status,
      `${label}.classifications[${index}].status`,
    );
    const blocker = nullableString(
      entry.blocker,
      `${label}.classifications[${index}].blocker`,
    );
    if (
      partition === 'core' &&
      status === 'blocked:test262-cross-realm-host' &&
      blocker === 'test262-cross-realm-host'
    ) {
      selected.push(path);
      variantCount += variants;
    }
  }
  const paths = sortStrings(selected);
  assertUnique(paths, `${label} selector paths`);
  return {
    rootCount: paths.length,
    variantCount,
    pathSha256: hashPaths(paths),
    paths: Object.freeze(paths),
  };
}

/**
 * @param {{ rootCount: number, variantCount: number, pathSha256: string }} summary
 * @param {RoadmapAuthority} authority
 * @param {RoadmapReconciliation} reconciliation
 * @param {string} label
 */
function validateRoadmapReconciliationSelector(
  summary,
  authority,
  reconciliation,
  label,
) {
  if (
    summary.rootCount !== authority.source.rootCount ||
    summary.rootCount !== reconciliation.rootCount
  ) {
    throw new Es2015ProvenanceError(
      `${label} root count does not match the reviewed reconciliation`,
    );
  }
  if (
    summary.variantCount !== authority.source.variantCount ||
    summary.variantCount !== reconciliation.variantCount
  ) {
    throw new Es2015ProvenanceError(
      `${label} variant count does not match the reviewed reconciliation`,
    );
  }
  if (
    summary.pathSha256 !== authority.source.pathSha256 ||
    summary.pathSha256 !== reconciliation.selectorPathSha256
  ) {
    throw new Es2015ProvenanceError(
      `${label} path SHA-256 does not match the reviewed reconciliation`,
    );
  }
}

/** @param {readonly string[]} paths @param {ReadonlySet<string>} expected */
function countRoadmapPathDifference(paths, expected) {
  let count = 0;
  for (const path of paths) {
    if (!expected.has(path)) count += 1;
  }
  return count;
}

/** @param {RoadmapReconciliation} reconciliation */
function roadmapReconciliationProofSha256(reconciliation) {
  return sha256(
    `${reconciliation.preservedTaxonomySha256}\u0000${reconciliation.authorityTaxonomySha256}\u0000${reconciliation.selectorPathSha256}\u0000${reconciliation.rootCount}\u0000${reconciliation.variantCount}\u0000${reconciliation.missingCount}\u0000${reconciliation.extraCount}\u0000`,
  );
}

/** @param {unknown} value @param {string} label */
function normalizeRepositoryPathList(value, label) {
  const paths = normalizeStringList(value, label, true);
  if (paths.some((path) => !validRepositoryPath(path))) {
    throw new Es2015ProvenanceError(
      `${label} must contain repository-relative paths`,
    );
  }
  return paths;
}

/** @param {string} path */
function validRepositoryPath(path) {
  return (
    path !== '' &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path
      .split('/')
      .some((part) => part === '' || part === '.' || part === '..')
  );
}

/** @param {unknown} finalPartition @param {string} label */
function normalizePartition(finalPartition, label) {
  const partitions = new Set([
    'annex-b',
    'core',
    'harness-validation',
    'later-or-non-es2015',
    'malformed',
  ]);
  if (typeof finalPartition !== 'string' || !partitions.has(finalPartition)) {
    throw new Es2015ProvenanceError(
      `${label} finalPartition must be a reviewed destination`,
    );
  }
  return finalPartition;
}

/** @param {unknown} finalStatus @param {string} label */
function normalizeStatus(finalStatus, label) {
  if (typeof finalStatus !== 'string' || finalStatus === '') {
    throw new Es2015ProvenanceError(`${label} finalStatus must be a string`);
  }
  return finalStatus;
}

/** @param {string} finalPartition @param {string} finalStatus @param {string} label */
function validatePartitionStatusPair(finalPartition, finalStatus, label) {
  if (finalPartition === 'core') {
    if (
      finalStatus === 'selected-passing' ||
      finalStatus === 'audit-passing-unselected' ||
      finalStatus === 'intentional-deviation'
    ) {
      return;
    }
    if (finalStatus.startsWith('blocked:')) {
      return;
    }
    throw new Es2015ProvenanceError(
      `${label} has an invalid final partition/status pair`,
    );
  }
  if (finalPartition !== finalStatus) {
    throw new Es2015ProvenanceError(
      `${label} has an invalid final partition/status pair`,
    );
  }
}

/** @param {unknown} value @param {string} label */
function normalizeEvidenceKind(value, label) {
  const kinds = new Set([
    'sixth-edition-clause',
    'sixth-edition-anchor',
    'metadata-proof',
    'include-feature-closure',
    'later-edition-proof',
    'manual-semantic-review',
    'history-only',
  ]);
  if (typeof value !== 'string' || !kinds.has(value)) {
    throw new Es2015ProvenanceError(`${label} evidenceKind is unsupported`);
  }
  return value;
}

/** @param {unknown} value @param {string} label @param {boolean} exactLists @returns {readonly string[]} */
function normalizeStringList(value, label, exactLists) {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || entry === '')
  ) {
    throw new Es2015ProvenanceError(`${label} must be non-empty strings`);
  }
  const list = [...value];
  if (exactLists) {
    assertSortedUniqueStrings(list, label);
  }
  return Object.freeze(list);
}

/** @param {unknown} value @param {string} label @param {boolean} exactLists @returns {readonly string[]} */
function normalizePathList(value, label, exactLists) {
  if (!Array.isArray(value)) {
    throw new Es2015ProvenanceError(`${label} must be a path array`);
  }
  const paths = value.map((entry) => {
    assertRootPath(entry, label);
    return entry;
  });
  if (exactLists) {
    assertSortedUniquePaths(paths, label);
  }
  return Object.freeze(paths);
}

/** @param {unknown} value @param {string} label @returns {string | null} */
function nullableString(value, label) {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Es2015ProvenanceError(`${label} must be a string or null`);
  }
  return value;
}

/** @param {unknown} value @param {string} label @returns {string | null} */
function nullableEvidenceString(value, label) {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Es2015ProvenanceError(`${label} must be a string or null`);
  }
  return value.trim() === '' ? null : value;
}

/** @param {unknown} value @param {string} label @returns {number | null} */
function nullableInteger(value, label) {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Es2015ProvenanceError(
      `${label} must be a positive integer or null`,
    );
  }
  return /** @type {number} */ (value);
}

/** @param {unknown} value @param {string} label @returns {number} */
function positiveInteger(value, label) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Es2015ProvenanceError(`${label} must be a positive integer`);
  }
  return /** @type {number} */ (value);
}

/** @param {unknown} value @param {string} label @returns {number} */
function nonNegativeInteger(value, label) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Es2015ProvenanceError(`${label} must be a non-negative integer`);
  }
  return /** @type {number} */ (value);
}

/** @param {unknown} value @param {string} label @returns {string} */
function sha256Hex(value, label) {
  if (typeof value !== 'string' || !isHex64(value)) {
    throw new Es2015ProvenanceError(`${label} must be a SHA-256 hex string`);
  }
  return value;
}

/** @param {unknown} value @param {string} label @returns {string | null} */
function nullableSha256Hex(value, label) {
  if (value === null) return null;
  return sha256Hex(value, label);
}

/** @param {unknown} path @param {string} label */
function assertRootPath(path, label) {
  if (
    typeof path !== 'string' ||
    !path.startsWith(ROOT_PREFIX) ||
    !path.endsWith('.js') ||
    isTest262FixtureDependencyPath(path)
  ) {
    throw new Es2015ProvenanceError(
      `${label} must be a non-fixture test/*.js path`,
    );
  }
}

/** @param {readonly string[]} values @param {string} label */
function assertSortedUniqueStrings(values, label) {
  if (!isSorted(values) || new Set(values).size !== values.length) {
    throw new Es2015ProvenanceError(
      `${label} must be code-unit sorted unique strings`,
    );
  }
}

/** @param {readonly string[]} values @param {string} label */
function assertSortedUniquePaths(values, label) {
  if (!isSorted(values) || new Set(values).size !== values.length) {
    throw new Es2015ProvenanceError(
      `${label} must be code-unit sorted unique paths`,
    );
  }
}

/** @param {readonly string[]} values @param {string} label */
function assertUnique(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Es2015ProvenanceError(`${label} must not repeat entries`);
  }
}

/** @param {readonly string[]} values @param {string} label */
function assertUniqueBasePaths(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Es2015ProvenanceError(`${label} must not repeat base paths`);
  }
}

/** @param {readonly string[]} values */
function duplicatesOf(values) {
  const seen = new Set();
  const duplicates = [];
  for (const value of values) {
    if (seen.has(value)) duplicates.push(value);
    seen.add(value);
  }
  return duplicates;
}

/** @param {readonly string[]} values */
function isSorted(values) {
  return values.join('\u0000') === sortStrings(values).join('\u0000');
}

/** @param {string} value */
function isHex64(value) {
  return /^[0-9a-f]{64}$/.test(value);
}

/** @param {string} value */
function isCanonicalUtcRfc3339(value) {
  const match = RFC3339_UTC.exec(value);
  if (match === null) return false;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  if (
    year === 0 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return false;
  }
  const instant = new Date(0);
  instant.setUTCFullYear(year, month - 1, day);
  instant.setUTCHours(hour, minute, second, 0);
  return (
    instant.getUTCFullYear() === year &&
    instant.getUTCMonth() === month - 1 &&
    instant.getUTCDate() === day &&
    instant.getUTCHours() === hour &&
    instant.getUTCMinutes() === minute &&
    instant.getUTCSeconds() === second
  );
}

/** @param {string} repository @param {string} revision @param {string} message */
function validateReviewedRepositoryRevision(repository, revision, message) {
  if (repository !== TEST262_REPOSITORY || revision !== TEST262_REVISION) {
    throw new Es2015ProvenanceError(message);
  }
}

/** @param {string} code */
function assertDecisionCode(code) {
  if (!ES2015_PROVENANCE_DECISION_CODES.includes(code)) {
    throw new Es2015ProvenanceError(
      `${code} is not an approved ES2015 provenance decision code`,
    );
  }
}

/** @param {unknown} value @returns {Map<string, unknown>} */
function normalizeFragments(value) {
  if (value instanceof Map) {
    return new Map(value);
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return new Map(Object.entries(value));
  }
  throw new Es2015ProvenanceError(
    'Provenance decision fragments must be a map or object',
  );
}

/** @param {string} code @param {ReadonlyMap<string, { number: number }>} issueMap */
function renderIssueReference(code, issueMap) {
  const issue = issueMap.get(code);
  if (issue === undefined) {
    throw new Es2015ProvenanceError(
      `Issue map is missing required code ${code}`,
    );
  }
  return `${code} (#${issue.number})`;
}

/** @param {unknown} value */
function normalizeIssueMap(value) {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Es2015ProvenanceError('Issue map must be an object');
  }
  const record = /** @type {Record<string, any>} */ (value);
  requireExactKeys(record, ISSUE_MAP_KEYS, 'Issue map must contain exact keys');
  if (record.version !== 1) {
    throw new Es2015ProvenanceError('Issue map must declare version 1');
  }
  if (record.parent !== PARENT_ISSUE) {
    throw new Es2015ProvenanceError(
      `Issue map must retain parent issue #${PARENT_ISSUE}`,
    );
  }
  if (record.baseLedgerSha256 !== APPROVED_BASE_LEDGER.pathSha256) {
    throw new Es2015ProvenanceError(
      'Issue map must retain the immutable base ledger SHA-256',
    );
  }
  const issues = object(record.issues, 'Issue map issues');
  const issueCodes = Object.keys(issues);
  if (
    issueCodes.length !== ALL_RENDER_CODES.length ||
    issueCodes.some((code) => !ALL_RENDER_CODE_SET.has(code)) ||
    ALL_RENDER_CODES.some(
      (code) => !Object.prototype.hasOwnProperty.call(issues, code),
    )
  ) {
    throw new Es2015ProvenanceError(
      'Issue map issues must contain exact U* codes',
    );
  }
  const map = new Map();
  const issueOwners = new Map([[PARENT_ISSUE, 'T1']]);
  const restIdOwners = new Map();
  const nodeIdOwners = new Map();
  for (const code of ALL_RENDER_CODES) {
    const entry = object(issues[code], `Issue map entry ${code}`);
    requireExactKeys(
      entry,
      ISSUE_MAP_ENTRY_KEYS,
      `Issue map entry ${code} must contain exact keys`,
    );
    if (!Number.isSafeInteger(entry.number) || entry.number <= 0) {
      throw new Es2015ProvenanceError(
        `Issue map entry ${code} must provide a positive issue number`,
      );
    }
    if (!Number.isSafeInteger(entry.id) || entry.id <= 0) {
      throw new Es2015ProvenanceError(
        `Issue map entry ${code} must provide a positive REST id`,
      );
    }
    if (
      typeof entry.nodeId !== 'string' ||
      !/^I_[A-Za-z0-9_-]+$/u.test(entry.nodeId)
    ) {
      throw new Es2015ProvenanceError(
        `Issue map entry ${code} must provide a GitHub issue node id`,
      );
    }
    if (entry.state !== 'open' && entry.state !== 'closed') {
      throw new Es2015ProvenanceError(
        `Issue map entry ${code} state must be open or closed`,
      );
    }
    const issueNumber = entry.number;
    const priorOwner = issueOwners.get(issueNumber);
    if (priorOwner !== undefined) {
      if (priorOwner === 'T1') {
        throw new Es2015ProvenanceError(
          `Issue map entry ${code} must not reuse parent issue #${PARENT_ISSUE}`,
        );
      }
      throw new Es2015ProvenanceError(
        `Issue map reuses issue #${issueNumber} for ${priorOwner} and ${code}`,
      );
    }
    issueOwners.set(issueNumber, code);
    const priorRestIdOwner = restIdOwners.get(entry.id);
    if (priorRestIdOwner !== undefined) {
      throw new Es2015ProvenanceError(
        `Issue map reuses REST id ${entry.id} for ${priorRestIdOwner} and ${code}`,
      );
    }
    restIdOwners.set(entry.id, code);
    const priorNodeIdOwner = nodeIdOwners.get(entry.nodeId);
    if (priorNodeIdOwner !== undefined) {
      throw new Es2015ProvenanceError(
        `Issue map reuses node id ${entry.nodeId} for ${priorNodeIdOwner} and ${code}`,
      );
    }
    nodeIdOwners.set(entry.nodeId, code);
    map.set(
      code,
      Object.freeze({
        number: issueNumber,
        id: entry.id,
        nodeId: entry.nodeId,
        state: entry.state,
      }),
    );
  }
  return map;
}

/** @param {unknown} value */
function normalizeRequiredCodes(value) {
  if (value === undefined) return new Set();
  if (!Array.isArray(value)) {
    throw new Es2015ProvenanceError('requireCompleteCodes must be an array');
  }
  const codes = new Set();
  for (const code of value) {
    if (typeof code !== 'string') {
      throw new Es2015ProvenanceError(
        'requireCompleteCodes must contain strings',
      );
    }
    assertDecisionCode(code);
    codes.add(code);
  }
  return codes;
}

/** @param {string[]} paths */
function hashPaths(paths) {
  return sha256(`${paths.join('\n')}\n`);
}

/**
 * Canonical entry-ledger bytes are one JSON array per code-unit-sorted entry:
 * `["path",variants,"priorClass"]\n`, with a final newline even for empty ledgers.
 * @param {readonly { path: string, variants: number, priorClass: string }[]} entries
 */
function hashEntryLedger(entries) {
  return sha256(
    `${entries.map((entry) => JSON.stringify([entry.path, entry.variants, entry.priorClass])).join('\n')}\n`,
  );
}

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** @param {string} path */
function decisionCodeForPath(path) {
  if (path.startsWith('test/annexB/')) return 'UA';
  if (path.startsWith('test/built-ins/')) return 'UB';
  if (path.startsWith('test/language/expressions/')) {
    const topic = path.slice('test/language/expressions/'.length).split('/')[0];
    if (LANGUAGE_ASSIGNMENT_TOPICS.has(topic)) return 'UL1';
    if (LANGUAGE_OBJECT_TOPICS.has(topic)) return 'UL2';
  }
  if (path.startsWith('test/language/statements/class/')) return 'UL2';
  if (path.startsWith('test/language/')) {
    const topic = path.slice('test/language/'.length).split('/')[0];
    if (LANGUAGE_ENVIRONMENT_TOPICS.has(topic)) return 'UL4';
    return 'UL3';
  }
  if (path === SPECIAL_US6_PATH) return 'US6';
  if (path.startsWith('test/staging/sm/')) {
    const topic = path.slice('test/staging/sm/'.length).split('/')[0];
    if (STAGING_US1_TOPICS.has(topic)) return 'US1';
    if (STAGING_US2_TOPICS.has(topic)) return 'US2';
    if (STAGING_US3_TOPICS.has(topic)) return 'US3';
    if (STAGING_US4_TOPICS.has(topic)) return 'US4';
    if (STAGING_US5_TOPICS.has(topic)) return 'US5';
    if (STAGING_US6_TOPICS.has(topic)) return 'US6';
    if (STAGING_US7_TOPICS.has(topic)) return 'US7';
  }
  throw new Es2015ProvenanceError(
    `Unknown-edition root ${path} does not match an approved provenance batch`,
  );
}

/** @param {unknown} record */
function normalizeClassificationRecord(record) {
  const value = object(record, 'ES2015 provenance classification');
  assertRootPath(value.path, 'ES2015 provenance classification path');
  if (!Number.isInteger(value.variants) || value.variants < 0) {
    throw new Es2015ProvenanceError(
      `ES2015 provenance classification ${value.path} has an invalid variant count`,
    );
  }
  if (typeof value.partition !== 'string' || value.partition === '') {
    throw new Es2015ProvenanceError(
      `ES2015 provenance classification ${value.path} must name a partition`,
    );
  }
  if (typeof value.finalClass !== 'string' || value.finalClass === '') {
    throw new Es2015ProvenanceError(
      `ES2015 provenance classification ${value.path} must name a prior class`,
    );
  }
  return {
    path: value.path,
    variants: value.variants,
    partition: value.partition,
    finalClass: value.finalClass,
  };
}

/** @param {readonly { path: string, variants: number, priorClass: string }[]} entries */
function sortEntries(entries) {
  return [...entries].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
}

/** @param {ProvenanceManifest} manifest @param {string} code @returns {ProvenanceBatch} */
function batchByCode(manifest, code) {
  const batch = manifest.batches.find((entry) => entry.code === code);
  if (batch === undefined) {
    throw new Es2015ProvenanceError(
      `${code} is not a known provenance ledger code`,
    );
  }
  return batch;
}

/** @param {ProvenanceManifest} manifest @param {string} code */
function renderLedgerSummary(manifest, code) {
  if (code === 'U0') {
    return { rootCount: 0, variantCount: 0, pathSha256: EMPTY_LEDGER_SHA256 };
  }
  const definition = ISSUE_DEFINITIONS[code];
  if (definition === undefined) {
    throw new Es2015ProvenanceError(
      `${code} is not a known provenance issue code`,
    );
  }
  /** @type {string[]} */
  const paths = [];
  let variants = 0;
  for (const batchCode of definition.aggregateCodes) {
    const batch = batchByCode(manifest, batchCode);
    for (const entry of batch.entries) {
      paths.push(entry.path);
      variants += entry.variants;
    }
  }
  const sortedPaths = sortStrings(paths);
  return {
    rootCount: sortedPaths.length,
    variantCount: variants,
    pathSha256: hashPaths(sortedPaths),
  };
}

/** @param {ReviewedDecision} decision @param {boolean} includeArtifactSha256 */
function canonicalDecisionRecord(decision, includeArtifactSha256) {
  const record = {
    path: decision.path,
    variants: decision.variants,
    priorClass: decision.priorClass,
    finalPartition: decision.finalPartition,
    finalStatus: decision.finalStatus,
    evidenceKind: decision.evidenceKind,
    specification: {
      source: decision.specification.source,
      sourceSha256: decision.specification.sourceSha256,
      clause: decision.specification.clause,
      anchor: decision.specification.anchor,
    },
    metadata: {
      es5id: decision.metadata.es5id,
      es6id: decision.metadata.es6id,
      esid: decision.metadata.esid,
      features: [...decision.metadata.features],
      includeFeatures: [...decision.metadata.includeFeatures],
      includes: [...decision.metadata.includes],
      flags: [...decision.metadata.flags],
    },
    history: decision.history.map((entry) => ({
      repository: entry.repository,
      commit: entry.commit,
      note: entry.note,
    })),
    rationale: decision.rationale,
    review: {
      reviewer: decision.review.reviewer,
      reviewedAt: decision.review.reviewedAt,
      artifact: decision.review.artifact,
    },
    destination: {
      blocker: decision.destination.blocker,
      issue: decision.destination.issue,
    },
  };
  if (includeArtifactSha256) {
    return {
      ...record,
      artifactSha256: decision.artifactSha256,
    };
  }
  return record;
}

/** @param {any} value */
function deepFreeze(value) {
  if (Array.isArray(value)) {
    for (const entry of value) deepFreeze(entry);
    return Object.freeze(value);
  }
  if (typeof value === 'object' && value !== null) {
    for (const entry of Object.values(value)) deepFreeze(entry);
    return Object.freeze(value);
  }
  return value;
}
