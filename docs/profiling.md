# Interpreter profiling evidence

This is a reproducible, local evidence pass for the jsjs interpreter. It ranks
sampled interpreter work; it is neither a latency baseline nor an optimization
decision. CPU and allocation profiles are separate captures, and every
percentage below is an interpreter-only, equal-observation share.

## Interpreter-normalized equal-observation evidence

For metric observation `i`, let `I_i` be its non-`host` frames and let
`v_i(k)` be the sampled self value of category or frame `k`. The analyzer uses:

```text
share_i(k) = 100 * v_i(k) / sum(v_i(f) for f in I_i)
aggregateShare(k) = sum(share_i(k) for all observations i) / observationCount
```

Every member of a CPU/allocation pair must have a non-`host` interpreter
denominator. The analyzer rejects a zero-denominator sidecar with a
recapture-required error, so each metric's `interpreter.observationCount`
always equals its pair count. This preserves equal weighting without falling
back to raw-total or elapsed-time weighting.

The all-observation result has 16 pairs, 16 CPU interpreter observations, and
16 allocation interpreter observations. Every aggregate's category shares sum
to 100%.

| Interpreter category    | CPU share (%) | Allocation share (%) |
| ----------------------- | ------------: | -------------------: |
| evaluator               |       48.6686 |              36.2887 |
| references-environments |       16.2113 |               9.5134 |
| object-property         |       15.8136 |              15.6737 |
| arithmetic              |       10.6963 |               6.2500 |
| calls                   |        5.2746 |               0.0000 |
| other-runtime           |        1.8631 |              22.0665 |
| arrays                  |        0.7241 |               2.9378 |
| completions             |        0.6262 |               3.1025 |
| parser                  |        0.0691 |               2.0827 |
| realm-setup             |        0.0531 |               2.0847 |
| **interpreter total**   |  **100.0000** |         **100.0000** |

The leading interpreter frames are likewise normalized shares, not portions of
a summed raw sample total.

| CPU frame                                     | Share (%) |
| --------------------------------------------- | --------: |
| `expressions.js#evaluateExpression`           |   10.2728 |
| `expressions.js#evaluateExpressionValue`      |   10.0277 |
| `expressions.js#applyBinaryOperator`          |    7.9248 |
| `expressions.js#evaluateBinaryExpression`     |    7.1411 |
| `object.js#defineOwnProperty`                 |    6.6156 |
| `conversion.js#toInt32`                       |    5.1159 |
| `reference.js#getValue`                       |    3.2210 |
| `statements.js#evaluateStatement`             |    2.9444 |
| `object.js#getOwnProperty`                    |    2.7687 |
| `function-object.js#createArgumentsObject`    |    2.6768 |
| `expressions.js#evaluateAssignmentExpression` |    2.6163 |
| `environment.js#getIdentifierReference`       |    2.4541 |

| Allocation frame                            | Share (%) |
| ------------------------------------------- | --------: |
| `reference.js#getValue`                     |    9.5134 |
| `expressions.js#applyBinaryOperator`        |    9.3975 |
| `expressions.js#evaluateExpression`         |    7.9795 |
| `conversion.js#toInt32`                     |    6.2500 |
| `expressions.js#evaluateBinaryExpression`   |    6.2500 |
| `expressions.js#evaluateExpressionValue`    |    6.2500 |
| `descriptors.js#completePropertyDescriptor` |    6.2500 |
| `object.js#defineOwnProperty`               |    6.2500 |
| `global-numeric.js#installNumericGlobals`   |    6.2500 |
| `json.js#createJSONIntrinsics`              |    6.2500 |
| `regexp-syntax.js#PatternParser`            |    6.2500 |
| `object.js#getOwnProperty`                  |    3.1737 |
| `declarations.js#execute`                   |    3.1250 |
| `completion.js#createReturnCompletion`      |    3.1025 |

## Separate host, GC, idle, inspector, and harness overhead

`host` frames never enter the tables above or their denominators. They remain
raw diagnostic values, with CPU measured in sampled self microseconds and
allocation measured in sampled bytes.

| Raw overhead frame/group                                              |      CPU (µs) | Allocation (B) |
| --------------------------------------------------------------------- | ------------: | -------------: |
| Inspector transport (`node:inspector#post`)                           |       753,508 |        429,824 |
| Garbage collector                                                     |     1,065,655 |              0 |
| Host program                                                          |       784,572 |              0 |
| Idle                                                                  |        16,660 |              0 |
| Capture/browser harness (`run`, `runBrowserProfilePage`, target)      |         6,890 |        198,656 |
| Host built-ins (`set`, `keys`, `RegExp`, `String`, `Map`, `evaluate`) |             0 |        306,696 |
| Other host frames                                                     |        31,575 |         98,480 |
| **All host overhead**                                                 | **2,658,860** |  **1,033,656** |

