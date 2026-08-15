import { EXPRESSION_TYPES, evaluateExpressionValue } from './expressions.js';
import { STATEMENT_TYPES, evaluateStatement } from './statements.js';
import { createUnsupportedNodeError } from '../runtime/errors.js';

/**
 * The running execution context the evaluator threads through every node.
 *
 * `env` is the LexicalEnvironment (identifier resolution) and `variableEnv`
 * is the VariableEnvironment (where `var`/function declarations hoist to).
 * ES5 keeps them equal on entering global, function, and eval code, so almost
 * everywhere `variableEnv === env`; they diverge wherever a construct installs
 * a fresh *lexical* scope over an unchanged variable scope — a `catch` clause,
 * a `with` statement, and now every `Block`, `switch` `CaseBlock`, and `try`
 * part that declares something lexically (ES2015 block scoping). Tracking both
 * is what lets a direct `eval("var x")` inside such a scope hoist `x` into the
 * enclosing function (or global) variable environment rather than into the
 * lexical scope that vanishes when the construct exits (ECMA-262 10.4.2 / 10.5).
 *
 * `annexBFunctionDeclarations`, when present, is the set of block-level
 * `FunctionDeclaration` *nodes* that non-strict declaration instantiation gave a
 * var-scoped alias (ES2015 Annex B.3.3); it threads unchanged into every nested
 * block of the same var scope so `evaluateFunctionDeclaration` can copy each
 * eligible function's value across in source order. Membership is by node
 * identity, not name, so two same-name block functions that differ in
 * eligibility are told apart. It is absent in strict code and where no such
 * alias exists.
 *
 * @typedef {{
 *   realm: import('../runtime/realm.js').Realm,
 *   env: import('../runtime/environment.js').EnvironmentRecordLike,
 *   variableEnv: import('../runtime/environment.js').EnvironmentRecordLike,
 *   strict: boolean,
 *   thisValue: unknown,
 *   functionEnvironment?: import('../runtime/environment.js').FunctionExecutionEnvironment,
 *   annexBFunctionDeclarations?: Set<any>,
 *   generatorYieldClassification?: WeakMap<object, boolean>,
 * }} EvaluationContext
 */

/**
 * Dispatches a single AST node by type. Statement nodes return an explicit
 * completion record (`{ type: 'normal' | 'break' | 'continue' | 'return' |
 * 'throw', value, target? }`); expression nodes return their dereferenced
 * runtime value directly.
 *
 * Routing is driven by the two dispatch tables the evaluator modules
 * export, so a node type belongs to exactly one evaluator and an
 * unrecognized type is rejected here rather than being forwarded to the
 * expression evaluator on the assumption that anything which is not a
 * statement must be an expression. Node types this milestone does not
 * implement yet throw `UnsupportedNodeError` rather than silently falling
 * through to host behavior.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
export function evaluate(node, context) {
  if (!node || typeof node.type !== 'string') {
    throw new TypeError('Expected an AST node with a string type');
  }

  if (STATEMENT_TYPES.has(node.type)) {
    return evaluateStatement(node, context);
  }

  if (EXPRESSION_TYPES.has(node.type)) {
    return evaluateExpressionValue(node, context);
  }

  throw createUnsupportedNodeError(node);
}
