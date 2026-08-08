/**
 * Runs the real `tools/test262/adapters/jsc-run.js` against a Test262 tree
 * whose single test always fails.
 *
 * The adapter takes its configuration from globals rather than an argument
 * vector (the `jsc` shell has none), so those globals have to exist before the
 * adapter's module body runs. Static `import` is hoisted above every
 * assignment in this file, hence the dynamic `import()`: it is the only way to
 * parameterize the adapter's root without editing the adapter itself.
 */

import { moduleUrl, resolveRelativePath } from '../../tools/test262/adapters/paths.js';

globalThis.jsjsTest262Root = resolveRelativePath(
  moduleUrl(import.meta),
  './test262-adapter-failure/',
);
globalThis.jsjsTest262Features = ['fixture-subset'];

import('../../tools/test262/adapters/jsc-run.js');
