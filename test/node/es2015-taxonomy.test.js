import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertSame, assertThrows } from '../harness/assert.js';
import {
  Es2015TaxonomyError,
  buildEs2015Inventory,
  classifyEs2015Inventory,
  parseEs2015Anchors,
  parseEs2015Policy,
  renderEs2015Taxonomy,
  summarizeEs2015Classification,
} from '../../tools/test262/es2015-taxonomy.js';
import {
  createAuditDependencies,
  Es2015AuditError,
  main as auditEs2015Taxonomy,
} from '../../tools/test262/es2015-audit.js';
import {
  ES2015_PROVENANCE_DECISION_CODES,
  ES2015_PROVENANCE_FILE,
  buildProvenanceFoundation,
} from '../../tools/test262/es2015-provenance.js';

const FIXTURE_ROOT = new URL('../fixtures/es2015-taxonomy/', import.meta.url);
const PHYSICAL_FIXTURE_PATHS = new Map([
  ['test/language/malformed.js', 'test/language/malformed.js.txt'],
]);
const readFileSyncText =
  /** @type {(path: URL, encoding: string) => string} */ (
    /** @type {any} */ (fs).readFileSync
  );
const POLICY = JSON.stringify({
  version: 1,
  repository: 'https://github.com/tc39/test262.git',
  revision: 'b363f29d3c43c626dc852744ad64a0b48a003693',
  specification: {
    source: 'https://262.ecma-international.org/6.0/',
    sourceSha256:
      '4d4243dc2f04c9cdd09498f2cc2af6f6cdc07b0430da5578e7cf440d4f7846a0',
  },
  es2015Features: ['let'],
  laterFeatures: ['async-functions'],
  neutralFeatures: ['cross-realm'],
  laterFlags: ['CanBlockIsFalse', 'CanBlockIsTrue'],
  pathRules: [
    {
      prefix: 'test/annexB/',
      partition: 'annex-b',
      reason: 'Normative-optional Annex B tests stay separate from core.',
    },
    {
      prefix: 'test/intl402/',
      partition: 'later-or-non-es2015',
      reason: 'ECMA-402 tests are not ECMAScript 2015 core coverage.',
    },
  ],
});
const ANCHORS = JSON.stringify({
  version: 1,
  source: 'https://262.ecma-international.org/6.0/',
  sourceSha256:
    '4d4243dc2f04c9cdd09498f2cc2af6f6cdc07b0430da5578e7cf440d4f7846a0',
  anchors: ['sec-anchor'],
});

/** @param {string} path */
async function fixture(path) {
  return readFile(
    new URL(PHYSICAL_FIXTURE_PATHS.get(path) ?? path, FIXTURE_ROOT),
    'utf8',
  );
}

/** @param {unknown} value */
function json(value) {
  return JSON.stringify(value);
}

const AUDIT_PATH = 'tools/test262/es2015-taxonomy.json';
const AUDIT_PIN = {
  repository: 'https://github.com/tc39/test262.git',
  revision: 'b363f29d3c43c626dc852744ad64a0b48a003693',
  checkoutPath: 'vendor/test262',
};
const AUDIT_SUBSET = JSON.stringify({
  version: 1,
  repository: AUDIT_PIN.repository,
  revision: AUDIT_PIN.revision,
  groups: [
    {
      name: 'fixture',
      summary: 'A selected fixture root.',
      paths: ['test/language/selected.js'],
    },
  ],
});
const AUDIT_FEATURES = JSON.stringify({ version: 1, features: [] });
const AUDIT_PROMOTION_PATH = 'test/language/audited.js';
const AUDIT_PROMOTION_SUBSET = JSON.stringify({
  version: 1,
  repository: AUDIT_PIN.repository,
  revision: AUDIT_PIN.revision,
  groups: [
    {
      name: 'es2015/audit-passing-promotion',
      summary: 'An exact reviewed promotion fixture root.',
      paths: [AUDIT_PROMOTION_PATH],
    },
    {
      name: 'fixture',
      summary: 'A selected fixture root.',
      paths: ['test/language/selected.js'],
    },
  ],
});
const AUDIT_ROOTS = new Map([
  [
    'test/language/audited.js',
    '/*---\ndescription: Audited fixture.\nes6id: 13.2\n---*/\n',
  ],
  [
    'test/language/selected.js',
    '/*---\ndescription: Selected fixture.\nes5id: 15.1\n---*/\n',
  ],
]);
const AUDIT_EVIDENCE_PATH = 'tools/test262/es2015-audit-evidence.json';
const REAL_AUDIT_SELECTED = 'test/built-ins/Array/15.4.5-1.js';
const REAL_AUDIT_UNSELECTED =
  'test/built-ins/Array/from/items-is-null-throws.js';
const REAL_ATOMICS_HELPER = 'test/built-ins/Atomics/notify/notify-zero.js';
const AUDIT_RECORDS = Object.freeze([
  {
    type: 'test',
    file: 'test/language/audited.js',
    variant: 'non-strict',
    status: 'passed',
  },
  {
    type: 'test',
    file: 'test/language/audited.js',
    variant: 'strict',
    status: 'passed',
  },
]);

/**
 * @param {{
 *   auditRecords?: readonly object[],
 *   blockers?: Record<string, string>,
 *   intentionalDeviations?: readonly string[],
 * }} [options]
 */
function auditEvidence(options = {}) {
  return JSON.stringify({
    version: 1,
    repository: AUDIT_PIN.repository,
    revision: AUDIT_PIN.revision,
    auditRecords: options.auditRecords ?? AUDIT_RECORDS,
    blockers: options.blockers ?? {},
    intentionalDeviations: options.intentionalDeviations ?? [],
  });
}

const AUDIT_EVIDENCE = auditEvidence();
const EXACT_PATHS_FILE = '/absolute/exact.paths.txt';
const PROVENANCE_DECISIONS_DIRECTORY =
  'tools/test262/es2015-provenance-decisions';
/** @type {ReturnType<typeof buildProvenanceFoundation> | undefined} */
let cachedApprovedProvenanceManifest;

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** @param {ReturnType<typeof buildProvenanceFoundation>} manifest @param {string} code */
function emptyDecisionFragmentText(manifest, code) {
  return `${JSON.stringify(
    {
      version: manifest.version,
      taxonomyBaseline: manifest.taxonomyBaseline,
      repository: manifest.repository,
      revision: manifest.revision,
      specification: manifest.specification,
      parent: manifest.parent,
      code,
      decisions: [],
    },
    null,
    2,
  )}\n`;
}

function approvedProvenanceManifest() {
  if (cachedApprovedProvenanceManifest !== undefined) {
    return cachedApprovedProvenanceManifest;
  }
  const taxonomy = JSON.parse(
    readFileSyncText(
      new URL('../../tools/test262/es2015-taxonomy.json', import.meta.url),
      'utf8',
    ),
  );
  cachedApprovedProvenanceManifest = buildProvenanceFoundation(
    taxonomy.classifications.map((/** @type {any} */ record) => ({
      path: record.path,
      variants: record.variants,
      partition: record.partition,
      finalClass: record.status,
    })),
  );
  return cachedApprovedProvenanceManifest;
}

function provenanceFixtureFiles() {
  const manifest = approvedProvenanceManifest();
  /** @type {Map<string, string>} */
  const files = new Map([
    [ES2015_PROVENANCE_FILE, `${JSON.stringify(manifest, null, 2)}\n`],
  ]);
  for (const code of ES2015_PROVENANCE_DECISION_CODES) {
    files.set(
      `${PROVENANCE_DECISIONS_DIRECTORY}/${code}.json`,
      emptyDecisionFragmentText(manifest, code),
    );
  }
  return files;
}

