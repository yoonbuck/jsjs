# jsjs

An ECMAScript engine written in javascript.

The engine is plain ES2020 JavaScript with JSDoc types. The same source runs in
Node, in a browser, and in the JavaScriptCore (`jsc`) shell: nothing in `src/`
imports a host module, and guest behaviour never leans on host `eval`,
`Function`, or host objects.

## Commands

| Command                    | What it does                                                       |
| -------------------------- | ------------------------------------------------------------------ |
| `npm test`                 | Node unit suites, then the Test262 fixture suite through the CLI   |
| `npm run test:node`        | Every `test/*.test.js` suite under Node                            |
| `npm run test:browser`     | Every suite in headless Chromium via Playwright                    |
| `npm run test262:fixtures` | Test262 runner over `test/fixtures/test262` (JSON lines on stdout) |
| `npm run test262:jsc`      | The same fixture suite under the `jsc` shell                       |
| `npm run typecheck`        | `tsc` in checkJs mode                                              |
| `npm run lint`             | ESLint plus a Prettier format check                                |

`npm run test:browser` needs the Playwright browser binaries once:

```sh
npx playwright install chromium --only-shell
```

`npm run test262:jsc` needs `jsc` on `PATH`. macOS ships it inside the
JavaScriptCore framework rather than in a bin directory:

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
- `runner.js` executes a variant in a fresh realm, evaluates includes before the
  test, classifies negative expectations by phase and constructor identity, and
  decides feature and flag skips.
- `report.js` renders records as deterministic JSON lines.

Adapters are thin: they only supply file access. `adapters/node.js` reads from
disk and provides the CLI, `adapters/browser.js` fetches over HTTP,
`adapters/jsc.js` uses the shell's `readFile`, and `adapters/paths.js` resolves
module-relative paths without `URL` (which `jsc` lacks).

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

Byte-identical output across Node, Chromium, and `jsc` is a checked property:
`test/test262-runner.test.js` compares the whole fixture report against a golden
string, and that suite runs in all three runtimes.
