# Generator CI selection fix report

## Status

**DONE**

Base and failed exact-SHA CI head:
`9ef11eca2b08b338fa547a33a5447aef64856769`.

Failed run:
<https://github.com/yoonbuck/jsjs/actions/runs/31873801486>.
`npm run test262:select:check` was the only failed job command; the other CI
jobs passed.

## RED

Focused tests were added before production edits:

```text
node test/run-node.js test/node/upstream-select.test.js
```

The existing structural-prefilter test passed. The new regressions failed for
the intended reason:

- Without `generators` in `expansionFeatures`, selection returned the ordinary
  known-good source plus generator declaration, computed object-generator, and
  computed class-generator sources; only the ordinary source was expected.
- A known-good test whose harness include contained `function*`/`yield` was
  selected; an empty selection was expected.
- The explicit `generators` opt-in test already passed, confirming that the RED
  isolated the missing policy boundary rather than parser support.

## Root cause

`tools/test262/upstream-select-paths.js` used production `parseScript` as the
broad selection grammar boundary. Layer-2 generator parser widening therefore
made exactly 10 known-good computed-property-name tests parse again even though
their metadata declares only `computed-property-names`.

Issue #25 introduced `expansionFeatures` so parser widening cannot silently
broaden the known-good selection. The current policy intentionally omits
`generators`; broad generator manifest, selection, report, and conformance
integration remains final release issue #61 work. Regenerating the broad subset
or report at Layer 2 would violate that boundary.

## Change

- `parsesUnderEngineGrammar` now receives the selection policy. It still parses
  with production `parseScript`, then treats generator syntax as outside the
  broad selection grammar unless `policy.expansionFeatures` contains the exact
  `generators` feature.
- Generator syntax is detected from the trusted Acorn AST with an iterative
  worklist. `generator: true` covers declarations, expressions, and object/class
  methods; `YieldExpression` covers yield-bearing syntax. No source regex or
  host recursion is used.
- Test-source and harness-include parsing receive the same policy boundary.
- Focused tests cover ordinary source, `function*` with `yield`, computed object
  and class generator methods, the explicit policy opt-in, and a generator
  harness include.
- Production `parseScript`, `tools/test262/es5-selection.json`, dependencies,
  async behavior, and module behavior are unchanged.

## GREEN

All requested commands passed:

- `node test/run-node.js test/node/upstream-select.test.js` — 4 passed.
- `TZ=UTC npm run test262:select:check` —
  `tools/test262/upstream-subset.json is current: 14096 paths across 55 groups`.
- `node test/run-node.js test/node/workflow-contract.test.js test/node/upstream-select.test.js test/es5-selection.test.js test/node/repository-invariants.test.js`.
- `TZ=UTC node test/run-node.js test/ci/es2015-generator-test262.test.js`.
- `npm run test:node`.
- `npm run test:browser`.
- `PATH="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" TZ=UTC npm run test:jsc`.
- `npm run test262:fixtures` — 15 passed, 1 expected unsupported-feature skip.
- `npm run typecheck`.
- `npm run lint`.
- `npm run format`.
- `npm run ci:check`.
- `npm run vendor:check`.
- `git diff --check`.

The protected artifacts remained byte-identical before and after the selection
check:

- `tools/test262/upstream-subset.json`:
  `8701e4b63fa491eb5ccdceb8e5dee8ed111f2d52`.
- `docs/test262-report.jsonl`:
  `e74310be5496f71ea67d2ce1ada773dd412896b5`.
- `docs/conformance.md`:
  `4c9aabd4f0d841e40164516404ae72402dcac5d1`.

No broad upstream run, subset generation, or report generation was performed.

## Commit

This report is included in the single fix commit:

`fix: defer broad generator Test262 selection`

with trailer:

`Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`

## Self-review

- The policy remains the single opt-in seam: adding `generators` in final
  integration admits the same parsed generator sources without another code
  change.
- The AST walk is iterative, reads only trusted Acorn nodes, and ignores
  comments and string contents.
- Both candidate test sources and precomputed harness include status use the
  same policy-aware parse function.
- Structural path filtering still occurs before source reads.
- The diff is limited to focused selector tests, selector tooling, and this
  report; broad manifests, reports, production parser/runtime code, and
  dependencies are untouched.

## Concerns

None.
