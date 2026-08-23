# M1 Authority Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the invalid pending M1 authority through one exact HEAD-checker PR, then rebuild and deliver the semantic M1 consumer from the corrected pending authority.

**Architecture:** The repair branch adds one ordinary-PR-only, exact-base marker and a dedicated checker validator with immutable corrected HEAD constants, six-path range enforcement, redundant immutable-byte checks, and a generic report-feature fix. After that repair squash-merges, the semantic branch drops the blocked consumer commit, derives M1 include closures from pinned Test262 inventory, regenerates corrected evidence including the exact selection replacement, and performs a normal `pending -> applied` consumption.

**Tech Stack:** Plain ECMAScript modules with strict JSDoc/checkJs, Node.js, the repository Node test harness, pinned Test262 `b363f29d3c43c626dc852744ad64a0b48a003693`, GitHub Actions, GitHub CLI, and GitHub Code Scanning.

**Spec:** `docs/superpowers/specs/2026-08-23-m1-authority-repair-design.md`

## Global Constraints

- The hardened spec HEAD is `0785e32299cd4e89732f0bb8e30d92895f99f63a`.
- The normative diagnostic is
  `/home/jordan/jsjs/.worktrees/issue80-reflect/.superpowers/sdd/2026-08-22-es2015-reflect/task-8-authority-repair-diagnostic.md`.
- The repair branch is `yoonbuck-m1-authority-repair`, rooted at exact BASE `554afc367657439d116d23f4477bb24787a0e261`.
- Design and plan commits remain on that single repair branch. Never push or merge either document independently before the complete repair PR.
- The final repair BASE-to-HEAD range is exactly six paths with exact status: four modified files and the committed spec/future plan additions.
- The diagnostic consumer `eb4bcbe9ae6d163d0b2578a40d22d7684d382d2b` is evidence only. Never amend, cherry-pick, push, or merge it as the rebuilt consumer.
- M1 remains `pending` throughout the repair PR. Only the later semantic consumer changes corrected M1 `pending -> applied`.
- The one-use marker is accepted only from ordinary `pull_request` PR-body scanning. Never activate it on `pull_request_target` or through local `--profile/--marker`.
- `validateM1AuthorityRepairRange()` independently requires
  `deps.environment.GITHUB_EVENT_NAME === "pull_request"` even after a marker
  object reaches dispatch.
- The unchanged BASE checker must fail the repair with exactly `A provenance-owned PR range requires one authoritative provenance marker`.
- That one provenance-base-guard failure requires explicit administrator review and merge authorization. No other CI, test, CodeQL, extraction, warning, or alert failure is waivable.
- Immutable corrected checker literals are:

  ```text
  HEAD manifest: c12f0cc983141fccfc132dd7d872a29022192d33d72389eac9960c3403b21fbf
  HEAD M1 record: 42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670
  ```

- A marker and HEAD that agree on any alternate pair must still fail those literals.
- The corrected M1 record remains 113 roots / 226 variants, `reconciliation: null`, six evidence entries, 12 protected outputs, and the same two destinations.
- Corrected promotion remains 103 roots / 206 variants. Exactly 12 promoted roots have `includeFeatures: ["Reflect.construct"]`; the other 91 have an empty closure.
- The exact seven stale exclusions are removed only in the rebuilt semantic consumer. Their 13 variants pass, and the deletion adds zero subset paths and zero groups.
- Corrected aggregate protected projection SHA-256 is `22bf654462044eb3febfbcec43e1c56a20cd89392c763e8d141fd6f3274289ed`.
- The repair PR changes no workflow, pipeline, policy, feature manifest, decision fragment, evidence file, protected-output byte, runtime file, or authority state.
- The semantic M1 focused runner remains contained: it must not import `es2015-audit.js`, `upstream-run.js`, or `upstream-select.js`.
- Local execution never runs broad/full Test262, `npm run test262:upstream`, `npm run test262:upstream:check`, `npm test`, `npm run ci:contract`, full Node, full browser, or full JSC.
- Repair local checks are focused provenance/type/lint/format/range checks. Semantic local checks are exact M1, exact seven paths, focused Node/browser files, audit/selection/exclusion/provenance checks, and benchmark smoke.
- Every task uses `superpowers:subagent-driven-development`: one fresh worker, then a fresh specification-compliance reviewer, then a different fresh code-quality reviewer, with fix/retest/re-review loops.
- Every persistent commit is authored by `Copilot <223556219+Copilot@users.noreply.github.com>` and includes `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- Every shell step is self-contained. Each bash block rederives its commit,
  marker, PR, worktree, and handoff variables or reads them from an explicit
  ignored JSON/text file; no step assumes shell variable persistence.
- Use only repository-relative scratch under `.superpowers/` and `.benchmark-results/`. Never use `/tmp`, `/var/tmp`, or `mktemp`.

---

## Stable Interfaces and Exact File Map

### Repair marker and checker constants

```js
const M1_AUTHORITY_REPAIR_BASE = '554afc367657439d116d23f4477bb24787a0e261';
const M1_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256 =
  'abc71cd2ac6284b8a67cf1dbe98b507a9a6f71fda478998aa27520869ff97f19';
const M1_AUTHORITY_REPAIR_BASE_CHECKER_SHA256 =
  'bb7513d190af22f377d451bdfa1618c6b808ccd40a5e534c34f7ebcdc57ea409';
const M1_AUTHORITY_REPAIR_BASE_RECORD_SHA256 =
  '5ee279b8b9c836fbb039caf83a5de0f73b31f427133214e4fd250871bc2345f8';
const M1_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256 =
  'c12f0cc983141fccfc132dd7d872a29022192d33d72389eac9960c3403b21fbf';
const M1_AUTHORITY_REPAIR_HEAD_RECORD_SHA256 =
  '42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670';
```

```js
// tools/test262/es2015-provenance-check.js
parseM1AuthorityRepairMarker(text: string): M1AuthorityRepairMarker
validateM1AuthorityRepairRange(
  marker: M1AuthorityRepairMarker,
  context: {
    deps: ProvenanceCheckDependencies,
    base: string,
    head: string,
    changes: readonly RangeChange[],
    baseManifestText: string | null,
  },
): Promise<void>
assertM1AuthorityRepairImmutableBytes(
  baseManifest: ProvenanceManifest,
  context: RepairContext,
): Promise<void>
```

The exact marker is:

```text
<!-- es2015-m1-authority-repair
parent:70
code:M1
issue:80
base:554afc367657439d116d23f4477bb24787a0e261
base-manifest-sha256:abc71cd2ac6284b8a67cf1dbe98b507a9a6f71fda478998aa27520869ff97f19
base-record-sha256:5ee279b8b9c836fbb039caf83a5de0f73b31f427133214e4fd250871bc2345f8
head-manifest-sha256:c12f0cc983141fccfc132dd7d872a29022192d33d72389eac9960c3403b21fbf
head-record-sha256:42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670
-->
```

### Repair six-path range

| Status | Path                                                              |
| ------ | ----------------------------------------------------------------- |
| `M`    | `tools/test262/es2015-provenance-check.js`                        |
| `M`    | `tools/test262/es2015-provenance.json`                            |
| `M`    | `test/node/es2015-provenance.test.js`                             |
| `M`    | `docs/testing.md`                                                 |
| `A`    | `docs/superpowers/specs/2026-08-23-m1-authority-repair-design.md` |
| `A`    | `docs/superpowers/plans/2026-08-23-m1-authority-repair.md`        |

The diagnostic's `2026-08-22` repair spec/plan path suggestions are invalid
foreign paths.

### Corrected pending authority identities

```text
Promotion SHA-256:
31f807a05d56d35762cd5457f779624df04f11ef482b3d1bcb60be3a06883c69

Taxonomy projected HEAD SHA-256:
fba700539b05edd67b6cf67e4c0a1361398a2d0f04212bc7080a83f44abf577a

Selection replacement:
BASE 533e0b9fc165a026d64c4e64d783cf2585de7236600acacf228f06d27f23d8c8
HEAD 78ac694beb258be0b67c7788137c736b0b30cf7457e3a903d364d38c038b48df

Canonical record:
42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670

Pending manifest:
c12f0cc983141fccfc132dd7d872a29022192d33d72389eac9960c3403b21fbf

Aggregate protected projection:
22bf654462044eb3febfbcec43e1c56a20cd89392c763e8d141fd6f3274289ed
```

Four corrected project commitments:

```text
docs/conformance.md
79a033c365600cceb1f337bcc680bfdd76b095be0a6b5fb64db604c784cce65b

docs/test262-report.jsonl
b1968f16a04240ce1169430f695f01a4ee013fdbf2ba3dcdd38b4ccabdcc225f

tools/test262/es2015-taxonomy.json
a7b4dbd0334bd5ca34a25c80b156a051c444c989d8b87ba6ae18d34a7ca0078c

tools/test262/upstream-subset.json
bd59cfd5496a3c180a99240b6611d1efe0141b931c63d13fd897dc0c1b25cdf3
```

### Semantic recovery interfaces

Create a contained low-level module:

```js
// tools/test262/harness-definitions.js
readTest262HarnessDefinitions(
  checkoutPath: string,
  repositoryRootUrl?: URL,
): Promise<Map<string, {
  features: readonly string[],
  includes: readonly string[],
}>>
```

Modify M1 evidence construction:

```js
export const M1_CONSTRUCTOR_INCLUDE_PATHS: readonly string[];

buildM1AuthorityEvidence(options: {
  ledgerText: string,
  taxonomyText: string,
  execution: M1Execution,
  inventory: readonly Es2015InventoryRoot[],
  disposition?: unknown,
}): M1AuthorityEvidence
```

Add exact policy projection:

```js
export const M1_STALE_EXCLUSION_PATHS: readonly string[];

