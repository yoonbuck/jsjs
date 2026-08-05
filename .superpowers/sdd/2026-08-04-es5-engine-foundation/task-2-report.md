# Task 2 Report

## Status
Done.

## RED

1. `node test/run-node.js test/parser.test.js`
   - Output: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module .../src/parser.js`
2. `node test/run-node.js test/runtime-records.test.js`
   - Output: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module .../src/runtime/completion.js`

## GREEN

1. `npm install --save-exact acorn@8.18.0`
2. `node test/run-node.js test/parser.test.js`
   - Output:
     - `{"name":"parseScript returns a script program","status":"passed"}`
     - `{"name":"parseScript normalizes syntax errors","status":"passed"}`
3. `node test/run-node.js test/runtime-records.test.js`
   - Output:
     - `{"name":"completion factories create explicit records","status":"passed"}`
     - `{"name":"references resolve and assign through getValue and putValue","status":"passed"}`
     - `{"name":"unresolvable references throw reference errors","status":"passed"}`
4. `npm run typecheck`
   - Output: `tsc -p jsconfig.json` completed with exit code 0.
5. `npm run lint`
   - Output: Prettier check passed.

## Files Changed

- `package.json`
- `package-lock.json`
- `src/parser.js`
- `src/runtime/completion.js`
- `src/runtime/errors.js`
- `src/runtime/reference.js`
- `test/parser.test.js`
- `test/runtime-records.test.js`

## Self-Review

- Parser wrapper now forces ES5 script parsing through Acorn and normalizes parser failures to `SyntaxError` with location fields.
- Completion records are explicit plain objects with stable `type` tags.
- References resolve against plain objects now and also allow future environment records with `getBindingValue` / `setMutableBinding`.
- Unresolvable references throw `ReferenceError` through the shared runtime error helper.

## Concerns

- None for this task. The only intentional coupling is the future environment-record protocol names used by `Reference`.

---

## Fix Round 1

### Status

Done.

### Findings Addressed

1. Parser boundary now validates parser output and still normalizes parser-thrown syntax errors.
2. Reference resolution now requires explicit engine-owned property/environment protocols and rejects bare host objects.

### RED

1. `node test/run-node.js test/parser.test.js`
   - Output:
     - `{"name":"parseScript returns a script program","status":"passed"}`
     - `{"name":"parseScript normalizes syntax errors","status":"passed"}`
     - `{"name":"parseScript validates parser output","status":"failed","error":{"name":"Error","message":"Expected function to throw TypeError"}}`
2. `node test/run-node.js test/runtime-records.test.js`
   - Output:
     - `{"name":"completion factories create explicit records","status":"passed"}`
     - `{"name":"references resolve and assign through the property-base protocol","status":"failed","error":{"name":"Error","message":"Expected undefined to be the same value as 2"}}`
     - `{"name":"references resolve and assign through environment records","status":"passed"}`
     - `{"name":"references reject bare host objects as bases","status":"failed","error":{"name":"Error","message":"Expected function to throw TypeError"}}`
     - `{"name":"unresolvable references throw reference errors","status":"passed"}`

### GREEN

1. `node test/run-node.js test/parser.test.js`
   - Output:
     - `{"name":"parseScript returns a script program","status":"passed"}`
     - `{"name":"parseScript normalizes syntax errors","status":"passed"}`
     - `{"name":"parseScript validates parser output","status":"passed"}`
2. `node test/run-node.js test/runtime-records.test.js`
   - Output:
     - `{"name":"completion factories create explicit records","status":"passed"}`
     - `{"name":"references resolve and assign through the property-base protocol","status":"passed"}`
     - `{"name":"references resolve and assign through environment records","status":"passed"}`
     - `{"name":"references reject bare host objects as bases","status":"passed"}`
     - `{"name":"unresolvable references throw reference errors","status":"passed"}`

### CHECK

1. `npm run typecheck`
   - Output:
     - `> typecheck`
     - `> tsc -p jsconfig.json`
2. `npm run lint`
   - Output:
     - `> lint`
     - `> ESLINT_USE_FLAT_CONFIG=true eslint . && prettier --check package.json jsconfig.json eslint.config.js .prettierrc.json test/*.js test/harness/*.js types/*.d.ts`
     - `Checking formatting...`
     - `All matched files use Prettier code style!`

### Files Changed In Fix Round

- `src/parser.js`
- `src/runtime/reference.js`
- `test/parser.test.js`
- `test/runtime-records.test.js`

### Concerns

- None.

### Code Review Follow-Up

Reviewer flagged one important parser-boundary issue: injected parser seams were having non-syntax host failures normalized into guest-facing `SyntaxError`s. Fixed by rethrowing non-syntax failures unchanged and adding a focused regression test.

#### RED

