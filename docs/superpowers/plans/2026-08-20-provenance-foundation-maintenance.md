# ES2015 Provenance Foundation Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair every deterministic U* issue body and add a persistent, base-authorized `foundation-maintenance` range profile without changing any provenance decision or taxonomy identity.

**Architecture:** The pure provenance module owns the immutable schema profile and shared issue wording. The range CLI authorizes the bootstrap only from the exact U0 commit and manifest bytes, then authorizes every later maintenance range from the canonical base-tree profile before it reads mutable head policy. The existing generated workflow continues to supply trusted pull-request base, head, and body values unchanged.

**Tech Stack:** Node.js 20 ES modules, the repository's custom Node test harness, canonical JSON manifests, generated GitHub Actions YAML, Git, and GitHub CLI.

## Global Constraints

- Use marker `<!-- es2015-provenance-pr parent:T1 parent-issue:75 profile:foundation-maintenance base-ledger-sha256:56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc -->`.
- Bootstrap only from U0 squash `8d75b48af2ee7ab04e7c5006980417227ec34568` with canonical manifest SHA-256 `ad3e55a061f1156fc267655ac8cb977f6a54f934cc56a5efa5689c7fc620ae04`.
- Preserve schema version 2, zero decisions, taxonomy baseline `54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7`, 2,312 roots, 4,054 variants, and all immutable path and entry hashes.
- Preserve the existing `foundation` profile and all thirteen `decision:<CODE>` profiles byte-for-byte.
- Never change guest runtime, `src/**`, `tools/test262/features.json`, `tools/test262/upstream-subset.json`, taxonomy classification output, audit output, package configuration, or issue hierarchy.
- Never run broad upstream Test262, audit write mode, `ci:contract`, browser, or JavaScriptCore locally.
- Require independent specification and quality/provenance reviews, exact pull-request CI, two clean pull-request CodeQL analyses, squash merge, and two clean exact-main CodeQL analyses with zero alerts.

---

## File Structure

- Modify `tools/test262/es2015-provenance.js`: exact issue wording, immutable maintenance profile, and unchanged foundation/decision policies.
- Modify `tools/test262/es2015-provenance-check.js`: trusted-base bootstrap and persistent range authorization.
- Modify `tools/test262/es2015-provenance.json`: canonical generated profile entry only; ledger and fragment identities stay unchanged.
- Modify `test/node/es2015-provenance.test.js`: complete body and range-policy RED/GREEN coverage.
- Modify `test/node/workflow-contract.test.js` only if a regression assertion is needed; the workflow command itself stays unchanged.
- Modify `.github/workflows/ci.yml` and `tools/ci/pipeline.js` only if regeneration changes bytes; expected result is no change.
- Modify `docs/conformance.md`, `docs/testing.md`, `docs/superpowers/specs/2026-08-19-unknown-edition-provenance-design.md`, and `docs/superpowers/plans/2026-08-19-unknown-edition-provenance.md`: directly related persistent-profile and wording documentation.
- Create `docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md`: approved maintenance design.
- Create `docs/superpowers/plans/2026-08-20-provenance-foundation-maintenance.md`: this execution plan.

### Task 1: Deterministic Issue-Body Contract

**Files:**
- Modify: `test/node/es2015-provenance.test.js:2584-2921`
- Modify: `tools/test262/es2015-provenance.js:360-495,1150-1218`

**Interfaces:**
- Consumes: `renderProvenanceIssueBody(manifest, code, issueMap?)`.
- Produces: every initial/final body contains the exact full edition-evidence prohibition and no doubled period.

- [ ] **Step 1: Write the failing all-body regression**

Add a loop over every key in `WRAPPED_ISSUE_MAP.issues`. Render once without an
issue map and once with `WRAPPED_ISSUE_MAP`, then assert both bodies contain:

```js
const EDITION_EVIDENCE_PROHIBITION =
  'History, age, path/directory, and source/text similarity may prioritize review but can never decide edition.';

for (const code of Object.keys(WRAPPED_ISSUE_MAP.issues)) {
  for (const body of [
    renderProvenanceIssueBody(manifest, code),
    renderProvenanceIssueBody(manifest, code, WRAPPED_ISSUE_MAP),
  ]) {
    assertSame(body.includes(EDITION_EVIDENCE_PROHIBITION), true, code);
    assertSame(body.includes('..'), false, code);
  }
}
```

