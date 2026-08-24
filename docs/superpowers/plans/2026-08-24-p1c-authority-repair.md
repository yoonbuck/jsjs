# P1C Authority Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the stale pending P1C authority through one exact
ordinary-PR HEAD-checker exception, then rebuild and deliver the P1C semantic
consumer with the exact four-path ES2016 collateral correction.

**Architecture:** The repair branch first freezes the corrected pending
authority contract in focused checker fixtures, then adds a P1C-specific
one-use marker and validator that can change only the pending record across an
exact six-path range while all evidence, protected outputs, runtime, workflow,
and policy bytes remain immutable. After that repair squash-merges, a fresh
semantic branch replays the reviewed pre-consumer commits, adds one closed
four-path collateral module shared by P1C projection and H0 historical audit
reversal, regenerates corrected scratch artifacts, and performs a normal
`pending -> applied` consumption.

**Tech Stack:** Plain ECMAScript modules with strict JSDoc/checkJs, Node.js,
the repository Node/browser test harnesses, pinned Test262
`b363f29d3c43c626dc852744ad64a0b48a003693`, Git, Git worktrees, GitHub
Actions, GitHub CLI, and GitHub Code Scanning.

**Spec:** `docs/superpowers/specs/2026-08-24-p1c-authority-repair-design.md`

## Global Constraints

- The reviewed design HEAD is
  `0b044fb9122d66f2565dae250ebf394ba7f77c3c`.
- The reviewed design file SHA-256 is
  `96951b710e7d05543b6abdc512abbdd0538e78f13c598aaf6aef275ba64d03a3`.
- The normative diagnostic is
  `/home/jordan/jsjs/.worktrees/issue78-decomposition/.superpowers/sdd/2026-08-23-p1c-catch-binding-semantics/task-9-authority-repair-diagnostic.md`.
- The diagnostic semantic HEAD is
  `e937140d8b40e2599faf98a8e6b370982036e61d`.
- The repair worktree is
  `/home/jordan/jsjs/.worktrees/p1c-authority-repair`.
- The repair branch is `yoonbuck-p1c-authority-repair`.
- The exact repair BASE is
  `edccfb8822339dab53c47bbb8c4ae5cc2db93b1b`.
- The repair BASE manifest SHA-256 is
  `55b95d0fb5071b411dd3d82051496505e154f043adee62c2bd2e4aae643c2227`.
- The repair BASE checker SHA-256 is
  `c806b9987a647b790ecfa736f4b6cc960e86c78755c3a824885313bae4b37e96`.
- The immutable BASE workflow SHA-256 is
  `612ea855e621dd9d746cd2781c65d2dd754bd9313ca27e5cd190cde2aab39f24`.
- The immutable BASE pipeline SHA-256 is
  `a96878a19f20fd1c9cde3d385c695b32575d2078081e3ed72f40922e45303b2c`.
- The repair BASE P1C canonical record SHA-256 is
  `3281bd0001ac48ee6f31d21d12a8faade3652cd194360fcf21c3ffc1b9a3a193`.
- The corrected pending P1C canonical record SHA-256 is
  `95036226ee50e365b03c823bab751c6e1d646af0d5c6352a199cd442e2aa9278`.
- The corrected pending manifest SHA-256 is
  `5b94b819025e79ebadb763a7d5eb0ce67174f15effcee61745d305e2a32034c4`.
- The corrected pending pretty-record SHA-256 is
  `62e26cc29ffeab0e67899c968f3ccb974dd663ee8b2beadd5c2a31ddbce2373f`.
- The corrected protected aggregate SHA-256 is
  `6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813`.
- The stale protected aggregate
  `30354b59b9dea45a94b47ca5c1edf270c161e3230f04661e4ce6cfe8f9089b0b`
  is never accepted by the corrected consumer.
- The corrected protected-projection file SHA-256 is
  `1d519386e047579f683e7cb0a6f5e341de07034874487fbb1f12744b0033f6aa`.
- The corrected applied P1C canonical record SHA-256 is
  `64db02e17f5d7e7f26805eee912d625b53a989e4c4ae17b15165bea3118bfefa`.
- The corrected applied pretty-record SHA-256 is
  `4d28314fa10b12d2b0bb7696d1f748dbaf3b9471a24536c54d54d99c6a8c4e43`.
- The corrected applied manifest SHA-256 is
  `55cea42748f5f2a2abc2228b7d33aa0f4d6c2ec9b55b2d96f40782eb565f396f`.
- The marker bytes, including the final LF, have SHA-256
  `780c1ce94d24ef9e249c209fdd28a56ab9ec885ec4d75a92ba7c0ecd21396177`.
- P1C source identity remains 81 roots / 161 variants with path SHA-256
  `e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5`,
  `entryLedgerSha256: null`, and `reconciliation: null`.
- All 81 P1C dispositions remain `selected-passing`, blocker `null`, issue
  `116`.
- All six P1C evidence files and hashes remain exact:

  ```text
  tools/test262/es2015-p1c-baseline.json
  86e3ca7c89716f4624bf029816bfe41befbc0a86c0d67ffe7066d7d27e8ed9e4

  tools/test262/es2015-p1c-disposition.json
  662616db1c184b2475f091ef5c380760afacb298abae8cf6fe7fac0ae528d3bc

  tools/test262/es2015-p1c-owner-deltas.json
  37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570

  tools/test262/es2015-p1c-owner-map.json
  37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570

  tools/test262/es2015-p1c-paths.json
  d7cd9512d5eb520b1ac9cbbbcc9414381d5de2b1c7de35fa891b5a100352d124

  tools/test262/es2015-p1c-promotion.json
  5c201d87dc4c0b7a18d3dce7e1c69933356f628008a6ef837eb5353641610501
  ```

- The corrected generated output SHA-256 values are:

  ```text
  tools/test262/es2015-audit-evidence.json
  50f9a54346d0e9e5168a6ac6b0b8de6d709e2c5b808d6c8b036e5113612e638c

  tools/test262/es2015-taxonomy.json
  fdf3c8bf229f6c841209e4c4a2196001d45cf0a1c270f334cf06e5f54a00f3c7

  tools/test262/upstream-subset.json
  5a5b83b3c28991c5f2ac141ed949a9698966cce85587d671a4417228d5e08b14

  docs/test262-report.jsonl
  89002c4b597748a53ccc4ea60df25d981660f4311cee1e933f95fd13b39e69ff

  docs/conformance.md
  9cc4250ed8a69e7d62e82ad7452bb2563c319856ed97a53bd00b96d0017c6cfe
  ```

- Report and conformance remain `project`. Audit, taxonomy, and subset are
  `replace-exact`. The six evidence outputs remain `add-exact`.
- Report BASE SHA-256 remains
  `ead91d3f6c0f23f8cfbe839bef3e371539e5f8fa590b9b351570714ce740e5c8`;
  conformance BASE SHA-256 remains
  `61ed7a18ff9d77c9b0b3e5d4c598ce30e998d633be88bb1bc101c650aee65169`.
- Corrected selected output is 62 groups / 20,672 roots / 39,292 variants.
- Corrected generated non-T0 selection is 14,349 unique roots.
- Corrected audit evidence is 21,862 records / 5,014 blockers / 2 intentional
  deviations.
- Corrected core status counts are 19,845/37,784 `selected-passing` and
  406/798 `blocked:early-errors-and-declaration-instantiation`.
- The repair PR changes no evidence file, protected-output byte, selection
  file, runtime file, workflow, pipeline, policy, feature manifest, range
  profile, or decision fragment.
- P1C remains `pending` throughout the repair PR. Only the later normal
  consumer changes corrected P1C `pending -> applied`.
- The one-use marker is recognized only by the checked-out HEAD checker on
  ordinary `pull_request`. It is never scanned on `pull_request_target` and is
  never accepted through local `--profile/--marker`.
- The unchanged exact BASE checker must fail only with
  `A provenance-owned PR range requires one authoritative provenance marker`.
- Only that exact trusted BASE failure may receive an explicit administrator
  exception. No other CI, test, CodeQL, extraction, warning, or alert failure
  is waivable.
- A marker and HEAD that agree on alternate manifest/record hashes must still
  fail the immutable corrected literals.
- The complete repair BASE-to-HEAD range is exactly six paths: four modified
  implementation/documentation files plus the already committed design and
  this plan.
- The design and plan remain on the same repair branch and enter one repair PR;
  neither document may merge independently.
- PR #118 must be closed unmerged and must not be reopened, force-updated, or
  reused as the corrected delivery PR.
- Preserve PR #118's reviewed commit
  `e937140d8b40e2599faf98a8e6b370982036e61d` and diagnostic evidence.
- The fresh semantic branch replays exactly the 23 commits in
  `edccfb8822339dab53c47bbb8c4ae5cc2db93b1b..d667a0cf41aaf1f822b0d58cec155af7759df83f`.
- Never replay
  `a085d445648d4e1d059b884459b90ee693268ba7..e937140d8b40e2599faf98a8e6b370982036e61d`
  wholesale.
- Reapply only the checkout-independent P1C inventory test, the isolated
  scratch fixture fix, and an authority-correct audit serialization rule from
  the diagnostic tail.
- Corrected live P1R accounting is 254 roots / 494 variants with SHA-256
  `3a2356b36431b3553a65289afd03eb0aa1e88a36e78b3684cfb460eaf426c4d6`.
- Corrected live decomposition accounting is 487 roots / 959 variants with
  SHA-256
  `94467957a7d427219cfcbe301adef006052437c30a56533ef510e3dacbfbaf88`.
- Corrected remaining post-P1C selector accounting is 406 roots / 798 variants
  with SHA-256
  `182c54ed6fbd4b290b11172809ddd5289bb45b16a07a2c1e4402b94fec2feba7`.
- Do not create or consume P1R before P1F. Do not create a P1R issue in this
  work.
- Local work is focused only. Never run broad/full Test262,
  `npm run test262:upstream`, `npm run test262:upstream:check`, `npm test`,
  `npm run ci:contract`, full Node, full browser, full JSC, or a full local CI
  emulation.
- Full-tree deterministic generators/checkers are allowed where the spec
  explicitly requires `test262:select:check`, `test262:es2015:audit:check`,
  and selected-report reconstruction; they do not execute broad Test262.
- Every task uses `superpowers:subagent-driven-development`: one fresh worker,
  then a fresh specification-compliance reviewer, then a different fresh
  code-quality reviewer, with fix/retest/re-review loops.
- Every persistent commit is authored by
  `Copilot <223556219+Copilot@users.noreply.github.com>` and includes
  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- Every shell block is self-contained. It defines its repository, worktree,
  base, head, marker, PR, or handoff variables instead of assuming shell state
  from a previous command.
- Use only repository-relative scratch under `.superpowers/` and
  `.benchmark-results/`. Never use `/tmp`, `/var/tmp`, or `mktemp`.

---

## Stable Interfaces and Exact File Map

### Exact one-use repair marker

```text
<!-- es2015-p1c-authority-repair
parent:70
code:P1C
issue:116
base:edccfb8822339dab53c47bbb8c4ae5cc2db93b1b
base-manifest-sha256:55b95d0fb5071b411dd3d82051496505e154f043adee62c2bd2e4aae643c2227
base-record-sha256:3281bd0001ac48ee6f31d21d12a8faade3652cd194360fcf21c3ffc1b9a3a193
head-manifest-sha256:5b94b819025e79ebadb763a7d5eb0ce67174f15effcee61745d305e2a32034c4
head-record-sha256:95036226ee50e365b03c823bab751c6e1d646af0d5c6352a199cd442e2aa9278
-->
```

### Repair checker interfaces

```js
// tools/test262/es2015-provenance-check.js
assertP1CAuthorityRepairManifestDelta(
  baseManifest: ReturnType<typeof parseEs2015ProvenanceManifest>,
  headManifest: ReturnType<typeof parseEs2015ProvenanceManifest>,
): Record<string, any>

parseP1CAuthorityRepairMarker(
  text: string,
): P1CAuthorityRepairMarker

validateP1CAuthorityRepairRange(
  marker: P1CAuthorityRepairMarker,
  context: {
    deps: ProvenanceCheckDependencies,
    base: string,
    head: string,
    changes: readonly {
      status: string,
      path: string,
      sourcePath: string | null,
    }[],
    baseManifestText: string | null,
  },
): Promise<void>

assertP1CAuthorityRepairImmutableBytes(
  baseManifest: ReturnType<typeof parseEs2015ProvenanceManifest>,
  context: {
    deps: ProvenanceCheckDependencies,
    base: string,
    head: string,
  },
): Promise<void>
```

The closed marker type is:

```js
/**
 * @typedef {{
 *   kind: 'p1c-authority-repair',
 *   text: string,
 *   code: 'P1C',
 *   issue: 116,
 *   base: string,
 *   baseManifestSha256: string,
 *   baseRecordSha256: string,
 *   headManifestSha256: string,
 *   headRecordSha256: string,
 * }} P1CAuthorityRepairMarker
 */
```

### Exact repair range

| Status | Path                                                               |
| ------ | ------------------------------------------------------------------ |
| `M`    | `tools/test262/es2015-provenance-check.js`                         |
| `M`    | `tools/test262/es2015-provenance.json`                             |
| `M`    | `test/node/es2015-provenance.test.js`                              |
| `M`    | `docs/testing.md`                                                  |
| `A`    | `docs/superpowers/specs/2026-08-24-p1c-authority-repair-design.md` |
| `A`    | `docs/superpowers/plans/2026-08-24-p1c-authority-repair.md`        |

### Corrected pending authority delta

```js
const P1C_AUTHORITY_REPAIR_AUDIT_OUTPUT = Object.freeze({
  path: 'tools/test262/es2015-audit-evidence.json',
  operation: 'replace-exact',
  baseSha256:
    'eabaeb8245a6988443d91b21219c9e7919ec22639d6e8515a8dadbe5ddfc217f',
  headSha256:
    '50f9a54346d0e9e5168a6ac6b0b8de6d709e2c5b808d6c8b036e5113612e638c',
  projectionSha256: null,
});

const P1C_AUTHORITY_REPAIR_TAXONOMY_OUTPUT = Object.freeze({
  path: 'tools/test262/es2015-taxonomy.json',
  operation: 'replace-exact',
  baseSha256:
    'fba700539b05edd67b6cf67e4c0a1361398a2d0f04212bc7080a83f44abf577a',
  headSha256:
    'fdf3c8bf229f6c841209e4c4a2196001d45cf0a1c270f334cf06e5f54a00f3c7',
  projectionSha256: null,
});

const P1C_AUTHORITY_REPAIR_SUBSET_OUTPUT = Object.freeze({
  path: 'tools/test262/upstream-subset.json',
  operation: 'replace-exact',
  baseSha256:
    '9f768aa8fb0c473e98fe2156d290c4207cea797302cccad6f9b1b922a36b37c0',
  headSha256:
    '5a5b83b3c28991c5f2ac141ed949a9698966cce85587d671a4417228d5e08b14',
  projectionSha256: null,
});
```

The two unchanged project commitments are:

```text
docs/conformance.md
798f8dae856b6a774a787606684e2dd3b2109a983f09783323084b8978425ba5

docs/test262-report.jsonl
1dedeb49f3849b8fa89f03b720830d0d51f3a6b9cba6f7060d5bdae490c6fd9a
```

### Exact collateral module

Create one small shared semantic module:

```js
// tools/test262/es2015-p1c-collateral.js
export const P1C_COLLATERAL_PATHS;
export const P1C_COLLATERAL_BASE_CLASSIFICATIONS;
export const P1C_COLLATERAL_BLOCKED_CLASSIFICATIONS;
export const P1C_CORRECTED_APPLIED_RECORD_SHA256;
```

The four paths are:

```text
test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-ary-elem.js
test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-ary-rest.js
test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-obj-id.js
test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-obj-prop-id.js
```

Every BASE classification in the module is exactly:

```js
{
  variants: 2,
  partition: 'core',
  status: 'selected-passing',
  blocker: null,
  features: ['default-parameters', 'destructuring-binding'],
  flags: ['generated'],
  includes: [],
  provenance: [
    'anchor:sec-arrow-function-definitions-runtime-semantics-evaluation',
    'feature:default-parameters',
    'feature:destructuring-binding',
  ],
}
```

Every provisional corrected classification changes only:

```js
{
  status: 'blocked:early-errors-and-declaration-instantiation',
  blocker: 'early-errors-and-declaration-instantiation',
}
```

### Corrected semantic interfaces

```js
/**
 * @typedef {{
 *   version: 1,
 *   paths: readonly string[],
 *   records: readonly P1CExecutionRecord[],
 * }} P1CCollateralExecution
 */

// tools/test262/es2015-p1c.js
runP1CCollateralFocused(options: {
  environment?: Record<string, string | undefined>,
  host: Test262Host,
  engine: Test262Engine,
  supportedFeatures?: readonly string[],
}): Promise<{
  version: 1,
  paths: readonly string[],
  records: readonly P1CExecutionRecord[],
}>

projectP1CCoreOutputs(options: {
  taxonomyText: string,
  auditEvidenceText: string,
  subsetText: string,
  evidence: ReturnType<typeof buildP1CAuthorityEvidence>,
  execution: P1CExecution,
  collateralExecution: P1CCollateralExecution,
  inventory: readonly {
    path: string,
    variants: number,
    metadata: {
      features: readonly string[],
      flags: readonly string[],
      includes: readonly string[],
    } | null,
    includeFeatures: readonly string[],
  }[],
}): {
  taxonomyText: string,
  auditEvidenceText: string,
  subsetText: string,
}

reconstructAppliedP1CSourceTaxonomy(options: {
  taxonomyText: string,
  baselineText: string,
  dispositionText: string,
  provenanceText: string,
}): Record<string, any>
```

```js
// tools/test262/es2015-audit.js
reverseP1CCollateralTaxonomy(
  taxonomyText: string,
  authority: Record<string, any>,
): string
```

`buildP1CPendingAuthority()` continues to return 11 protected outputs, now
partitioned as:

```text
2 project
3 replace-exact
6 add-exact
```

### Fresh semantic branch

Use:

```text
branch:
yoonbuck-issue-116-p1c-rebuilt

worktree:
/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt

replay:
edccfb8822339dab53c47bbb8c4ae5cc2db93b1b..d667a0cf41aaf1f822b0d58cec155af7759df83f
```

### Exact file map

| Area                         | Files                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repair contract and marker   | Modify `tools/test262/es2015-provenance-check.js`, `test/node/es2015-provenance.test.js`                                                               |
| Corrected pending authority  | Modify `tools/test262/es2015-provenance.json`                                                                                                          |
| Repair documentation         | Existing design; this plan; modify `docs/testing.md`                                                                                                   |
| Repair delivery evidence     | Ignored `.superpowers/sdd/2026-08-24-p1c-authority-repair/`                                                                                            |
| Semantic collateral contract | Create `tools/test262/es2015-p1c-collateral.js`                                                                                                        |
| Semantic projection          | Modify `tools/test262/es2015-p1c.js`                                                                                                                   |
| Audit serialization/reversal | Modify `tools/test262/es2015-audit.js`, `test/node/es2015-taxonomy.test.js`                                                                            |
| P1C semantic tests           | Modify `test/node/es2015-p1c.test.js`, `test/node/upstream-select.test.js`, `test/ci/es2015-syntax-test262.test.js`, `test/node/es2015-m1.test.js`     |
| Generated ownership          | Modify `.prettierignore`, `test/node/repository-invariants.test.js`                                                                                    |
| Corrected evidence           | Add six `tools/test262/es2015-p1c-*.json` evidence files                                                                                               |
| Corrected protected outputs  | Modify audit evidence, taxonomy, subset, report, and conformance                                                                                       |
| Consumer authority state     | Modify only P1C `pending -> applied` in `tools/test262/es2015-provenance.json`                                                                         |
| Roadmap accounting           | Modify `docs/superpowers/specs/2026-08-23-p1-early-errors-decomposition-design.md`, `docs/superpowers/plans/2026-08-23-p1c-catch-binding-semantics.md` |
| Semantic documentation       | Modify `docs/architecture.md`, `docs/testing.md`                                                                                                       |
| Consumer delivery evidence   | Ignored `.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic/`                                                                                   |

