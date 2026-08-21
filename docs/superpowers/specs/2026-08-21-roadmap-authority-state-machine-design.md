# Roadmap Authority State Machine Design

## Status

Approved in-session on 2026-08-21 as a two-PR guarded migration. The bootstrap
design branch starts from exact base
`9d2df395b792230529094cdffc4d9c694e2b357c`. The schema-v3 migration receives a
new exact-base pin only after the bootstrap PR is squash-merged and verified.

This design supersedes the unguarded historical roadmap-authority proposals. Their
code, commits, and GREEN evidence are not implementation inputs.

## Problem

PR #102 delivered valid issue #77 lexical grammar and `new.target` behavior, but it
also introduced `maintenance:issue77-lexical` in the same HEAD whose protected
generated outputs that profile authorized. The range checker therefore accepted
authorization defined by the consumer itself.

That is a policy failure even though the semantic result, ordinary CI, and CodeQL
were green. The protected files determine Test262 selection, taxonomy,
reclassification ownership, audit evidence, and published conformance claims.
Ordinary runtime tests cannot prove that changes to those records were authorized
by previously reviewed repository state.

PR #105 installed a trusted `pull_request_target` BASE guard. Privileged checking
now executes only BASE code, but the data consumed by that code must also come from
BASE. Otherwise a PR could still add the authority record that permits its own
protected-output changes.

## Goals

1. Make roadmap generated-output authority originate only from canonical BASE.
2. Make each consumer authority usable exactly once.
3. Preserve all valid #77 behavior and generated results.
4. Register the already-applied P0/#77 transition and the pending H0/#76
   transition.
5. Keep all 13 decision fragments at schema 2 and byte-identical.
6. Preserve the 15 legitimate schema-v2 range-profile objects exactly.
7. Remove exactly the invalid `maintenance:issue77-lexical` profile.
8. Permit future authority registration as a data-only, append-one-pending
   operation enforced by existing BASE code.
9. Fail closed on BASE movement, replay, partial consumption, foreign generated
   changes, or ambiguous markers.

## Non-goals

- Reverting or reimplementing issue #77.
- Changing unknown-edition decisions or the immutable T1 ledger.
- Authorizing arbitrary semantic source, tests, or prose.
- Resuming issue #76, issue #79, or the issue #75 hierarchy in this PR.
- Designing correction of an existing authority record. Such a correction requires
  a separately reviewed schema migration.
- Running broad Test262, `ci:contract`, browser, or JavaScriptCore suites locally.

## Selected Approach

Deliver the correction in two guarded PRs:

1. a schema-v2 bootstrap PR that installs the future verifier without using it;
2. a schema-v3 migration PR whose BASE already contains that verifier.

The migration introduces a top-level manifest-v3 `roadmapAuthorities` registry
whose entries form a BASE-owned one-use state machine.

Each roadmap entry has one of two states:

- `pending`: reviewed BASE data that may authorize one exact consumer.
- `applied`: immutable historical evidence that cannot authorize another consumer.

A consumer is valid only when:

1. canonical BASE contains the exact roadmap entry in `pending`;
2. HEAD contains the same canonical entry with only `state` changed to `applied`;
3. the PR marker names and hashes that BASE entry exactly;
4. the protected-output projection is nonempty and matches the entry exactly; and
5. all other authority entries, profiles, fragments, and gate-owner files obey
   their immutability rules.

The state transition and protected-output change are one atomic checked range.
Neither can land without the other. No PR introduces executable authority policy
and consumes that policy in the same HEAD.

### Rejected alternatives

**Reusable registry permits** are simpler but allow replay. An `applied` P0 record
could authorize a later unrelated rewrite.

**Per-PR permit commits** avoid replay but require stacked PRs, branch rebases, and
race-prone lifecycle management for every consumer.

**Generated-only companion PRs** separate semantics from generated files but do
not solve who authorized the companion PR and complicate exact-head review.

## Version Boundaries

The implementation separates manifest and decision-fragment versions:

- `ES2015_PROVENANCE_MANIFEST_VERSION = 3`
- `ES2015_PROVENANCE_DECISION_VERSION = 2`

