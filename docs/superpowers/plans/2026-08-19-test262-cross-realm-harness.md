# Portable Test262 Cross-Realm Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Test262 runner install a portable, harness-only, same-Agent `$262.createRealm`/`$262.evalScript` host interface and make issue #76's exact 135 roots / 267 variants reach selector-zero through generated complete-root pass or reviewed reassignment dispositions.

**Architecture:** The portable runner requires one explicit `installHostBindings(realm)` engine hook and invokes it once immediately after creating every root Realm, including raw script and raw module roots. The jsjs Test262 engine bridge owns the concrete `$262` object, recursively creates child Realms on the same Agent, and maps parse/runtime failures into the owning guest Realm without exposing `$262` through normal Realm construction or the public API. Existing immutable tooling gains generated H0 root dispositions, a pass-only promotion manifest, and atomic reassignment ledgers so T0 provenance stays intact while the H0 selector reaches zero without claiming all roots semantically pass.

**Tech Stack:** ECMAScript modules, Node.js 20, existing jsjs Realm/Agent/evaluator APIs, existing portable Test262 runner, pinned Test262 revision `b363f29d3c43c626dc852744ad64a0b48a003693`, Chromium via Playwright, JavaScriptCore at `/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc`, JSON evidence artifacts, GitHub Actions, CodeQL, and `TZ=UTC`.

## Global Constraints

- Start from exact `origin/main` SHA `54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7`; the approved design commits are `e43426e`, `093a4b4`, and `a81688f`.
- The definitive H0 ledger is issue #76 comment `5347037600`, `H0.paths.txt`, SHA-256 `3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950`, exactly 135 roots / 267 variants.
- Exact H0 execution evidence must cover every root and every required variant exactly once. A root receives exactly one generated disposition: `passed` only for complete-root pass evidence, or `reassigned` only when all failed variants map to the same reviewed existing roadmap owner under taxonomy precedence. Reassignment permits all-fail and mixed pass/fail roots only with no skipped, malformed, missing, duplicate, or unexplained variant; a mixed root retains passed-variant evidence and moves atomically with its full root/variant count.
- `$262` is Test262 embedding infrastructure only: never a normal guest global, public runtime export, `Realm` option, or adapter-specific semantic fork.
- Install host bindings for every root Realm, including raw script and raw module roots, before harness includes, async setup, or module evaluation.
- Raw roots still receive no strict prefix, `assert.js`, `sta.js`, declared includes, or source rewriting.
- `_FIXTURE` module dependencies execute in the prepared root module graph Realm and receive no independent Realm modification.
- `$262.createRealm` creates a same-Agent child, recursively installs the same host bindings, and returns the child's `$262`; `$262.global` is the exact child global.
- `$262.evalScript` accepts only primitive strings, performs no host `String` coercion, preserves persistent global declarations/completion values/thrown identity, and creates parse/type errors in its owning Realm.
- Keep `detachArrayBuffer`, `gc`, `agent`, `AbstractModuleSource`, and later hooks absent. Keep existing `print`/`$DONE` behavior on its current runner path.
- Do not widen `tools/test262/features.json` and do not infer promotion from a global feature tag. Partially passing roots are never promoted; missing, skipped, duplicate, different-primary-owner, unknown-owner, mismatched, or unexplained evidence fails closed.
- Keep Task 3 implementation commit `c52823113ec704b09ed9850f698d1d36bf479c48` unchanged. Do not implement downstream runtime semantics in this branch to make unrelated H0 failures pass.
- Never run `npm run ci:contract`, `npm run test262:upstream`,
  `npm run test262:upstream:check`, or any wrapper that invokes broad upstream
  Test262 locally. The exact 135-path H0 corpus is the only local Test262
  execution; broad pinned coverage runs only in exact-head CI.
- Record the original issue baseline
  `54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7` separately from the final PR
  merge base after moving-main reconciliation.
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
- Create `tools/test262/es2015-h0-baseline.json`: compact final-base taxonomy
  identity for reproducible default H0 delta proof without session artifacts.
- Modify `package.json`, `tools/ci/pipeline.js`, and generated `.github/workflows/ci.yml`: add the focused H0 job to the ES2015 release gate without broad local execution.
- Modify `tools/test262/es2015-promotion.js`, `tools/test262/upstream-select.js`, `tools/test262/upstream-run.js`, and `tools/test262/es2015-audit.js`: support generated H0 dispositions, pass-only promotion manifests, exact selection, and reviewed reassignment.
- Create `tools/test262/es2015-h0-owner-map.json`: reviewed mapping/allowlist from normalized H0 failure signatures to existing roadmap owners only.
- Create `tools/test262/es2015-h0-disposition.json`: deterministic root-level dispositions covering every immutable H0 root once and every required variant once.
- Create `tools/test262/es2015-h0-owner-deltas.json`: deterministic downstream owner path/count/hash deltas generated from the disposition.
- Create `tools/test262/es2015-h0-promotion.json`: exact H0 pass-only metadata/include authorization and ledger provenance derived only from complete-root `passed` dispositions.
- Modify `test/ci/es2015-cross-realm-test262.test.js`: migrate the focused gate from historical all-pass RED to exact evidence/disposition validation without requiring all variants to pass.
- Modify `test/node/es2015-taxonomy.test.js`, `test/node/upstream-select.test.js`, and `test/node/workflow-contract.test.js`: cover disposition validation, partial-promotion rejection, exact selection, reassignment, and CI contracts.
- Regenerate `tools/test262/upstream-subset.json`, `tools/test262/es2015-audit-evidence.json`, `tools/test262/es2015-taxonomy.json`, `docs/test262-report.jsonl`, and the generated coverage block in `docs/conformance.md`.
- Update `docs/testing.md`, `docs/conformance.md`, and `README.md` only where the new focused command, generated passed/reassigned counts, selector-zero result, or harness-only boundary is directly documented.

## H0 Artifact Schemas

All H0 artifacts are deterministic UTF-8 JSON with stable key order and
code-unit-sorted arrays. The exact artifact paths are:

- `tools/test262/es2015-h0-owner-map.json` — reviewed mapping/allowlist to
  existing roadmap owners only. Content: `version`, pinned
  `repository`/`revision`, and owner records with roadmap code, issue number,
  existing taxonomy blocker, normalized primary failure signatures/path rules,
  and allowed secondary evidence.
- `tools/test262/es2015-h0-disposition.json` — generated exact root/variant
  outcomes. Content: `version`, pin, source ledger/taxonomy/evidence/owner-map
  hashes, raw execution passed/failed variant counts, complete-pass
  root/promoted-variant counts, full reassigned root/variant counts, generated
  all-fail/mixed counts, and code-unit-sorted root entries. Each root has path,
  required variants, explicit per-variant execution outcomes and normalized
  failure signatures, exactly one `passed` or `reassigned` root disposition,
  primary existing owner for reassigned roots, and secondary evidence.
- `tools/test262/es2015-h0-owner-deltas.json` — generated deterministic
  downstream path/count/hash deltas. Content: source/disposition/promotion
  identities, taxonomy/evidence/owner-map provenance hashes, H0 removal, and
  code-unit-sorted owner entries with full paths, path and per-owner
  variant-evidence hashes, root count, and full variant count.
