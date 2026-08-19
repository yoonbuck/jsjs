/**
 * Node boundary for the checked-in ES2015 Test262 taxonomy.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createNodeTest262Host } from './adapters/node.js';
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
import { parseFeatureManifest } from './features.js';
import { assertPinnedCheckout, readTest262Pin } from './pin.js';
import { sortStrings } from './selection.js';
import { parseUpstreamSubset, upstreamSubsetPaths } from './upstream.js';

export const ES2015_TAXONOMY_ARTIFACT = 'tools/test262/es2015-taxonomy.json';
export const ES2015_AUDIT_VERSION = 1;

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const SUBSET_FILE = 'tools/test262/upstream-subset.json';
const FEATURES_FILE = 'tools/test262/features.json';
const REPORT_FILE = 'docs/test262-report.jsonl';

/**
 * @typedef {{
 *   environment: Record<string, string | undefined>,
 *   readPin: () => Promise<any>,
 *   readFile: (path: string) => Promise<string>,
 *   writeFile: (path: string, text: string) => Promise<void>,
 *   assertPinnedCheckout: (pin: any) => Promise<void>,
 *   listRoots: () => Promise<readonly string[]>,
 *   readRoot: (path: string) => Promise<string>,
 *   readIncludeDefinitions: () => Promise<Map<string, unknown>>,
 *   readAuditEvidence: () => Promise<{
 *     records: readonly any[],
 *     blockers: Record<string, string>,
 *     intentionalDeviations: readonly string[],
 *   }>,
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
  const check = parseOptions(argv);
  const deps = { ...defaultDependencies(), ...dependencies };
  assertUtc(deps.environment);

  const pin = await deps.readPin();
  await deps.assertPinnedCheckout(pin);

  const [policyText, anchorsText, subsetText, featuresText, reportText] =
    await Promise.all([
      deps.readFile(ES2015_POLICY_FILE),
      deps.readFile(ES2015_ANCHORS_FILE),
      deps.readFile(SUBSET_FILE),
      deps.readFile(FEATURES_FILE),
      deps.readFile(REPORT_FILE),
    ]);
  const policy = parseEs2015Policy(policyText);
  const anchors = parseEs2015Anchors(anchorsText);
  assertPolicyPin(policy, pin);
  const subset = parseUpstreamSubset(subsetText);
  assertSubsetPin(subset, pin);
  parseFeatureManifest(featuresText);

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
  const selectedResults = recordsByPath(
    parseReportRecords(reportText).filter((record) =>
      selectedPaths.includes(record.file),
    ),
    'selected execution evidence',
  );
  const evidence = await deps.readAuditEvidence();
  const auditResults = recordsByPath(
    evidence.records,
    'audit execution evidence',
  );
  const classifications = classifyEs2015Inventory({
    policy,
    anchors,
    inventory,
    selected: new Set(selectedPaths),
    selectedResults,
    auditResults,
    blockers: evidence.blockers,
    intentionalDeviations: evidence.intentionalDeviations,
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
    evidence,
    classifications,
  });
  validateArtifact(artifact);
  const output = `${JSON.stringify(artifact, null, 2)}\n`;

  /** @type {string | null} */
  let current = null;
  try {
    current = await deps.readFile(ES2015_TAXONOMY_ARTIFACT);
  } catch {
    // A missing artifact is stale in check mode and created in write mode.
  }

  if (check) {
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

/** @returns {AuditDependencies} */
function defaultDependencies() {
  const readRepositoryFile = (/** @type {string} */ path) =>
    readFile(new URL(path, REPOSITORY_ROOT_URL), 'utf8');
  return {
    environment: process.env,
    readPin: readTest262Pin,
    readFile: /** @type {(path: string) => Promise<string>} */ (
      readRepositoryFile
    ),
    writeFile: (path, text) =>
      writeFile(new URL(path, REPOSITORY_ROOT_URL), text, 'utf8'),
    assertPinnedCheckout,
    listRoots: async () => {
      const pin = await readTest262Pin();
      const listTests = createNodeTest262Host({
        root: pin.checkoutPath,
      }).listTests;
      if (listTests === undefined) {
        throw new Es2015AuditError('the Node Test262 host cannot list roots');
      }
      return listTests();
    },
    readRoot: async (path) => {
      const pin = await readTest262Pin();
      return createNodeTest262Host({ root: pin.checkoutPath }).readTest(path);
    },
    readIncludeDefinitions: async () => {
      const pin = await readTest262Pin();
      return readHarnessDefinitions(pin.checkoutPath);
    },
    readAuditEvidence: readEmbeddedAuditEvidence,
    stderr: (text) => process.stderr.write(text),
  };
}

/** @param {readonly string[]} argv */
function parseOptions(argv) {
  if (argv.length === 0) {
    return false;
  }
  if (argv.length === 1 && argv[0] === '--check') {
    return true;
  }
  throw new Es2015AuditError(`Unknown audit option: ${argv.join(' ')}`);
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
      !['passed', 'failed', 'skipped'].includes(record.status)
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
 * Reads every harness name so a declared include without feature dependencies is
 * still explicit; `features.yml` attaches the small reviewed feature subset.
 *
 * @param {string} checkoutPath
 */
async function readHarnessDefinitions(checkoutPath) {
  const root = new URL(
    `${checkoutPath.replace(/\/$/u, '')}/harness/`,
    REPOSITORY_ROOT_URL,
  );
  const definitions = new Map();
  for (const name of await listFiles(root)) {
    definitions.set(name, { features: [] });
    if (name.endsWith('.js')) {
      definitions.set(name.slice(0, -'.js'.length), { features: [] });
    }
  }
  const text = await readFile(new URL('features.yml', root), 'utf8');
  for (const line of text.split(/\r?\n/u)) {
    const match = /^([^:#][^:]*):\s*\[([^\]]*)\]\s*$/u.exec(line);
    if (match === null) {
      if (line.trim() !== '' && !line.trimStart().startsWith('#')) {
        throw new Es2015AuditError(
          'vendor/test262/harness/features.yml must use reviewed name-to-feature lists',
        );
      }
      continue;
    }
    const name = match[1].trim();
    if (!definitions.has(name)) {
      throw new Es2015AuditError(
        `vendor/test262/harness/features.yml names missing include ${name}`,
      );
    }
    definitions.set(name, {
      features: match[2]
        .split(',')
        .map((feature) => feature.trim())
        .filter((feature) => feature !== ''),
    });
  }
  return definitions;
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

async function readEmbeddedAuditEvidence() {
  let parsed;
  try {
    parsed = JSON.parse(
      await readFile(
        new URL(ES2015_TAXONOMY_ARTIFACT, REPOSITORY_ROOT_URL),
        'utf8',
      ),
    );
  } catch (error) {
    throw new Es2015AuditError(
      `${ES2015_TAXONOMY_ARTIFACT} must exist to supply reviewed audit evidence: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const evidence = parsed?.evidence;
  if (
    typeof evidence !== 'object' ||
    evidence === null ||
    !Array.isArray(evidence.auditRecords) ||
    !Array.isArray(evidence.intentionalDeviations) ||
    typeof evidence.blockers !== 'object' ||
    evidence.blockers === null
  ) {
    throw new Es2015AuditError(
      `${ES2015_TAXONOMY_ARTIFACT} has no valid embedded audit evidence`,
    );
  }
  return {
    records: evidence.auditRecords,
    blockers: evidence.blockers,
    intentionalDeviations: evidence.intentionalDeviations,
  };
}

/**
 * @param {{
 *   pin: any, policy: any, anchors: any, policyText: string, anchorsText: string,
 *   subsetText: string, featuresText: string, reportText: string,
 *   evidence: { records: readonly any[], blockers: object, intentionalDeviations: readonly string[] },
 *   classifications: readonly any[],
 * }} options
 */
function buildArtifact(options) {
  const summary = summarizeEs2015Classification(options.classifications);
  const auditRecords = normalizeRecords(options.evidence.records);
  const blockers = normalizeBlockers(options.evidence.blockers);
  const intentionalDeviations = sortedUniqueStrings(
    options.evidence.intentionalDeviations,
    'intentional deviations',
  );
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
      auditEvidenceSha256: sha256(JSON.stringify(auditRecords)),
    },
    evidence: {
      auditRecords,
      blockers,
      intentionalDeviations,
    },
    summary,
    statusTables: statusTables(options.classifications),
    classifications: options.classifications,
  };
}

/** @param {readonly any[]} records */
function normalizeRecords(records) {
  const normalized = records.map((record) => ({
    type: record?.type,
    file: record?.file,
    variant: record?.variant,
    status: record?.status,
  }));
  normalized.sort((left, right) =>
    `${left.file}\u0000${left.variant}` < `${right.file}\u0000${right.variant}`
      ? -1
      : `${left.file}\u0000${left.variant}` >
          `${right.file}\u0000${right.variant}`
        ? 1
        : 0,
  );
  return normalized;
}

/** @param {unknown} blockers */
function normalizeBlockers(blockers) {
  if (
    typeof blockers !== 'object' ||
    blockers === null ||
    Array.isArray(blockers)
  ) {
    throw new Es2015AuditError('audit blocker evidence must be an object');
  }
  /** @type {Record<string, string>} */
  const result = {};
  for (const path of sortStrings(Object.keys(blockers))) {
    const blocker = /** @type {Record<string, unknown>} */ (blockers)[path];
    if (typeof blocker !== 'string' || blocker === '') {
      throw new Es2015AuditError(
        `audit blocker evidence for ${path} is invalid`,
      );
    }
    result[path] = blocker;
  }
  return result;
}

/** @param {unknown} values @param {string} name */
function sortedUniqueStrings(values, name) {
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== 'string')
  ) {
    throw new Es2015AuditError(`${name} must be an array of strings`);
  }
  const sorted = sortStrings(values);
  if (new Set(sorted).size !== sorted.length) {
    throw new Es2015AuditError(`${name} must not repeat roots`);
  }
  return sorted;
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
