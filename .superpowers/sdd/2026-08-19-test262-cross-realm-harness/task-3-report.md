# Task 3 Report: Realm-Owned `$262`

## Scope

Implemented the harness-only Test262 `$262` bridge in `tools/test262/engine.js`, portable coverage in `test/test262-host-bindings.test.js`, raw script/module probes, suite registration, and the runner typedef update for a non-void installer result. Normal public `createRealm()` still has no `$262`.

## Files Changed

- `tools/test262/engine.js`
- `tools/test262/runner.js`
- `test/test262-host-bindings.test.js`
- `test/test262-runner.test.js`
- `test/module-test262.test.js`
- `test/suites.js`

## Commits

- Base: `4a2c44e6e4cc4f988006bd574e72ff8a04140161`
- Implementation: `c52823113ec704b09ed9850f698d1d36bf479c48`

## RED Evidence

1. Initial RED after adding portable `$262` and raw-root tests:

```bash
node test/run-node.js test/test262-host-bindings.test.js test/test262-runner.test.js
```

Result: failed as expected because the installer did not construct `$262`.
Representative failures:

- `installed $262 uses realm-owned branding prototypes and descriptors`: expected installed host object behavior, got absent `$262`.
- `raw roots receive host bindings but no harness`: `raw-host-bindings.js|raw|failed|unexpected-throw` instead of pass.

2. Review-driven RED for non-parser host `SyntaxError` handling:

```bash
node test/run-node.js test/test262-host-bindings.test.js
```

Result: failed as expected:

- `evalScript rethrows non-parser host SyntaxError failures`: `Expected host SyntaxError to escape by identity`.

## GREEN / Verification Evidence

Targeted Node portable suite:

```bash
node test/run-node.js test/test262-host-bindings.test.js test/test262-runner.test.js test/module-test262.test.js
```

Result: pass. All host-binding, runner, and module-ordering tests passed.

Targeted browser portable suite:

```bash
npm run test:browser -- test/test262-host-bindings.test.js test/test262-runner.test.js test/module-test262.test.js
```

Result: pass. All targeted tests passed in browser after `vendor:sync`.

Exact H0 command:

```bash
TZ=UTC npm run test262:cross-realm
```

Result: failed after the artifact check passed. The focused H0 runner still reports `total=267`, `skipped=0`, but only `passed=79`, `failed=188` across `95` roots. No failure was `$262` missing or harness leakage.

Changed-file quality checks used after review feedback:

```bash
npx prettier --check test/test262-host-bindings.test.js test/module-test262.test.js test/test262-runner.test.js tools/test262/engine.js test/suites.js tools/test262/runner.js
npm run typecheck -- --pretty false
ESLINT_USE_FLAT_CONFIG=true npx eslint test/test262-host-bindings.test.js test/module-test262.test.js test/test262-runner.test.js tools/test262/engine.js test/suites.js tools/test262/runner.js
```

Result: pass after formatting.

## Focused H0 Reclassification Observations

The H0 expectation of all 267 variants passing conflicts with broader pre-existing runtime gaps. A follow-up summary over the same 135 roots observed:

- `56` variants / `28` roots: `expression is not a function`
- `52` variants / `26` roots: `OProxy is not a constructor`
- `18` variants / `9` roots: `Cannot convert null or undefined`
- `10` variants / `5` roots: `testTypedArray.js` harness include threw `Float64Array is not defined`
- `10` variants / `5` roots: `Proxy is not defined`
- Remaining failures include RegExp cross-Realm error-constructor identity, missing `ArrayBuffer`, `Map`, `Set`, `WeakMap`, `WeakSet`, constructor/function gaps, and one duplicate lexical declaration case.

Per the brief, I did not broaden runtime scope to repair these B0/B2/later-feature failures.

## Self-Review

- Public API leakage: `createRealm()` still reports `typeof $262 === 'undefined'` unless the Test262 engine installer runs.
- Same-Agent recursion: child/grandchild Realms share `Symbol.iterator` and `Symbol.for('h0')` while owning distinct globals and intrinsic prototypes.
- Descriptors/branding: tests assert global `$262`, host properties, function `name`/`length`, prototypes, and excluded hooks.
- `evalScript`: validates primitive strings only, does not coerce guest objects, preserves guest thrown identity, uses owning-Realm guest TypeError/SyntaxError/runtime Error, and rethrows non-parser host `SyntaxError` by identity.
- Raw/module behavior: raw script and raw module roots get `$262` but no harness.
- Review fixes: added parent/grandchild coverage, explicit `undefined` coverage, parent runtime Error ownership, non-parser host `SyntaxError` regression, formatting, type typedef, and lint/typecheck cleanup.

## Concerns

The exact H0 corpus remains red due unrelated runtime gaps, especially Proxy/TypedArray/ArrayBuffer/null-conversion and collection constructors. No `$262`-specific concerns remain from targeted verification.
