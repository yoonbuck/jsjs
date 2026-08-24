# Testing

## Setup

Install dependencies and populate the vendored directory:

```sh
npm install
```

`npm install` runs `tools/vendor/sync.js` through the `prepare` script, which
writes `vendor/acorn/` from the version pinned in `package.json`. The vendor
directory is generated and gitignored.

Benchmark-specific CLI options, artifact schemas, reproducibility guidance, and
interpretation caveats are in [`docs/benchmarking.md`](benchmarking.md).

### Browser prerequisites

`npm run test:browser` needs Playwright's headless Chromium shell. Install it
once:

```sh
npx playwright install --with-deps --only-shell chromium
```

This is the exact command CI runs. The headless shell is a separate download
from full Chromium — installing one and launching the other silently skips tests.

### JSC prerequisites

`npm run test:jsc` and `npm run test262:jsc` need `jsc` on `PATH`. macOS ships
it inside the JavaScriptCore framework rather than in a bin directory:

```sh
PATH="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" npm run test:jsc
```

## Commands

| Command                                                                                                                                                  | What it does                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                                                                                                                               | The Node suites, then the Test262 fixture suite through the CLI                                                                                                                                                                 |
| `npm run test:node`                                                                                                                                      | Every portable suite plus the Node-only suites in `test/node/`                                                                                                                                                                  |
| `npm run test:browser`                                                                                                                                   | Every portable suite in the headless Chromium shell via Playwright                                                                                                                                                              |
| `npm run test:jsc`                                                                                                                                       | Every portable suite in the `jsc` shell                                                                                                                                                                                         |
| `npm run test262:fixtures`                                                                                                                               | Test262 runner over `test/fixtures/test262`, forcing the `fixture-subset` feature (JSON lines on stdout)                                                                                                                        |
| `npm run test262:fixtures:manifest`                                                                                                                      | The same fixture tree with the feature allowlist defaulted from `tools/test262/features.json`                                                                                                                                   |
| `TZ=UTC npm run test262:es2015-release`                                                                                                                  | Focused pinned Promise+generator+module+object/function+syntax Test262 release gate; does not rewrite broad reports or selection                                                                                                |
| `TZ=UTC npm run test262:es2015:m0 -- --ledger=tools/test262/es2015-m0-paths.txt --output=.superpowers/issue-79/m0-execution.json`                        | Execute only the reviewed M0 object-internal-method ledger (240 roots / 459 variants); writes ignored evidence and never invokes a broad selector                                                                               |
| `TZ=UTC npm run test262:es2015:m1 -- --ledger=tools/test262/es2015-m1-paths.txt --output=.superpowers/issue-80/m1/execution.json`                        | Execute only the reviewed M1 Reflect ledger (113 roots / 226 variants); writes ignored evidence and never invokes a broad selector                                                                                              |
| `TZ=UTC npm run test262:es2015:p1c -- --ledger=tools/test262/es2015-p1c-paths.txt --output=.superpowers/sdd/2026-08-23-p1c-catch-binding/execution.json` | Execute only the reviewed P1C catch-binding ledger (81 roots / 161 variants); writes ignored evidence and never invokes a broad selector                                                                                        |
| `TZ=UTC npm run test262:es2015:provenance`                                                                                                               | Rebuild the immutable unknown-edition provenance foundation, create or canonicalize empty decision fragments, and refuse to overwrite any non-empty fragment                                                                    |
| `TZ=UTC npm run test262:es2015:provenance:check`                                                                                                         | Verify the checked-in unknown-edition provenance foundation and decision fragments without writing; metadata/hash-only and cannot call `runTest262Suite`                                                                        |
| `TZ=UTC npm run test262:es2015:provenance:ledger -- --render-ledger=UA`                                                                                  | Render the exact code-unit-sorted ledger for one atomic provenance batch code (`UA`, `UB`, `UL1`-`UL4`, `US1`-`US7`)                                                                                                            |
| `TZ=UTC npm run test262:cross-realm`                                                                                                                     | Execute only the immutable H0 cross-Realm harness corpus; complete roots promote and all remaining roots retain reviewed reassignment evidence                                                                                  |
| `TZ=UTC npm run test262:es2015:audit`                                                                                                                    | Rebuild the deterministic ES2015 taxonomy from the exact pinned checkout                                                                                                                                                        |
| `TZ=UTC npm run test262:es2015:audit:check`                                                                                                              | Verify the checked-in taxonomy and promotion provenance without writing, including the compact final-base H0 delta, non-H0, denominator, and owner-delta proof                                                                  |
| `TZ=UTC npm run test262:es2015:sync-promoted-report`                                                                                                     | Rebuild report and coverage bytes from committed pre-promotion records plus immutable exact promotion evidence; never executes the broad subset                                                                                 |
| `NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream`                                                                                 | **CI-only:** broad pinned upstream subset; regenerates `docs/test262-report.jsonl` and the coverage block in `docs/conformance.md`                                                                                              |
| `NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream:check`                                                                           | **CI-only:** broad pinned run in check mode; fails if either generated artifact is stale                                                                                                                                        |
| `TZ=UTC npm run test262:select`                                                                                                                          | Derive the upstream subset from the ES5 selection policy and rewrite `tools/test262/upstream-subset.json`                                                                                                                       |
| `TZ=UTC npm run test262:select:check`                                                                                                                    | The same derivation, writing nothing: fails if the committed subset is stale                                                                                                                                                    |
| `npm run test262:exclusions:check`                                                                                                                       | Runs every per-file exclusion; fails on stale exclusions, unapproved unverifiable results, stale approvals, missing policy paths, or a missing/wrong pinned checkout                                                            |
| `npm run test262:jsc`                                                                                                                                    | The fixture suite under the `jsc` shell                                                                                                                                                                                         |
| `npm run benchmark`                                                                                                                                      | Run Node, Chromium, and `jsc` with shared run metadata, atomically promoting the validated report set to `.benchmark-results/`                                                                                                  |
| `npm run benchmark:node`                                                                                                                                 | Run only the Node host benchmark and write `node.json` under the default ignored benchmark output directory                                                                                                                     |
| `npm run benchmark:browser`                                                                                                                              | Run only the Chromium host benchmark and write `chromium.json` under the default ignored benchmark output directory                                                                                                             |
| `npm run benchmark:jsc`                                                                                                                                  | Run only the `jsc` host benchmark and write `jsc.json` under the default ignored benchmark output directory                                                                                                                     |
| `npm run benchmark:smoke`                                                                                                                                | Run the smoke profile under Node and write an eight-workload validated report to `.benchmark-results/smoke/node.json`                                                                                                           |
| `npm run benchmark:summary`                                                                                                                              | Reject mixed/stale host runs, then atomically write deterministic `summary.json` plus metadata-bearing `summary.csv`                                                                                                            |
| `npm run benchmark:compare`                                                                                                                              | Audit ordered baseline/candidate capture-root pairs and decide regression, improvement, underpowered, or within measured noise from repeated samples alone                                                                      |
| `npm run profile:node`                                                                                                                                   | Invoke the Node CPU/allocation profiler CLI; add its required workload, mode, metric, warmup, and iteration flags                                                                                                               |
| `npm run profile:browser`                                                                                                                                | Invoke the Chromium CPU/allocation profiler CLI; add its required workload, mode, metric, warmup, and iteration flags                                                                                                           |
| `npm run profile:smoke`                                                                                                                                  | Capture a checked one-iteration Node CPU profile of steady `arithmetic-loops` to `.benchmark-results/profile-smoke`                                                                                                             |
| `npm run profile:analyze`                                                                                                                                | Analyze paired schema-2 CPU/allocation sidecars with checksum correlation and equal-observation, interpreter-only hotspot shares; rejects a pair with a zero non-`host` denominator and writes only below `.benchmark-results/` |
| `npm run ci:contract`                                                                                                                                    | Safe local CI subset: vendor, format, lint, type check, workflow, Node, fixture, and browser checks; no upstream Test262 execution                                                                                              |
| `npm run typecheck`                                                                                                                                      | `tsc` in checkJs mode over the repository's `jsconfig.json`                                                                                                                                                                     |
| `npm run format`                                                                                                                                         | Prettier `--check` over the entire repository                                                                                                                                                                                   |
| `npm run lint`                                                                                                                                           | ESLint (flat config) over the repository                                                                                                                                                                                        |
| `npm run vendor:sync`                                                                                                                                    | Refresh `vendor/` from the dependency versions pinned in `package.json`                                                                                                                                                         |
| `npm run vendor:check`                                                                                                                                   | Verify `vendor/` matches the pinned versions (fails if stale)                                                                                                                                                                   |
| `npm run unicode:generate`                                                                                                                               | Regenerate `src/builtins/unicode-case-data.js` from the Unicode Character Database                                                                                                                                              |
| `npm run unicode:check`                                                                                                                                  | Verify `src/builtins/unicode-case-data.js` is up to date (fails if stale)                                                                                                                                                       |
| `npm run ci:generate`                                                                                                                                    | Regenerate `.github/workflows/ci.yml` from `tools/ci/pipeline.js`                                                                                                                                                               |
| `npm run ci:check`                                                                                                                                       | Verify the committed CI workflow matches the pipeline definition (fails if stale)                                                                                                                                               |
| `npm run prepare`                                                                                                                                        | Runs automatically on `npm install`; equivalent to `vendor:sync`                                                                                                                                                                |

