import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertSame } from '../harness/assert.js';
import {
  ES5_SELECTION_VERSION,
  parseEs5Selection,
} from '../../tools/test262/es5-selection.js';
import {
  inspectEngineGrammar,
  selectPaths,
} from '../../tools/test262/upstream-select-paths.js';
import { assertPinnedCheckout } from '../../tools/test262/upstream-run.js';

const EXCLUDED_PATH = 'test/staging/not-read.js';
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