### Review protocol for every task

Every task repeats these gates:

1. Start one fresh implementation worker through
   `superpowers:subagent-driven-development`. Give it the spec, this plan, the
   current task only, exact current HEAD, named RED command, and output
   directory.
2. Record RED/GREEN commands and results under
   `.superpowers/sdd/2026-08-24-p1c-authority-repair/task-N/`.
3. Give a fresh specification-compliance reviewer the task diff, exact
   interfaces, hashes, and RED/GREEN evidence.
4. Fix confirmed findings, rerun focused checks, and obtain a fresh
   specification re-review.
5. Give a different fresh code-quality reviewer the approved diff and
   evidence.
6. Fix confirmed findings, rerun focused checks, and obtain a fresh quality
   re-review.
7. Commit only after both review tracks approve the exact HEAD.

---

### Task 1: Freeze Corrected P1C Output and Manifest Fixtures

**Files:**

- Modify: `tools/test262/es2015-provenance-check.js`
- Modify: `test/node/es2015-provenance.test.js`

**Interfaces:**

- Consumes: exact BASE manifest at `edccfb8` and the diagnostic's corrected
  output/authority identities.
- Produces: `assertP1CAuthorityRepairManifestDelta()`.
- Produces: reusable exact pending/applied P1C test fixtures for Task 2.
- Produces: a normal-consumption state-machine fixture with aggregate
  `6e92772f...`.
- Does not produce: marker parsing, range authorization, tracked manifest
  changes, evidence, protected outputs, or semantic code.

- [ ] **Step 1: Start a fresh Task 1 worker**

  Invoke `superpowers:subagent-driven-development` in:

  ```text
  /home/jordan/jsjs/.worktrees/p1c-authority-repair
  ```

  Require evidence under:

  ```text
  .superpowers/sdd/2026-08-24-p1c-authority-repair/task-1/
  ```

- [ ] **Step 2: Verify the reviewed design HEAD**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  DESIGN_HEAD=0b044fb9122d66f2565dae250ebf394ba7f77c3c
  cd "$REPAIR_ROOT"
  git merge-base --is-ancestor "$DESIGN_HEAD" HEAD
  test "$(git diff --name-status "$DESIGN_HEAD"..HEAD)" = \
    $'A\tdocs/superpowers/plans/2026-08-24-p1c-authority-repair.md'
  test -z "$(git status --short)"
  test "$(sha256sum docs/superpowers/specs/2026-08-24-p1c-authority-repair-design.md | cut -d' ' -f1)" = \
    96951b710e7d05543b6abdc512abbdd0538e78f13c598aaf6aef275ba64d03a3
  ```

  Expected: PASS before any implementation edit.

- [ ] **Step 3: Add exact corrected fixture constants**

  In `test/node/es2015-provenance.test.js`, add exact constants for:

  ```js
  const P1C_AUTHORITY_REPAIR_BASE = 'edccfb8822339dab53c47bbb8c4ae5cc2db93b1b';
  const P1C_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256 =
    '55b95d0fb5071b411dd3d82051496505e154f043adee62c2bd2e4aae643c2227';
  const P1C_AUTHORITY_REPAIR_BASE_CHECKER_SHA256 =
    'c806b9987a647b790ecfa736f4b6cc960e86c78755c3a824885313bae4b37e96';
  const P1C_AUTHORITY_REPAIR_BASE_RECORD_SHA256 =
    '3281bd0001ac48ee6f31d21d12a8faade3652cd194360fcf21c3ffc1b9a3a193';
  const P1C_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256 =
    '5b94b819025e79ebadb763a7d5eb0ce67174f15effcee61745d305e2a32034c4';
  const P1C_AUTHORITY_REPAIR_HEAD_RECORD_SHA256 =
    '95036226ee50e365b03c823bab751c6e1d646af0d5c6352a199cd442e2aa9278';
  const P1C_AUTHORITY_REPAIR_APPLIED_RECORD_SHA256 =
    '64db02e17f5d7e7f26805eee912d625b53a989e4c4ae17b15165bea3118bfefa';
  const P1C_AUTHORITY_REPAIR_APPLIED_MANIFEST_SHA256 =
    '55cea42748f5f2a2abc2228b7d33aa0f4d6c2ec9b55b2d96f40782eb565f396f';
  const P1C_AUTHORITY_REPAIR_PROJECTION_SHA256 =
    '6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813';
  ```

  Add the exact three output objects from “Corrected pending authority delta”
  and the exact four collateral paths from “Exact collateral module”.

- [ ] **Step 4: Add the corrected pending fixture**

  Mirror the established M1 fixture pattern:

  ```js
  let p1cAuthorityRepairBaseManifestTextCache = null;

  function p1cAuthorityRepairBaseManifestText() {
    if (p1cAuthorityRepairBaseManifestTextCache === null) {
      p1cAuthorityRepairBaseManifestTextCache = readGitFixtureText(
        P1C_AUTHORITY_REPAIR_BASE,
        ES2015_PROVENANCE_FILE,
      );
    }
    return p1cAuthorityRepairBaseManifestTextCache;
  }

  function applyP1CAuthorityRepairManifestDelta(manifest) {
    const p1c = manifest.roadmapAuthorities.find(
      (authority) => authority.code === 'P1C',
    );
    assertSame(p1c?.state, 'pending');
    p1c.protectedOutputs = p1c.protectedOutputs.map((output) => {
      if (output.path === P1C_AUTHORITY_REPAIR_AUDIT_OUTPUT.path) {
        return structuredClone(P1C_AUTHORITY_REPAIR_AUDIT_OUTPUT);
      }
      if (output.path === P1C_AUTHORITY_REPAIR_TAXONOMY_OUTPUT.path) {
        return structuredClone(P1C_AUTHORITY_REPAIR_TAXONOMY_OUTPUT);
      }
      if (output.path === P1C_AUTHORITY_REPAIR_SUBSET_OUTPUT.path) {
        return structuredClone(P1C_AUTHORITY_REPAIR_SUBSET_OUTPUT);
      }
      return output;
    });
    return manifest;
  }
  ```

  Add helpers returning canonical pending and applied manifest values/text.
  Applied changes only `state`.

- [ ] **Step 5: Write the Task 1 RED tests**

  Add focused test cases named:

  ```text
  ES2015 P1C repair fixture reproduces exact corrected pending and applied identities
  ES2015 P1C repair fixture preserves source disposition evidence and project commitments
  ES2015 P1C repair manifest delta rejects every non-output and foreign-output drift
  ES2015 roadmap consumption accepts only corrected P1C pending-to-applied state
  ```

  The first test must begin with:

  ```js
  const checker =
    await import('../../tools/test262/es2015-provenance-check.js');
  assertSame(typeof checker.assertP1CAuthorityRepairManifestDelta, 'function');
  ```

  It then requires:

  ```text
  BASE manifest: 55b95d0...
  BASE checker: c806b998...
  BASE record: 3281bd0...
  pending manifest: 5b94b81...
  pending record: 9503622...
  applied manifest: 55cea42...
  applied record: 64db02e...
  aggregate: 6e92772...
  evidence entries: 6
  protected outputs: 11
  operations: 2 project / 3 replace-exact / 6 add-exact
  state: pending in repair fixture; applied only in consumer fixture
  collateral paths: 4 sorted unique roots / 8 variants
  collateral execution contract: BASE 8 passed; corrected HEAD 8 parse failures
  selected totals: 20,676/39,300 -> 20,672/39,292
  audit totals: 21,854/5,010 -> 21,862/5,014
  taxonomy status: 19,849/37,792 selected -> 19,845/37,784
  P1 blockers: 402/790 -> 406/798
  ```

- [ ] **Step 6: Run Task 1 RED**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  cd "$REPAIR_ROOT"
  TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js
  ```

  Expected: FAIL because
  `assertP1CAuthorityRepairManifestDelta` is not exported.

- [ ] **Step 7: Implement the pure manifest-delta validator**

  In `tools/test262/es2015-provenance-check.js`, add the three exact output
  constants and:

  ```js
  export function assertP1CAuthorityRepairManifestDelta(
    baseManifest,
    headManifest,
  ) {
    const {
      roadmapAuthorities: baseAuthorities = [],
      ...baseManifestWithoutAuthorities
    } = baseManifest;
    const {
      roadmapAuthorities: headAuthorities = [],
      ...headManifestWithoutAuthorities
    } = headManifest;

    if (
      json(baseManifestWithoutAuthorities) !==
      json(headManifestWithoutAuthorities)
    ) {
      throw new Es2015ProvenanceCheckError(
        'P1C authority repair must preserve all non-authority manifest data',
      );
    }

    // Require equal authority count/order, canonical identity for every
    // non-P1C authority, pending state on both sides, exact unchanged
    // source/reconciliation/evidence/destinations, exact path order, and only
    // the three literal output replacements.
    return headP1C;
  }
  ```

  Implement each requirement directly rather than sharing M1 repair
  authorization. Reuse only low-level `json()` and
  `canonicalRoadmapAuthoritySha256()` helpers.

- [ ] **Step 8: Add exact structural negative cases**

  For each mutation below, call
  `assertP1CAuthorityRepairManifestDelta()` and assert its exact P1C-specific
  error:

  ```text
  P1C applied in repair
  P1C missing
  authority order changed
  another authority changed
  code/issue/parent drift
  source drift
  reconciliation drift
  evidence path/order/hash drift
  destination drift
  report project record drift
  conformance project record drift
  add-exact record drift
  audit base/operation/projection drift
  audit alternate HEAD hash
  taxonomy remains project
  taxonomy alternate BASE/HEAD/projection
  subset remains project
  subset alternate BASE/HEAD/projection
  protected output path/order/count drift
  ```

- [ ] **Step 9: Add corrected normal-consumption and replay tests**

  Build a `roadmap-reclassification:P1C` marker using:

  ```text
  source-path-sha256:
  e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5

  source-entry-sha256:
  null

  protected-projection-sha256:
  6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813
  ```

  Call `validateRoadmapAuthorityConsumption()` directly with the corrected
  pending manifest as BASE, the state-only applied manifest as HEAD, and a
  focused dependency override:

  ```js
  validateRoadmapProtectedOutputs: async () => [
    { code: 'P1C', status: 'validated' },
  ],
  ```

  Require success. Then require:

  ```text
  applied BASE -> applied HEAD:
  P1C roadmap authority must be pending in BASE

  pending BASE -> pending HEAD:
  P1C roadmap authority must transition only from pending to applied

  alternate aggregate:
  roadmap-reclassification:P1C marker protected-projection-sha256 does not match P1C roadmap authority
  ```

- [ ] **Step 10: Run Task 1 GREEN**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  cd "$REPAIR_ROOT"
  TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js
  npm run typecheck
  ESLINT_USE_FLAT_CONFIG=true npx eslint \
    tools/test262/es2015-provenance-check.js \
    test/node/es2015-provenance.test.js
  npx prettier --check \
    tools/test262/es2015-provenance-check.js \
    test/node/es2015-provenance.test.js
  git diff --check
  ```

  Expected: PASS with exact pending/applied hashes, exact operation mix, normal
  state-machine acceptance, and replay rejection.

- [ ] **Step 11: Obtain fresh Task 1 specification review**

  Require review of exact output records, unchanged P1C source/evidence/
  disposition, literal hashes, project-versus-replace split, corrected
  aggregate, and the fact that four-path semantic reconstruction remains
  deferred to Task 4.

- [ ] **Step 12: Obtain fresh Task 1 code-quality review**

  Require a different reviewer to inspect fixture determinism, canonical
  comparison, error specificity, mutation coverage, and absence of marker,
  range, manifest-byte, or semantic changes.

- [ ] **Step 13: Commit Task 1**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  cd "$REPAIR_ROOT"
  git add \
    tools/test262/es2015-provenance-check.js \
    test/node/es2015-provenance.test.js
  git -c user.name='Copilot' \
    -c user.email='223556219+Copilot@users.noreply.github.com' \
    commit --author='Copilot <223556219+Copilot@users.noreply.github.com>' \
    -m 'test262: freeze corrected P1C authority contract' \
    -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
  ```

---

### Task 2: Add the One-Use P1C Repair and Correct Pending Authority

**Files:**

- Modify: `tools/test262/es2015-provenance-check.js`
- Modify: `tools/test262/es2015-provenance.json`
- Modify: `test/node/es2015-provenance.test.js`
- Modify: `docs/testing.md`
- Existing on branch:
  `docs/superpowers/specs/2026-08-24-p1c-authority-repair-design.md`
- Existing on branch:
  `docs/superpowers/plans/2026-08-24-p1c-authority-repair.md`

**Interfaces:**

- Consumes: Task 1 exact manifest-delta validator and fixtures.
- Produces: exact `P1CAuthorityRepairMarker`.
- Produces: `validateP1CAuthorityRepairRange()` and immutable-byte enforcement.
- Produces: corrected canonical pending record `95036226...`.
- Produces: corrected pending manifest `5b94b819...`.
- Leaves: every P1C evidence/protected/runtime byte unchanged and P1C pending.

- [ ] **Step 1: Start a fresh Task 2 worker**

  Invoke `superpowers:subagent-driven-development`. Require evidence under:

  ```text
  .superpowers/sdd/2026-08-24-p1c-authority-repair/task-2/
  ```

- [ ] **Step 2: Recheck exact BASE ancestry before marker work**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  REPAIR_BASE=edccfb8822339dab53c47bbb8c4ae5cc2db93b1b
  DESIGN_HEAD=0b044fb9122d66f2565dae250ebf394ba7f77c3c
  cd "$REPAIR_ROOT"
  git merge-base --is-ancestor "$REPAIR_BASE" HEAD
  git merge-base --is-ancestor "$DESIGN_HEAD" HEAD
  test "$(git merge-base "$REPAIR_BASE" HEAD)" = "$REPAIR_BASE"
  test -z "$(git status --short)"
  ```

  Expected: PASS.

- [ ] **Step 3: Add exact marker and event RED tests**

  Add a renderer:

  ```js
  function p1cAuthorityRepairMarker(options = {}) {
    return `<!-- es2015-p1c-authority-repair
  parent:70
  code:P1C
  issue:116
  base:${options.base ?? P1C_AUTHORITY_REPAIR_BASE}
  base-manifest-sha256:${options.baseManifestSha256 ?? P1C_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256}
  base-record-sha256:${options.baseRecordSha256 ?? P1C_AUTHORITY_REPAIR_BASE_RECORD_SHA256}
  head-manifest-sha256:${options.headManifestSha256 ?? P1C_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256}
  head-record-sha256:${options.headRecordSha256 ?? P1C_AUTHORITY_REPAIR_HEAD_RECORD_SHA256}
  -->`;
  }
  ```

  Assert `${marker}\n` has SHA-256
  `780c1ce94d24ef9e249c209fdd28a56ab9ec885ec4d75a92ba7c0ecd21396177`.
  Test exact normalized fields and reject:

  ```text
  duplicate P1C marker
  P1C plus roadmap marker
  uppercase hash
  CRLF
  reordered field
  omitted field
  duplicate field
  extra field
  extra whitespace
  prefix/suffix text on the marker block
  pull_request_target
  push
  absent event
  local --profile=p1c-authority-repair --marker=...
  ```

  Directly invoke the range validator with an already parsed marker under
  target/push/absent events and require:

  ```text
  P1C authority repair requires an ordinary pull_request event
  ```

- [ ] **Step 4: Run marker RED**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  cd "$REPAIR_ROOT"
  TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js
  ```

  Expected: FAIL because the P1C marker is not authoritative.

- [ ] **Step 5: Implement exact marker parsing and dispatch**

  Add the P1C marker typedef, type guard, and exported
  `parseP1CAuthorityRepairMarker()`. Add exact parser/body patterns:

  ```js
  function p1cAuthorityRepairMarkerPattern() {
    return /^<!-- es2015-p1c-authority-repair\nparent:70\ncode:P1C\nissue:116\nbase:([0-9a-f]{40})\nbase-manifest-sha256:([0-9a-f]{64})\nbase-record-sha256:([0-9a-f]{64})\nhead-manifest-sha256:([0-9a-f]{64})\nhead-record-sha256:([0-9a-f]{64})\n-->$/u;
  }
  ```

  Scan the body pattern only when
  `authoritativeRangeMarkers(body, true)` is used for ordinary
  `pull_request`. Do not add the P1C parser to
  `parseRoadmapAuthorityMarker()` or `parseProvenanceRangeMarker()`.

  `rangeProfileForMarker()` returns `p1c-authority-repair` for only the parsed
  P1C marker object. `checkRange()` dispatches P1C before M1/H0/generic roadmap
  handling.

- [ ] **Step 6: Add the literal repair constants and exact six paths**

  Add:

  ```js
  const P1C_AUTHORITY_REPAIR_BASE = 'edccfb8822339dab53c47bbb8c4ae5cc2db93b1b';
  const P1C_AUTHORITY_REPAIR_BASE_MANIFEST_SHA256 =
    '55b95d0fb5071b411dd3d82051496505e154f043adee62c2bd2e4aae643c2227';
  const P1C_AUTHORITY_REPAIR_BASE_CHECKER_SHA256 =
    'c806b9987a647b790ecfa736f4b6cc960e86c78755c3a824885313bae4b37e96';
  const P1C_AUTHORITY_REPAIR_BASE_RECORD_SHA256 =
    '3281bd0001ac48ee6f31d21d12a8faade3652cd194360fcf21c3ffc1b9a3a193';
  const P1C_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256 =
    '5b94b819025e79ebadb763a7d5eb0ce67174f15effcee61745d305e2a32034c4';
  const P1C_AUTHORITY_REPAIR_HEAD_RECORD_SHA256 =
    '95036226ee50e365b03c823bab751c6e1d646af0d5c6352a199cd442e2aa9278';
  const P1C_AUTHORITY_REPAIR_PROFILE = 'p1c-authority-repair';
  ```

  Add the exact six path/status entries from “Exact repair range”.

- [ ] **Step 7: Add exact range and literal-pin RED tests**

  Add one positive six-path fixture and negative cases for:

  ```text
  each missing required path
  each foreign path
  duplicate
  rename
  copy
  deletion
  wrong A/M status
  encoded alias
  traversal
  BASE-absent modified file
  non-regular BASE or HEAD mode
  wrong event BASE
  wrong merge base
  wrong marker BASE
  wrong BASE manifest/checker/record
  wrong marker HEAD manifest/record
  computed HEAD manifest/record drift
  noncanonical BASE manifest bytes
  noncanonical HEAD manifest bytes
  ```

  Use the alternate repair doc path
  `docs/superpowers/specs/2026-08-23-p1c-authority-repair-design.md` as one
  explicit foreign-path case.

- [ ] **Step 8: Add self-consistent alternate HEAD rejection**

  Mutate one corrected P1C protected output, recompute both alternate hashes,
  put those hashes in the marker, and use the same alternate manifest as HEAD.
  Require rejection against the immutable literal:

  ```text
  P1C authority repair marker head-manifest-sha256 must be
  5b94b819025e79ebadb763a7d5eb0ce67174f15effcee61745d305e2a32034c4
  ```

  Add a second case that preserves the literal manifest field but mutates the
  record and require the exact HEAD-record error.

- [ ] **Step 9: Add immutable-byte RED tests**

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

  For every derived path, inject byte drift while reporting an otherwise valid
  six-path range. Add one mode-drift case. BASE-absent P1C evidence paths must
  remain absent in HEAD.

