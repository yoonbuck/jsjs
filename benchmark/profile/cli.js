import { pathToFileURL } from 'node:url';
import { readCleanSourceState } from '../source-state.js';
import { parseProfileArguments } from './target.js';
import { runChromiumProfile } from './run-browser.js';
import { runNodeProfile } from './run-node.js';

const DEFAULT_RUNNERS = Object.freeze({
  node: runNodeProfile,
  chromium: runChromiumProfile,
});

if (isMain(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => {
    process.exitCode = 1;
    process.stderr.write(`${formatError(error)}\n`);
  });
}

/**
 * @typedef {{
 *   node: (options: Parameters<typeof runNodeProfile>[0]) => Promise<unknown>,
 *   chromium: (options: Parameters<typeof runChromiumProfile>[0]) => Promise<unknown>,
 * }} ProfileRunners
 */

/**
 * @param {readonly string[]} argv
 * @param {{
 *   runners?: Readonly<ProfileRunners>,
 *   readSourceState?: typeof readCleanSourceState,
 * }} [options]
 * @returns {Promise<unknown>}
 */
export async function main(argv, options = {}) {
  const profileOptions = parseProfileArguments(argv);
  const runners = options.runners ?? DEFAULT_RUNNERS;
  const source = (options.readSourceState ?? readCleanSourceState)();

  if (profileOptions.host === 'node') {
    return runners.node({
      ...profileOptions,
      host: 'node',
      source,
    });
  }

  if (profileOptions.host === 'chromium') {
    return runners.chromium({
      ...profileOptions,
      host: 'chromium',
      source,
    });
  }

  throw new Error(`Unsupported profile host: ${profileOptions.host}`);
}

/**
 * @param {string | undefined} entry
 * @returns {boolean}
 */
function isMain(entry) {
  return entry !== undefined && pathToFileURL(entry).href === import.meta.url;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function formatError(error) {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}
