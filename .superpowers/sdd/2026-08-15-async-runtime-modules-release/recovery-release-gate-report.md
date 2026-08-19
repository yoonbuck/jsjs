# Recovery release gate report

## Disposition

- Status: **FINAL REVIEW FIX COMPLETE; WHOLE-MILESTONE RE-REVIEW PENDING**
- Recovered candidate:
  `5a9db65e17a8b46f9e20880d902b1bca398f2863`
- Current `origin/main`:
  `5326cc6e0753087db34df4b5d8c637902f57fb88`
- Merge base:
  `5326cc6e0753087db34df4b5d8c637902f57fb88`
- Scope: recover the preserved #61 candidate, avoid repeated broad local
  Test262, prove focused release behavior, and identify only genuinely missing
  PR/CI/post-merge gates.

## Reconciliation

After `git fetch origin --prune`, current `origin/main` was the candidate's
exact merge base. The worktree was clean. No merge, rebase, conflict
resolution, or reconciliation commit was required.

The candidate retains the reviewed #66 module-capability and early-error
semantics merged at `5326cc6e0753087db34df4b5d8c637902f57fb88`, the #67
receiver-aware `[[Set]]` semantics already present in that main history,
generated UTC conformance evidence, CodeQL cleanup, and the intentionally
non-extractable fixture names:

- `test/fixtures/test262/test/parse-negative.js.txt`
- `test/fixtures/test262/malformed/negative-without-type.js.txt`

## Fresh focused validation

All commands were run with the repository's pinned dependencies and vendored
Acorn restored through `npm ci`.

| Gate | Result |
| --- | --- |
| Targeted affected Node suites | 559 passed, 0 failed |
| Targeted affected Chromium suites | 634 passed, 0 failed |
| Focused UTC Promise/generator/module Test262 | 4 passed, 0 failed |
| Portable Test262 fixtures | 17 passed, 0 failed, 1 expected skip |
| Generated Test262 selection check | 14,107 paths across 58 groups |
| TypeScript JSDoc check | passed |
| ESLint | passed |
| Prettier | passed |
| Vendor/generated CI/Unicode drift checks | passed |
| Repository invariants and workflow contracts | passed |
| `git diff --check` | passed |
| Node benchmark smoke | passed |

The focused Node and Chromium selections covered the final parser, custom
module, cross-Agent stack, Promise, generator, module-loader/linker/namespace,
integration, Test262 runner, repository invariant, workflow contract, and
upstream-selection suites.

The fixture adapter executed `test/parse-negative.js.txt` in non-strict and
strict variants. The runner regression also read and classified
`malformed/negative-without-type.js.txt`, while asserting that neither fixture
has a `.js` extraction suffix.

## Recovered exact-candidate host evidence

The final origin-main blocker report, committed with the final runtime fix at
`5a9db65e17a8b46f9e20880d902b1bca398f2863`, records:

- Node: 2,238 passed, 0 failed.
- Chromium: 2,095 passed, 0 failed.
- JavaScriptCore: 2,095 passed, 0 failed.
- Focused pinned module Test262: 2 passed, 0 failed.
- Test262 adapter fixtures: 17 passed, 0 failed, 1 expected skip.

JavaScriptCore has no focused suite selector. Because the exact-candidate full
portable JSC registry was already recorded, recovery did not duplicate that
expensive run.

## Test262 policy

No broad upstream Test262 command was run locally. In particular, recovery did
not invoke `test262:upstream`, `test262:upstream:check`, or `ci:contract`.
The broad pinned Test262 subset and full JavaScriptCore registry remain
authoritative in GitHub CI.

## Remaining gates

The final origin-main blocker fix received a fresh scoped review with no
significant issues. The first maximum-capability GPT-5.6-family whole-milestone
review found three Important and two Minor issues; all five were fixed
RED-first in `193902bff5899d8a9752e0579ef4a43da4d85305` and are documented in
`whole-milestone-review-fix-report.md`.

