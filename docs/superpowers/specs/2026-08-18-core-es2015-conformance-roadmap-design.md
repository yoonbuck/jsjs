# Core ECMAScript 2015 Conformance Roadmap Design

**Date:** 2026-08-18

**Parent:** [#70 Complete ES2015 conformance](https://github.com/yoonbuck/jsjs/issues/70)

**Audit:** [#71 Audit remaining ES2015 conformance gaps](https://github.com/yoonbuck/jsjs/issues/71)

**Release dependency:** [#61 Integrate and release async runtime and modules](https://github.com/yoonbuck/jsjs/issues/61)

## Status

This design is approved for the issue #71 audit branch. It is analysis and
delivery design only; the branch must not change guest production behavior.

The original quantitative design baseline is repository commit
`5326cc6e0753087db34df4b5d8c637902f57fb88` with Test262 revision
`b363f29d3c43c626dc852744ad64a0b48a003693`; that baseline is retained below
only as historical context. Issue #61 is now merged on `origin/main` at
`bf082063dfce6cd995edda4da3e350e7cd0b498f`. Every issue scope, percentage, and
release-proof statement below now uses the definitive post-#61 UTC refresh
manifest.

## Definitive post-#61 evidence

- #61 merge SHA: `bf082063dfce6cd995edda4da3e350e7cd0b498f`
- Audited `origin/main`: `bf082063dfce6cd995edda4da3e350e7cd0b498f`
- Test262: `https://github.com/tc39/test262.git` at
  `b363f29d3c43c626dc852744ad64a0b48a003693`
- UTC classification artifact SHA-256:
  `a9ee1a016d54c7dd27f952ba9adf6b5edbab2a0b7070d2d406116ae89eef182f`
- Path delta from the design baseline: `0` added, `0` removed, `30`
  reclassified

The 30 reclassified roots break down into 16 post-#61 pass promotions, 11
generator roots now present in the broad selected subset, and 3
metadata/classification repairs. No roots were added or removed.

### Refreshed balanced partition

| Final partition              |      Roots | Executable variants |     Roots % |  Variants % |
| ---------------------------- | ---------: | ------------------: | ----------: | ----------: |
| Core ES2015 main body        |     24,250 |              46,424 |      45.264 |      45.110 |
| Annex B normative-optional   |        725 |                 960 |       1.353 |       0.933 |
| Affirmative later/non-ES2015 |     26,172 |              51,242 |      48.851 |      49.792 |
| Unknown edition              |      2,312 |               4,054 |       4.315 |       3.939 |
| Test262 harness validation   |        116 |                 232 |       0.217 |       0.225 |
| Malformed metadata           |          0 |                   0 |       0.000 |       0.000 |
| **Whole pinned tree**        | **53,575** |         **102,912** | **100.000** | **100.000** |

### Refreshed core status

| Core ES2015 status            |      Roots | Executable variants |     Roots % |  Variants % |
| ----------------------------- | ---------: | ------------------: | ----------: | ----------: |
| Selected and passing          |     13,280 |              25,350 |      54.763 |      54.605 |
| Audit-passing, unselected     |      6,323 |              11,955 |      26.074 |      25.752 |
| Blocked by one named core gap |      4,645 |               9,115 |      19.155 |      19.634 |
| Mandatory deviation           |          2 |                   4 |       0.008 |       0.009 |
| **Core total**                | **24,250** |          **46,424** | **100.000** | **100.000** |

### Refreshed Annex B status

| Annex B status            |   Roots | Executable variants |     Roots % |  Variants % |
| ------------------------- | ------: | ------------------: | ----------: | ----------: |
| Selected and passing      |      71 |                 138 |       9.793 |      14.375 |
| Audit-passing, unselected |      23 |                  42 |       3.172 |       4.375 |
| Blocked                   |     631 |                 780 |      87.034 |      81.250 |
| **Annex B total**         | **725** |             **960** | **100.000** | **100.000** |

### Refreshed core owning blocker ledger

| Core owning blocker                    |     Roots | Executable variants |    Roots % | Variants % |
| -------------------------------------- | --------: | ------------------: | ---------: | ---------: |
| Binary data and TypedArrays            |     1,501 |               2,994 |      6.190 |      6.449 |
| Remaining standard-library additions   |       775 |               1,537 |      3.196 |      3.311 |
| Proxy/Reflect/MOP                      |       623 |               1,211 |      2.569 |      2.609 |
| Collections                            |       534 |               1,064 |      2.202 |      2.292 |
| Early errors/declaration instantiation |       482 |                 949 |      1.988 |      2.044 |
| Symbol protocol dispatch               |       294 |                 574 |      1.212 |      1.236 |
| Harness-only cross-Realm test support  |       135 |                 267 |      0.557 |      0.575 |
| Remaining language runtime semantics   |       132 |                 215 |      0.544 |      0.463 |
| Lexical grammar and `new.target`       |        83 |                 164 |      0.342 |      0.353 |
| RegExp `u`/`y` direct blocker          |        54 |                 108 |      0.223 |      0.233 |
| Proper tail calls                      |        32 |                  32 |      0.132 |      0.069 |
| **Blocked core**                       | **4,645** |           **9,115** | **19.155** | **19.634** |
| Mandatory deviations                   |         2 |                   4 |      0.008 |      0.009 |
| **Blocked plus deviations**            | **4,647** |           **9,119** | **19.163** | **19.643** |

### Refreshed Annex B blocker ledger

| Annex B blocker                        |   Roots | Executable variants |    Roots % | Variants % |
| -------------------------------------- | ------: | ------------------: | ---------: | ---------: |
| Annex B web compatibility              |     386 |                 480 |     53.241 |     50.000 |
| Early errors/declaration instantiation |     192 |                 204 |     26.483 |     21.250 |
| Harness-only cross-Realm test support  |      36 |                  62 |      4.966 |      6.458 |
| Proxy/Reflect/MOP                      |      13 |                  26 |      1.793 |      2.708 |
| Symbol protocol dispatch               |       2 |                   4 |      0.276 |      0.417 |
| Binary data and TypedArrays            |       1 |                   2 |      0.138 |      0.208 |
| Lexical grammar and `new.target`       |       1 |                   2 |      0.138 |      0.208 |
| **Blocked Annex B**                    | **631** |             **780** | **87.034** | **81.250** |

All percentages in these tables use `toFixed(3)` output from the UTC refresh
manifest. The malformed bucket is now `0 / 0` because the three historical
malformed roots were reclassified during the definitive refresh.

## Decision summary

The roadmap uses architecture-first kernels rather than raw coverage order:

1. Publish deterministic taxonomy and promote only exact paths that already
   pass.
2. Adjudicate unknown-edition roots and start a living Sixth Edition clause
   matrix.
3. Add harness-only portable cross-Realm Test262 support.
4. Complete lexical grammar, `new.target`, early errors, and declaration
   instantiation.
5. Formalize a polymorphic object internal-method contract, then implement
   Reflect and Proxy sequentially.
6. Complete Symbol protocol dispatch.
7. Build collections and binary data on the stable MOP and protocol kernels.
8. Extend the engine-owned RegExp grammar, observable state, and protocols
   while retaining a private, probed host match primitive.
9. Complete narrow residual library and language slices.
10. Implement mandatory proper tail calls with strict-tail requests and an
    ordinary activation trampoline.
11. Close the clause matrix and publish a core ECMAScript 2015 release.

Annex B remains a separately reported, non-blocking optional track.

## Goals

- Classify every pinned Test262 root into one mutually exclusive class with an
  auditable reason.
- Distinguish mandatory Sixth Edition main-body requirements, normative-optional
  Annex B, later/non-ECMAScript requirements, harness validation, malformed
  metadata, and roots whose edition remains unknown.
- Give every confirmed ES2015 failure one named owning blocker.
- Quantify each blocker in root files and executable variants.
- Preserve exact-path evidence without globally enabling Test262 feature tags.
- Define focused native GitHub children with semantic dependencies, delivery
  boundaries, non-goals, and release gates.
- Establish a clause-level proof that complements Test262 rather than treating
  Test262 coverage as the definition of standard compliance.
- Preserve portable behavior across Node, Chromium, and JavaScriptCore.

## Non-goals

- Production behavior changes on the issue #71 branch.
- Annex B completeness as a blocker for the core release.
- Post-ES2015 features, including async functions/iteration, dynamic import,
  import metadata or attributes, object rest/spread, class fields/private
  elements/static blocks, exponentiation, SharedArrayBuffer/Atomics,
  resizable/growable buffers, later collection methods, or later RegExp syntax.
- Globally claiming a Test262 feature because one tagged root passes.
- Replacing the complete evaluator with the generator frame machine.
- Building an engine-owned RegExp matcher when the approved private host backend
  can prove all ES2015 semantics.
- Adding a tracing garbage collector solely for weak collections.

## Alternatives considered

### Architecture-first kernels (selected)

This order stabilizes shared parser, MOP, protocol, Realm, and storage
boundaries before surface implementations consume them. It minimizes duplicate
machinery and makes each later failure attributable to the next real blocker.
The tradeoff is that visible coverage grows more slowly after the initial
semantics-neutral promotion.

### Coverage-first

This order would promote passing roots, then pursue binary data and library
families by raw unlock count. It gives the fastest headline increase but risks
duplicating internal-method, species, iterator, and Realm infrastructure. It
also encourages reporting progress before foundational invariants are stable.

### Parallel surface families

This order would run language, MOP/collections, binary, library/RegExp, and PTC
workstreams concurrently. It has the shortest theoretical wall time but the
highest overlap in object internals, intrinsic construction, error ownership,
and selection artifacts. Reconciliation and whole-branch review risk outweigh
the scheduling benefit for this interpreter.

## Conformance claim

Issue #70 must be retitled and described as **core ECMAScript 2015
conformance**. The release claim covers mandatory ECMA-262 Sixth Edition
main-body requirements. It does not imply browser compatibility or Annex B
completeness.

Final documentation must:

- use the qualified phrase "core ECMAScript 2015";
- explain that Annex B is normative-optional;
- explain why a portable non-browser interpreter does not use Annex B as a core
  release gate;
- publish core, Annex B, later, unknown, harness, and malformed tables
  separately; and
- retain visible Annex B inventory and failures rather than hiding them to
  improve a percentage.

## Deterministic Test262 taxonomy

### Inputs

The taxonomy generator consumes only explicit, versioned inputs:

- `package.json` Test262 repository, revision, and checkout path;
- the checkout's exact `HEAD`;
- the current selection and exclusion policies;
- `tools/test262/features.json` and its executable probes;
- Test262 metadata, flags, includes, and `harness/features.yml` include
  dependencies;
- a versioned ES2015/later feature map;
- reviewed exact path overrides;
- the Sixth Edition anchor artifact; and
- exact focused execution records produced under `TZ=UTC`.

The proposed checked-in anchor artifact is
`tools/test262/es2015-anchors.json`, schema/generator version 1. It records:

- source URL `https://262.ecma-international.org/6.0/`;
- exact source SHA-256
  `4d4243dc2f04c9cdd09498f2cc2af6f6cdc07b0430da5578e7cf440d4f7846a0`;
- all 3,448 exact anchors sorted by code unit; and
- the generator schema/version.

The proposed generator is `tools/test262/es2015-audit.js`, invoked through:

```sh
TZ=UTC npm run test262:es2015:audit
TZ=UTC npm run test262:es2015:audit:check
```

The report records the Test262 repository and exact revision
`b363f29d3c43c626dc852744ad64a0b48a003693` until the project deliberately
moves the pin.

### Root inventory

A root is a `test/**/*.js` file except an `_FIXTURE.js` dependency. Harness
files and Test262 tooling outside `test/` are not roots. The inventory uses the
existing runner's exact variant expansion:

- `raw`, `onlyStrict`, `noStrict`, and `module` roots produce one executable
  variant;
- ordinary roots produce non-strict and strict variants; and
- malformed metadata roots count as files and zero executable variants.

Percentages are `part / total * 100`, rounded to nearest three decimal places.
Rendered documentation always uses `toFixed(3)` so trailing zeroes remain
visible. Machine artifacts may store the same value as a JSON number.

### Edition and class precedence

Every root receives one final class. Classification proceeds in this order:

1. Malformed metadata becomes `malformed`.
2. `test/harness/` self-tests become `harness-validation`.
3. A known later or non-ECMAScript dependency makes the root
   `later-or-non-es2015`. Dependencies include feature tags, grammar/path
   shapes, flags, and transitive harness include requirements.
4. Affirmative evidence makes the root ES2015:
   - inherited `es5id`, because ES2015 is cumulative;
   - `es6id`;
   - an exact reviewed Sixth Edition anchor or path rule; or
   - a versioned explicit ES2015 feature rule.
5. A root without affirmative evidence remains `unknown-edition`.
6. An ES2015 root becomes exactly one of:
   - `selected-passing`;
   - `audit-passing-unselected`;
   - `blocked:<named-gap>`; or
   - `intentional-deviation`.

Later dependency precedence is stronger than `es5id`, `es6id`, or an ES2015
dependency tag. A current test can depend on both ES2015 and later features.

Historical existence, file age, source text matching, and directory proximity
may prioritize review but never establish edition by themselves.

### Audit execution and promotion

Audit execution names exact paths and runs under `TZ=UTC`. Temporarily allowing
a candidate's ES2015 dependency tags bypasses only the runner gate for those
exact roots. It does not:

- edit `features.json`;
- publish passing coverage;
- prove every root carrying the same tag; or
- authorize a broad selection expansion.

A root remains `audit-passing-unselected` until the promotion slice proves its
dependency closure, exact focused execution, and selection provenance.
Promotion stays exact-path-based until a shared executable probe truthfully
represents the feature's complete selected surface.

### Unknown-edition adjudication

Unknown roots cannot remain a permanent blind spot while #70 claims core
conformance. The definitive post-#61 manifest contains 2,312 roots and 4,054
variants:

- staging: 1,193 roots / 2,208 variants;
- language: 773 / 1,459;
- Annex B: 314 / 323; and
- built-ins: 32 / 64.

Most refreshed unknown roots were added after the 2015 year-end Test262 tree.
That history prioritizes review but does not settle edition.

The adjudication stream uses exact source, Sixth Edition clauses, file/spec
history, and reviewed manual semantic provenance. Each resolved root moves once
to core, Annex B, later, harness, or malformed. Final acceptance requires
either:

- zero unknown roots relevant to ECMA-262; or
- reviewed per-group proof that every remaining unknown lacks affirmative
  ES2015 evidence.

### Historical design baseline at `5326cc6`

The approved `5326cc6` design baseline remains historical context only. It
records the last pre-#61 snapshot and must not drive refreshed issue scopes or
percentages.

| Final partition              |      Roots | Executable variants |
| ---------------------------- | ---------: | ------------------: |
| Core ES2015 main body        |     24,250 |              46,424 |
| Annex B normative-optional   |        725 |                 960 |
| Affirmative later/non-ES2015 |     26,170 |              51,240 |
| Unknown edition              |      2,311 |               4,052 |
| Test262 harness validation   |        116 |                 232 |
| Malformed metadata           |          3 |                   0 |
| **Whole pinned tree**        | **53,575** |         **102,908** |

The refreshed post-#61 manifest above is now the only source for roadmap issue
scopes, percentages, and GitHub evidence. Current evidenced core coverage is
54.763% of roots and 54.605% of variants. After semantics-neutral exact-path
promotion, it would be:

- 19,603 / 24,250 = 80.837% of roots; and
- 37,305 / 46,424 = 80.357% of variants.

Shared core gaps currently stop 245 Annex B roots / 300 variants before
Annex-B-specific behavior. The direct optional web-compatibility bucket is
386 / 480. Shared work is reclassified after each merge and is not duplicated
as Annex B implementation.

### Mandatory deviations

These non-Annex roots are mandatory core requirements:

- `test/language/literals/regexp/S7.8.5_A1.4_T2.js`;
- `test/language/literals/regexp/S7.8.5_A2.4_T2.js`.

Both must pass through the lexical/RegExp layers before the core claim. They
share an IdentifierName/identity-escape root cause but retain separate
acceptance records. The current limitation is updated or removed only after
both exact paths pass.

## Owning blocker ledgers

The definitive post-#61 evidence above is the only source for owning totals.
Every blocked core root belongs to one core row, Annex B keeps a separate
optional ledger, and downstream consumer references never increase these
totals.

The 205 / 408 RegExp/String Symbol consumers are inside the 294 / 574 Symbol
row. The 39 / 78 residual RegExp additions are inside the 775 / 1,537 library
row. RegExp delivery cross-references those paths without counting them again.

After every semantic merge, the taxonomy reruns. A root moves only after exact
focused execution and valid selection provenance. A prerequisite merge does
not automatically claim its consumers.

## Approved architecture

### Harness-only portable `$262`

`$262` belongs to Test262 embedding infrastructure. The runner may install it;
it is never a guest global in normal evaluation and never becomes a public
runtime API.

The initial harness surface provides same-Agent `createRealm` and `evalScript`
with Realm-owned errors. `$262.detachArrayBuffer` arrives only after Data Blocks
exist. Later agent and GC hooks stay excluded unless an exact ES2015 test proves
they are required.

### Polymorphic object internal-method contract

`EngineObject` keeps the repository's class architecture, but the complete
ES2015 essential internal-method surface becomes explicit:

- `[[GetPrototypeOf]]`;
- `[[SetPrototypeOf]]`;
- `[[IsExtensible]]`;
- `[[PreventExtensions]]`;
- `[[GetOwnProperty]]`;
- `[[DefineOwnProperty]]`;
- `[[HasProperty]]`;
- receiver-aware `[[Get]]`;
- receiver-aware `[[Set]]`;
- `[[Delete]]`;
- `[[OwnPropertyKeys]]`; and
- branded `[[Call]]` and `[[Construct]]` capabilities.

Property keys normalize before dispatch. Ordinary behavior lives in
specification-shaped helpers such as `OrdinaryGet`,
`OrdinarySetWithOwnDescriptor`, and `OrdinaryDefineOwnProperty`.
`EngineObject` delegates to them; exotics override only differing algorithms.

Every evaluator, reference, builtin, descriptor, environment, iterator, module,
and host API caller uses internal methods. Semantic `getClassName()` branches
and direct `_properties`/`_prototype` access outside ordinary helpers or narrow
reviewed diagnostic paths are prohibited by repository invariants.

Receiver propagation crosses every prototype and exotic boundary. Accessors use
the original receiver. Data creation/update respects receiver descriptors and
extensibility. Existing Array, String wrapper, Arguments, Function,
Promise/Generator as applicable, and module namespace objects receive invariant
coverage before Proxy and integer-indexed exotics reuse the contract.

Delivery is sequential:

1. contract, ordinary helpers, caller migration, hostile synthetic exotic, and
   performance invariants;
2. Reflect;
3. Proxy traps, revocation, target invariants, and Realm/error ownership; and
4. later reuse by integer-indexed objects.

Ordinary fast paths and benchmark baselines remain. Correct polymorphism cannot
be traded for speed, but the design avoids per-object method-table allocation
and unnecessary success-path descriptor detachment.

### Complete Symbol protocols

The protocol layer implements behavior rather than merely defining
well-known-symbol values:

- `@@hasInstance`;
- `@@isConcatSpreadable`;
- species construction;
- `@@unscopables`;
- Array concat/species behavior; and
- shared method/species/construction helpers.

It first proves ordinary/current exotic behavior after the MOP contract.
Proxy-specific interactions remain owned and revalidated by the Proxy child.

RegExp/String `@@match`, `@@replace`, `@@search`, and `@@split` routing uses the
same protocol helpers but lands through the dedicated RegExp integration child
so routing is not implemented twice.

### Collections

Map and Set use authoritative engine-owned ordered entry lists with explicit
empty/tombstone slots. Engine operations define `SameValueZero`, `-0`
normalization, guest object identity, insertion order, delete/re-add, clear,
live iteration, and `forEach` mutation behavior. Host Map/Set never defines
guest semantics.

Constructors dynamically obtain adders in specification order and consume
existing iterator operations with exact IteratorClose and error precedence.
Per-Realm constructor/prototype/iterator graphs, brand checks, descriptors,
`@@iterator`, `@@toStringTag`, species, and required function identity are part
of acceptance.

WeakMap and WeakSet validate EngineObject keys in the engine. Private host
WeakMap/WeakSet storage may key the stable one-to-one EngineObject wrapper solely
to preserve weak reachability. It never escapes or defines guest errors,
identity, enumeration, or Realm ownership. Symbols are not ES2015 weak keys.

An optional lookup index is a derived cache only; the ordered list remains
authoritative. Delivery starts without the cache unless benchmark evidence
justifies it.

### ArrayBuffer, DataView, and TypedArrays

The sole shared storage identity is an engine Data Block:

```text
{ bytes: private Uint8Array | null, byteLength }
```

`null` means detached. Guest ArrayBuffer, DataView, and TypedArray objects store
only engine slots pointing to the Data Block with their offsets and lengths.
Host buffer/view objects never escape, determine guest prototypes, or serve as
guest identity.

A centralized host-neutral codec module owns byte operations. It may use
private host `Uint8Array` storage and ephemeral host `DataView` codecs with
explicit endianness. Node, Chromium, and JSC capability probes cover integer and
IEEE-754 behavior. There is no host-native-endian assumption or per-host fork.

Element conversion happens before encoding and covers signed/unsigned modulo,
`Uint8Clamped` ties-to-even, `-0`, infinities, Float32 rounding, and the
documented permitted NaN byte policy. Detachment invalidates all sharing views
immediately.

Integer-indexed objects use the approved MOP contract, including
`CanonicalNumericIndexString`, `-0`, fractional/out-of-range indices,
descriptor invariants, own-key order, receiver behavior, detached access, and
ordinary named/Symbol properties.

Delivery is sequential:

1. Data Block, codec, and ArrayBuffer;
2. DataView;
3. integer-indexed exotic kernel and constructors;
4. TypedArray methods, species, iterators, and integration.

All nine numeric TypedArrays, `%TypedArray%`, per-Realm graphs,
`ArrayBuffer.isView`, all ES2015 construction sources, overlap-safe copies, and
detachment/coercion order are required. SharedArrayBuffer/Atomics and
resizable/growable buffers are later non-goals.

### RegExp

jsjs owns the exact ES2015 Pattern grammar and flags before any host
compilation. It rejects later syntax even when a modern host accepts it.
Translation is explicit and total across identity escapes, Unicode
escapes/classes, dot, anchors, backreferences, and code-unit/code-point
behavior. A valid ES2015 pattern that cannot be represented faithfully is an
implementation blocker, not a silent rejection.

The engine owns:

- constructor call/construct/cloning rules;
- source and flags;
- `unicode` and `sticky`;
- authoritative `lastIndex`;
- `RegExpExec` and custom `exec`;
- zero-width advancement;
- species; and
- String/RegExp Symbol protocols.

A private ephemeral host RegExp is a match primitive only. Internal sticky
compilation positions the backend but does not define guest sticky behavior.
Versioned capability/divergence probes cover every backend assumption on Node,
Chromium, and JSC. Failure is closed at setup; no host-specific semantic fork is
permitted.

Host backtracking remains a guest-controlled resource risk. Adversarial
regression/benchmark guards cover deterministic cases, and the limitation is
documented with scope and rationale. It is an inherent approved backend
boundary, not a generic waiver for exploitable findings.

Delivery has at least two children:

1. grammar, flags, translation, backend probes, observable state, and direct
   `u`/`y`; and
2. RegExp/String Symbol integration and residual RegExp additions.

Named groups, lookbehind, property escapes, dotAll, and other later RegExp
features are non-goals.

### Proper tail calls

The implementation uses exact Sixth Edition tail-position static semantics,
not a heuristic over `return`. It covers conditional, logical, sequence,
concise arrow, block, labeled, `if`, switch, and try/catch/finally rules.

After callee/reference/receiver and every argument/spread operand has completed
in exact order, an eligible strict call produces an internal
`TailCallRequest`. It is never guest-observable or catchable. The ordinary
activation trampoline replaces execution contexts, not environment records in
place. Callees receive fresh parameter/function/body environments; retained
closures and references remain valid.

Dispatch specifies ordinary, arrow, method, bound, native/builtin, generator,
class/non-callable, Proxy, and cross-Realm targets. Constructor calls are not
tail calls. Native targets may complete after caller release; bound targets
preserve bound receiver/arguments and target Realm.

StackGuard accounting proves constant active engine and host stack for long
direct and mutual strict chains while non-tail recursion retains bounded failure
behavior. Universal evaluator migration remains out of scope. The design
documents this second continuation boundary and its shared invariants with the
generator machine.

## Delivery layers and attribution

### Taxonomy, promotion, and proof

- Exact core promotion: 6,323 roots / 11,955 variants.
- Unknown adjudication: 2,312 / 4,054 to resolve, not coverage.
- Living clause matrix: proof artifact, no coverage count.

### Parser and harness

- Harness-only cross-Realm support: 135 / 267.
- Lexical grammar and `new.target`: 83 / 164.
- Early errors and declaration instantiation: 482 / 949.

### MOP

The 623 / 1,211 owning row partitions into:

- contract/ordinary migration and consumers: 240 / 459;
- Reflect: 113 / 226; and
- Proxy: 270 / 526.

### Symbol protocols

The 294 / 574 owning row partitions into:

- non-RegExp protocols: 89 / 166; and
- RegExp/String consumers: 205 / 408.

The second subtotal is cross-referenced by RegExp delivery and is not added to
the total again.

### Collections

The 534 / 1,064 owning row partitions into:

- Map: 154 / 306;
- Set: 196 / 390;
- WeakMap/WeakSet: 164 / 328; and
- integration consumers: 20 / 40.

### Binary data

The 1,501 / 2,994 owning row partitions into:

- ArrayBuffer: 79 / 158;
- DataView: 377 / 754;
- integer-indexed exotics and constructors: 311 / 620;
- TypedArray methods/species/iterators: 682 / 1,360; and
- integration consumers: 52 / 102.

### RegExp

RegExp delivery spans separate owning rows without double-counting:

- direct `u`/`y`: 54 / 108;
- RegExp/String Symbol consumers: 205 / 408, already Symbol-owned;
- residual RegExp additions: 39 / 78, already library-owned; and
- mandatory deviations: 2 / 4.

### Residual surfaces

The 775 / 1,537 library row partitions into:

- Array/Object: 371 / 730;
- String/Number/Math: 253 / 506;
- Function/Date/Error/JSON/remaining: 112 / 223; and
- RegExp: 39 / 78.

The non-RegExp library subtotals are 736 / 1,459.

Remaining language runtime semantics own 132 / 215. Proper tail calls own
32 / 32.

## Proposed GitHub hierarchy

After written-spec approval and the post-#61 refresh, create these as direct
native sub-issues of #70. Stable codes are replaced by issue numbers in bodies.

An **atomic** issue owns one reviewed PR. A **grouping** issue owns no production
commit; it creates focused nested atomic children after blocker audit and closes
after their merges and reclassification. A **tracking** issue accumulates proof
across other owners.

| Code | Delivery | Proposed title                                                                | Current attribution                             | Dependencies                                     |
| ---- | -------- | ----------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| T0   | Atomic   | Publish deterministic ES2015 Test262 taxonomy and promote exact passing roots | 6,323/11,955                                    | #61, #71 design                                  |
| T1   | Grouping | Adjudicate unknown Test262 edition provenance                                 | 2,312/4,054 to resolve                          | T0                                               |
| H0   | Atomic   | Implement portable harness-only Test262 cross-Realm support                   | 135/267                                         | T0                                               |
| P0   | Atomic   | Complete ES2015 lexical grammar and `new.target`                              | 83/164                                          | T0                                               |
| P1   | Grouping | Complete core ES2015 early errors and declaration instantiation               | 482/949                                         | P0, H0                                           |
| M0   | Atomic   | Formalize the ES2015 object internal-method contract                          | 240/459 subtotal                                | T0                                               |
| M1   | Atomic   | Complete ES2015 Reflect atop the internal-method contract                     | 113/226                                         | M0                                               |
| M2   | Atomic   | Implement ES2015 Proxy traps, revocation, and invariants                      | 270/526                                         | M0, M1                                           |
| S0   | Atomic   | Complete non-RegExp ES2015 Symbol protocol dispatch                           | 89/166                                          | M0                                               |
| C0   | Atomic   | Implement the ordered collection kernel and ES2015 Map                        | 154/306                                         | H0, M0, S0                                       |
| C1   | Atomic   | Implement ES2015 Set and live collection iterators                            | 196/390                                         | C0                                               |
| C2   | Atomic   | Implement ES2015 WeakMap and WeakSet with private weak storage                | 164/328                                         | C0, C1                                           |
| C3   | Atomic   | Integrate ES2015 collections across Realms, iterables, and consumers          | 20/40                                           | C0-C2                                            |
| B0   | Atomic   | Implement Data Blocks, byte codecs, and ES2015 ArrayBuffer                    | 79/158                                          | H0, M0, S0                                       |
| B1   | Atomic   | Implement ES2015 DataView                                                     | 377/754                                         | B0                                               |
| B2   | Atomic   | Implement integer-indexed exotica and TypedArray constructors                 | 311/620                                         | B0, B1, M0, S0                                   |
| B3   | Grouping | Complete ES2015 TypedArray methods, species, iterators, and integration       | 734/1,462                                       | B2                                               |
| R0   | Atomic   | Implement ES2015 RegExp grammar, `u`/`y`, state, and probed backend           | 54/108 plus deviations 2/4                      | H0, P0, M0, S0                                   |
| R1   | Atomic   | Complete RegExp/String Symbol protocol integration                            | non-additive cross-references 205/408 and 39/78 | R0, S0                                           |
| L0   | Grouping | Complete ES2015 Array and Object additions                                    | 371/730                                         | M0, S0                                           |
| L1   | Grouping | Complete ES2015 String, Number, and Math additions                            | 253/506                                         | S0, R0, R1                                       |
| L2   | Grouping | Complete ES2015 Function, Date, Error, JSON, and remaining library additions  | 112/223                                         | M0, S0                                           |
| G0   | Grouping | Complete remaining core ES2015 language runtime semantics                     | 132/215                                         | P0, P1, M0, M2                                   |
| G1   | Atomic   | Implement mandatory ES2015 proper tail calls                                  | 32/32                                           | P0, P1, M0, M2, G0                               |
| V0   | Tracking | Build and close the mandatory Sixth Edition clause coverage matrix            | proof artifact                                  | T0, T1 initially; every mandatory layer to close |
| A0   | Grouping | Complete optional Annex B web compatibility                                   | direct 386/480; full 725/960                    | shared layers as applicable; non-blocking        |
| F0   | Atomic   | Integrate and publish core ECMAScript 2015 conformance                        | release proof                                   | every mandatory completion and V0; not A0        |

P1 creates separate nested children for parser/static early errors and
declaration-instantiation runtime when both scopes are substantial. B3, L0-L2,
and G0 are grouping issues by default. Other atomic labels remain contingent on
a detailed one-PR plan that is still reviewable; if planning disproves that
boundary, convert the issue to grouping before production work.

V0 is a living tracking issue, not one atomic delivery. It may have an initial
reviewed skeleton PR, but matrix updates land with each owning semantic PR.

### Native dependency rules

- Attach every proposed issue as a native sub-issue of #70.
- Use actual native `blocked by` relationships, not body text alone.
- Distinguish semantic blockers from sequencing notes in every body.
- Do not create production children while #61 is open; the approved design and
  plan stay committed and reviewed locally until the post-#61 refresh is
  complete.
- No implementation session starts from the pre-#61 baseline.
- Normal merge resolution clears #61; do not erase history by silently editing
  the body.
- F0 is blocked by every mandatory atomic/group completion and V0.
- A0 is absent from F0's blocker set.
- S0 proves protocols for ordinary/current exotica after M0. M2 owns
  Proxy-specific protocol interactions.
- Downstream integration failures reclassify to their later semantic owner
  rather than inflating an earlier issue.

### Milestones

Every mandatory issue receives the ES2015 milestone. A0 remains a native child
of #70 but receives no ES2015 milestone. This keeps optional Annex B visible as
post-core backlog without holding the ES2015 milestone open after the core
release.

### Required issue body

Every atomic child states:

- parent #70;
- native #61 block when applicable;
- one-PR boundary;
- exact owned paths/query and refreshed roots/variants;
- scope and non-goals;
- semantic and sequencing dependencies;
- portable RED cases;
- focused Test262 roots;
- selection/probe requirements;
- `TZ=UTC` artifact rules;
- Node/Chromium/JSC and exact-SHA gates;
- review requirements; and
- post-merge reclassification.

Grouping issues state that they own no production commit and define how nested
atomic children close them.

## Validation and review

### Deterministic audit gates

The audit and check commands fail unless:

- the checkout repository/revision/HEAD match;
- source and anchor hashes match;
- schema/generator versions match;
- the edition feature map and include closure are known;
- exact path rules and selections resolve to existing roots;
- every root has one class;
- no root appears twice;
- whole-tree root and variant partitions balance;
- output is code-unit sorted and timestamp-free; and
- two runs produce byte-identical output.

Unknown feature tags/includes/path rules, malformed non-classified metadata,
pin drift, missing roots, and count imbalance are errors. There is no silent
fallback.

### RED-first implementation

Every atomic semantic child starts with:

1. a failing portable unit or integration case;
2. exact focused pinned Test262 roots under `TZ=UTC`; and
3. a failure that demonstrates the named semantic gap rather than an
   unsupported neighboring feature.

Implementation then runs the smallest targeted existing suites. Local Test262
remains targeted by default. Broad pinned coverage comes from exact-SHA CI
unless a specific investigation genuinely needs a local broad run.

### Portable gates

Affected work runs:

- Node portable suites;
- Chromium portable suites;
- JavaScriptCore portable suites using
  `/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc`;
- focused pinned Test262 under `TZ=UTC`;
- selection/probe/audit drift checks;
- typecheck, lint, formatting, and repository invariants; and
- relevant benchmark, stress, and adversarial guards.

Host-assisted RegExp, byte codecs, weak storage, cross-Realm bridges, and PTC
carry versioned capability or stress suites. Capability failure aborts setup;
there are no per-host semantic forks.

### Error and Realm discipline

Invalid guest operations materialize the specified guest error in the owning or
current Realm and preserve coercion and abrupt-completion order. Host
allocation, compiler, or capability failures never become passing guest
results. Implementations may not add broad catches, direct slot bypasses,
class-name semantic inference, or swallowed IteratorClose, Proxy, or backend
errors.

Cross-Realm and custom-AST paths receive the same validation and error phase as
source parsing.

### Security gates

Any unresolved exploitable or high-confidence security finding blocks merge.
"Documented" does not dispose of a vulnerability.

Only an inherent, explicitly approved host-boundary limitation may remain, with
scope, tests, and rationale. The approved example is host RegExp backtracking
exposure after all observable ES2015 semantics are proven.

Foundational and final PRs, including F0, require reviewed-head CI plus
post-merge exact-main-SHA CodeQL evidence:

- zero actionable JavaScript alerts;
- zero extraction or parse diagnostics in analyzed repository source;
- SARIF and logs inspected, not merely a green job; and
- intentional invalid fixtures remain non-extractable while runner tests prove
  they still execute as guest source.

### Review gates

Every atomic child receives task-scoped specification and quality review before
merge. MOP, RegExp, binary, collections, PTC, and final integration additionally
receive maximum-capability correctness review.

After each merge:

1. regenerate the UTC classifier;
2. record moved paths and their next blockers;
3. update native dependencies;
4. update V0 rows in the owning semantic PR; and
5. publish exact merge SHA, reviewed head, and CI evidence in the issue.

### CI waiting protocol

For an exact reviewed head:

1. resolve the workflow run whose head SHA equals that reviewed head;
2. continue useful local review/audit work before waiting;
3. synchronously watch the exact run;
4. if the command continues, use 10-minute blocking reads on the same shell
   session in the same turn;
5. re-read the PR head SHA after completion; and
6. verify every expected check reached a successful terminal state.

A successful job name without head verification and terminal check inspection
is not exact-head evidence.

## Living normative clause matrix

V0 maps every mandatory Sixth Edition main-body clause, algorithm, and
intrinsic to one of:

- implementation location;
- focused portable tests;
- exact Test262 evidence; or
- a reviewed implementation-defined or permitted choice.

A permitted choice is valid only when the Sixth Edition permits it and the
corresponding Test262 evidence is inapplicable or passes the permitted branch.
It is not a generic exclusion escape hatch.

V0 starts after T0/T1, remains open while layers execute, and closes only after
all mandatory layers and deviations complete and the final audit is clean.
Test262 taxonomy alone cannot establish standard compliance.

## Post-#61 refresh and issue creation

Before #61, keep the approved design and plan committed and reviewed locally on
the isolated roadmap branch. The single definitive roadmap PR, its merge to
`main`, and all #70/child mutation wait for verified #61 plus the refreshed
evidence below:

1. record the exact #61 merge SHA;
2. update the audit branch from current main without production changes;
3. verify the pinned Test262 repository/revision/HEAD;
4. regenerate inventory, exact execution evidence, classification, blocker
   attribution, percentages, and path identities under `TZ=UTC`;
5. reconcile every table and V0 skeleton input;
6. update proposed issue bodies with refreshed numbers only;
7. update #70's title/body to the qualified core claim;
8. create mandatory milestone children and non-milestoned A0;
9. attach native sub-issue and blocked-by relationships; and
10. replace design codes with actual issue numbers without changing the
    approved graph.

Issue #71 closes only after the refresh and hierarchy creation.

## Core release acceptance

F0 and #70 require:

- every root and variant in the refreshed core denominator selected and
  passing;
- zero mandatory blocker records;
- both mandatory deviation paths passing;
- zero unknown roots relevant to ECMA-262, or reviewed proof that every
  remaining unknown lacks affirmative ES2015 evidence;
- every mandatory V0 row resolved;
- deterministic UTC artifacts and drift checks;
- full Node, Chromium, JSC, and pinned Test262 gates;
- reviewed-head CI plus post-merge exact-main-SHA CodeQL evidence;
- no unresolved high-confidence correctness or exploitable security finding;
  and
- documentation with balanced core, Annex B, later, unknown, harness, and
  malformed tables.

Lifecycle order is:

1. close every milestone-bearing mandatory child with exact merge/validation
   evidence;
2. close V0 after the final audit;
3. close F0;
4. close #70;
5. freshly verify GitHub issue and milestone state; and
6. close the ES2015 milestone.

A0 may remain open outside the milestone while optional Annex B work continues.

## Documentation consequences

The implementation roadmap must update:

- `docs/conformance.md` with qualified core and separate Annex B evidence;
- `docs/limitations.md` when the two mandatory deviations are fixed;
- `docs/testing.md` with the ES2015 audit/check and targeted-run workflow;
- `docs/architecture.md` as MOP, storage, collection, RegExp, and PTC boundaries
  land; and
- #70/#71 and every child with exact path/count/SHA evidence.

No documentation may claim a broad feature from a narrow tag bypass or omit
unknown, harness, malformed, or Annex B evidence to improve coverage.
