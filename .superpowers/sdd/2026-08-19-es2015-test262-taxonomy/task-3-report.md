# Task 3 Report: Exact Passing-Root Promotion

## Status

Complete. Commit: `954a782053b628e635d9ee8e0fba550fd61905c2`.

## RED

Ran:

```sh
TZ=UTC node test/run-node.js \
  test/test262-runner.test.js \
  test/node/upstream-select.test.js \
  test/node/es2015-taxonomy.test.js
```

Observed RED: `ERR_MODULE_NOT_FOUND` for
`tools/test262/es2015-promotion.js`, proving the requested manifest/parser
interface did not exist. Follow-up RED cases also proved the absent
per-path upstream authorization and promotion-preserving selection helper.

## GREEN / Verification

- Required focused suite: passed.
- `TZ=UTC node test/run-node.js test/node/repository-invariants.test.js`:
  passed.
- `TZ=UTC node test/run-node.js test/ci/es2015-syntax-test262.test.js`:
  passed (only its small focused Test262 set).
- `TZ=UTC npm run test262:es2015:audit:check`: passed.
- `TZ=UTC npm run test262:select:check`: passed; reports 20,430 paths in
  59 groups.
- Targeted Prettier check and `git diff --check`: passed.

## Exact Ledger and Promotion

- Durable ledger:
  `/Users/jordan/.copilot/session-state/9ecdd2a4-fc88-4ed3-95a4-dc7cab7e1c0a/files/T0.paths.txt`
- Roots: 6,323; variants: 11,955.
- Ledger SHA-256: `3f2c617b8639c8048afb1a42b95218250b20b6d51b9313f39473b4ddc1c7c646`.
- Pre-promotion taxonomy SHA-256:
  `ce05cbdf15ee3262651520f81ca7e904e021cd4dfcbb29d787b69b4f8f897e31`.
- Promotion manifest SHA-256:
  `a5f567e5f27981f943adfd116b8a88be7501f0f59763573ce9b701fae390c4ac`.
- Dependency closure: 7,403 metadata edges, 179 transitive include edges,
  36 unique reviewed ES2015/neutral dependencies, and zero later/non-ES2015
  dependencies.
- The promotion group is exactly one
  `es2015/audit-passing-promotion` group with the ledger paths; pre-existing
  group structure is hash-checked unchanged.

## Exact Local Test262 Execution

Ran once:

```sh
TZ=UTC node tools/test262/es2015-audit.js \
  --paths-file=/Users/jordan/.copilot/session-state/9ecdd2a4-fc88-4ed3-95a4-dc7cab7e1c0a/files/T0.paths.txt \
  --write-execution
```

Exit status was zero. The exact evidence contains 11,955 records for all
6,323 promoted roots; every record passed. No broad upstream Test262 run was
performed locally.

## Taxonomy Movement

| Core status | Before roots/variants | After roots/variants |
| --- | ---: | ---: |
| selected-passing | 13,280 / 25,350 | 19,603 / 37,305 |
| audit-passing-unselected | 6,323 / 11,955 | 0 / 0 |
| blocked | 4,645 / 9,115 | 4,645 / 9,115 |
| intentional-deviation | 2 / 4 | 2 / 4 |
| core total | 24,250 / 46,424 | 24,250 / 46,424 |

The whole-tree partition remains 53,575 roots / 102,912 variants with
unchanged partition denominators.

## Feature Manifest

`tools/test262/features.json` SHA-256 before and after:

`ee10cc484226fbcc70950c4ce09fc601a827d1ce92fe40870f5e66c6656a7de2`

It was not modified.

## Files

- Added `tools/test262/es2015-promotion.js` and
  `tools/test262/es2015-promotion.json`.
- Updated the runner, audit CLI, upstream runner, and selection generator to
  validate immutable exact-path authorization and preserve the promotion group.
- Updated the subset and regenerated `tools/test262/es2015-taxonomy.json`.
- Added/updated focused runner, promotion, audit, and generated-selection
  tests, including the coupled syntax-selection contract.

## Self-Review

Reviewed the staged diff, deterministic ordering, immutable manifest objects,
ledger/group equality, dependency closure, generated taxonomy counts, feature
hash, no `src/` changes, and no broad feature-tag enablement. The runner
creates a fresh supported-feature list per file; promoted facts are validated
against pinned metadata and transitive `harness/features.yml` facts before
authorization.

## Concerns

No blocking concern. The broad `test262:upstream` report was intentionally not
run or regenerated locally; CI remains its owner under the task constraint.

## Fix Round 1

### Covering test

`ES2015 audit gives exact promotion evidence precedence over upstream selected
records` supplies failed promoted variants in the selected/upstream report and
passed variants for the same root in immutable exact audit evidence. It proves
the exact evidence is the source used for promoted records.

### RED / GREEN

- **RED:** `TZ=UTC node test/run-node.js test/node/es2015-taxonomy.test.js`
  failed with `ES2015 selected execution for test/language/audited.js must
  contain 2 records`, reproducing duplicate variants from the two sources.
- **GREEN:** promoted paths are excluded from upstream report selection; their
  exact audit evidence is added once. The focused taxonomy/promotion/upstream
  suite, audit generation/check, selection check, lint, and typecheck pass.
  Changed files pass Prettier; full `npm run format` remains blocked by the
  pre-existing untracked plan and generated promotion manifest.

### Files

- `tools/test262/es2015-audit.js`
- `test/node/es2015-taxonomy.test.js`
- `tools/test262/es2015-promotion.js`
- `test/node/upstream-select.test.js`
- `test/test262-runner.test.js`

### Commit

`a41128429ecc6baa3906708085378671880f9555`
