/**
 * Picks the Test262 host implementation for the runtime the shared test suite
 * happens to be running in.
 *
 * The suite itself must stay portable, so it cannot import a Node module
 * directly: `test/test262-runner.test.js` runs in Node, in a browser through
 * `test/run-browser.html`, and in the `jsc` shell. Only the branch that
 * matches the current runtime is ever loaded, which is why the Node adapter is
 * imported dynamically rather than statically.
 */

import { createBrowserTest262Host } from '../../tools/test262/adapters/browser.js';
import { createJscTest262Host } from '../../tools/test262/adapters/jsc.js';
import {
  moduleUrl,
  resolveRelativePath,
} from '../../tools/test262/adapters/paths.js';

const FIXTURE_ROOT = resolveRelativePath(
  moduleUrl(import.meta),
  '../fixtures/test262/',
);

/**
 * @returns {Promise<import('../../tools/test262/runner.js').Test262Host>}
 */
export async function createFixtureTest262Host() {
  if (typeof document !== 'undefined') {
    return createBrowserTest262Host({ root: FIXTURE_ROOT });
  }

  if (
    typeof globalThis.readFile === 'function' ||
    typeof globalThis.read === 'function'
  ) {
    return createJscTest262Host({ root: FIXTURE_ROOT });
  }

  const { createNodeTest262Host } =
    await import('../../tools/test262/adapters/node.js');

  return createNodeTest262Host({ root: FIXTURE_ROOT });
}
