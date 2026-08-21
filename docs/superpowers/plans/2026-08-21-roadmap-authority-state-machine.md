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
assertSame(H0_PENDING_ROADMAP_AUTHORITY.destinations.length, 16);
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
- all 16 destination objects.

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
