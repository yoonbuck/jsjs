# Whole-milestone review fix report

## Disposition

- Status: **FINAL REVIEW FIX DONE; WHOLE-MILESTONE RE-REVIEW PENDING**
- Review base:
  `1a0f011f4e179bfcb83c99108a626b7f4806cc94`
- Fix commit:
  `193902bff5899d8a9752e0579ef4a43da4d85305`
- Scope: three Important and two Minor high-confidence findings from the first
  maximum-capability GPT-5.6-family whole-milestone review
- Constraints honored: strict RED-first; no amend, broad local Test262,
  `ci:contract`, push, pull request, or full CI

## Findings and fixes

### Polymorphic inherited `[[HasProperty]]`

Ordinary `EngineObject#hasProperty` used `getProperty`, so an ordinary object
whose prototype was a module namespace invoked the namespace's virtual export
descriptor and read a linked-but-uninitialized binding. The inherited `in`
operation therefore raised a TDZ `ReferenceError` instead of returning `true`.

The ordinary prototype walk now remains iterative across ordinary objects and
dispatches to an overridden exotic `hasProperty` at the boundary. This mirrors
the existing polymorphic `set` boundary without introducing one host frame per
ordinary prototype link.

RED: the linked namespace TDZ test failed with `GuestErrorSignal: Cannot access
'value' before initialization` when checking the inheritor.

GREEN: namespace and ordinary-object suites pass, including the inheritor
returning `true` before module evaluation.

### Candidate-produced Test262 CI artifacts

The broad Test262 job uploaded `docs/test262-report.jsonl` under `always()`.
Because the report is committed, a prerequisite failure before the broad run
could publish the checkout's stale green report.

The generated job now removes the committed report immediately after project
checkout, before the upstream checkout or any installation/selection step. The
artifact step runs under:

```text
always() && hashFiles('docs/test262-report.jsonl') != ''
```

A failing broad run still writes and publishes its diagnostic report. A
prerequisite failure leaves no report to publish.

RED: the workflow contract observed `if: always()` and no pre-prerequisite
scrub.

GREEN: the focused workflow contract and generated workflow drift check pass.

### Clean pinned Test262 checkout

`assertPinnedCheckout` verified only the detached `.git/HEAD`, allowing
modified, deleted, or untracked upstream files to influence conformance
results.

The guard now also runs:

```text
git status --porcelain=v1 --untracked-files=all
```

inside the pinned checkout and rejects any output. A real isolated temporary
Git repository proves the exact clean detached SHA passes while both a tracked
modification and an untracked JavaScript file fail.

RED: both dirty states were accepted.

GREEN: the new dirty-tree regression passes, as do the real focused pinned
Promise/generator/module suites against the clean pinned checkout.

### Cross-Agent inherited `@@iterator`

`getIterator` chose one physical `Symbol.iterator` key from the iterable's
Agent and used it for the entire prototype chain. A caller-owned object
inheriting its protocol method from a foreign-Agent prototype was incorrectly
reported as non-iterable.

Engine objects now use `EngineObject#getWellKnownSymbol('iterator')`, which
derives the physical key owned by each prototype while preserving semantic
well-known-symbol lookup.

RED: the inherited cross-Agent case raised `[object Object] is not iterable`.

GREEN: the inherited case yields the foreign iterator's value and retains its
owner Realm prototype; adjacent iterator and `for`-`of` suites pass.

### Portable Test262 module identifiers

The shared resolver accepted `%`, `?`, and `#`. Node and browser URL-based
hosts decode or interpret those characters while the JSC host reads them
literally, so one identifier could address different files across hosts.

The resolver now rejects URL-sensitive characters after retaining the more
specific encoded-separator and encoded-dot diagnostics. Focused coverage spans
literal and encoded percent signs, query delimiters, and fragment delimiters in
both specifiers and referrers.

RED: every URL-sensitive case was accepted.

GREEN: module-path and portable Test262 runner suites pass.

## Final verification

