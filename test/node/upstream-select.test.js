import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertSame } from '../harness/assert.js';
import { assertThrows } from '../harness/assert.js';
import { parseTest262Metadata } from '../../tools/test262/metadata.js';
import {
  ES5_SELECTION_VERSION,
  parseEs5Selection,
} from '../../tools/test262/es5-selection.js';
import {
  createEs2015PromotionAuthorization,
  Es2015PromotionError,
  mergePromotionSubset,
  parseEs2015Promotion,
  promotionPaths,
  supportedFeaturesForPromotedPath,
  validateEs2015Promotion,
} from '../../tools/test262/es2015-promotion.js';
import {
  inspectEngineGrammar,
  selectPaths,
} from '../../tools/test262/upstream-select-paths.js';
import { assertPinnedCheckout } from '../../tools/test262/pin.js';
import {
  parseUpstreamSubset,
  upstreamSubsetPaths,
} from '../../tools/test262/upstream.js';

const EXCLUDED_PATH = 'test/staging/not-read.js';
const REPOSITORY_ROOT = new URL('../../', import.meta.url);
const MODULE_PATH = 'test/built-ins/Array/module.js';
const MODULE_CODE_PATH = 'test/language/module-code/basic.js';
const ELIGIBLE_PATH = 'test/built-ins/Array/eligible.js';
const ORDINARY_PATH = 'test/built-ins/Array/ordinary.js';
const GENERATOR_DECLARATION_PATH =
  'test/built-ins/Array/generator-declaration.js';
const YIELD_FREE_GENERATOR_PATH =
  'test/built-ins/Array/yield-free-generator.js';
const OBJECT_GENERATOR_PATH = 'test/built-ins/Array/object-generator.js';
const CLASS_GENERATOR_PATH = 'test/built-ins/Array/class-generator.js';
const HARNESS_USER_PATH = 'test/built-ins/Array/generator-harness.js';
const GENERATOR_HARNESS = 'generator.js';
const FOCUSED_TAGGED_GENERATOR_PATH =
  'test/built-ins/GeneratorPrototype/next/consecutive-yields.js';
const FOCUSED_UNTAGGED_CLASS_GENERATOR_PATH =
  'test/language/computed-property-names/class/method/generator.js';
const FOCUSED_UNTAGGED_OBJECT_GENERATOR_PATH =
  'test/language/computed-property-names/object/method/generator.js';
const PINNED_CLASS_GENERATOR_NEIGHBOR =
  'test/language/expressions/class/cpn-class-expr-computed-property-name-from-generator-function-declaration.js';
const PINNED_OBJECT_GENERATOR_NEIGHBOR =
  'test/language/expressions/object/cpn-obj-lit-computed-property-name-from-generator-function-declaration.js';
const COMPUTED_PROPERTY_FRONTMATTER =
  '/*---\nfeatures: [computed-property-names]\n---*/\n';
const PROMOTION_PIN = Object.freeze({
  repository: 'https://example.invalid/test262.git',
  revision: '0123456789012345678901234567890123456789',
});
const PROMOTION_PATHS = Object.freeze([
  'test/language/exact.js',
  'test/language/neighbor.js',
]);
const PROMOTION_LEDGER_SHA256 =
  'eaeedcaba2a38a70dddc59794e093318d1edc1dacb41ba64966a593c5dea43ff';
const DURABLE_LEDGER_SHA256 =
  '3f2c617b8639c8048afb1a42b95218250b20b6d51b9313f39473b4ddc1c7c646';
const PRE_PROMOTION_TAXONOMY_SHA256 =
  'ce05cbdf15ee3262651520f81ca7e904e021cd4dfcbb29d787b69b4f8f897e31';
const PRE_PROMOTION_GROUPS_SHA256 =
  '0bda05c5dbc79a868ddedf574cdc598a52a57dc38ef374e6e909db088e164d0a';

/** @param {string} text */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * @param {Partial<{
 *   entries: object[],
 *   rootCount: number,
 *   variantCount: number,
 *   ledgerSha256: string,
 * }>} [overrides]
 */
function promotionFixture(overrides = {}) {
  return {
    version: 1,
    repository: PROMOTION_PIN.repository,
    revision: PROMOTION_PIN.revision,
    sourceTaxonomySha256:
      '1111111111111111111111111111111111111111111111111111111111111111',
    ledgerSha256: PROMOTION_LEDGER_SHA256,
    rootCount: 2,
    variantCount: 3,
    entries: [
      {
        path: 'test/language/exact.js',
        variants: 2,
        features: ['exact-path-feature'],
        includeFeatures: ['include-path-feature'],
      },
      {
        path: 'test/language/neighbor.js',
        variants: 1,
        features: [],
        includeFeatures: [],
      },
    ],
    ...overrides,
  };
}

