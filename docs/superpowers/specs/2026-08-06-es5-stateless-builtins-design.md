# ES5 Stateless Built-ins Design

## Goal

Implement the deterministic, host-independent remainder of ES5's standard
library: Math, JSON, and global conversion/URI functions.

## Architecture

Each realm owns a Math object, JSON object, and native global functions. Guest
coercion and errors use engine operations. Math constants and functions normalize
signed zero, NaN, infinities, argument order, and implementation-defined
approximations where ES5 permits them. JSON uses an engine serializer/parser,
never host `JSON`, so property access, replacers, revivers, cycles, indentation,
and abrupt completions remain guest-observable. URI functions operate on UTF-16
and UTF-8 explicitly.

## Scope

- all ES5 Math constants/functions
- `JSON.parse` with reviver and `JSON.stringify` with replacer/space/toJSON
- `parseInt`, `parseFloat`, `isNaN`, `isFinite`
- `encodeURI`, `decodeURI`, `encodeURIComponent`, `decodeURIComponent`
- Annex B `escape` and `unescape`
- pinned Test262 expansion and portable-runtime equivalence

## Acceptance Criteria

All CI contracts pass, newly pinned records have zero unexpected failures, and
results remain deterministic across Node, JSC, and browsers.