- `tools/test262/es2015-h0-promotion.json` — versioned pass-only promotion.
  Content: immutable H0 source fields `h0LedgerSha256`, `h0RootCount`,
  `h0VariantCount`; `dispositionSha256`; promoted subset fields
  `promotedLedgerSha256`, `promotedRootCount`, `promotedVariantCount`; and
  code-unit-sorted complete-root entries whose disposition is `passed`. This H0
  schema is distinct from the existing v1 promotion schema; preserve T0's v1
  manifest byte-for-byte.
- `tools/test262/es2015-h0-baseline.json` — compact final-base reconciliation
  identity. Content: final base commit, pinned Test262 repository/revision,
  full final-base taxonomy SHA-256, immutable H0 ledger/counts, canonical H0 and
  non-H0 classification hashes, and a canonical balanced partition/status
  summary. Default audit checks consume this artifact; an explicit full baseline
  snapshot must validate against it before generation or checking proceeds.

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

Make every Test262 failure observable. This initial all-pass assertion is the
historical Task 1 RED gate for the pre-host-binding corpus only; Task 4 replaces
it with disposition-aware focused validation and Tasks 4-5 own the non-all-pass
selector-zero migration.

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

- [ ] **Step 6: Run targeted portable GREEN**

```bash
node test/run-node.js test/test262-host-bindings.test.js test/test262-runner.test.js test/module-test262.test.js
npm run test:browser -- test/test262-host-bindings.test.js test/test262-runner.test.js test/module-test262.test.js
```

Expected: PASS. JSC has no focused-suite argument path, so defer its one full
local execution to Task 6 instead of redundantly running the entire portable
registry here.

- [ ] **Step 7: Run the exact H0 corpus for complete evidence**

```bash
TZ=UTC npm run test262:cross-realm
```

Expected after Task 3 commit `c52823113ec704b09ed9850f698d1d36bf479c48`: the
immutable corpus executes exactly 135 roots / 267 variants with no missing or
skipped variants, and no failure is caused by missing `$262` host bindings or
harness leakage. The observed baseline is 40 roots / 79 variants passed and 95
roots / 188 variants still blocked by reviewed downstream runtime gaps. If an
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

### Task 4: Generate H0 Dispositions and Pass-Only Promotion

**Files:**

- Create: `tools/test262/es2015-h0-owner-map.json`
- Create: `tools/test262/es2015-h0-disposition.json`
- Create: `tools/test262/es2015-h0-owner-deltas.json`
- Create: `tools/test262/es2015-h0-promotion.json`
- Modify: `tools/test262/es2015-promotion.js`
- Modify: `tools/test262/upstream-select.js`
- Modify: `tools/test262/upstream-run.js`
- Modify: `tools/test262/es2015-audit.js`
- Modify: `test/ci/es2015-cross-realm-test262.test.js`
- Modify: `test/node/es2015-taxonomy.test.js`
- Modify: `test/node/upstream-select.test.js`
- Modify: `test/node/workflow-contract.test.js`

**Interfaces:**

- Preserves: existing T0 manifest and group
  `es2015/audit-passing-promotion` byte-for-byte.
- Produces: reviewed `tools/test262/es2015-h0-owner-map.json`, mapping
  normalized primary failure signatures/path rules to existing roadmap owners
  only, with allowed secondary evidence.
- Produces: deterministic `tools/test262/es2015-h0-disposition.json` covering
  every immutable H0 root once and every required variant once.
- Produces: one generated disposition per root:
  - `passed` only when the complete required variant set passed; or
  - `reassigned` only when every required variant is present exactly once,
    no variant is skipped, malformed, or unexplained, and every failed variant
    has a concrete reviewed signature mapping to the same named existing
    roadmap blocker under taxonomy precedence.
- Preserves secondary prerequisite/failure evidence and passed-variant evidence
  on reassignment records without replacing the single primary owner; a mixed
  root moves once with its full root/variant count and never promotes separately.
- Produces: deterministic `tools/test262/es2015-h0-owner-deltas.json` for
  downstream owner issues and #70, with full paths, path hashes, provenance,
  and deterministic per-owner variant-evidence hashes.
- Produces: `tools/test262/es2015-h0-promotion.json` and group
  `es2015/h0-cross-realm-passed`, generated only from complete-root `passed`
  dispositions, with independent `h0LedgerSha256`/`h0RootCount`/
  `h0VariantCount`, `dispositionSha256`, and `promotedLedgerSha256`/
  `promotedRootCount`/`promotedVariantCount` identities.
- Produces pure helpers:
  - `buildEs2015H0Disposition({ pathsManifestText, baselineTaxonomyText, executionEvidenceText, ownerMapText, pin, inventory })`;
  - `buildEs2015Promotion({ sourceTaxonomyText, dispositionText, pin, inventory })`;
  - `assertExactH0DispositionDelta({ before, after, disposition, promotion, ownerDeltas })`.

- [ ] **Step 1: Write disposition and partial-promotion RED tests**

Add fixture evidence proving:

- the reviewed owner-map artifact validates repository, revision, code-unit order,
  existing roadmap owner codes/issues/blockers, normalized primary failure
  signatures/path rules, and allowed secondary evidence;
- the disposition artifact validates its repository, revision, ledger hash,
  root count, variant count, code-unit path order, source taxonomy/evidence/
  owner-map hashes, and exact per-root variant sets;
- duplicate roots, duplicate variants, missing roots, missing variants, variant
  mismatches, and foreign paths fail closed;
- skipped, missing, duplicate, malformed, foreign, unknown-owner,
  different-primary-owner, unexplained-signature, and unrelated-blocker movement
  evidence fails closed, while reviewed one-owner mixed pass/fail evidence is
  retained and reassigned atomically;
- a reviewed owner allowlist maps concrete failure signatures only to existing
  roadmap blockers; no new catch-all blocker is accepted;
- each reassigned root has one primary next blocker under taxonomy precedence
  while retaining secondary evidence;
- the focused gate requires exact immutable ledger/hash, exactly 267 complete
  variant records, zero skipped/missing/duplicate/foreign records, no missing
  `$262` or harness leakage, and every failure mapped by reviewed disposition
  evidence; it must not require all variants to pass;
- only complete-root `passed` dispositions are eligible for promotion, with
  independent immutable H0 source identity, disposition identity, and promoted
  subset identity;
- the observed pre-rebase evidence can express 79 raw passed variants / 188 raw
  failed variants, 40 complete-pass roots / 78 promoted variants, 94 all-fail
  roots / 187 full variants, and 1 mixed root / 2 full variants without
  hard-coding those as final totals;
- generated taxonomy records disposition and promotion SHA-256 values without
  replacing T0 provenance; and
- whole-tree/core denominators remain balanced while selected/reassigned totals
  are derived from generated root/variant sets.

- [ ] **Step 2: Run RED**

```bash
node test/run-node.js \
  test/ci/es2015-cross-realm-test262.test.js \
  test/node/es2015-taxonomy.test.js \
  test/node/upstream-select.test.js \
  test/node/workflow-contract.test.js
```

Expected: FAIL because tooling has no H0 disposition model, no reviewed owner
mapping, no disposition-aware focused gate, no owner-delta artifact, and no
pass-only H0 promotion source.

- [ ] **Step 3: Implement generated dispositions and reviewed owner mapping**

