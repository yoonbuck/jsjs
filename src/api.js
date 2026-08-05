import { parseScript } from './parser.js';
import { createRealm, Realm } from './runtime/realm.js';
import { EMPTY, ThrowSignal, GuestErrorSignal } from './runtime/completion.js';
import { globalDeclarationInstantiation } from './evaluator/declarations.js';
import { evaluateStatementList } from './evaluator/statements.js';
import { createGuestError } from './builtins/errors.js';
import { hasUseStrictDirective } from './evaluator/directive.js';

export { parseScript, createRealm, Realm };

/**
 * Parses `source` as a script and evaluates it against `realm`.
 *
 * Global declaration instantiation runs first (hoisting every reachable
 * function and `var` name onto the realm's global object), then the
 * program's statement list is evaluated left to right with explicit
 * completion propagation. Only the statement and expression forms the
 * evaluator supports are accepted; every other AST node throws an explicit
 * `UnsupportedNodeError`/`UnsupportedOperatorError`/
 * `UnsupportedOperationError` naming what is missing. An empty script
 * parses and evaluates to a normal completion with value `undefined`.
 * Genuine parse failures still surface as `SyntaxError`.
 *
 * A well-formed script produces either a `'normal'` completion or a
 * `'throw'` completion carrying the thrown guest value: the parser rejects
 * `break`/`continue` outside a loop and top-level `return`, and a `throw`
 * that escapes a called function travels back to this boundary as a
 * `ThrowSignal` because expression evaluation has no completion record to
 * carry it. Guest throws are values, not host exceptions — engine defects
 * and unimplemented operations remain host errors.
 *
 * Evaluation strictness is determined by a `"use strict"` directive prologue
 * (ES5 §14.1). In non-strict scripts, an assignment to an identifier no
 * environment in scope binds creates that property on `realm.globalObject`
 * (ECMA-262 8.7.2) rather than throwing; reading such an identifier still
 * throws a `ReferenceError`. In strict scripts (those beginning with a
 * `"use strict"` directive), the same assignment instead throws a
 * `ReferenceError` rather than creating an implicit global.
 *
 * @param {import('./runtime/realm.js').Realm} realm
 * @param {string} source
 * @param {Record<string, unknown>} [parserOptions]
 * @returns {{ type: 'normal' | 'throw', value: unknown }}
 */
export function evaluateScript(realm, source, parserOptions = {}) {
  const program = parseScript(source, parserOptions);
  const context = {
    realm,
    env: realm.globalEnvironment,
    strict: hasUseStrictDirective(program.body),
    thisValue: realm.globalEnvironment.getThisBinding(),
  };
  globalDeclarationInstantiation(program, context);

  /** @type {{ type: string, value: unknown }} */
  let completion;

  try {
    completion = evaluateStatementList(program.body, context);
  } catch (error) {
    if (error instanceof ThrowSignal) {
      return { type: 'throw', value: error.value };
    }

    if (error instanceof GuestErrorSignal) {
      // A guest-visible error was thrown at the top level of the script
      // (not inside a called function — those are caught by callFunction).
      // Convert the signal into a proper guest error object now that the
      // realm is in scope.
      return {
        type: 'throw',
        value: createGuestError(realm, error.typeName, error.guestMessage),
      };
    }

    throw error;
  }

  return {
    type: /** @type {'normal' | 'throw'} */ (completion.type),
    value: completion.value === EMPTY ? undefined : completion.value,
  };
}
