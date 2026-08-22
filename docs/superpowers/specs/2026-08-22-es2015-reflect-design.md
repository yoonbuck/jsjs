# ES2015 Reflect Design

## Status and decision

Issue [#80](https://github.com/yoonbuck/jsjs/issues/80) is the M1 atomic
roadmap node. This design is based exactly on
`54c2bf7302d16be40b6157b57bca3985fb0388a1`, the squash merge for #79/M0.
That base provides the complete Sixth Edition Table 5 object internal-method
contract, the private Table 6 `[[Call]]`/`[[Construct]]` capabilities, active
execution-Realm tracking, and generic roadmap-authority projection support.

Implement the approved Reflect surface as thin Realm-owned built-in wrappers
over those existing seams:

- `apply`
- `construct`
- `defineProperty`
- `deleteProperty`
- `get`
- `getOwnPropertyDescriptor`
- `getPrototypeOf`
- `has`
- `isExtensible`
- `ownKeys`
- `preventExtensions`
- `set`
- `setPrototypeOf`
- `@@toStringTag`

`Reflect.enumerate` remains absent. No Proxy behavior is part of M1.

This document is design only. It does not contain an implementation plan and
does not authorize production, generated-output, or authority-state changes.

## Reviewed baseline

The design reconciles these sources:

- #70, the core ES2015 conformance parent;
- #71 and
  `docs/superpowers/specs/2026-08-18-core-es2015-conformance-roadmap-design.md`;
- #80 and exact ledger comment
  [5347039001](https://github.com/yoonbuck/jsjs/issues/80#issuecomment-5347039001);
- #79/M0 design and implementation at the exact base;
- ECMA-262 Sixth Edition sections 7.1.15, 7.3.17, and 26.1;
- pinned Test262
  `b363f29d3c43c626dc852744ad64a0b48a003693`;
- the current Reflect, object-contract, capability, descriptor, conversion,
  Realm, hostile-exotic, provenance, and focused-Test262 code and tests.

At the design base:

- `src/builtins/reflect.js` exposes only `Reflect.ownKeys`;
- all twelve Table 5 operations are polymorphic `EngineObject` methods;
- `src/runtime/capabilities.js` owns unforgeable call and construct brands and
  the only guest dispatch terminals;
- `createListFromArrayLike` incorrectly uses `ToUint32`;
- the full pinned `test/built-ins/Reflect/` taxonomy is 153 roots / 306
  variants;
- 40 roots / 80 variants are already selected-passing;
- the exact M1 source ledger is 113 roots / 226 variants, all core and all
  currently blocked by `proxy-and-reflect-metaobject`;
- the ledger is code-unit sorted, unique, newline-terminated, and has SHA-256
  `65529ed8f9bdf88576314e95f4f164ac2c613e9ec44f0aae042a79aa5f8706b4`;
  and
- the base taxonomy file has SHA-256
  `7d366c58f83e635cfe92993f67bab9d6e4d7ef49184cdc7b85b96180cdaf89a4`.

The taxonomy hash records the design baseline only. The future M1 authority
must pin the taxonomy bytes at its own canonical preparation base rather than
copy this value if main has moved.

## Goals

- Expose the complete approved 13-method Reflect API with exact names, lengths,
  descriptors, and non-constructor behavior.
- Route every object operation directly through the #79 Table 5 seam.
- Route `apply` and `construct` only through the #79 capability predicates and
  dispatch helpers.
- Preserve exact validation, coercion, receiver-presence, and abrupt-completion
  order.
- Return internal-method booleans rather than converting false into throws.
- Materialize validation errors in the Reflect method's owning Realm.
- Allocate returned descriptor objects and own-key arrays in the Reflect
  method's owning Realm.
- Introduce one correct shared `ToLength` and
  `CreateListFromArrayLike`, including safe regressions for
  `Function.prototype.apply`.
- Prove the public wrappers against ordinary objects, a hostile synthetic
  exotic, and cross-Realm/cross-Agent calls.
- Execute only the exact 113-root M1 Test262 source ledger locally under
  `TZ=UTC`.
- Produce generic six-file M1 evidence in ignored scratch storage before any
  protected generated output changes.
- Prepare M1 authority in a separate data-only PR, then consume that reviewed
  pending record once in the single semantic M1 PR.

## Strict non-goals

- `Reflect.enumerate`. The pinned tree intentionally asserts that it is absent.
  Although the original Sixth Edition text contained the short-lived method,
  the approved repository surface and pinned Test262 use the removed surface.
- Proxy construction, traps, revocation, invariants, or Proxy-recursive brands.
  Issue #81/M2 owns all of them.
- Making the ten Proxy-tagged M1 roots pass without Proxy.
- Calling the host's `Reflect`, `Object`, `Function.prototype.apply`, or
  equivalent host metaobject APIs to implement guest behavior.
- Adding another internal-method table, symbol-keyed dispatch layer, class-name
  dispatch, duck-typed callability, or direct ordinary-slot access.
- Reworking Table 5 signatures, capability brands, active execution-Realm
  tracking, ordinary object algorithms, or existing exotic implementations.
- Proper-tail-call implementation for the Sixth Edition
  `PrepareForTailCall` step in `Reflect.apply`; #97/G1 owns PTC.
- Immutable Prototype Exotic Object behavior for `%Object.prototype%`.
- Broadly enabling the Test262 `Reflect` or `Proxy` feature tags.
- Broad/full local Test262 execution.
- Changing authority checker policy in the semantic consumer PR.
- Treating resource exhaustion from a genuinely enormous readable argument
  list as permission to restore 32-bit length wrapping or a non-standard
  semantic cap.

## Public object and property contract

`Reflect` remains an ordinary `EngineObject` whose prototype is the Realm's
`%ObjectPrototype%`. It has no call or construct capability and no own
`prototype` property. The global `Reflect` property remains writable,
non-enumerable, and configurable.

Each method is a Realm-owned `NativeFunction` with:

- the exact name below;
- the exact `length` below;
- no construct capability and no own `prototype` property;
- a non-writable, non-enumerable, configurable `name`;
- a non-writable, non-enumerable, configurable `length`; and
- a writable, non-enumerable, configurable data property on `Reflect`.

| Property                   | `length` | Semantic terminal       |
| -------------------------- | -------: | ----------------------- |
| `apply`                    |        3 | Table 6 `Call`          |
| `construct`                |        2 | Table 6 `Construct`     |
| `defineProperty`           |        3 | `[[DefineOwnProperty]]` |
| `deleteProperty`           |        2 | `[[Delete]]`            |
| `get`                      |        2 | `[[Get]]`               |
| `getOwnPropertyDescriptor` |        2 | `[[GetOwnProperty]]`    |
| `getPrototypeOf`           |        1 | `[[GetPrototypeOf]]`    |
| `has`                      |        2 | `[[HasProperty]]`       |
| `isExtensible`             |        1 | `[[IsExtensible]]`      |
| `ownKeys`                  |        1 | `[[OwnPropertyKeys]]`   |
| `preventExtensions`        |        1 | `[[PreventExtensions]]` |
| `set`                      |        3 | `[[Set]]`               |
| `setPrototypeOf`           |        2 | `[[SetPrototypeOf]]`    |

The Agent-owned well-known `@@toStringTag` key is installed directly on the
Reflect object with value `"Reflect"` and attributes:

```text
{ writable: false, enumerable: false, configurable: true }
```

Agent well-known symbols already exist before Reflect intrinsics are built, so
this property does not depend on the later installation of the Realm's
`Symbol` constructor.

Every method ignores its JavaScript `this` value. Detached calls are valid; only
the explicit algorithm arguments are validated.

## Architecture

### Reflect wrappers

`src/builtins/reflect.js` owns the complete public surface. Its methods are
algorithm adapters, not alternate object semantics:

- normalize only the operands that ECMA-262 normalizes;
- dispatch exactly once through the corresponding Table 5 method or Table 6
  capability terminal;
- return the seam's result unchanged except for the specified
  `FromPropertyDescriptor` or `CreateArrayFromList` allocation; and
- introduce no `throwOnError`, strictness, Proxy, ordinary-helper, or
  representation shortcut.

The existing #79 repository invariants continue to forbid direct ordinary slot
access and direct `callFunction`/`constructFunction` dispatch. Reflect must not
import or call `ordinary*` helpers. An exotic override is therefore observed
exactly as it is by every other semantic caller.

### Table 5 mapping

The object-target methods require an `EngineObject`, then use the public
polymorphic method:

| Reflect method             | Engine operation                            |
| -------------------------- | ------------------------------------------- |
| `defineProperty`           | `target.defineOwnProperty(key, descriptor)` |
| `deleteProperty`           | `target.delete(key)`                        |
| `get`                      | `target.get(key, receiver)`                 |
| `getOwnPropertyDescriptor` | `target.getOwnProperty(key)`                |
| `getPrototypeOf`           | `target.getPrototypeOf()`                   |
| `has`                      | `target.hasProperty(key)`                   |
| `isExtensible`             | `target.isExtensible()`                     |
| `ownKeys`                  | `target.ownPropertyKeys()`                  |
| `preventExtensions`        | `target.preventExtensions()`                |
| `set`                      | `target.set(key, value, receiver)`          |
| `setPrototypeOf`           | `target.setPrototypeOf(prototype)`          |

No method turns a false result into an exception. In particular:

- `defineProperty`, `deleteProperty`, `preventExtensions`, `set`, and
  `setPrototypeOf` return `false` unchanged;
- `has` and `isExtensible` return the protocol boolean unchanged; and
- no wrapper applies host `Boolean(...)` to an internal-method result.

The M0 contract makes those return values booleans. A hostile test exotic
proves true and false forwarding; production wrappers do not compensate for a
malformed internal implementation by inventing coercion.

### Table 6 mapping

`Reflect.apply` and `Reflect.construct` use only:

- `isCallable`/`requireCallable`;
- `isConstructor`/`requireConstructor`;
- `callCallable`; and
- `constructCallable`.

The predicates are validation seams and the dispatch helpers are execution
terminals. A host object with `callFunction`, `constructFunction`,
`_isConstructor`, or a `"Function"` class tag remains non-callable and
non-constructible.

`Reflect.construct` passes the independently validated `newTarget` unchanged to
`constructCallable`. Existing ordinary, class, bound, and native construction
then allocate and initialize through the active new target exactly as they do
for the `new` operator.

### Shared conversions

`src/runtime/conversion.js` owns the reusable `ToLength` conversion.
`src/builtins/shared.js` owns one specification-shaped
`CreateListFromArrayLike` used by both Reflect and
`Function.prototype.apply`.

The helper is dense and has no `preserveHoles` mode. A missing indexed property
contributes `undefined`, as required for argument lists. If a separate internal
consumer ever needs sparse preservation, it must use a separately named helper
rather than changing this abstract operation.

### Realm allocation

The Reflect method's closure captures its owning Realm:

- `getOwnPropertyDescriptor` passes that Realm to
  `fromPropertyDescriptor`, so a returned descriptor inherits from that
  Realm's `%ObjectPrototype%`;
- `ownKeys` creates its `EngineArray` with that Realm's `%ArrayPrototype%`;
- all method functions and local validation errors use that Realm's
  intrinsics; and
- call/construct results and target-thrown values are returned by identity,
  regardless of their owning Realm or Agent.

No Realm is inferred from the target, property key, receiver, argument-list
object, or constructed result.

## Exact algorithms and validation order

The following ordering is normative for this design. “Present” means the
argument position exists in the actual call, determined by `args.length`; it
does not mean the value is non-`undefined`.

### `Reflect.apply(target, thisArgument, argumentsList)`

1. Validate `target` with the callable capability.
2. Run `CreateListFromArrayLike(argumentsList)`.
3. Call `target` with `thisArgument` and the completed list.
4. Return the target result unchanged.

An invalid target wins over an invalid or hostile argument list. Unlike
`Function.prototype.apply`, nullish `argumentsList` is not an empty-list
special case; it is a TypeError.

### `Reflect.construct(target, argumentsList[, newTarget])`

1. Validate `target` with the constructor capability.
2. If argument position 2 is absent, set `newTarget` to `target`.
3. Otherwise validate the supplied `newTarget` independently with the
   constructor capability.
4. Run `CreateListFromArrayLike(argumentsList)`.
5. Construct `target` with the completed list and validated `newTarget`.
6. Return the constructed object unchanged.

The precedence is target, explicit new target, then argument list. An explicit
`undefined` new target is present and throws; omission defaults to `target`.
A callable-only target and a constructor target with a callable-only new target
fail at their respective independent checks.

### `Reflect.defineProperty(target, propertyKey, attributes)`

1. Require an object target.
2. Run `ToPropertyKey(propertyKey)`.
3. Run `ToPropertyDescriptor(attributes)` in its existing field order.
4. Call `target.[[DefineOwnProperty]](key, descriptor)`.
5. Return its boolean unchanged.

Property-key coercion precedes validation or observation of `attributes`.
Descriptor getter order remains `enumerable`, `configurable`, `value`,
`writable`, `get`, `set`. A false definition result is not an exception.

### `Reflect.deleteProperty(target, propertyKey)`

1. Require an object target.
2. Run `ToPropertyKey(propertyKey)`.
3. Call `target.[[Delete]](key)`.
4. Return its boolean unchanged.

### `Reflect.get(target, propertyKey[, receiver])`

1. Require an object target.
2. Run `ToPropertyKey(propertyKey)`.
3. If argument position 2 is absent, set `receiver` to `target`.
4. Otherwise retain the supplied value, including explicit `undefined`,
   `null`, or a primitive.
5. Return `target.[[Get]](key, receiver)`.

No receiver coercion or validation occurs.

### `Reflect.getOwnPropertyDescriptor(target, propertyKey)`

1. Require an object target.
2. Run `ToPropertyKey(propertyKey)`.
3. Call `target.[[GetOwnProperty]](key)`.
4. Propagate an abrupt completion.
5. Return `FromPropertyDescriptor` in the Reflect method Realm.

An absent property returns `undefined`. A descriptor is detached by the M0
contract before conversion.

### `Reflect.getPrototypeOf(target)`

1. Require an object target.
2. Return `target.[[GetPrototypeOf]]()`.

### `Reflect.has(target, propertyKey)`

1. Require an object target.
2. Run `ToPropertyKey(propertyKey)`.
3. Return `target.[[HasProperty]](key)`.

### `Reflect.isExtensible(target)`

1. Require an object target.
2. Return `target.[[IsExtensible]]()`.

Primitives throw rather than receiving `Object.isExtensible`'s primitive
fallback behavior.

### `Reflect.ownKeys(target)`

1. Require an object target.
2. Call `target.[[OwnPropertyKeys]]()`.
3. Propagate an abrupt completion.
4. Create and return a dense Realm-owned array from the exact key list.

Key identity and order are not changed. String and Symbol keys remain in the
Table 5 order supplied by the target.

### `Reflect.preventExtensions(target)`

1. Require an object target.
2. Return `target.[[PreventExtensions]]()` unchanged.

False is a normal result, unlike `Object.preventExtensions`, which is an
object-returning must-succeed wrapper.

### `Reflect.set(target, propertyKey, value[, receiver])`

1. Require an object target.
2. Run `ToPropertyKey(propertyKey)`.
3. If argument position 3 is absent, set `receiver` to `target`.
4. Otherwise retain the supplied receiver exactly.
5. Return `target.[[Set]](key, value, receiver)` unchanged.

`value` and `receiver` are not coerced. An explicit primitive receiver may make
ordinary data-property assignment return false, while an accessor setter still
receives that primitive as its `this` value.

### `Reflect.setPrototypeOf(target, proto)`

1. Require an object target.
2. Require `proto` to be an `EngineObject` or `null`.
3. Return `target.[[SetPrototypeOf]](proto)` unchanged.

Target validation precedes prototype validation. Prototype validation precedes
target dispatch. A valid but rejected prototype update returns false.

## Ordering and presence invariants

Tests must pin these conflict cases, not only happy paths:

- invalid object target before property-key coercion;
- invalid callable target before argument-list object validation or `length`
  access;
- invalid constructor target before explicit new-target validation;
- invalid explicit new target before argument-list validation or `length`
  access;
- property-key abrupt completion before descriptor observation in
  `defineProperty`;
- descriptor abrupt completion before `[[DefineOwnProperty]]`;
- property-key abrupt completion before every keyed Table 5 dispatch;
- invalid `proto` before `[[SetPrototypeOf]]`;
- argument-list `length` abrupt completion before indexed reads;
- indexed reads in ascending order before call/construct dispatch;
- omitted receiver versus explicitly supplied `undefined` for `get` and `set`;
- omitted new target versus explicitly supplied `undefined` for `construct`;
  and
- no target invocation after any validation, coercion, or list-building abrupt
  completion.

The wrappers use argument count, never `value === undefined`, to implement
presence distinctions.

## Error and Realm rules

### Validation errors

Native built-in entry already runs each method body with the method Realm as
the active execution and object-operation Realm. Reflect validation therefore
throws `GuestErrorSignal` and relies on the existing native-function boundary
to materialize the method Realm's guest error.

The following detected errors belong to the Reflect method Realm:

- non-object Table 5 targets;
- non-callable `apply` targets;
- non-constructible `construct` targets or explicit new targets;
- non-object Reflect argument lists;
- invalid `setPrototypeOf` prototypes;
- invalid property descriptors or non-callable accessors; and
- conversion failures such as `ToNumber(Symbol)` while evaluating
  `ToLength`.

A detached Reflect method imported from Realm B and called by code in Realm A
therefore produces Realm B's `%TypeError%` for its own validation failures.

### Abrupt completion propagation

Reflect never broad-catches target or user-code abrupt completions.

- A thrown value from `@@toPrimitive`, `valueOf`, `toString`, a descriptor
  getter, `length`, or an indexed argument getter is preserved by identity.
- A thrown value from a target Table 5 override is preserved by identity.
- A thrown value from the called or constructed target is preserved by
  identity.
- A `ThrowSignal` already carrying a guest error is not converted into a new
  Reflect-Realm error.
- Host defects are not translated into false, `undefined`, or a guest success.

The same rules apply across Agents. Existing call-chain linking and active
Realm restoration remain the only cross-Agent machinery.

### Result ownership

- Plain booleans, primitives, and target results keep their identity/value.
- `Reflect.getOwnPropertyDescriptor` creates only its descriptor wrapper in the
  method Realm; descriptor field values are not cloned.
- `Reflect.ownKeys` creates only its result array in the method Realm; Symbol
  and string elements are not cloned.
- `Reflect.construct` lets the target/new-target construction algorithms decide
  object prototype and Realm. Reflect does not retarget the result afterward.

## Correct `ToLength`

Add one `toLength(value, callerRealm)` conversion with the Sixth Edition
algorithm:

1. compute `ToInteger(value)` exactly once;
2. if the result is less than or equal to `+0`, return `+0`;
3. if it is `+Infinity`, return `2^53 - 1`; and
4. otherwise return `min(integer, 2^53 - 1)`.

This preserves `-0` normalization, truncates fractions toward zero through
`ToInteger`, maps `NaN` to `+0`, maps negative values to `+0`, and never wraps
modulo `2^32`.

`Number.MAX_SAFE_INTEGER` is the implementation constant for `2^53 - 1`. The
conversion performs no host bitwise operation and no `ToUint32`.

## Correct `CreateListFromArrayLike`

The shared helper performs:

1. require an `EngineObject`;
2. `Get(object, "length")` once with the object as receiver;
3. `ToLength` of that value;
4. start with an empty host list;
5. for each integer index from zero to `length - 1`, in ascending order:
   - convert the index to its canonical decimal string;
   - `Get(object, indexName)` with the object as receiver;
   - append the result, including `undefined`;
6. return the dense list.

The helper must not allocate `new Array(length)` from guest-controlled length.
A host array's length is limited to `2^32 - 1`, while `ToLength` reaches
`2^53 - 1`; preallocation would throw a host `RangeError` before the required
first indexed `Get`. Incremental append permits safe early-abrupt tests at
lengths above `2^32` and avoids the current modulo wrap.

The default element-type set is every ECMAScript language type, so Reflect and
Function apply perform no per-element type rejection.

## `Function.prototype.apply` compatibility

The shared-helper correction is observable outside Reflect and must retain
Function apply's distinct algorithm:

1. validate the receiver as callable before inspecting the argument array;
2. preserve `null` or `undefined` as the special empty-list case;
3. otherwise require an object and use the shared
   `CreateListFromArrayLike`;
4. call with the supplied `thisArgument`; and
5. preserve target result and abrupt completion.

Portable regressions cover:

- `length: -1` produces zero arguments instead of unsigned wrap;
- `length: NaN` and `length: -0` produce zero arguments;
- fractional positive length truncates toward zero;
- a `length` object is coerced exactly once;
- inherited indexed values are read;
- holes become explicit `undefined` arguments;
- a `length` of `2^32` or greater with an abrupt getter at index `"0"`
  reaches that getter instead of wrapping to zero or failing during host-array
  preallocation;
- direct `ToLength(Infinity)` returns `Number.MAX_SAFE_INTEGER`, while Function
  apply with an infinite length and an immediate abrupt index getter proves
  finite observable ordering without attempting to materialize that list;
- an abrupt `length` or indexed getter prevents target invocation; and
- callable validation still wins over every argument-array effect.

Reflect apply/construct regressions separately prove that their omitted or
nullish argument lists throw rather than using Function apply's empty-list
special case.

## Portable test design

### Reflect surface suite

A dedicated portable Reflect suite covers:

- ordinary-object shape and `%ObjectPrototype%`;
- non-callable/non-constructible Reflect object;
- global property attributes;
- `@@toStringTag` value, attributes, and
  `Object.prototype.toString.call(Reflect)`;
- all method names, lengths, descriptors, detached-call behavior, and
  non-constructor behavior;
- absence of `Reflect.enumerate`;
- happy-path behavior for all 13 methods;
- string and Symbol property keys;
- own and inherited accessors;
- descriptor conversion and descriptor result shape;
- own-key ordering and Realm-owned array descriptors;
- true/false return forwarding; and
- omitted-argument distinctions.

### Hostile exotic seam probes

Reuse and extend `test/harness/hostile-exotic.js`. The synthetic exotic records
each Table 5 call, operands, active Realm, selected return value, and optional
abrupt completion without consulting ordinary storage.

For every Table 5-backed Reflect method, tests prove:

- the expected method is called exactly once;
- no neighboring method or ordinary helper is used;
- keys are normalized before dispatch;
- receiver, value, descriptor, and prototype operands are exact;
- true and false are returned unchanged;
- target abrupt completion is preserved by identity;
- validation/coercion failure prevents dispatch; and
- the active object-operation Realm is the Reflect method Realm.

Call/construct probes use branded guest/native functions and shape-spoofing
objects. They prove capability-only validation, argument order, new-target
identity, target result identity, and abrupt propagation.

The ten Proxy-tagged upstream cases receive hostile-exotic coverage at the
Table 5 seam. These probes establish Reflect's half of the interaction without
pretending to implement Proxy.

### Cross-Realm and cross-Agent probes

Portable tests use two Realms on one Agent and two Realms on separate Agents.
They cover:

- detached foreign Reflect methods called by a local Realm;
- validation errors inheriting from the foreign method Realm's
  `%TypeErrorPrototype%`;
- a local thrown sentinel from coercion or target dispatch preserved by
  identity;
- `getOwnPropertyDescriptor` result prototype belonging to the method Realm;
- `ownKeys` result array prototype belonging to the method Realm;
- foreign target accessors receiving the exact explicit/default receiver;
- `apply` executing the target in its own function Realm while retaining the
  supplied `thisArgument`;
- `construct` using target and new-target capabilities independently and
  allocating through the supplied new target; and
- active Realm stacks restored after normal and abrupt completion.

No probe depends on host `Proxy`, host Realms, or host `Reflect`, so the same
suite runs under Node, Chromium, and JavaScriptCore.

## Exact M1 Test262 corpus

The GitHub ledger comment is the only source corpus. A scratch
`M1.paths.txt` is reconstructed byte-for-byte, then rejected unless it is:

- newline-terminated;
- code-unit sorted and unique;
- exactly 113 paths;
- exactly 226 taxonomy variants;
- entirely core;
- entirely under `test/built-ins/Reflect/`; and
- SHA-256
  `65529ed8f9bdf88576314e95f4f164ac2c613e9ec44f0aae042a79aa5f8706b4`.

The source distribution and expected no-Proxy candidate promotion are:

| Surface                    | Source roots | Proxy residual | Candidate promotion |
| -------------------------- | -----------: | -------------: | ------------------: |
| `@@toStringTag`            |            1 |              0 |                   1 |
| `apply`                    |            8 |              0 |                   8 |
| `construct`                |            8 |              0 |                   8 |
| `defineProperty`           |           10 |              1 |                   9 |
| `deleteProperty`           |            9 |              1 |                   8 |
| `get`                      |            9 |              0 |                   9 |
| `getOwnPropertyDescriptor` |           11 |              1 |                  10 |
| `getPrototypeOf`           |            8 |              1 |                   7 |
| `has`                      |            8 |              1 |                   7 |
| `isExtensible`             |            6 |              1 |                   5 |
| `ownKeys`                  |            1 |              1 |                   0 |
| `preventExtensions`        |            8 |              2 |                   6 |
| `set`                      |           16 |              0 |                  16 |
| `setPrototypeOf`           |           10 |              1 |                   9 |
| **Total**                  |      **113** |         **10** |             **103** |

Every source root has two executable variants. The candidate disposition is
therefore 103 roots / 206 variants selected-passing and 10 roots / 20 variants
remaining blocked for #81. These counts are an evidence expectation, not a
substitute for exact execution.

The ten Proxy-owned residual roots are:

```text
test/built-ins/Reflect/defineProperty/return-abrupt-from-result.js
test/built-ins/Reflect/deleteProperty/return-abrupt-from-result.js
test/built-ins/Reflect/getOwnPropertyDescriptor/return-abrupt-from-result.js
test/built-ins/Reflect/getPrototypeOf/return-abrupt-from-result.js
test/built-ins/Reflect/has/return-abrupt-from-result.js
test/built-ins/Reflect/isExtensible/return-abrupt-from-result.js
test/built-ins/Reflect/ownKeys/return-abrupt-from-result.js
test/built-ins/Reflect/preventExtensions/return-abrupt-from-result.js
test/built-ins/Reflect/preventExtensions/return-boolean-from-proxy-object.js
test/built-ins/Reflect/setPrototypeOf/return-abrupt-from-result.js
```

They keep the shared `proxy-and-reflect-metaobject` blocker and move to issue
#81 in owner evidence. The blocker name is not changed merely to make a
path-only query reach zero.

A bounded M1 runner:

- requires `TZ=UTC`;
- verifies the package pin and clean pinned checkout;
- accepts only the exact ledger, never a selector or directory;
- verifies source taxonomy identity and per-root metadata;
- supplies only each reviewed root's own feature metadata;
- executes all 226 variants and no foreign root;
- writes one ignored scratch execution document atomically; and
- returns nonzero for genuine failures while preserving complete evidence.

The runner must not invoke broad upstream, release, audit regeneration, or
selection commands as a side effect.

The 40 already selected Reflect roots / 80 variants remain regression coverage.
They are not added to the M1 source ledger or promotion again.

## Scratch evidence lifecycle

Before authority preparation, all candidate evidence is generated under an
ignored repository path such as `.superpowers/issue-80/m1/`. No candidate
evidence or generated output is written to a tracked protected path.

Scratch contains:

- the exact newline ledger;
- the complete 226-record execution document;
- the six candidate generic evidence JSON files;
- candidate projected taxonomy, audit, subset, report, and conformance bytes;
- every file SHA-256;
- every per-path projection SHA-256; and
- the canonical aggregate protected-projection SHA-256.

Generation is fail-closed and atomic. A failed, skipped unexpectedly,
incomplete, duplicate, foreign, or partially written run cannot produce
success-shaped evidence.

## Generic six-file M1 evidence

The tracked names reserved for the consumer are:

1. `tools/test262/es2015-m1-paths.json`
2. `tools/test262/es2015-m1-baseline.json`
3. `tools/test262/es2015-m1-disposition.json`
4. `tools/test262/es2015-m1-owner-deltas.json`
5. `tools/test262/es2015-m1-owner-map.json`
6. `tools/test262/es2015-m1-promotion.json`

The consumer also adds
`tools/test262/es2015-m1-paths.txt` as the exact newline source ledger used by
the bounded runner. That text file byte-matches the GitHub comment and is not
one of the six authority evidence JSON files.

They use the generic non-H0 schemas already enforced by the BASE checker:

### Paths

A pretty-printed, newline-terminated JSON array of the exact 113 sorted path
strings. Its canonical newline path-list hash must equal the GitHub ledger hash.

### Baseline

A sorted JSON array containing the complete BASE taxonomy classification object
for each source path. It covers exactly 113 roots / 226 variants and byte-value
matches the corresponding BASE records, including features, flags, includes,
partition, status, blocker, and provenance metadata.

### Disposition

An object with exactly one `destinations` array. Each sorted entry has exactly
the keys `path`, `status`, `blocker`, and `issue`. For example:

```json
{
  "path": "test/built-ins/Reflect/...",
  "status": "selected-passing",
  "blocker": null,
  "issue": 80
}
```

`status` is one of `selected-passing`, `audit-passing-unselected`, or
`blocked:<blocker>`. Blocked entries carry their exact blocker and owner issue.
Selected M1 entries use issue 80. The expected Proxy residual uses
`blocked:proxy-and-reflect-metaobject`, blocker
`proxy-and-reflect-metaobject`, issue 81.

No root is promoted unless every expected variant passed. No partial-root
promotion is allowed.

### Owner deltas

A sorted array containing exactly the non-promoted disposition entries. Under
the expected execution it contains the ten Proxy residual rows and no selected
row.

### Owner map

A sorted unique array of destination classes represented by owner deltas, using
authority-level status names. Under the expected execution it is:

```json
[
  {
    "status": "blocked",
    "blocker": "proxy-and-reflect-metaobject",
    "issue": 81
  }
]
```

### Promotion

A named generic promotion schema-v2 document with group
`es2015/m1-reflect`. It pins:

- the Test262 repository and revision;
- the exact BASE taxonomy SHA-256;
- the SHA-256 of the newline-terminated promoted path list;
- complete promoted root and variant counts; and
- sorted entries containing path, variants, exact features, and exact
  include-derived features.

Only complete-pass roots appear. The expected document contains 103 roots /
206 variants. The generic schema remains valid if reviewed execution changes
that count; authority preparation pins the actual complete evidence rather than
the expectation.

The 113-source ledger hash and promotion-ledger hash are different identities
and must never be interchanged.

## Promotion integration without broad feature enablement

The exact M1 promotion joins the existing deterministic promotion inputs used
by selection, upstream execution, audit verification, and promoted-report
synchronization.

The integration remains explicit and path-authorized:

- no directory scan or “all roadmap promotions” wildcard;
- no global `Reflect` entry is added to `tools/test262/features.json` merely to
  make tests run;
- the named promotion authorizes only metadata dependencies recorded for its
  exact entries;
- the generated subset contains one sorted
  `es2015/m1-reflect` group; and
- the regular upstream runner supplies M1 feature authorization only for those
  exact paths.

T0 and H0 retain their existing schemas and behavior. M1 uses the named generic
v2 parser and does not coerce its evidence into H0-specific structures.

## Protected outputs

The pending M1 authority is expected to own this closed projection:

- `docs/conformance.md` — project only the generated coverage block;
- `docs/test262-report.jsonl` — project the canonical selected report;
- `tools/test262/es2015-audit-evidence.json` — `replace-exact` with reviewed
  complete M1 variant evidence and every foreign record/document field
  preserved;
- the six M1 evidence files — `add-exact`;
- `tools/test262/es2015-taxonomy.json` — project only source-ledger
  classifications and required derived hashes/summaries;
- `tools/test262/upstream-subset.json` — project the exact named promotion
  group.

The authority record pins the exact BASE hashes, exact evidence hashes,
per-output head/projection hashes, allowed destinations, source root/variant
counts, source path SHA, and canonical aggregate projection SHA.

For conformance, report, taxonomy, and subset projections, the existing generic
derived identity binds:

```text
output path
NUL
source path SHA-256
NUL
promotion file SHA-256
NUL
owner-deltas file SHA-256
NUL
```

Audit evidence additionally receives semantic verification of exact variants,
terminal records, source completeness, and foreign-record preservation before
its exact BASE/HEAD hashes are registered. The current BASE checker authorizes
that artifact as `replace-exact`; it is not misrepresented as a generic
unchanged-record projection.

Manual source, tests, and explanatory documentation remain outside the
generated projection and receive ordinary review. No protected path may be
renamed, copied, deleted, aliased, or partially updated.

## Authority lifecycle

### Data-only preparation PR

After the semantic candidate and all scratch evidence are stable, a separate
PR based on canonical main adds exactly one code-sorted M1 authority record in
`pending` state.

That PR:

- uses the existing ordered `es2015-roadmap-authority-prepare` marker;
- changes only `tools/test262/es2015-provenance.json` unless an already allowed
  authority-documentation path is strictly necessary;
- pins code `M1`, issue 80, parent 70;
- uses source root count 113, variant count 226, and path SHA
  `65529ed8f9bdf88576314e95f4f164ac2c613e9ec44f0aae042a79aa5f8706b4`;
- uses `source.entryLedgerSha256: null`;
- pins the six immutable evidence hashes and the closed protected projection;
- preserves every existing authority, profile, fragment, and checker byte; and
- contains no source, test, evidence, generated output, workflow, or checker
  change.

It is inert until merged. It receives independent review as authority data.

M1 remains an atomic roadmap node: this prerequisite PR changes no guest
behavior. Exactly one later consumer PR owns the semantic Reflect delivery.

### Consumer PR

The semantic PR rebases onto the merged preparation commit and uses exactly one
ordered `es2015-roadmap-authority-consume` marker.

It may:

- implement the approved Reflect and shared conversion behavior;
- add focused portable tests and bounded M1 tooling;
- add the exact source ledger and six reviewed evidence files;
- apply every registered protected output exactly;
- change only the M1 authority state from `pending` to `applied`; and
- update directly related manual documentation.

It may not:

- alter any other field of the M1 record;
- add or modify another authority;
- change checker policy, range profiles, decision fragments, or workflows;
- omit or partially apply a protected output;
- consume an `applied` or HEAD-only authority; or
- replay the authority after merge.

The BASE checker validates BASE before HEAD, exact pending-to-applied identity,
nonzero projection, evidence bytes, semantic projections, and the aggregate
consumer marker hash.

If implementation or evidence changes after authority preparation, the
consumer must stop. It may not silently repin hashes in the semantic PR.
Correction requires the separately reviewed authority process permitted by the
then-current BASE policy.

## Reclassification and closure

M1 closure uses the exact source-ledger disposition, not a misleading raw path
count.

Expected post-consumer state:

- 103 source roots / 206 variants become selected-passing for #80;
- 10 source roots / 20 variants remain blocked and are owned by #81;
- all 40 previously selected Reflect roots / 80 variants remain passing;
- the full Reflect taxonomy becomes 143 selected roots / 286 variants plus
  10 Proxy-owned blocked roots / 20 variants;
- every denominator remains balanced; and
- no path is dropped, duplicated, or reported as passing because it was
  skipped.

An owner-aware M1 selector reaches zero. The shared path/blocker predicate may
still name the ten #81 roots; owner deltas and the exact non-additive ledger are
the closure proof. The blocker is not renamed solely for cosmetic zeroing.

Post-merge evidence records:

- exact merge SHA and reviewed head;
- exact-main CI and CodeQL;
- M1 authority state `applied`;
- exact source, promotion, and owner-delta hashes;
- selected and residual counts;
- balanced refreshed taxonomy totals; and
- #80/#81/#70/V0 ownership updates.

## Performance and portability

Reflect wrappers add only constant validation plus the specified operation.
Table 5 methods dispatch once. No per-object method table, Proxy branch, host
reflection, or extra descriptor copy is introduced beyond the required public
result.

`CreateListFromArrayLike` is `O(length)` with:

- one `length` Get;
- one length coercion;
- one indexed Get per element;
- one append per element; and
- no preliminary sparse scan or guest-length preallocation.

Incremental append may grow a host array for ordinary small calls, but it avoids
the incorrect `2^32` ceiling and premature host `RangeError`. Tests for huge
length semantics use immediate abrupt indexed getters and therefore remain
finite and portable.

Validation includes:

- focused Reflect, Function apply, object-contract, descriptor, conversion,
  Realm, capability, hostile-exotic, and repository-invariant suites;
- Node, Chromium, and JavaScriptCore portable suites;
- the exact M1 Test262 ledger under `TZ=UTC`;
- ordinary selected upstream checks after the exact promotion;
- typecheck, lint, formatting, vendor, generated CI, selection, exclusion,
  audit, and provenance checks;
- benchmark smoke and review of function-call/object-property workloads; and
- no unexplained host-specific branch or error shape.

No performance threshold is invented from one run. A credible regression in
shared Function apply or object dispatch is profiled and corrected before
review.

## Documentation effects

The later semantic consumer updates:

- `docs/architecture.md` to describe the complete Reflect family and shared
  argument-list conversion;
- `docs/limitations.md` to remove the “only `Reflect.ownKeys`” limitation while
  retaining Proxy, PTC, immutable-prototype, and no-enumerate boundaries;
- `docs/testing.md` with the exact M1 command, ledger identity, evidence, and
  authority lifecycle; and
- generated conformance/report content only through the reviewed authority.

This design document is the only tracked change in the present design commit.

## Review and delivery gates

Before semantic merge:

- scope still fits one guest-behavior PR;
- all 13 methods and `@@toStringTag` are present with exact descriptors;
- `Reflect.enumerate` and `Proxy` remain absent;
- every algorithm and conflict-order probe passes;
- false booleans never become throws;
- omitted receiver/new-target distinctions are proven;
- validation errors are Realm-owned and target abrupt completions retain
  identity;
- ToLength no longer wraps at 32 bits;
- Function apply regressions pass;
- hostile exotic and cross-Realm/cross-Agent probes pass on all portable hosts;
- exact 113-root execution is complete and disposition-reviewed;
- the six evidence files reproduce byte-for-byte from scratch inputs;
- the pending authority was prepared and merged separately;
- the consumer protected projection is exact and nonzero;
- ordinary CI, exact-head CI, and CodeQL are clean; and
- whole-branch correctness, performance, and security review finds no
  unresolved issue.

If implementation reveals a new object protocol, Proxy subsystem, authority
policy change, or another independent semantic kernel, that work is removed
from M1 and assigned to its owning issue. It is not absorbed to preserve an
artificial atomic label.

## Acceptance criteria

The design is satisfied when:

1. the approved Reflect object surface and descriptors are exact;
2. every method uses only the reviewed Table 5/6 seams;
3. validation, coercion, presence, Realm, and abrupt-completion rules match this
   document;
4. shared ToLength/CreateListFromArrayLike is correct and Function apply
   remains compatible;
5. portable ordinary, hostile-exotic, and cross-Realm tests pass;
6. exact M1 execution accounts for all 113 roots / 226 variants;
7. complete-pass roots alone enter `es2015/m1-reflect`;
8. Proxy-tagged residuals remain explicitly owned by #81;
9. generic six-file evidence and every protected output are authority-verified;
10. M1 authority is consumed exactly once; and
11. post-merge classification, CI, CodeQL, and roadmap evidence are complete.
