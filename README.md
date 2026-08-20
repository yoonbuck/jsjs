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

## Setup

```sh
npm install
```

This populates `vendor/` through the `prepare` script. For browser and JSC
prerequisites (Playwright, `jsc` on PATH), see [docs/testing.md](docs/testing.md).
For the integrated performance-milestone baseline and final before/after
evidence, see [docs/performance-release.md](docs/performance-release.md). For
benchmark-specific setup, CLI options, artifact schemas, and caveats, see
[docs/benchmarking.md](docs/benchmarking.md). For reproducible interpreter
profiling evidence, hotspot rankings, and limitations, see
[docs/profiling.md](docs/profiling.md).

## Usage

```js
import { createRealm, evaluateScript } from './src/index.js';

const realm = createRealm();
const result = evaluateScript(realm, '1 + 2');
console.log(result); // { type: 'normal', value: 3 }
```

`createRealm()` returns an initialized realm with the full ES5.1 standard
library plus ES2015 `Symbol`, iterator, Promise, and non-global generator
intrinsics. Each realm gets its own agent — the owner of the well-known symbols
and the global symbol registry — unless `createRealm({ agent })` opts several
realms into sharing one.
`evaluateScript(realm, source)` parses and evaluates a script, returning
`{ type: 'normal' | 'throw', value }`. The engine implements ES5.1 plus ES2015
lexical declarations, `for`-`of`, arrows, classes, computed object and class
method names, destructuring, default/rest parameters, iterable spread, and
template literals (including tagged-template caching). It also implements
synchronous generator declarations, expressions, object/class methods,
`yield`/`yield*`, and the non-global dynamic `%GeneratorFunction%` constructor.
See
[docs/architecture.md](docs/architecture.md) for the grammar boundary and full
embedding API.

### Agent Jobs and Promises

Promises use an Agent-owned FIFO job queue. With no `jobHost`, a realm uses
deterministic manual mode: guest Promise work remains queued until its embedder
creates a checkpoint with `realm.agent.runJobs()`.

```js
const realm = createRealm();
evaluateScript(realm, 'Promise.resolve(1).then(function (x) { result = x; })');
const checkpoint = realm.agent.runJobs();
```

`checkpoint` reports the number of jobs processed and any recorded job or host
hook failures. For automatic delivery, provide a `jobHost` when creating the
realm. The scheduler accepts one checkpoint callback at a time:

```js
const realm = createRealm({
  jobHost: {
    scheduleMicrotask(callback) {
      queueMicrotask(callback);
    },
  },
});
```

This example names `queueMicrotask` only as an embedder/host scheduling choice;
nothing in `src/` probes or calls that host API. `jobHost.scheduleMicrotask` is
optional at the embedding boundary only in the sense that omitting the whole
`jobHost` selects manual mode. See
[docs/conformance.md](docs/conformance.md) for Agent Job, Promise, rejection
tracker, and async Test262 behavior.

### Static modules

Static ES2015 modules are available only through the loader boundary:

```js
import { createModuleLoader, createRealm } from './src/index.js';

const loader = createModuleLoader(createRealm(), {
  resolve(specifier, referrer) {
    return new URL(specifier, referrer ?? 'file:///app/').href;
  },
  load(identifier) {
    return sources.get(identifier);
  },
});
const namespace = await loader.loadAndEvaluate('./entry.js');
```

