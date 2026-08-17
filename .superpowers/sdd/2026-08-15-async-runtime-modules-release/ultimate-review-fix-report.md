# Ultimate Review Fix Report

## Disposition

- Status: **DONE**
- Repository: `yoonbuck/jsjs`
- Issue: `#61`
- Required starting HEAD:
  `bdb06e2a10456c1283729e975955986dcd5f1a47`
- Final code HEAD: `3979a91e43ba9c6e1fe7ca5831c964180b1417f2`

No reset, rebase, amend, push, pull-request operation, full CI run, broad
upstream Test262 run, or generated release/benchmark artifact update was
performed.

Every fix commit has the exact trailer:

```text
Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
```

## Commits

1. `b7e9afd1fbb79ed6d2d6e794ce1aa2ff15382245` —
   `Fix namespace not-found exports`
2. `a8175f1c2883d0b4bd0db83fe5c42d8bfbb89806` —
   `Skip trusted module descriptor scans`
3. `58677a605825aca3d61d9d8ca8822f5f501b23a5` —
   `Enforce unique method parameters`
4. `003ee698a14a966bb9cdb84eca1b779b86ae8b4a` —
   `Type method regression fixtures`
5. `3979a91e43ba9c6e1fe7ca5831c964180b1417f2` —
   `Cache namespace evaluation failures`

## Baseline reproduction

The three findings reproduced at exact starting HEAD before production edits:

- The renamed-star cycle namespace fulfilled and exposed only `y`; it did not
  reject for candidate export `x`.
- A named import of `x` through that topology correctly failed during linking
  with a Realm-owned guest `SyntaxError`, and the ambiguous-star control
  correctly omitted `shared`.
- One ordinary `parseModule("export const value = 1;")` entered the untrusted
  graph walk and made 30 `Reflect.ownKeys` calls.
- A custom-AST ordinary object concise method with duplicate parameters was
  accepted. Object generator methods and class ordinary/generator methods were
  already rejected; sloppy function declarations and expressions were
  accepted.

## Finding 1: ES2015 module namespace resolution

### Root cause

`resolveNamespaceExports` retained only `resolved` results and silently dropped
both `ambiguous` and `not-found`. ES2015 `GetModuleNamespace` omits only
ambiguous candidates. A name returned by exported-name collection whose
`ResolveExport` result is not found must throw a `SyntaxError`.

The public loader also created the root namespace outside its evaluation error
conversion block. A guest-visible namespace-construction error would therefore
have crossed the boundary incorrectly. The first implementation review further
found that repeated requests created replacement error/value objects rather
than preserving the loader's cached evaluation-failure identity.

### RED

`test/module-namespace.test.js` added the public loader topology:

```text
root -> export * from A
A    -> export * from D
D    -> export { y as x } from A; export const y = 1
```

Before the fix:

```text
namespace creation rejects a not-found exported name ...
Expected promise to reject
```

The paired controls require an ambiguous star export to remain omitted and a
named import through the renamed cycle to remain a link-phase failure whose
guest `SyntaxError` is in `cause`.

After review, repeated-call identity was added RED-first:

```text
Expected ModuleLoaderError: Module evaluate failed to be the same value as
ModuleLoaderError: Module evaluate failed
```

### Fix and GREEN

- `resolveNamespaceExports` now skips only `ambiguous`; `not-found` raises an
  internal `GuestErrorSignal("SyntaxError", ...)`.
- `loadAndEvaluate` creates the namespace inside its evaluation boundary,
  converts that signal into a Realm-owned guest `SyntaxError`, and exposes the
  exact value through `ModuleLoaderError.value` with `phase === "evaluate"`.
- The loader caches and reuses the namespace failure and guest value for
  repeated requests.
- Existing named-import resolution remains unchanged and still fails in
  `phase === "link"` with the Realm-owned guest value in `cause`.

The namespace, loader, and linker suites passed after each GREEN step.

## Finding 2: trusted module parser descriptor scan

### Root cause

