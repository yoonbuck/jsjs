/**
 * Tests for the stale-exclusion check logic.
 *
 * This suite lives behind the CI-contract entry point (`test/run-ci-contract.js`)
 * because it requires an upstream Test262 checkout at `vendor/test262`. The same
 * guarantee is enforced in CI by `npm run test262:exclusions:check` in the
 * `test262-upstream` job. It exercises the integration path: the real policy
 * file, a real checkout, and the real engine, confirming that the runner
 * correctly identifies passing and failing tests.
 */

import { readFile } from 'node:fs/promises';
import { assertSame } from '../harness/assert.js';
import { checkExclusions } from '../../tools/test262/exclusions-check.js';
import { readTest262Pin } from '../../tools/test262/upstream-run.js';
import {
  FEATURES_MANIFEST_FILE,
  featureNames,
  parseFeatureManifest,
} from '../../tools/test262/features.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);

/**
 * @param {string} path
 * @returns {Promise<string>}
 */
function readRepositoryFile(path) {
  return readFile(new URL(path, REPOSITORY_ROOT_URL), 'utf8');
}

/**
 * @param {Promise<unknown>} promise
 * @returns {Promise<Error>}
 */
async function rejectionFrom(promise) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }

    throw new Error(`Expected an Error rejection, got ${typeof error}`);
  }

  throw new Error('Expected promise to reject');
}

export default [
  {
    name: 'checkExclusions rejects a missing pinned checkout with setup commands',
    run: async () => {
      const pin = await readTest262Pin();
      const missingCheckout = 'vendor/missing-test262-checkout';
      const error = await rejectionFrom(
        checkExclusions({
          pin: { ...pin, checkoutPath: missingCheckout },
          supportedFeatures: [],
        }),
      );

      assertSame(
        error.message.includes(
          `${missingCheckout} is not a git checkout.\nCheck the pinned upstream tree out first:`,
        ),
        true,
      );
      assertSame(
        error.message.includes(
          `git clone --filter=blob:none ${pin.repository} ${missingCheckout}`,
        ),
        true,
      );
      assertSame(
        error.message.includes(
          `git -C ${missingCheckout} checkout ${pin.revision}`,
        ),
        true,
      );
    },
  },
  {
    name: 'checkExclusions rejects a policy path missing from the pinned checkout',
    run: async () => {
      const pin = await readTest262Pin();
      const selectionText = await readRepositoryFile(
        'test/fixtures/test262-exclusions/missing-path.json',
      );
      const error = await rejectionFrom(
        checkExclusions({
          pin,
          selectionText,
          supportedFeatures: [],
        }),
      );

      assertSame(
        error.message.includes(
          'test/built-ins/Array/missing-exclusion-fixture.js',
        ),
        true,
      );
      assertSame(error.message.includes(pin.checkoutPath), true);
      assertSame(
        error.message.includes('Update tools/test262/es5-selection.json'),
        true,
      );
    },
  },
  {
    name: 'checkExclusions reports no stale exclusions in the committed policy',
    run: async () => {
      const pin = await readTest262Pin();
      const supportedFeatures = featureNames(
        parseFeatureManifest(await readRepositoryFile(FEATURES_MANIFEST_FILE)),
      );

      const results = await checkExclusions({
        pin,
        supportedFeatures,
      });

      const stale = results.filter((r) => r.verdict === 'passed');

      assertSame(
        stale.length,
        0,
        `Expected no stale exclusions, found: ${stale.map((r) => r.path).join(', ')}`,
      );
    },
  },
  {
    name: 'checkExclusions classifies results into passed, failed, and unverifiable',
    run: async () => {
      const pin = await readTest262Pin();
      const supportedFeatures = featureNames(
        parseFeatureManifest(await readRepositoryFile(FEATURES_MANIFEST_FILE)),
      );

      const results = await checkExclusions({
        pin,
        supportedFeatures,
      });

      const failed = results.filter((r) => r.verdict === 'failed');

      // The committed policy has many correctly-excluded tests
      assertSame(
        failed.length > 0,
        true,
        'should have failed (correctly excluded) entries',
      );

      // Some tests may be unverifiable (module flag, etc.)
      assertSame(
        results.every(
          (r) =>
            r.verdict === 'passed' ||
            r.verdict === 'failed' ||
            r.verdict === 'unverifiable',
        ),
        true,
        'every result must have a valid verdict',
      );

      // Every result has a path and category
      assertSame(
        results.every((r) => typeof r.path === 'string' && r.path.length > 0),
        true,
        'every result must have a path',
      );
      assertSame(
        results.every(
          (r) => typeof r.category === 'string' && r.category.length > 0,
        ),
        true,
        'every result must have a category',
      );
    },
  },
];
