# ES2015 Runtime Integration and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove and, where necessary, repair the integrated ES2015 runtime foundation before closing issues #45 and #26.

**Architecture:** Add one portable integration suite that exercises boundaries between the already-merged subsystems, then audit the Test262 policy and generated artifacts as one contract. Run increasingly broad release gates only after focused diagnostics pass, and require an independent high-capability correctness review before publishing proof.

**Tech Stack:** ECMAScript modules, Node.js, Chromium/Playwright, JavaScriptCore `jsc`, Acorn 8, Test262, ESLint, Prettier, TypeScript check-JS.

## Global Constraints

- Add only integration regressions or fixes; do not expand beyond the ES2015 runtime-foundation scope.
- Write a failing regression before every runtime or tooling fix.
- Realm constructors, prototypes, and mutable intrinsics remain per-realm.
- Well-known symbols and the global symbol registry remain per-Agent.
- Preserve ES5 behavior and host-neutral execution.
- Generate Test262 selection, report, and coverage with `TZ=UTC`.
- Final review must use a GPT-5.6-family model or Claude Opus 4.8 at maximum effort; never Claude Opus 5.
- Close #45 and #26 only after every release gate passes.

---

### Task 1: Establish the Integrated Baseline

**Files:**

- Inspect: `package.json`
- Inspect: `test/suites.js`
- Inspect: `test/ci/full-contract.test.js`
- Inspect: `tools/test262/es5-selection.json`
- Inspect: `tools/test262/features.json`
- Inspect: `docs/conformance.md`

**Interfaces:**

- Consumes: repository scripts in `package.json`
- Produces: a recorded clean baseline or an exact failing command for Task 2 or Task 3

- [ ] **Step 1: Confirm the worktree contains exactly current main plus the design and plan commits**

Run:

```bash
git status --short --branch
git --no-pager log --oneline --decorate -8
```

Expected: no uncommitted files; merged commits for #38, #43, #41, #52, and #47 are ancestors of `HEAD`.

- [ ] **Step 2: Run focused portable subsystem suites**

Run:

```bash
node test/run-node.js \
  test/realms.test.js \
  test/symbols.test.js \
  test/es2015-object-function.test.js \
  test/lexical-declarations.test.js \
  test/identifier-read-fast-path.test.js \
  test/iterators.test.js \
  test/for-of.test.js
```

Expected: every selected suite passes.

- [ ] **Step 3: Run Test262 policy and repository contracts**

Run:

```bash
TZ=UTC npm run test262:select:check
npm run test262:exclusions:check
npm run ci:contract
```

Expected: generated selection is current, there are no stale exclusions, and all contract tests pass.

- [ ] **Step 4: Record any failure before editing**

For each failure, retain the command, test name, actual value, expected value, and stack trace. Route runtime interaction failures to Task 2, Test262 policy or generation failures to Task 3, and host-only failures to Task 4. If the baseline passes, proceed without modifying runtime code.

---

### Task 2: Add Cross-Subsystem Portable Regressions

**Files:**

- Create: `test/es2015-runtime-integration.test.js`
- Modify: `test/suites.js`
- Modify only if a regression fails: `src/runtime/realm.js`
- Modify only if a regression fails: `src/runtime/agent.js`
- Modify only if a regression fails: `src/runtime/object.js`
- Modify only if a regression fails: `src/runtime/function-object.js`
- Modify only if a regression fails: `src/runtime/super-reference.js`
- Modify only if a regression fails: `src/runtime/environment.js`
- Modify only if a regression fails: `src/runtime/iterator.js`
- Modify only if a regression fails: `src/evaluator/expressions.js`
- Modify only if a regression fails: `src/evaluator/statements.js`

**Interfaces:**

- Consumes: `createAgent(): Agent`, `createRealm({ agent? }): Realm`, `evaluateScript(realm, source): Completion`
- Produces: a portable `TestCase[]` suite registered once in `PORTABLE_SUITES`

- [ ] **Step 1: Create the integration-suite harness and Agent/realm tests**