- [ ] **Step 10: Implement the dedicated range validator**

  `validateP1CAuthorityRepairRange()` must:

  ```text
  require ordinary pull_request independently
  require exact event BASE and merge BASE
  require exact marker BASE fields
  hash exact BASE manifest and BASE checker bytes
  validate exact six paths and regular-file modes
  parse canonical schema-v3 BASE and HEAD manifests
  require exact BASE P1C canonical hash
  call assertP1CAuthorityRepairManifestDelta()
  require exact corrected HEAD P1C canonical hash
  require exact corrected HEAD manifest byte hash
  run assertP1CAuthorityRepairImmutableBytes()
  ```

  Do not invoke generic preparation, consumption, M1 repair, or maintenance
  semantics.

- [ ] **Step 11: Replace only the pending P1C record**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  cd "$REPAIR_ROOT"
  node --input-type=module <<'JS'
  import { readFileSync, writeFileSync } from 'node:fs';
  import {
    canonicalRoadmapAuthoritySha256,
    parseEs2015ProvenanceManifest,
    renderEs2015ProvenanceManifest,
    roadmapAggregateProjectionSha256,
  } from './tools/test262/es2015-provenance.js';

  const file = 'tools/test262/es2015-provenance.json';
  const manifest = parseEs2015ProvenanceManifest(readFileSync(file, 'utf8'));
  const p1c = manifest.roadmapAuthorities.find(
    (authority) => authority.code === 'P1C',
  );
  if (
    p1c === undefined ||
    p1c.state !== 'pending' ||
    canonicalRoadmapAuthoritySha256(p1c) !==
      '3281bd0001ac48ee6f31d21d12a8faade3652cd194360fcf21c3ffc1b9a3a193'
  ) {
    throw new Error('expected the exact stale pending P1C authority');
  }

  p1c.protectedOutputs = p1c.protectedOutputs.map((output) => {
    if (output.path === 'tools/test262/es2015-audit-evidence.json') {
      return {
        ...output,
        headSha256:
          '50f9a54346d0e9e5168a6ac6b0b8de6d709e2c5b808d6c8b036e5113612e638c',
      };
    }
    if (output.path === 'tools/test262/es2015-taxonomy.json') {
      return {
        path: output.path,
        operation: 'replace-exact',
        baseSha256: output.baseSha256,
        headSha256:
          'fdf3c8bf229f6c841209e4c4a2196001d45cf0a1c270f334cf06e5f54a00f3c7',
        projectionSha256: null,
      };
    }
    if (output.path === 'tools/test262/upstream-subset.json') {
      return {
        path: output.path,
        operation: 'replace-exact',
        baseSha256: output.baseSha256,
        headSha256:
          '5a5b83b3c28991c5f2ac141ed949a9698966cce85587d671a4417228d5e08b14',
        projectionSha256: null,
      };
    }
    return output;
  });

  if (
    canonicalRoadmapAuthoritySha256(p1c) !==
      '95036226ee50e365b03c823bab751c6e1d646af0d5c6352a199cd442e2aa9278' ||
    roadmapAggregateProjectionSha256(p1c) !==
      '6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813'
  ) {
    throw new Error('corrected P1C identities do not match the diagnostic');
  }

  writeFileSync(file, renderEs2015ProvenanceManifest(manifest));
  JS
  ```

  Verify:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  cd "$REPAIR_ROOT"
  test "$(sha256sum tools/test262/es2015-provenance.json | cut -d' ' -f1)" = \
    5b94b819025e79ebadb763a7d5eb0ce67174f15effcee61745d305e2a32034c4
  ```

- [ ] **Step 12: Document the one-use repair**

  In `docs/testing.md`, add one P1C repair section containing:

  - the exact marker block;
  - marker SHA-256 `780c1ce9...`;
  - ordinary-PR HEAD-only activation;
  - explicit target/local non-activation;
  - exact BASE/manifest/checker/record and corrected HEAD manifest/record;
  - exact six paths and statuses;
  - literal alternate-HEAD rejection;
  - derived immutable-byte/mode defense;
  - P1C remaining pending with unchanged 81/161 evidence;
  - no protected/evidence/runtime bytes in the repair;
  - expected old BASE missing-marker failure and admin-only exception;
  - repair-merge verification identities; and
  - fresh semantic branch/PR #118 abandonment handoff.

- [ ] **Step 13: Run Task 2 GREEN**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  cd "$REPAIR_ROOT"
  TZ=UTC node test/run-node.js \
    test/node/es2015-provenance.test.js \
    test/node/repository-invariants.test.js
  npm run typecheck
  ESLINT_USE_FLAT_CONFIG=true npx eslint \
    tools/test262/es2015-provenance-check.js \
    test/node/es2015-provenance.test.js
  npx prettier --check \
    tools/test262/es2015-provenance-check.js \
    tools/test262/es2015-provenance.json \
    test/node/es2015-provenance.test.js \
    docs/testing.md \
    docs/superpowers/specs/2026-08-24-p1c-authority-repair-design.md \
    docs/superpowers/plans/2026-08-24-p1c-authority-repair.md
  npm run ci:check
  git diff --check
  ```

  Expected: PASS. The manifest hash is `5b94b819...`, P1C is pending, marker
  and range tests pass, and no protected/evidence/runtime path changed.

- [ ] **Step 14: Verify exact cumulative repair scope**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  REPAIR_BASE=edccfb8822339dab53c47bbb8c4ae5cc2db93b1b
  cd "$REPAIR_ROOT"
  git diff --name-status --find-renames --find-copies "$REPAIR_BASE"...HEAD
  git diff --exit-code "$REPAIR_BASE"...HEAD -- \
    .github/workflows/ci.yml \
    tools/ci/pipeline.js \
    src \
    tools/test262/es2015-policy.json \
    tools/test262/features.json \
    tools/test262/es2015-provenance-decisions \
    docs/conformance.md \
    docs/test262-report.jsonl \
    tools/test262/es2015-audit-evidence.json \
    tools/test262/es2015-taxonomy.json \
    tools/test262/es5-selection.json \
    tools/test262/upstream-subset.json \
    tools/test262/es2015-p1c-baseline.json \
    tools/test262/es2015-p1c-disposition.json \
    tools/test262/es2015-p1c-owner-deltas.json \
    tools/test262/es2015-p1c-owner-map.json \
    tools/test262/es2015-p1c-paths.json \
    tools/test262/es2015-p1c-promotion.json
  ```

  Expected: the first command lists exactly the six repair paths; the second
  exits zero.

- [ ] **Step 15: Obtain fresh Task 2 specification review**

  Require review of every marker byte/field, exact BASE and corrected HEAD
  literal, six-path status, independent event check, local/target exclusion,
  manifest delta, immutable set, pending state, and protected-byte absence.

- [ ] **Step 16: Obtain fresh Task 2 code-quality review**

  Require a different reviewer to inspect parser anchoring, duplicate/mixed
  marker handling, path normalization, mode checks, canonical parsing, async
  reads, error messages, fixture coverage, and non-generalization of M1.

- [ ] **Step 17: Commit Task 2**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  cd "$REPAIR_ROOT"
  git add \
    tools/test262/es2015-provenance-check.js \
    tools/test262/es2015-provenance.json \
    test/node/es2015-provenance.test.js \
    docs/testing.md
  git -c user.name='Copilot' \
    -c user.email='223556219+Copilot@users.noreply.github.com' \
    commit --author='Copilot <223556219+Copilot@users.noreply.github.com>' \
    -m 'fix: add one-use P1C authority repair' \
    -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
  ```

---

### Task 3: Review, Deliver, Merge, and Hand Off the Repair

**Files:**

- No additional tracked path
- Write ignored:
  `.superpowers/sdd/2026-08-24-p1c-authority-repair/repair-marker.txt`
- Write ignored:
  `.superpowers/sdd/2026-08-24-p1c-authority-repair/repair-checks.json`
- Write ignored:
  `.superpowers/sdd/2026-08-24-p1c-authority-repair/repair-delivery.json`

**Interfaces:**

- Consumes: Task 2 exact six-path repair HEAD.
- Produces: closed-unmerged PR #118 evidence.
- Produces: one repair PR with one expected old-BASE guard failure.
- Produces: exact repair squash merge and corrected pending-main handoff.
- Does not start: semantic replay before exact-main repair verification.

- [ ] **Step 1: Start a fresh Task 3 delivery worker**

  Invoke `superpowers:subagent-driven-development`. Require evidence under:

  ```text
  .superpowers/sdd/2026-08-24-p1c-authority-repair/task-3/
  ```

- [ ] **Step 2: Verify exact six-path ancestry and clean state**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  REPAIR_BASE=edccfb8822339dab53c47bbb8c4ae5cc2db93b1b
  DESIGN_HEAD=0b044fb9122d66f2565dae250ebf394ba7f77c3c
  cd "$REPAIR_ROOT"
  REPAIR_HEAD=$(git rev-parse HEAD)
  test "$(git merge-base "$REPAIR_BASE" "$REPAIR_HEAD")" = "$REPAIR_BASE"
  git merge-base --is-ancestor "$DESIGN_HEAD" "$REPAIR_HEAD"
  test -z "$(git status --short)"
  python - <<'PY'
  import subprocess

  base = 'edccfb8822339dab53c47bbb8c4ae5cc2db93b1b'
  head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
  raw = subprocess.check_output([
      'git', 'diff', '--name-status', '-z', '--find-renames',
      '--find-copies', f'{base}...{head}',
  ])
  fields = raw.decode().split('\0')
  rows = []
  index = 0
  while index < len(fields) and fields[index]:
      status = fields[index]
      path = fields[index + 1]
      if status.startswith(('R', 'C')):
          raise SystemExit(
              f'forbidden {status} {path} -> {fields[index + 2]}'
          )
      rows.append((status, path))
      index += 2
  expected = [
      ('M', 'docs/testing.md'),
      ('A', 'docs/superpowers/plans/2026-08-24-p1c-authority-repair.md'),
      ('A', 'docs/superpowers/specs/2026-08-24-p1c-authority-repair-design.md'),
      ('M', 'test/node/es2015-provenance.test.js'),
      ('M', 'tools/test262/es2015-provenance-check.js'),
      ('M', 'tools/test262/es2015-provenance.json'),
  ]
  if sorted(rows) != sorted(expected):
      raise SystemExit(f'repair range mismatch: {rows!r}')
  PY
  ```

  Expected: exactly six paths.

- [ ] **Step 3: Close and preserve PR #118 unmerged**

  Run:

  ```bash
  REPO=yoonbuck/jsjs
  EVIDENCE_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair/.superpowers/sdd/2026-08-24-p1c-authority-repair
  mkdir -p "$EVIDENCE_ROOT"
  gh pr view 118 --repo "$REPO" \
    --json number,state,url,baseRefOid,headRefOid,mergedAt \
    > "$EVIDENCE_ROOT/pr-118-before-close.json"
  node - "$EVIDENCE_ROOT/pr-118-before-close.json" <<'JS'
  const fs = require('fs');
  const pr = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (
    pr.number !== 118 ||
    pr.baseRefOid !== 'edccfb8822339dab53c47bbb8c4ae5cc2db93b1b' ||
    pr.headRefOid !== 'e937140d8b40e2599faf98a8e6b370982036e61d' ||
    pr.mergedAt !== null
  ) {
    throw new Error(`PR #118 identity drift: ${JSON.stringify(pr)}`);
  }
  JS
  if test "$(node -e \
    "const p=require('$EVIDENCE_ROOT/pr-118-before-close.json');process.stdout.write(p.state)")" = OPEN
  then
    gh pr close 118 --repo "$REPO" --comment \
      'Abandoning unmerged: the P1C parser is correct, but the pending authority was prepared from a selector that admitted four ES2016 BindingRestElement roots. The reviewed commits and authority diagnostic are preserved; delivery will use a fresh branch after the pending authority repair.'
  fi
  gh pr view 118 --repo "$REPO" \
    --json number,state,url,baseRefOid,headRefOid,mergedAt \
    > "$EVIDENCE_ROOT/pr-118-closed.json"
  node - "$EVIDENCE_ROOT/pr-118-closed.json" <<'JS'
  const fs = require('fs');
  const pr = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (pr.state !== 'CLOSED' || pr.mergedAt !== null) {
    throw new Error(`PR #118 was not abandoned unmerged: ${JSON.stringify(pr)}`);
  }
  JS
  ```

- [ ] **Step 4: Run final focused repair checks**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  cd "$REPAIR_ROOT"
  TZ=UTC node test/run-node.js \
    test/node/es2015-provenance.test.js \
    test/node/repository-invariants.test.js
  npm run typecheck
  ESLINT_USE_FLAT_CONFIG=true npx eslint \
    tools/test262/es2015-provenance-check.js \
    test/node/es2015-provenance.test.js
  npx prettier --check \
    tools/test262/es2015-provenance-check.js \
    tools/test262/es2015-provenance.json \
    test/node/es2015-provenance.test.js \
    docs/testing.md \
    docs/superpowers/specs/2026-08-24-p1c-authority-repair-design.md \
    docs/superpowers/plans/2026-08-24-p1c-authority-repair.md
  npm run ci:check
  git diff --check
  ```

  Expected: PASS. Do not run any broad Test262 or full suite.

- [ ] **Step 5: Run repaired HEAD checker GREEN**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  REPAIR_BASE=edccfb8822339dab53c47bbb8c4ae5cc2db93b1b
  EVIDENCE_ROOT="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair"
  cd "$REPAIR_ROOT"
  REPAIR_HEAD=$(git rev-parse HEAD)
  REPAIR_MARKER=$(cat <<'EOF'
  <!-- es2015-p1c-authority-repair
  parent:70
  code:P1C
  issue:116
  base:edccfb8822339dab53c47bbb8c4ae5cc2db93b1b
  base-manifest-sha256:55b95d0fb5071b411dd3d82051496505e154f043adee62c2bd2e4aae643c2227
  base-record-sha256:3281bd0001ac48ee6f31d21d12a8faade3652cd194360fcf21c3ffc1b9a3a193
  head-manifest-sha256:5b94b819025e79ebadb763a7d5eb0ce67174f15effcee61745d305e2a32034c4
  head-record-sha256:95036226ee50e365b03c823bab751c6e1d646af0d5c6352a199cd442e2aa9278
  -->
  EOF
  )
  mkdir -p "$EVIDENCE_ROOT"
  printf '%s\n' "$REPAIR_MARKER" > "$EVIDENCE_ROOT/repair-marker.txt"
  test "$(sha256sum "$EVIDENCE_ROOT/repair-marker.txt" | cut -d' ' -f1)" = \
    780c1ce94d24ef9e249c209fdd28a56ab9ec885ec4d75a92ba7c0ecd21396177
  PROVENANCE_PR_BODY="$REPAIR_MARKER" \
  GITHUB_EVENT_NAME=pull_request \
  TZ=UTC node tools/test262/es2015-provenance-check.js \
    --check-range \
    --base="$REPAIR_BASE" \
    --head="$REPAIR_HEAD" \
    --pr-body-env=PROVENANCE_PR_BODY
  ```

  Expected: PASS.

- [ ] **Step 6: Run exact unmodified BASE checker RED**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  REPAIR_BASE=edccfb8822339dab53c47bbb8c4ae5cc2db93b1b
  EVIDENCE_ROOT="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair"
  BASE_CHECKER_WORKTREE="$EVIDENCE_ROOT/base-checker"
  cd "$REPAIR_ROOT"
  REPAIR_HEAD=$(git rev-parse HEAD)
  REPAIR_MARKER=$(cat "$EVIDENCE_ROOT/repair-marker.txt")
  test ! -e "$BASE_CHECKER_WORKTREE"
  git worktree add --detach "$BASE_CHECKER_WORKTREE" "$REPAIR_BASE"
  set +e
  (
    cd "$BASE_CHECKER_WORKTREE"
    PROVENANCE_PR_BODY="$REPAIR_MARKER" \
    GITHUB_EVENT_NAME=pull_request_target \
    TZ=UTC node tools/test262/es2015-provenance-check.js \
      --check-range \
      --base="$REPAIR_BASE" \
      --head="$REPAIR_HEAD" \
      --pr-body-env=PROVENANCE_PR_BODY
  ) > "$EVIDENCE_ROOT/base-checker.log" 2>&1
  BASE_STATUS=$?
  set -e
  test "$BASE_STATUS" -ne 0
  grep -Fx \
    'Es2015ProvenanceCheckError: A provenance-owned PR range requires one authoritative provenance marker' \
    "$EVIDENCE_ROOT/base-checker.log"
  test "$(grep -Fc 'Es2015ProvenanceCheckError:' "$EVIDENCE_ROOT/base-checker.log")" -eq 1
  ```

  Expected: only the exact missing-marker failure.

- [ ] **Step 7: Obtain fresh Task 3 specification review**

  Require a fresh provenance/security reviewer to inspect exact ancestry,
  closed PR #118 evidence, marker, literals, six-path range, pending record,
  immutable-byte defense, event boundaries, and BASE RED/HEAD GREEN evidence.

- [ ] **Step 8: Obtain fresh Task 3 code-quality review**

  Require a different reviewer to inspect the complete range from `edccfb8` to
  the exact repair HEAD, fixture quality, diagnostics, canonical serialization,
  documentation, and absence of semantic/protected changes.

- [ ] **Step 9: Obtain fresh whole-repair review**

  Require a third fresh whole-range correctness/security review. Every
  confirmed finding gets a focused regression, local rerun of Steps 2, 4, 5,
  and 6, and fresh specification and quality re-review on the new HEAD.

- [ ] **Step 10: Recheck live main, push, and open one repair PR**

  Run:

  ```bash
  REPO=yoonbuck/jsjs
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  REPAIR_BASE=edccfb8822339dab53c47bbb8c4ae5cc2db93b1b
  EVIDENCE_ROOT="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair"
  cd "$REPAIR_ROOT"
  git fetch origin main
  test "$(git rev-parse origin/main)" = "$REPAIR_BASE"
  if git cat-file -e \
    origin/main:docs/superpowers/specs/2026-08-24-p1c-authority-repair-design.md \
    2>/dev/null
  then
    echo 'repair design merged independently; exact repair range is stale' >&2
    exit 1
  fi
  if git cat-file -e \
    origin/main:docs/superpowers/plans/2026-08-24-p1c-authority-repair.md \
    2>/dev/null
  then
    echo 'repair plan merged independently; exact repair range is stale' >&2
    exit 1
  fi
  REPAIR_HEAD=$(git rev-parse HEAD)
  REPAIR_MARKER=$(cat "$EVIDENCE_ROOT/repair-marker.txt")
  test "$(gh pr view 118 --repo "$REPO" --json state,mergedAt --jq '.state + \":\" + (.mergedAt // \"null\")')" = \
    'CLOSED:null'
  git push -u origin yoonbuck-p1c-authority-repair
  REPAIR_PR_URL=$(gh pr create \
    --repo "$REPO" \
    --base main \
    --head yoonbuck-p1c-authority-repair \
    --title 'Repair pending P1C roadmap authority' \
    --body "$REPAIR_MARKER

  ## Summary

  - install one exact ordinary-PR-only P1C authority repair
  - replace only the still-pending P1C projection commitments
  - preserve all six P1C evidence files and every protected/runtime byte
  - keep P1C pending for a fresh normal consumer

  ## Exact exception

  The unchanged pull_request_target BASE checker is expected to fail only with:
  A provenance-owned PR range requires one authoritative provenance marker

  All ordinary PR jobs and both CodeQL categories must pass. This PR requires explicit administrator review for only that trust-root exception.

  PR #118 is abandoned unmerged.

  Tracks #116")
  REPAIR_PR=$(gh pr view "$REPAIR_PR_URL" \
    --repo "$REPO" --json number --jq .number)
  gh pr view "$REPAIR_PR" --repo "$REPO" \
    --json number,url,baseRefOid,headRefOid,files \
    > "$EVIDENCE_ROOT/repair-pr.json"
  REPAIR_HEAD="$REPAIR_HEAD" REPAIR_BASE="$REPAIR_BASE" \
    node - "$EVIDENCE_ROOT/repair-pr.json" <<'JS'
  const fs = require('fs');
  const pr = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const expected = [
    'docs/superpowers/plans/2026-08-24-p1c-authority-repair.md',
    'docs/superpowers/specs/2026-08-24-p1c-authority-repair-design.md',
    'docs/testing.md',
    'test/node/es2015-provenance.test.js',
    'tools/test262/es2015-provenance-check.js',
    'tools/test262/es2015-provenance.json',
  ];
  const files = pr.files.map((entry) => entry.path).sort();
  if (
    pr.baseRefOid !== process.env.REPAIR_BASE ||
    pr.headRefOid !== process.env.REPAIR_HEAD ||
    JSON.stringify(files) !== JSON.stringify(expected)
  ) {
    throw new Error(`repair PR identity/range drift: ${JSON.stringify(pr)}`);
  }
  JS
  ```

