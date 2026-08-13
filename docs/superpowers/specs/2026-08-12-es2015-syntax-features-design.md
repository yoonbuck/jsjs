# ES2015 Syntax Features Design

## Goal

Implement issue #25's principal ES2015 syntax forms on top of the runtime
foundations delivered by #26:

- arrow functions;
- classes;
- template literals, including tagged templates;
- destructuring declarations, assignments, and parameters;
- default parameters, rest parameters, and iterable spread; and
- enhanced object literals and computed property names.

The implementation must preserve ES5 behavior, use the engine's existing
realm, environment, function, property-key, Symbol, and iterator abstractions,
and run unchanged in Node, Chromium, and JavaScriptCore. Unsupported neighboring
syntax remains an explicit parse-time error throughout the incremental rollout.

## Chosen Approach

Add shared specification-level semantic kernels and enable syntax vertically.
Acorn continues to produce an ES2015 ESTree AST. The parser validation boundary
admits only AST shapes whose evaluator semantics are implemented. Shared
binding-pattern, iterator-consumption, argument-list, function-instantiation,
and construction machinery then serves every syntax family.

Two alternatives are rejected:

- Implementing each syntax node inline would duplicate destructuring,
  default-initializer, iterator-closing, and function-metadata behavior and make
  evaluation-order defects likely.
- Lowering ES2015 syntax to the existing ES5 AST cannot preserve non-simple
  parameter environments, lexical arrow `this`/`arguments`/`super`, iterator
  closing, class descriptors, or derived construction. It would also bypass the
  runtime foundations this milestone is required to use.

## Parser Capability Boundary

`src/parser.js` remains configured with `ecmaVersion: 6` and
`sourceType: "script"`. Its post-Acorn validation becomes a recursive
capability check over node types **and their relevant properties**. A node type
is not sufficient evidence of support: the validator checks function flags and
parameter shapes, property `kind`/`method`/`computed`/`shorthand` flags, class
element kinds and modifiers, rest placement, assignment-pattern placement,
spread context, and every other shape distinction on which evaluator support
depends.

Each implementation task removes only its newly supported shapes from the
rejection boundary. Until that task lands, the same forms continue to produce a
normalized `SyntaxError` naming the unsupported construct. The validator walks
custom parser output iteratively, remains cycle-safe, and never relies on host
recursion.

The following remain explicitly unsupported after issue #25:

- generators and `yield`;
- async functions and `await`;
- modules, imports, exports, and dynamic import;
- `new.target`;
- object rest and object spread, which are post-ES2015;
- class fields, private names, static blocks, decorators, and other post-ES2015
  class forms;
- optional chaining and other later expression forms;
- ES2015 binary/octal numeric literals and Unicode code-point escapes, because
  issue #25 does not claim those lexical additions; and
- any AST shape not explicitly covered by the capability table.

Acorn itself rejects some later-edition forms at `ecmaVersion: 6`. Defensive
entries remain in the capability policy so raising the parser edition cannot
silently broaden the guest grammar.

## Shared Pattern Semantics

A focused evaluator module owns the common algorithms for binding and assignment
patterns. Its public responsibilities are:

- return `BoundNames` in source order, preserving duplicates where the
  specification does;
- initialize declaration or parameter bindings in a supplied environment;
- assign through existing engine `Reference` and `PutValue` operations;
- evaluate defaults only when the incoming value is `undefined`;
- evaluate computed object keys and assignment targets in specification order;
- consume array patterns through the #26 iterator operations, including
  elisions and array rest; and
- close iterators with the correct abrupt-completion precedence.

Nested `ObjectPattern`, `ArrayPattern`, `AssignmentPattern`, and array
`RestElement` forms reuse this one recursive semantic kernel. Object patterns
perform ordinary property access through engine objects and property keys.
Object rest remains rejected. Assignment patterns accept only specification
assignment targets and never convert an invalid target into a declaration.

Variable declarations use the same pattern kernel in two modes:

- `var` resolves and writes the already-instantiated bindings; and
- `let`/`const` initializes the uninitialized bindings created by declaration
  instantiation.

`for`/`for-in`/`for-of` heads use the same binding entry points, preserving
their existing per-iteration lexical environments and iterator-close behavior.

## Function Parameters and Instantiation

`EngineFunction` retains flattened bound names only where existing consumers
need names, and receives explicit metadata for formal-parameter ASTs,
`ExpectedArgumentCount`, simple versus non-simple parameter lists, arguments
mapping eligibility, `this` mode, constructibility, and prototype creation.
Function `length` is the number of parameters before the first default or rest
parameter, with destructuring parameters counting as one.