Create `test/es2015-runtime-integration.test.js` with imports:

```js
import { assertSame } from './harness/assert.js';
import { createAgent } from '../src/runtime/agent.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

function val(realm, source) {
  const completion = evaluateScript(realm, source);
  if (completion.type !== 'normal') {
    throw new Error(`Expected normal completion, got ${completion.type}`);
  }
  return completion.value;
}
```

Add cases proving:

```js
const agent = createAgent();
const first = createRealm({ agent });
const second = createRealm({ agent });
assertSame(
  first.intrinsics.symbolConstructor === second.intrinsics.symbolConstructor,
  false,
);
assertSame(
  val(first, 'Symbol.iterator') === val(second, 'Symbol.iterator'),
  true,
);
assertSame(
  val(first, 'Symbol.for("shared")') === val(second, 'Symbol.for("shared")'),
  true,
);

const other = createRealm({ agent: createAgent() });
assertSame(
  val(first, 'Symbol.iterator') === val(other, 'Symbol.iterator'),
  false,
);
assertSame(
  val(first, 'Symbol.for("shared")') === val(other, 'Symbol.for("shared")'),
  false,
);
```

- [ ] **Step 2: Add mixed own-key, function metadata, and `super` tests**

Add guest assertions for:

```js
var s1 = Symbol('s1'),
  s2 = Symbol('s2');
var o = {};
o.z = 1;
o[s1] = 2;
o[2] = 3;
o.a = 4;
o[s2] = 5;
o[1] = 6;
Reflect.ownKeys(o)
  .map(function (k) {
    return typeof k === 'symbol' ? k.toString() : k;
  })
  .join(',');
```

Expected: `"1,2,z,a,Symbol(s1),Symbol(s2)"`. Also assert
`Object.getOwnPropertyNames(o).join(",") === "1,2,z,a"` and
`Object.getOwnPropertySymbols(o)[0] === s1`.

Add an accessor method inherited through a prototype, call its getter and setter
through `super`, and assert that:

```js
Object.getOwnPropertyDescriptor(child, 'value').get.name === 'get value';
Object.getOwnPropertyDescriptor(child, 'value').get.length === 0;
Object.getOwnPropertyDescriptor(child, 'value').set.name === 'set value';
Object.getOwnPropertyDescriptor(child, 'value').set.length === 1;
```

The script must verify that the inherited setter receives the child as `this`,
not the prototype.

- [ ] **Step 3: Add lexical/read/iteration interaction tests**

Add cases proving all of the following in end-to-end guest code:

```js
var closures = [];
for (let x of [1, 2, 3]) {
  closures.push(function () {
    return x;
  });
}
closures[0]() + ',' + closures[1]() + ',' + closures[2]();
```

Expected: `"1,2,3"`.

```js
var x = 'outer';
var message;
try {
  for (let x of x) {
  }
} catch (e) {
  message = e.name + ':' + e.message;
}
message;
```

Expected: `"ReferenceError:Cannot access 'x' before initialization"`.

Add direct-eval and indirect-eval probes showing direct eval sees the current
lexical binding, indirect eval sees the global environment, and neither eval's
lexical declaration leaks after evaluation.

Add an iterable whose `return` throws, then throw a TDZ `ReferenceError` from the
loop body. Assert the TDZ error remains the completion and `return` ran exactly
once. This ties together fused reads, guest error materialization, and
`IteratorClose` throw precedence.

- [ ] **Step 4: Register the suite and run it on Node**

Import the suite in `test/suites.js` and add:

```js
Object.freeze({
  file: 'test/es2015-runtime-integration.test.js',
  tests: es2015RuntimeIntegration,
}),
```

Run:

```bash
node test/run-node.js test/es2015-runtime-integration.test.js
```

Expected: PASS. If a newly added test fails, preserve the failing test and make
the smallest change in the owning runtime/evaluator file listed above. Do not
change an expectation to match implementation behavior unless the expectation
contradicts ES2015 semantics.

