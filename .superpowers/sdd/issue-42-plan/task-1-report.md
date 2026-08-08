# Task 1 Report — Reduce descriptor and ordinary-property overhead

**STATUS: DONE**

---

## Files changed

| File | Change |
|------|--------|
| `src/runtime/object.js` | Add `_peekOwnDescriptor`, fast-path in `defineOwnProperty`, switch internal callers, add `isValueOnlyDescriptor` helper |
| `src/runtime/primitive-object.js` | Override `_peekOwnDescriptor` in `EnginePrimitiveObject` |
| `src/runtime/function-object.js` | Override `_peekOwnDescriptor` in `ArgumentsObject` |
| `test/objects.test.js` | Add 5 new behavioral tests (2 RED→GREEN, 3 protection) |

---

## TDD Evidence

### Test 1: `_peekOwnDescriptor` returns raw stored descriptor (RED→GREEN)

**RED command & output:**
```
$ node test/run-node.js test/objects.test.js
{"name":"_peekOwnDescriptor returns the raw stored descriptor without copying","status":"failed","error":{"name":"TypeError","message":"obj._peekOwnDescriptor is not a function"}}
```
Expected failure: method does not exist yet.

**GREEN command & output (after implementation):**
```
$ node test/run-node.js test/objects.test.js
{"name":"_peekOwnDescriptor returns the raw stored descriptor without copying","status":"passed"}
```

### Test 2: `defineOwnProperty` value-only fast-path in-place mutation (RED→GREEN)

**RED command & output:**
```
$ node test/run-node.js test/objects.test.js
{"name":"defineOwnProperty with value-only descriptor on writable data property updates in place","status":"failed","error":{"name":"TypeError","message":"obj._peekOwnDescriptor is not a function"}}
```
Expected failure: test references `_peekOwnDescriptor` which did not exist.

**GREEN command & output (after implementation):**
```
$ node test/run-node.js test/objects.test.js
{"name":"defineOwnProperty with value-only descriptor on writable data property updates in place","status":"passed"}
```

### Tests 3–5: Protection tests (passed in RED and GREEN)

- `public getOwnProperty is detached: mutating the returned descriptor does not affect stored state` — passed before and after
- `prototype mutation is immediately visible through getProperty after _peekOwnDescriptor optimization` — passed before and after
- `non-configurable property semantics are preserved through fast-path defineOwnProperty` — passed before and after

---

## Implementation

### `_peekOwnDescriptor` in `EngineObject`
Returns `this._properties.get(name)` directly — no copy. Contract: callers must not mutate the returned object or retain it across any mutation of `_properties`.

### `_peekOwnDescriptor` in `EnginePrimitiveObject`
Accesses `_properties` directly (no copy) for stored properties. For the virtual string-index character properties, creates a new object on demand (same as before). Overriding this ensures string boxing still works through `getProperty`.

### `_peekOwnDescriptor` in `ArgumentsObject`
Returns `_properties.get(name)` directly for unmapped arguments (avoids copy). For mapped (live-aliased) argument indices, creates a new object with the live binding value — still 1 allocation instead of 2 (the old path: `super.getOwnProperty` copied, then the spread copy).

### Internal callers switched to `_peekOwnDescriptor`
- `getProperty` loop: `current._peekOwnDescriptor(name)` (virtual dispatch, respects subclass overrides)
- `canPut`: `this._peekOwnDescriptor(name)`
- `put` (own-property check): `this._peekOwnDescriptor(name)`
- `defineOwnProperty` (existing property): `this._peekOwnDescriptor(name)` for `current`
- `delete`: `this._peekOwnDescriptor(name)`
- `enumerableKeysForIn`: `current._peekOwnDescriptor(key)`
- `isEnumerableForIn`: `current._peekOwnDescriptor(key)`

### Fast-path in `defineOwnProperty`
Before `validatePropertyDescriptor`, checks `isValueOnlyDescriptor(descriptor)`. If the descriptor carries only a `value` field, looks up the stored record via `this._properties.get(name)` (raw). If the stored record is a writable data descriptor (`'value' in stored && stored.writable === true`), mutates `stored.value = descriptor.value` in place and returns `true`, bypassing:
- `validatePropertyDescriptor` (copy + validation)
- `isEmptyDescriptor` / `isDescriptorSubsetEqual` checks
- `completePropertyDescriptor` (copy)
- `Map.set` (no new record)

