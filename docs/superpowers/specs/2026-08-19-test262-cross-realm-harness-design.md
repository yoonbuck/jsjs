# Portable Harness-Only Test262 Cross-Realm Design

## Goal

Implement issue #76 at exact baseline
`54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7`: unblock the H0 ledger's exact
135 core roots / 267 executable variants with portable, same-Agent
`$262.createRealm` and `$262.evalScript` support.

The definitive path ledger is issue #76 comment
`5347037600`, `H0.paths.txt`, SHA-256
`3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950`.

## Scope

The Test262 runner installs the pinned harness host interface before evaluating
non-raw tests. `$262` remains embedding infrastructure:

- it is absent from every normally-created Realm;
- it is not exported from the public runtime API;
- it is installed only through the injected Test262 engine bridge; and
- raw Test262 variants receive no harness-defined or host-defined bindings.

ArrayBuffer detachment remains B0. Garbage collection and later Agent hooks are
excluded.

## Architecture

Extend `Test262Engine` with an `installHost(realm)` hook. `runVariant` creates
the variant Realm, invokes that hook for non-raw variants, then follows the
existing module, asynchronous, or synchronous execution path. This keeps the
shared runner host-neutral and prevents Node, Chromium, and JavaScriptCore
adapters from developing semantic forks.

`createJsjsTest262Engine` implements the hook with a private recursive
installer. For each Realm it creates an ordinary `EngineObject` whose prototype
is that Realm's `%Object.prototype%`. The object owns:

- `global`, referencing that Realm's global object;
- `createRealm`, a Realm-owned native function named `createRealm` with length
  zero; and
- `evalScript`, a Realm-owned native function named `evalScript` with length
  one.

The Realm global's `$262` property is writable, configurable, and
non-enumerable, matching the pinned Test262 embedding contract. The host object
retains ordinary-object branding (`[object Object]`), and its functions retain
ordinary Realm-owned function branding and descriptors.

`$262.createRealm()` creates a child Realm with the owner's Agent, recursively
installs the host interface, and returns the child's `$262` object. The child
therefore has distinct globals and intrinsics while sharing well-known symbols
and the global symbol registry with its parent.

`$262.evalScript(source)` evaluates global script in its owning Realm. Normal
completion returns the script completion value. A guest throw completion is
re-thrown unchanged through `ThrowSignal`. A parser `SyntaxError` becomes a
`GuestErrorSignal` at the native-function boundary, so the resulting guest
`SyntaxError` belongs to the `evalScript` function's Realm. Unexpected host
allocation, compiler, or engine failures remain host failures.

## Alternatives Rejected

Direct Realm manipulation in `runner.js` would couple portable execution
semantics to jsjs internals. Installing `$262` from `Realm` construction or a
public runtime helper would leak Test262 infrastructure into the normal guest
or embedding API. Both violate the roadmap boundary.

## Test Strategy

Strict RED-first portable probes cover:

- global `$262` descriptors and exact ordinary-object/function branding;
- absence from normal Realms and raw Test262 variants;
- same-Agent symbol identity with distinct globals and intrinsics;
- recursive host availability in child Realms;
- persistent global declarations and completion values through `evalScript`;
- parent- and child-Realm ownership of parser and runtime errors; and
- runner hook ordering before harness includes, modules, asynchronous tests,
  and ordinary scripts.

After the focused probes pass, run the exact H0 ledger under `TZ=UTC` against
the pinned Test262 SHA. The post-change taxonomy must reclassify all 135 roots /
267 variants away from `test262-cross-realm-host` without widening a feature
tag or changing another owning blocker.

## Gates

Run Node, Chromium, and JavaScriptCore portable suites, with JSC at
`/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc`.
Run the focused UTC Test262 ledger locally, taxonomy/audit/selection drift
checks, typecheck, lint, formatting, vendor and generated-CI invariants, and
benchmark smoke. Broad pinned Test262 runs only in exact-head CI. Exact-head
CodeQL and CI must pass before merge.
