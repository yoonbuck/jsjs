/**
 * Focused upstream Test262 coverage for issue #38 (ES2015 object/function
 * runtime updates). This is a hand-picked file list, not the ES5
 * `upstream-subset.json`/`es5-selection.json` pipeline — that pipeline is
 * scoped to an ES5.1 engine and is shared with the parallel lexical-
 * declarations (#41) and Symbols (#43) branches, so this suite stays
 * separate until #45 integrates all three. It lives in `test/ci/` rather
 * than `test/node/` because, like `exclusions-check.test.js`, it needs a
 * real upstream Test262 checkout at `vendor/test262` (see `docs/testing.md`).
 *
 * Two of the picked files carry a Test262 `features` tag that does not
 * match anything this engine implements broadly (`arrow-function` on the
 * `getOwnPropertyNames` ordering test, `for-in-order` on the `Object.keys`
 * ordering test) even though neither test body actually exercises that
 * feature — an upstream labelling artifact. Declaring both names in
 * `supportedFeatures` only prevents *this* focused run from skipping those
 * two files; it does not add either feature to the engine or to
 * `tools/test262/features.json`.
 */

import { createRealm, evaluateScript } from '../../src/index.js';
import { runTest262 } from '../../tools/test262/runner.js';
import { createNodeTest262Host } from '../../tools/test262/adapters/node.js';
import {
  assertPinnedCheckout,
  readTest262Pin,
} from '../../tools/test262/upstream-run.js';

/**
 * Repository-relative paths, sorted, matching `docs/conformance.md`. All
 * twelve were confirmed present in the pinned checkout
 * (`b363f29d3c43c626dc852744ad64a0b48a003693`) before this suite was written.
 */
const FOCUSED_PATHS = Object.freeze([
  'test/built-ins/Function/prototype/bind/length.js',
  'test/built-ins/Function/prototype/bind/name.js',
  'test/built-ins/Object/getOwnPropertyNames/order-after-define-property.js',
  'test/built-ins/Object/is/not-same-value-x-y-object.js',
  'test/built-ins/Object/keys/return-order.js',
  'test/built-ins/Object/setPrototypeOf/property-descriptor.js',
  'test/language/expressions/function/name.js',
  'test/language/expressions/object/getter-prop-desc.js',
  'test/language/expressions/object/getter-super-prop.js',
  'test/language/expressions/object/setter-prop-desc.js',
  'test/language/expressions/object/setter-super-prop.js',
  'test/language/statements/function/name.js',
]);

export default [
  {
    name: 'focused ES2015 object/function upstream Test262 files all pass',
    run: async () => {
      const pin = await readTest262Pin();

      await assertPinnedCheckout(pin);

      const host = createNodeTest262Host({ root: pin.checkoutPath });
      const { summary, records } = await runTest262({
        engine: { createRealm, evaluateScript },
        host,
        paths: FOCUSED_PATHS,
        supportedFeatures: ['arrow-function', 'for-in-order'],
        skipFeatures: [],
      });

      if (summary.failed > 0 || summary.skipped > 0) {
        const problems = records.filter((record) => record.status !== 'passed');

        throw new Error(
          `Expected every focused file to pass, got: ${JSON.stringify(problems)}`,
        );
      }
    },
  },
];
