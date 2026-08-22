import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNodeTest262Host } from './adapters/node.js';
import { createJsjsTest262Engine } from './engine.js';
import { assertPinnedCheckout, readTest262Pin } from './pin.js';
import {
  mergePromotionSubset,
  parseEs2015Promotion,
} from './es2015-promotion.js';
import { serializeUpstreamSubset } from './es5-selection.js';
import { summarizeEs2015Classification } from './es2015-taxonomy.js';
import { runTest262Suite } from './runner.js';
import { parseUpstreamSubset } from './upstream.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const TAXONOMY_FILE = 'tools/test262/es2015-taxonomy.json';
export const M0_PROMOTION_GROUP = 'es2015/m0-object-internal-methods';
/** @type {Readonly<Record<number, string>>} */
const M0_BLOCKER_BY_ISSUE = Object.freeze({
  80: 'proxy-and-reflect-metaobject',
  81: 'proxy-and-reflect-metaobject',
  82: 'symbol-protocol-dispatch',
  83: 'keyed-collections',
  87: 'binary-data-and-typed-arrays',
  91: 'regexp-unicode-and-sticky',
  93: 'remaining-standard-library-additions',
  95: 'remaining-standard-library-additions',
  96: 'remaining-language-runtime-semantics',
});

/**
 * @typedef {{
 *   path: string,
 *   variants: number,
 *   partition: string,
 *   status: string,
 *   blocker: string | null,
 *   features: readonly string[],
 *   provenance: readonly string[],
 * }} M0Classification
 * @typedef {{
 *   type: string,
 *   file: string,
 *   variant: string | null,
 *   status: 'passed' | 'failed' | 'skipped',
 *   reason?: string,
 *   message?: string,
 * }} M0ExecutionRecord
 * @typedef {{
 *   version: number,
 *   ledger: { roots: number, variants: number, sha256: string },
 *   records: readonly M0ExecutionRecord[],
 * }} M0Execution
 * @typedef {{
 *   path: string,
 *   status: string,
 *   blocker: string | null,
 *   issue: number,
 * }} M0Destination
 */

export const M0 = Object.freeze({
  roots: 240,
  variants: 459,
  sha256: '4ef97681d7e5208a3ec04e2f4281908877f5f61dd42ee20c0f282ac4dc205309',
});

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function parseM0Ledger(text) {
  const paths = text.endsWith('\n')
    ? text.slice(0, -1).split('\n')
    : text.split('\n');
  if (
    paths.length === 0 ||
    paths.some((path) => !/^test\/.+\.js$/u.test(path)) ||
    paths.join('\u0000') !== [...paths].sort().join('\u0000') ||
    new Set(paths).size !== paths.length
  ) {
    throw new Error('M0 ledger must contain sorted unique Test262 roots');
  }
  return paths;
}

/**
 * @param {string} text
 * @param {{ classifications?: readonly M0Classification[] }} taxonomy
 * @returns {string[]}
 */
export function verifyM0Ledger(text, taxonomy) {
  const paths = parseM0Ledger(text);
  if (
    paths.length !== M0.roots ||
    sha256(text) !== M0.sha256 ||
    !Array.isArray(taxonomy?.classifications)
  ) {
    throw new Error('M0 ledger does not match the reviewed 240-root SHA-256');
  }

  const classifications = new Map(
    taxonomy.classifications.map((entry) => [entry.path, entry]),
  );
  let variants = 0;
  for (const path of paths) {
    const entry = classifications.get(path);
    if (
      entry?.partition !== 'core' ||
      entry.status !== 'blocked:proxy-and-reflect-metaobject' ||
      entry.blocker !== 'proxy-and-reflect-metaobject'
    ) {
      throw new Error(`M0 BASE classification mismatch: ${path}`);
    }
    variants += entry.variants;
  }
  if (variants !== M0.variants) {
    throw new Error('M0 taxonomy variants do not match the reviewed ledger');
  }
  return paths;
}

/**
 * @param {{
 *   environment?: Record<string, string | undefined>,
 *   ledgerText?: string,
 *   taxonomy?: any,
 *   pin?: { repository: string, revision: string },
 *   host?: import('./runner.js').Test262Host,
 *   engine?: import('./runner.js').Test262Engine,
 * }} options
 */
