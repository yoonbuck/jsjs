# M1 Authority Repair Design

## Status and decision

This is a design-only trust-root repair for M1/#80. It starts from exact main:

```text
554afc367657439d116d23f4477bb24787a0e261
```

That commit is PR #113's squash merge and contains the original M1 authority in
`pending` state. The diagnostic consumer commit
`eb4bcbe9ae6d163d0b2578a40d22d7684d382d2b` is evidence only; it must not be
amended, consumed, or merged.

Use one narrowly scoped, one-use HEAD-checker repair PR. It corrects the generic
report validator and replaces only the still-pending M1 authority record. After
that repair is squash-merged and exact-main verified, rebuild the semantic M1
consumer from the repaired pending authority.

The repair is not a reusable maintenance profile. The unchanged BASE checker is
expected to reject it because BASE has no operation that can authorize changes
to its own checker or an existing pending authority.

## Reviewed diagnostic

The normative diagnostic for this design is:

```text
/home/jordan/jsjs/.worktrees/issue80-reflect/.superpowers/sdd/2026-08-22-es2015-reflect/task-8-authority-repair-diagnostic.md
```

It was read-only, used the pinned Test262 checkout, and changed no tracked file.
This design adopts its exact identities and conclusions.

## Exact BASE identities

| Identity                         | Exact value                                                        |
| -------------------------------- | ------------------------------------------------------------------ |
| Repair BASE                      | `554afc367657439d116d23f4477bb24787a0e261`                         |
| BASE manifest SHA-256            | `abc71cd2ac6284b8a67cf1dbe98b507a9a6f71fda478998aa27520869ff97f19` |
| BASE checker SHA-256             | `bb7513d190af22f377d451bdfa1618c6b808ccd40a5e534c34f7ebcdc57ea409` |
| BASE M1 canonical record SHA-256 | `5ee279b8b9c836fbb039caf83a5de0f73b31f427133214e4fd250871bc2345f8` |
| Pinned Test262                   | `b363f29d3c43c626dc852744ad64a0b48a003693`                         |
| Diagnostic consumer HEAD         | `eb4bcbe9ae6d163d0b2578a40d22d7684d382d2b`                         |

The repair validator must require the exact commit, manifest bytes, checker
bytes, and M1 record identity above. A branch based on any other commit is not
this repair.

## Single repair branch and documentation sequencing

The design, later plan, checker repair, manifest correction, focused tests, and
testing documentation all live on the single branch
`yoonbuck-m1-authority-repair`, rooted at exact BASE
`554afc367657439d116d23f4477bb24787a0e261`.

The design and plan documents must not be pushed or merged independently before
the complete repair PR. Either merge would move `main` away from the marker's
exact BASE and invalidate the one-use contract. The final repair PR carries the
complete six-path BASE-to-HEAD range, including both documentation additions.

If any repair document lands on `main` separately, do not rebase this marker or
silently update its BASE. Abandon the stale repair range and produce a newly
reviewed design with new exact identities.

### Diagnostic date-path supersession

The diagnostic's suggested repair document names used `2026-08-22`. That path
naming is superseded by this committed design. The normative paths are:

```text
docs/superpowers/specs/2026-08-23-m1-authority-repair-design.md
docs/superpowers/plans/2026-08-23-m1-authority-repair.md
```

These two paths, and only these two repair documentation paths, participate in
the strict allowlist. The corresponding `2026-08-22` repair spec/plan names are
foreign paths and must be rejected. This date correction does not change any
manifest, authority, promotion, projection, or consumer hash from the
diagnostic.

## Confirmed root causes

### Incomplete harness include-feature closure

The current M1 evidence builder derives `includeFeatures` from taxonomy
classification provenance. That provenance intentionally records only include
features relevant to later/non-ES2015 classification. It is not the complete
Test262 harness dependency closure required for promotion authorization.

Of the 103 promoted M1 roots:

- 12 have a nonempty include-feature closure;
- all 12 closures are exactly `["Reflect.construct"]`;
- 91 closures are empty; and
- all 12 current promotion entries incorrectly contain
  `"includeFeatures": []`.

The exact 12 roots are:

```text
test/built-ins/Reflect/apply/not-a-constructor.js
test/built-ins/Reflect/construct/not-a-constructor.js
test/built-ins/Reflect/defineProperty/not-a-constructor.js
test/built-ins/Reflect/deleteProperty/not-a-constructor.js
test/built-ins/Reflect/get/not-a-constructor.js
test/built-ins/Reflect/getOwnPropertyDescriptor/not-a-constructor.js
test/built-ins/Reflect/getPrototypeOf/not-a-constructor.js
test/built-ins/Reflect/has/not-a-constructor.js
test/built-ins/Reflect/isExtensible/not-a-constructor.js
test/built-ins/Reflect/preventExtensions/not-a-constructor.js
test/built-ins/Reflect/set/not-a-constructor.js
test/built-ins/Reflect/setPrototypeOf/not-a-constructor.js
```

Each includes `isConstructor.js`. The pinned harness feature definition and
harness source both establish the `Reflect.construct` dependency. Root metadata
features and include-derived features remain separate channels even where the
same feature appears in both.

The corrected M1 promotion remains 103 roots / 206 variants. Only the 12
`includeFeatures` arrays change.

### Generic report validator drops promotion features

The generic branch of `validateReportProjection()` reconstructs promoted audit
records without `promotion.entries[].features`. The reviewed report correctly
contains those feature arrays, so the immutable BASE checker constructs a
different canonical report and rejects:

```text
roadmap-reclassification:M1 protected output docs/test262-report.jsonl must match the canonical selected report
```

The H0-specific branch already preserves exact feature metadata. The generic
branch must do the same.

### Seven stale exclusions are policy cleanup, not subset expansion

These exact exclusions are stale:

```text
test/built-ins/Object/internals/DefineOwnProperty/consistent-value-function-arguments.js
test/built-ins/Object/internals/DefineOwnProperty/consistent-value-function-caller.js
test/built-ins/Object/internals/DefineOwnProperty/consistent-value-regexp-dollar1.js
test/built-ins/Object/internals/DefineOwnProperty/consistent-writable-regexp-dollar1.js
test/staging/sm/Array/unshift-with-enumeration.js
test/staging/sm/object/bug-1206700.js
test/staging/sm/strict/primitive-assignment.js
```

All 13 executable variants pass the current engine. Removing the seven
exclusion objects adds zero subset paths and zero groups:

| Measure                | Before |  After |
| ---------------------- | -----: | -----: |
| Final selected paths   | 20,595 | 20,595 |
| Final groups           |     61 |     61 |
| Added selected roots   |      0 |      0 |
| Removed selected roots |      0 |      0 |

`upstream-subset.json` remains byte-identical. The policy cleanup is still
required for `test262:exclusions:check`, but it belongs to the rebuilt semantic
consumer, not this BASE repair.

## Goals

1. Install one exact HEAD-checker authorization for this repair and no other
   range.
2. Preserve generic promotion feature arrays while reconstructing canonical
   selected-report records.
3. Replace the invalid pending M1 authority with the exact corrected pending
   record.
4. Add exact future ownership for the seven-deletion
   `tools/test262/es5-selection.json` replacement.
5. Keep M1 pending; do not add evidence or apply consumer outputs.
6. Preserve every unrelated authority, profile, fragment, evidence byte,
   protected output byte, workflow, pipeline, and runtime file.
7. Leave the repaired main ready for one normal M1 `pending -> applied`
   consumer.

## Strict non-goals

- Implementing or modifying guest Reflect behavior.
- Consuming M1 or changing its state to `applied`.
- Adding or modifying any of the six M1 evidence files.
- Changing taxonomy, audit evidence, subset, report, conformance, selection, or
  any other protected output in the repair PR.
