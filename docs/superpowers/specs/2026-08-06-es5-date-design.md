# ES5 Date Design

## Goal

Implement the ES5 Date constructor, parsing, time arithmetic, local/UTC accessors,
mutators, formatting, and JSON integration.

## Architecture

`EngineDate` stores a single clipped UTC millisecond value. Calendar arithmetic
uses explicit ES5 abstract operations (`Day`, `TimeWithinDay`, `MakeDay`,
`MakeTime`, `MakeDate`, `TimeClip`) rather than host Date objects. A host adapter
provides only current time and local timezone offset; tests inject a deterministic
clock/timezone.

ISO parsing and required legacy forms use engine parsers. Formatting is built from
calendar fields, with implementation-dependent local timezone names isolated
behind the host adapter.

## Scope

- Date call/construct overloads and `Date.now`, `Date.parse`, `Date.UTC`
- all ES5 getter/setter methods in local and UTC forms
- `toString`, date/time/locale variants, `toUTCString`, `toISOString`,
  `toJSON`, and `valueOf`
- invalid dates, extended years, clipping, DST offset boundaries, and realm
  isolation
- pinned Test262 expansion and deterministic portable tests

## Acceptance Criteria

All CI contracts pass, newly pinned records have zero unexpected failures, and
clock/timezone-dependent tests are deterministic across Node, JSC, and browsers.
