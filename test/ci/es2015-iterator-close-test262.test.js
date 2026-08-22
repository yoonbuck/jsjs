/**
 * Exact upstream regressions for IteratorClose while generator suspension
 * interrupts array destructuring target evaluation. These six roots produce
 * twelve strict/non-strict variants and deliberately return iterators without
 * `next`: the abrupt target completion must close through `return` before any
 * IteratorNext call becomes necessary.
 */

import { runTest262 } from '../../tools/test262/runner.js';
import { createNodeTest262Host } from '../../tools/test262/adapters/node.js';
import { createJsjsTest262Engine } from '../../tools/test262/engine.js';
import {
  assertPinnedCheckout,
  readTest262Pin,
} from '../../tools/test262/upstream-run.js';

const FOCUSED_PATHS = Object.freeze([
  'test/language/expressions/assignment/dstr/array-elem-iter-rtrn-close-err.js',
  'test/language/expressions/assignment/dstr/array-rest-iter-rtrn-close-err.js',
  'test/language/expressions/assignment/dstr/array-rest-iter-rtrn-close-null.js',
  'test/language/statements/for-of/dstr/array-elem-iter-rtrn-close-err.js',
  'test/language/statements/for-of/dstr/array-rest-iter-rtrn-close-err.js',
  'test/language/statements/for-of/dstr/array-rest-iter-rtrn-close-null.js',
]);

export default [
  {
    name: 'exact suspended destructuring IteratorClose Test262 variants pass',
    run: async () => {
      const pin = await readTest262Pin();

      await assertPinnedCheckout(pin);

      const { records, summary } = await runTest262({
        engine: createJsjsTest262Engine(),
        host: createNodeTest262Host({ root: pin.checkoutPath }),
        paths: FOCUSED_PATHS,
        supportedFeatures: [
          'Symbol.iterator',
          'destructuring-binding',
          'generators',
        ],
        skipFeatures: [],
      });

      if (summary.failed > 0 || summary.skipped > 0 || records.length !== 12) {
        throw new Error(
          `Expected 12 passing IteratorClose variants, got: ${JSON.stringify(
            records.filter((record) => record.status !== 'passed'),
          )}`,
        );
      }
    },
  },
];