The scoped re-review of that fix wave was clean. The repeated
maximum-capability review closed all five findings and found one Important
Acorn shared-empty-array compatibility defect. That defect was fixed RED-first
in `dc4d814cfc3126f9e7b4f06b5093e13a9cce979f`.

The candidate still requires:

1. a clean repeated maximum-capability whole-milestone review on exact head
   `3b926e1d4d0c6ba73d20c9a7a33fd888aa9ec4a2`;
2. a focused release PR and successful exact-head `ci.yml` pull-request run;
3. squash merge and exact-main CodeQL default-setup evidence for both
   `javascript-typescript` and `actions`, with zero alerts and zero
   extraction/parse diagnostics; and
4. a fresh child/criteria audit before closing #61, #28, and #24.

## Final review-fix wave

The parser fix received a clean scoped review. The next maximum-capability
whole-milestone review found three remaining issues:

- the default Node test graph imported checkout-dependent Test262 execution
  code;
- inherited cross-Agent `@@toPrimitive` and `@@toStringTag` lookups used the
  caller Agent's physical symbols;
- root Test262 identifiers and URL-stripped control whitespace were not
  rejected before host reads.

All three were reproduced RED-first and fixed in
`3b926e1d4d0c6ba73d20c9a7a33fd888aa9ec4a2`. Checkout pin validation now lives
in a checkout-independent helper, both protocols use semantic
`getWellKnownSymbol` lookup, and one portable path guard covers root tests,
nested modules, and harness includes.

The fresh scoped review found and closed two additional cases in the same path
boundary: URL scheme/drive-pipe identifiers and unvalidated metadata harness
includes. The final scoped re-review returned no significant issue.

Fresh exact-head local evidence:

| Gate | Result |
| --- | --- |
| Full Node suite | 2,247 passed, 0 failed |
| Full Chromium suite | 2,103 passed, 0 failed |
| Full JavaScriptCore suite | 2,103 passed, 0 failed |
| Focused UTC Promise/generator/module Test262 | 4 passed, 0 failed |
| Portable Test262 fixtures | 17 passed, 0 failed, 1 expected skip |
| Generated Test262 selection check | 14,107 paths across 58 groups |
| Static/generated/invariant checks | passed |
| Clean-tree benchmark smoke | passed |

No broad upstream Test262 command was run locally.

## Whole-milestone review follow-up

The maximum-capability review of `513ffff` found two Important loader contract
defects and one Minor documentation mismatch:

- sequential public link failures were cached instead of retrying the
  transaction against retained parsed records;
- host `resolve`/`load` hooks could throw the public `ModuleLoaderError` class
  and bypass boundary phase wrapping;
- the limitations text still counted Promise `@@species` as unimplemented.

The loader findings were reproduced RED-first. Sequential requests now retry
linking while concurrent callers still share `evaluationInFlight`; evaluation
success and abrupt completion remain permanently cached. Host-hook failures are
wrapped at the active `resolve` or `load` boundary even when their value is a
`ModuleLoaderError`, while internal parse/evaluation phase propagation remains
intact. The documentation now records four honored well-known-symbol protocols
and seven deferred ones.

The exact fix commit is
`c2042232e21833cad89e39e9b95afb6df272d36b`. Fresh scoped review returned no
significant issues.

Fresh affected and final host evidence:

- Node: **2,248 passed**, 0 failed.
- Chromium: **2,104 passed**, 0 failed.
- JavaScriptCore: **2,104 passed**, 0 failed.
- Focused UTC Promise/generator/module Test262: **4 passed**, 0 failed.
- Portable Test262 fixtures: **17 passed**, 0 failed, 1 expected skip.
- Static, generated, invariant, and benchmark gates: passed.

No broad upstream Test262 command was run locally. A clean repeated
whole-milestone review on the exact evidence-bearing head remains required
before push.

## Final runtime and parser closure

