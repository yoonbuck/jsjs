// The parser dependency is reached through `./parser-dependency.js`, the one
// engine module that names it: see that file for why the vendored build exists
// and how it keeps Node, browser, and `jsc` runs on the same source.
import { Parser } from './parser-dependency.js';
import { normalizeSyntaxError } from './runtime/errors.js';
import { hasUseStrictDirective } from './evaluator/directive.js';
import {
  parseFlags,
  RegExpSyntaxError,
  validatePattern,
} from './runtime/regexp-syntax.js';

const PARSER_OPTIONS = Object.freeze({
  ecmaVersion: 6,
  sourceType: 'script',
  locations: true,
  ranges: true,
});

/**
 * Parses with Acorn's base script parser. A named wrapper rather than a
 * detached `Parser.parse` reference because Acorn's static `parse` reads `this`
 * (`new this(...)`), so it must stay a method call.
 *
 * At `ecmaVersion: 6` Acorn interprets an identifier's Unicode escape
 * sequences *before* applying the ES §12.6 reserved-word rule, so an identifier
 * whose code points spell a reserved word (`var \u0063lass = 1`, a strict
 * escaped `yield` label, escaped `implements`/`package`/`private` bindings,
 * escaped `let` in a lexical declaration) is already a parse-phase
 * `SyntaxError`. The `ecmaVersion < 6` plugin that used to restore that check by
 * hand is therefore obsolete and has been removed; the upstream
 * `val-*-via-escape` / `value-yield-strict-escaped` tests still pass on Acorn's
 * native behavior.
 *
 * @param {string} source
 * @param {any} options
 * @returns {any}
 */
function parseWithScriptParser(source, options) {
  return Parser.parse(source, options);
}

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
 * At `ecmaVersion: 6` Acorn re-applies the reserved-word rule to escaped
 * identifiers itself (see `parseWithScriptParser`), so a strict eval rejects an
 * escaped strict FutureReservedWord (`\u0079ield`) exactly as a script does
 * without any plugin of ours.
 *
 * Constructed lazily and memoized so the subclass is built once.
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
  const { parse = parseWithScriptParser, ...parserOptions } = options;

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
    // Only the engine's own parser gets the stack-overflow conversion below.
    // An embedder that injected its own `parse` owns whatever that throws;
    // relabelling its overflow as a parse failure would hide its defect the
    // same way relabelling a host error inside the engine would hide ours.
    throw asParseFailure(error, parse === parseWithScriptParser);
  }

  return validateScriptProgram(program, source);
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
    throw asParseFailure(error, true);
  }

  return validateScriptProgram(program, source, strict);
}

/**
 * Validates the parsed program's shape and runs the parse-time early-error
 * pass. `strict` is the strictness the program *inherits* from its context —
 * always `false` for a script (whose strictness is decided solely by its own
 * directive prologue), and the caller-supplied flag for a strict `eval` that
 * inherits strictness with no directive of its own. The early-error pass folds
 * the program's own `"use strict"` directive in on top of it.
 *
 * `source` is the exact text the parser consumed, threaded through so the
 * unsupported-ES2015 pass can compare an `Identifier`'s raw source span
 * (`source.slice(node.start, node.end)`) against its interpreted `name` to
 * detect an ES2015 code-point escape (`\u{...}`), the way `checkUnreserved`
 * once compared the two.
 *
 * @param {unknown} program
 * @param {string} source
 * @param {boolean} [strict=false]
 * @returns {any}
 */
function validateScriptProgram(program, source, strict = false) {
  if (
    !program ||
    typeof program !== 'object' ||
    /** @type {any} */ (program).type !== 'Program' ||
    /** @type {any} */ (program).sourceType !== 'script' ||
    !Array.isArray(/** @type {any} */ (program).body)
  ) {
    throw new TypeError('Expected parser to return a script Program node');
  }

  checkStatementPositionFunctionDeclarations(
    /** @type {any} */ (program),
    source,
    strict,
  );

  return /** @type {any} */ (program);
}

