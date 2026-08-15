# Agent Jobs and ES2015 Promises Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Agent-owned deterministic Job Queue, an explicit portable `jobHost` scheduling boundary, complete ES2015 Promise semantics, and opt-in async Test262 `$DONE` execution.

**Architecture:** `Agent` owns one `AgentJobQueue`, so all Realms that share an Agent also share FIFO ordering and one checkpoint state machine. Promise objects and algorithms remain guest-engine data and Completion Record operations; host microtasks are only an optional notification mechanism that calls back into `Agent.runJobs()`. A portable Test262 engine adapter installs `$DONE` and drains guest jobs deterministically without using host Promise semantics to implement guest Promise behavior.

**Tech Stack:** Plain ECMAScript modules, strict JSDoc checked by `tsc`, the existing object/evaluator/iterator runtime, portable repository test harnesses, pinned Test262 revision `b363f29d3c43c626dc852744ad64a0b48a003693`, Node, Chromium, and JavaScriptCore.

## Global Constraints

- The approved architecture is `docs/superpowers/specs/2026-08-14-async-runtime-and-modules-design.md` at commit `eb1a2ad`; do not change a stable interface without a design amendment.
- This plan implements child issue #60 only. Do not implement generators (#59), static modules (#62), or integration/release work (#61).
- Keep `src/` plain JavaScript with strict JSDoc. Do not add a runtime dependency.
- Do not use host `Promise`, `queueMicrotask`, `process.nextTick`, browser globals, or JSC globals to implement guest jobs or guest Promises.
- `jobHost.scheduleMicrotask(callback)` is the only automatic scheduling boundary. The default is deterministic manual mode.
- A Job Record is `{ realm: Realm | null, callback: Function, arguments: readonly unknown[], kind: string }`.
- Promise reaction jobs use Realm `null` only for an empty identity/thrower handler, where no user ECMAScript code executes and no new ECMAScript object is created.
- Successful `GetFunctionRealm` uses the returned Realm. Abrupt `GetFunctionRealm` captures the current Realm at lookup time for both reaction and thenable jobs.
- Run generated or artifact-producing Test262 commands with `TZ=UTC`.
- Use targeted local Test262 only. Broad conformance is delegated to exact-SHA CI.
- Every behavior task follows RED, GREEN, focused verification, fresh spec review, fresh quality review, and fix/re-review before its commit is accepted.
- Do not use Claude Opus 5 for implementers or reviewers. Use GPT-5.6-family models or Claude Opus 4.8 or lower.

## File and Interface Map

### Runtime ownership

- Create `src/runtime/jobs.js`: `AgentJobQueue`, `validateJobHost`, Job Record validation, checkpoint generation/state, failure records, and deterministic draining.
- Modify `src/runtime/agent.js`: construct one queue and delegate `enqueueJob`, `runJobs`, `takeJobFailures`, and observable queue state to it.
- Modify `src/runtime/realm.js`: accept `jobHost` only on convenience Realm creation, reject `agent` plus `jobHost`, preserve one queue for shared Agents, and install Promise intrinsics.
- Modify `src/index.js`: export stable Agent/Realm creation behavior and only the public queue types/functions needed by embedders.

### Function Realm lookup

- Create `src/runtime/function-realm.js`: `getFunctionRealm(callable)` and the internal abrupt-lookup callable fixture used by portable tests.
- Modify `src/runtime/function-object.js`: return the owning Realm for ECMAScript functions.
- Modify `src/builtins/shared.js`: return the owning Realm for native functions.
- Modify `src/builtins/function.js`: recurse through `BoundFunction.boundTargetFunction`.
- Modify `src/builtins/fundamental.js` and `src/runtime/realm.js`: give `%Function.prototype%` its Realm after bootstrap.

### Promise semantics

- Create `src/runtime/promise.js`: `PromiseObject`, Promise reaction/capability records, state transitions, resolving functions, reaction jobs, thenable jobs, capability creation, and Promise algorithms shared by builtins.
- Create `src/builtins/promise.js`: `%Promise%`, `%Promise.prototype%`, descriptors, constructor/call behavior, `then`, `catch`, `resolve`, `reject`, `all`, `race`, and `@@species`.
- Modify `src/runtime/realm.js`: create Promise intrinsics after iterator and Symbol infrastructure and define the global `Promise`.
- Modify `src/builtins/iterator.js` only if an existing IteratorClose/GetIterator operation is not exported; extract/reuse it rather than duplicating iterator protocol code.

### Portable tests and Test262

- Create `test/jobs.test.js`: Agent queue, scheduling generation, recovery, manual mode, cross-Realm context, and host hook failures.
- Create `test/promise-core.test.js`: constructor, resolving functions, thenables, state transitions, and descriptors.
- Create `test/promise-reactions.test.js`: reaction ordering, chaining, Realm selection, rejection tracking, and abrupt conversion.
- Create `test/promise-combinators.test.js`: `resolve`, `reject`, `all`, `race`, iterator closing, and species behavior.
- Create `tools/test262/engine.js`: portable JSJS Test262 adapter with `$DONE` installation and deterministic `runJobs`.
- Modify `tools/test262/runner.js`: opt-in async metadata handling and `$DONE` outcome classification while leaving the synchronous default unchanged.
- Create `test/test262-async.test.js`: portable in-memory async Test262 fixtures.
- Create `test/ci/es2015-promise-test262.test.js`: focused upstream Promise files only.
- Modify `test/suites.js`: register every new portable suite.
- Modify `docs/testing.md`, `docs/conformance.md`, and `README.md`: document manual/automatic jobs, Promise coverage, and the focused Test262 command.

## Stable Layer-1 Interfaces

The implementation may use private fields internally, but later layers and embedders may rely on these signatures:

```js
/**
 * @typedef {{
 *   scheduleMicrotask(checkpoint: () => JobDrainReport): void,
 *   reportJobError?: (failure: JobFailure) => void,
 *   promiseRejectionTracker?: (
 *     promise: PromiseObject,
 *     operation: 'reject' | 'handle',
 *   ) => void,
 * }} JobHost
 *
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
 *
 * @typedef {{
 *   processed: number,
 *   failures: readonly JobFailure[],
 * }} JobDrainReport
 */

createAgent({ jobHost?: JobHost } = {}): Agent
createRealm({ agent?: Agent, jobHost?: JobHost } = {}): Realm
agent.enqueueJob(job: JobRecord): void
agent.runJobs(): JobDrainReport
agent.takeJobFailures(): readonly JobFailure[]
agent.checkpointState: 'idle' | 'scheduled' | 'draining'
agent.currentJobRealm: Realm | null
```

