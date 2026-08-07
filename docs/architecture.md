# Architecture

jsjs is an ES5.1 JavaScript engine written in plain ES2020 JavaScript with JSDoc
types. The same source runs in Node, in a browser, and in the JavaScriptCore
(`jsc`) shell: nothing in `src/` imports a host module, and guest behaviour never
leans on host `eval`, `Function`, or host objects.

## Source flow

Source enters through `evaluateScript(realm, source)`, which:

1. **Parses** via `src/parser.js` — Acorn configured at `ecmaVersion: 5`,
   `sourceType: 'script'`, with an Acorn plugin that restores the ES5.1 §7.6
   escaped-identifier rule Acorn relaxes for `ecmaVersion < 6`.
2. **Hoists** via `src/evaluator/declarations.js` —
   `globalDeclarationInstantiation` walks the AST and binds every reachable
   function declaration and `var` name onto the realm's global object.
3. **Evaluates** via `src/evaluator/statements.js` —
   `evaluateStatementList` walks the body left to right with explicit completion
   propagation.

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

## Realms and intrinsics

A `Realm` (`src/runtime/realm.js`) owns a fresh intrinsic graph and a fresh
global object/environment, keeping every script execution isolated from the host
and from other realms. The global object is a plain `EngineObject` whose
properties are installed during construction, never from host globals.

Construction order in the `Realm` constructor:

1. `createFundamentalIntrinsics()` — `Object.prototype`, `Function.prototype`
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
12. `Math` object
13. Numeric globals (`parseInt`, `parseFloat`, `isNaN`, `isFinite`)
14. URI globals (`encodeURI`, `encodeURIComponent`, `decodeURI`,
    `decodeURIComponent`, `escape`, `unescape`)
15. `eval` global
16. `JSON` object (`parse`, `stringify`)
17. `Date` constructor

Each family follows the same pattern: a `create*Intrinsics(realm)` function
builds the prototype and constructor objects, and an `install*` function
publishes them on the global object.

## Values, objects, environments, references, completions

### EngineObject (`src/runtime/object.js`)

Every guest object is an `EngineObject`. It implements the ES5 internal methods
(`[[Get]]`, `[[Put]]`, `[[GetOwnProperty]]`, `[[DefineOwnProperty]]`,
`[[Delete]]`, `[[HasProperty]]`, `[[Enumerate]]`, `[[DefaultValue]]`) and
tracks `[[Prototype]]`, `[[Class]]`, `[[Extensible]]`, and own properties as a
`Map` of property descriptors.

### Descriptors (`src/runtime/descriptors.js`)

Property descriptors are plain objects with the four ES5 fields (`value`,
`writable`, `enumerable`, `configurable` for data; `get`, `set`, `enumerable`,
`configurable` for accessor). `isDataDescriptor`, `isAccessorDescriptor`, and
the conversion/validation helpers live here.

### Environment records (`src/runtime/environment.js`)

- `DeclarativeEnvironmentRecord` — bindings from `var`, function parameters,
  `catch` clauses. Each binding has `value`, `mutable`, `initialized`, and
  `deletable` flags.
- `ObjectEnvironmentRecord` — wraps an `EngineObject` (used for `with`
  statements and the global object).
- `GlobalEnvironmentRecord` — the realm's outermost environment, wrapping the
  global object.

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
that difference unmeasured, and the host overflows first. Three kinds of work
therefore enter the guard:

- every activation — `EngineFunction#callFunction` (which
  `EngineFunction#constructFunction` routes through) and
  `NativeFunction#callFunction`/`#constructFunction` — so recursion through a
  built-in callback, an accessor, a coercion, `eval`, or a dynamic `Function`
  is counted in the same units as a direct call;
- every node `evaluateExpression` and `evaluateStatement` walk into, which is
  what makes one budget safe for every shape of source;
- `JSON.parse`, its reviver walk, and `JSON.stringify`, whose recursion follows
  the shape of runtime _data_ rather than of source.

Every `enter` is paired with an `exit` in a `finally`, so the count is exact
whether a frame returns or throws and no signal boundary has to repair it.

Recursion whose depth guest code controls but which is _not_ a stack budget
question is made iterative instead of counted, so that ordinary operations on
long chains keep working: `EngineObject#getProperty` walks the prototype chain
in a loop, and `BoundFunction#hasInstance` unwraps a bound chain in a loop.