- [ ] **Step 11: Wait for exact repair PR checks**

  Run:

  ```bash
  REPO=yoonbuck/jsjs
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  REPAIR_BASE=edccfb8822339dab53c47bbb8c4ae5cc2db93b1b
  EVIDENCE_ROOT="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair"
  cd "$REPAIR_ROOT"
  REPAIR_PR=$(gh pr list --repo "$REPO" \
    --head yoonbuck-p1c-authority-repair \
    --base main \
    --state open \
    --json number \
    --jq 'if length == 1 then .[0].number else error("expected one repair PR") end')
  while true; do
    gh pr checks "$REPAIR_PR" --repo "$REPO" \
      --json name,state,bucket,link \
      > "$EVIDENCE_ROOT/repair-checks.json"
    if node - "$EVIDENCE_ROOT/repair-checks.json" <<'JS'
  const fs = require('fs');
  const checks = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  process.exit(checks.some((check) => check.bucket === 'pending') ? 1 : 0);
  JS
    then
      break
    fi
    sleep 30
  done
  node - "$EVIDENCE_ROOT/repair-checks.json" <<'JS'
  const fs = require('fs');
  const checks = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const failures = checks.filter((check) => check.bucket === 'fail');
  if (
    failures.length !== 1 ||
    failures[0].name !== 'Provenance base guard'
  ) {
    throw new Error(`unexpected repair failures: ${JSON.stringify(failures)}`);
  }
  const unexpected = checks.filter(
    (check) => !['pass', 'skipping', 'fail'].includes(check.bucket),
  );
  if (unexpected.length !== 0) {
    throw new Error(`nonterminal checks: ${JSON.stringify(unexpected)}`);
  }
  JS
  BASE_GUARD_LINK=$(node - "$EVIDENCE_ROOT/repair-checks.json" <<'JS'
  const fs = require('fs');
  const checks = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const check = checks.find((entry) => entry.name === 'Provenance base guard');
  if (check === undefined) throw new Error('missing provenance base guard');
  process.stdout.write(check.link);
  JS
  )
  BASE_GUARD_RUN=$(node -e "
    const match=/\\/actions\\/runs\\/(\\d+)/u.exec(process.argv[1]);
    if (match === null) throw new Error('invalid base-guard link');
    process.stdout.write(match[1]);
  " "$BASE_GUARD_LINK")
  gh run view "$BASE_GUARD_RUN" --repo "$REPO" --log-failed \
    > "$EVIDENCE_ROOT/repair-base-guard.log"
  grep -F \
    'A provenance-owned PR range requires one authoritative provenance marker' \
    "$EVIDENCE_ROOT/repair-base-guard.log"
  ```

  Inspect every ordinary job; all must pass.

- [ ] **Step 12: Verify exact repair HEAD and CodeQL**

  Run:

  ```bash
  REPO=yoonbuck/jsjs
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  EVIDENCE_ROOT="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair"
  cd "$REPAIR_ROOT"
  REPAIR_PR=$(gh pr list --repo "$REPO" \
    --head yoonbuck-p1c-authority-repair \
    --base main \
    --state open \
    --json number \
    --jq 'if length == 1 then .[0].number else error("expected one repair PR") end')
  REVIEWED_REPAIR_HEAD=$(gh pr view "$REPAIR_PR" \
    --repo "$REPO" --json headRefOid --jq .headRefOid)
  test "$REVIEWED_REPAIR_HEAD" = "$(git rev-parse HEAD)"
  gh pr checks "$REPAIR_PR" --repo "$REPO" \
    --json name,state,bucket,link \
    > "$EVIDENCE_ROOT/repair-checks.json"
  node - "$EVIDENCE_ROOT/repair-checks.json" <<'JS'
  const fs = require('fs');
  const checks = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const codeql = checks.filter((check) =>
    check.name.toLowerCase().includes('codeql'),
  );
  if (codeql.length < 2 || codeql.some((check) => check.bucket !== 'pass')) {
    throw new Error(`repair CodeQL is not clean: ${JSON.stringify(codeql)}`);
  }
  JS
  printf '%s\n' "$REVIEWED_REPAIR_HEAD" \
    > "$EVIDENCE_ROOT/reviewed-repair-head.txt"
  gh api 'repos/yoonbuck/jsjs/code-scanning/alerts?state=open&per_page=100' \
    > "$EVIDENCE_ROOT/repair-open-alerts.json"
  test "$(node -e \
    "const a=require('$EVIDENCE_ROOT/repair-open-alerts.json');process.stdout.write(String(a.length))")" = 0
  ```

- [ ] **Step 13: Record explicit administrator authorization**

  Require an administrator review or comment that states all five facts:

  ```text
  the old BASE failure is exact and expected
  every other required check is green
  both CodeQL categories and open-alert count are clean
  the reviewed range is exactly the six P1C repair paths
  admin squash merge is authorized only for the missing-marker check
  ```

  The authorization comment must include this literal:

  ```text
  P1C AUTHORITY REPAIR EXCEPTION: authorize admin squash merge for only the expected old-BASE missing-marker failure at the reviewed HEAD.
  ```

  Save and verify it:

  ```bash
  REPO=yoonbuck/jsjs
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  EVIDENCE_ROOT="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair"
  REPAIR_PR=$(gh pr list --repo "$REPO" \
    --head yoonbuck-p1c-authority-repair \
    --base main \
    --state open \
    --json number \
    --jq 'if length == 1 then .[0].number else error("expected one repair PR") end')
  gh pr view "$REPAIR_PR" --repo "$REPO" \
    --json reviews,comments \
    > "$EVIDENCE_ROOT/admin-authorization.json"
  grep -F \
    'P1C AUTHORITY REPAIR EXCEPTION: authorize admin squash merge for only the expected old-BASE missing-marker failure at the reviewed HEAD.' \
    "$EVIDENCE_ROOT/admin-authorization.json"
  ```

  Any new commit invalidates this authorization and all reviews/checks.

- [ ] **Step 14: Admin squash-merge the exact reviewed repair HEAD**

  Run:

  ```bash
  REPO=yoonbuck/jsjs
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  EVIDENCE_ROOT="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair"
  cd "$REPAIR_ROOT"
  REPAIR_PR=$(gh pr list --repo "$REPO" \
    --head yoonbuck-p1c-authority-repair \
    --base main \
    --state open \
    --json number \
    --jq 'if length == 1 then .[0].number else error("expected one repair PR") end')
  REVIEWED_REPAIR_HEAD=$(cat "$EVIDENCE_ROOT/reviewed-repair-head.txt")
  CURRENT_REPAIR_HEAD=$(gh pr view "$REPAIR_PR" \
    --repo "$REPO" --json headRefOid --jq .headRefOid)
  test "$CURRENT_REPAIR_HEAD" = "$REVIEWED_REPAIR_HEAD"
  CURRENT_REPAIR_BASE=$(gh pr view "$REPAIR_PR" \
    --repo "$REPO" --json baseRefOid --jq .baseRefOid)
  git -C "$REPAIR_ROOT" fetch origin main
  test "$CURRENT_REPAIR_BASE" = "$REPAIR_BASE"
  test "$(git -C "$REPAIR_ROOT" rev-parse origin/main)" = "$REPAIR_BASE"
  gh pr merge "$REPAIR_PR" \
    --repo "$REPO" \
    --admin \
    --squash \
    --delete-branch \
    --match-head-commit "$REVIEWED_REPAIR_HEAD"
  git -C "$REPAIR_ROOT" fetch origin main
  REPAIR_MERGE=$(gh pr view "$REPAIR_PR" \
    --repo "$REPO" --json mergeCommit --jq .mergeCommit.oid)
  test "$(git -C "$REPAIR_ROOT" rev-parse origin/main)" = "$REPAIR_MERGE"
  ```

- [ ] **Step 15: Verify exact repaired main**

  Run:

  ```bash
  REPO=yoonbuck/jsjs
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  EVIDENCE_ROOT="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair"
  cd "$REPAIR_ROOT"
  REPAIR_PR=$(gh pr list --repo "$REPO" \
    --head yoonbuck-p1c-authority-repair \
    --state merged \
    --json number \
    --jq 'if length >= 1 then .[0].number else error("missing merged repair PR") end')
  REPAIR_MERGE=$(gh pr view "$REPAIR_PR" \
    --repo "$REPO" --json mergeCommit --jq .mergeCommit.oid)
  git fetch origin main
  test "$(git rev-parse origin/main)" = "$REPAIR_MERGE"
  git show \
    "$REPAIR_MERGE":tools/test262/es2015-provenance.json \
    > "$EVIDENCE_ROOT/repaired-main-provenance.json"
  test "$(sha256sum "$EVIDENCE_ROOT/repaired-main-provenance.json" | cut -d' ' -f1)" = \
    5b94b819025e79ebadb763a7d5eb0ce67174f15effcee61745d305e2a32034c4
  node --input-type=module - "$EVIDENCE_ROOT/repaired-main-provenance.json" <<'JS'
  import { readFileSync } from 'node:fs';
  import {
    canonicalRoadmapAuthoritySha256,
    parseEs2015ProvenanceManifest,
    roadmapAggregateProjectionSha256,
  } from './tools/test262/es2015-provenance.js';
  const manifest = parseEs2015ProvenanceManifest(
    readFileSync(process.argv[2], 'utf8'),
  );
  const p1c = manifest.roadmapAuthorities.find((entry) => entry.code === 'P1C');
  if (
    p1c?.state !== 'pending' ||
    canonicalRoadmapAuthoritySha256(p1c) !==
      '95036226ee50e365b03c823bab751c6e1d646af0d5c6352a199cd442e2aa9278' ||
    roadmapAggregateProjectionSha256(p1c) !==
      '6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813'
  ) {
    throw new Error('repaired main P1C identity mismatch');
  }
  JS
  git diff --exit-code \
    edccfb8822339dab53c47bbb8c4ae5cc2db93b1b "$REPAIR_MERGE" -- \
    docs/conformance.md \
    docs/test262-report.jsonl \
    tools/test262/es2015-audit-evidence.json \
    tools/test262/es2015-taxonomy.json \
    tools/test262/es5-selection.json \
    tools/test262/upstream-subset.json \
    tools/test262/es2015-p1c-baseline.json \
    tools/test262/es2015-p1c-disposition.json \
    tools/test262/es2015-p1c-owner-deltas.json \
    tools/test262/es2015-p1c-owner-map.json \
    tools/test262/es2015-p1c-paths.json \
    tools/test262/es2015-p1c-promotion.json \
    src
  ```

- [ ] **Step 16: Verify exact-main repair CI and CodeQL**

  Run:

  ```bash
  REPO=yoonbuck/jsjs
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  EVIDENCE_ROOT="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair"
  REPAIR_PR=$(gh pr list --repo "$REPO" \
    --head yoonbuck-p1c-authority-repair \
    --state merged \
    --json number \
    --jq 'if length >= 1 then .[0].number else error("missing merged repair PR") end')
  REPAIR_MERGE=$(gh pr view "$REPAIR_PR" \
    --repo "$REPO" --json mergeCommit --jq .mergeCommit.oid)
  for attempt in $(seq 1 60); do
    gh run list --repo "$REPO" --commit "$REPAIR_MERGE" \
      --json databaseId,workflowName,status,conclusion,url \
      > "$EVIDENCE_ROOT/repair-main-runs.json"
    if node - "$EVIDENCE_ROOT/repair-main-runs.json" <<'JS'
  const fs = require('fs');
  const runs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  process.exit(
    runs.some(
      (run) => run.workflowName === 'CI' && run.conclusion === 'success',
    )
      ? 0
      : 1,
  );
  JS
    then
      break
    fi
    sleep 30
  done
  node - "$EVIDENCE_ROOT/repair-main-runs.json" <<'JS'
  const fs = require('fs');
  const runs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (
    !runs.some(
      (run) => run.workflowName === 'CI' && run.conclusion === 'success',
    )
  ) {
    throw new Error('repair merge lacks exact-main CI success');
  }
  JS
  gh api 'repos/yoonbuck/jsjs/code-scanning/analyses?per_page=100' \
    > "$EVIDENCE_ROOT/repair-main-codeql.json"
  REPAIR_MERGE="$REPAIR_MERGE" \
    node - "$EVIDENCE_ROOT/repair-main-codeql.json" <<'JS'
  const fs = require('fs');
  const analyses = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
    .filter((analysis) => analysis.commit_sha === process.env.REPAIR_MERGE);
  if (analyses.length < 2) {
    throw new Error('repair merge lacks both exact-main CodeQL analyses');
  }
  if (analyses.some((analysis) => analysis.error || analysis.warning)) {
    throw new Error('repair exact-main CodeQL contains errors or warnings');
  }
  JS
  gh api 'repos/yoonbuck/jsjs/code-scanning/alerts?state=open&per_page=100' \
    > "$EVIDENCE_ROOT/repair-main-alerts.json"
  test "$(node -e \
    "const a=require('$EVIDENCE_ROOT/repair-main-alerts.json');process.stdout.write(String(a.length))")" = 0
  ```

- [ ] **Step 17: Write the repair handoff**

  Run:

  ```bash
  REPO=yoonbuck/jsjs
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  EVIDENCE_ROOT="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair"
  REPAIR_PR=$(gh pr list --repo "$REPO" \
    --head yoonbuck-p1c-authority-repair \
    --state merged \
    --json number \
    --jq 'if length >= 1 then .[0].number else error("missing merged repair PR") end')
  REPAIR_MERGE=$(gh pr view "$REPAIR_PR" \
    --repo "$REPO" --json mergeCommit --jq .mergeCommit.oid)
  REVIEWED_REPAIR_HEAD=$(cat "$EVIDENCE_ROOT/reviewed-repair-head.txt")
  REPAIR_PR="$REPAIR_PR" \
  REPAIR_MERGE="$REPAIR_MERGE" \
  REVIEWED_REPAIR_HEAD="$REVIEWED_REPAIR_HEAD" \
    node - "$EVIDENCE_ROOT/repair-delivery.json" <<'JS'
  const fs = require('fs');
  fs.writeFileSync(
    process.argv[2],
    `${JSON.stringify({
      repairBase: 'edccfb8822339dab53c47bbb8c4ae5cc2db93b1b',
      repairPr: Number(process.env.REPAIR_PR),
      repairReviewedHead: process.env.REVIEWED_REPAIR_HEAD,
      repairMergeSha: process.env.REPAIR_MERGE,
      expectedBaseGuardFailure:
        'A provenance-owned PR range requires one authoritative provenance marker',
      correctedPendingRecordSha256:
        '95036226ee50e365b03c823bab751c6e1d646af0d5c6352a199cd442e2aa9278',
      correctedPendingManifestSha256:
        '5b94b819025e79ebadb763a7d5eb0ce67174f15effcee61745d305e2a32034c4',
      correctedProjectionSha256:
        '6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813',
      abandonedPr: 118,
      abandonedPrHead:
        'e937140d8b40e2599faf98a8e6b370982036e61d',
    }, null, 2)}\n`,
  );
  JS
  gh issue comment 116 --repo "$REPO" --body \
    "The one-use P1C authority repair merged via PR #$REPAIR_PR at \`$REPAIR_MERGE\`. P1C remains pending with canonical record \`95036226ee50e365b03c823bab751c6e1d646af0d5c6352a199cd442e2aa9278\` and aggregate \`6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813\`. PR #118 remains abandoned; semantic delivery will use a fresh branch."
  gh issue comment 78 --repo "$REPO" --body \
    "P1C authority repair merged at \`$REPAIR_MERGE\`; P1C remains pending. The fresh semantic consumer must account for four ES2016 nested BindingRestElement roots and update live P1R/decomposition counts before #116 closes."
  BASE_CHECKER_WORKTREE="$EVIDENCE_ROOT/base-checker"
  git -C "$REPAIR_ROOT" worktree remove --force "$BASE_CHECKER_WORKTREE"
  ```

---

### Task 4: Replay P1C Semantics and Build Corrected Collateral Scratch

**Files:**

- Create: `tools/test262/es2015-p1c-collateral.js`
- Modify: `tools/test262/es2015-p1c.js`
- Modify: `tools/test262/es2015-audit.js`
- Modify: `test/node/es2015-p1c.test.js`
- Modify: `test/node/es2015-taxonomy.test.js`
- Modify:
  `docs/superpowers/specs/2026-08-23-p1-early-errors-decomposition-design.md`
- Modify:
  `docs/superpowers/plans/2026-08-23-p1c-catch-binding-semantics.md`
- Reapply independent portability changes in:
  `test/node/es2015-p1c.test.js`,
  `test/node/es2015-taxonomy.test.js`, and
  `tools/test262/es2015-audit.js`
- Write ignored corrected execution/scratch under:
  `.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic/`
- Do not yet add evidence, modify protected outputs, or apply P1C.

**Interfaces:**

- Consumes: Task 3 repair handoff and exact replay range
  `edccfb8..d667a0c`.
- Produces: fresh branch `yoonbuck-issue-116-p1c-rebuilt`.
- Produces: exact four-path focused execution and projection.
- Produces: exact-four historical H0 audit reversal.
- Produces: corrected scratch pending record `95036226...` and aggregate
  `6e92772f...`.
- Leaves: tracked P1C pending and all evidence/protected bytes unchanged.

- [ ] **Step 1: Start a fresh Task 4 worker in a fresh worktree**

  Invoke `superpowers:subagent-driven-development` and
  `superpowers:using-git-worktrees`.

  Use:

  ```text
  /home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  ```

  Require evidence under:

  ```text
  .superpowers/sdd/2026-08-24-p1c-authority-repair/task-4/
  ```

- [ ] **Step 2: Verify handoff and create the fresh semantic branch**

  Run:

  ```bash
  REPO_ROOT=/home/jordan/jsjs
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  HANDOFF="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/repair-delivery.json"
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  SEMANTIC_BRANCH=yoonbuck-issue-116-p1c-rebuilt
  REPLAY_TIP=d667a0cf41aaf1f822b0d58cec155af7759df83f
  test -f "$HANDOFF"
  REPAIR_MERGE=$(node -e \
    "const h=require('$HANDOFF');process.stdout.write(h.repairMergeSha)")
  git -C "$REPO_ROOT" fetch origin main
  test "$(git -C "$REPO_ROOT" rev-parse origin/main)" = "$REPAIR_MERGE"
  test ! -e "$SEMANTIC_ROOT"
  if git -C "$REPO_ROOT" show-ref --verify --quiet \
    "refs/heads/$SEMANTIC_BRANCH"
  then
    echo "semantic branch already exists: $SEMANTIC_BRANCH" >&2
    exit 1
  fi
  git -C "$REPO_ROOT" worktree add \
    -b "$SEMANTIC_BRANCH" \
    "$SEMANTIC_ROOT" \
    "$REPLAY_TIP"
  git -C "$SEMANTIC_ROOT" rebase --onto \
    "$REPAIR_MERGE" \
    edccfb8822339dab53c47bbb8c4ae5cc2db93b1b
  ```

  Any conflict outside `docs/testing.md` stops the replay for review. A
  `docs/testing.md` conflict must retain the repair section from repaired main
  and the pre-consumer P1C command/documentation from the replayed commit.

