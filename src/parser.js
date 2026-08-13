// The parser dependency is reached through `./parser-dependency.js`, the one
// engine module that names it: see that file for why the vendored build exists
// and how it keeps Node, browser, and `jsc` runs on the same source.
import { Parser } from './parser-dependency.js';
import {
  normalizeSyntaxError,
  UnsupportedNodeError,
} from './runtime/errors.js';
import { hasUseStrictDirective } from './evaluator/directive.js';
import { boundNames } from './evaluator/static-semantics.js';
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
  ['ForOfStatement', 'for-of statement'],
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
 * `ObjectPattern`, `ArrayPattern`,
 * `AssignmentPattern`, `RestElement`, and
 * `MetaProperty` (via `new.target` inside a function). `SpreadElement` is
 * handled shape-sensitively by `unsupportedEs2015Message`, because array
 * elements and call/construction argument lists are implemented while all
 * other placements remain unsupported.
 *
 * *Parent-blocked* — the node genuinely appears in ASTs Acorn produces, but the
 * walk always rejects an ancestor first, so this entry never fires on its own.
 * These are defence-in-depth: were the walk order or a parent's flag ever to
 * change, the node would still be refused rather than silently evaluated.
 * - `YieldExpression` occurs only inside a generator, whose enclosing
 *   `Function` is rejected first by the `generator: true` flag check in
 *   `checkUnsupportedEs2015Node`.
 *
 * Template literals, elements, and tagged-template expressions are supported,
 * but their dedicated validators still require the exact ESTree parent,
 * quasi/expression count, raw/cooked value, and tail shapes before evaluator
 * dispatch can reach them.
 *
 * `Super` is deliberately absent from the table: object-literal methods and
 * accessors both carry a `[[HomeObject]]`, so their `super` property references
 * are implemented (see `src/runtime/super-reference.js`). A concise method is a
 * `Property` with `method: true`; an accessor has `kind: 'get'`/`'set'` and
 * `method: false`. `super` outside either context is a parse error Acorn raises
 * itself.
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
  ['YieldExpression', 'generators and `yield` are not supported'],
  ['AwaitExpression', '`await` expressions are not supported'],
  ['ObjectPattern', 'destructuring patterns are not supported'],
  ['ArrayPattern', 'destructuring patterns are not supported'],
  ['AssignmentPattern', 'default value patterns are not supported'],
  ['RestElement', 'rest elements are not supported'],
  ['MetaProperty', '`new.target` is not supported'],
  ['ImportDeclaration', 'import declarations are not supported'],
  ['ImportExpression', 'dynamic `import` is not supported'],
  ['ExportNamedDeclaration', 'export declarations are not supported'],
  ['ExportDefaultDeclaration', 'export declarations are not supported'],
  ['ExportAllDeclaration', 'export declarations are not supported'],
]);

/**
 * Every expression node the evaluator dispatches. The parser keeps this
 * capability boundary explicit because custom parser hooks can attach a
 * recognized expression-shaped object to arbitrary metadata fields.
 *
 * @type {ReadonlySet<string>}
 */
const SUPPORTED_EXPRESSION_TYPES = new Set([
  'Literal',
  'Identifier',
  'ThisExpression',
  'UnaryExpression',
  'BinaryExpression',
  'LogicalExpression',
  'ConditionalExpression',
  'AssignmentExpression',
  'UpdateExpression',
  'CallExpression',
  'MemberExpression',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ClassExpression',
  'ObjectExpression',
  'ArrayExpression',
  'NewExpression',
  'SequenceExpression',
  'TemplateLiteral',
  'TaggedTemplateExpression',
]);

const UNSUPPORTED_CLASS_DEFINITION_FIELDS = [
  'decorators',
  'typeParameters',
  'typeArguments',
  'superTypeParameters',
  'superTypeArguments',
  'implements',
  'abstract',
  'declare',
];

const UNSUPPORTED_CLASS_METHOD_FIELDS = [
  'decorators',
  'accessibility',
  'abstract',
  'declare',
  'definite',
  'optional',
  'override',
  'readonly',
  'returnType',
  'typeParameters',
  'typeArguments',
  'variance',
];

const UNSUPPORTED_CLASS_METHOD_FUNCTION_FIELDS = [
  'decorators',
  'typeParameters',
  'typeArguments',
  'returnType',
  'predicate',
  'declare',
];

/**
 * Every AST node type this parser capability boundary recognizes. The direct
 * statement and expression types match the evaluator dispatch tables; the
 * remaining structural nodes are consumed by the evaluator or parser's
 * context-sensitive gates. Explicitly blocked ES2015 types stay recognized so
 * their dedicated early-error messages remain reachable.
 *
 * Objects without a string `type` are metadata rather than AST nodes and are
 * intentionally skipped by the iterative walk below.
 *
 * @type {ReadonlySet<string>}
 */
