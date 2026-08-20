# Portable Test262 Cross-Realm Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Test262 runner install a portable, harness-only, same-Agent `$262.createRealm`/`$262.evalScript` host interface and move issue #76's exact 135 roots / 267 variants from `test262-cross-realm-host` to selected-and-passing.

**Architecture:** The portable runner requires one explicit `installHostBindings(realm)` engine hook and invokes it once immediately after creating every root Realm, including raw script and raw module roots. The jsjs Test262 engine bridge owns the concrete `$262` object, recursively creates child Realms on the same Agent, and maps parse/runtime failures into the owning guest Realm without exposing `$262` through normal Realm construction or the public API. Existing immutable promotion tooling gains a second independently hashed H0 promotion source so T0 provenance stays intact while exact H0 paths enter the selected subset.

**Tech Stack:** ECMAScript modules, Node.js 20, existing jsjs Realm/Agent/evaluator APIs, existing portable Test262 runner, pinned Test262 revision `b363f29d3c43c626dc852744ad64a0b48a003693`, Chromium via Playwright, JavaScriptCore at `/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc`, JSON evidence artifacts, GitHub Actions, CodeQL, and `TZ=UTC`.

## Global Constraints

- Start from exact `origin/main` SHA `54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7`; the approved design commits are `e43426e`, `093a4b4`, and `a81688f`.
- The definitive H0 ledger is issue #76 comment `5347037600`, `H0.paths.txt`, SHA-256 `3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950`, exactly 135 roots / 267 variants.
- `$262` is Test262 embedding infrastructure only: never a normal guest global, public runtime export, `Realm` option, or adapter-specific semantic fork.
- Install host bindings for every root Realm, including raw script and raw module roots, before harness includes, async setup, or module evaluation.
- Raw roots still receive no strict prefix, `assert.js`, `sta.js`, declared includes, or source rewriting.
- `_FIXTURE` module dependencies execute in the prepared root module graph Realm and receive no independent Realm modification.
- `$262.createRealm` creates a same-Agent child, recursively installs the same host bindings, and returns the child's `$262`; `$262.global` is the exact child global.
- `$262.evalScript` accepts only primitive strings, performs no host `String` coercion, preserves persistent global declarations/completion values/thrown identity, and creates parse/type errors in its owning Realm.
- Keep `detachArrayBuffer`, `gc`, `agent`, `AbstractModuleSource`, and later hooks absent. Keep existing `print`/`$DONE` behavior on its current runner path.
- Do not widen `tools/test262/features.json` and do not infer promotion from a global feature tag.
- Never run full or broad upstream Test262 locally. Broad pinned coverage runs only in exact-head CI.
- Every task uses strict RED/GREEN TDD and ends with fresh specification-compliance and code-quality review/fix loops before commit.
- Do not use Claude Opus 5 for any review or implementation agent.

## File Structure

- Modify `tools/test262/runner.js`: require and order `installHostBindings(realm)` at the portable execution boundary.
- Modify `tools/test262/engine.js`: implement jsjs `$262` creation, same-Agent recursion, Realm-owned native functions, and error translation.
- Create `test/test262-host-bindings.test.js`: portable behavior/branding/ownership/raw probes.
- Modify `test/suites.js`: register the new portable suite for Node, Chromium, and JSC.
- Modify `test/test262-runner.test.js`, `test/test262-async.test.js`, `test/module-test262.test.js`, `test/ci/full-contract.test.js`, `test/ci/es2015-object-function-test262.test.js`, and `test/ci/es2015-syntax-test262.test.js`: explicitly migrate injected Test262 engine doubles and verify ordering.
- Create `test/ci/es2015-cross-realm-test262.test.js`: exact 135-root / 267-variant focused pinned Test262 gate.
- Create `tools/test262/es2015-h0-paths.json`: immutable H0 ledger for focused
  execution after taxonomy reclassification.
- Modify `package.json`, `tools/ci/pipeline.js`, and generated `.github/workflows/ci.yml`: add the focused H0 job to the ES2015 release gate without broad local execution.
- Modify `tools/test262/es2015-promotion.js`, `tools/test262/upstream-select.js`, `tools/test262/upstream-run.js`, and `tools/test262/es2015-audit.js`: support multiple independently immutable promotion manifests.
- Create `tools/test262/es2015-h0-promotion.json`: exact H0 metadata/include authorization and ledger provenance.
- Modify `test/node/es2015-taxonomy.test.js`, `test/node/upstream-select.test.js`, and `test/node/workflow-contract.test.js`: cover multiple promotion sources, overlap rejection, exact selection, and CI contracts.
- Regenerate `tools/test262/upstream-subset.json`, `tools/test262/es2015-audit-evidence.json`, `tools/test262/es2015-taxonomy.json`, `docs/test262-report.jsonl`, and the generated coverage block in `docs/conformance.md`.
- Update `docs/testing.md`, `docs/conformance.md`, and `README.md` only where the new focused command, selected totals, or harness-only boundary is directly documented.

