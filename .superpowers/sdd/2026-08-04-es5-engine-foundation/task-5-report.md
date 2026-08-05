# Task 5 Report: Expression and statement evaluation

## Summary
Implemented `evaluate(node, context)` with explicit AST dispatch and
completion propagation, and wired `evaluateScript` to global declaration
instantiation followed by statement-list evaluation. Covered: literals
(including an explicit rejection of regex literals, which have no guest
representation yet); identifier reads/references; `typeof`/`void`/`!`/`-`/`+`
unary expressions; the 12 arithmetic/equality/relational binary operators;
`&&`/`||` logical short-circuiting; the conditional operator; `=` assignment;
`var` declarations with hoisting (global declaration instantiation); expression,
empty, and block statements with spec-accurate completion-value threading
(`UpdateEmpty`); `if`/`while`/`do-while`/`for`; unlabeled `break`/`continue`
with per-spec loop `V`-threading; and explicit `UnsupportedNodeError`/
`UnsupportedOperatorError`s for everything Task 6 owns (functions, member
access, calls, `new`, object/array literals, `SequenceExpression`) and
everything else out of scope (bitwise/`instanceof`/`in`, compound assignment,
`++`/`--`, `for-in`, `switch`, `try`/`catch`/`throw`, `with`, labeled
statements/labeled `break`/`continue`).

One necessary, spec-driven addition outside the brief's file list: ES5
§15.1.1 mandates `NaN`, `Infinity`, and `undefined` as non-writable,
non-enumerable, non-configurable data properties of the global object.
Scripts reference them as plain `Identifier` nodes (not literals), so
comparisons like `null == undefined` or `NaN < 1` needed them installed on
every realm's global object; added via `defineGlobalValueProperties` in
`src/builtins/fundamental.js`, called from the `Realm` constructor.

Tested overwhelmingly through `evaluateScript` (parser → evaluator
integration); one small test exercises `evaluate()` directly since it's the
task's stated "Produces" interface.

## Files
- `src/evaluator/index.js` (new) — `evaluate(node, context)` public entry
  point; dispatches by node type to `evaluateStatement` (completion record)
  or `evaluateExpressionValue` (dereferenced value); defines the shared
  `EvaluationContext` typedef.
- `src/evaluator/expressions.js` (new) — `evaluateExpression`/
  `evaluateExpressionValue`; literals, identifiers, unary/binary/logical/
  conditional/assignment expressions; explicit unsupported-node/operator
  errors for everything else.
- `src/evaluator/statements.js` (new) — `evaluateStatement`/
  `evaluateStatementList`; expression/empty/block statements, `if`,
  `while`/`do-while`/`for`, `break`/`continue`; `StatementList` and loop
  `V`-threading per ECMA-262 12.x/13.x.
- `src/evaluator/declarations.js` (new) — `globalDeclarationInstantiation`
  (hoisting) and `evaluateVariableDeclaration` (declarator initializer
  execution).
- `test/evaluator-expressions.test.js` (new) — 20 cases.
- `test/evaluator-statements.test.js` (new) — 24 cases.
- `src/api.js` (rewritten) — `evaluateScript` now runs global declaration
  instantiation then evaluates the program's statement list, mapping the
  internal `EMPTY` completion-value sentinel back to `undefined` at the
  public API boundary.
- `src/runtime/completion.js` (added `EMPTY` sentinel, `updateEmpty`
  abstract operation).
- `src/runtime/conversion.js` (added `toBoolean`).
- `src/runtime/operators.js` (added `typeOf`).
- `src/runtime/errors.js` (added `UnsupportedOperatorError`,
  `createUnsupportedOperatorError`).
- `src/builtins/fundamental.js` (added `defineGlobalValueProperties`).
- `src/runtime/realm.js` (calls `defineGlobalValueProperties` in the `Realm`
  constructor).
- `test/realms.test.js` (2 tests updated: the scripts they used to prove
  "unsupported" — `'var x = 1;'`, `'1 + 1;'` — are now supported by Task 5,
  so they were changed to `'function f() {}'`/`'a.b;'`, which remain
  unsupported until Task 6).

## RED / GREEN evidence (per slice)

Each slice below was verified genuinely RED by temporarily replacing the
relevant `case` in the evaluator's dispatch `switch` with
`throw createUnsupportedNodeError(node); // TEMP-RED-STUB` (and, for slice B,
also making `globalDeclarationInstantiation` a no-op), running the target
test file(s), confirming failures for the expected reason, then reverting
the stub (verified afterward with `grep -rn TEMP-RED-STUB src/` returning
nothing) and re-running to confirm GREEN.

### Slice A — literals, expression/empty/block statements
Stubbed: `case 'Literal'` in `expressions.js`; `case 'ExpressionStatement'`,
`'EmptyStatement'`, `'BlockStatement'` in `statements.js`.

RED (`node test/run-node.js test/evaluator-expressions.test.js` /
`test/evaluator-statements.test.js`, abridged):
```text
{"name":"numeric, string, boolean, and null literals evaluate to themselves","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: ExpressionStatement"}}
{"name":"identifiers read the value bound to a declared variable","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: Literal"}}
... (17 more failures cascading from the same stubs) ...
---
{"name":"evaluate() dispatches statement nodes to a completion record and expression nodes to a value","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: ExpressionStatement"}}
{"name":"expression statements evaluate to their expression value","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: ExpressionStatement"}}
{"name":"empty statements produce an empty (undefined) completion value","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: EmptyStatement"}}
{"name":"block statements evaluate their nested statement list","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: BlockStatement"}}
... (17 more failures, since every other test's script contains an ExpressionStatement/Literal) ...
```
GREEN (after reverting): 20/20 and 24/24 passed.

### Slice B — identifiers, assignment, `var` declarations/hoisting
Stubbed: `case 'Identifier'` and `case 'AssignmentExpression'` in
`expressions.js`; `case 'VariableDeclaration'` in `statements.js`; body of
`globalDeclarationInstantiation` in `declarations.js` replaced with an
early `return`.

RED (abridged):
```text
{"name":"identifiers read the value bound to a declared variable","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: VariableDeclaration"}}
{"name":"reading an undeclared identifier throws a ReferenceError","status":"failed","error":{"name":"Error","message":"Expected ReferenceError but got UnsupportedNodeError"}}
{"name":"assignment expressions assign and evaluate to the assigned value","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: VariableDeclaration"}}
... (12 total failures in evaluator-expressions.test.js) ...
---
{"name":"var declarations create global bindings initialized to undefined","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: VariableDeclaration"}}
{"name":"var declarations with initializers assign the initializer value","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: VariableDeclaration"}}
... (17 total failures in evaluator-statements.test.js, including every
     loop/if test whose script declares a var) ...
```
GREEN (after reverting): 20/20 and 24/24 passed.

### Slice C — unary/binary/logical/conditional expressions + unsupported operators
Stubbed: `case 'UnaryExpression'`, `'BinaryExpression'`,
`'LogicalExpression'`, `'ConditionalExpression'` in `expressions.js`.

RED:
```text
{"name":"assignment right-hand sides can reference the left-hand variable","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: BinaryExpression"}}
{"name":"typeof reports guest primitive types and undefined for unresolved identifiers","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: UnaryExpression"}}
{"name":"void always evaluates to undefined and still evaluates its operand","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: UnaryExpression"}}
{"name":"unary !, -, and + apply boolean negation and numeric coercion","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: UnaryExpression"}}
{"name":"binary arithmetic operators follow abstract numeric/string coercion","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: BinaryExpression"}}
{"name":"binary equality operators distinguish strict and abstract comparison","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: BinaryExpression"}}
{"name":"binary relational operators compare numbers and strings","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: BinaryExpression"}}
{"name":"logical && and || short-circuit without evaluating the right operand","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: LogicalExpression"}}
{"name":"the conditional operator evaluates only the taken branch","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: ConditionalExpression"}}
{"name":"unsupported unary operators (bitwise not, delete) throw explicitly","status":"failed","error":{"name":"Error","message":"Expected \"UnsupportedNodeError\" to be the same value as \"UnsupportedOperatorError\""}}
{"name":"unsupported binary operators (bitwise, instanceof, in) throw explicitly","status":"failed","error":{"name":"Error","message":"Expected \"UnsupportedNodeError\" to be the same value as \"UnsupportedOperatorError\""}}
```
(12 of 20 cases failed; the remaining 8 — literals, identifiers, assignment,
compound-assignment/update-expression/member-assignment/regex/Task-6-node
rejections — do not reach unary/binary/logical/conditional dispatch.)

GREEN (after reverting, before the global-value-properties fix below):
18/20 passed — two new failures surfaced:
```text
{"name":"binary equality operators distinguish strict and abstract comparison","status":"failed","error":{"name":"ReferenceError","message":"Cannot resolve unresolvable reference undefined"}}
{"name":"binary relational operators compare numbers and strings","status":"failed","error":{"name":"ReferenceError","message":"Cannot resolve unresolvable reference NaN"}}
```
Root cause: the tests use `undefined` and `NaN` as bare identifiers (real
ES5 scripts do this constantly), but no realm defined them as global
properties — an intrinsics gap, not a dispatch bug. Fixed by adding
`defineGlobalValueProperties(globalObject)` (ES5 §15.1.1: `NaN`, `Infinity`,
`undefined`, each `{writable: false, enumerable: false, configurable:
false}`) to `src/builtins/fundamental.js`, called from `Realm`'s
constructor. Re-ran: 20/20 passed. Full-suite/typecheck/lint re-verified
clean afterward (see CHECK).

### Slice D — `if`
Stubbed: `case 'IfStatement'` in `statements.js`.

