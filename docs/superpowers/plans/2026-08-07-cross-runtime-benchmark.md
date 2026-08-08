# Cross-Runtime Benchmark Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible, checksummed benchmark harness comparing native JavaScript with jsjs cold/end-to-end and steady-state execution under Node, Chromium, and JavaScriptCore.

**Architecture:** A portable core owns workloads, calibration, sampling, statistics, and report validation. Thin host runners provide clocks, native/jsjs executors, runtime metadata, and output transport; a Node CLI orchestrates hosts and aggregates compatible reports to JSON and CSV.

**Tech Stack:** ES2020 JavaScript with JSDoc checking, existing jsjs embedding API, Node standard library, Playwright Chromium, JavaScriptCore `jsc`, the repository's portable test harness, generated GitHub Actions workflow.

## Global Constraints

- Benchmark workload source must use ES5 syntax and deterministic inputs only.
- Expected workload checksums are committed signed 32-bit integers and must never be derived at runtime.
- Node, Chromium, and JSC must share the same portable workloads, calibration, sampling, statistics, and report schema.
- Cold native timing includes `Function` construction and invocation; cold jsjs timing includes fresh realm creation, parsing, global setup, and execution.
- Steady native timing invokes a precompiled function; steady jsjs timing invokes a pre-created guest EngineFunction in a pre-created realm.
- CI validates checksums, report shape, and smoke execution only; it must not assert latency, slowdown, p95, CV, or regression thresholds.
- Timing artifacts are ignored local output, not committed baselines.
- No new runtime dependencies are added.

---

### Task 1: Portable workloads, profiles, calibration, and statistics

**Files:**

- Create: `benchmark/workloads.js`
- Create: `benchmark/config.js`
- Create: `benchmark/statistics.js`
- Create: `benchmark/calibration.js`
- Create: `test/benchmark-core.test.js`
- Modify: `test/suites.js`

**Interfaces:**

- Produces: `WORKLOADS`, `workloadsForProfile(profile)`, and workload records `{ name, source, expectedChecksum }`.
- Produces: `PROFILES`, `resolveBenchmarkConfig(options)` returning frozen `{ profile, warmups, samples, targetSampleMs, maxBatchSize, workloads }`.
- Produces: `median(values)`, `percentile95(values)`, `coefficientOfVariation(values)`, `geometricMean(values)`, and `summarizeSamples(values)`.
- Produces: `calibrateBatchSize(runBatch, options)` where `runBatch(count)` returns `{ elapsedMs, checksum }`.

- [ ] **Step 1: Write failing workload and profile tests**

Add `test/benchmark-core.test.js` with tests that assert seven default workload
names, fixed checksum literals, reduced smoke sources, frozen records, and
configuration validation:

```js
import { assertSame, assertThrows } from './harness/assert.js';
import { PROFILES, resolveBenchmarkConfig } from '../benchmark/config.js';
import { WORKLOADS, workloadsForProfile } from '../benchmark/workloads.js';

const tests = [
  {
    name: 'benchmark workloads have committed checksums',
    run() {
      assertSame(
        WORKLOADS.map(
          ({ name, expectedChecksum }) => `${name}:${expectedChecksum}`,
        ).join(','),
        [
          'arithmetic-loops:1397312734',
          'calls-recursion:-1100296460',
          'object-properties:1122746965',
          'arrays:778416596',
          'strings:677005',
          'json:18589934',
          'regexp:8900000',
        ].join(','),
      );
      assertSame(Object.isFrozen(WORKLOADS), true);
      assertSame(Object.isFrozen(WORKLOADS[0]), true);
    },
  },
  {
    name: 'smoke profile keeps every workload with reduced deterministic source',
    run() {
      const smoke = workloadsForProfile('smoke');
      assertSame(smoke.length, WORKLOADS.length);
      assertSame(
        smoke.every((entry) => entry.source.length > 0),
        true,
      );
      assertSame(
        smoke.every((entry) => Number.isInteger(entry.expectedChecksum)),
        true,
      );
      assertSame(
        smoke.some((entry, index) => entry.source !== WORKLOADS[index].source),
        true,
      );
    },
  },
  {
    name: 'benchmark configuration rejects invalid sample settings',
    run() {
      assertSame(PROFILES.default.samples, 9);
      assertSame(PROFILES.smoke.samples, 3);
      assertThrows(() => resolveBenchmarkConfig({ samples: 0 }), RangeError);
      assertThrows(
        () => resolveBenchmarkConfig({ profile: 'missing' }),
        RangeError,
      );
    },
  },
];

export default tests;
```

