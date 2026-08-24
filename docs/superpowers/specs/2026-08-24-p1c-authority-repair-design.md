# P1C Authority Repair Design

## Status and decision

This is a design-only trust-root repair for P1C/#116. It starts from exact
main:

```text
edccfb8822339dab53c47bbb8c4ae5cc2db93b1b
```

That commit is PR #117's squash merge and contains the original P1C authority
in `pending` state.

Use one narrowly scoped, one-use, ordinary-`pull_request` HEAD-checker repair
modeled on the historical M1 authority repair but hard-coded for P1C. The
repair replaces only the still-pending P1C authority record. It changes no P1C
evidence, protected output, selection output, runtime, workflow, pipeline, or
decision-fragment byte. P1C remains `pending`.

After the repair is squash-merged and repaired main is verified, abandon PR
#118 as a delivery candidate. Create a fresh semantic branch from the repair
merge, replay the exact pre-consumer semantic range, add the exact four-path
collateral projection and historical-audit reversal, update P1R/decomposition
accounting, and perform one normal P1C `pending -> applied` consumption with
the corrected aggregate.

The parser is not weakened. The selected authority is repaired.

## Normative diagnostic

The normative diagnostic for this design is:

```text
/home/jordan/jsjs/.worktrees/issue78-decomposition/.superpowers/sdd/2026-08-23-p1c-catch-binding-semantics/task-9-authority-repair-diagnostic.md
```

Its exact reviewed semantic HEAD is:

```text
e937140d8b40e2599faf98a8e6b370982036e61d
```

Its exact PR/base is PR #118 against
`edccfb8822339dab53c47bbb8c4ae5cc2db93b1b`. The diagnostic changed no tracked
file and ran Test262 only for the four affected roots. Full-tree work was
limited to deterministic selection, taxonomy, report, conformance, authority,
and provenance reconstruction in ignored archived trees.

This design adopts the diagnostic's exact identities, counts, byte hashes, and
delivery conclusion.

## Exact repair branch and documentation sequencing

The repair branch is:

```text
yoonbuck-p1c-authority-repair
```

in:

```text
/home/jordan/jsjs/.worktrees/p1c-authority-repair
```

It is rooted at exact BASE
`edccfb8822339dab53c47bbb8c4ae5cc2db93b1b`.

The design, future implementation plan, checker change, pending-manifest
repair, focused tests, and testing documentation must remain on this one
exact-base branch until the complete repair PR. The design-only commit is not a
mergeable repair by itself. No repair document may land independently on
`main`, because moving `main` invalidates the exact-base one-use marker and
requires a fresh diagnostic, identities, design, and review.

The two repair documentation paths are exactly:

```text
docs/superpowers/specs/2026-08-24-p1c-authority-repair-design.md
docs/superpowers/plans/2026-08-24-p1c-authority-repair.md
```

Any other date or path is foreign to the final six-path range.

## Root cause

### The exact four roots

The defect is limited to four generated ES2016 nested
`BindingRestElement : ... BindingPattern` roots:

```text
test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-ary-elem.js
test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-ary-rest.js
test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-obj-id.js
test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-obj-prop-id.js
```

Each root is generated, has `non-strict` and `strict` variants, declares
`destructuring-binding` and `default-parameters`, and uses a binding-rest
element whose argument is an array or object `BindingPattern`.

Representative forms are:

```js
([...[x, y, z]] = [3, 4, 5]) => {};
([...[...x]] = values) => {};
([...{ length }] = [1, 2, 3]) => {};
([...{ 0: v, length: z }] = [7, 8, 9]) => {};
```

The Sixth Edition permits only:

```text
BindingRestElement : ... BindingIdentifier
```

The Seventh Edition adds:

```text
BindingRestElement : ... BindingPattern
```

These four roots are therefore ES2016 P1R/later material, not ES2015 P1C
semantic roots.

### Why BASE selected them

The pre-P1C parser validated final rest placement but did not require a binding
rest argument to be a `BindingIdentifier`. The broad generated selector uses
that parser, so BASE treated all four roots as supported ES2015 candidates.

Focused execution proves:

| Revision  | Roots | Variants | Passed | Failed | Result                                                                        |
| --------- | ----: | -------: | -----: | -----: | ----------------------------------------------------------------------------- |
| `edccfb8` |     4 |        8 |      8 |      0 | selected and passing                                                          |
| `e937140` |     4 |        8 |      0 |      8 | `parse-error`: `SyntaxError: rest elements are not supported in this context` |

P1C correctly added the missing binding/assignment-context argument check.
That parser correction necessarily makes the same four roots ineligible for
selection.

### Why the authority is stale

The pending P1C authority was prepared from the pre-P1C parser/selector base.
Its projection contract says, in effect:

```text
HEAD subset = BASE subset + exact 81-root P1C promotion
foreign taxonomy classifications remain unchanged
```

That contract cannot express removing four foreign roots selected at BASE.
The stale consumer copied the reviewed projection exactly, so provenance
passed while independent selection regeneration failed. The parser and
selection check are correct; the pending projection commitments are not.

