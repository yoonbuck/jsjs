# ES2015 Object Internal-Method Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Formalize every ES2015 object internal-method and callable/constructor capability behind one polymorphic, Realm-correct, stack-safe contract without implementing Reflect or Proxy.

**Architecture:** `EngineObject` becomes the thin polymorphic Table 5 entry point, while named `ordinary*` helpers exclusively own ordinary slots, descriptors, and iterative traversal. An Agent-scoped dynamic execution-Realm context supplies Realm-owned iterator/result objects and errors without assigning every object an inherited Realm. Current exotics retain only their own virtual state and explicitly call ordinary helpers for ordinary substeps.

**Tech Stack:** Plain ECMAScript modules with strict JSDoc/checkJs, Node.js 20, the existing portable test harness, Playwright Chromium, JavaScriptCore, pinned Test262 `b363f29d3c43c626dc852744ad64a0b48a003693`, GitHub Actions, and GitHub Code Scanning default setup.

## Global Constraints

- Start from the approved design tip `b9b357141cfe8edee9370aacb10b415a574c705d`, whose only commits after `54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7` are `a4807d49c17abf1cb0d593dda8d6cf14b7d736c9` and `b9b357141cfe8edee9370aacb10b415a574c705d`; they are approved **design** commits, not implementation commits.
- Reconcile against the live `origin/main` before production work. At plan approval time it is exactly `54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7`; preserve the approved design history. Stop and obtain reapproval before merging or rebasing if a moving-main change creates a semantic conflict or expands #79’s scope.
- Repeat moving-main reconciliation immediately before the maximum-capability final review and immediately before push. Never review or publish a candidate whose recorded final merge base differs from live `origin/main`.
- Implement exactly ECMA-262 Sixth Edition (June 2015) §6.1.7.2 Table 5 and Table 6. The pinned specification source is `https://262.ecma-international.org/6.0/`, SHA-256 `4d4243dc2f04c9cdd09498f2cc2af6f6cdc07b0430da5578e7cf440d4f7846a0`.
- Do not add Reflect methods, Proxy construction/traps/revocation/invariants, collections, binary data, typed arrays, later exotic objects, or later Symbol protocols. `Reflect.ownKeys` may migrate to `ownPropertyKeys()` but remains a #80 surface.
- Internal-method signatures never accept `strict`, `throwOnError`, `callerRealm`, or a Realm argument. Boolean methods return only semantic success or failure. The evaluator, native built-in, declaration, integrity, and reference wrappers own strictness and Realm-correct errors.
- Ordinary objects keep Agent ownership only; they do not receive an object Realm slot, an inherited Realm, or a universal Realm fallback.
- The active execution Realm is an Agent-scoped dynamic context. Script/module evaluation, guest/native calls, generator continuation resumes, and Realm-bearing jobs push and restore it in `finally`; Realm-null jobs explicitly establish no active guest Realm; direct host calls without one fail fast.
- `[[Enumerate]]` is the Sixth Edition Table 5 method, not a host iterator or raw key array. It returns a public engine iterator object with callable `next` and normal `IteratorResult` objects. Both synchronous and generator `for-in` consume it through shared `IteratorStep` and `IteratorValue`.
- Preserve iterative traversal and the hot ordinary paths: direct `Map` access inside ordinary helpers, allocation-free ordinary Get, writable-own-data Set fast path, value-only DefineOwnProperty fast path, sparse Array length behavior, and no per-object internal-method table allocation.
- The exact M0 ledger contains 240 roots and 459 executable variants, with SHA-256 `4ef97681d7e5208a3ec04e2f4281908877f5f61dd42ee20c0f282ac4dc205309`. Its selector is:

  ```js
  finalClass === 'blocked' &&
    blocker === 'proxy-and-reflect-metaobject' &&
    !path.startsWith('test/annexB/') &&
    !path.startsWith('test/built-ins/Reflect/') &&
    !path.startsWith('test/built-ins/Proxy/');
  ```

- Local Test262 execution is limited to that exact M0 ledger under `TZ=UTC`; never run `npm run test262:upstream` or `npm run test262:upstream:check` locally.
- The M0 command's npm script and transitive import/call graph are repository-invariant tested: they may reach only the exact-ledger runner and shared adapters, never a broad upstream wrapper, release wrapper, or unbounded selection command.
- The baseline at `b9b3571` passed its focused suites after `npm install`. Its Node smoke reference values are object-properties cold `75.376833/72.539625/71.431458 ms`, object-properties steady `69.453958/69.748500/69.725584 ms`, arrays cold `112.012834/110.957875/107.292708 ms`, and arrays steady `117.396292/106.878875/106.739667 ms`. These are correctness/noise context, not performance thresholds.
- Each implementation task is RED–GREEN–review–commit: one fresh specification reviewer, then a different fresh quality reviewer, with a fix/retest/re-review loop for every confirmed finding. Use a GPT-5.6-family model or Claude Opus 4.8-or-lower; never use Claude Opus 5.
- Every implementation and fix commit includes `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`.
- Keep #79 one reviewable PR. Check this before production and again after the caller inventory. If either checkpoint discovers an independent subsystem or scope expansion, stop and propose converting #79 to a grouping issue instead of adding that work.
- Persist both one-PR decisions with reviewer identity, reviewed SHA, inventory/diff summary, decision, and evidence path. A grouping decision stops all further production work and forbids opening a PR that claims atomic #79 completion.

---

## Stable Contract and Exact File Map

### Table 5 surface

Every `EngineObject` exposes exactly these polymorphic methods. `PropertyKey` is already normalized to `string | symbol` before dispatch.

| Sixth Edition internal method | Exact engine method                  | Exact result                                |
| ----------------------------- | ------------------------------------ | ------------------------------------------- |
| `[[GetPrototypeOf]]`          | `getPrototypeOf()`                   | `EngineObject \| null`                      |
| `[[SetPrototypeOf]]`          | `setPrototypeOf(prototype)`          | `boolean`                                   |
| `[[IsExtensible]]`            | `isExtensible()`                     | `boolean`                                   |
| `[[PreventExtensions]]`       | `preventExtensions()`                | `boolean`                                   |
| `[[GetOwnProperty]]`          | `getOwnProperty(key)`                | detached complete descriptor or `undefined` |
| `[[HasProperty]]`             | `hasProperty(key)`                   | `boolean`                                   |
| `[[Get]]`                     | `get(key, receiver)`                 | guest value                                 |
| `[[Set]]`                     | `set(key, value, receiver)`          | `boolean`                                   |
| `[[Delete]]`                  | `delete(key)`                        | `boolean`                                   |
| `[[DefineOwnProperty]]`       | `defineOwnProperty(key, descriptor)` | `boolean`                                   |
| `[[Enumerate]]`               | `enumerate()`                        | engine iterator object                      |
| `[[OwnPropertyKeys]]`         | `ownPropertyKeys()`                  | `PropertyKey[]`                             |

The final tree contains no semantic `getPrototype`, `getProperty`, `canPut`, or `put` API. It contains no throw-enabled `defineOwnProperty` or `delete` overload. Passing extra JavaScript arguments must not restore old semantics; all semantic callers use the exact signatures above.

### Table 6 surface and ordinary helpers

Table 6 adds capability-bearing methods rather than universal methods. Only a
privately branded engine function has either capability.

| Sixth Edition internal method | Exact engine method                           | Capability and result                                  |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| `[[Call]]`                    | `callFunction(thisValue, argumentsList)`      | callable brand; guest value or abrupt completion       |
| `[[Construct]]`               | `constructFunction(argumentsList, newTarget)` | constructor brand; `EngineObject` or abrupt completion |

```js
// src/runtime/capabilities.js exact signatures
registerCallable(value: EngineObject): void
registerConstructor(value: EngineObject): void
isCallable(value: unknown): boolean
isConstructor(value: unknown): boolean
callCallable(
  value: unknown,
  thisValue: unknown,
  argumentsList: readonly unknown[],
): unknown
constructCallable(
  value: unknown,
  argumentsList: readonly unknown[],
  newTarget: unknown,
): EngineObject

// Concrete branded implementation signatures
EngineFunction#callFunction(
  thisValue: unknown,
  argumentsList?: readonly unknown[],
): unknown
EngineFunction#constructFunction(
  argumentsList?: readonly unknown[],
  newTarget?: unknown,
): EngineObject
NativeFunction#callFunction(
  thisValue: unknown,
  argumentsList?: readonly unknown[],
): unknown
NativeFunction#constructFunction(
  argumentsList?: readonly unknown[],
  newTarget?: unknown,
): EngineObject

// src/runtime/object.js exact ordinary helper signatures
ordinaryGetPrototypeOf(target: EngineObject): EngineObject | null
ordinarySetPrototypeOf(target: EngineObject, prototype: EngineObject | null): boolean
ordinaryIsExtensible(target: EngineObject): boolean
ordinaryPreventExtensions(target: EngineObject): boolean
ordinaryGetOwnProperty(target: EngineObject, key: PropertyKey): CompletePropertyDescriptor | undefined
ordinaryHasProperty(target: EngineObject, key: PropertyKey): boolean
ordinaryGet(target: EngineObject, key: PropertyKey, receiver: unknown): unknown
ordinarySet(
  target: EngineObject,
  key: PropertyKey,
  value: unknown,
  receiver: unknown,
): boolean
ordinaryDelete(target: EngineObject, key: PropertyKey): boolean
ordinaryDefineOwnProperty(
  target: EngineObject,
  key: PropertyKey,
  descriptor: PropertyDescriptorRecord,
): boolean
ordinaryEnumerate(target: EngineObject): EngineObject
ordinaryOwnPropertyKeys(target: EngineObject): PropertyKey[]
```

`registerCallable` and `registerConstructor` are module-private WeakSet capability registration points used only by sanctioned engine function constructors. `isCallable` and `isConstructor` never infer a guest capability from a class tag, `_isConstructor`, `callFunction`, or `constructFunction` property. `callAccessor` remains the one documented host-callback allowlist boundary for engine-installed accessors; it does not confer a guest callable capability.

### Execution-Realm invariants

```js
// src/runtime/agent.js
agent.withActiveExecutionRealm(realm, callback);
agent.withNoActiveExecutionRealm(callback);
agent.activeExecutionRealm; // Realm | null
agent.withLinkedActiveExecutionRealm(sourceAgent, callback);
```

`withActiveExecutionRealm` rejects a Realm not owned by the receiver Agent, pushes one frame, calls `callback`, and verifies/restores the previous frame in `finally`. `withNoActiveExecutionRealm` pushes an explicit null barrier so a Realm-null job cannot inherit an outer host call’s Realm. `withLinkedActiveExecutionRealm` reads the source Agent's current dynamic frame, pushes that frame on the receiver Agent only for `callback`, and restores it in `finally`; it never writes a Realm onto the target object or leaves a permanent Agent link.

### File map

