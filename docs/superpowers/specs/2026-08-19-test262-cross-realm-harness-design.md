# Portable Harness-Only Test262 Cross-Realm Design

## Goal

Complete issue #76's harness host-support scope at exact baseline
`54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7` by installing portable,
same-Agent `$262.createRealm` and `$262.evalScript` support and by generating
selector-zero disposition for the H0 ledger's exact 135 core roots / 267
executable variants.

Completion means every H0 root is either a complete-root pass or a reviewed
reassignment to one existing roadmap blocker. It does not mean all 135 roots
semantically pass.

The definitive path ledger is issue #76 comment
`5347037600`, `H0.paths.txt`, SHA-256
`3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950`.
That immutable ledger remains 135 roots / 267 variants. Exact execution
evidence must cover every root and every required variant once.

## Scope

The Test262 runner installs the pinned harness host interface before evaluating
each variant, including raw variants. The `raw` flag suppresses source
rewriting and harness includes, not host-defined functions. `$262` remains
embedding infrastructure:

- it is absent from every normally-created Realm;
- it is not exported from the public runtime API;
- it is installed only through the injected Test262 engine bridge.

ArrayBuffer detachment remains B0. `AbstractModuleSource`, garbage collection,
and later Agent hooks are excluded. Existing asynchronous `print`/`$DONE`
bridging remains on the runner's current path and is not duplicated inside
`$262`. Downstream runtime semantics remain out of scope for the harness-only
implementation.

## Architecture

Extend `Test262Engine` with a required `installHostBindings(realm)` hook.
`runVariant` creates the variant Realm, invokes the hook exactly once, then
follows the existing module, asynchronous, or synchronous execution path. The
runner fails fast when an injected engine omits the hook; every focused engine
double must state its host-binding behavior explicitly. This keeps the shared
runner host-neutral and prevents Node, Chromium, and JavaScriptCore adapters
from developing semantic forks.

Installation occurs before `assert.js`, `sta.js`, declared includes, async
setup, or module evaluation. A module root uses this prepared Realm throughout
loading, linking, and evaluation. `_FIXTURE` dependencies do not receive
independent Realm modification; they execute in the root module graph's
prepared Realm.

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
retains ordinary-object branding (`[object Object]`) by inheriting from its
Realm's `%Object.prototype%`. Its `global`, `createRealm`, and `evalScript`
properties are ordinary writable, enumerable, configurable data properties.
Its native functions inherit from that Realm's `%Function.prototype%` and have
the standard non-writable, non-enumerable, configurable `name` and `length`
properties.

`$262.createRealm()` creates a child Realm with the owner's Agent, recursively
installs the host interface, and returns the child's `$262` object. The child
therefore has distinct globals and intrinsics while sharing well-known symbols
and the global symbol registry with its parent.

`$262.evalScript(source)` accepts only a primitive string, as stated by the
pinned host contract; it never delegates to host `String`. A missing argument,
a Symbol, or any other non-string value throws a `TypeError` owned by the
function's Realm before parsing or evaluation. The exact H0 ledger passes only
primitive string literals, so this validation introduces no unsupported
coercion dependency.

For a valid string, `evalScript` evaluates global script in its owning Realm.
Normal completion returns the script completion value. A guest throw
completion is re-thrown unchanged through `ThrowSignal`, preserving thrown
value identity. A parser `SyntaxError` becomes a `GuestErrorSignal` at the
native-function boundary, so the resulting guest `SyntaxError` belongs to the
`evalScript` function's Realm. Unexpected host allocation, compiler, or engine
failures remain host failures.

## Alternatives Rejected

Direct Realm manipulation in `runner.js` would couple portable execution
semantics to jsjs internals. Installing `$262` from `Realm` construction or a
public runtime helper would leak Test262 infrastructure into the normal guest
or embedding API. Both violate the roadmap boundary.

## Test Strategy

Strict RED-first portable probes cover:

- global `$262` descriptors and exact ordinary-object/function branding;
- absence from normal Realms and presence in raw Test262 variants;
- fail-fast behavior when an injected engine omits `installHostBindings`;
- installation ordering before harness includes, async setup, and module
  evaluation, with no second module Realm;
- same-Agent symbol identity with distinct globals and intrinsics;
- recursive host availability in child Realms;
- persistent global declarations and completion values through `evalScript`;
- rejection of missing, Symbol, object, and other non-string arguments without
  host coercion;
- parent- and child-Realm ownership of parser and runtime errors; and
- thrown-value identity across `evalScript`.

After the focused probes pass, run the exact H0 ledger under `TZ=UTC` against
the pinned Test262 SHA to produce complete root/variant execution evidence. The
generator assigns exactly one root-level disposition:

- `passed` only when the root's complete required variant set passed; or
- `reassigned` only when every required variant has a concrete reviewed failure
  signature and one named existing roadmap blocker is the next actual blocker
  under taxonomy precedence.

Promotion contains only complete-root passes; partially passing roots are never
promoted. Missing variants, skipped variants, mixed pass/fail evidence,
duplicate roots or variants, unknown owners, variant mismatches, or unexplained
failures fail closed and leave the H0 blocker unchanged. Reassignment records
retain secondary prerequisite/failure evidence without replacing the single
primary owner.

The current observed host-support baseline is 40 roots / 79 variants passed and
95 roots / 188 variants reassigned. Final counts are regenerated after
moving-main reconciliation, not hard-coded. Generator-owned disposition,
promotion, taxonomy, and downstream owner-ledger updates make the H0 selector
zero without manual blocker deletion, while preserving global taxonomy balance
and the exact H0 root/variant union.

## Gates

Run Node, Chromium, and JavaScriptCore portable suites, with JSC at
`/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc`.
Run the focused UTC Test262 ledger locally to collect exact evidence, then run
taxonomy/audit/selection drift checks, typecheck, lint, formatting, vendor and
generated-CI invariants, and benchmark smoke. Broad pinned Test262 runs only in
exact-head CI. Exact-head CodeQL and CI must pass before merge. Publish the
outcome as harness host-support completion, not 135 semantic passes.
