# Task 7 Report

## Scope

- Added a shared test-only `HostileExotic` with all twelve Table 5 methods.
- Added direct, semantic, public-abrupt, iterator, cross-Realm/Agent, and
  50,000-link hostile-boundary proofs.
- Extended `tools/invariants/object-contract.js` with
  `findObjectContractBypasses(file, source, allowlist)` and narrow source
  allowlists.

## RED Evidence

```sh
node test/run-node.js test/object-internal-method-contract.test.js && \
node test/run-node.js test/node/repository-invariants.test.js
```

Initially failed because the seeded invariant tool did not export
`findObjectContractBypasses`. Focused RED proofs also exposed missing
source-detector handling for slot/destructuring, aliases, computed keys,
callback provenance, and terminal shadowing.

## Verification

Passed:

```sh
node test/run-node.js test/object-internal-method-contract.test.js
node test/run-node.js test/node/repository-invariants.test.js
npm run typecheck
ESLINT_USE_FLAT_CONFIG=true ./node_modules/.bin/eslint \
  tools/invariants/object-contract.js test/node/repository-invariants.test.js \
  test/object-internal-method-contract.test.js test/stack-overflow.test.js \
  test/harness/hostile-exotic.js
./node_modules/.bin/prettier --check \
  tools/invariants/object-contract.js test/node/repository-invariants.test.js \
  test/object-internal-method-contract.test.js test/stack-overflow.test.js \
  test/harness/hostile-exotic.js
git diff --check
```

The four focused 50,000-link hostile proofs pass.

## Known Baseline Concern

The exact Task 7 GREEN command exits 1 only in
`test/stack-overflow.test.js` for these four pre-existing Node v20.20.2
failures:

- recursive yield delegation guest-catchability
- generator-backed `for-of` recursion
- mutual yield delegation across shared-Agent Realms
- mutual yield delegation across Agents

They reproduced unchanged at base
`84ef84f2b99193ae90c2ee9307124da082e325a2`; all Task 7 stack proofs pass.

## Reviews

- Hostile-coverage specification review: no remaining findings after the
  ES2015-correct exotic prototype-boundary adjustment.
- Invariant-quality review: all confirmed in-scope findings were fixed and
  re-reviewed with no remaining findings.
