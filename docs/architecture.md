# Architecture

jsjs is an ES5.1 JavaScript engine — extended with ES2015 lexical declarations,
iteration, arrows, classes, computed names, destructuring, non-simple
parameters, iterable spread, template literals, and synchronous generators —
written in plain ES2020 JavaScript with JSDoc types. The same source
runs in Node, in a browser, and in the JavaScriptCore (`jsc`) shell: nothing in
`src/` imports a host module, and guest behaviour never leans on host `eval`,
`Function`, or host objects.

## Source flow

Source enters through `evaluateScript(realm, source)`, which:

1. **Parses** via `src/parser.js` — Acorn configured at `ecmaVersion: 6`,
   `sourceType: 'script'`. Its ES2015 capability pass admits lexical declarations,
   block-level function declarations, `for`-`of`, arrows, class
   declarations/expressions and ES2015 methods,
   computed property names, destructuring, default/rest parameters, array/call/
   construction spread, template/tagged-template expressions, synchronous
   generator declarations/expressions/object/class methods, and `yield`/`yield*`
   inside their bodies. Acorn supplies redeclaration early errors; the engine
   validates each supported AST shape before evaluation. It still rejects
   async functions/generators and `await`, modules, `new.target`, object
   rest/spread, class fields/private names/static blocks/decorators, binary/octal
   literals, and `\u{…}` escapes. A top-level rejection is a host `SyntaxError`;
   `eval`, dynamic `Function`, and dynamic `%GeneratorFunction%` convert it into
   a catchable guest `SyntaxError`.
2. **Hoists** via `src/evaluator/declarations.js` —
   `globalDeclarationInstantiation` (ES2015 §15.1.8) walks the AST, using the
   spec's static-semantics name walks in `src/evaluator/static-semantics.js` to
   bind every top-level function declaration and `var` name onto the realm's
   global object and every top-level `let`/`const` name into the global
   environment's declarative record, checking all names before creating any
   binding so a conflict leaves the global scope untouched.
3. **Evaluates** via `src/evaluator/statements.js` —
   `evaluateStatementList` walks the body left to right with explicit completion
   propagation, entering a fresh lexical environment for each block, `switch`
   case block, `try` part, and loop iteration that declares `let`/`const`.

Expression evaluation dispatches the admitted forms in
`src/evaluator/expressions.js`. `patterns.js` supplies declaration,
parameter, and assignment pattern algorithms; `iteration.js` consumes spread
and array-pattern iterators; `classes.js` owns class definition/construction;
and `property-name.js` evaluates computed keys once before their definition. A
yield-bearing generator body instead dispatches typed expression, pattern,
definition, and control-flow frames through `generator-machine.js`; classified
yield-free subtrees bridge back to the same synchronous evaluators. This keeps
the parser's shape gate and the evaluator's semantic paths aligned.

A well-formed script produces either a `'normal'` completion or a `'throw'`
completion carrying the thrown guest value. Guest throws are values, not host
exceptions; engine defects and unimplemented operations remain host errors.

## Parser dependency

`src/parser-dependency.js` is the engine's only dependency boundary. It
re-exports `parse` and `Parser` from `vendor/acorn/acorn.mjs`. Every other file
in `src/` imports its parser through this module, so exactly one module names the
vendored build and the rest of the engine is insulated from how it is resolved.

`vendor/acorn/` is a project-owned directory produced by `tools/vendor/sync.js`
from the version pinned in `package.json`. That indirection keeps a plain
relative import working in all three hosts: bare specifiers need Node resolution,
browsers would need an import map, and the `jsc` shell supports neither.
`vendor/` is generated rather than committed; `npm install` populates it through
`prepare`.

## Agents and realms

An `Agent` (`src/runtime/agent.js`) owns the only state ECMA-262 shares
_between_ realms rather than within one: the well-known symbols (§6.1.5.1) and
the `GlobalSymbolRegistry` (§19.4.2.1). Realms handed the same agent
interoperate through those — `@@iterator` matches, `Symbol.for('x')` agrees —
and realms on different agents share nothing at all.

That boundary is an ownership decision, not just a spec one. `Symbol.for`
interns a **guest-controlled** string, so a process-global registry would
accumulate guest data for the lifetime of the process, outliving every realm
that produced it and reachable from no handle the embedder could drop. An
agent is an ordinary object: drop it and the registry becomes garbage.

```js
import { createAgent, createRealm } from './src/index.js';

const agent = createAgent();
const a = createRealm({ agent }); //  these two interoperate
const b = createRealm({ agent });
const c = createRealm(); //  its own agent; shares nothing, GCs with the realm
```

