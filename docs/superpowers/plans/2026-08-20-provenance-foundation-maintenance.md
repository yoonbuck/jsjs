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
- Use no npm install, package lifecycle hook, cache, artifact, secret, write
  token, environment, or unpinned action in the guard.
- Keep ordinary `push` and `pull_request` CI commands and names unchanged.
- Never run broad Test262 locally.

### Expected implementation files

- Modify `.github/workflows/ci.yml`: generated trigger, event-separated job
  graph, and trusted-base guard job.
- Modify `tools/ci/pipeline.js`: the sole source for those generated bytes.
- Modify `test/node/workflow-contract.test.js`: independent parsed-YAML and
  generator drift contracts.
- Modify `tools/test262/es2015-provenance-check.js`: accept exactly
  `pull_request` and `pull_request_target` for body-derived range checking.
- Modify `test/node/es2015-provenance.test.js` only for the narrow event
  contract if that remains its existing test home.
- Modify this plan and its paired design as implementation status changes.
- Modify `docs/testing.md` or `docs/conformance.md` only if the final operational
  guard contract cannot be stated completely in the paired design.

Every path above is already in the exact BASE `foundation-maintenance`
allowlist. No implementation task may add a path.

### Future Task G1: RED workflow security contract

**Files:**

- Modify: `test/node/workflow-contract.test.js`

- [ ] Add a parsed-YAML assertion for a filter-free `pull_request_target`
  trigger with exactly `opened`, `synchronize`, `reopened`, and `edited`.
- [ ] Add an expected `provenance-base-guard` job with the active check-run name
  `Provenance base guard`, condition
  `github.event_name == 'pull_request_target'`, and permissions exactly
  `contents: read` plus `pull-requests: read`.
- [ ] Require guard concurrency keyed by the server-provided PR number with
  `cancel-in-progress: true`, so edited or synchronized stale runs cannot finish
  after their replacement.
- [ ] Require an explicit base-SHA checkout, `fetch-depth: 0`,
  `persist-credentials: false`, `submodules: false`, pinned
  checkout/setup-node actions, Node 20 without cache, no npm, a fixed quoted
  inert fetch of the base repository's advertised
  `refs/pull/<number>/head`, exact fetched-ref and `FETCH_HEAD` equality with
  the event head SHA, and the base checker command with event
  base/head/number/body values passed only through `with` or `env`.
- [ ] Add fork-shaped event cases that prove a different head repository never
  becomes a remote or URL input.
- [ ] Add fail-closed cases for a nonnumeric or zero PR number and a fetched SHA
  mismatch.
- [ ] Reject `allow-unsafe-pr-checkout`, a HEAD checkout, secrets, write
  permissions, caches, artifacts, reusable workflows, unpinned actions,
  command-line PR body interpolation, and any event expression in `run`.
- [ ] Require every existing job to have
  `github.event_name != 'pull_request_target'`.
- [ ] Require event-distinct inactive display names so no skipped job can
  satisfy either the guard requirement or an ordinary CI requirement.
- [ ] Preserve the exact ordinary-event names, commands, steps, needs, pins,
  and environments of all existing jobs.
- [ ] Run only the focused workflow-contract test and confirm RED for the absent
  trigger/job/model.

### Future Task G2: RED checker event contract

**Files:**

- Modify: `test/node/es2015-provenance.test.js`

- [ ] Add one accepted body-derived range check for `GITHUB_EVENT_NAME` equal to
  `pull_request_target`, retaining the existing accepted `pull_request` case.
- [ ] Add rejection cases for `push`, empty, and arbitrary event names.
- [ ] Retain exact failures for non-full base/head SHAs, mismatched resolution,
  equal commits, and non-ancestor base.
- [ ] Retain neutral unmarked success and provenance-owned unmarked,
  duplicate-marker, malformed-marker, and wrong-profile failures.
- [ ] Assert the current BASE `foundation-maintenance` authority and manifest
  remain unchanged.
- [ ] Run only the focused provenance test and confirm RED for the target event.

