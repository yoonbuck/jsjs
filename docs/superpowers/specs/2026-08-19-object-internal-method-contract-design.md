# ES2015 Object Internal-Method Contract Design

## Status and decision

Issue #79 is one atomic foundational pull request from exact base
`54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7`.

Use class-polymorphic internal methods on `EngineObject`, backed by named
specification-shaped ordinary helpers. This is preferred over either a parallel
method table or symbol-keyed methods because it creates one readable semantic
path, keeps existing ordinary-object representation and hot paths, and gives
future Reflect and Proxy work one stable override seam.

The change is reviewable as one pull request only while it remains the protocol,
ordinary algorithms, current-exotic migration, caller migration, invariants,
tests, and performance guards described here. It does not implement Reflect or
Proxy.

## Goals

- Implement every universally essential object internal method in ECMA-262
  Sixth Edition Table 5 as an explicit polymorphic method.
- Formalize the additional callable and constructor capabilities from Table 6.
- Put ordinary-object slot access and ordinary algorithms behind named
  `ordinary*` helpers.
- Migrate evaluator, runtime, built-in, module, and existing exotic semantic
  callers to the shared contract.
- Preserve receiver semantics, abrupt completion, Realm-owned error creation,
  stack safety, descriptor invariants, key ordering, and ordinary hot paths.
- Prevent future class-name or direct-slot semantic bypasses with repository
  invariants.
- Leave a stable base for #80 (Reflect), #81 (Proxy), and later exotic objects.

## Strict non-goals

- Adding or completing Reflect methods. Existing `Reflect.ownKeys` may be
  migrated to the shared seam, but #80 owns the Reflect surface and evidence.
- Adding Proxy construction, traps, revocation, or invariants. #81 owns them.
- Adding Symbol protocol behavior, collections, binary data, typed arrays, or
  later exotic objects.
- Claiming that the 240-root / 459-variant M0 ledger now passes. Roots move only
  when exact execution passes or reviewed attribution identifies their next
  owner.
- Reworking private branded state such as Date values, Promise reactions,
  Generator continuations, RegExp matchers, iterator state, mapped argument
  bindings, or module records.

## Normative contract

### Universally essential methods

The normative source is **ECMA-262 Sixth Edition, June 2015**, section 6.1.7.2,
Table 5, published at `https://262.ecma-international.org/6.0/`. The repository's
pinned source identity in `tools/test262/es2015-policy.json` is SHA-256
`4d4243dc2f04c9cdd09498f2cc2af6f6cdc07b0430da5578e7cf440d4f7846a0`.
That final table contains `[[Enumerate]]`; later editions removed it, but that
later change must not be applied retroactively to this ES2015 contract.

Every `EngineObject` provides these twelve exact method shapes:

| Specification method    | Engine method                        | Result                                      |
| ----------------------- | ------------------------------------ | ------------------------------------------- |
| `[[GetPrototypeOf]]`    | `getPrototypeOf()`                   | `EngineObject \| null`                      |
| `[[SetPrototypeOf]]`    | `setPrototypeOf(prototype)`          | boolean                                     |
| `[[IsExtensible]]`      | `isExtensible()`                     | boolean                                     |
| `[[PreventExtensions]]` | `preventExtensions()`                | boolean                                     |
| `[[GetOwnProperty]]`    | `getOwnProperty(key)`                | detached complete descriptor or `undefined` |
| `[[HasProperty]]`       | `hasProperty(key)`                   | boolean                                     |
| `[[Get]]`               | `get(key, receiver)`                 | guest value                                 |
| `[[Set]]`               | `set(key, value, receiver)`          | boolean                                     |
| `[[Delete]]`            | `delete(key)`                        | boolean                                     |
| `[[DefineOwnProperty]]` | `defineOwnProperty(key, descriptor)` | boolean                                     |
| `[[Enumerate]]`         | `enumerate()`                        | engine iterator object                      |
| `[[OwnPropertyKeys]]`   | `ownPropertyKeys()`                  | property-key list                           |

