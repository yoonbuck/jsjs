# Limitations and deviations

This document separates two categories of divergence from what a full-fidelity
ES5.1 engine would do: _intentional deviations_ (deliberate choices, each
backed by a rationale) and _known limitations_ (shortfalls the implementation
has not yet addressed). Both are written down so an undocumented divergence is
always treatable as a bug.

Every `engine-deviation` exclusion in
[`tools/test262/es5-selection.json`](../tools/test262/es5-selection.json)
names one of the deviation headings below. See
[docs/conformance.md](conformance.md) for the exclusion categories and counts.

## Intentional deviations

### Annex B pattern syntax is rejected

The engine implements the ES5.1 15.10.1 `Pattern` grammar strictly, with no
Annex B extensions, so patterns web engines accept via Annex B (`/]/`, `/{/`,
`/\a/`, octal `/\01/`, an out-of-range backreference) throw a guest
`SyntaxError` instead of matching literally or loosely. Because `match` and
`search` build `new RegExp(ToString(pattern))` per ES5, this reaches string
patterns too: `"a{b".match("{")` throws where an Annex B engine matches `"{"`
literally.

**Backing code:** `src/runtime/regexp-syntax.js` (the strict ES5.1 grammar
validator).
**Verification:** `evaluateScript(realm, 'try { "a{b".match("{"); "ok" } catch(e) { e.constructor.name }')` → `"SyntaxError"`.

### IdentifierPart approximation in the validator

The 15.10.1 validator has no Unicode character database, so `IdentifierPart`
(used by `IdentityEscape`) is approximated: every code unit ≥ 0x80 outside a
fixed whitespace/line-terminator set is treated as `IdentifierPart`. This means
escaped non-ASCII punctuation and symbols (e.g. `\—` U+2014, `\¡`) are rejected
as invalid identity escapes, where the spec's exact `IdentifierPart` would
accept them. The approximation is documented in `regexp-syntax.js`'s module
header.

**Backing code:** `src/runtime/regexp-syntax.js`, module-level comment.

### RegExp literals are validated at evaluation time

Acorn parses a literal's pattern against the _host's_ grammar, which is
Annex B-permissive, so a pattern that Annex B accepts but ES5.1 does not parses
successfully. This engine's own validator only runs when the literal is
evaluated, so such a pattern throws a guest `SyntaxError` at the point the
literal expression executes, not when the program is parsed.

**Backing code:** `src/evaluator/expressions.js` (the `Literal` handler for
RegExp nodes calls `src/runtime/regexp-syntax.js`).

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

### Array.prototype.toLocaleString element dispatch

ES5 15.4.4.3 requires boxing each non-null, non-undefined element with
`ToObject` and calling its `toLocaleString` on that wrapper. This engine
diverges from that algorithm in two independent ways: its short-circuit
matches neither ES5 nor ES2015, while its general dispatch receiver follows
ES2015.

1. **Short-circuit (neither ES5 nor ES2015).** When an element is a primitive
   whose `toLocaleString` resolves to the inherited
   `Object.prototype.toLocaleString`, the engine renders it with
   `ToString(element)` directly, never dispatching. ES5 dispatches with a boxed
   wrapper, while ES2015 dispatches with the raw primitive; this engine does
   neither and skips the call entirely.

2. **Dispatch receiver (ES2015-aligned).** On the general path the engine
   passes the raw primitive as `this`
   (`toLocaleString.callFunction(element, [])`) rather than the boxed wrapper.
   In sloppy mode the callee re-boxes `this` automatically, so the divergence
   is only observable from strict-mode guest code, where `this` retains its
   primitive type.

**Backing code:** `src/builtins/array.js` (`toLocaleString`).
**Verification (short-circuit):**
`evaluateScript(realm, 'Boolean.prototype.toString = function () { return typeof this; }; [true, false].toLocaleString()')`
→ `'true,false'`, where ES5 15.4.4.3 gives `'object,object'`.
**Verification (dispatch receiver):**
`evaluateScript(realm, '"use strict"; Number.prototype.toLocaleString = function () { return typeof this; }; [1,2].toLocaleString()')`
→ `'number,number'`, where ES5 15.4.4.3 gives `'object,object'`.

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

**Backing code:** `src/builtins/math.js`.

### Math.random

15.8.2.14 requires an implementation-dependent pseudo-random value in `[0, 1)`;
this forwards to the host's `Math.random`, so it is the one built-in whose
result no realm can reproduce.

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

## Known limitations

Distinct from the deviations above: these are not choices, they are places the
implementation falls short of what a hosted engine should do. They are written
down for the same reason the deviations are — an undocumented shortfall is
indistinguishable from a bug.

### Guest recursion depth is the host's

The evaluator recurses on the host stack, so unbounded guest recursion exhausts
it and the host's own `RangeError` propagates out of `evaluateScript` instead of
becoming a guest error. Guest `try`/`catch` cannot see it, where a real engine's
catchable `RangeError` can: `try { (function f(){ f(); })(); } catch (e) {}`
swallows the error under `jsc` and escapes to the embedder here. An embedder
that runs untrusted source should treat a host `RangeError` from
`evaluateScript` as a resource failure of the call, not of the realm. This
predates `eval` and dynamic `Function`, which only widen the ways guest source
can reach it.

**Backing code:** `src/evaluator/` (no host-stack guard anywhere).
**Verification:** calling `evaluateScript(realm, '(function f(){ f(); })()')` throws a host `RangeError`.
