# H0 Policy Bootstrap Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair BASE so it validates the exact six H0 evidence schemas, then merge #76 through the normal H0 pending-to-applied consumer path.

**Architecture:** A one-time bootstrap PR ports only reviewed pure H0 evidence parsing/reconciliation from the preserved #76 branch into the trusted BASE checker and closes every executable/data dependency used by protected projection validation. It changes no workflow, manifest, authority, evidence, generated output, or runtime behavior. After exact-main verification, the reconciled #76 branch drops all now-BASE-owned tooling changes, regenerates H0 outputs, applies H0, and follows the normal guarded PR lifecycle.

**Tech Stack:** Node.js 20 ES modules, strict JSDoc, canonical JSON, custom Node test harness, GitHub Actions/CodeQL, Git/GitHub CLI, `TZ=UTC`.

**Spec:** `docs/superpowers/specs/2026-08-21-h0-policy-bootstrap-repair-design.md`

## Global Constraints

- Bootstrap BASE:
  `03a4ccadb2b07fa7d3c1ad0f599608b0a7c31efd`.
- Safe reconciled #76 head:
  `b524fc356868df50157193145a9f22a5821870fc`.
- H0 authority remains `pending` throughout bootstrap.
- Manifest, 15 profiles, P0/H0 records, 13 fragments, six H0 evidence files,
  taxonomy, subset, report, conformance, workflow, and pipeline remain
  byte-identical in bootstrap.
- Port pure reviewed parser/reconciliation behavior from the preserved #76 branch;
  do not port runtime host behavior or generated evidence.
- All checker executable imports and projection HEAD-read data inputs are
  marker-owned. `features.json` is immutable BASE-equal input.
- Dynamic/runtime repository module loading is forbidden in gate-owner code.
- The old active guard is expected to fail only because BASE has no authorization
  for gate-owner repair. Ordinary CI and both CodeQL categories must pass.
- Never run broad/full Test262, `test262:upstream`,
  `test262:upstream:check`, `ci:contract`, full Node, full browser, or full JSC
  locally.
- Use Copilot authorship and squash merges.

---

## File Structure

### Bootstrap repair

- Modify `tools/test262/es2015-promotion.js`: strict H0 paths, baseline,
  promotion, disposition, owner-map, and owner-delta parsers plus reconciliation.
- Modify `tools/test262/es2015-provenance-check.js`: use normalized H0 evidence in
  protected projections and require immutable HEAD-read inputs.
- Modify `tools/test262/es2015-provenance.js`: complete gate-owner executable/data
  path set.
- Modify `test/node/es2015-provenance.test.js`: exact BASE projection and
  ownership regressions.
- Modify `test/node/upstream-select.test.js`: H0 parser/subset behavior.
- Modify `test/node/repository-invariants.test.js`: recursive import/data-input
  closure and dynamic-loading prohibition.
- Modify `docs/testing.md`: bootstrap exception and H0 evidence contract.
- Add this spec and plan.

### #76 consumer

- Rebase existing #76 branch onto repair squash.
- Drop/reconcile gate-owner changes now owned by BASE.
- Regenerate H0 protected outputs.
- Change only H0 `pending -> applied` in the manifest.
- Preserve existing #76 runtime/test/evidence implementation.

---

### Task 1: Port Complete H0 Evidence Adapters

**Files:**

- Modify: `tools/test262/es2015-promotion.js`
- Modify: `test/node/upstream-select.test.js`
- Modify: `test/node/es2015-provenance.test.js`

**Interfaces:**

- Produces:
  - `parseEs2015Promotion(text)` dual T0/H0 dispatch
  - `parseEs2015H0Paths(text, pin)`
  - `parseEs2015H0Baseline(text, pin)`
  - `parseEs2015H0Disposition(text, options)`
  - `parseEs2015H0OwnerMap(text, pin)`
  - `parseEs2015H0OwnerDeltas(text, options)`
  - `validateEs2015H0EvidenceBundle(bundle)`

- [ ] **Step 1: Write RED tests using exact authority-pinned H0 files**

Read fixture bytes from the preserved branch/ref, not generated expectations:

```js
const h0PromotionText = readGitFixtureText(
  'refs/heads/recovery/issue-76-pre-reconcile-0398d77',
  'tools/test262/es2015-h0-promotion.json',
);
assertSame(
  sha256(h0PromotionText),
  'a5ad87badd75c547f4f4e2fb0b5d0536b4969ea3bf97676333f970434e5cfa2c',
);
const promotion = parseEs2015Promotion(h0PromotionText);
assertSame(promotion.groupName, 'es2015/h0-cross-realm-passed');
assertSame(promotion.rootCount, 40);
assertSame(promotion.variantCount, 78);
```

