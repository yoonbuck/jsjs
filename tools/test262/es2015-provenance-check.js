import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  APPROVED_INITIAL_ROADMAP_AUTHORITIES,
  CLOSED_PROVENANCE_GENERATED_PATHS,
  ES2015_PROVENANCE_DECISION_CODES,
  ES2015_PROVENANCE_FILE,
  ES2015_PROVENANCE_MANIFEST_VERSIONS,
  ES2015_PROVENANCE_VERSION,
  Es2015ProvenanceError,
  PROVENANCE_RANGE_GATE_OWNER_PATHS,
  buildProvenanceFoundation,
  canonicalRoadmapAuthoritySha256,
  parseEs2015DecisionFragment,
  parseEs2015ProvenanceManifest,
  roadmapAggregateProjectionSha256,
  roadmapOwnedPathsFromBaseManifest,
  roadmapProjectionSha256,
  renderBatchLedger,
  renderProvenanceIssueBody,
  validateRoadmapAuthorityManifest,
  validateDecisionFragments,
  validateProvenanceFoundation,
} from './es2015-provenance.js';
import {
  formatCoverageLines,
  renderCoverageSummary,
  replaceGeneratedBlock,
  summarizeTest262Coverage,
} from './coverage.js';
import { featureNames, parseFeatureManifest } from './features.js';
import {
  assertExactH0DispositionDelta,
  mergePromotionSubset,
  parseEs2015Promotion,
  promotionPaths,
  validateEs2015H0EvidenceBundle,
} from './es2015-promotion.js';
import { serializeUpstreamSubset, parseEs5Selection } from './es5-selection.js';
import {
  createSummaryRecord,
  createTestRecord,
  formatRecordLine,
  formatReportLines,
} from './report.js';
import { summarizeEs2015Classification } from './es2015-taxonomy.js';
import {
  formatUpstreamSummaryLines,
  parseUpstreamSubset,
  summarizeUpstreamRun,
  upstreamSubsetPaths,
} from './upstream.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const TAXONOMY_FILE = 'tools/test262/es2015-taxonomy.json';
const PROVENANCE_DECISIONS_DIRECTORY =
  'tools/test262/es2015-provenance-decisions';
const AUDIT_EVIDENCE_FILE = 'tools/test262/es2015-audit-evidence.json';
const ES5_SELECTION_FILE = 'tools/test262/es5-selection.json';
const FEATURES_FILE = 'tools/test262/features.json';
const IMMUTABLE_ROADMAP_PROJECTION_INPUTS = new Set([FEATURES_FILE]);
const REPORT_FILE = 'docs/test262-report.jsonl';
const CONFORMANCE_FILE = 'docs/conformance.md';
const FOUNDATION_BOOTSTRAP_COMMIT = '8d75b48af2ee7ab04e7c5006980417227ec34568';
const FOUNDATION_BOOTSTRAP_MANIFEST_SHA256 =
  'ad3e55a061f1156fc267655ac8cb977f6a54f934cc56a5efa5689c7fc620ae04';
const FOUNDATION_MAINTENANCE_PROFILE = 'foundation-maintenance';
const ISSUE_77_MAINTENANCE_PROFILE = 'maintenance:issue77-lexical';
const ISSUE_77_MAINTENANCE_BASE = '99c439f2efd287479f40d8d0e6ac2dd9aab81e10';
const FOUNDATION_BOOTSTRAP_BASE_LEDGER_SHA256 =
  '56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc';
const FOUNDATION_BOOTSTRAP_RANGE_PROFILE = Object.freeze({
  name: FOUNDATION_MAINTENANCE_PROFILE,
  baseFoundation: 'present',
  requiredPaths: Object.freeze([]),
  allowedPaths: Object.freeze([
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
  ]),
  requiredDeletions: Object.freeze([]),
  allowedDeletions: Object.freeze([]),
  emptyDecisionFragments: Object.freeze([
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
  ]),
  decisionFragment: null,
  generatedPaths: Object.freeze([
    '.github/workflows/ci.yml',
    'tools/test262/es2015-provenance.json',
  ]),
});
const PRIMARY_OPTION_LABEL =
  'Exactly one of --initialize, --check, --check-range, --render-ledger=CODE, or --render-issue=CODE is required';
const ISSUE_RENDER_CODES = Object.freeze([
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
const ROADMAP_AUTHORITY_MIGRATION_PROFILE = 'roadmap-authority-migration';
const ROADMAP_AUTHORITY_PREPARATION_PROFILE = 'roadmap-authority-prepare';
const ROADMAP_AUTHORITY_RECLASSIFICATION_PROFILE_PREFIX =
  'roadmap-reclassification:';
const H0_BOOTSTRAP_REPAIR_BASE = '03a4ccadb2b07fa7d3c1ad0f599608b0a7c31efd';
const H0_BOOTSTRAP_REPAIR_PROFILE = 'h0-bootstrap-repair';
const H0_BOOTSTRAP_REPAIR_BASE_MANIFEST_SHA256 =
  'a2b0b43085376ab65069829252b8a8dae2da538e5e3cf4a0a0e937725ca72974';
const H0_BOOTSTRAP_REPAIR_PATHS = Object.freeze([
  'docs/superpowers/plans/2026-08-21-h0-policy-bootstrap-repair.md',
  'docs/superpowers/specs/2026-08-21-h0-policy-bootstrap-repair-design.md',
  'docs/testing.md',
  'test/node/es2015-provenance.test.js',
  'test/node/repository-invariants.test.js',
  'test/node/upstream-select.test.js',
  'tools/test262/es2015-promotion.js',
  'tools/test262/es2015-provenance-check.js',
  'tools/test262/es2015-provenance.js',
]);
const H0_BOOTSTRAP_REPAIR_REQUIRED_PATHS = Object.freeze([
  'tools/test262/es2015-promotion.js',
  'tools/test262/es2015-provenance-check.js',
  'tools/test262/es2015-provenance.js',
]);
const CHECKER_PATH = 'tools/test262/es2015-provenance-check.js';
const WORKFLOW_PATH = '.github/workflows/ci.yml';
const ROADMAP_AUTHORITY_DESIGN_PATH =
  'docs/superpowers/specs/2026-08-21-roadmap-authority-state-machine-design.md';
const ROADMAP_AUTHORITY_PLAN_PATH =
  'docs/superpowers/plans/2026-08-21-roadmap-authority-state-machine.md';
const ROADMAP_AUTHORITY_BASE_DESIGN_ADDENDUM_PATH =
  'docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md';
const ROADMAP_AUTHORITY_BASE_PLAN_ADDENDUM_PATH =
  'docs/superpowers/plans/2026-08-20-provenance-foundation-maintenance.md';
const ROADMAP_AUTHORITY_MIGRATION_PATHS = Object.freeze([
  ROADMAP_AUTHORITY_PLAN_PATH,
  ROADMAP_AUTHORITY_DESIGN_PATH,
  ES2015_PROVENANCE_FILE,
]);
const ROADMAP_AUTHORITY_PREPARATION_PATHS = Object.freeze([
  ROADMAP_AUTHORITY_PLAN_PATH,
  ROADMAP_AUTHORITY_DESIGN_PATH,
  'docs/testing.md',
  ES2015_PROVENANCE_FILE,
]);
const ROADMAP_STANDALONE_DOCUMENTS = Object.freeze([
  Object.freeze({
    label: 'DESIGN',
    basePath: ROADMAP_AUTHORITY_BASE_DESIGN_ADDENDUM_PATH,
    headPath: ROADMAP_AUTHORITY_DESIGN_PATH,
  }),
  Object.freeze({
    label: 'PLAN',
    basePath: ROADMAP_AUTHORITY_BASE_PLAN_ADDENDUM_PATH,
    headPath: ROADMAP_AUTHORITY_PLAN_PATH,
  }),
]);

export class Es2015ProvenanceCheckError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'Es2015ProvenanceCheckError';
  }
}

/**
 * @typedef {{ kind: 'migration', text: string, base: string, baseManifestSha256: string, baseCheckerSha256: string, baseWorkflowSha256: string, headManifestSha256: string }} RoadmapMigrationMarker
 * @typedef {{ kind: 'prepare', text: string, code: string, issue: number, base: string, baseManifestSha256: string, recordSha256: string }} RoadmapPreparationMarker
 * @typedef {{ kind: 'consume', text: string, code: string, issue: number, profile: string, base: string, sourcePathSha256: string, sourceEntrySha256: string | null, protectedProjectionSha256: string }} RoadmapConsumptionMarker
 * @typedef {RoadmapMigrationMarker | RoadmapPreparationMarker | RoadmapConsumptionMarker} RoadmapMarker
 * @typedef {{ kind: 'h0-bootstrap-repair', text: string, base: string, baseManifestSha256: string }} H0BootstrapRepairMarker
 * @typedef {{ text: string, profile: string, baseLedgerSha256: string }} LegacyRangeMarker
 * @typedef {LegacyRangeMarker | RoadmapMarker | H0BootstrapRepairMarker} ProvenanceRangeMarker
 */

/**
 * @typedef {{
 *   environment: Record<string, string | undefined>,
 *   readFile: (path: string) => Promise<string>,
 *   readdir: (path: string) => Promise<readonly string[]>,
 *   writeFile: (path: string, text: string) => Promise<void>,
 *   resolveCommit: (revision: string) => Promise<string>,
 *   mergeBase: (base: string, head: string) => Promise<string>,
 *   gitDiff: (base: string, head: string) => Promise<string>,
 *   readGitFile: (revision: string, path: string) => Promise<string | null>,
 *   readGitMode?: (revision: string, path: string) => Promise<string | null>,
 *   stdout: (text: string) => void,
 *   stderr: (text: string) => void,
 *   expectedManifestVersion?: number,
 *   expectedRoadmapAuthorities?: readonly Record<string, any>[],
 *   validateRoadmapProtectedOutputs?: (
 *     authority: Record<string, any>,
 *     changes: readonly { status: string, path: string, sourcePath: string | null }[],
 *     context: {
 *       deps: ProvenanceCheckDependencies,
 *       base: string,
 *       head: string,
 *       baseManifest: ReturnType<typeof parseEs2015ProvenanceManifest>,
 *       headManifest: ReturnType<typeof parseEs2015ProvenanceManifest>,
 *       marker: RoadmapConsumptionMarker,
 *     },
 *   ) => Promise<readonly unknown[]>,
 * }} ProvenanceCheckDependencies
 */

/**
 * @param {readonly string[]} [argv]
 * @param {Partial<ProvenanceCheckDependencies> & { repositoryRootUrl?: URL }} [dependencies]
 */
export async function main(argv = [], dependencies = {}) {
  try {
    const options = scanOptions(argv);
    const deps = {
      ...createProvenanceCheckDependencies(dependencies),
      ...dependencies,
    };
    assertUtc(deps.environment);
    const mode = resolvePrimaryMode(options);

    switch (mode.kind) {
      case 'initialize':
        await initializeFoundation(deps);
        return 0;
      case 'check':
        await checkFoundation(
          deps,
          options.completeCode,
          options.allowPendingReview,
        );
        return 0;
      case 'check-range':
        await checkRange(deps, options);
        return 0;
      case 'render-ledger': {
        const manifest = await loadReviewedManifest(deps);
        deps.stdout(
          renderBatchLedger(manifest, /** @type {string} */ (mode.code)),
        );
        return 0;
      }
      case 'render-issue': {
        const manifest = await loadReviewedManifest(deps);
        const issueMap =
          options.issueMapPath === null
            ? undefined
            : parseJson(
                await readRequiredFile(deps, options.issueMapPath),
                options.issueMapPath,
              );
        deps.stdout(
          renderProvenanceIssueBody(
            manifest,
            /** @type {string} */ (mode.code),
            issueMap,
          ),
        );
        return 0;
      }
      default:
        throw new Error(`Unhandled mode ${mode.kind}`);
    }
  } catch (error) {
    if (error instanceof Es2015ProvenanceCheckError) {
      throw error;
    }
    if (error instanceof Es2015ProvenanceError) {
      throw new Es2015ProvenanceCheckError(error.message);
    }
    throw error;
  }
}

