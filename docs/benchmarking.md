# Benchmarking

`benchmark/` compares native JavaScript with jsjs across the same deterministic
ES5 workloads. It is a correctness-first harness: every invocation verifies a
committed checksum, every written artifact is schema-validated, and CI smoke
runs check only that the harness executes correctly. There are no committed
latency baselines, thresholds, or regression decisions.

## Host prerequisites

Install repository dependencies first:

```sh
npm install
```

That runs `prepare`, which populates the generated `vendor/` tree.

- **Node**: run the CLI with the Node version you want to measure. CI uses Node
  20; for reproducible local comparisons, keep your Node version fixed across
  runs.
- **Chromium**: install the exact Playwright headless shell once:

  ```sh
  npx playwright install --with-deps --only-shell chromium
  ```

  This is the same command used by CI and `npm run test:browser`.

- **JavaScriptCore (`jsc`)**: the `jsc` binary must be on `PATH`. On macOS:

  ```sh
  PATH="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" npm run benchmark:jsc
  ```

  `benchmark/spawn-jsc.js` also honors `JSC=/path/to/jsc`. Reports record the
  version reported by `jsc --version`; if that is unavailable, they record the
  resolved binary path and modification time.

All benchmark output directories must be repository-relative. Absolute paths and
paths that escape the repository are rejected.

## Package commands

Pass extra benchmark CLI flags through npm with `--`.

| Command                     | Behavior                                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run benchmark`         | Runs `node benchmark/cli.js run --host=all`, producing `node.json`, `chromium.json`, and `jsc.json` under `.benchmark-results/`.                                                 |
| `npm run benchmark:node`    | Runs only the Node host and writes `.benchmark-results/node.json`.                                                                                                               |
| `npm run benchmark:browser` | Runs only the Chromium host and writes `.benchmark-results/chromium.json`.                                                                                                       |
| `npm run benchmark:jsc`     | Runs only the `jsc` host and writes `.benchmark-results/jsc.json`.                                                                                                               |
| `npm run benchmark:smoke`   | Runs the Node-only smoke profile and writes `.benchmark-results/smoke/node.json`. This is the exact correctness-only command CI runs.                                            |
| `npm run benchmark:summary` | Runs `node benchmark/cli.js summary`. Pass `--input` and optional `--output`, for example `npm run benchmark:summary -- --input=.benchmark-results --output=.benchmark-results`. |

Host-specific scripts already pass `--host`, and `benchmark:smoke` already passes
`--host=node --profile=smoke --output=.benchmark-results/smoke`, so do not add a
second `--host` to those wrappers.

## Interpreter profiling

The Node and Chromium profiler CLI captures one metric per invocation. CPU and
sampled-allocation captures for the same workload/mode use metric-specific
sidecars and may coexist:

```sh
node benchmark/profile/cli.js \
  --host=node \
  --workload=arithmetic-loops \
  --mode=steady \
  --metric=cpu \
  --run-id=node-arithmetic-loops-steady \
  --cpu-sampling-interval-microseconds=100 \
  --warmups=1 \
  --iterations=1 \
  --output=.benchmark-results/profiles
```

Analyze a matched baseline and schema-2 sidecar set with:

```sh
npm run profile:analyze
```

The analyzer requires exactly one CPU and one allocation sidecar for every
host/workload/mode observation. Pair members must have the same run ID, clean
source commit, runtime identity, warmup/iteration settings, and both
metric-specific interval settings. Each member must also have a non-`host`
interpreter denominator; a zero-denominator sidecar rejects its matched pair
with a recapture-required error. It writes checksum correlation and aggregate
files only beneath `.benchmark-results/`.

Hotspot percentages are interpreter-only: each metric sidecar first excludes
`host` frames (including GC, idle, inspector, and harness frames), then the
analyzer arithmetic-means those per-observation shares. Therefore
`interpreter.observationCount` equals the paired observation count for each
metric. Raw sampled totals and profile elapsed times remain diagnostics; they
are not aggregation weights.

See [profiling.md](profiling.md) for the reproducible evidence run, its
checksum-correlation method, and how to interpret cold versus steady captures.
Raw `.cpuprofile`, `.heapprofile`, sidecar, and benchmark-report artifacts under
`.benchmark-results/` are ignored local evidence, not committed baselines or
performance thresholds.

## Direct CLI

### `run`

```sh
node benchmark/cli.js run \
  --host=node \
  --host=chromium \
  --profile=smoke \
  --workload=arrays \
  --output=.benchmark-results/custom
