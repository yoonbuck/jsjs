# Conformance

This document covers conformance testing methodology, the ES5.1 surface this
engine implements, and the live coverage numbers produced by the Test262 suite.

## Supported subset

This engine implements the ES5.1 language and standard library **plus ES2015
lexical declarations**: `let` and `const` bindings, block scope, the temporal
dead zone (a `ReferenceError` on access before initialization), `const`
assignment errors, per-iteration `for`/`for-in` loop bindings, and lexical
scope for blocks, `switch` case blocks, `try` parts, function bodies, `eval`
code, and the global environment. Nothing else from ES2015 is implemented: the
parser accepts the ES2015 lexical-declaration syntax and rejects every other
ES2015 construct — classes, arrow functions, template literals, `for`-`of`,
generators, `async`/`await`, destructuring and default/rest patterns, spread,
`super`, `new.target`, modules, computed/shorthand/method object properties,
binary and octal numeric literals, and `\u{…}` code-point escapes — as a guest
`SyntaxError`, so the grammar the engine parses is exactly the grammar it runs.

Fixtures deliberately stay inside what the engine implements today: `var`,
`let`, `const`, function declarations and expressions, object and array literals
(including getter/setter syntax), member access and calls, `new`, arithmetic,
comparison, logical and conditional operators, simple `=` assignment, all
compound assignment operators (`+= -= *= /= %= <<= >>= >>>= &= ^= |=`), prefix and
postfix `++`/`--`, bitwise operators (`& | ^ ~ << >> >>>`), the unary operators
`typeof`, `void`, `!`, `+` and `-`, `in`, `instanceof`, `delete`,
`if`/`while`/`do`/`for`/`for-in`/`return`/`throw`, `try`/`catch`/`finally`,
`switch`, `with`, `debugger`, block statements, labelled statements with
`break`/`continue`, and the `NaN`, `Infinity`, `undefined` globals.

`for-in` enumerates own-then-inherited enumerable string-keyed properties in
insertion order, each name at most once and never a name shadowed earlier in
the prototype chain. The order is fixed when the loop starts, but membership is
not: a property deleted before enumeration reaches it is skipped, while
properties added during the loop are not visited — the two halves of ECMA-262
12.6.4's paragraph on mutation during enumeration. The re-check that skips a
deleted name repeats the same shadowing walk the enumeration order was built
with, so a name also drops out when it is made non-enumerable mid-loop, or when
deleting its own copy exposes a non-enumerable inherited one. Those last two
cases are outside what 12.6.4 decides and real engines disagree about them
(JavaScriptCore behaves as this engine does; V8 keeps such a name).

The implemented ES5 core built-in families are:

| Family     | Supported APIs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Object`   | Call/construct coercion; `Object.prototype.constructor`, `toString`, `toLocaleString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`; descriptor queries and definitions; `getPrototypeOf`, `create`, `getOwnPropertyNames`, `keys`; extensibility, sealing, and freezing APIs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `Function` | Callable `Function.prototype`; `toString`, `apply`, `call`, `bind`; bound calls, construction, `instanceof`, and adjusted `length`. The dynamic `Function` constructor parses its arguments as a parameter list and function body, returning a new function that is strict only when its body opens with a `"use strict"` directive and that closes over the realm's global scope rather than the caller's.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Array`    | Call/construct overloads, sparse length construction, `Array.isArray`; `push`, `pop`, `shift`, `unshift`, `reverse`, `sort`, `splice`; `concat`, `join`, `slice`, `indexOf`, `lastIndexOf`; `every`, `some`, `forEach`, `map`, `filter`, `reduce`, `reduceRight`. Methods are generic where ES5 requires and preserve sparse holes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Boolean`  | Call converts with `ToBoolean`, construct boxes; `Boolean.prototype` is itself a `false` wrapper; `constructor`, `toString`, `valueOf`. Both methods accept a boolean primitive or a `Boolean` wrapper and throw `TypeError` for anything else.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Date`     | ES5 call/construct overloads; `Date.parse`, `Date.UTC`, `Date.now`; core ES5 local/UTC accessors and mutators; Annex B `getYear`, `setYear`, and `toGMTString`; `toString`, date/time, locale, UTC/GMT, ISO, `valueOf`, and `toJSON`. Clock and timezone access are confined to one of the engine's injectable host boundaries, a realm Date adapter. Left unset, it defaults to the host clock and host zone; other nondeterministic or machine-dependent outputs are `Math.random` and the permitted approximation variation in Math's transcendental functions (see [docs/limitations.md](limitations.md#the-clock-and-the-local-time-zone-come-from-the-host)). Date string parsing implements ES5.1 §15.9.1.15 directly and never calls the host’s `Date.parse`. Locale methods deliberately match their non-locale counterparts. |
| `Number`   | Call converts with `ToNumber`, construct boxes; the five ES5 constants; `constructor`, `toString`, `toLocaleString`, `valueOf`, `toFixed`, `toExponential`, `toPrecision`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `String`   | Call converts with `ToString`, construct boxes with lazy index properties and a non-writable `length`; `fromCharCode`; all ES5 prototype methods, including `match`/`replace`/`search`/`split` dispatching through real `RegExp` values.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `RegExp`   | The ES5 15.10.1 `Pattern` grammar, validated strictly with no Annex B extensions; call coerces or copies a pattern, construct always allocates; the ES5 15.10.7 own properties `source`/`global`/`ignoreCase`/`multiline`/`lastIndex`; `exec`, `test`, `toString`; regular expression literals. `RegExp.prototype` is itself a RegExp object with source `(?:)` and all flags `false`, per ES5 15.10.6, not the ES2015 ordinary-object rule.                                                                                                                                                                                                                                                                                                                                                                                           |
| `Math`     | The eight constants (`E`, `LN10`, `LN2`, `LOG10E`, `LOG2E`, `PI`, `SQRT1_2`, `SQRT2`) and all eighteen ES5 functions: `abs`, `acos`, `asin`, `atan`, `atan2`, `ceil`, `cos`, `exp`, `floor`, `log`, `max`, `min`, `pow`, `random`, `round`, `sin`, `sqrt`, `tan`. `Math` is an ordinary object with `[[Class]]` `"Math"` and no `[[Call]]`/`[[Construct]]`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Symbol`   | The one implemented family from a later edition (ES2015 §19.4). Call creates a unique symbol from a `ToString`-coerced description; `new Symbol()` throws. `Symbol.for`/`Symbol.keyFor` over the global symbol registry; `Symbol.prototype`'s `constructor`, `toString`, `valueOf`, `@@toPrimitive`, and `@@toStringTag`. All eleven ES2015 well-known symbols are defined. The well-known symbols and the registry are shared by every realm on one **agent**, as ECMA-262 §6.1.5.1 and §19.4.2.1 require, while `Symbol` and `Symbol.prototype` are per-realm like every other intrinsic. `createRealm({ agent })` opts realms into sharing; a realm given no agent gets its own, so a guest-interned `Symbol.for` key never outlives the realm that interned it. See [Symbols and property keys](#symbols-and-property-keys) below. |
| `JSON`     | `JSON.parse` with the full JSON grammar and reviver traversal, and `JSON.stringify` with replacer functions, replacer property lists, `toJSON`, numeric and string `space` gaps, and cycle detection. Neither delegates to the host `JSON`. `JSON` is an ordinary object with `[[Class]]` `"JSON"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Globals    | `eval`, `parseInt`, `parseFloat`, `isNaN`, `isFinite`; the URI functions `encodeURI`, `encodeURIComponent`, `decodeURI`, `decodeURIComponent`; and Annex B's `escape`/`unescape`. The URI functions throw a realm-local `URIError`. A **direct** `eval` call runs in the caller's variable and lexical environment and inherits its strictness, so it reads the caller's locals and its `var` declarations land in the caller's scope; strict eval code gets its own variable environment instead, so those declarations do not leak. Any other reference to `eval` is an **indirect** call and runs in the realm's global scope regardless of where it was called from. A malformed program raises the realm's own `SyntaxError`, never the host's.                                                                                   |

The error constructors (`Error`, `EvalError`, `TypeError`, `ReferenceError`,
`SyntaxError`, `RangeError`, `URIError`) are all available on every realm's
global object.

### Symbols and property keys

`Symbol` is the one place this engine implements a later edition on purpose,
because ES2015's runtime protocols are keyed by symbols and nothing else can be
built without them. Its reach into the rest of the engine is deliberately
narrow.

A property key is now a String **or** a Symbol, and the two never meet: a
symbol key is carried by identity through `ToPropertyKey`, so `obj[sym]` and
`obj["Symbol(desc)"]` name different properties no matter what the description
is. Computed member access, the `in` operator, `delete`, `Object.defineProperty`,
`Object.getOwnPropertyDescriptor`, `hasOwnProperty`, and `propertyIsEnumerable`
all accept either kind.

Every ES5 enumeration stays string-only, so no existing behaviour moves:
`for-in`, `Object.keys`, and `Object.getOwnPropertyNames` skip symbol keys, and
`JSON.stringify` never sees one (a symbol _value_ serializes as `undefined`,
and a replacer is never called with a symbol key). `Object.getOwnPropertySymbols`
is the sole way to reach them, and it reports them in the same own-key order.

Symbols resist implicit coercion exactly as ES2015 asks. `ToNumber` and
`ToString` of a symbol are `TypeError`s, so `sym + ''`, `+sym`, and `sym < sym`
all throw; `ToBoolean` is `true`; `ToObject` boxes against `%SymbolPrototype%`.
`String(sym)` is the single explicit rendering and returns `SymbolDescriptiveString`,
while `new String(sym)` still throws. `typeof` answers `"symbol"`.

Two well-known symbols are wired into real protocols, because `Symbol` itself
needs them: `@@toPrimitive` is consulted by `ToPrimitive` ahead of
`valueOf`/`toString`, and `Object.prototype.toString` prefers a **string**
`@@toStringTag` over the ES5.1 `[[Class]]` tag. No ES5 object carries either
property, so every ES5 tag and conversion is unchanged. The other nine
well-known symbols are defined values whose protocols are not yet honoured —
see [docs/limitations.md](limitations.md#well-known-symbols-are-defined-but-only-toprimitive-and-tostringtag-are-honoured).

## How the ES5 selection is derived

`tools/test262/es5-selection.json` is the policy that decides which upstream
tests are in scope; `tools/test262/es5-selection.js` implements it as pure,
host-free code so the decisions can be tested without a checkout, and
`npm run test262:select` applies it to the pinned tree and writes
`upstream-subset.json`. The policy is data, not prose:
`npm run test262:select:check` re-derives the manifest without writing and fails if the
committed one has drifted, so the selection can never quietly diverge from the
rules that justify it.

A file is a candidate only if it survives every filter:

- **Path policy.** `test/intl402` is excluded wholesale — it is a different
  specification. Under `test/language`, six directories name syntax ES5.1 does
  not have at all (`computed-property-names`, `destructuring`, `export`,
  `import`, `module-code`, `rest-parameters`). `test/staging` is not excluded
  wholesale: it is upstream's non-normative scratch area, largely runnable
  ES5.1-era regression tests inherited from SpiderMonkey, so it is a normal
  candidate directory and anything in it that must not run is carved out by
  the classified exclusions below like any other file. Under `test/built-ins`, an
  allow-list of 27 constructors and namespace objects names the ES5.1 standard
  library plus `Symbol`, so a post-ES5 global like `Proxy` is out of scope by
  construction rather than by 500 individual entries.
- **Metadata.** Anything flagged `module` is out. A test that declares a
  `features:` tag is out too, unless a **feature area** claims it: an entry in
  the policy's `featureAreas` naming a directory prefix and the exact tags the
  engine implements there. A tagged test is a candidate only when an area
  covers its path _and_ claims every tag the test declares, so claiming
  `Symbol` earns coverage under `test/built-ins/Symbol` without dragging in
  the thousands of `Symbol`-tagged tests elsewhere in the tree, and a test
  under that prefix that also needs `cross-realm` or `Symbol.matchAll` stays
  out. Every claimed tag also carries an executable probe in the
  [Feature manifest](#feature-manifest), so a claim the engine cannot back is
  a failing test rather than a comment.

  The only claims today are the twelve ES2015 Symbol tags — `Symbol` and the
  eleven well-known symbol tags — scoped to `test/built-ins/Symbol` and
  `test/built-ins/Object/getOwnPropertySymbols`.

- **An `ecmaVersion: 5` parse filter.** Every remaining file — and every harness
  file it `includes` — is parsed at ES5 with the vendored acorn. A file that
  will not parse as ES5 is testing syntax this engine is not required to accept,
  so it is excluded structurally rather than by name. This is what keeps the
  policy honest as the pin moves: new upstream tests written in modern syntax
  drop out automatically instead of appearing as failures.
- **Classified exclusions.** What survives all of the above but still must not
  run is carved out one path (or prefix) at a time, each with a category and a
  written reason.

That selects roughly a fifth of the upstream suite, and every selected record
passes. The exact counts are not repeated here on purpose: they are live numbers,
so they live in the generated [Coverage](#coverage) block where
`npm run test262:upstream:check` keeps them honest, and nowhere else.

The large excluded remainder is not a list of things this engine gets wrong. The
upstream suite tracks the _current_ specification, and most of it tests language
and library features introduced after ES5.1, or ES5.1 behaviour that later
editions deliberately changed. The 612 classified exclusions break down as:

| Category             | Count | What it means                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `post-es5-semantics` | 347   | ES5.1 and a later edition genuinely disagree, and this engine implements ES5.1. Every entry cites the clause that makes it right.                                                                                                                                                                                                                                                                 |
| `post-es5-builtin`   | 188   | A built-in or member ES5.1 does not define at all, carved out by prefix where the per-constructor allow-list cannot drop a single member.                                                                                                                                                                                                                                                         |
| `post-es5-syntax`    | 47    | Syntax outside ES5.1 that the structural parse filter does not catch on its own.                                                                                                                                                                                                                                                                                                                  |
| `host-dependent`     | 28    | The result depends on the host environment (locale, timezone database, wall clock), so the test cannot have a fixed expectation here.                                                                                                                                                                                                                                                             |
| `engine-deviation`   | 2     | This engine knowingly differs from what ES5.1 asks. Each entry names a heading in [docs/limitations.md](limitations.md) that documents the choice — a deviation that is not written down is indistinguishable from a bug. Both remaining entries are the same cause: the vendored parser lexes `IdentifierName` with the modern `ID_Continue` property instead of ES5.1 7.6's general categories. |

The distinction that matters is between the first four categories and the last.
The first four say _the test is not about ES5.1_; only `engine-deviation` says
_this engine does not do what ES5.1 asks_, and every one of them is documented
in [docs/limitations.md](limitations.md). Only two exclusions claim that, and
they share one cause. Deviations that are real but that no excluded test
measures — such as the `\$` identity-escape carve-out, which makes tests pass
rather than fail — are catalogued in
[docs/limitations.md](limitations.md) regardless. Two categories — `post-es5-syntax` and
`post-es5-builtin` — come from structural filters and coarse prefixes, so they
carry a reason but not a clause; the other three require a reason that names
the ES5.1 clause or the [docs/limitations.md](limitations.md) heading that
makes this engine's behaviour correct — this is enforced by human review, not
by machine. Only the `engine-deviation` category is machine-checked:
`test/node/repository-invariants.test.js` verifies that each
`engine-deviation` reason references an anchor that exists in
`docs/limitations.md`.

## Feature manifest

`tools/test262/features.json` is the checked-in supported-feature manifest, and
each entry is a record rather than a bare name:

```json
{
  "version": 1,
  "features": [
    {
      "name": "SomeFeature",
      "probe": "/* engine source that only completes if the feature works */",
      "tests": ["test/path/to/an/upstream/test.js"]
    }
  ]
}
```

`tools/test262/features.js` parses and validates it, and — more importantly —
`runFeatureProbe` _executes_ each entry's `probe` against a real engine in a
fresh realm. A probe is not a placeholder: it must complete normally on an
engine that implements the feature and must throw, or fail to parse, on one that
does not, and `featureProbeTestSource` renders it as a `raw` Test262 file tagged
with the feature so the same skip decision a real tagged test would earn is
exercised end to end. `tests` names upstream tests that really carry the tag;
`npm run ci:contract` reads each one out of the pinned checkout, asserts the tag
is really there, and asserts the test really passes once the feature is allowed.
A feature therefore cannot be claimed by editing a list.

The manifest currently claims the twelve ES2015 Symbol tags: `Symbol` and the
eleven well-known symbol tags (`Symbol.hasInstance`,
`Symbol.isConcatSpreadable`, `Symbol.iterator`, `Symbol.match`,
`Symbol.replace`, `Symbol.search`, `Symbol.species`, `Symbol.split`,
`Symbol.toPrimitive`, `Symbol.toStringTag`, `Symbol.unscopables`). Everything
else the engine does is ES5.1, so every other tag is unclaimed and a test that
declares one is skipped rather than run.

The manifest and the selection policy's feature areas are deliberately two
different gates. The manifest decides which tags may _run_; a feature area
decides where a tagged test is _selected_ from. A tag has to clear both, which
is what keeps `Symbol` from admitting the thousands of `Symbol`-tagged tests
that live outside `test/built-ins/Symbol` and would fail on features this
engine has not implemented.

The schema, the probe execution, and the upstream correspondence check are all
exercised beyond the real entries, by a synthetic feature in
`test/node/workflow-contract.test.js` and a known feature-tagged upstream test in
`test/ci/full-contract.test.js`, so the checks would still be meaningful if the
manifest were emptied.

## Reading the report

Every line is one JSON object. The fixture adapters print those lines on stdout
and nothing else; the upstream run writes them to `docs/test262-report.jsonl`
and prints the compact coverage summary instead. Test records come first, sorted
by file path then variant, followed by the per-group baseline, the feature line,
the coverage records, and one summary record:

```json
{"type":"test","file":"test/positive.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/feature-skip.js","variant":null,"status":"skipped","reason":"unsupported-feature","message":"unsupported features: Proxy, Reflect","features":["Proxy","Reflect"]}
{"type":"summary","total":14,"passed":13,"failed":0,"skipped":1}
```

`variant` is `"non-strict"`, `"strict"`, `"raw"`, or `null` when the file never
reached execution. `status` is `passed`, `failed`, or `skipped`, and `reason`
names the decision:

| Reason                      | Meaning                                                  |
| --------------------------- | -------------------------------------------------------- |
| `metadata-error`            | Frontmatter is missing or malformed                      |
| `load-error`                | The host could not read the test or an include           |
| `harness-error`             | An include threw or failed to parse                      |
| `parse-error`               | The test failed to parse but expected to run             |
| `engine-error`              | The engine itself threw a non-`SyntaxError` host error   |
| `unexpected-throw`          | A positive test threw                                    |
| `expected-error-not-thrown` | A negative test completed normally                       |
| `wrong-error-phase`         | Threw in a different phase than `negative.phase`         |
| `wrong-error-type`          | Threw a value that is not an instance of `negative.type` |
| `unresolved-error-type`     | `negative.type` is not a global binding in this realm    |
| `unsupported-flag`          | Skipped: flag outside the engine's abilities             |
| `excluded-feature`          | Skipped: feature named in `--skip-features`              |
| `unsupported-feature`       | Skipped: feature outside `--features`                    |

Byte-identical output across Node, Chromium, and `jsc` is a checked property, in
two ways. `test/test262-runner.test.js` compares the whole fixture report against
a golden string and asserts that the runtime's own adapter selects the fixture
paths through `selection.js`; that suite runs under `npm run test:node`,
`npm run test:browser`, and `npm run test:jsc`. Separately, the `jsc` and Node
CLI entry points print the same 15-line report, which `cmp` confirms is
byte-identical.

## What the coverage numbers count

A conformance percentage means nothing without its denominator, so the upstream
report states both. An `inventory` record carries the whole-suite totals, and one
`coverage` record per denominator measures the run against them. For example,
with synthetic counts — deliberately chosen not to collide with any number the
real run publishes, so the contract check that keeps live counts inside the
generated coverage block can tell an illustration apart from a published
figure:

```json
{"type":"inventory","files":1000,"records":1800,"malformed":12}
{"type":"coverage","scope":"files","total":1000,"selected":250,"attempted":200,"passed":150,"selectedPercent":25,"attemptedPercent":20,"passedPercent":15}
```

The semantics are exact, and `tools/test262/coverage.js` is where they are
implemented:

- **The tree is the denominator.** Every `test/**/*.js` file in the pinned
  checkout counts — `annexB`, `intl402`, and `staging` included — minus the
  `_FIXTURE.js` files upstream's `INTERPRETING.md` defines as inputs to other
  tests rather than tests themselves. `harness/` and upstream's own `tools/` are
  not tests and never count.
- **Two units.** `scope: "files"` counts source files; `scope: "records"` counts
  the `(file, variant)` pairs those files expand into once the
  `raw`/`onlyStrict`/`noStrict`/`module` rules are applied — two for an ordinary
  file, one for a file pinned to a single variant. Records are the unit the
  runner reports, so a pass rate has to be quoted in them.
- **Expansion never executes.** The inventory reads frontmatter and nothing
  else, so the denominator costs one pass over the tree rather than a
  conformance run of tests this engine cannot yet survive.
- **Three counts, three questions.** `selected` is what
  `upstream-subset.json` asks for, `attempted` is what actually executed (a
  skipped test is selected but never attempted), and `passed` is what
  conformance is claimed for. A file counts as passed only when every one of its
  records passed.
- **Malformed frontmatter is counted, not dropped.** A file this tooling cannot
  parse still counts as a file, but expands into no records, and the count is
  published in the `inventory` record. Dropping those files would shrink the
  denominator and inflate the percentage.
- **A file that cannot be read is an error**, not a zero: a truncated checkout
  must fail loudly rather than report better coverage of a smaller suite.
- **Percentages** are `part / total * 100`, rounded to three decimals so two runs
  of the same inputs serialize identically, and always taken against the
  whole-suite total rather than the selection.

## Coverage

The numbers below are generated: `npm run test262:upstream` runs the pinned
subset against `tc39/test262` at the revision `package.json` names, writes every
per-test record to [`docs/test262-report.jsonl`](test262-report.jsonl), and
rewrites this block from the same run. `npm run test262:upstream:check` fails if
either artifact has drifted, and the `test262-upstream` job fails CI the same way,
so no number here can outlive the run that produced it. The denominators are
defined exactly under
[What the coverage numbers count](#what-the-coverage-numbers-count).

## ES2015 focused coverage

Issue #38 (ES2015 object/function runtime updates) is covered by a small,
hand-picked set of upstream Test262 files, run via `test/ci/es2015-object-function-test262.test.js`
(part of `npm run ci:contract`) rather than folded into the ES5
`upstream-subset.json`/`es5-selection.json` pipeline above, which stays
scoped to the ES5.1 engine and shared with the parallel lexical-declarations
(#41) and Symbols (#43) branches:

- `vendor/test262/test/language/expressions/function/name.js`, `vendor/test262/test/language/statements/function/name.js`,
  `vendor/test262/test/built-ins/Function/prototype/bind/{name,length}.js` — function `name`/`length` semantics
- `vendor/test262/test/built-ins/Object/keys/return-order.js`, `vendor/test262/test/built-ins/Object/getOwnPropertyNames/order-after-define-property.js` —
  ES2015 own-property-key order
- `vendor/test262/test/language/expressions/object/{getter,setter}-prop-desc.js`,
  `vendor/test262/test/language/expressions/object/{getter,setter}-super-prop.js` — method `[[HomeObject]]`/`super`
- `vendor/test262/test/built-ins/Object/setPrototypeOf/{o-not-obj-coercible,property-descriptor,set-failure-cycle,set-failure-non-extensible,success}.js`,
  `vendor/test262/test/built-ins/Object/is/{length,name,not-same-value-x-y-number,not-same-value-x-y-object,object-is,same-value-x-y-number}.js` —
  the two new `Object` statics

Reproduce locally: `node test/run-ci-contract.js` (requires the pinned
upstream checkout at `vendor/test262`; see the Test262 section above).

<!-- test262-coverage:begin -->

| Denominator     | Whole suite | Selected | Attempted | Passed | Passing |
| --------------- | ----------- | -------- | --------- | ------ | ------- |
| Files           | 53,575      | 12,108   | 12,108    | 12,108 | 22.6%   |
| (file, variant) | 102,906     | 23,045   | 23,045    | 23,045 | 22.394% |

4 of the 53,575 files carry frontmatter this tooling cannot parse; they count as files and expand into no (file, variant) records.
Full per-test records: [docs/test262-report.jsonl](test262-report.jsonl).

<!-- test262-coverage:end -->

The detailed report is JSON lines: one `test` record per (file, variant) pair,
then the `baseline` lines that summarize the run per subset group, a `features`
line, the `inventory` and `coverage` records, and the `summary`. The `features`
line is what the run can honestly say about optional features: `supported` is
what the manifest claims (nothing yet), `tagged` is the feature tags actually
seen on the tests that ran (none — the ES5 baseline is intentionally untagged),
and `untagged` counts the records that carried no tag at all. There is no
per-feature progress table because there are no features to report on yet;
inventing one would describe something the run never measured.

The selected subset is small by construction: every path in it was verified to
pass with this engine, so the low whole-suite percentage is an honest statement
of how much of Test262 an engine at this language level — ES5.1 plus ES2015
lexical declarations — has been pointed at, not a pass rate over tests it was
never asked to run.

## Policy artifacts

- Selection policy: [`tools/test262/es5-selection.json`](../tools/test262/es5-selection.json)
- Selection implementation: [`tools/test262/es5-selection.js`](../tools/test262/es5-selection.js)
- Feature manifest: [`tools/test262/features.json`](../tools/test262/features.json)
- Detailed report: [`docs/test262-report.jsonl`](test262-report.jsonl)
- Upstream subset manifest: [`tools/test262/upstream-subset.json`](../tools/test262/upstream-subset.json)