The bounded M1 Reflect entry point is `npm run test262:es2015:m1`; invoke it
only with the exact ledger and an ignored repository-relative output.
The bounded P1C catch-binding entry point is `npm run test262:es2015:p1c`;
invoke it only under UTC with the exact ledger and an ignored
repository-relative output:

```sh
TZ=UTC npm run test262:es2015:p1c -- \
  --ledger=tools/test262/es2015-p1c-paths.txt \
  --output=.superpowers/sdd/2026-08-23-p1c-catch-binding/execution.json
```

## Suite organization

### Portable suites (`test/suites.js`)

`test/suites.js` is the one registry of portable suites. All three runners
(`test/run-node.js`, `test/run-browser.js`, `test/run-jsc.js`) take their
default work from it. `test/node/repository-invariants.test.js` fails if a suite
file exists that no runner registers.

The registry currently lists 80 portable suites covering the parser, static
semantics, runtime records, objects, environments, evaluator, ES5 built-ins,
ES2015 syntax/runtime integration, Symbols and iteration, Agent Jobs and
Promises, static modules, benchmark/profile core, and synchronous generator
function, runtime, yield, control-flow, delegation, and stack behavior.

### Node-only suites (`test/node/`)

Thirteen suites need a filesystem and cannot run in the browser or `jsc`:

- `test/node/benchmark-cli.test.js` — validates benchmark CLI argument
  parsing, sequential all-host orchestration, and atomic validated report
  writes.
- `test/node/benchmark-compare.test.js` — validates ordered capture-pair
  comparison, significance gating, and report/CSV decision output.
- `test/node/benchmark-hosts.test.js` — covers the real Node smoke host plus
  the browser/JSC host adapters' parsing, path-guard, setup-error, and
  monotonic-clock helpers.
- `test/node/jsc-runner.test.js` — covers the JSC host runner's argument-free
  bridge, result reporting, and required global contract.
- `test/node/benchmark-summary.test.js` — validates cross-host compatibility
  checks, deterministic CSV output, and summary CLI file I/O.
- `test/node/profile-analysis.test.js` — covers deterministic profile-sidecar
  discovery, checksum correlation, metadata/artifact validation,
  paired nonzero-interpreter-denominator validation, equal-observation
  normalization, and paired atomic analysis output replacement.
- `test/node/profiling-cli.test.js` — covers protocol lifecycle cleanup, atomic
  raw profile output, and Node/Chromium capture orchestration.
- `test/node/es2015-provenance.test.js` — covers the immutable unknown-edition
  base ledger, all 13 batch identities, exact ledger/issue rendering, strict
  versus draft review validation, and the filesystem CLI boundary.
- `test/node/es2015-m0.test.js` — validates the exact M0 ledger, bounded focused
  execution, generic authority evidence/projection schemas, and issue-specific
  destinations under the existing shared Reflect/Proxy roadmap blocker.
- `test/node/es2015-m1.test.js` — validates the exact M1 ledger, bounded Reflect
  execution, generic scratch evidence/projections, and Proxy residual ownership.
- `test/node/es2015-taxonomy.test.js` — validates the deterministic ES2015
  taxonomy, exact promotion evidence, and metadata-only audit/check boundary.
- `test/node/upstream-select.test.js` — validates the generated upstream subset
  derivation from policy, feature manifests, and exclusions.
- `test/node/repository-invariants.test.js` — architecture checks: vendor
  invariants, parser dependency isolation, suite registration, Markdown link
  contracts, documentation command validity, reference doc existence.
- `test/node/workflow-contract.test.js` — parses the committed CI YAML with a
  real YAML parser and checks it against an expectation table (job commands,
  permissions, action pins, upstream revision). Also parses both Test262
  manifests and executes every declared feature probe.

### CI contract (`test/ci/`)

`test/ci/full-contract.test.js` supplies the safe local CI contract, run through
`test/run-ci-contract.js` (`npm run ci:contract`). It executes the real vendor,
format, lint, type-check, workflow, Node, fixture, and browser commands. It is
deliberately _not_ registered with the Node runner — `test/node/repository-invariants.test.js`
fails if it ever is — because browser checks are not machine-independent.

`npm run ci:contract` does not invoke any checkout-dependent upstream Test262
execution: not focused semantic suites, taxonomy audit/selection/exclusion
work, or the broad pinned subset. Run reviewed focused checks directly when
needed. The generated exact-SHA CI jobs own the taxonomy audit gate and all
broad pinned execution.

`test/ci/exclusions-check.test.js` verifies the stale-exclusion checker against
a real upstream Test262 checkout, including its hard failures for a missing
checkout or a per-file policy path absent from that checkout. It also pins the
scoped legacy strict-harness bridge and the exact reviewed unverifiable records
in `tools/test262/exclusions-unverifiable.json`; diagnostic drift or an unused
approval fails the gate. It does not invoke CI commands, but it lives here
because it cannot pass without `vendor/test262`.

`test/ci/es2015-syntax-test262.test.js` is a reviewable pinned syntax smoke
suite. It runs through the shared Node adapter and runner, not a shell per test,
and covers positive/negative arrows, classes, computed names, parameters,
destructuring, spread, and templates. Its explicitly classified class-field and
Unicode/legacy-escape neighbors prove that those missing dependencies are not
silently feature claims.

`test/ci/es2015-generator-test262.test.js` is the checkout-dependent Layer-2
generator suite. It runs its fixed pinned paths through the same engine bridge,
Node host, and Test262 runner with an explicit generator/Symbol feature set. It
is registered only with `test/run-ci-contract.js`, never the portable or Node
registries.

`test/ci/es2015-module-test262.test.js` is the checkout-dependent Layer-3
static-module suite. `npm run test262:modules` runs its fixed paths under
`TZ=UTC` with an explicit `Symbol.toStringTag` allowlist. It is registered only
with `test/run-ci-contract.js`, never the portable or Node registries, and it
does not broaden `tools/test262/features.json`, the generated upstream
selection, or `docs/test262-report.jsonl`.

