# Limitations and deviations

This document separates two categories of divergence from what a full-fidelity
ES5.1 engine would do: _intentional deviations_ (deliberate choices, each
backed by a rationale) and _known limitations_ (shortfalls the implementation
has not yet addressed). Both are written down so an undocumented divergence is
always treatable as a bug.

"Deviation" here is measured against ES5.1 itself, not against what shipping
engines happen to do, and the two are not the same thing: several entries below
describe places where this engine follows ES5.1 exactly and therefore differs
from every browser. Any `engine-deviation` exclusion in
[`tools/test262/es5-selection.json`](../tools/test262/es5-selection.json) must
name one of the headings below; two do — both name the `IdentifierName` heading
below — because every other one once filed under the category
turned out to be ES5.1-mandated behaviour. See
[docs/conformance.md](conformance.md) for the exclusion categories and counts.

## Intentional deviations

### Annex B pattern syntax is rejected (a deviation from browsers, not from ES5.1)

The engine implements the ES5.1 15.10.1 `Pattern` grammar strictly, so patterns
every browser accepts — `/]/`, `/{/`, `/\a/`, legacy octal `/\01/`, an
out-of-range backreference like `/\2/`, a quantified assertion like `/(?=x)*/`,
a multi-character class bound like `/[\d-a]/` — throw a guest `SyntaxError`
instead of matching literally or loosely. Because `match` and `search` build
`new RegExp(ToString(pattern))` per ES5, this reaches string patterns too:
`"a{b".match("{")` throws where a browser matches `"{"` literally.

This is listed as a deviation because of how visible it is in practice, but it
is worth being precise about what it deviates from. **ES5.1's Annex B contains
no RegExp extensions at all** — it adds only octal literals, octal string
escapes, `escape`/`unescape`, `String.prototype.substr`, and the legacy `Date`
methods, all of which this engine does implement. The RegExp leniency arrived in
ES2015's Annex B B.1.4. Every rejection listed above is therefore something
ES5.1's _normative_ grammar requires: `PatternCharacter` excludes `]` and `{`,
`Term` has no quantified-assertion production, 15.10.2.9 throws for an
out-of-range backreference, and 15.10.2.15 `CharacterRange` throws unless both
bounds are exactly one character.

So this engine is ES5.1-conforming here and browsers are ES2015-Annex-B
conforming; the two specifications genuinely disagree. That is why the Test262
tests covering it are classified `post-es5-semantics` rather than
`engine-deviation`.

**Backing code:** `src/runtime/regexp-syntax.js` (the strict ES5.1 grammar
validator).
**Verification:** `evaluateScript(realm, 'try { "a{b".match("{"); "ok" } catch(e) { e.constructor.name }')` → `"SyntaxError"`.

### `\$` is accepted as an identity escape

