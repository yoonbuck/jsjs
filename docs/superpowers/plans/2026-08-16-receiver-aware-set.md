# Receiver-Aware Set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make prototype-chain assignment dispatch through a polymorphic, receiver-aware `[[Set]]` boundary so module namespace exotic objects cannot be bypassed.

**Architecture:** Add `EngineObject#set(name, value, receiver, throwOnError)` as the internal `[[Set]]` protocol, with `put(name, value, throwOnError)` retained as the direct-assignment compatibility wrapper that supplies `this` as receiver. Ordinary set walks ordinary prototypes iteratively, dispatches when it reaches an exotic override, and defines or invokes accessors on the original receiver; module namespaces override `set` to reject every write.

**Tech Stack:** Plain ES2020 JavaScript, strict JSDoc/checkJs, the repository test harness, pinned Test262, Node, Playwright Chromium, JavaScriptCore, GitHub Actions.

## Global Constraints

- Start from exact merged-main SHA `94bc89d2128df5875818759c8394290d6ed8b239`.
- Use strict RED-first TDD for namespace-as-prototype assignment and adjacent ordinary data/accessor cases.
- Do not add Proxy support, later meta-object features, or unrelated internal-method redesign.
- Keep guest failures as Realm-correct `GuestErrorSignal` values at the existing evaluator boundary.
- Preserve stack safety for guest-controlled long prototype chains.
- Obtain separate specification and quality reviews for implementation tasks, then a maximum-capability scoped whole-branch review.
- Publish exact reviewed head, CI run, and squash-merge SHA to issues #67, #28, and #61.

---

### Task 1: Establish receiver-aware ordinary Set behavior

**Files:**

- Modify: `test/objects.test.js:324-394`
- Modify: `test/stack-overflow.test.js:493-507`
- Modify: `src/runtime/object.js:228-311`

**Interfaces:**

- Consumes: `EngineObject#getOwnProperty`, `EngineObject#getPrototype`, `EngineObject#defineOwnProperty`, `callAccessor`.
- Produces: `EngineObject#set(name: PropertyKey, value: unknown, receiver: unknown, throwOnError?: boolean): boolean`; `EngineObject#put(name, value, throwOnError)` delegates to `set(name, value, this, throwOnError)`.

- [ ] **Step 1: Add failing ordinary receiver tests**

Add cases proving: an inherited writable data property creates/updates an own receiver property without mutating the prototype; inherited non-writable data rejects in sloppy and strict modes; an inherited setter receives the original receiver; a receiver's existing writable/non-writable data and accessor descriptors are respected.

```js
const prototype = new EngineObject();
prototype.defineOwnProperty('value', {
  value: 1,
  writable: true,
  enumerable: true,
  configurable: true,
});
const receiver = new EngineObject(prototype);
assertSame(prototype.set('value', 2, receiver), true);
assertSame(prototype.get('value'), 1);
assertSame(receiver.get('value'), 2);
```

- [ ] **Step 2: Add a failing long-chain assignment regression**

Extend the runtime-built 50,000-link test with `o.created = 1; o.created === 1` so receiver-aware dispatch cannot replace iterative walking with host recursion.

- [ ] **Step 3: Run RED**

Run: `node test/run-node.js test/objects.test.js test/stack-overflow.test.js`

Expected: FAIL because `prototype.set` does not exist; retain the exact command and failure excerpt as RED evidence.

- [ ] **Step 4: Implement the smallest ordinary Set boundary**

In `EngineObject`, implement `set` with an iterative ordinary-prototype walk. At each prototype, dispatch to `current.set(...)` only when its implementation differs from `EngineObject.prototype.set`; otherwise inspect `_peekOwnDescriptor`. Apply `OrdinarySetWithOwnDescriptor` rules to the original receiver, using polymorphic `receiver.defineOwnProperty`. Keep `put` as:

```js
put(name, value, throwOnError = false) {
  return this.set(name, value, this, throwOnError);
}
```

- [ ] **Step 5: Run GREEN**

Run: `node test/run-node.js test/objects.test.js test/stack-overflow.test.js`

Expected: PASS.

