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

## Historical (superseded) Issue #42 optimization evidence

> **Superseded for performance decisions.** The `d9ed3e2`/`cf203aa` timing and
> profile claims in this historical section are retained for provenance only.
> The exact `2cc8699` lexical/TDZ-main rebaseline below supersedes them; do not
> use this section to accept the rebased branch's performance.

This follow-up captures the post-optimization evidence for issue #42 on top of the baseline above. Timing claims come only from the unprofiled benchmark medians in `.benchmark-results/issue-42-before` and `.benchmark-results/issue-42-after`. CPU/allocation profiles are attribution-only samples; they explain where sampled interpreter work moved, not how much wall time was saved.

### Source identities and artifact roots

| Item                         | Before                                                                                                                                 | After                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Timing root                  | `.benchmark-results/issue-42-before`                                                                                                   | `.benchmark-results/issue-42-after`          |
| Profile root                 | `.benchmark-results/issue-42-profiles-before`                                                                                          | `.benchmark-results/issue-42-profiles-after` |
| Source commit                | `d9ed3e242b2e15ea3e47b4b63b80f459f017c77c`                                                                                             | `cf203aa7492ca23b8596bdf032b88a1a909884b9`   |
| Timing run ID                | `abacc9b1-5400-415f-b1a1-561094261fbc`                                                                                                 | `acf06967-6f1f-4d4e-9d2f-9b080277fad1`       |
| Timing generatedAt           | `2026-08-08T09:18:47.079Z`                                                                                                             | `2026-08-08T10:07:23.873Z`                   |
| Profile run ID               | `issue42-before-d9ed3e2`                                                                                                               | `issue42-after-cf203aa`                      |
| Node                         | `v26.5.1`                                                                                                                              | same                                         |
| Chromium                     | `151.0.7922.34`                                                                                                                        | same                                         |
| JSC                          | `/System/Volumes/Preboot/Cryptexes/OS/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc mtimeMs=1784736095000` | same                                         |
| Timing warmups / samples     | `3 / 9`                                                                                                                                | `3 / 9`                                      |
| Profile warmups              | `1`                                                                                                                                    | `1`                                          |
| CPU sampling interval        | `100 microseconds`                                                                                                                     | `100 microseconds`                           |
| Allocation sampling interval | `32768 bytes`                                                                                                                          | `32768 bytes`                                |
| Clean source required        | `gitDirty: false` in every artifact                                                                                                    | `gitDirty: false` in every artifact          |

### Exact commands

The timing and profile artifacts in this section were captured from the clean
optimized source commit `cf203aa7492ca23b8596bdf032b88a1a909884b9`. The
documentation and validation fixes in this branch landed later, so rerunning
these commands at a later `HEAD` would not reproduce the same source identity.

Benchmark timing and summary:

```sh
rm -rf .benchmark-results/issue-42-after .benchmark-results/issue-42-profiles-after
test -z "$(git status --porcelain --untracked-files=all | grep -v '^?? \\.benchmark-results/')"
test "$(git rev-parse HEAD)" = "cf203aa7492ca23b8596bdf032b88a1a909884b9"
PATH="/System/Volumes/Preboot/Cryptexes/OS/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" \
JSC=/System/Volumes/Preboot/Cryptexes/OS/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
  node benchmark/cli.js run --host=all \
    --workload=object-properties \
    --workload=arrays \
    --output=.benchmark-results/issue-42-after
node benchmark/cli.js summary \
  --input=.benchmark-results/issue-42-after \
  --output=.benchmark-results/issue-42-after
```

CPU/allocation profile capture and analysis (separate metric invocations, one shared run ID):

```sh
run_id=issue42-after-cf203aa
output=.benchmark-results/issue-42-profiles-after
test -z "$(git status --porcelain --untracked-files=all | grep -v '^?? \\.benchmark-results/')"
test "$(git rev-parse HEAD)" = "cf203aa7492ca23b8596bdf032b88a1a909884b9"

node benchmark/profile/cli.js --host=node --workload=object-properties --mode=cold --metric=cpu --run-id="$run_id" --cpu-sampling-interval-microseconds=100 --warmups=1 --iterations=4 --output="$output"
node benchmark/profile/cli.js --host=node --workload=object-properties --mode=cold --metric=allocation --run-id="$run_id" --allocation-sampling-interval-bytes=32768 --warmups=1 --iterations=4 --output="$output"
node benchmark/profile/cli.js --host=node --workload=object-properties --mode=steady --metric=cpu --run-id="$run_id" --cpu-sampling-interval-microseconds=100 --warmups=1 --iterations=512 --output="$output"
node benchmark/profile/cli.js --host=node --workload=object-properties --mode=steady --metric=allocation --run-id="$run_id" --allocation-sampling-interval-bytes=32768 --warmups=1 --iterations=512 --output="$output"
node benchmark/profile/cli.js --host=node --workload=arrays --mode=cold --metric=cpu --run-id="$run_id" --cpu-sampling-interval-microseconds=100 --warmups=1 --iterations=4 --output="$output"
node benchmark/profile/cli.js --host=node --workload=arrays --mode=cold --metric=allocation --run-id="$run_id" --allocation-sampling-interval-bytes=32768 --warmups=1 --iterations=4 --output="$output"
node benchmark/profile/cli.js --host=node --workload=arrays --mode=steady --metric=cpu --run-id="$run_id" --cpu-sampling-interval-microseconds=100 --warmups=1 --iterations=5 --output="$output"
node benchmark/profile/cli.js --host=node --workload=arrays --mode=steady --metric=allocation --run-id="$run_id" --allocation-sampling-interval-bytes=32768 --warmups=1 --iterations=5 --output="$output"
node benchmark/profile/cli.js --host=chromium --workload=object-properties --mode=cold --metric=cpu --run-id="$run_id" --cpu-sampling-interval-microseconds=100 --warmups=1 --iterations=5 --output="$output"
node benchmark/profile/cli.js --host=chromium --workload=object-properties --mode=cold --metric=allocation --run-id="$run_id" --allocation-sampling-interval-bytes=32768 --warmups=1 --iterations=5 --output="$output"
node benchmark/profile/cli.js --host=chromium --workload=object-properties --mode=steady --metric=cpu --run-id="$run_id" --cpu-sampling-interval-microseconds=100 --warmups=1 --iterations=5 --output="$output"
node benchmark/profile/cli.js --host=chromium --workload=object-properties --mode=steady --metric=allocation --run-id="$run_id" --allocation-sampling-interval-bytes=32768 --warmups=1 --iterations=5 --output="$output"
node benchmark/profile/cli.js --host=chromium --workload=arrays --mode=cold --metric=cpu --run-id="$run_id" --cpu-sampling-interval-microseconds=100 --warmups=1 --iterations=6 --output="$output"
node benchmark/profile/cli.js --host=chromium --workload=arrays --mode=cold --metric=allocation --run-id="$run_id" --allocation-sampling-interval-bytes=32768 --warmups=1 --iterations=6 --output="$output"
node benchmark/profile/cli.js --host=chromium --workload=arrays --mode=steady --metric=cpu --run-id="$run_id" --cpu-sampling-interval-microseconds=100 --warmups=1 --iterations=48 --output="$output"
node benchmark/profile/cli.js --host=chromium --workload=arrays --mode=steady --metric=allocation --run-id="$run_id" --allocation-sampling-interval-bytes=32768 --warmups=1 --iterations=48 --output="$output"
node benchmark/profile/analyze.js --baseline=.benchmark-results/issue-42-after --profiles="$output"
```

### Unprofiled timing results (performance claims)

