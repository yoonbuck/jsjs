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
const FOUNDATION_BOOTSTRAP_COMMIT = '8d75b48af2ee7ab04e7c5006980417227ec34568';
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

---

## Prerequisite Amendment: Trusted Provenance Base Guard (Design-Phase Plan)

> **Status:** Design work only. None of the RED tests or implementation steps
> below may start until the coordinator approves the committed amendment.

This follow-up supersedes only the earlier plan's expectation that generated
workflow bytes remain unchanged. The preceding tasks remain historical context
for the completed schema-v2 maintenance range; none is reopened by this
prerequisite.

**Goal:** Install one persistent provenance range gate whose workflow, checker,
and policy all come from the PR target's trusted default-branch lineage, without
executing mutable HEAD content.

**Exact design base:**

- main: `1925873700c180fc38e7e020fc4b631c1866b082`
- schema-v2 manifest SHA-256:
  `f65f9a499acb92a933fedc5ee9197cc6a4c51ce30b5180cc741b23a93c9dfe92`
- profile: `foundation-maintenance` from that exact base manifest
- marker:
  `<!-- es2015-provenance-pr parent:T1 parent-issue:75 profile:foundation-maintenance base-ledger-sha256:56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc -->`

### Amendment constraints

- Modify the existing generated `.github/workflows/ci.yml`; no new workflow or
  repository path is allowed.
- Preserve schema version 2 and the exact canonical manifest bytes. Do not add,
  remove, repair, or use `maintenance:issue77-lexical`.
- Do not change runtime, taxonomy, selection, audit, report, decision, or other
  semantic/generated output.
- Never checkout or execute PR HEAD files, actions, scripts, hooks,
  configuration, or dependencies under `pull_request_target`.
- Fetch the base repository's advertised
  `refs/pull/<validated-PR-number>/head` only as inert Git objects, attest the
  fetched ref and `FETCH_HEAD` both equal the explicit event head SHA, and use
  those objects only for the base checker's existing `rev-parse`, `merge-base`,
  `git diff`, and `git show` reads.
- Never raw-fetch an unadvertised head SHA, add the attacker fork as a remote,
  or derive a remote URL from HEAD event data.
- Fail unless the event base repository and `github.repository` are exactly
  `yoonbuck/jsjs`, the event base ref is exactly `main`, both event SHAs are
  lowercase full SHAs, and checked-out `HEAD` equals the event base SHA. A
  stacked/non-main PR must trigger the active guard and fail.
- Use no npm install, package lifecycle hook, cache, artifact, secret, write
  token, environment, or unpinned action in the guard.
- Treat public repository visibility as a precondition for the unauthenticated
  fetch. A visibility change fails closed pending a separately reviewed design;
  persisting or improvising credentials is forbidden.
- Keep ordinary `push` and `pull_request` CI commands and names unchanged.
- Never run broad Test262 locally.

### Expected implementation files

- Modify `.github/workflows/ci.yml`: generated trigger, event-separated job
  graph, and trusted-base guard job.
- Modify `tools/ci/pipeline.js`: the sole source for those generated bytes.
- Modify `test/node/workflow-contract.test.js`: independent parsed-YAML and
  generator drift contracts.
- Modify `tools/test262/es2015-provenance-check.js`: accept exactly
  `pull_request` and `pull_request_target` for body-derived range checking and
  classify `tools/test262/selection.js` as a gate-owner dependency.
- Modify `test/node/es2015-provenance.test.js`: event and gate-owner contracts.
- Modify this plan and its paired design as implementation status changes.
- Modify `docs/testing.md` or `docs/conformance.md` only if the final operational
  guard contract cannot be stated completely in the paired design.

Every path above is already in the exact BASE `foundation-maintenance`
allowlist. No implementation task may add a path.

### Future Task G1: RED workflow security contract

**Status:** complete. Implemented under coordinator authorization; every item
below is done.

**Files:**

- Modify: `test/node/workflow-contract.test.js`

- [x] Add a parsed-YAML assertion for a filter-free `pull_request_target`
      trigger with exactly `opened`, `synchronize`, `reopened`, and `edited`.
- [x] Add an expected `provenance-base-guard` job with the active check-run name
      `Provenance base guard`, condition
      `github.event_name == 'pull_request_target'`, and permissions exactly
      `contents: read` plus `pull-requests: read`.
- [x] Require explicit `ubuntu-24.04`, a five-minute timeout, and no `needs`.
- [x] Require guard concurrency keyed by the server-provided PR number with
      a fixed `provenance-base-guard-` prefix and `cancel-in-progress: true`, so
      edited or synchronized stale runs cannot finish after their replacement.
- [x] Require fixed single-line validation commands for exact base repository,
      workflow repository, `main` base ref, full base/head SHAs, numeric nonzero PR
      number, and checked-out `HEAD` equality with event base SHA.
- [x] Require an explicit base-SHA checkout, `fetch-depth: 0`,
      `persist-credentials: false`, `submodules: false`, pinned
      checkout/setup-node actions, Node 20 without cache, no npm, a fixed quoted
      inert fetch of the base repository's advertised
      `refs/pull/<number>/head`, exact fetched-ref and `FETCH_HEAD` equality with
      the event head SHA, and the base checker command with event base/head/body
      plus fixed `TZ: UTC`. The PR number is available only to validation/fetch
      steps, not the checker.
- [x] Require per-step rather than job-level environments: identity variables
      only where consumed, `PR_BODY` and fixed `TZ: UTC` only on the checker step.
- [x] Add fork-shaped event cases that prove a different head repository never
      becomes a remote or URL input.
- [x] Execute the exact generated command constants against deterministic
      temporary Git repositories and require failure for a retargeted base branch,
      mismatched base repository, checkout `HEAD`/event base mismatch, nonnumeric or
      zero PR number, and fetched/event head SHA mismatch.
- [x] Create those fixtures with `mkdtemp` under the OS temporary directory,
      isolate `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM`, and set fixture-local
      identity inline. Initialize fixtures with an explicit `main` branch so the
      suite remains offline and independent of host Git defaults.
- [x] Reject `allow-unsafe-pr-checkout`, a HEAD checkout, secrets, write
      permissions, caches, artifacts, reusable workflows, unpinned actions,
      command-line PR body interpolation, and any event expression in `run`.
- [x] Require every existing job to have
      `github.event_name != 'pull_request_target'`.
- [x] Require event-distinct inactive display names so no skipped job can
      satisfy either the guard requirement or an ordinary CI requirement.
- [x] Assert `github.event_name` is the only dynamic input to job display names
      and that no context containing `(inactive` is eligible as the required guard.
- [x] Preserve the exact ordinary-event names, commands, steps, needs, pins,
      and environments of all existing jobs.
- [x] Add and test a byte-preserving generator assertion that every job `name`,
      step `name`, and step `run` is YAML plain-scalar-safe: no line break,
      leading/trailing whitespace, trailing colon, colon-space, space-`#`, or
      reserved leading indicator. Keep every guard command single-line with a safe
      leading word and colon-free diagnostics.
- [x] Explicitly amend the current exact job table, per-job npm-command
      assumption, inherited-permission assertion, and exact checker-event error
      expectation for the custom guard.
- [x] Require the existing ordinary-PR `Check provenance PR range` step to
      remain verbatim and defense-in-depth only.
- [x] Run only the focused workflow-contract test and confirm RED for the absent
      trigger/job/model.

### Future Task G2: RED checker event contract

**Status:** complete. Implemented under coordinator authorization; every item
below is done.

**Files:**

- Modify: `test/node/es2015-provenance.test.js`

- [x] Add one accepted body-derived range check for `GITHUB_EVENT_NAME` equal to
      `pull_request_target`, retaining the existing accepted `pull_request` case.
- [x] Add rejection cases for `push`, empty, and arbitrary event names.
- [x] Retain exact failures for non-full base/head SHAs, mismatched resolution,
      equal commits, and non-ancestor base.
- [x] Retain neutral unmarked success and provenance-owned unmarked,
      duplicate-marker, malformed-marker, and wrong-profile failures.
- [x] Assert the current BASE `foundation-maintenance` authority and manifest
      remain unchanged.
- [x] Add `tools/test262/selection.js` ownership coverage: an unmarked
      selection-dependency change must fail rather than pass as neutral, and no
      profile may newly allow the path.
- [x] Run only the focused provenance test and confirm RED for the target event.

### Future Task G3: Minimal checker extension

**Status:** complete. Implemented under coordinator authorization; every item
below is done.

**Files:**

- Modify: `tools/test262/es2015-provenance-check.js`
- Test: `test/node/es2015-provenance.test.js`

