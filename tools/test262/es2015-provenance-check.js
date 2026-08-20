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
const PROVENANCE_DECISIONS_DIRECTORY = 'tools/test262/es2015-provenance-decisions';
const PRIMARY_OPTION_LABEL =
  'Exactly one of --initialize, --check, --render-ledger=CODE, or --render-issue=CODE is required';
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
    const deps = { ...createProvenanceCheckDependencies(dependencies), ...dependencies };
    assertUtc(deps.environment);
    const mode = resolvePrimaryMode(options);

    switch (mode.kind) {
      case 'initialize':
        await initializeFoundation(deps);
        return 0;
      case 'check':
        await checkFoundation(deps, options.completeCode);
        return 0;
      case 'render-ledger': {
        const manifest = await loadReviewedManifest(deps);
        deps.stdout(renderBatchLedger(manifest, mode.code));
        return 0;
      }
      case 'render-issue': {
        const manifest = await loadReviewedManifest(deps);
        if (options.issueMapPath === null) {
          throw new Es2015ProvenanceCheckError(
            '--issue-map=PATH is required with --render-issue=CODE',
          );
        }
        const issueMap = parseJson(
          await readRequiredFile(deps, options.issueMapPath),
          options.issueMapPath,
        );
        deps.stdout(renderProvenanceIssueBody(manifest, mode.code, issueMap));
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
  return {
    environment: options.environment ?? process.env,
    readFile: (path) => readFile(resolvePath(path, repositoryRootUrl), 'utf8'),
    readdir: (path) => readdir(resolvePath(path, repositoryRootUrl)),
    writeFile: (path, text) =>
      writeFile(resolvePath(path, repositoryRootUrl), text, 'utf8'),
    stdout: options.stdout ?? ((text) => process.stdout.write(text)),
    stderr: options.stderr ?? ((text) => process.stderr.write(text)),
  };
}

/** @param {readonly string[]} argv */
function scanOptions(argv) {
  let initialize = false;
  let check = false;
  /** @type {string | null} */
  let renderLedgerCode = null;
  /** @type {string | null} */
  let renderIssueCode = null;
  /** @type {string | null} */
  let completeCode = null;
  /** @type {string | null} */
  let issueMapPath = null;

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
    if (argument.startsWith('--render-ledger=')) {
      if (renderLedgerCode !== null) {
        throw new Es2015ProvenanceCheckError(
          'The --render-ledger=CODE option must not be repeated',
        );
      }
      const code = argument.slice('--render-ledger='.length);
      if (code === '') {
        throw new Es2015ProvenanceCheckError('--render-ledger=CODE requires a code');
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
        throw new Es2015ProvenanceCheckError('--render-issue=CODE requires a code');
      }
      if (!ISSUE_RENDER_CODES.includes(code)) {
        throw new Es2015ProvenanceCheckError(`${code} is not a known provenance issue code`);
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
        throw new Es2015ProvenanceCheckError('--issue-map=PATH requires a path');
      }
      issueMapPath = path;
      continue;
    }
    throw new Es2015ProvenanceCheckError(`Unknown option ${argument}`);
  }

  return {
    initialize,
    check,
    renderLedgerCode,
    renderIssueCode,
    completeCode,
    issueMapPath,
  };
}

/** @param {{ initialize: boolean, check: boolean, renderLedgerCode: string | null, renderIssueCode: string | null, completeCode: string | null, issueMapPath: string | null }} options */
function resolvePrimaryMode(options) {
  const primaryModes = [
    options.initialize,
    options.check,
    options.renderLedgerCode !== null,
    options.renderIssueCode !== null,
  ].filter(Boolean).length;
  if (primaryModes !== 1) {
    throw new Es2015ProvenanceCheckError(PRIMARY_OPTION_LABEL);
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

/** @param {ProvenanceCheckDependencies} deps */
async function initializeFoundation(deps) {
  const { manifestText, fragmentTexts } = await expectedFoundation(deps);
  await assertInitializableFragments(deps);
  await deps.writeFile(ES2015_PROVENANCE_FILE, manifestText);
  for (const code of ES2015_PROVENANCE_DECISION_CODES) {
    await deps.writeFile(decisionFragmentPath(code), fragmentTexts.get(code));
  }
}

/** @param {ProvenanceCheckDependencies} deps @param {string | null} completeCode */
async function checkFoundation(deps, completeCode) {
  const classifications = taxonomyClassifications(await readRequiredFile(deps, TAXONOMY_FILE));
  const expectedManifest = buildProvenanceFoundation(classifications);
  const expectedManifestText = renderJson(expectedManifest);
  const actualManifestText = await readRequiredFile(deps, ES2015_PROVENANCE_FILE);
  if (actualManifestText !== expectedManifestText) {
    throw new Es2015ProvenanceCheckError(
      `${ES2015_PROVENANCE_FILE} does not match generated provenance bytes`,
    );
  }
  const manifest = parseEs2015ProvenanceManifest(actualManifestText);
  validateProvenanceFoundation(manifest, classifications);

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
    allowPendingReview: false,
    ...(completeCode === null ? {} : { requireCompleteCodes: [completeCode] }),
  });
}

/** @param {ProvenanceCheckDependencies} deps */
async function loadReviewedManifest(deps) {
  const classifications = taxonomyClassifications(await readRequiredFile(deps, TAXONOMY_FILE));
  const expectedManifest = buildProvenanceFoundation(classifications);
  const expectedText = renderJson(expectedManifest);
  const actualText = await readRequiredFile(deps, ES2015_PROVENANCE_FILE);
  if (actualText !== expectedText) {
    throw new Es2015ProvenanceCheckError(
      `${ES2015_PROVENANCE_FILE} does not match generated provenance bytes`,
    );
  }
  const manifest = parseEs2015ProvenanceManifest(actualText);
  validateProvenanceFoundation(manifest, classifications);
  return manifest;
}

/** @param {ProvenanceCheckDependencies} deps */
async function expectedFoundation(deps) {
  const classifications = taxonomyClassifications(await readRequiredFile(deps, TAXONOMY_FILE));
  const manifest = buildProvenanceFoundation(classifications);
  const fragmentTexts = new Map(
    ES2015_PROVENANCE_DECISION_CODES.map((code) => [
      code,
      renderJson({
        version: ES2015_PROVENANCE_VERSION,
        repository: manifest.repository,
        revision: manifest.revision,
        specification: manifest.specification,
        parent: manifest.parent,
        code,
        decisions: [],
      }),
    ]),
  );
  return {
    manifestText: renderJson(manifest),
    fragmentTexts,
  };
}

/** @param {ProvenanceCheckDependencies} deps */
async function assertInitializableFragments(deps) {
  for (const code of ES2015_PROVENANCE_DECISION_CODES) {
    const path = decisionFragmentPath(code);
    const current = await readOptionalFile(deps, path);
    if (current === null) {
      continue;
    }
    const parsed = parseEs2015DecisionFragment(current, code);
    if (parsed.decisions.length > 0) {
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

/** @param {string} text */
function taxonomyClassifications(text) {
  const taxonomy = parseJson(text, TAXONOMY_FILE);
  if (!Array.isArray(taxonomy.classifications)) {
    throw new Es2015ProvenanceCheckError(
      `${TAXONOMY_FILE} must contain classifications`,
    );
  }
  return taxonomy.classifications.map((record) => {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) {
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
      variants: candidate.variants,
      partition: candidate.partition,
      finalClass: candidate.status,
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