| Host     | Workload          | Mode   |   Checksum | Native median before (ms) | Native median after (ms) | jsjs median before (ms) | jsjs median after (ms) |  jsjs Δ |
| -------- | ----------------- | ------ | ---------: | ------------------------: | -----------------------: | ----------------------: | ---------------------: | ------: |
| Chromium | arrays            | cold   |  778416596 |                     0.900 |                    0.800 |                  51.200 |                 46.500 |  -9.18% |
| Chromium | arrays            | steady |  778416596 |                     0.083 |                    0.086 |                  50.550 |                 45.433 | -10.12% |
| Chromium | object-properties | cold   | 1122746965 |                     0.500 |                    0.600 |                  68.700 |                 55.000 | -19.94% |
| Chromium | object-properties | steady | 1122746965 |                     0.051 |                    0.052 |                  68.600 |                 54.850 | -20.04% |
| JSC      | arrays            | cold   |  778416596 |                     0.400 |                    0.600 |                  86.760 |                 64.240 | -25.96% |
| JSC      | arrays            | steady |  778416596 |                     0.081 |                    0.084 |                  76.100 |                 67.990 | -10.66% |
| JSC      | object-properties | cold   | 1122746965 |                     1.280 |                    1.360 |                  88.100 |                 69.080 | -21.59% |
| JSC      | object-properties | steady | 1122746965 |                     0.070 |                    0.072 |                  78.560 |                 64.780 | -17.54% |
| Node     | arrays            | cold   |  778416596 |                     0.900 |                    0.645 |                  65.455 |                 52.409 | -19.93% |
| Node     | arrays            | steady |  778416596 |                     0.090 |                    0.092 |                  57.416 |                 51.897 |  -9.61% |
| Node     | object-properties | cold   | 1122746965 |                     0.828 |                    0.882 |                  80.942 |                 64.175 | -20.71% |
| Node     | object-properties | steady | 1122746965 |                     0.033 |                    0.034 |                  74.644 |                 63.582 | -14.82% |

All expected and observed checksums matched for every row in both timing roots, and each report recorded `gitDirty: false`. The post-change jsjs medians improved by **9.18% to 25.96%**, with the biggest gain on JSC cold arrays and the smallest gain on Chromium cold arrays.

### Profile checksum correlation and capture windows

The before run `issue42-before-d9ed3e2` and the after run `issue42-after-cf203aa` both produced eight valid CPU/allocation pairs. For every pair, the benchmark expected checksum, benchmark observed checksum, CPU expected checksum, CPU observed checksum, allocation expected checksum, and allocation observed checksum were all equal.

| Host     | Workload          | Mode   | Iterations | Shared checksum | CPU window before (ms) | CPU window after (ms) | Allocation window before (ms) | Allocation window after (ms) |
| -------- | ----------------- | ------ | ---------: | --------------: | ---------------------: | --------------------: | ----------------------------: | ---------------------------: |
| Node     | arrays            | cold   |          4 |       778416596 |                264.972 |               244.385 |                       316.547 |                      275.479 |
| Node     | arrays            | steady |          5 |       778416596 |                315.978 |               284.564 |                       366.393 |                      330.447 |
| Node     | object-properties | cold   |          4 |      1122746965 |                315.639 |               256.172 |                       395.253 |                      322.883 |
| Node     | object-properties | steady |        512 |      1122746965 |              36786.683 |             31446.963 |                     44350.274 |                    37434.747 |
| Chromium | arrays            | cold   |          6 |       778416596 |                330.900 |               305.900 |                       349.600 |                      323.900 |
| Chromium | arrays            | steady |         48 |       778416596 |               2539.100 |              2280.200 |                      2650.200 |                     2430.800 |
| Chromium | object-properties | cold   |          5 |      1122746965 |                360.900 |               293.000 |                       388.800 |                      326.100 |
| Chromium | object-properties | steady |          5 |      1122746965 |                356.200 |               298.900 |                       374.900 |                      313.100 |

JSC remains timing-only evidence: there is still no compatible function-level CPU/allocation capture path for the system shell.

### Interpreter-normalized attribution deltas

The all-observation view keeps all eight Node/Chromium cold+steady pairs equally weighted. The steady-by-workload views below keep the two steady observations for each workload equally weighted; they are the closest attribution match to the hot-path timing improvements above.

#### All observations (8 equal-weighted pairs)

| Metric     | Category        | Before (%) | After (%) |    Δ pts |
| ---------- | --------------- | ---------: | --------: | -------: |
| CPU        | object-property |    20.3096 |    8.3051 | -12.0045 |
| CPU        | arrays          |     1.4835 |    1.6630 |  +0.1796 |
| Allocation | object-property |    15.0505 |    0.0000 | -15.0505 |
| Allocation | arrays          |     5.6389 |    0.0000 |  -5.6389 |

#### Steady object-properties workload (2 equal-weighted pairs)

| Metric     | Category        | Before (%) | After (%) |    Δ pts |
| ---------- | --------------- | ---------: | --------: | -------: |
| CPU        | object-property |    20.2577 |    7.2400 | -13.0178 |
| CPU        | arrays          |     0.0000 |    0.0000 |  +0.0000 |
| Allocation | object-property |     0.0000 |    0.0000 |  +0.0000 |
| Allocation | arrays          |     0.0000 |    0.0000 |  +0.0000 |

#### Steady object-properties key frames

| Frame                                               | CPU before (%) | CPU after (%) | CPU Δ pts | Allocation before (%) | Allocation after (%) | Allocation Δ pts |
| --------------------------------------------------- | -------------: | ------------: | --------: | --------------------: | -------------------: | ---------------: |
| `src/runtime/object.js#defineOwnProperty`           |         7.8095 |        1.5545 |   -6.2550 |                0.0000 |               0.0000 |          +0.0000 |
| `src/runtime/object.js#_peekOwnDescriptor`          |         0.0000 |        3.7512 |   +3.7512 |                0.0000 |               0.0000 |          +0.0000 |
| `src/runtime/descriptors.js#copyDescriptorFields`   |         2.4326 |        0.6744 |   -1.7582 |                0.0000 |               0.0000 |          +0.0000 |
| `src/runtime/descriptors.js#copyPropertyDescriptor` |         2.5358 |        0.0305 |   -2.5053 |                0.0000 |               0.0000 |          +0.0000 |
| `src/runtime/object.js#getOwnProperty`              |         3.4282 |        0.0000 |   -3.4282 |                0.0000 |               0.0000 |          +0.0000 |
| `src/runtime/object.js#isValueOnlyDescriptor`       |         0.0000 |        0.2679 |   +0.2679 |                0.0000 |               0.0000 |          +0.0000 |

#### Steady arrays workload (2 equal-weighted pairs)

| Metric     | Category        | Before (%) | After (%) |    Δ pts |
| ---------- | --------------- | ---------: | --------: | -------: |
| CPU        | object-property |    18.3654 |    7.9051 | -10.4603 |
| CPU        | arrays          |     2.9422 |    2.9014 |  -0.0408 |
| Allocation | object-property |    16.8263 |    0.0000 | -16.8263 |
| Allocation | arrays          |    16.4072 |    0.0000 | -16.4072 |

#### Steady arrays key frames

| Frame                                               | CPU before (%) | CPU after (%) | CPU Δ pts | Allocation before (%) | Allocation after (%) | Allocation Δ pts |
| --------------------------------------------------- | -------------: | ------------: | --------: | --------------------: | -------------------: | ---------------: |
| `src/runtime/array-object.js#defineOwnProperty`     |         1.4858 |        0.6305 |   -0.8552 |                0.0000 |               0.0000 |          +0.0000 |
| `src/runtime/array-object.js#toArrayIndex`          |         0.2293 |        0.8885 |   +0.6592 |                0.0000 |               0.0000 |          +0.0000 |
| `src/runtime/object.js#_peekOwnDescriptor`          |         0.0000 |        2.9322 |   +2.9322 |                0.0000 |               0.0000 |          +0.0000 |
| `src/runtime/descriptors.js#copyDescriptorFields`   |         1.8742 |        0.6946 |   -1.1796 |                0.0000 |               0.0000 |          +0.0000 |
| `src/runtime/descriptors.js#copyPropertyDescriptor` |         1.6978 |        0.0000 |   -1.6978 |               16.8263 |               0.0000 |         -16.8263 |
| `src/runtime/object.js#getOwnProperty`              |         5.8654 |        0.3339 |   -5.5315 |                0.0000 |               0.0000 |          +0.0000 |

