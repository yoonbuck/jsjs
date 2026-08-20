/**
 * Node boundary for the checked-in ES2015 Test262 taxonomy.
 */

import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { createNodeTest262Host } from './adapters/node.js';
import { createJsjsTest262Engine } from './engine.js';
import {
  ES2015_ANCHORS_FILE,
  ES2015_POLICY_FILE,
  ES2015_TAXONOMY_VERSION,
  buildEs2015Inventory,
  classifyEs2015Inventory,
  parseEs2015Anchors,
  parseEs2015Policy,
  summarizeEs2015Classification,
} from './es2015-taxonomy.js';
import {
  ES2015_PROVENANCE_DECISION_CODES,
  ES2015_PROVENANCE_FILE,
  parseEs2015DecisionFragment,
  parseEs2015ProvenanceManifest,
  validateDecisionFragments,
} from './es2015-provenance.js';
import {
  assertExactH0DispositionDelta,
  buildEs2015H0Disposition,
  buildEs2015H0OwnerDeltas,
  buildEs2015Promotion,
  ES2015_PROMOTION_FILE,
  ES2015_H0_DISPOSITION_FILE,
  ES2015_H0_OWNER_DELTAS_FILE,
  ES2015_H0_OWNER_MAP_FILE,
  ES2015_H0_PROMOTION_FILE,
  ES2015_H0_PROMOTION_GROUP,
  parseEs2015Promotion,
  parseEs2015H0Disposition,
  promotionPaths,
  supportedFeaturesForPromotedPath,
  validateEs2015Promotion,
} from './es2015-promotion.js';
import {
  COVERAGE_DOCUMENT_FILE,
  collectTest262Inventory,
  formatCoverageLines,
  renderCoverageSummary,
  replaceGeneratedBlock,
  summarizeTest262Coverage,
} from './coverage.js';
import { featureNames, parseFeatureManifest } from './features.js';
import { parseTest262Metadata } from './metadata.js';
import { assertPinnedCheckout, readTest262Pin } from './pin.js';
import {
  createSummaryRecord,
  createTestRecord,
  formatRecordLine,
  formatReportLines,
} from './report.js';
import { runTest262Suite } from './runner.js';
import { sortStrings } from './selection.js';
import {
  formatUpstreamSummaryLines,
  parseUpstreamSubset,
  summarizeUpstreamRun,
  upstreamRunResultPasses,
  upstreamSubsetPaths,
} from './upstream.js';

export const ES2015_TAXONOMY_ARTIFACT = 'tools/test262/es2015-taxonomy.json';
export const ES2015_AUDIT_EVIDENCE_FILE =
  'tools/test262/es2015-audit-evidence.json';
export const ES2015_AUDIT_EVIDENCE_VERSION = 1;
export const ES2015_AUDIT_VERSION = 3;

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const SUBSET_FILE = 'tools/test262/upstream-subset.json';
const FEATURES_FILE = 'tools/test262/features.json';
const REPORT_FILE = 'docs/test262-report.jsonl';
const PROMOTION_GROUP = 'es2015/audit-passing-promotion';
const PROVENANCE_DECISIONS_DIRECTORY =
  'tools/test262/es2015-provenance-decisions';
const ES2015_H0_PATHS_FILE = 'tools/test262/es2015-h0-paths.json';
const AUDIT_EVIDENCE_KEYS = Object.freeze([
  'version',
  'repository',
  'revision',
  'auditRecords',
  'blockers',
  'intentionalDeviations',
]);
const EXECUTION_RECORD_KEYS = Object.freeze([
  'type',
  'file',
  'variant',
  'status',
]);
const REPORT_RECORD_KEYS = Object.freeze([
  'type',
  'file',
  'variant',
  'status',
  'reason',
  'message',
  'features',
]);
const EXECUTION_STATUSES = new Set(['passed', 'failed', 'skipped']);

/**
 * @typedef {{
 *   environment: Record<string, string | undefined>,
 *   readPin: () => Promise<any>,
 *   readFile: (path: string) => Promise<string>,
 *   writeFile: (path: string, text: string) => Promise<void>,
 *   writeFilesAtomically: (files: readonly { path: string, text: string }[]) => Promise<void>,
 *   assertPinnedCheckout: (pin: any) => Promise<void>,
 *   listRoots: () => Promise<readonly string[]>,
 *   readRoot: (path: string) => Promise<string>,
 *   readIncludeDefinitions: () => Promise<Map<string, unknown>>,
 *   readProvenanceManifest: () => Promise<string>,
 *   readDecisionFragments: () => Promise<ReadonlyMap<string, string>>,
 *   readPathsFile: (path: string) => Promise<string>,
 *   runPromotion: (options: {
 *     paths: readonly string[],
 *     supportedFeatures: readonly string[],
 *     supportedFeaturesForPath: (
 *       file: string,
 *       metadata: import('./metadata.js').Test262Metadata,
 *     ) => readonly string[],
 *   }) => Promise<readonly unknown[]>,
 *   stderr: (text: string) => void,
 * }} AuditDependencies
 */

export class Es2015AuditError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'Es2015AuditError';
  }
}

/**
 * Generates, or checks, the deterministic taxonomy.
 *
 * The optional dependencies make focused tests use a tiny pinned-tree fixture;
 * production always supplies the real repository boundary.
 *
 * @param {readonly string[]} [argv]
 * @param {Partial<AuditDependencies>} [dependencies]
 * @returns {Promise<number>}
 */
