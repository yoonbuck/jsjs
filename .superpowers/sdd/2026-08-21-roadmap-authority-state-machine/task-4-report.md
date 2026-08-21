# Task 4 Report

## Status

Completed.

## Scope

Implemented Task 4 protected-output validation for roadmap authority consumption:

- BASE-derived markerless ownership for schema-v3 roadmap authorities
- aggregate protected-projection hashing
- exact/add/project protected-output enforcement
- artifact-specific taxonomy, audit-evidence, subset, ES5 selection, report, and conformance validators
- atomic integration into consumption validation

## Files Modified

- `tools/test262/es2015-provenance.js`
- `tools/test262/es2015-provenance-check.js`
- `test/node/es2015-provenance.test.js`

## What Changed

### `tools/test262/es2015-provenance.js`

- Exported roadmap protected-output helpers:
  - `PROVENANCE_RANGE_GATE_OWNER_PATHS`
  - `CLOSED_PROVENANCE_GENERATED_PATHS`
  - `roadmapProjectionSha256(path, authority)`
  - `roadmapAggregateProjectionSha256(authority)`
  - `roadmapOwnedPathsFromBaseManifest(manifest)`
- Extended exact BASE ownership derivation to cover:
  - gate-owner executable/runtime paths
  - decision fragments
  - roadmap evidence paths
  - roadmap protected outputs
  - closed generated Test262 artifacts

### `tools/test262/es2015-provenance-check.js`

- Installed production-default `validateRoadmapProtectedOutputs(...)` in checker dependencies.
- Added regular-file attestation via `git ls-tree` to reject symlinked protected outputs.
- Switched markerless schema-v3 range ownership from HEAD-derived/profile-wide behavior to:
  - trusted BASE-owned roadmap evidence/protected outputs
  - exact gate-owner paths
  - closed generated namespaces derived from BASE authority evidence prefixes
- Added protected-output scanning that rejects:
  - missing outputs
  - repeated outputs
  - rename/copy/delete of protected/generated paths
  - aliased/traversal paths into protected/generated namespaces
  - foreign protected outputs from other authorities
  - unknown generated files in closed namespaces
- Added artifact validators for:
  - `tools/test262/es2015-taxonomy.json`
  - `tools/test262/es2015-audit-evidence.json`
  - `tools/test262/upstream-subset.json`
  - `tools/test262/es5-selection.json`
  - `docs/test262-report.jsonl`
  - `docs/conformance.md`
- Completed atomic consumption integration so pending→applied succeeds only when:
  - every registered protected output changes exactly once
  - no foreign/unknown protected output is present
  - exact/add/project semantics all validate
  - the aggregate projection marker hash matches BASE authority data

### `test/node/es2015-provenance.test.js`

- Added RED→GREEN coverage for:
  - exported roadmap projection helpers and BASE-owned path derivation
  - schema-v3 markerless ownership across every P0/H0 protected output/evidence path
  - closed generated namespace rejection
  - aggregate H0 protected projection hash
  - artifact-specific projection validation
  - foreign/alias/symlink/unknown generated path rejection
  - atomic consumption success/failure with a synthetic roadmap authority fixture
- Added deterministic fixture builders for protected-output projection scenarios.

## RED Evidence

Initial focused RED run after adding Task 4 tests:

```text
TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js
```

Observed expected missing-feature failure before implementation:

- `SyntaxError: The requested module '../../tools/test262/es2015-provenance-check.js' does not provide an export named 'validateRoadmapProtectedOutputs'`

That confirmed Task 4 protected-output behavior was absent before production changes.

## GREEN Verification

Focused GREEN verification after implementation:

```text
TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js
./node_modules/.bin/eslint test/node/es2015-provenance.test.js tools/test262/es2015-provenance.js tools/test262/es2015-provenance-check.js
git --no-pager diff --check
```

Results:

- focused provenance suite: all `test/node/es2015-provenance.test.js` cases passed
- targeted ESLint: clean
- `git diff --check`: clean

## Notes

- No broad Test262, `ci:contract`, browser, or JavaScriptCore commands were run.
- The new projection validators are intentionally focused on roadmap-protected artifacts and do not broaden authorization to HEAD-owned paths.

## Concerns

None.
