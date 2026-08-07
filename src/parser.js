// The parser dependency is reached through `./parser-dependency.js`, the one
// engine module that names it: see that file for why the vendored build exists
// and how it keeps Node, browser, and `jsc` runs on the same source.
import { Parser } from './parser-dependency.js';
import { normalizeSyntaxError } from './runtime/errors.js';
import { hasUseStrictDirective } from './evaluator/directive.js';

const PARSER_OPTIONS = Object.freeze({
  ecmaVersion: 5,
  sourceType: 'script',
  locations: true,
  ranges: true,
});

/**
 * An Acorn plugin that restores the ES5.1 §7.6 / §7.6.1 rule Acorn drops for
 * scripts parsed as `ecmaVersion < 6`: a `ReservedWord` is matched against the
 * *IdentifierName* only after its Unicode escape sequences are interpreted, so
 * an identifier whose code points spell a reserved word is never a valid
 * `Identifier`. Acorn's `checkUnreserved` returns early — before its
 * reserved-word test — for any identifier whose source contains a backslash
 * when `ecmaVersion < 6` (a deliberate ES3-era liberty), so it accepts
 * `var \u0063lass = 1` and a strict-mode escaped `yield` label. Both are
 * parse-phase `SyntaxError`s in every real engine and in the upstream
 * `val-*-via-escape` / `value-yield-strict-escaped` tests.
 *
 * The override re-applies the reserved-word test to the already-unescaped
 * `name`, but only when the raw source span differs from that name — i.e. only
 * when the identifier actually carried an escape — and then defers to the base
 * method so every non-escaped case, keyword, and binding restriction is handled
 * exactly as before. Acorn only calls `checkUnreserved` for `Identifier`
 * positions (bindings, references, labels) and skips it for the `IdentifierName`
 * positions (`obj.class`, `{ class: 1 }`) that parse a liberal identifier, so
 * reserved words stay legal as property names.
 *
 * @param {typeof Parser} Base
 * @returns {typeof Parser}
 */
function withEscapedReservedWordCheck(Base) {
  /**
   * The base prototype, reached as `any` so calling its `checkUnreserved`
   * type-checks: Acorn's `Parser` type declares neither that method nor the
   * `reservedWords`/`strict`/`raiseRecoverable` internals this override uses.
   * Calling through the prototype is equivalent to `super.checkUnreserved`.
   */
  const baseProto = /** @type {any} */ (Base).prototype;

  return class extends Base {
    /**
     * @param {any} node
     * @returns {void}
     */
    checkUnreserved(node) {
      const self = /** @type {any} */ (this);

      if (self.input.slice(node.start, node.end) !== node.name) {
        const reserved = self.strict
          ? self.reservedWordsStrict
          : self.reservedWords;

        if (reserved.test(node.name)) {
          self.raiseRecoverable(
            node.start,
            `The keyword '${node.name}' is reserved`,
          );
        }
      }

      baseProto.checkUnreserved.call(this, node);
    }
  };
}

/**
 * The ordinary script parser, an Acorn subclass carrying the escaped
 * reserved-word early error. Constructed lazily and memoized so the plugin
 * subclass is built once.
 *
 * @type {typeof Parser | undefined}
 */
let scriptParser;

/**
 * @returns {typeof Parser}
 */
function getScriptParser() {
  if (scriptParser === undefined) {
    scriptParser = Parser.extend(withEscapedReservedWordCheck);
  }

  return scriptParser;
}

/**
 * Parses with the memoized script parser. A named wrapper rather than a
 * detached `getScriptParser().parse` reference because Acorn's static `parse`
 * reads `this` (`new this(...)`), so it must stay a method call.
 *
 * @param {string} source
 * @param {any} options
 * @returns {any}
 */
function parseWithScriptParser(source, options) {
  return getScriptParser().parse(source, options);
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
 * It also carries the escaped reserved-word early error, so a strict eval
 * rejects an escaped strict FutureReservedWord (`\u0079ield`) exactly as a
 * script does.
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
      withEscapedReservedWordCheck,
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
    throw asParseFailure(error);
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
  const parser = strict ? getStrictParser() : getScriptParser();

  let program;

  try {
    program = parser.parse(source, PARSER_OPTIONS);
  } catch (error) {
    throw asParseFailure(error);
  }

  return validateScriptProgram(program, strict);
}

/**
 * Validates the parsed program's shape and runs the parse-time early-error
 * pass. `strict` is the strictness the program *inherits* from its context —
 * always `false` for a script (whose strictness is decided solely by its own
 * directive prologue), and the caller-supplied flag for a strict `eval` that
 * inherits strictness with no directive of its own. The early-error pass folds
 * the program's own `"use strict"` directive in on top of it.
 *
 * @param {unknown} program
 * @param {boolean} [strict=false]
 * @returns {any}
 */
function validateScriptProgram(program, strict = false) {
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
 * @param {boolean} rootStrict
 * @returns {void}
 */
function checkStatementPositionFunctionDeclarations(root, rootStrict) {
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
 * The conversion is confined to the `parse` call, which runs no engine code
 * beyond the parser, so a `RangeError` from an engine defect is never
 * relabelled by it.
 *
 * @param {unknown} error
 * @returns {unknown} The error to throw.
 */
function asParseFailure(error) {
  if (isStackOverflow(error)) {
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