export async function main(argv = [], dependencies = {}) {
  const options = parseOptions(argv);
  const deps = { ...createAuditDependencies(), ...dependencies };
  assertUtc(deps.environment);

  const pin = await deps.readPin();
  await deps.assertPinnedCheckout(pin);

  const [
    policyText,
    anchorsText,
    subsetText,
    featuresText,
    reportText,
    auditEvidenceText,
    provenanceManifestText,
    decisionFragmentTexts,
  ] = await Promise.all([
    deps.readFile(ES2015_POLICY_FILE),
    deps.readFile(ES2015_ANCHORS_FILE),
    deps.readFile(SUBSET_FILE),
    deps.readFile(FEATURES_FILE),
    deps.readFile(REPORT_FILE),
    deps.readFile(ES2015_AUDIT_EVIDENCE_FILE),
    deps.readProvenanceManifest(),
    deps.readDecisionFragments(),
  ]);
  const promotionText = await readOptionalFile(deps, ES2015_PROMOTION_FILE);
  const policy = parseEs2015Policy(policyText);
  const anchors = parseEs2015Anchors(anchorsText);
  const provenanceManifest = parseEs2015ProvenanceManifest(
    provenanceManifestText,
  );
  const parsedDecisionFragments = parseDecisionFragments(decisionFragmentTexts);
  const reviewedProvenance = withDecisionCodes(
    validateDecisionFragments(provenanceManifest, parsedDecisionFragments, {
      allowPendingReview: false,
    }),
    parsedDecisionFragments,
  );
  assertPolicyPin(policy, pin);
  const subset = parseUpstreamSubset(subsetText);
  assertSubsetPin(subset, pin);
  const features = parseFeatureManifest(featuresText);
  const promotion = parsePromotion(promotionText, subset);
  const regeneratingH0Disposition = options.writeDisposition !== null;
  const regeneratingH0Promotion =
    options.writePromotion !== null || options.writeOwnerDeltas !== null;
  const regeneratingH0Artifacts =
    regeneratingH0Disposition || regeneratingH0Promotion;
  const h0PromotionText = regeneratingH0Artifacts
    ? null
    : await readOptionalFile(deps, ES2015_H0_PROMOTION_FILE);
  const h0DispositionText = regeneratingH0Artifacts
    ? null
    : await readOptionalFile(deps, ES2015_H0_DISPOSITION_FILE);
  const h0Promotion = regeneratingH0Artifacts
    ? null
    : parsePromotion(
        h0PromotionText,
        subset,
        ES2015_H0_PROMOTION_GROUP,
        ES2015_H0_PROMOTION_FILE,
      );
  const h0Disposition =
    h0DispositionText === null
      ? null
      : parseEs2015H0Disposition(h0DispositionText);
  if (h0Promotion !== null && h0Disposition === null) {
    throw new Es2015AuditError(
      `${ES2015_H0_DISPOSITION_FILE} is required by ${ES2015_H0_PROMOTION_FILE}`,
    );
  }
  if (
    h0Promotion !== null &&
    h0Disposition !== null &&
    h0PromotionText !== null &&
    h0DispositionText !== null
  ) {
    assertH0PromotionMatchesDisposition(
      h0Promotion,
      h0Disposition,
      h0DispositionText,
    );
  }
  const t0PromotionPathSet = new Set(
    promotion === null ? [] : promotionPaths(promotion),
  );
  const h0PromotionPathSet = new Set(
    h0Promotion === null ? [] : promotionPaths(h0Promotion),
  );
  const h0DispositionPaths = new Set(
    h0Disposition === null
      ? []
      : h0Disposition.dispositions.map((entry) => entry.path),
  );
  const h0DispositionRecords =
    h0Disposition === null ? [] : h0RecordsFromDisposition(h0Disposition);
  const h0ReassignedBlockers =
    h0Disposition === null ? {} : h0BlockersFromDisposition(h0Disposition);
  const promotionPathSet = new Set([
    ...t0PromotionPathSet,
    ...h0PromotionPathSet,
  ]);

  const roots = sortStrings(await deps.listRoots()).filter(
    (path) =>
      path.startsWith('test/') &&
      path.endsWith('.js') &&
      !path.endsWith('_FIXTURE.js'),
  );
  if (roots.length === 0) {
    throw new Es2015AuditError('the pinned Test262 checkout has no test roots');
  }
  if (new Set(roots).size !== roots.length) {
    throw new Es2015AuditError(
      'the pinned Test262 checkout lists a root more than once',
    );
  }

  /** @type {Array<{ path: string, source: string }>} */
  const rootDescriptors = [];
  for (const path of roots) {
    rootDescriptors.push({ path, source: await deps.readRoot(path) });
  }
  const inventory = buildEs2015Inventory({
    roots: rootDescriptors,
    includeDefinitions: await deps.readIncludeDefinitions(),
  });
  const selectedPaths = upstreamSubsetPaths(subset);
  assertSelectedRoots(selectedPaths, roots);
  const evidence = parseAuditEvidence(auditEvidenceText, pin);
  const nonH0EvidenceBlockers = Object.fromEntries(
    Object.entries(evidence.blockers).filter(
      ([path]) => !h0DispositionPaths.has(path),
    ),
  );
  if (promotion !== null) {
    validateEs2015Promotion(promotion, {
      pin,
      policy,
      selectedPaths,
      inventory: inventory.filter((root) => t0PromotionPathSet.has(root.path)),
    });
  }
  if (h0Promotion !== null) {
    validateEs2015Promotion(h0Promotion, {
      pin,
      policy,
      selectedPaths,
      inventory: inventory.filter((root) => h0PromotionPathSet.has(root.path)),
    });
  }

  if (options.writeDisposition !== null) {
    await writeH0Disposition({
      deps,
      options,
      pin,
      features,
      inventory,
    });
    return 0;
  }
  if (options.writePromotion !== null || options.writeOwnerDeltas !== null) {
    await writeH0PromotionAndDeltas({
      deps,
      options,
      pin,
      inventory,
    });
    return 0;
  }

  if (options.writeExecution) {
    await writePromotionExecution({
      deps,
      pathsFile: options.pathsFile,
      promotion,
      evidence,
      inventory,
      supportedFeatures: featureNames(features),
    });
    return 0;
  }

  assertSelectedAuditEvidence(
    evidence.records,
    selectedPaths,
    promotionPathSet,
  );
  if (options.syncPromotedReport) {
    return synchronizePromotedReport({
      deps,
      check: options.check,
      subset,
      features,
      promotion,
      h0Promotion,
      h0DispositionRecords,
      inventory,
      reportText,
      evidence,
      selectedPaths,
    });
  }
  const selectedResults = recordsByPath(
    [
      ...parseReportRecords(reportText).filter(
        (record) =>
          selectedPaths.includes(record.file) &&
          !promotionPathSet.has(record.file),
      ),
      ...evidence.records.filter((record) =>
        t0PromotionPathSet.has(record.file),
      ),
      ...h0DispositionRecords.filter((record) =>
        h0PromotionPathSet.has(record.file),
      ),
    ],
    'selected execution evidence',
  );
  const auditResults = recordsByPath(
    [
      ...evidence.records.filter(
        (record) =>
          !t0PromotionPathSet.has(record.file) &&
          !h0DispositionPaths.has(record.file),
      ),
      ...h0DispositionRecords.filter(
        (record) =>
          h0DispositionPaths.has(record.file) &&
          !h0PromotionPathSet.has(record.file),
      ),
    ],
    'audit execution evidence',
  );
  const classifications = classifyEs2015Inventory({
    policy,
    anchors,
    inventory,
    selected: new Set(selectedPaths),
    selectedResults,
    auditResults,
    blockers: { ...nonH0EvidenceBlockers, ...h0ReassignedBlockers },
    intentionalDeviations: evidence.intentionalDeviations,
    reviewedProvenance,
  });
  const artifact = buildArtifact({
    pin,
    policy,
    anchors,
    policyText,
    anchorsText,
    subsetText,
    featuresText,
    reportText,
    auditEvidenceText,
    promotionText,
    h0DispositionText,
    h0PromotionText,
    classifications,
  });
  validateArtifact(artifact);
  const output = `${JSON.stringify(artifact, null, 2)}\n`;

  if (options.baselineTaxonomy !== null) {
    if (h0DispositionText === null || h0PromotionText === null) {
      throw new Es2015AuditError(
        '--baseline-taxonomy requires H0 disposition and promotion artifacts',
      );
    }
    const [
      baselineTaxonomyText,
      pathsManifestText,
      ownerMapText,
      ownerDeltasText,
    ] = await Promise.all([
      deps.readFile(options.baselineTaxonomy),
      deps.readFile(ES2015_H0_PATHS_FILE),
      deps.readFile(ES2015_H0_OWNER_MAP_FILE),
      deps.readFile(ES2015_H0_OWNER_DELTAS_FILE),
    ]);
    assertExactH0DispositionDelta({
      before: baselineTaxonomyText,
      after: output,
      disposition: h0DispositionText,
      promotion: h0PromotionText,
      ownerDeltas: ownerDeltasText,
      pathsManifest: pathsManifestText,
      ownerMap: ownerMapText,
    });
  }

  /** @type {string | null} */
  let current = null;
  try {
    current = await deps.readFile(ES2015_TAXONOMY_ARTIFACT);
  } catch {
    // A missing artifact is stale in check mode and created in write mode.
  }

  if (options.check) {
    if (current !== output) {
      deps.stderr(
        `${ES2015_TAXONOMY_ARTIFACT} is stale; run TZ=UTC npm run test262:es2015:audit\n`,
      );
      return 1;
    }
    return 0;
  }

  if (current !== output) {
    await deps.writeFile(ES2015_TAXONOMY_ARTIFACT, output);
  }
  return 0;
}

/**
 * Builds the real filesystem and Git boundary. Tests can point it at a temporary
 * repository without replacing the boundary's behavior.
 *
 * @param {{
 *   repositoryRootUrl?: URL,
 *   environment?: Record<string, string | undefined>,
 *   stderr?: (text: string) => void,
 * }} [options]
 * @returns {AuditDependencies}
 */
export function createAuditDependencies(options = {}) {
  const repositoryRootUrl = options.repositoryRootUrl ?? REPOSITORY_ROOT_URL;
  const readRepositoryFile = (/** @type {string} */ path) =>
    readFile(new URL(path, repositoryRootUrl), 'utf8');
  const readPin = () => readTest262Pin(repositoryRootUrl);
  const checkoutUrl = (/** @type {{ checkoutPath: string }} */ pin) =>
    new URL(`${pin.checkoutPath.replace(/\/$/u, '')}/`, repositoryRootUrl);
  const readProvenanceManifest = () =>
    readRepositoryFile(ES2015_PROVENANCE_FILE);
  const readDecisionFragments = async () =>
    new Map(
      await Promise.all(
        ES2015_PROVENANCE_DECISION_CODES.map(
          async (code) =>
            /** @type {[string, string]} */ ([
              code,
              await readRepositoryFile(
                `${PROVENANCE_DECISIONS_DIRECTORY}/${code}.json`,
              ),
            ]),
        ),
      ),
    );
  return {
    environment: options.environment ?? process.env,
    readPin,
    readFile: /** @type {(path: string) => Promise<string>} */ (
      readRepositoryFile
    ),
    writeFile: (path, text) =>
      writeFile(new URL(path, repositoryRootUrl), text, 'utf8'),
    writeFilesAtomically: (files) =>
      writeRepositoryFilesAtomically(repositoryRootUrl, files),
    assertPinnedCheckout: (pin) => assertPinnedCheckout(pin, repositoryRootUrl),
    listRoots: async () => {
      const pin = await readPin();
      const listTests = createNodeTest262Host({
        root: checkoutUrl(pin),
      }).listTests;
      if (listTests === undefined) {
        throw new Es2015AuditError('the Node Test262 host cannot list roots');
      }
      return listTests();
    },
    readRoot: async (path) => {
      const pin = await readPin();
      return createNodeTest262Host({ root: checkoutUrl(pin) }).readTest(path);
    },
    readIncludeDefinitions: async () => {
      const pin = await readPin();
      return readHarnessDefinitions(pin.checkoutPath, repositoryRootUrl);
    },
    readProvenanceManifest,
    readDecisionFragments,
    readPathsFile: (path) => readFile(path, 'utf8'),
    runPromotion: async ({
      paths,
      supportedFeatures,
      supportedFeaturesForPath,
    }) => {
      const pin = await readPin();
      const { records } = await runTest262Suite({
        engine: createJsjsTest262Engine(),
        host: createNodeTest262Host({ root: checkoutUrl(pin) }),
        paths,
        supportedFeatures,
        supportedFeaturesForPath,
      });
      return records;
    },
    stderr: options.stderr ?? ((text) => process.stderr.write(text)),
  };
}

/**
 * @param {URL} repositoryRootUrl
 * @param {readonly { path: string, text: string }[]} files
 */