- Deleting the seven exclusions in the repair PR.
- Changing `tools/test262/es2015-m1.js`; it does not exist at the repair BASE.
- Changing `.github/workflows/ci.yml`, `tools/ci/pipeline.js`, feature policy,
  decision fragments, provenance schema, or gate-owner closure.
- Adding a generic checker-maintenance profile or reusable self-authorization
  mechanism.
- Recognizing the repair marker on `pull_request_target`.
- Accepting the marker through local `--profile/--marker` mode.
- Running broad/full Test262, the broad upstream subset, `ci:contract`, full
  Node, full browser, or full JSC locally.

## Alternatives

### Re-run the existing preparation profile

Rejected. `roadmap-authority-prepare` may add one new pending authority only.
It requires every existing authority, including M1, to remain canonically
identical.

### Repair inside the semantic consumer

Rejected. The immutable BASE checker must validate the consumer and cannot
trust HEAD changes to its checker or pending authority under a normal
`roadmap-reclassification:M1` marker.

### Change the workflow or waive provenance generally

Rejected. A workflow change would expand the trust-root exception and could
hide the reason the old guard fails. Only the exact old-BASE authorization
failure may be bypassed; all ordinary CI and CodeQL gates remain mandatory.

### Recommended: exact one-use HEAD-checker repair

Use the existing ordinary-PR HEAD checkout and checker invocation. Bind a new
marker to the exact BASE, BASE manifest, BASE record, corrected HEAD manifest,
and corrected HEAD record. Restrict the range to six exact files and keep all
semantic/evidence bytes out of the repair.

## One-use marker contract

The PR body contains exactly one marker with this exact order and spelling:

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

The parser accepts:

- exactly one LF-delimited full comment block;
- lowercase hexadecimal only;
- no reordered, omitted, duplicate, or extra field;
- no whitespace variant; and
- no second provenance marker of any kind in the body.

Malformed near-matches are not repair markers.

## Trust model

### Ordinary `pull_request` only

The ordinary `pull_request` Test262 job checks out the PR HEAD and already runs
the checked-out HEAD checker with the event base SHA, event head SHA, and PR
body. The repaired checker may recognize the one-use marker only through that
path.

`authoritativeRangeMarkers()` scans the M1 repair marker only when the event is
ordinary `pull_request`, alongside the H0 HEAD-only precedent.

### Never `pull_request_target`

The trusted-base guard checks out and executes the unchanged BASE checker. That
checker does not recognize this marker. The expected failure is:

```text
A provenance-owned PR range requires one authoritative provenance marker
```

This failure proves the repair is not self-authorized by the active trust root.
No workflow change may suppress, rename, or avoid it.

After repair merge, future `pull_request_target` runs still do not scan the M1
repair marker. The exact BASE pin would also be stale, but event exclusion is
the primary boundary.

### Never local profile activation

The marker is not accepted by `parseRoadmapAuthorityMarker()` or
`parseProvenanceRangeMarker()` in local `--profile/--marker` mode. A local
attempt such as profile `m1-authority-repair` must fail with:

```text
Provenance PR marker is not authoritative
```

Focused tests may inject an ordinary `pull_request` event and PR-body
environment, matching CI. There is no reusable local repair profile.

### One-use identity

The repaired checker contains immutable literal constants:

```js
const M1_AUTHORITY_REPAIR_HEAD_MANIFEST_SHA256 =
  'c12f0cc983141fccfc132dd7d872a29022192d33d72389eac9960c3403b21fbf';
const M1_AUTHORITY_REPAIR_HEAD_RECORD_SHA256 =
  '42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670';
```

The checker must not derive either expected value from the marker or from the
observed HEAD. Validation independently requires:

1. the marker's HEAD manifest/record fields equal these literals;
2. the computed HEAD manifest SHA-256 equals the manifest literal; and
3. the computed canonical HEAD M1 record SHA-256 equals the record literal.

