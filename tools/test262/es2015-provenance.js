/**
 * Pure, host-neutral provenance contracts for the ES2015 unknown-edition ledger.
 */

import { createHash } from 'node:crypto';
import {
  isTest262FixtureDependencyPath,
  sortStrings,
} from './selection.js';

export const ES2015_PROVENANCE_VERSION = 1;
export const ES2015_PROVENANCE_FILE = 'tools/test262/es2015-provenance.json';
export const ES2015_PROVENANCE_DECISION_CODES = Object.freeze([
  'UA',
  'UB',
  'UL1',
  'UL2',
  'UL3',
  'UL4',
  'US1',
  'US2',
  'US3',
  'US4',
  'US5',
  'US6',
  'US7',
]);

const TEST262_REPOSITORY = 'https://github.com/tc39/test262.git';
const TEST262_REVISION = 'b363f29d3c43c626dc852744ad64a0b48a003693';
const SPECIFICATION_SOURCE = 'https://262.ecma-international.org/6.0/';
const SPECIFICATION_SHA256 =
  '4d4243dc2f04c9cdd09498f2cc2af6f6cdc07b0430da5578e7cf440d4f7846a0';
const PARENT_CODE = 'T1';
const PARENT_ISSUE = 75;
const ROOT_PREFIX = 'test/';
const EMPTY_LEDGER_SHA256 = sha256('\n');
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const REVIEW_URL =
  /^https:\/\/github\.com\/yoonbuck\/jsjs\/(?:pull|issues)\/\d+#issuecomment-\d+$/;
const BLOCKERS = new Set([
  'annex-b-web-compatibility',
  'binary-data-and-typed-arrays',
  'early-errors-and-declaration-instantiation',
  'keyed-collections',
  'lexical-grammar-and-new-target',
  'proper-tail-calls',
  'proxy-and-reflect-metaobject',
  'regexp-unicode-and-sticky',
  'remaining-language-runtime-semantics',
  'remaining-standard-library-additions',
  'symbol-protocol-dispatch',
  'test262-cross-realm-host',
]);

const MANIFEST_KEYS = Object.freeze([
  'version',
  'repository',
  'revision',
  'specification',
  'parent',
  'baseLedger',
  'batches',
]);
const SPECIFICATION_KEYS = Object.freeze(['source', 'sourceSha256']);
const PARENT_KEYS = Object.freeze(['code', 'issue']);
const BASE_LEDGER_KEYS = Object.freeze([
  'rootCount',
  'variantCount',
  'pathSha256',
  'paths',
]);
const BATCH_KEYS = Object.freeze([
  'code',
  'selector',
  'scope',
  'rootCount',
  'variantCount',
  'pathSha256',
  'entries',
]);
const BATCH_ENTRY_KEYS = Object.freeze(['path', 'variants', 'priorClass']);
const FRAGMENT_KEYS = Object.freeze([
  'version',
  'repository',
  'revision',
  'specification',
  'parent',
  'code',
  'decisions',
]);
const DECISION_KEYS = Object.freeze([
  'path',
  'variants',
  'priorClass',
  'finalPartition',
  'finalStatus',
  'evidenceKind',
  'specification',
  'metadata',
  'history',
  'rationale',
  'review',
  'destination',
  'artifactSha256',
]);
const DECISION_SPECIFICATION_KEYS = Object.freeze([
  'source',
  'sourceSha256',
  'clause',
  'anchor',
]);
const DECISION_METADATA_KEYS = Object.freeze([
  'es5id',
  'es6id',
  'esid',
  'features',
  'includeFeatures',
  'includes',
  'flags',
]);
const HISTORY_KEYS = Object.freeze(['repository', 'commit', 'note']);
const REVIEW_KEYS = Object.freeze(['reviewer', 'reviewedAt', 'artifact']);
const DESTINATION_KEYS = Object.freeze(['blocker', 'issue']);
const DECISION_KEYS_WITHOUT_HASH = Object.freeze(
  DECISION_KEYS.filter((key) => key !== 'artifactSha256'),
);
const AGGREGATE_CODES = Object.freeze(['U0', 'UL', 'US']);
const ALL_RENDER_CODES = Object.freeze([
  'U0',
  'UA',
  'UB',
  'UL',
  ...ES2015_PROVENANCE_DECISION_CODES,
  'US',
]);
const LANGUAGE_ASSIGNMENT_TOPICS = new Set([
  'assignmenttargettype',
  'assignment',
  'compound-assignment',
  'postfix-decrement',
  'postfix-increment',
  'prefix-decrement',
  'prefix-increment',
]);
const LANGUAGE_OBJECT_TOPICS = new Set(['object', 'class']);
const LANGUAGE_ENVIRONMENT_TOPICS = new Set([
  'arguments-object',
  'module-code',
  'eval-code',
  'function-code',
]);
const STAGING_US1_TOPICS = new Set([
  'Array',
  'TypedArray',
  'ArrayBuffer',
  'DataView',
  'Map',
  'Set',
  'Promise',
]);
const STAGING_US2_TOPICS = new Set(['RegExp', 'String', 'JSON']);
const STAGING_US3_TOPICS = new Set([
  'Math',
  'Number',
  'Date',
  'global',
  'Boolean',
  'Error',
  'Exceptions',
]);
const STAGING_US4_TOPICS = new Set([
  'Function',
  'object',
  'Symbol',
  'Proxy',
  'Reflect',
]);
const STAGING_US5_TOPICS = new Set([
  'class',
  'strict',
  'expressions',
  'lexical-environment',
  'generators',
  'eval',
  'statements',
  'syntax',
  'destructuring',
  'module',
  'literals',
  'argumentsLengthOpt.js',
]);
const STAGING_US6_TOPICS = new Set([
  'PrivateName',
  'async-functions',
  'fields',
  'BigInt',
  'AsyncGenerators',
]);
const STAGING_US7_TOPICS = new Set(['regress', 'extensions', 'misc', 'types']);
const SPECIAL_US6_PATH =
  'test/staging/built-ins/Array/prototype/flatMap/callback-with-side-effects.js';