Define the H0 disposition source descriptor alongside immutable promotion
sources. The generator must read exact execution evidence through
`buildEs2015H0Disposition({ pathsManifestText, baselineTaxonomyText, executionEvidenceText, ownerMapText, pin, inventory })`,
recompute the H0 ledger hash, validate every required root/variant exactly once,
and produce root-level dispositions. It must never manually delete
`test262-cross-realm-host`; only generated taxonomy synchronization may consume
dispositions.

Implement the reviewed owner allowlist from concrete failure signatures to
existing roadmap blockers in `tools/test262/es2015-h0-owner-map.json`. Unknown
owners, unreviewed signatures, duplicate evidence, missing evidence, skipped
evidence, different primary owners within one root, and partial promotion leave
the H0 blocker unchanged. All-fail and mixed roots may reassign only when every
failed variant maps to the same primary owner. Reassignment records include
secondary prerequisite/failure evidence and retained mixed-root pass evidence,
but taxonomy precedence selects one primary owner.

Use the schemas in **H0 Artifact Schemas** exactly: owner map records reviewed
owners/signatures, disposition records source ledger/taxonomy/evidence/owner-map
hashes, owner deltas record deterministic downstream path/count/hash deltas, and
the H0 promotion records separate immutable source, disposition, and promoted
subset identities. Preserve T0's v1 manifest byte-for-byte.

- [ ] **Step 4: Generate the observed H0 disposition artifact**

Generate from the Task 3 complete evidence and immutable path manifest:

```bash
TZ=UTC node tools/test262/es2015-audit.js \
  --paths-manifest=tools/test262/es2015-h0-paths.json \
  --owner-map=tools/test262/es2015-h0-owner-map.json \
  --write-disposition=tools/test262/es2015-h0-disposition.json
```

Expected at the current observed baseline: 79 raw variants pass and 188 fail;
40 complete-pass roots contribute 78 promoted variants; 94 all-fail roots
contribute 187 full reassigned variants; and 1 mixed root contributes 2 full
reassigned variants. Treat these counts as evidence only; regenerate final
counts after moving-main reconciliation.

- [ ] **Step 5: Build the exact pass-only H0 promotion manifest**

Generate one code-unit-sorted entry per complete-root `passed` disposition,
recording normalized metadata, include closure, immutable H0 source identity,
disposition identity, and promoted subset identity:

```bash
TZ=UTC node tools/test262/es2015-audit.js \
  --paths-manifest=tools/test262/es2015-h0-paths.json \
  --disposition=tools/test262/es2015-h0-disposition.json \
  --write-promotion=tools/test262/es2015-h0-promotion.json
```

The promotion manifest must not contain reassigned or partially passing roots.
Validate live pinned metadata/include closure and independently recompute
`h0LedgerSha256`, `dispositionSha256`, and `promotedLedgerSha256` plus all
counts before accepting it.

- [ ] **Step 6: Wire selection, execution, audit, and report synchronization**

Update `upstream-select.js` to emit T0 plus H0 pass-only promotion groups.
Update `upstream-run.js` to validate/authorize all promotion sources. Update
`es2015-audit.js` so focused execution identifies the target disposition and
promotion files, keeps T0 evidence, and writes disposition, promotion, evidence,
taxonomy, and `tools/test262/es2015-h0-owner-deltas.json` downstream
owner-ledger deltas atomically. Missing, failed, skipped, duplicate, foreign,
unknown-owner, or unexplained evidence writes no success record and removes no H0
blocker.

Modify `test/ci/es2015-cross-realm-test262.test.js` so the focused gate requires
the exact immutable ledger/hash, exactly 267 complete variant records, zero
skipped/missing/duplicate/foreign records, no missing `$262` or harness leakage,
and every failure matched by reviewed disposition/owner evidence. It must not
require every variant to pass; missing or unmapped evidence keeps the command
RED.

Use explicit options:

```text
--owner-map=tools/test262/es2015-h0-owner-map.json
--disposition=tools/test262/es2015-h0-disposition.json
--promotion-file=tools/test262/es2015-h0-promotion.json
--write-owner-deltas=tools/test262/es2015-h0-owner-deltas.json
```

with `--paths-manifest=tools/test262/es2015-h0-paths.json`, rejecting unknown
sources.

- [ ] **Step 7: Run GREEN tooling tests**

```bash
node test/run-node.js \
  test/ci/es2015-cross-realm-test262.test.js \
  test/node/es2015-taxonomy.test.js \
  test/node/upstream-select.test.js \
  test/node/workflow-contract.test.js
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Run fresh specification and quality reviews**

Require reviewers to verify immutable T0 provenance, exact H0 hash/counts,
duplicate rejection, no global feature widening, deterministic UTC generation,
partial-promotion fail-closed behavior, reviewed owner mapping, owner-delta
artifacts, independent H0 source/disposition/promoted-subset identities, and
downstream compatibility. Fix and repeat Step 7.

- [ ] **Step 9: Commit the disposition and promotion tooling**

```bash
git add tools/test262/es2015-h0-owner-map.json tools/test262/es2015-h0-disposition.json tools/test262/es2015-h0-owner-deltas.json tools/test262/es2015-h0-promotion.json tools/test262/es2015-promotion.js tools/test262/upstream-select.js tools/test262/upstream-run.js tools/test262/es2015-audit.js test/ci/es2015-cross-realm-test262.test.js test/node/es2015-taxonomy.test.js test/node/upstream-select.test.js test/node/workflow-contract.test.js
git commit -m "Add exact H0 Test262 dispositions" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Atomically Reclassify Selector-Zero Evidence

**Files:**

- Create: `tools/test262/es2015-h0-baseline.json`
- Modify: `tools/test262/es2015-h0-owner-map.json`
- Modify: `tools/test262/es2015-h0-disposition.json`
- Modify: `tools/test262/es2015-h0-owner-deltas.json`
- Modify: `tools/test262/es2015-h0-promotion.json`
- Modify: `tools/test262/upstream-subset.json`
- Modify: `tools/test262/es2015-audit-evidence.json`
- Modify: `tools/test262/es2015-taxonomy.json`
- Modify: `tools/test262/es2015-promotion.js`
- Modify: `tools/test262/es2015-audit.js`
- Modify: `test/node/es2015-taxonomy.test.js`
- Modify: `test/node/upstream-select.test.js`
- Modify: `test/node/workflow-contract.test.js`
- Modify: generated downstream owner ledgers/count deltas
- Modify: `docs/test262-report.jsonl`
- Modify: generated coverage block in `docs/conformance.md`
- Modify: `docs/testing.md`
- Modify: `README.md` only if its command table needs the focused H0 command

**Interfaces:**

- Consumes: exact H0 path manifest, compact final-base identity, complete H0
  execution evidence, generated H0 dispositions, reviewed owner mapping, owner
  deltas, and pass-only promotion manifest.
- Produces: zero core `test262-cross-realm-host` selectors by promoting only
  complete-root passes and reassigning the remaining roots to existing roadmap
  owners.
- Produces: selected evidence, reassignment evidence, taxonomy, report, and
  downstream owner-ledger updates from one generator transaction.
- Produces: regenerated `tools/test262/es2015-h0-owner-deltas.json` for #70 and
  every affected downstream issue from the final disposition hash.
- Produces: a default `audit --check` proof that derives the final-base H0
  identity from the tracked compact artifact and rejects a stale, tampered, or
  aliased output transaction without consulting session-local paths.