Manifest parsing accepts only the version required by the selected operation.
Decision-fragment parsing remains version 2. All 13 tracked fragment files must be
byte-identical before and after the migration.

The v3 manifest retains the existing top-level fields and adds:

```json
{
  "version": 3,
  "roadmapAuthorities": []
}
```

`roadmapAuthorities` is sorted by code using the repository's code-unit ordering.
Codes and issue numbers are unique.

## Authority Record

Each canonical authority record has this exact shape:

```json
{
  "code": "H0",
  "issue": 76,
  "parentIssue": 70,
  "state": "pending",
  "source": {
    "baseTaxonomySha256": "64 lowercase hex",
    "rootCount": 135,
    "variantCount": 267,
    "pathSha256": "64 lowercase hex",
    "entryLedgerSha256": null
  },
  "reconciliation": {
    "preservedTaxonomySha256": "64 lowercase hex",
    "authorityTaxonomySha256": "64 lowercase hex",
    "selectorPathSha256": "64 lowercase hex",
    "rootCount": 135,
    "variantCount": 267,
    "missingCount": 0,
    "extraCount": 0,
    "proofSha256": "64 lowercase hex"
  },
  "evidence": [
    {
      "path": "repository path",
      "sha256": "64 lowercase hex"
    }
  ],
  "protectedOutputs": [
    {
      "path": "repository path",
      "operation": "add-exact | replace-exact | project",
      "baseSha256": null,
      "headSha256": "64 lowercase hex or null",
      "projectionSha256": "64 lowercase hex or null"
    }
  ],
  "destinations": [
    {
      "status": "selected-passing | audit-passing-unselected | blocked",
      "blocker": "blocker name or null",
      "issue": 76
    }
  ]
}
```

`source.entryLedgerSha256` is an exact SHA-256 or explicit `null`; it is never
omitted or inferred.

`reconciliation` is either explicit `null` or the exact object above. Its proof
hash is:

```text
sha256(preservedTaxonomySha256 + NUL +
       authorityTaxonomySha256 + NUL +
       selectorPathSha256 + NUL +
       decimal rootCount + NUL +
       decimal variantCount + NUL +
       decimal missingCount + NUL +
       decimal extraCount + NUL)
```

`evidence` is a closed path-sorted list of exact immutable evidence files. It is
empty when the authority has no separate evidence files.

`protectedOutputs` is a closed path-sorted set:

- `add-exact` requires `baseSha256: null`, an exact `headSha256`, and
  `projectionSha256: null`;
- `replace-exact` requires exact base and head byte hashes and
  `projectionSha256: null`;
- `project` requires exact base bytes, `headSha256: null`, and an
  artifact-specific canonical projection hash.

A record cannot grant a wildcard directory or generated namespace.

`destinations` is a canonical sorted closed set. Selected-passing and
audit-passing-unselected are explicit terminal destinations. A blocked destination
must name an existing blocker and exact owning issue.

Unknown properties, duplicate values, noncanonical order, noncanonical JSON, and
reserved namespace names fail parsing.

## Bootstrap PR

The bootstrap PR remains schema v2 and uses the existing BASE-owned
`foundation-maintenance` marker. Its exact BASE is
`9d2df395b792230529094cdffc4d9c694e2b357c`, with manifest SHA-256
`f65f9a499acb92a933fedc5ee9197cc6a4c51ce30b5180cc741b23a93c9dfe92`.

It may modify only files already permitted by the trusted BASE
`foundation-maintenance` profile. It installs:

- split manifest-v3 and fragment-v2 parsers while preserving v2 operation;
- one exact `roadmap-authority-migration` marker and verifier;
- one exact `roadmap-authority-prepare` marker and verifier;
- consumer marker parsing and pending-to-applied verification;
- protected artifact projection verifiers;
- live target-main SHA attestation in the generated privileged workflow;
- focused tests and documentation.

It must keep the manifest and all decision fragments byte-identical. It cannot add
an authority record, change a protected output, select a new marker, or execute
HEAD policy. The current BASE checker validates this PR entirely as v2
`foundation-maintenance`.

The current trusted profile does not permit a new documentation path. This
standalone file is the review artifact on the local design branch. Before the
bootstrap PR is opened:

- its bootstrap requirements are appended as a labeled addendum to the already
  permitted
  `docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md`;
- the complete approved standalone design bytes are embedded between unique
  extraction markers in that addendum with an exact SHA-256;
- the complete approved standalone plan bytes are embedded between unique
  extraction markers in the already permitted
  `docs/superpowers/plans/2026-08-20-provenance-foundation-maintenance.md` with an
  exact SHA-256;
- this standalone path is absent from the bootstrap HEAD;
- the bootstrap migration verifier explicitly permits this exact standalone path
  in the later migration PR, where the complete approved design becomes durable.

The migration restores both documents from the verified bootstrap BASE addenda and
checks their SHA-256 identities. It does not depend on a feature-branch commit
remaining reachable. The bootstrap HEAD therefore does not broaden its own trusted
v2 path set.

After exact-head review and checks, the bootstrap PR is squash-merged. Its squash
SHA, manifest SHA, checker SHA, and workflow SHA become mandatory migration pins.

## Schema-v3 Migration PR

The migration PR is fresh from the verified bootstrap squash SHA. It is the only
schema-v2 to schema-v3 migration.

Its PR body contains exactly this ordered marker:

```text
<!-- es2015-roadmap-authority-migration
parent:70
base:<BASE_SHA>
base-manifest-sha256:<SHA256>
base-checker-sha256:<SHA256>
base-workflow-sha256:<SHA256>
head-manifest-sha256:<SHA256>
-->
```

The BASE bootstrap checker accepts the exact `roadmap-authority-migration` marker
only when:

- the event BASE equals the verified live `refs/heads/main`;
- BASE manifest/checker/workflow hashes equal the recorded bootstrap pins;
- HEAD changes match the closed migration file set;
- the old manifest is the exact expected schema-v2 document;
- HEAD is a canonical schema-v3 document;
- the BASE addenda each contain exactly one marked standalone-document payload
  whose declared SHA-256 matches its bytes;
- each HEAD standalone document is byte-identical to the corresponding verified
  BASE addendum payload;
- no consumer protected-output projection occurs.

The migration:

1. changes only the manifest schema from 2 to 3;
2. preserves the 13 decision fragments byte-for-byte;
3. preserves the 15 legitimate range-profile objects as canonical-object
   identical:
   - `foundation`;
   - `foundation-maintenance`;
   - 13 `decision:<CODE>` profiles;
4. deletes exactly `maintenance:issue77-lexical`;
5. adds P0 as historical `applied`;
6. adds H0 as `pending`;
7. verifies all currently valid #77 generated outputs remain unchanged.

The legacy `foundation-maintenance` profile remains only as canonical history in
the migrated manifest. The bootstrap checker rejects it as a selected marker once
BASE is schema v3. No future PR may consume it.

No general v2 migration path remains after this migration PR.

## Future Authority Preparation

Future authority preparation uses this separate ordered marker:

```text
<!-- es2015-roadmap-authority-prepare
parent:70
code:<CODE>
issue:<ISSUE>
base:<BASE_SHA>
base-manifest-sha256:<SHA256>
record-sha256:<SHA256>
-->
```

The BASE checker indexes BASE and HEAD records by code, requires every BASE record
to retain canonical identity, identifies exactly one new HEAD record, and requires
the full HEAD array to remain code-unit sorted. It canonicalizes that new record
and requires `record-sha256` to equal its canonical bytes. It requires the marker
BASE and manifest hash to equal the resolved range BASE. A valid middle insertion
such as `[H0, P0] -> [H0, M0, P0]` is accepted.

The operation uses existing BASE executable code. It may:

- add exactly one canonical `pending` record;
- rewrite only the canonical manifest serialization that contains that one appended
  record;
- update only these optional documentation paths:
  - `docs/testing.md`;
  - `docs/superpowers/specs/2026-08-21-roadmap-authority-state-machine-design.md`;
  - `docs/superpowers/plans/2026-08-21-roadmap-authority-state-machine.md`.

It may not:

- alter or delete an existing authority;
- add more than one authority;
- change a pending record to applied;
- change semantic source or protected generated outputs;
- modify decision fragments or range profiles;
- select `foundation-maintenance`;
- introduce new executable policy and consume it in the same PR.

The new record is inert until merged to main and independently verified.
Missing, duplicate, malformed, reordered, or mismatched preparation markers fail.
The preparation path set is closed; no source, test, workflow, checker, decision
fragment, or other documentation path is allowed.

## Consumer Marker

The PR body contains exactly one ordered marker:

```text
<!-- es2015-roadmap-authority-consume
parent:70
code:<CODE>
issue:<ISSUE>
profile:roadmap-reclassification:<CODE>
base:<BASE_SHA>
source-path-sha256:<SHA256>
source-entry-sha256:<SHA256|null>
protected-projection-sha256:<SHA256>
-->
```

The parser accepts no alternate ordering, duplicate field, extra field, whitespace
variant, or second marker. The values must equal the canonical BASE pending record.
`source-entry-sha256` is either 64 lowercase hexadecimal characters or the literal
`null`, exactly matching `source.entryLedgerSha256`. `base` binds the resolved range
BASE commit; it is not duplicated inside the authority record.

`protected-projection-sha256` is the SHA-256 of this canonical JSON array plus one
final newline:

```json
[
  {
    "path": "code-unit-sorted protected path",
    "operation": "add-exact | replace-exact | project",
    "sha256": "headSha256 for exact operations, projectionSha256 for project"
  }
]
```

The H0 aggregate projection SHA-256 is
`8e16b33ffdbd8a2089567e9a8bdb1c654619b8bd00021c54ac74c0ab02f2c5fd`.

Missing, malformed, duplicate, stale, HEAD-defined, or mismatched markers fail.

## Consumer Range Validation

The checker reads and validates BASE before reading HEAD authority data.

For `roadmap-reclassification:<CODE>` it requires:

1. BASE is the merge base, event base, and freshly resolved live target-main
   commit.
2. BASE manifest is canonical v3.
3. BASE contains exactly one matching `pending` authority.
4. HEAD contains exactly the same entry with only `state: applied`.
5. All other authority records are canonical-object identical.
6. All range profiles are canonical-object identical.
7. All decision fragments are byte-identical.
8. Gate-owner executable files are byte-identical unless the active operation is
   the corrective migration itself.
9. The NUL-delimited full diff contains no rename, copy, or deletion of a protected
   artifact.
10. The protected projection is nonzero and exactly authorized.

An `applied` BASE record cannot be replayed. A HEAD-only authority cannot be
consumed. A pending-to-applied transition with zero protected output fails. A
protected output without a transition fails.

Unrelated source, tests, specifications, and manual documentation are outside the
provenance projection and remain subject to ordinary CI and review. Provenance
neither authorizes nor rejects them unless they are a closed protected path.

Before marker parsing can return neutral, provenance ownership is computed from
canonical BASE:

- every `roadmapAuthorities[].protectedOutputs[].path`;
- every immutable `roadmapAuthorities[].evidence[].path`;
- the manifest, checker, workflow generator, generated workflow, and decision
  fragments;
- the closed generated Test262 namespaces already owned by the provenance
  foundation.

Any markerless change to one of these paths fails. HEAD cannot remove a BASE-owned
path from the ownership set.

## Protected Artifact Verifiers

The checker dispatches by exact protected path. Generic byte-change permission is
not sufficient.

### Taxonomy

- Only source-ledger roots may change.
- Each root retains its exact variant count.
- The base selector and source status match the authority.
- Final states are selected-passing, exact audit-passing-unselected, or an allowed
  blocker/owner destination.
- Foreign classifications are byte-equivalent.
- Whole-tree roots and variants remain balanced.

### Audit evidence

- Only source-ledger variants may change.
- Each record has exact expected variants and terminal status.
- Missing, duplicate, incomplete, skipped, or foreign execution evidence fails.
- Atomic generation writes no success-shaped partial output.

### Upstream subset

- Only exact registered additions or removals are accepted.
- Group, path, count, canonical order, and ledger hash must match.
- Every other group and field is byte-equivalent.

### ES5 selection