Nothing in the full contract is conditional. A missing browser or a missing
upstream checkout fails with the exact command needed to fix it, because a skip
that looks like a pass is how a contract quietly stops being one.

### Test harness (`test/harness/`)

- `test/harness/runner.js` — the shared test runner used by all three host
  runners; defines the `TestCase` and `TestResult` types.
- `test/harness/assert.js` — assertion helpers.
- `test/harness/test262-host.js` — Test262 host adapter shared across runners.

### Runners

| Runner                           | Host            | Arguments                     |
| -------------------------------- | --------------- | ----------------------------- |
| `test/run-node.js`               | Node            | Optional single path argument |
| `test/run-jsc.js`                | `jsc` shell     | None (no argument vector)     |
| `test/run-browser.js`            | Browser page    | `?test=…` query parameters    |
| `test/run-browser-playwright.js` | Playwright/Node | Optional suite paths          |
| `test/run-ci-contract.js`        | Node            | None                          |

`test/run-node.js` accepts at most one path argument for focused runs.

## Test262

### Upstream pin

The upstream revision is pinned in `package.json` under the `test262` key:

- repository: `https://github.com/tc39/test262.git`
- revision: `b363f29d3c43c626dc852744ad64a0b48a003693` (2026-07-31)
- checkout path: `vendor/test262` (generated, gitignored)

### Running the upstream suite

The broad `test262-upstream` execution is exact-SHA CI authority. Do not run
the broad upstream subset locally. Local report maintenance is limited to the
deterministic exact-evidence synchronization below; it does not execute the
broad subset. In CI, the generated job checks out
`b363f29d3c43c626dc852744ad64a0b48a003693`, installs dependencies, verifies
unknown-edition provenance, verifies the ES2015 taxonomy and exact promotion
under `TZ=UTC`, then runs the broad pinned subset. That run byte-checks
`docs/test262-report.jsonl` and the generated coverage block in
`docs/conformance.md`.

### Unknown-edition provenance foundation (U0)

The checked-in unknown-edition ledger is the immutable provenance foundation
for Task `T1` / issue `#75`:

- base ledger: 2,312 roots / 4,054 variants / SHA-256
  `56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc`
- immutable jsjs taxonomy baseline:
  `54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7` (distinct from a moving PR
  merge base)
- U0: tooling foundation only; it makes zero classification decisions
- atomic decision batches: `UA`, `UB`, `UL1`, `UL2`, `UL3`, `UL4`, `US1`,
  `US2`, `US3`, `US4`, `US5`, `US6`, `US7`

| Code  | Roots | Variants | `pathSha256`                                                       | `entryLedgerSha256`                                                |
| ----- | ----: | -------: | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `UA`  |   314 |      323 | `d29150e412486095bac0103f5d7e913917269870a9769cd8343a5cc9638af98e` | `a6664c97c45fd047a4d136b62f2121b630fa742c6e21594111457e367d88cc09` |
| `UB`  |    32 |       64 | `4e21b1884213e2831ffe58fb5c5128f17d417168aeabeac3c3817f8f6350623a` | `99441828b25381a9ce86cbad7bdaaeb612100d2425990f0689f08bf6f7059a1a` |
| `UL1` |   434 |      835 | `1bad4b5aed5f665cfcd270a57c90553b1fe4a1dabb1334fa950527b1113b937a` | `f5044351e9319bacd6d07fdbb4f6eb995f87ab7a2c307893fbd173fcacf9b1f5` |
| `UL2` |   182 |      364 | `b5e8412e46d0bb2d976de247d312269b9ac34fa9cda77d15a2aa11c1eb0abb45` | `2516f31b492778b05737a34c24aead5520ba0804b824c4fb0af54b49fca75640` |
| `UL3` |   109 |      212 | `af158f399b1827dd2012030fbec2fdbbb28f184c011a310550928eb718dca406` | `4b4543298d376734ef7a58ce6eb2a84ed1b0997a588e509ec25a36705378c6e8` |
| `UL4` |    48 |       48 | `9316f73cad2c6608ad14d6e837e5383100bb2ebd0a4feb2ba9f198ee35e5d3ac` | `4ecb3fa2541b0ba3932c61bd5b92d3a137561202036b6009bfbdf2f25a997b58` |
| `US1` |   210 |      406 | `63ff657590ebb5aa167c19975344817789a9a67b820ce0092f990376afa873f7` | `f1ef59740d3a9cbae631e0c65cd7d4aa24bd6619129d76179ca7d32e795b184f` |
| `US2` |   176 |      352 | `3b3db618ae579287c0cbe5a77124c883c3129395bf83fe7523dc1f32e3fe7d15` | `5acbdcb3fdaf4e9fc95a157aac51e20041cc38b47de8717d655eb9b32e5cbfdb` |
| `US3` |    99 |      190 | `42d21ddbd59de80f8c14b1508c3502c8c0bc023061ff24c16160f1bfaec7daa1` | `06922dfb4dc6fa2d2e07e7bcbf8364fcd8fc943921820a15c057b17e55fb8528` |
| `US4` |   176 |      318 | `19bc8b322158aa59af8d0b5efd38cf58885be50fdb6394b56cc94a2b94754c0b` | `e548e96a5d68e6117c454d0117831f81445d0eec93f7b873ea82a6d7673a7d66` |
| `US5` |   306 |      540 | `fdc5ed38ef91366ee6bd9f8aa8d49917b5d9bbc2746cfd62a50f22a22cd03df5` | `87d0388e420d5ffdde58c81705b19daca1d3488e3de4330b1cc8e9ad63bd36f0` |
| `US6` |    48 |       89 | `90dfecd04460d739d4a7242b6ff14c4ef83abcf3e73d7893b392138372ce1cf1` | `c7c524d8b8cd8f0094f631be7d16abcc7f946db86546aaf6339d9cd9853d6a16` |
| `US7` |   178 |      313 | `1e2cda5adef593ae134f0ab0e759091f57522821460c904c7f44c4217c891e28` | `6fa9daa7322394f0f96b754ef6674ccb80b916cd4209c2308f7591eaf46f7e23` |

The foundation is generated by:

```sh
TZ=UTC npm run test262:es2015:provenance
TZ=UTC npm run test262:es2015:provenance:check
TZ=UTC npm run test262:es2015:provenance:ledger -- --render-ledger=UA
```

`test262:es2015:provenance` rewrites
`tools/test262/es2015-provenance.json`, creates missing decision fragments, and
canonicalizes fragments that are already empty. It refuses to overwrite a
non-empty fragment; initialization never resets decisions.
`test262:es2015:provenance:check` is metadata/hash-only: it validates the
manifest, immutable hashes, exact decision-directory membership, and reviewed
fragment bytes, but cannot call `runTest262Suite`. It does not rebuild the
foundation from the current taxonomy, so normal checks, complete-code checks,
and rendering remain valid after reviewed taxonomy reclassification.
`test262:es2015:provenance:ledger` requires a caller-supplied
`--render-ledger=CODE`; it emits the exact code-unit-sorted root list for that
atomic batch, one path per line with a trailing newline.

Each non-empty decision record is reviewed evidence, not free-form notes. The
decision fields that affect provenance are:

- `evidenceKind`, `specification.{source,sourceSha256,clause,anchor}`,
  `metadata.{es5id,es6id,esid,features,includeFeatures,includes,flags}`,
  `history[{repository,commit,note}]`, `rationale`, and `artifactSha256`
