/**
 * Tests for the stale-exclusion check logic.
 *
 * This is a Node-only suite because the exclusion check reads the ES5 selection
 * policy from disk. It exercises the integration path: the real policy file, a
 * real checkout, and the real engine, confirming that the runner correctly
 * identifies passing and failing tests.
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

export default [
  {
    name: 'checkExclusions reports no stale exclusions in the committed policy',
    run: async () => {
      const pin = await readTest262Pin();
      const supportedFeatures = featureNames(
        parseFeatureManifest(await readRepositoryFile(FEATURES_MANIFEST_FILE)),
      );

      const results = await checkExclusions({
        checkoutPath: pin.checkoutPath,
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
        checkoutPath: pin.checkoutPath,
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
