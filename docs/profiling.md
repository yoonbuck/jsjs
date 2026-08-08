# Interpreter profiling evidence

This document records a reproducible local evidence pass for the jsjs
interpreter. It ranks sampled CPU/allocation hot paths; it is not a regression
baseline and does not prescribe an optimization. The captures were made at
source commit `12ac7fb1673722616858ef8b45bcf50074565746` on macOS 15.7.8
(24G824), Apple M1, 8 GiB RAM.

## Reproduction

Install only the Playwright browser executable locked by `package-lock.json` if
Chromium is unavailable:

```sh
npx playwright install --with-deps --only-shell chromium
```

Capture every benchmark host in one invocation, then summarize that same run:

```sh
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
  node benchmark/cli.js run --host=all --output=.benchmark-results/profiling-baseline
node benchmark/cli.js summary \
  --input=.benchmark-results/profiling-baseline \
  --output=.benchmark-results/profiling-baseline
```

Capture both protocol metrics for the four interpreter workloads. These are the
exact capture settings used for the evidence below: one checked warmup, one
checked measured invocation, and the default explicit sampling interval of 100.

```sh
for host in node chromium; do
  for workload in arithmetic-loops calls-recursion object-properties arrays; do
    for mode in cold steady; do
      node benchmark/profile/cli.js \
        --host="$host" \
        --workload="$workload" \
        --mode="$mode" \
        --metric=cpu \
        --metric=allocation \
        --warmups=1 \
        --iterations=1 \
        --sampling-interval=100 \
        --output=.benchmark-results/interpreter-profiling
    done
  done
done
```

Correlate the captured sidecars with the shared baseline and regenerate both
derived evidence files without rerunning profiles:

```sh
npm run profile:analyze
```

The package command is exactly:

```sh
node benchmark/profile/analyze.js \
  --baseline=.benchmark-results/profiling-baseline \
  --profiles=.benchmark-results/interpreter-profiling
```

The analyzer discovers Node and Chromium sidecars in code-unit lexical order,
requires their declared CPU and allocation artifacts, and matches every
`host`/`workload`/`mode` capture to its baseline row. It validates compatible
baseline source/run metadata, runtime versions, capture settings, sidecar
summary totals, and all four checksums before atomically replacing
`checksum-correlation.json` and `profile-analysis.json`. A missing row or
artifact, duplicate/malformed sidecar, or mismatch exits nonzero without
writing fresh success-shaped output.

The measured profiler durations ranged from 293.0 ms to 12,944.5 ms, so every
row exceeds the 250 ms target without changing a workload source. Profile
overhead is intentionally visible: capture duration is much larger than the
unprofiled benchmark median, particularly with allocation sampling at 100
bytes. Use the benchmark medians for timing and profile shares for attribution;
do not compare those two columns as equal wall-clock measurements.

### Runtime and artifact metadata

| Runtime                     | Version/identity                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Node                        | `v26.5.1`                                                                                                                              |
| Chromium (Playwright shell) | `151.0.7922.34`                                                                                                                        |
| JSC                         | `/System/Volumes/Preboot/Cryptexes/OS/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc mtimeMs=1784736095000` |

The system JSC accepts neither a useful `--version` response (it emits
`ERROR: invalid option: --version`) nor a profiler protocol consumed by this
CLI. The baseline therefore records its resolved executable identity. Its
`--help` advertises `--sample` and `-p <file>`, but this shell offered no
verified, stable, machine-readable function-level CPU or allocation mechanism
for this evidence pass. The JSC evidence below is benchmark timing and checksum
evidence only; no JSC function-level hotspot claim is made.

All generated evidence stays local and ignored:

```text
.benchmark-results/profiling-baseline/{node,chromium,jsc,summary}.json
.benchmark-results/profiling-baseline/summary.csv
.benchmark-results/interpreter-profiling/profiles/{node,chromium}/
.benchmark-results/interpreter-profiling/checksum-correlation.json
.benchmark-results/interpreter-profiling/profile-analysis.json
```

