# jsjs

An ECMAScript engine written in javascript.

The engine is plain ES2020 JavaScript with JSDoc types. The same source runs in
Node, in a browser, and in the JavaScriptCore (`jsc`) shell: nothing in `src/`
imports a host module, and guest behaviour never leans on host `eval`,
`Function`, or host objects.

The one runtime dependency, the Acorn parser, is reached through
`src/parser-dependency.js`, the single engine module that names it. It imports
`vendor/acorn/`, a project-owned directory that `tools/vendor/sync.js` fills from
the version pinned in `package.json`. That indirection is what keeps a plain
relative import working in all three hosts: bare specifiers need Node
resolution, browsers would need an import map, and the `jsc` shell supports
neither. `vendor/` is generated rather than committed; `npm install` populates it
through `prepare`.

## Commands

| Command                | What it does                                                   |
| ---------------------- | -------------------------------------------------------------- |
| `npm test`             | The Node suites, then the Test262 fixture suite                |
| `npm run test:node`    | Every portable suite plus the Node-only suites in `test/node/` |
| `npm run test:browser` | Every portable suite in headless Chromium via Playwright       |
| `npm run test:jsc`     | Every portable suite in the `jsc` shell                        |
| `npm run typecheck`    | `tsc` in checkJs mode                                          |
| `npm run format`       | Prettier `--check` over the repository                         |
| `npm run lint`         | ESLint only                                                    |
| `npm run vendor:sync`  | Refresh `vendor/` from pinned dependencies                     |
| `npm run ci:contract`  | Full local CI contract: every command CI runs, for real        |

The full command list, Test262 runner options, suite organization, CI jobs, and
troubleshooting are in [docs/testing.md](docs/testing.md).

## Test262

Upstream revision is pinned in `package.json` under the `test262` key:

- repository: `https://github.com/tc39/test262.git`
- revision: `b363f29d3c43c626dc852744ad64a0b48a003693` (2026-07-31)
- checkout path: `vendor/test262` (generated, gitignored like the rest of
  `vendor/`)

`npm run test262:upstream` runs the pinned subset against that checkout. It is
not a local copy of upstream tests: it reads the real files out of a real
`tc39/test262` tree, and refuses to run at all unless the tree's `HEAD` is
exactly the pinned revision, because a conformance number measured against a
different tree is worse than no number. Reproduce a CI run locally with:

```sh
git clone --filter=blob:none https://github.com/tc39/test262.git vendor/test262
git -C vendor/test262 checkout b363f29d3c43c626dc852744ad64a0b48a003693
npm run test262:upstream
```

The report goes to `docs/test262-report.jsonl`, and a compact coverage summary
goes to stdout; failing records go to stderr next to it, because a red run's log
has to name what broke. CI uploads the report file as an artifact even when the
run fails, which is when the per-test records are worth reading. The same run
regenerates the coverage block in this README, so `npm run test262:upstream` is
the one command that produces every published number, and
`npm run test262:upstream:check` re-derives them without writing and fails if
either file is stale.

`tools/test262/upstream-subset.json` is the checked-in selection: a schema
version, the repository and revision it was curated against, and named groups of
upstream-relative test paths. It is generated rather than hand-written —
`npm run test262:select` derives it from the ES5 selection policy described
below — but it stays checked in, and the paths stay explicit rather than a glob,
because a glob would change meaning every time the pin moves, so a green run
would say nothing about which tests actually ran; every path in it passed on the
run that produced it, so a new failure is a real regression rather than a newly
matched test. `tools/test262/upstream.js` parses it (rejecting an abbreviated
revision, an unsorted or duplicated path, or a path outside `test/`) and
summarizes a finished run per group. The groups carry no execution semantics —
they exist so the coverage report can say which parts of the language the
baseline covers.

The local fixture tree in `test/fixtures/test262` stays separate and is run by
`npm run test262:fixtures`. The two suites answer different questions: the
fixtures exercise the _runner_ (metadata parsing, variants, negative
expectations, skip decisions) against a tiny hand-written tree, and the upstream
subset exercises the _engine_ against real Test262 tests.

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

`tools/test262/` holds the portable half of the runner:

- `metadata.js` parses the Test262 frontmatter subset (`description`, `esid`,
  `es5id`, `info`, `flags`, `includes`, `features`, `negative`) without `eval`,
  expands strict/non-strict/raw variants, and resolves includes.
- `selection.js` decides _which_ tests run: the manifest's name, shape, and
  validation, the precedence between explicit paths, a manifest, and a host
  listing, and the code-unit ordering reports depend on.
- `runner.js` executes a variant in a fresh realm, evaluates includes before the
  test, classifies negative expectations by phase and constructor identity, and
  decides feature and flag skips. `runTest262` ties selection, execution, and
  report formatting together in one shared call.
- `report.js` renders records as deterministic JSON lines.
- `coverage.js` inventories a whole tree — every file's frontmatter expanded
  into the records it would run, without running any of them — and measures a
  finished run against it.

Adapters are thin: they supply file access, and for the two entry points, a CLI
and printing. `adapters/node.js` reads from disk, `adapters/browser.js` fetches
over HTTP, `adapters/jsc.js` uses the shell's `readFile`, and `adapters/paths.js`
resolves module-relative paths without `URL` (which `jsc` lacks). None of them
parse a manifest, expand a selection, or format a record; the manifest exists
only because browsers and `jsc` cannot list directories, and Node reads the same
one so all three hosts select the same tests.

### How the ES5 selection is derived

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
  engine claims no feature tags (see the manifest section above), as is anything
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

| Category             | Count | What it means                                                                                                                                        |
| -------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `post-es5-semantics` | 642   | ES5.1 and a later edition genuinely disagree, and this engine implements ES5.1. Every entry cites the clause that makes it right.                    |
| `post-es5-builtin`   | 79    | A built-in or member ES5.1 does not define at all, carved out by prefix where the per-constructor allow-list cannot drop a single member.            |
| `post-es5-syntax`    | 28    | Syntax outside ES5.1 that the structural parse filter does not catch on its own.                                                                     |
| `host-dependent`     | 14    | The result depends on the host environment (locale, timezone database, wall clock), so the test cannot have a fixed expectation here.                |
| `engine-deviation`   | 13    | This engine knowingly differs. Each entry names the row in "Intentional deviations" that documents the choice — a deviation that is not written down |
|                      |       | is indistinguishable from a bug.                                                                                                                     |

The distinction that matters is between the first four categories and the last.
The first four say _the test is not about ES5.1_; only `engine-deviation` says
_this engine does not do what ES5.1 asks_, and there are 13 such entries, every
one of them documented above. Two categories — `post-es5-syntax` and
`post-es5-builtin` — come from structural filters and coarse prefixes, so they
carry a reason but not a clause; the other three must name the ES5.1 clause or
the README row that makes this engine's behaviour correct, and the parser
rejects an entry that does not.

### Architecture

Source flow, realms and intrinsics, the type system (values, objects,
environments, references, completions), evaluator boundaries, host adapters, and
the embedding API are documented in [docs/architecture.md](docs/architecture.md).

### Supported subset

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

#### Intentional deviations

