# Profiling Methodology Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct PR #50 so CPU and allocation evidence is captured independently, normalized to interpreter work, equally weighted by workload observation, and cryptographically tied to one clean source commit.

**Architecture:** Capture produces one metric-specific sidecar and raw artifact per host/workload/mode/run, using protocol-specific sampling intervals. A deterministic analyzer pairs CPU and allocation sidecars with a shared benchmark baseline, validates clean matching git/run metadata, separates overhead from interpreter samples, and averages normalized per-observation shares instead of summing profiler-inflated durations.

**Tech Stack:** ES2020 JavaScript with JSDoc checking, Node Inspector, Chromium CDP, existing benchmark/report infrastructure, repository portable and Node-only test harnesses.

## Global Constraints

- CPU and allocation must be captured in separate processes/runs; CPU evidence must come only from CPU-only profiles.
- CPU sampling interval is microseconds with default `100`; allocation sampling interval is bytes with default `32768`.
- URL normalization must select the repository `src/` path, reject dependency `node_modules/**/src/` paths as host overhead, and handle file, HTTP, absolute, and repository-relative URLs.
- Classification tests must use paths that exist under the current `src/` tree; `src/runtime/descriptors.js` and `src/builtins/object.js` are object/property, while `src/runtime/array-object.js` and `src/builtins/array.js` are arrays.
- Report interpreter-normalized CPU/allocation shares separately from inspector, harness, garbage-collector, idle, and other host overhead.
- Aggregate each host/workload/mode observation with equal weight after per-observation interpreter normalization; never weight by profiler elapsed duration.
- Benchmark and profile capture must reject a dirty git tree and persist the exact clean commit; analysis must reject dirty metadata, commit mismatch, run mismatch, missing metric pairs, and mixed capture settings.
- Analysis outputs must remain under `/.benchmark-results/`.
- Regenerate all committed evidence from corrected captures; do not reuse the combined-profiler profiles.
- Do not implement optimizations owned by #42 or architecture experiments owned by #40.

---

### Task 1: Metric-specific capture and clean source metadata

**Files:**

- Create: `benchmark/source-state.js`
- Modify: `benchmark/cli.js`
- Modify: `benchmark/run.js`
- Modify: `benchmark/run-node.js`
- Modify: `benchmark/run-browser.js`
- Modify: `benchmark/run-browser-page.js`
- Modify: `benchmark/run-jsc.js`
- Modify: `benchmark/spawn-jsc.js`
- Modify: `benchmark/report.js`
- Modify: `benchmark/profile/config.js`
- Modify: `benchmark/profile/protocol.js`
- Modify: `benchmark/profile/cli.js`
- Modify: `benchmark/profile/run-node.js`
- Modify: `benchmark/profile/run-browser.js`
- Modify: `package.json`
- Test: `test/benchmark-core.test.js`
- Test: `test/node/benchmark-cli.test.js`
- Test: `test/node/profiling-cli.test.js`

**Interfaces:**

- Produces: `readCleanSourceState()` returning frozen `{ gitCommit, gitDirty: false }`, throwing when `git status --porcelain` is nonempty.
- Benchmark report schema version `3` adds `source: { gitCommit, gitDirty: false }`; one CLI run passes identical source/run metadata to Node, Chromium, and JSC.
- `parseProfileArguments(args)` returns exactly one metric plus `runId`, `cpuSamplingIntervalMicroseconds`, and `allocationSamplingIntervalBytes`.
- `captureProtocolProfiles(options)` applies `Profiler.setSamplingInterval({ interval: cpuSamplingIntervalMicroseconds })` or `HeapProfiler.startSampling({ samplingInterval: allocationSamplingIntervalBytes })`, never both in one capture.
- Metric-specific artifacts use `<workload>-<mode>-cpu.{json,cpuprofile}` and `<workload>-<mode>-allocation.{json,heapprofile}` so separate runs do not delete each other.

- [ ] **Step 1: Write failing source-state and benchmark metadata tests**