Sampling highlights:

- The object-property CPU share dropped from **20.3096%** to **8.3051%** across all eight observations.
- In steady object-properties, `src/runtime/object.js#defineOwnProperty` fell from **7.8095%** to **1.5545%** CPU share while the new raw-descriptor read path `src/runtime/object.js#_peekOwnDescriptor` appeared at **3.7512%**.
- In steady arrays, `src/runtime/array-object.js#defineOwnProperty` fell from **1.4858%** to **0.6305%** CPU share. `src/runtime/array-object.js#toArrayIndex` rose from **0.2293%** to **0.8885%**, consistent with the host-independent digit scan doing more explicit interpreter work while still reducing elapsed benchmark time.
- Several sampled-allocation shares for object/array helper frames fell to **0.0000%** after the change. Treat that as a sampling result, not proof that allocation became impossible or free.

### Mutation evidence

Each boundary was mutated locally, tested with the smallest covering command, and then restored with `git restore --source=HEAD -- ...` before the next mutation. The final source tree returned to the clean optimized code before documentation work began.

1. **Descriptor detachment / raw-record leak** — changed `return copyPropertyDescriptor(own);` to `return own;` in `src/runtime/object.js`, ran `node test/run-node.js test/objects.test.js`, and reproduced the expected failures:
   - `getProperty returns a detached copy: mutating it does not affect future reads`
   - `getProperty on inherited property returns detached copy: mutating it does not affect prototype`
2. **Invalid descriptor guard semantics** — removed the non-null/object guard from the value-only fast path in `src/runtime/object.js`, ran `node test/run-node.js test/objects.test.js`, and reproduced the intended validation regression:
   - expected `Property descriptor must be an object`, observed host error `Cannot use 'in' operator to search for 'value' in null`
3. **Canonical array-index boundary / host Number independence** — changed the single-digit fast path from arithmetic coercion to `Number(first)` in `src/runtime/array-object.js`, ran `node test/run-node.js test/array-index.test.js`, and reproduced the intended failure:
   - `toArrayIndex survives poisoned globalThis.Number for single-digit index` failed with `host Number was called`

### Validation commands

The full validation pass for this evidence update ran the repository's
existing commands below. After cloning the pinned `vendor/test262` checkout
that `test262:select`/`test262:upstream` require, every command passed. The
system-shell JSC validation now also passes: `PATH="/System/Volumes/Preboot/Cryptexes/OS/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" npm run test:jsc`
printed zero failed records and exited `0`.

Both JSC commands below are load-bearing citations rather than decoration:
`test:jsc` and `test262:jsc` now exit nonzero on a failing record or a
rejected run, through the shared signalling in `tools/jsc/exit.js`. On the
validated shell `quit(1)` from a promise reaction is inert, so
`test/node/jsc-runner.test.js` spawns the real shell on deliberately failing
fixtures for both entry points and asserts the nonzero status — without it, a
zero exit from either command would mean nothing.

```sh
npm run test:node
PATH="/System/Volumes/Preboot/Cryptexes/OS/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" npm run test:browser
PATH="/System/Volumes/Preboot/Cryptexes/OS/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" npm run test:jsc
PATH="/System/Volumes/Preboot/Cryptexes/OS/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" npm run test262:jsc
npm run test262:fixtures
npm run test262:select
npm run test262:select:check
npm run test262:upstream
npm run test262:upstream:check
npm run test262:exclusions:check
npm run typecheck
npm run lint
npm run format
npm run vendor:check
npm run unicode:check
npm run ci:generate
npm run ci:check
npm run ci:contract
node benchmark/cli.js summary --input=.benchmark-results/issue-42-after --output=.benchmark-results/issue-42-after
node benchmark/profile/analyze.js --baseline=.benchmark-results/issue-42-after --profiles=.benchmark-results/issue-42-profiles-after
```

### Limits and no-overclaim guardrails

- Use the timing table above for any performance claim. The profile windows and sampled totals are attribution diagnostics only.
- CPU shares are sampled self time inside the interpreter after excluding host/GC/idle/harness frames; they are not inclusive cost, not a causal proof, and not a speedup forecast.
- Sampled allocation shares are sampled bytes, not retained heap, object lifetime, or heap-growth measurements.
- Cold and steady have different execution boundaries, so a before/after change in one mode does not decompose directly into startup cost versus steady-state cost.
- This is one machine, one Node build, one Chromium shell build, and one system JSC shell. Re-run on a quiet fixed-power machine before making broader claims.

## Issue #42 7132/3f pre-lexical rebaseline (historical, superseded)

> **Historical evidence only.** This entire `7132`-based pass is superseded by
> the exact lexical/TDZ-main evidence in the next section. It is retained for
> traceability, not as a performance claim about the exact `2cc8699` main
> baseline.

Its pre-rebase mapping was baseline
`7132f03fa28de824879894a815be6e2087ed9fb2` → candidate
`3f26148841096c75822bddee709a4ee766a89aa9`. `7132f03` is the predecessor of
the reachable lexical/TDZ main baseline
`2cc8699b60946ea508271648d4379de534cd2d71`; it does not contain that main
advance. The candidate currently measured below is the reachable exact branch
commit `57361388be5ce06407dce3164736aa1ca78db246`, not the historical `3f26148`
snapshot. Legacy artifact names containing `current-main` are preserved
verbatim only because they identify this historical capture.

The earlier `d9ed3e2` evidence above and this 7132/3f pass are historical
context only. Their timing claims come from six paired, unprofiled
full-workload captures; their CPU/allocation profiles are sampled
interpreter-attribution diagnostics, not wall-time measurements or proof of an
isolated implementation contribution.

### Exact revisions, roots, and commands

| Item                      | Baseline                                                                                                        | Candidate                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Source commit             | `7132f03fa28de824879894a815be6e2087ed9fb2`                                                                      | `3f26148841096c75822bddee709a4ee766a89aa9`                                                                           |
| Detached capture worktree | `/Users/jordan/.copilot/session-state/03dae814-f5a5-452d-8b90-649aec2b4e89/files/issue-42-current-main/main-wt` | `/Users/jordan/.copilot/session-state/03dae814-f5a5-452d-8b90-649aec2b4e89/files/issue-42-current-main/candidate-wt` |
| Preserved timing roots    | `.benchmark-results/issue-42-current-main/baseline-1` … `baseline-6`                                            | `.benchmark-results/issue-42-current-main/candidate-1` … `candidate-6`                                               |
| Preserved profile root    | `.benchmark-results/issue-42-current-main/profiles-baseline`                                                    | `.benchmark-results/issue-42-current-main/profiles-candidate`                                                        |

Both worktrees were fresh detached checkouts. Their `node_modules` and generated
`vendor/acorn` directories were symlinked to the existing active-worktree
copies; no tracked source was changed. Before and after every capture,
`git status --porcelain --untracked-files=all` was empty in the source
worktree and active branch. Each host report records `gitDirty: false`.

At the time of this historical pass, the then-active `HEAD` later advanced to
`4b30e877ea30099527a6cecd4f3ff0ee41b3178e` through the test-only commit
`4b30e87`. `git` tree-object checks at that time confirmed that its `src`
(`31112d1c…`) and `benchmark` (`fa85549a…`) trees were byte-identical to the
historical measured candidate `3f26148`; that statement does not apply to the
new lexical/TDZ-main comparison.

```sh
ARTIFACT_ROOT=/Users/jordan/.copilot/session-state/03dae814-f5a5-452d-8b90-649aec2b4e89/files/issue-42-current-main
BASELINE_SHA=7132f03fa28de824879894a815be6e2087ed9fb2
CANDIDATE_SHA=3f26148841096c75822bddee709a4ee766a89aa9
JSC_DIR=/System/Volumes/Preboot/Cryptexes/OS/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers
JSC_BIN=/System/Volumes/Preboot/Cryptexes/OS/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc

git worktree add --detach "$ARTIFACT_ROOT/main-wt" "$BASELINE_SHA"
git worktree add --detach "$ARTIFACT_ROOT/candidate-wt" "$CANDIDATE_SHA"

PATH="$JSC_DIR:$PATH" JSC="$JSC_BIN" \
  node benchmark/cli.js run --host=all \
  --output=.benchmark-results/issue-42-current-main/<side>-<round>
```