async function writeRepositoryFilesAtomically(repositoryRootUrl, files) {
  if (new Set(files.map((file) => file.path)).size !== files.length) {
    throw new Es2015AuditError(
      'Atomic artifact generation requires distinct output paths',
    );
  }
  const transaction = randomUUID();
  const staged = await Promise.all(
    files.map(async (file) => {
      const target = new URL(file.path, repositoryRootUrl);
      /** @type {string | null} */
      let original = null;
      try {
        original = await readFile(target, 'utf8');
      } catch (error) {
        if (/** @type {any} */ (error)?.code !== 'ENOENT') {
          throw error;
        }
      }
      return {
        ...file,
        target,
        original,
        temporary: new URL(
          `${file.path}.${transaction}.tmp`,
          repositoryRootUrl,
        ),
      };
    }),
  );
  /** @type {typeof staged} */
  const committed = [];

  try {
    const stagedWrites = await Promise.allSettled(
      staged.map((file) => writeFile(file.temporary, file.text, 'utf8')),
    );
    const failedWrite = stagedWrites.find(
      (result) => result.status === 'rejected',
    );
    if (failedWrite?.status === 'rejected') {
      throw failedWrite.reason;
    }
    for (const file of staged) {
      await rename(file.temporary, file.target);
      committed.push(file);
    }
  } catch (error) {
    await Promise.allSettled(
      committed.map(async (file) => {
        if (file.original === null) {
          await rm(file.target, { force: true });
          return;
        }
        await writeFile(file.target, file.original, 'utf8');
      }),
    );
    throw error;
  } finally {
    await Promise.allSettled(
      staged.map((file) => rm(file.temporary, { force: true })),
    );
  }
}

/** @param {readonly string[]} argv */
function parseOptions(argv) {
  let check = false;
  /** @type {string | null} */
  let pathsFile = null;
  /** @type {string | null} */
  let pathsManifest = null;
  /** @type {string | null} */
  let ownerMap = null;
  /** @type {string | null} */
  let disposition = null;
  /** @type {string | null} */
  let promotionFile = null;
  /** @type {string | null} */
  let writeDisposition = null;
  /** @type {string | null} */
  let writePromotion = null;
  /** @type {string | null} */
  let writeOwnerDeltas = null;
  /** @type {string | null} */
  let baselineTaxonomy = null;
  let writeExecution = false;
  let syncPromotedReport = false;

  for (const argument of argv) {
    if (argument === '--check') {
      if (check) {
        throw new Es2015AuditError('The --check option must not be repeated');
      }
      check = true;
      continue;
    }
    if (argument === '--write-execution') {
      if (writeExecution) {
        throw new Es2015AuditError(
          'The --write-execution option must not be repeated',
        );
      }
      writeExecution = true;
      continue;
    }
    if (argument === '--sync-promoted-report') {
      if (syncPromotedReport) {
        throw new Es2015AuditError(
          'The --sync-promoted-report option must not be repeated',
        );
      }
      syncPromotedReport = true;
      continue;
    }
    if (argument.startsWith('--paths-file=')) {
      if (pathsFile !== null || argument.length === '--paths-file='.length) {
        throw new Es2015AuditError(
          'The --paths-file option must name one paths file',
        );
      }
      pathsFile = argument.slice('--paths-file='.length);
      continue;
    }
    if (argument.startsWith('--paths-manifest=')) {
      pathsManifest = parseSinglePathOption(
        argument,
        '--paths-manifest=',
        pathsManifest,
      );
      continue;
    }
    if (argument.startsWith('--owner-map=')) {
      ownerMap = parseSinglePathOption(argument, '--owner-map=', ownerMap);
      continue;
    }
    if (argument.startsWith('--disposition=')) {
      disposition = parseSinglePathOption(
        argument,
        '--disposition=',
        disposition,
      );
      continue;
    }
    if (argument.startsWith('--promotion-file=')) {
      promotionFile = parseSinglePathOption(
        argument,
        '--promotion-file=',
        promotionFile,
      );
      continue;
    }
    if (argument.startsWith('--write-disposition=')) {
      writeDisposition = parseSinglePathOption(
        argument,
        '--write-disposition=',
        writeDisposition,
      );
      continue;
    }
    if (argument.startsWith('--write-promotion=')) {
      writePromotion = parseSinglePathOption(
        argument,
        '--write-promotion=',
        writePromotion,
      );
      continue;
    }
    if (argument.startsWith('--write-owner-deltas=')) {
      writeOwnerDeltas = parseSinglePathOption(
        argument,
        '--write-owner-deltas=',
        writeOwnerDeltas,
      );
      continue;
    }
    if (argument.startsWith('--baseline-taxonomy=')) {
      baselineTaxonomy = parseSinglePathOption(
        argument,
        '--baseline-taxonomy=',
        baselineTaxonomy,
      );
      continue;
    }
    throw new Es2015AuditError(`Unknown audit option: ${argument}`);
  }

  if (
    check &&
    (pathsFile !== null ||
      writeExecution ||
      pathsManifest !== null ||
      ownerMap !== null ||
      disposition !== null ||
      promotionFile !== null ||
      writeDisposition !== null ||
      writePromotion !== null ||
      writeOwnerDeltas !== null)
  ) {
    throw new Es2015AuditError(
      'The --check option cannot be combined with focused H0 generation',
    );
  }
  if ((pathsFile === null) !== !writeExecution) {
    throw new Es2015AuditError(
      'Promotion execution requires both --paths-file and --write-execution',
    );
  }
  if (syncPromotedReport && writeExecution) {
    throw new Es2015AuditError(
      'Promotion execution cannot be combined with promoted-report synchronization',
    );
  }
  if (syncPromotedReport && baselineTaxonomy !== null) {
    throw new Es2015AuditError(
      '--baseline-taxonomy cannot be combined with promoted-report synchronization',
    );
  }
  const focusedModes = [
    writeExecution,
    syncPromotedReport,
    writeDisposition !== null,
    writePromotion !== null || writeOwnerDeltas !== null,
  ].filter(Boolean).length;
  if (focusedModes > 1) {
    throw new Es2015AuditError(
      'Audit cannot combine focused generation, execution, and report synchronization modes',
    );
  }
  if (writeDisposition !== null) {
    if (pathsManifest === null || ownerMap === null) {
      throw new Es2015AuditError(
        'H0 disposition generation requires --paths-manifest and --owner-map',
      );
    }
    if (
      disposition !== null ||
      writePromotion !== null ||
      writeOwnerDeltas !== null
    ) {
      throw new Es2015AuditError(
        'H0 disposition generation must run separately from promotion generation',
      );
    }
  }
  if (writePromotion !== null || writeOwnerDeltas !== null) {
    if ((writePromotion === null) !== (writeOwnerDeltas === null)) {
      throw new Es2015AuditError(
        'H0 promotion generation must write promotion and owner deltas together',
      );
    }
    if (writePromotion === writeOwnerDeltas) {
      throw new Es2015AuditError(
        'H0 promotion generation must use distinct output paths',
      );
    }
    if (pathsManifest === null || disposition === null) {
      throw new Es2015AuditError(
        'H0 promotion generation requires --paths-manifest and --disposition',
      );
    }
    if (
      promotionFile !== null &&
      writePromotion !== null &&
      promotionFile !== writePromotion
    ) {
      throw new Es2015AuditError(
        'The --promotion-file and --write-promotion paths must match',
      );
    }
  }
  return {
    check,
    pathsFile,
    pathsManifest,
    ownerMap,
    disposition,
    promotionFile,
    writeDisposition,
    writePromotion,
    writeOwnerDeltas,
    baselineTaxonomy,
    writeExecution,
    syncPromotedReport,
  };
}

/**
 * @param {string} argument
 * @param {string} prefix
 * @param {string | null} current
 */
function parseSinglePathOption(argument, prefix, current) {
  if (current !== null || argument.length === prefix.length) {
    throw new Es2015AuditError(
      `The ${prefix.slice(0, -1)} option must name one path`,
    );
  }
  return argument.slice(prefix.length);
}

/**
 * Rebuilds the broad-report artifacts without re-executing the broad subset.
 * The committed pre-promotion records remain the evidence for the existing
 * selection, while the immutable audit evidence supplies only the exact
 * promotion records.
 *
 * @param {{
 *   deps: AuditDependencies,
 *   check: boolean,
 *   subset: ReturnType<typeof parseUpstreamSubset>,
 *   features: ReturnType<typeof parseFeatureManifest>,
 *   promotion: ReturnType<typeof parseEs2015Promotion> | null,
 *   h0Promotion: ReturnType<typeof parseEs2015Promotion> | null,
 *   h0DispositionRecords: readonly any[],
 *   inventory: readonly any[],
 *   reportText: string,
 *   evidence: ReturnType<typeof parseAuditEvidence>,
 *   selectedPaths: readonly string[],
 * }} options
 * @returns {Promise<number>}
 */
