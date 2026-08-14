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
 * the tree, parses each file with the engine's own `parseScript`, reads the
 * known-good subset, and hands this module strings, booleans, and that path set.
 *
 * The policy expresses path-only structural filters as data — excluded
 * top-level directories, the allowed `test/built-ins/<name>` list, the excluded
 * `test/language/<dir>` list, and exact classified exclusions — plus a
 * `featureAreas` list that names, per directory prefix, exactly which Test262
 * `features:` tags the engine is willing to run there. Source-dependent
 * decisions ("source parses under the engine's supported grammar", "frontmatter
 * carries no `module` flag", and claimed feature tags) deliberately remain
 * separate, so a caller can eliminate impossible paths without reading them.
 *
 * `featureAreas` is what lets a post-ES5.1 feature the engine has actually
 * implemented earn coverage without reopening the whole tree. The
 * `expansionFeatures` boundary says which tags can add paths beyond the
 * known-good subset. A new tagged test is in scope only where an area covers its
 * path, claims every tag it declares, and the declaration includes at least one
 * expansion tag, so adding grammar support cannot silently pull in thousands of
 * untagged tests or unrelated tagged tests elsewhere in the tree.
 */

import { sortStrings } from './selection.js';
import { UPSTREAM_SUBSET_VERSION } from './upstream.js';

/** Repository-relative path to the policy, for messages and callers. */
export const ES5_SELECTION_FILE = 'tools/test262/es5-selection.json';

/** The only policy schema version this tooling understands. */
export const ES5_SELECTION_VERSION = 2;

/**
 * The exclusion categories the policy may use, and nothing else. Every
 * exclusion regardless of category must carry a non-empty `reason` (enforced
 * by `parseEs5Selection`). Two categories — `post-es5-syntax` and
 * `post-es5-builtin` — come from structural filters and coarse prefixes, so
 * their reasons need not cite a clause; the other three are expected to name
 * the ES5.1 clause or `docs/limitations.md` heading that justifies them —
 * this is enforced by human review. Only `engine-deviation` is also
 * machine-checked: `test/node/repository-invariants.test.js` verifies that
 * its reason references an anchor that exists in `docs/limitations.md`.
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
  'featureAreas',
  'expansionFeatures',
  'exclusions',
]);

const EXCLUSION_KEYS = Object.freeze(['path', 'prefix', 'category', 'reason']);

const FEATURE_AREA_KEYS = Object.freeze(['prefix', 'features', 'reason']);

const TEST_ROOT = 'test/';

/** Paths are never implicitly known-good when callers omit the baseline. */
const EMPTY_PREVIOUSLY_SELECTED = new Set();

/**
 * @typedef {{
 *   path?: string,
 *   prefix?: string,
 *   category: string,
 *   reason: string,
 * }} Es5Exclusion
 *
 * @typedef {{
 *   prefix: string,
 *   features: readonly string[],
 *   reason: string,
 * }} Es5FeatureArea
 *
 * @typedef {{
 *   version: number,
 *   excludedDirectories: readonly string[],
 *   builtins: readonly string[],
 *   excludedLanguageDirectories: readonly string[],
 *   featureAreas: readonly Es5FeatureArea[],
 *   expansionFeatures: readonly string[],
 *   exclusions: readonly Es5Exclusion[],
 * }} Es5SelectionPolicy
 *
 * @typedef {{
 *   declaresFeatures: boolean,
 *   features: readonly string[],
 *   isModule: boolean,
 *   parsesUnderEngineGrammar: boolean,
 *   includesParseUnderEngineGrammar: boolean,
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
  const featureAreas = parseFeatureAreas(record.featureAreas);
  const expansionFeatures = parseStringList(
    record.expansionFeatures,
    'expansionFeatures',
    { requireTestPrefix: false, allowEmpty: false },
  );
  const exclusions = parseExclusions(record.exclusions);

  rejectDeadFeatureAreas(featureAreas, exclusions);

  return Object.freeze({
    version: ES5_SELECTION_VERSION,
    excludedDirectories: Object.freeze(excludedDirectories),
    builtins: Object.freeze(builtins),
    excludedLanguageDirectories: Object.freeze(excludedLanguageDirectories),
    featureAreas: Object.freeze(featureAreas),
    expansionFeatures: Object.freeze(expansionFeatures),
    exclusions: Object.freeze(exclusions),
  });
}

/**
 * A prefix exclusion identical to a feature-area prefix makes the claim
 * unreachable: selection admits the tagged candidate and immediately removes
 * every file under it. Reject that contradiction while still allowing narrower
 * exclusions for individual unsupported tests inside an otherwise valid area.
 *
 * @param {readonly Es5FeatureArea[]} featureAreas
 * @param {readonly Es5Exclusion[]} exclusions
 * @returns {void}
 */
function rejectDeadFeatureAreas(featureAreas, exclusions) {
  const excludedPrefixes = new Set(
    exclusions
      .filter((exclusion) => exclusion.prefix !== undefined)
      .map((exclusion) => exclusion.prefix),
  );

  for (const area of featureAreas) {
    if (excludedPrefixes.has(area.prefix)) {
      throw new Es5SelectionError(
        `${ES5_SELECTION_FILE} feature area ${area.prefix} is hidden by an exclusion with the same prefix`,
      );
    }
  }
}

/**
 * Parses the `featureAreas` policy: the prefix-scoped claims that let a
 * feature-tagged test back into scope.
 *
 * @param {unknown} value
 * @returns {Es5FeatureArea[]}
 */
function parseFeatureAreas(value) {
  if (!Array.isArray(value)) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} featureAreas must be an array`,
    );
  }

  const areas = value.map((entry) => parseFeatureArea(entry));
  const prefixes = areas.map((area) => area.prefix);

  if (new Set(prefixes).size !== prefixes.length) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} featureAreas must not name the same prefix twice`,
    );
  }

  if (!isSorted(prefixes)) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} featureAreas must be sorted by prefix`,
    );
  }

  return areas;
}

/**
 * @param {unknown} entry
 * @returns {Es5FeatureArea}
 */
function parseFeatureArea(entry) {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} featureAreas entries must be objects`,
    );
  }

  const record = /** @type {Record<string, unknown>} */ (entry);

  requireExactKeys(
    record,
    FEATURE_AREA_KEYS,
    `${ES5_SELECTION_FILE} featureAreas entries`,
  );

  const { prefix } = record;

  if (typeof prefix !== 'string' || !prefix.startsWith(TEST_ROOT)) {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} featureAreas entries must name a prefix under test/`,
    );
  }

  const features = parseStringList(record.features, `featureAreas ${prefix}`, {
    requireTestPrefix: false,
    allowEmpty: false,
  });

  if (typeof record.reason !== 'string' || record.reason.trim() === '') {
    throw new Es5SelectionError(
      `${ES5_SELECTION_FILE} featureAreas entry ${prefix} must give a non-empty reason`,
    );
  }

  return Object.freeze({
    prefix,
    features: Object.freeze(features),
    reason: record.reason,
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
 * without a full YAML parse: which `features:` the frontmatter declares,
 * whether it carries the `module` flag, and which harness files it includes via
 * the flow-sequence form. Kept deliberately textual so it never throws on the
 * whole 53k-file tree the way a strict metadata parse can.
 *
 * `hasFeatures` and `features` answer two different questions on purpose.
 * Upstream writes most tags as a flow sequence (`features: [Symbol]`), which
 * this reads, but a couple of hundred files use block style
 * (`features:\n  - Symbol`), which it does not. Those report
 * `hasFeatures: true` with an empty `features`, so no claim can ever match
 * them and they keep the "excluded" answer they have always had: a tag this
 * scanner cannot read is a tag the policy must not silently allow.
 *
 * @param {string} source
 * @returns {{ hasFeatures: boolean, features: string[], isModule: boolean, includes: string[] }}
 */
export function scanFrontmatter(source) {
  const match = source.match(/\/\*---([\s\S]*?)---\*\//);
  const frontmatter = match ? match[1] : '';
  const flagsLine = frontmatter.match(/^flags:.*$/m);
  const includesMatch = frontmatter.match(/^includes:\s*\[(.*)\]/m);
  const featuresMatch = frontmatter.match(/^features:\s*\[(.*)\]/m);

  return {
    hasFeatures: /^features:/m.test(frontmatter),
    features: parseFlowSequence(featuresMatch),
    isModule: flagsLine ? /\bmodule\b/.test(flagsLine[0]) : false,
    includes: parseFlowSequence(includesMatch),
  };
}

/**
 * @param {RegExpMatchArray | null} match
 * @returns {string[]}
 */
function parseFlowSequence(match) {
  return match
    ? match[1]
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== '')
    : [];
}

/**
 * Whether a path can reach source-dependent selection. This gate must stay
 * metadata-free: callers use it before reading upstream test sources, while
 * `isCandidatePath` applies frontmatter, parser, and harness decisions later.
 *
 * @param {string} path Repository-relative upstream path, e.g. `test/built-ins/Array/x.js`.
 * @param {Es5SelectionPolicy} policy
 * @returns {boolean}
 */
export function isStructurallyEligiblePath(path, policy) {
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

  return matchExclusion(path, policy.exclusions) === null;
}

/**
 * Whether a path and its source-derived information survive the selection
 * policy. Every known-good path is retained after the structural guards below.
 * A path outside that baseline must declare at least one `expansionFeatures`
 * tag and must be fully claimed by a matching **feature area**
 * (`featureAreas` in the policy). Both halves matter. Requiring the expansion
 * tag keeps a grammar widening from dragging in newly parseable untagged tests
 * or unrelated tagged tests such as `Symbol.species`; requiring the prefix and
 * *every* declared tag keeps a test that also needs `cross-realm` or
 * `Symbol.matchAll` out. Every remaining file and harness include must parse
 * under the engine grammar.
 *
 * @param {string} path Repository-relative upstream path, e.g. `test/built-ins/Array/x.js`.
 * @param {Es5CandidateInfo} info
 * @param {Es5SelectionPolicy} policy
 * @param {ReadonlySet<string>} [previouslySelected] Known-good subset paths.
 * @returns {boolean}
 */
export function isCandidatePath(
  path,
  info,
  policy,
  previouslySelected = EMPTY_PREVIOUSLY_SELECTED,
) {
  if (!isStructurallyEligiblePath(path, policy)) {
    return false;
  }

  if (info.isModule) {
    return false;
  }

  if (!previouslySelected.has(path)) {
    if (
      !info.declaresFeatures ||
      !info.features.some((name) => policy.expansionFeatures.includes(name)) ||
      !isClaimedByFeatureArea(path, info, policy)
    ) {
      return false;
    }
  }

  return info.parsesUnderEngineGrammar && info.includesParseUnderEngineGrammar;
}

/**
 * Whether some feature area covers `path` and claims every tag the test
 * declares. The prefix match is on a directory boundary, exactly like an
 * exclusion prefix, so `test/built-ins/Symbol` never swallows a sibling
 * directory whose name merely starts the same way.
 *
 * @param {string} path
 * @param {Es5CandidateInfo} info
 * @param {Es5SelectionPolicy} policy
 * @returns {boolean}
 */
function isClaimedByFeatureArea(path, info, policy) {
  if (info.features.length === 0) {
    return false;
  }

  for (const area of policy.featureAreas) {
    if (path !== area.prefix && !path.startsWith(`${area.prefix}/`)) {
      continue;
    }

    if (info.features.every((name) => area.features.includes(name))) {
      return true;
    }
  }

  return false;
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
 * Whether a path is in the final selection.
 *
 * @param {string} path
 * @param {Es5CandidateInfo} info
 * @param {Es5SelectionPolicy} policy
 * @param {ReadonlySet<string>} [previouslySelected] Known-good subset paths.
 * @returns {boolean}
 */
export function isSelectedPath(
  path,
  info,
  policy,
  previouslySelected = EMPTY_PREVIOUSLY_SELECTED,
) {
  return isCandidatePath(path, info, policy, previouslySelected);
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