/**
 * The five statement forms whose ES5.1 grammar body is a single `Statement`
 * and therefore cannot be a `FunctionDeclaration`.
 *
 * A `Map` rather than an object literal so a node whose `type` happens to
 * name an `Object.prototype` member (`constructor`, `toString`) cannot be
 * mistaken for one of these parents.
 *
 * @type {ReadonlyMap<string, string>}
 */
const STATEMENT_BODY_PARENT_LABELS = new Map([
  ['WithStatement', 'with statement'],
  ['WhileStatement', 'while statement'],
  ['DoWhileStatement', 'do-while statement'],
  ['ForStatement', 'for statement'],
  ['ForInStatement', 'for-in statement'],
]);

/**
 * The ES2015 node types the engine parses (because `ecmaVersion: 6` makes
 * Acorn accept them and run its own lexical-scope analysis) but does not yet
 * evaluate, mapped to the guest `SyntaxError` message that names the construct.
 *
 * Raising `PARSER_OPTIONS.ecmaVersion` to 6 is what enables `let`/`const`,
 * block scope, and their static early errors — the scope of this milestone —
 * but it also makes Acorn accept every *other* ES2015 grammar addition. None of
 * those are implemented, and silently parsing a `class` or an arrow function
 * that the evaluator then mishandles would be worse than refusing it, so this
 * pass — reached from `checkStatementPositionFunctionDeclarations`, which both
 * `parseScript` and `parseEval` funnel through — rejects each as a parse-time
 * early error, exactly the way the statement-position and regexp passes beside
 * it already do. `src/evaluator/eval.js` and `src/evaluator/dynamic-function.js`
 * convert the host `SyntaxError` into a realm-local guest one.
 *
 * A `Map` rather than an object literal for the same reason
 * `STATEMENT_BODY_PARENT_LABELS` gives: a node whose `type` names an
 * `Object.prototype` member (`constructor`, `toString`, `valueOf`) must not be
 * mistaken for an entry. `MethodDefinition`'s presence here makes that concrete
 * — a bare-object literal keyed by node type would answer `has('constructor')`
 * for every node.
 *
 * The three ES2015 additions that are not a distinct node type — a `Property`
 * that is computed/shorthand/method, a generator/async `Function*`, and a
 * binary/octal or code-point-escape `Literal` — are handled by
 * `checkUnsupportedEs2015Node` directly, since they turn on a flag rather than
 * on `node.type`.
 *
 * Each entry is one of three kinds, by *why* it fires (or does not). This was
 * established empirically: for every entry, a `sourceType: 'script'`,
 * `ecmaVersion: 6` snippet that would produce the node was parsed against the
 * vendored Acorn and the resulting AST inspected for the node type; the walk's
 * parent-first order (see `checkStatementPositionFunctionDeclarations`) then
 * determines which ancestor, if any, this pass rejects first.
 *
 * *Reachable* — this pass is what rejects the construct, because the node is the
 * first unsupported one the walk visits on some accepted parse:
 * `ClassDeclaration`, `ClassExpression`, `ArrowFunctionExpression`,
 * `TemplateLiteral`, `TaggedTemplateExpression`, `ForOfStatement`,
 * `ObjectPattern`, `ArrayPattern`, `AssignmentPattern`, `RestElement`,
 * `SpreadElement`, and `MetaProperty` (via `new.target` inside a function).
 *
 * *Parent-blocked* — the node genuinely appears in ASTs Acorn produces, but the
 * walk always rejects an ancestor first, so this entry never fires on its own.
 * These are defence-in-depth: were the walk order or a parent's flag ever to
 * change, the node would still be refused rather than silently evaluated.
 * - `ClassBody` / `MethodDefinition` occur only inside a class, rejected first
 *   at `ClassDeclaration` / `ClassExpression`. (`{ m() {} }` is a `Property`
 *   with `method: true`, not a `MethodDefinition`.)
 * - `TemplateElement` is a child of `TemplateLiteral`, rejected first.
 * - `YieldExpression` occurs only inside a generator, whose enclosing
 *   `Function` is rejected first by the `generator: true` flag check in
 *   `checkUnsupportedEs2015Node`.
 * - `Super` in `({ m() { return super.x; } })` is a valid ES6 script AST node,
 *   but its enclosing object-method `Property` (`method: true`) is rejected
 *   first by that same flag check. (`super` outside any method is instead a
 *   parse error Acorn raises itself.)
 *
 * *Acorn-blocked* — the parser refuses the source before any such node exists,
 * so this pass never sees it. Kept so a later `sourceType`/`ecmaVersion` change
 * cannot let one slip through silently.
 * - `AwaitExpression` is an ES2017 feature; at `ecmaVersion: 6` `await x` and
 *   `async function`/`async () =>` are parse errors Acorn raises itself, and the
 *   `async` flag is never set (see the flag check in `checkUnsupportedEs2015Node`).
 * - `ImportDeclaration` / `ExportNamedDeclaration` / `ExportDefaultDeclaration` /
 *   `ExportAllDeclaration` require `sourceType: 'module'`; in a script Acorn
 *   rejects them itself ("'import' and 'export' may appear only with
 *   'sourceType: module'"). `ImportExpression` (dynamic `import()`) is likewise
 *   rejected in a script at `ecmaVersion: 6` — it only becomes a script node at
 *   `ecmaVersion: 11`.
 *
 * @type {ReadonlyMap<string, string>}
 */