Every timing root used the default full workload: `arithmetic-loops`,
`calls-recursion`, `object-properties`, `arrays`, `strings`, `json`, and
`regexp`; both cold and steady modes; warmups `3`; samples `9`; target sample
time `100 ms`; and maximum batch size `1000000`. The host versions were Node
`v26.5.1`, Chromium `151.0.7922.34`, and system JSC
`/System/Volumes/Preboot/Cryptexes/OS/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc mtimeMs=1784736095000`.

### Six-pair counterbalanced timing methodology and audit

The captures were adjacent within a round. Rounds 1, 3, and 5 ran
baseline→candidate; rounds 2, 4, and 6 ran candidate→baseline. Each root has
one all-host run ID shared by its Node, Chromium, and JSC reports.

| Round | Order              | Baseline run ID / generatedAt                                       | Candidate run ID / generatedAt                                      |
| ----: | ------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
|     1 | baseline→candidate | `c5099075-f01f-45c3-b114-b8d0c571fef1` / `2026-08-08T17:58:03.179Z` | `f3b647a2-3333-406f-a8d9-2cc0044bb1a5` / `2026-08-08T17:59:23.987Z` |
|     2 | candidate→baseline | `a2d144f0-039f-429c-b2df-f0aaf66dc60b` / `2026-08-08T18:01:58.075Z` | `c87eb37e-aef4-4b74-84dd-e881c316413a` / `2026-08-08T18:00:40.214Z` |
|     3 | baseline→candidate | `5a4a02bd-d43d-4d94-9c36-ad6b3b1c14b5` / `2026-08-08T18:03:19.290Z` | `1e071860-7f14-4f7d-8a36-e930e2842825` / `2026-08-08T18:04:40.141Z` |
|     4 | candidate→baseline | `307214df-8d28-4596-8d59-1b613ecc9c34` / `2026-08-08T18:07:14.090Z` | `3dfa765e-48f3-4080-ad4a-9ddf7f659e7c` / `2026-08-08T18:05:58.014Z` |
|     5 | baseline→candidate | `44cd20ee-c244-4b07-9061-cfb21a8c54ba` / `2026-08-08T18:08:34.070Z` | `ee7d438a-26b7-44c5-a14a-430eac342c8e` / `2026-08-08T18:09:56.026Z` |
|     6 | candidate→baseline | `bdef0e5a-8452-4950-b9df-bd659eb6319b` / `2026-08-08T18:12:31.493Z` | `a5f85fde-9233-43c4-9290-e3eefd4328ab` / `2026-08-08T18:11:13.471Z` |

The manifest at
`.benchmark-results/issue-42-current-main/comparison-manifest.json` declares
both target workloads, seed `420042`, and `20000` paired-bootstrap resamples.
For each cell, it compares the median normalized jsjs samples per root with a
paired log ratio `log(candidate) - log(baseline)`, uses a deterministic paired
bootstrap confidence interval and exact two-sided sign test, and compares the
point estimate against the empirical 95th-percentile self-difference noise
envelope. Per-host and all-host aggregates are geometric means across the full
workload cell set, paired by round.

```sh
node benchmark/cli.js compare \
  --manifest=.benchmark-results/issue-42-current-main/comparison-manifest.json \
  --output=.benchmark-results/issue-42-current-main/comparison
```

The command was run twice. Its JSON and Markdown outputs were byte-identical
after excluding their generated-at timestamp. The audit verified 6 pairs, 12
roots, 12 unique run IDs, a 3/3 counterbalance, 504 report-result checksums,
the exact source SHA for every side, stable full-workload configuration and
host versions, and timestamp order for every pair.

### Target cells, noise, and gate verdict

Negative values are candidate improvements. Every target had six negative
nonzero paired deltas and exact sign-test `p = 0.03125`.

| Host     | Workload          | Mode   | Point Δ | 95% CI            | Empirical noise | Verdict      |
| -------- | ----------------- | ------ | ------: | ----------------- | --------------: | ------------ |
| Chromium | object-properties | cold   | -19.88% | -20.51% … -18.33% |          ±2.19% | improvement  |
| Chromium | object-properties | steady | -21.01% | -21.90% … -18.70% |          ±2.92% | improvement  |
| Chromium | arrays            | cold   | -12.99% | -14.13% … -10.44% |          ±2.90% | improvement  |
| Chromium | arrays            | steady | -13.15% | -14.04% … -11.54% |          ±1.98% | improvement  |
| JSC      | object-properties | cold   | -21.97% | -29.13% … -19.54% |         ±11.96% | improvement  |
| JSC      | object-properties | steady | -24.66% | -27.57% … -20.59% |          ±8.43% | improvement  |
| JSC      | arrays            | cold   | -14.82% | -16.80% … -12.27% |          ±4.98% | improvement  |
| JSC      | arrays            | steady | -14.57% | -16.36% … -11.97% |          ±5.70% | improvement  |
| Node     | object-properties | cold   | -22.02% | -24.73% … -17.05% |         ±11.07% | improvement  |
| Node     | object-properties | steady | -21.35% | -25.17% … -17.62% |          ±9.20% | improvement  |
| Node     | arrays            | cold   | -10.68% | -16.68% … -8.83%  |         ±10.41% | improvement  |
| Node     | arrays            | steady | -10.55% | -17.56% … -7.84%  |         ±12.09% | within-noise |

| Aggregate        | Point Δ | 95% CI            | Empirical noise | Verdict     |
| ---------------- | ------: | ----------------- | --------------: | ----------- |
| Chromium geomean | -12.19% | -12.47% … -11.01% |          ±2.12% | improvement |
| JSC geomean      | -15.82% | -17.35% … -13.49% |          ±5.21% | improvement |
| Node geomean     | -10.96% | -15.61% … -7.38%  |         ±10.88% | improvement |
| All-host geomean | -13.46% | -14.28% … -11.12% |          ±4.02% | improvement |

The comparison emits two non-target underpowered warnings:
`chromium/calls-recursion/cold` (-1.15%) and `node/json/steady` (-8.05%).
Both point in the improvement direction; neither is a regression, so the
non-target regression conclusion remains **zero**.

All three host geomean point estimates and the all-host geomean improve. The
plan/tool target-materiality predicate nevertheless fails:
`acceptance.accepted === false`. Its only blocking target is
`node/arrays/steady`. Its displayed envelope is ±12.09%, while the actual
criterion compares `abs(pointLogRatio)` `0.111455273` against the
nearest-rank p95 (the second-largest) of 30 pooled self-differences,
`0.114088087`; the log-space gap is `0.002632814`. Twenty-eight of the 30
self-differences are below the effect. The only two above it are baseline
cross-round r2–r4 and r4–r5, both attributable to the documented baseline
drift. Thus 11 of 12 target cells have `improvement` verdicts, while that cell
is `within-noise`; aggregation does not override the blocking cell.
Plan-owner ruling A accepts Task 4 despite this tool result: the user
non-target rule passes with zero regressions, and `node/arrays/steady` is a
documented plan/tool target-materiality miss.

### Matched CPU and allocation profiles

The candidate's corrected `benchmark/profile/analyze.js` validated each
revision independently against its matching timing root:

```sh
node benchmark/profile/analyze.js \
  --baseline=.benchmark-results/issue-42-current-main/baseline-1 \
  --profiles=.benchmark-results/issue-42-current-main/profiles-baseline
node benchmark/profile/analyze.js \
  --baseline=.benchmark-results/issue-42-current-main/candidate-1 \
  --profiles=.benchmark-results/issue-42-current-main/profiles-candidate
```

