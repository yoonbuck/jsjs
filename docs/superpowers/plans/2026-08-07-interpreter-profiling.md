# Interpreter Profiling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture reproducible CPU and sampled-allocation evidence for jsjs cold and steady benchmark workloads, then publish a ranked, quantified hotspot report tied to benchmark checksums and timings.

**Architecture:** A portable profiling core selects existing benchmark workloads, executes only the jsjs lane with explicit warmup and iteration counts, verifies every checksum, and summarizes protocol profiles into stable frame and subsystem totals. Thin Node Inspector and Chromium CDP adapters collect raw `.cpuprofile` and `.heapprofile` files beneath an ignored output directory; JavaScriptCore contributes the same benchmark timing/checksum baseline and documented shell-profiler limitations.

**Tech Stack:** ES2020 JavaScript with JSDoc checking, existing benchmark workloads/executors, Node `inspector`, Playwright Chromium CDP, JavaScriptCore `jsc`, repository test harness.

## Global Constraints

- Profile the merged benchmark harness on current `main`; do not create alternative workloads when an existing checksummed workload covers the path.
- Cover cold and steady execution for arithmetic loops, calls/recursion, object properties, and arrays.
- Attribute evidence for object/property, arrays, arithmetic, calls, references/environments, completions, and realm/setup.
- Every captured target records host/version, workload, mode, committed expected checksum, observed checksum, warmups, measured iterations, elapsed time, and artifact names.
- Raw `.cpuprofile`, `.heapprofile`, and generated run metadata remain ignored local artifacts under `.benchmark-results/profiles/`.
- Commit concise methodology and ranked evidence, not large machine-specific raw profiles.
- Add no runtime dependency and no CI performance threshold.
- Do not implement optimizations owned by #42 or architecture experiments owned by #40.

---

### Task 1: Portable profiling target and profile summarization

**Files:**

- Create: `benchmark/profile/config.js`
- Create: `benchmark/profile/target.js`
- Create: `benchmark/profile/summarize.js`
- Create: `test/profiling-core.test.js`
- Modify: `test/suites.js`

**Interfaces:**

- Produces: `parseProfileArguments(args)` returning `{ host, workload, mode, metrics, warmups, iterations, samplingInterval, outputDirectory }`.
- Produces: `createProfileTarget({ workload, mode, warmups, iterations, now, engine })` returning `{ runWarmups(), runMeasured(), expectedChecksum }`.
- Produces: `summarizeCpuProfile(profile)` and `summarizeAllocationProfile(profile)` returning `{ total, frames, categories }`.
- Produces: `classifyProfileFrame(frame)` with stable categories `object-property`, `arrays`, `arithmetic`, `calls`, `references-environments`, `completions`, `realm-setup`, `parser`, `evaluator`, `other-runtime`, and `host`.

- [ ] **Step 1: Write failing configuration and target tests**

Add tests that select `object-properties`, reject unknown hosts/workloads/modes,
require positive integer counts, and prove exact warmup/measured invocation counts:

```js
const options = parseProfileArguments([
  '--host=node',
  '--workload=object-properties',
  '--mode=steady',
  '--metric=cpu',
  '--warmups=2',
  '--iterations=3',
]);
assertSame(options.workload, 'object-properties');
assertSame(options.mode, 'steady');
assertSame(options.metrics.join(','), 'cpu');

const calls = [];
const target = createProfileTarget({
  workload: workloadsForProfile('smoke')[0],
  mode: 'steady',
  warmups: 2,
  iterations: 3,
  now: () => calls.length,
  engine: fixtureEngine(calls),
});
target.runWarmups();
const result = target.runMeasured();
assertSame(calls.length, 5);
assertSame(result.iterations, 3);
assertSame(result.checksum, target.expectedChecksum);
```

- [ ] **Step 2: Run the focused suite and verify red**

Run: `node test/run-node.js test/profiling-core.test.js`

Expected: FAIL because the profiling modules do not exist.

- [ ] **Step 3: Implement strict argument parsing and checksummed target execution**

Use `resolveBenchmarkConfig({ profile: 'default', workloads: [name] })` for
selection. Reuse `createJsjsExecutors`; create the executor once so steady setup
stays outside capture while its `cold()` path still creates a realm and parses on
every invocation. Validate every warmup and measured return value:

```js
function invokeChecked(execute, expectedChecksum, context) {
  const checksum = execute();
  if (checksum !== expectedChecksum) {
    throw new Error(
      `${context} checksum mismatch: expected ${expectedChecksum}, got ${checksum}`,
    );
  }
  return checksum;
}
```