- [ ] **Step 2: Run the focused suite and verify RED**

Run:

```sh
npm run vendor:sync
TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js
```

Expected: FAIL because current bodies contain only
`History alone never establishes edition evidence.` and U0 contains
`validation only..`.

- [ ] **Step 3: Implement the shared exact wording**

Change U0's stored scope to:

```js
scope: 'Pure provenance tooling, rendering, and validation only',
```

Replace the shared history-only line with:

```js
'History, age, path/directory, and source/text similarity may prioritize review but can never decide edition.',
```

Do not alter any native parent, dependency, ledger, review, CI, or post-merge
gate line.

- [ ] **Step 4: Run the focused suite and verify GREEN**

Run:

```sh
TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit the body contract**

```sh
git add tools/test262/es2015-provenance.js test/node/es2015-provenance.test.js
git commit -m "Fix provenance issue body contract" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: Immutable Maintenance Profile

**Files:**
- Modify: `test/node/es2015-provenance.test.js:1-106,1075-1110`
- Modify: `tools/test262/es2015-provenance.js:99-176,960-1018,2012-2124`
- Modify: `tools/test262/es2015-provenance.json:101-538`

**Interfaces:**
- Consumes: `APPROVED_RANGE_PROFILES`, `parseEs2015ProvenanceManifest()`, and `buildProvenanceFoundation()`.
- Produces: one exact `foundation-maintenance` profile between foundation and decisions while preserving every existing profile object.

- [ ] **Step 1: Write failing profile-contract tests**

Capture the current foundation profile and all thirteen decision profile JSON
objects before editing. Add expected maintenance paths and assert:

```js
assertSame(
  json(productionManifest().rangeProfiles.map((profile) => profile.name)),
  json([
    'foundation',
    'foundation-maintenance',
    ...ES2015_PROVENANCE_DECISION_CODES.map((code) => `decision:${code}`),
  ]),
);
```

Also assert the maintenance profile has `baseFoundation: 'present'`, empty
required/deletion arrays, `decisionFragment: null`, all thirteen canonical
empty fragment paths, and only the exact design allowlist. Assert the
foundation object and each decision object still equal their captured U0
values.

- [ ] **Step 2: Run the focused suite and verify RED**

```sh
TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js
```

Expected: FAIL because `foundation-maintenance` is absent.

- [ ] **Step 3: Add the immutable schema-defined profile**

Define one sorted exact path constant and profile:

```js
const FOUNDATION_MAINTENANCE_ALLOWED_PATHS = Object.freeze(
  sortStrings([
    '.github/workflows/ci.yml',
    'docs/conformance.md',
    'docs/superpowers/plans/2026-08-19-unknown-edition-provenance.md',
    'docs/superpowers/plans/2026-08-20-provenance-foundation-maintenance.md',
    'docs/superpowers/specs/2026-08-19-unknown-edition-provenance-design.md',
    'docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md',
    'docs/testing.md',
    'test/node/es2015-provenance.test.js',
    'test/node/workflow-contract.test.js',
    'tools/ci/pipeline.js',
    'tools/test262/es2015-provenance-check.js',
    ...EMPTY_DECISION_FRAGMENTS,
    'tools/test262/es2015-provenance.js',
    ES2015_PROVENANCE_FILE,
  ]),
);
```

Insert an object with name `foundation-maintenance`,
`baseFoundation: 'present'`, empty `requiredPaths`, no deletions,
`emptyDecisionFragments: EMPTY_DECISION_FRAGMENTS`,
`decisionFragment: null`, and generated paths limited to the workflow and
canonical manifest.

- [ ] **Step 4: Regenerate only the canonical manifest**

Run:

```sh
TZ=UTC npm run test262:es2015:provenance
```

Verify all thirteen fragment files remain byte-identical and the manifest
changes only by inserting the maintenance profile.

