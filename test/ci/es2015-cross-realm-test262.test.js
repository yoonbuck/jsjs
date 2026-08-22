import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { assertSame } from '../harness/assert.js';
import { createNodeTest262Host } from '../../tools/test262/adapters/node.js';
import { createJsjsTest262Engine } from '../../tools/test262/engine.js';
import {
  FEATURES_MANIFEST_FILE,
  featureNames,
  parseFeatureManifest,
} from '../../tools/test262/features.js';
import { formatReportLines } from '../../tools/test262/report.js';
import { runTest262 } from '../../tools/test262/runner.js';
import { sortStrings } from '../../tools/test262/selection.js';
import {
  assertEs2015H0ExecutionMatchesDisposition,
  parseEs2015H0Disposition,
  parseEs2015H0OwnerMap,
} from '../../tools/test262/es2015-promotion.js';
import {
  assertPinnedCheckout,
  readTest262Pin,
} from '../../tools/test262/upstream-run.js';

const H0_ARTIFACT_FILE = 'tools/test262/es2015-h0-paths.json';
const H0_DISPOSITION_FILE = 'tools/test262/es2015-h0-disposition.json';
const H0_OWNER_MAP_FILE = 'tools/test262/es2015-h0-owner-map.json';
const TAXONOMY_FILE = 'tools/test262/es2015-taxonomy.json';
const EXPECTED_REPOSITORY = 'https://github.com/tc39/test262.git';
const EXPECTED_REVISION = 'b363f29d3c43c626dc852744ad64a0b48a003693';
const EXPECTED_TAXONOMY_SHA256 =
  'e7746b6da6038c1fda83e1e6cbecbe9fb3e7b97bdf89a311c0a3f34a686c7953';
const EXPECTED_LEDGER_SHA256 =
  '3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950';
const EXPECTED_ROOT_COUNT = 135;
const EXPECTED_VARIANT_COUNT = 267;

/**
 * @typedef {{
 *   version: number,
 *   repository: string,
 *   revision: string,
 *   sourceTaxonomySha256: string,
 *   ledgerSha256: string,
 *   rootCount: number,
 *   variantCount: number,
 *   paths: string[],
 * }} CrossRealmArtifact
 *
 * @typedef {{
 *   path: string,
 *   partition: string,
 *   blocker: string | null,
 *   variants: number,
 *   features: readonly string[],
 * }} TaxonomyClassification
 */

