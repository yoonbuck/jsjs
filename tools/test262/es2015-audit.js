/**
 * Node boundary for the checked-in ES2015 Test262 taxonomy.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
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
export const ES2015_AUDIT_EVIDENCE_FILE =
  'tools/test262/es2015-audit-evidence.json';
export const ES2015_AUDIT_EVIDENCE_VERSION = 1;
export const ES2015_AUDIT_VERSION = 2;

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const SUBSET_FILE = 'tools/test262/upstream-subset.json';
const FEATURES_FILE = 'tools/test262/features.json';
const REPORT_FILE = 'docs/test262-report.jsonl';
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
const EXECUTION_STATUSES = new Set(['passed', 'failed', 'skipped']);

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
  ] = await Promise.all([
    deps.readFile(ES2015_POLICY_FILE),
    deps.readFile(ES2015_ANCHORS_FILE),
    deps.readFile(SUBSET_FILE),
    deps.readFile(FEATURES_FILE),
    deps.readFile(REPORT_FILE),
    deps.readFile(ES2015_AUDIT_EVIDENCE_FILE),
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
  const evidence = parseAuditEvidence(auditEvidenceText, pin);
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
    auditEvidenceText,
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
  return {
    environment: options.environment ?? process.env,
    readPin,
    readFile: /** @type {(path: string) => Promise<string>} */ (
      readRepositoryFile
    ),
    writeFile: (path, text) =>
      writeFile(new URL(path, repositoryRootUrl), text, 'utf8'),
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
    stderr: options.stderr ?? ((text) => process.stderr.write(text)),
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
