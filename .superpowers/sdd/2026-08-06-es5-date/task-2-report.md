# Task 2: Date construction and statics report

## Implementation

- Added `EngineDate`, which holds only a clipped UTC millisecond `timeValue`.
- Added the realm-local `Date` constructor and its ES5 static methods:
  `Date.parse`, `Date.UTC`, and `Date.now`.
- Implemented the call and construct overloads, numeric clipping, one-argument
  Date cloning/string parsing, local calendar construction, two-digit years,
  and deterministic ISO parsing. Parsing is engine-owned; it does not call
  host `Date.parse`.
- Added `createDateHost`, the sole host boundary for current time and
  timezone-offset lookup. `createRealm` accepts `dateHost`, plus the direct
  `now`/`clock` and `timezoneOffset`/`timeZoneOffset` aliases, for deterministic
  injection.
- Kept public Date getter/setter and formatting method families out of scope.
  The small internal Date-call string is only what the `Date()` callable
  overload requires and is parseable by the engine.

## Files

- Added `src/builtins/date.js`
- Modified `src/runtime/date.js`
- Modified `src/runtime/realm.js`
- Added `test/date-builtins.test.js`
- Modified `test/suites.js`

## TDD evidence

### Construction, statics, parsing, and adapter injection

1. Added all five behavior cases in `test/date-builtins.test.js` before Date
   production code:
   - realm wiring, Date branding, clipping, and UTC state;
   - cloning, string construction, local calendar construction, two-digit years,
     and injected clock;
   - ISO UTC/offset/date-only parsing and invalid input;
   - `Date.UTC` defaults, normalization, clipping, and two-digit years;
   - injected `Date.now`, `Date()` callable behavior, and injected timezone.
2. Initial RED command:
   `node test/run-node.js test/date-builtins.test.js`
   initially failed while loading because `EngineDate` did not yet exist. The
   test was immediately made behavior-only (it now inspects the constructed
   engine object’s state without importing a missing production symbol).
3. Meaningful RED command:
   `node test/run-node.js test/date-builtins.test.js`
   produced five expected failures: `Date` was `undefined`, construction
   returned a throw completion, and each static call returned the guest
   `ReferenceError` object rather than its expected number/string.
4. Implemented the minimal Date runtime, builtin installer, host adapter, and
   realm wiring.
5. GREEN command:
   `node test/run-node.js test/date-builtins.test.js`
   passed all five cases.

## Commands and results

| Command | Result |
| --- | --- |
| `node test/run-node.js test/date-builtins.test.js` (RED) | Five expected Date-missing failures |
| `node test/run-node.js test/date-builtins.test.js` (GREEN) | 5 passed |
| `npm run typecheck` | Passed |
| `npm run lint -- --quiet` | Passed |
| `node test/run-node.js test/date-arithmetic.test.js` | 4 passed |
| `node test/run-node.js test/node/repository-invariants.test.js` | Passed |
| `npm test` | Passed (vendor sync, node suite, Test262 fixtures) |

## Self-review

- Verified the Date value is UTC milliseconds only and Date instances are
  realm-local via a fresh `%Date.prototype%`.
- Verified no core parsing/arithmetic delegates to host `Date`; the host is
  limited to default clock/offset adapter implementations.
- Corrected Date source to avoid host `String.prototype` calls after the
  repository invariant identified them; the source now passes that invariant.
- Confirmed the scope contains no public Date getters, setters, or formatting
  method family.

## Round 2 redo

### History and baseline

- Reverted round-one commit `23e8fa6` non-destructively in `bb006bf` before
  making any new production changes. The revert commit includes the required
  `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`
  trailer.
- `git diff --exit-code e4b8279 -- src/builtins/date.js src/runtime/date.js src/runtime/realm.js test/date-builtins.test.js test/suites.js`
  succeeded, and the pre-existing focused Date suite passed (5 passed), proving
  the production baseline was restored before the new tests were added.

### Genuine RED

After adding the six focused findings (while production remained at the
restored baseline), `node test/run-node.js test/date-builtins.test.js` exited
with status 1. The six expected behavioral failures were:

```text
Date constructor preserves invalid component years
Expected false to be the same value as true
Date.parse defaults incomplete date-only forms to UTC
Expected NaN to be the same value as 0
Date.parse defaults unzoned date-times to UTC
Expected -7200000 to be the same value as 0
Date constructor applies String-hint conversion to Date objects
Expected 0 to be the same value as 1
Date host receives UTC milliseconds for Date call and ES5 local construction
Expected 18000000 to be the same value as 14400000
Date.prototype is an invalid Date-branded object
Expected false to be the same value as true
```

The existing plain-clone assertion, `new Date(new Date(123)) => 123`, remained
in that RED run and passed.

### Implementation and GREEN

- Invalid component years now remain invalid before the two-digit component-year
  adjustment.
- ISO `YYYY`, `YYYY-MM`, and unzoned date-times parse as UTC; ISO years do not
  receive component-constructor two-digit-year adjustment.