Each cell used `--warmups=1`,
`--cpu-sampling-interval-microseconds=100`, and
`--allocation-sampling-interval-bytes=32768`; CPU and allocation use the same
cell-specific run ID. The capture command for each metric was:

```sh
node benchmark/profile/cli.js \
  --host="$host" --workload="$workload" --mode="$mode" --metric=cpu \
  --run-id="$run_id" --cpu-sampling-interval-microseconds=100 \
  --warmups=1 --iterations="$iterations" --output="$output"
node benchmark/profile/cli.js \
  --host="$host" --workload="$workload" --mode="$mode" --metric=allocation \
  --run-id="$run_id" --allocation-sampling-interval-bytes=32768 \
  --warmups=1 --iterations="$iterations" --output="$output"
```

| Host     | Workload          | Mode   | Iterations |   Checksum | CPU capture-window baseline/candidate (ms) | Allocation capture-window baseline/candidate (ms) |
| -------- | ----------------- | ------ | ---------: | ---------: | -----------------------------------------: | ------------------------------------------------: |
| Node     | object-properties | cold   |          4 | 1122746965 |                          333.913 / 259.078 |                                 373.564 / 297.030 |
| Node     | object-properties | steady |        512 | 1122746965 |                      36378.051 / 30489.777 |                             47164.180 / 33217.840 |
| Node     | arrays            | cold   |          4 |  778416596 |                          269.919 / 219.775 |                                 287.679 / 240.989 |
| Node     | arrays            | steady |          5 |  778416596 |                          293.713 / 270.191 |                                 315.747 / 274.372 |
| Chromium | object-properties | cold   |          5 | 1122746965 |                          351.200 / 285.700 |                                 368.900 / 298.700 |
| Chromium | object-properties | steady |          5 | 1122746965 |                          344.300 / 276.300 |                                 350.400 / 276.400 |
| Chromium | arrays            | cold   |          6 |  778416596 |                          323.300 / 285.300 |                                 329.700 / 289.800 |
| Chromium | arrays            | steady |         48 |  778416596 |                        2408.900 / 2143.600 |                               2464.700 / 2165.700 |

| Host     | Workload          | Mode   | Baseline profile run ID                                           | Candidate profile run ID                                                            |
| -------- | ----------------- | ------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Node     | object-properties | cold   | `issue42-current-main-baseline-node-object-properties-cold`       | `issue42-current-main-diagnostic-candidate-node-object-properties-cold-retry-1`     |
| Node     | object-properties | steady | `issue42-current-main-baseline-node-object-properties-steady`     | `issue42-current-main-candidate-node-object-properties-steady`                      |
| Node     | arrays            | cold   | `issue42-current-main-baseline-node-arrays-cold`                  | `issue42-current-main-candidate-node-arrays-cold`                                   |
| Node     | arrays            | steady | `issue42-current-main-baseline-node-arrays-steady`                | `issue42-current-main-candidate-node-arrays-steady`                                 |
| Chromium | object-properties | cold   | `issue42-current-main-baseline-chromium-object-properties-cold`   | `issue42-current-main-diagnostic-candidate-chromium-object-properties-cold-retry-1` |
| Chromium | object-properties | steady | `issue42-current-main-baseline-chromium-object-properties-steady` | `issue42-current-main-candidate-chromium-object-properties-steady`                  |
| Chromium | arrays            | cold   | `issue42-current-main-baseline-chromium-arrays-cold`              | `issue42-current-main-candidate-chromium-arrays-cold`                               |
| Chromium | arrays            | steady | `issue42-current-main-baseline-chromium-arrays-steady`            | `issue42-current-main-candidate-chromium-arrays-steady`                             |

The analyzer accepted 8 paired observations per revision. For every
observation, the timing workload expected checksum, timing observed checksum,
CPU expected/observed checksum, and allocation expected/observed checksum were
equal. It also verified source SHA, `gitDirty: false`, host/runtime version,
run ID pairing, warmups, iterations, sampling intervals, raw artifact
existence, and a nonzero non-host interpreter denominator. The copied active
profile artifacts hash-identically to their detached-worktree capture sources.

The initial candidate allocation captures for
`chromium/object-properties/cold` and `node/object-properties/cold` had no
non-host sampled bytes at the mandated 32768-byte interval, so the corrected
analyzer rejected them rather than silently treating them as zeros. Those
invalid raw artifacts are retained under the external artifact root. Exact
same-configuration allocation retries produced nonzero interpreter samples and
were paired with CPU captures using the same retried run IDs; the final
analyzer validation above is over those replacement pairs. No interval,
warmup, iteration, source SHA, or workload checksum was changed.

The Chromium recapture between those initial rejects and the promoted retry,
`candidate-shell-variable-collision-recapture-1`, is the third rejected
profile attempt. Its Chromium artifact was discarded solely for a metadata
defect: it carries the Node-named run ID
`issue42-current-main-candidate-node-object-properties-cold-recapture-1`, not
because of its sampled values. The effective final attempt depth for
`chromium/object-properties/cold` is therefore three.

### Interpreter-normalized attribution deltas

Shares below normalize each observation to non-host interpreter samples before
equal-observation aggregation. They are descriptive sampling attribution, not
an isolated parser or method-level causal decomposition.

| Scope                    | Metric     | Category        | Baseline | Candidate | Δ points |
| ------------------------ | ---------- | --------------- | -------: | --------: | -------: |
| All 8 observations       | CPU        | object-property | 20.7203% |   7.7809% | -12.9394 |
| All 8 observations       | CPU        | arrays          |  1.6778% |   1.8258% |  +0.1480 |
| All 8 observations       | Allocation | object-property | 38.0455% |   3.1951% | -34.8504 |
| All 8 observations       | Allocation | arrays          |  0.0000% |   0.0000% |  +0.0000 |
| Steady object-properties | CPU        | object-property | 20.7068% |   5.8180% | -14.8887 |
| Steady object-properties | CPU        | arrays          |  0.0000% |   0.0000% |  +0.0000 |
| Steady object-properties | Allocation | object-property |  0.0000% |   0.0000% |  +0.0000 |
| Steady object-properties | Allocation | arrays          |  0.0000% |   0.0000% |  +0.0000 |
| Steady arrays            | CPU        | object-property | 16.7388% |   7.7398% |  -8.9990 |
| Steady arrays            | CPU        | arrays          |  3.3784% |   3.5278% |  +0.1494 |
| Steady arrays            | Allocation | object-property | 76.7196% |  12.7806% | -63.9390 |
| Steady arrays            | Allocation | arrays          |  0.0000% |   0.0000% |  +0.0000 |

Every `0.0000%` allocation entry above is a sampled zero with a validated,
nonzero interpreter denominator, never a missing or zero denominator. For
example, the steady Node object-properties allocation artifacts have
`136492` baseline and `101012` candidate interpreter bytes; their
object-property and arrays category shares are both zero after normalization.

The whole-branch `arrays` target has a consistent timing improvement on all
three hosts, but this profile evidence does **not** isolate the array parser's
contribution from the other branch changes. Use the paired timing table and
its per-cell verdicts for performance decisions; specifically, do not claim a
gate acceptance while `node/arrays/steady` remains inside empirical noise.

### Historical 7132 validation artifacts

Ignored raw captures, the manifest, comparison output, analyzer output, and
metadata/determinism audits are preserved under
`.benchmark-results/issue-42-current-main/` in the active worktree and under
`/Users/jordan/.copilot/session-state/03dae814-f5a5-452d-8b90-649aec2b4e89/files/issue-42-current-main/`
for capture logs, metadata audits, and archives created alongside the temporary
detached worktrees. The comparison output is
`.benchmark-results/issue-42-current-main/comparison.json` and
`.benchmark-results/issue-42-current-main/comparison.md`.

## Issue #42 exact lexical/TDZ-main rebaseline (2026-08-08)