The guard is the _only_ stack containment in the engine: a host `RangeError` is
never caught and relabeled, so an engine defect that overflows the host stack
still escapes as the host error it is.

### Conversion (`src/runtime/conversion.js`)

The ES5 abstract operations: `ToPrimitive`, `ToBoolean`, `ToNumber`, `ToInteger`,
`ToString`, `ToObject`, `ToInt32`, `ToUint32`, `ToUint16`, `CheckObjectCoercible`.

### Operators (`src/runtime/operators.js`)

Binary and unary operator semantics: the abstract relational and equality
comparisons, `typeof`, `instanceof`, `in`.

## Evaluator boundaries

The evaluator lives in `src/evaluator/` and is split by concern:

| Module                | Responsibility                                       |
| --------------------- | ---------------------------------------------------- |
| `expressions.js`      | Every expression form the engine supports            |
| `statements.js`       | Every statement form (loops, if, switch, try, etc.)  |
| `declarations.js`     | `globalDeclarationInstantiation` (ES5 10.5 hoisting) |
| `directive.js`        | `hasUseStrictDirective` — `"use strict"` detection   |
| `eval.js`             | Direct and indirect `eval` code evaluation           |
| `dynamic-function.js` | The `Function` constructor's body parsing            |
| `index.js`            | Re-exports for the evaluator's public surface        |

Unsupported AST nodes throw an explicit `UnsupportedNodeError`,
`UnsupportedOperatorError`, or `UnsupportedOperationError` naming what is
missing rather than silently misbehaving.

## Built-in families (`src/builtins/`)

Each built-in family is a module under `src/builtins/` that exports a
`create*Intrinsics(realm)` function and an `install*` function:

| Module                  | Family / globals                                          |
| ----------------------- | --------------------------------------------------------- |
| `fundamental.js`        | `Object.prototype`, `Function.prototype`, global values   |
| `errors.js`             | Error constructors and prototypes                         |
| `object.js`             | `Object` constructor methods (`create`, `keys`, etc.)     |
| `function.js`           | `Function` constructor, `bind`, `apply`, `call`           |
| `array.js`              | `Array` constructor and prototype methods                 |
| `primitive-wrappers.js` | `Boolean`, `Number`, `String` constructors and prototypes |
| `regexp.js`             | `RegExp` constructor and prototype methods                |
| `math.js`               | `Math` object (constants and functions)                   |
| `global-numeric.js`     | `parseInt`, `parseFloat`, `isNaN`, `isFinite`             |
| `global-uri.js`         | URI encoding/decoding, `escape`/`unescape`                |
| `global-eval.js`        | `eval` global function                                    |
| `json.js`               | `JSON.parse`, `JSON.stringify`                            |
| `date.js`               | `Date` constructor, prototype, `parse`, `UTC`, `now`      |
| `shared.js`             | `createNativeFunction` and helpers shared across families |
| `string-case.js`        | Case conversion implementation                            |
| `string-pattern.js`     | `match`, `replace` pattern helpers                        |
| `string-search.js`      | `search`, `split` pattern helpers                         |
| `string-regexp.js`      | String↔RegExp dispatch                                    |
| `number-format.js`      | `toFixed`, `toExponential`, `toPrecision`                 |
| `unicode-case-data.js`  | Generated Unicode case-mapping tables                     |

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
   override these through `RealmOptions`.

4. **`Math.random`** — forwarded to the host's `Math.random`; the one built-in
   whose result no realm can reproduce.

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
(`ecmaVersion: 5`, `sourceType: 'script'`).

Multiple `evaluateScript` calls against the same realm share state:

```js
import { createRealm, evaluateScript } from './src/index.js';

const realm = createRealm();
evaluateScript(realm, 'var x = 40');
const result = evaluateScript(realm, 'x + 2');
console.log(result); // { type: 'normal', value: 42 }
```

### `parseScript(source, parserOptions?): Program`

Parses `source` as an ES5 script and returns an Acorn AST. Throws a host
`SyntaxError` (not a guest error) on invalid input.

### `Realm` class

The `Realm` class itself. Exported for `instanceof` checks and type annotations.
Instances expose:

- `realm.globalObject` — the global `EngineObject`
- `realm.globalEnvironment` — the `GlobalEnvironmentRecord`
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