---

### Task 1: Freeze the Exact H0 RED Corpus

**Files:**

- Create: `test/ci/es2015-cross-realm-test262.test.js`
- Create: `tools/test262/es2015-h0-paths.json`
- Modify: `package.json`
- Modify: `tools/ci/pipeline.js`
- Modify: `.github/workflows/ci.yml` through `npm run ci:generate`

**Interfaces:**

- Consumes: `tools/test262/es2015-taxonomy.json` with SHA-256
  `e7746b6da6038c1fda83e1e6cbecbe9fb3e7b97bdf89a311c0a3f34a686c7953`,
  `createJsjsTest262Engine()`, `runTest262()`, and the pinned Node Test262 host.
- Produces: `npm run test262:cross-realm`, an exact focused suite that asserts the H0 ledger identity before running it.

- [ ] **Step 1: Create the immutable path artifact from pre-H0 taxonomy**

Read `tools/test262/es2015-taxonomy.json`, select entries satisfying:

```js
entry.partition === 'core' &&
  entry.blocker === 'test262-cross-realm-host' &&
  !entry.path.startsWith('test/annexB/');
```

Sort paths in code-unit order and assert before execution:

```js
assertSame(paths.length, 135);
assertSame(
  entries.reduce((total, entry) => total + entry.variants, 0),
  267,
);
assertSame(
  createHash('sha256')
    .update(`${paths.join('\n')}\n`)
    .digest('hex'),
  '3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950',
);
```

Create `tools/test262/es2015-h0-paths.json` with this schema and the 135 derived
paths:

```js
const artifact = {
  version: 1,
  repository: 'https://github.com/tc39/test262.git',
  revision: 'b363f29d3c43c626dc852744ad64a0b48a003693',
  sourceTaxonomySha256:
    'e7746b6da6038c1fda83e1e6cbecbe9fb3e7b97bdf89a311c0a3f34a686c7953',
  ledgerSha256:
    '3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950',
  rootCount: 135,
  variantCount: 267,
  paths,
};
```

Serialize the artifact with all 135 paths into the committed JSON using
`apply_patch`. This immutable file, not the post-promotion taxonomy, becomes
the persistent focused-run source.

- [ ] **Step 2: Create the focused suite from the immutable artifact**

Parse and validate `es2015-h0-paths.json`, recompute its ledger hash, and run
only its paths with `createJsjsTest262Engine()`. Read the source taxonomy only
to derive the exact metadata feature names needed by these immutable paths; do
not require those entries to remain blocked after promotion and do not modify
`features.json`.

Make every Test262 failure observable:

```js
assertSame(summary.total, 267);
assertSame(summary.passed, 267);
assertSame(summary.failed, 0);
assertSame(summary.skipped, 0);
```

- [ ] **Step 3: Add the focused command and generated CI job**

Add:

```json
"test262:cross-realm": "TZ=UTC node test/run-node.js test/ci/es2015-cross-realm-test262.test.js"
```

Add `test/ci/es2015-cross-realm-test262.test.js` to
`test262:es2015-release`. Update the generated pipeline source with a focused
cross-Realm Test262 job/step using `npm run test262:cross-realm`, then run:

```bash
npm run ci:generate
npm run ci:check
```

- [ ] **Step 4: Materialize only the exact pinned checkout if absent**

```bash
git clone --filter=blob:none https://github.com/tc39/test262.git vendor/test262
git -C vendor/test262 checkout --detach b363f29d3c43c626dc852744ad64a0b48a003693
git -C vendor/test262 status --short
git -C vendor/test262 rev-parse HEAD
```

Expected: clean checkout and exact pinned SHA. Do not run `test262:upstream`.

- [ ] **Step 5: Run the focused suite and capture RED**

```bash
TZ=UTC npm run test262:cross-realm
```

Expected: FAIL for the H0 corpus because `$262` is not installed. The suite
must still prove exactly 135 roots / 267 variants and the exact ledger hash.

- [ ] **Step 6: Run fresh task reviews and fix the RED harness**

Dispatch one fresh specification reviewer and one fresh quality reviewer at
maximum supported effort using a non-Claude-Opus-5 model. Require reviewers to
check only the exact-corpus derivation, no-broad-run guarantee, feature
authorization scope, generated CI source, and expected RED cause. Fix every
valid finding and rerun the focused suite to confirm it remains RED for missing
host bindings rather than a corpus/setup defect.