`createRealm()` with no agent makes one for that realm alone. That is the safe
default — isolation unless the embedder asks for sharing — and it means a host
that creates and discards realms in a loop retains nothing.

When an `EngineObject` crosses a realm or agent boundary, well-known-symbol
protocols follow the receiver, not the currently executing realm:
`@@toPrimitive` and `@@toStringTag` use `object.agent.wellKnownSymbols`. A
same-named well-known symbol minted by another agent is therefore only an
ordinary symbol property. Primitive receivers have no owner object yet, so the
executing realm boxes them first and that wrapper supplies the owner.

A `Realm` (`src/runtime/realm.js`) owns a fresh intrinsic graph and a fresh
global object/environment, keeping every script execution isolated from the host
and from other realms. The global object is a plain `EngineObject` whose
properties are installed during construction, never from host globals.

Construction order in the `Realm` constructor:

0. The agent — `options.agent`, or a fresh one
1. `createFundamentalIntrinsics(agent)` — `Object.prototype`,
   `Function.prototype`, `Symbol.prototype`
2. `defineGlobalValueProperties()` — `NaN`, `Infinity`, `undefined`
3. `GlobalEnvironmentRecord` wrapping the global object
4. `createDateHost()` — deterministic clock/timezone adapters
5. Error intrinsics and constructors (`Error`, `EvalError`, `TypeError`,
   `ReferenceError`, `SyntaxError`, `RangeError`, `URIError`)
6. `%ThrowTypeError%` — a frozen per-realm function for strict poison-pill
   accessors
7. Object constructor and prototype methods
8. `Reflect` object
9. Function constructor (including `bind`, `apply`, `call`)
10. Array constructor and prototype methods
11. Primitive wrapper constructors (`Boolean`, `Number`, `String`)
12. RegExp constructor and prototype methods
13. `Symbol` constructor, prototype, registry methods, and well-known symbols
14. `Math` object
15. Numeric globals (`parseInt`, `parseFloat`, `isNaN`, `isFinite`)
16. URI globals (`encodeURI`, `encodeURIComponent`, `decodeURI`,
    `decodeURIComponent`, `escape`, `unescape`)
17. `eval` global
18. `JSON` object (`parse`, `stringify`)
19. `Date` constructor
20. Iterator intrinsics and Array/String iterator methods
21. `%GeneratorFunction%` and `%GeneratorPrototype%` intrinsics (no global
    `GeneratorFunction` binding)
22. `Promise` constructor and prototype methods

Each family builds its graph through a `create*Intrinsics(realm)` path. Families
with a global binding publish it through an `install*` path;
`%GeneratorFunction%` deliberately has no global installer.

## Values, objects, environments, references, completions

### EngineObject (`src/runtime/object.js`)

Every guest object is an `EngineObject`. It implements the ES5 internal methods
(`[[Get]]`, `[[Put]]`, `[[GetOwnProperty]]`, `[[DefineOwnProperty]]`,
`[[Delete]]`, `[[HasProperty]]`, `[[Enumerate]]`, `[[DefaultValue]]`) and
tracks `[[Prototype]]`, `[[Class]]`, `[[Extensible]]`, and own properties as a
`Map` of property descriptors keyed by a String **or** a Symbol.

### Symbols (`src/runtime/symbol.js`)

Symbol values, their descriptions, `SymbolDescriptiveString`, and the global
symbol registry. This is the engine's one piece of _agent-level_ state rather
than realm-level state: ECMA-262 §6.1.5.1 and §19.4.2.1 make the well-known
symbols and the registry shared by all realms, so two realms agree on
`Symbol.iterator` and on `Symbol.for('x')` while `Symbol` and
`Symbol.prototype` stay per-realm like every other intrinsic. A guest Symbol
is a host `symbol` primitive, so identity is the host's and a symbol key can
never collide with a string key.

### Descriptors (`src/runtime/descriptors.js`)

Property descriptors are plain objects with the four ES5 fields (`value`,
`writable`, `enumerable`, `configurable` for data; `get`, `set`, `enumerable`,
`configurable` for accessor). `isDataDescriptor`, `isAccessorDescriptor`, and
the conversion/validation helpers live here.

### Raw own-descriptor reads (`src/runtime/object.js`)

`EngineObject` exposes own descriptors through two paired methods:

- `getOwnProperty(name)` is the spec-visible `[[GetOwnProperty]]`. It returns a
  **copy**, so a caller may keep it, hand it to guest code, or mutate it.
- `_peekOwnDescriptor(name)` returns the **stored** descriptor with no copy. The
  hot paths (`getProperty`, `canPut`, `put`, `defineOwnProperty`, `delete`,
  `enumerableKeysForIn`) read through it, which is what keeps an ordinary
  property read from allocating a descriptor object per access.