projectM1Selection(selectionText: string): {
  baseText: string,
  headText: string,
}
```

`buildM1PendingAuthority()` produces exactly 12 protected outputs, including
`tools/test262/es5-selection.json` as `replace-exact`.

### Exact file map

| Area                        | Files                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repair checker/test         | Modify `tools/test262/es2015-provenance-check.js`, `test/node/es2015-provenance.test.js`                                                                  |
| Corrected pending authority | Modify `tools/test262/es2015-provenance.json`                                                                                                             |
| Repair documentation        | Existing spec; create this plan; modify `docs/testing.md`                                                                                                 |
| Repair delivery             | No additional tracked path                                                                                                                                |
| Semantic inventory closure  | Create `tools/test262/harness-definitions.js`; modify `tools/test262/es2015-audit.js`, `tools/test262/es2015-m1.js`                                       |
| Semantic tests              | Modify `test/node/es2015-m1.test.js`, `test/node/es2015-taxonomy.test.js`, `test/node/upstream-select.test.js`, `test/node/repository-invariants.test.js` |
| Semantic policy projection  | Project then later modify `tools/test262/es5-selection.json`                                                                                              |
| Corrected evidence          | Add six `tools/test262/es2015-m1-*.json` files from scratch                                                                                               |
| Corrected existing outputs  | Modify audit evidence, taxonomy, subset, report, conformance, and selection from scratch                                                                  |
| Consumer authority state    | Modify only M1 `pending -> applied` in `tools/test262/es2015-provenance.json`                                                                             |
| Consumer docs               | Modify `.prettierignore`, `docs/architecture.md`, `docs/limitations.md`, `docs/testing.md`                                                                |
| Delivery records            | Ignored evidence under `.superpowers/issue-80/m1/` and `.superpowers/sdd/2026-08-23-m1-authority-repair/`                                                 |

### Review protocol for every task

Each task repeats all gates:

1. Use `superpowers:subagent-driven-development` with a fresh worker given only
   the spec, plan, current task, current HEAD, and named RED command.
2. Record RED/GREEN output below `.superpowers/sdd/2026-08-23-m1-authority-repair/task-N/`.
3. Give a fresh specification-compliance reviewer the task diff, exact
   interfaces, hashes, and RED/GREEN evidence.
4. Fix confirmed findings, rerun focused commands, and obtain a fresh
   specification re-review until approved.
5. Give a different fresh code-quality reviewer the approved diff and evidence.
6. Fix confirmed quality findings, rerun focused commands, and obtain a fresh
   quality re-review until approved.
7. Commit only after both approvals.

---

### Task 1: Preserve Generic Promotion Features in Report Validation

**Files:**

- Modify: `tools/test262/es2015-provenance-check.js:3093-3210`
- Modify: `test/node/es2015-provenance.test.js:2165-2610`

**Interfaces:**

- Consumes: parsed generic promotion entries and exact promoted audit records.
- Produces: generic promoted report records with exact root metadata
  `features`.
- Leaves: H0-specific report projection unchanged.

- [ ] **Step 1: Start a fresh Task 1 worker**

  Invoke `superpowers:subagent-driven-development`. Require evidence under
  `.superpowers/sdd/2026-08-23-m1-authority-repair/task-1/`.

- [ ] **Step 2: Parameterize the generic projection fixture**

  Update `syntheticRoadmapProjectionFixture()` to accept:

  ```js
  function syntheticRoadmapProjectionFixture(
    promotedFeatures = Object.freeze([]),
  ) {
  ```

  Use `promotedFeatures` in the generic promotion entry and in the promoted
  head report records:

  ```js
  features: [...promotedFeatures],
  ```

  Keep base audit records featureless; the checker must reconstruct report
  features from the promotion.

- [ ] **Step 3: Add the positive generic-feature RED test**

  Add a focused test using:

  ```js
  const fixture = syntheticRoadmapProjectionFixture(
    Object.freeze(['Reflect', 'Symbol.toStringTag']),
  );
  ```

  Run its exact protected-output validation and expect success after the repair.

- [ ] **Step 4: Run the Task 1 RED command**

  Run:

  ```bash
  node test/run-node.js test/node/es2015-provenance.test.js
  ```

  Expected: FAIL with:

  ```text
  roadmap-reclassification:H1 protected output docs/test262-report.jsonl must match the canonical selected report
  ```

- [ ] **Step 5: Add generic report negative tests**

  Starting from the two-feature fixture, add exact mutations:

  ```js
  const missingFeatureReport = fixture.headFiles
    .get('docs/test262-report.jsonl')
    .replace(
      '"features":["Reflect","Symbol.toStringTag"]',
      '"features":["Reflect"]',
    );

  const reorderedFeatureReport = fixture.headFiles
    .get('docs/test262-report.jsonl')
    .replace(
      '"features":["Reflect","Symbol.toStringTag"]',
      '"features":["Symbol.toStringTag","Reflect"]',
    );
  ```

  Each must fail the same canonical selected-report error. Keep the existing
  empty-feature synthetic fixture and assert no `"features":[]` serialization.
  Add a fixture with a promoted audit record but no matching promotion entry;
  require an explicit promotion-metadata-missing error.

- [ ] **Step 6: Implement path-keyed promotion feature preservation**

  In the generic branch of `validateReportProjection()` create:

  ```js
  const promotionByPath = new Map(
    promotion.entries.map((entry) => [entry.path, entry]),
  );
  ```

  Replace the featureless record construction with:

  ```js
  const promotedEntry = promotionByPath.get(record.file);
  if (promotedEntry === undefined) {
    throw new Es2015ProvenanceCheckError(
      `${profile} protected output ${output.path} promotion metadata is missing ${record.file}`,
    );
  }
  return createTestRecord({
    file: record.file,
    variant: record.variant,
    status: record.status,
    features: promotedEntry.features,
  });
  ```

  Do not pass `includeFeatures`. Do not modify the H0 branch.

- [ ] **Step 7: Run Task 1 GREEN**

  Run:

  ```bash
  node test/run-node.js test/node/es2015-provenance.test.js
  npm run typecheck
  ESLINT_USE_FLAT_CONFIG=true npx eslint \
    tools/test262/es2015-provenance-check.js \
    test/node/es2015-provenance.test.js
  npx prettier --check \
    tools/test262/es2015-provenance-check.js \
    test/node/es2015-provenance.test.js
  git diff --check
  ```

  Expected: PASS. Generic nonempty features are exact, empty features remain
  omitted, missing/mutated/reordered features fail, and H0 fixtures remain
  green.

- [ ] **Step 8: Obtain fresh Task 1 specification review**

  Require review of root-feature versus include-feature separation, exact
  canonical report behavior, impossible-state handling, and H0 non-regression.

- [ ] **Step 9: Obtain fresh Task 1 code-quality review**

  Require a different reviewer to inspect map construction, error clarity,
  fixture isolation, test strength, and absence of unrelated checker changes.

- [ ] **Step 10: Commit Task 1**

  Run:

  ```bash
  git add \
    tools/test262/es2015-provenance-check.js \
    test/node/es2015-provenance.test.js
  git -c user.name='Copilot' \
    -c user.email='223556219+Copilot@users.noreply.github.com' \
    commit --author='Copilot <223556219+Copilot@users.noreply.github.com>' \
    -m 'fix: preserve generic promotion report features' \
    -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
  ```

---

### Task 2: Add the One-Use Repair Marker and Correct Pending M1

**Files:**

- Modify: `tools/test262/es2015-provenance-check.js`
- Modify: `tools/test262/es2015-provenance.json`
- Modify: `test/node/es2015-provenance.test.js`
- Modify: `docs/testing.md`
- Existing on branch:
  `docs/superpowers/specs/2026-08-23-m1-authority-repair-design.md`
- Existing on branch:
  `docs/superpowers/plans/2026-08-23-m1-authority-repair.md`

**Interfaces:**

- Consumes: Task 1 checker behavior and exact BASE Git objects.
- Produces: exact ordinary-PR-only `M1AuthorityRepairMarker`.
- Produces: `validateM1AuthorityRepairRange()` with six-path and immutable-byte
  enforcement.
- Produces: corrected pending M1 record and exact manifest SHA.

- [ ] **Step 1: Start a fresh Task 2 worker**

  Invoke `superpowers:subagent-driven-development`. Require evidence under
  `.superpowers/sdd/2026-08-23-m1-authority-repair/task-2/`.

- [ ] **Step 2: Add literal constants and marker typedef**

  Add the constants from “Repair marker and checker constants” verbatim.
  Extend the closed marker union with:

  ```js
  /**
   * @typedef {{
   *   kind: 'm1-authority-repair',
   *   text: string,
   *   code: 'M1',
   *   issue: 80,
   *   base: string,
   *   baseManifestSha256: string,
   *   baseRecordSha256: string,
   *   headManifestSha256: string,
   *   headRecordSha256: string,
   * }} M1AuthorityRepairMarker
   */
  ```

- [ ] **Step 3: Add exact marker parser RED tests**

  Add a helper that renders the exact marker. Test exact normalized fields, then
  reject:

  - duplicate and mixed markers;
  - uppercase hashes;
  - CRLF;
  - reordered, missing, duplicate, and extra fields;
  - extra spaces;
  - prefix/suffix text on the marker line;
  - `pull_request_target`; and
  - local `--profile=m1-authority-repair --marker="$REPAIR_MARKER"`.

  Separately call `validateM1AuthorityRepairRange()` with an already parsed
  exact marker while `deps.environment.GITHUB_EVENT_NAME` is
  `pull_request_target`, `push`, or absent. Each must fail:

  ```text
  M1 authority repair requires an ordinary pull_request event
  ```

  This proves validator event enforcement does not rely only on scanner gating.

- [ ] **Step 4: Run marker RED**

  Run:

  ```bash
  node test/run-node.js test/node/es2015-provenance.test.js
  ```

  Expected: FAIL because the new marker is not authoritative.

- [ ] **Step 5: Implement ordinary-PR-only marker scanning**

  Add an exact regex and parser. Scan it only inside
  `authoritativeRangeMarkers()` when `GITHUB_EVENT_NAME === 'pull_request'`.
  Do not add it to `parseRoadmapAuthorityMarker()` or
  `parseProvenanceRangeMarker()`.

  `rangeProfileForMarker()` returns `m1-authority-repair` only for the parsed
  PR-body marker object; local profile parsing remains impossible.

- [ ] **Step 6: Add exact six-path RED fixtures**

  Define the exact status/path list from the stable file map. Add one positive
  fixture and negative fixtures for each:

  ```text
  missing required path
  foreign path
  duplicate path
  rename
  copy
  delete
  non-regular mode
  wrong A/M status
  encoded alias
  path traversal
  ```

- [ ] **Step 7: Add literal HEAD identity RED tests**

  Add tests requiring marker fields and computed HEAD identities to equal the
  literal constants. Construct a self-consistent alternate pair:

  1. mutate one allowed M1 projection commitment;
  2. recompute alternate canonical M1 record and manifest hashes;
  3. place those alternate hashes in the marker; and
  4. require rejection against
     `M1_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256` or
     `M1_AUTHORITY_REPAIR_HEAD_RECORD_SHA256`.

  Expected error names the immutable corrected literal, not marker/HEAD
  disagreement.

- [ ] **Step 8: Add pending-record structural RED tests**

  Add tests rejecting:

  ```text
  M1 applied
  M1 removed or reordered
  another authority changed
  source/reconciliation/destination drift
  non-promotion evidence drift
  wrong promotion evidence/head hash
  wrong project commitment
  changed project base hash
  wrong audit exact hash
  missing/extra/mutated es5-selection output
  noncanonical corrected record
  ```

- [ ] **Step 9: Add immutable-byte defense RED tests**

  Derive the immutable set from the BASE manifest:

  ```js
  const immutablePaths = new Set([
    '.github/workflows/ci.yml',
    'tools/ci/pipeline.js',
    'tools/test262/es2015-policy.json',
    'tools/test262/features.json',
    ...ES2015_PROVENANCE_DECISION_CODES.map(
      (code) => `${PROVENANCE_DECISIONS_DIRECTORY}/${code}.json`,
    ),
    ...baseManifest.roadmapAuthorities.flatMap((authority) => [
      ...authority.evidence.map((entry) => entry.path),
      ...authority.protectedOutputs.map((entry) => entry.path),
    ]),
  ]);
  ```

  For every derived path, inject BASE/HEAD byte or mode drift while leaving the
  reported six-path changes valid. Existing files must fail byte identity;
  BASE-absent future M1 evidence must fail if it appears in HEAD.

- [ ] **Step 10: Implement dedicated range validation**

  `checkRange()` dispatches the parsed repair marker to
  `validateM1AuthorityRepairRange()` before normal roadmap marker handling.

  The validator:

  - independently requires
    `deps.environment.GITHUB_EVENT_NAME === 'pull_request'`;
  - requires exact event/merge BASE;
  - reads and hashes exact BASE checker bytes;
  - validates marker BASE fields;
  - validates exact six-path status set;
  - parses canonical BASE/HEAD manifests;
  - checks marker HEAD fields against immutable literals;
  - checks computed HEAD manifest/record against the same literals;
  - preserves every non-M1 authority;
  - preserves M1 state/source/reconciliation/destinations;
  - permits only the exact promotion evidence/head hash change;
  - permits only four exact project commitment changes;
  - adds only the exact selection replace-exact output;
  - requires 6 evidence entries and 12 protected outputs; and
  - runs `assertM1AuthorityRepairImmutableBytes()`.

- [ ] **Step 11: Replace the pending M1 record exactly**

  Run:

  ```bash
  node --input-type=module <<'JS'
  import { readFileSync, writeFileSync } from 'node:fs';

  const path = 'tools/test262/es2015-provenance.json';
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  const m1 = manifest.roadmapAuthorities.find((entry) => entry.code === 'M1');
  if (m1 === undefined || m1.state !== 'pending') {
    throw new Error('expected pending M1 authority');
  }

  const promotionSha =
    '31f807a05d56d35762cd5457f779624df04f11ef482b3d1bcb60be3a06883c69';
  m1.evidence.find(
    (entry) => entry.path === 'tools/test262/es2015-m1-promotion.json',
  ).sha256 = promotionSha;
  m1.protectedOutputs.find(
    (entry) => entry.path === 'tools/test262/es2015-m1-promotion.json',
  ).headSha256 = promotionSha;

  const projections = {
    'docs/conformance.md':
      '79a033c365600cceb1f337bcc680bfdd76b095be0a6b5fb64db604c784cce65b',
    'docs/test262-report.jsonl':
      'b1968f16a04240ce1169430f695f01a4ee013fdbf2ba3dcdd38b4ccabdcc225f',
    'tools/test262/es2015-taxonomy.json':
      'a7b4dbd0334bd5ca34a25c80b156a051c444c989d8b87ba6ae18d34a7ca0078c',
    'tools/test262/upstream-subset.json':
      'bd59cfd5496a3c180a99240b6611d1efe0141b931c63d13fd897dc0c1b25cdf3',
  };
  for (const [outputPath, projectionSha256] of Object.entries(projections)) {
    m1.protectedOutputs.find(
      (entry) => entry.path === outputPath,
    ).projectionSha256 = projectionSha256;
  }

  m1.protectedOutputs.push({
    path: 'tools/test262/es5-selection.json',
    operation: 'replace-exact',
    baseSha256:
      '533e0b9fc165a026d64c4e64d783cf2585de7236600acacf228f06d27f23d8c8',
    headSha256:
      '78ac694beb258be0b67c7788137c736b0b30cf7457e3a903d364d38c038b48df',
    projectionSha256: null,
  });
  m1.protectedOutputs.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  JS
  ```

  Verify:

  ```bash
  sha256sum tools/test262/es2015-provenance.json
  ```

  Expected:

  ```text
  c12f0cc983141fccfc132dd7d872a29022192d33d72389eac9960c3403b21fbf
  ```

  Compute `canonicalRoadmapAuthoritySha256(M1)` and expect:

  ```text
  42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670
  ```

- [ ] **Step 12: Document the repair in docs/testing**

  Document:

  - exact marker;
  - exact-base ordinary-PR-only trust;
  - no pull_request_target/local profile activation;
  - strict six paths with `2026-08-23` doc names;
  - literal corrected HEAD constants;
  - expected old BASE guard failure;
  - immutable-byte defense;
  - admin-reviewed exception only;
  - local broad-run prohibitions; and
  - semantic rebuild handoff.

- [ ] **Step 13: Run Task 2 GREEN**

  Run:

  ```bash
  node test/run-node.js test/node/es2015-provenance.test.js
  npm run typecheck
  ESLINT_USE_FLAT_CONFIG=true npx eslint \
    tools/test262/es2015-provenance-check.js \
    test/node/es2015-provenance.test.js
  npx prettier --check \
    tools/test262/es2015-provenance-check.js \
    test/node/es2015-provenance.test.js \
    docs/testing.md \
    docs/superpowers/specs/2026-08-23-m1-authority-repair-design.md \
    docs/superpowers/plans/2026-08-23-m1-authority-repair.md
  npm run ci:check
  git diff --check
  ```

  Expected: PASS. The corrected manifest/record hashes are exact, alternate
  self-consistent pairs fail, six-path and immutable-byte tests pass, M1 remains
  pending, and no nonrepair path changes.

- [ ] **Step 14: Obtain fresh Task 2 specification review**

  Require review of every marker field, literal pin, event boundary, six-path
  status, manifest delta, immutable set, corrected hashes, pending state, and
  date-path supersession.

- [ ] **Step 15: Obtain fresh Task 2 code-quality review**

  Require a different reviewer to inspect parser exactness, path
  normalization, error messages, derived immutable sets, async file reads,
  fixture completeness, and absence of reusable maintenance policy.

- [ ] **Step 16: Commit Task 2**

  Run:

  ```bash
  git add \
    tools/test262/es2015-provenance-check.js \
    tools/test262/es2015-provenance.json \
    test/node/es2015-provenance.test.js \
    docs/testing.md
  git -c user.name='Copilot' \
    -c user.email='223556219+Copilot@users.noreply.github.com' \
    commit --author='Copilot <223556219+Copilot@users.noreply.github.com>' \
    -m 'fix: add one-use M1 authority repair' \
    -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
  ```

---

### Task 3: Review, Merge, and Hand Off the Repair PR

**Files:**

- No new tracked path
- Write ignored:
  `.superpowers/sdd/2026-08-23-m1-authority-repair/repair-delivery.json`
- Write ignored:
  `.superpowers/sdd/2026-08-23-m1-authority-repair/repair-checks.json`

**Interfaces:**

- Consumes: Task 2 exact six-path repair HEAD.
- Produces: squash merge SHA containing corrected M1 `pending`.
- Produces: exact repair PR/check/CodeQL identities and semantic handoff.
- Does not start: semantic branch work before exact-main repair verification.

- [ ] **Step 1: Start a fresh Task 3 delivery worker**

  Invoke `superpowers:subagent-driven-development`. Require evidence under
  `.superpowers/sdd/2026-08-23-m1-authority-repair/task-3/`.

- [ ] **Step 2: Verify exact branch ancestry and six paths**

  Run:

  ```bash
  REPAIR_BASE=554afc367657439d116d23f4477bb24787a0e261
  REPAIR_HEAD=$(git rev-parse HEAD)
  test "$(git merge-base "$REPAIR_BASE" "$REPAIR_HEAD")" = "$REPAIR_BASE"
  test -z "$(git status --short --untracked-files=no)"
  python - <<'PY'
  import subprocess

  base = '554afc367657439d116d23f4477bb24787a0e261'
  head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
  raw = subprocess.check_output(
      [
          'git',
          'diff',
          '--name-status',
          '-z',
          '--find-renames',
          '--find-copies',
          f'{base}...{head}',
      ]
  )
  fields = raw.decode().split('\0')
  rows = []
  index = 0
  while index < len(fields) and fields[index]:
      status = fields[index]
      path = fields[index + 1]
      if status.startswith(('R', 'C')):
          raise SystemExit(f'forbidden {status} {path} -> {fields[index + 2]}')
      rows.append((status, path))
      index += 2
  expected = [
      ('M', 'docs/testing.md'),
      ('A', 'docs/superpowers/plans/2026-08-23-m1-authority-repair.md'),
      ('A', 'docs/superpowers/specs/2026-08-23-m1-authority-repair-design.md'),
      ('M', 'test/node/es2015-provenance.test.js'),
      ('M', 'tools/test262/es2015-provenance-check.js'),
      ('M', 'tools/test262/es2015-provenance.json'),
  ]
  if sorted(rows) != sorted(expected):
      raise SystemExit(f'repair range mismatch: {rows!r}')
  PY
  ```

  Expected: PASS with exactly six paths. Verify neither design nor plan exists
  on `origin/main`.

- [ ] **Step 3: Run final focused local repair checks**

  Run:

  ```bash
  node test/run-node.js test/node/es2015-provenance.test.js
  npm run typecheck
  ESLINT_USE_FLAT_CONFIG=true npx eslint \
    tools/test262/es2015-provenance-check.js \
    test/node/es2015-provenance.test.js
  npx prettier --check \
    tools/test262/es2015-provenance-check.js \
    test/node/es2015-provenance.test.js \
    docs/testing.md \
    docs/superpowers/specs/2026-08-23-m1-authority-repair-design.md \
    docs/superpowers/plans/2026-08-23-m1-authority-repair.md
  npm run ci:check
  git diff --check
  ```

  Expected: PASS. Do not run broad/full Test262, full runtime suites,
  `npm test`, or `ci:contract`.

- [ ] **Step 4: Run repaired HEAD checker GREEN**

  Construct the exact marker from the stable interface and run:

  ```bash
  REPAIR_BASE=554afc367657439d116d23f4477bb24787a0e261
  REPAIR_HEAD=$(git rev-parse HEAD)
  REPAIR_MARKER=$(cat <<'EOF'
  <!-- es2015-m1-authority-repair
  parent:70
  code:M1
  issue:80
  base:554afc367657439d116d23f4477bb24787a0e261
  base-manifest-sha256:abc71cd2ac6284b8a67cf1dbe98b507a9a6f71fda478998aa27520869ff97f19
  base-record-sha256:5ee279b8b9c836fbb039caf83a5de0f73b31f427133214e4fd250871bc2345f8
  head-manifest-sha256:c12f0cc983141fccfc132dd7d872a29022192d33d72389eac9960c3403b21fbf
  head-record-sha256:42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670
  -->
  EOF
  )
  mkdir -p .superpowers/sdd/2026-08-23-m1-authority-repair
  printf '%s\n' "$REPAIR_MARKER" \
    > .superpowers/sdd/2026-08-23-m1-authority-repair/repair-marker.txt
  PR_BODY="$REPAIR_MARKER" \
  GITHUB_EVENT_NAME=pull_request \
  TZ=UTC node tools/test262/es2015-provenance-check.js \
    --check-range \
    --base="$REPAIR_BASE" \
    --head="$REPAIR_HEAD" \
    --pr-body-env=PR_BODY
  ```

  Expected: PASS using the repaired HEAD checker and ordinary PR path.

- [ ] **Step 5: Run exact unmodified BASE checker RED**

  Create a detached BASE worktree:

  ```bash
  REPAIR_BASE=554afc367657439d116d23f4477bb24787a0e261
  REPAIR_HEAD=$(git rev-parse HEAD)
  REPAIR_MARKER=$(cat \
    .superpowers/sdd/2026-08-23-m1-authority-repair/repair-marker.txt)
  REPAIR_ROOT=$(git rev-parse --show-toplevel)
  BASE_WORKTREE=$REPAIR_ROOT/.superpowers/sdd/2026-08-23-m1-authority-repair/base-checker
  git worktree add --detach "$BASE_WORKTREE" "$REPAIR_BASE"
  set +e
  BASE_OUTPUT=$(
    cd "$BASE_WORKTREE"
    PR_BODY="$REPAIR_MARKER" \
    GITHUB_EVENT_NAME=pull_request_target \
    TZ=UTC node tools/test262/es2015-provenance-check.js \
      --check-range \
      --base="$REPAIR_BASE" \
      --head="$REPAIR_HEAD" \
      --pr-body-env=PR_BODY 2>&1
  )
  BASE_STATUS=$?
  set -e
  test "$BASE_STATUS" -ne 0
  printf '%s\n' "$BASE_OUTPUT" | grep -Fx \
    'Es2015ProvenanceCheckError: A provenance-owned PR range requires one authoritative provenance marker'
  ```

  Expected: exactly that failure. Any different BASE error blocks delivery.

- [ ] **Step 6: Obtain fresh Task 3 specification review**

  Require a fresh provenance/security reviewer to inspect exact ancestry,
  six-path range, marker, literal constants, corrected record, immutable-byte
  defense, event boundaries, and the single expected BASE failure.

- [ ] **Step 7: Obtain fresh Task 3 code-quality review**

  Require a different reviewer to inspect the complete
  range from `554afc367657439d116d23f4477bb24787a0e261` to the reviewed
  HEAD, test quality, failure messages, canonical serialization,
  documentation, and absence of workflow/schema/runtime drift.

- [ ] **Step 8: Obtain whole-repair branch review**

  Require a fresh whole-range security/correctness review. Fix every confirmed
  finding with a new focused RED case, rerun Steps 2-5, and repeat all three
  reviews on the new HEAD.

- [ ] **Step 9: Push and open the single repair PR**

  Run:

  ```bash
  REPAIR_BASE=554afc367657439d116d23f4477bb24787a0e261
  git fetch origin main
  if test "$(git rev-parse origin/main)" != "$REPAIR_BASE"; then
    echo 'origin/main moved; abandon this stale repair range and re-review all identities' >&2
    exit 1
  fi
  REPAIR_MARKER=$(cat \
    .superpowers/sdd/2026-08-23-m1-authority-repair/repair-marker.txt)
  git push -u origin yoonbuck-m1-authority-repair
  REPAIR_PR_URL=$(gh pr create \
    --repo yoonbuck/jsjs \
    --base main \
    --head yoonbuck-m1-authority-repair \
    --title 'Repair pending M1 roadmap authority' \
    --body "$REPAIR_MARKER

  ## Summary

  - preserve generic promotion features in canonical report validation
  - add one exact ordinary-PR-only M1 authority repair marker
  - replace only the still-pending M1 record with corrected evidence/projection commitments
  - add future exact ownership for seven stale exclusion deletions

  ## Exact exception

  The unchanged pull_request_target BASE checker is expected to fail only with:
  A provenance-owned PR range requires one authoritative provenance marker

  All ordinary PR jobs and both CodeQL categories must pass. This PR requires explicit administrator review for that one trust-root exception.

  Tracks #80")
  REPAIR_PR=$(gh pr view "$REPAIR_PR_URL" \
    --repo yoonbuck/jsjs --json number --jq .number)
  ```

- [ ] **Step 10: Wait for exact repair PR checks**

  Poll:

  ```bash
  REPAIR_PR=$(gh pr list --repo yoonbuck/jsjs \
    --head yoonbuck-m1-authority-repair \
    --base main \
    --state open \
    --json number \
    --jq 'if length == 1 then .[0].number else error("expected one repair PR") end')
  while true; do
    gh pr checks "$REPAIR_PR" --repo yoonbuck/jsjs \
      --json name,state,bucket,link \
      > .superpowers/sdd/2026-08-23-m1-authority-repair/repair-checks.json
    if node - <<'JS'
  const checks = require('./.superpowers/sdd/2026-08-23-m1-authority-repair/repair-checks.json');
  const pending = checks.filter((check) => check.bucket === 'pending');
  process.exit(pending.length === 0 ? 0 : 1);
  JS
    then
      break
    fi
    sleep 30
  done
  node - <<'JS'
  const checks = require('./.superpowers/sdd/2026-08-23-m1-authority-repair/repair-checks.json');
  const failures = checks.filter((check) => check.bucket === 'fail');
  if (
    failures.length !== 1 ||
    failures[0].name !== 'Provenance base guard'
  ) {
    throw new Error(`unexpected repair PR failures: ${JSON.stringify(failures)}`);
  }
  const unexpected = checks.filter((check) =>
    !['pass', 'skipping', 'fail'].includes(check.bucket),
  );
  if (unexpected.length !== 0) {
    throw new Error(`nonterminal repair checks: ${JSON.stringify(unexpected)}`);
  }
  JS
  ```

  Inspect the failed base-guard log and require the exact expected error.
  Inspect every ordinary CI job; all must pass.

- [ ] **Step 11: Verify exact repair HEAD CodeQL**

  Run:

  ```bash
  REPAIR_PR=$(gh pr list --repo yoonbuck/jsjs \
    --head yoonbuck-m1-authority-repair \
    --base main \
    --state open \
    --json number \
    --jq 'if length == 1 then .[0].number else error("expected one repair PR") end')
  gh pr checks "$REPAIR_PR" --repo yoonbuck/jsjs \
    --json name,state,bucket,link \
    > .superpowers/sdd/2026-08-23-m1-authority-repair/repair-checks.json
  REVIEWED_REPAIR_HEAD=$(gh pr view "$REPAIR_PR" \
    --repo yoonbuck/jsjs --json headRefOid --jq .headRefOid)
  test "$REVIEWED_REPAIR_HEAD" = "$(git rev-parse HEAD)"
  node - <<'JS'
  const checks = require('./.superpowers/sdd/2026-08-23-m1-authority-repair/repair-checks.json');
  const codeql = checks.filter((check) =>
    check.name.toLowerCase().includes('codeql'),
  );
  if (codeql.length < 2) {
    throw new Error(`repair PR lacks both CodeQL check-runs: ${JSON.stringify(codeql)}`);
  }
  if (codeql.some((check) => check.bucket !== 'pass')) {
    throw new Error(`repair PR CodeQL checks are not successful: ${JSON.stringify(codeql)}`);
  }
  JS
  printf '%s\n' "$REVIEWED_REPAIR_HEAD" \
    > .superpowers/sdd/2026-08-23-m1-authority-repair/reviewed-repair-head.txt
  gh api 'repos/yoonbuck/jsjs/code-scanning/alerts?state=open&per_page=100' \
    > .superpowers/sdd/2026-08-23-m1-authority-repair/open-alerts.json
  test "$(node -e \
    "const a=require('./.superpowers/sdd/2026-08-23-m1-authority-repair/open-alerts.json');process.stdout.write(String(a.length))")" = 0
  ```

- [ ] **Step 12: Record explicit administrator authorization**

  Require an administrator review/comment stating that:

  - the old BASE checker failure is expected and exact;
  - all other checks and CodeQL are clean;
  - the six-path HEAD checker repair is reviewed;
  - the design/plan did not merge independently; and
  - squash merge with required-check bypass is authorized.

- [ ] **Step 13: Admin squash-merge the repair**

  Run only after Step 12:

  ```bash
  REPAIR_PR=$(gh pr list --repo yoonbuck/jsjs \
    --head yoonbuck-m1-authority-repair \
    --base main \
    --state open \
    --json number \
    --jq 'if length == 1 then .[0].number else error("expected one repair PR") end')
  REVIEWED_REPAIR_HEAD=$(cat \
    .superpowers/sdd/2026-08-23-m1-authority-repair/reviewed-repair-head.txt)
  CURRENT_REPAIR_HEAD=$(gh pr view "$REPAIR_PR" \
    --repo yoonbuck/jsjs --json headRefOid --jq .headRefOid)
  test "$CURRENT_REPAIR_HEAD" = "$REVIEWED_REPAIR_HEAD"
  gh pr merge "$REPAIR_PR" \
    --repo yoonbuck/jsjs \
    --admin \
    --squash \
    --delete-branch
  git fetch origin main
  REPAIR_MERGE=$(gh pr view "$REPAIR_PR" \
    --repo yoonbuck/jsjs --json mergeCommit --jq .mergeCommit.oid)
  test "$(git rev-parse origin/main)" = "$REPAIR_MERGE"
  ```

- [ ] **Step 14: Verify exact-main repair CI and CodeQL**

  Run:

  ```bash
  REPAIR_PR=$(gh pr list --repo yoonbuck/jsjs \
    --head yoonbuck-m1-authority-repair \
    --state merged \
    --json number \
    --jq 'if length >= 1 then .[0].number else error("missing merged repair PR") end')
  REPAIR_MERGE=$(gh pr view "$REPAIR_PR" \
    --repo yoonbuck/jsjs --json mergeCommit --jq .mergeCommit.oid)
  for attempt in $(seq 1 60); do
    gh run list --repo yoonbuck/jsjs --commit "$REPAIR_MERGE" \
      --json databaseId,workflowName,status,conclusion,url \
      > .superpowers/sdd/2026-08-23-m1-authority-repair/repair-main-runs.json
    if REPAIR_MERGE="$REPAIR_MERGE" node - <<'JS'
  const runs = require('./.superpowers/sdd/2026-08-23-m1-authority-repair/repair-main-runs.json');
  process.exit(
    runs.some((run) => run.workflowName === 'CI' && run.conclusion === 'success')
      ? 0
      : 1,
  );
  JS
    then
      break
    fi
    sleep 30
  done
  node - <<'JS'
  const runs = require('./.superpowers/sdd/2026-08-23-m1-authority-repair/repair-main-runs.json');
  if (!runs.some((run) => run.workflowName === 'CI' && run.conclusion === 'success')) {
    throw new Error('repair merge lacks exact-main CI success');
  }
  JS
  gh api 'repos/yoonbuck/jsjs/code-scanning/analyses?per_page=100' \
    > .superpowers/sdd/2026-08-23-m1-authority-repair/repair-main-codeql.json
  REPAIR_MERGE="$REPAIR_MERGE" node - <<'JS'
  const analyses = require('./.superpowers/sdd/2026-08-23-m1-authority-repair/repair-main-codeql.json')
    .filter((analysis) => analysis.commit_sha === process.env.REPAIR_MERGE);
  if (analyses.length < 2) {
    throw new Error('repair merge lacks both exact-main CodeQL analyses');
  }
  if (analyses.some((analysis) => analysis.error || analysis.warning)) {
    throw new Error('repair exact-main CodeQL contains errors or warnings');
  }
  JS
  gh api 'repos/yoonbuck/jsjs/code-scanning/alerts?state=open&per_page=100' \
    > .superpowers/sdd/2026-08-23-m1-authority-repair/repair-main-alerts.json
  test "$(node -e \
    "const a=require('./.superpowers/sdd/2026-08-23-m1-authority-repair/repair-main-alerts.json');process.stdout.write(String(a.length))")" = 0
  ```

  Verify exact repaired main:

  ```bash
  git show "$REPAIR_MERGE":tools/test262/es2015-provenance.json \
    | sha256sum \
    | grep -F c12f0cc983141fccfc132dd7d872a29022192d33d72389eac9960c3403b21fbf
  ```

- [ ] **Step 15: Write repair handoff**

  Run:

  ```bash
  REPAIR_PR=$(gh pr list --repo yoonbuck/jsjs \
    --head yoonbuck-m1-authority-repair \
    --state merged \
    --json number \
    --jq 'if length >= 1 then .[0].number else error("missing merged repair PR") end')
  REPAIR_MERGE=$(gh pr view "$REPAIR_PR" \
    --repo yoonbuck/jsjs --json mergeCommit --jq .mergeCommit.oid)
  REVIEWED_REPAIR_HEAD=$(cat \
    .superpowers/sdd/2026-08-23-m1-authority-repair/reviewed-repair-head.txt)
  REPAIR_ROOT=$(git rev-parse --show-toplevel)
  BASE_WORKTREE=$REPAIR_ROOT/.superpowers/sdd/2026-08-23-m1-authority-repair/base-checker
  cat > .superpowers/sdd/2026-08-23-m1-authority-repair/repair-delivery.json <<EOF
  {
    "repairPr": $REPAIR_PR,
    "repairReviewedHead": "$REVIEWED_REPAIR_HEAD",
    "repairMergeSha": "$REPAIR_MERGE",
    "expectedBaseGuardFailure": "A provenance-owned PR range requires one authoritative provenance marker",
    "correctedM1RecordSha256": "42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670",
    "correctedProjectionSha256": "22bf654462044eb3febfbcec43e1c56a20cd89392c763e8d141fd6f3274289ed"
  }
  EOF
  gh issue comment 80 --repo yoonbuck/jsjs --body \
    "M1 authority repair merged via PR #$REPAIR_PR at \`$REPAIR_MERGE\`. Corrected M1 remains pending with canonical record \`42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670\`. Semantic work may resume only after dropping diagnostic consumer \`eb4bcbe9ae6d163d0b2578a40d22d7684d382d2b\` and rebasing the preconsumer branch onto this exact merge."
  git worktree remove "$BASE_WORKTREE"
  ```

  Preserve the handoff and diagnostic branch.

---

### Task 4: Rebase Semantic M1 and Regenerate Corrected Scratch

**Files:**

- Create: `tools/test262/harness-definitions.js`
- Modify: `tools/test262/es2015-audit.js`
- Modify: `tools/test262/es2015-m1.js`
- Modify: `test/node/es2015-m1.test.js`
- Modify: `test/node/es2015-taxonomy.test.js`
- Modify: `test/node/upstream-select.test.js`
- Modify: `test/node/repository-invariants.test.js`
- Write ignored: corrected `.superpowers/issue-80/m1/`
- Do not yet modify: protected outputs, evidence files, selection, or M1 state

**Interfaces:**

- Consumes: repair handoff and semantic preconsumer commit
  `6025bd26117a3b84cf3fc1a6bfbac35fb28298a0`.
- Produces: contained pinned harness-definition reader.
- Produces: inventory-backed M1 evidence with exact include closure.
- Produces: pure exact seven-exclusion projection.
- Produces: corrected scratch authority record/projection matching repaired
  pending M1.

- [ ] **Step 1: Start a fresh Task 4 worker**

  Invoke `superpowers:subagent-driven-development` in
  `/home/jordan/jsjs/.worktrees/issue80-reflect`. Require evidence under
  `.superpowers/sdd/2026-08-23-m1-authority-repair/task-4/`.

- [ ] **Step 2: Preserve diagnostic history and drop the blocked consumer**

  Run:

  ```bash
  cd /home/jordan/jsjs/.worktrees/issue80-reflect
  test "$(git rev-parse HEAD)" = \
    eb4bcbe9ae6d163d0b2578a40d22d7684d382d2b
  git branch \
    yoonbuck-issue-80-reflect-diagnostic-eb4 \
    eb4bcbe9ae6d163d0b2578a40d22d7684d382d2b
  git reset --hard 6025bd26117a3b84cf3fc1a6bfbac35fb28298a0
  ```

  Never cherry-pick
  `eb4bcbe9ae6d163d0b2578a40d22d7684d382d2b`.

- [ ] **Step 3: Rebase preconsumer semantics onto the repair merge**

  Load `REPAIR_MERGE` from the repair handoff and run:

  ```bash
  REPAIR_HANDOFF=/home/jordan/jsjs/.worktrees/m1-authority-repair/.superpowers/sdd/2026-08-23-m1-authority-repair/repair-delivery.json
  REPAIR_MERGE=$(node -e \
    "const h=require('$REPAIR_HANDOFF');process.stdout.write(h.repairMergeSha)")
  REPAIR_BASE_WORKTREE=$(git rev-parse --show-toplevel)/.superpowers/issue-80/m1/repaired-base
  git fetch origin main
  test "$(git rev-parse origin/main)" = "$REPAIR_MERGE"
  git rebase --onto \
    "$REPAIR_MERGE" \
    554afc367657439d116d23f4477bb24787a0e261
  ```

  Expected: all design/plan/runtime/preconsumer tooling commits replay; the
  blocked consumer commit remains absent. Verify M1 is pending with canonical
  record hash
  `42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670`.

- [ ] **Step 4: Archive stale ignored scratch**

  If `.superpowers/issue-80/m1` exists, move it to:

  ```text
  .superpowers/issue-80/m1-diagnostic-eb4
  ```

  Create a fresh `.superpowers/issue-80/m1` for corrected evidence. Do not reuse
  old promotion, authority-record, or projection bytes.

- [ ] **Step 5: Add include-closure RED tests**

  Add:

  ```js
  export const M1_CONSTRUCTOR_INCLUDE_PATHS = Object.freeze([
    'test/built-ins/Reflect/apply/not-a-constructor.js',
    'test/built-ins/Reflect/construct/not-a-constructor.js',
    'test/built-ins/Reflect/defineProperty/not-a-constructor.js',
    'test/built-ins/Reflect/deleteProperty/not-a-constructor.js',
    'test/built-ins/Reflect/get/not-a-constructor.js',
    'test/built-ins/Reflect/getOwnPropertyDescriptor/not-a-constructor.js',
    'test/built-ins/Reflect/getPrototypeOf/not-a-constructor.js',
    'test/built-ins/Reflect/has/not-a-constructor.js',
    'test/built-ins/Reflect/isExtensible/not-a-constructor.js',
    'test/built-ins/Reflect/preventExtensions/not-a-constructor.js',
    'test/built-ins/Reflect/set/not-a-constructor.js',
    'test/built-ins/Reflect/setPrototypeOf/not-a-constructor.js',
  ]);
  ```

  Build an inventory fixture where `isConstructor.js` has feature
  `Reflect.construct`, then assert:

  ```js
  assertSame(
    evidence.promotion.entries.filter(
      (entry) => entry.includeFeatures.length > 0,
    ).length,
    12,
  );
  assertSame(
    evidence.promotion.entries.every((entry) =>
      M1_CONSTRUCTOR_INCLUDE_PATHS.includes(entry.path)
        ? JSON.stringify(entry.includeFeatures) === '["Reflect.construct"]'
        : entry.includeFeatures.length === 0,
    ),
    true,
  );
  ```

  Add a real pinned-checkout test or focused generation assertion that proves
  all 103 promotion entries validate through `parseEs2015Promotion` and
  inventory metadata.

- [ ] **Step 6: Run include-closure RED**

  Run:

  ```bash
  node test/run-node.js test/node/es2015-m1.test.js
  ```

  Expected: FAIL because current `buildM1AuthorityEvidence()` derives
  `includeFeatures` from taxonomy provenance and returns 0 nonempty closures.

- [ ] **Step 7: Extract the contained harness-definition reader**

  Move the byte-for-behavior logic currently private to
  `es2015-audit.js` into `tools/test262/harness-definitions.js`:

  ```js
  import { readdir, readFile } from 'node:fs/promises';
  import { load as parseYaml } from 'js-yaml';
  import { sortStrings } from './selection.js';

  const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);

  export async function readTest262HarnessDefinitions(
    checkoutPath,
    repositoryRootUrl = REPOSITORY_ROOT_URL,
  ) {
    const root = new URL(
      `${checkoutPath.replace(/\/$/u, '')}/harness/`,
      repositoryRootUrl,
    );
    const definitions = new Map();
    for (const name of await listFiles(root)) {
      const facts = { features: [], includes: [] };
      definitions.set(name, facts);
      if (name.endsWith('.js')) {
        definitions.set(name.slice(0, -'.js'.length), facts);
      }
    }

    let manifest;
    try {
      manifest = parseYaml(
        await readFile(new URL('features.yml', root), 'utf8'),
      );
    } catch (error) {
      throw new Error(
        `vendor/test262/harness/features.yml is invalid: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (
      typeof manifest !== 'object' ||
      manifest === null ||
      Array.isArray(manifest)
    ) {
      throw new Error(
        'vendor/test262/harness/features.yml must map include names to facts',
      );
    }

    const declared = new Set();
    for (const [name, value] of Object.entries(manifest)) {
      const aliases = harnessAliases(name);
      const identity = aliases[0];
      if (declared.has(identity)) {
        throw new Error(
          `vendor/test262/harness/features.yml repeats include alias ${name}`,
        );
      }
      if (!aliases.some((alias) => definitions.has(alias))) {
        throw new Error(
          `vendor/test262/harness/features.yml names missing include ${name}`,
        );
      }
      declared.add(identity);
      const facts = parseHarnessFacts(value, name);
      for (const alias of aliases) {
        definitions.set(alias, facts);
      }
    }
    return definitions;
  }

  function harnessAliases(name) {
    return name.endsWith('.js')
      ? [name.slice(0, -'.js'.length), name]
      : [name, `${name}.js`];
  }

  function parseHarnessFacts(value, name) {
    if (Array.isArray(value)) {
      return {
        features: harnessStrings(value, `${name} features`),
        includes: [],
      };
    }
    if (typeof value !== 'object' || value === null) {
      throw new Error(
        `vendor/test262/harness/features.yml include ${name} has invalid facts`,
      );
    }
    const facts = /** @type {Record<string, unknown>} */ (value);
    for (const key of Object.keys(facts)) {
      if (key !== 'features' && key !== 'includes') {
        throw new Error(
          `vendor/test262/harness/features.yml include ${name} has unknown key ${key}`,
        );
      }
    }
    return {
      features: harnessStrings(facts.features ?? [], `${name} features`),
      includes: harnessStrings(facts.includes ?? [], `${name} includes`),
    };
  }

  function harnessStrings(values, label) {
    if (
      !Array.isArray(values) ||
      values.some((value) => typeof value !== 'string' || value === '')
    ) {
      throw new Error(
        `vendor/test262/harness/features.yml ${label} must be non-empty strings`,
      );
    }
    if (new Set(values).size !== values.length) {
      throw new Error(
        `vendor/test262/harness/features.yml ${label} must not repeat entries`,
      );
    }
    return sortStrings([...values]);
  }

  async function listFiles(directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    const names = sortStrings(entries.map((entry) => entry.name));
    const files = [];
    for (const name of names) {
      const entry = entries.find((candidate) => candidate.name === name);
      const relative = `${prefix}${name}`;
      if (entry?.isDirectory()) {
        files.push(
          ...(await listFiles(new URL(`${name}/`, directory), `${relative}/`)),
        );
      } else if (entry?.isFile()) {
        files.push(relative);
      }
    }
    return files;
  }
  ```

  Preserve:

  - recursive harness listing;
  - `name` and `name.js` aliases;
  - `features.yml` YAML parsing;
  - sorted unique features/includes;
  - missing include and duplicate alias rejection; and
  - exact existing diagnostic messages.

  Make `es2015-audit.js` consume this low-level module. The M1 runner may import
  the low-level module but remains forbidden from importing the broad audit
  module.

- [ ] **Step 8: Make evidence inventory-backed**

  Add `inventory` to `buildM1AuthorityEvidence()` options. For each promoted
  path:

  ```js
  const inventoryRoot = inventoryByPath.get(sourcePath);
  if (
    inventoryRoot === undefined ||
    inventoryRoot.metadata === null ||
    !sameStrings(inventoryRoot.metadata.features, entry.features) ||
    !sameStrings(inventoryRoot.metadata.includes, entry.includes)
  ) {
    throw new Error(`M1 pinned inventory drift: ${sourcePath}`);
  }
  return {
    path: sourcePath,
    variants: entry.variants,
    features: [...inventoryRoot.metadata.features],
    includeFeatures: [...inventoryRoot.includeFeatures],
  };
  ```

  In build-scratch mode:

  - verify the pinned checkout;
  - read exactly the 113 ledger root sources;
  - read contained harness definitions;
  - call `buildEs2015Inventory({ roots, includeDefinitions })`; and
  - pass that exact inventory into evidence construction.

- [ ] **Step 9: Add exact seven-exclusion RED tests**

  Define:

  ```js
  export const M1_STALE_EXCLUSION_PATHS = Object.freeze([
    'test/built-ins/Object/internals/DefineOwnProperty/consistent-value-function-arguments.js',
    'test/built-ins/Object/internals/DefineOwnProperty/consistent-value-function-caller.js',
    'test/built-ins/Object/internals/DefineOwnProperty/consistent-value-regexp-dollar1.js',
    'test/built-ins/Object/internals/DefineOwnProperty/consistent-writable-regexp-dollar1.js',
    'test/staging/sm/Array/unshift-with-enumeration.js',
    'test/staging/sm/object/bug-1206700.js',
    'test/staging/sm/strict/primitive-assignment.js',
  ]);
  ```

  Test `projectM1Selection()` removes exactly those seven objects, preserves all
  other formatting/data, and returns:

  ```text
  BASE SHA 533e0b9fc165a026d64c4e64d783cf2585de7236600acacf228f06d27f23d8c8
  HEAD SHA 78ac694beb258be0b67c7788137c736b0b30cf7457e3a903d364d38c038b48df
  ```

  Recompute selection with the corrected promotion and assert the final subset
  remains 20,595 paths / 61 groups at SHA
  `9f768aa8fb0c473e98fe2156d290c4207cea797302cccad6f9b1b922a36b37c0`.

- [ ] **Step 10: Extend scratch and pending-authority construction**

  Build scratch reads base selection text, projects the seven deletions, and
  writes:

  ```text
  .superpowers/issue-80/m1/projected/tools/test262/es5-selection.json
  ```

  Include base/projected selection texts in `buildM1PendingAuthority()`. Require
  12 protected outputs and exact selection `replace-exact`.

  Corrected scratch must produce:

  ```text
  promotion file:
  31f807a05d56d35762cd5457f779624df04f11ef482b3d1bcb60be3a06883c69

  taxonomy projected file:
  fba700539b05edd67b6cf67e4c0a1361398a2d0f04212bc7080a83f44abf577a

  canonical pending record:
  42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670

  aggregate projection:
  22bf654462044eb3febfbcec43e1c56a20cd89392c763e8d141fd6f3274289ed
  ```

- [ ] **Step 11: Rebuild optional M1 promotion integrations**

  Verify preconsumer commit
  `6025bd26117a3b84cf3fc1a6bfbac35fb28298a0` retained the optional M1
  promotion readers in audit, upstream run, and upstream select. Preserve those
  implementations through rebase.

  Add corrected-promotion fixtures proving:

  - absent M1 promotion remains a byte-preserving no-op;
  - corrected present promotion integrates exactly 103 paths;
  - execution authorization sees the 12 include closures; and
  - no broad selector or feature-manifest widening occurs.

  Applied-authority taxonomy reconstruction from the blocked consumer is not
  reintroduced in this task; Task 5 rebuilds it after corrected evidence is
  tracked.

- [ ] **Step 12: Run Task 4 GREEN unit/tooling checks**

  Run:

  ```bash
  node test/run-node.js \
    test/node/es2015-m1.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/upstream-select.test.js \
    test/node/repository-invariants.test.js
  npm run typecheck
  ESLINT_USE_FLAT_CONFIG=true npx eslint \
    tools/test262/harness-definitions.js \
    tools/test262/es2015-audit.js \
    tools/test262/es2015-m1.js \
    test/node/es2015-m1.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/upstream-select.test.js \
    test/node/repository-invariants.test.js
  npx prettier --check \
    tools/test262/harness-definitions.js \
    tools/test262/es2015-audit.js \
    tools/test262/es2015-m1.js \
    test/node/es2015-m1.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/upstream-select.test.js \
    test/node/repository-invariants.test.js
  git diff --check
  ```

  Expected: PASS with exact 12/91 closure split, seven-deletion projection,
  unchanged subset, 12-output pending record, and focused-runner containment.

- [ ] **Step 13: Run exact pinned M1 and seven-path probes**

  Run:

  ```bash
  TZ=UTC npm run test262:es2015:m1 -- \
    --ledger=tools/test262/es2015-m1-paths.txt \
    --output=.superpowers/issue-80/m1/execution.json
  node tools/test262/adapters/node.js \
    --root=vendor/test262 \
    test/built-ins/Object/internals/DefineOwnProperty/consistent-value-function-arguments.js \
    test/built-ins/Object/internals/DefineOwnProperty/consistent-value-function-caller.js \
    test/built-ins/Object/internals/DefineOwnProperty/consistent-value-regexp-dollar1.js \
    test/built-ins/Object/internals/DefineOwnProperty/consistent-writable-regexp-dollar1.js \
    test/staging/sm/Array/unshift-with-enumeration.js \
    test/staging/sm/object/bug-1206700.js \
    test/staging/sm/strict/primitive-assignment.js
  TZ=UTC npm run test262:es2015:m1 -- \
    --build-scratch \
    --ledger=tools/test262/es2015-m1-paths.txt \
    --execution=.superpowers/issue-80/m1/execution.json \
    --output=.superpowers/issue-80/m1
  ```

  Expected:

  ```text
  M1: 113 roots / 226 variants; 103 / 206 complete-pass; 10 / 20 Proxy residual
  Seven stale paths: 13 passed, 0 failed, 0 skipped
  Include closures: 12 ["Reflect.construct"], 91 empty
  ```

- [ ] **Step 14: Verify corrected scratch and no tracked protected changes**

  Compare scratch authority record byte-for-value with repaired main's pending
  M1. Require corrected promotion/taxonomy/selection/projection hashes.

  Run:

  ```bash
  REPAIR_HANDOFF=/home/jordan/jsjs/.worktrees/m1-authority-repair/.superpowers/sdd/2026-08-23-m1-authority-repair/repair-delivery.json
  REPAIR_MERGE=$(node -e \
    "const h=require('$REPAIR_HANDOFF');process.stdout.write(h.repairMergeSha)")
  git diff --exit-code "$REPAIR_MERGE" -- \
    tools/test262/es2015-provenance.json \
    tools/test262/es2015-audit-evidence.json \
    tools/test262/es2015-taxonomy.json \
    tools/test262/upstream-subset.json \
    tools/test262/es5-selection.json \
    docs/test262-report.jsonl \
    docs/conformance.md
  test ! -e tools/test262/es2015-m1-baseline.json
  test ! -e tools/test262/es2015-m1-disposition.json
  test ! -e tools/test262/es2015-m1-owner-deltas.json
  test ! -e tools/test262/es2015-m1-owner-map.json
  test ! -e tools/test262/es2015-m1-paths.json
  test ! -e tools/test262/es2015-m1-promotion.json
  ```

  Expected: PASS. All corrected evidence/output bytes remain ignored scratch.

- [ ] **Step 15: Obtain fresh Task 4 specification review**

  Require review of branch reset/rebase, no blocked-consumer cherry-pick,
  low-level inventory boundary, exact 12 closures, seven deletions, zero subset
  delta, corrected hashes, 12-output record, and protected-output absence.

- [ ] **Step 16: Obtain fresh Task 4 code-quality review**

  Require a different reviewer to inspect extracted reader behavior, error
  compatibility, deterministic sorting, scratch path safety, focused-runner
  containment, tests, and no broad audit import from M1.

- [ ] **Step 17: Commit Task 4**

  Run:

  ```bash
  git add \
    tools/test262/harness-definitions.js \
    tools/test262/es2015-audit.js \
    tools/test262/es2015-m1.js \
    test/node/es2015-m1.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/upstream-select.test.js \
    test/node/repository-invariants.test.js
  git -c user.name='Copilot' \
    -c user.email='223556219+Copilot@users.noreply.github.com' \
    commit --author='Copilot <223556219+Copilot@users.noreply.github.com>' \
    -m 'fix: derive M1 include closures from pinned inventory' \
    -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
  ```

---

### Task 5: Rebuild the Corrected M1 Consumer and Pass Immutable Validation

**Files:**

- Add: six `tools/test262/es2015-m1-*.json` evidence files
- Modify: `tools/test262/es2015-provenance.json` (`M1.state` only)
- Modify: `tools/test262/es2015-audit-evidence.json`
- Modify: `tools/test262/es2015-taxonomy.json`
- Modify: `tools/test262/upstream-subset.json`
- Modify: `tools/test262/es5-selection.json`
- Modify: `docs/test262-report.jsonl`
- Modify: generated block in `docs/conformance.md`
- Modify: `.prettierignore`
- Modify: `docs/architecture.md`
- Modify: `docs/limitations.md`
- Modify: `docs/testing.md`
- Modify: `tools/test262/es2015-audit.js`
- Modify: final tracked-evidence tests

**Interfaces:**

- Consumes: corrected scratch and repaired pending M1.
- Produces: new consumer commit, not derived from
  `eb4bcbe9ae6d163d0b2578a40d22d7684d382d2b`.
- Produces: exact 12-output corrected `pending -> applied` range.
- Produces: immutable repaired-BASE range GREEN and focused local evidence.

- [ ] **Step 1: Start a fresh Task 5 worker**

  Invoke `superpowers:subagent-driven-development`. Require evidence under
  `.superpowers/sdd/2026-08-23-m1-authority-repair/task-5/`.

- [ ] **Step 2: Build the corrected normal consumer marker**

  Load `REPAIR_MERGE` from the repair handoff, then run:

  ```bash
  REPAIR_HANDOFF=/home/jordan/jsjs/.worktrees/m1-authority-repair/.superpowers/sdd/2026-08-23-m1-authority-repair/repair-delivery.json
  REPAIR_MERGE=$(node -e \
    "const h=require('$REPAIR_HANDOFF');process.stdout.write(h.repairMergeSha)")
  CONSUMER_MARKER=$(cat <<EOF
  <!-- es2015-roadmap-authority-consume
  parent:70
  code:M1
  issue:80
  profile:roadmap-reclassification:M1
  base:$REPAIR_MERGE
  source-path-sha256:65529ed8f9bdf88576314e95f4f164ac2c613e9ec44f0aae042a79aa5f8706b4
  source-entry-sha256:null
  protected-projection-sha256:22bf654462044eb3febfbcec43e1c56a20cd89392c763e8d141fd6f3274289ed
  -->
  EOF
  )
  mkdir -p .superpowers/issue-80/m1
  printf '%s\n' "$CONSUMER_MARKER" \
    > .superpowers/issue-80/m1/consumer-marker.txt
  ```

  Every field other than the exact repair merge SHA is literal.

- [ ] **Step 3: Run repaired BASE consumer RED before applying outputs**

  Run:

  ```bash
  REPAIR_HANDOFF=/home/jordan/jsjs/.worktrees/m1-authority-repair/.superpowers/sdd/2026-08-23-m1-authority-repair/repair-delivery.json
  REPAIR_MERGE=$(node -e \
    "const h=require('$REPAIR_HANDOFF');process.stdout.write(h.repairMergeSha)")
  CONSUMER_MARKER=$(cat <<EOF
  <!-- es2015-roadmap-authority-consume
  parent:70
  code:M1
  issue:80
  profile:roadmap-reclassification:M1
  base:$REPAIR_MERGE
  source-path-sha256:65529ed8f9bdf88576314e95f4f164ac2c613e9ec44f0aae042a79aa5f8706b4
  source-entry-sha256:null
  protected-projection-sha256:22bf654462044eb3febfbcec43e1c56a20cd89392c763e8d141fd6f3274289ed
  -->
  EOF
  )
  SEMANTIC_ROOT=$(git rev-parse --show-toplevel)
  REPAIR_BASE_WORKTREE=$SEMANTIC_ROOT/.superpowers/issue-80/m1/repaired-base
  git worktree add --detach "$REPAIR_BASE_WORKTREE" "$REPAIR_MERGE"
  PRECONSUMER_HEAD=$(git rev-parse HEAD)
  set +e
  PRECONSUMER_OUTPUT=$(
    cd "$REPAIR_BASE_WORKTREE"
    TZ=UTC node tools/test262/es2015-provenance-check.js \
      --check-range \
      --base="$REPAIR_MERGE" \
      --head="$PRECONSUMER_HEAD" \
      --profile=roadmap-reclassification:M1 \
      --marker="$CONSUMER_MARKER" 2>&1
  )
  PRECONSUMER_STATUS=$?
  set -e
  test "$PRECONSUMER_STATUS" -ne 0
  printf '%s\n' "$PRECONSUMER_OUTPUT" | grep -F \
    'M1 roadmap authority must transition only from pending to applied'
  ```

  Expected: FAIL with:

  ```text
  M1 roadmap authority must transition only from pending to applied
  ```

- [ ] **Step 4: Copy corrected evidence and projected outputs**

  Run:

  ```bash
  cp .superpowers/issue-80/m1/evidence/es2015-m1-paths.json \
    tools/test262/es2015-m1-paths.json
  cp .superpowers/issue-80/m1/evidence/es2015-m1-baseline.json \
    tools/test262/es2015-m1-baseline.json
  cp .superpowers/issue-80/m1/evidence/es2015-m1-disposition.json \
    tools/test262/es2015-m1-disposition.json
  cp .superpowers/issue-80/m1/evidence/es2015-m1-owner-deltas.json \
    tools/test262/es2015-m1-owner-deltas.json
  cp .superpowers/issue-80/m1/evidence/es2015-m1-owner-map.json \
    tools/test262/es2015-m1-owner-map.json
  cp .superpowers/issue-80/m1/evidence/es2015-m1-promotion.json \
    tools/test262/es2015-m1-promotion.json
  cp .superpowers/issue-80/m1/projected/docs/conformance.md \
    docs/conformance.md
  cp .superpowers/issue-80/m1/projected/docs/test262-report.jsonl \
    docs/test262-report.jsonl
  cp .superpowers/issue-80/m1/projected/tools/test262/es2015-audit-evidence.json \
    tools/test262/es2015-audit-evidence.json
  cp .superpowers/issue-80/m1/projected/tools/test262/es2015-taxonomy.json \
    tools/test262/es2015-taxonomy.json
  cp .superpowers/issue-80/m1/projected/tools/test262/upstream-subset.json \
    tools/test262/upstream-subset.json
  cp .superpowers/issue-80/m1/projected/tools/test262/es5-selection.json \
    tools/test262/es5-selection.json
  ```

  Verify every byte hash before staging. Do not copy the old diagnostic scratch.

- [ ] **Step 5: Apply only M1 pending -> applied**

  Run:

  ```bash
  node --input-type=module <<'JS'
  import { readFileSync, writeFileSync } from 'node:fs';
  import { canonicalRoadmapAuthoritySha256 } from './tools/test262/es2015-provenance.js';

  const path = 'tools/test262/es2015-provenance.json';
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  const m1 = manifest.roadmapAuthorities.find((entry) => entry.code === 'M1');
  if (
    m1 === undefined ||
    m1.state !== 'pending' ||
    canonicalRoadmapAuthoritySha256(m1) !==
      '42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670'
  ) {
    throw new Error('M1 is not the exact corrected pending authority');
  }
  m1.state = 'applied';
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  JS
  ```

  Compare BASE/HEAD M1 after deleting only `state`. All other values must be
  equal.

- [ ] **Step 6: Restore generated-file ownership and manual docs**

  Recreate the six M1 generated entries in `.prettierignore`. Rebuild, rather
  than cherry-pick, the final architecture/limitations/testing documentation
  from the current semantic behavior and corrected authority lifecycle.

  `docs/testing.md` must distinguish:

  - repair marker exception, now historical;
  - corrected M1 normal consumer marker;
  - 12 include closures;
  - seven exact exclusions and zero subset delta;
  - 12 protected outputs; and
  - exact local broad-run prohibitions.

- [ ] **Step 7: Rebuild applied-authority audit reconstruction**

  Reimplement the blocked consumer's applied-roadmap reversal manually from its
  reviewed diff. Generalize the current M0-only helper to reverse applied
  authorities in this exact order:

  ```js
  for (const evidence of [
    {
      code: 'M1',
      baselinePath: 'tools/test262/es2015-m1-baseline.json',
      dispositionPath: 'tools/test262/es2015-m1-disposition.json',
    },
    {
      code: 'M0',
      baselinePath: 'tools/test262/es2015-m0-baseline.json',
      dispositionPath: 'tools/test262/es2015-m0-disposition.json',
    },
  ]) {
    const authority = roadmapAuthorities.find(
      (candidate) =>
        candidate.code === evidence.code && candidate.state === 'applied',
    );
    if (authority === undefined) continue;
    taxonomyText = await taxonomyBeforeAppliedRoadmapAuthority({
      taxonomyText,
      readFile,
      authority,
      ...evidence,
    });
  }
  ```

  The implementation requires exact evidence hashes, source path/count
  identity, current destination status/blocker, and byte-equivalent stable
  classification fields. Tests cover M1 then M0 ordering, absent authority,
  wrong evidence, wrong destination, and foreign taxonomy drift.

- [ ] **Step 8: Add tracked corrected-evidence tests**

  Extend M1 tests to require:

  ```text
  promotion SHA 31f807a05d56d35762cd5457f779624df04f11ef482b3d1bcb60be3a06883c69
  taxonomy SHA fba700539b05edd67b6cf67e4c0a1361398a2d0f04212bc7080a83f44abf577a
  selection SHA 78ac694beb258be0b67c7788137c736b0b30cf7457e3a903d364d38c038b48df
  authority outputs 12
  aggregate projection 22bf654462044eb3febfbcec43e1c56a20cd89392c763e8d141fd6f3274289ed
  state applied
  ```

  Reproduce current tracked outputs from baseline/evidence and require exact
  bytes.

- [ ] **Step 9: Stage an ephemeral consumer HEAD**

  Run:

  ```bash
  git add \
    .prettierignore \
    docs/architecture.md \
    docs/conformance.md \
    docs/limitations.md \
    docs/test262-report.jsonl \
    docs/testing.md \
    test/node/es2015-m1.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/repository-invariants.test.js \
    test/node/upstream-select.test.js \
    tools/test262/es2015-audit-evidence.json \
    tools/test262/es2015-audit.js \
    tools/test262/es2015-m1-baseline.json \
    tools/test262/es2015-m1-disposition.json \
    tools/test262/es2015-m1-owner-deltas.json \
    tools/test262/es2015-m1-owner-map.json \
    tools/test262/es2015-m1-paths.json \
    tools/test262/es2015-m1-promotion.json \
    tools/test262/es2015-provenance.json \
    tools/test262/es2015-taxonomy.json \
    tools/test262/es5-selection.json \
    tools/test262/upstream-subset.json
  CONSUMER_TREE=$(git write-tree)
  CONSUMER_CHECK_HEAD=$(printf 'corrected M1 consumer candidate\n' |
    git commit-tree "$CONSUMER_TREE" -p "$(git rev-parse HEAD)")
  printf '%s\n' "$CONSUMER_CHECK_HEAD" \
    > .superpowers/issue-80/m1/consumer-check-head.txt
  ```

- [ ] **Step 10: Run immutable repaired-BASE GREEN**

  From the detached `REPAIR_MERGE` worktree:

  ```bash
  REPAIR_HANDOFF=/home/jordan/jsjs/.worktrees/m1-authority-repair/.superpowers/sdd/2026-08-23-m1-authority-repair/repair-delivery.json
  REPAIR_MERGE=$(node -e \
    "const h=require('$REPAIR_HANDOFF');process.stdout.write(h.repairMergeSha)")
  REPAIR_BASE_WORKTREE=$(git rev-parse --show-toplevel)/.superpowers/issue-80/m1/repaired-base
  CONSUMER_CHECK_HEAD=$(cat \
    .superpowers/issue-80/m1/consumer-check-head.txt)
  CONSUMER_MARKER=$(cat \
    .superpowers/issue-80/m1/consumer-marker.txt)
  cd "$REPAIR_BASE_WORKTREE"
  TZ=UTC node tools/test262/es2015-provenance-check.js \
    --check-range \
    --base="$REPAIR_MERGE" \
    --head="$CONSUMER_CHECK_HEAD" \
    --profile=roadmap-reclassification:M1 \
    --marker="$CONSUMER_MARKER"
  ```

  Expected: PASS with exact 12-output projection.

- [ ] **Step 11: Run focused semantic gates**

  Run:

  ```bash
  node test/run-node.js \
    test/reflect.test.js \
    test/abstract-operations.test.js \
    test/native-builtins.test.js \
    test/function-builtins.test.js \
    test/function-realm.test.js \
    test/object-internal-method-contract.test.js \
    test/node/es2015-m1.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/upstream-select.test.js \
    test/node/es2015-provenance.test.js \
    test/node/repository-invariants.test.js
  node test/run-browser-playwright.js \
    test/reflect.test.js \
    test/abstract-operations.test.js \
    test/native-builtins.test.js \
    test/function-builtins.test.js
  TZ=UTC npm run test262:es2015:m1 -- \
    --ledger=tools/test262/es2015-m1-paths.txt \
    --output=.superpowers/issue-80/m1/final-execution.json
  node tools/test262/adapters/node.js \
    --root=vendor/test262 \
    test/built-ins/Object/internals/DefineOwnProperty/consistent-value-function-arguments.js \
    test/built-ins/Object/internals/DefineOwnProperty/consistent-value-function-caller.js \
    test/built-ins/Object/internals/DefineOwnProperty/consistent-value-regexp-dollar1.js \
    test/built-ins/Object/internals/DefineOwnProperty/consistent-writable-regexp-dollar1.js \
    test/staging/sm/Array/unshift-with-enumeration.js \
    test/staging/sm/object/bug-1206700.js \
    test/staging/sm/strict/primitive-assignment.js
  npm run typecheck
  npm run vendor:check
  npm run ci:check
  TZ=UTC npm run test262:es2015:audit:check
  TZ=UTC npm run test262:es2015:sync-promoted-report -- --check
  TZ=UTC npm run test262:select:check
  TZ=UTC npm run test262:es2015:provenance:check
  npm run test262:exclusions:check
  node benchmark/cli.js run \
    --host=node \
    --profile=smoke \
    --output=.benchmark-results/issue-80/repair-consumer-smoke
  git diff --check
  ```

  Also run scoped ESLint/Prettier over every changed source/test/manual doc.

  Expected:

  ```text
  M1 exact: 113 / 226
  selected: 103 / 206
  Proxy residual: 10 / 20
  include closures: 12 Reflect.construct, 91 empty
  seven paths: 13 passed
  subset: 20,595 paths / 61 groups, unchanged hash
  exclusions check: pass
  repaired BASE range: pass
  ```

  Do not run broad/full Test262, `npm test`, `ci:contract`, or full runtime
  suites locally.

- [ ] **Step 12: Obtain fresh Task 5 specification review**

  Require review of no old-consumer cherry-pick, exact bytes/hashes, 12 outputs,
  only state transition, seven cleanup, no subset delta, docs, and immutable
  checker GREEN.

- [ ] **Step 13: Obtain fresh Task 5 code-quality review**

  Require a different reviewer to inspect file ownership, generated/manual
  separation, test determinism, scratch provenance, local commands,
  performance smoke, and branch scope.

- [ ] **Step 14: Commit rebuilt consumer**

  Commit every staged corrected consumer file with:

  ```bash
  git -c user.name='Copilot' \
    -c user.email='223556219+Copilot@users.noreply.github.com' \
    commit --author='Copilot <223556219+Copilot@users.noreply.github.com>' \
    -m 'test262: consume corrected M1 Reflect authority' \
    -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
  ```

  Re-run Steps 10-11 against the real commit SHA.

---

### Task 6: Review, Deliver, and Close the Corrected M1 Consumer

**Files:**

- No additional planned tracked path
- Write ignored consumer PR/CI/CodeQL/closure evidence
- Update GitHub issues #80, #81, #70, and #98 after merge

**Interfaces:**

- Consumes: Task 5 corrected consumer commit and repair handoff.
- Produces: ordinary fully green M1 consumer PR and squash merge.
- Produces: exact-main verification and durable roadmap/ownership updates.

- [ ] **Step 1: Start a fresh Task 6 delivery worker**

  Invoke `superpowers:subagent-driven-development`. Require evidence under
  `.superpowers/sdd/2026-08-23-m1-authority-repair/task-6/`.

- [ ] **Step 2: Reconcile live main**

  Run:

  ```bash
  REPAIR_HANDOFF=/home/jordan/jsjs/.worktrees/m1-authority-repair/.superpowers/sdd/2026-08-23-m1-authority-repair/repair-delivery.json
  REPAIR_PR=$(node -e \
    "const h=require('$REPAIR_HANDOFF');process.stdout.write(String(h.repairPr))")
  REPAIR_MERGE=$(node -e \
    "const h=require('$REPAIR_HANDOFF');process.stdout.write(h.repairMergeSha)")
  git fetch origin main
  LIVE_MAIN=$(git rev-parse origin/main)
  test "$LIVE_MAIN" = "$REPAIR_MERGE"
  ```

  If the final test fails:

  - do not push;
  - inspect every changed path;
  - rebase only if the repaired M1 record and every registered BASE hash remain
    exact;
  - regenerate scratch and rerun Task 5;
  - stop for a newly reviewed authority correction if any registered identity
    changes.

- [ ] **Step 3: Obtain final whole-consumer reviews**

  Require:

  - fresh specification review for compliance with all original M1 behavior
    plus repair recovery;
  - fresh code-quality review of the full repaired-main-to-consumer range; and
  - fresh whole-branch security/correctness review.

  Fix findings with RED tests, rerun Task 5 focused gates and immutable range
  GREEN, then repeat all reviews on the new exact HEAD.

- [ ] **Step 4: Push and open the corrected consumer PR**

  Run:

  ```bash
  REPAIR_HANDOFF=/home/jordan/jsjs/.worktrees/m1-authority-repair/.superpowers/sdd/2026-08-23-m1-authority-repair/repair-delivery.json
  REPAIR_MERGE=$(node -e \
    "const h=require('$REPAIR_HANDOFF');process.stdout.write(h.repairMergeSha)")
  CONSUMER_MARKER=$(cat <<EOF
  <!-- es2015-roadmap-authority-consume
  parent:70
  code:M1
  issue:80
  profile:roadmap-reclassification:M1
  base:$REPAIR_MERGE
  source-path-sha256:65529ed8f9bdf88576314e95f4f164ac2c613e9ec44f0aae042a79aa5f8706b4
  source-entry-sha256:null
  protected-projection-sha256:22bf654462044eb3febfbcec43e1c56a20cd89392c763e8d141fd6f3274289ed
  -->
  EOF
  )
  git push -u origin yoonbuck-issue-80-reflect
  CONSUMER_PR_URL=$(gh pr create \
    --repo yoonbuck/jsjs \
    --base main \
    --head yoonbuck-issue-80-reflect \
    --title 'Complete ES2015 Reflect atop the repaired authority' \
    --body "$CONSUMER_MARKER

  Tracks #80

  ## Recovery

  - rebuilt from repaired pending M1; blocked consumer eb4bcbe was not cherry-picked
  - 12 exact include closures use Reflect.construct
  - seven stale exclusions removed with zero subset path/group delta
  - corrected promotion 103/206 and Proxy residual 10/20
  - 12 protected outputs; aggregate projection 22bf654462044eb3febfbcec43e1c56a20cd89392c763e8d141fd6f3274289ed

  ## Local boundary

  - exact M1, exact seven paths, focused runtime/tooling, audit/selection/exclusion/provenance, type/lint/format, benchmark smoke
  - no broad/full local Test262, npm test, or ci:contract")
  CONSUMER_PR=$(gh pr view "$CONSUMER_PR_URL" \
    --repo yoonbuck/jsjs --json number --jq .number)
  ```

- [ ] **Step 5: Require every consumer PR check green**

  `pull_request_target` now runs the repaired BASE checker, recognizes the
  normal roadmap consumption marker, and must pass. No exception applies to the
  consumer.

  Run:

  ```bash
  CONSUMER_PR=$(gh pr list --repo yoonbuck/jsjs \
    --head yoonbuck-issue-80-reflect \
    --base main \
    --state open \
    --json number \
    --jq 'if length == 1 then .[0].number else error("expected one consumer PR") end')
  while true; do
    gh pr checks "$CONSUMER_PR" --repo yoonbuck/jsjs \
      --json name,state,bucket,link \
      > .superpowers/issue-80/m1/consumer-checks.json
    if node - <<'JS'
  const checks = require('./.superpowers/issue-80/m1/consumer-checks.json');
  process.exit(checks.some((check) => check.bucket === 'pending') ? 1 : 0);
  JS
    then
      break
    fi
    sleep 30
  done
  node - <<'JS'
  const checks = require('./.superpowers/issue-80/m1/consumer-checks.json');
  const failures = checks.filter((check) =>
    ['fail', 'cancel'].includes(check.bucket),
  );
  if (failures.length !== 0) {
    throw new Error(`consumer checks failed: ${JSON.stringify(failures)}`);
  }
  if (!checks.some((check) => check.name === 'Provenance base guard' && check.bucket === 'pass')) {
    throw new Error('consumer provenance base guard did not pass');
  }
  JS
  ```

  Inspect the provenance base guard, ordinary Test262 subset job, audit,
  selection, exclusion, and generated report logs.

- [ ] **Step 6: Verify exact consumer HEAD CodeQL**

  Run:

  ```bash
  CONSUMER_PR=$(gh pr list --repo yoonbuck/jsjs \
    --head yoonbuck-issue-80-reflect \
    --base main \
    --state open \
    --json number \
    --jq 'if length == 1 then .[0].number else error("expected one consumer PR") end')
  gh pr checks "$CONSUMER_PR" --repo yoonbuck/jsjs \
    --json name,state,bucket,link \
    > .superpowers/issue-80/m1/consumer-checks.json
  REVIEWED_CONSUMER_HEAD=$(gh pr view "$CONSUMER_PR" \
    --repo yoonbuck/jsjs --json headRefOid --jq .headRefOid)
  test "$REVIEWED_CONSUMER_HEAD" = "$(git rev-parse HEAD)"
  node - <<'JS'
  const checks = require('./.superpowers/issue-80/m1/consumer-checks.json');
  const codeql = checks.filter((check) =>
    check.name.toLowerCase().includes('codeql'),
  );
  if (codeql.length < 2) {
    throw new Error(`consumer PR lacks both CodeQL check-runs: ${JSON.stringify(codeql)}`);
  }
  if (codeql.some((check) => check.bucket !== 'pass')) {
    throw new Error(`consumer PR CodeQL checks are not successful: ${JSON.stringify(codeql)}`);
  }
  JS
  printf '%s\n' "$REVIEWED_CONSUMER_HEAD" \
    > .superpowers/issue-80/m1/reviewed-consumer-head.txt
  gh api 'repos/yoonbuck/jsjs/code-scanning/alerts?state=open&per_page=100' \
    > .superpowers/issue-80/m1/consumer-open-alerts.json
  test "$(node -e \
    "const a=require('./.superpowers/issue-80/m1/consumer-open-alerts.json');process.stdout.write(String(a.length))")" = 0
  ```

- [ ] **Step 7: Squash-merge the corrected consumer**

  After required human review and all-green checks:

  ```bash
  CONSUMER_PR=$(gh pr list --repo yoonbuck/jsjs \
    --head yoonbuck-issue-80-reflect \
    --base main \
    --state open \
    --json number \
    --jq 'if length == 1 then .[0].number else error("expected one consumer PR") end')
  REVIEWED_CONSUMER_HEAD=$(cat \
    .superpowers/issue-80/m1/reviewed-consumer-head.txt)
  CURRENT_CONSUMER_HEAD=$(gh pr view "$CONSUMER_PR" \
    --repo yoonbuck/jsjs --json headRefOid --jq .headRefOid)
  test "$CURRENT_CONSUMER_HEAD" = "$REVIEWED_CONSUMER_HEAD"
  gh pr merge "$CONSUMER_PR" \
    --repo yoonbuck/jsjs \
    --squash \
    --delete-branch
  git fetch origin main
  CONSUMER_MERGE=$(gh pr view "$CONSUMER_PR" \
    --repo yoonbuck/jsjs --json mergeCommit --jq .mergeCommit.oid)
  test "$(git rev-parse origin/main)" = "$CONSUMER_MERGE"
  ```

- [ ] **Step 8: Verify exact-main consumer CI and CodeQL**

  Run:

  ```bash
  CONSUMER_PR=$(gh pr list --repo yoonbuck/jsjs \
    --head yoonbuck-issue-80-reflect \
    --state merged \
    --json number \
    --jq 'if length >= 1 then .[0].number else error("missing merged consumer PR") end')
  CONSUMER_MERGE=$(gh pr view "$CONSUMER_PR" \
    --repo yoonbuck/jsjs --json mergeCommit --jq .mergeCommit.oid)
  for attempt in $(seq 1 60); do
    gh run list --repo yoonbuck/jsjs --commit "$CONSUMER_MERGE" \
      --json databaseId,workflowName,status,conclusion,url \
      > .superpowers/issue-80/m1/consumer-main-runs.json
    if node - <<'JS'
  const runs = require('./.superpowers/issue-80/m1/consumer-main-runs.json');
  process.exit(
    runs.some((run) => run.workflowName === 'CI' && run.conclusion === 'success')
      ? 0
      : 1,
  );
  JS
    then
      break
    fi
    sleep 30
  done
  node - <<'JS'
  const runs = require('./.superpowers/issue-80/m1/consumer-main-runs.json');
  if (!runs.some((run) => run.workflowName === 'CI' && run.conclusion === 'success')) {
    throw new Error('consumer merge lacks exact-main CI success');
  }
  JS
  gh api 'repos/yoonbuck/jsjs/code-scanning/analyses?per_page=100' \
    > .superpowers/issue-80/m1/consumer-main-codeql.json
  CONSUMER_MERGE="$CONSUMER_MERGE" node - <<'JS'
  const analyses = require('./.superpowers/issue-80/m1/consumer-main-codeql.json')
    .filter((analysis) => analysis.commit_sha === process.env.CONSUMER_MERGE);
  if (analyses.length < 2) {
    throw new Error('consumer merge lacks both exact-main CodeQL analyses');
  }
  if (analyses.some((analysis) => analysis.error || analysis.warning)) {
    throw new Error('consumer exact-main CodeQL contains errors or warnings');
  }
  JS
  gh api 'repos/yoonbuck/jsjs/code-scanning/alerts?state=open&per_page=100' \
    > .superpowers/issue-80/m1/consumer-main-alerts.json
  test "$(node -e \
    "const a=require('./.superpowers/issue-80/m1/consumer-main-alerts.json');process.stdout.write(String(a.length))")" = 0
  ```

  In a detached exact-main worktree, run only:

  ```bash
  SEMANTIC_ROOT=$(git rev-parse --show-toplevel)
  MAIN_VERIFY=$SEMANTIC_ROOT/.superpowers/issue-80/m1/main-verify
  git worktree add --detach "$MAIN_VERIFY" "$CONSUMER_MERGE"
  ln -s "$SEMANTIC_ROOT/node_modules" "$MAIN_VERIFY/node_modules"
  mkdir -p "$MAIN_VERIFY/vendor"
  ln -s "$SEMANTIC_ROOT/vendor/acorn" "$MAIN_VERIFY/vendor/acorn"
  ln -s "$SEMANTIC_ROOT/vendor/test262" "$MAIN_VERIFY/vendor/test262"
  cd "$MAIN_VERIFY"
  TZ=UTC npm run test262:es2015:m1 -- \
    --ledger=tools/test262/es2015-m1-paths.txt \
    --output=.superpowers/issue-80/m1/main-execution.json
  TZ=UTC npm run test262:es2015:audit:check
  TZ=UTC npm run test262:es2015:sync-promoted-report -- --check
  TZ=UTC npm run test262:select:check
  TZ=UTC npm run test262:es2015:provenance:check
  npm run test262:exclusions:check
  node test/run-node.js \
    test/reflect.test.js \
    test/node/es2015-m1.test.js \
    test/node/repository-invariants.test.js
  ```

  Expected: corrected M1 applied, 103/206 selected, 10/20 #81 residual, 12
  closures, seven exclusions absent, subset unchanged, and no generated drift.

- [ ] **Step 9: Publish issue evidence**

  Compute:

  ```bash
  SEMANTIC_ROOT=$(git rev-parse --show-toplevel)
  REPAIR_HANDOFF=/home/jordan/jsjs/.worktrees/m1-authority-repair/.superpowers/sdd/2026-08-23-m1-authority-repair/repair-delivery.json
  REPAIR_PR=$(node -e \
    "const h=require('$REPAIR_HANDOFF');process.stdout.write(String(h.repairPr))")
  REPAIR_MERGE=$(node -e \
    "const h=require('$REPAIR_HANDOFF');process.stdout.write(h.repairMergeSha)")
  CONSUMER_PR=$(gh pr list --repo yoonbuck/jsjs \
    --head yoonbuck-issue-80-reflect \
    --state merged \
    --json number \
    --jq 'if length >= 1 then .[0].number else error("missing merged consumer PR") end')
  CONSUMER_MERGE=$(gh pr view "$CONSUMER_PR" \
    --repo yoonbuck/jsjs --json mergeCommit --jq .mergeCommit.oid)
  REVIEWED_CONSUMER_HEAD=$(cat \
    "$SEMANTIC_ROOT/.superpowers/issue-80/m1/reviewed-consumer-head.txt")
  PROMOTION_SHA=$(sha256sum \
    tools/test262/es2015-m1-promotion.json | cut -d' ' -f1)
  SELECTION_SHA=$(sha256sum \
    tools/test262/es5-selection.json | cut -d' ' -f1)
  RESIDUAL_SHA=$(node --input-type=module -e "
    import { createHash } from 'node:crypto';
    import { readFileSync } from 'node:fs';
    const entries=JSON.parse(readFileSync('tools/test262/es2015-m1-owner-deltas.json','utf8'));
    const text=entries.map((entry)=>entry.path).join('\\n')+'\\n';
    process.stdout.write(createHash('sha256').update(text).digest('hex'));
  ")
  ```

  Comment on #80:

  ```bash
  gh issue comment 80 --repo yoonbuck/jsjs --body \
    "M1 recovery complete.

  - repair PR: #$REPAIR_PR / $REPAIR_MERGE
  - corrected consumer PR: #$CONSUMER_PR / $CONSUMER_MERGE
  - reviewed consumer head: $REVIEWED_CONSUMER_HEAD
  - source: 113 roots / 226 variants / 65529ed8f9bdf88576314e95f4f164ac2c613e9ec44f0aae042a79aa5f8706b4
  - promotion: 103 roots / 206 variants / $PROMOTION_SHA
  - Proxy residual for #81: 10 roots / 20 variants / $RESIDUAL_SHA
  - include closures: 12 Reflect.construct / 91 empty
  - stale exclusions removed: 7; selection SHA-256 $SELECTION_SHA
  - subset remains 20,595 paths / 61 groups / 9f768aa8fb0c473e98fe2156d290c4207cea797302cccad6f9b1b922a36b37c0
  - protected outputs: 12 / aggregate 22bf654462044eb3febfbcec43e1c56a20cd89392c763e8d141fd6f3274289ed
  - M1 authority: applied
  - exact PR/main CI and both CodeQL categories: clean
  - no Reflect.enumerate and no Proxy implementation"
  ```

  Comment on #81:

  ```bash
  gh issue comment 81 --repo yoonbuck/jsjs --body \
    "M1/#80 repaired and merged at \`$CONSUMER_MERGE\`. Ten Proxy-tagged Reflect roots / 20 variants remain assigned to M2; residual ledger SHA-256 \`$RESIDUAL_SHA\`. M0 and M1 prerequisites are resolved."
  ```

  Comment on #70:

  ```bash
  gh issue comment 70 --repo yoonbuck/jsjs --body \
    "M1/#80 recovery is complete at \`$CONSUMER_MERGE\`: 103/206 selected, 10/20 reassigned to #81, 12 include closures corrected, seven stale exclusions removed with no subset delta, repaired authority applied, exact CI/CodeQL clean."
  ```

  Comment on #98:

  ```bash
  gh issue comment 98 --repo yoonbuck/jsjs --body \
    "V0 Reflect evidence: all approved 13 methods plus @@toStringTag merged at \`$CONSUMER_MERGE\`; exact M1 source 113/226, selected 103/206, Proxy residual 10/20, corrected include closure and policy evidence recorded. Reflect.enumerate remains absent."
  ```

- [ ] **Step 10: Close #80 only after all gates**

  Close #80 after issue updates and exact-main verification. Record all final
  identities in:

  ```text
  /home/jordan/jsjs/.worktrees/issue80-reflect/.superpowers/sdd/2026-08-23-m1-authority-repair/consumer-closure.json
  ```

  Run:

  ```bash
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/issue80-reflect
  REPAIR_HANDOFF=/home/jordan/jsjs/.worktrees/m1-authority-repair/.superpowers/sdd/2026-08-23-m1-authority-repair/repair-delivery.json
  REPAIR_PR=$(node -e \
    "const h=require('$REPAIR_HANDOFF');process.stdout.write(String(h.repairPr))")
  REPAIR_MERGE=$(node -e \
    "const h=require('$REPAIR_HANDOFF');process.stdout.write(h.repairMergeSha)")
  CONSUMER_PR=$(gh pr list --repo yoonbuck/jsjs \
    --head yoonbuck-issue-80-reflect \
    --state merged \
    --json number \
    --jq 'if length >= 1 then .[0].number else error("missing merged consumer PR") end')
  CONSUMER_MERGE=$(gh pr view "$CONSUMER_PR" \
    --repo yoonbuck/jsjs --json mergeCommit --jq .mergeCommit.oid)
  REVIEWED_CONSUMER_HEAD=$(cat \
    "$SEMANTIC_ROOT/.superpowers/issue-80/m1/reviewed-consumer-head.txt")
  PROMOTION_SHA=$(sha256sum \
    "$SEMANTIC_ROOT/tools/test262/es2015-m1-promotion.json" | cut -d' ' -f1)
  SELECTION_SHA=$(sha256sum \
    "$SEMANTIC_ROOT/tools/test262/es5-selection.json" | cut -d' ' -f1)
  RESIDUAL_SHA=$(cd "$SEMANTIC_ROOT" && node --input-type=module -e "
    import { createHash } from 'node:crypto';
    import { readFileSync } from 'node:fs';
    const entries=JSON.parse(readFileSync('tools/test262/es2015-m1-owner-deltas.json','utf8'));
    const text=entries.map((entry)=>entry.path).join('\\n')+'\\n';
    process.stdout.write(createHash('sha256').update(text).digest('hex'));
  ")
  MAIN_VERIFY=$SEMANTIC_ROOT/.superpowers/issue-80/m1/main-verify
  REPAIR_BASE_WORKTREE=$SEMANTIC_ROOT/.superpowers/issue-80/m1/repaired-base
  cat > "$SEMANTIC_ROOT/.superpowers/sdd/2026-08-23-m1-authority-repair/consumer-closure.json" <<EOF
  {
    "repairPr": $REPAIR_PR,
    "repairMergeSha": "$REPAIR_MERGE",
    "consumerPr": $CONSUMER_PR,
    "consumerReviewedHead": "$REVIEWED_CONSUMER_HEAD",
    "consumerMergeSha": "$CONSUMER_MERGE",
    "promotionSha256": "$PROMOTION_SHA",
    "selectionSha256": "$SELECTION_SHA",
    "residualLedgerSha256": "$RESIDUAL_SHA",
    "aggregateProjectionSha256": "22bf654462044eb3febfbcec43e1c56a20cd89392c763e8d141fd6f3274289ed"
  }
  EOF
  gh issue close 80 --repo yoonbuck/jsjs --comment \
    "Closed after repaired M1 authority consumption, exact-main CI/CodeQL, 103/206 promotion, 10/20 #81 residual, 12 corrected include closures, seven stale exclusion removals, and #70/#81/#98 evidence updates."
  cd "$SEMANTIC_ROOT"
  git worktree remove "$MAIN_VERIFY"
  git worktree remove "$REPAIR_BASE_WORKTREE"
  ```

  Preserve diagnostic branches/evidence without rewriting history.

---

## Plan Self-Review Matrix

| Hardened spec requirement                                                      | Plan ownership                |
| ------------------------------------------------------------------------------ | ----------------------------- |
| Exact BASE, manifest, checker, and M1 record                                   | Global constraints, Tasks 2-3 |
| Single repair branch; docs never merge independently                           | Global constraints, Task 3    |
| `2026-08-23` paths supersede diagnostic drift                                  | Stable file map, Tasks 2-3    |
| Three confirmed root causes                                                    | Tasks 1, 4, and 5             |
| Generic report feature preservation                                            | Task 1                        |
| Exact one-use marker grammar                                                   | Tasks 2-3                     |
| Ordinary PR only; no repair local profile or pull_request_target activation    | Tasks 2-3                     |
| Validator independently enforces ordinary pull_request event                   | Task 2                        |
| Literal corrected HEAD constants                                               | Task 2                        |
| Self-consistent alternate marker/HEAD rejection                                | Task 2                        |
| Exact six-path statuses and no foreign operations                              | Tasks 2-3                     |
| Defense-in-depth immutable workflow/pipeline/policy/fragments/evidence/outputs | Task 2                        |
| Corrected pending record and manifest hashes                                   | Task 2                        |
| Promotion hash and four projection commitments                                 | Tasks 2 and 4                 |
| Corrected taxonomy HEAD hash                                                   | Tasks 4-5                     |
| Exact new selection replace-exact output                                       | Tasks 2, 4, and 5             |
| M1 stays pending in repair                                                     | Tasks 2-3                     |
| Expected old BASE guard failure/admin exception only                           | Task 3                        |
| Repair push rechecks exact origin/main BASE                                    | Task 3                        |
| Admin merge rechecks reviewed repair head                                      | Task 3                        |
| PR CodeQL uses successful check-runs plus zero alerts                          | Tasks 3 and 6                 |
| Exact-main CodeQL uses commit_sha matching                                     | Tasks 3 and 6                 |
| Fresh-shell variable rederivation/handoff files                                | Every delivery task           |
| Manual diff uses find-renames/find-copies                                      | Task 3                        |
| Repair CI/CodeQL/exact-main/handoff                                            | Task 3                        |
| Drop blocked consumer and rebase preconsumer semantics                         | Task 4                        |
| Pinned inventory include closure: 12 nonempty / 91 empty                       | Task 4                        |
| Seven exact deletions / 13 passing variants / zero subset delta                | Task 4                        |
| Corrected scratch/evidence/projection/12 outputs                               | Task 4                        |
| Rebuilt normal pending-to-applied consumer                                     | Task 5                        |
| Immutable repaired-BASE GREEN and focused local gates                          | Task 5                        |
| Per-task fresh worker/specification/quality reviews                            | Every task                    |
| Whole repair/consumer reviews                                                  | Tasks 3 and 6                 |
| Consumer PR/CI/CodeQL/merge/exact-main/issues                                  | Task 6                        |
| No broad/full local Test262, npm test, or ci:contract                          | Global constraints, Tasks 3-6 |

Interface flow is closed: Task 1 repairs generic report validation; Task 2
creates the exact pending repair; Task 3 produces the sole semantic handoff;
Task 4 regenerates a matching corrected pending record without tracked outputs;
Task 5 applies those exact bytes and only the state transition; Task 6 delivers
the all-green normal consumer.
