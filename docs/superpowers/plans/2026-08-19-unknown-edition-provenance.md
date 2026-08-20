# Unknown Test262 Edition Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reviewed provenance foundation, create the exact native U*
issue hierarchy, adjudicate all 2,312 unknown-edition roots in controlled
atomic batches, and close #75 only after deterministic reclassification and
graph verification.

**Architecture:** U0 adds a fail-closed, versioned provenance manifest,
independent per-batch decision fragments, deterministic renderer/check CLI, and
taxonomy integration without making a classification decision. After U0
merges, native issues are created idempotently from the checked-in graph.
Disjoint atomic batches then update only their source fragment before rebasing
onto sequential current main and regenerating shared taxonomy artifacts.

**Tech Stack:** Node.js 20 ES modules, existing jsjs test harness, JSON
manifests, SHA-256 canonicalization, generated GitHub Actions workflow, GitHub
REST/GraphQL through `gh`, pinned Test262 metadata/audit tooling.

## Global Constraints

- Start from jsjs `54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7`.
- Keep Test262 pinned to
  `b363f29d3c43c626dc852744ad64a0b48a003693`.
- Keep the Sixth Edition source identity
  `https://262.ecma-international.org/6.0/`, SHA-256
  `4d4243dc2f04c9cdd09498f2cc2af6f6cdc07b0430da5578e7cf440d4f7846a0`.
- Preserve base ledger `T1.paths.txt`: 2,312 roots / 4,054 variants, SHA-256
  `56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc`.
- Enforce 13 approved decision batches as one code-unit-sorted, complete,
  zero-overlap partition with the exact counts and hashes in the approved spec.
- Use issue-local codes U0, UA, UB, UL, UL1-UL4, US, and US1-US7; every marker
  includes parent T1 / #75.
- U0 owns tooling/data/docs only and makes zero classification decisions.
- #75, UL, and US are grouping nodes and own no commit.
- Atomic U* PRs may change taxonomy/provenance tooling, data, and documentation
  only. Never change guest runtime behavior.
- Do not modify `tools/test262/features.json` or enable broad feature selection.
- History, age, directory, and source similarity may prioritize review but
  never establish edition alone.
- Generate artifacts and timestamps with `TZ=UTC`.
- Local Test262 commands are metadata/audit or exact targeted paths only.
  Never run `npm run test262:upstream` or any broad upstream equivalent locally.
- Require independent specification and quality/provenance review for every
  atomic PR.
- Require exact-head CI and CodeQL before every merge.
- Use GPT-5.6-family models or Claude Opus 4.8 or lower; never Claude Opus 5.
- Create no issue except U0 before U0 merges.

---

## File Structure

### U0 repository files

- Create `tools/test262/es2015-provenance.js`: pure parsing,
  canonicalization, validation, batch partitioning, taxonomy-decision mapping,
  and issue rendering.
- Create `tools/test262/es2015-provenance-check.js`: Node filesystem/CLI
  boundary for initialization, checks, ledger rendering, issue rendering, and
  final decision integration.
- Create `tools/test262/es2015-provenance.json`: generated immutable source
  pins, base ledger identity, exact per-batch path/variant manifests, and graph
  definitions.
- Create `tools/test262/es2015-provenance-decisions/UA.json`,
  `UB.json`, `UL1.json`, `UL2.json`, `UL3.json`, `UL4.json`, `US1.json`,
  `US2.json`, `US3.json`, `US4.json`, `US5.json`, `US6.json`, and `US7.json`:
  independent decision fragments, empty in U0.
- Create `test/node/es2015-provenance.test.js`: pure and CLI contract tests.
- Modify `tools/test262/es2015-taxonomy.js`: accept reviewed provenance as an
  additional exact evidence input while preserving existing precedence.
- Modify `tools/test262/es2015-audit.js`: load and validate the manifest and
  decision fragments, then feed only accepted decisions to taxonomy.
- Modify `test/node/es2015-taxonomy.test.js`: prove empty provenance is neutral
  and reviewed decisions reclassify exact fixture paths only.
- Modify `test/run-node.js`: register the new Node-only suite.
- Modify `package.json`: add provenance write/check/render scripts.
- Modify `tools/ci/pipeline.js` and regenerate `.github/workflows/ci.yml`: run
  the provenance check before the taxonomy audit.
- Modify `test/node/workflow-contract.test.js`,
  `test/node/repository-invariants.test.js`, and
  `test/ci/full-contract.test.js`: lock scripts, generated ownership, CI
  command order, and no-production invariants.
- Modify `docs/testing.md` and `docs/conformance.md`: document provenance
  evidence, targeted-only local commands, and the unchanged unknown baseline.

### Post-U0 session artifacts

Store resumable GitHub mutation state outside the repository under
`$ARTIFACTS`, where
`ARTIFACTS=/Users/jordan/.copilot/session-state/a53ed448-8385-41f7-baa6-9a61ebd71c83/files`:

- `es2015-provenance-created-issues.json`: code to issue number, REST database
  ID, and GraphQL node ID.
- `es2015-provenance-rendered-issues/`: exact initial and final bodies.
- `es2015-provenance-live-graph.json`: live hierarchy, milestones,
  dependencies, titles, bodies, and state.
- `es2015-provenance-verification.json`: deterministic expected-vs-live result.

These artifacts aid resumption; durable issue markers and body equality remain
the authoritative idempotency keys.

---

### Task 1: Create Only the U0 Foundation Issue

**Files:**

- Read: `docs/superpowers/specs/2026-08-19-unknown-edition-provenance-design.md`
- Read: `docs/superpowers/plans/2026-08-19-unknown-edition-provenance.md`
- Create outside repo:
  `$ARTIFACTS/es2015-provenance-rendered-issues/U0.initial.md`

**Interfaces:**

- Consumes: approved spec commit and approved plan commit.
- Produces: one ES2015-milestoned U0 issue, natively attached to #75; no other
  U* issue exists yet.

- [ ] **Step 1: Verify approval and source state**

Run:

```bash
git status --short --branch
git rev-parse 54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7
git merge-base --is-ancestor 54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7 HEAD
gh issue view 75 --repo yoonbuck/jsjs --json number,state,milestone,title
```

Expected: clean worktree, baseline is an ancestor, #75 is open in milestone
ES2015.

- [ ] **Step 2: Render the exact U0 body**

Write the body through `apply_patch` to the artifact path. It must begin with:

```markdown
<!-- es2015-provenance parent:T1 parent-issue:75 code:U0 base-ledger-sha256:56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc -->

Parent: #75 / T1
Delivery: atomic tooling/docs
Base: 2,312 roots / 4,054 variants
```

