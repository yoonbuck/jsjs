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

export default [
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
