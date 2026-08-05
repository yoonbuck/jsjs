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

| Command                    | What it does                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                 | The Node suites, then the Test262 fixture suite through the CLI                                                           |
| `npm run test:node`        | Every portable suite plus the Node-only suites in `test/node/`                                                             |
| `npm run test:browser`     | Every portable suite in headless Chromium via Playwright                                                                  |
| `npm run test:jsc`         | Every portable suite in the `jsc` shell                                                                                    |
| `npm run test262:fixtures` | Test262 runner over `test/fixtures/test262`, forcing the fixture-only `fixture-subset` feature (JSON lines on stdout)     |
| `npm run test262:subset`   | Test262 runner over `test/fixtures/test262`, feature allowlist defaulted from `tools/test262/features.json` — the pinned milestone subset |
| `npm run test262:jsc`      | The fixture suite under the `jsc` shell                                                                                    |
| `npm run vendor:sync`      | Refresh `vendor/` from the pinned dependencies                                                                             |
| `npm run vendor:check`     | Fail if `vendor/` has drifted from the pinned dependencies                                                                 |
| `npm run typecheck`        | `tsc` in checkJs mode                                                                                                       |
| `npm run format`           | Prettier `--check` over every tracked source file                                                                          |
| `npm run lint`             | ESLint only                                                                                                                 |
| `npm run ci:generate`      | Regenerate `.github/workflows/ci.yml` from `tools/ci/pipeline.js`                                                          |
| `npm run ci:check`         | Fail if the committed workflow has drifted from `tools/ci/pipeline.js`                                                    |

`test/suites.js` is the one registry of portable suites; all three runners take
their default work from it, and `test/node/repository-invariants.test.js` fails
if a suite file exists that no runner registers.

`npm run test:browser` needs the Playwright browser binaries once:

```sh
npx playwright install chromium --only-shell
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
test262:subset` omits `--features` so it reports the engine's real,
manifest-backed conformance claim.

## Test262

Upstream revision is pinned in `package.json` under the `test262` key:

- repository: `https://github.com/tc39/test262.git`
- revision: `b363f29d3c43c626dc852744ad64a0b48a003693` (2026-07-31)
- checkout path: `vendor/test262` (not vendored yet; the fixture tree in
  `test/fixtures/test262` mirrors its layout)

`tools/test262/features.json` is the checked-in supported-feature manifest: a
JSON array of Test262 feature names the engine actually implements and has
tests for. `tools/test262/features.js` parses and validates it (a JSON array
of unique, non-empty strings, sorted the same way `selection.js` sorts test
paths) and is what the Node CLI defaults `--features` from when the flag is
omitted. The manifest currently holds `[]`: the engine is ES5-only today, so no
Test262 `features` tag is yet claimed as supported, and any test that declares
one is skipped rather than run. Every entry the manifest ever gains must be
backed by tests the engine actually passes — `test/node/ci-contract.test.js`
enforces this by running the shared runner once with each declared feature
supported and once without, asserting a real `passed`/`skipped` split rather
than trusting the file's contents.

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
source of truth: it declares the job list as data (`CI_JOBS`) and renders the
workflow YAML from it, the same way `tools/vendor/sync.js` is the source of
truth for `vendor/`. Run `npm run ci:generate` after editing `CI_JOBS` to
rewrite the committed file, and `npm run ci:check` to fail (without writing) if
the two have drifted — that check is itself one of the CI jobs, so a change to
`pipeline.js` without regenerating the workflow fails CI the same way a vendor
change without `vendor:sync` fails `vendor:check`.

Every push and pull request against `main` runs seven jobs:

| Job              | What it runs                                             | Depends on |
| ----------------- | --------------------------------------------------------- | ---------- |
| `vendor`          | `npm run vendor:check`                                    | —          |
| `format`          | `npm run format` (Prettier `--check`)                      | —          |
| `lint`            | `npm run lint` (ESLint only)                               | —          |
| `typecheck`       | `npm run typecheck` (`tsc` in checkJs mode)                 | —          |
| `test-node`       | `npm run test:node`                                        | `vendor`   |
| `test-browser`    | `npm run test:browser` (Playwright, Chromium)              | `vendor`   |
| `test262-subset`  | `npm run test262:subset` (the pinned feature-manifest subset) | `vendor`   |