- [ ] **Step 3: Prove exact 23-commit replay and excluded consumer tail**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  HANDOFF="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/repair-delivery.json"
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  EVIDENCE_ROOT="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic"
  REPAIR_MERGE=$(node -e \
    "const h=require('$HANDOFF');process.stdout.write(h.repairMergeSha)")
  mkdir -p "$EVIDENCE_ROOT"
  test "$(git -C "$SEMANTIC_ROOT" rev-list --count "$REPAIR_MERGE"..HEAD)" -eq 23
  git -C "$SEMANTIC_ROOT" range-diff --no-color \
    edccfb8822339dab53c47bbb8c4ae5cc2db93b1b..d667a0cf41aaf1f822b0d58cec155af7759df83f \
    "$REPAIR_MERGE"..HEAD \
    > "$EVIDENCE_ROOT/preconsumer-range-diff.txt"
  test "$(grep -Ec '^[[:space:]]*[0-9]+: .* = [[:space:]]*[0-9]+:' \
    "$EVIDENCE_ROOT/preconsumer-range-diff.txt")" -eq 23
  test -z "$(grep -E '^[[:space:]]*[0-9]+: .* [!<>] ' \
    "$EVIDENCE_ROOT/preconsumer-range-diff.txt" || true)"
  ORIGINAL_PATCH_SHA=$(
    git -C "$SEMANTIC_ROOT" log --reverse -p \
      edccfb8822339dab53c47bbb8c4ae5cc2db93b1b..d667a0cf41aaf1f822b0d58cec155af7759df83f |
      git patch-id --stable |
      cut -d' ' -f1 |
      sha256sum |
      cut -d' ' -f1
  )
  REPLAY_PATCH_SHA=$(
    git -C "$SEMANTIC_ROOT" log --reverse -p "$REPAIR_MERGE"..HEAD |
      git patch-id --stable |
      cut -d' ' -f1 |
      sha256sum |
      cut -d' ' -f1
  )
  test "$ORIGINAL_PATCH_SHA" = \
    24bdfa0fa6e6bb32901d74d010d2ca362813ba3fcdc607b061bca26b95b1c628
  test "$REPLAY_PATCH_SHA" = "$ORIGINAL_PATCH_SHA"
  if git -C "$SEMANTIC_ROOT" merge-base --is-ancestor \
    a085d445648d4e1d059b884459b90ee693268ba7 HEAD
  then
    echo 'stale consumer commit was replayed' >&2
    exit 1
  fi
  if git -C "$SEMANTIC_ROOT" merge-base --is-ancestor \
    e937140d8b40e2599faf98a8e6b370982036e61d HEAD
  then
    echo 'diagnostic tail was replayed wholesale' >&2
    exit 1
  fi
  ```

- [ ] **Step 4: Install worktree-local dependencies and exact Test262 pin**

  Run:

  ```bash
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  cd "$SEMANTIC_ROOT"
  npm install --no-audit --no-fund
  if ! git -C vendor/test262 rev-parse --is-inside-work-tree >/dev/null 2>&1
  then
    git clone --filter=blob:none \
      https://github.com/tc39/test262.git \
      vendor/test262
  fi
  git -C vendor/test262 fetch origin \
    b363f29d3c43c626dc852744ad64a0b48a003693
  git -C vendor/test262 checkout --detach \
    b363f29d3c43c626dc852744ad64a0b48a003693
  test "$(git -C vendor/test262 rev-parse HEAD)" = \
    b363f29d3c43c626dc852744ad64a0b48a003693
  test -z "$(git status --short)"
  ```

- [ ] **Step 5: Reproduce the clean Node portability RED**

  Create a detached clean-node worktree without `vendor/test262`, while
  sharing only installed dependencies and `vendor/acorn`:

  ```bash
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  CLEAN_NODE="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic/clean-node-red"
  cd "$SEMANTIC_ROOT"
  test ! -e "$CLEAN_NODE"
  git worktree add --detach "$CLEAN_NODE" HEAD
  ln -s "$SEMANTIC_ROOT/node_modules" "$CLEAN_NODE/node_modules"
  mkdir -p "$CLEAN_NODE/vendor"
  ln -s "$SEMANTIC_ROOT/vendor/acorn" "$CLEAN_NODE/vendor/acorn"
  set +e
  (
    cd "$CLEAN_NODE"
    TZ=UTC node test/run-node.js test/node/es2015-p1c.test.js
  ) > "$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic/clean-node-red.log" 2>&1
  CLEAN_STATUS=$?
  set -e
  test "$CLEAN_STATUS" -ne 0
  grep -F 'vendor/test262 is not a git checkout' \
    "$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic/clean-node-red.log"
  grep -F 'ENOENT' \
    "$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic/clean-node-red.log"
  ```

- [ ] **Step 6: Reapply only the two independent P1C test portability fixes**

  In `test/node/es2015-p1c.test.js`:

  1. Replace physical-checkout inventory construction with
     `syntheticP1CInventory(ledgerText, taxonomy)`.
  2. Retain `readTest262Pin()` and assert taxonomy repository/revision equal
     the package pin.
  3. Add the unknown-include rejection:

     ```js
     const unknownInclude = structuredClone(taxonomy);
     findClassification(unknownInclude, paths[0]).includes = [
       'unknown-p1c-helper.js',
     ];
     assertSame(
       assertThrows(
         () => syntheticP1CInventory(ledgerText, unknownInclude),
         Error,
       ).message,
       'ES2015 include unknown-p1c-helper.js is unknown',
     );
     ```

  4. Replace the historical task directory with:

     ```js
     const fixturePath = `.superpowers/test/es2015-p1c-${randomUUID()}`;
     const fixtureUrl = new URL(`${fixturePath}/`, REPOSITORY_ROOT);
     await mkdir(fixtureUrl, { recursive: true });
     ```

  5. Remove the whole unique fixture root in `finally`.
  6. Remove checkout-only imports/helpers from the Node test.

- [ ] **Step 7: Verify clean Node portability GREEN**

  Run:

  ```bash
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  EVIDENCE_ROOT="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic"
  CLEAN_NODE="$EVIDENCE_ROOT/clean-node-red"
  cd "$SEMANTIC_ROOT"
  git diff --binary -- test/node/es2015-p1c.test.js \
    > "$EVIDENCE_ROOT/portability-fix.patch"
  git -C "$CLEAN_NODE" apply "$EVIDENCE_ROOT/portability-fix.patch"
  (
    cd "$CLEAN_NODE"
    TZ=UTC node test/run-node.js test/node/es2015-p1c.test.js
  ) > "$EVIDENCE_ROOT/clean-node-green.log" 2>&1
  git worktree remove --force "$CLEAN_NODE"
  ```

  Expected: the inventory and build-scratch tests pass without
  `vendor/test262`; no checkout or missing-directory setup failure remains.

- [ ] **Step 8: Add the closed collateral module and RED tests**

  Create `tools/test262/es2015-p1c-collateral.js` with the exact four paths,
  exact BASE classifications, exact blocked classifications, and:

  ```js
  export const P1C_COLLATERAL_PATHS = Object.freeze([
    'test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-ary-elem.js',
    'test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-ary-rest.js',
    'test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-obj-id.js',
    'test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-obj-prop-id.js',
  ]);

  export const P1C_COLLATERAL_BASE_CLASSIFICATIONS = Object.freeze(
    P1C_COLLATERAL_PATHS.map((path) =>
      Object.freeze({
        path,
        variants: 2,
        partition: 'core',
        status: 'selected-passing',
        blocker: null,
        features: Object.freeze([
          'default-parameters',
          'destructuring-binding',
        ]),
        flags: Object.freeze(['generated']),
        includes: Object.freeze([]),
        provenance: Object.freeze([
          'anchor:sec-arrow-function-definitions-runtime-semantics-evaluation',
          'feature:default-parameters',
          'feature:destructuring-binding',
        ]),
      }),
    ),
  );

  export const P1C_COLLATERAL_BLOCKED_CLASSIFICATIONS = Object.freeze(
    P1C_COLLATERAL_BASE_CLASSIFICATIONS.map((entry) =>
      Object.freeze({
        ...entry,
        status: 'blocked:early-errors-and-declaration-instantiation',
        blocker: 'early-errors-and-declaration-instantiation',
      }),
    ),
  );

  export const P1C_CORRECTED_APPLIED_RECORD_SHA256 =
    '64db02e17f5d7e7f26805eee912d625b53a989e4c4ae17b15165bea3118bfefa';
  ```

  In `test/node/es2015-p1c.test.js`, add tests requiring:

  ```text
  exactly 4 sorted unique paths
  exactly 8 variants
  exact BASE metadata for every path
  exact blocked classification changes only status/blocker
  no overlap with the 81-root P1C source ledger
  ```

  Add a test calling the not-yet-implemented
  `runP1CCollateralFocused()` and another passing a
  `collateralExecution` argument to `projectP1CCoreOutputs()`.

- [ ] **Step 9: Run collateral projection RED**

  Run:

  ```bash
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  cd "$SEMANTIC_ROOT"
  TZ=UTC node test/run-node.js test/node/es2015-p1c.test.js
  ```

  Expected: FAIL because the collateral module/runner/projection interface is
  absent.

- [ ] **Step 10: Implement exact four-path focused execution**

  In `runP1CCollateralFocused()` call `runTest262Suite()` with exactly
  `P1C_COLLATERAL_PATHS`. Validate each root's metadata:

  ```js
  features: ['default-parameters', 'destructuring-binding'];
  flags: ['generated'];
  includes: [];
  variants: ['non-strict', 'strict'];
  ```

  Require every result:

  ```js
  {
    status: 'failed',
    reason: 'parse-error',
    message: 'SyntaxError: rest elements are not supported in this context',
  }
  ```

  Return a version-1 document with exact paths and eight records. Reject any
  pass, skip, foreign path, missing variant, duplicate, metadata drift, reason
  drift, or message drift.

- [ ] **Step 11: Implement collateral audit/subset/taxonomy projection**

  Extend `projectP1CCoreOutputs()` with `collateralExecution`.

  Audit:

  ```js
  const collateralRecords = validateP1CCollateralExecution(
    options.collateralExecution,
  ).map((record) =>
    createTestRecord({
      file: record.file,
      variant: record.variant,
      status: 'failed',
    }),
  );
  ```

  Require BASE audit has no record/blocker for the four selected roots. Append
  the eight failed records, add four
  `early-errors-and-declaration-instantiation` blockers, and code-unit sort
  records/blocker keys.

  Subset:

  - require each collateral path appears exactly once;
  - require all four are in `language/expressions`;
  - remove exactly those four;
  - preserve every other group/path byte-for-value; and
  - then merge the unchanged 81-root P1C promotion.

  Taxonomy:

  - promote the 81 P1C source classifications as before;
  - require every collateral BASE classification exactly equals the shared
    module literal;
  - replace it with the exact blocked literal;
  - preserve every other classification; and
  - recompute summary/status tables.

- [ ] **Step 12: Make report/conformance reconstruction remove only eight records**

  In `buildP1CReportArtifacts()` build BASE report groups from:

  ```js
  report.records.filter(
    (record) => !promoted.has(record.file) && selected.has(record.file),
  );
  ```

  Permit an unselected BASE report record only when its file is one of the
  exact four collateral paths. Require exactly two records per collateral
  root, variants `non-strict` then `strict`, status `passed`, and features
  `["destructuring-binding","default-parameters"]` before removal.

  Any other unselected BASE report record remains a foreign-root failure.

- [ ] **Step 13: Change the P1C authority builder operation split**

  Change:

  ```js
  const P1C_PROJECT_PATHS = Object.freeze([CONFORMANCE_FILE, REPORT_FILE]);
  const P1C_REPLACE_PATHS = Object.freeze([
    AUDIT_EVIDENCE_FILE,
    TAXONOMY_FILE,
    SUBSET_FILE,
  ]);
  ```

  Keep all six evidence paths `add-exact`. Require 11 outputs with
  2 project / 3 replace-exact / 6 add-exact.

- [ ] **Step 14: Make build-scratch execute and archive the four roots**

  In `buildP1CScratch()`:

  - construct the pinned host and engine once;
  - run `runP1CCollateralFocused()` automatically;
  - pass its result to `projectP1CCoreOutputs()`;
  - write `collateral-execution.json` into the ignored scratch root; and
  - include exact collateral counts/hash in `summary.json`.

  Tests inject a deterministic collateral runner so unit tests do not require
  a Test262 checkout.

- [ ] **Step 15: Add exact audit reversal RED tests**

  In `test/node/es2015-taxonomy.test.js`, import
  `P1C_COLLATERAL_BASE_CLASSIFICATIONS`,
  `P1C_COLLATERAL_BLOCKED_CLASSIFICATIONS`, and the corrected applied record
  hash. Build the authority fixture by reading repaired pending manifest
  `5b94b819...`, changing only P1C `state` to `applied`, and asserting its
  canonical hash is `64db02e...`.

  Call `reverseP1CCollateralTaxonomy()` directly in the positive and hostile
  drift cases before wiring it into the broader H0 reconciliation path.

  Add compact tests for:

  ```text
  exact four blocked classifications reverse to selected-passing
  foreign classification remains unchanged
  pending authority rejected
  stale applied P1C record
  9049c137bbd42c82c6277c689d3313928b4fc7ac10aa785bf81d1dd690141897
  rejected
  alternate applied record rejected
  missing path rejected
  duplicate path rejected
  reordered path rejected
  variant drift rejected
  partition drift rejected
  feature drift rejected
  flag drift rejected
  include drift rejected
  provenance drift rejected
  status drift rejected
  blocker drift rejected
  extra collateral path rejected
  ```

- [ ] **Step 16: Implement exact applied-authority audit reversal**

  Import `canonicalRoadmapAuthoritySha256()` and add:

  ```js
  export function reverseP1CCollateralTaxonomy(taxonomyText, authority) {
    if (
      authority.code !== 'P1C' ||
      authority.state !== 'applied' ||
      canonicalRoadmapAuthoritySha256(authority) !==
        P1C_CORRECTED_APPLIED_RECORD_SHA256
    ) {
      throw new Es2015AuditError(
        'Applied P1C collateral reversal requires the exact corrected authority',
      );
    }

    // Require exact four blocked classifications and replace them with the
    // exact BASE selected-passing literals. Preserve every foreign entry.
    return `${JSON.stringify({ classifications }, null, 2)}\n`;
  }
  ```

  Call this only for P1C after the existing 81-root baseline/disposition
  reversal inside `taxonomyBeforeAppliedRoadmapAuthority()`.

- [ ] **Step 17: Reapply authority-correct audit serialization**

  Replace the diagnostic's broad `state === "applied"` check with an exact
  corrected-authority gate:

  ```js
  const p1cAuthority = roadmapAuthorities.find(
    (authority) => authority.code === 'P1C' && authority.state === 'applied',
  );
  if (
    p1cAuthority !== undefined &&
    canonicalRoadmapAuthoritySha256(p1cAuthority) !==
      P1C_CORRECTED_APPLIED_RECORD_SHA256
  ) {
    throw new Es2015AuditError(
      'Applied P1C audit serialization requires the exact corrected authority',
    );
  }
  ```

  Continue parsing/using P1C promotion semantics. Pass `null` only for the two
  serialization-only P1C input hashes when that exact applied record exists.
  Preserve the existing no-authority/pending fixture behavior.

- [ ] **Step 18: Update durable P1R/decomposition accounting**

  In
  `docs/superpowers/specs/2026-08-23-p1-early-errors-decomposition-design.md`,
  distinguish the immutable 482-root snapshot from the live corrected ledger
  and update:

  ```text
  P1R live ledger:
  254 roots / 494 variants
  3a2356b36431b3553a65289afd03eb0aa1e88a36e78b3684cfb460eaf426c4d6

  live decomposition:
  487 roots / 959 variants
  94467957a7d427219cfcbe301adef006052437c30a56533ef510e3dacbfbaf88

  remaining post-P1C:
  406 roots / 798 variants
  182c54ed6fbd4b290b11172809ddd5289bb45b16a07a2c1e4402b94fec2feba7
  ```

  Preserve historical comment `5347038305` and its 482/949 identity.

  In
  `docs/superpowers/plans/2026-08-23-p1c-catch-binding-semantics.md`, add a
  superseding recovery amendment that replaces stale +81/+161 consumer
  assumptions with exact net +77/+153 selection, 20,672/39,292 totals, 14,349
  generated non-T0 roots, exact four-path collateral evidence, corrected
  authority hashes, and the audit-reversal requirement.

- [ ] **Step 19: Run Task 4 unit GREEN**

  Run:

  ```bash
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  cd "$SEMANTIC_ROOT"
  TZ=UTC node test/run-node.js \
    test/node/es2015-p1c.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/upstream-select.test.js \
    test/node/repository-invariants.test.js
  npm run typecheck
  ESLINT_USE_FLAT_CONFIG=true npx eslint \
    tools/test262/es2015-p1c-collateral.js \
    tools/test262/es2015-p1c.js \
    tools/test262/es2015-audit.js \
    test/node/es2015-p1c.test.js \
    test/node/es2015-taxonomy.test.js
  npx prettier --check \
    tools/test262/es2015-p1c-collateral.js \
    tools/test262/es2015-p1c.js \
    tools/test262/es2015-audit.js \
    test/node/es2015-p1c.test.js \
    test/node/es2015-taxonomy.test.js \
    docs/superpowers/specs/2026-08-23-p1-early-errors-decomposition-design.md \
    docs/superpowers/plans/2026-08-23-p1c-catch-binding-semantics.md
  git diff --check
  ```

- [ ] **Step 20: Run exact four-path BASE and HEAD execution**

  Run:

  ```bash
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  EVIDENCE_ROOT="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic"
  BASE_WORKTREE="$EVIDENCE_ROOT/edccfb8-four-path"
  cd "$SEMANTIC_ROOT"
  test ! -e "$BASE_WORKTREE"
  git worktree add --detach \
    "$BASE_WORKTREE" \
    edccfb8822339dab53c47bbb8c4ae5cc2db93b1b
  ln -s "$SEMANTIC_ROOT/node_modules" "$BASE_WORKTREE/node_modules"
  mkdir -p "$BASE_WORKTREE/vendor"
  ln -s "$SEMANTIC_ROOT/vendor/acorn" "$BASE_WORKTREE/vendor/acorn"
  ln -s "$SEMANTIC_ROOT/vendor/test262" "$BASE_WORKTREE/vendor/test262"
  (
    cd "$BASE_WORKTREE"
    TZ=UTC node tools/test262/adapters/node.js \
      --root=vendor/test262 \
      test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-ary-elem.js \
      test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-ary-rest.js \
      test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-obj-id.js \
      test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-obj-prop-id.js
  ) > "$EVIDENCE_ROOT/four-path-base.jsonl"
  set +e
  TZ=UTC node tools/test262/adapters/node.js \
    --root=vendor/test262 \
    test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-ary-elem.js \
    test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-ary-rest.js \
    test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-obj-id.js \
    test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-obj-prop-id.js \
    > "$EVIDENCE_ROOT/four-path-head.jsonl"
  HEAD_STATUS=$?
  set -e
  test "$HEAD_STATUS" -ne 0
  node - "$EVIDENCE_ROOT/four-path-base.jsonl" \
    "$EVIDENCE_ROOT/four-path-head.jsonl" <<'JS'
  const fs = require('fs');
  const parse = (path) =>
    fs.readFileSync(path, 'utf8').trimEnd().split('\n').map(JSON.parse);
  const base = parse(process.argv[2]);
  const head = parse(process.argv[3]);
  const baseSummary = base.findLast((record) => record.type === 'summary');
  const headSummary = head.findLast((record) => record.type === 'summary');
  if (
    JSON.stringify(baseSummary) !==
      JSON.stringify({ type: 'summary', total: 8, passed: 8, failed: 0, skipped: 0 }) ||
    JSON.stringify(headSummary) !==
      JSON.stringify({ type: 'summary', total: 8, passed: 0, failed: 8, skipped: 0 })
  ) {
    throw new Error('four-path BASE/HEAD execution mismatch');
  }
  for (const record of head.filter((entry) => entry.type === 'test')) {
    if (
      record.status !== 'failed' ||
      record.reason !== 'parse-error' ||
      record.message !==
        'SyntaxError: rest elements are not supported in this context'
    ) {
      throw new Error(`unexpected four-path failure: ${JSON.stringify(record)}`);
    }
  }
  JS
  git worktree remove --force "$BASE_WORKTREE"
  ```

- [ ] **Step 21: Regenerate corrected P1C execution and scratch**

  Run:

  ```bash
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  SCRATCH="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic/p1c"
  cd "$SEMANTIC_ROOT"
  rm -rf "$SCRATCH"
  mkdir -p "$SCRATCH"
  TZ=UTC npm run test262:es2015:p1c -- \
    --ledger=tools/test262/es2015-p1c-paths.txt \
    --output=.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic/p1c/execution.json
  TZ=UTC npm run test262:es2015:p1c -- \
    --build-scratch \
    --ledger=tools/test262/es2015-p1c-paths.txt \
    --execution=.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic/p1c/execution.json \
    --output=.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic/p1c/authority
  ```

  Verify:

  ```text
  P1C source: 81 roots / 161 variants, all passed
  collateral: 4 roots / 8 variants, all expected parse failures
  evidence hashes: unchanged six exact hashes
  audit: 50f9a543...
  taxonomy: fdf3c8bf...
  subset: 5a5b83b3...
  report: 89002c4b...
  conformance: 9cc4250e...
  pending record: 95036226...
  aggregate: 6e92772f...
  ```

- [ ] **Step 22: Prove no tracked authority/protected byte changed**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  HANDOFF="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/repair-delivery.json"
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  REPAIR_MERGE=$(node -e \
    "const h=require('$HANDOFF');process.stdout.write(h.repairMergeSha)")
  git -C "$SEMANTIC_ROOT" diff --exit-code "$REPAIR_MERGE"...HEAD -- \
    tools/test262/es2015-provenance.json \
    tools/test262/es2015-audit-evidence.json \
    tools/test262/es2015-taxonomy.json \
    tools/test262/upstream-subset.json \
    tools/test262/es5-selection.json \
    docs/test262-report.jsonl \
    docs/conformance.md \
    tools/test262/es2015-p1c-baseline.json \
    tools/test262/es2015-p1c-disposition.json \
    tools/test262/es2015-p1c-owner-deltas.json \
    tools/test262/es2015-p1c-owner-map.json \
    tools/test262/es2015-p1c-paths.json \
    tools/test262/es2015-p1c-promotion.json
  ```

  Expected: PASS. Scratch contains corrected bytes; tracked P1C stays pending.

