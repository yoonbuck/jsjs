# ES5 Control Flow and Strict Semantics Design

## Goal

The second milestone closes the highest-leverage language gaps before expanding
the standard library: exception handling, remaining expression operators,
switch and labelled control flow, and runtime strict-mode semantics.

## Architecture

The evaluator retains explicit completion records. `try`, `catch`, and
`finally` transform or preserve those records exactly as ES5 requires.
Labelled statements attach label sets to iteration and switch evaluation so
`break` and `continue` are resolved without host exceptions.

Strictness is derived during declaration instantiation from directive prologues
and propagated through execution contexts, function objects, references, and
calls. Parser strictness and runtime strictness therefore share one source of
truth. Guest runtime errors remain throw completions containing engine-owned
error objects rather than leaking host exceptions.

Expression support adds update and compound assignment through references so
each base and property key is evaluated once. `in` delegates to engine
`[[HasProperty]]`; `instanceof` delegates to an explicit engine
`[[HasInstance]]` operation.

## Scope

- `try`, `catch`, `finally`, and `throw` completion interaction
- `switch`, labelled statements, labelled break, and labelled continue
- prefix/postfix `++` and `--`
- all ES5 compound assignment operators
- `in` and `instanceof`
- script and function directive prologues
- strict assignment, deletion, `this`, arguments, duplicate parameter, and
  restricted identifier behavior
- engine-owned `Error`, `TypeError`, `ReferenceError`, `SyntaxError`, and
  `RangeError` values for guest failures reached by this milestone

Object literal getters and setters are removed from the limitations list because
they are already implemented.

## Testing

Every behavior is introduced with focused local tests, including abrupt
completion precedence in nested `finally` blocks and side-effect ordering for
updates and compound assignments. Differential ES5 cases compare guest-visible
results with a conforming native runtime. Test262 coverage expands through
explicitly pinned strict-mode, exception, switch, label, update, assignment,
`in`, and `instanceof` groups. Node, JavaScriptCore, and browser adapters must
produce equivalent reports.

The milestone is complete when all repository checks pass, the newly supported
Test262 selection has zero unexpected failures, and strict variants execute with
runtime strictness rather than duplicating non-strict behavior.