- [ ] **Step 1: Reconcile moving `origin/main` before final evidence**

Record the issue baseline and the final PR base separately, preserve the current
main taxonomy before rebasing, and review all parallel movement:

```bash
ARTIFACTS=/Users/jordan/.copilot/session-state/fcbbda7f-04cc-47b2-851a-cf80bf236732/files
ORIGINAL_ISSUE_BASE=54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7
git fetch origin main
FINAL_PR_BASE=$(git rev-parse origin/main)
printf '%s\n' "$ORIGINAL_ISSUE_BASE" > "$ARTIFACTS/h0-original-issue-base.txt"
printf '%s\n' "$FINAL_PR_BASE" > "$ARTIFACTS/h0-final-pr-base.txt"
git show "$ORIGINAL_ISSUE_BASE:tools/test262/es2015-taxonomy.json" \
  > "$ARTIFACTS/h0-original-baseline-taxonomy.json"
git show "$FINAL_PR_BASE:tools/test262/es2015-taxonomy.json" \
  > "$ARTIFACTS/h0-final-base-taxonomy.json"
git rebase origin/main
test "$(git merge-base HEAD origin/main)" = "$FINAL_PR_BASE"
```

Compare original-baseline and final-base classifications by path. Every non-H0
movement must correspond to a reviewed parallel-main merge such as #75/#77/#79;
unexplained movement is a hard stop. Require the immutable H0 artifact still has
exactly 135 roots / 267 variants and the same ledger hash, and derive the
final-base core `test262-cross-realm-host` selector. Require that selector's
code-unit-sorted path set and 267-variant sum equal the immutable H0 artifact
exactly: no removed H0 path and no concurrent extra path with the same blocker.
If the sets differ, stop for explicit roadmap review rather than silently
shrinking or expanding H0. This dynamic equality proof is what makes the later
selector-zero assertion valid.

Render and commit `tools/test262/es2015-h0-baseline.json` from that final-base
snapshot. Its exact-key parser must bind final base
`99c439f2efd287479f40d8d0e6ac2dd9aab81e10`, the full taxonomy SHA-256,
the immutable H0 ledger/counts, canonical H0 and non-H0 classification hashes,
the balanced partition/status summary, and the Test262 pin. Never make the
default check depend on the saved session snapshot.

- [ ] **Step 2: Regenerate final disposition and pass-only promotion**

Regenerate the final disposition and promotion so their source taxonomy hashes
name `h0-final-base-taxonomy.json`, then regenerate exact selection and execute
only the immutable 135-path corpus:

```bash
TZ=UTC npm run test262:cross-realm
TZ=UTC node tools/test262/es2015-audit.js \
  --baseline-taxonomy="$ARTIFACTS/h0-final-base-taxonomy.json" \
  --paths-manifest=tools/test262/es2015-h0-paths.json \
  --owner-map=tools/test262/es2015-h0-owner-map.json \
  --write-disposition=tools/test262/es2015-h0-disposition.json
TZ=UTC node tools/test262/es2015-audit.js \
  --baseline-taxonomy="$ARTIFACTS/h0-final-base-taxonomy.json" \
  --paths-manifest=tools/test262/es2015-h0-paths.json \
  --disposition=tools/test262/es2015-h0-disposition.json \
  --write-promotion=tools/test262/es2015-h0-promotion.json \
  --write-owner-deltas=tools/test262/es2015-h0-owner-deltas.json
TZ=UTC npm run test262:select
```

Expected: the exact execution evidence covers every H0 root and every required
variant once, with exact immutable ledger/hash, exactly 267 complete variant
records, zero skipped/missing/duplicate/foreign records, no missing `$262` or
harness leakage, and every failure matched by reviewed disposition/owner
evidence. The command must not require all variants to pass, and missing or
unmapped evidence keeps it RED. The generator derives final counts after rebase,
not from the observed raw 79/188, complete-pass 40/78, all-fail 94/187, and
mixed 1/2 baseline. Complete-root passes become the only promotion entries;
all-fail and reviewed one-owner mixed roots are reassigned atomically to one
existing primary roadmap owner while retaining secondary evidence. Missing,
skipped, duplicate, foreign, different-primary-owner, unknown-owner, or
unexplained evidence writes neither a success record nor blocker removal.

- [ ] **Step 3: Generate and verify the atomic selector-zero delta**

```bash
TZ=UTC npm run test262:es2015:sync-promoted-report
TZ=UTC npm run test262:es2015:audit:check
TZ=UTC node tools/test262/es2015-audit.js \
  --baseline-taxonomy="$ARTIFACTS/h0-final-base-taxonomy.json"
TZ=UTC node tools/test262/es2015-audit.js \
  --check \
  --baseline-taxonomy="$ARTIFACTS/h0-final-base-taxonomy.json"
TZ=UTC npm run test262:select:check
```

`assertExactH0DispositionDelta` must prove:

- the post-H0 `test262-cross-realm-host` selector is zero roots / zero variants;
- `passed` + `reassigned` root union equals the immutable 135 paths exactly;
- `passed` + `reassigned` variant union equals the immutable 267 variants
  exactly;
- the pass-only promotion manifest contains exactly the complete-root `passed`
  dispositions and no reassigned or partial roots;
- immutable H0 source identity, disposition identity, and promoted subset
  identity are recomputed independently and match the promotion manifest;
- every reassigned root names one reviewed existing owner and preserves secondary
  evidence;
- expected selected/blocked/reassigned totals equal the reconciled final-base
  totals plus or minus generated root/variant deltas, without hard-coded global
  totals;
- exact path/hash equality holds for H0 ledger, owner map, disposition, owner
  deltas, promotion, compact final-base identity, evidence, taxonomy, report,
  and downstream owner ledgers;
- whole-tree, core, Annex B, unknown, and harness denominators balance; and
- canonical non-H0 classification identity and the reversible canonical H0
  identity equal the reconciled final base, except reviewed concurrent-main
  movement already accounted for in Step 1.

Any additional movement is a hard stop unless a new `origin/main` fetch proves
it is a reviewed rebase consequence, in which case repeat Steps 1-3.

- [ ] **Step 4: Update direct documentation from generated totals**

Document the original issue baseline, final PR base, tracked compact baseline
identity/hash, focused command, default audit proof, harness-only boundary,
exact H0 ledger/hash, owner-map/disposition/owner-delta/promotion hashes,
generated passed/reassigned counts, and selector-zero result. State that `$262` remains absent from public runtime
APIs and normal Realm globals, that B0 owns detachment, and that #76 completed
host support rather than making all 135 roots semantically pass.

- [ ] **Step 5: Run focused drift gates only**

```bash
TZ=UTC npm run test262:cross-realm
TZ=UTC node tools/test262/es2015-audit.js \
  --check \
  --baseline-taxonomy="$ARTIFACTS/h0-final-base-taxonomy.json"
TZ=UTC npm run test262:select:check
npm run ci:check
```

Expected: PASS. Do not invoke `ci:contract`, `test262:upstream`,
`test262:upstream:check`, `test/run-ci-contract.js`, or any wrapper that runs
broad upstream Test262.

- [ ] **Step 6: Run fresh evidence reviews**

