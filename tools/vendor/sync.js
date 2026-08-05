/**
 * Vendors the engine's runtime dependencies into a project-owned directory.
 *
 * The engine has to load the same source in Node, in a browser, and in the
 * `jsc` shell. Bare specifiers are a Node resolution feature, browsers need an
 * import map that the shell cannot provide, and reaching into `node_modules`
 * from engine source would couple `src/` to whatever layout npm happens to
 * hoist. So the dependency boundary is resolved once, here, at install time:
 * each pinned package's ES module build is copied to `vendor/<name>/`, a path
 * the project owns and every host resolves the same way with a plain relative
 * import.
 *
 * `vendor/` is generated, not committed. `npm install` runs this through
 * `prepare`, `npm run vendor:sync` refreshes it by hand, and
 * `npm run vendor:check` (also asserted by `test/node/repository-invariants.test.js`)
 * fails when the copy drifts from the pinned dependency.
 *
 * Usage: `node tools/vendor/sync.js [--check]`
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const REPOSITORY_ROOT = new URL('../../', import.meta.url);

/** The record written next to each vendored copy. */
const RECEIPT_FILE = 'vendored.json';

/**
 * @typedef {{
 *   package: string,
 *   directory: string,
 *   files: readonly { from: string, to: string }[],
 * }} VendoredDependency
 */

/**
 * Every dependency the engine loads at runtime. `LICENSE` travels with the
 * copy because the copy is a redistribution of the package.
 *
 * @type {readonly VendoredDependency[]}
 */
export const VENDORED_DEPENDENCIES = Object.freeze([
  Object.freeze({
    package: 'acorn',
    directory: 'vendor/acorn',
    files: Object.freeze([
      // The ES module build, plus the declarations that keep `tsc` from
      // type-checking a third party bundle in `checkJs` mode.
      Object.freeze({ from: 'dist/acorn.mjs', to: 'acorn.mjs' }),
      Object.freeze({ from: 'dist/acorn.d.mts', to: 'acorn.d.mts' }),
      Object.freeze({ from: 'LICENSE', to: 'LICENSE' }),
    ]),
  }),
]);

/**
 * Copies every vendored file whose contents differ from the installed package.
 *
 * @returns {Promise<string[]>} The repository-relative paths that were written.
 */
export async function syncVendoredDependencies() {
  /** @type {string[]} */
  const written = [];

  for (const dependency of VENDORED_DEPENDENCIES) {
    const version = await requirePinnedVersion(dependency);

    await mkdir(new URL(`${dependency.directory}/`, REPOSITORY_ROOT), {
      recursive: true,
    });

    for (const file of dependency.files) {
      const source = await readInstalledFile(dependency, file.from);
      const target = `${dependency.directory}/${file.to}`;

      if ((await readVendoredFile(target)) !== source) {
        await writeFile(new URL(target, REPOSITORY_ROOT), source);
        written.push(target);
      }
    }

    const receiptPath = `${dependency.directory}/${RECEIPT_FILE}`;
    const receipt = formatReceipt(dependency, version);

    if ((await readVendoredFile(receiptPath)) !== receipt) {
      await writeFile(new URL(receiptPath, REPOSITORY_ROOT), receipt);
      written.push(receiptPath);
    }
  }

  return written;
}

/**
 * Reports whether the vendored copies still match the pinned dependencies,
 * without writing anything.
 *
 * @returns {Promise<{ ok: boolean, problems: string[] }>}
 */
export async function checkVendoredDependencies() {
  /** @type {string[]} */
  const problems = [];

  for (const dependency of VENDORED_DEPENDENCIES) {
    /** @type {string} */
    let version;

    try {
      version = await requirePinnedVersion(dependency);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
      continue;
    }

    const receiptPath = `${dependency.directory}/${RECEIPT_FILE}`;
    const receipt = await readVendoredFile(receiptPath);

    if (receipt !== formatReceipt(dependency, version)) {
      problems.push(
        `${receiptPath} does not record ${dependency.package}@${version}; run npm run vendor:sync`,
      );
    }

    for (const file of dependency.files) {
      const target = `${dependency.directory}/${file.to}`;
      /** @type {string} */
      let source;

      try {
        source = await readInstalledFile(dependency, file.from);
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
        continue;
      }

      if ((await readVendoredFile(target)) !== source) {
        problems.push(`${target} is missing or stale; run npm run vendor:sync`);
      }
    }
  }

  return { ok: problems.length === 0, problems };
}

/**
 * @param {VendoredDependency} dependency
 * @param {string} version
 * @returns {string}
 */
function formatReceipt(dependency, version) {
  return `${JSON.stringify(
    {
      package: dependency.package,
      version,
      source: `node_modules/${dependency.package}`,
      files: dependency.files.map((file) => file.to),
    },
    null,
    2,
  )}\n`;
}

/**
 * Reads the exact pinned version from `package.json` and confirms the
 * installed package matches it, so a vendored copy can never be newer or older
 * than the dependency the project claims to use.
 *
 * @param {VendoredDependency} dependency
 * @returns {Promise<string>}
 */
async function requirePinnedVersion(dependency) {
  const manifest = JSON.parse(await readRepositoryFile('package.json'));
  const pin = manifest.dependencies?.[dependency.package];

  if (typeof pin !== 'string') {
    throw new Error(`package.json does not depend on ${dependency.package}`);
  }

  if (!/^\d+\.\d+\.\d+$/.test(pin)) {
    throw new Error(
      `${dependency.package} must be pinned to an exact version, found ${pin}`,
    );
  }

  /** @type {string} */
  let installed;

  try {
    installed = JSON.parse(
      await readRepositoryFile(
        `node_modules/${dependency.package}/package.json`,
      ),
    ).version;
  } catch {
    throw new Error(
      `${dependency.package} is not installed; run npm install before vendoring`,
    );
  }

  if (installed !== pin) {
    throw new Error(
      `${dependency.package}@${installed} is installed but package.json pins ${pin}`,
    );
  }

  return pin;
}

/**
 * @param {VendoredDependency} dependency
 * @param {string} file
 * @returns {Promise<string>}
 */
async function readInstalledFile(dependency, file) {
  const path = `node_modules/${dependency.package}/${file}`;

  try {
    return await readRepositoryFile(path);
  } catch {
    throw new Error(`${path} is missing; run npm install before vendoring`);
  }
}

/**
 * @param {string} path Repository-relative.
 * @returns {Promise<string>}
 */
function readRepositoryFile(path) {
  return readFile(new URL(path, REPOSITORY_ROOT), 'utf8');
}

/**
 * @param {string} path Repository-relative.
 * @returns {Promise<string | null>} `null` when the file does not exist yet.
 */
async function readVendoredFile(path) {
  try {
    return await readRepositoryFile(path);
  } catch {
    return null;
  }
}

if (isDirectInvocation()) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.exitCode = 1;
      process.stdout.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
    },
  );
}

/**
 * @param {readonly string[]} argv
 * @returns {Promise<number>}
 */
async function main(argv) {
  for (const argument of argv) {
    if (argument !== '--check') {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (argv.includes('--check')) {
    const { ok, problems } = await checkVendoredDependencies();

    for (const problem of problems) {
      process.stdout.write(`${problem}\n`);
    }

    return ok ? 0 : 1;
  }

  for (const path of await syncVendoredDependencies()) {
    process.stdout.write(`vendored ${path}\n`);
  }

  return 0;
}

/**
 * @returns {boolean}
 */
function isDirectInvocation() {
  const entry = process.argv[1];

  return (
    typeof entry === 'string' && pathToFileURL(entry).href === import.meta.url
  );
}