async function synchronizePromotedReport(options) {
  const {
    deps,
    check,
    subset,
    features,
    promotion,
    h0Promotion,
    h0DispositionRecords,
    inventory,
    reportText,
    evidence,
    selectedPaths,
  } = options;
  if (promotion === null && h0Promotion === null) {
    throw new Es2015AuditError(
      'Promoted-report synchronization requires a reviewed promotion manifest',
    );
  }

  const promotions = [promotion, h0Promotion].filter(
    (candidate) => candidate !== null,
  );
  const promotedPaths = sortStrings(
    promotions.flatMap((candidate) => promotionPaths(candidate)),
  );
  if (new Set(promotedPaths).size !== promotedPaths.length) {
    throw new Es2015AuditError(
      'Promoted-report synchronization has overlapping promotion paths',
    );
  }
  const promoted = new Set(promotedPaths);
  const standardPromotionPaths = new Set(
    promotion === null ? [] : promotionPaths(promotion),
  );
  const h0PromotionPaths = new Set(
    h0Promotion === null ? [] : promotionPaths(h0Promotion),
  );
  const selected = new Set(selectedPaths);
  const roots = new Map(inventory.map((root) => [root.path, root]));
  const reported = parseReportTestRecords(reportText);
  /** @type {import('./report.js').Test262TestRecord[]} */
  const baseRecords = [];
  /** @type {import('./report.js').Test262TestRecord[]} */
  const reportedPromotionRecords = [];

  for (const record of reported) {
    if (!selected.has(record.file)) {
      throw new Es2015AuditError(
        `${REPORT_FILE} names a root outside the exact selected path set: ${record.file}`,
      );
    }
    if (promoted.has(record.file)) {
      reportedPromotionRecords.push(record);
    } else {
      baseRecords.push(record);
    }
  }

  const basePaths = selectedPaths.filter((path) => !promoted.has(path));
  const baseByKey = assertExactSelectedRecords(
    baseRecords,
    basePaths,
    roots,
    `${REPORT_FILE} pre-promotion records`,
  );
  const promotionEvidence = [
    ...evidence.records.filter((record) =>
      standardPromotionPaths.has(record.file),
    ),
    ...h0DispositionRecords.filter((record) =>
      h0PromotionPaths.has(record.file),
    ),
  ];

  assertPromotionExecution(promotionEvidence, promotedPaths, roots);
  const promotedByEntry = new Map(
    promotions.flatMap((candidate) =>
      candidate.entries.map((entry) => [entry.path, entry]),
    ),
  );
  const rawPromotionFeatures = new Map();
  for (const path of promotedPaths) {
    const entry = promotedByEntry.get(path);
    const root = roots.get(path);
    if (entry === undefined || root === undefined || root.metadata === null) {
      throw new Es2015AuditError(
        `${ES2015_AUDIT_EVIDENCE_FILE} names a foreign promotion root ${path}`,
      );
    }
    // Taxonomy normalizes feature sets, but broad runner records preserve source order.
    const metadata = parseTest262Metadata(await deps.readRoot(path));
    if (!sameStrings(sortStrings(metadata.features), entry.features)) {
      throw new Es2015AuditError(
        `${ES2015_PROMOTION_FILE} metadata dependencies drifted for ${path}`,
      );
    }
    rawPromotionFeatures.set(path, metadata.features);
  }
  const promotedRecords = promotionEvidence.map((record) => {
    const features = rawPromotionFeatures.get(record.file);
    if (features === undefined) {
      throw new Es2015AuditError(
        `${ES2015_AUDIT_EVIDENCE_FILE} names a foreign promotion root ${record.file}`,
      );
    }
    return createTestRecord({
      file: record.file,
      variant: record.variant,
      status: record.status,
      features,
    });
  });
  const promotedByKey = assertExactSelectedRecords(
    promotedRecords,
    promotedPaths,
    roots,
    `${ES2015_AUDIT_EVIDENCE_FILE} promotion records`,
  );

  const reportedStandardPromotionRecords = reportedPromotionRecords.filter(
    (record) => standardPromotionPaths.has(record.file),
  );
  if (reportedStandardPromotionRecords.length > 0) {
    assertExactSelectedRecords(
      reportedStandardPromotionRecords,
      [...standardPromotionPaths],
      roots,
      `${REPORT_FILE} standard promotion records`,
    );
  }
  const reportedH0PromotionRecords = reportedPromotionRecords.filter((record) =>
    h0PromotionPaths.has(record.file),
  );
  if (reportedH0PromotionRecords.length > 0) {
    assertExactSelectedRecords(
      reportedH0PromotionRecords,
      [...h0PromotionPaths],
      roots,
      `${REPORT_FILE} H0 promotion records`,
    );
  }

  const records = orderedSelectedRecords(
    selectedPaths,
    roots,
    new Map([...baseByKey, ...promotedByKey]),
  );
  const summary = createSummaryRecord(records);
  const host = /** @type {import('./runner.js').Test262Host} */ ({
    listTests: () => deps.listRoots(),
    readTest: (path) => deps.readRoot(path),
  });
  const coverage = summarizeTest262Coverage({
    inventory: await collectTest262Inventory({ host }),
    records,
    selected: selectedPaths,
  });
  const report = `${[
    ...formatReportLines(records),
    ...formatUpstreamSummaryLines(
      summarizeUpstreamRun({
        subset,
        records,
        supportedFeatures: featureNames(features),
      }),
    ),
    ...formatCoverageLines(coverage),
    formatRecordLine(summary),
  ].join('\n')}\n`;
  const block = renderCoverageSummary({
    coverage,
    reportPath: REPORT_FILE,
    reportLinkPath: REPORT_FILE.slice(REPORT_FILE.lastIndexOf('/') + 1),
  });
  const stale = await synchronizePromotedReportArtifacts({
    deps,
    report,
    block,
    check,
  });

  if (stale.length > 0) {
    deps.stderr(
      `${stale.join('\n')}\n${stale.length} generated file(s) are stale; run TZ=UTC npm run test262:es2015:sync-promoted-report\n`,
    );
    return 1;
  }

  return upstreamRunResultPasses({ summary, coverage }) ? 0 : 1;
}

/**
 * Parses only test records from a prior broad report. Other report lines are
 * intentionally regenerated from the selected records by the existing
 * summarizers, so they cannot preserve stale totals.
 *
 * @param {string} text
 * @returns {import('./report.js').Test262TestRecord[]}
 */