This is the performance evidence for the exact lexical/TDZ main advance. It
supersedes every historical `7132`-based figure above. Negative timing deltas
mean that the exact candidate is faster. The timing results are whole-branch
measurements; sampled CPU/allocation attribution is diagnostic only and does
not isolate a parser gain or any single implementation change.

### Exact revisions, fresh worktrees, and preserved roots

| Item                      | Baseline                                                                                                                | Candidate                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Source commit             | `2cc8699b60946ea508271648d4379de534cd2d71`                                                                              | `57361388be5ce06407dce3164736aa1ca78db246`                                                                               |
| Reachability at capture   | `main` / `origin/main`                                                                                                  | `yoonbuck-optimize-object-array-hot-paths`                                                                               |
| Detached capture worktree | `/Users/jordan/.copilot/session-state/03dae814-f5a5-452d-8b90-649aec2b4e89/files/issue-42-current-main-2cc/baseline-wt` | `/Users/jordan/.copilot/session-state/03dae814-f5a5-452d-8b90-649aec2b4e89/files/issue-42-current-main-2cc/candidate-wt` |
| `src` tree                | `ec4e0bd5e8b73e7ec724f38710cead6aef50bec8`                                                                              | `f0281dcd83f6f8dfe504b46e08c9f3b45bb2003e`                                                                               |
| `benchmark` tree          | `fa77f777836a5aca8f63ee7c69f86409378c4456`                                                                              | `fa85549a9b3a224c04627ac0d43c2ff807bfe7b0`                                                                               |
| Canonical timing roots    | `.benchmark-results/issue-42-current-main-2cc/baseline-1` … `baseline-6`                                                | `.benchmark-results/issue-42-current-main-2cc/candidate-1` … `candidate-6`                                               |
| Canonical profile root    | `.benchmark-results/issue-42-current-main-2cc/profiles-baseline`                                                        | `.benchmark-results/issue-42-current-main-2cc/profiles-candidate`                                                        |

Both capture checkouts were created fresh and detached. Each linked
`node_modules` and generated `vendor/acorn` to the active worktree; both links,
both clean source states, detached `HEAD`s, identical `package-lock.json`
SHA-256 values, and the ignored output directories are recorded in
`/Users/jordan/.copilot/session-state/03dae814-f5a5-452d-8b90-649aec2b4e89/files/issue-42-current-main-2cc/worktree-dependency-audit.json`.
Before capture, active `HEAD` was exactly `5736138`; its `src`, `benchmark`,
and `package.json` tree objects matched the candidate detached checkout. Every
source checkout stayed clean before and after capture.

```sh
ARTIFACT_ROOT=/Users/jordan/.copilot/session-state/03dae814-f5a5-452d-8b90-649aec2b4e89/files/issue-42-current-main-2cc
BASELINE_SHA=2cc8699b60946ea508271648d4379de534cd2d71
CANDIDATE_SHA=57361388be5ce06407dce3164736aa1ca78db246
JSC_DIR=/System/Volumes/Preboot/Cryptexes/OS/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers
JSC_BIN="$JSC_DIR/jsc"

git worktree add --detach "$ARTIFACT_ROOT/baseline-wt" "$BASELINE_SHA"
git worktree add --detach "$ARTIFACT_ROOT/candidate-wt" "$CANDIDATE_SHA"
ln -s "$PWD/node_modules" "$ARTIFACT_ROOT/baseline-wt/node_modules"
ln -s "$PWD/node_modules" "$ARTIFACT_ROOT/candidate-wt/node_modules"
mkdir -p "$ARTIFACT_ROOT"/{baseline-wt,candidate-wt}/vendor
ln -s "$PWD/vendor/acorn" "$ARTIFACT_ROOT/baseline-wt/vendor/acorn"
ln -s "$PWD/vendor/acorn" "$ARTIFACT_ROOT/candidate-wt/vendor/acorn"
```

The canonical ignored result root is
`.benchmark-results/issue-42-current-main-2cc/`; external logs, audit files,
the ledger, and any rejected attempts live under `$ARTIFACT_ROOT`. The host
versions were Node `v26.5.1`, Chromium `151.0.7922.34`, and system JSC
`/System/Volumes/Preboot/Cryptexes/OS/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc`
with `mtimeMs=1784736095000`.

### Six-pair full-workload timing capture

Every root used the unchanged default full workload: `arithmetic-loops`,
`calls-recursion`, `object-properties`, `arrays`, `strings`, `json`, and
`regexp`; cold and steady modes; warmups `3`; samples `9`; target sample time
`100 ms`; and maximum batch size `1000000`.

```sh
PATH="$JSC_DIR:$PATH" JSC="$JSC_BIN" \
  node benchmark/cli.js run --host=all \
  --output=.benchmark-results/issue-42-current-main-2cc/<side>-<round>
```

Rounds 1, 3, and 5 ran baseline→candidate; rounds 2, 4, and 6 ran
candidate→baseline. The canonical window was 20:36:00Z through 20:52:37Z;
the comparison verifies the report timestamps, while the external ledger also
records command start and finish timestamps.

| Round | Order              | Baseline run ID / generatedAt                                       | Candidate run ID / generatedAt                                      |
| ----: | ------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
|     1 | baseline→candidate | `48605018-0b1e-4793-a757-210c88d99553` / `2026-08-08T20:36:00.327Z` | `f7565d65-33ae-455a-a8ed-d25a0814c389` / `2026-08-08T20:37:24.772Z` |
|     2 | candidate→baseline | `7c1a4152-ed90-438f-b3ca-c71f235a8bd7` / `2026-08-08T20:40:05.295Z` | `9cdb26eb-33fa-4b8f-9501-776bfe109495` / `2026-08-08T20:38:45.486Z` |
|     3 | baseline→candidate | `b501a648-31f9-4550-a338-75bab9e136ea` / `2026-08-08T20:41:30.849Z` | `0c4bfa7a-f491-4812-a996-4f2badd7e51c` / `2026-08-08T20:42:56.709Z` |
|     4 | candidate→baseline | `62764ff8-ec01-4cc7-a153-0957ae962ce3` / `2026-08-08T20:45:37.369Z` | `8ef47e8d-4a86-453c-8269-6ef6e82b7446` / `2026-08-08T20:44:17.479Z` |
|     5 | baseline→candidate | `ff1e9f13-c5f9-4ca3-bc52-a90276c13bef` / `2026-08-08T20:47:07.704Z` | `c75572de-2314-48c9-9877-fe9d3c477a01` / `2026-08-08T20:48:31.414Z` |
|     6 | candidate→baseline | `0ca29225-1122-4dfd-8e34-f2781e716bd3` / `2026-08-08T20:51:12.692Z` | `738e200b-59ac-48d5-a452-aee77967786b` / `2026-08-08T20:49:53.241Z` |

The manifest at
`.benchmark-results/issue-42-current-main-2cc/comparison-manifest.json`
retains the same workload-only targets, `object-properties` and `arrays`, so
each target spans all three hosts and both modes. It retains seed `420042` and
`20000` paired-bootstrap resamples; no target predicate, non-target rule, or
methodology was changed.

```sh
node benchmark/cli.js compare \
  --manifest=.benchmark-results/issue-42-current-main-2cc/comparison-manifest.json \
  --output=.benchmark-results/issue-42-current-main-2cc/<output-stem>
```

The exact candidate gate ran twice to validation-only stems
`comparison-validation-1` and `comparison-validation-2`, then once to
canonical `comparison`. All three JSON and Markdown reports are identical
after removal of their sole generated-at value/line. The canonical outputs are
`comparison.json` and `comparison.md`; the determinism audit is
`$ARTIFACT_ROOT/comparison-determinism-audit.json`.

The timing audit at `$ARTIFACT_ROOT/timing-metadata-audit.json` verifies six
pairs, 12 roots, 12 unique run IDs, 3/3 counterbalance, exact side/source
commits, clean source metadata, stable host versions/configuration, per-pair
timestamp order, 36 host-report SHA-256 values, and all 504 workload-result
checksums.

### Target cells, all non-target results, and gate result

