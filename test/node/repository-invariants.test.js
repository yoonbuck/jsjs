/**
 * Node-only repository invariants.
 *
 * These are architecture checks rather than behaviour tests: they read the
 * project's own source text, so they need a filesystem and cannot run in the
 * browser or the `jsc` shell like the portable suites in `test/`. They exist to
 * fail loudly when a boundary that reviews have already established starts to
 * erode — an engine file reaching into `node_modules`, an adapter re-inventing
 * test selection, a vendored dependency drifting from its pin, or a test suite
 * that no runner registers.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from '../../vendor/acorn/acorn.mjs';
import { assertSame, assertThrows } from '../harness/assert.js';
import { checkVendoredDependencies } from '../../tools/vendor/sync.js';
import { UNICODE_VERSION } from '../../src/builtins/unicode-case-data.js';
import {
  ES5_SELECTION_FILE,
  EXCLUSION_CATEGORIES,
  parseEs5Selection,
} from '../../tools/test262/es5-selection.js';
import {
  UPSTREAM_SUBSET_FILE,
  parseUpstreamSubset,
} from '../../tools/test262/upstream.js';
import {
  FEATURES_MANIFEST_FILE,
  parseFeatureManifest,
} from '../../tools/test262/features.js';
import {
  ES2015_PROVENANCE_DECISION_CODES,
  ES2015_PROVENANCE_FILE,
} from '../../tools/test262/es2015-provenance.js';

const REPOSITORY_ROOT = new URL('../../', import.meta.url);
const REPOSITORY_ROOT_PATH = fileURLToPath(REPOSITORY_ROOT);
const ES2015_AUDIT_EVIDENCE_FILE = 'tools/test262/es2015-audit-evidence.json';
const ES2015_PROVENANCE_DECISIONS_DIRECTORY =
  'tools/test262/es2015-provenance-decisions';
const ES2015_WHOLE_TREE_PARTITIONS = Object.freeze([
  'annex-b',
  'core',
  'harness-validation',
  'later-or-non-es2015',
  'malformed',
  'unknown-edition',
]);
const ES2015_TAXONOMY_PHYSICAL_FIXTURES = Object.freeze({
  'test/language/malformed.js':
    'test/fixtures/es2015-taxonomy/test/language/malformed.js.txt',
});
const DOCUMENTATION_DEFERRED_SCRIPTS = new Set([
  'test262:es2015:provenance',
  'test262:es2015:provenance:check',
  'test262:es2015:provenance:ledger',
  'test262:es2015:audit',
  'test262:es2015:audit:check',
]);
const TRACKED_SUPERPOWERS_GIT_LS_FILES_FIXTURE =
  [
    'README.md',
    '.superpowers/sdd/example/report.md',
    'test/node/repository-invariants.test.js',
  ].join('\0') + '\0';
const TRACKED_SUPERPOWERS_GIT_LS_FILES_UNUSUAL_PATH =
  '.superpowers/sdd/example/spaced "quoted"\nreport.md';
const TRACKED_SUPERPOWERS_GIT_LS_FILES_UNUSUAL_FIXTURE =
  [
    'README.md',
    TRACKED_SUPERPOWERS_GIT_LS_FILES_UNUSUAL_PATH,
    'test/node/repository-invariants.test.js',
  ].join('\0') + '\0';

/** Matches `from '…'`, `import '…'`, and `import('…')` specifiers. */
const SPECIFIER_PATTERN = /\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

/**
 * @param {string} directory Repository-relative, with a trailing slash.
 * @param {(name: string) => boolean} predicate
 * @returns {Promise<string[]>}
 */
async function listFiles(directory, predicate) {
  const entries = await readdir(new URL(directory, REPOSITORY_ROOT), {
    withFileTypes: true,
  });
  /** @type {string[]} */
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...(await listFiles(`${directory}${entry.name}/`, predicate)));
    } else if (predicate(entry.name)) {
      files.push(`${directory}${entry.name}`);
    }
  }

  return files.sort();
}

/**
 * @param {string} file Repository-relative path.
 * @returns {Promise<string>}
 */
function readSource(file) {
  return readFile(new URL(file, REPOSITORY_ROOT), 'utf8');
}

/**
 * @param {string} source
 * @returns {string[]}
 */
function importSpecifiers(source) {
  return [...source.matchAll(SPECIFIER_PATTERN)].map((match) => match[1]);
}

/**
 * Quotes every RegExp metacharacter so a literal URL can be matched exactly.
 *
 * @param {string} literal
 * @returns {string}
 */
function escapeForRegExp(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when `code` *defines* `name` as a member rather than calling it.
 *
 * A definition is a class-body or object-literal method (`name(` at the start
 * of a line) or a prototype assignment (`.prototype.name =`). A call always
 * has a receiver expression in front of the dot, so it never starts a line
 * with the bare member name.
 *
 * @param {string} code Source with comments already stripped.
 * @param {string} name
 * @returns {boolean}
 */
function definesMember(code, name) {
  return (
    new RegExp(String.raw`^\s*${name}\s*\(`, 'mu').test(code) ||
    new RegExp(String.raw`\.prototype\.${name}\s*=`, 'u').test(code)
  );
}

/**
 * @param {string} directory
 * @returns {Promise<Map<string, string>>}
 */
async function readJavaScript(directory) {
  const files = await listFiles(directory, (name) => name.endsWith('.js'));
  /** @type {Map<string, string>} */
  const sources = new Map();

  for (const file of files) {
    sources.set(file, await readSource(file));
  }

  return sources;
}

/**
 * The trees `.prettierignore` is allowed to exclude, and why. Anything else
 * appearing in that file — `src/` above all — is a way of quietly shrinking
 * the format check back to a subset of the project, so the contract is an
 * exact table rather than a floor.
 */
const ALLOWED_FORMAT_EXCLUSIONS = Object.freeze({
  'node_modules/': 'installed dependencies, not project source',
  'vendor/': 'generated by tools/vendor/sync.js from the pinned dependencies',
  '.superpowers/': 'local working notes, not project source',
  'test/fixtures/':
    'Test262 fixtures are guest scripts, and some are deliberately unparseable',
  'package-lock.json': 'generated by npm, which owns its bytes',
  '.github/workflows/':
    'generated by tools/ci/pipeline.js, whose byte-for-byte output ci:check owns',
  'docs/test262-report.jsonl':
    'generated by npm run test262:upstream, whose JSON lines own their bytes',
  'tools/test262/es2015-provenance.json':
    'Generated immutable provenance foundation; canonical bytes are owned by the deterministic provenance generator/check.',
  'tools/test262/es2015-taxonomy.json':
    'generated by the pinned ES2015 audit, whose byte-for-byte output it owns',
  'tools/test262/es2015-promotion.json':
    'generated immutable promotion evidence, whose intentional formatting it owns',
});

const PROVENANCE_OWNERSHIP_REASON_FRAGMENT =
  'canonical bytes are owned by the deterministic provenance generator/check';
const REQUIRED_PROVENANCE_SCRIPT_COMMANDS = Object.freeze({
  'test262:es2015:provenance':
    'node tools/test262/es2015-provenance-check.js --initialize',
  'test262:es2015:provenance:check':
    'node tools/test262/es2015-provenance-check.js --check',
  'test262:es2015:provenance:ledger':
    'node tools/test262/es2015-provenance-check.js',
});
const U0_ALLOWED_CHANGED_PATHS = new Set([
  '.github/workflows/ci.yml',
  '.prettierignore',
  'docs/conformance.md',
  'docs/testing.md',
  'package.json',
  'test/node/es2015-provenance.test.js',
  'test/node/es2015-taxonomy.test.js',
  'test/node/repository-invariants.test.js',
  'test/node/workflow-contract.test.js',
  'test/run-node.js',
  'tools/ci/pipeline.js',
  'tools/test262/es2015-audit.js',
  'tools/test262/es2015-provenance-check.js',
  'tools/test262/es2015-provenance.js',
  'tools/test262/es2015-provenance.json',
  'tools/test262/es2015-taxonomy.js',
]);
/** @type {readonly FunctionOwnershipStep[]} */
const CHECK_FOUNDATION_OWNERSHIP_STEPS = Object.freeze([
  {
    type: 'binding-awaited-call',
    binding: 'actualManifestText',
    callee: 'readRequiredFile',
    argsPrefix: ['deps', 'ES2015_PROVENANCE_FILE'],
    label: 'manifest read',
  },
  {
    type: 'not-equal-guard',
    left: 'actualManifestText',
    right: 'expectedManifestText',
    label: 'manifest byte guard',
  },
  {
    type: 'binding-call',
    binding: 'manifest',
    callee: 'parseEs2015ProvenanceManifest',
    argsPrefix: ['actualManifestText'],
    label: 'manifest parse',
  },
  {
    type: 'call',
    callee: 'validateProvenanceFoundation',
    argsPrefix: ['manifest', 'classifications'],
    label: 'foundation validation',
  },
  {
    type: 'call',
    callee: 'validateDecisionFragments',
    argsPrefix: ['manifest', 'fragments'],
    label: 'decision fragment validation',
  },
]);
/** @type {readonly FunctionOwnershipStep[]} */
const LOAD_REVIEWED_MANIFEST_OWNERSHIP_STEPS = Object.freeze([
  {
    type: 'binding-awaited-call',
    binding: 'actualText',
    callee: 'readRequiredFile',
    argsPrefix: ['deps', 'ES2015_PROVENANCE_FILE'],
    label: 'manifest read',
  },
  {
    type: 'not-equal-guard',
    left: 'actualText',
    right: 'expectedText',
    label: 'manifest byte guard',
  },
  {
    type: 'binding-call',
    binding: 'manifest',
    callee: 'parseEs2015ProvenanceManifest',
    argsPrefix: ['actualText'],
    label: 'manifest parse',
  },
  {
    type: 'call',
    callee: 'validateProvenanceFoundation',
    argsPrefix: ['manifest', 'classifications'],
    label: 'foundation validation',
  },
]);

/**
 * Turns one Prettier CLI path argument into a matcher. Only the shapes this
 * project uses are supported: `.` for the whole repository, `dir/**\/*.ext`,
 * `dir/*.ext`, and literal paths.
 *
 * @param {string} pattern
 * @returns {RegExp}
 */
function patternToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '(?:[^/]+/)*')
    .replace(/\u0001/g, '.*');

  return new RegExp(`^${escaped}$`);
}

/**
 * @param {string} file Repository-relative path.
 * @param {string} entry A `.prettierignore` line.
 * @returns {boolean}
 */
function isExcludedBy(file, entry) {
  return entry.endsWith('/') ? file.startsWith(entry) : file === entry;
}

/**
 * Resolves the *authoritative* Prettier scope: the path arguments the
 * `format` script passes to Prettier, minus whatever `.prettierignore`
 * excludes. Deriving it from the real script and the real ignore file is
 * what makes the invariants below fail when engine sources are dropped from
 * the check, however that is done.
 *
 * @returns {Promise<{
 *   script: string,
 *   exclusions: string[],
 *   covers: (file: string) => boolean,
 * }>}
 */