| Area                                    | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Execution context and Table 5 kernel    | Modify `src/runtime/agent.js`, `src/runtime/jobs.js`, `src/runtime/realm.js`, `src/api.js`, `src/runtime/object.js`, `src/runtime/descriptors.js`, `src/runtime/reference.js`, `src/runtime/super-reference.js`, `src/runtime/environment.js`, `src/runtime/conversion.js`, `src/runtime/iterator.js`, `src/runtime/function-object.js`, `src/runtime/generator-object.js`; create `src/runtime/capabilities.js`.                                                                                                                                                                                                                                                                                                                                                                            |
| Evaluator and module callers            | Modify `src/evaluator/expressions.js`, `src/evaluator/statements.js`, `src/evaluator/generator-expression-frames.js`, `src/evaluator/generator-statement-frames.js`, `src/evaluator/classes.js`, `src/evaluator/declarations.js`, `src/evaluator/patterns.js`, `src/evaluator/modules.js`, and `src/evaluator/dynamic-function.js`.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Current exotics and runtime callers     | Modify `src/runtime/array-object.js`, `src/runtime/primitive-object.js`, `src/runtime/regexp-object.js`, `src/runtime/date.js`, `src/runtime/module-namespace.js`, `src/runtime/promise.js`, `src/runtime/function-realm.js`, `src/runtime/module-loader.js`, `src/runtime/module-linker.js`, and `src/runtime/module-record.js`.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Built-in callers                        | Modify `src/builtins/shared.js`, `src/builtins/fundamental.js`, `src/builtins/object.js`, `src/builtins/array.js`, `src/builtins/function.js`, `src/builtins/generator.js`, `src/builtins/iterator.js`, `src/builtins/json.js`, `src/builtins/reflect.js`, `src/builtins/regexp.js`, `src/builtins/string-regexp.js`, `src/builtins/primitive-wrappers.js`, `src/builtins/date.js`, `src/builtins/promise.js`, `src/builtins/symbol.js`, and `src/builtins/errors.js`.                                                                                                                                                                                                                                                                                                                       |
| Portable behavior tests                 | Create `test/object-internal-method-contract.test.js`; modify `test/suites.js`, `test/objects.test.js`, `test/abstract-operations.test.js`, `test/object-builtins.test.js`, `test/object-hot-path-integration.test.js`, `test/primitive-wrappers.test.js`, `test/array-index.test.js`, `test/functions.test.js`, `test/function-realm.test.js`, `test/in-instanceof.test.js`, `test/json-stringify.test.js`, `test/date-builtins.test.js`, `test/regexp-builtins.test.js`, `test/module-namespace.test.js`, `test/module-evaluation.test.js`, `test/realms.test.js`, `test/jobs.test.js`, `test/evaluator-statements.test.js`, `test/generator-control-flow.test.js`, `test/generator-runtime.test.js`, `test/iterators.test.js`, `test/symbols.test.js`, and `test/stack-overflow.test.js`. |
| Repository and focused-Test262 evidence | Create `tools/invariants/object-contract.js`, `tools/test262/es2015-m0.js`, `tools/test262/es2015-m0-paths.txt`, `tools/test262/es2015-m0-dispositions.json`, and `test/node/es2015-m0.test.js`; modify `package.json`, `test/node/repository-invariants.test.js`, `test/node/es2015-taxonomy.test.js`, `tools/test262/es2015-audit-evidence.json`, `tools/test262/es2015-taxonomy.json`, `tools/test262/es2015-promotion.json`, and `tools/test262/upstream-subset.json` only when exact execution and reviewed attribution require byte changes.                                                                                                                                                                                                                                           |
| Documentation and generated evidence    | Modify `docs/architecture.md`, `docs/testing.md`, `docs/conformance.md`, `docs/limitations.md`, and `docs/test262-report.jsonl` only when the exact generated/reviewed result requires it. Benchmark captures stay under ignored `.benchmark-results/issue-79/`; lifecycle evidence stays under ignored `.superpowers/issue-79/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### Review protocol used by every implementation task

1. Give a fresh implementer the approved design, this plan, the current task, the current HEAD, and the listed RED command. The implementer is not reused as a reviewer.
2. Do not edit production code until the named RED command fails for the stated missing behavior. Save its command and failure excerpt under `.superpowers/issue-79/red/`.
3. After GREEN, give a fresh specification reviewer the exact task requirements, Table 5/6 interfaces above, the diff, and RED/GREEN evidence. The reviewer checks only conformance to the approved design and this task.
4. Fix every confirmed specification finding. Add a RED case before a behavior correction, rerun the named GREEN command, and request a fresh specification re-review. Repeat until approved.
5. Give a different fresh quality reviewer the approved diff and evidence. The quality reviewer checks correctness, Realm ownership, abrupt completion, stack safety, JSDoc, portability, performance hot paths, repository invariants, and scope.
6. Fix every confirmed quality finding, rerun the named GREEN command, and request a fresh quality re-review. Repeat until approved.
7. Commit only after both approvals. Use the exact trailer shown in each task.

### Task 0: Reconcile Main, Preserve the Design, and Prove the One-PR Boundary

**Files:**

- Verify only: Git history, live GitHub issue state, `.superpowers/issue-79/` ignored evidence, and the existing baseline.
- Do not modify production or test code in this task.

**Interfaces:**

- Consumes: base `54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7`, approved design commits `a4807d49c17abf1cb0d593dda8d6cf14b7d736c9` and `b9b357141cfe8edee9370aacb10b415a574c705d`.
- Produces: a reconciled branch base, an exact caller inventory, baseline evidence, and two recorded one-PR scope decisions.

- [ ] **Step 1: Record the approved base and design-only history**

  ```bash
  BASE_MAIN=54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7
  DESIGN_FIRST=a4807d49c17abf1cb0d593dda8d6cf14b7d736c9
  DESIGN_TIP=b9b357141cfe8edee9370aacb10b415a574c705d
  test "$(git merge-base "$BASE_MAIN" "$DESIGN_TIP")" = "$BASE_MAIN"
  test "$(git diff --name-only "$BASE_MAIN..$DESIGN_TIP")" = \
    "docs/superpowers/specs/2026-08-19-object-internal-method-contract-design.md"
  test "$(git rev-list --count "$BASE_MAIN..$DESIGN_TIP")" = "2"
  git --no-pager log --format='%H %s' "$BASE_MAIN..$DESIGN_TIP"
  ```

  Expected: exactly the two approved design commits, and no implementation path.

- [ ] **Step 2: Fetch and classify the live-main delta**

  ```bash
  mkdir -p .superpowers/issue-79/reconciliation
  git fetch origin main --quiet
  LIVE_MAIN=$(git rev-parse origin/main)
  {
    printf 'originalBase=%s\n' "$BASE_MAIN"
    printf 'designTip=%s\n' "$DESIGN_TIP"
    printf 'liveMain=%s\n' "$LIVE_MAIN"
    git --no-pager log --format='%H %s' "$BASE_MAIN..$LIVE_MAIN"
    git diff --name-status "$BASE_MAIN..$LIVE_MAIN"
  } | tee .superpowers/issue-79/reconciliation/task0-main.txt
  ```

  Expected at plan approval: `LIVE_MAIN` is `54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7`.

- [ ] **Step 3: Apply the moving-main stop rule before reconciling**

  If `LIVE_MAIN` differs from `BASE_MAIN`, inspect every changed file for object protocol, Realm/error, evaluator/module, taxonomy ownership, and scope effects. Stop without merging/rebasing and obtain written design reapproval only when the delta creates a semantic conflict or truly expands #79's approved scope. Otherwise preserve both changes and the design commits with:

  ```bash
  git merge --no-ff "$LIVE_MAIN" \
    -m "Merge current main into object internal-method contract" \
    -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
  git diff --check "$LIVE_MAIN...HEAD"
  ```

  Expected: no conflict markers, the two approved design commits remain in history, and the PR diff remains limited to #79’s contract/migration work.

- [ ] **Step 4: Obtain exclusive timing approval and verify an idle machine**

  Send the project coordinator the planned baseline host/workload capture and wait for confirmation that no sibling Test262, build, or benchmark run owns the machine. Then inspect processes without terminating anything:

  ```bash
  ps -axo pid=,ppid=,etime=,command= |
    grep -E '[t]ools/test262|[b]enchmark/(cli|run-|spawn-jsc)|[p]laywright|[n]ode test/run-|[j]sc -m test/run-jsc|[n]pm run (test|typecheck|lint|format|benchmark)|[t]sc -p' \
    > .superpowers/issue-79/baseline-contention.txt || true
  test ! -s .superpowers/issue-79/baseline-contention.txt
  ```

  Use `send_session_message` for the coordination record and save the coordinator response in `.superpowers/issue-79/baseline-idle-approval.md`. If the process file is non-empty or approval is absent, defer the capture; do not reinterpret a contended run as evidence.

- [ ] **Step 5: Run the cleanup-guarded baseline suites and all-host capture**

  Use one shell whose `trap` removes the detached worktree on success, failure, interruption, or any scope stop. Copy validated artifacts out before cleanup:

  ```bash
  BASELINE_WORKTREE=.superpowers/issue-79-baseline
  BASELINE_SOURCE=$(git rev-parse HEAD)
  cleanup_baseline() {
    git worktree remove --force "$BASELINE_WORKTREE" >/dev/null 2>&1 || true
  }
  trap cleanup_baseline EXIT INT TERM
  cleanup_baseline
  git worktree add --detach "$BASELINE_WORKTREE" "$BASELINE_SOURCE"

  (
    cd "$BASELINE_WORKTREE"
    npm install
    for suite in \
      test/objects.test.js \
      test/abstract-operations.test.js \
      test/object-builtins.test.js \
      test/object-hot-path-integration.test.js \
      test/primitive-wrappers.test.js \
      test/array-index.test.js \
      test/functions.test.js \
      test/in-instanceof.test.js \
      test/json-stringify.test.js \
      test/module-namespace.test.js \
      test/module-evaluation.test.js \
      test/realms.test.js \
      test/jobs.test.js \
      test/evaluator-statements.test.js \
      test/generator-control-flow.test.js \
      test/generator-runtime.test.js \
      test/iterators.test.js \
      test/stack-overflow.test.js \
      test/node/repository-invariants.test.js
    do
      node test/run-node.js "$suite" || exit 1
    done
    mkdir -p .benchmark-results
    {
      printf 'sourceSha=%s\n' "$(git rev-parse HEAD)"
      printf 'node=%s\n' "$(node --version)"
      printf 'chromium=%s\n' "$(node -e 'import("playwright").then(async ({chromium}) => { const b=await chromium.launch({headless:true}); console.log(b.version()); await b.close(); })')"
      printf 'jsc=%s\n' "$(PATH="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" jsc --version 2>&1 || command -v jsc)"
    } > .benchmark-results/issue-79-baseline-environment.txt
    node benchmark/cli.js run \
      --host=all \
      --workload=object-properties \
      --workload=arrays \
      --output=.benchmark-results/issue-79/baseline-1
  )

  mkdir -p .superpowers/issue-79
  cat > .superpowers/issue-79/baseline-notes.txt <<'EOF'
  Original b9b357141cfe8edee9370aacb10b415a574c705d Node smoke reference
  object-properties cold: 75.376833/72.539625/71.431458 ms
  object-properties steady: 69.453958/69.748500/69.725584 ms
  arrays cold: 112.012834/110.957875/107.292708 ms
  arrays steady: 117.396292/106.878875/106.739667 ms
  Values are correctness/noise context, not thresholds.
  EOF
  mkdir -p .benchmark-results/issue-79
  cp -R "$BASELINE_WORKTREE/.benchmark-results/issue-79/baseline-1" \
    .benchmark-results/issue-79/baseline-1
  cp "$BASELINE_WORKTREE/.benchmark-results/issue-79-baseline-environment.txt" \
    .superpowers/issue-79/baseline-environment.txt
  cleanup_baseline
  trap - EXIT INT TERM
  ```

  Expected: every named suite passes at the exact reconciled pre-implementation source; one validated Node/Chromium/JSC capture set and environment record are preserved; the detached worktree no longer exists. The supplied original smoke values remain separately identified. A single pair remains descriptive only.

- [ ] **Step 6: Make the first one-PR reviewability decision before production code**

  Review the Stable Contract, exact file map, non-goals, baseline, and the planned eight implementation deliveries. Persist `.superpowers/issue-79/scope-task0.json` with exact keys `reviewedSha`, `reviewer`, `reviewedAt`, `inventorySummary`, `diffSummary`, `decision`, and `evidencePath`. Continue only when `decision` is `atomic` and the named reviewer explains the change as one contract migration with current exotics and no independent feature.

  If `decision` is `grouping`, stop before production changes, comment on #79 with the concrete split boundary and evidence path, propose changing #79 to a grouping issue, and do not create or update a PR claiming atomic completion.

### Task 1: Establish the Agent-Scoped Active Execution-Realm Stack

**Files:**

- Modify: `src/runtime/agent.js`
- Modify: `src/runtime/jobs.js`
- Modify: `src/api.js`
- Modify: `src/evaluator/modules.js`
- Modify: `src/runtime/function-object.js`
- Modify: `src/builtins/shared.js`
- Modify: `src/runtime/generator-object.js`
- Modify: `src/builtins/generator.js`
- Modify: `src/runtime/reference.js`
- Modify: `test/realms.test.js`
- Modify: `test/jobs.test.js`
- Modify: `test/function-realm.test.js`
- Modify: `test/generator-runtime.test.js`
- Modify: `test/module-evaluation.test.js`
- Create: `test/object-internal-method-contract.test.js`
- Modify: `test/suites.js`

**Interfaces:**

- Consumes: Agent ownership, existing synchronous call-chain/generator-chain linking, `evaluateScript`, module evaluation, native functions, guest functions, generator resume, and `AgentJobQueue`.
- Produces: `Agent#withActiveExecutionRealm(realm, callback)`, `Agent#withNoActiveExecutionRealm(callback)`, `Agent#activeExecutionRealm`, and `Agent#withLinkedActiveExecutionRealm(sourceAgent, callback)`.
- Produces the invariant that a public internal method with no active execution Realm throws host `TypeError`; tests and embeddings intentionally use `withActiveExecutionRealm(realm, callback)` for direct internal calls.

- [ ] **Step 1: Add active-Realm RED tests**

  Add these portable cases to `test/object-internal-method-contract.test.js`:

  ```js
  {
    name: 'active execution Realm nests and restores in finally paths',
    run() {
      const outer = createRealm();
      const inner = createRealm({ agent: outer.agent });
      const agent = outer.agent;
      assertSame(agent.activeExecutionRealm, null);
      agent.withActiveExecutionRealm(outer, () => {
        assertSame(agent.activeExecutionRealm, outer);
        assertThrows(() => {
          agent.withActiveExecutionRealm(inner, () => {
            assertSame(agent.activeExecutionRealm, inner);
            throw new RangeError('restore');
          });
        }, RangeError);
        assertSame(agent.activeExecutionRealm, outer);
      });
      assertSame(agent.activeExecutionRealm, null);
    },
  },
  {
    name: 'Realm-bearing jobs push their Realm while Realm-null jobs expose none',
    run() {
      const realm = createRealm();
      const observed = [];
      realm.agent.enqueueJob({
        realm,
        kind: 'realm-job',
        arguments: [],
        callback() {
          observed.push(realm.agent.activeExecutionRealm);
          return { type: 'normal', value: undefined };
        },
      });
      realm.agent.enqueueJob({
        realm: null,
        kind: 'host-job',
        arguments: [],
        callback() {
          observed.push(realm.agent.activeExecutionRealm);
          return { type: 'normal', value: undefined };
        },
      });
      realm.agent.runJobs();
      assertSame(observed[0], realm);
      assertSame(observed[1], null);
    },
  },
  ```

  Add native-call, guest-call, module-evaluator, generator-resume, cross-Agent link, and direct-host-call cases. In each case assert the active Realm during execution and restoration after normal and abrupt exit.

- [ ] **Step 2: Run the active-Realm RED command**

  Run:

  ```bash
  node test/run-node.js test/object-internal-method-contract.test.js
  ```

  Expected: FAIL with `TypeError` because `agent.withActiveExecutionRealm` is not a function.

- [ ] **Step 3: Implement the minimal dynamic context**

  In `src/runtime/agent.js`, add a private stack and null barrier. Use `finally` for every pop:

  ```js
  const NO_ACTIVE_EXECUTION_REALM = Symbol('no active execution Realm');

  withActiveExecutionRealm(realm, callback) {
    if (!this.ownsRealm(realm)) {
      throw new TypeError('Execution Realm must belong to this Agent');
    }
    this._executionRealmFrames.push(realm);
    try {
      return callback();
    } finally {
      if (this._executionRealmFrames.pop() !== realm) {
        throw new TypeError('Execution Realm stack corruption');
      }
    }
  }

  withNoActiveExecutionRealm(callback) {
    this._executionRealmFrames.push(NO_ACTIVE_EXECUTION_REALM);
    try {
      return callback();
    } finally {
      if (this._executionRealmFrames.pop() !== NO_ACTIVE_EXECUTION_REALM) {
        throw new TypeError('Execution Realm stack corruption');
      }
    }
  }

  get activeExecutionRealm() {
    const frame =
      this._executionRealmFrames[this._executionRealmFrames.length - 1];
    return frame === NO_ACTIVE_EXECUTION_REALM || frame === undefined
      ? null
      : frame;
  }
  ```

  Implement `withLinkedActiveExecutionRealm(sourceAgent, callback)` with the same push/`finally`/verified-pop discipline. It copies the source Agent's top frame, including an explicit null barrier, for `callback` only. Reject an unlinked Agent pair before invoking the callback and prove normal and abrupt restoration.

- [ ] **Step 4: Push the context at every guest-execution boundary**

  Wrap the body of `evaluateScript`, `evaluateModuleGraph`, `EngineFunction#callFunction`, `NativeFunction#callFunction`, `NativeFunction#constructFunction`, and `GeneratorObject#resume` in the owning execution Realm. In `AgentJobQueue#run`, invoke a non-null-Realm job through `agent.withActiveExecutionRealm(job.realm, ...)` and a Realm-null job through `agent.withNoActiveExecutionRealm(...)`. Preserve existing completion conversion and stack-guard order.

- [ ] **Step 5: Complete the cross-Realm and generator integration**

  At each existing object/callable cross-Agent semantic call currently linked for generator-host safety, wrap the target operation with `targetAgent.withLinkedActiveExecutionRealm(sourceAgent, callback)`. A generator’s continuation body executes under `generator.realm`; a native generator method executes under its method Realm and nests the generator Realm while resuming. Iterator-result allocation behavior is tested in Task 5.

- [ ] **Step 6: Run the active-Realm GREEN command**

  Run:

  ```bash
  node test/run-node.js test/object-internal-method-contract.test.js && \
  node test/run-node.js test/realms.test.js && \
  node test/run-node.js test/jobs.test.js && \
  node test/run-node.js test/function-realm.test.js && \
  node test/run-node.js test/generator-runtime.test.js && \
  node test/run-node.js test/module-evaluation.test.js
  ```

  Expected: PASS, including normal/throw restoration, Realm-null job isolation, direct-host absence, cross-Agent linking, script/module, guest/native call, and generator-resume coverage.

- [ ] **Step 7: Request a fresh specification review for the active-Realm task**

  Give a fresh reviewer the Task 1 diff and evidence. Require verification of all six push sites, `finally` restoration, Realm-null behavior, direct-host behavior, cross-Agent visibility, and the absence of an inherited object Realm.

- [ ] **Step 8: Fix and re-review every confirmed specification finding**

  For each confirmed behavioral defect, add its failing case to `test/object-internal-method-contract.test.js`, rerun the Task 1 RED/GREEN command, and obtain a fresh specification approval.

- [ ] **Step 9: Request a different fresh quality review for the active-Realm task**

  Require the quality reviewer to inspect Agent chain lifetime, stack corruption checks, job cleanup, exception paths, JSDoc, and portable Node/Chromium/JSC behavior. Do not use Claude Opus 5.

- [ ] **Step 10: Fix and re-review every confirmed quality finding**

  Add a regression test for each confirmed behavior issue, rerun the Task 1 GREEN command, and obtain a fresh quality approval.

- [ ] **Step 11: Commit the active-Realm boundary**

  ```bash
  git add src/runtime/agent.js src/runtime/jobs.js src/api.js \
    src/evaluator/modules.js src/runtime/function-object.js \
    src/builtins/shared.js src/runtime/generator-object.js \
    src/builtins/generator.js src/runtime/reference.js \
    test/object-internal-method-contract.test.js test/realms.test.js \
    test/jobs.test.js test/function-realm.test.js test/generator-runtime.test.js \
    test/module-evaluation.test.js test/suites.js
  git commit -m "feat: track active execution Realms" \
    -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
  ```

### Task 2: Brand Table 6 Call and Construct Capabilities

**Files:**

- Create: `src/runtime/capabilities.js`
- Modify: `src/runtime/descriptors.js`
- Modify: `src/runtime/function-object.js`
- Modify: `src/builtins/shared.js`
- Modify: `src/builtins/fundamental.js`
- Modify: `src/runtime/function-realm.js`
- Modify: `src/runtime/operators.js`
- Modify: `src/evaluator/expressions.js`
- Modify: `src/evaluator/generator-expression-frames.js`
- Modify: `src/evaluator/classes.js`
- Modify: `test/functions.test.js`
- Modify: `test/function-realm.test.js`
- Modify: `test/object-internal-method-contract.test.js`

**Interfaces:**

- Consumes: the active execution Realm from Task 1 and concrete `callFunction`/`constructFunction` implementations.
- Produces: WeakSet-backed `registerCallable`, `registerConstructor`, `isCallable`, `isConstructor`, `callCallable`, and `constructCallable`.
- Produces: the only sanctioned direct host callback path, `callAccessor`, documented in its JSDoc and repository invariant allowlist.

- [ ] **Step 1: Add Table 6 spoofing RED tests**

  Add a test that makes every old duck-typing signal lie:

  ```js
  {
    name: 'Table 6 capabilities reject spoofed methods, tags, and constructor flags',
    run() {
      const impostor = new EngineObject();
      impostor.callFunction = () => 'spoofed call';
      impostor.constructFunction = () => new EngineObject();
      impostor._isConstructor = true;
      impostor.getClassName = () => 'Function';

      assertSame(isCallable(impostor), false);
      assertSame(isConstructor(impostor), false);
      assertThrows(
        () => callCallable(impostor, undefined, []),
        GuestErrorSignal,
      );
      assertThrows(
        () => constructCallable(impostor, [], impostor),
        GuestErrorSignal,
      );
    },
  }
  ```

  Also assert that a normal guest function, a constructible native function, a non-constructible arrow/generator function, `%Function.prototype%`, and `createAbruptRealmCallable` have only their intended brands.

- [ ] **Step 2: Run the Table 6 RED command**

  Run:

  ```bash
  node test/run-node.js test/object-internal-method-contract.test.js
  ```

  Expected: FAIL because the capability module does not exist and the current duck-typed `isCallable` accepts `impostor.callFunction`.