- [ ] **Step 7: Commit the exact RED corpus**

```bash
git add tools/test262/es2015-h0-paths.json test/ci/es2015-cross-realm-test262.test.js package.json tools/ci/pipeline.js .github/workflows/ci.yml
git commit -m "Add exact H0 cross-Realm RED corpus" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Require and Order Host-Binding Preparation

**Files:**

- Modify: `tools/test262/runner.js:55-87,396-447`
- Modify: `tools/test262/engine.js`
- Modify: `test/test262-runner.test.js`
- Modify: `test/test262-async.test.js`
- Modify: `test/module-test262.test.js`
- Modify: `test/ci/full-contract.test.js`
- Modify: `test/ci/es2015-object-function-test262.test.js`
- Modify: `test/ci/es2015-syntax-test262.test.js`
- Modify: `test/node/workflow-contract.test.js`

**Interfaces:**

- Produces: required `Test262Engine.installHostBindings(realm): void`.
- Guarantees: one call after `createRealm()`, before any include/async/module
  hook; module evaluation receives the same prepared Realm.
- Compatibility rule: there is no silent omission. Every Test262 engine double
  explicitly installs bindings or delegates to `createJsjsTest262Engine()`.

- [ ] **Step 1: Write failing runner contract and ordering tests**

Add tests proving:

```js
let contractError = null;
try {
  await runTest262Suite({
    engine: { createRealm, evaluateScript },
    host,
    paths,
  });
} catch (error) {
  contractError = error;
}
assertSame(contractError instanceof TypeError, true);
```

For a tracing engine, require this order for script roots:

```text
createRealm
installHostBindings
evaluateScript:assert.js
evaluateScript:sta.js
evaluateScript:test
```

For async roots, require `installHostBindings` before `installDone`, includes,
test evaluation, and `runJobs`. For module and raw-module roots, assert one
created Realm, one installation, and that exact Realm is passed to
`evaluateModule`. For raw script roots, assert installation occurs but no
include evaluation or source rewriting occurs.

- [ ] **Step 2: Run focused portable tests to verify RED**

```bash
node test/run-node.js \
  test/test262-runner.test.js \
  test/test262-async.test.js \
  test/module-test262.test.js
```

Expected: FAIL because `installHostBindings` is absent/unordered.

- [ ] **Step 3: Implement the required runner contract**

Add the hook to the JSDoc type:

```js
installHostBindings(realm: any): void,
```

Create one private `assertTest262Engine(engine)` helper and invoke it at the
start of `runTest262`, `runTest262Suite`, and `runTest262File`, before path
resolution or host reads can conceal a bad injected contract:

```js
if (typeof options.engine?.installHostBindings !== 'function') {
  throw new TypeError(
    'Test262 execution requires an installHostBindings engine hook',
  );
}
```

In `runVariant`:

```js
const realm = engine.createRealm();
engine.installHostBindings(realm);
```

Keep this before the module/async branches. Do not create another Realm in
`runModuleVariant`, `runAsyncVariant`, or include evaluation.

- [ ] **Step 4: Migrate every injected Test262 engine explicitly**

Use `createJsjsTest262Engine()` for suites executing real jsjs Test262
semantics. For deliberately limited doubles, spread the production bridge and
override only the tested hook:

```js
const baseEngine = createJsjsTest262Engine();
const limitedEngine = {
  ...baseEngine,
  evaluateScript() {
    throw new Error('synthetic engine limitation');
  },
};
```

Where a pure runner-order double must not install jsjs bindings, define:

```js
installHostBindings(realm) {
  calls.push(['installHostBindings', realm]);
}
```

Keep the async “missing `installDone`/`runJobs`” test meaningful by supplying
`installHostBindings` while intentionally omitting only those async hooks.
Add the minimal temporary production implementation:

```js
installHostBindings() {},
```

Task 3 replaces this no-op with the Realm-owned host object. This keeps the
runner-contract task independently GREEN while the exact H0 corpus remains RED.

- [ ] **Step 5: Run GREEN and contract checks**

```bash
node test/run-node.js \
  test/test262-runner.test.js \
  test/test262-async.test.js \
  test/module-test262.test.js