```

Options:

| Option                                        | Meaning                                                                                                                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--host=<host>`                               | Required. `<host>` is `node`, `chromium`, `jsc`, or `all`. Repeat `--host` to select multiple concrete hosts, or use `--host=all` by itself. Duplicate hosts are rejected. |
| `--profile=<profile>`                         | Optional. `<profile>` is `default` or `smoke`. Defaults to `default`.                                                                                                      |
| `--workload=<name>`                           | Optional and repeatable. Defaults to every workload in the selected profile.                                                                                               |
| `--warmups=<positive integer>`                | Optional override for warmup count: single invocations in cold mode, calibrated batches in steady mode.                                                                    |
| `--samples=<positive integer>`                | Optional override for measured sample count: single invocations in cold mode, calibrated batches in steady mode.                                                           |
| `--target-sample-ms=<positive finite number>` | Optional calibration target for one steady-mode measured batch. Cold samples are never batched.                                                                            |
| `--max-batch-size=<positive integer>`         | Optional hard cap on steady-mode calibrated batch size.                                                                                                                    |
| `--output=<repo-relative directory>`          | Optional output directory. Defaults to `.benchmark-results`.                                                                                                               |

Unknown options, missing option values, invalid numbers, unknown profiles,
unknown workloads, duplicate hosts, and unsafe output directories fail fast.
CLI diagnostics are written to stderr.

One `run` command creates a shared `runId` and `generatedAt` for every selected
host. Host reports are written to a staging area and promoted together only
after every selected host succeeds. Promotion removes stale host JSON from the
output directory and cleans staging data on both success and failure.

### `summary`

```sh
node benchmark/cli.js summary \
  --input=.benchmark-results/custom \
  --output=.benchmark-results/custom
```

Options:

| Option                               | Meaning                                                    |
| ------------------------------------ | ---------------------------------------------------------- |
| `--input=<repo-relative directory>`  | Required. Reads every `*.json` file except `summary.json`. |
| `--output=<repo-relative directory>` | Optional. Defaults to the input directory.                 |

`summary` sorts input file names lexically by code unit before reading them. It
rejects reports from different `runId` or `generatedAt` values, including stale
host JSON left from another run, then writes `summary.json` and `summary.csv`
atomically.

## Workloads and profiles

The default profile runs seven deterministic workloads:

- `arithmetic-loops`
- `calls-recursion`
- `object-properties`
- `arrays`
- `strings`
- `json`
- `regexp`

The smoke profile keeps the same seven workload names but uses reduced source
repeated 32 times inside each invocation. The wrapper returns the final
repetition's committed checksum. This keeps cold samples unbatched while making
one source-to-result invocation large enough for coarse Chromium and JSC clocks.

Profile defaults come from `benchmark/config.js`:

| Profile   | Warmups | Samples | `targetSampleMs` | `maxBatchSize` |
| --------- | ------- | ------- | ---------------- | -------------- |
| `default` | 3       | 9       | 100              | 1000000        |
| `smoke`   | 1       | 3       | 5                | 10000          |

## Cold and steady boundaries

Each report stores the boundary string per result:

- `cold`: `Cold uses one unbatched invocation per sample: native constructs a unique Function source and invokes it; jsjs creates a fresh realm and evaluates the workload source.`
- `steady`: `Native steady invokes one precompiled host function; jsjs steady invokes one pre-created guest function in one pre-created realm.`

In concrete terms:

- **Native cold** measures construction of a source string unique to that
  invocation plus one call, preventing host compile-cache reuse.
- **jsjs cold** measures fresh realm creation plus `evaluateScript` of the
  workload source.
