import { evaluateExpressionValue } from './expressions.js';
import { evaluateStatement } from './statements.js';

/**
 * @typedef {{
 *   realm: import('../runtime/realm.js').Realm,
 *   env: import('../runtime/environment.js').EnvironmentRecordLike,
 *   strict: boolean,
 * }} EvaluationContext
 */

const STATEMENT_TYPES = new Set([
  'ExpressionStatement',
  'EmptyStatement',
  'BlockStatement',
  'VariableDeclaration',
  'IfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
  'BreakStatement',
  'ContinueStatement',
]);

/**
 * Dispatches a single AST node by type. Statement nodes return an explicit
 * completion record (`{ type: 'normal' | 'break' | 'continue', value,
 * target? }`); expression nodes return their dereferenced runtime value
 * directly. Node types this milestone does not implement yet (functions,
 * member access, calls, object/array literals, and every other
 * not-yet-supported statement form) throw `UnsupportedNodeError` rather
 * than silently falling through to host behavior.
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

  return evaluateExpressionValue(node, context);
}
