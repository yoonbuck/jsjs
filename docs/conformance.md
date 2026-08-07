# Conformance

This document covers conformance testing methodology, the ES5.1 surface this
engine implements, and the live coverage numbers produced by the Test262 suite.

## Supported subset

Fixtures deliberately stay inside what the engine implements today: `var`,
function declarations and expressions, object and array literals (including
getter/setter syntax), member access and calls, `new`, arithmetic, comparison,
logical and conditional operators, simple `=` assignment, all compound
assignment operators (`+= -= *= /= %= <<= >>= >>>= &= ^= |=`), prefix and
postfix `++`/`--`, bitwise operators (`& | ^ ~ << >> >>>`), the unary operators
`typeof`, `void`, `!`, `+` and `-`, `in`, `instanceof`, `delete`,
`if`/`while`/`do`/`for`/`for-in`/`return`/`throw`, `try`/`catch`/`finally`,
`switch`, `with`, `debugger`, labelled statements with `break`/`continue`, and
the `NaN`, `Infinity`, `undefined` globals.

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

| Family     | Supported APIs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Object`   | Call/construct coercion; `Object.prototype.constructor`, `toString`, `toLocaleString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`; descriptor queries and definitions; `getPrototypeOf`, `create`, `getOwnPropertyNames`, `keys`; extensibility, sealing, and freezing APIs                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Function` | Callable `Function.prototype`; `toString`, `apply`, `call`, `bind`; bound calls, construction, `instanceof`, and adjusted `length`. The dynamic `Function` constructor parses its arguments as a parameter list and function body, returning a new function that is strict only when its body opens with a `"use strict"` directive and that closes over the realm's global scope rather than the caller's.                                                                                                                                                                                                                                                                                                                                          |
| `Array`    | Call/construct overloads, sparse length construction, `Array.isArray`; `push`, `pop`, `shift`, `unshift`, `reverse`, `sort`, `splice`; `concat`, `join`, `slice`, `indexOf`, `lastIndexOf`; `every`, `some`, `forEach`, `map`, `filter`, `reduce`, `reduceRight`. Methods are generic where ES5 requires and preserve sparse holes.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `Boolean`  | Call converts with `ToBoolean`, construct boxes; `Boolean.prototype` is itself a `false` wrapper; `constructor`, `toString`, `valueOf`. Both methods accept a boolean primitive or a `Boolean` wrapper and throw `TypeError` for anything else.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `Date`     | ES5 call/construct overloads; `Date.parse`, `Date.UTC`, `Date.now`; core ES5 local/UTC accessors and mutators; Annex B `getYear`, `setYear`, and `toGMTString`; `toString`, date/time, locale, UTC/GMT, ISO, `valueOf`, and `toJSON`. Clock and timezone access use deterministic realm host adapters; locale methods deliberately match their non-locale counterparts.                                                                                                                                                                                                                                                                                                                                                                              |
| `Number`   | Call converts with `ToNumber`, construct boxes; the five ES5 constants; `constructor`, `toString`, `toLocaleString`, `valueOf`, `toFixed`, `toExponential`, `toPrecision`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `String`   | Call converts with `ToString`, construct boxes with lazy index properties and a non-writable `length`; `fromCharCode`; all ES5 prototype methods, including `match`/`replace`/`search`/`split` dispatching through real `RegExp` values.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `RegExp`   | The ES5 15.10.1 `Pattern` grammar, validated strictly with no Annex B extensions; call coerces or copies a pattern, construct always allocates; the ES5 15.10.7 own properties `source`/`global`/`ignoreCase`/`multiline`/`lastIndex`; `exec`, `test`, `toString`; regular expression literals. `RegExp.prototype` is itself a RegExp object with source `(?:)` and all flags `false`, per ES5 15.10.6, not the ES2015 ordinary-object rule.                                                                                                                                                                                                                                                                                                         |
| `Math`     | The eight constants (`E`, `LN10`, `LN2`, `LOG10E`, `LOG2E`, `PI`, `SQRT1_2`, `SQRT2`) and all eighteen ES5 functions: `abs`, `acos`, `asin`, `atan`, `atan2`, `ceil`, `cos`, `exp`, `floor`, `log`, `max`, `min`, `pow`, `random`, `round`, `sin`, `sqrt`, `tan`. `Math` is an ordinary object with `[[Class]]` `"Math"` and no `[[Call]]`/`[[Construct]]`.                                                                                                                                                                                                                                                                                                                                                                                          |
| `JSON`     | `JSON.parse` with the full JSON grammar and reviver traversal, and `JSON.stringify` with replacer functions, replacer property lists, `toJSON`, numeric and string `space` gaps, and cycle detection. Neither delegates to the host `JSON`. `JSON` is an ordinary object with `[[Class]]` `"JSON"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Globals    | `eval`, `parseInt`, `parseFloat`, `isNaN`, `isFinite`; the URI functions `encodeURI`, `encodeURIComponent`, `decodeURI`, `decodeURIComponent`; and Annex B's `escape`/`unescape`. The URI functions throw a realm-local `URIError`. A **direct** `eval` call runs in the caller's variable and lexical environment and inherits its strictness, so it reads the caller's locals and its `var` declarations land in the caller's scope; strict eval code gets its own variable environment instead, so those declarations do not leak. Any other reference to `eval` is an **indirect** call and runs in the realm's global scope regardless of where it was called from. A malformed program raises the realm's own `SyntaxError`, never the host's. |

The error constructors (`Error`, `EvalError`, `TypeError`, `ReferenceError`,
`SyntaxError`, `RangeError`, `URIError`) are all available on every realm's
global object.

## How the ES5 selection is derived

`tools/test262/es5-selection.json` is the policy that decides which upstream
tests are in scope; `tools/test262/es5-selection.js` implements it as pure,
host-free code so the decisions can be tested without a checkout, and
`npm run test262:select` applies it to the pinned tree and writes
`upstream-subset.json`. The policy is data, not prose: `npm run
test262:select:check` re-derives the manifest without writing and fails if the
committed one has drifted, so the selection can never quietly diverge from the
rules that justify it.

A file is a candidate only if it survives every filter:

- **Path policy.** `test/intl402` and `test/staging` are excluded wholesale —
  one is a different specification, the other is explicitly not normative.
  Under `test/language`, seven directories name syntax ES5.1 does not have at
  all (`block-scope`, `computed-property-names`, `destructuring`, `export`,
  `import`, `module-code`, `rest-parameters`). Under `test/built-ins`, an
  allow-list of 26 constructors and namespace objects names exactly the ES5.1
  standard library, so a post-ES5 global like `Proxy` or `Symbol` is out of
  scope by construction rather than by 500 individual entries.
- **Metadata.** A test that declares any `features:` tag is out, because this
  engine claims no feature tags (see the [Feature manifest](#feature-manifest) section below), as is anything
  flagged `module`.
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
editions deliberately changed. The 776 classified exclusions break down as:

| Category             | Count | What it means                                                                                                                                                                                        |
| -------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `post-es5-semantics` | 642   | ES5.1 and a later edition genuinely disagree, and this engine implements ES5.1. Every entry cites the clause that makes it right.                                                                    |
| `post-es5-builtin`   | 79    | A built-in or member ES5.1 does not define at all, carved out by prefix where the per-constructor allow-list cannot drop a single member.                                                            |
| `post-es5-syntax`    | 28    | Syntax outside ES5.1 that the structural parse filter does not catch on its own.                                                                                                                     |
| `host-dependent`     | 14    | The result depends on the host environment (locale, timezone database, wall clock), so the test cannot have a fixed expectation here.                                                                |
| `engine-deviation`   | 13    | This engine knowingly differs. Each entry names a heading in [docs/limitations.md](limitations.md) that documents the choice — a deviation that is not written down is indistinguishable from a bug. |

The distinction that matters is between the first four categories and the last.
The first four say _the test is not about ES5.1_; only `engine-deviation` says
_this engine does not do what ES5.1 asks_, and there are 13 such entries, every
one of them documented in [docs/limitations.md](limitations.md). Two categories — `post-es5-syntax` and
`post-es5-builtin` — come from structural filters and coarse prefixes, so they
carry a reason but not a clause; the other three must name the ES5.1 clause or
the [docs/limitations.md](limitations.md) heading that makes this engine's behaviour correct, and the parser
rejects an entry that does not.

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

The manifest currently holds no features. The engine is ES5-only today, so no
Test262 `features` tag is claimed as supported, and any test that declares one is
skipped rather than run. The baseline upstream subset is intentionally untagged —
none of its tests declare a `features` tag — so today's run skips nothing and the
report says exactly that: a `{"type":"features"}` line whose `supported` and
`tagged` lists are both empty and whose `untagged` count is the whole run.
The schema, the probe execution, and the upstream correspondence check are all
exercised regardless, by a synthetic feature in
`test/node/workflow-contract.test.js` and a known feature-tagged upstream test in
`test/ci/full-contract.test.js`, so an empty manifest is never a vacuous check.

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

<!-- test262-coverage:begin -->

| Denominator     | Whole suite | Selected | Attempted | Passed | Passing |
| --------------- | ----------- | -------- | --------- | ------ | ------- |
| Files           | 53,575      | 11,351   | 11,351    | 11,351 | 21.187% |
| (file, variant) | 102,906     | 21,603   | 21,603    | 21,603 | 20.993% |

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
of how much of Test262 an ES5-only engine has been pointed at, not a pass rate
over tests it was never asked to run.

## Policy artifacts

- Selection policy: [`tools/test262/es5-selection.json`](../tools/test262/es5-selection.json)
- Selection implementation: [`tools/test262/es5-selection.js`](../tools/test262/es5-selection.js)
- Feature manifest: [`tools/test262/features.json`](../tools/test262/features.json)
- Detailed report: [`docs/test262-report.jsonl`](test262-report.jsonl)
- Upstream subset manifest: [`tools/test262/upstream-subset.json`](../tools/test262/upstream-subset.json)