- [ ] **Step 3: Implement private capability registration**

  Create `src/runtime/capabilities.js` with module-private brands and guarded dispatch:

  ```js
  const CALLABLES = new WeakSet();
  const CONSTRUCTORS = new WeakSet();

  export function registerCallable(value) {
    if (
      value === null ||
      (typeof value !== 'object' && typeof value !== 'function')
    ) {
      throw new TypeError('Callable capability requires an object');
    }
    CALLABLES.add(value);
  }

  export function registerConstructor(value) {
    registerCallable(value);
    CONSTRUCTORS.add(value);
  }

  export function isCallable(value) {
    return (
      value !== null &&
      (typeof value === 'object' || typeof value === 'function') &&
      CALLABLES.has(value)
    );
  }

  export function isConstructor(value) {
    return (
      value !== null &&
      (typeof value === 'object' || typeof value === 'function') &&
      CONSTRUCTORS.has(value)
    );
  }

  export function callCallable(value, thisValue, argumentsList) {
    if (!isCallable(value)) {
      throw new GuestErrorSignal('TypeError', 'Value is not callable');
    }
    return value.callFunction(thisValue, argumentsList);
  }
  ```

  Implement `constructCallable` with the same brand-first guard. `capabilities.js` imports no runtime object class, avoiding an `object.js`/capabilities cycle; trusted registration call sites and repository invariants restrict brands to sanctioned engine function objects. Keep concrete method invocation after the brand check; do not use method identity as a capability predicate.

- [ ] **Step 4: Register only sanctioned engine function instances**

  Register `EngineFunction`, `NativeFunction`, and `%Function.prototype%` when each is created; add the constructor brand only when the sanctioned constructor path marks it constructible. Replace `_isConstructor` reads and all guest `typeof value.callFunction === 'function'` checks with the capability predicates. Convert `createAbruptRealmCallable` into an explicitly registered engine-internal callable instead of a duck-typed object.

- [ ] **Step 5: Run the Table 6 GREEN command**

  Run:

  ```bash
  node test/run-node.js test/object-internal-method-contract.test.js && \
  node test/run-node.js test/functions.test.js && \
  node test/run-node.js test/function-realm.test.js && \
  node test/run-node.js test/in-instanceof.test.js
  ```

  Expected: PASS. Spoofed objects remain non-callable/non-constructible, while branded guest/native functions preserve call, construct, `typeof`, `instanceof`, and Realm behavior.

- [ ] **Step 6: Request a fresh specification review for Table 6**

  Require a fresh reviewer to compare the diff to Table 6: capability predicates must use private brands, dispatch must occur only after a brand check, and no class tag or arbitrary host method may grant a guest capability.

- [ ] **Step 7: Fix and re-review every confirmed Table 6 specification finding**

  Add a RED regression for each confirmed spoofing, construction, or function-Realm defect; rerun the Task 2 GREEN command; obtain fresh specification approval.

- [ ] **Step 8: Request a different fresh quality review for Table 6**

  Require inspection of import cycles, WeakSet lifetime, JSDoc narrowing, the narrow host-accessor allowlist, and removal of `_isConstructor` semantic reads. Do not use Claude Opus 5.

- [ ] **Step 9: Fix and re-review every confirmed Table 6 quality finding**

  Add the corresponding regression coverage, rerun the Task 2 GREEN command, and obtain fresh quality approval.

- [ ] **Step 10: Commit branded call/construct dispatch**

  ```bash
  git add src/runtime/capabilities.js src/runtime/descriptors.js \
    src/runtime/function-object.js src/builtins/shared.js \
    src/builtins/fundamental.js src/runtime/function-realm.js \
    src/runtime/operators.js src/evaluator/expressions.js \
    src/evaluator/generator-expression-frames.js src/evaluator/classes.js \
    test/functions.test.js test/function-realm.test.js \
    test/object-internal-method-contract.test.js
  git commit -m "feat: brand callable and constructor capabilities" \
    -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
  ```

### Task 3: Move Ordinary Storage Behind Boolean Table 5 Metadata Helpers

**Files:**

- Modify: `src/runtime/object.js`
- Modify: `src/runtime/descriptors.js`
- Modify: `src/builtins/object.js`
- Modify: `src/runtime/environment.js`
- Modify: `src/runtime/array-object.js`
- Modify: `src/runtime/primitive-object.js`
- Modify: `src/runtime/function-object.js`
- Modify: `src/runtime/module-namespace.js`
- Modify: `src/evaluator/expressions.js`
- Modify: `src/evaluator/generator-expression-frames.js`
- Modify: `src/builtins/array.js`
- Modify as required by typecheck: object/class/declaration/bootstrap callers that pass a must-succeed flag to `defineOwnProperty` or `delete`
- Modify: `test/objects.test.js`
- Modify: `test/object-builtins.test.js`
- Modify: `test/abstract-operations.test.js`
- Modify: `test/delete.test.js`
- Modify: `test/array-builtins.test.js`
- Modify: `test/object-array-literals.test.js`
- Modify: `test/module-namespace.test.js`
- Modify: `test/object-hot-path-integration.test.js`
- Modify: `test/object-internal-method-contract.test.js`

**Interfaces:**

- Consumes: Task 1 active execution-Realm context and Task 2 capability predicates.
- Produces: default `EngineObject` entry points for `getPrototypeOf`, `setPrototypeOf`, `isExtensible`, `preventExtensions`, `getOwnProperty`, `defineOwnProperty`, `delete`, and `ownPropertyKeys`.
- Produces: named `ordinary*` metadata helpers that are the only readers/writers of ordinary prototype, extensibility, and property-map storage.
- Produces: wrapper helpers that translate a false result at the owning semantic layer, such as `defineOwnPropertyOrThrow`, `deletePropertyOrThrow`, `setPrototypeOfOrThrow`, and `preventExtensionsOrThrow`.
- Produces: complete removal of the `throwOnError`/`callerRealm` overloads from `defineOwnProperty` and `delete`, with every must-succeed caller and strict/sloppy delete evaluator migrated atomically.

- [ ] **Step 1: Add metadata and wrapper RED tests**

  Add these cases:

  ```js
  {
    name: 'Table 5 metadata methods return booleans and wrappers own failure',
    run() {
      const object = new EngineObject();
      assertSame(object.preventExtensions(), true);
      assertSame(object.isExtensible(), false);
      assertSame(
        object.defineOwnProperty('new', {
          value: 1,
          writable: true,
          enumerable: true,
          configurable: true,
        }),
        false,
      );
      assertSame(object.delete('missing'), true);
      assertThrows(
        () =>
          defineOwnPropertyOrThrow(object, 'new', {
            value: 1,
            writable: true,
            enumerable: true,
            configurable: true,
          }),
        GuestErrorSignal,
      );
    },
  },
  {
    name: 'public descriptors are detached from ordinary storage',
    run() {
      const object = new EngineObject();
      object.defineOwnProperty('value', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const descriptor = object.getOwnProperty('value');
      descriptor.value = 2;
      assertSame(object.get('value'), 1);
    },
  },
  ```

  Add object-built-in tests proving `Object.defineProperty`, `Object.preventExtensions`, `Object.seal`, and `Object.freeze` throw or return according to their own algorithms after a false internal result. Add RED cases for strict versus sloppy language `delete`, Array required-delete failure, must-succeed define failure, exotic false Define/Delete returns, and Realm-owned guest errors.

- [ ] **Step 2: Run the metadata RED command**

  Run:

  ```bash
  node test/run-node.js test/object-internal-method-contract.test.js
  ```

  Expected: FAIL because the current `preventExtensions()` returns the object and `defineOwnProperty(..., true)` selects a throwing internal-method path.

- [ ] **Step 3: Centralize ordinary slots behind metadata helpers**

  Preserve the existing direct fields for ordinary hot-path performance, but move every access into named helpers in `src/runtime/object.js`. Repository invariants added in Task 7 make those helpers and audited same-file fast paths the only allowlist:

  ```js
  export function ordinaryGetPrototypeOf(target) {
    return target._prototype;
  }

  export function ordinaryPreventExtensions(target) {
    target._extensible = false;
    return true;
  }

  export function ordinaryGetOwnProperty(target, key) {
    const descriptor = target._properties.get(key);
    return descriptor === undefined
      ? undefined
      : copyPropertyDescriptor(descriptor);
  }

  export class EngineObject {
    getPrototypeOf() {
      return ordinaryGetPrototypeOf(this);
    }

    preventExtensions() {
      return ordinaryPreventExtensions(this);
    }

    getOwnProperty(key) {
      return ordinaryGetOwnProperty(this, key);
    }
  }
  ```

  Keep raw descriptor reads private to `src/runtime/object.js`; `ordinaryDefineOwnProperty` retains the value-only writable-data fast path internally and returns `false` rather than throwing.

- [ ] **Step 4: Implement explicit owning wrappers**

  Make wrappers call a Boolean Table 5 operation, then throw a `GuestErrorSignal` only at the caller that requires success:

  ```js
  export function defineOwnPropertyOrThrow(object, key, descriptor) {
    if (!object.defineOwnProperty(key, descriptor)) {
      throw new GuestErrorSignal(
        'TypeError',
        'Cannot define requested property',
      );
    }
  }
  ```

  Implement corresponding delete/prototype/prevent-extensions wrappers only where multiple callers share that real specification operation. Native built-ins invoke their wrapper inside their native function Realm; evaluator language paths translate false according to strict/sloppy semantics in the evaluating Realm; no wrapper is an `EngineObject` internal method or generic catch-all.

- [ ] **Step 5: Migrate current metadata and Boolean-result callers**

  Replace direct base-slot access in Array, String wrapper, mapped Arguments, and ModuleNamespace implementations with explicit `ordinary*` helpers. Do not use `super.method()` as a hidden route to ordinary storage.

  Remove the throwing overloads completely. Migrate synchronous and generator `delete` evaluation to call Boolean `delete(key)` and then apply language semantics: strict false throws a Realm-owned guest `TypeError`; sloppy returns false. Preserve reference resolution, property-key coercion, right evaluation, unresolvable handling, and abrupt order.

  Migrate every must-succeed Define/Delete caller that currently passes `true`, including Array native algorithms and any directly failing object/class/declaration/bootstrap path found by typecheck. A false result becomes the owning algorithm's specified guest/internal failure; it is never ignored. Update directly affected tests and types. If a caller outside the metadata/define/delete surface emerges, stop and classify it rather than absorbing Get/Set work.

  Leave Get/Has/Set traversal, `put`/`canPut`/`getProperty`, primitive/super/global Set migration, and all remaining property-reference work to Task 4. Leave Enumerate to Task 5.

- [ ] **Step 6: Run the metadata GREEN command**

  Run:

  ```bash
  node test/run-node.js test/object-internal-method-contract.test.js && \
  node test/run-node.js test/objects.test.js && \
  node test/run-node.js test/object-builtins.test.js && \
  node test/run-node.js test/abstract-operations.test.js && \
  node test/run-node.js test/delete.test.js && \
  node test/run-node.js test/array-builtins.test.js && \
  node test/run-node.js test/object-array-literals.test.js && \
  node test/run-node.js test/module-namespace.test.js && \
  node test/run-node.js test/object-hot-path-integration.test.js
  ```

  Expected: PASS. Boolean metadata methods never choose an error Realm, descriptors are detached, and public Object APIs still materialize correct guest errors.

- [ ] **Step 7: Request a fresh specification review for ordinary metadata**

  Require a fresh reviewer to verify all eight Task 3 Table 5 operations, exact Boolean semantics, complete overload removal, strict/sloppy delete order and Realm ownership, must-succeed caller handling, wrappers outside the seam, detached descriptors, ordinary-helper ownership, and preserved descriptor/integrity/Array/namespace semantics.

- [ ] **Step 8: Fix and re-review every confirmed metadata specification finding**

  Add a RED test for each confirmed descriptor, extensibility, prototype-cycle, or Realm-error finding; rerun the Task 3 GREEN command; obtain fresh specification approval.

- [ ] **Step 9: Request a different fresh quality review for ordinary metadata**

  Require inspection of the direct-slot helper allowlist, fast paths, raw descriptor lifetime, Array/Arguments/namespace migration, must-succeed caller completeness, no silent false results, JSDoc, and test portability. Do not use Claude Opus 5.

- [ ] **Step 10: Fix and re-review every confirmed metadata quality finding**

  Add focused coverage, rerun the Task 3 GREEN command, and obtain fresh quality approval.

- [ ] **Step 11: Commit ordinary metadata helpers**

  ```bash
  git add src/runtime/object.js src/runtime/descriptors.js \
    src/builtins/object.js src/runtime/environment.js \
    src/runtime/array-object.js src/runtime/primitive-object.js \
    src/runtime/function-object.js src/runtime/module-namespace.js \
    src/evaluator/expressions.js src/evaluator/generator-expression-frames.js \
    src/builtins/array.js \
    test/objects.test.js test/object-builtins.test.js \
    test/abstract-operations.test.js test/delete.test.js \
    test/array-builtins.test.js test/object-array-literals.test.js \
    test/module-namespace.test.js test/object-hot-path-integration.test.js \
    test/object-internal-method-contract.test.js
  git commit -m "feat: formalize ordinary object metadata methods" \
    -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
  ```

### Task 4: Implement Receiver-Aware Get, HasProperty, Set, and Legacy Removal

**Files:**

- Modify: `src/runtime/object.js`
- Modify: `src/runtime/reference.js`
- Modify: `src/runtime/super-reference.js`
- Modify: `src/runtime/environment.js`
- Modify: `src/evaluator/expressions.js`
- Modify: `src/evaluator/classes.js`
- Modify: `src/evaluator/generator-expression-frames.js`
- Modify: `src/builtins/shared.js`
- Modify: `src/builtins/object.js`
- Modify: `src/builtins/array.js`
- Modify: `src/builtins/json.js`
- Modify: `src/builtins/regexp.js`
- Modify: `src/builtins/string-regexp.js`
- Modify: `src/runtime/function-object.js`
- Modify: `test/objects.test.js`
- Modify: `test/primitive-wrappers.test.js`
- Modify: `test/classes.test.js`
- Modify: `test/stack-overflow.test.js`
- Modify: `test/object-internal-method-contract.test.js`

**Interfaces:**

- Consumes: Task 3 metadata helpers and owning Boolean-result wrappers.
- Produces: `EngineObject#get(key, receiver)`, `#hasProperty(key)`, and `#set(key, value, receiver)` with iterative ordinary traversal and one polymorphic dispatch at the first relevant exotic override.
- Produces: primitive Reference behavior expressed through receiver-aware Get/Set; `SuperReferenceBase` starts at the home prototype and passes the original receiver.
- Removes: `getPrototype`, `getProperty`, `canPut`, `put`, and the old `getReferencedValue`/`setReferencedValue` object-protocol bypass.

- [ ] **Step 1: Add receiver and long-chain RED tests**

  Add these cases:

  ```js
  {
    name: 'Get passes the original receiver to an inherited accessor',
    run() {
      const prototype = new EngineObject();
      prototype.defineOwnProperty('receiver', {
        get() {
          return this;
        },
        enumerable: true,
        configurable: true,
      });
      const receiver = new EngineObject(prototype);
      assertSame(prototype.get('receiver', receiver), receiver);
      assertSame(receiver.get('receiver', receiver), receiver);
    },
  },
  {
    name: 'Set returns false while strict reference wrappers choose the error',
    run() {
      const object = new EngineObject();
      object.defineOwnProperty('locked', {
        value: 1,
        writable: false,
        enumerable: true,
        configurable: false,
      });
      assertSame(object.set('locked', 2, object), false);
      assertThrows(
        () => putValue(new Reference(object, 'locked', true), 2),
        GuestErrorSignal,
      );
      assertSame(object.get('locked', object), 1);
    },
  }
  ```

  Extend `test/stack-overflow.test.js` with 50,000-link Get, Set, HasProperty, and prototype-cycle tests, plus an exotic in the middle that records exactly one relevant dispatch.

- [ ] **Step 2: Run the receiver-aware RED command**

  Run:

  ```bash
  node test/run-node.js test/object-internal-method-contract.test.js
  ```

  Expected: FAIL because current `get` uses its target as the accessor receiver and current `set` still accepts a strictness/error parameter.

- [ ] **Step 3: Implement iterative ordinary Get, HasProperty, and Set**

  Keep raw descriptor/prototype reads private to the reviewed ordinary helpers. On a link where `get`, `getOwnProperty`, and `getPrototypeOf` are all the branded ordinary defaults, use the raw ordinary descriptor/prototype fast path with no descriptor copy. At the first relevant override, invoke the public seam exactly once and propagate its result or abrupt completion. Apply the same per-operation rule to HasProperty and Set; do not assume that an ordinary `get` implies ordinary `getOwnProperty` or `getPrototypeOf`.

  ```js
  export function ordinaryGet(target, key, receiver) {
    let current = target;
    while (current !== null) {
      if (current !== target && current.get !== EngineObject.prototype.get) {
        return current.get(key, receiver);
      }
      const ordinaryOwn =
        current.getOwnProperty === EngineObject.prototype.getOwnProperty;
      const ordinaryPrototype =
        current.getPrototypeOf === EngineObject.prototype.getPrototypeOf;
      const descriptor = ordinaryOwn
        ? peekOrdinaryDescriptor(current, key)
        : current.getOwnProperty(key);
      if (descriptor !== undefined) {
        return isDataDescriptor(descriptor)
          ? descriptor.value
          : descriptor.get === undefined
            ? undefined
            : callAccessor(descriptor.get, receiver, []);
      }
      current = ordinaryPrototype
        ? ordinaryGetPrototypeOf(current)
        : current.getPrototypeOf();
    }
    return undefined;
  }
  ```

  `ordinarySet` applies `OrdinarySetWithOwnDescriptor` to the original receiver and returns only a Boolean. It preserves the existing writable-own-data fast path, invokes a setter with the original receiver, and calls the receiver's polymorphic `defineOwnProperty` for data properties. `ordinaryHasProperty` likewise uses raw reads only while all relevant methods are ordinary. Neither helper creates a guest error.

