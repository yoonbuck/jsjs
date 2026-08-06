# Test262 Coverage Reporting Design

## Goal

Keep README concise while reporting honest Test262 coverage against the entire
pinned suite, not only the selected subset.

## Design

The generated detailed JSON-lines report moves from an embedded README block to
`docs/test262-report.jsonl`. README keeps a compact conformance table and links
to the detailed report.

The upstream runner inventories every runnable JavaScript test file under the
pinned Test262 `test/` tree. It reports:

- total source files in the pinned suite
- selected source files attempted by the configured subset
- selected source files with all variants passing
- total expanded execution records after strict/non-strict/raw expansion
- attempted records, passed records, failed records, and skipped records
- attempted-file percentage, passing-file percentage, attempted-record
  percentage, and passing-record percentage

Percentages use the entire pinned suite as denominator. File percentages measure
source coverage. Record percentages measure executable variants, using metadata
expansion for every inventory file without executing unselected tests.

## Integration

The report generator writes deterministic JSONL and a small deterministic summary
artifact consumed by README synchronization. CI checks that generated artifacts
are current, uploads the detailed report, and prints the compact summary.

Malformed metadata encountered during whole-suite inventory is counted and
reported rather than silently excluded. Harness files and non-JavaScript assets
are excluded by the same selection rules used by the runner.

## Acceptance Criteria

- README no longer embeds the large per-test report.
- The detailed report lives under `docs/` and is reproducible.
- Coverage reports both source-file and expanded-record percentages.
- Denominators cover the entire pinned Test262 tree.
- Existing Node, JSC, and browser report equivalence remains intact.
