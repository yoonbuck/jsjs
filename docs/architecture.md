# Architecture

jsjs is an ES5.1 JavaScript engine — extended with ES2015 lexical declarations
(`let`/`const`, block scope, the temporal dead zone, and per-iteration
bindings) — written in plain ES2020 JavaScript with JSDoc types. The same source
runs in Node, in a browser, and in the JavaScriptCore (`jsc`) shell: nothing in
`src/` imports a host module, and guest behaviour never leans on host `eval`,
`Function`, or host objects.

## Source flow

Source enters through `evaluateScript(realm, source)`, which:

1. **Parses** via `src/parser.js` — Acorn configured at `ecmaVersion: 6`,
   `sourceType: 'script'`. The grammar the engine accepts is ES5.1 plus the
   ES2015 lexical-declaration syntax (`let`, `const`, and block scope) and
   nothing else. Raising `ecmaVersion` to 6 hands Acorn's own ES2015 scope
   analysis the static redeclaration early errors (a `let` colliding with a
   `var`, two `let`s of the same name in a block) and re-applies the reserved-word
   rule to escaped identifiers itself, so the hand-written `ecmaVersion < 6`
   escaped-identifier plugin was deleted as obsolete. A parse-time early-error
   pass then walks the tree and rejects every other ES2015 construct the
   evaluator does not implement — classes, arrow functions, template literals,
   `for`-`of`, generators, `async`/`await`, destructuring patterns, rest/spread,
   `super`, `new.target`, modules, computed/shorthand/method properties, binary
   and octal numeric literals, and `\u{…}` code-point escapes — as a guest
   `SyntaxError`, so the grammar the parser bounds is exactly the grammar the
   evaluator runs.
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
8. Function constructor (including `bind`, `apply`, `call`)
9. Array constructor and prototype methods
10. Primitive wrapper constructors (`Boolean`, `Number`, `String`)
11. RegExp constructor and prototype methods
12. `Symbol` constructor, prototype, registry methods, and well-known symbols
13. `Math` object
14. Numeric globals (`parseInt`, `parseFloat`, `isNaN`, `isFinite`)
15. URI globals (`encodeURI`, `encodeURIComponent`, `decodeURI`,
    `decodeURIComponent`, `escape`, `unescape`)
16. `eval` global
17. `JSON` object (`parse`, `stringify`)
18. `Date` constructor

Each family follows the same pattern: a `create*Intrinsics(realm)` function
builds the prototype and constructor objects, and an `install*` function
publishes them on the global object.

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

### Own-property-key order (`src/runtime/object.js`)

`EngineObject#ownPropertyKeys()` returns keys in ECMA-262 9.1.12
`OrdinaryOwnPropertyKeys` order: array-index string keys first in ascending
numeric order, then every other key in creation order (this engine has no
symbols yet, so the symbol bucket ES2015 defines is currently always empty).
`Object.keys`, `Object.getOwnPropertyNames`, `for-in` (`enumerableKeysForIn`),
and `JSON.stringify` all read through this one method, so they share the
order automatically.

### Method `[[HomeObject]]` and `super` (`src/runtime/function-object.js`, `src/runtime/super-reference.js`)

Object-literal `get`/`set` accessors carry an ES2015 `[[HomeObject]]`
internal slot (`EngineFunction#homeObject`) pointing at the object literal
they were defined in, and are created non-constructible
(`createFunctionObject(..., { isMethod: true, ... })` sets
`EngineFunction#_isConstructor = false`, matching ES2015 `FunctionCreate`'s
`Method` kind). `super.prop`/`super[expr]` inside such an accessor resolves
through `SuperReferenceBase` (`src/runtime/super-reference.js`): the property
lookup starts at `homeObject.getPrototype()`, but the accessor's own `this`
stays the receiver for both the read and the write — implemented by
`setPropertyWithReceiver`, a receiver-aware sibling of `EngineObject#put`
used only by this path. Parsing `super` at all requires a narrowly-scoped
Acorn plugin in `src/parser.js` that restores the `super` keyword token at
`ecmaVersion: 5` (Acorn's own `Super`-node handling, `allowSuper` scope
tracking, and early errors are otherwise unchanged); no other ES6 grammar is
reachable through it. `super(...)` (`SuperCall`) is not implemented — it is
only valid in a derived class constructor, and classes are issue #25.

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
a single shared one. A function body likewise runs in a lexical environment
layered over its activation (variable) environment, keeping the body's
`let`/`const` names distinct from its parameters and `var`s.

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