export async function runM0Focused(options) {
  const environment = options?.environment ?? process.env;
  if (environment.TZ !== 'UTC') {
    throw new Error('Focused M0 Test262 execution requires TZ=UTC');
  }
  const taxonomy =
    /** @type {{ pin: { repository: string, revision: string }, classifications: readonly M0Classification[] } | undefined} */ (
      options?.taxonomy
    );
  const pin = options?.pin;
  if (
    taxonomy === undefined ||
    pin === undefined ||
    taxonomy.pin.repository !== pin.repository ||
    taxonomy.pin.revision !== pin.revision
  ) {
    throw new Error('M0 taxonomy does not match the pinned Test262 checkout');
  }
  if (options?.host === undefined || options?.engine === undefined) {
    throw new Error('Focused M0 execution requires a Test262 host and engine');
  }

  const paths = verifyM0Ledger(options.ledgerText ?? '', taxonomy);
  const byPath = new Map(
    taxonomy.classifications.map((entry) => [entry.path, entry]),
  );
  const { records } = await runTest262Suite({
    engine: options.engine,
    host: options.host,
    paths,
    supportedFeaturesForPath(file, metadata) {
      const entry = byPath.get(file);
      const metadataFeatures = [...metadata.features].sort();
      if (
        entry === undefined ||
        JSON.stringify(metadataFeatures) !==
          JSON.stringify([...entry.features].sort())
      ) {
        throw new Error(`M0 metadata feature drift: ${file}`);
      }
      return metadataFeatures;
    },
  });

  const counts = new Map();
  const keys = new Set();
  for (const record of records) {
    if (!byPath.has(record.file)) {
      throw new Error(`M0 execution returned a foreign root: ${record.file}`);
    }
    const key = `${record.file}\u0000${record.variant ?? ''}`;
    if (keys.has(key)) {
      throw new Error(`M0 execution repeated a variant: ${record.file}`);
    }
    keys.add(key);
    counts.set(record.file, (counts.get(record.file) ?? 0) + 1);
  }
  for (const path of paths) {
    const entry = byPath.get(path);
    if (entry === undefined || counts.get(path) !== entry.variants) {
      throw new Error(`M0 execution lacks exact variants: ${path}`);
    }
  }
  if (records.length !== M0.variants) {
    throw new Error('M0 execution does not cover all 459 reviewed variants');
  }

  return {
    version: 1,
    ledger: {
      roots: M0.roots,
      variants: M0.variants,
      sha256: M0.sha256,
    },
    records,
  };
}

/**
 * @param {{
 *   ledgerText: string,
 *   taxonomyText: string,
 *   execution: any,
 *   disposition: any,
 * }} options
 */
export function buildM0AuthorityEvidence(options) {
  const taxonomy =
    /** @type {{ pin: { repository: string, revision: string }, classifications: readonly M0Classification[] }} */ (
      JSON.parse(options.taxonomyText)
    );
  const paths = verifyM0Ledger(options.ledgerText, taxonomy);
  const byPath = new Map(
    taxonomy.classifications.map((entry) => [entry.path, entry]),
  );
  const baseline = paths.map(
    (path) => /** @type {M0Classification} */ (byPath.get(path)),
  );
  const destinations = parseM0Destinations(options.disposition, paths);
  const executionByPath = validateM0Execution(options.execution, baseline);
  /** @type {string[]} */
  const promoted = [];
  for (const destination of destinations) {
    const records = /** @type {readonly M0ExecutionRecord[]} */ (
      executionByPath.get(destination.path)
    );
    const passed = records.every((record) => record.status === 'passed');
    if (passed !== (destination.status === 'selected-passing')) {
      throw new Error(
        `M0 disposition does not match execution: ${destination.path}`,
      );
    }
    if (passed) promoted.push(destination.path);
  }

  const promotedSet = new Set(promoted);
  const ownerDeltas = destinations.filter(
    (/** @type {M0Destination} */ destination) =>
      !promotedSet.has(destination.path),
  );
  const ownerMap = uniqueM0Destinations(
    ownerDeltas.map(
      (/** @type {M0Destination} */ { status, blocker, issue }) => ({
        status: status.startsWith('blocked:') ? 'blocked' : status,
        blocker,
        issue,
      }),
    ),
  );
  const entries = promoted.map((path) => {
    const entry = /** @type {M0Classification} */ (byPath.get(path));
    return {
      path,
      variants: entry.variants,
      features: [...entry.features],
      includeFeatures: entry.provenance
        .filter((/** @type {string} */ value) =>
          value.startsWith('include-feature:'),
        )
        .map((/** @type {string} */ value) =>
          value.slice('include-feature:'.length),
        )
        .sort(),
    };
  });
  const promotionPathsText =
    promoted.length === 0 ? '' : `${promoted.join('\n')}\n`;
  const promotion = {
    groupName: M0_PROMOTION_GROUP,
    version: 2,
    repository: taxonomy.pin.repository,
    revision: taxonomy.pin.revision,
    sourceTaxonomySha256: sha256(options.taxonomyText),
    ledgerSha256: sha256(promotionPathsText),
    rootCount: entries.length,
    variantCount: entries.reduce((total, entry) => total + entry.variants, 0),
    entries,
  };
  parseEs2015Promotion(JSON.stringify(promotion));
  return {
    paths,
    baseline,
    disposition: { destinations },
    ownerDeltas,
    ownerMap,
    promotion,
  };
}