- [ ] **Step 5: Run the focused suite and verify GREEN**

```sh
TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the profile**

```sh
git add tools/test262/es2015-provenance.js \
  tools/test262/es2015-provenance.json \
  test/node/es2015-provenance.test.js
git commit -m "Define foundation maintenance profile" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: Trusted-Base Range Authorization

**Files:**
- Modify: `test/node/es2015-provenance.test.js:941-1073,2949-3441`
- Modify: `tools/test262/es2015-provenance-check.js:18-28,464-830`

**Interfaces:**
- Consumes: explicit base/head SHAs, canonical base/head manifests, parsed marker, and the immutable maintenance profile.
- Produces: bootstrap authorization from exact U0 identity and persistent authorization from the base-tree maintenance profile.

- [ ] **Step 1: Extend range fixtures without weakening production checks**

Let `rangeCheckDependencies()` accept explicit base/head manifest text and
base/head SHAs. Keep merge-base and commit resolution exact. Add helpers for
the U0 base manifest bytes and maintenance marker.

- [ ] **Step 2: Write failing accepted-range tests**

Add one bootstrap case with base SHA
`8d75b48af2ee7ab04e7c5006980417227ec34568`, exact U0 manifest bytes, and a
maintenance-allowed changed path. Add one post-bootstrap case whose base
manifest contains `foundation-maintenance`. Both use the exact marker and must
return 0.

- [ ] **Step 3: Write failing fail-closed tests**

Cover each independently:

```text
wrong U0 bootstrap commit
wrong U0 bootstrap manifest bytes
broadened head profile plus a path absent from the base profile
src/runtime/forbidden.js
tools/test262/features.json
tools/test262/upstream-subset.json
tools/test262/es2015-taxonomy.json
non-empty decision fragment
rename
copy
delete
unknown marker/profile
profile:foundation against an initialized base
unmarked maintenance-only path
```

The broadened-head test must fail on the base profile's forbidden path before
head policy can authorize it.

- [ ] **Step 4: Run the focused suite and verify RED**

```sh
TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js
```

Expected: FAIL because the checker currently treats maintenance as an unknown
profile and reads unknown-profile policy from HEAD.

- [ ] **Step 5: Implement bootstrap and base-owned profile selection**

Add constants:

```js
const FOUNDATION_BOOTSTRAP_COMMIT =
  '8d75b48af2ee7ab04e7c5006980417227ec34568';
const FOUNDATION_BOOTSTRAP_MANIFEST_SHA256 =
  'ad3e55a061f1156fc267655ac8cb977f6a54f934cc56a5efa5689c7fc620ae04';
const FOUNDATION_MAINTENANCE_PROFILE = 'foundation-maintenance';
```

For maintenance:

1. Require a base manifest.
2. If the base manifest has the maintenance profile, parse it canonically and
   select that base profile.
3. Otherwise require both exact bootstrap identities and use the compiled
   immutable maintenance profile.
4. Validate the marker and changed paths against that selected authority
   before parsing mutable head policy.
5. Parse and validate the canonical head manifest, require its maintenance
   profile to equal the selected authority, then validate all empty fragments.

Reject every other unknown profile directly. Extend marker ownership so the
exact bootstrap policy protects maintenance-only paths before the first merge;
later ownership comes from the base manifest.

- [ ] **Step 6: Run the focused suite and verify GREEN**

```sh
TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit trusted-base authorization**

```sh
git add tools/test262/es2015-provenance-check.js \
  test/node/es2015-provenance.test.js
git commit -m "Authorize maintenance from provenance base" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 4: Documentation and Generated Contract

**Files:**
- Modify: `docs/conformance.md:631-706`
- Modify: `docs/testing.md:304-339`
- Modify: `docs/superpowers/specs/2026-08-19-unknown-edition-provenance-design.md:202-232`
- Modify: `docs/superpowers/plans/2026-08-19-unknown-edition-provenance.md:42-82`
- Modify if generated bytes change: `tools/ci/pipeline.js`, `.github/workflows/ci.yml`
- Test: `test/node/workflow-contract.test.js`