`format` and `lint` are separate jobs (and separate npm scripts) so a
formatting-only failure and a linting-only failure are distinguishable in CI
without re-reading combined output. `vendor` runs `vendor:check` — a read-only
integrity check — as a fast-failing gate that `test-node`, `test-browser`, and
`test262-subset` depend on via `needs`, so a pin/vendor drift is caught before
those jobs spend time on it; `npm ci`'s `prepare` script already writes
`vendor/` fresh on every job, so this specifically guards against the checked
`package.json` pin and `tools/vendor/sync.js` disagreeing with each other, the
same property `vendor:check` guards locally.

`test-browser` installs Playwright's browser binaries reproducibly with
`npx playwright install --with-deps chromium` before running the suite, so the
job doesn't depend on whatever happens to be cached on a runner image.

Each job runs on `ubuntu-latest` with `actions/setup-node@v4` pinned to Node 20
(with the built-in npm cache) and `npm ci`, matching the npm lockfile and the
project's ES2020 host floor; the repository has no `.nvmrc` or `engines` field
yet to anchor this further.

JSC is a documented local/conditional adapter, not a hosted CI job. GitHub's
hosted `ubuntu-latest`/`macos-latest` runners do not ship a standalone `jsc`
binary on `PATH` the way macOS's JavaScriptCore framework does locally, so
`test:jsc` and `test262:jsc` stay commands you run yourself (see
[Commands](#commands)) rather than CI jobs; the byte-identical-output guarantee
between Node, Chromium, and `jsc` is still enforced by
`test/test262-runner.test.js`, just outside hosted CI. A self-hosted runner
with `jsc` on `PATH` could add `test-jsc`/`test262-jsc` jobs later without
changing anything else in `tools/ci/pipeline.js`.

`test/node/ci-contract.test.js` is the local, TDD-first test that keeps all of
this honest: it asserts `CI_JOBS` declares a job for each required check, that
every `npm run` command CI references actually exists in `package.json`, that
the browser job's install step is reproducible, and that the committed
`ci.yml` is byte-identical to what `pipeline.js` renders — and then it goes
further than structure, actually executing `vendor:check`, `format`, `lint`,
`typecheck`, and `test262:subset` as real subprocesses (plus `test:browser`
when Playwright's Chromium is installed locally) and asserting on their real
exit codes and output, so a broken command fails this suite locally before it
would ever reach CI.

## Milestone report

`tools/test262/features.json` — the checked-in supported-feature manifest —
currently holds `[]`: this milestone claims no Test262 `features` tag as
supported yet, consistent with the ES5-only subset described above. The
initial, deterministic Test262 subset report, produced by
`npm run test262:subset` against `test/fixtures/test262` with that manifest as
the (empty) feature allowlist:

```json
{"type":"test","file":"test/feature-skip.js","variant":null,"status":"skipped","reason":"unsupported-feature","message":"unsupported features: Proxy, Reflect","features":["Proxy","Reflect"]}
{"type":"test","file":"test/includes.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/includes.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/no-strict.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/only-strict.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/parse-negative.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/parse-negative.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/positive.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/positive.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/raw.js","variant":"raw","status":"passed"}
{"type":"test","file":"test/runtime-negative.js","variant":"non-strict","status":"passed"}
{"type":"test","file":"test/runtime-negative.js","variant":"strict","status":"passed"}
{"type":"test","file":"test/supported-feature.js","variant":null,"status":"skipped","reason":"unsupported-feature","message":"unsupported features: fixture-subset","features":["fixture-subset"]}
{"type":"summary","total":13,"passed":11,"failed":0,"skipped":2}
```

This differs from the `test262:fixtures` report earlier in this document only
in `test/supported-feature.js`: `test262:fixtures` explicitly passes
`--features=fixture-subset` so that fixture passes, while `test262:subset`
takes its allowlist from the (currently empty) real manifest, so the same file
is correctly skipped as `unsupported-feature` instead. Both reports are
otherwise identical because the real upstream `vendor/test262` tree is not
checked out yet (see [Test262](#test262)); once it is, `test262:subset` is the
command that reports the engine's real, pinned conformance subset against it.
