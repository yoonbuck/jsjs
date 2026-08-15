import { assertSame } from '../harness/assert.js';
import {
  ES5_SELECTION_VERSION,
  parseEs5Selection,
} from '../../tools/test262/es5-selection.js';
import {
  parsesUnderEngineGrammar,
  selectPaths,
} from '../../tools/test262/upstream-select-paths.js';

const EXCLUDED_PATH = 'test/staging/not-read.js';
const MODULE_PATH = 'test/built-ins/Array/module.js';
const ELIGIBLE_PATH = 'test/built-ins/Array/eligible.js';
const ORDINARY_PATH = 'test/built-ins/Array/ordinary.js';
const GENERATOR_DECLARATION_PATH =
  'test/built-ins/Array/generator-declaration.js';
const OBJECT_GENERATOR_PATH = 'test/built-ins/Array/object-generator.js';
const CLASS_GENERATOR_PATH = 'test/built-ins/Array/class-generator.js';
const HARNESS_USER_PATH = 'test/built-ins/Array/generator-harness.js';
const GENERATOR_HARNESS = 'generator.js';
const COMPUTED_PROPERTY_FRONTMATTER =
  '/*---\nfeatures: [computed-property-names]\n---*/\n';

/**
 * @param {readonly string[]} expansionFeatures
 */
function createPolicy(expansionFeatures) {
  return parseEs5Selection(
    JSON.stringify({
      version: ES5_SELECTION_VERSION,
      excludedDirectories: ['test/staging'],
      builtins: ['Array'],
      excludedLanguageDirectories: [],
      featureAreas: [],
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
 * @param {ReadonlyMap<string, boolean>} [harnessParsing]
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

const GENERATOR_HARNESS_USER_SOURCES = new Map([
  [
    HARNESS_USER_PATH,
    `/*---
includes: [${GENERATOR_HARNESS}]
---*/
var ordinary = 1;`,
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
    name: 'upstream selection defers generator syntax until generators expansion',
    run: async () => {
      const paths = await selectKnownGood(GENERATOR_SOURCES, POLICY);

      assertSame(JSON.stringify(paths), JSON.stringify([ORDINARY_PATH]));
    },
  },
  {
    name: 'upstream selection admits generator syntax with generators expansion',
    run: async () => {
      const paths = await selectKnownGood(GENERATOR_SOURCES, GENERATOR_POLICY);

      assertSame(
        JSON.stringify(paths),
        JSON.stringify([...GENERATOR_SOURCES.keys()]),
      );
    },
  },
  {
    name: 'upstream selection applies the generator boundary to harness includes',
    run: async () => {
      const generatorHarnessSource =
        'function* harnessGenerator() { yield 1; }';
      const deferred = await selectKnownGood(
        GENERATOR_HARNESS_USER_SOURCES,
        POLICY,
        new Map([
          [
            GENERATOR_HARNESS,
            parsesUnderEngineGrammar(generatorHarnessSource, POLICY),
          ],
        ]),
      );
      const enabled = await selectKnownGood(
        GENERATOR_HARNESS_USER_SOURCES,
        GENERATOR_POLICY,
        new Map([
          [
            GENERATOR_HARNESS,
            parsesUnderEngineGrammar(generatorHarnessSource, GENERATOR_POLICY),
          ],
        ]),
      );

      assertSame(JSON.stringify(deferred), '[]');
      assertSame(JSON.stringify(enabled), JSON.stringify([HARNESS_USER_PATH]));
    },
  },
];
