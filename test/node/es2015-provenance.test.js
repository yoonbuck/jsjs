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

const TEST262_REPOSITORY = 'https://github.com/tc39/test262.git';
const TEST262_REVISION = 'b363f29d3c43c626dc852744ad64a0b48a003693';
const SPECIFICATION_SOURCE = 'https://262.ecma-international.org/6.0/';
const SPECIFICATION_SHA256 =
  '4d4243dc2f04c9cdd09498f2cc2af6f6cdc07b0430da5578e7cf440d4f7846a0';

/** @param {unknown} value */
function json(value) {
  return JSON.stringify(value);
}

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** @param {unknown} value */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

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

function decisionClassifications() {
  return [
    {
      path: 'test/language/example.js',
      variants: 2,
      partition: 'unknown-edition',
      finalClass: 'unknown-edition',
      features: [],
      flags: [],
      includes: [],
    },
  ];
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

export default [
  {
    name: 'ES2015 provenance exports the approved contract constants',
    run: () => {
      assertSame(ES2015_PROVENANCE_VERSION, 1);
      assertSame(ES2015_PROVENANCE_FILE, 'tools/test262/es2015-provenance.json');
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
      badVersion.version = 2;
      assertSame(
        assertThrows(
          () => parseEs2015ProvenanceManifest(json(badVersion)),
          Es2015ProvenanceError,
        ).message,
        `${ES2015_PROVENANCE_FILE} must declare version ${ES2015_PROVENANCE_VERSION}`,
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
          () => parseEs2015DecisionFragment(json(badFragmentSpecification), 'UL3'),
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
      const classifications = foundationClassifications();
      const manifest = buildProvenanceFoundation(classifications);
      validateProvenanceFoundation(manifest, classifications);
      assertSame(
        renderBatchLedger(manifest, 'UA'),
        'test/annexB/a-first.js\ntest/annexB/z-last.js\n',
      );

      const unsortedBase = clone(manifest);
      unsortedBase.baseLedger.paths = [...unsortedBase.baseLedger.paths].reverse();
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
        clone(duplicateBatchPath.batches[0].entries[1]),
      ];
      assertSame(
        assertThrows(
          () => validateProvenanceFoundation(duplicateBatchPath, classifications),
          Es2015ProvenanceError,
        ).message,
        'UA batch ledger must not repeat base paths',
      );

      const overlap = clone(manifest);
      overlap.batches[1].entries = [clone(overlap.batches[0].entries[0])];
      overlap.batches[1].rootCount = 1;
      overlap.batches[1].variantCount = 2;
      overlap.batches[1].pathSha256 = sha256('test/annexB/a-first.js\n');
      assertSame(
        assertThrows(
          () => validateProvenanceFoundation(overlap, classifications),
          Es2015ProvenanceError,
        ).message,
        'Base path test/annexB/a-first.js appears in more than one provenance batch',
      );

      const missingBase = clone(manifest);
      missingBase.baseLedger.paths = ['test/annexB/a-first.js'];
      missingBase.baseLedger.rootCount = 1;
      missingBase.baseLedger.variantCount = 2;
      missingBase.baseLedger.pathSha256 = sha256('test/annexB/a-first.js\n');
      assertSame(
        assertThrows(
          () => validateProvenanceFoundation(missingBase, classifications),
          Es2015ProvenanceError,
        ).message,
        'Base ledger is missing path test/annexB/z-last.js',
      );

      const unexpectedBase = clone(manifest);
      unexpectedBase.baseLedger.paths = [
        unexpectedBase.baseLedger.paths[0],
        'test/annexB/unexpected.js',
        unexpectedBase.baseLedger.paths[1],
      ];
      unexpectedBase.baseLedger.rootCount = 3;
      unexpectedBase.baseLedger.variantCount = 3;
      unexpectedBase.baseLedger.pathSha256 = sha256(
        'test/annexB/a-first.js\ntest/annexB/unexpected.js\ntest/annexB/z-last.js\n',
      );
      assertSame(
        assertThrows(
          () => validateProvenanceFoundation(unexpectedBase, classifications),
          Es2015ProvenanceError,
        ).message,
        'Base ledger has unexpected path test/annexB/unexpected.js',
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
          () => validateProvenanceFoundation(wrongBatchVariants, classifications),
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
    name: 'ES2015 provenance canonicalizes and validates reviewed decision fragments',
    run: () => {
      const manifest = buildProvenanceFoundation(decisionClassifications());
      const fragment = parseEs2015DecisionFragment(json(validDecisionFragmentValue()), 'UL3');
      const validated = validateDecisionFragments(manifest, new Map([['UL3', fragment]]), {
        allowPendingReview: false,
        requireCompleteCodes: ['UL3'],
      });
      const decision = validated.get('test/language/example.js');
      if (decision === undefined) {
        throw new Error('validated decisions must include the exact batch path');
      }
      assertSame(decision.artifactSha256, canonicalDecisionSha256(decisionWithoutHash()));
      assertSame(Object.isFrozen(decision), true);
      assertSame(Object.isFrozen(decision.metadata), true);
      assertSame(Object.isFrozen(decision.metadata.features), true);
      assertSame(Object.isFrozen(fragment.decisions), true);

      const historyOnly = clone(validDecisionFragmentValue());
      historyOnly.decisions[0].evidenceKind = 'history-only';
      historyOnly.decisions[0].artifactSha256 = canonicalDecisionSha256(
        historyOnly.decisions[0],
      );
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
        'UL3 decision for test/language/example.js cannot rely on history alone',
      );

      const missingIncludeClosure = clone(validDecisionFragmentValue());
      delete missingIncludeClosure.decisions[0].metadata.includeFeatures;
      assertSame(
        assertThrows(
          () => parseEs2015DecisionFragment(json(missingIncludeClosure), 'UL3'),
          Es2015ProvenanceError,
        ).message,
        'UL3 decision for test/language/example.js metadata must contain exact keys',
      );

      const nonUtcReview = clone(validDecisionFragmentValue());
      nonUtcReview.decisions[0].review.reviewedAt = '2026-08-19T17:00:00-07:00';
      nonUtcReview.decisions[0].artifactSha256 = canonicalDecisionSha256(
        nonUtcReview.decisions[0],
      );
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
        'UL3 decision for test/language/example.js review.reviewedAt must be a UTC RFC3339 timestamp',
      );

      const malformedReviewUrl = clone(validDecisionFragmentValue());
      malformedReviewUrl.decisions[0].review.artifact = 'https://example.com/review';
      malformedReviewUrl.decisions[0].artifactSha256 = canonicalDecisionSha256(
        malformedReviewUrl.decisions[0],
      );
      assertSame(
        assertThrows(
          () =>
            validateDecisionFragments(
              manifest,
              { UL3: parseEs2015DecisionFragment(json(malformedReviewUrl), 'UL3') },
              { allowPendingReview: false },
            ),
          Es2015ProvenanceError,
        ).message,
        'UL3 decision for test/language/example.js review.artifact must be a reviewed GitHub jsjs URL',
      );

      const selfHashDrift = clone(validDecisionFragmentValue());
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
        'UL3 decision for test/language/example.js artifactSha256 does not match the canonical record',
      );

      const invalidPair = clone(validDecisionFragmentValue());
      invalidPair.decisions[0].finalPartition = 'annex-b';
      invalidPair.decisions[0].artifactSha256 = canonicalDecisionSha256(
        invalidPair.decisions[0],
      );
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
        'UL3 decision for test/language/example.js has an invalid final partition/status pair',
      );

      const unknownBlocker = clone(validDecisionFragmentValue());
      unknownBlocker.decisions[0].finalStatus = 'blocked:unknown-gap';
      unknownBlocker.decisions[0].destination.blocker = 'unknown-gap';
      unknownBlocker.decisions[0].artifactSha256 = canonicalDecisionSha256(
        unknownBlocker.decisions[0],
      );
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
        'UL3 decision for test/language/example.js names unknown blocker unknown-gap',
      );

      const missingDestinationIssue = clone(validDecisionFragmentValue());
      missingDestinationIssue.decisions[0].destination.issue = null;
      missingDestinationIssue.decisions[0].artifactSha256 = canonicalDecisionSha256(
        missingDestinationIssue.decisions[0],
      );
      assertSame(
        assertThrows(
          () =>
            validateDecisionFragments(
              manifest,
              { UL3: parseEs2015DecisionFragment(json(missingDestinationIssue), 'UL3') },
              { allowPendingReview: false },
            ),
          Es2015ProvenanceError,
        ).message,
        'UL3 decision for test/language/example.js requires a destination issue',
      );

      const incompleteCode = parseEs2015DecisionFragment(
        json({ ...validDecisionFragmentValue(), decisions: [] }),
        'UL3',
      );
      assertSame(
        assertThrows(
          () =>
            validateDecisionFragments(manifest, { UL3: incompleteCode }, {
              allowPendingReview: true,
              requireCompleteCodes: ['UL3'],
            }),
          Es2015ProvenanceError,
        ).message,
        'UL3 must contain reviewed decisions for every ledger path',
      );
    },
  },
  {
    name: 'ES2015 provenance renders deterministic issue bodies with exact dependency markers',
    run: () => {
      const manifest = buildProvenanceFoundation(decisionClassifications());
      const uaBody = renderProvenanceIssueBody(manifest, 'UA', COMPLETE_ISSUE_MAP);
      const u0Body = renderProvenanceIssueBody(manifest, 'U0', COMPLETE_ISSUE_MAP);
      const ulBody = renderProvenanceIssueBody(manifest, 'UL', COMPLETE_ISSUE_MAP);
      const usBody = renderProvenanceIssueBody(manifest, 'US', COMPLETE_ISSUE_MAP);

      for (const [code, body] of [
        ['UA', uaBody],
        ['U0', u0Body],
        ['UL', ulBody],
        ['US', usBody],
      ]) {
        assertSame(body.endsWith('\n'), true, `${code} body must end with a newline`);
      }

      const marker = `T1 / #75 | code:UA | base-ledger-sha256:${manifest.baseLedger.pathSha256}`;
      assertSame(uaBody.includes(marker), true);
      assertSame(uaBody.includes('Base ledger: 1 roots / 2 variants / SHA-256'), true);
      assertSame(uaBody.includes('Batch ledger: 0 roots / 0 variants / SHA-256'), true);
      assertSame(uaBody.includes(`Test262 pin: ${TEST262_REPOSITORY} @ ${TEST262_REVISION}`), true);
      assertSame(uaBody.includes(`Sixth Edition pin: ${SPECIFICATION_SOURCE} @ ${SPECIFICATION_SHA256}`), true);
      assertSame(uaBody.includes('Scope: Annex B'), true);
      assertSame(uaBody.includes('Non-goals: guest runtime behavior, tools/test262/features.json, and broad selection changes.'), true);
      assertSame(uaBody.includes('History alone never establishes edition evidence.'), true);
      assertSame(uaBody.includes('Guest production changes are prohibited.'), true);
      assertSame(uaBody.includes('Independent specification review and independent quality/provenance review are required.'), true);
      assertSame(uaBody.includes('Generate artifacts and timestamps with TZ=UTC.'), true);
      assertSame(uaBody.includes('Local Test262 commands are limited to metadata/audit checks or exact targeted paths only.'), true);
      assertSame(uaBody.includes('Require exact-head CI before merge.'), true);
      assertSame(uaBody.includes('Require exact-head CodeQL before merge.'), true);
      assertSame(uaBody.includes('Dependencies: U0 (#100).'), true);
      assertSame(uaBody.includes('Parent: T1 / #75.'), true);
      assertSame(u0Body.includes('zero classification decisions'), true);
      assertSame(ulBody.includes('owns no commit'), true);
      assertSame(ulBody.includes('Dependencies: UL1 (#104), UL2 (#105), UL3 (#106), UL4 (#107).'), true);
      assertSame(usBody.includes('owns no commit'), true);
      assertSame(usBody.includes('Dependencies: US1 (#109), US2 (#110), US3 (#111), US4 (#112), US5 (#113), US6 (#114), US7 (#115).'), true);

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
        'Issue map is missing required code UA',
      );
    },
  },
];