- Only the exact registered tuple delta is accepted.
- The delta does not classify or remove the path from T1.
- Every other exclusion and configuration field is byte-equivalent.

### Test262 report

- Only exact selected source-ledger variants and canonical summaries may change.
- Foreign records are byte-equivalent.

### Conformance documentation

- Only the generated conformance block participates in the authority projection.
- The block must equal the canonical renderer.
- Manual prose outside the block remains ordinary review surface and is compared
  separately from the generated projection.

### Closed generated namespaces

Generated Test262 artifacts not named by the active record are forbidden. Symlink,
path traversal, sibling-prefix, encoded alias, and external target escapes fail
physical repository containment.

## P0 Historical Applied Authority

P0 records issue #77 as already applied:

- parent issue: `70`
- issue: `77`
- state: `applied`
- base taxonomy SHA-256:
  `e7746b6da6038c1fda83e1e6cbecbe9fb3e7b97bdf89a311c0a3f34a686c7953`
- source: `83 roots / 164 variants`
- path-list SHA-256:
  `b2657db74331391b156f87e1e831665ef4ae3a738d48836e476c13828b1aeff4`
- semantic entry-ledger SHA-256:
  `3b23ac8dbc2ae703d466d49e26d827516e4a863406a45acb4e8356c86c32d664`
- reconciliation: `null`
- evidence: empty
- upstream subset: 22 exact additions in only `language/expressions` and
  `language/statements`
- subset delta SHA-256:
  `88d2521688bf3f036d2d94977914580d218fbc442bf38ef11e2cf9b8ce529a5f`
- ES5 selection: exact removal of
  `test/staging/sm/class/newTargetEval.js`
- ES5 selection delta SHA-256:
  `2b0654600cf2159c828be9489826e85f3565a32b82019e2dfc2c41ec80870b38`

Its closed historical protected-output set is:

| Path                                       | Operation       | BASE SHA-256                                                       | applied SHA-256                                                    |
| ------------------------------------------ | --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `tools/test262/es2015-taxonomy.json`       | `replace-exact` | `e7746b6da6038c1fda83e1e6cbecbe9fb3e7b97bdf89a311c0a3f34a686c7953` | `dcc14a00a21c8e76351f75a24ec6e2ff52db9bd02f63d3ece0e4d6634121d662` |
| `tools/test262/es2015-audit-evidence.json` | `replace-exact` | `d560df3e1a9af905115324d529a0a101943d30fa0af8a8102b2dd344121ba9e4` | `58f92e072306bfe99f8b9a57bf959469100b0e54816bef3263ec9b6c075a4990` |
| `tools/test262/upstream-subset.json`       | `replace-exact` | `cceaaf9807c0d32c32be5b0800a140612afddf9acf49bcdc0cf8f0102562fb39` | `e76d5624e999b852df2c8c1bdb7dfebdcc5952083eb175f7ab67bd39ad75e4d8` |
| `tools/test262/es5-selection.json`         | `replace-exact` | `20f0fc1d84bcec4efb934ef46b23a532d41502d6fcf88a307231d647a2c700f8` | `533e0b9fc165a026d64c4e64d783cf2585de7236600acacf228f06d27f23d8c8` |
| `docs/test262-report.jsonl`                | `replace-exact` | `9de8674a603263d5d80d9e48d255879efa061b648cc9cb32eff399941a6927df` | `c559d673e7ff2af88343eadf58b292db45d71ef99915699cc5d8e5310a73fc27` |
| `docs/conformance.md`                      | `replace-exact` | `3799ff93e726fdd181377417b6307801dc1ae1d5e884181d0bc4c4bd68ba2466` | `22b8f8c5368e922919987f53aa273b8cc4234435e2adf72ffcba164082e01f85` |

Its destination set contains:

- `selected-passing` with null blocker and issue `77`;
- `audit-passing-unselected` with null blocker and issue `77`;
- `blocked:remaining-standard-library-additions` owned by issue `95`.

The P0 transition preserves 82 blocker-map removals and the single reviewed
reassignment to `remaining-standard-library-additions`, owned by issue #95/L2.
The `newTargetEval.js` selection removal does not alter its unknown-edition
classification or any decision fragment.

