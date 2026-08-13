# Performance Architecture Release Design

## Context

Issue #46 is the integration task for the performance milestone in issue #29.
Its prerequisites are complete on `origin/main` at
`9ee337ac364b625195c21421f26d658b683c43dc`:

- #44 / PR #48 added the reproducible Node, Chromium, and JSC benchmark harness.
- #39 / PR #50 published checksum-correlated CPU and allocation profiles.
- #40 / PR #52 accepted the execution-architecture ADR and merged the
  allocation-free identifier-read path.
- #42 / PR #54 merged the object/property/array hot paths after exact-current-base
  comparison and final review.

The remaining release gap is durable integration evidence. The repository has
the architecture ADR and detailed profiling history, but the committed profiling
document ends with an older rebaseline. The authoritative final comparison for
PR #54 is the exact
`5a196855584f0d916508cfaca7e5444b572f0f02` baseline against candidate
`6be14d8a3414e072391cdeb5c9af2a8b35a38807`. That evidence must be published
without rewriting the machine result:
`acceptance.gateReady === true` and `acceptance.accepted === false`.

## Decision

Add a focused `docs/performance-release.md` document and link it from the
README. Keep `docs/profiling.md` as the detailed historical and attribution
record rather than appending another long narrative to it.

The release document will be the concise milestone baseline:

1. Identify the integrated components and their exact merge commits.
2. Link the accepted architecture decision and profiling history.
3. Publish the exact final PR #54 comparison methodology and source SHAs.
4. Show every target cell, including statistically unproven cells.
5. Show host and all-host aggregates, the zero non-target-regression conclusion,
   and both acceptance booleans.
6. Record raw-artifact locations, audit counts/checksums, rejected-attempt
   quarantine, and reproducibility limits.
7. Separate the comparator's machine verdict from the owner's merge-policy
   adjudication.
8. Record the release validation used to close #46 and #29.

No benchmark recapture is part of this release. A post-merge recapture would not
replace the authoritative candidate comparison and would introduce a new
machine-noise sample. No runtime behavior, benchmark algorithm, threshold,
parser, target, or acceptance predicate changes are in scope.

## Evidence Contract

The final comparison remains a six-pair, counterbalanced, full-workload capture:

- exact baseline and candidate SHAs as stated above;
- three baseline-first and three candidate-first rounds;
- 12 unique run IDs and 504/504 matching result checksums;
- unchanged object-properties and arrays targets across Node, Chromium, and JSC,
  in cold and steady modes;
- seed `420042` and 20,000 paired-bootstrap resamples;
- per-cell paired median log ratio, deterministic paired-bootstrap interval,
  exact two-sided sign test, and empirical self-difference noise envelope;
- all target rows, aggregate rows, warnings, and non-target conclusions shown
  without suppressing within-noise or underpowered results;
- `acceptance.gateReady === true`;
- `acceptance.accepted === false`.

The release document will preserve the promoted raw timing/profile roots and
external audit-artifact provenance from the final PR #54 evidence package. It
will identify quarantined invalid attempts as excluded rather than deleting or
silently replacing them. Profiles remain attribution-only sampled evidence;
profile capture windows are not wall-time measurements.

## Validation and Review

Because the release change is documentation-only, it does not need a new
behavioral test. Combined current-main validation will use the smallest
repository commands that exercise the integrated surfaces:

- targeted portable suites for identifier reads and object/array hot paths on
  Node, Chromium, and JSC;
- benchmark comparison and profile-analysis unit suites;
- benchmark smoke;
- typecheck, lint, format, workflow drift, and vendor integrity;
- targeted upstream Test262 only if generated artifacts or conformance-facing
  behavior changes; any such command runs with `TZ=UTC`.

Broad pinned Test262 and the complete cross-runtime matrix are delegated to the
existing CI workflow rather than duplicated locally. A task-scoped specification
review checks the document against this evidence contract, and a max-capability
whole-branch review gates merge.

## Release Flow

1. Commit the approved specification.
2. Implement the release document and README link in a fresh task session.
3. Run task-scoped specification and quality reviews; fix and re-review until
   both approve.
4. Validate locally and push the branch.
5. Open a PR that closes #46 and links parent #29.
6. While CI runs, independently audit evidence provenance, issue relationships,
   and closure conditions.
7. Require all CI checks and the final whole-branch review to pass.
8. Squash-merge the PR and delete its branch.
9. Close #46, then close #29 only after confirming every child and every parent
   acceptance criterion is satisfied.

## Alternatives Rejected

### Append to `docs/profiling.md`

This would mix the release decision into an already long sequence of historical
and superseded captures, making the current milestone baseline harder to find.

### Recapture after merge

This would compare a different source identity and noise sample. It cannot
replace the exact final candidate comparison and is unnecessary for integration.

### Change the comparator verdict

The owner approved merge under a policy adjudication, not by changing the
measurement. Converting `acceptance.accepted` to `true`, hiding the eight target
cells that did not exceed their empirical envelopes, or describing the aggregate
as a machine-accepted result would falsify the evidence.