The harness and host values are intentionally visible rather than attributed
to interpreter code. The raw all-observation diagnostics are 45,980,515 µs CPU
samples (43,321,655 µs interpreter) and 2,004,856 B allocation samples
(971,200 B interpreter); neither total is a percentage weight.

## Workload-specific steady evidence

These rows average the Node and Chromium steady observations equally. Each
metric has two interpreter observations for every workload.

| Workload          | CPU observations | Leading CPU categories (%)                                                  | Allocation observations | Leading allocation categories (%)                                           |
| ----------------- | ---------------: | --------------------------------------------------------------------------- | ----------------------: | --------------------------------------------------------------------------- |
| arithmetic-loops  |                2 | evaluator 61.7826; arithmetic 20.1312; references-environments 14.8278      |                       2 | evaluator 50.1802; references-environments 25.0000                          |
| arrays            |                2 | evaluator 46.1185; references-environments 20.4089; object-property 17.5896 |                       2 | object-property 50.0000; references-environments 26.4973                    |
| calls-recursion   |                2 | evaluator 39.4295; calls 20.8772; object-property 18.4492                   |                       2 | evaluator 50.0000; object-property 50.0000                                  |
| object-properties |                2 | evaluator 51.1284; object-property 23.1202; references-environments 14.9563 |                       2 | evaluator 50.0000; object-property 25.3898; references-environments 24.6102 |

Cold captures contain sparse parser/realm evidence that steady captures do
not: Node cold CPU has parser 0.2102% and realm setup 0.1976%, while Chromium
cold CPU has parser 0.0662% and realm setup 0.0149%. This establishes boundary
placement only. Sampling perturbation, unequal profiler work, and the distinct
cold/steady paths make a standalone setup-cost claim unsound.

## Bounded optimization candidates and exclusions

The following are frame-local, Amdahl-style upper bounds from normalized CPU
self shares. They are not speedup forecasts and do not justify changing ES
semantics.

| Candidate                                         | Normalized CPU share | Bound and correctness scope                                                                        |
| ------------------------------------------------- | -------------------: | -------------------------------------------------------------------------------------------------- |
| Tighten `evaluateBinaryExpression` dispatch       |               7.1411 | Bound only for this sampled mix; preserve coercion, operators, completions, and abrupt completion. |
| Reduce redundant work around `toInt32` conversion |               5.1159 | Measure first; preserve numeric conversion and host-value behavior.                                |
| Avoid unnecessary `createArgumentsObject` work    |               2.6768 | Measure call shapes; preserve strictness, aliasing, `callee`, and observability.                   |

Cached lookup, lightweight-context, and bytecode work remain excluded as issue
#40 architecture work. Object, descriptor, property, and array paths remain
excluded as issue #42 work, even where they have large normalized shares.

## Evidence identity and exact commands

The clean source commit was
`7a69f7b97d40b82ec54c43a66c087817076f9322`. Before any capture,
`git status --porcelain --untracked-files=all` was empty and
`git rev-parse HEAD` returned that revision. Every capture CLI independently
called the clean-source check and recorded `gitDirty: false`.

| Item                | Value                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline schema     | `3`                                                                                                                                    |
| Baseline run ID     | `74a3df62-e40e-4b34-aee2-2e923f92ce9c`                                                                                                 |
| Baseline time       | `2026-08-08T06:19:39.183Z`                                                                                                             |
| Profile schema      | `2` sidecars                                                                                                                           |
| Profile run ID      | `profile-evidence-20260808-7a69f7b-final`                                                                                              |
| Node                | `v26.5.1`                                                                                                                              |
| Chromium            | Playwright shell `151.0.7922.34`                                                                                                       |
| JSC                 | `/System/Volumes/Preboot/Cryptexes/OS/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc mtimeMs=1784736095000` |
| CPU interval        | `100` **microseconds**                                                                                                                 |
| Allocation interval | `32768` **bytes**                                                                                                                      |

Use fresh ignored roots; do not reuse a previous profiler directory:

```sh
test -z "$(git status --porcelain --untracked-files=all)"
git rev-parse HEAD
rm -rf .benchmark-results/profiling-baseline .benchmark-results/interpreter-profiling

PATH="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" \
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
  node benchmark/cli.js run --host=all --output=.benchmark-results/profiling-baseline
node benchmark/cli.js summary \
  --input=.benchmark-results/profiling-baseline \
  --output=.benchmark-results/profiling-baseline
```

