import fs from 'node:fs';
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
const PRODUCTION_UL3_PATH =
  'test/language/expressions/await/await-BindingIdentifier-in-global.js';
const APPROVED_PRODUCTION_FOUNDATION = Object.freeze({
  baseLedger: Object.freeze({
    rootCount: 2312,
    variantCount: 4054,
    pathSha256: '56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc',
  }),
  batches: Object.freeze({
    UA: Object.freeze({
      rootCount: 314,
      variantCount: 323,
      pathSha256: 'd29150e412486095bac0103f5d7e913917269870a9769cd8343a5cc9638af98e',
      entryLedgerSha256: 'a6664c97c45fd047a4d136b62f2121b630fa742c6e21594111457e367d88cc09',
    }),
    UB: Object.freeze({
      rootCount: 32,
      variantCount: 64,
      pathSha256: '4e21b1884213e2831ffe58fb5c5128f17d417168aeabeac3c3817f8f6350623a',
      entryLedgerSha256: '99441828b25381a9ce86cbad7bdaaeb612100d2425990f0689f08bf6f7059a1a',
    }),
    UL1: Object.freeze({
      rootCount: 434,
      variantCount: 835,
      pathSha256: '1bad4b5aed5f665cfcd270a57c90553b1fe4a1dabb1334fa950527b1113b937a',
      entryLedgerSha256: 'f5044351e9319bacd6d07fdbb4f6eb995f87ab7a2c307893fbd173fcacf9b1f5',
    }),
    UL2: Object.freeze({
      rootCount: 182,
      variantCount: 364,
      pathSha256: 'b5e8412e46d0bb2d976de247d312269b9ac34fa9cda77d15a2aa11c1eb0abb45',
      entryLedgerSha256: '2516f31b492778b05737a34c24aead5520ba0804b824c4fb0af54b49fca75640',
    }),
    UL3: Object.freeze({
      rootCount: 109,
      variantCount: 212,
      pathSha256: 'af158f399b1827dd2012030fbec2fdbbb28f184c011a310550928eb718dca406',
      entryLedgerSha256: '4b4543298d376734ef7a58ce6eb2a84ed1b0997a588e509ec25a36705378c6e8',
    }),
    UL4: Object.freeze({
      rootCount: 48,
      variantCount: 48,
      pathSha256: '9316f73cad2c6608ad14d6e837e5383100bb2ebd0a4feb2ba9f198ee35e5d3ac',
      entryLedgerSha256: '4ecb3fa2541b0ba3932c61bd5b92d3a137561202036b6009bfbdf2f25a997b58',
    }),
    US1: Object.freeze({
      rootCount: 210,
      variantCount: 406,
      pathSha256: '63ff657590ebb5aa167c19975344817789a9a67b820ce0092f990376afa873f7',
      entryLedgerSha256: 'f1ef59740d3a9cbae631e0c65cd7d4aa24bd6619129d76179ca7d32e795b184f',
    }),
    US2: Object.freeze({
      rootCount: 176,
      variantCount: 352,
      pathSha256: '3b3db618ae579287c0cbe5a77124c883c3129395bf83fe7523dc1f32e3fe7d15',
      entryLedgerSha256: '5acbdcb3fdaf4e9fc95a157aac51e20041cc38b47de8717d655eb9b32e5cbfdb',
    }),
    US3: Object.freeze({
      rootCount: 99,
      variantCount: 190,
      pathSha256: '42d21ddbd59de80f8c14b1508c3502c8c0bc023061ff24c16160f1bfaec7daa1',
      entryLedgerSha256: '06922dfb4dc6fa2d2e07e7bcbf8364fcd8fc943921820a15c057b17e55fb8528',
    }),
    US4: Object.freeze({
      rootCount: 176,
      variantCount: 318,
      pathSha256: '19bc8b322158aa59af8d0b5efd38cf58885be50fdb6394b56cc94a2b94754c0b',
      entryLedgerSha256: 'e548e96a5d68e6117c454d0117831f81445d0eec93f7b873ea82a6d7673a7d66',
    }),
    US5: Object.freeze({
      rootCount: 306,
      variantCount: 540,
      pathSha256: 'fdc5ed38ef91366ee6bd9f8aa8d49917b5d9bbc2746cfd62a50f22a22cd03df5',
      entryLedgerSha256: '87d0388e420d5ffdde58c81705b19daca1d3488e3de4330b1cc8e9ad63bd36f0',
    }),
    US6: Object.freeze({
      rootCount: 48,
      variantCount: 89,
      pathSha256: '90dfecd04460d739d4a7242b6ff14c4ef83abcf3e73d7893b392138372ce1cf1',
      entryLedgerSha256: 'c7c524d8b8cd8f0094f631be7d16abcc7f946db86546aaf6339d9cd9853d6a16',
    }),
    US7: Object.freeze({
      rootCount: 178,
      variantCount: 313,
      pathSha256: '1e2cda5adef593ae134f0ab0e759091f57522821460c904c7f44c4217c891e28',
      entryLedgerSha256: '6fa9daa7322394f0f96b754ef6674ccb80b916cd4209c2308f7591eaf46f7e23',
    }),
  }),
});