- [ ] **Step 5: Run the full portable Node suite**

Run:

```bash
npm run test:node
```

Expected: PASS.

- [ ] **Step 6: Commit the integration regressions and any proven fix**

```bash
git add test/es2015-runtime-integration.test.js test/suites.js src
git commit -m "test: cover ES2015 runtime integration boundaries" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Audit Test262 Claims and UTC Generation

**Files:**

- Modify if required: `tools/test262/es5-selection.json`
- Modify if required: `tools/test262/features.json`
- Modify if required: `tools/test262/es5-selection.js`
- Modify if required: `tools/test262/upstream-subset.json`
- Modify if required: `docs/test262-report.jsonl`
- Modify if required: `docs/conformance.md`
- Test: `test/es5-selection.test.js`
- Test: `test/ci/exclusions-check.test.js`
- Test: `test/ci/full-contract.test.js`
- Test: `test/ci/es2015-object-function-test262.test.js`

**Interfaces:**

- Consumes: `featureAreas`, feature probes, supported-grammar filtering, classified exclusions
- Produces: deterministic selected paths, report records, and generated coverage documentation

- [ ] **Step 1: Enumerate each ES2015 claim and its probe**

Inspect every `featureAreas` entry for Symbol, lexical declarations, iterators,
and `for`-`of`. Verify each prefix names only implemented tests and each required
feature has an exact probe in `tools/test262/features.json`. Verify object/function
focused paths are either selected by policy or intentionally retained in the
focused CI suite, never silently uncovered.

- [ ] **Step 2: Add a policy regression before correcting any mismatch**

In `test/es5-selection.test.js`, add a fixture-level assertion that reproduces
the mismatch. The assertion must identify the exact path, feature tag, and
expected include/exclude reason. Run:

```bash
node test/run-node.js test/es5-selection.test.js
```

Expected before a fix: FAIL at the new assertion. If the audit finds no mismatch,
do not edit the policy.

- [ ] **Step 3: Apply the minimal policy or probe fix**

Change only the incorrect prefix, feature list, supported-grammar decision, or
classified exclusion. Keep unsupported neighboring ES2015 syntax excluded.

- [ ] **Step 4: Regenerate under UTC**

Run:

```bash
TZ=UTC npm run test262:select
NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream
```

Expected: selection, report, and generated coverage complete successfully.

- [ ] **Step 5: Prove determinism and exclusions**

Run:

```bash
TZ=UTC npm run test262:select:check
NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream:check
npm run test262:exclusions:check
git --no-pager diff --check
```

Expected: all checks pass and a second generation produces no diff.

- [ ] **Step 6: Commit policy or generated-artifact changes only when present**

```bash
git add tools/test262 test/es5-selection.test.js docs/test262-report.jsonl docs/conformance.md
git diff --cached --quiet || git commit -m "test262: integrate ES2015 runtime coverage" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Run the Complete Cross-Host Release Matrix

**Files:**

- No source changes expected
- Generated local output ignored under: `.benchmark-results/`

**Interfaces:**

- Consumes: portable suite registry and pinned Test262 artifacts from Tasks 2-3
- Produces: complete Node, Chromium, JSC, CI, and benchmark evidence

- [ ] **Step 1: Run repository static gates**

