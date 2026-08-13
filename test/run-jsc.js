/**
 * Runs the portable suites in the JavaScriptCore (`jsc`) shell.
 *
 * `jsc -m test/run-jsc.js` is the third runtime the same suites run in, next to
 * `run-node.js` and `run-browser.js`, and it emits the same JSON-lines result
 * protocol so the three runs can be compared line for line. The shell has no
 * argument vector, so there is nothing to select: it always runs the whole
 * registry from `test/suites.js`.
 */

import { runJscSuites, startJscRun } from './jsc-runner.js';
import { PORTABLE_SUITES } from './suites.js';

// Promise chaining rather than top level await: the project's host floor is
// ES2020, where top level await does not exist yet.
startJscRun(() => runJscSuites(PORTABLE_SUITES));