function parseReportTestRecords(text) {
  /** @type {import('./report.js').Test262TestRecord[]} */
  const records = [];
  for (const [index, line] of text.split('\n').entries()) {
    if (line === '') {
      continue;
    }
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Es2015AuditError(
        `${REPORT_FILE} line ${index + 1} has invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      /** @type {Record<string, unknown>} */ (parsed).type !== 'test'
    ) {
      continue;
    }
    records.push(parseReportTestRecord(parsed, index + 1));
  }
  return records;
}

/**
 * @param {object} value
 * @param {number} line
 * @returns {import('./report.js').Test262TestRecord}
 */
function parseReportTestRecord(value, line) {
  const record = /** @type {Record<string, unknown>} */ (value);
  for (const key of Object.keys(record)) {
    if (!REPORT_RECORD_KEYS.includes(key)) {
      throw new Es2015AuditError(
        `${REPORT_FILE} line ${line} test record has unknown key ${key}`,
      );
    }
  }
  for (const key of ['type', 'file', 'variant', 'status']) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Es2015AuditError(
        `${REPORT_FILE} line ${line} test record is missing ${key}`,
      );
    }
  }
  if (
    record.type !== 'test' ||
    typeof record.file !== 'string' ||
    record.file === '' ||
    (record.variant !== null &&
      (typeof record.variant !== 'string' || record.variant === '')) ||
    typeof record.status !== 'string' ||
    !EXECUTION_STATUSES.has(record.status)
  ) {
    throw new Es2015AuditError(
      `${REPORT_FILE} line ${line} has an invalid test record`,
    );
  }
  if (
    (record.reason !== undefined && typeof record.reason !== 'string') ||
    (record.message !== undefined && typeof record.message !== 'string') ||
    (record.features !== undefined &&
      (!Array.isArray(record.features) ||
        record.features.some(
          (feature) => typeof feature !== 'string' || feature === '',
        )))
  ) {
    throw new Es2015AuditError(
      `${REPORT_FILE} line ${line} has invalid optional test fields`,
    );
  }
  return createTestRecord({
    file: record.file,
    variant: record.variant,
    status: /** @type {'passed' | 'failed' | 'skipped'} */ (record.status),
    ...(record.reason === undefined ? {} : { reason: record.reason }),
    ...(record.message === undefined ? {} : { message: record.message }),
    ...(record.features === undefined
      ? {}
      : { features: /** @type {string[]} */ (record.features) }),
  });
}

/**
 * @param {readonly import('./report.js').Test262TestRecord[]} records
 * @param {readonly string[]} paths
 * @param {ReadonlyMap<string, any>} roots
 * @param {string} label
 * @returns {Map<string, import('./report.js').Test262TestRecord>}
 */
function assertExactSelectedRecords(records, paths, roots, label) {
  const expected = expectedSelectedRecordKeys(paths, roots, label);
  const actual = new Map();

  for (const record of records) {
    const key = reportRecordKey(record);
    if (!expected.has(key)) {
      throw new Es2015AuditError(
        `${label} names a foreign selected variant ${record.file} (${String(record.variant)})`,
      );
    }
    if (actual.has(key)) {
      throw new Es2015AuditError(
        `${label} repeats selected variant ${record.file} (${String(record.variant)})`,
      );
    }
    actual.set(key, record);
  }

  for (const key of expected) {
    if (actual.has(key)) {
      continue;
    }
    const [file, variant] = key.split('\u0000');
    throw new Es2015AuditError(
      `${label} is missing selected variant ${file} (${variant})`,
    );
  }
  return actual;
}

/**
 * @param {readonly string[]} paths
 * @param {ReadonlyMap<string, any>} roots
 * @param {string} label
 * @returns {Set<string>}
 */
function expectedSelectedRecordKeys(paths, roots, label) {
  const keys = new Set();
  for (const path of paths) {
    const root = roots.get(path);
    if (root === undefined || !Array.isArray(root.executionVariants)) {
      throw new Es2015AuditError(
        `${label} cannot determine the pinned execution variants for ${path}`,
      );
    }
    for (const variant of root.executionVariants) {
      if (typeof variant !== 'string' || variant === '') {
        throw new Es2015AuditError(
          `${label} cannot determine the pinned execution variants for ${path}`,
        );
      }
      const key = `${path}\u0000${variant}`;
      if (keys.has(key)) {
        throw new Es2015AuditError(
          `${label} repeats expected selected variant ${path} (${variant})`,
        );
      }
      keys.add(key);
    }
  }
  return keys;
}

/**
 * @param {readonly string[]} paths
 * @param {ReadonlyMap<string, any>} roots
 * @param {ReadonlyMap<string, import('./report.js').Test262TestRecord>} records
 * @returns {import('./report.js').Test262TestRecord[]}
 */
function orderedSelectedRecords(paths, roots, records) {
  /** @type {import('./report.js').Test262TestRecord[]} */
  const ordered = [];
  for (const key of expectedSelectedRecordKeys(
    paths,
    roots,
    'selected report records',
  )) {
    const record = records.get(key);
    if (record === undefined) {
      throw new Es2015AuditError(
        `selected report records lost expected record ${key.replace('\u0000', ' ')}`,
      );
    }
    ordered.push(record);
  }
  return ordered;
}

/**
 * @param {import('./report.js').Test262TestRecord} record
 * @returns {string}
 */
function reportRecordKey(record) {
  return `${record.file}\u0000${record.variant ?? ''}`;
}

/**
 * @param {{
 *   deps: AuditDependencies,
 *   report: string,
 *   block: string,
 *   check: boolean,
 * }} options
 * @returns {Promise<string[]>}
 */
async function synchronizePromotedReportArtifacts(options) {
  const { deps, report, block, check } = options;
  const conformance = await deps.readFile(COVERAGE_DOCUMENT_FILE);
  const updatedConformance = replaceGeneratedBlock(conformance, block);
  /** @type {string[]} */
  const stale = [];

  for (const [path, contents] of [
    [REPORT_FILE, report],
    [COVERAGE_DOCUMENT_FILE, updatedConformance],
  ]) {
    const current = await deps.readFile(path);
    if (current === contents) {
      continue;
    }
    if (check) {
      stale.push(path);
      continue;
    }
    await deps.writeFile(path, contents);
  }
  return stale;
}

/**
 * @param {AuditDependencies} deps
 * @param {string} path
 * @returns {Promise<string | null>}
 */
async function readOptionalFile(deps, path) {
  try {
    return await deps.readFile(path);
  } catch (error) {
    if (/** @type {any} */ (error)?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * @param {ReadonlyMap<string, string> | Record<string, string>} fragments
 * @returns {Map<string, ReturnType<typeof parseEs2015DecisionFragment>>}
 */
function parseDecisionFragments(fragments) {
  const entries =
    fragments instanceof Map ? [...fragments] : Object.entries(fragments);
  const parsed = new Map(
    entries.map(([code, text]) => [
      code,
      parseEs2015DecisionFragment(text, code),
    ]),
  );
  for (const code of ES2015_PROVENANCE_DECISION_CODES) {
    if (!parsed.has(code)) {
      throw new Es2015AuditError(
        `${code} decision fragment is required by ${PROVENANCE_DECISIONS_DIRECTORY}`,
      );
    }
  }
  return parsed;
}

/**
 * @param {ReadonlyMap<string, object>} decisions
 * @param {ReadonlyMap<string, ReturnType<typeof parseEs2015DecisionFragment>>} fragments
 */
function withDecisionCodes(decisions, fragments) {
  const codesByPath = new Map();
  for (const [code, fragment] of fragments) {
    for (const decision of fragment.decisions) {
      codesByPath.set(decision.path, code);
    }
  }
  return new Map(
    [...decisions].map(([path, decision]) => [
      path,
      Object.freeze({
        code: codesByPath.get(path),
        ...decision,
      }),
    ]),
  );
}

/**
 * A promotion is meaningful only alongside the one exact subset group that
 * exposes it. The pre-promotion audit has no manifest and therefore no group.
 *
 * @param {string | null} text
 * @param {ReturnType<typeof parseUpstreamSubset>} subset
 * @param {string} [groupName]
 * @param {string} [fileName]
 */
function parsePromotion(
  text,
  subset,
  groupName = PROMOTION_GROUP,
  fileName = ES2015_PROMOTION_FILE,
) {
  const groups = subset.groups.filter((group) => group.name === groupName);
  if (text === null) {
    if (groups.length > 0) {
      throw new Es2015AuditError(`${fileName} is required by ${groupName}`);
    }
    return null;
  }
  if (groups.length !== 1) {
    throw new Es2015AuditError(
      `${fileName} requires exactly one ${groupName} subset group`,
    );
  }

  const promotion = parseEs2015Promotion(text);
  if ((promotion.groupName ?? PROMOTION_GROUP) !== groupName) {
    throw new Es2015AuditError(`${fileName} must declare ${groupName}`);
  }
  const paths = promotionPaths(promotion);
  if (!sameStrings(groups[0].paths, paths)) {
    throw new Es2015AuditError(
      `${groupName} must select exactly the reviewed promotion paths`,
    );
  }
  return promotion;
}

/** @param {ReturnType<typeof parseEs2015H0Disposition>} disposition */
function h0RecordsFromDisposition(disposition) {
  /** @type {Array<{ type: 'test', file: string, variant: string, status: 'passed' | 'failed' | 'skipped' }>} */
  const records = [];
  for (const entry of disposition.dispositions) {
    for (const evidence of entry.evidence) {
      records.push({
        type: 'test',
        file: entry.path,
        variant: evidence.variant,
        status: /** @type {'passed' | 'failed' | 'skipped'} */ (
          evidence.status
        ),
      });
    }
  }
  return records;
}

/** @param {ReturnType<typeof parseEs2015H0Disposition>} disposition */
function h0BlockersFromDisposition(disposition) {
  /** @type {Record<string, string>} */
  const blockers = {};
  for (const entry of disposition.dispositions) {
    if (entry.status === 'reassigned') {
      blockers[entry.path] = entry.primaryOwner.blocker;
    }
  }
  return blockers;
}

/**
 * @param {ReturnType<typeof parseEs2015Promotion>} promotion
 * @param {ReturnType<typeof parseEs2015H0Disposition>} disposition
 * @param {string} dispositionText
 */
function assertH0PromotionMatchesDisposition(
  promotion,
  disposition,
  dispositionText,
) {
  const passed = disposition.dispositions.filter(
    (entry) => entry.status === 'passed',
  );
  const passedPaths = passed.map((entry) => entry.path);
  const passedVariants = passed.reduce(
    (total, entry) => total + entry.variants,
    0,
  );
  if (
    promotion.groupName !== ES2015_H0_PROMOTION_GROUP ||
    !('h0LedgerSha256' in promotion) ||
    promotion.sourceTaxonomySha256 !== disposition.sourceTaxonomySha256 ||
    promotion.h0LedgerSha256 !== disposition.h0LedgerSha256 ||
    promotion.h0RootCount !== disposition.h0RootCount ||
    promotion.h0VariantCount !== disposition.h0VariantCount ||
    promotion.dispositionSha256 !== sha256(dispositionText) ||
    promotion.promotedRootCount !== passed.length ||
    promotion.promotedVariantCount !== passedVariants ||
    !sameStrings(promotionPaths(promotion), passedPaths)
  ) {
    throw new Es2015AuditError(
      `${ES2015_H0_PROMOTION_FILE} does not match complete passed H0 dispositions`,
    );
  }
}

/**
 * Audit evidence normally covers only unselected roots. Promoted roots are the
 * narrow exception: their exact audit records become selected execution
 * evidence only after the immutable promotion manifest and subset group agree.
 *
 * @param {readonly any[]} records
 * @param {readonly string[]} selectedPaths
 * @param {ReadonlySet<string>} promoted
 */
function assertSelectedAuditEvidence(records, selectedPaths, promoted) {
  const selected = new Set(selectedPaths);
  for (const record of records) {
    if (selected.has(record.file) && !promoted.has(record.file)) {
      throw new Es2015AuditError(
        `${ES2015_AUDIT_EVIDENCE_FILE} names selected non-promotion root ${record.file}`,
      );
    }
  }
}

/**
 * @param {{
 *   deps: AuditDependencies,
 *   options: ReturnType<typeof parseOptions>,
 *   pin: { repository: string, revision: string },
 *   features: ReturnType<typeof parseFeatureManifest>,
 *   inventory: readonly any[],
 * }} context
 */
async function writeH0Disposition(context) {
  const { deps, options, pin, features, inventory } = context;
  if (
    options.pathsManifest === null ||
    options.ownerMap === null ||
    options.writeDisposition === null
  ) {
    throw new Es2015AuditError('H0 disposition generation is not configured');
  }
  const [pathsManifestText, ownerMapText, baselineTaxonomyText] =
    await Promise.all([
      deps.readFile(options.pathsManifest),
      deps.readFile(options.ownerMap),
      deps.readFile(options.baselineTaxonomy ?? ES2015_TAXONOMY_ARTIFACT),
    ]);
  const pathsManifest = JSON.parse(pathsManifestText);
  const paths = sortedPathsManifestPaths(pathsManifest, options.pathsManifest);
  const taxonomyFeatures = taxonomyFeaturesByPath(baselineTaxonomyText);
  const h0Inventory = inventory.filter((root) => paths.includes(root.path));
  const records = await deps.runPromotion({
    paths,
    supportedFeatures: featureNames(features),
    supportedFeaturesForPath(file, metadata) {
      const expected = taxonomyFeatures.get(file);
      if (expected === undefined) {
        throw new Es2015AuditError(
          `${ES2015_TAXONOMY_ARTIFACT} must still classify ${file}`,
        );
      }
      const actual = sortStrings([...(metadata.features ?? [])]);
      if (!sameStrings(actual, expected)) {
        throw new Es2015AuditError(
          `${ES2015_TAXONOMY_ARTIFACT} feature tags drifted for ${file}`,
        );
      }
      return expected;
    },
  });
  const executionEvidenceText = `${JSON.stringify(
    {
      version: ES2015_AUDIT_EVIDENCE_VERSION,
      repository: pin.repository,
      revision: pin.revision,
      records: records.map((record) => normalizeH0ExecutionRecord(record)),
    },
    null,
    2,
  )}\n`;
  const disposition = buildEs2015H0Disposition({
    pathsManifestText,
    baselineTaxonomyText,
    executionEvidenceText,
    ownerMapText,
    pin,
    inventory: h0Inventory,
  });
  await deps.writeFile(
    options.writeDisposition,
    `${JSON.stringify(disposition, null, 2)}\n`,
  );
}

/**
 * @param {{
 *   deps: AuditDependencies,
 *   options: ReturnType<typeof parseOptions>,
 *   pin: { repository: string, revision: string },
 *   inventory: readonly any[],
 * }} context
 */
async function writeH0PromotionAndDeltas(context) {
  const { deps, options, pin, inventory } = context;
  if (
    options.pathsManifest === null ||
    options.disposition === null ||
    options.writePromotion === null ||
    options.writeOwnerDeltas === null
  ) {
    throw new Es2015AuditError('H0 promotion generation is not configured');
  }
  const [
    pathsManifestText,
    dispositionText,
    baselineTaxonomyText,
    ownerMapText,
  ] = await Promise.all([
    deps.readFile(options.pathsManifest),
    deps.readFile(options.disposition),
    deps.readFile(options.baselineTaxonomy ?? ES2015_TAXONOMY_ARTIFACT),
    deps.readFile(ES2015_H0_OWNER_MAP_FILE),
  ]);
  const pathsManifest = JSON.parse(pathsManifestText);
  const paths = sortedPathsManifestPaths(pathsManifest, options.pathsManifest);
  const h0Inventory = inventory.filter((root) => paths.includes(root.path));
  const promotion = buildEs2015Promotion({
    sourceTaxonomyText: baselineTaxonomyText,
    dispositionText,
    pin,
    inventory: h0Inventory,
  });
  const promotionText = `${JSON.stringify(promotion, null, 2)}\n`;
  const afterTaxonomyText = renderTaxonomyWithH0Disposition(
    baselineTaxonomyText,
    JSON.parse(dispositionText),
  );
  const ownerDeltas = buildEs2015H0OwnerDeltas({
    beforeTaxonomyText: baselineTaxonomyText,
    afterTaxonomyText,
    dispositionText,
    promotionText,
  });
  assertExactH0DispositionDelta({
    before: baselineTaxonomyText,
    after: afterTaxonomyText,
    disposition: dispositionText,
    promotion: promotionText,
    ownerDeltas,
    pathsManifest: pathsManifestText,
    ownerMap: ownerMapText,
  });
  await deps.writeFilesAtomically([
    { path: options.writePromotion, text: promotionText },
    {
      path: options.writeOwnerDeltas,
      text: `${JSON.stringify(ownerDeltas, null, 2)}\n`,
    },
  ]);
}

/** @param {any} record */
function normalizeH0ExecutionRecord(record) {
  const value = /** @type {any} */ (record);
  return {
    type: value?.type,
    file: value?.file,
    variant: value?.variant,
    status: value?.status,
    ...(value?.reason === undefined ? {} : { reason: value.reason }),
    ...(value?.message === undefined ? {} : { message: value.message }),
  };
}

/** @param {any} pathsManifest @param {string} label */
function sortedPathsManifestPaths(pathsManifest, label) {
  if (
    typeof pathsManifest !== 'object' ||
    pathsManifest === null ||
    !Array.isArray(pathsManifest.paths)
  ) {
    throw new Es2015AuditError(`${label} must contain a paths array`);
  }
  const paths = sortStrings([...pathsManifest.paths]);
  if (
    paths.some((path) => typeof path !== 'string') ||
    !sameStrings(pathsManifest.paths, paths) ||
    new Set(paths).size !== paths.length
  ) {
    throw new Es2015AuditError(`${label} paths must be sorted and unique`);
  }
  return paths;
}

/** @param {string} taxonomyText */
function taxonomyFeaturesByPath(taxonomyText) {
  const taxonomy = JSON.parse(taxonomyText);
  if (!Array.isArray(taxonomy.classifications)) {
    throw new Es2015AuditError(`${ES2015_TAXONOMY_ARTIFACT} is invalid`);
  }
  const features = new Map();
  for (const entry of taxonomy.classifications) {
    if (typeof entry?.path === 'string') {
      features.set(entry.path, sortStrings([...(entry.features ?? [])]));
    }
  }
  return features;
}

/**
 * @param {string} taxonomyText
 * @param {any} disposition
 */
function renderTaxonomyWithH0Disposition(taxonomyText, disposition) {
  const taxonomy = JSON.parse(taxonomyText);
  const dispositions = new Map(
    disposition.dispositions.map((/** @type {any} */ entry) => [
      entry.path,
      entry,
    ]),
  );
  taxonomy.classifications = taxonomy.classifications.map(
    (/** @type {any} */ entry) => {
      const h0 = dispositions.get(entry.path);
      if (h0 === undefined) {
        return entry;
      }
      if (h0.status === 'passed') {
        return {
          ...entry,
          status: 'selected-passing',
          blocker: null,
        };
      }
      return {
        ...entry,
        status: `blocked:${h0.primaryOwner.blocker}`,
        blocker: h0.primaryOwner.blocker,
      };
    },
  );
  return `${JSON.stringify(taxonomy)}\n`;
}

/**
 * @param {{
 *   deps: AuditDependencies,
 *   pathsFile: string | null,
 *   promotion: ReturnType<typeof parseEs2015Promotion> | null,
 *   evidence: ReturnType<typeof parseAuditEvidence>,
 *   inventory: readonly any[],
 *   supportedFeatures: readonly string[],
 * }} options
 */
async function writePromotionExecution(options) {
  const { deps, pathsFile, promotion, evidence, inventory, supportedFeatures } =
    options;
  if (promotion === null || pathsFile === null) {
    throw new Es2015AuditError(
      'Promotion execution requires a reviewed promotion manifest and paths file',
    );
  }
  const pathsText = await deps.readPathsFile(pathsFile);
  const paths = parsePromotionPathsFile(pathsText, pathsFile, promotion);
  const roots = new Map(inventory.map((root) => [root.path, root]));
  const promoted = new Set(paths);

  const execution = await deps.runPromotion({
    paths,
    supportedFeatures,
    supportedFeaturesForPath(file, metadata) {
      const root = roots.get(file);
      if (root === undefined || root.metadata === null) {
        throw new Es2015AuditError(
          `${ES2015_PROMOTION_FILE} path ${file} is missing from the pinned inventory`,
        );
      }
      return supportedFeaturesForPromotedPath(
        promotion,
        file,
        metadata,
        root.includeFeatures,
      );
    },
  });
  const records = execution.map((record, index) =>
    normalizeExecutionRecord(record, index),
  );
  assertPromotionExecution(records, paths, roots);

  const combined = sortAuditRecords([
    ...evidence.records.filter((record) => !promoted.has(record.file)),
    ...records,
  ]);
  const output = `${JSON.stringify(
    {
      version: ES2015_AUDIT_EVIDENCE_VERSION,
      repository: promotion.repository,
      revision: promotion.revision,
      auditRecords: combined,
      blockers: evidence.blockers,
      intentionalDeviations: evidence.intentionalDeviations,
    },
    null,
    2,
  )}\n`;
  await deps.writeFile(ES2015_AUDIT_EVIDENCE_FILE, output);
}

/**
 * @param {string} text
 * @param {string} path
 * @param {ReturnType<typeof parseEs2015Promotion>} promotion
 */
function parsePromotionPathsFile(text, path, promotion) {
  if (typeof text !== 'string' || sha256(text) !== promotion.ledgerSha256) {
    throw new Es2015AuditError(
      `Promotion paths file ${path} does not match ${ES2015_PROMOTION_FILE} ledgerSha256`,
    );
  }
  const paths = text.endsWith('\n')
    ? text.slice(0, -1).split('\n')
    : text.split('\n');
  if (
    paths.length === 0 ||
    paths.some((entry) => entry === '') ||
    !sameStrings(paths, sortStrings([...paths])) ||
    new Set(paths).size !== paths.length ||
    !sameStrings(paths, promotionPaths(promotion))
  ) {
    throw new Es2015AuditError(
      `Promotion paths file ${path} does not match the reviewed exact path set`,
    );
  }
  return paths;
}

/**
 * @param {unknown} record
 * @param {number} index
 */
function normalizeExecutionRecord(record, index) {
  const value = /** @type {any} */ (record);
  return parseAuditRecord(
    {
      type: value?.type,
      file: value?.file,
      variant: value?.variant,
      status: value?.status,
    },
    index,
  );
}

/**
 * @param {readonly ReturnType<typeof parseAuditRecord>[]} records
 * @param {readonly string[]} paths
 * @param {ReadonlyMap<string, any>} roots
 */
function assertPromotionExecution(records, paths, roots) {
  const byPath = recordsByPath(records, 'promotion execution');
  for (const record of records) {
    if (record.status !== 'passed') {
      throw new Es2015AuditError(
        `Promotion execution did not pass ${record.file} (${record.variant})`,
      );
    }
  }
  for (const path of paths) {
    const root = roots.get(path);
    const recordsForPath = byPath.get(path);
    if (
      root === undefined ||
      !Array.isArray(root.executionVariants) ||
      recordsForPath === undefined ||
      recordsForPath.length !== root.executionVariants.length
    ) {
      throw new Es2015AuditError(
        `Promotion execution has incomplete variants for ${path}`,
      );
    }
    const actual = sortStrings(recordsForPath.map((record) => record.variant));
    if (!sameStrings(actual, root.executionVariants)) {
      throw new Es2015AuditError(
        `Promotion execution has incorrect variants for ${path}`,
      );
    }
  }
  if (byPath.size !== paths.length) {
    throw new Es2015AuditError(
      'Promotion execution names a root outside the reviewed exact path set',
    );
  }
}

/** @param {readonly ReturnType<typeof parseAuditRecord>[]} records */
function sortAuditRecords(records) {
  const keys = records.map((record) => `${record.file}\u0000${record.variant}`);
  if (new Set(keys).size !== keys.length) {
    throw new Es2015AuditError(
      `${ES2015_AUDIT_EVIDENCE_FILE} must not repeat execution records`,
    );
  }
  const byKey = new Map(
    records.map((record) => [`${record.file}\u0000${record.variant}`, record]),
  );
  return sortStrings(keys).map((key) => {
    const record = byKey.get(key);
    if (record === undefined) {
      throw new Es2015AuditError(
        `${ES2015_AUDIT_EVIDENCE_FILE} lost an execution record`,
      );
    }
    return record;
  });
}

/** @param {Record<string, string | undefined>} environment */
function assertUtc(environment) {
  if (environment.TZ !== 'UTC') {
    throw new Es2015AuditError(
      `The ES2015 taxonomy must be generated under UTC, but TZ is ${environment.TZ ?? 'unset'}`,
    );
  }
}

/** @param {any} policy @param {any} pin */
function assertPolicyPin(policy, pin) {
  if (
    policy.repository !== pin.repository ||
    policy.revision !== pin.revision
  ) {
    throw new Es2015AuditError(
      `${ES2015_POLICY_FILE} does not match the package.json Test262 pin`,
    );
  }
}

/** @param {any} subset @param {any} pin */
function assertSubsetPin(subset, pin) {
  if (
    subset.repository !== pin.repository ||
    subset.revision !== pin.revision
  ) {
    throw new Es2015AuditError(
      `${SUBSET_FILE} does not match the package.json Test262 pin`,
    );
  }
}

/**
 * @param {readonly string[]} selected
 * @param {readonly string[]} roots
 */
function assertSelectedRoots(selected, roots) {
  const known = new Set(roots);
  for (const path of selected) {
    if (!known.has(path)) {
      throw new Es2015AuditError(
        `${SUBSET_FILE} selects missing pinned root ${path}`,
      );
    }
  }
}

/**
 * @param {string} text
 * @returns {Array<{ type: 'test', file: string, variant: string, status: 'passed' | 'failed' | 'skipped' }>}
 */
function parseReportRecords(text) {
  /** @type {Array<any>} */
  const records = [];
  for (const line of text.split('\n')) {
    if (line === '') {
      continue;
    }
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new Es2015AuditError(
        `${REPORT_FILE} has invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (record?.type === 'test') {
      records.push(record);
    }
  }
  return records;
}

/**
 * Parses the independent, checked-in evidence input. The taxonomy artifact is
 * deliberately not an input here: generation must be possible when it is
 * missing or stale.
 *
 * @param {string} text
 * @param {{ repository: string, revision: string }} pin
 * @returns {{
 *   records: readonly any[],
 *   blockers: Record<string, string>,
 *   intentionalDeviations: readonly string[],
 * }}
 */
function parseAuditEvidence(text, pin) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Es2015AuditError(
      `${ES2015_AUDIT_EVIDENCE_FILE} has invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Es2015AuditError(
      `${ES2015_AUDIT_EVIDENCE_FILE} must contain an object`,
    );
  }
  const evidence = /** @type {Record<string, unknown>} */ (parsed);
  requireExactKeys(evidence, AUDIT_EVIDENCE_KEYS, ES2015_AUDIT_EVIDENCE_FILE);
  if (evidence.version !== ES2015_AUDIT_EVIDENCE_VERSION) {
    throw new Es2015AuditError(
      `${ES2015_AUDIT_EVIDENCE_FILE} must declare version ${ES2015_AUDIT_EVIDENCE_VERSION}`,
    );
  }
  if (
    evidence.repository !== pin.repository ||
    evidence.revision !== pin.revision
  ) {
    throw new Es2015AuditError(
      `${ES2015_AUDIT_EVIDENCE_FILE} does not match the package.json Test262 pin`,
    );
  }
  if (!Array.isArray(evidence.auditRecords)) {
    throw new Es2015AuditError(
      `${ES2015_AUDIT_EVIDENCE_FILE} auditRecords must be an array`,
    );
  }

  const records = evidence.auditRecords.map((record, index) =>
    parseAuditRecord(record, index),
  );
  const recordKeys = records.map(
    (record) => `${record.file}\u0000${record.variant}`,
  );
  assertSortedUnique(recordKeys, 'auditRecords');

  if (
    typeof evidence.blockers !== 'object' ||
    evidence.blockers === null ||
    Array.isArray(evidence.blockers)
  ) {
    throw new Es2015AuditError(
      `${ES2015_AUDIT_EVIDENCE_FILE} blockers must be an object`,
    );
  }
  const rawBlockers = /** @type {Record<string, unknown>} */ (
    evidence.blockers
  );
  const blockerPaths = Object.keys(rawBlockers);
  assertSortedUnique(blockerPaths, 'blocker paths');
  /** @type {Record<string, string>} */
  const blockers = {};
  for (const path of blockerPaths) {
    const blocker = rawBlockers[path];
    if (typeof blocker !== 'string' || blocker === '') {
      throw new Es2015AuditError(
        `${ES2015_AUDIT_EVIDENCE_FILE} blocker ${path} must be a non-empty string`,
      );
    }
    blockers[path] = blocker;
  }

  if (!Array.isArray(evidence.intentionalDeviations)) {
    throw new Es2015AuditError(
      `${ES2015_AUDIT_EVIDENCE_FILE} intentionalDeviations must be an array`,
    );
  }
  const intentionalDeviations = evidence.intentionalDeviations;
  if (
    intentionalDeviations.some(
      (path) => typeof path !== 'string' || path === '',
    )
  ) {
    throw new Es2015AuditError(
      `${ES2015_AUDIT_EVIDENCE_FILE} intentionalDeviations must contain non-empty strings`,
    );
  }
  assertSortedUnique(
    /** @type {string[]} */ (intentionalDeviations),
    'intentional deviations',
  );

  return {
    records,
    blockers,
    intentionalDeviations: /** @type {readonly string[]} */ (
      intentionalDeviations
    ),
  };
}

/**
 * @param {unknown} record
 * @param {number} index
 */
function parseAuditRecord(record, index) {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    throw new Es2015AuditError(
      `${ES2015_AUDIT_EVIDENCE_FILE} audit record ${index} must be an object`,
    );
  }
  const value = /** @type {Record<string, unknown>} */ (record);
  requireExactKeys(
    value,
    EXECUTION_RECORD_KEYS,
    `${ES2015_AUDIT_EVIDENCE_FILE} audit record ${index}`,
  );
  if (
    value.type !== 'test' ||
    typeof value.file !== 'string' ||
    value.file === '' ||
    typeof value.variant !== 'string' ||
    value.variant === '' ||
    typeof value.status !== 'string' ||
    !EXECUTION_STATUSES.has(value.status)
  ) {
    throw new Es2015AuditError(
      `${ES2015_AUDIT_EVIDENCE_FILE} audit record ${index} is invalid`,
    );
  }
  return {
    type: 'test',
    file: value.file,
    variant: value.variant,
    status: value.status,
  };
}

/** @param {readonly string[]} values @param {string} label */
function assertSortedUnique(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Es2015AuditError(
      `${ES2015_AUDIT_EVIDENCE_FILE} ${label} must not repeat entries`,
    );
  }
  if (values.join('\u0000') !== sortStrings([...values]).join('\u0000')) {
    throw new Es2015AuditError(
      `${ES2015_AUDIT_EVIDENCE_FILE} ${label} must be code-unit sorted`,
    );
  }
}

/** @param {readonly string[]} left @param {readonly string[]} right */
function sameStrings(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

/**
 * @param {Record<string, unknown>} record
 * @param {readonly string[]} expected
 * @param {string} label
 */
function requireExactKeys(record, expected, label) {
  for (const key of Object.keys(record)) {
    if (!expected.includes(key)) {
      throw new Es2015AuditError(`${label} has unknown key ${key}`);
    }
  }
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Es2015AuditError(`${label} is missing key ${key}`);
    }
  }
}

/**
 * @param {readonly any[]} records
 * @param {string} name
 */
function recordsByPath(records, name) {
  /** @type {Map<string, any[]>} */
  const values = new Map();
  for (const record of records) {
    if (
      record?.type !== 'test' ||
      typeof record.file !== 'string' ||
      typeof record.variant !== 'string' ||
      !EXECUTION_STATUSES.has(record.status)
    ) {
      throw new Es2015AuditError(`${name} has an invalid record`);
    }
    const entries = values.get(record.file) ?? [];
    entries.push({
      type: 'test',
      file: record.file,
      variant: record.variant,
      status: record.status,
    });
    values.set(record.file, entries);
  }
  return values;
}

/**
 * Reads every harness name and joins the feature aliases from the pinned
 * `features.yml`. Both `name` and `name.js` resolve to the same facts, so an
 * include cannot discard a later dependency by choosing the other spelling.
 *
 * @param {string} checkoutPath
 * @param {URL} [repositoryRootUrl]
 */
async function readHarnessDefinitions(
  checkoutPath,
  repositoryRootUrl = REPOSITORY_ROOT_URL,
) {
  const root = new URL(
    `${checkoutPath.replace(/\/$/u, '')}/harness/`,
    repositoryRootUrl,
  );
  const definitions = new Map();
  for (const name of await listFiles(root)) {
    const facts = { features: [], includes: [] };
    definitions.set(name, facts);
    if (name.endsWith('.js')) {
      definitions.set(name.slice(0, -'.js'.length), facts);
    }
  }
  /** @type {unknown} */
  let manifest;
  try {
    manifest = parseYaml(await readFile(new URL('features.yml', root), 'utf8'));
  } catch (error) {
    throw new Es2015AuditError(
      `vendor/test262/harness/features.yml is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    Array.isArray(manifest)
  ) {
    throw new Es2015AuditError(
      'vendor/test262/harness/features.yml must map include names to facts',
    );
  }

  const declared = new Set();
  for (const [name, value] of Object.entries(manifest)) {
    const aliases = harnessAliases(name);
    const identity = aliases[0];
    if (declared.has(identity)) {
      throw new Es2015AuditError(
        `vendor/test262/harness/features.yml repeats include alias ${name}`,
      );
    }
    if (!aliases.some((alias) => definitions.has(alias))) {
      throw new Es2015AuditError(
        `vendor/test262/harness/features.yml names missing include ${name}`,
      );
    }
    declared.add(identity);
    const facts = parseHarnessFacts(value, name);
    for (const alias of aliases) {
      definitions.set(alias, facts);
    }
  }
  return definitions;
}

