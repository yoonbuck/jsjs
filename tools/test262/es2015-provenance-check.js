import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  ES2015_PROVENANCE_DECISION_CODES,
  ES2015_PROVENANCE_FILE,
  ES2015_PROVENANCE_VERSION,
  Es2015ProvenanceError,
  buildProvenanceFoundation,
  parseEs2015DecisionFragment,
  parseEs2015ProvenanceManifest,
  renderBatchLedger,
  renderProvenanceIssueBody,
  validateDecisionFragments,
  validateProvenanceFoundation,
} from './es2015-provenance.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const TAXONOMY_FILE = 'tools/test262/es2015-taxonomy.json';
const PROVENANCE_DECISIONS_DIRECTORY =
  'tools/test262/es2015-provenance-decisions';
const PROVENANCE_RANGE_GATE_OWNER_PATHS = Object.freeze([
  '.github/workflows/ci.yml',
  'tools/ci/pipeline.js',
  'tools/test262/es2015-provenance-check.js',
  'tools/test262/es2015-provenance.js',
  ES2015_PROVENANCE_FILE,
]);
const FOUNDATION_BOOTSTRAP_COMMIT = '8d75b48af2ee7ab04e7c5006980417227ec34568';
const FOUNDATION_BOOTSTRAP_MANIFEST_SHA256 =
  'ad3e55a061f1156fc267655ac8cb977f6a54f934cc56a5efa5689c7fc620ae04';
const FOUNDATION_MAINTENANCE_PROFILE = 'foundation-maintenance';
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

export class Es2015ProvenanceCheckError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'Es2015ProvenanceCheckError';
  }
}

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
 *   stdout: (text: string) => void,
 *   stderr: (text: string) => void,
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

/** @param {{ repositoryRootUrl?: URL, environment?: Record<string, string | undefined>, stdout?: (text: string) => void, stderr?: (text: string) => void }} [options] */
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
    stdout: options.stdout ?? ((text) => process.stdout.write(text)),
    stderr: options.stderr ?? ((text) => process.stderr.write(text)),
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
    const parsed = parseProvenanceRangeMarker(
      /** @type {string} */ (options.rangeMarker),
    );
    if (parsed.profile !== options.rangeProfile) {
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
  if (deps.environment.GITHUB_EVENT_NAME !== 'pull_request') {
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
  const markerLines = body
    .split(/\r?\n/u)
    .filter((line) => line.includes('es2015-provenance-pr'));
  if (markerLines.length === 0) {
    if (await provenanceOwnedRange(deps, changes, base, head)) {
      throw new Es2015ProvenanceCheckError(
        'A provenance-owned PR range requires one authoritative provenance marker',
      );
    }
    return null;
  }
  if (markerLines.length !== 1) {
    throw new Es2015ProvenanceCheckError(
      'PR body must contain exactly one authoritative provenance marker',
    );
  }
  return parseProvenanceRangeMarker(markerLines[0]);
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

/** @param {string} profile @param {string} baseLedgerSha256 */
function provenanceRangeMarker(profile, baseLedgerSha256) {
  return `<!-- es2015-provenance-pr parent:T1 parent-issue:75 profile:${profile} base-ledger-sha256:${baseLedgerSha256} -->`;
}

/**
 * @param {ProvenanceCheckDependencies} deps
 * @param {readonly { status: string, path: string, sourcePath: string | null }[]} changes
 * @param {string} base
 * @param {string} head
 */
async function provenanceOwnedRange(deps, changes, base, head) {
  const changedPaths = changes.flatMap((change) =>
    change.sourcePath === null
      ? [change.path]
      : [change.sourcePath, change.path],
  );
  const gateOwnerPaths = new Set(PROVENANCE_RANGE_GATE_OWNER_PATHS);
  if (changedPaths.some((path) => gateOwnerPaths.has(path))) return true;

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
    return changedPaths.some((path) => ownedPaths.has(path));
  }
  const manifestText =
    baseManifestText ?? (await deps.readGitFile(head, ES2015_PROVENANCE_FILE));
  if (manifestText === null) return false;
  const manifest = parseRangeManifest(
    manifestText,
    baseManifestText === null
      ? 'provenance ownership head'
      : 'provenance ownership base',
  );
  for (const profile of manifest.rangeProfiles) {
    addRangeProfileOwnership(ownedPaths, profile);
  }
  return changedPaths.some((path) => ownedPaths.has(path));
}

/**
 * @param {Set<string>} ownedPaths
 * @param {ReturnType<typeof parseEs2015ProvenanceManifest>['rangeProfiles'][number]} profile
 */
function addRangeProfileOwnership(ownedPaths, profile) {
  for (const path of profile.allowedPaths) ownedPaths.add(path);
  for (const path of profile.allowedDeletions) ownedPaths.add(path);
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
  validateProvenanceFoundation(manifest);

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