- Focused affected Node suites: all passed.
- Focused affected Chromium suites: all passed.
- Full portable JavaScriptCore registry: **2,097 passed**, 0 failed.
- Focused UTC Promise/generator/module Test262: **4 passed**, 0 failed.
- Portable Test262 fixtures: **17 passed**, 0 failed, 1 expected skip.
- Generated Test262 selection: **14,107 paths across 58 groups**, current.
- TypeScript JSDoc check, ESLint, Prettier, vendor drift, generated CI drift,
  Unicode drift, and `git diff --check`: passed.
- Clean-tree benchmark smoke: passed.

No broad upstream Test262 command was run locally. Broad pinned Test262 remains
authoritative in exact-head GitHub CI.

## Repeated-review parser fix

The scoped re-review of the five-finding wave returned no significant issues.
The repeated maximum-capability whole-milestone review closed all five prior
findings and found one new Important issue: Acorn reuses singleton empty arrays
for bare-import `specifiers` and parenthesis-less `new` expression `arguments`,
while the custom AST structural-tree guard rejected the second occurrence as a
DAG.

The parser now permits a repeated structural array only when its length is
zero. Shared nodes and non-empty structural arrays retain the existing
rejection, so the evaluator cannot expand a compact DAG.

RED:

- both `parseModule` custom entry points rejected an Acorn program containing
  two bare imports with `Custom AST must be a structural tree`;
- both `parseScript` custom entry points rejected an Acorn program containing
  two parenthesis-less `new` expressions with the same error.

GREEN:

- focused parser and module-parser Node suites passed;
- focused parser and module-parser Chromium suites passed;
- full portable JavaScriptCore registry: **2,099 passed**, 0 failed;
- focused UTC Promise/generator/module Test262: **4 passed**, 0 failed;
- portable Test262 fixtures: **17 passed**, 0 failed, 1 expected skip;
- type checking, lint, formatting, vendor/generated CI/Unicode drift,
  `git diff --check`, and clean-tree benchmark smoke passed.

The exact parser fix commit is
`dc4d814cfc3126f9e7b4f06b5093e13a9cce979f`. No broad upstream Test262
command was run locally.

## Final review wave

The parser fix's scoped re-review returned no significant issue. The following
maximum-capability whole-milestone review found three additional issues.

### Checkout-independent Node test graph

`test/node/upstream-select.test.js` imported checkout validation from
`upstream-run.js`, pulling checkout-dependent execution code into the default
Node suite. Pin parsing and clean-checkout validation now live in
`tools/test262/pin.js`; `upstream-run.js` re-exports the API, while the unit test
imports the checkout-independent helper directly.

RED: the repository invariant reported the exact import chain from
`test/run-node.js` to `tools/test262/upstream-run.js`.

GREEN: the repository invariant and dirty-checkout regressions pass.

### Inherited cross-Agent coercion protocols

`ToPrimitive` and `Object.prototype.toString` selected the caller Agent's
physical `@@toPrimitive` and `@@toStringTag` keys for an entire prototype chain.
They now use `EngineObject#getWellKnownSymbol`, preserving semantic protocol
identity at each cross-Agent prototype boundary.

RED: a caller-owned object inheriting both hooks from a foreign-Agent prototype
fell back to `[object Object]`.

GREEN: coercion returns the foreign primitive and `[object ForeignTag]`.

### Portable Test262 host boundaries

Root tests were read before their identifiers were validated, nested module
identifiers accepted URL-stripped controls, and metadata harness includes
bypassed validation. A shared canonical repository-relative path guard now
rejects URL-sensitive delimiters, scheme/drive forms, literal backslashes,
ASCII controls and space, absolute paths, and noncanonical segments. Root tests
and includes fail before their host read, and normalized nested identifiers are
revalidated.

RED evidence covered `%`, `?`, `#`, `file:/`, `C:/`, `C|/`, tab, LF, CR,
traversal, encoded aliases, and host-read counters.

The first scoped review found the scheme/drive escape. Its re-review found the
include boundary. Both were fixed RED-first, and the final scoped re-review
returned no significant issue.

### Exact implementation and verification

The final review-fix commit is
`3b926e1d4d0c6ba73d20c9a7a33fd888aa9ec4a2`.

