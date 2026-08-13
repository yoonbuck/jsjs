# Performance Architecture Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the exact final performance comparison and integrated
architecture baseline, then release it through a reviewed, green PR that closes
issues #46 and #29.

**Architecture:** Add one focused release-baseline document rather than extending
the historical profiling narrative. Derive every measurement from the preserved
PR #54 `comparison.json`/`comparison.md` artifacts, link existing detailed
documents, and change no runtime or benchmark behavior.

**Tech Stack:** GitHub-flavored Markdown, plain JavaScript repository tooling,
GitHub Actions, pinned Test262 revision
`b363f29d3c43c626dc852744ad64a0b48a003693`.

## Global Constraints

- Begin from `9ee337ac364b625195c21421f26d658b683c43dc`.
- Preserve plain JavaScript with strict JSDoc and Node/Chromium/JSC portability;
  no source behavior changes are planned.
- Authoritative comparison:
  `5a196855584f0d916508cfaca7e5444b572f0f02` to
  `6be14d8a3414e072391cdeb5c9af2a8b35a38807`.
- Source every numeric value and verdict directly from
  `.benchmark-results/issue-42-final-current-main/comparison.json` or its
  generated `comparison.md`; do not infer or normalize counts manually.
- Preserve `acceptance.gateReady === true` and
  `acceptance.accepted === false`.
- Keep the comparator verdict separate from the owner merge-policy adjudication.
- Preserve raw timing/profile/audit provenance and quarantined invalid attempts.
- Do not hide within-noise or underpowered target cells.
- Do not recapture merely to replace the authoritative candidate comparison.
- Use targeted local Test262 only; if generated Test262 artifacts are touched,
  run with `TZ=UTC`.
- Require a fresh implementer, task-scoped specification review, task-scoped
  quality review, and max-capability final whole-branch review.

---

## File Map

- Create `docs/performance-release.md`: current performance-milestone release
  baseline, evidence table, provenance, caveats, validation, and architecture
  disposition.
- Modify `README.md`: add a concise navigation link to the release baseline next
  to benchmarking and profiling documentation.
- Read only `docs/profiling.md`: detailed historical/profile attribution source.
- Read only `docs/adr/0001-execution-architecture.md`: accepted architecture
  decisions and revisit triggers.
- Read only the preserved PR #54 evidence root:
  `/Users/jordan/.copilot/repos/copilot-worktrees/jsjs/yoonbuck-optimize-object-array-hot-paths/.benchmark-results/issue-42-final-current-main/`.
- Read only the durable supporting/provenance root:
  `/Users/jordan/.copilot/session-state/22e18a29-2b03-4b69-863e-a76d8a6a6356/files/issue-42-final-5a19685/`.

### Task 1: Publish the Performance Architecture Release Baseline

**Files:**

- Create: `docs/performance-release.md`
- Modify: `README.md:27-30`
- Verify:
  `/Users/jordan/.copilot/repos/copilot-worktrees/jsjs/yoonbuck-optimize-object-array-hot-paths/.benchmark-results/issue-42-final-current-main/comparison.json`
- Verify:
  `/Users/jordan/.copilot/repos/copilot-worktrees/jsjs/yoonbuck-optimize-object-array-hot-paths/.benchmark-results/issue-42-final-current-main/comparison.md`

**Interfaces:**

- Consumes: the comparator's generated Markdown/JSON, the accepted ADR, the
  detailed profiling history, and PR #54's final review/CI record.
- Produces: a stable reader-facing `docs/performance-release.md` baseline linked
  from `README.md`; no JavaScript API or artifact schema changes.

- [ ] **Step 1: Audit the authoritative evidence before writing**

Run:

```bash
ROOT=/Users/jordan/.copilot/repos/copilot-worktrees/jsjs/yoonbuck-optimize-object-array-hot-paths/.benchmark-results/issue-42-final-current-main
test -f "$ROOT/comparison.json"
test -f "$ROOT/comparison.md"
jq -e '
  .acceptance.gateReady == true and
  .acceptance.accepted == false and
  (.targets | length) == 12 and
  (.nonTargetRegressions | length) == 0
' "$ROOT/comparison.json"
```

Expected: every `test` and the `jq -e` predicate exit 0. If JSON field names
differ, inspect `jq 'keys'` and use the actual schema; do not substitute
manually calculated values.

- [ ] **Step 2: Establish the missing-document check**

Run:

```bash
test -f docs/performance-release.md
```

Expected: FAIL because the release baseline does not exist.

- [ ] **Step 3: Write the release baseline**

Create `docs/performance-release.md` with these sections and only
artifact-derived numbers:

```markdown
# Performance architecture release baseline

## Integrated milestone

## Architecture disposition

## Authoritative before/after comparison

### Methodology and exact source identities

### Target cells

### Aggregates and non-target results

### Machine verdict and owner adjudication

## Raw evidence and provenance

## Validation

## Limits
```

The target table must reproduce all 12 rows from generated `comparison.md`,
including point estimate, 95% CI, sign-test p-value, empirical noise envelope,
and verdict. The aggregate table must reproduce Chromium, JSC, Node, and
all-host rows. State the generated warning exactly: four total underpowered
cells, including the one target cell. State zero non-target regressions without
claiming every non-target point estimate improved.

The provenance section must name both preserved roots, the six baseline and six
candidate capture roots, manifest, generated comparison JSON/Markdown,
validation copies, matched Node/Chromium profile roots, checksum-correlation and
profile-analysis outputs, timing/profile ledgers and environment records, 64
promoted raw profile artifacts, and the separately quarantined Chromium
arrays/cold CPU attempt whose raw `timeDelta=-1`. It must also identify the
excluded missing-vendor preflight, ambient-contaminated timing attempt, and
partial load-guard attempt. Record that ignored/local artifacts are not
repository-distributed files and must be retained by the release owner.

