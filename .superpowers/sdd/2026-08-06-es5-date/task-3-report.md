# Task 3: ES5 Date accessors and mutators

## Implementation

- Installed the complete ES5 local and UTC Date getter family, including
  `getYear` and `getTimezoneOffset`.
- Installed every ES5 Date setter, including legacy `setYear`, preserving the
  UTC-millisecond `EngineDate` state model.
- Added explicit local-to-UTC setter conversion through the injected DateHost
  adapter and exported the existing runtime conversion helper for that shared
  use.

## TDD cycles

### 1. Accessors

- **RED command:** `node test/run-node.js test/date-builtins.test.js`
- **RED output:** the two new accessor cases failed with `Expected [object
  Object] ...`; the evaluations stopped at missing Date prototype methods, so
  the engine returned throw completions rather than the expected result
  strings.
- **RED reason:** Date.prototype had no installed getter methods.
- **GREEN command:** `node test/run-node.js test/date-builtins.test.js`
- **GREEN output:** all 15 existing and new Date builtin cases passed.
- **GREEN change:** added receiver validation, local/UTC field extraction, all
  getters, invalid-Date NaN behavior, and adapter-backed timezone offsets.

### 2. Setters

- **RED command:** `node test/run-node.js test/date-builtins.test.js`
- **RED output:** all four new setter cases failed with `Expected [object
  Object] ...`; each evaluation encountered an uninstalled setter.
- **RED reason:** Date.prototype had no setter family.
- **GREEN command:** `node test/run-node.js test/date-builtins.test.js`
- **GREEN output:** all 19 Date builtin cases passed.
- **GREEN change:** added the local/UTC setter families, clipping,
  normalization, optional-field defaults, ordered coercion, invalid-date
  recovery rules, `setYear` two-digit-year handling, and the deterministic
  DST adapter path.

The initial DST expectation used a time-of-day literal without the preceding
calendar days. The test was corrected to the explicitly derived
`springLocalTime + 240 * minute` value, then rerun green; no production
behavior changed for that correction.

## Tests added

- Valid local and UTC values for every getter.
- Invalid Date getter NaNs and incompatible getter receiver.
- Every setter's valid mutation; overflow normalization; omitted optional
  fields; ordered object coercion.
- Invalid propagation for every non-recovering setter, recovery for
  `setTime`, `setFullYear`, and `setUTCFullYear`, plus incompatible setter
  receiver.
- Two-digit `setYear` behavior through `setYear(99)`.
- Literal DST-boundary local `setHours` adapter calls and resulting UTC value.

## Files

- `src/builtins/date.js`
- `src/runtime/date.js`
- `test/date-builtins.test.js`

## Validation

- Focused Date builtins, date arithmetic, and repository-invariants suites:
  passed.
- `npm run typecheck`: passed.
- `npm run lint -- --quiet`: passed.
- Final `npm test && npm run typecheck && npm run lint -- --quiet && git diff
  --check`: passed (exit 0).

## Self-review

- Confirmed methods validate Date branding before conversion.
- Confirmed setters preserve UTC-only state, use the host only for local
  conversions, and clip all computed times.
- Confirmed no host Date supplies expected test values.
- No remaining concerns.

## Fix round 1

### Root cause and implementation

- `dateFields` converted a recovered invalid local setter time through
  `LocalTime(0)`. Recovery now takes calendar defaults directly from `+0`;
  conversion to UTC remains in `setDateFields`.
- Annex B `setYear` now recovers invalid dates and applies its two-digit range
  after `ToInteger`.
- Existing invalid-setter coverage now correctly treats `setYear` as a recovery
  setter and uses the hand-derived west-of-UTC `setFullYear` result.

### Tests added or corrected

- `test/date-builtins.test.js`
  - west-of-UTC invalid local `setFullYear` recovery;
  - invalid `setYear` recovery;
  - fractional `setYear(99.5)` and `setYear(-0.5)`;
  - explicitly supplied `undefined` optional setter field;
  - setter clipping beyond the `TimeClip` limit;
  - a deterministic DST fall-back repeated-hour local `setHours` case.

All values are literal, hand-derived milliseconds; no expected value uses host
`Date`.

### TDD evidence

- **RED command:** `node test/run-node.js test/date-builtins.test.js`
- **RED output:** the corrected existing recovery test failed with
  `946684800000` instead of `946677600000`; the new west-of-UTC full-year test
  failed with `978307200000` instead of `946692000000`; and invalid `setYear`
  returned `NaN` instead of `946692000000`. These reproduce findings 1–3.
- The new finding-4 coverage cases (explicit `undefined`, clipping, and
  repeated-hour fall-back) passed against the pre-fix implementation because
  those behaviors already worked; this was recorded rather than manufacturing
  a RED failure.
- **GREEN command:** `node test/run-node.js test/date-builtins.test.js`
- **GREEN output:** 23/23 Date builtins cases passed.

### Validation

- `node test/run-node.js test/date-arithmetic.test.js` — 4/4 passed.
- `node test/run-node.js test/node/repository-invariants.test.js` — 14/14
  passed.
- `npm run typecheck` — passed.
- `npm run lint -- --quiet` — passed.
- `npm test` — passed (exit 0).
