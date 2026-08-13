# Performance architecture release baseline

## Integrated milestone

This page is the durable release baseline for the integrated performance
milestone in issue #29. It ties together the accepted
[execution-architecture ADR](adr/0001-execution-architecture.md), the detailed
[profiling history](profiling.md), and the exact PR #54 before/after comparison
between baseline
`5a196855584f0d916508cfaca7e5444b572f0f02` and candidate
`6be14d8a3414e072391cdeb5c9af2a8b35a38807`. The runtime and benchmark behavior
were already integrated; this document only publishes the preserved release
evidence.

The integrated components were merged on these exact commits:

- #44 / PR #48: `9e73ec76fb3b103208410040d3ed82eb0ecef58d`
- #39 / PR #50: `d9ed3e242b2e15ea3e47b4b63b80f459f017c77c`
- #40 / PR #52: `03a91bd6b137c7b188df15fb6a2c8b3b5ec56fac`
- #42 / PR #54: `9ee337ac364b625195c21421f26d658b683c43dc`

## Architecture disposition

[ADR 0001](adr/0001-execution-architecture.md) accepted the #40
execution-architecture direction and left object/property/array hot paths to
#42. [profiling.md](profiling.md) likewise treats profiles as attribution
evidence rather than speedup forecasts. PR #54 therefore preserved the
comparator's unchanged methodology, thresholds, targets, parser, rounds, and
acceptance fields while documenting a separate owner merge adjudication for the
exact-current-base comparison.

## Authoritative before/after comparison

### Methodology and exact source identities

- Authoritative comparison root:
  `/Users/jordan/.copilot/repos/copilot-worktrees/jsjs/yoonbuck-optimize-object-array-hot-paths/.benchmark-results/issue-42-final-current-main/`
- Generated comparison files: `comparison.json`, `comparison.md`, generated at
  `2026-08-13T00:21:38.961Z`
- Audit identity: 6 pairs, 12 capture roots, 12 unique run IDs, 3
  `baseline-candidate` rounds, 3 `candidate-baseline` rounds, clean source
  `true`, and 504 verified checksums
- Hosts and versions: Chromium `151.0.7922.34`, JSC
  `/System/Volumes/Preboot/Cryptexes/OS/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc mtimeMs=1785601887000`,
  Node `v20.20.2`
- Report schema `3`, profile `default`, warmups `3`, samples `9`, seed
  `420042`, 20000 bootstrap resamples, alpha `0.05`
- Targets: `object-properties` and `arrays`
- Cell statistic: the run median of `lanes.jsjs.normalizedSamplesMs` per root,
  then one paired relative log ratio per round, `log(candidate) - log(baseline)`
- Point estimate: `exp(median(paired log ratios)) - 1`
- Interval: deterministic paired bootstrap of that median, resampling whole
  pairs with replacement from a seeded PRNG
- Significance: exact two-sided sign test over the nonzero paired deltas
- Noise envelope: pooled within-revision pairwise self-differences transformed
  back to relative percent; it is measured noise, not a configured threshold
- Aggregates: per-run geometric means across every workload/mode cell of one
  host, then across all hosts, using the identical paired statistic, noise
  envelope, and verdict

### Target cells

The comparator-generated target rows are reproduced verbatim from
`comparison.md`:

```text
| Host | Workload | Mode | Target | Point % | 95% CI % | Sign p | Noise envelope % | Verdict |
| ---- | -------- | ---- | ------ | ------- | -------- | ------ | ---------------- | ------- |
| chromium | object-properties | cold | yes | -13.47 | -14.34 … -8.50 | 0.03125 | ±14.42 | improvement |
| chromium | object-properties | steady | yes | -13.15 | -14.47 … -11.61 | 0.03125 | ±9.67 | improvement |
| chromium | arrays | cold | yes | -14.10 | -18.75 … -7.82 | 0.03125 | ±14.51 | improvement |
| chromium | arrays | steady | yes | -13.56 | -17.69 … -9.45 | 0.03125 | ±8.27 | improvement |
| jsc | object-properties | cold | yes | -23.61 | -27.81 … +16.51 | 0.68750 | ±78.12 | within-noise |
| jsc | object-properties | steady | yes | -23.55 | -24.99 … -3.32 | 0.21875 | ±69.41 | underpowered |
| jsc | arrays | cold | yes | -14.30 | -17.41 … +13.01 | 0.21875 | ±78.54 | within-noise |
| jsc | arrays | steady | yes | -12.84 | -15.63 … +57.27 | 0.21875 | ±203.80 | within-noise |
| node | object-properties | cold | yes | -22.10 | -25.56 … +1.46 | 0.21875 | ±70.50 | within-noise |
| node | object-properties | steady | yes | -20.60 | -24.06 … +26.47 | 0.21875 | ±185.52 | within-noise |
| node | arrays | cold | yes | -13.20 | -19.91 … +9.38 | 0.21875 | ±73.33 | within-noise |
| node | arrays | steady | yes | -13.05 | -16.76 … -11.53 | 0.03125 | ±41.70 | within-noise |
```