Require repository-relative output beneath `.benchmark-results/`, matching the
benchmark CLI's path-safety contract.

- [ ] **Step 4: Write failing synthetic profile summary tests**

Construct a CPU fixture whose `samples` select frames from
`src/runtime/object.js` and `src/runtime/environment.js`, and an allocation
fixture whose tree assigns sampled bytes to `src/runtime/array-object.js`.
Assert exact self-time/byte totals and category rankings.

- [ ] **Step 5: Implement deterministic frame and category summaries**

For CPU profiles, join `samples[index]` to node IDs and add the corresponding
`timeDeltas[index]` to that frame's self time. For allocation profiles, walk the
profile tree and add each node's `selfSize` to its frame. Normalize repository
URLs to `src/...`, sort descending by total then lexical frame key, and retain
both absolute totals and percentages.

- [ ] **Step 6: Run the focused suite and verify green**

Run: `node test/run-node.js test/profiling-core.test.js`

Expected: all profiling configuration, target, checksum, and summary tests pass.

- [ ] **Step 7: Commit**

```sh
git add benchmark/profile/config.js benchmark/profile/target.js benchmark/profile/summarize.js test/profiling-core.test.js test/suites.js
git commit -m "feat: add portable interpreter profiling core"
```

### Task 2: Node Inspector and Chromium CDP profile capture

**Files:**

- Create: `benchmark/profile/protocol.js`
- Create: `benchmark/profile/run-node.js`
- Create: `benchmark/profile/run-browser.js`
- Create: `benchmark/profile/run-browser-page.js`
- Create: `benchmark/profile/cli.js`
- Create: `test/node/profiling-cli.test.js`
- Modify: `test/run-browser.js`
- Modify: `package.json`

**Interfaces:**

- Consumes: Task 1 profile options, target runner, and summarizers.
- Produces: `captureProtocolProfiles({ post, metrics, samplingInterval, run })`.
- Produces: `runNodeProfile(options)` and `runChromiumProfile(options)`.
- Produces: `node benchmark/profile/cli.js` and package scripts `profile:node`, `profile:browser`, and `profile:smoke`.

- [ ] **Step 1: Write failing protocol lifecycle tests**

Use a fake `post(method, params)` that records calls and returns synthetic stop
profiles. Assert the sequence enables domains, sets intervals, starts requested
metrics, invokes `run` once, stops metrics, and disables domains in `finally`.
Assert protocol failures propagate and do not produce success-shaped metadata.

- [ ] **Step 2: Run the focused test and verify red**

Run: `node test/run-node.js test/node/profiling-cli.test.js`

Expected: FAIL because protocol capture and host runners do not exist.

- [ ] **Step 3: Implement the shared DevTools-protocol collector**

Use `Profiler.setSamplingInterval` before `Profiler.start`, and
`HeapProfiler.startSampling` with the same interval expressed in bytes. Stop
allocation sampling before CPU sampling, then disable enabled domains even when
target execution or a stop command fails. Return raw protocol objects plus the
target result without writing files.

- [ ] **Step 4: Implement the Node host and atomic artifact output**

Wrap `node:inspector` callback posting in a promise, run the portable target in
the current process, summarize returned profiles, and atomically write:

```text
.benchmark-results/profiles/node/<workload>-<mode>.cpuprofile
.benchmark-results/profiles/node/<workload>-<mode>.heapprofile
.benchmark-results/profiles/node/<workload>-<mode>.json
```

The JSON sidecar contains schema version `1`, runtime metadata, git commit,
capture configuration, checksum result, elapsed milliseconds, summary totals,
and relative raw artifact names.

- [ ] **Step 5: Implement the Chromium host**

Reuse the benchmark browser route boundary and loader origin. Create a CDP
session for the benchmark page, start protocol capture from Node, and call
`page.evaluate` to import `run-browser-page.js`, construct the portable target,
and execute warmups before capture plus measured iterations during capture.
Write the same sidecar shape under `profiles/chromium/`.

- [ ] **Step 6: Add CLI and smoke contracts**

Add package scripts:

```json
"profile:node": "node benchmark/profile/cli.js --host=node",
"profile:browser": "node benchmark/profile/cli.js --host=chromium",
"profile:smoke": "node benchmark/profile/cli.js --host=node --workload=arithmetic-loops --mode=steady --metric=cpu --warmups=1 --iterations=1 --output=.benchmark-results/profile-smoke"
```