The migration proves the current #77 outputs match this historical authority
without changing those outputs.

## H0 Pending Authority

H0 prepares issue #76:

- parent issue: `70`
- issue: `76`
- state: `pending`
- source: `135 roots / 267 variants`
- source path SHA-256:
  `3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950`
- source entry-ledger SHA-256: `null`
- authority base taxonomy SHA-256:
  `dcc14a00a21c8e76351f75a24ec6e2ff52db9bd02f63d3ece0e4d6634121d662`
- preserved pre-P0 H0 source taxonomy SHA-256:
  `e7746b6da6038c1fda83e1e6cbecbe9fb3e7b97bdf89a311c0a3f34a686c7953`
- expected selected promotion: `40 roots / 78 variants`
- expected reassignment: `95 roots / 189 variants`
- promotion SHA-256:
  `a5ad87badd75c547f4f4e2fb0b5d0536b4969ea3bf97676333f970434e5cfa2c`
- promotion ledger SHA-256:
  `17d850eaf79e80f0260f8332a2bc594d3492bb286084c51e87f06cd6ec8853a7`
- owner-map SHA-256:
  `d50f58ed621eac896fceb325f54480d33c9680c0f6b264a6cbce5812c7f4f44b`
- disposition SHA-256:
  `a48db4417e1ad41298e0d24bb6e1ef1925d6a812ab59a1541ce14ec2a06df857`
- owner-deltas SHA-256:
  `ddb0001ef1ba607e785ba63560305144b8cd39c95c76b85c2375c38562b1618b`

Its canonical reconciliation object is:

```json
{
  "preservedTaxonomySha256": "e7746b6da6038c1fda83e1e6cbecbe9fb3e7b97bdf89a311c0a3f34a686c7953",
  "authorityTaxonomySha256": "dcc14a00a21c8e76351f75a24ec6e2ff52db9bd02f63d3ece0e4d6634121d662",
  "selectorPathSha256": "3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950",
  "rootCount": 135,
  "variantCount": 267,
  "missingCount": 0,
  "extraCount": 0,
  "proofSha256": "10f0381153294c2be9c764b00cfa44d535e4c2af61f26d1d8cc9650787a21ca8"
}
```

The pending entry freezes these six exact evidence files:

| Path                                        | SHA-256                                                            |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `tools/test262/es2015-h0-baseline.json`     | `01c9f90704fe9ea6d892c4e758817fbe9bc30368486a58f12b47068e6b2080ec` |
| `tools/test262/es2015-h0-disposition.json`  | `a48db4417e1ad41298e0d24bb6e1ef1925d6a812ab59a1541ce14ec2a06df857` |
| `tools/test262/es2015-h0-owner-deltas.json` | `ddb0001ef1ba607e785ba63560305144b8cd39c95c76b85c2375c38562b1618b` |
| `tools/test262/es2015-h0-owner-map.json`    | `d50f58ed621eac896fceb325f54480d33c9680c0f6b264a6cbce5812c7f4f44b` |
| `tools/test262/es2015-h0-paths.json`        | `bf3c2ed9c9e259bb25d3c5289a57c4daa5576b6d68d868df74f73c7a95bef893` |
| `tools/test262/es2015-h0-promotion.json`    | `a5ad87badd75c547f4f4e2fb0b5d0536b4969ea3bf97676333f970434e5cfa2c` |

Each of these six paths appears identically in both `evidence` and
`protectedOutputs`. Its protected operation is `add-exact`, `baseSha256` is
`null`, `headSha256` is the table SHA-256, and `projectionSha256` is `null`.

The guarded migration base taxonomy SHA-256 is
`dcc14a00a21c8e76351f75a24ec6e2ff52db9bd02f63d3ece0e4d6634121d662`.
The H0 record must include a reviewed nonintersection proof that movement from the
preserved H0 source taxonomy
`e7746b6da6038c1fda83e1e6cbecbe9fb3e7b97bdf89a311c0a3f34a686c7953`
to this guarded base leaves the exact 135-root / 267-variant H0 selector unchanged.
If that proof does not hold, the H0 record must be repinned under separately
reviewed evidence before merge.

