import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNodeTest262Host } from './adapters/node.js';
import { createJsjsTest262Engine } from './engine.js';
import { buildEs2015Inventory } from './es2015-taxonomy.js';
import { readTest262HarnessDefinitions } from './harness-definitions.js';
import { assertPinnedCheckout, readTest262Pin } from './pin.js';
import { runTest262Suite } from './runner.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const TAXONOMY_FILE = 'tools/test262/es2015-taxonomy.json';
const P1C_BLOCKER = 'early-errors-and-declaration-instantiation';
const P1C_PATH_PATTERN = /^test\/language\/statements\/try\/.+\.js$/u;
const P1C_COMPARE_ARRAY_INCLUDES = Object.freeze(['compareArray.js']);
const P1C_FEATURE_PROFILE_COUNTS = Object.freeze({
  '[]': 2,
  '["Symbol.iterator","destructuring-binding"]': 8,
  '["Symbol.iterator","destructuring-binding","generators"]': 1,
  '["destructuring-binding"]': 58,
  '["destructuring-binding","generators"]': 11,
  '["let"]': 1,
});

export const P1C_PROMOTION_GROUP = 'es2015/p1c-catch-binding';
export const P1C_ISSUE_NUMBER = 116;
export const P1C_ISSUE_TITLE =
  'Implement ES2015 destructuring catch parameters and catch environments';
export const P1C_PARENT_ISSUE = 78;
export const P1C_PARENT_TITLE =
  'Complete core ES2015 early errors and declaration instantiation';
export const P1C = Object.freeze({
  roots: 81,
  variants: 161,
  sha256: 'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5',
});

/**
 * @typedef {{
 *   path: string,
 *   variants: number,
 *   partition: string,
 *   status: string,
 *   blocker: string | null,
 *   features: readonly string[],
 *   flags: readonly string[],
 *   includes: readonly string[],
 *   provenance: readonly string[],
 * }} P1CClassification
 * @typedef {{
 *   type: string,
 *   file: string,
 *   variant: string | null,
 *   status: 'passed' | 'failed' | 'skipped',
 *   reason?: string,
 *   message?: string,
 * }} P1CExecutionRecord
 * @typedef {{
 *   version: 1,
 *   ledger: { roots: number, variants: number, sha256: string },
 *   records: readonly P1CExecutionRecord[],
 * }} P1CExecution
 */

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * @param {readonly string[]} left
 * @param {readonly string[]} right
 * @returns {boolean}
 */
function sameStrings(left, right) {
  return (
    [...left].sort(compareStrings).join('\u0000') ===
    [...right].sort(compareStrings).join('\u0000')
  );
}

/** @param {string} left @param {string} right */
function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function parseP1CLedger(text) {
  const paths = text.endsWith('\n')
    ? text.slice(0, -1).split('\n')
    : text.split('\n');
  if (
    paths.length === 0 ||
    paths.some((sourcePath) => !P1C_PATH_PATTERN.test(sourcePath)) ||
    paths.join('\u0000') !== [...paths].sort(compareStrings).join('\u0000') ||
    new Set(paths).size !== paths.length
  ) {
    throw new Error(
      'P1C ledger must contain sorted unique catch-binding Test262 roots',
    );
  }
  return paths;
}

/**
 * @param {string} text
 * @param {{ classifications?: readonly P1CClassification[] }} taxonomy
 * @returns {string[]}
 */
export function verifyP1CLedger(text, taxonomy) {
  const paths = parseP1CLedger(text);
  if (
    paths.length !== P1C.roots ||
    sha256(text) !== P1C.sha256 ||
    !Array.isArray(taxonomy?.classifications)
  ) {
    throw new Error('P1C ledger does not match the reviewed 81-root SHA-256');
  }

  const classifications = new Map(
    taxonomy.classifications.map((entry) => [entry.path, entry]),
  );
  let variants = 0;
  for (const sourcePath of paths) {
    const entry = classifications.get(sourcePath);
    if (
      entry?.partition !== 'core' ||
      entry.status !== `blocked:${P1C_BLOCKER}` ||
      entry.blocker !== P1C_BLOCKER ||
      !Number.isInteger(entry.variants) ||
      entry.variants <= 0 ||
      !Array.isArray(entry.features) ||
      !Array.isArray(entry.flags) ||
      !Array.isArray(entry.includes) ||
      !Array.isArray(entry.provenance)
    ) {
      throw new Error(`P1C BASE classification mismatch: ${sourcePath}`);
    }
    variants += entry.variants;
  }
  if (variants !== P1C.variants) {
    throw new Error('P1C taxonomy variants do not match the reviewed ledger');
  }
  return paths;
}