Include exact source pins, one-PR boundary, schema/manifest/validator/renderer
scope, zero-decision acceptance, no-production and no-selection non-goals,
independent review gates, `TZ=UTC`, targeted-only local Test262 policy, and
exact-head CI/CodeQL.

- [ ] **Step 3: Check idempotency before creation**

Run:

```bash
gh api --paginate 'repos/yoonbuck/jsjs/issues?state=all&per_page=100' \
  --jq '.[] | select(.body != null and (.body | contains("code:U0 base-ledger-sha256:56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc"))) | [.number,.id,.node_id,.title,.state] | @tsv'
```

Expected: zero rows on first execution or exactly one matching U0 issue on
resume. More than one is a hard stop.

- [ ] **Step 4: Create U0 through the issue tool**

Call `create_issue` with:

- title: `Build unknown-edition Test262 provenance manifests and validator`
- body: exact bytes from `U0.initial.md`
- repo: `yoonbuck/jsjs`

Do not create UA, UB, UL, US, or any nested issue.

- [ ] **Step 5: Apply milestone and native parent**

Read the created issue's REST `id`, then run:

```bash
gh api --method PATCH repos/yoonbuck/jsjs/issues/$U0_NUMBER -F milestone=1
gh api --method POST repos/yoonbuck/jsjs/issues/75/sub_issues \
  -F sub_issue_id="$U0_REST_ID"
```

Expected: U0 is a direct sub-issue of #75 and has milestone ES2015.

- [ ] **Step 6: Verify the single-node mutation**

Run:

```bash
gh api repos/yoonbuck/jsjs/issues/$U0_NUMBER
gh api --paginate repos/yoonbuck/jsjs/issues/75/sub_issues
gh api --paginate repos/yoonbuck/jsjs/issues/75/dependencies/blocked_by
```

Expected: U0 body bytes and milestone match, #75 now has only U0 among U*
children, and closed #74 remains in #75's blocked-by history.

---

### Task 2: Implement the Pure Provenance Contract

**Files:**

- Create: `tools/test262/es2015-provenance.js`
- Create: `test/node/es2015-provenance.test.js`

**Interfaces:**

- Consumes: taxonomy classification records shaped as
  `{ path, variants, partition, finalClass, features, flags, includes }`.
- Produces:
  - `parseEs2015ProvenanceManifest(text): ProvenanceManifest`
  - `parseEs2015DecisionFragment(text, expectedCode): DecisionFragment`
  - `buildProvenanceFoundation(classifications): ProvenanceManifest`
  - `validateProvenanceFoundation(manifest, classifications): void`
  - `validateDecisionFragments(manifest, fragments, options): ReadonlyMap<string, ProvenanceDecision>`
  - `canonicalDecisionSha256(decision): string`
  - `renderBatchLedger(manifest, code): string`
  - `renderProvenanceIssueBody(manifest, code, issueMap): string`

- [ ] **Step 1: Write parser and exact-key failure tests**

Add test cases with inline fixture JSON that assert:

```js
assertThrows(
  () => parseEs2015ProvenanceManifest('{}'),
  Es2015ProvenanceError,
  'tools/test262/es2015-provenance.json must contain exact keys',
);
assertThrows(
  () => parseEs2015DecisionFragment('{"version":1}', 'UA'),
  Es2015ProvenanceError,
  'UA decision fragment must contain exact keys',
);
```

Also cover wrong schema version, source repository/revision, Sixth Edition URL
or hash, parent code/issue, unknown U* code, and duplicate JSON list values.

- [ ] **Step 2: Run the focused test and observe RED**

Run:

```bash
node test/run-node.js test/node/es2015-provenance.test.js
```

Expected: module-not-found failure for
`tools/test262/es2015-provenance.js`.

- [ ] **Step 3: Implement constants, types, and strict parsers**

Define and export:

```js
export const ES2015_PROVENANCE_VERSION = 1;
export const ES2015_PROVENANCE_FILE = 'tools/test262/es2015-provenance.json';
export const ES2015_PROVENANCE_DECISION_CODES = Object.freeze([
  'UA',
  'UB',
  'UL1',
  'UL2',
  'UL3',
  'UL4',
  'US1',
  'US2',
  'US3',
  'US4',
  'US5',
  'US6',
  'US7',
]);
export class Es2015ProvenanceError extends Error {}
```

Use exact-key validators matching existing taxonomy conventions. Reject
unknown fields instead of ignoring them.

- [ ] **Step 4: Write partition, ordering, and hash failure tests**

Build a small fixture with two unknown records and assert failures for:

- unsorted base paths;
- duplicate paths within one batch;
- overlap across two batches;
- a missing base path;
- an unexpected non-base path;
- wrong root count, variant count, batch hash, or base hash; and
- wrong selector-to-code assignment.

Assert the successful fixture returns code-unit-sorted ledgers with a final
newline.

- [ ] **Step 5: Run the focused test and observe the new RED failures**

Run:

```bash
node test/run-node.js test/node/es2015-provenance.test.js
```

Expected: parser tests pass; partition tests fail because foundation
construction and validation are not implemented.

- [ ] **Step 6: Implement exact batch selection and foundation validation**

Implement the approved selectors exactly. Use `Buffer.compare` or the existing
code-unit comparator consistently; do not use locale ordering. Hash
`paths.join('\n') + '\n'`.

`buildProvenanceFoundation` must derive all 13 batch entries from records whose
partition is exactly `unknown-edition`. `validateProvenanceFoundation` must
recompute selectors, counts, hashes, overlap, union, and base ledger bytes.

- [ ] **Step 7: Write canonical decision and evidence tests**

Use this complete decision fixture shape:

```js
const decisionWithoutHash = {
  path: 'test/language/example.js',
  variants: 2,
  priorClass: 'unknown-edition',
  finalPartition: 'core',
  finalStatus: 'blocked:remaining-language-runtime-semantics',
  evidenceKind: 'sixth-edition-clause',
  specification: {
    source: 'https://262.ecma-international.org/6.0/',
    sourceSha256:
      '4d4243dc2f04c9cdd09498f2cc2af6f6cdc07b0430da5578e7cf440d4f7846a0',
    clause: '12.3.1',
    anchor: 'sec-identifiers',
  },
  metadata: {
    es5id: null,
    es6id: null,
    esid: 'pending',
    features: [],
    includeFeatures: [],
    includes: [],
    flags: [],
  },
  history: [
    {
      repository: 'https://github.com/tc39/test262.git',
      commit: '0123456789012345678901234567890123456789',
      note: 'Corroborating history only.',
    },
  ],
  rationale: 'The asserted semantics are required by Sixth Edition 12.3.1.',
  review: {
    reviewer: 'copilot-provenance-review',
    reviewedAt: '2026-08-20T00:00:00Z',
    artifact: 'https://github.com/yoonbuck/jsjs/pull/123#issuecomment-1',
  },
  destination: {
    blocker: 'remaining-language-runtime-semantics',
    issue: 96,
  },
};
const decision = {
  ...decisionWithoutHash,
  artifactSha256: canonicalDecisionSha256(decisionWithoutHash),
};
```

