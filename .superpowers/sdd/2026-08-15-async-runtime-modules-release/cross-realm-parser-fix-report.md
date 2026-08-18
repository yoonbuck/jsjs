# Cross-Realm Generator and Parser Fix Report

## Disposition

- Status: **DONE**
- Repository: `yoonbuck/jsjs`
- Issue: `#61`
- Required starting HEAD:
  `bdcbf1803d572f0fdee018b23d1ed20c716b8933`
- Verified code commit:
  `999831e3593af2bad7c988f9f6c4e9ee93a66bca`

No reset, rebase, amend, push, pull-request operation, full CI run, broad
upstream Test262 run, or generated artifact update was performed.

The code commit has the exact trailer:

```text
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

## Baseline and strict RED

The exact requested starting HEAD was clean. Before adding regressions, the
existing stack-overflow, generator-stack, parser, and module-parser suites all
passed.

All new regressions were then written before production changes. The focused
RED run failed for the six expected reasons:

```text
the default limit contains mutual yield delegation across shared-Agent Realms
  RangeError: Maximum call stack size exceeded

the default limit contains mutual yield delegation across Agents
  RangeError: Maximum call stack size exceeded

custom module ASTs accept exact import and export shorthand aliases
  SyntaxError: Custom AST must be a structural tree

custom module ASTs accept only neutral modern import and export-all fields
  UnsupportedNodeError: Unsupported AST node: assertions

parseModule options.parse normalizes engine AST validation failures
  Expected SyntaxError but got UnsupportedNodeError

parseModule options.program normalizes engine Program shape failures
  Expected SyntaxError but got TypeError