const ISSUE_DEFINITIONS = Object.freeze({
  U0: Object.freeze({
    title: 'Provenance tooling foundation',
    scope: 'Pure provenance tooling, rendering, and validation only.',
    dependencies: Object.freeze([]),
    aggregateCodes: Object.freeze([]),
    extra: 'This node makes zero classification decisions.',
  }),
  UA: Object.freeze({
    title: 'Annex B decisions',
    scope: 'Annex B',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['UA']),
  }),
  UB: Object.freeze({
    title: 'Built-in decisions',
    scope: 'Built-ins',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['UB']),
  }),
  UL: Object.freeze({
    title: 'Language decisions',
    scope: 'Language decision grouping',
    dependencies: Object.freeze(['UL1', 'UL2', 'UL3', 'UL4']),
    aggregateCodes: Object.freeze(['UL1', 'UL2', 'UL3', 'UL4']),
    extra:
      'This grouping node owns no commit and closes only after its atomic children merge and reclassification balances exactly.',
  }),
  UL1: Object.freeze({
    title: 'Assignment and update semantics',
    scope: 'Assignment and update semantics',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['UL1']),
  }),
  UL2: Object.freeze({
    title: 'Object and class definitions',
    scope: 'Object and class definitions',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['UL2']),
  }),
  UL3: Object.freeze({
    title: 'Grammar and control semantics',
    scope: 'Grammar and control semantics',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['UL3']),
  }),
  UL4: Object.freeze({
    title: 'Environments and modules',
    scope: 'Environments and modules',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['UL4']),
  }),
  US: Object.freeze({
    title: 'Staging decisions',
    scope: 'SpiderMonkey staging decision grouping',
    dependencies: Object.freeze([
      'US1',
      'US2',
      'US3',
      'US4',
      'US5',
      'US6',
      'US7',
    ]),
    aggregateCodes: Object.freeze([
      'US1',
      'US2',
      'US3',
      'US4',
      'US5',
      'US6',
      'US7',
    ]),
    extra:
      'This grouping node owns no commit and closes only after its atomic children merge and reclassification balances exactly.',
  }),
  US1: Object.freeze({
    title: 'Containers and binary data',
    scope: 'Containers and binary data',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['US1']),
  }),
  US2: Object.freeze({
    title: 'Patterns, text, and JSON',
    scope: 'Patterns, text, and JSON',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['US2']),
  }),
  US3: Object.freeze({
    title: 'Numeric, date, and global semantics',
    scope: 'Numeric, date, and global semantics',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['US3']),
  }),
  US4: Object.freeze({
    title: 'Metaobject, function, and Symbol semantics',
    scope: 'Metaobject, function, and Symbol semantics',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['US4']),
  }),
  US5: Object.freeze({
    title: 'Staging language runtime',
    scope: 'Staging language runtime',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['US5']),
  }),
  US6: Object.freeze({
    title: 'Affirmative post-ES2015 candidates',
    scope: 'Affirmative post-ES2015 candidates',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['US6']),
  }),
  US7: Object.freeze({
    title: 'Residual manual semantics',
    scope: 'Residual manual semantics',
    dependencies: Object.freeze(['U0']),
    aggregateCodes: Object.freeze(['US7']),
  }),
});

const BATCH_DEFINITIONS = Object.freeze(
  ES2015_PROVENANCE_DECISION_CODES.map((code) =>
    Object.freeze({
      code,
      selector: selectorForCode(code),
      scope: ISSUE_DEFINITIONS[code].scope,
    }),
  ),
);
const BATCH_DEFINITION_MAP = new Map(
  BATCH_DEFINITIONS.map((definition) => [definition.code, definition]),
);

export class Es2015ProvenanceError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'Es2015ProvenanceError';
  }
}

/** @param {string} text */
export function parseEs2015ProvenanceManifest(text) {
  return deepFreeze(
    normalizeManifestRecord(parseJson(text, ES2015_PROVENANCE_FILE), {
      exactLists: true,
      exactTopLevelMessage: `${ES2015_PROVENANCE_FILE} must contain exact keys`,
    }),
  );
}

/** @param {string} text @param {string} expectedCode */
export function parseEs2015DecisionFragment(text, expectedCode) {
  assertDecisionCode(expectedCode);
  return deepFreeze(
    normalizeDecisionFragmentRecord(
      parseJson(text, `${expectedCode} decision fragment`),
      expectedCode,
      { exactLists: true },
    ),
  );
}

/**
 * @param {readonly {
 *   path: string,
 *   variants: number,
 *   partition: string,
 *   finalClass: string,
 * }[]} classifications
 */
export function buildProvenanceFoundation(classifications) {
  if (!Array.isArray(classifications)) {
    throw new Es2015ProvenanceError(
      'ES2015 provenance foundation requires classifications',
    );
  }

  const unknownRecords = classifications
    .filter((record) => {
      const normalized = normalizeClassificationRecord(record);
      return normalized.partition === 'unknown-edition';
    })
    .map((record) => normalizeClassificationRecord(record));
  const baseEntries = sortStrings(unknownRecords.map((record) => record.path));
  assertUnique(baseEntries, 'ES2015 provenance base ledger paths');
  const batchEntries = new Map(
    ES2015_PROVENANCE_DECISION_CODES.map((code) => [code, []]),
  );

  for (const record of unknownRecords) {
    const code = decisionCodeForPath(record.path);
    const entries = batchEntries.get(code);
    if (entries === undefined) {
      throw new Es2015ProvenanceError(`Unknown provenance batch ${code}`);
    }
    entries.push(
      Object.freeze({
        path: record.path,
        variants: record.variants,
        priorClass: record.finalClass,
      }),
    );
  }

  const batches = BATCH_DEFINITIONS.map((definition) => {
    const entries = sortEntries(batchEntries.get(definition.code) ?? []);
    const paths = entries.map((entry) => entry.path);
    return Object.freeze({
      code: definition.code,
      selector: definition.selector,
      scope: definition.scope,
      rootCount: entries.length,
      variantCount: entries.reduce((sum, entry) => sum + entry.variants, 0),
      pathSha256: hashPaths(paths),
      entries: Object.freeze(entries),
    });
  });

  return deepFreeze({
    version: ES2015_PROVENANCE_VERSION,
    repository: TEST262_REPOSITORY,
    revision: TEST262_REVISION,
    specification: {
      source: SPECIFICATION_SOURCE,
      sourceSha256: SPECIFICATION_SHA256,
    },
    parent: {
      code: PARENT_CODE,
      issue: PARENT_ISSUE,
    },
    baseLedger: {
      rootCount: baseEntries.length,
      variantCount: unknownRecords.reduce((sum, entry) => sum + entry.variants, 0),
      pathSha256: hashPaths(baseEntries),
      paths: baseEntries,
    },
    batches,
  });
}

