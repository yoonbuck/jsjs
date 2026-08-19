# Recovery release gate report

## Disposition

- Status: **SECOND REVIEW FIX COMPLETE; RE-REVIEW PENDING**
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

1. scoped re-review of the parser fix and a clean repeated
   maximum-capability whole-milestone review on the resulting exact head;
2. a focused release PR and successful exact-head `ci.yml` pull-request run;
3. squash merge and exact-main CodeQL default-setup evidence for both
   `javascript-typescript` and `actions`, with zero alerts and zero
   extraction/parse diagnostics; and
4. a fresh child/criteria audit before closing #61, #28, and #24.