```

The controls already passed at RED:

- differing `maxStackDepth` values on two Realms sharing one Agent produced
  catchable Realm-owned `RangeError` values;
- finite delegation worked across both shared and separate Agents;
- 1,000 sequential cross-Realm delegation cycles did not accumulate depth;
- renamed import/export specifiers remained valid;
- a shared conditional-expression node remained a rejected structural DAG; and
- an arbitrary error thrown by `options.parse` propagated by identity.

The initial separate-Agent control incorrectly expected a protocol `TypeError`.
Investigation showed that iterator protocol lookup deliberately uses the
iterated object's Agent. The control was corrected while production was still
untouched, and a separate-Agent mutual `yield*` RED was added instead.

## Finding 1: complete generator host-chain accounting

### Root cause

`GeneratorObject.resume` charged its owner Realm's `StackGuard`. Alternating
delegation across Realms therefore split one synchronous host chain across two
independent counters. Each counter observed only part of the active evaluator
and resume frames, so the host exhausted its stack before either Realm reached
the default budget.

### Fix

- Each Agent now owns a transient generator host-chain record.
- The first active resume creates the record; nested resumes charge the same
  record while retaining each Realm's existing `StackGuard`.
- Every guarded evaluator/activation frame entered during the active resume
  chain charges the complete chain, not merely the generator object count.
- Cross-Agent iterator delegation temporarily links participating Agents to the
  same chain. The links contain no guest values and are cleared when the
  outermost resume unwinds.
- `GeneratorObject.resume` releases the Realm guard and Agent chain through
  nested `finally` blocks on yield, completion, and abrupt exit.
- A failed guard entry leaves the generator suspended and still releases the
  transient Agent chain.
- No host `RangeError` catch or relabeling was added.

The original per-Realm `StackGuard.depth`, configured `maxStackDepth`, evaluator
entry points, and guest-error materialization boundaries remain in place.

### GREEN

Portable tests now prove:

- default-budget A-to-B-to-A `yield*` recursion is caught by guest `try`/`catch`
  for two Realms sharing one Agent;
- the same containment holds across separate Agents;
- the error is a Realm-owned guest `RangeError`, not a host error;
- differently configured Realm budgets remain active;
- finite shared- and cross-Agent delegation remains valid; and
- sequential cross-Realm resumes restore both Realm and Agent accounting.

## Finding 2: module specifier shorthand aliases

### Root cause

Acorn represents `import { x }` with `local === imported` and `export { a }`
with `local === exported`. The custom-AST structural tree pass followed both
fields and treated the second visit to the shared Identifier leaf as an
arbitrary DAG.

### Fix

The structural pass treats only these two exact identity aliases as one
specifier shorthand edge:

- `ImportSpecifier.local === ImportSpecifier.imported`; and
- `ExportSpecifier.local === ExportSpecifier.exported`.

No other shared node or array is admitted. Renamed forms still traverse their
distinct leaves, and an arbitrary shared conditional child still fails with
`Custom AST must be a structural tree`.

Both public custom entry points are covered:

- `parseModule(source, { parse })`; and
- `parseModule(source, { program })`.

## Finding 3: neutral modern ESTree fields

### Root cause

Module validation rejected the mere presence of `assertions`, `attributes`, or
`ExportAllDeclaration.exported`. Modern ESTree parsers may emit neutral
`assertions: []`, `attributes: []`, and `exported: null` for ES2015 syntax, so
valid custom and reusable Programs were rejected even though they requested no
new semantics.

### Fix

- Empty `assertions` and `attributes` arrays are accepted.
- `ExportAllDeclaration.exported` is accepted only when its value is exactly
  `null`.
- Non-arrays and non-empty assertion/attribute lists remain unsupported.
- Non-null export-all aliases (`export * as namespace`) remain unsupported.

The tests cover import and export-all nodes through both `options.parse` and
`options.program`, with non-empty and non-null controls.

## Finding 4: `parseModule` error normalization

### Root cause

`validateModuleItem` ran before the generic custom-AST capability walk and
raised `UnsupportedNodeError` for a `Bogus` module item. Reusable Program shape
checks also raised `TypeError`. Those engine-owned parsing failures escaped the
public module parser even though equivalent capability failures are exposed as
host `SyntaxError`.

### Fix

`parseModule` now has explicit engine-validation boundaries around:

- reusable Program snapshot and shape validation; and
- custom snapshot, merge, module shape/capability, and early validation.

Only deliberate `UnsupportedNodeError` and `TypeError` validation failures are
normalized with `normalizeSyntaxError`. The call to `options.parse` remains
outside those boundaries, so an arbitrary parser implementation error still
propagates unchanged and by identity. Host `RangeError` is not broadly caught.

## Verification

All verification below ran against the committed code.

### Portable affected suites

The targeted list covered parser, module parser/loader/linker/evaluation/
namespace/API, classes, object literals/built-ins, all generator suites,
stack-overflow, `for`-`of`, function Realm behavior, and async/module
integration.

```text
Node targeted:     549 passed, 0 failed
Chromium targeted: 549 passed, 0 failed
JSC portable:     1994 passed, 0 failed
```

JavaScriptCore used:

```text
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
```

The JSC runner has no suite-selection interface, so its complete portable
registry was the available stronger check.

### Focused module Test262

```text
focused ES2015 static-module Test262 roots all pass at the pinned revision
  passed
pinned module raw metadata expands once without harness rewriting
  passed
```

No broad upstream Test262 run was performed.

### Static, invariant, and diff checks

All exited zero:

```text
npm run typecheck --silent
npm run lint --silent
npm run format --silent
npm run vendor:check --silent
node test/run-node.js test/node/repository-invariants.test.js
git diff --check bdcbf1803d572f0fdee018b23d1ed20c716b8933
```

Repository invariants reported 35 passed and 0 failed. An intermediate
module-scope chain pointer correctly failed the no-module-scope-guest-state
invariant; it was replaced with Agent-owned transient state before the final
verification.

## Concerns

No unresolved correctness blocker remains in the requested scope.

- Custom AST parser edges are covered by portable regressions because focused
  Test262 consumes source, not injected ASTs.
- Separate-Agent host-chain sharing is intentionally transient and limited to
  active cross-Agent iterator delegation; no Agent or guest value remains linked
  after the outermost resume.
- No generated release, coverage, benchmark, workflow, or broad Test262
  artifact changed.