Two rules come with that:

1. **Paired override.** A subclass that synthesises or rewrites own properties
   must override _both_ or neither: `ArgumentsObject`
   (`src/runtime/function-object.js`) injects the live parameter binding in
   each, and `EnginePrimitiveObject` (`src/runtime/primitive-object.js`)
   synthesises string-index characters in each. Overriding only one makes
   `Object.getOwnPropertyDescriptor` and a plain property read disagree for
   exactly that subclass's virtual properties, which no behavioural test is
   guaranteed to notice, so the pairing is enforced as a source-text invariant
   in `test/node/repository-invariants.test.js`.
2. **Do not retain across mutation.** The object `_peekOwnDescriptor` returns is
   the engine's own storage. Treat it as read-only and never hold it across
   anything that can mutate `_properties` — a define, a delete, or a put —
   because the next write can change the fields under it. `getProperty` copies
   immediately for this reason, and `defineOwnProperty`'s `{value}`-only fast
   path deliberately reads `_properties` directly rather than through
   `_peekOwnDescriptor`: it is about to _write_ the stored descriptor, so it
   needs the real one and must not see a subclass's synthesised stand-in.

### Own-property-key order (`src/runtime/object.js`)

`EngineObject#ownPropertyKeys()` returns keys in ECMA-262 9.1.12
`OrdinaryOwnPropertyKeys` order: array-index string keys first in ascending
numeric order, then other string keys in creation order, then symbol keys in
creation order.
`Object.keys`, `Object.getOwnPropertyNames`, `for-in` (`enumerableKeysForIn`),
and `JSON.stringify` all read through this one method, so they share the
order automatically.

### Method `[[HomeObject]]` and `super` (`src/runtime/function-object.js`, `src/runtime/super-reference.js`)

Object-literal methods/accessors and class methods/accessors carry an ES2015
`[[HomeObject]]` (`EngineFunction#homeObject`) and are non-constructible.
`super.prop`/`super[expr]` resolves through `SuperReferenceBase`: lookup starts
at the home object's prototype while reads and writes preserve the original
receiver. Derived constructors additionally use `constructSuper` to initialize
their uninitialized `this`.

An arrow deliberately has **no** `[[HomeObject]]`, own `this`, or own
`arguments`. Its closure resolves `this`, `arguments`, and `super` from the
enclosing execution environment; an arrow inside a method therefore uses that
method's home object without acquiring one of its own.

### Environment records (`src/runtime/environment.js`)

- `DeclarativeEnvironmentRecord` — bindings from `var`, function parameters,
  `catch` clauses, and now ES2015 `let`/`const`. Each binding has `value`,
  `mutable`, `initialized`, and `deletable` flags. A binding created but not yet
  initialized (`initialized: false`) is the ES2015 **temporal dead zone**:
  reading or writing it throws a `ReferenceError` until its declaration runs and
  `initializeBinding` sets its value. `createImmutableBinding(N, S)` backs
  `const`; a `const` assignment throws a `TypeError` in sloppy code too, not
  only under strict mode.
- `ObjectEnvironmentRecord` — wraps an `EngineObject` (used for `with`
  statements and the global object).
- `GlobalEnvironmentRecord` — the realm's outermost environment. It splits the
  global scope in two the way ES2015 §8.1.1.4 does: an `ObjectEnvironmentRecord`
  over the global object holds `var` and function-declaration bindings as own
  properties, while a `DeclarativeEnvironmentRecord` holds top-level `let`/`const`
  bindings that never become properties of the global object. Its
  `hasVarDeclaration`, `hasLexicalDeclaration`, `hasRestrictedGlobalProperty`,
  `canDeclareGlobalVar`, and `canDeclareGlobalFunction` queries are what
  `globalDeclarationInstantiation` consults to detect a conflict before binding
  anything.

Block, `switch`, `try`, and loop bodies that declare `let`/`const` run in a
fresh `DeclarativeEnvironmentRecord` chained onto the running execution
context's environment; a `for` loop with a lexical head gets a **new binding
environment per iteration** (and `for`-`in` a fresh one per enumerated name), so
a closure created in one iteration captures that iteration's binding rather than
a single shared one. Non-simple functions create a parameter environment before
their body environment: defaults run left to right, earlier parameters are
visible, later parameters remain in the TDZ, and body `var`/function declarations
do not leak backwards into defaults. Rest parameters are realm-owned arrays.
The distinct body environment keeps body lexical declarations and `var`s
separate from parameter bindings; simple parameter lists retain the compatible
activation path. Arrows reuse parameter instantiation but create no own
`arguments` or `this` binding.