export default [
  {
    name: 'cross-Realm H0 artifact matches the pre-H0 taxonomy ledger',
    run: async () => {
      const { artifact, derivedPaths } = await loadCrossRealmSelection();

      if (derivedPaths !== null) {
        assertSame(
          JSON.stringify(artifact.paths),
          JSON.stringify(derivedPaths),
          `${H0_ARTIFACT_FILE} must remain the immutable H0 ledger`,
        );
      }
    },
  },
  {
    name: 'focused ES2015 cross-Realm upstream Test262 files are disposition-reviewed',
    run: async () => {
      const {
        artifact,
        artifactText,
        disposition,
        ownerMapText,
        taxonomyFeaturesByPath,
      } = await loadCrossRealmSelection();
      const pin = await readTest262Pin();
      const ownerMap = parseEs2015H0OwnerMap(ownerMapText, pin);

      await assertPinnedCheckout(pin);
      assertSame(
        pin.repository,
        artifact.repository,
        `${H0_ARTIFACT_FILE} repository must match package.json`,
      );
      assertSame(
        pin.revision,
        artifact.revision,
        `${H0_ARTIFACT_FILE} revision must match package.json`,
      );
      assertSame(ownerMap.rules.length > 0, true);

      const host = createNodeTest262Host({ root: pin.checkoutPath });
      const supportedFeatures = featureNames(
        parseFeatureManifest(await readRepositoryFile(FEATURES_MANIFEST_FILE)),
      );
      const { records, summary } = await runTest262({
        engine: createJsjsTest262Engine(),
        host,
        paths: artifact.paths,
        supportedFeatures,
        skipFeatures: [],
        supportedFeaturesForPath(file, metadata) {
          const expectedFeatures = taxonomyFeaturesByPath.get(file);

          assertSame(
            expectedFeatures === undefined,
            false,
            `${TAXONOMY_FILE} must still classify ${file}`,
          );

          const actualFeatures = normalizeFeatureList(metadata.features);

          assertSame(
            JSON.stringify(actualFeatures),
            JSON.stringify(expectedFeatures),
            `${TAXONOMY_FILE} feature tags drifted for ${file}`,
          );

          return expectedFeatures;
        },
      });
      const dispositionSummary = assertEs2015H0ExecutionMatchesDisposition({
        pathsManifestText: artifactText,
        disposition,
        records,
        ownerMapText,
        pin,
      });
      const harnessLeakage = records.filter(
        (record) =>
          record.status !== 'passed' &&
          (record.message?.includes('$262 is not defined') === true ||
            record.message?.includes('$262.createRealm') === true ||
            record.message?.includes('createRealm') === true),
      );

      assertSame(summary.total, EXPECTED_VARIANT_COUNT);
      assertSame(summary.skipped, 0);
      assertSame(dispositionSummary.total, EXPECTED_VARIANT_COUNT);
      assertSame(dispositionSummary.skipped, 0);
      assertSame(
        dispositionSummary.passed,
        disposition.executionPassedVariantCount,
      );
      assertSame(
        dispositionSummary.failed,
        disposition.executionFailedVariantCount,
      );
      assertSame(
        disposition.executionPassedVariantCount +
          disposition.executionFailedVariantCount,
        EXPECTED_VARIANT_COUNT,
      );
      assertSame(
        disposition.completePassedVariantCount +
          disposition.reassignedVariantCount,
        EXPECTED_VARIANT_COUNT,
      );

      if (harnessLeakage.length > 0) {
        throw new Error(
          [
            'Expected every focused cross-Realm failure to be semantic disposition evidence, not missing harness support.',
            ...summarizeFailureKinds(harnessLeakage),
            ...formatReportLines([...harnessLeakage, summary]),
          ].join('\n'),
        );
      }

      assertSame(summary.failed, disposition.executionFailedVariantCount);
    },
  },
];

