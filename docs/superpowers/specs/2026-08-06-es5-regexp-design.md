# ES5 RegExp Design

## Goal

Implement ES5 regular expressions and integrate them with String pattern methods.

## Architecture

Guest regular expressions use an engine-owned `EngineRegExp` object containing
compiled pattern state, flags, source, and `lastIndex`. Matching operates on
UTF-16 code units and returns engine arrays with `index` and `input` properties.
The implementation may use a host regex only behind a compatibility layer that
validates ES5 grammar and normalizes every observable result; unsupported modern
syntax is rejected before compilation.

String `match`, `replace`, `search`, and `split` dispatch through guest RegExp
operations, preserving coercion order, captures, zero-width progress, replacement
tokens, global `lastIndex`, and abrupt completions.

## Scope

- RegExp call/construct semantics, flags, source, global/ignoreCase/multiline
- `exec`, `test`, `toString`, and writable `lastIndex`
- ES5 pattern and escape validation
- String integration including captures and replacement callbacks
- pinned Test262 expansion and portable-runtime equivalence

## Acceptance Criteria

All CI contracts pass, newly pinned RegExp/String records have zero unexpected
failures, and Node/JSC/browser reports are equivalent.