/** @param {unknown} manifest @param {readonly object[]} classifications */
export function validateProvenanceFoundation(manifest, classifications) {
  const normalizedManifest = normalizeManifestRecord(object(manifest, ES2015_PROVENANCE_FILE), {
    exactLists: false,
    exactTopLevelMessage: `${ES2015_PROVENANCE_FILE} must contain exact keys`,
  });
  const expected = buildProvenanceFoundation(classifications);
  const expectedBasePaths = expected.baseLedger.paths;
  const actualBasePaths = [...normalizedManifest.baseLedger.paths];

  if (!isSorted(actualBasePaths)) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} base ledger must remain code-unit sorted`,
    );
  }
  assertUniqueBasePaths(actualBasePaths, `${ES2015_PROVENANCE_FILE} base ledger`);

  const actualBaseSet = new Set(actualBasePaths);
  const expectedBaseSet = new Set(expectedBasePaths);
  for (const path of expectedBasePaths) {
    if (!actualBaseSet.has(path)) {
      throw new Es2015ProvenanceError(`Base ledger is missing path ${path}`);
    }
  }
  for (const path of actualBasePaths) {
    if (!expectedBaseSet.has(path)) {
      throw new Es2015ProvenanceError(`Base ledger has unexpected path ${path}`);
    }
  }

  const batchPathOwners = new Map();
  for (const batch of normalizedManifest.batches) {
    const paths = batch.entries.map((entry) => entry.path);
    if (!isSorted(paths)) {
      throw new Es2015ProvenanceError(
        `${batch.code} batch ledger must remain code-unit sorted`,
      );
    }
    const duplicates = duplicatesOf(paths);
    if (duplicates.length > 0) {
      throw new Es2015ProvenanceError(
        `${batch.code} batch ledger must not repeat base paths`,
      );
    }
    for (const path of paths) {
      const owner = batchPathOwners.get(path);
      if (owner !== undefined) {
        throw new Es2015ProvenanceError(
          `Base path ${path} appears in more than one provenance batch`,
        );
      }
      batchPathOwners.set(path, batch.code);
      if (!expectedBaseSet.has(path)) {
        throw new Es2015ProvenanceError(
          `${batch.code} batch ledger has unexpected non-base path ${path}`,
        );
      }
    }
  }

  for (const definition of BATCH_DEFINITIONS) {
    const actual = batchByCode(normalizedManifest, definition.code);
    if (actual.selector !== definition.selector) {
      throw new Es2015ProvenanceError(
        `${definition.code} must retain selector ${definition.selector}`,
      );
    }
    if (actual.scope !== definition.scope) {
      throw new Es2015ProvenanceError(
        `${definition.code} must retain scope ${definition.scope}`,
      );
    }
    const expectedBatch = batchByCode(expected, definition.code);
    const actualPaths = actual.entries.map((entry) => entry.path);
    const actualPathSet = new Set(actualPaths);
    const expectedPaths = expectedBatch.entries.map((entry) => entry.path);
    for (const path of expectedPaths) {
      if (!actualPathSet.has(path)) {
        throw new Es2015ProvenanceError(
          `${definition.code} batch ledger is missing path ${path}`,
        );
      }
    }
    for (const path of actualPaths) {
      if (!expectedPaths.includes(path)) {
        throw new Es2015ProvenanceError(
          `${definition.code} batch ledger has unexpected path ${path}`,
        );
      }
    }
    for (const actualEntry of actual.entries) {
      const expectedEntry = expectedBatch.entries.find(
        (entry) => entry.path === actualEntry.path,
      );
      if (expectedEntry === undefined) continue;
      if (actualEntry.variants !== expectedEntry.variants) {
        throw new Es2015ProvenanceError(
          `${definition.code} variant count does not match its reviewed ledger`,
        );
      }
      if (actualEntry.priorClass !== expectedEntry.priorClass) {
        throw new Es2015ProvenanceError(
          `${definition.code} prior class does not match its reviewed ledger`,
        );
      }
    }
    if (actual.rootCount !== actual.entries.length) {
      throw new Es2015ProvenanceError(
        `${definition.code} root count does not match its reviewed ledger`,
      );
    }
    if (
      actual.variantCount !==
      actual.entries.reduce((sum, entry) => sum + entry.variants, 0)
    ) {
      throw new Es2015ProvenanceError(
        `${definition.code} variant count does not match its reviewed ledger`,
      );
    }
    if (actual.pathSha256 !== hashPaths(actualPaths)) {
      throw new Es2015ProvenanceError(
        `${definition.code} path ledger SHA-256 does not match its reviewed bytes`,
      );
    }
  }

  if (normalizedManifest.baseLedger.rootCount !== actualBasePaths.length) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} base ledger root count does not match its reviewed bytes`,
    );
  }
  if (
    normalizedManifest.baseLedger.variantCount !==
    [...batchPathOwners.entries()].reduce((sum, [path]) => {
      const entry = expected.batches
        .flatMap((batch) => batch.entries)
        .find((candidate) => candidate.path === path);
      return sum + (entry?.variants ?? 0);
    }, 0)
  ) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} base ledger variant count does not match its reviewed bytes`,
    );
  }
  if (normalizedManifest.baseLedger.pathSha256 !== hashPaths(actualBasePaths)) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} base ledger SHA-256 does not match its reviewed bytes`,
    );
  }
}

/**
 * @param {unknown} manifest
 * @param {unknown} fragments
 * @param {{ allowPendingReview?: boolean, requireCompleteCodes?: readonly string[] }} [options]
 * @returns {ReadonlyMap<string, object>}
 */
export function validateDecisionFragments(manifest, fragments, options = {}) {
  const normalizedManifest = normalizeManifestRecord(object(manifest, ES2015_PROVENANCE_FILE), {
    exactLists: false,
    exactTopLevelMessage: `${ES2015_PROVENANCE_FILE} must contain exact keys`,
  });
  const allowPendingReview = options.allowPendingReview === true;
  const requireCompleteCodes = normalizeRequiredCodes(options.requireCompleteCodes);
  const fragmentMap = normalizeFragments(fragments);
  const decisions = new Map();

  for (const [code, value] of fragmentMap) {
    const fragment = normalizeDecisionFragmentRecord(value, code, {
      exactLists: true,
    });
    const batch = batchByCode(normalizedManifest, code);
    const expectedPaths = new Set(batch.entries.map((entry) => entry.path));
    const fragmentPaths = new Set();

    for (const rawDecision of fragment.decisions) {
      const decision = normalizeDecisionRecord(rawDecision, {
        code,
        exactLists: true,
        allowPendingReview,
        requireArtifactSha256: true,
        skipSemanticValidation: false,
      });
      if (!expectedPaths.has(decision.path)) {
        throw new Es2015ProvenanceError(
          `${code} decision for ${decision.path} is not in the ${code} ledger`,
        );
      }
      if (fragmentPaths.has(decision.path) || decisions.has(decision.path)) {
        throw new Es2015ProvenanceError(
          `${code} repeats reviewed decision ${decision.path}`,
        );
      }
      fragmentPaths.add(decision.path);
      const expectedEntry = batch.entries.find((entry) => entry.path === decision.path);
      if (expectedEntry === undefined) {
        throw new Es2015ProvenanceError(
          `${code} decision for ${decision.path} is not in the ${code} ledger`,
        );
      }
      if (decision.variants !== expectedEntry.variants) {
        throw new Es2015ProvenanceError(
          `${code} decision for ${decision.path} must retain the reviewed variant count`,
        );
      }
      if (decision.priorClass !== expectedEntry.priorClass) {
        throw new Es2015ProvenanceError(
          `${code} decision for ${decision.path} must retain the reviewed prior class`,
        );
      }
      decisions.set(decision.path, deepFreeze(decision));
    }

    if (requireCompleteCodes.has(code) && fragmentPaths.size !== expectedPaths.size) {
      throw new Es2015ProvenanceError(
        `${code} must contain reviewed decisions for every ledger path`,
      );
    }
  }

  return new Map(decisions);
}

/** @param {unknown} decision */
export function canonicalDecisionSha256(decision) {
  const candidate = { ...object(decision, 'decision') };
  delete candidate.artifactSha256;
  const normalized = normalizeDecisionRecord(candidate, {
    code: 'decision',
    exactLists: true,
    allowPendingReview: true,
    requireArtifactSha256: false,
    skipSemanticValidation: true,
  });
  const canonical = canonicalDecisionRecord(normalized, false);
  return sha256(JSON.stringify(canonical));
}

/** @param {unknown} manifest @param {string} code */
export function renderBatchLedger(manifest, code) {
  if (!ES2015_PROVENANCE_DECISION_CODES.includes(code)) {
    throw new Es2015ProvenanceError(`${code} is not a known provenance ledger code`);
  }
  const normalizedManifest = normalizeManifestRecord(object(manifest, ES2015_PROVENANCE_FILE), {
    exactLists: false,
    exactTopLevelMessage: `${ES2015_PROVENANCE_FILE} must contain exact keys`,
  });
  const batch = batchByCode(normalizedManifest, code);
  return `${batch.entries.map((entry) => entry.path).join('\n')}\n`;
}

