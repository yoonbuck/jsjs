import { assertSame } from '../harness/assert.js';
import { createNodeTest262Host } from '../../tools/test262/adapters/node.js';
import { createJsjsTest262Engine } from '../../tools/test262/engine.js';
import { runTest262 } from '../../tools/test262/runner.js';
import {
  assertPinnedCheckout,
  readTest262Pin,
} from '../../tools/test262/upstream-run.js';

const FOCUSED_PATHS = Object.freeze([
  'test/built-ins/Promise/Symbol.species/prop-desc.js',
  'test/built-ins/Promise/all/capability-resolve-throws-no-close.js',
  'test/built-ins/Promise/all/capability-resolve-throws-reject.js',
  'test/built-ins/Promise/all/resolve-non-thenable.js',
  'test/built-ins/Promise/constructor.js',
  'test/built-ins/Promise/prototype/Symbol.toStringTag.js',
  'test/built-ins/Promise/prototype/then/rxn-handler-identity.js',
  'test/built-ins/Promise/prototype/then/rxn-handler-thrower.js',
  'test/built-ins/Promise/race/resolved-sequence.js',
  'test/built-ins/Promise/resolve-thenable-immed.js',
  'test/built-ins/Promise/resolve/resolve-thenable.js',
]);

export default [
  {
    name: 'focused ES2015 Promise upstream Test262 files all pass',
    run: async () => {
      assertSame(
        JSON.stringify(FOCUSED_PATHS),
        JSON.stringify([...FOCUSED_PATHS].sort()),
        'focused Promise paths must remain lexicographically sorted',
      );
      const pin = await readTest262Pin();

      await assertPinnedCheckout(pin);

      const { summary, records } = await runTest262({
        engine: createJsjsTest262Engine(),
        host: createNodeTest262Host({ root: pin.checkoutPath }),
        paths: FOCUSED_PATHS,
        supportedFeatures: [
          'Symbol.iterator',
          'Symbol.species',
          'Symbol.toStringTag',
        ],
        skipFeatures: [],
      });
      const problems = records.filter((record) => record.status !== 'passed');

      assertSame(
        problems.length,
        0,
        `Expected every focused Promise file to pass, got: ${JSON.stringify(problems)}`,
      );
      assertSame(summary.failed, 0);
      assertSame(summary.skipped, 0);
    },
  },
];
