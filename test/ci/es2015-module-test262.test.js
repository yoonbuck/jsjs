/**
 * Focused static-module coverage from the exact pinned Test262 checkout.
 *
 * These roots exercise the ES2015 static-module behavior this engine supports;
 * their adjacent `_FIXTURE.js` dependencies are loaded by the portable host and
 * are intentionally not root test records.
 */

import { assertSame } from '../harness/assert.js';
import { createNodeTest262Host } from '../../tools/test262/adapters/node.js';
import { createJsjsTest262Engine } from '../../tools/test262/engine.js';
import { runTest262 } from '../../tools/test262/runner.js';
import {
  assertPinnedCheckout,
  readTest262Pin,
} from '../../tools/test262/upstream-run.js';

const FOCUSED_PATHS = Object.freeze([
  'test/language/module-code/ambiguous-export-bindings/omitted-from-namespace.js',
  'test/language/module-code/eval-export-dflt-expr-fn-anon.js',
  'test/language/module-code/eval-gtbndng-indirect-update.js',
  'test/language/module-code/eval-gtbndng-local-bndng-let.js',
  'test/language/module-code/eval-this.js',
  'test/language/module-code/instn-iee-bndng-fun.js',
  'test/language/module-code/instn-iee-err-dflt-thru-star.js',
  'test/language/module-code/instn-iee-err-not-found.js',
  'test/language/module-code/instn-iee-iee-cycle.js',
  'test/language/module-code/namespace/Symbol.toStringTag.js',
]);

const SUPPORTED_FEATURES = Object.freeze(['Symbol.toStringTag']);

export default [
  {
    name: 'focused ES2015 static-module Test262 roots all pass at the pinned revision',
    run: async () => {
      assertSame(
        JSON.stringify(FOCUSED_PATHS),
        JSON.stringify([...FOCUSED_PATHS].sort()),
        'focused Test262 paths must stay lexicographically sorted',
      );
      const pin = await readTest262Pin();

      await assertPinnedCheckout(pin);

      const { records, summary } = await runTest262({
        engine: createJsjsTest262Engine(),
        host: createNodeTest262Host({ root: pin.checkoutPath }),
        paths: FOCUSED_PATHS,
        supportedFeatures: SUPPORTED_FEATURES,
        skipFeatures: [],
      });
      const problems = records.filter((record) => record.status !== 'passed');

      assertSame(
        problems.length,
        0,
        `focused module records did not pass: ${JSON.stringify(problems)}`,
      );
      assertSame(summary.passed, FOCUSED_PATHS.length);
      assertSame(summary.failed, 0);
      assertSame(summary.skipped, 0);
    },
  },
];
