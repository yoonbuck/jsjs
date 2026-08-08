import {
  getIdentifierReference,
  newDeclarativeEnvironment,
  GlobalEnvironmentRecord,
} from '../runtime/environment.js';
import { putValue } from '../runtime/reference.js';
import { EMPTY, createNormalCompletion } from '../runtime/completion.js';
import {
  EngineFunction,
  createArgumentsObject,
} from '../runtime/function-object.js';
import { createUnsupportedNodeError } from '../runtime/errors.js';
import { evaluateExpressionValue } from './expressions.js';
import { evaluateStatementList } from './statements.js';
import { hasUseStrictDirective } from './directive.js';
import {
  topLevelVarDeclaredNames,
  topLevelVarScopedDeclarations,
} from './static-semantics.js';

/**
 * @typedef {import('./index.js').EvaluationContext} EvaluationContext
 */

/**
 * The kind of environment record that can serve as an eval code's *variable
 * environment*: the realm's global environment (indirect eval, or a direct
 * eval at global scope) or a declarative environment (a strict eval's fresh
 * scope, or a direct eval nested in a function). An object environment record
 * — the `with` case — is never a *variable* environment, so it is deliberately
 * excluded here and both binding helpers below can rely on `initializeBinding`.
 *
 * @typedef {import('../runtime/environment.js').DeclarativeEnvironmentRecord
 *   | import('../runtime/environment.js').GlobalEnvironmentRecord} EvalVariableEnvironment
 */

/**
 * Performs (a deliberately ES5-only slice of) Global Declaration
 * Instantiation (ECMA-262 10.5 with `configurableBindings = false`): walks the
 * program body for every function and `var` declaration reachable without
 * crossing a function boundary and creates a *non-configurable* global binding
 * for each name. Function declarations are instantiated first and bound to
 * their function object; `var` names are created afterwards and initialized to
 * `undefined` only when no binding of that name exists yet, so `var f;` never
 * clobbers a `function f() {}` of the same name (10.5 steps 5 and 8).
 *
 * The 10.5 global checks apply here just as they do to eval code (only the
 * `configurableBindings` differs): declaring a new global name on a
 * non-extensible global object throws a guest `TypeError`, a function
 * declaration redefines a configurable colliding property and takes the value
 * of a writable+enumerable non-configurable one, and any other
 * non-configurable collision (e.g. `function undefined() {}`) throws.
 *
 * This must run before the program's statement list is evaluated so
 * identifier references and hoisted reads/calls see the binding even
 * before its declaration statement executes.
 *
 * @param {any} program
 * @param {EvaluationContext} context
 * @returns {void}
 */
export function globalDeclarationInstantiation(program, context) {
  const globalEnvironment = context.realm.globalEnvironment;

  const varScoped = topLevelVarScopedDeclarations(program.body);
  const varNames = new Set(topLevelVarDeclaredNames(program.body));

  for (const declaration of varScoped) {
    if (declaration.type !== 'FunctionDeclaration') {
      continue;
    }

    const functionObject = instantiateFunctionObject(declaration, context);
    globalEnvironment.createGlobalFunctionBinding(
      declaration.id.name,
      functionObject,
      false,
    );
  }

  for (const name of varNames) {
    globalEnvironment.createGlobalVarBinding(name, false);
  }
}

/**
 * Performs the per-call half of declaration instantiation (ECMA-262 10.5)
 * inside an already-created activation environment: binds formal
 * parameters to their arguments, instantiates the body's function
 * declarations, and creates `undefined`-initialized bindings for the
 * body's `var` names that nothing has claimed yet.
 *
 * @param {any} functionNode
 * @param {import('../runtime/function-object.js').EngineFunction} functionObject
 * @param {readonly unknown[]} args
 * @param {EvaluationContext} context
 * @returns {void}
 */