- [x] Change the `--pr-body-env` event guard from one accepted event to the exact
      set `pull_request`, `pull_request_target`.
- [x] Add `tools/test262/selection.js` to
      `PROVENANCE_RANGE_GATE_OWNER_PATHS`; do not add it to any range profile.
- [x] Do not otherwise alter CLI shape, marker grammar, ownership, profile
      resolution, Git commands, range validation, manifest parsing, or content
      validation.
- [x] Run the focused provenance test and confirm GREEN.

### Future Task G4: Generated event-separated workflow

**Status:** complete. Implemented under coordinator authorization; every item
below is done.

**Files:**

- Modify: `tools/ci/pipeline.js`
- Generate: `.github/workflows/ci.yml`
- Test: `test/node/workflow-contract.test.js`

- [x] Extend the structured job model only for job `if`, guard concurrency, job
      permissions, runner, timeout, event-distinct display names, and a custom guard
      setup.
- [x] Add the filter-free `pull_request_target` trigger.
- [x] Add `provenance-base-guard` with no `needs`.
- [x] Give the guard a PR-number concurrency group with stale-run
      cancellation.
- [x] Use separate single-line `run` steps only; do not add multiline
      block-scalar support. Parse the generated YAML and require every new `run`,
      `with`, and `env` value to round-trip exactly.
- [x] Use only per-step environments. Expose canonical identity values to the
      validation steps that consume them; expose `PR_BODY` and fixed `TZ: UTC` only
      to the checker step.
- [x] Before checkout, pass event identities through `env` and require base repo
      and `github.repository` equal `yoonbuck/jsjs`, base ref equals `main`, both
      SHAs are lowercase full SHAs, and PR number matches `^[1-9][0-9]*$`.
- [x] Check out only `${{ github.event.pull_request.base.sha }}` with full
      history and non-persisted credentials.
- [x] Require checked-out `HEAD^{commit}` to equal the event base SHA before
      setup or fetch.
- [x] Set up Node 20 through the current immutable pin without npm caching or
      dependency installation.
- [x] Pass `${{ github.event.pull_request.number }}` through `env`, validate it
      against `^[1-9][0-9]*$`, and fetch only the base checkout's advertised
      `+refs/pull/${PR_NUMBER}/head:refs/remotes/pull/${PR_NUMBER}/head` from the
      fixed `origin`.
- [x] Require both the fetched remote-tracking ref and `FETCH_HEAD` to resolve
      exactly to `${{ github.event.pull_request.head.sha }}` before invoking the
      checker.
- [x] Never raw-fetch the head SHA, add/fetch the attacker fork remote, or use a
      remote URL derived from HEAD event data.
- [x] Keep fetched HEAD objects inert without checkout, extraction, submodules,
      or execution.
- [x] Run only the checked-out base checker/module using explicit event
      base/head and the full PR body from an environment variable, with fixed
      `TZ=UTC`.
- [x] Add explicit privileged-event exclusions and distinct inactive names to
      every ordinary job while preserving ordinary behavior.
- [x] Retain the ordinary `test262-upstream` provenance step verbatim with its
      `pull_request`-only condition.
- [x] Generate `ci.yml`, inspect the exact diff, run the focused workflow
      contract, and confirm GREEN.

### Future Task G5: Focused validation and live BASE evidence

**Status:** complete. Implemented under coordinator authorization at
documentation commit `92715a5b3ee1a9322d0f8696b573a33ac46da9b5`; every item
below is done, with the evidence recorded in
`.superpowers/sdd/2026-08-20-provenance-foundation-maintenance/task-G5-report.md`.
Evidence summary: the focused pair ran GREEN (91 passed, 0 failed, exit 0);
`npm run ci:check`, `npm run typecheck`, `npm run lint`, `npm run format`, and
`git diff --check` all exited 0; `shasum -a 256 tools/test262/es2015-provenance.json`
returned exactly
`f65f9a499acb92a933fedc5ee9197cc6a4c51ce30b5180cc741b23a93c9dfe92`; the
generated/semantic taxonomy, manifest, selection, and conformance paths were
byte-identical to exact BASE `1925873700c180fc38e7e020fc4b631c1866b082`; and the
isolated exact-BASE checker
(SHA-256 `c76865bc77e5ccff7ce35d03bbd77a1055ba3e8f1ed3321737902a364392cdfe`,
distinct from the branch checker) accepted the actual base→head range under the
exact marker with `GITHUB_EVENT_NAME=pull_request` and `TZ=UTC`, exit 0, before
the temporary checkout was deleted. Remote `origin/main` was verified at exact
BASE before and after the evidence; no rebase was performed.

**Files:**

- Inspect every changed implementation file.

- [x] Run the focused provenance and workflow-contract Node suites together.
- [x] Run generated workflow drift, typecheck, lint, format, and
      `git diff --check`.
- [x] Verify the canonical provenance manifest SHA-256 remains
      `f65f9a499acb92a933fedc5ee9197cc6a4c51ce30b5180cc741b23a93c9dfe92`
      and semantic/generated taxonomy outputs have no diff.
- [x] Materialize outside the repository worktree an isolated temporary
      checkout of exact BASE
      `1925873700c180fc38e7e020fc4b631c1866b082`, fetch the reviewed implementation
      HEAD as inert objects, and invoke that BASE
      `tools/test262/es2015-provenance-check.js` with the actual base/head and exact
      PR body through a named environment variable under `TZ=UTC` and
      `GITHUB_EVENT_NAME=pull_request`. Do not run the implementation branch's
      checker as substitute evidence.
- [x] Remove the temporary checkout after recording the successful command and
      identities.
- [x] Do not run broad Test262, audit write mode, browser, JavaScriptCore, or
      `ci:contract`.

### Future Task G6: Independent review and bootstrap release

**Status:** in progress. The independent reviews below are complete and clean
at `92715a5b3ee1a9322d0f8696b573a33ac46da9b5`; the single authorized final fix
wave for the whole-branch quality review's Important findings is under way. No
push, pull request, CI run, CodeQL analysis, merge, post-merge verification,
activation probe, or schema-v3 work has started.

**Files:**

- Review the complete guard implementation diff and generated YAML.

- [x] Obtain an independent GitHub Actions security review for workflow source,
      permissions, checkout/fetch behavior, shell injection, HEAD non-execution,
      job/check naming, skipped-job conclusions, and required-check semantics.
- [x] Obtain an independent provenance-spec review for exact BASE authority,
      foundation-maintenance allowlist, marker behavior, neutral ranges, and no
      schema/taxonomy changes.
- [ ] Fix every Critical or Important finding, rerun focused checks, and obtain
      scoped re-review of each fix.
- [ ] Use the exact marker in the guard PR body.
- [ ] Require ordinary PR CI, independent review, manual live BASE-checker
      evidence, and clean pull-request CodeQL. Explicitly record that the new guard
      cannot protect its own creation because BASE lacks the trigger.
- [ ] After squash merge, verify exact main bytes and require clean exact-main
      CodeQL before declaring the guard authoritative.
- [ ] On the first post-merge PR, prove the check run named
      `Provenance base guard` is attached to the current PR head, not merely the
      default-branch SHA; prove dynamic names evaluate distinctly even for skipped
      jobs; and prove the run is sourced from the guard-bearing default branch.
      Only then configure that exact GitHub Actions context as required; no skipped
      inactive context is acceptable. If any proof fails, stop without adding write
      permissions, configuring a required context, or starting schema v3.
- [ ] Re-author the schema-v3 corrective PR from the guarded main commit and
      require a fresh trusted-base guard run on its unchanged reviewed head.

### Current stop gate

This amendment's design phase ends after:

1. the paired design and this plan are self-reviewed;
2. an independent Actions security/spec reviewer clears all Critical and
   Important design findings;
3. the documentation-only commit is reported to the coordinator.

Do not begin Future Task G1 or any workflow/checker/test change before explicit
coordinator approval.

### Post-authorization status

The coordinator authorized implementation on 2026-08-20 after the design
review above completed. Future Tasks G1-G5 are complete, matching the
checklists above; no architecture, exact value, trust boundary, or future
post-merge requirement changed from the reviewed design. Future Task G6
(independent review and bootstrap release) is in progress: the independent
Actions security review and the independent provenance-specification review are
both clean at `92715a5b3ee1a9322d0f8696b573a33ac46da9b5`, and the single
authorized final fix wave for the whole-branch quality review's Important
findings is under way. Scoped fix re-review, the guard pull request, ordinary
exact-head CI, both pull-request CodeQL analyses, squash merge, exact-main
verification, the first post-merge activation probe, and schema-v3 re-authoring
all remain pending.

## Bootstrap Roadmap Authority Assembly and Validation Addendum

