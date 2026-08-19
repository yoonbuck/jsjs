# Async Runtime and Modules Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate and release the merged Agent Jobs/Promises, generators, and static modules layers with portable composition tests, an audited Test262 policy, deterministic UTC evidence, complete cross-host CI, and exact issue closure evidence.

**Architecture:** Keep the merged layer interfaces unchanged and add one portable integration suite that composes them through public APIs. Treat Test262 metadata, feature probes, selection, focused pinned suites, generated workflow, report, and conformance document as one release contract. Permit only focused RED-first integration fixes; route any substantial missing feature to a new implementation issue instead of broadening this release branch.

**Tech Stack:** Plain ES2020 JavaScript, strict JSDoc checking, Acorn 8.18.0, the repository's portable test harness, pinned Test262 `b363f29d3c43c626dc852744ad64a0b48a003693`, generated GitHub Actions workflow, Node 20, Chromium, and JavaScriptCore.

## Global Constraints

- Start from exact merged `origin/main` SHA `94bc89d2128df5875818759c8394290d6ed8b239`; do not depend on archived or unmerged state.
- Engine source must run unchanged in Node, Chromium, and JavaScriptCore.
- Guest Promise, job, generator, and module semantics must never delegate to host equivalents.
- Host Promise use is confined to awaiting module host hooks.
- Every behavior fix starts with a focused portable regression that fails for the expected reason.
- Every implementation task receives a fresh specification review and a separate quality review; accepted findings repeat the RED/fix/re-review loop.
- Use GPT-5.6-family models or Claude Opus 4.8 or lower; never use Claude Opus 5.
- Run generated Test262 selection, report, and conformance artifact commands with `TZ=UTC`.
- Avoid a broad local Test262 rerun except when generating final artifacts; exact-SHA CI supplies the final broad pinned gate.
- A substantial missing feature is not a release fix: create a focused issue/task and report the release blocker.
- Do not close #61, #28, or #24 until the reviewed exact PR head passes every required check and all child evidence has been freshly audited.

---

### Task 1: Freeze the Published Layer Boundaries and Baseline

**Files:**

- Read: `docs/superpowers/specs/2026-08-14-async-runtime-and-modules-design.md`
- Read: `docs/conformance.md`
- Read: `src/index.js`
- Read: `src/runtime/agent.js`
- Read: `src/runtime/promise.js`
- Read: `src/runtime/generator-object.js`
- Read: `src/runtime/module-loader.js`
- Read: `test/ci/es2015-promise-test262.test.js`
- Read: `test/ci/es2015-generator-test262.test.js`
- Read: `test/ci/es2015-module-test262.test.js`

**Interfaces:**

- Consumes: `createAgent({ jobHost? })`, `createRealm({ agent?, jobHost? })`, `Agent#runJobs()`, `evaluateScript(realm, source)`, `createModuleLoader(realm, { resolve, load })`, and `ModuleLoader#loadAndEvaluate(specifier, referrer?)`.
- Produces: A recorded exact baseline and a release boundary that later tasks may not silently widen.

- [ ] **Step 1: Prove the checkout and worktree baseline**

Run:

```bash
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
git diff --exit-code 94bc89d2128df5875818759c8394290d6ed8b239
```

Expected: both SHAs are `94bc89d2128df5875818759c8394290d6ed8b239`, with no inherited source changes.

- [ ] **Step 2: Run the smallest merged-layer baseline**

Run:

```bash
node test/run-node.js \
  test/jobs.test.js \
  test/promise-core.test.js \
  test/promise-reactions.test.js \
  test/generator-runtime.test.js \
  test/generator-delegation.test.js \
  test/module-loader.test.js \
  test/module-evaluation.test.js \
  test/module-namespace.test.js
```

Expected: every emitted result has `"status":"passed"`.

- [ ] **Step 3: Record the non-negotiable release boundary in the task review prompt**

The review prompt must state:

```text
Review only the merged interfaces at 94bc89d and the layer-4 release plan.
Jobs/Promises are published by PR #63, generators by PR #64, and static
modules/loader by PR #65. Do not redesign those layers. Flag only a mismatch
between the published interface/evidence and the current merged source, or a
release-plan step that would hide substantial feature work.
```

- [ ] **Step 4: Obtain a task specification review**

Dispatch a fresh read-only reviewer against the files and exact interfaces above. Resolve every high-confidence finding before proceeding. If a finding is a substantial missing feature, create a focused GitHub issue and mark #61 blocked rather than editing the feature here.

- [ ] **Step 5: Commit only if the baseline review requires a documentation correction**