/** @param {unknown} value */
function json(value) {
  return JSON.stringify(value);
}

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function entryLedgerText(entries) {
  return `${entries.map((entry) => json([entry.path, entry.variants, entry.priorClass])).join('\n')}\n`;
}

function entryLedgerSha256(entries) {
  return sha256(entryLedgerText(entries));
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

let cachedProductionClassifications;

function productionClassifications() {
  if (cachedProductionClassifications !== undefined) {
    return cachedProductionClassifications;
  }
  const taxonomy = JSON.parse(
    fs.readFileSync(
      new URL('../../tools/test262/es2015-taxonomy.json', import.meta.url),
      'utf8',
    ),
  );
  cachedProductionClassifications = taxonomy.classifications.map((record) => ({
    path: record.path,
    variants: record.variants,
    partition: record.partition,
    finalClass: record.status,
    features: record.features,
    flags: record.flags,
    includes: record.includes,
  }));
  return cachedProductionClassifications;
}

function productionManifest() {
  return buildProvenanceFoundation(productionClassifications());
}

function refreshBatchLedger(batch) {
  batch.rootCount = batch.entries.length;
  batch.variantCount = batch.entries.reduce((sum, entry) => sum + entry.variants, 0);
  batch.pathSha256 = sha256(`${batch.entries.map((entry) => entry.path).join('\n')}\n`);
  batch.entryLedgerSha256 = entryLedgerSha256(batch.entries);
}

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
  throw new Error('expected production manifest entries that can redistribute variants');
}