- [ ] **Step 4: Migrate Reference, primitive, super, and global assignment**

  Replace primitive `getProperty`/`canPut` branches with `wrapper.get(key, primitive)` and `wrapper.set(key, value, primitive)`. After a false result, `putValue` throws only for a strict Reference and silently returns the assigned value otherwise. Replace `super` reads with `superBase.get(key, receiver)` and writes with `superBase.set(key, value, receiver)`. Make an unresolvable sloppy assignment call `globalObject.set(name, value, globalObject)`. Task 3 already owns strict/sloppy delete and must-succeed Define/Delete migration.

- [ ] **Step 5: Remove legacy operations from every listed caller**

  Delete definitions and semantic calls for `getPrototype`, `getProperty`, `canPut`, and `put`. Replace prototype walks with `getPrototypeOf`; replace property descriptor walks with public `getOwnProperty`. Do not leave compatibility aliases. Do not revisit Task 3's completed Boolean Define/Delete migration except to fix a confirmed integration regression.

- [ ] **Step 6: Run the receiver-aware GREEN command**

  Run:

  ```bash
  node test/run-node.js test/object-internal-method-contract.test.js && \
  node test/run-node.js test/objects.test.js && \
  node test/run-node.js test/primitive-wrappers.test.js && \
  node test/run-node.js test/classes.test.js && \
  node test/run-node.js test/stack-overflow.test.js
  ```

  Expected: PASS. The 50,000-link operations do not use host recursion, an exotic in the middle is called once, primitive and super receivers remain correct, and only wrappers produce strict errors.

- [ ] **Step 7: Request a fresh specification review for Get/Has/Set**

  Require a fresh reviewer to inspect receiver identity, inherited data/accessor behavior, primitive-reference behavior, strict/sloppy wrappers, super, deletion, global assignment, long-chain traversal, and complete legacy removal.

- [ ] **Step 8: Fix and re-review every confirmed Get/Has/Set specification finding**

  Add a RED regression for each confirmed issue, rerun the Task 4 GREEN command, and obtain fresh specification approval.

- [ ] **Step 9: Request a different fresh quality review for Get/Has/Set**

  Require inspection of hot paths, dispatch boundaries, type narrowing, imports, recursive escape hatches, and source migration completeness. Do not use Claude Opus 5.

- [ ] **Step 10: Fix and re-review every confirmed Get/Has/Set quality finding**

  Add focused coverage, rerun the Task 4 GREEN command, and obtain fresh quality approval.

- [ ] **Step 11: Commit receiver-aware core operations**

  ```bash
  git add src/runtime/object.js src/runtime/reference.js \
    src/runtime/super-reference.js src/runtime/environment.js \
    src/evaluator/expressions.js src/evaluator/classes.js \
    src/evaluator/generator-expression-frames.js src/builtins/shared.js \
    src/builtins/object.js src/builtins/array.js src/builtins/json.js \
    src/builtins/regexp.js src/builtins/string-regexp.js \
    src/runtime/function-object.js test/objects.test.js \
    test/primitive-wrappers.test.js test/classes.test.js \
    test/stack-overflow.test.js test/object-internal-method-contract.test.js
  git commit -m "feat: dispatch receiver-aware object operations" \
    -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
  ```

### Task 5: Implement Public Enumerate Iterators and Migrate Both For-In Evaluators

**Files:**

- Modify: `src/runtime/object.js`
- Modify: `src/runtime/iterator.js`
- Modify: `src/evaluator/statements.js`
- Modify: `src/evaluator/generator-statement-frames.js`
- Modify: `src/runtime/iterator-object.js`
- Modify: `src/builtins/iterator.js`
- Modify: `test/evaluator-statements.test.js`
- Modify: `test/generator-control-flow.test.js`
- Modify: `test/iterators.test.js`
- Modify: `test/stack-overflow.test.js`
- Modify: `test/object-internal-method-contract.test.js`

**Interfaces:**

- Consumes: Task 1 active execution Realm, Task 2 callability, and Task 4 polymorphic Get/Has/Set/prototype traversal.
- Produces: `EngineObject#enumerate()`, `ordinaryEnumerate(target)`, `getIteratorRecord(iterator)`, `iteratorStep(record)`, and `iteratorValue(result)`.
- Produces: an ordinary `for-in` iterator allocated in the active execution Realm with an own callable `next` and `createIterResultObject(realm, value, done)` results.

- [ ] **Step 1: Add Enumerate and for-in RED tests**

  Add an ordinary public iterator test:

  ```js
  {
    name: 'ordinary Enumerate returns a public Realm-owned iterator protocol object',
    run() {
      const realm = createRealm();
      const object = new EngineObject(realm.intrinsics.objectPrototype);
      object.defineOwnProperty('first', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const iterator = realm.agent.withActiveExecutionRealm(realm, () =>
        object.enumerate(),
      );
      const next = iterator.get('next', iterator);
      assertSame(isCallable(next), true);
      const first = callCallable(next, iterator, []);
      assertSame(first.get('value', first), 'first');
      assertSame(first.get('done', first), false);
      const done = callCallable(next, iterator, []);
      assertSame(done.get('done', done), true);
      assertSame(iterator.getPrototypeOf(), realm.intrinsics.objectPrototype);
    },
  }
  ```

  Add synchronous and generator `for-in` cases for a `next` getter that throws, non-callable `next`, a throwing `next` call, non-object step result, throwing `done` getter, throwing `value` getter, Symbol value rejection, cross-Realm target allocation, deletion before descriptor observation, non-enumerable shadowing, prototype replacement, index/string order, and a 50,000-link ordinary chain with a single exotic in the middle.

- [ ] **Step 2: Run the Enumerate RED command**

  Run:

  ```bash
  node test/run-node.js test/object-internal-method-contract.test.js
  ```

  Expected: FAIL with `TypeError` because `object.enumerate` is not a function.

- [ ] **Step 3: Implement iterator-record consumption for arbitrary Enumerate results**

  Add a public iterator-record constructor that observes `next` once:

  ```js
  export function getIteratorRecord(iterator) {
    if (!(iterator instanceof EngineObject)) {
      throw new GuestErrorSignal(
        'TypeError',
        'Enumerate result is not an object',
      );
    }
    const nextMethod = iterator.get('next', iterator);
    if (!isCallable(nextMethod)) {
      throw new GuestErrorSignal(
        'TypeError',
        'Enumerate iterator next is not callable',
      );
    }
    return { iterator, nextMethod, done: false };
  }
  ```

  Keep `iteratorStep` responsible for calling the captured `next` and reading `done`; keep `iteratorValue` responsible for reading `value`. Do not special-case the ordinary iterator in either consumer.

- [ ] **Step 4: Implement ordinary Enumerate**

  Require `target.agent` to resolve a linked active execution Realm; otherwise throw host `TypeError`. Build one Realm-owned ordinary iterator object whose own `next` is a Realm-owned native function. Snapshot initial candidate names in ES2015 own-key order without host recursion, then recheck the live polymorphic graph before yielding each candidate. Mark a string visited only after a present descriptor is observed; ignore Symbols; suppress later duplicates. If an ordinary prefix reaches an overridden `enumerate`, call it once, convert its result through `getIteratorRecord`, and consume it through `iteratorStep`/`iteratorValue` while suppressing already visited strings.

- [ ] **Step 5: Replace raw for-in snapshots in both evaluators**

  In `evaluateForInStatement`, evaluate the right side once, retain the `null`/`undefined` no-op before object dispatch, call `object.enumerate()` exactly once, build one iterator record, and use:

  ```js
  const step = iteratorStep(record);
  if (step === false) {
    return createNormalCompletion(value);
  }
  const key = iteratorValue(step);
  if (typeof key !== 'string') {
    throw new GuestErrorSignal(
      'TypeError',
      'Enumerate iterator value is not a string',
    );
  }
  ```

  Replace `ForInFrame.keys`, `index`, and `isEnumerableForIn` in the generator evaluator with the same iterator-record state and operations. Preserve lexical-head TDZ, fresh `let`/`const` bindings, assignment-target evaluation, and completion propagation.

- [ ] **Step 6: Run the Enumerate GREEN command**

  Run:

  ```bash
  node test/run-node.js test/object-internal-method-contract.test.js && \
  node test/run-node.js test/evaluator-statements.test.js && \
  node test/run-node.js test/generator-control-flow.test.js && \
  node test/run-node.js test/iterators.test.js && \
  node test/run-node.js test/stack-overflow.test.js
  ```

  Expected: PASS. Both evaluators use the same public iterator protocol, abrupts propagate through the owning Realm, and ordinary/exotic traversal remains stack-safe.

- [ ] **Step 7: Request a fresh specification review for Enumerate**

  Require a fresh reviewer to verify the Sixth Edition `[[Enumerate]]` contract, public `next`/IteratorResult objects, active-Realm allocation, one-call dispatch, observable iterator protocol, mutation/visited semantics, Symbol exclusion, and both evaluator paths.

- [ ] **Step 8: Fix and re-review every confirmed Enumerate specification finding**

  Add a RED test for each confirmed iterator, mutation, abrupt-completion, or cross-Realm defect; rerun the Task 5 GREEN command; obtain fresh specification approval.

- [ ] **Step 9: Request a different fresh quality review for Enumerate**

  Require inspection of iterator state lifetime, no host iterator leakage, no recursion, generator frame state, allocation behavior, and duplicate suppression. Do not use Claude Opus 5.

- [ ] **Step 10: Fix and re-review every confirmed Enumerate quality finding**

  Add focused coverage, rerun the Task 5 GREEN command, and obtain fresh quality approval.

- [ ] **Step 11: Commit Enumerate and for-in migration**

  ```bash
  git add src/runtime/object.js src/runtime/iterator.js \
    src/evaluator/statements.js src/evaluator/generator-statement-frames.js \
    src/runtime/iterator-object.js src/builtins/iterator.js \
    test/evaluator-statements.test.js test/generator-control-flow.test.js \
    test/iterators.test.js test/stack-overflow.test.js \
    test/object-internal-method-contract.test.js
  git commit -m "feat: formalize ES2015 Enumerate iteration" \
    -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
  ```

### Task 6: Complete Current Exotic Migration and the Semantic Caller Inventory

**Files:**

- Modify: `src/evaluator/expressions.js`, `src/evaluator/statements.js`, `src/evaluator/generator-expression-frames.js`, `src/evaluator/generator-statement-frames.js`, `src/evaluator/classes.js`, `src/evaluator/declarations.js`, `src/evaluator/patterns.js`, `src/evaluator/modules.js`, and `src/evaluator/dynamic-function.js`.
- Modify: `src/runtime/array-object.js`, `src/runtime/primitive-object.js`, `src/runtime/regexp-object.js`, `src/runtime/date.js`, `src/runtime/module-namespace.js`, `src/runtime/promise.js`, `src/runtime/function-realm.js`, `src/runtime/module-loader.js`, `src/runtime/module-linker.js`, and `src/runtime/module-record.js`.
- Modify: `src/builtins/shared.js`, `src/builtins/fundamental.js`, `src/builtins/object.js`, `src/builtins/array.js`, `src/builtins/function.js`, `src/builtins/generator.js`, `src/builtins/iterator.js`, `src/builtins/json.js`, `src/builtins/reflect.js`, `src/builtins/regexp.js`, `src/builtins/string-regexp.js`, `src/builtins/primitive-wrappers.js`, `src/builtins/date.js`, `src/builtins/promise.js`, `src/builtins/symbol.js`, and `src/builtins/errors.js`.
- Modify: `test/array-index.test.js`, `test/primitive-wrappers.test.js`, `test/functions.test.js`, `test/module-namespace.test.js`, `test/json-stringify.test.js`, `test/date-builtins.test.js`, `test/regexp-builtins.test.js`, `test/in-instanceof.test.js`, `test/symbols.test.js`, `test/realms.test.js`, `test/object-hot-path-integration.test.js`, and `test/object-internal-method-contract.test.js`.

**Interfaces:**

- Consumes: the completed Table 5/6 interfaces and owning wrappers from Tasks 1–5.
- Produces: a checked caller inventory in `.superpowers/issue-79/caller-inventory.md` that assigns every semantic object operation to a Table 5/6 method, an explicit ordinary helper during known-ordinary bootstrap, or the documented host-accessor boundary.
- Produces: Array, String wrapper, mapped Arguments, ModuleNamespace, function, and native-function behavior exclusively through the shared seam and their own branded state.

- [ ] **Step 1: Generate the complete semantic caller inventory**

  Run and save the output:

  ```bash
  {
    git grep -nE '\.(getPrototype|getProperty|canPut|put)\(' -- src
    git grep -nE '\.(defineOwnProperty|delete)\([^)]*,[^)]*,[^)]+' -- src
    git grep -nE '\.(get|set|hasProperty|ownPropertyKeys|setPrototypeOf|preventExtensions|isExtensible)\(' -- src
    git grep -nE '\b(callFunction|constructFunction|isCallable|isConstructor)\(' -- src
  } > .superpowers/issue-79/caller-inventory.txt
  ```

  Classify every line into the exact consuming Table 5/6 operation, a permitted ordinary bootstrap helper, or a prohibited legacy/raw bypass. Record the owning file and migration destination for every prohibited line.

- [ ] **Step 2: Make the second one-PR reviewability decision after the inventory**

  Review the inventory with the coordinator. Persist `.superpowers/issue-79/scope-task6.json` with exact keys `reviewedSha`, `reviewer`, `reviewedAt`, `inventoryPath`, `inventorySha256`, `inventorySummary`, `diffSummary`, `decision`, and `evidencePath`. Continue only when `decision` is `atomic` and each row is mechanical migration to the stable contract or a current-exotic adaptation.

  If any row requires Reflect surface, Proxy semantics, collection/data-block work, a new exotic object, or an unrelated evaluator redesign, record `decision: "grouping"`, stop before further production changes, post the row list and evidence path to #79, propose converting #79 to a grouping issue, and do not create or update a PR claiming atomic completion.

- [ ] **Step 3: Add current-exotic and caller-migration RED tests**

  Add this module namespace compatibility case:

  ```js
  {
    name: 'module namespace preserves its exotic Table 5 contract',
    async run() {
      const realm = createRealm();
      const loader = loaderFor({ entry: 'export let value = 1;' }, realm);
      const namespace = await loader.loadAndEvaluate('entry');
      assertSame(namespace.getPrototypeOf(), null);
      assertSame(namespace.isExtensible(), false);
      assertSame(namespace.preventExtensions(), true);
      assertSame(namespace.hasProperty('value'), true);
      assertSame(namespace.set('value', 2, namespace), false);
      assertSame(namespace.delete('value'), false);
      assertSame(
        namespace.defineOwnProperty('value', { value: 2 }),
        false,
      );
      assertSame(namespace.ownPropertyKeys()[0], 'value');
    },
  }
  ```

  Add the brand-regression that makes the current JSON class-name branch fail:

  ```js
  {
    name: 'array identity does not follow a diagnostic class name',
    run() {
      const fake = new EngineObject();
      fake.getClassName = () => 'Array';
      fake.defineOwnProperty('0', {
        value: 'spoof',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(isArrayObject(fake), false);
    },
  }
  ```

  Add Array index/length, String virtual index, mapped Arguments alias/unmap, Function/native Call/Construct, JSON reviver define/delete, `in`, `with`, `instanceof`, Object static/prototype APIs, and `Reflect.ownKeys` regressions with literal expected results.

- [ ] **Step 4: Run the exotic/caller RED command**

  Run:

  ```bash
  node test/run-node.js test/object-internal-method-contract.test.js
  ```

  Expected: FAIL because `src/runtime/array-object.js` does not export `isArrayObject`, and `src/builtins/json.js` still derives array behavior from `getClassName()`.

- [ ] **Step 5: Migrate each current exotic method by method**

  Apply these exact boundaries:

  - `EngineArray` keeps only its index/length `defineOwnProperty` algorithm and calls `ordinaryGetOwnProperty`, `ordinaryDefineOwnProperty`, `ordinaryDelete`, and `ordinaryOwnPropertyKeys` explicitly.
  - `EnginePrimitiveObject` exposes String indices only through `getOwnProperty` and `ownPropertyKeys`; ordinary Get/HasProperty observes those public methods.
  - `ArgumentsObject` uses its parameter-map branded state plus ordinary helpers; it never reads ordinary storage directly.
  - `ModuleNamespaceObject` preserves null-only prototype, `false` Set/Delete/incompatible DefineOwnProperty, live descriptors, sorted exports, non-extensibility, and normal Boolean results with no strictness parameter.
  - Function and native function objects use Table 6 brands and `getPrototypeOf` in `instanceof`/construction paths.

