# ES2015 object and function runtime updates

Implements issue #38 (sub-issue of #26, "Implement ES2015 runtime
foundations"). Parallel sibling issues #41 (lexical declarations/TDZ) and #43
(Symbols) are developed on separate branches; #45 integrates all three. This
design deliberately avoids touching shared, contended surface (the ES5
Test262 selection pipeline, the parser's global `ecmaVersion`) so the three
branches can be reconciled independently in #45.

## Goal

Add the ES2015 runtime semantics for objects and functions that later syntax
work (arrow functions, classes, enhanced object literals — issue #25) will
depend on, using **only already-ES5-parseable syntax** as the observable
surface, plus one narrowly-scoped grammar addition for `super` property
access (justified below). Symbols, computed property names, concise methods,
and classes are explicitly out of scope; this issue only prepares the runtime
to receive them.

## Scope

### 1. Ordinary object own-property-key order (ECMA-262 9.1.12 `OrdinaryOwnPropertyKeys`)

ES5 left enumeration order implementation-defined. ES2015 fixes it: integer
array-index keys first in ascending numeric order, then remaining string keys
in creation order, then symbol keys in creation order. The Symbol integration
fills the third bucket and exposes the complete list through `Reflect.ownKeys`.

- `EngineObject#ownPropertyKeys()` changes from raw `Map` insertion order to
  the ES2015-ordered result. The `Map` itself keeps insertion order for the
  non-index bucket; the index bucket is derived by filtering and numeric
  sort at read time. A property key is an "array index" per 6.1.7 when it is
  a String that is a canonical numeric string in `[0, 2^32 - 2]` (i.e. not
  `4294967295`, which is a valid array index bound exclusion) with no
  leading zero other than `"0"` itself.
- `Reflect.ownKeys`, `Object.keys`, `Object.getOwnPropertyNames`,
  `Object.getOwnPropertySymbols`, `for-in` (via `enumerableKeysForIn`), and
  `JSON.stringify` all read through `ownPropertyKeys()`, so they inherit the
  shared order.
- `EngineArray`'s own `length`/index properties already use string keys, so
  they fall out of the same helper without a special case.

### 2. Function `name` / `length` (ECMA-262 9.2.1–9.2.11, 17)

- `EngineFunction` gains an own `name` property: `{ value, writable: false,
enumerable: false, configurable: true }` (ES2015 changed `configurable`
  from ES5's `false` to `true` for both `name` and `length` — `length` also
  needs updating to `configurable: true` on both `EngineFunction` and
  `NativeFunction`).
- Name assignment (`SetFunctionName`, 9.2.11), restricted to syntax this
  engine already parses:
  - `FunctionDeclaration` / named `FunctionExpression`: name = the
    identifier.
  - Anonymous `FunctionExpression`: name = `""` at creation.
  - `NamedEvaluation` (9.2.12) overrides an anonymous function's name in
    exactly these already-parseable positions: a `VariableDeclarator` with a
    single `Identifier` `id` and an anonymous-function `init`; a top-level
    `AssignmentExpression` (`=` operator, `Identifier` LHS) whose RHS is an
    anonymous function; an object-literal `init`-kind `Property` whose value
    is an anonymous function (name = the property key, `ToString`'d same as
    the key itself); accessor (`get`/`set`) methods always get `"get " +
key` / `"set " + key` regardless of whether the function is named,
    matching `SetFunctionName` with a `prefix` argument.
  - `Function.prototype.bind`: bound function name = `"bound " +
Get(target, "name")`, coerced with `ToString`, falling back to `"bound
"` if `name` isn't a string.
  - The dynamic `Function` constructor (`evaluator/dynamic-function.js`):
    name = `"anonymous"` (ES2015 19.2.1.1.1 `CreateDynamicFunction` step
    using that literal identifier).
- `length` stays `parameterNames.length` — this engine has no default,
  rest, or destructured parameters yet, so `ParameterCount` (the count of
  parameters up to the first one with a default/rest/pattern) is trivially
  the full list length. No behavior change, only documentation that this is
  now the spec-required `SetFunctionLength` value rather than an ES5
  approximation.

### 3. Method definitions, `[[HomeObject]]`, and `super` (ECMA-262 9.2, 9.4.2, 12.3.5, 14.3)

Object-literal accessor methods (`get`/`set`, already ES5 syntax — ES2015
formally calls these `MethodDefinition`s) get:

- A `[[HomeObject]]` internal slot: `EngineFunction` gains an optional
  `homeObject` field, set by a new `makeMethod(functionObject, homeObject)`
  helper called right after `createFunctionObject` builds a `get`/`set`
  accessor in `evaluateObjectExpression`.
- **Not constructible.** ES2015 `FunctionCreate` for `kind: "Method"` never
  populates `[[Construct]]`; plain `FunctionExpression`/declarations
  (`kind: "Normal"`) keep it. `createFunctionObject` gains an `isMethod`
  option that sets `EngineFunction#_isConstructor = false`, so `new` on an
  accessor function throws a guest `TypeError`.
- `super.prop` / `super[expr]` property reads and writes inside a method
  body, resolved through the runtime the same way a real engine resolves
  `MakeSuperPropertyReference` (12.3.5.1): the lookup starts at
  `homeObject.getPrototype()` but `this` stays the receiver for `[[Get]]`
  and `[[Put]]`. This needs a minimal, self-contained grammar addition
  (below) because `super` is already a _reserved word_ at `ecmaVersion: 5`
  (ES5 §7.6.1.2 Future Reserved Words) — Acorn rejects it outright, so there
  is no way to observe `[[HomeObject]]` from guest code without parsing
  `super` at all. `super(...)` (`SuperCall`, only legal in derived-class
  constructors) stays unsupported; classes are issue #25's job.

  **Grammar addition** — a new Acorn plugin in `src/parser.js`, in the same
  style as the existing `withEscapedReservedWordCheck` plugin: overrides
  `parseExprAtom` to special-case the identifier text `super` immediately
  followed by `.` or `[` (i.e., it is about to become the object of a
  `MemberExpression`), producing `{ type: 'Super', start, end, loc }`
  instead of running the reserved-word check; every other appearance of
  `super` (bare, as a binding, followed by `(`) still hits the existing
  `checkUnreserved` rejection. Acorn's normal subscript parsing then wraps
  the `Super` atom in a `MemberExpression` exactly as it would any other
  primary expression, so no other parser code changes. `ecmaVersion` stays
  `5`; no other ES6 grammar becomes reachable.

  **Evaluator addition**: `evaluateMemberExpression` recognizes
  `node.object.type === 'Super'` and builds a super-reference instead of
  evaluating `node.object` as an expression: it reads the currently
  executing function's `homeObject` off the evaluation context (threaded
  through `context.homeObject`, set in `executeFunctionBody` from
  `functionObject.homeObject`), throws a guest `SyntaxError`-shaped
  `ReferenceError` — documented as an intentional ES5-engine deviation from
  the spec's _static_ early error — if there is no home object, and
  otherwise resolves the property starting at `homeObject.getPrototype()`
  while keeping `context.thisValue` as the receiver for both read
  (`[[Get]]`) and write (`[[Put]]`) access. `EngineObject#get`/`#put`
  already separate "where the search starts" from nothing today (both use
  `this` for both); this issue adds a receiver-aware variant used only by
  the two `super` call sites, so ordinary property access is unaffected.

### 4. Constructor/callability and ordinary-object updates

- Methods are not constructors (above).
- `EngineObject` gains `setPrototypeOf(value)`, implementing ES2015 9.1.2
  `OrdinarySetPrototypeOf`: same-value short-circuit (`true`), reject a
  non-null non-`EngineObject` value, reject when the receiver is not
  extensible, walk the candidate's existing prototype chain to reject a
  cycle (including `value === this`), otherwise replace `_prototype`.
- `Object.setPrototypeOf(target, proto)` (19.1.2.19): built-in wiring over
  the above, throwing a guest `TypeError` on a non-object target or a
  rejected `[[SetPrototypeOf]]`.
- `Object.is(a, b)` (19.1.2.10 / 7.2.9 `SameValue`): distinguishes `NaN` from
  `NaN` (equal) and `+0` from `-0` (not equal), otherwise same as `===`.
  Small, self-contained, and a natural pairing with `setPrototypeOf` in the
  same built-in family.
- `Object.assign` is **not** added — it isn't named in the issue's scope
  bullets, it's a convenience built-in rather than an ordinary-object
  internal-method update, and it isn't needed by any later syntax issue.
  Left for a future built-ins pass if wanted.

## Non-goals (explicitly deferred to other issues)

- Symbols, `Symbol.prototype`, well-known symbols (#43).
- `let`/`const`, TDZ (#41).
- Concise/shorthand methods and computed property names in object literals,
  arrow functions, classes, `super(...)` calls, default/rest/destructured
  parameters (#25).
- `Object.assign` and `Reflect.*` other than `Reflect.ownKeys` (the Symbol
  integration adds that method to expose `OrdinaryOwnPropertyKeys` ordering).

## Testing

- New/updated local suites (registered in `test/suites.js`) for: property key
  ordering, function name/length across every `NamedEvaluation` context
  listed above, `[[HomeObject]]`/`super` resolution (unit-level for the
  runtime helpers, plus end-to-end guest scripts through the new grammar),
  method non-constructibility, `Object.setPrototypeOf`, `Object.is`.
- Focused Test262 coverage: hand-picked upstream files (not the ES5
  `upstream-subset.json`/`es5-selection.json` pipeline, which is ES5-scoped
  and shared with sibling branches) covering `test/language/expressions/
function/name.js`, `test/language/statements/function/name.js`,
  `test/built-ins/Function/prototype/bind/{name,length}.js`,
  `test/language/expressions/object/{getter,setter}-prop-desc.js`,
  `test/language/expressions/object/{getter,setter}-super-prop.js`,
  `test/built-ins/Object/keys/return-order.js`,
  `test/built-ins/Object/getOwnPropertyNames/order-after-define-property.js`,
  `test/built-ins/Object/setPrototypeOf/**`, `test/built-ins/Object/is/**`.
  Run via the existing Node CLI adapter against `vendor/test262`, recorded as
  a small checked-in list plus a documented command in `docs/conformance.md`
  (a new "ES2015 focused coverage" section) rather than folded into the ES5
  selection JSON.
- `npm run test:node`, `npm run test:browser`, `npm run test:jsc`, and
  `npm run ci:contract` must all stay green (ES5 regression + the new
  suites), per the issue's "Node, Chromium, and JSC reports remain
  equivalent" / "All CI contracts pass" bar inherited from parent #26.

## Risks / open questions

- The `super` grammar addition is the highest-risk piece: it's the one place
  this issue touches parsing at all. If it proves too invasive once
  attempted, the fallback is to implement `[[HomeObject]]`, `makeMethod`,
  and the receiver-aware property resolution purely as unit-tested runtime
  primitives with no parser change, documenting `super` syntax itself as
  deferred to #25 alongside classes (which are `super`'s more common home).
  This will be decided during implementation and called out in the PR if the
  fallback is taken.