const RECOGNIZED_AST_NODE_TYPES = new Set([
  'Program',
  'ExpressionStatement',
  'EmptyStatement',
  'BlockStatement',
  'VariableDeclaration',
  'FunctionDeclaration',
  'IfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'BreakStatement',
  'ContinueStatement',
  'ReturnStatement',
  'ThrowStatement',
  'TryStatement',
  'SwitchStatement',
  'LabeledStatement',
  'DebuggerStatement',
  'WithStatement',
  'Literal',
  'Identifier',
  'ThisExpression',
  'UnaryExpression',
  'BinaryExpression',
  'LogicalExpression',
  'ConditionalExpression',
  'AssignmentExpression',
  'UpdateExpression',
  'CallExpression',
  'MemberExpression',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ClassDeclaration',
  'ClassExpression',
  'ClassBody',
  'MethodDefinition',
  'ObjectExpression',
  'ArrayExpression',
  'NewExpression',
  'SequenceExpression',
  'VariableDeclarator',
  'SwitchCase',
  'CatchClause',
  'Property',
  'Super',
  'SpreadElement',
  'TemplateLiteral',
  'TemplateElement',
  'TaggedTemplateExpression',
  ...UNSUPPORTED_ES2015_NODE_MESSAGES.keys(),
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
 * - `if` branch: reject a function declaration in every mode. Annex B B.3.4
 *   specifies sloppy-mode semantics for the bare form
 *   (`if (1) function f(){}`), but the evaluator does not implement those
 *   semantics yet, so accepting it would silently mis-scope the declaration.
 * - Labelled statement body: Annex B B.3.2 tolerates a function declaration as
 *   a statement-list-level labelled body (`l: function f(){}`) in sloppy code;
 *   strict code forbids it. A labelled body that is itself an illegal position
 *   is already rejected by the enclosing loop/`with`/`if` rule above.
 *
 * Strictness is a property of the nearest function scope, not of the whole
 * program (§10.1.1): a strict function may nest in a sloppy script and vice
 * versa. The walk therefore carries the strictness of each node's enclosing
 * function (or program) scope, folding in each `FunctionDeclaration` /
 * `FunctionExpression` / block-body arrow bodies' — and the `Program`'s — own directive prologue
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
  /** @type {{ node: any, strict: boolean, superAllowed: boolean, superCallAllowed: boolean, classDerived: boolean | undefined, parent: any, parentKey: string | number | undefined, parentIndex: number | undefined, patternContext: 'binding' | 'assignment' | undefined }[]} */
  const pending = [
    {
      node: root,
      strict: rootStrict,
      superAllowed: false,
      superCallAllowed: false,
      classDerived: undefined,
      parent: null,
      parentKey: undefined,
      parentIndex: undefined,
      patternContext: undefined,
    },
  ];
  /** @type {WeakMap<object, { parent: any, parentKey: string | number | undefined, parentIndex: number | undefined, strict: boolean, superAllowed: boolean, superCallAllowed: boolean, classDerived: boolean | undefined, patternContext: 'binding' | 'assignment' | undefined }[]>} */
  const seen = new WeakMap();

  while (pending.length > 0) {
    const item =
      /** @type {{ node: any, strict: boolean, superAllowed: boolean, superCallAllowed: boolean, classDerived: boolean | undefined, parent: any, parentKey: string | number | undefined, parentIndex: number | undefined, patternContext: 'binding' | 'assignment' | undefined }} */ (
        pending.pop()
      );
    const node = item.node;
    const strict = item.strict;

    if (!node || typeof node !== 'object') {
      continue;
    }

    const contexts = seen.get(node);

    if (contexts !== undefined) {
      let alreadySeen = false;

      for (const context of contexts) {
        if (
          context.parent === item.parent &&
          context.parentKey === item.parentKey &&
          context.parentIndex === item.parentIndex &&
          context.strict === strict &&
          context.superAllowed === item.superAllowed &&
          context.superCallAllowed === item.superCallAllowed &&
          context.classDerived === item.classDerived &&
          context.patternContext === item.patternContext
        ) {
          alreadySeen = true;
          break;
        }
      }

      if (alreadySeen) {
        continue;
      }

      contexts.push({
        parent: item.parent,
        parentKey: item.parentKey,
        parentIndex: item.parentIndex,
        strict,
        superAllowed: item.superAllowed,
        superCallAllowed: item.superCallAllowed,
        classDerived: item.classDerived,
        patternContext: item.patternContext,
      });
    } else {
      seen.set(node, [
        {
          parent: item.parent,
          parentKey: item.parentKey,
          parentIndex: item.parentIndex,
          strict,
          superAllowed: item.superAllowed,
          superCallAllowed: item.superCallAllowed,
          classDerived: item.classDerived,
          patternContext: item.patternContext,
        },
      ]);
    }

    if (Array.isArray(node)) {
      for (let index = node.length - 1; index >= 0; index -= 1) {
        pushChild(
          pending,
          node[index],
          strict,
          item.superAllowed,
          item.superCallAllowed,
          item.classDerived,
          item.parent,
          item.parentKey,
          item.patternContext,
          index,
        );
      }
      continue;
    }

    if (typeof node.type !== 'string') {
      continue;
    }

    checkFunctionDeclarationPosition(node, strict);
    checkRegularExpressionLiteral(node);
    checkUnsupportedEs2015Node(
      node,
      source,
      item.parent,
      item.parentKey,
      item.patternContext,
      item.parentIndex,
      item.superAllowed,
      item.superCallAllowed,
    );
    checkStrictBindingIdentifier(
      node,
      item.parent,
      item.parentKey,
      item.patternContext,
      strict,
    );
    checkFunctionParameterEarlyErrors(node, strict);

    const childStrict = childScopeStrictness(node, strict);
    const childSuperAllowed = superAllowedForChildren(
      node,
      item.parent,
      item.parentKey,
      item.superAllowed,
    );
    const childSuperCallAllowed = superCallAllowedForChildren(
      node,
      item.parent,
      item.parentKey,
      item.superCallAllowed,
      item.classDerived,
    );
    const keys = Object.keys(node);

    for (let index = keys.length - 1; index >= 0; index -= 1) {
      if (!NODE_POSITION_KEYS.has(keys[index])) {
        pushChild(
          pending,
          node[keys[index]],
          childStrict,
          childSuperAllowed,
          childSuperCallAllowed,
          classDerivedForChild(node, keys[index], item.classDerived),
          node,
          keys[index],
          patternContextForChild(node, keys[index], item.patternContext),
        );
      }
    }
  }
}

/**
 * Applies the ES2015 early errors Acorn 8 does not enforce when parsing with
 * `ecmaVersion: 6`: a non-simple list cannot contain duplicate bound names, and
 * its function body cannot contain a "use strict" directive.
 *
 * @param {any} node
 * @param {boolean} strict
 * @returns {void}
 */
function checkFunctionParameterEarlyErrors(node, strict) {
  if (!isFunctionNode(node)) {
    return;
  }

  const simple = /** @type {any[]} */ (node.params).every(
    (parameter) => parameter.type === 'Identifier',
  );

  if (simple && !strict && node.type !== 'ArrowFunctionExpression') {
    return;
  }

  if (
    !simple &&
    node.body &&
    Array.isArray(node.body.body) &&
    hasUseStrictDirective(node.body.body)
  ) {
    throw unsupportedEs2015Error(
      'Illegal "use strict" directive in function with non-simple parameter list',
      node,
    );
  }

  const seen = new Set();

  for (const parameter of node.params) {
    if (hasBindingPatternCycle(parameter)) {
      // The main AST walk is cycle-aware and will validate the reachable
      // shapes; skip duplicate-name collection rather than looping here.
      return;
    }

    let names;

    try {
      names = boundNames(parameter);
    } catch (error) {
      if (error instanceof UnsupportedNodeError) {
        // The shape-aware capability walk will reject this parameter with a
        // positioned SyntaxError when it visits the unsupported child.
        return;
      }

      throw error;
    }

    for (const name of names) {
      if (seen.has(name)) {
        throw unsupportedEs2015Error(
          'Duplicate parameter name not allowed in this context',
          parameter,
        );
      }

      seen.add(name);
    }
  }
}

/**
 * The host parser catches these for source text, but a custom parser hook can
 * hand the evaluator an otherwise plausible strict class method tree. Keep the
 * capability boundary equally strict for those ASTs.
 *
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {'binding' | 'assignment' | undefined} patternContext
 * @param {boolean} strict
 * @returns {void}
 */
function checkStrictBindingIdentifier(
  node,
  parent,
  parentKey,
  patternContext,
  strict,
) {
  if (
    !isIdentifierNode(node) ||
    (node.name !== 'eval' && node.name !== 'arguments')
  ) {
    return;
  }

  const functionName =
    (parent?.type === 'FunctionDeclaration' ||
      parent?.type === 'FunctionExpression') &&
    parentKey === 'id';
  const className =
    (parent?.type === 'ClassDeclaration' ||
      parent?.type === 'ClassExpression') &&
    parentKey === 'id';
  const catchParameter =
    parent?.type === 'CatchClause' && parentKey === 'param';

  if (!strict && !className) {
    return;
  }

  if (
    patternContext === 'binding' ||
    functionName ||
    className ||
    catchParameter
  ) {
    throw unsupportedEs2015Error(`Binding ${node.name} in strict mode`, node);
  }
}

/**
 * @param {any} root
 * @returns {boolean}
 */
function hasBindingPatternCycle(root) {
  const visiting = new WeakSet();
  const visited = new WeakSet();
  /** @type {{ node: any, exiting: boolean }[]} */
  const pending = [{ node: root, exiting: false }];

  while (pending.length > 0) {
    const { node, exiting } = /** @type {{ node: any, exiting: boolean }} */ (
      pending.pop()
    );

    if (!node || typeof node !== 'object') {
      continue;
    }

    if (exiting) {
      visiting.delete(node);
      visited.add(node);
      continue;
    }

    if (visited.has(node)) {
      continue;
    }

    if (visiting.has(node)) {
      return true;
    }

    visiting.add(node);
    pending.push({ node, exiting: true });

    switch (node.type) {
      case 'AssignmentPattern':
        pending.push({ node: node.left, exiting: false });
        break;
      case 'RestElement':
        pending.push({ node: node.argument, exiting: false });
        break;
      case 'ArrayPattern':
        for (const element of node.elements) {
          if (element !== null) {
            pending.push({ node: element, exiting: false });
          }
        }
        break;
      case 'ObjectPattern':
        for (const property of node.properties) {
          pending.push({
            node: property.type === 'Property' ? property.value : property,
            exiting: false,
          });
        }
        break;
    }
  }

  return false;
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
    node.type === 'FunctionExpression' ||
    (node.type === 'ArrowFunctionExpression' &&
      node.body?.type === 'BlockStatement')
  ) {
    const body = node.body;

    return (
      !!body && Array.isArray(body.body) && hasUseStrictDirective(body.body)
    );
  }

  if (node.type === 'ClassBody') {
    return true;
  }

  if (node.type === 'Program') {
    return Array.isArray(node.body) && hasUseStrictDirective(node.body);
  }

  return false;
}