/**
 * @param {{
 *   ledgerText: string,
 *   taxonomy: { classifications?: readonly P1CClassification[] },
 *   readRoot: (path: string) => Promise<string> | string,
 *   includeDefinitions?: ReadonlyMap<string, unknown> | Record<string, unknown>,
 * }} options
 */
export async function buildP1CInventory(options) {
  if (typeof options.readRoot !== 'function') {
    throw new Error('P1C inventory requires a root reader');
  }
  const paths = verifyP1CLedger(options.ledgerText, options.taxonomy);
  const inventory = buildEs2015Inventory({
    roots: await Promise.all(
      paths.map(async (sourcePath) => ({
        path: sourcePath,
        source: await options.readRoot(sourcePath),
      })),
    ),
    includeDefinitions: options.includeDefinitions,
  });
  validateP1CInventory(inventory, options.taxonomy, paths);
  return inventory;
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
export async function runP1CFocused(options) {
  const environment = options?.environment ?? process.env;
  if (environment.TZ !== 'UTC') {
    throw new Error('Focused P1C Test262 execution requires TZ=UTC');
  }
  const taxonomy =
    /** @type {{ pin: { repository: string, revision: string }, classifications: readonly P1CClassification[] } | undefined } */ (
      options?.taxonomy
    );
  const pin = options?.pin;
  if (
    taxonomy === undefined ||
    pin === undefined ||
    taxonomy.pin.repository !== pin.repository ||
    taxonomy.pin.revision !== pin.revision
  ) {
    throw new Error('P1C taxonomy does not match the pinned Test262 checkout');
  }
  if (options?.host === undefined || options?.engine === undefined) {
    throw new Error('Focused P1C execution requires a Test262 host and engine');
  }

  const ledgerText = options.ledgerText ?? '';
  const paths = verifyP1CLedger(ledgerText, taxonomy);
  const byPath = new Map(
    taxonomy.classifications.map((entry) => [entry.path, entry]),
  );
  const { records } = await runTest262Suite({
    engine: options.engine,
    host: options.host,
    paths,
    supportedFeaturesForPath(file, metadata) {
      const entry = byPath.get(file);
      if (
        entry === undefined ||
        !sameStrings(metadata.features, entry.features) ||
        !sameStrings(metadata.flags, entry.flags) ||
        !sameStrings(metadata.includes, entry.includes)
      ) {
        throw new Error(`P1C metadata drift: ${file}`);
      }
      return [...metadata.features];
    },
  });
  const document = {
    version: 1,
    ledger: {
      roots: P1C.roots,
      variants: P1C.variants,
      sha256: P1C.sha256,
    },
    records,
  };
  try {
    validateP1CRecords(records, paths, byPath);
  } catch (error) {
    if (error instanceof Error) {
      Object.assign(error, { p1cExecution: document });
    }
    throw error;
  }
  return document;
}

/**
 * @param {URL} repositoryRootUrl
 * @param {string} outputPath
 */
export async function resolveP1COutputPath(repositoryRootUrl, outputPath) {
  if (
    typeof outputPath !== 'string' ||
    outputPath === '' ||
    path.isAbsolute(outputPath) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(outputPath)
  ) {
    throw new Error('P1C output path must be repository-relative');
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
      throw new Error(`P1C output path ${outputPath} must be a regular file`);
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
    throw new Error(`P1C path ${displayPath} is outside the repository root`);
  }
}

/**
 * @param {URL} repositoryRootUrl
 * @param {string} inputPath
 */
async function resolveP1CInputPath(repositoryRootUrl, inputPath) {
  if (
    typeof inputPath !== 'string' ||
    inputPath === '' ||
    path.isAbsolute(inputPath) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(inputPath)
  ) {
    throw new Error('P1C input path must be repository-relative');
  }
  const root = await realpath(fileURLToPath(repositoryRootUrl));
  const candidate = path.resolve(root, inputPath);
  assertInsideRepository(root, candidate, inputPath);
  const physical = await realpath(candidate);
  assertInsideRepository(root, physical, inputPath);
  const stat = await lstat(physical);
  if (!stat.isFile()) {
    throw new Error(`P1C input path ${inputPath} must be a regular file`);
  }
  return physical;
}

/**
 * @param {readonly string[]} argv
 * @returns {{ ledger: string, output: string }}
 */
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
      throw new Error(`Unknown P1C option: ${argument}`);
    }
  }
  if (ledger === null || ledger === '' || output === null || output === '') {
    throw new Error('P1C execution requires --ledger and --output');
  }
  return { ledger, output };
}