If no correction is needed, make no commit. If exact published interface prose is stale, change only `docs/conformance.md`, then run `npm run format` and commit:

```bash
git add docs/conformance.md
git commit -m "docs: align async runtime release boundary" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: Add Portable Cross-Subsystem Integration Coverage

**Files:**

- Create: `test/async-runtime-modules-integration.test.js`
- Modify: `test/suites.js`
- Modify only after a proven RED failure: the smallest directly responsible file under `src/runtime/`

**Interfaces:**

- Consumes: the public interfaces frozen in Task 1, Realm-owned `Promise`, generator functions and iterator results, module namespace live bindings, and `ModuleLoaderError`.
- Produces: one portable suite registered once through `PORTABLE_SUITES`, so identical tests run in Node, Chromium, and JSC.

- [ ] **Step 1: Create the suite with shared helpers**

Add imports:

```js
import {
  createAgent,
  createModuleLoader,
  createRealm,
  evaluateScript,
  ModuleLoaderError,
} from '../src/index.js';
import { assertSame } from './harness/assert.js';

function assertNormal(completion, expected) {
  assertSame(completion.type, 'normal');
  assertSame(completion.value, expected);
}
```

Export a default array of portable test cases. Do not import Node APIs, timers, `queueMicrotask`, host filesystem APIs, or host URL/path helpers.

- [ ] **Step 2: Add Promise-to-generator ordering coverage**

Add a test named `Promise reactions resume generators in Agent FIFO order`. It must:

```js
const realm = createRealm();
assertNormal(
  evaluateScript(
    realm,
    `
      var log = [];
      function* values() {
        log.push("start");
        var input = yield 1;
        log.push("resume:" + input);
        return 3;
      }
      var iterator = values();
      Promise.resolve(iterator.next().value).then(function (value) {
        var step = iterator.next(value + 1);
        log.push("done:" + step.value + ":" + step.done);
      });
      log.push("sync");
      log.join(",");
    `,
  ),
  'start,sync',
);
assertSame(realm.agent.runJobs().failures.length, 0);
assertNormal(
  evaluateScript(realm, 'log.join(",")'),
  'start,sync,resume:2,done:3:true',
);
```

- [ ] **Step 3: Add cross-Realm shared-Agent Promise coverage**

Add a test named `cross-Realm Promise jobs keep handler Realm intrinsics on one Agent`. Create one `Agent`, two Realms sharing it, pass a callable created in the second Realm to a Promise created in the first, drain the shared Agent once, and assert that:

```text
the callback ran in FIFO order;
the callback-created array has the second Realm's Array prototype;
the derived Promise remains owned by the constructor/species Realm;
the drain reports zero failures.
```

Use engine objects and `realm.intrinsics.arrayPrototype` for identity assertions; do not infer Realm identity from host constructors.

- [ ] **Step 4: Add module-created Promise and generator Realm coverage**

Add a test named `module code creates Promise and generator values from its loader Realm`. Load:

```js
export function* values() {
  yield 1;
  return 2;
}
export const promise = Promise.resolve(3);
```

Assert through namespace reads and guest evaluation that the generator function/object and Promise use the loader Realm's intrinsics, and that draining the Realm's Agent settles the guest Promise with zero job failures.

- [ ] **Step 5: Add live-binding observation from a Promise reaction**

Load a two-module graph:

```js
// state
export let value = 1;
export function set(next) {
  value = next;
}