- [ ] **Step 6: Migrate every inventoried semantic caller**

  Change evaluator reads/writes/deletes/member calls/literals/classes/destructuring/super; Reference and SuperReference; function construction and derived `super(...)`; Object integrity/descriptor operations; JSON/Array/Function/RegExp/Promise/module/environment/conversion operations; and `Reflect.ownKeys` to their Table 5/6 calls. Use an ordinary helper only in a documented known-ordinary bootstrap allocation where guest code cannot interpose.

- [ ] **Step 7: Replace class-name semantic decisions with narrow brands**

  Preserve `getClassName()` only as `Object.prototype.toString`’s fallback diagnostic tag. Register Array identity at construction and consume it rather than a tag:

  ```js
  const ARRAY_OBJECTS = new WeakSet();

  export class EngineArray extends EngineObject {
    constructor(prototype = null) {
      super(prototype, 'Array');
      ARRAY_OBJECTS.add(this);
      // Existing length initialization follows.
    }
  }

  export function isArrayObject(value) {
    return value instanceof EngineObject && ARRAY_OBJECTS.has(value);
  }
  ```

  Apply the same narrow-brand rule to RegExp matcher state, primitive-data slots, and Date/Promise/Generator/iterator/Arguments/namespace owning state.

- [ ] **Step 8: Run the exotic/caller GREEN command**

  Run:

  ```bash
  for suite in \
    test/object-internal-method-contract.test.js \
    test/array-index.test.js \
    test/primitive-wrappers.test.js \
    test/functions.test.js \
    test/module-namespace.test.js \
    test/json-stringify.test.js \
    test/date-builtins.test.js \
    test/regexp-builtins.test.js \
    test/in-instanceof.test.js \
    test/symbols.test.js \
    test/realms.test.js \
    test/object-hot-path-integration.test.js
  do
    node test/run-node.js "$suite" || exit 1
  done
  ```

  Expected: PASS. Existing Array, String wrapper, mapped Arguments, ModuleNamespace, Function, Symbol, and cross-Realm cases retain their behavior through the shared contract.

- [ ] **Step 9: Request a fresh specification review for exotic and caller migration**

  Require a fresh reviewer to compare every inventory row with the approved design, verify all four current exotics, confirm table dispatch at evaluator/runtime/built-in/module boundaries, and reject Reflect/Proxy scope absorption.

- [ ] **Step 10: Fix and re-review every confirmed exotic/caller specification finding**

  Add a RED regression for each confirmed missed caller or exotic semantic difference, rerun the Task 6 GREEN command, and obtain fresh specification approval.

- [ ] **Step 11: Request a different fresh quality review for exotic and caller migration**

  Require inspection of imports, class-brand replacement, direct-slot boundaries, agent linking, current hot paths, and migration completeness. Do not use Claude Opus 5.

- [ ] **Step 12: Fix and re-review every confirmed exotic/caller quality finding**

  Add focused coverage, rerun the Task 6 GREEN command, and obtain fresh quality approval.

- [ ] **Step 13: Commit current exotic and caller migration**

  ```bash
  git add src/runtime src/evaluator src/builtins \
    test/array-index.test.js test/primitive-wrappers.test.js \
    test/functions.test.js test/module-namespace.test.js \
    test/json-stringify.test.js test/date-builtins.test.js \
    test/regexp-builtins.test.js test/in-instanceof.test.js \
    test/symbols.test.js test/realms.test.js \
    test/object-hot-path-integration.test.js \
    test/object-internal-method-contract.test.js
  git commit -m "refactor: migrate object semantic callers" \
    -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
  ```

### Task 7: Prove All Twelve Seams with a Hostile Exotic and Lock the Invariants

**Files:**

- Modify: `test/object-internal-method-contract.test.js`
- Modify: `test/stack-overflow.test.js`
- Modify: `test/node/repository-invariants.test.js`
- Create: `tools/invariants/object-contract.js`
- Modify: `src/runtime/object.js` only if a hostile-exotic regression exposes a contract gap.

**Interfaces:**

- Consumes: all Table 5/6 operations and current-exotic migration from Tasks 1–6.
- Produces: a test-only hostile exotic that overrides all twelve Table 5 seams without ordinary raw storage and repository invariants that forbid future bypasses.
- Produces: `findObjectContractBypasses(file, source, allowlist)` in `tools/invariants/object-contract.js`, used both against synthetic violating source and every production source file.

- [ ] **Step 1: Add the hostile-exotic and invariant RED tests**

  Add a test-only class with all twelve methods:

  ```js
  class HostileExotic extends EngineObject {
    constructor(prototype, iterator) {
      super(prototype);
      this.calls = [];
      this.virtual = new Map();
      this.prototypeResult = prototype;
      this.extensibleResult = true;
      this.iterator = iterator;
      this.abrupt = new Map();
    }

    record(name, value, ...args) {
      this.calls.push([name, ...args]);
      const abrupt = this.abrupt.get(name);
      if (abrupt !== undefined) throw abrupt;
      return value;
    }

    getPrototypeOf() {
      return this.record('getPrototypeOf', this.prototypeResult);
    }
    setPrototypeOf(value) {
      return this.record('setPrototypeOf', false, value);
    }
    isExtensible() {
      return this.record('isExtensible', this.extensibleResult);
    }
    preventExtensions() {
      return this.record('preventExtensions', false);
    }
    getOwnProperty(key) {
      return this.record('getOwnProperty', this.virtual.get(key), key);
    }
    hasProperty(key) {
      return this.record('hasProperty', this.virtual.has(key), key);
    }
    get(key, receiver) {
      return this.record('get', `get:${String(key)}`, key, receiver);
    }
    set(key, value, receiver) {
      return this.record('set', false, key, value, receiver);
    }
    delete(key) {
      return this.record('delete', false, key);
    }
    defineOwnProperty(key, descriptor) {
      return this.record('defineOwnProperty', false, key, descriptor);
    }
    enumerate() {
      return this.record('enumerate', this.iterator);
    }
    ownPropertyKeys() {
      return this.record('ownPropertyKeys', [...this.virtual.keys()]);
    }
  }
  ```

  Test direct, inherited, primitive, and `super` receiver propagation; Object metadata APIs; `in`; `with`; descriptor conversion; `Object.keys`, names, symbols; JSON; `Reflect.ownKeys`; synchronous/generator `for-in`; abrupt method/iterator paths; and a Table 6 spoofed object. Assert the exact call record rather than a class name.

  Import `findObjectContractBypasses` in the Node invariant suite and add synthetic source cases containing each prohibited slot, legacy method, class-name semantic branch, method-identity dispatch, and duck-typed callability. Assert the exact reported file, token, and rule. The first RED fails because `tools/invariants/object-contract.js` does not exist.

- [ ] **Step 2: Add 50,000-link seam regressions**

  Add explicit tests that build an ordinary chain of 50,000 links and prove:

  ```js
  const root = new EngineObject();
  root.defineOwnProperty('marker', {
    value: 1,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  let tail = root;
  for (let index = 0; index < 50000; index += 1) {
    tail = new EngineObject(tail);
  }
  assertSame(tail.get('marker', tail), 1);
  assertSame(tail.hasProperty('marker'), true);
  assertSame(tail.set('created', 2, tail), true);
  assertSame(tail.get('created', tail), 2);
  assertSame(root.setPrototypeOf(tail), false);
  ```

  Put one `HostileExotic` at the middle link for Get, Set, HasProperty, prototype traversal, and Enumerate. Assert the relevant seam records exactly one call and no operation skips it.

- [ ] **Step 3: Run the hostile-exotic RED command**

  Run:

  ```bash
  node test/run-node.js test/object-internal-method-contract.test.js && \
  node test/run-node.js test/node/repository-invariants.test.js
  ```

  Expected: FAIL because `tools/invariants/object-contract.js` does not exist.

- [ ] **Step 4: Add precise repository-invariant allowlists**

  Create `tools/invariants/object-contract.js` and extend `test/node/repository-invariants.test.js` with explicit path-and-reason allowlists. The detector first passes the synthetic RED fixtures, then scans every production source file. Fail on:

  ```js
  const forbiddenSlots = ['_prototype', '_extensible', '_properties'];
  const forbiddenLegacy = ['getPrototype', 'getProperty', 'canPut', 'put'];
  ```

  outside `src/runtime/object.js`’s ordinary helpers and named audited fast paths. Fail on `EngineObject.prototype` method-identity comparisons outside those helpers, semantic `getClassName()` branches outside `Object.prototype.toString` fallback tagging, `_isConstructor` reads, duck-typed guest callability, and an exotic reaching ordinary storage. The only callability exception is `callAccessor`’s documented engine-installed host callback path; assert its path, function name, and reason exactly.

- [ ] **Step 5: Correct any hostile-exotic bypass**

  Replace each observed bypass with the relevant Table 5/6 dispatch; do not add a class-name exception, special case `HostileExotic`, or raw-slot exception. Keep ordinary helper method-identity checks confined to `src/runtime/object.js`.

- [ ] **Step 6: Run the hostile-exotic GREEN command**

  Run:

  ```bash
  node test/run-node.js test/object-internal-method-contract.test.js && \
  node test/run-node.js test/stack-overflow.test.js && \
  node test/run-node.js test/node/repository-invariants.test.js
  ```

  Expected: PASS. Every Table 5 seam is observable, all abrupt paths propagate, 50,000-link operations remain stack-safe, and source scans reject future bypasses.

- [ ] **Step 7: Request a fresh specification review for hostile coverage**

  Require a fresh reviewer to count all twelve overridden seams, inspect receiver/descriptor/prototype/key/delete/extensibility/abrupt tests, iterator malformed-abrupt tests, 50,000-link tests, and the Table 6 spoofing regression.

- [ ] **Step 8: Fix and re-review every confirmed hostile-coverage specification finding**

  Add a RED case for each missing seam or semantics gap, rerun the Task 7 GREEN command, and obtain fresh specification approval.

- [ ] **Step 9: Request a different fresh quality review for invariant hardening**

  Require inspection of false-positive-resistant scans, narrow allowlists with reasons, test-only exotic isolation, runtime cost, and maintainability. Do not use Claude Opus 5.

- [ ] **Step 10: Fix and re-review every confirmed invariant quality finding**

  Add focused coverage, rerun the Task 7 GREEN command, and obtain fresh quality approval.

- [ ] **Step 11: Commit hostile coverage and invariants**

  ```bash
  git add test/object-internal-method-contract.test.js \
    test/stack-overflow.test.js test/node/repository-invariants.test.js \
    tools/invariants/object-contract.js src/runtime/object.js
  git commit -m "test: harden object internal-method invariants" \
    -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
  ```

### Task 8: Reclassify Exact M0 Evidence, Document the Contract, and Validate Performance

**Files:**

- Create: `tools/test262/es2015-m0.js`
- Create: `tools/test262/es2015-m0-paths.txt`
- Create: `tools/test262/es2015-m0-dispositions.json`
- Create: `test/node/es2015-m0.test.js`
- Modify: `package.json`
- Modify when exact reviewed output changes: `tools/test262/es2015-audit-evidence.json`, `tools/test262/es2015-taxonomy.json`, `tools/test262/es2015-promotion.json`, `tools/test262/upstream-subset.json`, `docs/test262-report.jsonl`, and `docs/conformance.md`
- Modify: `docs/architecture.md`
- Modify: `docs/testing.md`
- Modify: `docs/limitations.md`
- Modify: `test/node/es2015-taxonomy.test.js`
- Modify: `test/node/repository-invariants.test.js`

**Interfaces:**

- Consumes: exact issue-comment ledger `https://github.com/yoonbuck/jsjs/issues/79#issuecomment-5347038655`, the pinned Test262 checkout, taxonomy artifact, M0 runtime evidence, and benchmark captures.
- Produces: `parseM0Ledger(text)`, `verifyM0Ledger(text, taxonomy, dispositions)`, `compareM0Taxonomies(original, reconciledPre, post, dispositions, concurrentExplanations)`, and `runM0Focused(options)` from `tools/test262/es2015-m0.js`.
- Produces: exact-path execution records, `summarizeM0Dispositions(entries)`, and `parseM0Dispositions(text, execution)` for a reviewer-approved disposition of every non-passing root; passing paths may be promoted only when every executable variant passes.
- Produces: the existing `proxy-and-reflect-metaobject` blocker for exact M0 consumer roots reassigned to #80/#81, with the issue number retaining the distinct Reflect versus Proxy follow-up ownership. Existing direct Reflect/Proxy roots retain their current classification so the #79 taxonomy delta remains exactly the immutable 240-root ledger.

- [ ] **Step 1: Add exact-ledger RED tests**

  Create `test/node/es2015-m0.test.js` with:

  ```js
  const ledger = ['test/a.js', 'test/b.js'].join('\n') + '\n';
  assertSame(
    assertThrows(
      () => verifyM0Ledger(ledger, { classifications: [] }, []),
      Error,
    ).message.includes('240-root'),
    true,
  );
  assertSame(
    assertThrows(
      () => parseM0Ledger('test/b.js\ntest/a.js\n'),
      Error,
    ).message.includes('sorted unique'),
    true,
  );
  ```

  Add a fixture taxonomy test proving that the selector has exactly the ledger’s paths and variants; a duplicate, missing, foreign, unsorted, wrong-hash, wrong-variant-count, or non-UTC execution rejects before running Test262.

- [ ] **Step 2: Run the M0-ledger RED command**

  Run:

  ```bash
  TZ=UTC node test/run-node.js test/node/es2015-m0.test.js
  ```

  Expected: FAIL because `tools/test262/es2015-m0.js` and the checked-in M0 ledger do not exist.

- [ ] **Step 3: Check in and validate the exact M0 ledger**

  Extract the single `text` fenced block from issue comment `5347038655` into `tools/test262/es2015-m0-paths.txt`. Verify it before accepting it:

  ```bash
  test "$(wc -l < tools/test262/es2015-m0-paths.txt | tr -d ' ')" = "240"
  test "$(shasum -a 256 tools/test262/es2015-m0-paths.txt | awk '{print $1}')" = \
    "4ef97681d7e5208a3ec04e2f4281908877f5f61dd42ee20c0f282ac4dc205309"
  ```

  The file is code-unit sorted, newline terminated, contains only `test/.../*.js` roots, and is the sole local execution input for M0.

- [ ] **Step 4: Snapshot original-base and reconciled pre-M0 taxonomy**

  Record the source identities and extract immutable snapshots before changing taxonomy:

  ```bash
  ORIGINAL_BASE=54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7
  git fetch origin main --quiet
  RECONCILED_MAIN=$(git merge-base origin/main HEAD)
  test "$RECONCILED_MAIN" = "$(git rev-parse origin/main)"
  mkdir -p .superpowers/issue-79/taxonomy
  git show "$ORIGINAL_BASE:tools/test262/es2015-taxonomy.json" \
    > .superpowers/issue-79/taxonomy/original-base.json
  git show "$RECONCILED_MAIN:tools/test262/es2015-taxonomy.json" \
    > .superpowers/issue-79/taxonomy/reconciled-pre-m0.json
  printf '%s\n' "$ORIGINAL_BASE" \
    > .superpowers/issue-79/taxonomy/original-base.sha
  printf '%s\n' "$RECONCILED_MAIN" \
    > .superpowers/issue-79/taxonomy/reconciled-main.sha
  ```

  The original-to-reconciled delta belongs to concurrent main work, not #79. Generate `.superpowers/issue-79/taxonomy/concurrent-main-paths.json` with every changed classification path and its before/after records. Generate `concurrent-main-explanations.json` as an object whose keys exactly equal those paths and whose values are non-empty reviewed explanations; use `{}` when no concurrent path changed.