- Date construction preserves ordinary internal-value cloning, but invokes
  String-hint conversion when instance, Date-prototype, or inherited conversion
  methods have changed.
- The date host accepts `standardTimezoneOffset` (and
  `standardTimeZoneOffset`) for choosing the UTC instant supplied to the
  timezone adapter during local construction.
- `%Date.prototype%` is a Date-branded object with a `NaN` time value.

`node test/run-node.js test/date-builtins.test.js` passed all 12 focused cases.
The review follow-up tests for `Date.parse("0000")` and inherited
`Object.prototype.toString` conversion were separately added RED first, then
passed GREEN.

### Validation

| Command | Result |
| --- | --- |
| `node test/run-node.js test/date-builtins.test.js` | 12 passed |
| `node test/run-node.js test/date-arithmetic.test.js` | 4 passed |
| `node test/run-node.js test/node/repository-invariants.test.js` | 14 passed |
| `npm run typecheck` | Passed |
| `npm run lint -- --quiet` | Passed |

## Fix round 3

### Scope and contract

- Modified `src/runtime/date.js`, `test/date-builtins.test.js`, and this report only.
- `standardTimezoneOffset` remains the explicit adapter contract: a stable
  standard-time offset using the `getTimezoneOffset` convention. When omitted,
  the host derives it as the greater of deterministic January and July UTC
  adapter probes. This selects standard time for both positive northern-style
  and negative southern-style offsets; adapters outside that convention must
  inject the explicit value.

### Genuine RED

After adding the focused table-driven no-explicit-standard-offset regression
test, with production still defaulting the offset to `0`, the exact command and
output were. Test file: `test/date-builtins.test.js`.

```text
$ node test/run-node.js test/date-builtins.test.js
{"name":"Date is a realm-local constructor that creates Date-branded objects with clipped UTC milliseconds","status":"passed"}
{"name":"Date constructor clones dates, parses strings, and creates local calendar times","status":"passed"}
{"name":"Date constructor preserves invalid component years","status":"passed"}
{"name":"Date.parse implements ISO UTC, offset, date-only, and invalid input behavior without host parsing","status":"passed"}
{"name":"Date.parse defaults incomplete date-only forms to UTC","status":"passed"}
{"name":"Date.parse defaults unzoned date-times to UTC","status":"passed"}
{"name":"Date.UTC applies ES5 defaults, two-digit years, normalization, and clipping","status":"passed"}
{"name":"Date.now and Date called as a function use the injected clock and timezone adapter","status":"passed"}
{"name":"Date constructor applies String-hint conversion to Date objects","status":"passed"}
{"name":"Date constructor observes inherited Date conversion overrides","status":"passed"}
{"name":"Date host receives UTC milliseconds for Date call and ES5 local construction","status":"passed"}
{"name":"Date host derives standard offsets from deterministic northern and southern probes","status":"failed","error":{"name":"Error","message":"Expected 5729400000 to be the same value as 5725800000"}}
{"name":"Date.prototype is an invalid Date-branded object","status":"passed"}
```

The northern positive-offset case demonstrates the wrong `localTime` probe and
its wrong constructed UTC instant. The same compact table covers the southern
negative-offset case once the test is green.

### GREEN

Implemented the minimal January/July maximum-offset derivation in
`createDateHost`, then reran the exact focused command:

```text
$ node test/run-node.js test/date-builtins.test.js
{"name":"Date is a realm-local constructor that creates Date-branded objects with clipped UTC milliseconds","status":"passed"}
{"name":"Date constructor clones dates, parses strings, and creates local calendar times","status":"passed"}
{"name":"Date constructor preserves invalid component years","status":"passed"}
{"name":"Date.parse implements ISO UTC, offset, date-only, and invalid input behavior without host parsing","status":"passed"}
{"name":"Date.parse defaults incomplete date-only forms to UTC","status":"passed"}
{"name":"Date.parse defaults unzoned date-times to UTC","status":"passed"}
{"name":"Date.UTC applies ES5 defaults, two-digit years, normalization, and clipping","status":"passed"}
{"name":"Date.now and Date called as a function use the injected clock and timezone adapter","status":"passed"}
{"name":"Date constructor applies String-hint conversion to Date objects","status":"passed"}
{"name":"Date constructor observes inherited Date conversion overrides","status":"passed"}
{"name":"Date host receives UTC milliseconds for Date call and ES5 local construction","status":"passed"}
{"name":"Date host derives standard offsets from deterministic northern and southern probes","status":"passed"}
{"name":"Date.prototype is an invalid Date-branded object","status":"passed"}
```

### Validation

| Command | Result |
| --- | --- |
| `node test/run-node.js test/date-builtins.test.js` | 13 passed |
| `node test/run-node.js test/date-arithmetic.test.js` | 4 passed |
| `node test/run-node.js test/node/repository-invariants.test.js` | 14 passed |
| `npm run typecheck` | Passed |
| `npm run lint -- --quiet` | Passed |