For non-writable, non-configurable records with a mismatched value, the fast-path also handles rejection without allocating.

---

## Full test suite results

**Command:** `node test/run-node.js`
**Result:** 0 failures. All tests pass.

Discovered and fixed: `EnginePrimitiveObject.getOwnProperty` synthesises virtual string-index properties not stored in `_properties`. After switching `getProperty` to call `current._peekOwnDescriptor`, the override in `EnginePrimitiveObject` was required to expose those virtual descriptors. Added override with correct semantics (using raw `_properties` for stored props, creating new object for virtual indices).

---

## Benchmark results

**Command:**
```
node benchmark/cli.js run --host node --workload object-properties --output .benchmark-results/issue-42-task1-after
node benchmark/cli.js summary --input .benchmark-results/issue-42-task1-after --output .benchmark-results/issue-42-task1-after
```

Checksum: **1122746965** (identical before/after — correctness verified).

### node host

| mode | before jsjs median (ms) | after jsjs median (ms) | Δ | before slowdown | after slowdown |
|------|------------------------|------------------------|---|-----------------|----------------|
| cold | 80.94 | 56.32 | **−30.4%** | 97.79× | 66.79× |
| steady | 74.64 | 57.80 | **−22.6%** | 2281.80× | 1724.82× |

### Baseline (for reference, from `.benchmark-results/issue-42-before/summary.csv`)

| host | mode | before jsjs median (ms) | before slowdown |
|------|------|------------------------|-----------------|
| node | cold | 80.94 | 97.79× |
| node | steady | 74.64 | 2281.80× |
| chromium | cold | 68.70 | 137.40× |
| chromium | steady | 68.60 | 1355.49× |
| jsc | cold | 88.10 | 68.83× |
| jsc | steady | 78.56 | 1123.42× |

Only node was benchmarked after (browser/JSC benchmarks require separate runners not available in this context).

---

## Self-review findings

1. **`getProperty` no longer returns copies** — `getProperty` now returns the raw internal descriptor (from `_peekOwnDescriptor`), changing its return type from a detached copy to a shared reference. This is safe because all internal callers of `getProperty` (`get`, `canPut`, `put`, `hasProperty`) only read from the returned descriptor and never mutate it. External callers in `reference.js` and `super-reference.js` also only read fields. No caller of `getProperty` returns its result publicly — `getOwnProperty` remains the public copy-returning API.

2. **`isValueOnlyDescriptor` uses explicit field checks** — avoids `Object.keys` allocation on the hot path.

3. **In-place mutation is safe** — callers that hold `_peekOwnDescriptor` references before calling `defineOwnProperty` or `put` with the value-only fast-path would see mutations. Reviewed all callers: none retain across mutations.

4. **No concerns about `super-reference.js`** — it calls `receiver.getOwnProperty(name)` and `startObject.getOwnProperty(name)` which still return copies. No change there.

5. **`EngineArray` requires no override** — it does not override `getOwnProperty`, so the base `_peekOwnDescriptor` is correct. Its `_length()` and `_defineLength()` and `_defineIndex()` call `super.getOwnProperty('length')` (on their own object) which still returns copies for their internal use. This is fine for correctness; a future optimization could use `_peekOwnDescriptor` there too (Task 2 scope).

---

## Commit hash

`f6ef239` — "perf(object): add _peekOwnDescriptor and fast-path value update"

---

## Fix Round 1

**Commit:** `baad95d` — "fix(object): restore getProperty copy and guard fast-path against non-object descriptors"

### Open findings addressed

| # | Severity | Finding |
|---|----------|---------|
| 1 | Critical | `getProperty()` returned raw stored descriptor — callers could mutate it |
| 2 | Important | `defineOwnProperty(name, null)` threw from `in` operator, not `validatePropertyDescriptor()` |
| 3 | Important | Tests asserted `_peekOwnDescriptor` identity/in-place mutation, not observable semantics |

---

### Finding 1 — Mutable descriptor leak

#### RED (before fix)

**Test added:** `'getProperty returns a detached copy: mutating it does not affect future reads'`  
**Command:** `node test/run-node.js test/objects.test.js`  
**Result:**
```
{"name":"getProperty returns a detached copy: mutating it does not affect future reads","status":"failed","error":{"name":"Error","message":"Expected \"mutated\" to be the same value as \"original\""}}
{"name":"getProperty on inherited property returns detached copy: mutating it does not affect prototype","status":"failed",...}
```