Marker agreement with HEAD is necessary but not sufficient. A self-consistent
alternate HEAD manifest/record plus a marker containing the matching alternate
hashes must still fail against the immutable literals.

The validator also requires:

- exact merge base and event base
  `554afc367657439d116d23f4477bb24787a0e261`;
- exact BASE manifest SHA-256;
- exact BASE checker SHA-256;
- exact BASE M1 canonical record SHA-256;
- exact corrected HEAD manifest SHA-256; and
- exact corrected HEAD M1 canonical record SHA-256.

Once main moves, the marker cannot authorize another PR. A branch from another
base, a second record revision, or a replay against repaired main fails.

## Strict six-path range

The complete BASE-to-HEAD range must contain exactly these six paths:

| Status | Path                                                              |
| ------ | ----------------------------------------------------------------- |
| `M`    | `tools/test262/es2015-provenance-check.js`                        |
| `M`    | `tools/test262/es2015-provenance.json`                            |
| `M`    | `test/node/es2015-provenance.test.js`                             |
| `M`    | `docs/testing.md`                                                 |
| `A`    | `docs/superpowers/specs/2026-08-23-m1-authority-repair-design.md` |
| `A`    | `docs/superpowers/plans/2026-08-23-m1-authority-repair.md`        |

The range rejects:

- a missing listed path;
- an additional or foreign path;
- duplicate path entries;
- rename or copy status;
- any deletion;
- a non-regular-file mode;
- path aliasing, traversal, or encoding tricks; and
- a status different from the table.

The plan document is added later in the design-to-plan lifecycle. The final
repair PR still has the exact six-path range above.

## Checker architecture

### Marker representation

Add a closed marker kind carrying:

```text
kind: m1-authority-repair
text
code: M1
issue: 80
base
baseManifestSha256
baseRecordSha256
headManifestSha256
headRecordSha256
```

It is separate from legacy, migration, preparation, consumption, and H0 repair
markers.

### Range dispatch

`checkRange()` recognizes the M1 repair before normal roadmap dispatch and
calls one dedicated validator. The validator reads canonical BASE and HEAD
manifests and the exact BASE checker bytes. It does not invoke generic
preparation or consumption semantics.

### Manifest comparison

The dedicated validator requires:

- canonical schema-v3 BASE and HEAD manifests;
- identical top-level manifest data except `roadmapAuthorities`;
- identical authority count and code order;
- every non-M1 authority canonical-object identical;
- BASE M1 canonical hash equal the pinned BASE identity;
- HEAD M1 canonical hash equal the pinned corrected identity;
- M1 `state: "pending"` in BASE and HEAD;
- M1 code, issue, parent, source, reconciliation, and destinations identical;
- evidence arrays equal except the promotion entry hash;
- protected outputs equal except the exact corrected fields and one exact new
  output; and
- no evidence or protected file added or modified in the repair range.

Unknown difference fails with the exact record path/field where possible.

### Defense-in-depth immutable bytes

The six-path diff contract is necessary but not the only protection. Mirroring
the H0 bootstrap repair, the dedicated validator also reads BASE and HEAD bytes
and requires byte identity for:

- `.github/workflows/ci.yml`;
- `tools/ci/pipeline.js`;
- `tools/test262/es2015-policy.json`;
- `tools/test262/features.json`;
- every
  `tools/test262/es2015-provenance-decisions/*.json` decision fragment;
- every evidence path named by every BASE roadmap authority; and
- every protected-output path named by every BASE roadmap authority.

For an authority evidence or protected-output path absent in BASE, HEAD must
also be absent. This explicitly keeps all six future M1 evidence files absent
during the repair. For an existing path, file mode and bytes must be identical.

The protected-output assertion includes
`tools/test262/es5-selection.json`: the repaired authority may add its future
replacement commitment, but the policy file itself remains byte-identical
through the repair.