RED (abridged — 8 failures, including tests that use `if` only inside a
loop body, e.g. break/continue tests):
```text
{"name":"var declarations inside blocks, if, and loop bodies hoist to the global scope","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: IfStatement"}}
{"name":"if executes the consequent when the (coerced) test is truthy","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: IfStatement"}}
{"name":"if executes the alternate when the test is falsy","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: IfStatement"}}
{"name":"if without an else and a falsy test has an empty completion value","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: IfStatement"}}
{"name":"for loops with an omitted test run until an explicit break","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: IfStatement"}}
{"name":"break exits the innermost while/do-while/for loop with a normal completion","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: IfStatement"}}
{"name":"break inside a for loop stops before the update clause runs again","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: IfStatement"}}
{"name":"continue skips the remainder of the current iteration only","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: IfStatement"}}
{"name":"break in a nested loop only exits the innermost loop","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: IfStatement"}}
```
GREEN (after reverting): 24/24 passed.

### Slice E — `while` / `do-while`
Stubbed: `case 'WhileStatement'`, `'DoWhileStatement'` in `statements.js`.

RED:
```text
{"name":"var declarations inside blocks, if, and loop bodies hoist to the global scope","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: WhileStatement"}}
{"name":"while loops run their body while the test is truthy and thread the last value","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: WhileStatement"}}
{"name":"while loops that never run their body have an empty completion value","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: WhileStatement"}}
{"name":"do-while loops execute their body at least once even if the test starts false","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: DoWhileStatement"}}
{"name":"break exits the innermost while/do-while/for loop with a normal completion","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: WhileStatement"}}
{"name":"continue skips the remainder of the current iteration only","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: WhileStatement"}}
```
(6 failures; the `for`-based tests are unaffected by this stub.)

GREEN (after reverting): 24/24 passed.

### Slice F — `for`, `break`, `continue`
Stubbed: `case 'ForStatement'`, `'BreakStatement'`, `'ContinueStatement'` in
`statements.js`.

RED:
```text
{"name":"for loops run init once, test before each iteration, and update after each iteration","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: ForStatement"}}
{"name":"for loops with an omitted test run until an explicit break","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: ForStatement"}}
{"name":"break exits the innermost while/do-while/for loop with a normal completion","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: BreakStatement"}}
{"name":"break inside a for loop stops before the update clause runs again","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: ForStatement"}}
{"name":"continue skips the remainder of the current iteration only","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: ContinueStatement"}}
{"name":"break in a nested loop only exits the innermost loop","status":"failed","error":{"name":"UnsupportedNodeError","message":"Unsupported AST node: ForStatement"}}
```
GREEN (after reverting): 24/24 passed. Confirmed no leftover stubs:
`grep -rn "TEMP-RED-STUB" src/` → no matches.

## CHECK
Command:
```sh
for f in test/*.test.js; do node test/run-node.js "$f"; done
npm run typecheck
npm run lint
```
Output (92 cases across 9 suites, 0 failures; typecheck and lint clean):
```text
== test/abstract-operations.test.js == (8 passed)
== test/environments.test.js == (13 passed)
== test/evaluator-expressions.test.js == (20 passed)
== test/evaluator-statements.test.js == (24 passed)
== test/foundation.test.js == (2 passed)
== test/objects.test.js == (7 passed)
== test/parser.test.js == (5 passed)
== test/realms.test.js == (8 passed)
== test/runtime-records.test.js == (5 passed)

> typecheck
> tsc -p jsconfig.json


> lint
> ESLINT_USE_FLAT_CONFIG=true eslint . && prettier --check package.json jsconfig.json eslint.config.js .prettierrc.json test/*.js test/harness/*.js types/*.d.ts

Checking formatting...
All matched files use Prettier code style!
```
(Verified via `grep -c '"status":"passed"'`/`'"status":"failed"'` across all
files: 92 passed, 0 failed.)

Two intermediate issues were fixed en route to this clean state:
1. **Typecheck** (`statements.js`): three `let value = EMPTY;` declarations
   (in `evaluateWhileStatement`/`evaluateDoWhileStatement`/
   `evaluateForStatement`) were inferred as type `symbol`, then reassigned
   from a function returning `unknown` → `TS2322`. Fixed with explicit
   `/** @type {unknown} */` JSDoc directly above each declaration.
2. **Typecheck** (new `evaluate()` direct test in
   `evaluator-statements.test.js`): `evaluate()`'s return type is `unknown`
   (it dispatches to either a completion record or a bare value), so
   `completion.type`/`completion.value` triggered `TS18046`. Fixed with a
   local `/** @type {{ type: string, value: unknown }} */` cast at the call
   site, matching the pattern other tests use for narrowing `unknown`.
3. **Lint/Prettier**: the two new test files needed one
   `prettier --write` pass (wrapping/line-length only, no semantic change);
   `npm run lint` was clean after that.

## Self-review
- **Completion propagation** is spec-accurate, not ad hoc: `EMPTY` (a
  `Symbol`, added to `completion.js`) and `updateEmpty` (ECMA-262
  `UpdateEmpty`) let `EmptyStatement`, `var` declarations, an untaken `if`
  branch, and `break`/`continue` correctly inherit the *last meaningful*
  value from a preceding statement (`{ 1; var x; ; }` evaluates to `1`, not
  `undefined`) instead of always resetting to `undefined`. `updateEmpty` is
  actually called from both `evaluateStatementList` and the shared loop
  helper `applyLoopBodyResult` (a refactor step after initially duplicating
  the same ternary inline in both places — caught and cleaned up before
  finalizing, then re-verified green).