Assert rejection for history-only evidence, missing include-feature closure,
non-UTC timestamps, malformed review URLs, self-hash drift, invalid
partition/status pairs, unknown blockers, and missing destination issue.

- [ ] **Step 8: Implement canonical records and fragment validation**

Canonicalize JSON recursively with fixed key order defined by the parser.
Calculate `artifactSha256` from the canonical record with that field omitted.
Return immutable objects.

Support `options = { allowPendingReview: false, requireCompleteCodes: [] }`.
Normal and CI checks always use `allowPendingReview: false`. Draft preparation
may set it true, but complete-code validation still requires every batch path.

- [ ] **Step 9: Write issue-rendering tests**

Assert every rendered body contains:

- T1 / #75 plus issue-local code marker;
- base and batch counts/hashes;
- pins, scope, non-goals, evidence method;
- no-production and history-alone prohibitions;
- review, UTC, targeted-only Test262, exact-head CI, and CodeQL gates; and
- actual issue-number dependencies once `issueMap` is supplied.

Assert UL and US say "owns no commit" and U0 says "zero classification
decisions."

- [ ] **Step 10: Implement deterministic ledger and body renderers**

Render exact Markdown with `\n` line endings and one final newline. Reject a
missing code or incomplete issue map rather than leaving placeholders.

- [ ] **Step 11: Run focused tests to GREEN**

Run:

```bash
node test/run-node.js test/node/es2015-provenance.test.js
```

Expected: every provenance unit test passes.

- [ ] **Step 12: Commit the pure contract**

```bash
git add tools/test262/es2015-provenance.js \
  test/node/es2015-provenance.test.js
git commit -m "Add deterministic ES2015 provenance contract" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Integrate Reviewed Provenance with Taxonomy

**Files:**

- Modify: `tools/test262/es2015-taxonomy.js:255-342,448-590`
- Modify: `tools/test262/es2015-audit.js:132-260`
- Modify: `test/node/es2015-taxonomy.test.js`
- Modify: `test/node/es2015-provenance.test.js`

**Interfaces:**

- Consumes:
  `reviewedProvenance: ReadonlyMap<string, ProvenanceDecision>` from Task 2.
- Produces:
  `classifyEs2015Inventory({ ..., reviewedProvenance })`, where exact reviewed
  decisions can supply edition/partition evidence but existing later-dependency
  precedence and status evidence remain authoritative.

- [ ] **Step 1: Write neutral-empty-map tests**

Classify the existing fixture taxonomy with and without
`reviewedProvenance: new Map()` and assert byte-identical rendered taxonomy and
summary.

- [ ] **Step 2: Write exact-path reclassification tests**

Add fixtures proving:

- a Sixth Edition decision moves only its named root from unknown to core;
- an Annex B decision moves only its named root to `annex-b`;
- a later-spec decision moves only its named root to
  `later-or-non-es2015`;
- a decision cannot override current later feature/include/flag evidence;
- a core decision's recorded status must equal selected/audit/blocker/deviation
  evidence already supplied to the classifier; and
- a decision for a non-unknown prior class is rejected.

- [ ] **Step 3: Run focused tests to confirm RED**

Run:

```bash
node test/run-node.js \
  test/node/es2015-provenance.test.js \
  test/node/es2015-taxonomy.test.js
```

Expected: reviewed-provenance option is ignored or rejected, causing exact
reclassification assertions to fail.

- [ ] **Step 4: Add reviewed provenance to classification context**

Normalize `reviewedProvenance` with the same map-or-record conventions as
selected/audit evidence. For an exact reviewed root:

1. retain malformed and harness structural precedence;
2. retain current later feature/include/flag/path precedence;
3. use the reviewed final partition as affirmative edition evidence;
4. calculate current status from selection, audit, blocker, and deviation
   inputs;
5. compare calculated partition/status with the decision; and
6. add `review:<code>:<artifactSha256>` to classification provenance.

Throw `Es2015TaxonomyError` on any mismatch.

- [ ] **Step 5: Add provenance loading to the audit boundary**

Extend audit dependencies with:

```js
readProvenanceManifest: () => Promise<string>
readDecisionFragments: () => Promise<ReadonlyMap<string, string>>
```

Parse and validate them before calling `classifyEs2015Inventory`. In U0 all 13
fragments are empty, so taxonomy bytes and counts must remain unchanged.

- [ ] **Step 6: Run focused taxonomy tests to GREEN**

Run:

```bash
node test/run-node.js \
  test/node/es2015-provenance.test.js \
  test/node/es2015-taxonomy.test.js
```

Expected: all tests pass, including unchanged empty-foundation output.

- [ ] **Step 7: Commit taxonomy plumbing**

```bash
git add tools/test262/es2015-taxonomy.js \
  tools/test262/es2015-audit.js \
  test/node/es2015-taxonomy.test.js \
  test/node/es2015-provenance.test.js
git commit -m "Integrate reviewed provenance with ES2015 taxonomy" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Generate and Check the Exact Foundation

**Files:**

- Create: `tools/test262/es2015-provenance-check.js`
- Create: `tools/test262/es2015-provenance.json`
- Create: `tools/test262/es2015-provenance-decisions/UA.json`
- Create: `tools/test262/es2015-provenance-decisions/UB.json`
- Create: `tools/test262/es2015-provenance-decisions/UL1.json`
- Create: `tools/test262/es2015-provenance-decisions/UL2.json`
- Create: `tools/test262/es2015-provenance-decisions/UL3.json`
- Create: `tools/test262/es2015-provenance-decisions/UL4.json`
- Create: `tools/test262/es2015-provenance-decisions/US1.json`
- Create: `tools/test262/es2015-provenance-decisions/US2.json`
- Create: `tools/test262/es2015-provenance-decisions/US3.json`
- Create: `tools/test262/es2015-provenance-decisions/US4.json`
- Create: `tools/test262/es2015-provenance-decisions/US5.json`
- Create: `tools/test262/es2015-provenance-decisions/US6.json`
- Create: `tools/test262/es2015-provenance-decisions/US7.json`
- Modify: `test/node/es2015-provenance.test.js`

**Interfaces:**