/** @param {string} name */
function harnessAliases(name) {
  return name.endsWith('.js')
    ? [name.slice(0, -'.js'.length), name]
    : [name, `${name}.js`];
}

/**
 * @param {unknown} value
 * @param {string} name
 */
function parseHarnessFacts(value, name) {
  if (Array.isArray(value)) {
    return {
      features: harnessStrings(value, `${name} features`),
      includes: [],
    };
  }
  if (typeof value !== 'object' || value === null) {
    throw new Es2015AuditError(
      `vendor/test262/harness/features.yml include ${name} has invalid facts`,
    );
  }
  const facts = /** @type {Record<string, unknown>} */ (value);
  for (const key of Object.keys(facts)) {
    if (key !== 'features' && key !== 'includes') {
      throw new Es2015AuditError(
        `vendor/test262/harness/features.yml include ${name} has unknown key ${key}`,
      );
    }
  }
  return {
    features: harnessStrings(facts.features ?? [], `${name} features`),
    includes: harnessStrings(facts.includes ?? [], `${name} includes`),
  };
}

/** @param {unknown} values @param {string} label */
function harnessStrings(values, label) {
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== 'string' || value === '')
  ) {
    throw new Es2015AuditError(
      `vendor/test262/harness/features.yml ${label} must be non-empty strings`,
    );
  }
  if (new Set(values).size !== values.length) {
    throw new Es2015AuditError(
      `vendor/test262/harness/features.yml ${label} must not repeat entries`,
    );
  }
  return sortStrings([...values]);
}