Use fresh maximum-effort non-Claude-Opus-5 reviewers for specification and
quality. Require original/final base separation, exact arithmetic, ledger/source
hashes, T0 preservation, generated disposition and blocker movement,
complete-root-only promotion identities, reviewed owner reassignment, owner-delta
artifacts, generated report and owner-ledger consistency, and zero unintended
path movement. Fix and rerun Steps
1-5 if main moved; otherwise rerun Steps 2-5.

- [ ] **Step 7: Commit reconciled deterministic evidence**

```bash
git add tools/test262/es2015-h0-baseline.json tools/test262/es2015-h0-owner-map.json tools/test262/es2015-h0-disposition.json tools/test262/es2015-h0-owner-deltas.json tools/test262/es2015-h0-promotion.json tools/test262/es2015-promotion.js tools/test262/es2015-audit.js tools/test262/upstream-subset.json tools/test262/es2015-audit-evidence.json tools/test262/es2015-taxonomy.json test/node/es2015-taxonomy.test.js test/node/upstream-select.test.js test/node/workflow-contract.test.js docs/test262-report.jsonl docs/conformance.md docs/testing.md README.md
git commit -m "Reclassify exact cross-Realm Test262 roots" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Run Final Portable, Static, Invariant, and Benchmark Gates

**Files:**

- Modify only files required by valid gate failures caused by this branch.

**Interfaces:**

- Produces: a review-ready exact head with no known local regression.

- [ ] **Step 1: Run targeted portable suites**

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
```

- [ ] **Step 2: Run repository static and invariant gates**

```bash
npm run typecheck
npm run lint
npm run format
npm run vendor:check
npm run ci:check
node test/run-node.js \
  test/node/workflow-contract.test.js \
  test/node/repository-invariants.test.js
TZ=UTC npm run test262:es2015:audit:check
TZ=UTC npm run test262:select:check
```

The direct Node suites inspect workflow structure and repository boundaries
without invoking command wrappers. Do not run `ci:contract`,
`test/run-ci-contract.js`, `test262:upstream`, `test262:upstream:check`, or a
wrapper that reaches them.

- [ ] **Step 3: Run the one final full portable gate and benchmark smoke**

```bash
npm run test:node
npm run test:browser
PATH="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" npm run test:jsc
npm run benchmark:smoke
TZ=UTC npm run test262:cross-realm
```

These are the only full local Node/Chromium/JSC runs. The exact H0 command is the
only local Test262 execution; broad upstream Test262 remains exact-head CI only.

- [ ] **Step 4: Recheck moving main and review the exact merge-base range**

```bash
ARTIFACTS=/Users/jordan/.copilot/session-state/fcbbda7f-04cc-47b2-851a-cf80bf236732/files
FINAL_PR_BASE=$(cat "$ARTIFACTS/h0-final-pr-base.txt")
git fetch origin main
test "$(git rev-parse origin/main)" = "$FINAL_PR_BASE"
git --no-pager diff --stat "$FINAL_PR_BASE"...HEAD
git --no-pager diff --name-status "$FINAL_PR_BASE"...HEAD
```

If `origin/main` moved, return to Task 5 Step 1, rebase, regenerate all evidence,
and rerun affected targeted/static/final portable gates. Do not review or push a
stale merge-base range.

- [ ] **Step 5: Request final maximum review**

Run a fresh maximum-effort code review with a non-Claude-Opus-5 model over the
entire branch diff across `"$FINAL_PR_BASE"...HEAD`. Then run a separate security review
only if the reviewer or diff identifies an exploitable host-boundary concern.
Fix all valid high-confidence findings and repeat Steps 1-3.

- [ ] **Step 6: Commit gate fixes if needed**

```bash
git add -u
git diff --cached --check
git commit -m "Address cross-Realm harness review findings" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

Skip this commit when no files changed.

---

### Task 7: Push, Verify Reviewed-Head CI/CodeQL, Merge, and Publish Closure

**Files:**

- No production files unless exact-head CI finds a branch-caused defect.
- Update GitHub issue #76 and roadmap #70 after merge.

**Interfaces:**

- Produces: one recoverable focused PR, exact reviewed-head CI/CodeQL evidence,
  squash merge, deleted branch, mandatory exact-main CodeQL evidence, closed
  #76, updated roadmap/downstream dependency counts, and exact evidence links.

- [ ] **Step 1: Verify final branch identity and push**

```bash
ARTIFACTS=/Users/jordan/.copilot/session-state/fcbbda7f-04cc-47b2-851a-cf80bf236732/files
ORIGINAL_ISSUE_BASE=$(cat "$ARTIFACTS/h0-original-issue-base.txt")
FINAL_PR_BASE=$(cat "$ARTIFACTS/h0-final-pr-base.txt")
git fetch origin main
test "$(git rev-parse origin/main)" = "$FINAL_PR_BASE"
git status --short
REVIEWED_HEAD=$(git rev-parse HEAD)
printf '%s\n' "$REVIEWED_HEAD" > "$ARTIFACTS/h0-reviewed-head.txt"
git --no-pager log --oneline "$FINAL_PR_BASE"..HEAD
git --no-pager diff --stat "$FINAL_PR_BASE"...HEAD
git push -u origin HEAD
```

Expected: clean worktree, only #76 commits, and a final merge-base range that
matches the range reviewed in Task 6. If main moved, return to Task 5.

- [ ] **Step 2: Recover or create exactly one focused PR**

Use marker `<!-- issue-76-h0 -->`. Query open PRs for the exact pushed head
branch:

```bash
ARTIFACTS=/Users/jordan/.copilot/session-state/fcbbda7f-04cc-47b2-851a-cf80bf236732/files
REVIEWED_HEAD=$(cat "$ARTIFACTS/h0-reviewed-head.txt")
HEAD_BRANCH=$(git branch --show-current)
gh pr list --repo yoonbuck/jsjs --state open --head "$HEAD_BRANCH" \
  --json number,title,body,baseRefName,headRefName,headRefOid,url \
  > "$ARTIFACTS/h0-open-prs.json"
test "$(jq length "$ARTIFACTS/h0-open-prs.json")" -le 1
```

If none exists, create one PR through the app-native pull-request tool. If one
exists, require the marker, title
`Implement portable harness-only Test262 cross-Realm support`, base `main`,
exact head branch, and `headRefOid === REVIEWED_HEAD`; use the app-native PR
update tool rather than creating a second PR. More than one match is a hard
stop. Never overwrite an unrelated existing PR. After create/update, rerun the
query above and require exactly one validated PR so the following steps recover
idempotently after interruption.

The PR body uses `Tracks #76`, not `Fixes #76`, and distinguishes:

- original issue baseline `ORIGINAL_ISSUE_BASE`;
- reconciled final merge base `FINAL_PR_BASE`;
- reviewed PR head `REVIEWED_HEAD`;
- H0 ledger hash, generated passed/reassigned counts, and selector-zero result;
- host-interface/non-goal summary;
- Node/Chromium/JSC/focused UTC/taxonomy/static/benchmark evidence;
- pending/final exact CI run ID, PR-head CodeQL analysis IDs/categories, and
  squash SHA; and
- explicit statement that broad Test262 was not run locally and is delegated to
  exact-head CI.

- [ ] **Step 3: Resolve exact `ci.yml` pull-request CI by reviewed head**

