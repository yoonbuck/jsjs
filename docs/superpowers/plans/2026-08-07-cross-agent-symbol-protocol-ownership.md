# Cross-Agent Symbol Protocol Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@@toStringTag` and `@@toPrimitive` consistently resolve through an `EngineObject` receiver's owning agent across realm and agent boundaries.

**Architecture:** Keep agent ownership on `EngineObject` as introduced by the Symbol implementation. Both protocol entry points assert that an object has an agent and then use that agent's well-known symbol; primitive `Object.prototype.toString` receivers still box in the executing realm before lookup.

**Tech Stack:** JavaScript ES modules, the portable custom test harness, Node.js, Chromium/Playwright, and JavaScriptCore.

## Global Constraints

- Different agents mint distinct well-known symbols.
- A same-named symbol from a non-owning agent is an ordinary property key, not a protocol key.
- Every guest-reachable `EngineObject` must have a non-null agent at a protocol entry point.
- Primitive receiver behavior must remain unchanged.
- Do not introduce new dependencies.

---

### Task 1: Pin receiver-owned protocol lookup

**Files:**

- Modify: `test/symbols.test.js`

**Interfaces:**

- Consumes: `createAgent(): Agent`, `createRealm({ agent }): Realm`, `EngineObject#defineOwnProperty(PropertyKey, PropertyDescriptorRecord): boolean`, `NativeFunction#callFunction(unknown, unknown[]): unknown`, and `toPrimitive(unknown, PreferredType?): primitive`
- Produces: portable regression coverage for cross-agent `@@toStringTag` and `@@toPrimitive`

- [ ] **Step 1: Import `toPrimitive` and write the failing cross-agent test**

Add `toPrimitive` to the existing conversion imports, then add this test near the current protocol tests:

```js
{
  name: 'well-known symbol protocols use the receiver object’s agent',
  run() {
    const ownerAgent = createAgent();
    const callerAgent = createAgent();
    const ownerRealm = createRealm({ agent: ownerAgent });
    const callerRealm = createRealm({ agent: callerAgent });
    const object = new EngineObject(ownerRealm.intrinsics.objectPrototype);
    const callerTag = callerAgent.wellKnownSymbols.toStringTag;
    const ownerTag = ownerAgent.wellKnownSymbols.toStringTag;
    const callerToPrimitive = callerAgent.wellKnownSymbols.toPrimitive;
    const ownerToPrimitive = ownerAgent.wellKnownSymbols.toPrimitive;
    const toStringMethod = /** @type {import('../src/builtins/shared.js').NativeFunction} */ (
      callerRealm.intrinsics.objectPrototype.get('toString')
    );

    object.defineOwnProperty(callerTag, {
      value: 'Caller',
      writable: true,
      enumerable: true,
      configurable: true,
    });
    assertSame(toStringMethod.callFunction(object, []), '[object Object]');

    object.defineOwnProperty(ownerTag, {
      value: 'Owner',
      writable: true,
      enumerable: true,
      configurable: true,
    });
    assertSame(toStringMethod.callFunction(object, []), '[object Owner]');

    object.defineOwnProperty(callerToPrimitive, {
      value: callerRealm.createNativeFunction({
        name: 'callerToPrimitive',
        length: 1,
        call() {
          return 'caller';
        },
      }),
      writable: true,
      enumerable: true,
      configurable: true,
    });
    object.defineOwnProperty('valueOf', {
      value: ownerRealm.createNativeFunction({
        name: 'valueOf',
        length: 0,
        call() {
          return 'ordinary';
        },
      }),
      writable: true,
      enumerable: true,
      configurable: true,
    });
    assertSame(toPrimitive(object), 'ordinary');

    object.defineOwnProperty(ownerToPrimitive, {
      value: ownerRealm.createNativeFunction({
        name: 'ownerToPrimitive',
        length: 1,
        call() {
          return 'owner';
        },
      }),
      writable: true,
      enumerable: true,
      configurable: true,
    });
    assertSame(toPrimitive(object), 'owner');
  },
},
```

- [ ] **Step 2: Run the focused suite and verify the regression fails**

Run:

```bash
node test/run-node.js test/symbols.test.js
```

Expected: the new test fails because the caller realm's `Object.prototype.toString` reads `callerRealm.agent.wellKnownSymbols.toStringTag` and returns `[object Caller]` instead of `[object Object]`.

- [ ] **Step 3: Commit the failing regression test**

```bash
git add test/symbols.test.js
git commit -m "test: pin cross-agent symbol protocol ownership"
```

### Task 2: Enforce object ownership at both protocol entry points

**Files:**

- Modify: `src/builtins/object.js:72-80`
- Modify: `src/runtime/conversion.js:63-65`
- Modify: `docs/architecture.md`
- Test: `test/symbols.test.js`

**Interfaces:**

- Consumes: `EngineObject#agent: Agent | null` and `Agent#wellKnownSymbols`
- Produces: receiver-owned `@@toStringTag` and `@@toPrimitive` lookup with an explicit non-null internal invariant

- [ ] **Step 1: Make `Object.prototype.toString` use the receiver's agent**

Replace the realm-owned lookup with an invariant check and receiver-owned lookup:

```js
const object = toObject(realm, thisValue);
const agent = object.agent;

if (agent === null) {
  throw new TypeError('EngineObject protocol lookup requires an agent');
}

const tag = object.get(agent.wellKnownSymbols.toStringTag);
```

Keep the existing string-only tag selection and primitive boxing path unchanged.

- [ ] **Step 2: Make `ToPrimitive` assert the same invariant**

Replace the nullable fallback:

```js
const agent = value.agent;
const exoticToPrimitive =
  agent === null ? undefined : value.get(agent.wellKnownSymbols.toPrimitive);
```

with:

```js
const agent = value.agent;

if (agent === null) {
  throw new TypeError('EngineObject protocol lookup requires an agent');
}

const exoticToPrimitive = value.get(agent.wellKnownSymbols.toPrimitive);
```

- [ ] **Step 3: Document the cross-boundary ownership rule**

Add this paragraph under `docs/architecture.md`'s “Agents and realms” section:

```markdown
When an `EngineObject` crosses a realm or agent boundary, well-known-symbol
protocols follow the receiver, not the currently executing realm:
`@@toPrimitive` and `@@toStringTag` use `object.agent.wellKnownSymbols`.
A same-named well-known symbol minted by another agent is therefore only an
ordinary symbol property. Primitive receivers have no owner object yet, so
the executing realm boxes them first and that wrapper supplies the owner.
```

- [ ] **Step 4: Run focused validation**

Run:

```bash
node test/run-node.js test/symbols.test.js
npm run typecheck
npm run lint
```

Expected: all commands exit zero and the new cross-agent test passes.

- [ ] **Step 5: Run full portable validation**

Run:

```bash
npm test
npm run test:browser
npm run test:jsc
```

Expected: Node, Test262 fixtures, Chromium, and JavaScriptCore all exit zero. If `jsc` is unavailable locally, record that environment limitation and rely on the other portable runners rather than changing the test.

- [ ] **Step 6: Commit the implementation**

```bash
git add src/builtins/object.js src/runtime/conversion.js docs/architecture.md
git commit -m "fix: follow object ownership for symbol protocols"
```

- [ ] **Step 7: Push and inspect the PR**

```bash
git push origin HEAD:yoonbuck-issue-43-implement-es2015-symbols-and-well-known-d8f815
gh pr checks 49 --repo yoonbuck/jsjs
git status --short
```

Expected: the push succeeds, PR checks are visible, and the worktree is clean.