- [ ] **Step 5: Implement focused M0 execution and disposition validation**

  Implement a Node-only tool that reads only the exact ledger, requires `TZ=UTC`, verifies the package pin and taxonomy selector, runs only these roots through the existing shared Test262 runner, and writes one record per executable variant. It must reject an output path outside the repository and must not call the broad upstream runner. With `--dispositions=<path>`, its JSON output has exact keys `version`, `ledger`, `records`, and `dispositions`; `ledger` is `{ roots: 240, variants: 459, sha256: M0.sha256 }`, and `dispositions` is the validated exact 240-entry disposition list.

  ```js
  import { createHash } from 'node:crypto';

  export const M0 = Object.freeze({
    roots: 240,
    variants: 459,
    sha256: '4ef97681d7e5208a3ec04e2f4281908877f5f61dd42ee20c0f282ac4dc205309',
  });

  export const M0_BLOCKER_BY_OWNER = Object.freeze({
    80: 'proxy-and-reflect-metaobject',
    81: 'proxy-and-reflect-metaobject',
    82: 'symbol-protocol-dispatch',
    83: 'keyed-collections',
    87: 'binary-data-and-typed-arrays',
    91: 'regexp-unicode-and-sticky',
    93: 'remaining-standard-library-additions',
    95: 'remaining-standard-library-additions',
    96: 'remaining-language-runtime-semantics',
  });

  function sha256(text) {
    return createHash('sha256').update(text).digest('hex');
  }

  export function parseM0Ledger(text) {
    const paths = text.endsWith('\n')
      ? text.slice(0, -1).split('\n')
      : text.split('\n');
    if (
      paths.some((path) => !/^test\/.+\.js$/u.test(path)) ||
      paths.join('\u0000') !== [...paths].sort().join('\u0000') ||
      new Set(paths).size !== paths.length
    ) {
      throw new Error('M0 ledger must contain sorted unique Test262 roots');
    }
    return paths;
  }

  export function verifyM0Ledger(text, taxonomy, dispositions = []) {
    const paths = parseM0Ledger(text);
    if (paths.length !== M0.roots || sha256(text) !== M0.sha256) {
      throw new Error('M0 ledger does not match the reviewed 240-root SHA-256');
    }
    const selected = taxonomy.classifications.filter(
      ({ partition, status, blocker, path }) =>
        partition === 'core' &&
        status === 'blocked:proxy-and-reflect-metaobject' &&
        blocker === 'proxy-and-reflect-metaobject' &&
        !path.startsWith('test/annexB/') &&
        !path.startsWith('test/built-ins/Reflect/') &&
        !path.startsWith('test/built-ins/Proxy/'),
    );
    const variants = selected.reduce(
      (total, entry) => total + entry.variants,
      0,
    );
    const selectedPaths = selected.map((entry) => entry.path).sort();
    if (selected.length === M0.roots) {
      if (
        variants !== M0.variants ||
        selectedPaths.join('\n') !== paths.join('\n')
      ) {
        throw new Error(
          'M0 taxonomy selector does not match the reviewed ledger',
        );
      }
      return paths;
    }
    if (
      selected.length !== 0 ||
      dispositions.length !== M0.roots ||
      dispositions.map(({ path }) => path).join('\n') !== paths.join('\n')
    ) {
      throw new Error('M0 post-migration taxonomy lacks exact dispositions');
    }
    const classificationByPath = new Map(
      taxonomy.classifications.map((entry) => [entry.path, entry]),
    );
    for (const disposition of dispositions) {
      const classification = classificationByPath.get(disposition.path);
      const valid =
        disposition.owner === 'passed'
          ? classification?.status === 'selected-passing'
          : classification?.blocker === M0_BLOCKER_BY_OWNER[disposition.owner];
      if (!valid) {
        throw new Error(`M0 disposition mismatch: ${disposition.path}`);
      }
    }
    return paths;
  }

  export function summarizeM0Dispositions(entries) {
    return entries.reduce((summary, entry) => {
      const current = summary[entry.owner] ?? { roots: 0, variants: 0 };
      current.roots += 1;
      current.variants += entry.variants;
      summary[entry.owner] = current;
      return summary;
    }, {});
  }

  export function compareM0Taxonomies(
    original,
    reconciledPre,
    post,
    dispositions,
    concurrentExplanations,
  ) {
    const originalByPath = new Map(
      original.classifications.map((entry) => [entry.path, entry]),
    );
    const preByPath = new Map(
      reconciledPre.classifications.map((entry) => [entry.path, entry]),
    );
    const postByPath = new Map(
      post.classifications.map((entry) => [entry.path, entry]),
    );
    const changed = (left, right) =>
      [...new Set([...left.keys(), ...right.keys()])]
        .filter(
          (path) =>
            JSON.stringify(left.get(path)) !== JSON.stringify(right.get(path)),
        )
        .sort();
    const concurrentMainPaths = changed(originalByPath, preByPath);
    const issue79Paths = changed(preByPath, postByPath);
    const dispositionPaths = dispositions.map(({ path }) => path).sort();
    if (
      issue79Paths.length !== M0.roots ||
      issue79Paths.join('\n') !== dispositionPaths.join('\n')
    ) {
      throw new Error('Post-M0 taxonomy changed outside the exact M0 ledger');
    }
    const explainedPaths = Object.keys(concurrentExplanations).sort();
    if (
      explainedPaths.join('\n') !== concurrentMainPaths.join('\n') ||
      explainedPaths.some(
        (path) =>
          typeof concurrentExplanations[path] !== 'string' ||
          concurrentExplanations[path] === '',
      )
    ) {
      throw new Error(
        'Concurrent-main taxonomy changes lack exact explanations',
      );
    }
    return { concurrentMainPaths, issue79Paths };
  }

  export function parseM0Dispositions(text, execution) {
    const document = JSON.parse(text);
    const variantsByPath = new Map();
    for (const record of execution.records) {
      variantsByPath.set(
        record.file,
        (variantsByPath.get(record.file) ?? 0) + 1,
      );
    }
    const entries = document.entries;
    if (
      document.version !== 1 ||
      document.ledgerSha256 !== M0.sha256 ||
      !Array.isArray(entries) ||
      entries.length !== M0.roots ||
      new Set(entries.map((entry) => entry.path)).size !== entries.length ||
      entries.some(
        (entry) =>
          variantsByPath.get(entry.path) !== entry.variants ||
          typeof entry.reason !== 'string' ||
          entry.reason === '' ||
          !(
            (entry.outcome === 'passed' && entry.owner === 'passed') ||
            (entry.outcome === 'reassigned' &&
              ['80', '81', '82', '83', '87', '91', '93', '95', '96'].includes(
                entry.owner,
              ))
          ),
      )
    ) {
      throw new Error('M0 dispositions do not cover the exact reviewed ledger');
    }
    return entries;
  }
  ```

  Add `"test262:es2015:m0": "node tools/test262/es2015-m0.js"` to `package.json`. Extend `test/node/repository-invariants.test.js` to parse this npm script and its transitive imports/calls, proving that it can invoke only `es2015-m0.js`, the exact ledger reader, and shared adapters; fail if it reaches `upstream-run.js`, `test262:upstream`, `test262:upstream:check`, `test262:es2015-release`, or an unbounded selector.

- [ ] **Step 6: Run only the exact M0 focused corpus under UTC**

  Run:

  ```bash
  TZ=UTC npm run test262:es2015:m0 -- \
    --ledger=tools/test262/es2015-m0-paths.txt \
    --output=.superpowers/issue-79/m0-execution.json
  ```

  Expected: exactly 240 roots, 459 variants, and the reviewed ledger SHA. The command records pass/fail/skip evidence for these paths only; it does not claim that Reflect or Proxy works and it does not execute any broad upstream subset.

- [ ] **Step 7: Reclassify every exact M0 root**

  Create `tools/test262/es2015-m0-dispositions.json` with exact keys `version`, `ledgerSha256`, and `entries`. Each entry has exact keys `path`, `variants`, `outcome`, `owner`, and `reason`; every ledger path appears once, `owner` is one of `passed`, `80`, `81`, `82`, `83`, `87`, `91`, `93`, `95`, or `96`, and its `variants` equals the pinned inventory. For each root/variant that passes, set `outcome` to `passed` and promote only that exact root through the immutable promotion mechanism after all of its variants pass. For every root that does not pass, set `outcome` to `reassigned`, identify #80 for Reflect-dependent behavior, #81 for Proxy-dependent behavior, or the reviewed later semantic owner (#82, #83, #87, #91, #93, #95, or #96), and write its concrete reason. Roots assigned to #80/#81 retain `blocker === "proxy-and-reflect-metaobject"`; do not invent issue-specific blocker identifiers.

  Reclassify only exact M0 roots. M0 roots assigned to #80 or #81 use `proxy-and-reflect-metaobject`, while the issue number preserves the distinct owner; later-owner dispositions use `M0_BLOCKER_BY_OWNER`. Existing direct `test/built-ins/Reflect/` and `test/built-ins/Proxy/` classifications do not change in this PR. Update #80/#81 readable ownership queries and ledgers to union their unchanged direct roots with the newly assigned M0 consumer roots. This changes ownership for exact M0 paths only, not implementation status, and preserves the dynamically derived complete core denominator.

  Regenerate only classification/evidence artifacts:

  ```bash
  TZ=UTC npm run test262:es2015:audit
  TZ=UTC npm run test262:es2015:audit:check
  ```

  Expected: the exact M0 selector has zero roots and zero variants; every taxonomy record outside the immutable M0 ledger byte-matches reconciled pre-M0 except separately explained concurrent-main paths; Reflect/Proxy and later-owner totals balance to the same dynamically derived core denominator; no result claims a Reflect or Proxy feature is complete.

- [ ] **Step 8: Prove the exact dynamic taxonomy delta**

  Copy the generated post-M0 taxonomy and run `compareM0Taxonomies`:

  ```bash
  cp tools/test262/es2015-taxonomy.json \
    .superpowers/issue-79/taxonomy/post-m0.json
  TZ=UTC node tools/test262/es2015-m0.js \
    --compare-original=.superpowers/issue-79/taxonomy/original-base.json \
    --compare-pre=.superpowers/issue-79/taxonomy/reconciled-pre-m0.json \
    --compare-post=.superpowers/issue-79/taxonomy/post-m0.json \
    --dispositions=tools/test262/es2015-m0-dispositions.json \
    --concurrent-explanations=.superpowers/issue-79/taxonomy/concurrent-main-explanations.json \
    --output=.superpowers/issue-79/taxonomy/m0-delta.json
  ```

  Expected: `issue79Paths` is exactly the immutable 240-root ledger and totals 459 variants. `concurrentMainPaths` is separately derived from `ORIGINAL_BASE..RECONCILED_MAIN`, and every such path has an explanation. No global root/variant count is hard-coded from `54010d4`; all final status and issue totals derive from reconciled pre/post artifacts.

- [ ] **Step 9: Add and run documentation/ledger GREEN checks**

  Run:

  ```bash
  TZ=UTC node test/run-node.js test/node/es2015-m0.test.js && \
  TZ=UTC node test/run-node.js test/node/es2015-taxonomy.test.js && \
  TZ=UTC npm run test262:es2015:audit:check && \
  node test/run-node.js test/node/repository-invariants.test.js
  ```

  Expected: PASS. The ledger, source taxonomy, exact execution evidence, disposition totals, promotion authorization, and documentation remain deterministic.

- [ ] **Step 10: Document the stable boundary and non-goals**

  In `docs/architecture.md`, document the twelve Table 5 methods, Table 6 brands, ordinary-helper/raw-slot ownership, active execution-Realm stack, public Enumerate iterator protocol, and current-exotic override rules. In `docs/testing.md`, document the exact M0 command, UTC requirement, ledger hash, and local broad-Test262 prohibition. In `docs/conformance.md` and `docs/limitations.md`, state that #79 supplies a contract foundation only; Reflect and Proxy remain unimplemented and owned by #80/#81.

- [ ] **Step 11: Obtain exclusive timing approval and capture matching post-change benchmarks**

  Coordinate with the project coordinator again and repeat the Task 0 process inspection. Save approval and process output as `.superpowers/issue-79/candidate-idle-approval.md` and `candidate-contention.txt`. If either gate fails, defer instead of capturing.

  From the clean candidate head, record exact source SHA and host/tool versions, then use the same hosts/workloads/settings as Task 0:

  ```bash
  ps -axo pid=,ppid=,etime=,command= |
    grep -E '[t]ools/test262|[b]enchmark/(cli|run-|spawn-jsc)|[p]laywright|[n]ode test/run-|[j]sc -m test/run-jsc|[n]pm run (test|typecheck|lint|format|benchmark)|[t]sc -p' \
    > .superpowers/issue-79/candidate-contention.txt || true
  test ! -s .superpowers/issue-79/candidate-contention.txt
  {
    printf 'sourceSha=%s\n' "$(git rev-parse HEAD)"
    printf 'node=%s\n' "$(node --version)"
    printf 'chromium=%s\n' "$(node -e 'import("playwright").then(async ({chromium}) => { const b=await chromium.launch({headless:true}); console.log(b.version()); await b.close(); })')"
    printf 'jsc=%s\n' "$(PATH="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" jsc --version 2>&1 || command -v jsc)"
  } > .superpowers/issue-79/candidate-environment.txt
  node benchmark/cli.js run \
    --host=all \
    --workload=object-properties \
    --workload=arrays \
    --output=.benchmark-results/issue-79/candidate-1
  npm run benchmark:smoke
  ```

  Expected: validated Node, Chromium, and JSC captures plus a passing Node correctness smoke. Compare measurements as evidence, not a threshold.

- [ ] **Step 12: Run the repository comparator only when a credible difference appears**

  If the identical before/after capture shows a credible regression, collect six counterbalanced baseline/candidate pairs across Node, Chromium, and JSC under `.benchmark-results/issue-79/`. Before every individual baseline or candidate capture, repeat coordinator approval and the exclusive process inspection; defer that capture under contention and record its exact source SHA plus host/tool versions. Create the schema-1 manifest with only `object-properties` and `arrays` targets, and run:

  ```bash
  node benchmark/cli.js compare \
    --manifest=.benchmark-results/issue-79/compare-manifest.json \
    --output=.benchmark-results/issue-79/comparison
  ```

  Profile only if the comparator reports a `regression` verdict; use `profile:node` or `profile:browser` for the offending host/workload/mode, fix the verified hot path, and repeat the matching capture/comparator. Do not invent a percentage threshold from the supplied baseline values.

- [ ] **Step 13: Run final cross-host and repository verification**

  Run:

  ```bash
  npm run test:node
  npm run test:browser
  PATH="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" npm run test:jsc
  TZ=UTC npm run test262:es2015:m0 -- \
    --ledger=tools/test262/es2015-m0-paths.txt \
    --dispositions=tools/test262/es2015-m0-dispositions.json \
    --output=.superpowers/issue-79/m0-final.json
  npm run typecheck
  npm run lint
  npm run format
  npm run ci:check
  npm run vendor:check
  npm run unicode:check
  TZ=UTC npm run test262:select:check
  TZ=UTC npm run test262:exclusions:check
  TZ=UTC npm run test262:es2015:audit:check
  npm run benchmark:smoke
  ```

  Expected: PASS on Node, Chromium, and JSC; only exact focused M0 Test262 work runs locally; all type/lint/format/generated/invariant gates pass.

- [ ] **Step 14: Request a fresh specification review for evidence/documentation/performance**

  Require a fresh reviewer to verify the exact ledger/hash/counts, UTC-only focused execution, valid disposition ownership, zero M0 selector, no Reflect/Proxy claim, documentation accuracy, and benchmark interpretation.

- [ ] **Step 15: Fix and re-review every confirmed evidence specification finding**

  Add a RED test or deterministic ledger check for each confirmed finding, rerun the Task 8 GREEN commands, and obtain fresh specification approval.

- [ ] **Step 16: Request a different fresh quality review for evidence/documentation/performance**

  Require inspection of generated-artifact integrity, pin enforcement, no broad local execution, cross-host capture identity, comparator protocol, and documentation links. Do not use Claude Opus 5.

- [ ] **Step 17: Fix and re-review every confirmed evidence quality finding**

  Add focused coverage, rerun the Task 8 GREEN commands, and obtain fresh quality approval.

- [ ] **Step 18: Commit validation, evidence, and documentation**

  ```bash
  git add tools/test262/es2015-m0.js tools/test262/es2015-m0-paths.txt \
    tools/test262/es2015-m0-dispositions.json \
    test/node/es2015-m0.test.js package.json \
    tools/test262/es2015-audit-evidence.json \
    tools/test262/es2015-taxonomy.json \
    tools/test262/es2015-promotion.json \
    tools/test262/upstream-subset.json \
    docs/architecture.md docs/testing.md docs/conformance.md \
    docs/limitations.md docs/test262-report.jsonl \
    test/node/es2015-taxonomy.test.js test/node/repository-invariants.test.js
  git commit -m "docs: publish object contract evidence" \
    -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
  ```

### Task 9: Complete Maximum-Capability Whole-Branch Review and Fix Loops

**Files:**

- Verify: `LIVE_MAIN...HEAD`, all implementation/test/documentation/evidence files, benchmark evidence, and current GitHub issue state.

**Interfaces:**

- Consumes: reviewed commits from Tasks 1–8 and all named GREEN evidence.
- Produces: a maximum-capability architecture/correctness/performance review with no unresolved confirmed finding and a final one-PR scope decision.
- Produces: `.superpowers/issue-79/reconciliation/pre-review.json` containing the live main SHA, prior main SHA, reconciliation decision, changed paths, rerun evidence, final merge base, and candidate head.