Read literally, ES5.1 15.10.1's `IdentityEscape :: SourceCharacter but not
IdentifierPart` forbids `\$`, because 7.6 lists `$` as an `IdentifierStart` and
therefore an `IdentifierPart`. The engine carves `$` out of the `IdentifierPart`
test used by `IdentityEscape` and accepts `/\$/`.

This is a deliberate divergence from the letter of the grammar: escaping `$` is
the only way to match a literal dollar sign that is not at the end of a pattern,
every shipping engine accepts it, and Test262 itself relies on it. The carve-out
is exactly one code point wide — `\_` still throws, since `_` is an
`IdentifierPart` the spec really does mean to exclude. Every other code point is
decided by the exact Unicode `IdentifierPart` table described below, not by an
approximation.

**Backing code:** `src/runtime/regexp-syntax.js` (`isIdentifierPart`).
**Verification:** `evaluateScript(realm, '/\\$/.test("$")')` → `true`, and
`evaluateScript(realm, 'try { new RegExp("\\\\_"); "ok" } catch (e) { e.constructor.name }')` → `"SyntaxError"`.

### `IdentifierName` is the vendored parser's grammar, not ES5.1 7.6

ES5.1 7.6 defines `IdentifierStart`/`IdentifierPart` by Unicode _general
category_ (`UnicodeLetter` is Lu, Ll, Lt, Lm, Lo, Nl; plus `UnicodeCombiningMark`,
`UnicodeDigit`, `UnicodeConnectorPunctuation`, `<ZWNJ>`, `<ZWJ>`). Identifier
lexing is done by the vendored Acorn parser, which instead uses the modern
`ID_Start`/`ID_Continue` derived properties, from its own bundled Unicode tables.
The two sets are close but not equal, so a small set of identifiers is
mis-lexed:

- **Accepted where ES5.1 rejects (53 BMP code points).** Two causes. The
  `Other_ID_Start`/`Other_ID_Continue` compatibility additions are not in any
  ES5.1 category — `·` U+00B7, `·` U+0387, the Ethiopic digits U+1369–U+1371,
  U+19DA, `℘` U+2118, `℮` U+212E, U+309B, U+309C, `・` U+30FB, U+FF65. The rest
  are code points assigned after the Unicode release this repository pins, since
  Acorn's tables track a newer one (U+088F, U+0C5C, U+0CDC, U+1ACF–U+1AEB,
  U+A7CE, U+A7CF, U+A7D2, U+A7D4, U+A7F1).
- **Rejected where ES5.1 accepts (1 BMP code point).** `ⸯ` U+2E2F VERTICAL TILDE
  is category Lm, so ES5.1 7.6 makes it a `UnicodeLetter` and therefore a valid
  `IdentifierStart`, but it carries `Pattern_Syntax` and is excluded from
  `ID_Continue`, so `var _\u2E2F` is a `SyntaxError` here.

This is the one place where the engine is stricter than ES5.1 rather than
merely different, and it is why two Test262 files remain classified
`engine-deviation`. It is also the engine's only _internal_ Unicode-version
split: `src/runtime/regexp-syntax.js` answers `IdentifierPart` from the pinned
tables described above, while the parser answers it from Acorn's, so the same
question can get two answers depending on which asks. Fixing it means replacing
the vendored parser's identifier lexer, which is deliberately out of scope for
a change that is otherwise confined to engine code.

**Backing code:** `vendor/acorn/` (identifier lexing), reached through
`src/parser.js`.
**Verification:** `evaluateScript(realm, 'var _\u2E2F; "ok"')` throws a `SyntaxError`, where ES5.1 7.6 makes `_\u2E2F` a valid identifier.

### Unicode data is pinned to one version

`IdentifierPart` (used by `IdentityEscape`) and the `String.prototype.toUpperCase`/
`toLowerCase` mappings are answered from tables generated from a **pinned** Unicode
release — the version recorded under `unicode.version` in
[`package.json`](../package.json) — rather than from the host's Unicode database.
`tools/unicode/generate-case-data.js` derives them from the UCD and
`npm run unicode:check` re-derives and diffs them.

Pinning is what makes these answers portable: hosts ship different ICU versions
(a current Node may be a whole Unicode release ahead of a shipping Safari), so
delegating would make the same program accept a regexp on one host and throw on
another. The deviation is that the engine's answers are frozen at the pinned
release and do not track newer Unicode assignments until the tables are
regenerated. ES5.1 itself only requires Unicode 3.0 or later, so any pinned
modern release is conforming.

**Backing code:** `src/builtins/unicode-case-data.js` (generated),
`tools/unicode/generate-case-data.js` (generator).

### Zero-width global match/replace count

ES5 15.5.4.10 step 8.f.iii.2 bumps `lastIndex` only when
`thisIndex === previousLastIndex`, not when the match is empty. For `/\b/g` on
`"ab"`, this yields 3 matches (and `replace` inserts at 3 positions) where
ES2015+ engines yield 2, because ES2015 replaced this with
`AdvanceStringIndex`-on-empty-match. The implementation follows the ES5.1 text
exactly.

**Backing code:** `src/builtins/string-regexp.js` (`String.prototype.match`
and `String.prototype.replace`).
**Verification:** `evaluateScript(realm, '"ab".match(new RegExp("\\\\b","g")).length')` → `3`.

### Matching runs on the host's RegExp engine

`src/runtime/regexp-compat.js` is the sole host boundary for guest-visible
regular expression semantics: it compiles an already-validated pattern with the
host's own `RegExp`, using the sticky flag so a single attempt at exactly one
index reproduces ES5 15.10.2.1 `[[Match]](S, index)` rather than the host's
habit of scanning forward. This is sound because the ES5.1 grammar this engine
accepts is a strict subset of every host's, so no pattern reaches the host with
a _structural_ meaning the host could get wrong; character-set membership
(`\s`, `\w`, case-insensitive canonicalization) still follows the host's Unicode
version, which in practice is uniform across all target hosts.

**Backing code:** `src/runtime/regexp-compat.js`.

### indexOf/lastIndexOf normalise a −0 start index to +0

ES5.1 §15.4.4.14 step 6 says "If n ≥ 0, then let k be n"; with
`n = ToInteger(-0) = -0` (§9.4 step 2) that yields `k = -0`, which step
8.b.iii returns as the found index when the element is at position 0
(observable as `1/result === -Infinity`). ES2015 §22.1.3.12 step 6.a
("If n is -0, let k be +0") was added precisely to fix this. This engine
follows the ES2015 result: the selected upstream test
`indexOf-never-returns-negative-zero.js` (in `test/staging/sm/Array/`) requires it,
and returning −0 as an array index is of no value to guest code. The same
normalisation applies to `lastIndexOf` (ES2015 §22.1.3.14 step 5.a).

**Backing code:** `src/builtins/array.js` (`indexOf`, `lastIndexOf`).
**Verification:** `evaluateScript(realm, '1/[true].indexOf(true, -0)')` → `Infinity` (not `-Infinity`).

### toExponential on zero

Literal ES5 15.7.4.6 step 8.a resets `f` to 0, making
`(0).toExponential(5)` be `"0e+0"`. This follows the ES2015+ errata fix every
engine ships: `"0.00000e+0"`.

**Backing code:** `src/builtins/number-format.js` (`toExponential`).
**Verification:** `evaluateScript(realm, '(0).toExponential(5)')` → `"0.00000e+0"`.

### toFixed receiver vs argument order

Literal ES5 15.7.4.5 range-checks `fractionDigits` before validating the
receiver. This validates the receiver first (the ES2015+ order, and the order
ES5 already used for `toExponential`/`toPrecision`), so
`Number.prototype.toFixed.call({}, 21)` throws `TypeError`, not `RangeError`.

**Backing code:** `src/builtins/primitive-wrappers.js` (`toFixed`).
**Verification:** `evaluateScript(realm, 'try { Number.prototype.toFixed.call({}, 21) } catch(e) { e.constructor.name }')` → `"TypeError"`.

### toPrecision in exponential notation

Literal ES5 15.7.4.7 step 10.c always splits `m` around a `.`, giving
`"1.e+2"`. This applies the ES2015+ `p !== 1` guard, so
`(123).toPrecision(1)` is `"1e+2"`.

**Backing code:** `src/builtins/number-format.js` (`toPrecision`).
**Verification:** `evaluateScript(realm, '(123).toPrecision(1)')` → `"1e+2"`.

### Global var and function declarations use own-property checks

Literal ES5.1 10.5 steps 5.c and 8.b consult the global environment record's
`HasBinding`, which is `[[HasProperty]]` and therefore walks the global object's
prototype chain, and step 5.e.ii reads the _inherited_ descriptor via
`[[GetProperty]]`. This engine instead uses own-property checks —
`HasOwnProperty` for `var`, `[[GetOwnProperty]]` for function declarations —
which is the ES2015+ `CanDeclareGlobalVar`/`CanDeclareGlobalFunction`/
`CreateGlobalFunctionBinding` behaviour every engine ships and the behaviour
Test262 pins.

**Backing code:** `src/evaluator/declarations.js`
(`globalDeclarationInstantiation`).

### ES5 argument ranges

`toFixed` and `toExponential` accept 0–20 digits and `toPrecision` accepts
1–21, throwing `RangeError` outside them — the ES5.1 ranges, not the wider
ES2018+ `toFixed` 0–100 range.

**Backing code:** `src/builtins/number-format.js`.
**Verification:** `evaluateScript(realm, 'try { (1).toFixed(21) } catch(e) { e.constructor.name }')` → `"RangeError"`.

### toString with a radix other than 10

ES5 15.7.4.2 step 5 makes the non-decimal representation
**implementation-dependent**, and this engine's portable digit-by-digit
algorithm parts company with V8/JSC in two places. A magnitude above 2^53 in a
radix that is not a power of two loses its low-order digits to double
rounding — `(1152921504606846976).toString(3)` ends `…210001` here and
`…210000` in V8 — while power-of-two radices stay exact. A fraction whose
expansion never terminates is cut at a fixed 1100-digit bound instead of at the
shortest round-tripping prefix, so `(0.1).toString(3)` is 1102 characters here
and 36 in V8. Coverage is scoped to match: this suite and the pinned Test262
`number-builtins` group exercise exact integers, terminating fractions, radix
validation and coercion order, and the special values (`NaN`, signed zero, the
infinities) — never the implementation-dependent tails, which no conforming
test may pin.

**Backing code:** `src/builtins/primitive-wrappers.js` (`toString`).
**Verification:** `evaluateScript(realm, '(0.1).toString(3).length')` → `1102`.

### toLocaleString

ES5 15.7.4.3 is explicitly implementation-defined; this returns exactly
`toString()`'s result, with no locale, separator, or `Intl` dependency.

**Backing code:** `src/builtins/primitive-wrappers.js` (`toLocaleString`).

### localeCompare

ES5 15.5.4.9's ordering is implementation-defined and only _recommends_ that
canonically equivalent strings compare equal. This uses plain code-unit
lexicographic order — the same order the relational operators use — so it is
deterministic and host-independent, and `"\u00e9"` vs. `"e\u0301"` compares
nonzero.

**Backing code:** `src/builtins/string-search.js` (`localeCompare`).
**Verification:** `evaluateScript(realm, '"\\u00e9".localeCompare("e\\u0301") !== 0')` → `true`.

### toLocaleLowerCase and toLocaleUpperCase

ES5 15.5.4.17/15.5.4.19 permit locale-sensitive results; these return exactly
their locale-insensitive counterparts, so no host locale or ICU build can change
engine output.

**Backing code:** `src/builtins/string-case.js`.

### toLowerCase and toUpperCase

The Unicode Default Case Conversion algorithm over _code points_, including the
locale-insensitive `SpecialCasing.txt` entries and the Final\_Sigma condition.
Surrogate pairs are decoded, mapped, and re-encoded; unpaired surrogates pass
through.

**Backing code:** `src/builtins/string-case.js`,
`src/builtins/unicode-case-data.js`.

### substr

Annex B rather than the main ES5 body, implemented because it is web reality;
`start`/`length` follow B.2.3 including negative `start`.

**Backing code:** `src/builtins/primitive-wrappers.js` (`substr`).
**Verification:** `evaluateScript(realm, '"hello".substr(-2)')` → `"lo"`.

### Math's transcendental functions

ES5 15.8.2 states the results of `acos`, `asin`, `atan`, `atan2`, `cos`,
`exp`, `log`, `pow`, `sin`, `sqrt`, and `tan` are **implementation-dependent**
approximations. This engine applies the specified special-value, sign, and
domain rules itself and then forwards the approximation to the host `Math`, so
the exactly-specified cases (`NaN`, the infinities, signed zero, domain errors,
`pow`'s full table) are engine behaviour while the last-ulp digits are the
host's.

This last-ulp divergence is real, not theoretical: measured across the three
target hosts, V8 (Node and Chromium) and JavaScriptCore disagree in the final
digit on `tan(1)`, `asin(0.5)`, `acos(0.5)`, `atan(0.5)`, `tan(1e30)`, and
`pow(3, 100)`. The spec permits this, so guest code that needs bit-identical
transcendentals across hosts must not use these functions.

**Backing code:** `src/builtins/math.js`.

### The clock and the local time zone come from the host

`Date.now`, `new Date()`, and every local-time accessor
(`getFullYear`, `getHours`, `toString`, ...) have to answer questions ES5.1
deliberately leaves to the implementation: 15.9.4.4 defines `Date.now` as the
current wall-clock time, and 15.9.1.7's `LocalTZA`/`DaylightSavingTA` are
"implementation-dependent". A realm created with no adapter therefore takes both
from the host — `Date.now()` and `new Date(t).getTimezoneOffset()` — so these
results are non-deterministic or machine-dependent when the default adapter is
used. Two machines in different time zones will print different
`new Date(0).toString()` values. Math's permitted approximation variation and
`Math.random` are additional host-varying outputs.

This is one of the engine's injectable host boundaries (the other is the
`maxStackDepth` recursion budget in `src/runtime/stack-guard.js`). It is confined to
`createDateHost` in `src/runtime/date.js`, which supplies only two functions —
`now()` and `timezoneOffset(utcMilliseconds)` — and an optional
`standardTimezoneOffset` number (the stable standard-time offset, used to
derive DaylightSavingTA without probing; when omitted the engine derives it
from January/July UTC probes). Everything else about dates is
computed by the engine: `parseDateString` implements 15.9.1.15 directly rather
than calling the host's `Date.parse`, and all calendar arithmetic, formatting,
and range clamping is engine code. An embedder that needs reproducible Date
output passes `{ dateHost: { now, timezoneOffset } }` to `createRealm`, after
which no host clock or zone database is observable from guest code at all; that
is how the engine's own Date tests stay deterministic.

**Backing code:** `src/runtime/date.js` (`createDateHost`).
**Verification:** `evaluateScript(createRealm({ dateHost: { now: () => 1234567890123, timezoneOffset: () => 0 } }), 'new Date(0).toString()')` → `"Thu Jan 01 1970 00:00:00 GMT+0000 (Local)"` on every host and in every time zone.

One consequence is worth knowing before running the upstream suite outside UTC.
ES5.1 7.9.1.15 reads every offsetless ISO 8601 string as UTC, while ES2015
20.3.1.15 rereads the offsetless date-_time_ form as local time; this engine
implements ES5.1, so `Date.parse('1970-01-01T00:00:00')` is `0`. The upstream
test for the ES2015 rule asserts that value equals the host's time-zone offset,
so it passes in UTC — where the two editions agree — and fails everywhere else.
It is therefore selected rather than excluded, because in the UTC environment CI
validates in the engine genuinely satisfies it. So that the committed report and
coverage table stay a pure function of the engine rather than of the contributor's
clock, `npm run test262:upstream` refuses to run outside UTC and prints the
`NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream`
invocation to use instead; CI pins the same broad Node environment. This is the
one file whose result would otherwise move with the host zone, so pinning the
zone is enough to make the artifacts reproducible.

### Number-to-string and string-to-number use the host's algorithms

After the engine has itself validated the ES5.1 grammar and handled every
sign, radix, whitespace, `Infinity`, and empty-input rule, the two numeric
conversions bottom out in the host: `ToString(number)` for radix 10 forwards to
the host's `String(number)`, and `ToNumber(string)`/`parseInt`'s digit
accumulation forward to the host's `Number(...)`.

This is portable because both are _exactly_ specified — 9.8.1 pins the
shortest-round-trip decimal representation, and 9.3.1 pins the mathematical
value — so a conforming host has exactly one correct answer and no room to
differ. That was confirmed by measurement: all `String(number)` and
`Number(string)` probes produced byte-identical results on Node, Chromium, and
JavaScriptCore. Post-ES5 input forms that a host would accept (`0b11`, `0o7`,
numeric separators) never reach the host, because the engine rejects them
against the ES5.1 grammar first.

**Backing code:** `src/runtime/conversion.js`.
**Verification:** `evaluateScript(realm, 'Number("0b11") + "," + Number("0o7") + "," + Number("1_0")')` → `"NaN,NaN,NaN"`.

### Math.random

15.8.2.14 requires an implementation-dependent pseudo-random value in `[0, 1)`;
this forwards to the host's `Math.random`, so its result is nondeterministic and
cannot be replaced through realm options.

**Backing code:** `src/builtins/math.js` (`random`).

### JSON.stringify and lone surrogates

ES5 15.12.3's `Quote` escapes only `"`, `\`, the five short escapes, and code
units below `U+0020`; an unpaired surrogate is written through verbatim,
producing output that is not well-formed UTF-16. This follows ES5 literally
rather than the ES2019 well-formed-`JSON.stringify` change, so
`JSON.stringify("\uD800")` is three code units — a quote, the raw surrogate, and
a quote — not the escaped `"\ud800"`.