### Aggregates and non-target results

`comparison.md` reports this generated warning exactly:

```text
4 cell(s) excluded zero but could not support a verdict and are reported as underpowered: chromium/calls-recursion/cold, jsc/calls-recursion/cold, jsc/calls-recursion/steady, jsc/object-properties/steady. Collect more counterbalanced pairs.
```

For audit completeness, the full generated cells table is also preserved
verbatim:

```text
| Host | Workload | Mode | Target | Point % | 95% CI % | Sign p | Noise envelope % | Verdict |
| ---- | -------- | ---- | ------ | ------- | -------- | ------ | ---------------- | ------- |
| chromium | arithmetic-loops | cold | no | -1.66 | -12.42 … +0.74 | 1.00000 | ±21.57 | within-noise |
| chromium | arithmetic-loops | steady | no | -0.40 | -2.92 … +0.96 | 0.68750 | ±6.32 | within-noise |
| chromium | calls-recursion | cold | no | -2.02 | -18.04 … -0.67 | 0.21875 | ±53.12 | underpowered |
| chromium | calls-recursion | steady | no | -3.71 | -6.06 … +0.89 | 0.68750 | ±6.95 | within-noise |
| chromium | object-properties | cold | yes | -13.47 | -14.34 … -8.50 | 0.03125 | ±14.42 | improvement |
| chromium | object-properties | steady | yes | -13.15 | -14.47 … -11.61 | 0.03125 | ±9.67 | improvement |
| chromium | arrays | cold | yes | -14.10 | -18.75 … -7.82 | 0.03125 | ±14.51 | improvement |
| chromium | arrays | steady | yes | -13.56 | -17.69 … -9.45 | 0.03125 | ±8.27 | improvement |
| chromium | strings | cold | no | -14.62 | -16.42 … -11.45 | 0.03125 | ±9.55 | improvement |
| chromium | strings | steady | no | -15.18 | -28.01 … -13.60 | 0.03125 | ±31.11 | within-noise |
| chromium | json | cold | no | -9.68 | -19.14 … -6.93 | 0.03125 | ±20.07 | within-noise |
| chromium | json | steady | no | -9.90 | -17.79 … +0.07 | 0.21875 | ±24.86 | within-noise |
| chromium | regexp | cold | no | -17.95 | -20.09 … -15.06 | 0.03125 | ±10.57 | improvement |
| chromium | regexp | steady | no | -19.03 | -25.34 … -17.09 | 0.03125 | ±12.42 | improvement |
| jsc | arithmetic-loops | cold | no | +0.64 | -3.71 … +3.43 | 1.00000 | ±11.84 | within-noise |
| jsc | arithmetic-loops | steady | no | +2.07 | -3.07 … +12.38 | 0.21875 | ±18.96 | within-noise |
| jsc | calls-recursion | cold | no | -4.25 | -11.22 … -0.67 | 0.21875 | ±19.99 | underpowered |
| jsc | calls-recursion | steady | no | -3.27 | -6.85 … -0.84 | 0.21875 | ±31.33 | underpowered |
| jsc | object-properties | cold | yes | -23.61 | -27.81 … +16.51 | 0.68750 | ±78.12 | within-noise |
| jsc | object-properties | steady | yes | -23.55 | -24.99 … -3.32 | 0.21875 | ±69.41 | underpowered |
| jsc | arrays | cold | yes | -14.30 | -17.41 … +13.01 | 0.21875 | ±78.54 | within-noise |
| jsc | arrays | steady | yes | -12.84 | -15.63 … +57.27 | 0.21875 | ±203.80 | within-noise |
| jsc | strings | cold | no | -27.51 | -33.19 … +4.94 | 0.21875 | ±100.57 | within-noise |
| jsc | strings | steady | no | -25.12 | -30.09 … +42.57 | 0.68750 | ±120.68 | within-noise |
| jsc | json | cold | no | -19.83 | -28.25 … +11.63 | 0.21875 | ±81.55 | within-noise |
| jsc | json | steady | no | -13.24 | -20.07 … +61.64 | 0.68750 | ±121.75 | within-noise |
| jsc | regexp | cold | no | -25.84 | -27.69 … +5.00 | 0.21875 | ±93.89 | within-noise |
| jsc | regexp | steady | no | -24.28 | -28.22 … -17.57 | 0.03125 | ±25.98 | improvement |
| node | arithmetic-loops | cold | no | +2.55 | -0.33 … +15.51 | 0.21875 | ±48.25 | within-noise |
| node | arithmetic-loops | steady | no | +3.83 | +1.33 … +25.13 | 0.03125 | ±84.85 | within-noise |
| node | calls-recursion | cold | no | +2.12 | -23.05 … +42.49 | 1.00000 | ±118.73 | within-noise |
| node | calls-recursion | steady | no | +1.93 | -12.26 … +14.29 | 0.68750 | ±49.50 | within-noise |
| node | object-properties | cold | yes | -22.10 | -25.56 … +1.46 | 0.21875 | ±70.50 | within-noise |
| node | object-properties | steady | yes | -20.60 | -24.06 … +26.47 | 0.21875 | ±185.52 | within-noise |
| node | arrays | cold | yes | -13.20 | -19.91 … +9.38 | 0.21875 | ±73.33 | within-noise |
| node | arrays | steady | yes | -13.05 | -16.76 … -11.53 | 0.03125 | ±41.70 | within-noise |
| node | strings | cold | no | -27.90 | -29.51 … -20.28 | 0.03125 | ±40.21 | within-noise |
| node | strings | steady | no | -29.51 | -32.30 … -21.98 | 0.03125 | ±34.17 | improvement |
| node | json | cold | no | -21.69 | -37.48 … -11.31 | 0.03125 | ±56.34 | within-noise |
| node | json | steady | no | -20.29 | -39.78 … -15.72 | 0.03125 | ±63.97 | within-noise |
| node | regexp | cold | no | -29.85 | -36.42 … -24.47 | 0.03125 | ±18.00 | improvement |
| node | regexp | steady | no | -33.66 | -39.09 … -29.01 | 0.03125 | ±18.05 | improvement |
```

