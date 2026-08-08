# Testing

## Setup

Install dependencies and populate the vendored directory:

```sh
npm install
```

`npm install` runs `tools/vendor/sync.js` through the `prepare` script, which
writes `vendor/acorn/` from the version pinned in `package.json`. The vendor
directory is generated and gitignored.

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

| Command                             | What it does                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                          | The Node suites, then the Test262 fixture suite through the CLI                                                                                          |
| `npm run test:node`                 | Every portable suite plus the Node-only suites in `test/node/`                                                                                           |
| `npm run test:browser`              | Every portable suite in the headless Chromium shell via Playwright                                                                                       |
| `npm run test:jsc`                  | Every portable suite in the `jsc` shell                                                                                                                  |
| `npm run test262:fixtures`          | Test262 runner over `test/fixtures/test262`, forcing the `fixture-subset` feature (JSON lines on stdout)                                                 |
| `npm run test262:fixtures:manifest` | The same fixture tree with the feature allowlist defaulted from `tools/test262/features.json`                                                            |
| `npm run test262:upstream`          | The pinned upstream subset from a real `tc39/test262` checkout (regenerates `docs/test262-report.jsonl` and the coverage block in `docs/conformance.md`) |
| `npm run test262:upstream:check`    | The same run, writing nothing: fails if either generated artifact is stale                                                                               |
| `npm run test262:select`            | Derive the upstream subset from the ES5 selection policy and rewrite `tools/test262/upstream-subset.json`                                                |
| `npm run test262:select:check`      | The same derivation, writing nothing: fails if the committed subset is stale                                                                             |
| `npm run test262:exclusions:check`  | Runs every per-file exclusion; fails on stale exclusions, missing policy paths, or a missing/wrong pinned checkout                                       |
| `npm run test262:jsc`               | The fixture suite under the `jsc` shell                                                                                                                  |
| `npm run benchmark`                 | Run the cross-runtime benchmark CLI across Node, Chromium, and `jsc`, writing validated host reports to `.benchmark-results/`                            |
| `npm run benchmark:node`            | Run only the Node host benchmark and write `node.json` under the default ignored benchmark output directory                                              |
| `npm run benchmark:browser`         | Run only the Chromium host benchmark and write `chromium.json` under the default ignored benchmark output directory                                      |
| `npm run benchmark:jsc`             | Run only the `jsc` host benchmark and write `jsc.json` under the default ignored benchmark output directory                                              |
| `npm run benchmark:smoke`           | Run the smoke profile under Node and write a seven-workload validated report to `.benchmark-results/smoke/node.json`                                     |
| `npm run ci:contract`               | The full local CI contract: every command CI runs, for real                                                                                              |
| `npm run typecheck`                 | `tsc` in checkJs mode over the repository's `jsconfig.json`                                                                                              |
| `npm run format`                    | Prettier `--check` over the entire repository                                                                                                            |
| `npm run lint`                      | ESLint (flat config) over the repository                                                                                                                 |
| `npm run vendor:sync`               | Refresh `vendor/` from the dependency versions pinned in `package.json`                                                                                  |
| `npm run vendor:check`              | Verify `vendor/` matches the pinned versions (fails if stale)                                                                                            |
| `npm run unicode:generate`          | Regenerate `src/builtins/unicode-case-data.js` from the Unicode Character Database                                                                       |
| `npm run unicode:check`             | Verify `src/builtins/unicode-case-data.js` is up to date (fails if stale)                                                                                |
| `npm run ci:generate`               | Regenerate `.github/workflows/ci.yml` from `tools/ci/pipeline.js`                                                                                        |
| `npm run ci:check`                  | Verify the committed CI workflow matches the pipeline definition (fails if stale)                                                                        |
| `npm run prepare`                   | Runs automatically on `npm install`; equivalent to `vendor:sync`                                                                                         |

## Suite organization

### Portable suites (`test/suites.js`)

`test/suites.js` is the one registry of portable suites. All three runners
(`test/run-node.js`, `test/run-browser.js`, `test/run-jsc.js`) take their
default work from it. `test/node/repository-invariants.test.js` fails if a suite
file exists that no runner registers.

The registry currently lists 46 portable suites covering: foundation, parser,
runtime records, objects, abstract operations, environments, realms, evaluator
expressions and statements, `with` statements, functions, object/array literals,
Test262 runner, ES5 selection, errors, try statements, switch/labels,
update/assignment, `in`/`instanceof`, strict mode, `eval`, dynamic `Function`,
`delete`, date arithmetic, date built-ins, native built-ins, object built-ins,
function built-ins, array built-ins, primitive wrappers, boolean/number/string
built-ins, number formatting, string built-ins, string search/case/pattern,
regexp syntax/built-ins/exec, string-regexp, math built-ins, numeric globals,
URI globals, JSON parse, and JSON stringify.

