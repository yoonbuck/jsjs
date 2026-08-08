# Benchmarking

`benchmark/` compares native JavaScript with jsjs across the same deterministic
ES5 workloads. It is a correctness-first harness: every batch verifies a
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

  `benchmark/spawn-jsc.js` also honors `JSC=/path/to/jsc`.

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
| `--warmups=<positive integer>`                | Optional override for warmup batch count.                                                                                                                                  |
| `--samples=<positive integer>`                | Optional override for measured batch count.                                                                                                                                |
| `--target-sample-ms=<positive finite number>` | Optional calibration target for one measured batch.                                                                                                                        |
| `--max-batch-size=<positive integer>`         | Optional hard cap on calibrated batch size.                                                                                                                                |
| `--output=<repo-relative directory>`          | Optional output directory. Defaults to `.benchmark-results`.                                                                                                               |

Unknown options, missing option values, invalid numbers, unknown profiles,
unknown workloads, duplicate hosts, and unsafe output directories fail fast.

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
writes `summary.json` and `summary.csv` atomically.

## Workloads and profiles

The default profile runs seven deterministic workloads:

- `arithmetic-loops`
- `calls-recursion`
- `object-properties`
- `arrays`
- `strings`
- `json`
- `regexp`

The smoke profile keeps the same seven workload names but uses reduced source so
the harness still exercises real execution paths while finishing quickly.

Profile defaults come from `benchmark/config.js`:

| Profile   | Warmups | Samples | `targetSampleMs` | `maxBatchSize` |
| --------- | ------- | ------- | ---------------- | -------------- |
| `default` | 3       | 9       | 100              | 1000000        |
| `smoke`   | 1       | 3       | 5                | 10000          |

## Cold and steady boundaries

Each report stores the boundary string per result:

- `cold`: `Native cold compiles workload source on every invocation; jsjs cold creates a fresh realm and evaluates workload source on every invocation.`
- `steady`: `Native steady invokes one precompiled host function; jsjs steady invokes one pre-created guest function in one pre-created realm.`

In concrete terms:

- **Native cold** measures `Function` construction plus one call.
- **jsjs cold** measures fresh realm creation plus `evaluateScript` of the
  workload source.
- **Native steady** measures repeated calls to one precompiled function.
- **jsjs steady** measures repeated calls to one guest function created once in
  one realm before timing starts.

Browser launch, page creation, and `jsc` process startup happen outside these
timed boundaries. The harness compares steady and cold embedding points, not
full host startup time.

## Calibration, warmups, and statistics

Each host, workload, mode, and lane (`native` and `jsjs`) is calibrated
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

- calibration
- warmups
- measured sampling
- report validation before write
- summary compatibility checks across hosts

Any mismatch aborts the run with workload, mode, lane, and batch-invocation
context. Invalid reports never replace the final `*.json` output file.

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

Every host report is validated against schema version `1` before it is written:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-07T00:00:00.000Z",
  "host": "node|chromium|jsc",
  "version": "host runtime version string",
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
          "batchSize": 128,
          "samplesMs": [12.1, 12.0, 12.3],
          "normalizedSamplesMs": [0.0945, 0.0938, 0.0961],
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

- `schemaVersion: 1`
- `hosts`: host names in the lexical file-read order used by the CLI
- `config`: the shared benchmark configuration
- `methodology`: `{ mode, boundary }[]`
- `aggregate`: `{ host, mode, geometricMeanSlowdown }[]`
- `workloads`: rows with `host`, `mode`, `workload`,
  `geometricMeanSlowdown`, `slowdown`, `checksum`, `nativeMedianMs`,
  `nativeP95Ms`, `nativeCoefficientOfVariation`, `nativeBatchSize`,
  `jsjsMedianMs`, `jsjsP95Ms`, `jsjsCoefficientOfVariation`,
  `jsjsBatchSize`, and `boundary`

### Summary CSV (`summary.csv`)

`summary.csv` writes the same per-workload rows with this exact header order:

```text
host,mode,workload,geometricMeanSlowdown,slowdown,checksum,nativeMedianMs,nativeP95Ms,nativeCoefficientOfVariation,nativeBatchSize,jsjsMedianMs,jsjsP95Ms,jsjsCoefficientOfVariation,jsjsBatchSize,boundary
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

If you aggregate reports, aggregate only runs produced from the same committed
workload set and the same configuration. `summary` enforces this by rejecting
schema, configuration, workload-order, and checksum divergence.

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
