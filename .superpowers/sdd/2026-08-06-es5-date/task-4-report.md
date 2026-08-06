# Task 4: Formatting and JSON

## Implementation

- Added deterministic, engine-owned local, UTC, and ISO Date formatters using
  the existing calendar arithmetic and injected timezone adapter.
- Installed ES5 Date formatting methods, `valueOf`, and generic `toJSON`.
  `toGMTString` is the same function object as `toUTCString`.
- Made `Date()` reuse the local date-time formatter and preserved Date cloning
  once Date's standard conversion methods are installed.

## TDD cycles

### 1. Local, locale, UTC, and value formatting

- **RED command:** `node test/run-node.js test/date-builtins.test.js`
- **RED output:** `Date formatting methods render deterministic local and UTC
  strings` failed with `Expected [object Object] ...`; the new prototype methods
  were not installed.
- **GREEN command:** `node test/run-node.js test/date-builtins.test.js`
- **GREEN output:** all Date builtin cases, including the new formatter case,
  passed.
- **GREEN change:** added the deterministic local/date/time/UTC formatting
  helpers and installed `toString`, date/time/locale variants, `toUTCString`,
  `toGMTString`, and `valueOf`.

### 2. Invalid Date, ISO, and UTC alias behavior

- **RED command:** `node test/run-node.js test/date-builtins.test.js`
- **RED output:** `Date formatters handle invalid values, ISO extended years,
  and UTC aliases` failed with `Expected [object Object] ...` because
  `toISOString` was absent.
- **GREEN command:** `node test/run-node.js test/date-builtins.test.js`
- **GREEN output:** all Date builtin cases passed.
- **GREEN change:** added `toISOString`, including invalid-time `RangeError`,
  milliseconds, and signed six-digit ISO extended years.

### 3. Generic `toJSON`

- **RED command:** `node test/run-node.js test/date-builtins.test.js`
- **RED output:** `Date toJSON is generic and checks its numeric primitive
  before toISOString` failed with `Expected [object Object] ...`; `toJSON` was
  absent.
- **GREEN command:** `node test/run-node.js test/date-builtins.test.js`
- **GREEN output:** all Date builtin cases passed.
- **GREEN change:** added ES5 generic `toJSON`: `ToObject`, number-hint
  `ToPrimitive`, finite-number null short circuit, callable `toISOString`
  lookup, and invocation with the original receiver.

## Tests added

- Literal deterministic local strings with both `GMT+0130` and `GMT-0500`.
- Date/time/locale variants, UTC and GMT strings, and callable `Date()`.
- Invalid Date strings, incompatible receivers, ISO `RangeError`, millisecond
  precision, negative and extended ISO years, and UTC/GMT identity plus
  descriptor attributes.
- Generic `toJSON` invalid-null behavior, custom `toISOString`, ordering, and
  non-callable primitive-wrapper error behavior.

## Files

- `src/runtime/date.js`
- `src/builtins/date.js`
- `test/date-builtins.test.js`

## Validation

- `node test/run-node.js test/date-builtins.test.js` — passed.
- `node test/run-node.js test/date-arithmetic.test.js` — passed.
- `node test/run-node.js test/node/repository-invariants.test.js` — passed.
- `npm run format` — passed.
- `npm run typecheck` — passed.
- `npm run lint -- --quiet` — passed.
- `npm test` — passed.
- `git diff --check` — passed.

## Self-review

- Confirmed local formatting gets its UTC offset exclusively from `DateHost`;
  no host Date or locale formatter is used.
- Confirmed formatter methods validate Date receivers, while `toJSON` remains
  generic and performs primitive conversion before looking up `toISOString`.
- Confirmed invalid strings and ISO failures follow their separate ES5 results,
  and `toGMTString` shares `toUTCString` identity.
- No remaining concerns.

## Fix round 1: emitted-string parsing round trips

### Root cause

- `parseDateString` recognized ISO input and only the engine's local
  `toString` grammar. It had no branch for `toUTCString`'s comma-separated,
  GMT-suffixed grammar, so parsing an emitted UTC string returned `NaN`.
- The local display grammar accepted exactly four unsigned year digits, while
  the formatter emits negative years with a sign and positive extended years
  without one.

### TDD cycle

- **RED command:** `node test/run-node.js test/date-builtins.test.js`
- **RED output:** `Date.parse round-trips emitted UTC and extended local display
  strings` failed with `Expected NaN to be the same value as 0`.
- **GREEN command:** `node test/run-node.js test/date-builtins.test.js`
- **GREEN output:** all Date builtin cases passed, including
  `Date.parse round-trips emitted UTC and extended local display strings`.
- **GREEN change:** added an engine-owned UTC-display parser branch, widened
  the local-display year grammar to formatter-emitted signed/extended years,
  and shared display-field validation and UTC-offset application.

### Tests added

- Literal millisecond-zero UTC round trips at epoch (`0`) and a nontrivial
  leap-day instant (`951827696000`).
- Local `toString` round trips for formatter-emitted negative year `-0001`
  and extended year `10000` with the deterministic zero-offset adapter.

### Validation

- `node test/run-node.js test/date-builtins.test.js` — passed.
- `node test/run-node.js test/date-arithmetic.test.js` — passed.
- `node test/run-node.js test/node/repository-invariants.test.js` — passed.
- `npm run typecheck` — passed.
- `npm run lint -- --quiet` — passed.
- `npm run format` — passed.
- `npm test` — passed.
- `git diff --check` — passed.
