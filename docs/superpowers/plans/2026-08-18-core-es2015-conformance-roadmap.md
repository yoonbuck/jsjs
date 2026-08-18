# Core ECMAScript 2015 Conformance Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the approved issue #71 design, refresh its Test262 taxonomy from the definitive #61 merge, create and verify the approved native GitHub roadmap under #70, and close #71 without changing guest production behavior.

**Architecture:** Treat the approved design as the immutable architecture source and a session-state manifest as the operational source for refreshed counts, issue bodies, and dependency edges. Wait for #61 before deriving final evidence or creating implementation children, generate all GitHub bodies and relationships from one code-keyed graph, and verify live GitHub state against that graph before closing #71.

**Tech Stack:** Git, GitHub CLI and REST issue relationship APIs, the app-native `create_issue` and pull-request tools, ECMAScript modules, Node.js, Test262 revision `b363f29d3c43c626dc852744ad64a0b48a003693`, JSON, Prettier, Node invariant scripts, Node/Chromium/JavaScriptCore CI, and `TZ=UTC`.

## Global Constraints

- This plan executes issue #71 only. It must not modify `src/`, production runtime behavior, Test262 feature claims, or broad production selection policy.
- The approved design is `docs/superpowers/specs/2026-08-18-core-es2015-conformance-roadmap-design.md` at or after commit `e30277059957ca09267255847c7868e23ed0ed43`.
- Do not create implementation issues, update #70, or start production sessions until #61 is closed, its exact merge SHA is on `origin/main`, and the refreshed taxonomy is complete.
- Generate every Test262-derived artifact under `TZ=UTC`.
- Keep Test262 pinned to the repository/revision in `package.json`; a pin move is out of scope and must stop execution.
- Never globally enable a Test262 feature tag to inflate coverage. Refresh execution names exact paths and proves only their audited dependency closure.
- Keep the whole-tree partition mutually exclusive and exactly balanced in roots and executable variants.
- Preserve separate core, Annex B, later, unknown, harness, and malformed classes.
- Use only refreshed post-#61 path identities and counts in #70 and new issue bodies.
- Use app-native `create_issue` for issue creation. Use GitHub REST only for milestone updates, native sub-issue links, native blocked-by links, body updates, comments, and state verification.
- Mandatory children receive milestone number `1` (`ES2015`). Optional Annex B child `A0` receives no milestone.
- Every implementation issue created while #61 is open must be natively blocked by #61. The intended execution creates no implementation issue until #61 is merged.
- Grouping issues own no production PR. Atomic issues state a one-PR boundary. Tracking issue V0 accumulates proof through owning semantic PRs.
- Do not create nested production children for grouping issues during issue #71 execution; their later blocker audits and plans own that work.
- All commits include `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`.
- Use GPT-5.6-family models or Claude Opus 4.8 or lower for review; never Claude Opus 5.

## File and interface map

### Repository files

- Existing design source:
  `docs/superpowers/specs/2026-08-18-core-es2015-conformance-roadmap-design.md`.
- Create this execution plan:
  `docs/superpowers/plans/2026-08-18-core-es2015-conformance-roadmap.md`.
- Modify after #61 only:
  `docs/superpowers/specs/2026-08-18-core-es2015-conformance-roadmap-design.md`
  to add refreshed SHA, counts, path-identity changes, and evidence hashes.
- Do not modify production or test files in issue #71.

### Session-state artifacts

Use this exact persistent artifact directory:

```bash
ARTIFACTS=/Users/jordan/.copilot/session-state/345a35c4-93fb-4884-962a-f18f57dbf052/files
```

Existing analysis inputs:

- `$ARTIFACTS/ecma262-6.html`
- `$ARTIFACTS/ecma262-6-anchors.json`
- `$ARTIFACTS/es2015-inventory.mjs`
- `$ARTIFACTS/es2015-inventory.raw.json`
- `$ARTIFACTS/es2015-inventory.summary.txt`
- `$ARTIFACTS/run-es2015-audit.mjs`
- `$ARTIFACTS/es2015-audit-results.json`
- `$ARTIFACTS/classify-es2015.mjs`
- `$ARTIFACTS/es2015-classification.json`

Create during execution:

- `$ARTIFACTS/es2015-classification.5326cc6.json`: immutable pre-#61
  classification baseline.
- `$ARTIFACTS/es2015-path-delta.json`: exact added, removed, and reclassified
  paths after #61.
- `$ARTIFACTS/es2015-refresh-manifest.json`: refreshed SHA, Test262 pin,
  partition tables, blocker ledger, artifact hashes, and path-set changes.
- `$ARTIFACTS/es2015-issue-graph.json`: approved code-keyed issue definitions and
  dependency edges populated with refreshed counts.
- `$ARTIFACTS/es2015-created-issues.json`: code to issue number/database ID/URL.
- `$ARTIFACTS/render-es2015-issues.mjs`: deterministic body and edge renderer.
- `$ARTIFACTS/es2015-issue-bodies/`: generated parent and child body files.
- `$ARTIFACTS/es2015-live-graph.json`: final GitHub verification snapshot.
- `$ARTIFACTS/issue-71-refresh-comment.md`: refreshed audit evidence for #71.
- `$ARTIFACTS/issue-71-final-comment.md`: verified hierarchy and closure
  evidence.
- `$ARTIFACTS/issue-70-before.json`: concurrency snapshot before parent update.
- `$ARTIFACTS/issue-70-body.md`: qualified core parent body.
- `$ARTIFACTS/issue-70-update.json`: atomic parent REST payload.
- `$ARTIFACTS/issue-70-after.json`: post-update parent snapshot.
- `$ARTIFACTS/es2015-existing-issues.json`: duplicate/resume discovery input.
- `$ARTIFACTS/live-sub-issues.json`: final native child snapshot.

### Operational interfaces

- `es2015-refresh-manifest.json` is the only count/path evidence consumed by
  issue-body generation.
- `es2015-issue-graph.json` is the only source for issue type, title, scope,
  dependencies, milestone, and parent relationships.
- `es2015-created-issues.json` is the only code-to-number/database-ID mapping.
- Native relationship endpoints use REST database IDs:
  - `POST /repos/yoonbuck/jsjs/issues/70/sub_issues` with
    `{"sub_issue_id": child.id}`.
  - `POST /repos/yoonbuck/jsjs/issues/${issue.number}/dependencies/blocked_by`
    with `{"issue_id": blocker.id}`.
- Issue bodies use actual issue numbers only after every top-level issue exists.

---

### Task 1: Publish and Review the Approved Design Without Production Changes

**Files:**

- Verify:
  `docs/superpowers/specs/2026-08-18-core-es2015-conformance-roadmap-design.md`
- Verify:
  `docs/superpowers/plans/2026-08-18-core-es2015-conformance-roadmap.md`
- Do not modify: `src/**`, `test/**`, `tools/**`, `package.json`

**Interfaces:**

- Consumes: approved design commit
  `e30277059957ca09267255847c7868e23ed0ed43`.
- Produces: a design-only pull request with exact reviewed head and clean CI;
  no implementation hierarchy.

