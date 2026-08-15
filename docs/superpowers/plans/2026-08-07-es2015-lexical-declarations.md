# ES2015 Lexical Declarations and TDZ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement ES2015 `let`, `const`, lexical declaration instantiation,
uninitialized bindings and the temporal dead zone, block/switch/catch/loop/
function/eval/global lexical scope, and per-iteration bindings, without changing
any behavior the engine already has.

**Architecture:** See
`docs/superpowers/specs/2026-08-07-es2015-lexical-declarations-design.md`.

## Global Constraints

These bind every task. A reviewer should treat a violation as a defect.

1. **Strict TDD.** Write the failing test first, watch it fail for the right
   reason, then implement. Every task's tests go in the repository's own
   harness (`test/*.test.js`, default-exporting an array of
   `{ name, run() }` cases, asserting through `test/harness/assert.js`). New
   suite files must be registered in `test/suites.js` (static import plus a
   frozen `PORTABLE_SUITES` entry) or
   `test/node/repository-invariants.test.js` fails.
2. **No ES5 regressions.** `npm run test:node` must stay green at every commit.
   It is 1045 passing cases before this plan starts; the count may only grow.
3. **Portable engine code.** Nothing under `src/` may touch a host API, the host
   global object, or the filesystem. Suites under `test/` (other than
   `test/node/` and `test/ci/`) must run unchanged in Node, Chromium, and `jsc`.
4. **Realm isolation.** Every guest-visible error must be a realm-local guest
   error — raised as `GuestErrorSignal`/`ThrowSignal`, never a host `Error` that
   escapes to the embedder. Host errors stay reserved for engine defects and
   genuinely unimplemented operations (`UnsupportedNodeError`).
5. **Style and types.** Prettier (`semi: true`, `singleQuote: true`,
   `trailingComma: "all"`), ESLint flat config, and `tsc -p jsconfig.json` with
   `checkJs` and `strict` enabled. Every exported function and class carries
   JSDoc types. Run `npm run format`, `npm run lint`, and `npm run typecheck`
   before reporting DONE. `npx prettier --write <files>` is the way to fix
   formatting.
6. **Comment discipline.** This codebase documents _why_, citing the ECMA-262
   clause number, not _what_. Match that register. Do not add narrative comments
   to test files.
7. **Iterative AST walks.** Any new walk over the AST that runs outside the
   realm's `StackGuard` (hoisting, early errors, static semantics) must use an
   explicit worklist, never host recursion — the parser accepts input deeper
   than a recursive walk survives.
8. **Spec citations.** Reference ES2015 (ECMA-262 6th edition) clause numbers in
   JSDoc for new algorithms, the way existing code cites ES5.1 clauses.
9. **Commit per task**, subject in the imperative mood, with the trailer
   `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`.
10. **Do not touch `tools/`, `docs/*.md`, or `.github/`** except in the tasks
    that name them (Tasks 9 and 10). In particular, do not regenerate
    `docs/test262-report.jsonl`.

### Shared interfaces this plan introduces

Later tasks depend on these names; do not rename them.

- `src/evaluator/static-semantics.js` exports `boundNames`,
  `isConstantDeclaration`, `varDeclaredNames`, `varScopedDeclarations`,
  `lexicallyDeclaredNames`, `lexicallyScopedDeclarations`,
  `topLevelVarDeclaredNames`, `topLevelVarScopedDeclarations`,
  `topLevelLexicallyDeclaredNames`, `topLevelLexicallyScopedDeclarations`.
- `src/evaluator/declarations.js` exports `blockDeclarationInstantiation(declarations, env, context)`.
- `DeclarativeEnvironmentRecord#createImmutableBinding(name, strict = false)`.
- `GlobalEnvironmentRecord#hasLexicalDeclaration(name)`,
  `#hasVarDeclaration(name)`, `#hasRestrictedGlobalProperty(name)`,
  `#canDeclareGlobalVar(name)`, `#canDeclareGlobalFunction(name)`.