**Backing code:** `src/builtins/json.js` (`stringify`).
**Verification:** `evaluateScript(realm, 'JSON.stringify("\\uD800").length')` → `3`.

### escape and unescape

Annex B rather than the main ES5 body, implemented for the same web-reality
reason as `substr`; `escape` emits `%uXXXX` above `U+00FF`, and `unescape`
never throws, passing malformed sequences through unchanged.

**Backing code:** `src/builtins/global-uri.js`.
**Verification:** `evaluateScript(realm, 'escape("\\u0100")')` → `"%u0100"`.

### Strict-mode duplicate object property names are no longer an early error

ES5.1 §11.1.5 makes a duplicate data-property name in an object literal a
SyntaxError in strict code (`"use strict"; ({ a: 1, a: 2 })`). ES2015 removed
that early error on purpose — an ordinary duplicate property name is legal, and
the later definition simply wins — and this engine follows ES2015 here because
raising the parser to `ecmaVersion: 6` is what enables lexical declarations, and
Acorn drops the ES5 strict duplicate-property check at that edition. So
`"use strict"; ({ a: 1, a: 2 }).a` evaluates to `2` rather than throwing. This
does not extend to `__proto__`: a duplicate `__proto__` _definition_ in an
object literal (`({ __proto__: null, __proto__: {} })`) is a distinct ES2015
early error that Acorn still enforces, so it is rejected.