/** @param {unknown} manifest @param {string} code @param {unknown} issueMap */
export function renderProvenanceIssueBody(manifest, code, issueMap) {
  const definition = ISSUE_DEFINITIONS[code];
  if (definition === undefined) {
    throw new Es2015ProvenanceError(`${code} is not a known provenance issue code`);
  }
  const normalizedManifest = normalizeManifestRecord(object(manifest, ES2015_PROVENANCE_FILE), {
    exactLists: false,
    exactTopLevelMessage: `${ES2015_PROVENANCE_FILE} must contain exact keys`,
  });
  const issues = normalizeIssueMap(issueMap);
  const ledger = renderLedgerSummary(normalizedManifest, code);
  const dependencies = definition.dependencies.map((dependencyCode) => {
    const issueNumber = issues.get(dependencyCode);
    if (issueNumber === undefined) {
      throw new Es2015ProvenanceError(
        `Issue map is missing required code ${dependencyCode}`,
      );
    }
    return `${dependencyCode} (#${issueNumber})`;
  });
  const selfIssue = issues.get(code);
  if (selfIssue === undefined) {
    throw new Es2015ProvenanceError(`Issue map is missing required code ${code}`);
  }
  const lines = [
    `<!-- test262-provenance T1 / #75 | code:${code} | base-ledger-sha256:${normalizedManifest.baseLedger.pathSha256} -->`,
    `# ${code} — ${definition.title}`,
    '',
    `Issue: #${selfIssue}.`,
    `Parent: T1 / #75.`,
    `Base ledger: ${normalizedManifest.baseLedger.rootCount} roots / ${normalizedManifest.baseLedger.variantCount} variants / SHA-256 ${normalizedManifest.baseLedger.pathSha256}.`,
    `Batch ledger: ${ledger.rootCount} roots / ${ledger.variantCount} variants / SHA-256 ${ledger.pathSha256}.`,
    `Test262 pin: ${TEST262_REPOSITORY} @ ${TEST262_REVISION}.`,
    `Sixth Edition pin: ${SPECIFICATION_SOURCE} @ ${SPECIFICATION_SHA256}.`,
    `Scope: ${definition.scope}.`,
    'Non-goals: guest runtime behavior, tools/test262/features.json, and broad selection changes.',
    'Evidence method: reviewed Sixth Edition or later-spec proof only.',
    'History alone never establishes edition evidence.',
    dependencies.length === 0
      ? 'Dependencies: none.'
      : `Dependencies: ${dependencies.join(', ')}.`,
    'Independent specification review and independent quality/provenance review are required.',
    'Generate artifacts and timestamps with TZ=UTC.',
    'Local Test262 commands are limited to metadata/audit checks or exact targeted paths only.',
    'Require exact-head CI before merge.',
    'Require exact-head CodeQL before merge.',
    'Guest production changes are prohibited.',
  ];

  if (definition.extra !== undefined) {
    lines.push(definition.extra);
  }

  return `${lines.join('\n')}\n`;
}

/** @param {string} code */
function selectorForCode(code) {
  switch (code) {
    case 'UA':
      return 'test/annexB/**';
    case 'UB':
      return 'test/built-ins/**';
    case 'UL1':
      return 'test/language/expressions/{assignmenttargettype,assignment,compound-assignment,postfix-decrement,postfix-increment,prefix-decrement,prefix-increment}/**';
    case 'UL2':
      return 'test/language/expressions/{object,class}/** + test/language/statements/class/**';
    case 'UL3':
      return 'remaining test/language/** after UL1, UL2, and UL4';
    case 'UL4':
      return 'test/language/{arguments-object,module-code,eval-code,function-code}/**';
    case 'US1':
      return 'test/staging/sm/{Array,TypedArray,ArrayBuffer,DataView,Map,Set,Promise}/**';
    case 'US2':
      return 'test/staging/sm/{RegExp,String,JSON}/**';
    case 'US3':
      return 'test/staging/sm/{Math,Number,Date,global,Boolean,Error,Exceptions}/**';
    case 'US4':
      return 'test/staging/sm/{Function,object,Symbol,Proxy,Reflect}/**';
    case 'US5':
      return 'test/staging/sm/{class,strict,expressions,lexical-environment,generators,eval,statements,syntax,destructuring,module,literals,argumentsLengthOpt.js}/**';
    case 'US6':
      return 'test/staging/sm/{PrivateName,async-functions,fields,BigInt,AsyncGenerators}/** + test/staging/built-ins/Array/prototype/flatMap/callback-with-side-effects.js';
    case 'US7':
      return 'test/staging/sm/{regress,extensions,misc,types}/**';
    default:
      throw new Es2015ProvenanceError(`${code} is not an approved ES2015 provenance decision code`);
  }
}

/** @param {unknown} value @param {string} label */
function parseJson(value, label) {
  if (typeof value !== 'string') {
    throw new Es2015ProvenanceError(`${label} must be JSON text`);
  }
  try {
    return object(JSON.parse(value), label);
  } catch (error) {
    if (error instanceof Es2015ProvenanceError) throw error;
    throw new Es2015ProvenanceError(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** @param {unknown} value @param {string} label */
function object(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Es2015ProvenanceError(`${label} must be an object`);
  }
  return /** @type {Record<string, any>} */ (value);
}

/**
 * @param {Record<string, any>} record
 * @param {readonly string[]} expectedKeys
 * @param {string} message
 */
function requireExactKeys(record, expectedKeys, message) {
  const keys = Object.keys(record);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => !expectedKeys.includes(key)) ||
    expectedKeys.some((key) => !Object.prototype.hasOwnProperty.call(record, key))
  ) {
    throw new Es2015ProvenanceError(message);
  }
}

/**
 * @param {Record<string, any>} record
 * @param {{ exactLists: boolean, exactTopLevelMessage: string }} options
 */
function normalizeManifestRecord(record, options) {
  requireExactKeys(record, MANIFEST_KEYS, options.exactTopLevelMessage);
  if (record.version !== ES2015_PROVENANCE_VERSION) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} must declare version ${ES2015_PROVENANCE_VERSION}`,
    );
  }
  validateReviewedRepositoryRevision(
    record.repository,
    record.revision,
    `${ES2015_PROVENANCE_FILE} must retain the reviewed Test262 repository and revision`,
  );
  const specification = normalizeIdentitySpecification(
    object(record.specification, `${ES2015_PROVENANCE_FILE} specification`),
    `${ES2015_PROVENANCE_FILE} specification must contain exact keys`,
    `${ES2015_PROVENANCE_FILE} must retain the reviewed Sixth Edition source identity`,
  );
  const parent = normalizeParent(
    object(record.parent, `${ES2015_PROVENANCE_FILE} parent`),
    `${ES2015_PROVENANCE_FILE} parent must contain exact keys`,
    `${ES2015_PROVENANCE_FILE} must retain parent T1 / #75`,
  );
  const baseLedger = normalizeBaseLedger(
    object(record.baseLedger, `${ES2015_PROVENANCE_FILE} baseLedger`),
    options.exactLists,
  );
  if (!Array.isArray(record.batches)) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} batches must be an array`,
    );
  }
  const batches = record.batches.map((batch) =>
    normalizeBatchRecord(
      object(batch, `${ES2015_PROVENANCE_FILE} batch`),
      options.exactLists,
    ),
  );
  const codes = batches.map((batch) => batch.code);
  if (codes.join('\u0000') !== ES2015_PROVENANCE_DECISION_CODES.join('\u0000')) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} batch codes must be approved U* decision codes`,
    );
  }
  return {
    version: ES2015_PROVENANCE_VERSION,
    repository: TEST262_REPOSITORY,
    revision: TEST262_REVISION,
    specification,
    parent,
    baseLedger,
    batches,
  };
}

/**
 * @param {Record<string, any>} record
 * @param {string} expectedCode
 * @param {{ exactLists: boolean }} options
 */