### Test262 checkout

`vendor/test262` is present at the pinned revision
`b363f29d3c43c626dc852744ad64a0b48a003693`. It is gitignored. Only Tasks 9
and 10 use it.

### Task 1: Static semantics module

Create `src/evaluator/static-semantics.js` implementing ES2015 Chapter 13/14/15
declaration static semantics as pure functions over Acorn AST nodes, and
refactor `src/evaluator/declarations.js` to use it with no behavior change.

Implement, each as an iterative worklist walk (Global Constraint 7):

- `boundNames(node)` — the names a `VariableDeclaration`, `FunctionDeclaration`,
  or `Identifier` binds, in source order.
- `isConstantDeclaration(node)` — true for a `VariableDeclaration` of kind
  `const`.
- `varDeclaredNames(statements)` / `varScopedDeclarations(statements)` — ES2015
  §13.1.5 / §13.1.6 over a `StatementList`. These descend through every
  statement form that shares the enclosing _variable_ scope (blocks, `if`
  branches, loop bodies, a `for` head's `var` declaration, `try`
  block/handler/finalizer, `switch` cases, labelled bodies, `with` bodies) and
  stop at function boundaries. A `VariableDeclaration` of kind `let`/`const`
  contributes nothing. A nested `FunctionDeclaration` contributes nothing (it is
  lexically scoped in ES2015; the Annex B alias is Task 4's problem).
- `lexicallyDeclaredNames(statements)` / `lexicallyScopedDeclarations(statements)`
  — ES2015 §13.2.5 / §13.2.6 over a `StatementList`: the `let`/`const`
  declarations and `FunctionDeclaration`s at _this_ statement list's own level
  only, plus those reached through a `LabeledStatement` chain. These do not
  descend into nested blocks or any other statement body.
- `topLevelVarDeclaredNames` / `topLevelVarScopedDeclarations` /
  `topLevelLexicallyDeclaredNames` / `topLevelLexicallyScopedDeclarations` —
  ES2015 §13.2.7–§13.2.10, the variants used for a `Program` body and a function
  body, where a top-level `FunctionDeclaration` is _var_-scoped rather than
  lexically scoped, and a `LabeledStatement` wrapping a `FunctionDeclaration` is
  likewise var-scoped.

`varScopedDeclarations` and `lexicallyScopedDeclarations` return declaration
_nodes_ in source order; the `*Names` functions return `string[]` in source
order, with duplicates preserved (callers that want a set build one) — document
this choice.

Then refactor `declarations.js`: delete `collectVarNames`,
`collectFunctionDeclarations`, `pushHoistingChildren`, and `reverseFrom`, and
re-express `globalDeclarationInstantiation`, `functionDeclarationInstantiation`,
and `evalDeclarationInstantiation` on `topLevelVarDeclaredNames` and
`topLevelVarScopedDeclarations`. Behavior must not change: block-nested function
declarations must still hoist to the variable scope exactly as they do today,
because nothing else in this task changes. To keep that true while
`varScopedDeclarations` excludes nested function declarations, the top-level
variants must keep the current engine behavior of collecting function
declarations from nested blocks — preserve it, and mark it with a comment
pointing at Task 4, which replaces it with real block scoping plus Annex B.3.3.

Tests: new `test/static-semantics.test.js`, registered in `test/suites.js`.
Cover each exported function against the ES2015 examples: `var` in every nested
container, `var` stopping at a function boundary, `let`/`const` excluded from
var names, lexical names at one level only, labelled declarations, and the
top-level variants' different treatment of function declarations. Assert source
order. Include at least one deeply nested input (e.g. 20 000 nested blocks built
programmatically) proving the walk does not use host recursion.

### Task 2: ES2015 environment record bindings

Upgrade `src/runtime/environment.js` to the ES2015 environment record interface
needed by lexical declarations. No evaluator changes in this task.

`DeclarativeEnvironmentRecord`:

- `createImmutableBinding(name, strict = false)` — ES2015 §8.1.1.1.3. Store the
  flag on the binding record as `strict`. The default `false` preserves the ES5
  named-function-expression binding created at
  `src/evaluator/expressions.js:801`, which must keep its current behavior.
- `setMutableBinding(name, value, strict)` — ES2015 §8.1.1.1.5. An immutable
  binding now throws a guest `TypeError` when _either_ the binding is strict
  (`const`) or the reference is strict; a non-strict reference to a non-strict
  immutable binding stays a silent no-op. The uninitialized-binding
  `ReferenceError` and the missing-binding `ReferenceError` are unchanged, and
  keep the message text they have today.

`GlobalEnvironmentRecord`:

- `createImmutableBinding(name, strict = false)` — forward to the declarative
  record with the flag (today it drops the argument).
- `hasVarDeclaration(name)` — §8.1.1.4.12, `varNames.has(name)`.
- `hasLexicalDeclaration(name)` — §8.1.1.4.13,
  `declarativeRecord.hasBinding(name)`.
- `hasRestrictedGlobalProperty(name)` — §8.1.1.4.14: the global object has an
  _own_ property of that name whose `configurable` is `false`. An absent own
  property is not restricted.
- `canDeclareGlobalVar(name)` — §8.1.1.4.15: true when the global object has an
  own property of that name, otherwise the global object's extensibility.
- `canDeclareGlobalFunction(name)` — §8.1.1.4.16: true when no own property
  exists and the global is extensible; when an own property exists, true if it
  is configurable, or if it is a writable _and_ enumerable data property;
  otherwise false.

Keep every existing method's behavior and documented rationale intact —
`createGlobalVarBinding`, `createGlobalFunctionBinding`, `deleteBinding`, and
the own-property model they deliberately use are not changing.

Tests: extend `test/environments.test.js`. Cover the strict/non-strict immutable
matrix (four combinations of binding strictness and reference strictness),
uninitialized read and write both throwing `GuestErrorSignal` with
`typeName === 'ReferenceError'`, and each new global query against a global
object carrying: no own property, a configurable own property, a
non-configurable writable+enumerable data property, a non-configurable
non-writable data property, an accessor, and a non-extensible global.

### Task 3: Parser enablement and the unsupported-ES2015 early error

Raise the accepted grammar to "ES5.1 plus lexical declarations" in
`src/parser.js`.

Change `PARSER_OPTIONS.ecmaVersion` from `5` to `6`. That is what makes the
vendored parser emit `VariableDeclaration` nodes of kind `let`/`const` and run
its own ES6 lexical scope analysis. It also makes the parser accept the rest of
ES2015, so add a parse-time early-error pass, reached from the existing
`checkStatementPositionFunctionDeclarations` worklist walk in
`validateScriptProgram` (so scripts, `eval`, and the dynamic `Function`
constructor all get it), that raises a `SyntaxError` through
`normalizeSyntaxError` — carrying the offending node's `start`/`loc`, exactly as
`statementPositionFunctionError` does — for each of:

- node types `ClassDeclaration`, `ClassExpression`, `ClassBody`, `MethodDefinition`,
  `ArrowFunctionExpression`, `TemplateLiteral`, `TemplateElement`,
  `TaggedTemplateExpression`, `ForOfStatement`, `YieldExpression`,
  `AwaitExpression`, `ObjectPattern`, `ArrayPattern`, `AssignmentPattern`,
  `RestElement`, `SpreadElement`, `Super`, `MetaProperty`, `ImportDeclaration`,
  `ImportExpression`, `ExportNamedDeclaration`, `ExportDefaultDeclaration`,
  `ExportAllDeclaration`
- a `Property` whose `computed`, `shorthand`, or `method` is true
- a `FunctionDeclaration` or `FunctionExpression` whose `generator` or `async`
  is true
- a numeric `Literal` whose `raw` begins `0b`, `0B`, `0o`, or `0O`
- any node whose source span contains an ES2015 code-point escape (`\u{`),
  detected on `Literal.raw` for string literals and on the raw source span for
  `Identifier` nodes, the way the existing `checkUnreserved` plugin compares
  `input.slice(node.start, node.end)` to `node.name`

Each rejection message must name the construct, e.g.
`` `class` declarations are not supported ``. Use a lookup table keyed by node
type rather than a long `if` chain, and a `Map` rather than an object literal,
for the reason `STATEMENT_BODY_PARENT_LABELS` gives.

Re-examine `withEscapedReservedWordCheck`. Its documented purpose is to restore
a check Acorn skips _when `ecmaVersion < 6`_. Determine empirically whether
Acorn 8.18 at `ecmaVersion: 6` already raises for every case the plugin covers
(`var \u0063lass = 1`, a strict escaped `yield` label, escaped
`implements`/`package`/`private`, escaped `let` in a lexical declaration). If it
does, delete the plugin and its now-false documentation; if it does not, keep it
and rewrite the doc comment so it describes ES6 behavior truthfully. Do not
leave a comment that says `ecmaVersion < 6` in a parser that runs at 6.

Until Task 4 lands, evaluating a lexical declaration is genuinely unimplemented:
make `evaluateVariableDeclaration` in `src/evaluator/declarations.js` throw
`createUnsupportedNodeError(node)` for `node.kind !== 'var'`. This is a
deliberate one-task scaffold that Task 4 removes; say so in the comment.

Tests: extend `test/parser.test.js`. Assert that `let`/`const` declarations
parse in every position the grammar allows, and that each rejected construct
above still raises a `SyntaxError` from `parseScript`, from `parseEval`, and —
for at least two representative constructs — from the dynamic `Function`
constructor as a guest `SyntaxError`. Also assert, as a regression net for the
version bump, that these still raise a `SyntaxError`: a `with` statement in
strict code, an octal literal in strict code, a duplicate formal parameter in
strict code, `delete x` on an identifier in strict code, a reserved word used as
a binding, `/x/u` and `/x/y`, and a function declaration in an iteration body.
Add a suite of Acorn-derived lexical early errors that the engine now inherits
and must keep — each asserted through `parseScript`, not through Acorn:
duplicate `let` in one scope, `let` then `var` and `var` then `let` in one
scope, `let let`, `const let`, `const` without an initializer, a `catch`
parameter redeclared as `let` in the handler block, a formal parameter
redeclared as `let` in the body, a `for (let x;;)` head name redeclared as `var`
in the body, duplicate `let` across `switch` cases, `let` in a single-statement
position (`if (0) let x = 1;`, `while (0) let x = 1;`, `l: let x = 1;`), and
a strict-mode `let eval` / `let arguments`.

### Task 4: Block, switch, and try lexical scope

Give blocks, `switch` case blocks, and every part of a `try` statement their own
declarative environment, and make block-level function declarations lexically
scoped with the Annex B.3.3 sloppy-mode alias.

In `src/evaluator/declarations.js`, add and export:

```js
blockDeclarationInstantiation(declarations, env, context);
```

ES2015 §13.2.14. `declarations` is the result of
`lexicallyScopedDeclarations(statements)`. For each declaration: for each of its
`boundNames`, `env.createImmutableBinding(name, true)` when
`isConstantDeclaration(d)` is true, otherwise `env.createMutableBinding(name, false)`;
and when the declaration is a `FunctionDeclaration`, immediately
`env.initializeBinding(name, createFunctionObject(d, env, context))` — note the
function object's `[[Scope]]` is the _block_ environment, not the enclosing one.
`let`/`const` bindings are left uninitialized, which is the temporal dead zone.

In `src/evaluator/statements.js`:

- `BlockStatement` evaluation (§13.2.13) creates
  `newDeclarativeEnvironment(context.env)`, runs
  `blockDeclarationInstantiation`, and evaluates the statement list in
  `{ ...context, env: blockEnv }` — `variableEnv` threads through unchanged, the
  way `evaluateWithStatement` already does it. Skip the environment entirely
  when the block declares nothing lexically, and say why in a comment (it is
  unobservable and keeps ES5 programs on the existing path).
- `SwitchStatement` (§13.12.11): the whole `CaseBlock` — every case's
  `consequent` concatenated in source order — is one lexical scope. Create the
  environment and instantiate _before_ the case-matching passes run the
  consequents, and evaluate the discriminant in the _outer_ environment.
- `TryStatement` (§13.15.8): `node.block`, `node.handler.body`, and
  `node.finalizer` are each a `Block` and must each get their own scope. The
  cleanest expression is to evaluate them through the same block path rather
  than calling `evaluateStatementList` on their `.body` arrays directly. The
  catch _parameter_'s environment stays a separate environment outside the
  handler block's, exactly as ES2015 §13.15.7 specifies and as the code already
  does for the parameter.

Annex B.3.3 (sloppy mode only): a `FunctionDeclaration` directly inside a block,
`switch` case block, or `try` part in non-strict code also gets a var-scoped
binding. Implement B.3.3.1/B.3.3.2/B.3.3.3 as the spec states them: the
enclosing var-scope instantiation creates an `undefined`-initialized var binding
for the name when doing so is legal (no conflicting lexical declaration in the
chain, and for the global case `canDeclareGlobalVar`), and evaluating the
`FunctionDeclaration` statement in source order copies the block binding's
current value into the variable environment. Strict code gets none of this. This
is what keeps `{ function f(){} } f()` working while making
`if (false) { function f(){} } typeof f` evaluate to `'undefined'` — both must
be asserted.

Remove the Task 3 scaffold: `evaluateVariableDeclaration` now handles
`let`/`const`. ES2015 §13.3.1.4 — a declarator with an initializer evaluates the
initializer and calls `InitializeReferencedBinding`; a `let` declarator without
one initializes to `undefined`; a `const` declarator always has one (the parser
guarantees it). The completion value stays `EMPTY`. `var` keeps its existing
`getIdentifierReference`-then-`putValue` path and its §12.2.1 ordering comment.
A lexical declarator must _initialize_ its binding rather than assign to it, or
the TDZ check will reject its own initialization.

Also update the stale documentation this task invalidates: the "deliberate
simplification ... arrives with block scoping in a later task" paragraph in
`declarations.js`, the "future `let`/`const` bindings" and "future lexical
global bindings" comments in `src/runtime/environment.js`, and the "once Task 3
lands" / `with`-statement remarks in `src/evaluator/index.js` and
`src/evaluator/eval.js` that describe an environment split that now has more
sources.

Tests: new `test/lexical-declarations.test.js`, registered in `test/suites.js`.
Cover: block scoping and shadowing; TDZ on read, on write, and on `typeof`
(which must throw for a lexical binding in its TDZ, unlike an undeclared name);
`const` assignment throwing a guest `TypeError` in both sloppy and strict code;
`const` without reassignment; a closure created in a block capturing the block
binding; `switch` case-block scope shared across cases including a TDZ read from
an earlier case; `try`/`catch`/`finally` each scoping separately; the catch
parameter still shadowing; block-level function declarations being block-scoped
and hoisted-within-block; and the two Annex B assertions above plus the fact
that strict code does not get the alias.

### Task 5: Loop lexical scope and per-iteration bindings

Give `for` and `for-in` heads that declare lexically their own loop environment,
with per-iteration copies for `let`.

`ForStatement` with a `let`/`const` init (ES2015 §13.7.4.7):

1. `loopEnv = newDeclarativeEnvironment(context.env)`; for each bound name of
   the head, `createImmutableBinding(name, true)` if `const`, else
   `createMutableBinding(name, false)`.
2. Evaluate the head declaration in `loopEnv`.
3. `perIterationLets` is the head's bound names when it is `let`, and empty when
   it is `const`.
4. Run the body loop with `CreatePerIterationEnvironment(perIterationLets)`
   called once before the first test, and again after each body evaluation
   _before_ the update expression — that ordering is what makes
   `for (let i = 0; i < 3; i++) fns.push(function () { return i; })` yield
   `0, 1, 2`.

`CreatePerIterationEnvironment` (§13.7.4.8): with a non-empty name list, build a
new declarative environment whose _outer_ is the last iteration environment's
outer, create a mutable binding for each name, and initialize it from the last
iteration environment's current value; the new environment becomes the current
one. With an empty list it is a no-op.

`ForInStatement` with a `let`/`const` left (§13.7.5.11, §13.7.5.13):

- Head evaluation: create a declarative environment holding _uninitialized_
  bindings for the head's bound names, evaluate the right-hand expression in it,
  then restore — so `for (let x in x)` throws a `ReferenceError` from the TDZ.
- Each iteration: a fresh declarative environment over the _original_ outer
  environment, with the head's bindings created (immutable for `const`, mutable
  for `let`) and initialized to that iteration's key, then the body evaluated in
  it. A `const` head is legal in `for-in` and gets a fresh binding per
  iteration.