`createRealm({ agent, jobHost })` throws a host `TypeError` before Realm construction. `jobHost` is validated once when an Agent is created. If `scheduleMicrotask` throws, `enqueueJob` throws that host error synchronously, keeps the queued Job Record, invalidates the failed generation, and restores `idle`; a later `runJobs()` can recover it.

## Required Task Review Protocol

For each task below:

1. Dispatch one fresh implementer with only the approved spec, this plan, the task text, and the current HEAD.
2. Require the implementer to show the named RED command failing before production edits and the named GREEN command passing afterward.
3. Dispatch a fresh specification reviewer. Fix every finding, then rerun the task tests and re-request spec review.
4. Dispatch a different fresh quality reviewer. Fix every finding, then rerun the task tests and re-request quality review.
5. Commit only after both reviewers approve. Do not combine adjacent tasks into one implementer context or one review gate.

---

### Task 1: Agent Job Queue and Portable Host Scheduling

**Files:**

- Create: `src/runtime/jobs.js`
- Modify: `src/runtime/agent.js`
- Modify: `src/runtime/realm.js`
- Modify: `src/index.js`
- Create: `test/jobs.test.js`
- Modify: `test/suites.js`

**Interfaces:**

- Consumes: existing `Realm`, `Agent`, and Completion Record shapes.
- Produces: every stable Agent/job interface in “Stable Layer-1 Interfaces”; Tasks 3-7 must enqueue only through `Agent.enqueueJob`.

- [ ] **Step 1: Write queue construction and validation tests**

Add the first tests to `test/jobs.test.js`:

```js
import { createAgent, createRealm } from '../src/index.js';
import { createNormalCompletion } from '../src/runtime/completion.js';
import { assertSame, assertThrows } from './harness/assert.js';

export default [
  {
    name: 'jobHost is validated once and cannot accompany an Agent',
    run: () => {
      assertThrows(() => createAgent({ jobHost: {} }), TypeError);
      const agent = createAgent();
      assertThrows(
        () =>
          createRealm({
            agent,
            jobHost: { scheduleMicrotask() {} },
          }),
        TypeError,
      );
    },
  },
  {
    name: 'manual Agent drains FIFO through jobs queued during the drain',
    run: () => {
      const realm = createRealm();
      const order = [];
      realm.agent.enqueueJob({
        realm,
        callback() {
          order.push('a');
          realm.agent.enqueueJob({
            realm,
            callback() {
              order.push('c');
              return createNormalCompletion(undefined);
            },
            arguments: [],
            kind: 'test-c',
          });
          return createNormalCompletion(undefined);
        },
        arguments: [],
        kind: 'test-a',
      });
      realm.agent.enqueueJob({
        realm,
        callback() {
          order.push('b');
          return createNormalCompletion(undefined);
        },
        arguments: [],
        kind: 'test-b',
      });

      assertSame(realm.agent.checkpointState, 'idle');
      assertSame(order.join(','), '');
      assertSame(realm.agent.runJobs().processed, 3);
      assertSame(order.join(','), 'a,b,c');
    },
  },
];
```

- [ ] **Step 2: Run the focused suite to verify RED**

Run:

```bash
node test/run-node.js test/jobs.test.js
```

Expected: FAIL because `Agent.enqueueJob`, `Agent.runJobs`, and `createAgent({ jobHost })` do not exist.

- [ ] **Step 3: Implement Job Records, validation, FIFO draining, and manual mode**

Implement `src/runtime/jobs.js` around this public contract:

```js
export class AgentJobQueue {
  /** @param {JobHost | undefined} jobHost */
  constructor(jobHost) {}

  /** @param {JobRecord} job */
  enqueue(job) {}

  /** @returns {JobDrainReport} */
  run() {}

  /** @returns {readonly JobFailure[]} */
  takeFailures() {}

  /** @returns {'idle' | 'scheduled' | 'draining'} */
  get state() {}

  /** @returns {Realm | null} */
  get currentRealm() {}
}

/** @param {unknown} jobHost @returns {JobHost | null} */
export function validateJobHost(jobHost) {}
```

Validate `scheduleMicrotask`, `reportJobError`, and `promiseRejectionTracker` as callable when present. Reject malformed Job Records before enqueue: `realm` must be a Realm owned by this Agent or `null`, `callback` must be callable, `arguments` must be an array, and `kind` must be a nonempty string. Copy and freeze each enqueued Job Record’s `arguments` array so host mutation cannot reorder arguments. Manual mode has no implicit scheduler and leaves state `idle` until `run()`. Add one RED case for each invalid field and prove rejection leaves the queue/state unchanged.

`run()` must:

1. Throw host `TypeError("Agent job checkpoint is already draining")` on reentry.
2. Invalidate any scheduled generation before switching to `draining`.
3. Shift FIFO until empty, including jobs appended while draining.
4. Set `currentRealm` to each record’s Realm, call `job.callback(job.arguments)`, and restore the previous value in `finally`.
5. Require a valid `{ type: 'normal' | 'throw', value }` Job Completion; classify malformed returns or host throws as `{ job, category: 'job', error }` rather than leaking them.
6. Append failures and call `reportJobError` if present. If that hook throws, append a separate `{ job: null, category: 'host-hook', error }` failure without recursively reporting it.
7. Restore `idle` and `currentRealm === null` in `finally`.
8. Return a frozen `JobDrainReport`; `takeFailures()` returns and clears the durable failure list.

Also add one internal Agent operation used by Promise rejection tracking:

```js
/** @param {unknown} error */
recordHostHookFailure(error) {
  // Append { job: null, category: 'host-hook', error } without recursively
  // calling reportJobError.
}
```

- [ ] **Step 4: Add checkpoint generation, stale callback, and scheduler recovery tests**

Append tests that retain scheduled callbacks:

```js
{
  name: 'stale callback A cannot consume newly scheduled generation B',
  run: () => {
    const callbacks = [];
    const realm = createRealm({
      jobHost: {
        scheduleMicrotask(callback) {
          callbacks.push(callback);
        },
      },
    });
    const order = [];
    const enqueue = (label) =>
      realm.agent.enqueueJob({
        realm,
        callback() {
          order.push(label);
          return createNormalCompletion(undefined);
        },
        arguments: [],
        kind: label,
      });

    enqueue('A');
    assertSame(callbacks.length, 1);
    realm.agent.runJobs();
    enqueue('B');
    assertSame(callbacks.length, 2);
    callbacks[0]();
    assertSame(order.join(','), 'A');
    assertSame(realm.agent.checkpointState, 'scheduled');
    callbacks[1]();
    assertSame(order.join(','), 'A,B');
    assertSame(realm.agent.checkpointState, 'idle');
  },
},
{
  name: 'scheduler throw retains jobs and allows manual recovery',
  run: () => {
    const error = new Error('scheduler failed');
    const realm = createRealm({
      jobHost: {
        scheduleMicrotask() {
          throw error;
        },
      },
    });
    let ran = false;
    let caught;
    try {
      realm.agent.enqueueJob({
        realm,
        callback() {
          ran = true;
          return createNormalCompletion(undefined);
        },
        arguments: [],
        kind: 'recover',
      });
    } catch (value) {
      caught = value;
    }
    assertSame(caught, error);
    assertSame(realm.agent.checkpointState, 'idle');
    assertSame(realm.agent.runJobs().processed, 1);
    assertSame(ran, true);
  },
},
```

Also pin: empty-to-nonempty coalesces to one callback; enqueue during `scheduled` or `draining` does not schedule again; reentrant `runJobs` throws; cross-Realm jobs expose the correct `currentJobRealm`; a null-Realm job exposes `null`; an abrupt job is reported and later jobs still run; a reporting hook throw is retained without escaping.

- [ ] **Step 5: Implement generation scheduling and Realm/Agent option wiring**

Use a monotonically increasing integer and an active token:

```js
scheduleCheckpoint() {
  const token = ++this.nextGeneration;
  this.scheduledGeneration = token;
  this.checkpointState = 'scheduled';
  try {
    this.jobHost.scheduleMicrotask(() => {
      if (
        this.checkpointState !== 'scheduled' ||
        this.scheduledGeneration !== token
      ) {
        return EMPTY_JOB_DRAIN_REPORT;
      }
      return this.run();
    });
  } catch (error) {
    this.scheduledGeneration = null;
    this.checkpointState = 'idle';
    throw error;
  }
}
```

Define `EMPTY_JOB_DRAIN_REPORT` once as the frozen `{ processed: 0, failures: Object.freeze([]) }` returned by every stale callback. Do not reschedule jobs retained after a scheduler throw; the caller received the synchronous error and must choose manual recovery or enqueue again. `createRealm({ jobHost })` creates exactly one new Agent with that host. `createRealm({ agent })` reuses its queue. `createAgent` is already exported from `src/index.js`; preserve that export while widening its options.

- [ ] **Step 6: Run focused and adjacent suites to verify GREEN**

Run:

```bash
node test/run-node.js test/jobs.test.js test/realms.test.js test/symbols.test.js
npm run typecheck
```

Expected: all tests pass and `tsc` reports no errors.

- [ ] **Step 7: Complete task reviews and commit**

After the required fresh spec and quality review loops, commit:

```bash
git add src/runtime/jobs.js src/runtime/agent.js src/runtime/realm.js src/index.js test/jobs.test.js test/suites.js
git commit -m "feat: add agent job queue and host scheduler"
```

---

### Task 2: Specification-Accurate Function Realm Lookup

**Files:**

- Create: `src/runtime/function-realm.js`
- Modify: `src/runtime/function-object.js`
- Modify: `src/builtins/shared.js`
- Modify: `src/builtins/function.js`
- Modify: `src/builtins/fundamental.js`
- Modify: `src/runtime/realm.js`
- Create: `test/function-realm.test.js`
- Modify: `test/suites.js`

**Interfaces:**

- Consumes: guest callable representations and Realm bootstrap.
- Produces: `getFunctionRealm(callable): JobCompletion`, where normal value is a Realm and throw value is a guest abrupt value, plus `createAbruptRealmCallable(realm, thrownValue): CallableLike`; Tasks 3-4 pass the caller’s current Realm separately when lookup is abrupt.

- [ ] **Step 1: Write direct, bound, cross-Realm, and abrupt lookup tests**

Create `test/function-realm.test.js` with direct imports of the internal operation:

```js
import { createRealm, evaluateScript } from '../src/index.js';
import {
  createAbruptRealmCallable,
  getFunctionRealm,
} from '../src/runtime/function-realm.js';
import { createGuestError } from '../src/builtins/errors.js';
import { assertSame } from './harness/assert.js';

export default [
  {
    name: 'GetFunctionRealm follows ECMAScript and native function ownership',
    run: () => {
      const realm = createRealm();
      const closure = evaluateScript(realm, '(function handler() {})').value;
      const native = realm.globalObject.get('parseInt');
      assertSame(getFunctionRealm(closure).value, realm);
      assertSame(getFunctionRealm(native).value, realm);
      assertSame(
        getFunctionRealm(realm.intrinsics.functionPrototype).value,
        realm,
      );
    },
  },
  {
    name: 'GetFunctionRealm recursively follows a bound target',
    run: () => {
      const realmA = createRealm();
      const realmB = createRealm();
      const target = evaluateScript(realmA, '(function target() {})').value;
      realmB.globalObject.defineOwnProperty('target', {
        value: target,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const bound = evaluateScript(realmB, 'target.bind(null)').value;
      assertSame(getFunctionRealm(bound).value, realmA);
    },
  },
  {
    name: 'internal callable exotic can model abrupt Realm lookup',
    run: () => {
      const realm = createRealm();
      const thrown = createGuestError(realm, 'TypeError', 'revoked');
      const lookup = getFunctionRealm(createAbruptRealmCallable(realm, thrown));
      assertSame(lookup.type, 'throw');
      assertSame(lookup.value, thrown);
    },
  },
];
```

The operation returns the shown Job Completion shape and never uses a host exception to represent guest abrupt completion.

- [ ] **Step 2: Run the focused suite to verify RED**

Run:

```bash
node test/run-node.js test/function-realm.test.js
```

Expected: FAIL because `src/runtime/function-realm.js` does not exist.

- [ ] **Step 3: Implement Realm lookup on every callable family**

Define one discriminated operation:

```js
/**
 * @param {CallableLike} callable
 * @returns {JobCompletion} Normal contains Realm; Throw contains guest value.
 */
export function getFunctionRealm(callable) {
  return callable.getFunctionRealm();
}
```