- [ ] **Step 1: Verify the branch contains documentation only**

Run:

```bash
git status --short --branch
git --no-pager log --oneline --decorate -6
git --no-pager diff --name-only origin/main...HEAD
```

Expected:

- the worktree is clean;
- design and plan commits are on the roadmap branch; and
- every changed path is exactly one of:
  - `docs/superpowers/specs/2026-08-18-core-es2015-conformance-roadmap-design.md`
  - `docs/superpowers/plans/2026-08-18-core-es2015-conformance-roadmap.md`

Stop if any production, test, tooling, package, generated conformance, or
selection file differs from `origin/main`.

- [ ] **Step 2: Re-run documentation and arithmetic gates**

Run:

```bash
npx prettier --check \
  docs/superpowers/specs/2026-08-18-core-es2015-conformance-roadmap-design.md \
  docs/superpowers/plans/2026-08-18-core-es2015-conformance-roadmap.md
git --no-pager diff --check origin/main...HEAD
git --no-pager show --check --oneline HEAD
node - <<'NODE'
const checks = {
  wholeRoots: [[24250, 725, 26170, 2311, 116, 3], 53575],
  wholeVariants: [[46424, 960, 51240, 4052, 232, 0], 102908],
  unknownRoots: [[1193, 772, 314, 32], 2311],
  unknownVariants: [[2208, 1457, 323, 64], 4052],
  coreRoots: [[13269, 6318, 4661, 2], 24250],
  coreVariants: [[25328, 11952, 9140, 4], 46424],
  blockerRoots: [[1501, 780, 623, 489, 534, 294, 135, 136, 83, 54, 32], 4661],
  blockerVariants: [[2994, 1547, 1211, 956, 1064, 574, 267, 223, 164, 108, 32], 9140],
};
for (const [name, [parts, expected]] of Object.entries(checks)) {
  const actual = parts.reduce((sum, value) => sum + value, 0);
  console.log(`${name}: ${actual}`);
  if (actual !== expected) process.exitCode = 1;
}
NODE
```

Expected: formatting and whitespace checks exit 0, and every printed sum equals
its expected value.

- [ ] **Step 3: Obtain fresh written-spec and plan reviews**

Request separate high-capability reviews:

1. Specification review against issue #71, parent #70, and the approved
   conversational decisions.
2. Plan review against this document's seven requested phases, post-#61 gate,
   exact file/command coverage, and no-production constraint.

Fix every Important or higher finding. For count or dependency findings, add or
update an executable Node invariant before changing prose. Repeat both reviews
until clean.

- [ ] **Step 4: Create the design-only pull request**

Use the app-native pull-request tool:

```text
title: Design the core ECMAScript 2015 conformance roadmap
draft: false
body:
  - Links #71 and parent #70.
  - States analysis/design only and no guest behavior changes.
  - Names design and execution-plan paths.
  - States all implementation issue creation waits for #61 and refreshed UTC
    evidence.
  - Summarizes the balanced baseline without presenting it as release evidence.
```

Expected: a PR targeting `main` from the current roadmap branch.

- [ ] **Step 5: Verify the exact reviewed PR head and CI**

Resolve the PR number and reviewed head:

```bash
PR=$(gh pr list --repo yoonbuck/jsjs \
  --head yoonbuck-es2015-completion-roadmap \
  --state open --json number --jq '.[0].number')
REVIEWED_HEAD=$(gh pr view "$PR" --repo yoonbuck/jsjs --json headRefOid --jq .headRefOid)
gh run list --repo yoonbuck/jsjs --commit "$REVIEWED_HEAD" --json databaseId,headSha,status,conclusion,name
```

Continue useful local review before waiting. Then synchronously watch the exact
run. If it continues beyond the initial wait, use 600-second reads on the same
shell session:

```bash
RUN_ID=$(gh run list --repo yoonbuck/jsjs --commit "$REVIEWED_HEAD" \
  --json databaseId,headSha --jq \
  'map(select(.headSha == "'"$REVIEWED_HEAD"'")) | .[0].databaseId')
gh run watch "$RUN_ID" --repo yoonbuck/jsjs --exit-status
```

After completion:

```bash
test "$(gh pr view "$PR" --repo yoonbuck/jsjs --json headRefOid --jq .headRefOid)" = "$REVIEWED_HEAD"
gh pr checks "$PR" --repo yoonbuck/jsjs
```

Expected: the head is unchanged and every expected check has a successful
terminal state. For any CodeQL job, inspect SARIF/log output rather than relying
only on the green job label.

- [ ] **Step 6: Merge the design PR and record its exact merge SHA**

Merge only after clean reviews and exact-head CI. Record:

```bash
gh pr view "$PR" --repo yoonbuck/jsjs --json state,mergedAt,mergeCommit,url
```

Expected: merged state and a non-null merge commit. Do not close #71 yet.

---

### Task 2: Wait for and Verify the Definitive #61 Merge

**Files:**

- Read: issue #61 and its release PR/CI evidence.
- Read: `package.json`
- Read: `vendor/test262/.git/HEAD`
- Do not modify repository files.

**Interfaces:**

- Consumes: closed issue #61, its exact merge SHA, and `origin/main`.
- Produces: `RELEASE_SHA`, a verified ancestor of current `origin/main`, plus a
  clean post-release audit worktree.

- [ ] **Step 1: Check the release gate without polling destructively**

Run:

```bash
gh issue view 61 --repo yoonbuck/jsjs --json state,closedAt,title,url
gh issue view 61 --repo yoonbuck/jsjs --comments
gh pr list --repo yoonbuck/jsjs --state open \
  --json number,title,headRefOid,baseRefName,url
```

Expected before release: #61 may remain open. If open, stop this task and wait
for a coordinator notification. Do not create children, update #70, or infer a
release SHA from an unmerged PR head.

- [ ] **Step 2: Resolve the exact release merge SHA after closure**

After #61 closes:

```bash
git fetch origin main --quiet
ORIGIN_MAIN=$(git rev-parse origin/main)
gh issue view 61 --repo yoonbuck/jsjs --comments
```

Extract `RELEASE_SHA` only from the final #61 merge evidence or the merged
release PR's `mergeCommit.oid`. Then verify:

```bash
git cat-file -e "$RELEASE_SHA^{commit}"
git merge-base --is-ancestor "$RELEASE_SHA" origin/main
test "$(git merge-base "$RELEASE_SHA" origin/main)" = "$RELEASE_SHA"
```

Expected: every command exits 0. Stop if #61 is closed without an exact merge
SHA, the SHA is not on `origin/main`, or a release PR is still unmerged.

- [ ] **Step 3: Verify #61's exact-head release evidence**

Read the release PR and workflow run named by #61:

```bash
RELEASE_PR=$(gh pr list --repo yoonbuck/jsjs --state merged \
  --search '"Integrate and release async runtime and modules" in:title' \
  --json number,mergeCommit --jq \
  'map(select(.mergeCommit.oid == "'"$RELEASE_SHA"'")) | .[0].number')
RELEASE_RUN=$(gh run list --repo yoonbuck/jsjs --commit "$RELEASE_SHA" \
  --json databaseId,headSha --jq \
  'map(select(.headSha == "'"$RELEASE_SHA"'")) | .[0].databaseId')
gh pr view "$RELEASE_PR" --repo yoonbuck/jsjs \
  --json state,mergedAt,mergeCommit,headRefOid,statusCheckRollup,url
gh run view "$RELEASE_RUN" --repo yoonbuck/jsjs --json headSha,status,conclusion,jobs
```

Expected:

- PR merged;
- recorded reviewed head equals the workflow `headSha`;
- every expected check is successful;
- final whole-milestone review is clean; and
- no unresolved security or CodeQL finding remains.

- [ ] **Step 4: Rebase the documentation branch onto released main**

Require a clean worktree:

```bash
test -z "$(git status --porcelain)"
git rebase origin/main
git --no-pager diff --name-only origin/main...HEAD
```

Expected: only the approved design and plan paths differ. Resolve no production
conflict by discarding released code; stop and request review if either
documentation file conflicts semantically with #61 evidence.

- [ ] **Step 5: Verify the pinned Test262 checkout**

Run:

```bash
PIN=$(node -p "require('./package.json').test262.revision")
CHECKOUT=$(node -p "require('./package.json').test262.checkoutPath")
test "$(git -C "$CHECKOUT" rev-parse HEAD)" = "$PIN"
git -C "$CHECKOUT" status --short
```

Expected: checkout HEAD equals the package pin and the checkout is clean. If the
pin changed in #61, stop: moving or reinterpreting the Test262 pin requires a
separate reviewed decision before refresh.

---

### Task 3: Refresh Taxonomy, Counts, and Path Identities Under UTC

**Files:**

- Read/execute:
  `$ARTIFACTS/es2015-inventory.mjs`
- Read/execute:
  `$ARTIFACTS/run-es2015-audit.mjs`
- Read/execute:
  `$ARTIFACTS/classify-es2015.mjs`
- Create:
  `$ARTIFACTS/es2015-classification.5326cc6.json`
- Create:
  `$ARTIFACTS/es2015-refresh-manifest.json`
- Do not modify repository production files.

**Interfaces:**

- Consumes: `RELEASE_SHA`, the pinned Test262 checkout, baseline classification,
  and exact Sixth Edition source/anchors.
- Produces: deterministic refreshed inventory, focused execution, classification,
  blocker ledger, baseline delta, and hashes.

- [ ] **Step 1: Preserve the immutable baseline before regeneration**

Run:

```bash
ARTIFACTS=/Users/jordan/.copilot/session-state/345a35c4-93fb-4884-962a-f18f57dbf052/files
test -f "$ARTIFACTS/es2015-classification.json"
cp "$ARTIFACTS/es2015-classification.json" \
  "$ARTIFACTS/es2015-classification.5326cc6.json"
shasum -a 256 "$ARTIFACTS/es2015-classification.5326cc6.json"
```

Expected baseline classification hash:
`1001e6caefc850e6c0929791d68434c1e854a15d0daa87fa79e49a6de357b4f2`.
Stop if it differs; investigate artifact drift before overwriting anything.

- [ ] **Step 2: Rebuild the edition inventory under UTC**

Run:

```bash
TZ=UTC node "$ARTIFACTS/es2015-inventory.mjs" \
  > "$ARTIFACTS/es2015-inventory.summary.txt"
```

Expected: exit 0 and a new timestamp-free
`$ARTIFACTS/es2015-inventory.raw.json`.

Failure conditions:

- package/check-out pin mismatch;
- unknown or conflicting metadata shape;
- missing Sixth Edition source/anchor identity;
- later-dependency rule without a reviewed reason; or
- any non-UTC run.

- [ ] **Step 3: Run exact unselected ES2015 roots**

Run synchronously with a 600-second initial wait:

```bash
TZ=UTC node "$ARTIFACTS/run-es2015-audit.mjs"
```

If still running, use 600-second reads on the same shell session. Do not rerun a
live audit. Expected: exit 0 and deterministic
`$ARTIFACTS/es2015-audit-results.json`.

This command may bypass feature gates only for the exact audited roots. It must
not edit `tools/test262/features.json` or `tools/test262/upstream-subset.json`.

- [ ] **Step 4: Generate the mutually exclusive classification**

Run:

```bash
TZ=UTC node "$ARTIFACTS/classify-es2015.mjs"
```

Expected: exit 0 and a timestamp-free
`$ARTIFACTS/es2015-classification.json`.

- [ ] **Step 5: Verify structural invariants from the generated data**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const file =
  '/Users/jordan/.copilot/session-state/345a35c4-93fb-4884-962a-f18f57dbf052/files/es2015-classification.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const paths = data.classifications.map((entry) => entry.path);
const roots = data.classifications.length;
const variants = data.classifications.reduce(
  (sum, entry) => sum + entry.variants,
  0,
);
if (new Set(paths).size !== roots) throw new Error('duplicate classified path');
if (paths.join('\0') !== [...paths].sort().join('\0')) {
  throw new Error('classification paths are not code-unit sorted');
}
const categoryRoots = Object.values(data.categories).reduce(
  (sum, entry) => sum + entry.files,
  0,
);
const categoryVariants = Object.values(data.categories).reduce(
  (sum, entry) => sum + entry.records,
  0,
);
if (categoryRoots !== roots || categoryVariants !== variants) {
  throw new Error(
    `partition mismatch: classifications=${roots}/${variants}, ` +
      `categories=${categoryRoots}/${categoryVariants}`,
  );
}
for (const entry of data.classifications) {
  if (!entry.finalClass) throw new Error(`missing class: ${entry.path}`);
  if (entry.finalClass === 'blocked' && !entry.blocker) {
    throw new Error(`missing blocker: ${entry.path}`);
  }
}
console.log({ roots, variants, categories: data.categories, blockers: data.blockers });
NODE
```

Expected: one unique sorted entry per root, balanced categories, and a named
blocker for every blocked root.

- [ ] **Step 6: Compute exact baseline path-set changes**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const dir =
  '/Users/jordan/.copilot/session-state/345a35c4-93fb-4884-962a-f18f57dbf052/files';
const before = JSON.parse(
  fs.readFileSync(`${dir}/es2015-classification.5326cc6.json`, 'utf8'),
);
const after = JSON.parse(
  fs.readFileSync(`${dir}/es2015-classification.json`, 'utf8'),
);
const prior = new Map(before.classifications.map((entry) => [entry.path, entry]));
const next = new Map(after.classifications.map((entry) => [entry.path, entry]));
const added = [...next.keys()].filter((path) => !prior.has(path)).sort();
const removed = [...prior.keys()].filter((path) => !next.has(path)).sort();
const moved = [...next.keys()]
  .filter((path) => {
    const old = prior.get(path);
    const value = next.get(path);
    return (
      old &&
      (old.finalClass !== value.finalClass || old.blocker !== value.blocker)
    );
  })
  .sort();
fs.writeFileSync(
  `${dir}/es2015-path-delta.json`,
  `${JSON.stringify({ added, removed, moved }, null, 2)}\n`,
);
console.log({ added: added.length, removed: removed.length, moved: moved.length });
NODE
```