The profile run uses one shared nonempty ID. CPU and allocation are different
invocations: CPU uses `--cpu-sampling-interval-microseconds=100`; allocation
uses `--allocation-sampling-interval-bytes=32768`. The CPU-only measured
capture window, not allocation-inflated elapsed time, is at least 250 ms for
every final pair. Start at one iteration; if that CPU window is shorter,
increase the pair's iteration count and recapture both metric files with the
same settings. The analyzer likewise requires a non-`host` denominator for
both metrics and requests a pair recapture if either sidecar lacks one. The
final counts were:

```sh
run_id=profile-evidence-20260808-7a69f7b-final
output=.benchmark-results/interpreter-profiling

capture_pair() {
  host=$1 workload=$2 mode=$3 iterations=$4
  node benchmark/profile/cli.js \
    --host="$host" --workload="$workload" --mode="$mode" --metric=cpu \
    --run-id="$run_id" --cpu-sampling-interval-microseconds=100 \
    --warmups=1 --iterations="$iterations" --output="$output"
  node benchmark/profile/cli.js \
    --host="$host" --workload="$workload" --mode="$mode" --metric=allocation \
    --run-id="$run_id" --allocation-sampling-interval-bytes=32768 \
    --warmups=1 --iterations="$iterations" --output="$output"
}

capture_pair node arithmetic-loops cold 8
capture_pair node arithmetic-loops steady 8
capture_pair node calls-recursion cold 5
capture_pair node calls-recursion steady 5
capture_pair node object-properties cold 4
capture_pair node object-properties steady 512
capture_pair node arrays cold 4
capture_pair node arrays steady 5
capture_pair chromium arithmetic-loops cold 13
capture_pair chromium arithmetic-loops steady 13
capture_pair chromium calls-recursion cold 9
capture_pair chromium calls-recursion steady 9
capture_pair chromium object-properties cold 5
capture_pair chromium object-properties steady 5
capture_pair chromium arrays cold 6
capture_pair chromium arrays steady 48

npm run profile:analyze
```

The output is local and ignored:

```text
.benchmark-results/profiling-baseline/{node,chromium,jsc,summary}.json
.benchmark-results/profiling-baseline/summary.csv
.benchmark-results/interpreter-profiling/profiles/{node,chromium}/
.benchmark-results/interpreter-profiling/checksum-correlation.json
.benchmark-results/interpreter-profiling/profile-analysis.json
```

## Timing and checksum diagnostics

Every profile pair matches the baseline expected and observed checksum plus its
CPU expected/observed and allocation expected/observed checksums. The table
shows the shared checksum once; the capture windows and sampled totals are
diagnostics only.

| Host     | Workload          | Mode   | Iterations |    Checksum | CPU window (ms) | CPU samples (µs) | Allocation window (ms) | Allocation samples (B) |
| -------- | ----------------- | ------ | ---------: | ----------: | --------------: | ---------------: | ---------------------: | ---------------------: |
| Chromium | arithmetic-loops  | cold   |         13 |  1397312734 |         268.200 |          286,046 |                275.500 |                 98,508 |
| Chromium | arithmetic-loops  | steady |         13 |  1397312734 |         258.200 |          275,204 |                265.200 |                131,668 |
| Chromium | calls-recursion   | cold   |          9 | -1100296460 |         273.300 |          290,605 |                387.700 |                 68,884 |
| Chromium | calls-recursion   | steady |          9 | -1100296460 |         261.400 |          279,362 |                370.800 |                103,368 |
| Chromium | object-properties | cold   |          5 |  1122746965 |         368.100 |          385,475 |                404.100 |                 72,048 |
| Chromium | object-properties | steady |          5 |  1122746965 |         366.700 |          387,136 |                389.900 |                 32,880 |
| Chromium | arrays            | cold   |          6 |   778416596 |         347.400 |          370,265 |                362.300 |                 67,828 |
| Chromium | arrays            | steady |         48 |   778416596 |       2,590.900 |        2,612,200 |              2,785.000 |                 66,944 |
| Node     | arithmetic-loops  | cold   |          8 |  1397312734 |         301.827 |          392,395 |                340.384 |                254,584 |
| Node     | arithmetic-loops  | steady |          8 |  1397312734 |         297.216 |          435,394 |                240.920 |                132,464 |
| Node     | calls-recursion   | cold   |          5 | -1100296460 |         514.832 |          660,937 |                491.477 |                198,968 |
| Node     | calls-recursion   | steady |          5 | -1100296460 |         258.468 |          335,847 |                432.354 |                200,400 |
| Node     | object-properties | cold   |          4 |  1122746965 |         476.837 |          567,776 |                426.682 |                150,344 |
| Node     | object-properties | steady |        512 |  1122746965 |      37,833.890 |       37,912,867 |             46,411.401 |                134,576 |
| Node     | arrays            | cold   |          4 |   778416596 |         293.924 |          368,397 |                393.833 |                186,264 |
| Node     | arrays            | steady |          5 |   778416596 |         355.761 |          420,609 |                381.449 |                105,128 |