- [ ] **Step 1: Reconcile moving main immediately before final review**

  ```bash
  git fetch origin main --quiet
  PRIOR_MAIN=$(cat .superpowers/issue-79/taxonomy/reconciled-main.sha)
  LIVE_MAIN=$(git rev-parse origin/main)
  git --no-pager log --format='%H %s' "$PRIOR_MAIN..$LIVE_MAIN" \
    > .superpowers/issue-79/reconciliation/pre-review-commits.txt
  git diff --name-status "$PRIOR_MAIN..$LIVE_MAIN" \
    > .superpowers/issue-79/reconciliation/pre-review-paths.txt
  ```

  If `LIVE_MAIN` moved, inspect every changed path against the approved contract. Stop for written design reapproval only when the main change creates a semantic conflict or expands #79's scope. Otherwise merge `LIVE_MAIN` preserving both histories, rerun the affected task suites, repeat Task 8 Steps 4–18 against the new reconciled main, repeat the exclusive-idle performance capture when a hot path changed, and commit the reconciliation/evidence updates with the required trailer. Concurrent taxonomy changes belong in `concurrent-main-paths.json`; the #79 post-M0 delta must still be exactly the immutable 240-root ledger.

  Persist `.superpowers/issue-79/reconciliation/pre-review.json` with `priorMain`, `liveMain`, `decision`, `changedPaths`, `rerunEvidence`, `finalMergeBase`, and `candidateHead`. Require:

  ```bash
  FINAL_MERGE_BASE=$(git merge-base origin/main HEAD)
  test "$FINAL_MERGE_BASE" = "$(git rev-parse origin/main)"
  ```

- [ ] **Step 2: Freeze the review candidate**

  ```bash
  git status --short
  REVIEW_BASE="$FINAL_MERGE_BASE"
  git diff --check "$REVIEW_BASE...HEAD"
  git diff --stat "$REVIEW_BASE...HEAD"
  git diff --name-only "$REVIEW_BASE...HEAD"
  ```

  Expected: a clean worktree and only #79 contract, migration, tests, evidence, and directly related documentation paths.

- [ ] **Step 3: Request a maximum-capability architecture/correctness/performance review**

  Give one fresh maximum-capability reviewer the approved design, this complete plan, the exact range `"$REVIEW_BASE...HEAD"`, all RED/GREEN logs, the M0 disposition, and benchmark captures. Require review of Table 5/6 shape, wrappers/error Realm ownership, active Realm chains, Enumerate public protocol, current exotics, all caller migration, hostile tests, raw-slot/class-name/callability invariants, 50,000-link safety, Test262 ownership, and performance. Use GPT-5.6 Terra/Sol/Luna or Claude Opus 4.8-or-lower; never Claude Opus 5.

- [ ] **Step 4: Fix every confirmed whole-branch finding**

  For each confirmed behavior issue, add a failing focused test before the fix. For each confirmed documentation/evidence issue, add the deterministic validation that would have caught it. Rerun the affected task GREEN command and all Task 8 verification commands.

- [ ] **Step 5: Obtain a fresh maximum-capability re-review**

  Re-submit the updated exact range and evidence. Repeat Steps 3–4 until the reviewer reports no confirmed architecture, correctness, or performance finding.

- [ ] **Step 6: Reconfirm one-PR reviewability**

  Verify the final diff still implements only the approved Table 5/6 contract, ordinary/current-exotic migration, callers, invariants, tests, and evidence. If an independent subsystem is present, stop before opening a PR and propose #79 become a grouping issue.

- [ ] **Step 7: Commit review fixes, if any**

  ```bash
  git add -A
  git commit -m "fix: address object contract review findings" \
    -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
  ```

  Run this command only when review fixes changed tracked files; otherwise do not create an empty commit. After the final approved commit (or no-op), update `pre-review.json.candidateHead` to `git rev-parse HEAD`, add the final reviewer identity/decision/evidence path, and verify its `finalMergeBase` still equals live `origin/main`.

### Task 10: Publish, Verify, Merge, Reclassify, and Close Issue #79

**Files:**

- GitHub state only: branch, PR, CI, Code Scanning analyses, issue #79, and issues #70, #80, #81, #82, #83, #87, #91, #93, #95, #96, #98, and #100.
- Create ignored lifecycle evidence only under `.superpowers/issue-79/`.

**Interfaces:**

- Consumes: clean reviewed branch head, Task 8 validation, Task 9 approval, and live `origin/main`.
- Produces: one exact-head reviewed PR, squash merge, post-merge exact-main CodeQL evidence, deterministic M0 reclassification, closed #79, and updated roadmap graph/count evidence.
- Produces: `.superpowers/issue-79/lifecycle-identities.json` with distinct `originalBase`, `baselineSource`, `finalMergeBase`, `reviewedHead`, `prNumber`, `ciRun`, `prCodeqlJavascript`, `prCodeqlActions`, `mergeSha`, `mainCodeqlJavascript`, and `mainCodeqlActions`.

- [ ] **Step 1: Reconcile moving main immediately before push**

  Fetch `origin/main` and compare it to Task 9's `finalMergeBase`. If it moved, do not push the reviewed candidate. Apply Task 9 Step 1: inspect scope, merge compatible main changes, regenerate dynamic pre/post M0 taxonomy/docs, rerun affected focused/cross-host/invariant/performance gates, and repeat the complete maximum-capability review on the new exact merge-base range. Stop for design reapproval only if scope expands.

  Persist `.superpowers/issue-79/reconciliation/pre-push.json` and require:

  ```bash
  git fetch origin main --quiet
  FINAL_MERGE_BASE=$(git merge-base origin/main HEAD)
  test "$FINAL_MERGE_BASE" = "$(git rev-parse origin/main)"
  REVIEWED_HEAD=$(git rev-parse HEAD)
  test "$(jq -r .candidateHead .superpowers/issue-79/reconciliation/pre-review.json)" = \
    "$REVIEWED_HEAD"
  git status --short
  ```

  If reconciliation changed `HEAD`, return to Task 9 before continuing. Never push or review stale-base evidence.

- [ ] **Step 2: Push the reviewed branch and create or recover the single PR app-natively**

  Write the PR body before pushing:

  ```bash
  cat > .superpowers/issue-79/pr-body.md <<'EOF'
  ## Summary

  - Implements the ES2015 Table 5 object internal-method contract and branded Table 6 capabilities.
  - Moves ordinary storage behind named helpers, migrates current exotics and semantic callers, and replaces raw for-in snapshots with public `[[Enumerate]]` iterators.
  - Adds active execution-Realm tracking, hostile-exotic/invariant coverage, and exact M0 evidence.

  ## Evidence

  - Original roadmap base: `ORIGINAL_BASE`.
  - Performance baseline source: `BASELINE_SOURCE`.
  - Final reconciled merge base: `FINAL_MERGE_BASE`.
  - M0 ledger: 240 roots / 459 variants / `4ef97681d7e5208a3ec04e2f4281908877f5f61dd42ee20c0f282ac4dc205309`.
  - Reviewed source head: `REVIEWED_HEAD`.
  - Standard CI run: `CI_RUN_PENDING`.
  - PR CodeQL JavaScript/Actions analyses: `PR_CODEQL_PENDING`.
  - Squash merge and exact-main CodeQL: pending.
  - Node, Chromium, JSC, exact UTC M0 Test262, typecheck, lint, format, generated checks, invariant checks, and benchmark smoke passed locally.

  ## Non-goals

  This PR does not implement Reflect methods, Proxy traps/revocation/invariants, collections, binary data, typed arrays, or later Symbol protocols.

  Tracks #79
  EOF
  ```

  Replace the literal identity placeholders before creating or updating the PR:

  ```bash
  ORIGINAL_BASE=54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7
  BASELINE_SOURCE=$(sed -n 's/^sourceSha=//p' \
    .superpowers/issue-79/baseline-environment.txt)
  REVIEWED_HEAD=$(git rev-parse HEAD)
  FINAL_MERGE_BASE=$(git merge-base origin/main HEAD)
  perl -0pi -e 's/ORIGINAL_BASE/'"$ORIGINAL_BASE"'/g;
    s/BASELINE_SOURCE/'"$BASELINE_SOURCE"'/g;
    s/FINAL_MERGE_BASE/'"$FINAL_MERGE_BASE"'/g;
    s/REVIEWED_HEAD/'"$REVIEWED_HEAD"'/g' \
    .superpowers/issue-79/pr-body.md
  git push --set-upstream origin yoonbuck-formalize-object-internal-methods
  ```

  Inspect for an existing open PR on the branch:

  ```bash
  EXISTING_PR_JSON=$(gh pr list --repo yoonbuck/jsjs \
    --head yoonbuck-formalize-object-internal-methods \
    --state all --json number,state,mergedAt,headRefOid,url \
    --jq 'sort_by(.number) | reverse | .[0] // {}')
  EXISTING_PR=$(jq -r '.number // empty' <<<"$EXISTING_PR_JSON")
  EXISTING_STATE=$(jq -r '.state // empty' <<<"$EXISTING_PR_JSON")
  EXISTING_MERGED=$(jq -r '.mergedAt // empty' <<<"$EXISTING_PR_JSON")
  ```

  If no prior PR exists, call app-native `create_pull_request` with title `Formalize the ES2015 object internal-method contract` and the exact body. If the latest PR is open, read its live title/body and call app-native `update_pull_request` with `repo_full_name: "yoonbuck/jsjs"`, that PR number, and the exact title/body; use the returned `base_sha` for any retry so a concurrent edit is not overwritten. If it is closed but unmerged, create a new app-native PR and record the superseded number. If it is already merged, do not create another PR: recover its merge/head identities and resume at the first incomplete post-merge security/evidence step. Do not use `gh pr create`, `gh pr edit`, GraphQL mutation, or auto-close wording.

  The operation is idempotent: for an unmerged lifecycle, inspect the live PR, require exactly one open PR on the branch, and persist its number; for an already-merged lifecycle, require zero open PRs and persist the merged number. The body names `Tracks #79`, the design commits as design-only history, all distinct lifecycle identities, exact Table 5/6 boundary, M0 hash/count, validation, benchmark interpretation, non-goals, and scope decisions.

- [ ] **Step 3: Prove pushed-head equality**

  ```bash
  PR=$(gh pr view --repo yoonbuck/jsjs --json number --jq .number)
  test "$(gh pr view "$PR" --repo yoonbuck/jsjs \
    --json headRefOid --jq .headRefOid)" = "$REVIEWED_HEAD"
  ```

  Expected: the PR head exactly equals `REVIEWED_HEAD`.

- [ ] **Step 4: Find and synchronously watch exact `ci.yml` reviewed-head CI**

  ```bash
  for attempt in $(seq 1 60); do
    CI_RUN=$(gh run list --repo yoonbuck/jsjs \
      --workflow ci.yml --event pull_request --commit "$REVIEWED_HEAD" \
      --limit 100 --json databaseId,headSha,event,workflowName,status,conclusion \
      --jq '[.[] | select(.headSha == "'"$REVIEWED_HEAD"'" and .event == "pull_request")][0].databaseId // empty')
    if test -n "$CI_RUN"; then break; fi
    sleep 10
  done
  test -n "$CI_RUN"
  ```

  Start exactly one synchronous Bash tool call with command `gh run watch "$CI_RUN" --repo yoonbuck/jsjs --exit-status`, `initial_wait: 600`, and `mode: "sync"`. If it remains active, call `read_bash` with that returned shell ID and `delay: 600`; repeat same-shell reads only, never start a second watcher. After completion:

  ```bash
  test "$(gh run view "$CI_RUN" --repo yoonbuck/jsjs \
    --json headSha --jq .headSha)" = "$REVIEWED_HEAD"
  test "$(gh pr view "$PR" --repo yoonbuck/jsjs \
    --json headRefOid --jq .headRefOid)" = "$REVIEWED_HEAD"
  gh run view "$CI_RUN" --repo yoonbuck/jsjs --json jobs \
    > .superpowers/issue-79/ci-jobs.json
  test "$(jq '[.jobs[] | select(.status != "completed" or .conclusion != "success")] | length' \
    .superpowers/issue-79/ci-jobs.json)" = "0"
  node --input-type=module - <<'NODE'
  import { readFileSync, writeFileSync } from 'node:fs';
  import yaml from 'js-yaml';
  const workflow = yaml.load(readFileSync('.github/workflows/ci.yml', 'utf8'));
  const names = Object.values(workflow.jobs)
    .map((job) => job.name)
    .sort();
  writeFileSync(
    '.superpowers/issue-79/ci-expected-jobs.json',
    `${JSON.stringify(names, null, 2)}\n`,
  );
  NODE
  jq '[.jobs[].name] | sort' .superpowers/issue-79/ci-jobs.json \
    > .superpowers/issue-79/ci-actual-jobs.json
  diff -u .superpowers/issue-79/ci-expected-jobs.json \
    .superpowers/issue-79/ci-actual-jobs.json
  gh pr checks "$PR" --repo yoonbuck/jsjs --required
  ```

  Expected: bounded startup finds only the `ci.yml` pull-request run for `REVIEWED_HEAD`; every expected job is terminal/successful; the live PR head remains unchanged.

- [ ] **Step 5: Find, synchronously watch, and inspect exact-head CodeQL**

  Default setup creates a dynamic CodeQL run named for the PR (for example the prior exact-head run `32320206235`, named `PR #101`). Require that run and both analysis categories for `REVIEWED_HEAD`:

  ```bash
  for attempt in $(seq 1 60); do
    CODEQL_RUN=$(gh run list --repo yoonbuck/jsjs --commit "$REVIEWED_HEAD" \
      --event dynamic --limit 100 \
      --json databaseId,headSha,event,name,status,conclusion \
      --jq '[.[] | select(.headSha == "'"$REVIEWED_HEAD"'" and .name == "PR #'"$PR"'")][0].databaseId // empty')
    if test -n "$CODEQL_RUN"; then break; fi
    sleep 10
  done
  test -n "$CODEQL_RUN"
  ```

  Start exactly one synchronous Bash tool call with command `gh run watch "$CODEQL_RUN" --repo yoonbuck/jsjs --exit-status`, `initial_wait: 600`, and `mode: "sync"`. If it remains active, call `read_bash` on that returned shell ID with `delay: 600`; repeat same-shell reads only, never start a second watcher. Then continue:

  ```bash
  test "$(gh run view "$CODEQL_RUN" --repo yoonbuck/jsjs \
    --json headSha --jq .headSha)" = "$REVIEWED_HEAD"
  gh run view "$CODEQL_RUN" --repo yoonbuck/jsjs --log \
    > .superpowers/issue-79/pr-codeql-run.log
  gh run view "$CODEQL_RUN" --repo yoonbuck/jsjs --json jobs \
    > .superpowers/issue-79/pr-codeql-jobs.json
  test "$(jq '[.jobs[] | select(.status != "completed" or .conclusion != "success")] | length' \
    .superpowers/issue-79/pr-codeql-jobs.json)" = "0"
  test "$(jq -r '[.jobs[].name] | sort | join(\"\\n\")' \
    .superpowers/issue-79/pr-codeql-jobs.json)" = \
    "$(printf '%s\n' 'Analyze (actions)' 'Analyze (javascript-typescript)')"

  gh api --paginate repos/yoonbuck/jsjs/code-scanning/analyses \
    > .superpowers/issue-79/pr-head-codeql-analyses.json
  CODEQL_JS=$(jq -r --arg sha "$REVIEWED_HEAD" \
    '[.[] | select(.commit_sha == $sha and .tool.name == "CodeQL" and .category == "/language:javascript-typescript")][0].id // empty' \
    .superpowers/issue-79/pr-head-codeql-analyses.json)
  CODEQL_ACTIONS=$(jq -r --arg sha "$REVIEWED_HEAD" \
    '[.[] | select(.commit_sha == $sha and .tool.name == "CodeQL" and .category == "/language:actions")][0].id // empty' \
    .superpowers/issue-79/pr-head-codeql-analyses.json)
  test -n "$CODEQL_JS"
  test -n "$CODEQL_ACTIONS"
  for analysis in "$CODEQL_JS" "$CODEQL_ACTIONS"; do
    gh api "repos/yoonbuck/jsjs/code-scanning/analyses/$analysis" \
      > ".superpowers/issue-79/pr-codeql-$analysis.json"
    test "$(jq -r .commit_sha ".superpowers/issue-79/pr-codeql-$analysis.json")" = "$REVIEWED_HEAD"
    test "$(jq -r .results_count ".superpowers/issue-79/pr-codeql-$analysis.json")" = "0"
    test "$(jq -r '.error // ""' ".superpowers/issue-79/pr-codeql-$analysis.json")" = ""
    test "$(jq -r '.warning // ""' ".superpowers/issue-79/pr-codeql-$analysis.json")" = ""
    gh api -H 'Accept: application/sarif+json' \
      "repos/yoonbuck/jsjs/code-scanning/analyses/$analysis" \
      > ".superpowers/issue-79/pr-codeql-$analysis.sarif"
  done
  ```

  Inspect both analysis JSON/SARIF artifacts and the exact run log for extraction or parse diagnostics, not merely a green conclusion. Any result, warning, error, or unexpected extraction diagnostic blocks merge and enters the RED/fix/review loop.

