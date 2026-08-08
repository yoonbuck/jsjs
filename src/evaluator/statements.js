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
import { putValue, getValue } from '../runtime/reference.js';
import { enumerableKeysForIn, isEnumerableForIn } from '../runtime/object.js';
import { evaluateExpression, evaluateExpressionValue } from './expressions.js';
import {
  blockDeclarationInstantiation,
  evaluateVariableDeclaration,
} from './declarations.js';
import {
  boundNames,
  isConstantDeclaration,
  lexicallyScopedDeclarations,
} from './static-semantics.js';
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
 * Every node walked into is one frame of the realm's stack budget, for the
 * same reason expression nodes are: the evaluator recurses on the host stack
 * in step with the statement tree.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @param {string[]} [labelSet]
 * @returns {Completion}
 */
export function evaluateStatement(node, context, labelSet = []) {
  const guard = context.realm.stackGuard;

  guard.enter();

  try {
    switch (node.type) {
      case 'ExpressionStatement':
        return createNormalCompletion(
          evaluateExpressionValue(node.expression, context),
        );
      case 'EmptyStatement':
        return createNormalCompletion(EMPTY);
      case 'BlockStatement':
        return evaluateBlock(node, context);
      case 'VariableDeclaration':
        return evaluateVariableDeclaration(node, context);
      case 'FunctionDeclaration':
        return evaluateFunctionDeclaration(node, context);
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
  } finally {
    guard.exit();
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
 * Evaluates a `BlockStatement` (ES2015 §13.2.13). A block that declares
 * something lexically runs in a fresh declarative environment seeded by
 * `blockDeclarationInstantiation`, with `variableEnv` threaded through
 * unchanged the way `evaluateWithStatement` does — so `var`s and a direct
 * `eval("var …")` still hoist to the enclosing function/global scope.
 *
 * A block with no lexical declarations skips the environment entirely: an
 * empty declarative record over the current one is unobservable, and skipping
 * it keeps every ES5 program — and the 22219 pinned Test262 records — on the
 * exact path they took before block scoping existed.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {Completion}
 */
function evaluateBlock(node, context) {
  const declarations = lexicallyScopedDeclarations(node.body);

  if (declarations.length === 0) {
    return evaluateStatementList(node.body, context);
  }

  const blockEnv = newDeclarativeEnvironment(context.env);
  const blockContext = { ...context, env: blockEnv };

  blockDeclarationInstantiation(declarations, blockEnv, blockContext);

  return evaluateStatementList(node.body, blockContext);
}

/**
 * Evaluates a `FunctionDeclaration` reached in source order. Its binding was
 * created before the statement list ran (var-scope instantiation for a
 * top-level function, `blockDeclarationInstantiation` for a block-level one),
 * so ordinarily this produces no value (ECMA-262 13 / ES2015 §14.1.20).
 *
 * The exception is ES2015 Annex B.3.3: when non-strict declaration
 * instantiation gave *this* block-level function declaration a var-scoped alias
 * (this node is in `context.annexBFunctionDeclarations`), evaluating it in
 * source order copies the block binding's current value into the variable
 * environment (B.3.3.1 step 1.a.iii's replacement evaluation). Eligibility is
 * keyed on node identity, not the name: two block functions may share a name
 * yet only one be eligible, so only the eligible node copies. The
 * `env !== variableEnv` guard restricts the copy to a genuine block context — a
 * top-level function evaluates with `env === variableEnv` and must not
 * self-copy.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {Completion}
 */
function evaluateFunctionDeclaration(node, context) {
  const aliasDeclarations = context.annexBFunctionDeclarations;

  if (
    aliasDeclarations !== undefined &&
    context.env !== context.variableEnv &&
    aliasDeclarations.has(node)
  ) {
    const name = node.id.name;
    const value = getValue(getIdentifierReference(context.env, name, false));
    context.variableEnv.setMutableBinding(name, value, false);
  }

  return createNormalCompletion(EMPTY);
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
  // ES2015 §13.7.4.7: a `for` head that lexically declares (`let`/`const`)
  // scopes its bindings to the loop and, for `let`, copies them per iteration.
  // A `var` head or a bare-expression head keeps the ES5 code path below.
  if (
    node.init &&
    node.init.type === 'VariableDeclaration' &&
    node.init.kind !== 'var'
  ) {
    return evaluateLexicalForStatement(node, context, labelSet);
  }

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
 * Evaluates a `for` statement whose head is a `let`/`const` declaration
 * (ES2015 §13.7.4.7 runtime semantics plus §13.7.4.7 `ForBodyEvaluation`).
 *
 * The head's bound names get a dedicated `loopEnv` — `const` bindings
 * immutable, `let` bindings mutable, both uninitialized until the head
 * declaration runs in `loopEnv`. `perIterationLets` is the bound names for a
 * `let` head and empty for a `const` head (a `const` binding never needs a
 * fresh per-iteration copy). `CreatePerIterationEnvironment` runs once before
 * the first test and again after each body evaluation *before* the update, so
 * the test and update always observe the current iteration's bindings — the
 * ordering that makes `for (let i = 0; i < 3; i++) f.push(() => i)` capture
 * `0, 1, 2` rather than a single shared `i`.
 *
 * The engine threads an immutable `EvaluationContext` rather than mutating a
 * running execution context, so "set the LexicalEnvironment to
 * thisIterationEnv" is expressed by rebuilding `loopContext` and using it for
 * the test, body, and update alike.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @param {string[]} labelSet
 * @returns {Completion}
 */
function evaluateLexicalForStatement(node, context, labelSet) {
  const isConst = isConstantDeclaration(node.init);
  const names = boundNames(node.init);

  const loopEnv = newDeclarativeEnvironment(context.env);
  for (const name of names) {
    if (isConst) {
      loopEnv.createImmutableBinding(name, true);
    } else {
      loopEnv.createMutableBinding(name, false);
    }
  }

  /** @type {EvaluationContext} */
  let loopContext = { ...context, env: loopEnv };
  evaluateVariableDeclaration(node.init, loopContext);

  const perIterationLets = isConst ? [] : names;
  loopContext = createPerIterationEnvironment(perIterationLets, loopContext);

  /** @type {unknown} */
  let value = EMPTY;

  while (
    node.test === null ||
    toBoolean(evaluateExpressionValue(node.test, loopContext))
  ) {
    const bodyResult = evaluateStatement(node.body, loopContext);
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

    loopContext = createPerIterationEnvironment(perIterationLets, loopContext);

    if (node.update) {
      evaluateExpressionValue(node.update, loopContext);
    }
  }

  return createNormalCompletion(value);
}

/**
 * ES2015 §13.7.4.8 `CreatePerIterationEnvironment`. With a non-empty name
 * list, builds a fresh declarative environment whose *outer* is the last
 * iteration environment's outer — not the last environment itself, which
 * would grow an ever-deeper chain across iterations — copies each name's
 * current value across, and returns a context rebased on it. With an empty
 * list (a `const` head) it is a no-op and returns `context` unchanged.
 *
 * @param {string[]} perIterationBindings
 * @param {EvaluationContext} context
 * @returns {EvaluationContext}
 */
function createPerIterationEnvironment(perIterationBindings, context) {
  if (perIterationBindings.length === 0) {
    return context;
  }

  const lastIterationEnv = context.env;
  const thisIterationEnv = newDeclarativeEnvironment(lastIterationEnv.outer);

  for (const name of perIterationBindings) {
    thisIterationEnv.createMutableBinding(name, false);
    thisIterationEnv.initializeBinding(
      name,
      lastIterationEnv.getBindingValue(name, true),
    );
  }

  return { ...context, env: thisIterationEnv };
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
 * A `let`/`const` left-hand side (ES2015 §13.7.5.11, §13.7.5.13) additionally
 * scopes its binding to the loop. The head's bound names get *uninitialized*
 * bindings in a throwaway environment while `right` is evaluated, so
 * `for (let x in x)` reads `x` in its TDZ and throws a `ReferenceError`. Each
 * iteration then gets its own fresh environment over the *original* outer
 * environment, with the head's binding created (immutable for `const`, mutable
 * for `let`) and initialized to that iteration's key — a captured closure
 * therefore observes that iteration's key, not the last one.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @param {string[]} labelSet
 * @returns {Completion}
 */
function evaluateForInStatement(node, context, labelSet) {
  const isLexical =
    node.left.type === 'VariableDeclaration' && node.left.kind !== 'var';

  /** @type {unknown} */
  let rightValue;
  if (isLexical) {
    const tdzEnv = newDeclarativeEnvironment(context.env);
    for (const name of boundNames(node.left)) {
      tdzEnv.createMutableBinding(name, false);
    }
    rightValue = evaluateExpressionValue(node.right, {
      ...context,
      env: tdzEnv,
    });
  } else {
    rightValue = evaluateExpressionValue(node.right, context);
  }

  if (rightValue === null || rightValue === undefined) {
    return createNormalCompletion(EMPTY);
  }

  const object = toObject(context.realm, rightValue);
  const keys = enumerableKeysForIn(object);

  const isConst = isLexical && isConstantDeclaration(node.left);

  /** @type {unknown} */
  let value = EMPTY;

  for (const key of keys) {
    if (!isEnumerableForIn(object, key)) {
      continue;
    }

    let iterationContext = context;
    if (isLexical) {
      const iterationEnv = newDeclarativeEnvironment(context.env);
      for (const name of boundNames(node.left)) {
        if (isConst) {
          iterationEnv.createImmutableBinding(name, true);
        } else {
          iterationEnv.createMutableBinding(name, false);
        }
        iterationEnv.initializeBinding(name, key);
      }
      iterationContext = { ...context, env: iterationEnv };
    } else {
      assignForInTarget(node.left, key, context);
    }

    const bodyResult = evaluateStatement(node.body, iterationContext);
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
 *   name was already hoisted as a `var` binding (the `ForInStatement`'s
 *   declaration is a var-scoped declaration collected by
 *   `varScopedDeclarations`/`topLevelVarDeclaredNames` in
 *   `./static-semantics.js` during declaration instantiation), so this
 *   resolves that existing binding through the environment chain and assigns
 *   it directly — no re-declaration.
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
 * Evaluates a `SwitchStatement`, implementing ES2015 §13.12.11 runtime
 * semantics: strict-equality case matching with lazy, left-to-right test
 * evaluation, full fallthrough once a match is found, and a two-pass
 * algorithm when a `default` clause is present.
 *
 * The whole `CaseBlock` — every clause's `consequent` concatenated in source
 * order — is one lexical scope: its environment is created and instantiated
 * once, before any case test or consequent runs, so a `let`/`const` declared in
 * one clause is in the temporal dead zone (not undeclared) when an earlier
 * clause reads it. The discriminant, by contrast, is evaluated first, in the
 * *outer* environment. A `CaseBlock` with no lexical declarations skips the
 * environment, keeping ES5 switches on their existing path.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @param {string[]} labelSet
 * @returns {Completion}
 */
function evaluateSwitchStatement(node, context, labelSet) {
  const switchValue = evaluateExpressionValue(node.discriminant, context);
  const cases = /** @type {any[]} */ (node.cases);

  /** @type {any[]} */
  const caseBlockStatements = [];
  for (const switchCase of cases) {
    for (const statement of switchCase.consequent) {
      caseBlockStatements.push(statement);
    }
  }

  const declarations = lexicallyScopedDeclarations(caseBlockStatements);
  let caseContext = context;

  if (declarations.length > 0) {
    const caseEnv = newDeclarativeEnvironment(context.env);
    caseContext = { ...context, env: caseEnv };
    blockDeclarationInstantiation(declarations, caseEnv, caseContext);
  }

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
    const testValue = evaluateExpressionValue(cases[i].test, caseContext);
    if (strictEqualityComparison(switchValue, testValue)) {
      matchIndex = i;
      break;
    }
  }

  if (matchIndex !== -1) {
    return runSwitchCasesFrom(cases, matchIndex, caseContext, labelSet, EMPTY);
  }

  // No match in Pass A.
  if (defaultIndex === -1) {
    // No default either — nothing runs.
    return createNormalCompletion(EMPTY);
  }

  // Pass B: scan cases after the default for a match.
  for (let i = defaultIndex + 1; i < cases.length; i += 1) {
    const testValue = evaluateExpressionValue(cases[i].test, caseContext);
    if (strictEqualityComparison(switchValue, testValue)) {
      matchIndex = i;
      break;
    }
  }

  // Run from the matched case, or from the default if nothing matched in Pass B.
  const startIndex = matchIndex !== -1 ? matchIndex : defaultIndex;
  return runSwitchCasesFrom(cases, startIndex, caseContext, labelSet, EMPTY);
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
 * Evaluates a `TryStatement` node, implementing ES2015 §13.15.8 runtime
 * semantics for all three forms: `try/catch`, `try/finally`, and
 * `try/catch/finally`.
 *
 * `node.block`, `node.handler.body`, and `node.finalizer` are each a `Block`,
 * so each is evaluated through the block path (`evaluateBlock`) and gets its
 * own lexical environment when it declares something — a `let` in the try body
 * is not visible in the catch or finally body, and each may re-declare the same
 * name without collision. The catch clause additionally installs its own
 * declarative environment for the catch *parameter* (§13.15.7), which stays
 * outside the handler `Block`'s own environment, so the parameter shadows any
 * outer binding of the same name and then disappears. Its VariableEnvironment
 * is unchanged (the spread keeps `context.variableEnv`), so a direct
 * `eval("var x")` in the catch body still hoists `x` into the enclosing
 * function or global scope rather than into the vanishing catch scope.
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
    () => evaluateBlock(node.block, context),
    context.realm,
  );

  // Run the catch clause when there is one and the try block threw.
  if (node.handler !== null) {
    if (blockCompletion.type === 'throw') {
      const catchEnv = newDeclarativeEnvironment(context.env);
      // ES2015 Annex B.3.5: mark this record so a non-strict direct `eval` in
      // the catch body may hoist a `var` of the catch parameter's name without
      // a redeclaration SyntaxError (see `hasEvalChainLexicalBinding`).
      catchEnv.isCatchClauseEnvironment = true;
      const paramName = node.handler.param.name;
      catchEnv.createMutableBinding(paramName);
      catchEnv.initializeBinding(paramName, blockCompletion.value);

      const catchContext = { ...context, env: catchEnv };

      blockCompletion = runToCompletion(
        () => evaluateBlock(node.handler.body, catchContext),
        context.realm,
      );
    }
  }

  // Run the finally block (if any), in the original environment.
  if (node.finalizer !== null) {
    const finallyCompletion = runToCompletion(
      () => evaluateBlock(node.finalizer, context),
      context.realm,
    );

    if (finallyCompletion.type !== 'normal') {
      return finallyCompletion;
    }
  }

  return blockCompletion;
}