Add `getFunctionRealm()` to:

- `EngineFunction`: `{ type: 'normal', value: this.realm }`.
- `NativeFunction`: `{ type: 'normal', value: this.realm }`.
- `%Function.prototype%`: `{ type: 'normal', value: itsRealm }`.
- `BoundFunction`: delegate to `boundTargetFunction` recursively.
- the internal callable-exotic fixture: `{ type: 'throw', value: suppliedGuestValue }`.

Set `%Function.prototype%`’s Realm during `Realm` bootstrap immediately after the fundamental intrinsic table is created and before user code can observe it. Do not use `instanceof` chains in the operation; every callable exotic owns its lookup semantics.

- [ ] **Step 4: Add native differential tests for Realm ownership**

In the portable suite, create two guest Realms and assert errors/objects allocated by:

- a foreign direct handler belong to the handler Realm;
- a bound foreign handler still belongs to the target Realm;
- `%Function.prototype%` has the Realm that owns that intrinsic.

Add a host-side differential helper that runs equivalent revoked-Proxy probes with the host engine and records only the ownership result:

```js
function nativeAbruptLookupOwner() {
  const currentError = TypeError;
  const callable = Proxy.revocable(function () {}, {});
  callable.revoke();
  return Promise.resolve(1)
    .then(callable.proxy)
    .catch((error) => error instanceof currentError);
}
```

The guest internal callable exotic is the implementation fixture because Proxy is out of scope; the expected ownership is the current Realm captured when lookup becomes abrupt, matching Node/Chromium/JSC native behavior.

- [ ] **Step 5: Run focused and callable regression suites**

Run:

```bash
node test/run-node.js test/function-realm.test.js test/functions.test.js test/function-builtins.test.js test/dynamic-function.test.js
npm run typecheck
```

Expected: all pass.

- [ ] **Step 6: Complete task reviews and commit**

After both review loops approve:

```bash
git add src/runtime/function-realm.js src/runtime/function-object.js src/builtins/shared.js src/builtins/function.js src/builtins/fundamental.js src/runtime/realm.js test/function-realm.test.js test/suites.js
git commit -m "feat: add callable realm lookup"
```

---

### Task 3: Promise Objects, Construction, Resolution, and Thenable Jobs

**Files:**

- Create: `src/runtime/promise.js`
- Create: `src/builtins/promise.js`
- Modify: `src/runtime/realm.js`
- Create: `test/promise-core.test.js`
- Modify: `test/suites.js`

**Interfaces:**

- Consumes: `Agent.enqueueJob`, `getFunctionRealm`, native callable creation, guest object property access, and Completion Records.
- Produces: `PromiseObject`, `newPromiseCapability`, `createResolvingFunctions`, `fulfillPromise`, `rejectPromise`, and `newPromiseResolveThenableJob`; Task 4 adds reaction use of the same records.

- [ ] **Step 1: Write Promise constructor and descriptor tests**

Create portable tests that evaluate guest source:

```js
function assertNormalValue(completion, expected) {
  assertSame(completion.type, 'normal');
  assertSame(completion.value, expected);
}

function assertGuestTypeError(realm, completion) {
  assertSame(completion.type, 'throw');
  assertSame(
    completion.value.getPrototype(),
    realm.intrinsics.typeErrorPrototype,
  );
}

{
  name: 'Promise constructor is construct-only and exposes ES2015 descriptors',
  run: () => {
    const realm = createRealm();
    assertNormalValue(
      evaluateScript(
        realm,
        [
          'var p = new Promise(function (resolve) { resolve(42); });',
          'typeof Promise + ":" +',
          'Promise.length + ":" +',
          'Promise.name + ":" +',
          '(p instanceof Promise) + ":" +',
          '(Promise.prototype.constructor === Promise)',
        ].join('\n'),
      ),
      'function:1:Promise:true:true',
    );
    assertGuestTypeError(realm, evaluateScript(realm, 'Promise(function(){})'));
    assertGuestTypeError(realm, evaluateScript(realm, 'new Promise(1)'));
  },
},
{
  name: 'Promise executor runs synchronously and settles only once',
  run: () => {
    const realm = createRealm();
    assertNormalValue(
      evaluateScript(
        realm,
        [
          'var log = [];',
          'var p = new Promise(function (resolve, reject) {',
          '  log.push("executor");',
          '  resolve("first");',
          '  reject("second");',
          '  resolve("third");',
          '});',
          'log.push("after");',
          'log.join(",");',
        ].join('\n'),
      ),
      'executor,after',
    );
  },
},
```

Also assert the own descriptors for `Promise`, `Promise.prototype`, `constructor`, and constructor/prototype `name` and `length` against existing builtin conventions.

- [ ] **Step 2: Run the core suite to verify RED**

Run:

```bash
node test/run-node.js test/promise-core.test.js
```

Expected: FAIL because `Promise` is not a global binding.

- [ ] **Step 3: Implement Promise object slots, constructor, and capability creation**

In `src/runtime/promise.js`, use explicit engine records:

```js
export class PromiseObject extends EngineObject {
  /** @param {Realm} realm @param {EngineObject | null} prototype */
  constructor(realm, prototype) {
    super(prototype);
    this.realm = realm;
    this.promiseState = 'pending';
    this.promiseResult = undefined;
    /** @type {PromiseReactionRecord[]} */
    this.promiseFulfillReactions = [];
    /** @type {PromiseReactionRecord[]} */
    this.promiseRejectReactions = [];
    this.promiseIsHandled = false;
  }
}

/**
 * @typedef {{
 *   promise: PromiseObject,
 *   resolve: CallableLike,
 *   reject: CallableLike,
 * }} PromiseCapabilityRecord
 */
```

`newPromiseCapability(C, currentRealm)` must construct with an executor that captures exactly one callable resolve and reject function and rejects malformed constructors. The Promise constructor:

1. Throws guest `TypeError` when called without construction.
2. Throws guest `TypeError` for a non-callable executor.
3. Allocates with the constructor’s requested `newTarget` prototype.
4. Creates resolving functions before calling the executor.
5. Calls executor synchronously with `undefined` and `[resolve, reject]`.
6. Calls reject if the executor completes abruptly.
7. Returns the allocated Promise.

- [ ] **Step 4: Write resolving and thenable RED tests**

Add tests for:

- resolve/reject return `undefined`;
- self-resolution rejects with a guest `TypeError`;
- primitive and non-callable-`then` objects fulfill immediately;
- a throwing `then` getter rejects;
- callable thenables enqueue rather than invoke synchronously;
- thenable resolve/reject uses an already-resolved cell and cannot settle twice;
- resolving with pending, fulfilled, and rejected guest Promises adopts their eventual state without copying identity;
- foreign thenables enqueue a job whose Realm is the `then` callback’s Realm;
- abrupt `GetFunctionRealm(then)` enqueues with the current Realm at lookup time;
- a thenable job abrupt completion rejects the target Promise rather than appearing in Agent job failures.

Use internal `PromiseObject` slot assertions until Task 4 adds `.then`:

```js
const promise = /** @type {PromiseObject} */ (
  evaluateScript(realm, 'new Promise(function (resolve) { resolve(7); })').value
);
assertSame(promise.promiseState, 'fulfilled');
assertSame(promise.promiseResult, 7);
```

- [ ] **Step 5: Implement resolving functions and thenable jobs**

`createResolvingFunctions(promise, currentRealm)` creates two Realm-owned native functions sharing `{ value: false }`. Resolve implements ES2015 order:

1. Return `undefined` when already resolved; otherwise mark resolved.
2. Reject self-resolution with a `TypeError` allocated in the resolving function’s Realm.
3. Fulfill non-objects.
4. Get `resolution.then`; reject on abrupt Get.
5. Fulfill when `then` is not callable.
6. Determine Job Realm with `getFunctionRealm(then)`.
7. Use the returned Realm on normal lookup; use `currentRealm` on abrupt lookup.
8. Enqueue `newPromiseResolveThenableJob(promise, resolution, then)`.

The thenable job calls `then` with the thenable as `this` and fresh resolving functions. If that call is abrupt, call reject; never return a throw completion for guest thenable failure.

`fulfillPromise` and `rejectPromise` clear both reaction lists after extracting the relevant list, set state/result exactly once, and enqueue reactions in registration order. The lists may be empty in this task.

- [ ] **Step 6: Run focused tests and core runtime checks**

Run:

```bash
node test/run-node.js test/promise-core.test.js test/jobs.test.js test/function-realm.test.js test/objects.test.js
npm run typecheck
```

Expected: all pass.

- [ ] **Step 7: Complete task reviews and commit**

After review fix loops:

```bash
git add src/runtime/promise.js src/builtins/promise.js src/runtime/realm.js test/promise-core.test.js test/suites.js
git commit -m "feat: add promise construction and resolution"
```

---

### Task 4: Promise Reactions, Chaining, Species, and Rejection Tracking

**Files:**

- Modify: `src/runtime/promise.js`
- Modify: `src/builtins/promise.js`
- Create: `test/promise-reactions.test.js`
- Modify: `test/suites.js`

**Interfaces:**

- Consumes: Task 3 capability/resolution APIs and Task 1 rejection tracker hook.
- Produces: complete `Promise.prototype.then`, `Promise.prototype.catch`, reaction jobs, `Promise.resolve`, `Promise.reject`, and `Promise[@@species]`.

- [ ] **Step 1: Write reaction ordering and chaining tests**

Create tests covering pending and already-settled registration:

```js
{
  name: 'then reactions are asynchronous FIFO and chain through returned values',
  run: () => {
    const realm = createRealm();
    assertNormalValue(
      evaluateScript(
        realm,
        [
          'var log = [];',
          'var p = Promise.resolve(1);',
          'p.then(function (value) { log.push("a" + value); return value + 1; })',
          ' .then(function (value) { log.push("c" + value); });',
          'p.then(function (value) { log.push("b" + value); });',
          'log.push("sync");',
        ].join('\n'),
      ),
      'sync',
    );
    assertSame(realm.agent.runJobs().failures.length, 0);
    assertNormalValue(evaluateScript(realm, 'log.join(",")'), 'sync,a1,b1,c2');
  },
},
{
  name: 'empty handlers implement identity and thrower without a handler Realm',
  run: () => {
    const realm = createRealm();
    evaluateScript(
      realm,
      [
        'var values = [];',
        'Promise.resolve(1).then().then(function (x) { values.push(x); });',
        'Promise.reject(2).then().catch(function (x) { values.push(x); });',
      ].join('\n'),
    );
    realm.agent.runJobs();
    assertNormalValue(evaluateScript(realm, 'values.join(",")'), '1,2');
  },
},
```

Also pin: handler return resolution, handler throw rejection, non-callable handlers treated as empty, reaction jobs added while draining, multiple `then` calls create distinct child Promises, `catch` delegates to `then`, and `then` rejects incompatible receivers.

- [ ] **Step 2: Run the reaction suite to verify RED**

Run:

```bash
node test/run-node.js test/promise-reactions.test.js
```

Expected: FAIL because `Promise.prototype.then` and static `resolve`/`reject` are missing.

- [ ] **Step 3: Implement `PerformPromiseThen` and reaction jobs**

Represent reactions explicitly:

```js
/**
 * @typedef {{
 *   capability: PromiseCapabilityRecord | null,
 *   type: 'fulfill' | 'reject',
 *   handler: CallableLike | null,
 * }} PromiseReactionRecord
 */
```

`performPromiseThen(promise, onFulfilled, onRejected, resultCapability, currentRealm)`:

1. Normalize non-callables to `null`.
2. Append reactions while pending.
3. Enqueue the matching reaction immediately when settled.
4. If the promise was rejected and unhandled, call the rejection tracker with `'handle'`.
5. Set `promiseIsHandled = true`.
6. Return the result capability Promise.

`newPromiseReactionJob(reaction, argument, currentRealm)` chooses Job Realm:

- `handler === null`: Realm `null`.
- normal `getFunctionRealm(handler)`: the returned Realm.
- abrupt lookup: the supplied current Realm captured at lookup time.

The job must implement identity/thrower as Completion Records, call a non-empty handler, and then call the capability resolve or reject. Every guest abrupt handler completion becomes rejection of the result Promise. A null-Realm job must not run user ECMAScript code or allocate a guest object.

- [ ] **Step 4: Write cross-Realm ownership and rejection tracking tests**

Use borrowed foreign `then` functions and two Realms sharing one Agent to pin:

- missing handler Job Realm is `null`, while resolving functions allocate/call in their own normal Realm;
- a foreign handler Job Realm is the handler’s Realm;
- abrupt handler Realm lookup uses the current Realm at the lookup site;
- foreign thenable Job Realm is the foreign `then` Realm;
- abrupt thenable Realm lookup uses the current Realm;
- the host rejection tracker receives the exact guest Promise with `'reject'` once when rejected unhandled and `'handle'` once when later handled;
- tracker throws follow the Job Host hook policy and never alter queue ordering or Promise state.

Record Job Realms in a test `scheduleMicrotask`/job callback observer rather than exposing Promise internals. Use the Task 2 internal callable exotic for abrupt lookup and run equivalent revoked-Proxy ownership probes against Node, Chromium, and JSC native Promises in the cross-runtime fixture.

- [ ] **Step 5: Implement rejection tracking, species, `then`, `catch`, `resolve`, and `reject`**

`rejectPromise` invokes `promiseRejectionTracker(promise, 'reject')` only when the promise is unhandled at rejection. Tracker failure is recorded through the Agent host-hook failure mechanism and does not throw into guest execution.

Implement `speciesConstructor` using the existing property operations:

1. Read `promise.constructor`.
2. Default to `%Promise%` when it is `undefined`.
3. Require constructor to be an object.
4. Read `constructor[Symbol.species]`.
5. Default when species is `undefined` or `null`.
6. Require the chosen species to be constructible.

Define `Promise[@@species]` as configurable, non-enumerable getter returning `this`. `Promise.resolve(x)` returns `x` unchanged only when `x` is a Promise whose `constructor === this`; otherwise it creates a capability and resolves it. `Promise.reject(r)` always creates a capability and rejects it.

- [ ] **Step 6: Run focused Promise and cross-Realm tests**

Run:

```bash
node test/run-node.js test/promise-core.test.js test/promise-reactions.test.js test/jobs.test.js test/function-realm.test.js test/realms.test.js
npm run typecheck
```

Expected: all pass.

- [ ] **Step 7: Complete task reviews and commit**

After both review gates:

```bash
git add src/runtime/promise.js src/builtins/promise.js test/promise-reactions.test.js test/suites.js
git commit -m "feat: add promise reactions and chaining"
```

---

### Task 5: Promise `all` and `race` with Iterator Semantics

**Files:**

- Modify: `src/runtime/promise.js`
- Modify: `src/builtins/promise.js`
- Modify: `src/runtime/iterator.js` only if exports are required
- Create: `test/promise-combinators.test.js`
- Modify: `test/suites.js`

**Interfaces:**

- Consumes: `newPromiseCapability`, `Promise.resolve`, `GetIterator`, `IteratorStep`, `IteratorValue`, and `IteratorClose`.
- Produces: complete ES2015 `Promise.all` and `Promise.race`.

- [ ] **Step 1: Write successful order and empty-iterable tests**

Create tests for:

```js
{
  name: 'Promise.all preserves iteration order and waits for all inputs',
  run: () => {
    const realm = createRealm();
    evaluateScript(
      realm,
      [
        'var result;',
        'Promise.all([Promise.resolve(1), 2, Promise.resolve(3)])',
        '  .then(function (values) { result = values.join(","); });',
      ].join('\n'),
    );
    realm.agent.runJobs();
    assertNormalValue(evaluateScript(realm, 'result'), '1,2,3');
  },
},
{
  name: 'Promise.all empty fulfills while Promise.race empty stays pending',
  run: () => {
    const realm = createRealm();
    const all = evaluateScript(realm, 'Promise.all([])').value;
    const race = evaluateScript(realm, 'Promise.race([])').value;
    assertSame(all.promiseState, 'fulfilled');
    assertSame(race.promiseState, 'pending');
  },
},
```

Also verify duplicate values, thenables, early rejection, race-first-settlement, and source-order calls to overridden constructor `resolve`.

- [ ] **Step 2: Run the combinator suite to verify RED**

Run:

```bash
node test/run-node.js test/promise-combinators.test.js
```

Expected: FAIL because `Promise.all` and `Promise.race` are missing.

- [ ] **Step 3: Implement `PerformPromiseAll` and `PerformPromiseRace`**

Reuse existing iterator operations. For `all`, create one shared mutable remaining-elements cell initialized to `1`, one already-called cell per element, and preserve integer index order independent of settlement order. Create the result array in the current builtin Realm through existing array allocation helpers.

Both methods:

1. Treat `this` as constructor `C`.
2. Create the result capability before iterator acquisition.
3. Iterate in source order.
4. Invoke the ES2015 `C.resolve` operation for each value, observing a getter on every iteration rather than importing the later `GetPromiseResolve` optimization.
5. Invoke `then` on each resolved value with the result functions.
6. On abrupt iterator step/value/resolve/then setup, perform IteratorClose with specification error precedence, reject the result capability, and return its Promise.

Do not use host iteration or host arrays for guest behavior.

- [ ] **Step 4: Add IteratorClose and adversarial constructor tests**

Pin:

- iterator `return` runs when `next`, `value`, `C.resolve`, or `then` access/call is abrupt;
- the original abrupt completion wins over a normal close;
- a throwing `return` replaces a normal completion where specified by existing IteratorClose;
- `all` element resolve functions are idempotent;
- getters and overridden `resolve` observe deterministic source order;
- subclass result construction uses `this`, not the intrinsic Promise;
- invalid `this`, non-callable `resolve`, malformed iterator results, and non-object iterator results reject rather than leak host errors.

- [ ] **Step 5: Run Promise and iterator regression suites**

Run:

```bash
node test/run-node.js test/promise-combinators.test.js test/promise-core.test.js test/promise-reactions.test.js test/iterators.test.js test/array-builtins.test.js
npm run typecheck
```

Expected: all pass.

- [ ] **Step 6: Complete task reviews and commit**

After both review gates:

```bash
git add src/runtime/promise.js src/builtins/promise.js src/runtime/iterator.js test/promise-combinators.test.js test/suites.js
git commit -m "feat: add promise combinators"
```

If `src/runtime/iterator.js` is unchanged, omit it from `git add`.

---

### Task 6: Portable Async Test262 `$DONE` and Focused Promise Coverage

**Files:**

- Create: `tools/test262/engine.js`
- Modify: `tools/test262/runner.js`
- Modify: `tools/test262/upstream-run.js`
- Modify: `tools/test262/adapters/node.js`
- Modify: `tools/test262/adapters/jsc-run.js`
- Create: `test/fixtures/test262/test/async-promise.js`
- Modify: `test/fixtures/test262/manifest.json`
- Create: `test/test262-async.test.js`
- Create: `test/ci/es2015-promise-test262.test.js`
- Modify: `test/run-ci-contract.js`
- Modify: `test/suites.js`
- Modify: `test/node/repository-invariants.test.js`