const AUDIT_PROMOTION = JSON.stringify({
  version: 1,
  repository: AUDIT_PIN.repository,
  revision: AUDIT_PIN.revision,
  sourceTaxonomySha256: sha256('pre-promotion fixture taxonomy\n'),
  ledgerSha256: sha256(`${AUDIT_PROMOTION_PATH}\n`),
  rootCount: 1,
  variantCount: 2,
  entries: [
    {
      path: AUDIT_PROMOTION_PATH,
      variants: 2,
      features: [],
      includeFeatures: [],
    },
  ],
});
const H0_AUDIT_PASSED_PATH = 'test/language/h0-passed.js';
const H0_AUDIT_REASSIGNED_PATH = 'test/built-ins/Proxy/h0-failed.js';
const H0_AUDIT_PATHS = Object.freeze([
  H0_AUDIT_REASSIGNED_PATH,
  H0_AUDIT_PASSED_PATH,
]);
const H0_AUDIT_TAXONOMY = `${JSON.stringify({
  version: 3,
  pin: {
    repository: AUDIT_PIN.repository,
    revision: AUDIT_PIN.revision,
  },
  classifications: [
    {
      path: H0_AUDIT_REASSIGNED_PATH,
      variants: 2,
      partition: 'core',
      status: 'blocked:test262-cross-realm-host',
      blocker: 'test262-cross-realm-host',
      features: [],
      flags: [],
      includes: [],
      provenance: ['es6id'],
    },
    {
      path: H0_AUDIT_PASSED_PATH,
      variants: 2,
      partition: 'core',
      status: 'blocked:test262-cross-realm-host',
      blocker: 'test262-cross-realm-host',
      features: ['cross-realm'],
      flags: [],
      includes: [],
      provenance: ['feature:cross-realm'],
    },
  ],
})}\n`;
const H0_AUDIT_PATHS_MANIFEST = JSON.stringify({
  version: 1,
  repository: AUDIT_PIN.repository,
  revision: AUDIT_PIN.revision,
  sourceTaxonomySha256: sha256(H0_AUDIT_TAXONOMY),
  ledgerSha256: sha256(`${H0_AUDIT_PATHS.join('\n')}\n`),
  rootCount: 2,
  variantCount: 4,
  paths: H0_AUDIT_PATHS,
});
const H0_AUDIT_OWNER_MAP = JSON.stringify({
  version: 1,
  repository: AUDIT_PIN.repository,
  revision: AUDIT_PIN.revision,
  owners: [
    {
      code: 'M2',
      issue: 81,
      blocker: 'proxy-and-reflect-metaobject',
      title: 'Implement ES2015 Proxy traps, revocation, and invariants',
    },
  ],
  rules: [
    {
      name: 'proxy-ordinary-object-throw',
      primaryOwner: 'M2',
      pathPrefix: 'test/built-ins/Proxy/',
      failureSignatures: ['unexpected-throw:Object'],
      secondaryEvidence: [],
    },
  ],
});
const H0_AUDIT_RECORDS = Object.freeze([
  {
    type: 'test',
    file: H0_AUDIT_REASSIGNED_PATH,
    variant: 'non-strict',
    status: 'failed',
    reason: 'unexpected-throw',
    message: 'Object',
  },
  {
    type: 'test',
    file: H0_AUDIT_REASSIGNED_PATH,
    variant: 'strict',
    status: 'failed',
    reason: 'unexpected-throw',
    message: 'Object',
  },
  {
    type: 'test',
    file: H0_AUDIT_PASSED_PATH,
    variant: 'non-strict',
    status: 'passed',
  },
  {
    type: 'test',
    file: H0_AUDIT_PASSED_PATH,
    variant: 'strict',
    status: 'passed',
  },
]);
const AUDIT_COVERAGE_DOCUMENT = [
  '# Fixture coverage',
  '',
  '<!-- test262-coverage:begin -->',
  '',
  'stale coverage',
  '',
  '<!-- test262-coverage:end -->',
  '',
].join('\n');

/**
 * @param {string} cwd
 * @param {readonly string[]} args
 */
function runGit(cwd, args) {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'git command failed');
  }

  return result.stdout.trim();
}

/**
 * @param {URL} root
 * @param {string} path
 * @param {string} text
 */
async function writeFixtureFile(root, path, text) {
  const slash = path.lastIndexOf('/');

  if (slash !== -1) {
    await mkdir(new URL(`${path.slice(0, slash + 1)}`, root), {
      recursive: true,
    });
  }

  await writeFile(new URL(path, root), text, 'utf8');
}

/**
 * @returns {Promise<{
 *   root: URL,
 *   checkout: URL,
 *   pin: { repository: string, revision: string, checkoutPath: string },
 * }>}
 */
async function createRealAuditFixture() {
  const root = new URL(`.es2015-audit-${randomUUID()}/`, import.meta.url);
  const checkout = new URL('vendor/test262/', root);

  await mkdir(root);
  await mkdir(checkout, { recursive: true });
  await writeFixtureFile(
    checkout,
    REAL_AUDIT_SELECTED,
    '/*---\ndescription: Selected fixture.\nes5id: 15.4.5-1\n---*/\n',
  );
  await writeFixtureFile(
    checkout,
    REAL_AUDIT_UNSELECTED,
    '/*---\ndescription: Audited ES2015 fixture.\nesid: sec-map-constructor\nfeatures: [Map]\n---*/\n',
  );
  await writeFixtureFile(
    checkout,
    REAL_ATOMICS_HELPER,
    '/*---\ndescription: Transitive Atomics fixture.\nesid: sec-atomics.notify\nincludes: [atomicsHelper.js]\nfeatures: [SharedArrayBuffer, TypedArray]\n---*/\n',
  );
  await writeFixtureFile(checkout, 'harness/atomicsHelper.js', '// fixture\n');
  await writeFixtureFile(
    checkout,
    'harness/features.yml',
    'atomicsHelper: [Atomics]\n',
  );
  const checkoutPath = fileURLToPath(checkout);
  runGit(checkoutPath, ['init', '--quiet']);
  runGit(checkoutPath, ['config', 'user.email', 'fixture@example.test']);
  runGit(checkoutPath, ['config', 'user.name', 'ES2015 audit fixture']);
  runGit(checkoutPath, ['add', '.']);
  runGit(checkoutPath, ['commit', '--quiet', '-m', 'fixture root']);
  await writeFixtureFile(checkout, 'fixture-HEAD.txt', 'second commit\n');
  runGit(checkoutPath, ['add', 'fixture-HEAD.txt']);
  runGit(checkoutPath, ['commit', '--quiet', '-m', 'fixture head']);
  const pin = {
    ...AUDIT_PIN,
    revision: runGit(checkoutPath, ['rev-parse', 'HEAD']),
  };
  runGit(checkoutPath, ['checkout', '--quiet', '--detach', pin.revision]);

  await writeFixtureFile(
    root,
    'package.json',
    JSON.stringify({
      type: 'module',
      test262: pin,
    }),
  );
  await writeFixtureFile(
    root,
    'tools/test262/es2015-policy.json',
    JSON.stringify({
      ...JSON.parse(POLICY),
      revision: pin.revision,
      es2015Features: ['Map', 'TypedArray', 'let'],
      laterFeatures: ['Atomics', 'SharedArrayBuffer', 'async-functions'],
    }),
  );
  await writeFixtureFile(root, 'tools/test262/es2015-anchors.json', ANCHORS);
  for (const [path, text] of provenanceFixtureFiles()) {
    await writeFixtureFile(root, path, text);
  }
  await writeFixtureFile(
    root,
    'tools/test262/upstream-subset.json',
    JSON.stringify({
      version: 1,
      repository: pin.repository,
      revision: pin.revision,
      groups: [
        {
          name: 'fixture',
          summary: 'A selected real Test262 fixture root.',
          paths: [REAL_AUDIT_SELECTED],
        },
      ],
    }),
  );
  await writeFixtureFile(root, 'tools/test262/features.json', AUDIT_FEATURES);
  await writeFixtureFile(
    root,
    'docs/test262-report.jsonl',
    `${JSON.stringify({
      type: 'test',
      file: REAL_AUDIT_SELECTED,
      variant: 'non-strict',
      status: 'passed',
    })}\n${JSON.stringify({
      type: 'test',
      file: REAL_AUDIT_SELECTED,
      variant: 'strict',
      status: 'passed',
    })}\n`,
  );
  await writeFixtureFile(
    root,
    AUDIT_EVIDENCE_PATH,
    JSON.stringify({
      version: 1,
      repository: pin.repository,
      revision: pin.revision,
      auditRecords: [
        {
          type: 'test',
          file: REAL_AUDIT_UNSELECTED,
          variant: 'non-strict',
          status: 'passed',
        },
        {
          type: 'test',
          file: REAL_AUDIT_UNSELECTED,
          variant: 'strict',
          status: 'passed',
        },
      ],
      blockers: {},
      intentionalDeviations: [],
    }),
  );
  await writeFixtureFile(root, AUDIT_PATH, 'stale\n');

  return { root, checkout, pin };
}

/**
 * The production taxonomy policy deliberately accepts only the checked-in
 * Test262 revision. The integration fixture still writes and validates its
 * own Git pin, while this adapter presents the reviewed metadata identity to
 * the taxonomy parser.
 *
 * @param {{
 *   root: URL,
 *   checkout: URL,
 *   pin: { repository: string, revision: string, checkoutPath: string },
 * }} fixture
 * @param {{
 *   environment?: Record<string, string | undefined>,
 *   stderr?: (text: string) => void,
 * }} [options]
 */
function fixtureAuditDependencies(fixture, options = {}) {
  const dependencies = createAuditDependencies({
    repositoryRootUrl: fixture.root,
    environment: options.environment,
    stderr: options.stderr,
  });
  const pinnedMetadataFiles = new Set([
    'tools/test262/es2015-policy.json',
    'tools/test262/upstream-subset.json',
    AUDIT_EVIDENCE_PATH,
  ]);

  return {
    ...dependencies,
    readPin: async () => AUDIT_PIN,
    readFile: async (/** @type {string} */ path) => {
      const text = await dependencies.readFile(path);
      return pinnedMetadataFiles.has(path)
        ? text.split(fixture.pin.revision).join(AUDIT_PIN.revision)
        : text;
    },
    assertPinnedCheckout: async () => {
      const packagePin = JSON.parse(
        await readFile(new URL('package.json', fixture.root), 'utf8'),
      ).test262;
      if (
        packagePin.repository !== fixture.pin.repository ||
        packagePin.revision !== fixture.pin.revision ||
        packagePin.checkoutPath !== fixture.pin.checkoutPath
      ) {
        throw new Error(
          `package.json pins ${packagePin.revision}, but fixture expects ${fixture.pin.revision}`,
        );
      }
      const head = await readFile(
        new URL(`${fixture.pin.checkoutPath}/.git/HEAD`, fixture.root),
        'utf8',
      );
      if (head.trim() !== fixture.pin.revision) {
        throw new Error(
          `${fixture.pin.checkoutPath} is at ${head.trim()}, but package.json pins ${fixture.pin.revision}`,
        );
      }
      const status = runGit(fileURLToPath(fixture.checkout), [
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
      ]);
      if (status !== '') {
        throw new Error(
          `${fixture.pin.checkoutPath} has uncommitted changes:\n${status}`,
        );
      }
    },
  };
}