**Interfaces:**
- Consumes: implemented marker/profile behavior.
- Produces: directly related operational documentation and unchanged workflow derivation.

- [ ] **Step 1: Update only directly related provenance prose**

Document the exact body prohibition, maintenance marker, trusted-base
bootstrap, persistent base-profile authority, exact allowlist purpose, and
unchanged local command restrictions. Replace every statement that maintenance
is merely future work.

- [ ] **Step 2: Check generated workflow bytes**

```sh
npm run ci:check
```

Expected: PASS without workflow changes. If it reports drift, regenerate with
`npm run ci:generate`, inspect the exact diff, and retain only changes caused by
the existing generator.

- [ ] **Step 3: Run focused workflow and repository suites**

```sh
TZ=UTC node test/run-node.js \
  test/node/es2015-provenance.test.js \
  test/node/workflow-contract.test.js \
  test/node/repository-invariants.test.js
```

Expected: PASS.

- [ ] **Step 4: Commit documentation and contract**

```sh
git add docs/conformance.md docs/testing.md \
  docs/superpowers/specs/2026-08-19-unknown-edition-provenance-design.md \
  docs/superpowers/plans/2026-08-19-unknown-edition-provenance.md \
  docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md \
  docs/superpowers/plans/2026-08-20-provenance-foundation-maintenance.md \
  tools/ci/pipeline.js .github/workflows/ci.yml \
  test/node/workflow-contract.test.js
git commit -m "Document provenance maintenance contract" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 5: Verification, Reviews, and Merge

**Files:**
- Inspect: every changed file in `git diff origin/main...HEAD`
- No broad local Test262 or runtime changes.

**Interfaces:**
- Consumes: complete implementation.
- Produces: reviewed head, merged squash, exact-main security evidence, and parent report.

- [ ] **Step 1: Run all permitted local checks**

```sh
npm run vendor:check
TZ=UTC npm run test262:es2015:provenance:check
TZ=UTC npm run test262:es2015:audit:check
TZ=UTC node test/run-node.js \
  test/node/es2015-provenance.test.js \
  test/node/workflow-contract.test.js \
  test/node/repository-invariants.test.js
npm run ci:check
npm run typecheck
npm run lint
npm run format
git diff --check
```

- [ ] **Step 2: Run the live maintenance range check**

```sh
BASE=$(git rev-parse origin/main)
HEAD=$(git rev-parse HEAD)
MARKER='<!-- es2015-provenance-pr parent:T1 parent-issue:75 profile:foundation-maintenance base-ledger-sha256:56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc -->'
TZ=UTC node tools/test262/es2015-provenance-check.js \
  --check-range --base="$BASE" --head="$HEAD" \
  --profile=foundation-maintenance --marker="$MARKER"
```

Expected: PASS against the actual base/head.

- [ ] **Step 3: Obtain independent reviews**

Request one specification review against the approved design and one
quality/provenance review against the full diff. Fix every Critical or
Important finding, rerun scoped checks, and obtain scoped re-review.

- [ ] **Step 4: Reconcile moving main**

Fetch origin. If `origin/main` moved, rebase the branch, rerun the live range
check and all permitted checks, then repeat both independent reviews on the
new head.

- [ ] **Step 5: Create the pull request**

Push the branch and create one pull request whose body contains the exact
maintenance marker. Record the reviewed head SHA.

- [ ] **Step 6: Require exact pull-request CI and CodeQL**

Confirm the exact `.github/workflows/ci.yml` pull-request run succeeds and two
CodeQL analyses complete cleanly for the unchanged reviewed head. Confirm zero
open CodeQL alerts before merge.

- [ ] **Step 7: Squash merge and verify exact main**

Squash merge only after all gates pass. Fetch `origin/main`, record the squash
SHA, verify expected file bytes on that exact commit, require two clean
exact-main CodeQL analyses, and confirm zero alerts.

- [ ] **Step 8: Report completion**

Send the parent coordinator the reviewed head, pull-request CI and both CodeQL
run IDs, squash SHA, both exact-main CodeQL run IDs, exact local test commands,
origin/main byte verification, and any blocker. Do not create U* issues.