Expected: an exact sorted delta. Every changed path must be explained by #61
behavior, a Test262 pin change already approved separately, or a corrected
classification rule. Unexplained changes stop the task.

- [ ] **Step 7: Write the refresh manifest**

Create `$ARTIFACTS/es2015-refresh-manifest.json` from this exact object shape:

```js
const manifest = {
  version: 1,
  releaseSha: process.env.RELEASE_SHA,
  mainSha: process.env.ORIGIN_MAIN,
  test262: {
    repository: packageManifest.test262.repository,
    revision: packageManifest.test262.revision,
  },
  specification: {
    url: 'https://262.ecma-international.org/6.0/',
    sha256: '4d4243dc2f04c9cdd09498f2cc2af6f6cdc07b0430da5578e7cf440d4f7846a0',
    anchorsSourceArtifact:
      '/Users/jordan/.copilot/session-state/345a35c4-93fb-4884-962a-f18f57dbf052/files/ecma262-6-anchors.json',
    plannedRepositoryArtifact: 'tools/test262/es2015-anchors.json',
    anchors: 3448,
  },
  partitions: derivedPartitions,
  coreStatuses: derivedCoreStatuses,
  annexStatuses: derivedAnnexStatuses,
  blockers: classification.blockers,
  pathDelta,
  artifacts: artifactHashes,
};
```

Populate every empty object/array/string from generated artifacts and
`es2015-path-delta.json`; do not copy baseline constants. Hash with:

```bash
shasum -a 256 \
  "$ARTIFACTS/es2015-inventory.raw.json" \
  "$ARTIFACTS/es2015-audit-results.json" \
  "$ARTIFACTS/es2015-classification.json" \
  "$ARTIFACTS/es2015-path-delta.json"
```

- [ ] **Step 8: Re-run the refresh byte-for-byte**

Hash the four outputs, rerun Steps 2-4 under `TZ=UTC`, and hash again.

Expected: identical hashes. Stop if timestamps, host locale, ordering, or
nondeterministic messages change any file.

---

### Task 4: Update the Spec and Issue #71 Evidence With Refreshed Values

**Files:**

- Modify:
  `docs/superpowers/specs/2026-08-18-core-es2015-conformance-roadmap-design.md`
- Read:
  `$ARTIFACTS/es2015-refresh-manifest.json`
- Create:
  `$ARTIFACTS/issue-71-refresh-comment.md`

**Interfaces:**

- Consumes: the deterministic refresh manifest.
- Produces: committed refreshed design evidence and a matching #71 evidence
  comment.

- [ ] **Step 1: Add an explicit post-#61 evidence section**

Modify the design without changing approved architecture. Add a section after
`## Status` containing:

```markdown
## Definitive post-#61 evidence

- #61 merge SHA: `${refresh.releaseSha}`
- Audited `origin/main`: `${refresh.mainSha}`
- Test262: `${refresh.test262.repository}` at `${refresh.test262.revision}`
- UTC classification artifact SHA-256:
  `${refresh.artifacts.classificationSha256}`
- Path delta from the design baseline: `${refresh.pathDelta.added.length}` added,
  `${refresh.pathDelta.removed.length}` removed,
  `${refresh.pathDelta.moved.length}` reclassified

`${renderPartitionTable(refresh.partitions)}`

`${renderStatusTable(refresh.coreStatuses)}`

`${renderStatusTable(refresh.annexStatuses)}`

`${renderBlockerTable(refresh.blockers)}`
```

Replace baseline values in sections that explicitly drive issue scopes and
percentages. Retain the old `5326cc6` table only under a clearly labeled
historical design-baseline subsection. Every rendered percentage uses exactly
three decimal places.

- [ ] **Step 2: Verify every displayed count against the manifest**

Write a one-off Node check that reads the Markdown and manifest and asserts every
refreshed integer and percentage token used in the four tables appears exactly
where expected. At minimum assert:

- partition roots sum to refreshed whole roots;
- partition variants sum to refreshed whole variants;
- core statuses sum to refreshed core;
- Annex statuses sum to refreshed Annex B;
- blocker rows sum to refreshed blocked core; and
- blocker plus deviations equals the unresolved mandatory total.

Expected: exit 0. Never repair a mismatch by manually changing the manifest.

- [ ] **Step 3: Format and self-review the refreshed spec**

Run:

```bash
npx prettier --write \
  docs/superpowers/specs/2026-08-18-core-es2015-conformance-roadmap-design.md
npx prettier --check \
  docs/superpowers/specs/2026-08-18-core-es2015-conformance-roadmap-design.md
git --no-pager diff --check
rg -n 'T[B]D|T[O]DO|FIXM[E]|placeholde[r]|issue [0]' \
  docs/superpowers/specs/2026-08-18-core-es2015-conformance-roadmap-design.md
```

Expected: formatting and diff checks pass; `rg` prints nothing.

Self-review:

- refreshed evidence is clearly definitive;
- historical counts are not used in issue generation;
- all partitions reconcile;
- atomic/grouping/tracking labels are unchanged unless a reviewed planning
  decision changed one;
- semantic and sequencing dependencies remain distinct;
- A0 remains non-blocking and non-milestoned; and
- no implementation requirement was weakened by count movement.

- [ ] **Step 4: Obtain fresh spec and quality review**

Request:

1. a specification review comparing the refreshed document with the approved
   design and refresh manifest; and
2. a quality review focused on arithmetic, provenance, stale baseline leakage,
   path-delta explanations, and dependency consistency.

Fix every Important or higher finding and repeat until clean.

- [ ] **Step 5: Commit the refreshed evidence**

Run:

```bash
git add \
  docs/superpowers/specs/2026-08-18-core-es2015-conformance-roadmap-design.md
git commit -m "docs: refresh core ES2015 roadmap evidence" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
git --no-pager show --check --oneline HEAD
```

Expected: one documentation commit and no whitespace errors.

- [ ] **Step 6: Publish matching evidence on #71**

Create `$ARTIFACTS/issue-71-refresh-comment.md` from the manifest with:

- release/main/Test262 SHAs;
- exact artifact hashes;
- balanced partition;
- core and Annex status;
- blocker ledger;
- path delta summary with artifact location;
- refreshed spec commit; and
- statement that no production behavior changed.

Post:

```bash
gh issue comment 71 --repo yoonbuck/jsjs \
  --body-file "$ARTIFACTS/issue-71-refresh-comment.md"
```

Re-read the comment from the issue timeline and compare every number to the
manifest. Do not close #71.

---

### Task 5: Update Parent #70 to the Qualified Core Claim

**Files:**

- Read: live issue #70 JSON.
- Create: `$ARTIFACTS/issue-70-before.json`
- Create: `$ARTIFACTS/issue-70-body.md`
- Create: `$ARTIFACTS/issue-70-update.json`

**Interfaces:**

- Consumes: refreshed manifest and approved design.
- Produces: #70 titled `Complete core ECMAScript 2015 conformance` with balanced
  evidence and qualified acceptance.

