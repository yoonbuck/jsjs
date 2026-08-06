// The parser dependency is reached through `./parser-dependency.js`, the one
// engine module that names it: see that file for why the vendored build exists
// and how it keeps Node, browser, and `jsc` runs on the same source.
import { parse as acornParse, Parser } from './parser-dependency.js';
import { normalizeSyntaxError } from './runtime/errors.js';

const PARSER_OPTIONS = Object.freeze({
  ecmaVersion: 5,
  sourceType: 'script',
  locations: true,
  ranges: true,
});

/**
 * A parser subclass that begins parsing already in strict mode (ECMA-262
 * 10.1.1). Acorn only switches a script into strict parsing when it actually
 * reads a `"use strict"` directive, but `eval` code can be strict by
 * *inheritance* from a direct strict caller with no directive of its own
 * (10.4.2.1). Forcing `this.strict = true` in the constructor makes the
 * parser apply every strict-mode early error — rejecting `var eval = 1`,
 * `with (x) {}`, legacy octal literals, duplicate parameter names, and the
 * rest — to source that carries no directive, which is exactly what strict
 * eval requires. Prepending a synthetic `"use strict";` to the source would
 * shift positions and is deliberately avoided.
 *
 * Constructed lazily and memoized so the plugin subclass is built once.
 *
 * @type {typeof Parser | undefined}
 */
let strictParser;

/**
 * @returns {typeof Parser}
 */
function getStrictParser() {
  if (strictParser === undefined) {
    strictParser = Parser.extend(
      (Base) =>
        class extends Base {
          /**
           * @param {any} options
           * @param {string} input
           * @param {number} [startPos]
           */
          constructor(options, input, startPos) {
            super(options, input, startPos);
            this.strict = true;
          }
        },
    );
  }

  return strictParser;
}

/**
 * @param {string} source
 * @param {Record<string, unknown>} [options]
 * @returns {any}
 */
export function parseScript(source, options = {}) {
  const { parse = acornParse, ...parserOptions } = options;

  if (typeof parse !== 'function') {
    throw new TypeError('Expected options.parse to be a function');
  }

  let program;

  try {
    program = parse(source, {
      ...parserOptions,
      ...PARSER_OPTIONS,
    });
  } catch (error) {
    if (isSyntaxErrorLike(error)) {
      throw normalizeSyntaxError(error);
    }

    throw error;
  }

  return validateScriptProgram(program);
}

/**
 * Parses dynamic `eval` source as a `Program` (ECMA-262 15.1.2.1 step 2).
 *
 * When `strict` is true the forced-strict parser is used so a strict eval
 * gets ES5 strict early errors even though the source carries no `"use
 * strict"` directive; otherwise the ordinary parser runs and Acorn still
 * turns on strict parsing by itself if the source *does* open with a
 * directive. A parse failure is normalized to a host `SyntaxError` exactly
 * as `parseScript` does — the eval entry point in `src/evaluator/eval.js`
 * converts that into a realm-local guest `SyntaxError`.
 *
 * @param {string} source
 * @param {boolean} [strict=false]
 * @returns {any}
 */
export function parseEval(source, strict = false) {
  const parser = strict ? getStrictParser() : Parser;

  let program;

  try {
    program = parser.parse(source, PARSER_OPTIONS);
  } catch (error) {
    if (isSyntaxErrorLike(error)) {
      throw normalizeSyntaxError(error);
    }

    throw error;
  }

  return validateScriptProgram(program);
}

/**
 * @param {unknown} program
 * @returns {any}
 */
function validateScriptProgram(program) {
  if (
    !program ||
    typeof program !== 'object' ||
    /** @type {any} */ (program).type !== 'Program' ||
    /** @type {any} */ (program).sourceType !== 'script' ||
    !Array.isArray(/** @type {any} */ (program).body)
  ) {
    throw new TypeError('Expected parser to return a script Program node');
  }

  checkStatementPositionFunctionDeclarations(/** @type {any} */ (program));

  return /** @type {any} */ (program);
}

/**
 * The five statement forms whose ES5.1 grammar body is a single `Statement`
 * and therefore cannot be a `FunctionDeclaration`.
 *
 * @type {Record<string, string>}
 */
const STATEMENT_BODY_PARENT_LABELS = Object.freeze({
  WithStatement: 'with statement',
  WhileStatement: 'while statement',
  DoWhileStatement: 'do-while statement',
  ForStatement: 'for statement',
  ForInStatement: 'for-in statement',
});