const UNSUPPORTED_ES2015_NODE_MESSAGES = new Map([
  ['ClassDeclaration', '`class` declarations are not supported'],
  ['ClassExpression', '`class` expressions are not supported'],
  ['ClassBody', '`class` bodies are not supported'],
  ['MethodDefinition', 'class and object methods are not supported'],
  ['ArrowFunctionExpression', 'arrow functions are not supported'],
  ['TemplateLiteral', 'template literals are not supported'],
  ['TemplateElement', 'template literals are not supported'],
  ['TaggedTemplateExpression', 'tagged template literals are not supported'],
  ['ForOfStatement', '`for`-`of` statements are not supported'],
  ['YieldExpression', 'generators and `yield` are not supported'],
  ['AwaitExpression', '`await` expressions are not supported'],
  ['ObjectPattern', 'destructuring patterns are not supported'],
  ['ArrayPattern', 'destructuring patterns are not supported'],
  ['AssignmentPattern', 'default value patterns are not supported'],
  ['RestElement', 'rest elements are not supported'],
  ['SpreadElement', 'spread elements are not supported'],
  ['Super', '`super` is not supported'],
  ['MetaProperty', '`new.target` is not supported'],
  ['ImportDeclaration', 'import declarations are not supported'],
  ['ImportExpression', 'dynamic `import` is not supported'],
  ['ExportNamedDeclaration', 'export declarations are not supported'],
  ['ExportDefaultDeclaration', 'export declarations are not supported'],
  ['ExportAllDeclaration', 'export declarations are not supported'],
]);

/**
 * Property keys that hold source-position metadata rather than child nodes;
 * skipped while walking so the traversal only descends into the AST proper.
 *
 * @type {ReadonlySet<string>}
 */
const NODE_POSITION_KEYS = new Set(['loc', 'range', 'start', 'end']);