/** @param {{ repositoryRootUrl?: URL, environment?: Record<string, string | undefined>, stdout?: (text: string) => void, stderr?: (text: string) => void, expectedManifestVersion?: number, expectedRoadmapAuthorities?: readonly Record<string, any>[], validateRoadmapProtectedOutputs?: ProvenanceCheckDependencies['validateRoadmapProtectedOutputs'] }} [options] */
export function createProvenanceCheckDependencies(options = {}) {
  const repositoryRootUrl = options.repositoryRootUrl ?? REPOSITORY_ROOT_URL;
  const repositoryRootPath = fileURLToPath(repositoryRootUrl);
  const runGit = async (/** @type {readonly string[]} */ args) => {
    return /** @type {string} */ (
      execFileSync(
        'git',
        [...args],
        /** @type {any} */ ({
          cwd: repositoryRootPath,
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      )
    );
  };
  return {
    environment: options.environment ?? process.env,
    readFile: (/** @type {string} */ path) =>
      readFile(resolvePath(path, repositoryRootUrl), 'utf8'),
    readdir: (/** @type {string} */ path) =>
      readdir(resolvePath(path, repositoryRootUrl)),
    writeFile: (/** @type {string} */ path, /** @type {string} */ text) =>
      writeFile(resolvePath(path, repositoryRootUrl), text, 'utf8'),
    resolveCommit: async (/** @type {string} */ revision) =>
      (await runGit(['rev-parse', '--verify', `${revision}^{commit}`])).trim(),
    mergeBase: async (/** @type {string} */ base, /** @type {string} */ head) =>
      (await runGit(['merge-base', base, head])).trim(),
    gitDiff: (/** @type {string} */ base, /** @type {string} */ head) =>
      runGit([
        'diff',
        '--name-status',
        '-z',
        '--find-renames',
        '--find-copies',
        `${base}...${head}`,
      ]),
    readGitFile: async (
      /** @type {string} */ revision,
      /** @type {string} */ path,
    ) => {
      try {
        return await runGit(['show', `${revision}:${path}`]);
      } catch (error) {
        if (/** @type {any} */ (error)?.status === 128) return null;
        throw error;
      }
    },
    readGitMode: async (
      /** @type {string} */ revision,
      /** @type {string} */ path,
    ) => {
      const entry = (await runGit(['ls-tree', revision, '--', path])).trim();
      if (entry === '') return null;
      return entry.split(/\s+/u, 1)[0] ?? null;
    },
    stdout: options.stdout ?? ((text) => process.stdout.write(text)),
    stderr: options.stderr ?? ((text) => process.stderr.write(text)),
    ...(options.expectedManifestVersion === undefined
      ? {}
      : { expectedManifestVersion: options.expectedManifestVersion }),
    ...(options.expectedRoadmapAuthorities === undefined
      ? {}
      : {
          expectedRoadmapAuthorities: options.expectedRoadmapAuthorities,
        }),
    validateRoadmapProtectedOutputs:
      options.validateRoadmapProtectedOutputs ??
      validateRoadmapProtectedOutputs,
  };
}

/** @param {readonly string[]} argv */
function scanOptions(argv) {
  let initialize = false;
  let check = false;
  let checkRange = false;
  let allowPendingReview = false;
  /** @type {string | null} */
  let renderLedgerCode = null;
  /** @type {string | null} */
  let renderIssueCode = null;
  /** @type {string | null} */
  let completeCode = null;
  /** @type {string | null} */
  let issueMapPath = null;
  /** @type {string | null} */
  let baseSha = null;
  /** @type {string | null} */
  let headSha = null;
  /** @type {string | null} */
  let rangeProfile = null;
  /** @type {string | null} */
  let rangeMarker = null;
  /** @type {string | null} */
  let prBodyEnvironment = null;

  for (const argument of argv) {
    if (argument === '--initialize') {
      if (initialize) {
        throw new Es2015ProvenanceCheckError(
          'The --initialize option must not be repeated',
        );
      }
      initialize = true;
      continue;
    }
    if (argument === '--check') {
      if (check) {
        throw new Es2015ProvenanceCheckError(
          'The --check option must not be repeated',
        );
      }
      check = true;
      continue;
    }
    if (argument === '--check-range') {
      if (checkRange) {
        throw new Es2015ProvenanceCheckError(
          'The --check-range option must not be repeated',
        );
      }
      checkRange = true;
      continue;
    }
    if (argument === '--allow-pending-review') {
      if (allowPendingReview) {
        throw new Es2015ProvenanceCheckError(
          'The --allow-pending-review option must not be repeated',
        );
      }
      allowPendingReview = true;
      continue;
    }
    if (argument.startsWith('--render-ledger=')) {
      if (renderLedgerCode !== null) {
        throw new Es2015ProvenanceCheckError(
          'The --render-ledger=CODE option must not be repeated',
        );
      }
      const code = argument.slice('--render-ledger='.length);
      if (code === '') {
        throw new Es2015ProvenanceCheckError(
          '--render-ledger=CODE requires a code',
        );
      }
      assertDecisionCode(code);
      renderLedgerCode = code;
      continue;
    }
    if (argument.startsWith('--render-issue=')) {
      if (renderIssueCode !== null) {
        throw new Es2015ProvenanceCheckError(
          'The --render-issue=CODE option must not be repeated',
        );
      }
      const code = argument.slice('--render-issue='.length);
      if (code === '') {
        throw new Es2015ProvenanceCheckError(
          '--render-issue=CODE requires a code',
        );
      }
      if (!ISSUE_RENDER_CODES.includes(code)) {
        throw new Es2015ProvenanceCheckError(
          `${code} is not a known provenance issue code`,
        );
      }
      renderIssueCode = code;
      continue;
    }
    if (argument.startsWith('--complete=')) {
      if (completeCode !== null) {
        throw new Es2015ProvenanceCheckError(
          'The --complete=CODE option must not be repeated',
        );
      }
      const code = argument.slice('--complete='.length);
      if (code === '') {
        throw new Es2015ProvenanceCheckError('--complete=CODE requires a code');
      }
      assertDecisionCode(code);
      completeCode = code;
      continue;
    }
    if (argument.startsWith('--issue-map=')) {
      if (issueMapPath !== null) {
        throw new Es2015ProvenanceCheckError(
          'The --issue-map=PATH option must not be repeated',
        );
      }
      const path = argument.slice('--issue-map='.length);
      if (path === '') {
        throw new Es2015ProvenanceCheckError(
          '--issue-map=PATH requires a path',
        );
      }
      issueMapPath = path;
      continue;
    }
    if (argument.startsWith('--base=')) {
      if (baseSha !== null) {
        throw new Es2015ProvenanceCheckError(
          'The --base=SHA option must not be repeated',
        );
      }
      baseSha = argument.slice('--base='.length);
      continue;
    }
    if (argument.startsWith('--head=')) {
      if (headSha !== null) {
        throw new Es2015ProvenanceCheckError(
          'The --head=SHA option must not be repeated',
        );
      }
      headSha = argument.slice('--head='.length);
      continue;
    }
    if (argument.startsWith('--profile=')) {
      if (rangeProfile !== null) {
        throw new Es2015ProvenanceCheckError(
          'The --profile=PROFILE option must not be repeated',
        );
      }
      rangeProfile = argument.slice('--profile='.length);
      continue;
    }
    if (argument.startsWith('--marker=')) {
      if (rangeMarker !== null) {
        throw new Es2015ProvenanceCheckError(
          'The --marker=MARKER option must not be repeated',
        );
      }
      rangeMarker = argument.slice('--marker='.length);
      continue;
    }
    if (argument.startsWith('--pr-body-env=')) {
      if (prBodyEnvironment !== null) {
        throw new Es2015ProvenanceCheckError(
          'The --pr-body-env=NAME option must not be repeated',
        );
      }
      prBodyEnvironment = argument.slice('--pr-body-env='.length);
      continue;
    }
    throw new Es2015ProvenanceCheckError(`Unknown option ${argument}`);
  }

  return {
    initialize,
    check,
    checkRange,
    renderLedgerCode,
    renderIssueCode,
    completeCode,
    issueMapPath,
    allowPendingReview,
    baseSha,
    headSha,
    rangeProfile,
    rangeMarker,
    prBodyEnvironment,
  };
}

/** @param {{ initialize: boolean, check: boolean, checkRange: boolean, renderLedgerCode: string | null, renderIssueCode: string | null, completeCode: string | null, issueMapPath: string | null, allowPendingReview: boolean, baseSha: string | null, headSha: string | null, rangeProfile: string | null, rangeMarker: string | null, prBodyEnvironment: string | null }} options */
function resolvePrimaryMode(options) {
  if (
    options.allowPendingReview &&
    (!options.check || options.completeCode === null)
  ) {
    throw new Es2015ProvenanceCheckError(
      '--allow-pending-review requires --check --complete=CODE',
    );
  }
  const primaryModes = [
    options.initialize,
    options.check,
    options.checkRange,
    options.renderLedgerCode !== null,
    options.renderIssueCode !== null,
  ].filter(Boolean).length;
  if (primaryModes !== 1) {
    throw new Es2015ProvenanceCheckError(PRIMARY_OPTION_LABEL);
  }
  const hasRangeOption =
    options.baseSha !== null ||
    options.headSha !== null ||
    options.rangeProfile !== null ||
    options.rangeMarker !== null ||
    options.prBodyEnvironment !== null;
  if (!options.checkRange && hasRangeOption) {
    throw new Es2015ProvenanceCheckError('Range options require --check-range');
  }
  if (options.checkRange) {
    if (
      options.completeCode !== null ||
      options.issueMapPath !== null ||
      options.allowPendingReview
    ) {
      throw new Es2015ProvenanceCheckError(
        '--check-range cannot be combined with decision or rendering options',
      );
    }
    if (options.baseSha === null || options.headSha === null) {
      throw new Es2015ProvenanceCheckError(
        '--check-range requires --base=SHA and --head=SHA',
      );
    }
    if (options.prBodyEnvironment === null) {
      if (options.rangeProfile === null || options.rangeMarker === null) {
        throw new Es2015ProvenanceCheckError(
          'Local --check-range requires --profile=PROFILE and --marker=MARKER',
        );
      }
    } else if (options.rangeProfile !== null || options.rangeMarker !== null) {
      throw new Es2015ProvenanceCheckError(
        '--pr-body-env=NAME cannot be combined with --profile or --marker',
      );
    }
    return { kind: 'check-range' };
  }
  if (options.completeCode !== null && !options.check) {
    throw new Es2015ProvenanceCheckError('--complete=CODE requires --check');
  }
  if (options.issueMapPath !== null && options.renderIssueCode === null) {
    throw new Es2015ProvenanceCheckError(
      '--issue-map=PATH requires --render-issue=CODE',
    );
  }
  if (options.initialize) {
    return { kind: 'initialize' };
  }
  if (options.check) {
    return { kind: 'check' };
  }
  if (options.renderLedgerCode !== null) {
    return { kind: 'render-ledger', code: options.renderLedgerCode };
  }
  return { kind: 'render-issue', code: options.renderIssueCode };
}

/**
 * @param {ProvenanceCheckDependencies} deps
 * @param {{ baseSha: string | null, headSha: string | null, rangeProfile: string | null, rangeMarker: string | null, prBodyEnvironment: string | null }} options
 */
async function checkRange(deps, options) {
  const base = explicitCommitSha(options.baseSha, '--base');
  const head = explicitCommitSha(options.headSha, '--head');
  if (base === head) {
    throw new Es2015ProvenanceCheckError(
      'Provenance range base and head must be different commits',
    );
  }
  const [resolvedBase, resolvedHead] = await Promise.all([
    deps.resolveCommit(base),
    deps.resolveCommit(head),
  ]);
  if (resolvedBase !== base || resolvedHead !== head) {
    throw new Es2015ProvenanceCheckError(
      'Provenance range commits must resolve to the explicit base and head SHAs',
    );
  }
  if ((await deps.mergeBase(base, head)) !== base) {
    throw new Es2015ProvenanceCheckError(
      'Provenance range base must be an ancestor of head',
    );
  }
  const changes = parseRangeChanges(await deps.gitDiff(base, head));
  const marker = await markerForRange(deps, options, changes, base, head);
  if (marker === null) return;

  const baseManifestText = await deps.readGitFile(base, ES2015_PROVENANCE_FILE);
  if (isH0BootstrapRepairMarker(marker)) {
    await validateH0BootstrapRepairRange(marker, {
      deps,
      base,
      head,
      changes,
      baseManifestText,
    });
    return;
  }
  if (isRoadmapMarker(marker)) {
    if (marker.kind === 'migration') {
      if (baseManifestText === null) {
        throw new Es2015ProvenanceCheckError(
          'roadmap-authority-migration range requires a canonical schema-v2 BASE manifest',
        );
      }
      const headManifestText = await readRequiredGitFile(
        deps,
        head,
        ES2015_PROVENANCE_FILE,
      );
      await validateRoadmapAuthorityMigration(
        baseManifestText,
        headManifestText,
        {
          deps,
          base,
          head,
          marker,
          changes,
        },
      );
      return;
    }
    if (baseManifestText === null) {
      throw new Es2015ProvenanceCheckError(
        `${rangeProfileForMarker(marker)} range requires a canonical schema-v3 BASE manifest`,
      );
    }
    const baseManifest = parseRangeManifest(
      baseManifestText,
      `${rangeProfileForMarker(marker)} base`,
    );
    const headManifest = await readRangeManifest(
      deps,
      head,
      `${rangeProfileForMarker(marker)} head`,
    );
    if (marker.kind === 'prepare') {
      await validateRoadmapAuthorityPreparation(
        baseManifest,
        headManifest,
        marker,
        {
          deps,
          base,
          head,
          changes,
        },
      );
      return;
    }
    await validateRoadmapAuthorityConsumption(
      baseManifest,
      headManifest,
      marker,
      {
        deps,
        base,
        head,
        changes,
      },
    );
    return;
  }
  /** @type {ReturnType<typeof parseEs2015ProvenanceManifest>} */
  let manifest;
  /** @type {ReturnType<typeof parseEs2015ProvenanceManifest>['rangeProfiles'][number]} */
  let profile;
  if (marker.profile === 'foundation') {
    if (baseManifestText !== null) {
      throw new Es2015ProvenanceCheckError(
        'foundation range requires a base without the initialized provenance foundation',
      );
    }
    manifest = await readRangeManifest(deps, head, 'foundation head');
    profile = rangeProfileForManifest(manifest, marker.profile);
  } else if (marker.profile.startsWith('decision:')) {
    if (baseManifestText === null) {
      throw new Es2015ProvenanceCheckError(
        `${marker.profile} range requires an initialized provenance foundation in the base`,
      );
    }
    manifest = parseRangeManifest(baseManifestText, `${marker.profile} base`);
    const headManifestText = await deps.readGitFile(
      head,
      ES2015_PROVENANCE_FILE,
    );
    if (headManifestText !== baseManifestText) {
      throw new Es2015ProvenanceCheckError(
        `${marker.profile} range forbids provenance manifest drift`,
      );
    }
    profile = rangeProfileForManifest(manifest, marker.profile);
  } else if (marker.profile === FOUNDATION_MAINTENANCE_PROFILE) {
    const authority = maintenanceRangeAuthority(base, baseManifestText);
    const expectedMarker = provenanceRangeMarker(
      authority.profile.name,
      authority.baseLedgerSha256,
    );
    if (marker.text !== expectedMarker) {
      throw new Es2015ProvenanceCheckError(
        `Provenance PR marker does not match ${authority.profile.name} policy`,
      );
    }
    validateRangeChanges(authority.profile, changes);

    const headManifest = await readRangeManifest(
      deps,
      head,
      'foundation-maintenance head',
    );
    const headProfile = rangeProfileForManifest(
      headManifest,
      FOUNDATION_MAINTENANCE_PROFILE,
    );
    if (JSON.stringify(headProfile) !== JSON.stringify(authority.profile)) {
      throw new Es2015ProvenanceCheckError(
        'foundation-maintenance range head profile must match the trusted base profile',
      );
    }
    await validateRangeContent(deps, head, headManifest, authority.profile);
    return;
  } else if (marker.profile === ISSUE_77_MAINTENANCE_PROFILE) {
    if (baseManifestText === null) {
      throw new Es2015ProvenanceCheckError(
        `${ISSUE_77_MAINTENANCE_PROFILE} range requires an initialized provenance foundation in the base`,
      );
    }
    if (base !== ISSUE_77_MAINTENANCE_BASE) {
      throw new Es2015ProvenanceCheckError(
        `${ISSUE_77_MAINTENANCE_PROFILE} range requires base ${ISSUE_77_MAINTENANCE_BASE}`,
      );
    }
    manifest = await readRangeManifest(
      deps,
      head,
      `${ISSUE_77_MAINTENANCE_PROFILE} head`,
    );
    profile = rangeProfileForManifest(manifest, marker.profile);
  } else {
    throw new Es2015ProvenanceCheckError(
      `Unknown provenance range profile ${marker.profile}`,
    );
  }

  const expectedMarker = provenanceRangeMarker(
    profile.name,
    manifest.baseLedger.pathSha256,
  );
  if (marker.text !== expectedMarker) {
    throw new Es2015ProvenanceCheckError(
      `Provenance PR marker does not match ${profile.name} policy`,
    );
  }
  validateRangeChanges(profile, changes);
  await validateRangeContent(deps, head, manifest, profile);
}

/** @param {ProvenanceRangeMarker} marker @returns {marker is H0BootstrapRepairMarker} */
function isH0BootstrapRepairMarker(marker) {
  return (
    Object.prototype.hasOwnProperty.call(marker, 'kind') &&
    /** @type {{ kind?: unknown }} */ (marker).kind === 'h0-bootstrap-repair'
  );
}

/** @param {ProvenanceRangeMarker} marker @returns {marker is RoadmapMarker} */
function isRoadmapMarker(marker) {
  return (
    Object.prototype.hasOwnProperty.call(marker, 'kind') &&
    ['migration', 'prepare', 'consume'].includes(
      /** @type {{ kind?: any }} */ (marker).kind,
    )
  );
}

/** @param {ProvenanceRangeMarker} marker */
function rangeProfileForMarker(marker) {
  if (isH0BootstrapRepairMarker(marker)) {
    return H0_BOOTSTRAP_REPAIR_PROFILE;
  }
  if (!isRoadmapMarker(marker)) return marker.profile;
  switch (marker.kind) {
    case 'migration':
      return ROADMAP_AUTHORITY_MIGRATION_PROFILE;
    case 'prepare':
      return ROADMAP_AUTHORITY_PREPARATION_PROFILE;
    case 'consume':
      return marker.profile;
    default:
      throw new Error('Unhandled roadmap marker kind');
  }
}

/**
 * @param {H0BootstrapRepairMarker} marker
 * @param {{
 *   deps: ProvenanceCheckDependencies,
 *   base: string,
 *   head: string,
 *   changes: readonly { status: string, path: string, sourcePath: string | null }[],
 *   baseManifestText: string | null,
 * }} options
 */
async function validateH0BootstrapRepairRange(marker, options) {
  const { deps, base, head, changes, baseManifestText } = options;
  if (deps.environment.GITHUB_EVENT_NAME !== 'pull_request') {
    throw new Es2015ProvenanceCheckError(
      'H0 bootstrap repair marker is available only to ordinary pull_request CI',
    );
  }
  if (base !== H0_BOOTSTRAP_REPAIR_BASE) {
    throw new Es2015ProvenanceCheckError(
      `H0 bootstrap repair range requires base ${H0_BOOTSTRAP_REPAIR_BASE}`,
    );
  }
  if (marker.base !== H0_BOOTSTRAP_REPAIR_BASE) {
    throw new Es2015ProvenanceCheckError(
      `H0 bootstrap repair marker base must be ${H0_BOOTSTRAP_REPAIR_BASE}`,
    );
  }
  if (
    baseManifestText === null ||
    marker.baseManifestSha256 !== H0_BOOTSTRAP_REPAIR_BASE_MANIFEST_SHA256 ||
    sha256(baseManifestText) !== H0_BOOTSTRAP_REPAIR_BASE_MANIFEST_SHA256
  ) {
    throw new Es2015ProvenanceCheckError(
      'H0 bootstrap repair marker base-manifest-sha256 does not match BASE manifest bytes',
    );
  }

  const baseManifest = parseRangeManifest(
    baseManifestText,
    'H0 bootstrap repair base',
  );
  if (baseManifest.version !== 3 || baseManifest.rangeProfiles.length !== 15) {
    throw new Es2015ProvenanceCheckError(
      'H0 bootstrap repair requires the exact schema-v3 BASE profiles',
    );
  }
  validateProvenanceFoundation(baseManifest, undefined, {
    expectedRoadmapAuthorities: APPROVED_INITIAL_ROADMAP_AUTHORITIES,
  });
  const h0Authority = baseManifest.roadmapAuthorities?.find(
    (/** @type {{ code: string }} */ authority) => authority.code === 'H0',
  );
  if (h0Authority?.evidence.length !== 6) {
    throw new Es2015ProvenanceCheckError(
      'H0 bootstrap repair requires the exact six H0 evidence records',
    );
  }

  validateH0BootstrapRepairChanges(changes);
  const immutablePaths = new Set([
    WORKFLOW_PATH,
    'tools/ci/pipeline.js',
    ES2015_PROVENANCE_FILE,
    FEATURES_FILE,
    ...ES2015_PROVENANCE_DECISION_CODES.map(decisionFragmentPath),
    ...(baseManifest.roadmapAuthorities ?? []).flatMap(
      (
        /** @type {{ evidence: readonly { path: string }[], protectedOutputs: readonly { path: string }[] }} */ authority,
      ) => [
        ...authority.evidence.map((entry) => entry.path),
        ...authority.protectedOutputs.map((entry) => entry.path),
      ],
    ),
  ]);
  for (const path of immutablePaths) {
    const [baseText, headText] = await Promise.all([
      deps.readGitFile(base, path),
      deps.readGitFile(head, path),
    ]);
    if (baseText !== headText) {
      throw new Es2015ProvenanceCheckError(
        `H0 bootstrap repair path ${path} must remain byte-identical between BASE and HEAD`,
      );
    }
  }
}

/**
 * @param {readonly { status: string, path: string, sourcePath: string | null }[]} changes
 */
function validateH0BootstrapRepairChanges(changes) {
  const allowedPaths = new Set(H0_BOOTSTRAP_REPAIR_PATHS);
  const changedPaths = new Set();
  for (const change of changes) {
    if (change.status.startsWith('R')) {
      throw new Es2015ProvenanceCheckError(
        `H0 bootstrap repair range forbids rename ${change.sourcePath} -> ${change.path}`,
      );
    }
    if (change.status.startsWith('C')) {
      throw new Es2015ProvenanceCheckError(
        `H0 bootstrap repair range forbids copy ${change.sourcePath} -> ${change.path}`,
      );
    }
    if (change.status === 'D') {
      throw new Es2015ProvenanceCheckError(
        `H0 bootstrap repair range forbids deleted path ${change.path}`,
      );
    }
    if (!['A', 'M'].includes(change.status)) {
      throw new Es2015ProvenanceCheckError(
        `H0 bootstrap repair range has unknown git status ${change.status}`,
      );
    }
    if (!allowedPaths.has(change.path)) {
      throw new Es2015ProvenanceCheckError(
        `H0 bootstrap repair range includes unexpected path ${change.path}`,
      );
    }
    if (changedPaths.has(change.path)) {
      throw new Es2015ProvenanceCheckError(
        `H0 bootstrap repair range repeats changed path ${change.path}`,
      );
    }
    changedPaths.add(change.path);
  }
  for (const path of H0_BOOTSTRAP_REPAIR_REQUIRED_PATHS) {
    if (!changedPaths.has(path)) {
      throw new Es2015ProvenanceCheckError(
        `H0 bootstrap repair range requires changed path ${path}`,
      );
    }
  }
}

/**
 * @param {string} baseManifestText
 * @param {string} headManifestText
 * @param {{
 *   deps: ProvenanceCheckDependencies,
 *   base: string,
 *   head: string,
 *   marker: RoadmapMarker,
 *   changes: readonly { status: string, path: string, sourcePath: string | null }[],
 * }} options
 */
export async function validateRoadmapAuthorityMigration(
  baseManifestText,
  headManifestText,
  options,
) {
  const { deps, base, head, marker, changes } = options;
  if (marker.kind !== 'migration') {
    throw new Es2015ProvenanceCheckError(
      'roadmap-authority-migration requires a migration marker',
    );
  }
  assertRoadmapBasePin(
    marker.base,
    base,
    'roadmap-authority-migration marker base pin does not match the resolved BASE commit',
  );
  assertRoadmapBasePin(
    marker.baseManifestSha256,
    sha256(baseManifestText),
    'roadmap-authority-migration marker base-manifest-sha256 does not match the BASE manifest',
  );
  assertRoadmapBasePin(
    marker.baseCheckerSha256,
    sha256(await readRequiredGitFile(deps, base, CHECKER_PATH)),
    'roadmap-authority-migration marker base-checker-sha256 does not match tools/test262/es2015-provenance-check.js in BASE',
  );
  assertRoadmapBasePin(
    marker.baseWorkflowSha256,
    sha256(await readRequiredGitFile(deps, base, WORKFLOW_PATH)),
    'roadmap-authority-migration marker base-workflow-sha256 does not match .github/workflows/ci.yml in BASE',
  );
  assertRoadmapBasePin(
    marker.headManifestSha256,
    sha256(headManifestText),
    'roadmap-authority-migration marker head-manifest-sha256 does not match the HEAD manifest',
  );
  const baseManifest = parseRangeManifest(
    baseManifestText,
    'roadmap-authority-migration base',
  );
  if (baseManifest.version !== 2) {
    throw new Es2015ProvenanceCheckError(
      'roadmap-authority-migration range requires a canonical schema-v2 BASE manifest',
    );
  }
  const headManifest = parseRangeManifest(
    headManifestText,
    'roadmap-authority-migration head',
  );
  if (headManifest.version !== 3) {
    throw new Es2015ProvenanceCheckError(
      'roadmap-authority-migration range requires a canonical schema-v3 HEAD manifest',
    );
  }
  validateProvenanceFoundation(headManifest, undefined, {
    expectedRoadmapAuthorities: APPROVED_INITIAL_ROADMAP_AUTHORITIES,
  });
  await validateInitialRoadmapAuthorityMigrationArtifacts(deps, base, head);
  validateRangeChanges(
    syntheticRangeProfile(
      ROADMAP_AUTHORITY_MIGRATION_PROFILE,
      ROADMAP_AUTHORITY_MIGRATION_PATHS,
      ROADMAP_AUTHORITY_MIGRATION_PATHS,
    ),
    changes,
  );
  await validateDecisionFragmentsByteIdentical(
    deps,
    base,
    head,
    ROADMAP_AUTHORITY_MIGRATION_PROFILE,
  );
  await validateEmbeddedRoadmapAuthorityDocuments(deps, base, head);
  return 0;
}

/**
 * @param {ProvenanceCheckDependencies} deps
 * @param {string} base
 * @param {string} head
 */
async function validateInitialRoadmapAuthorityMigrationArtifacts(
  deps,
  base,
  head,
) {
  const h0 = approvedInitialRoadmapAuthority('H0');
  const p0 = approvedInitialRoadmapAuthority('P0');
  const baseTaxonomyText = await readRequiredMigrationArtifact(
    deps,
    base,
    TAXONOMY_FILE,
    'BASE',
    'H0 source taxonomy',
  );
  const baseTaxonomySha256 = sha256(baseTaxonomyText);
  if (baseTaxonomySha256 !== h0.source.baseTaxonomySha256) {
    throw new Es2015ProvenanceCheckError(
      `H0 source.baseTaxonomySha256 does not match ${TAXONOMY_FILE} in migration BASE`,
    );
  }
  if (
    h0.reconciliation === null ||
    baseTaxonomySha256 !== h0.reconciliation.authorityTaxonomySha256
  ) {
    throw new Es2015ProvenanceCheckError(
      `H0 reconciliation.authorityTaxonomySha256 does not match ${TAXONOMY_FILE} in migration BASE`,
    );
  }

  for (const output of h0.protectedOutputs) {
    if (output.operation === 'add-exact') continue;
    if (output.operation !== 'project') {
      throw new Es2015ProvenanceCheckError(
        `H0 initial roadmap authority has unsupported ${output.operation} protected output ${output.path}`,
      );
    }
    const baseText =
      output.path === TAXONOMY_FILE
        ? baseTaxonomyText
        : await readRequiredMigrationArtifact(
            deps,
            base,
            output.path,
            'BASE',
            'H0 project protected output',
          );
    if (sha256(baseText) !== output.baseSha256) {
      throw new Es2015ProvenanceCheckError(
        `H0 project protected output ${output.path} BASE bytes do not match its reviewed baseSha256`,
      );
    }
    const headText = await readRequiredMigrationArtifact(
      deps,
      head,
      output.path,
      'HEAD',
      'H0 project protected output',
    );
    if (headText !== baseText) {
      throw new Es2015ProvenanceCheckError(
        `H0 project protected output ${output.path} must remain byte-identical across roadmap-authority-migration`,
      );
    }
  }

  const h0AddExactPaths = new Set([
    ...h0.evidence.map(
      (/** @type {{ path: string }} */ evidence) => evidence.path,
    ),
    ...h0.protectedOutputs
      .filter(
        (/** @type {{ operation: string }} */ output) =>
          output.operation === 'add-exact',
      )
      .map((/** @type {{ path: string }} */ output) => output.path),
  ]);
  for (const path of h0AddExactPaths) {
    await assertMigrationPathAbsent(deps, base, path, 'BASE');
    await assertMigrationPathAbsent(deps, head, path, 'HEAD');
  }

  for (const output of p0.protectedOutputs) {
    if (output.operation !== 'replace-exact') {
      throw new Es2015ProvenanceCheckError(
        `P0 initial roadmap authority has unsupported ${output.operation} protected output ${output.path}`,
      );
    }
    const baseText = await readRequiredMigrationArtifact(
      deps,
      base,
      output.path,
      'BASE',
      'P0 replace-exact protected output',
    );
    if (sha256(baseText) !== output.headSha256) {
      throw new Es2015ProvenanceCheckError(
        `P0 replace-exact protected output ${output.path} BASE bytes do not match its reviewed headSha256`,
      );
    }
    const headText = await readRequiredMigrationArtifact(
      deps,
      head,
      output.path,
      'HEAD',
      'P0 replace-exact protected output',
    );
    if (headText !== baseText) {
      throw new Es2015ProvenanceCheckError(
        `P0 replace-exact protected output ${output.path} must remain byte-identical across roadmap-authority-migration`,
      );
    }
  }
}

/** @param {string} code */
function approvedInitialRoadmapAuthority(code) {
  const authority = APPROVED_INITIAL_ROADMAP_AUTHORITIES.find(
    (candidate) => candidate.code === code,
  );
  if (authority === undefined) {
    throw new Es2015ProvenanceCheckError(
      `${code} initial roadmap authority is missing from the reviewed ledger`,
    );
  }
  return authority;
}

/**
 * @param {ProvenanceCheckDependencies} deps
 * @param {string} revision
 * @param {string} path
 * @param {'BASE' | 'HEAD'} side
 * @param {string} label
 */
async function readRequiredMigrationArtifact(
  deps,
  revision,
  path,
  side,
  label,
) {
  if (deps.readGitMode === undefined) {
    throw new Es2015ProvenanceCheckError(
      `${label} ${path} cannot attest a regular file in migration ${side}`,
    );
  }
  const mode = await deps.readGitMode(revision, path);
  if (mode === null) {
    throw new Es2015ProvenanceCheckError(
      `${label} ${path} is missing from migration ${side}`,
    );
  }
  if (!REGULAR_GIT_FILE_MODES.has(mode)) {
    throw new Es2015ProvenanceCheckError(
      `${label} ${path} must be a regular file in migration ${side}`,
    );
  }
  const text = await deps.readGitFile(revision, path);
  if (text === null) {
    throw new Es2015ProvenanceCheckError(
      `${label} ${path} is missing from migration ${side}`,
    );
  }
  return text;
}

/**
 * @param {ProvenanceCheckDependencies} deps
 * @param {string} revision
 * @param {string} path
 * @param {'BASE' | 'HEAD'} side
 */
async function assertMigrationPathAbsent(deps, revision, path, side) {
  if (deps.readGitMode === undefined) {
    throw new Es2015ProvenanceCheckError(
      `H0 add-exact evidence/output path ${path} cannot attest absence from migration ${side}`,
    );
  }
  const [mode, text] = await Promise.all([
    deps.readGitMode(revision, path),
    deps.readGitFile(revision, path),
  ]);
  if (mode !== null || text !== null) {
    throw new Es2015ProvenanceCheckError(
      `H0 add-exact evidence/output path ${path} must be absent from migration ${side}`,
    );
  }
}

/**
 * @param {unknown} baseManifest
 * @param {unknown} headManifest
 * @param {RoadmapMarker} marker
 * @param {{
 *   deps: ProvenanceCheckDependencies,
 *   base: string,
 *   head: string,
 *   changes: readonly { status: string, path: string, sourcePath: string | null }[],
 * }} options
 */
export async function validateRoadmapAuthorityPreparation(
  baseManifest,
  headManifest,
  marker,
  options,
) {
  const { deps, base, head, changes } = options;
  if (marker.kind !== 'prepare') {
    throw new Es2015ProvenanceCheckError(
      'roadmap-authority-prepare requires a preparation marker',
    );
  }
  const normalizedBaseManifest = normalizeRangeManifestValue(
    baseManifest,
    'roadmap-authority-prepare base',
  );
  if (normalizedBaseManifest.version !== 3) {
    throw new Es2015ProvenanceCheckError(
      'roadmap-authority-prepare range requires a canonical schema-v3 BASE manifest',
    );
  }
  const normalizedHeadManifest = normalizeRangeManifestValue(
    headManifest,
    'roadmap-authority-prepare head',
  );
  if (normalizedHeadManifest.version !== 3) {
    throw new Es2015ProvenanceCheckError(
      'roadmap-authority-prepare range requires a canonical schema-v3 HEAD manifest',
    );
  }
  assertRoadmapBasePin(
    marker.base,
    base,
    'roadmap-authority-prepare marker base pin does not match the resolved BASE commit',
  );
  assertRoadmapBasePin(
    marker.baseManifestSha256,
    sha256(renderJson(normalizedBaseManifest)),
    'roadmap-authority-prepare marker base-manifest-sha256 does not match the BASE manifest',
  );
  validateRangeChanges(
    syntheticRangeProfile(
      ROADMAP_AUTHORITY_PREPARATION_PROFILE,
      Object.freeze([ES2015_PROVENANCE_FILE]),
      ROADMAP_AUTHORITY_PREPARATION_PATHS,
    ),
    changes,
  );
  const baseAuthorities = normalizedBaseManifest.roadmapAuthorities ?? [];
  const headAuthorities = normalizedHeadManifest.roadmapAuthorities ?? [];
  const baseByCode = new Map(
    baseAuthorities.map((/** @type {Record<string, any>} */ authority) => [
      authority.code,
      authority,
    ]),
  );
  const newAuthorities = [];
  for (const authority of headAuthorities) {
    const baseAuthority = baseByCode.get(authority.code);
    if (baseAuthority === undefined) {
      newAuthorities.push(authority);
      continue;
    }
    if (
      canonicalRoadmapAuthoritySha256(authority) !==
      canonicalRoadmapAuthoritySha256(baseAuthority)
    ) {
      throw new Es2015ProvenanceCheckError(
        `${authority.code} roadmap authority must remain canonical during roadmap-authority-prepare`,
      );
    }
  }
  for (const authority of baseAuthorities) {
    if (
      !headAuthorities.some(
        (/** @type {Record<string, any>} */ candidate) =>
          candidate.code === authority.code,
      )
    ) {
      throw new Es2015ProvenanceCheckError(
        `${authority.code} roadmap authority is missing from HEAD during roadmap-authority-prepare`,
      );
    }
  }
  if (
    newAuthorities.length !== 1 ||
    headAuthorities.length !== baseAuthorities.length + 1
  ) {
    throw new Es2015ProvenanceCheckError(
      'roadmap-authority-prepare must add exactly one new roadmap authority',
    );
  }
  const [newAuthority] = newAuthorities;
  if (newAuthority.state !== 'pending') {
    throw new Es2015ProvenanceCheckError(
      `${newAuthority.code} roadmap authority must be pending in HEAD during roadmap-authority-prepare`,
    );
  }
  if (marker.code !== newAuthority.code) {
    throw new Es2015ProvenanceCheckError(
      'roadmap-authority-prepare marker code does not match the new roadmap authority',
    );
  }
  if (marker.issue !== newAuthority.issue) {
    throw new Es2015ProvenanceCheckError(
      `roadmap-authority-prepare marker issue does not match ${newAuthority.code} roadmap authority`,
    );
  }
  assertRoadmapBasePin(
    marker.recordSha256,
    canonicalRoadmapAuthoritySha256(newAuthority),
    `roadmap-authority-prepare marker record-sha256 does not match ${newAuthority.code} roadmap authority`,
  );
  await validateDecisionFragmentsByteIdentical(
    deps,
    base,
    head,
    ROADMAP_AUTHORITY_PREPARATION_PROFILE,
  );
  return 0;
}

/**
 * @param {unknown} baseManifest
 * @param {unknown} headManifest
 * @param {RoadmapMarker} marker
 * @param {{
 *   deps: ProvenanceCheckDependencies,
 *   base: string,
 *   head: string,
 *   changes: readonly { status: string, path: string, sourcePath: string | null }[],
 * }} options
 */
export async function validateRoadmapAuthorityConsumption(
  baseManifest,
  headManifest,
  marker,
  options,
) {
  const { deps, base, head, changes } = options;
  if (marker.kind !== 'consume') {
    throw new Es2015ProvenanceCheckError(
      'roadmap-reclassification requires a consumption marker',
    );
  }
  const normalizedBaseManifest = normalizeRangeManifestValue(
    baseManifest,
    `${marker.profile} base`,
  );
  if (normalizedBaseManifest.version !== 3) {
    throw new Es2015ProvenanceCheckError(
      `${marker.profile} range requires a canonical schema-v3 BASE manifest`,
    );
  }
  const normalizedHeadManifest = normalizeRangeManifestValue(
    headManifest,
    `${marker.profile} head`,
  );
  if (normalizedHeadManifest.version !== 3) {
    throw new Es2015ProvenanceCheckError(
      `${marker.profile} range requires a canonical schema-v3 HEAD manifest`,
    );
  }
  const baseAuthorities = normalizedBaseManifest.roadmapAuthorities ?? [];
  const headAuthorities = normalizedHeadManifest.roadmapAuthorities ?? [];
  const baseAuthority = baseAuthorities.find(
    (/** @type {Record<string, any>} */ authority) =>
      authority.code === marker.code,
  );
  if (baseAuthority === undefined) {
    throw new Es2015ProvenanceCheckError(
      `${marker.code} roadmap authority must exist in BASE`,
    );
  }
  if (baseAuthority.state !== 'pending') {
    throw new Es2015ProvenanceCheckError(
      `${marker.code} roadmap authority must be pending in BASE`,
    );
  }
  assertRoadmapBasePin(
    marker.base,
    base,
    `${marker.profile} marker base pin does not match the resolved BASE commit`,
  );
  if (marker.issue !== baseAuthority.issue) {
    throw new Es2015ProvenanceCheckError(
      `${marker.profile} marker issue does not match ${baseAuthority.code} roadmap authority`,
    );
  }
  if (
    marker.profile !==
    `${ROADMAP_AUTHORITY_RECLASSIFICATION_PROFILE_PREFIX}${baseAuthority.code}`
  ) {
    throw new Es2015ProvenanceCheckError(
      `${marker.profile} marker profile does not match ${baseAuthority.code} roadmap authority`,
    );
  }
  if (marker.sourcePathSha256 !== baseAuthority.source.pathSha256) {
    throw new Es2015ProvenanceCheckError(
      `${marker.profile} marker source-path-sha256 does not match ${baseAuthority.code} roadmap authority`,
    );
  }
  if (marker.sourceEntrySha256 !== baseAuthority.source.entryLedgerSha256) {
    throw new Es2015ProvenanceCheckError(
      `${marker.profile} marker source-entry-sha256 does not match ${baseAuthority.code} roadmap authority`,
    );
  }
  if (
    marker.protectedProjectionSha256 !==
    roadmapAggregateProjectionSha256(baseAuthority)
  ) {
    throw new Es2015ProvenanceCheckError(
      `${marker.profile} marker protected-projection-sha256 does not match ${baseAuthority.code} roadmap authority`,
    );
  }
  const headByCode = new Map(
    headAuthorities.map((/** @type {Record<string, any>} */ authority) => [
      authority.code,
      authority,
    ]),
  );
  for (const authority of baseAuthorities) {
    const nextAuthority = headByCode.get(authority.code);
    if (nextAuthority === undefined) {
      throw new Es2015ProvenanceCheckError(
        `${authority.code} roadmap authority is missing from HEAD during ${marker.profile}`,
      );
    }
    if (authority.code === marker.code) continue;
    if (
      canonicalRoadmapAuthoritySha256(nextAuthority) !==
      canonicalRoadmapAuthoritySha256(authority)
    ) {
      throw new Es2015ProvenanceCheckError(
        `${authority.code} roadmap authority must remain canonical during ${marker.profile}`,
      );
    }
  }
  for (const authority of headAuthorities) {
    if (
      !baseAuthorities.some(
        (/** @type {Record<string, any>} */ candidate) =>
          candidate.code === authority.code,
      )
    ) {
      throw new Es2015ProvenanceCheckError(
        `${authority.code} roadmap authority is unexpected in HEAD during ${marker.profile}`,
      );
    }
  }
  const headAuthority = headByCode.get(marker.code);
  if (headAuthority === undefined) {
    throw new Es2015ProvenanceCheckError(
      `${marker.code} roadmap authority is missing from HEAD during ${marker.profile}`,
    );
  }
  const expectedHeadAuthority = {
    ...baseAuthority,
    state: 'applied',
  };
  if (
    canonicalRoadmapAuthoritySha256(headAuthority) !==
    canonicalRoadmapAuthoritySha256(expectedHeadAuthority)
  ) {
    throw new Es2015ProvenanceCheckError(
      `${marker.code} roadmap authority must transition only from pending to applied`,
    );
  }
  const projectionResult =
    (await deps.validateRoadmapProtectedOutputs?.(baseAuthority, changes, {
      deps,
      base,
      head,
      baseManifest: normalizedBaseManifest,
      headManifest: normalizedHeadManifest,
      marker,
    })) ?? [];
  if (!Array.isArray(projectionResult) || projectionResult.length === 0) {
    throw new Es2015ProvenanceCheckError(
      `${marker.profile} requires a nonempty protected projection result`,
    );
  }
  return 0;
}

const REGULAR_GIT_FILE_MODES = new Set(['100644', '100755']);
const HISTORICAL_P0_SUBSET_DELTA_SHA256 =
  '88d2521688bf3f036d2d94977914580d218fbc442bf38ef11e2cf9b8ce529a5f';
const HISTORICAL_P0_ES5_SELECTION_DELTA_SHA256 =
  '2b0654600cf2159c828be9489826e85f3565a32b82019e2dfc2c41ec80870b38';
const HISTORICAL_P0_SUBSET_ADDITIONS = Object.freeze([
  Object.freeze({
    group: 'language/expressions',
    path: 'test/language/expressions/assignment/dstr/ident-name-prop-name-literal-default-escaped-ext.js',
  }),
  Object.freeze({
    group: 'language/expressions',
    path: 'test/language/expressions/assignment/dstr/ident-name-prop-name-literal-extends-escaped-ext.js',
  }),
  Object.freeze({
    group: 'language/expressions',
    path: 'test/language/expressions/class/accessor-name-inst/literal-numeric-binary.js',
  }),
  Object.freeze({
    group: 'language/expressions',
    path: 'test/language/expressions/class/accessor-name-inst/literal-numeric-octal.js',
  }),
  Object.freeze({
    group: 'language/expressions',
    path: 'test/language/expressions/class/accessor-name-inst/literal-string-default-escaped-ext.js',
  }),
  Object.freeze({
    group: 'language/expressions',
    path: 'test/language/expressions/class/accessor-name-inst/literal-string-unicode-escape.js',
  }),
  Object.freeze({
    group: 'language/expressions',
    path: 'test/language/expressions/class/accessor-name-static/literal-numeric-binary.js',
  }),
  Object.freeze({
    group: 'language/expressions',
    path: 'test/language/expressions/class/accessor-name-static/literal-numeric-octal.js',
  }),
  Object.freeze({
    group: 'language/expressions',
    path: 'test/language/expressions/class/accessor-name-static/literal-string-default-escaped-ext.js',
  }),
  Object.freeze({
    group: 'language/expressions',
    path: 'test/language/expressions/class/accessor-name-static/literal-string-unicode-escape.js',
  }),
  Object.freeze({
    group: 'language/expressions',
    path: 'test/language/expressions/class/ident-name-method-def-default-escaped-ext.js',
  }),
  Object.freeze({
    group: 'language/expressions',
    path: 'test/language/expressions/class/ident-name-method-def-extends-escaped-ext.js',
  }),
  Object.freeze({
    group: 'language/statements',
    path: 'test/language/statements/class/accessor-name-inst/literal-numeric-binary.js',
  }),
  Object.freeze({
    group: 'language/statements',
    path: 'test/language/statements/class/accessor-name-inst/literal-numeric-octal.js',
  }),
  Object.freeze({
    group: 'language/statements',
    path: 'test/language/statements/class/accessor-name-inst/literal-string-default-escaped-ext.js',
  }),
  Object.freeze({
    group: 'language/statements',
    path: 'test/language/statements/class/accessor-name-inst/literal-string-unicode-escape.js',
  }),
  Object.freeze({
    group: 'language/statements',
    path: 'test/language/statements/class/accessor-name-static/literal-numeric-binary.js',
  }),
  Object.freeze({
    group: 'language/statements',
    path: 'test/language/statements/class/accessor-name-static/literal-numeric-octal.js',
  }),
  Object.freeze({
    group: 'language/statements',
    path: 'test/language/statements/class/accessor-name-static/literal-string-default-escaped-ext.js',
  }),
  Object.freeze({
    group: 'language/statements',
    path: 'test/language/statements/class/accessor-name-static/literal-string-unicode-escape.js',
  }),
  Object.freeze({
    group: 'language/statements',
    path: 'test/language/statements/class/ident-name-method-def-default-escaped-ext.js',
  }),
  Object.freeze({
    group: 'language/statements',
    path: 'test/language/statements/class/ident-name-method-def-extends-escaped-ext.js',
  }),
]);
const HISTORICAL_P0_ES5_SELECTION_REMOVAL = Object.freeze({
  path: 'test/staging/sm/class/newTargetEval.js',
  category: 'post-es5-syntax',
  reason:
    'Exercises `new.target`, which remains outside this ES2015 syntax subset.',
});

/**
 * @param {Record<string, any>} authority
 * @param {readonly { status: string, path: string, sourcePath: string | null }[]} changes
 * @param {{
 *   deps: ProvenanceCheckDependencies,
 *   base: string,
 *   head: string,
 *   baseManifest: ReturnType<typeof parseEs2015ProvenanceManifest>,
 *   headManifest: ReturnType<typeof parseEs2015ProvenanceManifest>,
 *   marker: RoadmapConsumptionMarker,
 *   roadmapEvidenceCache?: Map<string, Promise<{
 *     texts: Map<string, string>,
 *     h0Bundle: ReturnType<typeof validateEs2015H0EvidenceBundle> | null,
 *   }>>,
 *   roadmapInputCache?: Map<string, Promise<string>>,
 * }} context
 */
export async function validateRoadmapProtectedOutputs(
  authority,
  changes,
  context,
) {
  if (context.marker.kind !== 'consume') {
    throw new Es2015ProvenanceCheckError(
      'roadmap protected-output validation requires a consumption marker',
    );
  }
  const profile = context.marker.profile;
  assertRoadmapAuthorityDoesNotClaimGateOwnerPaths(authority, profile);
  const projectionContext = {
    ...context,
    roadmapEvidenceCache: new Map(),
    roadmapInputCache: new Map(),
  };
  /** @type {Map<string, any>} */
  const protectedByPath = new Map(
    authority.protectedOutputs.map(
      (/** @type {Record<string, any>} */ output) => [output.path, output],
    ),
  );
  const ownedPaths = roadmapOwnedPathsFromBaseManifest(context.baseManifest);
  const generatedPrefixes = roadmapGeneratedNamespacePrefixes(authority);
  /** @type {Map<string, { status: string, path: string, sourcePath: string | null }[]>} */
  const changesByPath = new Map();

  for (const change of changes) {
    if (change.path === ES2015_PROVENANCE_FILE) continue;
    const sourcePath =
      change.sourcePath === null
        ? null
        : canonicalRepositoryPath(change.sourcePath);
    const path = canonicalRepositoryPath(change.path);
    const aliasedGateOwnerPath =
      path !== null &&
      path !== change.path &&
      roadmapAuthorityGateOwnerPath(path);
    if (aliasedGateOwnerPath) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected outputs include unexpected protected path ${change.path}`,
      );
    }
    const aliasedOwnedPath =
      path !== null &&
      path !== change.path &&
      (protectedByPath.has(path) ||
        ownedPaths.has(path) ||
        generatedPathMatchesNamespace(path, generatedPrefixes));
    if (aliasedOwnedPath) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected outputs include unexpected generated path ${change.path}`,
      );
    }
    if (change.status.startsWith('R') || change.status.startsWith('C')) {
      if (
        (sourcePath !== null &&
          (ownedPaths.has(sourcePath) ||
            generatedPathMatchesNamespace(sourcePath, generatedPrefixes))) ||
        (path !== null &&
          (ownedPaths.has(path) ||
            generatedPathMatchesNamespace(path, generatedPrefixes)))
      ) {
        throw new Es2015ProvenanceCheckError(
          `${profile} protected outputs forbid ${
            change.status.startsWith('R') ? 'rename' : 'copy'
          } ${change.sourcePath} -> ${change.path}`,
        );
      }
      continue;
    }
    if (change.status === 'D') {
      if (
        path !== null &&
        (ownedPaths.has(path) ||
          generatedPathMatchesNamespace(path, generatedPrefixes))
      ) {
        throw new Es2015ProvenanceCheckError(
          `${profile} protected outputs forbid deleted path ${change.path}`,
        );
      }
      continue;
    }
    if (path === null) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected outputs include unexpected generated path ${change.path}`,
      );
    }
    if (roadmapAuthorityGateOwnerPath(path)) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected outputs include unexpected protected path ${path}`,
      );
    }
    const output = protectedByPath.get(path);
    if (output !== undefined) {
      const entries = changesByPath.get(path) ?? [];
      entries.push(change);
      changesByPath.set(path, entries);
      continue;
    }
    if (ownedPaths.has(path)) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected outputs include unexpected protected path ${path}`,
      );
    }
    if (generatedPathMatchesNamespace(path, generatedPrefixes)) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected outputs include unexpected generated path ${path}`,
      );
    }
  }

  if (authority.evidence.length > 0) {
    await loadRoadmapEvidence(authority, projectionContext);
  }
  for (const output of authority.protectedOutputs) {
    const matchedChanges = changesByPath.get(output.path) ?? [];
    if (matchedChanges.length !== 1) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} must change exactly once`,
      );
    }
    const [change] = matchedChanges;
    if (output.operation === 'add-exact' && change.status !== 'A') {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} must be added in HEAD`,
      );
    }
    if (output.operation !== 'add-exact' && change.status !== 'M') {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} must modify the reviewed path in HEAD`,
      );
    }
    await validateProtectedOutputBytes(output, authority, projectionContext);
  }

  return authority.protectedOutputs.map(
    (/** @type {Record<string, any>} */ output) => ({
      path: output.path,
      operation: output.operation,
      sha256: roadmapProjectionSha256(output.path, authority),
    }),
  );
}

/**
 * @param {Record<string, any>} authority
 * @param {string} profile
 */
function assertRoadmapAuthorityDoesNotClaimGateOwnerPaths(authority, profile) {
  for (const field of ['evidence', 'protectedOutputs']) {
    for (const entry of authority[field] ?? []) {
      if (roadmapAuthorityGateOwnerPath(entry.path)) {
        throw new Es2015ProvenanceCheckError(
          `${profile} roadmap authority ${field} must not claim provenance range gate-owner path ${entry.path}`,
        );
      }
    }
  }
}

/** @param {string} path */
function roadmapAuthorityGateOwnerPath(path) {
  return (
    PROVENANCE_RANGE_GATE_OWNER_PATHS.includes(path) ||
    path.startsWith(`${PROVENANCE_DECISIONS_DIRECTORY}/`)
  );
}

/** @param {string} path */
function canonicalRepositoryPath(path) {
  if (typeof path !== 'string' || path === '') return null;
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {}
  const segments = [];
  for (const segment of decoded.replace(/\\/gu, '/').split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/');
}

/** @param {Record<string, any>} authority */
function roadmapGeneratedNamespacePrefixes(authority) {
  const prefixes = new Set();
  for (const path of [
    ...authority.evidence.map(
      (/** @type {{ path: string }} */ entry) => entry.path,
    ),
    ...authority.protectedOutputs.map(
      (/** @type {{ path: string }} */ entry) => entry.path,
    ),
  ]) {
    const match = /^(tools\/test262\/es2015-[a-z0-9]+-).+\.json$/u.exec(path);
    if (match !== null) prefixes.add(match[1]);
  }
  return prefixes;
}

/** @param {string} path @param {Set<string>} prefixes */
function generatedPathMatchesNamespace(path, prefixes) {
  for (const prefix of prefixes) {
    if (path.startsWith(prefix) && path.endsWith('.json')) return true;
  }
  return false;
}

/** @param {Record<string, any>} authority @param {string} suffix */
function roadmapEvidencePath(authority, suffix) {
  return `tools/test262/es2015-${String(authority.code).toLowerCase()}-${suffix}.json`;
}

/** @param {string} text @param {string} label */
function parseJsonValue(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Es2015ProvenanceCheckError(
      `${label} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/** @param {unknown} value */
