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

| Command                             | What it does                                                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                          | The Node suites, then the Test262 fixture suite through the CLI                                                                                                              |
| `npm run test:node`                 | Every portable suite plus the Node-only suites in `test/node/`                                                                                                               |
| `npm run test:browser`              | Every portable suite in the headless Chromium shell via Playwright                                                                                                           |
| `npm run test:jsc`                  | Every portable suite in the `jsc` shell                                                                                                                                      |
| `npm run test262:fixtures`          | Test262 runner over `test/fixtures/test262`, forcing the fixture-only `fixture-subset` feature (JSON lines on stdout)                                                        |
| `npm run test262:fixtures:manifest` | The same fixture tree with the feature allowlist defaulted from `tools/test262/features.json`                                                                                |
| `npm run test262:upstream`          | The pinned upstream subset from a real `tc39/test262` checkout (compact coverage summary on stdout; regenerates `docs/test262-report.jsonl` and the README's coverage block) |
| `npm run test262:upstream:check`    | The same run, writing nothing: fails if either generated artifact is stale                                                                                                   |
| `npm run test262:jsc`               | The fixture suite under the `jsc` shell                                                                                                                                      |
| `npm run vendor:sync`               | Refresh `vendor/` from the pinned dependencies                                                                                                                               |
| `npm run vendor:check`              | Fail if `vendor/` has drifted from the pinned dependencies                                                                                                                   |
| `npm run typecheck`                 | `tsc` in checkJs mode                                                                                                                                                        |
| `npm run format`                    | Prettier `--check` over the whole repository, minus the generated and guest-owned trees `.prettierignore` names                                                              |
| `npm run lint`                      | ESLint only                                                                                                                                                                  |
| `npm run ci:generate`               | Regenerate `.github/workflows/ci.yml` from `tools/ci/pipeline.js`                                                                                                            |
| `npm run ci:check`                  | Fail if the committed workflow has drifted from `tools/ci/pipeline.js`                                                                                                       |
| `npm run ci:contract`               | The full local CI contract: every command CI runs, for real (see [Continuous integration](#continuous-integration))                                                          |

`test/suites.js` is the one registry of portable suites; all three runners take
their default work from it, and `test/node/repository-invariants.test.js` fails
if a suite file exists that no runner registers.

`npm run test:browser` needs Playwright's headless Chromium shell once. This is
the exact command CI runs, and the flags matter: the headless shell is a
separate download from full Chromium, so installing one and launching the other
is how a browser job ends up silently skipping.

```sh
npx playwright install --with-deps --only-shell chromium
```

`npm run test:jsc` and `npm run test262:jsc` need `jsc` on `PATH`. macOS ships it
inside the JavaScriptCore framework rather than in a bin directory:

```sh
PATH="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" npm run test262:jsc
```

The JSC entry point takes no arguments (the shell has no argument vector), so it
reads optional `jsjsTest262Root` and `jsjsTest262Features` globals and otherwise
falls back to the checked-in fixtures.

The Node CLI accepts arguments:

```sh
node tools/test262/adapters/node.js \
  --root=test/fixtures/test262 \
  --features=fixture-subset \
  --skip-features=Proxy \
  --include-malformed \
  test/positive.js
```

`--root` points at a Test262-shaped tree (`harness/` plus test files) and
`--harness` renames the harness directory inside it,
`--features` is the allowlist of Test262 feature names the engine claims to
support, `--skip-features` excludes features explicitly, `--include-malformed`
adds the manifest's deliberately broken fixtures, and trailing arguments select
individual files instead of the manifest. The process exits `1` when any test
fails.

When `--features` is omitted entirely, the Node CLI reads
`tools/test262/features.json` — the checked-in supported-feature manifest — and
uses that as the allowlist instead. Passing `--features` (even as an empty
list) always overrides the manifest; only its complete omission defers to the
file. `npm run test262:fixtures` passes `--features=fixture-subset` explicitly
so it keeps exercising the runner's own skip/pass logic against the fixture
tree's synthetic feature tag regardless of what the manifest says; `npm run
test262:fixtures:manifest` omits `--features` so it reports what the real,
checked-in manifest allows.

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
upstream-relative test paths. The paths are explicit rather than a glob because a
glob would change meaning every time the pin moves, so a green run would say
nothing about which tests actually ran; every path was verified to pass with this
engine, so a new failure is a real regression rather than a newly matched test.
`tools/test262/upstream.js` parses it (rejecting an abbreviated revision, an
unsorted or duplicated path, or a path outside `test/`) and summarizes a finished
run per group. The groups carry no execution semantics — they exist so the
coverage report can say which parts of the language the baseline covers.

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
report says exactly that: `{"type":"features","supported":[],"tagged":[],"untagged":125}`.
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

### Supported subset

Fixtures deliberately stay inside what the engine implements today: `var`,
function declarations and expressions, object and array literals (including
getter/setter syntax), member access and calls, `new`, arithmetic, comparison,
logical and conditional operators, simple `=` assignment, all compound
assignment operators (`+= -= *= /= %= <<= >>= >>>= &= ^= |=`), prefix and
postfix `++`/`--`, bitwise operators (`& | ^ << >> >>>`), `in`, `instanceof`,
`delete`, `if`/`while`/`do`/`for`/`for-in`/`return`/`throw`,
`try`/`catch`/`finally`, `switch`, labelled statements with
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

| Family     | Supported APIs                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Object`   | Call/construct coercion; `Object.prototype.constructor`, `toString`, `toLocaleString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`; descriptor queries and definitions; `getPrototypeOf`, `create`, `getOwnPropertyNames`, `keys`; extensibility, sealing, and freezing APIs                                                                                                                                        |
| `Function` | Callable `Function.prototype`; `toString`, `apply`, `call`, `bind`; bound calls, construction, `instanceof`, and adjusted `length`. The dynamic `Function` constructor is installed but deliberately throws a guest `Error` because engine policy forbids runtime code generation.                                                                                                                                                           |
| `Array`    | Call/construct overloads, sparse length construction, `Array.isArray`; `push`, `pop`, `shift`, `unshift`, `reverse`, `sort`, `splice`; `concat`, `join`, `slice`, `indexOf`, `lastIndexOf`; `every`, `some`, `forEach`, `map`, `filter`, `reduce`, `reduceRight`. Methods are generic where ES5 requires and preserve sparse holes.                                                                                                          |
| `Boolean`  | Call converts with `ToBoolean`, construct boxes; `Boolean.prototype` is itself a `false` wrapper; `constructor`, `toString`, `valueOf`. Both methods accept a boolean primitive or a `Boolean` wrapper and throw `TypeError` for anything else.                                                                                                                                                                                              |
| `Number`   | Call converts with `ToNumber`, construct boxes; the five ES5 constants; `constructor`, `toString`, `toLocaleString`, `valueOf`, `toFixed`, `toExponential`, `toPrecision`.                                                                                                                                                                                                                                                                   |
| `String`   | Call converts with `ToString`, construct boxes with lazy index properties and a non-writable `length`; `fromCharCode`; all ES5 prototype methods, including `match`/`replace`/`search`/`split` dispatching through real `RegExp` values.                                                                                                                                                                                                     |
| `RegExp`   | The ES5 15.10.1 `Pattern` grammar, validated strictly with no Annex B extensions; call coerces or copies a pattern, construct always allocates; the ES5 15.10.7 own properties `source`/`global`/`ignoreCase`/`multiline`/`lastIndex`; `exec`, `test`, `toString`; regular expression literals. `RegExp.prototype` is itself a RegExp object with source `(?:)` and all flags `false`, per ES5 15.10.6, not the ES2015 ordinary-object rule. |
| `Math`     | The eight constants (`E`, `LN10`, `LN2`, `LOG10E`, `LOG2E`, `PI`, `SQRT1_2`, `SQRT2`) and all eighteen ES5 functions: `abs`, `acos`, `asin`, `atan`, `atan2`, `ceil`, `cos`, `exp`, `floor`, `log`, `max`, `min`, `pow`, `random`, `round`, `sin`, `sqrt`, `tan`. `Math` is an ordinary object with `[[Class]]` `"Math"` and no `[[Call]]`/`[[Construct]]`. |
| `JSON`     | `JSON.parse` with the full JSON grammar and reviver traversal, and `JSON.stringify` with replacer functions, replacer property lists, `toJSON`, numeric and string `space` gaps, and cycle detection. Neither delegates to the host `JSON`. `JSON` is an ordinary object with `[[Class]]` `"JSON"`. |
| Globals    | `parseInt`, `parseFloat`, `isNaN`, `isFinite`; the URI functions `encodeURI`, `encodeURIComponent`, `decodeURI`, `decodeURIComponent`; and Annex B's `escape`/`unescape`. The URI functions throw a realm-local `URIError`. |

The remaining standard library is `Date`. The error constructors (`Error`,
`TypeError`, `ReferenceError`, `SyntaxError`, `RangeError`, `URIError`) are all
available on every realm's global object; `EvalError` is deliberately omitted
because this engine has no `eval`.

#### Boxed primitives, autoboxing, realms, and descriptors

All three constructors are realm-local: `createRealm()` builds a fresh
`String`/`Number`/`Boolean` and a fresh prototype chain, so a wrapper from one
realm is not an `instanceof` the other realm's constructor and prototype
mutations never leak between realms. Each constructor is a data property of the
global object with `{ [[Writable]]: true, [[Enumerable]]: false,
[[Configurable]]: true }`, each carries a non-writable, non-enumerable,
non-configurable `prototype`, and every prototype method is
`{ [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true }` with the
ES5 `length`.

`Boolean.prototype`, `Number.prototype`, and `String.prototype` are themselves
boxed primitives with `[[Class]]` `"Boolean"`, `"Number"`, and `"String"` and
primitive values `false`, `+0`, and `""`, so `Object.prototype.toString.call`
reports the right class and `Number.prototype.valueOf()` is `0`.

Autoboxing goes through the same intrinsics: a property access on a primitive
performs ES5 `ToObject` against the current realm, so `"abc".charAt(1)` and
`(1).toFixed(2)` work without materialising a persistent wrapper, and
`String.prototype.toString`/`valueOf` and the `Boolean`/`Number` equivalents
still reject a foreign receiver with a `TypeError`. String index access stays
lazy: `[[GetOwnProperty]]` synthesises `{ [[Writable]]: false, [[Enumerable]]:
true, [[Configurable]]: false }` for an in-range index rather than eagerly
populating one property per code unit.

That wrapper is transient in the full ES5 sense — guest code never gets to hold
it. A method call on a primitive passes the _primitive_ as `this` (11.2.3), so
a strict method sees `this === "x"` and only a non-strict one boxes it again
under 10.4.3; the special `[[Get]]`/`[[Put]]` of 8.7.1/8.7.2 call an accessor
found on the wrapper's prototype with the primitive too; and a write that could
only land on the wrapper — `"x".missing = 1`, `"abc".length = 5`, `"abc"[0] =
"z"` — throws a `TypeError` in strict code and is a silent no-op otherwise,
instead of quietly succeeding into an object that is discarded on the next
line.

Methods that ES5 defines generically (`charAt`, `indexOf`, `slice`,
`substring`, `split`, `trim`, the case methods, …) only `CheckObjectCoercible`
and `ToString` their receiver, so they work on any object; the ones ES5 defines
on "this String value" (`toString`, `valueOf`) require a String primitive or
wrapper.

#### Intentional deviations

| Area                                             | Behaviour and why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Annex B pattern syntax is rejected               | The engine implements the ES5.1 15.10.1 `Pattern` grammar strictly, with no Annex B extensions, so patterns web engines accept via Annex B (`/]/`, `/{/`, `/\a/`, octal `/\01/`, an out-of-range backreference) throw a guest `SyntaxError` instead of matching literally or loosely. Because `match` and `search` build `new RegExp(ToString(pattern))` per ES5, this reaches string patterns too: `"a{b".match("{")` throws where an Annex B engine matches `"{"` literally.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `IdentifierPart` approximation in the validator  | The 15.10.1 validator has no Unicode character database, so `IdentifierPart` (used by `IdentityEscape`) is approximated: every code unit ≥ 0x80 outside a fixed whitespace/line-terminator set is treated as `IdentifierPart`. This means escaped non-ASCII punctuation and symbols (e.g. `\—` U+2014, `\¡`) are rejected as invalid identity escapes, where the spec's exact `IdentifierPart` would accept them. The approximation is documented in `regexp-syntax.js`'s module header.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| RegExp literals are validated at evaluation time | Acorn parses a literal's pattern against the _host's_ grammar, which is Annex B-permissive, so a pattern that Annex B accepts but ES5.1 does not parses successfully. This engine's own validator only runs when the literal is evaluated, so such a pattern throws a guest `SyntaxError` at the point the literal expression executes, not when the program is parsed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Zero-width global match/replace count            | ES5 15.5.4.10 step 8.f.iii.2 bumps `lastIndex` only when `thisIndex === previousLastIndex`, not when the match is empty. For `/\b/g` on `"ab"`, this yields 3 matches (and `replace` inserts at 3 positions) where ES2015+ engines yield 2, because ES2015 replaced this with `AdvanceStringIndex`-on-empty-match. The implementation follows the ES5.1 text exactly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Matching runs on the host's RegExp engine        | `src/runtime/regexp-compat.js` is the sole host boundary for guest-visible regular expression semantics: it compiles an already-validated pattern with the host's own `RegExp`, using the sticky flag so a single attempt at exactly one index reproduces ES5 15.10.2.1 `[[Match]](S, index)` rather than the host's habit of scanning forward. This is sound because the ES5.1 grammar this engine accepts is a strict subset of every host's, so no pattern reaches the host with a _structural_ meaning the host could get wrong; character-set membership (`\s`, `\w`, case-insensitive canonicalization) still follows the host's Unicode version, which in practice is uniform across all target hosts. The host's boolean/index result is used as-is rather than trusted for anything richer. Engine-internal host regex literals (the numeric recognisers in `conversion.js`'s `ToNumber`) are not guest-visible and do not pass through this layer. It is still a real host dependency, the one place in this engine where guest semantics lean on the host's implementation instead of an own one, worth stating plainly rather than leaving implicit. |
| `toExponential(f)` on `0`                        | Literal ES5 15.7.4.6 step 8.a resets `f` to 0, making `(0).toExponential(5)` be `"0e+0"`. This follows the ES2015+ errata fix every engine ships: `"0.00000e+0"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `toFixed` receiver vs. argument order            | Literal ES5 15.7.4.5 range-checks `fractionDigits` before validating the receiver. This validates the receiver first (the ES2015+ order, and the order ES5 already used for `toExponential`/`toPrecision`), so `Number.prototype.toFixed.call({}, 21)` throws `TypeError`, not `RangeError`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `toPrecision(1)` in exponential notation         | Literal ES5 15.7.4.7 step 10.c always splits `m` around a `.`, giving `"1.e+2"`. This applies the ES2015+ `p !== 1` guard, so `(123).toPrecision(1)` is `"1e+2"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ES5 argument ranges                              | `toFixed` and `toExponential` accept 0–20 digits and `toPrecision` accepts 1–21, throwing `RangeError` outside them — the ES5.1 ranges, not the wider ES2018+ `toFixed` 0–100 range.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `toString` with a radix other than 10            | ES5 15.7.4.2 step 5 makes the non-decimal representation **implementation-dependent**, and this engine's portable digit-by-digit algorithm parts company with V8/JSC in two places. A magnitude above 2^53 in a radix that is not a power of two loses its low-order digits to double rounding — `(1152921504606846976).toString(3)` ends `…210001` here and `…210000` in V8 — while power-of-two radices stay exact. A fraction whose expansion never terminates is cut at a fixed 1100-digit bound instead of at the shortest round-tripping prefix, so `(0.1).toString(3)` is 1102 characters here and 36 in V8. Coverage is scoped to match: this suite and the pinned Test262 `number-builtins` group exercise exact integers, terminating fractions, radix validation and coercion order, and the special values (`NaN`, signed zero, the infinities) — never the implementation-dependent tails, which no conforming test may pin.                                                                                                                                                                                                                        |
| `toLocaleString`                                 | ES5 15.7.4.3 is explicitly implementation-defined; this returns exactly `toString()`'s result, with no locale, separator, or `Intl` dependency.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `localeCompare`                                  | ES5 15.5.4.9's ordering is implementation-defined and only _recommends_ that canonically equivalent strings compare equal. This uses plain code-unit lexicographic order — the same order the relational operators use — so it is deterministic and host-independent, and `"\u00e9"` vs. `"e\u0301"` compares nonzero.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `toLocaleLowerCase`/`toLocaleUpperCase`          | ES5 15.5.4.17/15.5.4.19 permit locale-sensitive results; these return exactly their locale-insensitive counterparts, so no host locale or ICU build can change engine output.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `toLowerCase`/`toUpperCase`                      | The Unicode Default Case Conversion algorithm over _code points_, including the locale-insensitive `SpecialCasing.txt` entries and the Final_Sigma condition. Surrogate pairs are decoded, mapped, and re-encoded; unpaired surrogates pass through.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `substr`                                         | Annex B rather than the main ES5 body, implemented because it is web reality; `start`/`length` follow B.2.3 including negative `start`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Math`'s transcendental functions                | ES5 15.8.2 states the results of `acos`, `asin`, `atan`, `atan2`, `cos`, `exp`, `log`, `pow`, `sin`, `sqrt`, and `tan` are **implementation-dependent** approximations. This engine applies the specified special-value, sign, and domain rules itself and then forwards the approximation to the host `Math`, so the exactly-specified cases (`NaN`, the infinities, signed zero, domain errors, `pow`'s full table) are engine behaviour while the last-ulp digits are the host's. Coverage is scoped to match: the pinned `math-arithmetic` and `math-transcendental` groups exercise the specified cases, never the approximated tails, which no conforming test may pin. |
| `Math.random`                                    | 15.8.2.14 requires an implementation-dependent pseudo-random value in `[0, 1)`; this forwards to the host's `Math.random`, so it is the one built-in whose result no realm can reproduce. |
| `JSON.stringify` and lone surrogates             | ES5 15.12.3's `Quote` escapes only `"`, `\`, the five short escapes, and code units below `U+0020`; an unpaired surrogate is written through verbatim, producing output that is not well-formed UTF-16. This follows ES5 literally rather than the ES2019 well-formed-`JSON.stringify` change, so `JSON.stringify("\uD800")` is three code units — a quote, the raw surrogate, and a quote — not the escaped `"\ud800"`. |
| `escape`/`unescape`                              | Annex B rather than the main ES5 body, implemented for the same web-reality reason as `substr`; `escape` emits `%uXXXX` above `U+00FF`, and `unescape` never throws, passing malformed sequences through unchanged. |

#### Unicode data

`String.prototype`'s case methods and `trim` need Unicode tables, and the engine
carries them as project-owned generated source rather than as a host call:
`src/builtins/unicode-case-data.js` is written by
`tools/unicode/generate-case-data.js` from the UCD version pinned in
`package.json`'s `unicode` field, and its header records the pinned version, the
three source URLs, and their sha256 digests.

`npm run unicode:check` re-derives every table from those files and fails if the
module has drifted, but it downloads the UCD (or reads it from `--from=DIR`), so
it is a documented **local** command and deliberately not a CI job. CI is not
network-free overall — `npm ci`, the `test-browser` job's Playwright install,
and the `test262-upstream` job's `tc39/test262` checkout all fetch over the
network — but no CI job fetches unpinned UCD data, and Unicode conformance
itself is never verified against the network in CI. What CI does enforce,
offline, is that the pin and the generated module _agree with each other_ —
`test/node/repository-invariants.test.js` fails if the module's
`UNICODE_VERSION` differs from the pinned version, if the pinned `baseUrl` does
not name that version, if the module header does not record exactly the pinned
UCD files (no fewer, no stale extras) each with a well-formed sha256 digest
line. This is a self-consistency check, not a content check: without a local
copy of the UCD to hash, it cannot confirm a recorded digest is the _correct_
one for the file it names, only that the pin, the file set, and the header
shape all agree. A half-updated pin — a version bump without regenerating, or a
regenerated module without updating the pin — therefore fails
`npm run test:node` without a network; a wrong-but-well-formed digest, or a
correctly-shaped header hand-edited to match a stale pin, would not be caught
by this check alone.

Strict mode is implemented at runtime for every construct this engine
supports, and the tests below pin each of these behaviours. A `'use strict'`
directive prologue activates strict semantics for the script or function body
it appears at the start of, and this propagates to nested functions. In strict
code, assignment to an undeclared identifier throws a `ReferenceError` rather
than creating an implicit global; `this` inside a called function is neither
coerced to the global object nor boxed, so a method invoked on a primitive
receives the primitive itself (`"x".p()` sees `this === "x"`); assignment
through a primitive base throws a `TypeError` (ES5 8.7.2's special `[[Put]]`)
instead of writing to a wrapper nobody can observe; assignment to a
non-writable property and `delete` of a non-configurable property throw
`TypeError`; the `arguments` object is unmapped; and the `caller`/`arguments`
properties of strict functions and their `arguments` objects are poison-pill
accessors. The static restrictions ES5 puts on strict code — duplicate
parameter names, duplicate data properties in an object literal, binding or
assigning `eval`/`arguments`, octal literals, `delete` of an unqualified
identifier, and `with` — are rejected by the parser before any of that runs.

The rules with nothing to apply to here are the ones belonging to features the
engine does not implement at all: there is no `eval` (and no dynamic `Function`
constructor, which is installed but always throws), and `with` is refused in
strict and non-strict code alike.

Assignment to an undeclared identifier in **non-strict** code follows ES5 8.7.2
step 3: it creates (or updates) a property on the realm's global object with
the same attributes an ordinary assignment to a global property gets —
writable, enumerable, and configurable, unlike the non-configurable property a
`var` declaration creates.

Tests carrying `module`, `async`, `CanBlockIsFalse`, `CanBlockIsTrue`, or
`non-deterministic` flags are skipped rather than failed, as are tests whose
`features` are outside the allowlist. `negative` tests whose expected error
constructor is not a binding on the realm's global object report
`unresolved-error-type` instead of pretending to pass.

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
with synthetic counts:

```json
{"type":"inventory","files":100,"records":180,"malformed":2}
{"type":"coverage","scope":"files","total":100,"selected":5,"attempted":4,"passed":3,"selectedPercent":5,"attemptedPercent":4,"passedPercent":3}
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

## Continuous integration

`.github/workflows/ci.yml` is a generated file. `tools/ci/pipeline.js` is the
source of truth: it declares the job list as data and renders the workflow YAML
from it, the same way `tools/vendor/sync.js` is the source of truth for
`vendor/`. Run `npm run ci:generate` after editing the pipeline to rewrite the
committed file, and `npm run ci:check` to fail (without writing) if the two have
drifted. That check is a real CI job — `ci-drift` — so a change to `pipeline.js`
without regenerating the workflow fails CI the same way a vendor change without
`vendor:sync` fails `vendor:check`.

The upstream Test262 pin is not duplicated in the pipeline: `loadCiPipeline`
reads `package.json`, so the workflow checks out exactly the revision the local
tooling pins and moving the pin regenerates the workflow.

Every push and pull request against `main` runs nine jobs:

| Job                | What it runs                                                  | Depends on |
| ------------------ | ------------------------------------------------------------- | ---------- |
| `ci-drift`         | `npm run ci:check`                                            | —          |
| `vendor`           | `npm run vendor:check`                                        | —          |
| `format`           | `npm run format` (Prettier `--check`)                         | —          |
| `lint`             | `npm run lint` (ESLint only)                                  | —          |
| `typecheck`        | `npm run typecheck` (`tsc` in checkJs mode)                   | —          |
| `test-node`        | `npm run test:node`                                           | `vendor`   |
| `test-browser`     | `npm run test:browser` (Playwright's headless Chromium shell) | `vendor`   |
| `test262-fixtures` | `npm run test262:fixtures` (the local fixture tree)           | `vendor`   |
| `test262-upstream` | `npm run test262:upstream` (the pinned upstream subset)       | `vendor`   |

`format` and `lint` are separate jobs (and separate npm scripts) so a
formatting-only failure and a linting-only failure are distinguishable in CI
without re-reading combined output. `format` checks the repository as a whole
(`prettier --check .`) rather than an allowlist of paths, so a new source file
is covered the moment it is written; the only exclusions are the generated and
guest-owned trees `.prettierignore` names, each with the reason it owns its own
bytes. `test/node/repository-invariants.test.js` fails if an engine source ever
falls outside that scope — through a narrowed script or through a new ignore
entry — and `npm run ci:contract` proves the scope for real by making
`npm run format` fail on a deliberately misformatted file under `src/`.
`vendor` runs `vendor:check` — a read-only
integrity check — as a fast-failing gate the test jobs depend on via `needs`, so
pin/vendor drift is caught before those jobs spend time on it; `npm ci`'s
`prepare` script already writes `vendor/` fresh on every job, so this
specifically guards against the checked `package.json` pin and
`tools/vendor/sync.js` disagreeing with each other.

`test-browser` installs the browser with
`npx playwright install --with-deps --only-shell chromium` — the same command
documented under [Commands](#commands) — before running the suite, so the job
does not depend on whatever happens to be cached on a runner image.

`test262-upstream` checks out `tc39/test262` at the pinned revision into
`vendor/test262` with a second `actions/checkout` step, runs the curated subset
against it, then fails if the committed report or the README coverage block is
not what the run just produced. The check is `git ls-files --error-unmatch`
followed by `git diff --exit-code` over both paths: the run writes its own
artifacts, so a path git does not track would have no diff to show and would
look clean forever. It uploads `docs/test262-report.jsonl` with `if: always()`
and `if-no-files-found: error`, so the JSON-lines report is available as an
artifact whether the run passed or failed — and the uploaded copy is the fresh
one, since the run writes it before the drift check reads it.

Two security properties are encoded in the pipeline rather than left to whoever
edits the workflow next, and both are asserted by
`test/node/workflow-contract.test.js`:

- The workflow grants `permissions: contents: read` at the top level and no job
  widens it, so a compromised action cannot write to the repository.
- Every `uses:` names a full 40-character commit SHA, because a tag like `v4` is
  a moving pointer its owner can repoint at any time. The release version follows
  in a trailing comment (`# v7.0.1`), so a bump reviews as a version change
  rather than as forty opaque characters. Both checkout steps also pass
  `persist-credentials: false`.

Each job runs on `ubuntu-latest` with Node 20 (via `actions/setup-node` with the
built-in npm cache) and `npm ci`, matching the npm lockfile and the project's
ES2020 host floor; the repository has no `.nvmrc` or `engines` field yet to
anchor this further.

JSC is a documented local/conditional adapter, not a hosted CI job. GitHub's
hosted `ubuntu-latest`/`macos-latest` runners do not ship a standalone `jsc`
binary on `PATH` the way macOS's JavaScriptCore framework does locally, so
`test:jsc` and `test262:jsc` stay commands you run yourself (see
[Commands](#commands)) rather than CI jobs; the byte-identical-output guarantee
between Node, Chromium, and `jsc` is still enforced by
`test/test262-runner.test.js`, just outside hosted CI. A self-hosted runner with
`jsc` on `PATH` could add `test-jsc`/`test262-jsc` jobs later without changing
anything else in `tools/ci/pipeline.js`.

### The two contracts

Keeping CI honest takes two suites, deliberately split, because they have
opposite requirements.

`test/node/workflow-contract.test.js` runs inside `npm run test:node`. It is
deterministic and machine-independent: it never spawns a subprocess, never
touches the network, and never runs the pipeline it describes. It parses the
committed YAML with a real YAML parser and checks it against an expectation
table written out in the test — which job runs which command, the top-level
permissions, every action pin, the upstream revision and artifact step — rather
than against the generator that produced it, so a byte comparison with
`pipeline.js` is a drift check rather than the whole contract. It also parses
both Test262 manifests and executes every declared feature probe for real.

`npm run ci:contract` (`test/ci/full-contract.test.js`, through
`test/run-ci-contract.js`) is the full local contract: it executes every command
CI runs — `vendor:check`, `format`, `lint`, `typecheck`, `ci:check`, `test:node`,
`test262:fixtures`, `test:browser`, `test262:upstream` — as real subprocesses and
asserts on their real exit codes and output. It is _not_ registered with the Node
runner, and `test/node/repository-invariants.test.js` fails if it ever is:
running the whole pipeline from inside one of its own jobs would be recursive,
and it would make `test:node` depend on a browser install and an upstream
checkout.

Nothing in the full contract is conditional. A missing browser or a missing
upstream checkout fails with the exact command needed to fix it, because a skip
that looks like a pass is how a contract quietly stops being one.

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
| Files           | 53,575      | 891      | 891       | 891    | 1.663%  |
| (file, variant) | 102,075     | 1,771    | 1,771     | 1,771  | 1.735%  |

430 of the 53,575 files carry frontmatter this tooling cannot parse; they count as files and expand into no (file, variant) records.
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