export function functionDeclarationInstantiation(
  functionNode,
  functionObject,
  args,
  context,
) {
  const env =
    /** @type {import('../runtime/environment.js').DeclarativeEnvironmentRecord} */ (
      context.env
    );
  const parameterNames = functionObject.parameterNames;

  for (let index = 0; index < parameterNames.length; index += 1) {
    const name = parameterNames[index];

    if (!env.hasBinding(name)) {
      env.createMutableBinding(name, false);
    }

    env.initializeBinding(name, index < args.length ? args[index] : undefined);
  }

  const varScoped = topLevelVarScopedDeclarations(functionNode.body.body);
  const varNames = new Set(topLevelVarDeclaredNames(functionNode.body.body));

  for (const declaration of varScoped) {
    if (declaration.type !== 'FunctionDeclaration') {
      continue;
    }

    const name = declaration.id.name;
    const nested = instantiateFunctionObject(declaration, context);

    if (!env.hasBinding(name)) {
      env.createMutableBinding(name, false);
    }

    env.initializeBinding(name, nested);
  }

  if (!env.hasBinding('arguments')) {
    env.createMutableBinding('arguments', false);
    env.initializeBinding(
      'arguments',
      createArgumentsObject(functionObject, args, env),
    );
  }

  for (const name of varNames) {
    if (!env.hasBinding(name)) {
      env.createMutableBinding(name, false);
      env.initializeBinding(name, undefined);
    }
  }
}

/**
 * Performs Declaration Binding Instantiation for *eval code* (ECMA-262 10.5
 * with `configurableBindings = true`). Function declarations are instantiated
 * before `var` names, exactly as the global and per-call paths do, but every
 * binding eval creates is *configurable/deletable*: `eval("var x = 1")`
 * followed by `delete x` succeeds, where a script-level `var x` is
 * non-deletable.
 *
 * The bindings are created in `variableEnv`, which is chosen by the caller in
 * `src/evaluator/eval.js` per 10.4.2: the caller's variable environment for a
 * direct eval (so the bindings outlive the eval call and are visible to the
 * caller — including when the direct eval sits inside a `catch`, whose lexical
 * scope is *not* the variable environment), the realm's global environment for
 * an indirect eval, or a fresh declarative environment for strict eval (so
 * nothing leaks). Hoisted function objects capture `variableEnv` as their
 * `[[Scope]]` (ES5 §13 uses the running context's VariableEnvironment), so a
 * function declared by a `catch`-nested eval closes over the enclosing
 * function rather than the catch scope. No `arguments` object is created for
 * eval code.
 *
 * @param {any} program
 * @param {EvaluationContext} context
 * @param {EvalVariableEnvironment} variableEnv
 * @returns {void}
 */
export function evalDeclarationInstantiation(program, context, variableEnv) {
  const varScoped = topLevelVarScopedDeclarations(program.body);
  const varNames = new Set(topLevelVarDeclaredNames(program.body));

  for (const declaration of varScoped) {
    if (declaration.type !== 'FunctionDeclaration') {
      continue;
    }

    const functionObject = createFunctionObject(
      declaration,
      variableEnv,
      context,
    );
    defineEvalFunctionBinding(variableEnv, declaration.id.name, functionObject);
  }

  for (const name of varNames) {
    ensureEvalVarBinding(variableEnv, name);
  }
}

/**
 * Instantiates a hoisted function declaration into an eval code's variable
 * environment as a configurable binding, then binds it to `functionObject`.
 * The global environment applies the ES5.1 10.5 step 5 redefinition/TypeError
 * rules (via `createGlobalFunctionBinding`); a declarative environment (a
 * direct eval inside a function, or a strict eval's fresh scope) creates a
 * deletable mutable binding.
 *
 * @param {EvalVariableEnvironment} variableEnv
 * @param {string} name
 * @param {EngineFunction} functionObject
 * @returns {void}
 */
function defineEvalFunctionBinding(variableEnv, name, functionObject) {
  if (variableEnv instanceof GlobalEnvironmentRecord) {
    variableEnv.createGlobalFunctionBinding(name, functionObject, true);
    return;
  }

  if (!variableEnv.hasBinding(name)) {
    variableEnv.createMutableBinding(name, true);
    variableEnv.initializeBinding(name, functionObject);
    return;
  }

  variableEnv.setMutableBinding(name, functionObject, false);
}

/**
 * Creates a configurable, `undefined`-initialized `var` binding for `name` in
 * an eval code's variable environment, leaving any existing binding of the
 * same name untouched (ECMA-262 10.5 step 8).
 *
 * @param {EvalVariableEnvironment} variableEnv
 * @param {string} name
 * @returns {void}
 */
function ensureEvalVarBinding(variableEnv, name) {
  if (variableEnv instanceof GlobalEnvironmentRecord) {
    variableEnv.createGlobalVarBinding(name, true);
    return;
  }

  if (!variableEnv.hasBinding(name)) {
    variableEnv.createMutableBinding(name, true);
    variableEnv.initializeBinding(name, undefined);
  }
}