/**
 * Property keys that hold source-position metadata rather than child nodes;
 * skipped while walking so the traversal only descends into the AST proper.
 *
 * @type {ReadonlySet<string>}
 */
const NODE_POSITION_KEYS = new Set(['loc', 'range', 'start', 'end']);

/**
 * Rejects a `FunctionDeclaration` that sits in a single-`Statement` body
 * position as a parse-time early error.
 *
 * ES5.1's iteration statements (§12.6) and `with` (§12.10) take a
 * `Statement` for their body, and a `FunctionDeclaration` is a
 * `SourceElement`, not a `Statement` (§12, §14) — see the note in
 * `src/evaluator/declarations.js`. Acorn nonetheless parses a function
 * declaration in those positions (it accepts the Annex B web-reality forms
 * uniformly), so without this pass the evaluator would run
 * `while (0) function f(){}` and, worse, spin forever on
 * `for (;;) function f(){}`. Rejecting here — from `validateScriptProgram`,
 * which both `parseScript` and `parseEval` funnel through — makes scripts,
 * direct `eval`, and the dynamic `Function` constructor all refuse it as a
 * `SyntaxError`, matching every real engine and the upstream `decl-fun.js` /
 * `labelled-fn-stmt.js` tests (which are `phase: parse`).
 *
 * The rejection is deliberately narrow to the five body-`Statement` parents
 * above. A function declaration stays accepted as an `if` branch
 * (`if (1) function f(){}`, Annex B B.3.4), as a labelled statement at
 * statement-list level (`l: function f(){}`, Annex B B.3.2), and inside a
 * block (`{ function f(){} }`) — all of which JavaScriptCore also accepts.
 * A labelled chain that ultimately wraps a function declaration
 * (`with (o) a: b: function f(){}`) is rejected too, because the label
 * chain does not turn a `SourceElement` into a `Statement` in body position.
 *
 * @param {any} node
 * @returns {void}
 */
function checkStatementPositionFunctionDeclarations(node) {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (Array.isArray(node)) {
    for (const element of node) {
      checkStatementPositionFunctionDeclarations(element);
    }
    return;
  }

  if (typeof node.type !== 'string') {
    return;
  }

  if (node.type in STATEMENT_BODY_PARENT_LABELS) {
    const offending = unwrapLabeledFunctionDeclaration(node.body);

    if (offending) {
      throw statementPositionFunctionError(node.type, offending);
    }
  }

  for (const key of Object.keys(node)) {
    if (!NODE_POSITION_KEYS.has(key)) {
      checkStatementPositionFunctionDeclarations(node[key]);
    }
  }
}

/**
 * Returns the `FunctionDeclaration` a body `Statement` resolves to after
 * peeling any surrounding label chain, or `undefined` when the body is an
 * ordinary statement. A labelled statement's body is itself a `Statement`,
 * so `a: b: function f(){}` unwraps to the function declaration.
 *
 * @param {any} statement
 * @returns {any}
 */
function unwrapLabeledFunctionDeclaration(statement) {
  let current = statement;

  while (current && current.type === 'LabeledStatement') {
    current = current.body;
  }

  return current && current.type === 'FunctionDeclaration'
    ? current
    : undefined;
}

/**
 * Builds the guest-facing `SyntaxError` for a rejected statement-position
 * function declaration, carrying the offending node's position through
 * `normalizeSyntaxError` so it reads like any other parse error.
 *
 * @param {string} parentType
 * @param {any} node
 * @returns {SyntaxError}
 */
function statementPositionFunctionError(parentType, node) {
  const label = STATEMENT_BODY_PARENT_LABELS[parentType] ?? 'statement';

  return normalizeSyntaxError({
    message: `Function declarations cannot appear as the body of a ${label}`,
    pos: typeof node.start === 'number' ? node.start : undefined,
    loc: node.loc ? node.loc.start : undefined,
  });
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isSyntaxErrorLike(error) {
  return (
    error instanceof SyntaxError ||
    (!!error &&
      typeof error === 'object' &&
      typeof (/** @type {any} */ (error).message) === 'string' &&
      typeof (/** @type {any} */ (error).pos) === 'number' &&
      !!(/** @type {any} */ (error).loc))
  );
}