- Consumes: checked-in `tools/test262/es2015-taxonomy.json`.
- Produces CLI:
  - `node tools/test262/es2015-provenance-check.js --initialize`
  - `node tools/test262/es2015-provenance-check.js --check`
  - `node tools/test262/es2015-provenance-check.js --check --complete=UA`
  - `node tools/test262/es2015-provenance-check.js --render-ledger=UA`
  - `node tools/test262/es2015-provenance-check.js --render-issue=UA --issue-map=/Users/jordan/.copilot/session-state/a53ed448-8385-41f7-baa6-9a61ebd71c83/files/es2015-provenance-created-issues.json`

- [ ] **Step 1: Write CLI option and drift tests**

Inject filesystem dependencies as in `es2015-audit.js`. Assert:

- unknown or conflicting options fail;
- missing `TZ=UTC` fails;
- `--initialize` renders one manifest and 13 empty fragments;
- `--check` reports exact path on byte drift;
- `--complete=CODE` requires all batch decisions;
- `--render-ledger` emits exact sorted bytes; and
- `--render-issue` rejects missing final issue-map entries.

- [ ] **Step 2: Run focused tests to confirm RED**

```bash
TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js
```

Expected: CLI module-not-found failure.

- [ ] **Step 3: Implement the filesystem boundary**

Use `readFile`, `readdir`, and `writeFile` only in this module. Default
`--check` reads every expected fragment and rejects extra JSON files in the
decision directory. `--initialize` refuses to overwrite a non-empty fragment.

- [ ] **Step 4: Generate the foundation under UTC**

Run:

```bash
TZ=UTC node tools/test262/es2015-provenance-check.js --initialize
TZ=UTC node tools/test262/es2015-provenance-check.js --check
```

Expected exact foundation:

```text
UA 314 323 d29150e412486095bac0103f5d7e913917269870a9769cd8343a5cc9638af98e
UB 32 64 4e21b1884213e2831ffe58fb5c5128f17d417168aeabeac3c3817f8f6350623a
UL1 434 835 1bad4b5aed5f665cfcd270a57c90553b1fe4a1dabb1334fa950527b1113b937a
UL2 182 364 b5e8412e46d0bb2d976de247d312269b9ac34fa9cda77d15a2aa11c1eb0abb45
UL3 109 212 af158f399b1827dd2012030fbec2fdbbb28f184c011a310550928eb718dca406
UL4 48 48 9316f73cad2c6608ad14d6e837e5383100bb2ebd0a4feb2ba9f198ee35e5d3ac
US1 210 406 63ff657590ebb5aa167c19975344817789a9a67b820ce0092f990376afa873f7
US2 176 352 3b3db618ae579287c0cbe5a77124c883c3129395bf83fe7523dc1f32e3fe7d15
US3 99 190 42d21ddbd59de80f8c14b1508c3502c8c0bc023061ff24c16160f1bfaec7daa1
US4 176 318 19bc8b322158aa59af8d0b5efd38cf58885be50fdb6394b56cc94a2b94754c0b
US5 306 540 fdc5ed38ef91366ee6bd9f8aa8d49917b5d9bbc2746cfd62a50f22a22cd03df5
US6 48 89 90dfecd04460d739d4a7242b6ff14c4ef83abcf3e73d7893b392138372ce1cf1
US7 178 313 1e2cda5adef593ae134f0ab0e759091f57522821460c904c7f44c4217c891e28
TOTAL 2312 4054
```

- [ ] **Step 5: Prove all fragments are empty and taxonomy unchanged**

Run:

```bash
node -e '
const fs=require("fs");
for (const file of fs.readdirSync("tools/test262/es2015-provenance-decisions")) {
  const value=JSON.parse(fs.readFileSync(`tools/test262/es2015-provenance-decisions/${file}`));
  if (value.decisions.length !== 0) throw new Error(`${file} is not empty`);
}'
git diff --exit-code 54010d4 -- tools/test262/es2015-taxonomy.json
```

Expected: zero decisions and no taxonomy diff from the required baseline.

- [ ] **Step 6: Run focused tests to GREEN**

```bash
TZ=UTC node test/run-node.js test/node/es2015-provenance.test.js
```

Expected: all parser, partition, record, renderer, and CLI tests pass.

- [ ] **Step 7: Commit generated foundation**

```bash
git add tools/test262/es2015-provenance-check.js \
  tools/test262/es2015-provenance.json \
  tools/test262/es2015-provenance-decisions \
  test/node/es2015-provenance.test.js
git commit -m "Generate exact unknown-edition provenance batches" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Wire U0 into Repository Contracts and Documentation

**Files:**

- Modify: `test/run-node.js:20-82`
- Modify: `package.json:5-44`
- Modify: `tools/ci/pipeline.js:400-420`
- Modify: `.github/workflows/ci.yml`
- Modify: `test/node/workflow-contract.test.js`
- Modify: `test/node/repository-invariants.test.js:47-50,152-160,926-980,1584-1610`
- Modify: `test/ci/full-contract.test.js`
- Modify: `docs/testing.md`
- Modify: `docs/conformance.md`

**Interfaces:**

- Consumes: U0 CLI from Task 4.
- Produces npm scripts:
  - `test262:es2015:provenance`
  - `test262:es2015:provenance:check`
  - `test262:es2015:provenance:ledger`

- [ ] **Step 1: Write repository-contract failures first**

Add assertions that:

```js
manifest.scripts['test262:es2015:provenance'] ===
  'node tools/test262/es2015-provenance-check.js --initialize';
manifest.scripts['test262:es2015:provenance:check'] ===
  'node tools/test262/es2015-provenance-check.js --check';
```

Assert the new Node suite is registered, provenance JSON is generated-owned,
CI runs provenance check before taxonomy audit, and no changed path begins with
`src/`.

- [ ] **Step 2: Run contract tests to confirm RED**

```bash
node test/run-node.js \
  test/node/repository-invariants.test.js \
  test/node/workflow-contract.test.js
```

Expected: failures for missing scripts, suite registration, ownership, and CI
step.

- [ ] **Step 3: Register scripts and suite**

Add package scripts and import/register
`test/node/es2015-provenance.test.js` in `test/run-node.js`. The ledger script
must require `--render-ledger` plus a caller-supplied code; do not hard-code one
batch.

- [ ] **Step 4: Add the generated CI check**

In `tools/ci/pipeline.js`, add:

```js
runStep(
  'Check unknown-edition provenance',
  'npm run test262:es2015:provenance:check',
  { TZ: 'UTC' },
),
```

Place it immediately before the existing ES2015 taxonomy/audit check. Regenerate:

```bash
npm run ci:generate
npm run ci:check
```

- [ ] **Step 5: Update documentation**

Document:

- immutable base ledger and 13 batch identities;
- U0 empty-decision guarantee;
- decision evidence/review fields;
- `TZ=UTC npm run test262:es2015:provenance:check`;
- exact ledger rendering;
- draft review behavior versus strict CI;
- local prohibition on broad upstream Test262; and
- unchanged U0 taxonomy counts of 2,312 / 4,054 unknown.

- [ ] **Step 6: Run focused contracts to GREEN**

```bash
TZ=UTC node test/run-node.js \
  test/node/es2015-provenance.test.js \
  test/node/es2015-taxonomy.test.js \
  test/node/repository-invariants.test.js \
  test/node/workflow-contract.test.js