/**
 * Creates the function object for a `FunctionDeclaration`, capturing
 * `context.env` as its `[[Scope]]`.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {EngineFunction}
 */
export function instantiateFunctionObject(node, context) {
  return createFunctionObject(node, context.env, context);
}

/**
 * @typedef {{
 *   name?: string,
 *   isMethod?: boolean,
 *   homeObject?: import('../runtime/object.js').EngineObject,
 * }} CreateFunctionObjectOptions
 */

/**
 * ECMA-262's `IsAnonymousFunctionDefinition`, restricted to the one AST shape
 * this ES5-syntax engine can produce it for: a `FunctionExpression` with no
 * `id`. (Arrow functions and class expressions, the grammar's other two
 * anonymous-definition shapes, are not implemented yet — see issue #25.)
 *
 * @param {any} node
 * @returns {boolean}
 */
export function isAnonymousFunctionExpression(node) {
  return node.type === 'FunctionExpression' && !node.id;
}

/**
 * @param {any} node
 * @param {import('../runtime/environment.js').EnvironmentRecordLike} scope
 * @param {EvaluationContext} context
 * @param {CreateFunctionObjectOptions} [options={}]
 * @returns {EngineFunction}
 */
export function createFunctionObject(node, scope, context, options = {}) {
  /** @type {string[]} */
  const parameterNames = [];

  for (const parameter of node.params) {
    if (parameter.type !== 'Identifier') {
      // ES5 formal parameters are always plain identifiers; anything else
      // (destructuring, defaults, rest) is a later-edition form this
      // engine does not implement.
      throw createUnsupportedNodeError(parameter);
    }

    parameterNames.push(parameter.name);
  }

  // A function is strict when its enclosing scope is already strict OR when
  // the function's own body opens with a "use strict" directive prologue
  // (ECMA-262 10.1.1 — "once strict, always strict" applies transitively).
  const strict = context.strict || hasUseStrictDirective(node.body.body);
  const name = options.name ?? (node.id ? node.id.name : '');

  const functionObject = new EngineFunction({
    realm: context.realm,
    parameterNames,
    scope,
    strict,
    name,
    isMethod: options.isMethod ?? false,
    execute: (functionObject, thisValue, args) =>
      executeFunctionBody(node, functionObject, thisValue, args),
  });

  if (options.homeObject !== undefined) {
    functionObject.homeObject = options.homeObject;
  }

  return functionObject;
}

/**
 * Runs a function body in a fresh activation environment whose outer
 * environment is the function's captured `[[Scope]]`, so closures observe
 * the environment their function was created in rather than the caller's.
 *
 * @param {any} node
 * @param {EngineFunction} functionObject
 * @param {unknown} thisValue
 * @param {readonly unknown[]} args
 * @returns {{ type: string, value: unknown }}
 */
function executeFunctionBody(node, functionObject, thisValue, args) {
  const env = newDeclarativeEnvironment(functionObject.scope);
  /** @type {EvaluationContext} */
  const context = {
    realm: functionObject.realm,
    env,
    variableEnv: env,
    strict: functionObject.strict,
    thisValue,
    homeObject: functionObject.homeObject,
  };

  functionDeclarationInstantiation(node, functionObject, args, context);

  return evaluateStatementList(node.body.body, context);
}

/**
 * Executes a `var` declaration's initializers, assigning each declarator
 * with an `init` expression to its (already-hoisted) binding. A
 * `VariableDeclaration`'s own completion value is always `EMPTY`
 * (ECMA-262 12.2), so callers combining it into a statement list see the
 * previous statement's value carried forward via `updateEmpty`.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {{ type: 'normal', value: unknown }}
 */
export function evaluateVariableDeclaration(node, context) {
  for (const declarator of node.declarations) {
    if (declarator.init) {
      // ES5.1 §12.2.1: evaluate the Identifier to a Reference *before* the
      // Initialiser, so a `with`-bound target captured here survives a
      // property the initializer deletes and PutValue writes back through it.
      const reference = getIdentifierReference(
        context.env,
        declarator.id.name,
        context.strict,
      );
      const value = isAnonymousFunctionExpression(declarator.init)
        ? createFunctionObject(declarator.init, context.env, context, {
            name: declarator.id.name,
          })
        : evaluateExpressionValue(declarator.init, context);
      putValue(reference, value);
    }
  }

  return createNormalCompletion(EMPTY);
}