#### Fix

`src/runtime/object.js` — `getProperty()` now returns `copyPropertyDescriptor(own)` instead of the raw `own` from `_peekOwnDescriptor`. Internal performance callers (`canPut`, `put`, `delete`, etc.) still use `_peekOwnDescriptor` directly for zero-copy reads. The fix restores the security invariant that the public `getProperty` return cannot be used to bypass property definition checks.

#### GREEN (after fix)

```
{"name":"getProperty returns a detached copy: mutating it does not affect future reads","status":"passed"}
{"name":"getProperty on inherited property returns detached copy: mutating it does not affect prototype","status":"passed"}
```

---

### Finding 2 — Fast path bypasses descriptor type validation

#### RED (before fix)

**Test added:** `'defineOwnProperty with null descriptor on existing property throws TypeError from validation (not in-operator)'`  
**Command:** `node test/run-node.js test/objects.test.js`  
**Result:**
```
{"name":"defineOwnProperty with null descriptor on existing property throws TypeError from validation (not in-operator)","status":"failed","error":{"name":"Error","message":"Expected \"Cannot use 'in' operator to search for 'value' in null\" to be the same value as \"Property descriptor must be an object\""}}
```

#### Fix

`src/runtime/object.js` — Added `descriptor !== null && typeof descriptor === 'object'` guard before calling `isValueOnlyDescriptor(descriptor)` in the fast path. Non-object inputs now fall through to `validatePropertyDescriptor()` which throws with the canonical message `"Property descriptor must be an object"`.

#### GREEN (after fix)

```
{"name":"defineOwnProperty with null descriptor on existing property throws TypeError from validation (not in-operator)","status":"passed"}
{"name":"defineOwnProperty with non-object descriptor on new property throws validation TypeError","status":"passed"}
```

---

### Finding 3 — Tests replaced with behavioral tests

Removed 2 implementation-specific tests that asserted `_peekOwnDescriptor` identity (same object reference / in-place mutation). Added 8 behavioral tests covering:

- `getProperty` returns detached copy (own and inherited)
- `defineOwnProperty` with `null`/non-object descriptor produces `validatePropertyDescriptor` canonical error
- `getOwnProperty` detachment (retained from original)
- Fast-path value update observable semantics (not reference identity)
- Prototype mutation visibility through `get()`
- Non-configurable reject/accept semantics

---

### Full suite result

**Command:** `node test/run-node.js`  
**Result:** 0 failures (all tests pass)

---

### Benchmark comparison

**Command:**
```
node benchmark/cli.js run --host node --workload object-properties --output .benchmark-results/issue-42-fix-round1
node benchmark/cli.js summary --input .benchmark-results/issue-42-fix-round1 --output .benchmark-results/issue-42-fix-round1
```

**Checksum: 1122746965** (identical — correctness verified)

| mode | baseline jsjs median (ms) | task-1 jsjs median (ms) | fix-round-1 jsjs median (ms) | vs baseline |
|------|--------------------------|-------------------------|------------------------------|-------------|
| cold | 80.94 | 56.32 | 61.82 | **−23.6%** |
| steady | 74.64 | 57.80 | 61.16 | **−18.1%** |

`getProperty()` now copies on each chain hit (restoring correctness), which costs ~5ms vs task-1. The optimization is still substantially preserved (18–24% improvement over baseline vs 23–30% before fix).

---

### Files changed

| File | Change |
|------|--------|
| `src/runtime/object.js` | `getProperty()` returns `copyPropertyDescriptor(own)`; fast-path guarded with `descriptor !== null && typeof descriptor === 'object'` |
| `test/objects.test.js` | Replaced 5 original tests (2 implementation-specific, 3 behavioral) with 8 behavioral tests covering all three open findings |

---

### Self-review

- `canPut`, `put`, `delete`, `enumerableKeysForIn`, `isEnumerableForIn` all still use `_peekOwnDescriptor` — zero-copy, no externally visible mutation risk since none return those descriptors.
- `getProperty` (public, used by `get`, `hasProperty`, `reference.js`, `super-reference.js`) now copies — safe for all callers.
- The `_peekOwnDescriptor` API remains private (underscore convention); behavioral tests do not rely on it.
- No environment/context architecture touched; no docs/profiling.md touched.