npm run typecheck
```

Expected: PASS. `TZ=UTC npm run test262:cross-realm` remains RED because the
production installer is still intentionally a no-op at this task boundary.

- [ ] **Step 6: Run fresh specification and quality reviews**

Require reviewers to inspect every `runTest262`, `runTest262File`, and
`runTest262Suite` injected engine callsite, raw script/module behavior,
async/module ordering, fail-fast behavior, and absence of a second module Realm.
Fix findings and repeat Step 5.

- [ ] **Step 7: Commit the runner contract**

```bash
git add tools/test262/runner.js tools/test262/engine.js test/test262-runner.test.js test/test262-async.test.js test/module-test262.test.js test/ci/full-contract.test.js test/ci/es2015-object-function-test262.test.js test/ci/es2015-syntax-test262.test.js test/node/workflow-contract.test.js
git commit -m "Require Test262 host binding preparation" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Implement Realm-Owned `$262`

**Files:**

- Create: `test/test262-host-bindings.test.js`
- Modify: `test/suites.js`
- Modify: `tools/test262/engine.js`

**Interfaces:**

- Consumes: `createRealm({ agent })`, `evaluateScript(realm, source)`,
  `EngineObject`, `GuestErrorSignal`, and `ThrowSignal`.
- Produces: `createJsjsTest262Engine().installHostBindings(realm)`.
- Returns from private installation: the exact Realm-owned `$262` object, used
  recursively by `createRealm`.

- [ ] **Step 1: Write portable branding, descriptor, and isolation RED tests**

Register the new suite in `test/suites.js`. Prove:

```js
const plain = createRealm();
assertSame(evaluateScript(plain, 'typeof $262').value, 'undefined');

const engine = createJsjsTest262Engine();
const realm = engine.createRealm();
engine.installHostBindings(realm);
```

Inside the prepared Realm assert:

```js
Object.prototype.toString.call($262) === '[object Object]';
Object.getPrototypeOf($262) === Object.prototype;
Object.getPrototypeOf($262.createRealm) === Function.prototype;
Object.getPrototypeOf($262.evalScript) === Function.prototype;
$262.global === this;
```

Assert global `$262` is writable/configurable/non-enumerable; host object
`global`, `createRealm`, and `evalScript` are writable/enumerable/configurable;
function names/lengths are `createRealm`/`0` and `evalScript`/`1`, with
non-writable/non-enumerable/configurable descriptors. Assert absent properties:
`detachArrayBuffer`, `gc`, `agent`, and `AbstractModuleSource`.

- [ ] **Step 2: Write same-Agent recursion and ownership RED tests**

Prove a child has distinct `$262`, global, `%Object%`, `%Function%`, and native
function prototypes, while sharing:

```js
Symbol.iterator === child.global.Symbol.iterator;
Symbol.for('h0') === child.global.Symbol.for('h0');
```

Assert `child.createRealm()` recursively returns a grandchild host object and
that each `.global.$262` is the exact returned object.

- [ ] **Step 3: Write `evalScript` RED tests**

Cover:

```js
$262.evalScript('var persistent = 1; persistent') === 1;
$262.evalScript('persistent += 1; persistent') === 2;
child.evalScript('var childOnly = 3; childOnly') === 3;
typeof childOnly === 'undefined';
```

Throw a guest object and assert identity survives:

```js
var marker = {};
try {
  $262.evalScript('throw marker');
} catch (error) {
  assert.sameValue(error, marker);
}
```

Assert malformed source throws an owning-Realm `SyntaxError`; missing,
`undefined`, Symbol, number, boolean, null, and object inputs throw an
owning-Realm `TypeError` before parsing/coercion. Give the object a throwing
`toString`/`valueOf` and assert neither is called.

For both parent and child host objects, execute `throw new Error("owned")` and
malformed source through that object's `evalScript`. Assert each error is an
instance of that host object's Realm-local `Error`/`SyntaxError` constructor and
not the caller Realm's corresponding constructor.

Add a runner-level raw fixture:

```js
/*---
description: raw roots receive host bindings but no harness
flags: [raw]
---*/
if (typeof $262 !== 'object') throw 'missing host';
if (typeof assert !== 'undefined') throw 'harness leaked';
```

Add a raw-module fixture with `flags: [raw, module]` and the same checks to the
module ordering tests.

- [ ] **Step 4: Run RED**

```bash
node test/run-node.js test/test262-host-bindings.test.js test/test262-runner.test.js
```

Expected: FAIL because the production installer does not construct `$262`.

- [ ] **Step 5: Implement the private recursive installer**

In `tools/test262/engine.js`, construct:

```js
const host = new EngineObject(realm.intrinsics.objectPrototype);
```

Define a local `defineHostProperty(target, name, value)` helper using writable,
enumerable, configurable data descriptors. Define the Realm-global `$262`
property separately as writable/configurable/non-enumerable.