async function readFormatScope() {
  const manifest = JSON.parse(await readSource('package.json'));
  const script = String(manifest.scripts?.format ?? '');
  const tokens = script.split(/\s+/).filter((token) => token.length > 0);

  if (tokens[0] !== 'prettier' || !tokens.includes('--check')) {
    throw new Error(`the format script must run prettier --check: ${script}`);
  }

  const patterns = tokens
    .slice(1)
    .filter((token) => !token.startsWith('-'))
    .map((token) => token.replace(/^['"]|['"]$/g, ''));
  const exclusions = (await readIgnoreFile())
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  const matchers = patterns.map((pattern) =>
    pattern === '.' ? /^/ : patternToRegExp(pattern),
  );

  return {
    script,
    exclusions,
    covers: (file) =>
      matchers.some((matcher) => matcher.test(file)) &&
      !exclusions.some((entry) => isExcludedBy(file, entry)),
  };
}

/**
 * @returns {Promise<string>}
 */
async function readIgnoreFile() {
  try {
    return await readSource('.prettierignore');
  } catch {
    return '';
  }
}

/**
 * @param {string} source
 * @returns {Map<string, string>}
 */
export function parseAnnotatedPrettierIgnore(source) {
  const entries = new Map();
  /** @type {string[]} */
  let pendingComments = [];

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) {
      pendingComments = [];
      continue;
    }
    if (line.startsWith('#')) {
      pendingComments.push(line.slice(1).trim());
      continue;
    }
    if (pendingComments.length === 0) {
      throw new Error(
        `Prettier ignore entry lacks an ownership comment: ${line}`,
      );
    }
    entries.set(line, pendingComments.join(' '));
    pendingComments = [];
  }

  return entries;
}

/**
 * @param {string} source
 * @param {readonly string[]} orderedTokens
 * @param {string} label
 * @returns {number[]}
 */
export function orderedSubstringOffsets(source, orderedTokens, label) {
  const normalizedSource = source.replace(/\s+/g, ' ');
  const offsets = [];
  let fromIndex = 0;

  for (const token of orderedTokens) {
    const normalizedToken = token.replace(/\s+/g, ' ');
    const offset = normalizedSource.indexOf(normalizedToken, fromIndex);
    if (offset < 0) {
      throw new Error(`${label} is missing required text: ${token}`);
    }
    offsets.push(offset);
    fromIndex = offset + normalizedToken.length;
  }

  return offsets;
}

/**
 * @typedef {{
 *   type: 'binding-awaited-call' | 'binding-call' | 'call' | 'not-equal-guard',
 *   label: string,
 *   binding?: string,
 *   callee?: string,
 *   argsPrefix?: readonly string[],
 *   left?: string,
 *   right?: string,
 * }} FunctionOwnershipStep
 */

/**
 * @param {string} source
 * @returns {any}
 */
function parseJavaScriptModule(source) {
  return parse(source, {
    ecmaVersion: 2020,
    sourceType: 'module',
  });
}

/**
 * @param {any} node
 * @returns {node is { type: string, start: number, end: number }}
 */
function isAstNode(node) {
  return (
    typeof node === 'object' &&
    node !== null &&
    typeof node.type === 'string' &&
    typeof node.start === 'number' &&
    typeof node.end === 'number'
  );
}

/**
 * @param {any} node
 * @returns {boolean}
 */
function isNestedFunctionNode(node) {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  );
}

/**
 * @param {string} source
 * @param {string} functionName
 * @returns {any}
 */
export function namedFunctionBody(source, functionName) {
  const program = parseJavaScriptModule(source);

  for (const statement of program.body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration'
        ? statement.declaration
        : statement;
    if (
      declaration?.type === 'FunctionDeclaration' &&
      declaration.id?.name === functionName
    ) {
      return declaration.body;
    }
  }

  throw new Error(`Missing function ${functionName}`);
}

/**
 * @param {any} node
 * @returns {any[]}
 */
function descendantNodesInSourceOrder(node) {
  /** @type {any[]} */
  const nodes = [];

  /**
   * @param {any} candidate
   * @param {boolean} [allowFunction]
   */
  function visit(candidate, allowFunction = false) {
    if (!isAstNode(candidate)) {
      return;
    }
    if (!allowFunction && isNestedFunctionNode(candidate)) {
      return;
    }
    nodes.push(candidate);
    for (const value of Object.values(candidate)) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          visit(entry);
        }
        continue;
      }
      visit(value);
    }
  }

  visit(node, true);
  nodes.sort((left, right) => left.start - right.start);
  return nodes;
}

/**
 * @param {any} node
 * @param {string} name
 * @returns {boolean}
 */
function isIdentifierNamed(node, name) {
  return node?.type === 'Identifier' && node.name === name;
}

/**
 * @param {any} node
 * @param {string} callee
 * @param {readonly string[]} [argsPrefix]
 * @returns {boolean}
 */
function matchesCall(node, callee, argsPrefix = []) {
  return (
    node?.type === 'CallExpression' &&
    isIdentifierNamed(node.callee, callee) &&
    node.arguments.length >= argsPrefix.length &&
    argsPrefix.every((name, index) =>
      isIdentifierNamed(node.arguments[index], name),
    )
  );
}

/**
 * @param {any} node
 * @param {FunctionOwnershipStep} step
 * @returns {boolean}
 */
function matchesOwnershipStep(node, step) {
  switch (step.type) {
    case 'binding-awaited-call':
      return (
        node?.type === 'VariableDeclarator' &&
        isIdentifierNamed(node.id, /** @type {string} */ (step.binding)) &&
        node.init?.type === 'AwaitExpression' &&
        matchesCall(
          node.init.argument,
          /** @type {string} */ (step.callee),
          step.argsPrefix,
        )
      );
    case 'binding-call':
      return (
        node?.type === 'VariableDeclarator' &&
        isIdentifierNamed(node.id, /** @type {string} */ (step.binding)) &&
        matchesCall(
          node.init,
          /** @type {string} */ (step.callee),
          step.argsPrefix,
        )
      );
    case 'call':
      return matchesCall(
        node,
        /** @type {string} */ (step.callee),
        step.argsPrefix,
      );
    case 'not-equal-guard':
      return (
        node?.type === 'IfStatement' &&
        node.test?.type === 'BinaryExpression' &&
        node.test.operator === '!==' &&
        isIdentifierNamed(node.test.left, /** @type {string} */ (step.left)) &&
        isIdentifierNamed(node.test.right, /** @type {string} */ (step.right))
      );
    default:
      return false;
  }
}

/**
 * @param {string} source
 * @param {string} functionName
 * @param {readonly FunctionOwnershipStep[]} orderedSteps
 * @param {string} label
 * @returns {number[]}
 */
export function orderedFunctionOwnershipOffsets(
  source,
  functionName,
  orderedSteps,
  label,
) {
  const nodes = descendantNodesInSourceOrder(
    namedFunctionBody(source, functionName),
  );
  const offsets = [];
  let fromIndex = 0;

  for (const step of orderedSteps) {
    const offset = nodes.findIndex(
      (node, index) => index >= fromIndex && matchesOwnershipStep(node, step),
    );
    if (offset < 0) {
      throw new Error(
        `${label} is missing required ${step.label} inside ${functionName}`,
      );
    }
    offsets.push(nodes[offset].start);
    fromIndex = offset + 1;
  }

  return offsets;
}

/**
 * @param {string} manifestText
 * @returns {Record<string, string>}
 */
export function readRequiredPackageScripts(manifestText) {
  const manifest = JSON.parse(manifestText);
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    Array.isArray(manifest)
  ) {
    throw new Error('package.json must be a JSON object');
  }
  const scripts = manifest.scripts;
  if (
    typeof scripts !== 'object' ||
    scripts === null ||
    Array.isArray(scripts)
  ) {
    throw new Error('package.json must define a scripts object');
  }
  /** @type {Record<string, string>} */
  const resolved = {};

  for (const [name, command] of Object.entries(
    REQUIRED_PROVENANCE_SCRIPT_COMMANDS,
  )) {
    if (scripts[name] !== command) {
      throw new Error(`${name} must be ${command}`);
    }
    resolved[name] = command;
  }

  return resolved;
}

/**
 * @typedef {{
 *   path: string,
 *   content?: string,
 *   status?: 'added' | 'modified' | 'deleted',
 * }} U0PathPolicyChange
 */

/**
 * @param {readonly U0PathPolicyChange[]} changes
 * @returns {string[]}
 */
export function u0NoProductionPathPolicyViolations(changes) {
  /** @type {string[]} */
  const violations = [];

  for (const change of changes) {
    const { path } = change;
    if (path.startsWith('src/')) {
      violations.push(`U0 path policy forbids production path: ${path}`);
      continue;
    }
    if (path === FEATURES_MANIFEST_FILE || path === UPSTREAM_SUBSET_FILE) {
      violations.push(
        `U0 path policy forbids selection-owned generated artifact: ${path}`,
      );
      continue;
    }
    if (path.startsWith(`${ES2015_PROVENANCE_DECISIONS_DIRECTORY}/`)) {
      let fragment;
      try {
        fragment = JSON.parse(change.content ?? '');
      } catch {
        violations.push(
          `U0 path policy requires an empty decision fragment: ${path}`,
        );
        continue;
      }
      if (
        !Array.isArray(fragment?.decisions) ||
        fragment.decisions.length !== 0
      ) {
        violations.push(
          `U0 path policy forbids non-empty provenance decisions: ${path}`,
        );
      }
      continue;
    }
    if (path.startsWith('.superpowers/') && change.status === 'deleted') {
      continue;
    }
    if (!U0_ALLOWED_CHANGED_PATHS.has(path)) {
      violations.push(`U0 path policy forbids unrelated path: ${path}`);
    }
  }

  return violations;
}

/**
 * @param {string} output Raw `git ls-files` stdout.
 * @returns {string[]}
 */
export function trackedSuperpowersPathsFromGitLsFilesOutput(output) {
  return output
    .split('\0')
    .filter((path) => path.length > 0 && path.startsWith('.superpowers/'));
}

/**
 * The files under `src/builtins/` and `src/runtime/` that sit *outside* the
 * "String built-ins never call a host String method" invariant, each with the
 * reason it is out of scope. Everything else in those two directories is in
 * scope by default, so a String source added later — under any filename — is
 * covered without anyone remembering to list it, and dropping a file out of
 * the invariant means adding a line here in a review-visible way.
 */
const HOST_STRING_INVARIANT_EXEMPTIONS = Object.freeze({
  'src/builtins/number-format.js':
    'Number formatting builds and slices its own host digit strings, which are engine-internal scratch, never guest String semantics',
});

/**
 * The Test262 upstream subset groups a milestone report depends on to say
 * which parts of the language it covers. `parseUpstreamSubset` only requires
 * *some* non-empty groups; it does not know any particular group's name is
 * load-bearing. Without this list, deleting, renaming, or emptying one of
 * these groups would still leave `tools/test262/upstream-subset.json`
 * well-formed and `npm run test262:upstream` green — just quieter, and
 * silently no longer measuring the family the docs/conformance.md milestone report
 * claims it does. Each entry names the milestone that pinned the group, so a
 * future milestone extends this list rather than guessing whether a group is
 * load-bearing.
 */
const REQUIRED_TEST262_GROUPS = Object.freeze({
  'built-ins/Array':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/Array',
  'built-ins/Boolean':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/Boolean',
  'built-ins/Error':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/Error',
  'built-ins/Function':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/Function',
  'built-ins/JSON':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/JSON',
  'built-ins/Math':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/Math',
  'built-ins/NativeErrors':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/NativeErrors',
  'built-ins/Number':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/Number',
  'built-ins/Object':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/Object',
  'built-ins/RegExp':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/RegExp',
  'built-ins/String':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/String',
  'built-ins/ThrowTypeError':
    'ES5 completion milestone (Task 4) — the %ThrowTypeError% intrinsic (a Task 5 DEFECT cluster lives here)',
  'built-ins/decodeURI':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/decodeURI',
  'built-ins/decodeURIComponent':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/decodeURIComponent',
  'built-ins/encodeURI':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/encodeURI',
  'built-ins/encodeURIComponent':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/encodeURIComponent',
  'built-ins/isFinite':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/isFinite',
  'built-ins/isNaN':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/isNaN',
  'built-ins/parseFloat':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/parseFloat',
  'built-ins/parseInt':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/built-ins/parseInt',
  'language/arguments-object':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/language/arguments-object',
  'language/eval-code':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/language/eval-code',
  'language/expressions':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/language/expressions',
  'language/function-code':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/language/function-code',
  'language/identifiers':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/language/identifiers (a Task 5 DEFECT cluster lives here)',
  'language/literals':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/language/literals',
  'language/statements':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/language/statements (Task 5 DEFECT clusters live here)',
  'language/types':
    'ES5 completion milestone (Task 4) — broad ES5.1 selection over test/language/types',
});

