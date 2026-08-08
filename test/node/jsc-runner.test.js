/**
 * Node-host integration tests for the two JavaScriptCore entry points.
 *
 * `test/run-jsc.js` (through `test/jsc-runner.js`) and
 * `tools/test262/adapters/jsc-run.js` both run inside the `jsc` shell, where a
 * failing run has no `process.exitCode` to set. Whether they actually signal
 * failure to the shell can therefore only be observed from outside, by
 * spawning the shell on a deliberately failing fixture and reading the exit
 * status — which is exactly what these tests do.
 *
 * The fixtures are isolated: each one runs a single always-failing unit, so a
 * nonzero status here means "the entry point signalled failure", not "some
 * unrelated suite happened to break".
 */

import { spawnSync } from 'node:child_process';
import { assertSame } from '../harness/assert.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);

/** @type {import('../harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'jsc runner exits nonzero when a suite reports failures',
    run() {
      if (!requireJscShell()) {
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
      if (!requireJscShell()) {
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
  {
    // `npm run test262:jsc` is cited as validation, so a Test262 test that
    // fails under the `jsc` shell has to be visible to whoever runs it. The
    // adapter prints the failed record either way; only the exit status
    // decides whether the citation means anything.
    name: 'the Test262 jsc adapter exits nonzero when a test fails',
    run() {
      if (!requireJscShell()) {
        return;
      }

      const result = runJscModule(
        'test/fixtures/test262-jsc-adapter-failure.js',
      );

      assertSame(result.status === null, false, result.stderr);
      assertSame(result.status !== 0, true, result.stdout || result.stderr);
      assertSame(
        result.stdout.includes('"status":"failed"') &&
          result.stdout.includes('"failed":1'),
        true,
        result.stdout,
      );
    },
  },
  {
    name: 'the Test262 jsc adapter exits nonzero and names the error when the run rejects',
    run() {
      if (!requireJscShell()) {
        return;
      }

      const result = runJscModule(
        'test/fixtures/test262-jsc-adapter-rejection.js',
      );
      const output = `${result.stdout}${result.stderr}`;

      assertSame(result.status === null, false, result.stderr);
      assertSame(result.status !== 0, true, output);
      assertSame(
        output.includes(
          'Test262SelectionError: this host could not read manifest.json',
        ),
        true,
        output,
      );
    },
  },
];

export default tests;

/**
 * @param {string} modulePath
 */
function runJscModule(modulePath) {
  return spawnSync(jscCommand(), ['-m', modulePath], {
    cwd: REPOSITORY_ROOT_URL.pathname,
    encoding: 'utf8',
  });
}

/**
 * @returns {string}
 */
function jscCommand() {
  const configured = process.env.JSC;

  return configured === undefined || configured === '' ? 'jsc' : configured;
}

/**
 * Decides whether the `jsc` shell is available, and refuses to paper over a
 * broken one.
 *
 * An explicit `JSC=` is a claim that the shell is there, so a shell that will
 * not start — or will not answer a trivial script — is a failure rather than a
 * skip: skipping silently would let these tests report green on a machine
 * where the runner contract was never checked at all. With no `JSC=` the shell
 * is genuinely optional, so the run continues, but it says so on stderr —
 * `stdout` carries the JSON-lines protocol that `npm run ci:contract` parses
 * line by line, so a diagnostic printed there would break it.
 *
 * @returns {boolean}
 */
function requireJscShell() {
  const configured = process.env.JSC;
  const command = jscCommand();
  const probe = spawnSync(command, ['-e', 'print("ok")'], {
    cwd: REPOSITORY_ROOT_URL.pathname,
    encoding: 'utf8',
  });

  if (probe.error === undefined && probe.status === 0) {
    return true;
  }

  const diagnosis =
    probe.error === undefined
      ? `exited ${String(probe.status)}: ${probe.stderr.trim()}`
      : probe.error.message;

  if (configured !== undefined && configured !== '') {
    throw new Error(
      `JSC=${configured} is configured but unusable, so the jsc entry-point contract cannot be checked: ${diagnosis}`,
    );
  }

  process.stderr.write(
    `# jsc shell unavailable (${diagnosis}); jsc entry-point contract not checked. Set JSC=<path> or put jsc on PATH.\n`,
  );

  return false;
}