- [ ] **Step 6: Resolve every review thread before merge**

  Fetch reviews and threads, respond to each confirmed finding with the exact fix and test evidence, then resolve it:

  ```bash
  gh pr view "$PR" --repo yoonbuck/jsjs --json reviews,comments,reviewDecision
  gh api graphql -f query='
    query($owner:String!, $repo:String!, $number:Int!) {
      repository(owner:$owner, name:$repo) {
        pullRequest(number:$number) {
          reviewThreads(first:100) {
            nodes { id isResolved comments(first:100) { nodes { body url } } }
          }
        }
      }
    }' -F owner=yoonbuck -F repo=jsjs -F number="$PR"
  ```

  For every code change, repeat the relevant task RED/GREEN/reviewer loop, repeat Task 10 Step 1 before the follow-up push, set `REVIEWED_HEAD=$(git rev-parse HEAD)`, re-prove PR-head equality, and repeat exact-head CI and CodeQL inspection. Do not push or merge with stale-base or stale-head evidence.

- [ ] **Step 7: Update the PR with exact pre-merge lifecycle identities**

  Replace `CI_RUN_PENDING` and `PR_CODEQL_PENDING` in the live PR body with the exact `CI_RUN`, `CODEQL_RUN`, `CODEQL_JS`, and `CODEQL_ACTIONS` identities. Read the current body and call app-native `update_pull_request` with its concurrency `base_sha`; do not use raw GitHub mutation commands. Preserve `Tracks #79`.

  Persist the known identities with null post-merge fields:

  ```bash
  jq -n \
    --arg originalBase "$ORIGINAL_BASE" \
    --arg baselineSource "$BASELINE_SOURCE" \
    --arg finalMergeBase "$FINAL_MERGE_BASE" \
    --arg reviewedHead "$REVIEWED_HEAD" \
    --argjson prNumber "$PR" \
    --argjson ciRun "$CI_RUN" \
    --argjson prCodeqlJavascript "$CODEQL_JS" \
    --argjson prCodeqlActions "$CODEQL_ACTIONS" \
    '{
      originalBase: $originalBase,
      baselineSource: $baselineSource,
      finalMergeBase: $finalMergeBase,
      reviewedHead: $reviewedHead,
      prNumber: $prNumber,
      ciRun: $ciRun,
      prCodeqlJavascript: $prCodeqlJavascript,
      prCodeqlActions: $prCodeqlActions,
      mergeSha: null,
      mainCodeqlJavascript: null,
      mainCodeqlActions: null
    }' > .superpowers/issue-79/lifecycle-identities.json
  test "$(gh pr view "$PR" --repo yoonbuck/jsjs \
    --json headRefOid --jq .headRefOid)" = "$REVIEWED_HEAD"
  ```

- [ ] **Step 8: Squash merge and delete the branch**

  ```bash
  git fetch origin main --quiet
  test "$(git merge-base origin/main "$REVIEWED_HEAD")" = \
    "$(git rev-parse origin/main)"
  test "$(gh pr view "$PR" --repo yoonbuck/jsjs \
    --json headRefOid --jq .headRefOid)" = "$REVIEWED_HEAD"
  gh pr merge "$PR" --repo yoonbuck/jsjs --squash --delete-branch
  MERGE_SHA=$(gh pr view "$PR" --repo yoonbuck/jsjs \
    --json mergeCommit --jq .mergeCommit.oid)
  test -n "$MERGE_SHA"
  git fetch origin main --quiet
  git merge-base --is-ancestor "$MERGE_SHA" origin/main
  ```

  Expected: a squash merge on `main`, deleted remote branch, and a merge SHA distinct from the reviewed source head.

  Update only the merge identity:

  ```bash
  jq --arg mergeSha "$MERGE_SHA" '.mergeSha = $mergeSha' \
    .superpowers/issue-79/lifecycle-identities.json \
    > .superpowers/issue-79/lifecycle-identities.tmp
  mv .superpowers/issue-79/lifecycle-identities.tmp \
    .superpowers/issue-79/lifecycle-identities.json
  ```

- [ ] **Step 9: Wait synchronously for exact-main CodeQL**

  ```bash
  for attempt in $(seq 1 60); do
    gh api --paginate repos/yoonbuck/jsjs/code-scanning/analyses \
      > .superpowers/issue-79/main-codeql-analyses.json
    CODEQL_JS=$(jq -r \
      '[.[] | select(.commit_sha == "'"$MERGE_SHA"'" and .ref == "refs/heads/main" and .tool.name == "CodeQL" and .category == "/language:javascript-typescript")][0].id // empty' \
      .superpowers/issue-79/main-codeql-analyses.json)
    CODEQL_ACTIONS=$(jq -r \
      '[.[] | select(.commit_sha == "'"$MERGE_SHA"'" and .ref == "refs/heads/main" and .tool.name == "CodeQL" and .category == "/language:actions")][0].id // empty' \
      .superpowers/issue-79/main-codeql-analyses.json)
    if test -n "$CODEQL_JS" && test -n "$CODEQL_ACTIONS"; then break; fi
    sleep 10
  done
  test -n "$CODEQL_JS"
  test -n "$CODEQL_ACTIONS"
  CODEQL_RUN=$(gh run list --repo yoonbuck/jsjs --commit "$MERGE_SHA" \
    --event dynamic --limit 100 \
    --json databaseId,headSha,event,name,status,conclusion \
    --jq '[.[] | select(.headSha == "'"$MERGE_SHA"'" and .event == "dynamic" and .name == "Push on main")][0].databaseId // empty')
  test -n "$CODEQL_RUN"
  ```

  Start exactly one synchronous Bash tool call with command `gh run watch "$CODEQL_RUN" --repo yoonbuck/jsjs --exit-status`, `initial_wait: 600`, and `mode: "sync"`. If it remains active, call `read_bash` with the same returned shell ID and `delay: 600`; repeat same-shell reads only. Then:

  ```bash
  gh run view "$CODEQL_RUN" --repo yoonbuck/jsjs --log \
    > .superpowers/issue-79/main-codeql-run.log
  gh run view "$CODEQL_RUN" --repo yoonbuck/jsjs --json jobs \
    > .superpowers/issue-79/main-codeql-jobs.json
  test "$(jq '[.jobs[] | select(.status != "completed" or .conclusion != "success")] | length' \
    .superpowers/issue-79/main-codeql-jobs.json)" = "0"
  test "$(jq -r '[.jobs[].name] | sort | join(\"\\n\")' \
    .superpowers/issue-79/main-codeql-jobs.json)" = \
    "$(printf '%s\n' 'Analyze (actions)' 'Analyze (javascript-typescript)')"
  for analysis in "$CODEQL_JS" "$CODEQL_ACTIONS"; do
    gh api "repos/yoonbuck/jsjs/code-scanning/analyses/$analysis" \
      > ".superpowers/issue-79/codeql-$analysis.json"
    test "$(jq -r .commit_sha ".superpowers/issue-79/codeql-$analysis.json")" = "$MERGE_SHA"
    test "$(jq -r .tool.name ".superpowers/issue-79/codeql-$analysis.json")" = "CodeQL"
    test "$(jq -r .results_count ".superpowers/issue-79/codeql-$analysis.json")" = "0"
    test "$(jq -r '.error // ""' ".superpowers/issue-79/codeql-$analysis.json")" = ""
    test "$(jq -r '.warning // ""' ".superpowers/issue-79/codeql-$analysis.json")" = ""
    gh api -H 'Accept: application/sarif+json' \
      "repos/yoonbuck/jsjs/code-scanning/analyses/$analysis" \
      > ".superpowers/issue-79/codeql-$analysis.sarif"
  done
  ```

  Inspect both JSON documents and SARIF files for extraction/parse diagnostics and actionable results. If a CodeQL result exists, fix it in a new reviewed PR and repeat this exact-main gate on that new merge SHA.

  Update only the exact-main analysis identities:

  ```bash
  jq --argjson javascript "$CODEQL_JS" --argjson actions "$CODEQL_ACTIONS" \
    '.mainCodeqlJavascript = $javascript | .mainCodeqlActions = $actions' \
    .superpowers/issue-79/lifecycle-identities.json \
    > .superpowers/issue-79/lifecycle-identities.tmp
  mv .superpowers/issue-79/lifecycle-identities.tmp \
    .superpowers/issue-79/lifecycle-identities.json
  ```

  Do not mutate issue dependencies or close #79 until this file has all non-null identities.

- [ ] **Step 10: Re-run exact UTC reclassification from merged main**

  ```bash
  git worktree add --detach .superpowers/issue-79-post-merge "$MERGE_SHA"
  (
  cd .superpowers/issue-79-post-merge
  npm install
  TZ=UTC npm run test262:es2015:m0 -- \
    --ledger=tools/test262/es2015-m0-paths.txt \
    --dispositions=tools/test262/es2015-m0-dispositions.json \
    --output=.superpowers/issue-79/m0-post-merge.json
  TZ=UTC npm run test262:es2015:audit
  TZ=UTC npm run test262:es2015:audit:check
  )
  cp .superpowers/issue-79-post-merge/.superpowers/issue-79/m0-post-merge.json \
    .superpowers/issue-79/m0-post-merge.json
  cp .superpowers/issue-79-post-merge/tools/test262/es2015-taxonomy.json \
    .superpowers/issue-79/taxonomy/post-merge.json
  git worktree remove .superpowers/issue-79-post-merge
  TZ=UTC node tools/test262/es2015-m0.js \
    --compare-original=.superpowers/issue-79/taxonomy/original-base.json \
    --compare-pre=.superpowers/issue-79/taxonomy/reconciled-pre-m0.json \
    --compare-post=.superpowers/issue-79/taxonomy/post-merge.json \
    --dispositions=tools/test262/es2015-m0-dispositions.json \
    --concurrent-explanations=.superpowers/issue-79/taxonomy/concurrent-main-explanations.json \
    --output=.superpowers/issue-79/taxonomy/m0-post-merge-delta.json
  ```

  Expected: M0’s exact selector remains zero on `MERGE_SHA`; the reconciled-pre-to-post merge delta is exactly the 240 immutable ledger paths / 459 variants; original-base-to-reconciled changes are separately enumerated concurrent-main paths; promotions represent only passed exact paths; all non-passing paths have a reviewed next owner; no Reflect/Proxy feature claim appears.

- [ ] **Step 11: Update the graph and counts with exact merged evidence**

  Snapshot every live issue and generate the owner totals before editing:

  ```bash
  mkdir -p .superpowers/issue-79/issues
  for issue in 70 80 81 82 83 87 91 93 95 96 98 100; do
    gh api "repos/yoonbuck/jsjs/issues/$issue" \
      > ".superpowers/issue-79/issues/$issue-before.json"
  done
  node --input-type=module - <<'NODE'
  import { readFileSync, writeFileSync } from 'node:fs';
  import {
    compareM0Taxonomies,
    summarizeM0Dispositions,
  } from './tools/test262/es2015-m0.js';

  const result = JSON.parse(
    readFileSync('.superpowers/issue-79/m0-post-merge.json', 'utf8'),
  );
  const original = JSON.parse(
    readFileSync('.superpowers/issue-79/taxonomy/original-base.json', 'utf8'),
  );
  const reconciledPre = JSON.parse(
    readFileSync(
      '.superpowers/issue-79/taxonomy/reconciled-pre-m0.json',
      'utf8',
    ),
  );
  const post = JSON.parse(
    readFileSync('.superpowers/issue-79/taxonomy/post-merge.json', 'utf8'),
  );
  const concurrentExplanations = JSON.parse(
    readFileSync(
      '.superpowers/issue-79/taxonomy/concurrent-main-explanations.json',
      'utf8',
    ),
  );
  const entries = result.dispositions;
  const summary = summarizeM0Dispositions(entries);
  const taxonomyDelta = compareM0Taxonomies(
    original,
    reconciledPre,
    post,
    entries,
    concurrentExplanations,
  );
  const total = entries.reduce(
    (current, entry) => ({
      roots: current.roots + 1,
      variants: current.variants + entry.variants,
    }),
    { roots: 0, variants: 0 },
  );
  if (total.roots !== 240 || total.variants !== 459) {
    throw new Error('M0 dispositions do not preserve the reviewed denominator');
  }
  const postCore = post.classifications.filter(
    (entry) => entry.partition === 'core',
  );
  const coreTotals = postCore.reduce(
    (current, entry) => ({
      roots: current.roots + 1,
      variants: current.variants + entry.variants,
    }),
    { roots: 0, variants: 0 },
  );
  const statusTotals = {};
  const blockerTotals = {};
  for (const entry of postCore) {
    const status = statusTotals[entry.status] ?? { roots: 0, variants: 0 };
    status.roots += 1;
    status.variants += entry.variants;
    statusTotals[entry.status] = status;
    if (entry.blocker !== null) {
      const blocker = blockerTotals[entry.blocker] ?? {
        roots: 0,
        variants: 0,
      };
      blocker.roots += 1;
      blocker.variants += entry.variants;
      blockerTotals[entry.blocker] = blocker;
    }
  }
  writeFileSync(
    '.superpowers/issue-79/m0-roadmap-delta.json',
    `${JSON.stringify(
      {
        finalMergeBase: readFileSync(
          '.superpowers/issue-79/taxonomy/reconciled-main.sha',
          'utf8',
        ).trim(),
        total,
        summary,
        taxonomyDelta,
        coreTotals,
        statusTotals,
        blockerTotals,
      },
      null,
      2,
    )}\n`,
  );
  NODE
  ```

  Snapshot and update #70, #80, #81, #82, #83, #87, #91, #93, #95, #96, #98, and #100 from `m0-roadmap-delta.json`. Derive every final count and the complete core denominator from the reconciled post-merge taxonomy; do not copy the original `54010d4` totals after parallel merges. The updates must:

  - remove #79’s `240/459` M0 attribution and show its exact resulting zero selector;
  - add each reclassified root/variant only to its reviewed new owner, recomputing every affected issue’s root/variant count and ledger SHA;
  - keep #80/#81 as future owners without claiming their Reflect/Proxy functionality;
  - remove #79 from native dependency/blocked-by relationships only after the merge and exact-main CodeQL gates;
  - update #98’s Table 5/6 rows with the merged PR, review evidence, and exact M0 disposition;
  - update #100’s dependency graph/count narrative using the dynamically derived post-merge complete-core denominator; and
  - report that #80 and #82 are newly unblocked by #79 only, without claiming either feature is implemented. Report that #83, #87, #91, #93, #95, #96, and #100 retain their other listed blockers.

  Read each live issue immediately before patching it; if its body changed concurrently, stop and reconcile the new body rather than overwriting it.

  For every reviewed body file generated from `m0-roadmap-delta.json`, require that the live `updated_at` value still equals the saved snapshot, then apply it:

  ```bash
  for issue in 70 80 81 82 83 87 91 93 95 96 98 100; do
    before=".superpowers/issue-79/issues/$issue-before.json"
    expected=$(jq -r .updated_at "$before")
    actual=$(gh api "repos/yoonbuck/jsjs/issues/$issue" --jq .updated_at)
    test "$actual" = "$expected"
    gh issue edit "$issue" --repo yoonbuck/jsjs \
      --body-file ".superpowers/issue-79/issues/$issue-after.md"
  done
  ```

- [ ] **Step 12: Publish final evidence and close #79**

  Read the merged PR's current body and call app-native `update_pull_request` with its concurrency `base_sha` to replace pending lifecycle fields with the exact values from `lifecycle-identities.json`. Preserve `Tracks #79`; do not add an auto-close keyword after merge.

  Post the PR URL, original roadmap base, performance baseline source, final merge base, `REVIEWED_HEAD`, `MERGE_SHA`, exact CI run, PR CodeQL analysis IDs, main CodeQL analysis IDs, M0 ledger hash/count, post-merge selector result, validation summary, issue graph deltas, and newly-unblocked-node report on #79 and #70. Only after exact-main CodeQL, post-merge reclassification, and graph mutation all pass, close #79 explicitly:

  ```bash
  test "$(jq -r '[.originalBase,.baselineSource,.finalMergeBase,.reviewedHead,.ciRun,.prCodeqlJavascript,.prCodeqlActions,.mergeSha,.mainCodeqlJavascript,.mainCodeqlActions] | all(. != null and . != \"\")' \
    .superpowers/issue-79/lifecycle-identities.json)" = "true"
  if test "$(gh issue view 79 --repo yoonbuck/jsjs --json state --jq .state)" != "CLOSED"; then
    gh issue close 79 --repo yoonbuck/jsjs \
      --comment "Merged in $MERGE_SHA after exact reviewed-head ci.yml, PR CodeQL, exact-main CodeQL, UTC M0 reclassification, and roadmap graph update."
  fi
  test "$(gh issue view 79 --repo yoonbuck/jsjs --json state --jq .state)" = "CLOSED"
  ```

## One-PR Scope Conclusion

This remains one PR only while the work is the approved ES2015 Table 5/6 contract, ordinary helper encapsulation, active-Realm plumbing, current-exotic and semantic caller migration, Enumerate, invariants, exact M0 evidence, validation, and directly related documentation. It does not include Reflect, Proxy, or any independent runtime subsystem. The persisted Task 0 and Task 6 checkpoints are mandatory stop points: if either disproves that boundary, halt implementation and propose converting #79 to a grouping issue without creating an atomic-completion PR. Task 9 and Task 10 reconcile moving main before final review and every push, so review, CI, CodeQL, taxonomy, and graph evidence always refer to the exact final merge-base range.