- [ ] **Step 6: Request fresh specification review**

Give a read-only reviewer the Task 1 requirements, exact diff, and RED/GREEN evidence. Fix every confirmed requirement gap and rerun the targeted command until the reviewer approves.

- [ ] **Step 7: Request fresh quality review**

Give a different read-only reviewer the approved Task 1 diff. Fix confirmed correctness, stack-safety, type-safety, or maintainability findings and rerun the targeted command until approved.

- [ ] **Step 8: Commit**

```bash
git add src/runtime/object.js test/objects.test.js test/stack-overflow.test.js
git commit -m "Implement receiver-aware ordinary Set

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: Dispatch super and namespace prototype assignment

**Files:**

- Modify: `test/module-namespace.test.js:25-191`
- Modify: `test/classes.test.js:553-613`
- Modify: `src/runtime/module-namespace.js:115-130`
- Modify: `src/runtime/super-reference.js:1-230`

**Interfaces:**

- Consumes: `EngineObject#set(name, value, receiver, throwOnError)`.
- Produces: `ModuleNamespaceObject#set(...)` that always returns false or throws `GuestErrorSignal`; `SuperReferenceBase#setReferencedValue` delegates to the prototype's polymorphic `set`.

- [ ] **Step 1: Add the failing namespace-as-prototype evaluator regression**

Load a module namespace, install it as an `EngineObject` child's prototype, evaluate strict module assignment `child.extra = 2`, and assert the exact guest `TypeError` completion plus absence of `child`'s own `extra` property.

```js
const namespace = await loader.loadAndEvaluate('root');
const child = new EngineObject(namespace);
const completion = evaluateModuleGraph(/* module assigning child.extra */);
assertSame(completion.type, 'throw');
assertSame(child.getOwnProperty('extra'), undefined);
```

Use the module loader/evaluator's existing environment wiring rather than host mutation shortcuts so strict guest-error conversion is covered.

- [ ] **Step 2: Add direct and receiver-aware namespace Set tests**

Assert `namespace.set('value', 2, child) === false`, `namespace.set('extra', 2, child) === false`, strict calls throw `GuestErrorSignal`, and no property is created on either object.

- [ ] **Step 3: Add a failing super-to-exotic dispatch regression**

Construct a home object whose prototype is the namespace and invoke a method containing `super.extra = 2`; assert strict failure and no receiver property. Retain existing ordinary super data/accessor coverage.

- [ ] **Step 4: Run RED**

Run: `node test/run-node.js test/module-namespace.test.js test/classes.test.js`

Expected: FAIL because namespace writes through a receiver still reach ordinary descriptor logic.

- [ ] **Step 5: Implement namespace and super dispatch**

Replace the namespace `put` override with:

```js
set(_key, _value, _receiver, throwOnError = false) {
  return rejectOperation(
    throwOnError,
    'Cannot assign to a module namespace object',
  );
}
```

Change `SuperReferenceBase#setReferencedValue` to call `superBase.set(name, value, this.receiver, strict)`. Remove the duplicate recursive `setPropertyWithReceiver` implementation and its now-unused imports/helpers.

- [ ] **Step 6: Run GREEN**

Run: `node test/run-node.js test/module-namespace.test.js test/classes.test.js test/objects.test.js test/stack-overflow.test.js`

Expected: PASS.

- [ ] **Step 7: Request fresh specification review**

Give a read-only reviewer the Task 2 requirements, exact diff, and RED/GREEN evidence. Fix every confirmed gap and rerun the targeted command until approved.

- [ ] **Step 8: Request fresh quality review**

Give a different read-only reviewer the approved Task 2 diff. Fix confirmed issues and rerun the targeted command until approved.

- [ ] **Step 9: Commit**

```bash
git add src/runtime/module-namespace.js src/runtime/super-reference.js test/module-namespace.test.js test/classes.test.js
git commit -m "Dispatch namespace prototype assignment through Set

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: Publish the stable internal boundary

**Files:**

- Modify: `docs/architecture.md:146-171`

**Interfaces:**

- Consumes: approved `EngineObject#set` and namespace override.
- Produces: stable documentation for ordinary/exotic receiver propagation and the retained `put` compatibility wrapper.