- [ ] **Step 23: Obtain fresh Task 4 specification review**

  Require review of exact replay, excluded consumer tail, two portability
  fixes, exact four source/metadata/failure facts, audit/subset/taxonomy/report
  projection, 2/3/6 authority operations, exact audit reversal, corrected
  hashes, and P1R/decomposition accounting.

- [ ] **Step 24: Obtain fresh Task 4 code-quality review**

  Require a different reviewer to inspect shared-module boundaries,
  deterministic ordering, error diagnostics, runner containment, scratch path
  safety, audit-history isolation, tests, and absence of tracked generated
  bytes.

- [ ] **Step 25: Commit Task 4**

  Run:

  ```bash
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  cd "$SEMANTIC_ROOT"
  git add \
    tools/test262/es2015-p1c-collateral.js \
    tools/test262/es2015-p1c.js \
    tools/test262/es2015-audit.js \
    test/node/es2015-p1c.test.js \
    test/node/es2015-taxonomy.test.js \
    docs/superpowers/specs/2026-08-23-p1-early-errors-decomposition-design.md \
    docs/superpowers/plans/2026-08-23-p1c-catch-binding-semantics.md
  git -c user.name='Copilot' \
    -c user.email='223556219+Copilot@users.noreply.github.com' \
    commit --author='Copilot <223556219+Copilot@users.noreply.github.com>' \
    -m 'test262: add exact P1C collateral projection' \
    -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
  ```

---

### Task 5: Build and Validate the Corrected Normal P1C Consumer

**Files:**

- Add: six `tools/test262/es2015-p1c-*.json` evidence files
- Modify: `tools/test262/es2015-provenance.json` (`P1C.state` only)
- Modify: `tools/test262/es2015-audit-evidence.json`
- Modify: `tools/test262/es2015-taxonomy.json`
- Modify: `tools/test262/upstream-subset.json`
- Modify: `docs/test262-report.jsonl`
- Modify: generated block in `docs/conformance.md`
- Modify: `tools/test262/es2015-p1c.js`
- Modify: `.prettierignore`
- Modify: `docs/architecture.md`
- Modify: `docs/testing.md`
- Modify: `test/node/es2015-p1c.test.js`
- Modify: `test/node/es2015-provenance.test.js`
- Modify: `test/node/es2015-taxonomy.test.js`
- Modify: `test/node/upstream-select.test.js`
- Modify: `test/node/repository-invariants.test.js`
- Modify: `test/node/es2015-m1.test.js`
- Modify: `test/ci/es2015-syntax-test262.test.js`

**Interfaces:**

- Consumes: Task 4 corrected ignored scratch and repaired pending main.
- Produces: exact corrected applied P1C record `64db02e...`.
- Produces: exact applied manifest `55cea427...`.
- Produces: normal consumer marker with aggregate `6e92772f...`.
- Produces: all focused select/audit/report/provenance/runtime checks green.

- [ ] **Step 1: Start a fresh Task 5 worker**

  Invoke `superpowers:subagent-driven-development`. Require evidence under:

  ```text
  .superpowers/sdd/2026-08-24-p1c-authority-repair/task-5/
  ```

- [ ] **Step 2: Recheck repaired main and corrected scratch**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  HANDOFF="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/repair-delivery.json"
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  SCRATCH="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic/p1c/authority"
  REPAIR_MERGE=$(node -e \
    "const h=require('$HANDOFF');process.stdout.write(h.repairMergeSha)")
  git -C "$SEMANTIC_ROOT" fetch origin main
  test "$(git -C "$SEMANTIC_ROOT" rev-parse origin/main)" = "$REPAIR_MERGE"
  test -f "$SCRATCH/summary.json"
  node - "$SCRATCH/summary.json" <<'JS'
  const fs = require('fs');
  const summary = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (
    summary.ledger.roots !== 81 ||
    summary.ledger.variants !== 161 ||
    summary.authoritySha256 !==
      '95036226ee50e365b03c823bab751c6e1d646af0d5c6352a199cd442e2aa9278' ||
    summary.protectedProjectionSha256 !==
      '6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813'
  ) {
    throw new Error(`scratch identity mismatch: ${JSON.stringify(summary)}`);
  }
  JS
  ```

- [ ] **Step 3: Build the exact normal consumer marker**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  HANDOFF="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/repair-delivery.json"
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  EVIDENCE_ROOT="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic"
  REPAIR_MERGE=$(node -e \
    "const h=require('$HANDOFF');process.stdout.write(h.repairMergeSha)")
  CONSUMER_MARKER=$(cat <<EOF
  <!-- es2015-roadmap-authority-consume
  parent:70
  code:P1C
  issue:116
  profile:roadmap-reclassification:P1C
  base:$REPAIR_MERGE
  source-path-sha256:e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5
  source-entry-sha256:null
  protected-projection-sha256:6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813
  -->
  EOF
  )
  mkdir -p "$EVIDENCE_ROOT"
  printf '%s\n' "$CONSUMER_MARKER" > "$EVIDENCE_ROOT/consumer-marker.txt"
  ```

- [ ] **Step 4: Run repaired BASE consumer RED before applying outputs**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  HANDOFF="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/repair-delivery.json"
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  EVIDENCE_ROOT="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic"
  REPAIR_BASE_WORKTREE="$EVIDENCE_ROOT/repaired-base"
  REPAIR_MERGE=$(node -e \
    "const h=require('$HANDOFF');process.stdout.write(h.repairMergeSha)")
  PRECONSUMER_HEAD=$(git -C "$SEMANTIC_ROOT" rev-parse HEAD)
  CONSUMER_MARKER=$(cat "$EVIDENCE_ROOT/consumer-marker.txt")
  test ! -e "$REPAIR_BASE_WORKTREE"
  git -C "$SEMANTIC_ROOT" worktree add --detach \
    "$REPAIR_BASE_WORKTREE" \
    "$REPAIR_MERGE"
  set +e
  (
    cd "$REPAIR_BASE_WORKTREE"
    TZ=UTC node tools/test262/es2015-provenance-check.js \
      --check-range \
      --base="$REPAIR_MERGE" \
      --head="$PRECONSUMER_HEAD" \
      --profile=roadmap-reclassification:P1C \
      --marker="$CONSUMER_MARKER"
  ) > "$EVIDENCE_ROOT/preconsumer-range-red.log" 2>&1
  PRECONSUMER_STATUS=$?
  set -e
  test "$PRECONSUMER_STATUS" -ne 0
  grep -Fx \
    'Es2015ProvenanceCheckError: P1C roadmap authority must transition only from pending to applied' \
    "$EVIDENCE_ROOT/preconsumer-range-red.log"
  ```

  This proves the normal consumer cannot pass before evidence, protected
  outputs, and the state transition are present.

- [ ] **Step 5: Copy the six unchanged evidence files**

  Run:

  ```bash
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  SCRATCH="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic/p1c/authority"
  cd "$SEMANTIC_ROOT"
  cp "$SCRATCH/evidence/es2015-p1c-baseline.json" \
    tools/test262/es2015-p1c-baseline.json
  cp "$SCRATCH/evidence/es2015-p1c-disposition.json" \
    tools/test262/es2015-p1c-disposition.json
  cp "$SCRATCH/evidence/es2015-p1c-owner-deltas.json" \
    tools/test262/es2015-p1c-owner-deltas.json
  cp "$SCRATCH/evidence/es2015-p1c-owner-map.json" \
    tools/test262/es2015-p1c-owner-map.json
  cp "$SCRATCH/evidence/es2015-p1c-paths.json" \
    tools/test262/es2015-p1c-paths.json
  cp "$SCRATCH/evidence/es2015-p1c-promotion.json" \
    tools/test262/es2015-p1c-promotion.json
  ```

  Verify all six hashes equal the Global Constraints values.

- [ ] **Step 6: Copy the five corrected protected outputs**

  Run:

  ```bash
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  SCRATCH="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic/p1c/authority"
  cd "$SEMANTIC_ROOT"
  cp "$SCRATCH/projected/tools/test262/es2015-audit-evidence.json" \
    tools/test262/es2015-audit-evidence.json
  cp "$SCRATCH/projected/tools/test262/es2015-taxonomy.json" \
    tools/test262/es2015-taxonomy.json
  cp "$SCRATCH/projected/tools/test262/upstream-subset.json" \
    tools/test262/upstream-subset.json
  cp "$SCRATCH/projected/docs/test262-report.jsonl" \
    docs/test262-report.jsonl
  cp "$SCRATCH/projected/docs/conformance.md" \
    docs/conformance.md
  ```

  Require exact corrected hashes before proceeding.

- [ ] **Step 7: Apply only corrected P1C pending -> applied**

  Run:

  ```bash
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  cd "$SEMANTIC_ROOT"
  node --input-type=module <<'JS'
  import { readFileSync, writeFileSync } from 'node:fs';
  import {
    canonicalRoadmapAuthoritySha256,
    parseEs2015ProvenanceManifest,
    renderEs2015ProvenanceManifest,
    roadmapAggregateProjectionSha256,
  } from './tools/test262/es2015-provenance.js';

  const file = 'tools/test262/es2015-provenance.json';
  const manifest = parseEs2015ProvenanceManifest(readFileSync(file, 'utf8'));
  const p1c = manifest.roadmapAuthorities.find(
    (authority) => authority.code === 'P1C',
  );
  if (
    p1c === undefined ||
    p1c.state !== 'pending' ||
    canonicalRoadmapAuthoritySha256(p1c) !==
      '95036226ee50e365b03c823bab751c6e1d646af0d5c6352a199cd442e2aa9278' ||
    roadmapAggregateProjectionSha256(p1c) !==
      '6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813'
  ) {
    throw new Error('P1C is not the exact corrected pending authority');
  }
  p1c.state = 'applied';
  writeFileSync(file, renderEs2015ProvenanceManifest(manifest));
  JS
  test "$(sha256sum tools/test262/es2015-provenance.json | cut -d' ' -f1)" = \
    55cea42748f5f2a2abc2228b7d33aa0f4d6c2ec9b55b2d96f40782eb565f396f
  ```

  Compare BASE/HEAD P1C after deleting only `state`; every other field must be
  equal.

- [ ] **Step 8: Restore the applied P1C focused-runner boundary**

  Rebuild, rather than cherry-pick, the applied-consumer logic from the old
  consumer:

  ```js
  export function reconstructAppliedP1CSourceTaxonomy(options) {
    // Require exact applied P1C record 64db02e..., exact baseline and
    // disposition evidence hashes, exact 81/161 source identity, and exact
    // selected-passing destinations. Reverse only the 81 P1C source
    // classifications to their baseline blocked form for focused execution.
  }
  ```

  In `executeP1CCorpus()`, when P1C is applied, read the tracked baseline,
  disposition, and provenance files and pass the reconstructed source taxonomy
  to `verifyP1CLedger()`, inventory construction, and focused execution. The
  four collateral roots remain current blocked classifications because they
  are not part of the 81-root source ledger.

  Add tests rejecting:

  ```text
  pending or stale applied authority
  wrong baseline/disposition evidence hash
  wrong source count/path/variant identity
  destination drift
  current selected classification drift
  stable metadata drift
  ```

- [ ] **Step 9: Update tracked integration expectations and ownership**

  Update:

  ```text
  test/node/es2015-p1c.test.js
    corrected five output hashes
    pending 95036226...
    applied 64db02e...
    aggregate 6e92772f...
    62 groups / 20,672 paths / 39,292 variants
    14,349 generated non-T0 roots
    exact four removed report roots
    exact eight audit failures and four blockers

  test/node/es2015-m1.test.js
    downstream subset totals 62 groups / 20,672 paths

  test/ci/es2015-syntax-test262.test.js
    GENERATED_PATH_COUNT = 14349
    exact P1C group remains 81 roots
    exact four collateral paths are absent from current selection

  test/node/upstream-select.test.js
    generated selection matches corrected subset and excludes exact four

  test/node/es2015-provenance.test.js
    exact corrected applied projection fixture and hostile mutations

  test/node/es2015-taxonomy.test.js
    tracked P1C evidence plus exact collateral blocker/reversal assertions

  .prettierignore and test/node/repository-invariants.test.js
    six generated P1C evidence files
  ```

- [ ] **Step 10: Update semantic documentation**

  In `docs/architecture.md`, retain the shared catch-binding kernel and add the
  exact collateral boundary: the P1C parser correctly rejects ES2016 nested
  binding-rest patterns.

  In `docs/testing.md`, replace stale 20,676/39,300 and project-operation text
  with:

  ```text
  20,672 selected roots
  39,292 selected variants
  14,349 generated non-T0 roots
  4 exact collateral roots / 8 failed variants
  audit/taxonomy/subset exact replacement
  report/conformance project validation
  aggregate 6e92772f...
  ```

  Preserve the historical one-use repair section and local broad-run
  prohibition.

- [ ] **Step 11: Add exact corrected consumer RED/GREEN assertions**

  Focused tests must reject:

  ```text
  missing/extra/reordered collateral path
  one collateral root still selected
  one extra subset removal
  one audit failure missing or passing
  wrong failure variant
  missing/extra blocker
  taxonomy stable-field drift
  wrong provisional status/blocker
  one stale report record retained
  one foreign report record removed
  wrong corrected output hash
  stale aggregate 30354b59...
  stale pending record 3281bd00...
  partial evidence
  changed evidence bytes
  P1C pending in consumer HEAD
  P1C applied in consumer BASE
  applied-to-applied replay
  es5-selection.json change
  ```

- [ ] **Step 12: Create an ephemeral consumer HEAD**

  Run:

  ```bash
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  EVIDENCE_ROOT="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic"
  cd "$SEMANTIC_ROOT"
  git add \
    .prettierignore \
    docs/architecture.md \
    docs/conformance.md \
    docs/test262-report.jsonl \
    docs/testing.md \
    test/ci/es2015-syntax-test262.test.js \
    test/node/es2015-m1.test.js \
    test/node/es2015-p1c.test.js \
    test/node/es2015-provenance.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/repository-invariants.test.js \
    test/node/upstream-select.test.js \
    tools/test262/es2015-audit-evidence.json \
    tools/test262/es2015-p1c-baseline.json \
    tools/test262/es2015-p1c-disposition.json \
    tools/test262/es2015-p1c-owner-deltas.json \
    tools/test262/es2015-p1c-owner-map.json \
    tools/test262/es2015-p1c-paths.json \
    tools/test262/es2015-p1c-promotion.json \
    tools/test262/es2015-p1c.js \
    tools/test262/es2015-provenance.json \
    tools/test262/es2015-taxonomy.json \
    tools/test262/upstream-subset.json
  CONSUMER_TREE=$(git write-tree)
  CONSUMER_CHECK_HEAD=$(printf 'corrected P1C consumer candidate\n' |
    git commit-tree "$CONSUMER_TREE" -p "$(git rev-parse HEAD)")
  printf '%s\n' "$CONSUMER_CHECK_HEAD" \
    > "$EVIDENCE_ROOT/consumer-check-head.txt"
  ```

  Do not create the persistent consumer commit until reviews approve.

- [ ] **Step 13: Run repaired BASE checker GREEN**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  HANDOFF="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/repair-delivery.json"
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  EVIDENCE_ROOT="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic"
  REPAIR_BASE_WORKTREE="$EVIDENCE_ROOT/repaired-base"
  REPAIR_MERGE=$(node -e \
    "const h=require('$HANDOFF');process.stdout.write(h.repairMergeSha)")
  CONSUMER_CHECK_HEAD=$(cat "$EVIDENCE_ROOT/consumer-check-head.txt")
  CONSUMER_MARKER=$(cat "$EVIDENCE_ROOT/consumer-marker.txt")
  (
    cd "$REPAIR_BASE_WORKTREE"
    TZ=UTC node tools/test262/es2015-provenance-check.js \
      --check-range \
      --base="$REPAIR_MERGE" \
      --head="$CONSUMER_CHECK_HEAD" \
      --profile=roadmap-reclassification:P1C \
      --marker="$CONSUMER_MARKER"
  )
  ```

  Expected: PASS with the full generic protected-output validator. Do not use a
  dependency override for this end-to-end gate.

