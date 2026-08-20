# ES2015 Provenance Foundation Maintenance Design

## Goal

Repair the deterministic U* issue-body contract and add one persistent,
fail-closed `foundation-maintenance` range profile without changing guest
runtime behavior, taxonomy classifications, selection data, or any provenance
decision.

The maintenance pull request uses this exact marker:

```text
<!-- es2015-provenance-pr parent:T1 parent-issue:75 profile:foundation-maintenance base-ledger-sha256:56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc -->
```

## Body Contract

The shared renderer emits this exact sentence in every U0, UA, UB, UL,
UL1-UL4, US, and US1-US7 initial and final body:

```text
History, age, path/directory, and source/text similarity may prioritize review but can never decide edition.
```

The sentence replaces the narrower history-only statement. The U0 scope value
does not carry terminal punctuation because the renderer owns the final period.
Tests render all sixteen codes both without and with the authoritative issue
map, require the exact sentence, and reject any doubled period.

## Range Authority

Range authorization must not come from a profile introduced or broadened by
the range head.

For this first bootstrap only, the checker accepts a base when both identities
are exact:

- U0 squash commit:
  `8d75b48af2ee7ab04e7c5006980417227ec34568`
- canonical U0 provenance-manifest SHA-256:
  `ad3e55a061f1156fc267655ac8cb977f6a54f934cc56a5efa5689c7fc620ae04`

That exact base receives a compiled bootstrap maintenance policy. The head
manifest must then contain the same approved `foundation-maintenance` profile.
No other base lacking that profile is accepted.

After this pull request merges, the checker parses the canonical manifest from
the trusted base tree, verifies the fixed jsjs taxonomy baseline and immutable
2,312-root / 4,054-variant ledger identities, and uses that base manifest's
`foundation-maintenance` profile to authorize the range. A changed head
profile can affect only a later pull request after review and merge.

The existing `foundation` profile and all thirteen `decision:<CODE>` profiles
remain byte-for-byte unchanged. Foundation creation still requires a base
without the initialized manifest. Decision ranges still require an unchanged
manifest and exactly one complete reviewed fragment. Unknown profiles are
rejected rather than resolved from the head manifest.

## Maintenance Profile

The schema version remains 2 because no manifest object shape changes. The new
profile has `baseFoundation: "present"`, no required individual path, no
deletions, no decision fragment, and all thirteen decision fragments in
`emptyDecisionFragments`.

Its exact allowed paths are:

- `.github/workflows/ci.yml`
- `docs/conformance.md`
- `docs/superpowers/plans/2026-08-19-unknown-edition-provenance.md`
- `docs/superpowers/plans/2026-08-20-provenance-foundation-maintenance.md`
- `docs/superpowers/specs/2026-08-19-unknown-edition-provenance-design.md`
- `docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md`
- `docs/testing.md`
- `test/node/es2015-provenance.test.js`
- `test/node/workflow-contract.test.js`
- `tools/ci/pipeline.js`
- `tools/test262/es2015-provenance-check.js`
- every existing `tools/test262/es2015-provenance-decisions/<CODE>.json`
- `tools/test262/es2015-provenance.js`
- `tools/test262/es2015-provenance.json`

This list permits provenance foundation tooling, schema, tests, canonical
generated artifacts, workflow contract, and directly related documentation
only. It excludes `src/**`, `tools/test262/features.json`,
`tools/test262/upstream-subset.json`, taxonomy classification output, audit
output, package configuration, unrelated documentation, and every other path.
All ranges reject renames, copies, deletions, unknown statuses, repeated paths,
and an empty diff. Content validation requires every decision fragment to
remain canonical and empty, including fragments that are not changed.

The generated workflow command remains unchanged. It supplies the actual
pull-request base SHA, head SHA, event name, and full body; the checker derives
the unique profile from the marker.

## Testing

TDD starts with failing tests for:

- all sixteen initial and final bodies carrying the exact full prohibition;
- every rendered body containing no doubled period;
- the exact maintenance profile and unchanged foundation/decision profiles;
- an allowed bootstrap maintenance range;
- an allowed post-bootstrap range authorized by the base profile;
- forbidden `src`, feature, upstream-selection, taxonomy-output, non-empty
  fragment, rename, copy, delete, unknown marker/profile, and foundation-profile
  reuse ranges;
- bootstrap rejection for the wrong base commit or wrong U0 manifest bytes;
- proof that a broadened head profile cannot authorize a path absent from the
  trusted base profile; and
- unchanged workflow derivation from actual event base/head/body values.

Structural checks also retain zero decisions and the exact 2,312 / 4,054 path
and entry identities.

## Review and Release

Only the permitted focused Node suites and structural provenance/audit,
vendor, generated-CI, typecheck, lint, format, diff, and live
`foundation-maintenance` range checks run locally. Broad upstream, audit write,
`ci:contract`, browser, and JavaScriptCore commands remain prohibited locally.

Independent specification and quality/provenance reviews must clear all
Critical and Important findings. The pull request must pass the exact
`ci.yml` pull-request run and two clean pull-request CodeQL analyses at an
unchanged reviewed head. After squash merge, the exact main commit must pass
two clean CodeQL analyses with zero alerts, and origin/main bytes must match the
reviewed result.