function json(value) {
  return JSON.stringify(value);
}

/** @param {string} text @param {string} label */
function parseRoadmapPathList(text, label) {
  const value = parseJsonValue(text, label);
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || entry === '')
  ) {
    throw new Es2015ProvenanceCheckError(
      `${label} must be a sorted path array`,
    );
  }
  const paths = /** @type {string[]} */ (value);
  assertSortedUniqueStrings(paths, `${label} paths`);
  return paths;
}

/** @param {string} text @param {string} label */
function parseRoadmapBaseline(text, label) {
  const value = parseJsonValue(text, label);
  if (!Array.isArray(value)) {
    throw new Es2015ProvenanceCheckError(`${label} must be an array`);
  }
  const entries = /** @type {any[]} */ (value);
  assertSortedUniqueStrings(
    entries.map((entry) => entry.path),
    `${label} paths`,
  );
  return entries;
}

/** @param {string} text @param {string} label */
function parseRoadmapDisposition(text, label) {
  const value = parseJsonValue(text, label);
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !Array.isArray(/** @type {Record<string, unknown>} */ (value).destinations)
  ) {
    throw new Es2015ProvenanceCheckError(`${label} must contain destinations`);
  }
  const destinations = /** @type {any[]} */ (
    /** @type {Record<string, unknown>} */ (value).destinations
  );
  assertSortedUniqueStrings(
    destinations.map((entry) => entry.path),
    `${label} destinations`,
  );
  return destinations;
}