The one shared unprofiled baseline supplies timing and checksum context. These
medians are not profile timing and must not be combined with profile windows.

| Host     | Workload          | Mode   |    Checksum | Native median (ms) | jsjs median (ms) |
| -------- | ----------------- | ------ | ----------: | -----------------: | ---------------: |
| Node     | arithmetic-loops  | cold   |  1397312734 |              0.265 |           21.967 |
| Node     | arithmetic-loops  | steady |  1397312734 |              0.031 |           21.332 |
| Node     | calls-recursion   | cold   | -1100296460 |              0.329 |           34.156 |
| Node     | calls-recursion   | steady | -1100296460 |              0.138 |           32.082 |
| Node     | object-properties | cold   |  1122746965 |              1.686 |           81.389 |
| Node     | object-properties | steady |  1122746965 |              0.034 |           81.288 |
| Node     | arrays            | cold   |   778416596 |              0.699 |           62.507 |
| Node     | arrays            | steady |   778416596 |              0.095 |           60.167 |
| Chromium | arithmetic-loops  | cold   |  1397312734 |              0.400 |           19.500 |
| Chromium | arithmetic-loops  | steady |  1397312734 |              0.155 |           19.220 |
| Chromium | calls-recursion   | cold   | -1100296460 |              0.300 |           27.700 |
| Chromium | calls-recursion   | steady | -1100296460 |              0.170 |           27.350 |
| Chromium | object-properties | cold   |  1122746965 |              0.500 |           77.300 |
| Chromium | object-properties | steady |  1122746965 |              0.052 |           77.300 |
| Chromium | arrays            | cold   |   778416596 |              0.800 |           57.000 |
| Chromium | arrays            | steady |   778416596 |              0.086 |           56.200 |

JSC has the same clean baseline/checksum evidence but no compatible
function-level profiler. Its timing and checksum-only rows are deliberately
separate:

| Workload          | Mode   |    Checksum | Native median (ms) | jsjs median (ms) |
| ----------------- | ------ | ----------: | -----------------: | ---------------: |
| arithmetic-loops  | cold   |  1397312734 |              0.180 |           21.520 |
| arithmetic-loops  | steady |  1397312734 |              0.039 |           21.144 |
| calls-recursion   | cold   | -1100296460 |              0.400 |           32.880 |
| calls-recursion   | steady | -1100296460 |              0.069 |           44.527 |
| object-properties | cold   |  1122746965 |              1.380 |           87.180 |
| object-properties | steady |  1122746965 |              0.073 |           87.490 |
| arrays            | cold   |   778416596 |              0.520 |           85.920 |
| arrays            | steady |   778416596 |              0.084 |           83.360 |

The system JSC shell rejects a useful `--version` response and has no verified,
stable machine-readable CPU/allocation profile path consumed by this CLI. Do
not infer JSC function-level hotspots from Node or Chromium.

## Audit and limits

The analyzer accepted exactly 32 schema-2 sidecars as 16 CPU/allocation pairs.
The independent audit confirmed all six checksum fields per pair, shared clean
source/run metadata, authoritative CPU/allocation active interval settings, the
two interval units, 16 interpreter observations per metric, 100% shares per
aggregate, separate host overhead, and independently recomputed
equal-observation totals. Running the analyzer twice over the same artifacts
produced identical SHA-256 outputs:

```text
ef9a76da682f78e62d428920d750b288e3d114e0a1c6cc6bc63aa912fea7dd1f  checksum-correlation.json
7cf20e9525c3c97ae212e93db26341089e2618fd10590e16d20eec647abc7614  profile-analysis.json
```

- This is one machine and one evidence pass; repeat on a quiet fixed-power
  machine before choosing work.
- CPU profiles are sampled self time, not inclusive cost or a causal speedup
  estimate.
- Allocation samples are sampled bytes, not retained heap, live-object size, or
  heap growth. A zero non-`host` denominator invalidates the matched pair and
  requires recapture rather than contributing a hotspot share.
- Profile elapsed windows establish capture coverage only. Use the unprofiled
  baseline medians for timing.
- Cold and steady have different boundaries; their shares are attribution
  signals, not a precise setup-cost decomposition.
- JSC is timing/checksum-only evidence in this pass.