Register the suite statically in `test/suites.js`.

- [ ] **Step 2: Run the focused suite and verify red**

Run: `node test/run-node.js test/benchmark-core.test.js`

Expected: FAIL because `benchmark/config.js` and `benchmark/workloads.js` do not exist.

- [ ] **Step 3: Add immutable workload manifests and validated profiles**

Create the seven full ES5 IIFEs from the approved design with the exact checksum
literals above. Add a reduced ES5 source and its independently verified
checksum to every workload for the smoke profile. Implement:

```js
export const PROFILES = Object.freeze({
  default: Object.freeze({
    warmups: 3,
    samples: 9,
    targetSampleMs: 100,
    maxBatchSize: 1_000_000,
  }),
  smoke: Object.freeze({
    warmups: 1,
    samples: 3,
    targetSampleMs: 5,
    maxBatchSize: 10_000,
  }),
});
```

`resolveBenchmarkConfig` must require positive integer warmups, samples, and
maxBatchSize, a positive finite target, known workload names, and at least one
workload. Return frozen copies rather than caller-owned arrays.

- [ ] **Step 4: Run the focused suite and verify green**

Run: `node test/run-node.js test/benchmark-core.test.js`

Expected: all workload/profile tests pass.

- [ ] **Step 5: Write failing statistics and calibration tests**

Extend the suite with:

```js
{
  name: 'benchmark statistics use defined median p95 CV and geomean semantics',
  run() {
    assertSame(median([4, 1, 3, 2]), 2.5);
    assertSame(percentile95([1, 2, 3, 4, 5]), 5);
    assertSame(coefficientOfVariation([2, 2, 2]), 0);
    assertSame(geometricMean([4, 16]), 8);
    assertThrows(() => median([]), RangeError);
    assertThrows(() => geometricMean([1, 0]), RangeError);
  },
},
{
  name: 'calibration grows toward the target without exceeding its bound',
  run() {
    const calls = [];
    const result = calibrateBatchSize(
      (count) => {
        calls.push(count);
        return { elapsedMs: count * 2, checksum: 17 };
      },
      {
        expectedChecksum: 17,
        targetSampleMs: 10,
        maxBatchSize: 4,
        context: 'steady native fixture',
      },
    );
    assertSame(result.batchSize, 4);
    assertSame(calls.join(','), '1,4');
  },
},
{
  name: 'calibration identifies checksum failures with context',
  run() {
    const error = assertThrows(
      () =>
        calibrateBatchSize(
          () => ({ elapsedMs: 1, checksum: 9 }),
          {
            expectedChecksum: 17,
            targetSampleMs: 10,
            maxBatchSize: 4,
            context: 'cold jsjs arrays',
          },
        ),
      Error,
    );
    assertSame(error.message.includes('cold jsjs arrays'), true);
  },
},
```

- [ ] **Step 6: Run the focused suite and verify red**

Run: `node test/run-node.js test/benchmark-core.test.js`

Expected: FAIL because the statistics and calibration exports do not exist.

- [ ] **Step 7: Implement guarded statistics and bounded calibration**

