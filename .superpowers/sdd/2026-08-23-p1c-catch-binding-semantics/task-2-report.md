# Task 2 Report

## Status

Done.

## Base

`528eb3a873a906d8f65d9744c5ecbda2a653ba7b`

## Files

- `src/parser.js`
- `test/parser.test.js`
- `.superpowers/sdd/2026-08-23-p1c-catch-binding-semantics/task-2-report.md`

## RED

```sh
TZ=UTC node test/run-node.js test/parser.test.js
```

Failed with:

```txt
{"name":"catch parameters admit ES2015 array and object binding patterns","status":"failed","error":{"name":"SyntaxError","message":"destructuring patterns are not supported in this context"}}
{"name":"custom and reusable catch parameters accept only ES2015 catch binding forms","status":"failed","error":{"name":"SyntaxError","message":"CatchClause.param has an unsupported evaluator child"}}
```

## GREEN

```sh
TZ=UTC node test/run-node.js test/parser.test.js
node test/run-browser-playwright.js test/parser.test.js
npx eslint src/parser.js test/parser.test.js
npx prettier --check src/parser.js test/parser.test.js
git diff --check
```

All focused parser/static checks passed after formatting `test/parser.test.js`
with:

```sh
npx prettier --write src/parser.js test/parser.test.js
```

## Logs

- `80`: RED node parser suite failed for the expected catch-binding admissions.
- `83`: Prettier check failed on `test/parser.test.js`.
- `84`: Prettier rewrote `test/parser.test.js`.
- `85`: Fresh node/browser/eslint/prettier/diff verification passed.

## Commit

`feat: admit ES2015 catch binding patterns`

## Self-review

- `CatchClause.param` now receives binding `patternContext`, with identifier
  leaves gated on the expression-position path and structural
  `ObjectPattern`/`ArrayPattern` nodes gated on the non-expression pattern
  path.
- Custom/reusable AST validation admits only `Identifier`, `ObjectPattern`,
  and `ArrayPattern` at the top-level catch parameter and still rejects hostile
  `AssignmentPattern`, `RestElement`, `MemberExpression`, `Literal`, and
  `null` catch params.
- Focused tests cover source/custom/reusable parity, strict `eval`/`arguments`,
  cross-property duplicates, lexical collisions with the catch body, and
  rejection of ES2016 rest-binding-pattern widening.
- No evaluator, runtime, tooling, or authority code changed.

## Concerns

None.

## Fix Round 1

Quality review found a regression in the new `RestElement` direct-argument
check: assignment-context array rest targets were being narrowed to identifiers,
which rejected valid ES2015 assignment forms. The fix keeps identifier-only
binding rest arguments while restoring assignment-context
`MemberExpression`/`ObjectPattern`/`ArrayPattern` admission.

### RED

```sh
TZ=UTC node test/run-node.js test/parser.test.js
```

Failed with:

```txt
{"name":"rest element arguments distinguish assignment targets from catch binding patterns","status":"failed","error":{"name":"SyntaxError","message":"rest elements are not supported in this context"}}
```

### GREEN

```sh
TZ=UTC node test/run-node.js test/parser.test.js
node test/run-browser-playwright.js test/parser.test.js
npx eslint src/parser.js test/parser.test.js
npx prettier --check src/parser.js test/parser.test.js
git diff --check
```

All focused parser/static checks passed after formatting `test/parser.test.js`
with:

```sh
npx prettier --write test/parser.test.js
```

### Logs

- `150`: direct reproduction showed the regression on
  `[a, ...target.value] = arr;` and `[a, ...[value]] = arr;`, while
  `catch ([...[rest]])` remained rejected.
- `153`: RED parser suite failed on the new assignment-rest regression test.
- `156`: Prettier check failed on `test/parser.test.js`.
- `158`: Prettier rewrote `test/parser.test.js`.
- `159`: fresh node/browser/eslint/prettier/diff verification passed.

### Commit

`fix: preserve assignment rest targets`

### Self-review

- Added focused source/custom/reusable parser coverage for assignment-context
  rest arguments using `MemberExpression`, `ArrayPattern`, and `ObjectPattern`
  targets.
- Re-asserted that `catch ([...[rest]])` stays rejected for source and
  custom/reusable admission.
- Limited the parser change to `unsupportedEs2015Message` so binding rest
  elements remain identifier-only and no broader parser/runtime behavior moved.

### Concerns

None.
