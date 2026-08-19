# Origin-main blocker report

## Disposition

- Status: **DONE**
- Required starting HEAD:
  `7555169983101bd658d7b36f45ba823c4142d8b3`
- Scope: the five final Important origin-main review blockers for
  `yoonbuck/jsjs#61`
- Constraints honored: strict RED-first; no reset, rebase, amend, push, pull
  request, full CI, or broad upstream Test262 run

## Root causes and fixes

### 1. Executing generator preflight

The closed native generator-method preflight checked only that the receiver was
a `GeneratorObject`. An executing receiver therefore reached Agent linking and
stack accounting before `GeneratorObject#resume` could issue the required
`TypeError`; a deep active chain could win with `RangeError`.

The preflight now rejects `state === "executing"` inside the method Realm before
the synchronous union, generator-chain reference, method guard, or resume starts.
The shared-/cross-Agent `next`/`return`/`throw` matrix proves zero added links,
references, resumes, and method-guard entries. Suspended controls retain one
reference/resume/guard, while completed controls retain one reference/guard and
do not restart a continuation.

### 2. Aggregate ordinary cross-Agent stack safety

The transient synchronous Agent union retained only participants and call
counts. Ordinary recursion distributed around four Agents could keep every
per-Realm depth below its limit until the raw host stack failed.

The union now owns a strictest participating host-safety limit, aggregate depth,
and per-`StackGuard` frame tokens. It adopts already-active frames when Agents
join or chains merge, charges every later guarded frame, and detaches adopted
tokens when the last cross-Agent call unwinds. Charging is transactional with
generator-chain charging.

The aggregate floors limits below the calibrated default of 500. Smaller custom
limits therefore remain local per-Realm semantics instead of becoming an
unexpected transitive limit on finite foreign work; raised custom limits still
contribute their strictest value. Four-Agent default and raised-custom
recursions are guest-catchable Realm `RangeError`s. Direct, `call`, `apply`,
accessor, and coercion rings participate, every union pointer/depth clears,
subsequent calls succeed, and the prior finite direct/`call`/`apply`/`bind`
controls remain green without starting generator accounting.

### 3. Custom AST contextual and strict early errors

The custom-AST walk carried strict and generator-expression state but did not
apply the corresponding Identifier grammar to caller-supplied nodes.

The walk now distinguishes:

- YieldExpression permission from Identifier-form `yield` restrictions;
- generator parameters and bodies, ordinary nested functions, arrow parameters,
  function declarations, ordinary function expressions, and generator
  expressions;
- strict/module contexts, lexical `let`/`const` binding patterns, ordinary
  binding/assignment patterns, and IdentifierName-only property/specifier
  positions.

Both `options.parse` and `options.program` now reject forged keyword/literal
Identifiers, strict reserved forms, module `await`, module/strict `yield`,
generator-context `yield`, lexical bound name `let`, strict assignments to
`eval`/`arguments`, and strict deletion of an unqualified identifier. Sloppy
`var`/reference controls and reserved property/import/export IdentifierNames
remain valid.

### 4. Custom AST control flow

Custom trees had shape validation but no function, loop, switch, or label-target
context. The validator now tracks function, break, and continue contexts and
runs a separate iterative DFS for labels. That pass uses a map for active-label
lookup, swaps label scopes at function bodies, and memoizes iteration-target and
labelled-function chain resolution. It rejects top-level `return`, invalid
unlabelled control, missing labels, duplicate active labels, function-boundary
label references, and `continue` labels whose target is not an iteration.

Valid nested switch/loop controls and multi-label iteration targets pass through
both custom module entry points. A 2,000-/4,000-label probe measured 75/145 ms,
confirming linear scaling after the map/cache change.

### 5. ImportDeclaration grammar

Specifier nodes were validated independently, so their list could contain
duplicate defaults/namespaces, reordered defaults, or namespace-plus-named
forms that ES2015 cannot parse.

`validateImportDeclaration` now enforces the exact ES2015 list forms: side-effect
only, default, namespace, named list, default-plus-namespace, and
default-plus-named. Duplicate local bindings remain rejected by module
declaration early errors; repeated imported names with distinct locals remain
valid.

## Strict RED evidence

Before production changes, the focused suites reported the intended failures:

- all six shared-/cross-Agent deep reentrant method cases returned an escaping
  throw/stack failure instead of the caught method-Realm `TypeError`;
- both four-Agent default and custom ordinary recursion cases escaped as raw host
  `RangeError`;
- custom script/module contextual cases were accepted;
- invalid custom return/break/continue/label contexts were accepted; and
- invalid custom import-specifier lists were accepted.

Review follow-up regressions were also observed RED before their fixes:
generator-parameter Identifier `yield`, forged literal/module identifiers,
function-expression/generator-expression name contexts, sloppy lexical bound
name `let`, and linear active-label lookup.

## Final verification

- Expanded parser/module/static/evaluator/control/generator/stack/function/with/
  classes scope:
  - Node: **682 passed**, 0 failed, 0 skipped.
  - Chromium: **682 passed**, 0 failed, 0 skipped.
- Full registries:
  - Node: **2,238 passed**, 0 failed.
  - Chromium portable: **2,095 passed**, 0 failed.
  - JavaScriptCore portable: **2,095 passed**, 0 failed.
- Repository invariants: **35 passed**, 0 failed.
- Focused pinned module Test262: **2 passed**, 0 failed.
- Test262 adapter fixtures: **17 passed**, 0 failed, 1 expected unsupported
  feature skip.
- TypeScript JSDoc check: passed.
- ESLint: passed.
- Prettier check: passed.
- Vendor, generated CI, and Unicode checks: passed.
- `git diff --check`: passed.
- Final read-only scoped review: no significant issues found.

## Concerns

No known correctness blocker remains. Node-only JSC launcher-contract probes
reported their documented availability note because `jsc` is not on `PATH`;
the complete portable registry passed through the macOS system JavaScriptCore
executable directly. Full CI and broad upstream Test262 were intentionally not
run.