This is the one place the ES2015 lexical-declarations milestone deliberately
changes an existing ES5.1 behaviour: an ES5.1 engine would reject the strict
form, and this engine now accepts it. It is a knowing divergence from ES5.1's
letter that adopting the ES2015 grammar carried along, listed here rather than
under known limitations because it is a deliberate choice, not a shortfall. The
upstream tests that assert this sloppy acceptance — `11.1.5-2gs.js`,
`prop-dup-data-data.js`, and the `11.1.5_4-4-*` files under
`test/language/expressions/object/` — are **selected and passing**, not
excluded. The one duplicate-property test that stays out, `__proto__-duplicate.js`,
is excluded **structurally by the engine-grammar parse filter** (it asserts the
`__proto__` early error above, so it no longer parses under the engine's
grammar), not by a classified exclusion entry.

**Backing code:** `src/parser.js` (`ecmaVersion: 6` in `PARSER_OPTIONS`).
**Verification:**
`evaluateScript(realm, '(function(){ "use strict"; return ({ a: 1, a: 2 }).a; })()')`
→ `{ type: 'normal', value: 2 }`; and
`evaluateScript(realm, 'try { eval("({ __proto__: null, __proto__: {} })"); "ok" } catch (e) { e.constructor.name }')`
→ `{ type: 'normal', value: 'SyntaxError' }`.