`while`, `do-while`, and labelled statements need no change: a block body
already scopes itself after Task 4.

The existing `applyLoopBodyResult` break/continue/label handling and the
`ForInStatement` key-snapshot and re-check semantics must be preserved exactly.
`var` and bare-expression heads must keep their current code path.

Tests: extend `test/lexical-declarations.test.js`. Cover: closures capturing per
iteration for `let` and the single shared binding for `var`; `const` in a `for`
head being immutable and the loop terminating (a `const` head with an update
expression that assigns must throw a guest `TypeError`); `continue` still
carrying the per-iteration value forward; a `break` out of a labelled loop; the
TDZ in a `for-in` head expression; `for (const k in obj)` binding freshly per
iteration with a captured closure; a body `var` still hoisting past the loop
environment to the enclosing variable scope; and a `for` head `let` shadowing an
outer binding of the same name.

### Task 6: Function body lexical scope

Give a function body its own lexical environment over the activation
environment, per ES2015 §9.2.15.

In `executeFunctionBody` (`src/evaluator/declarations.js`), the activation
environment stays the `variableEnv` — parameters, `arguments`, `var` names, and
top-level function declarations continue to be created there by
`functionDeclarationInstantiation`, unchanged. Add: `lexEnv` is `varEnv` when
the function is strict, and a fresh `newDeclarativeEnvironment(varEnv)` when it
is not (§9.2.15 steps 30–32); the body's `topLevelLexicallyScopedDeclarations`
are instantiated into `lexEnv` with the same rules
`blockDeclarationInstantiation` uses; and the body statement list is evaluated
with `env: lexEnv`, `variableEnv: varEnv`.