/** @param {string} text @param {string} label */
function parseRoadmapOwnerDeltas(text, label) {
  const value = parseJsonValue(text, label);
  if (!Array.isArray(value)) {
    throw new Es2015ProvenanceCheckError(`${label} must be an array`);
  }
  const entries = /** @type {any[]} */ (value);
  assertSortedUniqueStrings(
    entries.map((entry) => entry.path),
    `${label} paths`,
  );
  return entries;
}

/** @param {string} text @param {string} label */
function parseRoadmapOwnerMap(text, label) {
  const value = parseJsonValue(text, label);
  if (!Array.isArray(value)) {
    throw new Es2015ProvenanceCheckError(`${label} must be an array`);
  }
  const entries = /** @type {any[]} */ (value);
  assertSortedUniqueStrings(
    entries.map(
      (entry) =>
        `${entry.status}\u0000${entry.blocker ?? ''}\u0000${entry.issue}`,
    ),
    `${label} destinations`,
  );
  return entries;
}

/** @param {string} text @param {string} label */
function parseRoadmapAuditEvidence(text, label) {
  return parseRoadmapAuditEvidenceDocument(text, label).records;
}

/** @param {string} text @param {string} label */
function parseRoadmapAuditEvidenceDocument(text, label) {
  const value = parseJsonValue(text, label);
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !Array.isArray(/** @type {Record<string, unknown>} */ (value).auditRecords)
  ) {
    throw new Es2015ProvenanceCheckError(`${label} must contain auditRecords`);
  }
  const document = /** @type {Record<string, any>} */ (value);
  const rawRecords = /** @type {Record<string, any>[]} */ (
    document.auditRecords
  );
  const records = rawRecords.map((record) =>
    createTestRecord({
      file: record.file,
      variant: record.variant,
      status: record.status,
    }),
  );
  assertSortedUniqueStrings(
    records.map((record) => `${record.file}\u0000${record.variant ?? ''}`),
    `${label} audit records`,
  );
  return { document, rawRecords, records };
}

/** @param {readonly string[]} values @param {string} label */
function assertSortedUniqueStrings(values, label) {
  const sorted = [...values].sort();
  if (
    new Set(values).size !== values.length ||
    values.join('\u0000') !== sorted.join('\u0000')
  ) {
    throw new Es2015ProvenanceCheckError(`${label} must be sorted and unique`);
  }
}