- [ ] **Step 1: Snapshot live #70 and reject concurrent drift**

Run:

```bash
gh api repos/yoonbuck/jsjs/issues/70 \
  > "$ARTIFACTS/issue-70-before.json"
node - <<'NODE'
const issue = require(
  '/Users/jordan/.copilot/session-state/345a35c4-93fb-4884-962a-f18f57dbf052/files/issue-70-before.json',
);
if (issue.state !== 'open') throw new Error('#70 must be open');
const allowedTitles = new Set([
  'Complete ES2015 conformance',
  'Complete core ECMAScript 2015 conformance',
]);
if (!allowedTitles.has(issue.title)) {
  throw new Error(`unexpected #70 title: ${issue.title}`);
}
NODE
```

If the title is already qualified, compare its live body to the approved design
and generated update before patching. Reject unrelated concurrent content
instead of assuming a re-run or overwriting it.

- [ ] **Step 2: Render the exact qualified parent body**

Create `$ARTIFACTS/issue-70-body.md` with these sections and refreshed values:

```markdown
## Claim

Complete mandatory ECMA-262 Sixth Edition main-body conformance. This is a core
ECMAScript 2015 claim, not Annex B/browser-compatibility completeness.

## Definitive baseline

- Async runtime/modules release: `${refresh.releaseSha}`
- Audited main: `${refresh.mainSha}`
- Test262: `${refresh.test262.repository}` at
  `${refresh.test262.revision}`

`${renderPartitionTable(refresh.partitions)}`

## Delivery

- Architecture and evidence: #71 and the committed roadmap spec.
- Atomic children own one reviewed PR.
- Grouping children own no production commit and close through nested reviewed
  children.
- V0 is the living mandatory clause matrix.
- Every merge reclassifies exact roots under `TZ=UTC`.

## Acceptance

- Every refreshed core root and variant is selected and passing.
- Zero mandatory blocker or deviation records.
- Zero ECMA-262-relevant unknowns, or reviewed proof that remaining unknowns
  lack affirmative ES2015 evidence.
- Every mandatory Sixth Edition matrix row is resolved.
- Node, Chromium, JavaScriptCore, pinned Test262, exact-SHA CI, CodeQL, and final
  maximum-capability review are clean.
- Annex B remains separately visible and non-blocking.

## Optional Annex B

The native optional child remains outside the ES2015 milestone and does not
block core closure. Existing supported Annex B behavior cannot regress.
```

Do not list child issue numbers until Task 6 creates them.

- [ ] **Step 3: Prepare and apply a single REST update**

Create `$ARTIFACTS/issue-70-update.json`:

```js
const update = {
  title: 'Complete core ECMAScript 2015 conformance',
  body: fs.readFileSync(`${artifacts}/issue-70-body.md`, 'utf8'),
  milestone: 1,
};
fs.writeFileSync(
  `${artifacts}/issue-70-update.json`,
  `${JSON.stringify(update)}\n`,
);
```

Apply:

```bash
gh api --method PATCH repos/yoonbuck/jsjs/issues/70 \
  --input "$ARTIFACTS/issue-70-update.json"
```

Expected: title, body, and milestone update in one response.

- [ ] **Step 4: Re-read and verify #70**

Run:

```bash
gh api repos/yoonbuck/jsjs/issues/70 \
  > "$ARTIFACTS/issue-70-after.json"
