import {
  getIdentifierReference,
  newDeclarativeEnvironment,
  DeclarativeEnvironmentRecord,
  GlobalEnvironmentRecord,
} from '../runtime/environment.js';
import { putValue } from '../runtime/reference.js';
import {
  EMPTY,
  createNormalCompletion,
  createReturnCompletion,
  GuestErrorSignal,
} from '../runtime/completion.js';
import {
  EngineFunction,
  createArgumentsObject,
} from '../runtime/function-object.js';
import { EngineArray } from '../runtime/array-object.js';
import { EngineObject } from '../runtime/object.js';
import { GeneratorObject } from '../runtime/generator-object.js';
import { evaluateExpressionValue } from './expressions.js';
import { evaluateClassDefinition } from './classes.js';
import { evaluateStatementList } from './statements.js';
import { assignBindingPattern, initializeBindingPattern } from './patterns.js';
import { hasUseStrictDirective } from './directive.js';
import { createGeneratorExecution } from './generator-machine.js';
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
 * Performs ES2015 `GlobalDeclarationInstantiation` (ECMA-262 6th edition
 * §15.1.8) for the script's `ScriptBody`, creating the bindings a script's
 * top-level declarations require in the realm's global environment before any
 * statement runs, so identifier references and hoisted reads/calls resolve even
 * before a declaration statement executes.
 *
 * (The plan cited §15.1.11; the real ES2015 clause is §15.1.8 — the later-
 * edition number leaked into the plan, as it did for
 * `FunctionDeclarationInstantiation`, which is §9.2.12 in ES2015.)
 *
 * §15.1.8 is deliberately two-phase, and the split matters for atomicity: it
 * runs *every* check before creating *any* binding, so a script that cannot be
 * fully instantiated leaves the global environment untouched (§15.1.8 NOTE 2 at
 * step 13: "If any such errors are detected, no bindings are instantiated for
 * the script.").
 *
 * Check phase (§15.1.8 steps 5, 6, 10, 12) — no mutation of the global
 * environment:
 * - step 5: for every lexically declared name, a guest `SyntaxError` if it
 *   collides with an existing global `var`, an existing global lexical binding,
 *   or a restricted global property (`undefined`/`NaN`/`Infinity`);
 * - step 6: for every `var` name, a guest `SyntaxError` if it collides with an
 *   existing global lexical binding;
 * - step 10: for each top-level function name (last declaration of a name wins,
 *   hence the reverse walk), a guest `TypeError` if `CanDeclareGlobalFunction`
 *   is false;
 * - step 12: for each `var` name that is not also a function name, a guest
 *   `TypeError` if `CanDeclareGlobalVar` is false.
 *
 * Within a single script Acorn rejects the step 5/6 conflicts at parse time, so
 * those runtime checks only fire across scripts in the same realm (or for a
 * global-scope `eval`, whose own §18.2.1.2 checks run against these same global
 * lexical/var declarations). The step 10/12 `TypeError`s (e.g. a new name
 * on a non-extensible global) are surfaced by delegating to
 * `createGlobalFunctionBinding`/`createGlobalVarBinding`, which — by their
 * own-property model — are guaranteed to reject *before* mutating whenever the
 * matching `CanDeclare*` predicate is false; that reuses their exact messages
 * without creating anything.
 *
 * Create phase (§15.1.8 steps 15-17), reached only once every check has passed:
 * - step 15: lexically scoped `let`/`const` and class names get *uninitialized*
 *   declarative bindings — `createImmutableBinding(name, true)` for a `const`,
 *   `createMutableBinding(name, false)` for `let` and classes — their temporal
 *   dead zone until the declarator runs. A top-level `FunctionDeclaration` is var-scoped,
 *   not lexical, so it is not in this list. A global lexical binding lives only
 *   in the declarative record and is therefore invisible on the global object.
 * - step 16: the top-level function declarations are bound to their function
 *   objects with `createGlobalFunctionBinding(name, fo, false)`;
 * - step 17: the `var` names get `undefined`-initialized bindings with
 *   `createGlobalVarBinding(name, false)`.
 *
 * For non-strict scripts this also performs ES2015 Annex B.3.3.2's global slice:
 * a block-level function declaration whose name can legally be declared as a
 * global `var` gets an `undefined`-initialized global var binding here, and the
 * declaration node is recorded on `context.annexBFunctionDeclarations` so the
 * function's own evaluation copies its value into the global scope in source
 * order (see `evaluateFunctionDeclaration`, `./statements.js`).
 *
 * @param {any} program
 * @param {EvaluationContext} context
 * @returns {void}
 */
export function globalDeclarationInstantiation(program, context) {
  const globalEnvironment = context.realm.globalEnvironment;

  // §15.1.8 steps 3-4: LexicallyDeclaredNames and VarDeclaredNames of the
  // ScriptBody are the *top-level* variants, because a top-level function
  // declaration is var-scoped rather than lexical.
  const lexNames = topLevelLexicallyDeclaredNames(program.body);
  const varNames = topLevelVarDeclaredNames(program.body);

  // §15.1.8 step 5: reject a lexical name that conflicts with an existing
  // global var, an existing global lexical binding, or a restricted global
  // property.
  for (const name of lexNames) {
    if (
      globalEnvironment.hasVarDeclaration(name) ||
      globalEnvironment.hasLexicalDeclaration(name) ||
      globalEnvironment.hasRestrictedGlobalProperty(name)
    ) {
      throw new GuestErrorSignal(
        'SyntaxError',
        `Identifier '${name}' has already been declared`,
      );
    }
  }

  // §15.1.8 step 6: reject a var name that conflicts with an existing global
  // lexical binding.
  for (const name of varNames) {
    if (globalEnvironment.hasLexicalDeclaration(name)) {
      throw new GuestErrorSignal(
        'SyntaxError',
        `Identifier '${name}' has already been declared`,
      );
    }
  }

  const varScoped = topLevelVarScopedDeclarations(program.body);

  // §15.1.8 steps 8-10: walk the var-scoped declarations in reverse so the last
  // declaration of a repeated function name wins, collect the function objects
  // to initialize (restored to source order via unshift), and check
  // `CanDeclareGlobalFunction` for each. A false predicate must abort here,
  // before any binding is created; `createGlobalFunctionBinding` is guaranteed
  // to reject without mutating in exactly that case, so calling it reuses its
  // precise `TypeError` message. Instantiating the function object early has no
  // global side effect (it only captures `context.env` as its `[[Scope]]`).
  /** @type {{ name: string, functionObject: EngineFunction }[]} */
  const functionsToInitialize = [];
  /** @type {Set<string>} */
  const declaredFunctionNames = new Set();

  for (let index = varScoped.length - 1; index >= 0; index -= 1) {
    const declaration = varScoped[index];
    if (declaration.type !== 'FunctionDeclaration') {
      continue;
    }

    const name = declaration.id.name;
    if (declaredFunctionNames.has(name)) {
      continue;
    }

    const functionObject = instantiateFunctionObject(declaration, context);
    if (!globalEnvironment.canDeclareGlobalFunction(name)) {
      globalEnvironment.createGlobalFunctionBinding(
        name,
        functionObject,
        false,
      );
    }

    declaredFunctionNames.add(name);
    functionsToInitialize.unshift({ name, functionObject });
  }

  // §15.1.8 steps 11-12: collect the var names that are not also function
  // names, checking `CanDeclareGlobalVar` for each. As above, a false predicate
  // aborts before any binding is created; `createGlobalVarBinding` rejects
  // without mutating in that case (a new name on a non-extensible global).
  /** @type {string[]} */
  const declaredVarNames = [];
  /** @type {Set<string>} */
  const seenVarNames = new Set();

  for (const name of varNames) {
    if (declaredFunctionNames.has(name)) {
      continue;
    }

    if (!globalEnvironment.canDeclareGlobalVar(name)) {
      globalEnvironment.createGlobalVarBinding(name, false);
    }

    if (!seenVarNames.has(name)) {
      seenVarNames.add(name);
      declaredVarNames.push(name);
    }
  }

  // Every check has now passed (§15.1.8 NOTE 2 / step 13): from here no
  // creation can fail for an ordinary global object, so the following mutations
  // are effectively atomic.

  // §15.1.8 step 15: instantiate — but do not initialize — the lexically scoped
  // declarations. `topLevelLexicallyScopedDeclarations` yields only
  // `let`/`const` (function declarations are var-scoped), so each name gets an
  // uninitialized binding (its TDZ) that `evaluateVariableDeclaration` later
  // initializes.
  for (const declaration of topLevelLexicallyScopedDeclarations(program.body)) {
    for (const name of boundNames(declaration)) {
      if (isConstantDeclaration(declaration)) {
        globalEnvironment.createImmutableBinding(name, true);
      } else {
        globalEnvironment.createMutableBinding(name, false);
      }
    }
  }

  // §15.1.8 step 16: bind each top-level function declaration to its function
  // object (non-configurable, `configurableBindings` false).
  for (const { name, functionObject } of functionsToInitialize) {
    globalEnvironment.createGlobalFunctionBinding(name, functionObject, false);
  }

  // §15.1.8 step 17: create the `undefined`-initialized global var bindings.
  for (const name of declaredVarNames) {
    globalEnvironment.createGlobalVarBinding(name, false);
  }

  if (!context.strict) {
    const aliasDeclarations = annexBBlockFunctionDeclarations(
      program.body,
      new Set(lexNames),
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
 * Performs ES2015 §9.2.12 FunctionDeclarationInstantiation. Parameter
 * bindings are created together before defaults run, defaults initialize them
 * from left to right, and a non-simple list receives a separate body variable
 * environment so body declarations are not visible to parameter expressions.
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
  const parameterEnv =
    /** @type {import('../runtime/environment.js').DeclarativeEnvironmentRecord} */ (
      context.env
    );
  const parameterNames = functionObject.parameterNames;
  const formalParameters = functionObject.formalParameters;

  // Every bound name exists before the first default expression runs. Duplicate
  // names are possible only for sloppy simple lists and share one binding.
  for (const name of parameterNames) {
    if (!parameterEnv.hasBinding(name)) {
      parameterEnv.createMutableBinding(name, false);
    }
  }

  const bodyStatements =
    functionNode.body.type === 'BlockStatement' ? functionNode.body.body : [];
  const varScoped = topLevelVarScopedDeclarations(bodyStatements);
  const varNames = new Set(topLevelVarDeclaredNames(bodyStatements));
  const functionNames = new Set(
    varScoped
      .filter((declaration) => declaration.type === 'FunctionDeclaration')
      .map((declaration) => declaration.id.name),
  );
  const lexicalNames = new Set(topLevelLexicallyDeclaredNames(bodyStatements));
  const hasParameterExpressions = formalParameters.some(
    containsParameterExpression,
  );
  const mappedArguments =
    !functionObject.strict && functionObject.simpleParameterList;
  const argumentsObjectNeeded =
    functionObject.functionKind !== 'arrow' &&
    !parameterNames.includes('arguments') &&
    (hasParameterExpressions ||
      (!functionNames.has('arguments') && !lexicalNames.has('arguments')));

  if (argumentsObjectNeeded) {
    parameterEnv.createMutableBinding('arguments', false);
    parameterEnv.initializeBinding(
      'arguments',
      createArgumentsObject(
        functionObject,
        args,
        parameterEnv,
        mappedArguments,
      ),
    );
  }

  for (let index = 0; index < formalParameters.length; index += 1) {
    const parameter = formalParameters[index];
    const value =
      parameter.type === 'RestElement'
        ? createRestParameterArray(functionObject, args, index)
        : index < args.length
          ? args[index]
          : undefined;

    initializeBindingPattern(parameter, value, parameterEnv, context);
  }

  const env = functionObject.simpleParameterList
    ? parameterEnv
    : newDeclarativeEnvironment(parameterEnv);
  context.variableEnv = env;

  for (const name of varNames) {
    if (env.hasBinding(name)) {
      continue;
    }

    const initialValue =
      !functionObject.simpleParameterList && parameterEnv.hasBinding(name)
        ? parameterEnv.getBindingValue(name, false)
        : undefined;
    env.createMutableBinding(name, false);
    env.initializeBinding(name, initialValue);
  }

  // Hoisted body functions capture the body's lexical environment, not the
  // parameter environment used while defaults were evaluated.
  const lexicalEnv = functionObject.strict
    ? env
    : newDeclarativeEnvironment(env);
  context.env = lexicalEnv;

  for (const declaration of varScoped) {
    if (declaration.type !== 'FunctionDeclaration') {
      continue;
    }

    const name = declaration.id.name;
    const nested = instantiateFunctionObject(declaration, context);

    if (!env.hasBinding(name)) {
      env.createMutableBinding(name, false);
      env.initializeBinding(name, nested);
    } else {
      env.setMutableBinding(name, nested, false);
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
    // Annex B.3.3.1 restricts eligibility to a block function whose name would
    // raise no early error if replaced by `var F` *and* that "is not an element
    // of BoundNames of argumentsList" — i.e. does not collide with a formal
    // parameter. Union the parameter names into the excluded set so an
    // ineligible collision neither creates a var binding here nor copies at
    // evaluation time; it falls back to plain block-scoped evaluation.
    const excludedNames = new Set(
      topLevelLexicallyDeclaredNames(bodyStatements),
    );
    for (const name of parameterNames) {
      excludedNames.add(name);
    }

    const aliasDeclarations = annexBBlockFunctionDeclarations(
      bodyStatements,
      excludedNames,
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
 * @param {EngineFunction} functionObject
 * @param {readonly unknown[]} args
 * @param {number} start
 * @returns {EngineArray}
 */
function createRestParameterArray(functionObject, args, start) {
  const array = new EngineArray(functionObject.realm.intrinsics.arrayPrototype);

  for (let index = start; index < args.length; index += 1) {
    array.defineOwnProperty(String(index - start), {
      value: args[index],
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  return array;
}

/**
 * Implements ContainsExpression for the supported BindingElement shapes.
 *
 * @param {any} parameter
 * @returns {boolean}
 */
function containsParameterExpression(parameter) {
  switch (parameter.type) {
    case 'AssignmentPattern':
      return true;
    case 'RestElement':
      return containsParameterExpression(parameter.argument);
    case 'ArrayPattern':
      return /** @type {any[]} */ (parameter.elements).some(
        (element) => element && containsParameterExpression(element),
      );
    case 'ObjectPattern':
      return /** @type {any[]} */ (parameter.properties).some(
        (property) =>
          property.computed || containsParameterExpression(property.value),
      );
    default:
      return false;
  }
}

/**
 * Performs ES2015 §18.2.1.2 `EvalDeclarationInstantiation` for *eval code*.
 * Function declarations are instantiated before `var` names, exactly as the
 * global and per-call paths do, but every var/function binding eval creates in
 * `variableEnv` is *configurable/deletable*: `eval("var x = 1")` followed by
 * `delete x` succeeds, where a script-level `var x` is non-deletable.
 *
 * The var/function *bindings* are created in `variableEnv`, chosen by
 * `performEval` (`src/evaluator/eval.js`) per §18.2.1.1 steps 12-14: the
 * caller's variable environment for a direct eval (so the bindings outlive the
 * eval call and are visible to the caller — including when the direct eval sits
 * inside a `catch`, whose lexical scope is *not* the variable environment), the
 * realm's global environment for an indirect eval, or the eval's own fresh
 * lexical environment for a strict eval (so nothing leaks). A hoisted function
 * *object* nonetheless captures `context.env` — the eval's *lexical*
 * environment — as its `[[Scope]]` (§18.2.1.2 step 10.a's
 * `InstantiateFunctionObject(f, lexEnv)`), so it sees the eval body's own
 * `let`/`const`; only its binding lands in `variableEnv`. The eval body's
 * `let`/`const` declarations are likewise instantiated into `context.env`
 * (§18.2.1.2 step 5's `lexDeclarations` loop), which `performEval` builds fresh
 * over the caller's lexical scope and discards when the call returns, so they
 * never leak. No `arguments` object is created for eval code.
 *
 * §18.2.1.2 step 5 also guards `var`/lexical conflicts for a non-strict eval:
 * a top-level `var` name may not collide with a lexical binding anywhere on the
 * chain between the eval's lexical environment and its variable environment,
 * nor (at global scope) with a global lexical declaration. That is what makes
 * `let x = 1; eval("var x = 2")` a guest `SyntaxError`.
 *
 * @param {any} program
 * @param {EvaluationContext} context
 * @param {EvalVariableEnvironment} variableEnv
 * @returns {void}
 */
export function evalDeclarationInstantiation(program, context, variableEnv) {
  const varScoped = topLevelVarScopedDeclarations(program.body);
  const varNames = new Set(topLevelVarDeclaredNames(program.body));

  if (!context.strict) {
    // §18.2.1.2 step 5: reject before mutating anything. A top-level `var` of
    // the eval body may not shadow a lexical binding on the chain from the
    // eval's lexical environment up to (but not including) its variable
    // environment, and — when the variable environment is the global
    // environment — may not collide with a global lexical declaration. Object
    // (`with`) environment records on the chain hold no lexical declarations
    // and are skipped (step 5.d.ii.1's NOTE).
    for (const name of varNames) {
      if (
        variableEnv instanceof GlobalEnvironmentRecord &&
        variableEnv.hasLexicalDeclaration(name)
      ) {
        throw new GuestErrorSignal(
          'SyntaxError',
          `Identifier '${name}' has already been declared`,
        );
      }

      if (hasEvalChainLexicalBinding(context.env, variableEnv, name)) {
        throw new GuestErrorSignal(
          'SyntaxError',
          `Identifier '${name}' has already been declared`,
        );
      }
    }
  }

  for (const declaration of varScoped) {
    if (declaration.type !== 'FunctionDeclaration') {
      continue;
    }

    // §18.2.1.2 step 10.a: `InstantiateFunctionObject(f, lexEnv)` — the hoisted
    // function object captures the eval's *lexical* environment (`context.env`)
    // as its `[[Scope]]`, so it sees the eval body's own `let`/`const` and the
    // caller's lexical scope. Only its *binding* lands in `variableEnv` below
    // (with the configurable/deletable, ES5.1 §10.5 global rules), mirroring the
    // body/var split Task 6 established for function bodies (§9.2.12).
    const functionObject = instantiateFunctionObject(declaration, context);
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
    // B.3.3.3 step 1.a.ii additionally suppresses the alias when the name is
    // already bound by a lexical declaration in the running context's lexical
    // environment chain between the eval and its variable environment — the
    // same chain `hasEvalChainLexicalBinding` walks. That is why
    //     { let f = 1; eval("{ function f(){} }"); } typeof f
    // yields "undefined": the enclosing `let f` makes a var alias for `f` an
    // early error, so no alias is created or copied.
    const aliasDeclarations = annexBBlockFunctionDeclarations(
      program.body,
      new Set(topLevelLexicallyDeclaredNames(program.body)),
    ).filter(
      (declaration) =>
        !hasEvalChainLexicalBinding(
          context.env,
          variableEnv,
          declaration.id.name,
        ),
    );

    for (const declaration of aliasDeclarations) {
      ensureEvalVarBinding(variableEnv, declaration.id.name);
    }

    context.annexBFunctionDeclarations = new Set(aliasDeclarations);
  }

  // §18.2.1.2 step 5's `lexDeclarations` loop: instantiate — but do not
  // initialize — the eval body's top-level `let`/`const` into the eval's
  // lexical environment (`context.env`) with a block's rules, so each name gets
  // its TDZ binding that `evaluateVariableDeclaration` later initializes. This
  // is what makes `eval("let x = 1")` resolve `x` without leaking it.
  blockDeclarationInstantiation(
    topLevelLexicallyScopedDeclarations(program.body),
    /** @type {DeclarativeEnvironmentRecord} */ (context.env),
    context,
  );
}

/**
 * ES2015 §18.2.1.2 step 5's var/lexical conflict walk (as amended by Annex
 * B.3.5): reports whether any *declarative* environment record on the chain
 * from `lexEnv` up to (but not including) `varEnv` has a binding for `name`.
 * Object (`with`) environment records are skipped, since a `with` scope holds
 * no lexical declarations (step 5.d.ii.1's NOTE), and a `Catch` clause's
 * parameter environment is skipped too, since Annex B.3.5 lets a non-strict
 * eval hoist a `var` over a like-named catch parameter. The walk stops at
 * `varEnv` because var/function hoisting legitimately targets that environment.
 *
 * @param {import('../runtime/environment.js').EnvironmentRecordLike} lexEnv
 * @param {EvalVariableEnvironment} varEnv
 * @param {string} name
 * @returns {boolean}
 */
function hasEvalChainLexicalBinding(lexEnv, varEnv, name) {
  /** @type {import('../runtime/environment.js').EnvironmentRecordLike | null} */
  let current = lexEnv;

  while (current !== null && current !== varEnv) {
    if (
      current instanceof DeclarativeEnvironmentRecord &&
      !current.isCatchClauseEnvironment &&
      current.hasBinding(name)
    ) {
      return true;
    }

    current = current.outer;
  }

  return false;
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
 *   createPrototype?: boolean,
 *   functionKind?: import('../runtime/function-object.js').FunctionKind,
 *   thisMode?: 'global' | 'strict' | 'lexical',
 *   constructible?: boolean,
 *   homeObject?: import('../runtime/object.js').EngineObject,
 *   strict?: boolean,
 *   constructorKind?: 'base' | 'derived',
 *   defaultDerivedConstructor?: boolean,
 * }} CreateFunctionObjectOptions
 */

/**
 * ECMA-262's `IsAnonymousFunctionDefinition`, restricted to the one AST shape
 * function-expression and arrow forms the evaluator implements.
 *
 * @param {any} node
 * @returns {boolean}
 */
export function isAnonymousFunctionExpression(node) {
  return (
    (node.type === 'FunctionExpression' && !node.id) ||
    node.type === 'ArrowFunctionExpression'
  );
}

/**
 * @param {any} node
 * @returns {boolean}
 */
export function isAnonymousClassExpression(node) {
  return node.type === 'ClassExpression' && node.id === null;
}

/**
 * Applies ES2015 NamedEvaluation to the anonymous function and class forms the
 * evaluator supports, falling back to ordinary expression evaluation for every
 * other initializer.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @param {string} name
 * @returns {unknown}
 */
export function evaluateNamedExpression(node, context, name) {
  if (isAnonymousFunctionExpression(node)) {
    return createFunctionObject(node, context.env, context, { name });
  }

  if (isAnonymousClassExpression(node)) {
    return evaluateClassDefinition(node, context, name);
  }

  return evaluateExpressionValue(node, context);
}

/**
 * @param {any} node
 * @param {import('../runtime/environment.js').EnvironmentRecordLike} scope
 * @param {EvaluationContext} context
 * @param {CreateFunctionObjectOptions} [options={}]
 * @returns {EngineFunction}
 */
export function createFunctionObject(node, scope, context, options = {}) {
  /** @type {readonly any[]} */
  const formalParameters = node.params;
  const parameterNames = formalParameters.flatMap(boundNames);
  const simpleParameterList = formalParameters.every(
    (parameter) => parameter.type === 'Identifier',
  );
  const expectedArgumentCount = firstOptionalIndex(formalParameters);

  // A function is strict when its enclosing scope is already strict OR when
  // its block body opens with a "use strict" directive prologue (ECMA-262
  // 10.1.1 — "once strict, always strict" applies transitively). Concise arrow
  // bodies have no directive prologue.
  const strict =
    options.strict ??
    (context.strict ||
      (node.body.type === 'BlockStatement' &&
        hasUseStrictDirective(node.body.body)));
  const name = options.name ?? (node.id ? node.id.name : '');
  const functionKind =
    options.functionKind ??
    (node.type === 'ArrowFunctionExpression'
      ? 'arrow'
      : node.generator === true
        ? options.isMethod
          ? 'generatorMethod'
          : 'generator'
        : options.isMethod
          ? 'method'
          : 'normal');
  const thisMode =
    options.thisMode ??
    (functionKind === 'arrow' ? 'lexical' : strict ? 'strict' : 'global');
  const constructible =
    options.constructible ??
    (functionKind === 'normal' || functionKind === 'classConstructor');
  const generator =
    functionKind === 'generator' || functionKind === 'generatorMethod';
  const generatorFunctionPrototype = generator
    ? requiredGeneratorIntrinsic(context.realm, 'generatorFunctionPrototype')
    : undefined;
  const generatorPrototype = generator
    ? requiredGeneratorIntrinsic(context.realm, 'generatorPrototype')
    : undefined;

  const functionObject = new EngineFunction({
    realm: context.realm,
    formalParameters,
    parameterNames,
    expectedArgumentCount,
    simpleParameterList,
    scope,
    strict,
    name,
    isMethod: functionKind === 'method' || functionKind === 'generatorMethod',
    createPrototype: options.createPrototype ?? (constructible || generator),
    functionKind,
    thisMode,
    constructible,
    enclosingFunctionEnvironment: context.functionEnvironment,
    methodHomeObject: functionKind === 'arrow' ? undefined : options.homeObject,
    constructorKind: options.constructorKind,
    defaultDerivedConstructor: options.defaultDerivedConstructor,
    functionObjectPrototype: generatorFunctionPrototype,
    prototypeObjectPrototype: generatorPrototype,
    generatorFactory: generator
      ? (functionObject, thisValue, args, functionEnvironment) =>
          createGeneratorObject(
            node,
            functionObject,
            thisValue,
            args,
            functionEnvironment,
          )
      : undefined,
    execute: (functionObject, thisValue, args, functionEnvironment) =>
      executeFunctionBody(
        node,
        functionObject,
        thisValue,
        args,
        functionEnvironment,
      ),
  });

  return functionObject;
}

/**
 * @param {readonly any[]} formalParameters
 * @returns {number}
 */
function firstOptionalIndex(formalParameters) {
  for (let index = 0; index < formalParameters.length; index += 1) {
    const parameter = formalParameters[index];

    if (
      parameter.type === 'AssignmentPattern' ||
      parameter.type === 'RestElement'
    ) {
      return index;
    }
  }

  return formalParameters.length;
}

/**
 * Runs a function body in a fresh activation environment whose outer
 * environment is the function's captured `[[Scope]]`, so closures observe
 * the environment their function was created in rather than the caller's.
 *
 * Per ES2015 §9.2.12 a non-simple list layers its parameter environment over
 * the callee's initial variable environment, then layers a distinct body
 * variable environment over the parameters. The body lexical environment
 * (holding `let`/`const`) is installed last. Simple lists reuse the initial
 * environment for parameters and body `var`s. This preserves both parameter
 * default isolation and the variable environment direct eval needs.
 *
 * @param {any} node
 * @param {EngineFunction} functionObject
 * @param {unknown} thisValue
 * @param {readonly unknown[]} args
 * @param {import('../runtime/environment.js').FunctionExecutionEnvironment} functionEnvironment
 * @returns {{ type: string, value: unknown }}
 */
function executeFunctionBody(
  node,
  functionObject,
  thisValue,
  args,
  functionEnvironment,
) {
  const { context, bodyStatements } = createFunctionBodyContext(
    node,
    functionObject,
    thisValue,
    args,
    functionEnvironment,
  );

  if (node.type === 'ArrowFunctionExpression' && node.expression) {
    return createReturnCompletion(evaluateExpressionValue(node.body, context));
  }

  return evaluateStatementList(bodyStatements, context);
}

/**
 * Builds a function activation through declaration instantiation without
 * evaluating a body statement. Generator calls retain the resulting context
 * until their first resume; ordinary functions evaluate it immediately.
 *
 * @param {any} node
 * @param {EngineFunction} functionObject
 * @param {unknown} thisValue
 * @param {readonly unknown[]} args
 * @param {import('../runtime/environment.js').FunctionExecutionEnvironment} functionEnvironment
 * @returns {{ context: EvaluationContext, bodyStatements: any[] }}
 */
export function createFunctionBodyContext(
  node,
  functionObject,
  thisValue,
  args,
  functionEnvironment,
) {
  const functionEnv = newDeclarativeEnvironment(functionObject.scope);
  const parameterEnv = functionObject.simpleParameterList
    ? functionEnv
    : newDeclarativeEnvironment(functionEnv);

  /** @type {EvaluationContext} */
  const context = {
    realm: functionObject.realm,
    // FunctionDeclarationInstantiation keeps this environment active while
    // defaults run. Direct eval declarations use the underlying function
    // variable environment, then instantiation installs the body environments.
    env: parameterEnv,
    variableEnv: functionEnv,
    strict: functionObject.strict,
    thisValue,
    functionEnvironment,
  };

  functionDeclarationInstantiation(node, functionObject, args, context);
  const bodyStatements =
    node.body.type === 'BlockStatement' ? node.body.body : [];
  const lexEnv =
    /** @type {import('../runtime/environment.js').DeclarativeEnvironmentRecord} */ (
      context.env
    );

  // ES2015 §9.2.12 step 35: instantiate the body's top-level lexically-scoped
  // declarations into `lexEnv` with the same rules a block uses — `let`/`const`
  // get uninitialized bindings (TDZ). This list holds only `let`/`const`/class
  // declarations: `topLevelLexicallyScopedDeclarations` excludes function
  // declarations (they are var-scoped and already handled above), which is why
  // it is the right helper here.
  blockDeclarationInstantiation(
    topLevelLexicallyScopedDeclarations(bodyStatements),
    lexEnv,
    context,
  );

  return { context, bodyStatements };
}

/**
 * @param {any} node
 * @param {EngineFunction} functionObject
 * @param {unknown} thisValue
 * @param {readonly unknown[]} args
 * @param {import('../runtime/environment.js').FunctionExecutionEnvironment} functionEnvironment
 * @returns {GeneratorObject}
 */
function createGeneratorObject(
  node,
  functionObject,
  thisValue,
  args,
  functionEnvironment,
) {
  const { context, bodyStatements } = createFunctionBodyContext(
    node,
    functionObject,
    thisValue,
    args,
    functionEnvironment,
  );
  const prototype = functionObject.get('prototype');
  const generatorPrototype =
    prototype instanceof EngineObject
      ? prototype
      : requiredGeneratorIntrinsic(context.realm, 'generatorPrototype');
  const continuation = createGeneratorExecution({
    functionObject,
    body: bodyStatements,
    context,
  });

  return new GeneratorObject(context.realm, generatorPrototype, continuation);
}

/**
 * @param {import('../runtime/realm.js').Realm} realm
 * @param {'generatorFunctionPrototype' | 'generatorPrototype'} name
 * @returns {EngineObject}
 */
function requiredGeneratorIntrinsic(realm, name) {
  const intrinsic = realm.intrinsics[name];

  if (!(intrinsic instanceof EngineObject)) {
    throw new TypeError(`Realm is missing required %${name}% intrinsic`);
  }

  return intrinsic;
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
        if (declarator.id.type !== 'Identifier') {
          const value = evaluateExpressionValue(declarator.init, context);
          applyVariableDeclaratorValue(
            node.kind,
            declarator,
            value,
            context,
            null,
          );
          continue;
        }

        // ES5.1 §12.2.1: evaluate the Identifier to a Reference *before* the
        // Initialiser, so a `with`-bound target captured here survives a
        // property the initializer deletes and PutValue writes back through it.
        const reference = getIdentifierReference(
          context.env,
          declarator.id.name,
          context.strict,
        );
        const value = evaluateNamedExpression(
          declarator.init,
          context,
          declarator.id.name,
        );
        applyVariableDeclaratorValue(
          node.kind,
          declarator,
          value,
          context,
          reference,
        );
      }
    }

    return createNormalCompletion(EMPTY);
  }

  for (const declarator of node.declarations) {
    if (declarator.id.type !== 'Identifier') {
      const value = declarator.init
        ? evaluateExpressionValue(declarator.init, context)
        : undefined;
      applyVariableDeclaratorValue(node.kind, declarator, value, context, null);
      continue;
    }

    // ES2015 §13.3.1.4 step 6 (NamedEvaluation): a lexical binding whose
    // initializer is an anonymous function definition names that function after
    // the binding, so `let f = function () {};` yields `f.name === 'f'`. The
    // `var` path above applies the same step for §12.2's `VariableDeclaration`;
    // both route through `createFunctionObject`'s `name` option rather than
    // setting the property afterwards, so the function is born with the
    // non-writable, non-enumerable, configurable `name` §9.2.11 requires.
    const value = declarator.init
      ? evaluateNamedExpression(declarator.init, context, declarator.id.name)
      : undefined;
    applyVariableDeclaratorValue(node.kind, declarator, value, context, null);
  }

  return createNormalCompletion(EMPTY);
}

/**
 * Applies an already-evaluated initializer with the same binding rules used by
 * synchronous declarations. A resumable `var` passes the Reference it captured
 * before evaluating the initializer so suspension cannot change its target.
 *
 * @param {string} kind
 * @param {any} declarator
 * @param {unknown} value
 * @param {EvaluationContext} context
 * @param {import('../runtime/reference.js').Reference | null} reference
 * @returns {void}
 */
export function applyVariableDeclaratorValue(
  kind,
  declarator,
  value,
  context,
  reference,
) {
  if (kind === 'var') {
    if (declarator.id.type !== 'Identifier') {
      assignBindingPattern(declarator.id, value, context);
      return;
    }

    putValue(
      reference ??
        getIdentifierReference(context.env, declarator.id.name, context.strict),
      value,
    );
    return;
  }

  if (declarator.id.type !== 'Identifier') {
    initializeBindingPattern(declarator.id, value, context.env, context);
    return;
  }

  // ES2015 §13.3.1.4 `InitializeReferencedBinding`: resolve the binding the
  // way `ResolveBinding` does and initialize the record that holds it.
  const resolved = getIdentifierReference(
    context.env,
    declarator.id.name,
    context.strict,
  );
  const environment =
    /** @type {import('../runtime/environment.js').DeclarativeEnvironmentRecord} */ (
      resolved.base
    );
  environment.initializeBinding(declarator.id.name, value);
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
 * returns observes the block's bindings. Sloppy duplicate function declarations
 * share one mutable binding; each declaration initializes it in source order, so
 * the last declaration supplies the hoisted value.
 *
 * @param {readonly any[]} declarations
 * @param {import('../runtime/environment.js').DeclarativeEnvironmentRecord} env
 * @param {EvaluationContext} context
 * @returns {void}
 */
export function blockDeclarationInstantiation(declarations, env, context) {
  const createdFunctionNames = new Set();

  for (const declaration of declarations) {
    for (const name of boundNames(declaration)) {
      if (
        declaration.type === 'FunctionDeclaration' &&
        createdFunctionNames.has(name)
      ) {
        continue;
      }

      if (isConstantDeclaration(declaration)) {
        env.createImmutableBinding(name, true);
      } else {
        env.createMutableBinding(name, false);
      }

      if (declaration.type === 'FunctionDeclaration') {
        createdFunctionNames.add(name);
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
