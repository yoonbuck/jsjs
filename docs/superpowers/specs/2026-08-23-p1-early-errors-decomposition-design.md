# P1 Early Errors and Declaration Instantiation Decomposition Design

## Status

Design and decomposition only for issue
[#78](https://github.com/yoonbuck/jsjs/issues/78), roadmap code P1.

The analysis is pinned to:

- jsjs base `215e5ff26bae653bdffc6d67eb8eb65b056ec1bd`;
- Test262 `b363f29d3c43c626dc852744ad64a0b48a003693`;
- the exact 482-root issue ledger in comment
  `5347038305`;
- ledger SHA-256
  `6c1d378bf390fe93ec4618e090cc48e88bc11e98f8f92f2833863b7acd4a490d`;
  and
- 482 roots / 949 executable variants.

This branch changes no guest behavior, writes no implementation plan, and
creates or updates no GitHub issue. The exact generated ledgers and audit
report are intentionally ignored under:

```text
.superpowers/sdd/2026-08-23-p1-decomposition/
```

Only this durable design is tracked. Each future child must regenerate and
track its own authority/evidence inputs against its exact implementation base;
the ignored analysis outputs are not stable production inputs.

## 2026-08-24 live-ledger correction

Comment `5347038305`, its 482 roots / 949 variants, and SHA-256
`6c1d378bf390fe93ec4618e090cc48e88bc11e98f8f92f2833863b7acd4a490d`
remain the immutable decomposition snapshot. They are not the live selector
after the corrected P1C parser exposes four additional ES2016
`BindingRestElement : ... BindingPattern` roots:

```text
test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-ary-elem.js
test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-ary-rest.js
test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-obj-id.js
test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-obj-prop-id.js
```

The corrected live identities are:

```text
P1R live ledger:
254 roots / 494 variants
sha256 3a2356b36431b3553a65289afd03eb0aa1e88a36e78b3684cfb460eaf426c4d6

live decomposition including P1C and P1G:
487 roots / 959 variants
sha256 94467957a7d427219cfcbe301adef006052437c30a56533ef510e3dacbfbaf88

remaining post-P1C selector:
406 roots / 798 variants
sha256 182c54ed6fbd4b290b11172809ddd5289bb45b16a07a2c1e4402b94fec2feba7
```

The four roots are post-snapshot live additions to P1R. Until P1F and P1R
perform their final partition movement, their
`core/blocked:early-errors-and-declaration-instantiation` classification is
provisional. Historical 250/486, 483/951, and 402/790 figures below describe
the immutable analysis snapshot and are superseded by these live identities
for future authority work.

## Executive decision

Do not create the generic parser/static production child anticipated by the
original roadmap text.

The exact audit found:

1. **401 roots / 788 variants are not core ES2015 implementation work.**
   Their executable sources or expected early error depend on post-ES2015
   grammar. They need reviewed taxonomy movement to
   `later-or-non-es2015`, not parser widening.
2. **81 roots / 161 variants are one real ES2015 semantic seam:** destructuring
   catch parameters, catch binding initialization, and catch parameter/body
   environment separation.
3. The current taxonomy contains **one additional post-ledger root / two
   variants**, exposed by H0. Its expected sloppy-mode behavior comes from the
   ES2025 removal of global `[[VarNames]]`/`HasVarDeclaration`, not from the
   Sixth Edition.

The immutable 482-root ledger therefore partitions into five disjoint movement
children. The corrected live 487-root selector adds P1G and four post-snapshot
P1R roots:

| Code | Delivery          | Disposition or implementation scope                                 | Depends on | Roots | Variants | Ledger SHA-256                                                     |
| ---- | ----------------- | ------------------------------------------------------------------- | ---------- | ----: | -------: | ------------------------------------------------------------------ |
| P1R  | atomic taxonomy   | ES2016 `BindingRestElement : ... BindingPattern` contamination      | P1F        |   254 |      494 | `3a2356b36431b3553a65289afd03eb0aa1e88a36e78b3684cfb460eaf426c4d6` |
| P1T  | atomic taxonomy   | ES2017 trailing commas in formal parameters and calls               | P1F        |   115 |      230 | `639c946d678180f5be0b2c405c179c1c173694967cef79f25081d773ce084f68` |
| P1A  | atomic taxonomy   | async function, `await`, async generator, and async-context grammar | P1F        |    16 |       32 | `4038da176a6b33400cba6b2524d5bf3b6d826a45ce857a7d91535c0a6bb27c88` |
| P1X  | atomic taxonomy   | other post-ES2015 syntax dependencies                               | P1F        |    20 |       40 | `6f1acdea5f89beb9eccb2eb421002e28fbec13b6d319db1f0455fdc175db0274` |
| P1C  | atomic production | ES2015 catch parameter binding and environment semantics            | —          |    81 |      161 | `e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5` |
| P1G  | atomic taxonomy   | ES2025 global `[[VarNames]]`/`HasVarDeclaration` removal            | P1F        |     1 |        2 | `80c9e4c41001ea0382bea315dab951927f670b5c9c32ba2db7dea6e509bd1aee` |

The immutable 250-root P1R snapshot together with P1T/P1A/P1X/P1C
reconstructs the original 482-root ledger byte-for-byte. The live 254-root P1R
ledger together with those unchanged children and P1G reconstructs the
corrected 487-root selector byte-for-byte.

The selected hierarchy also needs one zero-movement tooling child, P1F, because
the current generic roadmap-authority projection deliberately preserves a
root's partition and therefore cannot move the 402 reviewed core roots to
`later-or-non-es2015`.

## Verified inputs and stale state

### Blockers

Both semantic blockers are closed:

| Issue    | State  | Closed     | Relevant merge                             |
| -------- | ------ | ---------- | ------------------------------------------ |
| #76 / H0 | closed | 2026-08-22 | `ba674bb60cede4974dcfc5b15c96352079949091` |
| #77 / P0 | closed | 2026-08-20 | `1925873700c180fc38e7e020fc4b631c1866b082` |

P1 has no remaining open semantic blocker.

### Immutable issue ledger

Comment `5347038305` reconstructs exactly, including its final newline:

```text
482 roots
949 variants
sha256 6c1d378bf390fe93ec4618e090cc48e88bc11e98f8f92f2833863b7acd4a490d
```

Keep that comment immutable as the decomposition base. Do not edit or replace
it.

### Current taxonomy drift

At the requested jsjs base:

```text
tools/test262/es2015-taxonomy.json
sha256 fba700539b05edd67b6cf67e4c0a1361398a2d0f04212bc7080a83f44abf577a
```

The current selector is:

```js
partition === 'core' &&
  status === 'blocked:early-errors-and-declaration-instantiation';
```

It produces:

```text
483 roots
951 variants
sha256 86eccfc0bd987ab7ef7d1dbb1201f0fccc8fbaac0bfad2186f437797014e1001
```

That is the historical pre-P1C selector. The corrected live selector is
487 roots / 959 variants with SHA-256
`94467957a7d427219cfcbe301adef006052437c30a56533ef510e3dacbfbaf88`.

The one exact addition is:

```text
test/language/global-code/script-decl-lex-var-declared-via-eval.js
```

H0's reviewed disposition explicitly reassigned that root to P1. Its one
non-strict variant fails with:

```text
Identifier 'test262Var' has already been declared
```

The strict variant passes.

Classification is root-granular. The passing strict variant does not keep the
root in core when the same root's non-strict executable variant requires
ES2025 semantics.

### Stale issue text and comments

The following GitHub text is stale and needs a superseding update after child
creation:

1. #78 still reports 482/949 as the current attribution. It is now the immutable
   base ledger; the live selector is 483/951.
2. #78 says the refresh delta is zero. Relative to comment `5347038305`, the
   current delta is one added root / two variants and zero removals.
3. #78 lists #76 and #77 without stating that both are resolved.
4. Comment `5356091897` says #76 remains open. Preserve the comment as history,
   but supersede it.
5. #78 acceptance still assumes non-empty parser/static and runtime production
   streams. The audit disproves the former: its 401-root parser/static ledger is
   a taxonomy-disposition stream.
6. Parent #70 still names `1925873700c180fc38e7e020fc4b631c1866b082` as
   current taxonomy/promotion main and still reports P1 as 482/949. At this
   base, main is `215e5ff26bae653bdffc6d67eb8eb65b056ec1bd` and P1 is
   483/951.

The roadmap manifest marker in the bodies remains historical issue identity;
this design does not propose silently replacing it.

## Audit method and result

The audit:

- reconstructed the GitHub ledger and verified its byte hash;
- parsed every root's pinned Test262 metadata and variant expansion;
- compared the immutable ledger with the current taxonomy selector;
- parsed positive/runtime roots with Acorn at successive ECMAScript editions;
- inspected the exact Sixth Edition source at SHA-256
  `4d4243dc2f04c9cdd09498f2cc2af6f6cdc07b0430da5578e7cf440d4f7846a0`;
- ran all 949 immutable-ledger variants under `TZ=UTC` with their metadata
  features admitted for diagnosis; and
- inspected the parser, static-semantics, environment-record, declaration
  instantiation, eval, module, class, synchronous evaluator, and generator
  evaluator paths.

The focused run produced:

```text
949 total
0 passed
949 failed
943 parse-error
6 wrong-error-phase
```

The failures divide as follows:

- 400 positive/runtime roots require an Acorn edition later than ES2015:
  - 250 first parse at `ecmaVersion: 7`;
  - 126 at `ecmaVersion: 8`;
  - 5 at `ecmaVersion: 9`;
  - 14 at `ecmaVersion: 11`; and
  - 5 at `ecmaVersion: 12`.
- `test/language/statements/for-of/head-lhs-async-invalid.js` parses as
  ES2015 because `async` is then an ordinary identifier, but its expected
  parse-time rejection is a later async-grammar restriction.
- The remaining 81 roots are Sixth Edition catch-parameter programs. All fail
  at the engine capability boundary with:

  ```text
  SyntaxError: destructuring patterns are not supported in this context
  ```

Minimum Acorn edition is diagnostic evidence, not sufficient provenance.
Every later/non-ES2015 decision must cite the exact later normative grammar or
semantic dependency and retain complete metadata/include/flag closure.

## Why the original attribution is wrong

The taxonomy correctly gives later dependencies precedence over `es6id`,
anchors, and other affirmative ES2015 evidence, but only when it knows the
later dependency.

These roots commonly retain an ES2015 semantic `esid` while their current
Test262 executable source has been regenerated or expanded with later syntax.
Examples:

- an ES2015 FunctionDeclarationInstantiation test now uses
  `function (...[x]) {}`, whose `... BindingPattern` production is absent from
  the Sixth Edition and present in the Seventh;
- an arguments-object test for an ES2015 object now uses an ES2017 trailing
  call comma;
- an ES2015 computed-property-name test now evaluates `x ?? 1`;
- an ES2015 RegExp accessor test includes `4n`; and
- an ES2015 Promise/iterator-close test iterates over a value list containing
  `0n`.

The metadata for these roots does not consistently name those dependencies.
The classifier therefore sees affirmative ES2015 anchor evidence and no
declared later dependency, then assigns the observed parse failure to P1.

Implementing the later grammar would be a false core-ES2015 fix. Leaving the
roots in core would keep the release denominator false. Exact reviewed
partition movement is required.

## Exact partition

### Parser/static disposition aggregate

The immutable-snapshot parser/static disposition ledger is:

```text
401 roots
788 variants
sha256 bbcec54ddf9556885372c20c690b104ee89de7df37f80eb1cf12d94ee3a3cf6b
```

It is the exact union of the 250-root P1R snapshot plus P1T/P1A/P1X. It is not
a production parser ledger. The live P1R ledger adds the four roots named in
the live-ledger correction above.

#### P1R subfamilies

| Subfamily                                        |   Roots |
| ------------------------------------------------ | ------: |
| Generated `... BindingPattern` snapshot contexts |     248 |
| Corrected post-snapshot P1C collateral contexts  |       4 |
| Direct rest-parameter pattern roots              |       2 |
| **Corrected live P1R total**                     | **254** |

The Sixth Edition production is only:

```text
BindingRestElement : ... BindingIdentifier
```

The Seventh Edition adds:

```text
BindingRestElement : ... BindingPattern
```

#### P1T subfamilies

| Subfamily                                | Roots |
| ---------------------------------------- | ----: |
| Trailing comma in call argument lists    |    70 |
| Trailing comma in formal parameter lists |    45 |

Both are ES2017 grammar, not Sixth Edition grammar.

#### P1A subfamilies

| Subfamily                       | Roots |
| ------------------------------- | ----: |
| Async function                  |    11 |
| Async generator                 |     2 |
| Async `for` grammar/restriction |     2 |
| `await` expression              |     1 |

Two generic function-length paths are included because their executable source
contains async arrow, async function, and async generator cases even though
their filenames do not say `async`.

#### P1X subfamilies

| Subfamily                                            | Roots |
| ---------------------------------------------------- | ----: |
| BigInt literal                                       |     9 |
| Nullish coalescing                                   |     5 |
| Numeric separators                                   |     5 |
| Tagged-template invalid-escape cooked-value behavior |     1 |

P1X is deliberately small. It must retain per-root reasons rather than using
one broad path rule.

### Current later-semantics aggregate

Adding P1G to the corrected live parser/static disposition gives the complete
post-P1C later/non-ES2015 movement ledger:

```text
406 roots
798 variants
sha256 182c54ed6fbd4b290b11172809ddd5289bb45b16a07a2c1e4402b94fec2feba7
```

P1G is semantic rather than grammatical. The historical 401-root
parser/static aggregate remains an immutable snapshot; the live ledger adds
the four P1R collateral roots.

### Runtime production aggregate

The only production runtime ledger is P1C:

```text
81 roots
161 variants
sha256 e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5
```

P1C contains:

| Subfamily                              | Roots | Variants |
| -------------------------------------- | ----: | -------: |
| Catch destructuring binding            |    78 |      156 |
| Catch parameter/body environment scope |     3 |        5 |

P1G contains one root / two variants, but it is a taxonomy movement rather
than production runtime work.

## Current architecture

### Parser and static semantics

`src/parser.js` keeps Acorn at `ecmaVersion: 6` and runs one engine-owned
validation pass for scripts, eval, modules, reusable Programs, and hostile
custom ASTs.

The current boundary already covers:

- program lexical/var collisions;
- module import/export and declaration collisions;
- function parameter duplicate-name rules;
- non-simple parameter lists with `"use strict"`;
- generator `yield` restrictions;
- strict `eval`/`arguments` bindings and assignments;
- catch/body declaration collisions for custom ASTs;
- block, loop, switch, and variable-scope declaration conflicts; and
- source/custom/reusable AST defensive parity.

`src/evaluator/static-semantics.js` supplies shared `BoundNames`,
`LexicallyDeclaredNames`, `VarDeclaredNames`, top-level declaration lists, and
block/function helpers. The focused parser/static/environment baseline passed
573 tests with zero failures.

The relevant P1 parser defect is narrow: the syntax walk does not assign a
binding `patternContext` to `CatchClause.param`, so a valid ES2015
`ArrayPattern` or `ObjectPattern` reaches the generic unsupported-context
guard. This admission change belongs with P1C because no exact root can pass
until catch binding initialization is implemented, and there is no independent
ES2015 parser/static ledger.

Raising Acorn's edition is explicitly rejected. It would admit the 401 later
roots and recreate the attribution defect as guest behavior.

### Environment records

`src/runtime/environment.js` already has:

- declarative environment records with mutable/immutable TDZ bindings;
- object environment records;
- dual-record global environments;
- module environment records and live imports;
- function execution environments; and
- explicit lexical outer chains.

Catch parameter environments are marked with
`isCatchClauseEnvironment` so the Annex B.3.5 non-strict eval exception can
skip the catch binding during its lexical-conflict walk.

### Global declaration instantiation

`globalDeclarationInstantiation` in
`src/evaluator/declarations.js` performs preflight checks before binding
creation and then instantiates global lexical, function, var, and Annex B block
function aliases.

Its lexical-name preflight currently rejects when any of these are true:

```text
HasVarDeclaration(name)
HasLexicalDeclaration(name)
HasRestrictedGlobalProperty(name)
```

That behavior is correct for core ES2015. The Sixth Edition requires the
`HasVarDeclaration(name)` rejection even when the prior global var/function
binding came from non-strict eval and its object property is configurable.
Every published edition from the Sixth through the Fifteenth retains that
check, including ES2020.

The normative change is
[tc39/ecma262#3226](https://github.com/tc39/ecma262/pull/3226),
`Normative: Remove [[VarNames]] from the global`, merged as
`ed75310080684f63a3f3fe10a286f5d0b5fbb9e3` on 2025-02-27. It removes the
Global Environment Record `[[VarNames]]` slot, removes
`HasVarDeclaration`, and deletes the corresponding
`GlobalDeclarationInstantiation` rejection.

The exact edition boundary is:

| Edition                        | Source SHA-256                                                     | P1G behavior                                      |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------- |
| ECMA-262 15th Edition / ES2024 | `eabb3c1fc6c5b0610b143ef7bea8de7c0f323a777d669a453e47c39a2986c846` | retains `env.HasVarDeclaration(name)` and rejects |
| ECMA-262 16th Edition / ES2025 | `6a28f9423133ed7b7c59a40baf620c2740f12f0bc9c251042f2a85b9cc5ed713` | removes the check and accepts                     |

Pinned Test262 commit
`c5a80993cd96623a875dd6fa532c7d92f392f02b` expanded the earlier strict-only
test on 2024-04-08 with the message `Allow global var-via-eval be declared`
and linked the then-draft normative PR. The pinned test therefore intentionally
tests later semantics against a Sixth Edition roadmap.

P1G must move to `later-or-non-es2015`; changing
`globalDeclarationInstantiation` would regress the requested ES2015 contract.

### Function declaration instantiation

`functionDeclarationInstantiation` already owns:

- parameter environment creation;
- left-to-right defaults and destructuring initialization;
- separate body variable environments for non-simple parameters;
- direct eval in parameter initializers;
- arguments-object selection and parameter mapping;
- var/function hoisting; and
- body lexical environments.

The P1 ledger's apparent function-instantiation roots all use post-ES2015
`... BindingPattern`, trailing formal commas, or async forms. They are not
evidence for a new ES2015 function-instantiation child.

### Eval declaration instantiation

`performEval` separates lexical and variable environments for direct,
indirect, strict, and non-strict eval.
`evalDeclarationInstantiation` handles:

- lexical-chain var conflicts;
- configurable eval var/function bindings;
- eval lexical declarations;
- Annex B block-function aliases; and
- catch-environment exceptions.

Those configurable eval bindings are observable in ES2015, but the permission
for a later independent script lexical declaration to reuse their names is an
ES2025 change.

### Block declaration instantiation

`blockDeclarationInstantiation` is shared by ordinary blocks, switch case
blocks, function bodies, and generator frames. No ES2015-clean P1 root identifies
an independent block-instantiation defect.

### Module declaration instantiation

Modules use `ModuleEnvironmentRecord` and
`moduleDeclarationInstantiation` in `src/evaluator/modules.js`, reached from
the linker. P1 has zero module roots. Module parser/capability work is already
owned by closed issue #66 and the completed static-module work; do not create a
P1 module child.

### Class environments

Class definition evaluation already creates a class-name lexical environment
and initializes the outer declaration binding at evaluation. Every class root
in the P1 ledger depends on later rest-binding, trailing-comma, async, nullish,
or numeric-separator grammar. Do not create a class-instantiation child from
those paths.

### Catch evaluation

The synchronous evaluator currently assumes:

```js
const paramName = node.handler.param.name;
```

It creates and initializes one identifier binding.

The resumable generator evaluator is already more complete: it enumerates
`boundNames(param)` and calls `initializeBindingPattern`. The parser gate masks
that implementation from the exact P1 roots.

P1C should establish one semantic contract for both evaluator paths:

1. create every catch parameter binding before initialization;
2. initialize the complete binding pattern from the thrown value;
3. propagate iterator/proxy/getter/default-initializer abrupt completions;
4. preserve IteratorClose behavior;
5. preserve inferred names for anonymous functions/classes;
6. keep the catch parameter environment outside the handler block environment;
7. keep the enclosing variable environment unchanged for direct eval; and
8. retain custom/reusable AST early-error and defensive parity.

## Existing issue overlap and ownership

| Area            | Disposition                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1R/P1T/P1A/P1X | Taxonomy/provenance work under #78. They are not guest parser work and have no mandatory ES2015 semantic owner after movement.                                                |
| P1G             | Taxonomy/provenance work under #78 for an ES2025 normative semantic change. It is not a G0 or eval implementation child.                                                      |
| #74 / T0        | Supplies the deterministic taxonomy architecture, but is closed and should not be reopened.                                                                                   |
| #75 / T1        | Supplies reviewed-decision patterns, but its immutable 2,312-root unknown ledger cannot absorb P1 roots. P1F may reuse its record concepts without mutating T1's base ledger. |
| #77 / P0        | Closed. Its design explicitly excludes later grammar widening. The 401 roots must not be returned to P0.                                                                      |
| #96 / G0        | Downstream language-runtime grouping. Catch binding remains a P1 prerequisite, so G0 is not the primary owner.                                                                |
| #76 / H0        | Closed. H0 made P1G executable and reassigned it to P1 before its ES2025 provenance was reviewed. H0 does not own the later-semantics movement.                               |
| #66 / modules   | Closed module capability/early-error owner; P1 has no module root.                                                                                                            |
| #99 / Annex B   | The focused ledger excludes Annex B. P1C must preserve the existing Annex B.3.5 catch/eval exception without claiming Annex B completion.                                     |

Built-in-looking P1X paths do not move to L0/L1/L2, R0/R1, or Promise work:
later-dependency precedence moves the complete executable root out of the
core denominator before semantic-owner assignment.

## Alternatives

### Selected: evidence correction plus two semantic kernels

Use a small authority foundation, five exact later-dependency decision batches,
and one production child. This keeps every root in one review scope, avoids
later syntax/semantics implementation, and leaves the catch kernel independently
reviewable.

### Rejected: one parser/static production child

It would either implement post-ES2015 syntax or mix taxonomy correction with
unrelated catch runtime behavior and P1G's later-semantic disposition. The
exact audit provides no non-empty ES2015 parser/static implementation ledger.

### Rejected: implement every current P1 root as written

That would add ES2016 through ES2021 grammar plus ES2025 global-environment
semantics and change the release claim from core ES2015 without a roadmap
decision.

### Rejected: route the 402 roots through T1

T1's base ledger, batch hashes, decisions, profiles, and closure proof are
immutable and cover only roots whose prior class was `unknown-edition`.
Expanding it would invalidate its trust root.

### Rejected: add broad prefix rules

The paths are interleaved with ES2015-clean neighbors. Broad rules would move
foreign roots. Exact reviewed decisions are required.

## Child hierarchy

```text
#78 / P1 (grouping; no production commit)
|- P1F  partition-changing roadmap-decision foundation (atomic tooling/docs)
|- P1R  ES2016 binding-rest-pattern decisions (atomic taxonomy; blocked by P1F)
|- P1T  ES2017 trailing-comma decisions (atomic taxonomy; blocked by P1F)
|- P1A  async/await grammar decisions (atomic taxonomy; blocked by P1F)
|- P1X  remaining later-syntax decisions (atomic taxonomy; blocked by P1F)
|- P1C  catch binding and environment semantics (atomic production)
`- P1G  ES2025 global-eval semantics decision (atomic taxonomy; blocked by P1F)
```

P1F has no path ownership and does not participate in the 482-root partition.
All six movement children are direct #78 children and receive the core ES2015
milestone because they are required to make the core denominator truthful.

Generated taxonomy/report/provenance outputs force sequential merges even
where source ledgers are disjoint. Do not run decision consumers in parallel
against stale bases.

## Child contracts

### P1F — Generalize reviewed roadmap decisions for partition movement

**Proposed title:** `Support reviewed partition-changing ES2015 roadmap decisions`

**Scope**

- Extend the generic roadmap authority/evidence model to express exact
  `finalPartition` plus `finalStatus`, rather than forcing partition identity.
- Reuse the T1 decision guarantees: exact prior record, metadata/features/
  includes/flags, exact specification source, rationale, review identity, and
  canonical artifact hash.
- Permit core-to-`later-or-non-es2015` movement only with exact later normative
  evidence.
- Preserve foreign classifications and balanced whole-tree summaries.
- Add preparation/consumer range validation for P1R/P1T/P1A/P1X/P1G.

**Non-goals**

- No classification decision.
- No `src/**` change.
- No selected-subset expansion.
- No change to T1's immutable base ledger or decisions.
- No generic waiver that lets a roadmap consumer choose an arbitrary
  partition.

**Focused identity**

The foundation guards, but does not consume, the exact 402-root current
later-semantics union:

```text
402 roots / 790 variants
sha256 86c5db7f039216edd97c21dd2a116d179e44b3729b8ca3235cb6d805e71ae7d8
```

**Acceptance**

- Current taxonomy and all generated semantic outputs remain byte-identical.
- P1 remains at the corrected live 487/959 identity.
- Tests reject missing normative evidence, unsupported partition/status pairs,
  foreign paths, partial ledgers, stale bases, duplicate decisions, and
  partition changes through old owner-only dispositions.
- Existing H0/M0/M1/P0 and T1 authority behavior stays unchanged.

### P1R — ES2016 binding-rest-pattern disposition

**Proposed title:** `Reclassify ES2016 rest-binding-pattern roots out of P1`

**Ledger**

```text
254 roots / 494 variants
sha256 3a2356b36431b3553a65289afd03eb0aa1e88a36e78b3684cfb460eaf426c4d6
```

**Focused query**

```text
path in corrected live P1 ledger &&
reviewed later dependency is ES2016 BindingRestElement "... BindingPattern"
```

**Scope**

- Complete one exact reviewed decision for every path.
- Move each root to `later-or-non-es2015`.
- Distinguish the 252 generated contexts, including the four post-snapshot P1C
  collateral roots, from the two direct `test/language/rest-parameters/` roots
  while applying the same normative dependency.

**Non-goals**

- Do not implement `function (...[x])`, method/class equivalents, or later
  destructuring grammar.
- Do not claim the ES2015 semantic clause targeted by the generated test.
- Do not change adjacent ES2015-clean destructuring roots.

**Acceptance**

- Exact ledger coverage, zero overlap, exact metadata closure, and normative
  Seventh Edition evidence.
- P1 decreases by exactly 254/494.
- Core decreases and later increases by exactly 254/494.
- No selected-subset or guest behavior change.

### P1T — ES2017 trailing-comma disposition

**Proposed title:** `Reclassify ES2017 function trailing-comma roots out of P1`

**Ledger**

```text
115 roots / 230 variants
sha256 639c946d678180f5be0b2c405c179c1c173694967cef79f25081d773ce084f68
```

**Focused query**

```text
path in immutable P1 ledger &&
reviewed later dependency is ES2017 trailing function parameters or arguments
```

**Scope**

- Review 70 call-argument and 45 formal-parameter roots.
- Move every root to `later-or-non-es2015`.

**Non-goals**

- Do not widen `ecmaVersion`.
- Do not implement trailing commas.
- Do not infer all files under `arguments-object` are later; only exact ledger
  paths move.

**Acceptance**

- P1, core, and later counts move by exactly 115/230.
- Exact Eighth Edition evidence and exact per-root metadata/source identity.
- No guest or selection change.

### P1A — Async grammar disposition

**Proposed title:** `Reclassify async and await grammar roots out of core ES2015`

**Ledger**

```text
16 roots / 32 variants
sha256 4038da176a6b33400cba6b2524d5bf3b6d826a45ce857a7d91535c0a6bb27c88
```

**Focused query**

```text
path in immutable P1 ledger &&
executable source or expected early error depends on async/await grammar
```

**Scope**

- Async functions, async generators, `await`, async `for` grammar, and the two
  function-length files whose bodies include async forms.
- Move all roots to `later-or-non-es2015`.

**Non-goals**

- No async function/generator implementation.
- No reopening the completed async runtime/modules milestone, whose scope did
  not add async-function syntax.
- No path-name-only decision.

**Acceptance**

- Exact ES2017/ES2018 normative evidence per root.
- The `for (async of ...)` negative root records why its expected SyntaxError
  is not a Sixth Edition requirement.
- Exact 16/32 movement and no guest change.

### P1X — Remaining later-syntax disposition

**Proposed title:** `Reclassify remaining post-ES2015 syntax-contaminated P1 roots`

**Ledger**

```text
20 roots / 40 variants
sha256 6f1acdea5f89beb9eccb2eb421002e28fbec13b6d319db1f0455fdc175db0274
```

**Focused query**

```text
path in immutable P1 ledger &&
reviewed dependency is BigInt, nullish coalescing, numeric separators,
or ES2018 tagged-template invalid-escape behavior
```

**Scope**

- Nine BigInt-literal roots.
- Five nullish-coalescing roots.
- Five numeric-separator roots.
- One tagged-template invalid-escape root.

**Non-goals**

- No BigInt, nullish, numeric-separator, or ES2018 tagged-template
  implementation.
- No broad built-in reassignment based on the semantic clause named by the
  test.

**Acceptance**

- Per-subfamily normative sources remain explicit.
- Exact 20/40 movement.
- No foreign root, guest behavior, or selected subset change.

### P1C — Catch parameter binding and environments

**Proposed title:** `Implement ES2015 destructuring catch parameters and catch environments`

**Ledger**

```text
81 roots / 161 variants
sha256 e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5
```

**Focused query**

```text
path in immutable P1 ledger &&
path starts with "test/language/statements/try/" &&
source is valid Sixth Edition grammar
```

**Scope**

- Admit `BindingPattern` in `CatchClause.param`.
- Preserve catch parameter duplicate/declaration early errors and custom AST
  parity.
- Create all bound names before initialization.
- Use shared binding-pattern initialization for synchronous catch evaluation.
- Keep synchronous and generator catch behavior equivalent.
- Cover array/object nested patterns, elisions, rest identifiers, defaults,
  anonymous function/class name inference, iterator close, abrupt completion,
  and environment separation.
- Preserve the catch-environment marker used by Annex B.3.5 eval handling.

**Non-goals**

- No ES2016 `... BindingPattern`.
- No optional catch binding.
- No broad try/finally or generator rewrite.
- No unrelated FunctionDeclarationInstantiation, module, class, or global
  changes.

**Acceptance**

- All 161 variants pass under `TZ=UTC`.
- Portable source, custom AST, and reusable Program tests cover acceptance,
  early errors, descriptors, cycles, and invalid placements.
- Synchronous and generator evaluator probes agree on values and abrupt
  completions.
- Exact taxonomy movement covers P1C only.
- Node, Chromium, JavaScriptCore, focused Test262, exact-head CI, and CodeQL
  are clean.

### P1G — ES2025 global environment semantics disposition

**Proposed title:** `Reclassify ES2025 global eval redeclaration semantics out of P1`

**Ledger**

```text
1 root / 2 variants
sha256 80c9e4c41001ea0382bea315dab951927f670b5c9c32ba2db7dea6e509bd1aee
```

**Focused query**

```text
path === "test/language/global-code/script-decl-lex-var-declared-via-eval.js" &&
reviewed final partition === "later-or-non-es2015" &&
reviewed normative dependency === ES2025 global [[VarNames]] removal
```

**Scope**

- Record exact prior classification and source/metadata closure.
- Cite the ES2024 rejecting algorithm, ES2025 accepting algorithm, normative
  PR #3226, and pinned Test262 update.
- Move the exact root to `later-or-non-es2015`.
- Use P1G as the first small consumer proof for P1F's partition-changing
  authority path before the larger decision batches.

**Non-goals**

- No `src/**` change.
- Do not remove `GlobalEnvironmentRecord.varNames`,
  `HasVarDeclaration`, or the ES2015 preflight check.
- No `$262`, eval, global environment, or lexical-declaration behavior change.
- No claim that the pinned Test262 expectation is Sixth Edition behavior.

**Acceptance**

- Exact Sixteenth Edition normative evidence and exact Fifteenth Edition
  counter-evidence are recorded.
- The decision explains that Editions 6-15, including ES2020, retain
  `HasVarDeclaration`.
- P1 decreases by exactly 1/2; core decreases and later increases by exactly
  1/2.
- No guest behavior or selected-subset change.
- Exact taxonomy/provenance, CI, CodeQL, and independent specification review
  are clean.

## Sequencing

Recommended merge order:

1. **P1C** — highest-leverage implementable semantic child: 81 roots / 161
   variants, one parser/runtime seam, and an existing generator-side
   implementation to align with.
2. **P1F** — install partition-changing reviewed-decision support without
   moving classifications.
3. **P1G** — prove the new path on the one-root ES2025 semantic delta.
4. **P1R** — remove the largest false attribution.
5. **P1T**.
6. **P1A**.
7. **P1X**.

P1R has the largest raw attribution leverage, but it is not implementable
safely before P1F because the current generic authority validator forbids
partition changes. P1C is therefore the recommended next production child.

Each movement child needs a separately prepared pending authority on exact
current main before its consumer. Authority preparation is trust metadata, not
permission to combine child scopes. Rebase and regenerate after every merge.

## Projected accounting

If all five reviewed later-dependency batches move exactly as designed:

```text
P1:                       483/951 -> 81/161
core partition:      24,250/46,424 -> 23,848/45,634
later partition:     26,172/51,242 -> 26,574/52,032
```

If P1C then passes and is promoted:

```text
P1:                    81/161 -> 0/0
selected-passing: 19,768/37,631 -> 19,849/37,792
```

The whole pinned tree remains 53,575 roots / 102,912 variants.

These are design projections, not permission to write generated artifacts.
Every child must recompute them from its exact base and stop on drift.

## Grouping issue update contract

After child issue creation, #78 should:

1. preserve comment `5347038305` as the immutable 482/949 base;
2. preserve the historical pre-P1C 483/951 identity as superseded analysis;
3. publish the corrected live 487/959 ledger with SHA-256
   `94467957a7d427219cfcbe301adef006052437c30a56533ef510e3dacbfbaf88`
   and identify the one H0 delta plus four post-snapshot P1R additions;
4. state that #76 and #77 are closed resolved history;
5. replace generic parser/static/runtime wording with the named P1F/P1R/P1T/
   P1A/P1X/P1C/P1G hierarchy;
6. state explicitly that P1R/P1T/P1A/P1X/P1G are taxonomy-only and prohibit
   guest implementation;
7. add exact child counts, hashes, native relationships, and sequencing;
8. retain the sentence that #78 owns no production commit; and
9. update parent #70's current-main identity, counts, and P1 row.

Do not delete old dependency comments or silently rewrite the historical base.

## Closure criteria

#78 closes only after:

1. P1F and every movement child are closed with exact merge evidence;
2. the original 482-root ledger still reconciles exactly through the immutable
   250-root P1R snapshot plus P1T/P1A/P1X/P1C, while the four live P1R
   additions reconcile separately;
3. P1G accounts for the exact one-root H0 delta;
4. every pair of child ledgers is disjoint;
5. the union of all movement children reconstructs the current source selector
   used for the final reclassification;
6. all 406 later-dependent roots have independent normative review and are no
   longer in the core partition;
7. P1C is selected-passing, or any different destination has new exact
   reviewed evidence rather than silent scope expansion;
8. the live P1 selector is zero;
9. whole-tree root and variant balances are exact;
10. downstream #70, #96, #98, and #100 dependency/count text is refreshed;
11. Node, Chromium, JavaScriptCore, focused pinned Test262, taxonomy drift,
    exact-head CI, CodeQL, and required reviews are clean; and
12. #78 itself has no production commit.

## Risks and required review attention

1. **Denominator correction is material.** Moving 406 roots / 798 variants
   changes the published core and later partitions. Independent specification
   and taxonomy review is mandatory.
2. **Parser-version probing is not normative proof.** It only located the
   contamination. Decision records must cite exact later specification
   dependencies.
3. **Authority support is currently insufficient.** Generic roadmap
   dispositions preserve `partition`; P1F is required before any core-to-later
   consumer.
4. **Test filenames and `esid` are misleading.** A root may target an ES2015
   semantic clause while its executable source is later. Classification follows
   the complete executable dependency closure.
5. **Catch behavior is currently asymmetric.** The generator evaluator already
   has pattern initialization while the synchronous evaluator does not; the
   parser gate hides both. P1C must prove parity rather than copying code
   blindly.
6. **P1G is a deliberate edition conflict.** The engine comments and behavior
   encode the Sixth Edition rule, while pinned Test262 encodes ES2025. Do not
   treat that disagreement as an implementation defect.
7. **Main may move before child creation.** The hashes in this design are exact
   for `215e5ff`. Any intervening taxonomy movement requires a fresh current
   selector while preserving the immutable 482-root reconciliation.

## Ignored evidence inventory

The local ignored evidence includes:

- reconstructed issue and current selector ledgers;
- the six child ledgers and parser/later/runtime aggregate ledgers;
- per-root Test262 metadata, source hashes, minimum-parser-edition diagnostics,
  current taxonomy records, and disposition reasons;
- the 949-variant focused execution report;
- exact Sixth and later edition source snapshots and hashes;
- blocker/parent/issue JSON; and
- focused baseline test output.

The canonical summary is:

```text
.superpowers/sdd/2026-08-23-p1-decomposition/partition-report.json
.superpowers/sdd/2026-08-23-p1-decomposition/partition-report.md
```