```

Use Node to assert exact title/body/milestone equality against the update JSON.
Also assert issue #70 remains open.

---

### Task 6: Create and Wire the Approved Native Issue Hierarchy

**Files:**

- Create: `$ARTIFACTS/es2015-issue-graph.json`
- Create: `$ARTIFACTS/es2015-created-issues.json`
- Create: `$ARTIFACTS/render-es2015-issues.mjs`
- Create directory: `$ARTIFACTS/es2015-issue-bodies/`
- Read: `$ARTIFACTS/es2015-refresh-manifest.json`

**Interfaces:**

- Consumes: refreshed manifest, approved stable codes/titles/delivery kinds, and
  the exact dependency graph.
- Produces: 27 top-level native sub-issues of #70, milestone assignments, final
  numbered bodies, and native blocked-by edges without duplicates.

- [ ] **Step 1: Create the code-keyed graph manifest**

Write `$ARTIFACTS/es2015-issue-graph.json` with version 1 and these exact nodes:

```json
{
  "version": 1,
  "parent": 70,
  "milestone": 1,
  "nodes": [
    {
      "code": "T0",
      "delivery": "atomic",
      "title": "Publish deterministic ES2015 Test262 taxonomy and promote exact passing roots",
      "dependsOn": [71],
      "milestone": 1
    },
    {
      "code": "T1",
      "delivery": "grouping",
      "title": "Adjudicate unknown Test262 edition provenance",
      "dependsOn": ["T0"],
      "milestone": 1
    },
    {
      "code": "H0",
      "delivery": "atomic",
      "title": "Implement portable harness-only Test262 cross-Realm support",
      "dependsOn": ["T0"],
      "milestone": 1
    },
    {
      "code": "P0",
      "delivery": "atomic",
      "title": "Complete ES2015 lexical grammar and new.target",
      "dependsOn": ["T0"],
      "milestone": 1
    },
    {
      "code": "P1",
      "delivery": "grouping",
      "title": "Complete core ES2015 early errors and declaration instantiation",
      "dependsOn": ["P0", "H0"],
      "milestone": 1
    },
    {
      "code": "M0",
      "delivery": "atomic",
      "title": "Formalize the ES2015 object internal-method contract",
      "dependsOn": ["T0"],
      "milestone": 1
    },
    {
      "code": "M1",
      "delivery": "atomic",
      "title": "Complete ES2015 Reflect atop the internal-method contract",
      "dependsOn": ["M0"],
      "milestone": 1
    },
    {
      "code": "M2",
      "delivery": "atomic",
      "title": "Implement ES2015 Proxy traps, revocation, and invariants",
      "dependsOn": ["M0", "M1"],
      "milestone": 1
    },
    {
      "code": "S0",
      "delivery": "atomic",
      "title": "Complete non-RegExp ES2015 Symbol protocol dispatch",
      "dependsOn": ["M0"],
      "milestone": 1
    },
    {
      "code": "C0",
      "delivery": "atomic",
      "title": "Implement the ordered collection kernel and ES2015 Map",
      "dependsOn": ["H0", "M0", "S0"],
      "milestone": 1
    },
    {
      "code": "C1",
      "delivery": "atomic",
      "title": "Implement ES2015 Set and live collection iterators",
      "dependsOn": ["C0"],
      "milestone": 1
    },
    {
      "code": "C2",
      "delivery": "atomic",
      "title": "Implement ES2015 WeakMap and WeakSet with private weak storage",
      "dependsOn": ["C0", "C1"],
      "milestone": 1
    },
    {
      "code": "C3",
      "delivery": "atomic",
      "title": "Integrate ES2015 collections across Realms, iterables, and consumers",
      "dependsOn": ["C0", "C1", "C2"],
      "milestone": 1
    },
    {
      "code": "B0",
      "delivery": "atomic",
      "title": "Implement Data Blocks, byte codecs, and ES2015 ArrayBuffer",
      "dependsOn": ["H0", "M0", "S0"],
      "milestone": 1
    },
    {
      "code": "B1",
      "delivery": "atomic",
      "title": "Implement ES2015 DataView",
      "dependsOn": ["B0"],
      "milestone": 1
    },
    {
      "code": "B2",
      "delivery": "atomic",
      "title": "Implement integer-indexed exotica and TypedArray constructors",
      "dependsOn": ["B0", "B1", "M0", "S0"],
      "milestone": 1
    },
    {
      "code": "B3",
      "delivery": "grouping",
      "title": "Complete ES2015 TypedArray methods, species, iterators, and integration",
      "dependsOn": ["B2"],
      "milestone": 1
    },
    {
      "code": "R0",
      "delivery": "atomic",
      "title": "Implement ES2015 RegExp grammar, u/y, state, and probed backend",
      "dependsOn": ["H0", "P0", "M0", "S0"],
      "milestone": 1
    },
    {
      "code": "R1",
      "delivery": "atomic",
      "title": "Complete RegExp/String Symbol protocol integration",
      "dependsOn": ["R0", "S0"],
      "milestone": 1
    },
    {
      "code": "L0",
      "delivery": "grouping",
      "title": "Complete ES2015 Array and Object additions",
      "dependsOn": ["M0", "S0"],
      "milestone": 1
    },
    {
      "code": "L1",
      "delivery": "grouping",
      "title": "Complete ES2015 String, Number, and Math additions",
      "dependsOn": ["S0", "R0", "R1"],
      "milestone": 1
    },
    {
      "code": "L2",
      "delivery": "grouping",
      "title": "Complete ES2015 Function, Date, Error, and JSON additions",
      "dependsOn": ["M0", "S0"],
      "milestone": 1
    },
    {
      "code": "G0",
      "delivery": "grouping",
      "title": "Complete remaining core ES2015 language runtime semantics",
      "dependsOn": ["P0", "P1", "M0", "M2"],
      "milestone": 1
    },
    {
      "code": "G1",
      "delivery": "atomic",
      "title": "Implement mandatory ES2015 proper tail calls",
      "dependsOn": ["P0", "P1", "M0", "M2", "G0"],
      "milestone": 1
    },
    {
      "code": "V0",
      "delivery": "tracking",
      "title": "Build and close the mandatory Sixth Edition clause coverage matrix",
      "dependsOn": ["T0", "T1"],
      "closeDependsOn": [
        "H0",
        "P0",
        "P1",
        "M0",
        "M1",
        "M2",
        "S0",
        "C0",
        "C1",
        "C2",
        "C3",
        "B0",
        "B1",
        "B2",
        "B3",
        "R0",
        "R1",
        "L0",
        "L1",
        "L2",
        "G0",
        "G1"
      ],
      "milestone": 1
    },
    {
      "code": "A0",
      "delivery": "grouping",
      "title": "Complete optional Annex B web compatibility",
      "dependsOn": [],
      "milestone": null
    },
    {
      "code": "F0",
      "delivery": "atomic",
      "title": "Integrate and publish core ECMAScript 2015 conformance",
      "dependsOn": [
        "T0",
        "T1",
        "H0",
        "P0",
        "P1",
        "M0",
        "M1",
        "M2",
        "S0",
        "C0",
        "C1",
        "C2",
        "C3",
        "B0",
        "B1",
        "B2",
        "B3",
        "R0",
        "R1",
        "L0",
        "L1",
        "L2",
        "G0",
        "G1",
        "V0"
      ],
      "milestone": 1
    }
  ]
}
```

Add to each node:

- `attribution`: refreshed owned roots/variants or a non-additive/tracking
  description from the refresh manifest;
- `scope`: exact approved responsibilities from the design;
- `nonGoals`: exact later/optional exclusions;
- `focusedQuery`: the classifier blocker/code query that supplies exact paths;
- `acceptance`: measurable reclassification and review gates.

Do not hard-code baseline counts.

- [ ] **Step 2: Populate exact attribution, scope, and non-goal records**

Use this complete map. `core(blocker)` means
`finalClass === "blocked"`, exact blocker name, and a path outside
`test/annexB/`. Each selector produces a sorted exact path list in the rendered
body.

| Code | Refreshed attribution selector                                                                 | Scope boundary                                                                                                             | Explicit non-goal                                         |
| ---- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| T0   | core `passing-unselected`                                                                      | Check in deterministic edition/dependency/anchor policy and promote exact audited paths only                               | Guest semantic changes or global feature-tag widening     |
| T1   | `unknown-edition`                                                                              | Adjudicate exact staging, language, Annex B, and built-in groups through reviewed provenance; create nested review batches | Inferring edition from age, directory, or text similarity |
| H0   | core(`test262-cross-realm-host`)                                                               | Runner-only same-Agent `$262.createRealm` and `evalScript`; later add detach only through B0                               | Guest/global `$262`, GC, or post-ES2015 agent hooks       |
| P0   | core(`lexical-grammar-and-new-target`)                                                         | Binary/octal literals, Unicode code-point escapes, and exact `new.target` context                                          | Later numeric separators or unrelated parser widening     |
| P1   | core(`early-errors-and-declaration-instantiation`)                                             | Group parser/static early errors separately from declaration-instantiation runtime                                         | One catch-all production PR                               |
| M0   | core(`proxy-and-reflect-metaobject`) excluding paths directly owned by M1/M2                   | Essential polymorphic internal-method contract, ordinary helpers, caller migration, hostile exotic, invariants             | Reflect methods or Proxy traps                            |
| M1   | MOP blocker roots under `test/built-ins/Reflect/` or explicitly classified Reflect operations  | Complete ES2015 Reflect atop M0                                                                                            | Proxy trap implementation                                 |
| M2   | remaining MOP blocker roots requiring Proxy plus Proxy-specific downstream protocol validation | Proxy traps, revocation, invariants, Realm/error ownership                                                                 | Integer-indexed exotica                                   |
| S0   | core(`symbol-protocol-dispatch`) excluding RegExp/String protocol roots owned by R1            | `@@hasInstance`, concat/spreadability, species helpers, unscopables, ordinary/current exotica                              | Claiming Proxy-specific protocol completeness before M2   |
| C0   | collection blocker roots for Map                                                               | Ordered entry kernel, Map constructor/prototype/iteration                                                                  | Set and weak collections                                  |
| C1   | collection blocker roots for Set and shared live iterators                                     | Set semantics, keys/values identity, mutation-aware iterators                                                              | Weak reachability                                         |
| C2   | collection blocker roots for WeakMap/WeakSet                                                   | Private weak adapter, key validation, weak collection APIs                                                                 | Enumeration, size, symbols as weak keys                   |
| C3   | remaining collection consumer roots                                                            | Cross-Realm, iterable, constructor, callback, and performance integration                                                  | New collection APIs from later editions                   |
| B0   | binary blocker roots for ArrayBuffer                                                           | Data Block state, byte codec, ArrayBuffer, detach hook                                                                     | DataView, TypedArray, SharedArrayBuffer                   |
| B1   | binary blocker roots for DataView                                                              | DataView constructor/accessors/read/write and endian behavior                                                              | Integer-indexed objects                                   |
| B2   | binary blocker roots for TypedArray constructors/integer-indexed internal methods              | `%TypedArray%`, nine constructors, indexed exotic kernel                                                                   | Complete prototype method surface                         |
| B3   | remaining binary TypedArray method and consumer roots                                          | Group focused nested children for methods, species, iterators, copies, and integration                                     | One catch-all production PR or later buffer kinds         |
| R0   | core(`regexp-unicode-and-sticky`) plus both mandatory deviation paths                          | ES2015 Pattern/flags/translation/backend probes/state/`RegExpExec`/`u`/`y`                                                 | Later RegExp syntax or engine-owned full matcher          |
| R1   | non-additive Symbol blocker RegExp/String roots plus library blocker RegExp roots              | RegExp/String well-known-symbol routing and residual ES2015 RegExp surface                                                 | Counting cross-references as new owning roots             |
| L0   | library blocker Array/Object roots                                                             | Group focused Array and Object additions after shared kernels                                                              | One catch-all PR or RegExp roots                          |
| L1   | library blocker String/Number/Math roots                                                       | Group focused String, Number, and Math additions                                                                           | RegExp protocol work                                      |
| L2   | library blocker Function/Date/Error/JSON/remaining roots                                       | Group focused constructor/error/date/JSON transitions                                                                      | One catch-all PR                                          |
| G0   | core(`remaining-language-runtime-semantics`)                                                   | Group focused control-flow, class/super, assignment, eval, and completion children                                         | Proper tail calls                                         |
| G1   | core(`proper-tail-calls`)                                                                      | Exact strict tail positions, request/trampoline, frame stress                                                              | Universal evaluator migration                             |
| V0   | no coverage count; every mandatory Sixth Edition matrix row                                    | Living tracking proof updated by owning semantic PRs                                                                       | Generic exclusion waiver or one monolithic matrix PR      |
| A0   | all Annex B statuses, highlighting `annex-b-web-compatibility` direct blocker roots            | Optional browser-compat grouping and regression preservation                                                               | Blocking F0/#70 or joining milestone 1                    |
| F0   | no additive count; consumes refreshed complete core denominator                                | Final selected/pass proof, documentation, CI/CodeQL/review, closure evidence                                               | Annex B completion                                        |

- [ ] **Step 3: Validate the graph before any issue creation**

Write a Node validation that rejects:

- duplicate code/title;
- unknown dependencies;
- dependency cycles;
- `A0` in `F0.dependsOn`;
- a grouping node labeled atomic or claiming a production PR;
- V0 labeled atomic;
- mandatory nodes without milestone `1`;
- A0 with a milestone;
- missing refreshed attribution;
- additive use of R1's Symbol/library cross-references; and
- any dependency not present in the approved design.

Run it twice and hash the manifest. Expected: exit 0 and an identical hash.

- [ ] **Step 4: Implement the deterministic body renderer**

Create `$ARTIFACTS/render-es2015-issues.mjs` with interfaces:

- `renderInitialBody(node, refresh, manifestSha): string`
- `renderFinalBody(node, refresh, manifestSha, issueMap): string`
- `renderExpectedEdges(graph, issueMap): { subIssues, blockedBy }`, where:
  - `subIssues` contains `{ parentNumber, childNumber, childId }`; and
  - `blockedBy` contains `{ issueNumber, blockerNumber, blockerId }`.

Every body begins with:

```markdown
<!-- core-es2015-roadmap code:${node.code} manifest:${manifestSha} -->

