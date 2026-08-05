import { parseScript } from './parser.js';
import { createRealm, Realm } from './runtime/realm.js';
import { EMPTY } from './runtime/completion.js';
import { globalDeclarationInstantiation } from './evaluator/declarations.js';
import { evaluateStatementList } from './evaluator/statements.js';

export { parseScript, createRealm, Realm };

/**
 * Parses `source` as a script and evaluates it against `realm`.
 *
 * Global declaration instantiation runs first (hoisting every reachable
 * `var` name onto the realm's global object), then the program's statement
 * list is evaluated left to right with explicit completion propagation.
 * Only the statement and expression forms the evaluator (Task 5) supports
 * are accepted; every other AST node — including the function, member
 * access, call, and object/array literal forms Task 6 will add — throws an
 * explicit `UnsupportedNodeError`/`UnsupportedOperatorError` naming the
 * unsupported node or operator. An empty script parses and evaluates to a
 * normal completion with value `undefined`. Genuine parse failures still
 * surface as `SyntaxError`.
 *
 * A well-formed script can only produce a `'normal'` completion here: the
 * parser rejects `break`/`continue` outside a loop and top-level `return`,
 * and `throw`/try-catch are not supported yet.
 *
 * @param {import('./runtime/realm.js').Realm} realm
 * @param {string} source
 * @param {Record<string, unknown>} [parserOptions]
 * @returns {{ type: 'normal', value: unknown }}
 */
export function evaluateScript(realm, source, parserOptions = {}) {
  const program = parseScript(source, parserOptions);
  globalDeclarationInstantiation(program, realm);

  const context = { realm, env: realm.globalEnvironment, strict: false };
  const completion = evaluateStatementList(program.body, context);

  return {
    type: /** @type {'normal'} */ (completion.type),
    value: completion.value === EMPTY ? undefined : completion.value,
  };
}
