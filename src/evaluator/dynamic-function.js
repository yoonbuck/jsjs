/**
 * The dynamic `Function` constructor's create step (ECMA-262 15.3.2.1
 * "Function (p1, p2, … , pn, body)", layered over 13.2 "Creating Function
 * Objects").
 *
 * Like `eval`, the `Function` constructor turns runtime *source text* into
 * executable guest code, so it needs the engine's own parser and function
 * builder. This module therefore lives beside `eval.js` under
 * `src/evaluator/` and is imported by `src/builtins/function.js` — the same
 * sanctioned "builtin reaches the evaluator" edge that `global-eval.js`
 * documents, and for the same reason (the builtin *is* an evaluator feature
 * exposed to guest code). The chain `runtime/realm.js ->
 * builtins/function.js -> evaluator/dynamic-function.js -> {parser.js,
 * evaluator/declarations.js, runtime/*}` stays acyclic because nothing this
 * module reaches imports `runtime/realm.js` at runtime (only its JSDoc type).
 *
 * Calling `Function(...)` and constructing `new Function(...)` are identical
 * (15.3.1.1 / 15.3.2.1), so both hooks in `function.js` funnel here.
 *
 * ### Composition strategy (and why it is not escapable)
 *
 * The parameter arguments are joined with commas into `P` and the last
 * argument becomes the function `body` (steps 1-6). Rather than parse `P` and
 * `body` in isolation, the two fragments are woven into one
 * `function anonymous(<P>\n) {\n<body>\n}` string that is parsed *as a whole*
 * script `Program`, after which the result must be exactly one
 * `FunctionDeclaration` spanning the entire program. Any attempt by `body` or
 * `P` to smuggle extra syntax past the composition — closing the function
 * early (`"return 1}"`), opening a second construct (`"}, function(){"}`), or
 * splitting into two declarations (`"1} function evil(){"`) — leaves stray
 * tokens that either fail to parse or produce more than one top-level
 * statement, both of which are rejected as a guest `SyntaxError` (steps 7-8).
 * The newline after `<P>` and before the closing brace stops a trailing line
 * comment in either fragment from swallowing the tokens the wrapper adds.
 *
 * Strictness is taken solely from the composed body's own directive prologue
 * (steps 9-10): because the wrapper is parsed as ordinary, non-strict source,
 * the parser turns on strict mode — and its strict early errors for the
 * parameter list (no `eval`/`arguments` parameter names, no duplicates) and
 * body — only when the body itself opens with `"use strict"`. Caller
 * strictness is never woven in, so it is never inherited.
 */

import { toString } from '../runtime/conversion.js';
import { parseEval } from '../parser.js';
import { GuestErrorSignal } from '../runtime/completion.js';
import { createFunctionExecutionEnvironment } from '../runtime/environment.js';
import { createFunctionObject } from './declarations.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 * @typedef {import('../runtime/function-object.js').EngineFunction} EngineFunction
 */

/**
 * Implements ECMA-262 15.3.2.1: build the function object for a dynamic
 * `Function(p1, …, pn, body)` call in `realm`.
 *
 * The created function's `[[Scope]]` is `realm`'s Global Environment (step 11),
 * never the calling function's scope, so a `Function` built inside another
 * function cannot see that function's locals. Its `[[Prototype]]` is `realm`'s
 * `Function.prototype`, and its `length`/`prototype`/`constructor` descriptors
 * and strict `caller`/`arguments` poison pills come out identical to a
 * source-declared function because the object is built through the shared
 * `createFunctionObject` (13.2) path rather than assembled by hand. The parsed
 * formal-parameter AST is retained intact, so defaults, destructuring, rest,
 * expected argument count, and non-simple arguments rules use the same
 * instantiation path as source-declared functions.
 *
 * @param {Realm} realm The realm that owns the invoked `Function` constructor.
 * @param {readonly unknown[]} args
 * @returns {EngineFunction}
 */
export function createDynamicFunction(realm, args) {
  const { parameterText, bodyText } = coerceArguments(args);
  const functionNode = parseDynamicFunction(parameterText, bodyText);

  // The Global Environment is the created function's scope, and a fresh
  // non-strict creation context means strictness is decided by the body's own
  // directive alone (createFunctionObject ORs `context.strict` with the body's
  // "use strict" prologue).
  const creationContext = {
    realm,
    env: realm.globalEnvironment,
    variableEnv: realm.globalEnvironment,
    strict: false,
    thisValue: realm.globalObject,
    functionEnvironment: createFunctionExecutionEnvironment({
      thisStatus: 'initialized',
      thisValue: realm.globalObject,
    }),
  };

  return createFunctionObject(
    functionNode,
    realm.globalEnvironment,
    creationContext,
  );
}

