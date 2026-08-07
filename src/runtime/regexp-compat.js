import { validatePattern } from './regexp-syntax.js';
import { createUnsupportedOperationError } from './errors.js';

/**
 * The host regular-expression compatibility layer.
 *
 * This is the **only** file anywhere in `src/` allowed to name the host
 * `RegExp` constructor (`test/node/repository-invariants.test.js` enforces
 * that boundary). Every other engine file that needs regular-expression
 * behaviour goes through `compilePattern` below.
 *
 * `validatePattern` (`regexp-syntax.js`) runs first and rejects anything
 * outside ES5.1 15.10.1's grammar, so unsupported modern syntax never
 * reaches the host. Once a pattern is known to be ES5-shaped, this layer
 * builds a **sticky** (`y`) host regex — never `g` — because ES5.1
 * 15.10.2.1 `[[Match]](S, index)` attempts a match starting *exactly* at
 * `index` and fails otherwise; it never scans forward the way a
 * non-sticky/global host search does. ES5 `global` is a guest-observable
 * `lastIndex`-bookkeeping concern of `exec` (Task 2), not a matching
 * concern, so it is deliberately never passed to the host.
 *
 * Every host result is normalised and verified before it is handed back:
 * `matchAt` recomputes `endIndex` from `index + result[0].length` rather than
 * trusting `hostRegExp.lastIndex`, and it throws
 * `createUnsupportedOperationError` (an engine-limitation error, not a guest
 * completion) if the host ever disagrees with what a validated ES5 pattern
 * promises — a real divergence between the host's regex dialect and ES5,
 * not something a guest `try`/`catch` should be able to observe or recover
 * from.
 */

/**
 * @typedef {import('./regexp-syntax.js').FlagSet} FlagSet
 *
 * @typedef {{
 *   endIndex: number,
 *   captures: readonly (string | undefined)[],
 *   matched: string,
 * }} MatchResult
 *
 * @typedef {{
 *   capturingGroups: number,
 *   matchAt: (input: string, index: number) => MatchResult | null,
 * }} CompiledPattern
 */

/**
 * @param {string} source The original pattern text P.
 * @param {FlagSet} flags
 * @param {new (pattern: string, flags: string) => {
 *   lastIndex: number,
 *   exec: (input: string) => (RegExpExecArrayLike | null),
 * }} [hostRegExpConstructor] Injected so the divergence guard in `matchAt` is
 *   directly testable with a fake host compiler, without needing a real gap
 *   between the host's regex dialect and ES5 to exist. Omit it to compile
 *   against the real host `RegExp`.
 * @param {import('./regexp-syntax.js').StackGuardLike} [stackGuard] The
 *   realm's stack budget, charged for the pattern's nesting while it is
 *   validated. See `validatePattern`.
 * @returns {CompiledPattern}
 */
export function compilePattern(
  source,
  flags,
  hostRegExpConstructor,
  stackGuard,
) {
  const { capturingGroups } = validatePattern(source, stackGuard);
  const hostFlags =
    'y' + (flags.ignoreCase ? 'i' : '') + (flags.multiline ? 'm' : '');

  /** @type {{ lastIndex: number, exec: (input: string) => RegExpExecArrayLike | null }} */
  let hostRegExp;

  try {
    // The only two call sites of the host `RegExp` constructor anywhere in
    // `src/` live in this one branch: the real host `RegExp` when no
    // override is supplied, or the injected fake compiler otherwise.
    // `test/node/repository-invariants.test.js` enforces that isolation.
    hostRegExp =
      hostRegExpConstructor === undefined
        ? new RegExp(source, hostFlags)
        : new hostRegExpConstructor(source, hostFlags);
  } catch {
    throw createUnsupportedOperationError(
      `compiling a validated ES5 pattern the host rejected: ${source}`,
    );
  }

  return {
    capturingGroups,
    matchAt(input, index) {
      hostRegExp.lastIndex = index;
      const result = hostRegExp.exec(input);

      if (result === null) {
        return null;
      }

      if (result.index !== index || result.length !== capturingGroups + 1) {
        throw createUnsupportedOperationError(
          `host RegExp match diverged from the validated ES5 pattern: ${source}`,
        );
      }

      /** @type {(string | undefined)[]} */
      const captures = [];

      for (let group = 1; group < result.length; group += 1) {
        captures.push(result[group]);
      }

      // Element 0 is always the whole match — a real string whenever
      // `result` is non-null — unlike the numbered capture group elements,
      // which the shared index signature must allow to be `undefined`.
      const matched = /** @type {string} */ (result[0]);

      return {
        endIndex: index + matched.length,
        captures,
        matched,
      };
    },
  };
}

/**
 * The subset of a host `RegExp.prototype.exec` match array this layer reads:
 * `index`, `length`, and numeric group elements (element 0 is the whole
 * match). Kept narrow and local rather than importing a `lib.dom`/`lib.es*`
 * type so this module's only dependency on host regex shape is exactly the
 * fields `compilePattern` touches.
 *
 * @typedef {{
 *   readonly [index: number]: string | undefined,
 *   readonly index: number,
 *   readonly length: number,
 * }} RegExpExecArrayLike
 */