/**
 * `super` is lexically available only in an object literal method/accessor and
 * in arrows nested within that method's execution scope. A nested ordinary
 * function starts a fresh super boundary.
 *
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {boolean} inherited
 * @returns {boolean}
 */
function superAllowedForChildren(node, parent, parentKey, inherited) {
  if (node.type === 'ArrowFunctionExpression') {
    return inherited;
  }

  if (node.type === 'FunctionDeclaration') {
    return false;
  }

  if (node.type !== 'FunctionExpression') {
    return inherited;
  }

  return (
    (parent?.type === 'Property' &&
      parentKey === 'value' &&
      isObjectLiteralFunction(node) &&
      (parent.method === true ||
        parent.kind === 'get' ||
        parent.kind === 'set')) ||
    (parent?.type === 'MethodDefinition' &&
      parentKey === 'value' &&
      isClassMethodFunction(parent, node))
  );
}

/**
 * `super(...)` is narrower than super-property access: only a derived class
 * constructor, and arrows nested lexically within it, can make a direct super
 * call. Every ordinary nested function starts a new boundary.
 *
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {boolean} inherited
 * @param {boolean | undefined} classDerived
 * @returns {boolean}
 */
function superCallAllowedForChildren(
  node,
  parent,
  parentKey,
  inherited,
  classDerived,
) {
  if (node.type === 'ArrowFunctionExpression') {
    return inherited;
  }

  if (node.type === 'FunctionDeclaration') {
    return false;
  }

  if (node.type !== 'FunctionExpression') {
    return inherited;
  }

  return (
    classDerived === true &&
    parent?.type === 'MethodDefinition' &&
    parentKey === 'value' &&
    isClassConstructorDefinition(parent, node)
  );
}

/**
 * @param {any} node
 * @param {string} key
 * @param {boolean | undefined} inherited
 * @returns {boolean | undefined}
 */