The intentionally changed checker, manifest, focused test, testing
documentation, repair design, and repair plan are not part of this immutable
set. The manifest receives its separate exact structural/hash validation.

These assertions are redundant with a correct six-path Git diff by design.
They defend against dependency mistakes, malformed/injected range fixtures,
path-normalization errors, and future refactoring that reads an unreviewed HEAD
input without expanding the range validator.

## Exact corrected M1 authority

### Unchanged M1 data

These remain exact:

- code `M1`;
- issue 80 and parent issue 70;
- state `pending`;
- source taxonomy SHA
  `7d366c58f83e635cfe92993f67bab9d6e4d7ef49184cdc7b85b96180cdaf89a4`;
- 113 roots / 226 variants;
- path SHA
  `65529ed8f9bdf88576314e95f4f164ac2c613e9ec44f0aae042a79aa5f8706b4`;
- `source.entryLedgerSha256: null`;
- `reconciliation: null`;
- paths, baseline, disposition, owner-deltas, and owner-map evidence hashes;
- audit evidence base/head hashes;
- all add-exact hashes other than M1 promotion;
- all project base hashes;
- destinations #81 blocked and #80 selected; and
- all other authority records and manifest data.

### Promotion evidence change

| Identity                  | Current                                                            | Corrected                                                          |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| M1 promotion file SHA-256 | `e123e6004eb71e9f3c012432af514e2f5385f049c3b0b0792c6c84f6d8f99cd6` | `31f807a05d56d35762cd5457f779624df04f11ef482b3d1bcb60be3a06883c69` |

Both the `evidence` entry and the promotion `add-exact.headSha256` change to the
corrected value. No other evidence entry changes.

### Four project commitments

| Project output                       | Current projection SHA-256                                         | Corrected projection SHA-256                                       |
| ------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `docs/conformance.md`                | `d00433813b4b90005ea5b563c79f41af8f05d6ec4f87e8617c04a1ab4ba47a99` | `79a033c365600cceb1f337bcc680bfdd76b095be0a6b5fb64db604c784cce65b` |
| `docs/test262-report.jsonl`          | `ce81820dfe5a47bf54aa965d2f3d9241375b02914e038b0c111d0e3178f917da` | `b1968f16a04240ce1169430f695f01a4ee013fdbf2ba3dcdd38b4ccabdcc225f` |
| `tools/test262/es2015-taxonomy.json` | `732939567e7271d02f6cb5f1248e818ed43823609f9cd66fd9c6b5ef93039912` | `a7b4dbd0334bd5ca34a25c80b156a051c444c989d8b87ba6ae18d34a7ca0078c` |
| `tools/test262/upstream-subset.json` | `2df51a8d8d51aa6c4ad44bcc234b7d9b2b8c7287b5189797f91c9ea8881e9e37` | `bd59cfd5496a3c180a99240b6611d1efe0141b931c63d13fd897dc0c1b25cdf3` |

Conformance, report, and subset consumer bytes remain identical; their
commitments change because the projection identity includes the promotion file
hash.

### Corrected taxonomy HEAD identity

| Identity                                     | Current consumer bytes                                             | Corrected consumer bytes                                           |
| -------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `tools/test262/es2015-taxonomy.json` SHA-256 | `c128f8c7d5455048c2a1b44e706cae0028be3857c91a63f8d720309fb2423c3b` | `fba700539b05edd67b6cf67e4c0a1361398a2d0f04212bc7080a83f44abf577a` |

The only taxonomy byte change is
`inputs.m1PromotionSha256`. The authority keeps taxonomy as `project`, so its
record retains `headSha256: null`; the corrected HEAD byte hash is an exact
consumer/scratch identity validated by the repaired authority commitments.

### New exact selection output

Add this twelfth protected output:

