# ES2015 Runtime Integration and Release Design

## Goal

Prove that the merged object/function, Agent/Symbol, lexical/TDZ,
iterator/`for`-`of`, and identifier-read changes form one coherent ES2015 runtime
foundation. Fix only defects exposed by integration, preserve ES5 behavior, and
close issues #45 and #26 only after portable suites, upstream Test262, benchmark
smoke, documentation contracts, and final review all pass.

## Approach

Use an audit-first release gate. Inspect shared contracts and add focused
cross-subsystem regressions before running the expensive complete matrices. This
makes failures attributable without reimplementing or independently revalidating
already-merged feature work.

Two alternatives are rejected:

- Full-suite-first gives fast aggregate status but poor diagnostics for wiring
  failures and can waste complete Test262 runs while a small integration defect
  remains.
- Subsystem-by-subsystem revalidation repeats merged pull-request work and is
  less likely to expose interactions between environments, symbols, iteration,
  function metadata, and optimized reads.

## Integration Contracts

### Agents, realms, intrinsics, and protocols

Every realm owns its constructors, prototypes, and mutable intrinsic objects.
Every Agent owns its well-known symbol identities and global symbol registry.
Intrinsic installation must use the realm's objects and the Agent's symbol keys.
Protocol lookup on an `EngineObject` follows that object's Agent, including
`@@toPrimitive`, `@@toStringTag`, and `@@iterator`; same-description symbols from
another Agent remain ordinary unrelated keys.

### Property keys, functions, and `super`

All reflection and enumeration surfaces share ordinary own-key ordering: numeric
index strings ascending, other strings in creation order, then symbols in
creation order. String-only surfaces filter after ordering. Function `name` and
`length` descriptors retain ES2015 attributes across ordinary, native, bound,
dynamic, inferred-name, and accessor functions. Accessor methods retain their
`[[HomeObject]]`; `super` begins lookup at the home object's prototype while
preserving the current receiver for getters, setters, reads, and writes.

### Environments and optimized reads

Lexical and variable environments remain distinct through scripts, functions,
blocks, globals, direct and indirect eval, and loop iterations. Uninitialized
bindings always raise the guest TDZ `ReferenceError`, including through the fused
identifier-read path. Per-iteration lexical environments remain fresh, while
`var` and assignment targets retain their shared binding behavior. Optimized
reads must preserve environment lookup, error materialization, and the guest
stack guard rather than bypassing runtime boundaries.

### Iteration and abrupt completion

Iterator acquisition uses the iterable object's Agent-owned `@@iterator`.
Built-in iterator objects and result objects belong to the executing realm.
`for`-`of` integrates with lexical head TDZ and fresh per-iteration bindings.
Abrupt body or binding completions invoke `IteratorClose` with specification
error precedence: an existing throw wins over close failures, while a close
failure can replace a non-throw completion. Iterator-step and iterator-value
failures propagate without an extra close.

## Conformance and Generated Artifacts

Audit `featureAreas`, feature probes, supported-grammar filtering, selection
precedence, exclusions, manifests, reports, and coverage together. Every claimed
ES2015 prefix must be guarded by the exact supported feature probes; unsupported
neighbor syntax must remain excluded. The generated selection, pinned subset,
report, and documentation coverage block must agree and remain deterministic.
Coverage generation runs with `TZ=UTC`, matching CI and preventing host-zone
drift.

Focused integration probes cover combinations rather than isolated features:
cross-realm and cross-Agent protocols, interleaved string/symbol keys, super
accessors with inferred names, eval and loop lexical bindings consumed by
`for`-`of`, TDZ through fast identifier reads, iterator closing across guest
throws and control completions, and descriptor stability across realms.

## Execution and Error Handling

1. Run targeted portable integration suites and Test262 policy/contracts to
   establish a baseline.
2. Add a failing regression before each integration-only fix.
3. Keep guest failures on existing realm-aware error and completion paths; do
   not introduce broad catches or success-shaped fallbacks.
4. Regenerate selection and coverage only through repository commands under
   `TZ=UTC`.
5. Run complete Node, Chromium, and JSC suites, the full pinned upstream Test262
   selection, exclusions and CI contracts, repository formatting/lint/type
   checks, and benchmark smoke.
6. Obtain a final high-capability review using a GPT-5.6-family model or Claude
   Opus 4.8 at maximum effort, resolve every high-confidence finding, and rerun
   affected gates.
7. Update issue and roadmap proof, then close #45 and #26. Create and push a
   release pull request only when integration fixes or tracked proof artifacts
   change current main.

## Acceptance Criteria

- Realm and Agent ownership is correct across every installed intrinsic and
  supported well-known-symbol protocol.
- Mixed own-key order, `[[HomeObject]]`/`super`, function names, and descriptor
  attributes remain correct in combination.
- Lexical/global/eval/per-iteration environments preserve TDZ and optimized-read
  semantics under the stack guard.
- Iterators and `for`-`of` preserve realm ownership, per-iteration binding, close
  behavior, and abrupt-completion precedence.
- Test262 claims, probes, selection, exclusions, reports, and UTC coverage are
  mutually consistent and deterministic.
- Complete Node, Chromium, and JSC suites are equivalent; the pinned upstream
  Test262 run, benchmark smoke, CI, and documentation contracts pass.
- Final high-capability review has no unresolved correctness finding.
- Issues #45 and #26 contain the release evidence and are closed.