/** Reference documents that must exist under docs/ after reorganization. */
const REFERENCE_DOCS = Object.freeze([
  'docs/architecture.md',
  'docs/benchmarking.md',
  'docs/testing.md',
  'docs/conformance.md',
  'docs/limitations.md',
]);

/**
 * Returns the repository-relative file paths of the current-documentation
 * Markdown files: README.md plus any *.md files directly under docs/ that are
 * not inside the historical docs/superpowers/ subtree.
 *
 * @returns {Promise<string[]>}
 */
async function currentDocumentationFiles() {
  /** @type {string[]} */
  const files = ['README.md'];

  const entries = await readdir(new URL('docs/', REPOSITORY_ROOT), {
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (!entry.isDirectory() && entry.name.endsWith('.md')) {
      files.push(`docs/${entry.name}`);
    }
  }

  return files.sort();
}

/**
 * Extracts the repository-relative path of every local file referenced by a
 * Markdown link in `source`.  Anchor-only links and http(s) URLs are skipped.
 * The returned paths are resolved relative to `sourceFile`.
 *
 * @param {string} source Markdown source text.
 * @param {string} sourceFile Repository-relative path of the containing file.
 * @returns {string[]}
 */
function markdownLinkTargets(source, sourceFile) {
  const LINK_PATTERN = /\]\(([^)]+)\)/g;
  const sourceUrl = new URL(sourceFile, REPOSITORY_ROOT);
  /** @type {Set<string>} */
  const targets = new Set();

  for (const match of source.matchAll(LINK_PATTERN)) {
    const raw = match[1].trim();
    if (raw.startsWith('http://') || raw.startsWith('https://')) continue;
    if (raw.startsWith('#')) continue;
    const filePart = raw.split('#')[0];
    if (!filePart) continue;
    if (filePart.includes(' ')) continue;

    const resolved = new URL(filePart, sourceUrl);
    const rootPath = REPOSITORY_ROOT.pathname;
    if (resolved.pathname.startsWith(rootPath)) {
      targets.add(resolved.pathname.slice(rootPath.length));
    }
  }

  return [...targets];
}

/**
 * Extracts the script names from every `npm run <script>` occurrence in
 * `source`, de-duplicated and in order of first appearance.
 *
 * @param {string} source
 * @returns {string[]}
 */
function extractNpmRunCommands(source) {
  const normalized = source.replace(/\s+/g, ' ');
  const COMMAND_PATTERN = /\bnpm run ([\w:-]+)/g;
  const seen = new Set(
    [...normalized.matchAll(COMMAND_PATTERN)].map((m) => m[1]),
  );
  return [...seen];
}

/**
 * Extracts the raw Markdown table lines immediately following `heading`,
 * without interpreting other Markdown sections.
 *
 * @param {string} source
 * @param {string} heading
 * @returns {string[]}
 */
function markdownTableLinesUnderHeading(source, heading) {
  const lines = source.split('\n');
  const headingIndex = lines.findIndex(
    (line) => line.trim() === `## ${heading}`,
  );

  if (headingIndex < 0) {
    throw new Error(`Missing Markdown heading: ## ${heading}`);
  }

  /** @type {string[]} */
  const sectionLines = [];

  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^##\s+/.test(line)) {
      break;
    }

    sectionLines.push(line);
  }

  const tableLines = sectionLines.filter((line) => /^\|/.test(line));

  if (tableLines.length < 2) {
    throw new Error(`Missing Markdown table under heading: ## ${heading}`);
  }

  return tableLines;
}

/**
 * Extracts the first column from a Markdown table immediately following
 * `heading`, without interpreting other Markdown sections.
 *
 * @param {string} source
 * @param {string} heading
 * @returns {string[]}
 */
function markdownTableFirstColumnUnderHeading(source, heading) {
  return markdownTableLinesUnderHeading(source, heading)
    .slice(2)
    .map((line) => line.split('|')[1]?.trim() ?? '')
    .filter((cell) => cell.length > 0);
}

/**
 * Collects each Markdown table block that appears immediately after `label`,
 * skipping blank lines between the label and the table itself.
 *
 * @param {string} source
 * @param {string} label
 * @returns {string[][]}
 */
function markdownTablesAfterLabel(source, label) {
  const lines = source.split('\n');
  /** @type {string[][]} */
  const tables = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== label) {
      continue;
    }

    /** @type {string[]} */
    const table = [];

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];

      if (table.length === 0 && line.trim() === '') {
        continue;
      }

      if (!/^\|/.test(line)) {
        break;
      }

      table.push(line);
    }

    if (table.length > 0) {
      tables.push(table);
    }
  }

  return tables;
}

/**
 * Counts Markdown table cells by counting unescaped `|` separators.
 *
 * @param {string} row
 * @returns {number}
 */
function markdownTableCellCount(row) {
  let separators = 0;
  let backslashes = 0;

  for (const char of row) {
    if (char === '\\') {
      backslashes += 1;
      continue;
    }

    const escaped = backslashes % 2 === 1;
    backslashes = 0;

    if (char === '|' && !escaped) {
      separators += 1;
    }
  }

  return Math.max(0, separators - 1);
}

/**
 * @param {string} repoRelativePath
 * @returns {Promise<boolean>}
 */
async function fileExists(repoRelativePath) {
  try {
    await readFile(new URL(repoRelativePath, REPOSITORY_ROOT), 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts the set of GitHub-style heading anchor slugs from a Markdown source.
 * GitHub's algorithm: lower-case, strip everything that is not a letter, digit,
 * space, or hyphen, then replace spaces with hyphens.
 *
 * @param {string} source Markdown text.
 * @returns {Set<string>}
 */
function markdownHeadingAnchors(source) {
  const HEADING = /^#{1,6}\s+(.+)$/gm;
  /** @type {Set<string>} */
  const anchors = new Set();

  for (const match of source.matchAll(HEADING)) {
    const slug = match[1]
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N} -]/gu, '')
      .replace(/ /g, '-');
    anchors.add(slug);
  }

  return anchors;
}