Create `createRealm` with:

```js
const child = createRealm({ agent: realm.agent });
return installHostBindings(child);
```

Create `evalScript` with primitive-string validation. Catch only host
`SyntaxError` from parsing and throw
`new GuestErrorSignal('SyntaxError', error.message)`. Re-throw all other host
errors. Convert a `{ type: 'throw', value }` completion to
`new ThrowSignal(value)` and return normal completion values unchanged.

- [ ] **Step 6: Run portable GREEN on all three hosts**

```bash
node test/run-node.js test/test262-host-bindings.test.js test/test262-runner.test.js test/module-test262.test.js
npm run test:browser -- test/test262-host-bindings.test.js test/test262-runner.test.js test/module-test262.test.js
PATH="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" \
  npm run test:jsc
```

Expected: PASS with identical semantics.

- [ ] **Step 7: Run the exact H0 corpus GREEN**

```bash
TZ=UTC npm run test262:cross-realm
```

Expected: exactly 135 roots / 267 variants, all passed, none skipped. If an
exact path reveals a cross-Realm host defect, add the smallest portable probe
first, observe RED, then fix only that defect. Do not repair unrelated M0/B0 or
later-feature failures in this PR.

- [ ] **Step 8: Run fresh specification and quality reviews**

Use separate maximum-effort non-Claude-Opus-5 reviewers. Require explicit
checks for public API leakage, same-Agent ownership, child function prototypes,
descriptors/branding, raw/module behavior, host String leakage, swallowed host
failures, broad catches, and excluded hooks. Fix and repeat Steps 6-7.

- [ ] **Step 9: Commit the host implementation**

```bash
git add tools/test262/engine.js test/test262-host-bindings.test.js test/suites.js test/test262-runner.test.js
git commit -m "Implement harness-only Test262 cross-Realm bindings" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Promote H0 with Independent Provenance

**Files:**

- Create: `tools/test262/es2015-h0-promotion.json`
- Modify: `tools/test262/es2015-promotion.js`
- Modify: `tools/test262/upstream-select.js`
- Modify: `tools/test262/upstream-run.js`
- Modify: `tools/test262/es2015-audit.js`
- Modify: `test/node/es2015-taxonomy.test.js`
- Modify: `test/node/upstream-select.test.js`
- Modify: `test/node/workflow-contract.test.js`

**Interfaces:**

- Preserves: existing T0 manifest and group
  `es2015/audit-passing-promotion` byte-for-byte.
- Produces: a second descriptor for
  `tools/test262/es2015-h0-promotion.json` and group
  `es2015/h0-cross-realm`.
- Produces: combined exact-path authorization that rejects duplicate paths
  across manifests and validates each source taxonomy/ledger independently.
- Produces:
  `buildEs2015Promotion({ sourceTaxonomyText, ledgerText, pin, inventory })`
  for deterministic manifest generation.

- [ ] **Step 1: Write multiple-promotion RED tests**

Add fixture manifests proving:

- each manifest validates its own repository, revision, source taxonomy hash,
  ledger hash, counts, metadata, and include closure;
- combined paths are code-unit sorted and unique;
- overlap between T0 and H0 is rejected;
- each subset group must exactly equal its matching manifest;
- a missing manifest/group or foreign path fails closed;
- authorization returns dependencies only for the exact manifest entry; and
- generated taxonomy records a SHA-256 keyed by each promotion file rather
  than replacing T0 provenance.

- [ ] **Step 2: Run RED**

```bash
node test/run-node.js \
  test/node/es2015-taxonomy.test.js \
  test/node/upstream-select.test.js \
  test/node/workflow-contract.test.js
