# Conformance

This document covers conformance testing methodology, the ES5.1 surface this
engine implements, and the live coverage numbers produced by the Test262 suite.

## Supported subset

This engine implements the ES5.1 language and standard library plus ES2015
lexical declarations (`let`/`const`, TDZ, and per-iteration bindings), the
iteration protocol and `for`-`of`, and block-level function declarations. The
limited Annex B statement-position forms remain unsupported (see
[Limitations](limitations.md#annex-b-statement-position-function-declarations-are-limited)).
It also implements issue #25's ES2015 syntax surface: arrow functions; classes,
inheritance, `super`, and computed method names; computed object names;
destructuring declarations, assignments, and parameters; default and rest
parameters; iterable spread in arrays, calls, and construction; and template
literals including tagged-template cooked/raw objects and realm-local
parse-site caching.

The parser's capability gate admits only those forms, so grammar and evaluation
move together. It still rejects generators/yield, async/await, modules,
`new.target`, object rest/spread, later class fields/private names/static
blocks/decorators, binary/octal literals, and `\u{…}` code-point escapes. The
ES2015 RegExp flags `u` and `y` are rejected by ES5.1 flag validation. A
top-level rejection is a host `SyntaxError`; source parsed through `eval` or the
dynamic `Function` constructor receives a catchable guest `SyntaxError`.

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
property, so every ES5 tag and conversion is unchanged. `@@iterator` is honoured
too, driving the ES2015 iteration protocol (yoonbuck/jsjs#47). The other eight
well-known symbols are defined values whose protocols are not yet honoured —
see [docs/limitations.md](limitations.md#well-known-symbols-are-defined-but-only-toprimitive-tostringtag-and-iterator-are-honoured).

## How the ES5 selection is derived

`tools/test262/es5-selection.json` is the policy that decides which upstream
tests are in scope; `tools/test262/es5-selection.js` implements it as pure,
host-free code so the decisions can be tested without a checkout, and
`TZ=UTC npm run test262:select` applies it to the pinned tree and writes
`upstream-subset.json`. The policy is data, not prose:
`TZ=UTC npm run test262:select:check` re-derives the manifest without writing
and fails if the committed one has drifted, so the selection can never quietly
diverge from the rules that justify it.

A file is a candidate only if it survives every filter:

- **Path policy.** `test/intl402` is excluded wholesale — it is a different
  specification. Under `test/language`, only `export`, `import`, and
  `module-code` remain directory exclusions. The former broad
  `computed-property-names`, `destructuring`, and `rest-parameters` exclusions
  are gone; their supported forms flow through narrow feature-area prefixes.
  `test/staging` remains a normal candidate directory with individual
  classifications. Under `test/built-ins`, an allow-list names the ES5.1
  library plus Symbol and iterator prototypes, keeping a global such as `Proxy`
  out of scope by construction. This path-only gate, including exact
  classifications, runs before the selector reads a test source.
- **Known-good baseline and metadata.** The exact paths in
  `tools/test262/known-good-subset.json` are retained after the path, module,
  grammar, and exclusion guards. A path outside that baseline must declare a
  `features:` tag that includes at least one policy `expansionFeatures` entry,
  and a **feature area** must cover its path _and_ claim every tag it declares.
  This permits the narrow issue #25 syntax expansion without making a grammar
  widening a semantic claim: newly parseable untagged tests and unrelated
  tagged tests such as `Symbol.species` stay out. It also keeps a candidate
  that additionally needs `cross-realm` or `Symbol.matchAll` out. Every claimed
  tag carries an executable probe in the [Feature manifest](#feature-manifest),
  so a claim the engine cannot back is a failing test rather than a comment.

  In addition to the Symbol and lexical/iteration tags, the manifest claims the
  exact syntax tags `arrow-function`, `class`, `computed-property-names`,
  `default-parameters`, `destructuring-assignment`,
  `destructuring-binding`, `rest-parameters`, `spread-syntax`, and `template`.
  Feature areas scope tagged selection to the relevant syntax directories; the
  broad `test/language` claim remains limited to the earlier lexical and
  iteration tags. The pin has no standalone `spread-syntax` tag and its only
  `template` tag also needs unsupported `new.target`, so their semantic backing
  tests are documented exact metadata exceptions rather than claims for those
  neighboring features.

- **Engine grammar filter.** Every remaining file and harness include is parsed
  with the engine's own `parseScript`. A file that fails the parser's supported
  shape gate is excluded structurally rather than by name. Grammar acceptance
  alone never expands the subset: only a retained known-good path or a declared,
  exact feature-area expansion can do that. The path policy, module flag, and
  classified exclusions continue to prevent unsupported neighbors from becoming
  claims.
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
editions deliberately changed. The 652 classified exclusions break down as:

| Category             | Count | What it means                                                                                |
| -------------------- | ----- | -------------------------------------------------------------------------------------------- |
| `post-es5-semantics` | 333   | ES5.1 and a later edition genuinely disagree, and this engine implements ES5.1.              |
| `post-es5-builtin`   | 259   | A built-in or member ES5.1 does not define.                                                  |
| `post-es5-syntax`    | 25    | Syntax outside the supported grammar that the structural parse filter cannot identify alone. |
| `host-dependent`     | 33    | The result depends on a host facility or environment.                                        |
| `engine-deviation`   | 2     | This engine knowingly differs from ES5.1; each entry names a limitation heading.             |

The distinction that matters is between the first four categories and the last.
The first four say _the test is not about ES5.1_; only `engine-deviation` says
_this engine does not do what ES5.1 asks_, and every one of them is documented
in [docs/limitations.md](limitations.md). Deviations that are real but that no excluded test
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
exercised end to end. `tests` normally names upstream tests that carry the tag;
the full contract permits only two exact pinned metadata exceptions:
`spread-syntax` is backed by a `Symbol.iterator` spread test because the pin has
no spread tag, and `template` is backed by an untagged cache test because the
only template-tagged file also requires `new.target`. Every backing test still
runs successfully, so neither exception claims its missing neighboring feature.

The manifest claims `const`, `for-of`, `let`, Symbol and its well-known tags,
plus `arrow-function`, `class`, `computed-property-names`,
`default-parameters`, `destructuring-assignment`, `destructuring-binding`,
`rest-parameters`, `spread-syntax`, and `template`. Every other tag is
unclaimed and a test that declares one is skipped rather than run.

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

The numbers below are generated: `TZ=UTC npm run test262:upstream` runs the pinned
subset against `tc39/test262` at the revision `package.json` names, writes every
per-test record to [`docs/test262-report.jsonl`](test262-report.jsonl), and
rewrites this block from the same run. `TZ=UTC npm run test262:upstream:check`
fails if either artifact has drifted, and the `test262-upstream` job fails CI the same way,
so no number here can outlive the run that produced it. The run refuses to start
outside a UTC time zone, because a few selected tests read the host's local
offset (see
[the offsetless-date deviation](limitations.md#the-clock-and-the-local-time-zone-come-from-the-host)),
so the committed artifacts are a pure function of the engine and the pinned tree,
not of the machine that generated them; CI pins `TZ=UTC` for the same reason.
Regenerate with `TZ=UTC npm run test262:upstream`. The denominators are
defined exactly under
[What the coverage numbers count](#what-the-coverage-numbers-count).

## ES2015 focused coverage

Issue #38 (ES2015 object/function runtime updates) is covered by a small,
hand-picked set of upstream Test262 files, run via
`test/ci/es2015-object-function-test262.test.js` (part of
`npm run ci:contract`). Tests that satisfy the broad selection also run there;
the focused suite deliberately retains the Object statics and property-order
cases whose metadata or post-ES5 built-in paths keep them outside that baseline,
so none of the issue's upstream coverage is silently lost:

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

Issue #25 syntax coverage is similarly focused in
`test/ci/es2015-syntax-test262.test.js`. Its pinned list exercises arrow lexical
`this` and non-construction; class inheritance, computed instance/static names,
including computed ordinary `['constructor']` methods and computed static
`['prototype']` TypeErrors, and derived `super`; computed-key ordering;
default-parameter TDZ/order;
destructuring binding/assignment ordering and iterator abrupt completion;
realm-owned rest arrays; iterable spread call order; and tagged-template
cooked/raw identity and caching. It also classifies, rather than claims, public
static class fields and tagged-template invalid escapes that depend on the
remaining unsupported class-field and Unicode/legacy-escape forms.

<!-- test262-coverage:begin -->

| Denominator     | Whole suite | Selected | Attempted | Passed | Passing |
| --------------- | ----------- | -------- | --------- | ------ | ------- |
| Files           | 53,575      | 14,096   | 14,096    | 14,096 | 26.311% |
| (file, variant) | 102,908     | 26,836   | 26,836    | 26,836 | 26.078% |

3 of the 53,575 files carry frontmatter this tooling cannot parse; they count as files and expand into no (file, variant) records.
Full per-test records: [docs/test262-report.jsonl](test262-report.jsonl).

<!-- test262-coverage:end -->

The detailed report is JSON lines: one `test` record per (file, variant) pair,
then the `baseline` lines that summarize the run per subset group, a `features`
line, the `inventory` and `coverage` records, and the `summary`. The `features`
line is what the run can honestly say about optional features: `supported` is
what the manifest claims, `tagged` is the subset of those feature tags actually
seen on tests that ran, and `untagged` counts records that carried no tag at all.
The baseline and feature lines provide the measured totals without inventing a
per-feature pass table the runner does not produce.

The selected subset is deterministic and the required UTC upstream job verifies
every selected path with this engine. Its whole-suite percentage is an honest
statement of how much of Test262 an engine at this language level — ES5.1 plus
ES2015 lexical declarations, iteration, the supported syntax forms, and
Symbols — has been pointed at, not a pass rate over tests it was never asked to
run.

## Policy artifacts

- Selection policy: [`tools/test262/es5-selection.json`](../tools/test262/es5-selection.json)
- Selection implementation: [`tools/test262/es5-selection.js`](../tools/test262/es5-selection.js)
- Known-good subset: [`tools/test262/known-good-subset.json`](../tools/test262/known-good-subset.json)
- Feature manifest: [`tools/test262/features.json`](../tools/test262/features.json)
- Detailed report: [`docs/test262-report.jsonl`](test262-report.jsonl)
- Upstream subset manifest: [`tools/test262/upstream-subset.json`](../tools/test262/upstream-subset.json)