The first directory holds the one shared baseline run
`d0b3e5e3-b3da-40f8-b277-b56b98d3cbb9` generated at
`2026-08-08T04:11:08.082Z`. The second holds the raw `.cpuprofile`,
`.heapprofile`, and sidecar JSON files. None is a committed baseline. In
particular, sampled allocation bytes below are weighted allocations attributed
by the profiler, **not** retained heap, live-object size, or heap growth.

## Checksum-correlated timing

For each profile sidecar, the check reads the matching host/workload/mode
baseline row, compares its configuration `expectedChecksum` and row `checksum`
with the sidecar `expectedChecksum` and `checksum`, and fails on any difference.
`checksum-correlation.json` preserves that four-way comparison. Every one of
the 16 Node/Chromium rows passed (`BE = BO = SE = SO` below).

`jsjs median` is the baseline's unprofiled jsjs median. `CPU` is
`sample-count / sampled self-time total`; allocation is sampled bytes. These
four fields keep every hotspot observation attached to its cost and checked
result.

| Host     | Workload          | Mode   | Checksum (BE = BO = SE = SO) | jsjs median (ms) | Profile ms/iter |                    CPU | Sampled alloc. |
| -------- | ----------------- | ------ | ---------------------------: | ---------------: | --------------: | ---------------------: | -------------: |
| Node     | arithmetic-loops  | cold   |                   1397312734 |           23.189 |         808.409 |     5,208 / 902,305 µs |       59,856 B |
| Node     | arithmetic-loops  | steady |                   1397312734 |           23.183 |         649.444 |     4,141 / 742,402 µs |       24,936 B |
| Node     | calls-recursion   | cold   |                  -1100296460 |           36.397 |      12,944.470 | 80,366 / 13,040,955 µs |      131,744 B |
| Node     | calls-recursion   | steady |                  -1100296460 |           35.154 |       9,000.794 |  58,352 / 9,089,240 µs |      103,992 B |
| Node     | object-properties | cold   |                   1122746965 |           83.426 |       6,984.313 |  37,871 / 7,068,357 µs |       47,504 B |
| Node     | object-properties | steady |                   1122746965 |           85.221 |       6,489.073 |  32,393 / 6,588,054 µs |       34,160 B |
| Node     | arrays            | cold   |                    778416596 |           69.404 |       5,519.678 |  31,325 / 5,624,174 µs |       58,016 B |
| Node     | arrays            | steady |                    778416596 |           65.758 |       4,218.817 |  24,639 / 4,339,715 µs |       51,320 B |
| Chromium | arithmetic-loops  | cold   |                   1397312734 |           19.700 |         388.500 |     2,004 / 420,153 µs |       56,748 B |
| Chromium | arithmetic-loops  | steady |                   1397312734 |           19.400 |         293.000 |     1,854 / 313,025 µs |       41,024 B |
| Chromium | calls-recursion   | cold   |                  -1100296460 |           27.800 |       4,668.800 |  27,311 / 4,707,039 µs |      122,820 B |
| Chromium | calls-recursion   | steady |                  -1100296460 |           27.325 |       4,729.700 |  27,347 / 4,765,137 µs |      124,784 B |
| Chromium | object-properties | cold   |                   1122746965 |           77.500 |       2,922.100 |  16,158 / 2,957,601 µs |       84,152 B |
| Chromium | object-properties | steady |                   1122746965 |           77.350 |       2,309.000 |  13,191 / 2,352,715 µs |       69,940 B |
| Chromium | arrays            | cold   |                    778416596 |           57.500 |       1,850.100 |  11,571 / 1,882,530 µs |       64,352 B |
| Chromium | arrays            | steady |                    778416596 |           56.700 |       1,444.200 |   9,356 / 1,473,834 µs |       58,988 B |

The matching JSC baseline rows also all checksum-validated. Its jsjs medians
(cold / steady, ms) are recorded below with the exact expected and observed
baseline checksums. JSC has no profile sidecar, profiler duration, CPU samples,
or allocation samples; those profile-only fields are therefore `N/A`, rather
than inferred from the Node or Chromium captures.