/** @param {URL} directory @param {string} [prefix] */
async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = sortStrings(entries.map((entry) => entry.name));
  /** @type {string[]} */
  const files = [];
  for (const name of names) {
    const entry = entries.find((candidate) => candidate.name === name);
    const relative = `${prefix}${name}`;
    if (entry?.isDirectory()) {
      files.push(
        ...(await listFiles(new URL(`${name}/`, directory), `${relative}/`)),
      );
    } else if (entry?.isFile()) {
      files.push(relative);
    }
  }
  return files;
}

/**
 * @param {{
 *   pin: any, policy: any, anchors: any, policyText: string, anchorsText: string,
 *   subsetText: string, featuresText: string, reportText: string,
 *   auditEvidenceText: string,
 *   promotionText: string | null,
 *   h0DispositionText?: string | null,
 *   h0PromotionText?: string | null,
 *   classifications: readonly any[],
 * }} options
 */
function buildArtifact(options) {
  const summary = summarizeEs2015Classification(options.classifications);
  return {
    version: ES2015_AUDIT_VERSION,
    pin: {
      repository: options.pin.repository,
      revision: options.pin.revision,
    },
    policy: {
      version: ES2015_TAXONOMY_VERSION,
      source: options.policy.specification.source,
      sourceSha256: options.policy.specification.sourceSha256,
      anchors: options.anchors.anchors.length,
    },
    inputs: {
      policySha256: sha256(options.policyText),
      anchorsSha256: sha256(options.anchorsText),
      subsetSha256: sha256(options.subsetText),
      featuresSha256: sha256(options.featuresText),
      selectedEvidenceSha256: sha256(options.reportText),
      auditEvidenceSha256: sha256(options.auditEvidenceText),
      ...(options.promotionText === null
        ? {}
        : { promotionSha256: sha256(options.promotionText) }),
      ...(options.h0DispositionText == null
        ? {}
        : { h0DispositionSha256: sha256(options.h0DispositionText) }),
      ...(options.h0PromotionText == null
        ? {}
        : { h0PromotionSha256: sha256(options.h0PromotionText) }),
    },
    summary,
    statusTables: statusTables(options.classifications),
    classifications: options.classifications,
  };
}