/**
 * @param {{
 *   taxonomyText: string,
 *   auditEvidenceText: string,
 *   subsetText: string,
 *   reportText: string,
 *   conformanceText: string,
 *   evidence: ReturnType<typeof buildM0AuthorityEvidence>,
 *   execution: any,
 * }} options
 */
export function projectM0AuthorityOutputs(options) {
  const destinations = new Map(
    options.evidence.disposition.destinations.map(
      (/** @type {M0Destination} */ entry) => [entry.path, entry],
    ),
  );
  const executionByPath = validateM0Execution(
    options.execution,
    options.evidence.baseline,
  );
  const baseAudit =
    /** @type {{ version: number, repository: string, revision: string, auditRecords: M0ExecutionRecord[], blockers: Record<string, string>, intentionalDeviations: Record<string, unknown> }} */ (
      JSON.parse(options.auditEvidenceText)
    );
  /** @type {Map<string, M0ExecutionRecord>} */
  const executionByKey = new Map();
  for (const records of executionByPath.values()) {
    for (const record of records) {
      executionByKey.set(`${record.file}\u0000${record.variant ?? ''}`, record);
    }
  }
  const consumedExecution = new Set();
  const auditRecords = baseAudit.auditRecords.map(
    (/** @type {M0ExecutionRecord} */ record) => {
      const key = `${record.file}\u0000${record.variant ?? ''}`;
      const execution = executionByKey.get(key);
      if (execution === undefined) return record;
      consumedExecution.add(key);
      return {
        type: 'test',
        file: execution.file,
        variant: execution.variant,
        status: execution.status,
      };
    },
  );
  if (consumedExecution.size !== M0.variants) {
    throw new Error('M0 audit projection lacks exact BASE audit variants');
  }
  const blockerEntries = new Map(Object.entries(baseAudit.blockers));
  for (const destination of destinations.values()) {
    if (destination.status === 'selected-passing') {
      blockerEntries.delete(destination.path);
    } else {
      blockerEntries.set(destination.path, destination.blocker);
    }
  }
  const blockers = Object.fromEntries(
    [...blockerEntries].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
  const auditEvidenceText = `${JSON.stringify(
    {
      version: baseAudit.version,
      repository: baseAudit.repository,
      revision: baseAudit.revision,
      auditRecords,
      blockers,
      intentionalDeviations: baseAudit.intentionalDeviations,
    },
    null,
    2,
  )}\n`;

  const promotion = parseEs2015Promotion(
    JSON.stringify(options.evidence.promotion),
  );
  const subsetText =
    promotion.rootCount === 0
      ? options.subsetText
      : serializeUpstreamSubset(
          mergePromotionSubset(
            parseUpstreamSubset(options.subsetText),
            promotion,
          ),
        );
  if (promotion.rootCount !== 0) {
    throw new Error(
      'M0 report projection requires promoted selected-record generation',
    );
  }

  const baseTaxonomy =
    /** @type {Record<string, any> & { classifications: M0Classification[], inputs: Record<string, string> }} */ (
      JSON.parse(options.taxonomyText)
    );
  const classifications = baseTaxonomy.classifications.map(
    (/** @type {M0Classification} */ entry) => {
      const destination = destinations.get(entry.path);
      if (destination === undefined) return entry;
      return {
        ...entry,
        status: destination.status,
        blocker: destination.status.startsWith('blocked:')
          ? destination.blocker
          : null,
      };
    },
  );
  const taxonomy = {
    ...baseTaxonomy,
    inputs: {
      ...baseTaxonomy.inputs,
      subsetSha256: sha256(subsetText),
      selectedEvidenceSha256: sha256(options.reportText),
      auditEvidenceSha256: sha256(auditEvidenceText),
      m0DispositionSha256: sha256(renderM0Json(options.evidence.disposition)),
      m0PromotionSha256: sha256(renderM0Json(options.evidence.promotion)),
    },
    summary: summarizeEs2015Classification(classifications),
    statusTables: m0StatusTables(classifications),
    classifications,
  };
  return {
    taxonomyText: renderM0Json(taxonomy),
    auditEvidenceText,
    subsetText,
    reportText: options.reportText,
    conformanceText: options.conformanceText,
  };
}

/** @param {unknown} value */
function renderM0Json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** @param {readonly any[]} classifications */
function m0StatusTables(classifications) {
  return {
    core: m0CountTable(
      classifications.filter((entry) => entry.partition === 'core'),
      (entry) => entry.status,
    ),
    annexB: m0CountTable(
      classifications.filter((entry) => entry.partition === 'annex-b'),
      (entry) => entry.status,
    ),
    blockers: m0CountTable(
      classifications.filter((entry) => entry.blocker !== null),
      (entry) => entry.blocker,
    ),
  };
}

/**
 * @param {readonly any[]} entries
 * @param {(entry: any) => string} keyOf
 */
function m0CountTable(entries, keyOf) {
  const totals = new Map();
  for (const entry of entries) {
    const key = keyOf(entry);
    const total = totals.get(key) ?? { roots: 0, variants: 0 };
    total.roots += 1;
    total.variants += entry.variants;
    totals.set(key, total);
  }
  return [...totals]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, totals]) => ({ name, ...totals }));
}