The Node smoke test spawns `profile:smoke`, reads its sidecar and CPU profile,
asserts the committed checksum, positive elapsed time, nonempty samples, and
removes its output. Browser tests use a fake CDP session to check orchestration
without requiring performance assertions.

- [ ] **Step 7: Run focused Node and browser contracts**

Run:

```sh
node test/run-node.js test/profiling-core.test.js test/node/profiling-cli.test.js
npm run test:browser
```

Expected: profiling unit/smoke contracts and the complete browser suite pass.

- [ ] **Step 8: Commit**

```sh
git add benchmark/profile package.json test/node/profiling-cli.test.js test/run-browser.js
git commit -m "feat: capture Node and Chromium interpreter profiles"
```

### Task 3: Reproducible baseline and ranked evidence report

**Files:**

- Create: `docs/profiling.md`
- Modify: `README.md`
- Modify: `docs/benchmarking.md`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: existing benchmark JSON plus Task 2 profile sidecars and raw files.
- Produces: exact reproduction commands, runtime/commit metadata, a benchmark correlation table, ranked CPU/allocation categories, optimization candidates, and explicit JSC limitations.

- [ ] **Step 1: Capture the timing baseline**

Run all available hosts from one shared benchmark invocation:

```sh
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
  node benchmark/cli.js run --host=all --output=.benchmark-results/profiling-baseline
node benchmark/cli.js summary \
  --input=.benchmark-results/profiling-baseline \
  --output=.benchmark-results/profiling-baseline
```

If Chromium is not installed, install the locked Playwright shell and repeat.
Preserve the ignored reports for local audit.

- [ ] **Step 2: Capture cold and steady CPU/allocation profiles**

For `arithmetic-loops`, `calls-recursion`, `object-properties`, and `arrays`,
run both modes on Node and Chromium with explicit warmup and iteration counts.
Choose counts that produce at least 250 ms of measured profile time and record
the exact count in each sidecar and the methodology table.

- [ ] **Step 3: Check profile/benchmark checksum correlation**

For every host/workload/mode row, compare the sidecar's `expectedChecksum` and
`checksum` with the matching benchmark report row. Fail the evidence pass if any
value differs. Record benchmark median, profile elapsed/iteration, and profile
sample total together so no hotspot claim is detached from its workload cost.

- [ ] **Step 4: Write the evidence report**

Document:

1. machine, commit, Node/Chromium/JSC versions, commands, artifact policy, and
   cold/steady boundaries;
2. timing/checksum correlation by host, workload, and mode;
3. ranked subsystem CPU share and sampled allocation share with dominant frames;
4. cold-minus-steady setup evidence for parser, realm, builtins, and environment
   construction;
5. optimization candidates with estimated upper-bound benefit, implementation
   risk, correctness risk, and ownership notes excluding #42 and #40;
6. JSC evidence gathered from the benchmark plus why the system shell does or
   does not expose stable function-level CPU/allocation profiles.

- [ ] **Step 5: Document commands and artifact policy**

Add `/.benchmark-results/` coverage explicitly to `.gitignore`, link
`docs/profiling.md` from the README, and add a short profiling section to
`docs/benchmarking.md` that points to the profile CLI and states that raw
profiles are local generated evidence rather than baselines.

- [ ] **Step 6: Commit**

```sh
git add .gitignore README.md docs/benchmarking.md docs/profiling.md
git commit -m "docs: report interpreter profiling evidence"
```

### Task 4: Full validation and review

**Files:**

- Modify only files required by concrete validation or review findings.

**Interfaces:**

- Consumes: all implementation and evidence from Tasks 1-3.
- Produces: a review-clean branch and pull request for issue #39.

- [ ] **Step 1: Run repository validation**

Run:

```sh
npm test
npm run test:browser
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc npm run test:jsc
npm run typecheck
npm run lint
npm run format
npm run vendor:check
npm run ci:check
npm run ci:contract
npm run profile:smoke
```

Expected: every command exits zero; the profile smoke sidecar retains the
arithmetic workload's committed checksum.

- [ ] **Step 2: Request code review**

Dispatch a read-only code reviewer over the complete branch diff. Require checks
for checksum integrity, capture boundaries, cleanup/error behavior, path safety,
profile arithmetic, host parity, and accidental #42/#40 scope.

- [ ] **Step 3: Address findings and rerun affected validation**

Fix every high-confidence correctness finding, rerun its focused contract, then
repeat the full validation commands above.

- [ ] **Step 4: Push and open the pull request**

Push the branch and open a PR that links issue #39, summarizes the portable
tooling and ranked evidence, lists validation commands, and states that raw
profiles are generated ignored artifacts.
