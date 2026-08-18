# Namespace Import Instantiation Report

## Disposition

- Status: **DONE**
- Repository: `yoonbuck/jsjs`
- Issue: `#61`
- Starting HEAD: `0852f1f396f78172d7e5c3cea2432140abf88d3d`
- Scope: the final namespace-import instantiation merge gate only

No reset, rebase, amend, push, pull-request operation, full CI run, broad
upstream Test262 run, or generated release/benchmark artifact update was
performed.

## Root cause and link-order analysis

`moduleDeclarationInstantiation` created namespace import entries before walking
the dependency graph, but `ModuleEnvironmentRecord#getBindingValue` deferred
`targetModule.getNamespace()` until guest evaluation read the binding. A malformed
renamed-star namespace therefore had three inconsistent outcomes:

- directly requesting its namespace rejected at the evaluation boundary;
- an importer that never read its namespace binding fulfilled; and
- an importer that read the binding could catch the namespace `SyntaxError` in
  guest code as if it were an ordinary runtime exception.

Calling `getNamespace()` in the original declaration-instantiation loop would
also be wrong: that loop runs before dependency recursion, while
`ModuleNamespaceObject` requires its target record to be linked. The safe common
boundary is after `linkRecord` returns. At that point Tarjan traversal has marked
every SCC in the acquired graph `linked`, but no module body has evaluated.

## RED

Public portable regressions were added first in
`test/module-namespace.test.js`. They use:

```text
A -> export * from D
D -> export { y as x } from A; export const y = 1
```

The first RED run was:

```text
node test/run-node.js test/module-namespace.test.js
```

It produced 11 passes and the two expected failures:

```text
unused namespace imports instantiate before evaluation ...
Expected promise to reject

used namespace import failures occur before guest code can catch them
Expected promise to reject
```

The valid cached-identity and cyclic-namespace controls passed in that same run.
The final regression also checks sequential and concurrent public failure
identity, the Realm-owned guest `SyntaxError`, link phase, and zero guest body
executions.

A transaction rollback regression was then run without the namespace-cache reset
and failed as intended:

```text
failed namespace instantiation rolls back namespaces materialized earlier ...
Expected function to throw TypeError
```

This proves a namespace created earlier in a failed link transaction cannot
remain reachable from an unlinked record.

## Fix

- Namespace imports now create strict immutable local bindings during module
  declaration instantiation.
- After the complete graph has linked, the linker resolves each namespace once
  with `getNamespace()` and initializes the corresponding immutable binding.
- The environment's lazy namespace-import getter and target-module sentinel path
  were removed. Named imports remain indirect live bindings.
- Link rollback clears namespaces materialized by the failed transaction as well
  as its tentative environments.
- `ModuleLoader` caches a link-phase `ModuleLoaderError` per root record, so
  repeated and concurrent public requests share both the wrapper and its
  Realm-owned guest `SyntaxError`.
- ES2015 local namespace re-exports still resolve through their local immutable
  binding. `MODULE_NAMESPACE_BINDING` remains only for the existing indirect
  namespace-export sentinel path; no `export * as` syntax support was added.

## GREEN and verification

The focused namespace suite passed all 14 cases after the fix.

Final portable module suites covered linker, namespace, loader, evaluation, API,
and async-runtime/module integration:

```text
Node focused modules: 86 passed, 0 failed, 0 skipped
Chromium focused modules: 86 passed, 0 failed, 0 skipped
JSC portable: 1983 passed, 0 failed, 0 skipped
```

JavaScriptCore used:

```text
/System/Volumes/Preboot/Cryptexes/OS/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
```

The JSC runner has no suite-selection interface, so its complete portable
registry was the available stronger check.

Focused module Test262 passed both contracts: all 13 pinned ES2015 module roots
passed with zero failures or skips, and raw metadata expansion passed without
harness rewriting.

The final static/repository checks passed:

```text
npm run typecheck --silent
npm run lint --silent
npm run format --silent
npm run vendor:check --silent
node test/run-node.js test/node/repository-invariants.test.js
git diff --check 0852f1f396f78172d7e5c3cea2432140abf88d3d
```

A focused read-only review reported no Critical or Important finding. Its two
Minor coverage requests—concurrent public error identity and partial namespace
rollback—were added and passed.

## Concerns

No correctness blocker remains. A direct public request for malformed `A` still
constructs its returned namespace at the evaluation boundary and reuses the
existing cached evaluation error. That is intentionally distinct from a
namespace import, whose ES2015 environment initialization now requests the
namespace during linking. No broad upstream or full CI command was run.
