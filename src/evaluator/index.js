import { EXPRESSION_TYPES, evaluateExpressionValue } from './expressions.js';
import { STATEMENT_TYPES, evaluateStatement } from './statements.js';
import { createUnsupportedNodeError } from '../runtime/errors.js';

/**
 * The running execution context the evaluator threads through every node.
 *
 * `env` is the LexicalEnvironment (identifier resolution) and `variableEnv`
 * is the VariableEnvironment (where `var`/function declarations hoist to).
 * ES5 keeps them equal on entering global, function, and eval code, so almost
 * everywhere `variableEnv === env`; they diverge only where a construct
 * installs a fresh *lexical* scope over an unchanged variable scope — a
 * `catch` clause today, and a `with` statement once Task 3 lands. Tracking
 * both is what lets a direct `eval("var x")` inside a `catch` hoist `x` into
 * the enclosing function (or global) variable environment rather than into the
 * catch scope that vanishes when the clause exits (ECMA-262 10.4.2 / 10.5).
 *
 * @typedef {{
 *   realm: import('../runtime/realm.js').Realm,
 *   env: import('../runtime/environment.js').EnvironmentRecordLike,
 *   variableEnv: import('../runtime/environment.js').EnvironmentRecordLike,
 *   strict: boolean,
 *   thisValue: unknown,
 *   homeObject?: import('../runtime/object.js').EngineObject | undefined,
 * }} EvaluationContext
 */

/**
 * Dispatches a single AST node by type. Statement nodes return an explicit
 * completion record (`{ type: 'normal' | 'break' | 'continue' | 'return' |
 * 'throw', value, target? }`); expression nodes return their dereferenced
 * runtime value directly.
 *
 * Routing is driven by the two dispatch tables the evaluator modules
 * export, so a node type belongs to exactly one evaluator and an
 * unrecognized type is rejected here rather than being forwarded to the
 * expression evaluator on the assumption that anything which is not a
 * statement must be an expression. Node types this milestone does not
 * implement yet throw `UnsupportedNodeError` rather than silently falling
 * through to host behavior.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
export function evaluate(node, context) {
  if (!node || typeof node.type !== 'string') {
    throw new TypeError('Expected an AST node with a string type');
  }

  if (STATEMENT_TYPES.has(node.type)) {
    return evaluateStatement(node, context);
  }

  if (EXPRESSION_TYPES.has(node.type)) {
    return evaluateExpressionValue(node, context);
  }

  throw createUnsupportedNodeError(node);
}