Class declarations are lexical declarations too: instantiation creates a
**mutable**, uninitialized binding, so the class name is in the TDZ while its
heritage and body are evaluated; after successful class evaluation initializes
it, a later assignment to that declaration is ordinary mutable-binding
assignment. A named class expression instead creates a distinct, inner
**immutable** name binding for its own heritage and body. That inner name has
the same evaluation-time TDZ, rejects reassignment after initialization, and
does not leak into the surrounding scope.

### Template-object ownership (`src/runtime/realm.js`, `src/evaluator/expressions.js`)

Each `Realm` owns `templateObjects`, a `WeakMap` from parsed
`TemplateLiteral` AST nodes to realm-owned `EngineArray` template objects.
Tagged-template evaluation gets the cached frozen cooked/raw arrays before
calling the tag; repeated evaluation of one parse site in one realm preserves
identity, while a distinct AST node or realm gets a distinct object. Untagged
templates evaluate substitutions left to right and concatenate cooked text after
`ToString` conversion.

### References (`src/runtime/reference.js`)

A `Reference` record (ECMA-262 8.7) carries a `base` (environment record,
object, or `undefined`/`null` for unresolvable), a `referencedName`, a `strict`
flag, and a `thisValue` that preserves the original primitive base for property
references on primitives (needed for 8.7.1/8.7.2 special `[[Get]]`/`[[Put]]`
and 11.2.3 method-call `this` binding).

### Completions (`src/runtime/completion.js`)

- `EMPTY` sentinel — marks a completion value as spec-"empty" rather than the
  guest `undefined`.
- `createNormalCompletion(value)`, `createBreakCompletion(target, value)`,
  `createContinueCompletion(target, value)`, `createReturnCompletion(value)`.
- `ThrowSignal` — a host exception used to propagate guest `throw` back to
  `evaluateScript`; it carries the guest value, not a host error.
- `GuestErrorSignal` — carries a type name and message for deferred guest-error
  construction, used where `realm` is not in scope.

### Recursion boundary (`src/runtime/stack-guard.js`)

The ordinary synchronous evaluator runs on the host stack, so the engine keeps
a budget of its own rather than inheriting the host's: `StackGuard` counts the
engine frames a realm currently has on the stack and raises a
`GuestErrorSignal` for a `RangeError` (`Maximum call stack size exceeded`) when
the next one would exceed `DEFAULT_MAX_STACK_DEPTH`, or the `maxStackDepth` a
realm was created with. The count is per realm; a guest or native function
always enters its owning realm's guard, including when another realm calls it.

The unit is an engine frame rather than a guest call because a guest call is
not a fixed amount of host stack: the evaluator walks expressions and
statements recursively, so `f()` nested twenty levels deep in an expression
costs far more host stack than a bare `f()`. Counting activations alone leaves
that difference unmeasured, and the host overflows first. Four kinds of work
therefore enter the guard:

- every activation — `EngineFunction#callFunction` (which
  `EngineFunction#constructFunction` routes through) and
  `NativeFunction#callFunction`/`#constructFunction` — so recursion through a
  built-in callback, an accessor, a coercion, `eval`, or a dynamic `Function`
  is counted in the same units as a direct call;
- every node `evaluateExpression` and `evaluateStatement` walk into, which is
  what makes one budget safe for every shape of source;
- `JSON.parse`, its reviver walk, and `JSON.stringify`, whose recursion follows
  the shape of runtime _data_ rather than of source;
- `validatePattern` (`src/runtime/regexp-syntax.js`), whose recursive descent
  follows the shape of a guest-supplied pattern string. The guard reaches it
  duck-typed, threaded through `compilePattern`, so `regexp-syntax.js` stays a
  pure syntax module with no dependency on the runtime.

Generator suspension does not retain any of those host frames. The generator
machine stores typed continuation records on the heap and returns only after
the dispatcher and every active guard entry unwind. A classified yield-free
subtree or synchronous call still bridges to the ordinary evaluator, so active
work on either side of a suspension remains subject to this same bounded
recursion policy.

Every `enter` is paired with an `exit` in a `finally`, so the count is exact
whether a frame returns or throws and no signal boundary has to repair it.

Recursion whose depth guest code controls but which is _not_ a stack budget
question is made iterative instead of counted, so that ordinary operations on
long chains keep working: `EngineObject#getProperty` walks the prototype chain
in a loop, and `BoundFunction#hasInstance` unwraps a bound chain in a loop.
The hoisting walks (the declaration-name walks in
`src/evaluator/static-semantics.js` — `varDeclaredNames`,
`lexicallyDeclaredNames`, `boundNames`, and the `topLevel*` and
`annexBBlockFunctionDeclarations` variants — shared by all three
declaration-instantiation passes) keep an explicit worklist for a different
reason: they run before evaluation begins, so the guard cannot count them, and
the parser accepts programs that outgrow a recursive walk of the result. They
also push children one at a time rather than spreading a statement list into a
variadic call, which would swap the depth limit for a host argument-count one.