Cite in a comment why the strict case shares one environment — it is what the
spec says, and the early errors make the merge unobservable.

Tests: extend `test/lexical-declarations.test.js`. Cover: `let`/`const` at
function-body top level; TDZ before the declaration inside a function; a
parameter shadowed by nothing but visible to the body; a body `let` shadowing a
same-named outer binding; a closure over a body `const`; a nested function
seeing the outer body's lexical bindings; `arguments` still bound; and the same
cases in a strict function.

### Task 7: Global lexical declarations

Make script-level `let`/`const` create bindings in the global environment's
declarative record, with the ES2015 §15.1.11 runtime `SyntaxError`s.

Rewrite `globalDeclarationInstantiation` (`src/evaluator/declarations.js`) as
§15.1.11:

1. `lexNames` = `topLevelLexicallyDeclaredNames(program.body)`;
   `varNames` = `topLevelVarDeclaredNames(program.body)`.
2. For each name in `lexNames`: throw a guest `SyntaxError` if
   `env.hasVarDeclaration(name)`, `env.hasLexicalDeclaration(name)`, or
   `env.hasRestrictedGlobalProperty(name)`.
3. For each name in `varNames`: throw a guest `SyntaxError` if
   `env.hasLexicalDeclaration(name)`.
4. Function declarations: throw a guest `SyntaxError` if
   `!env.canDeclareGlobalFunction(name)`; then create the global function
   binding as today (`configurableBindings = false`).