```json
{
  "path": "tools/test262/es5-selection.json",
  "operation": "replace-exact",
  "baseSha256": "533e0b9fc165a026d64c4e64d783cf2585de7236600acacf228f06d27f23d8c8",
  "headSha256": "78ac694beb258be0b67c7788137c736b0b30cf7457e3a903d364d38c038b48df",
  "projectionSha256": null
}
```

`replace-exact` is required because the seven reviewed object deletions add no
subset path and require no new selection projection semantics.
The protected-output checker validates BASE and HEAD hashes and returns before
project-specific dispatch, so P0's historical selection projection rule is not
reused or weakened for M1.

The corrected `protectedOutputs` array remains code-unit sorted. The new
selection entry is after `tools/test262/es2015-taxonomy.json` and before
`tools/test262/upstream-subset.json`.

### Corrected head identities

| Identity                               | Current                                                            | Corrected                                                          |
| -------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Canonical M1 record SHA-256            | `5ee279b8b9c836fbb039caf83a5de0f73b31f427133214e4fd250871bc2345f8` | `42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670` |
| Pretty authority-record file SHA-256   | `0715d35ce096d83c3931e034f70c398e028b432e17178e2548cf248a18fd3261` | `08bee7fc33f94ce6eaa5527aa5e6ee5c90432fd4cce364e853d1cf1bfe1bf570` |
| Aggregate protected projection SHA-256 | `5a53c5fb85f0f5efba909efa38a85199decbab3c30e4c4090b1de8e83b627727` | `22bf654462044eb3febfbcec43e1c56a20cd89392c763e8d141fd6f3274289ed` |
| Protected-projection file SHA-256      | `cac8d87e8f790d9707c0e111e66f01ba0299267c2611d091db61878015ef07f4` | `c17f632bbdf8d8104e5847ae79d9d83489360896fc8fe3f3df7d6137686eddcb` |
| Pending manifest SHA-256               | `abc71cd2ac6284b8a67cf1dbe98b507a9a6f71fda478998aa27520869ff97f19` | `c12f0cc983141fccfc132dd7d872a29022192d33d72389eac9960c3403b21fbf` |

The repaired manifest is a pure pending-authority correction. It does not
contain corrected evidence or consumer output bytes.

## Generic report feature preservation

In the non-H0 branch of `validateReportProjection()`:

1. build a path-keyed map from `promotion.entries`;
2. require every promoted audit record to have a matching entry;
3. require every promoted audit record status to be `passed`;
4. call `createTestRecord()` with the matching entry's `features`; and
5. retain the existing canonical ordering/report comparison.

Conceptually:

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

`createTestRecord()` omits the property when the array is empty, preserving
existing empty-feature report bytes. The H0 branch is unchanged.

This repair does not use `includeFeatures` as report record features. Report
records retain root metadata features; include-derived features authorize
execution separately through the promotion manifest.

## Focused test contract

### Generic report regression

Add tests proving:

- a generic promotion with two root features produces and accepts those exact
  report features;
- omitting one promoted report feature fails canonical report validation;
- changing or reordering the feature array fails;
- an empty feature array serializes no `features` property;
- H0 report projection fixtures remain unchanged; and
- a missing promotion entry is an explicit impossible-state failure.

### Marker and event boundary

Add tests for:

- exact marker parse and normalized fields;
- duplicate marker and mixed-marker rejection;
- uppercase hash, CRLF, field order, whitespace, missing field, extra field,
  and prefix/suffix rejection;
- ordinary `pull_request` acceptance;
- `pull_request_target` non-recognition;
- local `--profile/--marker` rejection;
- wrong BASE commit or merge base;
- wrong BASE manifest/checker/record hash; and
- wrong HEAD manifest/record hash;
- marker HEAD hashes that differ from the checker literals; and
- a self-consistent alternate HEAD manifest/record plus matching alternate
  marker hashes, which must still fail the immutable corrected literals.

### Six-path range

Add one positive exact range and negative tests for:

- each missing required path;
- each foreign path;
- rename, copy, delete, duplicate, bad mode, alias, or traversal;
- wrong add/modify status; and
- workflow, pipeline, provenance schema module, evidence, protected output, or
  runtime changes.

### Defense-in-depth immutable data

For each immutable category, add a test where the reported six-path change set
is otherwise valid but injected BASE/HEAD bytes differ:

- workflow;
- pipeline;
- ES2015 policy;
- feature manifest;
- each decision fragment;
- each existing authority evidence path;
- each existing authority protected output; and
- an M1 future evidence path appearing in HEAD.

Every case must fail the exact immutable path. Positive coverage requires all
derived BASE evidence/protected paths to be visited, not a hand-maintained
partial sample.

### Pending authority replacement

Add tests that reject:

- M1 becoming `applied`;
- M1 deletion, code/issue/parent/source/reconciliation/destination drift;
- authority reordering or another authority changing;
- more or fewer evidence changes than the one promotion hash;
- a changed non-promotion evidence hash;
- any project commitment other than the four exact replacements;
- a changed base hash, audit exact hash, or unrelated protected output;
- a missing, altered, or extra selection output; and
- any noncanonical corrected record.

Require the exact corrected record and manifest hashes in the positive fixture.

### End-to-end trust proof

Capture:

1. the unmodified exact BASE checker rejecting the repair range with the
   expected missing-marker error;
2. the repaired HEAD checker accepting the exact six-path range on ordinary
   `pull_request`;
3. the repaired HEAD checker rejecting the marker on
   `pull_request_target` and local profile mode; and
4. the repaired checker accepting a subsequent normal M1 consumer fixture
   using corrected protected projection
   `22bf654462044eb3febfbcec43e1c56a20cd89392c763e8d141fd6f3274289ed`.

## Repair PR scope

The repair PR changes only the six exact range paths. In particular:

- no workflow or pipeline change;
- no `tools/test262/es2015-provenance.js` change;
- no M1 runtime/tooling change;
- no evidence file;
- no taxonomy, audit, subset, report, conformance, or selection byte;
- no decision fragment; and
- no authority state transition.

`docs/testing.md` documents the one-use marker, ordinary-PR-only trust model,
expected BASE guard failure, strict path set, local validation boundary, and
rebuild handoff.

## Local validation boundary

Local repair validation is limited to:

- focused `test/node/es2015-provenance.test.js`;
- repository invariants only if directly affected by documentation;
- `npm run typecheck`;
- scoped ESLint for the checker and focused test;
- scoped Prettier for the six repair paths;
- `npm run ci:check`;
- `git diff --check`;
- exact unmodified BASE-checker invocation, expected to fail only with the
  missing-marker message; and
- exact repaired HEAD-checker invocation, expected to pass.

Do not run locally:

- `npm run test262:upstream`;
- `npm run test262:upstream:check`;
- broad/full Test262;
- `npm run ci:contract`;
- full Node, browser, or JSC suites; or
- the semantic M1 consumer corpus.

The ordinary PR CI suite may run the pinned subset. That is CI evidence, not a
local exception.

## Repair delivery gates

The repair PR may merge only when:

- the branch range starts at exact BASE;
- design and plan remain unmerged commits on that same repair branch until the
  complete repair PR;
- all six and only six paths have exact statuses;
- focused tests and repaired HEAD range validation pass;
- the old BASE guard failure is captured and exact;
- every other ordinary PR job passes at the reviewed HEAD;
- both CodeQL categories have zero results, errors, and warnings;
- open code-scanning alerts are zero;
- independent provenance/security specification review is clean;
- independent whole-range code/security review is clean;
- an administrator explicitly authorizes the one expected required-check
  bypass;
- the merge is squash-only; and
- exact-main ordinary CI and both CodeQL categories pass after merge.

No other failure is waivable. A HEAD change after review restarts focused
validation, review, ordinary CI, and CodeQL.

## Rebuilt semantic consumer

After the repair squash merge:

1. discard the diagnostic consumer commit as a delivery candidate;
2. rebase the semantic M1 branch onto the exact repair merge;
3. derive promotion `includeFeatures` permanently from the pinned exact root
   sources and recursive harness include definitions;
4. keep the focused-runner containment boundary and do not import broad audit,
   upstream-run, or upstream-select entry points;
5. prove exactly 12 nonempty closures, all
   `["Reflect.construct"]`, and 91 empty closures;
6. remove the exact seven stale exclusions with formatting-preserving policy
   serialization;
7. prove selection remains 20,595 paths / 61 groups with no added path/group;
8. regenerate the six evidence files and protected projections;
9. require only promotion to change among the six evidence files;
10. require only taxonomy to change among the original five projected byte
    files;
11. add the exact selection replacement as the new protected byte output;
12. rebuild the consumer marker with aggregate projection
    `22bf654462044eb3febfbcec43e1c56a20cd89392c763e8d141fd6f3274289ed`;
13. change only corrected M1 `pending -> applied`; and
14. run normal repaired-BASE consumption validation.

The permanent include closure must come from pinned inventory facts, not
taxonomy classification provenance. The contained M1 tool may use exact
low-level root/harness metadata readers and inventory construction, but not the
broad audit entry point.

The rebuilt consumer also runs the exact seven-path Test262 probe,
`test262:exclusions:check`, exact M1 execution, focused M1/provenance tests,
audit check, promoted-report check, selection check, and the immutable repaired
BASE range check. Local broad/full Test262 remains prohibited.

## Performance, portability, and security

This repair changes no guest runtime and no hot path. The generic report fix
builds one map over 103 promotion entries and performs constant-time lookup per
promoted record.

All repair logic is deterministic Node tooling:

- code-unit-sorted paths and canonical JSON;
- exact SHA-256 identities;
- no timestamp, host path, locale, or timezone-dependent output;
- no dynamic import or network dependency in validation; and
- no write outside the six reviewed repair paths.

The security boundary is fail-closed:

- unknown marker or record drift rejects;
- old BASE remains visibly red;
- HEAD trust is restricted to ordinary PR code review/CI;
- the exact base makes the repair non-replayable;
- no workflow mutation changes which checker runs; and
- normal pending-to-applied semantics resume after merge.

## Documentation and follow-up

This design is committed first. A separate implementation plan is written later
at:

```text
docs/superpowers/plans/2026-08-23-m1-authority-repair.md
```

The present design task changes no checker, manifest, test, or testing
documentation. Those join the final six-path repair range only during planned
implementation.

## Acceptance criteria

The design is satisfied when:

1. design and plan stay on the one exact-base repair branch until the complete
   repair merge;
2. the `2026-08-23` spec/plan paths supersede and exclude the diagnostic's
   `2026-08-22` suggestions;
3. the exact one-use marker is ordinary-PR-only and non-replayable;
4. literal corrected HEAD manifest/record constants reject a self-consistent
   alternate marker/HEAD pair;
5. the final repair range is exactly six paths with exact statuses;
6. workflow, pipeline, feature policy/manifest, fragments, evidence, and
   protected-output bytes are independently BASE/HEAD identical;
7. the generic report validator preserves promotion root features;
8. the corrected pending M1 record has canonical hash
   `42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670`;
9. the corrected pending manifest has SHA-256
   `c12f0cc983141fccfc132dd7d872a29022192d33d72389eac9960c3403b21fbf`;
10. M1 remains pending and every unrelated identity is unchanged;
11. the authority owns corrected promotion, four projections, corrected
    taxonomy identity, and exact selection replacement;
12. the old BASE checker fails only for missing authorization;
13. repaired HEAD CI and normal post-repair M1 consumption pass;
14. the semantic branch derives exact include closure from pinned inventory and
    removes the seven exclusions; and
15. repair and rebuilt-consumer CI/CodeQL/closure evidence is complete.