Parent: #70
Design: #71 and `docs/superpowers/specs/2026-08-18-core-es2015-conformance-roadmap-design.md`
Definitive release baseline: `${refresh.releaseSha}`
Pinned Test262: `${refresh.test262.revision}`
```

Atomic bodies contain:

- `## One-PR boundary`
- `## Refreshed owning paths and counts`
- `## Scope`
- `## Non-goals`
- `## Semantic blockers`
- `## Sequencing notes`
- `## RED and focused Test262`
- `## Acceptance and review gates`
- `## Post-merge reclassification`

Grouping bodies state prominently:

```markdown
This issue owns no production commit. It closes only after focused nested atomic
children merge, exact paths are reclassified, and the grouping attribution is
zero.
```

Tracking V0 states that matrix updates land with owning semantic PRs. A0 states
that it is optional, non-blocking, and outside the ES2015 milestone.

Render bodies twice and compare hashes. Expected: byte-identical output.

- [ ] **Step 5: Detect existing roadmap issues and support safe resume**

Before creation:

```bash
gh issue list --repo yoonbuck/jsjs --state all --limit 200 \
  --json number,title,body,state,milestone,url \
  > "$ARTIFACTS/es2015-existing-issues.json"
```

For every graph node:

- if no exact marker/code exists, create it;
- if exactly one matching marker exists, verify its title and reuse it;
- if a title matches without the marker, stop for manual reconciliation; and
- if multiple markers match, stop as duplicate state.

Initialize `es2015-created-issues.json` as:

```json
{ "version": 1, "manifestSha256": "", "issues": {} }
```

Write each successful create immediately so a partial run resumes without
duplicates.

- [ ] **Step 6: Create each issue through the app-native tool**

For every missing node, call `create_issue` with:

```text
repo_full_name: yoonbuck/jsjs
title: node.title
body: initialBody
```

Do not pass labels or an unverified issue type. After each success, fetch:

```bash
gh api "repos/yoonbuck/jsjs/issues/$ISSUE_NUMBER" \
  --jq '{number,id,node_id,title,html_url,state}'
```

Persist number, REST database `id`, node ID, and URL under the stable code.

Expected: 27 unique code mappings. Secondary-rate-limit or validation failures
stop creation; resume later from the mapping rather than retrying successful
nodes.

- [ ] **Step 7: Apply milestones**

First verify the numeric milestone identity used by the graph:

```bash
test "$(gh api repos/yoonbuck/jsjs/milestones/1 --jq .title)" = "ES2015"
test "$(gh api repos/yoonbuck/jsjs/milestones/1 --jq .state)" = "open"
```

Stop if either check fails; do not attach mandatory work to another milestone.

For each mandatory node:

```bash
gh api --method PATCH "repos/yoonbuck/jsjs/issues/$ISSUE_NUMBER" \
  -F milestone=1
```

For A0, verify `milestone` is null and do not patch it.

- [ ] **Step 8: Render and apply final numbered bodies**

Rerun the renderer with `es2015-created-issues.json`. Every dependency reference
must use an actual issue number and distinguish semantic blockers from
sequencing notes.

Patch with one JSON input per issue:

```bash
gh api --method PATCH "repos/yoonbuck/jsjs/issues/$ISSUE_NUMBER" \
  --input "$ARTIFACTS/es2015-issue-bodies/$CODE.json"
```

Each `$CODE.json` contains exactly:

```js
{
  title: node.title,
  body: renderFinalBody(node, refresh, manifestSha, issueMap),
}
```