Validate every numeric array once. Use nearest-rank p95 at
`Math.ceil(length * 0.95) - 1`, population variance for CV, and log averaging
for geometric mean. Calibration probes one invocation, computes
`ceil(targetSampleMs / elapsedMs)`, clamps to `[1, maxBatchSize]`, and performs
one confirmation probe at the selected batch size. Reject zero/non-finite
elapsed times and every checksum mismatch.

- [ ] **Step 8: Run the focused suite and commit**

Run: `node test/run-node.js test/benchmark-core.test.js`

Expected: all tests pass.

```bash
git add benchmark/workloads.js benchmark/config.js benchmark/statistics.js benchmark/calibration.js test/benchmark-core.test.js test/suites.js
git commit -m "feat: add portable benchmark foundations"
```

### Task 2: Portable execution and report schema

**Files:**

- Create: `benchmark/executors.js`
- Create: `benchmark/run.js`
- Create: `benchmark/report.js`
- Modify: `test/benchmark-core.test.js`

**Interfaces:**

- Consumes: Task 1 workload, configuration, calibration, and statistics exports.
- Produces: `createNativeExecutors(workload)` and `createJsjsExecutors(engine, workload)` records with `cold()` and `steady()` checksum-returning functions.
- Produces: `runHostBenchmark({ host, version, now, engine, config, generatedAt })`.
- Produces: `REPORT_SCHEMA_VERSION = 1` and `validateHostReport(value)`.

- [ ] **Step 1: Write failing executor-boundary tests**

Use a synthetic workload with source
`(function () { return 17; }())`. Wrap `engine.createRealm` and
`engine.evaluateScript` to count calls. Assert that two cold jsjs calls create
two realms while two steady jsjs calls use one setup realm and invoke the same
guest function twice. Assert the native cold path compiles on each call and the
native steady path compiles once by injecting a `compile(source)` spy.

- [ ] **Step 2: Run the focused suite and verify red**

Run: `node test/run-node.js test/benchmark-core.test.js`

Expected: FAIL because `benchmark/executors.js` does not exist.

- [ ] **Step 3: Implement isolated cold and steady executors**

`createNativeExecutors(workload, compile = Function)` returns:

```js
{
  cold() {
    return compile(`return ${workload.source};`)();
  },
  steady: compile(`return ${functionSourceFor(workload.source)};`)(),
}
```

`functionSourceFor` must validate the IIFE shape. The jsjs steady setup declares
`function __jsjsBenchmark() { ... }`, evaluates it once in one realm, reads the
guest function from `realm.globalObject`, validates `callFunction`, and returns
`() => guestFunction.callFunction(undefined, [])`.

- [ ] **Step 4: Run the focused suite and verify green**

Run: `node test/run-node.js test/benchmark-core.test.js`

Expected: executor-boundary tests pass.

- [ ] **Step 5: Write failing deterministic sampling and schema tests**

Create a fake monotonic clock that advances by the requested batch count and a
fake engine whose native and jsjs lanes return the fixture checksum. Assert:

```js
const report = runHostBenchmark({
  host: 'fixture',
  version: '1',
  now: fakeNow,
  engine: fakeEngine,
  config: resolveBenchmarkConfig({
    profile: 'smoke',
    warmups: 1,
    samples: 3,
    workloads: ['arithmetic-loops'],
  }),
  generatedAt: '2026-08-07T00:00:00.000Z',
});

assertSame(report.schemaVersion, 1);
assertSame(report.results.length, 2);
assertSame(report.results[0].lanes.native.samplesMs.length, 3);
assertSame(report.results[0].slowdown > 0, true);
assertSame(validateHostReport(report), report);
```

Also mutate schemaVersion, checksum, and sample count in cloned fixtures and
assert `validateHostReport` throws a path-specific `TypeError`.

- [ ] **Step 6: Run the focused suite and verify red**

Run: `node test/run-node.js test/benchmark-core.test.js`

Expected: FAIL because the runner and validator do not exist.

- [ ] **Step 7: Implement measurement and versioned report validation**