Keys are already normalized `PropertyKey` values before dispatch. Internal
methods do not accept `throwOnError`, `strict`, or `callerRealm`. Boolean-returning
methods report semantic success only. They do not select whether failure throws
and do not select which Realm owns an error.

`[[Get]]` and `[[Set]]` always receive an explicit receiver. Direct property
access supplies the target object. `super` supplies the method receiver while
starting lookup at the home object's prototype. Primitive references supply the
primitive value while lookup starts at the transient wrapper.

`[[Enumerate]]` remains distinct from `[[OwnPropertyKeys]]`: it returns an engine
iterator over string keys visible to `for-in`, while `[[OwnPropertyKeys]]`
returns the complete own-key list, including Symbols, in ES2015 order.

The object returned by `enumerate()` implements the public ECMAScript iterator
protocol. Ordinary enumeration returns a Realm-appropriate `EngineObject` with
a callable `next` property. Each call produces a normal IteratorResult object
through `createIterResultObject`. It is not a host iterator, host generator, raw
key array, or private brand-only protocol. A private brand may optimize the
ordinary iterator implementation, but every consumer still performs observable
`next` lookup/call/result validation through the shared iterator abstract
operations. This is required because #81's future Proxy `[[Enumerate]]` trap may
return an arbitrary engine object.

The Table 5 signature has no Realm parameter and ordinary objects do not acquire
a Realm from their prototype. The engine therefore maintains an Agent-scoped
dynamic execution-Realm stack, visible across the linked synchronous Agent call
chain. Script/module evaluators, guest/native function entry, generator resume,
and Realm-bearing job execution push their active Realm and restore the previous
value in a `finally` path. A Realm-null host job establishes no guest execution
Realm. `ordinaryEnumerate` reads the active execution Realm to allocate its
iterator, native `next` function, and IteratorResult objects.

Cross-Realm `for-in` allocates in the evaluating execution Realm, not a Realm
inferred from the target or its prototype. A direct host call with no active
execution Realm fails fast with a host `TypeError`; tests or embedding adapters
that intentionally invoke the internal method directly use an explicit
non-semantic `withActiveExecutionRealm(realm, callback)` boundary. The mechanism
does not alter object identity or existing Agent ownership.

### Callable and constructor capabilities

Existing `callFunction(thisValue, argumentsList)` and
`constructFunction(argumentsList, newTarget)` remain the concrete method names
for Table 6's `[[Call]]` and `[[Construct]]`. This issue formalizes their
capability brands and dispatch helpers rather than renaming every implementation.

- `isCallable` asks for the engine-owned callable capability, not a class tag or
  an arbitrary host property named `callFunction`.
- `isConstructor` asks for the engine-owned constructor capability, not
  `_isConstructor`, a class tag, or the presence of an arbitrary host method.
- Call and construct operations dispatch through the branded capability.
- Plain host callbacks remain allowed only at the existing explicitly
  engine-internal accessor boundary; guest values cannot gain callable status by
  imitating a method shape.

Module-private WeakSet brands own the callable and constructor capabilities.
Sanctioned engine constructors register instances when creating function
objects. Predicates consult only those brands; dispatch then invokes the
corresponding method. A subclass cannot gain a capability by adding a same-named
host method or diagnostic tag. Ordinary for-in iterators may also carry a
private implementation brand, but arbitrary `[[Enumerate]]` results are accepted
and consumed only through their public iterator protocol.

## Ordinary object algorithms

`EngineObject` methods are thin polymorphic entry points. Named ordinary helpers
own the default algorithms and base storage:

- `ordinaryGetPrototypeOf`
- `ordinarySetPrototypeOf`
- `ordinaryIsExtensible`
- `ordinaryPreventExtensions`
- `ordinaryGetOwnProperty`
- `ordinaryHasProperty`
- `ordinaryGet`
- `ordinarySet`
- `ordinaryDelete`
- `ordinaryDefineOwnProperty`
- `ordinaryEnumerate`
- `ordinaryOwnPropertyKeys`

