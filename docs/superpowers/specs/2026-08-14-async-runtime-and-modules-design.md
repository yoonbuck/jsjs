# Async Runtime and Modules Design

## Goal

Complete roadmap issue #28 in four independently reviewable, sequential layers:

1. an Agent-owned Job Queue, an explicit portable host microtask adapter,
   ES2015 Promises, reaction jobs, and async Test262 execution;
2. ES2015 generators integrated with the existing iterator protocol;
3. ES2015 static modules with parsing, linking, evaluation, live bindings,
   cycles, namespace objects, and an explicit portable host loader; and
4. cross-subsystem integration, conformance policy, generated evidence, and the
   issue #28 release.

The implementation must remain plain ES2020 JavaScript with strict JSDoc
checking. Engine source must run unchanged in Node, Chromium, and JavaScriptCore.
Guest semantics must not be delegated to host Promise, generator, module, or
microtask behavior.

## Context and Existing Contracts

The current engine evaluates scripts synchronously. `evaluateScript` parses an
Acorn ES2015 script, performs declaration instantiation, and evaluates a
recursive AST to an explicit completion record. `EngineFunction` separates the
runtime call protocol from evaluator-owned body execution. Environments,
references, guest errors, completion records, and the stack guard are all
engine-owned.

An `Agent` currently owns state shared between realms: well-known symbol
identity and the global symbol registry. A `Realm` owns intrinsics, its global
object and environment, template objects, and host adapters. Iterators are
realm-owned `EngineObject`s driven through the host-neutral operations in
`src/runtime/iterator.js`. The parser capability pass intentionally rejects
generators, `yield`, modules, and later neighboring syntax.

These ownership rules remain authoritative:

- mutable intrinsics, constructors, prototypes, jobs' target execution
  contexts, promises, generators, modules, namespaces, and errors belong to a
  guest Realm;
- well-known symbols, the global symbol registry, and the Job Queue belong to
  an Agent and may be shared by explicitly related realms;
- host facilities enter only through validated adapters;
- guest abrupt completion remains a guest value or completion, not an
  accidentally converted host exception; and
- ordinary script behavior and its synchronous fast path remain unchanged.

## Delivery Approach

### Chosen approach: four sequential vertical layers

Each layer starts from the newly merged `main`, owns one session and branch,
lands one reviewed pull request, and publishes its final interfaces and merge
SHA before the next layer begins. No layer depends on unmerged branch state.

This order is deliberate. All three behavior layers touch Realm intrinsics,
parser/evaluator boundaries, Test262 policy, and documentation. Long-lived
parallel branches would create predictable semantic and textual conflicts.

Layer 4 is an integration and release gate. It may make focused, test-first
integration fixes, but it must not hide substantial missing behavior. A missing
feature returns to a focused implementation task with its own specification and
quality reviews.

### Rejected alternatives

**Three feature pull requests with release folded into modules** saves one pull
request, but overloads the riskiest feature layer with milestone-wide proof,
generated artifacts, and issue closure.

**Parallel Job/Promise and generator branches** offers limited wall-clock gain,
but both change Realm initialization and shared policy surfaces. Modules then
intersect the parser and evaluator changes from generators. Resolving those
branches together would weaken task-level review evidence.

**One infrastructure pull request followed by thin features** would force the
project to commit to abstractions before any feature proves them and would make
it difficult to establish RED tests for externally visible behavior.

## Roadmap and Issue Structure

Issue #28 remains the parent integration milestone. Create one focused child
issue for each layer and add sequential blocking relationships where GitHub
supports them:

1. Job Queue, host microtasks, and Promises;
2. generators and iterator integration;
3. static modules and the host loader; and
4. async runtime/modules integration and release.

Each child issue records its design or plan, pull request, exact merged SHA,
portable test evidence, targeted Test262 evidence, reviews, and CI result.
Issue #28 and roadmap #24 are updated at every merge. Only layer 4 may close
#28 and #24, and only after all milestone acceptance criteria pass.

