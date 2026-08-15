# Mixed Symbol Key Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Symbols with ES2015 `OrdinaryOwnPropertyKeys` ordering and expose the complete ordered key list through `Reflect.ownKeys`.

**Architecture:** `EngineObject#ownPropertyKeys()` remains the single ordering source, but splits properties into array-index strings, remaining strings, and symbols before concatenating them. A focused `src/builtins/reflect.js` installs only the required `Reflect.ownKeys`; all Object, enumeration, and JSON consumers continue filtering the shared ordered list.

**Tech Stack:** JavaScript ES modules, the portable custom test harness, Node.js, Chromium/Playwright, JavaScriptCore when available, and pinned Test262.

## Global Constraints

- Array-index string keys sort ascending.
- Remaining string keys preserve creation order.
- Symbol keys preserve creation order and follow every string key.
- HomeObject/super APIs and Agent-owned well-known-symbol protocols remain unchanged.
- `Reflect.*` other than `Reflect.ownKeys` remains out of scope.
- Do not introduce dependencies.

---

### Task 1: Pin mixed key ordering

**Files:**

- Modify: `test/symbols.test.js`

**Interfaces:**

- Consumes: guest `Reflect.ownKeys`, `Object.getOwnPropertyNames`, `Object.getOwnPropertySymbols`, `Object.keys`, `for-in`, and `JSON.stringify`
- Produces: one portable regression covering every consumer of `EngineObject#ownPropertyKeys()`

- [ ] **Step 1: Add the failing portable regression**

```js
{
  name: 'mixed own keys use index string and symbol bucket order everywhere',
  run() {
    assertSame(
      run(
        'var first = Symbol("first"); var second = Symbol("second"); var o = {};' +
          'o.z = "z"; o[first] = 1; o[10] = "ten"; o.a = "a";' +
          'o[2] = "two"; o[second] = 2; o[1] = "one";' +
          'var own = Reflect.ownKeys(o); var symbols = Object.getOwnPropertySymbols(o);' +
          'var loop = []; for (var key in o) { loop.push(key); }' +
          'own.slice(0, 5).join(",") + "|" +' +
          '(own[5] === first) + "," + (own[6] === second) + "|" +' +
          'Object.getOwnPropertyNames(o).join(",") + "|" +' +
          '(symbols[0] === first) + "," + (symbols[1] === second) + "|" +' +
          'Object.keys(o).join(",") + "|" + loop.join(",") + "|" +' +
          'JSON.stringify(o);',
      ),
      '1,2,10,z,a|true,true|1,2,10,z,a|true,true|1,2,10,z,a|1,2,10,z,a|{"1":"one","2":"two","10":"ten","z":"z","a":"a"}',
    );
  },
},
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node test/run-node.js test/symbols.test.js
```

Expected: FAIL because `Reflect` is absent; the same test would also catch symbols interleaved with non-index strings.

- [ ] **Step 3: Commit the failing regression**

```bash
git add test/symbols.test.js
git commit -m "test: pin mixed symbol key ordering"
```

### Task 2: Implement ordered buckets and Reflect.ownKeys

**Files:**

- Modify: `src/runtime/object.js:110-141`
- Create: `src/builtins/reflect.js`
- Modify: `src/runtime/realm.js`
- Modify: `docs/architecture.md`
- Test: `test/symbols.test.js`

**Interfaces:**

- Consumes: `EngineObject#ownPropertyKeys(): PropertyKey[]`, `requireObjectReceiver`, `Realm#createNativeFunction`
- Produces: `createReflectIntrinsics(realm)`, `installReflectObject(globalObject, intrinsics)`, and guest `Reflect.ownKeys(target)`

- [ ] **Step 1: Split OrdinaryOwnPropertyKeys into three buckets**