/** @param {readonly string[]} argv */
export async function main(argv = []) {
  const options = parseOptions(argv);
  const [ledgerPath, taxonomyPath, outputPath] = await Promise.all([
    resolveP1CInputPath(REPOSITORY_ROOT_URL, options.ledger),
    resolveP1CInputPath(REPOSITORY_ROOT_URL, TAXONOMY_FILE),
    resolveP1COutputPath(REPOSITORY_ROOT_URL, options.output),
  ]);
  const pin = await readTest262Pin(REPOSITORY_ROOT_URL);
  await assertPinnedCheckout(pin, REPOSITORY_ROOT_URL);
  const [ledgerText, taxonomyText] = await Promise.all([
    readFile(ledgerPath, 'utf8'),
    readFile(taxonomyPath, 'utf8'),
  ]);
  const taxonomy = JSON.parse(taxonomyText);
  const host = createNodeTest262Host({
    root: new URL(
      `${pin.checkoutPath.replace(/\/$/u, '')}/`,
      REPOSITORY_ROOT_URL,
    ),
  });
  const includeDefinitions = await readTest262HarnessDefinitions(
    pin.checkoutPath,
    REPOSITORY_ROOT_URL,
  );
  await buildP1CInventory({
    ledgerText,
    taxonomy,
    readRoot: (sourcePath) => host.readTest(sourcePath),
    includeDefinitions,
  });
  let document;
  try {
    document = await runP1CFocused({
      environment: process.env,
      ledgerText,
      taxonomy,
      pin,
      host,
      engine: createJsjsTest262Engine(),
    });
  } catch (error) {
    const failedDocument = /** @type {any} */ (error)?.p1cExecution;
    if (failedDocument === undefined) throw error;
    await writeFile(outputPath, renderP1CJson(failedDocument), 'utf8');
    writeP1CExecutionSummary(failedDocument);
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
  await writeFile(outputPath, renderP1CJson(document), 'utf8');
  writeP1CExecutionSummary(document);
  return 0;
}

/**
 * @param {readonly any[]} inventory
 * @param {{ classifications?: readonly P1CClassification[] }} taxonomy
 * @param {readonly string[]} paths
 */
function validateP1CInventory(inventory, taxonomy, paths) {
  if (
    inventory.length !== P1C.roots ||
    !Array.isArray(taxonomy.classifications)
  ) {
    throw new Error(
      'P1C pinned inventory does not cover the exact reviewed roots',
    );
  }
  const byPath = new Map(
    taxonomy.classifications.map((entry) => [entry.path, entry]),
  );
  let variants = 0;
  let compareArrayRoots = 0;
  let noStrictRoots = 0;
  let dualVariantRoots = 0;
  const featureCounts = new Map();

  for (let index = 0; index < paths.length; index += 1) {
    const sourcePath = paths[index];
    const root = inventory[index];
    const entry = byPath.get(sourcePath);
    if (
      entry === undefined ||
      root?.path !== sourcePath ||
      root.metadata === null ||
      root.metadataError !== null
    ) {
      throw new Error(`P1C pinned inventory drift: ${sourcePath}`);
    }
    if (
      root.variants !== entry.variants ||
      !sameStrings(root.metadata.features, entry.features) ||
      !sameStrings(root.metadata.flags, entry.flags) ||
      !sameStrings(root.metadata.includes, entry.includes)
    ) {
      throw new Error(`P1C pinned inventory drift: ${sourcePath}`);
    }
    if (root.includeFeatures.length !== 0) {
      throw new Error(`P1C include-feature closure drift: ${sourcePath}`);
    }

    variants += root.variants;
    if (sameStrings(root.metadata.includes, P1C_COMPARE_ARRAY_INCLUDES)) {
      compareArrayRoots += 1;
    } else if (root.metadata.includes.length !== 0) {
      throw new Error(`P1C pinned inventory includes drift: ${sourcePath}`);
    }
    if (sameStrings(root.metadata.flags, ['noStrict'])) {
      noStrictRoots += 1;
    }
    if (root.variants === 2) {
      dualVariantRoots += 1;
    }
    const key = JSON.stringify(root.metadata.features);
    featureCounts.set(key, (featureCounts.get(key) ?? 0) + 1);
  }
  if (variants !== P1C.variants) {
    throw new Error(
      'P1C pinned inventory variants do not match the reviewed ledger',
    );
  }
  if (compareArrayRoots !== 1) {
    throw new Error('P1C pinned inventory compareArray.js count drifted');
  }
  if (noStrictRoots !== 1 || dualVariantRoots !== 80) {
    throw new Error('P1C pinned inventory strict/non-strict shape drifted');
  }
  if (!sameExactCounts(featureCounts, P1C_FEATURE_PROFILE_COUNTS)) {
    throw new Error('P1C pinned inventory feature counts drifted');
  }
}

/**
 * @param {readonly P1CExecutionRecord[]} records
 * @param {readonly string[]} paths
 * @param {ReadonlyMap<string, P1CClassification>} byPath
 */
function validateP1CRecords(records, paths, byPath) {
  const grouped = new Map();
  const keys = new Set();
  for (const record of records) {
    if (!byPath.has(record.file)) {
      throw new Error(
        `P1C execution returned a foreign or duplicate record: ${record.file}`,
      );
    }
    const key = `${record.file}\u0000${record.variant ?? ''}`;
    if (keys.has(key)) {
      throw new Error(
        `P1C execution returned a foreign or duplicate record: ${record.file}`,
      );
    }
    keys.add(key);
    const rootRecords = grouped.get(record.file) ?? [];
    rootRecords.push(record);
    grouped.set(record.file, rootRecords);
  }

  for (const sourcePath of paths) {
    const entry = byPath.get(sourcePath);
    const rootRecords = grouped.get(sourcePath) ?? [];
    if (entry === undefined || rootRecords.length !== entry.variants) {
      throw new Error(`P1C execution lacks exact variants: ${sourcePath}`);
    }
    if (
      rootRecords.some(
        (/** @type {P1CExecutionRecord} */ record) =>
          record.status === 'skipped',
      )
    ) {
      throw new Error(`P1C execution skipped ${sourcePath}`);
    }
    if (
      rootRecords.some(
        (/** @type {P1CExecutionRecord} */ record) =>
          record.status !== 'passed',
      )
    ) {
      throw new Error(`P1C root did not completely pass: ${sourcePath}`);
    }
  }
  if (records.length !== P1C.variants) {
    throw new Error('P1C execution does not cover all 161 reviewed variants');
  }
}

/**
 * @param {ReadonlyMap<string, number>} actual
 * @param {Readonly<Record<string, number>>} expected
 */
function sameExactCounts(actual, expected) {
  const expectedKeys = Object.keys(expected).sort(compareStrings);
  const actualKeys = [...actual.keys()].sort(compareStrings);
  if (
    expectedKeys.length !== actualKeys.length ||
    expectedKeys.some((key, index) => key !== actualKeys[index])
  ) {
    return false;
  }
  return expectedKeys.every((key) => actual.get(key) === expected[key]);
}

/** @param {P1CExecution | any} document */
function writeP1CExecutionSummary(document) {
  const byPath = new Map();
  for (const record of document.records) {
    const rootRecords = byPath.get(record.file) ?? [];
    rootRecords.push(record);
    byPath.set(record.file, rootRecords);
  }
  const completePass = [...byPath.values()].filter((records) =>
    records.every(
      (/** @type {P1CExecutionRecord} */ record) => record.status === 'passed',
    ),
  );
  const completePassVariants = completePass.reduce(
    (total, records) => total + records.length,
    0,
  );
  process.stdout.write(
    `P1C focused Test262: ${document.ledger.roots} roots / ${document.ledger.variants} variants; ${completePass.length} complete-pass roots / ${completePassVariants} variants; ${document.ledger.roots - completePass.length} residual roots / ${document.ledger.variants - completePassVariants} variants\n`,
  );
}

/** @param {unknown} value */
function renderP1CJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
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