## Layer 1: Agent Jobs, Host Scheduling, and Promises

### Agent-owned Job Queue

The Job Queue belongs to `Agent`, not `Realm`. A Promise reaction can cross
Realm boundaries through shared callable objects, so putting the queue on one
Realm would either split ordering or select the wrong owner.

Queue entries are explicit Job Records:

```js
/**
 * @typedef {{
 *   realm: Realm | null,
 *   callback: (args: readonly unknown[]) => JobCompletion,
 *   arguments: readonly unknown[],
 *   kind: string,
 * }} JobRecord
 *
 * @typedef {{
 *   type: 'normal' | 'throw',
 *   value: unknown,
 * }} JobCompletion
 *
 * @typedef {{
 *   job: JobRecord | null,
 *   category: 'job' | 'host-hook',
 *   error: unknown,
 * }} JobFailure
 */
```

The callback and arguments are internal engine data, not a host function used
as guest semantics. A non-null `realm` selects the execution context for the
job. A null Realm is restricted to a specification path that evaluates no user
ECMAScript code and creates no new ECMAScript objects; it is not a general
fallback for failed Realm discovery. Draining never manufactures a Realm for
that path. `kind` is diagnostic and never changes ordering.

For a non-null Realm, the Agent installs the target Realm/job context before
running the job and restores the previous context in `finally`. For a null
Realm it installs a null job context and likewise restores the previous one.
Jobs from several related realms therefore share one FIFO without silently
assigning an absent handler Realm to a capability or originating Promise.

### Portable scheduling adapter

`createAgent` accepts a validated optional `jobHost`:

```js
/**
 * @typedef {{
 *   scheduleMicrotask: (checkpoint: () => JobDrainReport) => void,
 *   reportJobError?: (failure: JobFailure) => void,
 *   promiseRejectionTracker?: (
 *     promise: PromiseObject,
 *     operation: 'reject' | 'handle',
 *   ) => void,
 * }} JobHost
 */
```

The engine never probes `globalThis.queueMicrotask`, host Promise, or a host
module. Node, browser, and JSC adapters implement the same callback contract
using the facility appropriate to that host. With no `jobHost`, the Agent is in
deterministic manual mode and the embedder calls `agent.runJobs()`.

`createRealm({ jobHost })` is a convenience only when the Realm creates its own
Agent. Supplying both `agent` and `jobHost` is a `TypeError`; a Realm must not
replace or multiply the scheduler of an existing Agent. Adapter fields are
validated once at construction.

### Checkpoint state machine

The Agent has exactly three checkpoint states:

- `idle`: no host checkpoint is outstanding and no drain is active;
- `scheduled`: one host checkpoint callback is outstanding; and
- `draining`: a checkpoint is executing.

With a scheduling adapter, enqueuing the first job while idle appends the job,
moves to `scheduled`, and invokes `scheduleMicrotask` once. Enqueuing while
`scheduled` or `draining` only appends. In manual mode, enqueue only appends and
the state remains `idle` until `runJobs()` begins. A drain processes FIFO
through jobs appended by earlier jobs, then returns to `idle`.

State is paired with a monotonically increasing checkpoint generation. Every
idle-to-scheduled transition increments the generation and captures that token
in the scheduled closure. A host callback may drain only while the Agent is
`scheduled` **and** its captured token equals the currently scheduled
generation. Every other callback is stale and is a no-op, even when a newer
generation is currently `scheduled`.

If `scheduleMicrotask` throws, the Agent restores `idle`, retains every queued
job, invalidates that generation, and rethrows the host error synchronously. The
embedder can repair the adapter and call `runJobs`; scheduling failure never
loses guest work or leaves the Agent stuck in `scheduled`.

