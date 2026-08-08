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
import {
  createUnsupportedNodeError,
  createUnsupportedOperationError,
} from '../runtime/errors.js';
import { evaluateExpressionValue } from './expressions.js';
import { evaluateStatementList } from './statements.js';
import { hasUseStrictDirective } from './directive.js';
import {
  annexBBlockFunctionDeclarations,
  boundNames,
  isConstantDeclaration,
  topLevelLexicallyDeclaredNames,
  topLevelLexicallyScopedDeclarations,
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
 * Performs (a deliberately ES5-shaped slice of) Global Declaration
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
 * For non-strict scripts this also performs ES2015 Annex B.3.3.2's global slice:
 * a block-level function declaration whose name can legally be declared as a
 * global `var` gets an `undefined`-initialized global var binding here, and the
 * declaration node is recorded on `context.annexBFunctionDeclarations` so the
 * function's own evaluation copies its value into the global scope in source
 * order (see `evaluateFunctionDeclaration`, `./statements.js`). Script-level
 * `let`/`const`
 * bindings themselves are still not instantiated — the global environment's
 * declarative record fills in when Task 7 rewrites this function as §15.1.11.
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

  if (!context.strict) {
    const aliasDeclarations = annexBBlockFunctionDeclarations(
      program.body,
      new Set(topLevelLexicallyDeclaredNames(program.body)),
    );
    /** @type {Set<any>} */
    const aliased = new Set();

    for (const declaration of aliasDeclarations) {
      // B.3.3.2: only create the alias when the global var is declarable.
      // Eligibility is per declaration node, so an ineligible same-name
      // declaration elsewhere neither creates a binding nor joins `aliased`.
      if (globalEnvironment.canDeclareGlobalVar(declaration.id.name)) {
        globalEnvironment.createGlobalVarBinding(declaration.id.name, false);
        aliased.add(declaration);
      }
    }

    context.annexBFunctionDeclarations = aliased;
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
  // ES2015 §9.2.15: the activation bindings — parameters, `arguments`, the
  // body's `var` names, and its top-level function declarations — all live in
  // the *variable* environment. The nested function objects instantiated below
  // still capture `context.env` (the body's *lexical* environment) as their
  // `[[Scope]]` per step 33, so a sloppy function's hoisted inner function sees
  // the body's `let`/`const`. For strict code, and everywhere else this runs,
  // `context.env === context.variableEnv`, so this is unchanged there.
  const env =
    /** @type {import('../runtime/environment.js').DeclarativeEnvironmentRecord} */ (
      context.variableEnv
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

  if (!context.strict) {
    // ES2015 Annex B.3.3.1: a non-strict block-level function declaration also
    // gets an `undefined`-initialized var binding in the activation
    // environment when doing so raises no early error, so a later read of the
    // name outside the block sees `undefined` (or the function, once the block
    // executes and `evaluateFunctionDeclaration` copies it across). Eligibility
    // is per declaration node — recorded as an identity set so an ineligible
    // same-name declaration does not alias.
    const aliasDeclarations = annexBBlockFunctionDeclarations(
      functionNode.body.body,
      new Set(topLevelLexicallyDeclaredNames(functionNode.body.body)),
    );

    for (const declaration of aliasDeclarations) {
      const name = declaration.id.name;
      if (!env.hasBinding(name)) {
        env.createMutableBinding(name, false);
        env.initializeBinding(name, undefined);
      }
    }

    context.annexBFunctionDeclarations = new Set(aliasDeclarations);
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

  if (!context.strict) {
    // ES2015 Annex B.3.3.3: a non-strict eval's block-level function
    // declarations also get a configurable var alias in the eval's variable
    // environment. Eligibility is per declaration node, recorded as an identity
    // set so an ineligible same-name declaration does not alias.
    //
    // KNOWN DEFECT, DEFERRED TO TASK 8: B.3.3.3 step 1.a.ii also rejects a name
    // already lexically bound in the *running execution context's* lexical
    // environment chain between the eval and its variable environment. That
    // check needs the eval's own lexical environment, which does not exist
    // until Task 8 installs it (ES2015 §18.2.1.1 steps 12-14, `PerformEval`).
    // Until then `outerLexicalNames` sees only the eval body's own top-level
    // lexical names, not the caller's, so:
    //     { let f = 1; eval("{ function f(){} }"); } typeof f
    // wrongly yields "function" (the alias is created and copied) when it must
    // yield "undefined" (the caller's `let f` makes `var f` an early error, so
    // no alias). This cannot be fixed here without that lexical environment;
    // Task 8 owns the fix.
    const aliasDeclarations = annexBBlockFunctionDeclarations(
      program.body,
      new Set(topLevelLexicallyDeclaredNames(program.body)),
    );

    for (const declaration of aliasDeclarations) {
      ensureEvalVarBinding(variableEnv, declaration.id.name);
    }

    context.annexBFunctionDeclarations = new Set(aliasDeclarations);
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
 * Per ES2015 §9.2.15 the activation environment `varEnv` is the *variable*
 * environment — `functionDeclarationInstantiation` binds the parameters,
 * `arguments`, the body's `var` names, and its top-level function declarations
 * there, and a direct `eval("var …")` in the body hoists there too — while the
 * body's *lexical* environment `lexEnv` (holding its `let`/`const`) is layered
 * over it. The body statement list evaluates with `env: lexEnv` for identifier
 * resolution and `variableEnv: varEnv`; see the inline comments for why the
 * strict case shares one environment.
 *
 * @param {any} node
 * @param {EngineFunction} functionObject
 * @param {unknown} thisValue
 * @param {readonly unknown[]} args
 * @returns {{ type: string, value: unknown }}
 */
function executeFunctionBody(node, functionObject, thisValue, args) {
  const varEnv = newDeclarativeEnvironment(functionObject.scope);

  // ES2015 §9.2.15 steps 30-32: the body's lexical environment is `varEnv`
  // itself when the function is strict, or a fresh declarative environment over
  // it when it is not. Sharing one environment in the strict case is exactly
  // what step 31 specifies, and it is unobservable: the early errors that would
  // let the merge show through are raised at parse time — a formal parameter
  // cannot be redeclared as a body `let`/`const`, and a lexically declared name
  // cannot collide with a var-scoped one — so the two records' binding sets are
  // disjoint and whether they live in one record or two changes no lookup.
  const lexEnv = functionObject.strict
    ? varEnv
    : newDeclarativeEnvironment(varEnv);

  /** @type {EvaluationContext} */
  const context = {
    realm: functionObject.realm,
    // `env` is the lexical environment so nested function declarations
    // instantiated below capture it (§9.2.15 step 33); the activation bindings
    // still land in `variableEnv`.
    env: lexEnv,
    variableEnv: varEnv,
    strict: functionObject.strict,
    thisValue,
    homeObject: functionObject.homeObject,
  };

  functionDeclarationInstantiation(node, functionObject, args, context);

  // ES2015 §9.2.15 steps 33-34: instantiate the body's top-level
  // lexically-scoped declarations into `lexEnv` with the same rules a block
  // uses — `let`/`const` uninitialized (TDZ), function declarations created and
  // initialized eagerly.
  blockDeclarationInstantiation(
    topLevelLexicallyScopedDeclarations(node.body.body),
    lexEnv,
    context,
  );

  return evaluateStatementList(node.body.body, context);
}

/**
 * Executes a `VariableDeclaration`'s initializers. A `VariableDeclaration`'s
 * own completion value is always `EMPTY` (ECMA-262 12.2 / ES2015 §13.3.1.4),
 * so callers combining it into a statement list see the previous statement's
 * value carried forward via `updateEmpty`.
 *
 * `var` (ES5.1 §12.2.1) resolves each declarator's identifier to a Reference
 * and `PutValue`s the initializer into the already-hoisted binding, leaving a
 * declarator with no initializer untouched. `let`/`const` (ES2015 §13.3.1.4)
 * instead *initialize* the binding that `blockDeclarationInstantiation` (or a
 * later loop/function/global instantiation) already created uninitialized —
 * `InitializeReferencedBinding`, not `PutValue`, because assigning would trip
 * the temporal-dead-zone check on the binding's own initialization. A `let`
 * with no initializer initializes to `undefined`; a `const` always has one
 * (the parser enforces it).
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {{ type: 'normal', value: unknown }}
 */
export function evaluateVariableDeclaration(node, context) {
  if (node.kind === 'var') {
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

  for (const declarator of node.declarations) {
    const value = declarator.init
      ? evaluateExpressionValue(declarator.init, context)
      : undefined;

    // ES2015 §13.3.1.4 `InitializeReferencedBinding`: resolve the binding the
    // way `ResolveBinding` does (through the environment chain) and initialize
    // the record that holds it, lifting the name out of its TDZ.
    const reference = getIdentifierReference(
      context.env,
      declarator.id.name,
      context.strict,
    );

    if (reference.base === undefined) {
      // The binding should have been created uninitialized by the enclosing
      // scope's declaration instantiation. Reaching an unresolvable reference
      // here means the lexical declaration sits at a scope whose instantiation
      // does not yet create lexical bindings: the top level of a function body
      // (Task 6) or of global/eval code (Tasks 7 and 8). Block, `switch`, and
      // `try` lexicals — this task's scope — always resolve. Fail loudly with
      // an engine-level error rather than dereferencing `undefined`.
      throw createUnsupportedOperationError(
        `lexical declaration of '${declarator.id.name}' outside a block scope`,
      );
    }

    const environment =
      /** @type {import('../runtime/environment.js').DeclarativeEnvironmentRecord} */ (
        reference.base
      );
    environment.initializeBinding(declarator.id.name, value);
  }

  return createNormalCompletion(EMPTY);
}

/**
 * Performs ES2015 §13.2.14 `BlockDeclarationInstantiation` for `declarations`
 * (the `LexicallyScopedDeclarations` of a `Block`, `switch` `CaseBlock`, or
 * `try` part) into the block's fresh declarative environment `env`.
 *
 * Each bound name gets an uninitialized binding — `createImmutableBinding(name,
 * true)` for a `const`, `createMutableBinding(name, false)` for a `let` — which
 * is what puts a `let`/`const` in its temporal dead zone until its declarator
 * runs. A `FunctionDeclaration` is different: it is created and initialized
 * here, before any statement of the block executes, so a call earlier in the
 * block still resolves it. The function object captures `env`, the *block*
 * environment, as its `[[Scope]]` — not the enclosing one — so a closure it
 * returns observes the block's bindings.
 *
 * @param {readonly any[]} declarations
 * @param {import('../runtime/environment.js').DeclarativeEnvironmentRecord} env
 * @param {EvaluationContext} context
 * @returns {void}
 */
export function blockDeclarationInstantiation(declarations, env, context) {
  for (const declaration of declarations) {
    for (const name of boundNames(declaration)) {
      if (isConstantDeclaration(declaration)) {
        env.createImmutableBinding(name, true);
      } else {
        env.createMutableBinding(name, false);
      }
    }

    if (declaration.type === 'FunctionDeclaration') {
      env.initializeBinding(
        declaration.id.name,
        createFunctionObject(declaration, env, context),
      );
    }
  }
}