For each workload and both modes:

1. construct native and jsjs executors outside sampling
2. calibrate each lane independently
3. execute configured warmup batches with checksum validation
4. collect measured batch durations and normalize by batch size
5. summarize normalized samples and calculate jsjs/native median slowdown

Emit one result per `{ workload, mode }`, with explicit boundary text, lane
batch sizes, raw batch samples, normalized samples, summaries, and checksum.
The report validator must reconstruct no values; it checks structure, finite
numbers, positive timings, configured sample counts, unique workload/mode
pairs, and matching result checksums.

- [ ] **Step 8: Run the focused suite and commit**

Run: `node test/run-node.js test/benchmark-core.test.js`

Expected: all portable core tests pass.

```bash
git add benchmark/executors.js benchmark/run.js benchmark/report.js test/benchmark-core.test.js
git commit -m "feat: measure cold and steady benchmark modes"
```

### Task 3: Node, Chromium, and JSC host runners

**Files:**

- Create: `benchmark/host.js`
- Create: `benchmark/run-node.js`
- Create: `benchmark/run-browser-page.js`
- Create: `benchmark/run-browser.js`
- Create: `benchmark/run-jsc.js`
- Create: `benchmark/spawn-jsc.js`
- Create: `test/node/benchmark-hosts.test.js`
- Modify: `test/run-node.js`

**Interfaces:**

- Consumes: `runHostBenchmark` and `validateHostReport`.
- Produces: `runNodeBenchmark(config)`, `runChromiumBenchmark(config)`, and `runJscBenchmark(config)` returning validated host reports.
- Produces: `runtimeEngine` containing the imported `createRealm` and `evaluateScript`.
- The JSC entry prints exactly one JSON report to stdout; the Node wrapper parses and validates it.

- [ ] **Step 1: Write failing Node host smoke test**

Add the Node-only suite and register it in `NODE_ONLY_SUITES`. Run
`runNodeBenchmark(resolveBenchmarkConfig({ profile: 'smoke', workloads:
['arithmetic-loops'] }))`, then assert host is `node`, version equals
`process.version`, both modes exist, all checksums match the workload manifest,
and every lane contains three samples.

- [ ] **Step 2: Run the focused suite and verify red**

Run: `node test/run-node.js test/node/benchmark-hosts.test.js`

Expected: FAIL because the Node host runner does not exist.

- [ ] **Step 3: Implement the shared engine binding and Node runner**

`benchmark/host.js` imports `createRealm` and `evaluateScript` from
`src/index.js`. The Node runner calls the portable core with
`performance.now.bind(performance)`, `host: 'node'`, `process.version`, and a
single captured ISO timestamp. It returns a report and performs no filesystem
write.

- [ ] **Step 4: Run the focused suite and verify green**

Run: `node test/run-node.js test/node/benchmark-hosts.test.js`

Expected: the Node smoke report passes.

- [ ] **Step 5: Write failing browser and JSC adapter contract tests**

Test exported adapter helpers without requiring installed runtimes:

- `contentTypeOf('benchmark/run-browser-page.js')` is JavaScript
- path resolution rejects `../` traversal
- `parseJscReport(stdout)` rejects extra stdout and invalid JSON
- `jscSetupError(ENOENT)` includes the documented macOS framework PATH
- both adapter parsers call `validateHostReport`

- [ ] **Step 6: Run the focused suite and verify red**

Run: `node test/run-node.js test/node/benchmark-hosts.test.js`

Expected: FAIL because browser and JSC adapters do not exist.

- [ ] **Step 7: Implement browser transport and cleanup**

Follow the existing Playwright route-interception pattern from
`test/run-browser-playwright.js`. Serve only repository-relative files, import
`run-browser-page.js` in the page, pass the resolved config as serializable
data, and return the report. Always close the browser in `finally`. Convert the
missing-browser launch error into:

`Chromium is unavailable; run npx playwright install --with-deps --only-shell chromium`

