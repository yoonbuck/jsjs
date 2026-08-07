/**
 * The ES5 Test262 selection policy, as portable logic.
 *
 * This module turns `es5-selection.json` — the checked-in policy that says which
 * of the whole `tc39/test262` tree is in scope for an ES5.1 engine — into a
 * selection predicate, a deterministic grouping, and a serializer that writes
 * the result back out in the existing `upstream-subset.json` schema. Like every
 * other module under `tools/test262/` (except the `adapters/` and the
 * `*-run.js`/`*-select.js` entry points), it touches no filesystem and no host
 * API: it parses text and computes, so it is importable from any host and
 * testable without a checkout. The Node entry point `upstream-select.js` walks
 * the tree, runs Acorn, and reads/writes files; it hands this module strings and
 * booleans.
 *
 * The policy expresses four structural filters as data — excluded top-level
 * directories, the allowed `test/built-ins/<name>` list, the excluded
 * `test/language/<dir>` list, and (applied by the caller) the "parses at
 * ecmaVersion 5" and "frontmatter carries no `features:`/`module`" filters — plus
 * an `exclusions` array that records, with a category and a cited reason, every
 * remaining file that is out of scope because it asserts post-ES5 behaviour,
 * needs a host facility, needs `Date`, or exercises a documented intentional
 * deviation. The structural filters produce the candidate set; the exclusions
 * carve the classified failures out of it.
 */

import { sortStrings } from './selection.js';
import { UPSTREAM_SUBSET_VERSION } from './upstream.js';

/** Repository-relative path to the policy, for messages and callers. */
export const ES5_SELECTION_FILE = 'tools/test262/es5-selection.json';

/** The only policy schema version this tooling understands. */
export const ES5_SELECTION_VERSION = 1;

/**
 * The exclusion categories the policy may use, and nothing else. Two of them —
 * `post-es5-syntax` and `post-es5-builtin` — are produced by the structural
 * filters and by coarse prefix entries rather than a cited clause; the other
 * three require a non-empty reason. Only `engine-deviation` is machine-checked:
 * `test/node/repository-invariants.test.js` verifies that its reason references
 * an anchor that exists in `docs/limitations.md`.
 */
export const EXCLUSION_CATEGORIES = Object.freeze([
  'post-es5-semantics',
  'post-es5-builtin',
  'post-es5-syntax',
  'host-dependent',
  'engine-deviation',
]);

const POLICY_KEYS = Object.freeze([
  'version',
  'excludedDirectories',
  'builtins',
  'excludedLanguageDirectories',
  'exclusions',
]);

const EXCLUSION_KEYS = Object.freeze(['path', 'prefix', 'category', 'reason']);

const TEST_ROOT = 'test/';

/**
 * @typedef {{
 *   path?: string,
 *   prefix?: string,
 *   category: string,
 *   reason: string,
 * }} Es5Exclusion
 *
 * @typedef {{
 *   version: number,
 *   excludedDirectories: readonly string[],
 *   builtins: readonly string[],
 *   excludedLanguageDirectories: readonly string[],
 *   exclusions: readonly Es5Exclusion[],
 * }} Es5SelectionPolicy
 *
 * @typedef {{
 *   hasFeatures: boolean,
 *   isModule: boolean,
 *   parsesAtEs5: boolean,
 *   includesParseAtEs5: boolean,
 * }} Es5CandidateInfo
 */

/**
 * Raised when the policy is not a well-formed, deterministic selection: an
 * unreadable shape, an unknown key, an unknown category, an entry that names
 * neither or both of path/prefix, a path outside `test/`, an empty reason, or an
 * unsorted or duplicated list.
 */
export class Es5SelectionError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'Es5SelectionError';
  }
}

/**
 * @param {string} text
 * @returns {Es5SelectionPolicy}
 */