/** @param {readonly any[]} classifications */
function statusTables(classifications) {
  return {
    core: statusTable(
      classifications.filter((entry) => entry.partition === 'core'),
    ),
    annexB: statusTable(
      classifications.filter((entry) => entry.partition === 'annex-b'),
    ),
    blockers: blockerTable(classifications),
  };
}

/** @param {readonly any[]} entries */
function statusTable(entries) {
  return countTable(entries, (entry) => entry.status);
}

/** @param {readonly any[]} entries */
function blockerTable(entries) {
  return countTable(
    entries.filter((entry) => entry.blocker !== null),
    (entry) => entry.blocker,
  );
}

/** @param {readonly any[]} entries @param {(entry: any) => string} name */
function countTable(entries, name) {
  const totals = new Map();
  for (const entry of entries) {
    const key = name(entry);
    const total = totals.get(key) ?? { roots: 0, variants: 0 };
    total.roots += 1;
    total.variants += entry.variants;
    totals.set(key, total);
  }
  return sortStrings([...totals.keys()]).map((key) => ({
    name: key,
    ...totals.get(key),
  }));
}

/** @param {any} artifact */
function validateArtifact(artifact) {
  const classifications = artifact.classifications;
  if (
    !Array.isArray(classifications) ||
    classifications.length !== artifact.summary.roots
  ) {
    throw new Es2015AuditError(
      'taxonomy classifications do not balance with the root total',
    );
  }
  const recomputed = summarizeEs2015Classification(classifications);
  if (JSON.stringify(recomputed) !== JSON.stringify(artifact.summary)) {
    throw new Es2015AuditError(
      'taxonomy classifications do not balance with the partition table',
    );
  }
  const expectedTables = statusTables(classifications);
  if (
    JSON.stringify(expectedTables) !== JSON.stringify(artifact.statusTables)
  ) {
    throw new Es2015AuditError(
      'taxonomy classifications do not balance with the status tables',
    );
  }
  if (artifact.policy.version !== ES2015_TAXONOMY_VERSION) {
    throw new Es2015AuditError('taxonomy artifact schema drifted');
  }
}

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (status) => {
      process.exitCode = status;
    },
    (error) => {
      process.stderr.write(
        `${error instanceof Error ? error.stack : String(error)}\n`,
      );
      process.exitCode = 1;
    },
  );
}
