# Task 2 Report: Destructuring Declarations, Assignment, and Loop Bindings

## Implementation

- Added shared property-name evaluation with single evaluation of computed keys,
  `ToPropertyKey`, and explicit unsupported literal handling.
- Added shared recursive pattern semantics for lexical initialization, delayed
  `var` binding resolution, and assignment-target references.
- Implemented object and iterator-driven array patterns, holes, array rest,
  defaults, nested patterns, primitive `GetV` receivers, inferred anonymous
  function names, stack accounting, realm-owned rest arrays, and IteratorClose
  precedence.
- Wired patterns into `var`/`let`/`const`, destructuring assignment, classic
  `for`, `for-in`, and `for-of`, including lexical per-iteration environments.
- Made the iterative parser gate context- and occurrence-aware. Declaration,
  assignment, and loop patterns are enabled; parameter patterns, object rest,
  invalid targets, and invalid rest/default placement remain rejected.

## Files

- Created `src/evaluator/patterns.js`
- Created `src/evaluator/property-name.js`
- Modified `src/parser.js`
- Modified `src/evaluator/declarations.js`
- Modified `src/evaluator/expressions.js`
- Modified `src/evaluator/statements.js`
- Created `test/destructuring.test.js`
- Modified `test/parser.test.js`
- Modified `test/evaluator-expressions.test.js`
- Modified `test/suites.js`

## RED Evidence

Command:

```text
node test/run-node.js test/destructuring.test.js
```

Output (exit 1):

```text
{"name":"object declarations read properties left to right and default only undefined","status":"failed","error":{"name":"SyntaxError","message":"destructuring patterns are not supported"}}
{"name":"an array declaration consumes its iterator once and closes on early completion","status":"failed","error":{"name":"SyntaxError","message":"destructuring patterns are not supported"}}
{"name":"nested patterns, holes, array rest, and computed object keys compose","status":"failed","error":{"name":"SyntaxError","message":"destructuring patterns are not supported"}}
{"name":"destructuring assignment returns its right value and supports member targets","status":"failed","error":{"name":"SyntaxError","message":"destructuring patterns are not supported"}}
{"name":"var let and const declarations initialize every bound name","status":"failed","error":{"name":"SyntaxError","message":"destructuring patterns are not supported"}}
{"name":"classic for, for-in, and for-of heads support binding patterns","status":"failed","error":{"name":"SyntaxError","message":"destructuring patterns are not supported"}}
{"name":"lexical for-of patterns create fresh per-iteration bindings","status":"failed","error":{"name":"SyntaxError","message":"destructuring patterns are not supported"}}
{"name":"a binding throw closes the iterator and wins over a throwing return","status":"failed","error":{"name":"SyntaxError","message":"destructuring patterns are not supported"}}
```

Review findings were also reproduced RED before fixes:

- assignment target/source ordering: expected `target,next`, got `next,target`;
- anonymous default names: expected names, got `::`;
- primitive receiver: expected `string`, got `object`;
- delayed `var` resolution: expected `false:undefined:value`, got
  `true:value:global`;
- invalid custom pattern/default/rest occurrences were accepted instead of
  throwing `SyntaxError`.

## GREEN Evidence

Required focused command:

```text
node test/run-node.js test/destructuring.test.js test/lexical-declarations.test.js test/for-of.test.js test/parser.test.js test/static-semantics.test.js
```

Output: 178 JSON test records with `"status":"passed"`, 0 failed; exit 0.

```text
npm run typecheck
```

Output (exit 0):

```text
> typecheck
> tsc -p jsconfig.json
```

```text
npm run lint -- --quiet
```

Output (exit 0):

```text
> lint
> ESLINT_USE_FLAT_CONFIG=true eslint . --quiet
```

```text
git diff --check
```

Output: empty; exit 0.

Additional full Node verification:

```text
node test/run-node.js
```

Output: 1564 passed, 0 failed; exit 0.

## Self-Review

- Confirmed right-side single evaluation, property/target ordering, defaults only
  for `undefined`, inferred names, TDZ behavior, loop capture behavior, and
  delayed `var` resolution under `with`.
- Confirmed IteratorClose on normal early completion and binding errors,
  original-error precedence, and no close for IteratorStep/IteratorValue errors.
- Confirmed rest arrays use the active realm's `%Array.prototype%`.
- Confirmed parser context does not enable parameter patterns or object rest and
  distinguishes repeated custom-AST nodes by occurrence.
- Two fresh specification/quality review passes found and drove regression fixes;
  a final quality review found no significant issues.

## Concerns

- JavaScriptCore is not installed in this environment, so the optional JSC
  entry-point contract checks emitted availability warnings during the full Node
  suite. The required portable focused suite and all Node checks passed.

## Fix Round 1

### Changed Files

- Modified `src/parser.js`
- Modified `test/parser.test.js`
- Modified
  `.superpowers/sdd/2026-08-12-es2015-syntax-features/task-2-report.md`

### RED

Command:

```text
node test/run-node.js test/parser.test.js
```

Relevant output (exit 1):

```text
{"name":"custom object patterns reject a bare identifier property entry","status":"failed","error":{"name":"Error","message":"Expected function to throw SyntaxError"}}
{"name":"custom object patterns reject a nested pattern property entry","status":"failed","error":{"name":"Error","message":"Expected function to throw SyntaxError"}}
{"name":"custom object patterns reject a noncomputed expression key","status":"failed","error":{"name":"Error","message":"Expected function to throw SyntaxError"}}
```

### GREEN

Command:

```text
node test/run-node.js test/parser.test.js test/destructuring.test.js
```

Output: 62 JSON test records with `"status":"passed"`, 0 failed; exit 0.

```text
npm run typecheck
```

Output (exit 0):

```text
> typecheck
> tsc -p jsconfig.json
```

```text
npm run lint -- --quiet
```

Output (exit 0):

```text
> lint
> ESLINT_USE_FLAT_CONFIG=true eslint . --quiet
```

```text
git diff --check
```

Output: empty; exit 0.

### Commit

- `fix: validate object pattern property shapes` (this commit)

### Self-Review

- Confirmed `ObjectPattern.properties` accepts only `Property` entries.
- Confirmed noncomputed keys accept only identifier and literal property names,
  while computed expression keys remain supported.
- Confirmed ordinary object-expression property validation is unchanged.
- Confirmed the existing real-syntax destructuring and computed-key regressions
  remain green.

### Concerns

- None.