export function parseEs5Selection(text) {
  /** @type {unknown} */
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} must contain a JSON object`,
    );
  }

  const record = /** @type {Record<string, unknown>} */ (parsed);

  requireExactKeys(record, POLICY_KEYS, ES5_SELECTION_FILE);

  if (record.version !== ES5_SELECTION_VERSION) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} must declare version ${ES5_SELECTION_VERSION}`,
    );
  }

  const excludedDirectories = parseStringList(
    record.excludedDirectories,
    'excludedDirectories',
    { requireTestPrefix: true, allowEmpty: true },
  );
  const builtins = parseStringList(record.builtins, 'builtins', {
    requireTestPrefix: false,
    allowEmpty: false,
  });
  const excludedLanguageDirectories = parseStringList(
    record.excludedLanguageDirectories,
    'excludedLanguageDirectories',
    { requireTestPrefix: false, allowEmpty: true },
  );
  const exclusions = parseExclusions(record.exclusions);

  return Object.freeze({
    version: ES5_SELECTION_VERSION,
    excludedDirectories: Object.freeze(excludedDirectories),
    builtins: Object.freeze(builtins),
    excludedLanguageDirectories: Object.freeze(excludedLanguageDirectories),
    exclusions: Object.freeze(exclusions),
  });
}

/**
 * @param {unknown} value
 * @param {string} field
 * @param {{ requireTestPrefix: boolean, allowEmpty: boolean }} options
 * @returns {string[]}
 */
function parseStringList(value, field, options) {
  if (!Array.isArray(value)) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} ${field} must be an array`,
    );
  }

  if (!options.allowEmpty && value.length === 0) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} ${field} must not be empty`,
    );
  }

  for (const entry of value) {
    if (typeof entry !== 'string' || entry === '') {
      throw new Es5SelectionError(
        `${ES5_SELECTION_FILE} ${field} must contain only non-empty strings`,
      );
    }

    if (options.requireTestPrefix && !entry.startsWith(TEST_ROOT)) {
      throw new Es5SelectionError(
        `${ES5_SELECTION_FILE} ${field} entry ${entry} must name a path under test/`,
      );
    }
  }

  const list = /** @type {string[]} */ (value);

  if (new Set(list).size !== list.length) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} ${field} must not repeat an entry`,
    );
  }

  if (!isSorted(list)) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} ${field} must be sorted`,
    );
  }

  return [...list];
}

/**
 * @param {unknown} value
 * @returns {Es5Exclusion[]}
 */
