/**
 * The engine's only dependency boundary.
 *
 * Every other file in `src/` imports its parser from here, so exactly one
 * module names the parser build and the rest of the engine is insulated from
 * how that build is resolved. `vendor/acorn/` is a project-owned directory
 * produced by `tools/vendor/sync.js` from the version pinned in
 * `package.json`, which is what keeps a plain relative import working
 * identically in Node, in the browser test page, and in the `jsc` shell: bare
 * specifiers need Node resolution, an import map, or a bundler, and none of
 * those exist in all three hosts.
 *
 * `test/node/repository-invariants.test.js` fails if any other engine file
 * names a vendored path, or if engine source imports through `node_modules`
 * again.
 */

export { parse } from '../vendor/acorn/acorn.mjs';