Guest code runs on the host stack, so the engine keeps a budget of its own
rather than inheriting the host's: `StackGuard` counts the engine frames a
realm currently has on the stack and raises a `GuestErrorSignal` for a
`RangeError` (`Maximum call stack size exceeded`) when the next one would
exceed `DEFAULT_MAX_STACK_DEPTH`, or the `maxStackDepth` a realm was created
with. The count is per realm because a realm is the engine's unit of isolation
and there is no cross-realm call path.

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

## Built-in families (`src/builtins/`)

Each built-in family is a module under `src/builtins/` that exports a
`create*Intrinsics(realm)` function and an `install*` function:

| Module                  | Family / globals                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fundamental.js`        | `Object.prototype`, `Function.prototype`, global values                                                                                                                                                                                                                                                                                                                                                    |
| `errors.js`             | Error constructors and prototypes                                                                                                                                                                                                                                                                                                                                                                          |
| `object.js`             | `Object` constructor methods (`create`, `keys`, `setPrototypeOf`, `is`, etc.)                                                                                                                                                                                                                                                                                                                              |
| `function.js`           | `Function` constructor, `bind`, `apply`, `call`; `EngineFunction`'s `name`/`length` own properties are `configurable: true` (ES2015 changed this from ES5's `false`), and `name` is assigned per `SetFunctionName`/`NamedEvaluation` — including anonymous-function inference for `var`/assignment/object-literal-property targets — in `src/evaluator/declarations.js` and `src/evaluator/expressions.js` |
| `array.js`              | `Array` constructor and prototype methods                                                                                                                                                                                                                                                                                                                                                                  |
| `primitive-wrappers.js` | `Boolean`, `Number`, `String` constructors and prototypes                                                                                                                                                                                                                                                                                                                                                  |
| `regexp.js`             | `RegExp` constructor and prototype methods                                                                                                                                                                                                                                                                                                                                                                 |
| `symbol.js`             | `Symbol` constructor, prototype, registry, well-known symbols                                                                                                                                                                                                                                                                                                                                              |
| `reflect.js`            | `Reflect.ownKeys` exposing complete string/symbol own-key order                                                                                                                                                                                                                                                                                                                                            |
| `math.js`               | `Math` object (constants and functions)                                                                                                                                                                                                                                                                                                                                                                    |
| `global-numeric.js`     | `parseInt`, `parseFloat`, `isNaN`, `isFinite`                                                                                                                                                                                                                                                                                                                                                              |
| `global-uri.js`         | URI encoding/decoding, `escape`/`unescape`                                                                                                                                                                                                                                                                                                                                                                 |
| `global-eval.js`        | `eval` global function                                                                                                                                                                                                                                                                                                                                                                                     |
| `json.js`               | `JSON.parse`, `JSON.stringify`                                                                                                                                                                                                                                                                                                                                                                             |
| `date.js`               | `Date` constructor, prototype, `parse`, `UTC`, `now`                                                                                                                                                                                                                                                                                                                                                       |
| `shared.js`             | `createNativeFunction` and helpers shared across families                                                                                                                                                                                                                                                                                                                                                  |
| `string-case.js`        | Case conversion implementation                                                                                                                                                                                                                                                                                                                                                                             |
| `string-pattern.js`     | `match`, `replace` pattern helpers                                                                                                                                                                                                                                                                                                                                                                         |
| `string-search.js`      | `search`, `split` pattern helpers                                                                                                                                                                                                                                                                                                                                                                          |
| `string-regexp.js`      | String↔RegExp dispatch                                                                                                                                                                                                                                                                                                                                                                                     |
| `number-format.js`      | `toFixed`, `toExponential`, `toPrecision`                                                                                                                                                                                                                                                                                                                                                                  |
| `unicode-case-data.js`  | Generated Unicode case-mapping tables                                                                                                                                                                                                                                                                                                                                                                      |

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
(`ecmaVersion: 6`, `sourceType: 'script'`).

Multiple `evaluateScript` calls against the same realm share state:

```js
import { createRealm, evaluateScript } from './src/index.js';

const realm = createRealm();
evaluateScript(realm, 'var x = 40');
const result = evaluateScript(realm, 'x + 2');
console.log(result); // { type: 'normal', value: 42 }
```

### `parseScript(source, parserOptions?): Program`

Parses `source` as a script and returns an Acorn AST. The grammar is ES5.1 plus
ES2015 lexical declarations; the engine's unsupported-ES2015 early errors apply,
so any other ES2015 construct is rejected. Throws a host `SyntaxError` (not a
guest error) on invalid input.

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
