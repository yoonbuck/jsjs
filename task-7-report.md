# Task 7 Report

## Scope

- Added a shared test-only `HostileExotic` with all twelve Table 5 methods.
- Added direct, semantic, public-abrupt, iterator, cross-Realm/Agent, and
  50,000-link hostile-boundary proofs.
- Extended `tools/invariants/object-contract.js` with
  `findObjectContractBypasses(file, source, allowlist)` and narrow source
  allowlists.
- Remediated review finding C1 without changing the approved Table 6 terminal
  rule.

## RED Evidence

```sh
node test/run-node.js test/stack-overflow.test.js
```

At `5ae46a24554cd4fdef97feb0ee11d06ae36ad356` on Node `v20.20.2`, this
exited `1` with exactly these host `RangeError` escapes:

- `the default limit makes recursive yield delegation guest-catchable`
- `the default limit contains generator-backed for-of recursion`
- `the default limit contains mutual yield delegation across shared-Agent Realms`
- `the default limit contains mutual yield delegation across Agents`

Artifact: `.superpowers/issue-79/red/task-7-c1-current/stack-overflow.txt`.

A focused RED test, `iterator Table 6 dispatch accounts for its helper frame
on an active generator chain`, also exited `1` with
`Expected function to throw GuestErrorSignal`.

Artifact:
`.superpowers/issue-79/red/task-7-c1-current/iterator-dispatch-accounting-red.txt`.

## C1 Root Cause and Fix

Task 6 changed `iteratorNextWithMethod` from a direct `callFunction` to the
required `callCallable` Table 6 dispatch. The new helper adds one persistent
host frame for every recursively nested iterator call, but that frame was not
charged to an active generator host chain. The guest stack guard could
therefore lose to Node's host stack before it raised a guest `RangeError`.

`iteratorNextWithMethod` now reserves one generator-host-chain frame around
the required `callCallable` terminal and releases it in `finally`. It does not
catch or relabel host errors, change stack limits, or add another Table 6
terminal. The focused test creates a two-frame active chain and proves the
unaccounted helper frame now produces the expected `GuestErrorSignal` and
fully unwinds.

## Verification

The exact Task 7 GREEN command:

```sh
node test/run-node.js test/object-internal-method-contract.test.js && \
node test/run-node.js test/stack-overflow.test.js && \
node test/run-node.js test/node/repository-invariants.test.js
```

exited `0`: **221 passed, 0 failed**. This includes the entire stack suite,
all four former generator-recursion failures, the object-contract suite, and
the repository invariant suite. Artifact:
`.superpowers/issue-79/green/task-7-c1/task-7-green.txt`.

Additional current-worktree checks all exited `0`:

```sh
npm run typecheck
npm run lint
npm run format
git diff --check
```

No Test262, benchmark (including all-host), or main reconciliation/provenance
command was run.

## Commit and Current State

- Current pre-fix commit / FIX_BASE:
  `5ae46a24554cd4fdef97feb0ee11d06ae36ad356`
- Prior regression interval: `198bee668b50d372cb5bbbb661452fedd5053e33..84ef84f2b99193ae90c2ee9307124da082e325a2`
- Production change: `src/runtime/iterator.js`
- Regression coverage: `test/stack-overflow.test.js`

## Reviews

- Hostile-coverage specification review: no remaining findings after the
  ES2015-correct exotic prototype-boundary adjustment.
- Invariant-quality review: all confirmed in-scope findings were fixed and
  re-reviewed with no remaining findings.
- C1 is no longer classified as a baseline concern; the required GREEN command
  is now fully green.