// root
import { value, set } from 'state';
export function schedule() {
  return Promise.resolve().then(function () {
    set(2);
    return value;
  });
}
export { value };
```

Call `schedule`, assert the namespace initially exposes `1`, drain guest jobs, then assert the same cached namespace exposes `2` and the reaction result is `2`.

- [ ] **Step 6: Add guest failure identity coverage**

Add a test named `module evaluation failures and queued rejections preserve guest identity`. Export one Realm-owned error, throw that exact value during module evaluation, and separately reject a guest Promise with the same value. Assert:

```text
ModuleLoaderError.phase is "evaluate";
ModuleLoaderError.value is the exact guest error object;
the rejection tracker receives the exact same guest object/promise identity;
Agent job failures do not replace or host-wrap the value.
```

- [ ] **Step 7: Add loader-host-Promise separation coverage**

Add a test named `host Promise loading never drains or reorders guest jobs`. Its `load` hook returns a host `Promise` that resolves source text while an already-created guest Promise reaction remains queued. Assert:

```text
await loader.loadAndEvaluate(...) completes without running the guest reaction;
the guest log is still empty before Agent#runJobs();
Agent#runJobs() then runs the guest reaction exactly once;
module namespace identity and values are unaffected.
```

- [ ] **Step 8: Register the suite and prove the test is portable**

Import and register the suite in `test/suites.js`:

```js
import asyncRuntimeModulesIntegration from './async-runtime-modules-integration.test.js';
```

Add:

```js
Object.freeze({
  file: 'test/async-runtime-modules-integration.test.js',
  tests: asyncRuntimeModulesIntegration,
}),
```

Run:

```bash
node test/run-node.js test/async-runtime-modules-integration.test.js
```

Expected: all six tests pass. If any test fails, preserve the failing test as RED evidence before editing engine source.

- [ ] **Step 9: Make only a focused RED-first integration fix if required**

For each RED result:

1. Save the exact failing output.
2. Identify the smallest violated published invariant.
3. Change only the directly responsible runtime unit.
4. Re-run the new suite plus that unit's existing adjacent suite.
5. If the fix requires a new public abstraction, parser feature, evaluator family, or broad state-machine rewrite, stop and route it to a new implementation issue.

- [ ] **Step 10: Obtain separate task reviews and commit**

First dispatch a fresh specification reviewer for the six layer-4 scenarios. Then dispatch a different quality reviewer for portability, Realm/Agent identity assertions, and accidental host delegation. Fix and re-review until both are clean.

Run:

```bash
node test/run-node.js \
  test/async-runtime-modules-integration.test.js \
  test/jobs.test.js \
  test/promise-reactions.test.js \
  test/generator-runtime.test.js \
  test/module-loader.test.js \
  test/module-evaluation.test.js
npm run typecheck
```

Commit:

```bash
git add test/async-runtime-modules-integration.test.js test/suites.js src/runtime
git commit -m "test: integrate async runtime and modules" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: Audit Test262 Features, Flags, Modules, and Async Policy

**Files:**

- Modify: `test/ci/full-contract.test.js`
- Modify: `test/node/workflow-contract.test.js`
- Modify: `tools/test262/features.json`
- Modify: `tools/test262/es5-selection.json`
- Read: `tools/test262/es5-selection.js`
- Read: `tools/test262/upstream-select-paths.js`
- Read: `tools/test262/runner.js`
- Test: `test/test262-runner.test.js`
- Test: `test/test262-async.test.js`
- Test: `test/module-test262.test.js`
- Test: `test/node/upstream-select.test.js`

**Interfaces:**

- Consumes: `parseTest262Metadata`, `expandVariants`, `decideSkip`, `runTest262`, feature probes, feature areas, and the pinned upstream tree.
- Produces: an explicit, executable release policy for `generators`, Promise coverage, `module`, `async`, strictness flags, exclusions, and selection; no metadata category is accepted accidentally.

- [ ] **Step 1: Add a RED contract for the final supported metadata policy**

In `test/ci/full-contract.test.js`, replace the stale generator-neighbor assumption and add assertions that:

```text
the feature manifest contains an executable "generators" probe;
the Promise focused paths remain runnable with their exact Symbol feature set;
module roots remain in the focused release suite and are not admitted by the
script-oriented broad selector;
async Promise roots remain in the focused release suite and execute only when
the runner's guest $DONE hooks exist;
async-functions, async-iteration, async generators, dynamic import, and later
class/object features remain unsupported neighbors;
every newly selected path either belongs to the preserved known-good baseline
or carries metadata explicitly claimed by the most-specific feature area/flag policy.
```

Run:

```bash
node test/run-ci-contract.js test/ci/full-contract.test.js
```

Expected: FAIL on the first stale release-policy assertion, before policy data changes.

- [ ] **Step 2: Add deterministic Node contract tests for every policy input**

In `test/node/workflow-contract.test.js`, assert:

```text
feature names are sorted and unique;
the generators probe executes a declaration, next/yield/resume, return, and @@iterator identity;
module and async are flags, not invented feature names;
UNSUPPORTED_FLAGS remains exactly the host/nondeterministic flags;
the focused Promise, generator, and module path lists are sorted and have zero overlap with unsupported neighboring features;
selection policy changes are represented in structured JSON rather than path-specific code branches.
```

Run:

```bash
node test/run-node.js test/node/workflow-contract.test.js
```

Expected: FAIL until the final manifest/policy is wired.

- [ ] **Step 3: Add the exact generator feature probe**

Add a sorted `generators` entry to `tools/test262/features.json` whose probe is equivalent to:

```js
function* sequence() {
  var input = yield 1;
  return input + 1;
}
var iterator = sequence();
if (iterator[Symbol.iterator]() !== iterator) {
  throw new Error('generator is not iterable');
}
var first = iterator.next();
var second = iterator.next(2);
if (first.value !== 1 || first.done || second.value !== 3 || !second.done) {
  throw new Error('generator resume semantics failed');
}
```

Its `tests` list must contain exact pinned generator files that declare `features: [generators]` and pass in `test/ci/es2015-generator-test262.test.js`.

Add `generators` to `tools/test262/es5-selection.json`'s sorted `expansionFeatures`. Add exact-file feature areas for the 11 focused generator roots, using only the metadata names already supplied by the focused suite:

```text
generators
Symbol.iterator
Symbol.toStringTag
computed-property-names
```

An exact-file area may claim only the tags on that pinned file. Do not use a broad `test/language`, `test/built-ins/GeneratorFunction`, or `test/built-ins/GeneratorPrototype` prefix; the release expands the generated report to the already-proven generator roots without claiming their unsupported neighbors.

- [ ] **Step 4: Keep module and async as focused flags, not broad feature probes**

Keep `module` and `async` out of `features.json`. Preserve `module-code` in the broad selector's excluded language directories, and do not add an async expansion feature. Assert that the focused release suite owns these flag paths:

```text
module execution is confined to focused test/language/module-code roots and uses parseModule/evaluateModule;
async execution requires guest $DONE plus deterministic Agent#runJobs;
module+async is unsupported unless a focused pinned file proves that exact combination;
raw remains mutually exclusive with module and async;
onlyStrict/noStrict expansion remains unchanged;
unsupported host-blocking and non-deterministic flags still skip.
```

Add pure unit cases in `test/node/upstream-select.test.js` that prove module paths remain excluded before source reads and generator paths are admitted only by exact generator feature areas.

- [ ] **Step 5: Audit Promise selection without inventing a Test262 feature**

At the pinned revision, inspect the focused Promise roots' metadata. Promise tests without a `Promise` feature tag remain in the focused release suite. Do not add a fake `Promise` feature name or reopen all of `test/built-ins/Promise`. Add a contract assertion that every Promise release root is in the sorted focused list and runs with only its declared Symbol feature names.

- [ ] **Step 6: Run targeted policy and runner tests**

Run:

```bash
node test/run-node.js \
  test/test262-runner.test.js \
  test/test262-async.test.js \
  test/module-test262.test.js \
  test/node/upstream-select.test.js \
  test/node/workflow-contract.test.js
```

Expected: all results pass. Do not run the broad upstream suite yet.

- [ ] **Step 7: Obtain separate task reviews and commit**

Dispatch a fresh specification reviewer to compare metadata behavior with Test262's `INTERPRETING.md` at the pinned checkout and the approved umbrella design. Dispatch a separate quality reviewer for deterministic selection, path-policy narrowness, and false conformance claims. Fix and re-review until clean.

Commit:

```bash
git add \
  test/ci/full-contract.test.js \
  test/node/workflow-contract.test.js \
  test/test262-runner.test.js \
  test/test262-async.test.js \
  test/module-test262.test.js \
  test/node/upstream-select.test.js \
  tools/test262/features.json \
  tools/test262/es5-selection.json
git commit -m "test262: audit async runtime release policy" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 4: Make Focused Pinned Coverage a Permanent Exact-SHA CI Gate

**Files:**

- Modify: `package.json`
- Modify: `tools/ci/pipeline.js`
- Modify: `test/node/workflow-contract.test.js`
- Modify: `test/ci/full-contract.test.js`
- Generate: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: the three existing focused suites under `test/ci/`.
- Produces: `npm run test262:es2015-release` and one generated CI job that runs Promise, generator, and module pinned suites together under `TZ=UTC`.

- [ ] **Step 1: Add the RED workflow contract**

Change the independent expected command table to require:

```js
'test262-es2015-release': 'npm run test262:es2015-release',
```

Require the parsed workflow job to:

```text
check out the package.json Test262 pin;
run all three focused suite files;
set TZ=UTC;
avoid regenerating broad report artifacts;
remain dependent on vendor integrity.
```

Run:

```bash
node test/run-node.js test/node/workflow-contract.test.js
```

Expected: FAIL because the release job and script do not exist.

- [ ] **Step 2: Add the combined focused script**

In `package.json`, replace the module-only release script with:

```json
"test262:es2015-release": "node test/run-node.js test/ci/es2015-promise-test262.test.js test/ci/es2015-generator-test262.test.js test/ci/es2015-module-test262.test.js"
```

Keep `test262:modules` only if external documentation or a contract still names it; otherwise update those exact references in the same task.

- [ ] **Step 3: Generate the release Test262 CI job**

In `tools/ci/pipeline.js`, replace `test262-modules` with:

```text
id: test262-es2015-release
name: Pinned Test262 ES2015 async runtime and modules
command: npm run test262:es2015-release
environment: TZ=UTC
needs: vendor
```

Use the same pinned checkout and immutable actions as the existing module job.

- [ ] **Step 4: Regenerate and verify the workflow**

Run:

```bash
npm run ci:generate
npm run ci:check
node test/run-node.js test/node/workflow-contract.test.js
TZ=UTC npm run test262:es2015-release
```

Expected: the generated YAML contains the combined job and all focused records pass with zero skips.

- [ ] **Step 5: Obtain separate task reviews and commit**

Dispatch a specification reviewer for exact pin, UTC, all three suites, and generated-workflow ownership. Dispatch a quality reviewer for duplicated commands, stale module-only names, and workflow drift. Fix and re-review until clean.

Commit:

```bash
git add package.json tools/ci/pipeline.js test/node/workflow-contract.test.js test/ci/full-contract.test.js .github/workflows/ci.yml
git commit -m "ci: gate the complete ES2015 async runtime" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 5: Generate Deterministic Selection, Report, and Conformance Evidence