- `review.{reviewer,reviewedAt,artifact}` for the independent provenance review
- `destination.{blocker,issue}` only for blocked core destinations

Draft fragments may temporarily use `reviewer: "pending"`,
`reviewedAt: "pending"`, and `artifact: "pending"` while review is in flight,
only through the exact draft command:

```sh
TZ=UTC node tools/test262/es2015-provenance-check.js \
  --check --complete=UA --allow-pending-review
```

`--allow-pending-review` conflicts with every other mode. Strict CI and
`--check --complete=CODE` without that option reject pending review.

Before classification, decision metadata (`es5id`, `es6id`, `esid`, sorted
features/flags/includes, and transitive include features) must exactly match
the pinned inventory. Blocked core destinations must use a manifest-pinned
blocker/roadmap issue pair. Review times are real canonical UTC RFC3339 values.
Reviewed harness/malformed destinations retain structural precedence;
malformed current metadata contributes zero executable variants while the
decision retains its immutable prior variant count.

### Provenance PR range gate

The generated workflow runs the same range CLI used for local final review.
Every provenance PR body contains exactly one authoritative marker; U0 uses:

```text
<!-- es2015-provenance-pr parent:T1 parent-issue:75 profile:foundation base-ledger-sha256:56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc -->
```

Bootstrap and persistent maintenance use:

```text
<!-- es2015-provenance-pr parent:T1 parent-issue:75 profile:foundation-maintenance base-ledger-sha256:56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc -->
```

Decision PRs use `profile:decision:<CODE>`. Every rendered U* issue body also
contains the exact sentence `History, age, path/directory, and source/text
similarity may prioritize review but can never decide edition.` For a live
post-bootstrap maintenance review:

```sh
BASE=$(git rev-parse origin/main)
HEAD=$(git rev-parse HEAD)
MARKER='<!-- es2015-provenance-pr parent:T1 parent-issue:75 profile:foundation-maintenance base-ledger-sha256:56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc -->'
TZ=UTC node tools/test262/es2015-provenance-check.js \
  --check-range --base="$BASE" --head="$HEAD" \
  --profile=foundation-maintenance --marker="$MARKER"
```

The `foundation` profile requires the exact U0 files, empty fragments, and
approved cleanup deletions, and requires a base without the initialized
foundation. `foundation-maintenance` requires a provenance foundation in base;
its first reviewed range bootstraps only from squash
`8d75b48af2ee7ab04e7c5006980417227ec34568` with canonical U0 manifest SHA-256
`ad3e55a061f1156fc267655ac8cb977f6a54f934cc56a5efa5689c7fc620ae04`, and every
later maintenance range is authorized from the trusted base-tree
`foundation-maintenance` profile before head policy is read. Its exact
allowlist is the canonical manifest path set in
`tools/test262/es2015-provenance.json` profile `foundation-maintenance`:
`.github/workflows/ci.yml`, `docs/conformance.md`,
`docs/superpowers/plans/2026-08-19-unknown-edition-provenance.md`,
`docs/superpowers/plans/2026-08-20-provenance-foundation-maintenance.md`,
`docs/superpowers/specs/2026-08-19-unknown-edition-provenance-design.md`,
`docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md`,
`docs/testing.md`, `test/node/es2015-provenance.test.js`,
`test/node/workflow-contract.test.js`, `tools/ci/pipeline.js`,
`tools/test262/es2015-provenance-check.js`,
`tools/test262/es2015-provenance-decisions/UA.json`,
`tools/test262/es2015-provenance-decisions/UB.json`,
`tools/test262/es2015-provenance-decisions/UL1.json`,
`tools/test262/es2015-provenance-decisions/UL2.json`,
`tools/test262/es2015-provenance-decisions/UL3.json`,
`tools/test262/es2015-provenance-decisions/UL4.json`,
`tools/test262/es2015-provenance-decisions/US1.json`,
`tools/test262/es2015-provenance-decisions/US2.json`,
`tools/test262/es2015-provenance-decisions/US3.json`,
`tools/test262/es2015-provenance-decisions/US4.json`,
`tools/test262/es2015-provenance-decisions/US5.json`,
`tools/test262/es2015-provenance-decisions/US6.json`,
`tools/test262/es2015-provenance-decisions/US7.json`,
`tools/test262/es2015-provenance.js`, and
`tools/test262/es2015-provenance.json`. Descriptive category labels do not
authorize any additional path. `decision:<CODE>`
requires the foundation in base and permits only that non-empty source fragment
plus the explicitly listed generated taxonomy, audit-evidence, report, and
conformance outputs. All profiles reject empty ranges, renames/copies,
unapproved deletes, `src/**`, feature/selection changes,
`tools/test262/upstream-subset.json`, foreign fragments/tooling, fake or
duplicate markers, and maintenance head-profile drift. The workflow command
itself is unchanged and includes the `pull_request.edited` activity so changing
or removing the durable marker reruns the gate with actual event base/head/body
values.

Local Test262 work for this provenance foundation is targeted-only. For this
work, do **not** run `TZ=UTC npm run test262:es2015:audit`,
`--write-execution`, `NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream`,
`npm run ci:contract`, browser suites, or JavaScriptCore locally. Commands that
execute broad upstream Test262 run only in exact-head CI.

### H0 roadmap projection bootstrap

Schema-v3 main records H0 as pending with six exact evidence files: paths,
compact baseline, disposition, owner map, owner deltas, and promotion. The
roadmap checker verifies each authority-pinned byte hash before parsing, loads
the bundle once, and cross-validates its repository pin, source selector,
counts, dispositions, owners, deltas, and promoted paths. H0 taxonomy, subset,
report, audit, and conformance validation consumes those normalized facts; it
does not coerce the H0 objects into the older array or T0 promotion schemas.

Every repository file read from HEAD during a protected projection must already
be roadmap evidence, a protected output, or an immutable gate-owned input.
`tools/test262/features.json` is the immutable input and must be byte-identical
between BASE and HEAD. The checker and its complete recursive static import
closure are provenance gate owners, including `metadata.js` and
`module-paths.js`. Gate-owner modules may use only literal static imports:
dynamic `import()`, CommonJS `require`, `createRequire`, computed specifiers,
and URL/data module loading are rejected by repository invariants.

The one-time repair from BASE
`03a4ccadb2b07fa7d3c1ad0f599608b0a7c31efd` changes checker code, focused
tests, and this documentation only. The workflow, pipeline, provenance
manifest and authorities, all 13 decision fragments, all six H0 evidence
artifacts, and every H0/P0 protected output remain byte-identical. The old
active range guard is expected to reject that repair because schema-v3 has no
self-maintenance operation; no other failed check is waivable.

Ordinary unprivileged `pull_request` CI uses this exact one-time HEAD-only
marker so its defense-in-depth range check can continue to the pinned Test262
subset:

```text
<!-- es2015-h0-bootstrap-repair base:03a4ccadb2b07fa7d3c1ad0f599608b0a7c31efd base-manifest-sha256:a2b0b43085376ab65069829252b8a8dae2da538e5e3cf4a0a0e937725ca72974 -->
```

This is not a schema-v3 authority marker and is never accepted through local
`--profile/--marker` mode or on `pull_request_target`. The HEAD checker accepts
it only for the exact nine-file repair range, requires all three production
tooling files, rejects rename/copy/delete or any foreign path, and requires
workflow, pipeline, manifest, all 15 profiles, P0/H0 records, 13 fragments, six
H0 evidence paths, every protected output, and `features.json` to remain
BASE-byte-identical. The detached old BASE checker does not recognize this
marker and must continue to report that the provenance-owned range lacks an
authoritative marker.

