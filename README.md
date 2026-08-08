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
For benchmark-specific setup, CLI options, artifact schemas, and caveats, see
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
full ES5.1 standard library plus ES2015 `Symbol`.
`evaluateScript(realm, source)` parses and evaluates a script, returning
`{ type: 'normal' | 'throw', value }`. See
[docs/architecture.md](docs/architecture.md) for the full embedding API.

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

The full command list, Test262 runner options, suite organization, CI jobs, and
troubleshooting are in [docs/testing.md](docs/testing.md). Benchmark
methodology, prerequisites, CLI options, schema details, reproducibility
guidance, and caveats are in [docs/benchmarking.md](docs/benchmarking.md).

## Test262

The engine is tested against the upstream [tc39/test262](https://github.com/tc39/test262)
suite, pinned to revision `b363f29d3c43c626dc852744ad64a0b48a003693` (2026-07-31).
Every selected record passes. Conformance methodology, the supported ES5.1
surface and the ES2015 Symbol surface on top of it, denominator semantics, the live coverage table, and the detailed report
are in [docs/conformance.md](docs/conformance.md).

## Architecture

Source flow, realms and intrinsics, the type system (values, objects,
environments, references, completions), evaluator boundaries, host adapters, and
the embedding API are documented in [docs/architecture.md](docs/architecture.md).

## Limitations and deviations

The engine has a small number of intentional deviations from the ES5.1 text
(mostly following ES2015+ errata every engine ships) and one known limitation
(guest recursion depth: bounded by an engine-owned budget of 500 engine
frames, raising a catchable guest `RangeError`, rather than by the host's
stack). The full tables, spec citations, observable examples,
and backing code references are in
[docs/limitations.md](docs/limitations.md).