async function loadCrossRealmSelection() {
  const [taxonomyText, artifactText, dispositionText, ownerMapText] =
    await Promise.all([
      readRepositoryFile(TAXONOMY_FILE),
      readRepositoryFile(H0_ARTIFACT_FILE),
      readRepositoryFile(H0_DISPOSITION_FILE),
      readRepositoryFile(H0_OWNER_MAP_FILE),
    ]);

  const artifact = parseH0Artifact(artifactText);
  const disposition = parseEs2015H0Disposition(dispositionText);
  assertSame(artifact.version, 1);
  assertSame(artifact.repository, EXPECTED_REPOSITORY);
  assertSame(artifact.revision, EXPECTED_REVISION);
  assertSame(artifact.sourceTaxonomySha256, EXPECTED_TAXONOMY_SHA256);
  assertSame(artifact.ledgerSha256, EXPECTED_LEDGER_SHA256);
  assertSame(artifact.rootCount, EXPECTED_ROOT_COUNT);
  assertSame(artifact.variantCount, EXPECTED_VARIANT_COUNT);
  assertSame(disposition.repository, EXPECTED_REPOSITORY);
  assertSame(disposition.revision, EXPECTED_REVISION);
  assertSame(disposition.h0LedgerSha256, EXPECTED_LEDGER_SHA256);
  assertSame(disposition.h0RootCount, EXPECTED_ROOT_COUNT);
  assertSame(disposition.h0VariantCount, EXPECTED_VARIANT_COUNT);
  assertSame(disposition.ownerMapSha256, sha256(ownerMapText));
  assertSame(
    disposition.completePassedRootCount + disposition.reassignedRootCount,
    EXPECTED_ROOT_COUNT,
  );
  assertSame(
    disposition.executionPassedVariantCount +
      disposition.executionFailedVariantCount,
    EXPECTED_VARIANT_COUNT,
  );
  assertSame(
    disposition.completePassedVariantCount + disposition.reassignedVariantCount,
    EXPECTED_VARIANT_COUNT,
  );
  assertSame(
    JSON.stringify(artifact.paths),
    JSON.stringify(sortStrings(artifact.paths)),
    `${H0_ARTIFACT_FILE} paths must be code-unit sorted`,
  );
  assertSame(new Set(artifact.paths).size, artifact.paths.length);
  assertSame(artifact.paths.length, artifact.rootCount);
  assertSame(sha256(`${artifact.paths.join('\n')}\n`), artifact.ledgerSha256);

  const taxonomyEntries = parseTaxonomyClassifications(taxonomyText);
  const selectedEntries = sortStrings([...artifact.paths]);
  const immutablePathSet = new Set(selectedEntries);
  const variantCount = taxonomyEntries
    .filter((entry) => immutablePathSet.has(entry.path))
    .reduce((total, entry) => total + entry.variants, 0);
  const postH0Selector = taxonomyEntries.filter(
    (entry) =>
      entry.partition === 'core' &&
      entry.blocker === 'test262-cross-realm-host' &&
      !entry.path.startsWith('test/annexB/'),
  );

  assertSame(selectedEntries.length, EXPECTED_ROOT_COUNT);
  assertSame(variantCount, EXPECTED_VARIANT_COUNT);
  assertSame(sha256(`${selectedEntries.join('\n')}\n`), EXPECTED_LEDGER_SHA256);
  assertSame(postH0Selector.length, 0);
  assertSame(
    postH0Selector.reduce((total, entry) => total + entry.variants, 0),
    0,
  );

  const taxonomyByPath = new Map(
    taxonomyEntries.map((entry) => [entry.path, entry]),
  );

  return {
    artifact,
    artifactText,
    disposition,
    ownerMapText,
    derivedPaths: Object.freeze(selectedEntries),
    taxonomyFeaturesByPath: new Map(
      artifact.paths.map((path) => {
        const entry = taxonomyByPath.get(path);

        assertSame(
          entry === undefined,
          false,
          `${TAXONOMY_FILE} must still classify ${path}`,
        );

        const features = entry === undefined ? [] : entry.features;
        return [path, normalizeFeatureList(features)];
      }),
    ),
  };
}

/**
 * @param {string} path
 * @returns {Promise<string>}
 */
async function readRepositoryFile(path) {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

/**
 * @param {string} text
 * @returns {CrossRealmArtifact}
 */
function parseH0Artifact(text) {
  const artifact = /** @type {CrossRealmArtifact} */ (JSON.parse(text));

  if (
    typeof artifact !== 'object' ||
    artifact === null ||
    Array.isArray(artifact) ||
    !Array.isArray(artifact.paths)
  ) {
    throw new Error(`${H0_ARTIFACT_FILE} must be an object with a paths array`);
  }

  return artifact;
}

/**
 * @param {string} text
 * @returns {TaxonomyClassification[]}
 */
function parseTaxonomyClassifications(text) {
  const taxonomy =
    /** @type {{ classifications: TaxonomyClassification[] }} */ (
      JSON.parse(text)
    );

  if (
    typeof taxonomy !== 'object' ||
    taxonomy === null ||
    Array.isArray(taxonomy) ||
    !Array.isArray(taxonomy.classifications)
  ) {
    throw new Error(`${TAXONOMY_FILE} must expose classifications`);
  }

  return taxonomy.classifications;
}

/**
 * @param {readonly string[] | unknown} features
 * @returns {readonly string[]}
 */
function normalizeFeatureList(features) {
  if (!Array.isArray(features)) {
    return Object.freeze([]);
  }

  return Object.freeze(sortStrings([...features]));
}

/**
 * @param {readonly { message?: string, reason?: string }[]} records
 * @returns {string[]}
 */
function summarizeFailureKinds(records) {
  /** @type {Map<string, number>} */
  const counts = new Map();

  for (const record of records) {
    const key = record.message ?? record.reason ?? 'unknown failure';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([message, count]) => `Failure kind x${count}: ${message}`);
}

/**
 * @param {string} text
 * @returns {string}
 */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}
