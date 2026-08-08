# Task 1 report: metric-specific capture and source integrity

## Status

Completed and committed. No plan file was modified and no profiling evidence was
regenerated.

## Implementation commit

`5dd4a78e948d31122797976081f25233d222f818`
(`fix: separate profiling metrics and source metadata`)

## Files changed

- Added `benchmark/source-state.js`.
- Updated benchmark capture and transport: `benchmark/cli.js`,
  `benchmark/report.js`, `benchmark/run.js`, `benchmark/run-node.js`,
  `benchmark/run-browser.js`, `benchmark/run-browser-page.js`,
  `benchmark/spawn-jsc.js`, `benchmark/run-jsc.js`, and
  `benchmark/summarize.js`.
- Updated profiling capture: `benchmark/profile/config.js`,
  `benchmark/profile/protocol.js`, `benchmark/profile/cli.js`,
  `benchmark/profile/run-node.js`, and `benchmark/profile/run-browser.js`.
- Updated interfaces and command/docs: `types/host.d.ts`, `package.json`,
  `docs/benchmarking.md`, and `docs/profiling.md`.
- Updated focused and coupled tests: `test/benchmark-core.test.js`,
  `test/profiling-core.test.js`, `test/node/benchmark-cli.test.js`,
  `test/node/benchmark-hosts.test.js`, `test/node/benchmark-summary.test.js`,
  and `test/node/profiling-cli.test.js`.

## Schema and interface decisions

- `readCleanSourceState()` executes `git rev-parse HEAD` and
  `git status --porcelain --untracked-files=normal`, rejects any dirty tree,
  rejects an empty revision, and returns frozen `{ gitCommit, gitDirty: false }`.
- Benchmark reports are schema version 3 and require `source`. The benchmark
  CLI reads source once and passes the same metadata object to Node, Chromium,
  and JSC before any runner starts.
- Profile CLI source metadata is likewise read once before the Node or Chromium
  host starts. Host adapters validate propagated source metadata but never read
  Git independently.
- Profile arguments now require one `metric` and one nonempty `runId`.
  `cpuSamplingIntervalMicroseconds` defaults to 100 and
  `allocationSamplingIntervalBytes` defaults to 32768; an interval intended for
  the other metric is rejected.
- Protocol capture accepts one metric and enables only its inspector domain.
- Profile sidecars are schema version 2. Their `capture` records metric, run ID,
  both interval values, workload/mode/warmups/iterations, and their `source`
  records the clean Git state. Artifact stems are
  `<workload>-<mode>-<metric>`, allowing CPU and allocation sidecars to coexist.

## TDD evidence

### Red

1. `node test/run-node.js test/benchmark-core.test.js test/node/benchmark-cli.test.js`
   failed as expected with `Expected function to throw TypeError` before source
   was required by host-report validation.
2. The same benchmark command failed as expected with
   `Expected undefined to be the same value as [object Object]` before shared
   CLI source metadata was forwarded to host runners.
3. The same benchmark command failed as expected with
   `Expected function to throw Error` before empty Git revisions were rejected.
4. `node test/run-node.js test/profiling-core.test.js test/node/profiling-cli.test.js`
   failed as expected with `Unknown option: --run-id` against the old combined
   profile argument contract.
5. The same profiling command failed as expected with
   `Cannot read properties of undefined (reading 'includes')` before protocol
   capture accepted exactly one metric.
6. Initial `npm run format` correctly reported formatting deviations in three
   changed files; targeted Prettier formatting was then applied.

### Green and final validation

- `node test/run-node.js test/benchmark-core.test.js test/node/benchmark-cli.test.js`
  passed.
- `node test/run-node.js test/profiling-core.test.js test/node/profiling-cli.test.js`
  passed.
- `node test/run-node.js test/benchmark-core.test.js test/node/benchmark-cli.test.js test/node/benchmark-hosts.test.js test/node/benchmark-summary.test.js`
  passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run format` passed.

The final focused benchmark and profiling commands plus the combined typecheck,
lint, and format command were rerun immediately before commit and all exited
zero.

## Self-review

- Verified clean/dirty source behavior, single-read metadata propagation,
  report-schema enforcement, browser/JSC transport, one-metric protocol calls,
  metric-specific artifact coexistence, and pre-host dirty-tree rejection.
- A code-review pass identified obsolete profiling and benchmark documentation;
  the commands and schema documentation were corrected.
- No source is synthesized as `"unknown"`; no profiler host reads Git on its
  own; no analysis weighting or classification code changed.

## Concerns

The existing analyzer intentionally remains on the prior combined-sidecar
contract, as required for this task. New metric-specific sidecars are documented
as awaiting the follow-on analysis migration, and existing derived evidence was
not regenerated.