**Files:**

- Generate: `tools/test262/upstream-subset.json`
- Generate: `docs/test262-report.jsonl`
- Modify generated block and release prose: `docs/conformance.md`
- Modify only if supported selection changes require it: `tools/test262/es5-selection.json`

**Interfaces:**

- Consumes: the audited policy from Task 3 and pinned Test262 checkout.
- Produces: byte-stable UTC selection/report/coverage artifacts and final prose that no longer describes generators/modules/broad release evidence as deferred.

- [ ] **Step 1: Generate the selection under UTC**

Run:

```bash
TZ=UTC npm run test262:select
TZ=UTC npm run test262:select:check
```

Expected: the check reports the generated subset is current. Review every newly added group/path; remove any unsupported neighboring feature by narrowing structured policy, never by hiding a failure in the report.

- [ ] **Step 2: Run the one intentional broad local generation**

Run:

```bash
NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream
TZ=UTC npm run test262:exclusions:check
NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream:check
```

Expected: zero failures, zero stale exclusions, and current generated files. If a newly admitted path fails, classify whether the policy overclaimed it or the merged implementation has a focused integration bug. Narrow an overclaim with a reviewed policy fix; route a substantial missing feature out of release.

- [ ] **Step 3: Prove byte determinism**

Save hashes, rerun generation, and compare:

```bash
shasum -a 256 tools/test262/upstream-subset.json docs/test262-report.jsonl docs/conformance.md
TZ=UTC npm run test262:select
NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream
shasum -a 256 tools/test262/upstream-subset.json docs/test262-report.jsonl docs/conformance.md
git diff --check
```

Expected: both hash sets are identical.

- [ ] **Step 4: Update only non-generated conformance prose**

Change `docs/conformance.md` so it:

```text
describes all four released layers;
removes statements that generator, module, or broad release evidence is deferred;
states exactly which Promise/generator/module/async paths are focused versus broad;
states that module and async are Test262 flags, not feature names;
preserves unsupported async functions/generators/iteration and dynamic import;
does not duplicate generated live counts outside the generated coverage block.
```

- [ ] **Step 5: Obtain separate task reviews and commit**

Dispatch a specification reviewer for exact generated claims versus the JSONL report and subset. Dispatch a quality reviewer for reproducibility, hand-edited generated content, and stale prose. Fix and re-review until clean.

Run:

```bash
TZ=UTC npm run test262:select:check
NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream:check
npm run format
```

Commit:

```bash
git add tools/test262/upstream-subset.json docs/test262-report.jsonl docs/conformance.md
git commit -m "docs: publish async runtime conformance evidence" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 6: Run the Complete Local Release Gate

**Files:**

- Verify: all changed files
- Do not create ad hoc evidence files in the repository

**Interfaces:**

- Consumes: Tasks 1-5.
- Produces: one reviewed release candidate SHA ready to push.

- [ ] **Step 1: Run repository quality and generated-file checks**

Run:

```bash
npm run vendor:check
npm run format
npm run lint
npm run typecheck
npm run ci:check
TZ=UTC npm run test262:select:check
NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream:check
npm run test262:exclusions:check
```

Expected: every command exits zero.

- [ ] **Step 2: Run full Node and fixture suites**

Run:

```bash
npm run test:node
TZ=UTC npm run test262:fixtures
TZ=UTC npm run test262:es2015-release
```

Expected: all emitted records pass, with zero focused Test262 skips.

- [ ] **Step 3: Run portable Chromium, local JSC when available, and benchmark smoke**

Run:

```bash
npm run test:browser
if command -v jsc >/dev/null 2>&1; then npm run test:jsc; else printf '%s\n' 'Local jsc unavailable; exact-SHA CI remains required'; fi
npm run benchmark:smoke
```

Expected: Chromium and benchmark smoke pass; JSC passes when installed. Local JSC absence is not a release failure because the exact-SHA CI JSC gate is mandatory.

- [ ] **Step 4: Run the repository CI contract**

Run:

```bash
TZ=UTC npm run ci:contract
```

Expected: all real command, browser, pinned Test262, selection, report, and coverage contract cases pass.

- [ ] **Step 5: Confirm a clean generated tree**

Run:

```bash
git status --short
git diff --check
git diff --exit-code -- .github/workflows/ci.yml tools/test262/upstream-subset.json docs/test262-report.jsonl
```

Expected: no uncommitted generated drift.

### Task 7: Perform the Maximum-Capability Whole-Milestone Review

**Files:**

- Review: merge-base `94bc89d2128df5875818759c8394290d6ed8b239..HEAD`
- Review: merged child implementations from `6e5f203`, `21e1c21`, and `94bc89d`
- Review: approved design and final conformance evidence

**Interfaces:**

- Consumes: the complete milestone implementation and all release evidence.
- Produces: no unresolved high-confidence correctness finding at the exact reviewed SHA.

- [ ] **Step 1: Dispatch a maximum-capability whole-milestone reviewer**

Use a GPT-5.6-family model at maximum effort. Give it:

```text
Review the complete #28 milestone, not only the layer-4 diff. Verify Agent job
ownership/FIFO/scheduler recovery, ES2015 Promise semantics and Realm selection,
generator continuation/state/yield* correctness, transactional module
loading/linking/evaluation/live bindings/namespaces, loader-host-Promise versus
guest-job separation, Test262 policy honesty, cross-host portability, generated
evidence, and release CI. Report only high-confidence correctness, security, or
conformance findings. Treat substantial missing features as release blockers,
not cleanup suggestions.
```

- [ ] **Step 2: Reproduce each accepted behavior finding as RED**

For every accepted correctness finding:

1. Add the smallest portable failing regression.
2. Run it and save the expected failure.
3. Apply the smallest fix.
4. Run adjacent suites and targeted Test262 only.
5. Obtain fresh specification and quality reviews.

Do not act on stylistic or speculative findings.

- [ ] **Step 3: Re-run the whole-milestone reviewer**

Repeat the maximum-capability review on the new exact HEAD until it returns no unresolved high-confidence finding.

- [ ] **Step 4: Re-run affected release gates and commit fixes**

Run the targeted suites for each fix, then:

```bash
npm run typecheck
npm run lint
npm run format
TZ=UTC npm run test262:es2015-release
```

Commit each coherent fix separately with the required co-author trailer.

### Task 8: Open the Release PR and Pass Exact-SHA CI

**Files:**

- GitHub PR for the current branch
- Evidence comments on #61 while CI/review progresses

**Interfaces:**

- Consumes: exact reviewed local HEAD.
- Produces: a release PR whose head SHA and every terminal CI check are verified.

- [ ] **Step 1: Push the reviewed head**

Run:

```bash
git push --set-upstream origin HEAD
git rev-parse HEAD
```

Save the exact pushed SHA.

- [ ] **Step 2: Open the release PR**

The PR body must include:

```text
Closes #61
Parent milestone: #28
Roadmap: #24
Base SHA: 94bc89d2128df5875818759c8394290d6ed8b239
Reviewed head SHA: $HEAD_SHA
Stable interfaces inherited from #63/#64/#65
Portable integration scenarios
Test262 policy and generated artifact evidence
Node/Chromium/JSC/benchmark/repository gate evidence
Whole-milestone review result
```

Use the repository's PR creation tool or `gh pr create`; do not claim exact-SHA CI before it completes.

- [ ] **Step 3: Resolve the workflow run by exact pushed SHA**

Run:

```bash
gh run list --repo yoonbuck/jsjs --event pull_request --limit 30 \
  --json databaseId,headSha,status,conclusion,url