/**
 * @param {Partial<{
 *   pin: { repository: string, revision: string },
 *   policy: {
 *     es2015Features: readonly string[],
 *     neutralFeatures: readonly string[],
 *     laterFeatures: readonly string[],
 *   },
 *   selectedPaths: readonly string[],
 *   inventory: readonly {
 *     path: string,
 *     variants: number,
 *     metadata: { features?: readonly string[] } | null,
 *     includeFeatures: readonly string[],
 *   }[],
 * }>} [overrides]
 */
function promotionValidationOptions(overrides = {}) {
  return {
    pin: PROMOTION_PIN,
    policy: {
      es2015Features: ['exact-path-feature'],
      neutralFeatures: ['include-path-feature'],
      laterFeatures: ['later-path-feature'],
    },
    selectedPaths: PROMOTION_PATHS,
    inventory: [
      {
        path: 'test/language/exact.js',
        variants: 2,
        metadata: { features: ['exact-path-feature'] },
        includeFeatures: ['include-path-feature'],
      },
      {
        path: 'test/language/neighbor.js',
        variants: 1,
        metadata: { features: [] },
        includeFeatures: [],
      },
    ],
    ...overrides,
  };
}

/**
 * @param {readonly string[]} expansionFeatures
 * @param {readonly object[]} [featureAreas]
 */
function createPolicy(expansionFeatures, featureAreas = []) {
  return parseEs5Selection(
    JSON.stringify({
      version: ES5_SELECTION_VERSION,
      excludedDirectories: ['test/staging'],
      builtins: ['Array', 'GeneratorPrototype'],
      excludedLanguageDirectories: ['module-code'],
      featureAreas,
      expansionFeatures,
      exclusions: [],
    }),
  );
}

const POLICY = createPolicy(['computed-property-names']);
const GENERATOR_POLICY = createPolicy([
  'computed-property-names',
  'generators',
]);
const GENERATOR_SOURCES = new Map([
  [ORDINARY_PATH, 'var ordinary = 1;'],
  [
    GENERATOR_DECLARATION_PATH,
    `${COMPUTED_PROPERTY_FRONTMATTER}function* generated() { yield 1; }`,
  ],
  [
    YIELD_FREE_GENERATOR_PATH,
    `${COMPUTED_PROPERTY_FRONTMATTER}function* empty() {}`,
  ],
  [
    OBJECT_GENERATOR_PATH,
    `${COMPUTED_PROPERTY_FRONTMATTER}var object = { *['value']() { yield 1; } };`,
  ],
  [
    CLASS_GENERATOR_PATH,
    `${COMPUTED_PROPERTY_FRONTMATTER}class Example { *['value']() { yield 1; } }`,
  ],
]);

/**
 * @param {Map<string, string>} sources
 * @param {import('../../tools/test262/es5-selection.js').Es5SelectionPolicy} policy
 * @param {ReadonlyMap<string, {
 *   parsesUnderEngineGrammar: boolean,
 *   usesGeneratorSyntax: boolean,
 * }>} [harnessParsing]
 */
function selectKnownGood(sources, policy, harnessParsing = new Map()) {
  return selectPaths({
    policy,
    previouslySelected: new Set(sources.keys()),
    files: [...sources.keys()],
    harnessParsing,
    readSource: (path) => {
      const source = sources.get(path);

      if (source === undefined) {
        throw new Error(`unexpected source read: ${path}`);
      }

      return source;
    },
  });
}

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
 * @param {() => Promise<unknown>} action
 */
async function rejectionFrom(action) {
  try {
    await action();
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }

  throw new Error('Expected the dirty pinned checkout to be rejected');
}

const GENERATOR_HARNESS_USER_SOURCES = new Map([
  [
    HARNESS_USER_PATH,
    `/*---
includes: [${GENERATOR_HARNESS}]
---*/
var ordinary = 1;`,
  ],
  [
    FOCUSED_TAGGED_GENERATOR_PATH,
    `/*---
features: [generators]
includes: [${GENERATOR_HARNESS}]
---*/
function* focused() { yield 1; }`,
  ],
]);