The helpers are specification-shaped: they take the target plus only the
corresponding internal-method parameters and return the corresponding result.
Only this ordinary layer reads or mutates the base object's prototype,
extensibility, and property-map slots. Exotic implementations may read their own
branded state but may not reach into ordinary base storage.
Ordinary objects retain their existing Agent ownership model and gain no
inherited or universal Realm slot.

`ordinaryGetOwnProperty` returns a detached complete descriptor to semantic
callers. Raw stored descriptors are an implementation detail available only
inside ordinary helpers and audited fast paths. No evaluator, built-in, module,
reference, or general exotic caller receives or retains one.

### Prototype traversal and dispatch

Ordinary prototype traversal stays iterative so a guest-controlled 50,000-link
chain cannot consume the host stack.

For Get, Set, HasProperty, prototype cycle checks, and ordinary enumeration, a
helper continues iteratively while the next object's relevant operation is
the branded ordinary default. At the first override it dispatches exactly once
to that object's polymorphic method and propagates its result or abrupt
completion. The optimization never branches on class name and never assumes
that another method being ordinary makes the relevant method ordinary.

This rule preserves both requirements:

- chain length does not create host recursion; and
- an exotic in the middle of an otherwise ordinary chain is never skipped.

`ordinaryEnumerate` builds its iterator without host recursion. At each ordinary
object/prototype boundary it invokes the polymorphic `ownPropertyKeys`,
`getOwnProperty`, and `getPrototypeOf` methods; it never reads the ordinary
property map or prototype slot directly for a semantic decision. If the
remaining prototype supplies an exotic `enumerate`, ordinary enumeration
turns its returned object into a normal Iterator Record by observably getting
`next`, then consumes it through `IteratorStep` and `IteratorValue` while
suppressing strings already visited by the ordinary prefix. Getter/call abrupt
completions, non-callable `next`, and malformed iterator results propagate
through the shared iterator operations. This leaves the override point needed
by #81's future Proxy `[[Enumerate]]` trap without implementing that trap here.

Enumeration considers only string keys. After `ownPropertyKeys` supplies a key,
`getOwnProperty` observes its descriptor. An absent descriptor does not mark the
key visited, so deletion before descriptor observation permits an enumerable
prototype property of the same name to be discovered. A present descriptor
marks the key visited even when non-enumerable, so an observed non-enumerable own
property suppresses its enumerable prototype duplicate. Symbols never enter the
visited set or result. Duplicate strings from later prototypes or exotic
remainder iterators are suppressed.

The engine preserves its existing ES2015-permitted deterministic behavior:

- initial candidate order is snapshotted when `enumerate()` is called;
- each object's own candidate order is its ES2015 own-key order (indices,
  remaining strings, then ignored Symbols);
- properties added after the snapshot are not visited;
- immediately before yielding a candidate, the iterator rechecks the live graph
  through polymorphic `getOwnProperty` and `getPrototypeOf`;
- deletion or reconfiguration before the candidate is reached may remove it;
- deleting a shadowing own property may reveal an enumerable property of the
  same name on the then-current prototype chain; and
- prototype replacement can affect the live membership recheck but cannot add a
  name absent from the initial candidate snapshot.

These are implementation choices permitted by Sixth Edition enumeration
semantics. The design does not claim the ordering guarantees standardized by
later ECMAScript editions.

### Preserved ordinary semantics

The ordinary helpers preserve:

- prototype cycle rejection and non-extensible prototype behavior;
- detached public descriptors and descriptor validation;
- value-only updates to writable own data properties;
- inherited writable-data shadowing and accessor receiver behavior;
- strict ES2015 own-key ordering: array-index strings numerically, remaining
  strings by creation order, then Symbols by creation order and identity;
