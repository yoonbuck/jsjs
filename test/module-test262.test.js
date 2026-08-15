import { assertSame } from './harness/assert.js';
import { createJsjsTest262Engine } from '../tools/test262/engine.js';
import { runTest262 } from '../tools/test262/runner.js';

const ROOT = 'test/language/module-code/root.js';

/** @type {Readonly<Record<string, string>>} */
const HARNESS = Object.freeze({
  'assert.js': [
    'function assert(condition, message) {',
    '  if (condition !== true) {',
    "    throw new Test262Error('assert failed: ' + message);",
    '  }',
    '}',
    'assert.sameValue = function (actual, expected, message) {',
    '  if (actual !== expected) {',
    "    throw new Test262Error('assert.sameValue failed: ' + message);",
    '  }',
    '};',
  ].join('\n'),
  'sta.js': [
    'function Test262Error(message) {',
    '  this.message = message;',
    '}',
  ].join('\n'),
});

/**
 * @param {string} description
 * @param {string} source
 * @param {string} [metadata]
 * @returns {string}
 */
function moduleFixture(description, source, metadata = '') {
  return `/*---
description: ${description}
flags: [module]
${metadata}---*/
${source}
`;
}

/**
 * @param {Map<string, string>} files
 * @param {Map<string, number>} reads
 * @returns {import('../tools/test262/runner.js').Test262Host}
 */
function createModuleHost(files, reads) {
  /**
   * @param {string} path
   * @returns {string}
   */
  const read = (path) => {
    reads.set(path, (reads.get(path) ?? 0) + 1);
    const source = files.get(path);

    if (source === undefined) {
      throw new Error(`No such module fixture: ${path}`);
    }

    return source;
  };

  return {
    readTest: read,
    readInclude(name) {
      const source = HARNESS[name];

      if (source === undefined) {
        throw new Error(`No such harness fixture: ${name}`);
      }

      return source;
    },
    readModule: read,
  };
}

/**
 * @param {Map<string, string>} files
 * @param {readonly string[]} [paths]
 * @returns {Promise<{ run: Awaited<ReturnType<typeof runTest262>>, reads: Map<string, number> }>}
 */
async function runModuleFixture(files, paths = [ROOT]) {
  const reads = new Map();
  const run = await runTest262({
    engine: createJsjsTest262Engine(),
    host: createModuleHost(files, reads),
    paths,
    supportedFeatures: [],
    skipFeatures: [],
  });

  return { run, reads };
}