The next whole-milestone review found four remaining issues: evaluation error
provenance spoofing, current-before-dependency link validation, generator
fallback classification, and incomplete/quadratic custom-AST declaration
validation. Each was fixed RED-first in exact implementation commit `a516e84`.

The custom-AST fix received three scoped review rounds. It now analyzes each
variable scope once, preserves function boundaries and sloppy Annex B repeated
ordinary block/switch functions (including labelled forms), and rejects the
reviewed block, switch, function, catch, and loop declaration conflicts. The
final scoped review found no Critical or Important issue.

Fresh exact-commit local evidence:

| Gate | Result |
| --- | --- |
| Full Node suite | 2,258 passed, 0 failed |
| Full Chromium suite | 2,114 passed, 0 failed |
| Full JavaScriptCore suite | 2,114 passed, 0 failed |
| Focused UTC Promise/generator/module Test262 | 4 passed, 0 failed |
| Portable Test262 fixtures | 17 passed, 0 failed, 1 expected skip |
| Generated Test262 selection check | 14,107 paths across 58 groups |
| Repository invariants and workflow contracts | 69 passed, 0 failed |
| Static/generated/exclusion checks | passed |
| Clean-tree benchmark smoke | passed |

No broad upstream Test262 command was run locally. A maximum-capability
whole-milestone review of the exact evidence-bearing candidate remains required
before push.

## Exact-head review closure

The maximum-capability review of `b065d4d` found four Important issues:
same-Agent cross-Realm recursion accounting, module-only star-cycle tracking,
missing custom-AST `const` initializers, and noncanonical Test262 exclusion
paths before direct reads. Each was fixed RED-first in `473b247`.

The star-cycle correction also replaced four stale namespace failure tests with
the pinned successful renamed-cycle behavior while retaining an explicit
ambiguity rejection graph. Scoped review found only a stale unused test import;
after removal, no Critical or Important finding remained.

Fresh exact-commit local evidence:

| Gate | Result |
| --- | --- |
| Full Node suite | 2,262 passed, 0 failed |
| Full Chromium suite | 2,118 passed, 0 failed |
| Full JavaScriptCore suite | 2,118 passed, 0 failed |
| Focused UTC Promise/generator/module Test262 | 4 passed, 0 failed |
| Portable Test262 fixtures | 17 passed, 0 failed, 1 expected skip |
| Generated Test262 selection check | 14,107 paths across 58 groups |
| Repository invariants and workflow contracts | 69 passed, 0 failed |
| Static/generated/exclusion checks | passed |
| Clean-tree benchmark smoke | passed |

No broad upstream Test262 command was run locally. One final whole-milestone
review of the exact evidence-bearing head remains required before push.

## Deep-graph final review fix

The maximum-capability review of `86c0f4a` found recursive dependency
evaluation could exhaust the host stack on a valid deep graph, roll modules
back, and execute the leaf again on retry. Exact commit `bb6f0f9` replaces that
recursion with an explicit source-order evaluation stack.

The 2,400-module RED/GREEN regression now proves host-stack independence and
at-most-once leaf execution. Scoped review found and closed cubic repeated SCC
abrupt completion with a bounded-work regression; its only re-review follow-up
was a test type annotation.

Fresh exact-commit local evidence:

| Gate | Result |
| --- | --- |
| Full Node suite | 2,264 passed, 0 failed |
| Full Chromium suite | 2,120 passed, 0 failed |
| Full JavaScriptCore suite | 2,120 passed, 0 failed |
| Focused UTC Promise/generator/module Test262 | 4 passed, 0 failed |
| Portable Test262 fixtures | 17 passed, 0 failed, 1 expected skip |
| Generated Test262 selection check | 14,107 paths across 58 groups |
| Repository invariants and workflow contracts | 69 passed, 0 failed |
| Static/generated/exclusion checks | passed |
| Clean-tree benchmark smoke | passed |

No broad upstream Test262 command was run locally. One final exact-head
whole-milestone review remains required before push.
