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
  return propertyNameFromValue(
    node,
    computed,
    computed ? evaluateExpressionValue(node, context) : undefined,
    context.realm,
  );
}

/**
 * Completes a property-name evaluation after a resumable computed key has
 * produced its value. Non-computed names ignore `value`.
 *
 * @param {any} node
 * @param {boolean} computed
 * @param {unknown} value
 * @param {import('../runtime/realm.js').Realm} [callerRealm]
 * @returns {string | symbol}
 */
export function propertyNameFromValue(node, computed, value, callerRealm) {
  if (computed) {
    return toEvaluatedPropertyKey(value, callerRealm);
  }

  if (node.type === 'Identifier') {
    return node.name;
  }

  if (node.type === 'Literal' && !node.regex) {
    return toPropertyKey(node.value, callerRealm);
  }

  throw createUnsupportedNodeError(node);
}

/**
 * @param {unknown} value
 * @param {import('../runtime/realm.js').Realm} [callerRealm]
 * @returns {string | symbol}
 */
export function toEvaluatedPropertyKey(value, callerRealm) {
  return toPropertyKey(value, callerRealm);
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
  const name = typeof key === 'symbol' ? symbolName(key) : key;

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
