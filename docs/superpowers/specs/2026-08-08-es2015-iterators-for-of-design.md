# ES2015 Iterators and `for`-`of` Design

## Goal

Add the ES2015 iteration protocol — the `Iterator`/`Iterable` abstract
operations, `%IteratorPrototype%`, the Array and String iterators reached
through `@@iterator`, and the `for`-`of` statement — on top of the merged
Symbol/Agent, lexical-declaration, and object/function runtimes, without
disturbing ES5.1 behaviour or realm/agent isolation.

## Architecture

The protocol is expressed as three layers that mirror the specification's own
split.

**Abstract operations (`src/runtime/iterator.js`).** ECMA-262 §7.4's
`GetIterator`, `IteratorNext`, `IteratorComplete`, `IteratorValue`,
`IteratorStep`, `IteratorClose`, and `CreateIterResultObject`, plus the §7.3.9
`GetMethod` they depend on. An Iterator Record is a plain host object
`{ iterator, nextMethod, done }`. These operations call guest functions through
the existing `callFunction` boundary and raise guest-visible failures as
`GuestErrorSignal` (materialised into real error objects at the realm-aware
boundaries), so they compose with the engine's completion model rather than
inventing a parallel one.

`IteratorClose` is the subtle one. The engine represents completions two ways —
value-carrying records and host-thrown signals — so the operation takes a single
`completionIsThrow` bit instead of a completion record. When the consumer is
already unwinding on a throw, §7.4.6 step 5 says the original throw always wins,
so every failure of `return` (absent, throwing, or non-object result) is
swallowed. Otherwise `return`'s own abrupt outcome replaces the completion: a
throw propagates (step 6) and a non-object result is a `TypeError` (step 7). An
absent `return` is a no-op either way.

**Iterator intrinsics and built-ins (`src/runtime/iterator-object.js`,
`src/builtins/iterator.js`).** `%IteratorPrototype%` carries the `@@iterator`
method that returns `this`, and is the prototype of `%ArrayIteratorPrototype%`
and `%StringIteratorPrototype%`. `ArrayIterator` and `StringIterator` are
`EngineObject` subclasses holding the spec's internal slots
(`[[IteratedObject]]`/`[[ArrayIteratorNextIndex]]`/`[[ArrayIterationKind]]`, and
`[[IteratedString]]`/`[[StringIteratorNextIndex]]`). `Array.prototype.values`,
`keys`, and `entries` build array iterators; `Array.prototype[@@iterator]` is the
_same function object_ as `Array.prototype.values` (§23.1.3.36); `String.prototype[@@iterator]`
builds a string iterator that yields whole code points, combining a well-formed
surrogate pair into one two-code-unit result.

These intrinsics are per-realm, but the `@@iterator` key they are installed
under is the agent-owned well-known symbol, so iteration honours the same
cross-agent protocol ownership Symbols established: a value's `@@iterator` is
looked up with its own agent's symbols.

**Syntax (`src/parser.js`, `src/evaluator/static-semantics.js`,
`src/evaluator/statements.js`).** The parser stops rejecting `ForOfStatement`
and treats a `for`-`of` body as an iteration-statement body (so a
`FunctionDeclaration` there is an early error). The two statement-walk switches
in static semantics learn `ForOfStatement` alongside `ForInStatement` so its
var-scoped and block-nested declarations are collected during declaration
instantiation. The evaluator adds `evaluateForOfStatement`, implementing
§14.7.5.7 `ForIn/OfBodyEvaluation` for the `iterate` kind:

- A lexical (`let`/`const`) head evaluates the iterable expression under a TDZ
  environment whose loop bindings are uninitialised, exactly like `for`-`in`.
- Each iteration of a lexical head gets a _fresh_ declarative environment with
  its binding initialised to the yielded value, so closures capture per-iteration
  values; a `var` head or a bare assignment target reuses the `for`-`in` binding
  path (`assignForInTarget`).
- After a successful `IteratorStep`, any abrupt completion from binding the value
  or running the body closes the iterator: a host throw closes with the throw in
  hand (original throw wins) and re-raises; an owned `break`, a `return`, or a
  `break`/`continue` to an outer label closes with a non-throw completion (so a
  throwing `return` can replace it). A normal completion or an owned `continue`
  keeps iterating and never closes. A throw out of `IteratorStep`/`IteratorValue`
  itself propagates _without_ closing, because the iterator already faulted.

## Scope

- §7.4 iterator abstract operations and §7.3.9 `GetMethod`
- `%IteratorPrototype%`, `%ArrayIteratorPrototype%`, `%StringIteratorPrototype%`
- `Array.prototype.values`/`keys`/`entries`/`@@iterator`,
  `String.prototype[@@iterator]`, and their required property descriptors and
  `@@toStringTag` tags
- `for`-`of` parsing, static semantics, and evaluation with per-iteration
  lexical bindings, TDZ head evaluation, and full `IteratorClose` ordering
- Cross-agent `@@iterator` ownership
- Test262: `featureAreas` claims for the built-in iterator directories and the
  `for`-`of` language tests, backed by the existing `Symbol.iterator`/
  `Symbol.toStringTag` probes, and the resulting pinned records

## Out of scope

Generators and `yield`, spread/rest, array and object destructuring patterns,
`Map`/`Set`/`TypedArray` and their iterators, `Reflect`, async iteration, and
the other well-known-symbol protocols. `for`-`of` over a destructuring target is
not reached because the destructuring grammar is still rejected by the parser.

## Acceptance Criteria

The iterator protocol drives `for`-`of` over arrays, strings, and custom
iterables; per-iteration lexical bindings are captured independently; abrupt
completions close the iterator in the specified order with the specified error
precedence; built-in iterators are realm-correct and agent-correct; every newly
pinned Test262 record passes; Node, Chromium, and JSC reports stay equivalent;
ES5.1 behaviour is unchanged; all CI contracts pass.
