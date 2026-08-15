# ES2015 generators final fix report

Base review head: `bc067cff25ab6830f3df0f36d7c7258b4c0ca7e7`

## RED

### 1. Annex B block-generator aliases

Tests were added before production edits and failed as follows:

- `node test/run-node.js test/static-semantics.test.js`: expected
  `["ordinary"]`, received `["ordinary","generator"]`.
- `node test/run-node.js test/lexical-declarations.test.js`: global scope
  expected `function:1:undefined`, received `function:1:function`; ordinary
  function scope expected `function:2:undefined`, received
  `function:2:function`.
- `node test/run-node.js test/generator-runtime.test.js`: generator function
  scope expected `function:3:undefined`, received `function:3:function`.
- `node test/run-node.js test/eval.test.js`: direct eval expected
  `function:4:undefined`, received `function:4:function`.

Each runtime case also calls the declaration inside its block, proving the
lexical block binding remains usable.

### 2. Bound generator function prototype

`node test/run-node.js test/generator-runtime.test.js` expected
`true:true:[object GeneratorFunction]:bound source:1:false:9:TypeError` but
received
`false:false:[object Function]:bound source:1:false:9:TypeError`.

The ordinary/class/rebound preservation regression passed before the production
edit, confirming existing call, construction, `instanceof`, length, and name
behavior.

### 3. Labelled generator custom AST

`node test/run-node.js test/parser.test.js` failed with
`Expected function to throw SyntaxError` for the sloppy labelled generator AST.
The test also covers a strict labelled generator, preserves acceptance of a
sloppy labelled ordinary function, and preserves rejection of its strict
counterpart.

## Changes

- Annex B B.3.3 eligibility now excludes generator `FunctionDeclaration`
  nodes while leaving ordinary block-function aliases unchanged.
- `BoundFunction` now adopts the target callable's internal prototype. Its
  existing owning Realm, restricted properties, length/name calculation,
  call/construct delegation, and iterative `getFunctionRealm` behavior remain
  unchanged.
- The statement-position early-error pass now rejects labelled generator
  declarations regardless of strictness while retaining sloppy Annex B labelled
  ordinary functions.

## GREEN

All commands passed:

- `TZ=UTC node test/run-node.js test/parser.test.js test/static-semantics.test.js test/lexical-declarations.test.js test/generator-runtime.test.js test/generator-yield.test.js test/generator-control-flow.test.js test/generator-delegation.test.js test/generator-function.test.js test/generator-stack.test.js test/function-builtins.test.js test/function-realm.test.js test/functions.test.js test/function-parameters.test.js test/dynamic-function.test.js test/eval.test.js`
- `TZ=UTC node test/run-node.js test/ci/es2015-generator-test262.test.js`
- `TZ=UTC npm run test:node`
- `TZ=UTC npm run test:browser`
- `PATH="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" TZ=UTC npm run test:jsc`
- `TZ=UTC npm run test262:fixtures`
- `npm run typecheck`
- `npm run lint`
- `npm run format`
- `npm run ci:check`
- `npm run vendor:check`
- `git diff --check`

No broad upstream Test262 run or report generation was performed.

## Commit

This report is included in the single fix-wave commit:

`fix: align generator function edge semantics`

with trailer:

`Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`

## Self-review

- The diff is limited to the three reviewed production sites, focused
  regressions, and this report.
- Generator alias tests cover global, ordinary-function, generator-function,
  and direct-eval declaration instantiation paths.
- Bound tests cover generator lineage/tag/call/non-construction plus preserved
  ordinary, class, rebound, and Realm-recursion behavior.
- Parser tests exercise both strictness modes through the custom-AST boundary.
- No dependency, async, or module behavior changed.

## Concerns

None. The full Node run emitted its existing optional “jsc shell unavailable”
diagnostics under the default PATH; the dedicated full JSC run passed with the
required macOS helper PATH.