- [ ] **Step 1: Document the boundary**

State that `set(name, value, receiver, throwOnError)` is the polymorphic ES2015 `[[Set]]` seam, ordinary chains preserve the original receiver and stack safety, exotic prototypes override it, and `put` is direct assignment with `receiver === this`.

- [ ] **Step 2: Review documentation against code**

Verify every documented signature and behavior matches the implementation exactly and does not claim Proxy or other future meta-object support.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture.md docs/superpowers/plans/2026-08-16-receiver-aware-set.md
git commit -m "Document receiver-aware Set dispatch

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 4: Validate locally across engines and conformance gates

**Files:**

- Verify only: repository working tree and generated artifacts

**Interfaces:**

- Consumes: committed Tasks 1-3.
- Produces: local validation evidence for the exact branch head.

- [ ] **Step 1: Run focused Node suites**

Run:

```bash
node test/run-node.js test/objects.test.js test/stack-overflow.test.js test/classes.test.js test/module-namespace.test.js test/module-evaluation.test.js
```

Expected: PASS.

- [ ] **Step 2: Run pinned focused Test262**

Run: `TZ=UTC npm run test262:modules`

Expected: PASS at package pin `b363f29d3c43c626dc852744ad64a0b48a003693`.

- [ ] **Step 3: Run all portable hosts**

Run:

```bash
npm run test:node
npm run test:browser
PATH="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" npm run test:jsc
```

Expected: PASS on Node, Chromium, and JSC.

- [ ] **Step 4: Run repository gates and benchmark smoke**

Run:

```bash
npm run typecheck
npm run lint
npm run format
npm run ci:check
npm run vendor:check
npm run unicode:check
npm run test262:select:check
npm run test262:exclusions:check
npm run benchmark:smoke
```

Expected: PASS with no tracked generated drift.

- [ ] **Step 5: Request maximum-capability scoped whole-branch review**

Review `94bc89d..HEAD` for issue #67 only: receiver propagation, namespace bypass closure, ordinary/accessor semantics, long-chain stack safety, guest errors, docs, and test adequacy. Fix every confirmed finding, rerun affected tests, and re-review until clean.

### Task 5: Open, prove, and merge the focused PR

**Files:**

- GitHub state only

**Interfaces:**

- Consumes: clean reviewed branch head.
- Produces: focused PR, exact-SHA CI evidence, squash merge, issue dependency updates.

- [ ] **Step 1: Push and open the PR**

Push `yoonbuck-receiver-aware-set`, open a PR against `main`, link `Closes #67`, summarize `EngineObject#set`, RED evidence, local cross-host/Test262/gate results, and non-goals.

- [ ] **Step 2: Record and verify exact pushed head**

Capture `git rev-parse HEAD`, `gh pr view --json headRefOid`, and require equality.

- [ ] **Step 3: Watch exact-head CI synchronously**

Find the workflow run whose `headSha` equals the pushed head, run `gh run watch <run-id> --exit-status`, then verify every required job is terminal and successful.

- [ ] **Step 4: Resolve review feedback**

For each confirmed review comment, fix with RED/GREEN evidence, push, obtain re-review, and repeat exact-head CI verification. Do not merge with stale head evidence.

- [ ] **Step 5: Publish pre-merge evidence**

Comment on #67 with reviewed head SHA, CI run URL/ID, terminal check list, stable `EngineObject#set(name, value, receiver, throwOnError)` boundary, and local Node/Chromium/JSC/Test262/gate evidence. Update #61 and #28 that the blocker is clean and awaiting merge.

- [ ] **Step 6: Squash merge and delete the branch**

Require clean mergeability, approvals, exact-head CI, and no unresolved threads; then squash merge and delete the remote branch.

- [ ] **Step 7: Publish merge evidence and coordinate**

Record the exact merge SHA on #67, #61, and #28. Report the PR URL, reviewed head, CI run, and merge SHA to creator session `fb8cd162-4041-43a8-9b08-370115263618` and coordinator session `24b6a109-5e90-4b0d-929f-fcabac7b7552`.
