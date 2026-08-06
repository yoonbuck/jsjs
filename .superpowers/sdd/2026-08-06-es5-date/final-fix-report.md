# ES5 Date Final Fix Report

## Scope

Completed the requested final Date fix wave only. No Test262 subset, coverage
report, or generated coverage block changed: the final upstream run remained
369/369 files and 729/729 variants passing.

## TDD evidence

Each behavior change was tested against production code before its fix:

| Behavior | Genuine RED observed | GREEN coverage |
| --- | --- | --- |
| Signed expanded ISO years | `Date.parse(toISOString())` returned `false` for the negative/positive six-digit-year round trips. | Both `-000001` and `+010000` round-trip. |
| Negative-zero expanded year | `Date.parse("-000000-03-31T00:45Z")` was finite instead of `NaN`. | The prohibited `-000000` form is rejected. |
| Non-finite local conversion | Local setters returned `NaN` but left the old `timeValue` intact. | All local setter paths store `NaN`. |
| Fractional adapter offset | Output was `GMT+0130.5`, and parsing it returned `NaN`. | Offsets truncate toward zero to integer minutes; the emitted text parses to the original instant. |
| Boundary DST probe | A local boundary constructor returned `NaN` because the adapter received a clipped `NaN` probe. | Both ±8.64e15 boundary instants survive after an out-of-range preliminary probe. |
| Local zone label | Non-UTC local output contained `(UTC)`. | Local date/time output uses `(Local)`, and emitted strings parse back. |

## Changes

1. The ISO parser now permits only unsigned four-digit or signed six-digit
   years, retains all existing field checks, and rejects the prohibited
   `-000000` expanded year.
2. Corrected the requested ES5 section citations and changed
   `EngineDate.defaultValue()`'s omitted hint to `default`, which maps to
   Date's String order.
3. Documented core ES5 Date APIs separately from Annex B `getYear`, `setYear`,
   and `toGMTString`.
4. Made non-finite local timezone conversion invalidate the stored Date value.
5. Explicitly normalize fractional injected offsets by truncating toward zero
   before calculating/displaying local formatter parts.
6. Deferred `TimeClip` until after `utcFromLocalTime`'s adapter lookup; its two
   callers still clip the final instant.
7. Changed deterministic local labels from `(UTC)` to `(Local)` and updated the
   parser for emitted strings.
8. Removed the unreachable `formatISOString` invalid branch and unused
   `parseDateString` host parameter.

`EngineDate.defaultValue()` is an internal runtime method, not a guest-visible
API, and every production `toPrimitive` call passes an explicit preferred
type. Therefore no artificial guest-behavior test was added for that one-line
omitted-argument default correction.

## Validation

- Focused `test/date-builtins.test.js`: passed.
- Date arithmetic and repository invariants: passed.
- `npm run test262:upstream` and `npm run test262:upstream:check`: passed
  (369/369 files; 729/729 variants).
- `npm run vendor:check`, `npm run ci:check`, `npm run typecheck`,
  `npm run lint`, and `npm run format`: passed.
- `npm run ci:contract`: all 19 contract checks passed.
- `npm test`: passed.
- `git diff --check`: passed.
- Final read-only review found no significant issue in the current final-fix
  diff.

## Scope note

The supplied topic branch predates three unrelated `origin/main` commits. It
was intentionally not rebased because the request constrained this wave to the
listed Date findings.
