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

| Command                | What it does                                                   |
| ---------------------- | -------------------------------------------------------------- |
| `npm test`             | The Node suites, then the Test262 fixture suite                |
| `npm run test:node`    | Every portable suite plus the Node-only suites in `test/node/` |
| `npm run test:browser` | Every portable suite in headless Chromium via Playwright       |
| `npm run test:jsc`     | Every portable suite in the `jsc` shell                        |
| `npm run typecheck`    | `tsc` in checkJs mode                                          |
| `npm run format`       | Prettier `--check` over the repository                         |
| `npm run lint`         | ESLint only                                                    |
| `npm run vendor:sync`  | Refresh `vendor/` from pinned dependencies                     |
| `npm run ci:contract`  | Full local CI contract: every command CI runs, for real        |

The full command list, Test262 runner options, suite organization, CI jobs, and
troubleshooting are in [docs/testing.md](docs/testing.md).

## Test262

The engine is tested against the upstream [tc39/test262](https://github.com/tc39/test262)
suite, pinned to revision `b363f29d3c43c626dc852744ad64a0b48a003693` (2026-07-31).
Every selected record passes. Conformance methodology, the supported ES5.1
surface, denominator semantics, the live coverage table, and the detailed report
are in [docs/conformance.md](docs/conformance.md).

### Architecture

Source flow, realms and intrinsics, the type system (values, objects,
environments, references, completions), evaluator boundaries, host adapters, and
the embedding API are documented in [docs/architecture.md](docs/architecture.md).

#### Limitations and deviations

The engine has a small number of intentional deviations from the ES5.1 text
(mostly following ES2015+ errata every engine ships) and one known limitation
(guest recursion depth). The full tables, spec citations, observable examples,
and backing code references are in
[docs/limitations.md](docs/limitations.md).
