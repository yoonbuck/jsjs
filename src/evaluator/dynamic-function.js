/**
 * The shared create step for dynamic `Function` and `%GeneratorFunction%`
 * constructors, layered over 13.2 "Creating Function Objects".
 *
 * Like `eval`, these constructors turn runtime *source text* into executable
 * guest code, so they need the engine's own parser and function builder. This
 * module therefore lives beside `eval.js` under `src/evaluator/` and is imported
 * by the corresponding builtins — the same sanctioned "builtin reaches the
 * evaluator" edge that `global-eval.js` documents, and for the same reason (the
 * builtin *is* an evaluator feature exposed to guest code).
 *
 * Calling or constructing either dynamic constructor is identical, so all four
 * builtin hooks funnel here.
 *
 * ### Composition strategy (and why it is not escapable)
 *
 * The parameter arguments are joined with commas into `P` and the last
 * argument becomes the function `body`. Rather than trust only the composed
 * source, the parameter and body fragments are first parsed independently.
 * They are then woven into `function anonymous(<P>\n) {\n<body>\n}` or
 * `function* anonymous(<P>\n) {\n<body>\n}` and parsed as a whole script. The
 * result must be exactly one matching, non-async `FunctionDeclaration` spanning
 * the entire program. An attempt by either fragment to smuggle syntax past the
 * synthetic delimiter therefore fails a guard parse or the exact-shape check.
 * The newline after `<P>` and before the closing brace stops a trailing line
 * comment in either fragment from swallowing the tokens the wrapper adds.
 *
 * Strictness is taken solely from the composed body's own directive prologue:
 * because the wrapper is parsed as ordinary, non-strict source, the parser
 * turns on strict mode and its parameter early errors only when the body itself
 * opens with `"use strict"`. Caller strictness is never inherited.
 */

import { toString } from '../runtime/conversion.js';
import { parseEval } from '../parser.js';
import { GuestErrorSignal } from '../runtime/completion.js';
import { createFunctionExecutionEnvironment } from '../runtime/environment.js';
import { createFunctionObject } from './declarations.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 * @typedef {import('../runtime/function-object.js').EngineFunction} EngineFunction
 * @typedef {'normal' | 'generator'} DynamicFunctionKind
 */

/**
 * Builds a normal or generator function object from dynamic constructor
 * arguments in `realm`.
 *
 * The created function's `[[Scope]]` is `realm`'s Global Environment (step 11),
 * never the calling function's scope, so a dynamic function built inside
 * another function cannot see that function's locals. Its Realm-owned
 * prototype, descriptors, constructibility, generator continuation, and
 * parameter instantiation come from the shared `createFunctionObject` path
 * rather than being assembled by hand.
 *
 * @param {Realm} realm The realm that owns the invoked dynamic constructor.
 * @param {readonly unknown[]} args
 * @param {DynamicFunctionKind} [kind='normal']
 * @returns {EngineFunction}
 */
export function createDynamicFunction(realm, args, kind = 'normal') {
  if (kind !== 'normal' && kind !== 'generator') {
    throw new TypeError(`Unsupported dynamic function kind: ${kind}`);
  }

  const { parameterText, bodyText } = coerceArguments(args, realm);
  const functionNode = parseDynamicFunction(parameterText, bodyText, kind);

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
      newTargetStatus: 'absent',
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
 * @param {import('../runtime/realm.js').Realm} realm
 * @returns {{ parameterText: string, bodyText: string }}
 */
function coerceArguments(args, realm) {
  const argCount = args.length;

  if (argCount === 0) {
    return { parameterText: '', bodyText: '' };
  }

  if (argCount === 1) {
    return { parameterText: '', bodyText: toString(args[0], realm) };
  }

  let parameterText = toString(args[0], realm);

  for (let k = 1; k < argCount - 1; k += 1) {
    parameterText += ',' + toString(args[k], realm);
  }

  const bodyText = toString(args[argCount - 1], realm);

  return { parameterText, bodyText };
}

/**
 * Parses the independently guarded fragments and the woven normal or generator
 * source as a single script `FunctionDeclaration`. A parse failure — or a parse
 * that yields anything other than the exact requested function — becomes a
 * realm-local guest `SyntaxError` materialized by the native-function boundary.
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
 * @param {DynamicFunctionKind} kind
 * @returns {any} The lone `FunctionDeclaration` node.
 */
function parseDynamicFunction(parameterText, bodyText, kind) {
  const functionPrefix = kind === 'generator' ? 'function*' : 'function';

  // 15.3.2.1 step 10: P alone must be a FormalParameterList.
  parseDynamicFunctionSource(
    `${functionPrefix} anonymous(${parameterText}\n) {\n}`,
    kind,
  );
  // 15.3.2.1 step 11: body alone must be a FunctionBody.
  parseDynamicFunctionSource(
    `${functionPrefix} anonymous(\n) {\n${bodyText}\n}`,
    kind,
  );

  return parseDynamicFunctionSource(
    `${functionPrefix} anonymous(${parameterText}\n) {\n${bodyText}\n}`,
    kind,
  );
}

/**
 * Parses one woven dynamic function source and returns its lone matching
 * `FunctionDeclaration`, converting any parse failure into a guest
 * `SyntaxError`.
 *
 * @param {string} source
 * @param {DynamicFunctionKind} kind
 * @returns {any} The lone `FunctionDeclaration` node.
 */
function parseDynamicFunctionSource(source, kind) {
  let program;

  try {
    program = parseEval(source);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new GuestErrorSignal('SyntaxError', error.message);
    }

    throw error;
  }

  const functionNode = program.body[0];
  const generator = kind === 'generator';

  if (
    program.type !== 'Program' ||
    program.sourceType !== 'script' ||
    program.start !== 0 ||
    program.end !== source.length ||
    program.body.length !== 1 ||
    functionNode?.type !== 'FunctionDeclaration' ||
    functionNode.start !== 0 ||
    functionNode.end !== source.length ||
    functionNode.generator !== generator ||
    functionNode.async === true
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

  return functionNode;
}
