import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));

/**
 * @param {{
 *   runCommand?: (args: readonly string[]) => string,
 * }} [options]
 * @returns {Readonly<{ gitCommit: string, gitDirty: false }>}
 */
export function readCleanSourceState(options = {}) {
  const runCommand =
    options.runCommand ??
    ((args) =>
      execFileSync('git', [...args], {
        cwd: REPOSITORY_ROOT,
        encoding: 'utf8',
      }));
  const gitCommit = runCommand(['rev-parse', 'HEAD']).trim();
  const status = runCommand([
    'status',
    '--porcelain',
    '--untracked-files=normal',
  ]);

  if (gitCommit.length === 0) {
    throw new Error('Unable to read git revision');
  }

  if (status.length > 0) {
    throw new Error('Refusing to run against a dirty working tree');
  }

  return Object.freeze({
    gitCommit,
    gitDirty: false,
  });
}

/**
 * @param {unknown} source
 * @returns {Readonly<{ gitCommit: string, gitDirty: false }>}
 */
export function assertCleanSourceState(source) {
  const candidate = /** @type {{ gitCommit?: unknown, gitDirty?: unknown }} */ (
    source
  );

  if (
    typeof source !== 'object' ||
    source === null ||
    Array.isArray(source) ||
    typeof candidate.gitCommit !== 'string' ||
    candidate.gitCommit.length === 0 ||
    candidate.gitDirty !== false
  ) {
    throw new TypeError(
      'Expected source metadata from a clean git working tree',
    );
  }

  return /** @type {Readonly<{ gitCommit: string, gitDirty: false }>} */ (
    source
  );
}
