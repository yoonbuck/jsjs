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
import { strictEqualityComparison } from '../runtime/operators.js';

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
  'SwitchStatement',
  'LabeledStatement',
]);

/**
 * Evaluates a single statement node to a completion record.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @param {string[]} [labelSet]
 * @returns {Completion}
 */
export function evaluateStatement(node, context, labelSet = []) {
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
      return evaluateWhileStatement(node, context, labelSet);
    case 'DoWhileStatement':
      return evaluateDoWhileStatement(node, context, labelSet);
    case 'ForStatement':
      return evaluateForStatement(node, context, labelSet);
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
    case 'SwitchStatement':
      return evaluateSwitchStatement(node, context, labelSet);
    case 'LabeledStatement':
      return evaluateLabeledStatement(node, context, labelSet);
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
  return createBreakCompletion(
    node.label ? node.label.name : undefined,
    EMPTY,
  );
}

/**
 * @param {any} node
 * @returns {Completion}
 */
function evaluateContinueStatement(node) {
  return createContinueCompletion(
    node.label ? node.label.name : undefined,
    EMPTY,
  );
}

/**
 * Applies one loop-body iteration's completion to the loop's accumulated
 * value and decides how the enclosing loop should proceed. A `break` or
 * `continue` whose target is `undefined` (unlabelled) or matches an entry
 * in `labelSet` (one of the labels directly stacked on this loop) is
 * "owned" by this loop. Any `break`/`continue` whose target is a label
 * not in `labelSet` propagates out unchanged so an enclosing
 * `LabeledStatement` can absorb it.
 *
 * @param {Completion} bodyResult
 * @param {unknown} value
 * @param {string[]} labelSet
 * @returns {{ value: unknown, action: 'break' | 'continue' | 'propagate' }}
 */
function applyLoopBodyResult(bodyResult, value, labelSet) {
  const updated = updateEmpty(bodyResult, value);

  /** @param {string | undefined} target */
  const ownedByLoop = (target) =>
    target === undefined || labelSet.includes(target);

  if (updated.type === 'break') {
    if (ownedByLoop(updated.target)) {
      return { value: updated.value, action: 'break' };
    }
    return { value: updated.value, action: 'propagate' };
  }

  if (updated.type === 'continue') {
    if (ownedByLoop(updated.target)) {
      return { value: updated.value, action: 'continue' };
    }
    return { value: updated.value, action: 'propagate' };
  }

  if (updated.type === 'normal') {
    return { value: updated.value, action: 'continue' };
  }

  // 'return' and 'throw' both escape the loop entirely.
  return { value: updated.value, action: 'propagate' };
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @param {string[]} labelSet
 * @returns {Completion}
 */
function evaluateWhileStatement(node, context, labelSet) {
  /** @type {unknown} */
  let value = EMPTY;

  while (toBoolean(evaluateExpressionValue(node.test, context))) {
    const bodyResult = evaluateStatement(node.body, context);
    const { value: nextValue, action } = applyLoopBodyResult(bodyResult, value, labelSet);
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
 * @param {string[]} labelSet
 * @returns {Completion}
 */
function evaluateDoWhileStatement(node, context, labelSet) {
  /** @type {unknown} */
  let value = EMPTY;

  do {
    const bodyResult = evaluateStatement(node.body, context);
    const { value: nextValue, action } = applyLoopBodyResult(bodyResult, value, labelSet);
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
 * @param {string[]} labelSet
 * @returns {Completion}
 */
function evaluateForStatement(node, context, labelSet) {
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
    const { value: nextValue, action } = applyLoopBodyResult(bodyResult, value, labelSet);
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
 * Runs switch cases from `startIndex` to the end of `cases`, implementing
 * fallthrough semantics and absorbing any `break` whose target is
 * `undefined` or in `labelSet`.
 *
 * @param {any[]} cases
 * @param {number} startIndex
 * @param {EvaluationContext} context
 * @param {string[]} labelSet
 * @param {unknown} initialValue
 * @returns {Completion}
 */
function runSwitchCasesFrom(cases, startIndex, context, labelSet, initialValue) {
  /** @type {unknown} */
  let value = initialValue;

  for (let i = startIndex; i < cases.length; i += 1) {
    for (const statement of cases[i].consequent) {
      const next = evaluateStatement(statement, context);
      const updated = updateEmpty(next, value);
      value = updated.value;

      if (updated.type !== 'normal') {
        if (
          updated.type === 'break' &&
          (updated.target === undefined || labelSet.includes(/** @type {string} */ (updated.target)))
        ) {
          return createNormalCompletion(value);
        }
        return updated;
      }
    }
  }

  return createNormalCompletion(value);
}

/**
 * Evaluates a `SwitchStatement`, implementing ECMA-262 12.11 runtime
 * semantics: strict-equality case matching with lazy, left-to-right test
 * evaluation, full fallthrough once a match is found, and a two-pass
 * algorithm when a `default` clause is present.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @param {string[]} labelSet
 * @returns {Completion}
 */
function evaluateSwitchStatement(node, context, labelSet) {
  const switchValue = evaluateExpressionValue(node.discriminant, context);
  const cases = /** @type {any[]} */ (node.cases);

  // Find the default clause index (-1 if absent).
  let defaultIndex = -1;
  for (let i = 0; i < cases.length; i += 1) {
    if (cases[i].test === null) {
      defaultIndex = i;
      break;
    }
  }

  // Pass A: scan from index 0 up to (but not including) defaultIndex, or
  // through all cases if there is no default.
  const passAEnd = defaultIndex === -1 ? cases.length : defaultIndex;
  let matchIndex = -1;

  for (let i = 0; i < passAEnd; i += 1) {
    const testValue = evaluateExpressionValue(cases[i].test, context);
    if (strictEqualityComparison(switchValue, testValue)) {
      matchIndex = i;
      break;
    }
  }

  if (matchIndex !== -1) {
    return runSwitchCasesFrom(cases, matchIndex, context, labelSet, EMPTY);
  }

  // No match in Pass A.
  if (defaultIndex === -1) {
    // No default either — nothing runs.
    return createNormalCompletion(EMPTY);
  }

  // Pass B: scan cases after the default for a match.
  for (let i = defaultIndex + 1; i < cases.length; i += 1) {
    const testValue = evaluateExpressionValue(cases[i].test, context);
    if (strictEqualityComparison(switchValue, testValue)) {
      matchIndex = i;
      break;
    }
  }

  // Run from the matched case, or from the default if nothing matched in Pass B.
  const startIndex = matchIndex !== -1 ? matchIndex : defaultIndex;
  return runSwitchCasesFrom(cases, startIndex, context, labelSet, EMPTY);
}

/**
 * Evaluates a `LabeledStatement`. The label name is appended to `labelSet`
 * and threaded down only to the immediate body. If the body produces a
 * `break` completion targeting THIS label, it is converted to a normal
 * completion (the label has been consumed). All other completions propagate
 * unchanged, so enclosing `LabeledStatement`s for other labels can each
 * absorb their own targets in turn.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @param {string[]} labelSet
 * @returns {Completion}
 */
function evaluateLabeledStatement(node, context, labelSet) {
  const label = node.label.name;
  const result = evaluateStatement(node.body, context, [...labelSet, label]);

  if (result.type === 'break' && result.target === label) {
    return createNormalCompletion(result.value);
  }

  return result;
}

/**
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