export default [
  {
    name: 'module flag loads fixture dependencies through the portable host without rereading the root',
    run: async () => {
      const files = new Map([
        [
          ROOT,
          moduleFixture(
            'relative dependency',
            'import { value } from "./basic_FIXTURE.js";\nassert.sameValue(value, 42, "relative value");',
          ),
        ],
        [
          'test/language/module-code/basic_FIXTURE.js',
          'export const value = 42;',
        ],
      ]);
      const { run, reads } = await runModuleFixture(files);

      assertSame(run.summary.passed, 1);
      assertSame(run.summary.failed, 0);
      assertSame(run.records[0].variant, 'non-strict');
      assertSame(reads.get(ROOT), 1, 'metadata read is the only root read');
      assertSame(reads.get('test/language/module-code/basic_FIXTURE.js'), 1);
    },
  },
  {
    name: 'module fixtures resolve nested relative dependencies with string paths',
    run: async () => {
      const files = new Map([
        [
          ROOT,
          moduleFixture(
            'nested relative dependency',
            'import { value } from "./nested/first_FIXTURE.js";\nassert.sameValue(value, 42, "nested value");',
          ),
        ],
        [
          'test/language/module-code/nested/first_FIXTURE.js',
          'export { value } from "./second_FIXTURE.js";',
        ],
        [
          'test/language/module-code/nested/second_FIXTURE.js',
          'export const value = 42;',
        ],
      ]);
      const { run } = await runModuleFixture(files);

      assertSame(run.summary.passed, 1);
      assertSame(run.summary.failed, 0);
    },
  },
  {
    name: 'module fixtures load a shared dependency once',
    run: async () => {
      const shared = 'test/language/module-code/shared_FIXTURE.js';
      const files = new Map([
        [
          ROOT,
          moduleFixture(
            'shared dependency',
            [
              'import { left } from "./left_FIXTURE.js";',
              'import { right } from "./right_FIXTURE.js";',
              'assert.sameValue(left, 42, "left");',
              'assert.sameValue(right, 42, "right");',
            ].join('\n'),
          ),
        ],
        [
          'test/language/module-code/left_FIXTURE.js',
          'export { value as left } from "./shared_FIXTURE.js";',
        ],
        [
          'test/language/module-code/right_FIXTURE.js',
          'export { value as right } from "./shared_FIXTURE.js";',
        ],
        [shared, 'export const value = 42;'],
      ]);
      const { run, reads } = await runModuleFixture(files);

      assertSame(run.summary.passed, 1);
      assertSame(reads.get(shared), 1, 'shared source loads once');
    },
  },
  {
    name: 'module fixtures observe exported live bindings',
    run: async () => {
      const files = new Map([
        [
          ROOT,
          moduleFixture(
            'live binding',
            [
              'import { increment, value } from "./live_FIXTURE.js";',
              'increment();',
              'assert.sameValue(value, 2, "live export");',
            ].join('\n'),
          ),
        ],
        [
          'test/language/module-code/live_FIXTURE.js',
          'export let value = 1;\nexport function increment() { value += 1; }',
        ],
      ]);
      const { run } = await runModuleFixture(files);

      assertSame(run.summary.passed, 1);
      assertSame(run.summary.failed, 0);
    },
  },
  {
    name: 'module parse negatives use the module parser SyntaxError',
    run: async () => {
      const files = new Map([
        [
          ROOT,
          moduleFixture(
            'module parse negative',
            'export const = 42;',
            'negative:\n  phase: parse\n  type: SyntaxError\n',
          ),
        ],
      ]);
      const { run } = await runModuleFixture(files);

      assertSame(run.summary.passed, 1);
      assertSame(run.records[0].status, 'passed');
    },
  },
  {
    name: 'module resolution negatives use the linker guest SyntaxError',
    run: async () => {
      const files = new Map([
        [
          ROOT,
          moduleFixture(
            'module resolution negative',
            'export { missing } from "./resolution_FIXTURE.js";',
            'negative:\n  phase: resolution\n  type: SyntaxError\n',
          ),
        ],
        [
          'test/language/module-code/resolution_FIXTURE.js',
          'export const present = 42;',
        ],
      ]);
      const { run } = await runModuleFixture(files);

      assertSame(run.summary.passed, 1);
      assertSame(run.records[0].status, 'passed');
    },
  },
  {
    name: 'module host resolution and load failures remain engine errors',
    run: async () => {
      const files = new Map([
        [
          'test/language/module-code/bare.js',
          moduleFixture(
            'unsupported bare specifier',
            'import "unmapped";',
            'negative:\n  phase: resolution\n  type: SyntaxError\n',
          ),
        ],
        [
          'test/language/module-code/missing.js',
          moduleFixture(
            'missing module source',
            'import "./missing_FIXTURE.js";',
            'negative:\n  phase: resolution\n  type: SyntaxError\n',
          ),
        ],
      ]);
      const { run } = await runModuleFixture(files, [
        'test/language/module-code/bare.js',
        'test/language/module-code/missing.js',
      ]);

      assertSame(run.summary.passed, 0);
      assertSame(run.summary.failed, 2);
      assertSame(
        run.records.map((record) => record.reason).join(','),
        'engine-error,engine-error',
      );
    },
  },
  {
    name: 'encoded structural module requests fail before host readModule',
    run: async () => {
      for (const specifier of [
        './%2e%2e/escaped_FIXTURE.js',
        './nested%2Fchild_FIXTURE.js',
        './nested%5cchild_FIXTURE.js',
      ]) {
        const files = new Map([
          [
            ROOT,
            moduleFixture(
              'encoded structural module request',
              `import "${specifier}";`,
            ),
          ],
        ]);
        const { run, reads } = await runModuleFixture(files);

        assertSame(run.summary.failed, 1);
        assertSame(run.records[0].reason, 'engine-error');
        assertSame(reads.get(ROOT), 1);
        assertSame(reads.size, 1);
      }
    },
  },
];
