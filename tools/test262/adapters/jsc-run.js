/**
 * Entry point for `jsc -m tools/test262/adapters/jsc-run.js`.
 *
 * It exists so `adapters/jsc.js` stays import-safe: the shared test suite
 * imports that module for its host implementation and must not trigger a run.
 * The shell has no argument vector, so configuration comes from globals the
 * launcher can set (`jsjsTest262Root`, `jsjsTest262Features`) and otherwise
 * falls back to the checked-in fixture tree. Selection, execution, and report
 * formatting all come from the shared `runTest262`, so this file only prints
 * and signals.
 *
 * Failure signalling is `tools/jsc/exit.js`'s, shared with `test/jsc-runner.js`
 * rather than reimplemented: `quit(1)` from a promise reaction is inert on the
 * validated shell, so `npm run test262:jsc` would otherwise exit 0 no matter
 * how many tests failed.
 */

import { formatJscError, signalJscFailure } from '../../jsc/exit.js';
import { createJsjsTest262Engine } from '../engine.js';
import { runTest262 } from '../runner.js';
import { createJscTest262Host } from './jsc.js';
import { moduleUrl, resolveRelativePath } from './paths.js';

const DEFAULT_ROOT = resolveRelativePath(
  moduleUrl(import.meta),
  '../../../test/fixtures/test262/',
);
const print = /** @type {(text: string) => void} */ (globalThis.print);

const host = createJscTest262Host({
  root:
    /** @type {string | undefined} */ (globalThis.jsjsTest262Root) ??
    DEFAULT_ROOT,
});

// Promise chaining rather than top level await: the project's host floor is
// ES2020, where top level await does not exist yet.
runTest262({
  engine: createJsjsTest262Engine(),
  host,
  supportedFeatures: /** @type {string[] | undefined} */ (
    globalThis.jsjsTest262Features
  ) ?? ['fixture-subset'],
}).then(
  ({ lines, failed }) => {
    for (const line of lines) {
      print(line);
    }

    if (failed > 0) {
      signalJscFailure(`Test262 run failed: ${String(failed)} failing`);
    }
  },
  (error) => {
    print(formatJscError(error));
    signalJscFailure('Test262 run rejected');
  },
);