/** @param {Record<string, any>} output @param {Record<string, any>} authority @param {Parameters<typeof validateRoadmapProtectedOutputs>[2]} context */
async function validateProtectedOutputBytes(output, authority, context) {
  const profile = context.marker.profile;
  const baseText =
    output.operation === 'add-exact'
      ? null
      : await readRequiredRoadmapFile(
          context.deps,
          context.base,
          output.path,
          'BASE',
          profile,
        );
  const headText = await readRoadmapProjectionInput(
    authority,
    context,
    output.path,
    'HEAD',
  );
  if (output.operation === 'add-exact') {
    if ((await context.deps.readGitFile(context.base, output.path)) !== null) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} must be absent from BASE`,
      );
    }
    if (sha256(headText) !== output.headSha256) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} HEAD bytes do not match ${authority.code} roadmap authority`,
      );
    }
    return;
  }
  if (baseText === null) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} must exist in BASE`,
    );
  }
  if (sha256(baseText) !== output.baseSha256) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} BASE bytes do not match ${authority.code} roadmap authority`,
    );
  }
  if (output.operation === 'replace-exact') {
    if (sha256(headText) !== output.headSha256) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} HEAD bytes do not match ${authority.code} roadmap authority`,
      );
    }
    return;
  }
  await validateProjectedOutput(output, authority, context, baseText, headText);
}

/** @param {ProvenanceCheckDependencies} deps @param {string} revision @param {string} path @param {'BASE' | 'HEAD'} side @param {string} profile */
async function readRequiredRoadmapFile(deps, revision, path, side, profile) {
  const mode = await deps.readGitMode?.(revision, path);
  if (
    mode !== null &&
    mode !== undefined &&
    !REGULAR_GIT_FILE_MODES.has(mode)
  ) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${path} must be a regular file in ${side}`,
    );
  }
  const text = await deps.readGitFile(revision, path);
  if (text === null) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${path} must ${
        side === 'HEAD' ? 'be added in HEAD' : 'exist in BASE'
      }`,
    );
  }
  return text;
}

/** @param {Record<string, any>} output @param {Record<string, any>} authority @param {Parameters<typeof validateRoadmapProtectedOutputs>[2]} context @param {string} baseText @param {string} headText */
async function validateProjectedOutput(
  output,
  authority,
  context,
  baseText,
  headText,
) {
  const profile = context.marker.profile;
  switch (output.path) {
    case TAXONOMY_FILE:
      await validateTaxonomyProjection(
        output,
        authority,
        context,
        baseText,
        headText,
      );
      break;
    case AUDIT_EVIDENCE_FILE:
      await validateAuditEvidenceProjection(
        output,
        authority,
        context,
        baseText,
        headText,
      );
      break;
    case 'tools/test262/upstream-subset.json':
      await validateSubsetProjection(
        output,
        authority,
        context,
        baseText,
        headText,
      );
      break;
    case ES5_SELECTION_FILE:
      await validateEs5SelectionProjection(
        output,
        authority,
        context,
        baseText,
        headText,
      );
      break;
    case REPORT_FILE:
      await validateReportProjection(
        output,
        authority,
        context,
        baseText,
        headText,
      );
      break;
    case CONFORMANCE_FILE:
      await validateConformanceProjection(
        output,
        authority,
        context,
        baseText,
        headText,
      );
      break;
    default:
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} has no roadmap projection validator`,
      );
  }
  const derivedProjectionSha256 = await derivedRoadmapProjectionSha256(
    output.path,
    authority,
    context,
  );
  if (
    derivedProjectionSha256 !== null &&
    output.projectionSha256 !== derivedProjectionSha256
  ) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} projection sha256 does not match the roadmap evidence`,
    );
  }
}

/** @param {Record<string, any>} authority @param {Parameters<typeof validateRoadmapProtectedOutputs>[2]} context */
async function loadRoadmapEvidence(authority, context) {
  const cacheKey = String(authority.code);
  const cached = context.roadmapEvidenceCache?.get(cacheKey);
  if (cached !== undefined) return cached;
  const loading = loadRoadmapEvidenceUncached(authority, context);
  context.roadmapEvidenceCache?.set(cacheKey, loading);
  return loading;
}

/** @param {Record<string, any>} authority @param {Parameters<typeof validateRoadmapProtectedOutputs>[2]} context */
async function loadRoadmapEvidenceUncached(authority, context) {
  const texts = new Map();
  for (const entry of authority.evidence) {
    const text = await readRoadmapProjectionInput(
      authority,
      context,
      entry.path,
      'HEAD',
    );
    if (sha256(text) !== entry.sha256) {
      throw new Es2015ProvenanceCheckError(
        `${context.marker.profile} evidence ${entry.path} HEAD bytes do not match ${authority.code} roadmap authority`,
      );
    }
    const prefix = `tools/test262/es2015-${String(
      authority.code,
    ).toLowerCase()}-`;
    const suffix =
      entry.path.startsWith(prefix) && entry.path.endsWith('.json')
        ? entry.path.slice(prefix.length, -'.json'.length)
        : entry.path;
    texts.set(suffix, text);
  }
  if (authority.code !== 'H0') {
    return { texts, h0Bundle: null };
  }
  const profile = context.marker.profile;
  return {
    texts,
    h0Bundle: validateEs2015H0EvidenceBundle({
      pin: {
        repository: context.baseManifest.repository,
        revision: context.baseManifest.revision,
      },
      pathsText: requiredEvidenceText(texts, 'paths', authority, profile),
      baselineText: requiredEvidenceText(texts, 'baseline', authority, profile),
      dispositionText: requiredEvidenceText(
        texts,
        'disposition',
        authority,
        profile,
      ),
      ownerMapText: requiredEvidenceText(
        texts,
        'owner-map',
        authority,
        profile,
      ),
      ownerDeltasText: requiredEvidenceText(
        texts,
        'owner-deltas',
        authority,
        profile,
      ),
      promotionText: requiredEvidenceText(
        texts,
        'promotion',
        authority,
        profile,
      ),
    }),
  };
}

/**
 * @param {Record<string, any>} authority
 * @param {Parameters<typeof validateRoadmapProtectedOutputs>[2]} context
 * @param {string} path
 * @param {'BASE' | 'HEAD'} side
 */
async function readRoadmapProjectionInput(authority, context, path, side) {
  if (side === 'BASE') {
    return readRequiredRoadmapFile(
      context.deps,
      context.base,
      path,
      side,
      context.marker.profile,
    );
  }
  const cached = context.roadmapInputCache?.get(path);
  if (cached !== undefined) return cached;
  const loading = readRoadmapProjectionHeadInput(authority, context, path);
  context.roadmapInputCache?.set(path, loading);
  return loading;
}

/**
 * @param {Record<string, any>} authority
 * @param {Parameters<typeof validateRoadmapProtectedOutputs>[2]} context
 * @param {string} path
 */
async function readRoadmapProjectionHeadInput(authority, context, path) {
  const profile = context.marker.profile;
  if (IMMUTABLE_ROADMAP_PROJECTION_INPUTS.has(path)) {
    const [baseText, headText] = await Promise.all([
      readRequiredRoadmapFile(
        context.deps,
        context.base,
        path,
        'BASE',
        profile,
      ),
      readRequiredRoadmapFile(
        context.deps,
        context.head,
        path,
        'HEAD',
        profile,
      ),
    ]);
    if (baseText !== headText) {
      throw new Es2015ProvenanceCheckError(
        `${profile} immutable projection input ${path} must remain byte-identical between BASE and HEAD`,
      );
    }
    return headText;
  }
  const ownedPaths = new Set(CLOSED_PROVENANCE_GENERATED_PATHS);
  for (const candidate of [
    ...(context.baseManifest.roadmapAuthorities ?? []),
    authority,
  ]) {
    for (const entry of candidate.evidence ?? []) ownedPaths.add(entry.path);
    for (const output of candidate.protectedOutputs ?? []) {
      ownedPaths.add(output.path);
    }
  }
  if (
    !ownedPaths.has(path) &&
    !authority.evidence.some(
      (/** @type {{ path: string }} */ entry) => entry.path === path,
    ) &&
    !authority.protectedOutputs.some(
      (/** @type {{ path: string }} */ entry) => entry.path === path,
    )
  ) {
    throw new Es2015ProvenanceCheckError(
      `${profile} projection HEAD read ${path} is not marker-owned`,
    );
  }
  return readRequiredRoadmapFile(
    context.deps,
    context.head,
    path,
    'HEAD',
    profile,
  );
}

/** @param {string} path @param {Record<string, any>} authority @param {Parameters<typeof validateRoadmapProtectedOutputs>[2]} context */
async function derivedRoadmapProjectionSha256(path, authority, context) {
  if (
    ![
      CONFORMANCE_FILE,
      REPORT_FILE,
      TAXONOMY_FILE,
      'tools/test262/upstream-subset.json',
    ].includes(path)
  ) {
    return null;
  }
  const evidence = await loadRoadmapEvidence(authority, context);
  const promotionText = evidence.texts.get('promotion');
  const ownerDeltasText = evidence.texts.get('owner-deltas');
  if (promotionText === undefined || ownerDeltasText === undefined) return null;
  return sha256(
    `${path}\u0000${authority.source.pathSha256}\u0000${sha256(
      promotionText,
    )}\u0000${sha256(ownerDeltasText)}\u0000`,
  );
}

/** @param {Record<string, any>} output @param {Record<string, any>} authority @param {Parameters<typeof validateRoadmapProtectedOutputs>[2]} context @param {string} baseText @param {string} headText */
async function validateTaxonomyProjection(
  output,
  authority,
  context,
  baseText,
  headText,
) {
  const profile = context.marker.profile;
  const evidence = await loadRoadmapEvidence(authority, context);
  if (evidence.h0Bundle !== null) {
    await validateH0TaxonomyProjection(
      output,
      authority,
      context,
      baseText,
      headText,
      evidence,
    );
    return;
  }
  const sourcePaths = parseRoadmapPathList(
    requiredEvidenceText(evidence.texts, 'paths', authority, profile),
    roadmapEvidencePath(authority, 'paths'),
  );
  const baseline = parseRoadmapBaseline(
    requiredEvidenceText(evidence.texts, 'baseline', authority, profile),
    roadmapEvidencePath(authority, 'baseline'),
  );
  const disposition = parseRoadmapDisposition(
    requiredEvidenceText(evidence.texts, 'disposition', authority, profile),
    roadmapEvidencePath(authority, 'disposition'),
  );
  const ownerDeltas = parseRoadmapOwnerDeltas(
    requiredEvidenceText(evidence.texts, 'owner-deltas', authority, profile),
    roadmapEvidencePath(authority, 'owner-deltas'),
  );
  const ownerMap = parseRoadmapOwnerMap(
    requiredEvidenceText(evidence.texts, 'owner-map', authority, profile),
    roadmapEvidencePath(authority, 'owner-map'),
  );
  const promotion = parseEs2015Promotion(
    requiredEvidenceText(evidence.texts, 'promotion', authority, profile),
  );
  const baseTaxonomy = parseJsonValue(baseText, output.path);
  const headTaxonomy = parseJsonValue(headText, output.path);
  const taxonomyLabel = `${profile} protected output ${output.path}`;
  const baseArtifact = taxonomyArtifact(baseTaxonomy, taxonomyLabel);
  const headArtifact = taxonomyArtifact(headTaxonomy, taxonomyLabel);
  const baseRecords = baseArtifact.byPath;
  const headRecords = headArtifact.byPath;
  const sourcePathSet = new Set(sourcePaths);
  if (sha256(`${sourcePaths.join('\n')}\n`) !== authority.source.pathSha256) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} source paths do not match ${authority.code} roadmap authority`,
    );
  }
  if (
    renderJson(taxonomyStaticData(baseArtifact.artifact)) !==
    renderJson(taxonomyStaticData(headArtifact.artifact))
  ) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} must preserve non-projected taxonomy metadata`,
    );
  }
  const baselinePaths = baseline.map((entry) => entry.path);
  if (baselinePaths.join('\u0000') !== sourcePaths.join('\u0000')) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} baseline does not cover the exact source ledger`,
    );
  }
  const sourceVariants = baseline.reduce(
    (total, entry) => total + entry.variants,
    0,
  );
  if (
    baseline.length !== authority.source.rootCount ||
    sourceVariants !== authority.source.variantCount
  ) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} baseline does not match the reviewed source counts`,
    );
  }
  const promoted = new Set(promotionPaths(promotion));
  const dispositionMap = new Map(
    disposition.map((entry) => [entry.path, entry]),
  );
  if (dispositionMap.size !== sourcePaths.length) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} disposition does not cover the exact source ledger`,
    );
  }
  const ownerDeltaPaths = ownerDeltas.map((entry) => entry.path);
  const expectedOwnerDeltaPaths = sourcePaths.filter(
    (path) => !promoted.has(path),
  );
  if (
    ownerDeltaPaths.join('\u0000') !== expectedOwnerDeltaPaths.join('\u0000')
  ) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} owner deltas do not cover the non-promoted source ledger`,
    );
  }
  const expectedOwnerMap = ownerMapFromDestinations(
    ownerDeltas.map((entry) => entryToDestination(entry)),
  );
  if (
    json(expectedOwnerMap) !==
    json(
      ownerMapFromDestinations(
        ownerMap.map((entry) => entryToDestination(entry)),
      ),
    )
  ) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} owner map does not match the exact non-selected destinations`,
    );
  }
  const expectedAuthorityDestinations = ownerMapFromDestinations(
    sourcePaths.map((path) => entryToDestination(dispositionMap.get(path))),
  );
  if (json(expectedAuthorityDestinations) !== json(authority.destinations)) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} destinations do not match ${authority.code} roadmap authority`,
    );
  }
  for (const path of headArtifact.classifications.map(
    (record) => record.path,
  )) {
    if (baseRecords.has(path)) continue;
    if (sourcePathSet.has(path)) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} names an unexpected reviewed source path ${path}`,
      );
    }
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} changes a foreign classification ${path}`,
    );
  }
  for (const path of baseArtifact.classifications.map(
    (record) => record.path,
  )) {
    if (headRecords.has(path)) continue;
    if (sourcePathSet.has(path)) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} is missing reviewed source path ${path}`,
      );
    }
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} must preserve foreign classification ${path}`,
    );
  }
  for (const path of sourcePaths) {
    const baseRecord = baseRecords.get(path);
    const headRecord = headRecords.get(path);
    const baselineRecord = baseline.find((entry) => entry.path === path);
    const destination = dispositionMap.get(path);
    if (
      baseRecord === undefined ||
      headRecord === undefined ||
      baselineRecord === undefined ||
      destination === undefined
    ) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} is missing reviewed source path ${path}`,
      );
    }
    if (json(baseRecord) !== json(baselineRecord)) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} baseline does not match BASE classification ${path}`,
      );
    }
    const expectedStatus = /** @type {string} */ (destination.status);
    const expectedBlocker = expectedStatus.startsWith('blocked:')
      ? destination.blocker
      : null;
    if (
      headRecord.variants !== baseRecord.variants ||
      headRecord.partition !== baseRecord.partition ||
      headRecord.status !== expectedStatus ||
      headRecord.blocker !== expectedBlocker
    ) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} does not apply the reviewed destination for ${path}`,
      );
    }
  }
  for (const [path, headRecord] of headRecords) {
    if (sourcePathSet.has(path)) continue;
    const baseRecord = baseRecords.get(path);
    if (json(baseRecord) !== json(headRecord)) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} changes a foreign classification ${path}`,
      );
    }
  }
  if (
    json(
      summarizeEs2015Classification(
        /** @type {readonly { path: string, variants: number, partition: string, status: string }[]} */ (
          /** @type {unknown} */ (headArtifact.classifications)
        ),
      ),
    ) !== json(headArtifact.artifact.summary)
  ) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} must preserve whole-tree summary balance`,
    );
  }
  if (
    json(taxonomyStatusTables(headArtifact.classifications)) !==
    json(headArtifact.artifact.statusTables)
  ) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} must preserve whole-tree status table balance`,
    );
  }
}

/**
 * @param {Record<string, any>} output
 * @param {Record<string, any>} authority
 * @param {Parameters<typeof validateRoadmapProtectedOutputs>[2]} context
 * @param {string} baseText
 * @param {string} headText
 * @param {Awaited<ReturnType<typeof loadRoadmapEvidence>>} evidence
 */
async function validateH0TaxonomyProjection(
  output,
  authority,
  context,
  baseText,
  headText,
  evidence,
) {
  const profile = context.marker.profile;
  const bundle = evidence.h0Bundle;
  if (bundle === null) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} requires normalized H0 evidence`,
    );
  }
  if (
    authority.source.baseTaxonomySha256 !== sha256(baseText) ||
    authority.source.pathSha256 !== bundle.paths.ledgerSha256 ||
    authority.source.rootCount !== bundle.paths.rootCount ||
    authority.source.variantCount !== bundle.paths.variantCount ||
    authority.reconciliation?.preservedTaxonomySha256 !==
      bundle.baseline.finalBaseTaxonomySha256 ||
    authority.reconciliation?.authorityTaxonomySha256 !== sha256(baseText) ||
    authority.reconciliation?.selectorPathSha256 !==
      bundle.paths.ledgerSha256 ||
    authority.reconciliation?.rootCount !== bundle.paths.rootCount ||
    authority.reconciliation?.variantCount !== bundle.paths.variantCount
  ) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} H0 source identity does not match ${authority.code} roadmap authority`,
    );
  }
  const preservedTaxonomyText = await readRequiredRoadmapFile(
    context.deps,
    bundle.baseline.finalBaseCommit,
    TAXONOMY_FILE,
    'BASE',
    profile,
  );
  assertExactH0DispositionDelta({
    baseline: requiredEvidenceText(
      evidence.texts,
      'baseline',
      authority,
      profile,
    ),
    preservedTaxonomyText,
    currentTaxonomyText: baseText,
    after: headText,
    disposition: requiredEvidenceText(
      evidence.texts,
      'disposition',
      authority,
      profile,
    ),
    promotion: requiredEvidenceText(
      evidence.texts,
      'promotion',
      authority,
      profile,
    ),
    ownerDeltas: requiredEvidenceText(
      evidence.texts,
      'owner-deltas',
      authority,
      profile,
    ),
    pathsManifest: requiredEvidenceText(
      evidence.texts,
      'paths',
      authority,
      profile,
    ),
    ownerMap: requiredEvidenceText(
      evidence.texts,
      'owner-map',
      authority,
      profile,
    ),
  });

  const baseArtifact = taxonomyArtifact(
    parseJsonValue(baseText, output.path),
    `${profile} protected output ${output.path} BASE taxonomy`,
  );
  const headArtifact = taxonomyArtifact(
    parseJsonValue(headText, output.path),
    `${profile} protected output ${output.path} HEAD taxonomy`,
  );
  if (
    renderJson(taxonomyStaticData(baseArtifact.artifact)) !==
    renderJson(taxonomyStaticData(headArtifact.artifact))
  ) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} must preserve non-projected taxonomy metadata`,
    );
  }
  const expectedDestinations = ownerMapFromDestinations([
    ...bundle.ownerMap.owners.map((owner) => ({
      status: 'blocked',
      blocker: owner.blocker,
      issue: owner.issue,
    })),
    {
      status: 'selected-passing',
      blocker: null,
      issue: authority.issue,
    },
  ]);
  if (json(expectedDestinations) !== json(authority.destinations)) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} destinations do not match ${authority.code} roadmap authority`,
    );
  }
  const [headSubsetText, headReportText] = await Promise.all([
    readRoadmapProjectionInput(
      authority,
      context,
      'tools/test262/upstream-subset.json',
      'HEAD',
    ),
    readRoadmapProjectionInput(authority, context, REPORT_FILE, 'HEAD'),
  ]);
  const expectedInputs = {
    ...baseArtifact.artifact.inputs,
    subsetSha256: sha256(headSubsetText),
    selectedEvidenceSha256: sha256(headReportText),
    h0DispositionSha256: sha256(
      requiredEvidenceText(evidence.texts, 'disposition', authority, profile),
    ),
    h0PromotionSha256: sha256(
      requiredEvidenceText(evidence.texts, 'promotion', authority, profile),
    ),
  };
  if (json(headArtifact.artifact.inputs) !== json(expectedInputs)) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} inputs do not match the exact H0 projection`,
    );
  }
  if (
    json(
      summarizeEs2015Classification(
        /** @type {readonly { path: string, variants: number, partition: string, status: string }[]} */ (
          /** @type {unknown} */ (headArtifact.classifications)
        ),
      ),
    ) !== json(headArtifact.artifact.summary)
  ) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} must preserve whole-tree summary balance`,
    );
  }
  if (
    json(taxonomyStatusTables(headArtifact.classifications)) !==
    json(headArtifact.artifact.statusTables)
  ) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} must preserve whole-tree status table balance`,
    );
  }
}

/** @param {Record<string, any>} output @param {Record<string, any>} authority @param {Parameters<typeof validateRoadmapProtectedOutputs>[2]} context @param {string} baseText @param {string} headText */
async function validateAuditEvidenceProjection(
  output,
  authority,
  context,
  baseText,
  headText,
) {
  const profile = context.marker.profile;
  const evidence = await loadRoadmapEvidence(authority, context);
  const sourcePaths = new Set(
    evidence.h0Bundle === null
      ? parseRoadmapPathList(
          requiredEvidenceText(evidence.texts, 'paths', authority, profile),
          roadmapEvidencePath(authority, 'paths'),
        )
      : evidence.h0Bundle.paths.paths,
  );
  const disposition = new Map(
    (evidence.h0Bundle === null
      ? parseRoadmapDisposition(
          requiredEvidenceText(
            evidence.texts,
            'disposition',
            authority,
            profile,
          ),
          roadmapEvidencePath(authority, 'disposition'),
        )
      : evidence.h0Bundle.disposition.dispositions
    ).map((entry) => [entry.path, entry]),
  );
  const expectations =
    evidence.h0Bundle === null
      ? await sourceAuditExpectations(
          authority,
          context,
          sourcePaths,
          output.path,
        )
      : new Map(
          evidence.h0Bundle.disposition.dispositions.map((entry) => [
            entry.path,
            entry.requiredVariants,
          ]),
        );
  const baseAudit = parseRoadmapAuditEvidenceDocument(baseText, output.path);
  const headAudit = parseRoadmapAuditEvidenceDocument(headText, output.path);
  if (
    renderJson(auditDocumentData(baseAudit.document)) !==
    renderJson(auditDocumentData(headAudit.document))
  ) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} must preserve audit document metadata`,
    );
  }
  const baseByKey = new Map(
    baseAudit.records.map((record, index) => [
      auditRecordKey(record),
      { normalized: record, raw: baseAudit.rawRecords[index] },
    ]),
  );
  const headByKey = new Map(
    headAudit.records.map((record, index) => [
      auditRecordKey(record),
      { normalized: record, raw: headAudit.rawRecords[index] },
    ]),
  );
  const baseByPath = auditEntriesByPath(baseAudit);
  const headByPath = auditEntriesByPath(headAudit);
  for (const [path, variants] of expectations) {
    const destination = disposition.get(path);
    if (destination === undefined) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} is missing reviewed source path ${path}`,
      );
    }
    const baseEntries = baseByPath.get(path) ?? [];
    const headEntries = headByPath.get(path) ?? [];
    if (baseEntries.length === 0 || headEntries.length === 0) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} is missing source audit root ${path}`,
      );
    }
    for (const variant of variants) {
      const key = `${path}\u0000${variant}`;
      const baseEntry = baseByKey.get(key);
      if (baseEntry === undefined) {
        throw new Es2015ProvenanceCheckError(
          `${profile} protected output ${output.path} must represent exact source variants for ${path}`,
        );
      }
      if (
        evidence.h0Bundle === null &&
        (destination.status === 'selected-passing' ||
          destination.status === 'audit-passing-unselected') &&
        baseEntry.normalized.status !== 'passed'
      ) {
        throw new Es2015ProvenanceCheckError(
          `${profile} protected output ${output.path} has non-passing evidence for ${path} (${String(variant)})`,
        );
      }
      const headEntry = headByKey.get(key);
      if (headEntry === undefined) {
        throw new Es2015ProvenanceCheckError(
          `${profile} protected output ${output.path} is missing source record ${path} (${String(variant)})`,
        );
      }
      if (json(baseEntry.raw) !== json(headEntry.raw)) {
        throw new Es2015ProvenanceCheckError(
          `${profile} protected output ${output.path} changes audited source evidence ${path} (${String(variant)})`,
        );
      }
    }
    const expectedVariants = [...variants].sort();
    if (
      !sameStringLists(
        baseEntries
          .map(
            (/** @type {{ normalized: { variant: string | null } }} */ entry) =>
              String(entry.normalized.variant),
          )
          .sort(),
        expectedVariants,
      ) ||
      !sameStringLists(
        headEntries
          .map(
            (/** @type {{ normalized: { variant: string | null } }} */ entry) =>
              String(entry.normalized.variant),
          )
          .sort(),
        expectedVariants,
      )
    ) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} must represent exact source variants for ${path}`,
      );
    }
  }
  for (const [key, entry] of baseByKey) {
    const record = entry.normalized;
    if (sourcePaths.has(record.file)) continue;
    const headRecord = headByKey.get(key);
    if (headRecord === undefined || json(headRecord.raw) !== json(entry.raw)) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} must preserve foreign audit record ${record.file} (${String(record.variant)})`,
      );
    }
  }
  for (const [key, entry] of headByKey) {
    const record = entry.normalized;
    if (sourcePaths.has(record.file) || baseByKey.has(key)) continue;
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} must preserve foreign audit record ${record.file} (${String(record.variant)})`,
    );
  }
}