| Workload          | Mode   | Expected baseline checksum | Observed baseline checksum | jsjs median (ms) | Profile ms/iter | CPU | Sampled alloc. |
| ----------------- | ------ | -------------------------: | -------------------------: | ---------------: | --------------: | --- | -------------: |
| arithmetic-loops  | cold   |                 1397312734 |                 1397312734 |           21.900 |             N/A | N/A |            N/A |
| arithmetic-loops  | steady |                 1397312734 |                 1397312734 |           21.560 |             N/A | N/A |            N/A |
| calls-recursion   | cold   |                -1100296460 |                -1100296460 |           34.060 |             N/A | N/A |            N/A |
| calls-recursion   | steady |                -1100296460 |                -1100296460 |           33.340 |             N/A | N/A |            N/A |
| object-properties | cold   |                 1122746965 |                 1122746965 |           88.720 |             N/A | N/A |            N/A |
| object-properties | steady |                 1122746965 |                 1122746965 |           87.720 |             N/A | N/A |            N/A |
| arrays            | cold   |                  778416596 |                  778416596 |           83.740 |             N/A | N/A |            N/A |
| arrays            | steady |                  778416596 |                  778416596 |           82.260 |             N/A | N/A |            N/A |

This is timing and checksum evidence only, subject to the JSC limitation above.

## Ranked sampled evidence

The following totals aggregate all 16 captured profiles: 66,267,236 µs of
sampled CPU self time and 1,134,336 sampled allocation bytes. CPU percentages
are shares of that CPU total; allocation percentages are shares of that sampled
allocation total, not retained-memory shares.

| Rank | CPU category             |     Self time | Share | Allocation category      | Sampled bytes | Share |
| ---: | ------------------------ | ------------: | ----: | ------------------------ | ------------: | ----: |
|    1 | evaluator                | 21,584,119 µs | 32.6% | host                     |     538,708 B | 47.5% |
|    2 | other-runtime            | 14,735,087 µs | 22.2% | evaluator                |     224,660 B | 19.8% |
|    3 | calls                    |  6,630,091 µs | 10.0% | references-environments  |     121,656 B | 10.7% |
|    4 | object-property          |  6,395,832 µs |  9.7% | object-property          |      84,100 B |  7.4% |
|    5 | references-environments  |  6,274,068 µs |  9.5% | other-runtime            |      80,792 B |  7.1% |
|    6 | arithmetic               |  4,395,124 µs |  6.6% | calls                    |      38,264 B |  3.4% |
|    — | all remaining categories |  6,252,915 µs |  9.4% | all remaining categories |      46,156 B |  4.1% |

`host` allocation includes profiler/browser/host frames and is not an
interpreter optimization target. The dominant attributed frames were:

| CPU frame                                   |    Self time | Share | Allocation frame                                   | Sampled bytes | Share |
| ------------------------------------------- | -----------: | ----: | -------------------------------------------------- | ------------: | ----: |
| `descriptors.js#copyDescriptorFields`       | 8,633,752 µs | 13.0% | `run-browser-page.js#runBrowserProfilePage` (host) |     128,916 B | 11.4% |
| `expressions.js#evaluateBinaryExpression`   | 8,596,899 µs | 13.0% | host `set`                                         |     125,092 B | 11.0% |
| `function-object.js#createArgumentsObject`  | 5,329,487 µs |  8.0% | `reference.js#getValue`                            |     107,728 B |  9.5% |
| `descriptors.js#completePropertyDescriptor` | 4,263,959 µs |  6.4% | host `Map`                                         |      59,468 B |  5.2% |
| `object.js#defineOwnProperty`               | 3,310,836 µs |  5.0% | `expressions.js#applyBinaryOperator`               |      55,032 B |  4.9% |
| garbage collector (host)                    | 3,095,533 µs |  4.7% | `statements.js#evaluateStatement`                  |      53,192 B |  4.7% |

The workload-specific steady profiles support the same attribution: arithmetic
spent 31.4% of its captured CPU in references/environments
(`getIdentifierReference` alone 30.5%); calls-recursion spent 20.0% in calls;
object-properties spent 29.0% in other-runtime/descriptors; and arrays
attributed 20.9% of sampled allocation to `array-object.js#defineOwnProperty`.
Those latter object/property/array observations are deliberately not candidates
here: they belong to issue #42.

## Cold setup evidence