The adjudication section must say that the comparator remained not accepted;
the owner approved PR #54 under a superseding policy decision based on the
wholly negative all-host CI, exact sign-test `p = 0.03125`, zero non-target
regressions, green conformance/CI, and final review. It must explicitly say this
did not change methodology, thresholds, targets, parser, rounds, or
`acceptance.accepted`.

- [ ] **Step 4: Add README navigation**

Change the setup documentation paragraph to link the new release baseline:

```markdown
For the integrated performance-milestone baseline and final before/after
evidence, see [docs/performance-release.md](docs/performance-release.md).
```

Keep the existing benchmarking and profiling links.

- [ ] **Step 5: Audit the written document against generated evidence**

Run:

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';

const root =
  '/Users/jordan/.copilot/repos/copilot-worktrees/jsjs/yoonbuck-optimize-object-array-hot-paths/.benchmark-results/issue-42-final-current-main';
const generated = fs.readFileSync(`${root}/comparison.md`, 'utf8');
const release = fs.readFileSync('docs/performance-release.md', 'utf8');

const targetLines = generated
  .split('\n')
  .filter((line) => /^\| (chromium|jsc|node) \| (object-properties|arrays) \|/.test(line));
const aggregateLines = generated
  .split('\n')
  .filter((line) => /^\| (chromium|jsc|node|all-hosts) \|/.test(line));

for (const line of [...targetLines, ...aggregateLines]) {
  if (!release.includes(line)) {
    throw new Error(`Missing generated evidence row: ${line}`);
  }
}

for (const required of [
  'acceptance.gateReady',
  'acceptance.accepted',
  'true',
  'false',
  '5a196855584f0d916508cfaca7e5444b572f0f02',
  '6be14d8a3414e072391cdeb5c9af2a8b35a38807',
  '64 promoted raw profile artifacts',
  'timeDelta=-1',
]) {
  if (!release.includes(required)) {
    throw new Error(`Missing release evidence text: ${required}`);
  }
}
NODE
```

Expected: exit 0 with no output.

- [ ] **Step 6: Run documentation checks**

Run:

```bash
npm run format -- --check README.md docs/performance-release.md
git diff --check
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit the task**

```bash
git add README.md docs/performance-release.md
git commit -m "docs: publish performance architecture baseline" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

Expected: one focused documentation commit.

### Task 2: Validate and Release the Integrated Branch

**Files:**

- Verify only: `src/runtime/object.js`, `src/runtime/array-object.js`,
  `src/runtime/environment.js`, `src/evaluator/expressions.js`
- Verify only: `benchmark/compare.js`, `benchmark/profile/summarize.js`
- Verify only: `.github/workflows/ci.yml`
- Modify remotely: PR and issue metadata only after gates pass

**Interfaces:**

- Consumes: Task 1's committed documentation and the already integrated runtime.
- Produces: a green, reviewed, squash-merged release PR; closed #46 and, after
  child/criteria audit, closed #29.

- [ ] **Step 1: Run targeted current-main tests**

Run:

```bash
node test/run-node.js \
  test/identifier-read-fast-path.test.js \
  test/array-index.test.js \
  test/object-hot-path-integration.test.js \
  test/objects.test.js \
  test/node/benchmark-compare.test.js \
  test/profiling-core.test.js
npm run benchmark:smoke
npm run typecheck
npm run lint
npm run format
npm run ci:check
npm run vendor:check
```

Expected: every selected suite and repository check passes. Do not run the full
local Test262 suite for this documentation-only change.

- [ ] **Step 2: Reserve broad cross-runtime and conformance validation for CI**

Confirm the generated CI workflow still runs `npm run test:browser` and pinned
Test262 with `TZ: 'UTC'`. The portable JSC behavior was validated at PR #54's
exact candidate commit and this branch changes documentation only; do not repeat
the full portable or Test262 suites locally. The final PR's Chromium and pinned
Test262 jobs provide broad current-head validation.

- [ ] **Step 3: Run task-scoped reviews**

Dispatch a specification reviewer against Task 1 and the design spec, then a
quality reviewer against the Task 1 commit. Fix every Important/Critical or
requirements defect and repeat the relevant review until approved.

- [ ] **Step 4: Push and open the release PR**

Push the current branch and open a PR whose body:

- summarizes the integrated milestone and exact comparison;
- states `acceptance.gateReady=true` and `acceptance.accepted=false`;
- links #29 and uses `Closes #46`;
- records local validation without claiming local full Test262.

- [ ] **Step 5: Audit independently while CI runs**

Confirm all prerequisite issues (#39, #40, #42, #44) remain closed, PRs #48,
#50, #52, and #54 remain merged, the branch base is `9ee337a`, and raw evidence
still exists at the preserved root. Do not modify or regenerate evidence.

- [ ] **Step 6: Require CI and final review**

Wait for all required CI checks, including pinned Test262, Node, Chromium,
fixtures, benchmark smoke, typecheck, lint, formatting, workflow drift, and
vendor integrity. Dispatch a max-capability GPT-5.6-family whole-branch reviewer;
do not use Claude Opus 5. Fix and re-review any Critical/Important defect.

- [ ] **Step 7: Squash-merge and close the milestone**

After every gate passes:

```bash
gh pr merge <number> --repo yoonbuck/jsjs --squash --delete-branch
```

Verify #46 closed through the PR. Audit all #29 children and acceptance criteria;
then close #29 with a concise comment linking the release PR, exact merge SHA,
ADR, final comparison, acceptance booleans, and caveats.