- String virtual-index descriptors;
- mapped Arguments aliasing and unmapping;
- Array length/index coupling;
- module namespace null prototype, live exports, non-extensibility, and rejected
  writes; and
- cross-Agent Symbol identity and value linking.

## Failure and Realm ownership

The polymorphic seam returns booleans or propagates an abrupt completion. It
does not manufacture strict-mode failures.

Owning wrappers translate `false` according to their algorithm:

- strict assignment throws a Realm-owned guest `TypeError`; sloppy assignment
  ignores the failed write;
- strict `delete` throws after a false `[[Delete]]`; sloppy `delete` returns the
  boolean;
- object-literal, class, declaration, and other must-succeed definitions throw
  at their owning operation after false `[[DefineOwnProperty]]`;
- `Object.defineProperty` and `Object.defineProperties` throw in the native
  function Realm after false;
- `Object.preventExtensions`, `Object.seal`, and `Object.freeze` return the
  original argument only after all required boolean operations succeed;
- `Object.isExtensible`, `Object.isSealed`, and `Object.isFrozen` consume the
  boolean protocol without inventing success; and
- future Reflect methods return protocol booleans as specified by #80.

Accessor, iterator, and future trap calls propagate their own guest abrupt
completion naturally. No broad catch translates host errors into successful
guest results. Existing native-function and evaluator boundaries remain
responsible for materializing errors in the correct Realm and preserving
coercion and evaluation order.

## Compatibility operations

Legacy convenience methods are not a parallel protocol.

- `put` is removed. Its callers explicitly invoke `set(key, value, receiver)` and
  apply their owning strict/sloppy failure rule.
- Throw-enabled `defineOwnProperty` and `delete` overloads are removed. Explicit
  must-succeed wrappers own throwing.
- `getProperty` and `canPut` are removed as semantic APIs. Primitive reference
  behavior is expressed through receiver-aware Get and Set plus explicit
  wrapper rules where the Sixth Edition Reference algorithm requires them.
- `getPrototype` is replaced by `getPrototypeOf`; no legacy alias remains in
  semantic source.

## Existing exotic objects

Current exotic and exotic-like objects migrate method by method:

- `EngineArray` keeps an exotic `defineOwnProperty` for index/length coupling.
- `EnginePrimitiveObject` exposes String indices through
  `getOwnProperty`/`ownPropertyKeys`; ordinary Get and HasProperty observe them
  through the public seam.
- `ArgumentsObject` keeps its mapped own-property, define, and delete behavior
  using its parameter-map slot, not ordinary base storage.
- `ModuleNamespaceObject` keeps live own descriptors, null-only prototype,
  non-extensibility, rejected define/set/delete operations, and sorted export
  keys. Its methods return booleans or propagate binding access failures without
  strictness parameters.
- functions and native functions retain branded Call/Construct capabilities.

Array, String wrapper, Arguments, module namespace, and Function objects inherit
or override enumeration only where their existing own-property semantics
require it. Their regressions prove that virtual descriptors, mapped values,
sorted namespace exports, Symbols, and callable objects remain observable
through the shared iterator protocol.

Exotic implementations call ordinary helpers explicitly when they need an
ordinary substep. They do not use `super.method()` as an undocumented path into
ordinary storage.

## Semantic caller migration

The migration covers all operations that implement guest semantics:

- ordinary and generator evaluator property reads, writes, `delete`, `in`,
  member calls, object/array literals, class definitions, destructuring, and
  `super`;
- Reference and SuperReference receiver propagation, including primitive bases;
- function construction, `instanceof` prototype walking, derived
  `super(...)`, and native construction retargeting;
- Object static/prototype methods, integrity-level algorithms, descriptor
  conversion, and existing `Reflect.ownKeys`;
- for-in enumeration in synchronous and generator execution;
- iterator, JSON, Array, Function, RegExp, Promise, module, environment, and
  conversion algorithms wherever they perform object semantic operations; and