### Historical one-use M1 authority repair (#80)

The pending M1 authority was corrected through one exact HEAD-checker range
rooted at `554afc367657439d116d23f4477bb24787a0e261` and merged as
`44c2a747ee544fb85403380f86dc6a0e126faceb`. M1 remained `pending`: the repair
changed no authority evidence file, protected-output byte, runtime file,
workflow, pipeline, policy, feature manifest, or decision fragment. This
exception is now historical and is not a normal authority-consumption marker.

An ordinary unprivileged `pull_request` body may contain this exact LF-only
marker:

```text
<!-- es2015-m1-authority-repair
parent:70
code:M1
issue:80
base:554afc367657439d116d23f4477bb24787a0e261
base-manifest-sha256:abc71cd2ac6284b8a67cf1dbe98b507a9a6f71fda478998aa27520869ff97f19
base-record-sha256:5ee279b8b9c836fbb039caf83a5de0f73b31f427133214e4fd250871bc2345f8
head-manifest-sha256:c12f0cc983141fccfc132dd7d872a29022192d33d72389eac9960c3403b21fbf
head-record-sha256:42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670
-->
```

The checked-out HEAD checker recognizes that block only while
`GITHUB_EVENT_NAME` is exactly `pull_request`. It is not scanned on
`pull_request_target`, and `--profile=m1-authority-repair --marker=...` is not
a local activation mechanism. The validator independently repeats the event
check and pins the event/merge BASE, BASE manifest, BASE checker, BASE M1
record, corrected HEAD manifest, and corrected HEAD M1 record. The corrected
HEAD identities are literal checker constants, not values learned from the
marker or observed HEAD:

```text
manifest c12f0cc983141fccfc132dd7d872a29022192d33d72389eac9960c3403b21fbf
M1 record 42f7193e216332d40b3c852ae3a4d96aa5c24c29533c8cf344ced59b5b207670
```

The complete BASE-to-HEAD range is exactly:

```text
M tools/test262/es2015-provenance-check.js
M tools/test262/es2015-provenance.json
M test/node/es2015-provenance.test.js
M docs/testing.md
A docs/superpowers/specs/2026-08-23-m1-authority-repair-design.md
A docs/superpowers/plans/2026-08-23-m1-authority-repair.md
```

The `2026-08-22` repair document names are foreign paths. Missing, extra,
duplicate, renamed, copied, deleted, aliased, traversed, non-regular, or
wrong-status paths fail. Defense in depth also requires exact BASE/HEAD bytes
and modes for the workflow, pipeline, ES2015 policy, feature manifest, every
decision fragment, and every evidence/protected-output path named by a BASE
authority. A future M1 evidence path absent in BASE must remain absent in HEAD.

The unchanged exact BASE checker is expected to reject this repair with:

```text
A provenance-owned PR range requires one authoritative provenance marker
```

Only that old-trust-root failure may receive an explicit administrator-reviewed
merge exception. No other CI, CodeQL, warning, extraction, or test failure is
waivable.

The repair's local validation was limited to the focused provenance test,
typecheck, scoped lint/format, `npm run ci:check`, exact range checks, and
`git diff --check`. Its marker must not be reused: the corrected authority is
consumed only through the normal `roadmap-reclassification:M1` marker documented
below.

### Deterministic ES2015 taxonomy and exact promotion

The taxonomy is a timestamp-free, code-unit-sorted classification of the
exact pinned `vendor/test262` checkout. Both commands require
`TZ=UTC`, the repository and revision in `package.json`, and a checkout whose
`HEAD` is exactly
`b363f29d3c43c626dc852744ad64a0b48a003693`:

```sh
TZ=UTC npm run test262:es2015:audit
TZ=UTC npm run test262:es2015:audit:check
TZ=UTC npm run test262:es2015:sync-promoted-report
```

`audit` rewrites `tools/test262/es2015-taxonomy.json`; `audit:check` writes
nothing and fails on taxonomy, pin, policy, classification, count, or
promotion-provenance drift. It is metadata/hash-only and cannot call
`runTest262Suite`. `sync-promoted-report` combines the committed
pre-promotion selected records with immutable exact-promotion execution
evidence, verifies the pin, exact selected path set, and every promotion
variant, then rewrites only the report and coverage block. It never executes
the broad subset; exact-SHA CI remains authoritative and byte-checks the
derived artifacts after its broad execution. Invoke the package script as
`npm run test262:es2015:sync-promoted-report` only with `TZ=UTC`, as shown
above. The CI drift gate uses `test262:es2015:provenance:check` and then
`audit:check` after the pinned checkout and `npm ci`, before the broad pinned
execution.

The repository's general promotion policy, outside issue `#75` / U0, limits
local upstream execution to a reviewed exact promotion ledger or a smaller
focused fixture. To record the reviewed exact paths, provide that ledger
explicitly; do not substitute a directory, glob, or broad selection:

```sh
TZ=UTC node tools/test262/es2015-audit.js \
  --paths-file=/absolute/path/to/reviewed-T0.paths.txt \
  --write-execution
```

The durable promotion provenance is
[`tools/test262/es2015-promotion.json`](../tools/test262/es2015-promotion.json):
6,323 code-unit-sorted roots, 11,955 variants, and ledger SHA-256
`3f2c617b8639c8048afb1a42b95218250b20b6d51b9313f39473b4ddc1c7c646`.
The command accepts only that exact reviewed ledger for the pinned checkout;
it is not permission to run the broad upstream subset locally. The stricter
issue `#75` / U0 policy above prohibits this `--write-execution` command
entirely for the unknown-edition provenance work.

### Exact H0 cross-Realm host reconciliation (#76)

Issue #76 preserved original issue base
`54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7` separately from final PR base
`99c439f2efd287479f40d8d0e6ac2dd9aab81e10`. The tracked compact final-base
identity,
[`tools/test262/es2015-h0-baseline.json`](../tools/test262/es2015-h0-baseline.json),
has SHA-256
`01c9f90704fe9ea6d892c4e758817fbe9bc30368486a58f12b47068e6b2080ec`.
It records the final-base taxonomy SHA-256
`e7746b6da6038c1fda83e1e6cbecbe9fb3e7b97bdf89a311c0a3f34a686c7953`,
the immutable H0 135-root / 267-variant ledger SHA-256
`3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950`,
and canonical final-base H0, non-H0, and balanced partition/status identities.

Run only the focused corpus when refreshing this evidence:

```sh
TZ=UTC npm run test262:cross-realm
```

`npm run test262:cross-realm` must run with `TZ=UTC`; it never invokes the
broad upstream subset.

The generated final disposition has 40 complete-root passes / 78 variants and
95 reviewed reassignments / 189 variants (94 all-fail roots / 187 variants and
one mixed root / two variants); its pass-plus-reassigned union is exactly the
immutable 135-root / 267-variant ledger. The pass-only promotion has 40 roots,
78 variants, and ledger SHA-256
`17d850eaf79e80f0260f8332a2bc594d3492bb286084c51e87f06cd6ec8853a7`.
After generation, the core `test262-cross-realm-host` selector is zero roots
and zero variants.

`TZ=UTC npm run test262:es2015:audit:check` loads that committed identity
automatically; it never needs a session-local `git show` snapshot. It proves
the selector-zero H0 disposition delta, canonical non-H0 preservation, H0
selector and denominator identities, and generated owner deltas. An explicit
`--baseline-taxonomy=<final-base-taxonomy.json>` remains available for
generation or review, but its full snapshot must match the committed compact
identity before use.

