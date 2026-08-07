# Cross-Runtime Benchmark Harness Design

## Goal

Productize a reproducible performance harness that compares native JavaScript
with jsjs under Node, Chromium, and JavaScriptCore. The harness measures both
cold/end-to-end and steady-state execution, verifies every workload with a
committed checksum, emits machine-readable results, and keeps CI focused on
correctness rather than timing thresholds.

## Architecture

The harness lives under `benchmark/` and has one portable core shared by thin
host adapters:

- an immutable ES5 workload manifest with committed expected checksums
- portable statistics, calibration, schema validation, and measurement modules
- Node, Chromium, and JSC adapters that supply clocks, execution primitives,
  runtime metadata, and output transport
- a Node orchestrator for host-specific runs, all-host runs, smoke runs, and
  summary generation

The portable core owns all sampling and reporting semantics. Adapters must not
reimplement medians, percentiles, calibration, or checksum policy.

## Workloads and correctness

The default workload set covers arithmetic and loops, calls and recursion,
object properties, arrays, strings, JSON, and regular expressions. Sources use
ES5 syntax and deterministic inputs only. Each workload declares a fixed signed
32-bit expected checksum in the manifest.

Expected checksums are not computed from a native run. Native and jsjs results
are each compared with the committed value during calibration, warmup, and
measured sampling. A mismatch aborts the run with the workload, mode, lane, and
actual value.

The smoke profile uses the same execution paths with reduced deterministic
work. It exists to validate the harness quickly; it is not a performance
baseline.

## Measurement modes

### Cold/end-to-end

Each native invocation constructs a `Function` from the workload source and
invokes it. Each jsjs invocation creates a fresh realm and calls
`evaluateScript`, so realm initialization, parsing, global declaration setup,
and execution are timed.

These paths are intentionally not claimed to have identical setup work. They
represent each engine's documented source-to-result embedding boundary, and
the distinction is recorded in every report.

### Steady state

Native timing invokes a precompiled host function. jsjs timing invokes a
pre-created guest EngineFunction in a pre-created realm. Realm creation,
parsing, declaration setup, and guest function creation occur before timing.
Normal guest function-call setup and all workload computation remain inside
the timed scope.

The benchmark reaches the guest function through the realm's engine object API.
That dependency is isolated in the jsjs executor rather than spread through
the measurement core.

## Calibration and sampling

Each host, mode, and lane calibrates independently. Timed probes estimate an
invocation duration, then select a batch size toward a configurable target
sample duration. Batch growth is bounded. If one invocation already exceeds
the target, the batch remains one.

Calibration never changes workload semantics. Every batch returns and verifies
the checksum from its final invocation. Warmup batches run after calibration,
followed by the configured measured sample count. Reports preserve both raw
batch durations and normalized per-invocation durations.

The default profile favors useful local measurements. The smoke profile uses a
small target, minimal warmup, and few samples so CI validates real execution
without becoming a long or flaky performance job.

## Statistics and aggregation

For every host, mode, lane, and workload, the harness reports:

- raw batch samples and batch size
- normalized per-invocation samples
- median
- nearest-rank p95
- population coefficient of variation
- jsjs/native median slowdown

The cross-workload aggregate is the geometric mean of positive per-workload
slowdowns. Statistical helpers reject empty, non-finite, or non-positive input
where the requested statistic requires positive values.

The summarizer validates schema versions, configurations, workload order, and
checksums before combining host reports. Incompatible reports fail rather than
silently producing a misleading aggregate.

## Artifacts and commands

Each host writes versioned JSON containing:

- generation timestamp and runtime metadata
- complete benchmark configuration
- explicit execution-boundary descriptions
- workload names and committed checksums
- calibrated batch sizes
- raw and summarized samples
- per-workload slowdowns

The summarizer writes aggregate JSON and CSV. Timing artifacts go to a
user-selected or default ignored output directory and are not committed.

Package commands provide Node, Chromium, JSC, all-host, summary, and smoke entry
points. Missing Playwright browsers or `jsc` fail with actionable setup
instructions; no adapter silently skips.

## Error handling

The CLI rejects unknown options, invalid numeric settings, duplicate hosts,
unknown workloads, incompatible input reports, and unsafe output paths.
Subprocess failures retain the failing host and command. Browser and JSC
resources are closed in `finally` paths. Output files are written only after a
complete valid report has been produced.

## Testing and CI

Implementation follows strict red-green-refactor cycles:

- portable unit tests cover workload checksums, statistics, calibration,
  configuration, schema validation, and aggregation
- deterministic fake clocks and executors cover sampling behavior and failure
  messages
- adapter contract tests cover equivalent report shape
- a Node smoke integration runs the real native and jsjs paths and validates
  the generated artifact

CI runs correctness and smoke behavior only. It never asserts elapsed-time,
slowdown, p95, CV, or regression thresholds. The generated CI pipeline and its
workflow contract remain the source of truth.

## Documentation

A benchmark guide documents prerequisites, commands, execution boundaries,
profiles, artifact fields, statistical definitions, interpretation caveats,
and reproducibility practices. README and the testing guide link to it and list
the new commands without turning the README into a benchmark report.

## Acceptance Criteria

- Default and smoke runs checksum-validate native and jsjs execution.
- Node, Chromium, and JSC use the same workloads and portable measurement core.
- Cold and steady execution boundaries are explicit and independently sampled.
- Calibration, warmups, medians, p95, CV, and geometric-mean slowdown are
  present in versioned machine-readable artifacts.
- JSON and CSV summaries reject incompatible or checksum-divergent inputs.
- CI exercises real smoke behavior without performance thresholds.
- Setup, rerun instructions, methodology, and caveats are documented.