```

Expected: FAIL because tooling supports one promotion manifest/group.

- [ ] **Step 3: Generalize immutable promotion sources**

Define:

```js
export const ES2015_PROMOTION_SOURCES = Object.freeze([
  Object.freeze({
    file: 'tools/test262/es2015-promotion.json',
    group: 'es2015/audit-passing-promotion',
  }),
  Object.freeze({
    file: 'tools/test262/es2015-h0-promotion.json',
    group: 'es2015/h0-cross-realm',
  }),
]);
```

Keep the existing v1 manifest schema. Make parser errors name the descriptor's
file. Add plural helpers that validate all sources, reject overlap, merge
groups, and provide exact per-path feature authorization. Do not mutate or
re-hash the T0 manifest. Implement the pure builder as:

```js
export function buildEs2015Promotion(options) {
  const paths = parseLedger(options.ledgerText);
  const roots = new Map(options.inventory.map((root) => [root.path, root]));
  const entries = paths.map((path) => {
    const root = roots.get(path);
    if (root === undefined || root.metadata === null) {
      throw new Es2015PromotionError(`promotion inventory is missing ${path}`);
    }
    return {
      path,
      variants: root.variants,
      features: sortStrings([...root.metadata.features]),
      includeFeatures: sortStrings([...root.includeFeatures]),
    };
  });
  return serializeEs2015Promotion({
    pin: options.pin,
    sourceTaxonomySha256: sha256(options.sourceTaxonomyText),
    ledgerSha256: sha256(options.ledgerText),
    entries,
  });
}
```

The real implementation must reuse existing validation helpers rather than
duplicating their rules. Extend the audit CLI with
`--write-promotion=tools/test262/es2015-h0-promotion.json`; require it together
with `--paths-manifest=tools/test262/es2015-h0-paths.json`, write no execution
evidence in this mode, and reject a destination not named by
`ES2015_PROMOTION_SOURCES`.

- [ ] **Step 4: Generate the exact H0 manifest from pre-H0 evidence**

Generate one code-unit-sorted entry per path from the committed Task 1
manifest and `buildEs2015Inventory`, recording `variants`, normalized root
`features`, and transitive `includeFeatures`:

```bash
TZ=UTC node tools/test262/es2015-audit.js \
  --paths-manifest=tools/test262/es2015-h0-paths.json \
  --write-promotion=tools/test262/es2015-h0-promotion.json
```

The output must contain:

```json
{
  "version": 1,
  "repository": "https://github.com/tc39/test262.git",
  "revision": "b363f29d3c43c626dc852744ad64a0b48a003693",
  "sourceTaxonomySha256": "e7746b6da6038c1fda83e1e6cbecbe9fb3e7b97bdf89a311c0a3f34a686c7953",
  "ledgerSha256": "3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950",
  "rootCount": 135,
  "variantCount": 267,
  "entries": []
}
```

Validate live pinned metadata/include closure and independently recompute the
source-taxonomy digest before accepting the manifest.

- [ ] **Step 5: Wire selection, execution, audit, and report synchronization**

Update `upstream-select.js` to load both manifests and emit both exact groups.
Update `upstream-run.js` to validate/authorize all promotion sources. Update
`es2015-audit.js` so focused execution identifies the target promotion file,
keeps T0 evidence, removes H0 blocker entries only after all 267 variants pass,
and records per-file promotion hashes in the taxonomy artifact.

Use an explicit option:

```text
--promotion-file=tools/test262/es2015-h0-promotion.json
```

with `--paths-manifest=tools/test262/es2015-h0-paths.json` and
`--write-execution`, rejecting an unknown promotion source.

- [ ] **Step 6: Run GREEN tooling tests**

```bash
node test/run-node.js \
  test/node/es2015-taxonomy.test.js \
  test/node/upstream-select.test.js \
  test/node/workflow-contract.test.js
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Run fresh specification and quality reviews**

Require reviewers to verify immutable T0 provenance, exact H0 hash/counts,
duplicate rejection, no global feature widening, deterministic UTC generation,
and downstream compatibility. Fix and repeat Step 6.

- [ ] **Step 8: Commit the promotion tooling**

```bash
git add tools/test262/es2015-h0-promotion.json tools/test262/es2015-promotion.js tools/test262/upstream-select.js tools/test262/upstream-run.js tools/test262/es2015-audit.js test/node/es2015-taxonomy.test.js test/node/upstream-select.test.js test/node/workflow-contract.test.js
git commit -m "Add exact H0 Test262 promotion provenance" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Reclassify and Publish Deterministic Evidence

**Files:**

- Modify: `tools/test262/upstream-subset.json`
- Modify: `tools/test262/es2015-audit-evidence.json`
- Modify: `tools/test262/es2015-taxonomy.json`
- Modify: `docs/test262-report.jsonl`
- Modify: generated coverage block in `docs/conformance.md`
- Modify: `docs/testing.md`
- Modify: `README.md` only if its command table needs the focused H0 command

**Interfaces:**

- Consumes: exact H0 manifest and passing focused execution.
- Produces: selected/passing H0 roots with zero core
  `test262-cross-realm-host` blockers and balanced taxonomy totals.

- [ ] **Step 1: Materialize the exact ledger outside the repository**

```bash
test "$(jq '.paths | length' tools/test262/es2015-h0-paths.json)" = 135
jq -r '.paths[]' tools/test262/es2015-h0-paths.json | shasum -a 256
```

Expected: `135` and
`3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950`.

- [ ] **Step 2: Regenerate exact selection and focused execution evidence**

```bash
TZ=UTC npm run test262:select
TZ=UTC node tools/test262/es2015-audit.js \
  --promotion-file=tools/test262/es2015-h0-promotion.json \
  --paths-manifest=tools/test262/es2015-h0-paths.json \
  --write-execution