/** @param {Record<string, any>} output @param {Record<string, any>} authority @param {Parameters<typeof validateRoadmapProtectedOutputs>[2]} context @param {string} baseText @param {string} headText */
async function validateSubsetProjection(
  output,
  authority,
  context,
  baseText,
  headText,
) {
  const profile = context.marker.profile;
  const baseSubset = parseUpstreamSubset(baseText);
  const headSubset = parseUpstreamSubset(headText);
  if (authority.code === 'P0' && authority.evidence.length === 0) {
    const deltas = subsetDeltaTuples(baseSubset, headSubset);
    if (
      json(deltas.added) !== json(HISTORICAL_P0_SUBSET_ADDITIONS) ||
      deltas.removed.length !== 0 ||
      output.projectionSha256 !== HISTORICAL_P0_SUBSET_DELTA_SHA256
    ) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} must apply exactly the approved P0 subset delta`,
      );
    }
    return;
  }
  const evidence = await loadRoadmapEvidence(authority, context);
  const promotion =
    evidence.h0Bundle?.promotion ??
    parseEs2015Promotion(
      requiredEvidenceText(evidence.texts, 'promotion', authority, profile),
    );
  const expected = serializeUpstreamSubset(
    mergePromotionSubset(baseSubset, promotion),
  );
  if (headText !== expected) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} must match the canonical promoted subset`,
    );
  }
}

/** @param {Record<string, any>} output @param {Record<string, any>} authority @param {Parameters<typeof validateRoadmapProtectedOutputs>[2]} context @param {string} baseText @param {string} headText */
async function validateEs5SelectionProjection(
  output,
  authority,
  context,
  baseText,
  headText,
) {
  const profile = context.marker.profile;
  parseEs5Selection(baseText);
  parseEs5Selection(headText);
  const baseSelection = parseJsonValue(baseText, output.path);
  const headSelection = parseJsonValue(headText, output.path);
  const baseExclusions = baseSelection.exclusions ?? [];
  const headExclusions = headSelection.exclusions ?? [];
  const removed = baseExclusions.filter(
    (/** @type {Record<string, any>} */ entry) =>
      !headExclusions.some(
        (/** @type {Record<string, any>} */ candidate) =>
          json(candidate) === json(entry),
      ),
  );
  const added = headExclusions.filter(
    (/** @type {Record<string, any>} */ entry) =>
      !baseExclusions.some(
        (/** @type {Record<string, any>} */ candidate) =>
          json(candidate) === json(entry),
      ),
  );
  if (
    authority.code !== 'P0' ||
    added.length !== 0 ||
    removed.length !== 1 ||
    json(removed[0]) !== json(HISTORICAL_P0_ES5_SELECTION_REMOVAL) ||
    output.projectionSha256 !== HISTORICAL_P0_ES5_SELECTION_DELTA_SHA256
  ) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} must apply exactly the approved P0 ES5 selection delta`,
    );
  }
  const baseTaxonomy = parseJsonValue(
    await readRoadmapProjectionInput(authority, context, TAXONOMY_FILE, 'BASE'),
    TAXONOMY_FILE,
  );
  const headTaxonomy = parseJsonValue(
    await readRoadmapProjectionInput(authority, context, TAXONOMY_FILE, 'HEAD'),
    TAXONOMY_FILE,
  );
  const path = HISTORICAL_P0_ES5_SELECTION_REMOVAL.path;
  const baseRecord = taxonomyArtifact(baseTaxonomy, TAXONOMY_FILE).byPath.get(
    path,
  );
  const headRecord = taxonomyArtifact(headTaxonomy, TAXONOMY_FILE).byPath.get(
    path,
  );
  if (json(baseRecord) !== json(headRecord)) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} must retain the taxonomy classification for ${path}`,
    );
  }
}

/** @param {Record<string, any>} output @param {Record<string, any>} authority @param {Parameters<typeof validateRoadmapProtectedOutputs>[2]} context @param {string} baseText @param {string} headText */
async function validateReportProjection(
  output,
  authority,
  context,
  baseText,
  headText,
) {
  const profile = context.marker.profile;
  const evidence = await loadRoadmapEvidence(authority, context);
  const promotion =
    evidence.h0Bundle?.promotion ??
    parseEs2015Promotion(
      requiredEvidenceText(evidence.texts, 'promotion', authority, profile),
    );
  const promoted = new Set(promotionPaths(promotion));
  const headSubsetText = await readRoadmapProjectionInput(
    authority,
    context,
    'tools/test262/upstream-subset.json',
    'HEAD',
  );
  const headSubset = parseUpstreamSubset(headSubsetText);
  const selectedPaths = upstreamSubsetPaths(headSubset);
  const headTestRecords = parseRoadmapReportTestRecords(headText, output.path);
  for (const record of headTestRecords) {
    if (!selectedPaths.includes(record.file)) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} names a foreign selected record ${record.file}`,
      );
    }
  }
  const baseTestRecords = parseRoadmapReportTestRecords(baseText, output.path);
  const headByKey = new Map();
  for (const record of headTestRecords) {
    const key = auditRecordKey(record);
    if (headByKey.has(key)) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} repeats selected record ${record.file} (${String(record.variant)})`,
      );
    }
    headByKey.set(key, record);
  }
  let promotionRecords;
  if (evidence.h0Bundle !== null) {
    const baseTaxonomy = taxonomyArtifact(
      parseJsonValue(
        await readRoadmapProjectionInput(
          authority,
          context,
          TAXONOMY_FILE,
          'BASE',
        ),
        TAXONOMY_FILE,
      ),
      `${profile} protected output ${output.path} BASE taxonomy`,
    );
    const promotionByPath = new Map(
      evidence.h0Bundle.promotion.entries.map((entry) => [entry.path, entry]),
    );
    promotionRecords = evidence.h0Bundle.disposition.dispositions
      .filter((entry) => entry.status === 'passed')
      .flatMap((entry) => {
        const taxonomy = baseTaxonomy.byPath.get(entry.path);
        const promotedEntry = promotionByPath.get(entry.path);
        if (
          taxonomy === undefined ||
          promotedEntry === undefined ||
          !sameStringLists(
            [...taxonomy.features].sort(),
            [...promotedEntry.features].sort(),
          )
        ) {
          throw new Es2015ProvenanceCheckError(
            `${profile} protected output ${output.path} promotion metadata does not match BASE taxonomy for ${entry.path}`,
          );
        }
        return entry.evidence.map((/** @type {any} */ variant) => {
          const record = headByKey.get(`${entry.path}\u0000${variant.variant}`);
          if (
            record === undefined ||
            record.status !== 'passed' ||
            !sameStringLists(
              [...(record.features ?? [])].sort(),
              [...taxonomy.features].sort(),
            )
          ) {
            throw new Es2015ProvenanceCheckError(
              `${profile} protected output ${output.path} must contain exact passing H0 record ${entry.path} (${variant.variant})`,
            );
          }
          return record;
        });
      });
  } else {
    const auditEvidenceText = await readRoadmapProjectionInput(
      authority,
      context,
      AUDIT_EVIDENCE_FILE,
      'HEAD',
    );
    promotionRecords = parseRoadmapAuditEvidence(
      auditEvidenceText,
      AUDIT_EVIDENCE_FILE,
    )
      .filter((record) => promoted.has(record.file))
      .map((record) => {
        if (record.status !== 'passed') {
          throw new Es2015ProvenanceCheckError(
            `${profile} protected output ${output.path} requires passing audit evidence for promoted path ${record.file}`,
          );
        }
        return createTestRecord({
          file: record.file,
          variant: record.variant,
          status: record.status,
        });
      });
  }
  const expectedRecords = orderReportRecords(
    selectedPaths,
    baseTestRecords.filter((record) => !promoted.has(record.file)),
    promotionRecords,
  );
  const expectedText = await canonicalRoadmapReportText({
    featuresText: await readRoadmapProjectionInput(
      authority,
      context,
      FEATURES_FILE,
      'HEAD',
    ),
    records: expectedRecords,
    subsetText: headSubsetText,
    taxonomyText: await readRoadmapProjectionInput(
      authority,
      context,
      TAXONOMY_FILE,
      'HEAD',
    ),
  });
  if (headText !== expectedText) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} must match the canonical selected report`,
    );
  }
}

/** @param {Record<string, any>} output @param {Record<string, any>} authority @param {Parameters<typeof validateRoadmapProtectedOutputs>[2]} context @param {string} baseText @param {string} headText */
async function validateConformanceProjection(
  output,
  authority,
  context,
  baseText,
  headText,
) {
  const profile = context.marker.profile;
  const reportText = await readRoadmapProjectionInput(
    authority,
    context,
    REPORT_FILE,
    'HEAD',
  );
  const subsetText = await readRoadmapProjectionInput(
    authority,
    context,
    'tools/test262/upstream-subset.json',
    'HEAD',
  );
  const taxonomyText = await readRoadmapProjectionInput(
    authority,
    context,
    TAXONOMY_FILE,
    'HEAD',
  );
  const expected = replaceGeneratedBlock(
    baseText,
    roadmapCoverageBlock(reportText, subsetText, taxonomyText),
  );
  if (headText !== expected) {
    if (
      stripGeneratedCoverageBlock(baseText) !==
      stripGeneratedCoverageBlock(headText)
    ) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${output.path} must preserve manual prose outside the generated block`,
      );
    }
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} must match the canonical coverage block`,
    );
  }
}

/** @param {Map<string, string>} evidence @param {string} suffix @param {Record<string, any>} authority @param {string} profile */
function requiredEvidenceText(evidence, suffix, authority, profile) {
  const text = evidence.get(suffix);
  if (text === undefined) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${roadmapEvidencePath(authority, suffix)} must be added in HEAD`,
    );
  }
  return text;
}

/** @param {unknown} value @param {string} label */
function taxonomyArtifact(value, label) {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !Array.isArray(
      /** @type {Record<string, unknown>} */ (value).classifications,
    )
  ) {
    throw new Es2015ProvenanceCheckError(
      `${label} must contain classifications`,
    );
  }
  const artifact = /** @type {Record<string, any>} */ (value);
  const classifications = /** @type {Record<string, any>[]} */ (
    artifact.classifications
  );
  const duplicate = firstDuplicate(
    classifications.map((record) => String(record?.path ?? '')),
  );
  if (duplicate !== null) {
    throw new Es2015ProvenanceCheckError(
      `${label} contains duplicate classification key ${duplicate}`,
    );
  }
  return {
    artifact,
    classifications,
    byPath: new Map(classifications.map((record) => [record.path, record])),
  };
}

/** @param {readonly Record<string, any>[]} classifications */
function taxonomyStatusTables(classifications) {
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
      (entry) => entry.blocker,
    ),
  };
}

/** @param {readonly Record<string, any>[]} entries @param {(entry: Record<string, any>) => string} keyOf */
function countTable(entries, keyOf) {
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
}

/** @param {Record<string, any>} artifact */
function taxonomyStaticData(artifact) {
  const staticData = { ...artifact };
  delete staticData.inputs;
  delete staticData.summary;
  delete staticData.statusTables;
  delete staticData.classifications;
  return staticData;
}

/** @param {Record<string, any>} document */
function auditDocumentData(document) {
  const data = { ...document };
  delete data.auditRecords;
  return data;
}

/**
 * @param {Record<string, any>} authority
 * @param {Parameters<typeof validateRoadmapProtectedOutputs>[2]} context
 * @param {ReadonlySet<string>} sourcePaths
 * @param {string} outputPath
 */