/**
 * Rejects a `FunctionDeclaration` that sits in a statement position the ES5.1
 * grammar (with Annex B) forbids, as a parse-time early error.
 *
 * A `FunctionDeclaration` is a `SourceElement`, not a `Statement` (§12, §14),
 * so the single-`Statement` body of an iteration statement (§12.6), a `with`
 * (§12.10), an `if` branch, or a labelled statement cannot be one. Acorn
 * parses a function declaration in all of these positions anyway (it accepts
 * the Annex B web-reality forms uniformly), so this pass — reached from
 * `validateScriptProgram`, which both `parseScript` and `parseEval` funnel
 * through — is what makes scripts, direct `eval`, and the dynamic `Function`
 * constructor refuse them, matching JavaScriptCore and the `phase: parse`
 * upstream tests. Without it the evaluator would also spin forever on
 * `for (;;) function f(){}`.
 *
 * The exact rule, which is strictness-sensitive:
 *
 * - Iteration and `with` bodies: never a function declaration, in any mode —
 *   there is no Annex B tolerance for them. A surrounding label chain
 *   (`with (o) a: b: function f(){}`) does not help.
 * - `if` branch: Annex B B.3.4 tolerates a *bare* function declaration as a
 *   branch (`if (1) function f(){}`), but only in sloppy code. A label chain
 *   in a branch (`if (1) l: function f(){}`) is rejected in every mode, and in
 *   strict code even the bare form is rejected.
 * - Labelled statement body: Annex B B.3.2 tolerates a function declaration as
 *   a statement-list-level labelled body (`l: function f(){}`) in sloppy code;
 *   strict code forbids it. A labelled body that is itself an illegal position
 *   is already rejected by the enclosing loop/`with`/`if` rule above.
 *
 * Strictness is a property of the nearest function scope, not of the whole
 * program (§10.1.1): a strict function may nest in a sloppy script and vice
 * versa. The walk therefore carries the strictness of each node's enclosing
 * function (or program) scope, folding in each `FunctionDeclaration` /
 * `FunctionExpression` body's — and the `Program`'s — own directive prologue
 * on top of the inherited flag, plus the caller-supplied `rootStrict` that a
 * strict `eval` inherits with no directive.
 *
 * The walk is an explicit worklist rather than recursion: Acorn parses a
 * member chain iteratively and so accepts input far deeper than a recursive
 * walk survives, and a recursive walk here would turn valid deep programs
 * into a host `RangeError` escaping through `eval`. The visited set also
 * makes a cyclic tree — which the `parse` hook could hand us — terminate.
 *
 * @param {any} root
 * @param {string} source The exact text parsed, for the code-point-escape check.
 * @param {boolean} rootStrict
 * @returns {void}
 */
function checkStatementPositionFunctionDeclarations(root, source, rootStrict) {
  /** @type {{ node: any, strict: boolean }[]} */
  const pending = [{ node: root, strict: rootStrict }];
  /** @type {WeakSet<object>} */
  const seen = new WeakSet();

  while (pending.length > 0) {
    const item = /** @type {{ node: any, strict: boolean }} */ (pending.pop());
    const node = item.node;
    const strict = item.strict;

    if (!node || typeof node !== 'object') {
      continue;
    }

    if (seen.has(node)) {
      continue;
    }

    seen.add(node);

    if (Array.isArray(node)) {
      for (let index = node.length - 1; index >= 0; index -= 1) {
        pushChild(pending, node[index], strict);
      }
      continue;
    }

    if (typeof node.type !== 'string') {
      continue;
    }

    checkFunctionDeclarationPosition(node, strict);
    checkRegularExpressionLiteral(node);
    checkUnsupportedEs2015Node(node, source);

    const childStrict = childScopeStrictness(node, strict);
    const keys = Object.keys(node);

    for (let index = keys.length - 1; index >= 0; index -= 1) {
      if (!NODE_POSITION_KEYS.has(keys[index])) {
        pushChild(pending, node[keys[index]], childStrict);
      }
    }
  }
}

/**
 * The strictness that the children of `node` execute under. Strictness only
 * ever widens inward: once a scope is strict every nested scope is, and a
 * function or program body may additionally turn strict via its own directive
 * prologue. Non-scope nodes just pass the inherited flag through.
 *
 * @param {any} node
 * @param {boolean} strict
 * @returns {boolean}
 */
function childScopeStrictness(node, strict) {
  if (strict) {
    return true;
  }

  if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression'
  ) {
    const body = node.body;

    return (
      !!body && Array.isArray(body.body) && hasUseStrictDirective(body.body)
    );
  }

  if (node.type === 'Program') {
    return Array.isArray(node.body) && hasUseStrictDirective(node.body);
  }

  return false;
}

/**
 * Applies the statement-position early error to `node` given the strictness of
 * the scope it sits in, throwing on the first offending function declaration.
 *
 * @param {any} node
 * @param {boolean} strict
 * @returns {void}
 */