/**
 * @param {any} document
 * @param {readonly string[]} paths
 */
function parseM0Destinations(document, paths) {
  if (
    typeof document !== 'object' ||
    document === null ||
    Array.isArray(document) ||
    Object.keys(document).join(',') !== 'destinations' ||
    !Array.isArray(document.destinations)
  ) {
    throw new Error('M0 disposition must contain exact destinations');
  }
  if (document.destinations.length !== paths.length) {
    throw new Error('M0 disposition must cover all 240 reviewed roots');
  }
  return document.destinations.map(
    (/** @type {any} */ entry, /** @type {number} */ index) => {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        Array.isArray(entry) ||
        Object.keys(entry).join(',') !== 'path,status,blocker,issue' ||
        entry.path !== paths[index]
      ) {
        throw new Error('M0 destinations must be exact and path-sorted');
      }
      if (entry.status === 'selected-passing') {
        if (entry.blocker !== null || entry.issue !== 79) {
          throw new Error(`M0 passing destination is invalid: ${entry.path}`);
        }
        return { ...entry };
      }
      const blocker = M0_BLOCKER_BY_ISSUE[entry.issue];
      if (
        blocker === undefined ||
        entry.blocker !== blocker ||
        entry.status !== `blocked:${blocker}`
      ) {
        throw new Error(`M0 blocked destination is invalid: ${entry.path}`);
      }
      return { ...entry };
    },
  );
}

/**
 * @param {M0Execution} execution
 * @param {readonly M0Classification[]} baseline
 * @returns {Map<string, M0ExecutionRecord[]>}
 */
function validateM0Execution(execution, baseline) {
  if (
    execution?.version !== 1 ||
    execution?.ledger?.roots !== M0.roots ||
    execution?.ledger?.variants !== M0.variants ||
    execution?.ledger?.sha256 !== M0.sha256 ||
    !Array.isArray(execution?.records)
  ) {
    throw new Error('M0 execution evidence has the wrong reviewed identity');
  }
  /** @type {Map<string, number>} */
  const expected = new Map(
    baseline.map((entry) => [entry.path, entry.variants]),
  );
  /** @type {Map<string, M0ExecutionRecord[]>} */
  const recordsByPath = new Map(
    baseline.map((entry) => [
      entry.path,
      /** @type {M0ExecutionRecord[]} */ ([]),
    ]),
  );
  const keys = new Set();
  for (const record of execution.records) {
    const records = recordsByPath.get(record.file);
    const key = `${record.file}\u0000${record.variant ?? ''}`;
    if (
      records === undefined ||
      keys.has(key) ||
      !['passed', 'failed', 'skipped'].includes(record.status)
    ) {
      throw new Error(
        'M0 execution evidence has a foreign or duplicate record',
      );
    }
    keys.add(key);
    records.push(record);
  }
  for (const [path, records] of recordsByPath) {
    if (records.length !== expected.get(path)) {
      throw new Error(`M0 execution evidence lacks exact variants: ${path}`);
    }
  }
  if (execution.records.length !== M0.variants) {
    throw new Error('M0 execution evidence must contain 459 variants');
  }
  return recordsByPath;
}

/**
 * @param {readonly { status: string, blocker: string | null, issue: number }[]} destinations
 */