- **Native steady** measures repeated calls to one precompiled function.
- **jsjs steady** measures repeated calls to one guest function created once in
  one realm before timing starts.

Browser launch, page creation, and `jsc` process startup happen outside these
timed boundaries. The harness compares steady and cold embedding points, not
full host startup time.

## Calibration, warmups, and statistics

Cold mode uses the fixed work encoded in the selected workload source. Every
cold warmup and measured sample is exactly one invocation, so `batchSize` is
always `1`, `samplesMs` equals `normalizedSamplesMs`, and both native and jsjs
use symmetric one-source-to-result sample boundaries. The default sources are
scaled for measurement; smoke sources use the checksum-preserving repetitions
described above and remain correctness-only.

Host clock wrappers record when they had to synthesize monotonic progress
because the underlying clock stalled or moved backward. A cold invocation is
accepted only when its ending clock read advances without synthesis and its
elapsed time exceeds the floating-point clock floor. Otherwise the run fails
with host, workload, mode, and lane context. Cold mode never responds by
batching or amortizing multiple invocations.

Steady mode calibrates each host, workload, and lane (`native` and `jsjs`)
independently:

1. Run a timed probe batch, starting at size `1`.
2. On every probe, verify the checksum and require a positive finite `elapsedMs`.
3. If the probe is still below the measurable floor of `targetSampleMs / 8`,
   double the timed probe batch size (capped at `maxBatchSize`) and probe again.
   This geometric growth avoids calibrating from a coarse clock's tiny positive
   delta.
4. If the capped `maxBatchSize` probe still does not reach `targetSampleMs / 8`,
   keep that already-checked max probe as the calibrated batch size and skip a
   separate confirmation run.
5. Otherwise, treat the first probe at or above `targetSampleMs / 8` as the
   first measurable probe, derive the per-invocation cost as
   `probeElapsedMs / probeBatchSize`, and choose
   `max(probeBatchSize, ceil(targetSampleMs / perInvocationCost))`.
6. Clamp that selected batch size into `[1, maxBatchSize]`, then run one checked
   confirmation batch at the selected size.
7. Run `warmups` unrecorded batches at that batch size.
8. Run `samples` measured batches at that batch size.

For each measured batch the harness stores:

- `samplesMs`: raw batch duration
- `normalizedSamplesMs`: `samplesMs / batchSize`

Statistics are computed from `normalizedSamplesMs`:

- **median**: midpoint of the sorted values
- **p95**: nearest-rank percentile at index `ceil(n * 0.95) - 1`
- **coefficient of variation**: `sqrt(populationVariance) / mean`
- **slowdown**: `jsjsMedian / nativeMedian`
- **geometric mean slowdown**: geometric mean of the positive per-workload
  slowdowns for one host and one mode

## Checksums and failure behavior

Each workload carries a committed signed 32-bit `expectedChecksum`. The harness
does not derive expected values from a native baseline run.

Checksum validation happens during:

- steady-mode calibration
- warmups
- measured sampling
- report validation before write
- summary compatibility checks across hosts

Any mismatch aborts the run with workload, mode, lane, and batch-invocation
context. Invalid reports never replace the final `*.json` output file.
An unmeasurable cold invocation likewise aborts rather than recording an
epsilon-sized duration that would corrupt its median and slowdown.

The JSC module writes failures through `printErr` when the shell provides it,
with `print` only as a compatibility fallback. The Node launcher treats any
stderr or non-JSON stdout as a failed run and preserves that raw output in the
reported error even on JSC shells where `quit(1)` returns process status `0`.

## Artifact layout and schema

The default output tree is ignored by git:

```text
.benchmark-results/
  chromium.json
  jsc.json
  node.json
  summary.json
  summary.csv
```

### Host report JSON (`<host>.json`)

Every host report is validated against schema version `3` before it is written:

```json
{
  "schemaVersion": 3,
  "generatedAt": "2026-08-07T00:00:00.000Z",
  "runId": "shared UUID for one CLI run",
  "host": "node|chromium|jsc",
  "version": "host runtime version string",
  "source": {
    "gitCommit": "full clean-tree revision",
    "gitDirty": false
  },
  "config": {
    "profile": "default|smoke",
    "warmups": 3,
    "samples": 9,
    "targetSampleMs": 100,
    "maxBatchSize": 1000000,
    "workloads": [
      {
        "name": "arrays",
        "source": "(function () { ... }())",
        "expectedChecksum": 778416596
      }
    ]
  },
  "results": [
    {
      "workload": "arrays",
      "mode": "cold|steady",
      "boundary": "exact boundary string",
      "checksum": 778416596,
      "slowdown": 1.23,
      "lanes": {
        "native": {
          "batchSize": 1,
          "samplesMs": [12.1, 12.0, 12.3],
          "normalizedSamplesMs": [12.1, 12.0, 12.3],
          "summary": {
            "median": 0.0945,
            "p95": 0.0961,
            "coefficientOfVariation": 0.0102
          }
        },
        "jsjs": {
          "batchSize": 16,
          "samplesMs": [28.8, 29.1, 28.9],
          "normalizedSamplesMs": [1.8, 1.81875, 1.80625],
          "summary": {
            "median": 1.80625,
            "p95": 1.81875,
            "coefficientOfVariation": 0.0044
          }
        }
      }
    }
  ]
}
```

There is one result row for every workload/mode pair, so the total row count is
`config.workloads.length * 2`.

### Summary JSON (`summary.json`)

`benchmark/summarize.js` accepts only mutually compatible host reports. The
summary schema is:

- `schemaVersion: 3`
- `runId` and `generatedAt`: shared run identity copied from the host reports
- `hosts`: host names in the lexical file-read order used by the CLI
- `hostMetadata`: `{ host, version, generatedAt, runId }[]`
- `config`: the shared benchmark configuration
- `methodology`: `{ mode, boundary }[]`
- `aggregate`: `{ runId, generatedAt, host, version, mode, geometricMeanSlowdown }[]`
- `workloads`: rows with `runId`, `generatedAt`, `host`, `version`, `mode`, `workload`,
  `geometricMeanSlowdown`, `slowdown`, `checksum`, `nativeMedianMs`,
  `nativeP95Ms`, `nativeCoefficientOfVariation`, `nativeBatchSize`,
  `jsjsMedianMs`, `jsjsP95Ms`, `jsjsCoefficientOfVariation`,
  `jsjsBatchSize`, and `boundary`

### Summary CSV (`summary.csv`)

`summary.csv` writes the same per-workload rows with this exact header order:

```text
runId,generatedAt,host,version,mode,workload,geometricMeanSlowdown,slowdown,checksum,nativeMedianMs,nativeP95Ms,nativeCoefficientOfVariation,nativeBatchSize,jsjsMedianMs,jsjsP95Ms,jsjsCoefficientOfVariation,jsjsBatchSize,boundary
```

## Reproducibility guidance

For useful comparisons:

- run on an otherwise idle machine
- keep the machine in a fixed power mode and avoid unplugged/battery-throttled
  runs
- keep Node, Chromium, and `jsc` versions fixed across runs
- keep profile, workload selection, and override flags identical across hosts
- repeat runs instead of trusting a single summary
- retain the raw host reports: `samplesMs` and `normalizedSamplesMs` are the
  evidence behind every summary statistic

If you aggregate reports, produce them in one multi-host command. `summary`
enforces this by rejecting run identity, timestamp, schema, configuration,
workload-order, and checksum divergence.

## Interpretation caveats

- Smoke results are for correctness only. With one warmup and three samples,
  `npm run benchmark:smoke` is intentionally too small to use as a performance
  decision point.
- Cold and steady boundaries are explicit but not interchangeable. Cold includes
  compile/realm setup; steady excludes those setup steps.
- Native and jsjs cold paths do not do identical internal work; interpret the
  recorded boundary text with the result.
- The CLI reports runtime measurements only. It does not store thresholds,
  compare against a historical baseline, or make a regression/pass/fail
  performance decision.
- CI follows the same rule: the generated `benchmark-smoke` job runs
  `npm run benchmark:smoke` for correctness validation only.
