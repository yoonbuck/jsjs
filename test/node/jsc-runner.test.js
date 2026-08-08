import { spawnSync } from 'node:child_process';
import { assertSame } from '../harness/assert.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);

/** @type {import('../harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'jsc runner exits nonzero when a suite reports failures',
    run() {
      if (!hasConfiguredJsc()) {
        return;
      }

      const result = runJscModule('test/fixtures/jsc-runner-failure.js');

      assertSame(result.status === null, false, result.stderr);
      assertSame(result.status !== 0, true, result.stdout || result.stderr);
      assertSame(
        result.stdout.includes(
          '"name":"deliberate JSC failure reports a failed record","status":"failed"',
        ),
        true,
      );
    },
  },
  {
    name: 'jsc runner exits nonzero when startup rejects',
    run() {
      if (!hasConfiguredJsc()) {
        return;
      }

      const result = runJscModule('test/fixtures/jsc-runner-rejection.js');

      assertSame(result.status === null, false, result.stderr);
      assertSame(result.status !== 0, true, result.stdout || result.stderr);
      assertSame(
        `${result.stdout}${result.stderr}`.includes(
          'Error: deliberate JSC runner rejection',
        ),
        true,
      );
    },
  },
];

export default tests;

/**
 * @param {string} modulePath
 */
function runJscModule(modulePath) {
  return spawnSync(process.env.JSC ?? 'jsc', ['-m', modulePath], {
    cwd: REPOSITORY_ROOT_URL.pathname,
    encoding: 'utf8',
  });
}

/**
 * @returns {boolean}
 */
function hasConfiguredJsc() {
  const result = spawnSync(process.env.JSC ?? 'jsc', ['-e', 'print("ok")'], {
    cwd: REPOSITORY_ROOT_URL.pathname,
    encoding: 'utf8',
  });

  return result.error === undefined;
}