This addendum records the exact local assembly and validation sequence required
to keep the bootstrap PR inside the BASE `foundation-maintenance` trust boundary
while preserving the approved standalone roadmap-authority plan for the later
schema-v3 migration.

### Bootstrap execution summary

1. Capture the exact bytes and SHA-256 of the approved standalone design and
   plan before mutating any destination file.
2. Append this execution summary and the paired design addendum only to the
   existing BASE-allowlisted 2026-08-20 design/plan documents, then embed the
   captured standalone payloads exactly once under SHA-bound extraction markers.
3. Verify that each embedded payload extracts byte-for-byte to the captured
   source bytes and that the extracted bytes hash to the recorded SHA-256 before
   deleting the standalone 2026-08-21 bootstrap HEAD paths.
4. Keep the committed bootstrap diff limited to the exact BASE
   `foundation-maintenance` allowlist, with no standalone 2026-08-21 paths and
   no net `.superpowers/` path in the reviewed range.
5. Verify `tools/test262/es2015-provenance.json` and all 13 decision fragments
   remain byte-identical to exact BASE
   `9d2df395b792230529094cdffc4d9c694e2b357c`.
6. Run only the scoped Task 6 validation commands: the focused Node suites,
   workflow drift check, typecheck, targeted ESLint, targeted Prettier, and
   `git diff --check`.
7. Run the exact BASE checker from a detached
   `9d2df395b792230529094cdffc4d9c694e2b357c` checkout under this ignored SDD
   workspace against the committed bootstrap HEAD and the exact maintenance
   marker.
8. Do not push, open a PR, dispatch reviews or subagents, or merge from this
   task; later controller steps own remote review and delivery after the local
   bootstrap commit.

<!-- BEGIN ROADMAP AUTHORITY PLAN sha256:28ccfa8dae11e824651ce6c6ad3747f7b693a6881ba047600eeac1704f66a618 -->
# Roadmap Authority State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install a BASE-owned one-use roadmap authority state machine through a schema-v2 bootstrap PR, then perform the exact schema-v3 P0/H0 migration in a second guarded PR.

**Architecture:** The first PR remains a valid schema-v2 `foundation-maintenance` range and installs every parser, marker, projection, and workflow rule needed by future operations. After that PR is squash-merged and pinned, a fresh data-only migration PR changes the manifest to schema 3, records P0 as applied and H0 as pending, removes the invalid #77 profile, and leaves all executable policy in BASE.

**Tech Stack:** Node.js 20 ES modules, strict JSDoc types, canonical JSON, the repository's custom Node test harness, generated GitHub Actions YAML, Git, GitHub CLI, CodeQL, and `TZ=UTC`.

**Spec:** `docs/superpowers/specs/2026-08-21-roadmap-authority-state-machine-design.md`

## Global Constraints

- Bootstrap exact base:
  `9d2df395b792230529094cdffc4d9c694e2b357c`.
- Bootstrap exact schema-v2 manifest SHA-256:
  `f65f9a499acb92a933fedc5ee9197cc6a4c51ce30b5180cc741b23a93c9dfe92`.
- Bootstrap must use the existing marker:
  `<!-- es2015-provenance-pr parent:T1 parent-issue:75 profile:foundation-maintenance base-ledger-sha256:56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc -->`.
- Bootstrap keeps `tools/test262/es2015-provenance.json` and all 13 decision
  fragments byte-identical.
- Bootstrap may touch only paths already allowed by the BASE
  `foundation-maintenance` profile.
- Bootstrap defines all executable schema-v3, migration, preparation, consumption,
  projection, and live-main policy. The migration PR adds no executable policy.
- Migration exact base is the verified bootstrap squash SHA; record it before
  creating the migration branch.
- Migration preserves all 13 decision fragments byte-identically and all 15
  legitimate range-profile objects canonically.
- Migration deletes exactly `maintenance:issue77-lexical`, adds P0 `applied`, and
  adds H0 `pending`.
- Never transplant code, commits, or GREEN evidence from quarantined authority
  branches.
- Never run full/broad Test262, `test262:upstream`,
  `test262:upstream:check`, `ci:contract`, browser suites, JavaScriptCore suites,
  or wrappers that transitively invoke them locally.
- Local Test262 is limited to exact focused `TZ=UTC` paths explicitly named by a
  task.
- Use Copilot as the local commit author.
- Require independent task review, whole-branch review, exact-head active BASE
  guard, ordinary CI, both CodeQL categories, zero open alerts, squash merge, and
  exact-main verification for both PRs.

---

## File Structure

### Bootstrap PR

- Modify `tools/test262/es2015-provenance.js`: add schema-v3 parsing,
  canonical roadmap-authority records, exact P0/H0 constants, canonical hashing,
  state-machine validation, and pure protected-output projection validation while
  preserving schema-v2 behavior.
- Modify `tools/test262/es2015-provenance-check.js`: add exact migration,
  preparation, and consumption marker dispatch; read authority only from BASE;
  orchestrate artifact reads and range validation.
- Modify `test/node/es2015-provenance.test.js`: RED/GREEN coverage for parser,
  migration, preparation, consumption, replay rejection, P0/H0 pins, and every
  protected artifact verifier.
- Modify `tools/ci/pipeline.js`: inertly fetch live `refs/heads/main` and attest it
  equals event/checkout BASE before range checking.
- Modify `.github/workflows/ci.yml`: generated workflow output only.
- Modify `test/node/workflow-contract.test.js`: generated YAML and executable
  command contract for live-main attestation and new BASE marker dispatch.
- Modify `docs/testing.md`: document marker classes, BASE-only execution, and
  focused local commands.
- Modify
  `docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md`:
  append the approved bootstrap addendum because this is an existing BASE-allowed
  path.
- Modify
  `docs/superpowers/plans/2026-08-20-provenance-foundation-maintenance.md`:
  append the bootstrap execution addendum because this is an existing BASE-allowed
  path.
- Delete from bootstrap HEAD:
  `docs/superpowers/specs/2026-08-21-roadmap-authority-state-machine-design.md`.
- Delete from bootstrap HEAD:
  `docs/superpowers/plans/2026-08-21-roadmap-authority-state-machine.md`.

No new bootstrap code or test file is allowed. The existing trusted profile does
not authorize a new path.

### Migration PR

- Modify `tools/test262/es2015-provenance.json`: exact schema-v3 data migration.
- Create
  `docs/superpowers/specs/2026-08-21-roadmap-authority-state-machine-design.md`:
  durable approved design under the bootstrap migration verifier.
- Create
  `docs/superpowers/plans/2026-08-21-roadmap-authority-state-machine.md`: durable
  approved execution plan under the bootstrap migration verifier.

The migration PR changes no JavaScript, workflow, test, decision-fragment,
taxonomy, subset, audit, report, or conformance bytes.

---

### Task 1: Add Dual-Version Manifest and Authority Parsing

**Files:**

- Modify: `test/node/es2015-provenance.test.js:1-1750`
- Modify: `tools/test262/es2015-provenance.js:1-1550`

**Interfaces:**

- Consumes: existing `parseEs2015ProvenanceManifest(text)`,
  `parseEs2015DecisionFragment(text, code)`, and
  `buildProvenanceFoundation(classifications)`.
- Produces:
  - `ES2015_PROVENANCE_MANIFEST_VERSIONS`
  - `ES2015_PROVENANCE_DECISION_VERSION`
  - `canonicalRoadmapAuthoritySha256(authority)`
  - `validateRoadmapAuthorityManifest(manifest)`
  - `renderEs2015ProvenanceManifest(manifest)`
  - dual-version `parseEs2015ProvenanceManifest(text)`
  - `buildProvenanceFoundation(classifications, { version, roadmapAuthorities })`

- [ ] **Step 1: Write RED tests for separated versions**

Add imports and assertions:

```js
import {
  ES2015_PROVENANCE_DECISION_VERSION,
  ES2015_PROVENANCE_MANIFEST_VERSIONS,
  canonicalRoadmapAuthoritySha256,
  validateRoadmapAuthorityManifest,
} from '../../tools/test262/es2015-provenance.js';

assertSame(
  JSON.stringify(ES2015_PROVENANCE_MANIFEST_VERSIONS),
  JSON.stringify([2, 3]),
);
assertSame(ES2015_PROVENANCE_DECISION_VERSION, 2);
```

Keep `ES2015_PROVENANCE_VERSION === 2` as a compatibility alias until every
existing call site no longer confuses manifest and fragment versions.

- [ ] **Step 2: Run the focused test and observe RED**

Run:

```bash
TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js
```

Expected: FAIL because the new exports do not exist.

- [ ] **Step 3: Add exact JSDoc record types and constants**

In `es2015-provenance.js`, define:

```js
export const ES2015_PROVENANCE_MANIFEST_VERSIONS = Object.freeze([2, 3]);
export const ES2015_PROVENANCE_DECISION_VERSION = 2;
export const ES2015_PROVENANCE_VERSION = ES2015_PROVENANCE_DECISION_VERSION;

/**
 * @typedef {'pending' | 'applied'} RoadmapAuthorityState
 * @typedef {'add-exact' | 'replace-exact' | 'project'} RoadmapOutputOperation
 * @typedef {{
 *   path: string,
 *   operation: RoadmapOutputOperation,
 *   baseSha256: string | null,
 *   headSha256: string | null,
 *   projectionSha256: string | null,
 * }} RoadmapProtectedOutput
 * @typedef {{
 *   status: 'selected-passing' | 'audit-passing-unselected' | 'blocked',
 *   blocker: string | null,
 *   issue: number,
 * }} RoadmapDestination
 * @typedef {{
 *   preservedTaxonomySha256: string,
 *   authorityTaxonomySha256: string,
 *   selectorPathSha256: string,
 *   rootCount: number,
 *   variantCount: number,
 *   missingCount: number,
 *   extraCount: number,
 *   proofSha256: string,
 * }} RoadmapReconciliation
 * @typedef {{
 *   code: string,
 *   issue: number,
 *   parentIssue: number,
 *   state: RoadmapAuthorityState,
 *   source: {
 *     baseTaxonomySha256: string,
 *     rootCount: number,
 *     variantCount: number,
 *     pathSha256: string,
 *     entryLedgerSha256: string | null,
 *   },
 *   reconciliation: RoadmapReconciliation | null,
 *   evidence: readonly { path: string, sha256: string }[],
 *   protectedOutputs: readonly RoadmapProtectedOutput[],
 *   destinations: readonly RoadmapDestination[],
 * }} RoadmapAuthority
 */
```

- [ ] **Step 4: Write RED parser fixtures for canonical schema 3**

Build a schema-v3 fixture from the existing
`approvedProvenanceManifestText()` helper and a local minimal authority fixture:

```js
function minimalRoadmapAuthority(code, issue, state) {
  return {
    code,
    issue,
    parentIssue: 70,
    state,
    source: {
      baseTaxonomySha256: '1'.repeat(64),
      rootCount: 1,
      variantCount: 1,
      pathSha256: '2'.repeat(64),
      entryLedgerSha256: null,
    },
    reconciliation: null,
    evidence: [],
    protectedOutputs: [
      {
        path: `tools/test262/${code.toLowerCase()}-evidence.json`,
        operation: 'add-exact',
        baseSha256: null,
        headSha256: '3'.repeat(64),
        projectionSha256: null,
      },
    ],
    destinations: [
      {
        status: 'selected-passing',
        blocker: null,
        issue,
      },
    ],
  };
}

const manifestV3 = {
  ...JSON.parse(approvedProvenanceManifestText()),
  version: 3,
  roadmapAuthorities: [
    minimalRoadmapAuthority('H0', 76, 'pending'),
    minimalRoadmapAuthority('P0', 77, 'applied'),
  ],
};

const parsed = parseEs2015ProvenanceManifest(json(manifestV3));
assertSame(parsed.version, 3);
assertSame(parsed.roadmapAuthorities[0].code, 'H0');
assertSame(parsed.roadmapAuthorities[1].code, 'P0');
```

Add one test per rejection:

```js
for (const mutate of [
  (value) => value.roadmapAuthorities.reverse(),
  (value) => value.roadmapAuthorities.push(value.roadmapAuthorities[0]),
  (value) => {
    value.roadmapAuthorities[0].state = 'ready';
  },
  (value) => {
    value.roadmapAuthorities[0].unknown = true;
  },
  (value) => {
    value.roadmapAuthorities[0].source.entryLedgerSha256 = undefined;
  },
]) {
  const bad = structuredClone(manifestV3);
  mutate(bad);
  assertThrows(() => parseEs2015ProvenanceManifest(json(bad)));
}
```

- [ ] **Step 5: Run RED and confirm schema-v2 remains GREEN**

Run the same focused test. Expected: new schema-v3 cases FAIL; all pre-existing
schema-v2 cases remain PASS.

- [ ] **Step 6: Implement canonical normalizers**

Add pure normalizers that:

- require exact keys;
- require lowercase 64-hex hashes;
- require code-unit-sorted unique authorities by `code`;
- require path-sorted unique `evidence` and `protectedOutputs`;
- require sorted unique destinations by status, blocker, and issue;
- enforce operation/null combinations;
- recompute reconciliation proof hashes;
- reject reserved `foundation`, `decision:*`, and `maintenance:*` authority codes.

Implement canonical hashing:

```js
export function canonicalRoadmapAuthoritySha256(authority) {
  const normalized = normalizeRoadmapAuthority(
    /** @type {Record<string, any>} */ (structuredClone(authority)),
    'roadmap authority',
  );
  return sha256(`${JSON.stringify(normalized)}\n`);
}
```

Export the canonical renderer:

```js
export function renderEs2015ProvenanceManifest(manifest) {
  return `${JSON.stringify(validateRoadmapAuthorityManifest(manifest), null, 2)}\n`;
}
```

- [ ] **Step 7: Make the manifest parser dispatch by explicit version**

Preserve all v2 exact-key behavior. For v3, require the v2 keys plus
`roadmapAuthorities` and call `validateRoadmapAuthorityManifest`.

Do not make v3 optional by silently defaulting a missing field to `[]`.

- [ ] **Step 8: Make foundation building version-explicit**

Change:

```js
export function buildProvenanceFoundation(classifications, options = {}) {
  const version = options.version ?? 2;
  const roadmapAuthorities = options.roadmapAuthorities ?? [];
  // Existing foundation construction...
}
```

Version 2 must reject nonempty `roadmapAuthorities`. Version 3 must require the
exact validated list.

- [ ] **Step 9: Preserve `--check` for both manifest versions**

Update `checkFoundation` and every expected-foundation builder call to pass through
the parsed manifest's explicit version and roadmap authorities:

```js
const expected = buildProvenanceFoundation(classifications, {
  version: manifest.version,
  roadmapAuthorities: manifest.roadmapAuthorities ?? [],
});
```

Add a test that `provenanceCheck(['--check'])` accepts canonical v2 and canonical
v3 fixtures and rejects authority drift.

- [ ] **Step 10: Run focused tests GREEN**

Run:

```bash
TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js
```

Expected: PASS with no schema-v2 snapshot change.

- [ ] **Step 11: Commit**

```bash
git add tools/test262/es2015-provenance.js test/node/es2015-provenance.test.js
git commit -m "Add roadmap authority manifest contracts"
```

---

### Task 2: Pin Exact P0 and H0 Authorities

**Files:**

- Modify: `test/node/es2015-provenance.test.js`
- Modify: `tools/test262/es2015-provenance.js`

**Interfaces:**

- Consumes: `RoadmapAuthority`,
  `canonicalRoadmapAuthoritySha256(authority)`.
- Produces:
  - `P0_APPLIED_ROADMAP_AUTHORITY`
  - `H0_PENDING_ROADMAP_AUTHORITY`
  - `APPROVED_INITIAL_ROADMAP_AUTHORITIES`
  - `validateRoadmapReconciliation(baseTaxonomy, authorityTaxonomy, authority)`

- [ ] **Step 1: Add RED exact-record tests**

Assert every field from the spec, including:

```js
assertSame(P0_APPLIED_ROADMAP_AUTHORITY.state, 'applied');
assertSame(
  P0_APPLIED_ROADMAP_AUTHORITY.source.entryLedgerSha256,
  '3b23ac8dbc2ae703d466d49e26d827516e4a863406a45acb4e8356c86c32d664',
);
assertSame(H0_PENDING_ROADMAP_AUTHORITY.state, 'pending');
assertSame(H0_PENDING_ROADMAP_AUTHORITY.source.entryLedgerSha256, null);
assertSame(H0_PENDING_ROADMAP_AUTHORITY.evidence.length, 6);
assertSame(H0_PENDING_ROADMAP_AUTHORITY.protectedOutputs.length, 10);
assertSame(H0_PENDING_ROADMAP_AUTHORITY.destinations.length, 17);
assertSame(
  H0_PENDING_ROADMAP_AUTHORITY.destinations.some(
    (destination) =>
      destination.status === 'blocked' &&
      destination.blocker === 'proper-tail-calls' &&
      destination.issue === 97,
  ),
  true,
);
```

Assert the 15 legitimate profile objects equal the production v2 objects after
removing only `maintenance:issue77-lexical`.

- [ ] **Step 2: Run RED**