function normalizeDecisionFragmentRecord(record, expectedCode, options) {
  requireExactKeys(
    record,
    FRAGMENT_KEYS,
    `${expectedCode} decision fragment must contain exact keys`,
  );
  if (record.version !== ES2015_PROVENANCE_VERSION) {
    throw new Es2015ProvenanceError(
      `${expectedCode} decision fragment must declare version ${ES2015_PROVENANCE_VERSION}`,
    );
  }
  validateReviewedRepositoryRevision(
    record.repository,
    record.revision,
    `${expectedCode} decision fragment must retain the reviewed Test262 repository and revision`,
  );
  const specification = normalizeIdentitySpecification(
    object(record.specification, `${expectedCode} decision fragment specification`),
    `${expectedCode} decision fragment specification must contain exact keys`,
    `${expectedCode} decision fragment must retain the reviewed Sixth Edition source identity`,
  );
  const parent = normalizeParent(
    object(record.parent, `${expectedCode} decision fragment parent`),
    `${expectedCode} decision fragment parent must contain exact keys`,
    `${expectedCode} decision fragment must retain parent T1 / #75`,
  );
  if (record.code !== expectedCode) {
    throw new Es2015ProvenanceError(
      `${expectedCode} decision fragment must retain code ${expectedCode}`,
    );
  }
  if (!Array.isArray(record.decisions)) {
    throw new Es2015ProvenanceError(
      `${expectedCode} decision fragment decisions must be an array`,
    );
  }
  const decisions = record.decisions.map((decision) =>
    normalizeDecisionRecord(
      object(decision, `${expectedCode} decision`),
      {
        code: expectedCode,
        exactLists: options.exactLists,
        allowPendingReview: true,
        requireArtifactSha256: true,
        skipSemanticValidation: false,
      },
    ),
  );
  const paths = decisions.map((decision) => decision.path);
  if (options.exactLists) {
    assertSortedUniquePaths(
      paths,
      `${expectedCode} decision fragment decisions`,
    );
  }
  return {
    version: ES2015_PROVENANCE_VERSION,
    repository: TEST262_REPOSITORY,
    revision: TEST262_REVISION,
    specification,
    parent,
    code: expectedCode,
    decisions: Object.freeze(decisions),
  };
}

/**
 * @param {Record<string, any>} record
 * @param {{ code: string, exactLists: boolean, allowPendingReview: boolean, requireArtifactSha256: boolean, skipSemanticValidation?: boolean }} options
 */
function normalizeDecisionRecord(record, options) {
  const pathLabel = `${options.code} decision`;
  const path = typeof record.path === 'string' ? record.path : undefined;
  const decisionLabel =
    typeof path === 'string' ? `${options.code} decision for ${path}` : pathLabel;
  requireExactKeys(
    record,
    options.requireArtifactSha256 ? DECISION_KEYS : DECISION_KEYS_WITHOUT_HASH,
    `${decisionLabel} must contain exact keys`,
  );
  assertRootPath(record.path, `${decisionLabel} path`);
  if (!Number.isInteger(record.variants) || record.variants < 0) {
    throw new Es2015ProvenanceError(
      `${decisionLabel} must retain a non-negative variant count`,
    );
  }
  if (typeof record.priorClass !== 'string' || record.priorClass === '') {
    throw new Es2015ProvenanceError(
      `${decisionLabel} must retain a prior class`,
    );
  }
  const finalPartition = normalizePartition(record.finalPartition, decisionLabel);
  const finalStatus = normalizeStatus(record.finalStatus, decisionLabel);
  if (!options.skipSemanticValidation) {
    validatePartitionStatusPair(finalPartition, finalStatus, decisionLabel);
  }
  const evidenceKind = normalizeEvidenceKind(record.evidenceKind, decisionLabel);
  const specification = normalizeDecisionSpecification(
    object(record.specification, `${decisionLabel} specification`),
    evidenceKind,
    decisionLabel,
  );
  const metadata = normalizeDecisionMetadata(
    object(record.metadata, `${decisionLabel} metadata`),
    options.exactLists,
    decisionLabel,
  );
  const history = normalizeHistory(record.history, decisionLabel);
  if (typeof record.rationale !== 'string' || record.rationale.trim() === '') {
    throw new Es2015ProvenanceError(`${decisionLabel} requires a rationale`);
  }
  const review = normalizeReview(
    object(record.review, `${decisionLabel} review`),
    options.allowPendingReview,
    decisionLabel,
    options.skipSemanticValidation === true,
  );
  const destination = normalizeDestination(
    object(record.destination, `${decisionLabel} destination`),
    finalStatus,
    decisionLabel,
    options.skipSemanticValidation === true,
  );
  if (
    options.requireArtifactSha256 &&
    (typeof record.artifactSha256 !== 'string' || !isHex64(record.artifactSha256))
  ) {
    throw new Es2015ProvenanceError(
      `${decisionLabel} artifactSha256 must be a SHA-256 hex string`,
    );
  }
  const normalized = {
    path: record.path,
    variants: record.variants,
    priorClass: record.priorClass,
    finalPartition,
    finalStatus,
    evidenceKind,
    specification,
    metadata,
    history,
    rationale: record.rationale,
    review,
    destination,
    artifactSha256:
      typeof record.artifactSha256 === 'string' ? record.artifactSha256 : null,
  };
  if (!options.skipSemanticValidation && normalized.evidenceKind === 'history-only') {
    throw new Es2015ProvenanceError(
      `${decisionLabel} cannot rely on history alone`,
    );
  }
  const expectedHash = sha256(
    JSON.stringify(canonicalDecisionRecord(normalized, false)),
  );
  if (
    options.requireArtifactSha256 &&
    normalized.artifactSha256 !== expectedHash
  ) {
    throw new Es2015ProvenanceError(
      `${decisionLabel} artifactSha256 does not match the canonical record`,
    );
  }
  return {
    ...normalized,
    artifactSha256: options.requireArtifactSha256
      ? normalized.artifactSha256
      : expectedHash,
  };
}

/** @param {Record<string, any>} record @param {boolean} exactLists */
function normalizeBaseLedger(record, exactLists) {
  requireExactKeys(
    record,
    BASE_LEDGER_KEYS,
    `${ES2015_PROVENANCE_FILE} baseLedger must contain exact keys`,
  );
  const paths = normalizePathList(
    record.paths,
    `${ES2015_PROVENANCE_FILE} baseLedger.paths`,
    exactLists,
  );
  return {
    rootCount: nonNegativeInteger(
      record.rootCount,
      `${ES2015_PROVENANCE_FILE} baseLedger.rootCount`,
    ),
    variantCount: nonNegativeInteger(
      record.variantCount,
      `${ES2015_PROVENANCE_FILE} baseLedger.variantCount`,
    ),
    pathSha256: sha256Hex(
      record.pathSha256,
      `${ES2015_PROVENANCE_FILE} baseLedger.pathSha256`,
    ),
    paths,
  };
}

