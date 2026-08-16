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
import {
  expandVariants,
  parseTest262Metadata,
  resolveIncludes,
} from '../../tools/test262/metadata.js';
import { decideSkip, runTest262 } from '../../tools/test262/runner.js';
import { ASYNC_RUNTIME_RELEASE_MANIFEST } from '../../tools/test262/async-runtime-release-manifest.js';
import {
  assertPinnedCheckout,
  readTest262Pin,
} from '../../tools/test262/upstream-run.js';

const RELEASE = ASYNC_RUNTIME_RELEASE_MANIFEST.module;
const FOCUSED_PATHS = Object.freeze(
  RELEASE.records.map((record) => record.path),
);

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
        supportedFeatures: RELEASE.supportedFeatures,
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
  {
    name: 'pinned module raw metadata expands once without harness rewriting',
    run: async () => {
      const pin = await readTest262Pin();
      await assertPinnedCheckout(pin);
      const host = createNodeTest262Host({ root: pin.checkoutPath });

      for (const path of [
        'test/language/comments/hashbang/module.js',
        'test/language/module-code/import-attributes/allow-nlt-before-with.js',
      ]) {
        const metadata = parseTest262Metadata(await host.readTest(path));

        assertSame(JSON.stringify(metadata.flags), '["module","raw"]');
        assertSame(JSON.stringify(expandVariants(metadata)), '["raw"]');
        assertSame(JSON.stringify(resolveIncludes(metadata)), '[]');
        assertSame(
          decideSkip(metadata, {
            supportedFeatures: RELEASE.supportedFeatures,
          })?.reason,
          'unsupported-feature',
        );
      }
    },
  },
];