Each target row below uses the paired median log ratio, deterministic paired
bootstrap interval, exact two-sided sign test, and empirical 95th-percentile
self-difference envelope. The `−/+` column is negative/positive paired
deltas, followed by sign-test p.

| Host     | Workload          | Mode   | Point Δ | 95% CI            | Empirical noise | −/+; sign p  | Verdict      |
| -------- | ----------------- | ------ | ------: | ----------------- | --------------: | ------------ | ------------ |
| chromium | object-properties | cold   | -19.07% | -20.72% … -13.86% |          ±7.61% | 6/0; 0.03125 | improvement  |
| chromium | object-properties | steady | -17.53% | -20.01% … -14.64% |          ±7.22% | 6/0; 0.03125 | improvement  |
| chromium | arrays            | cold   | -12.97% | -15.31% … -10.68% |          ±4.08% | 6/0; 0.03125 | improvement  |
| chromium | arrays            | steady | -13.28% | -14.63% … -11.15% |          ±4.26% | 6/0; 0.03125 | improvement  |
| jsc      | object-properties | cold   | -21.44% | -27.27% … +22.30% |         ±80.50% | 4/2; 0.68750 | within-noise |
| jsc      | object-properties | steady | -21.65% | -24.05% … -7.75%  |         ±17.99% | 6/0; 0.03125 | improvement  |
| jsc      | arrays            | cold   | -10.77% | -15.25% … +5.24%  |         ±18.98% | 4/2; 0.68750 | within-noise |
| jsc      | arrays            | steady | -12.06% | -16.50% … +10.20% |         ±39.13% | 5/1; 0.21875 | within-noise |
| node     | object-properties | cold   | -18.64% | -30.90% … -11.54% |         ±27.35% | 6/0; 0.03125 | within-noise |
| node     | object-properties | steady | -20.66% | -29.68% … -12.50% |         ±26.28% | 6/0; 0.03125 | within-noise |
| node     | arrays            | cold   | -17.41% | -39.25% … +3.90%  |         ±84.93% | 4/2; 0.68750 | within-noise |
| node     | arrays            | steady | -12.62% | -21.51% … +23.46% |         ±52.49% | 4/2; 0.68750 | within-noise |

All 30 non-target cells are retained below. The unchanged user non-target rule
passes: **zero non-target regressions**.

| Host     | Workload         | Mode   | Point Δ | 95% CI            | Empirical noise | −/+; sign p  | Verdict      |
| -------- | ---------------- | ------ | ------: | ----------------- | --------------: | ------------ | ------------ |
| chromium | arithmetic-loops | cold   |  -0.96% | -2.13% … +0.73%   |          ±2.93% | 4/2; 0.68750 | within-noise |
| chromium | arithmetic-loops | steady |  -0.63% | -1.87% … +3.54%   |          ±4.48% | 4/2; 0.68750 | within-noise |
| chromium | calls-recursion  | cold   |  -2.09% | -3.72% … +1.71%   |          ±4.34% | 5/1; 0.21875 | within-noise |
| chromium | calls-recursion  | steady |  -1.73% | -3.68% … +2.44%   |          ±4.53% | 4/2; 0.68750 | within-noise |
| chromium | strings          | cold   | -16.99% | -18.05% … -16.04% |          ±3.09% | 6/0; 0.03125 | improvement  |
| chromium | strings          | steady | -17.53% | -19.08% … -13.82% |          ±4.65% | 6/0; 0.03125 | improvement  |
| chromium | json             | cold   | -10.57% | -11.63% … -7.81%  |          ±3.70% | 6/0; 0.03125 | improvement  |
| chromium | json             | steady | -10.66% | -11.21% … -9.29%  |          ±3.13% | 6/0; 0.03125 | improvement  |
| chromium | regexp           | cold   | -19.46% | -21.58% … -18.87% |          ±5.43% | 6/0; 0.03125 | improvement  |
| chromium | regexp           | steady | -18.97% | -19.75% … -17.79% |          ±3.49% | 6/0; 0.03125 | improvement  |
| jsc      | arithmetic-loops | cold   |  +0.33% | -4.92% … +45.24%  |         ±60.55% | 3/3; 1.00000 | within-noise |
| jsc      | arithmetic-loops | steady |  -0.78% | -6.72% … +34.47%  |         ±39.66% | 3/3; 1.00000 | within-noise |
| jsc      | calls-recursion  | cold   |  -0.60% | -7.06% … +31.87%  |         ±36.83% | 3/3; 1.00000 | within-noise |
| jsc      | calls-recursion  | steady | +11.66% | -16.38% … +28.53% |         ±44.32% | 2/4; 0.68750 | within-noise |
| jsc      | strings          | cold   | -22.07% | -26.17% … -12.82% |         ±16.15% | 6/0; 0.03125 | improvement  |
| jsc      | strings          | steady | -25.17% | -28.10% … -10.39% |         ±21.20% | 6/0; 0.03125 | improvement  |
| jsc      | json             | cold   | -15.98% | -18.74% … -2.44%  |         ±26.96% | 5/1; 0.21875 | underpowered |
| jsc      | json             | steady | -13.71% | -19.99% … -0.69%  |         ±21.77% | 5/1; 0.21875 | underpowered |
| jsc      | regexp           | cold   | -24.32% | -27.33% … -0.61%  |         ±28.65% | 5/1; 0.21875 | underpowered |
| jsc      | regexp           | steady | -24.73% | -30.64% … -12.73% |         ±19.32% | 6/0; 0.03125 | improvement  |
| node     | arithmetic-loops | cold   |  -6.94% | -19.06% … +6.29%  |         ±27.93% | 4/2; 0.68750 | within-noise |
| node     | arithmetic-loops | steady |  -3.57% | -14.20% … +10.45% |         ±31.84% | 3/3; 1.00000 | within-noise |
| node     | calls-recursion  | cold   |  -1.67% | -14.16% … +13.47% |         ±27.98% | 3/3; 1.00000 | within-noise |
| node     | calls-recursion  | steady |  +0.65% | -5.88% … +11.91%  |         ±25.60% | 2/4; 0.68750 | within-noise |
| node     | strings          | cold   | -13.40% | -25.13% … +33.72% |         ±80.82% | 4/2; 0.68750 | within-noise |
| node     | strings          | steady | -16.02% | -22.15% … +4.05%  |         ±24.67% | 5/1; 0.21875 | within-noise |
| node     | json             | cold   |  -6.76% | -21.21% … +19.74% |         ±26.63% | 4/2; 0.68750 | within-noise |
| node     | json             | steady |  -7.42% | -32.52% … +7.11%  |         ±76.63% | 5/1; 0.21875 | within-noise |
| node     | regexp           | cold   | -18.21% | -42.41% … +2.42%  |         ±78.21% | 5/1; 0.21875 | within-noise |
| node     | regexp           | steady | -18.35% | -36.25% … +8.06%  |         ±53.60% | 5/1; 0.21875 | within-noise |

The sole comparison warning is: **3 cells excluded zero but could not support a
verdict and are reported as underpowered** —
`jsc/json/cold`, `jsc/json/steady`, and `jsc/regexp/cold`; collect more
counterbalanced pairs. All three point toward improvement, and none is a
regression.

| Aggregate | Point Δ | 95% CI            | Empirical noise | −/+; sign p  | Verdict      |
| --------- | ------: | ----------------- | --------------: | ------------ | ------------ |
| chromium  | -11.73% | -12.51% … -10.34% |          ±2.81% | 6/0; 0.03125 | improvement  |
| jsc       | -14.29% | -18.91% … +7.61%  |         ±24.46% | 4/2; 0.68750 | within-noise |
| node      | -12.18% | -25.05% … +7.12%  |         ±32.90% | 5/1; 0.21875 | within-noise |
| all-hosts | -12.51% | -14.89% … -4.01%  |         ±13.54% | 5/1; 0.21875 | underpowered |

`acceptance.gateReady` is `true`, but `acceptance.accepted` is **`false`**.
The user non-target rule passes with zero regressions; the unchanged tool
target-materiality predicate fails. Seven target cells are exceptions:

| Target                        | Point Δ | Empirical noise | Point log ratio | Noise log ratio | Unmet criteria                                                                                |
| ----------------------------- | ------: | --------------: | --------------: | --------------: | --------------------------------------------------------------------------------------------- |
| jsc/object-properties/cold    | -21.44% |         ±80.50% |         -0.2413 |         +0.5905 | confidence-interval-includes-zero, sign-test-not-significant, within-empirical-noise-envelope |
| jsc/arrays/cold               | -10.77% |         ±18.98% |         -0.1139 |         +0.1738 | confidence-interval-includes-zero, sign-test-not-significant, within-empirical-noise-envelope |
| jsc/arrays/steady             | -12.06% |         ±39.13% |         -0.1285 |         +0.3303 | confidence-interval-includes-zero, sign-test-not-significant, within-empirical-noise-envelope |
| node/object-properties/cold   | -18.64% |         ±27.35% |         -0.2063 |         +0.2418 | within-empirical-noise-envelope                                                               |
| node/object-properties/steady | -20.66% |         ±26.28% |         -0.2315 |         +0.2333 | within-empirical-noise-envelope                                                               |
| node/arrays/cold              | -17.41% |         ±84.93% |         -0.1913 |         +0.6148 | confidence-interval-includes-zero, sign-test-not-significant, within-empirical-noise-envelope |
| node/arrays/steady            | -12.62% |         ±52.49% |         -0.1349 |         +0.4219 | confidence-interval-includes-zero, sign-test-not-significant, within-empirical-noise-envelope |

The all-host aggregate and every host point estimate improve, and every host
verdict is improvement or within-noise. That aggregation does not override any
target exception. This is a recurring plan/tool target-materiality miss of the
kind covered by plan-owner ruling A; the ruling does not alter methodology,
apply an exemption, or turn `acceptance.accepted` true. The tool reports
`exceptionalReview.required === false`; no exceptional-review exemption was
used.

### Matched Node and Chromium profiles

Each revision used the same per-cell iterations and intervals. CPU and
allocation were separate invocations with the same side/cell run ID; both used
`--warmups=1`, CPU `--cpu-sampling-interval-microseconds=100`, and allocation
`--allocation-sampling-interval-bytes=32768`.

```sh
node benchmark/profile/cli.js \
  --host="$host" --workload="$workload" --mode="$mode" --metric=cpu \
  --run-id="$run_id" --cpu-sampling-interval-microseconds=100 \
  --warmups=1 --iterations="$iterations" --output="$output"
node benchmark/profile/cli.js \
  --host="$host" --workload="$workload" --mode="$mode" --metric=allocation \
  --run-id="$run_id" --allocation-sampling-interval-bytes=32768 \
  --warmups=1 --iterations="$iterations" --output="$output"

node benchmark/profile/analyze.js \
  --baseline=.benchmark-results/issue-42-current-main-2cc/<side>-1 \
  --profiles=.benchmark-results/issue-42-current-main-2cc/profiles-<side>
```

| Host     | Workload          | Mode   | Iterations |   Checksum | CPU baseline/candidate (ms) | Allocation baseline/candidate (ms) |
| -------- | ----------------- | ------ | ---------: | ---------: | --------------------------: | ---------------------------------: |
| Node     | object-properties | cold   |          5 | 1122746965 |           417.400 / 426.124 |                  516.875 / 394.957 |
| Node     | object-properties | steady |        512 | 1122746965 |       44776.015 / 32064.054 |              47683.260 / 35145.689 |
| Node     | arrays            | cold   |          5 |  778416596 |           382.191 / 314.345 |                  415.439 / 335.142 |
| Node     | arrays            | steady |          5 |  778416596 |           351.414 / 290.118 |                  364.770 / 300.897 |
| Chromium | object-properties | cold   |          5 | 1122746965 |           376.300 / 297.400 |                  404.900 / 300.500 |
| Chromium | object-properties | steady |          5 | 1122746965 |           363.200 / 293.200 |                  382.900 / 301.600 |
| Chromium | arrays            | cold   |          6 |  778416596 |           354.300 / 309.000 |                  365.200 / 316.000 |
| Chromium | arrays            | steady |         48 |  778416596 |         2617.600 / 2285.200 |                2718.900 / 2299.100 |

The candidate analyzer accepted eight CPU/allocation pairs per revision:
source SHA and `gitDirty: false`, runtime/version, paired run IDs, warmups,
iterations, sampling intervals, raw-artifact existence, expected/observed
checksums, and non-host interpreter denominators all validate. The smallest
CPU capture window is 290.118 ms. The audit at
`$ARTIFACT_ROOT/profile-metadata-audit.json` records all 16 side/cell rows, 64
raw sidecar/artifact SHA-256 values, all capture windows, and nonzero
denominators. No denominator or metadata capture was invalid, so there were no
profile retries or promoted invalid artifacts; `profile-invalid-attempts/` is
absent.

Shares normalize each metric observation to non-host interpreter samples before
equal-observation aggregation. They are whole-branch attribution, not an
isolated parser/array contribution or a wall-time causal claim.

| Scope                    | Metric     | Category        | Baseline | Candidate | Δ points |
| ------------------------ | ---------- | --------------- | -------: | --------: | -------: |
| All 8 observations       | CPU        | object-property | 20.0254% |   7.3980% | -12.6273 |
| All 8 observations       | CPU        | arrays          |  1.1968% |   1.6421% |  +0.4453 |
| All 8 observations       | Allocation | object-property | 32.7222% |   0.0000% | -32.7222 |
| All 8 observations       | Allocation | arrays          |  0.0000% |   0.0000% |  +0.0000 |
| Steady object-properties | CPU        | object-property | 20.1497% |   5.5525% | -14.5972 |
| Steady object-properties | CPU        | arrays          |  0.0000% |   0.0000% |  +0.0000 |
| Steady object-properties | Allocation | object-property |  0.0000% |   0.0000% |  +0.0000 |
| Steady object-properties | Allocation | arrays          |  0.0000% |   0.0000% |  +0.0000 |
| Steady arrays            | CPU        | object-property | 16.2128% |   8.5661% |  -7.6467 |
| Steady arrays            | CPU        | arrays          |  2.6754% |   2.9188% |  +0.2433 |
| Steady arrays            | Allocation | object-property | 16.2111% |   0.0000% | -16.2111 |
| Steady arrays            | Allocation | arrays          |  0.0000% |   0.0000% |  +0.0000 |

Every displayed `0.0000%` allocation share has a validated nonzero
interpreter denominator; it is a sampled zero, not missing data. Profile
windows and sampled totals are diagnostics, not benchmark timing.

### Reproducibility, rejected attempt, and limits

- Canonical raw outputs and the manifest live under
  `.benchmark-results/issue-42-current-main-2cc/`. External command logs,
  `timing-capture-ledger.ndjson`, `profile-capture-ledger.ndjson`,
  `timing-metadata-audit.json`, `comparison-determinism-audit.json`,
  `profile-metadata-audit.json`, `profile-category-deltas.json`, and
  `worktree-dependency-audit.json`, and `copy-integrity-audit.json` live under
  `$ARTIFACT_ROOT`.
- One unpaired **pre-canonical timing** baseline capture was archived at
  `$ARTIFACT_ROOT/timing-invalid-attempts/baseline-1-ledger-schema-abort/`.
  Its external ledger parser incorrectly expected a nested report metadata
  object; no candidate side was captured, no value was used, and a fresh
  canonical round 1 pair replaced it. This was an audit-script error, not a
  timing or checksum failure.
- JSC has timing evidence only; the profile collector supports Node and
  Chromium.
- The comparison is one-machine evidence with substantial Node/JSC empirical
  noise in several cells. It does not establish portability or acceptance.
- Profile attribution excludes host/GC/idle/harness frames and uses sampled
  self time/bytes. It is not inclusive cost, retained heap, object lifetime,
  or a causal speedup decomposition.