Resolve `PR_NUMBER` from the validated marker/head. Wait at most ten minutes
for exactly one standard `CI` run with workflow `ci.yml`, event
`pull_request`, and `headSha === REVIEWED_HEAD`:

```bash
ARTIFACTS=/Users/jordan/.copilot/session-state/fcbbda7f-04cc-47b2-851a-cf80bf236732/files
REVIEWED_HEAD=$(cat "$ARTIFACTS/h0-reviewed-head.txt")
PR_NUMBER=$(jq -r '.[0].number' "$ARTIFACTS/h0-open-prs.json")
for ATTEMPT in $(seq 1 60); do
  gh run list --repo yoonbuck/jsjs \
    --commit "$REVIEWED_HEAD" \
    --event pull_request \
    --workflow ci.yml \
    --limit 100 \
    --json databaseId,headSha,event,name,status,conclusion,url,createdAt \
    > "$ARTIFACTS/h0-reviewed-head-ci-runs.json"
  CI_CANDIDATES=$(jq \
    '[.[] | select(.headSha == "'"$REVIEWED_HEAD"'" and .event == "pull_request" and .name == "CI")] | unique_by(.databaseId) | length' \
    "$ARTIFACTS/h0-reviewed-head-ci-runs.json")
  test "$CI_CANDIDATES" -le 1
  H0_CI_RUN=$(jq -r \
    '[.[] | select(.headSha == "'"$REVIEWED_HEAD"'" and .event == "pull_request" and .name == "CI")] | unique_by(.databaseId) | .[0].databaseId // empty' \
    "$ARTIFACTS/h0-reviewed-head-ci-runs.json")
  if test -n "$H0_CI_RUN"; then break; fi
  sleep 10
done
test -n "$H0_CI_RUN"
```

Start exactly one synchronous
`gh run watch "$H0_CI_RUN" --repo yoonbuck/jsjs --exit-status` process with a
600-second initial wait. If it remains active, read that same shell session
with 600-second `read_bash` calls; never start a second watcher.

After completion:

```bash
test "$(gh pr view "$PR_NUMBER" --repo yoonbuck/jsjs \
  --json headRefOid --jq .headRefOid)" = "$REVIEWED_HEAD"
gh run view "$H0_CI_RUN" --repo yoonbuck/jsjs \
  --json headSha,event,name,status,conclusion,jobs \
  > "$ARTIFACTS/h0-reviewed-head-ci-final.json"
test "$(jq -r .headSha "$ARTIFACTS/h0-reviewed-head-ci-final.json")" = \
  "$REVIEWED_HEAD"
test "$(jq -r .event "$ARTIFACTS/h0-reviewed-head-ci-final.json")" = \
  "pull_request"
test "$(jq -r .name "$ARTIFACTS/h0-reviewed-head-ci-final.json")" = "CI"
test "$(jq -r .conclusion "$ARTIFACTS/h0-reviewed-head-ci-final.json")" = \
  "success"
test "$(jq '[.jobs[] | select(.conclusion != "success" and .conclusion != "skipped")] | length' \
  "$ARTIFACTS/h0-reviewed-head-ci-final.json")" = "0"
gh pr checks "$PR_NUMBER" --repo yoonbuck/jsjs
```

Confirm CI includes Node, Chromium, JSC, focused H0, broad pinned Test262,
taxonomy drift, invariants, and benchmark smoke. If a branch-caused failure
appears, use systematic debugging, add RED coverage, fix, rerun local targeted
gates, push, assign the new head as `REVIEWED_HEAD`, and restart exact-head
evidence collection.

- [ ] **Step 4: Require exact PR/head/category CodeQL analyses**

Wait at most ten minutes for both configured CodeQL categories whose
`commit_sha` is exactly `REVIEWED_HEAD` and whose `ref` is this PR:

```bash
ARTIFACTS=/Users/jordan/.copilot/session-state/fcbbda7f-04cc-47b2-851a-cf80bf236732/files
REVIEWED_HEAD=$(cat "$ARTIFACTS/h0-reviewed-head.txt")
PR_NUMBER=$(jq -r '.[0].number' "$ARTIFACTS/h0-open-prs.json")
PR_REF="refs/pull/$PR_NUMBER/head"
for ATTEMPT in $(seq 1 60); do
  gh api --paginate repos/yoonbuck/jsjs/code-scanning/analyses \
    > "$ARTIFACTS/h0-pr-codeql-analyses.json"
  H0_PR_CODEQL_JS=$(jq -r \
    '[.[] | select(.commit_sha == "'"$REVIEWED_HEAD"'" and .ref == "'"$PR_REF"'" and .tool.name == "CodeQL" and .category == "/language:javascript-typescript")] | max_by(.created_at).id // empty' \
    "$ARTIFACTS/h0-pr-codeql-analyses.json")
  H0_PR_CODEQL_ACTIONS=$(jq -r \
    '[.[] | select(.commit_sha == "'"$REVIEWED_HEAD"'" and .ref == "'"$PR_REF"'" and .tool.name == "CodeQL" and .category == "/language:actions")] | max_by(.created_at).id // empty' \
    "$ARTIFACTS/h0-pr-codeql-analyses.json")
  if test -n "$H0_PR_CODEQL_JS" && \
     test -n "$H0_PR_CODEQL_ACTIONS"; then break; fi
  sleep 10
done
test -n "$H0_PR_CODEQL_JS"
test -n "$H0_PR_CODEQL_ACTIONS"
for ANALYSIS_ID in "$H0_PR_CODEQL_JS" "$H0_PR_CODEQL_ACTIONS"; do
  gh api "repos/yoonbuck/jsjs/code-scanning/analyses/$ANALYSIS_ID" \
    > "$ARTIFACTS/h0-pr-codeql-$ANALYSIS_ID.json"
  test "$(jq -r .commit_sha \
    "$ARTIFACTS/h0-pr-codeql-$ANALYSIS_ID.json")" = "$REVIEWED_HEAD"
  test "$(jq -r .ref \
    "$ARTIFACTS/h0-pr-codeql-$ANALYSIS_ID.json")" = "$PR_REF"
  test "$(jq -r .tool.name \
    "$ARTIFACTS/h0-pr-codeql-$ANALYSIS_ID.json")" = "CodeQL"
  test "$(jq -r .results_count \
    "$ARTIFACTS/h0-pr-codeql-$ANALYSIS_ID.json")" = "0"
  test -z "$(jq -r '.error // empty' \
    "$ARTIFACTS/h0-pr-codeql-$ANALYSIS_ID.json")"
  test -z "$(jq -r '.warning // empty' \
    "$ARTIFACTS/h0-pr-codeql-$ANALYSIS_ID.json")"
  gh api -H 'Accept: application/sarif+json' \
    "repos/yoonbuck/jsjs/code-scanning/analyses/$ANALYSIS_ID" \
    > "$ARTIFACTS/h0-pr-codeql-$ANALYSIS_ID.sarif"
  test "$(jq '[.runs[].results[]?] | length' \
    "$ARTIFACTS/h0-pr-codeql-$ANALYSIS_ID.sarif")" = "0"
  test "$(jq '[.runs[].invocations[]?.toolExecutionNotifications[]? | select(.level == "error" or .level == "warning")] | length' \
    "$ARTIFACTS/h0-pr-codeql-$ANALYSIS_ID.sarif")" = "0"
done
gh run list --repo yoonbuck/jsjs \
  --commit "$REVIEWED_HEAD" \
  --event dynamic \
  --limit 100 \
  --json databaseId,headSha,event,name,status,conclusion \
  > "$ARTIFACTS/h0-pr-codeql-runs.json"
test "$(jq '[.[] | select(.headSha == "'"$REVIEWED_HEAD"'" and .event == "dynamic" and .name == "PR #'"$PR_NUMBER"'")] | unique_by(.databaseId) | length' \
  "$ARTIFACTS/h0-pr-codeql-runs.json")" = "1"
H0_PR_CODEQL_RUN=$(jq -r \
  '[.[] | select(.headSha == "'"$REVIEWED_HEAD"'" and .event == "dynamic" and .name == "PR #'"$PR_NUMBER"'")] | unique_by(.databaseId) | .[0].databaseId' \
  "$ARTIFACTS/h0-pr-codeql-runs.json")
test "$(jq -r \
  '.[] | select(.databaseId == '"$H0_PR_CODEQL_RUN"') | .conclusion' \
  "$ARTIFACTS/h0-pr-codeql-runs.json")" = "success"
gh run view "$H0_PR_CODEQL_RUN" --repo yoonbuck/jsjs --log \
  > "$ARTIFACTS/h0-pr-codeql-run.log"
printf '%s\n' "$H0_PR_CODEQL_JS" > "$ARTIFACTS/h0-pr-codeql-js-id.txt"
printf '%s\n' "$H0_PR_CODEQL_ACTIONS" \
  > "$ARTIFACTS/h0-pr-codeql-actions-id.txt"
printf '%s\n' "$H0_PR_CODEQL_RUN" > "$ARTIFACTS/h0-pr-codeql-run-id.txt"
test "$(jq -r .category \
  "$ARTIFACTS/h0-pr-codeql-$H0_PR_CODEQL_JS.json")" = \
  "/language:javascript-typescript"
test "$(jq -r .category \
  "$ARTIFACTS/h0-pr-codeql-$H0_PR_CODEQL_ACTIONS.json")" = \
  "/language:actions"
```

