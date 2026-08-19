import { assertSame } from '../harness/assert.js';
import { createNodeTest262Host } from '../../tools/test262/adapters/node.js';
import { createJsjsTest262Engine } from '../../tools/test262/engine.js';
import { runTest262 } from '../../tools/test262/runner.js';
import { ASYNC_RUNTIME_RELEASE_MANIFEST } from '../../tools/test262/async-runtime-release-manifest.js';
import {
  assertPinnedCheckout,
  readTest262Pin,
} from '../../tools/test262/upstream-run.js';

const RELEASE = ASYNC_RUNTIME_RELEASE_MANIFEST.promise;
const FOCUSED_PATHS = Object.freeze(
  RELEASE.records.map((record) => record.path),
);

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
        supportedFeatures: RELEASE.supportedFeatures,
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