```js
ownPropertyKeys() {
  /** @type {string[]} */
  const indexKeys = [];
  /** @type {string[]} */
  const stringKeys = [];
  /** @type {symbol[]} */
  const symbolKeys = [];

  for (const key of this._properties.keys()) {
    if (typeof key === 'symbol') {
      symbolKeys.push(key);
    } else if (isArrayIndexKey(key)) {
      indexKeys.push(key);
    } else {
      stringKeys.push(key);
    }
  }

  indexKeys.sort((left, right) => Number(left) - Number(right));
  return [...indexKeys, ...stringKeys, ...symbolKeys];
}
```

Update the method comment to describe all three real buckets.

- [ ] **Step 2: Add the focused Reflect built-in**

Create `src/builtins/reflect.js`:

```js
import { EngineArray } from '../runtime/array-object.js';
import { EngineObject } from '../runtime/object.js';
import { requireObjectReceiver } from './shared.js';

export function createReflectIntrinsics(realm) {
  const reflectObject = new EngineObject(realm.intrinsics.objectPrototype);
  const ownKeys = realm.createNativeFunction({
    name: 'ownKeys',
    length: 1,
    call(_thisValue, args) {
      const target = requireObjectReceiver(
        args[0],
        'Reflect.ownKeys requires an object',
      );
      const result = new EngineArray(realm.intrinsics.arrayPrototype);
      const keys = target.ownPropertyKeys();

      for (let index = 0; index < keys.length; index += 1) {
        result.defineOwnProperty(String(index), { value: keys[index] }, true);
      }

      return result;
    },
  });

  reflectObject.defineOwnProperty('ownKeys', {
    value: ownKeys,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  return { reflectObject };
}

export function installReflectObject(globalObject, intrinsics) {
  globalObject.defineOwnProperty('Reflect', {
    value: intrinsics.reflectObject,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
```

- [ ] **Step 3: Install Reflect in Realm**

Import `createReflectIntrinsics` and `installReflectObject` in `src/runtime/realm.js`, create/install them after Object intrinsics, and merge `reflectObject` into `realm.intrinsics`.

- [ ] **Step 4: Document the integrated surface**

Add `reflect.js` to the built-in table and state that `OrdinaryOwnPropertyKeys` orders indices, strings, then symbols for all reflection/enumeration consumers.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node test/run-node.js test/symbols.test.js
node test/run-node.js test/es2015-object-function.test.js
npm run typecheck
npm run lint -- --quiet
```

Expected: all commands exit zero.

- [ ] **Step 6: Commit**

```bash
git add src/runtime/object.js src/builtins/reflect.js src/runtime/realm.js docs/architecture.md
git commit -m "fix: order mixed string and symbol keys"
```

### Task 3: Refresh current-main coverage and validate

**Files:**

- Modify: `tools/test262/es5-selection.json`
- Modify: `tools/test262/upstream-subset.json`
- Modify: `docs/test262-report.jsonl`
- Modify: `docs/conformance.md`

**Interfaces:**

- Consumes: pinned Test262 checkout and the merged Symbol/object-function runtime
- Produces: current selection policy, subset, report, and coverage summary with no stale exclusions

- [ ] **Step 1: Remove exclusions reported stale**

Run:

```bash
npm run test262:exclusions:check
```

Delete every path reported stale, preserving key order and the exact current-main-plus-Symbol policy.

- [ ] **Step 2: Format and regenerate**

Run:

```bash
npx prettier --write tools/test262/es5-selection.json
npm run test262:select
NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream
npm run ci:generate
```

- [ ] **Step 3: Run full current contracts**

Run:

```bash
npm run ci:contract
npm run benchmark:smoke
```

Then run `npm run test:jsc` when `jsc` is on `PATH`; otherwise record that it is unavailable.

- [ ] **Step 4: Review and safely update the PR**

Review `origin/main..HEAD`, confirm upstream benchmark and HomeObject/super files are unchanged, obtain independent code review, then push with:

```bash
git push --force-with-lease=<remote-head> origin HEAD:refs/heads/yoonbuck-issue-43-implement-es2015-symbols-and-well-known-d8f815
```

Confirm PR #49 reports the pushed head and is mergeable against current main.