```bash
npm run vendor:check
npm run format
npm run lint
npm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Run all portable hosts**

```bash
npm run test:node
npm run test:browser
npm run test:jsc
```

Expected: all three report the same portable suite/test totals and zero failures.

- [ ] **Step 3: Run full Test262 and CI contracts**

```bash
TZ=UTC npm run test262:fixtures
NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream:check
npm run test262:exclusions:check
npm run ci:check
npm run ci:contract
```

Expected: PASS with no generated drift.

- [ ] **Step 4: Run benchmark smoke**

```bash
npm run benchmark:smoke
```

Expected: the smoke profile completes and writes a valid summary beneath
`.benchmark-results/smoke`.

- [ ] **Step 5: Confirm tracked files are clean**

```bash
git status --short
git --no-pager diff --check
```

Expected: no uncommitted tracked changes.

---

### Task 5: Perform Independent High-Capability Review

**Files:**

- Review: all changes from `origin/main...HEAD`
- Modify only for accepted findings: files named by the finding

**Interfaces:**

- Consumes: committed integration diff and release evidence
- Produces: zero unresolved high-confidence correctness findings

- [ ] **Step 1: Dispatch the required reviewer**

Use a read-only code-review agent with `model: gpt-5.6-sol`,
`reasoning_effort: max`, and full context: issue #45, issue #26, the design, this
plan, merged subsystem contracts, and the exact validation commands already run.
Instruct it to report only high-confidence correctness, conformance, test-policy,
or release-gate gaps. Do not use Claude Opus 5.

- [ ] **Step 2: Validate each finding technically**

For every finding, reproduce it with the narrowest existing command or a new
failing regression. Reject findings contradicted by ECMA-262 behavior or existing
contracts; document the reason in the review handoff.

- [ ] **Step 3: Fix accepted findings test-first**

Add the failing regression to the nearest portable or CI suite, run it to observe
failure, make the smallest production/tooling change, and rerun the regression
plus the affected Task 4 gate.

- [ ] **Step 4: Request a final re-review**

Ask the same reviewer to inspect the updated diff and prior finding resolutions.
Expected: no unresolved high-confidence finding.

- [ ] **Step 5: Commit review-driven fixes if present**

```bash
git add src test tools docs
git diff --cached --quiet || git commit -m "fix: resolve ES2015 integration review findings" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Publish Release Proof and Close the Milestone

**Files:**

- Update only if release evidence belongs in tracked docs: `docs/conformance.md`
- Update only if behavior changed: `docs/architecture.md`
- Update only if a limitation changed: `docs/limitations.md`
- Update only if commands/contracts changed: `docs/testing.md`

**Interfaces:**

- Consumes: passing Task 4 matrix and clean Task 5 review
- Produces: pushed branch/PR when needed, issue comments with proof, closed #45 and #26

- [ ] **Step 1: Check whether current main needs an integration pull request**

```bash
git status --short
git --no-pager log --oneline origin/main..HEAD
git --no-pager diff --stat origin/main...HEAD
```

If the branch contains integration regressions, fixes, generated artifacts, or
release documentation beyond the required design/plan records, push and open a
PR. If only process records differ and repository convention keeps those records,
include them in the PR. Never create an empty PR.

- [ ] **Step 2: Push and create the PR when the branch differs**

```bash
git push -u origin HEAD
```

Create a PR titled `Integrate and release ES2015 runtime foundations` whose body
links #45 and #26, summarizes interaction coverage, and lists the exact release
commands and outcomes.

- [ ] **Step 3: Post proof to issue #45**

Use `gh issue comment 45 --repo yoonbuck/jsjs --body-file <file>` with a
temporary body containing:

- integrated commits/features,
- Node/Chromium/JSC totals,
- pinned Test262 summary and UTC generation status,
- exclusions/CI/static gate status,
- benchmark smoke status,
- independent reviewer model and result,
- PR link when one exists.

Delete the temporary file after posting.

- [ ] **Step 4: Post the milestone summary to issue #26**

Use `gh issue comment 26 --repo yoonbuck/jsjs --body-file <file>` with the same
proof condensed to the parent acceptance criteria and the #45/PR link. Delete
the temporary file after posting.

- [ ] **Step 5: Close both issues only after proof is visible**

```bash
gh issue close 45 --repo yoonbuck/jsjs --reason completed
gh issue close 26 --repo yoonbuck/jsjs --reason completed
```

Expected: both issues are closed as completed.

- [ ] **Step 6: Confirm final repository and issue state**

```bash
git status --short --branch
gh issue view 45 --repo yoonbuck/jsjs --json state,url
gh issue view 26 --repo yoonbuck/jsjs --json state,url
```

Expected: clean branch and both issue states are `CLOSED`.
