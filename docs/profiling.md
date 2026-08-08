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
aggregateShare(k) = sum(share_i(k) for eligible observations i) / eligibleObservationCount
```

An observation with no non-`host` sample has no defined interpreter share, so
it remains in the paired capture and raw diagnostics but is excluded from that
metric's `interpreter.observationCount`. This preserves equal weighting among
the observations that have a nonzero interpreter denominator; it never falls
back to raw-total or elapsed-time weighting. `profileCount` remains the number
of CPU/allocation pairs.

The all-observation result has 16 pairs and 16 CPU interpreter observations.
Allocation has 15 interpreter observations: the Node steady
`object-properties` capture is a valid, checksum-matching pair with zero
sampled allocation frames at the required 32,768-byte interval. Every nonempty
aggregate's category shares sum to 100%.

| Interpreter category    | CPU share (%) | Allocation share (%) |
| ----------------------- | ------------: | -------------------: |
| evaluator               |       48.6698 |              38.7079 |
| references-environments |       16.2186 |               6.8663 |
| object-property         |       15.8034 |              13.3333 |
| arithmetic              |       10.7116 |               6.6667 |
| calls                   |        5.2746 |               0.0000 |
| other-runtime           |        1.8496 |              23.5376 |
| arrays                  |        0.7241 |               3.1337 |
| completions             |        0.6261 |               3.3093 |
| parser                  |        0.0691 |               2.2215 |
| realm-setup             |        0.0531 |               2.2237 |
| **interpreter total**   |  **100.0000** |         **100.0000** |

The leading interpreter frames are likewise normalized shares, not portions of
a summed raw sample total.

| CPU frame                                     | Share (%) |
| --------------------------------------------- | --------: |
| `expressions.js#evaluateExpression`           |   10.2438 |
| `expressions.js#evaluateExpressionValue`      |   10.0273 |
| `expressions.js#applyBinaryOperator`          |    7.9211 |
| `expressions.js#evaluateBinaryExpression`     |    7.1407 |
| `object.js#defineOwnProperty`                 |    6.6200 |
| `conversion.js#toInt32`                       |    5.1548 |
| `reference.js#getValue`                       |    3.2178 |
| `statements.js#evaluateStatement`             |    2.9416 |
| `object.js#getOwnProperty`                    |    2.7395 |
| `function-object.js#createArgumentsObject`    |    2.6770 |
| `expressions.js#evaluateAssignmentExpression` |    2.6539 |
| `environment.js#getIdentifierReference`       |    2.4744 |

| Allocation frame                            | Share (%) |
| ------------------------------------------- | --------: |
| `expressions.js#applyBinaryOperator`        |   10.0240 |
| `expressions.js#evaluateExpression`         |    8.5114 |
| `reference.js#getValue`                     |    6.8663 |
| `conversion.js#toInt32`                     |    6.6667 |
| `expressions.js#evaluateBinaryExpression`   |    6.6667 |
| `expressions.js#evaluateExpressionValue`    |    6.6667 |
| `descriptors.js#completePropertyDescriptor` |    6.6667 |
| `object.js#defineOwnProperty`               |    6.6667 |
| `global-numeric.js#installNumericGlobals`   |    6.6667 |
| `json.js#createJSONIntrinsics`              |    6.6667 |
| `regexp-syntax.js#PatternParser`            |    6.6667 |
| `declarations.js#execute`                   |    3.3333 |
| `completion.js#createReturnCompletion`      |    3.3093 |
| `array-object.js#defineOwnProperty`         |    3.1337 |

## Separate host, GC, idle, inspector, and harness overhead

`host` frames never enter the tables above or their denominators. They remain
raw diagnostic values, with CPU measured in sampled self microseconds and
allocation measured in sampled bytes.

| Raw overhead frame/group                                              |      CPU (µs) | Allocation (B) |
| --------------------------------------------------------------------- | ------------: | -------------: |
| Inspector transport (`node:inspector#post`)                           |       757,786 |        396,560 |
| Garbage collector                                                     |       549,523 |              0 |
| Host program                                                          |       411,706 |              0 |
| Idle                                                                  |        16,660 |              0 |
| Capture/browser harness (`run`, `runBrowserProfilePage`, target)      |         5,359 |        164,048 |
| Host built-ins (`set`, `keys`, `RegExp`, `String`, `Map`, `evaluate`) |             0 |        306,696 |
| Other host frames                                                     |        29,579 |         98,480 |
| **All host overhead**                                                 | **1,770,613** |    **965,784** |

The harness and host values are intentionally visible rather than attributed
to interpreter code. The raw all-observation diagnostics are 18,832,441 µs CPU
samples (17,061,828 µs interpreter) and 1,870,280 B allocation samples
(904,496 B interpreter); neither total is a percentage weight.

## Workload-specific steady evidence

These rows average the Node and Chromium steady observations equally. The
allocation observation count is shown because the Node steady
`object-properties` allocation capture had no non-host sample at the required
interval.

| Workload          | CPU observations | Leading CPU categories (%)                                                  | Allocation observations | Leading allocation categories (%)                        |
| ----------------- | ---------------: | --------------------------------------------------------------------------- | ----------------------: | -------------------------------------------------------- |
| arithmetic-loops  |                2 | evaluator 61.7826; arithmetic 20.1312; references-environments 14.8278      |                       2 | evaluator 50.1802; references-environments 25.0000       |
| arrays            |                2 | evaluator 46.1185; references-environments 20.4089; object-property 17.5896 |                       2 | object-property 50.0000; references-environments 26.4973 |
| calls-recursion   |                2 | evaluator 39.4295; calls 20.8772; object-property 18.4492                   |                       2 | evaluator 50.0000; object-property 50.0000               |
| object-properties |                2 | evaluator 51.1383; object-property 23.0385; references-environments 15.0145 |                       1 | evaluator 100.0000                                       |

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
| Tighten `evaluateBinaryExpression` dispatch       |               7.1407 | Bound only for this sampled mix; preserve coercion, operators, completions, and abrupt completion. |
| Reduce redundant work around `toInt32` conversion |               5.1548 | Measure first; preserve numeric conversion and host-value behavior.                                |
| Avoid unnecessary `createArgumentsObject` work    |               2.6770 | Measure call shapes; preserve strictness, aliasing, `callee`, and observability.                   |

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
same settings. The final counts were:

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
capture_pair node object-properties steady 128
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
| Node     | object-properties | steady |        128 |  1122746965 |      10,681.803 |       10,764,793 |             11,916.103 |                      0 |
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
source/run metadata, matching pair settings, the two interval units, separate
host overhead, and independently recomputed equal-observation totals. Running
the analyzer twice over the same artifacts produced identical SHA-256 outputs:

```text
7aa8c8844c1f2a76036c722c968b38053165607f60c17cdbb0d878b11968db8f  checksum-correlation.json
52f69d15e383ca8092159971270fbc90b7edcf9695c1c9cb3bae01fb7b223739  profile-analysis.json
```

- This is one machine and one evidence pass; repeat on a quiet fixed-power
  machine before choosing work.
- CPU profiles are sampled self time, not inclusive cost or a causal speedup
  estimate.
- Allocation samples are sampled bytes, not retained heap, live-object size, or
  heap growth. A zero sample at the coarse allocation interval is explicitly
  reported rather than invented.
- Profile elapsed windows establish capture coverage only. Use the unprofiled
  baseline medians for timing.
- Cold and steady have different boundaries; their shares are attribution
  signals, not a precise setup-cost decomposition.
- JSC is timing/checksum-only evidence in this pass.
