/**
 * The `eval` global function (ECMA-262 15.1.2.1).
 *
 * This is the one builtin permitted to import the evaluator: `eval` *is* the
 * evaluator exposed to guest code, so importing `src/evaluator/eval.js` here
 * is a deliberate, documented exception to the "builtins never import the
 * evaluator" layering rule. The dependency chain `runtime/realm.js ->
 * builtins/global-eval.js -> evaluator/eval.js -> {parser.js, evaluator/*,
 * runtime/*}` stays acyclic because nothing under `src/evaluator/` imports
 * `runtime/realm.js` at runtime.
 *
 * The structure mirrors the other "global function family" builtins
 * (`global-numeric.js`, `global-uri.js`): a `createEvalGlobalIntrinsics(realm)`
 * that builds the realm-local function object and an
 * `installEvalGlobal(globalObject, intrinsics)` that publishes it with the
 * standard 15.1 attributes.
 */

import { performEval } from '../evaluator/eval.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 * @typedef {import('../runtime/object.js').EngineObject} EngineObject
 * @typedef {import('./shared.js').NativeFunction} NativeFunction
 *
 * @typedef {{
 *   evalFunction: NativeFunction,
 * }} EvalGlobalIntrinsics
 */

/**
 * Builds this realm's `eval` function.
 *
 * The function object carries no `[[Construct]]`, so `new eval(...)` throws a
 * `TypeError` and it exposes no `prototype` property — matching the other
 * native globals. Every call reaching this `call` hook is an *indirect* eval
 * (a direct `eval(...)` is intercepted in `evaluateCallExpression` before the
 * call protocol runs), so the code is evaluated against *this realm's* global
 * environment with `this` bound to the global object and caller strictness
 * not inherited (10.4.2 indirect case), regardless of which realm's code made
 * the call.
 *
 * @param {Realm} realm
 * @returns {EvalGlobalIntrinsics}
 */
export function createEvalGlobalIntrinsics(realm) {
  const evalFunction = realm.createNativeFunction({
    name: 'eval',
    length: 1,
    call(_thisValue, args, functionObject) {
      const owningRealm = functionObject.realm;

      return performEval(args[0], {
        realm: owningRealm,
        env: owningRealm.globalEnvironment,
        variableEnv: owningRealm.globalEnvironment,
        strict: false,
        thisValue: owningRealm.globalObject,
      });
    },
  });

  return { evalFunction };
}

/**
 * Publishes `eval` on the global object with ES5 15.1's standard attributes
 * for a global function property (`{ writable: true, enumerable: false,
 * configurable: true }`).
 *
 * @param {EngineObject} globalObject
 * @param {EvalGlobalIntrinsics} intrinsics
 * @returns {void}
 */
export function installEvalGlobal(globalObject, intrinsics) {
  globalObject.defineOwnProperty('eval', {
    value: intrinsics.evalFunction,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
