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
import { toBoolean, toObject } from '../runtime/conversion.js';
import { createUnsupportedNodeError } from '../runtime/errors.js';
import {
  getIdentifierReference,
  newDeclarativeEnvironment,
  newObjectEnvironment,
} from '../runtime/environment.js';
import { putValue } from '../runtime/reference.js';
import { enumerableKeysForIn, isEnumerableForIn } from '../runtime/object.js';
import { evaluateExpression, evaluateExpressionValue } from './expressions.js';
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
  'ForInStatement',
  'BreakStatement',
  'ContinueStatement',
  'ReturnStatement',
  'ThrowStatement',
  'TryStatement',
  'SwitchStatement',
  'LabeledStatement',
  'DebuggerStatement',
  'WithStatement',
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
    case 'ForInStatement':
      return evaluateForInStatement(node, context, labelSet);
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
    case 'DebuggerStatement':
      // ECMA-262 5.1 12.15: with no attached debugger the production
      // evaluates to a normal, empty completion — a pure no-op.
      return createNormalCompletion(EMPTY);
    case 'WithStatement':
      return evaluateWithStatement(node, context);
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
  return createBreakCompletion(node.label ? node.label.name : undefined, EMPTY);
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
    const { value: nextValue, action } = applyLoopBodyResult(
      bodyResult,
      value,
      labelSet,
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
 * @param {string[]} labelSet
 * @returns {Completion}
 */
function evaluateDoWhileStatement(node, context, labelSet) {
  /** @type {unknown} */
  let value = EMPTY;

  do {
    const bodyResult = evaluateStatement(node.body, context);
    const { value: nextValue, action } = applyLoopBodyResult(
      bodyResult,
      value,
      labelSet,
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
    const { value: nextValue, action } = applyLoopBodyResult(
      bodyResult,
      value,
      labelSet,
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

/**
 * Evaluates a `ForInStatement`, implementing ECMA-262 12.6.4 runtime
 * semantics. `right` is evaluated once; a `null`/`undefined` result
 * short-circuits to a no-op loop (12.6.4 step 2) rather than throwing,
 * matching `for (var k in null) {}` doing nothing. Otherwise `right` is
 * autoboxed via `ToObject` and the full enumeration order is computed
 * upfront by `enumerableKeysForIn` (own-then-inherited enumerable
 * string-keyed properties, each name visited once) before the body runs
 * for each name in turn, reusing the same `applyLoopBodyResult`
 * break/continue/return/throw handling every other loop here uses.
 *
 * The snapshot fixes the *order*, not the *membership*: 12.6.4 requires
 * that a property deleted before enumeration reaches it is never visited,
 * so each name is re-checked with `isEnumerableForIn` right before it
 * would be assigned to the loop target, and a name that is no longer a
 * live enumerable property is skipped without assigning it. Properties
 * added during enumeration are the case the same paragraph leaves
 * unguaranteed; they stay outside the snapshot, which is what keeps an
 * enumeration that grows its own object finite.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @param {string[]} labelSet
 * @returns {Completion}
 */
function evaluateForInStatement(node, context, labelSet) {
  const rightValue = evaluateExpressionValue(node.right, context);

  if (rightValue === null || rightValue === undefined) {
    return createNormalCompletion(EMPTY);
  }

  const object = toObject(context.realm, rightValue);
  const keys = enumerableKeysForIn(object);

  /** @type {unknown} */
  let value = EMPTY;

  for (const key of keys) {
    if (!isEnumerableForIn(object, key)) {
      continue;
    }

    assignForInTarget(node.left, key, context);

    const bodyResult = evaluateStatement(node.body, context);
    const { value: nextValue, action } = applyLoopBodyResult(
      bodyResult,
      value,
      labelSet,
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
 * Binds one enumerated property name to a `ForInStatement`'s left-hand
 * side, supporting both grammar forms the parser emits (ECMA-262 12.6.4
 * step 6a "evaluate ... as if it were an AssignmentExpression"):
 *
 * - `VariableDeclaration` (`for (var k in obj)`): the single declarator's
 *   name was already hoisted as a `var` binding (see `collectVarNames`'s
 *   `ForInStatement` case), so this resolves that existing binding through
 *   the environment chain and assigns it directly — no re-declaration.
 * - Any other assignable expression (`Identifier` or `MemberExpression`,
 *   e.g. `for (k in obj)` or `for (a[i] in obj)`): evaluated to a fresh
 *   `Reference` every iteration, exactly like `AssignmentExpression`'s
 *   left-hand side.
 *
 * @param {any} left
 * @param {string} key
 * @param {EvaluationContext} context
 * @returns {void}
 */
function assignForInTarget(left, key, context) {
  if (left.type === 'VariableDeclaration') {
    const name = left.declarations[0].id.name;
    const reference = getIdentifierReference(context.env, name, context.strict);
    putValue(reference, key);
    return;
  }

  if (left.type !== 'Identifier' && left.type !== 'MemberExpression') {
    throw createUnsupportedNodeError(left);
  }

  const reference = /** @type {import('../runtime/reference.js').Reference} */ (
    evaluateExpression(left, context)
  );
  putValue(reference, key);
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
function runSwitchCasesFrom(
  cases,
  startIndex,
  context,
  labelSet,
  initialValue,
) {
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
          (updated.target === undefined ||
            labelSet.includes(/** @type {string} */ (updated.target)))
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
 * Runs `fn` and converts any `GuestErrorSignal` or `ThrowSignal`
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
        realm.createGuestError(error.typeName, error.guestMessage),
      );
    }

    throw error;
  }
}

/**
 * Evaluates a `WithStatement` node (ECMA-262 5.1 §12.10).
 *
 * The object environment created here augments only the *lexical*
 * environment: `context.variableEnv` is threaded through unchanged, so a
 * `var` — or a direct `eval("var …")` — inside the body still hoists into the
 * enclosing function or global variable environment rather than onto the
 * `with` object, while identifier *resolution* inside the body consults the
 * object first (§10.2.1). The new object environment sets `provideThis`, so a
 * method invoked as a bare `name()` inside the body sees the binding object as
 * its `this` (§10.2.1.2.6, surfaced through `referenceThisValue`).
 *
 * The augmented environment exists only in the derived context, so every exit
 * path — normal, `throw`, `break`, `continue`, `return` — restores the prior
 * environment automatically, with no `try/finally` required. `ToObject`
 * (§12.10 step 2) raises a guest `TypeError` for `null`/`undefined`, which
 * propagates as a host signal exactly like a sub-expression fault in any other
 * statement and is converted to a `throw` completion at the guest boundary.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {Completion}
 */
function evaluateWithStatement(node, context) {
  const value = evaluateExpressionValue(node.object, context);
  const object = toObject(context.realm, value);
  const withEnv = newObjectEnvironment(object, context.env, true);
  const withContext = { ...context, env: withEnv };

  return evaluateStatement(node.body, withContext);
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

      // The catch clause installs a fresh *lexical* environment for its
      // parameter, but the VariableEnvironment is unchanged: the spread keeps
      // `context.variableEnv`, so a direct `eval("var x")` in the catch body
      // hoists `x` into the enclosing function (or global), not into this
      // catch scope that disappears when the clause exits (ECMA-262 12.14).
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
