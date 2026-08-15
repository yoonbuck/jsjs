import { assertSame } from '../harness/assert.js';
import { createNodeTest262Host } from '../../tools/test262/adapters/node.js';
import { createJsjsTest262Engine } from '../../tools/test262/engine.js';
import { runTest262 } from '../../tools/test262/runner.js';
import {
  assertPinnedCheckout,
  readTest262Pin,
} from '../../tools/test262/upstream-run.js';

const FOCUSED_PATHS = Object.freeze([
  'test/built-ins/GeneratorFunction/invoked-as-constructor-no-arguments.js',
  'test/built-ins/GeneratorFunction/invoked-as-function-multiple-arguments.js',
  'test/built-ins/GeneratorFunction/prototype/Symbol.toStringTag.js',
  'test/built-ins/GeneratorPrototype/next/consecutive-yields.js',
  'test/built-ins/GeneratorPrototype/next/from-state-executing.js',
  'test/built-ins/GeneratorPrototype/return/from-state-suspended-start.js',
  'test/built-ins/GeneratorPrototype/return/try-finally-within-try.js',
  'test/built-ins/GeneratorPrototype/throw/from-state-suspended-start.js',
  'test/built-ins/GeneratorPrototype/throw/try-catch-within-try.js',
  'test/language/computed-property-names/class/method/generator.js',
  'test/language/computed-property-names/object/method/generator.js',
]);

export default [
  {
    name: 'focused ES2015 generator upstream Test262 files all pass',
    run: async () => {
      assertSame(
        JSON.stringify(FOCUSED_PATHS),
        JSON.stringify([...FOCUSED_PATHS].sort()),
        'focused generator paths must remain lexicographically sorted',
      );
      const pin = await readTest262Pin();

      await assertPinnedCheckout(pin);

      const { summary, records } = await runTest262({
        engine: createJsjsTest262Engine(),
        host: createNodeTest262Host({ root: pin.checkoutPath }),
        paths: FOCUSED_PATHS,
        supportedFeatures: [
          'generators',
          'Symbol.iterator',
          'Symbol.toStringTag',
        ],
        skipFeatures: [],
      });
      const problems = records.filter((record) => record.status !== 'passed');

      assertSame(
        problems.length,
        0,
        `Expected every focused generator file to pass, got: ${JSON.stringify(problems)}`,
      );
      assertSame(summary.failed, 0);
      assertSame(summary.skipped, 0);
    },
  },
];
