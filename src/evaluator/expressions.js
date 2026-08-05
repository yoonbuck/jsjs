import { Reference, getValue, putValue } from '../runtime/reference.js';
import { getIdentifierReference } from '../runtime/environment.js';
import { toBoolean, toNumber } from '../runtime/conversion.js';
import {
  abstractEqualityComparison,
  abstractRelationalComparison,
  add,
  divide,
  multiply,
  remainder,
  strictEqualityComparison,
  subtract,
  typeOf,
} from '../runtime/operators.js';
import {
  createUnsupportedNodeError,
  createUnsupportedOperatorError,
} from '../runtime/errors.js';

/**
 * @typedef {import('./index.js').EvaluationContext} EvaluationContext
 */

const SUPPORTED_BINARY_OPERATORS = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '==',
  '!=',
  '===',
  '!==',
  '<',
  '<=',
  '>',
  '>=',
]);

/**
 * Evaluates an expression node. Mirroring the specification, `Identifier`
 * nodes evaluate to a `Reference` (so assignment and `typeof` can inspect it
 * without triggering `GetValue`); every other supported expression
 * evaluates directly to its dereferenced runtime value. Callers that always
 * want a value should use `evaluateExpressionValue` instead.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {Reference | unknown}
 */
export function evaluateExpression(node, context) {
  switch (node.type) {
    case 'Literal':
      return evaluateLiteral(node);
    case 'Identifier':
      return getIdentifierReference(context.env, node.name, context.strict);
    case 'UnaryExpression':
      return evaluateUnaryExpression(node, context);
    case 'BinaryExpression':
      return evaluateBinaryExpression(node, context);
    case 'LogicalExpression':
      return evaluateLogicalExpression(node, context);
    case 'ConditionalExpression':
      return evaluateConditionalExpression(node, context);
    case 'AssignmentExpression':
      return evaluateAssignmentExpression(node, context);
    default:
      throw createUnsupportedNodeError(node);
  }
}

/**
 * Evaluates an expression node to its dereferenced runtime value, applying
 * `GetValue` when `evaluateExpression` returns a `Reference`.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
export function evaluateExpressionValue(node, context) {
  const result = evaluateExpression(node, context);
  return result instanceof Reference ? getValue(result) : result;
}

/**
 * @param {any} node
 * @returns {unknown}
 */
function evaluateLiteral(node) {
  if (node.regex) {
    // No guest RegExp object exists yet; reject explicitly instead of
    // leaking the host RegExp instance Acorn attaches as `node.value`.
    throw createUnsupportedNodeError({ type: 'RegExpLiteral' });
  }

  return node.value;
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
function evaluateUnaryExpression(node, context) {
  switch (node.operator) {
    case 'typeof':
      return evaluateTypeofExpression(node.argument, context);
    case 'void':
      evaluateExpressionValue(node.argument, context);
      return undefined;
    case '!':
      return !toBoolean(evaluateExpressionValue(node.argument, context));
    case '-':
      return -toNumber(evaluateExpressionValue(node.argument, context));
    case '+':
      return toNumber(evaluateExpressionValue(node.argument, context));
    default:
      throw createUnsupportedOperatorError('unary', node.operator);
  }
}

/**
 * `typeof` on an unresolvable identifier reference evaluates to
 * `'undefined'` instead of throwing a `ReferenceError` (ECMA-262 11.4.3),
 * so an unresolved `Identifier` argument needs special handling ahead of
 * the normal `GetValue` path every other unary operator uses.
 *
 * @param {any} argument
 * @param {EvaluationContext} context
 * @returns {string}
 */
function evaluateTypeofExpression(argument, context) {
  if (argument.type === 'Identifier') {
    const reference = getIdentifierReference(
      context.env,
      argument.name,
      context.strict,
    );

    if (reference.base === undefined) {
      return 'undefined';
    }

    return typeOf(getValue(reference));
  }

  return typeOf(evaluateExpressionValue(argument, context));
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
function evaluateBinaryExpression(node, context) {
  const operator = node.operator;

  if (!SUPPORTED_BINARY_OPERATORS.has(operator)) {
    throw createUnsupportedOperatorError('binary', operator);
  }

  const left = evaluateExpressionValue(node.left, context);
  const right = evaluateExpressionValue(node.right, context);

  switch (operator) {
    case '+':
      return add(left, right);
    case '-':
      return subtract(left, right);
    case '*':
      return multiply(left, right);
    case '/':
      return divide(left, right);
    case '%':
      return remainder(left, right);
    case '==':
      return abstractEqualityComparison(left, right);
    case '!=':
      return !abstractEqualityComparison(left, right);
    case '===':
      return strictEqualityComparison(left, right);
    case '!==':
      return !strictEqualityComparison(left, right);
    case '<': {
      const result = abstractRelationalComparison(left, right, true);
      return result === undefined ? false : result;
    }
    case '>': {
      const result = abstractRelationalComparison(right, left, false);
      return result === undefined ? false : result;
    }
    case '<=': {
      const result = abstractRelationalComparison(right, left, false);
      return result === undefined || result === true ? false : true;
    }
    default: {
      // '>='
      const result = abstractRelationalComparison(left, right, true);
      return result === undefined || result === true ? false : true;
    }
  }
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
function evaluateLogicalExpression(node, context) {
  const left = evaluateExpressionValue(node.left, context);

  if (node.operator === '&&') {
    return toBoolean(left) ? evaluateExpressionValue(node.right, context) : left;
  }

  if (node.operator === '||') {
    return toBoolean(left) ? left : evaluateExpressionValue(node.right, context);
  }

  throw createUnsupportedOperatorError('logical', node.operator);
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
function evaluateConditionalExpression(node, context) {
  const test = toBoolean(evaluateExpressionValue(node.test, context));

  return test
    ? evaluateExpressionValue(node.consequent, context)
    : evaluateExpressionValue(node.alternate, context);
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
function evaluateAssignmentExpression(node, context) {
  if (node.operator !== '=') {
    throw createUnsupportedOperatorError('assignment', node.operator);
  }

  if (node.left.type !== 'Identifier') {
    // Member-expression assignment targets need property references
    // (Task 6); reject explicitly rather than guessing at semantics.
    throw createUnsupportedNodeError(node.left);
  }

  const reference = evaluateExpression(node.left, context);
  const value = evaluateExpressionValue(node.right, context);
  putValue(/** @type {Reference} */ (reference), value);
  return value;
}