npm run ci:check
```

Expected: all pass.

- [ ] **Step 7: Run the complete safe local U0 validation**

```bash
TZ=UTC npm run test262:es2015:provenance:check
TZ=UTC npm run test262:es2015:audit:check
npm run test:node
npm run ci:contract
npm run typecheck
npm run lint
npm run format
git diff --check
```

Do not run `test262:upstream` locally. Expected: all commands pass and taxonomy
still reports 2,312 / 4,054 unknown.

- [ ] **Step 8: Commit repository integration**

```bash
git add package.json test/run-node.js tools/ci/pipeline.js \
  .github/workflows/ci.yml test/node/workflow-contract.test.js \
  test/node/repository-invariants.test.js test/ci/full-contract.test.js \
  docs/testing.md docs/conformance.md
git commit -m "Enforce provenance foundation in CI" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Review, Merge, and Close U0

**Files:**

- No new planned repository files.
- Update GitHub U0 issue and U0 pull request.

**Interfaces:**

- Consumes: completed U0 commits and U0 issue number.
- Produces: one reviewed, exact-head-clean, merged U0 PR and closed U0 issue.

- [ ] **Step 1: Verify the final U0 range and no-production invariant**

```bash
git status --short --branch
git --no-pager diff --stat 54010d4...HEAD
git --no-pager diff --name-only 54010d4...HEAD
test -z "$(git diff --name-only 54010d4...HEAD -- src/)"
git diff --exit-code 54010d4...HEAD -- tools/test262/features.json \
  tools/test262/upstream-subset.json
TZ=UTC npm run test262:es2015:provenance:check
TZ=UTC npm run test262:es2015:audit:check
```

Expected: no `src/`, feature, selection, or classification-decision changes;
unknown remains exactly 2,312 / 4,054.

- [ ] **Step 2: Re-render and synchronize the U0 body**

Render U0 through the implemented CLI with an issue map containing #75 and the
actual U0 identity. Update U0 if its initial manually rendered body differs,
then re-read it and compare SHA-256 with the local rendered file. The final
body must contain actual issue numbers and no unresolved marker.

- [ ] **Step 3: Obtain independent specification review**

Invoke a fresh `rubber-duck` reviewer using GPT-5.6 Sol. Give it the approved
spec, plan, U0 issue body, and `54010d4...HEAD` diff. Require explicit findings
for source pins, exact partition, zero decisions, evidence schema, native graph
renderer, targeted-only policy, and no-production boundary.

Fix every valid finding and rerun Task 5 Step 7.

- [ ] **Step 4: Obtain independent quality/provenance review**

Invoke a fresh `code-review` reviewer using GPT-5.6 Sol against
`54010d4...HEAD`. Require high-confidence correctness, fail-closed behavior,
canonical hashing, generated drift, path union/overlap, and CI integration
review.

Fix every valid finding and rerun Task 5 Step 7.

- [ ] **Step 5: Push and create the U0 PR**

```bash
git push -u origin yoonbuck-issue-75-provenance-ledger
```

Call `create_pull_request` with a title beginning `Build unknown-edition
provenance foundation`, body linking #75 and U0, exact base ledger/hash,
zero-decision statement, review summaries, commands, and
`Closes #$U0_NUMBER` after resolving the actual issue number.

- [ ] **Step 6: Record the exact reviewed head**

```bash
PR_NUMBER=$(gh pr view --json number --jq .number)
REVIEWED_HEAD=$(gh pr view "$PR_NUMBER" --json headRefOid --jq .headRefOid)
printf '%s\n' "$REVIEWED_HEAD"
```

Post specification and quality/provenance review evidence to the PR or U0
issue. Record their durable GitHub URLs.

- [ ] **Step 7: Require exact-head CI and CodeQL**

```bash
gh run list --branch yoonbuck-issue-75-provenance-ledger \
  --json databaseId,workflowName,headSha,status,conclusion,event --limit 30
```

Select only runs whose `headSha == REVIEWED_HEAD`, then:

```bash
gh run watch "$CI_RUN_ID" --exit-status
gh run watch "$CODEQL_RUN_ID" --exit-status
test "$(gh pr view "$PR_NUMBER" --json headRefOid --jq .headRefOid)" = "$REVIEWED_HEAD"
gh pr checks "$PR_NUMBER" --required
```

Expected: CI and CodeQL both succeed at the unchanged reviewed head.

- [ ] **Step 8: Squash merge and verify main**

```bash
gh pr merge "$PR_NUMBER" --squash
gh pr view "$PR_NUMBER" --json state,mergedAt,mergeCommit
git fetch origin main
MERGE_SHA=$(gh pr view "$PR_NUMBER" --json mergeCommit --jq .mergeCommit.oid)
git merge-base --is-ancestor "$MERGE_SHA" origin/main
```

Expected: merged PR and merge SHA on `origin/main`.

- [ ] **Step 9: Publish U0 closure evidence**

Post to U0:

- reviewed head, CI run, CodeQL run, PR, and merge SHA;
- manifest/base/batch hashes;
- exact 2,312 / 4,054 unchanged classification;
- zero decisions across 13 fragments;
- no `src/`, feature, or selection changes; and
- exact post-merge provenance/audit check results.

Close U0 only after the evidence comment is durable.

---

### Task 7: Refresh and Render the Post-U0 Native Hierarchy

**Files:**

- Read from merged main:
  `tools/test262/es2015-provenance.json`
- Create outside repo:
  `$ARTIFACTS/es2015-provenance-rendered-issues/*.md`
- Create outside repo:
  `$ARTIFACTS/es2015-provenance-created-issues.json`

**Interfaces:**

- Consumes: merged U0 CLI and exact current `origin/main`.
- Produces: exact initial/final bodies and an idempotent code-to-issue map for
  UA, UB, UL, UL1-UL4, US, and US1-US7.

- [ ] **Step 1: Start a clean post-U0 session from current main**

Use an app-native worktree session. Verify:

```bash
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short --branch
TZ=UTC npm run test262:es2015:provenance:check
TZ=UTC npm run test262:es2015:audit:check
```

Expected: HEAD equals current main, worktree clean, exact base partition still
2,312 / 4,054.

- [ ] **Step 2: Render every batch ledger and body**

For each code:

```bash
TZ=UTC node tools/test262/es2015-provenance-check.js \
  --render-ledger="$CODE" > "$ARTIFACTS/$CODE.paths.txt"
shasum -a 256 "$ARTIFACTS/$CODE.paths.txt"
TZ=UTC node tools/test262/es2015-provenance-check.js \
  --render-issue="$CODE" > \
  "$ARTIFACTS/es2015-provenance-rendered-issues/$CODE.initial.md"
```

Render grouping bodies for UL and US through the same CLI. Assert all approved
hashes and totals before any issue mutation.

- [ ] **Step 3: Search for existing marker matches**

For every code, query all issue states by marker:

```bash
gh api --paginate 'repos/yoonbuck/jsjs/issues?state=all&per_page=100' \
  --jq --arg marker "parent:T1 parent-issue:75 code:$CODE" \
  '.[] | select(.body != null and (.body | contains($marker))) |
   {number,id,node_id,title,state,milestone:(.milestone.title // null)}'
```

Expected: U0 has exactly one closed match; every other code has zero or one
match. Abort on duplicates.

- [ ] **Step 4: Build the resumable issue map**

Write canonical JSON:

```json
{
  "version": 1,
  "parent": 75,
  "baseLedgerSha256": "56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc",
  "issues": {
    "U0": {
      "number": 0,
      "id": 0,
      "nodeId": "I_...",
      "state": "closed"
    }
  }
}
```

Populate discovered nodes; leave uncreated codes absent rather than using
sentinel numbers.

---

### Task 8: Create, Wire, and Verify the Remaining U* Issues

**Files:**

- Update outside repo:
  `$ARTIFACTS/es2015-provenance-created-issues.json`
- Update outside repo:
  `$ARTIFACTS/es2015-provenance-live-graph.json`
- Create outside repo:
  `$ARTIFACTS/es2015-provenance-verification.json`

**Interfaces:**

- Consumes: rendered bodies and issue map from Task 7.
- Produces: complete native hierarchy and dependency graph with exact bodies,
  titles, milestones, and no duplicate issues.

- [ ] **Step 1: Create direct decision and grouping nodes**

For each missing code, call `create_issue` with the exact rendered body and
these titles:

| Code | Title                                          |
| ---- | ---------------------------------------------- |
| UA   | Adjudicate unknown-edition Annex B provenance  |
| UB   | Adjudicate unknown-edition built-in provenance |
| UL   | Adjudicate unknown-edition language provenance |
| US   | Adjudicate unknown-edition staging provenance  |

After each call, immediately persist number, REST id, and GraphQL node id in
the issue map. On resume, re-query the marker before creating.

- [ ] **Step 2: Create language atomic nodes**

Create missing nodes with exact rendered bodies:

| Code | Title                                                |
| ---- | ---------------------------------------------------- |
| UL1  | Adjudicate assignment and update edition provenance  |
| UL2  | Adjudicate object and class edition provenance       |
| UL3  | Adjudicate grammar and control edition provenance    |
| UL4  | Adjudicate environment and module edition provenance |

Persist each identity immediately.

- [ ] **Step 3: Create staging atomic nodes**

Create missing nodes with exact rendered bodies:

| Code | Title                                                          |
| ---- | -------------------------------------------------------------- |
| US1  | Adjudicate staging container and binary-data provenance        |
| US2  | Adjudicate staging pattern, text, and JSON provenance          |
| US3  | Adjudicate staging numeric, date, and global provenance        |
| US4  | Adjudicate staging metaobject, function, and Symbol provenance |
| US5  | Adjudicate staging language-runtime provenance                 |
| US6  | Adjudicate affirmative post-ES2015 staging provenance          |
| US7  | Adjudicate residual staging semantic provenance                |

Persist each identity immediately.

- [ ] **Step 4: Apply ES2015 milestone idempotently**

For every U* issue:

```bash
gh api --method PATCH repos/yoonbuck/jsjs/issues/$NUMBER -F milestone=1
```

Re-read and assert milestone title `ES2015`.

- [ ] **Step 5: Attach native sub-issues idempotently**

Expected parent edges:

```text
#75 <- U0, UA, UB, UL, US
UL  <- UL1, UL2, UL3, UL4
US  <- US1, US2, US3, US4, US5, US6, US7
```

Before each POST, list current sub-issues and skip an exact existing child:

```bash
gh api --method POST \
  repos/yoonbuck/jsjs/issues/$PARENT_NUMBER/sub_issues \
  -F sub_issue_id="$CHILD_REST_ID"
```

- [ ] **Step 6: Add atomic-to-U0 dependencies**

For each of UA, UB, UL1-UL4, and US1-US7:

```bash
gh api --method POST \
  "repos/yoonbuck/jsjs/issues/$NUMBER/dependencies/blocked_by" \
  -F issue_id="$U0_REST_ID"
```

Skip an exact existing edge. U0 is closed, so the relationship is durable
history and not an open execution blocker.

- [ ] **Step 7: Add grouping dependencies**

Add:

```text
UL blocked by UL1, UL2, UL3, UL4
US blocked by US1, US2, US3, US4, US5, US6, US7
#75 blocked by UA, UB, UL, US
```

Do not remove closed #74 from #75. Do not add U0 as another direct #75
blocked-by edge.

- [ ] **Step 8: Render and apply final bodies**

Render every body again with the complete issue map:

```bash
TZ=UTC node tools/test262/es2015-provenance-check.js \
  --render-issue="$CODE" \
  --issue-map="$ARTIFACTS/es2015-provenance-created-issues.json" \
  > "$ARTIFACTS/es2015-provenance-rendered-issues/$CODE.final.md"
```

Update each issue with exact final bytes. Re-read body and compare SHA-256.

- [ ] **Step 9: Verify the complete live graph**

Fetch every issue, sub-issue list, blocked-by list, and blocking list. Assert:

- 16 unique U* nodes;
- exact title/body/milestone equality;
- exact parent edges;
- 13 atomic-to-U0 edges;
- 4 UL child blocker edges;
- 7 US child blocker edges;
- 4 direct #75 blocker edges plus preserved #74;
- #75 still blocks #98 and #100;
- UL/US/#75 contain no production-commit claim; and
- all atomic bodies prohibit guest production changes.

Write the canonical verification artifact and post its hash and a readable
table to #75.

---

### Task 9: Execute Controlled Wave 1

**Files:**

- Modify independently:
  - `tools/test262/es2015-provenance-decisions/UA.json`
  - `tools/test262/es2015-provenance-decisions/UB.json`
  - `tools/test262/es2015-provenance-decisions/UL1.json`
  - `tools/test262/es2015-provenance-decisions/US6.json`