Test injected clean/dirty git command results, schema rejection without source
metadata, one shared commit across all host runners, and no report write when the
tree is dirty.

- [ ] **Step 2: Run focused benchmark tests and verify red**

Run:

```sh
node test/run-node.js test/benchmark-core.test.js test/node/benchmark-cli.test.js
```

Expected: failures for missing source metadata and dirty-tree rejection.

- [ ] **Step 3: Implement clean source metadata end-to-end**

Read `git rev-parse HEAD` and `git status --porcelain --untracked-files=normal`
once before benchmark hosts run. Extend the report schema and every host transport
so reports persist the same source state. Do not silently substitute `"unknown"`.

- [ ] **Step 4: Write failing metric/interval/artifact tests**

Assert:

```js
parseProfileArguments([
  '--host=node',
  '--workload=arrays',
  '--mode=steady',
  '--metric=cpu',
  '--run-id=profile-run',
  '--warmups=1',
  '--iterations=1',
]).cpuSamplingIntervalMicroseconds === 100;
```

Allocation defaults to `32768`; combined or duplicate metrics fail; the wrong
interval option for the selected metric fails; CPU protocol calls never enable
`HeapProfiler`; allocation calls never enable `Profiler`; separate artifact
sets coexist.

- [ ] **Step 5: Run focused profiling tests and verify red**

Run:

```sh
node test/run-node.js test/profiling-core.test.js test/node/profiling-cli.test.js
```

Expected: failures against the current combined `samplingInterval` contract.

- [ ] **Step 6: Implement metric-specific capture**

Require one `--metric`, one nonempty `--run-id`, and a clean source state before
opening an inspector/browser. Persist:

```js
capture: {
  metric: 'cpu' | 'allocation',
  cpuSamplingIntervalMicroseconds: 100,
  allocationSamplingIntervalBytes: 32768,
  runId,
  workload,
  mode,
  warmups,
  iterations
}
source: { gitCommit, gitDirty: false }
```

Only the chosen metric's summary and artifact may appear.

- [ ] **Step 7: Verify and commit**

Run the focused suites, `npm run typecheck`, `npm run lint`, and
`npm run format`, then commit:

```sh
git commit -m "fix: separate profiling metrics and source metadata"
```

### Task 2: Real-path classification and normalized equal-weight analysis

**Files:**

- Modify: `benchmark/profile/summarize.js`
- Modify: `benchmark/profile/analyze.js`
- Test: `test/profiling-core.test.js`
- Test: `test/node/profile-analysis.test.js`

**Interfaces:**

- Produces: exported `normalizeProfileUrl(url)` returning a repository-relative
  `src/...` path only for valid repository source URLs, otherwise the unchanged
  non-source URL/empty host marker.
- Analyzer pairs exactly one CPU and one allocation sidecar for every
  host/workload/mode key.
- `profile-analysis.json` records `weighting: "equal-observation"`,
  `interpreter` summaries whose percentages use only non-host totals, and
  separate `overhead` totals/frames.

- [ ] **Step 1: Write failing real-path normalization/classification tests**

Use only current paths:

```text
src/runtime/descriptors.js
src/runtime/object.js
src/builtins/object.js
src/runtime/array-object.js
src/builtins/array.js
src/runtime/operators.js
src/runtime/function-object.js
src/runtime/environment.js
src/runtime/reference.js
src/runtime/completion.js
src/runtime/realm.js
src/parser.js
src/evaluator/expressions.js
```

Cover repository-relative paths, `file:///repo/src/...`,
`http://jsjs.localhost/src/...`, an absolute path containing an earlier
unrelated `src/` segment, and `/node_modules/pkg/src/index.js` remaining host.

- [ ] **Step 2: Run portable profiling tests and verify red**

Run: `node test/run-node.js test/profiling-core.test.js`

Expected: descriptors/builtins classifications and first-`src/` normalization fail.

- [ ] **Step 3: Implement repository source normalization and classification**