`FunctionDeclarationInstantiation` is generalized around ES2015's environment
structure:

- Simple parameter lists retain the current compatible activation path and may
  create a mapped arguments object for a non-strict function.
- A non-simple parameter list creates the specification-required parameter
  environment and, when required, a distinct body variable environment.
  Defaults execute left to right while earlier parameter bindings are visible
  and later ones remain uninitialized. Body `var` and function declarations
  follow the ES2015 copy/separation rules rather than being inserted into the
  parameter record.
- Rest parameters receive a realm-owned `EngineArray`.
- Destructuring parameters route through the shared pattern initialization
  kernel.
- Non-simple parameter lists always receive an unmapped arguments object.
  Arrow functions create no own `arguments` binding.

Acorn's early errors remain authoritative for duplicate parameters where
forbidden, lexical collisions, and a `"use strict"` directive in a function
with a non-simple parameter list. Parser regressions pin those rules so later
capability changes cannot weaken them.

## Spread and Iterable Consumption

One shared iterable-to-list helper drives:

- spread arguments in calls;
- spread arguments in construction;
- array-literal spread; and
- default derived-constructor forwarding.

Ordinary and spread elements evaluate left to right. Each spread operand uses
`GetIterator`, `IteratorStep`, and `IteratorValue` from #26. Abrupt completion
uses the existing iterator-close rules and never delegates to host iteration.
Array results are realm-owned `EngineArray` instances. Object spread remains a
parse-time error.

## Arrow Functions

Arrow functions use the ordinary engine function execution protocol with an
explicit lexical-`this` mode and no constructor or prototype. They support
identifier, default, rest, and destructuring parameters plus expression and
block bodies. Expression bodies produce an implicit return completion.

An arrow has no own `[[HomeObject]]`, `this`, `arguments`, or `super` binding.
Resolution of lexical `this`, `arguments`, and `super` comes from the enclosing
execution/function environment. The implementation may carry immutable
enclosing-context metadata on the runtime function object, but that metadata
must not be exposed or described as an arrow-owned `[[HomeObject]]`. In
particular, an arrow nested in a method resolves `super` using the enclosing
method's environment and home object.

Arrows are non-constructible, expose no own `prototype`, obey lexical strictness,
and participate in inferred function names for declarations, assignments,
properties, and defaults. `new.target` remains rejected even inside arrows.

## Enhanced Object Literals

Object literal evaluation supports:

- shorthand data properties;
- concise methods;
- getters and setters;
- computed property names producing string or Symbol keys; and
- inferred names for anonymous function and class values.

Property definitions occur left to right through `EngineObject#defineOwnProperty`
with ES2015 descriptors. Computed keys are evaluated exactly once before their
values. Concise methods and accessors are non-constructible and carry the object
as their `[[HomeObject]]`, reusing the #26 `super` property-reference path.
Computed Symbol method names receive specification-compatible names.

The ES2015 object-literal `__proto__` special form is handled only for a
non-computed colon property. It updates the created object's prototype when its
value is an object or `null`; other values are ignored. Duplicate special
`__proto__` definitions remain Acorn early errors. Shorthand, method, and
computed `"__proto__"` forms define ordinary properties.

## Template Literals

Untagged template literals evaluate substitutions left to right and concatenate
cooked segments and `ToString`-converted values.

Tagged templates evaluate the tag reference first, then obtain a template object
for the parse site, then evaluate substitutions left to right, and finally call
the tag with the template object followed by substitutions. The template object
and its `.raw` object are realm-owned arrays with the ES2015 descriptors and are
non-extensible/frozen.

Template identity is cached by source parse site in the realm/execution domain:
repeated evaluation of the same parsed site in one realm returns the same
template object, while a distinct site or realm receives a distinct object.
Cache keys are AST node identity scoped by the realm, so direct repeated
execution can reuse identity without leaking objects between realms. Cooked and
raw arrays are built once and reused. Invalid cooked escapes in tagged
templates follow the Acorn ES6 AST representation; untagged invalid escapes
remain syntax errors.

## Classes and Construction

`ClassDeclaration` is a lexical declaration and `ClassExpression` optionally
creates an inner immutable name binding. Class name bindings are created
uninitialized before evaluation, so the class name and `extends` expression
observe the required temporal dead zone. Class bodies and every constructor and
method execute in strict mode regardless of the surrounding source.

Class evaluation:

1. evaluates the optional heritage expression;
2. validates that a non-null heritage value is constructible and derives the
   instance and constructor prototype chains;
3. creates the class constructor and its prototype object with exact ES2015
   descriptors;
4. evaluates computed element names in source order; and
5. defines instance and static methods/accessors with the appropriate
   `[[HomeObject]]`, inferred names, strictness, and non-constructibility.

The parser and evaluator enforce constructor and method restrictions: one
constructor at most, no accessor/generator constructor, no static
`"prototype"` method, no instance `"constructor"` data method outside the
constructor role, and Acorn's syntactic restrictions on `super`. Generators
remain rejected even when written as class or object methods.

`EngineFunction` construction is generalized rather than bypassed:

- Calling a class constructor without `new` throws a guest `TypeError`.
- A base constructor allocates and binds `this` before its body. Returning an
  object replaces the instance; any other return keeps the allocated instance.
- A derived constructor begins with uninitialized `this`. Access before
  initialization throws. A syntactically valid `super(...)` constructs the
  superclass with the active new-target/constructor domain and initializes
  `this` exactly once. A second initialization attempt throws.
- A derived constructor may return an object without calling `super`. Returning
  `undefined` requires initialized `this`; returning any other primitive throws.
- The default base constructor behaves as an empty constructor.
- The default derived constructor forwards all received arguments to `super`
  through the shared argument/construct path.

`super(...)` is accepted only where Acorn marks it syntactically valid and the
evaluator has an active derived-constructor environment. `super` property
access continues to use `[[HomeObject]]` and preserves the receiver. This
milestone does not expose `new.target`; the construction protocol may carry an
internal active constructor/new-target value solely to implement correct
derived allocation.

## Static Semantics and Declaration Integration

The existing iterative static-semantics walks are extended so:

- `BoundNames` descends through every supported binding pattern;
- class declarations participate in lexical declaration lists;
- class declarations are instantiated as immutable uninitialized bindings and
  initialized only after successful class evaluation;
- function/var/lexical conflict checks use all pattern-bound names; and
- declaration walks preserve source order, duplicate behavior, cycle safety,
  and host-stack independence.

No syntax evaluator receives a declaration that was not accounted for by the
same static-semantics functions used by global, eval, function, block, switch,
try, and loop instantiation.

## Error Handling and Portability

Guest-visible runtime failures use `GuestErrorSignal`, `ThrowSignal`, references,
and completion records. No broad catch converts engine defects into guest
success or guest errors. Iterator consumers close only where the specification
requires it and preserve throw precedence. Parse failures remain normalized
host `SyntaxError`s at the embedding boundary and realm-local guest
`SyntaxError`s through `eval` and dynamic `Function`.

All source remains plain ES2020 JavaScript with strict JSDoc checking. Engine
source imports no host modules and does not use host `eval`, `Function`,
iteration, classes, or objects to implement guest semantics. Realm and Agent
ownership follows #26.

## Incremental TDD and Reviews

Implementation proceeds in vertical tasks:

1. recursive parser capability gating and static pattern semantics;
2. destructuring declarations and assignment;
3. non-simple parameters, defaults, and rest;
4. iterable spread;
5. enhanced object literals and computed properties;
6. template literals and tagged-template caching;
7. arrow functions and lexical environment behavior;
8. classes, methods, and construction;
9. Test262 policy, generated artifacts, and documentation; and
10. integration, portability, and release.

Every production task starts with focused portable regressions that fail for the
missing behavior. A fresh implementer handles each task. Each task receives a
specification-compliance review and a code-quality review, with accepted
findings reproduced and fixed test-first before proceeding.

Pinned Test262 coverage is added by exact feature probes and narrowly scoped
feature-area prefixes. Unsupported neighboring tags and syntax remain excluded.
Only targeted local Test262 selections run during implementation. Generated
selection, report, and conformance artifacts are produced with `TZ=UTC`.
Pinned CI supplies broad Test262 coverage.

## Release Gates

Before issue #25 can close:

- focused parser/evaluator suites and every newly selected Test262 record pass;
- Node, Chromium, and JavaScriptCore portable suites are equivalent;
- formatting, lint, JSDoc type checking, repository invariants, selection
  determinism, exclusions, CI contracts, and benchmark smoke pass;
- a maximum-capability GPT-5.6-family whole-branch review has no unresolved
  high-confidence correctness finding;
- required GitHub CI is green;
- the pull request is squash-merged and its branch deleted; and
- issue #25 and roadmap #24 contain final evidence, issue #25 is closed, and
  issue #28 is reported as newly unblocked.