A public `runJobs()` invoked while `scheduled` may drain early and makes the
later host callback stale by invalidating its generation. Calling it while
`draining` throws a host `TypeError` before changing state. A duplicate or stale
host callback is a no-op regardless of the current three-state value. This
prevents callback A, manually drained early, from consuming a newer generation
B if A arrives after B is scheduled. No suspension retains a host stack frame.

`runJobs()` never leaks an expected guest abrupt completion as an uncaught host
exception. It drains all jobs and returns a deterministic report:

```js
/**
 * @typedef {{
 *   processed: number,
 *   failures: readonly JobFailure[],
 * }} JobDrainReport
 */
```

Unexpected job abrupt completions and host reporting-hook failures are appended
to a durable Agent failure list and included in the report. Draining continues.
`agent.takeJobFailures()` returns and clears that list so manual and automatic
embedders cannot silently lose a failure. `reportJobError`, when supplied, is
called without changing queue order; if it throws, that host-hook failure is
recorded rather than recursively reported.

Promise reaction and thenable jobs catch guest abrupt completion and reject the
derived Promise as required, so they do not normally produce Job Queue
failures. `promiseRejectionTracker` runs at the specification's reject/handle
operations. Its failures are recorded as host-hook failures and cannot change
Promise state, reaction order, or queue order.

### Promise objects and intrinsics

Each Realm installs `%Promise%`, `%Promise.prototype%`, the constructor,
`then`, `catch`, `resolve`, `reject`, `all`, `race`, and the ES2015
`@@species` accessor with exact descriptors.

A `PromiseObject` is a realm-owned `EngineObject` with engine-only slots:

- state: `pending`, `fulfilled`, or `rejected`;
- result;
- fulfill and reject reaction lists; and
- handled state for `HostPromiseRejectionTracker`.

The implementation uses explicit Promise Capability, Promise Reaction, and
resolving-function records. A resolve/reject pair shares one `alreadyResolved`
cell. Resolution rejects self-resolution, adopts Promises, reads a foreign
thenable's `then` once, and enqueues a `NewPromiseResolveThenableJob`; it never
uses host Promise assimilation.

Settling a Promise is one-way. It snapshots and clears the applicable reaction
list, preserves registration order, and enqueues one reaction Job Record per
reaction. `then` uses identity/thrower behavior for missing handlers,
`SpeciesConstructor` for the result capability, and the nullable Job Realm rules
below. Cross-Realm tests pin the selected intrinsic and error ownership.

The constructor calls its executor synchronously with realm-owned resolving
functions. Executor throws reject the Promise. `Promise.resolve` preserves an
input Promise only when its constructor matches. `all` and `race` consume input
with the existing iterator operations, preserve input order, use per-element
already-called cells, and apply the existing `IteratorClose` abrupt-completion
precedence.

Promise jobs use the specification's nullable Realm selection rather than a
capability-based approximation:

- `NewPromiseReactionJob` uses `GetFunctionRealm` for a non-empty handler. An
  empty identity/thrower handler has a null Job Realm. A successful
  `GetFunctionRealm` supplies the returned Realm. If `GetFunctionRealm`
  completes abruptly, the job captures the current Realm Record at lookup time;
  the later handler call still follows ordinary guest abrupt-completion and
  Promise rejection semantics.
- `NewPromiseResolveThenableJob` uses `GetFunctionRealm` for the captured
  `then` callback. A successful lookup supplies the returned Realm. An abrupt
  lookup captures the current Realm Record at lookup time. A thenable job's
  Realm is therefore never null.

`GetFunctionRealm` is one shared runtime operation: ordinary and native
functions return their owning Realm, bound functions recurse to their bound
target rather than returning the Realm in which `bind` created the wrapper, and
a future Proxy callable will recurse to its target or complete abruptly when
revoked. The current no-Proxy engine exercises that last completion through the
internal callable-exotic fixture described below.

