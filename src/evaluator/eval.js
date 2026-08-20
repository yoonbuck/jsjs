/**
 * The `eval` implementation (ECMA-262 2015 §18.2.1 "eval (x)", layered over
 * §18.2.1.1 `PerformEval` and §18.2.1.2 `EvalDeclarationInstantiation`).
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
 *   code runs over the caller's LexicalEnvironment, hoists into the caller's
 *   VariableEnvironment, and inherits the caller's `this` and strictness
 *   (ES2015 §18.2.1.1 `PerformEval`, `direct` true).
 * - **Indirect** eval (any other call form) runs through the native `eval`
 *   function, which passes a context rooted at the realm's global environment
 *   with `this` = the global object and `strict` = false, so caller strictness
 *   is not inherited (`PerformEval`, `direct` false).
 *
 * Environment set-up (ES2015 §18.2.1.1 steps 12-14). `performEval` need not
 * branch on direct/indirect: it always builds `lexEnv` as a *fresh*
 * `NewDeclarativeEnvironment(callerContext.env)` and takes `varEnv` from
 * `callerContext.variableEnv`. For a direct eval the caller's context carries
 * the caller's own two environments; for an indirect eval `global-eval.js`
 * already seeds both fields with the realm's global environment, so the same
 * two lines produce `NewDeclarativeEnvironment(realm.[[globalEnv]])` over the
 * global `varEnv` the spec's indirect branch asks for — the global-rooted seam
 * stays in `global-eval.js` rather than being reconstructed here.
 *
 * The engine threads the two environments as separate context fields — `env`
 * (LexicalEnvironment) and `variableEnv` (VariableEnvironment). The fresh
 * `lexEnv` is where the eval body's `let`/`const` declarations are
 * instantiated (`EvalDeclarationInstantiation`, §18.2.1.2), so they are visible
 * to the eval body through the outer chain but discarded when the call returns
 * and never leak to the caller. The body's `var`s and function declarations
 * still hoist into `varEnv`, so a direct `eval("var x")` nested in a `catch`,
 * `with`, or `let`-declaring block creates `x` in the enclosing function or
 * global scope — where it survives the inner scope's exit — rather than in the
 * vanishing lexical scope. When the eval is strict (§18.2.1.1 step 14) `varEnv`
 * is `lexEnv`, so a strict eval runs in one fresh declarative environment used
 * as both and nothing it declares leaks.
 */

import { parseEval } from '../parser.js';
import {
  createFunctionExecutionEnvironment,
  newDeclarativeEnvironment,
} from '../runtime/environment.js';
import { EMPTY, GuestErrorSignal, ThrowSignal } from '../runtime/completion.js';
import { hasUseStrictDirective } from './directive.js';
import { evaluateStatementList } from './statements.js';
import { evalDeclarationInstantiation } from './declarations.js';

/**
 * @typedef {import('./index.js').EvaluationContext} EvaluationContext
 */

/**
 * Implements ECMA-262 2015 §18.2.1 `eval(x)` layered over §18.2.1.1
 * `PerformEval`.
 *
 * A non-String `x` is returned unchanged with no coercion (step 2). A String
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
    program = parseEval(x, inheritedStrict, {
      superAllowed: callerContext.functionEnvironment?.homeObject !== undefined,
      superCallAllowed:
        callerContext.functionEnvironment?.activeConstructor !== undefined,
      newTargetAllowed:
        callerContext.functionEnvironment?.newTargetStatus === 'present',
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new GuestErrorSignal('SyntaxError', error.message);
    }

    throw error;
  }

  // §18.2.1.1 steps 10-11: strict when strictness is inherited (direct call
  // from strict code) or the eval code opens with its own "use strict"
  // directive.
  const strict = inheritedStrict || hasUseStrictDirective(program.body);

  // §18.2.1.1 steps 12-14 environment set-up. The eval always runs in a *fresh*
  // LexicalEnvironment over the caller's, so its `let`/`const` stay in
  // the eval and never leak; identifier resolution still reaches the caller's
  // bindings through that fresh environment's outer reference. `var`s and
  // functions hoist into the caller's VariableEnvironment (the caller's
  // *variable* scope, which differs from its lexical scope when the direct eval
  // sits inside a `catch`, `with`, or `let`-declaring block). For an indirect
  // eval `global-eval.js` seeds both context fields with the realm's global
  // environment, so this same code yields a global-rooted `lexEnv`/`varEnv`
  // without reconstructing the seam here. A strict eval uses `lexEnv` as its
  // variable environment too (step 14), so nothing it declares leaks.
  const lexicalEnv = newDeclarativeEnvironment(callerContext.env);
  const variableEnvBase = strict ? lexicalEnv : callerContext.variableEnv;
  const functionEnvironment =
    callerContext.functionEnvironment ??
    createFunctionExecutionEnvironment({
      thisStatus: 'initialized',
      thisValue: callerContext.thisValue,
      newTargetStatus: 'absent',
    });

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
    functionEnvironment,
  };

  evalDeclarationInstantiation(program, evalContext, variableEnv);

  const completion = evaluateStatementList(program.body, evalContext);

  if (completion.type === 'throw') {
    throw new ThrowSignal(completion.value);
  }

  return completion.value === EMPTY ? undefined : completion.value;
}
