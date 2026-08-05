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

| Command                    | What it does                                                       |
| -------------------------- | ------------------------------------------------------------------ |
| `npm test`                 | The Node suites, then the Test262 fixture suite through the CLI    |
| `npm run test:node`        | Every portable suite plus the Node-only suites in `test/node/`     |
| `npm run test:browser`     | Every portable suite in headless Chromium via Playwright           |
| `npm run test:jsc`         | Every portable suite in the `jsc` shell                            |
| `npm run test262:fixtures` | Test262 runner over `test/fixtures/test262` (JSON lines on stdout) |
| `npm run test262:jsc`      | The same fixture suite under the `jsc` shell                       |
| `npm run vendor:sync`      | Refresh `vendor/` from the pinned dependencies                     |
| `npm run vendor:check`     | Fail if `vendor/` has drifted from the pinned dependencies         |
| `npm run typecheck`        | `tsc` in checkJs mode                                              |
| `npm run lint`             | ESLint plus a Prettier format check                                |

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

## Test262

Upstream revision is pinned in `package.json` under the `test262` key:

- repository: `https://github.com/tc39/test262.git`
- revision: `b363f29d3c43c626dc852744ad64a0b48a003693` (2026-07-31)
- checkout path: `vendor/test262` (not vendored yet; the fixture tree in
  `test/fixtures/test262` mirrors its layout)

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
