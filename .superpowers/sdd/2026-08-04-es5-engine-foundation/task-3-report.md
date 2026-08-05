# Task 3 Report: Objects, descriptors, and abstract operations

## Summary
Implemented engine-owned property descriptors, `EngineObject`, conversion helpers, and abstract operations for equality, arithmetic, and relational comparison with focused TDD coverage.

## Files
- `src/runtime/descriptors.js`
- `src/runtime/object.js`
- `src/runtime/conversion.js`
- `src/runtime/operators.js`
- `test/objects.test.js`
- `test/abstract-operations.test.js`

## RED
### Missing-module verification
Command:
```sh
node test/run-node.js test/objects.test.js ; node test/run-node.js test/abstract-operations.test.js
```
Output:
```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/jordan/hack/copilot/copilot-worktrees/jsjs/yoonbuck-miniature-succotash/src/runtime/descriptors.js' imported from /Users/jordan/hack/copilot/copilot-worktrees/jsjs/yoonbuck-miniature-succotash/test/objects.test.js
    at finalizeResolution (node:internal/modules/esm/resolve:272:11)
    at moduleResolve (node:internal/modules/esm/resolve:879:10)
    at defaultResolve (node:internal/modules/esm/resolve:1006:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:708:20)
    at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:728:38)
    at ModuleLoader.resolveSync (node:internal/modules/esm/loader:766:56)
    at #resolve (node:internal/modules/esm/loader:690:17)
    at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:610:35)
    at ModuleJob.syncLink (node:internal/modules/esm/module_job:277:33)
    at ModuleJob.link (node:internal/modules/esm/module_job:389:17)
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/jordan/hack/copilot/copilot-worktrees/jsjs/yoonbuck-miniature-succotash/src/runtime/conversion.js' imported from /Users/jordan/hack/copilot/copilot-worktrees/jsjs/yoonbuck-miniature-succotash/test/abstract-operations.test.js
    at finalizeResolution (node:internal/modules/esm/resolve:272:11)
    at moduleResolve (node:internal/modules/esm/resolve:879:10)
    at defaultResolve (node:internal/modules/esm/resolve:1006:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:708:20)
    at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:728:38)
    at ModuleLoader.resolveSync (node:internal/modules/esm/loader:766:56)
    at #resolve (node:internal/modules/esm/loader:690:17)
    at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:610:35)
    at ModuleJob.syncLink (node:internal/modules/esm/module_job:277:33)
    at ModuleJob.link (node:internal/modules/esm/module_job:389:17)
```

### Coupled follow-up RED for own-accessor mutation
Command:
```sh
node test/run-node.js test/objects.test.js
```
Output:
```text
{"name":"descriptor helpers classify descriptors and reject mixed accessors","status":"passed"}
{"name":"engine objects provide the property-reference protocol","status":"passed"}
{"name":"engine objects preserve insertion order and walk their prototype chain","status":"passed"}
{"name":"non-configurable data properties reject incompatible changes","status":"passed"}
{"name":"put respects inherited writability and inherited setters","status":"passed"}
{"name":"put invokes own accessors and rejects getter-only assignments","status":"failed","error":{"name":"Error","message":"Expected \"unset\" to be the same value as \"9\""}}
```

## GREEN
### Initial implementation green
Command:
```sh
node test/run-node.js test/objects.test.js && node test/run-node.js test/abstract-operations.test.js
```
Output:
```text
{"name":"descriptor helpers classify descriptors and reject mixed accessors","status":"passed"}
{"name":"engine objects provide the property-reference protocol","status":"passed"}
{"name":"engine objects preserve insertion order and walk their prototype chain","status":"passed"}
{"name":"non-configurable data properties reject incompatible changes","status":"passed"}
{"name":"put respects inherited writability and inherited setters","status":"passed"}
{"name":"toPrimitive honors preferred types and rejects non-primitive results","status":"passed"}
{"name":"conversion operations cover NaN signed zero and nullish coercion","status":"passed"}
{"name":"equality operations follow strict and abstract comparison rules","status":"passed"}
{"name":"arithmetic operators use primitive coercion rules","status":"passed"}
{"name":"abstract relational comparison preserves coercion order and NaN behavior","status":"passed"}
```