### Future Task G3: Minimal checker extension

**Files:**

- Modify: `tools/test262/es2015-provenance-check.js`
- Test: `test/node/es2015-provenance.test.js`

- [ ] Change the `--pr-body-env` event guard from one accepted event to the
  exact set `pull_request`, `pull_request_target`.
- [ ] Do not alter CLI shape, marker grammar, ownership, profile resolution,
  Git commands, range validation, manifest parsing, or content validation.
- [ ] Run the focused provenance test and confirm GREEN.

### Future Task G4: Generated event-separated workflow

**Files:**

- Modify: `tools/ci/pipeline.js`
- Generate: `.github/workflows/ci.yml`
- Test: `test/node/workflow-contract.test.js`

- [ ] Extend the structured job model only for job `if`, guard concurrency, job
  permissions, event-distinct display names, and a custom guard setup.
- [ ] Add the filter-free `pull_request_target` trigger.
- [ ] Add `provenance-base-guard` with no `needs`.
- [ ] Give the guard a PR-number concurrency group with stale-run
  cancellation.
- [ ] Check out only `${{ github.event.pull_request.base.sha }}` with full
  history and non-persisted credentials.
- [ ] Set up Node 20 through the current immutable pin without npm caching or
  dependency installation.
- [ ] Pass `${{ github.event.pull_request.number }}` through `env`, validate it
  against `^[1-9][0-9]*$`, and fetch only the base checkout's advertised
  `+refs/pull/${PR_NUMBER}/head:refs/remotes/pull/${PR_NUMBER}/head` from the
  fixed `origin`.
- [ ] Require both the fetched remote-tracking ref and `FETCH_HEAD` to resolve
  exactly to `${{ github.event.pull_request.head.sha }}` before invoking the
  checker.
- [ ] Never raw-fetch the head SHA, add/fetch the attacker fork remote, or use a
  remote URL derived from HEAD event data.
- [ ] Keep fetched HEAD objects inert without checkout, extraction, submodules,
  or execution.
- [ ] Run only the checked-out base checker/module using explicit event
  base/head and the full PR body from an environment variable.
- [ ] Add explicit privileged-event exclusions and distinct inactive names to
  every ordinary job while preserving ordinary behavior.
- [ ] Generate `ci.yml`, inspect the exact diff, run the focused workflow
  contract, and confirm GREEN.

### Future Task G5: Focused validation and live BASE evidence

**Files:**

- Inspect every changed implementation file.

- [ ] Run the focused provenance and workflow-contract Node suites together.
- [ ] Run generated workflow drift, typecheck, lint, format, and
  `git diff --check`.
- [ ] Verify the canonical provenance manifest SHA-256 remains
  `f65f9a499acb92a933fedc5ee9197cc6a4c51ce30b5180cc741b23a93c9dfe92`
  and semantic/generated taxonomy outputs have no diff.
- [ ] Materialize an isolated temporary checkout of exact BASE
  `1925873700c180fc38e7e020fc4b631c1866b082`, fetch the reviewed implementation
  HEAD as inert objects, and invoke that BASE
  `tools/test262/es2015-provenance-check.js` with the actual base/head and exact
  PR marker/body. Do not run the implementation branch's checker as substitute
  evidence.
- [ ] Remove the temporary checkout after recording the successful command and
  identities.
- [ ] Do not run broad Test262, audit write mode, browser, JavaScriptCore, or
  `ci:contract`.

### Future Task G6: Independent review and bootstrap release

**Files:**

- Review the complete guard implementation diff and generated YAML.

- [ ] Obtain an independent GitHub Actions security review for workflow source,
  permissions, checkout/fetch behavior, shell injection, HEAD non-execution,
  job/check naming, skipped-job conclusions, and required-check semantics.
- [ ] Obtain an independent provenance-spec review for exact BASE authority,
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
  `Provenance base guard` is attached to the current PR head and sourced from
  the guard-bearing default branch. Only then configure that exact GitHub
  Actions context as required; no skipped inactive context is acceptable.
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