/** @param {Record<string, any>} record @param {boolean} exactLists */
function normalizeBatchRecord(record, exactLists) {
  requireExactKeys(
    record,
    BATCH_KEYS,
    `${ES2015_PROVENANCE_FILE} batch must contain exact keys`,
  );
  if (typeof record.code !== 'string' || record.code === '') {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} batch code must be a string`,
    );
  }
  if (typeof record.selector !== 'string' || record.selector.trim() === '') {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} batch ${record.code} must retain a selector`,
    );
  }
  if (typeof record.scope !== 'string' || record.scope.trim() === '') {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} batch ${record.code} must retain a scope`,
    );
  }
  if (!Array.isArray(record.entries)) {
    throw new Es2015ProvenanceError(
      `${ES2015_PROVENANCE_FILE} batch ${record.code} entries must be an array`,
    );
  }
  const entries = record.entries.map((entry) =>
    normalizeBatchEntry(
      object(entry, `${ES2015_PROVENANCE_FILE} batch ${record.code} entry`),
    ),
  );
  if (exactLists) {
    assertSortedUniquePaths(
      entries.map((entry) => entry.path),
      `${ES2015_PROVENANCE_FILE} batch ${record.code} entries`,
    );
  }
  return {
    code: record.code,
    selector: record.selector,
    scope: record.scope,
    rootCount: nonNegativeInteger(
      record.rootCount,
      `${ES2015_PROVENANCE_FILE} batch ${record.code}.rootCount`,
    ),
    variantCount: nonNegativeInteger(
      record.variantCount,
      `${ES2015_PROVENANCE_FILE} batch ${record.code}.variantCount`,
    ),
    pathSha256: sha256Hex(
      record.pathSha256,
      `${ES2015_PROVENANCE_FILE} batch ${record.code}.pathSha256`,
    ),
    entries,
  };
}

/** @param {Record<string, any>} record */
function normalizeBatchEntry(record) {
  requireExactKeys(
    record,
    BATCH_ENTRY_KEYS,
    'provenance batch entry must contain exact keys',
  );
  assertRootPath(record.path, 'provenance batch entry path');
  if (!Number.isInteger(record.variants) || record.variants < 0) {
    throw new Es2015ProvenanceError(
      `provenance batch entry ${record.path} must retain a non-negative variant count`,
    );
  }
  if (typeof record.priorClass !== 'string' || record.priorClass === '') {
    throw new Es2015ProvenanceError(
      `provenance batch entry ${record.path} must retain a prior class`,
    );
  }
  return {
    path: record.path,
    variants: record.variants,
    priorClass: record.priorClass,
  };
}

/** @param {Record<string, any>} record @param {string} keysMessage @param {string} pinsMessage */
function normalizeIdentitySpecification(record, keysMessage, pinsMessage) {
  requireExactKeys(record, SPECIFICATION_KEYS, keysMessage);
  if (
    record.source !== SPECIFICATION_SOURCE ||
    record.sourceSha256 !== SPECIFICATION_SHA256
  ) {
    throw new Es2015ProvenanceError(pinsMessage);
  }
  return {
    source: SPECIFICATION_SOURCE,
    sourceSha256: SPECIFICATION_SHA256,
  };
}

/** @param {Record<string, any>} record @param {string} keysMessage @param {string} parentMessage */
function normalizeParent(record, keysMessage, parentMessage) {
  requireExactKeys(record, PARENT_KEYS, keysMessage);
  if (record.code !== PARENT_CODE || record.issue !== PARENT_ISSUE) {
    throw new Es2015ProvenanceError(parentMessage);
  }
  return {
    code: PARENT_CODE,
    issue: PARENT_ISSUE,
  };
}

/** @param {Record<string, any>} record @param {string} evidenceKind @param {string} label */
function normalizeDecisionSpecification(record, evidenceKind, label) {
  requireExactKeys(
    record,
    DECISION_SPECIFICATION_KEYS,
    `${label} specification must contain exact keys`,
  );
  const clause = nullableString(record.clause, `${label} specification.clause`);
  const anchor = nullableString(record.anchor, `${label} specification.anchor`);
  if (
    evidenceKind.startsWith('sixth-edition') &&
    (record.source !== SPECIFICATION_SOURCE ||
      record.sourceSha256 !== SPECIFICATION_SHA256)
  ) {
    throw new Es2015ProvenanceError(
      `${label} specification must retain the reviewed Sixth Edition source identity`,
    );
  }
  if (evidenceKind === 'sixth-edition-clause' && clause === null) {
    throw new Es2015ProvenanceError(
      `${label} specification must name a reviewed clause`,
    );
  }
  if (evidenceKind === 'sixth-edition-anchor' && anchor === null) {
    throw new Es2015ProvenanceError(
      `${label} specification must name a reviewed anchor`,
    );
  }
  if (typeof record.source !== 'string' || record.source.trim() === '') {
    throw new Es2015ProvenanceError(`${label} specification.source must be a string`);
  }
  if (!isHex64(record.sourceSha256)) {
    throw new Es2015ProvenanceError(
      `${label} specification.sourceSha256 must be a SHA-256 hex string`,
    );
  }
  return {
    source: record.source,
    sourceSha256: record.sourceSha256,
    clause,
    anchor,
  };
}

/** @param {Record<string, any>} record @param {boolean} exactLists @param {string} label */
function normalizeDecisionMetadata(record, exactLists, label) {
  requireExactKeys(
    record,
    DECISION_METADATA_KEYS,
    `${label} metadata must contain exact keys`,
  );
  return {
    es5id: nullableString(record.es5id, `${label} metadata.es5id`),
    es6id: nullableString(record.es6id, `${label} metadata.es6id`),
    esid: nullableString(record.esid, `${label} metadata.esid`),
    features: normalizeStringList(
      record.features,
      `${label} metadata.features`,
      exactLists,
    ),
    includeFeatures: normalizeStringList(
      record.includeFeatures,
      `${label} metadata.includeFeatures`,
      exactLists,
    ),
    includes: normalizeStringList(
      record.includes,
      `${label} metadata.includes`,
      exactLists,
    ),
    flags: normalizeStringList(
      record.flags,
      `${label} metadata.flags`,
      exactLists,
    ),
  };
}

/** @param {unknown} value @param {string} label */
function normalizeHistory(value, label) {
  if (!Array.isArray(value)) {
    throw new Es2015ProvenanceError(`${label} history must be an array`);
  }
  return Object.freeze(
    value.map((entry, index) => {
      const record = object(entry, `${label} history[${index}]`);
      requireExactKeys(
        record,
        HISTORY_KEYS,
        `${label} history[${index}] must contain exact keys`,
      );
      if (record.repository !== TEST262_REPOSITORY) {
        throw new Es2015ProvenanceError(
          `${label} history[${index}] must retain the reviewed Test262 repository`,
        );
      }
      if (typeof record.commit !== 'string' || !/^[0-9a-f]{40}$/.test(record.commit)) {
        throw new Es2015ProvenanceError(
          `${label} history[${index}] commit must be a full hex SHA`,
        );
      }
      if (typeof record.note !== 'string' || record.note.trim() === '') {
        throw new Es2015ProvenanceError(
          `${label} history[${index}] note must be a string`,
        );
      }
      return Object.freeze({
        repository: TEST262_REPOSITORY,
        commit: record.commit,
        note: record.note,
      });
    }),
  );
}

/** @param {Record<string, any>} record @param {boolean} allowPendingReview @param {string} label @param {boolean} skipSemanticValidation */
function normalizeReview(record, allowPendingReview, label, skipSemanticValidation) {
  requireExactKeys(record, REVIEW_KEYS, `${label} review must contain exact keys`);
  const pending =
    record.reviewer === 'pending' &&
    record.reviewedAt === 'pending' &&
    record.artifact === 'pending';
  if (pending) {
    if (!allowPendingReview) {
      throw new Es2015ProvenanceError(
        `${label} review.reviewedAt must be a UTC RFC3339 timestamp`,
      );
    }
    return {
      reviewer: 'pending',
      reviewedAt: 'pending',
      artifact: 'pending',
    };
  }
  if (typeof record.reviewer !== 'string' || record.reviewer.trim() === '') {
    throw new Es2015ProvenanceError(`${label} review.reviewer must be a string`);
  }
  if (skipSemanticValidation) {
    if (
      typeof record.reviewedAt !== 'string' ||
      record.reviewedAt.trim() === '' ||
      typeof record.artifact !== 'string' ||
      record.artifact.trim() === ''
    ) {
      throw new Es2015ProvenanceError(`${label} review fields must be strings`);
    }
    return {
      reviewer: record.reviewer,
      reviewedAt: record.reviewedAt,
      artifact: record.artifact,
    };
  }
  if (typeof record.reviewedAt !== 'string' || !RFC3339_UTC.test(record.reviewedAt)) {
    throw new Es2015ProvenanceError(
      `${label} review.reviewedAt must be a UTC RFC3339 timestamp`,
    );
  }
  if (typeof record.artifact !== 'string' || !REVIEW_URL.test(record.artifact)) {
    throw new Es2015ProvenanceError(
      `${label} review.artifact must be a reviewed GitHub jsjs URL`,
    );
  }
  return {
    reviewer: record.reviewer,
    reviewedAt: record.reviewedAt,
    artifact: record.artifact,
  };
}

/** @param {Record<string, any>} record @param {string} finalStatus @param {string} label @param {boolean} skipSemanticValidation */
function normalizeDestination(record, finalStatus, label, skipSemanticValidation) {
  requireExactKeys(
    record,
    DESTINATION_KEYS,
    `${label} destination must contain exact keys`,
  );
  const blocker = nullableString(record.blocker, `${label} destination.blocker`);
  const issue = nullableInteger(record.issue, `${label} destination.issue`);
  if (skipSemanticValidation) {
    return { blocker, issue };
  }
  if (finalStatus.startsWith('blocked:')) {
    const namedBlocker = finalStatus.slice('blocked:'.length);
    if (blocker !== namedBlocker || !BLOCKERS.has(namedBlocker)) {
      throw new Es2015ProvenanceError(
        `${label} names unknown blocker ${namedBlocker}`,
      );
    }
    if (issue === null) {
      throw new Es2015ProvenanceError(`${label} requires a destination issue`);
    }
  } else if (blocker !== null || issue !== null) {
    throw new Es2015ProvenanceError(
      `${label} destination applies only to blocked core decisions`,
    );
  }
  return { blocker, issue };
}

/** @param {unknown} finalPartition @param {string} label */
function normalizePartition(finalPartition, label) {
  const partitions = new Set([
    'annex-b',
    'core',
    'harness-validation',
    'later-or-non-es2015',
    'malformed',
  ]);
  if (typeof finalPartition !== 'string' || !partitions.has(finalPartition)) {
    throw new Es2015ProvenanceError(
      `${label} finalPartition must be a reviewed destination`,
    );
  }
  return finalPartition;
}

/** @param {unknown} finalStatus @param {string} label */
function normalizeStatus(finalStatus, label) {
  if (typeof finalStatus !== 'string' || finalStatus === '') {
    throw new Es2015ProvenanceError(`${label} finalStatus must be a string`);
  }
  return finalStatus;
}

/** @param {string} finalPartition @param {string} finalStatus @param {string} label */
function validatePartitionStatusPair(finalPartition, finalStatus, label) {
  if (finalPartition === 'core') {
    if (
      finalStatus === 'selected-passing' ||
      finalStatus === 'audit-passing-unselected' ||
      finalStatus === 'intentional-deviation'
    ) {
      return;
    }
    if (finalStatus.startsWith('blocked:')) {
      return;
    }
    throw new Es2015ProvenanceError(
      `${label} has an invalid final partition/status pair`,
    );
  }
  if (finalPartition !== finalStatus) {
    throw new Es2015ProvenanceError(
      `${label} has an invalid final partition/status pair`,
    );
  }
}

/** @param {unknown} value @param {string} label */
function normalizeEvidenceKind(value, label) {
  const kinds = new Set([
    'sixth-edition-clause',
    'sixth-edition-anchor',
    'metadata-proof',
    'include-feature-closure',
    'later-edition-proof',
    'manual-semantic-review',
    'history-only',
  ]);
  if (typeof value !== 'string' || !kinds.has(value)) {
    throw new Es2015ProvenanceError(`${label} evidenceKind is unsupported`);
  }
  return value;
}

/** @param {unknown} value @param {string} label @param {boolean} exactLists */
function normalizeStringList(value, label, exactLists) {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || entry === '')
  ) {
    throw new Es2015ProvenanceError(`${label} must be non-empty strings`);
  }
  const list = [...value];
  if (exactLists) {
    assertSortedUniqueStrings(list, label);
  }
  return Object.freeze(list);
}

/** @param {unknown} value @param {string} label @param {boolean} exactLists */
function normalizePathList(value, label, exactLists) {
  if (!Array.isArray(value)) {
    throw new Es2015ProvenanceError(`${label} must be a path array`);
  }
  const paths = value.map((entry) => {
    assertRootPath(entry, label);
    return entry;
  });
  if (exactLists) {
    assertSortedUniquePaths(paths, label);
  }
  return Object.freeze(paths);
}

/** @param {unknown} value @param {string} label */
function nullableString(value, label) {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Es2015ProvenanceError(`${label} must be a string or null`);
  }
  return value;
}

/** @param {unknown} value @param {string} label */
function nullableInteger(value, label) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Es2015ProvenanceError(`${label} must be a positive integer or null`);
  }
  return value;
}

/** @param {unknown} value @param {string} label */
function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Es2015ProvenanceError(`${label} must be a non-negative integer`);
  }
  return value;
}

/** @param {unknown} value @param {string} label */
function sha256Hex(value, label) {
  if (typeof value !== 'string' || !isHex64(value)) {
    throw new Es2015ProvenanceError(`${label} must be a SHA-256 hex string`);
  }
  return value;
}

/** @param {unknown} path @param {string} label */
function assertRootPath(path, label) {
  if (
    typeof path !== 'string' ||
    !path.startsWith(ROOT_PREFIX) ||
    !path.endsWith('.js') ||
    isTest262FixtureDependencyPath(path)
  ) {
    throw new Es2015ProvenanceError(`${label} must be a non-fixture test/*.js path`);
  }
}

/** @param {readonly string[]} values @param {string} label */
function assertSortedUniqueStrings(values, label) {
  if (!isSorted(values) || new Set(values).size !== values.length) {
    throw new Es2015ProvenanceError(
      `${label} must be code-unit sorted unique strings`,
    );
  }
}