### Own-accessor fix green
Command:
```sh
node test/run-node.js test/objects.test.js
```
Output:
```text
{"name":"descriptor helpers classify descriptors and reject mixed accessors","status":"passed"}
{"name":"engine objects provide the property-reference protocol","status":"passed"}
{"name":"engine objects preserve insertion order and walk their prototype chain","status":"passed"}
{"name":"non-configurable data properties reject incompatible changes","status":"passed"}
{"name":"put respects inherited writability and inherited setters","status":"passed"}
{"name":"put invokes own accessors and rejects getter-only assignments","status":"passed"}
```

## CHECK
Command:
```sh
for file in test/*.test.js; do node test/run-node.js "$file" || exit 1; done && npm run typecheck && npm run lint
```
Output:
```text
{"name":"toPrimitive honors preferred types and rejects non-primitive results","status":"passed"}
{"name":"conversion operations cover NaN signed zero and nullish coercion","status":"passed"}
{"name":"equality operations follow strict and abstract comparison rules","status":"passed"}
{"name":"arithmetic operators use primitive coercion rules","status":"passed"}
{"name":"abstract relational comparison preserves coercion order and NaN behavior","status":"passed"}
{"name":"assertSame uses same-value semantics","status":"passed"}
{"name":"foundation harness reports deterministic json","status":"passed"}
{"name":"descriptor helpers classify descriptors and reject mixed accessors","status":"passed"}
{"name":"engine objects provide the property-reference protocol","status":"passed"}
{"name":"engine objects preserve insertion order and walk their prototype chain","status":"passed"}
{"name":"non-configurable data properties reject incompatible changes","status":"passed"}
{"name":"put respects inherited writability and inherited setters","status":"passed"}
{"name":"put invokes own accessors and rejects getter-only assignments","status":"passed"}
{"name":"parseScript returns a script program","status":"passed"}
{"name":"parseScript normalizes syntax errors","status":"passed"}
{"name":"parseScript validates parser output","status":"passed"}
{"name":"parseScript rethrows non-syntax parser failures unchanged","status":"passed"}
{"name":"parseScript preserves object-style syntax failure messages","status":"passed"}
{"name":"completion factories create explicit records","status":"passed"}
{"name":"references resolve and assign through the property-base protocol","status":"passed"}
{"name":"references resolve and assign through environment records","status":"passed"}
{"name":"references reject bare host objects as bases","status":"passed"}
{"name":"unresolvable references throw reference errors","status":"passed"}

> typecheck
> tsc -p jsconfig.json


> lint
> ESLINT_USE_FLAT_CONFIG=true eslint . && prettier --check package.json jsconfig.json eslint.config.js .prettierrc.json test/*.js test/harness/*.js types/*.d.ts

Checking formatting...
All matched files use Prettier code style!
```

## Self-review
- `EngineObject` keeps ordered own properties in private `Map` storage and never relies on host object prototypes for guest lookup semantics.
- Property reads/writes route through named operations (`get`, `put`, `defineOwnProperty`, `delete`) and expose the Task 2 property-reference protocol via `getReferencedValue`/`setReferencedValue`.
- Descriptor validation rejects mixed data/accessor descriptors and enforces key non-configurable restrictions covered by tests.
- Conversion and operator helpers cover requested edge cases: `NaN`, signed zero, null/undefined coercion failures, string/number coercion, abstract equality, arithmetic, and relational ordering.
- Added a follow-up regression for own accessor assignment after self-review uncovered a coupled mutation bug.

## Concerns
- Scope is intentionally narrow to current tests: object coercion supports engine-owned objects, not arbitrary host objects or future guest built-ins.
- No additional concerns after final verification.

## Round 1 Fix
### Summary
- Added focused regression coverage for non-configurable `enumerable` changes, engine-only coercion rejecting host values, and `abstractRelationalComparison(..., false)` evaluation order.
- Refactored `abstractRelationalComparison` to use explicit `if`/`else` coercion ordering without changing behavior.
- Left the duplicated `isPrimitive` helper untouched in this round.

### RED / coverage-first
Command:
```sh
node test/run-node.js test/objects.test.js && node test/run-node.js test/abstract-operations.test.js
```
Output:
```text
{"name":"descriptor helpers classify descriptors and reject mixed accessors","status":"passed"}
{"name":"engine objects provide the property-reference protocol","status":"passed"}
{"name":"engine objects preserve insertion order and walk their prototype chain","status":"passed"}
{"name":"non-configurable data properties reject incompatible changes","status":"passed"}
{"name":"non-configurable properties reject enumerable changes","status":"passed"}
{"name":"put respects inherited writability and inherited setters","status":"passed"}
{"name":"put invokes own accessors and rejects getter-only assignments","status":"passed"}
{"name":"toPrimitive honors preferred types and rejects non-primitive results","status":"passed"}
{"name":"conversion operations cover NaN signed zero and nullish coercion","status":"passed"}
{"name":"toPrimitive rejects host wrappers arrays and plain objects","status":"passed"}
{"name":"equality operations follow strict and abstract comparison rules","status":"passed"}
{"name":"arithmetic operators use primitive coercion rules","status":"passed"}
{"name":"abstract relational comparison preserves left-first coercion order","status":"passed"}
{"name":"abstract relational comparison preserves right-first coercion order","status":"passed"}
{"name":"abstract relational comparison handles NaN and string comparison","status":"passed"}
```