function parseExclusions(value) {
  if (!Array.isArray(value)) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} exclusions must be an array`,
    );
  }

  const exclusions = value.map((entry) => parseExclusion(entry));
  const keys = exclusions.map((exclusion) => exclusionKey(exclusion));

  if (new Set(keys).size !== keys.length) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} exclusions must not name the same path or prefix twice`,
    );
  }

  if (!isSorted(keys)) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} exclusions must be sorted by path or prefix`,
    );
  }

  return exclusions;
}

/**
 * @param {unknown} entry
 * @returns {Es5Exclusion}
 */
function parseExclusion(entry) {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} each exclusion must be an object`,
    );
  }

  const record = /** @type {Record<string, unknown>} */ (entry);

  for (const key of Object.keys(record)) {
    if (!EXCLUSION_KEYS.includes(key)) {
      throw new Es5SelectionError(
        `${ES5_SELECTION_FILE} exclusion carries an unknown key: ${key}`,
      );
    }
  }

  const hasPath = Object.prototype.hasOwnProperty.call(record, 'path');
  const hasPrefix = Object.prototype.hasOwnProperty.call(record, 'prefix');

  if (hasPath === hasPrefix) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} each exclusion must name exactly one of path or prefix`,
    );
  }

  const target = hasPath ? record.path : record.prefix;
  const targetField = hasPath ? 'path' : 'prefix';

  if (typeof target !== 'string' || target === '') {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} exclusion ${targetField} must be a non-empty string`,
    );
  }

  if (!target.startsWith(TEST_ROOT)) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} exclusion ${targetField} ${target} must name a path under test/`,
    );
  }

  if (
    typeof record.category !== 'string' ||
    !EXCLUSION_CATEGORIES.includes(record.category)
  ) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} exclusion ${target} has an unknown category: ${String(
        record.category,
      )}`,
    );
  }

  if (typeof record.reason !== 'string' || record.reason.trim() === '') {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} exclusion ${target} must give a non-empty reason`,
    );
  }

  return Object.freeze(
    hasPath
      ? { path: target, category: record.category, reason: record.reason }
      : { prefix: target, category: record.category, reason: record.reason },
  );
}

/**
 * @param {Es5Exclusion} exclusion
 * @returns {string}
 */
function exclusionKey(exclusion) {
  return exclusion.path ?? /** @type {string} */ (exclusion.prefix);
}

/**
 * Scans a raw test source for the frontmatter facts the structural filters need,
 * without a full YAML parse: whether the frontmatter declares any `features:`,
 * whether it carries the `module` flag, and which harness files it includes via
 * the flow-sequence form. Kept deliberately textual so it never throws on the
 * whole 53k-file tree the way a strict metadata parse can.
 *
 * @param {string} source
 * @returns {{ hasFeatures: boolean, isModule: boolean, includes: string[] }}
 */
export function scanFrontmatter(source) {
  const match = source.match(/\/\*---([\s\S]*?)---\*\//);
  const frontmatter = match ? match[1] : '';
  const flagsLine = frontmatter.match(/^flags:.*$/m);
  const includesMatch = frontmatter.match(/^includes:\s*\[(.*)\]/m);
  const includes = includesMatch
    ? includesMatch[1]
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== '')
    : [];

  return {
    hasFeatures: /^features:/m.test(frontmatter),
    isModule: flagsLine ? /\bmodule\b/.test(flagsLine[0]) : false,
    includes,
  };
}

/**
 * Whether a path survives the four structural filters. Exclusions are applied
 * separately by {@link isSelectedPath}, because the candidate set is what the
 * classification is measured against and the exclusions are what carve it down.
 *
 * @param {string} path Repository-relative upstream path, e.g. `test/built-ins/Array/x.js`.
 * @param {Es5CandidateInfo} info
 * @param {Es5SelectionPolicy} policy
 * @returns {boolean}
 */
export function isCandidatePath(path, info, policy) {
  if (!path.startsWith(TEST_ROOT) || !path.endsWith('.js')) {
    return false;
  }

  for (const directory of policy.excludedDirectories) {
    if (path === directory || path.startsWith(`${directory}/`)) {
      return false;
    }
  }

  const segments = path.split('/');

  if (segments[1] === 'built-ins' && !policy.builtins.includes(segments[2])) {
    return false;
  }

  if (
    segments[1] === 'language' &&
    policy.excludedLanguageDirectories.includes(segments[2])
  ) {
    return false;
  }

  if (info.hasFeatures || info.isModule) {
    return false;
  }

  return info.parsesAtEs5 && info.includesParseAtEs5;
}

/**
 * The exclusion that removes a path from the selection, or `null` if none does.
 * A `path` entry matches exactly; a `prefix` entry matches only on a directory
 * boundary, so `test/built-ins/Array/from` never swallows
 * `test/built-ins/Array/fromAsync`.
 *
 * @param {string} path
 * @param {readonly Es5Exclusion[]} exclusions
 * @returns {Es5Exclusion | null}
 */
export function matchExclusion(path, exclusions) {
  for (const exclusion of exclusions) {
    if (exclusion.path !== undefined) {
      if (exclusion.path === path) {
        return exclusion;
      }

      continue;
    }

    const prefix = /** @type {string} */ (exclusion.prefix);

    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return exclusion;
    }
  }

  return null;
}

/**
 * Whether a path is in the final selection: a structural candidate that no
 * exclusion removes.
 *
 * @param {string} path
 * @param {Es5CandidateInfo} info
 * @param {Es5SelectionPolicy} policy
 * @returns {boolean}
 */
export function isSelectedPath(path, info, policy) {
  return (
    isCandidatePath(path, info, policy) &&
    matchExclusion(path, policy.exclusions) === null
  );
}

/**
 * The subset group a path belongs to, derived from the first two directory
 * segments below `test/` (or the single segment for a shallow area such as
 * `harness`). Groups carry no execution semantics; they only let the baseline
 * report say which parts of the language the selection covers.
 *
 * @param {string} path
 * @returns {string}
 */
export function deriveGroupName(path) {
  const directories = path.split('/').slice(1, -1);

  if (directories.length === 0) {
    throw new Es5SelectionError(`${path} does not name a grouped test`);
  }

  return directories.length >= 2
    ? `${directories[0]}/${directories[1]}`
    : directories[0];
}

/**
 * A deterministic, non-empty summary for a derived group.
 *
 * @param {string} group
 * @returns {string}
 */
export function groupSummary(group) {
  return `Broad ES5.1 selection over test/${group}`;
}

/**
 * Groups and sorts selected paths into the existing upstream-subset shape.
 *
 * @param {{
 *   repository: string,
 *   revision: string,
 *   paths: readonly string[],
 * }} options
 * @returns {import('./upstream.js').Test262UpstreamSubset}
 */
export function buildUpstreamSubset(options) {
  /** @type {Map<string, string[]>} */
  const grouped = new Map();

  for (const path of options.paths) {
    const group = deriveGroupName(path);
    const existing = grouped.get(group);

    if (existing) {
      existing.push(path);
    } else {
      grouped.set(group, [path]);
    }
  }

  const groups = sortStrings([...grouped.keys()]).map((name) =>
    Object.freeze({
      name,
      summary: groupSummary(name),
      paths: Object.freeze(
        sortStrings(/** @type {string[]} */ (grouped.get(name))),
      ),
    }),
  );

  return Object.freeze({
    version: UPSTREAM_SUBSET_VERSION,
    repository: options.repository,
    revision: options.revision,
    groups: Object.freeze(groups),
  });
}

/**
 * Serializes a subset exactly as the checked-in manifest is written: a two-space
 * indented JSON document with a trailing newline, so a regeneration is a
 * byte-for-byte diff.
 *
 * The manifest is both regenerated (`test262:select:check` owns its bytes) and
 * format-checked (it is a tracked `tools/**\/*.json`). `JSON.stringify(…, 2)`
 * already matches Prettier everywhere except array wrapping: Prettier collapses
 * a JSON array onto one line when its flat form fits the print width. Mirroring
 * that for the `paths` arrays is what keeps those two contracts compatible.
 *
 * @param {import('./upstream.js').Test262UpstreamSubset} subset
 * @returns {string}
 */
