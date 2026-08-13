import { toPropertyKey } from '../runtime/conversion.js';
import { createUnsupportedNodeError } from '../runtime/errors.js';
import { evaluateExpressionValue } from './expressions.js';

/**
 * @typedef {import('./index.js').EvaluationContext} EvaluationContext
 */

/**
 * @param {any} node
 * @param {boolean} computed
 * @param {EvaluationContext} context
 * @returns {string | symbol}
 */
export function evaluatePropertyName(node, computed, context) {
  if (computed) {
    return toPropertyKey(evaluateExpressionValue(node, context));
  }

  if (node.type === 'Identifier') {
    return node.name;
  }

  if (node.type === 'Literal' && !node.regex) {
    return toPropertyKey(node.value);
  }

  throw createUnsupportedNodeError(node);
}
