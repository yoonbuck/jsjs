# jsjs

An ECMAScript engine written in javascript.

The engine is plain ES2020 JavaScript with JSDoc types. The same source runs in
Node, in a browser, and in the JavaScriptCore (`jsc`) shell: nothing in `src/`
imports a host module, and guest behaviour never leans on host `eval`,
`Function`, or host objects.

The one runtime dependency, the Acorn parser, is reached through
`src/parser-dependency.js`, the single engine module that names it. It imports
`vendor/acorn/`, a project-owned directory that `tools/vendor/sync.js` fills from
the version pinned in `package.json`. That indirection is what keeps a plain
relative import working in all three hosts: bare specifiers need Node
resolution, browsers would need an import map, and the `jsc` shell supports
neither. `vendor/` is generated rather than committed; `npm install` populates it
through `prepare`.

## Commands

| Command                             | What it does                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                          | The Node suites, then the Test262 fixture suite through the CLI                                                              |
| `npm run test:node`                 | Every portable suite plus the Node-only suites in `test/node/`                                                               |
| `npm run test:browser`              | Every portable suite in the headless Chromium shell via Playwright                                                           |
| `npm run test:jsc`                  | Every portable suite in the `jsc` shell                                                                                      |
| `npm run test262:fixtures`          | Test262 runner over `test/fixtures/test262`, forcing the fixture-only `fixture-subset` feature (JSON lines on stdout)        |
| `npm run test262:fixtures:manifest` | The same fixture tree with the feature allowlist defaulted from `tools/test262/features.json`                                |
| `npm run test262:upstream`          | The pinned upstream subset from a real `tc39/test262` checkout (JSON lines on stdout and in `test262-upstream-report.jsonl`) |
| `npm run test262:jsc`               | The fixture suite under the `jsc` shell                                                                                      |
| `npm run vendor:sync`               | Refresh `vendor/` from the pinned dependencies                                                                               |
| `npm run vendor:check`              | Fail if `vendor/` has drifted from the pinned dependencies                                                                   |
| `npm run typecheck`                 | `tsc` in checkJs mode                                                                                                        |
| `npm run format`                    | Prettier `--check` over every tracked source file                                                                            |
| `npm run lint`                      | ESLint only                                                                                                                  |
| `npm run ci:generate`               | Regenerate `.github/workflows/ci.yml` from `tools/ci/pipeline.js`                                                            |
| `npm run ci:check`                  | Fail if the committed workflow has drifted from `tools/ci/pipeline.js`                                                       |
| `npm run ci:contract`               | The full local CI contract: every command CI runs, for real (see [Continuous integration](#continuous-integration))          |

`test/suites.js` is the one registry of portable suites; all three runners take
their default work from it, and `test/node/repository-invariants.test.js` fails
if a suite file exists that no runner registers.

`npm run test:browser` needs Playwright's headless Chromium shell once. This is
the exact command CI runs, and the flags matter: the headless shell is a
separate download from full Chromium, so installing one and launching the other
is how a browser job ends up silently skipping.

```sh
npx playwright install --with-deps --only-shell chromium
```

`npm run test:jsc` and `npm run test262:jsc` need `jsc` on `PATH`. macOS ships it
inside the JavaScriptCore framework rather than in a bin directory:

```sh
PATH="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" npm run test262:jsc
```

The JSC entry point takes no arguments (the shell has no argument vector), so it
reads optional `jsjsTest262Root` and `jsjsTest262Features` globals and otherwise
falls back to the checked-in fixtures.

The Node CLI accepts arguments:

```sh
node tools/test262/adapters/node.js \
  --root=test/fixtures/test262 \
  --features=fixture-subset \
  --skip-features=Proxy \
  --include-malformed \
  test/positive.js
```

`--root` points at a Test262-shaped tree (`harness/` plus test files) and
`--harness` renames the harness directory inside it,
`--features` is the allowlist of Test262 feature names the engine claims to
support, `--skip-features` excludes features explicitly, `--include-malformed`
adds the manifest's deliberately broken fixtures, and trailing arguments select
individual files instead of the manifest. The process exits `1` when any test
fails.

When `--features` is omitted entirely, the Node CLI reads
`tools/test262/features.json` — the checked-in supported-feature manifest — and
uses that as the allowlist instead. Passing `--features` (even as an empty
list) always overrides the manifest; only its complete omission defers to the
file. `npm run test262:fixtures` passes `--features=fixture-subset` explicitly
so it keeps exercising the runner's own skip/pass logic against the fixture
tree's synthetic feature tag regardless of what the manifest says; `npm run
test262:fixtures:manifest` omits `--features` so it reports what the real,
checked-in manifest allows.

## Test262

Upstream revision is pinned in `package.json` under the `test262` key:

- repository: `https://github.com/tc39/test262.git`
- revision: `b363f29d3c43c626dc852744ad64a0b48a003693` (2026-07-31)
- checkout path: `vendor/test262` (generated, gitignored like the rest of
  `vendor/`)

`npm run test262:upstream` runs the pinned subset against that checkout. It is
not a local copy of upstream tests: it reads the real files out of a real
`tc39/test262` tree, and refuses to run at all unless the tree's `HEAD` is
exactly the pinned revision, because a conformance number measured against a
different tree is worse than no number. Reproduce a CI run locally with:

```sh
git clone --filter=blob:none https://github.com/tc39/test262.git vendor/test262
git -C vendor/test262 checkout b363f29d3c43c626dc852744ad64a0b48a003693
npm run test262:upstream
```

The report goes to stdout and to `test262-upstream-report.jsonl` — the same
bytes, from the same string — and CI uploads that file as an artifact even when
the run fails, which is when the per-test records are worth reading.

`tools/test262/upstream-subset.json` is the checked-in selection: a schema
version, the repository and revision it was curated against, and named groups of
upstream-relative test paths. The paths are explicit rather than a glob because a
glob would change meaning every time the pin moves, so a green run would say
nothing about which tests actually ran; every path was verified to pass with this
engine, so a new failure is a real regression rather than a newly matched test.
`tools/test262/upstream.js` parses it (rejecting an abbreviated revision, an
unsorted or duplicated path, or a path outside `test/`) and summarizes a finished
run per group. The groups carry no execution semantics — they exist so the
milestone report can say which parts of the language the baseline covers.

The local fixture tree in `test/fixtures/test262` stays separate and is run by
`npm run test262:fixtures`. The two suites answer different questions: the
fixtures exercise the _runner_ (metadata parsing, variants, negative
expectations, skip decisions) against a tiny hand-written tree, and the upstream
subset exercises the _engine_ against real Test262 tests.

`tools/test262/features.json` is the checked-in supported-feature manifest, and
each entry is a record rather than a bare name:

```json
{
  "version": 1,
  "features": [
    {
      "name": "SomeFeature",
      "probe": "/* engine source that only completes if the feature works */",
      "tests": ["test/path/to/an/upstream/test.js"]
    }
  ]
}
```

`tools/test262/features.js` parses and validates it, and — more importantly —
`runFeatureProbe` _executes_ each entry's `probe` against a real engine in a
fresh realm. A probe is not a placeholder: it must complete normally on an
engine that implements the feature and must throw, or fail to parse, on one that
does not, and `featureProbeTestSource` renders it as a `raw` Test262 file tagged
with the feature so the same skip decision a real tagged test would earn is
exercised end to end. `tests` names upstream tests that really carry the tag;
`npm run ci:contract` reads each one out of the pinned checkout, asserts the tag
is really there, and asserts the test really passes once the feature is allowed.
A feature therefore cannot be claimed by editing a list.

The manifest currently holds no features. The engine is ES5-only today, so no
Test262 `features` tag is claimed as supported, and any test that declares one is
skipped rather than run. The baseline upstream subset is intentionally untagged —
none of its tests declare a `features` tag — so today's run skips nothing and the
report says exactly that: `{"type":"features","supported":[],"tagged":[],"untagged":64}`.
The schema, the probe execution, and the upstream correspondence check are all
exercised regardless, by a synthetic feature in
`test/node/workflow-contract.test.js` and a known feature-tagged upstream test in
`test/ci/full-contract.test.js`, so an empty manifest is never a vacuous check.

`tools/test262/` holds the portable half of the runner:

- `metadata.js` parses the Test262 frontmatter subset (`description`, `esid`,
  `es5id`, `info`, `flags`, `includes`, `features`, `negative`) without `eval`,
  expands strict/non-strict/raw variants, and resolves includes.
- `selection.js` decides _which_ tests run: the manifest's name, shape, and
  validation, the precedence between explicit paths, a manifest, and a host
  listing, and the code-unit ordering reports depend on.
- `runner.js` executes a variant in a fresh realm, evaluates includes before the
  test, classifies negative expectations by phase and constructor identity, and
  decides feature and flag skips. `runTest262` ties selection, execution, and
  report formatting together in one shared call.
- `report.js` renders records as deterministic JSON lines.

Adapters are thin: they supply file access, and for the two entry points, a CLI
and printing. `adapters/node.js` reads from disk, `adapters/browser.js` fetches
over HTTP, `adapters/jsc.js` uses the shell's `readFile`, and `adapters/paths.js`
resolves module-relative paths without `URL` (which `jsc` lacks). None of them
parse a manifest, expand a selection, or format a record; the manifest exists
only because browsers and `jsc` cannot list directories, and Node reads the same
one so all three hosts select the same tests.

### Supported subset

Fixtures deliberately stay inside what the engine implements today: `var`,
function declarations and expressions, object and array literals, member access
and calls, `new`, arithmetic, comparison, logical and conditional operators,
simple `=` assignment, `if`/`while`/`do`/`for`/`return`/`throw`, and the
`NaN`, `Infinity`, `undefined` globals.

Not implemented yet, and therefore not exercised: `try`/`catch`, `++`/`--`,
compound assignment, `in`, `instanceof`, `switch`, labelled statements,
getters/setters, and the standard library (`Object`, `Array`, `String`,
`Error`, …). Strict mode is only honoured at parse time, so the strict variant
catches early errors such as legacy octal literals but not runtime strictness.

Assignment to an undeclared identifier follows ES5 8.7.2 step 3: it creates (or
updates) a property on the realm's global object with the same attributes an
ordinary assignment to a global property gets — writable, enumerable, and
configurable, unlike the non-configurable property a `var` declaration creates.
The reference records themselves honour the strict flag and throw a
`ReferenceError` instead, but nothing sets that flag from a `'use strict'`
directive yet, so a strict script still creates the global; that is the same
runtime-strictness gap as above.

Tests carrying `module`, `async`, `CanBlockIsFalse`, `CanBlockIsTrue`, or
`non-deterministic` flags are skipped rather than failed, as are tests whose
`features` are outside the allowlist. `negative` tests whose expected error
constructor is not a binding on the realm's global object report
`unresolved-error-type` instead of pretending to pass.

### Reading the report

Every line is one JSON object; there is no other output on stdout. Test records
come first, sorted by file path then variant, followed by one summary record:

```json
{"type":"test","file":"test/positive.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/feature-skip.js","variant":null,"status":"skipped","reason":"unsupported-feature","message":"unsupported features: Proxy, Reflect","features":["Proxy","Reflect"]}
{"type":"summary","total":14,"passed":13,"failed":0,"skipped":1}
```

`variant` is `"non-strict"`, `"strict"`, `"raw"`, or `null` when the file never
reached execution. `status` is `passed`, `failed`, or `skipped`, and `reason`
names the decision:

| Reason                      | Meaning                                                  |
| --------------------------- | -------------------------------------------------------- |
| `metadata-error`            | Frontmatter is missing or malformed                      |
| `load-error`                | The host could not read the test or an include           |
| `harness-error`             | An include threw or failed to parse                      |
| `parse-error`               | The test failed to parse but expected to run             |
| `engine-error`              | The engine itself threw a non-`SyntaxError` host error   |
| `unexpected-throw`          | A positive test threw                                    |
| `expected-error-not-thrown` | A negative test completed normally                       |
| `wrong-error-phase`         | Threw in a different phase than `negative.phase`         |
| `wrong-error-type`          | Threw a value that is not an instance of `negative.type` |
| `unresolved-error-type`     | `negative.type` is not a global binding in this realm    |
| `unsupported-flag`          | Skipped: flag outside the engine's abilities             |
| `excluded-feature`          | Skipped: feature named in `--skip-features`              |
| `unsupported-feature`       | Skipped: feature outside `--features`                    |

Byte-identical output across Node, Chromium, and `jsc` is a checked property, in
two ways. `test/test262-runner.test.js` compares the whole fixture report against
a golden string and asserts that the runtime's own adapter selects the fixture
paths through `selection.js`; that suite runs under `npm run test:node`,
`npm run test:browser`, and `npm run test:jsc`. Separately, the `jsc` and Node
CLI entry points print the same 15-line report, which `cmp` confirms is
byte-identical.

## Continuous integration

`.github/workflows/ci.yml` is a generated file. `tools/ci/pipeline.js` is the
source of truth: it declares the job list as data and renders the workflow YAML
from it, the same way `tools/vendor/sync.js` is the source of truth for
`vendor/`. Run `npm run ci:generate` after editing the pipeline to rewrite the
committed file, and `npm run ci:check` to fail (without writing) if the two have
drifted. That check is a real CI job — `ci-drift` — so a change to `pipeline.js`
without regenerating the workflow fails CI the same way a vendor change without
`vendor:sync` fails `vendor:check`.

The upstream Test262 pin is not duplicated in the pipeline: `loadCiPipeline`
reads `package.json`, so the workflow checks out exactly the revision the local
tooling pins and moving the pin regenerates the workflow.

Every push and pull request against `main` runs nine jobs:

| Job                | What it runs                                                  | Depends on |
| ------------------ | ------------------------------------------------------------- | ---------- |
| `ci-drift`         | `npm run ci:check`                                            | —          |
| `vendor`           | `npm run vendor:check`                                        | —          |
| `format`           | `npm run format` (Prettier `--check`)                         | —          |
| `lint`             | `npm run lint` (ESLint only)                                  | —          |
| `typecheck`        | `npm run typecheck` (`tsc` in checkJs mode)                   | —          |
| `test-node`        | `npm run test:node`                                           | `vendor`   |
| `test-browser`     | `npm run test:browser` (Playwright's headless Chromium shell) | `vendor`   |
| `test262-fixtures` | `npm run test262:fixtures` (the local fixture tree)           | `vendor`   |
| `test262-upstream` | `npm run test262:upstream` (the pinned upstream subset)       | `vendor`   |

`format` and `lint` are separate jobs (and separate npm scripts) so a
formatting-only failure and a linting-only failure are distinguishable in CI
without re-reading combined output. `vendor` runs `vendor:check` — a read-only
integrity check — as a fast-failing gate the test jobs depend on via `needs`, so
pin/vendor drift is caught before those jobs spend time on it; `npm ci`'s
`prepare` script already writes `vendor/` fresh on every job, so this
specifically guards against the checked `package.json` pin and
`tools/vendor/sync.js` disagreeing with each other.

`test-browser` installs the browser with
`npx playwright install --with-deps --only-shell chromium` — the same command
documented under [Commands](#commands) — before running the suite, so the job
does not depend on whatever happens to be cached on a runner image.

`test262-upstream` checks out `tc39/test262` at the pinned revision into
`vendor/test262` with a second `actions/checkout` step, runs the curated subset
against it, and uploads `test262-upstream-report.jsonl` with `if: always()` and
`if-no-files-found: error`, so the JSON-lines report is available as an artifact
whether the run passed or failed.

Two security properties are encoded in the pipeline rather than left to whoever
edits the workflow next, and both are asserted by
`test/node/workflow-contract.test.js`:

- The workflow grants `permissions: contents: read` at the top level and no job
  widens it, so a compromised action cannot write to the repository.
- Every `uses:` names a full 40-character commit SHA, because a tag like `v4` is
  a moving pointer its owner can repoint at any time. The release version follows
  in a trailing comment (`# v7.0.1`), so a bump reviews as a version change
  rather than as forty opaque characters. Both checkout steps also pass
  `persist-credentials: false`.

Each job runs on `ubuntu-latest` with Node 20 (via `actions/setup-node` with the
built-in npm cache) and `npm ci`, matching the npm lockfile and the project's
ES2020 host floor; the repository has no `.nvmrc` or `engines` field yet to
anchor this further.

JSC is a documented local/conditional adapter, not a hosted CI job. GitHub's
hosted `ubuntu-latest`/`macos-latest` runners do not ship a standalone `jsc`
binary on `PATH` the way macOS's JavaScriptCore framework does locally, so
`test:jsc` and `test262:jsc` stay commands you run yourself (see
[Commands](#commands)) rather than CI jobs; the byte-identical-output guarantee
between Node, Chromium, and `jsc` is still enforced by
`test/test262-runner.test.js`, just outside hosted CI. A self-hosted runner with
`jsc` on `PATH` could add `test-jsc`/`test262-jsc` jobs later without changing
anything else in `tools/ci/pipeline.js`.

### The two contracts

Keeping CI honest takes two suites, deliberately split, because they have
opposite requirements.

`test/node/workflow-contract.test.js` runs inside `npm run test:node`. It is
deterministic and machine-independent: it never spawns a subprocess, never
touches the network, and never runs the pipeline it describes. It parses the
committed YAML with a real YAML parser and checks it against an expectation
table written out in the test — which job runs which command, the top-level
permissions, every action pin, the upstream revision and artifact step — rather
than against the generator that produced it, so a byte comparison with
`pipeline.js` is a drift check rather than the whole contract. It also parses
both Test262 manifests and executes every declared feature probe for real.

`npm run ci:contract` (`test/ci/full-contract.test.js`, through
`test/run-ci-contract.js`) is the full local contract: it executes every command
CI runs — `vendor:check`, `format`, `lint`, `typecheck`, `ci:check`, `test:node`,
`test262:fixtures`, `test:browser`, `test262:upstream` — as real subprocesses and
asserts on their real exit codes and output. It is _not_ registered with the Node
runner, and `test/node/repository-invariants.test.js` fails if it ever is:
running the whole pipeline from inside one of its own jobs would be recursive,
and it would make `test:node` depend on a browser install and an upstream
checkout.

Nothing in the full contract is conditional. A missing browser or a missing
upstream checkout fails with the exact command needed to fix it, because a skip
that looks like a pass is how a contract quietly stops being one.

## Milestone report

This milestone claims no Test262 `features` tag as supported: the manifest holds
no entries, consistent with the ES5-only subset described above. The initial
deterministic conformance report is the real output of `npm run test262:upstream`
against `tc39/test262` at `b363f29d3c43c626dc852744ad64a0b48a003693` — 32 files,
64 (file, variant) records, all passing:

<!-- test262-upstream-report:begin -->

```json
{"type":"test","file":"test/language/comments/S7.4_A3.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/comments/S7.4_A3.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/comments/S7.4_A4_T1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/comments/S7.4_A4_T1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/expressions/comma/S11.14_A3.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/expressions/comma/S11.14_A3.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/expressions/conditional/S11.12_A3_T4.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/expressions/conditional/S11.12_A3_T4.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/expressions/logical-and/S11.11.1_A3_T1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/expressions/logical-and/S11.11.1_A3_T1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/expressions/logical-or/S11.11.2_A2.1_T4.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/expressions/logical-or/S11.11.2_A2.1_T4.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/line-terminators/S7.3_A2.1_T2.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/line-terminators/S7.3_A2.1_T2.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/line-terminators/S7.3_A6_T1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/line-terminators/S7.3_A6_T1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/statements/block/S12.1_A4_T1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/statements/block/S12.1_A4_T1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/statements/do-while/S12.6.1_A1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/statements/do-while/S12.6.1_A1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/statements/do-while/S12.6.1_A4_T1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/statements/do-while/S12.6.1_A4_T1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/statements/empty/S12.3_A1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/statements/empty/S12.3_A1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/statements/if/S12.5_A1_T1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/statements/if/S12.5_A1_T1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/statements/if/S12.5_A6_T1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/statements/if/S12.5_A6_T1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/statements/return/S12.9_A1_T1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/statements/return/S12.9_A1_T1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/statements/return/S12.9_A3.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/statements/return/S12.9_A3.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/statements/while/S12.6.2_A1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/statements/while/S12.6.2_A1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/statements/while/S12.6.2_A4_T1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/statements/while/S12.6.2_A4_T1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/types/boolean/S8.3_A1_T1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/types/boolean/S8.3_A1_T1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/types/boolean/S8.3_A2.1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/types/boolean/S8.3_A2.1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/types/null/S8.2_A1_T1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/types/null/S8.2_A1_T1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/types/null/S8.2_A2.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/types/null/S8.2_A2.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/types/number/S8.5_A2.1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/types/number/S8.5_A2.1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/types/number/S8.5_A3.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/types/number/S8.5_A3.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/types/number/S8.5_A5.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/types/number/S8.5_A5.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/types/string/S8.4_A1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/types/string/S8.4_A1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/types/string/S8.4_A2.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/types/string/S8.4_A2.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/types/undefined/S8.1_A1_T1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/types/undefined/S8.1_A1_T1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/types/undefined/S8.1_A2_T1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/types/undefined/S8.1_A2_T1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/types/undefined/S8.1_A3_T1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/types/undefined/S8.1_A3_T1.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/white-space/S7.2_A2.1_T2.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/white-space/S7.2_A2.1_T2.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/language/white-space/S7.2_A5_T1.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/language/white-space/S7.2_A5_T1.js","variant":"strict","status":"passed"}
{"type":"baseline","group":"expressions","files":4,"records":8,"passed":8,"failed":0,"skipped":0}
{"type":"baseline","group":"lexical","files":6,"records":12,"passed":12,"failed":0,"skipped":0}
{"type":"baseline","group":"statements","files":10,"records":20,"passed":20,"failed":0,"skipped":0}
{"type":"baseline","group":"types","files":12,"records":24,"passed":24,"failed":0,"skipped":0}
{"type":"features","supported":[],"tagged":[],"untagged":64}
{"type":"summary","total":64,"passed":64,"failed":0,"skipped":0}
```

<!-- test262-upstream-report:end -->

The `baseline` lines are the per-group summary; the `features` line is what the
run can honestly say about optional features. `supported` is what the manifest
claims (nothing yet), `tagged` is the feature tags actually seen on the tests
that ran (none — the ES5 baseline is intentionally untagged), and `untagged`
counts the records that carried no tag at all. There is no per-feature progress
table because there are no features to report on yet; inventing one would
describe something the run never measured.

`npm run ci:contract` regenerates this block's expected content and fails if the
committed README no longer matches, so the milestone report cannot drift from
what the command actually prints.