- Node: **2,247 passed**, 0 failed.
- Chromium: **2,103 passed**, 0 failed.
- JavaScriptCore: **2,103 passed**, 0 failed.
- Focused UTC Promise/generator/module Test262: **4 passed**, 0 failed.
- Portable Test262 fixtures: **17 passed**, 0 failed, 1 expected skip.
- Generated selection: **14,107 paths across 58 groups**, current.
- Type checking, lint, formatting, vendor/generated CI/Unicode drift,
  repository invariants, `git diff --check`, and benchmark smoke passed.

No broad upstream Test262 command was run locally.

## Deep module evaluation closure

The final maximum-capability review of `86c0f4a` found one Important remaining
host-stack dependency: module dependency evaluation recursively called
`evaluateModuleRecord`. A valid 2,400-module chain could consume the host stack,
leak a host `RangeError`, roll records back to `unevaluated`, and execute the
leaf twice after retry.

The defect was reproduced RED-first. Exact implementation commit `bb6f0f9`
replaces recursive dependency evaluation with an explicit source-order frame
stack while preserving SCC back edges, external deferral, abrupt completion,
host-error rollback, and completed-body state. The regression verifies a
2,400-module chain completes, catches guest recursion, and executes its leaf
exactly once across retry.

Scoped review found repeated abrupt completion of one SCC could become cubic.
A second RED regression measured 4,161 Set additions for a 64-module abrupt
cycle. Completion is now deduplicated by SCC root and each SCC is marked once;
the bounded-work regression passes below 1,000 additions. Scoped re-review's
only follow-up was a missing test JSDoc type annotation.

Fresh exact-commit evidence:

- Node: **2,264 passed**, 0 failed.
- Chromium: **2,120 passed**, 0 failed.
- JavaScriptCore: **2,120 passed**, 0 failed.
- Focused UTC Promise/generator/module Test262: **4 passed**, 0 failed.
- Portable Test262 fixtures: **17 passed**, 0 failed, 1 expected skip.
- Generated selection: **14,107 paths across 58 groups**, current.
- Repository invariants/workflow contracts: **69 passed**, 0 failed.
- Type checking, lint, formatting, vendor/generated CI/Unicode drift,
  exclusions, `git diff --check`, and clean-tree benchmark smoke passed.

No broad upstream Test262 command was run locally.

## Exact-head milestone review closure

The maximum-capability review of evidence-bearing head `b065d4d` found four
additional Important boundary defects:

- recursion crossing multiple Realms on one Agent did not participate in
  aggregate stack accounting;
- star-export cycle tracking keyed only modules rather than
  `(module, exportName)` pairs;
- custom AST `const` declarations could omit initializers outside for-in/of
  heads;
- exclusion policy paths could escape the pinned Test262 checkout before the
  runner's path validation.

All four were reproduced RED-first and fixed in exact commit `473b247`.
Cross-Realm calls now retain caller/callee Realm identity for aggregate stack
accounting, export resolution uses interned module/name pairs, custom `const`
validation is placement-sensitive, and exclusion paths/prefixes are rejected
unless they are canonical portable repository paths before any host read.

Full-host validation exposed four stale namespace tests that encoded the old
module-only star-cycle result. The pinned renamed-star-cycle semantics resolve
that graph to `D.y`; those tests now cover successful namespace creation,
named imports, caching, and evaluation. A separate graph with a competing
`E.x` binding proves ambiguity still rejects linking. Scoped re-review found
only one stale unused test import; after its removal there was no unresolved
Critical or Important finding.

Fresh exact-commit evidence:

- Node: **2,262 passed**, 0 failed.
- Chromium: **2,118 passed**, 0 failed.
- JavaScriptCore: **2,118 passed**, 0 failed.
- Focused UTC Promise/generator/module Test262: **4 passed**, 0 failed.
- Portable Test262 fixtures: **17 passed**, 0 failed, 1 expected skip.
- Generated selection: **14,107 paths across 58 groups**, current.
- Repository invariants/workflow contracts: **69 passed**, 0 failed.
- Type checking, lint, formatting, vendor/generated CI/Unicode drift,
  exclusions, `git diff --check`, and clean-tree benchmark smoke passed.

No broad upstream Test262 command was run locally.

## Final four-finding review wave

The repeated maximum-capability review found four remaining runtime/parser
contract gaps:

