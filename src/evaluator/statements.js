import {
  EMPTY,
  createBreakCompletion,
  createContinueCompletion,
  createNormalCompletion,
  updateEmpty,
} from '../runtime/completion.js';
import { toBoolean } from '../runtime/conversion.js';
import { createUnsupportedNodeError } from '../runtime/errors.js';
import { evaluateExpressionValue } from './expressions.js';
import { evaluateVariableDeclaration } from './declarations.js';

/**
 * @typedef {import('./index.js').EvaluationContext} EvaluationContext
 * @typedef {{ type: string, value: unknown, target?: string | undefined }} Completion
 */

/**
 * Evaluates a single statement node to a completion record.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {Completion}
 */
export function evaluateStatement(node, context) {
  switch (node.type) {
    case 'ExpressionStatement':
      return createNormalCompletion(
        evaluateExpressionValue(node.expression, context),
      );
    case 'EmptyStatement':
      return createNormalCompletion(EMPTY);
    case 'BlockStatement':
      return evaluateStatementList(node.body, context);
    case 'VariableDeclaration':
      return evaluateVariableDeclaration(node, context);
    case 'IfStatement':
      return evaluateIfStatement(node, context);
    case 'WhileStatement':
      return evaluateWhileStatement(node, context);
    case 'DoWhileStatement':
      return evaluateDoWhileStatement(node, context);
    case 'ForStatement':
      return evaluateForStatement(node, context);
    case 'BreakStatement':
      return evaluateBreakStatement(node);
    case 'ContinueStatement':
      return evaluateContinueStatement(node);
    default:
      throw createUnsupportedNodeError(node);
  }
}

/**
 * Evaluates a statement list (a `Program` body or `BlockStatement` body),
 * implementing ECMA-262's `StatementList` runtime semantics: once an
 * abrupt completion (`break`/`continue`; `return`/`throw` would apply too,
 * though neither is reachable yet) is produced, evaluation stops and later
 * statements are not evaluated. A statement whose own completion value is
 * `EMPTY` inherits the value accumulated so far, so the last *meaningful*
 * value threads through declarations, empty statements, and untaken `if`
 * branches.
 *
 * @param {any[]} statements
 * @param {EvaluationContext} context
 * @returns {Completion}
 */
export function evaluateStatementList(statements, context) {
  /** @type {Completion} */
  let result = createNormalCompletion(EMPTY);

  for (const statement of statements) {
    if (result.type !== 'normal') {
      return result;
    }

    const next = evaluateStatement(statement, context);
    result = updateEmpty(next, result.value);
  }

  return result;
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {Completion}
 */
function evaluateIfStatement(node, context) {
  if (toBoolean(evaluateExpressionValue(node.test, context))) {
    return evaluateStatement(node.consequent, context);
  }

  if (node.alternate) {
    return evaluateStatement(node.alternate, context);
  }

  return createNormalCompletion(EMPTY);
}

/**
 * @param {any} node
 * @returns {Completion}
 */
function evaluateBreakStatement(node) {
  if (node.label) {
    // Labeled break requires a matching `LabeledStatement`, which is not
    // supported yet.
    throw createUnsupportedNodeError({ type: 'LabeledBreakStatement' });
  }

  return createBreakCompletion(undefined, EMPTY);
}

/**
 * @param {any} node
 * @returns {Completion}
 */
function evaluateContinueStatement(node) {
  if (node.label) {
    throw createUnsupportedNodeError({ type: 'LabeledContinueStatement' });
  }

  return createContinueCompletion(undefined, EMPTY);
}

/**
 * Applies one loop-body iteration's completion to the loop's accumulated
 * value and decides how the enclosing loop should proceed. There are no
 * labels yet, so every `break`/`continue` target is unlabeled and always
 * matches the innermost loop.
 *
 * @param {Completion} bodyResult
 * @param {unknown} value
 * @returns {{ value: unknown, action: 'break' | 'continue' | 'propagate' }}
 */
function applyLoopBodyResult(bodyResult, value) {
  const updated = updateEmpty(bodyResult, value);

  if (updated.type === 'break') {
    return { value: updated.value, action: 'break' };
  }

  if (updated.type === 'normal' || updated.type === 'continue') {
    return { value: updated.value, action: 'continue' };
  }

  // 'return' / 'throw': neither is produced by any supported statement yet,
  // but propagate faithfully rather than assuming it cannot happen.
  return { value: updated.value, action: 'propagate' };
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {Completion}
 */
function evaluateWhileStatement(node, context) {
  /** @type {unknown} */
  let value = EMPTY;

  while (toBoolean(evaluateExpressionValue(node.test, context))) {
    const bodyResult = evaluateStatement(node.body, context);
    const { value: nextValue, action } = applyLoopBodyResult(
      bodyResult,
      value,
    );
    value = nextValue;

    if (action === 'break') {
      return createNormalCompletion(value);
    }

    if (action === 'propagate') {
      return { ...bodyResult, value };
    }
  }

  return createNormalCompletion(value);
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {Completion}
 */
function evaluateDoWhileStatement(node, context) {
  /** @type {unknown} */
  let value = EMPTY;

  do {
    const bodyResult = evaluateStatement(node.body, context);
    const { value: nextValue, action } = applyLoopBodyResult(
      bodyResult,
      value,
    );
    value = nextValue;

    if (action === 'break') {
      return createNormalCompletion(value);
    }

    if (action === 'propagate') {
      return { ...bodyResult, value };
    }
  } while (toBoolean(evaluateExpressionValue(node.test, context)));

  return createNormalCompletion(value);
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {Completion}
 */
function evaluateForStatement(node, context) {
  if (node.init) {
    if (node.init.type === 'VariableDeclaration') {
      evaluateVariableDeclaration(node.init, context);
    } else {
      evaluateExpressionValue(node.init, context);
    }
  }

  /** @type {unknown} */
  let value = EMPTY;

  while (
    node.test === null ||
    toBoolean(evaluateExpressionValue(node.test, context))
  ) {
    const bodyResult = evaluateStatement(node.body, context);
    const { value: nextValue, action } = applyLoopBodyResult(
      bodyResult,
      value,
    );
    value = nextValue;

    if (action === 'break') {
      return createNormalCompletion(value);
    }

    if (action === 'propagate') {
      return { ...bodyResult, value };
    }

    if (node.update) {
      evaluateExpressionValue(node.update, context);
    }
  }

  return createNormalCompletion(value);
}