- Regenerate per branch as required:
  `tools/test262/es2015-taxonomy.json`,
  `tools/test262/es2015-audit-evidence.json`,
  `tools/test262/upstream-subset.json`,
  `docs/test262-report.jsonl`, `docs/conformance.md`
- Update GitHub downstream path-ledger comments after each merge.

**Interfaces:**

- Consumes: merged U0 and exact batch ledgers.
- Produces: merged reviewed decisions for UA 314/323, UB 32/64, UL1 434/835,
  and US6 48/89.

- [ ] **Step 1: Launch at most four disjoint sessions**

Create one app-native session per issue, each from current main, using GPT-5.6
family. Give each only its exact code, issue, ledger, spec, and this task. Do
not let a session edit another fragment.

- [ ] **Step 2: Require RED decision completeness**

In each session, run:

```bash
TZ=UTC node tools/test262/es2015-provenance-check.js \
  --check --complete="$CODE"
```

Expected: failure naming the first undecided exact path.

- [ ] **Step 3: Build exact semantic evidence**

For every path, record complete metadata/include/flag closure, exact Sixth
Edition or later normative identity, reviewed semantic rationale, and
corroborating history where useful. UA must distinguish Sixth Edition Annex B
from later web-compat semantics. US6 must prove later status from exact
normative sources, not its topic name.

- [ ] **Step 4: Prepare draft fragments without claiming review**

Use the CLI's explicit draft mode:

```bash
TZ=UTC node tools/test262/es2015-provenance-check.js \
  --check --complete="$CODE" --allow-pending-review
```

Run only metadata/audit or exact targeted paths from
`$ARTIFACTS/$CODE.paths.txt`. Never run broad upstream Test262 locally.

- [ ] **Step 5: Create draft PRs and obtain two independent reviews**

Each draft PR links its atomic issue and carries batch/base hashes. Obtain:

1. specification review of every normative mapping; and
2. quality/provenance review of metadata closure, history non-decision,
   canonical hashes, and destination status/blocker.

Publish durable GitHub review artifact URLs.

- [ ] **Step 6: Finalize review records and strict checks**

Update every decision's reviewer, UTC review timestamp, review artifact, and
artifact hash. Then:

```bash
TZ=UTC node tools/test262/es2015-provenance-check.js \
  --check --complete="$CODE"
TZ=UTC npm run test262:es2015:audit:check
node test/run-node.js test/node/es2015-provenance.test.js \
  test/node/es2015-taxonomy.test.js
```

- [ ] **Step 7: Rebase and merge sequentially**

Before final review of each PR:

1. update from current `origin/main`;
2. regenerate shared artifacts under `TZ=UTC`;
3. rerun strict complete/global checks;
4. re-obtain review if normative records changed;
5. record exact reviewed head;
6. require exact-head CI and CodeQL; and
7. squash merge.

- [ ] **Step 8: Reclassify and update downstream ledgers after each merge**

From current main, publish exact path movements, refreshed partition/status
counts, downstream semantic issue additions/removals, fragment hash, taxonomy
hash, CI, CodeQL, and merge SHA. Close each atomic issue only after its selector
is empty and downstream issue comments are durable.

---

### Task 10: Execute Controlled Wave 2

**Files:**

- Modify independently:
  - `tools/test262/es2015-provenance-decisions/UL2.json`
  - `tools/test262/es2015-provenance-decisions/UL3.json`
  - `tools/test262/es2015-provenance-decisions/UL4.json`
  - `tools/test262/es2015-provenance-decisions/US1.json`
- Regenerate the same shared taxonomy/report artifacts as Wave 1.

**Interfaces:**

- Produces merged reviewed decisions for UL2 182/364, UL3 109/212,
  UL4 48/48, and US1 210/406.

- [ ] **Step 1: Verify Wave 1 closure and current main**

Assert UA, UB, UL1, and US6 are closed with merge evidence. Run provenance and
audit checks under UTC. Record the refreshed unknown count as the Wave 2 base.

- [ ] **Step 2: Launch four disjoint sessions from sequential current main**

Assign one exact fragment per session. UL2 owns object/class definitions; UL3
owns the approved language complement; UL4 owns environment/module paths; US1
owns staging containers/binary paths. No session edits guest runtime or another
fragment.

- [ ] **Step 3: Prove RED then prepare complete draft evidence**

For each code, run strict `--complete` to fail, populate every decision with
exact normative and metadata closure, then use `--allow-pending-review` only
until reviews exist.

- [ ] **Step 4: Use targeted-only execution**

Run metadata/audit and exact batch paths only. For core destinations, prove one
status: selected-passing, exact audit-passing, deviation, or named blocker with
owning roadmap issue. Route US1 binary/collection blockers to existing B*/C*
owners rather than changing runtime behavior.

- [ ] **Step 5: Obtain independent spec and quality/provenance reviews**

Publish durable review URLs, finalize every review record and artifact hash,
then run strict complete/global checks.

- [ ] **Step 6: Rebase, regenerate, exact-head verify, and merge sequentially**

Use current main before each final review. Require unchanged reviewed head for
successful CI and CodeQL. Squash merge one PR at a time.

- [ ] **Step 7: Publish UTC reclassification and downstream updates**

After each merge, update exact ledgers/counts on affected roadmap issues and
close the atomic issue only when its batch selector is empty.

---

### Task 11: Execute Controlled Wave 3

**Files:**

- Modify independently:
  - `tools/test262/es2015-provenance-decisions/US2.json`
  - `tools/test262/es2015-provenance-decisions/US3.json`
  - `tools/test262/es2015-provenance-decisions/US4.json`
- Regenerate shared taxonomy/report artifacts.

**Interfaces:**

- Produces merged reviewed decisions for US2 176/352, US3 99/190, and
  US4 176/318.

- [ ] **Step 1: Verify Waves 1-2 and refreshed base**

Require all prior atomic nodes closed and run strict global checks from current
main.

- [ ] **Step 2: Launch three disjoint sessions**

US2 reviews RegExp/String/JSON semantics; US3 reviews Math/Number/Date/global
semantics; US4 reviews Function/object/Symbol/Proxy/Reflect semantics.

- [ ] **Step 3: Complete normative adjudication**

Do not infer edition from SpiderMonkey import age. Map each semantic assertion
to exact Sixth Edition or later normative text and complete metadata closure.
Route genuine core blockers to R*/L*, G*, M*, or S0 owners as applicable.

- [ ] **Step 4: Run draft checks and exact targeted evidence**

Use `--allow-pending-review` before review. Execute no broad Test262 locally.

- [ ] **Step 5: Obtain both independent reviews and finalize records**

Record durable review URLs, UTC timestamps, reviewer identities, destinations,
and canonical hashes. Strict `--complete` must pass.