The generated non-target-regression section says `None.` Zero non-target
regressions does not mean every non-target point estimate improved; it means no
non-target cell was reported as a regression.

The comparator-generated aggregate rows are reproduced verbatim from
`comparison.md`:

```text
| Scope | Point % | 95% CI % | Sign p | Noise envelope % | Verdict |
| ----- | ------- | -------- | ------ | ---------------- | ------- |
| chromium | -11.31 | -13.94 … -9.85 | 0.03125 | ±9.05 | improvement |
| jsc | -15.00 | -18.35 … +8.58 | 0.21875 | ±55.54 | within-noise |
| node | -17.35 | -22.78 … -4.38 | 0.21875 | ±54.36 | underpowered |
| all-hosts | -13.87 | -15.80 … -6.03 | 0.03125 | ±19.91 | within-noise |
```

### Machine verdict and owner adjudication

- Machine verdict from `comparison.md`: `Verdict: **not accepted** (gate-ready:
true, non-target regressions: 0).`
- In `comparison.json`, `acceptance.gateReady` remained `true` and
  `acceptance.accepted` remained `false`.
- The owner approved PR #54 under a superseding policy decision because the
  all-host geomean was `-13.865860%`, all six paired deltas were negative,
  exact sign-test `p = 0.03125`, the 95% CI was wholly faster
  (`-15.803939%` to `-6.027739%`), non-target regressions remained zero, all
  ten GitHub checks were green including pinned Test262, targeted local Test262
  passed `16/16` with `TZ=UTC`, and the refreshed GPT-5.6 Terra whole-branch
  review found no Critical or Important defect.
- That owner approval did not change the methodology, thresholds, targets,
  parser, rounds, raw evidence, or `acceptance.accepted`. The machine gate
  remained ready, but the comparator remained not accepted.

## Raw evidence and provenance

- Preserved comparison root:
  `/Users/jordan/.copilot/repos/copilot-worktrees/jsjs/yoonbuck-optimize-object-array-hot-paths/.benchmark-results/issue-42-final-current-main/`
- Durable provenance root:
  `/Users/jordan/.copilot/session-state/22e18a29-2b03-4b69-863e-a76d8a6a6356/files/issue-42-final-5a19685/`
