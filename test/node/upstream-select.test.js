import { assertSame } from '../harness/assert.js';
import {
  ES5_SELECTION_VERSION,
  parseEs5Selection,
} from '../../tools/test262/es5-selection.js';
import { selectPaths } from '../../tools/test262/upstream-select-paths.js';

const EXCLUDED_PATH = 'test/staging/not-read.js';
const MODULE_PATH = 'test/built-ins/Array/module.js';
const ELIGIBLE_PATH = 'test/built-ins/Array/eligible.js';

const POLICY = parseEs5Selection(
  JSON.stringify({
    version: ES5_SELECTION_VERSION,
    excludedDirectories: ['test/staging'],
    builtins: ['Array'],
    excludedLanguageDirectories: [],
    featureAreas: [],
    expansionFeatures: ['class'],
    exclusions: [],
  }),
);

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
];