- native evaluation failures could preserve a guest- or host-created
  `ModuleLoaderError` and spoof evaluation provenance;
- custom AST declaration validation missed nested declaration conflicts;
- linking validated the current module before earlier dependencies;
- deleting a generator's inherited `@@toStringTag` exposed a nonstandard
  `"Generator"` fallback class.

All four were reproduced RED-first. Evaluation now wraps unexpected native
failures at the active `evaluate` boundary, linking descends through requested
modules in source order before current-module validation, and generators use
the ordinary `"Object"` fallback class.

Custom AST declaration validation now performs one iterative pass per variable
scope. It covers block and switch lexical declarations, function-body
lexical/var and parameter conflicts, catch parameters, and lexical loop heads
without crossing nested function boundaries. Review-driven regressions preserve
sloppy Annex B repeated ordinary block/switch functions, including labelled
forms, while strict and mixed lexical collisions still reject. A bounded-work
regression reduced the nested-scope worklist from more than 73,000 pushes to
below 10,000 for the fixed fixture.

The exact implementation commit is
`a516e84`. Three scoped review rounds found and closed the initial quadratic and
incomplete traversal, function-body/Annex B semantics, and labelled-function
classification findings. The final scoped review returned no Critical or
Important finding.

Fresh exact-commit evidence:

- Node: **2,258 passed**, 0 failed.
- Chromium: **2,114 passed**, 0 failed.
- JavaScriptCore: **2,114 passed**, 0 failed.
- Focused UTC Promise/generator/module Test262: **4 passed**, 0 failed.
- Portable Test262 fixtures: **17 passed**, 0 failed, 1 expected skip.
- Generated selection: **14,107 paths across 58 groups**, current.
- Repository invariants/workflow contracts: **69 passed**, 0 failed.
- Type checking, lint, formatting, vendor/generated CI/Unicode drift,
  exclusions, `git diff --check`, and clean-tree benchmark smoke passed.

No broad upstream Test262 command was run locally.

## Whole-milestone review follow-up

The maximum-capability GPT-5.6-family review of exact candidate `513ffff` found
two Important module-loader defects and one Minor documentation mismatch.

### Sequential link retry

`ModuleLoader#loadAndEvaluate` cached a `ModuleLoaderError` from failed linking
in `linkErrors`. This contradicted the published transaction contract: parsed
records survive link rollback, but each later sequential request must retry
linking. The cache is removed. `evaluationInFlight` still deduplicates concurrent
callers, and the evaluator's permanent completion state still enforces
at-most-once module execution.

RED: the public namespace-link regression observed the same error and cause
objects on two sequential calls.

GREEN: sequential calls now receive distinct retried link failures, while
concurrent calls still receive one identical failure.

### Host error boundary

The shared `asModuleLoaderError` helper preserved any instance of the public
error class. A host hook could therefore throw an `evaluate`-phase
`ModuleLoaderError` from inside `resolve` or `load` and escape with the wrong
phase and identifier.

The host boundaries now always create a new phase-correct error and retain the
host value as `cause`. Source validation and parsing have explicit phase
boundaries, so internal parse errors no longer depend on a broad outer catch.

RED: host-thrown error values escaped by identity with phase `evaluate`.

GREEN: resolve and load produce new phase-correct errors with the original host
error as `cause`.

### Promise species documentation

`docs/conformance.md` and `docs/limitations.md` now agree with the implemented
Promise species constructor behavior: four well-known-symbol protocols are
honored and seven remain deferred.

### Verification

The exact fix commit is `c2042232e21833cad89e39e9b95afb6df272d36b`. Fresh
scoped review found no significant issues.

- Node: **2,248 passed**, 0 failed.
- Chromium: **2,104 passed**, 0 failed.
- JavaScriptCore: **2,104 passed**, 0 failed.
- Focused UTC Promise/generator/module Test262: **4 passed**, 0 failed.
- Portable Test262 fixtures: **17 passed**, 0 failed, 1 expected skip.
- Type checking, lint, formatting, generated/invariant checks, `git diff
  --check`, and clean-tree benchmark smoke passed.

No broad upstream Test262 command was run locally.