function checkFunctionDeclarationPosition(node, strict) {
  const parentLabel = STATEMENT_BODY_PARENT_LABELS.get(node.type);

  if (parentLabel !== undefined) {
    const offending = resolveBodyFunctionDeclaration(node.body);

    if (offending) {
      throw statementPositionFunctionError(
        `the body of a ${parentLabel}`,
        offending.fn,
      );
    }

    return;
  }

  if (node.type === 'IfStatement') {
    for (const branch of [node.consequent, node.alternate]) {
      const offending = resolveBodyFunctionDeclaration(branch);

      if (offending && (offending.labeled || strict)) {
        throw statementPositionFunctionError(
          'an if statement branch',
          offending.fn,
        );
      }
    }

    return;
  }

  if (node.type === 'LabeledStatement' && strict) {
    const offending = resolveBodyFunctionDeclaration(node);

    if (offending) {
      throw statementPositionFunctionError(
        'the body of a labelled statement',
        offending.fn,
      );
    }
  }
}

/**
 * Queues one candidate child, carrying the strictness of the scope it belongs
 * to. Children are pushed in reverse so popping visits them in source order,
 * which makes the first offending declaration in the program the one reported.
 *
 * @param {{ node: any, strict: boolean }[]} pending
 * @param {unknown} value
 * @param {boolean} strict
 * @returns {void}
 */
function pushChild(pending, value, strict) {
  if (value && typeof value === 'object') {
    pending.push({ node: value, strict });
  }
}

/**
 * Resolves the `FunctionDeclaration` a body `Statement` reduces to after
 * peeling any surrounding label chain, reporting whether such a chain was
 * present. A labelled statement's body is itself a `Statement`, so
 * `a: b: function f(){}` reduces to the function declaration with
 * `labeled: true`. Returns `undefined` when the body is an ordinary statement.
 *
 * The `labeled` flag is what distinguishes the `if`-branch cases: Annex B
 * B.3.4 tolerates only the bare (`labeled: false`) form, so a labelled chain
 * in a branch is rejected even in sloppy code.
 *
 * The visited set guards against a cyclic label chain, which a custom `parse`
 * hook could hand us.
 *
 * @param {any} statement
 * @returns {{ fn: any, labeled: boolean } | undefined}
 */
function resolveBodyFunctionDeclaration(statement) {
  let current = statement;
  let labeled = false;
  /** @type {WeakSet<object>} */
  const visited = new WeakSet();

  while (current && current.type === 'LabeledStatement') {
    if (visited.has(current)) {
      return undefined;
    }

    visited.add(current);
    labeled = true;
    current = current.body;
  }

  return current && current.type === 'FunctionDeclaration'
    ? { fn: current, labeled }
    : undefined;
}

/**
 * Builds the guest-facing `SyntaxError` for a rejected statement-position
 * function declaration, carrying the offending node's position through
 * `normalizeSyntaxError` so it reads like any other parse error.
 *
 * @param {string} context
 * @param {any} node
 * @returns {SyntaxError}
 */
function statementPositionFunctionError(context, node) {
  return normalizeSyntaxError({
    message: `Function declarations cannot appear as ${context}`,
    pos: typeof node.start === 'number' ? node.start : undefined,
    loc: node.loc ? node.loc.start : undefined,
  });
}

/**
 * Rejects an ES2015 construct the parser now accepts (because it runs at
 * `ecmaVersion: 6`) but the evaluator does not yet implement, as a parse-time
 * early error. See `UNSUPPORTED_ES2015_NODE_MESSAGES` for the rationale and the
 * full node-type table; this function adds the three cases that turn on a flag
 * rather than a distinct `node.type`:
 *
 * - a `Property` that is `computed` (`{ [k]: 1 }`), `shorthand` (`{ x }`), or a
 *   `method` (`{ m() {} }`) — the ES5.1 grammar has only `key: value`;
 * - a `FunctionDeclaration` / `FunctionExpression` that is a `generator`
 *   (`function* g(){}`) or `async`;
 * - a numeric `Literal` written in the ES2015 binary (`0b`) or octal (`0o`)
 *   forms, and any string `Literal` or `Identifier` carrying an ES2015
 *   code-point escape (`\u{...}`).
 *
 * The code-point escape is detected on `Literal.raw` for a string literal
 * (Acorn's verbatim source text of the literal) and, for an `Identifier`, on
 * the raw source span `source.slice(node.start, node.end)` — the interpreted
 * `name` no longer contains the backslash sequence, so the source is the only
 * place the escape survives, exactly as the former `checkUnreserved` plugin
 * compared the span to the name. A custom `parse` hook can hand us a node whose
 * `start`/`end` do not index `source`; the `typeof` guards below make that a
 * no-op rather than a spurious rejection.
 *
 * @param {any} node
 * @param {string} source
 * @returns {void}
 */