function classDerivedForChild(node, key, inherited) {
  if (
    (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') &&
    key === 'body'
  ) {
    return node.superClass !== null;
  }

  return inherited;
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

      if (offending) {
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
 * @param {{ node: any, strict: boolean, superAllowed: boolean, superCallAllowed: boolean, classDerived: boolean | undefined, parent: any, parentKey: string | number | undefined, parentIndex: number | undefined, patternContext: 'binding' | 'assignment' | undefined }[]} pending
 * @param {unknown} value
 * @param {boolean} strict
 * @param {boolean} superAllowed
 * @param {boolean} superCallAllowed
 * @param {boolean | undefined} classDerived
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {'binding' | 'assignment' | undefined} patternContext
 * @param {number | undefined} [parentIndex]
 * @returns {void}
 */
function pushChild(
  pending,
  value,
  strict,
  superAllowed,
  superCallAllowed,
  classDerived,
  parent,
  parentKey,
  patternContext,
  parentIndex,
) {
  if (value && typeof value === 'object') {
    pending.push({
      node: value,
      strict,
      superAllowed,
      superCallAllowed,
      classDerived,
      parent,
      parentKey,
      parentIndex,
      patternContext,
    });
  }
}

/**
 * @param {any} parent
 * @param {string} key
 * @param {'binding' | 'assignment' | undefined} inherited
 * @returns {'binding' | 'assignment' | undefined}
 */
function patternContextForChild(parent, key, inherited) {
  if (parent.type === 'VariableDeclarator' && key === 'id') {
    return 'binding';
  }

  if (isFunctionNode(parent) && key === 'params') {
    return 'binding';
  }

  if (
    parent.type === 'AssignmentExpression' &&
    parent.operator === '=' &&
    key === 'left'
  ) {
    return 'assignment';
  }

  if (
    (parent.type === 'ForInStatement' || parent.type === 'ForOfStatement') &&
    key === 'left' &&
    parent.left.type !== 'VariableDeclaration'
  ) {
    return 'assignment';
  }

  if (parent.type === 'ArrayPattern' && key === 'elements') {
    return inherited;
  }

  if (parent.type === 'ObjectPattern' && key === 'properties') {
    return inherited;
  }

  if (parent.type === 'Property') {
    return key === 'value' ? inherited : undefined;
  }

  if (
    (parent.type === 'AssignmentPattern' && key === 'left') ||
    (parent.type === 'RestElement' && key === 'argument')
  ) {
    return inherited;
  }

  return undefined;
}

/**
 * Resolves the `FunctionDeclaration` a body `Statement` reduces to after
 * peeling any surrounding label chain, reporting whether such a chain was
 * present. A labelled statement's body is itself a `Statement`, so
 * `a: b: function f(){}` reduces to the function declaration with
 * `labeled: true`. Returns `undefined` when the body is an ordinary statement.
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
 * - a `Property` whose shape is not one of the object-literal forms this
 *   milestone evaluates;
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
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {'binding' | 'assignment' | undefined} patternContext
 * @param {number | undefined} parentIndex
 * @returns {string | undefined}
 */
function unsupportedEs2015Message(
  node,
  parent,
  parentKey,
  patternContext,
  parentIndex,
) {
  if (!RECOGNIZED_AST_NODE_TYPES.has(node.type)) {
    return `unsupported AST node type ${node.type}`;
  }

  if (
    isSupportedExpressionNode(node) &&
    !isSupportedExpressionPosition(
      node,
      parent,
      parentKey,
      parentIndex,
      patternContext,
    )
  ) {
    return 'expressions are not supported in this AST position';
  }

  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
    return validateClassDefinition(node, parent, parentKey, parentIndex);
  }

  if (node.type === 'ClassBody') {
    return validateClassBody(node, parent, parentKey);
  }

  if (node.type === 'MethodDefinition') {
    return validateClassMethodDefinition(node, parent, parentKey, parentIndex);
  }

  if (isFunctionNode(node)) {
    const parameterMessage = validateFunctionParameterList(node);

    if (parameterMessage !== undefined) {
      return parameterMessage;
    }
  }

  if (
    parent &&
    parent.type === 'ObjectPattern' &&
    parentKey === 'properties'
  ) {
    if (
      node.type !== 'Property' ||
      node.kind !== 'init' ||
      node.method ||
      (!node.computed &&
        (!node.key ||
          (node.key.type !== 'Identifier' && node.key.type !== 'Literal')))
    ) {
      return 'unsupported destructuring property';
    }

    return undefined;
  }

  if (patternContext !== undefined) {
    const validPatternNode =
      node.type === 'Identifier' ||
      node.type === 'ObjectPattern' ||
      node.type === 'ArrayPattern' ||
      node.type === 'AssignmentPattern' ||
      node.type === 'RestElement' ||
      node.type === 'Property' ||
      (patternContext === 'assignment' && node.type === 'MemberExpression');

    if (!validPatternNode) {
      return `invalid ${patternContext} pattern target`;
    }
  }

  if (node.type === 'ObjectExpression') {
    const objectExpressionMessage = validateObjectExpression(node);

    if (objectExpressionMessage !== undefined) {
      return objectExpressionMessage;
    }
  }

  if (node.type === 'TemplateLiteral') {
    return validateTemplateLiteral(node, parent, parentKey);
  }

  if (node.type === 'TemplateElement') {
    return validateTemplateElement(node, parent, parentKey, parentIndex);
  }

  if (node.type === 'TaggedTemplateExpression') {
    return validateTaggedTemplateExpression(node);
  }

  if (node.type === 'ArrowFunctionExpression') {
    return validateArrowFunctionExpression(node);
  }

  if (node.type === 'Property') {
    const propertyMessage = validateObjectExpressionProperty(
      node,
      parent,
      parentKey,
      parentIndex,
    );

    if (propertyMessage !== undefined) {
      return propertyMessage;
    }
  }

  if (isFunctionNode(node) && (node.generator || node.async)) {
    return node.async
      ? 'async functions are not supported'
      : 'generators and `yield` are not supported';
  }

  if (
    node.type !== 'ArrowFunctionExpression' &&
    isFunctionNode(node) &&
    (!node.body || node.body.type !== 'BlockStatement')
  ) {
    return 'function bodies must be block statements';
  }

  if (node.type === 'ObjectPattern' || node.type === 'ArrayPattern') {
    return patternContext === undefined
      ? 'destructuring patterns are not supported in this context'
      : undefined;
  }

  if (node.type === 'AssignmentPattern') {
    const validPlacement =
      (parent && isFunctionNode(parent) && parentKey === 'params') ||
      (parent && parent.type === 'ArrayPattern' && parentKey === 'elements') ||
      (parent && parent.type === 'Property' && parentKey === 'value');

    if (!validPlacement) {
      return 'default value pattern is not supported in this position';
    }

    return patternContext === undefined
      ? 'default value patterns are not supported in this context'
      : undefined;
  }

  if (node.type === 'RestElement') {
    const validArrayRest =
      patternContext !== undefined &&
      parent &&
      parent.type === 'ArrayPattern' &&
      parentKey === 'elements' &&
      parentIndex === parent.elements.length - 1;
    const validParameterRest =
      patternContext === 'binding' &&
      parent &&
      isFunctionNode(parent) &&
      parentKey === 'params' &&
      parentIndex === parent.params.length - 1;

    return validArrayRest || validParameterRest
      ? undefined
      : 'rest elements are not supported in this context';
  }

  if (node.type === 'SpreadElement') {
    const validPlacement =
      parent &&
      ((parent.type === 'ArrayExpression' && parentKey === 'elements') ||
        (parent.type === 'CallExpression' && parentKey === 'arguments') ||
        (parent.type === 'NewExpression' && parentKey === 'arguments')) &&
      Array.isArray(parent[parentKey]) &&
      typeof parentIndex === 'number' &&
      Number.isInteger(parentIndex) &&
      parentIndex >= 0 &&
      parentIndex < parent[parentKey].length &&
      parent[parentKey][parentIndex] === node;

    return validPlacement
      ? undefined
      : 'spread elements are not supported in this context';
  }

  return UNSUPPORTED_ES2015_NODE_MESSAGES.get(node.type);
}

/**
 * @param {any} node
 * @returns {boolean}
 */
function isFunctionNode(node) {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  );
}

/**
 * Class definitions need a separate shape gate because Acorn exposes a
 * `ClassBody` and `MethodDefinition` tree that no other supported syntax uses.
 * The generic iterative walk remains responsible for recursively validating
 * every heritage, key, parameter, and body child after this local gate passes.
 *
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {number | undefined} parentIndex
 * @returns {string | undefined}
 */
function validateClassDefinition(node, parent, parentKey, parentIndex) {
  if (
    node.type === 'ClassDeclaration' &&
    !isClassDeclarationPosition(parent, parentKey, parentIndex)
  ) {
    return 'class declarations are not supported in this AST position';
  }

  if (
    node.type === 'ClassDeclaration' &&
    (!isIdentifierNode(node.id) || typeof node.id.name !== 'string')
  ) {
    return 'class declarations require an identifier name';
  }

  if (
    node.type === 'ClassExpression' &&
    node.id !== null &&
    !isIdentifierNode(node.id)
  ) {
    return 'unsupported class expression name';
  }

  if (
    !Object.prototype.hasOwnProperty.call(node, 'superClass') ||
    (node.superClass !== null &&
      !isSupportedExpressionNode(node.superClass))
  ) {
    return 'unsupported class heritage expression';
  }

  if (
    !node.body ||
    node.body.type !== 'ClassBody' ||
    !Array.isArray(node.body.body)
  ) {
    return 'unsupported class body shape';
  }

  if (
    hasDefinedField(node, UNSUPPORTED_CLASS_DEFINITION_FIELDS)
  ) {
    return 'class decorators and type annotations are not supported';
  }

  let constructorCount = 0;

  for (const element of node.body.body) {
    if (isClassConstructorDefinition(element, element?.value)) {
      constructorCount += 1;

      if (constructorCount > 1) {
        return 'duplicate constructor in class body';
      }
    }
  }

  return undefined;
}

/**
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {number | undefined} parentIndex
 * @returns {boolean}
 */
function isClassDeclarationPosition(parent, parentKey, parentIndex) {
  if (
    !parent ||
    typeof parentIndex !== 'number' ||
    !Number.isInteger(parentIndex)
  ) {
    return false;
  }

  const list =
    (parent.type === 'Program' || parent.type === 'BlockStatement') &&
    parentKey === 'body'
      ? parent.body
      : parent.type === 'SwitchCase' && parentKey === 'consequent'
        ? parent.consequent
        : undefined;

  return Array.isArray(list) && parentIndex >= 0 && parentIndex < list.length;
}

/**
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @returns {string | undefined}
 */
function validateClassBody(node, parent, parentKey) {
  if (
    !parent ||
    (parent.type !== 'ClassDeclaration' && parent.type !== 'ClassExpression') ||
    parentKey !== 'body' ||
    parent.body !== node ||
    !Array.isArray(node.body)
  ) {
    return 'class bodies are only supported as class definition bodies';
  }

  for (const element of node.body) {
    if (
      !element ||
      typeof element !== 'object' ||
      element.type !== 'MethodDefinition'
    ) {
      return 'unsupported class element';
    }
  }

  return undefined;
}

/**
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {number | undefined} parentIndex
 * @returns {string | undefined}
 */
function validateClassMethodDefinition(node, parent, parentKey, parentIndex) {
  if (
    !parent ||
    parent.type !== 'ClassBody' ||
    parentKey !== 'body' ||
    !Array.isArray(parent.body) ||
    typeof parentIndex !== 'number' ||
    !Number.isInteger(parentIndex) ||
    parentIndex < 0 ||
    parentIndex >= parent.body.length ||
    parent.body[parentIndex] !== node
  ) {
    return 'class methods are only supported in class bodies';
  }

  if (
    hasDefinedField(node, UNSUPPORTED_CLASS_METHOD_FIELDS) ||
    typeof node.computed !== 'boolean' ||
    typeof node.static !== 'boolean' ||
    (node.kind !== 'constructor' &&
      node.kind !== 'method' &&
      node.kind !== 'get' &&
      node.kind !== 'set') ||
    !isValidClassMethodKey(node.key, node.computed) ||
    !isClassMethodFunction(node, node.value)
  ) {
    return 'unsupported class method shape';
  }

  const keyName = nonComputedClassMethodName(node);
  const constructor = isClassConstructorDefinition(node, node.value);

  if (constructor && node.kind !== 'constructor') {
    return 'class constructors must use constructor method syntax';
  }

  if (!constructor && node.kind === 'constructor') {
    return 'only noncomputed instance constructor methods may be constructors';
  }

  if (constructor && node.value.generator) {
    return 'class constructors cannot be generators';
  }

  if (node.static && !node.computed && keyName === 'prototype') {
    return 'classes may not have a static property named prototype';
  }

  if (node.kind === 'get' && node.value.params.length !== 0) {
    return 'class getters must not have parameters';
  }

  if (
    node.kind === 'set' &&
    (node.value.params.length !== 1 ||
      node.value.params[0].type === 'RestElement')
  ) {
    return 'class setters must have one non-rest parameter';
  }

  return undefined;
}

/**
 * @param {any} node
 * @param {boolean} computed
 * @returns {boolean}
 */
function isValidClassMethodKey(node, computed) {
  if (!node || typeof node !== 'object') {
    return false;
  }

  if (computed) {
    return isSupportedExpressionNode(node);
  }

  return isIdentifierNode(node) || (node.type === 'Literal' && !node.regex);
}

/**
 * @param {any} node
 * @returns {node is { type: 'Identifier', name: string }}
 */
function isIdentifierNode(node) {
  return (
    !!node &&
    typeof node === 'object' &&
    node.type === 'Identifier' &&
    typeof node.name === 'string'
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function nonComputedClassMethodName(node) {
  if (node.computed) {
    return undefined;
  }

  if (isIdentifierNode(node.key)) {
    return node.key.name;
  }

  if (node.key?.type === 'Literal' && !node.key.regex) {
    return String(node.key.value);
  }

  return undefined;
}

/**
 * @param {any} definition
 * @param {any} value
 * @returns {boolean}
 */
function isClassConstructorDefinition(definition, value) {
  return (
    !!definition &&
    definition.type === 'MethodDefinition' &&
    definition.static === false &&
    definition.computed === false &&
    nonComputedClassMethodName(definition) === 'constructor' &&
    isClassMethodFunction(definition, value)
  );
}

/**
 * @param {any} definition
 * @param {any} value
 * @returns {boolean}
 */
function isClassMethodFunction(definition, value) {
  return (
    !!definition &&
    definition.type === 'MethodDefinition' &&
    !!value &&
    !hasDefinedField(value, UNSUPPORTED_CLASS_METHOD_FUNCTION_FIELDS) &&
    value.type === 'FunctionExpression' &&
    value.id === null &&
    Array.isArray(value.params) &&
    value.generator === false &&
    (value.async === undefined || value.async === false) &&
    value.expression === false &&
    value.body &&
    value.body.type === 'BlockStatement' &&
    Array.isArray(value.body.body)
  );
}

/**
 * @param {any} node
 * @param {readonly string[]} fields
 * @returns {boolean}
 */
function hasDefinedField(node, fields) {
  return fields.some((field) => node[field] !== undefined);
}

/**
 * Recognized expression nodes must sit on an evaluator-consumed ESTree child
 * edge. The iterative parser walk intentionally descends into arbitrary
 * custom-parser object fields, so validating only a nested expression's local
 * shape leaves an otherwise valid expression container able to hide it from
 * the evaluator. Every accepted edge checks both the direct property identity
 * and, for lists, its exact array member index.
 *
 * `Identifier` and `Literal` also appear in syntax-only roles such as binding
 * names and noncomputed property keys. Those roles are listed explicitly so
 * valid parser output remains accepted rather than being mistaken for metadata.
 *
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {number | undefined} parentIndex
 * @param {'binding' | 'assignment' | undefined} patternContext
 * @returns {boolean}
 */
function isSupportedExpressionPosition(
  node,
  parent,
  parentKey,
  parentIndex,
  patternContext,
) {
  if (!parent || typeof parentKey !== 'string') {
    return false;
  }

  /** @param {string} key @returns {boolean} */
  const direct = (key) => parentKey === key && parent[key] === node;
  /** @param {string} key @returns {boolean} */
  const member = (key) =>
    parentKey === key &&
    Array.isArray(parent[key]) &&
    typeof parentIndex === 'number' &&
    Number.isInteger(parentIndex) &&
    parentIndex >= 0 &&
    parentIndex < parent[key].length &&
    parent[key][parentIndex] === node;

  if (patternContext !== undefined) {
    if (
      node.type !== 'Identifier' &&
      node.type !== 'MemberExpression'
    ) {
      return false;
    }

    switch (parent.type) {
      case 'VariableDeclarator':
        return direct('id');
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        return member('params');
      case 'ArrayPattern':
        return member('elements');
      case 'Property':
        return direct('value');
      case 'AssignmentPattern':
        return direct('left');
      case 'RestElement':
        return direct('argument');
      case 'AssignmentExpression':
      case 'ForInStatement':
      case 'ForOfStatement':
        return direct('left');
      default:
        return false;
    }
  }

  switch (parent.type) {
    case 'ExpressionStatement':
      return direct('expression');
    case 'VariableDeclarator':
      return direct('init');
    case 'ReturnStatement':
    case 'ThrowStatement':
      return direct('argument');
    case 'IfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
      return direct('test');
    case 'ForStatement':
      return direct('init') || direct('test') || direct('update');
    case 'ForInStatement':
    case 'ForOfStatement':
      return (
        direct('right') ||
        (isAssignmentTargetExpression(node) && direct('left'))
      );
    case 'WithStatement':
      return direct('object');
    case 'SwitchStatement':
      return direct('discriminant');
    case 'SwitchCase':
      return direct('test');
    case 'UnaryExpression':
      return direct('argument');
    case 'BinaryExpression':
    case 'LogicalExpression':
      return direct('left') || direct('right');
    case 'ConditionalExpression':
      return (
        direct('test') || direct('consequent') || direct('alternate')
      );
    case 'AssignmentExpression':
      return (
        direct('right') ||
        (isAssignmentTargetExpression(node) && direct('left'))
      );
    case 'UpdateExpression':
      return isAssignmentTargetExpression(node) && direct('argument');
    case 'CallExpression':
    case 'NewExpression':
      return direct('callee') || member('arguments');
    case 'MemberExpression':
      return (
        direct('object') ||
        (parent.computed === true && direct('property')) ||
        (parent.computed === false &&
          node.type === 'Identifier' &&
          direct('property'))
      );
    case 'SequenceExpression':
      return member('expressions');
    case 'ArrayExpression':
      return member('elements');
    case 'SpreadElement':
      return direct('argument');
    case 'TemplateLiteral':
      return member('expressions');
    case 'TaggedTemplateExpression':
      return (
        direct('tag') ||
        (node.type === 'TemplateLiteral' && direct('quasi'))
      );
    case 'AssignmentPattern':
      return direct('right');
    case 'ArrowFunctionExpression':
      return parent.expression === true && direct('body');
    case 'FunctionDeclaration':
    case 'FunctionExpression':
      return node.type === 'Identifier' && direct('id');
    case 'ClassDeclaration':
    case 'ClassExpression':
      return (
        direct('superClass') ||
        (node.type === 'Identifier' && direct('id'))
      );
    case 'MethodDefinition':
      return (
        (parent.computed === true && direct('key')) ||
        (parent.computed === false &&
          (node.type === 'Identifier' || node.type === 'Literal') &&
          direct('key')) ||
        (node.type === 'FunctionExpression' && direct('value'))
      );
    case 'Property':
      if (parent.computed === true && direct('key')) {
        return true;
      }

      if (
        parent.computed === false &&
        (node.type === 'Identifier' || node.type === 'Literal') &&
        direct('key')
      ) {
        return true;
      }

      if (!direct('value')) {
        return false;
      }

      return (
        (parent.kind === 'init' && parent.method === false) ||
        (node.type === 'FunctionExpression' &&
          ((parent.kind === 'init' && parent.method === true) ||
            ((parent.kind === 'get' || parent.kind === 'set') &&
              parent.method === false)))
      );
    case 'CatchClause':
      return node.type === 'Identifier' && direct('param');
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
      return node.type === 'Identifier' && direct('label');
    default:
      return false;
  }
}

/**
 * @param {any} node
 * @returns {boolean}
 */
function isAssignmentTargetExpression(node) {
  return node.type === 'Identifier' || node.type === 'MemberExpression';
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateArrowFunctionExpression(node) {
  if (
    node.id !== null ||
    !Array.isArray(node.params) ||
    node.generator !== false ||
    (node.async !== undefined && node.async !== false) ||
    typeof node.expression !== 'boolean' ||
    !node.body ||
    typeof node.body !== 'object'
  ) {
    return 'unsupported arrow function shape';
  }

  if (node.expression) {
    return isSupportedExpressionNode(node.body)
      ? undefined
      : 'unsupported arrow function expression body';
  }

  return node.body.type === 'BlockStatement' && Array.isArray(node.body.body)
    ? undefined
    : 'unsupported arrow function block body';
}

/**
 * Rejects malformed custom function parameter trees before the early-error
 * pass reaches `boundNames` or pattern-cycle detection. Placement and
 * expression capability checks remain the responsibility of the main AST walk.
 *
 * @param {any} node
 * @returns {string | undefined}
 */
function validateFunctionParameterList(node) {
  if (!Array.isArray(node.params)) {
    return 'function parameters must be an array';
  }

  /** @type {{ node: any, binding: boolean }[]} */
  const pending = /** @type {any[]} */ (node.params).map(
    /** @param {any} parameter */
    (parameter) => ({
      node: parameter,
      binding: true,
    }),
  );
  const visitedBindings = new WeakSet();
  const visitedExpressions = new WeakSet();

  while (pending.length > 0) {
    const { node: parameter, binding } = /** @type {{ node: any, binding: boolean }} */ (
      pending.pop()
    );

    if (
      !parameter ||
      typeof parameter !== 'object' ||
      typeof parameter.type !== 'string'
    ) {
      return binding
        ? 'unsupported function parameter'
        : 'unsupported computed object parameter key';
    }

    if (binding && !isBindingParameterNode(parameter)) {
      return 'unsupported function parameter';
    }

    const visited = binding ? visitedBindings : visitedExpressions;

    if (visited.has(parameter)) {
      continue;
    }

    visited.add(parameter);

    if (!binding) {
      if (
        RECOGNIZED_AST_NODE_TYPES.has(parameter.type) &&
        !isSupportedExpressionNode(parameter)
      ) {
        return 'unsupported computed object parameter key';
      }

      continue;
    }

    switch (parameter.type) {
      case 'Identifier':
        if (typeof parameter.name !== 'string') {
          return 'unsupported function parameter';
        }
        break;
      case 'ObjectPattern':
        if (!Array.isArray(parameter.properties)) {
          return 'unsupported object parameter pattern';
        }

        for (const property of parameter.properties) {
          if (!property || typeof property !== 'object') {
            return 'unsupported object parameter pattern';
          }

          if (property.type === 'Property') {
            const propertyMessage = validateObjectParameterProperty(
              property,
              pending,
            );

            if (propertyMessage !== undefined) {
              return propertyMessage;
            }
          } else if (property.type === 'RestElement') {
            pending.push({ node: property, binding: true });
          } else {
            return 'unsupported object parameter pattern';
          }
        }
        break;
      case 'ArrayPattern':
        if (!Array.isArray(parameter.elements)) {
          return 'unsupported array parameter pattern';
        }

        for (const element of parameter.elements) {
          if (element !== null) {
            pending.push({ node: element, binding: true });
          }
        }
        break;
      case 'AssignmentPattern':
        if (
          !parameter.right ||
          typeof parameter.right !== 'object' ||
          typeof parameter.right.type !== 'string'
        ) {
          return 'unsupported default parameter value';
        }

        pending.push({ node: parameter.left, binding: true });
        break;
      case 'RestElement':
        pending.push({ node: parameter.argument, binding: true });
        break;
    }
  }

  return undefined;
}

/**
 * @param {any} property
 * @param {{ node: any, binding: boolean }[]} pending
 * @returns {string | undefined}
 */
function validateObjectParameterProperty(property, pending) {
  if (
    property.kind !== 'init' ||
    property.method !== false ||
    typeof property.shorthand !== 'boolean' ||
    typeof property.computed !== 'boolean' ||
    !property.key ||
    typeof property.key !== 'object' ||
    typeof property.key.type !== 'string' ||
    !property.value ||
    typeof property.value !== 'object' ||
    typeof property.value.type !== 'string'
  ) {
    return 'unsupported object parameter property';
  }

  if (
    !property.computed &&
    property.key.type !== 'Identifier' &&
    (property.key.type !== 'Literal' || property.key.regex)
  ) {
    return 'unsupported noncomputed object parameter key';
  }

  if (property.shorthand) {
    const valueIdentifier =
      property.value.type === 'Identifier'
        ? property.value
        : property.value.type === 'AssignmentPattern'
          ? property.value.left
          : null;

    if (
      property.computed ||
      property.key.type !== 'Identifier' ||
      !valueIdentifier ||
      valueIdentifier.type !== 'Identifier' ||
      property.key.name !== valueIdentifier.name
    ) {
      return 'unsupported shorthand object parameter property';
    }
  }

  pending.push({ node: property.value, binding: true });

  if (property.computed) {
    pending.push({ node: property.key, binding: false });
  }

  return undefined;
}

/**
 * @param {any} node
 * @returns {boolean}
 */
function isBindingParameterNode(node) {
  return (
    !!node &&
    typeof node === 'object' &&
    (node.type === 'Identifier' ||
      node.type === 'ObjectPattern' ||
      node.type === 'ArrayPattern' ||
      node.type === 'AssignmentPattern' ||
      node.type === 'RestElement')
  );
}

/**
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @returns {string | undefined}
 */
function validateTemplateLiteral(node, parent, parentKey) {
  if (!Array.isArray(node.expressions) || !Array.isArray(node.quasis)) {
    return 'template literal expressions and quasis must be arrays';
  }

  if (node.quasis.length !== node.expressions.length + 1) {
    return 'template literal quasis must outnumber expressions by one';
  }

  if (node.quasis.length === 0) {
    return 'template literal must have a quasi';
  }

  const tagged =
    parent && parent.type === 'TaggedTemplateExpression' && parentKey === 'quasi';

  for (const expression of node.expressions) {
    if (!isSupportedExpressionNode(expression)) {
      return 'unsupported template literal substitution';
    }
  }

  for (let index = 0; index < node.quasis.length; index += 1) {
    const element = node.quasis[index];

    if (!isTemplateElementShape(element, index === node.quasis.length - 1)) {
      return 'unsupported template element shape';
    }

    if (!tagged && typeof element.value.cooked !== 'string') {
      return 'untagged template literals require cooked string values';
    }
  }

  return undefined;
}

/**
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {number | undefined} parentIndex
 * @returns {string | undefined}
 */
function validateTemplateElement(node, parent, parentKey, parentIndex) {
  if (
    !parent ||
    parent.type !== 'TemplateLiteral' ||
    parentKey !== 'quasis' ||
    !Array.isArray(parent.quasis) ||
    typeof parentIndex !== 'number' ||
    parentIndex < 0 ||
    parentIndex >= parent.quasis.length ||
    parent.quasis[parentIndex] !== node
  ) {
    return 'template elements are only supported in template literal quasis';
  }

  return isTemplateElementShape(node, parentIndex === parent.quasis.length - 1)
    ? undefined
    : 'unsupported template element shape';
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateTaggedTemplateExpression(node) {
  if (!isSupportedExpressionNode(node.tag)) {
    return 'tagged template expressions require a supported tag expression';
  }

  return node.quasi?.type === 'TemplateLiteral'
    ? undefined
    : 'tagged template expressions require a template literal quasi';
}

/**
 * @param {any} node
 * @param {boolean} tail
 * @returns {boolean}
 */
function isTemplateElementShape(node, tail) {
  if (
    !node ||
    typeof node !== 'object' ||
    node.type !== 'TemplateElement' ||
    typeof node.tail !== 'boolean' ||
    node.tail !== tail ||
    !node.value ||
    typeof node.value !== 'object' ||
    typeof node.value.raw !== 'string' ||
    !Object.prototype.hasOwnProperty.call(node.value, 'cooked')
  ) {
    return false;
  }

  return (
    typeof node.value.cooked === 'string' ||
    node.value.cooked === null ||
    node.value.cooked === undefined
  );
}

/**
 * Rejects malformed custom object-expression property lists before the
 * evaluator reaches them. `SpreadElement` remains a child here so its
 * shape-sensitive capability rule below produces the ordinary object-spread
 * rejection.
 *
 * @param {any} node
 * @returns {string | undefined}
 */
function validateObjectExpression(node) {
  if (!Array.isArray(node.properties)) {
    return 'object literal properties must be an array';
  }

  let foundPrototypeSetter = false;

  for (const property of node.properties) {
    if (
      !property ||
      typeof property !== 'object' ||
      (property.type !== 'Property' && property.type !== 'SpreadElement')
    ) {
      return 'unsupported object literal property';
    }

    if (isPrototypeSetterProperty(property)) {
      if (foundPrototypeSetter) {
        return 'duplicate __proto__ properties are not allowed';
      }

      foundPrototypeSetter = true;
    }
  }

  return undefined;
}

/**
 * Checks exactly the `Property` shapes that object-literal evaluation supports.
 * The generic iterative walk still validates every nested key, value, and
 * function node after this parent-local check succeeds.
 *
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {number | undefined} parentIndex
 * @returns {string | undefined}
 */
function validateObjectExpressionProperty(node, parent, parentKey, parentIndex) {
  if (
    !parent ||
    parent.type !== 'ObjectExpression' ||
    parentKey !== 'properties' ||
    !Array.isArray(parent.properties) ||
    typeof parentIndex !== 'number' ||
    !Number.isInteger(parentIndex) ||
    parentIndex < 0 ||
    parentIndex >= parent.properties.length ||
    parent.properties[parentIndex] !== node
  ) {
    return 'object properties are not supported in this AST position';
  }

  if (
    typeof node.computed !== 'boolean' ||
    typeof node.method !== 'boolean' ||
    typeof node.shorthand !== 'boolean' ||
    (node.kind !== 'init' && node.kind !== 'get' && node.kind !== 'set') ||
    !node.key ||
    typeof node.key !== 'object' ||
    !node.value ||
    typeof node.value !== 'object'
  ) {
    return 'unsupported object property shape';
  }

  if (
    !node.computed &&
    node.key.type !== 'Identifier' &&
    (node.key.type !== 'Literal' || node.key.regex)
  ) {
    return 'unsupported noncomputed object property key';
  }

  if (
    node.computed &&
    !isSupportedExpressionNode(node.key)
  ) {
    return 'unsupported computed object property key';
  }

  if (node.shorthand) {
    return node.kind === 'init' &&
      !node.computed &&
      !node.method &&
      node.key.type === 'Identifier' &&
      node.value.type === 'Identifier' &&
      node.key.name === node.value.name
      ? undefined
      : 'unsupported shorthand object property';
  }

  if (node.method) {
    return node.kind === 'init' && isObjectLiteralFunction(node.value)
      ? undefined
      : 'unsupported concise object method';
  }

  if (node.kind === 'init') {
    return isSupportedExpressionNode(node.value)
      ? undefined
      : 'unsupported object property value';
  }

  if (!isObjectLiteralFunction(node.value)) {
    return 'unsupported object accessor';
  }

  if (node.kind === 'get') {
    return node.value.params.length === 0
      ? undefined
      : 'object getters must not have parameters';
  }

  return node.value.params.length === 1 &&
    node.value.params[0].type !== 'RestElement'
    ? undefined
    : 'object setters must have one non-rest parameter';
}

/**
 * @param {any} property
 * @returns {boolean}
 */
function isPrototypeSetterProperty(property) {
  return (
    property.type === 'Property' &&
    property.kind === 'init' &&
    property.computed === false &&
    property.method === false &&
    property.shorthand === false &&
    property.key &&
    ((property.key.type === 'Identifier' &&
      property.key.name === '__proto__') ||
      (property.key.type === 'Literal' &&
        !property.key.regex &&
        property.key.value === '__proto__'))
  );
}

/**
 * @param {any} node
 * @returns {boolean}
 */
function isSupportedExpressionNode(node) {
  return (
    !!node &&
    typeof node === 'object' &&
    typeof node.type === 'string' &&
    SUPPORTED_EXPRESSION_TYPES.has(node.type)
  );
}

/**
 * @param {any} node
 * @returns {boolean}
 */
function isObjectLiteralFunction(node) {
  return (
    node.type === 'FunctionExpression' &&
    node.id === null &&
    Array.isArray(node.params) &&
    node.generator === false &&
    (node.async === undefined || node.async === false) &&
    node.expression === false &&
    node.body &&
    node.body.type === 'BlockStatement' &&
    Array.isArray(node.body.body)
  );
}

/**
 * @param {any} node
 * @param {string} source
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {'binding' | 'assignment' | undefined} patternContext
 * @param {number | undefined} parentIndex
 * @param {boolean} superAllowed
 * @param {boolean} superCallAllowed
 * @returns {void}
 */
function checkUnsupportedEs2015Node(
  node,
  source,
  parent,
  parentKey,
  patternContext,
  parentIndex,
  superAllowed,
  superCallAllowed,
) {
  if (node.type === 'Super') {
    const directMember = isDirectSuperMemberObject(node, parent, parentKey);
    const directCall = isDirectSuperCallCallee(node, parent, parentKey);

    if (directMember && superAllowed) {
      // A super-property reference is valid in every method/accessor and its
      // lexically nested arrows, including base-class methods.
    } else if (directCall && superCallAllowed) {
      // A direct call is valid only in a derived constructor and arrows that
      // retain that constructor's execution environment.
    } else if (!superAllowed && !superCallAllowed) {
      throw unsupportedEs2015Error(
        "'super' keyword is only valid inside a method",
        node,
      );
    } else {
      throw unsupportedEs2015Error(
        "'super' keyword is only valid as a property reference or derived constructor call",
        node,
      );
    }
  }

  const typeMessage = unsupportedEs2015Message(
    node,
    parent,
    parentKey,
    patternContext,
    parentIndex,
  );

  if (typeMessage !== undefined) {
    throw unsupportedEs2015Error(typeMessage, node);
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

  if (
    node.type === 'TemplateElement' &&
    typeof node.value?.raw === 'string' &&
    hasCodePointEscape(node.value.raw)
  ) {
    throw unsupportedEs2015Error(
      'unicode code-point escapes (`\\u{...}`) are not supported',
      node,
    );
  }
}

/**
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @returns {boolean}
 */
function isDirectSuperMemberObject(node, parent, parentKey) {
  return (
    !!parent &&
    parent.type === 'MemberExpression' &&
    parentKey === 'object' &&
    parent.object === node &&
    typeof parent.computed === 'boolean' &&
    isValidSuperMemberProperty(parent.property, parent.computed)
  );
}

/**
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @returns {boolean}
 */
function isDirectSuperCallCallee(node, parent, parentKey) {
  return (
    !!parent &&
    parent.type === 'CallExpression' &&
    parentKey === 'callee' &&
    parent.callee === node &&
    Array.isArray(parent.arguments)
  );
}

/**
 * @param {any} property
 * @param {boolean} computed
 * @returns {boolean}
 */
function isValidSuperMemberProperty(property, computed) {
  if (
    !property ||
    typeof property !== 'object' ||
    typeof property.type !== 'string'
  ) {
    return false;
  }

  if (!computed) {
    return property.type === 'Identifier' && typeof property.name === 'string';
  }

  return (
    !RECOGNIZED_AST_NODE_TYPES.has(property.type) ||
    isSupportedExpressionNode(property)
  );
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