- **Loops** (`while`/`do-while`/`for`) implement the ES5.1 per-iteration `V`
  threading precisely (12.6.x): a normal or `continue` completion carries
  its value forward as the loop's running value; `break` ends the loop with
  a normal completion carrying that value; a hypothetical `return`/`throw`
  path is plumbed through (`applyLoopBodyResult`'s `'propagate'` branch)
  even though nothing reachable produces one yet, so adding `return` in a
  later task won't require touching loop internals again. Because no labels
  exist, every `break`/`continue` unconditionally targets the innermost
  loop — verified explicitly with a nested-`for` test asserting an inner
  `break` doesn't affect the outer loop's iteration count.
- **`typeof` on unresolved identifiers** returns `'undefined'` without
  throwing (ECMA-262 11.4.3), requiring a small special case ahead of the
  normal `GetValue` path — implemented in `evaluateTypeofExpression`,
  checked directly against `reference.base === undefined` (the exact
  unresolvable-reference sentinel `getIdentifierReference` already uses).
- **Binary-operator dispatch order matters and is correct**: `evaluateBinaryExpression`
  checks `SUPPORTED_BINARY_OPERATORS.has(operator)` *before* evaluating
  either operand. This was deliberately verified with tests like
  `1 instanceof Object;`/`"a" in {};` — `Object`/`{}` would otherwise need
  to resolve/evaluate (an undeclared identifier and an unsupported object
  literal, respectively) before the operator check could reject them; the
  actual failure is always the intended `UnsupportedOperatorError` for the
  operator, not an incidental `ReferenceError`/`UnsupportedNodeError` from
  evaluating an operand that happens to come first.
- **Assignment** only supports `=` with an `Identifier` target; compound
  operators (`+=` etc.) throw `UnsupportedOperatorError`, and any
  non-`Identifier` left-hand side (`MemberExpression`) throws
  `UnsupportedNodeError` naming the *left-hand node*, without ever touching
  the right-hand side or the target's current value — verified by using
  `var x;` (not `var x = {};`) as the setup in the member-assignment test,
  confirming the rejection genuinely happens before any evaluation of `x`.
- **Global declaration instantiation** (`globalDeclarationInstantiation`)
  walks exactly the ES5 var-scope-sharing statement forms (`BlockStatement`,
  `IfStatement`, `WhileStatement`/`DoWhileStatement`, `ForStatement`'s
  `init`+`body`) and stops at anything else — which, with no special-casing
  at all, already correctly stops at a `FunctionDeclaration`/
  `FunctionExpression` boundary once Task 6 adds them, since those simply
  fall into the `default: return` case today.
- **Regex literals**: Acorn attaches a live host `RegExp` instance as
  `node.value` for regex literals (confirmed by direct probing). Since no
  guest `RegExp` exists, `evaluateLiteral` explicitly rejects any `Literal`
  node with a `regex` field via a synthetic `{type: 'RegExpLiteral'}`
  passed to `createUnsupportedNodeError`, rather than ever returning that
  host object as a guest value.
- **`NaN`/`Infinity`/`undefined` as realm globals**: added because they are
  literally part of ES5's Global Object per spec (§15.1.1), not because of
  any dispatch gap — scripts reference them as ordinary `Identifier` nodes.
  This was the one addition outside the brief's stated file list; it lives
  in `src/builtins/fundamental.js` (already the realm-bootstrapping module
  from Task 4) and is exercised implicitly by every equality/relational
  test that uses them, plus continues to pass every pre-existing
  `realms.test.js`/`environments.test.js` assertion (host-name isolation,
  fresh-intrinsics-per-realm, etc.) unchanged.
- Every unsupported case (bitwise operators, `instanceof`, `in`, compound
  assignment, `UpdateExpression` (`++`/`--`), regex literals, member-
  expression assignment targets, `ObjectExpression`, `ArrayExpression`,
  `CallExpression`, `NewExpression`, `FunctionExpression`,
  `SequenceExpression`, `FunctionDeclaration`, `ForInStatement`,
  `SwitchStatement`, `TryStatement`, `ThrowStatement`, `WithStatement`,
  `LabeledStatement`/labeled `break`/`continue`) has an explicit test
  asserting the exact error name and, where applicable, `.nodeType`/
  `.operator`/`.kind` — no node type silently falls through to host
  behavior.
- Plain JS + JSDoc throughout; no `eval`/`Function`/dynamic `import`/
  Node-only modules; no host objects leak into guest evaluation (confirmed
  by the pre-existing `realms.test.js` isolation tests still passing
  unmodified in substance).

## Concerns
- **Strict mode is not implemented.** `context.strict` is hardcoded `false`
  everywhere in this milestone; there is no directive-prologue detection.
  This means strict-mode-only behaviors (e.g. assignment to an unresolvable
  reference throwing instead of auto-vivifying a global, or immutable-
  binding writes throwing instead of silently no-op-ing) are not
  reachable/testable yet. Flagging for a future task rather than fixing
  here, since directive detection is a distinct, non-trivial feature not
  in this task's scope.
- **Non-strict unresolvable-reference writes still throw
  `ReferenceError`.** Real non-strict JS auto-vivifies an implicit global
  on `x = 1;` when `x` was never declared; this engine's `putValue`/
  `setMutableBinding` (pre-existing from Task 2/4) always throw regardless
  of strict mode. This is the same pre-existing gap already noted as
  deferred in `progress.md` for Task 4 and was deliberately left alone here
  as out of scope for Task 5 (evaluation semantics, not reference
  semantics).
- **`UpdateExpression` (`++`/`--`) is not special-cased** — it simply falls
  through the expression dispatch's `default` case like any other
  unimplemented node type, rather than being explicitly enumerated. This
  is intentional (it's a distinct AST node type from `UnaryExpression`, and
  the brief scopes this task to the listed behaviors only) but is worth
  flagging in case a reviewer expects a more specific `UnsupportedOperatorError`
  rather than a generic `UnsupportedNodeError` for it; a test confirms the
  current (node-level) behavior explicitly.
- **`progress.md` was intentionally left unchanged.** Tasks 1–4's ledger
  entries follow a pattern of a `fix round`/review cycle before a task is
  marked `complete`; since no such review cycle was run in this dispatch, I
  did not add a premature "Task 5: complete" line to avoid presuming the
  outcome of that separate process.
- The `EMPTY` sentinel and `updateEmpty` operation were added to
  `completion.js`, a file Task 2 originally owned. This was judged
  in-scope because "completion propagation" is Task 5's explicit interface
  requirement and `UpdateEmpty` is the exact ECMA-262 operation that
  implements it — the alternative (reimplementing equivalent logic
  elsewhere, or returning plain `undefined` and losing the "no value yet vs.
  guest `undefined`" distinction) would be less faithful to the spec this
  project is targeting.
- Test coverage for `SUPPORTED_BINARY_OPERATORS`'s pre-operand-evaluation
  check only exercises the `instanceof`/`in`/bitwise cases; it does not
  additionally verify every one of the 12 *supported* operators evaluates
  operands in left-to-right order under side effects (e.g. assignment
  expressions as operands) — existing tests do cover this indirectly via
  the "assignment right-hand sides can reference the left-hand variable"
  and short-circuit tests, but a dedicated left-to-right-order test for
  binary arithmetic specifically was not added, since it wasn't called out
  in the brief's behavior list.

## Round 1 follow-up — loop coverage fixes

Updated `test/evaluator-statements.test.js` only:
- renamed the existing broad while-only `break`/`continue` cases to accurate while-specific names
- added focused tests for `do-while` `break`, `do-while` `continue`, and `for`-loop `continue` + update-clause interaction
- left production code unchanged after the mutation checks below

### Mutation proof 1 — do-while `break` keeps the loop's last meaningful value

Mutation command:
```sh
python3 - <<'PY'
from pathlib import Path
path = Path('src/evaluator/statements.js')
text = path.read_text()
marker = 'function evaluateDoWhileStatement(node, context) {'
next_marker = 'function evaluateForStatement(node, context) {'
start = text.index(marker)
end = text.index(next_marker, start)
segment = text[start:end]
old = '      return createNormalCompletion(value);\n'
new = '      return createNormalCompletion(EMPTY);\n'
if old not in segment:
    raise SystemExit('return line not found inside do-while function')
segment = segment.replace(old, new, 1)
path.write_text(text[:start] + segment + text[end:])
PY
```

RED command:
```sh
node test/run-node.js test/evaluator-statements.test.js
```

RED output:
```text
{"name":"evaluate() dispatches statement nodes to a completion record and expression nodes to a value","status":"passed"}
{"name":"expression statements evaluate to their expression value","status":"passed"}
{"name":"empty statements produce an empty (undefined) completion value","status":"passed"}
{"name":"block statements evaluate their nested statement list","status":"passed"}
{"name":"block statement completion values thread through empty completions","status":"passed"}
{"name":"var declarations create global bindings initialized to undefined","status":"passed"}
{"name":"var declarations with initializers assign the initializer value","status":"passed"}
{"name":"var declarations support multiple comma-separated declarators","status":"passed"}
{"name":"var declarations are hoisted before the statement that declares them runs","status":"passed"}
{"name":"var declarations inside blocks, if, and loop bodies hoist to the global scope","status":"passed"}
{"name":"if executes the consequent when the (coerced) test is truthy","status":"passed"}
{"name":"if executes the alternate when the test is falsy","status":"passed"}
{"name":"if without an else and a falsy test has an empty completion value","status":"passed"}
{"name":"while loops run their body while the test is truthy and thread the last value","status":"passed"}
{"name":"while loops that never run their body have an empty completion value","status":"passed"}
{"name":"do-while loops execute their body at least once even if the test starts false","status":"passed"}
{"name":"for loops run init once, test before each iteration, and update after each iteration","status":"passed"}
{"name":"for loops with an omitted test run until an explicit break","status":"passed"}
{"name":"break exits a while loop with a normal completion","status":"passed"}
{"name":"break exits a do-while loop with the last meaningful completion value","status":"failed","error":{"name":"Error","message":"Expected undefined to be the same value as 3"}}
{"name":"break inside a for loop stops before the update clause runs again","status":"passed"}
{"name":"continue in a while loop skips the remainder of the current iteration only","status":"passed"}
{"name":"continue in a do-while loop skips the rest of the body and rechecks the test","status":"passed"}
{"name":"continue in a for loop still runs the update clause before the next test","status":"passed"}
{"name":"break in a nested loop only exits the innermost loop","status":"passed"}
{"name":"evaluateScript rejects FunctionDeclaration explicitly (Task 6)","status":"passed"}
{"name":"evaluateScript rejects for-in, switch, try, throw, with, and labeled statements explicitly","status":"passed"}
```

GREEN command:
```sh
git checkout -- src/evaluator/statements.js && node test/run-node.js test/evaluator-statements.test.js
```

GREEN output:
```text
{"name":"evaluate() dispatches statement nodes to a completion record and expression nodes to a value","status":"passed"}
{"name":"expression statements evaluate to their expression value","status":"passed"}
{"name":"empty statements produce an empty (undefined) completion value","status":"passed"}
{"name":"block statements evaluate their nested statement list","status":"passed"}
{"name":"block statement completion values thread through empty completions","status":"passed"}
{"name":"var declarations create global bindings initialized to undefined","status":"passed"}
{"name":"var declarations with initializers assign the initializer value","status":"passed"}
{"name":"var declarations support multiple comma-separated declarators","status":"passed"}
{"name":"var declarations are hoisted before the statement that declares them runs","status":"passed"}
{"name":"var declarations inside blocks, if, and loop bodies hoist to the global scope","status":"passed"}
{"name":"if executes the consequent when the (coerced) test is truthy","status":"passed"}
{"name":"if executes the alternate when the test is falsy","status":"passed"}
{"name":"if without an else and a falsy test has an empty completion value","status":"passed"}
{"name":"while loops run their body while the test is truthy and thread the last value","status":"passed"}
{"name":"while loops that never run their body have an empty completion value","status":"passed"}
{"name":"do-while loops execute their body at least once even if the test starts false","status":"passed"}
{"name":"for loops run init once, test before each iteration, and update after each iteration","status":"passed"}
{"name":"for loops with an omitted test run until an explicit break","status":"passed"}
{"name":"break exits a while loop with a normal completion","status":"passed"}
{"name":"break exits a do-while loop with the last meaningful completion value","status":"passed"}
{"name":"break inside a for loop stops before the update clause runs again","status":"passed"}
{"name":"continue in a while loop skips the remainder of the current iteration only","status":"passed"}
{"name":"continue in a do-while loop skips the rest of the body and rechecks the test","status":"passed"}
{"name":"continue in a for loop still runs the update clause before the next test","status":"passed"}
{"name":"break in a nested loop only exits the innermost loop","status":"passed"}
{"name":"evaluateScript rejects FunctionDeclaration explicitly (Task 6)","status":"passed"}
{"name":"evaluateScript rejects for-in, switch, try, throw, with, and labeled statements explicitly","status":"passed"}
```

### Mutation proof 2 — do-while `continue` rechecks the loop test instead of exiting

Mutation command:
```sh
python3 - <<'PY'
from pathlib import Path
path = Path('src/evaluator/statements.js')
text = path.read_text()
marker = 'function evaluateDoWhileStatement(node, context) {'
next_marker = 'function evaluateForStatement(node, context) {'
start = text.index(marker)
end = text.index(next_marker, start)
segment = text[start:end]
old = """    if (action === 'propagate') {
      return { ...bodyResult, value };
    }
"""
new = """    if (bodyResult.type === 'continue') {
      return createNormalCompletion(value);
    }

    if (action === 'propagate') {
      return { ...bodyResult, value };
    }
"""
if old not in segment:
    raise SystemExit('propagate branch not found inside do-while function')
segment = segment.replace(old, new, 1)
path.write_text(text[:start] + segment + text[end:])
PY
```

RED command:
```sh
node test/run-node.js test/evaluator-statements.test.js
```

RED output:
```text
{"name":"evaluate() dispatches statement nodes to a completion record and expression nodes to a value","status":"passed"}
{"name":"expression statements evaluate to their expression value","status":"passed"}
{"name":"empty statements produce an empty (undefined) completion value","status":"passed"}
{"name":"block statements evaluate their nested statement list","status":"passed"}
{"name":"block statement completion values thread through empty completions","status":"passed"}
{"name":"var declarations create global bindings initialized to undefined","status":"passed"}
{"name":"var declarations with initializers assign the initializer value","status":"passed"}
{"name":"var declarations support multiple comma-separated declarators","status":"passed"}
{"name":"var declarations are hoisted before the statement that declares them runs","status":"passed"}
{"name":"var declarations inside blocks, if, and loop bodies hoist to the global scope","status":"passed"}
{"name":"if executes the consequent when the (coerced) test is truthy","status":"passed"}
{"name":"if executes the alternate when the test is falsy","status":"passed"}
{"name":"if without an else and a falsy test has an empty completion value","status":"passed"}
{"name":"while loops run their body while the test is truthy and thread the last value","status":"passed"}
{"name":"while loops that never run their body have an empty completion value","status":"passed"}
{"name":"do-while loops execute their body at least once even if the test starts false","status":"passed"}
{"name":"for loops run init once, test before each iteration, and update after each iteration","status":"passed"}
{"name":"for loops with an omitted test run until an explicit break","status":"passed"}
{"name":"break exits a while loop with a normal completion","status":"passed"}
{"name":"break exits a do-while loop with the last meaningful completion value","status":"passed"}
{"name":"break inside a for loop stops before the update clause runs again","status":"passed"}
{"name":"continue in a while loop skips the remainder of the current iteration only","status":"passed"}
{"name":"continue in a do-while loop skips the rest of the body and rechecks the test","status":"failed","error":{"name":"Error","message":"Expected 2 to be the same value as 9"}}
{"name":"continue in a for loop still runs the update clause before the next test","status":"passed"}
{"name":"break in a nested loop only exits the innermost loop","status":"passed"}
{"name":"evaluateScript rejects FunctionDeclaration explicitly (Task 6)","status":"passed"}
{"name":"evaluateScript rejects for-in, switch, try, throw, with, and labeled statements explicitly","status":"passed"}
```

GREEN command:
```sh
git checkout -- src/evaluator/statements.js && node test/run-node.js test/evaluator-statements.test.js
```

GREEN output:
```text
{"name":"evaluate() dispatches statement nodes to a completion record and expression nodes to a value","status":"passed"}
{"name":"expression statements evaluate to their expression value","status":"passed"}
{"name":"empty statements produce an empty (undefined) completion value","status":"passed"}
{"name":"block statements evaluate their nested statement list","status":"passed"}
{"name":"block statement completion values thread through empty completions","status":"passed"}
{"name":"var declarations create global bindings initialized to undefined","status":"passed"}
{"name":"var declarations with initializers assign the initializer value","status":"passed"}
{"name":"var declarations support multiple comma-separated declarators","status":"passed"}
{"name":"var declarations are hoisted before the statement that declares them runs","status":"passed"}
{"name":"var declarations inside blocks, if, and loop bodies hoist to the global scope","status":"passed"}
{"name":"if executes the consequent when the (coerced) test is truthy","status":"passed"}
{"name":"if executes the alternate when the test is falsy","status":"passed"}
{"name":"if without an else and a falsy test has an empty completion value","status":"passed"}
{"name":"while loops run their body while the test is truthy and thread the last value","status":"passed"}
{"name":"while loops that never run their body have an empty completion value","status":"passed"}
{"name":"do-while loops execute their body at least once even if the test starts false","status":"passed"}
{"name":"for loops run init once, test before each iteration, and update after each iteration","status":"passed"}
{"name":"for loops with an omitted test run until an explicit break","status":"passed"}
{"name":"break exits a while loop with a normal completion","status":"passed"}
{"name":"break exits a do-while loop with the last meaningful completion value","status":"passed"}
{"name":"break inside a for loop stops before the update clause runs again","status":"passed"}
{"name":"continue in a while loop skips the remainder of the current iteration only","status":"passed"}
{"name":"continue in a do-while loop skips the rest of the body and rechecks the test","status":"passed"}
{"name":"continue in a for loop still runs the update clause before the next test","status":"passed"}
{"name":"break in a nested loop only exits the innermost loop","status":"passed"}
{"name":"evaluateScript rejects FunctionDeclaration explicitly (Task 6)","status":"passed"}
{"name":"evaluateScript rejects for-in, switch, try, throw, with, and labeled statements explicitly","status":"passed"}
```

### Mutation proof 3 — `for`-loop `continue` still runs the update clause

Mutation command:
```sh
python3 - <<'PY'
from pathlib import Path
path = Path('src/evaluator/statements.js')
text = path.read_text()
marker = 'function evaluateForStatement(node, context) {'
start = text.index(marker)
segment = text[start:]
old = """    if (node.update) {
      evaluateExpressionValue(node.update, context);
    }
"""
new = """    if (bodyResult.type === 'continue') {
      continue;
    }

    if (node.update) {
      evaluateExpressionValue(node.update, context);
    }
"""
if old not in segment:
    raise SystemExit('update clause not found inside for function')
segment = segment.replace(old, new, 1)
path.write_text(text[:start] + segment)
PY
```

RED command:
```sh
node test/run-node.js test/evaluator-statements.test.js
```

RED output:
```text
{"name":"evaluate() dispatches statement nodes to a completion record and expression nodes to a value","status":"passed"}
{"name":"expression statements evaluate to their expression value","status":"passed"}
{"name":"empty statements produce an empty (undefined) completion value","status":"passed"}
{"name":"block statements evaluate their nested statement list","status":"passed"}
{"name":"block statement completion values thread through empty completions","status":"passed"}
{"name":"var declarations create global bindings initialized to undefined","status":"passed"}
{"name":"var declarations with initializers assign the initializer value","status":"passed"}
{"name":"var declarations support multiple comma-separated declarators","status":"passed"}
{"name":"var declarations are hoisted before the statement that declares them runs","status":"passed"}
{"name":"var declarations inside blocks, if, and loop bodies hoist to the global scope","status":"passed"}
{"name":"if executes the consequent when the (coerced) test is truthy","status":"passed"}
{"name":"if executes the alternate when the test is falsy","status":"passed"}
{"name":"if without an else and a falsy test has an empty completion value","status":"passed"}
{"name":"while loops run their body while the test is truthy and thread the last value","status":"passed"}
{"name":"while loops that never run their body have an empty completion value","status":"passed"}
{"name":"do-while loops execute their body at least once even if the test starts false","status":"passed"}
{"name":"for loops run init once, test before each iteration, and update after each iteration","status":"passed"}
{"name":"for loops with an omitted test run until an explicit break","status":"passed"}
{"name":"break exits a while loop with a normal completion","status":"passed"}
{"name":"break exits a do-while loop with the last meaningful completion value","status":"passed"}
{"name":"break inside a for loop stops before the update clause runs again","status":"passed"}
{"name":"continue in a while loop skips the remainder of the current iteration only","status":"passed"}
{"name":"continue in a do-while loop skips the rest of the body and rechecks the test","status":"passed"}
{"name":"continue in a for loop still runs the update clause before the next test","status":"failed","error":{"name":"Error","message":"Expected \"0234\" to be the same value as \"034\""}}
{"name":"break in a nested loop only exits the innermost loop","status":"passed"}
{"name":"evaluateScript rejects FunctionDeclaration explicitly (Task 6)","status":"passed"}
{"name":"evaluateScript rejects for-in, switch, try, throw, with, and labeled statements explicitly","status":"passed"}
```

GREEN command:
```sh
git checkout -- src/evaluator/statements.js && node test/run-node.js test/evaluator-statements.test.js
```

GREEN output:
```text
{"name":"evaluate() dispatches statement nodes to a completion record and expression nodes to a value","status":"passed"}
{"name":"expression statements evaluate to their expression value","status":"passed"}
{"name":"empty statements produce an empty (undefined) completion value","status":"passed"}
{"name":"block statements evaluate their nested statement list","status":"passed"}
{"name":"block statement completion values thread through empty completions","status":"passed"}
{"name":"var declarations create global bindings initialized to undefined","status":"passed"}
{"name":"var declarations with initializers assign the initializer value","status":"passed"}
{"name":"var declarations support multiple comma-separated declarators","status":"passed"}
{"name":"var declarations are hoisted before the statement that declares them runs","status":"passed"}
{"name":"var declarations inside blocks, if, and loop bodies hoist to the global scope","status":"passed"}
{"name":"if executes the consequent when the (coerced) test is truthy","status":"passed"}
{"name":"if executes the alternate when the test is falsy","status":"passed"}
{"name":"if without an else and a falsy test has an empty completion value","status":"passed"}
{"name":"while loops run their body while the test is truthy and thread the last value","status":"passed"}
{"name":"while loops that never run their body have an empty completion value","status":"passed"}
{"name":"do-while loops execute their body at least once even if the test starts false","status":"passed"}
{"name":"for loops run init once, test before each iteration, and update after each iteration","status":"passed"}
{"name":"for loops with an omitted test run until an explicit break","status":"passed"}
{"name":"break exits a while loop with a normal completion","status":"passed"}
{"name":"break exits a do-while loop with the last meaningful completion value","status":"passed"}
{"name":"break inside a for loop stops before the update clause runs again","status":"passed"}
{"name":"continue in a while loop skips the remainder of the current iteration only","status":"passed"}
{"name":"continue in a do-while loop skips the rest of the body and rechecks the test","status":"passed"}
{"name":"continue in a for loop still runs the update clause before the next test","status":"passed"}
{"name":"break in a nested loop only exits the innermost loop","status":"passed"}
{"name":"evaluateScript rejects FunctionDeclaration explicitly (Task 6)","status":"passed"}
{"name":"evaluateScript rejects for-in, switch, try, throw, with, and labeled statements explicitly","status":"passed"}
```

## Round 1 CHECK

Covering statements command:
```sh
node test/run-node.js test/evaluator-statements.test.js
```

Covering statements output:
```text
{"name":"evaluate() dispatches statement nodes to a completion record and expression nodes to a value","status":"passed"}
{"name":"expression statements evaluate to their expression value","status":"passed"}
{"name":"empty statements produce an empty (undefined) completion value","status":"passed"}
{"name":"block statements evaluate their nested statement list","status":"passed"}
{"name":"block statement completion values thread through empty completions","status":"passed"}
{"name":"var declarations create global bindings initialized to undefined","status":"passed"}
{"name":"var declarations with initializers assign the initializer value","status":"passed"}
{"name":"var declarations support multiple comma-separated declarators","status":"passed"}
{"name":"var declarations are hoisted before the statement that declares them runs","status":"passed"}
{"name":"var declarations inside blocks, if, and loop bodies hoist to the global scope","status":"passed"}
{"name":"if executes the consequent when the (coerced) test is truthy","status":"passed"}
{"name":"if executes the alternate when the test is falsy","status":"passed"}
{"name":"if without an else and a falsy test has an empty completion value","status":"passed"}
{"name":"while loops run their body while the test is truthy and thread the last value","status":"passed"}
{"name":"while loops that never run their body have an empty completion value","status":"passed"}
{"name":"do-while loops execute their body at least once even if the test starts false","status":"passed"}
{"name":"for loops run init once, test before each iteration, and update after each iteration","status":"passed"}
{"name":"for loops with an omitted test run until an explicit break","status":"passed"}
{"name":"break exits a while loop with a normal completion","status":"passed"}
{"name":"break exits a do-while loop with the last meaningful completion value","status":"passed"}
{"name":"break inside a for loop stops before the update clause runs again","status":"passed"}
{"name":"continue in a while loop skips the remainder of the current iteration only","status":"passed"}
{"name":"continue in a do-while loop skips the rest of the body and rechecks the test","status":"passed"}
{"name":"continue in a for loop still runs the update clause before the next test","status":"passed"}
{"name":"break in a nested loop only exits the innermost loop","status":"passed"}
{"name":"evaluateScript rejects FunctionDeclaration explicitly (Task 6)","status":"passed"}
{"name":"evaluateScript rejects for-in, switch, try, throw, with, and labeled statements explicitly","status":"passed"}
```

All tests command:
```sh
for f in test/*.test.js; do echo "== $f =="; node test/run-node.js "$f"; done
```

All tests output:
```text
== test/abstract-operations.test.js ==
{"name":"toPrimitive honors preferred types and rejects non-primitive results","status":"passed"}
{"name":"conversion operations cover NaN signed zero and nullish coercion","status":"passed"}
{"name":"toPrimitive rejects host wrappers arrays and plain objects","status":"passed"}
{"name":"equality operations follow strict and abstract comparison rules","status":"passed"}
{"name":"arithmetic operators use primitive coercion rules","status":"passed"}
{"name":"abstract relational comparison preserves left-first coercion order","status":"passed"}
{"name":"abstract relational comparison preserves right-first coercion order","status":"passed"}
{"name":"abstract relational comparison handles NaN and string comparison","status":"passed"}
== test/environments.test.js ==
{"name":"declarative environment records enforce mutable binding rules","status":"passed"}
{"name":"declarative environment records enforce immutable binding rules","status":"passed"}
{"name":"declarative bindings support deletable mutable bindings","status":"passed"}
{"name":"environment chaining resolves bindings through outer environments","status":"passed"}
{"name":"unresolved identifiers produce unresolvable references","status":"passed"}
{"name":"object environment records delegate bindings to an engine object","status":"passed"}
{"name":"object environment records see inherited properties","status":"passed"}
{"name":"object environment records reject non EngineObject bases","status":"passed"}
{"name":"newObjectEnvironment wires an outer environment","status":"passed"}
{"name":"global environment records combine declarative and object semantics","status":"passed"}
{"name":"global environment records reference the shared global object","status":"passed"}
{"name":"createGlobalVarBinding creates an own non-configurable property for a name inherited from the global prototype","status":"passed"}
{"name":"createGlobalVarBinding is a no-op on a non-extensible global object without the own property","status":"passed"}
== test/evaluator-expressions.test.js ==
{"name":"numeric, string, boolean, and null literals evaluate to themselves","status":"passed"}
{"name":"identifiers read the value bound to a declared variable","status":"passed"}
{"name":"reading an undeclared identifier throws a ReferenceError","status":"passed"}
{"name":"assignment expressions assign and evaluate to the assigned value","status":"passed"}
{"name":"assignment right-hand sides can reference the left-hand variable","status":"passed"}
{"name":"typeof reports guest primitive types and undefined for unresolved identifiers","status":"passed"}
{"name":"void always evaluates to undefined and still evaluates its operand","status":"passed"}
{"name":"unary !, -, and + apply boolean negation and numeric coercion","status":"passed"}
{"name":"binary arithmetic operators follow abstract numeric/string coercion","status":"passed"}
{"name":"binary equality operators distinguish strict and abstract comparison","status":"passed"}
{"name":"binary relational operators compare numbers and strings","status":"passed"}
{"name":"logical && and || short-circuit without evaluating the right operand","status":"passed"}
{"name":"the conditional operator evaluates only the taken branch","status":"passed"}
{"name":"unsupported unary operators (bitwise not, delete) throw explicitly","status":"passed"}
{"name":"unsupported binary operators (bitwise, instanceof, in) throw explicitly","status":"passed"}
{"name":"compound assignment operators throw an explicit unsupported-operator error","status":"passed"}
{"name":"update expressions (++/--) are not supported yet and throw explicitly","status":"passed"}
{"name":"assigning to a member expression throws an explicit unsupported-node error","status":"passed"}
{"name":"regex literals are not supported yet and throw explicitly","status":"passed"}
{"name":"object literals, array literals, calls, new, and function expressions are unsupported (Task 6)","status":"passed"}
== test/evaluator-statements.test.js ==
{"name":"evaluate() dispatches statement nodes to a completion record and expression nodes to a value","status":"passed"}
{"name":"expression statements evaluate to their expression value","status":"passed"}
{"name":"empty statements produce an empty (undefined) completion value","status":"passed"}
{"name":"block statements evaluate their nested statement list","status":"passed"}
{"name":"block statement completion values thread through empty completions","status":"passed"}
{"name":"var declarations create global bindings initialized to undefined","status":"passed"}
{"name":"var declarations with initializers assign the initializer value","status":"passed"}
{"name":"var declarations support multiple comma-separated declarators","status":"passed"}
{"name":"var declarations are hoisted before the statement that declares them runs","status":"passed"}
{"name":"var declarations inside blocks, if, and loop bodies hoist to the global scope","status":"passed"}
{"name":"if executes the consequent when the (coerced) test is truthy","status":"passed"}
{"name":"if executes the alternate when the test is falsy","status":"passed"}
{"name":"if without an else and a falsy test has an empty completion value","status":"passed"}
{"name":"while loops run their body while the test is truthy and thread the last value","status":"passed"}
{"name":"while loops that never run their body have an empty completion value","status":"passed"}
{"name":"do-while loops execute their body at least once even if the test starts false","status":"passed"}
{"name":"for loops run init once, test before each iteration, and update after each iteration","status":"passed"}
{"name":"for loops with an omitted test run until an explicit break","status":"passed"}
{"name":"break exits a while loop with a normal completion","status":"passed"}
{"name":"break exits a do-while loop with the last meaningful completion value","status":"passed"}
{"name":"break inside a for loop stops before the update clause runs again","status":"passed"}
{"name":"continue in a while loop skips the remainder of the current iteration only","status":"passed"}
{"name":"continue in a do-while loop skips the rest of the body and rechecks the test","status":"passed"}
{"name":"continue in a for loop still runs the update clause before the next test","status":"passed"}
{"name":"break in a nested loop only exits the innermost loop","status":"passed"}
{"name":"evaluateScript rejects FunctionDeclaration explicitly (Task 6)","status":"passed"}
{"name":"evaluateScript rejects for-in, switch, try, throw, with, and labeled statements explicitly","status":"passed"}
== test/foundation.test.js ==
{"name":"assertSame uses same-value semantics","status":"passed"}
{"name":"foundation harness reports deterministic json","status":"passed"}
== test/objects.test.js ==
{"name":"descriptor helpers classify descriptors and reject mixed accessors","status":"passed"}
{"name":"engine objects provide the property-reference protocol","status":"passed"}
{"name":"engine objects preserve insertion order and walk their prototype chain","status":"passed"}
{"name":"non-configurable data properties reject incompatible changes","status":"passed"}
{"name":"non-configurable properties reject enumerable changes","status":"passed"}
{"name":"put respects inherited writability and inherited setters","status":"passed"}
{"name":"put invokes own accessors and rejects getter-only assignments","status":"passed"}
== test/parser.test.js ==
{"name":"parseScript returns a script program","status":"passed"}
{"name":"parseScript normalizes syntax errors","status":"passed"}
{"name":"parseScript validates parser output","status":"passed"}
{"name":"parseScript rethrows non-syntax parser failures unchanged","status":"passed"}
{"name":"parseScript preserves object-style syntax failure messages","status":"passed"}
== test/realms.test.js ==
{"name":"createRealm produces an isolated global object backed by fresh intrinsics","status":"passed"}
{"name":"each realm receives a fresh intrinsic graph","status":"passed"}
{"name":"the realm global object is isolated from host globals","status":"passed"}
{"name":"the realm global environment satisfies the environment record protocol","status":"passed"}
{"name":"evaluateScript evaluates an empty script to a normal completion","status":"passed"}
{"name":"evaluateScript rejects unsupported statement nodes explicitly","status":"passed"}
{"name":"evaluateScript rejects unsupported expression statements explicitly","status":"passed"}
{"name":"evaluateScript still surfaces genuine syntax errors","status":"passed"}
== test/runtime-records.test.js ==
{"name":"completion factories create explicit records","status":"passed"}
{"name":"references resolve and assign through the property-base protocol","status":"passed"}
{"name":"references resolve and assign through environment records","status":"passed"}
{"name":"references reject bare host objects as bases","status":"passed"}
{"name":"unresolvable references throw reference errors","status":"passed"}
```

Typecheck command:
```sh
npm run typecheck
```

Typecheck output:
```text

> typecheck
> tsc -p jsconfig.json

```

Lint command:
```sh
npm run lint
```

Lint output:
```text

> lint
> ESLINT_USE_FLAT_CONFIG=true eslint . && prettier --check package.json jsconfig.json eslint.config.js .prettierrc.json test/*.js test/harness/*.js types/*.d.ts

Checking formatting...
All matched files use Prettier code style!
```

## Round 1 follow-up correction — strengthened loop interaction tests

The first follow-up draft still overclaimed two behaviors. The final tests now make the loop condition / update ordering observable:
- `do-while` `continue` tracks test evaluation count with a side-effecting condition
- `for` `continue` records `test`/`update` ordering in a single observable `order` string

### Corrected mutation proof 1 — do-while `break` keeps the loop's last meaningful value

Mutation command:
```sh
python3 - <<'PY'
from pathlib import Path
path = Path('src/evaluator/statements.js')
text = path.read_text()
marker = 'function evaluateDoWhileStatement(node, context) {'
next_marker = 'function evaluateForStatement(node, context) {'
start = text.index(marker)
end = text.index(next_marker, start)
segment = text[start:end]
old = '      return createNormalCompletion(value);\n'
new = '      return createNormalCompletion(EMPTY);\n'
if old not in segment:
    raise SystemExit('return line not found inside do-while function')
segment = segment.replace(old, new, 1)
path.write_text(text[:start] + segment + text[end:])
PY
```

RED command:
```sh
node test/run-node.js test/evaluator-statements.test.js
```

RED output:
```text
{"name":"evaluate() dispatches statement nodes to a completion record and expression nodes to a value","status":"passed"}
{"name":"expression statements evaluate to their expression value","status":"passed"}
{"name":"empty statements produce an empty (undefined) completion value","status":"passed"}
{"name":"block statements evaluate their nested statement list","status":"passed"}
{"name":"block statement completion values thread through empty completions","status":"passed"}
{"name":"var declarations create global bindings initialized to undefined","status":"passed"}
{"name":"var declarations with initializers assign the initializer value","status":"passed"}
{"name":"var declarations support multiple comma-separated declarators","status":"passed"}
{"name":"var declarations are hoisted before the statement that declares them runs","status":"passed"}
{"name":"var declarations inside blocks, if, and loop bodies hoist to the global scope","status":"passed"}
{"name":"if executes the consequent when the (coerced) test is truthy","status":"passed"}
{"name":"if executes the alternate when the test is falsy","status":"passed"}
{"name":"if without an else and a falsy test has an empty completion value","status":"passed"}
{"name":"while loops run their body while the test is truthy and thread the last value","status":"passed"}
{"name":"while loops that never run their body have an empty completion value","status":"passed"}
{"name":"do-while loops execute their body at least once even if the test starts false","status":"passed"}
{"name":"for loops run init once, test before each iteration, and update after each iteration","status":"passed"}
{"name":"for loops with an omitted test run until an explicit break","status":"passed"}
{"name":"break exits a while loop with a normal completion","status":"passed"}
{"name":"break exits a do-while loop with the last meaningful completion value","status":"failed","error":{"name":"Error","message":"Expected undefined to be the same value as 3"}}
{"name":"break inside a for loop stops before the update clause runs again","status":"passed"}
{"name":"continue in a while loop skips the remainder of the current iteration only","status":"passed"}
{"name":"continue in a do-while loop still evaluates the test after a continued iteration","status":"passed"}
{"name":"continue in a for loop still runs the update clause before the next test","status":"passed"}
{"name":"break in a nested loop only exits the innermost loop","status":"passed"}
{"name":"evaluateScript rejects FunctionDeclaration explicitly (Task 6)","status":"passed"}
{"name":"evaluateScript rejects for-in, switch, try, throw, with, and labeled statements explicitly","status":"passed"}
```

GREEN command:
```sh
git checkout -- src/evaluator/statements.js && node test/run-node.js test/evaluator-statements.test.js
```

GREEN output:
```text
{"name":"evaluate() dispatches statement nodes to a completion record and expression nodes to a value","status":"passed"}
{"name":"expression statements evaluate to their expression value","status":"passed"}
{"name":"empty statements produce an empty (undefined) completion value","status":"passed"}
{"name":"block statements evaluate their nested statement list","status":"passed"}
{"name":"block statement completion values thread through empty completions","status":"passed"}
{"name":"var declarations create global bindings initialized to undefined","status":"passed"}
{"name":"var declarations with initializers assign the initializer value","status":"passed"}
{"name":"var declarations support multiple comma-separated declarators","status":"passed"}
{"name":"var declarations are hoisted before the statement that declares them runs","status":"passed"}
{"name":"var declarations inside blocks, if, and loop bodies hoist to the global scope","status":"passed"}
{"name":"if executes the consequent when the (coerced) test is truthy","status":"passed"}
{"name":"if executes the alternate when the test is falsy","status":"passed"}
{"name":"if without an else and a falsy test has an empty completion value","status":"passed"}
{"name":"while loops run their body while the test is truthy and thread the last value","status":"passed"}
{"name":"while loops that never run their body have an empty completion value","status":"passed"}
{"name":"do-while loops execute their body at least once even if the test starts false","status":"passed"}
{"name":"for loops run init once, test before each iteration, and update after each iteration","status":"passed"}
{"name":"for loops with an omitted test run until an explicit break","status":"passed"}
{"name":"break exits a while loop with a normal completion","status":"passed"}
{"name":"break exits a do-while loop with the last meaningful completion value","status":"passed"}
{"name":"break inside a for loop stops before the update clause runs again","status":"passed"}
{"name":"continue in a while loop skips the remainder of the current iteration only","status":"passed"}
{"name":"continue in a do-while loop still evaluates the test after a continued iteration","status":"passed"}
{"name":"continue in a for loop still runs the update clause before the next test","status":"passed"}
{"name":"break in a nested loop only exits the innermost loop","status":"passed"}
{"name":"evaluateScript rejects FunctionDeclaration explicitly (Task 6)","status":"passed"}
{"name":"evaluateScript rejects for-in, switch, try, throw, with, and labeled statements explicitly","status":"passed"}
```

### Corrected mutation proof 2 — do-while `continue` still evaluates the loop test

Mutation command:
```sh
python3 - <<'PY'
from pathlib import Path
path = Path('src/evaluator/statements.js')
text = path.read_text()
marker = 'function evaluateDoWhileStatement(node, context) {'
next_marker = 'function evaluateForStatement(node, context) {'
start = text.index(marker)
end = text.index(next_marker, start)
segment = text[start:end]
old = """    if (action === 'propagate') {
      return { ...bodyResult, value };
    }
"""
new = """    if (bodyResult.type === 'continue') {
      return createNormalCompletion(value);
    }

    if (action === 'propagate') {
      return { ...bodyResult, value };
    }
"""
if old not in segment:
    raise SystemExit('propagate branch not found inside do-while function')
segment = segment.replace(old, new, 1)
path.write_text(text[:start] + segment + text[end:])
PY
```

RED command:
```sh
node test/run-node.js test/evaluator-statements.test.js
```

RED output:
```text
{"name":"evaluate() dispatches statement nodes to a completion record and expression nodes to a value","status":"passed"}
{"name":"expression statements evaluate to their expression value","status":"passed"}
{"name":"empty statements produce an empty (undefined) completion value","status":"passed"}
{"name":"block statements evaluate their nested statement list","status":"passed"}
{"name":"block statement completion values thread through empty completions","status":"passed"}
{"name":"var declarations create global bindings initialized to undefined","status":"passed"}
{"name":"var declarations with initializers assign the initializer value","status":"passed"}
{"name":"var declarations support multiple comma-separated declarators","status":"passed"}
{"name":"var declarations are hoisted before the statement that declares them runs","status":"passed"}
{"name":"var declarations inside blocks, if, and loop bodies hoist to the global scope","status":"passed"}
{"name":"if executes the consequent when the (coerced) test is truthy","status":"passed"}
{"name":"if executes the alternate when the test is falsy","status":"passed"}
{"name":"if without an else and a falsy test has an empty completion value","status":"passed"}
{"name":"while loops run their body while the test is truthy and thread the last value","status":"passed"}
{"name":"while loops that never run their body have an empty completion value","status":"passed"}
{"name":"do-while loops execute their body at least once even if the test starts false","status":"passed"}
{"name":"for loops run init once, test before each iteration, and update after each iteration","status":"passed"}
{"name":"for loops with an omitted test run until an explicit break","status":"passed"}
{"name":"break exits a while loop with a normal completion","status":"passed"}
{"name":"break exits a do-while loop with the last meaningful completion value","status":"passed"}
{"name":"break inside a for loop stops before the update clause runs again","status":"passed"}
{"name":"continue in a while loop skips the remainder of the current iteration only","status":"passed"}
{"name":"continue in a do-while loop still evaluates the test after a continued iteration","status":"failed","error":{"name":"Error","message":"Expected 2 to be the same value as 9"}}
{"name":"continue in a for loop still runs the update clause before the next test","status":"passed"}
{"name":"break in a nested loop only exits the innermost loop","status":"passed"}
{"name":"evaluateScript rejects FunctionDeclaration explicitly (Task 6)","status":"passed"}
{"name":"evaluateScript rejects for-in, switch, try, throw, with, and labeled statements explicitly","status":"passed"}
```

GREEN command:
```sh
git checkout -- src/evaluator/statements.js && node test/run-node.js test/evaluator-statements.test.js
```

GREEN output:
```text
{"name":"evaluate() dispatches statement nodes to a completion record and expression nodes to a value","status":"passed"}
{"name":"expression statements evaluate to their expression value","status":"passed"}
{"name":"empty statements produce an empty (undefined) completion value","status":"passed"}
{"name":"block statements evaluate their nested statement list","status":"passed"}
{"name":"block statement completion values thread through empty completions","status":"passed"}
{"name":"var declarations create global bindings initialized to undefined","status":"passed"}
{"name":"var declarations with initializers assign the initializer value","status":"passed"}
{"name":"var declarations support multiple comma-separated declarators","status":"passed"}
{"name":"var declarations are hoisted before the statement that declares them runs","status":"passed"}
{"name":"var declarations inside blocks, if, and loop bodies hoist to the global scope","status":"passed"}
{"name":"if executes the consequent when the (coerced) test is truthy","status":"passed"}
{"name":"if executes the alternate when the test is falsy","status":"passed"}
{"name":"if without an else and a falsy test has an empty completion value","status":"passed"}
{"name":"while loops run their body while the test is truthy and thread the last value","status":"passed"}
{"name":"while loops that never run their body have an empty completion value","status":"passed"}
{"name":"do-while loops execute their body at least once even if the test starts false","status":"passed"}
{"name":"for loops run init once, test before each iteration, and update after each iteration","status":"passed"}
{"name":"for loops with an omitted test run until an explicit break","status":"passed"}
{"name":"break exits a while loop with a normal completion","status":"passed"}
{"name":"break exits a do-while loop with the last meaningful completion value","status":"passed"}
{"name":"break inside a for loop stops before the update clause runs again","status":"passed"}
{"name":"continue in a while loop skips the remainder of the current iteration only","status":"passed"}
{"name":"continue in a do-while loop still evaluates the test after a continued iteration","status":"passed"}
{"name":"continue in a for loop still runs the update clause before the next test","status":"passed"}
{"name":"break in a nested loop only exits the innermost loop","status":"passed"}
{"name":"evaluateScript rejects FunctionDeclaration explicitly (Task 6)","status":"passed"}
{"name":"evaluateScript rejects for-in, switch, try, throw, with, and labeled statements explicitly","status":"passed"}
```

### Corrected mutation proof 3 — `for` `continue` still runs update before the next test

Mutation command:
```sh
python3 - <<'PY'
from pathlib import Path
path = Path('src/evaluator/statements.js')
text = path.read_text()
marker = 'function evaluateForStatement(node, context) {'
start = text.index(marker)
segment = text[start:]
old = """    if (node.update) {
      evaluateExpressionValue(node.update, context);
    }
"""
new = """    if (bodyResult.type === 'continue') {
      continue;
    }

    if (node.update) {
      evaluateExpressionValue(node.update, context);
    }
"""
if old not in segment:
    raise SystemExit('update clause not found inside for function')
segment = segment.replace(old, new, 1)
path.write_text(text[:start] + segment)
PY
```

RED command:
```sh
node test/run-node.js test/evaluator-statements.test.js
```

RED output:
```text
{"name":"evaluate() dispatches statement nodes to a completion record and expression nodes to a value","status":"passed"}
{"name":"expression statements evaluate to their expression value","status":"passed"}
{"name":"empty statements produce an empty (undefined) completion value","status":"passed"}
{"name":"block statements evaluate their nested statement list","status":"passed"}
{"name":"block statement completion values thread through empty completions","status":"passed"}
{"name":"var declarations create global bindings initialized to undefined","status":"passed"}
{"name":"var declarations with initializers assign the initializer value","status":"passed"}
{"name":"var declarations support multiple comma-separated declarators","status":"passed"}
{"name":"var declarations are hoisted before the statement that declares them runs","status":"passed"}
{"name":"var declarations inside blocks, if, and loop bodies hoist to the global scope","status":"passed"}
{"name":"if executes the consequent when the (coerced) test is truthy","status":"passed"}
{"name":"if executes the alternate when the test is falsy","status":"passed"}
{"name":"if without an else and a falsy test has an empty completion value","status":"passed"}
{"name":"while loops run their body while the test is truthy and thread the last value","status":"passed"}
{"name":"while loops that never run their body have an empty completion value","status":"passed"}
{"name":"do-while loops execute their body at least once even if the test starts false","status":"passed"}
{"name":"for loops run init once, test before each iteration, and update after each iteration","status":"passed"}
{"name":"for loops with an omitted test run until an explicit break","status":"passed"}
{"name":"break exits a while loop with a normal completion","status":"passed"}
{"name":"break exits a do-while loop with the last meaningful completion value","status":"passed"}
{"name":"break inside a for loop stops before the update clause runs again","status":"passed"}
{"name":"continue in a while loop skips the remainder of the current iteration only","status":"passed"}
{"name":"continue in a do-while loop still evaluates the test after a continued iteration","status":"passed"}
{"name":"continue in a for loop still runs the update clause before the next test","status":"failed","error":{"name":"Error","message":"Expected \"T0UTCT2UT3UT4UT\" to be the same value as \"T0UTCUT3UT4UT\""}}
{"name":"break in a nested loop only exits the innermost loop","status":"passed"}
{"name":"evaluateScript rejects FunctionDeclaration explicitly (Task 6)","status":"passed"}
{"name":"evaluateScript rejects for-in, switch, try, throw, with, and labeled statements explicitly","status":"passed"}
```

GREEN command:
```sh
git checkout -- src/evaluator/statements.js && node test/run-node.js test/evaluator-statements.test.js
```

GREEN output:
```text
{"name":"evaluate() dispatches statement nodes to a completion record and expression nodes to a value","status":"passed"}
{"name":"expression statements evaluate to their expression value","status":"passed"}
{"name":"empty statements produce an empty (undefined) completion value","status":"passed"}
{"name":"block statements evaluate their nested statement list","status":"passed"}
{"name":"block statement completion values thread through empty completions","status":"passed"}
{"name":"var declarations create global bindings initialized to undefined","status":"passed"}
{"name":"var declarations with initializers assign the initializer value","status":"passed"}
{"name":"var declarations support multiple comma-separated declarators","status":"passed"}
{"name":"var declarations are hoisted before the statement that declares them runs","status":"passed"}
{"name":"var declarations inside blocks, if, and loop bodies hoist to the global scope","status":"passed"}
{"name":"if executes the consequent when the (coerced) test is truthy","status":"passed"}
{"name":"if executes the alternate when the test is falsy","status":"passed"}
{"name":"if without an else and a falsy test has an empty completion value","status":"passed"}
{"name":"while loops run their body while the test is truthy and thread the last value","status":"passed"}
{"name":"while loops that never run their body have an empty completion value","status":"passed"}
{"name":"do-while loops execute their body at least once even if the test starts false","status":"passed"}
{"name":"for loops run init once, test before each iteration, and update after each iteration","status":"passed"}
{"name":"for loops with an omitted test run until an explicit break","status":"passed"}
{"name":"break exits a while loop with a normal completion","status":"passed"}
{"name":"break exits a do-while loop with the last meaningful completion value","status":"passed"}
{"name":"break inside a for loop stops before the update clause runs again","status":"passed"}
{"name":"continue in a while loop skips the remainder of the current iteration only","status":"passed"}
{"name":"continue in a do-while loop still evaluates the test after a continued iteration","status":"passed"}
{"name":"continue in a for loop still runs the update clause before the next test","status":"passed"}
{"name":"break in a nested loop only exits the innermost loop","status":"passed"}
{"name":"evaluateScript rejects FunctionDeclaration explicitly (Task 6)","status":"passed"}
{"name":"evaluateScript rejects for-in, switch, try, throw, with, and labeled statements explicitly","status":"passed"}
```

## Round 1 corrected CHECK

Covering statements command:
```sh
node test/run-node.js test/evaluator-statements.test.js
```

Covering statements output:
```text
{"name":"evaluate() dispatches statement nodes to a completion record and expression nodes to a value","status":"passed"}
{"name":"expression statements evaluate to their expression value","status":"passed"}
{"name":"empty statements produce an empty (undefined) completion value","status":"passed"}
{"name":"block statements evaluate their nested statement list","status":"passed"}
{"name":"block statement completion values thread through empty completions","status":"passed"}
{"name":"var declarations create global bindings initialized to undefined","status":"passed"}
{"name":"var declarations with initializers assign the initializer value","status":"passed"}
{"name":"var declarations support multiple comma-separated declarators","status":"passed"}
{"name":"var declarations are hoisted before the statement that declares them runs","status":"passed"}
{"name":"var declarations inside blocks, if, and loop bodies hoist to the global scope","status":"passed"}
{"name":"if executes the consequent when the (coerced) test is truthy","status":"passed"}
{"name":"if executes the alternate when the test is falsy","status":"passed"}
{"name":"if without an else and a falsy test has an empty completion value","status":"passed"}
{"name":"while loops run their body while the test is truthy and thread the last value","status":"passed"}
{"name":"while loops that never run their body have an empty completion value","status":"passed"}
{"name":"do-while loops execute their body at least once even if the test starts false","status":"passed"}
{"name":"for loops run init once, test before each iteration, and update after each iteration","status":"passed"}
{"name":"for loops with an omitted test run until an explicit break","status":"passed"}
{"name":"break exits a while loop with a normal completion","status":"passed"}
{"name":"break exits a do-while loop with the last meaningful completion value","status":"passed"}
{"name":"break inside a for loop stops before the update clause runs again","status":"passed"}
{"name":"continue in a while loop skips the remainder of the current iteration only","status":"passed"}
{"name":"continue in a do-while loop still evaluates the test after a continued iteration","status":"passed"}
{"name":"continue in a for loop still runs the update clause before the next test","status":"passed"}
{"name":"break in a nested loop only exits the innermost loop","status":"passed"}
{"name":"evaluateScript rejects FunctionDeclaration explicitly (Task 6)","status":"passed"}
{"name":"evaluateScript rejects for-in, switch, try, throw, with, and labeled statements explicitly","status":"passed"}
```

All tests command:
```sh
for f in test/*.test.js; do echo "== $f =="; node test/run-node.js "$f"; done
```

All tests output:
```text
== test/abstract-operations.test.js ==
{"name":"toPrimitive honors preferred types and rejects non-primitive results","status":"passed"}
{"name":"conversion operations cover NaN signed zero and nullish coercion","status":"passed"}
{"name":"toPrimitive rejects host wrappers arrays and plain objects","status":"passed"}
{"name":"equality operations follow strict and abstract comparison rules","status":"passed"}
{"name":"arithmetic operators use primitive coercion rules","status":"passed"}
{"name":"abstract relational comparison preserves left-first coercion order","status":"passed"}
{"name":"abstract relational comparison preserves right-first coercion order","status":"passed"}
{"name":"abstract relational comparison handles NaN and string comparison","status":"passed"}
== test/environments.test.js ==
{"name":"declarative environment records enforce mutable binding rules","status":"passed"}
{"name":"declarative environment records enforce immutable binding rules","status":"passed"}
{"name":"declarative bindings support deletable mutable bindings","status":"passed"}
{"name":"environment chaining resolves bindings through outer environments","status":"passed"}
{"name":"unresolved identifiers produce unresolvable references","status":"passed"}
{"name":"object environment records delegate bindings to an engine object","status":"passed"}
{"name":"object environment records see inherited properties","status":"passed"}
{"name":"object environment records reject non EngineObject bases","status":"passed"}
{"name":"newObjectEnvironment wires an outer environment","status":"passed"}
{"name":"global environment records combine declarative and object semantics","status":"passed"}
{"name":"global environment records reference the shared global object","status":"passed"}
{"name":"createGlobalVarBinding creates an own non-configurable property for a name inherited from the global prototype","status":"passed"}
{"name":"createGlobalVarBinding is a no-op on a non-extensible global object without the own property","status":"passed"}
== test/evaluator-expressions.test.js ==
{"name":"numeric, string, boolean, and null literals evaluate to themselves","status":"passed"}
{"name":"identifiers read the value bound to a declared variable","status":"passed"}
{"name":"reading an undeclared identifier throws a ReferenceError","status":"passed"}
{"name":"assignment expressions assign and evaluate to the assigned value","status":"passed"}
{"name":"assignment right-hand sides can reference the left-hand variable","status":"passed"}
{"name":"typeof reports guest primitive types and undefined for unresolved identifiers","status":"passed"}
{"name":"void always evaluates to undefined and still evaluates its operand","status":"passed"}
{"name":"unary !, -, and + apply boolean negation and numeric coercion","status":"passed"}
{"name":"binary arithmetic operators follow abstract numeric/string coercion","status":"passed"}
{"name":"binary equality operators distinguish strict and abstract comparison","status":"passed"}
{"name":"binary relational operators compare numbers and strings","status":"passed"}
{"name":"logical && and || short-circuit without evaluating the right operand","status":"passed"}
{"name":"the conditional operator evaluates only the taken branch","status":"passed"}
{"name":"unsupported unary operators (bitwise not, delete) throw explicitly","status":"passed"}
{"name":"unsupported binary operators (bitwise, instanceof, in) throw explicitly","status":"passed"}
{"name":"compound assignment operators throw an explicit unsupported-operator error","status":"passed"}
{"name":"update expressions (++/--) are not supported yet and throw explicitly","status":"passed"}
{"name":"assigning to a member expression throws an explicit unsupported-node error","status":"passed"}
{"name":"regex literals are not supported yet and throw explicitly","status":"passed"}
{"name":"object literals, array literals, calls, new, and function expressions are unsupported (Task 6)","status":"passed"}
== test/evaluator-statements.test.js ==
{"name":"evaluate() dispatches statement nodes to a completion record and expression nodes to a value","status":"passed"}
{"name":"expression statements evaluate to their expression value","status":"passed"}
{"name":"empty statements produce an empty (undefined) completion value","status":"passed"}
{"name":"block statements evaluate their nested statement list","status":"passed"}
{"name":"block statement completion values thread through empty completions","status":"passed"}
{"name":"var declarations create global bindings initialized to undefined","status":"passed"}
{"name":"var declarations with initializers assign the initializer value","status":"passed"}
{"name":"var declarations support multiple comma-separated declarators","status":"passed"}
{"name":"var declarations are hoisted before the statement that declares them runs","status":"passed"}
{"name":"var declarations inside blocks, if, and loop bodies hoist to the global scope","status":"passed"}
{"name":"if executes the consequent when the (coerced) test is truthy","status":"passed"}
{"name":"if executes the alternate when the test is falsy","status":"passed"}
{"name":"if without an else and a falsy test has an empty completion value","status":"passed"}
{"name":"while loops run their body while the test is truthy and thread the last value","status":"passed"}
{"name":"while loops that never run their body have an empty completion value","status":"passed"}
{"name":"do-while loops execute their body at least once even if the test starts false","status":"passed"}
{"name":"for loops run init once, test before each iteration, and update after each iteration","status":"passed"}
{"name":"for loops with an omitted test run until an explicit break","status":"passed"}
{"name":"break exits a while loop with a normal completion","status":"passed"}
{"name":"break exits a do-while loop with the last meaningful completion value","status":"passed"}
{"name":"break inside a for loop stops before the update clause runs again","status":"passed"}
{"name":"continue in a while loop skips the remainder of the current iteration only","status":"passed"}
{"name":"continue in a do-while loop still evaluates the test after a continued iteration","status":"passed"}
{"name":"continue in a for loop still runs the update clause before the next test","status":"passed"}
{"name":"break in a nested loop only exits the innermost loop","status":"passed"}
{"name":"evaluateScript rejects FunctionDeclaration explicitly (Task 6)","status":"passed"}
{"name":"evaluateScript rejects for-in, switch, try, throw, with, and labeled statements explicitly","status":"passed"}
== test/foundation.test.js ==
{"name":"assertSame uses same-value semantics","status":"passed"}
{"name":"foundation harness reports deterministic json","status":"passed"}
== test/objects.test.js ==
{"name":"descriptor helpers classify descriptors and reject mixed accessors","status":"passed"}
{"name":"engine objects provide the property-reference protocol","status":"passed"}
{"name":"engine objects preserve insertion order and walk their prototype chain","status":"passed"}
{"name":"non-configurable data properties reject incompatible changes","status":"passed"}
{"name":"non-configurable properties reject enumerable changes","status":"passed"}
{"name":"put respects inherited writability and inherited setters","status":"passed"}
{"name":"put invokes own accessors and rejects getter-only assignments","status":"passed"}
== test/parser.test.js ==
{"name":"parseScript returns a script program","status":"passed"}
{"name":"parseScript normalizes syntax errors","status":"passed"}
{"name":"parseScript validates parser output","status":"passed"}
{"name":"parseScript rethrows non-syntax parser failures unchanged","status":"passed"}
{"name":"parseScript preserves object-style syntax failure messages","status":"passed"}
== test/realms.test.js ==
{"name":"createRealm produces an isolated global object backed by fresh intrinsics","status":"passed"}
{"name":"each realm receives a fresh intrinsic graph","status":"passed"}
{"name":"the realm global object is isolated from host globals","status":"passed"}
{"name":"the realm global environment satisfies the environment record protocol","status":"passed"}
{"name":"evaluateScript evaluates an empty script to a normal completion","status":"passed"}
{"name":"evaluateScript rejects unsupported statement nodes explicitly","status":"passed"}
{"name":"evaluateScript rejects unsupported expression statements explicitly","status":"passed"}
{"name":"evaluateScript still surfaces genuine syntax errors","status":"passed"}
== test/runtime-records.test.js ==
{"name":"completion factories create explicit records","status":"passed"}
{"name":"references resolve and assign through the property-base protocol","status":"passed"}
{"name":"references resolve and assign through environment records","status":"passed"}
{"name":"references reject bare host objects as bases","status":"passed"}
{"name":"unresolvable references throw reference errors","status":"passed"}
```

Typecheck command:
```sh
npm run typecheck
```

Typecheck output:
```text

> typecheck
> tsc -p jsconfig.json

```

Lint command:
```sh
npm run lint
```

Lint output:
```text

> lint
> ESLINT_USE_FLAT_CONFIG=true eslint . && prettier --check package.json jsconfig.json eslint.config.js .prettierrc.json test/*.js test/harness/*.js types/*.d.ts

Checking formatting...
All matched files use Prettier code style!
```