### REFACTOR safety check
Command:
```sh
node test/run-node.js test/objects.test.js && node test/run-node.js test/abstract-operations.test.js
```
Output:
```text
{"name":"descriptor helpers classify descriptors and reject mixed accessors","status":"passed"}
{"name":"engine objects provide the property-reference protocol","status":"passed"}
{"name":"engine objects preserve insertion order and walk their prototype chain","status":"passed"}
{"name":"non-configurable data properties reject incompatible changes","status":"passed"}
{"name":"non-configurable properties reject enumerable changes","status":"passed"}
{"name":"put respects inherited writability and inherited setters","status":"passed"}
{"name":"put invokes own accessors and rejects getter-only assignments","status":"passed"}
{"name":"toPrimitive honors preferred types and rejects non-primitive results","status":"passed"}
{"name":"conversion operations cover NaN signed zero and nullish coercion","status":"passed"}
{"name":"toPrimitive rejects host wrappers arrays and plain objects","status":"passed"}
{"name":"equality operations follow strict and abstract comparison rules","status":"passed"}
{"name":"arithmetic operators use primitive coercion rules","status":"passed"}
{"name":"abstract relational comparison preserves left-first coercion order","status":"passed"}
{"name":"abstract relational comparison preserves right-first coercion order","status":"passed"}
{"name":"abstract relational comparison handles NaN and string comparison","status":"passed"}
```

### CHECK (intermediate)
Command:
```sh
npm run typecheck
```
Output:
```text
> typecheck
> tsc -p jsconfig.json

test/objects.test.js(150,18): error TS2532: Object is possibly 'undefined'.
```

Command:
```sh
npm run lint
```
Output:
```text
> lint
> ESLINT_USE_FLAT_CONFIG=true eslint . && prettier --check package.json jsconfig.json eslint.config.js .prettierrc.json test/*.js test/harness/*.js types/*.d.ts

Checking formatting...
[warn] test/objects.test.js
[warn] Code style issues found in the above file. Run Prettier with --write to fix.
```