Run the focused provenance test. Expected: FAIL because constants are missing.

- [ ] **Step 3: Encode the exact P0 record**

Copy every hash, path, operation, and destination from the spec. Use
`Object.freeze` recursively. Do not derive P0 from mutable production HEAD.

- [ ] **Step 4: Encode the exact H0 record**

Copy:

- guarded taxonomy hash `dcc14a00...`;
- preserved source taxonomy hash `e7746b6d...`;
- reconciliation proof `10f03811...`;
- six evidence hashes;
- four project projection hashes;
- all 17 destination objects (16 blocked pairs plus selected-passing).

- [ ] **Step 5: Add semantic reconciliation validation**

`validateRoadmapReconciliation` must:

1. parse both taxonomy artifacts;
2. select exact `test262-cross-realm-host` roots;
3. require 135 roots and 267 variants in each;
4. require exact path hash `3aeb254d...`;
5. require zero missing/extra paths;
6. recompute proof SHA `10f03811...`.

A proof hash over declared numbers without taxonomy comparison must fail its test.

- [ ] **Step 6: Run GREEN**

Run:

```bash
TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/test262/es2015-provenance.js test/node/es2015-provenance.test.js
git commit -m "Pin initial roadmap authorities"
```

---

### Task 3: Add Migration, Preparation, and Consumption Ranges

**Files:**

- Modify: `test/node/es2015-provenance.test.js`
- Modify: `tools/test262/es2015-provenance-check.js`
- Modify: `tools/test262/es2015-provenance.js`

**Interfaces:**

- Consumes:
  - `parseEs2015ProvenanceManifest(text)`
  - `canonicalRoadmapAuthoritySha256(authority)`
  - `APPROVED_INITIAL_ROADMAP_AUTHORITIES`
- Produces:
  - `parseRoadmapAuthorityMarker(text)`
  - `validateRoadmapAuthorityMigration(baseManifestText, headManifestText)`
  - `validateRoadmapAuthorityPreparation(baseManifest, headManifest, marker)`
  - `validateRoadmapAuthorityConsumption(baseManifest, headManifest, marker)`

- [ ] **Step 1: Add RED marker tests**

Test exact accepted full comment blocks:

```js
const migrationMarker = `<!-- es2015-roadmap-authority-migration
parent:70
base:${'a'.repeat(40)}
base-manifest-sha256:${'b'.repeat(64)}
base-checker-sha256:${'c'.repeat(64)}
base-workflow-sha256:${'d'.repeat(64)}
head-manifest-sha256:${'e'.repeat(64)}
-->`;
const preparationMarker = `<!-- es2015-roadmap-authority-prepare
parent:70
code:M0
issue:79
base:${'a'.repeat(40)}
base-manifest-sha256:${'b'.repeat(64)}
record-sha256:${'c'.repeat(64)}
-->`;
const consumeMarker = `<!-- es2015-roadmap-authority-consume
parent:70
code:H0
issue:76
profile:roadmap-reclassification:H0
base:${'a'.repeat(40)}
source-path-sha256:3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950
source-entry-sha256:null
protected-projection-sha256:8e16b33ffdbd8a2089567e9a8bdb1c654619b8bd00021c54ac74c0ab02f2c5fd
-->`;
```

Reject CRLF, alternate spacing, line order, duplicate fields, uppercase hex,
extra fields, multiple roadmap blocks, and a mixed legacy/roadmap marker body.

- [ ] **Step 2: Run RED**

Run the focused provenance test. Expected: FAIL because parser/dispatch is absent.

- [ ] **Step 3: Implement marker scanning**

In body-derived mode:

- scan the complete PR body for exact legacy marker lines and exact roadmap
  comment blocks;
- require exactly one authoritative marker when a provenance-owned path changes;
- route legacy v2 markers and new roadmap markers through separate exact regexes;
- return a tagged union:

```js
/**
 * @typedef {{
 *   kind: 'migration' | 'prepare' | 'consume',
 *   text: string,
 *   base: string,
 *   code?: string,
 *   issue?: number,
 * }} RoadmapMarker
 */
```

- [ ] **Step 4: Add RED migration validation tests**

Construct exact base v2 and expected head v3 manifest texts. Assert:

- only invalid #77 profile removed;
- 15 legitimate profiles canonical-equal;
- 13 fragment texts byte-equal through injected `readGitFile`;
- exact P0/H0 records required;
- no protected output changed;
- migration with v2 head, extra authority, missing H0, changed P0, or profile drift
  fails.

- [ ] **Step 5: Implement migration validation**

The bootstrap checker must validate HEAD v3 using BASE code and constants. It may
read HEAD manifest bytes but never import or execute HEAD JavaScript.

The migration allowed path set is exactly:

```js
const ROADMAP_AUTHORITY_MIGRATION_PATHS = Object.freeze([
  'docs/superpowers/plans/2026-08-21-roadmap-authority-state-machine.md',
  'docs/superpowers/specs/2026-08-21-roadmap-authority-state-machine-design.md',
  ES2015_PROVENANCE_FILE,
]);
```

The migration marker must match all immutable BASE pins:

```js
const expectedPins = {
  base: resolvedBase,
  manifest: sha256(baseManifestText),
  checker: sha256(await readRequiredGitFile(deps, base, CHECKER_PATH)),
  workflow: sha256(await readRequiredGitFile(deps, base, WORKFLOW_PATH)),
};
```

Add one negative test for every mismatched pin, including stale BASE and a
schema-v3 BASE attempting another migration. A schema-v3 BASE must also reject the
legacy `foundation-maintenance` marker.

Add migration-document tests proving the BASE checker:

- extracts exactly one `BEGIN/END ROADMAP AUTHORITY DESIGN` payload and one
  `BEGIN/END ROADMAP AUTHORITY PLAN` payload from the BASE addenda;
- verifies each declared SHA-256 against the exact embedded bytes;
- requires the corresponding HEAD standalone document bytes to be identical;
- rejects absent or duplicate markers, a bad embedded SHA, truncated payloads, and
  altered HEAD documents.

- [ ] **Step 6: Add RED preparation tests**

Assert exactly one pending record append is accepted. Reject:

- applied append;
- two appends;
- existing record mutation/deletion/reordering;
- profile/fragment change;
- executable-policy change;
- any protected generated output;
- marker record hash mismatch.

- [ ] **Step 7: Implement preparation validation**

Index BASE and HEAD authorities by code. Require every BASE code to retain
canonical identity regardless of array position, require exactly one new HEAD code
in `pending`, and require the full HEAD array to remain code-unit sorted. The
closed allowed path set is:

```js
const ROADMAP_AUTHORITY_PREPARATION_PATHS = Object.freeze([
  'docs/superpowers/plans/2026-08-21-roadmap-authority-state-machine.md',
  'docs/superpowers/specs/2026-08-21-roadmap-authority-state-machine-design.md',
  'docs/testing.md',
  ES2015_PROVENANCE_FILE,
]);
```

Add an explicit regression accepting `[H0, P0] -> [H0, M0, P0]` and rejecting an
unsorted `[H0, P0, M0]`.

- [ ] **Step 8: Add RED consumption state-transition tests**

At this task boundary, test only the state/marker contract with an injected
nonempty projection result. Assert exact H0 pending-to-applied is accepted. Reject:

- HEAD-only authority;
- BASE already applied;
- pending-to-pending;
- any field changed besides state;
- another authority changed;
- replay.

- [ ] **Step 9: Implement consumption validation**

Read authority only from BASE:

```js
const baseAuthority = authorityByCode(baseManifest, marker.code);
if (baseAuthority.state !== 'pending') {
  throw new Es2015ProvenanceCheckError(
    `${marker.code} roadmap authority must be pending in BASE`,
  );
}
const expectedHeadAuthority = { ...baseAuthority, state: 'applied' };
assertCanonicalEqual(headAuthority, expectedHeadAuthority);
```

Do not accept a marker-derived default or HEAD-defined record. Validate every
consumer marker field against BASE, including aggregate projection SHA
`8e16b33f...`.

- [ ] **Step 10: Run GREEN**

Run:

```bash
TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add tools/test262/es2015-provenance.js tools/test262/es2015-provenance-check.js test/node/es2015-provenance.test.js
git commit -m "Add guarded roadmap authority ranges"
```

---

### Task 4: Add Artifact-Specific Protected Projections

**Files:**

- Modify: `test/node/es2015-provenance.test.js`
- Modify: `tools/test262/es2015-provenance.js`
- Modify: `tools/test262/es2015-provenance-check.js`

**Interfaces:**