- [ ] **Step 14: Run all focused local consumer gates**

  Run:

  ```bash
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  cd "$SEMANTIC_ROOT"
  TZ=UTC node test/run-node.js \
    test/parser.test.js \
    test/catch-binding.test.js \
    test/try-statements.test.js \
    test/destructuring.test.js \
    test/eval.test.js \
    test/generator-control-flow.test.js \
    test/node/es2015-p1c.test.js \
    test/node/upstream-select.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/es2015-m1.test.js \
    test/node/es2015-provenance.test.js \
    test/node/repository-invariants.test.js
  TZ=UTC node test/run-node.js test/ci/es2015-syntax-test262.test.js
  node test/run-browser-playwright.js \
    test/parser.test.js \
    test/catch-binding.test.js \
    test/try-statements.test.js \
    test/destructuring.test.js \
    test/eval.test.js \
    test/generator-control-flow.test.js
  TZ=UTC npm run test262:es2015:p1c -- \
    --ledger=tools/test262/es2015-p1c-paths.txt \
    --output=.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic/p1c/final-execution.json
  TZ=UTC npm run test262:es2015:p1c -- \
    --build-scratch \
    --ledger=tools/test262/es2015-p1c-paths.txt \
    --execution=.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic/p1c/final-execution.json \
    --output=.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic/p1c/final-authority
  TZ=UTC npm run test262:select:check
  TZ=UTC npm run test262:es2015:audit:check
  TZ=UTC npm run test262:es2015:sync-promoted-report -- --check
  TZ=UTC npm run test262:es2015:provenance:check
  npm run typecheck
  npm run ci:check
  ESLINT_USE_FLAT_CONFIG=true npx eslint \
    tools/test262/es2015-p1c-collateral.js \
    tools/test262/es2015-p1c.js \
    tools/test262/es2015-audit.js \
    test/ci/es2015-syntax-test262.test.js \
    test/node/es2015-m1.test.js \
    test/node/es2015-p1c.test.js \
    test/node/es2015-provenance.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/repository-invariants.test.js \
    test/node/upstream-select.test.js
  npx prettier --check \
    .prettierignore \
    docs/architecture.md \
    docs/testing.md \
    docs/superpowers/specs/2026-08-23-p1-early-errors-decomposition-design.md \
    docs/superpowers/plans/2026-08-23-p1c-catch-binding-semantics.md \
    tools/test262/es2015-p1c-collateral.js \
    tools/test262/es2015-p1c.js \
    tools/test262/es2015-audit.js \
    test/ci/es2015-syntax-test262.test.js \
    test/node/es2015-m1.test.js \
    test/node/es2015-p1c.test.js \
    test/node/es2015-provenance.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/repository-invariants.test.js \
    test/node/upstream-select.test.js
  git diff --check
  ```

  Expected:

  ```text
  P1C: 81 / 161 passed
  collateral: 4 / 8 expected parse failures
  subset: 62 / 20,672
  selected variants: 39,292
  audit: current
  report: current
  provenance range: pass
  ```