- module namespace access and existing cross-Realm/Agent linking boundaries.

Construction and bootstrap code use ordinary helpers directly only when the
specification creates or initializes a known ordinary object and no guest code
can interpose. Such uses are explicit and covered by the direct-slot invariant.

Both synchronous and generator `for-in` evaluate the right-hand expression,
handle `null`/`undefined` at the language algorithm before object dispatch, call
`enumerate()` exactly once, require an object result, observably read and validate
its `next`, and consume the resulting Iterator Record through the shared
`IteratorStep` and `IteratorValue` operations. Iterator values and abrupt
completions propagate through the owning evaluator path. The old raw
prototype/key snapshots and live raw-descriptor checks are removed.

## Brands and class tags

`getClassName()` is diagnostic branding, not a semantic dispatch mechanism.
`Object.prototype.toString` uses the object's legitimate fallback built-in
tag after its `@@toStringTag` lookup. Other semantic questions use narrow brands:

- Array identity uses an Array brand helper;
- RegExp identity uses a RegExp matcher brand helper;
- primitive wrappers use their branded primitive-data slot;
- Date, Promise, Generator, iterator, Arguments, and namespace checks use their
  owning branded state; and
- callable and constructor checks use the Table 6 capability brands.

The change does not implement Proxy-recursive Array or RegExp brand behavior,
`@@isConcatSpreadable`, `@@match`, or `@@hasInstance`; those remain with
#81/#82/#92.

## Repository invariants

Node repository-invariant tests scan production source and fail on:

- `_prototype`, `_extensible`, `_properties`, or raw-descriptor access outside
  the tiny ordinary-helper allowlist;
- legacy `getPrototype`, `getProperty`, or `canPut` semantic calls;
- `EngineObject.prototype` method-identity dispatch outside the reviewed
  ordinary traversal helpers;
- semantic branching on `getClassName`;
- direct `_isConstructor` reads or duck-typed guest callability checks; and
- an exotic reaching into base ordinary slots.

Each allowlist entry has a narrow explanation and owning file. Brand-slot
allowances name only their runtime owner. The invariant distinguishes
`Object.prototype.toString`'s diagnostic fallback tag from prohibited semantic
class-name branching.

## Test design

### Strict RED-first sequence

Implementation is divided into method families. Each family begins with a
portable failure that demonstrates a bypass at the intended seam:

1. protocol shape, booleans, wrappers, and descriptors;
2. receiver-aware Get/Set and prototype traversal;
3. HasProperty, Delete, DefineOwnProperty, extensibility, and prototypes;
4. Enumerate and OwnPropertyKeys;
5. branded Call/Construct;
6. current exotic migration; and
7. source invariants and performance guards.

The RED command and failure excerpt are retained for each task. Production code
is not changed before the corresponding failing test exists.

### Hostile synthetic exotic

A test-only `HostileExotic extends EngineObject` implements all twelve Table 5
methods, advertises deliberately misleading diagnostic tags, owns virtual
descriptors without ordinary base-slot access, and can either record a call,
return a sentinel/boolean, or throw a sentinel abrupt completion.

Tests prove:

- Object APIs dispatch Get/SetPrototypeOf, IsExtensible, PreventExtensions,
  GetOwnProperty, DefineOwnProperty, Delete, and OwnPropertyKeys;
- direct, inherited, primitive, and `super` Get/Set preserve the original
  receiver;
- `in`, `with`, descriptor conversion, Object keys/names/symbols, JSON, and
  existing `Reflect.ownKeys` reach the intended seam;
- synchronous and generator `for-in` dispatch Enumerate and propagate abrupt
  completion;
- enumeration pins add/delete/reconfigure behavior, prototype replacement,
  index/string order, duplicate and non-enumerable shadowing, Symbol exclusion,
  null prototypes, cross-Realm targets, and iterator Realm ownership;