Re-read each body and verify marker, manifest hash, title, refreshed counts,
issue-number dependencies, delivery kind, and milestone.

- [ ] **Step 9: Attach all native sub-issue relationships**

For each node database ID:

```bash
gh api --method POST repos/yoonbuck/jsjs/issues/70/sub_issues \
  -F sub_issue_id="$CHILD_ID"
```

Treat HTTP 201 as creation. If resuming, list current sub-issues first and skip
an exact existing child rather than accepting a duplicate/422 response as
success.

- [ ] **Step 10: Attach native blocked-by relationships**

For each `dependsOn` edge whose blocker is another node:

```bash
gh api --method POST \
  "repos/yoonbuck/jsjs/issues/$BLOCKED_NUMBER/dependencies/blocked_by" \
  -F issue_id="$BLOCKER_ID"
```

For T0's numeric dependency `71`, use issue #71's REST database ID. Do not add
#61 because this task requires #61 already merged. If execution violated that
gate, stop instead of creating children.

Attach every V0 `closeDependsOn` mandatory layer as a native blocker of V0.
Attach every F0 dependency. Do not attach A0 to V0, F0, or #70.

Use paced sequential requests and stop on secondary rate limiting. Resume from
live edge lists.

- [ ] **Step 11: Update #70 with the actual child map**

Append a generated `## Native roadmap` section to #70 containing a table:

```markdown
| Code | Issue                  | Delivery | Refreshed attribution     |
| ---- | ---------------------- | -------- | ------------------------- |
| T0   | #${issueMap.T0.number} | atomic   | ${refresh.attribution.T0} |
| ...  |
```

State that native relationships are authoritative and the table is a readable
index. Apply via one REST PATCH after verifying #70 still contains Task 5's
exact body prefix.

---

### Task 7: Verify the Live Graph and Close Issue #71

**Files:**

- Create: `$ARTIFACTS/es2015-live-graph.json`
- Create: `$ARTIFACTS/issue-71-final-comment.md`
- Read: all created issues and native relationship endpoints.

**Interfaces:**

- Consumes: expected graph, created issue map, refreshed manifest, and live
  GitHub state.
- Produces: exact graph verification, #71 closure evidence, and no production
  implementation.

- [ ] **Step 1: Snapshot every live node and relationship**

Run:

```bash
gh api --paginate repos/yoonbuck/jsjs/issues/70/sub_issues \
  > "$ARTIFACTS/live-sub-issues.json"
```

For every created issue number, fetch:

```bash
gh api "repos/yoonbuck/jsjs/issues/$ISSUE_NUMBER"
gh api --paginate \
  "repos/yoonbuck/jsjs/issues/$ISSUE_NUMBER/dependencies/blocked_by"
gh api --paginate \
  "repos/yoonbuck/jsjs/issues/$ISSUE_NUMBER/dependencies/blocking"
```

Combine results into `es2015-live-graph.json`, sorted by stable code.

- [ ] **Step 2: Compare live state with expected state**

Use Node to assert:

- exactly 27 expected roadmap nodes exist;
- every node is a direct native sub-issue of #70;
- every code marker maps to one issue;
- title/body marker/manifest hash/delivery type/counts are exact;
- every mandatory node has milestone `ES2015` number `1`;
- A0 has no milestone;
- every expected blocked-by edge exists exactly once;
- no unexpected roadmap dependency edge exists;
- F0 is blocked by every mandatory completion and V0;
- V0 is blocked by every mandatory semantic layer for final closure;
- neither F0 nor V0 is blocked by A0;
- T0 is blocked by #71 until this task closes it;
- #70 remains open; and
- every new issue remains open.

Any missing, duplicate, or unexpected relationship blocks closure. Repair from
the manifest and rerun the complete snapshot; do not patch individual prose by
hand.

- [ ] **Step 3: Verify repository and GitHub evidence one final time**

Run:

```bash
git status --short --branch
git --no-pager diff --name-only origin/main...HEAD
git --no-pager log --oneline --decorate -8
gh issue view 61 --repo yoonbuck/jsjs --json state,closedAt
gh issue view 70 --repo yoonbuck/jsjs --json state,title,milestone,url
gh issue view 71 --repo yoonbuck/jsjs --json state,title,milestone,url
```

Expected:

- repository changes remain documentation-only;
- #61 is closed;
- #70 is open, qualified, and in ES2015;
- #71 is still open immediately before final comment; and
- live graph verification passed.

- [ ] **Step 4: Obtain final issue #71 specification and quality reviews**

Specification review verifies:

- post-#61 refresh evidence;
- #70 qualified claim;
- all 27 issue definitions;
- atomic/grouping/tracking boundaries;
- native parent and dependency edges;
- milestone placement;
- A0 non-blocking status; and
- #71 closure acceptance.

Quality review verifies:

- idempotent/resumable creation;
- no dependency drift;
- exact database-ID versus issue-number use;
- no duplicate or stale body;
- balanced counts;
- no pre-#61 creation; and
- no production change.

Fix findings through the graph/renderer source, re-render, reapply, and rerun the
complete live verification.

- [ ] **Step 5: Post final #71 evidence**

Create `issue-71-final-comment.md` with:

- design and refreshed-spec commit SHAs;
- #61 release SHA;
- audited main and Test262 SHA;
- refreshed artifact hashes and balanced tables;
- #70 updated title/URL;
- code-to-issue table;
- statement that native sub-issue and blocked-by graph matches the approved
  manifest;
- A0 milestone/non-blocking disposition;
- review results; and
- statement that issue #71 changed no guest production behavior.

Post:

```bash
gh issue comment 71 --repo yoonbuck/jsjs \
  --body-file "$ARTIFACTS/issue-71-final-comment.md"
```

Re-read and verify the posted comment against the manifest and live graph.

- [ ] **Step 6: Close #71 and verify dependency resolution**

Close:

```bash
gh issue close 71 --repo yoonbuck/jsjs \
  --reason completed \
  --comment "Roadmap design, definitive post-#61 taxonomy, and native child/dependency graph are complete; exact evidence is in the preceding comment."
```

Then verify:

```bash
gh issue view 71 --repo yoonbuck/jsjs --json state,closedAt,stateReason,url
T0_NUMBER=$(node -p \
  "require('$ARTIFACTS/es2015-created-issues.json').issues.T0.number")
gh api --paginate \
  "repos/yoonbuck/jsjs/issues/$T0_NUMBER/dependencies/blocked_by"
```

Expected:

- #71 is closed as completed;
- T0's native #71 blocker is resolved/closed in GitHub state;
- no production child is started or closed;
- #70 and F0 remain open; and
- the ES2015 milestone remains open.

- [ ] **Step 7: Report completion to the coordinator**

Send:

- final spec/plan commit SHAs;
- #61 release SHA;
- refreshed partition and blocker summary;
- #70 and #71 URLs/states;
- created code-to-issue map;
- live graph verification result; and
- explicit statement that production implementation remains future child work.

Do not invoke a production implementation skill from issue #71. Each atomic or
grouping child receives its own approved spec and plan.