The reviewed artifact SHA-256 identities are owner map
`d50f58ed621eac896fceb325f54480d33c9680c0f6b264a6cbce5812c7f4f44b`,
disposition
`a48db4417e1ad41298e0d24bb6e1ef1925d6a812ab59a1541ce14ec2a06df857`,
owner deltas
`ddb0001ef1ba607e785ba63560305144b8cd39c95c76b85c2375c38562b1618b`,
and promotion
`a5ad87badd75c547f4f4e2fb0b5d0536b4969ea3bf97676333f970434e5cfa2c`.
The compact identity's canonical H0 classification SHA-256 is
`7d77ab62f96de66b8533628cee09fe49f3d39342e6109f5420a7969141472634`,
its non-H0 classification SHA-256 is
`e600971b3b8efa7bb5a02f9bd782364f9873c29b6dcd03f58eda7c52b27f624d`,
and its partition/status summary SHA-256 is
`0b05f6513c4fe8754d24fd6e53897905bbf97b6469bb20c5a89361035bf3f21d`.
This is Test262-harness-only host support: `$262` remains absent from public
runtime APIs and normal Realm globals. B0 owns detachment; #76 removes the
host blocker without claiming that all 135 roots semantically pass.

### Exact M0 object-internal-method evidence (#79)

The M0 ledger is
[`tools/test262/es2015-m0-paths.txt`](../tools/test262/es2015-m0-paths.txt):
240 code-unit-sorted, newline-terminated Test262 roots, 459 executable variants,
and SHA-256
`4ef97681d7e5208a3ec04e2f4281908877f5f61dd42ee20c0f282ac4dc205309`.
`npm run test262:es2015:m0` is the bounded entry point. Run it only under UTC
and write the result below an ignored repository path:

```sh
TZ=UTC npm run test262:es2015:m0 -- \
  --ledger=tools/test262/es2015-m0-paths.txt \
  --output=.superpowers/issue-79/m0-execution.json
```

The entry point verifies the package pin, clean checkout, exact immutable
baseline records in `tools/test262/es2015-m0-baseline.json`, the applied
taxonomy against `tools/test262/es2015-m0-disposition.json`, ledger
hash/counts, and per-root variant coverage before writing. This keeps the exact
240-root execution reproducible after the M0 authority projects its reviewed
ownership changes into the taxonomy. It calls the shared focused runner
directly and cannot reach `test262:upstream`, `test262:upstream:check`,
`test262:es2015-release`, or an unbounded selector. Do not run the broad
upstream suite or regenerate the unchanged subset, report, or conformance
outputs while collecting M0 evidence.

Destinations owned by issues #80 and #81 retain the existing
`proxy-and-reflect-metaobject` blocker. The issue number distinguishes the
Reflect and Proxy follow-up ownership; no issue-specific blocker names are
introduced.

### Exact M1 Reflect evidence (#80)

The immutable M1 ledger is
[`tools/test262/es2015-m1-paths.txt`](../tools/test262/es2015-m1-paths.txt):
113 code-unit-sorted, newline-terminated Reflect roots, 226 executable variants,
and SHA-256
`65529ed8f9bdf88576314e95f4f164ac2c613e9ec44f0aae042a79aa5f8706b4`.
Run only the bounded UTC entry point with that exact ledger and an ignored
repository-relative output:

```sh
TZ=UTC npm run test262:es2015:m1 -- \
  --ledger=tools/test262/es2015-m1-paths.txt \
  --output=.superpowers/issue-80/m1/execution.json
```

The reviewed result is 103 complete-pass roots / 206 variants and ten
Proxy-dependent residual roots / 20 variants. Twelve promoted
`not-a-constructor.js` roots have the exact transitive include closure
`["Reflect.construct"]`; the other 91 promoted roots have an empty closure.
The promotion SHA-256 is
`31f807a05d56d35762cd5457f779624df04f11ef482b3d1bcb60be3a06883c69`.

Preparation produced six canonical evidence files: paths, baseline,
disposition, owner deltas, owner map, and promotion. The normal consumer adds
those six exact files, replaces the audit evidence and ES5 selection exactly,
and projects the generated conformance block, selected report, taxonomy, and
upstream subset. Those are the authority's 12 protected outputs: six
`add-exact`, two `replace-exact`, and four `project`. The corrected taxonomy
SHA-256 is
`fba700539b05edd67b6cf67e4c0a1361398a2d0f04212bc7080a83f44abf577a`;
the corrected selection SHA-256 is
`78ac694beb258be0b67c7788137c736b0b30cf7457e3a903d364d38c038b48df`;
and the aggregate protected projection is
`22bf654462044eb3febfbcec43e1c56a20cd89392c763e8d141fd6f3274289ed`.

The selection projection removes exactly these seven obsolete exclusions:

1. `vendor/test262/test/built-ins/Object/internals/DefineOwnProperty/consistent-value-function-arguments.js`
2. `vendor/test262/test/built-ins/Object/internals/DefineOwnProperty/consistent-value-function-caller.js`
3. `vendor/test262/test/built-ins/Object/internals/DefineOwnProperty/consistent-value-regexp-dollar1.js`
4. `vendor/test262/test/built-ins/Object/internals/DefineOwnProperty/consistent-writable-regexp-dollar1.js`
5. `vendor/test262/test/staging/sm/Array/unshift-with-enumeration.js`
6. `vendor/test262/test/staging/sm/object/bug-1206700.js`
7. `vendor/test262/test/staging/sm/strict/primitive-assignment.js`

The promoted M1 group adds its 103 Reflect roots as the new
`es2015/m1-reflect` group, growing the selected union from 20,492 to 20,595
unique paths across 61 groups, with SHA-256
`9f768aa8fb0c473e98fe2156d290c4207cea797302cccad6f9b1b922a36b37c0`.
Applied-authority audit reconstruction validates and reverses M1 before M0 so
the historical H0 proof still sees the exact pre-roadmap classifications.

Consumption changes only M1 from `pending` to `applied` and uses this normal
LF-only marker; it never reuses the historical repair exception:

```text
<!-- es2015-roadmap-authority-consume
parent:70
code:M1
issue:80
profile:roadmap-reclassification:M1
base:44c2a747ee544fb85403380f86dc6a0e126faceb
source-path-sha256:65529ed8f9bdf88576314e95f4f164ac2c613e9ec44f0aae042a79aa5f8706b4
source-entry-sha256:null
protected-projection-sha256:22bf654462044eb3febfbcec43e1c56a20cd89392c763e8d141fd6f3274289ed
-->
```

Local M1 validation must stay focused. Do not run `npm test`, full or broad
Test262, `npm run test262:upstream`, `npm run test262:upstream:check`,
`npm run test262:es2015-release`, `npm run ci:contract`, or full
Node/browser/JSC suites. Exact-head CI owns configured broad execution.

### Exact P1C catch-binding evidence (#116)

The immutable P1C ledger is
[`tools/test262/es2015-p1c-paths.txt`](../tools/test262/es2015-p1c-paths.txt):
81 code-unit-sorted, newline-terminated catch-binding roots, 161 executable
variants, and SHA-256
`e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5`.
The pinned inventory has one explicit `compareArray.js` include, a complete
transitive include-feature closure with zero added features for every root, and
zero intersections with the ES5 exclusion policy.

Run only the bounded UTC entry point with that exact ledger:

```sh
TZ=UTC npm run test262:es2015:p1c -- \
  --ledger=tools/test262/es2015-p1c-paths.txt \
  --output=.superpowers/sdd/2026-08-23-p1c-catch-binding/execution.json
```

