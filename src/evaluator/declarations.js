import {
  getIdentifierReference,
  newDeclarativeEnvironment,
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

/**
 * @typedef {import('./index.js').EvaluationContext} EvaluationContext
 */

/**
 * Performs (a deliberately ES5-only slice of) Global Declaration
 * Instantiation: walks the program body for every function and `var`
 * declaration reachable without crossing a function boundary and creates a
 * mutable, non-configurable global binding for each name. Function
 * declarations are instantiated first and bound to their function object;
 * `var` names are created afterwards and initialized to `undefined` only
 * when no binding of that name exists yet, so `var f;` never clobbers a
 * `function f() {}` of the same name (ECMA-262 10.5 steps 5 and 8).
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

  /** @type {Set<string>} */
  const varNames = new Set();
  /** @type {any[]} */
  const functionDeclarations = [];

  for (const statement of program.body) {
    collectVarNames(statement, varNames);
    collectFunctionDeclarations(statement, functionDeclarations);
  }

  for (const declaration of functionDeclarations) {
    const functionObject = instantiateFunctionObject(declaration, context);
    const name = declaration.id.name;
    globalEnvironment.createGlobalVarBinding(name, false);
    globalEnvironment.setMutableBinding(name, functionObject, false);
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

  /** @type {Set<string>} */
  const varNames = new Set();
  /** @type {any[]} */
  const functionDeclarations = [];

  for (const statement of functionNode.body.body) {
    collectVarNames(statement, varNames);
    collectFunctionDeclarations(statement, functionDeclarations);
  }

  for (const declaration of functionDeclarations) {
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
 * Shared "Creating Function Objects" path (ECMA-262 13.2) for function
 * declarations and function expressions.
 *
 * @param {any} node
 * @param {import('../runtime/environment.js').EnvironmentRecordLike} scope
 * @param {EvaluationContext} context
 * @returns {EngineFunction}
 */
export function createFunctionObject(node, scope, context) {
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

  return new EngineFunction({
    realm: context.realm,
    parameterNames,
    scope,
    strict,
    execute: (functionObject, thisValue, args) =>
      executeFunctionBody(node, functionObject, thisValue, args),
  });
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
    strict: functionObject.strict,
    thisValue,
  };

  functionDeclarationInstantiation(node, functionObject, args, context);

  return evaluateStatementList(node.body.body, context);
}

/**
 * Recursively collects `var`-declared names from `node`, descending into
 * every ES5 statement form that shares its enclosing variable scope
 * (blocks, `if` branches, loop bodies, and a `for` loop's own
 * initializer). Any other node type — including statement forms the
 * evaluator does not support yet, and function boundaries — is left alone:
 * it is not a var-hoisting container, so no names are collected and no
 * descent happens. A `FunctionDeclaration` therefore stops the walk, which
 * is exactly the function-boundary behavior var hoisting requires.
 *
 * @param {any} node
 * @param {Set<string>} names
 * @returns {void}
 */
function collectVarNames(node, names) {
  switch (node.type) {
    case 'VariableDeclaration':
      for (const declarator of node.declarations) {
        names.add(declarator.id.name);
      }
      return;
    case 'BlockStatement':
      for (const statement of node.body) {
        collectVarNames(statement, names);
      }
      return;
    case 'IfStatement':
      collectVarNames(node.consequent, names);
      if (node.alternate) {
        collectVarNames(node.alternate, names);
      }
      return;
    case 'WhileStatement':
    case 'DoWhileStatement':
      collectVarNames(node.body, names);
      return;
    case 'ForStatement':
      if (node.init && node.init.type === 'VariableDeclaration') {
        collectVarNames(node.init, names);
      }
      collectVarNames(node.body, names);
      return;
    case 'TryStatement':
      collectVarNames(node.block, names);
      if (node.handler !== null) {
        collectVarNames(node.handler.body, names);
      }
      if (node.finalizer !== null) {
        collectVarNames(node.finalizer, names);
      }
      return;
    case 'SwitchStatement':
      for (const switchCase of node.cases) {
        for (const statement of switchCase.consequent) {
          collectVarNames(statement, names);
        }
      }
      return;
    case 'LabeledStatement':
      collectVarNames(node.body, names);
      return;
    default:
      return;
  }
}

/**
 * Recursively collects `FunctionDeclaration` nodes that hoist into the
 * enclosing variable scope, using the same scope-sharing statement forms
 * `collectVarNames` walks and stopping at nested function boundaries.
 *
 * ES5's grammar only allows function declarations as source elements
 * (directly in a program or function body), but the parser accepts the
 * block-nested form, so descending through those containers keeps
 * `{ function f() {} } f();` working instead of leaving `f` unbound.
 *
 * This is a deliberate simplification rather than Annex B compatibility:
 * a real engine creates the var-scoped binding during instantiation but
 * only assigns the function object when the declaration is actually
 * evaluated, so `if (false) { function f() {} } typeof f` is
 * `'undefined'` there and `'function'` here. Matching that needs a
 * block-scoped binding for the declaration, which arrives with block
 * scoping in a later task.
 *
 * @param {any} node
 * @param {any[]} declarations
 * @returns {void}
 */
function collectFunctionDeclarations(node, declarations) {
  switch (node.type) {
    case 'FunctionDeclaration':
      declarations.push(node);
      return;
    case 'BlockStatement':
      for (const statement of node.body) {
        collectFunctionDeclarations(statement, declarations);
      }
      return;
    case 'IfStatement':
      collectFunctionDeclarations(node.consequent, declarations);
      if (node.alternate) {
        collectFunctionDeclarations(node.alternate, declarations);
      }
      return;
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'ForStatement':
      collectFunctionDeclarations(node.body, declarations);
      return;
    case 'TryStatement':
      collectFunctionDeclarations(node.block, declarations);
      if (node.handler !== null) {
        collectFunctionDeclarations(node.handler.body, declarations);
      }
      if (node.finalizer !== null) {
        collectFunctionDeclarations(node.finalizer, declarations);
      }
      return;
    case 'SwitchStatement':
      for (const switchCase of node.cases) {
        for (const statement of switchCase.consequent) {
          collectFunctionDeclarations(statement, declarations);
        }
      }
      return;
    case 'LabeledStatement':
      collectFunctionDeclarations(node.body, declarations);
      return;
    default:
      return;
  }
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
      const value = evaluateExpressionValue(declarator.init, context);
      const reference = getIdentifierReference(
        context.env,
        declarator.id.name,
        context.strict,
      );
      putValue(reference, value);
    }
  }

  return createNormalCompletion(EMPTY);
}