```

Select only the run whose `headSha` equals the saved pushed SHA. Do not watch the newest run by time alone.

- [ ] **Step 4: Synchronously watch the exact run**

Save the selected database ID as `RUN_ID`, then run `gh run watch "$RUN_ID" --repo yoonbuck/jsjs --exit-status` with a 10-minute synchronous wait. If it backgrounds, continue only with `read_bash` on the same shell ID using 600-second waits until terminal. Do not rerun the watch command in a new shell.

- [ ] **Step 5: Verify PR head and all terminal checks**

Run:

```bash
gh pr view --repo yoonbuck/jsjs --json number,headRefOid,state,url
gh pr checks --repo yoonbuck/jsjs --required
gh run view "$RUN_ID" --repo yoonbuck/jsjs --json headSha,status,conclusion,jobs,url
```

Expected:

```text
PR headRefOid equals the reviewed pushed SHA;
run headSha equals the reviewed pushed SHA;
run status is completed and conclusion is success;
every expected generated workflow job is terminal and successful;
no required check is pending, skipped unexpectedly, cancelled, or stale.
```

- [ ] **Step 6: Fix any CI failure without weakening a gate**

Reproduce the failure locally, add RED coverage for behavior changes, apply the focused fix, repeat task reviews, rerun affected local gates, push a new SHA, and restart exact-SHA resolution from Step 3.

### Task 9: Audit Evidence, Merge, and Close the Milestone

**Files:**

- GitHub issues: #60, #59, #62, #61, #28, #24
- GitHub PRs: #63, #64, #65, and the release PR

**Interfaces:**

- Consumes: successful exact-SHA CI and clean whole-milestone review.
- Produces: squash-merged release, exact merge evidence, and correctly closed #61/#28/#24.

- [ ] **Step 1: Freshly audit every child**

Query all child issues/PRs and verify:

```text
#60 / PR #63 has exact merge SHA 6e5f203c96e56b4cd84f0f74aa5d120b0d003aa4 and CI run 31856484890;
#59 / PR #64 has exact merge SHA 21e1c218a5a49288620a5c16c26a75c6485c59db and CI run 31882489016;
#62 / PR #65 has exact merge SHA 94bc89d2128df5875818759c8394290d6ed8b239 and CI run 31896144053;
each child is closed and contains stable interfaces plus validation evidence;
the release PR still points at the reviewed SHA and all checks remain successful.
```

- [ ] **Step 2: Post pre-merge release evidence**

Comment on #61 with:

```text
base SHA, reviewed head SHA, PR URL, exact workflow run URL, every gate result,
portable integration scenarios, focused and broad pinned Test262 counts,
generated artifact determinism, whole-milestone review result, and confirmation
that no substantial feature work was hidden in release cleanup.
```

Update #28 and #24 with the same exact-head evidence while leaving them open until merge.

- [ ] **Step 3: Squash-merge only the still-green reviewed head**

Immediately recheck PR head and checks, then run:

```bash
SQUASH_SUBJECT='release: integrate async runtime and modules'
SQUASH_BODY=$'Release the reviewed async runtime and modules milestone.\n\nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>'
printf '%s\n' "$SQUASH_BODY" | grep -Fqx 'Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>' || {
  echo 'squash body is missing the required Copilot App trailer' >&2
  exit 1
}
gh pr merge "$PR_NUMBER" --repo yoonbuck/jsjs --squash --delete-branch --subject "$SQUASH_SUBJECT" --body "$SQUASH_BODY"
```

Before merging, verify that the exact trailer
`Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>` is
present in the squash body passed to `gh pr merge`.

Resolve and save the exact merge SHA from:

```bash
gh pr view "$PR_NUMBER" --repo yoonbuck/jsjs --json state,mergeCommit,headRefOid,url
```

- [ ] **Step 4: Verify main contains the release**

Run:

```bash
git fetch origin --quiet
git merge-base --is-ancestor "$MERGE_SHA" origin/main
```

Expected: exit zero.

- [ ] **Step 5: Publish final evidence and close in dependency order**

Post the exact merge SHA and final stable release boundary to #61, then close #61. Re-query all four children of #28; if all are closed with exact evidence, post the final acceptance table and close #28. Re-query every roadmap milestone in #24; if each is closed and the roadmap acceptance statement is accurate, post the final roadmap evidence and close #24.

- [ ] **Step 6: Report completion to the coordinator**

Send the coordinator:

```text
release PR URL and number;
reviewed head SHA and exact CI run;
squash merge SHA;
#61/#28/#24 final states;
final portable and Test262 evidence;
any explicitly deferred substantial feature issue.
```

## 2026-08-19 Recovery Execution Ledger

The preserved release candidate was recovered at
`5a9db65e17a8b46f9e20880d902b1bca398f2863`. After fetching, current
`origin/main` was `5326cc6e0753087db34df4b5d8c637902f57fb88`, and that exact SHA is
the candidate's merge base. The worktree was clean, so no reconciliation commit
was required.

- [x] Recover the clean candidate and verify current `origin/main` ancestry.
- [x] Audit #61, parent #28, roadmap #24, the implementation plan, and all
      tracked SDD fix reports.
- [x] Preserve the #66/#67 merged semantics, generated UTC artifacts, CodeQL
      fixes, and both intentionally non-extractable `.js.txt` fixtures.
- [x] Run fresh targeted Node validation: 559 passed, 0 failed.
- [x] Run fresh targeted Chromium validation: 634 passed, 0 failed.
- [x] Run the focused UTC Promise/generator/module Test262 release gate: 4
      passed, 0 failed.
- [x] Run the portable fixture adapter: 17 passed, 0 failed, 1 expected
      unsupported-feature skip. `test/parse-negative.js.txt` executed in both
      variants.
- [x] Run the runner regression that proves
      `test/parse-negative.js.txt` and
      `malformed/negative-without-type.js.txt` remain non-extractable while the
      runner can read and classify them.
- [x] Verify the generated Test262 selection: 14,107 paths across 58 groups.
- [x] Pass type checking, lint, formatting, vendor drift, generated CI drift,
      Unicode drift, `git diff --check`, repository invariants, workflow contracts,
      and benchmark smoke.
- [x] Recover exact-candidate full-host evidence from
      `origin-main-blocker-report.md`: Node 2,238, Chromium 2,095, and JavaScriptCore
      2,095 passed with no failures. JavaScriptCore has no focused suite selector,
      so the already recorded exact-candidate full portable run was not duplicated.
- [x] Obtain a fresh scoped review of the final origin-main blocker fix: no
      significant issues found.
- [x] Obtain a maximum-capability GPT-5.6-family whole-milestone review of the
      exact final main-based candidate.
- [x] Fix the review's three Important and two Minor findings RED-first. The
      exact fix commit is `193902bff5899d8a9752e0579ef4a43da4d85305`.
- [x] Obtain scoped re-review of the first review-fix wave: no significant
      issues found.
- [x] Repeat the maximum-capability whole-milestone review. It closed all five
      prior findings and found one Important Acorn shared-empty-array compatibility
      defect.
- [x] Fix the Acorn shared-empty-array defect RED-first in
      `dc4d814cfc3126f9e7b4f06b5093e13a9cce979f`.
- [x] Obtain scoped re-review of the parser fix: no significant issue.
- [x] Repeat the maximum-capability whole-milestone review. It found the final
      checkout-dependent Node import, inherited cross-Agent coercion protocols,
      and Test262 identifier portability issues.
- [x] Fix those findings RED-first in
      `3b926e1d4d0c6ba73d20c9a7a33fd888aa9ec4a2`. Scoped review additionally
      found URL scheme/drive and harness-include boundary escapes; both were
      fixed RED-first, and final scoped re-review was clean.
- [x] Re-run the final host and repository gates: Node 2,247, Chromium 2,103,
      JavaScriptCore 2,103, focused UTC Test262 4, fixtures 17 plus 1 expected
      skip, generated selection 14,107 paths across 58 groups, and benchmark
      smoke all passed.
- [ ] Repeat the maximum-capability whole-milestone review on exact head
      `3b926e1d4d0c6ba73d20c9a7a33fd888aa9ec4a2` until it has no unresolved
      high-confidence finding.
- [x] Review exact candidate `513ffff` across the complete milestone. It found
      sequential link-error caching, host-thrown `ModuleLoaderError` boundary
      bypass, and stale Promise `@@species` limitations prose.
- [x] Fix both loader findings RED-first and correct the documentation in
      `c2042232e21833cad89e39e9b95afb6df272d36b`. Fresh scoped review returned
      no significant issues.
- [x] Re-run final host evidence: Node 2,248, Chromium 2,104, JavaScriptCore
      2,104, focused UTC Test262 4, fixtures 17 plus 1 expected skip, and all
      static/generated/benchmark gates passed.
- [ ] Repeat the maximum-capability whole-milestone review on the exact
      evidence-bearing head until it has no unresolved high-confidence finding.
- [ ] Push the reviewed head, open the focused release PR, and synchronously
      watch the exact `ci.yml` pull-request run.
- [ ] Verify both post-squash CodeQL default-setup analyses on the exact main
      merge SHA, then audit and close #61, #28, and #24 only if every criterion and
      child is complete.

No broad upstream Test262 command was run locally during recovery. The broad
pinned Test262 subset and full JavaScriptCore registry remain authoritative in
exact-head GitHub CI.
