import { readFile } from 'node:fs/promises';
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
  Es2015AuditError,
  main as auditEs2015Taxonomy,
} from '../../tools/test262/es2015-audit.js';

const FIXTURE_ROOT = new URL('../fixtures/es2015-taxonomy/', import.meta.url);
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
  return readFile(new URL(path, FIXTURE_ROOT), 'utf8');
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

/**
 * @param {{
 *   timezone?: string,
 *   files?: Map<string, string>,
 *   roots?: Map<string, string>,
 *   auditRecords?: readonly object[],
 *   assertPinnedCheckout?: (pin: any) => Promise<void>,
 * }} [options]
 */
function auditDependencies(options = {}) {
  const files = new Map([
    ['package.json', JSON.stringify({ test262: AUDIT_PIN })],
    ['tools/test262/es2015-policy.json', POLICY],
    ['tools/test262/es2015-anchors.json', ANCHORS],
    ['tools/test262/upstream-subset.json', AUDIT_SUBSET],
    ['tools/test262/features.json', AUDIT_FEATURES],
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
        throw new Error(`missing fixture file ${path}`);
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
    assertPinnedCheckout:
      options.assertPinnedCheckout ??
      (async (pin) => {
        assertSame(pin.repository, AUDIT_PIN.repository);
        assertSame(pin.revision, AUDIT_PIN.revision);
        assertSame(pin.checkoutPath, AUDIT_PIN.checkoutPath);
      }),
    readAuditEvidence: async () => ({
      records: options.auditRecords ?? [
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
      ],
      blockers: {},
      intentionalDeviations: [],
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
        ]),
        blockers: new Map([['test/language/blocked.js', 'regexp-unicode']]),
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
            status: 'blocked:unexecuted',
            blocker: 'unexecuted',
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
    name: 'ES2015 taxonomy renders balanced summaries with three decimal percentages',
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
          status: 'blocked:unexecuted',
          blocker: 'unexecuted',
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
              name: 'core',
              roots: 2,
              variants: 3,
              rootsPercent: 66.667,
              variantsPercent: 100,
            },
            {
              name: 'malformed',
              roots: 1,
              variants: 0,
              rootsPercent: 33.333,
              variantsPercent: 0,
            },
          ],
        }),
      );
      assertSame(
        renderEs2015Taxonomy({ classifications, summary }),
        'Partition | Roots | Variants | Roots % | Variants %\ncore | 2 | 3 | 66.667 | 100.000\nmalformed | 1 | 0 | 33.333 | 0.000\n',
      );
    },
  },
];
