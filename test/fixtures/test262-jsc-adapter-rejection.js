/**
 * Runs the real `tools/test262/adapters/jsc-run.js` against a root that does
 * not exist, so `runTest262` rejects before it can report any record.
 *
 * See `test262-jsc-adapter-failure.js` for why the adapter is loaded through a
 * dynamic `import()` rather than a static one.
 */

import { moduleUrl, resolveRelativePath } from '../../tools/test262/adapters/paths.js';

globalThis.jsjsTest262Root = resolveRelativePath(
  moduleUrl(import.meta),
  './test262-adapter-missing/',
);
globalThis.jsjsTest262Features = ['fixture-subset'];

import('../../tools/test262/adapters/jsc-run.js');
