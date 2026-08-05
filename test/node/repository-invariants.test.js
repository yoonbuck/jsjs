/**
 * Node-only repository invariants.
 *
 * These are architecture checks rather than behaviour tests: they read the
 * project's own source text, so they need a filesystem and cannot run in the
 * browser or the `jsc` shell like the portable suites in `test/`. They exist to
 * fail loudly when a boundary that reviews have already established starts to
 * erode — an engine file reaching into `node_modules`, an adapter re-inventing
 * test selection, a vendored dependency drifting from its pin, or a test suite
 * that no runner registers.
 */

import { readFile, readdir } from 'node:fs/promises';
import { assertSame } from '../harness/assert.js';
import { checkVendoredDependencies } from '../../tools/vendor/sync.js';

const REPOSITORY_ROOT = new URL('../../', import.meta.url);

/** Matches `from '…'`, `import '…'`, and `import('…')` specifiers. */
const SPECIFIER_PATTERN = /\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

/**
 * @param {string} directory Repository-relative, with a trailing slash.
 * @param {(name: string) => boolean} predicate
 * @returns {Promise<string[]>}
 */
async function listFiles(directory, predicate) {
  const entries = await readdir(new URL(directory, REPOSITORY_ROOT), {
    withFileTypes: true,
  });
  /** @type {string[]} */
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...(await listFiles(`${directory}${entry.name}/`, predicate)));
    } else if (predicate(entry.name)) {
      files.push(`${directory}${entry.name}`);
    }
  }

  return files.sort();
}

/**
 * @param {string} file Repository-relative path.
 * @returns {Promise<string>}
 */
function readSource(file) {
  return readFile(new URL(file, REPOSITORY_ROOT), 'utf8');
}

/**
 * @param {string} source
 * @returns {string[]}
 */
function importSpecifiers(source) {
  return [...source.matchAll(SPECIFIER_PATTERN)].map((match) => match[1]);
}

/**
 * @param {string} directory
 * @returns {Promise<Map<string, string>>}
 */
async function readJavaScript(directory) {
  const files = await listFiles(directory, (name) => name.endsWith('.js'));
  /** @type {Map<string, string>} */
  const sources = new Map();

  for (const file of files) {
    sources.set(file, await readSource(file));
  }

  return sources;
}

export default [
  {
    name: 'engine source never imports through node_modules',
    run: async () => {
      const sources = await readJavaScript('src/');
      /** @type {string[]} */
      const offenders = [];

      for (const [file, source] of sources) {
        for (const specifier of importSpecifiers(source)) {
          if (specifier.includes('node_modules')) {
            offenders.push(`${file} -> ${specifier}`);
          }
        }
      }

      assertSame(
        offenders.join('\n'),
        '',
        'src/ must not depend on an npm install layout; import the project-owned vendored build instead',
      );
      assertSame(sources.size > 0, true, 'src/ sources were found');
    },
  },
  {
    name: 'the parser dependency is named in exactly one engine file',
    run: async () => {
      const sources = await readJavaScript('src/');
      /** @type {string[]} */
      const namingFiles = [];

      for (const [file, source] of sources) {
        const namesVendor = importSpecifiers(source).some((specifier) =>
          specifier.includes('vendor/'),
        );

        if (namesVendor) {
          namingFiles.push(file);
        }
      }

      assertSame(namingFiles.join(','), 'src/parser-dependency.js');
    },
  },
  {
    name: 'test262 adapters contribute no selection policy',
    run: async () => {
      const sources = await readJavaScript('tools/test262/adapters/');
      /** @type {string[]} */
      const offenders = [];

      for (const [file, source] of sources) {
        for (const forbidden of [
          'JSON.parse',
          'manifest.json',
          'runTest262Suite',
          '.malformed',
          "'harness'",
        ]) {
          if (source.includes(forbidden)) {
            offenders.push(`${file} contains ${forbidden}`);
          }
        }
      }

      assertSame(
        offenders.join('\n'),
        '',
        'manifest parsing, selection, and defaults belong to tools/test262/selection.js',
      );
      assertSame(sources.size >= 4, true, 'adapter sources were found');
    },
  },
  {
    name: 'every test262 adapter that reads a manifest imports the shared selection module',
    run: async () => {
      const sources = await readJavaScript('tools/test262/adapters/');
      /** @type {string[]} */
      const offenders = [];

      for (const [file, source] of sources) {
        if (!source.includes('readManifest')) {
          continue;
        }

        if (!importSpecifiers(source).includes('../selection.js')) {
          offenders.push(file);
        }
      }

      assertSame(offenders.join(','), '');
    },
  },
  {
    name: 'the vendored parser build matches the pinned dependency',
    run: async () => {
      const { problems } = await checkVendoredDependencies();

      assertSame(problems.join('\n'), '');
    },
  },
  {
    name: 'every portable suite is registered with the shared runners',
    run: async () => {
      const suites = await readSource('test/suites.js');
      const files = await listFiles('test/', (name) =>
        name.endsWith('.test.js'),
      );
      const portable = files.filter((file) => !file.startsWith('test/node/'));
      /** @type {string[]} */
      const unregistered = [];

      for (const file of portable) {
        if (!suites.includes(`'./${file.slice('test/'.length)}'`)) {
          unregistered.push(file);
        }
      }

      assertSame(unregistered.join(','), '');
      assertSame(portable.length > 0, true, 'portable suites were found');
    },
  },
  {
    name: 'every node-only suite is registered with the node runner',
    run: async () => {
      const runner = await readSource('test/run-node.js');
      const files = await listFiles('test/node/', (name) =>
        name.endsWith('.test.js'),
      );
      /** @type {string[]} */
      const unregistered = [];

      for (const file of files) {
        if (!runner.includes(`'./${file.slice('test/'.length)}'`)) {
          unregistered.push(file);
        }
      }

      assertSame(unregistered.join(','), '');
      assertSame(files.length > 0, true, 'node-only suites were found');
    },
  },
];