- [ ] **Step 15: Verify exact files, hashes, counts, and state**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  HANDOFF="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/repair-delivery.json"
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  EVIDENCE_ROOT="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic"
  REPAIR_MERGE=$(node -e \
    "const h=require('$HANDOFF');process.stdout.write(h.repairMergeSha)")
  cd "$SEMANTIC_ROOT"
  sha256sum \
    tools/test262/es2015-p1c-baseline.json \
    tools/test262/es2015-p1c-disposition.json \
    tools/test262/es2015-p1c-owner-deltas.json \
    tools/test262/es2015-p1c-owner-map.json \
    tools/test262/es2015-p1c-paths.json \
    tools/test262/es2015-p1c-promotion.json \
    tools/test262/es2015-audit-evidence.json \
    tools/test262/es2015-taxonomy.json \
    tools/test262/upstream-subset.json \
    docs/test262-report.jsonl \
    docs/conformance.md \
    tools/test262/es2015-provenance.json \
    > "$EVIDENCE_ROOT/final-sha256.txt"
  git show "$REPAIR_MERGE":tools/test262/es5-selection.json \
    > "$EVIDENCE_ROOT/repair-base-selection.json"
  cmp "$EVIDENCE_ROOT/repair-base-selection.json" \
    tools/test262/es5-selection.json
  node --input-type=module <<'JS'
  import { createHash } from 'node:crypto';
  import { readFileSync } from 'node:fs';
  import {
    canonicalRoadmapAuthoritySha256,
    parseEs2015ProvenanceManifest,
    roadmapAggregateProjectionSha256,
  } from './tools/test262/es2015-provenance.js';

  const sha256 = (text) =>
    createHash('sha256').update(text).digest('hex');
  const expected = new Map([
    ['tools/test262/es2015-p1c-baseline.json', '86e3ca7c89716f4624bf029816bfe41befbc0a86c0d67ffe7066d7d27e8ed9e4'],
    ['tools/test262/es2015-p1c-disposition.json', '662616db1c184b2475f091ef5c380760afacb298abae8cf6fe7fac0ae528d3bc'],
    ['tools/test262/es2015-p1c-owner-deltas.json', '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570'],
    ['tools/test262/es2015-p1c-owner-map.json', '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570'],
    ['tools/test262/es2015-p1c-paths.json', 'd7cd9512d5eb520b1ac9cbbbcc9414381d5de2b1c7de35fa891b5a100352d124'],
    ['tools/test262/es2015-p1c-promotion.json', '5c201d87dc4c0b7a18d3dce7e1c69933356f628008a6ef837eb5353641610501'],
    ['tools/test262/es2015-audit-evidence.json', '50f9a54346d0e9e5168a6ac6b0b8de6d709e2c5b808d6c8b036e5113612e638c'],
    ['tools/test262/es2015-taxonomy.json', 'fdf3c8bf229f6c841209e4c4a2196001d45cf0a1c270f334cf06e5f54a00f3c7'],
    ['tools/test262/upstream-subset.json', '5a5b83b3c28991c5f2ac141ed949a9698966cce85587d671a4417228d5e08b14'],
    ['docs/test262-report.jsonl', '89002c4b597748a53ccc4ea60df25d981660f4311cee1e933f95fd13b39e69ff'],
    ['docs/conformance.md', '9cc4250ed8a69e7d62e82ad7452bb2563c319856ed97a53bd00b96d0017c6cfe'],
    ['tools/test262/es2015-provenance.json', '55cea42748f5f2a2abc2228b7d33aa0f4d6c2ec9b55b2d96f40782eb565f396f'],
  ]);
  for (const [path, digest] of expected) {
    if (sha256(readFileSync(path, 'utf8')) !== digest) {
      throw new Error(`SHA-256 mismatch: ${path}`);
    }
  }

  const manifest = parseEs2015ProvenanceManifest(
    readFileSync('tools/test262/es2015-provenance.json', 'utf8'),
  );
  const p1c = manifest.roadmapAuthorities.find((entry) => entry.code === 'P1C');
  if (
    p1c?.state !== 'applied' ||
    canonicalRoadmapAuthoritySha256(p1c) !==
      '64db02e17f5d7e7f26805eee912d625b53a989e4c4ae17b15165bea3118bfefa' ||
    roadmapAggregateProjectionSha256(p1c) !==
      '6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813'
  ) {
    throw new Error('applied P1C identity mismatch');
  }

  const subset = JSON.parse(
    readFileSync('tools/test262/upstream-subset.json', 'utf8'),
  );
  const selected = new Set(
    subset.groups.flatMap((group) => group.paths),
  );
  const generatedNonT0 = new Set(
    subset.groups
      .filter((group) => group.name !== 'es2015/audit-passing-promotion')
      .flatMap((group) => group.paths),
  );
  const taxonomy = JSON.parse(
    readFileSync('tools/test262/es2015-taxonomy.json', 'utf8'),
  );
  const byPath = new Map(
    taxonomy.classifications.map((entry) => [entry.path, entry]),
  );
  const selectedVariants = [...selected].reduce(
    (total, path) => total + byPath.get(path).variants,
    0,
  );
  const audit = JSON.parse(
    readFileSync('tools/test262/es2015-audit-evidence.json', 'utf8'),
  );
  const selectedRow = taxonomy.statusTables.core.find(
    (row) => row.name === 'selected-passing',
  );
  const blockerRow = taxonomy.statusTables.core.find(
    (row) =>
      row.name === 'blocked:early-errors-and-declaration-instantiation',
  );
  if (
    subset.groups.length !== 62 ||
    selected.size !== 20672 ||
    generatedNonT0.size !== 14349 ||
    selectedVariants !== 39292 ||
    audit.auditRecords.length !== 21862 ||
    Object.keys(audit.blockers).length !== 5014 ||
    audit.intentionalDeviations.length !== 2 ||
    selectedRow?.roots !== 19845 ||
    selectedRow?.variants !== 37784 ||
    blockerRow?.roots !== 406 ||
    blockerRow?.variants !== 798
  ) {
    throw new Error('corrected P1C count mismatch');
  }
  JS
  ```

- [ ] **Step 16: Obtain fresh Task 5 specification review**

  Require review of exact unchanged evidence, exact corrected generated bytes,
  four-path closure, audit reversal, normal marker, state-only transition,
  downstream totals, docs, and repaired-BASE GREEN.

- [ ] **Step 17: Obtain fresh Task 5 code-quality review**

  Require a different reviewer to inspect generated/manual separation,
  deterministic scratch reproduction, test hostility, runtime scope, report
  ordering, audit history, command boundaries, and no broad local execution.

- [ ] **Step 18: Commit the corrected consumer**

  Stage every reviewed semantic/evidence/output/documentation path and commit:

  ```bash
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  cd "$SEMANTIC_ROOT"
  git add \
    .prettierignore \
    docs/architecture.md \
    docs/conformance.md \
    docs/test262-report.jsonl \
    docs/testing.md \
    test/ci/es2015-syntax-test262.test.js \
    test/node/es2015-m1.test.js \
    test/node/es2015-p1c.test.js \
    test/node/es2015-provenance.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/repository-invariants.test.js \
    test/node/upstream-select.test.js \
    tools/test262/es2015-audit-evidence.json \
    tools/test262/es2015-p1c-baseline.json \
    tools/test262/es2015-p1c-disposition.json \
    tools/test262/es2015-p1c-owner-deltas.json \
    tools/test262/es2015-p1c-owner-map.json \
    tools/test262/es2015-p1c-paths.json \
    tools/test262/es2015-p1c-promotion.json \
    tools/test262/es2015-p1c.js \
    tools/test262/es2015-provenance.json \
    tools/test262/es2015-taxonomy.json \
    tools/test262/upstream-subset.json
  git -c user.name='Copilot' \
    -c user.email='223556219+Copilot@users.noreply.github.com' \
    commit --author='Copilot <223556219+Copilot@users.noreply.github.com>' \
    -m 'test262: consume corrected P1C authority' \
    -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
  ```

  Rerun Steps 13-15 against the real commit SHA.

---

### Task 6: Review, Deliver, Merge, and Close the Corrected Consumer

**Files:**

- No additional planned tracked path
- Write ignored consumer PR/check/CodeQL/main/closure evidence
- Update GitHub issues #116, #78, #70, and #98 after merge
- Do not create a P1R issue

**Interfaces:**

- Consumes: Task 5 corrected consumer commit and Task 3 repair handoff.
- Produces: one fresh, fully green P1C consumer PR.
- Produces: squash merge, exact-main verification, and issue closure/accounting.
- Requires: no exception; repaired trusted BASE guard must pass.

- [ ] **Step 1: Start a fresh Task 6 delivery worker**

  Invoke `superpowers:subagent-driven-development`. Require evidence under:

  ```text
  .superpowers/sdd/2026-08-24-p1c-authority-repair/task-6/
  ```

- [ ] **Step 2: Reconcile exact live main and branch HEAD**

  Run:

  ```bash
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  HANDOFF="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/repair-delivery.json"
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  REPAIR_MERGE=$(node -e \
    "const h=require('$HANDOFF');process.stdout.write(h.repairMergeSha)")
  cd "$SEMANTIC_ROOT"
  git fetch origin main
  test "$(git rev-parse origin/main)" = "$REPAIR_MERGE"
  test "$(git merge-base "$REPAIR_MERGE" HEAD)" = "$REPAIR_MERGE"
  test -z "$(git status --short)"
  test "$(gh pr view 118 --repo yoonbuck/jsjs --json state,mergedAt --jq '.state + \":\" + (.mergedAt // \"null\")')" = \
    'CLOSED:null'
  ```

  If live main differs from the repair merge, do not push. The design pins the
  consumer marker to the repair merge; refresh the authority analysis instead
  of silently changing the marker base.

- [ ] **Step 3: Obtain fresh Task 6 specification, code-quality, and whole-consumer reviews**

  Require three fresh reviews on the exact consumer HEAD:

  1. a fresh specification review covering original P1C behavior plus the
     authority repair;
  2. a different fresh code-quality review covering the complete
     repair-merge-to-consumer range; and
  3. whole-branch security/correctness covering provenance, generated data,
     runtime semantics, and delivery.

  Every confirmed finding gets a focused RED test, Task 5 gate rerun, and all
  three reviews repeated on the new HEAD.

- [ ] **Step 4: Rerun exact final local gates and repaired-BASE validation**

  Rerun Task 5 Steps 13-15 from a clean tracked worktree. Save exact command
  output and the reviewed consumer HEAD. No broad/full local test command is
  permitted.

- [ ] **Step 5: Push and open a fresh consumer PR**

  Run:

  ```bash
  REPO=yoonbuck/jsjs
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  HANDOFF="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/repair-delivery.json"
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  EVIDENCE_ROOT="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic"
  REPAIR_MERGE=$(node -e \
    "const h=require('$HANDOFF');process.stdout.write(h.repairMergeSha)")
  cd "$SEMANTIC_ROOT"
  git fetch origin main
  test "$(git rev-parse origin/main)" = "$REPAIR_MERGE"
  CONSUMER_HEAD=$(git rev-parse HEAD)
  CONSUMER_MARKER=$(cat "$EVIDENCE_ROOT/consumer-marker.txt")
  git push -u origin yoonbuck-issue-116-p1c-rebuilt
  CONSUMER_PR_URL=$(gh pr create \
    --repo "$REPO" \
    --base main \
    --head yoonbuck-issue-116-p1c-rebuilt \
    --title 'Complete P1C catch-binding semantics on repaired authority' \
    --body "$CONSUMER_MARKER

  Tracks #116

  ## Recovery

  - PR #118 remains abandoned unmerged
  - replayed only the reviewed 23-commit pre-consumer semantic range
  - P1C evidence/source/disposition remains 81 roots / 161 variants
  - removed four ES2016 nested BindingRestElement roots from selection
  - added eight failed audit records and four provisional P1 blockers
  - corrected P1R accounting to 254 roots / 494 variants
  - consumed corrected pending P1C with aggregate 6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813

  ## Local boundary

  Focused P1C/runtime/provenance tests plus deterministic select/audit/report checks only; no broad/full local Test262 or full local CI.")
  CONSUMER_PR=$(gh pr view "$CONSUMER_PR_URL" \
    --repo "$REPO" --json number --jq .number)
  gh pr view "$CONSUMER_PR" --repo "$REPO" \
    --json number,url,baseRefOid,headRefOid \
    > "$EVIDENCE_ROOT/consumer-pr.json"
  REPAIR_MERGE="$REPAIR_MERGE" CONSUMER_HEAD="$CONSUMER_HEAD" \
    node - "$EVIDENCE_ROOT/consumer-pr.json" <<'JS'
  const fs = require('fs');
  const pr = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (
    pr.baseRefOid !== process.env.REPAIR_MERGE ||
    pr.headRefOid !== process.env.CONSUMER_HEAD
  ) {
    throw new Error(`consumer PR identity drift: ${JSON.stringify(pr)}`);
  }
  JS
  ```

- [ ] **Step 6: Require every consumer PR check green**

  Run:

  ```bash
  REPO=yoonbuck/jsjs
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  HANDOFF="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/repair-delivery.json"
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  EVIDENCE_ROOT="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic"
  REPAIR_MERGE=$(node -e \
    "const h=require('$HANDOFF');process.stdout.write(h.repairMergeSha)")
  CONSUMER_PR=$(gh pr list --repo "$REPO" \
    --head yoonbuck-issue-116-p1c-rebuilt \
    --base main \
    --state open \
    --json number \
    --jq 'if length == 1 then .[0].number else error("expected one consumer PR") end')
  while true; do
    gh pr checks "$CONSUMER_PR" --repo "$REPO" \
      --json name,state,bucket,link \
      > "$EVIDENCE_ROOT/consumer-checks.json"
    if node - "$EVIDENCE_ROOT/consumer-checks.json" <<'JS'
  const fs = require('fs');
  const checks = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  process.exit(checks.some((check) => check.bucket === 'pending') ? 1 : 0);
  JS
    then
      break
    fi
    sleep 30
  done
  node - "$EVIDENCE_ROOT/consumer-checks.json" <<'JS'
  const fs = require('fs');
  const checks = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const failures = checks.filter((check) =>
    ['fail', 'cancel'].includes(check.bucket),
  );
  if (failures.length !== 0) {
    throw new Error(`consumer checks failed: ${JSON.stringify(failures)}`);
  }
  if (
    !checks.some(
      (check) =>
        check.name === 'Provenance base guard' && check.bucket === 'pass',
    )
  ) {
    throw new Error('consumer provenance base guard did not pass');
  }
  JS
  ```

  Inspect the pinned subset, select, audit, selected-report, and provenance
  logs. No administrator exception applies to the consumer.

- [ ] **Step 7: Verify exact consumer HEAD CodeQL and zero alerts**

  Run:

  ```bash
  REPO=yoonbuck/jsjs
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  EVIDENCE_ROOT="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic"
  cd "$SEMANTIC_ROOT"
  CONSUMER_PR=$(gh pr list --repo "$REPO" \
    --head yoonbuck-issue-116-p1c-rebuilt \
    --base main \
    --state open \
    --json number \
    --jq 'if length == 1 then .[0].number else error("expected one consumer PR") end')
  REVIEWED_CONSUMER_HEAD=$(gh pr view "$CONSUMER_PR" \
    --repo "$REPO" --json headRefOid --jq .headRefOid)
  test "$REVIEWED_CONSUMER_HEAD" = "$(git rev-parse HEAD)"
  gh pr checks "$CONSUMER_PR" --repo "$REPO" \
    --json name,state,bucket,link \
    > "$EVIDENCE_ROOT/consumer-checks.json"
  node - "$EVIDENCE_ROOT/consumer-checks.json" <<'JS'
  const fs = require('fs');
  const checks = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const codeql = checks.filter((check) =>
    check.name.toLowerCase().includes('codeql'),
  );
  if (codeql.length < 2 || codeql.some((check) => check.bucket !== 'pass')) {
    throw new Error(`consumer CodeQL is not clean: ${JSON.stringify(codeql)}`);
  }
  JS
  printf '%s\n' "$REVIEWED_CONSUMER_HEAD" \
    > "$EVIDENCE_ROOT/reviewed-consumer-head.txt"
  gh api 'repos/yoonbuck/jsjs/code-scanning/alerts?state=open&per_page=100' \
    > "$EVIDENCE_ROOT/consumer-open-alerts.json"
  test "$(node -e \
    "const a=require('$EVIDENCE_ROOT/consumer-open-alerts.json');process.stdout.write(String(a.length))")" = 0
  ```

- [ ] **Step 8: Squash-merge the exact reviewed consumer HEAD**

  Run:

  ```bash
  REPO=yoonbuck/jsjs
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  EVIDENCE_ROOT="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic"
  CONSUMER_PR=$(gh pr list --repo "$REPO" \
    --head yoonbuck-issue-116-p1c-rebuilt \
    --base main \
    --state open \
    --json number \
    --jq 'if length == 1 then .[0].number else error("expected one consumer PR") end')
  REVIEWED_CONSUMER_HEAD=$(cat "$EVIDENCE_ROOT/reviewed-consumer-head.txt")
  CURRENT_CONSUMER_HEAD=$(gh pr view "$CONSUMER_PR" \
    --repo "$REPO" --json headRefOid --jq .headRefOid)
  test "$CURRENT_CONSUMER_HEAD" = "$REVIEWED_CONSUMER_HEAD"
  CURRENT_CONSUMER_BASE=$(gh pr view "$CONSUMER_PR" \
    --repo "$REPO" --json baseRefOid --jq .baseRefOid)
  git -C "$SEMANTIC_ROOT" fetch origin main
  test "$CURRENT_CONSUMER_BASE" = "$REPAIR_MERGE"
  test "$(git -C "$SEMANTIC_ROOT" rev-parse origin/main)" = "$REPAIR_MERGE"
  gh pr merge "$CONSUMER_PR" \
    --repo "$REPO" \
    --squash \
    --delete-branch \
    --match-head-commit "$REVIEWED_CONSUMER_HEAD"
  git -C "$SEMANTIC_ROOT" fetch origin main
  CONSUMER_MERGE=$(gh pr view "$CONSUMER_PR" \
    --repo "$REPO" --json mergeCommit --jq .mergeCommit.oid)
  test "$(git -C "$SEMANTIC_ROOT" rev-parse origin/main)" = "$CONSUMER_MERGE"
  ```

- [ ] **Step 9: Verify exact-main CI, CodeQL, and zero alerts**

  Run:

  ```bash
  REPO=yoonbuck/jsjs
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  EVIDENCE_ROOT="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic"
  CONSUMER_PR=$(gh pr list --repo "$REPO" \
    --head yoonbuck-issue-116-p1c-rebuilt \
    --state merged \
    --json number \
    --jq 'if length >= 1 then .[0].number else error("missing merged consumer PR") end')
  CONSUMER_MERGE=$(gh pr view "$CONSUMER_PR" \
    --repo "$REPO" --json mergeCommit --jq .mergeCommit.oid)
  for attempt in $(seq 1 60); do
    gh run list --repo "$REPO" --commit "$CONSUMER_MERGE" \
      --json databaseId,workflowName,status,conclusion,url \
      > "$EVIDENCE_ROOT/consumer-main-runs.json"
    if node - "$EVIDENCE_ROOT/consumer-main-runs.json" <<'JS'
  const fs = require('fs');
  const runs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  process.exit(
    runs.some(
      (run) => run.workflowName === 'CI' && run.conclusion === 'success',
    )
      ? 0
      : 1,
  );
  JS
    then
      break
    fi
    sleep 30
  done
  node - "$EVIDENCE_ROOT/consumer-main-runs.json" <<'JS'
  const fs = require('fs');
  const runs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (
    !runs.some(
      (run) => run.workflowName === 'CI' && run.conclusion === 'success',
    )
  ) {
    throw new Error('consumer merge lacks exact-main CI success');
  }
  JS
  gh api 'repos/yoonbuck/jsjs/code-scanning/analyses?per_page=100' \
    > "$EVIDENCE_ROOT/consumer-main-codeql.json"
  CONSUMER_MERGE="$CONSUMER_MERGE" \
    node - "$EVIDENCE_ROOT/consumer-main-codeql.json" <<'JS'
  const fs = require('fs');
  const analyses = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
    .filter((analysis) => analysis.commit_sha === process.env.CONSUMER_MERGE);
  if (analyses.length < 2) {
    throw new Error('consumer merge lacks both exact-main CodeQL analyses');
  }
  if (analyses.some((analysis) => analysis.error || analysis.warning)) {
    throw new Error('consumer exact-main CodeQL contains errors or warnings');
  }
  JS
  gh api 'repos/yoonbuck/jsjs/code-scanning/alerts?state=open&per_page=100' \
    > "$EVIDENCE_ROOT/consumer-main-alerts.json"
  test "$(node -e \
    "const a=require('$EVIDENCE_ROOT/consumer-main-alerts.json');process.stdout.write(String(a.length))")" = 0
  ```

- [ ] **Step 10: Run focused exact-main verification**

  Run:

  ```bash
  REPO=yoonbuck/jsjs
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  EVIDENCE_ROOT="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic"
  CONSUMER_PR=$(gh pr list --repo "$REPO" \
    --head yoonbuck-issue-116-p1c-rebuilt \
    --state merged \
    --json number \
    --jq 'if length >= 1 then .[0].number else error("missing merged consumer PR") end')
  CONSUMER_MERGE=$(gh pr view "$CONSUMER_PR" \
    --repo "$REPO" --json mergeCommit --jq .mergeCommit.oid)
  MAIN_VERIFY="$EVIDENCE_ROOT/main-verify"
  test ! -e "$MAIN_VERIFY"
  git -C "$SEMANTIC_ROOT" worktree add --detach \
    "$MAIN_VERIFY" \
    "$CONSUMER_MERGE"
  ln -s "$SEMANTIC_ROOT/node_modules" "$MAIN_VERIFY/node_modules"
  mkdir -p "$MAIN_VERIFY/vendor"
  ln -s "$SEMANTIC_ROOT/vendor/acorn" "$MAIN_VERIFY/vendor/acorn"
  ln -s "$SEMANTIC_ROOT/vendor/test262" "$MAIN_VERIFY/vendor/test262"
  cd "$MAIN_VERIFY"
  TZ=UTC npm run test262:es2015:p1c -- \
    --ledger=tools/test262/es2015-p1c-paths.txt \
    --output=.superpowers/sdd/2026-08-24-p1c-authority-repair/main-execution.json
  TZ=UTC npm run test262:select:check
  TZ=UTC npm run test262:es2015:audit:check
  TZ=UTC npm run test262:es2015:sync-promoted-report -- --check
  TZ=UTC npm run test262:es2015:provenance:check
  TZ=UTC node test/run-node.js \
    test/parser.test.js \
    test/catch-binding.test.js \
    test/node/es2015-p1c.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/es2015-provenance.test.js \
    test/node/repository-invariants.test.js
  test "$(sha256sum tools/test262/es2015-audit-evidence.json | cut -d' ' -f1)" = \
    50f9a54346d0e9e5168a6ac6b0b8de6d709e2c5b808d6c8b036e5113612e638c
  test "$(sha256sum tools/test262/es2015-taxonomy.json | cut -d' ' -f1)" = \
    fdf3c8bf229f6c841209e4c4a2196001d45cf0a1c270f334cf06e5f54a00f3c7
  test "$(sha256sum tools/test262/upstream-subset.json | cut -d' ' -f1)" = \
    5a5b83b3c28991c5f2ac141ed949a9698966cce85587d671a4417228d5e08b14
  test "$(sha256sum docs/test262-report.jsonl | cut -d' ' -f1)" = \
    89002c4b597748a53ccc4ea60df25d981660f4311cee1e933f95fd13b39e69ff
  test "$(sha256sum docs/conformance.md | cut -d' ' -f1)" = \
    9cc4250ed8a69e7d62e82ad7452bb2563c319856ed97a53bd00b96d0017c6cfe
  test "$(sha256sum tools/test262/es2015-provenance.json | cut -d' ' -f1)" = \
    55cea42748f5f2a2abc2228b7d33aa0f4d6c2ec9b55b2d96f40782eb565f396f
  node --input-type=module <<'JS'
  import { readFileSync } from 'node:fs';
  import {
    canonicalRoadmapAuthoritySha256,
    parseEs2015ProvenanceManifest,
    roadmapAggregateProjectionSha256,
  } from './tools/test262/es2015-provenance.js';
  const manifest = parseEs2015ProvenanceManifest(
    readFileSync('tools/test262/es2015-provenance.json', 'utf8'),
  );
  const p1c = manifest.roadmapAuthorities.find((entry) => entry.code === 'P1C');
  if (
    p1c?.state !== 'applied' ||
    canonicalRoadmapAuthoritySha256(p1c) !==
      '64db02e17f5d7e7f26805eee912d625b53a989e4c4ae17b15165bea3118bfefa' ||
    roadmapAggregateProjectionSha256(p1c) !==
      '6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813'
  ) {
    throw new Error('exact-main P1C authority mismatch');
  }
  JS
  ```

  The focused P1C and taxonomy tests must report the exact corrected counts.
  Keep `MAIN_VERIFY` until closure evidence is written.

- [ ] **Step 11: Publish issue evidence and close P1C**

  Run:

  ```bash
  REPO=yoonbuck/jsjs
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  HANDOFF="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/repair-delivery.json"
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  EVIDENCE_ROOT="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic"
  REPAIR_PR=$(node -e \
    "const h=require('$HANDOFF');process.stdout.write(String(h.repairPr))")
  REPAIR_MERGE=$(node -e \
    "const h=require('$HANDOFF');process.stdout.write(h.repairMergeSha)")
  CONSUMER_PR=$(gh pr list --repo "$REPO" \
    --head yoonbuck-issue-116-p1c-rebuilt \
    --state merged \
    --json number \
    --jq 'if length >= 1 then .[0].number else error("missing merged consumer PR") end')
  CONSUMER_MERGE=$(gh pr view "$CONSUMER_PR" \
    --repo "$REPO" --json mergeCommit --jq .mergeCommit.oid)
  REVIEWED_CONSUMER_HEAD=$(cat "$EVIDENCE_ROOT/reviewed-consumer-head.txt")
  ISSUE_116_COMMENT=$(gh issue comment 116 --repo "$REPO" --body \
    "P1C recovery is complete.

  - authority repair PR: #$REPAIR_PR / $REPAIR_MERGE
  - fresh consumer PR: #$CONSUMER_PR / $CONSUMER_MERGE
  - reviewed consumer HEAD: $REVIEWED_CONSUMER_HEAD
  - source/evidence/disposition: 81 roots / 161 variants, unchanged
  - collateral: four ES2016 BindingRestElement roots / eight expected parse failures
  - corrected outputs: audit 50f9a54346d0e9e5168a6ac6b0b8de6d709e2c5b808d6c8b036e5113612e638c; taxonomy fdf3c8bf229f6c841209e4c4a2196001d45cf0a1c270f334cf06e5f54a00f3c7; subset 5a5b83b3c28991c5f2ac141ed949a9698966cce85587d671a4417228d5e08b14; report 89002c4b597748a53ccc4ea60df25d981660f4311cee1e933f95fd13b39e69ff; conformance 9cc4250ed8a69e7d62e82ad7452bb2563c319856ed97a53bd00b96d0017c6cfe
  - protected aggregate: 6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813
  - applied P1C record: 64db02e17f5d7e7f26805eee912d625b53a989e4c4ae17b15165bea3118bfefa
  - PR #118: abandoned unmerged
  - exact PR/main CI, provenance guard, and both CodeQL categories: clean")
  printf '%s\n' "$ISSUE_116_COMMENT" > "$EVIDENCE_ROOT/issue-116-comment-url.txt"
  ISSUE_78_COMMENT=$(gh issue comment 78 --repo "$REPO" --body \
    "P1C/#116 is complete at \`$CONSUMER_MERGE\`.

  - live decomposition: 487 roots / 959 variants / 94467957a7d427219cfcbe301adef006052437c30a56533ef510e3dacbfbaf88
  - corrected P1R: 254 roots / 494 variants / 3a2356b36431b3553a65289afd03eb0aa1e88a36e78b3684cfb460eaf426c4d6
  - remaining post-P1C P1: 406 roots / 798 variants / 182c54ed6fbd4b290b11172809ddd5289bb45b16a07a2c1e4402b94fec2feba7
  - the four new roots remain provisional core P1 blockers until P1F/P1R
  - no P1R issue was created by this delivery")
  printf '%s\n' "$ISSUE_78_COMMENT" > "$EVIDENCE_ROOT/issue-78-comment-url.txt"
  ISSUE_70_COMMENT=$(gh issue comment 70 --repo "$REPO" --body \
    "P1C/#116 merged at \`$CONSUMER_MERGE\` after repair PR #$REPAIR_PR. The exact 81/161 semantic source is applied; four ES2016 collateral roots are excluded from selection and remain assigned to future P1R accounting.")
  printf '%s\n' "$ISSUE_70_COMMENT" > "$EVIDENCE_ROOT/issue-70-comment-url.txt"
  ISSUE_98_COMMENT=$(gh issue comment 98 --repo "$REPO" --body \
    "P1C conformance evidence merged at \`$CONSUMER_MERGE\`: 20,672 selected roots / 39,292 variants, exact four-root collateral correction, protected aggregate \`6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813\`, and exact-main CI/CodeQL clean.")
  printf '%s\n' "$ISSUE_98_COMMENT" > "$EVIDENCE_ROOT/issue-98-comment-url.txt"
  gh issue close 116 --repo "$REPO" --comment \
    "Closed after corrected P1C authority consumption, exact-main focused generated checks, all required CI, provenance guard, both CodeQL categories, and roadmap accounting updates."
  test "$(gh issue view 116 --repo "$REPO" --json state --jq .state)" = CLOSED
  test "$(gh issue view 78 --repo "$REPO" --json state --jq .state)" = OPEN
  ```

- [ ] **Step 12: Write closure evidence and clean temporary worktrees**

  Run:

  ```bash
  REPO=yoonbuck/jsjs
  REPAIR_ROOT=/home/jordan/jsjs/.worktrees/p1c-authority-repair
  HANDOFF="$REPAIR_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/repair-delivery.json"
  SEMANTIC_ROOT=/home/jordan/jsjs/.worktrees/p1c-catch-binding-rebuilt
  EVIDENCE_ROOT="$SEMANTIC_ROOT/.superpowers/sdd/2026-08-24-p1c-authority-repair/semantic"
  REPAIR_PR=$(node -e \
    "const h=require('$HANDOFF');process.stdout.write(String(h.repairPr))")
  REPAIR_MERGE=$(node -e \
    "const h=require('$HANDOFF');process.stdout.write(h.repairMergeSha)")
  CONSUMER_PR=$(gh pr list --repo "$REPO" \
    --head yoonbuck-issue-116-p1c-rebuilt \
    --state merged \
    --json number \
    --jq 'if length >= 1 then .[0].number else error("missing merged consumer PR") end')
  CONSUMER_MERGE=$(gh pr view "$CONSUMER_PR" \
    --repo "$REPO" --json mergeCommit --jq .mergeCommit.oid)
  REVIEWED_CONSUMER_HEAD=$(cat "$EVIDENCE_ROOT/reviewed-consumer-head.txt")
  REPAIR_PR="$REPAIR_PR" \
  REPAIR_MERGE="$REPAIR_MERGE" \
  CONSUMER_PR="$CONSUMER_PR" \
  CONSUMER_MERGE="$CONSUMER_MERGE" \
  REVIEWED_CONSUMER_HEAD="$REVIEWED_CONSUMER_HEAD" \
    node - "$EVIDENCE_ROOT/consumer-closure.json" <<'JS'
  const fs = require('fs');
  const read = (name) =>
    fs.readFileSync(`${process.argv[2].replace(/consumer-closure\.json$/u, '')}${name}`, 'utf8').trim();
  fs.writeFileSync(
    process.argv[2],
    `${JSON.stringify({
      repairPr: Number(process.env.REPAIR_PR),
      repairMergeSha: process.env.REPAIR_MERGE,
      consumerPr: Number(process.env.CONSUMER_PR),
      consumerReviewedHead: process.env.REVIEWED_CONSUMER_HEAD,
      consumerMergeSha: process.env.CONSUMER_MERGE,
      source: {
        roots: 81,
        variants: 161,
        pathSha256:
          'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5',
      },
      collateral: { roots: 4, variants: 8 },
      outputSha256: {
        audit:
          '50f9a54346d0e9e5168a6ac6b0b8de6d709e2c5b808d6c8b036e5113612e638c',
        taxonomy:
          'fdf3c8bf229f6c841209e4c4a2196001d45cf0a1c270f334cf06e5f54a00f3c7',
        subset:
          '5a5b83b3c28991c5f2ac141ed949a9698966cce85587d671a4417228d5e08b14',
        report:
          '89002c4b597748a53ccc4ea60df25d981660f4311cee1e933f95fd13b39e69ff',
        conformance:
          '9cc4250ed8a69e7d62e82ad7452bb2563c319856ed97a53bd00b96d0017c6cfe',
      },
      appliedRecordSha256:
        '64db02e17f5d7e7f26805eee912d625b53a989e4c4ae17b15165bea3118bfefa',
      appliedManifestSha256:
        '55cea42748f5f2a2abc2228b7d33aa0f4d6c2ec9b55b2d96f40782eb565f396f',
      aggregateProjectionSha256:
        '6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813',
      accounting: {
        p1r: {
          roots: 254,
          variants: 494,
          sha256:
            '3a2356b36431b3553a65289afd03eb0aa1e88a36e78b3684cfb460eaf426c4d6',
        },
        liveDecomposition: {
          roots: 487,
          variants: 959,
          sha256:
            '94467957a7d427219cfcbe301adef006052437c30a56533ef510e3dacbfbaf88',
        },
        remainingP1: {
          roots: 406,
          variants: 798,
          sha256:
            '182c54ed6fbd4b290b11172809ddd5289bb45b16a07a2c1e4402b94fec2feba7',
        },
      },
      issueComments: {
        issue116: read('issue-116-comment-url.txt'),
        issue78: read('issue-78-comment-url.txt'),
        issue70: read('issue-70-comment-url.txt'),
        issue98: read('issue-98-comment-url.txt'),
      },
      abandonedPr: 118,
      abandonedPrHead:
        'e937140d8b40e2599faf98a8e6b370982036e61d',
    }, null, 2)}\n`,
  );
  JS
  MAIN_VERIFY="$EVIDENCE_ROOT/main-verify"
  REPAIR_BASE_WORKTREE="$EVIDENCE_ROOT/repaired-base"
  git -C "$SEMANTIC_ROOT" worktree remove --force "$MAIN_VERIFY"
  git -C "$SEMANTIC_ROOT" worktree remove --force "$REPAIR_BASE_WORKTREE"
  ```

  Keep the old diagnostic commit/branch and do not rewrite history.

---

## Plan Self-Review Matrix

| Reviewed spec requirement                                     | Plan ownership                   |
| ------------------------------------------------------------- | -------------------------------- |
| Exact reviewed design HEAD and exact repair BASE              | Global constraints, Tasks 1-3    |
| Four ES2016 nested BindingRestElement roots                   | Stable interfaces, Tasks 1 and 4 |
| P1C source/evidence/disposition unchanged 81/161              | Global constraints, Tasks 1-6    |
| Audit exact replacement                                       | Tasks 1, 2, 4, and 5             |
| Taxonomy/subset exact replacement                             | Tasks 1, 2, 4, and 5             |
| Report/conformance remain project                             | Tasks 1, 2, 4, and 5             |
| Aggregate `6e92772f...`                                       | Tasks 1-6                        |
| Pending record `95036226...`                                  | Tasks 1-5                        |
| Pending manifest `5b94b819...`                                | Tasks 1-3                        |
| Applied record/manifest exact identities                      | Tasks 1, 4-6                     |
| Exact marker and marker SHA                                   | Tasks 2-3                        |
| Literal self-authorization rejection                          | Tasks 1-3                        |
| Ordinary PR HEAD only                                         | Tasks 2-3                        |
| No target/local activation                                    | Tasks 2-3                        |
| Exact BASE/merge-base/checker pins                            | Tasks 2-3                        |
| Exact six-path repair range                                   | Tasks 2-3                        |
| Immutable workflow/pipeline/policy/fragments/evidence/outputs | Tasks 2-3                        |
| No evidence/protected/runtime bytes in repair                 | Tasks 2-3                        |
| P1C stays pending in repair                                   | Tasks 1-3                        |
| Expected old BASE missing-marker failure only                 | Task 3                           |
| Explicit administrator exception only                         | Task 3                           |
| Design and plan in one repair PR                              | Tasks 2-3                        |
| Abandon PR #118                                               | Tasks 3 and 6                    |
| Repair PR CI/CodeQL/merge/exact-main/handoff                  | Task 3                           |
| Fresh branch and exact 23-commit preconsumer replay           | Task 4                           |
| No wholesale consumer-tail replay                             | Task 4                           |
| Checkout-independent inventory fix                            | Task 4                           |
| Isolated scratch fixture fix                                  | Task 4                           |
| Exact four-path execution/projection                          | Task 4                           |
| Exact-four audit historical reversal                          | Task 4                           |
| Corrected P1R/decomposition accounting                        | Tasks 4 and 6                    |
| Corrected scratch reproduces pending authority                | Task 4                           |
| Normal corrected pending-to-applied consumer                  | Task 5                           |
| Exact select/audit/report focused local gates                 | Task 5                           |
| No broad/full local execution                                 | Global constraints, Tasks 3-6    |
| Fresh worker/specification/quality reviews every task         | Every task                       |
| Fresh consumer PR, all checks green, no exception             | Task 6                           |
| Exact-main consumer verification                              | Task 6                           |
| #116 closure and #78/#70/#98 accounting                       | Task 6                           |

Interface flow is closed: Task 1 freezes the corrected authority contract;
Task 2 installs the exact one-use repair and pending record; Task 3 produces
the sole repaired-main handoff; Task 4 replays semantics and regenerates a
matching corrected scratch projection without tracked authority bytes; Task 5
applies those exact outputs and only the state transition; Task 6 delivers and
closes the fully green normal consumer.