- Consumes: BASE authority record and BASE/HEAD artifact texts.
- Produces:
  - `validateRoadmapProtectedOutputs(authority, changes, artifacts)`
  - `roadmapProjectionSha256(path, authority)`
  - `roadmapAggregateProjectionSha256(authority)`
  - `roadmapOwnedPathsFromBaseManifest(manifest)`
  - path-specific taxonomy, audit, subset, ES5 selection, report, and conformance
    validators.

- [ ] **Step 1: Write RED closed-path tests**

Use injected git diffs to reject rename, copy, deletion, alias, path traversal,
external symlink target, sibling-prefix escape, another authority's output, and
unknown generated files.

Add markerless-change tests for every P0/H0 protected output and evidence path.
Also cover one path in each closed generated namespace. The expected result is an
authoritative-marker error, never neutral acceptance.

- [ ] **Step 2: Run RED**

Run the focused provenance test. Expected: FAIL because generic range validation
does not enforce roadmap projections.

- [ ] **Step 3: Implement exact/add/project operation checks**

For each `protectedOutputs` entry:

- `add-exact`: BASE path absent, HEAD bytes hash exactly;
- `replace-exact`: BASE and HEAD byte hashes exactly;
- `project`: BASE bytes hash exactly and path-specific semantic validator returns
  the exact projection hash.

Require every registered changed output exactly once and reject every unregistered
generated output.

Before `markerForRange` may return `null`, derive the ownership set from canonical
BASE:

```js
export function roadmapOwnedPathsFromBaseManifest(manifest) {
  const owned = new Set(PROVENANCE_RANGE_GATE_OWNER_PATHS);
  for (const authority of manifest.roadmapAuthorities ?? []) {
    for (const evidence of authority.evidence) owned.add(evidence.path);
    for (const output of authority.protectedOutputs) owned.add(output.path);
  }
  for (const path of CLOSED_PROVENANCE_GENERATED_PATHS) owned.add(path);
  return owned;
}
```

HEAD authority data never removes BASE ownership.

- [ ] **Step 4: Add aggregate projection RED/GREEN**

Define:

```js
export function roadmapAggregateProjectionSha256(authority) {
  const entries = authority.protectedOutputs.map((output) => ({
    path: output.path,
    operation: output.operation,
    sha256:
      output.operation === 'project'
        ? output.projectionSha256
        : output.headSha256,
  }));
  return sha256(`${JSON.stringify(entries)}\n`);
}
```

The authority parser already guarantees path order and non-null operation-specific
hashes. Assert H0 equals
`8e16b33ffdbd8a2089567e9a8bdb1c654619b8bd00021c54ac74c0ab02f2c5fd`.
Reject a consumer marker with any other aggregate.

- [ ] **Step 5: Add taxonomy projection RED/GREEN**

Fixtures must prove:

- only ledger roots change;
- variant counts remain exact;
- final states are selected, audit-passing-unselected, or registered destination;
- one foreign classification fails;
- whole-tree counts balance.

- [ ] **Step 6: Add audit-evidence projection RED/GREEN**

Fixtures must prove exact variants/statuses, complete evidence, no skipped/failing
success shape, and no foreign record.

- [ ] **Step 7: Add subset and ES5 selection projection RED/GREEN**

P0 fixtures:

- exactly 22 subset additions in the two registered groups;
- exact subset delta SHA `88d25216...`;
- exact one ES5 tuple removal and delta SHA `2b065460...`;
- no taxonomy classification change for `newTargetEval.js`.

H0 fixtures use promotion and owner-delta evidence over current BASE, preserving
all unrelated P0 bytes.

- [ ] **Step 8: Add report and conformance projection RED/GREEN**

Report changes only exact selected variants and canonical summaries. Conformance
compares only the generated block to the canonical renderer while preserving
manual prose outside that projection.

- [ ] **Step 9: Complete consumption projection tests**

Extend Task 3's state-transition fixtures to require:

- nonzero exact protected delta;
- every registered changed output exactly once;
- no missing or foreign output;
- aggregate marker hash equal to BASE authority;
- applied state and output projection succeed or fail atomically.

- [ ] **Step 10: Run focused GREEN**

Run:

```bash
TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add tools/test262/es2015-provenance.js tools/test262/es2015-provenance-check.js test/node/es2015-provenance.test.js
git commit -m "Validate roadmap output projections"
```

---

### Task 5: Attest Live Main in the Privileged Workflow

**Files:**

- Modify: `test/node/workflow-contract.test.js`
- Modify: `tools/ci/pipeline.js`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/testing.md`

**Interfaces:**

- Consumes: existing guard checkout and head-fetch steps.
- Produces: generated `Fetch the current target branch` and
  `Attest the live target branch` steps before the checker, plus evaluated active
  and inactive check names on every event.

- [ ] **Step 1: Add RED workflow object and YAML assertions**

Require these exact generated commands:

```js
const GUARD_FETCH_BASE_COMMAND =
  'git fetch --no-tags --no-recurse-submodules origin +refs/heads/main:refs/remotes/origin/provenance-target-main';
const GUARD_ATTEST_BASE_COMMAND =
  'test "$(git rev-parse --verify \'refs/remotes/origin/provenance-target-main^{commit}\')" = "$BASE_SHA" && test "$(git rev-parse --verify \'HEAD^{commit}\')" = "$BASE_SHA"';
```

Assert they occur after BASE checkout attestation and before the PR-head fetch and
checker. Assert no checkout of the fetched ref.

Add a regression for GitHub's skipped-job behavior:

```js
assertSame(guardJob.if, undefined);
assertSame(
  guardJob.name,
  "${{ github.event_name == 'pull_request_target' && 'Provenance base guard' || 'Provenance base guard (inactive)' }}",
);
```

Require every security/checker step to have:

```yaml
if: github.event_name == 'pull_request_target'
```

Require one final constant step:

```yaml
- name: Keep the inactive guard context distinct
  if: github.event_name != 'pull_request_target'
  run: test "$GITHUB_EVENT_NAME" != pull_request_target
```

- [ ] **Step 2: Run RED**

Run:

```bash
TZ=UTC node test/run-node.js test/node/workflow-contract.test.js
```

Expected: FAIL because the live-main steps are absent and the job still has a
job-level `if`.

- [ ] **Step 3: Add executable temporary-repository tests**

Cover:

- live main equals event BASE: command exits zero;
- live main advanced: command exits nonzero;
- checked-out BASE differs: command exits nonzero;
- fetched target ref missing: command exits nonzero.

Also parse the generated YAML and prove:

- push/pull-request events execute only the inactive no-op step;
- `pull_request_target` executes every guard step and skips the no-op;
- the inactive context is named `Provenance base guard (inactive)`, not the raw
  expression;
- the active required context remains exactly `Provenance base guard`.

- [ ] **Step 4: Update pipeline generation**

Remove the guard job-level `if`, add the event condition to every active guard
step, and add the inactive no-op step. Add the two exact live-main steps without
credentials, npm, cache, artifact, secret, or HEAD execution. Keep action pins and
all ordinary jobs unchanged.

- [ ] **Step 5: Regenerate and verify workflow bytes**

Run:

```bash
node tools/ci/pipeline.js
node tools/ci/pipeline.js --check
```

Expected: generated `.github/workflows/ci.yml` matches exactly.

- [ ] **Step 6: Document stale-event behavior**

In `docs/testing.md`, state:

- main movement fails the guard and requires rerun against the new event BASE;
- GitHub does not evaluate expression-valued job names on job-level skipped jobs;
- the unconditional job plus mutually exclusive step conditions preserves the
  distinct active required context and inactive informational context.

- [ ] **Step 7: Run focused GREEN**

Run:

```bash
TZ=UTC node test/run-node.js test/node/workflow-contract.test.js test/node/es2015-provenance.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add tools/ci/pipeline.js .github/workflows/ci.yml test/node/workflow-contract.test.js docs/testing.md
git commit -m "Attest live main in provenance guard"
```

---

### Task 6: Complete and Deliver the Bootstrap PR

**Files:**

- Modify:
  `docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md`
- Modify:
  `docs/superpowers/plans/2026-08-20-provenance-foundation-maintenance.md`
- Delete from bootstrap HEAD:
  `docs/superpowers/specs/2026-08-21-roadmap-authority-state-machine-design.md`
- Delete from bootstrap HEAD:
  `docs/superpowers/plans/2026-08-21-roadmap-authority-state-machine.md`

**Interfaces:**

- Consumes: Tasks 1-5.
- Produces: one schema-v2 bootstrap PR whose final diff is fully allowed by the
  current BASE `foundation-maintenance` profile.

- [ ] **Step 1: Append the bootstrap design addendum**

Append a labeled section containing:

- two-PR rationale;
- bootstrap/migration trust boundary;
- marker grammars;
- live-main attestation;
- exact allowed bootstrap paths;
- explicit statement that manifest/fragments/protected outputs stay byte-identical.

Embed the complete standalone design bytes:

```bash
AUTHORITY_SPEC_SHA256=$(sha256sum \
  docs/superpowers/specs/2026-08-21-roadmap-authority-state-machine-design.md |
  cut -d' ' -f1)
{
  printf '\n<!-- BEGIN ROADMAP AUTHORITY DESIGN sha256:%s -->\n' \
    "$AUTHORITY_SPEC_SHA256"
  cat docs/superpowers/specs/2026-08-21-roadmap-authority-state-machine-design.md
  printf '<!-- END ROADMAP AUTHORITY DESIGN -->\n'
} >> docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md
```

- [ ] **Step 2: Append the bootstrap plan addendum**

Append the bootstrap execution summary, then embed the complete standalone plan:

```bash
AUTHORITY_PLAN_SHA256=$(sha256sum \
  docs/superpowers/plans/2026-08-21-roadmap-authority-state-machine.md |
  cut -d' ' -f1)
{
  printf '\n<!-- BEGIN ROADMAP AUTHORITY PLAN sha256:%s -->\n' \
    "$AUTHORITY_PLAN_SHA256"
  cat docs/superpowers/plans/2026-08-21-roadmap-authority-state-machine.md
  printf '<!-- END ROADMAP AUTHORITY PLAN -->\n'
} >> docs/superpowers/plans/2026-08-20-provenance-foundation-maintenance.md
```

- [ ] **Step 3: Remove standalone paths from bootstrap HEAD**

Use `apply_patch` to delete both 2026-08-21 files after their content is preserved
in the authorized addenda. Confirm:

```bash
git diff --name-only 9d2df395b792230529094cdffc4d9c694e2b357c...HEAD
```

contains only paths in the BASE `foundation-maintenance` profile.

- [ ] **Step 4: Commit the authorized bootstrap documentation**

```bash
git add -A
git commit -m "Document guarded roadmap authority bootstrap"
```

- [ ] **Step 5: Verify manifest and fragments are byte-identical**

Run:

```bash
test "$(git show 9d2df395b792230529094cdffc4d9c694e2b357c:tools/test262/es2015-provenance.json | sha256sum | cut -d' ' -f1)" = \
  "$(sha256sum tools/test262/es2015-provenance.json | cut -d' ' -f1)"