```

Expected: all 267 exact variants pass; the command aborts without writing
success-shaped evidence if one fails/skips.

- [ ] **Step 3: Remove only resolved H0 blockers and regenerate taxonomy/report**

Delete the exact 135 H0 keys from `blockers` only after Step 2 succeeds, then:

```bash
TZ=UTC npm run test262:es2015:sync-promoted-report
TZ=UTC npm run test262:es2015:audit
TZ=UTC npm run test262:es2015:audit:check
TZ=UTC npm run test262:select:check
```

Assert with `jq`:

```bash
jq '[.classifications[] | select(.partition == "core" and .blocker == "test262-cross-realm-host")] | {roots:length, variants:(map(.variants) | add // 0)}' tools/test262/es2015-taxonomy.json
```

Expected: `{"roots":0,"variants":0}`. Also assert selected-and-passing core is
exactly 19,738 roots / 37,572 variants, blocked core is exactly 4,510 roots /
8,848 variants, total core remains 24,250 / 46,424, and no other blocker count
changes except paths genuinely reclassified by this exact promotion.

- [ ] **Step 4: Update direct documentation**

Document the focused command, harness-only boundary, exact H0 ledger/hash, and
new selected/taxonomy totals. State that `$262` remains absent from public
runtime APIs and normal Realm globals, and that B0 owns detachment.

- [ ] **Step 5: Run drift and focused gates**

```bash
TZ=UTC npm run test262:cross-realm
TZ=UTC npm run test262:es2015:audit:check
TZ=UTC npm run test262:select:check
npm run test262:fixtures
npm run ci:check
```

Expected: PASS. Do not run `npm run test262:upstream` or
`npm run test262:upstream:check` locally.

- [ ] **Step 6: Run fresh evidence reviews**

Use fresh maximum-effort non-Claude-Opus-5 reviewers for specification and
quality. Require exact arithmetic, ledger/source hashes, T0 preservation,
selected evidence completeness, generated report consistency, and zero
unintended blocker movement. Fix and rerun Steps 3-5.

- [ ] **Step 7: Commit deterministic evidence**

```bash
git add tools/test262/upstream-subset.json tools/test262/es2015-audit-evidence.json tools/test262/es2015-taxonomy.json docs/test262-report.jsonl docs/conformance.md docs/testing.md README.md
git commit -m "Promote exact cross-Realm Test262 roots" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Run Final Portable, Static, Invariant, and Benchmark Gates

**Files:**

- Modify only files required by valid gate failures caused by this branch.

**Interfaces:**

- Produces: a review-ready exact head with no known local regression.

- [ ] **Step 1: Run targeted portable suites on Node, Chromium, and JSC**

```bash
node test/run-node.js \
  test/test262-host-bindings.test.js \
  test/test262-runner.test.js \
  test/test262-async.test.js \
  test/module-test262.test.js
npm run test:browser -- \
  test/test262-host-bindings.test.js \
  test/test262-runner.test.js \
  test/test262-async.test.js \
  test/module-test262.test.js
PATH="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" \
  npm run test:jsc
```

- [ ] **Step 2: Run repository static and invariant gates**

```bash
npm run typecheck
npm run lint
npm run format
npm run vendor:check
npm run ci:check
npm run ci:contract
TZ=UTC npm run test262:es2015:audit:check
TZ=UTC npm run test262:select:check
```

- [ ] **Step 3: Run portable regression and benchmark smoke**

```bash
npm run test:node
npm run test:browser
PATH="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" npm run test:jsc
npm run benchmark:smoke
TZ=UTC npm run test262:cross-realm
```

Do not run broad upstream Test262.

- [ ] **Step 4: Request final maximum review**

Run a fresh maximum-effort code review with a non-Claude-Opus-5 model over the
entire branch diff against `origin/main`. Then run a separate security review
only if the reviewer or diff identifies an exploitable host-boundary concern.
Fix all valid high-confidence findings and repeat Steps 1-3.

- [ ] **Step 5: Commit gate fixes if needed**