- Canonical baseline capture roots:
  `.benchmark-results/issue-42-final-current-main/baseline-1`,
  `.benchmark-results/issue-42-final-current-main/baseline-2`,
  `.benchmark-results/issue-42-final-current-main/baseline-3`,
  `.benchmark-results/issue-42-final-current-main/baseline-4`,
  `.benchmark-results/issue-42-final-current-main/baseline-5`,
  `.benchmark-results/issue-42-final-current-main/baseline-6`
- Canonical candidate capture roots:
  `.benchmark-results/issue-42-final-current-main/candidate-1`,
  `.benchmark-results/issue-42-final-current-main/candidate-2`,
  `.benchmark-results/issue-42-final-current-main/candidate-3`,
  `.benchmark-results/issue-42-final-current-main/candidate-4`,
  `.benchmark-results/issue-42-final-current-main/candidate-5`,
  `.benchmark-results/issue-42-final-current-main/candidate-6`
- Manifest and generated comparison outputs: `comparison-manifest.json`,
  `comparison.json`, `comparison.md`, `comparison-validation-a.json`,
  `comparison-validation-a.md`, `comparison-validation-b.json`, and
  `comparison-validation-b.md`
- Matched Node/Chromium profile roots:
  `.benchmark-results/issue-42-final-current-main/profiles-baseline/profiles/chromium`,
  `.benchmark-results/issue-42-final-current-main/profiles-baseline/profiles/node`,
  `.benchmark-results/issue-42-final-current-main/profiles-candidate/profiles/chromium`,
  `.benchmark-results/issue-42-final-current-main/profiles-candidate/profiles/node`
- Correlation and analysis outputs:
  `profiles-baseline/checksum-correlation.json`,
  `profiles-baseline/profile-analysis.json`,
  `profiles-candidate/checksum-correlation.json`, and
  `profiles-candidate/profile-analysis.json`
- Timing/profile ledgers and environment records in the durable provenance root:
  `timing-capture-ledger.tsv`, `timing-environment.tsv`,
  `profile-capture-ledger.tsv`, `profile-environment.tsv`,
  `idle-precondition.tsv`, `idle-precondition-attempt-2.tsv`,
  `idle-precondition-attempt-3.tsv`, `profile-idle-precondition.tsv`,
  `profile-retry-idle.tsv`, `timing-logs/`, and `profile-logs/`
- `profile-artifact-checksums.sha256` records 64 promoted raw profile artifacts
- The separately quarantined Chromium arrays/cold CPU attempt with raw
  `timeDelta=-1` is preserved at
  `profile-invalid-attempts/candidate/chromium/`; its `reason.txt` records
  `reason=Chromium raw timeDeltas[41] was -1, producing invalid frame selfTime -1`
- Excluded attempts remain preserved separately: the missing-vendor preflight at
  `pre-capture-failures/vendor-sync-missing/`, the ambient-contaminated timing
  attempt at `timing-attempt-1-ambient-contaminated/`, and the partial
  load-guard attempt at `timing-attempt-2-guarded-partial/`
- These ignored/local artifacts are not repository-distributed files and must be
  retained by the release owner

## Validation

- The final whole-branch audit recomputed `comparison.json` from the manifest
  and all capture roots and matched both `comparison-validation-a.json` and
  `comparison-validation-b.json` after excluding only `generatedAt`
- Matched Node/Chromium CPU and allocation profiles passed exact-SHA,
  paired-run-ID, interval, iteration, checksum, artifact-count, and
  nonzero-denominator audits
- All ten current-head GitHub checks were green at exact head
  `6be14d8a3414e072391cdeb5c9af2a8b35a38807` over exact base
  `5a196855584f0d916508cfaca7e5444b572f0f02`: Workflow drift, Vendor
  integrity, Formatting, Lint, Type check, Node tests, Browser tests, Test262
  fixtures, Benchmark smoke, and Pinned Test262 subset
- Targeted local Test262 passed `16/16` with `TZ=UTC`
- The refreshed GPT-5.6 Terra whole-branch review reported `MERGE` under the
  superseding policy and found no Critical or Important defect in the reviewed
  range

## Limits

- This page publishes preserved PR #54 artifacts; it does not recapture
  benchmarks, alter runtime behavior, or recalculate the machine verdict
- Profiles remain sampled attribution evidence; profile capture windows are not
  wall-time measurements or isolated causal proof
- The comparator still reports seven target cells as `within-noise`, one target
  cell as `underpowered`, and the all-host aggregate verdict as `within-noise`;
  the owner adjudication is a separate release-policy decision, not machine
  acceptance
- Ignored/local provenance roots are required for auditability but are not
  repository-distributed files
