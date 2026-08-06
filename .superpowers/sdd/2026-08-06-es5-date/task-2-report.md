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

## Fix round 1

### Covered findings

- `new Date(NaN, 0)`, `new Date(undefined, 0)`, and the equivalent `Date.UTC`
  calls retain invalid years as `NaN`.
- ISO date-only `YYYY` and `YYYY-MM` forms default omitted month/day fields to
  one, and an unzoned date-time is interpreted as UTC.
- Single-argument Date construction uses `ToPrimitive` with a String hint,
  including overridden guest `toString` and `valueOf`.
- `DateHost.timezoneOffset(utcMilliseconds)` now consistently receives UTC
  milliseconds. `standardTimezoneOffset` is its constant standard-time value
  in the same `getTimezoneOffset` minute convention, so local construction
  evaluates the dynamic offset at `localTime + standardTimezoneOffset`, as
  required by ES5 `UTC(t)`.
- `%Date.prototype%` is an `EngineDate` with a `NaN` UTC value and Date brand.

### TDD evidence

1. Added focused behavior tests in `test/date-builtins.test.js`.
2. RED command (with the production fix reversed, then restored):
   `node test/run-node.js test/date-builtins.test.js`

   Exit 1 with the five intended failures:
   - invalid component years were mapped to 1900;
   - incomplete ISO forms parsed as `NaN`;
   - a Date object's overridden String conversion was bypassed;
   - local construction used the wrong timezone-adapter instant;
   - `Date.prototype` had no invalid Date value.
3. Implemented only the Date runtime, Date builtin, and realm adapter changes
   needed for those cases.
4. GREEN command:
   `node test/run-node.js test/date-builtins.test.js`

   Output: all 10 named Date cases passed.

### Verification

| Command | Output |
| --- | --- |
| `node test/run-node.js test/date-builtins.test.js` | 10 passed |
| `node test/run-node.js test/date-arithmetic.test.js` | 4 passed |
| `node test/run-node.js test/node/repository-invariants.test.js` | 14 passed |
| `npm run typecheck` | Exit 0, no diagnostics |
| `npm run lint -- --quiet` | Exit 0, no diagnostics |