Null-Realm jobs execute without installing an invented Realm and are allowed
only where no user ECMAScript code runs and no new ECMAScript object is created.
All other Promise jobs carry either the Realm returned by `GetFunctionRealm` or
the current Realm captured when that lookup completed abruptly. Focused
cross-Realm tests cover an empty handler, a foreign bound/unbound handler, a
foreign thenable, and abrupt Realm lookup. Because guest `Proxy` is outside this
milestone, the abrupt path uses an internal callable-exotic fixture and is
differential-checked against equivalent native revoked-Proxy behavior in Node,
Chromium, and JSC, asserting that new errors belong to the current Realm at
lookup time. Proxy-dependent Test262 files remain honestly excluded until guest
Proxy exists.

### Async Test262 execution

Layer 1 removes only the `async` runner flag from the unsupported set. The
portable runner installs a realm-owned native `$DONE` bridge for async tests,
evaluates the source, drains that Realm's Agent deterministically, and classifies
the exact `$DONE()` or `$DONE(error)` outcome. Language-level async tests in this
scope use guest Promise jobs; the runner does not require timers or host Promise
semantics to complete them. A test that exhausts the checkpoint without calling
`$DONE` fails explicitly rather than hanging.

The runner's ordinary sync path remains unchanged. Async negative expectations,
duplicate `$DONE`, thrown harness code, queued failures, and cross-host record
equivalence receive focused tests before the flag is enabled.

Checkpoint tests pin FIFO, enqueue-during-drain, one-checkpoint coalescing,
manual mode, reentrant drains, scheduler-throw recovery, and generation
identity. The generation regression uses this exact order: callback A is
scheduled, `runJobs()` drains A early, new work schedules callback B, late
callback A runs while B is `scheduled` and must do nothing, then B drains only
B's generation.

### Layer 1 non-goals

- async functions, `await`, async generators, and async iteration;
- timers, tasks, event loops, or a browser/Node compatibility layer;
- implicit host-global scheduling;
- dynamic import or module loading;
- changing ordinary synchronous script evaluation; and
- broad Test262 selection expansion or final generated coverage artifacts.

## Layer 2: Generators and Iterator Integration

### Parser boundary

The parser admits ES2015 generator declarations, expressions, object methods,
class methods, and supported `YieldExpression` shapes. Async generators and
later syntax remain rejected. Generator constructors are still not parsed from
later grammar.

`ContainsYield` is execution-aware static semantics. It scans every expression
executed by the current function, including computed keys, destructuring
defaults, initializers, loop components, spread arguments, templates, class
heritage, and computed names. It stops at nested function-like bodies and class
methods so an inner generator cannot suspend its creator. `yield` in parameters
remains an early syntax error.

### Generator-only continuation machine

Ordinary functions retain the existing synchronous evaluator. A universal
trampoline would impose a large correctness and performance risk on all existing
code and is unnecessary for ES2015 generators.

Generator bodies use an explicit heap-resident continuation machine. No
suspension retains a host JavaScript frame or a stack-guard entry. Resumable
frames are typed, discriminated engine records holding the exact state needed
after a suspension:

- program counter and already evaluated operands/references;
- Realm and guest execution context;
- lexical, variable, and function environments;
- `this`, `arguments`, `super`, and `[[HomeObject]]` access;
- pending normal/return/throw/break/continue completions;
- loop, label, switch, iterator, catch, and finally state; and
- delegated iterator state for `yield*`.

Resume input is an engine Completion injected at the suspended
`YieldExpression`: normal for `.next`, throw for `.throw`, and return for
`.return`. A surrounding guest `catch` can catch an injected throw. A return
unwinds through `finally`; `finally` may itself yield and can preserve or
replace the pending abrupt completion exactly like ordinary evaluation.

Yield-free subtrees may call the synchronous evaluator only when a static
predicate proves the subtree cannot cross a suspension boundary and the call
site has already saved every partial operand/reference and pending control
state. Guest signals from that call are bridged back into generator Completion
flow so resumable `try`/`catch`/`finally` remains authoritative. No prefix is
re-evaluated after resume.