Inspect the saved log and SARIF for zero extraction or parse diagnostics in
repository source. Fail closed on any diagnostic, absent category, absent exact
run, or identity mismatch.

- [ ] **Step 5: Update the PR evidence, recheck main, and squash merge**

Address every valid review thread in code, rerun affected gates, push, and
refresh exact-head CI/CodeQL. Update the existing PR body with `H0_CI_RUN`, both
PR CodeQL analysis IDs/categories, and the unchanged reviewed head through the
app-native PR update tool.

Immediately before merge:

```bash
ARTIFACTS=/Users/jordan/.copilot/session-state/fcbbda7f-04cc-47b2-851a-cf80bf236732/files
REVIEWED_HEAD=$(cat "$ARTIFACTS/h0-reviewed-head.txt")
FINAL_PR_BASE=$(cat "$ARTIFACTS/h0-final-pr-base.txt")
PR_NUMBER=$(jq -r '.[0].number' "$ARTIFACTS/h0-open-prs.json")
test "$(gh pr view "$PR_NUMBER" --repo yoonbuck/jsjs \
  --json headRefOid --jq .headRefOid)" = "$REVIEWED_HEAD"
git fetch origin main
test "$(git rev-parse origin/main)" = "$FINAL_PR_BASE"
gh pr merge "$PR_NUMBER" --repo yoonbuck/jsjs --squash --delete-branch
```

If main moved, do not merge; return to Task 5 reconciliation and repeat final
review, CI, and PR CodeQL.

- [ ] **Step 6: Verify the squash and mandatory exact-main CodeQL**

```bash
ARTIFACTS=/Users/jordan/.copilot/session-state/fcbbda7f-04cc-47b2-851a-cf80bf236732/files
REVIEWED_HEAD=$(cat "$ARTIFACTS/h0-reviewed-head.txt")
PR_NUMBER=$(jq -r '.[0].number' "$ARTIFACTS/h0-open-prs.json")
git fetch origin main
PR_JSON=$(gh pr view "$PR_NUMBER" --repo yoonbuck/jsjs \
  --json state,mergedAt,mergeCommit,headRefOid,url)
test "$(printf '%s' "$PR_JSON" | jq -r .state)" = "MERGED"
test "$(printf '%s' "$PR_JSON" | jq -r .headRefOid)" = "$REVIEWED_HEAD"
SQUASH_SHA=$(printf '%s' "$PR_JSON" | jq -r .mergeCommit.oid)
test -n "$SQUASH_SHA"
printf '%s\n' "$SQUASH_SHA" > "$ARTIFACTS/h0-squash-sha.txt"
git merge-base --is-ancestor "$SQUASH_SHA" origin/main
```

Wait at most ten minutes for both default-setup analyses with
`commit_sha == SQUASH_SHA`, `ref == refs/heads/main`, `tool.name == CodeQL`,
and categories `/language:javascript-typescript` and `/language:actions`.
Require both; absence is a hard failure.