export function serializeUpstreamSubset(subset) {
  const json = JSON.stringify(
    {
      version: subset.version,
      repository: subset.repository,
      revision: subset.revision,
      groups: subset.groups.map((group) => ({
        name: group.name,
        summary: group.summary,
        paths: [...group.paths],
      })),
    },
    null,
    2,
  );

  return `${inlineShortPathArrays(json)}\n`;
}

/**
 * The column width Prettier wraps at; matching it keeps the regenerated manifest
 * identical to what `prettier --check` expects.
 */
const PRINT_WIDTH = 80;

/**
 * Collapses each six-space-indented `"paths"` array whose one-line form fits the
 * print width onto a single line, exactly as Prettier renders JSON arrays, and
 * leaves the rest expanded one element per line as `JSON.stringify(…, 2)`
 * already emits them. `paths` is the last key of its group object, so the
 * inlined line ends at `]` with no trailing comma — the same shape Prettier
 * measures.
 *
 * @param {string} json
 * @returns {string}
 */
function inlineShortPathArrays(json) {
  return json.replace(
    / {6}"paths": \[\n(?: {8}"[^"\n]*",?\n)+ {6}\]/g,
    (block) => {
      const items = block
        .split('\n')
        .slice(1, -1)
        .map((line) => line.trim().replace(/,$/, ''));
      const inline = `      "paths": [${items.join(', ')}]`;

      return inline.length <= PRINT_WIDTH ? inline : block;
    },
  );
}

/**
 * @param {Record<string, unknown>} record
 * @param {readonly string[]} keys
 * @param {string} subject
 * @returns {void}
 */
function requireExactKeys(record, keys, subject) {
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) {
      throw new Es5SelectionError(`${subject} carries an unknown key: ${key}`);
    }
  }

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Es5SelectionError(`${subject} must declare ${key}`);
    }
  }
}

/**
 * @param {readonly string[]} values
 * @returns {boolean}
 */
function isSorted(values) {
  return values.join('\u0000') === sortStrings([...values]).join('\u0000');
}
