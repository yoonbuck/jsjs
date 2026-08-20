# Unknown Test262 Edition Provenance Design

## Status

Approved design for roadmap node T1 / issue #75. This document designs a
provenance-only issue hierarchy. Issue #75 and its grouping descendants own no
production behavior commit.

## Goal

Resolve the pinned Test262 `unknown-edition` ledger through deterministic,
reviewed provenance. Every root must either leave `unknown-edition` or retain a
reviewed proof that it lacks affirmative ES2015 evidence. A root's age,
historical presence, directory, or textual similarity can prioritize review but
can never decide its edition.

The work begins from:

- jsjs `54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7`;
- Test262 `b363f29d3c43c626dc852744ad64a0b48a003693`;
- ECMA-262 Sixth Edition source
  `https://262.ecma-international.org/6.0/`, SHA-256
  `4d4243dc2f04c9cdd09498f2cc2af6f6cdc07b0430da5578e7cf440d4f7846a0`;
- roadmap design/plan merged at
  `621af70d58c1bb1c368f5ecbd1d880fcd44c6726`; and
- taxonomy/promotion merge
  `54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7`.

## Immutable base ledger

The base ledger is `T1.paths.txt`: 2,312 code-unit-sorted roots, 4,054
executable variants, SHA-256
`56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc`.
It reconstructs byte-for-byte, including its final newline, from the four
durable comments linked by #75:

| Chunk | Comment                    | Chunk SHA-256                                                      |
| ----- | -------------------------- | ------------------------------------------------------------------ |
| 1/4   | `#issuecomment-5347036323` | `bd0ca3db8b2ff7a7e73028756e9d21355970dad9c30128fedbb95fc02a6008f2` |
| 2/4   | `#issuecomment-5347036658` | `f9c43c1118725db06204e74562c9fb4b6293b2b599bfe6cdb077301582e1c490` |
| 3/4   | `#issuecomment-5347036980` | `6a5f9668ed449041b05f44c62f64b6c3a79da0fa1b2b93379715886a715ccb49` |
| 4/4   | `#issuecomment-5347037245` | `44fe6f471dc7c53ac2ccf29781008d114d4ca84878040533a5970c5b5326ca07` |

Only `--initialize` uses the taxonomy at immutable jsjs baseline
`54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7` to construct these bytes. Normal
checks, complete-code checks, ledger/issue rendering, and range validation
validate the checked-in path and entry-ledger hashes directly. They remain
valid after the current taxonomy reclassifies a reviewed path and never rebuild
the foundation from that moving taxonomy. Tooling rejects a pin, count, order,
byte, or hash mismatch before it can render issues or accept decisions.

The base distribution is:

| Area      |     Roots |  Variants |
| --------- | --------: | --------: |
| Staging   |     1,193 |     2,208 |
| Language  |       773 |     1,459 |
| Annex B   |       314 |       323 |
| Built-ins |        32 |        64 |
| **Total** | **2,312** | **4,054** |

Only 104 current paths existed at the final pre-2016 Test262 commit
`5e653f2e6ca14ac1ad8e801955a709cae7ac8a11`. That fact is review
prioritization only, not edition evidence.

## Chosen approach

Use semantic area/topic batches behind one provenance-tooling foundation.
This keeps every path in one stable review scope while allowing each reviewer
to reason about related clauses and semantics.

Two alternatives were rejected:

1. Evidence-source batches (anchor, metadata, history, and manual) cause paths
   to move between residual ledgers and mix unrelated semantics.
2. Four directory-only batches make the staging and language reviews too broad
   and make directory or age inference more tempting.

Issue-local codes use the `U*` namespace so they cannot collide with roadmap
codes such as P0, L0-L2, or S0. Every marker, body, ledger, and generated record
must identify both parent code T1 / #75 and its issue-local code.

## Exact batch partition

The 13 atomic decision batches are mutually exclusive and complete:

| Code      | Scope                                      |     Roots |  Variants | Path-ledger SHA-256                                                |
| --------- | ------------------------------------------ | --------: | --------: | ------------------------------------------------------------------ |
| UA        | Annex B                                    |       314 |       323 | `d29150e412486095bac0103f5d7e913917269870a9769cd8343a5cc9638af98e` |
| UB        | Built-ins                                  |        32 |        64 | `4e21b1884213e2831ffe58fb5c5128f17d417168aeabeac3c3817f8f6350623a` |
| UL1       | Assignment and update semantics            |       434 |       835 | `1bad4b5aed5f665cfcd270a57c90553b1fe4a1dabb1334fa950527b1113b937a` |
| UL2       | Object and class definitions               |       182 |       364 | `b5e8412e46d0bb2d976de247d312269b9ac34fa9cda77d15a2aa11c1eb0abb45` |
| UL3       | Grammar and control semantics              |       109 |       212 | `af158f399b1827dd2012030fbec2fdbbb28f184c011a310550928eb718dca406` |
| UL4       | Environments and modules                   |        48 |        48 | `9316f73cad2c6608ad14d6e837e5383100bb2ebd0a4feb2ba9f198ee35e5d3ac` |
| US1       | Containers and binary data                 |       210 |       406 | `63ff657590ebb5aa167c19975344817789a9a67b820ce0092f990376afa873f7` |
| US2       | Patterns, text, and JSON                   |       176 |       352 | `3b3db618ae579287c0cbe5a77124c883c3129395bf83fe7523dc1f32e3fe7d15` |
| US3       | Numeric, date, and global semantics        |        99 |       190 | `42d21ddbd59de80f8c14b1508c3502c8c0bc023061ff24c16160f1bfaec7daa1` |
| US4       | Metaobject, function, and Symbol semantics |       176 |       318 | `19bc8b322158aa59af8d0b5efd38cf58885be50fdb6394b56cc94a2b94754c0b` |
| US5       | Staging language runtime                   |       306 |       540 | `fdc5ed38ef91366ee6bd9f8aa8d49917b5d9bbc2746cfd62a50f22a22cd03df5` |
| US6       | Affirmative post-ES2015 candidates         |        48 |        89 | `90dfecd04460d739d4a7242b6ff14c4ef83abcf3e73d7893b392138372ce1cf1` |
| US7       | Residual manual semantics                  |       178 |       313 | `1e2cda5adef593ae134f0ab0e759091f57522821460c904c7f44c4217c891e28` |
| **Total** |                                            | **2,312** | **4,054** | base ledger above                                                  |

The selectors are evaluated only against the immutable base ledger:

- UA: `test/annexB/**`.
- UB: `test/built-ins/**`.
- UL1: `test/language/expressions/` topics `assignmenttargettype`,
  `assignment`, `compound-assignment`, `postfix-decrement`,
  `postfix-increment`, `prefix-decrement`, or `prefix-increment`.
- UL2: language expression topics `object` and `class`, plus
  `test/language/statements/class/**`.
- UL4: language top-level topics `arguments-object`, `module-code`,
  `eval-code`, and `function-code`.
- UL3: every remaining `test/language/**` root after UL1, UL2, and UL4.
- US1: SpiderMonkey staging topics `Array`, `TypedArray`, `ArrayBuffer`,
  `DataView`, `Map`, `Set`, and `Promise`.
- US2: SpiderMonkey staging topics `RegExp`, `String`, and `JSON`.
- US3: SpiderMonkey staging topics `Math`, `Number`, `Date`, `global`,
  `Boolean`, `Error`, and `Exceptions`.
- US4: SpiderMonkey staging topics `Function`, `object`, `Symbol`, `Proxy`,
  and `Reflect`.
- US5: SpiderMonkey staging topics `class`, `strict`, `expressions`,
  `lexical-environment`, `generators`, `eval`, `statements`, `syntax`,
  `destructuring`, `module`, `literals`, and `argumentsLengthOpt.js`.
- US6: SpiderMonkey staging topics `PrivateName`, `async-functions`,
  `fields`, `BigInt`, and `AsyncGenerators`, plus exact path
  `test/staging/built-ins/Array/prototype/flatMap/callback-with-side-effects.js`.