The reviewed result is 81 complete-pass roots / 161 variants with zero failed,
skipped, or residual variants. Before authority preparation, `--build-scratch`
is the only permitted evidence-generation mode: it writes the six canonical
paths, baseline, disposition, owner-delta, owner-map, and promotion files under
an ignored `.superpowers/` directory. The owner files are empty arrays, and the
named schema-v2 `es2015/p1c-catch-binding` promotion contains all 81 roots and
161 variants. Scratch output is review input only; it must not overwrite
tracked authority-owned files.

The consumer adds those six files exactly, replaces the audit evidence, and
projects only the taxonomy, upstream subset, selected report, and generated
conformance block. `tools/test262/es5-selection.json` and its exclusions remain
byte-identical to the live authority base. The P1C authority changes only from
`pending` to `applied`. After that transition, the focused runner validates the
tracked baseline and disposition hashes against the applied authority and
reconstructs the pre-promotion source classifications before re-executing the
ledger.

At the reviewed live base, the selected subset grows from 61 groups / 20,595
paths / 39,139 variants to 62 groups / 20,676 paths / 39,300 variants.
Generated non-T0 paths grow from 14,272 to 14,353. These are derived deltas of
exactly +1 group, +81 roots, and +161 variants; a different authority base
requires rebuilding the execution, scratch evidence, pending authority,
projection hashes, and integration literals rather than forcing these example
totals.

Local P1C validation is limited to the named parser, catch-binding, try,
destructuring, eval, generator-control-flow, P1C, selection, taxonomy, M1,
provenance, repository-invariant, focused syntax, and browser suites listed by
the delivery plan, plus the exact P1C runner, typecheck, `ci:check`, and
`git diff --check`. Do not run `npm test`, broad/full Test262, broad selection
or exclusion execution, `test262:es2015-release`, `ci:contract`, or full
Node/browser/JSC registries locally; exact-head CI owns those gates.

### Focused ES2015 syntax suite

During syntax work, run the small pinned suite instead of the complete generated
upstream selection:

```sh
TZ=UTC node test/run-node.js test/ci/es2015-syntax-test262.test.js
```

`tools/test262/features.json` supplies semantic probes for the exact supported
syntax tags: `arrow-function`, `class`, `computed-property-names`,
`default-parameters`, `destructuring-assignment`, `destructuring-binding`,
`rest-parameters`, `spread-syntax`, and `template`. The manifest's
`spread-syntax` and `template` backing tests are documented metadata exceptions:
the pinned tree has no standalone spread tag, and its only template-tagged test
also uses `new.target`.

### Focused ES2015 Promise Test262 suite

Agent Jobs and Promise work uses a separate small pinned suite. It covers the
ES2015 Promise constructor, `then` reaction identity and throwing handlers,
thenable adoption, abrupt final `all` capability resolution, `resolve`, `all`,
`race`, `Symbol.species`, and `Promise.prototype[Symbol.toStringTag]`:

```sh
TZ=UTC node test/run-node.js test/ci/es2015-promise-test262.test.js
```

The focused suite requires the exact upstream revision in `vendor/test262` and
does not rewrite coverage artifacts. For this Layer-1 focused check, do not run
the broad upstream Test262 suite locally or regenerate its report; exact-SHA CI
owns that coverage and its generated artifacts.

### Focused ES2015 generator Test262 suite

The synchronous generator layer has its own fixed-path checkout-dependent
suite:

```sh
TZ=UTC node test/run-node.js test/ci/es2015-generator-test262.test.js
```

It covers `%GeneratorFunction%` call/construction, generator intrinsic
descriptors, the exact resume states, `next`/`return`/`throw` through
catch/finally, consecutive yields, and computed object/class generator methods.
It requires the pinned checkout and passes only the local feature set
`generators`, `Symbol.iterator`, and `Symbol.toStringTag`, requiring zero failed
and zero skipped records.

This Layer-2 command does not add `generators` to
`tools/test262/features.json`, regenerate the broad selection/report/conformance
block, or make a broad conformance claim. Run it directly as shown; broad
artifact regeneration remains release work owned by exact-SHA CI.

### Focused ES2015 static-module Test262 suite

The static-module layer has its own fixed-path checkout-dependent suite:

```sh
TZ=UTC npm run test262:modules
```

It covers imports and exports, namespace `Symbol.toStringTag`, instantiation
errors, cycles, strict `this`, and live export bindings at the exact pinned
revision. It passes only `Symbol.toStringTag` as a local supported-feature set:
Test262 module tests are represented by the `module` flag, so this suite does
not add a bare module feature probe. It neither broadens the global feature
manifest or generated selection nor rewrites
`docs/test262-report.jsonl` or the generated conformance block.

### Fixture vs. upstream suites

The local fixture tree (`test/fixtures/test262`) is run by
`npm run test262:fixtures`. The two suites answer different questions: the
fixtures exercise the _runner_ (metadata parsing, variants, negative
expectations, skip decisions) against a tiny hand-written tree, and the upstream
subset exercises the _engine_ against real Test262 tests.

### Node CLI

```sh
node tools/test262/adapters/node.js \
  --root=test/fixtures/test262 \
  --features=fixture-subset \
  --skip-features=Proxy \
  --include-malformed \
  test/positive.js
```

- `--root` — a Test262-shaped tree (`harness/` plus test files)
- `--harness` — renames the harness directory inside it
- `--features` — allowlist of Test262 feature names
- `--skip-features` — excludes features explicitly
- `--include-malformed` — adds deliberately broken fixtures
- Trailing arguments — select individual files instead of the manifest

When `--features` is omitted, the CLI reads `tools/test262/features.json` as the
allowlist. Passing `--features` (even empty) always overrides the manifest.

### JSC entry point

The JSC entry point (`tools/test262/adapters/jsc-run.js`) takes no arguments
(the shell has no argument vector). It reads optional `jsjsTest262Root` and
`jsjsTest262Features` globals and otherwise falls back to the checked-in
fixtures.

### Runner internals (`tools/test262/`)

| Module         | Responsibility                                                                                |
| -------------- | --------------------------------------------------------------------------------------------- |
| `metadata.js`  | Parses Test262 frontmatter (`description`, `flags`, `includes`, `features`, `negative`, etc.) |
| `selection.js` | Decides which tests run: manifest, precedence, code-unit ordering                             |
| `runner.js`    | Executes a variant in a fresh realm, classifies results                                       |
| `report.js`    | Renders records as deterministic JSON lines                                                   |
| `coverage.js`  | Inventories a tree's frontmatter and measures a run against it                                |
| `features.js`  | Parses and validates `features.json`; `runFeatureProbe` executes probes                       |

Adapters are thin — they supply file access, CLI parsing, and printing:

| Adapter               | Host    | File access                                         |
| --------------------- | ------- | --------------------------------------------------- |
| `adapters/node.js`    | Node    | Disk (`fs`)                                         |
| `adapters/browser.js` | Browser | HTTP `fetch`                                        |
| `adapters/jsc.js`     | `jsc`   | Shell's `readFile`                                  |
| `adapters/paths.js`   | All     | Module-relative paths (no `URL`, which `jsc` lacks) |

### Generated artifacts

- `docs/test262-report.jsonl` — full per-test records from the UTC upstream run
- `tools/test262/es2015-provenance.json` — immutable unknown-edition base
  ledger plus the 13 batch ledgers (generated by
  `TZ=UTC npm run test262:es2015:provenance`)
- `tools/test262/es2015-provenance-decisions/*.json` — the 13 reviewed decision
  fragments owned by the provenance foundation generator and strict checker
- `tools/test262/upstream-subset.json` — the checked-in selection (generated by
  `TZ=UTC npm run test262:select`)
- The `<!-- test262-coverage:begin/end -->` block in `docs/conformance.md` — rewritten by
  `NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream`