Select the last path-segment-bounded `/src/`, except when a `node_modules`
segment precedes it. Map descriptors/object builtins to `object-property`,
array runtime/builtins to `arrays`, and retain the actual runtime/evaluator
category mappings above.

- [ ] **Step 4: Write failing paired-analysis and weighting tests**

Fixtures contain distinct CPU-only and allocation-only sidecars for two
workloads with deliberately disproportionate raw totals. Assert:

- missing/duplicate metric pairs fail;
- run IDs, clean source metadata, commit, host runtime, and selected interval
  settings must match;
- an output root outside `.benchmark-results` fails;
- host/GC/idle samples are reported as overhead and excluded from interpreter
  percentages;
- a 90% category in a tiny profile and 10% in a huge profile aggregates to 50%,
  proving equal-observation rather than raw-duration weighting.

- [ ] **Step 5: Run analyzer tests and verify red**

Run: `node test/run-node.js test/node/profile-analysis.test.js`

Expected: failures because current analysis requires combined sidecars, sums raw
totals, and accepts arbitrary repository-relative output roots.

- [ ] **Step 6: Implement paired normalized analysis**

Pair metric sidecars by host/workload/mode. Join each pair to the unprofiled
baseline row. For each metric observation, remove category `host` from the
interpreter denominator, retain it under `overhead`, convert every interpreter
category/frame to a share, then take the arithmetic mean of shares over the
group's observations. Keep raw sampled totals as diagnostics only.

- [ ] **Step 7: Verify and commit**

Run both profiling suites plus typecheck/lint/format, then commit:

```sh
git commit -m "fix: normalize and weight profiling evidence"
```

### Task 3: Regenerate evidence, documentation, validation, and PR review

**Files:**

- Modify: `docs/profiling.md`
- Modify: `docs/benchmarking.md`
- Modify: `docs/testing.md`
- Modify: `README.md` only if its summary values change

**Interfaces:**

- Consumes: clean schema-v3 baseline reports, 32 metric-specific captures, and
  corrected analyzer outputs.
- Produces: reproducible commands and ranked interpreter-only evidence with a
  separate overhead table and explicit equal-observation weighting.

- [ ] **Step 1: Commit all tooling before capture and verify clean state**

Run:

```sh
git status --porcelain
git rev-parse HEAD
```

Expected: empty status and one commit recorded for all baseline/profile metadata.

- [ ] **Step 2: Capture one clean shared baseline**

Run the all-host benchmark into a fresh ignored directory with the system JSC,
then summarize it. Confirm every report records schema `3`, identical `runId`,
clean source state, and the commit from Step 1.

- [ ] **Step 3: Capture 32 separate profiles**

Generate one shared profile run ID, then run CPU and allocation separately for
Node and Chromium, four workloads, and both modes. Use CPU interval `100 µs` and
allocation interval `32768 bytes`. Each CPU measured capture must remain at
least 250 ms; increase iterations symmetrically where necessary.

- [ ] **Step 4: Analyze and audit corrected evidence**

Run `npm run profile:analyze`. Confirm 16 CPU/allocation pairs, zero checksum
mismatches, matching clean commit/run metadata, interpreter shares summing to
100% per aggregate, and overhead reported separately.

- [ ] **Step 5: Replace the evidence report**

Document exact source commit, baseline run ID, profile run ID, runtime versions,
interval units, separate-capture commands, equal-observation formula, normalized
interpreter rankings, raw overhead, workload-specific evidence, cold/steady
limits, JSC limits, and bounded optimization candidates. Remove every value
derived from combined-profiler or profiler-duration-weighted evidence.

- [ ] **Step 6: Run full validation**

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
npm run profile:analyze
```

- [ ] **Step 7: Review, commit, and update the PR**

Request a task review and whole-branch review focused on methodology,
mathematics, metadata integrity, path classification, and documentation
reproducibility. Address all Critical/Important findings, commit the regenerated
report, push the branch, and update PR #50.