- [ ] **Step 6: Rebase and merge sequentially with exact-head gates**

Regenerate from current main before each final review. Require CI and CodeQL at
the exact unchanged head.

- [ ] **Step 7: Reclassify and update downstream issue ledgers**

Publish exact movements and hashes after each merge, then close US2, US3, and
US4 when their selectors are empty.

---

### Task 12: Execute Controlled Wave 4

**Files:**

- Modify independently:
  - `tools/test262/es2015-provenance-decisions/US5.json`
  - `tools/test262/es2015-provenance-decisions/US7.json`
- Regenerate shared taxonomy/report artifacts.

**Interfaces:**

- Produces merged reviewed decisions for US5 306/540 and US7 178/313.

- [ ] **Step 1: Verify all structured batches are closed**

Require UA, UB, UL1-UL4, and US1-US4/US6 closed. Record the exact remaining
unknown selector, which must equal the US5 + US7 unresolved union.

- [ ] **Step 2: Launch two manual-review sessions**

US5 owns staging language-runtime topics. US7 owns regress/extensions/misc/types.
Use long-context GPT-5.6 models because these batches require per-path semantic
review rather than directory inference.

- [ ] **Step 3: Complete every record with exact evidence**

For ambiguous historical tests, history may explain origin but final decisions
must cite Sixth Edition or later normative semantics plus reviewed rationale.
If no affirmative ES2015 evidence exists, record the exact non-ES2015 proof;
do not leave an unexplained unknown.

- [ ] **Step 4: Use targeted metadata/audit only**

Run strict completeness RED, draft checks, and exact path execution only when
needed for destination status. No broad local upstream run.

- [ ] **Step 5: Obtain independent reviews and finalize canonical records**

Every path needs both spec and quality/provenance review artifacts. Strict
complete/global checks must pass.

- [ ] **Step 6: Rebase and merge sequentially**

Reconcile generated artifacts from current main, retain exact reviewed head,
and require successful CI and CodeQL before each squash merge.

- [ ] **Step 7: Publish final atomic reclassification**

Update every affected downstream semantic ledger/count, publish exact movement
and artifact hashes, and close US5 and US7 only when their selectors are empty
or carry the approved reviewed non-ES2015 remainder proof.

---

### Task 13: Close UL and US Grouping Nodes

**Files:**

- No repository changes.
- Update GitHub UL and US issues.

**Interfaces:**

- Consumes: closed UL1-UL4 and US1-US7.
- Produces: verified closed UL and US grouping nodes.

- [ ] **Step 1: Verify language union**

Reconstruct UL1-UL4 base ledgers and assert:

```text
roots = 434 + 182 + 109 + 48 = 773
variants = 835 + 364 + 212 + 48 = 1,459
overlap = 0
```

Verify all four fragments are complete, merged, and reflected in current
taxonomy.

- [ ] **Step 2: Publish UL closure evidence**

Post child issue/PR/merge/review tables, base and final taxonomy hashes, exact
path movements, downstream ledger updates, and no-production statement. Close
UL only after its native blockers are closed.

- [ ] **Step 3: Verify staging union**

Reconstruct US1-US7 and assert:

```text
roots = 210 + 176 + 99 + 176 + 306 + 48 + 178 = 1,193
variants = 406 + 352 + 190 + 318 + 540 + 89 + 313 = 2,208
overlap = 0
```

Verify all seven fragments are complete, merged, and reflected in current
taxonomy.

- [ ] **Step 4: Publish US closure evidence**

Post the same exact child, review, movement, taxonomy, downstream, and
no-production evidence. Close US only after its native blockers are closed.

---

### Task 14: Verify and Close #75

**Files:**

- No production repository changes.
- Update GitHub #75, #70, #98, #100, and affected downstream issues.
- Create outside repo:
  `$ARTIFACTS/es2015-provenance-final-verification.json`

**Interfaces:**

- Consumes: all merged U* fragments and closed U* children.
- Produces: final #75 closure evidence and updated native roadmap graph.

- [ ] **Step 1: Reconstruct the immutable base and all decisions**

From current main:

```bash
TZ=UTC npm run test262:es2015:provenance:check
TZ=UTC npm run test262:es2015:audit:check
```

Assert 2,312 / 4,054 base paths, all 13 fragment hashes, complete union, zero
overlap, and no missing review record.

- [ ] **Step 2: Prove the closure selector**

Query current taxonomy. Pass only if:

1. `unknown-edition` is zero; or
2. every retained unknown has reviewed non-ES2015 proof, merged taxonomy and
   reclassification evidence, and an explicit accepted remainder record.

Reject any unexplained unknown.

- [ ] **Step 3: Verify downstream taxonomy and issue ledgers**

For every moved core root, verify selected/audit/deviation/named blocker status
and owning issue ledger. For every later/Annex/harness/malformed root, verify
exact destination evidence. Reconcile all root/variant partition totals to the
whole pinned tree.

- [ ] **Step 4: Verify the native graph**

Assert:

- U0, UA, UB, UL1-UL4, US1-US7, UL, and US are closed;
- #75 direct child and blocker relationships match the approved graph;
- closed #74 history is preserved;
- all U* issues retain ES2015 milestone;
- #75 still blocks #98 and #100 until this closure;
- no U* PR changed `src/` or guest runtime behavior; and
- every atomic PR records exact-head CI and CodeQL.

- [ ] **Step 5: Obtain final maximum-capability review**

Use GPT-5.6 family to independently review:

- exact base/fragment reconstruction;
- every closure condition;
- taxonomy balance and downstream ledger reconciliation;
- native hierarchy/dependencies;
- review/CI/CodeQL identities; and
- no-production invariant.

Publish the durable review artifact.

- [ ] **Step 6: Publish #75 closure evidence**

Post:

- source pins and base ledger/chunk hashes;
- U* hierarchy and issue/PR/merge table;
- all 13 batch counts/hashes and final destinations;
- pre/post taxonomy tables;
- downstream issue ledger/count deltas;
- graph verification hash;
- final review artifact;
- exact-head CI and CodeQL identities; and
- explicit no-production statement.

- [ ] **Step 7: Close #75 and update roadmap summaries**

Close #75 only after the evidence comment is durable. Update #70 with the T1
result and refreshed denominators/status. Update #98 and #100 dependency
milestones without claiming conformance beyond proven taxonomy.

- [ ] **Step 8: Report completion to the coordinator**

Send the coordinator:

- design and plan commit SHAs;
- U0 issue/PR/merge;
- complete child hierarchy;
- all batch PR/merge identities;
- final selector and taxonomy counts;
- CI/CodeQL/review evidence;
- #75 closure URL; and
- any semantic blockers routed to the remaining roadmap.