The guard cannot cover the recursion spent _before_ evaluation — the parser's
own descent and the declaration-instantiation walks that precede a script — so
`src/parser.js` reports running out of stack there as what it is at that stage:
a failure to parse. `asParseFailure` converts a stack overflow raised out of
the parser into `SyntaxError: Not enough stack space to parse input`, the same
error Acorn raises for the same condition around `parseTopLevel` (Acorn reads
the first token before installing that conversion, so a leading regular
expression literal reached the host limit without it). The conversion is
confined to the `parse` call, which runs no engine code.

Those two are the whole of the engine's stack containment. Anywhere else a host
`RangeError` is never caught and relabeled, so an engine defect that overflows
the host stack still escapes as the host error it is.

### Conversion (`src/runtime/conversion.js`)

The ES5 abstract operations: `ToPrimitive`, `ToBoolean`, `ToNumber`, `ToInteger`,
`ToString`, `ToObject`, `ToInt32`, `ToUint32`, `ToUint16`, `CheckObjectCoercible`,
plus ES2015's `ToPropertyKey`. `ToPrimitive` consults `@@toPrimitive` before
`OrdinaryToPrimitive`; `ToNumber` and `ToString` reject symbols.

### Operators (`src/runtime/operators.js`)

Binary and unary operator semantics: the abstract relational and equality
comparisons, `typeof`, `instanceof`, `in`.

## Evaluator boundaries

The evaluator lives in `src/evaluator/` and is split by concern:

| Module                | Responsibility                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expressions.js`      | Every expression form the engine supports                                                                                                                                                           |
| `statements.js`       | Every statement form (loops, if, switch, try, etc.), block/loop scoping                                                                                                                             |
| `declarations.js`     | Declaration instantiation: global (§15.1.8), function (§9.2.12), eval (§18.2.1.2), and `blockDeclarationInstantiation`                                                                              |
| `static-semantics.js` | The spec's declaration-name walks (`boundNames`, `varDeclaredNames`, `lexicallyDeclaredNames`, the `topLevel*` variants, `annexBBlockFunctionDeclarations`, `isConstantDeclaration`), all iterative |
| `directive.js`        | `hasUseStrictDirective` — `"use strict"` detection                                                                                                                                                  |
| `eval.js`             | Direct and indirect `eval` code evaluation                                                                                                                                                          |
| `dynamic-function.js` | The `Function` constructor's body parsing                                                                                                                                                           |
| `index.js`            | Re-exports for the evaluator's public surface                                                                                                                                                       |

`declarations.js` drives four instantiation paths, all reading their names from
`static-semantics.js`: `globalDeclarationInstantiation` for a script,
`functionDeclarationInstantiation` when a function activates,
`evalDeclarationInstantiation` for each `eval` (which runs in its own lexical
environment, with the ES2015 §18.2.1.2 name checks and Annex B.3.3.3
block-function aliases), and `blockDeclarationInstantiation` for the fresh
lexical environment `statements.js` enters for every block, `switch` case block,
`try` part, and per-iteration loop binding. In sloppy code, Annex B.3.3 block
function declarations additionally alias a `var`-scoped binding, so
`{ function f(){} } f()` still resolves while `if (false) { function f(){} }
typeof f` is correctly `'undefined'`.

Unsupported AST nodes throw an explicit `UnsupportedNodeError`,
`UnsupportedOperatorError`, or `UnsupportedOperationError` naming what is
missing rather than silently misbehaving.

## Synchronous generators

### Function activation and intrinsics

`createFunctionObject` gives generator declarations, expressions, and
object/class methods the `generator` or `generatorMethod` function kind. They
are callable but not constructible and inherit from their realm's
`%GeneratorFunction.prototype%`; each function's own `prototype` inherits from
that realm's `%GeneratorPrototype%`.

Calling one creates its activation and performs parameter/default/
destructuring/rest setup, `var`/function instantiation, and body lexical
instantiation immediately. It then returns a `GeneratorObject` in
`suspendedStart` without evaluating a body statement. The first `next()` starts
the body in the retained activation, so parameter side effects and errors are
call-time behavior while body side effects remain resume-time behavior.

Each realm owns `%GeneratorFunction%`, `%GeneratorFunction.prototype%`, and
`%GeneratorPrototype%`, but installs no global `GeneratorFunction` property.
Guest code reaches the dynamic constructor through a generator function's
inherited `constructor`. Calling or constructing it parses independently
guarded parameter/body fragments with the guest parser and creates a generator
closed over the invoked constructor's realm-global environment; it never calls
host `eval`, `Function`, or a host generator.

### `GeneratorObject` state and continuation

`src/runtime/generator-object.js` implements exactly four states:

- `suspendedStart` — the activation exists but no body statement has run.
  `next(value)` starts with `undefined` (discarding `value`); `return(value)` or
  `throw(value)` completes without entering the body.
- `executing` — one resume is active. Reentrant `next`, `return`, or `throw`
  raises a guest `TypeError`.
- `suspendedYield` — a direct or delegated yield has returned outward.
  `next`, `throw`, and `return` inject their normal/throw/return Completion at
  that exact suspension point, so surrounding `catch` and `finally` regions
  retain authority.
- `completed` — the continuation has been released. `next()` returns
  `{ value: undefined, done: true }`, `return(value)` returns
  `{ value, done: true }`, and `throw(value)` throws `value`.

A direct yield transitions `executing → suspendedYield`; a normal/return/throw
terminal Completion transitions `executing → completed`, returning `undefined`,
returning its value, or propagating its thrown value respectively. Any
unexpected continuation failure also clears the continuation and completes the
object.

`GeneratorExecution` (`src/evaluator/generator-machine.js`) stores a typed
`frames` array plus explicit resume-input and child-output slots. The expression,
pattern/definition, and statement/control dispatchers retain only
discriminants, phases/indices, AST nodes, evaluation contexts, iterator records,
and engine values, References, or Completions. No suspended record retains a
host callback, closure continuation, evaluator frame, or active `StackGuard`
entry. Each dispatch step is finite; suspension returns only after the machine
loop and any synchronous subtree have unwound.

The first activation builds a function-owned, execution-edge-aware yield
classification. A yield-bearing subtree gets typed frames; a classified
yield-free subtree uses the existing synchronous expression or statement
evaluator. That bridge keeps one semantic implementation for ordinary work
without retaining its host stack across suspension.

### Delegation and Realm/Agent ownership

A `yield*` frame retains one Iterator Record and forwards the native iterator
protocol: initial and resumed `next`, dynamic `throw` and `return` lookup,
missing-`throw` close/`TypeError` behavior, missing-`return` propagation,
iterator-result validation, and `done` before `value`. A delegated `done: false`
result is returned unchanged — including identity, prototype, owning Agent, and
a still-unread `value` getter — rather than being reboxed. A `done: true` result
feeds its value back into the outer expression or Completion.

Generator functions, their default prototypes, `GeneratorObject`s, direct-yield
iterator results, terminal iterator results, and dynamic-constructor parse
errors belong to the generator function/constructor realm. Protocol lookup on
an `EngineObject` uses that object's Agent-owned well-known `@@iterator`; a
primitive uses the executing realm while it is boxed. Consequently a foreign
iterator can delegate across Agents, its forwarded `done: false` result remains
foreign, and results the outer generator itself creates use the outer
generator's realm.

## Built-in families (`src/builtins/`)

Each built-in family is a module under `src/builtins/` with a
`create*Intrinsics(realm)` path; globally exposed families also provide an
`install*` path. Generators deliberately have no global installer:

| Module                  | Family / globals                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fundamental.js`        | `Object.prototype`, `Function.prototype`, global values                                                                                                                                                                                                                                                                                                                                                                         |
| `errors.js`             | Error constructors and prototypes                                                                                                                                                                                                                                                                                                                                                                                               |
| `object.js`             | `Object` constructor methods (`create`, `keys`, `setPrototypeOf`, `is`, etc.)                                                                                                                                                                                                                                                                                                                                                   |
| `function.js`           | `Function` constructor, `bind`, `apply`, `call`; `EngineFunction`'s `name`/`length` own properties are `configurable: true` (ES2015 changed this from ES5's `false`), and `name` is assigned per `SetFunctionName`/`NamedEvaluation` — including anonymous-function inference for `var`, `let`/`const`, assignment, and object-literal-property targets — in `src/evaluator/declarations.js` and `src/evaluator/expressions.js` |
| `array.js`              | `Array` constructor and prototype methods                                                                                                                                                                                                                                                                                                                                                                                       |
| `primitive-wrappers.js` | `Boolean`, `Number`, `String` constructors and prototypes                                                                                                                                                                                                                                                                                                                                                                       |
| `regexp.js`             | `RegExp` constructor and prototype methods                                                                                                                                                                                                                                                                                                                                                                                      |
| `symbol.js`             | `Symbol` constructor, prototype, registry, well-known symbols                                                                                                                                                                                                                                                                                                                                                                   |
| `reflect.js`            | `Reflect.ownKeys` exposing complete string/symbol own-key order                                                                                                                                                                                                                                                                                                                                                                 |
| `iterator.js`           | `%IteratorPrototype%`, Array/String iterator prototypes and methods, and `@@iterator` installation                                                                                                                                                                                                                                                                                                                              |
| `generator.js`          | Per-Realm non-global generator intrinsics plus generator `next`, `return`, and `throw` resume methods                                                                                                                                                                                                                                                                                                                           |
| `math.js`               | `Math` object (constants and functions)                                                                                                                                                                                                                                                                                                                                                                                         |
| `global-numeric.js`     | `parseInt`, `parseFloat`, `isNaN`, `isFinite`                                                                                                                                                                                                                                                                                                                                                                                   |
| `global-uri.js`         | URI encoding/decoding, `escape`/`unescape`                                                                                                                                                                                                                                                                                                                                                                                      |
| `global-eval.js`        | `eval` global function                                                                                                                                                                                                                                                                                                                                                                                                          |
| `json.js`               | `JSON.parse`, `JSON.stringify`                                                                                                                                                                                                                                                                                                                                                                                                  |
| `date.js`               | `Date` constructor, prototype, `parse`, `UTC`, `now`                                                                                                                                                                                                                                                                                                                                                                            |
| `shared.js`             | `createNativeFunction` and helpers shared across families                                                                                                                                                                                                                                                                                                                                                                       |
| `string-case.js`        | Case conversion implementation                                                                                                                                                                                                                                                                                                                                                                                                  |
| `string-pattern.js`     | `match`, `replace` pattern helpers                                                                                                                                                                                                                                                                                                                                                                                              |
| `string-search.js`      | `search`, `split` pattern helpers                                                                                                                                                                                                                                                                                                                                                                                               |
| `string-regexp.js`      | String↔RegExp dispatch                                                                                                                                                                                                                                                                                                                                                                                                          |
| `number-format.js`      | `toFixed`, `toExponential`, `toPrecision`                                                                                                                                                                                                                                                                                                                                                                                       |
| `unicode-case-data.js`  | Generated Unicode case-mapping tables                                                                                                                                                                                                                                                                                                                                                                                           |