**Interfaces:**

- Consumes: `createRealm`, `evaluateScript`, Realm native-function creation, and `Agent.runJobs`.
- Produces: `createJsjsTest262Engine()` and async-flag execution for every runner caller; tests without the `async` flag preserve the existing synchronous path.

- [ ] **Step 1: Write portable async runner RED tests**

Create an in-memory `Test262Host` in `test/test262-async.test.js` and assert:

```js
function inMemoryHost(files) {
  return {
    readTest(file) {
      if (!Object.prototype.hasOwnProperty.call(files, file)) {
        throw new Error(`missing test fixture: ${file}`);
      }
      return files[file];
    },
    readInclude() {
      return '';
    },
  };
}

const ASYNC_SOURCE = `/*---
flags: [async]
---*/
Promise.resolve(42).then(function (value) {
  $DONE(value === 42 ? undefined : "wrong value");
});
`;

{
  name: 'async Test262 mode installs $DONE and drains guest jobs',
  run: async () => {
    const result = await runTest262({
      engine: createJsjsTest262Engine(),
      host: inMemoryHost({ 'test/async.js': ASYNC_SOURCE }),
      paths: ['test/async.js'],
    });
    assertSame(result.summary.passed, 2);
    assertSame(result.summary.failed, 0);
  },
},
```

Add fixtures for `$DONE("message")`, `$DONE(guestError)`, duplicate `$DONE`, missing `$DONE` after a complete drain, a guest job failure, include failure before `$DONE`, strict/non-strict variants, and async parse/runtime negative expectations. Add a separate sync fixture proving that tests without `flags: [async]` never install `$DONE` or drain jobs.

- [ ] **Step 2: Run portable runner tests to verify RED**

Run:

```bash
node test/run-node.js test/test262-async.test.js
```

Expected: FAIL because async mode and the portable engine adapter do not exist.

- [ ] **Step 3: Implement the portable engine adapter**

Create `tools/test262/engine.js`:

```js
export function createJsjsTest262Engine() {
  return Object.freeze({
    createRealm,
    evaluateScript,
    installDone(realm, onDone) {
      const done = realm.createNativeFunction({
        name: '$DONE',
        length: 1,
        call(_thisValue, args) {
          onDone(args[0]);
          return undefined;
        },
      });
      realm.globalObject.defineOwnProperty('$DONE', {
        value: done,
        writable: true,
        enumerable: false,
        configurable: true,
      });
    },
    runJobs(realm) {
      return realm.agent.runJobs();
    },
  });
}
```

The native callback signature is `call(thisValue, args)`, so implement the bridge body as `call(_thisValue, args) { onDone(args[0]); return undefined; }`. Update Node, JSC, and `upstream-run.js` to use this one engine object so adapter behavior cannot drift. Browser-focused portable suites import the same module through `test/suites.js`.

- [ ] **Step 4: Implement async runner outcomes**

Extend JSDoc:

```js
/**
 * @typedef {{
 *   createRealm(): any,
 *   evaluateScript(realm: any, source: string): CompletionRecord,
 *   installDone?: (realm: any, onDone: (value: unknown) => void) => void,
 *   runJobs?: (realm: any) => JobDrainReport,
 * }} Test262Engine
 */
```

Remove only `'async'` from `UNSUPPORTED_FLAGS`. When metadata contains `async`:

- require `installDone` and `runJobs`, otherwise emit `engine-error`;
- install `$DONE` before includes/test evaluation;
- after normal script evaluation, call `runJobs` exactly once; it drains through newly queued jobs;
- classify no `$DONE` as `async-incomplete`;
- classify non-`undefined` `$DONE` as `async-error` using guest-value description;
- classify a second `$DONE` as `async-duplicate`;
- classify nonempty Job Drain failures as `job-error`;
- never wait on a host Promise or timer for guest completion.

Negative parse tests retain existing behavior and do not drain jobs. Non-async tests continue through the current synchronous code path byte-for-byte.

- [ ] **Step 5: Add the focused pinned Promise Test262 suite**

Create `test/ci/es2015-promise-test262.test.js` following `es2015-object-function-test262.test.js`. Use `createJsjsTest262Engine()` and an alphabetically sorted frozen path list containing at least:

```js
const FOCUSED_PATHS = Object.freeze([
  'test/built-ins/Promise/Symbol.species/prop-desc.js',
  'test/built-ins/Promise/all/resolve-non-thenable.js',
  'test/built-ins/Promise/constructor.js',
  'test/built-ins/Promise/prototype/then/rxn-handler-identity.js',
  'test/built-ins/Promise/prototype/then/rxn-handler-thrower.js',
  'test/built-ins/Promise/race/resolved-sequence.js',
  'test/built-ins/Promise/resolve-thenable-immed.js',
  'test/built-ins/Promise/resolve/resolve-thenable.js',
]);
```

Expand the list only with files inspected at the exact pin and implemented by this layer. Require zero failed and zero skipped records. Import the suite and add its exact file/test pair to `CI_CONTRACT_SUITES` in `test/run-ci-contract.js`, not to portable `test/suites.js`, because it requires `vendor/test262`.

Add `test/fixtures/test262/test/async-promise.js` with the same Promise/`$DONE` shape as `ASYNC_SOURCE`, add it to `manifest.json`, and register `es2015-promise-test262.test.js` explicitly in `test/run-ci-contract.js`. Do not put checkout-dependent suites in `test/suites.js`.

- [ ] **Step 6: Run portable, fixture, and focused upstream tests**

Run:

```bash
TZ=UTC node test/run-node.js test/test262-async.test.js test/jobs.test.js test/promise-core.test.js test/promise-reactions.test.js test/promise-combinators.test.js
TZ=UTC npm run test262:fixtures
TZ=UTC node test/run-node.js test/ci/es2015-promise-test262.test.js
npm run typecheck
```

Expected: all portable/fixture tests pass and every focused upstream record passes without skips. If a listed file exposes an unsupported behavior inside the approved Promise scope, add a RED portable regression and fix the engine; do not remove the file to hide the failure.

- [ ] **Step 7: Run Chromium and JSC portable suites**

Run:

```bash
npm run test:browser
npm run test:jsc
```

Expected: both pass, and the portable async fixture emits equivalent Test262 status/reason records under Node, Chromium, and JSC. If `jsc` is unavailable locally, record the exact missing-tool output for the PR and require the JSC CI job before merge; do not substitute host Node results.

- [ ] **Step 8: Complete task reviews and commit**

After both review gates:

```bash
git add tools/test262/engine.js tools/test262/runner.js tools/test262/upstream-run.js tools/test262/adapters/node.js tools/test262/adapters/jsc-run.js test/fixtures/test262/test/async-promise.js test/fixtures/test262/manifest.json test/test262-async.test.js test/ci/es2015-promise-test262.test.js test/run-ci-contract.js test/suites.js test/node/repository-invariants.test.js
git commit -m "test: add async promise Test262 coverage"
```

---

### Task 7: Layer-1 Documentation, Whole-Layer Verification, Review, CI, and Merge

**Files:**

- Modify: `README.md`
- Modify: `docs/testing.md`
- Modify: `docs/conformance.md`
- Modify: `docs/superpowers/specs/2026-08-14-async-runtime-and-modules-design.md` only for status/evidence, not architecture
- Modify: issue #60, parent #28, and roadmap #24 through GitHub issue comments/status

**Interfaces:**

- Consumes: all completed layer-1 interfaces.
- Produces: published stable interface documentation and a squash-merged layer-1 SHA on updated `main`.

- [ ] **Step 1: Write documentation assertions before prose**

Extend repository invariant tests to require:

- README mentions deterministic `realm.agent.runJobs()` and optional `jobHost.scheduleMicrotask`;
- `docs/testing.md` names the focused Promise Test262 suite and `TZ=UTC`;
- `docs/conformance.md` names Agent Jobs, ES2015 Promise constructor/reactions/thenables/combinators, async `$DONE`, and explicit exclusions;
- no document claims generators or modules are implemented.

Run:

```bash
node test/run-node.js test/node/repository-invariants.test.js
```

Expected: FAIL on missing layer-1 documentation.

- [ ] **Step 2: Document the stable interfaces and conformance boundary**

Document:

- manual mode example:

```js
const realm = createRealm();
evaluateScript(realm, 'Promise.resolve(1).then(function (x) { result = x; })');
const checkpoint = realm.agent.runJobs();
```

- automatic mode example:

```js
const realm = createRealm({
  jobHost: {
    scheduleMicrotask(callback) {
      queueMicrotask(callback);
    },
  },
});
```

State explicitly that the sample host may use `queueMicrotask`, but `src/` does not. Document Job Record Realm rules, generation/stale-callback behavior, scheduler failure recovery, Job Drain failure handling, rejection tracker operations, Promise support, focused Test262 pin, and non-goals.

- [ ] **Step 3: Run formatting, lint, type, portable, focused, and generation checks**

Run:

```bash
npx prettier --write $(git diff --name-only origin/main -- '*.js' '*.md')
npm run format
npm run lint
npm run typecheck
npm test
npm run test:browser
npm run test:jsc
TZ=UTC npm run test262:fixtures
TZ=UTC node test/run-node.js test/ci/es2015-promise-test262.test.js
npm run vendor:check
npm run ci:check
npm run test262:select:check
```

Expected: every available command passes. Do not run or regenerate the broad upstream Test262 report locally in layer 1; exact-SHA CI owns broad coverage and artifact checks.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md docs/testing.md docs/conformance.md docs/superpowers/specs/2026-08-14-async-runtime-and-modules-design.md test/node/repository-invariants.test.js
git commit -m "docs: publish jobs and promises interfaces"
```

Omit the design spec from `git add` if no status-only edit is required.

- [ ] **Step 5: Request maximum-capability whole-layer review**

Dispatch one max-capability `code-review` agent using GPT-5.6-family or Claude Opus 4.8 with:

- merge base `origin/main`;
- approved design commit `eb1a2ad`;
- issue #60 acceptance criteria;
- all stable interface contracts in this plan;
- explicit focus on cross-Realm ownership, generation races, Promise abrupt conversion, IteratorClose precedence, host/guest scheduling separation, and async runner determinism.

Fix every high-confidence finding test-first. Rerun the smallest relevant focused tests, then rerun Step 3. Re-request whole-layer review until approved.

- [ ] **Step 6: Push and open the layer-1 PR**

```bash
git status --short
git log --oneline origin/main..HEAD
git push -u origin HEAD
```

Open a PR that:

- references `Closes #60`;
- marks #28 as the parent milestone without closing it;
- states #59 remains blocked until merge;
- lists the stable Agent/job interfaces;
- records the targeted Promise Test262 paths and cross-runtime results;
- names generators, modules, and release integration as explicit non-goals.

- [ ] **Step 7: Resolve and synchronously watch exact-SHA CI**

Capture pushed HEAD:

```bash
HEAD_SHA="$(git rev-parse HEAD)"
gh run list --repo yoonbuck/jsjs --commit "$HEAD_SHA" --json databaseId,headSha,status,conclusion,workflowName
```

Select the workflow run whose `headSha` exactly equals `$HEAD_SHA`, then:

```bash
gh run watch RUN_ID --repo yoonbuck/jsjs --exit-status
```

If the shell tool backgrounds, call `read_bash` on the same shell ID with `delay: 600` in the same turn until it exits. Do not rely on delayed notifications. Afterward verify:

```bash
gh pr view --repo yoonbuck/jsjs --json headRefOid,mergeStateStatus,statusCheckRollup
```

Expected: `headRefOid` equals `$HEAD_SHA`, merge state is clean, and every required terminal check is successful. Fix failures test-first, push a new SHA, and resolve/watch the new exact-SHA run.

- [ ] **Step 8: Squash merge and publish the handoff**

After required review and CI:

```bash
gh pr merge --repo yoonbuck/jsjs --squash --delete-branch
git fetch origin main
git rev-parse origin/main
```

Record the exact merge SHA. Update:

- #60: completed, PR link, merge SHA, stable Agent/job/Promise/Test262 interfaces;
- #28: layer 1 complete; layers 2-4 remain;
- #24: roadmap evidence and current milestone status;
- #59: remove/resolve the native #60 blocker only after the merge is visible on `main`.

Send the coordinator the exact merge SHA, stable interface list, Test262 evidence, and any local JSC limitation. Then go idle. Do not begin generator work in this worktree.