export default [
  {
    name: 'trackedSuperpowersPathsFromGitLsFilesOutput finds tracked .superpowers paths in NUL-delimited git output',
    run: async () => {
      assertSame(
        JSON.stringify(
          trackedSuperpowersPathsFromGitLsFilesOutput(
            TRACKED_SUPERPOWERS_GIT_LS_FILES_FIXTURE,
          ),
        ),
        JSON.stringify(['.superpowers/sdd/example/report.md']),
        'the regression fixture must prove tracked .superpowers paths are rejected',
      );
    },
  },
  {
    name: 'trackedSuperpowersPathsFromGitLsFilesOutput detects unusual tracked .superpowers paths from raw git -z output',
    run: async () => {
      assertSame(
        JSON.stringify(
          trackedSuperpowersPathsFromGitLsFilesOutput(
            TRACKED_SUPERPOWERS_GIT_LS_FILES_UNUSUAL_FIXTURE,
          ),
        ),
        JSON.stringify([TRACKED_SUPERPOWERS_GIT_LS_FILES_UNUSUAL_PATH]),
        'NUL-delimited parsing must preserve unusual tracked .superpowers paths verbatim',
      );
    },
  },
  {
    name: 'git tracks no paths under .superpowers',
    run: async () => {
      const result = spawnSync(
        'git',
        ['ls-files', '-z', '--', '.superpowers'],
        {
          cwd: REPOSITORY_ROOT_PATH,
          encoding: 'utf8',
        },
      );

      if (result.error) {
        throw result.error;
      }

      assertSame(result.status, 0, result.stderr);
      assertSame(
        JSON.stringify(
          trackedSuperpowersPathsFromGitLsFilesOutput(result.stdout),
        ),
        '[]',
        'git must not report tracked paths under .superpowers/',
      );
    },
  },
  {
    name: 'parseAnnotatedPrettierIgnore rejects unowned entries',
    run: async () => {
      assertThrows(
        () =>
          parseAnnotatedPrettierIgnore(
            [
              '# owned entry',
              'tools/test262/es2015-provenance.json',
              '',
              'vendor/',
            ].join('\n'),
          ),
        Error,
      );
    },
  },
  {
    name: 'orderedSubstringOffsets rejects missing or out-of-order ownership steps',
    run: async () => {
      assertThrows(
        () =>
          orderedSubstringOffsets(
            'read -> compare -> validate',
            ['read', 'parse'],
            'fixture',
          ),
        Error,
      );
      assertThrows(
        () =>
          orderedSubstringOffsets(
            'parse -> read -> validate',
            ['read', 'parse'],
            'fixture',
          ),
        Error,
      );
    },
  },
  {
    name: 'orderedFunctionOwnershipOffsets accepts minimal positive provenance fixtures',
    run: async () => {
      assertSame(
        orderedFunctionOwnershipOffsets(
          [
            'async function checkFoundation(deps) {',
            '  const actualManifestText = await readRequiredFile(',
            '    deps,',
            '    ES2015_PROVENANCE_FILE,',
            '  );',
            '  if (actualManifestText !== expectedManifestText) {',
            "    throw new Error('drift');",
            '  }',
            '  const manifest = parseEs2015ProvenanceManifest(actualManifestText);',
            '  validateProvenanceFoundation(manifest, classifications);',
            '  validateDecisionFragments(manifest, fragments, {',
            '    allowPendingReview: false,',
            '  });',
            '}',
          ].join('\n'),
          'checkFoundation',
          CHECK_FOUNDATION_OWNERSHIP_STEPS,
          'fixture',
        ).length,
        CHECK_FOUNDATION_OWNERSHIP_STEPS.length,
      );
      assertSame(
        orderedFunctionOwnershipOffsets(
          [
            'async function loadReviewedManifest(deps) {',
            '  const actualText = await readRequiredFile(',
            '    deps,',
            '    ES2015_PROVENANCE_FILE,',
            '  );',
            '  if (actualText !== expectedText) {',
            "    throw new Error('drift');",
            '  }',
            '  const manifest = parseEs2015ProvenanceManifest(actualText);',
            '  validateProvenanceFoundation(manifest, classifications);',
            '  return manifest;',
            '}',
          ].join('\n'),
          'loadReviewedManifest',
          LOAD_REVIEWED_MANIFEST_OWNERSHIP_STEPS,
          'fixture',
        ).length,
        LOAD_REVIEWED_MANIFEST_OWNERSHIP_STEPS.length,
      );
    },
  },
  {
    name: 'orderedFunctionOwnershipOffsets rejects validations outside the target function body',
    run: async () => {
      assertThrows(
        () =>
          orderedFunctionOwnershipOffsets(
            [
              'async function checkFoundation(deps) {',
              '  const actualManifestText = await readRequiredFile(',
              '    deps,',
              '    ES2015_PROVENANCE_FILE,',
              '  );',
              '  if (actualManifestText !== expectedManifestText) {',
              "    throw new Error('drift');",
              '  }',
              '  const manifest = parseEs2015ProvenanceManifest(actualManifestText);',
              '}',
              'async function laterValidation(manifest, classifications, fragments) {',
              '  validateProvenanceFoundation(manifest, classifications);',
              '  validateDecisionFragments(manifest, fragments, {',
              '    allowPendingReview: false,',
              '  });',
              '}',
            ].join('\n'),
            'checkFoundation',
            CHECK_FOUNDATION_OWNERSHIP_STEPS,
            'fixture',
          ),
        Error,
      );
      assertThrows(
        () =>
          orderedFunctionOwnershipOffsets(
            [
              'async function loadReviewedManifest(deps) {',
              '  const actualText = await readRequiredFile(',
              '    deps,',
              '    ES2015_PROVENANCE_FILE,',
              '  );',
              '  if (actualText !== expectedText) {',
              "    throw new Error('drift');",
              '  }',
              '  const manifest = parseEs2015ProvenanceManifest(actualText);',
              '  return manifest;',
              '}',
              'function laterValidation(manifest, classifications) {',
              '  validateProvenanceFoundation(manifest, classifications);',
              '}',
            ].join('\n'),
            'loadReviewedManifest',
            LOAD_REVIEWED_MANIFEST_OWNERSHIP_STEPS,
            'fixture',
          ),
        Error,
      );
    },
  },
  {
    name: 'orderedFunctionOwnershipOffsets ignores comments and strings that mention validation calls',
    run: async () => {
      assertThrows(
        () =>
          orderedFunctionOwnershipOffsets(
            [
              'async function checkFoundation(deps) {',
              '  const actualManifestText = await readRequiredFile(',
              '    deps,',
              '    ES2015_PROVENANCE_FILE,',
              '  );',
              '  if (actualManifestText !== expectedManifestText) {',
              "    throw new Error('drift');",
              '  }',
              '  const manifest = parseEs2015ProvenanceManifest(actualManifestText);',
              '  // validateProvenanceFoundation(manifest, classifications);',
              "  const note = 'validateDecisionFragments(manifest, fragments, {})';",
              '}',
            ].join('\n'),
            'checkFoundation',
            CHECK_FOUNDATION_OWNERSHIP_STEPS,
            'fixture',
          ),
        Error,
      );
      assertThrows(
        () =>
          orderedFunctionOwnershipOffsets(
            [
              'async function loadReviewedManifest(deps) {',
              '  const actualText = await readRequiredFile(',
              '    deps,',
              '    ES2015_PROVENANCE_FILE,',
              '  );',
              '  if (actualText !== expectedText) {',
              "    throw new Error('drift');",
              '  }',
              "  const note = 'parseEs2015ProvenanceManifest(actualText)';",
              '  /* validateProvenanceFoundation(manifest, classifications); */',
              '  return manifest;',
              '}',
            ].join('\n'),
            'loadReviewedManifest',
            LOAD_REVIEWED_MANIFEST_OWNERSHIP_STEPS,
            'fixture',
          ),
        Error,
      );
    },
  },
  {
    name: 'readRequiredPackageScripts rejects missing or drifted provenance commands',
    run: async () => {
      assertThrows(
        () =>
          readRequiredPackageScripts(
            JSON.stringify({
              scripts: {
                'test262:es2015:provenance':
                  REQUIRED_PROVENANCE_SCRIPT_COMMANDS[
                    'test262:es2015:provenance'
                  ],
              },
            }),
          ),
        Error,
      );
      assertThrows(
        () =>
          readRequiredPackageScripts(
            JSON.stringify({
              scripts: {
                ...REQUIRED_PROVENANCE_SCRIPT_COMMANDS,
                'test262:es2015:provenance:ledger':
                  'node tools/test262/es2015-provenance-check.js --render-ledger=UA',
              },
            }),
          ),
        Error,
      );
    },
  },
  {
    name: 'the U0 path policy permits only explicit tooling, tests, docs, and empty decisions',
    run: async () => {
      /** @type {U0PathPolicyChange[]} */
      const allowedChanges = [
        { path: '.github/workflows/ci.yml' },
        { path: '.prettierignore' },
        { path: 'docs/conformance.md' },
        { path: 'docs/testing.md' },
        { path: 'package.json' },
        { path: 'test/node/es2015-provenance.test.js' },
        { path: 'test/node/es2015-taxonomy.test.js' },
        { path: 'test/node/repository-invariants.test.js' },
        { path: 'test/node/workflow-contract.test.js' },
        { path: 'test/run-node.js' },
        { path: 'tools/ci/pipeline.js' },
        { path: 'tools/test262/es2015-audit.js' },
        { path: 'tools/test262/es2015-provenance-check.js' },
        { path: 'tools/test262/es2015-provenance.js' },
        { path: 'tools/test262/es2015-provenance.json' },
        {
          path: 'tools/test262/es2015-provenance-decisions/UA.json',
          content: '{"decisions":[]}',
        },
        { path: 'tools/test262/es2015-taxonomy.js' },
        {
          path: '.superpowers/sdd/example/report.md',
          status: 'deleted',
        },
      ];

      assertSame(
        JSON.stringify(u0NoProductionPathPolicyViolations(allowedChanges)),
        '[]',
        'the positive U0 fixture must exercise the explicit allowed path policy',
      );

      const forbiddenFixtures = [
        {
          change: { path: 'src/runtime/object.js' },
          diagnostic:
            'U0 path policy forbids production path: src/runtime/object.js',
        },
        {
          change: { path: 'tools/test262/features.json' },
          diagnostic:
            'U0 path policy forbids selection-owned generated artifact: tools/test262/features.json',
        },
        {
          change: { path: 'tools/test262/upstream-subset.json' },
          diagnostic:
            'U0 path policy forbids selection-owned generated artifact: tools/test262/upstream-subset.json',
        },
        {
          change: {
            path: 'tools/test262/es2015-provenance-decisions/UA.json',
            content: '{"decisions":[{"path":"test/language/example.js"}]}',
          },
          diagnostic:
            'U0 path policy forbids non-empty provenance decisions: tools/test262/es2015-provenance-decisions/UA.json',
        },
      ];

      for (const fixture of forbiddenFixtures) {
        assertSame(
          JSON.stringify(u0NoProductionPathPolicyViolations([fixture.change])),
          JSON.stringify([fixture.diagnostic]),
          `the U0 policy must diagnose ${fixture.change.path} precisely`,
        );
      }
    },
  },
  {
    // The generated case data records the Unicode version it was built from.
    // If `package.json`'s pin moves without a regeneration (or the other way
    // round), every case mapping in the engine silently belongs to a
    // different Unicode release than the one the project claims. The portable
    // suite asserts the module's own constant; only this node-only check can
    // read the manifest, and it does so with `fs` rather than a JSON import
    // so the portable suites keep no dependency on import assertions.
    name: 'the generated Unicode case data matches the version pinned in package.json',
    run: async () => {
      const manifest = JSON.parse(await readSource('package.json'));
      const pin = manifest.unicode;

      assertSame(
        typeof pin?.version,
        'string',
        'package.json must pin a Unicode version',
      );
      assertSame(
        UNICODE_VERSION,
        pin.version,
        'src/builtins/unicode-case-data.js must be regenerated when the Unicode pin moves',
      );
      // The download URL carries the version too, so a half-updated pin is a
      // failure rather than a silent fetch of the wrong release.
      assertSame(
        String(pin.baseUrl).includes(`/${pin.version}/`),
        true,
        `the Unicode baseUrl must name the pinned version: ${pin.baseUrl}`,
      );
      assertSame(
        pin.generatedModule,
        'src/builtins/unicode-case-data.js',
        'the pin must name the module this check reads',
      );

      const generated = await readSource(pin.generatedModule);

      assertSame(
        generated.includes(pin.baseUrl),
        true,
        'the generated module header must record the pinned UCD base URL',
      );
      assertSame(
        generated.includes(`export const UNICODE_VERSION = '${pin.version}'`),
        true,
        'the generated module must export the pinned Unicode version',
      );

      // `npm run unicode:check` re-derives the tables from the UCD itself, so
      // it needs the network and cannot be a CI job. This is the offline half
      // of the same guarantee: every file the pin names must appear in the
      // header under the pinned base URL, with a well-formed sha256 digest
      // line, and the header must record *exactly* that set — no fewer, no
      // stale extras. Adding, removing, renaming, or repointing a source file
      // without regenerating therefore fails `npm run test:node`, with no
      // download and no UCD copy vendored into the repository. This is a
      // self-consistency check between the pin and the header shape, not a
      // content check: without a local copy of the UCD to hash, it cannot
      // confirm a recorded digest's *value* is the correct one for the file
      // it names.
      const files = pin.files;

      assertSame(
        typeof files === 'object' && files !== null,
        true,
        'package.json must pin the UCD file names',
      );
      assertSame(
        Object.keys(files).length > 0,
        true,
        'package.json must pin at least one UCD file',
      );

      for (const fileName of Object.values(files)) {
        const url = `${pin.baseUrl}${fileName}`;
        const digest = new RegExp(
          `${escapeForRegExp(url)}\\n \\* {5}sha256 [0-9a-f]{64}\\n`,
        );

        assertSame(
          digest.test(generated),
          true,
          `${pin.generatedModule}'s header must record ${url} with its sha256 digest; rerun npm run unicode:generate`,
        );
      }

      // The loop above only proves every *pinned* file is present; it does not
      // by itself prove nothing *else* is. A stale entry left behind by a
      // rename or a removed file — still digest-shaped, so it would satisfy
      // the pattern above for whichever file happens to still match — would
      // otherwise go unnoticed. Counting every digest-shaped header line and
      // requiring the count equal exactly the number of pinned files closes
      // that gap: it fails if the header carries more entries than the pin
      // does, exactly as it already fails if it carries fewer.
      const headerDigestLines =
        generated.match(/\n \* {5}sha256 [0-9a-f]{64}\n/g) ?? [];

      assertSame(
        headerDigestLines.length,
        Object.keys(files).length,
        `${pin.generatedModule}'s header must record exactly the ${
          Object.keys(files).length
        } UCD file(s) package.json pins — found ${
          headerDigestLines.length
        } digest entries; rerun npm run unicode:generate`,
      );
    },
  },
  {
    name: 'engine source never imports through node_modules',
    run: async () => {
      const sources = await readJavaScript('src/');
      /** @type {string[]} */
      const offenders = [];

      for (const [file, source] of sources) {
        for (const specifier of importSpecifiers(source)) {
          if (specifier.includes('node_modules')) {
            offenders.push(`${file} -> ${specifier}`);
          }
        }
      }

      assertSame(
        offenders.join('\n'),
        '',
        'src/ must not depend on an npm install layout; import the project-owned vendored build instead',
      );
      assertSame(sources.size > 0, true, 'src/ sources were found');
    },
  },
  {
    name: 'the parser dependency is named in exactly one engine file',
    run: async () => {
      const sources = await readJavaScript('src/');
      /** @type {string[]} */
      const namingFiles = [];

      for (const [file, source] of sources) {
        const namesVendor = importSpecifiers(source).some((specifier) =>
          specifier.includes('vendor/'),
        );

        if (namesVendor) {
          namingFiles.push(file);
        }
      }

      assertSame(namingFiles.join(','), 'src/parser-dependency.js');
    },
  },
  {
    name: 'test262 adapters contribute no selection policy',
    run: async () => {
      const sources = await readJavaScript('tools/test262/adapters/');
      /** @type {string[]} */
      const offenders = [];

      for (const [file, source] of sources) {
        for (const forbidden of [
          'JSON.parse',
          'manifest.json',
          'runTest262Suite',
          '.malformed',
          "'harness'",
        ]) {
          if (source.includes(forbidden)) {
            offenders.push(`${file} contains ${forbidden}`);
          }
        }
      }

      assertSame(
        offenders.join('\n'),
        '',
        'manifest parsing, selection, and defaults belong to tools/test262/selection.js',
      );
      assertSame(sources.size >= 4, true, 'adapter sources were found');
    },
  },
  {
    name: 'every test262 adapter that reads a manifest imports the shared selection module',
    run: async () => {
      const sources = await readJavaScript('tools/test262/adapters/');
      /** @type {string[]} */
      const offenders = [];

      for (const [file, source] of sources) {
        if (!source.includes('readManifest')) {
          continue;
        }

        if (!importSpecifiers(source).includes('../selection.js')) {
          offenders.push(file);
        }
      }

      assertSame(offenders.join(','), '');
    },
  },
  {
    name: 'every Test262 execution entry point uses the portable engine bridge',
    run: async () => {
      const expectedImports = new Map([
        ['tools/test262/adapters/node.js', '../engine.js'],
        ['tools/test262/adapters/jsc-run.js', '../engine.js'],
        ['tools/test262/upstream-run.js', './engine.js'],
        ['test/test262-async.test.js', '../tools/test262/engine.js'],
      ]);
      /** @type {string[]} */
      const violations = [];

      for (const [file, specifier] of expectedImports) {
        const source = await readSource(file);

        if (!importSpecifiers(source).includes(specifier)) {
          violations.push(`${file} does not import ${specifier}`);
        }
        if (!source.includes('createJsjsTest262Engine')) {
          violations.push(`${file} does not use createJsjsTest262Engine`);
        }
        if (
          file !== 'test/test262-async.test.js' &&
          importSpecifiers(source).some((entry) =>
            entry.includes('src/index.js'),
          )
        ) {
          violations.push(`${file} still assembles its own engine bridge`);
        }
      }

      assertSame(
        violations.join('\n'),
        '',
        'Test262 runners must share the realm-owned async engine bridge',
      );
    },
  },
  {
    // `parseUpstreamSubset` proves the manifest is well-formed; it has no
    // opinion on which named groups must exist. Without this check, deleting
    // or emptying one of the groups a milestone report names would still pass
    // schema validation and produce a green, merely smaller, `test262:upstream`
    // run — exactly the gap a milestone report's own claims must not have.
    name: 'every group a milestone report depends on still exists in the upstream subset',
    run: async () => {
      const subset = parseUpstreamSubset(
        await readSource(UPSTREAM_SUBSET_FILE),
      );
      const groupsByName = new Map(
        subset.groups.map((group) => [group.name, group]),
      );

      for (const [name, reason] of Object.entries(REQUIRED_TEST262_GROUPS)) {
        const group = groupsByName.get(name);

        assertSame(
          group !== undefined,
          true,
          `${UPSTREAM_SUBSET_FILE} must keep a "${name}" group (${reason}); it was removed or renamed`,
        );
        assertSame(
          (group?.paths.length ?? 0) > 0,
          true,
          `${UPSTREAM_SUBSET_FILE}'s "${name}" group must not be emptied (${reason})`,
        );
      }
    },
  },
  {
    // The coverage numbers docs/conformance.md publishes are generated into a marked
    // block and drift-checked against a fresh run. The exclusion tally is not:
    // it is prose a human wrote, describing how much of the upstream suite this
    // selection sets aside and why. Prose that quotes a count rots the moment
    // the policy changes, and a stale tally is worse than no tally, because it
    // reads as measured. Bind it to the policy file instead.
    name: 'the exclusion tally in docs/conformance.md matches the selection policy',
    run: async () => {
      const policy = parseEs5Selection(await readSource(ES5_SELECTION_FILE));
      const conformance = await readSource('docs/conformance.md');
      const counts = new Map(
        EXCLUSION_CATEGORIES.map((category) => [category, 0]),
      );

      for (const exclusion of policy.exclusions) {
        counts.set(
          exclusion.category,
          (counts.get(exclusion.category) ?? 0) + 1,
        );
      }

      for (const [category, count] of counts) {
        const row = new RegExp(
          String.raw`^\|\s*\x60${category}\x60\s*\|\s*(\d+)\s*\|`,
          'mu',
        ).exec(conformance);

        assertSame(
          row !== null,
          true,
          `docs/conformance.md must keep a tally row for the ${category} exclusion category`,
        );
        assertSame(
          Number(row?.[1]),
          count,
          `docs/conformance.md says ${String(row?.[1])} ${category} exclusions; ${ES5_SELECTION_FILE} has ${count}`,
        );
      }

      const total = policy.exclusions.length;

      assertSame(
        conformance.includes(`The ${total} classified exclusions`),
        true,
        `docs/conformance.md must report ${total} classified exclusions, the total in ${ES5_SELECTION_FILE}`,
      );
    },
  },
  {
    name: 'the vendored parser build matches the pinned dependency',
    run: async () => {
      const { problems } = await checkVendoredDependencies();

      assertSame(problems.join('\n'), '');
    },
  },
  {
    name: 'every portable suite is registered with the shared runners',
    run: async () => {
      const suites = await readSource('test/suites.js');
      const files = await listFiles('test/', (name) =>
        name.endsWith('.test.js'),
      );
      const portable = files.filter(
        (file) =>
          !file.startsWith('test/node/') && !file.startsWith('test/ci/'),
      );
      /** @type {string[]} */
      const unregistered = [];

      for (const file of portable) {
        if (!suites.includes(`'./${file.slice('test/'.length)}'`)) {
          unregistered.push(file);
        }
      }

      assertSame(unregistered.join(','), '');
      assertSame(portable.length > 0, true, 'portable suites were found');
    },
  },
  {
    name: 'every node-only suite is registered with the node runner',
    run: async () => {
      const runner = await readSource('test/run-node.js');
      const files = await listFiles('test/node/', (name) =>
        name.endsWith('.test.js'),
      );
      /** @type {string[]} */
      const unregistered = [];

      for (const file of files) {
        if (!runner.includes(`'./${file.slice('test/'.length)}'`)) {
          unregistered.push(file);
        }
      }

      assertSame(unregistered.join(','), '');
      assertSame(files.length > 0, true, 'node-only suites were found');
    },
  },
  {
    name: 'the local CI contract registers only its safe suite',
    run: async () => {
      const contractRunner = await readSource('test/run-ci-contract.js');
      const nodeRunner = await readSource('test/run-node.js');
      const portableRegistry = await readSource('test/suites.js');
      const files = await listFiles('test/ci/', (name) =>
        name.endsWith('.test.js'),
      );
      /** @type {string[]} */
      const missingSafeSuite = [];
      /** @type {string[]} */
      const leaked = [];

      for (const file of files) {
        const specifier = `'./${file.slice('test/'.length)}'`;

        if (
          file === 'test/ci/full-contract.test.js' &&
          !contractRunner.includes(specifier)
        ) {
          missingSafeSuite.push(file);
        }

        if (
          file !== 'test/ci/full-contract.test.js' &&
          contractRunner.includes(specifier)
        ) {
          leaked.push(`${file} is registered with npm run ci:contract`);
        }

        for (const [name, source] of [
          ['test/run-node.js', nodeRunner],
          ['test/suites.js', portableRegistry],
        ]) {
          if (importSpecifiers(source).includes(specifier.slice(1, -1))) {
            leaked.push(`${file} is imported by ${name}`);
          }
        }
      }

      assertSame(missingSafeSuite.join(','), '');
      assertSame(
        leaked.join('\n'),
        '',
        'npm run ci:contract must exclude CI-owned exact-pinned Test262 suites',
      );
      assertSame(files.length > 0, true, 'CI contract suites were found');
    },
  },
  {
    // The String built-ins must not implement guest semantics by calling the
    // host methods they are reimplementing. Behavioural tests cannot catch
    // this (host `String.prototype.charCodeAt`/`slice` return the *right*
    // answers), so the boundary is enforced against the source text: the
    // String family may read code units by index and length, and may use
    // exactly one host primitive -- `String.fromCharCode`, isolated in
    // `src/runtime/code-units.js`.
    name: 'the String built-ins never delegate to a host String.prototype method',
    run: async () => {
      // Scope by *directory*, not by filename: every `.js` file under
      // `src/builtins/` and `src/runtime/` is checked unless it appears in
      // the exemption table above with a reason. A String source added later
      // therefore cannot escape the invariant by being named something else.
      const candidates = [
        ...(await listFiles('src/builtins/', (name) => name.endsWith('.js'))),
        ...(await listFiles('src/runtime/', (name) => name.endsWith('.js'))),
      ].sort();
      const exempt = Object.keys(HOST_STRING_INVARIANT_EXEMPTIONS);
      const stale = exempt.filter((file) => !candidates.includes(file));
      const files = candidates.filter((file) => !exempt.includes(file));

      assertSame(
        stale.join('\n'),
        '',
        'an exemption names a file that no longer exists; delete the entry',
      );
      assertSame(
        files.includes('src/builtins/primitive-wrappers.js') &&
          files.includes('src/builtins/string-pattern.js') &&
          files.includes('src/runtime/code-units.js'),
        true,
        'the String built-in sources must be inside the invariant',
      );
      assertSame(files.length > 5, true, 'engine sources were found');
      const hostMethodCall =
        /\.(charAt|charCodeAt|codePointAt|concat|slice|substring|substr|indexOf|lastIndexOf|split|replace|search|match|trim|toLowerCase|toUpperCase|toLocaleLowerCase|toLocaleUpperCase|localeCompare|repeat|padStart|padEnd|startsWith|endsWith|includes|normalize)\s*\(/g;
      /** @type {string[]} */
      const offenders = [];
      /** @type {string[]} */
      const hostConstructors = [];

      for (const file of files) {
        const source = await readSource(file);
        const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

        for (const match of code.matchAll(hostMethodCall)) {
          offenders.push(`${file} calls .${match[1]}()`);
        }

        if (code.includes('String.prototype')) {
          offenders.push(`${file} names String.prototype in code`);
        }

        hostConstructors.push(
          ...(code.match(/String\.fromCharCode\s*\(/g) ?? []).map(() => file),
        );
      }

      assertSame(
        offenders.join('\n'),
        '',
        'the String built-ins must own their code-unit reads instead of calling host String methods',
      );
      assertSame(
        hostConstructors.join(','),
        'src/runtime/code-units.js',
        'the number -> code-unit host primitive must stay isolated in src/runtime/code-units.js, used exactly once',
      );
    },
  },
  {
    // Regular expressions are the second (and only other) place this engine
    // deliberately borrows a host primitive instead of reimplementing it:
    // `regexp-compat.js` compiles a validated ES5 pattern into a host regex
    // rather than shipping a hand-written backtracking matcher. That
    // borrowing must stay isolated to that one file for guest-visible
    // regular expression semantics -- everywhere else, a reference to the
    // host `RegExp` constructor would either bypass `regexp-syntax.js`'s
    // grammar validation or silently reintroduce a second, divergent regex
    // dialect. (Engine-internal host regex literals, such as the numeric
    // recognisers in `conversion.js`'s `ToNumber`, are not guest-visible
    // and are outside this invariant's scope.)
    name: 'the host RegExp constructor must stay isolated in src/runtime/regexp-compat.js',
    run: async () => {
      const files = await listFiles('src/', (name) => name.endsWith('.js'));
      const hostRegExpConstructorCall = /(?:^|[^A-Za-z0-9_$])RegExp\s*\(/g;
      /** @type {string[]} */
      const matches = [];

      for (const file of files) {
        const source = await readSource(file);
        const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

        if (hostRegExpConstructorCall.test(code)) {
          matches.push(file);
        }

        hostRegExpConstructorCall.lastIndex = 0;
      }

      assertSame(files.length > 5, true, 'engine sources were found');
      assertSame(
        matches.join(','),
        'src/runtime/regexp-compat.js',
        'the host RegExp constructor must stay isolated in src/runtime/regexp-compat.js, used exactly once',
      );
    },
  },
  {
    // `EngineObject#getOwnProperty` copies the stored descriptor;
    // `EngineObject#_peekOwnDescriptor` returns it raw, and the hot paths
    // (`getProperty`, `canPut`, `put`, `defineOwnProperty`, `delete`,
    // `enumerableKeysForIn`) read through the raw one. That makes the two a
    // single protocol with two entry points: a class that synthesises or
    // rewrites own properties in `getOwnProperty` and does not do the same in
    // `_peekOwnDescriptor` would answer one way to `Object.getOwnPropertyDescriptor`
    // and another way to a plain property read -- a split that no behavioural
    // test is guaranteed to notice, because it only shows up for whichever
    // virtual properties that subclass happens to invent.
    //
    // The rule is therefore enforced against the source text, in both
    // directions, over every engine file: define one of the pair and you must
    // define the other. `src/runtime/object.js` declares the protocol and
    // defines both, so it satisfies the invariant rather than needing an
    // exemption from it.
    name: 'every class that overrides getOwnProperty also overrides _peekOwnDescriptor',
    run: async () => {
      const files = await listFiles('src/', (name) => name.endsWith('.js'));
      /** @type {string[]} */
      const definesGetOwnProperty = [];
      /** @type {string[]} */
      const definesPeek = [];

      for (const file of files) {
        const source = await readSource(file);
        const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

        if (definesMember(code, 'getOwnProperty')) {
          definesGetOwnProperty.push(file);
        }

        if (definesMember(code, '_peekOwnDescriptor')) {
          definesPeek.push(file);
        }
      }

      assertSame(files.length > 5, true, 'engine sources were found');
      assertSame(
        definesGetOwnProperty.includes('src/runtime/object.js') &&
          definesGetOwnProperty.includes('src/runtime/function-object.js') &&
          definesGetOwnProperty.includes('src/runtime/primitive-object.js'),
        true,
        `the known getOwnProperty definitions must be detected, found: ${definesGetOwnProperty.join(', ')}`,
      );
      assertSame(
        definesGetOwnProperty
          .filter((file) => !definesPeek.includes(file))
          .join('\n'),
        '',
        'a class that overrides getOwnProperty must also override _peekOwnDescriptor, or the raw-descriptor hot paths will disagree with it',
      );
      assertSame(
        definesPeek
          .filter((file) => !definesGetOwnProperty.includes(file))
          .join('\n'),
        '',
        'a class that overrides _peekOwnDescriptor must also override getOwnProperty, or Object.getOwnPropertyDescriptor will disagree with a plain property read',
      );
    },
  },
  {
    name: 'every engine source file is inside the Prettier check scope',
    run: async () => {
      const scope = await readFormatScope();
      const files = await listFiles('src/', (name) => name.endsWith('.js'));
      const outside = files.filter((file) => !scope.covers(file));

      assertSame(
        outside.join('\n'),
        '',
        `engine sources are outside the format scope: ${scope.script}`,
      );
      assertSame(files.length > 0, true, 'engine sources were found');
    },
  },
  {
    name: 'every checked-in source, tool, test, and documentation file is inside the Prettier check scope',
    run: async () => {
      const scope = await readFormatScope();
      const files = [
        ...(await listFiles(
          'src/',
          (name) => name.endsWith('.js') || name.endsWith('.json'),
        )),
        ...(await listFiles('test/', (name) => name.endsWith('.js'))),
        ...(await listFiles(
          'tools/',
          (name) => name.endsWith('.js') || name.endsWith('.json'),
        )),
        ...(await listFiles('types/', (name) => name.endsWith('.d.ts'))),
        ...(await listFiles('docs/', (name) => name.endsWith('.md'))),
        'package.json',
        'jsconfig.json',
        'eslint.config.js',
        '.prettierrc.json',
        'README.md',
      ];
      const outside = files.filter(
        (file) =>
          !file.startsWith('test/fixtures/') &&
          !Object.prototype.hasOwnProperty.call(
            ALLOWED_FORMAT_EXCLUSIONS,
            file,
          ) &&
          !scope.covers(file),
      );

      assertSame(
        outside.join('\n'),
        '',
        `these files are outside the format scope: ${scope.script}`,
      );
    },
  },
  {
    name: 'the Prettier ignore file excludes only generated or guest-owned trees',
    run: async () => {
      const { exclusions } = await readFormatScope();
      const allowed = Object.keys(ALLOWED_FORMAT_EXCLUSIONS);
      const unexpected = exclusions.filter((entry) => !allowed.includes(entry));

      assertSame(
        unexpected.join('\n'),
        '',
        'only generated or guest-owned trees may sit outside the format check',
      );
      assertSame(
        [...exclusions].sort().join(','),
        [...allowed].sort().join(','),
        'the ignore file and the documented exclusions must stay in step',
      );
    },
  },
  {
    name: 'the generated provenance manifest is the only Prettier-excluded provenance artifact',
    run: async () => {
      const exclusions = parseAnnotatedPrettierIgnore(await readIgnoreFile());
      const manifestReason = exclusions.get(ES2015_PROVENANCE_FILE);
      const provenanceExclusions = [...exclusions.keys()].filter((entry) =>
        entry.startsWith('tools/test262/es2015-provenance'),
      );

      assertSame(
        manifestReason?.includes(PROVENANCE_OWNERSHIP_REASON_FRAGMENT),
        true,
        `${ES2015_PROVENANCE_FILE} must explain that its canonical bytes are owned by the deterministic provenance generator/check`,
      );
      assertSame(
        manifestReason,
        ALLOWED_FORMAT_EXCLUSIONS[ES2015_PROVENANCE_FILE],
        'the repository invariant table must document the same generated ownership rationale as .prettierignore',
      );
      assertSame(
        JSON.stringify(provenanceExclusions),
        JSON.stringify([ES2015_PROVENANCE_FILE]),
        'only the generated provenance manifest may sit outside the Prettier scope',
      );
    },
  },
  {
    name: 'no provenance hand-authored JavaScript or decision fragment path is excluded from Prettier',
    run: async () => {
      const { exclusions } = await readFormatScope();
      const provenanceJavaScriptFiles = (
        await listFiles('tools/test262/', (name) =>
          /^es2015-provenance.*\.js$/u.test(name),
        )
      ).filter((file) => file !== ES2015_PROVENANCE_FILE);
      const decisionFragmentFiles = ES2015_PROVENANCE_DECISION_CODES.map(
        (code) => `${ES2015_PROVENANCE_DECISIONS_DIRECTORY}/${code}.json`,
      );
      const excludedJavaScript = provenanceJavaScriptFiles.filter((file) =>
        exclusions.includes(file),
      );
      const excludedDecisionEntries = [
        ...exclusions.filter(
          (entry) =>
            entry === ES2015_PROVENANCE_DECISIONS_DIRECTORY ||
            entry.startsWith(`${ES2015_PROVENANCE_DECISIONS_DIRECTORY}/`),
        ),
        ...decisionFragmentFiles.filter((file) => exclusions.includes(file)),
      ];
      const uniqueExcludedDecisionEntries = [
        ...new Set(excludedDecisionEntries),
      ];

      assertSame(
        JSON.stringify(decisionFragmentFiles).includes('/UA.json'),
        true,
        'the regression fixture must enumerate real provenance decision fragments',
      );

      assertSame(
        excludedJavaScript.join('\n'),
        '',
        'hand-authored provenance JavaScript must remain inside repository-wide Prettier ownership',
      );
      assertSame(
        uniqueExcludedDecisionEntries.join('\n'),
        '',
        'reviewed provenance decision fragments must remain inside repository-wide Prettier ownership',
      );
    },
  },
  {
    // The reorganization plan creates four authoritative reference files.
    // This test fails until Tasks 2–4 create those files.
    name: 'the four reference documentation files exist under docs/',
    run: async () => {
      for (const doc of REFERENCE_DOCS) {
        assertSame(
          await fileExists(doc),
          true,
          `${doc} must exist; run the documentation reorganization tasks`,
        );
      }
    },
  },
  {
    // Every relative link that appears in a current-documentation Markdown
    // file must point to an existing file in the repository.  External http(s)
    // URLs and same-page anchors are out of scope.  Historical files under
    // docs/superpowers/ are project records, not current documentation, so
    // they are excluded from both the source scan and the target allowlist.
    name: 'every local Markdown link in current documentation resolves to an existing file',
    run: async () => {
      const docFiles = await currentDocumentationFiles();
      /** @type {string[]} */
      const broken = [];

      for (const docFile of docFiles) {
        const source = await readSource(docFile);

        for (const target of markdownLinkTargets(source, docFile)) {
          if (!(await fileExists(target))) {
            broken.push(`${docFile} -> ${target}`);
          }
        }
      }

      assertSame(
        broken.join('\n'),
        '',
        'broken local links in current documentation',
      );

      const EXPECTED_DOC_FILES = [
        'README.md',
        'docs/architecture.md',
        'docs/benchmarking.md',
        'docs/conformance.md',
        'docs/limitations.md',
        'docs/testing.md',
      ];
      const missing = EXPECTED_DOC_FILES.filter((f) => !docFiles.includes(f));
      assertSame(
        missing.join('\n'),
        '',
        'expected documentation files are present in the scanned set',
      );
    },
  },
  {
    // Every `npm run <script>` command that appears in a current-documentation
    // Markdown file must name a script that exists in package.json.  Stale
    // command references in README or the reference docs would send readers to
    // a command that no longer works.  Historical files under docs/superpowers/
    // are excluded — they may reference commands from earlier iterations of the
    // project.
    name: 'every npm run command in current documentation refers to an existing script',
    run: async () => {
      assertSame(
        JSON.stringify(extractNpmRunCommands('npm run test262:es2015-release')),
        JSON.stringify(['test262:es2015-release']),
        'npm run extraction preserves hyphenated script names',
      );

      const manifest = JSON.parse(await readSource('package.json'));
      const scripts = new Set(Object.keys(manifest.scripts ?? {}));
      const docFiles = await currentDocumentationFiles();
      /** @type {string[]} */
      const unknown = [];

      for (const docFile of docFiles) {
        const source = await readSource(docFile);

        for (const command of extractNpmRunCommands(source)) {
          if (!scripts.has(command)) {
            unknown.push(`${docFile}: npm run ${command}`);
          }
        }
      }

      assertSame(
        unknown.join('\n'),
        '',
        'current documentation references npm scripts that do not exist in package.json',
      );

      // Guard: at least some npm run commands were actually extracted.
      const allCommands = [];
      for (const docFile of docFiles) {
        const source = await readSource(docFile);
        allCommands.push(...extractNpmRunCommands(source));
      }
      assertSame(
        allCommands.length > 0,
        true,
        'at least one npm run command was extracted from documentation',
      );
    },
  },
  {
    // Every engine-deviation exclusion must reference a heading anchor in
    // docs/limitations.md, so the reason text never drifts from a real section.
    name: 'every engine-deviation exclusion references a heading that exists in docs/limitations.md',
    run: async () => {
      const policy = parseEs5Selection(await readSource(ES5_SELECTION_FILE));
      const limSource = await readSource('docs/limitations.md');
      const anchors = markdownHeadingAnchors(limSource);
      /** @type {string[]} */
      const broken = [];

      for (const exclusion of policy.exclusions) {
        if (exclusion.category !== 'engine-deviation') continue;

        // Extract the anchor reference from the reason text.
        // Reasons should contain a Markdown-style anchor reference like:
        //   [Annex B pattern syntax is rejected](docs/limitations.md#annex-b-pattern-syntax-is-rejected)
        // or at minimum name the heading.
        const anchorMatch = /docs\/limitations\.md#([\w-]+)/.exec(
          exclusion.reason,
        );

        if (!anchorMatch) {
          broken.push(
            `exclusion for ${exclusion.path ?? exclusion.prefix} does not reference docs/limitations.md#<anchor>`,
          );
          continue;
        }

        const anchor = anchorMatch[1];
        if (!anchors.has(anchor)) {
          broken.push(
            `exclusion for ${exclusion.path ?? exclusion.prefix} references #${anchor} which does not exist in docs/limitations.md`,
          );
        }
      }

      assertSame(
        broken.join('\n'),
        '',
        'engine-deviation exclusion reasons must reference real headings in docs/limitations.md',
      );
    },
  },
  {
    // README must not hold authoritative deviation or limitation tables; those
    // belong in docs/limitations.md after the documentation reorganization.
    name: 'README does not contain authoritative deviation or limitation tables',
    run: async () => {
      const readme = await readSource('README.md');
      assertSame(
        /^#{1,6}\s+Intentional deviations/m.test(readme),
        false,
        'README must not contain an "Intentional deviations" heading; move it to docs/limitations.md',
      );
      assertSame(
        /^#{1,6}\s+Known limitations/m.test(readme),
        false,
        'README must not contain a "Known limitations" heading; move it to docs/limitations.md',
      );
    },
  },
  {
    name: 'portable suites do not import Node builtins',
    run: async () => {
      const suitesSource = await readSource('test/suites.js');
      const suiteSpecifiers = importSpecifiers(suitesSource).filter((s) =>
        s.startsWith('./'),
      );
      const suiteFiles = suiteSpecifiers.map(
        (s) => `test/${s.replace(/^\.\//, '')}`,
      );

      const NODE_BUILTIN_PREFIXES = ['node:'];
      const BARE_BUILTINS = new Set([
        'assert',
        'buffer',
        'child_process',
        'cluster',
        'crypto',
        'dgram',
        'dns',
        'events',
        'fs',
        'http',
        'http2',
        'https',
        'net',
        'os',
        'path',
        'perf_hooks',
        'querystring',
        'readline',
        'repl',
        'stream',
        'string_decoder',
        'tls',
        'tty',
        'url',
        'util',
        'v8',
        'vm',
        'worker_threads',
        'zlib',
      ]);

      /**
       * @param {string} specifier
       * @returns {boolean}
       */
      function isNodeBuiltin(specifier) {
        if (NODE_BUILTIN_PREFIXES.some((p) => specifier.startsWith(p))) {
          return true;
        }
        return BARE_BUILTINS.has(specifier);
      }

      /** Matches static `from '…'` and `import '…'` specifiers, not dynamic `import('…')`. */
      const STATIC_SPECIFIER =
        /\b(?:from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"])/g;

      /**
       * @param {string} source
       * @returns {string[]}
       */
      function staticImportSpecifiers(source) {
        return [...source.matchAll(STATIC_SPECIFIER)].map(
          (match) => match[1] ?? match[2],
        );
      }

      /** @type {string[]} */
      const violations = [];
      /** @type {Set<string>} */
      const visited = new Set();

      /**
       * @param {string} file Repository-relative path.
       * @returns {Promise<void>}
       */
      async function walk(file) {
        if (visited.has(file)) return;
        visited.add(file);

        /** @type {string} */
        let source;
        try {
          source = await readSource(file);
        } catch {
          return;
        }

        const specifiers = staticImportSpecifiers(source);
        for (const specifier of specifiers) {
          if (isNodeBuiltin(specifier)) {
            violations.push(`${file} imports ${specifier}`);
            continue;
          }
          if (specifier.startsWith('.')) {
            const base = new URL(file, 'file:///repo/');
            const target = new URL(specifier, base);
            const resolved = target.pathname.slice('/repo/'.length);
            await walk(resolved);
          }
        }
      }

      for (const suiteFile of suiteFiles) {
        await walk(suiteFile);
      }

      assertSame(
        violations.join('\n'),
        '',
        `portable suites must not import Node builtins (directly or transitively):\n${violations.join('\n')}`,
      );
    },
  },
  {
    // Every script defined in package.json must appear in docs/testing.md's
    // command documentation, so the "full command list" claim in README is true.
    name: 'every package.json script is documented in docs/testing.md',
    run: async () => {
      const manifest = JSON.parse(await readSource('package.json'));
      const scripts = Object.keys(manifest.scripts ?? {}).filter(
        (script) => !DOCUMENTATION_DEFERRED_SCRIPTS.has(script),
      );
      const testingDoc = await readSource('docs/testing.md');
      /** @type {string[]} */
      const missing = [];

      for (const script of scripts) {
        // Match the backtick-delimited span `npm run <script>` (or `npm test`)
        const command = script === 'test' ? 'npm test' : `npm run ${script}`;
        if (!testingDoc.includes(`\`${command}\``)) {
          missing.push(script);
        }
      }

      assertSame(
        missing.join('\n'),
        '',
        `package.json scripts missing from docs/testing.md: ${missing.join(', ')}`,
      );
    },
  },
  {
    name: 'the ES2015 malformed fixture keeps its Test262 path while using a text physical fixture',
    run: async () => {
      const [logicalPath, physicalPath] = Object.entries(
        ES2015_TAXONOMY_PHYSICAL_FIXTURES,
      )[0];
      const fixtureFiles = await listFiles(
        'test/fixtures/es2015-taxonomy/',
        (name) => name.endsWith('.js') || name.endsWith('.js.txt'),
      );

      assertSame(logicalPath, 'test/language/malformed.js');
      assertSame(
        physicalPath,
        'test/fixtures/es2015-taxonomy/test/language/malformed.js.txt',
      );
      assertSame(fixtureFiles.includes(physicalPath), true);
      assertSame(
        fixtureFiles.includes(
          'test/fixtures/es2015-taxonomy/test/language/malformed.js',
        ),
        false,
      );
      assertSame(
        await readSource(physicalPath),
        '/*---\ndescription: Missing terminator.\n',
      );
    },
  },
  {
    name: 'package.json exposes the provenance generator, check, and ledger scripts',
    run: async () => {
      const scripts = readRequiredPackageScripts(
        await readSource('package.json'),
      );

      assertSame(
        JSON.stringify(scripts),
        JSON.stringify(REQUIRED_PROVENANCE_SCRIPT_COMMANDS),
        'package.json must expose the exact provenance generator/check script contracts',
      );
      assertSame(
        scripts['test262:es2015:provenance:ledger'].includes(
          '--render-ledger=',
        ),
        false,
        'the provenance ledger script must leave the decision code to the caller',
      );
    },
  },
  {
    name: 'the provenance check source reads and validates the generated manifest before using it',
    run: async () => {
      const source = await readSource(
        'tools/test262/es2015-provenance-check.js',
      );

      orderedFunctionOwnershipOffsets(
        source,
        'checkFoundation',
        CHECK_FOUNDATION_OWNERSHIP_STEPS,
        'checkFoundation',
      );
      orderedFunctionOwnershipOffsets(
        source,
        'loadReviewedManifest',
        LOAD_REVIEWED_MANIFEST_OWNERSHIP_STEPS,
        'loadReviewedManifest',
      );
    },
  },
  {
    name: 'the checked-in ES2015 taxonomy matches its pinned audit contract',
    run: async () => {
      const manifest = JSON.parse(await readSource('package.json'));
      const taxonomy = JSON.parse(
        await readSource('tools/test262/es2015-taxonomy.json'),
      );
      const auditEvidence = await readSource(ES2015_AUDIT_EVIDENCE_FILE);
      assertSame(
        manifest.scripts['test262:es2015:audit'],
        'node tools/test262/es2015-audit.js',
      );
      assertSame(
        manifest.scripts['test262:es2015:audit:check'],
        'node tools/test262/es2015-audit.js --check',
      );
      assertSame(
        manifest.scripts['test262:es2015:sync-promoted-report'],
        'node tools/test262/es2015-audit.js --sync-promoted-report',
      );
      assertSame(taxonomy.pin.repository, manifest.test262.repository);
      assertSame(taxonomy.pin.revision, manifest.test262.revision);
      assertSame('evidence' in taxonomy, false);
      assertSame(
        taxonomy.inputs.auditEvidenceSha256,
        createHash('sha256').update(auditEvidence).digest('hex'),
      );
      assertSame(taxonomy.classifications.length, taxonomy.summary.roots);
      assertSame(
        JSON.stringify(
          taxonomy.summary.partitions.map(
            (/** @type {{ name: string }} */ partition) => partition.name,
          ),
        ),
        JSON.stringify(ES2015_WHOLE_TREE_PARTITIONS),
      );
      assertSame(
        JSON.stringify(
          taxonomy.summary.partitions.find(
            (/** @type {{ name: string }} */ partition) =>
              partition.name === 'malformed',
          ),
        ),
        JSON.stringify({
          name: 'malformed',
          roots: 0,
          variants: 0,
          rootsPercent: 0,
          variantsPercent: 0,
        }),
      );
      assertSame(
        taxonomy.summary.partitions.reduce(
          (
            /** @type {number} */ total,
            /** @type {{ roots: number }} */ partition,
          ) => total + partition.roots,
          0,
        ),
        taxonomy.summary.roots,
      );
      assertSame(
        taxonomy.summary.partitions.reduce(
          (
            /** @type {number} */ total,
            /** @type {{ variants: number }} */ partition,
          ) => total + partition.variants,
          0,
        ),
        taxonomy.summary.variants,
      );
      assertSame(JSON.stringify(taxonomy).includes('timestamp'), false);
    },
  },
  {
    // README must contain an install command and an embedding example that
    // calls createRealm and evaluateScript, as required by the design spec.
    name: 'README contains install command and embedding example',
    run: async () => {
      const readme = await readSource('README.md');
      assertSame(
        /```[^\n]*\nnpm install\n```/.test(readme),
        true,
        'README must contain an install command (npm install) inside a fenced code block',
      );
      assertSame(
        readme.includes('createRealm'),
        true,
        'README must contain an embedding example that calls createRealm',
      );
      assertSame(
        readme.includes('evaluateScript'),
        true,
        'README must contain an embedding example that calls evaluateScript',
      );
    },
  },
  {
    name: 'published Agent Jobs, Promise, generator, and static-module documentation preserves layer boundaries',
    run: async () => {
      const readme = await readSource('README.md');
      const testing = await readSource('docs/testing.md');
      const conformance = await readSource('docs/conformance.md');
      const normalizedReadme = readme.replace(/\s+/gu, ' ').trim();
      const normalizedConformance = conformance.replace(/\s+/gu, ' ').trim();

      assertSame(
        readme.includes('realm.agent.runJobs()'),
        true,
        'README must document deterministic manual Agent job draining',
      );
      assertSame(
        readme.includes('jobHost.scheduleMicrotask'),
        true,
        'README must document the optional jobHost scheduler interface',
      );
      assertSame(
        /jobHost: \{\s+scheduleMicrotask\(callback\) \{\s+queueMicrotask\(callback\);\s+\},/u.test(
          readme,
        ),
        true,
        'README must show queueMicrotask only inside the embedder jobHost scheduler example',
      );
      const queueMicrotaskMentions = [readme, testing, conformance]
        .join('\n')
        .match(/\bqueueMicrotask\b/gu);
      assertSame(
        queueMicrotaskMentions?.length,
        2,
        'the layer-1 documentation must name queueMicrotask only in the README host example and its host-only claim',
      );
      assertSame(
        readme.includes(
          'This example names `queueMicrotask` only as an embedder/host scheduling choice;',
        ),
        true,
        'README must describe queueMicrotask as an embedder/host scheduling choice only',
      );
      const sourceQueueMicrotaskUsers = [
        ...(await readJavaScript('src/')).entries(),
      ]
        .filter(([, source]) => source.includes('queueMicrotask'))
        .map(([file]) => file);
      assertSame(
        JSON.stringify(sourceQueueMicrotaskUsers),
        '[]',
        'src/ must not probe or call the host queueMicrotask API',
      );
      assertSame(
        testing.includes('test/ci/es2015-promise-test262.test.js'),
        true,
        'docs/testing.md must name the focused ES2015 Promise Test262 suite',
      );
      assertSame(
        testing.includes('TZ=UTC'),
        true,
        'docs/testing.md must document UTC for the focused Promise Test262 suite',
      );
      assertSame(
        /For this Layer-1 focused check, do not run\s+the broad upstream Test262 suite locally or regenerate its report; exact-SHA CI\s+owns that coverage and its generated artifacts\./u.test(
          testing,
        ),
        true,
        'docs/testing.md must reserve the broad upstream Test262 run and artifact regeneration for CI during the Layer-1 focused check',
      );

      for (const contract of [
        'Agent Jobs',
        'ES2015 Promise constructor',
        'reactions',
        'thenable assimilation',
        'combinators',
        'Promise `Symbol.species` selects the derived Promise constructor',
        'promiseRejectionTracker(promise, operation)',
        'async $DONE',
        'Static modules remain loader-only and do not add dynamic import.',
      ]) {
        assertSame(
          normalizedConformance.includes(contract),
          true,
          `docs/conformance.md must document the layer-1 ${contract} boundary`,
        );
      }

      assertSame(
        /\bengine implements ES5\.1 plus ES2015\b[^.]*\.\s+It also implements synchronous generator declarations\b/iu.test(
          normalizedReadme,
        ),
        true,
        'README must affirm the synchronous ES2015 generator implementation after prose normalization',
      );
      assertSame(
        /\bengine still rejects async functions\/generators and `await`,.*dynamic `import\(\)`/iu.test(
          normalizedReadme,
        ),
        true,
        'README must retain the async function, async generator, await, and dynamic-import exclusions',
      );
      assertSame(
        /\bglobal Test262 feature manifest includes `generators`[^.]*\bexactly 11 approved generator roots enter broad selection\b[^.]*\bPromise and static-module roots remain focused-only\b/iu.test(
          normalizedReadme,
        ),
        true,
        'README must describe the exact generator broad-selection boundary while keeping Promise and module roots focused',
      );

      const documentedBoundaries = [
        ['README.md', normalizedReadme],
        ['docs/testing.md', testing.replace(/\s+/gu, ' ').trim()],
        ['docs/conformance.md', conformance.replace(/\s+/gu, ' ').trim()],
      ];
      /** @type {Array<[string, RegExp]>} */
      const forbiddenClaims = [
        [
          'async functions or generators are implemented',
          /\b(?:implements|supports)\b[^.]*\basync (?:functions?|generators?|iteration)\b/iu,
        ],
        [
          'generator work completes the final release',
          /\b(?:generator (?:support|implementation)|Layer-2)\b[^.]*\b(?:is )?(?:complete|completed|final|finalized|release-ready)\b|\bfinal release\b[^.]*\bgenerators?\b/iu,
        ],
      ];
      for (const [claim, pattern] of forbiddenClaims) {
        for (const [file, source] of documentedBoundaries) {
          assertSame(
            pattern.test(source),
            false,
            `${file} must not claim ${claim}`,
          );
        }
      }
    },
  },
  {
    name: 'markdownTableFirstColumnUnderHeading throws when heading or table is missing',
    run: async () => {
      assertThrows(
        () =>
          markdownTableFirstColumnUnderHeading(
            [
              '## Setup',
              '',
              '| Command | Meaning |',
              '| ------- | ------- |',
              '| `npm test` | Runs tests |',
            ].join('\n'),
            'Commands',
          ),
        Error,
      );
      assertThrows(
        () =>
          markdownTableFirstColumnUnderHeading(
            ['## Commands', '', 'Paragraph only.'].join('\n'),
            'Commands',
          ),
        Error,
      );
    },
  },
  {
    name: 'README command table documents every benchmark script',
    run: async () => {
      const manifest = JSON.parse(await readSource('package.json'));
      const readme = await readSource('README.md');
      const commands = markdownTableFirstColumnUnderHeading(readme, 'Commands');
      const benchmarkCommands = Object.keys(manifest.scripts ?? {})
        .filter(
          (script) => script === 'benchmark' || script.startsWith('benchmark:'),
        )
        .map((script) => `\`npm run ${script}\``);
      const missing = benchmarkCommands.filter(
        (command) => !commands.includes(command),
      );

      assertSame(
        missing.join('\n'),
        '',
        `README command table missing benchmark commands: ${missing.join(', ')}`,
      );
    },
  },
  {
    name: 'docs/benchmarking.md option tables keep a consistent column count',
    run: async () => {
      const source = await readSource('docs/benchmarking.md');
      const optionTables = markdownTablesAfterLabel(source, 'Options:');
      /** @type {string[]} */
      const malformed = [];

      assertSame(
        optionTables.length >= 2,
        true,
        'docs/benchmarking.md must document both the run and summary option tables',
      );

      for (const [tableIndex, table] of optionTables.entries()) {
        const expectedColumns = markdownTableCellCount(table[0]);

        for (const row of table.slice(1)) {
          const actualColumns = markdownTableCellCount(row);

          if (actualColumns !== expectedColumns) {
            malformed.push(
              `table ${tableIndex + 1} expected ${expectedColumns} columns but found ${actualColumns}: ${row}`,
            );
          }
        }
      }

      assertSame(
        malformed.join('\n'),
        '',
        'docs/benchmarking.md option tables must keep a consistent column count',
      );
    },
  },
  {
    name: 'docs/benchmarking.md documents geometric calibration instead of the deleted one-probe formula',
    run: async () => {
      const source = await readSource('docs/benchmarking.md');
      const requiredPhrases = [
        'double the timed probe batch size',
        '`targetSampleMs / 8`',
        'coarse clock',
        'per-invocation cost',
      ];
      const forbiddenPhrases = [
        'Run one timed batch of size `1`.',
        'Compute `ceil(targetSampleMs / initialElapsedMs)`.',
      ];
      /** @type {string[]} */
      const missing = [];
      /** @type {string[]} */
      const stale = [];

      for (const phrase of requiredPhrases) {
        if (!source.includes(phrase)) {
          missing.push(phrase);
        }
      }

      for (const phrase of forbiddenPhrases) {
        if (source.includes(phrase)) {
          stale.push(phrase);
        }
      }

      assertSame(
        missing.join('\n'),
        '',
        `docs/benchmarking.md must mention geometric probing and clock granularity: ${missing.join(', ')}`,
      );
      assertSame(
        stale.join('\n'),
        '',
        `docs/benchmarking.md still contains deleted one-probe calibration wording: ${stale.join(', ')}`,
      );
    },
  },
  {
    // Every inline-code span in current documentation that names a repository
    // source path (src/**, test/**, tools/**) must reference a file that exists.
    // This catches stale or mistyped module names in prose.
    name: 'every inline source path in current documentation names an existing file',
    run: async () => {
      const docFiles = await currentDocumentationFiles();
      const SOURCE_PATH_PATTERN =
        /`((?:src|test|tools)\/[^\s`*?]+\.(?:js|mjs|cjs|json))`/g;
      /** @type {string[]} */
      const broken = [];

      for (const docFile of docFiles) {
        const source = await readSource(docFile);
        for (const match of source.matchAll(SOURCE_PATH_PATTERN)) {
          const path = match[1];
          if (!(await fileExists(path))) {
            broken.push(`${docFile}: \`${path}\``);
          }
        }
      }

      assertSame(
        broken.join('\n'),
        '',
        'inline source paths in documentation that do not exist in the repository',
      );
    },
  },
  {
    name: 'npm run test:node does not transitively depend on an upstream Test262 checkout',
    run: async () => {
      // The node runner must never import modules that require a real Test262
      // checkout. If it does, `npm run test:node` cannot pass on a machine
      // without vendor/test262 — breaking the machine-independence invariant.
      const CHECKOUT_DEPENDENT_MODULES = [
        'tools/test262/upstream-run.js',
        'tools/test262/exclusions-check.js',
      ];

      const nodeRunner = await readSource('test/run-node.js');
      const portableRegistry = await readSource('test/suites.js');

      // Collect all specifiers reachable from the two runner sources.
      const seen = new Set();
      /** @type {string[]} */
      const queue = [];

      // Resolve relative specifiers from their respective base paths.
      /** @param {string} base @param {string} specifier */
      function resolve(base, specifier) {
        const parts = base.split('/');
        parts.pop();
        for (const seg of specifier.split('/')) {
          if (seg === '..') parts.pop();
          else if (seg !== '.') parts.push(seg);
        }
        return parts.join('/');
      }

      // Seed with imports from both entry points, resolved to repo-relative paths.
      for (const [basePath, source] of [
        ['test/run-node.js', nodeRunner],
        ['test/suites.js', portableRegistry],
      ]) {
        for (const specifier of importSpecifiers(source)) {
          if (specifier.startsWith('./') || specifier.startsWith('../')) {
            const resolved = resolve(basePath, specifier);
            if (!seen.has(resolved)) {
              seen.add(resolved);
              queue.push(resolved);
            }
          }
        }
      }

      // Walk transitive imports (breadth-first, only local files)
      while (queue.length > 0) {
        const file = /** @type {string} */ (queue.shift());
        if (!file.endsWith('.js')) continue;
        let source;
        try {
          source = await readSource(file);
        } catch {
          continue; // file may not exist (e.g. node: builtins)
        }
        for (const specifier of importSpecifiers(source)) {
          if (specifier.startsWith('./') || specifier.startsWith('../')) {
            const resolved = resolve(file, specifier);
            if (!seen.has(resolved)) {
              seen.add(resolved);
              queue.push(resolved);
            }
          }
        }
      }

      const violations = CHECKOUT_DEPENDENT_MODULES.filter((mod) =>
        seen.has(mod),
      );

      assertSame(
        violations.join(', '),
        '',
        `test:node transitively imports checkout-dependent modules: ${violations.join(', ')}`,
      );
    },
  },
  {
    name: 'no engine module keeps guest-reachable state at module scope',
    run: async () => {
      // `Symbol.for` interns a guest-controlled string. Holding that registry
      // in a module variable would retain guest data for the life of the
      // process, outliving every realm that produced it and reachable from no
      // handle an embedder could drop. It belongs to an `Agent` instead.
      //
      // This parses rather than pattern-matches, because the regression is
      // most likely to arrive in exactly the shape a regex misses: the code
      // this replaced used `export const` for a module-level binding right
      // beside the registry, and a wrapped initializer or an `Object.create`
      // table would slip past a line-oriented check too.
      const OWNERS = [
        'src/runtime/symbol.js',
        'src/runtime/agent.js',
        'src/builtins/symbol.js',
      ];
      const MUTABLE_COLLECTIONS = ['Map', 'Set', 'WeakMap', 'WeakSet'];
      /** @type {string[]} */
      const violations = [];

      /**
       * Whether an initializer builds mutable state, anywhere inside it.
       *
       * @param {any} node
       * @returns {boolean}
       */
      function buildsMutableState(node) {
        if (node === null || typeof node !== 'object') {
          return false;
        }

        if (
          node.type === 'NewExpression' &&
          node.callee?.type === 'Identifier' &&
          MUTABLE_COLLECTIONS.includes(node.callee.name)
        ) {
          return true;
        }

        if (
          node.type === 'CallExpression' &&
          node.callee?.type === 'MemberExpression' &&
          node.callee.object?.name === 'Object' &&
          node.callee.property?.name === 'create'
        ) {
          return true;
        }

        for (const key of Object.keys(node)) {
          const child = node[key];

          if (Array.isArray(child)) {
            if (child.some((entry) => buildsMutableState(entry))) {
              return true;
            }
          } else if (buildsMutableState(child)) {
            return true;
          }
        }

        return false;
      }

      for (const file of OWNERS) {
        const program = parse(await readSource(file), {
          ecmaVersion: 2020,
          sourceType: 'module',
        });

        for (const statement of program.body) {
          const declaration =
            statement.type === 'ExportNamedDeclaration'
              ? statement.declaration
              : statement;

          if (declaration?.type !== 'VariableDeclaration') {
            continue;
          }

          if (declaration.kind !== 'const') {
            violations.push(`${file}: module-scope ${declaration.kind}`);
            continue;
          }

          for (const declarator of declaration.declarations) {
            const init = declarator.init;

            if (
              init !== null &&
              init !== undefined &&
              (init.type === 'ObjectExpression' ||
                init.type === 'ArrayExpression' ||
                buildsMutableState(init))
            ) {
              const { id } = declarator;

              violations.push(
                `${file}: ${id.type === 'Identifier' ? id.name : 'binding'}`,
              );
            }
          }
        }
      }

      assertSame(violations.join(' | '), '');
    },
  },
  {
    name: 'every feature area the selection policy claims is backed by a probed feature',
    run: async () => {
      // The two gates are independent: `featureAreas` decides where a tagged
      // test is selected from, `features.json` decides whether it may run.
      // A tag claimed by an area but missing from the manifest would select
      // tests the runner then silently skips, which reads as coverage the
      // engine does not have.
      const policy = parseEs5Selection(await readSource(ES5_SELECTION_FILE));
      const manifest = parseFeatureManifest(
        await readSource(FEATURES_MANIFEST_FILE),
      );
      const probed = new Set(
        manifest.features
          .filter((feature) => feature.probe.trim() !== '')
          .map((feature) => feature.name),
      );
      /** @type {string[]} */
      const unbacked = [];

      for (const area of policy.featureAreas) {
        for (const name of area.features) {
          if (!probed.has(name)) {
            unbacked.push(`${area.prefix} claims ${name}`);
          }
        }
      }

      assertSame(
        unbacked.join(', '),
        '',
        `feature areas claim tags with no probed feature: ${unbacked.join(', ')}`,
      );
    },
  },
];
