# Execution-architecture evaluation prototypes (issue #40)

These scripts are **isolated evaluation prototypes**, not part of the engine.
Nothing in `src/` imports them. They exist to produce the before/after and
ceiling evidence that [`docs/adr/0001-execution-architecture.md`](../../docs/adr/0001-execution-architecture.md)
cites when deciding which execution-architecture changes to pursue for
issue #40 (cached identifier/environment resolution, cached property lookup,
lightweight execution/completion contexts, and bytecode/IR).

They are kept under `tools/` (never `src/`) precisely because the issue
requires that "any prototype remains isolated until reviewed": measuring a
strategy must not merge speculative architecture into the production engine.

## Scripts

| Script                           | What it measures                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identifier-strategies-bench.js` | A synthetic scope chain under three identifier-resolution strategies: Reference-allocating (today), fused allocation-free walk, and an _idealized_ scope-depth hit path (handed the depth; no lookup/guard/miss/invalidation modelled). Reports throughput and per-lookup heap allocation.                                                                                                                                                                                                                                                                                                                                               |
| `engine-read-path-bench.js`      | The **real** engine (`src/index.js`) on identifier-heavy workloads. Reports throughput and peak heap, so the production read path can be measured before and after a change.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `engine-alloc-bench.js`          | The **real** engine on the same identifier-heavy workloads, sized so no GC fires inside the measured window, so the `heapUsed` delta is a clean count of bytes allocated per run. The no-GC assumption is _verified_: each `gc` event's time interval is recorded via a `PerformanceObserver`, and any sample whose window overlaps a collection is discarded (the observer's callbacks are delivered on a later timer turn, so the bench yields with `setTimeout(0)` before checking). Each workload also pins its exact expected result. This is how the ADR quantifies the eliminated `Reference` allocation. Requires `--expose-gc`. |

## Running

```sh
# Throughput only:
node tools/prototypes/identifier-strategies-bench.js
node tools/prototypes/engine-read-path-bench.js

# With allocation measurement (recommended), exposing GC so heap deltas are real:
node --expose-gc tools/prototypes/identifier-strategies-bench.js
node --expose-gc tools/prototypes/engine-read-path-bench.js
node --expose-gc tools/prototypes/engine-alloc-bench.js
```

The scripts are deterministic in what they execute; absolute timings vary by
machine, so the ADR reports ratios captured on one host in a single sitting
rather than wall-clock constants.