5. `var` names: throw a guest `SyntaxError` if `!env.canDeclareGlobalVar(name)`;
   then create the global var binding as today.
6. Lexical declarations: `createImmutableBinding(name, true)` for `const`,
   `createMutableBinding(name, false)` for `let`, both uninitialized; a
   top-level `FunctionDeclaration` is var-scoped, not lexical, so it is not in
   this list.

These are _runtime_ errors raised before any statement runs, so they surface as
a `throw` completion from `evaluateScript` — the boundary already converts
`GuestErrorSignal` for this path. Keep every existing message and the existing
own-property model of `createGlobalVarBinding`/`createGlobalFunctionBinding`.

A global lexical binding must be invisible on the global object: assert that
`let x = 1` at script level leaves `globalObject.get('x')` `undefined` and
`'x' in globalObject` false, while resolving `x` in guest code finds the
binding, and that `this.x` is `undefined`. A second script evaluated in the same
realm must see the first script's lexical bindings, and must throw a guest
`SyntaxError` when it redeclares one.

Tests: extend `test/lexical-declarations.test.js` and, for realm-level
assertions, `test/realms.test.js`. Cover: global `let`/`const` resolution and
TDZ; invisibility on the global object; cross-script visibility and
redeclaration; `let x` after `var x` and `var x` after `let x`, in one script
and across two; `let undefined` / `let NaN` (restricted global properties)
throwing; `var undefined` still succeeding as it does today; and a
non-extensible global still throwing a `TypeError` for a new `var` while a `let`
succeeds.