- US7: SpiderMonkey staging topics `regress`, `extensions`, `misc`, and
  `types`.

The foundation must assert code-unit ordering, each batch's byte hash, root and
variant counts, zero overlap, complete union, and exact base-ledger
reconstruction before child issues are created.

## Native issue hierarchy

All nodes receive the ES2015 milestone.

```text
#75 / T1 (grouping, no production commit)
|- U0  provenance tooling foundation (atomic tooling/docs)
|- UA  Annex B decisions (atomic)
|- UB  built-in decisions (atomic)
|- UL  language decisions (grouping, no commit)
|  |- UL1 assignment/update (atomic)
|  |- UL2 object/class (atomic)
|  |- UL3 grammar/control (atomic)
|  `- UL4 environments/modules (atomic)
`- US  staging decisions (grouping, no commit)
   |- US1 containers/binary (atomic)
   |- US2 patterns/text/JSON (atomic)
   |- US3 numeric/date/global (atomic)
   |- US4 metaobject/function/Symbol (atomic)
   |- US5 language runtime (atomic)
   |- US6 post-ES2015 candidates (atomic)
   `- US7 residual manual semantics (atomic)
```

Native dependencies are:

- every atomic decision batch UA, UB, UL1-UL4, and US1-US7 is blocked by U0;
- UL is blocked by UL1-UL4;
- US is blocked by US1-US7;
- #75 is blocked by UA, UB, UL, and US;
- U0 is therefore transitive rather than an additional direct #75 blocker;
- #75 retains closed #74 as resolved dependency history; and
- existing #75 blocking relationships to #98 and #100 remain unchanged.

Grouping bodies explicitly state that they own no production commit. Atomic
decision bodies explicitly permit only taxonomy/provenance tooling, data, and
documentation. A semantic gap discovered during review is routed to its
existing roadmap owner or to a separately designed and reviewed roadmap issue.
It is never fixed as a guest change in a U* branch.

## U0 foundation

U0 owns one tooling/docs PR and no classification decision. It introduces:

1. A versioned provenance manifest identifying jsjs, Test262, Sixth Edition,
   and base-ledger source identities.
2. Code-unit-sorted per-batch path manifests containing path, variants, and
   prior class only.
3. Independent per-batch decision fragments so controlled parallel work does
   not edit another batch's source fragment.
4. A validator and deterministic renderer/check command.
5. A canonical decision-record format and canonical SHA-256 calculation.
6. Focused tests for schema, order, count, union, overlap, hash, source pin,
   evidence closure, review identity, and destination validity.

U0 cannot change guest runtime files, `tools/test262/features.json`, the
selected Test262 subset, or any classification decision. Its own acceptance
requires that classification counts remain exactly 2,312 / 4,054 unknown.

The integrated taxonomy remains generated from all reviewed fragments.
Parallel batches may prepare only disjoint fragment changes. Before an atomic
PR becomes reviewable, it rebases onto sequential current `main`, regenerates
the integrated artifacts, and proves the refreshed global partition. This
keeps source decisions disjoint and resolves generated-output conflicts in one
reviewed integration update.

## Persistent exact-range policy

The manifest contains one immutable `foundation` profile and one
`decision:<CODE>` profile for every atomic code. CI and local review use the
same fail-closed `--check-range` CLI with explicit full base/head SHAs.

- `foundation` is valid only when the base has no initialized provenance
  manifest. It requires the approved design/plan, provenance tooling and tests,
  exact empty fragments and generated manifest, workflow/contracts,
  `.prettierignore`, directly related documentation, and the exact reviewed
  `.superpowers` cleanup deletions. It rejects `src/**`, feature/selection data,
  non-empty decisions, unowned generated output, renames, copies, other
  deletions, and an empty range.
- `decision:<CODE>` is valid only when the base contains the initialized
  foundation. It requires exactly that code's non-empty canonical source
  fragment and permits only the manifest-listed deterministic taxonomy,
  audit-evidence, report, and conformance outputs. It rejects another fragment,
  U0 tooling/schema, `src/**`, features, and selection changes.
- Foundation maintenance after U0 is a separately reviewed future profile. It
  is never implicit in a decision profile.

Every U* PR body has exactly one marker:

```text
<!-- es2015-provenance-pr parent:T1 parent-issue:75 profile:foundation base-ledger-sha256:56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc -->
```

Decision PRs substitute `decision:<CODE>`. The generated workflow supplies the
actual pull-request base/head and complete body; the CLI derives and validates
the unique profile marker. Unmarked non-provenance PRs are neutral, while an
unmarked provenance-owned range fails.

## Decision record

Each final record contains:

- exact Test262 path;
- executable variant count;
- prior class, initially `unknown-edition`;
- final partition and final status;
- evidence kind;
- exact Sixth Edition clause/anchor or exact later-spec source identity;
- relevant metadata, feature, include-feature closure, includes, and flags;
- reviewed semantic rationale;
- reviewer identity, UTC review timestamp, and review artifact URL/identity;
- destination blocker and owning issue when semantics remain blocked; and
- canonical artifact SHA-256.

The canonical artifact hash is calculated from the canonical JSON record with
its `artifactSha256` field omitted. The enclosing fragment has its own byte
hash. This avoids self-referential hashing while detecting any record or file
mutation.

Evidence kinds distinguish direct Sixth Edition clause/anchor proof,
versioned metadata proof, include/feature closure, later-edition normative
proof, and reviewed manual semantic proof. File/spec history is recorded as
corroboration only and fails validation if it is the sole deciding evidence.

Moving a root to core also assigns exactly one current status:

- selected and passing;
- exact audit-passing and unselected;
- intentional deviation; or
- blocked by one named existing or newly reviewed semantic blocker and owning
  issue.

Moving a root to Annex B, later/non-ES2015, harness validation, or malformed
metadata requires exact evidence for that destination. The validator rejects
an unspecified destination, an unknown blocker, a decision without complete
metadata/include/flag closure, or a record without independent review.

Before classification, every decision's `es5id`, `es6id`, `esid`, sorted
features, flags, includes, and transitive include-feature closure must equal the
exact pinned inventory. Diagnostics name the exact path and field. Reviewed
blocker destinations accept only immutable blocker/roadmap-owner pairs for the
existing semantic issues #76-#97 and optional Annex B issue #99; tracking issue
#98 is not a semantic owner. New pairs require a reviewed code/data change.
Review timestamps are real calendar times in canonical UTC RFC3339 form.
Harness and malformed destinations retain structural precedence. A malformed
current root accounts for zero executable variants while its immutable
decision record must still retain the prior ledger's reviewed variant count.

## Evidence precedence

Reviewers apply evidence in this order:

1. Validate the exact pinned source and current Test262 metadata.
2. Resolve feature and transitive include-feature closure plus flags.
3. Compare exact current anchors with the reviewed Sixth Edition anchor set.
4. Map renamed anchors through exact Sixth Edition clause semantics or identify
   an exact later normative source.
5. Use Test262 and specification history to locate prior evidence and explain
   semantic drift.
6. Perform manual semantic review when machine evidence is incomplete.

Later dependencies take precedence over inherited ES5/ES2015 evidence, as in
the current taxonomy. Historical presence, file age, path, source text
similarity, implementation behavior, or passing execution never establishes
edition alone.

## Atomic batch workflow

After U0 merges, batches run in controlled parallel groups with disjoint
ledgers. They do not all launch before U0.

For each atomic batch:

1. Start from sequential current `origin/main`.
2. Reconstruct and validate the immutable base ledger and exact batch ledger.
3. Produce complete decision records using the evidence precedence above.
4. Run metadata/audit checks and, only when needed, exact targeted Test262 paths
   from that batch. Never run a full or broad upstream Test262 command locally.
5. Regenerate integrated taxonomy, reports, affected downstream path ledgers,
   counts, and issue-comment payloads under `TZ=UTC`.
6. Obtain independent specification review and independent
   quality/provenance review.
7. Record reviewer, review artifact, and UTC review time in the final records.
8. Re-run the exact batch and global validators on the final reviewed head.
9. Require exact-head CI and CodeQL before merge.
10. After merge, rerun UTC reclassification from current main and update
    affected downstream roadmap issue ledgers/count comments before closing the
    atomic issue.

An atomic issue closes only when all of its base paths have reviewed decisions,
the merged fragment hash matches its approved ledger, no path remains silently
unaccounted for, and post-merge reclassification balances globally.

## Issue body contract

U0, UA, UB, UL, UL1-UL4, US, and US1-US7 bodies include:

- marker with T1 / #75 and the issue-local U* code;
- jsjs and Test262 pins;
- base ledger count/hash and exact batch count/hash;
- scope and explicit non-goals;
- evidence method and prohibition on age/history/path-only decisions;
- native parent and dependency expectations;
- independent review requirements;
- `TZ=UTC` reclassification and downstream ledger-update gates;
- local Test262 restriction to metadata/audit or exact targeted paths;
- exact-head CI and CodeQL gates; and
- an explicit prohibition on guest production changes.

Their authoritative marker contains exactly
`parent:T1 parent-issue:75 code:<CODE> base-ledger-sha256:<hash>`. Native
parents are #75 for U0/UA/UB/UL/US, UL for UL1-UL4, and US for US1-US7; final
bodies use actual issue numbers from the strict wrapped issue map. Every body
pins the distinct jsjs taxonomy baseline and requires UTC post-merge
reclassification plus downstream-ledger updates. Atomic bodies limit changes
to taxonomy/provenance tooling, data, and documentation and prohibit guest
fixes. Grouping nodes own no commit.

Grouping UL and US additionally state that they own no commit and close only
after their atomic children merge and their exact union is reclassified.

## Failure behavior

All tooling fails closed. It emits a precise path, batch, field, or expected
hash for:

- source-pin or base-ledger drift;
- duplicate, missing, unsorted, or unexpected paths;
- variant, batch, union, overlap, or hash mismatch;
- unsupported evidence kind or sole historical evidence;
- incomplete metadata/include/flag closure;
- invalid final partition/status combination;
- missing or unknown blocker ownership;
- missing review identity/artifact;
- non-UTC or non-RFC3339 review time; or
- generated taxonomy/report/downstream ledger drift.
- an untrusted base/head/event/body/profile marker or a range outside its
  immutable profile.

There is no fallback that preserves a success-shaped artifact.

## Validation

U0 tests use fixtures and the checked-in taxonomy only; they execute no broad
Test262 suite. Subsequent batches use:

- deterministic manifest and renderer checks under `TZ=UTC`;
- the existing metadata/taxonomy audit check;
- exact targeted path execution only when semantic status requires it;
- focused Node tests for new tooling and affected taxonomy behavior;
- repository typecheck, lint, formatting, and applicable CI contracts; and
- exact-head CI plus CodeQL on every PR.

Generated artifacts and timestamps are produced under `TZ=UTC`.
Task 6 local review invokes the same range CLI as CI with live
`origin/main...HEAD`, explicit full SHAs, the `foundation` profile, and the
authoritative marker. The recorded evidence includes the base/head SHAs,
profile, marker, NUL-safe name-status inspection, and successful content
validation.

## Closure

#75 closes only after:

1. every nested atomic child has merged and passed post-merge reclassification;
2. the `unknown-edition` selector is zero, or every retained remainder has
   reviewed proof of non-ES2015 classification with merged taxonomy and
   reclassification evidence;
3. the 2,312 / 4,054 base ledger still reconciles exactly with no overlap or
   omission;
4. downstream semantic issue path ledgers and counts reflect every movement;
5. UL and US are closed through their children;
6. the native hierarchy, milestone, and dependency graph are verified;
7. #98 and #100 retain their intended native dependency relationship; and
8. final exact-head CI and CodeQL evidence is recorded.

No broad conformance claim follows from provenance classification alone.