- public enumeration iterator tests pin abrupt `next` getters/calls,
  non-callable `next`, non-object step results, abrupt `done`/`value` access, and
  the Realm owning ordinary iterator/result objects and guest errors;
- visited-state tests distinguish deletion before descriptor observation (which
  may reveal a prototype duplicate) from an observed non-enumerable own
  descriptor (which suppresses its prototype duplicate);
- an exotic in the middle of a 50,000-link ordinary chain is observed exactly
  once and is not skipped by the iterative optimization;
- spoofed host objects with `callFunction`, `constructFunction`,
  `_isConstructor`, or class tags do not become guest callables/constructors;
  and
- every existing Array, String wrapper, Arguments, namespace, function,
  Symbol-key, and cross-Realm case remains compatible.

Separate 50,000-link ordinary Get, Set, HasProperty, prototype, and enumeration
tests guard host-stack safety. A hostile exotic in the middle of the
50,000-link enumeration chain proves that iterative flattening does not bypass
`enumerate`, `ownPropertyKeys`, `getOwnProperty`, `getPrototypeOf`, public
iterator values, or abrupt completion.

## Test262 attribution and evidence

The exact M0 ledger is authoritative:

- 240 roots;
- 459 executable variants;
- SHA-256
  `4ef97681d7e5208a3ec04e2f4281908877f5f61dd42ee20c0f282ac4dc205309`;
- selector:
  `finalClass === "blocked" && blocker === "proxy-and-reflect-metaobject" &&
!path.startsWith("test/annexB/") &&
!path.startsWith("test/built-ins/Reflect/") &&
!path.startsWith("test/built-ins/Proxy/")`.

Only this exact path set is used for local issue-focused Test262 work, under
`TZ=UTC`. Most paths contain explicit Reflect or Proxy dependencies and are not
expected to execute successfully in #79. Post-change classification therefore:

1. promotes only exact paths whose variants actually pass;
2. reassigns exact Reflect-dependent roots to #80;
3. reassigns exact Proxy-dependent roots to #81;
4. reassigns remaining consumer roots to their reviewed later semantic owners;
5. verifies the M0 owning selector reaches zero; and
6. preserves balanced global root/variant counts and deterministic artifact
   hashes.

No feature tag is widened and no skipped unsupported feature is reported as
passing.

## Performance design and validation

Ordinary property operations are established hot paths. Preserve:

- direct Map access inside ordinary helpers;
- the allocation-free ordinary Get path;
- the existing own writable-data Set fast path;
- value-only DefineOwnProperty updates;
- iterative prototype traversal;
- sparse Array length behavior; and
- no per-object internal-method table allocation.

Before and after implementation, run the repository's deterministic
`object-properties` and `arrays` workloads with identical Node, Chromium, and
JavaScriptCore settings. Benchmark smoke remains a correctness gate. Any
credible regression triggers profile-guided correction before review; no
threshold is invented from a single noisy run.

## Validation and review gates

The final branch requires:

- focused object, descriptor, reference, evaluator, class, module namespace,
  for-in, stack, repository-invariant, and hot-path suites;
- Node, Chromium, and JavaScriptCore portable suites;
- only the exact focused Test262 ledger under `TZ=UTC`;
- typecheck, lint, formatting, generated CI, vendor, Unicode, selection,
  exclusion, taxonomy, and repository drift checks;
- benchmark smoke plus reviewed object/array before-and-after evidence;
- fresh task specification and quality reviews with fix/retest loops;
- maximum-capability whole-branch architecture, correctness, and performance
  review;
- exact reviewed-head CI and CodeQL with terminal checks inspected; and
- post-merge exact-main CodeQL, UTC reclassification, issue graph/count updates,
  and exact evidence publication.

The focused pull request may merge only if this scope remains intact. If
implementation reveals an independent subsystem rather than mechanical contract
migration, issue #79 must be converted to a grouping issue before that work is
added.