```bash
ARTIFACTS=/Users/jordan/.copilot/session-state/fcbbda7f-04cc-47b2-851a-cf80bf236732/files
SQUASH_SHA=$(cat "$ARTIFACTS/h0-squash-sha.txt")
for ATTEMPT in $(seq 1 60); do
  gh api --paginate repos/yoonbuck/jsjs/code-scanning/analyses \
    > "$ARTIFACTS/h0-main-codeql-analyses.json"
  H0_MAIN_CODEQL_JS=$(jq -r \
    '[.[] | select(.commit_sha == "'"$SQUASH_SHA"'" and .ref == "refs/heads/main" and .tool.name == "CodeQL" and .category == "/language:javascript-typescript")] | max_by(.created_at).id // empty' \
    "$ARTIFACTS/h0-main-codeql-analyses.json")
  H0_MAIN_CODEQL_ACTIONS=$(jq -r \
    '[.[] | select(.commit_sha == "'"$SQUASH_SHA"'" and .ref == "refs/heads/main" and .tool.name == "CodeQL" and .category == "/language:actions")] | max_by(.created_at).id // empty' \
    "$ARTIFACTS/h0-main-codeql-analyses.json")
  if test -n "$H0_MAIN_CODEQL_JS" && \
     test -n "$H0_MAIN_CODEQL_ACTIONS"; then break; fi
  sleep 10
done
test -n "$H0_MAIN_CODEQL_JS"
test -n "$H0_MAIN_CODEQL_ACTIONS"
for ANALYSIS_ID in "$H0_MAIN_CODEQL_JS" "$H0_MAIN_CODEQL_ACTIONS"; do
  gh api "repos/yoonbuck/jsjs/code-scanning/analyses/$ANALYSIS_ID" \
    > "$ARTIFACTS/h0-main-codeql-$ANALYSIS_ID.json"
  test "$(jq -r .commit_sha \
    "$ARTIFACTS/h0-main-codeql-$ANALYSIS_ID.json")" = "$SQUASH_SHA"
  test "$(jq -r .ref \
    "$ARTIFACTS/h0-main-codeql-$ANALYSIS_ID.json")" = "refs/heads/main"
  test "$(jq -r .tool.name \
    "$ARTIFACTS/h0-main-codeql-$ANALYSIS_ID.json")" = "CodeQL"
  test "$(jq -r .results_count \
    "$ARTIFACTS/h0-main-codeql-$ANALYSIS_ID.json")" = "0"
  test -z "$(jq -r '.error // empty' \
    "$ARTIFACTS/h0-main-codeql-$ANALYSIS_ID.json")"
  test -z "$(jq -r '.warning // empty' \
    "$ARTIFACTS/h0-main-codeql-$ANALYSIS_ID.json")"
  gh api -H 'Accept: application/sarif+json' \
    "repos/yoonbuck/jsjs/code-scanning/analyses/$ANALYSIS_ID" \
    > "$ARTIFACTS/h0-main-codeql-$ANALYSIS_ID.sarif"
  test "$(jq '[.runs[].results[]?] | length' \
    "$ARTIFACTS/h0-main-codeql-$ANALYSIS_ID.sarif")" = "0"
  test "$(jq '[.runs[].invocations[]?.toolExecutionNotifications[]? | select(.level == "error" or .level == "warning")] | length' \
    "$ARTIFACTS/h0-main-codeql-$ANALYSIS_ID.sarif")" = "0"
done
gh run list --repo yoonbuck/jsjs \
  --commit "$SQUASH_SHA" \
  --event dynamic \
  --limit 100 \
  --json databaseId,headSha,event,name,status,conclusion \
  > "$ARTIFACTS/h0-main-codeql-runs.json"
test "$(jq '[.[] | select(.headSha == "'"$SQUASH_SHA"'" and .event == "dynamic" and .name == "Push on main")] | unique_by(.databaseId) | length' \
  "$ARTIFACTS/h0-main-codeql-runs.json")" = "1"
H0_MAIN_CODEQL_RUN=$(jq -r \
  '[.[] | select(.headSha == "'"$SQUASH_SHA"'" and .event == "dynamic" and .name == "Push on main")] | unique_by(.databaseId) | .[0].databaseId' \
  "$ARTIFACTS/h0-main-codeql-runs.json")
test "$(jq -r \
  '.[] | select(.databaseId == '"$H0_MAIN_CODEQL_RUN"') | .conclusion' \
  "$ARTIFACTS/h0-main-codeql-runs.json")" = "success"
gh run view "$H0_MAIN_CODEQL_RUN" --repo yoonbuck/jsjs --log \
  > "$ARTIFACTS/h0-main-codeql-run.log"
gh api --paginate \
  'repos/yoonbuck/jsjs/code-scanning/alerts?ref=refs/heads/main&state=open' \
  > "$ARTIFACTS/h0-main-codeql-open-alerts.json"
test "$(jq \
  '[.[] | select(.most_recent_instance.commit_sha == "'"$SQUASH_SHA"'")] | length' \
  "$ARTIFACTS/h0-main-codeql-open-alerts.json")" = "0"
test "$(jq -r .category \
  "$ARTIFACTS/h0-main-codeql-$H0_MAIN_CODEQL_JS.json")" = \
  "/language:javascript-typescript"
test "$(jq -r .category \
  "$ARTIFACTS/h0-main-codeql-$H0_MAIN_CODEQL_ACTIONS.json")" = \
  "/language:actions"
printf '%s\n' "$H0_MAIN_CODEQL_JS" \
  > "$ARTIFACTS/h0-main-codeql-js-id.txt"
printf '%s\n' "$H0_MAIN_CODEQL_ACTIONS" \
  > "$ARTIFACTS/h0-main-codeql-actions-id.txt"
printf '%s\n' "$H0_MAIN_CODEQL_RUN" \
  > "$ARTIFACTS/h0-main-codeql-run-id.txt"
```

Inspect the exact-main log and SARIF for zero extraction or parse diagnostics.
API unavailability is a hard failure, not a fallback.

Verify the merged taxonomy/report/disposition/promotion/compact-baseline bytes
equal the reviewed head, the H0 selector is still zero, and the default
`audit --check` still proves the exact 135-root / 267-variant
passed-or-reassigned union without `h0-final-base-taxonomy.json`.

```bash
ARTIFACTS=/Users/jordan/.copilot/session-state/fcbbda7f-04cc-47b2-851a-cf80bf236732/files
REVIEWED_HEAD=$(cat "$ARTIFACTS/h0-reviewed-head.txt")
SQUASH_SHA=$(cat "$ARTIFACTS/h0-squash-sha.txt")
for PATH_IN_REPO in \
  tools/test262/es2015-h0-baseline.json \
  tools/test262/es2015-h0-owner-map.json \
  tools/test262/es2015-h0-disposition.json \
  tools/test262/es2015-h0-owner-deltas.json \
  tools/test262/es2015-h0-promotion.json \
  tools/test262/es2015-audit-evidence.json \
  tools/test262/es2015-taxonomy.json \
  tools/test262/upstream-subset.json \
  docs/test262-report.jsonl \
  docs/conformance.md
do
  git show "$REVIEWED_HEAD:$PATH_IN_REPO" \
    > "$ARTIFACTS/h0-reviewed-$(basename "$PATH_IN_REPO")"
  git show "$SQUASH_SHA:$PATH_IN_REPO" \
    > "$ARTIFACTS/h0-merged-$(basename "$PATH_IN_REPO")"
  cmp "$ARTIFACTS/h0-reviewed-$(basename "$PATH_IN_REPO")" \
    "$ARTIFACTS/h0-merged-$(basename "$PATH_IN_REPO")"
done
jq -e \
  '[.classifications[] | select(.partition == "core" and .blocker == "test262-cross-realm-host")] | length == 0' \
  "$ARTIFACTS/h0-merged-es2015-taxonomy.json"
```

- [ ] **Step 7: Close/update roadmap evidence**

Publish on #76:

- squash SHA;
- reviewed PR head SHA;
- exact `ci.yml` pull-request run ID/URL;
- exact PR CodeQL analysis IDs/categories and workflow run;
- exact-main dynamic CodeQL analysis IDs/categories, run, SARIF/log hashes, and
  zero open alerts;
- exact ledger hash, generated passed/reassigned counts, and selector-zero result;
- original issue baseline, final PR base, reviewed head, and squash SHA;
- post-merge taxonomy/owner-map/disposition/owner-deltas/promotion SHA-256
  values, compact baseline SHA-256, and balanced totals;
- deterministic added path/hash/count deltas from
  `tools/test262/es2015-h0-owner-deltas.json` for every affected downstream
  owner issue and #70; and
- `$262` non-leakage, B0/non-goal, and host-support-completion statements.

Only now close #76 explicitly, after exact-main CodeQL and post-merge generated
verification. Update #70 selected/core/reassigned counts and H0 status from the
post-merge generated artifacts. Update every affected downstream owner issue
with deterministic added path/hash/count deltas from
`tools/test262/es2015-h0-owner-deltas.json`, explicitly naming newly unblocked
issues. Preserve closed #74 as resolved dependency history. Update the
merged PR body one final time with the squash SHA and exact-main CodeQL evidence.
Do not describe the outcome as 135 semantic passes.

- [ ] **Step 8: Report completion to the project coordinator**

Send the coordinator one concise message with PR URL, squash SHA, exact CI and
CodeQL runs, taxonomy/compact-baseline/owner-map/disposition/owner-deltas/promotion/ledger hashes, generated
passed/reassigned counts, updated issue URLs, and newly unblocked roadmap nodes.
