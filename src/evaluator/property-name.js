import { toPropertyKey } from '../runtime/conversion.js';
import { createUnsupportedNodeError } from '../runtime/errors.js';
import { symbolDescription } from '../runtime/symbol.js';
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

/**
 * ECMA-262's SetFunctionName spelling for an object property key. Symbols use
 * their descriptive string without the `Symbol(...)` wrapper.
 *
 * @param {string | symbol} key
 * @param {string} [prefix='']
 * @returns {string}
 */
export function functionNameFromPropertyKey(key, prefix = '') {
  const name =
    typeof key === 'symbol'
      ? symbolName(key)
      : key;

  return prefix === '' ? name : `${prefix} ${name}`;
}

/**
 * @param {symbol} key
 * @returns {string}
 */
function symbolName(key) {
  const description = symbolDescription(key);

  return description === undefined ? '' : `[${description}]`;
}
