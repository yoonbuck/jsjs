import { EXPRESSION_TYPES, evaluateExpressionValue } from './expressions.js';
import { STATEMENT_TYPES, evaluateStatement } from './statements.js';
import { createUnsupportedNodeError } from '../runtime/errors.js';

/**
 * @typedef {{
 *   realm: import('../runtime/realm.js').Realm,
 *   env: import('../runtime/environment.js').EnvironmentRecordLike,
 *   strict: boolean,
 *   thisValue: unknown,
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