### Node-only suites (`test/node/`)

Two suites that need a filesystem and cannot run in the browser or `jsc`:

- `test/node/repository-invariants.test.js` — architecture checks: vendor
  invariants, parser dependency isolation, suite registration, Markdown link
  contracts, documentation command validity, reference doc existence.
- `test/node/workflow-contract.test.js` — parses the committed CI YAML with a
  real YAML parser and checks it against an expectation table (job commands,
  permissions, action pins, upstream revision). Also parses both Test262
  manifests and executes every declared feature probe.

### CI contract (`test/ci/`)

`test/ci/full-contract.test.js` is the full local CI contract. It runs through
`test/run-ci-contract.js` (`npm run ci:contract`), executing every command CI
runs as real subprocesses. It is deliberately _not_ registered with the Node
runner — `test/node/repository-invariants.test.js` fails if it ever is — because
running the whole pipeline inside one of its own jobs would be recursive and
would depend on a browser install and an upstream checkout.

`test/ci/exclusions-check.test.js` verifies the stale-exclusion checker against
a real upstream Test262 checkout, including its hard failures for a missing
checkout or a per-file policy path absent from that checkout. It does not invoke
CI commands, but it lives here because it cannot pass without `vendor/test262`.

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

`npm run test262:upstream` runs the pinned subset against a real `tc39/test262`
checkout. It refuses to run unless the tree's `HEAD` is exactly the pinned
revision. Reproduce a CI run locally:

```sh
git clone --filter=blob:none https://github.com/tc39/test262.git vendor/test262
git -C vendor/test262 checkout b363f29d3c43c626dc852744ad64a0b48a003693
npm run test262:upstream
```

The report goes to `docs/test262-report.jsonl`, and a compact coverage summary
goes to stdout.

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

- `docs/test262-report.jsonl` — full per-test records from the upstream run
- `tools/test262/upstream-subset.json` — the checked-in selection (generated by
  `npm run test262:select`)
- The `<!-- test262-coverage:begin/end -->` block in `docs/conformance.md` — rewritten by
  `npm run test262:upstream`

## CI jobs

`.github/workflows/ci.yml` is generated from `tools/ci/pipeline.js`.
`npm run ci:generate` rewrites the committed file; `npm run ci:check` fails
(without writing) if the two have drifted.

Every push and pull request against `main` runs nine jobs:

| Job                | What it runs                                          | Depends on |
| ------------------ | ----------------------------------------------------- | ---------- |
| `ci-drift`         | `npm run ci:check`                                    | —          |
| `vendor`           | `npm run vendor:check`                                | —          |
| `format`           | `npm run format` (Prettier `--check`)                 | —          |
| `lint`             | `npm run lint` (ESLint only)                          | —          |
| `typecheck`        | `npm run typecheck` (`tsc` in checkJs mode)           | —          |
| `test-node`        | `npm run test:node`                                   | `vendor`   |
| `test-browser`     | `npm run test:browser` (Playwright headless Chromium) | `vendor`   |
| `test262-fixtures` | `npm run test262:fixtures` (local fixture tree)       | `vendor`   |
| `test262-upstream` | `npm run test262:upstream` (pinned upstream subset)   | `vendor`   |

Each job runs on `ubuntu-latest` with Node 20 (via `actions/setup-node` with the
built-in npm cache) and `npm ci`.

### Security properties

Two properties are asserted by `test/node/workflow-contract.test.js`:

- The workflow grants `permissions: contents: read` at the top level and no job
  widens it.
- Every `uses:` names a full 40-character commit SHA; release versions follow in
  trailing comments. Both checkout steps pass `persist-credentials: false`.

### JSC in CI

JSC is a local/conditional adapter, not a CI job. GitHub's hosted runners do not
ship a standalone `jsc` binary on `PATH`. The byte-identical-output guarantee
between Node, Chromium, and `jsc` is enforced by `test/test262-runner.test.js`,
which runs under all three runners.

## Troubleshooting

### `vendor/test262 is not a git checkout`

This error from `tools/test262/upstream-run.js` means the upstream Test262
checkout is missing. The upstream commands (`npm run test262:upstream`,
`npm run test262:upstream:check`, `npm run test262:select`,
`npm run test262:select:check`, and `npm run test262:exclusions:check`) require
it. Fix it with:

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
