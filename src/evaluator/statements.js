import {
  EMPTY,
  createBreakCompletion,
  createContinueCompletion,
  createNormalCompletion,
  createReturnCompletion,
  createThrowCompletion,
  updateEmpty,
  ThrowSignal,
  GuestErrorSignal,
} from '../runtime/completion.js';
import { toBoolean } from '../runtime/conversion.js';
import { createUnsupportedNodeError } from '../runtime/errors.js';
import { newDeclarativeEnvironment } from '../runtime/environment.js';
import { createGuestError } from '../builtins/errors.js';
import { evaluateExpressionValue } from './expressions.js';
import { evaluateVariableDeclaration } from './declarations.js';

/**
 * @typedef {import('./index.js').EvaluationContext} EvaluationContext
 * @typedef {{ type: string, value: unknown, target?: string | undefined }} Completion
 */

/**
 * Every node type `evaluateStatement` dispatches. Exported so the
 * evaluator's entry point can route nodes by an explicit, single source of
 * truth instead of guessing that anything unrecognized is an expression.
 */
export const STATEMENT_TYPES = new Set([
  'ExpressionStatement',
  'EmptyStatement',
  'BlockStatement',
  'VariableDeclaration',
  'FunctionDeclaration',
  'IfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
  'BreakStatement',
  'ContinueStatement',
  'ReturnStatement',
  'ThrowStatement',
  'TryStatement',
]);

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
    case 'FunctionDeclaration':
      // Declaration instantiation already created and bound the function
      // object before the statement list ran, so reaching the declaration
      // in source order produces no value (ECMA-262 13).
      return createNormalCompletion(EMPTY);
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
    case 'ThrowStatement':
      return createThrowCompletion(
        evaluateExpressionValue(node.argument, context),
      );
    case 'TryStatement':
      return evaluateTryStatement(node, context);
    case 'ReturnStatement':
      return createReturnCompletion(
        node.argument === null || node.argument === undefined
          ? undefined
          : evaluateExpressionValue(node.argument, context),
      );
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

  // 'return' and 'throw' both escape the loop entirely: a `return` in a
  // loop body ends the whole function, and a `throw` unwinds past it.
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
    const { value: nextValue, action } = applyLoopBodyResult(bodyResult, value);
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
    const { value: nextValue, action } = applyLoopBodyResult(bodyResult, value);
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
    const { value: nextValue, action } = applyLoopBodyResult(bodyResult, value);
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

/**
 * Runs `fn` and converts any host-level `ThrowSignal` or `GuestErrorSignal`
 * that escapes into a `throw` completion record, re-throwing everything else
 * unchanged. This bridges the gap between expression evaluation (which
 * surfaces guest throws as host exceptions) and the completion-record world
 * that `TryStatement` operates in.
 *
 * @param {() => Completion} fn
 * @param {import('../runtime/realm.js').Realm} realm
 * @returns {Completion}
 */
function runToCompletion(fn, realm) {
  try {
    return fn();
  } catch (error) {
    if (error instanceof ThrowSignal) {
      return createThrowCompletion(error.value);
    }

    if (error instanceof GuestErrorSignal) {
      return createThrowCompletion(
        createGuestError(realm, error.typeName, error.guestMessage),
      );
    }

    throw error;
  }
}

/**
 * Evaluates a `TryStatement` node, implementing ECMA-262 12.14 runtime
 * semantics for all three forms: `try/catch`, `try/finally`, and
 * `try/catch/finally`.
 *
 * The catch clause gets its own declarative environment so the catch
 * parameter shadows any outer binding of the same name for the duration of
 * the catch body, then disappears.
 *
 * Any `ThrowSignal` or `GuestErrorSignal` that escapes the try block, catch
 * body, or finally body is intercepted by `runToCompletion` and converted
 * into a `throw` completion record so that the completion-precedence rules
 * can apply uniformly.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {Completion}
 */
function evaluateTryStatement(node, context) {
  // Evaluate the try block, capturing any host-level throw signals.
  let blockCompletion = runToCompletion(
    () => evaluateStatementList(node.block.body, context),
    context.realm,
  );

  // Run the catch clause when there is one and the try block threw.
  if (node.handler !== null) {
    if (blockCompletion.type === 'throw') {
      const catchEnv = newDeclarativeEnvironment(context.env);
      const paramName = node.handler.param.name;
      catchEnv.createMutableBinding(paramName);
      catchEnv.initializeBinding(paramName, blockCompletion.value);

      const catchContext = { ...context, env: catchEnv };

      blockCompletion = runToCompletion(
        () => evaluateStatementList(node.handler.body.body, catchContext),
        context.realm,
      );
      blockCompletion = updateEmpty(blockCompletion, undefined);
    }
  }

  // Run the finally block (if any), in the original environment.
  if (node.finalizer !== null) {
    const finallyCompletion = runToCompletion(
      () => evaluateStatementList(node.finalizer.body, context),
      context.realm,
    );

    if (finallyCompletion.type !== 'normal') {
      return finallyCompletion;
    }
  }

  return blockCompletion;
}