- [ ] **Step 8: Implement JSC transport and cleanup**

`run-jsc.js` uses only portable imports and `globalThis.print`, runs the
benchmark with a configuration assigned by the wrapper, and prints one JSON
object. `spawn-jsc.js` uses `child_process.spawn`, captures stdout/stderr,
rejects non-zero exit status, rejects additional stdout, and reports:

`jsc is unavailable; on macOS add /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers to PATH`

Pass configuration as a JSON literal in a small generated `-e` prelude; reject
configuration strings containing U+2028 or U+2029 before spawning.

- [ ] **Step 9: Run host tests and commit**

Run: `node test/run-node.js test/node/benchmark-hosts.test.js`

Expected: all host unit tests and the real Node smoke test pass.

```bash
git add benchmark/host.js benchmark/run-node.js benchmark/run-browser-page.js benchmark/run-browser.js benchmark/run-jsc.js benchmark/spawn-jsc.js test/node/benchmark-hosts.test.js test/run-node.js
git commit -m "feat: add cross-runtime benchmark hosts"
```

### Task 4: CLI, output lifecycle, and all-host orchestration

**Files:**

- Create: `benchmark/cli.js`
- Create: `benchmark/output.js`
- Create: `test/node/benchmark-cli.test.js`
- Modify: `test/run-node.js`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**

- Consumes: all host runner functions and `resolveBenchmarkConfig`.
- Produces: `parseBenchmarkArguments(argv)` and `main(argv)` supporting `run` and host selection.
- Produces: `writeHostReport(outputDirectory, report)` with atomic rename after validation.

- [ ] **Step 1: Write failing argument and output tests**

Register `test/node/benchmark-cli.test.js`. Assert exact parsing for:

```js
parseBenchmarkArguments([
  'run',
  '--host=node',
  '--profile=smoke',
  '--output=.benchmark-results/test',
  '--workload=arrays',
]);
```

Assert unknown options, duplicate hosts, missing values, absolute output paths,
and output paths escaping the repository throw. Use a temporary repository
subdirectory to assert a valid report writes as
`<output>/node.json` and invalid reports create no file.

- [ ] **Step 2: Run the focused suite and verify red**

Run: `node test/run-node.js test/node/benchmark-cli.test.js`

Expected: FAIL because the CLI and output modules do not exist.

- [ ] **Step 3: Implement strict CLI parsing and atomic output**

Supported hosts are `node`, `chromium`, `jsc`, and `all`. Supported options are
`--profile`, repeated `--workload`, `--warmups`, `--samples`,
`--target-sample-ms`, `--max-batch-size`, and `--output`. Resolve output paths
against repository root and require the result to remain below it. Create a
sibling temporary file, write pretty JSON plus newline, then rename it to the
final host file.

- [ ] **Step 4: Add package commands and ignored output**

Add:

```json
"benchmark": "node benchmark/cli.js run --host=all",
"benchmark:node": "node benchmark/cli.js run --host=node",
"benchmark:browser": "node benchmark/cli.js run --host=chromium",
"benchmark:jsc": "node benchmark/cli.js run --host=jsc",
"benchmark:smoke": "node benchmark/cli.js run --host=node --profile=smoke --output=.benchmark-results/smoke"
```

Add `/.benchmark-results/` to `.gitignore`.

- [ ] **Step 5: Run the CLI smoke command and verify artifact correctness**

Run: `npm run benchmark:smoke`

Expected: exit 0 and `.benchmark-results/smoke/node.json` validates with seven
workloads, two modes per workload, and committed checksums.

- [ ] **Step 6: Run CLI tests and commit**

Run: `node test/run-node.js test/node/benchmark-cli.test.js`

Expected: all CLI tests pass.

```bash
git add benchmark/cli.js benchmark/output.js test/node/benchmark-cli.test.js test/run-node.js .gitignore package.json
git commit -m "feat: add benchmark command line interface"
```