export default [
  {
    name: 'ES2015 promotion manifest authorizes only reviewed exact dependencies',
    run: () => {
      const manifest = parseEs2015Promotion(JSON.stringify(promotionFixture()));
      const metadata = parseTest262Metadata(
        '/*---\ndescription: exact promotion fixture\nfeatures: [exact-path-feature]\n---*/\n',
      );

      assertSame(Object.isFrozen(manifest), true);
      assertSame(Object.isFrozen(manifest.entries), true);
      assertSame(
        JSON.stringify(promotionPaths(manifest)),
        JSON.stringify(PROMOTION_PATHS),
      );
      assertSame(
        JSON.stringify(
          supportedFeaturesForPromotedPath(
            manifest,
            'test/language/exact.js',
            metadata,
            ['include-path-feature'],
          ),
        ),
        '["exact-path-feature","include-path-feature"]',
      );
      assertSame(
        JSON.stringify(
          supportedFeaturesForPromotedPath(
            manifest,
            'test/language/not-promoted.js',
            metadata,
            ['include-path-feature'],
          ),
        ),
        '[]',
      );
      assertThrows(
        () =>
          supportedFeaturesForPromotedPath(
            manifest,
            'test/language/exact.js',
            parseTest262Metadata(
              '/*---\ndescription: drifted metadata\nfeatures: [different-feature]\n---*/\n',
            ),
            ['include-path-feature'],
          ),
        Es2015PromotionError,
      );
      assertThrows(
        () =>
          supportedFeaturesForPromotedPath(
            manifest,
            'test/language/exact.js',
            metadata,
            ['different-include-feature'],
          ),
        Es2015PromotionError,
      );
      validateEs2015Promotion(manifest, promotionValidationOptions());
    },
  },
  {
    name: 'ES2015 promotion rejects malformed paths, counts, pins, and later dependencies',
    run: () => {
      const exact = promotionFixture().entries[0];
      const neighbor = promotionFixture().entries[1];
      const malformed = [
        promotionFixture({ entries: [exact, exact] }),
        promotionFixture({ entries: [neighbor, exact] }),
        promotionFixture({ rootCount: 3 }),
        promotionFixture({
          ledgerSha256:
            '0000000000000000000000000000000000000000000000000000000000000000',
        }),
      ];

      for (const value of malformed) {
        assertThrows(
          () => parseEs2015Promotion(JSON.stringify(value)),
          Es2015PromotionError,
        );
      }

      const manifest = parseEs2015Promotion(JSON.stringify(promotionFixture()));
      assertThrows(
        () =>
          validateEs2015Promotion(
            manifest,
            promotionValidationOptions({
              pin: {
                ...PROMOTION_PIN,
                revision: '9876543210987654321098765432109876543210',
              },
            }),
          ),
        Es2015PromotionError,
      );
      assertThrows(
        () =>
          validateEs2015Promotion(
            manifest,
            promotionValidationOptions({
              selectedPaths: ['test/language/exact.js'],
            }),
          ),
        Es2015PromotionError,
      );
      assertThrows(
        () =>
          validateEs2015Promotion(
            manifest,
            promotionValidationOptions({
              inventory: [promotionValidationOptions().inventory[0]],
            }),
          ),
        Es2015PromotionError,
      );

      const later = parseEs2015Promotion(
        JSON.stringify(
          promotionFixture({
            entries: [
              {
                ...exact,
                features: ['later-path-feature'],
              },
              neighbor,
            ],
          }),
        ),
      );
      assertThrows(
        () =>
          validateEs2015Promotion(
            later,
            promotionValidationOptions({
              inventory: [
                {
                  ...promotionValidationOptions().inventory[0],
                  metadata: { features: ['later-path-feature'] },
                },
                promotionValidationOptions().inventory[1],
              ],
            }),
          ),
        Es2015PromotionError,
      );
    },
  },
  {
    name: 'upstream promotion authorization verifies the exact selected group before a runner uses it',
    run: () => {
      const subset = parseUpstreamSubset(
        JSON.stringify({
          version: 1,
          repository: PROMOTION_PIN.repository,
          revision: PROMOTION_PIN.revision,
          groups: [
            {
              name: 'es2015/audit-passing-promotion',
              summary: 'Exact promotion fixture.',
              paths: PROMOTION_PATHS,
            },
          ],
        }),
      );
      const authorization = createEs2015PromotionAuthorization({
        promotionText: JSON.stringify(promotionFixture()),
        pin: PROMOTION_PIN,
        policy: promotionValidationOptions().policy,
        subset,
        inventory: promotionValidationOptions().inventory,
      });
      const metadata = parseTest262Metadata(
        '/*---\ndescription: exact promotion fixture\nfeatures: [exact-path-feature]\n---*/\n',
      );

      assertSame(
        JSON.stringify(authorization('test/language/exact.js', metadata)),
        '["exact-path-feature","include-path-feature"]',
      );
      assertSame(
        JSON.stringify(
          authorization('test/language/not-promoted.js', metadata),
        ),
        '[]',
      );
      assertThrows(
        () =>
          createEs2015PromotionAuthorization({
            promotionText: JSON.stringify(promotionFixture()),
            pin: PROMOTION_PIN,
            policy: promotionValidationOptions().policy,
            subset: parseUpstreamSubset(
              JSON.stringify({
                version: 1,
                repository: PROMOTION_PIN.repository,
                revision: PROMOTION_PIN.revision,
                groups: [
                  {
                    name: 'es2015/audit-passing-promotion',
                    summary: 'Missing promoted root.',
                    paths: ['test/language/exact.js'],
                  },
                ],
              }),
            ),
            inventory: promotionValidationOptions().inventory,
          }),
        Es2015PromotionError,
      );
    },
  },
  {
    name: 'upstream selection preserves the exact promotion group outside the ES5 generator',
    run: () => {
      const base = parseUpstreamSubset(
        JSON.stringify({
          version: 1,
          repository: PROMOTION_PIN.repository,
          revision: PROMOTION_PIN.revision,
          groups: [
            {
              name: 'baseline',
              summary: 'Generated baseline root.',
              paths: ['test/language/base.js'],
            },
            {
              name: 'harness',
              summary: 'Generated later group.',
              paths: ['test/language/other.js'],
            },
          ],
        }),
      );
      const before = JSON.stringify(base.groups);
      const promotion = parseEs2015Promotion(
        JSON.stringify(promotionFixture()),
      );
      const merged = mergePromotionSubset(base, promotion);

      assertSame(
        JSON.stringify(merged.groups.map((group) => group.name)),
        JSON.stringify([
          'baseline',
          'es2015/audit-passing-promotion',
          'harness',
        ]),
      );
      assertSame(
        JSON.stringify(
          merged.groups.find(
            (group) => group.name === 'es2015/audit-passing-promotion',
          )?.paths,
        ),
        JSON.stringify(PROMOTION_PATHS),
      );
      assertSame(JSON.stringify(base.groups), before);
      assertThrows(
        () =>
          mergePromotionSubset(
            parseUpstreamSubset(
              JSON.stringify({
                version: 1,
                repository: PROMOTION_PIN.repository,
                revision: PROMOTION_PIN.revision,
                groups: [
                  {
                    name: 'baseline',
                    summary: 'Overlapping generated root.',
                    paths: ['test/language/exact.js'],
                  },
                ],
              }),
            ),
            promotion,
          ),
        Es2015PromotionError,
      );
    },
  },
  {
    name: 'checked-in ES2015 promotion exactly matches the durable ledger and one new subset group',
    run: async () => {
      const [promotionText, subsetText] = await Promise.all([
        readFile(
          new URL('tools/test262/es2015-promotion.json', REPOSITORY_ROOT),
          'utf8',
        ),
        readFile(
          new URL('tools/test262/upstream-subset.json', REPOSITORY_ROOT),
          'utf8',
        ),
      ]);
      const manifest = parseEs2015Promotion(promotionText);
      const subset = parseUpstreamSubset(subsetText);
      const promotion = subset.groups.filter(
        (group) => group.name === 'es2015/audit-passing-promotion',
      );
      const preExistingGroups = subset.groups.filter(
        (group) => group.name !== 'es2015/audit-passing-promotion',
      );
      const paths = promotionPaths(manifest);

      assertSame(manifest.rootCount, 6323);
      assertSame(manifest.variantCount, 11955);
      assertSame(manifest.ledgerSha256, DURABLE_LEDGER_SHA256);
      assertSame(manifest.sourceTaxonomySha256, PRE_PROMOTION_TAXONOMY_SHA256);
      assertSame(sha256(`${paths.join('\n')}\n`), DURABLE_LEDGER_SHA256);
      assertSame(promotion.length, 1);
      assertSame(JSON.stringify(promotion[0]?.paths), JSON.stringify(paths));
      assertSame(
        JSON.stringify(
          upstreamSubsetPaths(subset).filter((path) => paths.includes(path)),
        ),
        JSON.stringify(paths),
      );
      assertSame(preExistingGroups.length, 58);
      assertSame(
        sha256(JSON.stringify(preExistingGroups)),
        PRE_PROMOTION_GROUPS_SHA256,
      );
    },
  },
  {
    name: 'upstream selection reads only structurally eligible paths before metadata decisions',
    run: async () => {
      /** @type {string[]} */
      const reads = [];
      const sources = new Map([
        [MODULE_PATH, '/*---\nflags: [module]\n---*/\n'],
        [ELIGIBLE_PATH, ''],
      ]);
      const paths = await selectPaths({
        policy: POLICY,
        previouslySelected: new Set([MODULE_PATH, ELIGIBLE_PATH]),
        files: [EXCLUDED_PATH, MODULE_PATH, ELIGIBLE_PATH],
        harnessParsing: new Map(),
        readSource: async (path) => {
          reads.push(path);
          const source = sources.get(path);

          if (source === undefined) {
            throw new Error(`unexpected source read: ${path}`);
          }

          return source;
        },
      });

      assertSame(
        JSON.stringify(reads),
        JSON.stringify([MODULE_PATH, ELIGIBLE_PATH]),
        'structurally excluded paths must not be read while module metadata is read before rejection',
      );
      assertSame(JSON.stringify(paths), JSON.stringify([ELIGIBLE_PATH]));
    },
  },
  {
    name: 'upstream selection excludes module-code paths before reading source',
    run: async () => {
      /** @type {string[]} */
      const reads = [];
      const paths = await selectPaths({
        policy: POLICY,
        previouslySelected: new Set([MODULE_CODE_PATH, ELIGIBLE_PATH]),
        files: [MODULE_CODE_PATH, ELIGIBLE_PATH],
        harnessParsing: new Map(),
        readSource: (path) => {
          reads.push(path);
          return '';
        },
      });

      assertSame(JSON.stringify(reads), JSON.stringify([ELIGIBLE_PATH]));
      assertSame(JSON.stringify(paths), JSON.stringify([ELIGIBLE_PATH]));
    },
  },
  {
    name: 'upstream selection admits only exact generator feature areas',
    run: async () => {
      const policy = createPolicy(
        ['computed-property-names', 'generators'],
        [
          {
            prefix: FOCUSED_TAGGED_GENERATOR_PATH,
            features: ['generators'],
            generatorSyntax: true,
            reason: 'Exact focused tagged generator root.',
          },
          {
            prefix: FOCUSED_UNTAGGED_CLASS_GENERATOR_PATH,
            features: [],
            generatorSyntax: true,
            reason: 'Exact focused untagged class generator root.',
          },
          {
            prefix: FOCUSED_UNTAGGED_OBJECT_GENERATOR_PATH,
            features: [],
            generatorSyntax: true,
            reason: 'Exact focused untagged object generator root.',
          },
          {
            prefix: 'test/language/expressions/class',
            features: ['computed-property-names'],
            reason: 'Broad computed class coverage.',
          },
          {
            prefix: 'test/language/expressions/object',
            features: ['computed-property-names'],
            reason: 'Broad computed object coverage.',
          },
        ],
      );
      const sources = new Map([
        [
          FOCUSED_TAGGED_GENERATOR_PATH,
          '/*---\nfeatures: [generators]\n---*/\nfunction* g() { yield 1; }',
        ],
        [
          FOCUSED_UNTAGGED_CLASS_GENERATOR_PATH,
          '/*---\ndescription: focused class\n---*/\nclass C { *g() { yield 1; } }',
        ],
        [
          FOCUSED_UNTAGGED_OBJECT_GENERATOR_PATH,
          '/*---\ndescription: focused object\n---*/\nvar o = { *g() { yield 1; } };',
        ],
        [
          PINNED_CLASS_GENERATOR_NEIGHBOR,
          `${COMPUTED_PROPERTY_FRONTMATTER}class C { [function* () {}] () {} }`,
        ],
        [
          PINNED_OBJECT_GENERATOR_NEIGHBOR,
          `${COMPUTED_PROPERTY_FRONTMATTER}var o = { [function* () {}] () {} };`,
        ],
      ]);
      const paths = await selectPaths({
        policy,
        previouslySelected: new Set(),
        files: [...sources.keys()],
        harnessParsing: new Map(),
        readSource: (path) => {
          const source = sources.get(path);

          if (source === undefined) {
            throw new Error(`unexpected source read: ${path}`);
          }

          return source;
        },
      });

      assertSame(
        JSON.stringify(paths),
        JSON.stringify([
          FOCUSED_TAGGED_GENERATOR_PATH,
          FOCUSED_UNTAGGED_CLASS_GENERATOR_PATH,
          FOCUSED_UNTAGGED_OBJECT_GENERATOR_PATH,
        ]),
      );
      assertSame(
        JSON.stringify(
          policy.featureAreas
            .filter((area) =>
              [
                FOCUSED_TAGGED_GENERATOR_PATH,
                FOCUSED_UNTAGGED_CLASS_GENERATOR_PATH,
                FOCUSED_UNTAGGED_OBJECT_GENERATOR_PATH,
              ].includes(area.prefix),
            )
            .map((area) => area.features),
        ),
        '[["generators"],[],[]]',
        'syntax authorization must preserve each pinned metadata feature list',
      );
    },
  },
  {
    name: 'upstream selection defers generator syntax until generators expansion',
    run: async () => {
      const paths = await selectKnownGood(GENERATOR_SOURCES, POLICY);

      assertSame(JSON.stringify(paths), JSON.stringify([ORDINARY_PATH]));
    },
  },
  {
    name: 'generator expansion alone does not admit generator syntax without exact areas',
    run: async () => {
      const paths = await selectKnownGood(GENERATOR_SOURCES, GENERATOR_POLICY);

      assertSame(JSON.stringify(paths), JSON.stringify([ORDINARY_PATH]));
    },
  },
  {
    name: 'generator-bearing harnesses require the including exact-file authorization',
    run: async () => {
      const policy = createPolicy(
        ['computed-property-names', 'generators'],
        [
          {
            prefix: FOCUSED_TAGGED_GENERATOR_PATH,
            features: ['generators'],
            generatorSyntax: true,
            reason: 'Exact focused generator root.',
          },
        ],
      );
      const selected = await selectKnownGood(
        GENERATOR_HARNESS_USER_SOURCES,
        policy,
        new Map([
          [
            GENERATOR_HARNESS,
            inspectEngineGrammar(
              'function* harnessGenerator() { yield 1; }',
              policy,
            ),
          ],
        ]),
      );

      assertSame(
        JSON.stringify(selected),
        JSON.stringify([FOCUSED_TAGGED_GENERATOR_PATH]),
        'an ordinary baseline candidate must not inherit generator syntax from the global expansion, while the exact authorized root remains eligible',
      );
    },
  },
  {
    name: 'pinned checkout validation rejects tracked and untracked tree changes',
    async run() {
      const checkoutUrl = new URL(
        `.test262-pin-${randomUUID()}/`,
        import.meta.url,
      );
      const checkoutPath = fileURLToPath(checkoutUrl);

      try {
        await mkdir(checkoutUrl);
        runGit(checkoutPath, ['init', '--quiet']);
        runGit(checkoutPath, ['config', 'user.name', 'JSJS Tests']);
        runGit(checkoutPath, ['config', 'user.email', 'tests@example.invalid']);
        await writeFile(new URL('tracked.js', checkoutUrl), 'clean\n', 'utf8');
        runGit(checkoutPath, ['add', 'tracked.js']);
        runGit(checkoutPath, ['commit', '--quiet', '-m', 'fixture']);
        const revision = runGit(checkoutPath, ['rev-parse', 'HEAD']);
        runGit(checkoutPath, ['checkout', '--quiet', '--detach', revision]);
        const pin = {
          repository: 'https://example.invalid/test262.git',
          revision,
          checkoutPath,
        };

        await assertPinnedCheckout(pin);

        await writeFile(
          new URL('tracked.js', checkoutUrl),
          'modified\n',
          'utf8',
        );
        const tracked = await rejectionFrom(() => assertPinnedCheckout(pin));
        assertSame(tracked.message.includes('uncommitted changes'), true);

        runGit(checkoutPath, ['checkout', '--', 'tracked.js']);
        await writeFile(new URL('untracked.js', checkoutUrl), 'new\n', 'utf8');
        const untracked = await rejectionFrom(() => assertPinnedCheckout(pin));
        assertSame(untracked.message.includes('uncommitted changes'), true);
      } finally {
        await rm(checkoutUrl, { recursive: true, force: true });
      }
    },
  },
];