### Generator objects and states

Each Realm owns `%GeneratorFunction%`, `%GeneratorFunction.prototype%`, and
`%GeneratorPrototype%`. `%GeneratorPrototype%` inherits `%IteratorPrototype%`
and defines `next`, `return`, and `throw`. Every generator function is callable
but non-constructible and owns a `prototype` object inheriting
`%GeneratorPrototype%`; each invocation inherits the function's current
`prototype`. Names, lengths, strictness, inferred names, and `[[HomeObject]]`
follow existing function/method machinery.

Generator state is exactly:

- `suspendedStart`;
- `suspendedYield`;
- `executing`; or
- `completed`.

Parameter/default/destructuring instantiation occurs when the generator function
is called, before it returns the generator object; body statements begin on the
first resume. This timing is required by the ES2015 call algorithm and is pinned
against current engines.

The first `.next(value)` ignores `value`. `.throw(error)` at
`suspendedStart` completes without entering the body and throws the guest value.
`.return(value)` at `suspendedStart` completes with a done result. A completed
generator's `next` returns `{ value: undefined, done: true }`, `return(value)`
returns a done result carrying `value`, and `throw(error)` throws `error`.
Reentrant resume while `executing` raises a guest `TypeError` without corrupting
the continuation. Terminal normal or abrupt completion changes state to
`completed` before returning or propagating.

### Dynamic GeneratorFunction constructor

`%GeneratorFunction%` is a per-Realm intrinsic with `name` `"GeneratorFunction"`
and `length` 1. It is not installed as a global binding. Guest code reaches it
through a generator function's inherited `constructor`.

Its intrinsic prototype is the Realm's `%Function%` constructor object. Its own
non-writable, non-enumerable, non-configurable `prototype` property is
`%GeneratorFunction.prototype%`. Calling or constructing
`%GeneratorFunction%` performs the same dynamic creation algorithm in the
invoked constructor's Realm and returns a new generator **function**, not a
Generator object.

`%GeneratorFunction.prototype%` is a non-callable, non-constructible ordinary
object inheriting `%Function.prototype%`. It has:

- a non-writable, non-enumerable, configurable `constructor` property naming
  `%GeneratorFunction%`;
- a non-writable, non-enumerable, configurable `prototype` property naming
  `%GeneratorPrototype%`; and
- `@@toStringTag` `"GeneratorFunction"` with the ES2015 descriptor.

`%GeneratorPrototype%` inherits `%IteratorPrototype%`. Its `constructor`
property names `%GeneratorFunction.prototype%`, not `%GeneratorFunction%`; it
also owns `next`, `return`, `throw`, and `@@toStringTag` `"Generator"` with the
specified descriptors.

Dynamic creation applies `ToString` to parameter and body arguments from left
to right, then independently validates the parameter fragment, generator-body
fragment, and woven `function* anonymous(P) { body }` source. This extends the
existing dynamic `Function` anti-escape strategy rather than delegating to host
`GeneratorFunction`. Parse and early errors become Realm-owned guest
`SyntaxError`s. The created generator function closes over the constructor
Realm's global environment, does not inherit caller strictness, derives
strictness from its own body directive, is non-constructible, and creates
Generator objects through the same continuation path as source-declared
generators. Calling and `new`-constructing `%GeneratorFunction%` are equivalent;
calling or constructing `%GeneratorFunction.prototype%` is a guest `TypeError`.

Focused portable tests and targeted Test262 cover reachability without a global
binding, call/construct equivalence, parameter/body coercion and independent
syntax validation, strictness, Realm ownership, prototype identity and
descriptors, non-constructibility of created generator functions, and dynamic
`yield` execution. `%AsyncGeneratorFunction%` and later dynamic constructors
remain rejected and out of scope.

