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