Add equivalent exact tests for paths, baseline, disposition, owner map, and owner
deltas. Add mixed discriminator, unknown/missing key, bad hash/count/order,
duplicate path/variant/owner, and cross-artifact mismatch cases.

- [ ] **Step 2: Run focused RED**

```bash
TZ=UTC node test/run-node.js \
  test/node/upstream-select.test.js \
  test/node/es2015-provenance.test.js
```

Expected: H0 exact artifacts fail legacy parsing.

- [ ] **Step 3: Port minimal pure parsers**

Port only the reviewed parser/normalizer helpers from
`recovery/issue-76-pre-reconcile-0398d77:tools/test262/es2015-promotion.js`.
Keep existing T0 parser output unchanged.

`parseEs2015Promotion()` must dispatch only when both H0 discriminators exist:

```js
const hasH0Ledger = hasOwn(record, 'h0LedgerSha256');
const hasPromotedLedger = hasOwn(record, 'promotedLedgerSha256');
if (hasH0Ledger !== hasPromotedLedger) throw mixedSchemaError();
return hasH0Ledger
  ? parseH0PromotionRecord(record)
  : parseT0PromotionRecord(record);
```

- [ ] **Step 4: Port compact-baseline reconciliation**

Require preserved taxonomy identity and exact H0 selector facts while allowing
current BASE's reviewed non-H0 P0 movement. Never skip balance or H0 membership
checks.

- [ ] **Step 5: Run GREEN**

Run the focused command from Step 2. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/test262/es2015-promotion.js \
  test/node/upstream-select.test.js \
  test/node/es2015-provenance.test.js
git commit -m "Add exact H0 evidence adapters"
```

---

### Task 2: Integrate BASE Projection and Ownership

**Files:**

- Modify: `tools/test262/es2015-provenance-check.js`
- Modify: `tools/test262/es2015-provenance.js`
- Modify: `test/node/es2015-provenance.test.js`
- Modify: `test/node/repository-invariants.test.js`
- Modify: `docs/testing.md`

**Interfaces:**

- Consumes Task 1 normalized H0 bundle.
- Produces repaired exact H0 protected-output validation and complete ownership.

- [ ] **Step 1: Write RED exact consumer projection test**

Use BASE `03a4cca`, exact preserved H0 evidence bytes, and the reconciled H0
protected outputs. Require the repaired checker to advance past all six evidence
schemas and accept the exact projection when H0 is applied.

Add one RED test per prior failure:

- object H0 paths rejected as legacy array;
- compact baseline rejected as legacy array;
- H0 promotion rejected by T0 keys/group;
- disposition/owner-map/owner-delta mismatch;
- modified `features.json`;
- markerless `metadata.js` or `module-paths.js`;
- synthetic unowned static import;
- dynamic import/require/createRequire/computed specifier.

- [ ] **Step 2: Run RED**

```bash
TZ=UTC node test/run-node.js \
  test/node/es2015-provenance.test.js \
  test/node/repository-invariants.test.js
```

- [ ] **Step 3: Integrate normalized evidence bundle**

Replace legacy ad-hoc parsing in projection validation with Task 1 adapters. Load
each evidence file once, verify exact authority hash first, then cross-validate the
bundle.

Use normalized H0 promotion for subset/report paths and normalized
disposition/owner deltas for taxonomy/audit projections.

- [ ] **Step 4: Close execution and data inputs**

Add every recursively resolved checker import, including `metadata.js` and
`module-paths.js`, to `PROVENANCE_RANGE_GATE_OWNER_PATHS`.

Add `tools/test262/features.json` as immutable marker-owned input. Require every
HEAD-read projection path to be evidence, protected output, or BASE-equal immutable
input.

Reject dynamic/runtime loading syntax in gate-owner modules.

- [ ] **Step 5: Prove unchanged trust-root data**

Add assertions that bootstrap HEAD keeps byte identity for:

- `.github/workflows/ci.yml`
- `tools/ci/pipeline.js`
- `tools/test262/es2015-provenance.json`
- all 13 decision fragments
- all six H0 evidence files
- all H0/P0 protected outputs

- [ ] **Step 6: Run GREEN and static checks**

```bash
TZ=UTC node test/run-node.js \
  test/node/es2015-provenance.test.js \
  test/node/upstream-select.test.js \
  test/node/workflow-contract.test.js \
  test/node/repository-invariants.test.js