The checker independently recomputes the selector set and variant sum from both
taxonomy files, requires zero missing and extra paths, and then recomputes
`proofSha256`; hashing the declared fields without those semantic comparisons is
insufficient.

Four shared generated files are projection-verified rather than frozen as complete
old-branch bytes:

| Path                                  | BASE SHA-256                                                       | projection SHA-256                                                 |
| ------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `tools/test262/es2015-taxonomy.json`  | `dcc14a00a21c8e76351f75a24ec6e2ff52db9bd02f63d3ece0e4d6634121d662` | `dc96bb2a162db339d13cdb119a86e29ec0e3dbe31fee29780fc1cc1995c87c02` |
| `tools/test262/upstream-subset.json`  | `e76d5624e999b852df2c8c1bdb7dfebdcc5952083eb175f7ab67bd39ad75e4d8` | `257c3e960ba14b8ebabd2ba92e7777d2a26b8a456ae6123c71e4e2349dd9ba6f` |
| `docs/test262-report.jsonl`           | `c559d673e7ff2af88343eadf58b292db45d71ef99915699cc5d8e5310a73fc27` | `a13390c77ffb89cdad7b043924c2d4318e8f27dd8e4f38bab943363b5e9b73cd` |
| `docs/conformance.md` generated block | `22b8f8c5368e922919987f53aa273b8cc4234435e2adf72ffcba164082e01f85` | `c44ef2d084be750bca79a574ae041c2a757d452c71f2dffaf59badc7c6a9fcb8` |

Each row uses protected operation `project`, the listed `baseSha256`,
`headSha256: null`, and the listed `projectionSha256`.

Each H0 projection SHA is:

```text
sha256(path + NUL + source.pathSha256 + NUL +
       promotion headSha256 + NUL + owner-deltas headSha256 + NUL)
```

Their H0 deltas are regenerated over the guarded BASE so unrelated P0 movement is
preserved. Any unexplained change to the 135-path selector, source taxonomy,
registered evidence files, or shared generated projection invalidates the pending
authority and requires review rather than silent repinning.

Its destination set contains:

- `selected-passing` with null blocker and issue `76`;
- `blocked:binary-data-and-typed-arrays` owned by issues `87`, `88`, and `89`;
- `blocked:early-errors-and-declaration-instantiation` owned by issue `78`;
- `blocked:keyed-collections` owned by issues `83`, `84`, and `85`;
- `blocked:proper-tail-calls` owned by issue `97`;
- `blocked:proxy-and-reflect-metaobject` owned by issues `79` and `81`;
- `blocked:regexp-unicode-and-sticky` owned by issue `91`;
- `blocked:remaining-language-runtime-semantics` owned by issue `96`;
- `blocked:remaining-standard-library-additions` owned by issues `93`, `94`, and
  `95`;
- `blocked:symbol-protocol-dispatch` owned by issue `92`.

These 17 canonical destination objects — 16 blocked owner pairs plus one
`selected-passing` entry — are sorted by status, blocker, and issue and must
equal the unique pairs encoded by `tools/test262/es2015-h0-owner-map.json`
plus the single selected destination.

The H0 consumer changes only this entry from pending to applied. It must not add or
modify authority records, profiles, fragments, or checker policy.

## Workflow Integration

The generated workflow keeps the PR #105 security boundary:

- `pull_request_target` with no path filter;
- canonical repository and target branch validation;
- BASE checkout only;
- inert fetch of the PR head ref;
- exact fetched-ref/FETCH_HEAD/event-SHA equality;
- no HEAD checkout or execution;
- no npm cache, artifacts, secrets, write permission, or persisted credentials;
- imports and executes only BASE checker code.

Before range validation, the privileged job performs an inert fetch of
`refs/heads/main` into a dedicated remote-tracking ref. It requires that resolved
commit to equal both the event BASE SHA and the checked-out BASE SHA. A stale event
or target-main movement fails and must rerun against the new BASE.

GitHub does not evaluate an expression-valued job name when a job-level `if` skips
the job. Therefore the guard job itself is unconditional so its dynamic name is
always evaluated:

- on `pull_request_target`, its name is exactly `Provenance base guard`, every
  security/checker step runs, and the inactive step skips;
- on every other event, its name is exactly `Provenance base guard (inactive)`,
  every security/checker step skips, and one constant no-op inactive step succeeds.

This prevents the raw expression from appearing as the check name and prevents an
ordinary skipped job from satisfying the future required context
`Provenance base guard`. Ordinary CI jobs remain excluded from the privileged
event. Consumer PRs must show the active context at the exact reviewed head.

## Error Handling

Policy failures are explicit, path-specific errors. The checker does not catch and
convert unexpected failures into neutral or successful results.

Errors identify:

- operation and roadmap code;
- BASE and HEAD identities;
- exact record or protected path;
- expected and actual state/hash/count;
- whether the failure is schema, marker, range, containment, or artifact-specific.

No invalid input returns an empty projection, default profile, inferred authority,
or success-shaped fallback.

## Testing Strategy

Implementation uses strict RED-first focused TDD.

### Parser and canonicalization

- manifest v3 accepted; v2 rejected outside the one migration path;
- decision fragments remain v2;
- sorted unique authorities;
- unknown fields, duplicate codes/issues, bad states, reserved names, and
  noncanonical JSON rejected.

### Migration

- bootstrap PR leaves manifest/fragments byte-identical and cannot select new
  markers;
- bootstrap exact-head and exact-main checker/workflow identities pinned;
- migration exact base identity and v2 manifest hash pinned;
- invalid #77 profile deleted;
- 15 legitimate profile objects canonical-equal;
- 13 fragments byte-equal;
- P0 applied and H0 pending exact;
- #77 protected outputs byte-equal;
- legacy `foundation-maintenance` cannot be selected afterward.

### Preparation

- separate canonical preparation marker required;
- BASE commit, BASE manifest, and appended-record hashes exact;
- exactly one pending append accepted;
- mutation/deletion/reordering of existing records rejected;
- applied append, multiple append, semantic output, profile, fragment, and
  executable-policy changes rejected.

### Consumer state machine

- exact pending-to-applied plus nonzero projection accepted;
- HEAD-only authority, replay, wrong code/issue/base/hash, applied-to-applied,
  pending mutation, zero projection, and partial projection rejected.

### Artifact projections

Each verifier has positive fixtures and negative fixtures for foreign records,
wrong counts, wrong owners, stale hashes, reorderings, missing variants, partial
writes, aliases, traversal, symlinks, rename/copy/delete, and another authority's
output.

### Workflow contract

Generated workflow tests prove BASE-only execution, active migration, preparation,
and consumer dispatch, event/head/live-main equality, no privileged HEAD execution,
and ordinary CI exclusion.

### Local commands

Local validation is limited to targeted Node tests, direct checker fixtures,
`ci:check`, typecheck, scoped lint/format, and `git diff --check`.

Never run full/broad Test262, `test262:upstream`,
`test262:upstream:check`, `ci:contract`, browser suites, JavaScriptCore suites, or
wrappers that transitively invoke them. Focused `TZ=UTC` path sets may run only when
the implementation plan explicitly requires them.

## Review and Delivery

1. Commit this exact-base design with Copilot authorship.
2. Obtain independent specification critique and resolve all Critical/Important
   findings.
3. Write a detailed TDD implementation plan covering both PRs.
4. Implement the schema-v2 bootstrap on this fresh branch; do not transplant
   quarantined code or GREEN evidence.
5. Obtain task-scoped and whole-branch independent reviews.
6. Push the bootstrap PR and require exact-head active BASE guard, ordinary CI,
   both CodeQL categories, and zero open alerts.
7. Squash merge the bootstrap and verify exact-main bytes, checker/workflow pins,
   checks, CodeQL categories, zero alerts, and issue #75 still open.
8. Create a second fresh migration branch from that exact squash SHA.
9. Implement only the pinned schema-v3 migration, P0 applied record, and H0 pending
   record under the BASE bootstrap verifier.
10. Repeat exact-head review/security/CI/CodeQL gates, squash merge, and exact-main
    verification.
11. Only then resume #76, #79, and the #75 hierarchy.