## Host adapters

The engine has five host boundaries:

1. **Parser** — `src/parser-dependency.js` imports Acorn from the vendored build.
   The parser is the only place the engine reaches outside `src/`.

2. **RegExp execution** — `src/runtime/regexp-compat.js` compiles an
   already-validated ES5 pattern with the host `RegExp`, using the sticky flag to
   reproduce `[[Match]](S, index)` at exactly one position. This is sound because
   the ES5.1 grammar is a strict subset of every host's, so no pattern reaches
   the host with a structural meaning the host could get wrong.

3. **Date/time** — `src/runtime/date.js` defines a `DateHost` adapter with
   three members: `now()` (returns milliseconds since epoch),
   `timezoneOffset(utcMilliseconds)` (returns the UTC offset in minutes for
   any instant, encoding both standard and daylight saving rules), and an
   optional `standardTimezoneOffset` number (the stable standard-time offset,
   used to derive DaylightSavingTA without probing; when omitted the engine
   derives it from January/July UTC probes). `createDateHost()` fills defaults
   from the host (`Date.now`, `new Date(t).getTimezoneOffset()`). Embedders
   override these through `RealmOptions`; this is one of the engine's
   injectable host boundaries (the other is `maxStackDepth`).

4. **`Math.random`** — forwarded to the host's `Math.random`; its result is
   nondeterministic and is not configurable through `RealmOptions`.

5. **`Math` transcendentals** — `src/builtins/math.js` forwards eleven
   guest-visible built-ins (`pow`, `sqrt`, `exp`, `log`, `sin`, `cos`, `tan`,
   `asin`, `acos`, `atan`, `atan2`) to the host `Math` after applying the
   specified special-value, sign, and domain rules. The exactly-specified cases
   are engine behaviour; the last-ulp digits are the host's.

Nothing else in the engine reaches the host: `JSON`, `parseInt`, `parseFloat`,
and the URI functions are self-contained implementations.

## Embedding API

The public API is exported from `src/index.js`:

```js
export { createRealm, evaluateScript, parseScript, Realm } from './api.js';
```

### `createRealm(options?): Realm`

Creates a fresh realm with a complete ES5 intrinsic graph and global object.
`options` accepts the realm's recursion budget and host adapter overrides for
date/time:

- `maxStackDepth` — the number of engine frames guest code may have on the
  stack before the next one raises a guest `RangeError` (default 500, see
  `src/runtime/stack-guard.js`)
- `dateHost` — a partial `DateHost` object (`now`, `timezoneOffset`,
  `standardTimezoneOffset`)
- `now` / `clock` — shorthand for `dateHost.now`
- `standardTimezoneOffset` / `standardTimeZoneOffset` — the stable
  standard-time offset in minutes; consumed as a distinct numeric field that
  avoids the January/July probing derivation
- `timezoneOffset` / `timeZoneOffset` — shorthand for
  `dateHost.timezoneOffset` (a function from UTC milliseconds to minutes)

### `evaluateScript(realm, source, parserOptions?): { type: 'normal' | 'throw', value: unknown }`

Parses `source` as a script and evaluates it against `realm`. Returns a
completion record: `{ type: 'normal', value }` on success, `{ type: 'throw',
value }` when the script throws a guest error. The thrown value is a guest error
object (an `EngineObject`), not a host exception.

`parserOptions` is forwarded to Acorn and merged with the engine's defaults
(`ecmaVersion: 6`, `sourceType: 'script'`). A caller-supplied Acorn `program`
is the exception: before parser callbacks run, `parseScript` makes and validates
a descriptor-safe snapshot of its AST nodes and structural arrays. Parsing then
uses that snapshot's directive prologue to inherit strictness, and returns a
fresh Program whose body contains the snapshotted statements followed by the
newly parsed statements. Callback mutations affect only the ignored original;
the supplied Program is not mutated by the engine. The snapshot clones ordinary
object and array data while preserving cycles and shared references, but rejects
function-valued state before callbacks because ESTree does not require it. The
combined Program is also checked for duplicate lexical declarations and
lexical/`var` conflicts across the append boundary. A custom `parse` hook still
receives its options unchanged, but its returned Program graph is
descriptor-safely snapshotted before any shape, capability, or early-error
validation. The resulting ordinary nodes and arrays retain safe RegExp literals,
cycles, and shared references for validation while dropping scanned non-index
array metadata, so `parseScript` returns a fresh graph rather than preserving
the hook's object identity.

Multiple `evaluateScript` calls against the same realm share state:

```js
import { createRealm, evaluateScript } from './src/index.js';

const realm = createRealm();
evaluateScript(realm, 'var x = 40');
const result = evaluateScript(realm, 'x + 2');
console.log(result); // { type: 'normal', value: 42 }
```

### `parseScript(source, parserOptions?): Program`

Parses `source` as a script and returns an Acorn AST. The supported ES2015
grammar is the capability set listed under [Source flow](#source-flow), including
lexical and block-level function declarations, arrows, classes, templates,
destructuring, parameter and spread syntax, and enhanced object literals.
Neighboring ES2015 forms outside that list are rejected by the engine's
capability pass. Throws a host `SyntaxError` (not a guest error) on invalid
input.

### `createAgent(): Agent`

Creates an agent: the owner of the well-known symbols and the global symbol
registry. Pass one as `createRealm({ agent })` to make several realms
interoperate; omit it and each realm gets its own, so nothing guest code
interns outlives the realm that interned it.

### `Realm` class

The `Realm` class itself. Exported for `instanceof` checks and type annotations.

### `Agent` class

The `Agent` class itself. Exported for `instanceof` checks and type
annotations.
Instances expose:

- `realm.globalObject` — the global `EngineObject`
- `realm.globalEnvironment` — the `GlobalEnvironmentRecord`
- `realm.agent` — the agent owning the well-known symbols and the global
  symbol registry
- `realm.intrinsics` — the intrinsic graph (prototypes, constructors)
- `realm.dateHost` — the resolved `DateHost` adapter
- `realm.stackGuard` — the realm's recursion budget (`StackGuard`)
- `realm.createNativeFunction(options)` — create a native function in this realm
- `realm.createGuestError(typeName, message)` — create a guest error object

## Unicode data

`src/builtins/unicode-case-data.js` is generated by
`tools/unicode/generate-case-data.js` from the UCD version pinned in
`package.json`'s `unicode` field (currently Unicode 16.0.0). Its header records
the pinned version, source URLs, and sha256 digests.

`npm run unicode:check` re-derives every table from the UCD files and fails if
the module has drifted. It downloads the UCD (or reads it from `--from=DIR`), so
it is a local-only command, not a CI job.

CI enforces self-consistency offline:
`test/node/repository-invariants.test.js` fails if the module's
`UNICODE_VERSION` differs from the pinned version, if the pinned `baseUrl` does
not name that version, or if the module header does not record exactly the
pinned UCD files with well-formed sha256 digest lines.