function uniqueM0Destinations(destinations) {
  const unique = new Map();
  for (const destination of destinations) {
    const key = `${destination.status}\u0000${destination.blocker ?? ''}\u0000${destination.issue}`;
    unique.set(key, destination);
  }
  return [...unique.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, destination]) => destination);
}

/**
 * @param {URL} repositoryRootUrl
 * @param {string} outputPath
 */
export async function resolveM0OutputPath(repositoryRootUrl, outputPath) {
  if (
    typeof outputPath !== 'string' ||
    outputPath === '' ||
    path.isAbsolute(outputPath) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(outputPath)
  ) {
    throw new Error('M0 output path must be repository-relative');
  }
  const root = await realpath(fileURLToPath(repositoryRootUrl));
  const candidate = path.resolve(root, outputPath);
  assertInsideRepository(root, candidate, outputPath);
  const parent = path.dirname(candidate);
  await mkdir(parent, { recursive: true });
  const physicalParent = await realpath(parent);
  assertInsideRepository(root, physicalParent, outputPath);
  const target = path.join(physicalParent, path.basename(candidate));
  try {
    const stat = await lstat(target);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`M0 output path ${outputPath} must be a regular file`);
    }
  } catch (error) {
    if (/** @type {any} */ (error)?.code !== 'ENOENT') {
      throw error;
    }
  }
  return target;
}

/**
 * @param {string} root
 * @param {string} candidate
 * @param {string} displayPath
 */
function assertInsideRepository(root, candidate, displayPath) {
  const relative = path.relative(root, candidate);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`M0 path ${displayPath} is outside the repository root`);
  }
}

/**
 * @param {URL} repositoryRootUrl
 * @param {string} inputPath
 */
async function resolveM0InputPath(repositoryRootUrl, inputPath) {
  if (
    typeof inputPath !== 'string' ||
    inputPath === '' ||
    path.isAbsolute(inputPath) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(inputPath)
  ) {
    throw new Error('M0 input path must be repository-relative');
  }
  const root = await realpath(fileURLToPath(repositoryRootUrl));
  const candidate = path.resolve(root, inputPath);
  assertInsideRepository(root, candidate, inputPath);
  const physical = await realpath(candidate);
  assertInsideRepository(root, physical, inputPath);
  const stat = await lstat(physical);
  if (!stat.isFile()) {
    throw new Error(`M0 input path ${inputPath} must be a regular file`);
  }
  return physical;
}

/** @param {readonly string[]} argv */
function parseOptions(argv) {
  let ledger = null;
  let output = null;
  for (const argument of argv) {
    if (argument.startsWith('--ledger=')) {
      if (ledger !== null) throw new Error('--ledger may be specified once');
      ledger = argument.slice('--ledger='.length);
    } else if (argument.startsWith('--output=')) {
      if (output !== null) throw new Error('--output may be specified once');
      output = argument.slice('--output='.length);
    } else {
      throw new Error(`Unknown M0 option: ${argument}`);
    }
  }
  if (ledger === null || ledger === '' || output === null || output === '') {
    throw new Error('M0 execution requires --ledger and --output');
  }
  return { ledger, output };
}

/** @param {readonly string[]} argv */
export async function main(argv = []) {
  const options = parseOptions(argv);
  const [ledgerPath, taxonomyPath, outputPath] = await Promise.all([
    resolveM0InputPath(REPOSITORY_ROOT_URL, options.ledger),
    resolveM0InputPath(REPOSITORY_ROOT_URL, TAXONOMY_FILE),
    resolveM0OutputPath(REPOSITORY_ROOT_URL, options.output),
  ]);
  const pin = await readTest262Pin(REPOSITORY_ROOT_URL);
  await assertPinnedCheckout(pin, REPOSITORY_ROOT_URL);
  const [ledgerText, taxonomyText] = await Promise.all([
    readFile(ledgerPath, 'utf8'),
    readFile(taxonomyPath, 'utf8'),
  ]);
  const document = await runM0Focused({
    environment: process.env,
    ledgerText,
    taxonomy: JSON.parse(taxonomyText),
    pin,
    host: createNodeTest262Host({
      root: new URL(
        `${pin.checkoutPath.replace(/\/$/u, '')}/`,
        REPOSITORY_ROOT_URL,
      ),
    }),
    engine: createJsjsTest262Engine(),
  });
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `M0 focused Test262: ${document.ledger.roots} roots / ${document.ledger.variants} variants\n`,
  );
  return document.records.some((record) => record.status === 'failed') ? 1 : 0;
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