### Task 5: Cross-host JSON and CSV aggregation

**Files:**

- Create: `benchmark/summarize.js`
- Create: `test/node/benchmark-summary.test.js`
- Modify: `test/run-node.js`
- Modify: `benchmark/cli.js`
- Modify: `package.json`

**Interfaces:**

- Consumes: validated host report JSON from Tasks 2-4 and `geometricMean`.
- Produces: `summarizeReports(reports)` and `summaryToCsv(summary)`.
- Adds CLI command `summary --input=<directory> --output=<directory>`.

- [ ] **Step 1: Write failing aggregation compatibility tests**

Create two small validated fixture reports with distinct hosts and identical
configuration/results. Assert:

```js
const summary = summarizeReports([nodeReport, chromiumReport]);
assertSame(summary.schemaVersion, 1);
assertSame(summary.hosts.join(','), 'node,chromium');
assertSame(summary.aggregate.length, 4);
assertSame(
  summary.aggregate.every((row) => row.geometricMeanSlowdown > 0),
  true,
);
assertSame(summaryToCsv(summary).startsWith('host,mode,'), true);
```

Clone and mutate profile, sample count, workload order, schema version, and one
checksum; each must throw with both affected host names in the message.

- [ ] **Step 2: Run the focused suite and verify red**

Run: `node test/run-node.js test/node/benchmark-summary.test.js`

Expected: FAIL because the summarizer does not exist.

- [ ] **Step 3: Implement compatible aggregation and stable CSV**

Validate each report first. Require unique hosts and identical configurations,
workload order, modes, and expected checksums. Produce per-host/per-mode
geometric mean slowdown, flattened workload rows, and the shared methodology.
Sort host rows by input order and workload rows by manifest order. CSV headers
are fixed constants, not inferred from object key order; quote strings with
standard doubled-quote escaping.

- [ ] **Step 4: Implement summary CLI I/O**

Read all `*.json` host reports in lexical filename order, exclude
`summary.json`, aggregate, and atomically write `summary.json` plus
`summary.csv`. Add:

```json
"benchmark:summary": "node benchmark/cli.js summary"
```

- [ ] **Step 5: Run summary tests and a real Node artifact aggregation**

Run:

```bash
node test/run-node.js test/node/benchmark-summary.test.js
npm run benchmark:summary -- --input=.benchmark-results/smoke --output=.benchmark-results/smoke
```

Expected: tests pass and both summary files are generated without changing the
tracked working tree.

- [ ] **Step 6: Commit**

```bash
git add benchmark/summarize.js benchmark/cli.js test/node/benchmark-summary.test.js test/run-node.js package.json
git commit -m "feat: summarize cross-runtime benchmark reports"
```

### Task 6: CI correctness contract and documentation

**Files:**