## P1C invariants that must not change

### Source identity

```text
base taxonomy:
fba700539b05edd67b6cf67e4c0a1361398a2d0f04212bc7080a83f44abf577a

roots:
81

variants:
161

path SHA-256:
e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5

entry ledger:
null

reconciliation:
null
```

The sole destination remains:

```json
{
  "status": "selected-passing",
  "blocker": null,
  "issue": 116
}
```

The disposition remains 81 entries, all `selected-passing`, all with
`blocker: null` and issue `116`.

### Exact six evidence files

| Path                                         | SHA-256                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `tools/test262/es2015-p1c-baseline.json`     | `86e3ca7c89716f4624bf029816bfe41befbc0a86c0d67ffe7066d7d27e8ed9e4` |
| `tools/test262/es2015-p1c-disposition.json`  | `662616db1c184b2475f091ef5c380760afacb298abae8cf6fe7fac0ae528d3bc` |
| `tools/test262/es2015-p1c-owner-deltas.json` | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |
| `tools/test262/es2015-p1c-owner-map.json`    | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |
| `tools/test262/es2015-p1c-paths.json`        | `d7cd9512d5eb520b1ac9cbbbcc9414381d5de2b1c7de35fa891b5a100352d124` |
| `tools/test262/es2015-p1c-promotion.json`    | `5c201d87dc4c0b7a18d3dce7e1c69933356f628008a6ef837eb5353641610501` |

The changed aggregate audit evidence is not one of these six files. The repair
must not alter any of these evidence hashes or bytes.

## Corrected future consumer outputs

The repair records exact commitments for the later semantic consumer; it does
not write these generated bytes itself.

### Exact corrected output hashes

| Output                                     | Stale applied SHA-256                                              | Corrected applied SHA-256                                          | Corrected bytes |
| ------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------: |
| `tools/test262/upstream-subset.json`       | `2a8128d47e577341200c8571a74556899a44fdcd182d8e621e7798d404b4ca19` | `5a5b83b3c28991c5f2ac141ed949a9698966cce85587d671a4417228d5e08b14` |       1,513,870 |
| `docs/test262-report.jsonl`                | `abcdf8240da7264fcccf3fcc4bada1f10c35eb02810aa3d87b6a67b13437a07a` | `89002c4b597748a53ccc4ea60df25d981660f4311cee1e933f95fd13b39e69ff` |       5,489,575 |
| `docs/conformance.md`                      | `d59027686ed08e1e5c3a3cf3d523b2716d91991353810744dd2444f9d662fffd` | `9cc4250ed8a69e7d62e82ad7452bb2563c319856ed97a53bd00b96d0017c6cfe` |          56,996 |
| `tools/test262/es2015-audit-evidence.json` | `06817df31fa640d058ce19ac6b01e589e487313a7ec6572f3d888d5412ffd197` | `50f9a54346d0e9e5168a6ac6b0b8de6d709e2c5b808d6c8b036e5113612e638c` |       4,376,944 |
| `tools/test262/es2015-taxonomy.json`       | `2db8bf5b5a6987362b77e539f57724f279570eb83f46641b158843996e6216d3` | `fdf3c8bf229f6c841209e4c4a2196001d45cf0a1c270f334cf06e5f54a00f3c7` |      23,272,099 |

### Exact corrected counts

Subset/report/conformance:

| Measure                         | Stale applied | Corrected applied |
| ------------------------------- | ------------: | ----------------: |
| Groups                          |            62 |                62 |
| Selected roots                  |        20,676 |            20,672 |
| Selected variants               |        39,300 |            39,292 |
| `language/expressions` roots    |         2,784 |             2,780 |
| `language/expressions` variants |         5,194 |             5,186 |
| Passed variants                 |        39,300 |            39,292 |
| File coverage                   |       38.593% |           38.585% |
| Variant coverage                |       38.188% |            38.18% |

Audit evidence:

| Measure                | Stale applied | Corrected applied |
| ---------------------- | ------------: | ----------------: |
| Audit records          |        21,854 |            21,862 |
| Blocker entries        |         5,010 |             5,014 |
| Intentional deviations |             2 |                 2 |

Taxonomy:

| Core status                                          |                  Stale applied | Corrected applied |
| ---------------------------------------------------- | -----------------------------: | ----------------: |
| `selected-passing`                                   | 19,849 roots / 37,792 variants |   19,845 / 37,784 |
| `blocked:early-errors-and-declaration-instantiation` |                      402 / 790 |         406 / 798 |

Whole-tree roots, variants, and partition totals remain unchanged. Each of the
four affected classifications becomes provisionally:

```json
{
  "variants": 2,
  "partition": "core",
  "status": "blocked:early-errors-and-declaration-instantiation",
  "blocker": "early-errors-and-declaration-instantiation"
}
```

Features, flags, includes, and provenance remain byte-equivalent. This is an
interim representation until P1F/P1R moves the roots to
`later-or-non-es2015`.

## Corrected protected-output contract