`validateModuleProgram` called `checkUntrustedAstDescriptors` unconditionally.
The equivalent script path gates that whole-graph descriptor/prototype defense
to custom ASTs. Fresh Acorn module output therefore paid a redundant reflective
walk while still needing every ordinary capability and early-error check.

### RED

`test/module-parser.test.js` first proves that accessor-backed custom Programs
from both `options.parse` and `options.program` reject without invoking their
getters. It then instruments `Reflect.ownKeys` around an ordinary Acorn module
parse.

Before the fix:

```text
Expected 30 to be the same value as 0: trusted Acorn output must not enter the
untrusted descriptor walk
```

### Fix and GREEN

Only `checkUntrustedAstDescriptors(program)` is gated on `customAst`.
Module-program shape checks, module-item validation, custom capability defenses,
module declaration early errors, and the complete ordinary
statement/capability/early-error walk are unchanged.

The deterministic regression now observes zero untrusted graph-walk
`Reflect.ownKeys` calls for fresh Acorn output. Both custom AST entry points
continue rejecting accessor-backed state with zero getter invocations. No
timing-only correctness claim is used.

## Finding 3: duplicate parameters in custom-AST methods

### Root cause

`checkFunctionParameterEarlyErrors` excluded only generator methods from the
sloppy duplicate-parameter allowance. ES2015 MethodDefinition formal parameters
must have unique bound names regardless of whether the method is a generator.

### RED

`test/parser.test.js` builds valid source ASTs, mutates their second parameter to
duplicate the first, and re-enters through the custom parser boundary. It covers:

- object concise ordinary and generator methods;
- class ordinary and generator `MethodDefinition` values;
- object and class getter/setter arity controls; and
- sloppy function declarations, direct function expressions, and object data
  properties whose values are ordinary function expressions.

Before the fix:

```text
custom object and class methods reject duplicate simple parameters ...
Expected function to throw SyntaxError
```

The pre-fix failure was the ordinary object concise-method case; the generator
and class controls had already rejected.

### Fix and GREEN

The duplicate allowance now excludes every object method/accessor function and
every class `MethodDefinition`, independently of the generator flag. The
existing generator-function rule remains intact. Sloppy ordinary declarations
and expressions, including a function-valued object data property, remain
accepted.

The parser, classes, enhanced-object-literal, object-literal, and function
parameter suites passed. Typecheck initially identified missing contextual
types on the new test fixture callbacks; commit `003ee69` added JSDoc types, and
the rerun passed.

## Final verification

All commands below ran against final code HEAD
`3979a91e43ba9c6e1fe7ca5831c964180b1417f2`.

### Portable hosts

The same affected suite list covered parser, module parser/loader/linker/
evaluation/namespace/API/integration, classes, enhanced object literals, object
literals, and function parameters:

```text
Node targeted: 332 passed, 0 failed, 0 skipped
Chromium targeted: 332 passed, 0 failed, 0 skipped
JSC portable: 1979 passed, 0 failed, 0 skipped
```

JavaScriptCore used:

```text
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
```

The JSC runner has no suite-selection interface, so its complete portable
registry was the available stronger check.

### Focused module Test262

```text
npm run test262:modules --silent
```

Both contract tests passed. All 13 pinned module roots passed with zero failures
or skips, and the raw-metadata contract passed.

### Repository and static checks

All exited zero:

```text
npm run typecheck --silent
npm run lint --silent
npm run format --silent
npm run vendor:check --silent
node test/run-node.js test/node/repository-invariants.test.js
git diff --check bdb06e2a1045..HEAD
```

Repository invariants reported 35 passed and 0 failed. The final code range
changes only:

```text
src/parser.js
src/runtime/module-loader.js
src/runtime/module-namespace.js
test/module-namespace.test.js
test/module-parser.test.js
test/parser.test.js
```

A final scoped code review of `bdb06e2a1045..3979a91` reported no significant
issues.

## Concerns

No unresolved correctness blocker remains. The only host-specific limitation is
the existing JSC runner's lack of targeted suite selection; its full portable
registry passed instead. No generated artifacts changed.