### Task 8: Eval lexical scope

Give every `eval` its own lexical environment and implement
`EvalDeclarationInstantiation`'s name checks.

In `src/evaluator/eval.js` `performEval`, follow ES2015 §18.2.1.1 steps 12–14:
a direct eval's `lexEnv` is `newDeclarativeEnvironment(callerContext.env)` and
its `varEnv` is the caller's variable environment; an indirect eval's `lexEnv`
is `newDeclarativeEnvironment(realm.globalEnvironment)` and its `varEnv` is the
realm's global environment; and when the eval is strict, `varEnv` is `lexEnv`.
The practical change from today is that a _sloppy_ eval now also gets a fresh
lexical environment, which is what keeps `eval("let x = 1")` from leaking `x`
while `eval("var x = 1")` still creates `x` in the caller's variable scope.
Indirect eval already receives a global-rooted context from
`src/builtins/global-eval.js`; keep that seam and derive `lexEnv` from the
context it passes rather than reaching for the realm a second way.

In `evalDeclarationInstantiation` (`src/evaluator/declarations.js`), add
§18.2.1.3 step 5: when the eval is not strict, for each name in
`topLevelVarDeclaredNames(program.body)`, walk the environment chain from
`lexEnv` up to (but not including) `varEnv` and throw a guest `SyntaxError` if
any declarative record on the way has a binding for that name — that is how
`let x = 1; eval("var x = 2")` fails. When `varEnv` is the global environment,
also throw when `hasLexicalDeclaration(name)`. A `with` object environment
record in the chain is skipped, not consulted. Then instantiate the eval body's
`topLevelLexicallyScopedDeclarations` into `lexEnv` with the usual rules. Var
and function hoisting into `varEnv` keeps its current configurable/deletable
behavior and its ES5.1 §10.5 global rules.