Report and conformance remain semantic `project` outputs. The six evidence
paths remain `add-exact`. Only the three commitments that cannot represent the
collateral delta change.

| Path                                       | Corrected operation | BASE SHA-256                                                       | Corrected HEAD/projection SHA-256                                             |
| ------------------------------------------ | ------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `docs/conformance.md`                      | `project`           | `61ed7a18ff9d77c9b0b3e5d4c598ce30e998d633be88bb1bc101c650aee65169` | projection `798f8dae856b6a774a787606684e2dd3b2109a983f09783323084b8978425ba5` |
| `docs/test262-report.jsonl`                | `project`           | `ead91d3f6c0f23f8cfbe839bef3e371539e5f8fa590b9b351570714ce740e5c8` | projection `1dedeb49f3849b8fa89f03b720830d0d51f3a6b9cba6f7060d5bdae490c6fd9a` |
| `tools/test262/es2015-audit-evidence.json` | `replace-exact`     | `eabaeb8245a6988443d91b21219c9e7919ec22639d6e8515a8dadbe5ddfc217f` | HEAD `50f9a54346d0e9e5168a6ac6b0b8de6d709e2c5b808d6c8b036e5113612e638c`       |
| `tools/test262/es2015-taxonomy.json`       | `replace-exact`     | `fba700539b05edd67b6cf67e4c0a1361398a2d0f04212bc7080a83f44abf577a` | HEAD `fdf3c8bf229f6c841209e4c4a2196001d45cf0a1c270f334cf06e5f54a00f3c7`       |
| `tools/test262/upstream-subset.json`       | `replace-exact`     | `9f768aa8fb0c473e98fe2156d290c4207cea797302cccad6f9b1b922a36b37c0` | HEAD `5a5b83b3c28991c5f2ac141ed949a9698966cce85587d671a4417228d5e08b14`       |

The exact authority-record delta is only:

1. audit evidence `headSha256` changes from `06817d...` to `50f9a5...`;
2. taxonomy changes from `project` to `replace-exact`, sets exact corrected
   `headSha256`, and clears `projectionSha256`; and
3. subset changes from `project` to `replace-exact`, sets exact corrected
   `headSha256`, and clears `projectionSha256`.

Generic subset projection cannot encode four removals. Generic taxonomy
projection intentionally rejects foreign classification changes. Exact
replacement is therefore the smallest closed contract. Report and conformance
remain projected so the consumer retains independent deterministic
reconstruction checks.

## Exact authority identities

| Identity                                       | Exact value                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| Repair BASE                                    | `edccfb8822339dab53c47bbb8c4ae5cc2db93b1b`                         |
| BASE manifest SHA-256                          | `55b95d0fb5071b411dd3d82051496505e154f043adee62c2bd2e4aae643c2227` |
| BASE checker SHA-256                           | `c806b9987a647b790ecfa736f4b6cc960e86c78755c3a824885313bae4b37e96` |
| BASE P1C canonical record SHA-256              | `3281bd0001ac48ee6f31d21d12a8faade3652cd194360fcf21c3ffc1b9a3a193` |
| Corrected pending P1C canonical record SHA-256 | `95036226ee50e365b03c823bab751c6e1d646af0d5c6352a199cd442e2aa9278` |
| Corrected pending manifest SHA-256             | `5b94b819025e79ebadb763a7d5eb0ce67174f15effcee61745d305e2a32034c4` |
| Corrected protected aggregate SHA-256          | `6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813` |
| Corrected pending pretty-record SHA-256        | `62e26cc29ffeab0e67899c968f3ccb974dd663ee8b2beadd5c2a31ddbce2373f` |
| Corrected protected-projection file SHA-256    | `1d519386e047579f683e7cb0a6f5e341de07034874487fbb1f12744b0033f6aa` |
| Corrected applied P1C canonical record SHA-256 | `64db02e17f5d7e7f26805eee912d625b53a989e4c4ae17b15165bea3118bfefa` |
| Corrected applied manifest SHA-256             | `55cea42748f5f2a2abc2228b7d33aa0f4d6c2ec9b55b2d96f40782eb565f396f` |

The repair validator pins the BASE and corrected pending identities. The
corrected applied identities are post-repair consumer acceptance targets, not
repair-PR outputs.

## Goals

1. Install one exact P1C-only HEAD-checker authorization for one exact range.
2. Replace the stale pending P1C record with canonical pending
   `95036226...`.
3. Keep P1C source/evidence/disposition exact at 81 roots / 161 variants.
4. Keep P1C `pending`; do not consume it in the repair.
5. Keep all evidence, protected outputs, runtime, workflow, pipeline, policy,
   feature, and decision-fragment bytes unchanged in the repair.
6. Make alternate self-consistent marker/manifest/record pairs fail literal
   checker constants.
7. Make the marker unavailable to `pull_request_target` and local profile
   activation.
8. Make the repair non-replayable after main moves.
9. Leave repaired main ready for one ordinary P1C `pending -> applied`
   consumer carrying the exact four-path collateral correction.

## Strict non-goals

