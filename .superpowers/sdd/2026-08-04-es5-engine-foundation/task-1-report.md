# Task 1 Report — Portable project and test foundation

## What changed

- Added npm project metadata, strict JS/JSDoc checking, ESLint, and Prettier config.
- Added a shared portable test harness:
  - `assertSame(actual, expected)`
  - `assertThrows(fn, ErrorType)`
  - `runTests(tests, reporter)`
- Added Node and browser test launchers plus the initial foundation test.
- Added a minimal type shim for `process` and a root `.gitignore` for `node_modules/`.

## Files changed

- `.gitignore`
- `.prettierrc.json`
- `eslint.config.js`
- `jsconfig.json`
- `package.json`
- `package-lock.json`
- `test/foundation.test.js`
- `test/harness/assert.js`
- `test/harness/runner.js`
- `test/run-browser.html`
- `test/run-browser.js`
- `test/run-node.js`
- `types/globals.d.ts`

## RED

Command:

```bash
node test/run-node.js test/foundation.test.js
```

Output:

```text
node:internal/modules/esm/resolve:272
    throw new ERR_MODULE_NOT_FOUND(
          ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/jordan/hack/copilot/copilot-worktrees/jsjs/yoonbuck-miniature-succotash/test/harness/runner.js' imported from /Users/jordan/hack/copilot/copilot-worktrees/jsjs/yoonbuck-miniature-succotash/test/run-node.js
    at finalizeResolution (node:internal/modules/esm/resolve:272:11)
    at moduleResolve (node:internal/modules/esm/resolve:879:10)
    at defaultResolve (node:internal/modules/esm/resolve:1006:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:708:20)
    at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:728:38)
    at ModuleLoader.resolveSync (node:internal/modules/esm/loader:766:56)
    at #resolve (node:internal/modules/esm/loader:690:17)
    at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:610:35)
    at ModuleJob.syncLink (node:internal/modules/esm/module_job:277:33)
    at ModuleJob.link (node:internal/modules/esm/module_job:389:17) {
  code: 'ERR_MODULE_NOT_FOUND',
  url: 'file:///Users/jordan/hack/copilot/copilot-worktrees/jsjs/yoonbuck-miniature-succotash/test/harness/runner.js'
}

Node.js v26.5.1
```

Why expected: the test launcher and foundation test imported harness modules that had not been created yet.

## GREEN / checks

Command:

```bash
npm test
```

Output:

```text
> test
> node test/run-node.js test/foundation.test.js

{"name":"assert helpers work","status":"passed"}
{"name":"foundation harness reports deterministic json","status":"passed"}
```

Command:

```bash
npm run typecheck
```

Output:

```text
> typecheck
> tsc -p jsconfig.json
```

Command:

```bash
npm run lint
```

Output:

```text
> lint
> eslint . && prettier --check package.json jsconfig.json eslint.config.js .prettierrc.json test/*.js test/harness/*.js types/*.d.ts

Checking formatting...
All matched files use Prettier code style!
```

Final combined verification:

```bash
npm test && npm run typecheck && npm run lint
```

## Self-review

- Verified the harness stays dependency-light and uses plain JavaScript with JSDoc types.
- Verified the reporter output is deterministic JSON with no stack traces in the normal path.
- Verified formatting, linting, and type checking all pass after the final edits.

## Concerns

- The browser runner is added and type-checked, but it has not been executed in a real browser in this task.
- The current foundation only covers the portable harness and launchers; later tasks will add parser/runtime coverage.

## Fix round 1

### What changed

- Narrowed `assertSame` to same-value semantics only (`Object.is`) and updated its error text.
- Added focused tests covering `NaN`, signed zero, and distinct `Date` / `RegExp` / `Map` / `Set` instances.
- Downgraded ESLint to `8.57.1` and kept flat-config linting enabled for ES2020-era hosts via `ESLINT_USE_FLAT_CONFIG=true`.

### RED

Command:

```bash
node test/run-node.js test/foundation.test.js
```

Output:

```text
{"name":"assertSame uses same-value semantics","status":"failed","error":{"name":"Error","message":"Expected function to throw Error"}}
{"name":"foundation harness reports deterministic json","status":"passed"}
```

### GREEN

Command:

```bash
node test/run-node.js test/foundation.test.js
```

Output:

```text
{"name":"assertSame uses same-value semantics","status":"passed"}
{"name":"foundation harness reports deterministic json","status":"passed"}
```

### CHECKS

Command:

```bash
npm run typecheck
```

Output:

```text
> typecheck
> tsc -p jsconfig.json
```

Command:

```bash
npm run lint
```

Output:

```text
> lint
> ESLINT_USE_FLAT_CONFIG=true eslint . && prettier --check package.json jsconfig.json eslint.config.js .prettierrc.json test/*.js test/harness/*.js types/*.d.ts

Checking formatting...
All matched files use Prettier code style!
```
