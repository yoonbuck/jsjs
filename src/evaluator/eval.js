/**
 * The `eval` execution-context implementation (ECMA-262 15.1.2.1 "eval (x)"
 * and 10.4.2 "Entering Eval Code").
 *
 * `eval` *is* the evaluator exposed to guest code, so this module is the one
 * place under `src/evaluator/` that a builtin (`src/builtins/global-eval.js`)
 * is permitted to import: the layering is `runtime/realm.js ->
 * builtins/global-eval.js -> evaluator/eval.js -> {parser.js, evaluator/*,
 * runtime/*}`, kept acyclic because nothing here imports `runtime/realm.js`
 * at runtime (the realm arrives inside the execution context; only its JSDoc
 * type is referenced).
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
 * This engine collapses ES5's separate LexicalEnvironment and
 * VariableEnvironment into the single `context.env`. That is sufficient for
 * every eval case: at eval entry the two are equal (10.4.2 sets them to the
 * same environment, and 10.4.2.1 replaces both with one fresh declarative
 * environment for strict eval). `performEval` therefore threads a single
 * explicit `variableEnv` local — equal to the lexical environment it also
 * evaluates the body in — into `evalDeclarationInstantiation`, rather than
 * adding a VariableEnvironment field to the context. The only place ES5 keeps
 * the two distinct is a direct eval nested in a `with`/`catch` block, which
 * this engine does not model yet (`with` is a later task; a `catch` clause
 * threads only a lexical env), so such an eval hoists its `var`s into the
 * lexical env — a pre-existing, documented limitation, not a regression.
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

  // 10.4.2.1: strict eval evaluates in a fresh declarative environment that
  // is both its lexical and its variable environment, so its `var`s and
  // function declarations do not leak to the surrounding scope.
  const lexicalEnv = strict
    ? newDeclarativeEnvironment(callerContext.env)
    : callerContext.env;

  // The variable environment equals the lexical environment at eval entry
  // (10.4.2 / 10.4.2.1). It is always a declarative or global environment
  // record: eval's *variable* environment is never a `with` object
  // environment record (and `with` is unimplemented today), so this narrowing
  // is sound for every eval the engine can reach.
  const variableEnv =
    /** @type {import('./declarations.js').EvalVariableEnvironment} */ (
      lexicalEnv
    );

  /** @type {EvaluationContext} */
  const evalContext = {
    realm,
    env: lexicalEnv,
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