- Reverting or weakening the P1C parser.
- Changing guest runtime behavior in the repair PR.
- Consuming P1C or changing it to `applied`.
- Adding or modifying any of the six P1C evidence files.
- Changing audit, taxonomy, subset, report, conformance, selection, or other
  protected-output bytes in the repair PR.
- Updating P1R/decomposition bytes in the repair PR.
- Modifying `.github/workflows/ci.yml`, `tools/ci/pipeline.js`, provenance
  schema, policy, feature manifests, range profiles, or decision fragments.
- Generalizing the M1 repair into a reusable profile or data-driven repair
  framework.
- Recognizing the P1C marker on `pull_request_target`.
- Accepting the P1C marker through local `--profile/--marker`.
- Reopening, force-updating, or merging PR #118.
- Running broad/full Test262 or a full local CI suite.

## Alternatives

### Weaken the parser or retain the four selected roots

Rejected. The Sixth Edition restricts binding rest to an identifier. Accepting
the four ES2016 binding-pattern forms would make the parser and ES2015 claim
wrong.

### Repair the authority inside the semantic consumer

Rejected. The immutable BASE checker controls that consumer range. A normal
consumer cannot trust changes to its own checker or mutate a pending record's
projection semantics before authorization.

### Prepare a second roadmap authority for the four roots

Rejected. Preparation is append-only, consumption handles one pending
authority, and P1C's existing exact BASE commitments would remain stale after a
separate four-path consumer. Using P1R before P1F would also violate the
decomposition dependency.

### Generalize or reactivate the M1 repair

Rejected. M1 is intentionally hard-coded to its marker, code, issue, base,
manifest, checker, record, corrected literals, and range. Generalization would
broaden a trust-root exception and could not be trusted by the current BASE
checker in the same range.

### Recommended: dedicated one-use P1C repair

Reuse the architectural precedent and low-level canonical/path/byte helpers,
not M1 authorization. Add separate P1C constants, marker grammar, type guard,
range validator, manifest-delta validator, immutable-byte assertion, and
focused tests.

## One-use marker contract

The repair PR body contains exactly this LF-delimited marker:

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

Including its final LF, the marker bytes have SHA-256:

```text
780c1ce94d24ef9e249c209fdd28a56ab9ec885ec4d75a92ba7c0ecd21396177
```

The parser accepts:

- exactly one full comment block;
- exact field order, spelling, punctuation, and values;
- LF delimiters only;
- lowercase fixed-length hexadecimal only;
- no omitted, duplicate, reordered, or extra field;
- no leading/trailing whitespace variant within the marker; and
- no second provenance marker of any kind in the PR body.

Malformed near-matches are not P1C repair markers.

## Literal checker constants