## CI jobs

`.github/workflows/ci.yml` is generated from `tools/ci/pipeline.js`.
`npm run ci:generate` rewrites the committed file; `npm run ci:check` fails
(without writing) if the two have drifted.

Every push and pull request against `main` runs twelve ordinary jobs:

| Job                      | What it runs                                                                                           | Depends on |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ---------- |
| `ci-drift`               | `npm run ci:check`                                                                                     | —          |
| `vendor`                 | `npm run vendor:check`                                                                                 | —          |
| `format`                 | `npm run format` (Prettier `--check`)                                                                  | —          |
| `lint`                   | `npm run lint` (ESLint only)                                                                           | —          |
| `typecheck`              | `npm run typecheck` (`tsc` in checkJs mode)                                                            | —          |
| `test-node`              | `npm run test:node`                                                                                    | `vendor`   |
| `test-browser`           | `npm run test:browser` (Playwright headless Chromium)                                                  | `vendor`   |
| `test-jsc`               | `npm run test:jsc` (JavaScriptCoreGTK shell)                                                           | `vendor`   |
| `test262-fixtures`       | `npm run test262:fixtures` (local fixture tree)                                                        | `vendor`   |
| `test262-es2015-release` | `npm run test262:es2015-release` (focused pinned Promise+generator+module+object/function+syntax gate) | `vendor`   |
| `benchmark-smoke`        | `npm run benchmark:smoke` (correctness-only smoke run)                                                 | `vendor`   |
| `test262-upstream`       | `NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream`                               | `vendor`   |

Each of these twelve ordinary jobs runs on `ubuntu-latest` with Node 20 (via
`actions/setup-node` with the built-in npm cache) and `npm ci`.
Only the broad `test262-upstream` execution step receives the 4096 MiB Node heap
allowance; focused Test262 jobs remain unchanged.
The project checkout in `test-node` and `test262-es2015-release` uses
`fetch-depth: 0` because `test/run-node.js` imports the Node-only provenance
suite, whose module initialization reads exact historical project artifacts at
pinned commits; other ordinary project checkouts keep their existing depth.
Inside `test262-upstream`, the generated workflow runs
the PR-only exact range gate, then
`TZ=UTC npm run test262:es2015:provenance:check` immediately before
`TZ=UTC npm run test262:es2015:audit:check`, then performs the selection drift
check and only then runs the broad subset.

`benchmark-smoke` does not upload timing artifacts and does not enforce
thresholds, baselines, or regression decisions; those semantics are intentionally
out of CI scope. See [`docs/benchmarking.md`](benchmarking.md).

Each of the twelve ordinary jobs above is inactive-but-reporting on the
`pull_request_target` event described next: its `if:` condition is
`github.event_name != 'pull_request_target'`, and its display name switches to
a distinct `<Job name> (inactive on pull_request_target)` string so a skipped
run can never satisfy a required-check name that a real run also uses.

### The trusted provenance base guard (13th job)

A thirteenth job, `provenance-base-guard`, is unconditional so GitHub always
evaluates its event-keyed name expression. On the `pull_request_target` event
(`opened`, `synchronize`, `reopened`, `edited`; no path/branch filters) it
reports the exact required check-run name `Provenance base guard` and runs
every guard step. On `push` and `pull_request` it reports the distinct
informational name `Provenance base guard (inactive)` and runs only one no-op
inactive step. GitHub does not evaluate expression-valued job names when a
job-level `if` skips the job, so this unconditional job plus mutually
exclusive step conditions is what preserves the exact active required context
and the distinct inactive context.

Unlike the twelve ordinary jobs, this job does not run `npm ci` or install any
dependency, does not use the npm cache, and never checks out the pull
request's head. It differs from the ordinary jobs in every one of these ways:

- it runs on `ubuntu-24.04`, not `ubuntu-latest`;
- it has a 5-minute timeout and an event-qualified
  `provenance-base-guard-<event>-<PR number>` concurrency group with
  `cancel-in-progress: true`, so `pull_request` and `pull_request_target` do
  not cancel each other while repeated runs of the same event/PR still do;
- its permissions are exactly `contents: read` and `pull-requests: read`
  (still no write access);
- because `pull_request_target` loads the workflow and default checkout from
  the base repository's default branch, the job explicitly checks out
  `github.event.pull_request.base.sha`, asserts the checked-out `HEAD` equals
  that SHA, sets up Node 20 with no cache and no install, fetches the live
  `refs/heads/main` target branch into
  `refs/remotes/origin/provenance-target-main`, asserts both that ref and the
  checked-out `HEAD` still equal `github.event.pull_request.base.sha`, fetches
  only the base repository's advertised `refs/pull/<number>/head` as inert
  objects (never the head repository, never a raw head-SHA fetch), asserts
  both the fetched ref and `FETCH_HEAD` equal
  `github.event.pull_request.head.sha`, and only then runs the checked-out
  base's
  `tools/test262/es2015-provenance-check.js` with the event base/head SHAs and
  the full PR body passed through `PR_BODY`, under fixed `TZ=UTC`. If `main`
  moved after the event or the checkout no longer matches the event base, the
  guard fails and must be rerun against the new event BASE.

The ordinary, PR-only `test262-upstream` provenance-range step is unaffected by
this job: it is retained verbatim as defense-in-depth, and this guard does not
replace it.

### Security properties

Three properties are asserted by `test/node/workflow-contract.test.js`:

- The workflow grants `permissions: contents: read` at the top level and no
  ordinary job widens it; the guard job's explicit, read-only
  `contents: read`/`pull-requests: read` permissions are asserted separately.
- Every `uses:` names a full 40-character commit SHA; release versions follow in
  trailing comments. Every checkout step passes `persist-credentials: false`.
- The guard job never checks out, fetches raw, or executes the pull request
  head; fetched head objects stay inert, and no event-derived value is used as
  a remote URL or interpolated into a `run:` command.

### JSC in CI

`test-jsc` is required. On Ubuntu Noble it runs this deterministic install
command:

```sh
sudo apt-get update && sudo apt-get install --yes libjavascriptcoregtk-bin
```

That package provides `/usr/bin/jsc` directly; CI verifies that executable
before running `npm run test:jsc`. The byte-identical-output guarantee between
Node, Chromium, and `jsc` is enforced by `test/test262-runner.test.js`, which
runs under all three runners.

## Troubleshooting

### `vendor/test262 is not a git checkout`

This error from `tools/test262/upstream-run.js` means the upstream Test262
checkout is missing. The taxonomy metadata commands
(`npm run test262:es2015:audit`, `npm run test262:es2015:audit:check`), focused
release commands, and upstream commands (`npm run test262:upstream`,
`npm run test262:upstream:check`, `npm run test262:select`,
`npm run test262:select:check`, and `npm run test262:exclusions:check`) require
it. The provenance initialize/check commands use only committed repository
artifacts and do not require the checkout. Fix missing checkout commands with:

```sh
git clone --filter=blob:none https://github.com/tc39/test262.git vendor/test262
git -C vendor/test262 checkout b363f29d3c43c626dc852744ad64a0b48a003693
```

The revision must match the `test262.revision` field in `package.json`. A
checkout at the wrong revision produces:

```
vendor/test262 is at <actual-sha>, but package.json pins <expected-sha>.
```

### Wrong revision

If `vendor/test262` exists but is at the wrong commit:

```sh
git -C vendor/test262 checkout b363f29d3c43c626dc852744ad64a0b48a003693
```

### Missing Playwright browser

`npm run test:browser` fails if the headless Chromium shell is not installed:

```sh
npx playwright install --with-deps --only-shell chromium
```