npm run typecheck
ESLINT_USE_FLAT_CONFIG=true npx eslint \
  tools/test262/es2015-promotion.js \
  tools/test262/es2015-provenance.js \
  tools/test262/es2015-provenance-check.js \
  test/node/es2015-provenance.test.js \
  test/node/upstream-select.test.js \
  test/node/repository-invariants.test.js
npx prettier --check \
  tools/test262/es2015-promotion.js \
  tools/test262/es2015-provenance.js \
  tools/test262/es2015-provenance-check.js \
  test/node/es2015-provenance.test.js \
  test/node/upstream-select.test.js \
  test/node/repository-invariants.test.js \
  docs/testing.md \
  docs/superpowers/specs/2026-08-21-h0-policy-bootstrap-repair-design.md \
  docs/superpowers/plans/2026-08-21-h0-policy-bootstrap-repair.md
npm run ci:check
git diff --check
```

- [ ] **Step 7: Commit**

```bash
git add tools/test262/es2015-promotion.js \
  tools/test262/es2015-provenance.js \
  tools/test262/es2015-provenance-check.js \
  test/node/es2015-provenance.test.js \
  test/node/upstream-select.test.js \
  test/node/repository-invariants.test.js \
  docs/testing.md
git commit -m "Repair H0 base projection validation"
```

---

### Task 3: Review and Deliver Bootstrap Repair

**Files:**

- Add design/plan docs.
- No other production files unless review finds a branch-caused defect.

**Interfaces:**

- Produces repair squash SHA and exact-main checker/module/promotion hashes.

- [ ] **Step 1: Run exact old BASE guard and record expected failure**

Use a detached `03a4cca` checkout and the bootstrap PR body. Require failure only
because no schema-v3 marker authorizes gate-owner changes. Any parser, path,
manifest, or unrelated failure must be fixed before delivery.

- [ ] **Step 2: Run repaired HEAD checker against #76 fixture**

In an isolated temporary repository/object range, execute HEAD checker/module
against the exact reconciled #76 consumer data. Require full H0 protected projection
success.

- [ ] **Step 3: Independent reviews**

Require:

- specification/security review;
- task quality review;
- whole-branch review.

Fix every Critical/Important issue and rerun Steps 1–2 and Task 2 Step 6.

- [ ] **Step 4: Push and open bootstrap PR**

Document:

- exact BASE/head;
- expected active guard failure and why;
- ordinary CI/CodeQL requirement;
- unchanged workflow/pipeline/manifest/authority/evidence/output bytes;
- explicit administrator exception;
- no broad local Test262.

- [ ] **Step 5: Verify and merge**

Require ordinary CI, both CodeQL categories, zero findings/alerts, unchanged head,
and only the expected active guard failure. Squash merge with explicit
administrator authorization.

- [ ] **Step 6: Verify exact main**

Require exact-main CI/CodeQL and record checker/provenance/promotion hashes. Update
#70/#75/#76 with repair evidence.

---

### Task 4: Resume and Deliver #76

**Files:**

- Existing reconciled #76 branch from safe head
  `b524fc356868df50157193145a9f22a5821870fc`.

**Interfaces:**

- Consumes repair squash SHA.
- Produces H0 applied, merged #76, and issue closure evidence.

- [ ] **Step 1: Rebase onto repair main**

Create a backup ref, rebase the reconciled branch onto exact repair squash, and
resolve by removing all gate-owner code now present in BASE while preserving
runtime/tests/evidence.

- [ ] **Step 2: Prove RED before transition**

Run repaired exact BASE checker with exact H0 consumer marker while H0 remains
pending. Expected: pending-to-applied failure only.

- [ ] **Step 3: Regenerate and apply H0**

Run exact H0 corpus and reviewed generators over repaired BASE. Preserve non-H0
classifications. Change only H0 state to applied with canonical renderer.

- [ ] **Step 4: Focused GREEN**

Run:

- exact H0 Test262 corpus;
- targeted host/runner/async/module Node, Chromium, and JSC suites;
- targeted taxonomy/upstream/provenance/workflow/invariant suites;
- audit/select checks;
- vendor/CI-generation/typecheck/scoped lint/format/diff.

Require exact repaired BASE checker GREEN with the H0 marker.

- [ ] **Step 5: Review and deliver**

Independent task and whole-branch review, push one PR, require active guard,
ordinary CI, both CodeQL categories, zero alerts, squash merge, and exact-main
verification.

- [ ] **Step 6: Update issues**

Close #76 with exact evidence. Update #70 and #75. Keep #70/#75 open until their
broader scopes complete. Confirm #79 still requires M0 preparation before protected
outputs.