/**
 * Performs ECMA-262 15.3.2.1 steps 1-6: derive the parameter text `P` and the
 * function `body` from the argument list. `ToString` is applied to every
 * parameter argument left to right and then to the body argument, so a
 * throwing `toString` (or `valueOf`) is observed in that order.
 *
 * @param {readonly unknown[]} args
 * @returns {{ parameterText: string, bodyText: string }}
 */
function coerceArguments(args) {
  const argCount = args.length;

  if (argCount === 0) {
    return { parameterText: '', bodyText: '' };
  }

  if (argCount === 1) {
    return { parameterText: '', bodyText: toString(args[0]) };
  }

  let parameterText = toString(args[0]);

  for (let k = 1; k < argCount - 1; k += 1) {
    parameterText += ',' + toString(args[k]);
  }

  const bodyText = toString(args[argCount - 1]);

  return { parameterText, bodyText };
}

/**
 * Performs ECMA-262 15.3.2.1 steps 7-10: parse the woven
 * `function anonymous(<P>\n) {\n<body>\n}` source as a single script
 * `FunctionDeclaration`. A parse failure — or a parse that yields anything
 * other than one lone `FunctionDeclaration` — becomes a realm-local guest
 * `SyntaxError` (raised as a `GuestErrorSignal` the native-function boundary
 * in `function.js` materializes), which is what keeps the body from escaping
 * its wrapper.
 *
 * Steps 10 and 11 validate `P` and `body` as *independent* productions (a
 * `FormalParameterList` and a `FunctionBody`), and that independence is load
 * bearing rather than pedantry: parsing only the woven source lets a fragment
 * borrow syntax from its neighbour across the synthetic `) {` delimiter. A
 * block comment opened in `P` and closed in `body` swallows the delimiter, so
 * a `P` of `") { return 99; /*"` paired with a `body` that opens with the
 * matching comment terminator composes two individually invalid fragments into
 * one valid declaration — a code-injection escape. Each fragment is therefore
 * first parsed alone, paired with an empty counterpart, before the woven
 * source is parsed.
 *
 * The guard parses only ever reject more than the woven parse would; the woven
 * parse is still what enforces the cross-fragment early errors, because a
 * `"use strict"` directive in `body` governs duplicate/`eval`/`arguments`
 * parameter names declared in `P`.
 *
 * @param {string} parameterText
 * @param {string} bodyText
 * @returns {any} The lone `FunctionDeclaration` node.
 */
function parseDynamicFunction(parameterText, bodyText) {
  // 15.3.2.1 step 10: P alone must be a FormalParameterList.
  parseDynamicFunctionSource(`function anonymous(${parameterText}\n) {\n}`);
  // 15.3.2.1 step 11: body alone must be a FunctionBody.
  parseDynamicFunctionSource(`function anonymous(\n) {\n${bodyText}\n}`);

  return parseDynamicFunctionSource(
    `function anonymous(${parameterText}\n) {\n${bodyText}\n}`,
  );
}

/**
 * Parses one woven `function anonymous(...)` source and returns its lone
 * `FunctionDeclaration`, converting any parse failure into a guest
 * `SyntaxError`.
 *
 * @param {string} source
 * @returns {any} The lone `FunctionDeclaration` node.
 */
function parseDynamicFunctionSource(source) {
  let program;

  try {
    program = parseEval(source);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new GuestErrorSignal('SyntaxError', error.message);
    }

    throw error;
  }

  if (
    program.body.length !== 1 ||
    program.body[0].type !== 'FunctionDeclaration'
  ) {
    // Extra top-level statements mean `body` (or `P`) parsed as valid syntax
    // that reaches past the wrapper — e.g. `"1} function evil(){"` composes
    // into two declarations. That is not a single FunctionBody, so it is a
    // SyntaxError just like an outright parse failure.
    throw new GuestErrorSignal(
      'SyntaxError',
      'Function body is not a single function body',
    );
  }

  return program.body[0];
}
