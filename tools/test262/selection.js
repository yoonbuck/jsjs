/**
 * Host-neutral Test262 test selection.
 *
 * This module owns every decision about *which* tests run: the name of the
 * selection manifest, its shape and validation, the precedence between
 * explicitly requested paths, a manifest, and a directory listing, and the
 * code-unit ordering that makes reports reproducible. Adapters contribute file
 * loading only — they must never parse a manifest or expand it themselves, or
 * the same tree would select different tests depending on the host it ran in.
 *
 * The manifest exists because only Node can enumerate directories: browsers and
 * the `jsc` shell need a checked-in list. Keeping the list authoritative for
 * every host (Node included) is what makes the three runtimes comparable.
 */

/** The selection manifest's file name, relative to a Test262 tree root. */
export const TEST262_MANIFEST_FILE = 'manifest.json';

/** The harness subdirectory of a Test262 tree, unless a host overrides it. */
export const DEFAULT_HARNESS_DIRECTORY = 'harness';

/** Test262 dependency sources that are never independently executed. */
export const TEST262_FIXTURE_SUFFIX = '_FIXTURE.js';

const MANIFEST_KEYS = Object.freeze(['tests', 'malformed']);

/**
 * @typedef {{
 *   tests: readonly string[],
 *   malformed: readonly string[],
 * }} Test262Manifest
 *
 * @typedef {{
 *   readManifest?: () => string | Promise<string>,
 *   listTests?: () => readonly string[] | Promise<readonly string[]>,
 * }} Test262SelectionHost
 *
 * @typedef {{
 *   host: Test262SelectionHost,
 *   paths?: readonly string[],
 *   includeMalformed?: boolean,
 * }} Test262ResolveOptions
 */

/**
 * Raised when a tree cannot say which tests to run: an unreadable or
 * ill-shaped manifest, or a host that offers neither a manifest nor a listing.
 */
export class Test262SelectionError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'Test262SelectionError';
  }
}

/**
 * Orders paths by code unit. `Array.prototype.sort`'s default comparator is
 * already code-unit based, but the comparator is spelled out so report order
 * can never depend on a host's locale collation.
 *
 * @param {readonly string[]} paths
 * @returns {string[]}
 */
export function sortTestPaths(paths) {
  return sortStrings(paths);
}

/**
 * @param {readonly string[]} values
 * @returns {string[]}
 */
export function sortStrings(values) {
  return [...values].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isTest262FixtureDependencyPath(path) {
  return path.endsWith(TEST262_FIXTURE_SUFFIX);
}

/**
 * Parses and validates a selection manifest. Unknown keys are rejected so a
 * typo cannot silently drop tests from every host at once.
 *
 * @param {string} text
 * @returns {Test262Manifest}
 */
export function parseTest262Manifest(text) {
  /** @type {unknown} */
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Test262SelectionError(
      `${TEST262_MANIFEST_FILE} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Test262SelectionError(
      `${TEST262_MANIFEST_FILE} must contain a JSON object`,
    );
  }

  for (const key of Object.keys(parsed)) {
    if (!MANIFEST_KEYS.includes(key)) {
      throw new Test262SelectionError(
        `${TEST262_MANIFEST_FILE} has an unknown key: ${key}`,
      );
    }
  }

  const record = /** @type {Record<string, unknown>} */ (parsed);

  return Object.freeze({
    tests: readPathList(record, 'tests'),
    malformed: readPathList(record, 'malformed'),
  });
}

/**
 * @param {Record<string, unknown>} record
 * @param {string} key
 * @returns {readonly string[]}
 */
function readPathList(record, key) {
  const value = record[key];

  if (value === undefined) {
    return Object.freeze([]);
  }

  if (!Array.isArray(value)) {
    throw new Test262SelectionError(
      `${TEST262_MANIFEST_FILE} key ${key} must be an array of paths`,
    );
  }

  for (const entry of value) {
    if (typeof entry !== 'string' || entry === '') {
      throw new Test262SelectionError(
        `${TEST262_MANIFEST_FILE} key ${key} must contain non-empty path strings`,
      );
    }
  }

  return Object.freeze([...value]);
}

/**
 * Applies the selection precedence and ordering.
 *
 * Explicitly requested paths win outright, because a caller naming files is
 * asking for exactly those. Otherwise the manifest decides, and only when no
 * manifest is available does a host listing stand in for one. `malformed`
 * entries are deliberately broken fixtures, so they join the selection only
 * when asked for.
 *
 * @param {{
 *   paths?: readonly string[],
 *   manifest?: Test262Manifest | null,
 *   listing?: readonly string[] | null,
 *   includeMalformed?: boolean,
 * }} options
 * @returns {string[]}
 */
export function selectTest262Paths(options) {
  const { paths, manifest, listing, includeMalformed = false } = options;

  if (paths !== undefined && paths.length > 0) {
    return sortRootTestPaths(paths);
  }

  if (manifest !== undefined && manifest !== null) {
    return sortRootTestPaths([
      ...manifest.tests,
      ...(includeMalformed ? manifest.malformed : []),
    ]);
  }

  if (listing !== undefined && listing !== null) {
    return sortRootTestPaths(listing);
  }

  return [];
}

/**
 * @param {readonly string[]} paths
 * @returns {string[]}
 */
function sortRootTestPaths(paths) {
  return sortTestPaths(
    paths.filter((path) => !isTest262FixtureDependencyPath(path)),
  );
}

/**
 * Resolves the selection for a host: reads the manifest when the host has one,
 * falls back to a listing when it does not, and fails loudly when neither is
 * available or the manifest is unusable.
 *
 * A manifest that cannot be *read* is treated as absent (a tree may legitimately
 * ship without one), but a manifest that reads and fails to *parse* is an
 * error: silently falling back would run a different set of tests than the tree
 * declares.
 *
 * @param {Test262ResolveOptions} options
 * @returns {Promise<string[]>}
 */
export async function resolveTest262Paths(options) {
  const { host, paths, includeMalformed } = options;

  if (paths !== undefined && paths.length > 0) {
    return selectTest262Paths({ paths });
  }

  const manifestText = await readManifestText(host);

  if (manifestText !== null) {
    return selectTest262Paths({
      manifest: parseTest262Manifest(manifestText),
      includeMalformed,
    });
  }

  if (typeof host.listTests === 'function') {
    return selectTest262Paths({ listing: [...(await host.listTests())] });
  }

  throw new Test262SelectionError(
    `this host could not read ${TEST262_MANIFEST_FILE} and cannot list tests`,
  );
}

/**
 * @param {Test262SelectionHost} host
 * @returns {Promise<string | null>}
 */
async function readManifestText(host) {
  if (typeof host.readManifest !== 'function') {
    return null;
  }

  try {
    return await host.readManifest();
  } catch {
    return null;
  }
}