/** @param {readonly string[]} values @param {string} label */
function assertSortedUniquePaths(values, label) {
  if (!isSorted(values) || new Set(values).size !== values.length) {
    throw new Es2015ProvenanceError(
      `${label} must be code-unit sorted unique paths`,
    );
  }
}

/** @param {readonly string[]} values @param {string} label */
function assertUnique(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Es2015ProvenanceError(`${label} must not repeat entries`);
  }
}

/** @param {readonly string[]} values @param {string} label */
function assertUniqueBasePaths(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Es2015ProvenanceError(`${label} must not repeat base paths`);
  }
}

/** @param {readonly string[]} values */
function duplicatesOf(values) {
  const seen = new Set();
  const duplicates = [];
  for (const value of values) {
    if (seen.has(value)) duplicates.push(value);
    seen.add(value);
  }
  return duplicates;
}

/** @param {readonly string[]} values */
function isSorted(values) {
  return values.join('\u0000') === sortStrings(values).join('\u0000');
}

/** @param {string} value */
function isHex64(value) {
  return /^[0-9a-f]{64}$/.test(value);
}

/** @param {string} repository @param {string} revision @param {string} message */
function validateReviewedRepositoryRevision(repository, revision, message) {
  if (repository !== TEST262_REPOSITORY || revision !== TEST262_REVISION) {
    throw new Es2015ProvenanceError(message);
  }
}