Tests: extend `test/eval.test.js`. Cover: `eval("let x = 1")` not leaking and
not being visible after the call; `eval("var x = 1")` still leaking in sloppy
direct eval and still deletable; a direct eval reading and writing an enclosing
`let`; a direct eval inside a block seeing that block's bindings; a direct eval
inside a `catch` still hoisting its `var` past the catch scope; the
`let x; eval("var x")` `SyntaxError`; the same check at global scope across a
script and an indirect eval; strict eval keeping its own scope for both `var`
and `let`; and a direct eval in a TDZ region throwing on the enclosing binding.

### Task 9: Test262 selection, pinning, and coverage

Bring the pinned upstream Test262 subset in line with the new grammar, and
regenerate every artifact that depends on it. Uses `vendor/test262` at the
pinned revision.

In `tools/test262/es5-selection.js` and its caller
`tools/test262/upstream-select.js`, replace the "parses at ecmaVersion 5"
structural filter with "parses under the engine's supported grammar" — the
engine's own `parseScript` from `src/parser.js`, which is by construction the
right predicate now that the grammar is ES5.1 plus lexical declarations, and
which keeps the filter honest for every future milestone. Rename the
`Es5CandidateInfo` fields `parsesAtEs5`/`includesParseAtEs5` accordingly and
update `test/es5-selection.test.js`. Keep the file names
`es5-selection.js`/`es5-selection.json` and the policy's JSON schema unchanged —
sibling issues depend on them.

