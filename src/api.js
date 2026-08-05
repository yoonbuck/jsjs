import { parseScript } from './parser.js';
import { createRealm, Realm } from './runtime/realm.js';
import { createNormalCompletion } from './runtime/completion.js';
import { createUnsupportedNodeError } from './runtime/errors.js';

export { parseScript, createRealm, Realm };

/**
 * Parses `source` as a script and evaluates it against `realm`.
 *
 * Statement and expression evaluation is not implemented yet (Task 5 adds
 * it); every non-empty script therefore throws an explicit
 * `UnsupportedNodeError` naming the first AST node it cannot evaluate. An
 * empty script parses and evaluates to a normal completion with value
 * `undefined`, so the API shell is fully exercisable before the evaluator
 * exists. Genuine parse failures still surface as `SyntaxError`.
 *
 * @param {import('./runtime/realm.js').Realm} realm
 * @param {string} source
 * @param {Record<string, unknown>} [parserOptions]
 * @returns {{ type: 'normal', value: unknown }}
 */
export function evaluateScript(realm, source, parserOptions = {}) {
  const program = parseScript(source, parserOptions);
  return evaluateStatementList(realm, program.body);
}

/**
 * @param {import('./runtime/realm.js').Realm} realm
 * @param {any[]} statements
 * @returns {{ type: 'normal', value: unknown }}
 */
function evaluateStatementList(realm, statements) {
  let completion = createNormalCompletion(undefined);

  for (const statement of statements) {
    completion = evaluateStatement(realm, statement);
  }

  return completion;
}

/**
 * @param {import('./runtime/realm.js').Realm} realm
 * @param {any} statement
 * @returns {{ type: 'normal', value: unknown }}
 */
function evaluateStatement(realm, statement) {
  throw createUnsupportedNodeError(statement);
}
