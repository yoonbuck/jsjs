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

`createRealm()` returns an initialized realm with all built-in objects: the
full ES5.1 standard library plus ES2015 `Symbol`. Each realm gets its own
agent — the owner of the well-known symbols and the global symbol registry —
unless `createRealm({ agent })` opts several realms into sharing one.
`evaluateScript(realm, source)` parses and evaluates a script, returning
`{ type: 'normal' | 'throw', value }`. The engine implements ES5.1 plus ES2015
lexical declarations, `for`-`of`, arrows, classes, computed object and class
method names, destructuring, default/rest parameters, iterable spread, and
template literals (including tagged-template caching). See
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

This sample host may use `queueMicrotask`; nothing in `src/` probes or calls
that host API. `jobHost.scheduleMicrotask` is optional at the embedding boundary
only in the sense that omitting the whole `jobHost` selects manual mode. See
[docs/conformance.md](docs/conformance.md) for Agent Job, Promise, rejection
tracker, and async Test262 behavior.

## Commands

| Command                     | What it does                                                   |
| --------------------------- | -------------------------------------------------------------- |
| `npm test`                  | The Node suites, then the Test262 fixture suite                |
| `npm run test:node`         | Every portable suite plus the Node-only suites in `test/node/` |
| `npm run test:browser`      | Every portable suite in headless Chromium via Playwright       |
| `npm run test:jsc`          | Every portable suite in the `jsc` shell                        |
| `npm run typecheck`         | `tsc` in checkJs mode                                          |
| `npm run format`            | Prettier `--check` over the repository                         |
| `npm run lint`              | ESLint only                                                    |
| `npm run vendor:sync`       | Refresh `vendor/` from pinned dependencies                     |
| `npm run ci:contract`       | Full local CI contract: every command CI runs, for real        |
| `npm run benchmark`         | Cross-runtime benchmark CLI across Node, Chromium, and `jsc`   |
| `npm run benchmark:node`    | Benchmark only the Node host                                   |
| `npm run benchmark:browser` | Benchmark only the Chromium host                               |
| `npm run benchmark:jsc`     | Benchmark only the `jsc` host                                  |
| `npm run benchmark:smoke`   | Correctness-only Node smoke benchmark                          |
| `npm run benchmark:summary` | Aggregate compatible host reports into JSON and CSV            |
| `npm run benchmark:compare` | Gate repeated counterbalanced captures for a real difference   |

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
classified-neighbor cases. Conformance methodology, live coverage, and the
detailed report are in [docs/conformance.md](docs/conformance.md).

## Architecture

Source flow, realms and intrinsics, the type system (values, objects,
environments, references, completions), evaluator boundaries, host adapters, and
the embedding API are documented in [docs/architecture.md](docs/architecture.md).

## Limitations and deviations

The engine has a small number of intentional deviations from the ES5.1 text
(mostly following ES2015+ errata every engine ships, plus the ES2015 grammar's
removal of the strict duplicate-property early error) and known limitations —
guest recursion depth is bounded by an engine-owned budget of 500 engine frames,
raising a catchable guest `RangeError` rather than by the host's stack. It still
rejects generators/yield, async/await, modules, `new.target`, object
rest/spread, later class forms, binary/octal literals, and Unicode code-point
escapes. The full
tables, spec citations, observable examples, and backing code references are in
[docs/limitations.md](docs/limitations.md).