### Delegated yield

`yield*` retains an existing Iterator Record and implements the complete
delegation loop:

- initial `GetIterator` and captured `next`;
- normal resume through delegated `next`;
- dynamic delegated `throw` and `return` lookup;
- missing-method behavior, including the missing-`throw` close path;
- result-object validation and `done`/`value` access order;
- a delegated `return` result with `done: false`, which suspends again;
- the final delegation expression value; and
- `IteratorClose` and error precedence on every abrupt path.

Protocol lookup uses the iterator object's Agent-owned symbols and result objects
belong to the executing Realm, preserving existing iterator cross-Realm rules.

### Layer 2 non-goals

- async functions/generators and `await`;
- a universal evaluator rewrite;
- host generators or source-to-host-generator lowering;
- post-ES2015 generator helpers; and
- module syntax or loading.

## Layer 3: Static Modules and Portable Loading

### Host loader contract

`createModuleLoader(realm, host)` binds one loader permanently to one Realm and
validates:

```js
/**
 * @typedef {{
 *   resolve: (
 *     specifier: string,
 *     referrer: string | null,
 *   ) => string | PromiseLike<string>,
 *   load: (
 *     identifier: string,
 *   ) => string | ModuleSourceRecord | PromiseLike<string | ModuleSourceRecord>,
 * }} ModuleHost
 *
 * @typedef {{ sourceText: string }} ModuleSourceRecord
 */
```

`resolve` returns a non-empty canonical module identifier. For dependencies,
`referrer` is the importing module's canonical identifier; a root request uses
`null` unless the API explicitly supplies a canonical referrer. Raw specifiers
never key module identity.

`load` receives only a canonical identifier. It may return source text directly
or an ordinary record with one own data property, `sourceText`, whose value is a
string. Accessors, missing fields, unknown fields, and non-string source are
rejected before parsing.

Module identity and successful caching are per loader + bound Realm + canonical
identifier. Two raw aliases resolving to one canonical identifier share host
loading, the `SourceTextModuleRecord`, environment, evaluation, and namespace.
Different loaders or Realms do not share module identity.

Host Promise is used only to await `resolve`/`load` and drive the host-facing
`loadAndEvaluate` API. Once the graph is loaded, parsing products, linking,
evaluation, live bindings, guest jobs, and abrupt completion are entirely
engine state.

### Concurrent loading and reentrancy

Resolve calls are initiated in deterministic source order. After canonical
resolution, one in-flight source load exists per canonical identifier. The
record is entered in the loader registry as soon as its source parses, before
dependency graph loading recurses, so a cycle can observe the same record
without awaiting its own graph promise.

Dependency discovery walks requested modules serially in source order. This
chooses deterministic hook invocation over speculative parallelism. Typed
same-loader/same-canonical-id reentrant rejection is guaranteed only
during the synchronous dynamic extent of `load(identifier)` invocation. Once
`load` returns a `PromiseLike`, later same-identifier requests, including
legitimate concurrent roots, deduplicate onto the normal in-flight graph Promise
and receive identical record/namespace identity.

An async hook must not await or reenter the same loader for the identifier whose
source it is producing. Doing so creates an undetectable host-Promise dependency
cycle and is a documented `ModuleHost` contract violation, not something the
engine portably diagnoses. Reentrancy for a different canonical identifier
remains allowed and deduplicated through the ordinary in-flight maps. A
synchronous typed rejection does not corrupt error or retry cleanup.

Resolve, load, and parse failures clear the corresponding in-flight entry and
are not cached, so a later request can retry. A successfully parsed immutable
Module Record remains cached. Link failure transactionally removes every
tentative environment/status/DFS mutation from the affected stack while
retaining parsed records; a later request retries linking without reloading
successful source. Evaluation success or abrupt completion is cached
permanently, and module code executes at most once.

### Embedding-boundary failures