### CHECK (final)
Command:
```sh
node test/run-node.js test/objects.test.js && node test/run-node.js test/abstract-operations.test.js && for file in test/*.test.js; do node test/run-node.js "$file" || exit 1; done && npm run typecheck && npm run lint
```
Output:
```text
{"name":"descriptor helpers classify descriptors and reject mixed accessors","status":"passed"}
{"name":"engine objects provide the property-reference protocol","status":"passed"}
{"name":"engine objects preserve insertion order and walk their prototype chain","status":"passed"}
{"name":"non-configurable data properties reject incompatible changes","status":"passed"}
{"name":"non-configurable properties reject enumerable changes","status":"passed"}
{"name":"put respects inherited writability and inherited setters","status":"passed"}
{"name":"put invokes own accessors and rejects getter-only assignments","status":"passed"}
{"name":"toPrimitive honors preferred types and rejects non-primitive results","status":"passed"}
{"name":"conversion operations cover NaN signed zero and nullish coercion","status":"passed"}
{"name":"toPrimitive rejects host wrappers arrays and plain objects","status":"passed"}
{"name":"equality operations follow strict and abstract comparison rules","status":"passed"}
{"name":"arithmetic operators use primitive coercion rules","status":"passed"}
{"name":"abstract relational comparison preserves left-first coercion order","status":"passed"}
{"name":"abstract relational comparison preserves right-first coercion order","status":"passed"}
{"name":"abstract relational comparison handles NaN and string comparison","status":"passed"}
{"name":"toPrimitive honors preferred types and rejects non-primitive results","status":"passed"}
{"name":"conversion operations cover NaN signed zero and nullish coercion","status":"passed"}
{"name":"toPrimitive rejects host wrappers arrays and plain objects","status":"passed"}
{"name":"equality operations follow strict and abstract comparison rules","status":"passed"}
{"name":"arithmetic operators use primitive coercion rules","status":"passed"}
{"name":"abstract relational comparison preserves left-first coercion order","status":"passed"}
{"name":"abstract relational comparison preserves right-first coercion order","status":"passed"}
{"name":"abstract relational comparison handles NaN and string comparison","status":"passed"}
{"name":"assertSame uses same-value semantics","status":"passed"}
{"name":"foundation harness reports deterministic json","status":"passed"}
{"name":"descriptor helpers classify descriptors and reject mixed accessors","status":"passed"}
{"name":"engine objects provide the property-reference protocol","status":"passed"}
{"name":"engine objects preserve insertion order and walk their prototype chain","status":"passed"}
{"name":"non-configurable data properties reject incompatible changes","status":"passed"}
{"name":"non-configurable properties reject enumerable changes","status":"passed"}
{"name":"put respects inherited writability and inherited setters","status":"passed"}
{"name":"put invokes own accessors and rejects getter-only assignments","status":"passed"}
{"name":"parseScript returns a script program","status":"passed"}
{"name":"parseScript normalizes syntax errors","status":"passed"}
{"name":"parseScript validates parser output","status":"passed"}
{"name":"parseScript rethrows non-syntax parser failures unchanged","status":"passed"}
{"name":"parseScript preserves object-style syntax failure messages","status":"passed"}
{"name":"completion factories create explicit records","status":"passed"}
{"name":"references resolve and assign through the property-base protocol","status":"passed"}
{"name":"references resolve and assign through environment records","status":"passed"}
{"name":"references reject bare host objects as bases","status":"passed"}
{"name":"unresolvable references throw reference errors","status":"passed"}

> typecheck
> tsc -p jsconfig.json


> lint
> ESLINT_USE_FLAT_CONFIG=true eslint . && prettier --check package.json jsconfig.json eslint.config.js .prettierrc.json test/*.js test/harness/*.js types/*.d.ts

Checking formatting...
All matched files use Prettier code style!
```

### Mutation-based RED proof for new coverage
Command:
```sh
node test/run-node.js test/objects.test.js
```
Output:
```text
{"name":"descriptor helpers classify descriptors and reject mixed accessors","status":"passed"}
{"name":"engine objects provide the property-reference protocol","status":"passed"}
{"name":"engine objects preserve insertion order and walk their prototype chain","status":"passed"}
{"name":"non-configurable data properties reject incompatible changes","status":"passed"}
{"name":"non-configurable properties reject enumerable changes","status":"failed","error":{"name":"Error","message":"Expected true to be the same value as false"}}
{"name":"put respects inherited writability and inherited setters","status":"passed"}
{"name":"put invokes own accessors and rejects getter-only assignments","status":"passed"}
```

Command:
```sh
node test/run-node.js test/abstract-operations.test.js
```
Output:
```text
{"name":"toPrimitive honors preferred types and rejects non-primitive results","status":"passed"}
{"name":"conversion operations cover NaN signed zero and nullish coercion","status":"passed"}
{"name":"toPrimitive rejects host wrappers arrays and plain objects","status":"failed","error":{"name":"Error","message":"Expected function to throw TypeError"}}
{"name":"equality operations follow strict and abstract comparison rules","status":"passed"}
{"name":"arithmetic operators use primitive coercion rules","status":"passed"}
{"name":"abstract relational comparison preserves left-first coercion order","status":"passed"}
{"name":"abstract relational comparison preserves right-first coercion order","status":"passed"}
{"name":"abstract relational comparison handles NaN and string comparison","status":"passed"}
```

Command:
```sh
node test/run-node.js test/abstract-operations.test.js
```
Output:
```text
{"name":"toPrimitive honors preferred types and rejects non-primitive results","status":"passed"}
{"name":"conversion operations cover NaN signed zero and nullish coercion","status":"passed"}
{"name":"toPrimitive rejects host wrappers arrays and plain objects","status":"passed"}
{"name":"equality operations follow strict and abstract comparison rules","status":"passed"}
{"name":"arithmetic operators use primitive coercion rules","status":"passed"}
{"name":"abstract relational comparison preserves left-first coercion order","status":"passed"}
{"name":"abstract relational comparison preserves right-first coercion order","status":"failed","error":{"name":"Error","message":"Expected \"[\\\"left\\\",\\\"right\\\"]\" to be the same value as \"[\\\"right\\\",\\\"left\\\"]\""}}
{"name":"abstract relational comparison handles NaN and string comparison","status":"passed"}
```