async function sourceAuditExpectations(
  authority,
  context,
  sourcePaths,
  outputPath,
) {
  const profile = context.marker.profile;
  const sourcePathList = [...sourcePaths].sort();
  if (
    sha256(`${sourcePathList.join('\n')}\n`) !== authority.source.pathSha256
  ) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${outputPath} source paths do not match ${authority.code} roadmap authority`,
    );
  }
  const baseTaxonomyText = await readRequiredRoadmapFile(
    context.deps,
    context.base,
    TAXONOMY_FILE,
    'BASE',
    profile,
  );
  if (sha256(baseTaxonomyText) !== authority.source.baseTaxonomySha256) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${outputPath} BASE taxonomy does not match ${authority.code} roadmap authority`,
    );
  }
  const taxonomy = taxonomyArtifact(
    parseJsonValue(baseTaxonomyText, TAXONOMY_FILE),
    `${profile} protected output ${outputPath} BASE taxonomy`,
  );
  const expectations = new Map();
  let variantCount = 0;
  for (const path of sourcePathList) {
    const record = taxonomy.byPath.get(path);
    if (record === undefined) {
      throw new Es2015ProvenanceCheckError(
        `${profile} protected output ${outputPath} is missing reviewed source path ${path}`,
      );
    }
    const variants = taxonomyExecutionVariants(record, outputPath, profile);
    expectations.set(path, variants);
    variantCount += variants.length;
  }
  if (
    expectations.size !== authority.source.rootCount ||
    variantCount !== authority.source.variantCount
  ) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${outputPath} source variant expectations do not match ${authority.code} roadmap authority`,
    );
  }
  return expectations;
}

/** @param {{ records: readonly any[], rawRecords: readonly Record<string, any>[] }} audit */
function auditEntriesByPath(audit) {
  const byPath = new Map();
  audit.records.forEach((record, index) => {
    const entries = byPath.get(record.file) ?? [];
    entries.push({ normalized: record, raw: audit.rawRecords[index] });
    byPath.set(record.file, entries);
  });
  return byPath;
}

/** @param {Record<string, any>} record @param {string} outputPath @param {string} profile */
function taxonomyExecutionVariants(record, outputPath, profile) {
  if (
    !Array.isArray(record.flags) ||
    record.flags.some((flag) => typeof flag !== 'string')
  ) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${outputPath} cannot derive exact source variants for ${record.path}`,
    );
  }
  const flags = new Set(record.flags);
  const variants = flags.has('raw')
    ? ['raw']
    : flags.has('onlyStrict')
      ? ['strict']
      : flags.has('noStrict') || flags.has('module')
        ? ['non-strict']
        : ['non-strict', 'strict'];
  if (record.variants !== variants.length) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${outputPath} cannot derive exact source variants for ${record.path}`,
    );
  }
  return variants;
}

/** @param {readonly string[]} left @param {readonly string[]} right */
function sameStringLists(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

/** @param {readonly string[]} values */
function firstDuplicate(values) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

/** @param {any} entry */
function entryToDestination(entry) {
  if (entry === undefined) {
    throw new Es2015ProvenanceCheckError('Roadmap destination is missing');
  }
  return {
    status:
      typeof entry.status === 'string' && entry.status.startsWith('blocked:')
        ? 'blocked'
        : entry.status,
    blocker:
      typeof entry.status === 'string' && entry.status.startsWith('blocked:')
        ? entry.blocker
        : (entry.blocker ?? null),
    issue: entry.issue,
  };
}

/** @param {readonly { status: string, blocker: string | null, issue: number }[]} destinations */
function ownerMapFromDestinations(destinations) {
  const seen = new Map();
  for (const destination of destinations) {
    const key = `${destination.status}\u0000${destination.blocker ?? ''}\u0000${destination.issue}`;
    if (!seen.has(key)) {
      seen.set(key, destination);
    }
  }
  return [...seen.values()].sort((left, right) =>
    `${left.status}\u0000${left.blocker ?? ''}\u0000${left.issue}` <
    `${right.status}\u0000${right.blocker ?? ''}\u0000${right.issue}`
      ? -1
      : 1,
  );
}

/** @param {any} baseSubset @param {any} headSubset */
function subsetDeltaTuples(baseSubset, headSubset) {
  const baseGroups = new Map(
    baseSubset.groups.map((/** @type {{ name: string }} */ group) => [
      group.name,
      group,
    ]),
  );
  const headGroups = new Map(
    headSubset.groups.map((/** @type {{ name: string }} */ group) => [
      group.name,
      group,
    ]),
  );
  const groupNames = [
    ...new Set([...baseGroups.keys(), ...headGroups.keys()]),
  ].sort();
  const added = [];
  const removed = [];
  for (const name of groupNames) {
    const baseGroup = baseGroups.get(name) ?? { paths: [] };
    const headGroup = headGroups.get(name) ?? { paths: [] };
    const basePaths = new Set(baseGroup.paths);
    const headPaths = new Set(headGroup.paths);
    for (const path of [...headPaths]
      .filter((/** @type {string} */ path) => !basePaths.has(path))
      .sort((/** @type {string} */ left, /** @type {string} */ right) =>
        left.localeCompare(right),
      )) {
      added.push({ group: name, path });
    }
    for (const path of [...basePaths]
      .filter((/** @type {string} */ path) => !headPaths.has(path))
      .sort((/** @type {string} */ left, /** @type {string} */ right) =>
        left.localeCompare(right),
      )) {
      removed.push({ group: name, path });
    }
  }
  return { added, removed };
}

/** @param {string} text @param {string} label */
function parseRoadmapReportTestRecords(text, label) {
  /** @type {ReturnType<typeof createTestRecord>[]} */
  const records = [];
  for (const [index, line] of text.trim().split('\n').entries()) {
    if (line === '') continue;
    const value = parseJsonValue(line, `${label} line ${index + 1}`);
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      /** @type {Record<string, unknown>} */ (value).type !== 'test'
    ) {
      continue;
    }
    const record = /** @type {Record<string, any>} */ (value);
    records.push(
      createTestRecord({
        file: record.file,
        variant: record.variant,
        status: record.status,
        ...(record.features === undefined ? {} : { features: record.features }),
      }),
    );
  }
  return records;
}

/**
 * @param {readonly string[]} selectedPaths
 * @param {readonly ReturnType<typeof createTestRecord>[]} baseRecords
 * @param {readonly ReturnType<typeof createTestRecord>[]} promotionRecords
 */
function orderReportRecords(selectedPaths, baseRecords, promotionRecords) {
  const byFile = new Map();
  for (const record of [...baseRecords, ...promotionRecords]) {
    const list = byFile.get(record.file) ?? [];
    list.push(record);
    byFile.set(record.file, list);
  }
  return selectedPaths.flatMap((/** @type {string} */ path) =>
    (byFile.get(path) ?? []).sort(
      (
        /** @type {ReturnType<typeof createTestRecord>} */ left,
        /** @type {ReturnType<typeof createTestRecord>} */ right,
      ) => String(left.variant).localeCompare(String(right.variant)),
    ),
  );
}

/** @param {{ subsetText: string, taxonomyText: string, featuresText: string, records: readonly ReturnType<typeof createTestRecord>[] }} options */
async function canonicalRoadmapReportText(options) {
  const subset = parseUpstreamSubset(options.subsetText);
  const features = parseFeatureManifest(options.featuresText);
  const coverage = summarizeTest262Coverage({
    inventory: coverageInventoryFromTaxonomy(options.taxonomyText),
    records: options.records,
    selected: upstreamSubsetPaths(subset),
  });
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

/** @param {string} taxonomyText */
function coverageInventoryFromTaxonomy(taxonomyText) {
  const taxonomy = parseJsonValue(taxonomyText, TAXONOMY_FILE);
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

/** @param {string} reportText @param {string} subsetText @param {string} taxonomyText */
function roadmapCoverageBlock(reportText, subsetText, taxonomyText) {
  const records = parseRoadmapReportTestRecords(reportText, REPORT_FILE);
  const subset = parseUpstreamSubset(subsetText);
  const coverage = summarizeTest262Coverage({
    inventory: coverageInventoryFromTaxonomy(taxonomyText),
    records,
    selected: upstreamSubsetPaths(subset),
  });
  return renderCoverageSummary({
    coverage,
    reportPath: REPORT_FILE,
    reportLinkPath: REPORT_FILE.slice(REPORT_FILE.lastIndexOf('/') + 1),
  });
}

/** @param {string} document */
function stripGeneratedCoverageBlock(document) {
  return replaceGeneratedBlock(document, '').trim();
}

/** @param {ReturnType<typeof createTestRecord>} record */
function auditRecordKey(record) {
  return `${record.file}\u0000${record.variant ?? ''}`;
}

/**
 * @param {string} base
 * @param {string | null} baseManifestText
 * @returns {{
 *   profile: ReturnType<typeof parseEs2015ProvenanceManifest>['rangeProfiles'][number],
 *   baseLedgerSha256: string,
 * }}
 */
function maintenanceRangeAuthority(base, baseManifestText) {
  if (baseManifestText === null) {
    throw new Es2015ProvenanceCheckError(
      'foundation-maintenance range requires a provenance foundation manifest in the base',
    );
  }
  if (!hasMaintenanceProfile(baseManifestText)) {
    if (
      base === FOUNDATION_BOOTSTRAP_COMMIT &&
      sha256(baseManifestText) === FOUNDATION_BOOTSTRAP_MANIFEST_SHA256
    ) {
      return {
        profile: FOUNDATION_BOOTSTRAP_RANGE_PROFILE,
        baseLedgerSha256: FOUNDATION_BOOTSTRAP_BASE_LEDGER_SHA256,
      };
    }
    throw new Es2015ProvenanceCheckError(
      'foundation-maintenance range requires the exact U0 bootstrap base and manifest',
    );
  }
  const manifest = parseRangeManifest(
    baseManifestText,
    'foundation-maintenance base',
  );
  if (manifest.version === 3) {
    throw new Es2015ProvenanceCheckError(
      'foundation-maintenance range is unavailable once the BASE provenance manifest is schema v3',
    );
  }
  return {
    profile: rangeProfileForManifest(manifest, FOUNDATION_MAINTENANCE_PROFILE),
    baseLedgerSha256: manifest.baseLedger.pathSha256,
  };
}

/** @param {string} text */
function hasMaintenanceProfile(text) {
  try {
    const value = JSON.parse(text);
    return (
      typeof value === 'object' &&
      value !== null &&
      Array.isArray(value.rangeProfiles) &&
      value.rangeProfiles.some(
        (/** @type {{ name?: unknown }} */ profile) =>
          typeof profile === 'object' &&
          profile !== null &&
          profile.name === FOUNDATION_MAINTENANCE_PROFILE,
      )
    );
  } catch {
    return false;
  }
}

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * @param {ReturnType<typeof parseEs2015ProvenanceManifest>} manifest
 * @param {string} name
 */
function rangeProfileForManifest(manifest, name) {
  const profile = manifest.rangeProfiles.find(
    (
      /** @type {ReturnType<typeof parseEs2015ProvenanceManifest>['rangeProfiles'][number]} */ entry,
    ) => entry.name === name,
  );
  if (profile === undefined) {
    throw new Es2015ProvenanceCheckError(
      `Unknown provenance range profile ${name}`,
    );
  }
  return profile;
}

/** @param {unknown} actual @param {unknown} expected @param {string} message */
function assertRoadmapBasePin(actual, expected, message) {
  if (actual !== expected) {
    throw new Es2015ProvenanceCheckError(message);
  }
}

/**
 * @param {string} name
 * @param {readonly string[]} requiredPaths
 * @param {readonly string[]} allowedPaths
 */
function syntheticRangeProfile(name, requiredPaths, allowedPaths) {
  return {
    name,
    requiredPaths,
    allowedPaths,
    requiredDeletions: Object.freeze([]),
    allowedDeletions: Object.freeze([]),
  };
}

/**
 * @param {unknown} manifest
 * @param {string} _label
 * @returns {ReturnType<typeof parseEs2015ProvenanceManifest>}
 */
function normalizeRangeManifestValue(manifest, _label) {
  const normalized = validateRoadmapAuthorityManifest(manifest);
  validateProvenanceFoundation(normalized);
  return normalized;
}

/**
 * @param {ProvenanceCheckDependencies} deps
 * @param {string} base
 * @param {string} head
 * @param {string} label
 */
async function validateDecisionFragmentsByteIdentical(deps, base, head, label) {
  for (const code of ES2015_PROVENANCE_DECISION_CODES) {
    const path = decisionFragmentPath(code);
    const baseText = await readRequiredGitFile(deps, base, path);
    const headText = await readRequiredGitFile(deps, head, path);
    if (baseText !== headText) {
      throw new Es2015ProvenanceCheckError(
        `${path} must remain byte-identical across ${label}`,
      );
    }
  }
}

/**
 * @param {ProvenanceCheckDependencies} deps
 * @param {string} base
 * @param {string} head
 */
async function validateEmbeddedRoadmapAuthorityDocuments(deps, base, head) {
  for (const document of ROADMAP_STANDALONE_DOCUMENTS) {
    const embeddedPayload = extractEmbeddedRoadmapAuthorityPayload(
      await readRequiredGitFile(deps, base, document.basePath),
      document.label,
      document.basePath,
    );
    const headText = await readRequiredGitFile(deps, head, document.headPath);
    if (headText !== embeddedPayload) {
      throw new Es2015ProvenanceCheckError(
        `${document.headPath} must match the embedded roadmap authority ${document.label} payload from BASE`,
      );
    }
  }
}

/**
 * @param {string} text
 * @param {string} label
 * @param {string} path
 */
function extractEmbeddedRoadmapAuthorityPayload(text, label, path) {
  const beginPattern = new RegExp(
    `^<!-- BEGIN ROADMAP AUTHORITY ${label} sha256:([0-9a-f]{64}) -->$`,
    'gmu',
  );
  const endPattern = new RegExp(
    `^<!-- END ROADMAP AUTHORITY ${label} -->$`,
    'gmu',
  );
  const beginMatches = [...text.matchAll(beginPattern)];
  const endMatches = [...text.matchAll(endPattern)];
  if (beginMatches.length !== 1 || endMatches.length !== 1) {
    throw new Es2015ProvenanceCheckError(
      `${path} must contain exactly one embedded roadmap authority ${label} payload`,
    );
  }
  const [beginMatch] = beginMatches;
  const [endMatch] = endMatches;
  const beginIndex = beginMatch.index;
  const endIndex = endMatch.index;
  if (beginIndex === undefined || endIndex === undefined) {
    throw new Es2015ProvenanceCheckError(
      `${path} must contain exactly one embedded roadmap authority ${label} payload`,
    );
  }
  const payloadStart = beginIndex + beginMatch[0].length;
  if (!text.startsWith('\n', payloadStart) || endIndex <= payloadStart + 1) {
    throw new Es2015ProvenanceCheckError(
      `${path} must contain exactly one embedded roadmap authority ${label} payload`,
    );
  }
  const payload = text.slice(payloadStart + 1, endIndex);
  if (sha256(payload) !== beginMatch[1]) {
    throw new Es2015ProvenanceCheckError(
      `${path} embedded roadmap authority ${label} payload sha256 does not match its exact bytes`,
    );
  }
  return payload;
}

/** @param {string | null} value @param {string} option */
function explicitCommitSha(value, option) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new Es2015ProvenanceCheckError(
      `${option} must be an explicit full commit SHA`,
    );
  }
  return value;
}

/**
 * @param {ProvenanceCheckDependencies} deps
 * @param {{ rangeProfile: string | null, rangeMarker: string | null, prBodyEnvironment: string | null }} options
 * @param {readonly { status: string, path: string, sourcePath: string | null }[]} changes
 * @param {string} base
 * @param {string} head
 */
async function markerForRange(deps, options, changes, base, head) {
  if (options.prBodyEnvironment === null) {
    const markerText = /** @type {string} */ (options.rangeMarker);
    const parsed = markerText.includes('<!-- es2015-roadmap-authority-')
      ? parseRoadmapAuthorityMarker(markerText)
      : parseProvenanceRangeMarker(markerText);
    if (rangeProfileForMarker(parsed) !== options.rangeProfile) {
      throw new Es2015ProvenanceCheckError(
        `Provenance PR marker does not match ${options.rangeProfile} policy`,
      );
    }
    return parsed;
  }
  if (!/^[A-Z][A-Z0-9_]*$/u.test(options.prBodyEnvironment)) {
    throw new Es2015ProvenanceCheckError(
      '--pr-body-env must name a trusted environment variable',
    );
  }
  const eventName = deps.environment.GITHUB_EVENT_NAME;
  if (
    typeof eventName !== 'string' ||
    !['pull_request', 'pull_request_target'].includes(eventName)
  ) {
    throw new Es2015ProvenanceCheckError(
      'Provenance PR range checking requires a pull_request event',
    );
  }
  const body = deps.environment[options.prBodyEnvironment];
  if (typeof body !== 'string') {
    throw new Es2015ProvenanceCheckError(
      `Provenance PR body environment ${options.prBodyEnvironment} is missing`,
    );
  }
  const markers = authoritativeRangeMarkers(body, eventName === 'pull_request');
  if (markers.length === 0) {
    if (await provenanceOwnedRange(deps, changes, base, head)) {
      throw new Es2015ProvenanceCheckError(
        'A provenance-owned PR range requires one authoritative provenance marker',
      );
    }
    return null;
  }
  if (markers.length !== 1) {
    throw new Es2015ProvenanceCheckError(
      'PR body must contain exactly one authoritative provenance marker',
    );
  }
  return markers[0];
}

/** @param {string} text */
function parseProvenanceRangeMarker(text) {
  const match =
    /^<!-- es2015-provenance-pr parent:T1 parent-issue:75 profile:([A-Za-z0-9:-]+) base-ledger-sha256:([0-9a-f]{64}) -->$/u.exec(
      text,
    );
  if (match === null) {
    throw new Es2015ProvenanceCheckError(
      'Provenance PR marker is not authoritative',
    );
  }
  return { text, profile: match[1], baseLedgerSha256: match[2] };
}

/** @param {string} text @returns {H0BootstrapRepairMarker} */
function parseH0BootstrapRepairMarker(text) {
  const match = h0BootstrapRepairMarkerPattern().exec(text);
  if (match === null) {
    throw new Es2015ProvenanceCheckError(
      'H0 bootstrap repair marker is not authoritative',
    );
  }
  return {
    kind: 'h0-bootstrap-repair',
    text,
    base: match[1],
    baseManifestSha256: match[2],
  };
}

/** @param {string} text @returns {RoadmapMarker} */
export function parseRoadmapAuthorityMarker(text) {
  /** @type {readonly ((candidate: string) => RoadmapMarker | null)[]} */
  const parsers = [
    (candidate) => {
      const match = roadmapMigrationMarkerPattern().exec(candidate);
      if (match === null || match[0] !== candidate) return null;
      return /** @type {RoadmapMigrationMarker} */ ({
        kind: 'migration',
        text: candidate,
        base: match[1],
        baseManifestSha256: match[2],
        baseCheckerSha256: match[3],
        baseWorkflowSha256: match[4],
        headManifestSha256: match[5],
      });
    },
    (candidate) => {
      const match = roadmapPreparationMarkerPattern().exec(candidate);
      if (match === null || match[0] !== candidate) return null;
      return /** @type {RoadmapPreparationMarker} */ ({
        kind: 'prepare',
        text: candidate,
        code: match[1],
        issue: Number(match[2]),
        base: match[3],
        baseManifestSha256: match[4],
        recordSha256: match[5],
      });
    },
    (candidate) => {
      const match = roadmapConsumptionMarkerPattern().exec(candidate);
      if (match === null || match[0] !== candidate) return null;
      return /** @type {RoadmapConsumptionMarker} */ ({
        kind: 'consume',
        text: candidate,
        code: match[1],
        issue: Number(match[2]),
        profile: match[3],
        base: match[4],
        sourcePathSha256: match[5],
        sourceEntrySha256: match[6] === 'null' ? null : match[6],
        protectedProjectionSha256: match[7],
      });
    },
  ];
  for (const parse of parsers) {
    const marker = parse(text);
    if (marker !== null) return marker;
  }
  throw new Es2015ProvenanceCheckError(
    'Roadmap authority marker is not authoritative',
  );
}

/** @param {string} body @param {boolean} includeH0BootstrapRepair */
function authoritativeRangeMarkers(body, includeH0BootstrapRepair) {
  const markers = [];
  for (const match of body.matchAll(
    /(^|\n)(<!-- es2015-provenance-pr parent:T1 parent-issue:75 profile:[A-Za-z0-9:-]+ base-ledger-sha256:[0-9a-f]{64} -->)(?=\n|$)/gu,
  )) {
    markers.push({
      index: match.index ?? 0,
      marker: parseProvenanceRangeMarker(match[2]),
    });
  }
  if (includeH0BootstrapRepair) {
    for (const match of body.matchAll(h0BootstrapRepairBodyPattern())) {
      markers.push({
        index: match.index ?? 0,
        marker: parseH0BootstrapRepairMarker(match[2]),
      });
    }
  }
  for (const matcher of [
    roadmapMigrationBodyPattern(),
    roadmapPreparationBodyPattern(),
    roadmapConsumptionBodyPattern(),
  ]) {
    for (const match of body.matchAll(matcher)) {
      markers.push({
        index: match.index ?? 0,
        marker: parseRoadmapAuthorityMarker(match[2]),
      });
    }
  }
  return markers
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.marker);
}

function h0BootstrapRepairMarkerPattern() {
  return /^<!-- es2015-h0-bootstrap-repair base:([0-9a-f]{40}) base-manifest-sha256:([0-9a-f]{64}) -->$/u;
}

function h0BootstrapRepairBodyPattern() {
  return /(^|\n)(<!-- es2015-h0-bootstrap-repair base:[0-9a-f]{40} base-manifest-sha256:[0-9a-f]{64} -->)(?=\n|$)/gu;
}

function roadmapMigrationMarkerPattern() {
  return /^<!-- es2015-roadmap-authority-migration\nparent:70\nbase:([0-9a-f]{40})\nbase-manifest-sha256:([0-9a-f]{64})\nbase-checker-sha256:([0-9a-f]{64})\nbase-workflow-sha256:([0-9a-f]{64})\nhead-manifest-sha256:([0-9a-f]{64})\n-->$/u;
}

function roadmapPreparationMarkerPattern() {
  return /^<!-- es2015-roadmap-authority-prepare\nparent:70\ncode:([A-Z][A-Z0-9]*)\nissue:([1-9][0-9]*)\nbase:([0-9a-f]{40})\nbase-manifest-sha256:([0-9a-f]{64})\nrecord-sha256:([0-9a-f]{64})\n-->$/u;
}

function roadmapConsumptionMarkerPattern() {
  return /^<!-- es2015-roadmap-authority-consume\nparent:70\ncode:([A-Z][A-Z0-9]*)\nissue:([1-9][0-9]*)\nprofile:(roadmap-reclassification:[A-Z][A-Z0-9]*)\nbase:([0-9a-f]{40})\nsource-path-sha256:([0-9a-f]{64})\nsource-entry-sha256:(null|[0-9a-f]{64})\nprotected-projection-sha256:([0-9a-f]{64})\n-->$/u;
}

function roadmapMigrationBodyPattern() {
  return /(^|\n)(<!-- es2015-roadmap-authority-migration\nparent:70\nbase:[0-9a-f]{40}\nbase-manifest-sha256:[0-9a-f]{64}\nbase-checker-sha256:[0-9a-f]{64}\nbase-workflow-sha256:[0-9a-f]{64}\nhead-manifest-sha256:[0-9a-f]{64}\n-->)(?=\n|$)/gu;
}

function roadmapPreparationBodyPattern() {
  return /(^|\n)(<!-- es2015-roadmap-authority-prepare\nparent:70\ncode:[A-Z][A-Z0-9]*\nissue:[1-9][0-9]*\nbase:[0-9a-f]{40}\nbase-manifest-sha256:[0-9a-f]{64}\nrecord-sha256:[0-9a-f]{64}\n-->)(?=\n|$)/gu;
}

function roadmapConsumptionBodyPattern() {
  return /(^|\n)(<!-- es2015-roadmap-authority-consume\nparent:70\ncode:[A-Z][A-Z0-9]*\nissue:[1-9][0-9]*\nprofile:roadmap-reclassification:[A-Z][A-Z0-9]*\nbase:[0-9a-f]{40}\nsource-path-sha256:[0-9a-f]{64}\nsource-entry-sha256:(?:null|[0-9a-f]{64})\nprotected-projection-sha256:[0-9a-f]{64}\n-->)(?=\n|$)/gu;
}

/** @param {string} profile @param {string} baseLedgerSha256 */
function provenanceRangeMarker(profile, baseLedgerSha256) {
  return `<!-- es2015-provenance-pr parent:T1 parent-issue:75 profile:${profile} base-ledger-sha256:${baseLedgerSha256} -->`;
}

/**
 * @param {ProvenanceCheckDependencies} deps
 * @param {readonly { status: string, path: string, sourcePath: string | null }[]} changes
 * @param {string} base
 * @param {string} _head
 */
async function provenanceOwnedRange(deps, changes, base, _head) {
  const changedPaths = changes.flatMap((change) =>
    change.sourcePath === null
      ? [change.path]
      : [change.sourcePath, change.path],
  );
  const gateOwnerPaths = new Set(PROVENANCE_RANGE_GATE_OWNER_PATHS);
  if (
    changedPaths.some((path) =>
      pathMatchesOwned(path, gateOwnerPaths, new Set()),
    )
  ) {
    return true;
  }

  const baseManifestText = await deps.readGitFile(base, ES2015_PROVENANCE_FILE);
  const ownedPaths = new Set(gateOwnerPaths);
  if (
    base === FOUNDATION_BOOTSTRAP_COMMIT &&
    baseManifestText !== null &&
    sha256(baseManifestText) === FOUNDATION_BOOTSTRAP_MANIFEST_SHA256
  ) {
    /** @type {ReturnType<typeof parseEs2015ProvenanceManifest>['rangeProfiles'][number]} */
    const bootstrapFoundationProfile = JSON.parse(
      baseManifestText,
    ).rangeProfiles.find(
      (/** @type {{ name: string }} */ profile) =>
        profile.name === 'foundation',
    );
    addRangeProfileOwnership(ownedPaths, bootstrapFoundationProfile);
    addRangeProfileOwnership(ownedPaths, FOUNDATION_BOOTSTRAP_RANGE_PROFILE);
    return changedPaths.some((path) =>
      pathMatchesOwned(path, ownedPaths, new Set()),
    );
  }
  if (baseManifestText === null) {
    return false;
  }
  const manifest = parseRangeManifest(
    baseManifestText,
    'provenance ownership base',
  );
  if (manifest.version === 3) {
    const roadmapOwnedPaths = roadmapOwnedPathsFromBaseManifest(manifest);
    const namespaces = new Set();
    for (const authority of manifest.roadmapAuthorities ?? []) {
      for (const prefix of roadmapGeneratedNamespacePrefixes(authority)) {
        namespaces.add(prefix);
      }
    }
    return changedPaths.some((path) =>
      pathMatchesOwned(path, roadmapOwnedPaths, namespaces),
    );
  }
  for (const profile of manifest.rangeProfiles) {
    if (profile.name === ISSUE_77_MAINTENANCE_PROFILE) continue;
    addRangeProfileOwnership(ownedPaths, profile);
  }
  return changedPaths.some((path) =>
    pathMatchesOwned(path, ownedPaths, new Set()),
  );
}

/**
 * @param {Set<string>} ownedPaths
 * @param {ReturnType<typeof parseEs2015ProvenanceManifest>['rangeProfiles'][number]} profile
 */
function addRangeProfileOwnership(ownedPaths, profile) {
  for (const path of profile.allowedPaths) ownedPaths.add(path);
  for (const path of profile.allowedDeletions) ownedPaths.add(path);
}

/** @param {string} candidate @param {Set<string>} exactPaths @param {Set<string>} namespaces */
function pathMatchesOwned(candidate, exactPaths, namespaces) {
  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {}
  decoded = decoded.replace(/\\/gu, '/');
  if (
    exactPaths.has(decoded) ||
    generatedPathMatchesNamespace(decoded, namespaces)
  ) {
    return true;
  }
  const canonical = canonicalRepositoryPath(candidate);
  return (
    canonical !== null &&
    (exactPaths.has(canonical) ||
      generatedPathMatchesNamespace(canonical, namespaces))
  );
}

/** @param {string} text */
function parseRangeChanges(text) {
  if (text === '') return [];
  if (!text.endsWith('\0')) {
    throw new Es2015ProvenanceCheckError(
      'git diff --name-status output must be NUL-delimited',
    );
  }
  const fields = text.slice(0, -1).split('\0');
  const changes = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (status.startsWith('R') || status.startsWith('C')) {
      const sourcePath = fields[index++];
      const path = fields[index++];
      if (sourcePath === undefined || path === undefined) {
        throw new Es2015ProvenanceCheckError(
          'git diff --name-status output is incomplete',
        );
      }
      changes.push({ status, sourcePath, path });
      continue;
    }
    const path = fields[index++];
    if (path === undefined) {
      throw new Es2015ProvenanceCheckError(
        'git diff --name-status output is incomplete',
      );
    }
    changes.push({ status, sourcePath: null, path });
  }
  return changes;
}

/**
 * @param {ReturnType<typeof parseEs2015ProvenanceManifest>['rangeProfiles'][number]} profile
 * @param {readonly { status: string, path: string, sourcePath: string | null }[]} changes
 */
function validateRangeChanges(profile, changes) {
  if (changes.length === 0) {
    throw new Es2015ProvenanceCheckError(
      `${profile.name} range must not be empty`,
    );
  }
  const allowedPaths = new Set(profile.allowedPaths);
  const allowedDeletions = new Set(profile.allowedDeletions);
  const changed = new Set();
  const deleted = new Set();
  for (const change of changes) {
    if (change.status.startsWith('R')) {
      throw new Es2015ProvenanceCheckError(
        `${profile.name} range forbids rename ${change.sourcePath} -> ${change.path}`,
      );
    }
    if (change.status.startsWith('C')) {
      throw new Es2015ProvenanceCheckError(
        `${profile.name} range forbids copy ${change.sourcePath} -> ${change.path}`,
      );
    }
    if (!['A', 'M', 'D'].includes(change.status)) {
      throw new Es2015ProvenanceCheckError(
        `${profile.name} range has unknown git status ${change.status}`,
      );
    }
    if (changed.has(change.path) || deleted.has(change.path)) {
      throw new Es2015ProvenanceCheckError(
        `${profile.name} range repeats changed path ${change.path}`,
      );
    }
    if (change.status === 'D') {
      if (!allowedDeletions.has(change.path)) {
        throw new Es2015ProvenanceCheckError(
          `${profile.name} range forbids deleted path ${change.path}`,
        );
      }
      deleted.add(change.path);
      continue;
    }
    if (!allowedPaths.has(change.path)) {
      throw new Es2015ProvenanceCheckError(
        `${profile.name} range forbids changed path ${change.path}`,
      );
    }
    changed.add(change.path);
  }
  for (const path of profile.requiredPaths) {
    if (!changed.has(path)) {
      throw new Es2015ProvenanceCheckError(
        `${profile.name} range is missing required changed path ${path}`,
      );
    }
  }
  for (const path of profile.requiredDeletions) {
    if (!deleted.has(path)) {
      throw new Es2015ProvenanceCheckError(
        `${profile.name} range is missing required deletion ${path}`,
      );
    }
  }
}

/**
 * @param {ProvenanceCheckDependencies} deps
 * @param {string} head
 * @param {ReturnType<typeof parseEs2015ProvenanceManifest>} manifest
 * @param {ReturnType<typeof parseEs2015ProvenanceManifest>['rangeProfiles'][number]} profile
 */
async function validateRangeContent(deps, head, manifest, profile) {
  for (const path of profile.emptyDecisionFragments) {
    const code = path.slice(path.lastIndexOf('/') + 1, -'.json'.length);
    const text = await readRequiredGitFile(deps, head, path);
    const fragment = parseEs2015DecisionFragment(text, code);
    if (fragment.decisions.length !== 0 || text !== renderJson(fragment)) {
      throw new Es2015ProvenanceCheckError(
        `${profile.name} range requires an exact empty decision fragment at ${path}`,
      );
    }
  }
  if (profile.decisionFragment !== null) {
    const code = profile.name.slice('decision:'.length);
    const fragments = new Map();
    for (const fragmentCode of ES2015_PROVENANCE_DECISION_CODES) {
      const path = decisionFragmentPath(fragmentCode);
      const text = await readRequiredGitFile(deps, head, path);
      const fragment = parseEs2015DecisionFragment(text, fragmentCode);
      if (text !== renderJson(fragment)) {
        throw new Es2015ProvenanceCheckError(
          `${profile.name} range requires an exact canonical decision fragment at ${path}`,
        );
      }
      fragments.set(fragmentCode, fragment);
    }
    validateDecisionFragments(manifest, fragments, {
      allowPendingReview: false,
      requireCompleteCodes: [code],
    });
  }
}

/** @param {ProvenanceCheckDependencies} deps @param {string} revision @param {string} path */
async function readRequiredGitFile(deps, revision, path) {
  const text = await deps.readGitFile(revision, path);
  if (text === null) {
    throw new Es2015ProvenanceCheckError(
      `${path} is missing from provenance range head ${revision}`,
    );
  }
  return text;
}

/** @param {ProvenanceCheckDependencies} deps @param {string} revision @param {string} label */
async function readRangeManifest(deps, revision, label) {
  const text = await readRequiredGitFile(
    deps,
    revision,
    ES2015_PROVENANCE_FILE,
  );
  return parseRangeManifest(text, label);
}

/** @param {string} text @param {string} label */
function parseRangeManifest(text, label) {
  const manifest = parseEs2015ProvenanceManifest(text);
  if (text !== renderJson(manifest)) {
    throw new Es2015ProvenanceCheckError(
      `${label} provenance manifest is not canonical`,
    );
  }
  validateProvenanceFoundation(manifest);
  return manifest;
}
/** @param {ProvenanceCheckDependencies} deps */
async function initializeFoundation(deps) {
  const { manifestText, fragmentTexts } = await preflightInitialization(deps);
  await deps.writeFile(ES2015_PROVENANCE_FILE, manifestText);
  for (const code of ES2015_PROVENANCE_DECISION_CODES) {
    const text = fragmentTexts.get(code);
    if (text === undefined) {
      throw new Es2015ProvenanceCheckError(
        `Missing generated fragment text for ${code}`,
      );
    }
    await deps.writeFile(decisionFragmentPath(code), text);
  }
}

/** @param {ProvenanceCheckDependencies} deps */
async function preflightInitialization(deps) {
  const foundation = await expectedFoundation(deps);
  await assertInitializableDecisionDirectory(deps);
  await assertInitializableFragments(deps);
  return foundation;
}

/** @param {ProvenanceCheckDependencies} deps @param {string | null} completeCode @param {boolean} allowPendingReview */
async function checkFoundation(deps, completeCode, allowPendingReview) {
  const actualManifestText = await readRequiredFile(
    deps,
    ES2015_PROVENANCE_FILE,
  );
  const manifest = parseEs2015ProvenanceManifest(actualManifestText);
  const canonicalManifestText = renderJson(manifest);
  if (actualManifestText !== canonicalManifestText) {
    throw new Es2015ProvenanceCheckError(
      `${ES2015_PROVENANCE_FILE} does not match generated provenance bytes`,
    );
  }
  validateProvenanceFoundation(
    manifest,
    undefined,
    /** @type {any} */ (
      trustedManifestValidationOptions(deps, manifest.version)
    ),
  );

  await verifyDecisionDirectory(deps);
  const fragments = new Map();
  for (const code of ES2015_PROVENANCE_DECISION_CODES) {
    const path = decisionFragmentPath(code);
    const actualText = await readRequiredFile(deps, path);
    const parsed = parseEs2015DecisionFragment(actualText, code);
    const canonicalText = renderJson(parsed);
    if (actualText !== canonicalText) {
      throw new Es2015ProvenanceCheckError(
        `${path} does not match generated provenance bytes`,
      );
    }
    fragments.set(code, parsed);
  }

  validateDecisionFragments(manifest, fragments, {
    allowPendingReview,
    ...(completeCode === null ? {} : { requireCompleteCodes: [completeCode] }),
  });
}

/**
 * @param {ProvenanceCheckDependencies} deps
 * @param {number} version
 * @returns {{ expectedRoadmapAuthorities?: readonly Record<string, any>[] }}
 */
function trustedManifestValidationOptions(deps, version) {
  if (
    deps.expectedManifestVersion !== undefined &&
    !ES2015_PROVENANCE_MANIFEST_VERSIONS.includes(deps.expectedManifestVersion)
  ) {
    throw new Es2015ProvenanceCheckError(
      `${ES2015_PROVENANCE_FILE} expected manifest version must be ${ES2015_PROVENANCE_MANIFEST_VERSIONS.join(' or ')}`,
    );
  }
  const expectedManifestVersion = deps.expectedManifestVersion ?? version;
  if (version !== expectedManifestVersion) {
    throw new Es2015ProvenanceCheckError(
      `${ES2015_PROVENANCE_FILE} must declare version ${expectedManifestVersion}`,
    );
  }
  if (
    expectedManifestVersion === 3 &&
    Object.prototype.hasOwnProperty.call(deps, 'expectedRoadmapAuthorities')
  ) {
    return {
      expectedRoadmapAuthorities: deps.expectedRoadmapAuthorities,
    };
  }
  return {};
}

/** @param {ProvenanceCheckDependencies} deps */
async function loadReviewedManifest(deps) {
  const actualText = await readRequiredFile(deps, ES2015_PROVENANCE_FILE);
  const manifest = parseEs2015ProvenanceManifest(actualText);
  const canonicalText = renderJson(manifest);
  if (actualText !== canonicalText) {
    throw new Es2015ProvenanceCheckError(
      `${ES2015_PROVENANCE_FILE} does not match generated provenance bytes`,
    );
  }
  validateProvenanceFoundation(manifest);
  return manifest;
}

/** @param {ProvenanceCheckDependencies} deps */
async function expectedFoundation(deps) {
  const classifications = taxonomyClassifications(
    await readRequiredFile(deps, TAXONOMY_FILE),
  );
  const manifestText = renderJson(buildProvenanceFoundation(classifications));
  const manifest = parseEs2015ProvenanceManifest(manifestText);
  validateProvenanceFoundation(manifest, classifications);
  const fragmentTexts = new Map(
    ES2015_PROVENANCE_DECISION_CODES.map((code) => [
      code,
      renderJson({
        version: ES2015_PROVENANCE_VERSION,
        taxonomyBaseline: manifest.taxonomyBaseline,
        repository: manifest.repository,
        revision: manifest.revision,
        specification: manifest.specification,
        parent: manifest.parent,
        code,
        decisions: [],
      }),
    ]),
  );
  const fragments = new Map(
    ES2015_PROVENANCE_DECISION_CODES.map((code) => [
      code,
      parseEs2015DecisionFragment(
        /** @type {string} */ (fragmentTexts.get(code)),
        code,
      ),
    ]),
  );
  validateDecisionFragments(manifest, fragments, { allowPendingReview: false });
  return {
    manifestText,
    fragmentTexts,
  };
}

/** @param {ProvenanceCheckDependencies} deps */
async function assertInitializableDecisionDirectory(deps) {
  /** @type {readonly string[]} */
  let entries;
  try {
    entries = await deps.readdir(PROVENANCE_DECISIONS_DIRECTORY);
  } catch (error) {
    if (/** @type {any} */ (error)?.code === 'ENOENT') {
      throw new Es2015ProvenanceCheckError(
        `${PROVENANCE_DECISIONS_DIRECTORY} is missing`,
      );
    }
    throw error;
  }
  const expected = new Set(
    ES2015_PROVENANCE_DECISION_CODES.map((code) => `${code}.json`),
  );
  for (const name of [...entries].sort()) {
    if (!expected.has(name)) {
      throw new Es2015ProvenanceCheckError(
        `${PROVENANCE_DECISIONS_DIRECTORY}/${name} is not an approved provenance fragment`,
      );
    }
  }
}

/** @param {ProvenanceCheckDependencies} deps */
async function assertInitializableFragments(deps) {
  for (const code of ES2015_PROVENANCE_DECISION_CODES) {
    const path = decisionFragmentPath(code);
    const current = await readOptionalFile(deps, path);
    if (current === null) {
      continue;
    }
    const parsed = parseJson(current, path);
    if (!Array.isArray(parsed.decisions) || parsed.decisions.length > 0) {
      throw new Es2015ProvenanceCheckError(
        `${path} must not overwrite non-empty reviewed decisions`,
      );
    }
  }
}

/** @param {ProvenanceCheckDependencies} deps */
async function verifyDecisionDirectory(deps) {
  /** @type {readonly string[]} */
  let entries;
  try {
    entries = await deps.readdir(PROVENANCE_DECISIONS_DIRECTORY);
  } catch {
    throw new Es2015ProvenanceCheckError(
      `${PROVENANCE_DECISIONS_DIRECTORY} is missing`,
    );
  }
  const expected = new Set(
    ES2015_PROVENANCE_DECISION_CODES.map((code) => `${code}.json`),
  );
  const normalizedEntries = [...entries].sort();
  for (const name of normalizedEntries) {
    if (!expected.has(name)) {
      throw new Es2015ProvenanceCheckError(
        `${PROVENANCE_DECISIONS_DIRECTORY}/${name} is not an approved provenance fragment`,
      );
    }
  }
  for (const code of ES2015_PROVENANCE_DECISION_CODES) {
    const name = `${code}.json`;
    if (!normalizedEntries.includes(name)) {
      throw new Es2015ProvenanceCheckError(
        `${PROVENANCE_DECISIONS_DIRECTORY}/${name} is missing`,
      );
    }
  }
}

/** @param {Record<string, string | undefined>} environment */
function assertUtc(environment) {
  if (environment.TZ !== 'UTC') {
    throw new Es2015ProvenanceCheckError(
      `The ES2015 provenance foundation must be generated under UTC, but TZ is ${environment.TZ ?? 'unset'}`,
    );
  }
}

/** @param {string} code */
function assertDecisionCode(code) {
  if (!ES2015_PROVENANCE_DECISION_CODES.includes(code)) {
    throw new Es2015ProvenanceCheckError(
      `${code} is not an approved ES2015 provenance decision code`,
    );
  }
}

/** @param {string} code */
function decisionFragmentPath(code) {
  return `${PROVENANCE_DECISIONS_DIRECTORY}/${code}.json`;
}

/** @param {string} text @returns {readonly { path: string, variants: number, partition: string, finalClass: string }[]} */
function taxonomyClassifications(text) {
  const taxonomy = parseJson(text, TAXONOMY_FILE);
  if (!Array.isArray(taxonomy.classifications)) {
    throw new Es2015ProvenanceCheckError(
      `${TAXONOMY_FILE} must contain classifications`,
    );
  }
  return taxonomy.classifications.map((record) => {
    if (
      typeof record !== 'object' ||
      record === null ||
      Array.isArray(record)
    ) {
      throw new Es2015ProvenanceCheckError(
        `${TAXONOMY_FILE} classifications must be objects`,
      );
    }
    const candidate = /** @type {Record<string, unknown>} */ (record);
    if (
      typeof candidate.path !== 'string' ||
      !Number.isInteger(candidate.variants) ||
      typeof candidate.partition !== 'string' ||
      typeof candidate.status !== 'string'
    ) {
      throw new Es2015ProvenanceCheckError(
        `${TAXONOMY_FILE} classifications are missing required provenance fields`,
      );
    }
    return {
      path: candidate.path,
      variants: /** @type {number} */ (candidate.variants),
      partition: candidate.partition,
      finalClass: /** @type {string} */ (candidate.status),
    };
  });
}

/** @param {string} text @param {string} label */
function parseJson(text, label) {
  if (typeof text !== 'string') {
    throw new Es2015ProvenanceCheckError(`${label} must be JSON text`);
  }
  try {
    const value = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Es2015ProvenanceCheckError(`${label} must be a JSON object`);
    }
    return /** @type {Record<string, unknown>} */ (value);
  } catch (error) {
    if (error instanceof Es2015ProvenanceCheckError) {
      throw error;
    }
    throw new Es2015ProvenanceCheckError(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** @param {unknown} value */
function renderJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** @param {ProvenanceCheckDependencies} deps @param {string} path */
async function readRequiredFile(deps, path) {
  try {
    return await deps.readFile(path);
  } catch (error) {
    if (/** @type {any} */ (error)?.code === 'ENOENT') {
      throw new Es2015ProvenanceCheckError(`${path} is missing`);
    }
    if (error instanceof Es2015ProvenanceError) {
      throw new Es2015ProvenanceCheckError(error.message);
    }
    throw error;
  }
}

/** @param {ProvenanceCheckDependencies} deps @param {string} path */
async function readOptionalFile(deps, path) {
  try {
    return await deps.readFile(path);
  } catch (error) {
    if (/** @type {any} */ (error)?.code === 'ENOENT') {
      return null;
    }
    if (error instanceof Es2015ProvenanceError) {
      throw new Es2015ProvenanceCheckError(error.message);
    }
    throw error;
  }
}

/** @param {string} path @param {URL} repositoryRootUrl */
function resolvePath(path, repositoryRootUrl) {
  return path.startsWith('/') ? path : new URL(path, repositoryRootUrl);
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