/** @param {string} code */
function assertDecisionCode(code) {
  if (!ES2015_PROVENANCE_DECISION_CODES.includes(code)) {
    throw new Es2015ProvenanceError(
      `${code} is not an approved ES2015 provenance decision code`,
    );
  }
}

/** @param {unknown} value */
function normalizeFragments(value) {
  if (value instanceof Map) {
    return new Map(value);
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return new Map(Object.entries(value));
  }
  throw new Es2015ProvenanceError('Provenance decision fragments must be a map or object');
}

/** @param {unknown} value */
function normalizeIssueMap(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Es2015ProvenanceError('Issue map must be an object');
  }
  const map = new Map();
  for (const code of ALL_RENDER_CODES) {
    const entry = /** @type {Record<string, any>} */ (value)[code];
    if (entry === undefined) continue;
    if (Number.isInteger(entry) && entry > 0) {
      map.set(code, entry);
      continue;
    }
    if (
      typeof entry === 'object' &&
      entry !== null &&
      Number.isInteger(entry.number) &&
      entry.number > 0
    ) {
      map.set(code, entry.number);
      continue;
    }
    throw new Es2015ProvenanceError(`Issue map entry ${code} must provide a positive issue number`);
  }
  return map;
}

/** @param {unknown} value */
function normalizeRequiredCodes(value) {
  if (value === undefined) return new Set();
  if (!Array.isArray(value)) {
    throw new Es2015ProvenanceError('requireCompleteCodes must be an array');
  }
  const codes = new Set();
  for (const code of value) {
    if (typeof code !== 'string') {
      throw new Es2015ProvenanceError('requireCompleteCodes must contain strings');
    }
    assertDecisionCode(code);
    codes.add(code);
  }
  return codes;
}

/** @param {string[]} paths */
function hashPaths(paths) {
  return sha256(`${paths.join('\n')}\n`);
}

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** @param {string} path */
function decisionCodeForPath(path) {
  if (path.startsWith('test/annexB/')) return 'UA';
  if (path.startsWith('test/built-ins/')) return 'UB';
  if (path.startsWith('test/language/expressions/')) {
    const topic = path.slice('test/language/expressions/'.length).split('/')[0];
    if (LANGUAGE_ASSIGNMENT_TOPICS.has(topic)) return 'UL1';
    if (LANGUAGE_OBJECT_TOPICS.has(topic)) return 'UL2';
  }
  if (path.startsWith('test/language/statements/class/')) return 'UL2';
  if (path.startsWith('test/language/')) {
    const topic = path.slice('test/language/'.length).split('/')[0];
    if (LANGUAGE_ENVIRONMENT_TOPICS.has(topic)) return 'UL4';
    return 'UL3';
  }
  if (path === SPECIAL_US6_PATH) return 'US6';
  if (path.startsWith('test/staging/sm/')) {
    const topic = path.slice('test/staging/sm/'.length).split('/')[0];
    if (STAGING_US1_TOPICS.has(topic)) return 'US1';
    if (STAGING_US2_TOPICS.has(topic)) return 'US2';
    if (STAGING_US3_TOPICS.has(topic)) return 'US3';
    if (STAGING_US4_TOPICS.has(topic)) return 'US4';
    if (STAGING_US5_TOPICS.has(topic)) return 'US5';
    if (STAGING_US6_TOPICS.has(topic)) return 'US6';
    if (STAGING_US7_TOPICS.has(topic)) return 'US7';
  }
  throw new Es2015ProvenanceError(
    `Unknown-edition root ${path} does not match an approved provenance batch`,
  );
}

/** @param {unknown} record */
function normalizeClassificationRecord(record) {
  const value = object(record, 'ES2015 provenance classification');
  assertRootPath(value.path, 'ES2015 provenance classification path');
  if (!Number.isInteger(value.variants) || value.variants < 0) {
    throw new Es2015ProvenanceError(
      `ES2015 provenance classification ${value.path} has an invalid variant count`,
    );
  }
  if (typeof value.partition !== 'string' || value.partition === '') {
    throw new Es2015ProvenanceError(
      `ES2015 provenance classification ${value.path} must name a partition`,
    );
  }
  if (typeof value.finalClass !== 'string' || value.finalClass === '') {
    throw new Es2015ProvenanceError(
      `ES2015 provenance classification ${value.path} must name a prior class`,
    );
  }
  return {
    path: value.path,
    variants: value.variants,
    partition: value.partition,
    finalClass: value.finalClass,
  };
}

/** @param {readonly { path: string, variants: number, priorClass: string }[]} entries */
function sortEntries(entries) {
  return [...entries].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
}

/** @param {{ batches: readonly { code: string }[] }} manifest @param {string} code */
function batchByCode(manifest, code) {
  const batch = manifest.batches.find((entry) => entry.code === code);
  if (batch === undefined) {
    throw new Es2015ProvenanceError(`${code} is not a known provenance ledger code`);
  }
  return batch;
}

/** @param {unknown} manifest @param {string} code */
function renderLedgerSummary(manifest, code) {
  if (code === 'U0') {
    return { rootCount: 0, variantCount: 0, pathSha256: EMPTY_LEDGER_SHA256 };
  }
  const definition = ISSUE_DEFINITIONS[code];
  if (definition === undefined) {
    throw new Es2015ProvenanceError(`${code} is not a known provenance issue code`);
  }
  const paths = [];
  let variants = 0;
  for (const batchCode of definition.aggregateCodes) {
    const batch = batchByCode(object(manifest, 'manifest'), batchCode);
    for (const entry of batch.entries) {
      paths.push(entry.path);
      variants += entry.variants;
    }
  }
  const sortedPaths = sortStrings(paths);
  return {
    rootCount: sortedPaths.length,
    variantCount: variants,
    pathSha256: hashPaths(sortedPaths),
  };
}

/** @param {Record<string, any>} decision @param {boolean} includeArtifactSha256 */
function canonicalDecisionRecord(decision, includeArtifactSha256) {
  const record = {
    path: decision.path,
    variants: decision.variants,
    priorClass: decision.priorClass,
    finalPartition: decision.finalPartition,
    finalStatus: decision.finalStatus,
    evidenceKind: decision.evidenceKind,
    specification: {
      source: decision.specification.source,
      sourceSha256: decision.specification.sourceSha256,
      clause: decision.specification.clause,
      anchor: decision.specification.anchor,
    },
    metadata: {
      es5id: decision.metadata.es5id,
      es6id: decision.metadata.es6id,
      esid: decision.metadata.esid,
      features: [...decision.metadata.features],
      includeFeatures: [...decision.metadata.includeFeatures],
      includes: [...decision.metadata.includes],
      flags: [...decision.metadata.flags],
    },
    history: decision.history.map((entry) => ({
      repository: entry.repository,
      commit: entry.commit,
      note: entry.note,
    })),
    rationale: decision.rationale,
    review: {
      reviewer: decision.review.reviewer,
      reviewedAt: decision.review.reviewedAt,
      artifact: decision.review.artifact,
    },
    destination: {
      blocker: decision.destination.blocker,
      issue: decision.destination.issue,
    },
  };
  if (includeArtifactSha256) {
    return {
      ...record,
      artifactSha256: decision.artifactSha256,
    };
  }
  return record;
}

/** @param {any} value */
function deepFreeze(value) {
  if (Array.isArray(value)) {
    for (const entry of value) deepFreeze(entry);
    return Object.freeze(value);
  }
  if (typeof value === 'object' && value !== null) {
    for (const entry of Object.values(value)) deepFreeze(entry);
    return Object.freeze(value);
  }
  return value;
}
