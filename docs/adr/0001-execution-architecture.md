# ADR 0001: Execution-architecture direction for the tree-walking evaluator

- Status: Accepted
- Date: 2026-08-08
- Issue: [#40 — Evaluate cached lookup, lightweight contexts, and bytecode architecture](https://github.com/yoonbuck/jsjs/issues/40) (sub-issue of #29)
- Deciders: engine maintainers
- Supersedes: none
- Related: [#42](https://github.com/yoonbuck/jsjs/issues/42) (object/array/property optimizations — out of scope here), [`docs/profiling.md`](../profiling.md), [`docs/architecture.md`](../architecture.md), [`docs/benchmarking.md`](../benchmarking.md)

## Context

`jsjs` is a tree-walking ES5.1 interpreter written in portable ES2020 with
JSDoc types, run identically under Node, browsers, and JavaScriptCore. Its
stated values are **ES5.1 semantic fidelity**, **portability across those three
hosts**, and **readability of the reference implementation** — throughput is a
distant fourth. Any architecture change is judged against those first three
before performance.

Issue #40 asks us to evaluate four execution-architecture directions and decide,
with evidence, which to pursue:

1. **Cached identifier / environment resolution** — avoid repeating scope-chain
   walks and the per-read allocation on the identifier path.
2. **Cached property lookup** — inline caches / shape caches for member access.
3. **Lightweight execution / completion context representation** — cheaper
   per-node execution state and completion records.
4. **Bytecode / IR** — compile the AST to an instruction stream and run a
   dispatch loop instead of walking nodes.

The acceptance criteria are explicit: **each option is benchmarked or rejected
with evidence; semantics and invalidation constraints are stated; the bytecode
decision is recorded; and any prototype stays isolated until reviewed.** This
ADR is that record.

### Evidence base

The merged profiling evidence ([`docs/profiling.md`](../profiling.md), from
PR #50, with the methodology corrections in
[`docs/superpowers/plans/2026-08-08-profiling-methodology-corrections.md`](../superpowers/plans/2026-08-08-profiling-methodology-corrections.md))
reports **normalized category and frame shares**, explicitly _not_ speedup
forecasts. The relevant figures:

| Interpreter category    | CPU share | Allocation share |
| ----------------------- | --------: | ---------------: |
| evaluator               |   48.67 % |          36.29 % |
| references-environments |   16.21 % |           9.51 % |
| object-property (#42)   |   15.81 % |          15.67 % |
| completions             |    0.63 % |           3.10 % |

Leading frames on the identifier path:

- `reference.js#getValue` — **#1 allocation frame at 9.51 %**, and 3.22 % CPU.
- `environment.js#getIdentifierReference` — 2.45 % CPU.
- `expressions.js#evaluateExpressionValue` — 10.03 % CPU (the read-dispatch site).

`docs/profiling.md` reserves cached-lookup / lightweight-context / bytecode as
**#40** work and object/descriptor/property/array paths as **#42** work. This
ADR stays strictly inside the #40 boundary and does not touch anything #42 owns.

A crucial methodological caveat carried over from that document: **normalized
shares rank where cost concentrates; they are not predictions that removing a
frame yields a proportional speedup.** This ADR therefore treats every share as
a hypothesis to be confirmed by a direct before/after measurement, never as a
result on its own.

## Options and evidence

To evaluate the options without merging speculative architecture, three
**isolated** prototype benchmarks were built under
[`tools/prototypes/`](../../tools/prototypes/) (never in `src/`; nothing in the
engine imports them). See [`tools/prototypes/README.md`](../../tools/prototypes/README.md).

### Option 1 — Cached identifier / environment resolution

Two sub-questions: (a) can we remove the per-read `Reference` allocation, and
(b) can we cache the _scope-chain depth / slot_ of a resolved identifier so
repeated reads skip the walk?

**(a) Allocation-free read fusion.** Every identifier _read_ today runs
`getValue(getIdentifierReference(env, name, strict))`: it allocates a
`Reference`, immediately dereferences it, and discards it. The dereference and
the allocation are fusible without changing any observable, because the read
only needs the _value_, never the reference. `getIdentifierBindingValue` walks
the chain identically (`hasBinding` to find the innermost binding record, then
`record.getBindingValue(name, strict)`) and throws the same guest
`ReferenceError` for an unresolvable name — with zero intermediate allocation.

Evidence — `tools/prototypes/engine-alloc-bench.js`, real engine, on windows
sized to minimize GC (contaminated samples are detected and discarded rather
than assumed absent) — and this is **verified, not assumed**. The
verification accounts for a subtlety: Node delivers `gc` `PerformanceObserver`
callbacks asynchronously, batched on a later timers turn of the event loop, so a
synchronous counter read taken right after a workload would _not_ yet reflect a
collection that fired inside it (an earlier revision of this bench had exactly
that defect and so verified nothing). The corrected bench records each `gc`
entry's `[startTime, startTime + duration]` interval, yields through a
`setTimeout(0)` so those callbacks are actually delivered, and then **discards
any sample whose measured window overlaps a GC interval** — so each reported
delta is a clean per-run allocation figure rather than net heap growth
confounded by a collection. The detector is self-checked (it correctly flags a
window containing a forced `gc()` and clears a quiet one, and in normal runs it
discards the occasional contaminated sample), and each workload pins the exact
guest result it must produce. Representative medians (Node v26, single host,
≥39/40 GC-clean samples per workload):

| Workload               | Baseline alloc | Fused alloc | Reduction (fraction / absolute) |
| ---------------------- | -------------: | ----------: | ------------------------------- |
| locals-arith           |      2600.6 KB |   1281.8 KB | ~51 % / ~1319 KB                |
| outer-scope-reads      |      2715.6 KB |   1389.1 KB | ~49 % / ~1327 KB                |
| global-reads (genuine) |      5334.0 KB |   3911.9 KB | ~27 % / ~1422 KB                |

The **absolute** per-run reduction is essentially constant (~1.3 MB for the same
iteration count), because it is one eliminated `Reference` per identifier read.
The **fraction** differs only because the denominators differ: the genuine
global-reads workload (top-level `var`s read from inside a nested function, so
each read resolves through the global environment record) allocates more in
total, so the same absolute saving is a smaller share. Halving-scale reductions
on the local/closure paths, a uniform ~1.3 MB absolute saving throughout — the
direct realization of eliminating the profiling's #1 allocation frame on the
read path. This is a reduction in **allocation volume / GC pressure**; it is
_not_ claimed to reduce scavenge frequency or GC-pause time, neither of which was
measured.

Throughput — `tools/prototypes/engine-read-path-bench.js`, same host, is
**unchanged within noise** (e.g. locals-arith ~369 ms/run before and after; the
benchmark now validates each workload against a pinned expected result so a
silently broken run cannot be timed as if valid). This is stated plainly: the
eliminated `Reference` is a tiny, short-lived object that V8's scavenger
reclaims almost for free, so reducing allocation does not move wall-clock on
this workload/host. The peak-heap column of that benchmark is a steady-state
working-set measure and is _not_ sensitive to a per-read reduction; the alloc
bench is the authoritative allocation metric.

The honest limit of this evidence: it is one Node host. No cross-host (browser,
`jsc`) allocation figure, GC-pause, or retained-heap measurement was taken. The
claim is therefore scoped to "a verified, uniform per-read allocation reduction
that lowers allocation pressure on Node," not a demonstrated latency or
peak-memory win. The decision to merge rests on that reduction being real and
verified, the change preserving read-path equivalence by construction and being
covered by equivalence tests (below), the change being tiny, and throughput
showing no regression — not on a throughput improvement.

**(b) Depth/slot caching.** `tools/prototypes/identifier-strategies-bench.js`
compares reference-allocating, fused, and an _idealized_ scope-depth hit path
(handed the depth; it models neither the cache lookup, the validity guard, a
miss, nor invalidation) on a synthetic deep chain. That idealized path shows a
**~2.5× ceiling** (observed 2.4–2.6× across runs, a single fixed-order sample) for
deep chains — an upper bound on what any depth cache could buy, not an achievable
figure, and not a variance-controlled measurement.

### Option 2 — Cached property lookup (inline / shape caches)

Feasibility only; no prototype was built, because this is a real ownership
boundary, not merely a hot path we declined to touch. Member access lives in the
`object-property` category (15.81 % CPU), which `docs/profiling.md` assigns to
**#42**. Any effective property cache — whether keyed on hidden-class/shape
identity, on receiver identity, on descriptor location, or on a
generation/version counter — is a function of the object and descriptor
_representation_ that #42 owns. Building one here would either duplicate or
pre-empt #42's representation decisions. The handoff contract this ADR records
for #42: whatever key is chosen, the cache must invalidate on shape change
(add/delete/reconfigure of own properties), on prototype-chain mutation, and on
descriptor attribute changes, and a hit must still honor accessor getters and
the ES5 `[[Get]]` semantics rather than returning a cached raw value.

### Option 3 — Lightweight execution / completion context

Both representations are already lightweight. The execution context is a plain
object carrying `realm`, `env`, `variableEnv`, `strict`, `thisValue`, and an
optional `homeObject` (no heavyweight cursor/state machine); completion records
are plain `{ type, value }` objects. Completions are 0.63 % CPU / 3.10 %
allocation, and that category does not even measure execution-context cost, so
the profile gives no evidence that either is a bottleneck worth restructuring.

Lighter completion representations do exist — returning a raw value for the
common normal completion, a shared immutable "empty normal" singleton, or
allocating only abrupt completions — so pooling is not the only option. But each
trades the current representation's simplicity and non-aliasing guarantee for a
sub-1 %-CPU target the profile does not flag. The decision is therefore "no
change: insufficient evidence of a bottleneck, and too low-priority to justify
prototyping or risking aliasing/readability regressions," not a claim that
pooling is the sole alternative.

### Option 4 — Bytecode / IR

Assessed as an architecture question, not a micro-benchmark. The rejection rests
primarily on **cost and the project's stated priorities**, not on the profile: a
bytecode compiler plus dispatch loop is a large, high-risk rewrite of the
evaluator core. A well-built VM _could_ reuse the existing runtime operations
(coercion, `GetValue`/`PutValue`, completion handling) rather than reimplement
them, so "a second copy of the semantics" is not inevitable — but even reusing
them, it introduces a compile step, an instruction set, and a dispatch loop
whose interaction with abrupt completions and references must be re-verified,
putting semantic fidelity, readability, and Node/browser/`jsc` portability — the
top three project values — at risk for a throughput gain the project has no
latency baseline to even measure.

The profile is explicitly _not_ used as the argument here, because it cuts both
ways: broad dispatch cost (`evaluateExpression` 10.27 %, `evaluateExpressionValue`
10.03 %) could be read as an argument _for_ bytecode, and normalized self-shares
are not architectural attributions or speedup forecasts. That ambiguity is
exactly why bytecode needs a real baseline before it can be judged, not a share
table.

## Decision

| Option                                       | Decision                                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a — allocation-free read fusion             | **Adopt and implement now.** Low-risk; designed and tested to preserve equivalence (including accessor stack-depth), with no observed semantic regression; a verified uniform ~1.3 MB / up to ~50 % per-run allocation reduction on identifier-heavy code, no throughput regression.         |
| 1b — depth/slot identifier cache             | **Defer.** ~2.5× idealized ceiling for deep chains, but the invalidation surface (below) is too broad for the current, mostly-shallow, semantics-critical read path. Revisit only with a validity guard proven against the constraints below and a latency baseline that can detect the win. |
| 2 — cached property lookup                   | **Defer to / coordinate with #42.** Do not prototype an IC here; the shape/descriptor design belongs to #42. Documented as feasible-but-owned-elsewhere.                                                                                                                                     |
| 3 — lightweight execution/completion context | **Reject (no change).** The representation is already lightweight; there is no evidence execution-context or completion cost is a bottleneck (completions sit under ~1 % CPU), and the lighter alternatives do not justify the readability/semantic complexity they add.                     |
| 4 — bytecode / IR                            | **Reject now.** Revisit only if a maintained latency baseline shows dispatch is the dominant cost _and_ portability/fidelity can be preserved; record the trigger, don't build speculatively.                                                                                                |

Only Option 1a is merged. Options 1b, 2, 3, and 4 change no production code; the
prototypes that evaluated them stay isolated under `tools/prototypes/`.

## Semantics and invalidation constraints (normative)

These are the constraints any current or future identifier/lookup caching must
honor. They are the reason 1b is deferred and 1a is scoped to reads only.

### What 1a preserves (why it is safe)

`getIdentifierBindingValue` is a pure fusion of `getIdentifierReference` +
`getValue` and preserves every observable of the read path:

- **Same walk, same record.** It finds the _same_ innermost record via
  `hasBinding` and calls that record's `getBindingValue(name, strict)`, so
  declarative uninitialized-binding errors, object-record strict/non-strict
  behavior, and the global record's **declarative-over-object precedence** all
  still apply.
- **Same error.** An unresolvable name throws the same guest `ReferenceError`
  with the same `"<name> is not defined"` message (ECMA-262 8.7.1 via 8.7 /
  8.7.2). Reads never depend on the unresolvable reference's `base`, so nothing
  is lost by not constructing one.
- **Reads only.** `PutValue`, `delete`, and `typeof`'s
  unresolvable-→`'undefined'` rule still need the `Reference` object, so those
  callers keep using `getIdentifierReference`. `with`, direct `eval`, named
  function expressions, and `catch` bindings work because they are ordinary
  records in the chain that `hasBinding`/`getBindingValue` already handle — each
  covered by an equivalence test (including a `with` accessor case, an
  `eval`-introduced binding, and a name bound in both global sub-records).
- **Stack accounting preserved — including for accessor reads.** The fast path
  bypasses `evaluateExpression` but still bounds-checks and counts exactly one
  engine frame for the node. That accounting is a balanced `enter`/`exit`
  performed _before_ the fused resolution runs — not a frame held around the
  resolution walk — and the value is fetched after it, because the original
  `evaluateExpression` returned from the node's frame _before_ `GetValue` ran.
  (The resolution walk itself cannot invoke guest code, so whether the
  balanced frame precedes or surrounds it is immaterial; what matters is that
  the frame is not held across the value fetch.) An identifier that resolves
  onto an **accessor** on an object/global environment record (a `with` scope
  or a `Object.defineProperty(this, …, {get})` global) therefore runs its
  getter at the same depth on both paths; fetching the value while still holding
  the node's frame would have run the getter one frame deeper and shifted the
  `DEFAULT_MAX_STACK_DEPTH = 500` overflow boundary by one for exactly that
  shape. A dedicated test asserts the getter's observed `stackGuard.depth` is
  identical on the fused and reference paths.

### What a resolution cache (1b) would have to invalidate against

The design space is not one cache but four, each with a different key and a
different soundness obligation. Conflating them is how an unsound cache gets
built, so they are separated here:

- **Cached depth** — "this occurrence resolves _d_ records up."
- **Cached lexical slot** — "…and at slot _s_ within that record."
- **Cached record identity** — "…in _this specific_ environment record."
- **Cached value / descriptor** — the resolved value itself. **Out of bounds:**
  a hit must always re-invoke the resolved record's `getBindingValue`, or it
  breaks getters, uninitialized-binding throws, and later mutation visibility.
  Only resolution may be cached, never the value.

A resolution cache is sound only if it is invalidated on every event that can
change which record — or which slot in it — a name resolves to:

- **`with` statements** — insert an object environment record whose `hasBinding`
  is a runtime property test, so a name can resolve into or out of it between
  evaluations. This includes the binding object's **prototype chain**: an
  inherited property makes `hasBinding` true, so prototype mutation of any
  object on a live `with` (or the global object) is an invalidation event.
- **Direct `eval`** — non-strict direct `eval` introduces bindings into the
  _calling_ variable environment (strict direct `eval` gets its own environment
  and cannot). Note the precise hazard: it does not necessarily change a name's
  chain _depth_; it changes which binding _wins_ within an existing variable
  environment (and can shadow an outer resolution). A depth-only cache and a
  slot cache are affected differently, which is why the classes above must be
  kept distinct.
- **`delete`** — removes a binding so a name falls through to an outer record.
  This covers not only global/object-record properties but the **deletable
  declarative bindings direct `eval` creates** (`src/evaluator/declarations.js`),
  which are removable unlike ordinary `var` bindings.
- **Dynamic global properties** — assigning a new global (`x = 1` at top level),
  `this.x = …` at global scope, `Object.defineProperty(this, …)` on the global
  object, a later `<script>`/eval in the same realm, or an embedder installing a
  global all change the global record's `hasBinding`. (This ES5.1 interpreter
  exposes the global object as top-level `this`, not `globalThis`.)
- **Negative / unresolvable caching** — caching "name is unresolvable" is itself
  invalidated by every event above that can _create_ a binding (direct or
  indirect `eval`, a later script, `this.x`, `defineProperty`, embedder APIs).
  A negative cache is strictly harder than a positive one.
- **Global record internal target** — the global record dispatches between its
  declarative and object sub-records with declarative-over-object precedence. A
  cached _depth_ that lands on the global record and still re-invokes that
  record's `getBindingValue` stays sound, because the record enforces precedence
  dynamically. The obligation is narrower and falls only on caches that _bypass_
  that abstraction — a cached lexical slot or a cached sub-record identity must
  itself preserve or re-validate which sub-record wins, which the collide-name
  case (a name bound in both sub-records) exercises.
- **AST-node identity is not a sufficient key** — the same function-body AST is
  shared by every closure created from it, and those closures can run under
  different dynamic `with` environments. A cache keyed on occurrence identity
  alone is therefore unsound across closures; it must also key on (or generation-
  guard against) the dynamic environment.

Two clarifications on things that are _not_ themselves resolution-invalidation
events, to avoid over-invalidating:

- **Fresh activation identity** — each call makes new declarative records, but
  for a _depth_ cache that is not an invalidation event: the lexical depth is
  stable across activations; only a record-_identity_ cache must be
  per-activation.
- **Uninitialized → initialized** — a binding going from present-but-uninitialized
  to initialized is a change of _binding state_, not of _resolution_. A
  resolution cache need not invalidate on it, but (per "cached value" above) a
  hit must still call `getBindingValue`, which performs the uninitialized check.

If caching is ever extended beyond value reads, two further obligations apply:
an identifier _call_ must preserve the resolved record for `ImplicitThisValue`
(so a `with`-scoped method gets the right `this`), and direct-`eval` detection
must remain correct regardless of any cached resolution.

Because these are exactly the semantics-critical corners the engine values most,
1b is deferred until a validity guard provably covering all of them exists. 1a
sidesteps every one of them by not caching resolution at all — it only removes
an allocation from a walk it still performs in full on every read.

## Consequences

Positive:

- Identifier-heavy code allocates a verified ~1.3 MB less per run (up to ~50 %)
  on the read path, lowering allocation volume / GC pressure, with no observed
  semantic or portability regression (the read path is unchanged in behavior and
  covered by equivalence tests). The reduction is GC-verified on Node (windows
  with overlapping collections are discarded); a reduction in scavenge frequency,
  GC-pause time, or a cross-host benefit is plausible but was not measured and is
  not claimed.
- The evaluation is recorded with reproducible, self-checking tooling (result
  guards + GC-event verification); future revisits of 1b/2/4 start from stated
  constraints and committed benchmarks rather than from scratch.

Neutral / negative:

- No throughput improvement on the measured host — stated honestly; the win is
  allocation/GC-pressure, not wall-clock, and rests on one Node host.
- A second identifier-read helper (`getIdentifierBindingValue`) now sits beside
  `getIdentifierReference`, and the read fast path duplicates the guard-routing
  of `evaluateExpression`. This is a real readability/maintenance cost; the two
  must stay in lockstep (same walk, same error, same getter depth), enforced by
  `test/identifier-read-fast-path.test.js`.
- Options 2 and 4 remain open questions; this ADR narrows, not closes, them and
  records the triggers for revisiting.

If maintainers weigh a verified allocation/GC-pressure reduction as
insufficient on its own — given throughput is the project's fourth priority and
no throughput win was shown — the fallback is equally supported by this record:
revert the two `src/` edits, keep the tests and benchmarks as the isolated
prototype, and treat 1a as "ready, pending a host that can measure the benefit."
The change is deliberately small enough that either path is cheap.

## Implementation

Merged in this change set (test-first):

- `src/runtime/environment.js` — `getIdentifierBindingValue(env, name, strict)`.
- `src/evaluator/expressions.js` — `evaluateExpressionValue` takes the fused fast
  path for bare `Identifier` reads, counting one guard frame with a balanced
  enter/exit performed before the resolution walk and never held across the value
  fetch (so accessor getters run at the same depth as before).
- `test/identifier-read-fast-path.test.js` — 15 equivalence tests asserting the
  fused path matches `getValue(getIdentifierReference(...))` across local, outer,
  shadowed, unresolvable, null-env, object-record, global-precedence (including a
  name bound in both global sub-records), and uninitialized cases; that an
  accessor getter runs at the same `stackGuard.depth` on both paths; and
  end-to-end `with` / accessor-global / named-function-expression / `catch` /
  direct-`eval` scripts.

Isolated, not merged into the engine (evaluation tooling only):

- `tools/prototypes/identifier-strategies-bench.js` — idealized depth ceiling.
- `tools/prototypes/engine-read-path-bench.js` — real-engine throughput/peak.
- `tools/prototypes/engine-alloc-bench.js` — real-engine GC-verified allocation.

## Revisit triggers

- **1b (depth/slot cache):** a maintained latency baseline shows identifier
  resolution depth is a measured bottleneck, _and_ a validity guard covering all
  invalidation events above is designed.
- **2 (property IC):** #42 settles object shape/descriptor representation; design
  the IC jointly on top of it.
- **4 (bytecode/IR):** a maintained latency/throughput baseline shows dispatch
  overhead (the interpreter's own node-walking/dispatch, as distinct from the
  runtime operations a VM could reuse) is the largest single cost and is not
  reducible by cheaper, localized means — e.g. the read-fusion above, targeted
  fast paths, or a resolution cache — _and_ there is a plan that preserves ES5.1
  fidelity and Node/browser/jsc portability.