Cold creates a realm and evaluates the source for every invocation. Steady
constructs the realm and guest function before capture, then calls it. Browser
launch and page creation remain outside both boundaries. The profiled
cold-minus-steady duration deltas (one invocation) were:

| Host     | Arithmetic |       Calls | Object properties |      Arrays |
| -------- | ---------: | ----------: | ----------------: | ----------: |
| Node     |  +159.0 ms | +3,943.7 ms |         +495.2 ms | +1,300.9 ms |
| Chromium |   +95.5 ms |    -60.9 ms |         +613.1 ms |   +405.9 ms |

These are supporting attribution signals, not setup timing measurements:
sampling perturbation and the one Chromium calls-recursion negative make a
precise cold-setup cost claim unsound. Still, cold-only sample observations
show the expected boundary work:

- Parser self samples totaled 1,833 µs on Node and 911 µs on Chromium; steady
  had zero parser-category samples in every row.
- Realm setup self samples totaled 435 µs on Node and 513 µs on Chromium;
  steady had zero realm-setup samples in every row.
- Cold frames included `create*Intrinsics` for Math, Array, Object, Date,
  RegExp, and primitive wrappers, plus `Realm`/`createNativeFunction`; their
  sparse samples establish that intrinsic construction is in the cold path.
- Chromium cold captures included `environment.js#initializeBinding`
  (410 µs CPU and 120 sampled B). Its small and inconsistent sampled delta,
  and the absence of a Node sample, mean environment construction is observed
  but not quantified as a reliable standalone cost.

## Candidate order and scope

Upper bounds are Amdahl-style limits from disjoint sampled CPU frame shares:
they assume eliminating the named frame's own sampled time, not a forecast.
No optimization was implemented.

| Rank | Candidate and owner                                                                                                                     | Evidence and upper-bound benefit                                                                                  | Implementation risk | Correctness risk                                                                 |
| ---: | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------- |
|    1 | Tighten `evaluateBinaryExpression` dispatch (`src/evaluator/expressions.js`, evaluator owner)                                           | 8,596,899 µs, 13.0% of captured CPU; at most 13% of this mixed workload/profile total.                            | Medium              | High: coercion, operator, completion, and abrupt-completion semantics.           |
|    2 | Avoid unnecessary arguments-object work (`src/runtime/function-object.js`, function-runtime owner)                                      | `createArgumentsObject`: 5,329,487 µs, 8.0% overall; calls category reaches 20.0% in steady calls-recursion.      | Medium              | High: strictness, aliasing, `callee`, and function-call observability.           |
|    3 | Narrow `isPrimitive` conversion checks (`src/runtime/conversion.js`, conversion owner)                                                  | 2,923,731 µs, 4.4% overall; an upper bound, not a reason to bypass ES conversions.                                | Low-medium          | Medium-high: boxed primitives, host values, and reference/completion boundaries. |
|    4 | Reduce redundant normal-completion creation (`src/runtime/completion.js`, completion owner)                                             | `createNormalCompletion`: 1,673,538 µs, 2.5% overall; 8.0% CPU and 19.3% sampled allocation in steady arithmetic. | Medium              | High: completion identity and abrupt-control-flow propagation.                   |
|    5 | Measure cold intrinsic construction again only after a lower-perturbation capture is available (`src/runtime/realm.js`, builtins owner) | Parser/realm samples prove placement but are sparse; no credible standalone benefit bound.                        | Medium              | Medium: initialization order and ES intrinsic identity.                          |

Cached lookup/lightweight-context/bytecode work is explicitly excluded as issue
#40 architecture work. Object, descriptor, property, and array hot paths are
explicitly excluded as issue #42 work, even though the profiles show them.

## Limits

- This is one machine and one run; repeat on a quiet, fixed-power machine before
  choosing work.
- CPU profiles are sampled self time. They do not establish inclusive cost or a
  causal speedup estimate.
- Allocation samples are not retained heap; garbage collection and allocation
  samples are affected by collector and profiler behavior.
- The capture has one measured iteration because each source workload already
  exceeded 250 ms under the requested profiler. The benchmark baseline has its
  own calibrated warmups and samples.
- Node and Chromium support the inspector/CDP capture used here. The system JSC
  shell was benchmarked, but no stable JSC function-level profile is claimed.