for file in tools/test262/es2015-provenance-decisions/*.json; do
  test "$(git show "9d2df395b792230529094cdffc4d9c694e2b357c:$file" | sha256sum | cut -d' ' -f1)" = \
    "$(sha256sum "$file" | cut -d' ' -f1)"
done
```

- [ ] **Step 6: Run the smallest complete bootstrap validation**

Run:

```bash
TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js test/node/workflow-contract.test.js
node tools/ci/pipeline.js --check
npm run typecheck
ESLINT_USE_FLAT_CONFIG=true npx eslint tools/test262/es2015-provenance.js tools/test262/es2015-provenance-check.js tools/ci/pipeline.js test/node/es2015-provenance.test.js test/node/workflow-contract.test.js
npx prettier --check tools/test262/es2015-provenance.js tools/test262/es2015-provenance-check.js tools/ci/pipeline.js test/node/es2015-provenance.test.js test/node/workflow-contract.test.js docs/testing.md docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md docs/superpowers/plans/2026-08-20-provenance-foundation-maintenance.md
git diff --check
```

Do not escalate to broad tests locally.

- [ ] **Step 7: Run the exact BASE checker against the committed bootstrap range**

Create a detached exact-BASE worktree under this plan's ignored SDD workspace and
execute the BASE checker from that path:

```bash
CURRENT_WORKTREE=$PWD
BASE_CHECKOUT=$PWD/.superpowers/sdd/2026-08-21-roadmap-authority-state-machine/base-9d2df39
git worktree add --detach "$BASE_CHECKOUT" \
  9d2df395b792230529094cdffc4d9c694e2b357c
BOOTSTRAP_HEAD=$(git rev-parse HEAD)
(
  cd "$BASE_CHECKOUT"
  PR_BODY='<!-- es2015-provenance-pr parent:T1 parent-issue:75 profile:foundation-maintenance base-ledger-sha256:56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc -->' \
  GITHUB_EVENT_NAME=pull_request_target \
  TZ=UTC node tools/test262/es2015-provenance-check.js \
    --check-range \
    --base=9d2df395b792230529094cdffc4d9c694e2b357c \
    --head="$BOOTSTRAP_HEAD" \
    --pr-body-env=PR_BODY
)
```

Expected: PASS using the BASE-authorized v2 profile.

- [ ] **Step 8: Obtain independent reviews**

Request:

- specification/security review of BASE-only behavior;
- task quality review;
- whole-branch review against exact base.

Fix every Critical/Important finding and rerun Steps 5-7.

- [ ] **Step 9: Push and open the bootstrap PR**

Use a PR body containing the exact legacy marker, base SHA, manifest hash, focused
local evidence, and explicit two-PR boundary.

- [ ] **Step 10: Verify exact-head GitHub gates**

Require:

- active `Provenance base guard` on unchanged head;
- ordinary CI terminal success;
- CodeQL JavaScript/TypeScript and Actions terminal success;
- zero results/errors/warnings and zero open alerts;
- issue #75 remains open.

- [ ] **Step 11: Squash merge and record bootstrap pins**

After merge, record:

```bash
BOOTSTRAP_PR=$(gh pr view --json number --jq .number)
BOOTSTRAP_SHA=$(gh pr view "$BOOTSTRAP_PR" --json mergeCommit --jq .mergeCommit.oid)
BOOTSTRAP_MANIFEST_SHA=$(git show "$BOOTSTRAP_SHA:tools/test262/es2015-provenance.json" | sha256sum | cut -d' ' -f1)
BOOTSTRAP_CHECKER_SHA=$(git show "$BOOTSTRAP_SHA:tools/test262/es2015-provenance-check.js" | sha256sum | cut -d' ' -f1)
BOOTSTRAP_WORKFLOW_SHA=$(git show "$BOOTSTRAP_SHA:.github/workflows/ci.yml" | sha256sum | cut -d' ' -f1)
```

Verify exact-main CI, both CodeQL categories, zero alerts, and unchanged manifest
SHA `f65f9a49...`.

---

### Task 7: Perform the Data-Only Schema-v3 Migration

**Files:**

- Modify: `tools/test262/es2015-provenance.json`
- Create:
  `docs/superpowers/specs/2026-08-21-roadmap-authority-state-machine-design.md`
- Create:
  `docs/superpowers/plans/2026-08-21-roadmap-authority-state-machine.md`

**Interfaces:**

- Consumes: verified bootstrap SHA and hashes from Task 6.
- Produces: canonical schema-v3 manifest with exact P0 applied and H0 pending
  records.

- [ ] **Step 1: Create a fresh migration branch/worktree**

Create it from exact `BOOTSTRAP_SHA`. Do not rebase the bootstrap implementation
branch. Also create a detached immutable bootstrap checkout:

```bash
MIGRATION_WORKTREE=$PWD
BOOTSTRAP_CHECKOUT=$PWD/.superpowers/sdd/2026-08-21-roadmap-authority-state-machine/bootstrap-base
git worktree add --detach "$BOOTSTRAP_CHECKOUT" "$BOOTSTRAP_SHA"
```

- [ ] **Step 2: Restore the approved standalone spec and plan**

Extract the complete documents from the immutable bootstrap BASE addenda:

```bash
git -C "$BOOTSTRAP_CHECKOUT" show \
  "$BOOTSTRAP_SHA:docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md" \
  > /tmp/bootstrap-authority-design.md
SPEC_SHA=$(sed -n \
  's/^<!-- BEGIN ROADMAP AUTHORITY DESIGN sha256:\\([0-9a-f]\\{64\\}\\) -->$/\\1/p' \
  /tmp/bootstrap-authority-design.md)
sed -n \
  '/^<!-- BEGIN ROADMAP AUTHORITY DESIGN sha256:[0-9a-f]\\{64\\} -->$/,/^<!-- END ROADMAP AUTHORITY DESIGN -->$/p' \
  /tmp/bootstrap-authority-design.md | sed '1d;$d' \
  > docs/superpowers/specs/2026-08-21-roadmap-authority-state-machine-design.md
test "$(sha256sum docs/superpowers/specs/2026-08-21-roadmap-authority-state-machine-design.md | cut -d' ' -f1)" = "$SPEC_SHA"

git -C "$BOOTSTRAP_CHECKOUT" show \
  "$BOOTSTRAP_SHA:docs/superpowers/plans/2026-08-20-provenance-foundation-maintenance.md" \
  > /tmp/bootstrap-authority-plan.md
PLAN_SHA=$(sed -n \
  's/^<!-- BEGIN ROADMAP AUTHORITY PLAN sha256:\\([0-9a-f]\\{64\\}\\) -->$/\\1/p' \
  /tmp/bootstrap-authority-plan.md)
sed -n \
  '/^<!-- BEGIN ROADMAP AUTHORITY PLAN sha256:[0-9a-f]\\{64\\} -->$/,/^<!-- END ROADMAP AUTHORITY PLAN -->$/p' \
  /tmp/bootstrap-authority-plan.md | sed '1d;$d' \
  > docs/superpowers/plans/2026-08-21-roadmap-authority-state-machine.md
test "$(sha256sum docs/superpowers/plans/2026-08-21-roadmap-authority-state-machine.md | cut -d' ' -f1)" = "$PLAN_SHA"
```

- [ ] **Step 3: Confirm the migration fixture's RED/GREEN boundary**

Run the focused migration test added in Task 3 twice:

1. with the fixture HEAD manifest left at v2: expected FAIL with
   `roadmap authority migration requires canonical schema-v3 HEAD`;
2. with the fixture HEAD manifest changed to the exact expected v3 object:
   expected PASS.

This proves the migration rule without creating a throwaway Git commit.

- [ ] **Step 4: Render the exact v3 manifest**

Use a narrow Node command importing the immutable bootstrap module:

```bash
BOOTSTRAP_CHECKOUT="$BOOTSTRAP_CHECKOUT" \
MIGRATION_WORKTREE="$MIGRATION_WORKTREE" \
TZ=UTC node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = path.join(
  process.env.BOOTSTRAP_CHECKOUT,
  'tools/test262/es2015-provenance.js',
);
const {
  APPROVED_INITIAL_ROADMAP_AUTHORITIES,
  parseEs2015ProvenanceManifest,
  renderEs2015ProvenanceManifest,
} = await import(pathToFileURL(modulePath));

const manifestPath = path.join(
  process.env.MIGRATION_WORKTREE,
  'tools/test262/es2015-provenance.json',
);
const base = parseEs2015ProvenanceManifest(
  fs.readFileSync(manifestPath, 'utf8'),
);
const head = {
  ...base,
  version: 3,
  rangeProfiles: base.rangeProfiles.filter(
    (profile) => profile.name !== 'maintenance:issue77-lexical',
  ),
  roadmapAuthorities: APPROVED_INITIAL_ROADMAP_AUTHORITIES,
};
fs.writeFileSync(manifestPath, renderEs2015ProvenanceManifest(head));
NODE
```

- [ ] **Step 5: Verify exact migration invariants**

Run focused tests:

```bash
TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js test/node/workflow-contract.test.js
node tools/test262/es2015-provenance-check.js --check
node tools/ci/pipeline.js --check
```

Verify:

- schema version 3;
- 15 profile objects equal BASE objects after removing only invalid #77;
- 13 fragments byte-equal;
- P0/H0 canonical hashes exact;
- each P0 `headSha256` equals the actual bootstrap BASE artifact bytes;
- all six current P0 protected outputs byte-equal between BASE and HEAD;
- workflow/checker/pipeline bytes equal BASE bootstrap.

Use:

```bash
for path in \
  tools/test262/es2015-taxonomy.json \
  tools/test262/es2015-audit-evidence.json \
  tools/test262/upstream-subset.json \
  tools/test262/es5-selection.json \
  docs/test262-report.jsonl \
  docs/conformance.md
do
  expected=$(jq -r --arg path "$path" \
    '.roadmapAuthorities[] | select(.code == "P0") |
     .protectedOutputs[] | select(.path == $path) | .headSha256' \
    tools/test262/es2015-provenance.json)
  actual=$(git -C "$BOOTSTRAP_CHECKOUT" show "$BOOTSTRAP_SHA:$path" |
    sha256sum | cut -d' ' -f1)
  test "$actual" = "$expected"
done
git diff --exit-code "$BOOTSTRAP_SHA"...HEAD -- \
  tools/test262/es2015-taxonomy.json \
  tools/test262/es2015-audit-evidence.json \
  tools/test262/upstream-subset.json \
  tools/test262/es5-selection.json \
  docs/test262-report.jsonl \
  docs/conformance.md
```

- [ ] **Step 6: Run scoped static checks**

Run:

```bash
npx prettier --check tools/test262/es2015-provenance.json docs/superpowers/specs/2026-08-21-roadmap-authority-state-machine-design.md docs/superpowers/plans/2026-08-21-roadmap-authority-state-machine.md
git diff --check
```

No broad local tests are required for this data-only PR.

- [ ] **Step 7: Commit the migration**

```bash
git add tools/test262/es2015-provenance.json docs/superpowers/specs/2026-08-21-roadmap-authority-state-machine-design.md docs/superpowers/plans/2026-08-21-roadmap-authority-state-machine.md
git commit -m "Migrate roadmap authority manifest to v3"
```

- [ ] **Step 8: Run the committed migration range GREEN**

Construct the exact multiline marker and execute the immutable BASE checker:

```bash
MIGRATION_HEAD=$(git rev-parse HEAD)
HEAD_MANIFEST_SHA=$(sha256sum tools/test262/es2015-provenance.json | cut -d' ' -f1)
PR_BODY=$(cat <<EOF
<!-- es2015-roadmap-authority-migration
parent:70
base:$BOOTSTRAP_SHA
base-manifest-sha256:$BOOTSTRAP_MANIFEST_SHA
base-checker-sha256:$BOOTSTRAP_CHECKER_SHA
base-workflow-sha256:$BOOTSTRAP_WORKFLOW_SHA
head-manifest-sha256:$HEAD_MANIFEST_SHA
-->
EOF
)
(
  cd "$BOOTSTRAP_CHECKOUT"
  PR_BODY="$PR_BODY" \
  GITHUB_EVENT_NAME=pull_request_target \
  TZ=UTC node tools/test262/es2015-provenance-check.js \
    --check-range \
    --base="$BOOTSTRAP_SHA" \
    --head="$MIGRATION_HEAD" \
    --pr-body-env=PR_BODY
)
```

Expected: PASS.

- [ ] **Step 9: Obtain independent migration review**

Require reviewers to verify:

- exact bootstrap pins;
- no executable or generated semantic output changes;
- exact profile and fragment preservation;
- exact P0/H0 records;
- legacy marker retirement.

Fix findings only through data/docs changes allowed by BASE.

---

### Task 8: Deliver and Verify the Migration PR

**Files:**

- No new implementation files.

**Interfaces:**

- Consumes: Task 7 migration head.
- Produces: verified schema-v3 main that unblocks H0 and future authority
  preparation.

- [ ] **Step 1: Push and open the migration PR**

Use the exact migration marker. State that the PR is data/docs only and that all
executable authorization came from BASE bootstrap.

- [ ] **Step 2: Verify exact-head gates**

Require:

- active BASE guard sourced from the bootstrap main SHA;
- logged live-main/event/checkout BASE equality;
- ordinary CI terminal success;
- both CodeQL categories terminal success;
- zero results/errors/warnings and zero open alerts;
- unchanged reviewed head.

- [ ] **Step 3: Squash merge**

Use squash merge only after all exact-head reviews and checks are terminal.

- [ ] **Step 4: Verify exact-main state**

Fetch main and verify:

```bash
test "$(jq -r .version tools/test262/es2015-provenance.json)" = 3
test "$(jq '[.rangeProfiles[] | select(.name == "maintenance:issue77-lexical")] | length' tools/test262/es2015-provenance.json)" = 0
test "$(jq '[.roadmapAuthorities[] | select(.code == "P0" and .state == "applied")] | length' tools/test262/es2015-provenance.json)" = 1
test "$(jq '[.roadmapAuthorities[] | select(.code == "H0" and .state == "pending")] | length' tools/test262/es2015-provenance.json)" = 1
```

Also require exact-main CI, both CodeQL categories, zero alerts, and issue #75
still open.

- [ ] **Step 5: Publish coordination evidence**

Update issues #75, #76, #79, and #70 with:

- bootstrap and migration PRs;
- both squash SHAs;
- active guard/check/CodeQL evidence;
- exact H0 pending authority identity;
- explicit statement that #76 and #79 may now reconcile but must consume separate
  BASE pending records.

- [ ] **Step 6: Stop before resuming consumer branches**

The authority migration task is complete. Resume #76, prepare M0 authority for #79,
and continue #75 hierarchy as separate reviewed execution tasks.
<!-- END ROADMAP AUTHORITY PLAN -->