/**
 * @param {{
 *   timezone?: string,
 *   files?: Map<string, string>,
 *   roots?: Map<string, string>,
 *   auditEvidence?: string,
 *   assertPinnedCheckout?: (pin: any) => Promise<void>,
 *   readProvenanceManifest?: () => Promise<string>,
 *   readDecisionFragments?: () => Promise<ReadonlyMap<string, string>>,
 *   subset?: string,
 *   promotion?: string,
 *   pathFiles?: ReadonlyMap<string, string>,
 *   runPromotion?: (options: {
 *     paths: readonly string[],
 *     supportedFeatures: readonly string[],
 *     supportedFeaturesForPath: (file: string, metadata: object) => readonly string[],
 *   }) => Promise<readonly object[]>,
 * }} [options]
 * @returns {any}
 */
function auditDependencies(options = {}) {
  const provenanceFiles = provenanceFixtureFiles();
  const files = new Map([
    ['package.json', JSON.stringify({ test262: AUDIT_PIN })],
    ['tools/test262/es2015-policy.json', POLICY],
    ['tools/test262/es2015-anchors.json', ANCHORS],
    ['tools/test262/upstream-subset.json', options.subset ?? AUDIT_SUBSET],
    ['tools/test262/features.json', AUDIT_FEATURES],
    ...provenanceFiles,
    ...(options.promotion === undefined
      ? []
      : /** @type {[string, string][]} */ ([
          ['tools/test262/es2015-promotion.json', options.promotion],
        ])),
    [
      'docs/test262-report.jsonl',
      `${JSON.stringify({
        type: 'test',
        file: 'test/language/selected.js',
        variant: 'non-strict',
        status: 'passed',
      })}\n${JSON.stringify({
        type: 'test',
        file: 'test/language/selected.js',
        variant: 'strict',
        status: 'passed',
      })}\n`,
    ],
    [AUDIT_EVIDENCE_PATH, options.auditEvidence ?? AUDIT_EVIDENCE],
    ...(options.files ?? []),
  ]);
  const roots = options.roots ?? AUDIT_ROOTS;
  /** @type {string[]} */
  const writes = [];

  return {
    environment: { TZ: options.timezone ?? 'UTC' },
    readFile: async (/** @type {string} */ path) => {
      const value = files.get(path);
      if (value === undefined) {
        const error = new Error(`missing fixture file ${path}`);
        Object.assign(error, { code: 'ENOENT' });
        throw error;
      }
      return value;
    },
    writeFile: async (
      /** @type {string} */ path,
      /** @type {string} */ value,
    ) => {
      writes.push(path);
      files.set(path, value);
    },
    listRoots: async () => [...roots.keys()],
    readRoot: async (/** @type {string} */ path) => {
      const value = roots.get(path);
      if (value === undefined) {
        throw new Error(`missing fixture root ${path}`);
      }
      return value;
    },
    readIncludeDefinitions: async () => new Map(),
    readProvenanceManifest:
      options.readProvenanceManifest ??
      (async () => {
        const value = files.get(ES2015_PROVENANCE_FILE);
        if (value === undefined) {
          const error = new Error(
            `missing fixture file ${ES2015_PROVENANCE_FILE}`,
          );
          Object.assign(error, { code: 'ENOENT' });
          throw error;
        }
        return value;
      }),
    readDecisionFragments:
      options.readDecisionFragments ??
      (async () =>
        new Map(
          ES2015_PROVENANCE_DECISION_CODES.map((code) => {
            const path = `${PROVENANCE_DECISIONS_DIRECTORY}/${code}.json`;
            const value = files.get(path);
            if (value === undefined) {
              const error = new Error(`missing fixture file ${path}`);
              Object.assign(error, { code: 'ENOENT' });
              throw error;
            }
            return [code, value];
          }),
        )),
    readPathsFile: async (/** @type {string} */ path) => {
      const value = options.pathFiles?.get(path);
      if (value === undefined) {
        throw new Error(`missing paths file ${path}`);
      }
      return value;
    },
    ...(options.runPromotion === undefined
      ? {}
      : { runPromotion: options.runPromotion }),
    assertPinnedCheckout:
      options.assertPinnedCheckout ??
      (async (pin) => {
        assertSame(pin.repository, AUDIT_PIN.repository);
        assertSame(pin.revision, AUDIT_PIN.revision);
        assertSame(pin.checkoutPath, AUDIT_PIN.checkoutPath);
      }),
    stderr: () => {},
    files,
    writes,
  };
}

/**
 * @param {() => Promise<unknown>} action
 * @returns {Promise<Error>}
 */
async function rejected(action) {
  try {
    await action();
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }

  throw new Error('Expected the audit command to reject');
}

/** @param {any} dependencies @param {string} path */
function fixtureOutput(dependencies, path) {
  const value = dependencies.files.get(path);
  if (typeof value !== 'string') {
    throw new Error(`Fixture did not write ${path}`);
  }
  return value;
}