function tamperedPriorClassManifest() {
  const classifications = clone(productionClassifications());
  const manifest = clone(productionManifest());
  const target = findNonUl3BatchEntry(manifest);
  const batch = manifest.batches.find((entry) => entry.code === target.code);
  const entry = batch?.entries.find((candidate) => candidate.path === target.path);
  if (entry === undefined) {
    throw new Error('expected a production manifest entry to mutate priorClass');
  }
  entry.priorClass = `${entry.priorClass}:tampered`;
  if (batch === undefined) {
    throw new Error('expected a production manifest batch to mutate priorClass');
  }
  refreshBatchLedger(batch);
  const classification = classifications.find((record) => record.path === target.path);
  if (classification === undefined) {
    throw new Error('expected a production classification to mutate priorClass');
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
  const batch = manifest.batches.find((entry) => entry.code === target.code);
  const source = batch?.entries.find((entry) => entry.path === target.sourcePath);
  const destination = batch?.entries.find((entry) => entry.path === target.targetPath);
  if (source === undefined || destination === undefined) {
    throw new Error('expected production manifest entries to redistribute variants');
  }
  source.variants -= 1;
  destination.variants += 1;
  if (batch === undefined) {
    throw new Error('expected a production manifest batch to redistribute variants');
  }
  refreshBatchLedger(batch);
  const sourceClassification = classifications.find(
    (record) => record.path === target.sourcePath,
  );
  const destinationClassification = classifications.find(
    (record) => record.path === target.targetPath,
  );
  if (sourceClassification === undefined || destinationClassification === undefined) {
    throw new Error('expected production classifications to redistribute variants');
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
  fragment.decisions[0].artifactSha256 = canonicalDecisionSha256(fragment.decisions[0]);
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
      const classifications = productionClassifications();
      const manifest = productionManifest();
      validateProvenanceFoundation(manifest, classifications);

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
        clone(duplicateBatchPath.batches[0].entries[0]),
      ];
      assertSame(
        assertThrows(
          () => validateProvenanceFoundation(duplicateBatchPath, classifications),
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
        manifest.baseLedger.variantCount - manifest.batches[0].entries[1].variants;
      missingBase.baseLedger.pathSha256 = sha256(`${missingBase.baseLedger.paths[0]}\n`);
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
    name: 'ES2015 provenance pins immutable production entry ledgers without host filesystem reads',
    run: () => {
      const moduleSource = fs.readFileSync(
        new URL('../../tools/test262/es2015-provenance.js', import.meta.url),
        'utf8',
      );
      assertSame(moduleSource.includes('node:fs'), false);

      const classifications = productionClassifications();
      const manifest = productionManifest();
      validateProvenanceFoundation(manifest, classifications);
      assertSame(manifest.baseLedger.rootCount, APPROVED_PRODUCTION_FOUNDATION.baseLedger.rootCount);
      assertSame(
        manifest.baseLedger.variantCount,
        APPROVED_PRODUCTION_FOUNDATION.baseLedger.variantCount,
      );
      assertSame(
        manifest.baseLedger.pathSha256,
        APPROVED_PRODUCTION_FOUNDATION.baseLedger.pathSha256,
      );

      for (const code of ES2015_PROVENANCE_DECISION_CODES) {
        const batch = manifest.batches.find((entry) => entry.code === code);
        const expected = APPROVED_PRODUCTION_FOUNDATION.batches[code];
        if (batch === undefined || expected === undefined) {
          throw new Error(`missing approved production batch ${code}`);
        }
        assertSame(batch.rootCount, expected.rootCount, `${code} root count must stay immutable`);
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
        (record) =>
          record.path !==
          'test/annexB/built-ins/RegExp/RegExp-invalid-control-escape-character-class-range.js',
      );
      const alteredManifest = buildProvenanceFoundation(alteredClassifications);
      assertSame(
        assertThrows(
          () => validateProvenanceFoundation(alteredManifest, alteredClassifications),
          Es2015ProvenanceError,
        ).message,
        `${ES2015_PROVENANCE_FILE} base ledger root count does not match the approved immutable ledger`,
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
      const validated = validateDecisionFragments(manifest, new Map([['UL3', fragment]]), {
        allowPendingReview: false,
      });
      const decision = validated.get(PRODUCTION_UL3_PATH);
      if (decision === undefined) {
        throw new Error('validated decisions must include the exact batch path');
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
        `UL3 decision for ${PRODUCTION_UL3_PATH} review.reviewedAt must be a UTC RFC3339 timestamp`,
      );

      const malformedReviewUrl = clone(productionDecisionFragmentValue());
      malformedReviewUrl.decisions[0].review.artifact = 'https://example.com/review';
      refreshFragmentHash(malformedReviewUrl);
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
              { UL3: parseEs2015DecisionFragment(json(missingDestinationIssue), 'UL3') },
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
      strictPendingReviewer.decisions[0].review.reviewer = 'pending';
      refreshFragmentHash(strictPendingReviewer);
      assertSame(
        assertThrows(
          () =>
            validateDecisionFragments(
              manifest,
              { UL3: parseEs2015DecisionFragment(json(strictPendingReviewer), 'UL3') },
              { allowPendingReview: false },
            ),
          Es2015ProvenanceError,
        ).message,
        `UL3 decision for ${PRODUCTION_UL3_PATH} review.reviewer must not be pending in strict validation`,
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
      assertSame(draftValidated.get(PRODUCTION_UL3_PATH)?.review.reviewer, 'pending');
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
      const priorClassMessage =
        `${tamperedPriorClass.code} entry ledger SHA-256 does not match the approved immutable ledger`;
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
            validateDecisionFragments(tamperedPriorClass.manifest, { UL3: fragment }, {
              allowPendingReview: false,
            }),
          Es2015ProvenanceError,
        ).message,
        priorClassMessage,
      );
      assertSame(
        assertThrows(
          () => renderBatchLedger(tamperedPriorClass.manifest, tamperedPriorClass.code),
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
      const variantMessage =
        `${redistributedVariants.code} entry ledger SHA-256 does not match the approved immutable ledger`;
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
            validateDecisionFragments(redistributedVariants.manifest, { UL3: fragment }, {
              allowPendingReview: false,
            }),
          Es2015ProvenanceError,
        ).message,
        variantMessage,
      );
      assertSame(
        assertThrows(
          () => renderBatchLedger(redistributedVariants.manifest, redistributedVariants.code),
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
            validateDecisionFragments(productionManifest(), {}, {
              allowPendingReview: false,
              requireCompleteCodes: ['UL3'],
            }),
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
            validateDecisionFragments(productionManifest(), { UL3: incompleteCode }, {
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
      const manifest = productionManifest();
      const uaLedger = renderBatchLedger(manifest, 'UA');
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

      assertSame(uaLedger.endsWith('\n'), true);
      assertSame(
        uaLedger.startsWith(
          'test/annexB/built-ins/RegExp/RegExp-invalid-control-escape-character-class-range.js\n',
        ),
        true,
      );
      const marker = `T1 / #75 | code:UA | base-ledger-sha256:${manifest.baseLedger.pathSha256}`;
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