`loadAndEvaluate` returns a host Promise that fulfills with the cached module
namespace. It rejects with a typed `ModuleLoaderError` carrying:

- `phase`: `resolve`, `load`, `parse`, `link`, or `evaluate`;
- the canonical identifier when known;
- the original host/parse/link cause for non-evaluation failures; and
- the exact guest thrown value for `evaluate`.

The same cached evaluation failure object is used for repeated requests. Guest
errors are not stringified, converted to a host `Error`, swallowed, or replaced
with a success-shaped namespace.

### Parsing and Module Records

`parseModule` uses Acorn ES2015 `sourceType: "module"` and the same
descriptor-safe AST validation principles as `parseScript`. It admits only
ES2015 static import/export declarations and the language forms already
implemented by prior layers. Dynamic import, `import.meta`, top-level await,
import assertions/attributes, and later module forms remain explicit shape-level
rejections.

Each canonical source creates one `SourceTextModuleRecord` containing:

- requested modules in deterministic source order;
- import entries;
- local, indirect, and star export entries;
- the validated module AST;
- the bound Realm and canonical identifier;
- environment and namespace slots; and
- explicit link/evaluation status and DFS fields.

The AST is never mutated or loosely stripped. Imports and export-list/re-export
nodes have no runtime evaluation step after instantiation. Exported declarations,
default expressions, named/anonymous default functions, and named/anonymous
default classes have explicit evaluator cases and execute in source order. An
anonymous default declaration/expression uses the specification's synthetic
default binding where required.

### Module environments and strict execution

`ModuleEnvironmentRecord` supports ordinary local bindings and immutable
indirect imports. An import binding holds a resolved target module plus target
binding name and dereferences that binding on every read. It therefore preserves
TDZ and live updates; it never copies an exported value. Namespace imports bind
the target's cached namespace object.

Module code is always strict. Top-level `this` is `undefined`. Top-level
`var`, function, lexical, class, and synthetic default bindings are all
module-scoped and never create global object properties. The module environment
has the Realm global environment as its outer environment only for resolving
global built-ins and existing globals. Direct eval inherits strict
module-context behavior and cannot leak declarations into module or global
scope.

### Linking, exports, and cycles

Graph loading finishes before linking. Linking traverses requested modules in
source order using explicit statuses and DFS/SCC fields. Environment creation is
transactional: either the affected linking stack commits complete environments
and resolved imports, or all tentative state is discarded.

`ResolveExport` uses the specification's resolve-set pairs of module identity
and export name. It distinguishes not found from ambiguous, excludes `default`
from star exports, lets explicit exports override star ambiguity, and treats an
ambiguous or unresolved imported binding as a link error. Cycles terminate on
pair identity rather than a name-only set.

Evaluation is synchronous after loading. It traverses SCCs deterministically,
executes every module once, supports mutually recursive function bindings and
live cycles, and stores the exact abrupt completion before exposing the failure
to the host Promise boundary.

### Module namespace objects

A namespace is one cached, realm-owned exotic `EngineObject` per Module Record.
It has a null prototype, is non-extensible, and exposes the module's
unambiguous resolved string export names in lexicographic order. Reads perform
live binding lookup and preserve TDZ throws. Namespace identity is reused by
namespace imports, re-exports, and repeated loader requests.

Namespace `[[GetOwnProperty]]`, `[[DefineOwnProperty]]`, `[[Set]]`,
`[[Delete]]`, own-key order, descriptors, and `@@toStringTag` follow the ES2015
module namespace rules rather than ordinary object behavior. Ambiguous star
names are absent.

### Layer 3 non-goals

- dynamic import, `import.meta`, top-level await, or async modules;
- Node package resolution, browser URL policy, import maps, filesystem access,
  network access, or a built-in cache policy beyond the canonical loader cache;
- JSON, Wasm, CommonJS, or non-JavaScript modules;
- host module namespace objects; and
- sharing module identity across loaders or Realms.