`parseModule(source)` validates module source without evaluating it.
`createModuleLoader(realm, { resolve, load })` owns canonical identifiers,
loading, linking, and evaluation; `ModuleLoader` and `ModuleLoaderError` are
also public for embedding type checks and error handling. See
[docs/architecture.md](docs/architecture.md#static-module-api-and-contract) for
the exact contract. The engine still rejects async functions/generators and
`await`, and does not implement dynamic `import()`.

## Commands

| Command                                     | What it does                                                       |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `npm test`                                  | The Node suites, then the Test262 fixture suite                    |
| `npm run test:node`                         | Every portable suite plus the Node-only suites in `test/node/`     |
| `npm run test:browser`                      | Every portable suite in headless Chromium via Playwright           |
| `npm run test:jsc`                          | Every portable suite in the `jsc` shell                            |
| `TZ=UTC npm run test262:modules`            | Focused pinned ES2015 static-module Test262 suite                  |
| `TZ=UTC npm run test262:es2015:audit:check` | Verify the pinned ES2015 taxonomy and exact promotion              |
| `npm run typecheck`                         | `tsc` in checkJs mode                                              |
| `npm run format`                            | Prettier `--check` over the repository                             |
| `npm run lint`                              | ESLint only                                                        |
| `npm run vendor:sync`                       | Refresh `vendor/` from pinned dependencies                         |
| `npm run ci:contract`                       | Safe local CI subset through browser/fixtures; no upstream Test262 |
| `npm run benchmark`                         | Cross-runtime benchmark CLI across Node, Chromium, and `jsc`       |
| `npm run benchmark:node`                    | Benchmark only the Node host                                       |
| `npm run benchmark:browser`                 | Benchmark only the Chromium host                                   |
| `npm run benchmark:jsc`                     | Benchmark only the `jsc` host                                      |
| `npm run benchmark:smoke`                   | Correctness-only Node smoke benchmark                              |
| `npm run benchmark:summary`                 | Aggregate compatible host reports into JSON and CSV                |
| `npm run benchmark:compare`                 | Gate repeated counterbalanced captures for a real difference       |

The full command list, Test262 runner options, suite organization, CI jobs, and
troubleshooting are in [docs/testing.md](docs/testing.md). Benchmark
methodology, prerequisites, CLI options, schema details, reproducibility
guidance, and caveats are in [docs/benchmarking.md](docs/benchmarking.md).

## Test262

The engine is tested against the upstream [tc39/test262](https://github.com/tc39/test262)
suite, pinned to revision `b363f29d3c43c626dc852744ad64a0b48a003693` (2026-07-31).
The Test262 feature manifest has executable probes for the supported ES2015
syntax tags: arrows, classes, computed names, defaults, destructuring,
rest parameters, spread, and templates. A small pinned suite in
`test/ci/es2015-syntax-test262.test.js` covers their positive, negative, and
classified-neighbor cases. The global Test262 feature manifest includes
`generators`; exactly 11 approved generator roots enter broad selection, while
Promise and static-module roots remain focused-only. The checkout-dependent
`test/ci/es2015-generator-test262.test.js` separately runs focused generator
coverage over those approved roots. The Promise and static-module suites retain
their explicit focused allowlists; the module suite does not add a bare module
feature probe. The deterministic ES2015 taxonomy records exact-path promotion
evidence separately from broad feature support; it is not a broad ES2015
feature-tag claim. See [docs/testing.md](docs/testing.md#deterministic-es2015-taxonomy-and-exact-promotion)
for its UTC, exact-pin, focused-local, and CI-authority rules. `npm run
ci:contract` intentionally excludes every checkout-dependent upstream Test262
execution; exact-SHA CI alone owns the broad pinned run.
Conformance methodology, live coverage, and the detailed report are in
[docs/conformance.md](docs/conformance.md).

## Architecture

Source flow, realms and intrinsics, the type system (values, objects,
environments, references, completions), evaluator boundaries, host adapters, and
the embedding API are documented in [docs/architecture.md](docs/architecture.md).

## Limitations and deviations

The engine has a small number of intentional deviations from the ES5.1 text
(mostly following ES2015+ errata every engine ships, plus the ES2015 grammar's
removal of the strict duplicate-property early error) and known limitations —
ordinary synchronous evaluation is bounded by an engine-owned budget of 500
engine frames, raising a catchable guest `RangeError` before the host stack
fails. Generator suspension itself retains only heap-resident frames. The
engine still rejects async functions/generators and `await`, dynamic `import()`,
object rest/spread, later class forms, and it omits later iterator/generator
helpers. Binary/octal literals, valid Unicode code-point escapes, and exact
`new.target` in function code are supported; top-level, module, and
indirect-eval `new.target` parses remain SyntaxErrors. The
full
tables, spec citations, observable examples, and backing code references are in
[docs/limitations.md](docs/limitations.md).