1. `node test/run-node.js test/parser.test.js`
   - Output:
     - `{"name":"parseScript returns a script program","status":"passed"}`
     - `{"name":"parseScript normalizes syntax errors","status":"passed"}`
     - `{"name":"parseScript validates parser output","status":"passed"}`
     - `{"name":"parseScript rethrows non-syntax parser failures unchanged","status":"failed","error":{"name":"Error","message":"Expected TypeError but got SyntaxError"}}`

#### GREEN

1. `node test/run-node.js test/parser.test.js`
   - Output:
     - `{"name":"parseScript returns a script program","status":"passed"}`
     - `{"name":"parseScript normalizes syntax errors","status":"passed"}`
     - `{"name":"parseScript validates parser output","status":"passed"}`
     - `{"name":"parseScript rethrows non-syntax parser failures unchanged","status":"passed"}`

#### CHECK

1. `node test/run-node.js test/parser.test.js && node test/run-node.js test/runtime-records.test.js && npm run typecheck && npm run lint`
   - Output:
     - `{"name":"parseScript returns a script program","status":"passed"}`
     - `{"name":"parseScript normalizes syntax errors","status":"passed"}`
     - `{"name":"parseScript validates parser output","status":"passed"}`
     - `{"name":"parseScript rethrows non-syntax parser failures unchanged","status":"passed"}`
     - `{"name":"completion factories create explicit records","status":"passed"}`
     - `{"name":"references resolve and assign through the property-base protocol","status":"passed"}`
     - `{"name":"references resolve and assign through environment records","status":"passed"}`
     - `{"name":"references reject bare host objects as bases","status":"passed"}`
     - `{"name":"unresolvable references throw reference errors","status":"passed"}`
     - `> typecheck`
     - `> tsc -p jsconfig.json`
     - `> lint`
     - `> ESLINT_USE_FLAT_CONFIG=true eslint . && prettier --check package.json jsconfig.json eslint.config.js .prettierrc.json test/*.js test/harness/*.js types/*.d.ts`
     - `Checking formatting...`
     - `All matched files use Prettier code style!`

### Code Review Follow-Up 2

Reviewer flagged one more parser-boundary edge case: object-style syntax failures from an injected parser seam were being normalized with the wrong message text. Fixed by teaching `normalizeSyntaxError` to preserve string-valued `message` fields from object-like parser failures and adding a focused regression test.

#### RED

1. `node test/run-node.js test/parser.test.js`
   - Output:
     - `{"name":"parseScript returns a script program","status":"passed"}`
     - `{"name":"parseScript normalizes syntax errors","status":"passed"}`
     - `{"name":"parseScript validates parser output","status":"passed"}`
     - `{"name":"parseScript rethrows non-syntax parser failures unchanged","status":"passed"}`
     - `{"name":"parseScript preserves object-style syntax failure messages","status":"failed","error":{"name":"Error","message":"Expected \"[object Object]\" to be the same value as \"bad syntax\""}}`

#### GREEN

1. `node test/run-node.js test/parser.test.js`
   - Output:
     - `{"name":"parseScript returns a script program","status":"passed"}`
     - `{"name":"parseScript normalizes syntax errors","status":"passed"}`
     - `{"name":"parseScript validates parser output","status":"passed"}`
     - `{"name":"parseScript rethrows non-syntax parser failures unchanged","status":"passed"}`
     - `{"name":"parseScript preserves object-style syntax failure messages","status":"passed"}`

#### CHECK

1. `node test/run-node.js test/parser.test.js && node test/run-node.js test/runtime-records.test.js && npm run typecheck && npm run lint`
   - Output:
     - `{"name":"parseScript returns a script program","status":"passed"}`
     - `{"name":"parseScript normalizes syntax errors","status":"passed"}`
     - `{"name":"parseScript validates parser output","status":"passed"}`
     - `{"name":"parseScript rethrows non-syntax parser failures unchanged","status":"passed"}`
     - `{"name":"parseScript preserves object-style syntax failure messages","status":"passed"}`
     - `{"name":"completion factories create explicit records","status":"passed"}`
     - `{"name":"references resolve and assign through the property-base protocol","status":"passed"}`
     - `{"name":"references resolve and assign through environment records","status":"passed"}`
     - `{"name":"references reject bare host objects as bases","status":"passed"}`
     - `{"name":"unresolvable references throw reference errors","status":"passed"}`
     - `> typecheck`
     - `> tsc -p jsconfig.json`
     - `> lint`
     - `> ESLINT_USE_FLAT_CONFIG=true eslint . && prettier --check package.json jsconfig.json eslint.config.js .prettierrc.json test/*.js test/harness/*.js types/*.d.ts`
     - `Checking formatting...`
     - `All matched files use Prettier code style!`
