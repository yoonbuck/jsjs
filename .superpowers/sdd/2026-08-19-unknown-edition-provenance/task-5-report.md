# Task 5 Report — Unknown-edition provenance repository wiring

## Status
- Complete locally on branch `yoonbuck-issue-75-provenance-ledger` against base `d186d1d529710b97c232ae67d578627bf0a70045`.
- Task 5 repository/workflow/docs wiring is implemented.
- Additional root-cause fixes were required in the Task 4 provenance/audit/test cluster so the exact safe validation could pass `npm run typecheck`, `npm run lint`, and `npm run format`.

## Commits
- `Enforce provenance foundation in CI`

## RED evidence
- Command:
  - `node test/run-node.js test/node/repository-invariants.test.js test/node/workflow-contract.test.js`
- Result before implementation:
  - failed for missing provenance scripts in `package.json`
  - failed for missing `test/node/es2015-provenance.test.js` registration in `test/run-node.js`
  - failed because `tools/test262/es2015-provenance.json` was not treated as generated-owned
  - failed because generated CI did not run provenance check before taxonomy audit

## GREEN evidence
- Focused contract validation passed:
  - `TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js test/node/es2015-taxonomy.test.js test/node/repository-invariants.test.js test/node/workflow-contract.test.js && npm run ci:check`
- Full exact safe validation passed fresh:
  - `TZ=UTC npm run test262:es2015:provenance:check && TZ=UTC npm run test262:es2015:audit:check && node test/run-node.js test/node/es2015-provenance.test.js test/node/es2015-taxonomy.test.js test/node/repository-invariants.test.js test/node/workflow-contract.test.js && npm run vendor:check && npm run ci:check && npm run typecheck && npm run lint && npm run format && git diff --check`

## Generated workflow proof
- `.github/workflows/ci.yml` was regenerated from `tools/ci/pipeline.js` via `npm run ci:generate`.
- `npm run ci:check` passes.
- `test/node/workflow-contract.test.js` now proves the pinned Test262 job runs `npm run test262:es2015:provenance:check` immediately before `npm run test262:es2015:audit:check` and broad upstream execution.

## Safe commands and results
- `TZ=UTC npm run test262:es2015:provenance:check` — passed
- `TZ=UTC npm run test262:es2015:audit:check` — passed; remains metadata/hash-only
- `node test/run-node.js test/node/es2015-provenance.test.js test/node/es2015-taxonomy.test.js test/node/repository-invariants.test.js test/node/workflow-contract.test.js` — passed
- `npm run vendor:check` — passed
- `npm run ci:check` — passed
- `npm run typecheck` — passed after JSDoc/type fixes in provenance/audit/test files
- `npm run lint` — passed
- `npm run format` — passed
- `git diff --check` — passed

## Taxonomy count
- Unknown-edition base ledger remains unchanged at `2,312` roots / `4,054` variants (`tools/test262/es2015-provenance.json` `baseLedger.rootCount` and `baseLedger.variantCount`).
- U0 remains the zero-decision batch in docs/contracts; no decision-fragment content was changed.

## No-production diff proof
- `git --no-pager diff --name-only d186d1d529710b97c232ae67d578627bf0a70045 -- src tools/test262/features.json tools/test262/upstream-subset.json tools/test262/es2015-provenance-decisions`
- Result: no output.
- Changed paths are limited to workflow/docs/package/tests/provenance-tooling integration files plus the provenance/audit/test typing fixes required for safe validation.

## Self-review
- Confirmed no `src/` changes.
- Confirmed no `features.json`, selection manifest, or provenance decision-fragment changes.
- Confirmed the workflow file matches the generator.
- Confirmed docs now state immutable base/batch identities, U0 empty-decision behavior, strict-vs-draft review behavior, targeted-only local policy, exact provenance scripts, and exact local prohibitions.
- Confirmed Node suite registration and repository invariants cover the new provenance contracts.

## Concerns
- Local validation used an ignored symlink `vendor/test262 -> /Users/jordan/.copilot/session-state/a53ed448-8385-41f7-baa6-9a61ebd71c83/files/test262-history` exactly as permitted for metadata-only local checks; it is not committed.