export default [
  {
    name: 'ES2015 audit rejects non-UTC, pin, source, and inventory drift',
    run: async () => {
      const nonUtc = await rejected(() =>
        auditEs2015Taxonomy(
          [],
          auditDependencies({ timezone: 'America/Los_Angeles' }),
        ),
      );
      assertSame(nonUtc instanceof Es2015AuditError, true);
      assertSame(nonUtc.message.includes('UTC'), true);

      const pinDrift = await rejected(() =>
        auditEs2015Taxonomy(
          [],
          auditDependencies({
            assertPinnedCheckout: async () => {
              throw new Error('vendor/test262 HEAD drifted');
            },
          }),
        ),
      );
      assertSame(pinDrift.message.includes('HEAD drifted'), true);

      const sourceDrift = await rejected(() =>
        auditEs2015Taxonomy(
          [],
          auditDependencies({
            files: new Map([
              [
                'tools/test262/es2015-anchors.json',
                ANCHORS.replace(
                  '4d4243dc2f04c9cdd09498f2cc2af6f6cdc07b0430da5578e7cf440d4f7846a0',
                  '0000000000000000000000000000000000000000000000000000000000000000',
                ),
              ],
            ]),
          }),
        ),
      );
      assertSame(sourceDrift.message.includes('Sixth Edition source'), true);

      const unknownDependency = await rejected(() =>
        auditEs2015Taxonomy(
          [],
          auditDependencies({
            roots: new Map([
              [
                'test/language/missing-include.js',
                '/*---\ndescription: Missing dependency.\nes6id: 13.2\nincludes: [not-reviewed.js]\n---*/\n',
              ],
            ]),
          }),
        ),
      );
      assertSame(unknownDependency instanceof Es2015TaxonomyError, true);
    },
  },
  {
    name: 'ES2015 audit emits deterministic balanced bytes and checks stale artifacts without writing',
    run: async () => {
      const first = auditDependencies();
      assertSame(await auditEs2015Taxonomy([], first), 0);
      const output = first.files.get(AUDIT_PATH);
      assertSame(typeof output, 'string');
      if (typeof output !== 'string') {
        throw new Error('audit did not write its taxonomy');
      }
      assertSame(output.includes('timestamp'), false);
      assertSame(first.writes.length, 1);

      const report = /** @type {any} */ (JSON.parse(output));
      assertSame('evidence' in report, false);
      assertSame(report.inputs.auditEvidenceSha256, sha256(AUDIT_EVIDENCE));
      assertSame(report.summary.roots, 2);
      assertSame(report.summary.variants, 4);
      assertSame(report.classifications.length, 2);
      assertSame(
        report.classifications
          .map((/** @type {any} */ entry) => entry.path)
          .join(','),
        'test/language/audited.js,test/language/selected.js',
      );

      const second = auditDependencies({
        files: new Map([[AUDIT_PATH, output]]),
      });
      assertSame(await auditEs2015Taxonomy([], second), 0);
      assertSame(second.files.get(AUDIT_PATH), output);

      const stale = auditDependencies({
        files: new Map([[AUDIT_PATH, 'stale\n']]),
      });
      assertSame(await auditEs2015Taxonomy(['--check'], stale), 1);
      assertSame(stale.files.get(AUDIT_PATH), 'stale\n');
      assertSame(stale.writes.length, 0);
    },
  },
  {
    name: 'ES2015 audit requires complete external evidence and hashes every classification input',
    run: async () => {
      const missing = await rejected(() =>
        auditEs2015Taxonomy(
          [],
          auditDependencies({
            auditEvidence: auditEvidence({ auditRecords: [] }),
          }),
        ),
      );
      assertSame(
        missing.message.includes('requires exact audit execution evidence'),
        true,
      );

      const foreignAudit = await rejected(() =>
        auditEs2015Taxonomy(
          [],
          auditDependencies({
            auditEvidence: auditEvidence({
              auditRecords: [
                ...AUDIT_RECORDS,
                {
                  type: 'test',
                  file: 'test/language/foreign.js',
                  variant: 'non-strict',
                  status: 'passed',
                },
              ],
            }),
          }),
        ),
      );
      assertSame(
        foreignAudit.message.includes(
          'audit evidence names root outside the unselected ES2015 inventory',
        ),
        true,
      );

      const wrongVariants = await rejected(() =>
        auditEs2015Taxonomy(
          [],
          auditDependencies({
            auditEvidence: auditEvidence({
              auditRecords: [
                {
                  type: 'test',
                  file: 'test/language/audited.js',
                  variant: 'module',
                  status: 'passed',
                },
                {
                  type: 'test',
                  file: 'test/language/audited.js',
                  variant: 'non-strict',
                  status: 'passed',
                },
              ],
            }),
          }),
        ),
      );
      assertSame(
        wrongVariants.message.includes(
          'audit execution for test/language/audited.js has incorrect variants',
        ),
        true,
      );

      const foreignBlocker = await rejected(() =>
        auditEs2015Taxonomy(
          [],
          auditDependencies({
            auditEvidence: auditEvidence({
              blockers: { 'test/language/foreign.js': 'fixture-blocker' },
            }),
          }),
        ),
      );
      assertSame(
        foreignBlocker.message.includes(
          'audit blocker evidence names root outside the unselected ES2015 inventory',
        ),
        true,
      );

      const foreignDeviation = await rejected(() =>
        auditEs2015Taxonomy(
          [],
          auditDependencies({
            auditEvidence: auditEvidence({
              intentionalDeviations: ['test/language/foreign.js'],
            }),
          }),
        ),
      );
      assertSame(
        foreignDeviation.message.includes(
          'intentional deviation evidence names root outside the unselected ES2015 inventory',
        ),
        true,
      );

      const first = auditDependencies();
      assertSame(await auditEs2015Taxonomy([], first), 0);
      const firstOutput = first.files.get(AUDIT_PATH);
      assertSame(typeof firstOutput, 'string');
      if (typeof firstOutput !== 'string') {
        throw new Error('audit did not write its taxonomy');
      }

      const blockerEvidence = auditEvidence({
        blockers: { 'test/language/audited.js': 'fixture-blocker' },
      });
      const blocker = auditDependencies({ auditEvidence: blockerEvidence });
      assertSame(await auditEs2015Taxonomy([], blocker), 0);
      const blockerOutput = blocker.files.get(AUDIT_PATH);
      assertSame(typeof blockerOutput, 'string');
      if (typeof blockerOutput !== 'string') {
        throw new Error('audit did not write blocker evidence output');
      }

      const deviationEvidence = auditEvidence({
        intentionalDeviations: ['test/language/audited.js'],
      });
      const deviation = auditDependencies({ auditEvidence: deviationEvidence });
      assertSame(await auditEs2015Taxonomy([], deviation), 0);
      const deviationOutput = deviation.files.get(AUDIT_PATH);
      assertSame(typeof deviationOutput, 'string');
      if (typeof deviationOutput !== 'string') {
        throw new Error('audit did not write intentional-deviation output');
      }

      const firstHash = JSON.parse(firstOutput).inputs.auditEvidenceSha256;
      const blockerHash = JSON.parse(blockerOutput).inputs.auditEvidenceSha256;
      const deviationHash =
        JSON.parse(deviationOutput).inputs.auditEvidenceSha256;
      assertSame(firstHash, sha256(AUDIT_EVIDENCE));
      assertSame(blockerHash, sha256(blockerEvidence));
      assertSame(deviationHash, sha256(deviationEvidence));
      assertSame(firstHash === blockerHash, false);
      assertSame(firstHash === deviationHash, false);
    },
  },
  {
    name: 'ES2015 audit rejects partial reviewed provenance fragment sets',
    run: async () => {
      const provenanceFiles = provenanceFixtureFiles();
      const partial = await rejected(() =>
        auditEs2015Taxonomy(
          [],
          auditDependencies({
            readDecisionFragments: async () =>
              new Map([
                [
                  'UA',
                  /** @type {string} */ (
                    provenanceFiles.get(
                      `${PROVENANCE_DECISIONS_DIRECTORY}/UA.json`,
                    )
                  ),
                ],
              ]),
          }),
        ),
      );
      assertSame(partial instanceof Es2015TaxonomyError, false);
      assertSame(
        partial.message,
        'UB decision fragment is required by tools/test262/es2015-provenance-decisions',
      );
    },
  },
  {
    name: 'ES2015 audit uses a real pinned Git fixture for UTC, drift, check, and deterministic bytes',
    run: async () => {
      const fixture = await createRealAuditFixture();
      const fixturePath = fileURLToPath(fixture.root);
      try {
        const checkoutPath = fileURLToPath(fixture.checkout);
        assertSame(runGit(checkoutPath, ['remote']), '');
        for (const path of [
          'package.json',
          'tools/test262/es2015-policy.json',
          'tools/test262/upstream-subset.json',
          AUDIT_EVIDENCE_PATH,
        ]) {
          const value = JSON.parse(
            await readFile(new URL(path, fixture.root), 'utf8'),
          );
          assertSame(
            path === 'package.json' ? value.test262.revision : value.revision,
            fixture.pin.revision,
          );
        }
        /** @type {string[]} */
        const errors = [];
        const utcDependencies = fixtureAuditDependencies(fixture, {
          environment: { ...process.env, TZ: 'UTC' },
          stderr: (text) => errors.push(text),
        });

        const nonUtc = await rejected(() =>
          auditEs2015Taxonomy(
            [],
            fixtureAuditDependencies(fixture, {
              environment: { ...process.env, TZ: 'America/Los_Angeles' },
              stderr: () => {},
            }),
          ),
        );
        assertSame(nonUtc instanceof Es2015AuditError, true);
        assertSame(nonUtc.message.includes('UTC'), true);

        assertSame(await auditEs2015Taxonomy(['--check'], utcDependencies), 1);
        assertSame(
          await readFile(new URL(AUDIT_PATH, fixture.root), 'utf8'),
          'stale\n',
        );
        assertSame(errors.join('').includes('is stale'), true);

        assertSame(await auditEs2015Taxonomy([], utcDependencies), 0);
        const first = await readFile(new URL(AUDIT_PATH, fixture.root), 'utf8');
        assertSame(first.includes('timestamp'), false);
        assertSame(
          JSON.parse(first)
            .classifications.find(
              (/** @type {{ path: string }} */ entry) =>
                entry.path === REAL_ATOMICS_HELPER,
            )
            ?.provenance.includes('include-feature:Atomics'),
          true,
        );
        assertSame(await auditEs2015Taxonomy([], utcDependencies), 0);
        assertSame(
          await readFile(new URL(AUDIT_PATH, fixture.root), 'utf8'),
          first,
        );

        await writeFile(
          new URL(REAL_AUDIT_SELECTED, fixture.checkout),
          `${await readFile(new URL(REAL_AUDIT_SELECTED, fixture.checkout), 'utf8')}\n// dirty fixture\n`,
          'utf8',
        );
        const dirty = await rejected(() =>
          auditEs2015Taxonomy([], utcDependencies),
        );
        assertSame(dirty.message.includes('uncommitted changes'), true);
        runGit(checkoutPath, ['checkout', '--', REAL_AUDIT_SELECTED]);

        runGit(checkoutPath, ['checkout', '--quiet', '--detach', 'HEAD^']);
        const head = await rejected(() =>
          auditEs2015Taxonomy([], utcDependencies),
        );
        assertSame(head.message.includes('is at'), true);
        runGit(checkoutPath, [
          'checkout',
          '--quiet',
          '--detach',
          fixture.pin.revision,
        ]);

        await writeFixtureFile(
          fixture.root,
          'package.json',
          JSON.stringify({
            type: 'module',
            test262: {
              ...fixture.pin,
              revision: '0000000000000000000000000000000000000000',
            },
          }),
        );
        const pin = await rejected(() =>
          auditEs2015Taxonomy([], utcDependencies),
        );
        assertSame(pin.message.includes('package.json pins'), true);
      } finally {
        await rm(fixturePath, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'ES2015 audit reads reviewed provenance only from the injected repository root',
    run: async () => {
      const fixture = await createRealAuditFixture();
      const fixturePath = fileURLToPath(fixture.root);
      const missingManifest = new URL(ES2015_PROVENANCE_FILE, fixture.root);
      try {
        await rm(missingManifest);
        const error = await rejected(() =>
          auditEs2015Taxonomy([], fixtureAuditDependencies(fixture)),
        );
        assertSame(error instanceof Error, true);
      } finally {
        await rm(fixturePath, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'ES2015 audit check stays metadata-only even with promotion fixtures present',
    run: async () => {
      const baseline = auditDependencies({
        subset: AUDIT_PROMOTION_SUBSET,
        promotion: AUDIT_PROMOTION,
      });
      assertSame(await auditEs2015Taxonomy([], baseline), 0);
      const stored = fixtureOutput(baseline, AUDIT_PATH);
      const checkOnly = auditDependencies({
        subset: AUDIT_PROMOTION_SUBSET,
        promotion: AUDIT_PROMOTION,
        files: new Map([[AUDIT_PATH, stored]]),
        runPromotion: async () => {
          throw new Error('audit check must not execute Test262');
        },
      });

      assertSame(await auditEs2015Taxonomy(['--check'], checkOnly), 0);
      assertSame(fixtureOutput(checkOnly, AUDIT_PATH), stored);
      assertSame(checkOnly.writes.length, 0);
    },
  },
  {
    name: 'ES2015 audit writes execution only for the exact reviewed promotion ledger',
    run: async () => {
      /** @type {readonly string[] | undefined} */
      let executedPaths;
      let runPromotionCalls = 0;
      const dependencies = auditDependencies({
        subset: AUDIT_PROMOTION_SUBSET,
        promotion: AUDIT_PROMOTION,
        pathFiles: new Map([[EXACT_PATHS_FILE, `${AUDIT_PROMOTION_PATH}\n`]]),
        runPromotion: async ({ paths }) => {
          runPromotionCalls += 1;
          executedPaths = paths;
          return AUDIT_RECORDS;
        },
      });

      assertSame(
        await auditEs2015Taxonomy(
          [`--paths-file=${EXACT_PATHS_FILE}`, '--write-execution'],
          dependencies,
        ),
        0,
      );
      assertSame(runPromotionCalls, 1);
      assertSame(
        JSON.stringify(executedPaths),
        JSON.stringify([AUDIT_PROMOTION_PATH]),
      );
      assertSame(
        JSON.stringify(
          JSON.parse(fixtureOutput(dependencies, AUDIT_EVIDENCE_PATH))
            .auditRecords,
        ),
        JSON.stringify(AUDIT_RECORDS),
      );

      assertSame(await auditEs2015Taxonomy([], dependencies), 0);
      assertSame(runPromotionCalls, 1);
      const artifact = JSON.parse(fixtureOutput(dependencies, AUDIT_PATH));
      assertSame(
        JSON.stringify(artifact.statusTables.core),
        JSON.stringify([
          {
            name: 'selected-passing',
            roots: 2,
            variants: 4,
          },
        ]),
      );

      const mismatch = auditDependencies({
        subset: AUDIT_PROMOTION_SUBSET,
        promotion: AUDIT_PROMOTION,
        pathFiles: new Map([
          ['wrong-ledger.txt', 'test/language/selected.js\n'],
        ]),
        runPromotion: async () => AUDIT_RECORDS,
      });
      const error = await rejected(() =>
        auditEs2015Taxonomy(
          ['--paths-file=wrong-ledger.txt', '--write-execution'],
          mismatch,
        ),
      );
      assertSame(error instanceof Es2015AuditError, true);
      assertSame(error.message.includes('does not match'), true);
    },
  },
  {
    name: 'ES2015 audit writes H0 disposition, pass-only promotion, and owner deltas from exact focused evidence',
    run: async () => {
      /** @type {readonly string[] | undefined} */
      let executedPaths;
      const roots = new Map([
        ...AUDIT_ROOTS,
        [
          H0_AUDIT_REASSIGNED_PATH,
          '/*---\ndescription: H0 reassigned fixture.\nes6id: 13.2\n---*/\n',
        ],
        [
          H0_AUDIT_PASSED_PATH,
          '/*---\ndescription: H0 passed fixture.\nes6id: 13.2\nfeatures: [cross-realm]\n---*/\n',
        ],
      ]);
      const dependencies = auditDependencies({
        roots,
        files: new Map([
          ['tools/test262/es2015-h0-paths.json', H0_AUDIT_PATHS_MANIFEST],
          ['tools/test262/es2015-h0-owner-map.json', H0_AUDIT_OWNER_MAP],
          [AUDIT_PATH, H0_AUDIT_TAXONOMY],
        ]),
        runPromotion: async ({ paths }) => {
          executedPaths = paths;
          return H0_AUDIT_RECORDS;
        },
      });

      assertSame(
        await auditEs2015Taxonomy(
          [
            '--paths-manifest=tools/test262/es2015-h0-paths.json',
            '--owner-map=tools/test262/es2015-h0-owner-map.json',
            '--write-disposition=tools/test262/es2015-h0-disposition.json',
          ],
          dependencies,
        ),
        0,
      );
      assertSame(JSON.stringify(executedPaths), JSON.stringify(H0_AUDIT_PATHS));
      assertSame(dependencies.writes.includes(AUDIT_PATH), false);

      const dispositionText = fixtureOutput(
        dependencies,
        'tools/test262/es2015-h0-disposition.json',
      );
      const disposition = JSON.parse(dispositionText);
      assertSame(disposition.h0RootCount, 2);
      assertSame(disposition.h0VariantCount, 4);
      assertSame(disposition.passedRootCount, 1);
      assertSame(disposition.reassignedRootCount, 1);

      assertSame(
        await auditEs2015Taxonomy(
          [
            '--paths-manifest=tools/test262/es2015-h0-paths.json',
            '--disposition=tools/test262/es2015-h0-disposition.json',
            '--promotion-file=tools/test262/es2015-h0-promotion.json',
            '--write-promotion=tools/test262/es2015-h0-promotion.json',
            '--write-owner-deltas=tools/test262/es2015-h0-owner-deltas.json',
          ],
          dependencies,
        ),
        0,
      );
      const promotion = JSON.parse(
        fixtureOutput(dependencies, 'tools/test262/es2015-h0-promotion.json'),
      );
      const ownerDeltas = JSON.parse(
        fixtureOutput(dependencies, 'tools/test262/es2015-h0-owner-deltas.json'),
      );
      assertSame(promotion.h0RootCount, 2);
      assertSame(promotion.h0VariantCount, 4);
      assertSame(promotion.promotedRootCount, 1);
      assertSame(promotion.promotedVariantCount, 2);
      assertSame(promotion.entries[0].path, H0_AUDIT_PASSED_PATH);
      assertSame(ownerDeltas.crossRealm.removedRoots, 2);
      assertSame(ownerDeltas.crossRealm.remainingRoots, 0);
    },
  },
  {
    name: 'ES2015 audit synchronizes the promoted report from immutable exact evidence',
    run: async () => {
      const dependencies = auditDependencies({
        subset: AUDIT_PROMOTION_SUBSET,
        promotion: AUDIT_PROMOTION,
        files: new Map([['docs/conformance.md', AUDIT_COVERAGE_DOCUMENT]]),
      });

      assertSame(
        await auditEs2015Taxonomy(['--sync-promoted-report'], dependencies),
        0,
      );

      const reportRecords = fixtureOutput(
        dependencies,
        'docs/test262-report.jsonl',
      )
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const records = reportRecords.filter((record) => record.type === 'test');
      const summary = reportRecords.find((record) => record.type === 'summary');
      const coverage = reportRecords.filter(
        (record) => record.type === 'coverage',
      );

      assertSame(
        JSON.stringify(
          records.map((record) => [record.file, record.variant, record.status]),
        ),
        JSON.stringify([
          [AUDIT_PROMOTION_PATH, 'non-strict', 'passed'],
          [AUDIT_PROMOTION_PATH, 'strict', 'passed'],
          ['test/language/selected.js', 'non-strict', 'passed'],
          ['test/language/selected.js', 'strict', 'passed'],
        ]),
      );
      assertSame(
        JSON.stringify(summary),
        JSON.stringify({
          type: 'summary',
          total: 4,
          passed: 4,
          failed: 0,
          skipped: 0,
        }),
      );
      assertSame(
        JSON.stringify(
          coverage.map((record) => [
            record.scope,
            record.selected,
            record.attempted,
            record.passed,
          ]),
        ),
        JSON.stringify([
          ['files', 2, 2, 2],
          ['records', 4, 4, 4],
        ]),
      );
      assertSame(
        fixtureOutput(dependencies, 'docs/conformance.md').includes(
          'Full per-test records: [docs/test262-report.jsonl](test262-report.jsonl).',
        ),
        true,
      );

      const report = fixtureOutput(dependencies, 'docs/test262-report.jsonl');
      const conformance = fixtureOutput(dependencies, 'docs/conformance.md');
      assertSame(
        await auditEs2015Taxonomy(['--sync-promoted-report'], dependencies),
        0,
      );
      assertSame(
        fixtureOutput(dependencies, 'docs/test262-report.jsonl'),
        report,
      );
      assertSame(
        fixtureOutput(dependencies, 'docs/conformance.md'),
        conformance,
      );
    },
  },
  {
    name: 'ES2015 audit synchronizes promoted record features in pinned metadata order',
    run: async () => {
      const promotion = JSON.parse(AUDIT_PROMOTION);
      promotion.entries[0].features = ['alpha', 'zeta'];
      const roots = new Map(AUDIT_ROOTS);
      roots.set(
        AUDIT_PROMOTION_PATH,
        '/*---\ndescription: Audited feature-order fixture.\nes6id: 13.2\nfeatures: [zeta, alpha]\n---*/\n',
      );
      const dependencies = auditDependencies({
        subset: AUDIT_PROMOTION_SUBSET,
        promotion: JSON.stringify(promotion),
        roots,
        files: new Map([
          [
            'tools/test262/es2015-policy.json',
            JSON.stringify({
              ...JSON.parse(POLICY),
              es2015Features: ['alpha', 'let', 'zeta'],
            }),
          ],
          ['docs/conformance.md', AUDIT_COVERAGE_DOCUMENT],
        ]),
      });

      assertSame(
        await auditEs2015Taxonomy(['--sync-promoted-report'], dependencies),
        0,
      );
      const record = fixtureOutput(dependencies, 'docs/test262-report.jsonl')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
        .find(
          (entry) =>
            entry.type === 'test' &&
            entry.file === AUDIT_PROMOTION_PATH &&
            entry.variant === 'non-strict',
        );

      assertSame(JSON.stringify(record.features), '["zeta","alpha"]');
    },
  },
  {
    name: 'ES2015 audit replaces stale promoted report details with immutable evidence',
    run: async () => {
      const dependencies = auditDependencies({
        subset: AUDIT_PROMOTION_SUBSET,
        promotion: AUDIT_PROMOTION,
        files: new Map([
          ['docs/conformance.md', AUDIT_COVERAGE_DOCUMENT],
          [
            'docs/test262-report.jsonl',
            [
              ...AUDIT_RECORDS.map((record) =>
                JSON.stringify({ ...record, features: ['stale-feature'] }),
              ),
              JSON.stringify({
                type: 'test',
                file: 'test/language/selected.js',
                variant: 'non-strict',
                status: 'passed',
              }),
              JSON.stringify({
                type: 'test',
                file: 'test/language/selected.js',
                variant: 'strict',
                status: 'passed',
              }),
              '',
            ].join('\n'),
          ],
        ]),
      });

      assertSame(
        await auditEs2015Taxonomy(['--sync-promoted-report'], dependencies),
        0,
      );
      const record = fixtureOutput(dependencies, 'docs/test262-report.jsonl')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
        .find(
          (entry) =>
            entry.type === 'test' &&
            entry.file === AUDIT_PROMOTION_PATH &&
            entry.variant === 'non-strict',
        );

      assertSame(record.features, undefined);
    },
  },
  {
    name: 'ES2015 promoted-report synchronization rejects incomplete, duplicate, foreign, and mismatched evidence',
    run: async () => {
      const files = new Map([['docs/conformance.md', AUDIT_COVERAGE_DOCUMENT]]);
      const options = ['--sync-promoted-report'];
      const missing = await rejected(() =>
        auditEs2015Taxonomy(
          options,
          auditDependencies({
            subset: AUDIT_PROMOTION_SUBSET,
            promotion: AUDIT_PROMOTION,
            auditEvidence: auditEvidence({
              auditRecords: [AUDIT_RECORDS[0]],
            }),
            files,
          }),
        ),
      );
      assertSame(missing.message.includes('incomplete variants'), true);

      const duplicate = await rejected(() =>
        auditEs2015Taxonomy(
          options,
          auditDependencies({
            subset: AUDIT_PROMOTION_SUBSET,
            promotion: AUDIT_PROMOTION,
            auditEvidence: auditEvidence({
              auditRecords: [AUDIT_RECORDS[0], AUDIT_RECORDS[0]],
            }),
            files,
          }),
        ),
      );
      assertSame(duplicate.message.includes('must not repeat entries'), true);

      const foreign = await rejected(() =>
        auditEs2015Taxonomy(
          options,
          auditDependencies({
            subset: AUDIT_PROMOTION_SUBSET,
            promotion: AUDIT_PROMOTION,
            auditEvidence: auditEvidence({
              auditRecords: [
                ...AUDIT_RECORDS,
                {
                  type: 'test',
                  file: 'test/language/selected.js',
                  variant: 'non-strict',
                  status: 'passed',
                },
              ],
            }),
            files,
          }),
        ),
      );
      assertSame(foreign.message.includes('selected non-promotion'), true);

      const wrongPin = await rejected(() =>
        auditEs2015Taxonomy(
          options,
          auditDependencies({
            subset: AUDIT_PROMOTION_SUBSET,
            promotion: AUDIT_PROMOTION,
            auditEvidence: AUDIT_EVIDENCE.replace(
              AUDIT_PIN.revision,
              '0000000000000000000000000000000000000000',
            ),
            files,
          }),
        ),
      );
      assertSame(wrongPin.message.includes('does not match'), true);

      const incompleteSelection = await rejected(() =>
        auditEs2015Taxonomy(
          options,
          auditDependencies({
            subset: AUDIT_PROMOTION_SUBSET,
            promotion: AUDIT_PROMOTION,
            files: new Map([
              ['docs/conformance.md', AUDIT_COVERAGE_DOCUMENT],
              [
                'docs/test262-report.jsonl',
                `${JSON.stringify({
                  type: 'test',
                  file: 'test/language/selected.js',
                  variant: 'non-strict',
                  status: 'passed',
                })}\n`,
              ],
            ]),
          }),
        ),
      );
      assertSame(
        incompleteSelection.message.includes('missing selected variant'),
        true,
      );
    },
  },
  {
    name: 'ES2015 audit gives exact promotion evidence precedence over upstream selected records',
    run: async () => {
      const dependencies = auditDependencies({
        subset: AUDIT_PROMOTION_SUBSET,
        promotion: AUDIT_PROMOTION,
        files: new Map([
          [
            'docs/test262-report.jsonl',
            `${JSON.stringify({
              type: 'test',
              file: 'test/language/audited.js',
              variant: 'non-strict',
              status: 'failed',
            })}\n${JSON.stringify({
              type: 'test',
              file: 'test/language/audited.js',
              variant: 'strict',
              status: 'failed',
            })}\n${JSON.stringify({
              type: 'test',
              file: 'test/language/selected.js',
              variant: 'non-strict',
              status: 'passed',
            })}\n${JSON.stringify({
              type: 'test',
              file: 'test/language/selected.js',
              variant: 'strict',
              status: 'passed',
            })}\n`,
          ],
        ]),
      });

      assertSame(await auditEs2015Taxonomy([], dependencies), 0);
      const artifact = JSON.parse(fixtureOutput(dependencies, AUDIT_PATH));
      assertSame(
        JSON.stringify(artifact.statusTables.core),
        JSON.stringify([
          {
            name: 'selected-passing',
            roots: 2,
            variants: 4,
          },
        ]),
      );
    },
  },
  {
    name: 'ES2015 taxonomy classifies precedence, partitions, statuses, and variants',
    run: async () => {
      const policy = parseEs2015Policy(POLICY);
      const anchors = parseEs2015Anchors(ANCHORS);
      const roots = await Promise.all(
        [
          'test/language/unknown.js',
          'test/language/later-include.js',
          'test/language/es5.js',
          'test/language/anchor.js',
          'test/language/feature.js',
          'test/annexB/optional.js',
          'test/language/malformed.js',
          'test/harness/self-test.js',
          'test/language/blocked.js',
          'test/language/deviation.js',
        ].map(async (path) => ({
          path,
          source:
            path === 'test/harness/self-test.js'
              ? '/*---\ndescription: Harness validation.\n---*/\n'
              : path === 'test/language/blocked.js' ||
                  path === 'test/language/deviation.js'
                ? '/*---\ndescription: Status evidence.\nes6id: 13.2\n---*/\n'
                : await fixture(path),
        })),
      );
      const inventory = buildEs2015Inventory({
        roots,
        includeDefinitions: {
          'base.js': { includes: ['later.js'] },
          'later.js': { features: ['async-functions'] },
        },
      });
      const classifications = classifyEs2015Inventory({
        policy,
        anchors,
        inventory,
        selected: new Set(['test/language/es5.js']),
        selectedResults: new Map([
          [
            'test/language/es5.js',
            [
              {
                type: 'test',
                file: 'test/language/es5.js',
                variant: 'non-strict',
                status: 'passed',
              },
              {
                type: 'test',
                file: 'test/language/es5.js',
                variant: 'strict',
                status: 'passed',
              },
            ],
          ],
        ]),
        auditResults: new Map([
          [
            'test/annexB/optional.js',
            [
              {
                type: 'test',
                file: 'test/annexB/optional.js',
                variant: 'non-strict',
                status: 'failed',
              },
              {
                type: 'test',
                file: 'test/annexB/optional.js',
                variant: 'strict',
                status: 'failed',
              },
            ],
          ],
          [
            'test/language/anchor.js',
            [
              {
                type: 'test',
                file: 'test/language/anchor.js',
                variant: 'non-strict',
                status: 'passed',
              },
              {
                type: 'test',
                file: 'test/language/anchor.js',
                variant: 'strict',
                status: 'passed',
              },
            ],
          ],
          [
            'test/language/blocked.js',
            [
              {
                type: 'test',
                file: 'test/language/blocked.js',
                variant: 'non-strict',
                status: 'failed',
              },
              {
                type: 'test',
                file: 'test/language/blocked.js',
                variant: 'strict',
                status: 'failed',
              },
            ],
          ],
          [
            'test/language/deviation.js',
            [
              {
                type: 'test',
                file: 'test/language/deviation.js',
                variant: 'non-strict',
                status: 'failed',
              },
              {
                type: 'test',
                file: 'test/language/deviation.js',
                variant: 'strict',
                status: 'failed',
              },
            ],
          ],
          [
            'test/language/feature.js',
            [
              {
                type: 'test',
                file: 'test/language/feature.js',
                variant: 'strict',
                status: 'failed',
              },
            ],
          ],
        ]),
        blockers: new Map([
          ['test/annexB/optional.js', 'annex-b'],
          ['test/language/blocked.js', 'regexp-unicode'],
          ['test/language/feature.js', 'feature-unavailable'],
        ]),
        intentionalDeviations: new Set(['test/language/deviation.js']),
      });

      assertSame(
        json(classifications),
        json([
          {
            path: 'test/annexB/optional.js',
            variants: 2,
            partition: 'annex-b',
            status: 'blocked:annex-b',
            blocker: 'annex-b',
            features: [],
            flags: [],
            includes: [],
            provenance: ['es6id', 'path:test/annexB/'],
          },
          {
            path: 'test/harness/self-test.js',
            variants: 2,
            partition: 'harness-validation',
            status: 'harness-validation',
            blocker: null,
            features: [],
            flags: [],
            includes: [],
            provenance: ['harness'],
          },
          {
            path: 'test/language/anchor.js',
            variants: 2,
            partition: 'core',
            status: 'audit-passing-unselected',
            blocker: null,
            features: [],
            flags: [],
            includes: [],
            provenance: ['anchor:sec-anchor'],
          },
          {
            path: 'test/language/blocked.js',
            variants: 2,
            partition: 'core',
            status: 'blocked:regexp-unicode',
            blocker: 'regexp-unicode',
            features: [],
            flags: [],
            includes: [],
            provenance: ['es6id'],
          },
          {
            path: 'test/language/deviation.js',
            variants: 2,
            partition: 'core',
            status: 'intentional-deviation',
            blocker: null,
            features: [],
            flags: [],
            includes: [],
            provenance: ['es6id'],
          },
          {
            path: 'test/language/es5.js',
            variants: 2,
            partition: 'core',
            status: 'selected-passing',
            blocker: null,
            features: [],
            flags: [],
            includes: [],
            provenance: ['es5id'],
          },
          {
            path: 'test/language/feature.js',
            variants: 1,
            partition: 'core',
            status: 'blocked:feature-unavailable',
            blocker: 'feature-unavailable',
            features: ['let'],
            flags: ['onlyStrict'],
            includes: [],
            provenance: ['feature:let'],
          },
          {
            path: 'test/language/later-include.js',
            variants: 2,
            partition: 'later-or-non-es2015',
            status: 'later-or-non-es2015',
            blocker: null,
            features: [],
            flags: [],
            includes: ['base.js'],
            provenance: ['include-feature:async-functions'],
          },
          {
            path: 'test/language/malformed.js',
            variants: 0,
            partition: 'malformed',
            status: 'malformed',
            blocker: null,
            features: [],
            flags: [],
            includes: [],
            provenance: [
              'metadata-error:Unterminated Test262 frontmatter block',
            ],
          },
          {
            path: 'test/language/unknown.js',
            variants: 2,
            partition: 'unknown-edition',
            status: 'unknown-edition',
            blocker: null,
            features: [],
            flags: [],
            includes: [],
            provenance: [],
          },
        ]),
      );
    },
  },
  {
    name: 'ES2015 taxonomy rejects unreviewed policy and inventory inputs',
    run: () => {
      assertThrows(
        () => parseEs2015Policy(POLICY.replace('"let"', '"zeta", "let"')),
        Es2015TaxonomyError,
      );
      assertThrows(
        () =>
          parseEs2015Anchors(
            ANCHORS.replace('sec-anchor', 'sec-z", "sec-anchor'),
          ),
        Es2015TaxonomyError,
      );
      assertThrows(
        () =>
          parseEs2015Policy(
            POLICY.replace('"partition":"annex-b"', '"partition":"future"'),
          ),
        Es2015TaxonomyError,
      );
      const policy = parseEs2015Policy(POLICY);
      const anchors = parseEs2015Anchors(ANCHORS);
      assertThrows(
        () =>
          buildEs2015Inventory({
            roots: [{ path: 'not-a-root.js', metadata: {} }],
          }),
        Es2015TaxonomyError,
      );
      assertThrows(
        () =>
          classifyEs2015Inventory({
            policy,
            anchors,
            inventory: [
              {
                path: 'test/language/duplicate.js',
                metadata: {
                  description: 'one',
                  es5id: '1',
                  es6id: null,
                  esid: null,
                  features: [],
                  flags: [],
                  includes: [],
                },
                variants: 2,
                includeFeatures: [],
              },
              {
                path: 'test/language/duplicate.js',
                metadata: {
                  description: 'two',
                  es5id: '1',
                  es6id: null,
                  esid: null,
                  features: [],
                  flags: [],
                  includes: [],
                },
                variants: 2,
                includeFeatures: [],
              },
            ],
          }),
        Es2015TaxonomyError,
      );
      assertThrows(
        () =>
          classifyEs2015Inventory({
            policy,
            anchors,
            inventory: buildEs2015Inventory({
              roots: [
                {
                  path: 'test/language/unknown-feature.js',
                  metadata: {
                    description: 'Unknown feature.',
                    es5id: null,
                    es6id: null,
                    esid: null,
                    features: ['unreviewed'],
                    flags: [],
                    includes: [],
                  },
                },
              ],
            }),
          }),
        Es2015TaxonomyError,
      );
      assertThrows(
        () =>
          buildEs2015Inventory({
            roots: [
              {
                path: 'test/language/unknown-include.js',
                metadata: {
                  description: 'Unknown harness include.',
                  es5id: null,
                  es6id: null,
                  esid: null,
                  features: [],
                  flags: [],
                  includes: ['missing.js'],
                },
              },
            ],
            includeDefinitions: {},
          }),
        Es2015TaxonomyError,
      );
    },
  },
  {
    name: 'ES2015 taxonomy rejects incomplete, duplicate, and foreign execution records',
    run: () => {
      const policy = parseEs2015Policy(POLICY);
      const anchors = parseEs2015Anchors(ANCHORS);
      const inventory = buildEs2015Inventory({
        roots: [
          {
            path: 'test/language/two-variants.js',
            metadata: {
              description: 'A test that runs twice.',
              es5id: '15.1',
              es6id: null,
              esid: null,
              features: [],
              flags: [],
              includes: [],
            },
          },
        ],
      });

      assertThrows(
        () =>
          classifyEs2015Inventory({
            policy,
            anchors,
            inventory,
            selected: new Set(['test/language/two-variants.js']),
            selectedResults: new Map([
              [
                'test/language/two-variants.js',
                [
                  {
                    type: 'test',
                    file: 'test/language/two-variants.js',
                    variant: 'strict',
                    status: 'passed',
                  },
                ],
              ],
            ]),
          }),
        Es2015TaxonomyError,
      );
      assertThrows(
        () =>
          classifyEs2015Inventory({
            policy,
            anchors,
            inventory,
            auditResults: new Map([
              [
                'test/language/two-variants.js',
                [
                  {
                    type: 'test',
                    file: 'test/language/two-variants.js',
                    variant: 'strict',
                    status: 'passed',
                  },
                  {
                    type: 'test',
                    file: 'test/language/two-variants.js',
                    variant: 'strict',
                    status: 'passed',
                  },
                ],
              ],
            ]),
          }),
        Es2015TaxonomyError,
      );
      assertThrows(
        () =>
          classifyEs2015Inventory({
            policy,
            anchors,
            inventory,
            auditResults: new Map([
              [
                'test/language/outside-inventory.js',
                [
                  {
                    type: 'test',
                    file: 'test/language/outside-inventory.js',
                    variant: 'strict',
                    status: 'passed',
                  },
                ],
              ],
            ]),
          }),
        Es2015TaxonomyError,
      );
    },
  },
  {
    name: 'ES2015 taxonomy rejects an unselected ES2015 root without exact audit evidence',
    run: () => {
      const inventory = buildEs2015Inventory({
        roots: [
          {
            path: 'test/language/unexecuted.js',
            metadata: {
              description: 'An unselected ES2015 root.',
              es5id: null,
              es6id: '13.2',
              esid: null,
              features: [],
              flags: [],
              includes: [],
            },
          },
        ],
      });
      const error = assertThrows(
        () =>
          classifyEs2015Inventory({
            policy: parseEs2015Policy(POLICY),
            anchors: parseEs2015Anchors(ANCHORS),
            inventory,
          }),
        Es2015TaxonomyError,
      );

      assertSame(
        error.message,
        'ES2015 unselected root test/language/unexecuted.js requires exact audit execution evidence',
      );
    },
  },
  {
    name: 'ES2015 taxonomy rejects unselected failed audit evidence without a disposition',
    run: () => {
      const path = 'test/language/failed-without-disposition.js';
      const inventory = buildEs2015Inventory({
        roots: [
          {
            path,
            metadata: {
              description: 'An unselected ES2015 root with a failed audit.',
              es5id: null,
              es6id: '13.2',
              esid: null,
              features: [],
              flags: [],
              includes: [],
            },
          },
        ],
      });
      const error = assertThrows(
        () =>
          classifyEs2015Inventory({
            policy: parseEs2015Policy(POLICY),
            anchors: parseEs2015Anchors(ANCHORS),
            inventory,
            auditResults: new Map([
              [
                path,
                [
                  {
                    type: 'test',
                    file: path,
                    variant: 'non-strict',
                    status: 'failed',
                  },
                  {
                    type: 'test',
                    file: path,
                    variant: 'strict',
                    status: 'failed',
                  },
                ],
              ],
            ]),
          }),
        Es2015TaxonomyError,
      );

      assertSame(
        error.message,
        `ES2015 unselected root ${path} has failed audit execution evidence without a blocker or intentional deviation`,
      );
    },
  },
  {
    name: 'ES2015 taxonomy rejects audit and blocker evidence outside unselected ES2015 roots',
    run: () => {
      const inventory = buildEs2015Inventory({
        roots: [
          {
            path: 'test/language/selected.js',
            metadata: {
              description: 'A selected ES2015 root.',
              es5id: '15.1',
              es6id: null,
              esid: null,
              features: [],
              flags: [],
              includes: [],
            },
          },
        ],
      });
      /** @type {Array<{
       *   type: 'test',
       *   file: string,
       *   variant: string,
       *   status: 'passed' | 'failed' | 'skipped',
       * }>} */
      const selectedRecords = [
        {
          type: 'test',
          file: 'test/language/selected.js',
          variant: 'non-strict',
          status: 'passed',
        },
        {
          type: 'test',
          file: 'test/language/selected.js',
          variant: 'strict',
          status: 'passed',
        },
      ];
      const error = assertThrows(
        () =>
          classifyEs2015Inventory({
            policy: parseEs2015Policy(POLICY),
            anchors: parseEs2015Anchors(ANCHORS),
            inventory,
            selected: new Set(['test/language/selected.js']),
            selectedResults: new Map([
              ['test/language/selected.js', selectedRecords],
            ]),
            auditResults: new Map([
              ['test/language/selected.js', selectedRecords],
            ]),
          }),
        Es2015TaxonomyError,
      );

      assertSame(
        error.message,
        'ES2015 audit evidence names root outside the unselected ES2015 inventory test/language/selected.js',
      );
      const blockerError = assertThrows(
        () =>
          classifyEs2015Inventory({
            policy: parseEs2015Policy(POLICY),
            anchors: parseEs2015Anchors(ANCHORS),
            inventory,
            selected: new Set(['test/language/selected.js']),
            selectedResults: new Map([
              ['test/language/selected.js', selectedRecords],
            ]),
            blockers: new Map([
              ['test/language/foreign.js', 'fixture-blocker'],
            ]),
          }),
        Es2015TaxonomyError,
      );
      assertSame(
        blockerError.message,
        'ES2015 audit blocker evidence names root outside the unselected ES2015 inventory test/language/foreign.js',
      );
    },
  },
  {
    name: 'ES2015 taxonomy resolves include names instead of trusting supplied closures',
    run: () => {
      assertThrows(
        () =>
          buildEs2015Inventory({
            roots: [
              {
                path: 'test/language/precomputed-include.js',
                metadata: {
                  description: 'A root with an unreviewed include.',
                  es5id: null,
                  es6id: null,
                  esid: null,
                  features: [],
                  flags: [],
                  includes: ['missing.js'],
                },
                includeFeatures: ['let'],
              },
            ],
          }),
        Es2015TaxonomyError,
      );
    },
  },
  {
    name: 'ES2015 taxonomy preserves transitive later features through harness include aliases',
    run: () => {
      const classifications = classifyEs2015Inventory({
        policy: parseEs2015Policy(
          POLICY.replace(
            '"laterFeatures":["async-functions"]',
            '"laterFeatures":["Atomics","async-functions"]',
          ),
        ),
        anchors: parseEs2015Anchors(ANCHORS),
        inventory: buildEs2015Inventory({
          roots: [
            {
              path: 'test/language/atomics-helper.js',
              metadata: {
                description: 'An alias-backed harness dependency.',
                es5id: null,
                es6id: '13.2',
                esid: null,
                features: [],
                flags: [],
                includes: ['atomicsHelper.js'],
              },
            },
          ],
          includeDefinitions: {
            atomicsHelper: { features: ['Atomics'] },
          },
        }),
      });

      assertSame(
        json(
          classifications.map(({ partition, provenance }) => ({
            partition,
            provenance,
          })),
        ),
        json([
          {
            partition: 'later-or-non-es2015',
            provenance: ['include-feature:Atomics'],
          },
        ]),
      );
    },
  },
  {
    name: 'ES2015 taxonomy gives later features precedence over es5id, anchors, and ES2015 features',
    run: () => {
      const classifications = classifyEs2015Inventory({
        policy: parseEs2015Policy(POLICY),
        anchors: parseEs2015Anchors(ANCHORS),
        inventory: buildEs2015Inventory({
          roots: [
            {
              path: 'test/language/later-anchor.js',
              metadata: {
                description: 'Later feature overrides anchor.',
                es5id: null,
                es6id: null,
                esid: 'sec-anchor',
                features: ['async-functions'],
                flags: [],
                includes: [],
              },
            },
            {
              path: 'test/language/later-es5.js',
              metadata: {
                description: 'Later feature overrides es5id.',
                es5id: '15.1',
                es6id: null,
                esid: null,
                features: ['async-functions'],
                flags: [],
                includes: [],
              },
            },
            {
              path: 'test/language/later-feature.js',
              metadata: {
                description: 'Later feature overrides ES2015 feature.',
                es5id: null,
                es6id: null,
                esid: null,
                features: ['async-functions', 'let'],
                flags: [],
                includes: [],
              },
            },
          ],
        }),
      });

      assertSame(
        json(classifications),
        json([
          {
            path: 'test/language/later-anchor.js',
            variants: 2,
            partition: 'later-or-non-es2015',
            status: 'later-or-non-es2015',
            blocker: null,
            features: ['async-functions'],
            flags: [],
            includes: [],
            provenance: ['feature:async-functions'],
          },
          {
            path: 'test/language/later-es5.js',
            variants: 2,
            partition: 'later-or-non-es2015',
            status: 'later-or-non-es2015',
            blocker: null,
            features: ['async-functions'],
            flags: [],
            includes: [],
            provenance: ['feature:async-functions'],
          },
          {
            path: 'test/language/later-feature.js',
            variants: 2,
            partition: 'later-or-non-es2015',
            status: 'later-or-non-es2015',
            blocker: null,
            features: ['async-functions', 'let'],
            flags: [],
            includes: [],
            provenance: ['feature:async-functions'],
          },
        ]),
      );
    },
  },
  {
    name: 'ES2015 taxonomy does not treat an Annex B path alone as ES2015 evidence',
    run: () => {
      const classifications = classifyEs2015Inventory({
        policy: parseEs2015Policy(POLICY),
        anchors: parseEs2015Anchors(ANCHORS),
        inventory: buildEs2015Inventory({
          roots: [
            {
              path: 'test/annexB/unversioned.js',
              metadata: {
                description: 'An unversioned Annex B test.',
                es5id: null,
                es6id: null,
                esid: null,
                features: [],
                flags: [],
                includes: [],
              },
            },
          ],
        }),
      });

      assertSame(
        json(
          classifications.map(({ partition, status }) => ({
            partition,
            status,
          })),
        ),
        json([{ partition: 'unknown-edition', status: 'unknown-edition' }]),
      );
    },
  },
  {
    name: 'ES2015 taxonomy names the anchor artifact in anchor sorting diagnostics',
    run: () => {
      const error = assertThrows(
        () =>
          parseEs2015Anchors(
            ANCHORS.replace('sec-anchor', 'sec-z", "sec-anchor'),
          ),
        Es2015TaxonomyError,
      );

      assertSame(
        error.message,
        'tools/test262/es2015-anchors.json anchors must be code-unit sorted',
      );
    },
  },
  {
    name: 'ES2015 taxonomy always renders six balanced whole-tree partitions with three decimal percentages',
    run: () => {
      const classifications = [
        {
          path: 'test/a.js',
          variants: 1,
          partition: 'core',
          status: 'selected-passing',
          blocker: null,
          features: [],
          flags: [],
          includes: [],
          provenance: [],
        },
        {
          path: 'test/b.js',
          variants: 2,
          partition: 'core',
          status: 'blocked:fixture-blocker',
          blocker: 'fixture-blocker',
          features: [],
          flags: [],
          includes: [],
          provenance: [],
        },
        {
          path: 'test/c.js',
          variants: 0,
          partition: 'malformed',
          status: 'malformed',
          blocker: null,
          features: [],
          flags: [],
          includes: [],
          provenance: [],
        },
      ];
      const summary = summarizeEs2015Classification(classifications);
      assertSame(
        json(summary),
        json({
          roots: 3,
          variants: 3,
          partitions: [
            {
              name: 'annex-b',
              roots: 0,
              variants: 0,
              rootsPercent: 0,
              variantsPercent: 0,
            },
            {
              name: 'core',
              roots: 2,
              variants: 3,
              rootsPercent: 66.667,
              variantsPercent: 100,
            },
            {
              name: 'harness-validation',
              roots: 0,
              variants: 0,
              rootsPercent: 0,
              variantsPercent: 0,
            },
            {
              name: 'later-or-non-es2015',
              roots: 0,
              variants: 0,
              rootsPercent: 0,
              variantsPercent: 0,
            },
            {
              name: 'malformed',
              roots: 1,
              variants: 0,
              rootsPercent: 33.333,
              variantsPercent: 0,
            },
            {
              name: 'unknown-edition',
              roots: 0,
              variants: 0,
              rootsPercent: 0,
              variantsPercent: 0,
            },
          ],
        }),
      );
      assertSame(
        renderEs2015Taxonomy({ classifications, summary }),
        'Partition | Roots | Variants | Roots % | Variants %\nannex-b | 0 | 0 | 0.000 | 0.000\ncore | 2 | 3 | 66.667 | 100.000\nharness-validation | 0 | 0 | 0.000 | 0.000\nlater-or-non-es2015 | 0 | 0 | 0.000 | 0.000\nmalformed | 1 | 0 | 33.333 | 0.000\nunknown-edition | 0 | 0 | 0.000 | 0.000\n',
      );
    },
  },
];