function checkUnsupportedEs2015Node(node, source) {
  const typeMessage = UNSUPPORTED_ES2015_NODE_MESSAGES.get(node.type);

  if (typeMessage !== undefined) {
    throw unsupportedEs2015Error(typeMessage, node);
  }

  if (
    node.type === 'Property' &&
    (node.computed || node.shorthand || node.method)
  ) {
    throw unsupportedEs2015Error(
      'computed, shorthand, and method object properties are not supported',
      node,
    );
  }

  if (
    (node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression') &&
    (node.generator || node.async)
  ) {
    throw unsupportedEs2015Error(
      node.async
        ? 'async functions are not supported'
        : 'generators and `yield` are not supported',
      node,
    );
  }

  if (node.type === 'Literal' && typeof node.raw === 'string') {
    if (/^0[bBoO]/.test(node.raw)) {
      throw unsupportedEs2015Error(
        'binary and octal numeric literals are not supported',
        node,
      );
    }

    if (typeof node.value === 'string' && hasCodePointEscape(node.raw)) {
      throw unsupportedEs2015Error(
        'unicode code-point escapes (`\\u{...}`) are not supported',
        node,
      );
    }
  }

  if (
    node.type === 'Identifier' &&
    typeof node.start === 'number' &&
    typeof node.end === 'number' &&
    hasCodePointEscape(source.slice(node.start, node.end))
  ) {
    throw unsupportedEs2015Error(
      'unicode code-point escapes (`\\u{...}`) are not supported',
      node,
    );
  }
}

/**
 * Whether `text` contains an ES2015 code-point escape `\u{...}` — a `u{`
 * introduced by an *odd*-length run of backslashes, so the final backslash is
 * an escape introducer rather than an escaped backslash.
 *
 * The naive `text.includes('\\u{')` misreads a string literal like `"\\u{"`,
 * whose source is an escaped backslash (`\\`) followed by the literal
 * characters `u{`: its raw text still contains the three characters `\u{`, but
 * the `u` is not escaped and there is no code-point escape. The upstream
 * `RegExp/unicode_restricted_identity_escape_u` tests, whose pattern strings
 * spell exactly that, are what force this distinction. Counting the preceding
 * backslashes is the same parity test a lexer applies to decide whether a
 * backslash starts an escape sequence.
 *
 * @param {string} text
 * @returns {boolean}
 */
function hasCodePointEscape(text) {
  for (
    let index = text.indexOf('u{');
    index !== -1;
    index = text.indexOf('u{', index + 1)
  ) {
    let backslashes = 0;

    for (let scan = index - 1; scan >= 0 && text[scan] === '\\'; scan -= 1) {
      backslashes += 1;
    }

    if (backslashes % 2 === 1) {
      return true;
    }
  }

  return false;
}

/**
 * Builds the guest-facing `SyntaxError` for a rejected unsupported-ES2015
 * construct, carrying the offending node's position through
 * `normalizeSyntaxError` so it reads like any other parse error.
 *
 * @param {string} message
 * @param {any} node
 * @returns {SyntaxError}
 */
function unsupportedEs2015Error(message, node) {
  return normalizeSyntaxError({
    message,
    pos: typeof node.start === 'number' ? node.start : undefined,
    loc: node.loc ? node.loc.start : undefined,
  });
}

/**
 * Turns whatever the parser threw into the host `SyntaxError` the rest of the
 * engine expects from a failed parse, and leaves anything else alone.
 *
 * Running out of host stack counts as a parse failure. Acorn already says so
 * itself — it wraps `parseTopLevel` and re-raises an overflow as `Not enough
 * stack space to parse input` — but it reads the *first* token before that
 * wrapper is installed, so source whose opening token alone is too deep to
 * tokenize (a regular-expression literal, whose pattern Acorn validates with
 * its own recursive descent while tokenizing) still escaped as a host
 * `RangeError`. Applying Acorn's own test to the whole call closes that seam,
 * so depth is reported the same way wherever it is reached: `eval` and
 * `Function` raise a catchable guest `SyntaxError`, and a script handed
 * straight to the embedder fails like any other unparsable script.
 *
 * The conversion is confined to a call into the engine's own parser. No guest
 * code and no evaluator code runs there — only Acorn and the reserved-word
 * plugin above it — so a `RangeError` raised by an engine defect cannot reach
 * this and be relabelled. `ownParser` is what enforces that: an embedder's
 * injected `parse` hook is excluded, because its defects are its own.
 *
 * @param {unknown} error
 * @param {boolean} ownParser Whether the engine's own parser produced `error`.
 * @returns {unknown} The error to throw.
 */
function asParseFailure(error, ownParser) {
  if (ownParser && isStackOverflow(error)) {
    return new SyntaxError('Not enough stack space to parse input');
  }

  if (isSyntaxErrorLike(error)) {
    return normalizeSyntaxError(error);
  }

  return error;
}

/**
 * Matches the message every engine we support uses for an exhausted stack:
 * `Maximum call stack size exceeded` (V8, JavaScriptCore), `too much
 * recursion` (SpiderMonkey). This is the same test Acorn applies in its own
 * `catchStackOverflow`, kept identical on purpose so the two agree.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isStackOverflow(error) {
  return (
    error instanceof RangeError &&
    (/\bstack\b.*\b(exceeded|overflow)\b/i.test(error.message) ||
      /\btoo much recursion\b/i.test(error.message))
  );
}

/**
 * Rejects a `RegularExpressionLiteral` whose pattern or flags fall outside the
 * ES5.1 §15.10.1 grammar, as a parse-time early error.
 *
 * ES5.1 §7.8.5 defines a literal's [[Value]] as the result of
 * `new RegExp(Pattern, Flags)` and then requires that "if the call to new
 * RegExp would generate an error ... the error must be treated as an early
 * error (Clause 16)". Acorn validates the literal against the *host's*
 * grammar, which is Annex B-permissive and post-ES5, so a pattern like `/]/`,
 * `/\a/`, or `/\01/` parses successfully there and would otherwise only be
 * rejected when the literal expression was evaluated — too late, and never at
 * all for a literal in unreachable code.
 *
 * Running it here, in the pass both `parseScript` and `parseEval` funnel
 * through, is what makes scripts, direct and indirect `eval`, and the dynamic
 * `Function` constructor all refuse such a literal before any of the program
 * runs. `src/evaluator/eval.js` and `src/evaluator/dynamic-function.js`
 * convert the host `SyntaxError` this raises into a realm-local guest one, the
 * same way they already do for an outright parse failure.
 *
 * `node.regex` is Acorn's own record of the literal's raw pattern and flag
 * text, which is exactly what §7.8.5 hands to `new RegExp`.
 *
 * @param {any} node
 * @returns {void}
 */
function checkRegularExpressionLiteral(node) {
  if (node.type !== 'Literal' || !node.regex) {
    return;
  }

  try {
    parseFlags(node.regex.flags);
    validatePattern(node.regex.pattern);
  } catch (error) {
    // This validator is a recursive descent over guest text, and it runs
    // after Acorn's own has already accepted the literal. Which of the two
    // runs out of host stack first is a race between two host-dependent
    // thresholds, so without this the embedder inherits a raw `RangeError`
    // for a pattern that is merely too deep — the same seam `asParseFailure`
    // closes for the parser proper, reached one pass later. Depth met while
    // parsing is a failure to parse.
    if (isStackOverflow(error)) {
      throw new SyntaxError('Not enough stack space to parse input');
    }

    if (!(error instanceof RegExpSyntaxError)) {
      throw error;
    }

    throw normalizeSyntaxError({
      message: error.message,
      pos: typeof node.start === 'number' ? node.start : undefined,
      loc: node.loc ? node.loc.start : undefined,
    });
  }
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