## Known limitations

Distinct from the deviations above: these are not choices, they are places the
implementation falls short of what a hosted engine should do. They are written
down for the same reason the deviations are — an undocumented shortfall is
indistinguishable from a bug.

### Well-known symbols are defined but only @@toPrimitive, @@toStringTag, @@iterator and @@species are honoured

The engine implements ES2015 Symbols (see
[docs/conformance.md](conformance.md#symbols-and-property-keys)) and defines all
eleven of ECMA-262 §6.1.5.1's well-known symbols as own properties of `Symbol`,
with the specified attributes and shared across realms. Four of them do
something: `@@toPrimitive` is a real step of `ToPrimitive`, a string
`@@toStringTag` is preferred by `Object.prototype.toString`, and `@@iterator`
drives the iteration protocol — `GetIterator` reads it, so `obj[Symbol.iterator]`
makes `obj` iterable in `for`-`of` and every built-in iterator (Array, String,
`arguments`) installs it (yoonbuck/jsjs#47). Promise chaining reads
`@@species` to choose the constructor for the derived Promise.

The other seven — `@@hasInstance`, `@@isConcatSpreadable`, `@@match`,
`@@replace`, `@@search`, `@@split`, and `@@unscopables` — are values with no
behaviour behind them. `instanceof` does not consult `@@hasInstance`,
`Array.prototype.concat` does not consult `@@isConcatSpreadable`,
`String.prototype.match` and friends do not dispatch through
`@@match`/`@@replace`/`@@search`/`@@split`, and `with` does not consult
`@@unscopables`.

This is a deliberate staging boundary rather than an oversight: those protocols
belong to the issues that introduce the machinery they need — chiefly the ES2015
object and function runtime updates (yoonbuck/jsjs#38) — and defining the keys
first is what lets those land without re-opening this one. The values have to
exist now regardless, because they are the extension points every later protocol
is keyed by.

**Observable example:** `var o = {}; o[Symbol.hasInstance] = function () { return true; };`
then `typeof o[Symbol.hasInstance]` is `"function"` and
`Object.getOwnPropertySymbols(o)[0] === Symbol.hasInstance` is `true`, but
`1 instanceof o` still throws a `TypeError` because `instanceof` never calls it.
**Backing code:** `src/runtime/symbol.js`, `src/runtime/agent.js`,
`src/builtins/symbol.js`.

### Ordinary synchronous recursion depth is engine-owned and shallow

The ordinary evaluator processes guest code by recursing on the host stack, so
that synchronous recursion is bounded by an engine-owned budget rather than by
the host's stack: a realm allows 500 engine frames
(`DEFAULT_MAX_STACK_DEPTH`), and the frame that would exceed that raises a
realm-local guest `RangeError` with the message
`Maximum call stack size exceeded`, which guest `try`/`catch` sees exactly as a
real engine's does. Everything that recurses on the host stack enters the
budget: every activation (guest functions, guest constructors, and built-ins
alike, so a recursion threaded through `[].map`, a getter, a `valueOf`, or an
`eval` chain is counted), every expression and statement node the synchronous
evaluator walks into, `JSON.parse`/`JSON.stringify`, and the regular-expression
pattern parser. The last two matter because their recursion follows the shape
of runtime _data_ — a parsed JSON document, a pattern string — rather than the
shape of source, so guest code can drive them arbitrarily deep without a single
extra call.

Synchronous generator suspension does not retain that recursion. Its
expression, pattern, and control-flow continuation frames are typed heap data,
and every active evaluator/`StackGuard` frame unwinds before a yield returns.
Resuming a classified yield-free subtree or making a synchronous call still
bridges to the ordinary evaluator, so generators do not remove this bounded
active-recursion limitation.

The unit is deliberately an _engine frame_ and not a guest call, because a
guest call is not a fixed amount of host stack — `f()` nested twenty levels
deep in an expression costs several times what a bare `f()` costs. A budget
counting calls alone would be safe for the shape it was measured on and unsafe
for the shape a hostile script picks.

The shortfall is the depth. Real engines allow roughly ten thousand frames; 500
buys about 165 activations of a plain recursion, so a recursive guest algorithm
that any browser runs happily can fail here. The number is not arbitrary — it
is the smallest measured host budget (1091 frames on Node 26, 1086 on headless
Chromium — both bounded by `String()` on a self-nesting array — and 6143 on
`jsc`, bounded there by a deeply alternated regular expression) with better
than a factor of two in reserve, which is what pays for the host frames an
embedder has already spent before calling in. But it is a budget chosen for the worst host and the worst
shape rather than for the running one. An embedder that knows its host can
raise it per realm with `createRealm({ maxStackDepth })`.

Raising it is the one way to give the original defect back. The budget contains
guest recursion only while it is lower than the host's real limit, so a value
above what the running host survives means the host stack runs out first and the
embedder gets the uncatchable host `RangeError` again — on Node 26, a budget of
5000 does exactly that. The default is safe everywhere measured; anything larger
is the embedder's measurement to make, on the host and the shapes they actually
run.

Counting frames the engine really spends has a visible cost of its own:
recursion driven by _data_ nesting rather than by guest calls spends the same
budget. Rendering a self-nesting array (`String(a)` where `a[0][0][0]…`)
recurses through `Array.prototype.toString`/`join` once per level and raises
the guest `RangeError` at 246 levels of nesting where the raw host stack
reached 767; `JSON.stringify` on the same structure stops at 493. The tradeoff
is deliberate: measuring a recursion in the host frames it really spends is
what makes a single budget safe for every shape on every host.

One recursion is spent before evaluation begins, where no budget can count it:
the depth of the _source text_ itself. Two things walk it, and they are handled
differently.

The **parser** recurses, and running out of stack there is reported as what it
is at that stage — a failure to parse, raising `SyntaxError: Not enough stack
space to parse input`, which is what Acorn itself raises for the same
condition. So a script nested some thousands of levels deep is rejected the way
any unparsable script is: the embedder gets a host `SyntaxError`, and guest
code that reached the parser through `eval` or `Function` gets a catchable
guest `SyntaxError`. The depth at which that happens is the host's, not the
engine's, so it is one of the few places where hosts still differ. An embedder
that injects its own parser through `options.parse` is excluded from the
conversion — its defects stay its own.

Custom parser results and caller-supplied reusable `Program` objects have one
additional boundary: evaluator-reachable AST nodes and their structural child
arrays must form a tree, so the same object cannot occupy two syntax positions.
Native Acorn trees already satisfy this invariant. Shared or cyclic structural
identities are rejected with a `SyntaxError` before static semantics or
evaluation; arbitrary metadata outside the evaluator child fields may still
share and cycle.

The same conversion covers the **early-error pass** that runs just after, where
`checkRegularExpressionLiteral` re-validates every regular expression literal
against the ES5.1 grammar with a second recursive descent over the same guest
text. That walk runs after Acorn has already accepted the literal, so which of
the two validators exhausts first is a race between two host-dependent
thresholds; when the engine's loses — around 2000 nested groups on Node 26 —
depth reached there is reported as the same failure to parse, rather than as a
host `RangeError` for a pattern that is merely too deep.

The **hoisting passes** that follow a successful parse
(`globalDeclarationInstantiation`, `functionDeclarationInstantiation`, and
`evalDeclarationInstantiation`, all through the declaration-name walks in
`src/evaluator/static-semantics.js`) keep an explicit worklist instead of the
host's, and push their children one at a time rather than spreading them as call
arguments. Between them those two make the walk's cost independent of the
program's shape: neither its depth nor the width of any statement list can
reach a host limit. Both matter, because the parser accepts programs that
outgrow either — nested more deeply than a recursive walk of the result
survives, or with a statement list longer than the roughly 120,000 arguments a
host allows in one call — and in both cases a program the parser had just
accepted would overflow on the way to being evaluated, handing the embedder a
host `RangeError` for a perfectly well-formed script.

Outside the parser's own conversion, a host stack overflow is never
reinterpreted: if one happens it escapes `evaluateScript` as the host
`RangeError` it is, because relabeling host exceptions would hide engine
defects behind a guest error.

**Backing code:** `src/runtime/stack-guard.js`, entered from
`EngineFunction#callFunction` (`src/runtime/function-object.js`),
`NativeFunction#callFunction`/`#constructFunction` (`src/builtins/shared.js`),
`evaluateExpression` (`src/evaluator/expressions.js`), `evaluateStatement`
(`src/evaluator/statements.js`), `src/builtins/json.js`, and `validatePattern`
(`src/runtime/regexp-syntax.js`); the parse-time conversion is `asParseFailure`
in `src/parser.js`; the iterative walks are `EngineObject#getProperty`
(`src/runtime/object.js`), `BoundFunction#hasInstance`
(`src/builtins/function.js`), and the declaration-name walks in
`src/evaluator/static-semantics.js`.
**Verification:** `evaluateScript(realm, 'try { (function f(){ f(); })() } catch (e) { e.name }')` → `{ type: 'normal', value: 'RangeError' }`.

### Annex B statement-position function declarations are limited

This is a legacy Annex B boundary, separate from issue #25's ES2015 syntax
surface. The engine supports block-level function declarations and their
applicable Annex B.3.3 aliases, but does not implement every web-legacy
statement-position extension. A `FunctionDeclaration` directly in an iteration
or `with` body is rejected in every mode. A direct `if` or `else` branch is also
rejected, including sloppy `if (condition) function f() {}`: Annex B.3.4
specifies semantics for that form, but the evaluator does not implement them.
Put the declaration in a block instead. The separate sloppy, statement-list
labelled-function case remains supported where Annex B.3.2 permits it.

**Backing code:** `src/parser.js`
(`checkStatementPositionFunctionDeclarations`).
**Verification:** `evaluateScript(realm, 'if (true) function f() {}')` throws a
host `SyntaxError`.

### Remaining unsupported syntax and later APIs

The engine now accepts the issue #25 ES2015 syntax surface: arrows, classes and
derived construction, computed object/class method names, destructuring,
default/rest parameters, iterable array/call/construction spread, template
literals, binary/octal literals, valid Unicode code-point escapes, and exact
`new.target` in function code. Top-level, module, and indirect-eval
`new.target` parses still fail. It also accepts synchronous generator
declarations, expressions, object/class methods, `yield`, and `yield*`. The
capability gate still rejects these neighboring forms, and the runtime omits
the listed later APIs:

- async functions and `await`, including async generators and async iteration;
- dynamic `import()`, `import.meta`, top-level `await`, and import
  assertions/attributes;
- object rest and object spread;
- later class forms: public/private fields, private methods, static blocks, and
  decorators;
- post-ES2015 iterator/generator helpers such as `Iterator.from` and helper
  methods including `map`, `filter`, and `take`.

`parseScript` uses `sourceType: 'script'`, while `parseModule` is the dedicated
static-module parser. Neither accepts dynamic import or the remaining module
forms above, and `ecmaVersion: 6` rejects async forms before the engine's
capability pass. Both ordinary and custom module ASTs reject unsupported syntax,
RegExp flags, ES5-invalid RegExp patterns, and strict binding/parameter errors
during parsing, before loader linking or evaluation. The remaining unsupported
syntax forms are guarded by `src/parser.js` shape validation, so the grammar it
accepts is the grammar the evaluator can execute. Iterator/generator helpers are
a later built-in surface rather than syntax and are simply not installed. A
top-level parse failure is a host `SyntaxError`; code reached through `eval`,
`Function`, or `%GeneratorFunction%` receives a catchable guest `SyntaxError`.
