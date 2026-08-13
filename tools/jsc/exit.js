/**
 * Failure signalling for the JavaScriptCore (`jsc`) shell.
 *
 * Both `jsc` entry points in this repository — `test/run-jsc.js` (through
 * `test/jsc-runner.js`) and `tools/test262/adapters/jsc-run.js` — finish their
 * work inside a promise reaction, where the shell offers no `process.exitCode`
 * to set and no exception to propagate: a `throw` from a reaction is reported
 * and then swallowed, and `quit(1)` is *inert* on the shell this project
 * validates against (macOS
 * `JavaScriptCore.framework/Versions/A/Helpers/jsc`, where it still exits 0).
 *
 * The one mechanism that is authoritative there is an uncaught exception
 * thrown from a timer callback: the shell drains its timer queue after the
 * module body, so the throw escapes to the top level and the process exits
 * nonzero. `signalJscFailure` therefore prefers it, and only falls back to
 * `quit(1)` on a hypothetical timer-less shell — announcing loudly that the
 * exit status can no longer be trusted when it does.
 *
 * `test/node/jsc-runner.test.js` is what keeps this honest: it spawns the real
 * shell on deliberately failing fixtures for both entry points and asserts a
 * nonzero status.
 */

/**
 * Printed when the authoritative mechanism is unavailable, so a zero exit
 * status from the fallback is never mistaken for a passing run.
 */
export const JSC_DEGRADED_SIGNAL_MARKER =
  '!!! JSC FAILURE SIGNAL DEGRADED: this shell has no setTimeout, so the failure above can only be reported through quit(1), which the validated jsc build ignores. A zero exit status from this run means nothing.';

/**
 * Makes the `jsc` shell exit nonzero because the run failed.
 *
 * @param {string} message
 * @returns {void}
 */
export function signalJscFailure(message) {
  if (typeof globalThis.setTimeout === 'function') {
    globalThis.setTimeout(() => {
      throw new Error(message);
    }, 0);
    return;
  }

  printJscLine(JSC_DEGRADED_SIGNAL_MARKER);

  if (typeof globalThis.quit === 'function') {
    globalThis.quit(1);
    return;
  }

  throw new Error(message);
}

/**
 * Renders an error the way a host with a real uncaught-exception handler
 * would: `Name: message` first, then the stack. The `jsc` shell's
 * `error.stack` holds only frames, so printing it alone loses the one line
 * that says what went wrong.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function formatJscError(error) {
  if (error instanceof Error) {
    const header = `${error.name}: ${error.message}`;

    if (typeof error.stack === 'string' && error.stack.length > 0) {
      return error.stack.includes(header)
        ? error.stack
        : `${header}\n${error.stack}`;
    }

    return header;
  }

  return String(error);
}

/**
 * @param {string} text
 * @returns {void}
 */
function printJscLine(text) {
  // The cast is the same one every `jsc` entry point makes: the DOM lib
  // declares `print()` with no arguments, while the shell's takes the line.
  const write = /** @type {((text: string) => void) | undefined} */ (
    /** @type {unknown} */ (globalThis.print)
  );

  if (typeof write === 'function') {
    write(text);
  }
}
