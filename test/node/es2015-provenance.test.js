import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { assertSame, assertThrows } from '../harness/assert.js';
import * as provenance from '../../tools/test262/es2015-provenance.js';
import {
  ES2015_PROVENANCE_DECISION_VERSION,
  ES2015_PROVENANCE_DECISION_CODES,
  ES2015_PROVENANCE_FILE,
  ES2015_PROVENANCE_MANIFEST_VERSIONS,
  ES2015_PROVENANCE_VERSION,
  Es2015ProvenanceError,
  buildProvenanceFoundation,
  canonicalRoadmapAuthoritySha256,
  canonicalDecisionSha256,
  parseEs2015DecisionFragment,
  parseEs2015ProvenanceManifest,
  renderBatchLedger,
  renderEs2015ProvenanceManifest,
  renderProvenanceIssueBody,
  validateRoadmapAuthorityManifest,
  validateDecisionFragments,
  validateProvenanceFoundation,
} from '../../tools/test262/es2015-provenance.js';
import {
  createProvenanceCheckDependencies,
  Es2015ProvenanceCheckError,
  main as provenanceCheck,
  parseRoadmapAuthorityMarker,
  reconstructGenericPromotedAuditRecords,
  validateRoadmapProtectedOutputs,
  validateRoadmapAuthorityConsumption,
  validateRoadmapAuthorityMigration,
  validateRoadmapAuthorityPreparation,
} from '../../tools/test262/es2015-provenance-check.js';
import {
  formatCoverageLines,
  renderCoverageSummary,
  replaceGeneratedBlock,
  summarizeTest262Coverage,
} from '../../tools/test262/coverage.js';
import {
  featureNames,
  parseFeatureManifest,
} from '../../tools/test262/features.js';
import {
  createSummaryRecord,
  createTestRecord,
  formatRecordLine,
  formatReportLines,
} from '../../tools/test262/report.js';
import {
  Es2015TaxonomyError,
  buildEs2015Inventory,
  classifyEs2015Inventory,
  parseEs2015Anchors,
  parseEs2015Policy,
  renderEs2015Taxonomy,
  summarizeEs2015Classification,
} from '../../tools/test262/es2015-taxonomy.js';
import {
  assertExactH0DispositionDelta,
  assertEs2015H0BaselineMatchesTaxonomy,
  buildEs2015H0Baseline,
  buildEs2015H0Disposition,
  buildEs2015H0OwnerDeltas,
  buildEs2015Promotion,
  mergePromotionSubset,
  parseEs2015Promotion,
  promotionPaths,
  validateEs2015H0EvidenceBundle,
} from '../../tools/test262/es2015-promotion.js';
import { serializeUpstreamSubset } from '../../tools/test262/es5-selection.js';
import {
  formatUpstreamSummaryLines,
  parseUpstreamSubset,
  summarizeUpstreamRun,
  upstreamSubsetPaths,
} from '../../tools/test262/upstream.js';

/**
 * @typedef {ReturnType<typeof buildProvenanceFoundation>} ProvenanceManifest
 * @typedef {ProvenanceManifest['batches'][number]} ProvenanceBatch
 * @typedef {ProvenanceBatch['entries'][number]} ProvenanceBatchEntry
 * @typedef {{ path: string, variants: number, partition: string, finalClass: string, features: readonly string[], flags: readonly string[], includes: readonly string[] }} ClassificationRecord
 * @typedef {{ rootCount: number, variantCount: number, pathSha256: string, entryLedgerSha256: string }} ApprovedBatchSummary
 * @typedef {readonly { type: 'test', file: string, variant: 'non-strict' | 'strict', status: 'passed' }[]} ExecutionRecords
 * @typedef {{ file: string, variant?: string | null, [key: string]: unknown }} AuditEvidenceRecord
 * @typedef {{ path: string, variants: number, partition: string, status: string, blocker: string | null }} TaxonomyArtifactClassification
 * @typedef {{ subsetText: string, featuresText: string, reportText: string, auditEvidenceText: string }} TaxonomyArtifactInputs
 */

const readFileSyncText =
  /** @type {(path: URL, encoding: string) => string} */ (
    /** @type {any} */ (fs).readFileSync
  );
const { structuredClone } = globalThis;

const TEST262_REPOSITORY = 'https://github.com/tc39/test262.git';
const TEST262_REVISION = 'b363f29d3c43c626dc852744ad64a0b48a003693';
const H0_BOOTSTRAP_BASE_SHA = '03a4ccadb2b07fa7d3c1ad0f599608b0a7c31efd';
const H0_REPAIRED_BASE_SHA = '144f49f7bde1179d1b1d523f5048eca70c54a9de';
const H0_EVIDENCE_PATHS = Object.freeze([
  'tools/test262/es2015-h0-baseline.json',
  'tools/test262/es2015-h0-disposition.json',
  'tools/test262/es2015-h0-owner-deltas.json',
  'tools/test262/es2015-h0-owner-map.json',
  'tools/test262/es2015-h0-paths.json',
  'tools/test262/es2015-h0-promotion.json',
]);
const H0_PROTECTED_OUTPUT_PATHS = Object.freeze([
  'docs/conformance.md',
  'docs/test262-report.jsonl',
  ...H0_EVIDENCE_PATHS,
  'tools/test262/es2015-taxonomy.json',
  'tools/test262/upstream-subset.json',
]);
const H0_PROJECTED_OUTPUT_SHA256 = Object.freeze({
  'docs/conformance.md':
    'b334793aba47b475dd0f8090e6da9f73c0b2b0c75964e5562995f6deb144a7c2',
  'docs/test262-report.jsonl':
    '21db3f9e84a17c79389945b879a6359b8a661a35a8b06a947322f53e2b6440cd',
  'tools/test262/es2015-taxonomy.json':
    '6f60af3b4416b537257cc7c3d418ed918978b7e14b1e5fc6567db9e379dc5908',
  'tools/test262/upstream-subset.json':
    'f7840957b181a3497eb3bb0eac349f08e54b7dd075276088652295fba1778a2b',
});
const H0_BOOTSTRAP_REPAIR_BASE_MANIFEST_SHA256 =
  'a2b0b43085376ab65069829252b8a8dae2da538e5e3cf4a0a0e937725ca72974';
const M1_AUTHORITY_REPAIR_BASE = '554afc367657439d116d23f4477bb24787a0e261';
const M1_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256 =
  'abc71cd2ac6284b8a67cf1dbe98b507a9a6f71fda478998aa27520869ff97f19';
const M1_AUTHORITY_REPAIR_BASE_CHECKER_SHA256 =
  'bb7513d190af22f377d451bdfa1618c6b808ccd40a5e534c34f7ebcdc57ea409';
const M1_AUTHORITY_REPAIR_BASE_RECORD_SHA256 =
  '5ee279b8b9c836fbb039caf83a5de0f73b31f427133214e4fd250871bc2345f8';
const M1_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256 =
  'c12f0cc983141fccfc132dd7d872a29022192d33d72389eac9960c3403b21fbf';
const M1_AUTHORITY_REPAIR_HEAD_RECORD_SHA256 =
  '42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670';
const M1_AUTHORITY_REPAIR_CHANGES = Object.freeze([
  {
    status: 'M',
    path: 'tools/test262/es2015-provenance-check.js',
  },
  {
    status: 'M',
    path: ES2015_PROVENANCE_FILE,
  },
  {
    status: 'M',
    path: 'test/node/es2015-provenance.test.js',
  },
  {
    status: 'M',
    path: 'docs/testing.md',
  },
  {
    status: 'A',
    path: 'docs/superpowers/specs/2026-08-23-m1-authority-repair-design.md',
  },
  {
    status: 'A',
    path: 'docs/superpowers/plans/2026-08-23-m1-authority-repair.md',
  },
]);
const M1_AUTHORITY_REPAIR_PROMOTION_SHA256 =
  '31f807a05d56d35762cd5457f779624df04f11ef482b3d1bcb60be3a06883c69';
const M1_AUTHORITY_REPAIR_PROJECT_PROJECTIONS = Object.freeze({
  'docs/conformance.md':
    '79a033c365600cceb1f337bcc680bfdd76b095be0a6b5fb64db604c784cce65b',
  'docs/test262-report.jsonl':
    'b1968f16a04240ce1169430f695f01a4ee013fdbf2ba3dcdd38b4ccabdcc225f',
  'tools/test262/es2015-taxonomy.json':
    'a7b4dbd0334bd5ca34a25c80b156a051c444c989d8b87ba6ae18d34a7ca0078c',
  'tools/test262/upstream-subset.json':
    'bd59cfd5496a3c180a99240b6611d1efe0141b931c63d13fd897dc0c1b25cdf3',
});
const M1_AUTHORITY_REPAIR_SELECTION_OUTPUT = Object.freeze({
  path: 'tools/test262/es5-selection.json',
  operation: 'replace-exact',
  baseSha256:
    '533e0b9fc165a026d64c4e64d783cf2585de7236600acacf228f06d27f23d8c8',
  headSha256:
    '78ac694beb258be0b67c7788137c736b0b30cf7457e3a903d364d38c038b48df',
  projectionSha256: null,
});
const P1C_AUTHORITY_REPAIR_BASE = 'edccfb8822339dab53c47bbb8c4ae5cc2db93b1b';
const P1C_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256 =
  '55b95d0fb5071b411dd3d82051496505e154f043adee62c2bd2e4aae643c2227';
const P1C_AUTHORITY_REPAIR_BASE_CHECKER_SHA256 =
  'c806b9987a647b790ecfa736f4b6cc960e86c78755c3a824885313bae4b37e96';
const P1C_AUTHORITY_REPAIR_BASE_RECORD_SHA256 =
  '3281bd0001ac48ee6f31d21d12a8faade3652cd194360fcf21c3ffc1b9a3a193';
const P1C_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256 =
  '5b94b819025e79ebadb763a7d5eb0ce67174f15effcee61745d305e2a32034c4';
const P1C_AUTHORITY_REPAIR_HEAD_RECORD_SHA256 =
  '95036226ee50e365b03c823bab751c6e1d646af0d5c6352a199cd442e2aa9278';
const P1C_AUTHORITY_REPAIR_MARKER_SHA256 =
  '780c1ce94d24ef9e249c209fdd28a56ab9ec885ec4d75a92ba7c0ecd21396177';
const P1C_AUTHORITY_REPAIR_CHANGES = Object.freeze([
  {
    status: 'M',
    path: 'tools/test262/es2015-provenance-check.js',
  },
  {
    status: 'M',
    path: ES2015_PROVENANCE_FILE,
  },
  {
    status: 'M',
    path: 'test/node/es2015-provenance.test.js',
  },
  {
    status: 'M',
    path: 'docs/testing.md',
  },
  {
    status: 'A',
    path: 'docs/superpowers/specs/2026-08-24-p1c-authority-repair-design.md',
  },
  {
    status: 'A',
    path: 'docs/superpowers/plans/2026-08-24-p1c-authority-repair.md',
  },
]);
const P1C_AUTHORITY_REPAIR_APPLIED_RECORD_SHA256 =
  '64db02e17f5d7e7f26805eee912d625b53a989e4c4ae17b15165bea3118bfefa';
const P1C_AUTHORITY_REPAIR_APPLIED_MANIFEST_SHA256 =
  '55cea42748f5f2a2abc2228b7d33aa0f4d6c2ec9b55b2d96f40782eb565f396f';
const P1C_AUTHORITY_REPAIR_PROJECTION_SHA256 =
  '6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813';
const P1C_AUTHORITY_REPAIR_AUDIT_OUTPUT = Object.freeze({
  path: 'tools/test262/es2015-audit-evidence.json',
  operation: 'replace-exact',
  baseSha256:
    'eabaeb8245a6988443d91b21219c9e7919ec22639d6e8515a8dadbe5ddfc217f',
  headSha256:
    '50f9a54346d0e9e5168a6ac6b0b8de6d709e2c5b808d6c8b036e5113612e638c',
  projectionSha256: null,
});
const P1C_AUTHORITY_REPAIR_TAXONOMY_OUTPUT = Object.freeze({
  path: 'tools/test262/es2015-taxonomy.json',
  operation: 'replace-exact',
  baseSha256:
    'fba700539b05edd67b6cf67e4c0a1361398a2d0f04212bc7080a83f44abf577a',
  headSha256:
    'fdf3c8bf229f6c841209e4c4a2196001d45cf0a1c270f334cf06e5f54a00f3c7',
  projectionSha256: null,
});
const P1C_AUTHORITY_REPAIR_SUBSET_OUTPUT = Object.freeze({
  path: 'tools/test262/upstream-subset.json',
  operation: 'replace-exact',
  baseSha256:
    '9f768aa8fb0c473e98fe2156d290c4207cea797302cccad6f9b1b922a36b37c0',
  headSha256:
    '5a5b83b3c28991c5f2ac141ed949a9698966cce85587d671a4417228d5e08b14',
  projectionSha256: null,
});
const P1C_AUTHORITY_REPAIR_COLLATERAL_PATHS = Object.freeze([
  'test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-ary-elem.js',
  'test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-ary-rest.js',
  'test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-obj-id.js',
  'test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-obj-prop-id.js',
]);
const P1C_AUTHORITY_REPAIR_SELECTED_TOTALS = Object.freeze({
  baseRoots: 20676,
  baseVariants: 39300,
  headRoots: 20672,
  headVariants: 39292,
});
const P1C_AUTHORITY_REPAIR_AUDIT_TOTALS = Object.freeze({
  baseRecords: 21854,
  baseRoots: 5010,
  headRecords: 21862,
  headRoots: 5014,
});
const P1C_AUTHORITY_REPAIR_TAXONOMY_SELECTED_TOTALS = Object.freeze({
  baseRoots: 19849,
  baseVariants: 37792,
  headRoots: 19845,
  headVariants: 37784,
});
const P1C_AUTHORITY_REPAIR_CORE_P1_BLOCKERS = Object.freeze({
  baseRoots: 402,
  baseVariants: 790,
  headRoots: 406,
  headVariants: 798,
});
const P1C_AUTHORITY_REPAIR_COLLATERAL_EXECUTION = Object.freeze({
  basePassedRecords: 8,
  headParseFailureRecords: 8,
});
const H0_BOOTSTRAP_REPAIR_PRODUCTION_PATHS = Object.freeze([
  'tools/test262/es2015-promotion.js',
  'tools/test262/es2015-provenance-check.js',
  'tools/test262/es2015-provenance.js',
]);
const H0_BOOTSTRAP_REPAIR_CHANGES = Object.freeze([
  {
    status: 'A',
    path: 'docs/superpowers/plans/2026-08-21-h0-policy-bootstrap-repair.md',
  },
  {
    status: 'A',
    path: 'docs/superpowers/specs/2026-08-21-h0-policy-bootstrap-repair-design.md',
  },
  { status: 'M', path: 'docs/testing.md' },
  { status: 'M', path: 'test/node/es2015-provenance.test.js' },
  { status: 'M', path: 'test/node/repository-invariants.test.js' },
  { status: 'M', path: 'test/node/upstream-select.test.js' },
  ...H0_BOOTSTRAP_REPAIR_PRODUCTION_PATHS.map((path) => ({
    status: 'M',
    path,
  })),
]);
const H0_BOOTSTRAP_REPAIR_IMMUTABLE_PATHS = Object.freeze([
  '.github/workflows/ci.yml',
  'tools/ci/pipeline.js',
  ES2015_PROVENANCE_FILE,
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
  ...H0_EVIDENCE_PATHS,
  'docs/conformance.md',
  'docs/test262-report.jsonl',
  'tools/test262/es2015-audit-evidence.json',
  'tools/test262/es2015-taxonomy.json',
  'tools/test262/es5-selection.json',
  'tools/test262/upstream-subset.json',
  'tools/test262/features.json',
]);
// Keep the exact reviewed evidence hermetic without adding protected artifacts.
const H0_EXACT_FIXTURE_GZIP_BASE64 = `
H4sIAAAAAAACA+19S5PbOLLuX2HUZmYiihafIOndcY27T5/bHjvsPn0X417gkVBxTJG6IFVVmon+RfMTZte/7AZISsWqEiWKpF7l3PghCYlEIpEfkMhM/OsK
7mIBKYert/+6YjSHJE7h6u3Vv76mhvH16g5UHmfp16u3hn1dfSTjlCbvaA432WwWF/qrr1dRxD03kg5I4YSBF0TSs0QoLCCUO0JElLLQBtv6elVTUTDP8rjI
1LIicFsU8/ztZDKNi9sFe8Oz2aTgbjQpIC8c4ryZ6p7Wbe/iFVdfr5hLXOlEwuWey4lDBA99J/A8KohHLeaF1LJcErnr5usB/EIfsjSbLb/cUscnFTUIAo8w
Iiix3JDbUtDQBRsIZ8AZRJK5ELAoYEKGEXVtm1vUla5HSUh4EPmPvdxaP4OYgmoSdykwx/cEhCKKCFjM5y53Q1dY4AvpE0F8GzzhOtSRzA5tJh3bDS3PYh64
kW81iH/OsuImW6Sl/G3XX3/xK1UxTR+/c0iw/u4moXkey5jTIs7SJmeBCALKiCMjIoAQFvquS5yQA1iRBC+SrnAj13OA2FYkfc+xaBCRyPZsL3CI6605S7P0
v7f0A8SyosBmLgtB0oAxn1qOjJgIQsclnozCwOVOxIjgwnKlH4KgAfcd5gSSOJ5Y9zOnqohL6gUtFvmXxWxGK10qNbdUkywrcv2J7/pBJaBSpSsBld/YlhPZ
zvqrNdHyy79XHxsritVvUjqDaiw0TeHBZDVLq+/XvQaO/+SLZr8RsVZf/X69oxueKWjrw/Ec32rtxSOe43Xu55aqFPLcvKNJLMqJa+vVtklrn47rdO4xoQUo
M1NmmqUm5I5l+60DJXbgtHbq247XvdtF+i3N7lMTRLxtlI5rt/foWf6jZKt//LZWo7xUSdiiRNUvajVaiLgw53rFpFNzkeaQAC9APOOLJRn/Bkq3SRdJ0sZz
O8e7BNTkqepMvK1V3LwHZvJsNqdFzOIkLpbtzK3Xxc5Ga67dsF2fvNDqwTeLU6qWpqAFNWkqzGI5B2FSpegy38b6Hu0eV4NvteuJE0WkB/9AVbI0QalM5SUj
AnhCVbkqzTjNC5oW8aY1+mQ0vamsx0YCr3Votu27PYb2DZYgTJ4lWssrU9s+gl0/bpj4LYxaxOvBaAIPMaeJOVVUY0spwBTuzYKqKRTbuN6r5XoI4ZYRkD5K
NFfZHJRZ0DgxOU2SrZLe9ePHxdqu7K7Tj8uHZSkiBVJPszmDgmbsH8CLHQx3bfeozm67obEdN+jBvoIpPMzNRRrzTEDJT17E/NtWC9m10aN6b9PusBfbMxqn
GnASmk4XdAqmWqRFPAMzh5m2CzzfPoK92z8azC0q5Nj+oNFomyaoEmYSM6VNORUi3mlmerR/3OYF7ds82++lU/lyxrLEnKusyHiWmCLO57Tgt9uG0LHN404h
al8KftBHpeqTmslVluemAprMzNss37qIO7Z5VJ3A3mJ9oj243rnb7bTfGrYTbvITpwWkmg2amALu4t4sbdmz7sHO7q15N2YGb9ubTK12xqvNcq8Zi7btadzA
8/bZ1Gw/SnTcsu95zNB//b71FNw8cFvM8iXxbZd7EsLA94TjSUHAd8MoiCyfMRkFjHgkYsyxuE/DyCW25fpMutKxxderr+nvX9Or6yttUbTLJs7Srf6hE3p2
8myh+Pfm1oEH4As9K+9rT16TNcdhoeU5kW1FtkuoRULCZOj5PHS5ZXMuQua4zBeWL4GHkR0GDsjQtYklQ08AWbOW3aegPtB5k7jwrdJDQxwbKA8jIjkw1/Gl
73mhJVyXRyS0uCUJc4hHCWcc/NB2eCA96XlsTXw9hE80z0E8H2sQPf/dDzROXv7ODsP6h/rYmUABFb0nQvWsjb950We4VkltbKbpMzKR/+L7l+ys+KZJUnH8
lIT3/OuXFFaTPIsfnrW2m9+80I76y8aabXoj1vZMW5Di9hGLJ2wRJ4U+G07+Sx96J1Jls0m5qTD1P01eZKrC6Tf/aG6JnprFR5k8+ckTdGx8ruD/LWK1HsVT
v0ntVDTzQsUvdvarD1ef/dagOlexNoYfteI2/ILVl3rfXfH6s/WMZpzni/K7yB11x1jERVL3eVOrnvH+i0ZWo5S1QVNhfCzPL0aDxks0+nolaZwsFHyJpykt
FgpeSmyRwsO8AsviVmX3b6cLyAujOh4Z93Fxa8wgz+kU3ho3NE2zwuBZegeqKKHKyJSxSAXIuJzDTeLNgWd64MuV2Sl5aP4Cml88MteYh4ZSVIJpmejn+iXL
1fLiJ1rtVtjxXAAvflwPv/r1IOk8Z3Q1K5sZGWcmmvqwXaQozm7iXOt49Y+VeLubygTSaXE7qWibeleofSpm9bGZ3YGSSXa/23jOSzw6oeE83LpdDe0gWryB
+OA5zSSCH4Ifgh+CH4LfVkO50UqaWQpoKV+LpYSHuYJce2eMODe0blFDLlJeOb6+Zyu5XTLjLeluM3Cx1vHsxHggq1jcZ2gV0SqiVUSriFZxbRX/CQrNIppF
NItoFr9js6gDTic8SzktJlwBLcDcbC7LmFR0I1+GG3m/qdVS2Dm9CIeXBIdVn2+mUHxaqcJH+edqkiuV+PNf/mIoKBYqzY2bRV5ks5siU2/WmmO8rzszvtAZ
/EqTBfz5j3//8Z9r449//73us+rltz/+8xejyAwGRqG0mL9ntD2p4MdDobPQn4vdK6ASjKoEI8KhjJMCFO50XuFOp8vU4k7n1e10cJvSB6HOAV6+4w3CqxH/
iPZ7RueIy68Ql3fOK4IygjKCMoIyiv/8QDlPYg4Iy68QljvMLAIzAjMCMwIziv8MgXmOyPxakXmO0IzQjNCM0IzQfDHQ/G4hJajXnbz7rtVG12VDhpa4bNjm
n7RpnkFaGH+lBTXeaYr5tcGWBRiaI55fl5a6abqrOTiGrW50t4rSxPTdHXIZb8F3kf7FWtSzEuEAq/guyxKg6SsvZ+C07lr9Y+1af6iDw6+1pYRr470uv1sZ
x//58vFvmIaB+QOYhnGWaRh6Z/NrDPe4a8RdY3fT2Lpssw0T8WIy7GeL5OmEhC++6zcpWyamFv1K95tr6alR2rCAdcd3MdybPEvzQi3KxSJgDqnIzZVHjJUC
rpgsuc83r1fcfOPm+7VuvvVO8DsokYO7b9x94+4bd99j28jXVDAHbSTaSLSRaCPHtpGvqnwOGkk0kmgk0Uj2MpLlSsV7LjSQaCDRQKKBfGkgVyt3ot/5NFms
bw5u49Xze2WBcIxSPvco5e2TeKfD7nASL2YS9euPKqVJPrmhSTLhCc3zjvsWnMlzncnVpeiE0RxWs3mXfdMPWJaPF7+qPemH1j1paI/yivO26+tPmoxRKDrP
rw0tZE6rvanejsbpo8Au60GZQbEFH6xtsQX1m4qtsQWdJ+bF5PyQqRlN4n+CUdyuTwu1qFarQxO7zYSWUqFoU/M6hB1kSlSBD+uwA/MZXXOuoFwMeVzAdxJu
gE/14FM9Q0BKgIrvQC93XT9Q7yBfFz792J7RRkZ9536Tz2RNxuCZWhvFFUmjJmk0SB4xwY0avyznUPpvDLYojGl56hSxDojRGAvlN40Yr4qQtu45nYGR0hkg
qg1FNa6yfHV8KyX+JKpOi6+Ii+V3AmYj6+YBktvGXTSXn3D4/UzUoQG4dOMs0jiNi7i0OAKB+HsB4s9QaiVHNEY0PksjP5qCHsTSj758XgMuf39TNgZCb46y
WleFwUgCjCTASAKMJMBIgnZriTYSbSTaSLSRaCMfbWRZUZDO58lyQtW0TJA206wwK/Yw2uPCoj2ez2npu9PzqaOyKEsAZ/RiZ1TH1E2mUJgyrU9/CvhC5fEd
nv5wZ4M7G9zZ4M5mp81ES4mWEi0lWkq0lJssJbrN0GSiyUSTiSbzhcn8EVJQtMjU93Yji+FRaDbRbKLZPKjZRGOJxhKNJRrL79tY6iPgRMs3ncZyOVEwTygH
VdWtXudoVxnbmKuNudqHi6N/5ivZ5i8Zw2dyCL9Jh6D6f+S1TpfrrYyoX8wgb6y0ShXMDZCJuduYu/09525/oPPXvZW/aX+XZMuLo99gCcLkWaLxaLtv+BGI
dOZApgQo0NlBq6bGN1ApJM0HST7Q+TFg6AOd47N1O+Qx3ordJu2LNXknFdkAs/Y3WsR3Ve5PPnl/RxOs3okXY+i0QKcFOi26WMzPNJ0Cmkw0mWgy0WSiyexk
Mp8knKPZRLOJZhPNJprNHWbzyzIt6APaTLSZaDPRZqLN7GIz14UH0WKixUSLiRYTLeYOi/m/n39Cg4kGEw0mGkw0mG0GczFj8NotpN1qIb1jWcgvZaDitVHJ
uzKNH2hxi6YR1zSaxrM0jR/Ljl+5aWxPeXKPZRr/SydIlAaxkjiaRFzLaBLP0iR+UtkszgEP1HigRhOJJhJN5EYT+bB8LMq70DkiOSZ8vsaEz4qV/rk2+FjS
pgVdsVZOsFmruclreHzxNO+mHl5xaudmjRvPQG7X6IvFl5OLbSQ80fmg5i1NRQIKIQVrCCC8ILxg5QCsHHDEygFNONKLyNz7iQqEpcuDpY9Pdji0+XwiIhIi
0uFM6FbFG896dtLvi8WhMxPiYPRZE0YHGzrYEG8Qb9DBhg620TAFnWzoZEOIQYhBJxs62U7qZHuEJAXFQqXNp31LVnOTZVkCNEWYQqcbIhQiFDrdUIiHd7q1
olF5ckIoQihCKEIoQihCIZ4SinSaLYIRghGCEYIRghEK8YRgVD1ShWCEYIRghGCEYIRCPCUYLWcsQzcdghGCEYIRghEK8ZRgtI6cQDxCPEI8QjxCPEIhHh6P
MHEVEQgRCBEIEQgR6LQI9HgAapbUVFleZ7SaKdwXVE2hQGTC3FaEJIQkzG3F3NbDwM4aavAohICDgIOAg4CDgNMLcCqin1Q2B1Xo/+YcMQXdawgtCC3oXkMh
Hsq99gx2sJAPFvJBDEIMwkI+WMjnpIV8nuFS5WQrD0U8S2U8XagyAKH8pAxJaH6KwIXnJsQsxCw8N6EQj3NuauBThUazOS3iFUKpeK5f/HyBU3h1hHCFcIVw
hXCFcHV+cIWwhLCEsISwhLCEQjw6LD1G2704NSFEIUQhRCFEIUQhRJ0HRNV+vDo7Fh4KSPMYL6IQnxCfEJ8Qn1CIR8QnLNOAMIQwhDCEMIQwdFQY0ksDYQhh
CGEIYQhhCGHoJDCk3XCyftvVVMAXKo/vADHndWEOPMwV5HmcpYg7iDtHNpk7lW88s9lZzy8Wf85UmKPiEKIPog+iD6IPog+iz9HQBz1w6IFDLEIsQg8ceuCO
7YH7eJ+uLoL+uo7VnijIF0lhFss5rHCpftgozRS+aoQYhRiFGIUYhRh1QozCQxMCEgISAhICEgLSkQHpk35UQh+OPkqEIYQhhCGEIYQhhKGjwtAtzRF7EHsQ
exB7EHsQe46KPXH+fl03AUEIQQhBCEEIQQhB6KgglN2n/weW+URBsVBpCT9JnK8DFUpGcwQijOpGMEIwwqhujOo+ZlT3CpzwcISHI8QjxCM8HOHh6JiHo7mC
O0iL2k2XpYhEiESIRIhEiESIRMdFosoWlhdFPBurzoK9D+YgtIwGLe/rXxrU+GU5h/dKZcpgi8KYlkr0GSQobcfKLxBsXg3YnJmN3FMNx7OaPfV/DDuaY50A
3MPjHh738LiHxz38kffwOaa8IAwhDCEMIQwhDJ0Chj7D9P3DfDLXIGRKlc1M/uqeFP1stWFOtAVzFEzhYW4u0lhTKg1dXsT823IPwKmka0wVnc2oujYWk+W1
ocUIFebMVcZAGIzyb5CKUwV4yUXKNQ7uAzzfR/TRo2QOGy3zcgZeVdzRScU4knHUO/TJl+WMZcmbfJ7ExaT8swBlvm7jabcaT6fdeOaloCrJ8CwxRZzPacFv
223nTb0/q23m5Euh4nRqVBI3VoTK/eFU0aezfP7mctA+/fPWffoTDOuNY4fDsg779ZrFWmnKdaW35fliBnoDX37Z2PvUD1vkMKNpEfP8Ow6PRYBCgGoC1DTJ
GE0mXGV5jpv417qJb0xvzd2btQoYU9CbEqP2n9ApjdO8MGopGy2Ndly/iViW92+FAeU3DWNcsaYdOTmdgZHSGXzf54izn5zxTNzF6OHFghUq01kq05iQHU/T
TMENzQFhG2EbYRstLVpahG1UpjOH7dkiKeIkThG1EbURtdHQoqFF1EZlOnfUzrOF4gjZCNkI2Whl0coiZKMynT1kl3iEkP26IfuGpjpEgmfpHajCSBdJYmTK
WD+I+X1j5m7pjGdnus/ExaLG2YpzTLtZGwg0nGg40XCi4UTD2WI4v0DxutOfbloj+EOv3Vp+gyXo5MhEp3bqOnd7WMkvUJTWMInvwHgkYcQFKFpk6igZtpqJ
OvAWTWGLPMZbrdukfbHm7qQiG2LSytyZ123Vfm7PS/K27QFnNE7jdGrmBdWrXphJzBRVS5MKEe8wdOscpZWdK+V8bfxtMWOgqh3gB1rcGg1amNKJqR6YMXM2
GTNN01gek4us/kjr7xRSUDHfbSnnNM9PaiUPt0BXQzuI2m4gPuZk3tFkoevo4Fxe3lyWyZ8TmamuHiuctzOat1ua/5TqPVX36AqcvzOavzi/yVJOiy9zBVSU
VYVxGi9wGmsPC07eBU7eN1j+gFN3kVM308VNcOYucOYUzBOKm5aLnLscqMJld5lTNwceQ45zd5Fzp8uf4cxd3swV2ScVz+IivkPAu8z5q1yev9Apzt8Fzt8i
zXk2194VRL6Lmr9f9N3VOkh+IuK8iFNemDiJlzSJyzmI/1KKLm8eUxnySfUnW+hsB5OqVx438a79AYaoPW6CxamOkRC0oGXgrL5tEybVsuwUGFaWbQVlxqmA
BxAGPGRFzGkZMfE4Lc0Uk96hE7dUpZDnZpm08jZOebIQYGhVeOzozT9yo7hVcP/W2HIf/UOS0YJ4FWv9Q8kG1X59t7X2axhsr/3aedq2TN1faUGNd5pqfm2w
ZaEj+gTwvAp3qSNhShm9K5fQXpVfS4ZKfpoFXvNV9deK1XpplqMoh3fmFV+faOD2qIuDqed2sR95jRw78gUnYNRwwq24mUA6LW4RNxE3ETcRN9FsI24ibnbB
zTTTmJkjaCJoImgiaKLNRtBE0NwFmhVTeNhE3ETcRNxEs424ibjZBTcbKxixE7ETsROxE003YidiZ4Wd/xfotw90/srLQLXjon+YMlC1WEszqv+tC96UcztX
8R0twLgH+s3Ii0yV2nr4SikrhrAs1G6ZjFfWY5fUL7YuylmIbqDZe/3V79DsrZhAs7dbJuOu3VdZFe8sRLe32UtoOl3QKUzgjiZmWRk5TkWsgBcTjN8/4/j9
x4lblwfLJ5wmSTWT5dyZq6kcMIl230k8+XyNI9KyXlZZnbUSLMvE0qy2Brg+Lm19pHBfFkEr93OgFE7hxU1hvpiDmryqvfiP7XX7SZearSs5mWqRFvEMzBxm
NC1i3qVm65qMwTO1LuG6ImnUJI0GSSzdijVHsXTriUu3brSNBZ1ONVswmye0gAmn/BYQ4y4C46ZJxlYnsJyreF6YAnhianUxxWKe4wxe8Azi5F3o5CXwYApI
QFtsPEWPJlIFFTcgzOpnuEAueIHcUVX+hyoQ5l1MTe0peS2ns0+tL2oEYfvpDKhKltU1f16G4FTyodqO6FumQp+m6Iv95uYzWvNkVhKunh7Ny7uUBmHjGeHD
n9R+EpAWsYxBGX/S+uIQ51eq/mTc0tygia6ZvDQYQGqs1OP7Pr71ENd4h5EBc3WRZgkh5ULnTsOJvmOO82GbLpzFE88izt2Zz50Ow80nCsoHzTlMplCY5WMx
+oZrbjKa63/VpTHRkXSRczpfDJrTS9qqf2gPatryAPJcZQ/Lco+uQOrAJnMGBa22UHvEN33SZIxC0Xl+bSi4y3i5C6/C5eP0UWCH35VXrJwoc+HD1syFINqe
udB5Ml5MyA+ZmtEk/icYxe36tFSLR6ehqJQmmthtJnS+SaFoU9s65CxkSlRpFTnoQMEnFM25glL187iA885SGO0ws1nLxjuvbNfii717OrnYnkOL/uu3r+nv
X9Or62qFa49nQfOrt1elXL9e3YHK40oSlSHVsplneVxkallnNhTFPH87mUzj4nbB3vBsNim4G03qk+ababyaAt32Ll7R+3rFXOJKJxIu91xOHCJ46DuB51FB
PGoxL6SW5ZLIXTe/tX4GMQX15ZY6PqmIuBSY43sCQhFFBCzmc5e7oSss8IX0iSC+DZ5wHepIZoc2k47thpZnMQ/cyLfWxEWclwOLs7RJn3qhYJ5nB2BT4dlO
FIIlHI8xAjZIO3J8QWhoO5T5EbV9z+Zge8AdahEhQz9Y05+rbJa9oO5TEQaMChH43PcC6UkPHMks5gvLdwnzIhIBdZmMAhIQ13VlFFie64HPJXX4mrq2at/i
dPrT2t5aj/3eQUprq1Ovl69XebZQHH6hD1mazZZNniAIPMKIoMRyQ25LQUMXbCCcAWcQSeZCwKKACRlG1LVtblFXuh4lIeFB5Ltrnf56BQ/AF3rMK5Rp9uM4
LLQ8J7KtyHYJtUhImAw9n4cut2zORcgct5SDBB5Gdhg4IEPXJpYMPQGk0U+pvB/ovEle+Jb0QxDEsYHyMCKSA3MdX/qeF1rCdXlEQotbkjCHeJRwxsEPbYeX
k+Cxaun8XkuxLGz8We+ZnkjxCYTVGt8sgmzeZnnRYFTBLLsD8TnL6usB13/+XXMD5ZCg+XUVr7FubL38rtnYavJfLewG7jQ2lNmO3dV/t4apBFvCVHZKY8vO
ap6pQlcFN1ZpU1maLI1fKopGRbGcDCNfzPWPN2+uqhjItb2pBfxkO6tezsSLXS4Jrp/uvl9u0p5lEpTJWROdQdAlmaCVQFVLclLZcjO7T6udfF1iMrsDJZPs
fi+SmRzE0ca2ZpbCoPbFfTao/T9B7UWgfBuVl+/7TbgCWoC5mTCt0/LGp6y3df2oyzgpQB2C7y6U+/M9o/NDML2TbH+O8yQuH8IanecOhAdwPT8Y2/PR+a4y
yHuapHdZlgBNe7bWae6/xnDfvzkMMIdbmnexhluadzKG1bMN/Ub+Qx3HViYdmCzWZQZu4xXEL1IBciCN0mvVncbqSJ5PbnQaBE9onvcaUIPQqjbBpHSb1cTu
sm+gT/zaUzECaQEqvgPt8CgWKjXX2RvjUC3luUjjNC7i0j0i9qW+Wb/W9mAgoT2blxaIzufJckLVtKogkWaFWZdAG0iyFJYmp/VR7zz7E9TKXPrTZVpLTAFf
qDy+g1HI9SbSbxZ+XKXBjKYWHSnupPM/Xz7+bZKX7z/Fcrl6uFJV8LNepdWa7UaxY82DDS3/RrVTvbSq+eT9HU2GGNgnxD7TdArjUVvdDoxG8csyLejDaOQe
3xQagdj/fv5pEK3FjPXenHws7VLPxp9UNotz6N/6YfloKxf6SJ33aJsuksS8palIoE/X+kbE7GdWKzLrAkE9R/HYvvdIHknUIN2AnNIhm5us2oWOTbZkeXSa
WqHHplqZ4NGpli/EjU213J1qx3hPwiPq9IrUI0vN1d5wmqVwX1A1hWLcLtZk9+K/IvRJZXNQhf5vzoe0770wn9GpRlJyw7NUxtOFKqem/KScrOan43RUkZ3N
aRGvutJBMJl62eFwQXfqdxz6j9ryYhwH7KsWUb224KGANI+HTtbQ1VomAIxIr+ex4GXj7k1GYfrjfboSwl/XKjBRkC+SoqwxuOqgtrZppnqa2tbOxhjGp9UZ
5aMcTu+W5sOJxPn7taYPp5bdp/8HlnkT/pI4f46BfSgOZm2u4A7Soh5tmbM4lGQValMKjmf7rox8jJWRj6ZSn2H6/qHv4bPZuDzuV6/rvqneJS//LECZIxGv
wj7bn+vtQiOeppmCG5rDMDqzRVLESZwOJFPdhQ+kUcT823IYjUUal9G0+xDpWLBsU8ty3z5C45L31VPcZZmNsnZKzPvSKv2/H2UfUtW70jJT+wmxanZL85/K
RJo9laFuHuc35c3fl7nOqSgtUx8qReUd69P2Gyx/6NdyRgt+26dh7Xbr0zQHqvp1ms+Bx9veDN/WVBvFHg2L7NMqeLZf8w5P1RvDXko3Rnio2zjoO9HGQV/T
NA735phx0JdZjIPXrzcGVfk1BhXLNHrWnDNGKHlmjFjjyxhcYsroV+HIGKf4hzG09oQxoPSBMULmvTFmqrkxdqaz0T9H0RgjRc7on6FljJ8gZIyWn7IxL0RH
4R0gDPhJ9N+moFXBwtDypRuE0rZDxw4czhxGAuLJECgNqRdARLlwXBoEzKWSWYQFri1cGfpge6vhbMjr2RWG+a41DPPJqxAjP+TR/zWILZGYVIi2OEynJQrT
6xWDOSi+qEOEUCfdBAE0kB6lgee4NgVBRci5ZYvICgISyMAXxJVB4EsuiEttl1NpU+EL32e+DX5X3SSOF/l+4LpCgkfdiLlhGATgUhDS8y2goUecgLIQwpAT
l7jUlUxGvo4o94WEIbp52Y/MdFfPtiBh29pXP3FXfbG76m6rPqQRDdyIMMuJqC8DR4AIQwhc4kZO4AVASeRICaGUHEQYBdIGN3QtbQGkzbuuesel0vL9KLR8
ywpdLn3XDShQRhgnEFqRxwNwpcdtX3DHEyTiwhaCENcKQ99mA1b9TTsiuSPXktepfZkSoEAn8a2aGt9ApZA0oegDnQ9d43aHdNdOS3z76aqTFjGf+SSSjmCE
OhZ1wGc2pQ5hruVHjiV4wIA6ke8A91jEGPEizhytA14oqUW6alEYEDviriBeZIswCMGJrFBaJPSkdCV1CCEW93yHesSSLg0oJYJFkoUhd8ELwyFa1FpnJ/QO
8yKBrqWuVSaJ76CpTSvXW342GrT9hN1Jg2xuEWnZLHIFYUAizyWEgScsiMKAuhGNJKNWFBGm963MjmxqO47kxGKOEKHXVYMsAoH0HYtxS3quQwmXglPX5pEv
rMiOAha5kQcQMOayIAoZYRHzosAizOGSDtKgS3zT4gRb4kN7fDrpo+OFFBiArZMoPT+MvNCNwCduKD3PjULmulboCupHgvtu5EQUXA/AiWhAJaGdT2p+ICMg
0nNCy/eY7ws3ZFHgeGBRwWzLIzIiFqPUiYi0HRK6vucIYIxHlp4LMkAfX0Fd51PsiC8xWP7cwqM7ORY7rVPp0YhLoMIBl4WRIwMnlFIS6nKbgRBh5Lm+sEVI
GHFEyLzA5SxwLGEJKwy43XWd2lFAbMqiQAbMdWQAYNmSONwJA4dYPgdCrYhHTFCfBIzathMAcS2b+TYPiT/k1Ppz+zp1u6xTfVUoqBJmEjOlT7JUiHgHlKzX
adN1UuJIFTFsNGgM3IS07kKcE+WzYvLp+aSIHjCR86AZl4dNjOxOfWd8fycjSwgRoa7nQCkARF4kg8CT1PYkC2zLBwrU9zxH2BYlggufBL5LArC90HOAemFn
1yAwsCPm+r4Xcd8nXgCBr73SXujSwCLAQu5ywX2fC8KEbTuMClvqog8iEJE9xMi2Hu8i71hGtrp6vzaqjI7Kdf2BFrfjGdvR9uiDkk52hvR08zm4nHtRwDix
ie1HTiRDzyGWLW0Z+dSJwPU4d0PHsVwJPhURkBAccITHAgdct6tSMhaEUeDqSim69AshUtiWGwrh+4KHERWex6hwbGqDzYhnhdL2PYe4ru8L2xNDPFc/t54Y
I/9YSrna313rOxa4NsoIjUo3dWrbiBuBoEU53b21c3DK9feeM31+ObWvLF8VMzFfYSbm7nzITsCmYSyMtF/JsZnr2IEFLgNKPBnREFwS+sQBi/PAB+YJS0gr
pNpxFAg7sLknuh9pweGeLpLFPR5F4PHIBh5I6YtAeoEIrIhKm3HPcsCVJHDCgFLGPe7JKIg8MQDYLrcSZnc886wWPGvUmBzD5TSs9MP46emY14t5vZjXi3m9
mNeLeb2Y14t5vZjXi3m9mNd7hnm9xwl5Z4RbUtpECnCFlEz6oRt6tuVLwkRgh9ILvcACL3Qd7lMdaxwEIdi+FZLQCkjn0DAdtCOCyHJZ6IYy9D3KQuIKj4aM
+1HkghCuR1zfBdeKGLclD33drZSuHbJwyGn2lT3BdrQAsoEpLd2cKRbXng3PtiwbqOWGDgPq2r6gLPLtyAkkCXQaRsRdh1FHsEAAJeBbERM2Beh8dRWAGwnu
eWEUhlQQFkaCEm6HNvg08qm0fSf0bSJd8B3LtoCLCGzBKCMksngwQP0+t8cH2NtuCabwMDfrZO5SAavk8D08KVVquDFVdDaj6tpYTJbXhn64ACpnylxlDITB
KP8GqRiqbW33A/be9wPj1jHAUgNHLzXQLYSP8MCygIdO6AsqrCAMfC4th0ZBIB3fdm0gnuuAQziFSIDwIWSCOCEI7jCfdl36rheEgesHUjCHhwwCizFPhlEY
CZ+H+ukIEfEgCGXo2DwgEad+QFhoMVdybrMhIXyf22+tnfalXzs3SjHzLDH1mxI6sb4DztQzVN3gGlXWt7EiVGW6qHOAlhHLjnQLX/Z9AZYXgEUCNySRFZDI
tSVzPN/2PRJEoeRW6NjE9UBKjzoWoS4loe/5kRMGsquu8cAXOg1D6ytQj9rC8QJLcIgi7gY8DCKPgxURj7hcQhhJX0aCM+pF3LYjeISZ8lWV529+/Kiyxbze
neTawk9urSfOoMeXwJrPsczo/FzfYikZbHlQoiVncXPGYr+csJGzFTdYiMYg7JZBhIcZRM3mKv2wG49OC4/RYXgckHq3dRw3bQrjto1jWxj/iMlE27lu0xBv
RK73TV7ZznGbvvjjc9wrWWIr9z+2aEkjvH5YcP24ofXbx9KiO1GriZyXXjSzoHFS+iM6zMRMhytpnFgxXdEwNA2jptGB15/b5O7ulnunkKmBodLbmW8TtHcM
5ruHIG4fRMu6jfxjDGLvkLWtY/nQok1BtEXzu8QpjPY85Hb220yoPSb7Q4Mstg7hU8uSCFp3Nr18a4fwrG0d1+c2O2W3r5LdTptDuGy2D6PNYjltw+hwAB3p
+PnknKMWCbScBVI6q/uqAl/K82Oc5maRmcnTaXr+2O8LvNGHw08KZPzQeP/4ecD/kxbjPq97Q1P9tibP0jtQhaEvuY1MGesbsWfH/H1Iv69/aXyhM/hVXxH8
+Y9///Gfa+OPf/+9blCB3m9//OcvRpEZDIxCLWBAlxW9N0/vz/5cZT9U+Sl//stfjOrOKTduFnmRzW6KTL1Zn/hPwfVjXtvqqVNqyBqW9nnquP197WcaW5fi
KDKT7VLXd/ura12g5oBK2+hmwMvQXcS1ipjSK9vZtbKdfUS1Cjs/oJiOqVf6zH0Xw73ZVLDmQ9IH0LZ1MaOzV7Xdj5A/c8lsfDl5LeOGC8IUMIdU6OdEn4i+
9IGUOJpvfTB5x5zCATS/TFp4JWpfbu8OIKMqsvyVCGlF9+lGaVyBraOeX5vMVun86zWvPywyc7rLlv5o9ZLftpICB5TtettFjadpJAZbFMa0lLWIZflNUZ2q
mp7Yipo+Ded0BkYlx+sRmFmnjAzgY1yc+GDtwonmJUxloJqAobsr4mLZGxbWqvk0heC5gs52LfAPzmgKukdaw/EPUMee/kyJ6h5kPSPmM6fQk41Zbz1YVxpe
K8T4Zull5ZBXYt//kb9YQOOvmYH5Ope+VJ5lRG9YKuUsrAVULpjFDPKGaCpPpLmhtNCeq2V9R1PHr7U6GbUezO0devDMy7lRDzZGzB1wen8qgUXGoIw/1bfz
v1L1J+OW5gZN9PsRS4MBpMYqQm/sNbUW8WP86XxRrINTR1xirdGwBxRv5SQ/7Bl0D3DJ4UCwsp7FssTT+kpzLGzZUk3qlUDLjM61tPguad3shcS6yN4BBaQv
0w/rykvL5O36mmf8A+iT3PBXokl1EqYW1i5A+tneS1hVRZhXIqZVzsrotz91QaZXIqZ5VfHgAGtvVUvh9QjqIMeBKhPowi8TN7tknvqMhtwgPtlm0aZvZwDV
zXu3US8MnzB67F1hrbE6gMMsd4AKyrxffQ//Ypf4PCJl7x1iHdjQdGrp14122d7Pe9ne7mkfl2xqalFOQce15wcWYxlRf5nmp+FSreNKGiEDlfSMOuCKTqk+
zxu15IyWRifzMe+hFnXoTZn3UOrGrl3gZ3uQbjzJtriAFdbFeH7eaTw3CXvtidpg6yrH/nCPlD7B63Pirkm92WtSdTn1A06dDrQ+7DmxrhEz/qGnrmT5SpCj
8bJMMyOiDPPYtW19t9e2teWBmz3leEtVCnleXYi9jVOeLAQYuqtH+m/+kRvFrYL7t8YWKf+QZLQgXhW6feCYkJ3Go20aagMyekyIzmtYOZh2TfPNXtO8esnh
gOtjlbVxWAOiRbSyreOL6MD2dZXMMlxEZTDtKvevzIE817y/KoH5F/qQpdls+eTBqyDwCCOCEssNuS0FDV2wdQlp4AwiyVzQJRGZkGFEXdvmFnWl61ESEh5E
/mMXCYgpqAO87lhlwd5ki7Qopen69cd10Pz6G4cEqwzOZ5mwg0rjtzSunmOrixyZ2X1aVQepX2nL7kDJJLvvTK5Llf0hFfaHVNcfVFl/lKr6L6q7H65W/yh1
+g9DtR+/Oyv/H4BkP047PCRwEKI9uZ0fhN35qPx2fUq1f83wPg+wbmkKPc1Z9zLjQ0qM9y0v3h7rpdM4TV05u3rNqOq29OcMaF8GBHRr34g100+z84Tm+d6D
GBSwNv6LUod7TWqUEvEDysN3KcO+LjVcnZkahQAHkCuFs72U2ohl6weXrB+vXP24b4eN8W7YuDFwez5/2taqbwH/8Yr3j1u4f8Si/aMV7B+rWH/v12v2f06p
reHupwG2tOxSTn1AKfURyqgPKaE+sHz6AUqnj102ffyS6eOXSx+/VPpByqSPVCL9wOXRD1YafUhZ9DFKoh+lHPopSqEfsgz6sUqgH6X8+Zilz8cse9675Pme
5c4Hlzo/Wpnzw5Q4H7O8+eDS5uOVNR+3pPko5cxHLmXeu4z54BLmY5Yv7x3TNX5d0M6Et9cHHqM28Ah1gYfWBB5aD7h/LeA2AvpWdf/Z2/k2aZeGJb9FVn+k
vddlYmXM+9ApfZsf5b5kSm2eyEx1F1jV5JbmP5XJa3tMdt00zm/KW6gvc50aVlqVfSnU5SH3bfcNlj/s32qmi07t26h2N+3bLAeq9u8snwOPId+/mTZiezYq
sk+rJLv9m1Zq+wud7tt0keY8m2td6T7KXzTuPjqSRJwXccoLs3P7zeFH1Z91ZA1VfazAVsr1VfkBKKeZppqPTbbe5hyA4UaMUz/qq9Cifi33wYbH7MK7VcZt
nFaFzCe72zQyEvWupiJSHUdWVLq2Xyfn5xUVlollvT/Zi48U7kswKUcNSu3Xusqr3KtJQadTfciE2TzRV4+c8lvY3WvbqyA6/NEUi3net3GfdvopkvJgGmdp
3/YKtPetDNqqftaXUPubKPsT69NM969LLJcRWj0JbGv2PAVbH8a7PEjUkdw+7xs9hrutiuR/xyFvt9bPhwt6u7U+bw57u7V+bQ1805VDtcDjLG0yRb1QMM+z
A7Cp8GwnCsESjscYARukHTm+IDS0Hcr8iNq+Z3OwPeAOtYiQoR+smapmHcTLcduB0A9IURlEEFrScoglQ1cPU7835QnXixzGnJBYocd9G8JAWoQLAjwMfZe+
7OLJ6OvHgx+/fS6Cuvbt1ytICxW3lTXVcYFbipD2Denb9iiHhJaQ1cbmbHPsaR3A/UOTQHtw7o6hDQy36zXCtQeh3LM/S0061fB7Re+9nuHvHwz4esbeJ7zw
FY1+/l0Nf88Au7M24XsG+13GWPYIPOw3IE3w1MrXKyrvMuavR4TgWQ+sp8P6ssbUyXl+3kPa6cgfgFknMhfdbxqG4HGD/GnH2f1aZMhwX/Zy4lHvuMoZNNaa
9mlHuP3S6WKX5dZbsSGzNtvwyOiRx7bj8m7I6GrSpx3f9lvGQaebkvKJR7f9NvRyD29drm2HjS6Ji9OOrcPt8sWPcOcl+JARNsifdpwdbuyHjLNB/kTj3DO8
4AyPD3vdWZ81/3venz8fi32mY9nnLn/4/DxZRY9dH2uwuwMOLkUFO0YynPNw9oqq6DyQ4/J55iy2xYp0Nk7HZXVrWMp5ivfMOWyNjzlPXs+Ew4FRP2fib2kE
Df3eiBr6DDxTIr96+/d/lQXert6Wo7+6vpJxsvrf0ACNq+uVBK7eXqX1Oyhcd6Jf+F3oal1zmucgdLc181dv/94c8NVvv18fi8PDc9cvCmQMMV4/cyycgPOT
cr1P2Ml5ybs35yflunOcy3kJux/bJ2V5j6ia85J1X8ZPy/T8YsU9vwR5dwsbOurGogdLp2NnFYx0RhLayNJR2Nkd4jTOEi0JH56/o/K2T+TUaZStN4cn4a49
POs8pNeRv0Pytl8E2FHFNoC1o7K1Lb7stALrzNlBuWoLXhtzqzY2O8dkpT0EbtTNbKObQ7F4KvZ2BteNKsiXvR2Y4VMzuzmIb1yZ1n0chLmTMLYxMPCkJm83
R8fkZlOE4agqVXYwPlvHZ2lzvOKosqq7OARrp2BrYwTkuJ6hsocDMHYKpjZGVJ7WkdadtdOw9TJGc2R5JXExPlvHZ6k94vMM5NWRuVMw1hZFOqrUGt0cisVT
sdcenzqqBBvdHIrFo7PXLfL1qI6NHiyNz06XeNojSGVvNg7JQrfI3KNKZb8A276sPZLW7v4j83kKHlvjd081ud0YOhIz22OCTyWiPbg6IEddgo27S+hQnR6y
w2MP8FhjexbjfLQxtgUsnxcDB+z8yGM91sieh0wfbYxbOz5gp0ce49gj6xesfUwf+JisDmPzt9//P3hL/R8psQMA
`;
const REVIEWED_P0_PATH_SHA256 =
  'b2657db74331391b156f87e1e831665ef4ae3a738d48836e476c13828b1aeff4';
const REVIEWED_P0_PRESERVED_INPUTS = Object.freeze({
  policySha256:
    'f5a41c0743fc5e37e2a8110fe11f9d405952d5bcd4a235f085edf9e02df963ab',
  anchorsSha256:
    '3513c140106fde4874bdfaec48000f243f35ac926de33bf1433ae6450baaee40',
  subsetSha256:
    'cceaaf9807c0d32c32be5b0800a140612afddf9acf49bcdc0cf8f0102562fb39',
  featuresSha256:
    'ee10cc484226fbcc70950c4ce09fc601a827d1ce92fe40870f5e66c6656a7de2',
  selectedEvidenceSha256:
    '9de8674a603263d5d80d9e48d255879efa061b648cc9cb32eff399941a6927df',
  auditEvidenceSha256:
    'd560df3e1a9af905115324d529a0a101943d30fa0af8a8102b2dd344121ba9e4',
  promotionSha256:
    'a5f567e5f27981f943adfd116b8a88be7501f0f59763573ce9b701fae390c4ac',
});
const REVIEWED_P0_CURRENT_INPUTS = Object.freeze({
  ...REVIEWED_P0_PRESERVED_INPUTS,
  subsetSha256:
    'e76d5624e999b852df2c8c1bdb7dfebdcc5952083eb175f7ab67bd39ad75e4d8',
  selectedEvidenceSha256:
    'c559d673e7ff2af88343eadf58b292db45d71ef99915699cc5d8e5310a73fc27',
  auditEvidenceSha256:
    '58f92e072306bfe99f8b9a57bf959469100b0e54816bef3263ec9b6c075a4990',
});
const REVIEWED_P0_PATHS = Object.freeze([
  'test/built-ins/Function/prototype/bind/instance-construct-newtarget-self-new.js',
  'test/built-ins/Function/prototype/toString/unicode.js',
  'test/language/eval-code/direct/new.target-fn.js',
  'test/language/expressions/arrow-function/lexical-new.target-closure-returned.js',
  'test/language/expressions/arrow-function/lexical-new.target.js',
  'test/language/expressions/assignment/dstr/ident-name-prop-name-literal-default-escaped-ext.js',
  'test/language/expressions/assignment/dstr/ident-name-prop-name-literal-extends-escaped-ext.js',
  'test/language/expressions/class/accessor-name-inst/literal-numeric-binary.js',
  'test/language/expressions/class/accessor-name-inst/literal-numeric-octal.js',
  'test/language/expressions/class/accessor-name-inst/literal-string-default-escaped-ext.js',
  'test/language/expressions/class/accessor-name-inst/literal-string-unicode-escape.js',
  'test/language/expressions/class/accessor-name-static/literal-numeric-binary.js',
  'test/language/expressions/class/accessor-name-static/literal-numeric-octal.js',
  'test/language/expressions/class/accessor-name-static/literal-string-default-escaped-ext.js',
  'test/language/expressions/class/accessor-name-static/literal-string-unicode-escape.js',
  'test/language/expressions/class/ident-name-method-def-default-escaped-ext.js',
  'test/language/expressions/class/ident-name-method-def-extends-escaped-ext.js',
  'test/language/expressions/greater-than-or-equal/S11.8.4_A4.12_T1.js',
  'test/language/expressions/greater-than/S11.8.2_A4.12_T1.js',
  'test/language/expressions/less-than-or-equal/S11.8.3_A4.12_T1.js',
  'test/language/expressions/less-than/S11.8.1_A4.12_T1.js',
  'test/language/expressions/new.target/asi.js',
  'test/language/expressions/new.target/value-via-call.js',
  'test/language/expressions/new.target/value-via-fpapply.js',
  'test/language/expressions/new.target/value-via-fpcall.js',
  'test/language/expressions/new.target/value-via-member.js',
  'test/language/expressions/new.target/value-via-new.js',
  'test/language/expressions/new.target/value-via-super-call.js',
  'test/language/expressions/new.target/value-via-super-property.js',
  'test/language/expressions/new.target/value-via-tagged-template.js',
  'test/language/expressions/object/accessor-name-literal-numeric-binary.js',
  'test/language/expressions/object/accessor-name-literal-numeric-octal.js',
  'test/language/expressions/object/accessor-name-literal-string-default-escaped-ext.js',
  'test/language/expressions/object/accessor-name-literal-string-unicode-escape.js',
  'test/language/expressions/template-literal/tv-utf16-escape-sequence.js',
  'test/language/identifiers/part-digits-via-escape-hex.js',
  'test/language/identifiers/part-unicode-10.0.0-escaped.js',
  'test/language/identifiers/part-unicode-11.0.0-escaped.js',
  'test/language/identifiers/part-unicode-12.0.0-escaped.js',
  'test/language/identifiers/part-unicode-13.0.0-escaped.js',
  'test/language/identifiers/part-unicode-14.0.0-escaped.js',
  'test/language/identifiers/part-unicode-15.0.0-escaped.js',
  'test/language/identifiers/part-unicode-16.0.0-escaped.js',
  'test/language/identifiers/part-unicode-17.0.0-escaped.js',
  'test/language/identifiers/part-unicode-5.2.0-escaped.js',
  'test/language/identifiers/part-unicode-6.0.0-escaped.js',
  'test/language/identifiers/part-unicode-6.1.0-escaped.js',
  'test/language/identifiers/part-unicode-7.0.0-escaped.js',
  'test/language/identifiers/part-unicode-8.0.0-escaped.js',
  'test/language/identifiers/part-unicode-9.0.0-escaped.js',
  'test/language/identifiers/start-unicode-10.0.0-escaped.js',
  'test/language/identifiers/start-unicode-11.0.0-escaped.js',
  'test/language/identifiers/start-unicode-12.0.0-escaped.js',
  'test/language/identifiers/start-unicode-13.0.0-escaped.js',
  'test/language/identifiers/start-unicode-14.0.0-escaped.js',
  'test/language/identifiers/start-unicode-15.0.0-escaped.js',
  'test/language/identifiers/start-unicode-15.1.0-escaped.js',
  'test/language/identifiers/start-unicode-16.0.0-escaped.js',
  'test/language/identifiers/start-unicode-17.0.0-escaped.js',
  'test/language/identifiers/start-unicode-5.2.0-escaped.js',
  'test/language/identifiers/start-unicode-6.0.0-escaped.js',
  'test/language/identifiers/start-unicode-6.1.0-escaped.js',
  'test/language/identifiers/start-unicode-7.0.0-escaped.js',
  'test/language/identifiers/start-unicode-8.0.0-escaped.js',
  'test/language/identifiers/start-unicode-9.0.0-escaped.js',
  'test/language/identifiers/val-dollar-sign-via-escape-hex.js',
  'test/language/identifiers/val-underscore-via-escape-hex.js',
  'test/language/identifiers/vals-eng-alpha-lower-via-escape-hex.js',
  'test/language/identifiers/vals-eng-alpha-upper-via-escape-hex.js',
  'test/language/identifiers/vals-rus-alpha-lower-via-escape-hex.js',
  'test/language/identifiers/vals-rus-alpha-upper-via-escape-hex.js',
  'test/language/literals/numeric/binary.js',
  'test/language/literals/numeric/octal.js',
  'test/language/statements/class/accessor-name-inst/literal-numeric-binary.js',
  'test/language/statements/class/accessor-name-inst/literal-numeric-octal.js',
  'test/language/statements/class/accessor-name-inst/literal-string-default-escaped-ext.js',
  'test/language/statements/class/accessor-name-inst/literal-string-unicode-escape.js',
  'test/language/statements/class/accessor-name-static/literal-numeric-binary.js',
  'test/language/statements/class/accessor-name-static/literal-numeric-octal.js',
  'test/language/statements/class/accessor-name-static/literal-string-default-escaped-ext.js',
  'test/language/statements/class/accessor-name-static/literal-string-unicode-escape.js',
  'test/language/statements/class/ident-name-method-def-default-escaped-ext.js',
  'test/language/statements/class/ident-name-method-def-extends-escaped-ext.js',
]);
const REVIEWED_P0_SINGLE_VARIANT_PATHS = new Set([
  'test/language/expressions/assignment/dstr/ident-name-prop-name-literal-default-escaped-ext.js',
  'test/language/expressions/assignment/dstr/ident-name-prop-name-literal-extends-escaped-ext.js',
]);
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
/** @param {string} revision @param {string} path */
function readGitFixtureText(revision, path) {
  return execFileSync(
    'git',
    ['-c', 'core.pager=cat', 'show', `${revision}:${path}`],
    /** @type {any} */ ({
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
}

/** @param {string} revision @param {string} path @returns {any} */
function readGitFixtureBuffer(revision, path) {
  return execFileSync(
    'git',
    ['-c', 'core.pager=cat', 'show', `${revision}:${path}`],
    /** @type {any} */ ({
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  );
}

/** @param {string} revision @param {string} path @returns {any | null} */
function readOptionalGitFixtureBuffer(revision, path) {
  try {
    return readGitFixtureBuffer(revision, path);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      error.status === 128
    ) {
      return null;
    }
    throw error;
  }
}

const PRODUCTION_TAXONOMY_TEXT = readGitFixtureText(
  H0_REPAIRED_BASE_SHA,
  'tools/test262/es2015-taxonomy.json',
);

/** @param {ReadonlyMap<string, string>} files @param {string} path @returns {string} */
function requiredFixtureText(files, path) {
  const text = files.get(path);
  assertSame(text !== undefined, true, path);
  return /** @type {string} */ (text);
}

const PRESERVED_H0_SOURCE_TAXONOMY_TEXT = readGitFixtureText(
  TAXONOMY_BASELINE,
  TAXONOMY_PATH,
);
const P0_BASE_TAXONOMY_TEXT = readGitFixtureText(
  ISSUE_77_LEXICAL_MAINTENANCE_BASE_SHA,
  'tools/test262/es2015-taxonomy.json',
);
const P0_BASE_UPSTREAM_SUBSET_TEXT = readGitFixtureText(
  ISSUE_77_LEXICAL_MAINTENANCE_BASE_SHA,
  'tools/test262/upstream-subset.json',
);
const P0_BASE_ES5_SELECTION_TEXT = readGitFixtureText(
  ISSUE_77_LEXICAL_MAINTENANCE_BASE_SHA,
  'tools/test262/es5-selection.json',
);
const PRODUCTION_UPSTREAM_SUBSET_TEXT = readGitFixtureText(
  H0_REPAIRED_BASE_SHA,
  'tools/test262/upstream-subset.json',
);
const PRODUCTION_ES5_SELECTION_TEXT = readGitFixtureText(
  H0_REPAIRED_BASE_SHA,
  'tools/test262/es5-selection.json',
);
const PRODUCTION_AUDIT_EVIDENCE_TEXT = readGitFixtureText(
  H0_REPAIRED_BASE_SHA,
  'tools/test262/es2015-audit-evidence.json',
);
const PRODUCTION_REPORT_TEXT = readGitFixtureText(
  H0_REPAIRED_BASE_SHA,
  'docs/test262-report.jsonl',
);
const PRODUCTION_CONFORMANCE_TEXT = readGitFixtureText(
  H0_REPAIRED_BASE_SHA,
  'docs/conformance.md',
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

/** @param {unknown} value */
function prettyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** @type {any} */
let exactH0FixtureCache;

function exactH0FixtureData() {
  if (exactH0FixtureCache !== undefined) return exactH0FixtureCache;
  exactH0FixtureCache = JSON.parse(
    execFileSync(
      'node',
      [
        '--input-type=module',
        '--eval',
        "import { gunzipSync } from 'node:zlib'; let input = ''; for await (const chunk of process.stdin) input += chunk; process.stdout.write(gunzipSync(Buffer.from(input.replace(/\\s/gu, ''), 'base64')));",
      ],
      /** @type {any} */ ({
        encoding: 'utf8',
        input: H0_EXACT_FIXTURE_GZIP_BASE64,
        maxBuffer: 2 * 1024 * 1024,
      }),
    ),
  );
  return exactH0FixtureCache;
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
      version: ES2015_PROVENANCE_DECISION_VERSION,
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
      version: ES2015_PROVENANCE_DECISION_VERSION,
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
      version: ES2015_PROVENANCE_DECISION_VERSION,
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

const EXPECTED_P0_APPLIED_ROADMAP_AUTHORITY = JSON.parse(`{
  "code": "P0",
  "issue": 77,
  "parentIssue": 70,
  "state": "applied",
  "source": {
    "baseTaxonomySha256": "e7746b6da6038c1fda83e1e6cbecbe9fb3e7b97bdf89a311c0a3f34a686c7953",
    "rootCount": 83,
    "variantCount": 164,
    "pathSha256": "b2657db74331391b156f87e1e831665ef4ae3a738d48836e476c13828b1aeff4",
    "entryLedgerSha256": "3b23ac8dbc2ae703d466d49e26d827516e4a863406a45acb4e8356c86c32d664"
  },
  "reconciliation": null,
  "evidence": [],
  "protectedOutputs": [
    {
      "path": "docs/conformance.md",
      "operation": "replace-exact",
      "baseSha256": "3799ff93e726fdd181377417b6307801dc1ae1d5e884181d0bc4c4bd68ba2466",
      "headSha256": "22b8f8c5368e922919987f53aa273b8cc4234435e2adf72ffcba164082e01f85",
      "projectionSha256": null
    },
    {
      "path": "docs/test262-report.jsonl",
      "operation": "replace-exact",
      "baseSha256": "9de8674a603263d5d80d9e48d255879efa061b648cc9cb32eff399941a6927df",
      "headSha256": "c559d673e7ff2af88343eadf58b292db45d71ef99915699cc5d8e5310a73fc27",
      "projectionSha256": null
    },
    {
      "path": "tools/test262/es2015-audit-evidence.json",
      "operation": "replace-exact",
      "baseSha256": "d560df3e1a9af905115324d529a0a101943d30fa0af8a8102b2dd344121ba9e4",
      "headSha256": "58f92e072306bfe99f8b9a57bf959469100b0e54816bef3263ec9b6c075a4990",
      "projectionSha256": null
    },
    {
      "path": "tools/test262/es2015-taxonomy.json",
      "operation": "replace-exact",
      "baseSha256": "e7746b6da6038c1fda83e1e6cbecbe9fb3e7b97bdf89a311c0a3f34a686c7953",
      "headSha256": "dcc14a00a21c8e76351f75a24ec6e2ff52db9bd02f63d3ece0e4d6634121d662",
      "projectionSha256": null
    },
    {
      "path": "tools/test262/es5-selection.json",
      "operation": "replace-exact",
      "baseSha256": "20f0fc1d84bcec4efb934ef46b23a532d41502d6fcf88a307231d647a2c700f8",
      "headSha256": "533e0b9fc165a026d64c4e64d783cf2585de7236600acacf228f06d27f23d8c8",
      "projectionSha256": null
    },
    {
      "path": "tools/test262/upstream-subset.json",
      "operation": "replace-exact",
      "baseSha256": "cceaaf9807c0d32c32be5b0800a140612afddf9acf49bcdc0cf8f0102562fb39",
      "headSha256": "e76d5624e999b852df2c8c1bdb7dfebdcc5952083eb175f7ab67bd39ad75e4d8",
      "projectionSha256": null
    }
  ],
  "destinations": [
    {
      "status": "audit-passing-unselected",
      "blocker": null,
      "issue": 77
    },
    {
      "status": "blocked",
      "blocker": "remaining-standard-library-additions",
      "issue": 95
    },
    {
      "status": "selected-passing",
      "blocker": null,
      "issue": 77
    }
  ]
}`);
const EXPECTED_H0_PENDING_ROADMAP_AUTHORITY = JSON.parse(`{
  "code": "H0",
  "issue": 76,
  "parentIssue": 70,
  "state": "pending",
  "source": {
    "baseTaxonomySha256": "dcc14a00a21c8e76351f75a24ec6e2ff52db9bd02f63d3ece0e4d6634121d662",
    "rootCount": 135,
    "variantCount": 267,
    "pathSha256": "3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950",
    "entryLedgerSha256": null
  },
  "reconciliation": {
    "preservedTaxonomySha256": "e7746b6da6038c1fda83e1e6cbecbe9fb3e7b97bdf89a311c0a3f34a686c7953",
    "authorityTaxonomySha256": "dcc14a00a21c8e76351f75a24ec6e2ff52db9bd02f63d3ece0e4d6634121d662",
    "selectorPathSha256": "3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950",
    "rootCount": 135,
    "variantCount": 267,
    "missingCount": 0,
    "extraCount": 0,
    "proofSha256": "10f0381153294c2be9c764b00cfa44d535e4c2af61f26d1d8cc9650787a21ca8"
  },
  "evidence": [
    {
      "path": "tools/test262/es2015-h0-baseline.json",
      "sha256": "01c9f90704fe9ea6d892c4e758817fbe9bc30368486a58f12b47068e6b2080ec"
    },
    {
      "path": "tools/test262/es2015-h0-disposition.json",
      "sha256": "a48db4417e1ad41298e0d24bb6e1ef1925d6a812ab59a1541ce14ec2a06df857"
    },
    {
      "path": "tools/test262/es2015-h0-owner-deltas.json",
      "sha256": "ddb0001ef1ba607e785ba63560305144b8cd39c95c76b85c2375c38562b1618b"
    },
    {
      "path": "tools/test262/es2015-h0-owner-map.json",
      "sha256": "d50f58ed621eac896fceb325f54480d33c9680c0f6b264a6cbce5812c7f4f44b"
    },
    {
      "path": "tools/test262/es2015-h0-paths.json",
      "sha256": "bf3c2ed9c9e259bb25d3c5289a57c4daa5576b6d68d868df74f73c7a95bef893"
    },
    {
      "path": "tools/test262/es2015-h0-promotion.json",
      "sha256": "a5ad87badd75c547f4f4e2fb0b5d0536b4969ea3bf97676333f970434e5cfa2c"
    }
  ],
  "protectedOutputs": [
    {
      "path": "docs/conformance.md",
      "operation": "project",
      "baseSha256": "22b8f8c5368e922919987f53aa273b8cc4234435e2adf72ffcba164082e01f85",
      "headSha256": null,
      "projectionSha256": "c44ef2d084be750bca79a574ae041c2a757d452c71f2dffaf59badc7c6a9fcb8"
    },
    {
      "path": "docs/test262-report.jsonl",
      "operation": "project",
      "baseSha256": "c559d673e7ff2af88343eadf58b292db45d71ef99915699cc5d8e5310a73fc27",
      "headSha256": null,
      "projectionSha256": "a13390c77ffb89cdad7b043924c2d4318e8f27dd8e4f38bab943363b5e9b73cd"
    },
    {
      "path": "tools/test262/es2015-h0-baseline.json",
      "operation": "add-exact",
      "baseSha256": null,
      "headSha256": "01c9f90704fe9ea6d892c4e758817fbe9bc30368486a58f12b47068e6b2080ec",
      "projectionSha256": null
    },
    {
      "path": "tools/test262/es2015-h0-disposition.json",
      "operation": "add-exact",
      "baseSha256": null,
      "headSha256": "a48db4417e1ad41298e0d24bb6e1ef1925d6a812ab59a1541ce14ec2a06df857",
      "projectionSha256": null
    },
    {
      "path": "tools/test262/es2015-h0-owner-deltas.json",
      "operation": "add-exact",
      "baseSha256": null,
      "headSha256": "ddb0001ef1ba607e785ba63560305144b8cd39c95c76b85c2375c38562b1618b",
      "projectionSha256": null
    },
    {
      "path": "tools/test262/es2015-h0-owner-map.json",
      "operation": "add-exact",
      "baseSha256": null,
      "headSha256": "d50f58ed621eac896fceb325f54480d33c9680c0f6b264a6cbce5812c7f4f44b",
      "projectionSha256": null
    },
    {
      "path": "tools/test262/es2015-h0-paths.json",
      "operation": "add-exact",
      "baseSha256": null,
      "headSha256": "bf3c2ed9c9e259bb25d3c5289a57c4daa5576b6d68d868df74f73c7a95bef893",
      "projectionSha256": null
    },
    {
      "path": "tools/test262/es2015-h0-promotion.json",
      "operation": "add-exact",
      "baseSha256": null,
      "headSha256": "a5ad87badd75c547f4f4e2fb0b5d0536b4969ea3bf97676333f970434e5cfa2c",
      "projectionSha256": null
    },
    {
      "path": "tools/test262/es2015-taxonomy.json",
      "operation": "project",
      "baseSha256": "dcc14a00a21c8e76351f75a24ec6e2ff52db9bd02f63d3ece0e4d6634121d662",
      "headSha256": null,
      "projectionSha256": "dc96bb2a162db339d13cdb119a86e29ec0e3dbe31fee29780fc1cc1995c87c02"
    },
    {
      "path": "tools/test262/upstream-subset.json",
      "operation": "project",
      "baseSha256": "e76d5624e999b852df2c8c1bdb7dfebdcc5952083eb175f7ab67bd39ad75e4d8",
      "headSha256": null,
      "projectionSha256": "257c3e960ba14b8ebabd2ba92e7777d2a26b8a456ae6123c71e4e2349dd9ba6f"
    }
  ],
  "destinations": [
    {
      "status": "blocked",
      "blocker": "binary-data-and-typed-arrays",
      "issue": 87
    },
    {
      "status": "blocked",
      "blocker": "binary-data-and-typed-arrays",
      "issue": 88
    },
    {
      "status": "blocked",
      "blocker": "binary-data-and-typed-arrays",
      "issue": 89
    },
    {
      "status": "blocked",
      "blocker": "early-errors-and-declaration-instantiation",
      "issue": 78
    },
    {
      "status": "blocked",
      "blocker": "keyed-collections",
      "issue": 83
    },
    {
      "status": "blocked",
      "blocker": "keyed-collections",
      "issue": 84
    },
    {
      "status": "blocked",
      "blocker": "keyed-collections",
      "issue": 85
    },
    {
      "status": "blocked",
      "blocker": "proper-tail-calls",
      "issue": 97
    },
    {
      "status": "blocked",
      "blocker": "proxy-and-reflect-metaobject",
      "issue": 79
    },
    {
      "status": "blocked",
      "blocker": "proxy-and-reflect-metaobject",
      "issue": 81
    },
    {
      "status": "blocked",
      "blocker": "regexp-unicode-and-sticky",
      "issue": 91
    },
    {
      "status": "blocked",
      "blocker": "remaining-language-runtime-semantics",
      "issue": 96
    },
    {
      "status": "blocked",
      "blocker": "remaining-standard-library-additions",
      "issue": 93
    },
    {
      "status": "blocked",
      "blocker": "remaining-standard-library-additions",
      "issue": 94
    },
    {
      "status": "blocked",
      "blocker": "remaining-standard-library-additions",
      "issue": 95
    },
    {
      "status": "blocked",
      "blocker": "symbol-protocol-dispatch",
      "issue": 92
    },
    {
      "status": "selected-passing",
      "blocker": null,
      "issue": 76
    }
  ]
}`);
const EXPECTED_INITIAL_ROADMAP_AUTHORITIES = Object.freeze([
  EXPECTED_H0_PENDING_ROADMAP_AUTHORITY,
  EXPECTED_P0_APPLIED_ROADMAP_AUTHORITY,
]);
const EXPECTED_AUTHORITY_SHA256 = Object.freeze({
  P0: '78a5c22c43ed3bbcadcb093508d89fa99c66af01fdf2e71255c61ebe919c00c9',
  H0: '214d7f0b1f3c2a24cf440583b19dde6949d9e6d747998b1171530637ca1c35c0',
});
const ROADMAP_AUTHORITY_RECLASSIFICATION_PROFILE_PREFIX =
  'roadmap-reclassification:';
const ROADMAP_AUTHORITY_DESIGN_PATH =
  'docs/superpowers/specs/2026-08-21-roadmap-authority-state-machine-design.md';
const ROADMAP_AUTHORITY_PLAN_PATH =
  'docs/superpowers/plans/2026-08-21-roadmap-authority-state-machine.md';
const ROADMAP_AUTHORITY_BASE_DESIGN_ADDENDUM_PATH =
  'docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md';
const ROADMAP_AUTHORITY_BASE_PLAN_ADDENDUM_PATH =
  'docs/superpowers/plans/2026-08-20-provenance-foundation-maintenance.md';
const CHECKER_PATH = 'tools/test262/es2015-provenance-check.js';
const WORKFLOW_PATH = '.github/workflows/ci.yml';

function expectedInitialRoadmapAuthorities() {
  return structuredClone(EXPECTED_INITIAL_ROADMAP_AUTHORITIES);
}

function canonicalSchemaV3RangeProfiles() {
  return JSON.parse(approvedProvenanceManifestText()).rangeProfiles.filter(
    (/** @type {{ name: string }} */ profile) =>
      profile.name !== 'maintenance:issue77-lexical',
  );
}

/** @param {{ preservedTaxonomySha256: string, authorityTaxonomySha256: string, selectorPathSha256: string, rootCount: number, variantCount: number, missingCount: number, extraCount: number }} reconciliation */
function reconciliationProofSha256(reconciliation) {
  return sha256(
    `${reconciliation.preservedTaxonomySha256}\u0000${reconciliation.authorityTaxonomySha256}\u0000${reconciliation.selectorPathSha256}\u0000${reconciliation.rootCount}\u0000${reconciliation.variantCount}\u0000${reconciliation.missingCount}\u0000${reconciliation.extraCount}\u0000`,
  );
}

/** @param {string} text */
function driftedCrossRealmTaxonomyText(text) {
  const taxonomy = JSON.parse(text);
  const crossRealm = taxonomy.classifications.find(
    (
      /** @type {{ partition: string, status: string, blocker: string | null }} */ record,
    ) =>
      record.partition === 'core' &&
      record.status === 'blocked:test262-cross-realm-host' &&
      record.blocker === 'test262-cross-realm-host',
  );
  const replacement = taxonomy.classifications.find(
    (
      /** @type {{ path: string, variants: number, partition: string, status: string, blocker: string | null }} */ record,
    ) =>
      record.partition === 'core' &&
      record.blocker !== null &&
      record.blocker !== 'test262-cross-realm-host' &&
      record.status.startsWith('blocked:') &&
      crossRealm !== undefined &&
      record.path !== crossRealm.path &&
      record.variants === crossRealm.variants,
  );
  assertSame(crossRealm !== undefined, true);
  assertSame(replacement !== undefined, true);
  const originalStatus = crossRealm.status;
  const originalBlocker = crossRealm.blocker;
  crossRealm.status = replacement.status;
  crossRealm.blocker = replacement.blocker;
  replacement.status = originalStatus;
  replacement.blocker = originalBlocker;
  return `${JSON.stringify(taxonomy, null, 2)}\n`;
}

/** @param {string} text */
function driftedNewTargetTaxonomyText(text) {
  const taxonomy = JSON.parse(text);
  const record = taxonomy.classifications.find(
    (
      /** @type {{ path: string, status: string, blocker: string | null }} */ entry,
    ) => entry.path === 'test/staging/sm/class/newTargetEval.js',
  );
  assertSame(record !== undefined, true);
  record.status = 'blocked:test262-cross-realm-host';
  record.blocker = 'test262-cross-realm-host';
  return `${JSON.stringify(taxonomy, null, 2)}\n`;
}

/** @param {string} text */
function subsetTextWithExtraPath(text) {
  const subset = JSON.parse(text);
  const group = subset.groups.find(
    (/** @type {{ name: string, paths: string[] }} */ entry) =>
      entry.name === 'language/statements',
  );
  assertSame(group !== undefined, true);
  group.paths = [
    ...group.paths,
    'test/language/statements/class/zzz-extra.js',
  ].sort();
  return `${JSON.stringify(subset, null, 2)}\n`;
}

/** @param {string} text */
function subsetTextWithReplacementPath(text) {
  const subset = JSON.parse(text);
  const group = subset.groups.find(
    (/** @type {{ name: string, paths: string[] }} */ entry) =>
      entry.name === 'language/expressions',
  );
  assertSame(group !== undefined, true);
  const replacementSource =
    'test/language/expressions/assignment/dstr/ident-name-prop-name-literal-default-escaped-ext.js';
  assertSame(group.paths.includes(replacementSource), true);
  group.paths = group.paths
    .filter((/** @type {string} */ path) => path !== replacementSource)
    .concat('test/language/expressions/class/intruder-replacement.js')
    .sort();
  return `${JSON.stringify(subset, null, 2)}\n`;
}

function canonicalEmptySchemaV3ManifestValue() {
  return {
    ...JSON.parse(approvedProvenanceManifestText()),
    version: 3,
    rangeProfiles: canonicalSchemaV3RangeProfiles(),
    roadmapAuthorities: [],
  };
}

function canonicalSchemaV3ManifestValue() {
  return {
    ...canonicalEmptySchemaV3ManifestValue(),
    roadmapAuthorities: expectedInitialRoadmapAuthorities(),
  };
}

function initialRoadmapMigrationArtifactFiles() {
  return new Map([
    ['docs/conformance.md', PRODUCTION_CONFORMANCE_TEXT],
    ['docs/test262-report.jsonl', PRODUCTION_REPORT_TEXT],
    [
      'tools/test262/es2015-audit-evidence.json',
      PRODUCTION_AUDIT_EVIDENCE_TEXT,
    ],
    ['tools/test262/es2015-taxonomy.json', PRODUCTION_TAXONOMY_TEXT],
    ['tools/test262/es5-selection.json', PRODUCTION_ES5_SELECTION_TEXT],
    ['tools/test262/upstream-subset.json', PRODUCTION_UPSTREAM_SUBSET_TEXT],
  ]);
}

function canonicalPreparedSchemaV3ManifestValue() {
  const manifest = structuredClone(canonicalSchemaV3ManifestValue());
  manifest.roadmapAuthorities.splice(
    1,
    0,
    minimalRoadmapAuthority('M0', 79, 'pending'),
  );
  return manifest;
}

function canonicalConsumedSchemaV3ManifestValue() {
  const manifest = structuredClone(canonicalSchemaV3ManifestValue());
  manifest.roadmapAuthorities[0].state = 'applied';
  return manifest;
}

/** @param {string} code @param {number} issue @param {'pending' | 'applied'} state */
function minimalRoadmapAuthority(code, issue, state) {
  return {
    code,
    issue,
    parentIssue: 70,
    state,
    source: {
      baseTaxonomySha256: '1'.repeat(64),
      rootCount: 1,
      variantCount: 1,
      pathSha256: '2'.repeat(64),
      entryLedgerSha256: null,
    },
    reconciliation: null,
    evidence: [],
    protectedOutputs: [
      {
        path: `tools/test262/${code.toLowerCase()}-authority.json`,
        operation: 'add-exact',
        baseSha256: null,
        headSha256: '3'.repeat(64),
        projectionSha256: null,
      },
    ],
    destinations: [
      {
        status: 'selected-passing',
        blocker: null,
        issue,
      },
    ],
  };
}

/** @param {string} label @param {string} payload */
function embeddedRoadmapAuthorityPayload(label, payload) {
  return `Fixture heading\n<!-- BEGIN ROADMAP AUTHORITY ${label} sha256:${sha256(payload)} -->\n${payload}<!-- END ROADMAP AUTHORITY ${label} -->\n`;
}

/** @param {{ base?: string, baseManifestText?: string, checkerText?: string, workflowText?: string, headManifestText?: string }} [options] */
function roadmapMigrationMarker(options = {}) {
  const baseManifestText =
    options.baseManifestText ?? approvedProvenanceManifestText();
  const checkerText = options.checkerText ?? 'base checker fixture\n';
  const workflowText = options.workflowText ?? 'base workflow fixture\n';
  const headManifestText =
    options.headManifestText ??
    renderEs2015ProvenanceManifest(canonicalSchemaV3ManifestValue());
  return `<!-- es2015-roadmap-authority-migration
parent:70
base:${options.base ?? RANGE_BASE_SHA}
base-manifest-sha256:${sha256(baseManifestText)}
base-checker-sha256:${sha256(checkerText)}
base-workflow-sha256:${sha256(workflowText)}
head-manifest-sha256:${sha256(headManifestText)}
-->`;
}

/** @param {{ code?: string, issue?: number, base?: string, baseManifestText?: string, recordSha256?: string }} [options] */
function roadmapPreparationMarker(options = {}) {
  return `<!-- es2015-roadmap-authority-prepare
parent:70
code:${options.code ?? 'M0'}
issue:${options.issue ?? 79}
base:${options.base ?? RANGE_BASE_SHA}
base-manifest-sha256:${sha256(
    options.baseManifestText ??
      renderEs2015ProvenanceManifest(canonicalSchemaV3ManifestValue()),
  )}
record-sha256:${options.recordSha256 ?? 'c'.repeat(64)}
-->`;
}

/**
 * @param {{
 *   code?: string,
 *   issue?: number,
 *   profile?: string,
 *   base?: string,
 *   sourcePathSha256?: string,
 *   sourceEntrySha256?: string | null,
 *   protectedProjectionSha256?: string,
 * }} [options]
 */
function roadmapConsumptionMarker(options = {}) {
  const code = options.code ?? 'H0';
  return `<!-- es2015-roadmap-authority-consume
parent:70
code:${code}
issue:${options.issue ?? 76}
profile:${options.profile ?? `${ROADMAP_AUTHORITY_RECLASSIFICATION_PROFILE_PREFIX}${code}`}
base:${options.base ?? RANGE_BASE_SHA}
source-path-sha256:${options.sourcePathSha256 ?? '3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950'}
source-entry-sha256:${options.sourceEntrySha256 ?? 'null'}
protected-projection-sha256:${options.protectedProjectionSha256 ?? '8e16b33ffdbd8a2089567e9a8bdb1c654619b8bd00021c54ac74c0ab02f2c5fd'}
-->`;
}

/**
 * @param {{
 *   base?: string,
 *   baseManifestSha256?: string,
 * }} [options]
 */
function h0BootstrapRepairMarker(options = {}) {
  return `<!-- es2015-h0-bootstrap-repair base:${options.base ?? H0_BOOTSTRAP_BASE_SHA} base-manifest-sha256:${options.baseManifestSha256 ?? H0_BOOTSTRAP_REPAIR_BASE_MANIFEST_SHA256} -->`;
}

/**
 * @param {{
 *   base?: string,
 *   baseManifestSha256?: string,
 *   baseRecordSha256?: string,
 *   headManifestSha256?: string,
 *   headRecordSha256?: string,
 * }} [options]
 */
function m1AuthorityRepairMarker(options = {}) {
  return `<!-- es2015-m1-authority-repair
parent:70
code:M1
issue:80
base:${options.base ?? M1_AUTHORITY_REPAIR_BASE}
base-manifest-sha256:${options.baseManifestSha256 ?? M1_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256}
base-record-sha256:${options.baseRecordSha256 ?? M1_AUTHORITY_REPAIR_BASE_RECORD_SHA256}
head-manifest-sha256:${options.headManifestSha256 ?? M1_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256}
head-record-sha256:${options.headRecordSha256 ?? M1_AUTHORITY_REPAIR_HEAD_RECORD_SHA256}
-->`;
}

/**
 * @param {{
 *   base?: string,
 *   baseManifestSha256?: string,
 *   baseRecordSha256?: string,
 *   headManifestSha256?: string,
 *   headRecordSha256?: string,
 * }} [options]
 */
function p1cAuthorityRepairMarker(options = {}) {
  return `<!-- es2015-p1c-authority-repair
parent:70
code:P1C
issue:116
base:${options.base ?? P1C_AUTHORITY_REPAIR_BASE}
base-manifest-sha256:${options.baseManifestSha256 ?? P1C_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256}
base-record-sha256:${options.baseRecordSha256 ?? P1C_AUTHORITY_REPAIR_BASE_RECORD_SHA256}
head-manifest-sha256:${options.headManifestSha256 ?? P1C_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256}
head-record-sha256:${options.headRecordSha256 ?? P1C_AUTHORITY_REPAIR_HEAD_RECORD_SHA256}
-->`;
}

/** @type {string | null} */
let m1AuthorityRepairBaseManifestTextCache = null;

function m1AuthorityRepairBaseManifestText() {
  if (m1AuthorityRepairBaseManifestTextCache === null) {
    m1AuthorityRepairBaseManifestTextCache = readGitFixtureText(
      M1_AUTHORITY_REPAIR_BASE,
      ES2015_PROVENANCE_FILE,
    );
  }
  return m1AuthorityRepairBaseManifestTextCache;
}

/** @param {Record<string, any>} manifest */
function applyM1AuthorityRepairManifestDelta(manifest) {
  const m1 = manifest.roadmapAuthorities.find(
    (/** @type {{ code: string }} */ authority) => authority.code === 'M1',
  );
  assertSame(m1?.state, 'pending');
  const promotionEvidence = m1.evidence.find(
    (/** @type {{ path: string }} */ entry) =>
      entry.path === 'tools/test262/es2015-m1-promotion.json',
  );
  const promotionOutput = m1.protectedOutputs.find(
    (/** @type {{ path: string }} */ entry) =>
      entry.path === 'tools/test262/es2015-m1-promotion.json',
  );
  assertSame(promotionEvidence !== undefined, true);
  assertSame(promotionOutput !== undefined, true);
  promotionEvidence.sha256 = M1_AUTHORITY_REPAIR_PROMOTION_SHA256;
  promotionOutput.headSha256 = M1_AUTHORITY_REPAIR_PROMOTION_SHA256;
  for (const [path, projectionSha256] of Object.entries(
    M1_AUTHORITY_REPAIR_PROJECT_PROJECTIONS,
  )) {
    const output = m1.protectedOutputs.find(
      (/** @type {{ path: string }} */ entry) => entry.path === path,
    );
    assertSame(output !== undefined, true, path);
    output.projectionSha256 = projectionSha256;
  }
  m1.protectedOutputs.push(
    structuredClone(M1_AUTHORITY_REPAIR_SELECTION_OUTPUT),
  );
  m1.protectedOutputs.sort(
    (
      /** @type {{ path: string }} */ left,
      /** @type {{ path: string }} */ right,
    ) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
  );
  return manifest;
}

function m1AuthorityRepairHeadManifestValue() {
  return applyM1AuthorityRepairManifestDelta(
    JSON.parse(m1AuthorityRepairBaseManifestText()),
  );
}

function m1AuthorityRepairHeadManifestText() {
  return prettyJson(m1AuthorityRepairHeadManifestValue());
}

/** @param {Record<string, any>} baseManifest */
function m1AuthorityRepairImmutablePaths(baseManifest) {
  return new Set([
    '.github/workflows/ci.yml',
    'tools/ci/pipeline.js',
    'tools/test262/es2015-policy.json',
    'tools/test262/features.json',
    ...ES2015_PROVENANCE_DECISION_CODES.map(
      (code) => `${PROVENANCE_DECISIONS_DIRECTORY}/${code}.json`,
    ),
    ...baseManifest.roadmapAuthorities.flatMap(
      (
        /** @type {{ evidence: readonly { path: string }[], protectedOutputs: readonly { path: string }[] }} */ authority,
      ) => [
        ...authority.evidence.map((entry) => entry.path),
        ...authority.protectedOutputs.map((entry) => entry.path),
      ],
    ),
  ]);
}

/** @type {string | null} */
let p1cAuthorityRepairBaseManifestTextCache = null;

function p1cAuthorityRepairBaseManifestText() {
  if (p1cAuthorityRepairBaseManifestTextCache === null) {
    p1cAuthorityRepairBaseManifestTextCache = readGitFixtureText(
      P1C_AUTHORITY_REPAIR_BASE,
      ES2015_PROVENANCE_FILE,
    );
  }
  return p1cAuthorityRepairBaseManifestTextCache;
}

/** @param {Record<string, any>} manifest */
function applyP1CAuthorityRepairManifestDelta(manifest) {
  const p1c = manifest.roadmapAuthorities.find(
    (/** @type {{ code: string }} */ authority) => authority.code === 'P1C',
  );
  assertSame(p1c?.state, 'pending');
  p1c.protectedOutputs = p1c.protectedOutputs.map(
    (/** @type {Record<string, any>} */ output) => {
      if (output.path === P1C_AUTHORITY_REPAIR_AUDIT_OUTPUT.path) {
        return structuredClone(P1C_AUTHORITY_REPAIR_AUDIT_OUTPUT);
      }
      if (output.path === P1C_AUTHORITY_REPAIR_TAXONOMY_OUTPUT.path) {
        return structuredClone(P1C_AUTHORITY_REPAIR_TAXONOMY_OUTPUT);
      }
      if (output.path === P1C_AUTHORITY_REPAIR_SUBSET_OUTPUT.path) {
        return structuredClone(P1C_AUTHORITY_REPAIR_SUBSET_OUTPUT);
      }
      return output;
    },
  );
  return manifest;
}

function p1cAuthorityRepairPendingManifestValue() {
  return applyP1CAuthorityRepairManifestDelta(
    JSON.parse(p1cAuthorityRepairBaseManifestText()),
  );
}

function p1cAuthorityRepairPendingManifestText() {
  return prettyJson(p1cAuthorityRepairPendingManifestValue());
}

/** @param {Record<string, any>} baseManifest */
function p1cAuthorityRepairImmutablePaths(baseManifest) {
  return new Set([
    '.github/workflows/ci.yml',
    'tools/ci/pipeline.js',
    'tools/test262/es2015-policy.json',
    'tools/test262/features.json',
    ...ES2015_PROVENANCE_DECISION_CODES.map(
      (code) => `${PROVENANCE_DECISIONS_DIRECTORY}/${code}.json`,
    ),
    ...baseManifest.roadmapAuthorities.flatMap(
      (
        /** @type {{ evidence: readonly { path: string }[], protectedOutputs: readonly { path: string }[] }} */ authority,
      ) => [
        ...authority.evidence.map((entry) => entry.path),
        ...authority.protectedOutputs.map((entry) => entry.path),
      ],
    ),
  ]);
}

function p1cAuthorityRepairAppliedManifestValue() {
  const manifest = p1cAuthorityRepairPendingManifestValue();
  const p1c = manifest.roadmapAuthorities.find(
    (/** @type {{ code: string }} */ authority) => authority.code === 'P1C',
  );
  assertSame(p1c?.state, 'pending');
  p1c.state = 'applied';
  return manifest;
}

function p1cAuthorityRepairAppliedManifestText() {
  return prettyJson(p1cAuthorityRepairAppliedManifestValue());
}

/** @param {readonly { path: string, operation: string, headSha256: string | null, projectionSha256: string | null }[]} outputs */
function roadmapProjectionEntries(outputs) {
  return outputs.map((output) => ({
    path: output.path,
    operation: output.operation,
    sha256:
      output.operation === 'project'
        ? output.projectionSha256
        : output.headSha256,
  }));
}

/** @param {readonly AuditEvidenceRecord[]} records */
function auditEvidenceText(records) {
  return prettyJson({
    version: 1,
    repository: TEST262_REPOSITORY,
    revision: TEST262_REVISION,
    auditRecords: [...records].sort((left, right) => {
      const leftKey = `${left.file}\u0000${left.variant ?? ''}`;
      const rightKey = `${right.file}\u0000${right.variant ?? ''}`;
      return leftKey.localeCompare(rightKey);
    }),
    blockers: {},
    intentionalDeviations: [],
  });
}

/** @param {readonly TaxonomyArtifactClassification[]} classifications */
function taxonomyStatusTables(classifications) {
  /**
   * @param {readonly TaxonomyArtifactClassification[]} entries
   * @param {(entry: TaxonomyArtifactClassification) => string} keyOf
   */
  const countTable = (entries, keyOf) => {
    const totals = new Map();
    for (const entry of entries) {
      const key = keyOf(entry);
      const total = totals.get(key) ?? { roots: 0, variants: 0 };
      total.roots += 1;
      total.variants += entry.variants;
      totals.set(key, total);
    }
    return [...totals.keys()].sort().map((key) => ({
      name: key,
      ...totals.get(key),
    }));
  };
  return {
    core: countTable(
      classifications.filter((entry) => entry.partition === 'core'),
      (entry) => entry.status,
    ),
    annexB: countTable(
      classifications.filter((entry) => entry.partition === 'annex-b'),
      (entry) => entry.status,
    ),
    blockers: countTable(
      classifications.filter((entry) => entry.blocker !== null),
      (entry) => /** @type {string} */ (entry.blocker),
    ),
  };
}

/**
 * @param {readonly TaxonomyArtifactClassification[]} classifications
 * @param {TaxonomyArtifactInputs} inputs
 */
function taxonomyArtifactText(classifications, inputs) {
  return prettyJson({
    version: 3,
    pin: {
      repository: TEST262_REPOSITORY,
      revision: TEST262_REVISION,
    },
    policy: {
      version: 1,
      source: SPECIFICATION_SOURCE,
      sourceSha256: SPECIFICATION_SHA256,
      anchors: 1,
    },
    inputs: {
      policySha256: '1'.repeat(64),
      anchorsSha256: '2'.repeat(64),
      subsetSha256: sha256(inputs.subsetText),
      featuresSha256: sha256(inputs.featuresText),
      selectedEvidenceSha256: sha256(inputs.reportText),
      auditEvidenceSha256: sha256(inputs.auditEvidenceText),
    },
    summary: summarizeEs2015Classification(classifications),
    statusTables: taxonomyStatusTables(classifications),
    classifications,
  });
}

/** @param {string} text @param {string} path */
function taxonomyTextWithoutPath(text, path) {
  const taxonomy = JSON.parse(text);
  taxonomy.classifications = taxonomy.classifications.filter(
    (/** @type {{ path: string }} */ entry) => entry.path !== path,
  );
  taxonomy.summary = summarizeEs2015Classification(taxonomy.classifications);
  taxonomy.statusTables = taxonomyStatusTables(taxonomy.classifications);
  return `${JSON.stringify(taxonomy, null, 2)}\n`;
}

/** @param {string} text @param {string} path */
function taxonomyTextWithDuplicatePath(text, path) {
  const taxonomy = JSON.parse(text);
  const record = taxonomy.classifications.find(
    (/** @type {{ path: string }} */ entry) => entry.path === path,
  );
  assertSame(record !== undefined, true);
  taxonomy.classifications = [
    ...taxonomy.classifications,
    structuredClone(record),
  ].sort((left, right) => left.path.localeCompare(right.path));
  return `${JSON.stringify(taxonomy, null, 2)}\n`;
}

/** @param {string} text @param {string} file @param {string | null} variant */
function auditEvidenceTextWithoutRecord(text, file, variant) {
  const evidence = JSON.parse(text);
  evidence.auditRecords = evidence.auditRecords.filter(
    (/** @type {AuditEvidenceRecord} */ record) =>
      !(record.file === file && record.variant === variant),
  );
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

/** @param {string} text @param {string} file */
function auditEvidenceTextWithoutPath(text, file) {
  const evidence = JSON.parse(text);
  evidence.auditRecords = evidence.auditRecords.filter(
    (/** @type {AuditEvidenceRecord} */ record) => record.file !== file,
  );
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

/** @param {string} text @param {Readonly<Record<string, unknown>>} record */
function auditEvidenceTextWithAddedRecord(text, record) {
  const evidence = JSON.parse(text);
  evidence.auditRecords = [...evidence.auditRecords, record].sort(
    (
      /** @type {AuditEvidenceRecord} */ left,
      /** @type {AuditEvidenceRecord} */ right,
    ) => {
      const leftKey = `${left.file}\u0000${left.variant ?? ''}`;
      const rightKey = `${right.file}\u0000${right.variant ?? ''}`;
      return leftKey.localeCompare(rightKey);
    },
  );
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

/** @param {string} taxonomyText */
function coverageInventoryFromTaxonomyText(taxonomyText) {
  const taxonomy = JSON.parse(taxonomyText);
  return {
    files: Object.freeze(
      taxonomy.classifications.map(
        (/** @type {{ path: string }} */ record) => record.path,
      ),
    ),
    malformed: Object.freeze([]),
    variants: new Map(
      taxonomy.classifications.map(
        (/** @type {{ path: string, variants: number }} */ record) => [
          record.path,
          record.variants,
        ],
      ),
    ),
    totals: {
      files: taxonomy.summary.roots,
      records: taxonomy.summary.variants,
      malformed: 0,
    },
  };
}

/**
 * @param {{
 *   subsetText: string,
 *   taxonomyText: string,
 *   featuresText: string,
 *   records: readonly import('../../tools/test262/report.js').Test262TestRecord[],
 * }} options
 */
function canonicalReportText(options) {
  const subset = parseUpstreamSubset(options.subsetText);
  const coverage = summarizeTest262Coverage({
    inventory: coverageInventoryFromTaxonomyText(options.taxonomyText),
    records: options.records,
    selected: upstreamSubsetPaths(subset),
  });
  const features = parseFeatureManifest(options.featuresText);
  const summary = createSummaryRecord(options.records);
  return `${[
    ...formatReportLines(options.records),
    ...formatUpstreamSummaryLines(
      summarizeUpstreamRun({
        subset,
        records: options.records,
        supportedFeatures: featureNames(features),
      }),
    ),
    ...formatCoverageLines(coverage),
    formatRecordLine(summary),
  ].join('\n')}\n`;
}

/** @param {string} text */
function reportTestRecords(text) {
  return text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((record) => record.type === 'test')
    .map((record) =>
      createTestRecord({
        file: record.file,
        variant: record.variant,
        status: record.status,
        ...(record.features === undefined ? {} : { features: record.features }),
      }),
    );
}

/**
 * @param {readonly string[]} selectedPaths
 * @param {readonly ReturnType<typeof createTestRecord>[]} records
 */
function orderSelectedReportRecords(selectedPaths, records) {
  const byFile = new Map();
  for (const record of records) {
    const entries = byFile.get(record.file) ?? [];
    entries.push(record);
    byFile.set(record.file, entries);
  }
  return selectedPaths.flatMap((path) =>
    (byFile.get(path) ?? []).sort(
      (
        /** @type {ReturnType<typeof createTestRecord>} */ left,
        /** @type {ReturnType<typeof createTestRecord>} */ right,
      ) => String(left.variant).localeCompare(String(right.variant)),
    ),
  );
}

/**
 * @param {{
 *   baseDocument: string,
 *   subsetText: string,
 *   taxonomyText: string,
 *   reportText: string,
 * }} options
 */
function canonicalConformanceText(options) {
  const reportRecords = options.reportText
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((record) => record.type === 'test')
    .map((record) =>
      createTestRecord({
        file: record.file,
        variant: record.variant,
        status: record.status,
        ...(record.features === undefined ? {} : { features: record.features }),
      }),
    );
  const subset = parseUpstreamSubset(options.subsetText);
  const coverage = summarizeTest262Coverage({
    inventory: coverageInventoryFromTaxonomyText(options.taxonomyText),
    records: reportRecords,
    selected: upstreamSubsetPaths(subset),
  });
  return replaceGeneratedBlock(
    options.baseDocument,
    renderCoverageSummary({
      coverage,
      reportPath: 'docs/test262-report.jsonl',
      reportLinkPath: 'test262-report.jsonl',
    }),
  );
}

/** @param {string} path @param {number} variants @param {string} status @param {string | null} blocker @param {readonly string[]} flags */
function taxonomyRecord(
  path,
  variants,
  status,
  blocker = null,
  flags = variants === 1 ? Object.freeze(['noStrict']) : Object.freeze([]),
) {
  return Object.freeze({
    path,
    variants,
    partition: 'core',
    status,
    blocker,
    features: Object.freeze([]),
    flags: Object.freeze([...flags]),
    includes: Object.freeze([]),
    provenance: Object.freeze([]),
  });
}

/** @param {string} code */
function roadmapEvidencePrefix(code) {
  return `tools/test262/es2015-${code.toLowerCase()}-`;
}

/** @param {string} path @param {string} sourcePathSha256 @param {string} promotionText @param {string} ownerDeltasText */
function roadmapDerivedProjectionSha256(
  path,
  sourcePathSha256,
  promotionText,
  ownerDeltasText,
) {
  return sha256(
    `${path}\u0000${sourcePathSha256}\u0000${sha256(promotionText)}\u0000${sha256(
      ownerDeltasText,
    )}\u0000`,
  );
}

function syntheticCoverageDocument() {
  return [
    '# Synthetic conformance',
    '',
    '<!-- test262-coverage:begin -->',
    '',
    'stale coverage block',
    '',
    '<!-- test262-coverage:end -->',
    '',
    'Manual prose outside the generated block.',
    '',
  ].join('\n');
}

/**
 * @param {readonly string[]} [promotedFeatures]
 */
function syntheticRoadmapProjectionFixture(
  promotedFeatures = Object.freeze([]),
) {
  const code = 'H1';
  const issue = 120;
  const prefix = roadmapEvidencePrefix(code);
  const promotedPath = 'test/language/promotion.js';
  const auditPassingPath = 'test/language/audit.js';
  const blockedPath = 'test/language/blocked.js';
  const foreignPath = 'test/language/foreign.js';
  const sourcePaths = Object.freeze([
    auditPassingPath,
    blockedPath,
    promotedPath,
  ]);
  const baseClassifications = Object.freeze([
    taxonomyRecord(
      auditPassingPath,
      1,
      'blocked:source-blocker',
      'source-blocker',
    ),
    taxonomyRecord(blockedPath, 1, 'blocked:source-blocker', 'source-blocker'),
    taxonomyRecord(foreignPath, 1, 'selected-passing'),
    taxonomyRecord(promotedPath, 2, 'blocked:source-blocker', 'source-blocker'),
  ]);
  const headClassifications = Object.freeze([
    taxonomyRecord(auditPassingPath, 1, 'audit-passing-unselected'),
    taxonomyRecord(
      blockedPath,
      1,
      'blocked:remaining-language-runtime-semantics',
      'remaining-language-runtime-semantics',
    ),
    taxonomyRecord(foreignPath, 1, 'selected-passing'),
    taxonomyRecord(promotedPath, 2, 'selected-passing'),
  ]);
  const baseAuditRecords = Object.freeze([
    createTestRecord({
      file: auditPassingPath,
      variant: 'non-strict',
      status: 'passed',
    }),
    createTestRecord({
      file: blockedPath,
      variant: 'non-strict',
      status: 'failed',
    }),
    createTestRecord({
      file: promotedPath,
      variant: 'non-strict',
      status: 'passed',
    }),
    createTestRecord({
      file: promotedPath,
      variant: 'strict',
      status: 'passed',
    }),
    createTestRecord({
      file: foreignPath,
      variant: 'non-strict',
      status: 'passed',
    }),
  ]);
  const unchangedAuditEvidenceText = auditEvidenceText(baseAuditRecords);
  const featuresText = prettyJson({ version: 1, features: [] });
  const baseSubsetText = prettyJson({
    version: 1,
    repository: TEST262_REPOSITORY,
    revision: TEST262_REVISION,
    groups: [
      {
        name: 'fixture',
        summary: 'Synthetic selected roots.',
        paths: [foreignPath],
      },
    ],
  });
  const sourcePathSha256 = sha256(`${sourcePaths.join('\n')}\n`);
  const promotionText = prettyJson({
    version: 1,
    repository: TEST262_REPOSITORY,
    revision: TEST262_REVISION,
    sourceTaxonomySha256: '0'.repeat(64),
    ledgerSha256: sha256(`${promotedPath}\n`),
    rootCount: 1,
    variantCount: 2,
    entries: [
      {
        path: promotedPath,
        variants: 2,
        features: [...promotedFeatures],
        includeFeatures: [],
      },
    ],
  });
  const headSubsetText = serializeUpstreamSubset(
    mergePromotionSubset(
      parseUpstreamSubset(baseSubsetText),
      parseEs2015Promotion(
        promotionText.replace('0'.repeat(64), sha256('placeholder\n')),
      ),
    ),
  );
  const baseReportRecords = Object.freeze([
    createTestRecord({
      file: foreignPath,
      variant: 'non-strict',
      status: 'passed',
    }),
  ]);
  const promotionRecords = baseAuditRecords
    .filter((record) => record.file === promotedPath)
    .map((record) =>
      createTestRecord({
        file: record.file,
        variant: record.variant,
        status: record.status,
        features: [...promotedFeatures],
      }),
    );
  const headReportRecords = Object.freeze([
    ...baseReportRecords,
    ...promotionRecords,
  ]);
  const baseTaxonomyPlaceholder = taxonomyArtifactText(baseClassifications, {
    subsetText: baseSubsetText,
    featuresText,
    reportText: 'base placeholder report\n',
    auditEvidenceText: unchangedAuditEvidenceText,
  });
  const headTaxonomyPlaceholder = taxonomyArtifactText(headClassifications, {
    subsetText: headSubsetText,
    featuresText,
    reportText: 'head placeholder report\n',
    auditEvidenceText: unchangedAuditEvidenceText,
  });
  const baseReportText = canonicalReportText({
    subsetText: baseSubsetText,
    taxonomyText: baseTaxonomyPlaceholder,
    featuresText,
    records: baseReportRecords,
  });
  const headReportText = canonicalReportText({
    subsetText: headSubsetText,
    taxonomyText: headTaxonomyPlaceholder,
    featuresText,
    records: headReportRecords,
  });
  const baseTaxonomyText = taxonomyArtifactText(baseClassifications, {
    subsetText: baseSubsetText,
    featuresText,
    reportText: baseReportText,
    auditEvidenceText: unchangedAuditEvidenceText,
  });
  const headTaxonomyText = taxonomyArtifactText(headClassifications, {
    subsetText: headSubsetText,
    featuresText,
    reportText: headReportText,
    auditEvidenceText: unchangedAuditEvidenceText,
  });
  const baseConformanceText = canonicalConformanceText({
    baseDocument: syntheticCoverageDocument(),
    subsetText: baseSubsetText,
    taxonomyText: baseTaxonomyText,
    reportText: baseReportText,
  });
  const headConformanceText = canonicalConformanceText({
    baseDocument: baseConformanceText,
    subsetText: headSubsetText,
    taxonomyText: headTaxonomyText,
    reportText: headReportText,
  });
  const pathsText = prettyJson(sourcePaths);
  const baselineText = prettyJson(
    baseClassifications.filter((record) => sourcePaths.includes(record.path)),
  );
  const dispositionText = prettyJson({
    destinations: [
      {
        path: auditPassingPath,
        status: 'audit-passing-unselected',
        blocker: null,
        issue: issue,
      },
      {
        path: blockedPath,
        status: 'blocked:remaining-language-runtime-semantics',
        blocker: 'remaining-language-runtime-semantics',
        issue: 96,
      },
      {
        path: promotedPath,
        status: 'selected-passing',
        blocker: null,
        issue,
      },
    ],
  });
  const ownerDeltasText = prettyJson([
    {
      path: auditPassingPath,
      status: 'audit-passing-unselected',
      blocker: null,
      issue,
    },
    {
      path: blockedPath,
      status: 'blocked:remaining-language-runtime-semantics',
      blocker: 'remaining-language-runtime-semantics',
      issue: 96,
    },
  ]);
  const ownerMapText = prettyJson([
    {
      status: 'audit-passing-unselected',
      blocker: null,
      issue,
    },
    {
      status: 'blocked:remaining-language-runtime-semantics',
      blocker: 'remaining-language-runtime-semantics',
      issue: 96,
    },
  ]);
  const fixedPromotionText = promotionText.replace(
    '0'.repeat(64),
    sha256(baseTaxonomyText),
  );
  const authority = {
    code,
    issue,
    parentIssue: 70,
    state: 'pending',
    source: {
      baseTaxonomySha256: sha256(baseTaxonomyText),
      rootCount: sourcePaths.length,
      variantCount: 4,
      pathSha256: sourcePathSha256,
      entryLedgerSha256: null,
    },
    reconciliation: null,
    evidence: [
      { path: `${prefix}baseline.json`, sha256: sha256(baselineText) },
      { path: `${prefix}disposition.json`, sha256: sha256(dispositionText) },
      { path: `${prefix}owner-deltas.json`, sha256: sha256(ownerDeltasText) },
      { path: `${prefix}owner-map.json`, sha256: sha256(ownerMapText) },
      { path: `${prefix}paths.json`, sha256: sha256(pathsText) },
      { path: `${prefix}promotion.json`, sha256: sha256(fixedPromotionText) },
    ],
    protectedOutputs: [
      {
        path: 'docs/conformance.md',
        operation: 'project',
        baseSha256: sha256(baseConformanceText),
        headSha256: null,
        projectionSha256: roadmapDerivedProjectionSha256(
          'docs/conformance.md',
          sourcePathSha256,
          fixedPromotionText,
          ownerDeltasText,
        ),
      },
      {
        path: 'docs/test262-report.jsonl',
        operation: 'project',
        baseSha256: sha256(baseReportText),
        headSha256: null,
        projectionSha256: roadmapDerivedProjectionSha256(
          'docs/test262-report.jsonl',
          sourcePathSha256,
          fixedPromotionText,
          ownerDeltasText,
        ),
      },
      {
        path: `${prefix}baseline.json`,
        operation: 'add-exact',
        baseSha256: null,
        headSha256: sha256(baselineText),
        projectionSha256: null,
      },
      {
        path: `${prefix}disposition.json`,
        operation: 'add-exact',
        baseSha256: null,
        headSha256: sha256(dispositionText),
        projectionSha256: null,
      },
      {
        path: `${prefix}owner-deltas.json`,
        operation: 'add-exact',
        baseSha256: null,
        headSha256: sha256(ownerDeltasText),
        projectionSha256: null,
      },
      {
        path: `${prefix}owner-map.json`,
        operation: 'add-exact',
        baseSha256: null,
        headSha256: sha256(ownerMapText),
        projectionSha256: null,
      },
      {
        path: `${prefix}paths.json`,
        operation: 'add-exact',
        baseSha256: null,
        headSha256: sha256(pathsText),
        projectionSha256: null,
      },
      {
        path: `${prefix}promotion.json`,
        operation: 'add-exact',
        baseSha256: null,
        headSha256: sha256(fixedPromotionText),
        projectionSha256: null,
      },
      {
        path: 'tools/test262/es2015-taxonomy.json',
        operation: 'project',
        baseSha256: sha256(baseTaxonomyText),
        headSha256: null,
        projectionSha256: roadmapDerivedProjectionSha256(
          'tools/test262/es2015-taxonomy.json',
          sourcePathSha256,
          fixedPromotionText,
          ownerDeltasText,
        ),
      },
      {
        path: 'tools/test262/upstream-subset.json',
        operation: 'project',
        baseSha256: sha256(baseSubsetText),
        headSha256: null,
        projectionSha256: roadmapDerivedProjectionSha256(
          'tools/test262/upstream-subset.json',
          sourcePathSha256,
          fixedPromotionText,
          ownerDeltasText,
        ),
      },
    ],
    destinations: [
      {
        status: 'audit-passing-unselected',
        blocker: null,
        issue,
      },
      {
        status: 'blocked',
        blocker: 'remaining-language-runtime-semantics',
        issue: 96,
      },
      {
        status: 'selected-passing',
        blocker: null,
        issue,
      },
    ],
  };
  const baseManifestValue = {
    ...canonicalEmptySchemaV3ManifestValue(),
    roadmapAuthorities: [
      authority,
      structuredClone(provenance.P0_APPLIED_ROADMAP_AUTHORITY),
    ],
  };
  const headManifestValue = structuredClone(baseManifestValue);
  headManifestValue.roadmapAuthorities[0].state = 'applied';
  const baseManifestText = renderEs2015ProvenanceManifest(baseManifestValue);
  const headManifestText = renderEs2015ProvenanceManifest(headManifestValue);
  const baseFiles = new Map([
    [ES2015_PROVENANCE_FILE, baseManifestText],
    ['docs/conformance.md', baseConformanceText],
    ['docs/test262-report.jsonl', baseReportText],
    ['docs/test262-report.jsonl', baseReportText],
    ['tools/test262/es2015-audit-evidence.json', unchangedAuditEvidenceText],
    ['tools/test262/es2015-taxonomy.json', baseTaxonomyText],
    ['tools/test262/features.json', featuresText],
    ['tools/test262/upstream-subset.json', baseSubsetText],
  ]);
  const headFiles = new Map([
    [ES2015_PROVENANCE_FILE, headManifestText],
    ['docs/conformance.md', headConformanceText],
    ['docs/test262-report.jsonl', headReportText],
    ['tools/test262/es2015-audit-evidence.json', unchangedAuditEvidenceText],
    ['tools/test262/es2015-taxonomy.json', headTaxonomyText],
    ['tools/test262/features.json', featuresText],
    ['tools/test262/upstream-subset.json', headSubsetText],
    [`${prefix}baseline.json`, baselineText],
    [`${prefix}disposition.json`, dispositionText],
    [`${prefix}owner-deltas.json`, ownerDeltasText],
    [`${prefix}owner-map.json`, ownerMapText],
    [`${prefix}paths.json`, pathsText],
    [`${prefix}promotion.json`, fixedPromotionText],
  ]);
  const changes = [
    { status: 'M', path: ES2015_PROVENANCE_FILE },
    ...authority.protectedOutputs.map((output) => ({
      status: output.operation === 'add-exact' ? 'A' : 'M',
      path: output.path,
    })),
  ];
  return {
    authority,
    baseManifestValue,
    baseManifestText,
    baseFiles,
    baseTaxonomyText,
    changes,
    code,
    headFiles,
    headManifestText,
    headManifestValue,
    prefix,
  };
}

function exactAppliedH0ProjectionFixture() {
  const fixture = exactH0FixtureData();
  const evidence = fixture.evidence;
  const baseManifestText = readGitFixtureText(
    H0_BOOTSTRAP_BASE_SHA,
    ES2015_PROVENANCE_FILE,
  );
  const baseManifestValue = JSON.parse(baseManifestText);
  const headManifestValue = structuredClone(baseManifestValue);
  headManifestValue.roadmapAuthorities[0].state = 'applied';
  const headManifestText = renderEs2015ProvenanceManifest(headManifestValue);
  const authority = baseManifestValue.roadmapAuthorities.find(
    (/** @type {{ code: string }} */ candidate) => candidate.code === 'H0',
  );
  if (authority === undefined) {
    throw new Error('exact H0 fixture is missing its BASE authority');
  }
  const evidenceByPath = new Map(
    authority.evidence.map((/** @type {any} */ entry) => [entry.path, entry]),
  );
  for (const [suffix, text] of Object.entries(evidence)) {
    const path = `tools/test262/es2015-h0-${suffix}.json`;
    assertSame(sha256(String(text)), evidenceByPath.get(path)?.sha256, path);
  }
  const bundle = validateEs2015H0EvidenceBundle({
    pin: {
      repository: TEST262_REPOSITORY,
      revision: TEST262_REVISION,
    },
    pathsText: evidence.paths,
    baselineText: evidence.baseline,
    dispositionText: evidence.disposition,
    ownerMapText: evidence['owner-map'],
    ownerDeltasText: evidence['owner-deltas'],
    promotionText: evidence.promotion,
  });
  const baseConformanceText = readGitFixtureText(
    H0_BOOTSTRAP_BASE_SHA,
    'docs/conformance.md',
  );
  const baseReportText = readGitFixtureText(
    H0_BOOTSTRAP_BASE_SHA,
    'docs/test262-report.jsonl',
  );
  const baseTaxonomyText = readGitFixtureText(
    H0_BOOTSTRAP_BASE_SHA,
    TAXONOMY_PATH,
  );
  const baseSubsetText = readGitFixtureText(
    H0_BOOTSTRAP_BASE_SHA,
    'tools/test262/upstream-subset.json',
  );
  const featuresText = readGitFixtureText(
    H0_BOOTSTRAP_BASE_SHA,
    'tools/test262/features.json',
  );
  const auditEvidenceText = readGitFixtureText(
    H0_BOOTSTRAP_BASE_SHA,
    'tools/test262/es2015-audit-evidence.json',
  );
  const headSubsetText = serializeUpstreamSubset(
    mergePromotionSubset(parseUpstreamSubset(baseSubsetText), bundle.promotion),
  );
  const baseTaxonomy = JSON.parse(baseTaxonomyText);
  const dispositionByPath = new Map(
    bundle.disposition.dispositions.map((entry) => [entry.path, entry]),
  );
  const classifications = baseTaxonomy.classifications.map(
    (/** @type {any} */ entry) => {
      const disposition = dispositionByPath.get(entry.path);
      if (disposition === undefined) return entry;
      return {
        ...entry,
        ...(disposition.status === 'passed'
          ? { status: 'selected-passing', blocker: null }
          : {
              status: `blocked:${disposition.primaryOwner.blocker}`,
              blocker: disposition.primaryOwner.blocker,
            }),
      };
    },
  );
  const promoted = new Set(promotionPaths(bundle.promotion));
  const records = orderSelectedReportRecords(
    upstreamSubsetPaths(parseUpstreamSubset(headSubsetText)),
    [
      ...reportTestRecords(baseReportText).filter(
        (record) => !promoted.has(record.file),
      ),
      ...fixture.promotionRecords.map((/** @type {any} */ record) =>
        createTestRecord({
          file: record.file,
          variant: record.variant,
          status: record.status,
          features: record.features,
        }),
      ),
    ],
  );
  const headTaxonomyValue = {
    ...baseTaxonomy,
    inputs: {
      ...baseTaxonomy.inputs,
      subsetSha256: sha256(headSubsetText),
      selectedEvidenceSha256: '0'.repeat(64),
      h0DispositionSha256: sha256(evidence.disposition),
      h0PromotionSha256: sha256(evidence.promotion),
    },
    summary: summarizeEs2015Classification(classifications),
    statusTables: taxonomyStatusTables(classifications),
    classifications,
  };
  const headReportText = canonicalReportText({
    subsetText: headSubsetText,
    taxonomyText: prettyJson(headTaxonomyValue),
    featuresText,
    records,
  });
  headTaxonomyValue.inputs.selectedEvidenceSha256 = sha256(headReportText);
  const headTaxonomyText = prettyJson(headTaxonomyValue);
  assertSame(
    canonicalReportText({
      subsetText: headSubsetText,
      taxonomyText: headTaxonomyText,
      featuresText,
      records,
    }),
    headReportText,
  );
  const headConformanceText = canonicalConformanceText({
    baseDocument: baseConformanceText,
    subsetText: headSubsetText,
    taxonomyText: headTaxonomyText,
    reportText: headReportText,
  });
  const projectedOutputs = new Map([
    ['docs/conformance.md', headConformanceText],
    ['docs/test262-report.jsonl', headReportText],
    [TAXONOMY_PATH, headTaxonomyText],
    ['tools/test262/upstream-subset.json', headSubsetText],
  ]);
  for (const [path, expected] of Object.entries(H0_PROJECTED_OUTPUT_SHA256)) {
    assertSame(sha256(requiredFixtureText(projectedOutputs, path)), expected);
  }
  const baseFiles = new Map([
    [ES2015_PROVENANCE_FILE, baseManifestText],
    ['docs/conformance.md', baseConformanceText],
    ['docs/test262-report.jsonl', baseReportText],
    ['tools/test262/es2015-audit-evidence.json', auditEvidenceText],
    [TAXONOMY_PATH, baseTaxonomyText],
    ['tools/test262/features.json', featuresText],
    ['tools/test262/upstream-subset.json', baseSubsetText],
  ]);
  const headFiles = new Map([
    [ES2015_PROVENANCE_FILE, headManifestText],
    ...projectedOutputs,
    ['tools/test262/es2015-audit-evidence.json', auditEvidenceText],
    ['tools/test262/features.json', featuresText],
  ]);
  for (const [suffix, text] of Object.entries(evidence)) {
    headFiles.set(`tools/test262/es2015-h0-${suffix}.json`, String(text));
  }
  const changes = [
    { status: 'M', path: ES2015_PROVENANCE_FILE },
    ...authority.protectedOutputs.map(
      (/** @type {{ operation: string, path: string }} */ output) => ({
        status: output.operation === 'add-exact' ? 'A' : 'M',
        path: output.path,
      }),
    ),
  ];
  return {
    authority,
    baseFiles,
    baseManifestText,
    baseManifestValue,
    changes,
    headFiles,
    headManifestText,
    headManifestValue,
    historicalFiles: new Map([
      [
        ISSUE_77_LEXICAL_MAINTENANCE_BASE_SHA,
        new Map([[TAXONOMY_PATH, PRESERVED_H0_SOURCE_TAXONOMY_TEXT]]),
      ],
    ]),
  };
}

/**
 * @param {{
 *   forgePreservedStatusTables?: boolean,
 *   forgeCurrentStatusTables?: boolean,
 * }} [options]
 */
function syntheticReviewedP0H0Fixture(options = {}) {
  const pin = {
    repository: TEST262_REPOSITORY,
    revision: TEST262_REVISION,
  };
  const h0Path = 'test/annexB/h0-compact.js';
  const unchangedPath = 'test/staging/unchanged.js';
  const h0Classification = {
    path: h0Path,
    variants: 1,
    partition: 'core',
    status: 'blocked:test262-cross-realm-host',
    blocker: 'test262-cross-realm-host',
    features: ['cross-realm'],
    flags: ['noStrict'],
    includes: [],
    provenance: ['feature:cross-realm'],
  };
  const p0Classifications = REVIEWED_P0_PATHS.map((path) => {
    const variants = REVIEWED_P0_SINGLE_VARIANT_PATHS.has(path) ? 1 : 2;
    return {
      path,
      variants,
      partition: 'core',
      status: 'blocked:lexical-grammar-and-new-target',
      blocker: 'lexical-grammar-and-new-target',
      features: [],
      flags: variants === 1 ? ['noStrict'] : [],
      includes: [],
      provenance: ['es6id'],
    };
  });
  const unchangedClassification = {
    path: unchangedPath,
    variants: 2,
    partition: 'core',
    status: 'blocked:proxy-and-reflect-metaobject',
    blocker: 'proxy-and-reflect-metaobject',
    features: [],
    flags: [],
    includes: [],
    provenance: ['es6id'],
  };
  const policy = {
    version: 1,
    source: SPECIFICATION_SOURCE,
    sourceSha256: SPECIFICATION_SHA256,
    anchors: 3,
  };
  const summary = {
    roots: 85,
    variants: 167,
    partitions: [
      {
        name: 'core',
        roots: 85,
        variants: 167,
        rootsPercent: 100,
        variantsPercent: 100,
      },
    ],
  };
  const preservedStatusTables = {
    core: [
      {
        name: 'blocked:lexical-grammar-and-new-target',
        roots: 83,
        variants: 164,
      },
      {
        name: 'blocked:proxy-and-reflect-metaobject',
        roots: 1,
        variants: 2,
      },
      {
        name: 'blocked:test262-cross-realm-host',
        roots: 1,
        variants: 1,
      },
    ],
    annexB: [],
    blockers: [
      {
        name: 'lexical-grammar-and-new-target',
        roots: 83,
        variants: 164,
      },
      {
        name: 'proxy-and-reflect-metaobject',
        roots: 1,
        variants: 2,
      },
      {
        name: 'test262-cross-realm-host',
        roots: 1,
        variants: 1,
      },
    ],
  };
  if (options.forgePreservedStatusTables === true) {
    preservedStatusTables.core[0].roots += 1;
  }
  const preservedTaxonomy = {
    version: 3,
    pin,
    policy,
    inputs: REVIEWED_P0_PRESERVED_INPUTS,
    summary,
    statusTables: preservedStatusTables,
    classifications: [
      h0Classification,
      ...p0Classifications,
      unchangedClassification,
    ],
  };
  const preservedTaxonomyText = prettyJson(preservedTaxonomy);
  const currentTaxonomy = /** @type {any} */ (
    structuredClone(preservedTaxonomy)
  );
  currentTaxonomy.classifications = currentTaxonomy.classifications.map(
    (/** @type {any} */ entry, /** @type {number} */ index) => {
      if (!REVIEWED_P0_PATHS.includes(entry.path)) return entry;
      const p0Index = index - 1;
      if (p0Index === 0) {
        return {
          ...entry,
          status: 'blocked:remaining-standard-library-additions',
          blocker: 'remaining-standard-library-additions',
        };
      }
      if (p0Index <= 22) {
        return { ...entry, status: 'selected-passing', blocker: null };
      }
      return { ...entry, status: 'audit-passing-unselected', blocker: null };
    },
  );
  currentTaxonomy.inputs = REVIEWED_P0_CURRENT_INPUTS;
  currentTaxonomy.statusTables = {
    core: [
      {
        name: 'audit-passing-unselected',
        roots: 60,
        variants: 120,
      },
      {
        name: 'blocked:proxy-and-reflect-metaobject',
        roots: 1,
        variants: 2,
      },
      {
        name: 'blocked:remaining-standard-library-additions',
        roots: 1,
        variants: 2,
      },
      {
        name: 'blocked:test262-cross-realm-host',
        roots: 1,
        variants: 1,
      },
      {
        name: 'selected-passing',
        roots: 22,
        variants: 42,
      },
    ],
    annexB: [],
    blockers: [
      {
        name: 'proxy-and-reflect-metaobject',
        roots: 1,
        variants: 2,
      },
      {
        name: 'remaining-standard-library-additions',
        roots: 1,
        variants: 2,
      },
      {
        name: 'test262-cross-realm-host',
        roots: 1,
        variants: 1,
      },
    ],
  };
  if (options.forgeCurrentStatusTables === true) {
    currentTaxonomy.statusTables.core[0].variants += 1;
  }
  const currentTaxonomyText = prettyJson(currentTaxonomy);
  const pathsManifestText = prettyJson({
    version: 1,
    repository: pin.repository,
    revision: pin.revision,
    sourceTaxonomySha256: sha256(preservedTaxonomyText),
    ledgerSha256: sha256(`${h0Path}\n`),
    rootCount: 1,
    variantCount: 1,
    paths: [h0Path],
  });
  const ownerMapText = prettyJson({
    version: 1,
    repository: pin.repository,
    revision: pin.revision,
    owners: [
      {
        code: 'M2',
        issue: 81,
        blocker: 'proxy-and-reflect-metaobject',
        title: 'Implement ES2015 Proxy traps, revocation, and invariants',
      },
    ],
    rules: [
      {
        name: 'unused-proxy-rule',
        primaryOwner: 'M2',
        pathPrefix: 'test/built-ins/Proxy/',
        failureSignatures: ['unexpected-throw:Object'],
        secondaryEvidence: [],
      },
    ],
  });
  const inventory = [
    {
      path: h0Path,
      variants: 1,
      executionVariants: ['default'],
      metadata: {
        features: ['cross-realm'],
        flags: ['noStrict'],
        includes: [],
      },
      includeFeatures: [],
    },
  ];
  const baselineText = prettyJson(
    buildEs2015H0Baseline({
      finalBaseCommit: '1'.repeat(40),
      taxonomyText: preservedTaxonomyText,
      pathsManifestText,
    }),
  );
  const disposition = buildEs2015H0Disposition({
    pathsManifestText,
    baselineTaxonomyText: preservedTaxonomyText,
    executionEvidenceText: prettyJson({
      version: 1,
      repository: pin.repository,
      revision: pin.revision,
      records: [
        {
          type: 'test',
          file: h0Path,
          variant: 'default',
          status: 'passed',
        },
      ],
    }),
    ownerMapText,
    pin,
    inventory,
  });
  const dispositionText = prettyJson(disposition);
  const promotionText = prettyJson(
    buildEs2015Promotion({
      sourceTaxonomyText: preservedTaxonomyText,
      dispositionText,
      pin,
      inventory,
    }),
  );
  const afterTaxonomy = /** @type {any} */ (structuredClone(currentTaxonomy));
  afterTaxonomy.classifications[0] = {
    ...afterTaxonomy.classifications[0],
    status: 'selected-passing',
    blocker: null,
  };
  afterTaxonomy.statusTables = {
    core: [
      {
        name: 'audit-passing-unselected',
        roots: 60,
        variants: 120,
      },
      {
        name: 'blocked:proxy-and-reflect-metaobject',
        roots: 1,
        variants: 2,
      },
      {
        name: 'blocked:remaining-standard-library-additions',
        roots: 1,
        variants: 2,
      },
      {
        name: 'selected-passing',
        roots: 23,
        variants: 43,
      },
    ],
    annexB: [],
    blockers: [
      {
        name: 'proxy-and-reflect-metaobject',
        roots: 1,
        variants: 2,
      },
      {
        name: 'remaining-standard-library-additions',
        roots: 1,
        variants: 2,
      },
    ],
  };
  const afterText = prettyJson(afterTaxonomy);
  const ownerDeltas = buildEs2015H0OwnerDeltas({
    beforeTaxonomyText: currentTaxonomyText,
    afterTaxonomyText: afterText,
    dispositionText,
    promotionText,
    sourceTaxonomySha256: sha256(preservedTaxonomyText),
  });
  return {
    afterTaxonomy,
    baselineOptions: {
      baselineText,
      taxonomyText: currentTaxonomyText,
      preservedTaxonomyText,
      pathsManifestText,
      pin,
    },
    compactOptions: {
      baseline: baselineText,
      preservedTaxonomyText,
      currentTaxonomyText,
      after: afterText,
      disposition: dispositionText,
      promotion: promotionText,
      ownerDeltas,
      pathsManifest: pathsManifestText,
      ownerMap: ownerMapText,
    },
    currentTaxonomy,
    preservedTaxonomy,
  };
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
    version: ES2015_PROVENANCE_DECISION_VERSION,
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
 *   expectedManifestVersion?: number,
 *   expectedRoadmapAuthorities?: readonly Record<string, any>[],
 *   validateRoadmapProtectedOutputs?: typeof validateRoadmapProtectedOutputs,
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
    ...(options.expectedManifestVersion === undefined
      ? {}
      : { expectedManifestVersion: options.expectedManifestVersion }),
    ...(options.expectedRoadmapAuthorities === undefined
      ? {}
      : { expectedRoadmapAuthorities: options.expectedRoadmapAuthorities }),
    validateRoadmapProtectedOutputs:
      options.validateRoadmapProtectedOutputs ??
      validateRoadmapProtectedOutputs,
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
 *   baseFiles?: ReadonlyMap<string, string>,
 *   baseModes?: ReadonlyMap<string, string>,
 *   baseManifestText?: string | null,
 *   baseSha?: string,
 *   headManifestText?: string,
 *   headSha?: string,
 *   headFiles?: ReadonlyMap<string, string>,
 *   headModes?: ReadonlyMap<string, string>,
 *   historicalFiles?: ReadonlyMap<string, ReadonlyMap<string, string>>,
 *   mergeBase?: string,
 *   validateRoadmapProtectedOutputs?: typeof validateRoadmapProtectedOutputs,
 * }} options
 */
function rangeCheckDependencies(options) {
  const dependencies = provenanceCheckDependencies({
    validateRoadmapProtectedOutputs: options.validateRoadmapProtectedOutputs,
  });
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
  const baseManifestText =
    options.baseManifestText === undefined
      ? options.baseHasFoundation === true
        ? approvedProvenanceManifestText()
        : null
      : options.baseManifestText;
  const baseFiles = new Map(dependencies.files);
  const baseModes = new Map();
  if (baseManifestText !== null) {
    baseFiles.set(ES2015_PROVENANCE_FILE, baseManifestText);
  } else {
    baseFiles.delete(ES2015_PROVENANCE_FILE);
  }
  for (const [path, text] of options.baseFiles ?? []) {
    baseFiles.set(path, text);
  }
  for (const path of baseFiles.keys()) {
    baseModes.set(path, '100644');
  }
  for (const [path, mode] of options.baseModes ?? []) {
    baseModes.set(path, mode);
  }
  const headModes = new Map();
  for (const path of headFiles.keys()) {
    headModes.set(path, '100644');
  }
  for (const [path, mode] of options.headModes ?? []) {
    headModes.set(path, mode);
  }
  for (const path of FOUNDATION_DELETIONS) {
    baseFiles.set(path, `removed fixture ${path}\n`);
    baseModes.set(path, '100644');
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
      if (options.historicalFiles?.has(revision)) {
        return options.historicalFiles.get(revision)?.get(path) ?? null;
      }
      throw new Error(`unexpected fixture commit ${revision}`);
    },
    readGitMode: async (
      /** @type {string} */ revision,
      /** @type {string} */ path,
    ) => {
      if (revision === baseSha) return baseModes.get(path) ?? null;
      if (revision === headSha) return headModes.get(path) ?? null;
      if (options.historicalFiles?.has(revision)) {
        return options.historicalFiles.get(revision)?.has(path)
          ? '100644'
          : null;
      }
      throw new Error(`unexpected fixture commit ${revision}`);
    },
  };
}

/** @type {ReadonlyMap<string, string> | null} */
let h0BootstrapRepairBaseFilesCache = null;

function h0BootstrapRepairBaseFiles() {
  if (h0BootstrapRepairBaseFilesCache !== null) {
    return h0BootstrapRepairBaseFilesCache;
  }
  const files = new Map();
  for (const path of H0_BOOTSTRAP_REPAIR_IMMUTABLE_PATHS) {
    const bytes = readOptionalGitFixtureBuffer(H0_BOOTSTRAP_BASE_SHA, path);
    if (bytes !== null) files.set(path, bytes.toString('utf8'));
  }
  h0BootstrapRepairBaseFilesCache = files;
  return files;
}

/**
 * @param {{
 *   baseManifestText?: string,
 *   baseSha?: string,
 *   body?: string,
 *   changes?: readonly { status: string, path: string, sourcePath?: string }[],
 *   eventName?: string,
 *   headFiles?: ReadonlyMap<string, string>,
 *   headManifestText?: string,
 * }} [options]
 */
function h0BootstrapRepairRangeDependencies(options = {}) {
  const baseManifestText =
    options.baseManifestText ??
    readGitFixtureText(H0_BOOTSTRAP_BASE_SHA, ES2015_PROVENANCE_FILE);
  const baseFiles = h0BootstrapRepairBaseFiles();
  const headFiles = new Map(baseFiles);
  for (const [path, text] of options.headFiles ?? []) {
    headFiles.set(path, text);
  }
  const dependencies = rangeCheckDependencies({
    changes: options.changes ?? H0_BOOTSTRAP_REPAIR_CHANGES,
    baseSha: options.baseSha ?? H0_BOOTSTRAP_BASE_SHA,
    baseFiles,
    baseManifestText,
    headManifestText: options.headManifestText ?? baseManifestText,
    headFiles,
  });
  dependencies.environment = {
    TZ: 'UTC',
    GITHUB_EVENT_NAME: options.eventName ?? 'pull_request',
    PROVENANCE_PR_BODY: options.body ?? h0BootstrapRepairMarker(),
  };
  return dependencies;
}

/** @param {string} [base] */
function h0BootstrapRepairCiArgs(base = H0_BOOTSTRAP_BASE_SHA) {
  return [
    '--check-range',
    `--base=${base}`,
    `--head=${RANGE_HEAD_SHA}`,
    '--pr-body-env=PROVENANCE_PR_BODY',
  ];
}

/** @type {ReadonlyMap<string, string> | null} */
let m1AuthorityRepairBaseFilesCache = null;

function m1AuthorityRepairBaseFiles() {
  if (m1AuthorityRepairBaseFilesCache !== null) {
    return m1AuthorityRepairBaseFilesCache;
  }
  const baseManifest = JSON.parse(m1AuthorityRepairBaseManifestText());
  const paths = new Set([
    ...m1AuthorityRepairImmutablePaths(baseManifest),
    ES2015_PROVENANCE_FILE,
    'tools/test262/es2015-provenance-check.js',
    'test/node/es2015-provenance.test.js',
    'docs/testing.md',
  ]);
  const files = new Map();
  for (const path of paths) {
    const bytes = readOptionalGitFixtureBuffer(M1_AUTHORITY_REPAIR_BASE, path);
    if (bytes !== null) files.set(path, bytes.toString('utf8'));
  }
  m1AuthorityRepairBaseFilesCache = files;
  return files;
}

/**
 * @param {{
 *   baseFiles?: ReadonlyMap<string, string>,
 *   baseManifestText?: string,
 *   baseModes?: ReadonlyMap<string, string>,
 *   baseSha?: string,
 *   body?: string,
 *   changes?: readonly { status: string, path: string, sourcePath?: string }[],
 *   eventName?: string | null,
 *   headFiles?: ReadonlyMap<string, string>,
 *   headManifestText?: string,
 *   headModes?: ReadonlyMap<string, string>,
 *   headSha?: string,
 *   mergeBase?: string,
 * }} [options]
 */
function m1AuthorityRepairRangeDependencies(options = {}) {
  const baseManifestText =
    options.baseManifestText ?? m1AuthorityRepairBaseManifestText();
  const headManifestText =
    options.headManifestText ?? m1AuthorityRepairHeadManifestText();
  const baseFiles = new Map(m1AuthorityRepairBaseFiles());
  baseFiles.set(ES2015_PROVENANCE_FILE, baseManifestText);
  for (const [path, text] of options.baseFiles ?? []) {
    baseFiles.set(path, text);
  }
  const headFiles = new Map(baseFiles);
  headFiles.set(
    'tools/test262/es2015-provenance-check.js',
    'M1 authority repair HEAD checker fixture\n',
  );
  headFiles.set(ES2015_PROVENANCE_FILE, headManifestText);
  headFiles.set(
    'test/node/es2015-provenance.test.js',
    'M1 authority repair HEAD focused test fixture\n',
  );
  headFiles.set('docs/testing.md', 'M1 authority repair HEAD docs fixture\n');
  headFiles.set(
    'docs/superpowers/specs/2026-08-23-m1-authority-repair-design.md',
    '# M1 authority repair design fixture\n',
  );
  headFiles.set(
    'docs/superpowers/plans/2026-08-23-m1-authority-repair.md',
    '# M1 authority repair plan fixture\n',
  );
  for (const [path, text] of options.headFiles ?? []) {
    headFiles.set(path, text);
  }
  const dependencies = rangeCheckDependencies({
    changes: options.changes ?? M1_AUTHORITY_REPAIR_CHANGES,
    baseSha: options.baseSha ?? M1_AUTHORITY_REPAIR_BASE,
    headSha: options.headSha ?? RANGE_HEAD_SHA,
    baseManifestText,
    headManifestText,
    baseFiles,
    headFiles,
    baseModes: options.baseModes,
    headModes: options.headModes,
    mergeBase: options.mergeBase,
  });
  dependencies.environment = {
    TZ: 'UTC',
    ...(options.eventName === null
      ? {}
      : { GITHUB_EVENT_NAME: options.eventName ?? 'pull_request' }),
    PROVENANCE_PR_BODY: options.body ?? m1AuthorityRepairMarker(),
  };
  return dependencies;
}

/** @param {string} [base] @param {string} [head] */
function m1AuthorityRepairCiArgs(
  base = M1_AUTHORITY_REPAIR_BASE,
  head = RANGE_HEAD_SHA,
) {
  return [
    '--check-range',
    `--base=${base}`,
    `--head=${head}`,
    '--pr-body-env=PROVENANCE_PR_BODY',
  ];
}

function m1AuthorityRepairContextChanges() {
  return M1_AUTHORITY_REPAIR_CHANGES.map((change) => ({
    ...change,
    sourcePath: null,
  }));
}

/**
 * @param {(manifest: Record<string, any>, m1: Record<string, any>) => void} mutate
 * @param {{ canonical?: boolean }} [options]
 */
function mutatedM1AuthorityRepairHeadManifestText(mutate, options = {}) {
  const manifest = m1AuthorityRepairHeadManifestValue();
  const m1 = manifest.roadmapAuthorities.find(
    (/** @type {{ code: string }} */ authority) => authority.code === 'M1',
  );
  assertSame(m1 !== undefined, true);
  mutate(manifest, m1);
  return options.canonical === false
    ? JSON.stringify(manifest)
    : prettyJson(manifest);
}

/** @type {ReadonlyMap<string, string> | null} */
let p1cAuthorityRepairBaseFilesCache = null;

function p1cAuthorityRepairBaseFiles() {
  if (p1cAuthorityRepairBaseFilesCache !== null) {
    return p1cAuthorityRepairBaseFilesCache;
  }
  const baseManifest = JSON.parse(p1cAuthorityRepairBaseManifestText());
  const paths = new Set([
    ...p1cAuthorityRepairImmutablePaths(baseManifest),
    ES2015_PROVENANCE_FILE,
    CHECKER_PATH,
    'test/node/es2015-provenance.test.js',
    'docs/testing.md',
  ]);
  const files = new Map();
  for (const path of paths) {
    const bytes = readOptionalGitFixtureBuffer(P1C_AUTHORITY_REPAIR_BASE, path);
    if (bytes !== null) files.set(path, bytes.toString('utf8'));
  }
  p1cAuthorityRepairBaseFilesCache = files;
  return files;
}

/**
 * @param {{
 *   baseAbsentPaths?: readonly string[],
 *   baseFiles?: ReadonlyMap<string, string>,
 *   baseManifestText?: string,
 *   baseModes?: ReadonlyMap<string, string>,
 *   baseSha?: string,
 *   body?: string,
 *   changes?: readonly { status: string, path: string, sourcePath?: string }[],
 *   eventName?: string | null,
 *   headFiles?: ReadonlyMap<string, string>,
 *   headManifestText?: string,
 *   headModes?: ReadonlyMap<string, string>,
 *   headSha?: string,
 *   mergeBase?: string,
 * }} [options]
 */
function p1cAuthorityRepairRangeDependencies(options = {}) {
  const baseManifestText =
    options.baseManifestText ?? p1cAuthorityRepairBaseManifestText();
  const headManifestText =
    options.headManifestText ?? p1cAuthorityRepairPendingManifestText();
  const baseFiles = new Map(p1cAuthorityRepairBaseFiles());
  baseFiles.set(ES2015_PROVENANCE_FILE, baseManifestText);
  for (const path of options.baseAbsentPaths ?? []) {
    baseFiles.delete(path);
  }
  for (const [path, text] of options.baseFiles ?? []) {
    baseFiles.set(path, text);
  }
  const headFiles = new Map(baseFiles);
  headFiles.set(CHECKER_PATH, 'P1C authority repair HEAD checker fixture\n');
  headFiles.set(ES2015_PROVENANCE_FILE, headManifestText);
  headFiles.set(
    'test/node/es2015-provenance.test.js',
    'P1C authority repair HEAD focused test fixture\n',
  );
  headFiles.set('docs/testing.md', 'P1C authority repair HEAD docs fixture\n');
  headFiles.set(
    'docs/superpowers/specs/2026-08-24-p1c-authority-repair-design.md',
    '# P1C authority repair design fixture\n',
  );
  headFiles.set(
    'docs/superpowers/plans/2026-08-24-p1c-authority-repair.md',
    '# P1C authority repair plan fixture\n',
  );
  for (const [path, text] of options.headFiles ?? []) {
    headFiles.set(path, text);
  }
  const dependencies = rangeCheckDependencies({
    changes: options.changes ?? P1C_AUTHORITY_REPAIR_CHANGES,
    baseSha: options.baseSha ?? P1C_AUTHORITY_REPAIR_BASE,
    headSha: options.headSha ?? RANGE_HEAD_SHA,
    baseFiles,
    baseManifestText,
    baseModes: options.baseModes,
    headFiles,
    headManifestText,
    headModes: options.headModes,
    mergeBase: options.mergeBase,
  });
  dependencies.environment = {
    TZ: 'UTC',
    ...(options.eventName === null
      ? {}
      : { GITHUB_EVENT_NAME: options.eventName ?? 'pull_request' }),
    PROVENANCE_PR_BODY: options.body ?? p1cAuthorityRepairMarker(),
  };
  return dependencies;
}

/** @param {string} [base] @param {string} [head] */
function p1cAuthorityRepairCiArgs(
  base = P1C_AUTHORITY_REPAIR_BASE,
  head = RANGE_HEAD_SHA,
) {
  return [
    '--check-range',
    `--base=${base}`,
    `--head=${head}`,
    '--pr-body-env=PROVENANCE_PR_BODY',
  ];
}

function p1cAuthorityRepairContextChanges() {
  return P1C_AUTHORITY_REPAIR_CHANGES.map((change) => ({
    ...change,
    sourcePath: null,
  }));
}

/**
 * @param {(manifest: Record<string, any>, p1c: Record<string, any>) => void} mutate
 * @param {{ canonical?: boolean }} [options]
 */
function mutatedP1CAuthorityRepairHeadManifestText(mutate, options = {}) {
  const manifest = p1cAuthorityRepairPendingManifestValue();
  const p1c = manifest.roadmapAuthorities.find(
    (/** @type {{ code: string }} */ authority) => authority.code === 'P1C',
  );
  assertSame(p1c !== undefined, true);
  mutate(manifest, p1c);
  return options.canonical === false
    ? JSON.stringify(manifest)
    : prettyJson(manifest);
}

export default [
  {
    name: 'ES2015 provenance exports the approved contract constants',
    run: () => {
      assertSame(json(ES2015_PROVENANCE_MANIFEST_VERSIONS), json([2, 3]));
      assertSame(ES2015_PROVENANCE_DECISION_VERSION, 2);
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
    name: 'ES2015 provenance exports exact initial roadmap authorities and migrated schema-v3 profiles',
    run: () => {
      const initialAuthorities = expectedInitialRoadmapAuthorities();
      assertSame(
        json(provenance.P0_APPLIED_ROADMAP_AUTHORITY),
        json(EXPECTED_P0_APPLIED_ROADMAP_AUTHORITY),
      );
      assertSame(
        json(provenance.H0_PENDING_ROADMAP_AUTHORITY),
        json(EXPECTED_H0_PENDING_ROADMAP_AUTHORITY),
      );
      assertSame(
        json(provenance.APPROVED_INITIAL_ROADMAP_AUTHORITIES),
        json(EXPECTED_INITIAL_ROADMAP_AUTHORITIES),
      );
      assertSame(
        canonicalRoadmapAuthoritySha256(
          provenance.P0_APPLIED_ROADMAP_AUTHORITY,
        ),
        EXPECTED_AUTHORITY_SHA256.P0,
      );
      assertSame(
        canonicalRoadmapAuthoritySha256(
          provenance.H0_PENDING_ROADMAP_AUTHORITY,
        ),
        EXPECTED_AUTHORITY_SHA256.H0,
      );

      const migratedRangeProfiles = productionManifest().rangeProfiles.filter(
        (profile) => profile.name !== 'maintenance:issue77-lexical',
      );
      const foundationV3 = buildProvenanceFoundation(
        foundationClassifications(),
        {
          version: 3,
          roadmapAuthorities: initialAuthorities,
        },
      );
      assertSame(foundationV3.rangeProfiles.length, 15);
      assertSame(
        foundationV3.rangeProfiles.some(
          (profile) => profile.name === 'maintenance:issue77-lexical',
        ),
        false,
      );
      assertSame(json(foundationV3.rangeProfiles), json(migratedRangeProfiles));
    },
  },
  {
    name: 'ES2015 provenance exports roadmap projection helpers and BASE-owned protected paths',
    run: () => {
      const manifest = canonicalSchemaV3ManifestValue();
      const h0 = manifest.roadmapAuthorities[0];
      if (h0 === undefined || h0.code !== 'H0') {
        throw new Error('expected canonical H0 roadmap authority');
      }
      assertSame(
        provenance.roadmapProjectionSha256('docs/conformance.md', h0),
        'c44ef2d084be750bca79a574ae041c2a757d452c71f2dffaf59badc7c6a9fcb8',
      );
      assertSame(
        provenance.roadmapProjectionSha256(
          'tools/test262/es2015-h0-baseline.json',
          h0,
        ),
        '01c9f90704fe9ea6d892c4e758817fbe9bc30368486a58f12b47068e6b2080ec',
      );
      assertSame(
        provenance.roadmapAggregateProjectionSha256(h0),
        '8e16b33ffdbd8a2089567e9a8bdb1c654619b8bd00021c54ac74c0ab02f2c5fd',
      );

      const owned = provenance.roadmapOwnedPathsFromBaseManifest(manifest);
      for (const path of [
        '.github/workflows/ci.yml',
        'tools/test262/es2015-h0-promotion.json',
        'tools/test262/es5-selection.json',
        'docs/test262-report.jsonl',
        'docs/conformance.md',
      ]) {
        assertSame(owned.has(path), true, path);
      }
      assertSame(owned.has('docs/testing.md'), false);
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
      badVersion.version = 4;
      assertSame(
        assertThrows(
          () => parseEs2015ProvenanceManifest(json(badVersion)),
          Es2015ProvenanceError,
        ).message,
        `${ES2015_PROVENANCE_FILE} must declare version 2 or 3`,
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
    name: 'ES2015 provenance parses canonical schema-v3 manifests and rejects noncanonical authorities',
    run: () => {
      const manifestV3 = canonicalSchemaV3ManifestValue();
      assertSame(
        renderEs2015ProvenanceManifest(manifestV3),
        `${JSON.stringify(manifestV3, null, 2)}\n`,
      );
      assertSame(
        json(validateRoadmapAuthorityManifest(manifestV3)),
        json(manifestV3),
      );
      assertSame(
        canonicalRoadmapAuthoritySha256(manifestV3.roadmapAuthorities[0]),
        EXPECTED_AUTHORITY_SHA256.H0,
      );
      assertSame(
        canonicalRoadmapAuthoritySha256(manifestV3.roadmapAuthorities[1]),
        EXPECTED_AUTHORITY_SHA256.P0,
      );
      const parsed = parseEs2015ProvenanceManifest(json(manifestV3));
      assertSame(parsed.version, 3);
      assertSame(parsed.rangeProfiles.length, 15);
      assertSame(
        parsed.rangeProfiles.some(
          (/** @type {{ name: string }} */ profile) =>
            profile.name === 'maintenance:issue77-lexical',
        ),
        false,
      );
      assertSame(
        json(parsed.roadmapAuthorities),
        json(EXPECTED_INITIAL_ROADMAP_AUTHORITIES),
      );

      const missingAuthorities = structuredClone(manifestV3);
      delete missingAuthorities.roadmapAuthorities;
      assertThrows(
        () => parseEs2015ProvenanceManifest(json(missingAuthorities)),
        Es2015ProvenanceError,
      );

      /** @type {Array<(value: Record<string, any>) => void>} */
      const mutations = [
        (value) => value.roadmapAuthorities.reverse(),
        (value) => value.roadmapAuthorities.push(value.roadmapAuthorities[0]),
        (value) => {
          value.roadmapAuthorities[0].state = 'ready';
        },
        (value) => {
          value.roadmapAuthorities[0].unknown = true;
        },
        (value) => {
          value.roadmapAuthorities[0].source.entryLedgerSha256 = undefined;
        },
        (value) => {
          value.roadmapAuthorities[0].code = 'maintenance:issue77-lexical';
        },
        (value) => {
          value.roadmapAuthorities[0].protectedOutputs[0].operation =
            'add-exact';
        },
        (value) => {
          value.roadmapAuthorities[0].protectedOutputs.push(
            structuredClone(value.roadmapAuthorities[0].protectedOutputs[0]),
          );
        },
        (value) => {
          value.rangeProfiles.splice(
            2,
            0,
            productionManifest().rangeProfiles.find(
              (profile) => profile.name === 'maintenance:issue77-lexical',
            ),
          );
        },
        (value) => {
          value.roadmapAuthorities[0].destinations = [
            {
              status: 'selected-passing',
              blocker: null,
              issue: 77,
            },
            {
              status: 'audit-passing-unselected',
              blocker: null,
              issue: 76,
            },
          ];
        },
      ];
      for (const mutate of mutations) {
        const bad = structuredClone(manifestV3);
        mutate(bad);
        assertThrows(
          () => parseEs2015ProvenanceManifest(json(bad)),
          Es2015ProvenanceError,
        );
      }
    },
  },
  {
    name: 'ES2015 provenance schema-v3 foundation building requires explicit roadmapAuthorities',
    run: () => {
      const manifestV3 = canonicalSchemaV3ManifestValue();
      const foundationV3 = buildProvenanceFoundation(
        foundationClassifications(),
        {
          version: 3,
          roadmapAuthorities: manifestV3.roadmapAuthorities,
        },
      );
      assertSame(foundationV3.version, 3);
      assertSame(foundationV3.rangeProfiles.length, 15);
      assertSame(
        foundationV3.rangeProfiles.some(
          (/** @type {{ name: string }} */ profile) =>
            profile.name === 'maintenance:issue77-lexical',
        ),
        false,
      );
      assertSame(Array.isArray(foundationV3.roadmapAuthorities), true);
      assertSame(foundationV3.roadmapAuthorities?.[0]?.code, 'H0');
      assertSame(
        assertThrows(
          () =>
            buildProvenanceFoundation(foundationClassifications(), {
              version: 3,
            }),
          Es2015ProvenanceError,
        ).message,
        'ES2015 provenance foundation version 3 requires roadmapAuthorities option',
      );
      assertThrows(
        () =>
          buildProvenanceFoundation(foundationClassifications(), {
            version: 2,
            roadmapAuthorities: manifestV3.roadmapAuthorities,
          }),
        Es2015ProvenanceError,
      );
    },
  },
  {
    name: 'ES2015 provenance semantically validates the pinned H0 reconciliation',
    run: () => {
      assertSame(
        sha256(PRODUCTION_TAXONOMY_TEXT),
        'dcc14a00a21c8e76351f75a24ec6e2ff52db9bd02f63d3ece0e4d6634121d662',
      );
      assertSame(
        sha256(PRESERVED_H0_SOURCE_TAXONOMY_TEXT),
        'e7746b6da6038c1fda83e1e6cbecbe9fb3e7b97bdf89a311c0a3f34a686c7953',
      );
      assertSame(typeof provenance.validateRoadmapReconciliation, 'function');
      assertSame(
        json(
          provenance.validateRoadmapReconciliation(
            PRODUCTION_TAXONOMY_TEXT,
            PRESERVED_H0_SOURCE_TAXONOMY_TEXT,
            provenance.H0_PENDING_ROADMAP_AUTHORITY,
          ),
        ),
        json(provenance.H0_PENDING_ROADMAP_AUTHORITY.reconciliation),
      );

      const driftedAuthorityTaxonomy = driftedCrossRealmTaxonomyText(
        PRESERVED_H0_SOURCE_TAXONOMY_TEXT,
      );
      const driftedAuthority = clone(provenance.H0_PENDING_ROADMAP_AUTHORITY);
      driftedAuthority.reconciliation.preservedTaxonomySha256 = sha256(
        driftedAuthorityTaxonomy,
      );
      driftedAuthority.reconciliation.proofSha256 = reconciliationProofSha256(
        driftedAuthority.reconciliation,
      );
      assertThrows(
        () =>
          provenance.validateRoadmapReconciliation(
            PRODUCTION_TAXONOMY_TEXT,
            driftedAuthorityTaxonomy,
            driftedAuthority,
          ),
        Es2015ProvenanceError,
      );
    },
  },
  {
    name: 'ES2015 compact H0 baseline accepts the production reviewed P0 document transition',
    run: () => {
      const fixture = syntheticReviewedP0H0Fixture();
      assertSame(REVIEWED_P0_PATHS.length, 83);
      assertSame(
        REVIEWED_P0_PATHS.reduce(
          (total, path) =>
            total + (REVIEWED_P0_SINGLE_VARIANT_PATHS.has(path) ? 1 : 2),
          0,
        ),
        164,
      );
      assertSame(
        sha256(`${REVIEWED_P0_PATHS.join('\n')}\n`),
        REVIEWED_P0_PATH_SHA256,
      );
      assertSame(
        fixture.preservedTaxonomy.inputs.subsetSha256,
        REVIEWED_P0_PRESERVED_INPUTS.subsetSha256,
      );
      assertSame(
        fixture.currentTaxonomy.inputs.subsetSha256,
        REVIEWED_P0_CURRENT_INPUTS.subsetSha256,
      );
      assertEs2015H0BaselineMatchesTaxonomy(fixture.baselineOptions);
      assertExactH0DispositionDelta(fixture.compactOptions);

      const extraH0 = structuredClone(fixture.afterTaxonomy);
      extraH0.classifications.push({
        ...extraH0.classifications[0],
        path: 'test/language/unreviewed-h0.js',
        status: 'blocked:test262-cross-realm-host',
        blocker: 'test262-cross-realm-host',
      });
      assertThrows(
        () =>
          assertExactH0DispositionDelta({
            ...fixture.compactOptions,
            after: prettyJson(extraH0),
          }),
        Error,
      );

      const unbalancedPartition = structuredClone(fixture.afterTaxonomy);
      unbalancedPartition.classifications[1] = {
        ...unbalancedPartition.classifications[1],
        partition: 'annex-b',
      };
      assertThrows(
        () =>
          assertExactH0DispositionDelta({
            ...fixture.compactOptions,
            after: prettyJson(unbalancedPartition),
          }),
        Error,
      );
    },
  },
  {
    name: 'ES2015 compact H0 baseline requires exact preserved taxonomy for non-H0 movement',
    run: () => {
      const fixture = syntheticReviewedP0H0Fixture();
      const compactOptions = /** @type {any} */ ({
        ...fixture.compactOptions,
      });
      delete compactOptions.preservedTaxonomyText;
      const baselineOptions = {
        baselineText: fixture.baselineOptions.baselineText,
        taxonomyText: fixture.baselineOptions.taxonomyText,
        pathsManifestText: fixture.baselineOptions.pathsManifestText,
        pin: fixture.baselineOptions.pin,
      };

      assertThrows(() => assertExactH0DispositionDelta(compactOptions), Error);
      assertThrows(
        () => assertEs2015H0BaselineMatchesTaxonomy(baselineOptions),
        Error,
      );
      assertThrows(
        () =>
          assertEs2015H0BaselineMatchesTaxonomy({
            ...fixture.baselineOptions,
            preservedTaxonomyText: `${fixture.baselineOptions.preservedTaxonomyText}\n`,
          }),
        Error,
      );
    },
  },
  {
    name: 'ES2015 compact H0 baseline rejects arbitrary non-H0 status, blocker, and provenance drift',
    run: () => {
      const fixture = syntheticReviewedP0H0Fixture();
      const statusDrift = structuredClone(fixture.afterTaxonomy);
      statusDrift.classifications[2] = {
        ...statusDrift.classifications[2],
        status: 'blocked:proxy-and-reflect-metaobject',
        blocker: 'proxy-and-reflect-metaobject',
      };
      const blockerDrift = structuredClone(fixture.afterTaxonomy);
      blockerDrift.classifications[3] = {
        ...blockerDrift.classifications[3],
        blocker: 'remaining-language-runtime-semantics',
      };
      const changedProvenance = structuredClone(fixture.afterTaxonomy);
      changedProvenance.classifications[4] = {
        ...changedProvenance.classifications[4],
        provenance: ['unreviewed-drift'],
      };
      const unchangedProvenance = structuredClone(fixture.afterTaxonomy);
      const unchangedIndex = unchangedProvenance.classifications.length - 1;
      unchangedProvenance.classifications[unchangedIndex] = {
        ...unchangedProvenance.classifications[unchangedIndex],
        provenance: ['unreviewed-drift'],
      };

      for (const after of [
        statusDrift,
        blockerDrift,
        changedProvenance,
        unchangedProvenance,
      ]) {
        assertThrows(
          () =>
            assertExactH0DispositionDelta({
              ...fixture.compactOptions,
              after: prettyJson(after),
            }),
          Error,
        );
      }
    },
  },
  {
    name: 'ES2015 compact H0 baseline rejects wrong reviewed P0 path set, hash, and variant counts',
    run: () => {
      const fixture = syntheticReviewedP0H0Fixture();
      const preservedByPath = new Map(
        fixture.preservedTaxonomy.classifications.map((entry) => [
          entry.path,
          entry,
        ]),
      );
      const wrongCount = structuredClone(fixture.afterTaxonomy);
      const revertedPath = REVIEWED_P0_PATHS[0];
      const revertedIndex = wrongCount.classifications.findIndex(
        (/** @type {any} */ entry) => entry.path === revertedPath,
      );
      const reverted = preservedByPath.get(revertedPath);
      if (reverted === undefined) {
        throw new Error('expected reviewed P0 path in preserved taxonomy');
      }
      wrongCount.classifications[revertedIndex] = structuredClone(reverted);

      const wrongHash = structuredClone(wrongCount);
      const unchangedIndex = wrongHash.classifications.length - 1;
      wrongHash.classifications[unchangedIndex] = {
        ...wrongHash.classifications[unchangedIndex],
        status: 'selected-passing',
        blocker: null,
      };

      const wrongVariants = structuredClone(fixture.afterTaxonomy);
      const firstP0Index = wrongVariants.classifications.findIndex(
        (/** @type {any} */ entry) => entry.path === REVIEWED_P0_PATHS[0],
      );
      wrongVariants.classifications[firstP0Index] = {
        ...wrongVariants.classifications[firstP0Index],
        variants: wrongVariants.classifications[firstP0Index].variants + 1,
      };
      wrongVariants.classifications[unchangedIndex] = {
        ...wrongVariants.classifications[unchangedIndex],
        variants: wrongVariants.classifications[unchangedIndex].variants - 1,
      };

      for (const after of [wrongCount, wrongHash, wrongVariants]) {
        assertThrows(
          () =>
            assertExactH0DispositionDelta({
              ...fixture.compactOptions,
              after: prettyJson(after),
            }),
          Error,
        );
      }
    },
  },
  {
    name: 'ES2015 reviewed P0 document transition rejects policy, input, summary, and key drift',
    run: () => {
      const fixture = syntheticReviewedP0H0Fixture();
      const versionDrift = {
        ...structuredClone(fixture.currentTaxonomy),
        version: 4,
      };
      const pinDrift = structuredClone(fixture.currentTaxonomy);
      pinDrift.pin = { ...pinDrift.pin, revision: '0'.repeat(40) };
      const policyDrift = structuredClone(fixture.currentTaxonomy);
      policyDrift.policy = { ...policyDrift.policy, anchors: 4 };
      const summaryDrift = structuredClone(fixture.currentTaxonomy);
      summaryDrift.summary = { ...summaryDrift.summary, roots: 84 };
      const staticInputDrift = structuredClone(fixture.currentTaxonomy);
      staticInputDrift.inputs = {
        ...staticInputDrift.inputs,
        policySha256: '0'.repeat(64),
      };
      const unauthorizedInput = structuredClone(fixture.currentTaxonomy);
      unauthorizedInput.inputs = {
        ...unauthorizedInput.inputs,
        subsetSha256: '0'.repeat(64),
      };
      const extraTopLevel = {
        ...structuredClone(fixture.currentTaxonomy),
        unexpected: true,
      };
      const missingInput = structuredClone(fixture.currentTaxonomy);
      delete missingInput.inputs.auditEvidenceSha256;

      for (const taxonomy of [
        versionDrift,
        pinDrift,
        policyDrift,
        summaryDrift,
        staticInputDrift,
        unauthorizedInput,
        extraTopLevel,
        missingInput,
      ]) {
        assertThrows(
          () =>
            assertEs2015H0BaselineMatchesTaxonomy({
              ...fixture.baselineOptions,
              taxonomyText: prettyJson(taxonomy),
            }),
          Error,
        );
      }
    },
  },
  {
    name: 'ES2015 reviewed P0 document transition derives both status tables from classifications',
    run: () => {
      const forgedCurrent = syntheticReviewedP0H0Fixture({
        forgeCurrentStatusTables: true,
      });
      const forgedPreserved = syntheticReviewedP0H0Fixture({
        forgePreservedStatusTables: true,
      });

      assertThrows(
        () =>
          assertEs2015H0BaselineMatchesTaxonomy(forgedCurrent.baselineOptions),
        Error,
      );
      assertThrows(
        () =>
          assertEs2015H0BaselineMatchesTaxonomy(
            forgedPreserved.baselineOptions,
          ),
        Error,
      );
    },
  },
  {
    name: 'ES2015 provenance schema-v3 foundation validation compares trusted roadmap authorities',
    run: () => {
      const manifestV3 = canonicalSchemaV3ManifestValue();
      assertSame(
        assertThrows(
          () =>
            validateProvenanceFoundation(
              manifestV3,
              productionClassifications(),
            ),
          Es2015ProvenanceError,
        ).message,
        'tools/test262/es2015-provenance.json version 3 validation requires expected roadmapAuthorities',
      );
      validateProvenanceFoundation(manifestV3, productionClassifications(), {
        expectedRoadmapAuthorities: manifestV3.roadmapAuthorities,
      });
      const drifted = structuredClone(manifestV3);
      drifted.roadmapAuthorities[0].state = 'applied';
      assertSame(
        assertThrows(
          () =>
            validateProvenanceFoundation(drifted, productionClassifications(), {
              expectedRoadmapAuthorities: manifestV3.roadmapAuthorities,
            }),
          Es2015ProvenanceError,
        ).message,
        'H0 roadmap authority does not match the reviewed ledger',
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

      for (const path of provenance.PROVENANCE_RANGE_GATE_OWNER_PATHS) {
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
    name: 'ES2015 provenance CI range mode accepts pull_request_target alongside pull_request and rejects every other event',
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
      const markedBody = `U0\n\n${rangeMarker('foundation')}\n`;

      for (const eventName of ['pull_request', 'pull_request_target']) {
        const accepted = rangeCheckDependencies({ changes: foundationChanges });
        accepted.environment = {
          TZ: 'UTC',
          GITHUB_EVENT_NAME: eventName,
          PROVENANCE_PR_BODY: markedBody,
        };
        assertSame(await provenanceCheck(ciArgs, accepted), 0, eventName);
      }

      for (const eventName of [
        'push',
        '',
        'issue_comment',
        'pull_request_review',
      ]) {
        const rejectedRange = rangeCheckDependencies({
          changes: foundationChanges,
        });
        rejectedRange.environment = {
          TZ: 'UTC',
          GITHUB_EVENT_NAME: eventName,
          PROVENANCE_PR_BODY: markedBody,
        };
        assertSame(
          (await rejected(() => provenanceCheck(ciArgs, rejectedRange)))
            .message,
          'Provenance PR range checking requires a pull_request event',
          JSON.stringify(eventName),
        );
      }
    },
  },
  {
    name: 'ES2015 provenance CI range mode owns the test262 selection dependency against unmarked ranges',
    run: async () => {
      const selectionChange = [
        { status: 'M', path: 'tools/test262/selection.js' },
      ];
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
        const unmarkedSelection = rangeCheckDependencies({
          changes: selectionChange,
          baseSha,
          baseManifestText,
        });
        unmarkedSelection.environment = {
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
                unmarkedSelection,
              ),
            )
          ).message,
          'A provenance-owned PR range requires one authoritative provenance marker',
          baseSha,
        );
      }

      const manifest = productionManifest();
      for (const profile of manifest.rangeProfiles) {
        for (const pathList of [
          profile.requiredPaths,
          profile.allowedPaths,
          profile.requiredDeletions,
          profile.allowedDeletions,
        ]) {
          assertSame(
            pathList.includes('tools/test262/selection.js'),
            false,
            profile.name,
          );
        }
      }
    },
  },
  {
    name: 'ES2015 provenance CI range mode does not derive markerless ownership from HEAD when BASE has no manifest',
    run: async () => {
      const ciArgs = [
        '--check-range',
        `--base=${RANGE_BASE_SHA}`,
        `--head=${RANGE_HEAD_SHA}`,
        '--pr-body-env=PROVENANCE_PR_BODY',
      ];
      for (const changes of [
        [
          {
            status: 'M',
            path: 'docs/superpowers/plans/2026-08-20-provenance-foundation-maintenance.md',
          },
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
            sourcePath: 'tools/test262/es2015-audit.js',
            path: 'docs/copied-audit.js',
          },
        ],
      ]) {
        const dependencies = rangeCheckDependencies({
          changes,
          headManifestText: approvedProvenanceManifestText(),
        });
        dependencies.environment = {
          TZ: 'UTC',
          GITHUB_EVENT_NAME: 'pull_request',
          PROVENANCE_PR_BODY: 'No marker',
        };
        assertSame(
          await provenanceCheck(ciArgs, dependencies),
          0,
          json(changes),
        );
      }
    },
  },
  {
    name: 'ES2015 provenance schema-v3 markerless ranges reject roadmap protected paths and closed generated namespaces',
    run: async () => {
      const baseManifestText = renderEs2015ProvenanceManifest(
        canonicalSchemaV3ManifestValue(),
      );
      const ciArgs = [
        '--check-range',
        `--base=${RANGE_BASE_SHA}`,
        `--head=${RANGE_HEAD_SHA}`,
        '--pr-body-env=PROVENANCE_PR_BODY',
      ];
      const manifest = canonicalSchemaV3ManifestValue();
      const protectedPaths = new Set([
        ...manifest.roadmapAuthorities.flatMap(
          (/** @type {Record<string, any>} */ authority) =>
            authority.evidence.map(
              (/** @type {{ path: string }} */ entry) => entry.path,
            ),
        ),
        ...manifest.roadmapAuthorities.flatMap(
          (/** @type {Record<string, any>} */ authority) =>
            authority.protectedOutputs.map(
              (/** @type {{ path: string }} */ entry) => entry.path,
            ),
        ),
      ]);
      for (const path of protectedPaths) {
        const unmarked = rangeCheckDependencies({
          changes: [{ status: 'M', path }],
          baseManifestText,
          headManifestText: baseManifestText,
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
        [{ status: 'M', path: 'tools/test262/es2015-h0-unknown.json' }],
        [
          {
            status: 'M',
            path: 'tools/test262/es2015-h0-promotion.json/../unknown.json',
          },
        ],
        [
          {
            status: 'M',
            path: 'tools%2ftest262%2fes2015-h0-promotion.json',
          },
        ],
        [
          {
            status: 'D',
            path: 'tools/test262/es2015-h0-promotion.json',
          },
        ],
        [
          {
            status: 'R100',
            sourcePath: 'tools/test262/es2015-h0-promotion.json',
            path: 'docs/renamed-roadmap-evidence.json',
          },
        ],
        [
          {
            status: 'C100',
            sourcePath: 'tools/test262/es2015-h0-promotion.json',
            path: 'docs/copied-roadmap-evidence.json',
          },
        ],
      ]) {
        const unmarked = rangeCheckDependencies({
          changes,
          baseManifestText,
          headManifestText: baseManifestText,
        });
        unmarked.environment = {
          TZ: 'UTC',
          GITHUB_EVENT_NAME: 'pull_request',
          PROVENANCE_PR_BODY: 'No marker',
        };
        assertSame(
          (await rejected(() => provenanceCheck(ciArgs, unmarked))).message,
          'A provenance-owned PR range requires one authoritative provenance marker',
          json(changes),
        );
      }
    },
  },
  {
    name: 'ES2015 provenance roadmap authority markers require exact full-block parsing',
    run: () => {
      const migrationMarker = roadmapMigrationMarker({
        baseManifestText: 'b'.repeat(64),
        checkerText: 'c'.repeat(64),
        workflowText: 'd'.repeat(64),
        headManifestText: 'e'.repeat(64),
      })
        .replace(
          `base-manifest-sha256:${sha256('b'.repeat(64))}`,
          `base-manifest-sha256:${'b'.repeat(64)}`,
        )
        .replace(
          `base-checker-sha256:${sha256('c'.repeat(64))}`,
          `base-checker-sha256:${'c'.repeat(64)}`,
        )
        .replace(
          `base-workflow-sha256:${sha256('d'.repeat(64))}`,
          `base-workflow-sha256:${'d'.repeat(64)}`,
        )
        .replace(
          `head-manifest-sha256:${sha256('e'.repeat(64))}`,
          `head-manifest-sha256:${'e'.repeat(64)}`,
        );
      const preparationMarker = roadmapPreparationMarker({
        baseManifestText: 'b'.repeat(64),
        recordSha256: 'c'.repeat(64),
      }).replace(
        `base-manifest-sha256:${sha256('b'.repeat(64))}`,
        `base-manifest-sha256:${'b'.repeat(64)}`,
      );
      const consumeMarker = roadmapConsumptionMarker();

      assertSame(
        json(parseRoadmapAuthorityMarker(migrationMarker)),
        json({
          kind: 'migration',
          text: migrationMarker,
          base: RANGE_BASE_SHA,
          baseManifestSha256: 'b'.repeat(64),
          baseCheckerSha256: 'c'.repeat(64),
          baseWorkflowSha256: 'd'.repeat(64),
          headManifestSha256: 'e'.repeat(64),
        }),
      );
      assertSame(
        json(parseRoadmapAuthorityMarker(preparationMarker)),
        json({
          kind: 'prepare',
          text: preparationMarker,
          code: 'M0',
          issue: 79,
          base: RANGE_BASE_SHA,
          baseManifestSha256: 'b'.repeat(64),
          recordSha256: 'c'.repeat(64),
        }),
      );
      assertSame(
        json(parseRoadmapAuthorityMarker(consumeMarker)),
        json({
          kind: 'consume',
          text: consumeMarker,
          code: 'H0',
          issue: 76,
          profile: 'roadmap-reclassification:H0',
          base: RANGE_BASE_SHA,
          sourcePathSha256:
            '3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950',
          sourceEntrySha256: null,
          protectedProjectionSha256:
            '8e16b33ffdbd8a2089567e9a8bdb1c654619b8bd00021c54ac74c0ab02f2c5fd',
        }),
      );

      for (const text of [
        migrationMarker.replace(/\n/gu, '\r\n'),
        migrationMarker.replace('parent:70', 'parent: 70'),
        migrationMarker.replace(
          'base-manifest-sha256',
          'base-manifest-sha256 ',
        ),
        migrationMarker.replace(
          'base-workflow-sha256',
          'head-manifest-sha256\nbase-workflow-sha256',
        ),
        migrationMarker.replace('b'.repeat(64), 'B'.repeat(64)),
        `${migrationMarker}\nextra:field`,
        `${migrationMarker}\n${migrationMarker}`,
        `${maintenanceRangeMarker()}\n${migrationMarker}`,
        preparationMarker.replace(
          `record-sha256:${'c'.repeat(64)}`,
          `record-sha256:${'c'.repeat(64)}\nrecord-sha256:${'c'.repeat(64)}`,
        ),
      ]) {
        assertSame(
          assertThrows(
            () => parseRoadmapAuthorityMarker(text),
            Es2015ProvenanceCheckError,
          ).message,
          'Roadmap authority marker is not authoritative',
        );
      }
    },
  },
  {
    name: 'ES2015 provenance roadmap authority migration uses exact BASE pins, fragments, and embedded standalone docs',
    run: async () => {
      const baseManifestText = approvedProvenanceManifestText();
      const headManifestText = renderEs2015ProvenanceManifest(
        canonicalSchemaV3ManifestValue(),
      );
      const checkerText = 'base checker fixture\n';
      const workflowText = 'base workflow fixture\n';
      const designText = '# Roadmap Authority Design\n';
      const planText = '# Roadmap Authority Plan\n';
      const migrationArtifactFiles = initialRoadmapMigrationArtifactFiles();
      const migrationBaseFiles = new Map([
        ...migrationArtifactFiles,
        [CHECKER_PATH, checkerText],
        [WORKFLOW_PATH, workflowText],
        [
          ROADMAP_AUTHORITY_BASE_DESIGN_ADDENDUM_PATH,
          embeddedRoadmapAuthorityPayload('DESIGN', designText),
        ],
        [
          ROADMAP_AUTHORITY_BASE_PLAN_ADDENDUM_PATH,
          embeddedRoadmapAuthorityPayload('PLAN', planText),
        ],
      ]);
      const migrationHeadFiles = new Map([
        ...migrationArtifactFiles,
        [ROADMAP_AUTHORITY_DESIGN_PATH, designText],
        [ROADMAP_AUTHORITY_PLAN_PATH, planText],
      ]);
      const marker = parseRoadmapAuthorityMarker(
        roadmapMigrationMarker({
          baseManifestText,
          checkerText,
          workflowText,
          headManifestText,
        }),
      );
      const dependencies = rangeCheckDependencies({
        changes: [
          { status: 'M', path: ES2015_PROVENANCE_FILE },
          { status: 'A', path: ROADMAP_AUTHORITY_DESIGN_PATH },
          { status: 'A', path: ROADMAP_AUTHORITY_PLAN_PATH },
        ],
        baseManifestText,
        headManifestText,
        baseFiles: migrationBaseFiles,
        headFiles: migrationHeadFiles,
      });
      assertSame(
        await validateRoadmapAuthorityMigration(
          baseManifestText,
          headManifestText,
          {
            deps: dependencies,
            base: RANGE_BASE_SHA,
            head: RANGE_HEAD_SHA,
            marker,
            changes: [
              { status: 'M', path: ES2015_PROVENANCE_FILE, sourcePath: null },
              {
                status: 'A',
                path: ROADMAP_AUTHORITY_DESIGN_PATH,
                sourcePath: null,
              },
              {
                status: 'A',
                path: ROADMAP_AUTHORITY_PLAN_PATH,
                sourcePath: null,
              },
            ],
          },
        ),
        0,
      );

      const changedFragment = new Map([
        ...migrationHeadFiles,
        [`${PROVENANCE_DECISIONS_DIRECTORY}/UA.json`, 'drift\n'],
      ]);
      const changedP0Head = structuredClone(canonicalSchemaV3ManifestValue());
      changedP0Head.roadmapAuthorities[1].issue = 170;
      const extraAuthorityHead = structuredClone(
        canonicalSchemaV3ManifestValue(),
      );
      extraAuthorityHead.roadmapAuthorities.splice(
        1,
        0,
        minimalRoadmapAuthority('M0', 79, 'pending'),
      );
      const missingH0Head = structuredClone(canonicalSchemaV3ManifestValue());
      missingH0Head.roadmapAuthorities =
        missingH0Head.roadmapAuthorities.filter(
          (/** @type {Record<string, any>} */ authority) =>
            authority.code !== 'H0',
        );
      const profileDriftHead = structuredClone(
        canonicalSchemaV3ManifestValue(),
      );
      profileDriftHead.rangeProfiles = [
        ...profileDriftHead.rangeProfiles,
      ].reverse();
      const repeatedDesignPayload = `${embeddedRoadmapAuthorityPayload(
        'DESIGN',
        designText,
      )}${embeddedRoadmapAuthorityPayload('DESIGN', designText)}`;
      const repeatedPlanPayload = `${embeddedRoadmapAuthorityPayload(
        'PLAN',
        planText,
      )}${embeddedRoadmapAuthorityPayload('PLAN', planText)}`;
      const badDesignSha = embeddedRoadmapAuthorityPayload(
        'DESIGN',
        designText,
      ).replace(sha256(designText), 'f'.repeat(64));
      const missingProjectHeadFiles = new Map(migrationHeadFiles);
      missingProjectHeadFiles.delete('tools/test262/upstream-subset.json');
      const h0AddExactPath =
        EXPECTED_H0_PENDING_ROADMAP_AUTHORITY.evidence[0].path;

      for (const scenario of [
        {
          markerText: roadmapMigrationMarker({
            base: 'f'.repeat(40),
            baseManifestText,
            checkerText,
            workflowText,
            headManifestText,
          }),
          message:
            'roadmap-authority-migration marker base pin does not match the resolved BASE commit',
        },
        {
          markerText: roadmapMigrationMarker({
            baseManifestText: `${baseManifestText}drift`,
            checkerText,
            workflowText,
            headManifestText,
          }),
          message:
            'roadmap-authority-migration marker base-manifest-sha256 does not match the BASE manifest',
        },
        {
          markerText: roadmapMigrationMarker({
            baseManifestText,
            checkerText: `${checkerText}drift`,
            workflowText,
            headManifestText,
          }),
          message:
            'roadmap-authority-migration marker base-checker-sha256 does not match tools/test262/es2015-provenance-check.js in BASE',
        },
        {
          markerText: roadmapMigrationMarker({
            baseManifestText,
            checkerText,
            workflowText: `${workflowText}drift`,
            headManifestText,
          }),
          message:
            'roadmap-authority-migration marker base-workflow-sha256 does not match .github/workflows/ci.yml in BASE',
        },
        {
          markerText: roadmapMigrationMarker({
            baseManifestText,
            checkerText,
            workflowText,
            headManifestText: `${headManifestText}drift`,
          }),
          message:
            'roadmap-authority-migration marker head-manifest-sha256 does not match the HEAD manifest',
        },
        {
          headManifestText: baseManifestText,
          markerText: roadmapMigrationMarker({
            baseManifestText,
            checkerText,
            workflowText,
            headManifestText: baseManifestText,
          }),
          message:
            'roadmap-authority-migration range requires a canonical schema-v3 HEAD manifest',
        },
        {
          baseManifestText: headManifestText,
          markerText: roadmapMigrationMarker({
            baseManifestText: headManifestText,
            checkerText,
            workflowText,
            headManifestText,
          }),
          message:
            'roadmap-authority-migration range requires a canonical schema-v2 BASE manifest',
        },
        {
          headManifestText: prettyJson(extraAuthorityHead),
          markerText: roadmapMigrationMarker({
            baseManifestText,
            checkerText,
            workflowText,
            headManifestText: prettyJson(extraAuthorityHead),
          }),
          message: 'M0 roadmap authority is unexpected in the reviewed ledger',
        },
        {
          headManifestText: prettyJson(missingH0Head),
          markerText: roadmapMigrationMarker({
            baseManifestText,
            checkerText,
            workflowText,
            headManifestText: prettyJson(missingH0Head),
          }),
          message: 'H0 roadmap authority is missing from the reviewed ledger',
        },
        {
          headManifestText: prettyJson(changedP0Head),
          markerText: roadmapMigrationMarker({
            baseManifestText,
            checkerText,
            workflowText,
            headManifestText: prettyJson(changedP0Head),
          }),
          message: 'P0 roadmap authority does not match the reviewed ledger',
        },
        {
          headManifestText: prettyJson(profileDriftHead),
          markerText: roadmapMigrationMarker({
            baseManifestText,
            checkerText,
            workflowText,
            headManifestText: prettyJson(profileDriftHead),
          }),
          message:
            'tools/test262/es2015-provenance.json rangeProfiles must contain the approved profiles',
        },
        {
          headFiles: changedFragment,
          message:
            'tools/test262/es2015-provenance-decisions/UA.json must remain byte-identical across roadmap-authority-migration',
        },
        {
          baseFiles: new Map([
            ...migrationBaseFiles,
            [
              'tools/test262/es2015-audit-evidence.json',
              `${PRODUCTION_AUDIT_EVIDENCE_TEXT}drift`,
            ],
          ]),
          message:
            'P0 replace-exact protected output tools/test262/es2015-audit-evidence.json BASE bytes do not match its reviewed headSha256',
        },
        {
          headFiles: new Map([
            ...migrationHeadFiles,
            [
              'tools/test262/es2015-audit-evidence.json',
              `${PRODUCTION_AUDIT_EVIDENCE_TEXT}drift`,
            ],
          ]),
          message:
            'P0 replace-exact protected output tools/test262/es2015-audit-evidence.json must remain byte-identical across roadmap-authority-migration',
        },
        {
          baseModes: new Map([
            ['tools/test262/es2015-audit-evidence.json', '120000'],
          ]),
          message:
            'P0 replace-exact protected output tools/test262/es2015-audit-evidence.json must be a regular file in migration BASE',
        },
        {
          headFiles: missingProjectHeadFiles,
          message:
            'H0 project protected output tools/test262/upstream-subset.json is missing from migration HEAD',
        },
        {
          headFiles: new Map([
            ...migrationHeadFiles,
            [
              'tools/test262/upstream-subset.json',
              `${PRODUCTION_UPSTREAM_SUBSET_TEXT}drift`,
            ],
          ]),
          message:
            'H0 project protected output tools/test262/upstream-subset.json must remain byte-identical across roadmap-authority-migration',
        },
        {
          baseFiles: new Map([
            ...migrationBaseFiles,
            [
              'tools/test262/es2015-taxonomy.json',
              `${PRODUCTION_TAXONOMY_TEXT}drift`,
            ],
          ]),
          message:
            'H0 source.baseTaxonomySha256 does not match tools/test262/es2015-taxonomy.json in migration BASE',
        },
        {
          baseFiles: new Map([...migrationBaseFiles, [h0AddExactPath, '{}\n']]),
          message: `H0 add-exact evidence/output path ${h0AddExactPath} must be absent from migration BASE`,
        },
        {
          headFiles: new Map([...migrationHeadFiles, [h0AddExactPath, '{}\n']]),
          message: `H0 add-exact evidence/output path ${h0AddExactPath} must be absent from migration HEAD`,
        },
        {
          baseFiles: new Map([
            ...migrationBaseFiles,
            [ROADMAP_AUTHORITY_BASE_DESIGN_ADDENDUM_PATH, 'missing payload\n'],
          ]),
          message:
            'docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md must contain exactly one embedded roadmap authority DESIGN payload',
        },
        {
          baseFiles: new Map([
            ...migrationBaseFiles,
            [
              ROADMAP_AUTHORITY_BASE_DESIGN_ADDENDUM_PATH,
              repeatedDesignPayload,
            ],
            [ROADMAP_AUTHORITY_BASE_PLAN_ADDENDUM_PATH, repeatedPlanPayload],
          ]),
          message:
            'docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md must contain exactly one embedded roadmap authority DESIGN payload',
        },
        {
          baseFiles: new Map([
            ...migrationBaseFiles,
            [ROADMAP_AUTHORITY_BASE_DESIGN_ADDENDUM_PATH, badDesignSha],
          ]),
          message:
            'docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md embedded roadmap authority DESIGN payload sha256 does not match its exact bytes',
        },
        {
          baseFiles: new Map([
            ...migrationBaseFiles,
            [
              ROADMAP_AUTHORITY_BASE_DESIGN_ADDENDUM_PATH,
              `Fixture heading\n<!-- BEGIN ROADMAP AUTHORITY DESIGN sha256:${sha256(
                designText,
              )} -->\n${designText}`,
            ],
          ]),
          message:
            'docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md must contain exactly one embedded roadmap authority DESIGN payload',
        },
        {
          headFiles: new Map([
            ...migrationHeadFiles,
            [ROADMAP_AUTHORITY_DESIGN_PATH, '# altered design\n'],
          ]),
          message:
            'docs/superpowers/specs/2026-08-21-roadmap-authority-state-machine-design.md must match the embedded roadmap authority DESIGN payload from BASE',
        },
      ]) {
        const scenarioHeadManifestText =
          scenario.headManifestText ?? headManifestText;
        const scenarioMarker = parseRoadmapAuthorityMarker(
          scenario.markerText ??
            roadmapMigrationMarker({
              baseManifestText,
              checkerText,
              workflowText,
              headManifestText: scenarioHeadManifestText,
            }),
        );
        const scenarioDependencies = rangeCheckDependencies({
          changes: [
            { status: 'M', path: ES2015_PROVENANCE_FILE },
            { status: 'A', path: ROADMAP_AUTHORITY_DESIGN_PATH },
            { status: 'A', path: ROADMAP_AUTHORITY_PLAN_PATH },
          ],
          baseManifestText: scenario.baseManifestText ?? baseManifestText,
          headManifestText: scenarioHeadManifestText,
          baseFiles: scenario.baseFiles ?? migrationBaseFiles,
          baseModes: scenario.baseModes,
          headFiles: scenario.headFiles ?? migrationHeadFiles,
        });
        const error = await rejected(() =>
          validateRoadmapAuthorityMigration(
            scenario.baseManifestText ?? baseManifestText,
            scenarioHeadManifestText,
            {
              deps: scenarioDependencies,
              base: RANGE_BASE_SHA,
              head: RANGE_HEAD_SHA,
              marker: scenarioMarker,
              changes: [
                { status: 'M', path: ES2015_PROVENANCE_FILE, sourcePath: null },
                {
                  status: 'A',
                  path: ROADMAP_AUTHORITY_DESIGN_PATH,
                  sourcePath: null,
                },
                {
                  status: 'A',
                  path: ROADMAP_AUTHORITY_PLAN_PATH,
                  sourcePath: null,
                },
              ],
            },
          ),
        );
        assertSame(error.message, scenario.message);
      }

      const legacyMigrationDependencies = rangeCheckDependencies({
        changes: [{ status: 'M', path: 'docs/testing.md' }],
        baseManifestText: headManifestText,
        headManifestText,
      });
      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              rangeArguments('foundation-maintenance', {
                marker: maintenanceRangeMarker(),
              }),
              legacyMigrationDependencies,
            ),
          )
        ).message,
        'foundation-maintenance range is unavailable once the BASE provenance manifest is schema v3',
      );
    },
  },
  {
    name: 'ES2015 provenance roadmap authority preparation is code-keyed and append-only',
    run: async () => {
      const baseManifest = canonicalSchemaV3ManifestValue();
      const baseManifestText = renderEs2015ProvenanceManifest(baseManifest);
      const newAuthority = minimalRoadmapAuthority('M0', 79, 'pending');
      const headManifest = structuredClone(baseManifest);
      headManifest.roadmapAuthorities.splice(1, 0, newAuthority);
      const headManifestText = renderEs2015ProvenanceManifest(headManifest);
      const marker = parseRoadmapAuthorityMarker(
        roadmapPreparationMarker({
          baseManifestText,
          recordSha256: canonicalRoadmapAuthoritySha256(newAuthority),
        }),
      );
      const changes = [
        { status: 'M', path: ES2015_PROVENANCE_FILE, sourcePath: null },
        { status: 'M', path: 'docs/testing.md', sourcePath: null },
      ];
      assertSame(
        await validateRoadmapAuthorityPreparation(
          baseManifest,
          headManifest,
          marker,
          {
            deps: rangeCheckDependencies({
              changes: changes.map(({ status, path }) => ({ status, path })),
              baseManifestText,
              headManifestText,
            }),
            base: RANGE_BASE_SHA,
            head: RANGE_HEAD_SHA,
            changes,
          },
        ),
        0,
      );

      const appliedHead = structuredClone(headManifest);
      appliedHead.roadmapAuthorities[1].state = 'applied';
      const twoAppendHead = structuredClone(headManifest);
      twoAppendHead.roadmapAuthorities.splice(
        2,
        0,
        minimalRoadmapAuthority('N0', 80, 'pending'),
      );
      const changedExistingHead = structuredClone(headManifest);
      changedExistingHead.roadmapAuthorities[0].issue = 999;
      const deletedExistingHead = structuredClone(baseManifest);
      deletedExistingHead.roadmapAuthorities =
        deletedExistingHead.roadmapAuthorities.filter(
          (/** @type {Record<string, any>} */ authority) =>
            authority.code !== 'P0',
        );
      const unsortedHead = structuredClone(baseManifest);
      unsortedHead.roadmapAuthorities.push(newAuthority);
      const profileDriftHead = structuredClone(headManifest);
      profileDriftHead.rangeProfiles = [
        ...profileDriftHead.rangeProfiles,
      ].reverse();

      for (const scenario of [
        {
          headManifest: appliedHead,
          message:
            'M0 roadmap authority must be pending in HEAD during roadmap-authority-prepare',
        },
        {
          headManifest: twoAppendHead,
          message:
            'roadmap-authority-prepare must add exactly one new roadmap authority',
        },
        {
          headManifest: changedExistingHead,
          message:
            'H0 roadmap authority must remain canonical during roadmap-authority-prepare',
        },
        {
          headManifest: deletedExistingHead,
          message:
            'P0 roadmap authority is missing from HEAD during roadmap-authority-prepare',
        },
        {
          headManifest: unsortedHead,
          message:
            'tools/test262/es2015-provenance.json roadmapAuthorities must be code-unit sorted unique by code',
        },
        {
          headManifest: profileDriftHead,
          message:
            'tools/test262/es2015-provenance.json rangeProfiles must contain the approved profiles',
        },
      ]) {
        const scenarioHeadManifestText = prettyJson(scenario.headManifest);
        const error = await rejected(() =>
          validateRoadmapAuthorityPreparation(
            baseManifest,
            parseEs2015ProvenanceManifest(scenarioHeadManifestText),
            marker,
            {
              deps: rangeCheckDependencies({
                changes: [{ status: 'M', path: ES2015_PROVENANCE_FILE }],
                baseManifestText,
                headManifestText: scenarioHeadManifestText,
              }),
              base: RANGE_BASE_SHA,
              head: RANGE_HEAD_SHA,
              changes: [
                {
                  status: 'M',
                  path: ES2015_PROVENANCE_FILE,
                  sourcePath: null,
                },
              ],
            },
          ),
        );
        assertSame(error.message, scenario.message);
      }

      const fragmentDriftError = await rejected(() =>
        validateRoadmapAuthorityPreparation(
          baseManifest,
          headManifest,
          marker,
          {
            deps: rangeCheckDependencies({
              changes: [{ status: 'M', path: ES2015_PROVENANCE_FILE }],
              baseManifestText,
              headManifestText,
              headFiles: new Map([
                [`${PROVENANCE_DECISIONS_DIRECTORY}/UA.json`, 'drift\n'],
              ]),
            }),
            base: RANGE_BASE_SHA,
            head: RANGE_HEAD_SHA,
            changes: [
              {
                status: 'M',
                path: ES2015_PROVENANCE_FILE,
                sourcePath: null,
              },
            ],
          },
        ),
      );
      assertSame(
        fragmentDriftError.message,
        'tools/test262/es2015-provenance-decisions/UA.json must remain byte-identical across roadmap-authority-prepare',
      );

      const hashMismatchError = await rejected(() =>
        validateRoadmapAuthorityPreparation(
          baseManifest,
          headManifest,
          parseRoadmapAuthorityMarker(
            roadmapPreparationMarker({
              baseManifestText,
              recordSha256: 'f'.repeat(64),
            }),
          ),
          {
            deps: rangeCheckDependencies({
              changes: [{ status: 'M', path: ES2015_PROVENANCE_FILE }],
              baseManifestText,
              headManifestText,
            }),
            base: RANGE_BASE_SHA,
            head: RANGE_HEAD_SHA,
            changes: [
              {
                status: 'M',
                path: ES2015_PROVENANCE_FILE,
                sourcePath: null,
              },
            ],
          },
        ),
      );
      assertSame(
        hashMismatchError.message,
        'roadmap-authority-prepare marker record-sha256 does not match M0 roadmap authority',
      );

      for (const path of [CHECKER_PATH, 'docs/conformance.md']) {
        const error = await rejected(() =>
          validateRoadmapAuthorityPreparation(
            baseManifest,
            headManifest,
            marker,
            {
              deps: rangeCheckDependencies({
                changes: [
                  { status: 'M', path: ES2015_PROVENANCE_FILE },
                  { status: 'M', path },
                ],
                baseManifestText,
                headManifestText,
              }),
              base: RANGE_BASE_SHA,
              head: RANGE_HEAD_SHA,
              changes: [
                {
                  status: 'M',
                  path: ES2015_PROVENANCE_FILE,
                  sourcePath: null,
                },
                { status: 'M', path, sourcePath: null },
              ],
            },
          ),
        );
        assertSame(
          error.message,
          `roadmap-authority-prepare range forbids changed path ${path}`,
        );
      }

      const forbiddenAuthorityPaths = [
        ...new Set([
          ...provenance.PROVENANCE_RANGE_GATE_OWNER_PATHS,
          `${PROVENANCE_DECISIONS_DIRECTORY}/UX.json`,
        ]),
      ];
      for (const field of ['evidence', 'protectedOutputs']) {
        for (const path of forbiddenAuthorityPaths) {
          const forbiddenAuthority = /** @type {Record<string, any>} */ (
            minimalRoadmapAuthority('M0', 79, 'pending')
          );
          if (field === 'evidence') {
            forbiddenAuthority.evidence = [
              {
                path,
                sha256: '4'.repeat(64),
              },
            ];
          } else {
            forbiddenAuthority.protectedOutputs = [
              {
                path,
                operation: 'add-exact',
                baseSha256: null,
                headSha256: '3'.repeat(64),
                projectionSha256: null,
              },
            ];
          }
          const forbiddenHead = structuredClone(baseManifest);
          forbiddenHead.roadmapAuthorities.splice(1, 0, forbiddenAuthority);
          const forbiddenHeadText = prettyJson(forbiddenHead);
          const error = await rejected(() =>
            validateRoadmapAuthorityPreparation(
              baseManifest,
              forbiddenHead,
              marker,
              {
                deps: rangeCheckDependencies({
                  changes: [{ status: 'M', path: ES2015_PROVENANCE_FILE }],
                  baseManifestText,
                  headManifestText: forbiddenHeadText,
                }),
                base: RANGE_BASE_SHA,
                head: RANGE_HEAD_SHA,
                changes: [
                  {
                    status: 'M',
                    path: ES2015_PROVENANCE_FILE,
                    sourcePath: null,
                  },
                ],
              },
            ),
          );
          assertSame(
            error.message,
            `${ES2015_PROVENANCE_FILE} roadmapAuthorities[1].${field}[0].path must not claim provenance range gate-owner path ${path}`,
          );
        }
      }
    },
  },
  {
    name: 'ES2015 provenance roadmap authority consumption requires an exact BASE pending-to-applied transition',
    run: async () => {
      const baseManifest = canonicalSchemaV3ManifestValue();
      const headManifest = structuredClone(baseManifest);
      headManifest.roadmapAuthorities[0].state = 'applied';
      const baseManifestText = renderEs2015ProvenanceManifest(baseManifest);
      const headManifestText = renderEs2015ProvenanceManifest(headManifest);
      const baseAuthority = baseManifest.roadmapAuthorities[0];
      if (baseAuthority === undefined || baseAuthority.code !== 'H0') {
        throw new Error('expected H0 roadmap authority');
      }
      const marker = parseRoadmapAuthorityMarker(
        roadmapConsumptionMarker({
          code: baseAuthority.code,
          issue: baseAuthority.issue,
          sourcePathSha256: baseAuthority.source.pathSha256,
          sourceEntrySha256: baseAuthority.source.entryLedgerSha256,
        }),
      );
      assertSame(
        await validateRoadmapAuthorityConsumption(
          baseManifest,
          headManifest,
          marker,
          {
            deps: rangeCheckDependencies({
              changes: [
                { status: 'M', path: ES2015_PROVENANCE_FILE },
                { status: 'M', path: 'docs/conformance.md' },
              ],
              baseManifestText,
              headManifestText,
              validateRoadmapProtectedOutputs: async () =>
                roadmapProjectionEntries(baseAuthority.protectedOutputs),
            }),
            base: RANGE_BASE_SHA,
            head: RANGE_HEAD_SHA,
            changes: [
              {
                status: 'M',
                path: ES2015_PROVENANCE_FILE,
                sourcePath: null,
              },
              { status: 'M', path: 'docs/conformance.md', sourcePath: null },
            ],
          },
        ),
        0,
      );

      const headOnlyBase = structuredClone(baseManifest);
      headOnlyBase.roadmapAuthorities = headOnlyBase.roadmapAuthorities.filter(
        (/** @type {Record<string, any>} */ authority) =>
          authority.code !== 'H0',
      );
      const baseApplied = structuredClone(baseManifest);
      baseApplied.roadmapAuthorities[0].state = 'applied';
      const changedFieldHead = structuredClone(headManifest);
      changedFieldHead.roadmapAuthorities[0].issue = 700;
      const changedOtherAuthorityHead = structuredClone(headManifest);
      changedOtherAuthorityHead.roadmapAuthorities[1].issue = 701;

      for (const scenario of [
        {
          baseManifest: headOnlyBase,
          headManifest,
          message: 'H0 roadmap authority must exist in BASE',
        },
        {
          baseManifest: baseApplied,
          headManifest: headManifest,
          message: 'H0 roadmap authority must be pending in BASE',
        },
        {
          baseManifest,
          headManifest: baseManifest,
          message:
            'H0 roadmap authority must transition only from pending to applied',
        },
        {
          baseManifest,
          headManifest: changedFieldHead,
          message:
            'H0 roadmap authority must transition only from pending to applied',
        },
        {
          baseManifest,
          headManifest: changedOtherAuthorityHead,
          message:
            'P0 roadmap authority must remain canonical during roadmap-reclassification:H0',
        },
      ]) {
        const error = await rejected(() =>
          validateRoadmapAuthorityConsumption(
            scenario.baseManifest,
            scenario.headManifest,
            marker,
            {
              deps: rangeCheckDependencies({
                changes: [{ status: 'M', path: ES2015_PROVENANCE_FILE }],
                baseManifestText: renderEs2015ProvenanceManifest(
                  scenario.baseManifest,
                ),
                headManifestText: renderEs2015ProvenanceManifest(
                  scenario.headManifest,
                ),
                validateRoadmapProtectedOutputs: async () =>
                  roadmapProjectionEntries(baseAuthority.protectedOutputs),
              }),
              base: RANGE_BASE_SHA,
              head: RANGE_HEAD_SHA,
              changes: [
                {
                  status: 'M',
                  path: ES2015_PROVENANCE_FILE,
                  sourcePath: null,
                },
              ],
            },
          ),
        );
        assertSame(error.message, scenario.message);
      }

      for (const scenario of [
        {
          marker: roadmapConsumptionMarker({
            code: 'H0',
            issue: 770,
            sourcePathSha256: baseAuthority.source.pathSha256,
            sourceEntrySha256: baseAuthority.source.entryLedgerSha256,
          }),
          message:
            'roadmap-reclassification:H0 marker issue does not match H0 roadmap authority',
        },
        {
          marker: roadmapConsumptionMarker({
            code: 'H0',
            issue: baseAuthority.issue,
            profile: 'roadmap-reclassification:P0',
            sourcePathSha256: baseAuthority.source.pathSha256,
            sourceEntrySha256: baseAuthority.source.entryLedgerSha256,
          }),
          message:
            'roadmap-reclassification:P0 marker profile does not match H0 roadmap authority',
        },
        {
          marker: roadmapConsumptionMarker({
            code: 'H0',
            issue: baseAuthority.issue,
            sourcePathSha256: 'f'.repeat(64),
            sourceEntrySha256: baseAuthority.source.entryLedgerSha256,
          }),
          message:
            'roadmap-reclassification:H0 marker source-path-sha256 does not match H0 roadmap authority',
        },
        {
          marker: roadmapConsumptionMarker({
            code: 'H0',
            issue: baseAuthority.issue,
            sourcePathSha256: baseAuthority.source.pathSha256,
            sourceEntrySha256: 'f'.repeat(64),
          }),
          message:
            'roadmap-reclassification:H0 marker source-entry-sha256 does not match H0 roadmap authority',
        },
        {
          marker: roadmapConsumptionMarker({
            code: 'H0',
            issue: baseAuthority.issue,
            sourcePathSha256: baseAuthority.source.pathSha256,
            sourceEntrySha256: baseAuthority.source.entryLedgerSha256,
            protectedProjectionSha256: 'f'.repeat(64),
          }),
          message:
            'roadmap-reclassification:H0 marker protected-projection-sha256 does not match H0 roadmap authority',
        },
      ]) {
        const error = await rejected(() =>
          validateRoadmapAuthorityConsumption(
            baseManifest,
            headManifest,
            parseRoadmapAuthorityMarker(scenario.marker),
            {
              deps: rangeCheckDependencies({
                changes: [{ status: 'M', path: ES2015_PROVENANCE_FILE }],
                baseManifestText,
                headManifestText,
                validateRoadmapProtectedOutputs: async () =>
                  roadmapProjectionEntries(baseAuthority.protectedOutputs),
              }),
              base: RANGE_BASE_SHA,
              head: RANGE_HEAD_SHA,
              changes: [
                {
                  status: 'M',
                  path: ES2015_PROVENANCE_FILE,
                  sourcePath: null,
                },
              ],
            },
          ),
        );
        assertSame(error.message, scenario.message);
      }

      const emptyProjectionError = await rejected(() =>
        validateRoadmapAuthorityConsumption(
          baseManifest,
          headManifest,
          marker,
          {
            deps: rangeCheckDependencies({
              changes: [{ status: 'M', path: ES2015_PROVENANCE_FILE }],
              baseManifestText,
              headManifestText,
              validateRoadmapProtectedOutputs: async () => [],
            }),
            base: RANGE_BASE_SHA,
            head: RANGE_HEAD_SHA,
            changes: [
              {
                status: 'M',
                path: ES2015_PROVENANCE_FILE,
                sourcePath: null,
              },
            ],
          },
        ),
      );
      assertSame(
        emptyProjectionError.message,
        'roadmap-reclassification:H0 requires a nonempty protected projection result',
      );
    },
  },
  {
    name: 'ES2015 provenance consumption rejects gate-owner paths before malformed authority lookup',
    run: async () => {
      const baseManifest = canonicalSchemaV3ManifestValue();
      const headManifest = canonicalConsumedSchemaV3ManifestValue();
      const marker =
        /** @type {Parameters<typeof validateRoadmapProtectedOutputs>[2]['marker']} */ (
          parseRoadmapAuthorityMarker(
            roadmapConsumptionMarker({
              code: 'M0',
              issue: 79,
              profile: 'roadmap-reclassification:M0',
              sourcePathSha256: '2'.repeat(64),
              protectedProjectionSha256: '5'.repeat(64),
            }),
          )
        );
      const forbiddenAuthorityPaths = [
        ...new Set([
          ...provenance.PROVENANCE_RANGE_GATE_OWNER_PATHS,
          `${PROVENANCE_DECISIONS_DIRECTORY}/UX.json`,
        ]),
      ];
      for (const path of forbiddenAuthorityPaths) {
        const baseText = `malformed BASE ${path}\n`;
        const headText = `malformed HEAD ${path}\n`;
        const authority = /** @type {Record<string, any>} */ (
          minimalRoadmapAuthority('M0', 79, 'pending')
        );
        authority.protectedOutputs = [
          {
            path,
            operation: 'replace-exact',
            baseSha256: sha256(baseText),
            headSha256: sha256(headText),
            projectionSha256: null,
          },
        ];
        const changes = [
          {
            status: 'M',
            path: ES2015_PROVENANCE_FILE,
            sourcePath: null,
          },
          ...(path === ES2015_PROVENANCE_FILE
            ? []
            : [{ status: 'M', path, sourcePath: null }]),
        ];
        const error = await rejected(() =>
          validateRoadmapProtectedOutputs(authority, changes, {
            deps: rangeCheckDependencies({
              changes: changes.map(({ status, path: changedPath }) => ({
                status,
                path: changedPath,
              })),
              baseManifestText: renderEs2015ProvenanceManifest(baseManifest),
              headManifestText: renderEs2015ProvenanceManifest(headManifest),
              baseFiles: new Map([[path, baseText]]),
              headFiles: new Map([[path, headText]]),
            }),
            base: RANGE_BASE_SHA,
            head: RANGE_HEAD_SHA,
            baseManifest,
            headManifest,
            marker,
          }),
        );
        assertSame(
          error.message,
          `roadmap-reclassification:M0 roadmap authority protectedOutputs must not claim provenance range gate-owner path ${path}`,
        );
      }
    },
  },
  {
    name: 'ES2015 provenance validates protected outputs by artifact and rejects foreign generated changes',
    run: async () => {
      const fixture = syntheticRoadmapProjectionFixture();
      const marker =
        /** @type {Parameters<typeof validateRoadmapProtectedOutputs>[2]['marker']} */ (
          parseRoadmapAuthorityMarker(
            roadmapConsumptionMarker({
              code: fixture.code,
              issue: fixture.authority.issue,
              sourcePathSha256: fixture.authority.source.pathSha256,
              sourceEntrySha256: fixture.authority.source.entryLedgerSha256,
              protectedProjectionSha256:
                provenance.roadmapAggregateProjectionSha256(fixture.authority),
            }),
          )
        );
      const fixtureChanges = fixture.changes.map((change) => ({
        ...change,
        sourcePath: null,
      }));
      const deps = rangeCheckDependencies({
        changes: fixture.changes,
        baseManifestText: fixture.baseManifestText,
        headManifestText: fixture.headManifestText,
        baseFiles: fixture.baseFiles,
        headFiles: fixture.headFiles,
      });
      assertSame(
        json(
          await validateRoadmapProtectedOutputs(
            fixture.authority,
            fixtureChanges,
            {
              deps,
              base: RANGE_BASE_SHA,
              head: RANGE_HEAD_SHA,
              baseManifest: fixture.baseManifestValue,
              headManifest: fixture.headManifestValue,
              marker,
            },
          ),
        ),
        json(roadmapProjectionEntries(fixture.authority.protectedOutputs)),
      );

      const auditBaseText = requiredFixtureText(
        fixture.baseFiles,
        'tools/test262/es2015-audit-evidence.json',
      );
      const auditAuthority = {
        ...structuredClone(fixture.authority),
        protectedOutputs: [
          {
            path: 'tools/test262/es2015-audit-evidence.json',
            operation: 'project',
            baseSha256: sha256(auditBaseText),
            headSha256: null,
            projectionSha256: 'a'.repeat(64),
          },
        ],
      };
      const auditProtectedOutput = auditAuthority.protectedOutputs[0];
      assertSame(auditProtectedOutput !== undefined, true);
      const missingSourceAuditRootText = auditEvidenceTextWithoutPath(
        auditBaseText,
        'test/language/audit.js',
      );
      const incompleteSourceAuditVariantsText = auditEvidenceTextWithoutRecord(
        auditBaseText,
        'test/language/promotion.js',
        'strict',
      );
      const auditAuthorityWithBaseText = (/** @type {string} */ baseText) => ({
        ...structuredClone(auditAuthority),
        protectedOutputs: [
          {
            ...structuredClone(auditProtectedOutput),
            baseSha256: sha256(baseText),
          },
        ],
      });
      const auditDeps = rangeCheckDependencies({
        changes: [
          { status: 'M', path: 'tools/test262/es2015-audit-evidence.json' },
        ],
        baseManifestText: fixture.baseManifestText,
        headManifestText: fixture.headManifestText,
        baseFiles: fixture.baseFiles,
        headFiles: fixture.headFiles,
      });
      assertSame(
        json(
          await validateRoadmapProtectedOutputs(
            auditAuthority,
            [
              {
                status: 'M',
                path: 'tools/test262/es2015-audit-evidence.json',
                sourcePath: null,
              },
            ],
            {
              deps: auditDeps,
              base: RANGE_BASE_SHA,
              head: RANGE_HEAD_SHA,
              baseManifest: fixture.baseManifestValue,
              headManifest: fixture.headManifestValue,
              marker,
            },
          ),
        ),
        json([
          {
            path: 'tools/test262/es2015-audit-evidence.json',
            operation: 'project',
            sha256: 'a'.repeat(64),
          },
        ]),
      );

      const p0SubsetAuthority = {
        ...minimalRoadmapAuthority('P0', 77, 'pending'),
        protectedOutputs: [
          {
            path: 'tools/test262/upstream-subset.json',
            operation: 'project',
            baseSha256: sha256(P0_BASE_UPSTREAM_SUBSET_TEXT),
            headSha256: null,
            projectionSha256:
              '88d2521688bf3f036d2d94977914580d218fbc442bf38ef11e2cf9b8ce529a5f',
          },
        ],
      };
      const p0SubsetDeps = rangeCheckDependencies({
        changes: [{ status: 'M', path: 'tools/test262/upstream-subset.json' }],
        baseManifestText: fixture.baseManifestText,
        headManifestText: fixture.headManifestText,
        baseFiles: new Map([
          ['tools/test262/upstream-subset.json', P0_BASE_UPSTREAM_SUBSET_TEXT],
        ]),
        headFiles: new Map([
          [
            'tools/test262/upstream-subset.json',
            PRODUCTION_UPSTREAM_SUBSET_TEXT,
          ],
        ]),
      });
      assertSame(
        json(
          await validateRoadmapProtectedOutputs(
            p0SubsetAuthority,
            [
              {
                status: 'M',
                path: 'tools/test262/upstream-subset.json',
                sourcePath: null,
              },
            ],
            {
              deps: p0SubsetDeps,
              base: RANGE_BASE_SHA,
              head: RANGE_HEAD_SHA,
              baseManifest: fixture.baseManifestValue,
              headManifest: fixture.headManifestValue,
              marker,
            },
          ),
        ),
        json([
          {
            path: 'tools/test262/upstream-subset.json',
            operation: 'project',
            sha256:
              '88d2521688bf3f036d2d94977914580d218fbc442bf38ef11e2cf9b8ce529a5f',
          },
        ]),
      );

      const p0SelectionAuthority = {
        ...minimalRoadmapAuthority('P0', 77, 'pending'),
        protectedOutputs: [
          {
            path: 'tools/test262/es5-selection.json',
            operation: 'project',
            baseSha256: sha256(P0_BASE_ES5_SELECTION_TEXT),
            headSha256: null,
            projectionSha256:
              '2b0654600cf2159c828be9489826e85f3565a32b82019e2dfc2c41ec80870b38',
          },
        ],
      };
      const p0SelectionDeps = rangeCheckDependencies({
        changes: [{ status: 'M', path: 'tools/test262/es5-selection.json' }],
        baseManifestText: fixture.baseManifestText,
        headManifestText: fixture.headManifestText,
        baseFiles: new Map([
          ['tools/test262/es5-selection.json', P0_BASE_ES5_SELECTION_TEXT],
          ['tools/test262/es2015-taxonomy.json', P0_BASE_TAXONOMY_TEXT],
        ]),
        headFiles: new Map([
          ['tools/test262/es5-selection.json', PRODUCTION_ES5_SELECTION_TEXT],
          ['tools/test262/es2015-taxonomy.json', PRODUCTION_TAXONOMY_TEXT],
        ]),
      });
      assertSame(
        json(
          await validateRoadmapProtectedOutputs(
            p0SelectionAuthority,
            [
              {
                status: 'M',
                path: 'tools/test262/es5-selection.json',
                sourcePath: null,
              },
            ],
            {
              deps: p0SelectionDeps,
              base: RANGE_BASE_SHA,
              head: RANGE_HEAD_SHA,
              baseManifest: fixture.baseManifestValue,
              headManifest: fixture.headManifestValue,
              marker,
            },
          ),
        ),
        json([
          {
            path: 'tools/test262/es5-selection.json',
            operation: 'project',
            sha256:
              '2b0654600cf2159c828be9489826e85f3565a32b82019e2dfc2c41ec80870b38',
          },
        ]),
      );
      const fixtureTaxonomyAuthority = {
        ...structuredClone(fixture.authority),
        protectedOutputs: fixture.authority.protectedOutputs.filter(
          (entry) => entry.path === 'tools/test262/es2015-taxonomy.json',
        ),
      };
      const fixtureReportAuthority = {
        ...structuredClone(fixture.authority),
        protectedOutputs: fixture.authority.protectedOutputs.filter(
          (entry) => entry.path === 'docs/test262-report.jsonl',
        ),
      };
      const fixtureConformanceAuthority = {
        ...structuredClone(fixture.authority),
        protectedOutputs: fixture.authority.protectedOutputs.filter(
          (entry) => entry.path === 'docs/conformance.md',
        ),
      };
      const fixturePromotionAuthority = {
        ...structuredClone(fixture.authority),
        protectedOutputs: fixture.authority.protectedOutputs.filter(
          (entry) => entry.path === 'tools/test262/es2015-h1-promotion.json',
        ),
      };

      for (const scenario of [
        {
          authority: fixtureTaxonomyAuthority,
          deps: rangeCheckDependencies({
            changes: [
              { status: 'M', path: 'tools/test262/es2015-taxonomy.json' },
            ],
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: fixture.baseFiles,
            headFiles: new Map([
              ...fixture.headFiles,
              [
                'tools/test262/es2015-taxonomy.json',
                requiredFixtureText(
                  fixture.headFiles,
                  'tools/test262/es2015-taxonomy.json',
                ).replace(
                  'test/language/foreign.js',
                  'test/language/intruder.js',
                ),
              ],
            ]),
          }),
          changes: [
            {
              status: 'M',
              path: 'tools/test262/es2015-taxonomy.json',
              sourcePath: null,
            },
          ],
          message:
            'roadmap-reclassification:H1 protected output tools/test262/es2015-taxonomy.json changes a foreign classification test/language/intruder.js',
        },
        {
          authority: auditAuthority,
          deps: rangeCheckDependencies({
            changes: [
              { status: 'M', path: 'tools/test262/es2015-audit-evidence.json' },
            ],
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: fixture.baseFiles,
            headFiles: new Map([
              ...fixture.headFiles,
              [
                'tools/test262/es2015-audit-evidence.json',
                auditEvidenceTextWithoutRecord(
                  auditBaseText,
                  'test/language/promotion.js',
                  'strict',
                ),
              ],
            ]),
          }),
          changes: [
            {
              status: 'M',
              path: 'tools/test262/es2015-audit-evidence.json',
              sourcePath: null,
            },
          ],
          message:
            'roadmap-reclassification:H1 protected output tools/test262/es2015-audit-evidence.json is missing source record test/language/promotion.js (strict)',
        },
        {
          authority: auditAuthorityWithBaseText(missingSourceAuditRootText),
          deps: rangeCheckDependencies({
            changes: [
              { status: 'M', path: 'tools/test262/es2015-audit-evidence.json' },
            ],
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: new Map([
              ...fixture.baseFiles,
              [
                'tools/test262/es2015-audit-evidence.json',
                missingSourceAuditRootText,
              ],
            ]),
            headFiles: new Map([
              ...fixture.headFiles,
              [
                'tools/test262/es2015-audit-evidence.json',
                missingSourceAuditRootText,
              ],
            ]),
          }),
          changes: [
            {
              status: 'M',
              path: 'tools/test262/es2015-audit-evidence.json',
              sourcePath: null,
            },
          ],
          message:
            'roadmap-reclassification:H1 protected output tools/test262/es2015-audit-evidence.json is missing source audit root test/language/audit.js',
        },
        {
          authority: auditAuthorityWithBaseText(
            incompleteSourceAuditVariantsText,
          ),
          deps: rangeCheckDependencies({
            changes: [
              { status: 'M', path: 'tools/test262/es2015-audit-evidence.json' },
            ],
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: new Map([
              ...fixture.baseFiles,
              [
                'tools/test262/es2015-audit-evidence.json',
                incompleteSourceAuditVariantsText,
              ],
            ]),
            headFiles: new Map([
              ...fixture.headFiles,
              [
                'tools/test262/es2015-audit-evidence.json',
                incompleteSourceAuditVariantsText,
              ],
            ]),
          }),
          changes: [
            {
              status: 'M',
              path: 'tools/test262/es2015-audit-evidence.json',
              sourcePath: null,
            },
          ],
          message:
            'roadmap-reclassification:H1 protected output tools/test262/es2015-audit-evidence.json must represent exact source variants for test/language/promotion.js',
        },
        {
          authority: auditAuthority,
          deps: rangeCheckDependencies({
            changes: [
              { status: 'M', path: 'tools/test262/es2015-audit-evidence.json' },
            ],
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: fixture.baseFiles,
            headFiles: new Map([
              ...fixture.headFiles,
              [
                'tools/test262/es2015-audit-evidence.json',
                auditEvidenceTextWithoutRecord(
                  requiredFixtureText(
                    fixture.headFiles,
                    'tools/test262/es2015-audit-evidence.json',
                  ),
                  'test/language/foreign.js',
                  'non-strict',
                ),
              ],
            ]),
          }),
          changes: [
            {
              status: 'M',
              path: 'tools/test262/es2015-audit-evidence.json',
              sourcePath: null,
            },
          ],
          message:
            'roadmap-reclassification:H1 protected output tools/test262/es2015-audit-evidence.json must preserve foreign audit record test/language/foreign.js (non-strict)',
        },
        {
          authority: auditAuthority,
          deps: rangeCheckDependencies({
            changes: [
              { status: 'M', path: 'tools/test262/es2015-audit-evidence.json' },
            ],
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: fixture.baseFiles,
            headFiles: new Map([
              ...fixture.headFiles,
              [
                'tools/test262/es2015-audit-evidence.json',
                auditEvidenceTextWithAddedRecord(
                  requiredFixtureText(
                    fixture.headFiles,
                    'tools/test262/es2015-audit-evidence.json',
                  ),
                  createTestRecord({
                    file: 'test/language/intruder.js',
                    variant: 'non-strict',
                    status: 'passed',
                  }),
                ),
              ],
            ]),
          }),
          changes: [
            {
              status: 'M',
              path: 'tools/test262/es2015-audit-evidence.json',
              sourcePath: null,
            },
          ],
          message:
            'roadmap-reclassification:H1 protected output tools/test262/es2015-audit-evidence.json must preserve foreign audit record test/language/intruder.js (non-strict)',
        },
        {
          authority: p0SubsetAuthority,
          deps: rangeCheckDependencies({
            changes: [
              { status: 'M', path: 'tools/test262/upstream-subset.json' },
            ],
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: new Map([
              [
                'tools/test262/upstream-subset.json',
                P0_BASE_UPSTREAM_SUBSET_TEXT,
              ],
            ]),
            headFiles: new Map([
              [
                'tools/test262/upstream-subset.json',
                subsetTextWithExtraPath(PRODUCTION_UPSTREAM_SUBSET_TEXT),
              ],
            ]),
          }),
          changes: [
            {
              status: 'M',
              path: 'tools/test262/upstream-subset.json',
              sourcePath: null,
            },
          ],
          message:
            'roadmap-reclassification:H1 protected output tools/test262/upstream-subset.json must apply exactly the approved P0 subset delta',
        },
        {
          authority: p0SubsetAuthority,
          deps: rangeCheckDependencies({
            changes: [
              { status: 'M', path: 'tools/test262/upstream-subset.json' },
            ],
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: new Map([
              [
                'tools/test262/upstream-subset.json',
                P0_BASE_UPSTREAM_SUBSET_TEXT,
              ],
            ]),
            headFiles: new Map([
              [
                'tools/test262/upstream-subset.json',
                subsetTextWithReplacementPath(PRODUCTION_UPSTREAM_SUBSET_TEXT),
              ],
            ]),
          }),
          changes: [
            {
              status: 'M',
              path: 'tools/test262/upstream-subset.json',
              sourcePath: null,
            },
          ],
          message:
            'roadmap-reclassification:H1 protected output tools/test262/upstream-subset.json must apply exactly the approved P0 subset delta',
        },
        {
          authority: p0SelectionAuthority,
          deps: rangeCheckDependencies({
            changes: [
              { status: 'M', path: 'tools/test262/es5-selection.json' },
            ],
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: new Map([
              ['tools/test262/es5-selection.json', P0_BASE_ES5_SELECTION_TEXT],
              ['tools/test262/es2015-taxonomy.json', P0_BASE_TAXONOMY_TEXT],
            ]),
            headFiles: new Map([
              [
                'tools/test262/es5-selection.json',
                PRODUCTION_ES5_SELECTION_TEXT,
              ],
              [
                'tools/test262/es2015-taxonomy.json',
                driftedNewTargetTaxonomyText(PRODUCTION_TAXONOMY_TEXT),
              ],
            ]),
          }),
          changes: [
            {
              status: 'M',
              path: 'tools/test262/es5-selection.json',
              sourcePath: null,
            },
          ],
          message:
            'roadmap-reclassification:H1 protected output tools/test262/es5-selection.json must retain the taxonomy classification for test/staging/sm/class/newTargetEval.js',
        },
        {
          authority: fixtureTaxonomyAuthority,
          deps: rangeCheckDependencies({
            changes: [
              { status: 'M', path: 'tools/test262/es2015-taxonomy.json' },
            ],
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: fixture.baseFiles,
            headFiles: new Map([
              ...fixture.headFiles,
              [
                'tools/test262/es2015-taxonomy.json',
                taxonomyTextWithoutPath(
                  requiredFixtureText(
                    fixture.headFiles,
                    'tools/test262/es2015-taxonomy.json',
                  ),
                  'test/language/foreign.js',
                ),
              ],
            ]),
          }),
          changes: [
            {
              status: 'M',
              path: 'tools/test262/es2015-taxonomy.json',
              sourcePath: null,
            },
          ],
          message:
            'roadmap-reclassification:H1 protected output tools/test262/es2015-taxonomy.json must preserve foreign classification test/language/foreign.js',
        },
        {
          authority: fixtureTaxonomyAuthority,
          deps: rangeCheckDependencies({
            changes: [
              { status: 'M', path: 'tools/test262/es2015-taxonomy.json' },
            ],
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: fixture.baseFiles,
            headFiles: new Map([
              ...fixture.headFiles,
              [
                'tools/test262/es2015-taxonomy.json',
                taxonomyTextWithDuplicatePath(
                  requiredFixtureText(
                    fixture.headFiles,
                    'tools/test262/es2015-taxonomy.json',
                  ),
                  'test/language/promotion.js',
                ),
              ],
            ]),
          }),
          changes: [
            {
              status: 'M',
              path: 'tools/test262/es2015-taxonomy.json',
              sourcePath: null,
            },
          ],
          message:
            'roadmap-reclassification:H1 protected output tools/test262/es2015-taxonomy.json contains duplicate classification key test/language/promotion.js',
        },
        {
          authority: fixtureReportAuthority,
          deps: rangeCheckDependencies({
            changes: [{ status: 'M', path: 'docs/test262-report.jsonl' }],
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: fixture.baseFiles,
            headFiles: new Map([
              ...fixture.headFiles,
              [
                'docs/test262-report.jsonl',
                `${requiredFixtureText(fixture.headFiles, 'docs/test262-report.jsonl').trim()}\n${formatRecordLine(
                  createTestRecord({
                    file: 'test/language/intruder.js',
                    variant: 'non-strict',
                    status: 'passed',
                  }),
                )}\n`,
              ],
            ]),
          }),
          changes: [
            {
              status: 'M',
              path: 'docs/test262-report.jsonl',
              sourcePath: null,
            },
          ],
          message:
            'roadmap-reclassification:H1 protected output docs/test262-report.jsonl names a foreign selected record test/language/intruder.js',
        },
        {
          authority: fixtureConformanceAuthority,
          deps: rangeCheckDependencies({
            changes: [{ status: 'M', path: 'docs/conformance.md' }],
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: fixture.baseFiles,
            headFiles: new Map([
              ...fixture.headFiles,
              [
                'docs/conformance.md',
                requiredFixtureText(
                  fixture.headFiles,
                  'docs/conformance.md',
                ).replace(
                  'Manual prose outside the generated block.',
                  'mutated prose',
                ),
              ],
            ]),
          }),
          changes: [
            {
              status: 'M',
              path: 'docs/conformance.md',
              sourcePath: null,
            },
          ],
          message:
            'roadmap-reclassification:H1 protected output docs/conformance.md must preserve manual prose outside the generated block',
        },
        {
          authority: fixture.authority,
          deps: rangeCheckDependencies({
            changes: [
              ...fixture.changes,
              { status: 'M', path: 'tools/test262/es2015-h1-unknown.json' },
            ],
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: fixture.baseFiles,
            headFiles: new Map([
              ...fixture.headFiles,
              ['tools/test262/es2015-h1-unknown.json', '{}\n'],
            ]),
          }),
          changes: [
            ...fixtureChanges,
            {
              status: 'M',
              path: 'tools/test262/es2015-h1-unknown.json',
              sourcePath: null,
            },
          ],
          message:
            'roadmap-reclassification:H1 protected outputs include unexpected generated path tools/test262/es2015-h1-unknown.json',
        },
        {
          authority: fixture.authority,
          deps: rangeCheckDependencies({
            changes: [
              ...fixture.changes,
              { status: 'M', path: 'tools/test262/es5-selection.json' },
            ],
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: new Map([
              ...fixture.baseFiles,
              ['tools/test262/es5-selection.json', P0_BASE_ES5_SELECTION_TEXT],
            ]),
            headFiles: new Map([
              ...fixture.headFiles,
              [
                'tools/test262/es5-selection.json',
                PRODUCTION_ES5_SELECTION_TEXT,
              ],
            ]),
          }),
          changes: [
            ...fixtureChanges,
            {
              status: 'M',
              path: 'tools/test262/es5-selection.json',
              sourcePath: null,
            },
          ],
          message:
            'roadmap-reclassification:H1 protected outputs include unexpected protected path tools/test262/es5-selection.json',
        },
        {
          authority: fixturePromotionAuthority,
          deps: rangeCheckDependencies({
            changes: [
              { status: 'A', path: 'tools/test262/es2015-h1-promotion.json' },
            ],
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: fixture.baseFiles,
            headFiles: new Map([
              ...fixture.headFiles,
              ['tools/test262/es2015-h1-promotion.json', '../../outside\n'],
            ]),
            headModes: new Map([
              ['tools/test262/es2015-h1-promotion.json', '120000'],
            ]),
          }),
          changes: [
            {
              status: 'A',
              path: 'tools/test262/es2015-h1-promotion.json',
              sourcePath: null,
            },
          ],
          message:
            'roadmap-reclassification:H1 protected output tools/test262/es2015-h1-promotion.json must be a regular file in HEAD',
        },
      ]) {
        const error = await rejected(() =>
          validateRoadmapProtectedOutputs(
            scenario.authority,
            scenario.changes,
            {
              deps: scenario.deps,
              base: RANGE_BASE_SHA,
              head: RANGE_HEAD_SHA,
              baseManifest: fixture.baseManifestValue,
              headManifest: fixture.headManifestValue,
              marker,
            },
          ),
        );
        assertSame(error.message, scenario.message);
      }
    },
  },
  {
    name: 'ES2015 provenance validates protected outputs atomically during roadmap authority consumption',
    run: async () => {
      const fixture = syntheticRoadmapProjectionFixture();
      const marker =
        /** @type {Parameters<typeof validateRoadmapProtectedOutputs>[2]['marker']} */ (
          parseRoadmapAuthorityMarker(
            roadmapConsumptionMarker({
              code: fixture.code,
              issue: fixture.authority.issue,
              sourcePathSha256: fixture.authority.source.pathSha256,
              sourceEntrySha256: fixture.authority.source.entryLedgerSha256,
              protectedProjectionSha256:
                provenance.roadmapAggregateProjectionSha256(fixture.authority),
            }),
          )
        );
      const changes = fixture.changes.map((change) => ({
        ...change,
        sourcePath: null,
      }));
      assertSame(
        await validateRoadmapAuthorityConsumption(
          fixture.baseManifestValue,
          fixture.headManifestValue,
          marker,
          {
            deps: rangeCheckDependencies({
              changes: fixture.changes,
              baseManifestText: fixture.baseManifestText,
              headManifestText: fixture.headManifestText,
              baseFiles: fixture.baseFiles,
              headFiles: fixture.headFiles,
            }),
            base: RANGE_BASE_SHA,
            head: RANGE_HEAD_SHA,
            changes,
          },
        ),
        0,
      );
      assertSame(
        (fixture.headFiles.get('docs/test262-report.jsonl') ?? '').includes(
          '"features":[]',
        ),
        false,
      );

      const featureFixture = syntheticRoadmapProjectionFixture(
        Object.freeze(['Reflect', 'Symbol.toStringTag']),
      );
      const featureMarker =
        /** @type {Parameters<typeof validateRoadmapProtectedOutputs>[2]['marker']} */ (
          parseRoadmapAuthorityMarker(
            roadmapConsumptionMarker({
              code: featureFixture.code,
              issue: featureFixture.authority.issue,
              sourcePathSha256: featureFixture.authority.source.pathSha256,
              sourceEntrySha256:
                featureFixture.authority.source.entryLedgerSha256,
              protectedProjectionSha256:
                provenance.roadmapAggregateProjectionSha256(
                  featureFixture.authority,
                ),
            }),
          )
        );
      const featureChanges = featureFixture.changes.map((change) => ({
        ...change,
        sourcePath: null,
      }));
      assertSame(
        await validateRoadmapAuthorityConsumption(
          featureFixture.baseManifestValue,
          featureFixture.headManifestValue,
          featureMarker,
          {
            deps: rangeCheckDependencies({
              changes: featureFixture.changes,
              baseManifestText: featureFixture.baseManifestText,
              headManifestText: featureFixture.headManifestText,
              baseFiles: featureFixture.baseFiles,
              headFiles: featureFixture.headFiles,
            }),
            base: RANGE_BASE_SHA,
            head: RANGE_HEAD_SHA,
            changes: featureChanges,
          },
        ),
        0,
      );
      const featureReportText = featureFixture.headFiles.get(
        'docs/test262-report.jsonl',
      );
      if (featureReportText === undefined) {
        throw new Error('expected feature fixture report text');
      }
      assertSame(
        featureReportText.includes(
          '"features":["Reflect","Symbol.toStringTag"]',
        ),
        true,
      );

      const missingFeatureReport = featureReportText.replace(
        '"features":["Reflect","Symbol.toStringTag"]',
        '"features":["Reflect"]',
      );
      const reorderedFeatureReport = featureReportText.replace(
        '"features":["Reflect","Symbol.toStringTag"]',
        '"features":["Symbol.toStringTag","Reflect"]',
      );
      for (const scenario of [
        {
          headFiles: new Map([
            ...featureFixture.headFiles,
            ['docs/test262-report.jsonl', missingFeatureReport],
          ]),
          message:
            'roadmap-reclassification:H1 protected output docs/test262-report.jsonl must match the canonical selected report',
        },
        {
          headFiles: new Map([
            ...featureFixture.headFiles,
            ['docs/test262-report.jsonl', reorderedFeatureReport],
          ]),
          message:
            'roadmap-reclassification:H1 protected output docs/test262-report.jsonl must match the canonical selected report',
        },
      ]) {
        const error = await rejected(() =>
          validateRoadmapAuthorityConsumption(
            featureFixture.baseManifestValue,
            featureFixture.headManifestValue,
            featureMarker,
            {
              deps: rangeCheckDependencies({
                changes: featureFixture.changes,
                baseManifestText: featureFixture.baseManifestText,
                headManifestText: featureFixture.headManifestText,
                baseFiles: featureFixture.baseFiles,
                headFiles: scenario.headFiles,
              }),
              base: RANGE_BASE_SHA,
              head: RANGE_HEAD_SHA,
              changes: featureChanges,
            },
          ),
        );
        assertSame(error.message, scenario.message);
      }

      const missingMetadataError = assertThrows(
        () =>
          reconstructGenericPromotedAuditRecords({
            profile: 'roadmap-reclassification:H1',
            outputPath: 'docs/test262-report.jsonl',
            promotionByPath: new Map(),
            records: [
              createTestRecord({
                file: 'test/language/promotion.js',
                variant: 'non-strict',
                status: 'passed',
              }),
            ],
          }),
        Es2015ProvenanceCheckError,
      );
      assertSame(
        missingMetadataError.message,
        'roadmap-reclassification:H1 protected output docs/test262-report.jsonl promotion metadata is missing test/language/promotion.js',
      );

      for (const scenario of [
        {
          changes: fixture.changes.filter(
            (change) => change.path !== 'docs/test262-report.jsonl',
          ),
          message:
            'roadmap-reclassification:H1 protected output docs/test262-report.jsonl must change exactly once',
        },
        {
          changes: [
            ...fixture.changes,
            { status: 'M', path: 'tools/test262/es2015-h1-unknown.json' },
          ],
          headFiles: new Map([
            ...fixture.headFiles,
            ['tools/test262/es2015-h1-unknown.json', '{}\n'],
          ]),
          message:
            'roadmap-reclassification:H1 protected outputs include unexpected generated path tools/test262/es2015-h1-unknown.json',
        },
        {
          changes: fixture.changes,
          headFiles: new Map(
            [...fixture.headFiles].filter(
              ([path]) => path !== 'tools/test262/es2015-h1-promotion.json',
            ),
          ),
          message:
            'roadmap-reclassification:H1 protected output tools/test262/es2015-h1-promotion.json must be added in HEAD',
        },
      ]) {
        const error = await rejected(() =>
          validateRoadmapAuthorityConsumption(
            fixture.baseManifestValue,
            fixture.headManifestValue,
            marker,
            {
              deps: rangeCheckDependencies({
                changes: scenario.changes,
                baseManifestText: fixture.baseManifestText,
                headManifestText: fixture.headManifestText,
                baseFiles: fixture.baseFiles,
                headFiles: scenario.headFiles ?? fixture.headFiles,
              }),
              base: RANGE_BASE_SHA,
              head: RANGE_HEAD_SHA,
              changes: scenario.changes.map((change) => ({
                ...change,
                sourcePath: null,
              })),
            },
          ),
        );
        assertSame(error.message, scenario.message);
      }
    },
  },
  {
    name: 'ES2015 provenance accepts the exact reconciled H0 protected projection and rejects immutable input drift',
    run: async () => {
      const fixture = exactAppliedH0ProjectionFixture();
      const marker =
        /** @type {Parameters<typeof validateRoadmapProtectedOutputs>[2]['marker']} */ (
          parseRoadmapAuthorityMarker(
            roadmapConsumptionMarker({
              code: 'H0',
              issue: fixture.authority.issue,
              base: H0_BOOTSTRAP_BASE_SHA,
              sourcePathSha256: fixture.authority.source.pathSha256,
              sourceEntrySha256: fixture.authority.source.entryLedgerSha256,
              protectedProjectionSha256:
                provenance.roadmapAggregateProjectionSha256(fixture.authority),
            }),
          )
        );
      const changes = fixture.changes.map((change) => ({
        ...change,
        sourcePath: null,
      }));
      const dependencies = rangeCheckDependencies({
        changes: fixture.changes,
        baseSha: H0_BOOTSTRAP_BASE_SHA,
        headSha: RANGE_HEAD_SHA,
        baseManifestText: fixture.baseManifestText,
        headManifestText: fixture.headManifestText,
        baseFiles: fixture.baseFiles,
        headFiles: fixture.headFiles,
        historicalFiles: fixture.historicalFiles,
      });
      /** @type {string[]} */
      const headReads = [];
      const readGitFile = dependencies.readGitFile;
      dependencies.readGitFile = async (revision, path) => {
        if (revision === RANGE_HEAD_SHA) headReads.push(path);
        return readGitFile(revision, path);
      };
      assertSame(
        json(
          await validateRoadmapProtectedOutputs(fixture.authority, changes, {
            deps: dependencies,
            base: H0_BOOTSTRAP_BASE_SHA,
            head: RANGE_HEAD_SHA,
            baseManifest: fixture.baseManifestValue,
            headManifest: fixture.headManifestValue,
            marker,
          }),
        ),
        json(roadmapProjectionEntries(fixture.authority.protectedOutputs)),
      );
      const permittedHeadReads = new Set([
        'tools/test262/features.json',
        ...fixture.authority.evidence.map(
          (/** @type {{ path: string }} */ entry) => entry.path,
        ),
        ...fixture.authority.protectedOutputs.map(
          (/** @type {{ path: string }} */ entry) => entry.path,
        ),
      ]);
      for (const path of headReads) {
        assertSame(permittedHeadReads.has(path), true, path);
      }
      for (const path of H0_EVIDENCE_PATHS) {
        assertSame(
          headReads.filter((candidate) => candidate === path).length,
          1,
          path,
        );
      }

      const invalidEvidenceFiles = new Map(fixture.headFiles);
      invalidEvidenceFiles.set(
        'tools/test262/es2015-h0-paths.json',
        `${requiredFixtureText(
          fixture.headFiles,
          'tools/test262/es2015-h0-paths.json',
        )}{`,
      );
      const hashError = await rejected(() =>
        validateRoadmapProtectedOutputs(fixture.authority, changes, {
          deps: rangeCheckDependencies({
            changes: fixture.changes,
            baseSha: H0_BOOTSTRAP_BASE_SHA,
            headSha: RANGE_HEAD_SHA,
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: fixture.baseFiles,
            headFiles: invalidEvidenceFiles,
            historicalFiles: fixture.historicalFiles,
          }),
          base: H0_BOOTSTRAP_BASE_SHA,
          head: RANGE_HEAD_SHA,
          baseManifest: fixture.baseManifestValue,
          headManifest: fixture.headManifestValue,
          marker,
        }),
      );
      assertSame(
        hashError.message,
        'roadmap-reclassification:H0 evidence tools/test262/es2015-h0-paths.json HEAD bytes do not match H0 roadmap authority',
      );

      const staleOwnerMapFiles = new Map(fixture.headFiles);
      const staleOwnerMapText = `${requiredFixtureText(
        fixture.headFiles,
        'tools/test262/es2015-h0-owner-map.json',
      )} `;
      staleOwnerMapFiles.set(
        'tools/test262/es2015-h0-owner-map.json',
        staleOwnerMapText,
      );
      const staleOwnerMapAuthority = structuredClone(fixture.authority);
      staleOwnerMapAuthority.evidence.find(
        (/** @type {{ path: string }} */ entry) =>
          entry.path === 'tools/test262/es2015-h0-owner-map.json',
      ).sha256 = sha256(staleOwnerMapText);
      staleOwnerMapAuthority.protectedOutputs.find(
        (/** @type {{ path: string }} */ entry) =>
          entry.path === 'tools/test262/es2015-h0-owner-map.json',
      ).headSha256 = sha256(staleOwnerMapText);
      const ownerMapError = await rejected(() =>
        validateRoadmapProtectedOutputs(staleOwnerMapAuthority, changes, {
          deps: rangeCheckDependencies({
            changes: fixture.changes,
            baseSha: H0_BOOTSTRAP_BASE_SHA,
            headSha: RANGE_HEAD_SHA,
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: fixture.baseFiles,
            headFiles: staleOwnerMapFiles,
            historicalFiles: fixture.historicalFiles,
          }),
          base: H0_BOOTSTRAP_BASE_SHA,
          head: RANGE_HEAD_SHA,
          baseManifest: fixture.baseManifestValue,
          headManifest: fixture.headManifestValue,
          marker,
        }),
      );
      assertSame(
        ownerMapError.message,
        'tools/test262/es2015-h0-disposition.json owner-map evidence is stale',
      );

      const driftedHeadFiles = new Map(fixture.headFiles);
      driftedHeadFiles.set(
        'tools/test262/features.json',
        `${requiredFixtureText(
          fixture.headFiles,
          'tools/test262/features.json',
        )} `,
      );
      const error = await rejected(() =>
        validateRoadmapProtectedOutputs(fixture.authority, changes, {
          deps: rangeCheckDependencies({
            changes: fixture.changes,
            baseSha: H0_BOOTSTRAP_BASE_SHA,
            headSha: RANGE_HEAD_SHA,
            baseManifestText: fixture.baseManifestText,
            headManifestText: fixture.headManifestText,
            baseFiles: fixture.baseFiles,
            headFiles: driftedHeadFiles,
            historicalFiles: fixture.historicalFiles,
          }),
          base: H0_BOOTSTRAP_BASE_SHA,
          head: RANGE_HEAD_SHA,
          baseManifest: fixture.baseManifestValue,
          headManifest: fixture.headManifestValue,
          marker,
        }),
      );
      assertSame(
        error.message,
        'roadmap-reclassification:H0 immutable projection input tools/test262/features.json must remain byte-identical between BASE and HEAD',
      );
    },
  },
  {
    name: 'H0 bootstrap leaves trust-root authorities, fragments, evidence, and protected data byte-identical',
    run: () => {
      const unchangedPaths = [
        '.github/workflows/ci.yml',
        'tools/ci/pipeline.js',
        ES2015_PROVENANCE_FILE,
        ...ES2015_PROVENANCE_DECISION_CODES.map(
          (code) => `${PROVENANCE_DECISIONS_DIRECTORY}/${code}.json`,
        ),
        ...H0_EVIDENCE_PATHS,
        ...H0_PROTECTED_OUTPUT_PATHS,
        ...provenance.P0_APPLIED_ROADMAP_AUTHORITY.protectedOutputs.map(
          (/** @type {{ path: string }} */ output) => output.path,
        ),
      ];
      for (const path of new Set(unchangedPaths)) {
        const baseBytes = readOptionalGitFixtureBuffer(
          H0_BOOTSTRAP_BASE_SHA,
          path,
        );
        const headBytes = readOptionalGitFixtureBuffer(
          H0_REPAIRED_BASE_SHA,
          path,
        );
        assertSame(
          baseBytes === null
            ? headBytes === null
            : headBytes !== null && baseBytes.equals(headBytes),
          true,
          path,
        );
      }
      const baseManifest = JSON.parse(
        readGitFixtureText(H0_BOOTSTRAP_BASE_SHA, ES2015_PROVENANCE_FILE),
      );
      const headManifest = JSON.parse(
        readGitFixtureText(H0_REPAIRED_BASE_SHA, ES2015_PROVENANCE_FILE),
      );
      assertSame(
        json(baseManifest.roadmapAuthorities),
        json(headManifest.roadmapAuthorities),
      );
    },
  },
  {
    name: 'ES2015 HEAD ordinary range preserves the missing-marker failure for the H0 bootstrap repair',
    run: async () => {
      const dependencies = h0BootstrapRepairRangeDependencies({
        body: 'H0 bootstrap repair without a marker.\n',
      });
      assertSame(
        (
          await rejected(() =>
            provenanceCheck(h0BootstrapRepairCiArgs(), dependencies),
          )
        ).message,
        'A provenance-owned PR range requires one authoritative provenance marker',
      );
    },
  },
  {
    name: 'ES2015 HEAD ordinary range accepts only the exact H0 bootstrap repair marker',
    run: async () => {
      assertSame(
        await provenanceCheck(
          h0BootstrapRepairCiArgs(),
          h0BootstrapRepairRangeDependencies(),
        ),
        0,
      );
    },
  },
  {
    name: 'ES2015 H0 bootstrap repair marker pins the exact BASE and manifest bytes',
    run: async () => {
      for (const scenario of [
        {
          args: h0BootstrapRepairCiArgs(RANGE_BASE_SHA),
          dependencies: h0BootstrapRepairRangeDependencies({
            baseSha: RANGE_BASE_SHA,
          }),
          message: `H0 bootstrap repair range requires base ${H0_BOOTSTRAP_BASE_SHA}`,
        },
        {
          args: h0BootstrapRepairCiArgs(),
          dependencies: h0BootstrapRepairRangeDependencies({
            body: h0BootstrapRepairMarker({ base: 'c'.repeat(40) }),
          }),
          message: `H0 bootstrap repair marker base must be ${H0_BOOTSTRAP_BASE_SHA}`,
        },
        {
          args: h0BootstrapRepairCiArgs(),
          dependencies: h0BootstrapRepairRangeDependencies({
            body: h0BootstrapRepairMarker({
              baseManifestSha256: 'f'.repeat(64),
            }),
          }),
          message:
            'H0 bootstrap repair marker base-manifest-sha256 does not match BASE manifest bytes',
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
    },
  },
  {
    name: 'ES2015 H0 bootstrap repair range is closed to the nine reviewed paths and requires all tooling',
    run: async () => {
      const foreignPath = 'docs/unreviewed-bootstrap.md';
      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              h0BootstrapRepairCiArgs(),
              h0BootstrapRepairRangeDependencies({
                changes: [
                  ...H0_BOOTSTRAP_REPAIR_CHANGES,
                  { status: 'M', path: foreignPath },
                ],
              }),
            ),
          )
        ).message,
        `H0 bootstrap repair range includes unexpected path ${foreignPath}`,
      );

      for (const path of H0_BOOTSTRAP_REPAIR_PRODUCTION_PATHS) {
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                h0BootstrapRepairCiArgs(),
                h0BootstrapRepairRangeDependencies({
                  changes: H0_BOOTSTRAP_REPAIR_CHANGES.filter(
                    (change) => change.path !== path,
                  ),
                }),
              ),
            )
          ).message,
          `H0 bootstrap repair range requires changed path ${path}`,
        );
      }

      for (const scenario of [
        {
          change: { status: 'D', path: 'docs/testing.md' },
          message:
            'H0 bootstrap repair range forbids deleted path docs/testing.md',
        },
        {
          change: {
            status: 'R100',
            sourcePath: 'docs/testing.md',
            path: 'docs/testing-copy.md',
          },
          message:
            'H0 bootstrap repair range forbids rename docs/testing.md -> docs/testing-copy.md',
        },
        {
          change: {
            status: 'C100',
            sourcePath: 'docs/testing.md',
            path: 'docs/testing-copy.md',
          },
          message:
            'H0 bootstrap repair range forbids copy docs/testing.md -> docs/testing-copy.md',
        },
      ]) {
        const changes = H0_BOOTSTRAP_REPAIR_CHANGES.filter(
          (change) => change.path !== 'docs/testing.md',
        );
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                h0BootstrapRepairCiArgs(),
                h0BootstrapRepairRangeDependencies({
                  changes: [...changes, scenario.change],
                }),
              ),
            )
          ).message,
          scenario.message,
        );
      }
    },
  },
  {
    name: 'ES2015 H0 bootstrap repair range rejects every protected data drift',
    run: async () => {
      for (const path of H0_BOOTSTRAP_REPAIR_IMMUTABLE_PATHS) {
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                h0BootstrapRepairCiArgs(),
                h0BootstrapRepairRangeDependencies({
                  headFiles: new Map([[path, `drifted ${path}\n`]]),
                }),
              ),
            )
          ).message,
          `H0 bootstrap repair path ${path} must remain byte-identical between BASE and HEAD`,
          path,
        );
      }
    },
  },
  {
    name: 'ES2015 H0 bootstrap repair marker is exact, unique, lowercase, and pull-request-only',
    run: async () => {
      const marker = h0BootstrapRepairMarker();
      for (const body of [
        `${marker}\n${marker}`,
        `${maintenanceRangeMarker()}\n${marker}`,
      ]) {
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                h0BootstrapRepairCiArgs(),
                h0BootstrapRepairRangeDependencies({ body }),
              ),
            )
          ).message,
          'PR body must contain exactly one authoritative provenance marker',
        );
      }

      for (const body of [
        marker.replace('es2015-h0', 'es2015-H0'),
        marker.replace('03a4cca', '03A4CCA'),
        marker.replace(
          H0_BOOTSTRAP_REPAIR_BASE_MANIFEST_SHA256,
          H0_BOOTSTRAP_REPAIR_BASE_MANIFEST_SHA256.toUpperCase(),
        ),
        marker.replace(' -->', '  -->'),
        `prefix ${marker}`,
      ]) {
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                h0BootstrapRepairCiArgs(),
                h0BootstrapRepairRangeDependencies({ body }),
              ),
            )
          ).message,
          'A provenance-owned PR range requires one authoritative provenance marker',
          body,
        );
      }

      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              h0BootstrapRepairCiArgs(),
              h0BootstrapRepairRangeDependencies({
                eventName: 'pull_request_target',
              }),
            ),
          )
        ).message,
        'A provenance-owned PR range requires one authoritative provenance marker',
      );
      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              [
                '--check-range',
                `--base=${H0_BOOTSTRAP_BASE_SHA}`,
                `--head=${RANGE_HEAD_SHA}`,
                '--profile=h0-bootstrap-repair',
                `--marker=${marker}`,
              ],
              h0BootstrapRepairRangeDependencies(),
            ),
          )
        ).message,
        'Provenance PR marker is not authoritative',
      );
    },
  },
  {
    name: 'ES2015 M1 authority repair accepts the exact ordinary-PR marker and literal corrected identities',
    run: async () => {
      assertSame(
        await provenanceCheck(
          m1AuthorityRepairCiArgs(),
          m1AuthorityRepairRangeDependencies(),
        ),
        0,
      );

      const checker =
        await import('../../tools/test262/es2015-provenance-check.js');
      assertSame(typeof checker.parseM1AuthorityRepairMarker, 'function');
      const markerText = m1AuthorityRepairMarker();
      assertSame(
        json(checker.parseM1AuthorityRepairMarker(markerText)),
        json({
          kind: 'm1-authority-repair',
          text: markerText,
          code: 'M1',
          issue: 80,
          base: M1_AUTHORITY_REPAIR_BASE,
          baseManifestSha256: M1_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256,
          baseRecordSha256: M1_AUTHORITY_REPAIR_BASE_RECORD_SHA256,
          headManifestSha256: M1_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256,
          headRecordSha256: M1_AUTHORITY_REPAIR_HEAD_RECORD_SHA256,
        }),
      );

      const baseManifest = JSON.parse(m1AuthorityRepairBaseManifestText());
      const baseM1 = baseManifest.roadmapAuthorities.find(
        (/** @type {{ code: string }} */ authority) => authority.code === 'M1',
      );
      const headManifestText = m1AuthorityRepairHeadManifestText();
      const headManifest = JSON.parse(headManifestText);
      const headM1 = headManifest.roadmapAuthorities.find(
        (/** @type {{ code: string }} */ authority) => authority.code === 'M1',
      );
      assertSame(
        sha256(m1AuthorityRepairBaseManifestText()),
        M1_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256,
      );
      assertSame(
        canonicalRoadmapAuthoritySha256(baseM1),
        M1_AUTHORITY_REPAIR_BASE_RECORD_SHA256,
      );
      assertSame(
        sha256(headManifestText),
        M1_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256,
      );
      assertSame(
        canonicalRoadmapAuthoritySha256(headM1),
        M1_AUTHORITY_REPAIR_HEAD_RECORD_SHA256,
      );
      assertSame(headM1.state, 'pending');
      assertSame(headM1.evidence.length, 6);
      assertSame(headM1.protectedOutputs.length, 12);
    },
  },
  {
    name: 'ES2015 M1 authority repair marker rejects duplicate, mixed, malformed, target, and local activation',
    run: async () => {
      const checker =
        await import('../../tools/test262/es2015-provenance-check.js');
      assertSame(typeof checker.parseM1AuthorityRepairMarker, 'function');
      const marker = m1AuthorityRepairMarker();
      for (const body of [
        `${marker}\n${marker}`,
        `${marker}\n${roadmapPreparationMarker()}`,
      ]) {
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                m1AuthorityRepairCiArgs(),
                m1AuthorityRepairRangeDependencies({ body }),
              ),
            )
          ).message,
          'PR body must contain exactly one authoritative provenance marker',
        );
      }

      const malformedMarkers = [
        marker.replace(
          M1_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256,
          M1_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256.toUpperCase(),
        ),
        marker.replace(/\n/gu, '\r\n'),
        marker.replace('code:M1\nissue:80', 'issue:80\ncode:M1'),
        marker.replace('code:M1\n', ''),
        marker.replace('code:M1\n', 'code:M1\ncode:M1\n'),
        marker.replace('code:M1\n', 'code:M1\nextra:no\n'),
        marker.replace('code:M1', 'code: M1'),
        `prefix ${marker}`,
        `${marker} suffix`,
      ];
      for (const malformed of malformedMarkers) {
        const parseError = assertThrows(
          () => checker.parseM1AuthorityRepairMarker(malformed),
          Es2015ProvenanceCheckError,
        );
        assertSame(
          parseError.message,
          'M1 authority repair marker is not authoritative',
          malformed,
        );
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                m1AuthorityRepairCiArgs(),
                m1AuthorityRepairRangeDependencies({ body: malformed }),
              ),
            )
          ).message,
          'A provenance-owned PR range requires one authoritative provenance marker',
          malformed,
        );
      }

      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              m1AuthorityRepairCiArgs(),
              m1AuthorityRepairRangeDependencies({
                eventName: 'pull_request_target',
              }),
            ),
          )
        ).message,
        'A provenance-owned PR range requires one authoritative provenance marker',
      );
      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              [
                '--check-range',
                `--base=${M1_AUTHORITY_REPAIR_BASE}`,
                `--head=${RANGE_HEAD_SHA}`,
                '--profile=m1-authority-repair',
                `--marker=${marker}`,
              ],
              m1AuthorityRepairRangeDependencies(),
            ),
          )
        ).message,
        'Provenance PR marker is not authoritative',
      );
    },
  },
  {
    name: 'ES2015 M1 authority repair validator independently requires an ordinary pull_request event',
    run: async () => {
      const checker =
        await import('../../tools/test262/es2015-provenance-check.js');
      assertSame(typeof checker.parseM1AuthorityRepairMarker, 'function');
      assertSame(typeof checker.validateM1AuthorityRepairRange, 'function');
      const marker = checker.parseM1AuthorityRepairMarker(
        m1AuthorityRepairMarker(),
      );
      for (const eventName of ['pull_request_target', 'push', null]) {
        const deps = m1AuthorityRepairRangeDependencies({ eventName });
        assertSame(
          (
            await rejected(() =>
              checker.validateM1AuthorityRepairRange(marker, {
                deps,
                base: M1_AUTHORITY_REPAIR_BASE,
                head: RANGE_HEAD_SHA,
                changes: m1AuthorityRepairContextChanges(),
                baseManifestText: m1AuthorityRepairBaseManifestText(),
              }),
            )
          ).message,
          'M1 authority repair requires an ordinary pull_request event',
          String(eventName),
        );
      }
    },
  },
  {
    name: 'ES2015 M1 authority repair pins exact BASE commit, merge base, manifest, checker, and record',
    run: async () => {
      for (const scenario of [
        {
          dependencies: m1AuthorityRepairRangeDependencies({
            baseSha: RANGE_BASE_SHA,
          }),
          args: m1AuthorityRepairCiArgs(RANGE_BASE_SHA),
          message: `M1 authority repair range requires base ${M1_AUTHORITY_REPAIR_BASE}`,
        },
        {
          dependencies: m1AuthorityRepairRangeDependencies({
            body: m1AuthorityRepairMarker({ base: RANGE_BASE_SHA }),
          }),
          args: m1AuthorityRepairCiArgs(),
          message: `M1 authority repair marker base must be ${M1_AUTHORITY_REPAIR_BASE}`,
        },
        {
          dependencies: m1AuthorityRepairRangeDependencies({
            body: m1AuthorityRepairMarker({
              baseManifestSha256: 'a'.repeat(64),
            }),
          }),
          args: m1AuthorityRepairCiArgs(),
          message: `M1 authority repair marker base-manifest-sha256 must be ${M1_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256}`,
        },
        {
          dependencies: m1AuthorityRepairRangeDependencies({
            body: m1AuthorityRepairMarker({
              baseRecordSha256: 'a'.repeat(64),
            }),
          }),
          args: m1AuthorityRepairCiArgs(),
          message: `M1 authority repair marker base-record-sha256 must be ${M1_AUTHORITY_REPAIR_BASE_RECORD_SHA256}`,
        },
        {
          dependencies: m1AuthorityRepairRangeDependencies({
            baseFiles: new Map([
              [
                'tools/test262/es2015-provenance-check.js',
                'drifted BASE checker\n',
              ],
            ]),
          }),
          args: m1AuthorityRepairCiArgs(),
          message: `M1 authority repair BASE checker sha256 must be ${M1_AUTHORITY_REPAIR_BASE_CHECKER_SHA256}`,
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

      const checker =
        await import('../../tools/test262/es2015-provenance-check.js');
      const deps = m1AuthorityRepairRangeDependencies({
        mergeBase: RANGE_BASE_SHA,
      });
      assertSame(
        (
          await rejected(() =>
            checker.validateM1AuthorityRepairRange(
              checker.parseM1AuthorityRepairMarker(m1AuthorityRepairMarker()),
              {
                deps,
                base: M1_AUTHORITY_REPAIR_BASE,
                head: RANGE_HEAD_SHA,
                changes: m1AuthorityRepairContextChanges(),
                baseManifestText: m1AuthorityRepairBaseManifestText(),
              },
            ),
          )
        ).message,
        `M1 authority repair merge base must be ${M1_AUTHORITY_REPAIR_BASE}`,
      );
    },
  },
  {
    name: 'ES2015 M1 authority repair range requires the exact six canonical regular-file changes',
    run: async () => {
      for (const required of M1_AUTHORITY_REPAIR_CHANGES) {
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                m1AuthorityRepairCiArgs(),
                m1AuthorityRepairRangeDependencies({
                  changes: M1_AUTHORITY_REPAIR_CHANGES.filter(
                    (change) => change.path !== required.path,
                  ),
                }),
              ),
            )
          ).message,
          `M1 authority repair range requires ${required.status} ${required.path}`,
          required.path,
        );
      }

      const foreignPath =
        'docs/superpowers/specs/2026-08-22-m1-authority-repair-design.md';
      const replacements = [
        {
          name: 'foreign path',
          removedPath: 'docs/testing.md',
          change: { status: 'M', path: foreignPath },
          message: `M1 authority repair range includes unexpected path ${foreignPath}`,
        },
        {
          name: 'duplicate path',
          change: M1_AUTHORITY_REPAIR_CHANGES[0],
          message:
            'M1 authority repair range repeats changed path tools/test262/es2015-provenance-check.js',
        },
        {
          name: 'rename',
          removedPath: 'docs/testing.md',
          change: {
            status: 'R100',
            sourcePath: 'docs/testing.md',
            path: 'docs/testing-copy.md',
          },
          message:
            'M1 authority repair range forbids rename docs/testing.md -> docs/testing-copy.md',
        },
        {
          name: 'copy',
          removedPath: 'docs/testing.md',
          change: {
            status: 'C100',
            sourcePath: 'docs/testing.md',
            path: 'docs/testing-copy.md',
          },
          message:
            'M1 authority repair range forbids copy docs/testing.md -> docs/testing-copy.md',
        },
        {
          name: 'delete',
          removedPath: 'docs/testing.md',
          change: { status: 'D', path: 'docs/testing.md' },
          message:
            'M1 authority repair range forbids deleted path docs/testing.md',
        },
        {
          name: 'wrong modified status',
          removedPath: 'tools/test262/es2015-provenance-check.js',
          change: {
            status: 'A',
            path: 'tools/test262/es2015-provenance-check.js',
          },
          message:
            'M1 authority repair range requires M tools/test262/es2015-provenance-check.js',
        },
        {
          name: 'wrong added status',
          removedPath:
            'docs/superpowers/specs/2026-08-23-m1-authority-repair-design.md',
          change: {
            status: 'M',
            path: 'docs/superpowers/specs/2026-08-23-m1-authority-repair-design.md',
          },
          message:
            'M1 authority repair range requires A docs/superpowers/specs/2026-08-23-m1-authority-repair-design.md',
        },
        {
          name: 'encoded alias',
          removedPath: 'tools/test262/es2015-provenance-check.js',
          change: {
            status: 'M',
            path: 'tools/test262/%65s2015-provenance-check.js',
          },
          message:
            'M1 authority repair range path must be canonical: tools/test262/%65s2015-provenance-check.js',
        },
        {
          name: 'path traversal',
          removedPath: 'tools/test262/es2015-provenance-check.js',
          change: {
            status: 'M',
            path: 'tools/test262/../test262/es2015-provenance-check.js',
          },
          message:
            'M1 authority repair range path must be canonical: tools/test262/../test262/es2015-provenance-check.js',
        },
      ];
      for (const scenario of replacements) {
        const changes =
          scenario.removedPath === undefined
            ? [...M1_AUTHORITY_REPAIR_CHANGES]
            : M1_AUTHORITY_REPAIR_CHANGES.filter(
                (change) => change.path !== scenario.removedPath,
              );
        changes.push(scenario.change);
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                m1AuthorityRepairCiArgs(),
                m1AuthorityRepairRangeDependencies({ changes }),
              ),
            )
          ).message,
          scenario.message,
          scenario.name,
        );
      }

      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              m1AuthorityRepairCiArgs(),
              m1AuthorityRepairRangeDependencies({
                headModes: new Map([['docs/testing.md', '120000']]),
              }),
            ),
          )
        ).message,
        'M1 authority repair range path docs/testing.md must be a regular file in HEAD',
      );
    },
  },
  {
    name: 'ES2015 M1 authority repair pins marker and computed HEAD identities to immutable literals',
    run: async () => {
      for (const scenario of [
        {
          body: m1AuthorityRepairMarker({
            headManifestSha256: 'a'.repeat(64),
          }),
          message: `M1 authority repair marker head-manifest-sha256 must be ${M1_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256}`,
        },
        {
          body: m1AuthorityRepairMarker({
            headRecordSha256: 'a'.repeat(64),
          }),
          message: `M1 authority repair marker head-record-sha256 must be ${M1_AUTHORITY_REPAIR_HEAD_RECORD_SHA256}`,
        },
      ]) {
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                m1AuthorityRepairCiArgs(),
                m1AuthorityRepairRangeDependencies({ body: scenario.body }),
              ),
            )
          ).message,
          scenario.message,
        );
      }

      const alternateManifestText = mutatedM1AuthorityRepairHeadManifestText(
        (_manifest, m1) => {
          m1.protectedOutputs.find(
            (/** @type {{ path: string }} */ output) =>
              output.path === 'docs/conformance.md',
          ).projectionSha256 = 'a'.repeat(64);
        },
      );
      const alternateManifest = JSON.parse(alternateManifestText);
      const alternateM1 = alternateManifest.roadmapAuthorities.find(
        (/** @type {{ code: string }} */ authority) => authority.code === 'M1',
      );
      const alternateManifestSha256 = sha256(alternateManifestText);
      const alternateRecordSha256 =
        canonicalRoadmapAuthoritySha256(alternateM1);
      const error = await rejected(() =>
        provenanceCheck(
          m1AuthorityRepairCiArgs(),
          m1AuthorityRepairRangeDependencies({
            body: m1AuthorityRepairMarker({
              headManifestSha256: alternateManifestSha256,
              headRecordSha256: alternateRecordSha256,
            }),
            headManifestText: alternateManifestText,
          }),
        ),
      );
      assertSame(
        error.message,
        `M1 authority repair marker head-manifest-sha256 must be ${M1_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256}`,
      );
      assertSame(
        error.message.includes(M1_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256),
        true,
      );
      assertSame(error.message.includes('does not match HEAD'), false);
    },
  },
  {
    name: 'ES2015 M1 authority repair rejects every pending-record structural drift',
    run: async () => {
      const scenarios = [
        {
          name: 'M1 applied',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ m1,
          ) => {
            m1.state = 'applied';
          },
          messagePart: 'must keep M1 pending',
        },
        {
          name: 'M1 removed',
          mutate: (/** @type {Record<string, any>} */ manifest) => {
            manifest.roadmapAuthorities = manifest.roadmapAuthorities.filter(
              (/** @type {{ code: string }} */ authority) =>
                authority.code !== 'M1',
            );
          },
          messagePart: 'must preserve roadmap authority count and order',
        },
        {
          name: 'M1 reordered',
          mutate: (/** @type {Record<string, any>} */ manifest) => {
            const index = manifest.roadmapAuthorities.findIndex(
              (/** @type {{ code: string }} */ authority) =>
                authority.code === 'M1',
            );
            [
              manifest.roadmapAuthorities[index - 1],
              manifest.roadmapAuthorities[index],
            ] = [
              manifest.roadmapAuthorities[index],
              manifest.roadmapAuthorities[index - 1],
            ];
          },
          messagePart:
            'roadmapAuthorities must be code-unit sorted unique by code',
        },
        {
          name: 'another authority changed',
          mutate: (/** @type {Record<string, any>} */ manifest) => {
            const authority = manifest.roadmapAuthorities.find(
              (/** @type {{ code: string }} */ candidate) =>
                candidate.code !== 'M1',
            );
            authority.source.rootCount += 1;
          },
          messagePart: 'roadmap authority must remain canonical',
        },
        {
          name: 'source drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ m1,
          ) => {
            m1.source.rootCount += 1;
          },
          messagePart: 'must preserve M1 source',
        },
        {
          name: 'reconciliation drift',
          mutate: (
            /** @type {Record<string, any>} */ manifest,
            /** @type {Record<string, any>} */ m1,
          ) => {
            m1.reconciliation = structuredClone(
              manifest.roadmapAuthorities.find(
                (/** @type {{ reconciliation: unknown }} */ authority) =>
                  authority.reconciliation !== null,
              ).reconciliation,
            );
          },
          messagePart: 'must preserve M1 reconciliation',
        },
        {
          name: 'destination drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ m1,
          ) => {
            m1.destinations[0].issue += 1;
          },
          messagePart: 'must map to the exact approved issue',
        },
        {
          name: 'non-promotion evidence drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ m1,
          ) => {
            m1.evidence[0].sha256 = 'a'.repeat(64);
          },
          messagePart: 'must preserve M1 evidence',
        },
        {
          name: 'wrong promotion evidence',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ m1,
          ) => {
            m1.evidence.find(
              (/** @type {{ path: string }} */ entry) =>
                entry.path === 'tools/test262/es2015-m1-promotion.json',
            ).sha256 = 'a'.repeat(64);
          },
          messagePart: 'requires the exact corrected M1 promotion evidence',
        },
        {
          name: 'wrong promotion head hash',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ m1,
          ) => {
            m1.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === 'tools/test262/es2015-m1-promotion.json',
            ).headSha256 = 'a'.repeat(64);
          },
          messagePart: 'requires the exact corrected M1 promotion output',
        },
        {
          name: 'wrong project commitment',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ m1,
          ) => {
            m1.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === 'docs/conformance.md',
            ).projectionSha256 = 'a'.repeat(64);
          },
          messagePart:
            'requires the exact corrected M1 project output docs/conformance.md',
        },
        {
          name: 'changed project base hash',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ m1,
          ) => {
            m1.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === 'docs/conformance.md',
            ).baseSha256 = 'a'.repeat(64);
          },
          messagePart:
            'requires the exact corrected M1 project output docs/conformance.md',
        },
        {
          name: 'wrong audit exact hash',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ m1,
          ) => {
            m1.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === 'tools/test262/es2015-audit-evidence.json',
            ).headSha256 = 'a'.repeat(64);
          },
          messagePart:
            'must preserve M1 protected output tools/test262/es2015-audit-evidence.json',
        },
        {
          name: 'missing selection output',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ m1,
          ) => {
            m1.protectedOutputs = m1.protectedOutputs.filter(
              (/** @type {{ path: string }} */ output) =>
                output.path !== 'tools/test262/es5-selection.json',
            );
          },
          messagePart: 'requires the exact M1 selection replacement output',
        },
        {
          name: 'extra selection output',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ m1,
          ) => {
            m1.protectedOutputs.push({
              ...structuredClone(M1_AUTHORITY_REPAIR_SELECTION_OUTPUT),
              path: 'tools/test262/es5-selection-copy.json',
            });
            m1.protectedOutputs.sort(
              (
                /** @type {{ path: string }} */ left,
                /** @type {{ path: string }} */ right,
              ) =>
                left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
            );
          },
          messagePart: 'requires exactly 12 M1 protected outputs',
        },
        {
          name: 'mutated selection output',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ m1,
          ) => {
            m1.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === 'tools/test262/es5-selection.json',
            ).headSha256 = 'a'.repeat(64);
          },
          messagePart: 'requires the exact M1 selection replacement output',
        },
      ];
      for (const scenario of scenarios) {
        const error = await rejected(() =>
          provenanceCheck(
            m1AuthorityRepairCiArgs(),
            m1AuthorityRepairRangeDependencies({
              headManifestText: mutatedM1AuthorityRepairHeadManifestText(
                scenario.mutate,
              ),
            }),
          ),
        );
        assertSame(
          error.message.includes(scenario.messagePart),
          true,
          `${scenario.name}: ${error.message}`,
        );
      }

      const noncanonical = mutatedM1AuthorityRepairHeadManifestText(() => {}, {
        canonical: false,
      });
      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              m1AuthorityRepairCiArgs(),
              m1AuthorityRepairRangeDependencies({
                headManifestText: noncanonical,
              }),
            ),
          )
        ).message,
        'M1 authority repair head provenance manifest is not canonical',
      );
    },
  },
  {
    name: 'ES2015 M1 authority repair enforces every derived immutable byte and mode',
    run: async () => {
      const baseManifest = JSON.parse(m1AuthorityRepairBaseManifestText());
      const immutablePaths = m1AuthorityRepairImmutablePaths(baseManifest);
      const baseFiles = m1AuthorityRepairBaseFiles();
      for (const path of immutablePaths) {
        const headFiles = new Map([
          [
            path,
            baseFiles.has(path)
              ? `${baseFiles.get(path)}\nM1 repair drift\n`
              : `forbidden future M1 repair file ${path}\n`,
          ],
        ]);
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                m1AuthorityRepairCiArgs(),
                m1AuthorityRepairRangeDependencies({ headFiles }),
              ),
            )
          ).message,
          `M1 authority repair immutable path ${path} must remain byte-identical between BASE and HEAD`,
          path,
        );
      }

      const modePath = '.github/workflows/ci.yml';
      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              m1AuthorityRepairCiArgs(),
              m1AuthorityRepairRangeDependencies({
                headModes: new Map([[modePath, '100755']]),
              }),
            ),
          )
        ).message,
        `M1 authority repair immutable path ${modePath} must retain its exact regular-file mode between BASE and HEAD`,
      );
    },
  },
  {
    name: 'ES2015 P1C authority repair parses the exact marker and rejects malformed or ineligible activation',
    run: async () => {
      const checker =
        await import('../../tools/test262/es2015-provenance-check.js');
      assertSame(typeof checker.parseP1CAuthorityRepairMarker, 'function');
      const marker = p1cAuthorityRepairMarker();
      assertSame(sha256(`${marker}\n`), P1C_AUTHORITY_REPAIR_MARKER_SHA256);
      assertSame(
        json(checker.parseP1CAuthorityRepairMarker(marker)),
        json({
          kind: 'p1c-authority-repair',
          text: marker,
          code: 'P1C',
          issue: 116,
          base: P1C_AUTHORITY_REPAIR_BASE,
          baseManifestSha256: P1C_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256,
          baseRecordSha256: P1C_AUTHORITY_REPAIR_BASE_RECORD_SHA256,
          headManifestSha256: P1C_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256,
          headRecordSha256: P1C_AUTHORITY_REPAIR_HEAD_RECORD_SHA256,
        }),
      );

      for (const body of [
        `${marker}\n${marker}`,
        `${marker}\n${roadmapPreparationMarker()}`,
      ]) {
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                p1cAuthorityRepairCiArgs(),
                p1cAuthorityRepairRangeDependencies({ body }),
              ),
            )
          ).message,
          'PR body must contain exactly one authoritative provenance marker',
        );
      }

      const malformedMarkers = [
        marker.replace(
          P1C_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256,
          P1C_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256.toUpperCase(),
        ),
        marker.replace(/\n/gu, '\r\n'),
        marker.replace('code:P1C\nissue:116', 'issue:116\ncode:P1C'),
        marker.replace('code:P1C\n', ''),
        marker.replace('code:P1C\n', 'code:P1C\ncode:P1C\n'),
        marker.replace('code:P1C\n', 'code:P1C\nextra:no\n'),
        marker.replace('code:P1C', 'code: P1C'),
        `prefix ${marker}`,
        `${marker} suffix`,
      ];
      for (const malformed of malformedMarkers) {
        const parseError = assertThrows(
          () => checker.parseP1CAuthorityRepairMarker(malformed),
          Es2015ProvenanceCheckError,
        );
        assertSame(
          parseError.message,
          'P1C authority repair marker is not authoritative',
          malformed,
        );
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                p1cAuthorityRepairCiArgs(),
                p1cAuthorityRepairRangeDependencies({ body: malformed }),
              ),
            )
          ).message,
          'A provenance-owned PR range requires one authoritative provenance marker',
          malformed,
        );
      }

      for (const eventName of ['pull_request_target', 'push', null]) {
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                p1cAuthorityRepairCiArgs(),
                p1cAuthorityRepairRangeDependencies({ eventName }),
              ),
            )
          ).message,
          eventName === 'pull_request_target'
            ? 'A provenance-owned PR range requires one authoritative provenance marker'
            : 'Provenance PR range checking requires a pull_request event',
          String(eventName),
        );
      }

      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              [
                '--check-range',
                `--base=${P1C_AUTHORITY_REPAIR_BASE}`,
                `--head=${RANGE_HEAD_SHA}`,
                '--profile=p1c-authority-repair',
                `--marker=${marker}`,
              ],
              p1cAuthorityRepairRangeDependencies(),
            ),
          )
        ).message,
        'Provenance PR marker is not authoritative',
      );
    },
  },
  {
    name: 'ES2015 P1C authority repair validator independently requires an ordinary pull_request event',
    run: async () => {
      const checker =
        await import('../../tools/test262/es2015-provenance-check.js');
      assertSame(typeof checker.parseP1CAuthorityRepairMarker, 'function');
      assertSame(typeof checker.validateP1CAuthorityRepairRange, 'function');
      const marker = checker.parseP1CAuthorityRepairMarker(
        p1cAuthorityRepairMarker(),
      );
      for (const eventName of ['pull_request_target', 'push', null]) {
        const deps = p1cAuthorityRepairRangeDependencies({ eventName });
        assertSame(
          (
            await rejected(() =>
              checker.validateP1CAuthorityRepairRange(marker, {
                deps,
                base: P1C_AUTHORITY_REPAIR_BASE,
                head: RANGE_HEAD_SHA,
                changes: p1cAuthorityRepairContextChanges(),
                baseManifestText: p1cAuthorityRepairBaseManifestText(),
              }),
            )
          ).message,
          'P1C authority repair requires an ordinary pull_request event',
          String(eventName),
        );
      }
    },
  },
  {
    name: 'ES2015 P1C authority repair accepts the exact six-path pending-authority correction',
    run: async () => {
      const checker =
        await import('../../tools/test262/es2015-provenance-check.js');
      assertSame(typeof checker.validateP1CAuthorityRepairRange, 'function');
      assertSame(
        typeof checker.assertP1CAuthorityRepairImmutableBytes,
        'function',
      );
      assertSame(
        await provenanceCheck(
          p1cAuthorityRepairCiArgs(),
          p1cAuthorityRepairRangeDependencies(),
        ),
        0,
      );

      const baseManifestText = p1cAuthorityRepairBaseManifestText();
      const headManifestText = p1cAuthorityRepairPendingManifestText();
      const baseManifest = JSON.parse(baseManifestText);
      const headManifest = JSON.parse(headManifestText);
      const baseP1C = baseManifest.roadmapAuthorities.find(
        (/** @type {{ code: string }} */ authority) => authority.code === 'P1C',
      );
      const headP1C = headManifest.roadmapAuthorities.find(
        (/** @type {{ code: string }} */ authority) => authority.code === 'P1C',
      );
      assertSame(
        readFileSyncText(
          new URL(`../../${ES2015_PROVENANCE_FILE}`, import.meta.url),
          'utf8',
        ),
        headManifestText,
      );
      assertSame(
        sha256(baseManifestText),
        P1C_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256,
      );
      assertSame(
        sha256(readGitFixtureText(P1C_AUTHORITY_REPAIR_BASE, CHECKER_PATH)),
        P1C_AUTHORITY_REPAIR_BASE_CHECKER_SHA256,
      );
      assertSame(
        canonicalRoadmapAuthoritySha256(baseP1C),
        P1C_AUTHORITY_REPAIR_BASE_RECORD_SHA256,
      );
      assertSame(
        sha256(headManifestText),
        P1C_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256,
      );
      assertSame(
        canonicalRoadmapAuthoritySha256(headP1C),
        P1C_AUTHORITY_REPAIR_HEAD_RECORD_SHA256,
      );
      assertSame(headP1C.state, 'pending');
      assertSame(headP1C.evidence.length, 6);
      assertSame(headP1C.protectedOutputs.length, 11);
    },
  },
  {
    name: 'ES2015 P1C authority repair pins the exact BASE and corrected marker identities',
    run: async () => {
      for (const scenario of [
        {
          dependencies: p1cAuthorityRepairRangeDependencies({
            baseSha: RANGE_BASE_SHA,
          }),
          args: p1cAuthorityRepairCiArgs(RANGE_BASE_SHA),
          message: `P1C authority repair range requires base ${P1C_AUTHORITY_REPAIR_BASE}`,
        },
        {
          dependencies: p1cAuthorityRepairRangeDependencies({
            body: p1cAuthorityRepairMarker({ base: RANGE_BASE_SHA }),
          }),
          args: p1cAuthorityRepairCiArgs(),
          message: `P1C authority repair marker base must be ${P1C_AUTHORITY_REPAIR_BASE}`,
        },
        {
          dependencies: p1cAuthorityRepairRangeDependencies({
            body: p1cAuthorityRepairMarker({
              baseManifestSha256: 'a'.repeat(64),
            }),
          }),
          args: p1cAuthorityRepairCiArgs(),
          message: `P1C authority repair marker base-manifest-sha256 must be ${P1C_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256}`,
        },
        {
          dependencies: p1cAuthorityRepairRangeDependencies({
            body: p1cAuthorityRepairMarker({
              baseRecordSha256: 'a'.repeat(64),
            }),
          }),
          args: p1cAuthorityRepairCiArgs(),
          message: `P1C authority repair marker base-record-sha256 must be ${P1C_AUTHORITY_REPAIR_BASE_RECORD_SHA256}`,
        },
        {
          dependencies: p1cAuthorityRepairRangeDependencies({
            baseManifestText: `${p1cAuthorityRepairBaseManifestText()}\n`,
          }),
          args: p1cAuthorityRepairCiArgs(),
          message: `P1C authority repair BASE manifest sha256 must be ${P1C_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256}`,
        },
        {
          dependencies: p1cAuthorityRepairRangeDependencies({
            baseFiles: new Map([[CHECKER_PATH, 'drifted BASE checker\n']]),
          }),
          args: p1cAuthorityRepairCiArgs(),
          message: `P1C authority repair BASE checker sha256 must be ${P1C_AUTHORITY_REPAIR_BASE_CHECKER_SHA256}`,
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

      const checker =
        await import('../../tools/test262/es2015-provenance-check.js');
      const deps = p1cAuthorityRepairRangeDependencies({
        mergeBase: RANGE_BASE_SHA,
      });
      assertSame(
        (
          await rejected(() =>
            checker.validateP1CAuthorityRepairRange(
              checker.parseP1CAuthorityRepairMarker(p1cAuthorityRepairMarker()),
              {
                deps,
                base: P1C_AUTHORITY_REPAIR_BASE,
                head: RANGE_HEAD_SHA,
                changes: p1cAuthorityRepairContextChanges(),
                baseManifestText: p1cAuthorityRepairBaseManifestText(),
              },
            ),
          )
        ).message,
        `P1C authority repair merge base must be ${P1C_AUTHORITY_REPAIR_BASE}`,
      );
    },
  },
  {
    name: 'ES2015 P1C authority repair range requires the exact six canonical regular-file changes',
    run: async () => {
      for (const required of P1C_AUTHORITY_REPAIR_CHANGES) {
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                p1cAuthorityRepairCiArgs(),
                p1cAuthorityRepairRangeDependencies({
                  changes: P1C_AUTHORITY_REPAIR_CHANGES.filter(
                    (change) => change.path !== required.path,
                  ),
                }),
              ),
            )
          ).message,
          `P1C authority repair range requires ${required.status} ${required.path}`,
          required.path,
        );
      }

      const foreignPath =
        'docs/superpowers/specs/2026-08-23-p1c-authority-repair-design.md';
      const replacements = [
        {
          name: 'alternate repair doc',
          removedPath: 'docs/testing.md',
          change: { status: 'M', path: foreignPath },
          message: `P1C authority repair range includes unexpected path ${foreignPath}`,
        },
        ...[
          '.github/workflows/ci.yml',
          'tools/ci/pipeline.js',
          'tools/test262/es2015-p1c-baseline.json',
          'tools/test262/es2015-audit-evidence.json',
          'src/index.js',
        ].map((path) => ({
          name: `foreign ${path}`,
          removedPath: 'docs/testing.md',
          change: { status: 'M', path },
          message: `P1C authority repair range includes unexpected path ${path}`,
        })),
        {
          name: 'duplicate path',
          change: P1C_AUTHORITY_REPAIR_CHANGES[0],
          message:
            'P1C authority repair range repeats changed path tools/test262/es2015-provenance-check.js',
        },
        {
          name: 'rename',
          removedPath: 'docs/testing.md',
          change: {
            status: 'R100',
            sourcePath: 'docs/testing.md',
            path: 'docs/testing-copy.md',
          },
          message:
            'P1C authority repair range forbids rename docs/testing.md -> docs/testing-copy.md',
        },
        {
          name: 'copy',
          removedPath: 'docs/testing.md',
          change: {
            status: 'C100',
            sourcePath: 'docs/testing.md',
            path: 'docs/testing-copy.md',
          },
          message:
            'P1C authority repair range forbids copy docs/testing.md -> docs/testing-copy.md',
        },
        {
          name: 'delete',
          removedPath: 'docs/testing.md',
          change: { status: 'D', path: 'docs/testing.md' },
          message:
            'P1C authority repair range forbids deleted path docs/testing.md',
        },
        {
          name: 'wrong modified status',
          removedPath: CHECKER_PATH,
          change: { status: 'A', path: CHECKER_PATH },
          message: `P1C authority repair range requires M ${CHECKER_PATH}`,
        },
        {
          name: 'wrong added status',
          removedPath:
            'docs/superpowers/specs/2026-08-24-p1c-authority-repair-design.md',
          change: {
            status: 'M',
            path: 'docs/superpowers/specs/2026-08-24-p1c-authority-repair-design.md',
          },
          message:
            'P1C authority repair range requires A docs/superpowers/specs/2026-08-24-p1c-authority-repair-design.md',
        },
        {
          name: 'path alias',
          removedPath: CHECKER_PATH,
          change: {
            status: 'M',
            path: `./${CHECKER_PATH}`,
          },
          message: `P1C authority repair range path must be canonical: ./${CHECKER_PATH}`,
        },
        {
          name: 'encoded alias',
          removedPath: CHECKER_PATH,
          change: {
            status: 'M',
            path: 'tools/test262/%65s2015-provenance-check.js',
          },
          message:
            'P1C authority repair range path must be canonical: tools/test262/%65s2015-provenance-check.js',
        },
        {
          name: 'path traversal',
          removedPath: CHECKER_PATH,
          change: {
            status: 'M',
            path: 'tools/test262/../test262/es2015-provenance-check.js',
          },
          message:
            'P1C authority repair range path must be canonical: tools/test262/../test262/es2015-provenance-check.js',
        },
      ];
      for (const scenario of replacements) {
        const changes =
          scenario.removedPath === undefined
            ? [...P1C_AUTHORITY_REPAIR_CHANGES]
            : P1C_AUTHORITY_REPAIR_CHANGES.filter(
                (change) => change.path !== scenario.removedPath,
              );
        changes.push(scenario.change);
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                p1cAuthorityRepairCiArgs(),
                p1cAuthorityRepairRangeDependencies({ changes }),
              ),
            )
          ).message,
          scenario.message,
          scenario.name,
        );
      }

      for (const scenario of [
        {
          name: 'BASE-absent modified path',
          options: { baseAbsentPaths: ['docs/testing.md'] },
          message:
            'P1C authority repair range path docs/testing.md must be a regular file in BASE',
        },
        {
          name: 'added path present in BASE',
          options: {
            baseFiles: new Map([
              [
                'docs/superpowers/specs/2026-08-24-p1c-authority-repair-design.md',
                '# stale repair design\n',
              ],
            ]),
          },
          message:
            'P1C authority repair range path docs/superpowers/specs/2026-08-24-p1c-authority-repair-design.md must be absent from BASE',
        },
        {
          name: 'non-regular BASE mode',
          options: { baseModes: new Map([[CHECKER_PATH, '120000']]) },
          message: `P1C authority repair range path ${CHECKER_PATH} must be a regular file in BASE`,
        },
        {
          name: 'non-regular HEAD mode',
          options: {
            headModes: new Map([['docs/testing.md', '120000']]),
          },
          message:
            'P1C authority repair range path docs/testing.md must be a regular file in HEAD',
        },
        {
          name: 'modified mode drift',
          options: { headModes: new Map([[CHECKER_PATH, '100755']]) },
          message: `P1C authority repair range path ${CHECKER_PATH} must retain its exact regular-file mode between BASE and HEAD`,
        },
      ]) {
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                p1cAuthorityRepairCiArgs(),
                p1cAuthorityRepairRangeDependencies(scenario.options),
              ),
            )
          ).message,
          scenario.message,
          scenario.name,
        );
      }
    },
  },
  {
    name: 'ES2015 P1C authority repair rejects alternate HEAD identities and noncanonical manifests',
    run: async () => {
      for (const scenario of [
        {
          body: p1cAuthorityRepairMarker({
            headManifestSha256: 'a'.repeat(64),
          }),
          message: `P1C authority repair marker head-manifest-sha256 must be ${P1C_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256}`,
        },
        {
          body: p1cAuthorityRepairMarker({
            headRecordSha256: 'a'.repeat(64),
          }),
          message: `P1C authority repair marker head-record-sha256 must be ${P1C_AUTHORITY_REPAIR_HEAD_RECORD_SHA256}`,
        },
      ]) {
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                p1cAuthorityRepairCiArgs(),
                p1cAuthorityRepairRangeDependencies({ body: scenario.body }),
              ),
            )
          ).message,
          scenario.message,
        );
      }

      const alternateManifestText = mutatedP1CAuthorityRepairHeadManifestText(
        (_manifest, p1c) => {
          p1c.protectedOutputs.find(
            (/** @type {{ path: string }} */ output) =>
              output.path === P1C_AUTHORITY_REPAIR_AUDIT_OUTPUT.path,
          ).headSha256 = 'a'.repeat(64);
        },
      );
      const alternateManifest = JSON.parse(alternateManifestText);
      const alternateP1C = alternateManifest.roadmapAuthorities.find(
        (/** @type {{ code: string }} */ authority) => authority.code === 'P1C',
      );
      const alternateManifestSha256 = sha256(alternateManifestText);
      const alternateRecordSha256 =
        canonicalRoadmapAuthoritySha256(alternateP1C);
      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              p1cAuthorityRepairCiArgs(),
              p1cAuthorityRepairRangeDependencies({
                body: p1cAuthorityRepairMarker({
                  headManifestSha256: alternateManifestSha256,
                  headRecordSha256: alternateRecordSha256,
                }),
                headManifestText: alternateManifestText,
              }),
            ),
          )
        ).message,
        `P1C authority repair marker head-manifest-sha256 must be ${P1C_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256}`,
      );
      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              p1cAuthorityRepairCiArgs(),
              p1cAuthorityRepairRangeDependencies({
                body: p1cAuthorityRepairMarker({
                  headRecordSha256: alternateRecordSha256,
                }),
                headManifestText: alternateManifestText,
              }),
            ),
          )
        ).message,
        `P1C authority repair marker head-record-sha256 must be ${P1C_AUTHORITY_REPAIR_HEAD_RECORD_SHA256}`,
      );

      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              p1cAuthorityRepairCiArgs(),
              p1cAuthorityRepairRangeDependencies({
                baseManifestText: JSON.stringify(
                  JSON.parse(p1cAuthorityRepairBaseManifestText()),
                ),
              }),
            ),
          )
        ).message,
        `P1C authority repair BASE manifest sha256 must be ${P1C_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256}`,
      );
      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              p1cAuthorityRepairCiArgs(),
              p1cAuthorityRepairRangeDependencies({
                headManifestText: mutatedP1CAuthorityRepairHeadManifestText(
                  () => {},
                  { canonical: false },
                ),
              }),
            ),
          )
        ).message,
        'P1C authority repair head provenance manifest is not canonical',
      );
    },
  },
  {
    name: 'ES2015 P1C authority repair enforces every derived immutable byte and mode',
    run: async () => {
      const baseManifest = JSON.parse(p1cAuthorityRepairBaseManifestText());
      const immutablePaths = p1cAuthorityRepairImmutablePaths(baseManifest);
      const baseFiles = p1cAuthorityRepairBaseFiles();
      for (const path of immutablePaths) {
        const headFiles = new Map([
          [
            path,
            baseFiles.has(path)
              ? `${baseFiles.get(path)}\nP1C repair drift\n`
              : `forbidden future P1C repair file ${path}\n`,
          ],
        ]);
        assertSame(
          (
            await rejected(() =>
              provenanceCheck(
                p1cAuthorityRepairCiArgs(),
                p1cAuthorityRepairRangeDependencies({ headFiles }),
              ),
            )
          ).message,
          `P1C authority repair immutable path ${path} must remain byte-identical between BASE and HEAD`,
          path,
        );
      }

      const modePath = '.github/workflows/ci.yml';
      assertSame(
        (
          await rejected(() =>
            provenanceCheck(
              p1cAuthorityRepairCiArgs(),
              p1cAuthorityRepairRangeDependencies({
                headModes: new Map([[modePath, '100755']]),
              }),
            ),
          )
        ).message,
        `P1C authority repair immutable path ${modePath} must retain its exact regular-file mode between BASE and HEAD`,
      );

      const baseP1C = baseManifest.roadmapAuthorities.find(
        (/** @type {{ code: string }} */ authority) => authority.code === 'P1C',
      );
      const baseAbsentEvidencePaths = baseP1C.evidence
        .map((/** @type {{ path: string }} */ entry) => entry.path)
        .filter((/** @type {string} */ path) => !baseFiles.has(path));
      assertSame(baseAbsentEvidencePaths.length, 6);
      const dependencies = p1cAuthorityRepairRangeDependencies();
      for (const path of baseAbsentEvidencePaths) {
        assertSame(
          await dependencies.readGitFile(P1C_AUTHORITY_REPAIR_BASE, path),
          null,
          path,
        );
        assertSame(
          await dependencies.readGitFile(RANGE_HEAD_SHA, path),
          null,
          path,
        );
      }
    },
  },
  {
    name: 'ES2015 P1C repair fixture reproduces exact corrected pending and applied identities',
    run: async () => {
      const checker =
        await import('../../tools/test262/es2015-provenance-check.js');
      assertSame(
        typeof checker.assertP1CAuthorityRepairManifestDelta,
        'function',
      );

      const baseManifestText = p1cAuthorityRepairBaseManifestText();
      const pendingManifestText = p1cAuthorityRepairPendingManifestText();
      const appliedManifestText = p1cAuthorityRepairAppliedManifestText();
      const baseManifest = JSON.parse(baseManifestText);
      const pendingManifest = JSON.parse(pendingManifestText);
      const appliedManifest = JSON.parse(appliedManifestText);
      const baseP1C = baseManifest.roadmapAuthorities.find(
        (/** @type {{ code: string }} */ authority) => authority.code === 'P1C',
      );
      const appliedP1C = appliedManifest.roadmapAuthorities.find(
        (/** @type {{ code: string }} */ authority) => authority.code === 'P1C',
      );
      assertSame(baseP1C !== undefined, true);
      assertSame(appliedP1C !== undefined, true);

      const pendingP1C = checker.assertP1CAuthorityRepairManifestDelta(
        baseManifest,
        pendingManifest,
      );
      assertSame(
        json(pendingP1C),
        json(
          pendingManifest.roadmapAuthorities.find(
            (/** @type {{ code: string }} */ authority) =>
              authority.code === 'P1C',
          ),
        ),
      );
      assertSame(
        sha256(baseManifestText),
        P1C_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256,
      );
      assertSame(
        sha256(readGitFixtureText(P1C_AUTHORITY_REPAIR_BASE, CHECKER_PATH)),
        P1C_AUTHORITY_REPAIR_BASE_CHECKER_SHA256,
      );
      assertSame(
        canonicalRoadmapAuthoritySha256(baseP1C),
        P1C_AUTHORITY_REPAIR_BASE_RECORD_SHA256,
      );
      assertSame(
        sha256(pendingManifestText),
        P1C_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256,
      );
      assertSame(
        canonicalRoadmapAuthoritySha256(pendingP1C),
        P1C_AUTHORITY_REPAIR_HEAD_RECORD_SHA256,
      );
      assertSame(
        sha256(appliedManifestText),
        P1C_AUTHORITY_REPAIR_APPLIED_MANIFEST_SHA256,
      );
      assertSame(
        canonicalRoadmapAuthoritySha256(appliedP1C),
        P1C_AUTHORITY_REPAIR_APPLIED_RECORD_SHA256,
      );
      assertSame(
        provenance.roadmapAggregateProjectionSha256(pendingP1C),
        P1C_AUTHORITY_REPAIR_PROJECTION_SHA256,
      );
      assertSame(pendingP1C.evidence.length, 6);
      assertSame(pendingP1C.protectedOutputs.length, 11);
      assertSame(
        json(
          pendingP1C.protectedOutputs.reduce(
            (
              /** @type {Record<string, number>} */ counts,
              /** @type {{ operation: string }} */ output,
            ) => {
              counts[output.operation] = (counts[output.operation] ?? 0) + 1;
              return counts;
            },
            {},
          ),
        ),
        json({
          project: 2,
          'replace-exact': 3,
          'add-exact': 6,
        }),
      );
      assertSame(pendingP1C.state, 'pending');
      assertSame(appliedP1C.state, 'applied');
    },
  },
  {
    name: 'ES2015 P1C repair fixture preserves source disposition evidence and project commitments',
    run: async () => {
      const checker =
        await import('../../tools/test262/es2015-provenance-check.js');
      const baseManifest = JSON.parse(p1cAuthorityRepairBaseManifestText());
      const pendingP1C = checker.assertP1CAuthorityRepairManifestDelta(
        baseManifest,
        p1cAuthorityRepairPendingManifestValue(),
      );
      const baseP1C = baseManifest.roadmapAuthorities.find(
        (/** @type {{ code: string }} */ authority) => authority.code === 'P1C',
      );
      assertSame(baseP1C !== undefined, true);

      assertSame(json(pendingP1C.source), json(baseP1C.source));
      assertSame(json(pendingP1C.reconciliation), json(baseP1C.reconciliation));
      assertSame(json(pendingP1C.evidence), json(baseP1C.evidence));
      assertSame(json(pendingP1C.destinations), json(baseP1C.destinations));
      assertSame(
        json(
          pendingP1C.protectedOutputs.filter(
            (/** @type {{ operation: string }} */ output) =>
              output.operation === 'project',
          ),
        ),
        json(
          baseP1C.protectedOutputs.filter(
            (/** @type {{ path: string }} */ output) =>
              output.path === 'docs/conformance.md' ||
              output.path === 'docs/test262-report.jsonl',
          ),
        ),
      );
      assertSame(
        json(P1C_AUTHORITY_REPAIR_COLLATERAL_PATHS),
        json([...new Set(P1C_AUTHORITY_REPAIR_COLLATERAL_PATHS)].sort()),
      );
      assertSame(P1C_AUTHORITY_REPAIR_COLLATERAL_PATHS.length, 4);
      assertSame(
        P1C_AUTHORITY_REPAIR_COLLATERAL_PATHS.length * 2,
        P1C_AUTHORITY_REPAIR_COLLATERAL_EXECUTION.basePassedRecords,
      );
      assertSame(
        P1C_AUTHORITY_REPAIR_COLLATERAL_EXECUTION.basePassedRecords,
        P1C_AUTHORITY_REPAIR_COLLATERAL_EXECUTION.headParseFailureRecords,
      );
      assertSame(
        P1C_AUTHORITY_REPAIR_SELECTED_TOTALS.baseRoots -
          P1C_AUTHORITY_REPAIR_COLLATERAL_PATHS.length,
        P1C_AUTHORITY_REPAIR_SELECTED_TOTALS.headRoots,
      );
      assertSame(
        P1C_AUTHORITY_REPAIR_SELECTED_TOTALS.baseVariants -
          P1C_AUTHORITY_REPAIR_COLLATERAL_PATHS.length * 2,
        P1C_AUTHORITY_REPAIR_SELECTED_TOTALS.headVariants,
      );
      assertSame(
        P1C_AUTHORITY_REPAIR_AUDIT_TOTALS.baseRecords +
          P1C_AUTHORITY_REPAIR_COLLATERAL_PATHS.length * 2,
        P1C_AUTHORITY_REPAIR_AUDIT_TOTALS.headRecords,
      );
      assertSame(
        P1C_AUTHORITY_REPAIR_AUDIT_TOTALS.baseRoots +
          P1C_AUTHORITY_REPAIR_COLLATERAL_PATHS.length,
        P1C_AUTHORITY_REPAIR_AUDIT_TOTALS.headRoots,
      );
      assertSame(
        P1C_AUTHORITY_REPAIR_TAXONOMY_SELECTED_TOTALS.baseRoots -
          P1C_AUTHORITY_REPAIR_COLLATERAL_PATHS.length,
        P1C_AUTHORITY_REPAIR_TAXONOMY_SELECTED_TOTALS.headRoots,
      );
      assertSame(
        P1C_AUTHORITY_REPAIR_TAXONOMY_SELECTED_TOTALS.baseVariants -
          P1C_AUTHORITY_REPAIR_COLLATERAL_PATHS.length * 2,
        P1C_AUTHORITY_REPAIR_TAXONOMY_SELECTED_TOTALS.headVariants,
      );
      assertSame(
        P1C_AUTHORITY_REPAIR_CORE_P1_BLOCKERS.baseRoots +
          P1C_AUTHORITY_REPAIR_COLLATERAL_PATHS.length,
        P1C_AUTHORITY_REPAIR_CORE_P1_BLOCKERS.headRoots,
      );
      assertSame(
        P1C_AUTHORITY_REPAIR_CORE_P1_BLOCKERS.baseVariants +
          P1C_AUTHORITY_REPAIR_COLLATERAL_PATHS.length * 2,
        P1C_AUTHORITY_REPAIR_CORE_P1_BLOCKERS.headVariants,
      );
    },
  },
  {
    name: 'ES2015 P1C repair manifest delta rejects every non-output and foreign-output drift',
    run: async () => {
      const checker =
        await import('../../tools/test262/es2015-provenance-check.js');
      const baseManifest = JSON.parse(p1cAuthorityRepairBaseManifestText());
      const expectRepairError = (
        /** @type {{ name: string, message: string, mutate: (manifest: Record<string, any>, p1c: Record<string, any>) => void }} */ scenario,
      ) => {
        const headManifest = p1cAuthorityRepairPendingManifestValue();
        const p1c = headManifest.roadmapAuthorities.find(
          (/** @type {{ code: string }} */ authority) =>
            authority.code === 'P1C',
        );
        assertSame(p1c !== undefined, true, scenario.name);
        scenario.mutate(headManifest, p1c);
        assertSame(
          assertThrows(
            () =>
              checker.assertP1CAuthorityRepairManifestDelta(
                baseManifest,
                headManifest,
              ),
            Es2015ProvenanceCheckError,
          ).message,
          scenario.message,
          scenario.name,
        );
      };

      for (const scenario of [
        {
          name: 'non-authority manifest drift',
          mutate: (/** @type {Record<string, any>} */ manifest) => {
            manifest.rangeProfiles[0].name = 'p1c-repair-drift';
          },
          message:
            'P1C authority repair must preserve all non-authority manifest data',
        },
        {
          name: 'P1C applied in repair',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.state = 'applied';
          },
          message: 'P1C authority repair must keep P1C pending',
        },
        {
          name: 'P1C missing',
          mutate: (/** @type {Record<string, any>} */ manifest) => {
            manifest.roadmapAuthorities = manifest.roadmapAuthorities.filter(
              (/** @type {{ code: string }} */ authority) =>
                authority.code !== 'P1C',
            );
          },
          message:
            'P1C authority repair must preserve roadmap authority count and order',
        },
        {
          name: 'authority order changed',
          mutate: (/** @type {Record<string, any>} */ manifest) => {
            const p1cIndex = manifest.roadmapAuthorities.findIndex(
              (/** @type {{ code: string }} */ authority) =>
                authority.code === 'P1C',
            );
            [
              manifest.roadmapAuthorities[p1cIndex - 1],
              manifest.roadmapAuthorities[p1cIndex],
            ] = [
              manifest.roadmapAuthorities[p1cIndex],
              manifest.roadmapAuthorities[p1cIndex - 1],
            ];
          },
          message:
            'P1C authority repair must preserve roadmap authority count and order',
        },
        {
          name: 'another authority changed',
          mutate: (/** @type {Record<string, any>} */ manifest) => {
            manifest.roadmapAuthorities[0].issue += 1;
          },
          message:
            'H0 roadmap authority must remain canonical during P1C authority repair',
        },
        {
          name: 'code drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.code = 'PX';
          },
          message: 'P1C authority repair must preserve P1C code',
        },
        {
          name: 'issue drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.issue += 1;
          },
          message: 'P1C authority repair must preserve P1C issue',
        },
        {
          name: 'parent drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.parentIssue += 1;
          },
          message: 'P1C authority repair must preserve P1C parentIssue',
        },
        {
          name: 'source drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.source.rootCount += 1;
          },
          message: 'P1C authority repair must preserve P1C source',
        },
        {
          name: 'reconciliation drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.reconciliation = { code: 'P1C' };
          },
          message: 'P1C authority repair must preserve P1C reconciliation',
        },
        {
          name: 'evidence order drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            [p1c.evidence[0], p1c.evidence[1]] = [
              p1c.evidence[1],
              p1c.evidence[0],
            ];
          },
          message:
            'P1C authority repair must preserve P1C evidence paths and order',
        },
        {
          name: 'evidence hash drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.evidence[0].sha256 = 'a'.repeat(64);
          },
          message:
            'P1C authority repair must preserve P1C evidence tools/test262/es2015-p1c-baseline.json',
        },
        {
          name: 'destination drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.destinations[0].issue += 1;
          },
          message: 'P1C authority repair must preserve P1C destinations',
        },
        {
          name: 'report project record drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === 'docs/test262-report.jsonl',
            ).projectionSha256 = 'a'.repeat(64);
          },
          message:
            'P1C authority repair must preserve P1C protected output docs/test262-report.jsonl',
        },
        {
          name: 'conformance project record drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === 'docs/conformance.md',
            ).projectionSha256 = 'a'.repeat(64);
          },
          message:
            'P1C authority repair must preserve P1C protected output docs/conformance.md',
        },
        {
          name: 'add-exact record drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === 'tools/test262/es2015-p1c-baseline.json',
            ).headSha256 = 'a'.repeat(64);
          },
          message:
            'P1C authority repair must preserve P1C protected output tools/test262/es2015-p1c-baseline.json',
        },
        {
          name: 'audit base drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === P1C_AUTHORITY_REPAIR_AUDIT_OUTPUT.path,
            ).baseSha256 = 'a'.repeat(64);
          },
          message:
            'P1C authority repair requires the exact corrected P1C audit replacement output',
        },
        {
          name: 'audit operation drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === P1C_AUTHORITY_REPAIR_AUDIT_OUTPUT.path,
            ).operation = 'project';
          },
          message:
            'P1C authority repair requires the exact corrected P1C audit replacement output',
        },
        {
          name: 'audit projection drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === P1C_AUTHORITY_REPAIR_AUDIT_OUTPUT.path,
            ).projectionSha256 = 'a'.repeat(64);
          },
          message:
            'P1C authority repair requires the exact corrected P1C audit replacement output',
        },
        {
          name: 'audit alternate HEAD hash',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === P1C_AUTHORITY_REPAIR_AUDIT_OUTPUT.path,
            ).headSha256 = 'a'.repeat(64);
          },
          message:
            'P1C authority repair requires the exact corrected P1C audit replacement output',
        },
        {
          name: 'taxonomy remains project',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === P1C_AUTHORITY_REPAIR_TAXONOMY_OUTPUT.path,
            ).operation = 'project';
          },
          message:
            'P1C authority repair requires the exact corrected P1C taxonomy replacement output',
        },
        {
          name: 'taxonomy base drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === P1C_AUTHORITY_REPAIR_TAXONOMY_OUTPUT.path,
            ).baseSha256 = 'a'.repeat(64);
          },
          message:
            'P1C authority repair requires the exact corrected P1C taxonomy replacement output',
        },
        {
          name: 'taxonomy head drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === P1C_AUTHORITY_REPAIR_TAXONOMY_OUTPUT.path,
            ).headSha256 = 'a'.repeat(64);
          },
          message:
            'P1C authority repair requires the exact corrected P1C taxonomy replacement output',
        },
        {
          name: 'taxonomy projection drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === P1C_AUTHORITY_REPAIR_TAXONOMY_OUTPUT.path,
            ).projectionSha256 = 'a'.repeat(64);
          },
          message:
            'P1C authority repair requires the exact corrected P1C taxonomy replacement output',
        },
        {
          name: 'subset remains project',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === P1C_AUTHORITY_REPAIR_SUBSET_OUTPUT.path,
            ).operation = 'project';
          },
          message:
            'P1C authority repair requires the exact corrected P1C subset replacement output',
        },
        {
          name: 'subset base drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === P1C_AUTHORITY_REPAIR_SUBSET_OUTPUT.path,
            ).baseSha256 = 'a'.repeat(64);
          },
          message:
            'P1C authority repair requires the exact corrected P1C subset replacement output',
        },
        {
          name: 'subset head drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === P1C_AUTHORITY_REPAIR_SUBSET_OUTPUT.path,
            ).headSha256 = 'a'.repeat(64);
          },
          message:
            'P1C authority repair requires the exact corrected P1C subset replacement output',
        },
        {
          name: 'subset projection drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.protectedOutputs.find(
              (/** @type {{ path: string }} */ output) =>
                output.path === P1C_AUTHORITY_REPAIR_SUBSET_OUTPUT.path,
            ).projectionSha256 = 'a'.repeat(64);
          },
          message:
            'P1C authority repair requires the exact corrected P1C subset replacement output',
        },
        {
          name: 'protected output order drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            [p1c.protectedOutputs[0], p1c.protectedOutputs[1]] = [
              p1c.protectedOutputs[1],
              p1c.protectedOutputs[0],
            ];
          },
          message:
            'P1C authority repair requires the exact P1C protected output paths and order',
        },
        {
          name: 'protected output path drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.protectedOutputs[0].path = 'docs/p1c-foreign-output.md';
          },
          message:
            'P1C authority repair requires the exact P1C protected output paths and order',
        },
        {
          name: 'protected output count drift',
          mutate: (
            /** @type {Record<string, any>} */ _manifest,
            /** @type {Record<string, any>} */ p1c,
          ) => {
            p1c.protectedOutputs.pop();
          },
          message:
            'P1C authority repair requires the exact P1C protected output paths and order',
        },
      ]) {
        expectRepairError(scenario);
      }
    },
  },
  {
    name: 'ES2015 roadmap consumption accepts only corrected P1C pending-to-applied state',
    run: async () => {
      const pendingManifest = p1cAuthorityRepairPendingManifestValue();
      const appliedManifest = p1cAuthorityRepairAppliedManifestValue();
      const marker = parseRoadmapAuthorityMarker(
        roadmapConsumptionMarker({
          code: 'P1C',
          issue: 116,
          profile: 'roadmap-reclassification:P1C',
          base: P1C_AUTHORITY_REPAIR_BASE,
          sourcePathSha256:
            'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5',
          sourceEntrySha256: null,
          protectedProjectionSha256: P1C_AUTHORITY_REPAIR_PROJECTION_SHA256,
        }),
      );
      const deps = createProvenanceCheckDependencies({
        validateRoadmapProtectedOutputs: async () => [
          { code: 'P1C', status: 'validated' },
        ],
      });
      const changes = [
        {
          status: 'M',
          path: ES2015_PROVENANCE_FILE,
          sourcePath: null,
        },
      ];

      assertSame(
        await validateRoadmapAuthorityConsumption(
          pendingManifest,
          appliedManifest,
          marker,
          {
            deps,
            base: P1C_AUTHORITY_REPAIR_BASE,
            head: RANGE_HEAD_SHA,
            changes,
          },
        ),
        0,
      );

      const appliedBaseError = await rejected(() =>
        validateRoadmapAuthorityConsumption(
          appliedManifest,
          appliedManifest,
          marker,
          {
            deps,
            base: P1C_AUTHORITY_REPAIR_BASE,
            head: RANGE_HEAD_SHA,
            changes,
          },
        ),
      );
      assertSame(
        appliedBaseError.message,
        'P1C roadmap authority must be pending in BASE',
      );

      const pendingHeadError = await rejected(() =>
        validateRoadmapAuthorityConsumption(
          pendingManifest,
          pendingManifest,
          marker,
          {
            deps,
            base: P1C_AUTHORITY_REPAIR_BASE,
            head: RANGE_HEAD_SHA,
            changes,
          },
        ),
      );
      assertSame(
        pendingHeadError.message,
        'P1C roadmap authority must transition only from pending to applied',
      );

      const aggregateError = await rejected(() =>
        validateRoadmapAuthorityConsumption(
          pendingManifest,
          appliedManifest,
          parseRoadmapAuthorityMarker(
            roadmapConsumptionMarker({
              code: 'P1C',
              issue: 116,
              profile: 'roadmap-reclassification:P1C',
              base: P1C_AUTHORITY_REPAIR_BASE,
              sourcePathSha256:
                'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5',
              sourceEntrySha256: null,
              protectedProjectionSha256: 'a'.repeat(64),
            }),
          ),
          {
            deps,
            base: P1C_AUTHORITY_REPAIR_BASE,
            head: RANGE_HEAD_SHA,
            changes,
          },
        ),
      );
      assertSame(
        aggregateError.message,
        'roadmap-reclassification:P1C marker protected-projection-sha256 does not match P1C roadmap authority',
      );
    },
  },
  {
    name: 'ES2015 provenance CI range mode scans roadmap markers as exact full comment blocks',
    run: async () => {
      const baseManifestText = approvedProvenanceManifestText();
      const headManifestText = renderEs2015ProvenanceManifest(
        canonicalSchemaV3ManifestValue(),
      );
      const checkerText = 'base checker fixture\n';
      const workflowText = 'base workflow fixture\n';
      const designText = '# Roadmap Authority Design\n';
      const planText = '# Roadmap Authority Plan\n';
      const migrationArtifactFiles = initialRoadmapMigrationArtifactFiles();
      const ciArgs = [
        '--check-range',
        `--base=${RANGE_BASE_SHA}`,
        `--head=${RANGE_HEAD_SHA}`,
        '--pr-body-env=PROVENANCE_PR_BODY',
      ];
      const accepted = rangeCheckDependencies({
        changes: [
          { status: 'M', path: ES2015_PROVENANCE_FILE },
          { status: 'A', path: ROADMAP_AUTHORITY_DESIGN_PATH },
          { status: 'A', path: ROADMAP_AUTHORITY_PLAN_PATH },
        ],
        baseManifestText,
        headManifestText,
        baseFiles: new Map([
          ...migrationArtifactFiles,
          [CHECKER_PATH, checkerText],
          [WORKFLOW_PATH, workflowText],
          [
            ROADMAP_AUTHORITY_BASE_DESIGN_ADDENDUM_PATH,
            embeddedRoadmapAuthorityPayload('DESIGN', designText),
          ],
          [
            ROADMAP_AUTHORITY_BASE_PLAN_ADDENDUM_PATH,
            embeddedRoadmapAuthorityPayload('PLAN', planText),
          ],
        ]),
        headFiles: new Map([
          ...migrationArtifactFiles,
          [ROADMAP_AUTHORITY_DESIGN_PATH, designText],
          [ROADMAP_AUTHORITY_PLAN_PATH, planText],
        ]),
      });
      accepted.environment = {
        TZ: 'UTC',
        GITHUB_EVENT_NAME: 'pull_request',
        PROVENANCE_PR_BODY: `Context\n\n${roadmapMigrationMarker({
          baseManifestText,
          checkerText,
          workflowText,
          headManifestText,
        })}\n`,
      };
      assertSame(await provenanceCheck(ciArgs, accepted), 0);

      for (const body of [
        `${roadmapMigrationMarker({
          baseManifestText,
          checkerText,
          workflowText,
          headManifestText,
        })}\n${roadmapMigrationMarker({
          baseManifestText,
          checkerText,
          workflowText,
          headManifestText,
        })}`,
        `${maintenanceRangeMarker()}\n${roadmapMigrationMarker({
          baseManifestText,
          checkerText,
          workflowText,
          headManifestText,
        })}`,
      ]) {
        const duplicate = rangeCheckDependencies({
          changes: [{ status: 'M', path: ES2015_PROVENANCE_FILE }],
          baseManifestText,
          headManifestText,
          baseFiles: new Map([
            [CHECKER_PATH, checkerText],
            [WORKFLOW_PATH, workflowText],
            [
              ROADMAP_AUTHORITY_BASE_DESIGN_ADDENDUM_PATH,
              embeddedRoadmapAuthorityPayload('DESIGN', designText),
            ],
            [
              ROADMAP_AUTHORITY_BASE_PLAN_ADDENDUM_PATH,
              embeddedRoadmapAuthorityPayload('PLAN', planText),
            ],
          ]),
          headFiles: new Map([
            [ROADMAP_AUTHORITY_DESIGN_PATH, designText],
            [ROADMAP_AUTHORITY_PLAN_PATH, planText],
          ]),
        });
        duplicate.environment = {
          TZ: 'UTC',
          GITHUB_EVENT_NAME: 'pull_request',
          PROVENANCE_PR_BODY: body,
        };
        assertSame(
          (await rejected(() => provenanceCheck(ciArgs, duplicate))).message,
          'PR body must contain exactly one authoritative provenance marker',
        );
      }

      const crlf = rangeCheckDependencies({
        changes: [{ status: 'M', path: ES2015_PROVENANCE_FILE }],
        baseManifestText,
        headManifestText,
      });
      crlf.environment = {
        TZ: 'UTC',
        GITHUB_EVENT_NAME: 'pull_request',
        PROVENANCE_PR_BODY: roadmapMigrationMarker({
          baseManifestText,
          checkerText,
          workflowText,
          headManifestText,
        }).replace(/\n/gu, '\r\n'),
      };
      assertSame(
        (await rejected(() => provenanceCheck(ciArgs, crlf))).message,
        'A provenance-owned PR range requires one authoritative provenance marker',
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
    name: 'ES2015 provenance CLI check accepts canonical schema-v3 manifests without a static authority expectation',
    run: async () => {
      for (const manifestV3 of [
        canonicalEmptySchemaV3ManifestValue(),
        canonicalSchemaV3ManifestValue(),
        canonicalPreparedSchemaV3ManifestValue(),
        canonicalConsumedSchemaV3ManifestValue(),
      ]) {
        const dependencies = provenanceCheckDependencies({
          files: new Map([
            [
              ES2015_PROVENANCE_FILE,
              renderEs2015ProvenanceManifest(manifestV3),
            ],
          ]),
        });
        assertSame(await provenanceCheck(['--check'], dependencies), 0);
      }
    },
  },
  {
    name: 'ES2015 provenance CLI check uses explicit expected roadmap authorities when provided',
    run: async () => {
      assertSame(
        await provenanceCheck(['--check'], provenanceCheckDependencies()),
        0,
      );

      const manifestV3 = canonicalSchemaV3ManifestValue();
      const v3Dependencies = provenanceCheckDependencies({
        files: new Map([
          [ES2015_PROVENANCE_FILE, renderEs2015ProvenanceManifest(manifestV3)],
        ]),
        expectedManifestVersion: 3,
        expectedRoadmapAuthorities: manifestV3.roadmapAuthorities,
      });
      assertSame(await provenanceCheck(['--check'], v3Dependencies), 0);

      const driftedManifestV3 = structuredClone(manifestV3);
      driftedManifestV3.roadmapAuthorities[0].state = 'applied';
      const driftDependencies = provenanceCheckDependencies({
        files: new Map([
          [
            ES2015_PROVENANCE_FILE,
            renderEs2015ProvenanceManifest(driftedManifestV3),
          ],
        ]),
        expectedManifestVersion: 3,
        expectedRoadmapAuthorities: manifestV3.roadmapAuthorities,
      });
      const driftError = await rejected(() =>
        provenanceCheck(['--check'], driftDependencies),
      );
      assertSame(driftError instanceof Es2015ProvenanceCheckError, true);
      assertSame(
        driftError.message,
        'H0 roadmap authority does not match the reviewed ledger',
      );
    },
  },
  {
    name: 'ES2015 provenance canonical prepared and consumed schema-v3 HEADs pass ordinary check but still require authorized range transitions',
    run: async () => {
      const baseManifest = canonicalSchemaV3ManifestValue();
      const baseManifestText = renderEs2015ProvenanceManifest(baseManifest);
      const preparedManifest = canonicalPreparedSchemaV3ManifestValue();
      const preparedManifestText =
        renderEs2015ProvenanceManifest(preparedManifest);
      const consumedManifest = canonicalConsumedSchemaV3ManifestValue();
      const consumedManifestText =
        renderEs2015ProvenanceManifest(consumedManifest);

      assertSame(
        await provenanceCheck(
          ['--check'],
          provenanceCheckDependencies({
            files: new Map([[ES2015_PROVENANCE_FILE, preparedManifestText]]),
          }),
        ),
        0,
      );
      assertSame(
        await provenanceCheck(
          ['--check'],
          provenanceCheckDependencies({
            files: new Map([[ES2015_PROVENANCE_FILE, consumedManifestText]]),
          }),
        ),
        0,
      );

      const preparedRangeError = await rejected(() =>
        provenanceCheck(
          [
            '--check-range',
            `--base=${RANGE_BASE_SHA}`,
            `--head=${RANGE_HEAD_SHA}`,
            '--profile=roadmap-authority-prepare',
            `--marker=${roadmapPreparationMarker({
              baseManifestText,
              recordSha256: 'f'.repeat(64),
            })}`,
          ],
          rangeCheckDependencies({
            changes: [{ status: 'M', path: ES2015_PROVENANCE_FILE }],
            baseManifestText,
            headManifestText: preparedManifestText,
          }),
        ),
      );
      assertSame(
        preparedRangeError.message,
        'roadmap-authority-prepare marker record-sha256 does not match M0 roadmap authority',
      );

      const baseAuthority = baseManifest.roadmapAuthorities[0];
      if (baseAuthority === undefined || baseAuthority.code !== 'H0') {
        throw new Error('expected canonical H0 roadmap authority');
      }
      const consumedRangeError = await rejected(() =>
        provenanceCheck(
          [
            '--check-range',
            `--base=${RANGE_BASE_SHA}`,
            `--head=${RANGE_HEAD_SHA}`,
            '--profile=roadmap-reclassification:H0',
            `--marker=${roadmapConsumptionMarker({
              code: 'H0',
              issue: baseAuthority.issue,
              sourcePathSha256: baseAuthority.source.pathSha256,
              sourceEntrySha256: baseAuthority.source.entryLedgerSha256,
              protectedProjectionSha256: 'f'.repeat(64),
            })}`,
          ],
          rangeCheckDependencies({
            changes: [
              { status: 'M', path: ES2015_PROVENANCE_FILE },
              { status: 'M', path: 'docs/conformance.md' },
            ],
            baseManifestText,
            headManifestText: consumedManifestText,
            validateRoadmapProtectedOutputs: async () =>
              roadmapProjectionEntries(baseAuthority.protectedOutputs),
          }),
        ),
      );
      assertSame(
        consumedRangeError.message,
        'roadmap-reclassification:H0 marker protected-projection-sha256 does not match H0 roadmap authority',
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