## Layer 4: Integration and Release

Layer 4 adds focused tests that compose the already merged interfaces:

- Promise reactions that call generator methods and consume their iterator
  results;
- cross-Realm Promise jobs sharing one Agent;
- module code creating Promises and generators with Realm-correct intrinsics;
- live module bindings observed from Promise reactions;
- module evaluation failures and queued Promise rejections preserving guest
  identity; and
- loader host-Promise orchestration remaining separate from guest Job Queue
  ordering.

It audits Test262 feature probes, supported flags, feature areas, module fixture
loading, async completion, exclusions, selection, reports, and coverage as one
contract. Broad generated selection/report/conformance artifacts are produced
only through repository commands with `TZ=UTC`.

Layer 4 runs the full portable Node, Chromium, and JSC suites, repository
format/lint/type/drift checks, benchmark smoke, and exact-SHA GitHub CI. It
performs the final maximum-capability whole-milestone review and resolves every
high-confidence finding before recording evidence and closing issues.

## TDD, Review, and CI Workflow

Every behavior task follows strict RED-GREEN-REFACTOR:

1. add the smallest focused portable regression and run it to prove the missing
   behavior fails for the expected reason;
2. implement only enough behavior to pass;
3. rerun the focused suite and directly adjacent regressions;
4. obtain a task-scoped specification-compliance review;
5. obtain a separate task-scoped code-quality review;
6. reproduce accepted findings with a failing test where behavior changes, fix,
   and repeat both reviews until clean; and
7. commit the reviewed task.

A fresh implementer handles each implementation task. Models may be from the
GPT-5.6 family or Claude Opus 4.8 or lower; Claude Opus 5 is prohibited. The
final whole-branch and whole-milestone reviews use a maximum-capability
GPT-5.6-family model at maximum effort.

Local Test262 runs stay narrowly targeted to the current behavior. A full local
Test262 run is avoided unless a focused failure cannot establish confidence.
Broad coverage comes from pinned exact-SHA CI. Any generated Test262 artifact is
created under `TZ=UTC`.

For each pull request:

1. push the reviewed head;
2. resolve the workflow run by that exact pushed HEAD SHA;
3. synchronously watch the run;
4. if the command backgrounds, use ten-minute `read_bash` waits on the same
   shell session rather than delayed notifications;
5. verify the pull request still points to the reviewed SHA and every expected
   required check is terminal and successful;
6. squash-merge and delete the branch only then; and
7. publish the merge SHA and stable interfaces before the next layer starts.

## Final Acceptance Criteria

- The Agent Job Queue is FIFO, cross-Realm correct, manually deterministic,
  explicitly host-scheduled, recoverable after host-hook failures, and free of
  implicit host globals.
- ES2015 Promise construction, resolution, thenable assimilation, reactions,
  combinators, species, rejection tracking, and ordering pass focused portable
  and targeted Test262 coverage.
- Generator functions and methods use a host-stack-free continuation machine,
  implement exact state/resume/yield/delegation/abrupt semantics, and integrate
  with the existing iterator protocol and Realm ownership.
- Static modules parse, load through explicit portable hooks, canonicalize and
  deduplicate deterministically, link atomically through cycles, evaluate once,
  preserve live bindings, and expose correct namespace objects.
- Host Promise orchestration is confined to module hook awaiting and never
  implements guest Promise, job, generator, or module semantics.
- Node, Chromium, and JSC portable behavior is equivalent.
- Targeted local Test262 passes during implementation; final pinned exact-SHA CI
  supplies broad coverage; generated artifacts are deterministic under UTC.
- Every task-level specification and quality review is resolved, and the final
  maximum-capability whole-milestone review has no unresolved high-confidence
  correctness finding.
- All four child issues contain merge and validation evidence; #28 and roadmap
  #24 contain final evidence and are closed only after every criterion above is
  satisfied.
