/**
 * The `eval` execution-context implementation (ECMA-262 15.1.2.1 "eval (x)"
 * and 10.4.2 "Entering Eval Code").
 *
 * `eval` *is* the evaluator exposed to guest code, so this module is the one
 * place under `src/evaluator/` that a builtin (`src/builtins/global-eval.js`)
 * is permitted to import: the layering is `runtime/realm.js ->
 * builtins/global-eval.js -> evaluator/eval.js -> {parser.js, evaluator/*,
 * runtime/*}`. That `runtime -> builtins -> evaluator` chain stays acyclic:
 * nothing this module reaches imports `runtime/realm.js` or
 * `builtins/global-eval.js` at runtime (the realm arrives inside the execution
 * context; only its JSDoc type is referenced), so no cycle crosses the
 * realm/builtins boundary.
 *
 * Within `src/evaluator/`, this module joins the pre-existing import cycle
 * `expressions.js <-> declarations.js <-> statements.js` (each already imports
 * the others; it predates `eval`, see commit c1875bc). `evaluateCallExpression`
 * now also imports `performEval` from here, and this module imports
 * `statements.js`/`declarations.js`, so `expressions -> eval -> statements ->
 * expressions` is another loop through that same intra-evaluator strongly
 * connected component. It is safe for the same reason the existing loops are:
 * every edge is a function reference used only at call time, never at module
 * evaluation time, so ES module live bindings resolve before any of them runs.
 *
 * Direct and indirect eval share this one implementation and differ only in
 * the execution context handed to `performEval`:
 *
 * - **Direct** eval (`evaluateCallExpression` detected a bareword `eval(...)`
 *   resolving to this realm's `eval`) passes the *caller's* context, so eval
 *   code runs with the caller's LexicalEnvironment/VariableEnvironment, the
 *   caller's `this`, and the caller's strictness inherited (10.4.2 direct
 *   case).
 * - **Indirect** eval (any other call form) runs through the native `eval`
 *   function, which passes a context rooted at the realm's global environment
 *   with `this` = the global object and `strict` = false, so caller
 *   strictness is not inherited (10.4.2 indirect case).
 *
 * This engine threads ES5's two environments as separate context fields —
 * `env` (LexicalEnvironment) and `variableEnv` (VariableEnvironment). They are
 * equal on entering eval code in the ordinary case, but a direct eval nested
 * in a `catch` clause (and, once Task 3 lands, a `with` statement) inherits a
 * caller whose lexical scope is the catch/with scope while its variable scope
 * is still the enclosing function or global. `performEval` therefore parses
 * and evaluates the body against the caller's LexicalEnvironment but hoists the
 * body's `var`s and function declarations into the caller's VariableEnvironment
 * (10.4.2 direct case), so a `catch`-nested `eval("var x")` creates `x` in the
 * enclosing function — where it is still visible after the clause exits —
 * rather than in the vanishing catch scope. Strict eval instead runs in a
 * single fresh declarative environment used as both, so nothing leaks
 * (10.4.2.1).
 */

import { parseEval } from '../parser.js';
import { newDeclarativeEnvironment } from '../runtime/environment.js';
import { EMPTY, GuestErrorSignal, ThrowSignal } from '../runtime/completion.js';
import { hasUseStrictDirective } from './directive.js';
import { evaluateStatementList } from './statements.js';
import { evalDeclarationInstantiation } from './declarations.js';

/**
 * @typedef {import('./index.js').EvaluationContext} EvaluationContext
 */

/**
 * Implements ECMA-262 15.1.2.1 `eval(x)` layered over 10.4.2/10.4.2.1.
 *
 * A non-String `x` is returned unchanged with no coercion (step 1). A String
 * `x` is parsed as a `Program`; a parse failure becomes a realm-local guest
 * `SyntaxError` (raised as a `GuestErrorSignal` the nearest realm-aware
 * boundary materializes). The program body is then evaluated as eval code and
 * its completion value returned: a normal completion carrying a value yields
 * that value, an empty normal completion yields `undefined`, and a throw
 * completion is re-raised as a `ThrowSignal` so it keeps propagating to guest
 * `try`/`catch` or the calling function — eval runs *inside* guest code, so a
 * guest throw must not be converted into a completion record here.
 *
 * @param {unknown} x
 * @param {EvaluationContext} callerContext The direct-eval caller's context,
 *   or the indirect global context the native `eval` builds.
 * @returns {unknown}
 */
export function performEval(x, callerContext) {
  if (typeof x !== 'string') {
    return x;
  }

  const realm = callerContext.realm;
  const inheritedStrict = callerContext.strict === true;

  let program;

  try {
    program = parseEval(x, inheritedStrict);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new GuestErrorSignal('SyntaxError', error.message);
    }

    throw error;
  }

  // Strict when strictness is inherited (direct call from strict code) or the
  // eval code opens with its own "use strict" directive (10.4.2.1).
  const strict = inheritedStrict || hasUseStrictDirective(program.body);

  // 10.4.2 / 10.4.2.1 environment set-up. Non-strict eval keeps the caller's
  // LexicalEnvironment for identifier resolution but hoists declarations into
  // the caller's VariableEnvironment (which differs from the lexical one when
  // the direct eval sits inside a `catch`). Strict eval runs in one fresh
  // declarative environment used as both, so its `var`s and functions never
  // leak to the surrounding scope.
  const lexicalEnv = strict
    ? newDeclarativeEnvironment(callerContext.env)
    : callerContext.env;
  const variableEnvBase = strict ? lexicalEnv : callerContext.variableEnv;

  // The variable environment is always a declarative or global environment
  // record: eval's *variable* environment is never a `with` object environment
  // record (a `with` contributes only a lexical scope), so this narrowing is
  // sound for every eval the engine can reach.
  const variableEnv =
    /** @type {import('./declarations.js').EvalVariableEnvironment} */ (
      variableEnvBase
    );

  /** @type {EvaluationContext} */
  const evalContext = {
    realm,
    env: lexicalEnv,
    variableEnv,
    strict,
    thisValue: callerContext.thisValue,
  };

  evalDeclarationInstantiation(program, evalContext, variableEnv);

  const completion = evaluateStatementList(program.body, evalContext);

  if (completion.type === 'throw') {
    throw new ThrowSignal(completion.value);
  }

  return completion.value === EMPTY ? undefined : completion.value;
}