The repaired checker contains immutable P1C-specific literals equivalent to:

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
```

The expected corrected values are not learned from the marker, the observed
HEAD, or a generic repair table.

Validation independently requires:

1. marker fields equal the literals;
2. event BASE equals the BASE literal;
3. merge base equals the BASE literal;
4. computed BASE manifest hash equals the BASE-manifest literal;
5. computed BASE checker hash equals the BASE-checker literal;
6. computed canonical BASE P1C hash equals the BASE-record literal;
7. computed HEAD manifest hash equals the HEAD-manifest literal; and
8. computed canonical HEAD P1C hash equals the HEAD-record literal.

A self-consistent alternate HEAD manifest/record plus a marker carrying the
same alternate hashes must still fail the literals. A replay from repaired main
must fail the exact BASE and merge-base requirements.

## Event and activation boundary

### Ordinary `pull_request` HEAD only

The ordinary PR Test262 job checks out PR HEAD and executes the checked-out
HEAD checker. `authoritativeRangeMarkers()` may scan the P1C repair body pattern
only when the event is exactly `pull_request`, alongside the existing
ordinary-PR-only repair precedents.

The dedicated validator independently repeats the event check before any
repair semantics.

### Never `pull_request_target`

The trusted base guard checks out and executes the unchanged exact BASE
checker. That checker does not recognize the new P1C marker. The marker scanner
must also continue excluding P1C repair markers for `pull_request_target` after
the repair lands.

The expected trusted BASE failure is exactly:

```text
A provenance-owned PR range requires one authoritative provenance marker
```

That red result is required evidence that the current trust root did not
self-authorize its replacement.

### Never local profile activation

The P1C marker is not added to `parseRoadmapAuthorityMarker()` or
`parseProvenanceRangeMarker()`. A local attempt using a profile string such as
`p1c-authority-repair` and `--marker` must fail:

```text
Provenance PR marker is not authoritative
```

Focused tests may inject the exact ordinary-`pull_request` environment and PR
body used by CI. There is no reusable local repair profile.

## Strict six-path repair range

The complete BASE-to-HEAD repair range contains exactly:

| Status | Path                                                               |
| ------ | ------------------------------------------------------------------ |
| `M`    | `tools/test262/es2015-provenance-check.js`                         |
| `M`    | `tools/test262/es2015-provenance.json`                             |
| `M`    | `test/node/es2015-provenance.test.js`                              |
| `M`    | `docs/testing.md`                                                  |
| `A`    | `docs/superpowers/specs/2026-08-24-p1c-authority-repair-design.md` |
| `A`    | `docs/superpowers/plans/2026-08-24-p1c-authority-repair.md`        |

The final validator rejects:

- any missing required path;
- any additional or foreign path;
- duplicate path entries;
- rename or copy status;
- deletion;
- wrong add/modify status;
- path aliasing, percent-encoding, traversal, or noncanonical spelling;
- absent required files;
- a non-regular Git file mode; and
- mode drift for modified paths.

The future plan is added later on this same branch. The present design-only
commit changes only the spec path and is not itself the complete repair range.

## Checker architecture

### Closed P1C marker type

Add a marker kind containing:

```text
kind: p1c-authority-repair
text
code: P1C
issue: 116
base
baseManifestSha256
baseRecordSha256
headManifestSha256
headRecordSha256
```

Use P1C-specific parser/body-pattern functions. Do not parameterize the M1
marker or introduce a generic authority-repair schema.

### Range dispatch

`checkRange()` recognizes the P1C repair before generic roadmap dispatch and
calls one dedicated validator. The validator reads canonical BASE and HEAD
manifests and exact BASE checker bytes. It does not invoke preparation,
consumption, foundation-maintenance, or M1 repair semantics.

### Canonical manifest comparison

The dedicated validator requires:

- canonical schema-v3 BASE and HEAD manifests;
- identical top-level manifest data except `roadmapAuthorities`, including
  exact range profiles and profile order;
- identical authority count and code order;
- every non-P1C authority canonical-identical;
- exact BASE P1C canonical hash `3281bd...`;
- exact HEAD P1C canonical hash `950362...`;
- P1C `state: "pending"` on both sides;
- identical `code`, `issue`, `parentIssue`, `source`, `reconciliation`,
  `evidence`, `destinations`, and protected path order;
- all six evidence entries byte-equivalent and in the same order;
- exactly eleven P1C protected outputs;
- report and conformance records canonical-identical;
- all six `add-exact` evidence-output records canonical-identical;
- only the exact audit/taxonomy/subset field changes described above; and
- no unknown field, array, ordering, base-hash, or operation drift.

Unknown differences fail closed, preferably naming the exact record path or
field.

### Immutable byte defense

The six-path Git range is necessary but not sufficient. The dedicated
validator independently requires BASE/HEAD byte and regular-file-mode identity
for:

- `.github/workflows/ci.yml`;
- `tools/ci/pipeline.js`;
- `tools/test262/es2015-policy.json`;
- `tools/test262/features.json`;
- every `tools/test262/es2015-provenance-decisions/*.json` fragment derived
  from the BASE manifest;
- every evidence path named by every BASE roadmap authority; and
- every protected-output path named by every BASE roadmap authority.

For an authority-owned path absent in BASE, HEAD must also be absent. For an
existing path, bytes and mode must match exactly.

This covers all eleven P1C protected paths, including all six future evidence
files. The repair changes commitments in the pending record, not the committed
files those commitments describe.

The manifest receives separate exact canonical/delta/hash validation. The
checker, focused test, testing documentation, design, and future plan are the
only intentional non-immutable paths.

These redundant assertions defend against malformed injected range fixtures,
dependency omissions, path-normalization mistakes, mode tricks, and future
checker refactors that accidentally consume unreviewed HEAD bytes.

## Exact pending-record replacement

The repair keeps every P1C record field unchanged except the following three
protected outputs:

```json
{
  "path": "tools/test262/es2015-audit-evidence.json",
  "operation": "replace-exact",
  "baseSha256": "eabaeb8245a6988443d91b21219c9e7919ec22639d6e8515a8dadbe5ddfc217f",
  "headSha256": "50f9a54346d0e9e5168a6ac6b0b8de6d709e2c5b808d6c8b036e5113612e638c",
  "projectionSha256": null
}
```

```json
{
  "path": "tools/test262/es2015-taxonomy.json",
  "operation": "replace-exact",
  "baseSha256": "fba700539b05edd67b6cf67e4c0a1361398a2d0f04212bc7080a83f44abf577a",
  "headSha256": "fdf3c8bf229f6c841209e4c4a2196001d45cf0a1c270f334cf06e5f54a00f3c7",
  "projectionSha256": null
}
```

```json
{
  "path": "tools/test262/upstream-subset.json",
  "operation": "replace-exact",
  "baseSha256": "9f768aa8fb0c473e98fe2156d290c4207cea797302cccad6f9b1b922a36b37c0",
  "headSha256": "5a5b83b3c28991c5f2ac141ed949a9698966cce85587d671a4417228d5e08b14",
  "projectionSha256": null
}
```

Canonical HEAD P1C must be:

```text
95036226ee50e365b03c823bab751c6e1d646af0d5c6352a199cd442e2aa9278
```

Canonical HEAD manifest bytes must be:

```text
5b94b819025e79ebadb763a7d5eb0ce67174f15effcee61745d305e2a32034c4
```

The resulting protected aggregate must be:

```text
6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813
```

## Focused repair test contract

### Marker grammar and event boundary

Focused provenance tests prove:

- exact marker parsing and normalized fields;
- marker bytes/hash fixture identity;
- duplicate and mixed-marker rejection;
- CRLF, uppercase hash, field order, whitespace, omitted field, extra field,
  prefix, and suffix rejection;
- ordinary `pull_request` recognition;
- `pull_request_target` non-recognition;
- local `--profile/--marker` rejection; and
- the validator's independent ordinary-event requirement.

### BASE and literal identity pins

Tests reject:

- wrong event BASE;
- wrong merge base;
- wrong marker BASE;
- wrong BASE manifest hash;
- wrong BASE checker hash;
- wrong BASE P1C record hash;
- wrong marker HEAD manifest or record hash;
- computed HEAD manifest or record drift; and
- a self-consistent alternate HEAD manifest/record plus matching alternate
  marker fields.

### Exact six-path range

One positive fixture contains exactly the six canonical regular-file changes.
Negative fixtures cover every missing required path, foreign path, duplicate,
rename, copy, deletion, wrong status, bad mode, alias, traversal, encoded path,
workflow/pipeline change, evidence/protected-output change, runtime change, and
alternate repair-doc path.

### Pending manifest delta

Tests reject:

- P1C becoming `applied`;
- P1C deletion or reordering;
- another authority changing;
- `code`, issue, parent, source, reconciliation, evidence, destination, or
  path-order drift;
- any evidence hash change;
- any report or conformance record change;
- any audit field beyond the exact HEAD hash;
- taxonomy/subset base-hash drift;
- taxonomy/subset remaining `project`;
- taxonomy/subset alternate replacement hashes;
- any extra/missing protected output; and
- any noncanonical corrected record or manifest.

The positive fixture requires exact record `95036226...`, manifest
`5b94b819...`, and aggregate `6e92772f...`.

### Immutable byte defense

For every derived immutable path, a fixture whose reported six-path set is
otherwise valid but whose injected BASE/HEAD bytes or mode differ must fail the
exact path. Coverage derives evidence and protected paths from the BASE
manifest rather than a partial hand-maintained sample.

### End-to-end trust proof

The repair evidence must capture:

1. the unmodified exact BASE checker rejecting the final repair range only with
   the missing-marker message;
2. the repaired HEAD checker accepting the exact six-path range under ordinary
   `pull_request`;
3. the repaired HEAD checker rejecting target/local activation;
4. literal alternate-HEAD rejection; and
5. the repaired checker accepting a subsequent normal P1C consumer fixture
   with protected aggregate `6e92772f...`.

## Repair PR scope and delivery gates

The complete repair PR changes only the six exact paths. In particular, it
contains:

- no workflow or pipeline change;
- no provenance schema change;
- no P1C tool or runtime change;
- no evidence file;
- no audit, taxonomy, subset, report, conformance, or selection byte;
- no decision fragment;
- no authority state transition; and
- no P1R/decomposition accounting change.

`docs/testing.md` documents the one-use marker, ordinary-PR-only activation,
expected trusted BASE failure, exact path set, literal identity pins,
immutable-byte checks, local validation boundary, and post-merge consumer
handoff.

The repair may merge only when:

- the range starts at exact BASE `edccfb8`;
- all six and only six paths have the exact statuses;
- repaired HEAD focused tests and range validation pass;
- the old BASE guard failure is captured and is exactly the missing-marker
  error;
- every ordinary HEAD CI job passes;
- both CodeQL categories are clean;
- open code-scanning alerts are zero;
- independent exact-range review is clean;
- one administrator explicitly bypasses only the expected old-BASE guard;
- no other failure is waived;
- the merge is squash-only; and
- exact-main verification succeeds after merge.

Any HEAD change after review restarts exact-range validation and review. Any
main movement before merge invalidates the marker and repair.

## Focused-only local validation policy

Local repair validation is limited to:

- focused `test/node/es2015-provenance.test.js`;
- exact marker, range, manifest, immutable-byte, and replay fixtures;
- exact unmodified BASE-checker invocation, expected to fail only with the
  missing-marker message;
- exact repaired HEAD-checker invocation, expected to pass;
- canonical record/manifest/aggregate hash checks;
- `npm run typecheck`;
- scoped ESLint for the checker and focused test;
- scoped Prettier for the six repair paths;
- repository invariants only as needed for the added documentation;
- `git diff --check`; and
- exact changed-path, mode, and unchanged-protected-byte checks.

Do not run locally:

- broad or full Test262;
- `npm run test262:upstream`;
- `npm run test262:upstream:check`;
- a broad pinned subset execution;
- `npm test`;
- `npm run ci:contract`;
- full Node, browser, or JSC suites; or
- a full local CI emulation.

Ordinary PR CI remains required. The trusted BASE guard remains intentionally
red for only the exact missing-marker result.

## Post-merge semantic rebuild

### Abandon PR #118

PR #118 must close unmerged. Preserve its commits and ignored diagnostic
evidence, but do not force-update, reopen, or use it as the delivery PR. Its
authority-dependent consumer tail is bound to stale BASE commitments.

### Verify repaired pending main

After the repair squash merge, verify exact main before semantic work:

```text
P1C state:
pending

pending record:
95036226ee50e365b03c823bab751c6e1d646af0d5c6352a199cd442e2aa9278

pending manifest:
5b94b819025e79ebadb763a7d5eb0ce67174f15effcee61745d305e2a32034c4

protected aggregate:
6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813
```

Do not begin the consumer from an unverified or subsequently moved main.

### Replay only the pre-consumer semantic range

Create a fresh semantic branch from the exact repair merge and replay:

```text
edccfb8822339dab53c47bbb8c4ae5cc2db93b1b..d667a0cf41aaf1f822b0d58cec155af7759df83f
```

This is the reviewed 23-commit pre-consumer semantic range. Do not replay
`a085d445648d4e1d059b884459b90ee693268ba7..e937140d8b40e2599faf98a8e6b370982036e61d`
wholesale.

Reapply only the checkout-independent P1C inventory test and isolated scratch
fixture repair from the later diagnostic tail. Adapt the audit serialization
fix to the new corrected applied record instead of preserving stale protected
bytes.

### Exact four-path collateral projection

The rebuilt P1C tool and focused tests use one closed, code-unit-sorted
four-path set equal to the roots listed above. The consumer must
deterministically:

1. remove exactly those four paths from the BASE subset;
2. add exactly eight failed audit records, two variants per path;
3. add exactly four
   `early-errors-and-declaration-instantiation` blockers;
4. move exactly those four taxonomy classifications from
   `selected-passing` to the provisional P1 blocker;
5. remove exactly eight selected report records;
6. regenerate conformance from the corrected report/taxonomy;
7. emit audit exact hash `50f9a543...`;
8. emit taxonomy exact replacement `fdf3c8bf...`;
9. emit subset exact replacement `5a5b83b3...`;
10. retain report/conformance `project` validation; and
11. reproduce corrected pending authority `95036226...` before applying it.

The implementation rejects any missing, extra, duplicate, reordered, metadata
drift, newly passing path, or differently classified collateral path.

### Exact-four historical audit reversal

`es2015-audit --check` reconstructs the pre-roadmap taxonomy for the historical
H0 proof by reversing applied roadmap classifications. The existing P1C
reversal uses only the 81-root P1C baseline/disposition, so it cannot reverse
the four collateral blockers.

Add one P1C-specific closed exact-four collateral reversal after validating the
corrected applied P1C authority. It must:

- activate only for exact applied P1C canonical record
  `64db02e17f5d7e7f26805eee912d625b53a989e4c4ae17b15165bea3118bfefa`;
- require the exact four path set and each corrected provisional
  classification;
- restore each path to its exact pre-consumer `selected-passing`
  classification for H0 historical reconstruction only;
- leave current taxonomy generation unchanged;
- reject absent, extra, duplicate, reordered, status, blocker, variant,
  feature, flag, include, provenance, or partition drift; and
- have hostile drift tests for every closed assumption.

This is audit-history reconstruction, not P1C source expansion and not the
future P1R partition movement.

### Correct P1R and decomposition accounting

The fresh semantic branch updates the replayed durable files:

```text
docs/superpowers/specs/2026-08-23-p1-early-errors-decomposition-design.md
docs/superpowers/plans/2026-08-23-p1c-catch-binding-semantics.md
```

They record:

| Ledger                                  | Old                                                                                          | Corrected                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| P1R                                     | 250 roots / 486 variants, `de2f75fa7dcf68a8eb00298ce05d6f2be70ffaf7efc3bec4b752ae6b2a4508ab` | 254 / 494, `3a2356b36431b3553a65289afd03eb0aa1e88a36e78b3684cfb460eaf426c4d6` |
| Live decomposition source including P1C | 483 / 951                                                                                    | 487 / 959, `94467957a7d427219cfcbe301adef006052437c30a56533ef510e3dacbfbaf88` |
| Remaining post-P1C selector             | 402 / 790                                                                                    | 406 / 798, `182c54ed6fbd4b290b11172809ddd5289bb45b16a07a2c1e4402b94fec2feba7` |

The historical 482-root issue comment remains immutable. The four roots are
post-snapshot live additions that become P1R-owned after the corrected parser
removes them from selection. Update live union/closure wording accordingly.

Do not create or consume P1R before P1F. Until P1F/P1R, the taxonomy's
`core/blocked:P1` representation is explicitly provisional.

### Normal corrected consumer

Build the consumer from repaired main:

- copy the same six exact P1C evidence files;
- generate the five corrected protected outputs;
- change only P1C `pending -> applied`;
- use a fresh ordinary roadmap-consumer marker;
- set marker BASE to the exact repair squash merge;
- retain source path hash `e40f2a...`;
- retain source entry hash `null`; and
- set protected projection hash to
  `6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813`.

The normal generic consumer must accept the exact corrected
`pending -> applied` transition without checker weakening. Replay or
`applied -> applied` remains rejected.

Corrected applied acceptance identities are:

```text
canonical P1C:
64db02e17f5d7e7f26805eee912d625b53a989e4c4ae17b15165bea3118bfefa

manifest:
55cea42748f5f2a2abc2228b7d33aa0f4d6c2ec9b55b2d96f40782eb565f396f

aggregate:
6e92772f4eb42ecaef7f673f243ecdd689b73bc1e9a7a3a545150c2f8630a813
```

### Focused consumer validation

Local semantic validation remains focused:

- exact four-root BASE/HEAD execution;
- exact P1C 81-root / 161-variant execution and evidence reconstruction;
- focused parser/catch-binding tests;
- focused P1C, provenance, taxonomy, selection, M1-integration, and repository
  invariant tests;
- exact four-path selection delta;
- deterministic selection check without broad Test262 execution;
- deterministic audit check with exact-four historical reversal;
- report/conformance reconstruction;
- normal consumer range validation;
- typecheck;
- scoped lint/format;
- protected/evidence byte and diff checks; and
- `git diff --check`.

No broad/full Test262 or full local CI suite is permitted. Exact-head ordinary
CI owns broad subset execution and all normal required jobs.

Open a fresh consumer PR. Require the trusted BASE guard, ordinary CI, both
CodeQL categories, zero alerts, independent review, squash merge, and
exact-main generated checks. Publish #116/#78/#70 accounting only after the
corrected consumer is merged and exact main is verified.

## Performance, portability, and security

The repair changes no guest runtime or hot path. It adds deterministic Node
validation over one manifest, a fixed six-path range, and BASE-derived
immutable path sets.

All repair logic is:

- canonical JSON and code-unit-sorted path based;
- SHA-256 pinned;
- independent of time, locale, timezone, host path, and network;
- fail-closed on unknown marker, path, record, mode, or byte drift;
- unable to authorize itself through the trusted BASE job;
- unavailable to local and target-event activation; and
- stale after one exact-base merge.

The post-merge consumer's exact-four logic is likewise closed and deterministic
and does not broaden P1C source ownership.

## Acceptance criteria

The design is satisfied when:

1. the complete repair range is rooted at exact `edccfb8`;
2. the exact LF marker and SHA-256 `780c1ce9...` are used once;
3. immutable literals pin BASE, BASE manifest/checker/record, and corrected
   HEAD manifest/record;
4. ordinary `pull_request` is the only activation path;
5. target/local activation and self-consistent alternate HEADs fail;
6. the final repair range contains exactly the six named paths/statuses;
7. workflow, pipeline, policy/features, fragments, all authority evidence, and
   all authority protected-output bytes/modes remain exact;
8. P1C remains pending with unchanged 81/161 source, six evidence files, and 81
   selected dispositions;
9. only audit exact hash and taxonomy/subset operation/hash fields change;
10. corrected pending record is `95036226...`;
11. corrected pending manifest is `5b94b819...`;
12. corrected aggregate is `6e92772f...`;
13. the old BASE checker fails only with the exact missing-marker error;
14. all other repair CI/CodeQL/security checks pass before one explicit
    administrator exception;
15. PR #118 is abandoned unmerged;
16. a fresh semantic branch replays only `edccfb8..d667a0c` before rebuilding
    the consumer;
17. the consumer implements the exact four-path subset/audit/taxonomy/report
    correction and exact-four H0 audit reversal;
18. P1R/decomposition accounting becomes 254/494, 487/959, and 406/798 with
    the exact corrected hashes;
19. normal P1C consumption changes only corrected `pending -> applied`; and
20. no broad/full local Test262 or full local CI run is used.

## Concerns

1. **The interim taxonomy class is not normative final ownership.**
   `core/blocked:P1` is the current generator's pre-P1F representation. The
   four roots are normatively P1R/later and must move through P1F/P1R.
2. **Two outputs become exact replacements.** Exact taxonomy/subset hashes are
   necessary because generic projection cannot express this foreign
   four-path delta. Exact reconstruction and hostile drift tests compensate.
3. **Historical audit reversal is a separate boundary.** Without the closed
   exact-four reversal, H0 audit reconstruction remains stale even when current
   corrected taxonomy bytes are right.
4. **One required check is intentionally red.** Only the exact trusted BASE
   missing-marker result is eligible for an explicit administrator exception.
5. **Main movement invalidates the repair.** No design, plan, or unrelated
   change may merge separately before the complete repair.
6. **The semantic delivery must be fresh.** PR #118 cannot be salvaged as the
   delivery PR because its consumer tail and marker were built from stale
   authority.
7. **Broad execution remains CI-owned.** Local evidence is intentionally
   focused on the four collateral roots and the exact P1C ledger.
8. **The future P1R child does not yet exist.** Its durable design is stale,
   but issue creation and final partition movement remain blocked on P1F and
   are outside both the repair and corrected P1C consumer.