- Modify: `tools/ci/pipeline.js`
- Modify: `.github/workflows/ci.yml` via `npm run ci:generate`
- Modify: `test/node/workflow-contract.test.js`
- Modify: `test/node/repository-invariants.test.js`
- Create: `docs/benchmarking.md`
- Modify: `docs/testing.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: `npm run benchmark:smoke`.
- Produces: generated `benchmark-smoke` CI job depending on `vendor`.
- Produces: user-facing benchmark setup, execution, schema, statistics, and interpretation documentation.

- [ ] **Step 1: Write failing CI workflow contract tests**

Add `'benchmark-smoke': 'npm run benchmark:smoke'` to the independent expected
job table. Assert the parsed job has `needs: ['vendor']`, no upload-artifact
step, and no command containing `threshold`, `baseline`, or `regression`.

- [ ] **Step 2: Run the workflow contract and verify red**

Run: `node test/run-node.js test/node/workflow-contract.test.js`

Expected: FAIL because the generated workflow has no `benchmark-smoke` job.

- [ ] **Step 3: Add and regenerate the smoke CI job**

Append this generated job in `createCiJobs`:

```js
job(
  'benchmark-smoke',
  'Benchmark smoke',
  [runStep('Run benchmark correctness smoke', 'npm run benchmark:smoke')],
  ['vendor'],
),
```

Run: `npm run ci:generate`

Expected: `.github/workflows/ci.yml` gains the generated smoke job.

- [ ] **Step 4: Run workflow checks and verify green**

Run:

```bash
node test/run-node.js test/node/workflow-contract.test.js
npm run ci:check
```

Expected: contract and drift check pass.

- [ ] **Step 5: Write benchmark documentation and documentation contracts**

Create `docs/benchmarking.md` with:

- prerequisites for Node, Playwright Chromium, and the macOS JSC PATH
- all package commands and CLI options
- exact cold and steady boundaries
- calibration, warmup, median, nearest-rank p95, population CV, and geomean definitions
- JSON and CSV artifact layout with schema version
- checksum failure behavior
- reproducibility guidance: idle machine, fixed power mode, runtime versions,
  repeated runs, and retained raw samples
- interpretation caveats and an explicit statement that CI has no performance thresholds

Link it from README and `docs/testing.md`. Extend repository invariants so
README's command table contains every benchmark script and every Markdown link
resolves.

- [ ] **Step 6: Run focused docs and CI tests**

Run:

```bash
node test/run-node.js test/node/repository-invariants.test.js
node test/run-node.js test/node/workflow-contract.test.js
npm run benchmark:smoke
```

Expected: all pass and the smoke artifact contains no threshold decision.

- [ ] **Step 7: Commit**

```bash
git add tools/ci/pipeline.js .github/workflows/ci.yml test/node/workflow-contract.test.js test/node/repository-invariants.test.js docs/benchmarking.md docs/testing.md README.md
git commit -m "docs: integrate benchmark harness with CI"
```

### Task 7: Portable validation and final review

**Files:**

- Modify only files identified by failures or reviewer findings.

**Interfaces:**

- Consumes: the complete harness from Tasks 1-6.
- Produces: a clean, reviewed branch ready for pull request.

- [ ] **Step 1: Run the smallest complete portable validation**

Run:

```bash
npm run benchmark:smoke
npm run test:node
npm run test:browser
PATH="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" npm run test:jsc
npm run typecheck
npm run lint
npm run format
npm run ci:check
```

Expected: every command exits 0.

- [ ] **Step 2: Run real cross-runtime smoke benchmark artifacts**

Run:

```bash
node benchmark/cli.js run --host=all --profile=smoke --output=.benchmark-results/cross-runtime-smoke
node benchmark/cli.js summary --input=.benchmark-results/cross-runtime-smoke --output=.benchmark-results/cross-runtime-smoke
```

Expected: Node, Chromium, and JSC reports plus summary JSON/CSV; all hosts have
the same workload order and checksums, and the tracked tree remains unchanged.

- [ ] **Step 3: Request spec-compliance review**

Dispatch a fresh review agent with the design spec, this plan, issue #44
acceptance criteria, and the complete branch diff. Require it to report only
missing requirements, incorrect boundaries, checksum weaknesses, or CI
threshold violations. Fix every confirmed finding with a focused test first.

- [ ] **Step 4: Request code-quality review**

Dispatch a second fresh review agent after spec compliance passes. Require it
to inspect calibration math, timing normalization, cross-host portability,
resource cleanup, path safety, report validation, and test determinism. Fix
every confirmed finding with a focused test first.

- [ ] **Step 5: Re-run validation after review fixes**

Repeat Steps 1 and 2.

Expected: every command exits 0 and all artifact compatibility checks pass.

- [ ] **Step 6: Commit review fixes if any**

```bash
git add benchmark test tools docs README.md package.json .gitignore .github/workflows/ci.yml
git commit -m "fix: address benchmark harness review"
```

Skip the commit only when review produced no file changes.
