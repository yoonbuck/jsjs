import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { formatTest262UpstreamCommand } from '../ci/pipeline.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);

/**
 * @param {string} path Repository-relative.
 * @param {URL} [repositoryRootUrl]
 * @returns {Promise<string>}
 */
function readRepositoryFile(path, repositoryRootUrl = REPOSITORY_ROOT_URL) {
  return readFile(new URL(path, repositoryRootUrl), 'utf8');
}

/**
 * @param {URL} [repositoryRootUrl]
 * @returns {Promise<{ repository: string, revision: string, checkoutPath: string }>}
 */
export async function readTest262Pin(repositoryRootUrl = REPOSITORY_ROOT_URL) {
  const manifest = JSON.parse(
    await readRepositoryFile('package.json', repositoryRootUrl),
  );
  const pin = manifest.test262;

  if (
    pin === undefined ||
    typeof pin.repository !== 'string' ||
    typeof pin.revision !== 'string' ||
    typeof pin.checkoutPath !== 'string'
  ) {
    throw new Error('package.json must pin the upstream Test262 tree');
  }

  return pin;
}

/**
 * @param {{ repository: string, revision: string, checkoutPath: string }} pin
 * @returns {string}
 */
function checkoutHint(pin) {
  return [
    'Check the pinned upstream tree out first:',
    `  git clone --filter=blob:none ${pin.repository} ${pin.checkoutPath}`,
    `  git -C ${pin.checkoutPath} checkout ${pin.revision}`,
    'Then run:',
    `  ${formatTest262UpstreamCommand()}`,
  ].join('\n');
}

/**
 * Confirms the checkout is the exact clean pinned revision.
 *
 * @param {{ repository: string, revision: string, checkoutPath: string }} pin
 * @param {URL} [repositoryRootUrl]
 * @returns {Promise<void>}
 */
export async function assertPinnedCheckout(
  pin,
  repositoryRootUrl = REPOSITORY_ROOT_URL,
) {
  /** @type {string} */
  let head;

  try {
    head = (
      await readRepositoryFile(
        `${pin.checkoutPath}/.git/HEAD`,
        repositoryRootUrl,
      )
    ).trim();
  } catch {
    throw new Error(
      `${pin.checkoutPath} is not a git checkout.\n${checkoutHint(pin)}`,
    );
  }

  if (head !== pin.revision) {
    throw new Error(
      `${pin.checkoutPath} is at ${head}, but package.json pins ${pin.revision}.\n${checkoutHint(
        pin,
      )}`,
    );
  }

  let status;

  try {
    status = execFileSync(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=all'],
      {
        cwd: fileURLToPath(
          new URL(
            `${pin.checkoutPath.replace(/\/$/u, '')}/`,
            repositoryRootUrl,
          ),
        ),
        encoding: 'utf8',
      },
    ).trim();
  } catch {
    throw new Error(
      `${pin.checkoutPath} Git status could not be read.\n${checkoutHint(pin)}`,
    );
  }

  if (status !== '') {
    throw new Error(
      `${pin.checkoutPath} has uncommitted changes:\n${status}\n${checkoutHint(
        pin,
      )}`,
    );
  }
}