Then, in order:

1. `npm run test262:exclusions:check` and remove every exclusion it reports as
   stale — the `post-es5-syntax` entries whose stated reason is that the test
   uses `let`/`const` are the expected bulk. Do not remove an exclusion the
   check still reports as `failed`; if its recorded reason is now wrong,
   rewrite the reason instead.
2. `npm run test262:select` to regenerate `tools/test262/upstream-subset.json`.
3. `NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream` to regenerate `docs/test262-report.jsonl` and the
   generated coverage block in `docs/conformance.md`.
4. `npm run test262:select:check`, `NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream:check`, and
   `npm run test262:exclusions:check` must all pass afterwards.

Every newly selected test that _fails_ is a real conformance defect or a
genuinely out-of-scope test. Fix the defects in `src/`, with a local regression
test added to `test/lexical-declarations.test.js` first (Global Constraint 1),
and classify anything genuinely out of scope as a new exclusion with an accurate
category and a reason citing the clause or the `docs/limitations.md` anchor. An
`engine-deviation` reason must reference a heading that exists in
`docs/limitations.md`, or `test/node/repository-invariants.test.js` fails.

Report the before/after counts from `docs/test262-report.jsonl`'s summary
record, and the list of newly selected groups.

### Task 10: Documentation and portable validation

Update the four reference documents and run every contract.

- `docs/architecture.md`: `## Source flow` gains the grammar the parser now
  accepts and the early-error pass that bounds it;
  `### Environment records` gains uninitialized bindings, the TDZ, the
  declarative/global lexical split, and per-iteration environments;
  `## Evaluator boundaries` gains `static-semantics.js` and the block/loop/eval
  instantiation paths.
- `docs/conformance.md`: `## Supported subset` states that the engine implements
  ES5.1 plus ES2015 lexical declarations, and `## How the ES5 selection is
derived` describes the grammar filter's new meaning. The generated coverage
  block is Task 9's output — do not hand-edit it.
- `docs/limitations.md`: add entries for the ES2015 constructs the parser
  rejects and for any deviation Task 9 recorded as `engine-deviation`. Remove
  nothing that is still true.
- `docs/testing.md`: only if a script or suite changed. A new `npm` script must
  be documented there or `test/node/repository-invariants.test.js` fails.

Then run, and report the result of each: `npm run format`, `npm run lint`,
`npm run typecheck`, `npm run test:node`, `npm run test262:fixtures`,
`npm run test:browser`, `npm run test:jsc` (report it as unavailable if the
`jsc` binary is absent rather than reporting a pass), `npm run ci:check`,
`npm run test262:select:check`, `NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream:check`,
`npm run test262:exclusions:check`, and `npm run ci:contract`.