```bash
git add -u
git diff --cached --check
git commit -m "Address cross-Realm harness review findings" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

Skip this commit when no files changed.

---

### Task 7: Push, Review Exact-Head CI/CodeQL, Merge, and Publish Closure

**Files:**

- No production files unless exact-head CI finds a branch-caused defect.
- Update GitHub issue #76 and roadmap #70 after merge.

**Interfaces:**

- Produces: one focused PR, squash merge, deleted branch, closed #76, updated
  roadmap/downstream dependency counts, and exact evidence links.

- [ ] **Step 1: Verify final branch identity and push**

```bash
git status --short
git rev-parse HEAD
git --no-pager log --oneline origin/main..HEAD
git push -u origin HEAD
```

Expected: clean worktree and only #76 commits.

- [ ] **Step 2: Open one focused PR**

Create a PR titled `Implement portable harness-only Test262 cross-Realm support`.
Include:

- `Fixes #76`;
- exact base/head SHAs;
- H0 ledger hash and 135/267 result;
- host-interface/non-goal summary;
- Node/Chromium/JSC/focused UTC/taxonomy/static/benchmark evidence; and
- explicit statement that broad Test262 was not run locally and is delegated to
  exact-head CI.

- [ ] **Step 3: Read exact-head CI synchronously**

Record the PR head SHA, then inspect required runs with 10-minute synchronous
reads:

```bash
PR_NUMBER=$(gh pr view --repo yoonbuck/jsjs --json number --jq .number)
EXACT_HEAD_SHA=$(git rev-parse HEAD)
gh pr checks "$PR_NUMBER" --repo yoonbuck/jsjs --watch --interval 10
gh run list --repo yoonbuck/jsjs --commit "$EXACT_HEAD_SHA" --limit 20
CI_RUN_ID=$(gh run list --repo yoonbuck/jsjs --commit "$EXACT_HEAD_SHA" --json databaseId,workflowName --jq '.[] | select(.workflowName == "CI") | .databaseId' | head -n 1)
gh run watch "$CI_RUN_ID" --repo yoonbuck/jsjs --interval 10 --exit-status
```

Confirm CI includes Node, Chromium, JSC, focused H0, broad pinned Test262,
taxonomy drift, invariants, and benchmark smoke. If a branch-caused failure
appears, use systematic debugging, add RED coverage, fix, rerun local targeted
gates, push, and restart exact-head evidence collection.

- [ ] **Step 4: Run/read exact-head CodeQL**

Inspect GitHub's configured default CodeQL setup first. The preceding T0 merge
produced both exact-head and exact-main CodeQL runs through repository setup, so
do not add a duplicate workflow:

```bash
gh api repos/yoonbuck/jsjs/code-scanning/default-setup
gh workflow list --repo yoonbuck/jsjs
gh run list --repo yoonbuck/jsjs --commit "$EXACT_HEAD_SHA" --limit 20
CODEQL_RUN_ID=$(gh run list --repo yoonbuck/jsjs --commit "$EXACT_HEAD_SHA" --json databaseId,workflowName --jq '.[] | select(.workflowName == "CodeQL") | .databaseId' | head -n 1)
test -n "$CODEQL_RUN_ID"
gh run watch "$CODEQL_RUN_ID" --repo yoonbuck/jsjs --interval 10 --exit-status
```

Do not merge until the successful CodeQL run's head SHA equals the PR head SHA.
If default setup is disabled or produces no PR-head run, stop and repair the
repository's configured CodeQL setup rather than weakening this gate.

- [ ] **Step 5: Resolve review threads and squash merge**

Address every valid review thread in code, rerun affected gates, push, and
refresh exact-head CI/CodeQL. When clean:

```bash
gh pr merge "$PR_NUMBER" --repo yoonbuck/jsjs --squash --delete-branch
```

- [ ] **Step 6: Verify exact-main evidence**

```bash
git fetch origin main
git rev-parse origin/main
gh run list --repo yoonbuck/jsjs --branch main --limit 20
```

Confirm the squash commit is on main. Read post-merge CodeQL for that exact main
SHA if repository policy/setup emits it.

- [ ] **Step 7: Close/update roadmap evidence**

Publish on #76:

- squash SHA;
- reviewed PR head SHA;
- exact CI and CodeQL run IDs/URLs;
- exact ledger hash and 135/267 passing/reclassification result;
- post-merge taxonomy SHA-256 and balanced totals;
- `$262` non-leakage and B0/non-goal statements.

Close #76 if `Fixes #76` did not do so automatically. Update #70 selected/core
counts and H0 status. Update downstream issue counts/dependencies only from the
post-merge taxonomy, explicitly naming newly unblocked issues. Preserve closed
#74 as resolved dependency history.

- [ ] **Step 8: Report completion to the project coordinator**

Send the coordinator one concise message with PR URL, squash SHA, exact CI and
CodeQL runs, taxonomy/ledger hashes, updated issue URLs, and newly unblocked
roadmap nodes.