| Area                                                       | Behaviour and why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Annex B pattern syntax is rejected                         | The engine implements the ES5.1 15.10.1 `Pattern` grammar strictly, with no Annex B extensions, so patterns web engines accept via Annex B (`/]/`, `/{/`, `/\\a/`, octal `/\\01/`, an out-of-range backreference) throw a guest `SyntaxError` instead of matching literally or loosely. Because `match` and `search` build `new RegExp(ToString(pattern))` per ES5, this reaches string patterns too: `"a{b".match("{")` throws where an Annex B engine matches `"{"` literally.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `IdentifierPart` approximation in the validator            | The 15.10.1 validator has no Unicode character database, so `IdentifierPart` (used by `IdentityEscape`) is approximated: every code unit ≥ 0x80 outside a fixed whitespace/line-terminator set is treated as `IdentifierPart`. This means escaped non-ASCII punctuation and symbols (e.g. `\\—` U+2014, `\\¡`) are rejected as invalid identity escapes, where the spec's exact `IdentifierPart` would accept them. The approximation is documented in `regexp-syntax.js`'s module header.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| RegExp literals are validated at evaluation time           | Acorn parses a literal's pattern against the _host's_ grammar, which is Annex B-permissive, so a pattern that Annex B accepts but ES5.1 does not parses successfully. This engine's own validator only runs when the literal is evaluated, so such a pattern throws a guest `SyntaxError` at the point the literal expression executes, not when the program is parsed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Zero-width global match/replace count                      | ES5 15.5.4.10 step 8.f.iii.2 bumps `lastIndex` only when `thisIndex === previousLastIndex`, not when the match is empty. For `/\\b/g` on `"ab"`, this yields 3 matches (and `replace` inserts at 3 positions) where ES2015+ engines yield 2, because ES2015 replaced this with `AdvanceStringIndex`-on-empty-match. The implementation follows the ES5.1 text exactly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Matching runs on the host's RegExp engine                  | `src/runtime/regexp-compat.js` is the sole host boundary for guest-visible regular expression semantics: it compiles an already-validated pattern with the host's own `RegExp`, using the sticky flag so a single attempt at exactly one index reproduces ES5 15.10.2.1 `[[Match]](S, index)` rather than the host's habit of scanning forward. This is sound because the ES5.1 grammar this engine accepts is a strict subset of every host's, so no pattern reaches the host with a _structural_ meaning the host could get wrong; character-set membership (`\\s`, `\\w`, case-insensitive canonicalization) still follows the host's Unicode version, which in practice is uniform across all target hosts. The host's boolean/index result is used as-is rather than trusted for anything richer. Engine-internal host regex literals (the numeric recognisers in `conversion.js`'s `ToNumber`) are not guest-visible and do not pass through this layer. It is still a real host dependency, the one place in this engine where guest semantics lean on the host's implementation instead of an own one, worth stating plainly rather than leaving implicit. |
| `toExponential(f)` on `0`                                  | Literal ES5 15.7.4.6 step 8.a resets `f` to 0, making `(0).toExponential(5)` be `"0e+0"`. This follows the ES2015+ errata fix every engine ships: `"0.00000e+0"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `toFixed` receiver vs. argument order                      | Literal ES5 15.7.4.5 range-checks `fractionDigits` before validating the receiver. This validates the receiver first (the ES2015+ order, and the order ES5 already used for `toExponential`/`toPrecision`), so `Number.prototype.toFixed.call({}, 21)` throws `TypeError`, not `RangeError`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `toPrecision(1)` in exponential notation                   | Literal ES5 15.7.4.7 step 10.c always splits `m` around a `.`, giving `"1.e+2"`. This applies the ES2015+ `p !== 1` guard, so `(123).toPrecision(1)` is `"1e+2"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Global `var`/function declarations use own-property checks | Literal ES5.1 10.5 steps 5.c and 8.b consult the global environment record's `HasBinding`, which is `[[HasProperty]]` and therefore walks the global object's prototype chain, and step 5.e.ii reads the _inherited_ descriptor via `[[GetProperty]]`. This engine instead uses own-property checks — `HasOwnProperty` for `var`, `[[GetOwnProperty]]` for function declarations — which is the ES2015+ `CanDeclareGlobalVar`/`CanDeclareGlobalFunction`/`CreateGlobalFunctionBinding` behaviour every engine ships and the behaviour Test262 pins. It is observable two ways: on a non-extensible global, `var toString;` throws a `TypeError` (literal ES5.1 would treat the inherited `Object.prototype.toString` as an existing binding and silently do nothing), and a function declaration colliding only with a locked _inherited_ property succeeds by creating an own property (literal ES5.1 would throw). Following the literal ES5.1 text here would fail `test/language/global-code/{decl-var,decl-func,script-decl-var-err,script-decl-func-err-non-extensible}.js`.                                                                                 |
| ES5 argument ranges                                        | `toFixed` and `toExponential` accept 0–20 digits and `toPrecision` accepts 1–21, throwing `RangeError` outside them — the ES5.1 ranges, not the wider ES2018+ `toFixed` 0–100 range.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `toString` with a radix other than 10                      | ES5 15.7.4.2 step 5 makes the non-decimal representation **implementation-dependent**, and this engine's portable digit-by-digit algorithm parts company with V8/JSC in two places. A magnitude above 2^53 in a radix that is not a power of two loses its low-order digits to double rounding — `(1152921504606846976).toString(3)` ends `…210001` here and `…210000` in V8 — while power-of-two radices stay exact. A fraction whose expansion never terminates is cut at a fixed 1100-digit bound instead of at the shortest round-tripping prefix, so `(0.1).toString(3)` is 1102 characters here and 36 in V8. Coverage is scoped to match: this suite and the pinned Test262 `number-builtins` group exercise exact integers, terminating fractions, radix validation and coercion order, and the special values (`NaN`, signed zero, the infinities) — never the implementation-dependent tails, which no conforming test may pin.                                                                                                                                                                                                                          |
| `toLocaleString`                                           | ES5 15.7.4.3 is explicitly implementation-defined; this returns exactly `toString()`'s result, with no locale, separator, or `Intl` dependency.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `localeCompare`                                            | ES5 15.5.4.9's ordering is implementation-defined and only _recommends_ that canonically equivalent strings compare equal. This uses plain code-unit lexicographic order — the same order the relational operators use — so it is deterministic and host-independent, and `"\\u00e9"` vs. `"e\\u0301"` compares nonzero.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `toLocaleLowerCase`/`toLocaleUpperCase`                    | ES5 15.5.4.17/15.5.4.19 permit locale-sensitive results; these return exactly their locale-insensitive counterparts, so no host locale or ICU build can change engine output.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `toLowerCase`/`toUpperCase`                                | The Unicode Default Case Conversion algorithm over _code points_, including the locale-insensitive `SpecialCasing.txt` entries and the Final\_Sigma condition. Surrogate pairs are decoded, mapped, and re-encoded; unpaired surrogates pass through.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `substr`                                                   | Annex B rather than the main ES5 body, implemented because it is web reality; `start`/`length` follow B.2.3 including negative `start`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Math`'s transcendental functions                          | ES5 15.8.2 states the results of `acos`, `asin`, `atan`, `atan2`, `cos`, `exp`, `log`, `pow`, `sin`, `sqrt`, and `tan` are **implementation-dependent** approximations. This engine applies the specified special-value, sign, and domain rules itself and then forwards the approximation to the host `Math`, so the exactly-specified cases (`NaN`, the infinities, signed zero, domain errors, `pow`'s full table) are engine behaviour while the last-ulp digits are the host's. Coverage is scoped to match: the pinned `math-arithmetic` and `math-transcendental` groups exercise the specified cases, never the approximated tails, which no conforming test may pin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `Math.random`                                              | 15.8.2.14 requires an implementation-dependent pseudo-random value in `[0, 1)`; this forwards to the host's `Math.random`, so it is the one built-in whose result no realm can reproduce.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `JSON.stringify` and lone surrogates                       | ES5 15.12.3's `Quote` escapes only `"`, `\\`, the five short escapes, and code units below `U+0020`; an unpaired surrogate is written through verbatim, producing output that is not well-formed UTF-16. This follows ES5 literally rather than the ES2019 well-formed-`JSON.stringify` change, so `JSON.stringify("\\uD800")` is three code units — a quote, the raw surrogate, and a quote — not the escaped `"\\ud800"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `escape`/`unescape`                                        | Annex B rather than the main ES5 body, implemented for the same web-reality reason as `substr`; `escape` emits `%uXXXX` above `U+00FF`, and `unescape` never throws, passing malformed sequences through unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

#### Known limitations

Distinct from the table above: these are not choices, they are places the
implementation falls short of what a hosted engine should do. They are written
down for the same reason the deviations are — an undocumented shortfall is
indistinguishable from a bug.

| Area                                | Shortfall                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guest recursion depth is the host's | The evaluator recurses on the host stack, so unbounded guest recursion exhausts it and the host's own `RangeError` propagates out of `evaluateScript` instead of becoming a guest error. Guest `try`/`catch` cannot see it, where a real engine's catchable `RangeError` can: `try { (function f(){ f(); })(); } catch (e) {}` swallows the error under `jsc` and escapes to the embedder here. An embedder that runs untrusted source should treat a host `RangeError` from `evaluateScript` as a resource failure of the call, not of the realm. This predates `eval` and dynamic `Function`, which only widen the ways guest source can reach it. |

### Reading the report

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

### What the coverage numbers count

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
per-test record to [`docs/test262-report.jsonl`](docs/test262-report.jsonl), and
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
Full per-test records: [docs/test262-report.jsonl](docs/test262-report.jsonl).

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
