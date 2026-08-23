# P1C Catch Binding Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admit Sixth Edition destructuring catch parameters, share their binding initialization across the synchronous and generator evaluators, and promote the exact P1C 81-root / 161-variant Test262 ledger through the existing roadmap authority.

**Architecture:** `src/parser.js` admits only the ES2015 `CatchParameter` forms and preserves source/custom/reusable AST early errors. A new `src/evaluator/catch-binding.js` creates the catch parameter environment and performs shared `BoundNames` plus `BindingInitialization`; the synchronous and generator evaluators retain their own completion adapters around that one throwing kernel. A contained P1C runner produces generic six-file authority evidence and a named promotion-v2 group without importing broad Test262 entry points.

**Tech Stack:** Plain ECMAScript modules with strict JSDoc/checkJs, the existing Acorn ES6 parser boundary, declarative environment records, the repository's portable Node/Chromium/JavaScriptCore suite, pinned Test262 `b363f29d3c43c626dc852744ad64a0b48a003693`, generic named promotion schema v2, roadmap authority schema v3, GitHub Actions, GitHub CLI, and CodeQL.

**Spec:** `docs/superpowers/specs/2026-08-23-p1-early-errors-decomposition-design.md`

**Issue:** [#116](https://github.com/yoonbuck/jsjs/issues/116), native child of
[#78](https://github.com/yoonbuck/jsjs/issues/78)

## Global Constraints

- This plan amendment starts from reviewed plan HEAD `a5e119470e32323df50c1b86c5fd76bb49dcf8fb`. The implementation branch must retain the final committed revision of this plan as an ancestor.
- Implement only P1C. Do not implement or prepare P1F, P1G, P1R, P1T, P1A, P1X, later grammar, or any partition-changing taxonomy work.
- The exact P1C source ledger is 81 roots / 161 variants, SHA-256 `e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5`.
- GitHub issue #116 is the immutable P1C issue identity. Its exact title is `Implement ES2015 destructuring catch parameters and catch environments`; its native parent is open issue #78, `Complete core ES2015 early errors and declaration instantiation`.
- `P1C_PARENT_ISSUE = 78` describes the native sub-issue relationship. The roadmap authority schema continues to use `parentIssue: 70`, matching H0/M0/M1 and the core roadmap root.
- Task 1 adds durable tracked source ledger `tools/test262/es2015-p1c-paths.txt`. It must byte-match ignored reviewed ledger `.superpowers/sdd/2026-08-23-p1-decomposition/ledgers/P1C-catch-binding-environments.paths.txt` and the exact SHA above.
- The ledger contains 78 generated catch-destructuring roots / 156 variants and 3 catch-scope roots / 5 variants. Exactly one root is `noStrict`; the other 80 roots produce non-strict and strict variants.
- The pinned inventory contains these metadata-feature occurrences: `destructuring-binding` 78, `generators` 12, `Symbol.iterator` 9, `let` 1, and two roots with no metadata feature. Feature arrays overlap; these are occurrence counts, not root partitions.
- Exactly one root includes `compareArray.js`; all 81 complete transitive include-feature closures are empty. Derive this from pinned `harness/features.yml`; never infer it from taxonomy provenance.
- The exact P1C ledger intersects zero current `es5-selection.json` exclusions and zero current selected subset paths. Preserve that zero-exclusion inventory; do not edit `tools/test262/es5-selection.json`.
- Valid ES2015 catch parameters are `BindingIdentifier`, `ObjectBindingPattern`, and `ArrayBindingPattern`. Do not admit optional catch binding, top-level `AssignmentPattern`, top-level `RestElement`, member targets, or ES2016 `... BindingPattern`.
- Keep Acorn at `ecmaVersion: 6`.
- Preserve source/custom/reusable Program parity, descriptor safety, cycle rejection, strict `eval`/`arguments` restrictions, duplicate bound-name errors, and catch-parameter versus catch-body lexical declaration conflicts.
- The shared catch kernel creates a fresh declarative environment for every catch execution, sets only that record's `isCatchClauseEnvironment`, creates all bound names before initialization, and leaves `context.variableEnv` unchanged.
- `initializeBindingPattern` remains the binding semantics implementation. Do not duplicate iterator, object-pattern, default-initializer, name-inference, or abrupt-completion logic in either try evaluator.
- Synchronous catch initialization converts `ThrowSignal` and `GuestErrorSignal` through `runToCompletion`; generator catch initialization converts them through `captureGeneratorOperation`. Unexpected host failures remain host failures.
- Local Test262 execution is limited to `tools/test262/es2015-p1c-paths.txt` under `TZ=UTC`.
- Never run `npm test`, `npm run test:node`, `npm run test:browser`, `npm run test:jsc`, `npm run test262:upstream`, `npm run test262:upstream:check`, `npm run test262:es2015-release`, `npm run ci:contract`, a directory/glob Test262 selector, or any full suite locally.
- JavaScriptCore has no local suite selector. Do not run the full JSC registry; exact-head CI owns JSC proof.
- Local portable commands name only `test/parser.test.js`, `test/catch-binding.test.js`, and directly coupled regression suites.
- `tools/test262/es2015-p1c.js` is the sole P1C execution entry point. Its static import closure must exclude `tools/test262/es2015-audit.js`, `tools/test262/upstream-run.js`, and `tools/test262/upstream-select.js`.
- The P1C authority code is `P1C`; its promotion group is `es2015/p1c-catch-binding`; its consumer profile is `roadmap-reclassification:P1C`; its evidence prefix is `tools/test262/es2015-p1c-`.
- P1C evidence, destinations, authority markers, and delivery updates use issue `116` literally. No title search, environment variable, scratch issue-number file, or caller-supplied issue number is permitted.
- Immediately before authority scratch/preparation and again before consumer delivery, fail closed unless issue #116 is open with the exact title above and its native parent endpoint returns open issue #78 with the exact grouping title above.
- P1C can use generic named promotion schema v2 and the generic non-H0 roadmap authority without a BASE repair. Reviewed HEAD includes the generic report-projection repair, arbitrary named promotion parsing, code-derived evidence paths, and generic pending-to-applied validation.
- Before the separate pending-authority PR merges, do not track any P1C evidence JSON, change `tools/test262/es2015-provenance.json`, or change protected audit/taxonomy/subset/report/conformance outputs.
- The pending authority uses `state: "pending"`, `reconciliation: null`, `source.entryLedgerSha256: null`, exact source counts/hash, one `selected-passing` destination for issue `116`, six add-exact evidence files, and no `es5-selection.json` protected output.
- The six tracked evidence files are generated bytes. Add them to `.prettierignore` and repository invariant ownership only in the consumer task.
- The P1C promotion is all-pass: 81 roots / 161 variants, with promotion-ledger SHA equal to the source path-ledger SHA.
- Consumer accounting recomputes taxonomy absolutes from the live BASE and asserts only the exact P1C taxonomy deltas (`+81/+161` selected, `-81/-161` P1), while separately requiring 62 groups, 20,676 selected paths, 39,300 selected variants, and 14,353 generated non-T0 paths.
- Every implementation task uses a fresh worker, then a fresh specification-compliance reviewer, then a different fresh code-quality reviewer. Fix findings and rerun the task's focused commands before committing.
- Every persistent commit is authored by `Copilot <223556219+Copilot@users.noreply.github.com>` and includes `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- Store task evidence under `.superpowers/sdd/2026-08-23-p1c-catch-binding/task-N/`. Never use `/tmp`, `/var/tmp`, or `mktemp`.

---

## Stable Interfaces and File Map

### Production interface

```js
// src/evaluator/catch-binding.js
export function createCatchClauseContext(
  param: any,
  thrownValue: unknown,
  context: import('./index.js').EvaluationContext,
): import('./index.js').EvaluationContext
```

`createCatchClauseContext`:

1. creates `newDeclarativeEnvironment(context.env)`;
2. sets `isCatchClauseEnvironment = true`;
3. derives `catchContext = { ...context, env: catchEnv }`;
4. creates one mutable non-deletable binding for every `boundNames(param)`;
5. calls `initializeBindingPattern(param, thrownValue, catchEnv, catchContext)`;
6. returns `catchContext`; and
7. lets all abrupt completions escape for the caller-specific completion adapter.

The helper does not evaluate the catch body and does not catch exceptions.

### Parser boundary

`src/parser.js` adds one exact predicate:

```js
function isCatchParameterNodeOrUnknown(value) {
  return (
    isUnknownAstNode(value) ||
    isNodeTypeOrUnknown(value, 'Identifier') ||
    isNodeTypeOrUnknown(value, 'ObjectPattern') ||
    isNodeTypeOrUnknown(value, 'ArrayPattern')
  );
}
```

It also:

- returns `'binding'` for `CatchClause.param` in `patternContextForChild`;
- accepts an identifier in the pattern-context branch of
  `isSupportedExpressionPosition`; and
- uses `isCatchParameterNodeOrUnknown` for the `CatchClause.param` child.

### P1C tooling interfaces

```js
// tools/test262/es2015-roadmap-promotions.js
export const ES2015_P1C_PROMOTION_FILE =
  'tools/test262/es2015-p1c-promotion.json';

export const ES2015_P1C_DISPOSITION_FILE =
  'tools/test262/es2015-p1c-disposition.json';

export const ES2015_ROADMAP_PROMOTIONS = Object.freeze([
  Object.freeze({
    code: 'M1',
    promotionFile: ES2015_M1_PROMOTION_FILE,
    dispositionFile: 'tools/test262/es2015-m1-disposition.json',
  }),
  Object.freeze({
    code: 'P1C',
    promotionFile: ES2015_P1C_PROMOTION_FILE,
    dispositionFile: ES2015_P1C_DISPOSITION_FILE,
  }),
]);

export const ES2015_ROADMAP_PROMOTION_FILES = Object.freeze([
  ...ES2015_ROADMAP_PROMOTIONS.map((entry) => entry.promotionFile),
]);

// tools/test262/es2015-p1c.js
export const P1C_PROMOTION_GROUP = 'es2015/p1c-catch-binding';
export const P1C_ISSUE_NUMBER = 116;
export const P1C_ISSUE_TITLE =
  'Implement ES2015 destructuring catch parameters and catch environments';
export const P1C_PARENT_ISSUE = 78;
export const P1C_PARENT_TITLE =
  'Complete core ES2015 early errors and declaration instantiation';

export const P1C = Object.freeze({
  roots: 81,
  variants: 161,
  sha256:
    'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5',
});

export function parseP1CLedger(text: string): string[];

export function verifyP1CLedger(
  text: string,
  taxonomy: object,
): string[];

export async function runP1CFocused(options: {
  environment: Record<string, string | undefined>,
  ledgerText: string,
  taxonomy: object,
  pin: { repository: string, revision: string },
  host: import('./runner.js').Test262Host,
  engine: import('./runner.js').Test262Engine,
  supportedFeatures: readonly string[],
}): Promise<{
  version: 1,
  ledger: { roots: 81, variants: 161, sha256: string },
  records: readonly import('./report.js').Test262TestRecord[],
}>;

export function buildP1CAuthorityEvidence(options: {
  ledgerText: string,
  taxonomyText: string,
  execution: object,
  inventory: readonly object[],
}): {
  paths: readonly string[],
  baseline: readonly object[],
  disposition: { destinations: readonly object[] },
  ownerDeltas: readonly [],
  ownerMap: readonly [],
  promotion: object,
};

export function projectP1CCoreOutputs(options: object): {
  taxonomyText: string,
  auditEvidenceText: string,
  subsetText: string,
};

export function buildP1CReportArtifacts(options: object): {
  reportText: string,
  conformanceText: string,
};

export function buildP1CPendingAuthority(options: {
  evidence: object,
  baseTaxonomyText: string,
  protectedOutputs: readonly object[],
}): object;

export async function main(argv?: readonly string[]): Promise<number>;

// tools/test262/promotion-report-features.js
export function createPromotionReportFeaturesForPromotions(
  promotions: readonly {
    entries: readonly { path: string, features: readonly string[] }[],
  }[],
): (file: string) => readonly string[] | undefined;
```

### Closed P1C CLI

```text
execute:
  --ledger=tools/test262/es2015-p1c-paths.txt
  --output=.superpowers/sdd/2026-08-23-p1c-catch-binding/execution.json

build-scratch:
  --build-scratch
  --ledger=tools/test262/es2015-p1c-paths.txt
  --execution=.superpowers/sdd/2026-08-23-p1c-catch-binding/execution.json
  --output=.superpowers/sdd/2026-08-23-p1c-catch-binding/authority
```

The CLI rejects absolute paths, URLs, symlink escapes, missing files, output
outside the repository, any selector/directory/glob mode, non-UTC execution,
and unknown/repeated options.

### Exact evidence paths

```text
tools/test262/es2015-p1c-paths.json
tools/test262/es2015-p1c-baseline.json
tools/test262/es2015-p1c-disposition.json
tools/test262/es2015-p1c-owner-deltas.json
tools/test262/es2015-p1c-owner-map.json
tools/test262/es2015-p1c-promotion.json
```

The separate executable source ledger is:

```text
tools/test262/es2015-p1c-paths.txt
```

### Protected consumer projection

```text
docs/conformance.md                                      project
docs/test262-report.jsonl                               project
tools/test262/es2015-audit-evidence.json                replace-exact
tools/test262/es2015-p1c-baseline.json                  add-exact
tools/test262/es2015-p1c-disposition.json               add-exact
tools/test262/es2015-p1c-owner-deltas.json              add-exact
tools/test262/es2015-p1c-owner-map.json                 add-exact
tools/test262/es2015-p1c-paths.json                     add-exact
tools/test262/es2015-p1c-promotion.json                 add-exact
tools/test262/es2015-taxonomy.json                      project
tools/test262/upstream-subset.json                      project
```

`tools/test262/es5-selection.json` remains byte-identical and is absent from
the P1C protected-output list.

### Exact file map

| Responsibility                  | Files                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catch grammar/static semantics  | Modify `src/parser.js`; modify `test/parser.test.js`                                                                                                                                                    |
| Shared catch binding kernel     | Create `src/evaluator/catch-binding.js`; modify `src/evaluator/statements.js`; modify `src/evaluator/generator-statement-frames.js`                                                                     |
| Portable P1C probes             | Create `test/catch-binding.test.js`; modify `test/suites.js`                                                                                                                                            |
| Durable P1C source ledger       | Create `tools/test262/es2015-p1c-paths.txt`, `test/node/es2015-p1c-ledger.test.js`; modify `test/run-node.js` in Task 1                                                                                 |
| Exact P1C runner/evidence       | Create `tools/test262/es2015-p1c.js`, `test/node/es2015-p1c.test.js`; modify `package.json`, `test/run-node.js`                                                                                         |
| Promotion registry/report order | Modify `tools/test262/es2015-roadmap-promotions.js`, `tools/test262/promotion-report-features.js`, `tools/test262/upstream-run.js`, `tools/test262/upstream-select.js`, `tools/test262/es2015-audit.js` |
| Promotion tests/constants       | Modify `test/node/upstream-select.test.js`, `test/node/es2015-taxonomy.test.js`, `test/node/repository-invariants.test.js`; update focused CI and applied M1 totals in Task 8                           |
| Authority preparation           | Modify only `tools/test262/es2015-provenance.json` on a separate data-only branch                                                                                                                       |
| Consumer evidence/projection    | Add six P1C JSON files; modify protected outputs and change only P1C authority `pending -> applied`                                                                                                     |
| Generated ownership             | Modify `.prettierignore`, `test/node/repository-invariants.test.js`                                                                                                                                     |
| Documentation                   | Modify `docs/architecture.md`, `docs/testing.md`; regenerate only the owned `docs/conformance.md` block                                                                                                 |
| Delivery evidence               | Write ignored `.superpowers/sdd/2026-08-23-p1c-catch-binding/` reports; update P1C/#78/#70/#98 only after merge                                                                                         |

### Review protocol for every task

Every task repeats this protocol:

1. Start one fresh implementation worker with the design, this plan, exact current HEAD, only the task section, and the named RED or characterization command.
2. Store RED/GREEN output and the worker summary in `.superpowers/sdd/2026-08-23-p1c-catch-binding/task-N/`.
3. Give a fresh specification-compliance reviewer the task diff, stable interfaces, exact P1C scope, and command evidence.
4. Fix every confirmed specification finding and request a fresh specification re-review.
5. Give a different fresh code-quality reviewer the approved diff and evidence.
6. Fix every confirmed quality finding and request a fresh quality re-review.
7. Rerun the task's focused commands and commit only the task's files.

---

### Task 1: Freeze the Durable P1C Source Ledger

**Files:**

- Create: `tools/test262/es2015-p1c-paths.txt`
- Create: `test/node/es2015-p1c-ledger.test.js`
- Modify: `test/run-node.js`

**Interfaces:**

- Consumes: ignored reviewed ledger
  `.superpowers/sdd/2026-08-23-p1-decomposition/ledgers/P1C-catch-binding-environments.paths.txt`
  at exact planning base.
- Produces: durable tracked `tools/test262/es2015-p1c-paths.txt`, the only
  source ledger accepted by all later P1C tooling.
- Produces: a checkout-independent Node test that validates path bytes,
  taxonomy ownership, root count, and variant count.

- [ ] **Step 1: Start the fresh Task 1 tooling worker**

  Give the worker only the exact source/destination paths, 81/161 counts, SHA,
  and this RED command:

  ```bash
  TZ=UTC node test/run-node.js test/node/es2015-p1c-ledger.test.js
  ```

- [ ] **Step 2: Add the failing durable-ledger test**

  Create `test/node/es2015-p1c-ledger.test.js`:

  ```js
  import { createHash } from 'node:crypto';
  import { readFile } from 'node:fs/promises';
  import { assertSame } from '../harness/assert.js';

  const LEDGER_FILE = 'tools/test262/es2015-p1c-paths.txt';
  const EXPECTED_SHA256 =
    'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5';

  export default [
    {
      name: 'the durable P1C ledger exactly matches its reviewed source identity',
      run: async () => {
        const [ledgerText, taxonomyText] = await Promise.all([
          readFile(LEDGER_FILE, 'utf8'),
          readFile('tools/test262/es2015-taxonomy.json', 'utf8'),
        ]);
        const paths = ledgerText.endsWith('\n')
          ? ledgerText.slice(0, -1).split('\n')
          : ledgerText.split('\n');
        const taxonomy = JSON.parse(taxonomyText);
        const byPath = new Map(
          taxonomy.classifications.map((entry) => [entry.path, entry]),
        );

        assertSame(paths.length, 81);
        assertSame(new Set(paths).size, 81);
        assertSame(JSON.stringify(paths), JSON.stringify([...paths].sort()));
        assertSame(
          createHash('sha256').update(ledgerText).digest('hex'),
          EXPECTED_SHA256,
        );

        let variants = 0;
        for (const path of paths) {
          const entry = byPath.get(path);
          assertSame(entry?.partition, 'core', path);
          assertSame(
            entry?.status,
            'blocked:early-errors-and-declaration-instantiation',
            path,
          );
          assertSame(
            entry?.blocker,
            'early-errors-and-declaration-instantiation',
            path,
          );
          variants += entry.variants;
        }
        assertSame(variants, 161);
      },
    },
  ];
  ```

  Register it in `test/run-node.js` as
  `test/node/es2015-p1c-ledger.test.js`.

- [ ] **Step 3: Run the durable-ledger RED command**

  ```bash
  TZ=UTC node test/run-node.js test/node/es2015-p1c-ledger.test.js
  ```

  Expected: FAIL with `ENOENT` for
  `tools/test262/es2015-p1c-paths.txt`.

- [ ] **Step 4: Reconstruct the tracked ledger from reviewed bytes**

  ```bash
  cp \
    .superpowers/sdd/2026-08-23-p1-decomposition/ledgers/P1C-catch-binding-environments.paths.txt \
    tools/test262/es2015-p1c-paths.txt
  cmp \
    .superpowers/sdd/2026-08-23-p1-decomposition/ledgers/P1C-catch-binding-environments.paths.txt \
    tools/test262/es2015-p1c-paths.txt
  test "$(wc -l < tools/test262/es2015-p1c-paths.txt)" -eq 81
  sha256sum tools/test262/es2015-p1c-paths.txt |
    grep -F \
      'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5'
  ```

- [ ] **Step 5: Run the durable-ledger GREEN command**

  ```bash
  TZ=UTC node test/run-node.js test/node/es2015-p1c-ledger.test.js
  ```

  Expected: PASS with 81 roots / 161 variants.

- [ ] **Step 6: Obtain fresh Task 1 specification review**

  Require review of exact byte reconstruction, final newline, sorted uniqueness,
  source taxonomy ownership, count/hash identity, and absence of any P1F/P1G
  path.

- [ ] **Step 7: Obtain fresh Task 1 quality review**

  Require review of test independence from `vendor/test262`, diagnostics,
  registration, and the single durable source-of-truth boundary.

- [ ] **Step 8: Rerun Task 1 checks and commit**

  ```bash
  TZ=UTC node test/run-node.js test/node/es2015-p1c-ledger.test.js
  npx eslint test/node/es2015-p1c-ledger.test.js test/run-node.js
  npx prettier --check test/node/es2015-p1c-ledger.test.js test/run-node.js
  sha256sum tools/test262/es2015-p1c-paths.txt |
    grep -F \
      'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5'
  git diff --check
  git add \
    tools/test262/es2015-p1c-paths.txt \
    test/node/es2015-p1c-ledger.test.js \
    test/run-node.js
  git commit --author='Copilot <223556219+Copilot@users.noreply.github.com>' \
    -m 'test262: freeze exact P1C source ledger' \
    -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
  ```

---

### Task 2: Admit Exact ES2015 Catch Binding Patterns

**Files:**

- Modify: `src/parser.js:3260-3335, 3748-3790, 4438-4485, 5285-5470, 6748-6780, 7410-7455`
- Modify: `test/parser.test.js`

**Interfaces:**

- Consumes: existing `patternContextForChild`, `isSupportedExpressionPosition`, custom declaration early-error walk, and pattern node predicates.
- Produces: source/custom/reusable AST acceptance for only `Identifier`, `ObjectPattern`, and `ArrayPattern` in `CatchClause.param`.
- Produces: binding pattern context inherited by every nested identifier/default/rest element inside a valid catch parameter.

- [ ] **Step 1: Start the fresh Task 2 worker**

  Give the worker exact P1C scope, parser line ranges, the current failure
  message, and this RED command:

  ```bash
  TZ=UTC node test/run-node.js test/parser.test.js
  ```

- [ ] **Step 2: Add source and custom-AST RED tests**

  Add focused cases to `test/parser.test.js`:

  ```js
  {
    name: 'catch parameters admit ES2015 array and object binding patterns',
    run() {
      for (const source of [
        'try { throw [1]; } catch ([value]) { value; }',
        'try { throw { value: 1 }; } catch ({ value }) { value; }',
        'try { throw [1, 2, 3]; } catch ([head, ...tail]) { tail; }',
      ]) {
        assertSame(parseScript(source).type, 'Program', source);
        assertSame(parseEval(source).type, 'Program', source);
      }
    },
  },
  {
    name: 'custom and reusable catch parameters accept only ES2015 catch binding forms',
    run() {
      for (const entry of CUSTOM_SCRIPT_AST_ENTRIES) {
        for (const patternSource of [
          'var [value] = source;',
          'var { value } = source;',
        ]) {
          const program = parseScript('try {} catch (error) {}');
          const pattern = parseScript(patternSource).body[0].declarations[0].id;
          program.body[0].handler.param = pattern;
          assertSame(parseCustomScript(entry, program).type, 'Program', entry);
        }

        for (const invalidSource of [
          'function f(value = 1) {}',
          'function f(...rest) {}',
          'target.value = 1;',
          '1;',
        ]) {
          const program = parseScript('try {} catch (error) {}');
          const invalid = parseScript(invalidSource);
          const node =
            invalid.body[0].type === 'FunctionDeclaration'
              ? invalid.body[0].params[0]
              : invalid.body[0].type === 'ExpressionStatement'
                ? invalid.body[0].expression.left ?? invalid.body[0].expression
                : invalid.body[0];
          program.body[0].handler.param = node;
          assertThrows(() => parseCustomScript(entry, program), SyntaxError);
        }

        const optional = parseScript('try {} catch (error) {}');
        optional.body[0].handler.param = null;
        assertThrows(() => parseCustomScript(entry, optional), SyntaxError);
      }
    },
  },
  ```

  Use a small local helper instead of the conditional extraction above if the
  final test reads more clearly; retain the exact four invalid node kinds:
  top-level `AssignmentPattern`, `RestElement`, `MemberExpression`, and
  `Literal`.

- [ ] **Step 3: Add early-error parity assertions**

  Pin Acorn source behavior and custom/reusable parity:

  ```js
  {
    name: 'catch binding patterns preserve duplicate, lexical collision, and strict binding early errors',
    run() {
      for (const source of [
        'try {} catch ([name, name]) {}',
        'try {} catch ({ first: name, second: name }) {}',
        'try {} catch ([name]) { let name; }',
        '"use strict"; try {} catch ({ eval }) {}',
        '"use strict"; try {} catch ({ arguments }) {}',
        'try {} catch {}',
        'try {} catch ([...[rest]]) {}',
      ]) {
        assertThrows(() => parseScript(source), SyntaxError, source);
      }

      for (const entry of CUSTOM_SCRIPT_AST_ENTRIES) {
        const duplicate = parseScript('try {} catch (name) {}');
        const duplicatePattern = /** @type {any} */ (
          parseScript('var [first, second] = source;')
            .body[0].declarations[0].id
        );
        duplicatePattern.elements[1].name = 'first';
        duplicate.body[0].handler.param = duplicatePattern;
        assertThrows(() => parseCustomScript(entry, duplicate), SyntaxError);

        const crossProperty = parseScript('try {} catch (name) {}');
        const crossPropertyPattern = /** @type {any} */ (
          parseScript('var { first, second } = source;')
            .body[0].declarations[0].id
        );
        crossPropertyPattern.properties[1].value.name = 'first';
        crossProperty.body[0].handler.param = crossPropertyPattern;
        assertThrows(
          () => parseCustomScript(entry, crossProperty),
          SyntaxError,
        );

        const collision = parseScript('try {} catch (name) { let other; }');
        collision.body[0].handler.param =
          parseScript('var [other] = source;')
            .body[0].declarations[0].id;
        assertThrows(() => parseCustomScript(entry, collision), SyntaxError);

        const strict = parseScript(
          '"use strict"; try {} catch (name) {}',
        );
        const strictPattern = /** @type {any} */ (
          parseScript('var { value } = source;')
            .body[0].declarations[0].id
        );
        strictPattern.properties[0].value.name = 'eval';
        strict.body[1].handler.param = strictPattern;
        assertThrows(() => parseCustomScript(entry, strict), SyntaxError);

        const strictArguments = parseScript(
          '"use strict"; try {} catch (name) {}',
        );
        const argumentsPattern = /** @type {any} */ (
          parseScript('var { value } = source;')
            .body[0].declarations[0].id
        );
        argumentsPattern.properties[0].value.name = 'arguments';
        strictArguments.body[1].handler.param = argumentsPattern;
        assertThrows(
          () => parseCustomScript(entry, strictArguments),
          SyntaxError,
        );
      }
    },
  },
  ```

- [ ] **Step 4: Run the parser RED command**

  Run:

  ```bash
  TZ=UTC node test/run-node.js test/parser.test.js
  ```

  Expected: FAIL on the positive source case with
  `SyntaxError: destructuring patterns are not supported in this context`, and
  fail on the valid custom pattern because `CatchClause.param` currently
  requires an identifier.

- [ ] **Step 5: Implement the exact catch pattern context**

  Update `patternContextForChild`:

  ```js
  if (parent.type === 'CatchClause' && key === 'param') {
    return 'binding';
  }
  ```

  In the `patternContext !== undefined` branch of
  `isSupportedExpressionPosition`, add:

  ```js
  case 'CatchClause':
    return node.type === 'Identifier' && direct('param');
  ```

  Keep this branch limited to identifier leaves; a hostile `MemberExpression`
  must remain rejected even though the generic pattern-context branch accepts
  member targets for assignment patterns. `ObjectPattern` and `ArrayPattern`
  remain structural nodes.

  Remove the now-dead later `switch (parent.type)` case:

  ```js
  case 'CatchClause':
    return node.type === 'Identifier' && direct('param');
  ```

  Once `CatchClause.param` always carries `patternContext: 'binding'`, that old
  non-pattern branch is unreachable and retaining it would obscure which guard
  owns catch binding leaves.

- [ ] **Step 6: Implement the exact custom child predicate**

  Add:

  ```js
  function isCatchParameterNodeOrUnknown(value) {
    return (
      isUnknownAstNode(value) ||
      isNodeTypeOrUnknown(value, 'Identifier') ||
      isNodeTypeOrUnknown(value, 'ObjectPattern') ||
      isNodeTypeOrUnknown(value, 'ArrayPattern')
    );
  }
  ```

  Change only the `CatchClause` child validation:

  ```js
  case 'CatchClause':
    return (
      validateRequiredChild(
        node,
        'param',
        isCatchParameterNodeOrUnknown,
      ) ?? validateRequiredChild(node, 'body', isBlockStatementOrUnknown)
    );
  ```

  Do not use the broader `isBindingPatternNodeOrUnknown`, because it also
  admits top-level `AssignmentPattern` and `RestElement`. Retain
  `validateRequiredChild`, not `validateNullableChild`, so hostile optional
  catch binding stays rejected.

- [ ] **Step 7: Run focused parser GREEN commands**

  Run:

  ```bash
  TZ=UTC node test/run-node.js test/parser.test.js
  node test/run-browser-playwright.js test/parser.test.js
  ```

  Expected: PASS. Do not run JSC locally.

- [ ] **Step 8: Obtain fresh Task 2 specification review**

  Require review of the exact Sixth Edition forms, nested binding context,
  source/custom/reusable parity, strict bindings, duplicate names, body
  lexical collisions, invalid top-level pattern nodes, and absence of optional
  catch binding or ES2016 rest-pattern widening.

- [ ] **Step 9: Obtain fresh Task 2 quality review**

  Require review of predicate naming, placement logic, error phase, hostile AST
  behavior, cycle/descriptor coverage, and no unrelated parser widening.

- [ ] **Step 10: Rerun Task 2 checks and commit**

  ```bash
  TZ=UTC node test/run-node.js test/parser.test.js
  node test/run-browser-playwright.js test/parser.test.js
  npx eslint src/parser.js test/parser.test.js
  npx prettier --check src/parser.js test/parser.test.js
  git diff --check
  git add src/parser.js test/parser.test.js
  git commit --author='Copilot <223556219+Copilot@users.noreply.github.com>' \
    -m 'feat: admit ES2015 catch binding patterns' \
    -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
  ```

---

### Task 3: Share Catch Parameter Initialization Across Evaluators

**Files:**

- Create: `src/evaluator/catch-binding.js`
- Create: `test/catch-binding.test.js`
- Modify: `src/evaluator/statements.js:34-43, 1120-1190`
- Modify: `src/evaluator/generator-statement-frames.js:37-45, 1929-1955`
- Modify: `test/suites.js`

**Interfaces:**

- Consumes: Task 2 parser admission, `boundNames`, `newDeclarativeEnvironment`, and `initializeBindingPattern`.
- Produces: `createCatchClauseContext(param, thrownValue, context)`.
- Produces: synchronous `runToCompletion` and generator `captureGeneratorOperation` adapters around the same kernel.

- [ ] **Step 1: Start the fresh Task 3 worker**

  Give the worker Task 2 HEAD, the stable helper signature, the synchronous
  `.name` defect, the generator prior art, and this RED command:

  ```bash
  TZ=UTC node test/run-node.js test/catch-binding.test.js
  ```

- [ ] **Step 2: Create the portable basic P1C RED suite**

  Create `test/catch-binding.test.js`:

  ```js
  import { assertSame } from './harness/assert.js';
  import { createRealm } from '../src/runtime/realm.js';
  import { evaluateScript } from '../src/api.js';

  function value(source) {
    const completion = evaluateScript(createRealm(), source);
    if (completion.type !== 'normal') {
      throw new Error(`Expected normal completion, got ${completion.type}`);
    }
    return completion.value;
  }

  export default [
    {
      name: 'synchronous catch initializes nested array and object binding patterns',
      run() {
        assertSame(
          value(`
            var result;
            try { throw [1, { value: 2 }, 3, 4]; }
            catch ([head, { value }, ...tail]) {
              result = head + ':' + value + ':' + tail.join(',');
            }
            result;
          `),
          '1:2:3,4',
        );
      },
    },
    {
      name: 'catch defaults infer anonymous function, class, and generator names',
      run() {
        assertSame(
          value(`
            var result;
            try { throw []; }
            catch ([
              fn = function () {},
              cls = class {},
              gen = function* () {}
            ]) {
              result = fn.name + ':' + cls.name + ':' + gen.name;
            }
            result;
          `),
          'fn:cls:gen',
        );
      },
    },
    {
      name: 'synchronous and generator catch binding patterns produce the same values',
      run() {
        assertSame(
          value(`
            function* probe() {
              try { throw [1, { value: 2 }, 3, 4]; }
              catch ([head, { value }, ...tail]) {
                return head + ':' + value + ':' + tail.join(',');
              }
            }
            probe().next().value;
          `),
          '1:2:3,4',
        );
      },
    },
  ];
  ```

  Register the suite in `test/suites.js`.

- [ ] **Step 3: Run the runtime RED command**

  Run:

  ```bash
  TZ=UTC node test/run-node.js test/catch-binding.test.js
  ```

  Expected: FAIL in synchronous catch evaluation because
  `evaluateTryStatement` reads `node.handler.param.name` and never initializes
  the pattern's bound identifiers.

- [ ] **Step 4: Create the shared catch binding kernel**

  Create `src/evaluator/catch-binding.js`:

  ```js
  import { newDeclarativeEnvironment } from '../runtime/environment.js';
  import { initializeBindingPattern } from './patterns.js';
  import { boundNames } from './static-semantics.js';

  /**
   * @typedef {import('./index.js').EvaluationContext} EvaluationContext
   */

  /**
   * @param {any} param
   * @param {unknown} thrownValue
   * @param {EvaluationContext} context
   * @returns {EvaluationContext}
   */
  export function createCatchClauseContext(param, thrownValue, context) {
    const catchEnv = newDeclarativeEnvironment(context.env);
    catchEnv.isCatchClauseEnvironment = true;
    const catchContext = { ...context, env: catchEnv };

    for (const name of boundNames(param)) {
      catchEnv.createMutableBinding(name, false);
    }

    initializeBindingPattern(param, thrownValue, catchEnv, catchContext);
    return catchContext;
  }
  ```

  Do not catch `ThrowSignal`, `GuestErrorSignal`, or host failures here.

- [ ] **Step 5: Replace synchronous `.name` initialization**

  Import `createCatchClauseContext` into `src/evaluator/statements.js`. Replace
  the current identifier-only block with:

  ```js
  const initialized = runToCompletion(
    () =>
      createNormalCompletion(
        createCatchClauseContext(
          node.handler.param,
          blockCompletion.value,
          context,
        ),
      ),
    context.realm,
  );

  if (initialized.type === 'throw') {
    blockCompletion = initialized;
  } else {
    const catchContext = /** @type {EvaluationContext} */ (initialized.value);
    blockCompletion = runToCompletion(
      () => evaluateBlock(node.handler.body, catchContext),
      context.realm,
    );
  }
  ```

  Remove only the old `param.name`, `createMutableBinding`, and
  `initializeBinding` lines. Keep finally precedence unchanged.

- [ ] **Step 6: Route the generator evaluator through the same kernel**

  Import `createCatchClauseContext` into
  `src/evaluator/generator-statement-frames.js`. Replace the duplicated
  environment/binding code in `prepareCatchClause`:

  ```js
  const initialized = captureGeneratorOperation(execution.realm, () =>
    createCatchClauseContext(
      frame.node.handler.param,
      thrownValue,
      frame.context,
    ),
  );

  if (initialized.type === 'completion') {
    return initialized.completion;
  }
  if (initialized.type !== 'value') {
    throw new TypeError('Catch initialization must produce a context value');
  }

  frame.catchContext = /** @type {EvaluationContext} */ (initialized.value);
  return null;
  ```

  Remove the now-unused `boundNames`, `initializeBindingPattern`, and
  `newDeclarativeEnvironment` imports only when no other code in the file uses
  them.

- [ ] **Step 7: Run basic runtime GREEN commands**

  ```bash
  TZ=UTC node test/run-node.js \
    test/catch-binding.test.js \
    test/try-statements.test.js \
    test/generator-control-flow.test.js \
    test/eval.test.js
  node test/run-browser-playwright.js \
    test/catch-binding.test.js \
    test/try-statements.test.js \
    test/generator-control-flow.test.js \
    test/eval.test.js
  ```

  Expected: PASS. The focused runners accept multiple explicit suite paths;
  none invokes the full registry.

- [ ] **Step 8: Obtain fresh Task 3 specification review**

  Require review of environment nesting, all-bindings-before-initialization,
  variable-environment preservation, Annex B.3.5 marker placement, name
  inference, sync/generator completion adapters, and finally precedence.

- [ ] **Step 9: Obtain fresh Task 3 quality review**

  Require review of module cycles, JSDoc type consistency, no duplicated
  pattern logic, no catch-body responsibility in the helper, and no performance
  regression beyond one `BoundNames` walk per executed catch.

- [ ] **Step 10: Rerun Task 3 checks and commit**

  ```bash
  TZ=UTC node test/run-node.js \
    test/catch-binding.test.js \
    test/try-statements.test.js \
    test/generator-control-flow.test.js \
    test/eval.test.js
  node test/run-browser-playwright.js \
    test/catch-binding.test.js \
    test/try-statements.test.js \
    test/generator-control-flow.test.js \
    test/eval.test.js
  npm run typecheck
  npx eslint \
    src/evaluator/catch-binding.js \
    src/evaluator/statements.js \
    src/evaluator/generator-statement-frames.js \
    test/catch-binding.test.js \
    test/suites.js
  npx prettier --check \
    src/evaluator/catch-binding.js \
    src/evaluator/statements.js \
    src/evaluator/generator-statement-frames.js \
    test/catch-binding.test.js \
    test/suites.js
  git diff --check
  git add \
    src/evaluator/catch-binding.js \
    src/evaluator/statements.js \
    src/evaluator/generator-statement-frames.js \
    test/catch-binding.test.js \
    test/suites.js
  git commit --author='Copilot <223556219+Copilot@users.noreply.github.com>' \
    -m 'feat: share catch parameter initialization' \
    -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
  ```

---

### Task 4: Prove Fresh Environments, Abrupt Completion, and Realm Parity

**Files:**

- Modify: `test/catch-binding.test.js`
- Modify only on a demonstrated RED: `src/evaluator/catch-binding.js`, `src/evaluator/patterns.js`, `src/evaluator/statements.js`, or `src/evaluator/generator-statement-frames.js`

**Interfaces:**

- Consumes: Task 3 shared kernel.
- Produces: portable coverage for repeated catch execution, iterator close,
  default/getter/iterator abrupt completion, direct eval, same-Agent
  cross-Realm values, and Realm-owned errors.

- [ ] **Step 1: Start the fresh Task 4 worker**

  Give the worker the exact edge matrix below. Require characterization before
  changing production code.

- [ ] **Step 2: Add fresh-environment and direct-eval probes**

  Extend `test/catch-binding.test.js`:

  ```js
  {
    name: 'each catch execution creates a fresh parameter environment',
    run() {
      assertSame(
        value(`
          var closures = [];
          for (var i = 0; i < 2; i += 1) {
            try { throw [i]; }
            catch ([captured]) {
              closures.push(function () { return captured; });
            }
          }
          closures[0]() + ':' + closures[1]();
        `),
        '0:1',
      );
    },
  },
  {
    name: 'direct eval keeps the enclosing variable environment outside a destructuring catch parameter',
    run() {
      assertSame(
        value(`
          function probe() {
            var read;
            try { throw [42]; }
            catch ([caught]) {
              eval('var hoisted = 7;');
              read = function () { return caught + ':' + hoisted; };
            }
            return read();
          }
          probe();
        `),
        '42:7',
      );
    },
  },
  ```

- [ ] **Step 3: Add iterator-close and abrupt-completion probes**

  Add:

  ```js
  {
    name: 'catch array binding closes a non-exhausted iterator',
    run() {
      assertSame(
        value(`
          var closed = 0;
          var iterable = {};
          iterable[Symbol.iterator] = function () {
            return {
              next: function () { return { value: 9, done: false }; },
              return: function () { closed += 1; return {}; }
            };
          };
          var caught;
          try { throw iterable; }
          catch ([value]) { caught = value; }
          caught + ':' + closed;
        `),
        '9:1',
      );
    },
  },
  {
    name: 'catch binding initialization abrupt completions bypass the catch body and reach an outer catch',
    run() {
      assertSame(
        value(`
          var bodyRan = false;
          var name;
          try {
            try { throw []; }
            catch ([value = missingName]) { bodyRan = true; }
          } catch (error) {
            name = error.name;
          }
          name + ':' + bodyRan;
        `),
        'ReferenceError:false',
      );
    },
  },
  {
    name: 'object catch binding forwards getter abrupt completion',
    run() {
      assertSame(
        value(`
          var source = {};
          Object.defineProperty(source, 'value', {
            get: function () { throw 'getter'; }
          });
          var caught;
          try {
            try { throw source; }
            catch ({ value }) {}
          } catch (error) {
            caught = error;
          }
          caught;
        `),
        'getter',
      );
    },
  },
  ```

- [ ] **Step 4: Add same-Agent cross-Realm and Realm-owned-error probes**

  Add imports and helpers:

  ```js
  import { createAgent } from '../src/runtime/agent.js';
  import { EngineObject } from '../src/runtime/object.js';

  function defineGlobal(realm, name, nextValue) {
    realm.globalObject.defineOwnProperty(name, {
      value: nextValue,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  ```

  Add:

  ```js
  {
    name: 'catch destructuring consumes a same-Agent cross-Realm thrown array',
    run() {
      const agent = createAgent();
      const consumer = createRealm({ agent });
      const producer = createRealm({ agent });
      evaluateScript(producer, 'var payload = [17];');
      defineGlobal(consumer, 'payload', producer.globalObject.get('payload'));

      const completion = evaluateScript(
        consumer,
        'var result; try { throw payload; } catch ([value]) { result = value; } result;',
      );
      assertSame(completion.type, 'normal');
      assertSame(completion.value, 17);
    },
  },
  {
    name: 'catch binding errors belong to the evaluating Realm',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        `
          var caught;
          try {
            try { throw null; }
            catch ({ value }) {}
          } catch (error) {
            caught = error;
          }
          caught;
        `,
      );
      assertSame(completion.type, 'normal');
      const error = /** @type {EngineObject} */ (completion.value);
      assertSame(
        error.getPrototypeOf(),
        /** @type {EngineObject} */ (
          /** @type {any} */ (realm.globalObject.get('TypeError')).get(
            'prototype',
          )
        ),
      );
    },
  },
  ```

- [ ] **Step 5: Add generator abrupt-completion parity**

  Add:

  ```js
  {
    name: 'generator catch binding initialization reports the same Realm-owned abrupt completion',
    run() {
      assertSame(
        value(`
          function* probe() {
            try {
              try { throw null; }
              catch ({ value }) {}
            } catch (error) {
              return error instanceof TypeError;
            }
          }
          probe().next().value;
        `),
        true,
      );
    },
  },
  ```

- [ ] **Step 6: Run the characterization command**

  ```bash
  TZ=UTC node test/run-node.js test/catch-binding.test.js
  ```

  Expected after Task 3: PASS. If any case fails, preserve the failing output
  as RED and make the smallest change inside the allowed files. Do not broaden
  P1C or rewrite `patterns.js` when the shared kernel wiring is the defect.

- [ ] **Step 7: Run focused portable GREEN commands**

  ```bash
  TZ=UTC node test/run-node.js \
    test/catch-binding.test.js \
    test/destructuring.test.js \
    test/eval.test.js \
    test/generator-control-flow.test.js
  node test/run-browser-playwright.js \
    test/catch-binding.test.js \
    test/destructuring.test.js \
    test/eval.test.js \
    test/generator-control-flow.test.js
  ```

- [ ] **Step 8: Obtain fresh Task 4 specification review**

  Require review of per-execution environment identity, iterator closing,
  abrupt precedence, body suppression, direct eval variable environment,
  same-Agent cross-Realm values, and evaluating-Realm errors.

- [ ] **Step 9: Obtain fresh Task 4 quality review**

  Require review of portable host neutrality, no host exception
  reinterpretation, no cross-Agent scope creep, and test strength.

- [ ] **Step 10: Rerun Task 4 checks and commit**

  ```bash
  TZ=UTC node test/run-node.js \
    test/catch-binding.test.js \
    test/destructuring.test.js \
    test/eval.test.js \
    test/generator-control-flow.test.js
  node test/run-browser-playwright.js \
    test/catch-binding.test.js \
    test/destructuring.test.js \
    test/eval.test.js \
    test/generator-control-flow.test.js
  npx eslint test/catch-binding.test.js
  npx prettier --check test/catch-binding.test.js
  git diff --check
  git add test/catch-binding.test.js
  git commit --author='Copilot <223556219+Copilot@users.noreply.github.com>' \
    -m 'test: cover catch binding abrupt and Realm behavior' \
    -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
  ```

  If a demonstrated RED required a production fix, include only the allowed
  directly coupled files in this commit and record the exact reason in the task
  report.

---

### Task 5: Add the Exact P1C Runner and Scratch Evidence

**Files:**

- Create: `tools/test262/es2015-p1c.js`
- Create: `test/node/es2015-p1c.test.js`
- Modify: `package.json`
- Modify: `test/run-node.js`

**Interfaces:**

- Consumes: Task 1 durable exact P1C ledger, pinned checkout, low-level Test262 runner,
  taxonomy, feature manifest, pinned harness definitions, generic promotion v2,
  and low-level report/coverage/subset helpers.
- Produces: the P1C tooling interfaces and closed CLI defined above.
- Produces only ignored scratch before Task 7.

- [ ] **Step 1: Start the fresh Task 5 worker**

  Give the worker the exact ledger hash/counts, inventory facts, zero
  exclusions, zero selected intersection, broad-entry-point prohibition, and
  M1's corrected include-closure lesson.

- [ ] **Step 2: Reverify the durable tracked source ledger**

  ```bash
  test "$(wc -l < tools/test262/es2015-p1c-paths.txt)" -eq 81
  sha256sum tools/test262/es2015-p1c-paths.txt |
    grep -F \
      'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5'
  ```

- [ ] **Step 3: Add the P1C tooling RED suite**

  Create `test/node/es2015-p1c.test.js` with literal assertions:

  ```js
  import { readFile } from 'node:fs/promises';
  import { assertSame, assertThrows } from '../harness/assert.js';
  import {
    P1C,
    P1C_ISSUE_NUMBER,
    P1C_ISSUE_TITLE,
    P1C_PARENT_ISSUE,
    P1C_PARENT_TITLE,
    P1C_PROMOTION_GROUP,
    buildP1CAuthorityEvidence,
    parseP1CLedger,
    runP1CFocused,
    verifyP1CLedger,
  } from '../../tools/test262/es2015-p1c.js';

  export default [
    {
      name: 'P1C ledger is exact, sorted, unique, and taxonomy-owned',
      run: async () => {
        const ledger = await readFile(
          'tools/test262/es2015-p1c-paths.txt',
          'utf8',
        );
        const taxonomy = JSON.parse(
          await readFile('tools/test262/es2015-taxonomy.json', 'utf8'),
        );
        const paths = verifyP1CLedger(ledger, taxonomy);
        assertSame(paths.length, 81);
        assertSame(P1C.roots, 81);
        assertSame(P1C.variants, 161);
        assertSame(P1C_ISSUE_NUMBER, 116);
        assertSame(
          P1C_ISSUE_TITLE,
          'Implement ES2015 destructuring catch parameters and catch environments',
        );
        assertSame(P1C_PARENT_ISSUE, 78);
        assertSame(
          P1C_PARENT_TITLE,
          'Complete core ES2015 early errors and declaration instantiation',
        );
        assertSame(
          P1C.sha256,
          'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5',
        );
        assertSame(P1C_PROMOTION_GROUP, 'es2015/p1c-catch-binding');
      },
    },
  ];
  ```

  Add fixtures that prove rejection of unsorted, duplicate, foreign,
  non-`test/language/statements/try/`, wrong-count, wrong-variant, wrong-pin,
  wrong-blocker, and wrong-taxonomy inputs.

- [ ] **Step 4: Add exact inventory and exclusion assertions**

  In the P1C test, build the inventory from pinned source plus
  `readTest262HarnessDefinitions`. Assert:

  ```js
  assertSame(inventory.length, 81);
  assertSame(
    inventory.reduce((sum, root) => sum + root.variants, 0),
    161,
  );
  assertSame(
    inventory.filter((root) => root.includeFeatures.length !== 0).length,
    0,
  );
  assertSame(
    inventory.filter(
      (root) =>
        JSON.stringify(root.metadata.includes) ===
        JSON.stringify(['compareArray.js']),
    ).length,
    1,
  );
  assertSame(p1cExclusions.length, 0);
  assertSame(p1cSelectedPaths.length, 0);
  ```

  Assert the six exact metadata feature-array counts:

  ```js
  {
    '[]': 2,
    '["Symbol.iterator","destructuring-binding"]': 8,
    '["Symbol.iterator","destructuring-binding","generators"]': 1,
    '["destructuring-binding"]': 58,
    '["destructuring-binding","generators"]': 11,
    '["let"]': 1,
  }
  ```

- [ ] **Step 5: Add bounded execution and evidence RED fixtures**

  Use injected host/engine fixtures to assert:

  - non-UTC rejection;
  - exactly 81 paths and 161 records;
  - 80 roots with non-strict/strict and one no-strict root;
  - all-pass disposition;
  - empty owner map and owner deltas;
  - promotion version `2`;
  - group `es2015/p1c-catch-binding`;
  - 81 promotion entries / 161 variants;
  - promotion ledger SHA equals the source ledger SHA;
  - complete metadata and include-feature arrays on every entry; and
  - fixed issue `116` and parent `78` constants.

  The all-pass assertions are:

  ```js
  assertSame(evidence.disposition.destinations.length, 81);
  assertSame(
    evidence.disposition.destinations.every(
      (entry) =>
        entry.status === 'selected-passing' &&
        entry.blocker === null &&
        entry.issue === 116,
    ),
    true,
  );
  assertSame(evidence.ownerMap.length, 0);
  assertSame(evidence.ownerDeltas.length, 0);
  assertSame(evidence.promotion.version, 2);
  assertSame(evidence.promotion.groupName, 'es2015/p1c-catch-binding');
  assertSame(evidence.promotion.rootCount, 81);
  assertSame(evidence.promotion.variantCount, 161);
  ```

- [ ] **Step 6: Run the tooling RED command**

  ```bash
  TZ=UTC node test/run-node.js test/node/es2015-p1c.test.js
  ```

  Expected: FAIL because `tools/test262/es2015-p1c.js` does not exist.

- [ ] **Step 7: Implement the exact constants, ledger parser, and verifier**

  In `tools/test262/es2015-p1c.js`, add the stable constants and enforce:

  ```js
  export const P1C_PROMOTION_GROUP = 'es2015/p1c-catch-binding';
  export const P1C_ISSUE_NUMBER = 116;
  export const P1C_ISSUE_TITLE =
    'Implement ES2015 destructuring catch parameters and catch environments';
  export const P1C_PARENT_ISSUE = 78;
  export const P1C_PARENT_TITLE =
    'Complete core ES2015 early errors and declaration instantiation';
  export const P1C = Object.freeze({
    roots: 81,
    variants: 161,
    sha256: 'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5',
  });
  ```

  `verifyP1CLedger` requires every taxonomy entry to be:

  ```js
  entry.partition === 'core' &&
    entry.status === 'blocked:early-errors-and-declaration-instantiation' &&
    entry.blocker === 'early-errors-and-declaration-instantiation';
  ```

- [ ] **Step 8: Implement the bounded focused runner**

  `runP1CFocused` must:

  - require `environment.TZ === 'UTC'`;
  - verify pin/taxonomy/ledger identity;
  - call `runTest262Suite` with only the exact ledger paths;
  - use the checked feature manifest;
  - reject skips, missing variants, duplicate records, foreign records, and any
    failure;
  - return complete evidence even when the CLI exits nonzero; and
  - never call `host.listTests`.

  Register:

  ```json
  "test262:es2015:p1c": "node tools/test262/es2015-p1c.js"
  ```

  Register `test/node/es2015-p1c.test.js` in `test/run-node.js`.

- [ ] **Step 9: Implement complete pinned include closure and scratch output**

  Build inventory from source plus:

  ```js
  readTest262HarnessDefinitions(pin.checkoutPath, REPOSITORY_ROOT_URL);
  ```

  Do not use classification provenance for `includeFeatures`.

  Implement the four stable builders explicitly:

  - `buildP1CAuthorityEvidence` renders the exact paths, baseline,
    all-selected disposition, empty owner files, and named-v2 promotion.
  - `projectP1CCoreOutputs` changes only the 81 source classifications,
    exact audit records, and one subset group.
  - `buildP1CReportArtifacts` uses low-level report/coverage helpers to preserve
    selected-path and variant order without importing a broad entry point.
  - `buildP1CPendingAuthority` pins six evidence hashes, exact protected
    operations/projections, one selected destination, `reconciliation: null`,
    and `entryLedgerSha256: null`.

  Build scratch atomically under the requested repository-relative output with
  these files:

  ```text
  authority-record.json
  protected-projection.json
  summary.json
  evidence/es2015-p1c-paths.json
  evidence/es2015-p1c-baseline.json
  evidence/es2015-p1c-disposition.json
  evidence/es2015-p1c-owner-deltas.json
  evidence/es2015-p1c-owner-map.json
  evidence/es2015-p1c-promotion.json
  projected/docs/conformance.md
  projected/docs/test262-report.jsonl
  projected/tools/test262/es2015-audit-evidence.json
  projected/tools/test262/es2015-taxonomy.json
  projected/tools/test262/upstream-subset.json
  ```

  Write to a repository-local staging directory and rename only after every
  file validates.

- [ ] **Step 10: Run tooling unit GREEN**

  ```bash
  TZ=UTC node test/run-node.js test/node/es2015-p1c.test.js
  ```

- [ ] **Step 11: Run the exact real P1C ledger**

  ```bash
  rm -rf .superpowers/sdd/2026-08-23-p1c-catch-binding/execution.json
  TZ=UTC npm run test262:es2015:p1c -- \
    --ledger=tools/test262/es2015-p1c-paths.txt \
    --output=.superpowers/sdd/2026-08-23-p1c-catch-binding/execution.json
  ```

  Expected: exactly 161 passed, zero failed, zero skipped.

- [ ] **Step 12: Verify the fixed child and native parent identity**

  Fetch exact read-only state:

  ```bash
  gh issue view 116 \
    --repo yoonbuck/jsjs \
    --json number,title,state,url \
    > .superpowers/sdd/2026-08-23-p1c-catch-binding/issue-116.json
  gh api repos/yoonbuck/jsjs/issues/116/parent \
    > .superpowers/sdd/2026-08-23-p1c-catch-binding/issue-116-parent.json
  node <<'NODE'
  const fs = require('fs');
  const child = JSON.parse(fs.readFileSync(
    '.superpowers/sdd/2026-08-23-p1c-catch-binding/issue-116.json',
    'utf8'
  ));
  const parent = JSON.parse(fs.readFileSync(
    '.superpowers/sdd/2026-08-23-p1c-catch-binding/issue-116-parent.json',
    'utf8'
  ));
  if (
    child.number !== 116 ||
    child.title !==
      'Implement ES2015 destructuring catch parameters and catch environments' ||
    child.state !== 'OPEN' ||
    parent.number !== 78 ||
    parent.title !==
      'Complete core ES2015 early errors and declaration instantiation' ||
    parent.state !== 'open'
  ) {
    throw new Error('P1C issue or native parent identity drifted');
  }
  NODE
  ```

  Expected: PASS. A renamed/closed child, missing native parent, or closed/
  renamed parent blocks scratch and authority work.

- [ ] **Step 13: Build the ignored authority scratch**

  ```bash
  TZ=UTC npm run test262:es2015:p1c -- \
    --build-scratch \
    --ledger=tools/test262/es2015-p1c-paths.txt \
    --execution=.superpowers/sdd/2026-08-23-p1c-catch-binding/execution.json \
    --output=.superpowers/sdd/2026-08-23-p1c-catch-binding/authority
  ```

  Verify the exact counts/hash, empty owner files, all-pass disposition,
  version-2 promotion, and complete include closure.

- [ ] **Step 14: Obtain fresh Task 5 specification review**

  Require review of exact ledger reconstruction, 81/161 variant coverage,
  source taxonomy status, all-pass disposition, complete pinned include
  closure, zero exclusions, zero selected overlap, scratch-only writes, path
  safety, and no broad execution.

- [ ] **Step 15: Obtain fresh Task 5 quality review**

  Require review of deterministic serialization, atomic scratch writes,
  injected testability, entry-point containment, diagnostics, memory use, and
  no M1-specific copying that obscures P1C's simpler all-pass shape.

- [ ] **Step 16: Rerun Task 5 checks and commit**

  ```bash
  TZ=UTC node test/run-node.js test/node/es2015-p1c.test.js
  TZ=UTC npm run test262:es2015:p1c -- \
    --ledger=tools/test262/es2015-p1c-paths.txt \
    --output=.superpowers/sdd/2026-08-23-p1c-catch-binding/execution.json
  npm run typecheck
  npx eslint \
    tools/test262/es2015-p1c.js \
    test/node/es2015-p1c.test.js \
    test/run-node.js
  npx prettier --check \
    tools/test262/es2015-p1c.js \
    test/node/es2015-p1c.test.js \
    test/run-node.js \
    package.json
  sha256sum tools/test262/es2015-p1c-paths.txt |
    grep -F \
      'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5'
  git diff --check
  git add \
    tools/test262/es2015-p1c.js \
    test/node/es2015-p1c.test.js \
    test/run-node.js \
    package.json
  git commit --author='Copilot <223556219+Copilot@users.noreply.github.com>' \
    -m 'test262: add bounded P1C evidence tooling' \
    -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
  ```

---

### Task 6: Register Generic P1C Promotion Without Broadening the Runner

**Files:**

- Modify: `tools/test262/es2015-roadmap-promotions.js`
- Modify: `tools/test262/promotion-report-features.js`
- Modify: `tools/test262/upstream-run.js`
- Modify: `tools/test262/upstream-select.js`
- Modify: `tools/test262/es2015-audit.js`
- Modify: `test/node/upstream-select.test.js`
- Modify: `test/node/es2015-taxonomy.test.js`
- Modify: `test/node/repository-invariants.test.js`

**Interfaces:**

- Consumes: Task 5 constants and generic named promotion schema v2.
- Produces: an optional P1C promotion input that is a byte-preserving no-op
  while the promotion file is absent.
- Produces: multi-promotion report feature authority without changing M1
  ordering.

- [ ] **Step 1: Start the fresh Task 6 worker**

  Give the worker M1's five lessons: complete include closure, explicit
  exclusion inventory, focused CI constants, static entry-point containment,
  and report feature ordering.

- [ ] **Step 2: Add optional registry and selection RED tests**

  In `test/node/upstream-select.test.js`, add fixtures proving:

  ```js
  assertSame(
    ES2015_P1C_PROMOTION_FILE,
    'tools/test262/es2015-p1c-promotion.json',
  );
  assertSame(P1C_PROMOTION.groupName, 'es2015/p1c-catch-binding');
  assertSame(P1C_PROMOTION.version, 2);
  assertSame(P1C_PROMOTION.rootCount, 81);
  assertSame(P1C_PROMOTION.variantCount, 161);
  ```

  Prove:

  - missing P1C file preserves current bytes;
  - present P1C file adds one unique exact group;
  - overlap with T0/H0/M1 is rejected;
  - unsupported read errors are rethrown;
  - exact metadata/include closure authorizes only the same path; and
  - zero exclusions remain zero.

- [ ] **Step 3: Add report-order RED tests**

  Extend the report-feature tests so:

  ```js
  const reportFeaturesForPath = createPromotionReportFeaturesForPromotions([
    m1Promotion,
    p1cPromotion,
  ]);

  for (const entry of p1cPromotion.entries) {
    assertSame(
      JSON.stringify(reportFeaturesForPath(entry.path)),
      JSON.stringify(entry.features),
      entry.path,
    );
  }
  ```

  Assert P1C has zero source/promotion feature-order divergence and retain the
  exact existing M1 divergent-path list.

- [ ] **Step 4: Add P1C entry-point containment RED**

  In `test/node/repository-invariants.test.js`, mirror the repaired M1 closure
  test for:

  ```text
  package script: test262:es2015:p1c
  entry module: tools/test262/es2015-p1c.js
  required low-level modules:
    tools/test262/harness-definitions.js
  forbidden modules:
    tools/test262/es2015-audit.js
    tools/test262/upstream-run.js
    tools/test262/upstream-select.js
  forbidden call/text tokens:
    runTest262(
    .listTests(
    resolveTest262Paths(
    test262:upstream
    test262:upstream:check
    test262:es2015-release
  ```

- [ ] **Step 5: Run Task 6 RED commands**

  ```bash
  TZ=UTC node test/run-node.js \
    test/node/upstream-select.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/repository-invariants.test.js
  ```

  Expected: FAIL because P1C registry/plumbing/constants do not exist.

- [ ] **Step 6: Generalize the roadmap promotion registry**

  Update `tools/test262/es2015-roadmap-promotions.js`:

  ```js
  export const ES2015_M1_PROMOTION_FILE =
    'tools/test262/es2015-m1-promotion.json';

  export const ES2015_P1C_PROMOTION_FILE =
    'tools/test262/es2015-p1c-promotion.json';

  export const ES2015_P1C_DISPOSITION_FILE =
    'tools/test262/es2015-p1c-disposition.json';

  export const ES2015_ROADMAP_PROMOTIONS = Object.freeze([
    Object.freeze({
      code: 'M1',
      promotionFile: ES2015_M1_PROMOTION_FILE,
      dispositionFile: 'tools/test262/es2015-m1-disposition.json',
    }),
    Object.freeze({
      code: 'P1C',
      promotionFile: ES2015_P1C_PROMOTION_FILE,
      dispositionFile: ES2015_P1C_DISPOSITION_FILE,
    }),
  ]);

  export const ES2015_ROADMAP_PROMOTION_FILES = Object.freeze([
    ...ES2015_ROADMAP_PROMOTIONS.map((entry) => entry.promotionFile),
  ]);
  ```

  Replace M1-only optional reads in upstream selection, upstream execution,
  and audit loading with a loop over `ES2015_ROADMAP_PROMOTION_FILES`.
  `ENOENT` means absent; every other error remains fatal.

- [ ] **Step 7: Generalize report feature authority**

  Add:

  ```js
  export function createPromotionReportFeaturesForPromotions(promotions) {
    const featuresByPath = new Map();

    for (const promotion of promotions) {
      for (const entry of promotion.entries) {
        if (featuresByPath.has(entry.path)) {
          throw new Error(
            `Promotion report features repeat path ${entry.path}`,
          );
        }
        featuresByPath.set(entry.path, entry.features);
      }
    }

    return (file) => featuresByPath.get(file);
  }
  ```

  Retain `createPromotionReportFeaturesForPath(promotion)` as a one-promotion
  wrapper if existing imports use it. In `upstream-run.js`, pass all named
  generic promotions, not T0 or H0, to the multi-promotion helper.

- [ ] **Step 8: Add optional P1C audit inputs**

  Extend `es2015-audit.js` so the absent P1C promotion/disposition is a
  byte-preserving no-op and the present pair contributes:

  ```text
  p1cDispositionSha256
  p1cPromotionSha256
  ```

  Apply exact P1C dispositions/promotion using the same generic non-H0 path as
  M1. Do not add P1C logic to H0-specific structures.

- [ ] **Step 9: Run Task 6 GREEN commands**

  ```bash
  TZ=UTC node test/run-node.js \
    test/node/upstream-select.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/repository-invariants.test.js
  ```

  Before the P1C promotion file is tracked, verify protected outputs remain
  unchanged:

  ```bash
  git diff --exit-code -- \
    tools/test262/es2015-audit-evidence.json \
    tools/test262/es2015-taxonomy.json \
    tools/test262/upstream-subset.json \
    docs/test262-report.jsonl \
    docs/conformance.md \
    tools/test262/es5-selection.json
  ```

- [ ] **Step 10: Obtain fresh Task 6 specification review**

  Require review of optional no-op behavior, named-v2 parsing, exact group
  identity, complete include closure, zero exclusions, no broad feature
  enablement, M1 report-order preservation, and exact focused CI constants.

- [ ] **Step 11: Obtain fresh Task 6 quality review**

  Require review of registry scalability, duplicate-path rejection, import
  boundaries, failure handling, no hardcoded one-promotion branch, and
  protected-byte preservation.

- [ ] **Step 12: Rerun Task 6 checks and commit**

  ```bash
  TZ=UTC node test/run-node.js \
    test/node/upstream-select.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/repository-invariants.test.js
  npm run typecheck
  npx eslint \
    tools/test262/es2015-roadmap-promotions.js \
    tools/test262/promotion-report-features.js \
    tools/test262/upstream-run.js \
    tools/test262/upstream-select.js \
    tools/test262/es2015-audit.js \
    test/node/upstream-select.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/repository-invariants.test.js
  npx prettier --check \
    tools/test262/es2015-roadmap-promotions.js \
    tools/test262/promotion-report-features.js \
    tools/test262/upstream-run.js \
    tools/test262/upstream-select.js \
    tools/test262/es2015-audit.js \
    test/node/upstream-select.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/repository-invariants.test.js
  git diff --check
  git add \
    tools/test262/es2015-roadmap-promotions.js \
    tools/test262/promotion-report-features.js \
    tools/test262/upstream-run.js \
    tools/test262/upstream-select.js \
    tools/test262/es2015-audit.js \
    test/node/upstream-select.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/repository-invariants.test.js
  git commit --author='Copilot <223556219+Copilot@users.noreply.github.com>' \
    -m 'test262: register exact P1C promotion' \
    -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
  ```

---

### Task 7: Prepare the BASE-Owned Pending P1C Authority

**Files:**

- Modify only on the authority branch: `tools/test262/es2015-provenance.json`
- Read: ignored Task 5 authority scratch

**Interfaces:**

- Consumes: reviewed Tasks 1-6 head, exact six-file hashes, exact protected
  projections, current live `origin/main`, and verified issue #116 identity.
- Produces: one canonical pending P1C roadmap authority on main.
- Produces no semantic, evidence, promotion, taxonomy, subset, report, or
  documentation change.

- [ ] **Step 1: Start the fresh Task 7 authority worker**

  The authority worker receives no semantic edit permission. Give it the exact
  pending record from scratch, current BASE SHA, fixed issue #116 identity, and the
  `roadmap-authority-prepare` marker contract.

- [ ] **Step 2: Fail closed on issue #116 and parent #78, then refresh scratch**

  ```bash
  IMPLEMENTATION_HEAD=$(git rev-parse HEAD)
  test -n "$IMPLEMENTATION_HEAD"
  gh issue view 116 \
    --repo yoonbuck/jsjs \
    --json number,title,state,url \
    > .superpowers/sdd/2026-08-23-p1c-catch-binding/issue-116.json
  gh api repos/yoonbuck/jsjs/issues/116/parent \
    > .superpowers/sdd/2026-08-23-p1c-catch-binding/issue-116-parent.json
  node <<'NODE'
  const fs = require('fs');
  const child = JSON.parse(fs.readFileSync(
    '.superpowers/sdd/2026-08-23-p1c-catch-binding/issue-116.json',
    'utf8'
  ));
  const parent = JSON.parse(fs.readFileSync(
    '.superpowers/sdd/2026-08-23-p1c-catch-binding/issue-116-parent.json',
    'utf8'
  ));
  if (
    child.number !== 116 ||
    child.title !==
      'Implement ES2015 destructuring catch parameters and catch environments' ||
    child.state !== 'OPEN' ||
    parent.number !== 78 ||
    parent.title !==
      'Complete core ES2015 early errors and declaration instantiation' ||
    parent.state !== 'open'
  ) {
    throw new Error('P1C issue or native parent identity drifted');
  }
  NODE
  TZ=UTC npm run test262:es2015:p1c -- \
    --build-scratch \
    --ledger=tools/test262/es2015-p1c-paths.txt \
    --execution=.superpowers/sdd/2026-08-23-p1c-catch-binding/execution.json \
    --output=.superpowers/sdd/2026-08-23-p1c-catch-binding/authority
  ```

- [ ] **Step 3: Create an isolated authority worktree from live main**

  Use `superpowers:using-git-worktrees`, then:

  ```bash
  REPOSITORY_ROOT=$(git rev-parse --show-toplevel)
  AUTHORITY_WORKTREE=/home/jordan/jsjs/.worktrees/issue78-p1c-authority
  git fetch origin main
  git worktree add \
    "$AUTHORITY_WORKTREE" \
    -b yoonbuck-issue-78-p1c-authority \
    origin/main
  ```

  Verify the worktree is clean and that the current generic checker already
  includes the M1 report-projection repair. Do not create a repair branch.

- [ ] **Step 4: Append only the pending authority**

  Copy the reviewed scratch record and append it code-unit sorted:

  ```bash
  REPOSITORY_ROOT=/home/jordan/jsjs/.worktrees/issue78-decomposition
  AUTHORITY_WORKTREE=/home/jordan/jsjs/.worktrees/issue78-p1c-authority
  cp \
    "$REPOSITORY_ROOT/.superpowers/sdd/2026-08-23-p1c-catch-binding/authority/authority-record.json" \
    "$AUTHORITY_WORKTREE/.superpowers-p1c-authority-record.json"
  cd "$AUTHORITY_WORKTREE"
  node --input-type=module <<'NODE'
  import fs from 'node:fs';

  const manifestPath = 'tools/test262/es2015-provenance.json';
  const recordPath = '.superpowers-p1c-authority-record.json';
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const authority = JSON.parse(fs.readFileSync(recordPath, 'utf8'));

  if (
    authority.code !== 'P1C' ||
    authority.issue !== 116 ||
    authority.parentIssue !== 70 ||
    authority.state !== 'pending' ||
    authority.source.rootCount !== 81 ||
    authority.source.variantCount !== 161 ||
    authority.source.pathSha256 !==
      'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5' ||
    authority.source.entryLedgerSha256 !== null ||
    authority.reconciliation !== null ||
    authority.destinations.length !== 1 ||
    authority.destinations[0].status !== 'selected-passing' ||
    authority.destinations[0].blocker !== null ||
    authority.destinations[0].issue !== 116
  ) {
    throw new Error('P1C scratch authority has unexpected semantics');
  }

  if (
    manifest.roadmapAuthorities.some((entry) => entry.code === 'P1C')
  ) {
    throw new Error('P1C roadmap authority already exists');
  }

  manifest.roadmapAuthorities = [
    ...manifest.roadmapAuthorities,
    authority,
  ].sort((left, right) =>
    left.code < right.code ? -1 : left.code > right.code ? 1 : 0
  );
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  NODE
  rm .superpowers-p1c-authority-record.json
  ```

  Evidence must contain exactly the six P1C files. The sole destination must be
  `selected-passing`, null blocker, and issue `116`.

- [ ] **Step 5: Prove no BASE repair is required**

  Stage only the manifest and create an ephemeral check commit:

  ```bash
  AUTHORITY_WORKTREE=/home/jordan/jsjs/.worktrees/issue78-p1c-authority
  cd "$AUTHORITY_WORKTREE"
  AUTHORITY_BASE=$(git rev-parse HEAD)
  git add tools/test262/es2015-provenance.json
  AUTHORITY_TREE=$(git write-tree)
  AUTHORITY_CHECK_HEAD=$(
    printf 'P1C authority preparation candidate\n' |
      git commit-tree "$AUTHORITY_TREE" -p "$AUTHORITY_BASE"
  )
  BASE_MANIFEST_SHA=$(
    git show "$AUTHORITY_BASE":tools/test262/es2015-provenance.json |
      sha256sum |
      cut -d' ' -f1
  )
  RECORD_SHA=$(
    node --input-type=module -e '
      import fs from "node:fs";
      import {
        canonicalRoadmapAuthoritySha256,
      } from "./tools/test262/es2015-provenance.js";
      const manifest = JSON.parse(fs.readFileSync(
        "tools/test262/es2015-provenance.json",
        "utf8"
      ));
      const authority = manifest.roadmapAuthorities.find(
        (entry) => entry.code === "P1C"
      );
      process.stdout.write(canonicalRoadmapAuthoritySha256(authority));
    '
  )
  ```

  Build the exact marker:

  ```bash
  AUTHORITY_MARKER=$(cat <<EOF
  <!-- es2015-roadmap-authority-prepare
  parent:70
  code:P1C
  issue:116
  base:$AUTHORITY_BASE
  base-manifest-sha256:$BASE_MANIFEST_SHA
  record-sha256:$RECORD_SHA
  -->
  EOF
  )
  TZ=UTC node tools/test262/es2015-provenance-check.js \
    --check-range \
    --base="$AUTHORITY_BASE" \
    --head="$AUTHORITY_CHECK_HEAD" \
    --profile=roadmap-authority-prepare \
    --marker="$AUTHORITY_MARKER"
  mkdir -p \
    /home/jordan/jsjs/.worktrees/issue78-decomposition/.superpowers/sdd/2026-08-23-p1c-catch-binding/task-7
  printf '%s\n' "$AUTHORITY_MARKER" \
    > /home/jordan/jsjs/.worktrees/issue78-decomposition/.superpowers/sdd/2026-08-23-p1c-catch-binding/task-7/authority-marker.txt
  ```

  Expected: PASS using the immutable BASE checker. If it fails because generic
  P1C evidence or named promotion is unsupported, stop and amend the design;
  do not create an unreviewed BASE repair.

- [ ] **Step 6: Run authority-focused validation**

  ```bash
  AUTHORITY_WORKTREE=/home/jordan/jsjs/.worktrees/issue78-p1c-authority
  cd "$AUTHORITY_WORKTREE"
  TZ=UTC node test/run-node.js \
    test/node/es2015-provenance.test.js
  node --input-type=module -e '
    import fs from "node:fs";
    import {
      parseEs2015ProvenanceManifest,
    } from "./tools/test262/es2015-provenance.js";
    parseEs2015ProvenanceManifest(
      fs.readFileSync("tools/test262/es2015-provenance.json", "utf8")
    );
  '
  git diff --check
  test "$(git status --short | wc -l)" -eq 1
  test "$(git status --short)" = \
    ' M tools/test262/es2015-provenance.json'
  ```

- [ ] **Step 7: Obtain fresh Task 7 specification review**

  Require exact source identity, six evidence hashes, protected operations,
  one selected destination, `reconciliation: null`, null entry-ledger hash,
  fixed issue `116`/parent `78` identity, and data-only range.

- [ ] **Step 8: Obtain fresh Task 7 quality/security review**

  Require fail-closed marker handling, BASE checker execution, no HEAD checker
  trust, no extra paths, canonical record ordering, and no reusable repair
  exception.

- [ ] **Step 9: Commit, open, verify, and merge the authority PR**

  ```bash
  AUTHORITY_WORKTREE=/home/jordan/jsjs/.worktrees/issue78-p1c-authority
  cd "$AUTHORITY_WORKTREE"
  git add tools/test262/es2015-provenance.json
  git commit --author='Copilot <223556219+Copilot@users.noreply.github.com>' \
    -m 'chore: prepare P1C roadmap authority' \
    -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
  AUTHORITY_BASE=$(git rev-parse HEAD^)
  AUTHORITY_HEAD=$(git rev-parse HEAD)
  AUTHORITY_MARKER=$(cat \
    /home/jordan/jsjs/.worktrees/issue78-decomposition/.superpowers/sdd/2026-08-23-p1c-catch-binding/task-7/authority-marker.txt)
  TZ=UTC node tools/test262/es2015-provenance-check.js \
    --check-range \
    --base="$AUTHORITY_BASE" \
    --head="$AUTHORITY_HEAD" \
    --profile=roadmap-authority-prepare \
    --marker="$AUTHORITY_MARKER"
  ```

  Open the data-only PR with `AUTHORITY_MARKER`, require exact-head CI and
  CodeQL, squash-merge it, and record the merge SHA under:

  ```text
  .superpowers/sdd/2026-08-23-p1c-catch-binding/task-7/authority-merge.txt
  ```

- [ ] **Step 10: Rebase the implementation branch onto repaired live main**

  Fetch main, verify the P1C authority is present and pending, then rebase the
  implementation commits. Do not carry the authority worktree's manifest edit
  as a second commit.

---

### Task 8: Consume P1C Authority and Apply Exact Protected Outputs

**Files:**

- Add: the six P1C evidence JSON files
- Modify: `tools/test262/es2015-provenance.json`
- Modify: `tools/test262/es2015-audit-evidence.json`
- Modify: `tools/test262/es2015-taxonomy.json`
- Modify: `tools/test262/upstream-subset.json`
- Modify: `docs/test262-report.jsonl`
- Modify generated block only: `docs/conformance.md`
- Modify: `.prettierignore`
- Modify: `test/node/es2015-p1c.test.js`
- Modify: `test/node/upstream-select.test.js`
- Modify: `test/node/es2015-taxonomy.test.js`
- Modify: `test/node/es2015-provenance.test.js`
- Modify: `test/node/repository-invariants.test.js`
- Modify: `test/node/es2015-m1.test.js`
- Modify: `test/ci/es2015-syntax-test262.test.js`
- Modify: `docs/architecture.md`
- Modify: `docs/testing.md`

**Interfaces:**

- Consumes: merged pending authority, final exact execution, scratch evidence,
  named P1C promotion plumbing, and reviewed production code.
- Produces: applied P1C authority, exact promotion, selected subset, balanced
  taxonomy/report/conformance, and documented focused workflow.

- [ ] **Step 1: Start the fresh Task 8 consumer worker**

  Give the worker the merged authority SHA, pending record, exact scratch
  bundle, consumer marker contract, and strict protected path list.

- [ ] **Step 2: Reverify issue linkage, then refresh exact execution and scratch**

  ```bash
  gh issue view 116 \
    --repo yoonbuck/jsjs \
    --json number,title,state,url \
    > .superpowers/sdd/2026-08-23-p1c-catch-binding/issue-116.json
  gh api repos/yoonbuck/jsjs/issues/116/parent \
    > .superpowers/sdd/2026-08-23-p1c-catch-binding/issue-116-parent.json
  node <<'NODE'
  const fs = require('fs');
  const child = JSON.parse(fs.readFileSync(
    '.superpowers/sdd/2026-08-23-p1c-catch-binding/issue-116.json',
    'utf8'
  ));
  const parent = JSON.parse(fs.readFileSync(
    '.superpowers/sdd/2026-08-23-p1c-catch-binding/issue-116-parent.json',
    'utf8'
  ));
  if (
    child.number !== 116 ||
    child.title !==
      'Implement ES2015 destructuring catch parameters and catch environments' ||
    child.state !== 'OPEN' ||
    parent.number !== 78 ||
    parent.title !==
      'Complete core ES2015 early errors and declaration instantiation' ||
    parent.state !== 'open'
  ) {
    throw new Error('P1C issue or native parent identity drifted');
  }
  NODE
  TZ=UTC npm run test262:es2015:p1c -- \
    --ledger=tools/test262/es2015-p1c-paths.txt \
    --output=.superpowers/sdd/2026-08-23-p1c-catch-binding/execution.json
  TZ=UTC npm run test262:es2015:p1c -- \
    --build-scratch \
    --ledger=tools/test262/es2015-p1c-paths.txt \
    --execution=.superpowers/sdd/2026-08-23-p1c-catch-binding/execution.json \
    --output=.superpowers/sdd/2026-08-23-p1c-catch-binding/authority
  ```

  Expected: 161 passed, zero failed/skipped; scratch authority canonical-equal
  to main's pending record except for state.

- [ ] **Step 3: Copy the six exact evidence files**

  ```bash
  cp \
    .superpowers/sdd/2026-08-23-p1c-catch-binding/authority/evidence/es2015-p1c-*.json \
    tools/test262/
  ```

  Verify path JSON has 81 entries, baseline has 81 entries, disposition has 81
  selected destinations, owner files are empty arrays, and promotion is named
  v2 with 81 entries / 161 variants.

- [ ] **Step 4: Apply only the scratch protected projections**

  Copy exact projected bytes:

  ```bash
  cp \
    .superpowers/sdd/2026-08-23-p1c-catch-binding/authority/projected/tools/test262/es2015-audit-evidence.json \
    tools/test262/es2015-audit-evidence.json
  cp \
    .superpowers/sdd/2026-08-23-p1c-catch-binding/authority/projected/tools/test262/es2015-taxonomy.json \
    tools/test262/es2015-taxonomy.json
  cp \
    .superpowers/sdd/2026-08-23-p1c-catch-binding/authority/projected/tools/test262/upstream-subset.json \
    tools/test262/upstream-subset.json
  cp \
    .superpowers/sdd/2026-08-23-p1c-catch-binding/authority/projected/docs/test262-report.jsonl \
    docs/test262-report.jsonl
  cp \
    .superpowers/sdd/2026-08-23-p1c-catch-binding/authority/projected/docs/conformance.md \
    docs/conformance.md
  ```

  Change only P1C authority `pending -> applied` in
  `tools/test262/es2015-provenance.json`.

- [ ] **Step 5: Assert live-base taxonomy deltas and exact generated totals**

  Capture the consumer BASE artifacts before applying projections:

  ```bash
  mkdir -p \
    .superpowers/sdd/2026-08-23-p1c-catch-binding/task-8
  git show "$CONSUMER_BASE":tools/test262/es2015-taxonomy.json \
    > .superpowers/sdd/2026-08-23-p1c-catch-binding/task-8/base-taxonomy.json
  git show "$CONSUMER_BASE":tools/test262/upstream-subset.json \
    > .superpowers/sdd/2026-08-23-p1c-catch-binding/task-8/base-subset.json
  git show "$CONSUMER_BASE":tools/test262/es5-selection.json \
    > .superpowers/sdd/2026-08-23-p1c-catch-binding/task-8/base-selection.json
  ```

  Add a focused `test/node/es2015-p1c.test.js` assertion that recomputes
  absolute taxonomy counts from those live BASE bytes and the projected HEAD
  bytes. Require:

  ```text
  selected-passing delta: +81 roots / +161 variants
  P1 blocker delta:       -81 roots / -161 variants
  every edition partition total: unchanged from live BASE
  every foreign classification:  byte-equivalent
  every other core status row:    unchanged from live BASE
  whole-tree roots/variants:      unchanged from live BASE
  ```

  Do not assert historical absolute taxonomy totals from the design. Print the
  recomputed live BASE and HEAD values into the ignored task report.

  Independently require the reviewed generated accounting:

  ```text
  HEAD selected paths: 20,676
  HEAD selected variants: 39,300
  HEAD subset groups: 62
  HEAD generated non-T0 paths: 14,353
  selected path delta from live BASE: +81
  selected variant delta from live BASE: +161
  subset group delta from live BASE: +1
  generated path delta from live BASE: +81
  exclusions: byte-identical to live BASE
  ```

  Compute selected paths with `upstreamSubsetPaths`. Compute generated
  non-T0 paths as the unique union of every subset group except
  `es2015/audit-passing-promotion`. Reject overlap, missing P1C roots, a second
  P1C group, or any absolute total other than 20,676 / 39,300 / 62 / 14,353.

  Update the applied-M1 integration totals in
  `test/node/es2015-m1.test.js` only after the P1C promotion exists:

  ```js
  assertSame(subset.groups.length, 62);
  assertSame(
    new Set(subset.groups.flatMap((group) => group.paths)).size,
    20676,
  );
  ```

  Update focused syntax-selection constants:

  ```js
  const GENERATED_PATH_COUNT = 14353;
  const P1C_PROMOTION_GROUP = 'es2015/p1c-catch-binding';
  const P1C_PROMOTION_ROOT_COUNT = 81;
  ```

  Filter P1C paths out of issue-#25 expansion calculations, require one unique
  P1C group of 81 paths, and add `P1C_PROMOTION_ROOT_COUNT` to the exact
  generated-total equation.

- [ ] **Step 6: Add generated ownership and documentation**

  Add six exact P1C entries to `.prettierignore` and the generated-file
  ownership map in `test/node/repository-invariants.test.js`.

  Update `docs/architecture.md` with the shared catch parameter environment
  kernel and evaluator-specific completion adapters.

  Update `docs/testing.md` with:

  ```text
  TZ=UTC npm run test262:es2015:p1c -- \
    --ledger=tools/test262/es2015-p1c-paths.txt \
    --output=.superpowers/sdd/2026-08-23-p1c-catch-binding/execution.json
  ```

  Document exact ledger/count/hash, complete include closure, zero exclusions,
  named promotion group, selected union 20,676 paths / 62 groups at the
  reviewed base, scratch-only evidence before authority, and the local
  broad/full prohibition.

- [ ] **Step 7: Add consumer/projection RED-GREEN tests**

  In `test/node/es2015-p1c.test.js` and
  `test/node/es2015-provenance.test.js`, prove:

  - wrong BASE fails;
  - absent/non-pending/mutated P1C authority fails;
  - partial/foreign evidence fails;
  - promotion feature/include order drift fails;
  - report records remain selected-path ordered and variant ordered;
  - M1 report feature arrays remain preserved;
  - empty P1C owner files are required;
  - any `es5-selection.json` change fails;
  - exact pending-to-applied plus projection passes; and
  - replay/applied-to-applied fails.

- [ ] **Step 8: Build and validate the consumer marker**

  ```bash
  CONSUMER_BASE=$(git merge-base origin/main HEAD)
  SOURCE_PATH_SHA=e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5
  SOURCE_ENTRY_SHA=null
  PROJECTION_SHA=$(
    node -e '
      const fs = require("fs");
      const summary = JSON.parse(fs.readFileSync(
        ".superpowers/sdd/2026-08-23-p1c-catch-binding/authority/summary.json",
        "utf8"
      ));
      process.stdout.write(summary.protectedProjectionSha256);
    '
  )
  CONSUMER_MARKER=$(cat <<EOF
  <!-- es2015-roadmap-authority-consume
  parent:70
  code:P1C
  issue:116
  profile:roadmap-reclassification:P1C
  base:$CONSUMER_BASE
  source-path-sha256:$SOURCE_PATH_SHA
  source-entry-sha256:$SOURCE_ENTRY_SHA
  protected-projection-sha256:$PROJECTION_SHA
  -->
  EOF
  )
  mkdir -p \
    .superpowers/sdd/2026-08-23-p1c-catch-binding/task-8
  printf '%s\n' "$CONSUMER_MARKER" \
    > .superpowers/sdd/2026-08-23-p1c-catch-binding/task-8/consumer-marker.txt
  ```

  Create an ephemeral check commit and run the immutable BASE checker:

  ```bash
  git add -A
  CONSUMER_TREE=$(git write-tree)
  CONSUMER_CHECK_HEAD=$(
    printf 'P1C consumer candidate\n' |
      git commit-tree "$CONSUMER_TREE" -p "$CONSUMER_BASE"
  )
  TZ=UTC node tools/test262/es2015-provenance-check.js \
    --check-range \
    --base="$CONSUMER_BASE" \
    --head="$CONSUMER_CHECK_HEAD" \
    --profile=roadmap-reclassification:P1C \
    --marker="$CONSUMER_MARKER"
  ```

- [ ] **Step 9: Run exact focused consumer checks**

  ```bash
  TZ=UTC node test/run-node.js \
    test/parser.test.js \
    test/catch-binding.test.js \
    test/try-statements.test.js \
    test/destructuring.test.js \
    test/eval.test.js \
    test/generator-control-flow.test.js \
    test/node/es2015-p1c.test.js \
    test/node/upstream-select.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/es2015-m1.test.js \
    test/node/es2015-provenance.test.js \
    test/node/repository-invariants.test.js
  TZ=UTC node test/run-node.js test/ci/es2015-syntax-test262.test.js
  node test/run-browser-playwright.js \
    test/parser.test.js \
    test/catch-binding.test.js \
    test/try-statements.test.js \
    test/destructuring.test.js \
    test/eval.test.js \
    test/generator-control-flow.test.js
  TZ=UTC npm run test262:es2015:p1c -- \
    --ledger=tools/test262/es2015-p1c-paths.txt \
    --output=.superpowers/sdd/2026-08-23-p1c-catch-binding/execution.json
  npm run typecheck
  npm run ci:check
  git diff --check
  ```

  Do not run broad audit, selection, exclusion execution, upstream Test262,
  full portable registries, or `ci:contract` locally. Exact-head CI owns those
  gates.

- [ ] **Step 10: Obtain fresh Task 8 specification review**

  Require review of exact 81/161 movement, promotion contents, include closure,
  empty owner files, no exclusion change, report order, protected operations,
  pending-to-applied transition, current count balance, and documentation.

- [ ] **Step 11: Obtain fresh Task 8 quality review**

  Require review of deterministic bytes, generated ownership, registry
  maintainability, range containment, diagnostics, no broad local command, and
  no P1F/P1G leakage.

- [ ] **Step 12: Rerun Task 8 checks and commit**

  Stage only reviewed consumer files, then:

  ```bash
  git commit --author='Copilot <223556219+Copilot@users.noreply.github.com>' \
    -m 'test262: consume P1C catch binding authority' \
    -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
  ```

---

### Task 9: Final Review, Exact-Head Delivery, and Closure Evidence

**Files:**

- Modify only for confirmed review findings: files already owned by Tasks 1-8
- Write ignored reports under `.superpowers/sdd/2026-08-23-p1c-catch-binding/task-9/`
- GitHub updates occur only after merge

**Interfaces:**

- Consumes: complete P1C branch, applied authority consumer marker, exact
  execution evidence, and all task reviews.
- Produces: reviewed PR, exact-head CI/CodeQL evidence, merge SHA, and issue
  closure/update evidence.

- [ ] **Step 1: Start a fresh whole-branch implementation verifier**

  Give the verifier the design, this plan, `origin/main...HEAD`, all task
  reports, exact ledger, authority marker, and local-command prohibitions.

- [ ] **Step 2: Run final exact local verification**

  ```bash
  TZ=UTC node test/run-node.js \
    test/parser.test.js \
    test/catch-binding.test.js \
    test/try-statements.test.js \
    test/destructuring.test.js \
    test/eval.test.js \
    test/generator-control-flow.test.js \
    test/node/es2015-p1c.test.js \
    test/node/upstream-select.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/es2015-m1.test.js \
    test/node/es2015-provenance.test.js \
    test/node/repository-invariants.test.js \
    test/node/workflow-contract.test.js
  node test/run-browser-playwright.js \
    test/parser.test.js \
    test/catch-binding.test.js \
    test/try-statements.test.js \
    test/destructuring.test.js \
    test/eval.test.js \
    test/generator-control-flow.test.js
  TZ=UTC npm run test262:es2015:p1c -- \
    --ledger=tools/test262/es2015-p1c-paths.txt \
    --output=.superpowers/sdd/2026-08-23-p1c-catch-binding/execution.json
  npm run typecheck
  npm run ci:check
  npx eslint \
    src/parser.js \
    src/evaluator/catch-binding.js \
    src/evaluator/statements.js \
    src/evaluator/generator-statement-frames.js \
    tools/test262/es2015-p1c.js \
    tools/test262/es2015-roadmap-promotions.js \
    tools/test262/promotion-report-features.js \
    tools/test262/upstream-run.js \
    tools/test262/upstream-select.js \
    tools/test262/es2015-audit.js \
    test/parser.test.js \
    test/catch-binding.test.js \
    test/node/es2015-p1c.test.js \
    test/node/upstream-select.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/es2015-m1.test.js \
    test/node/es2015-provenance.test.js \
    test/node/repository-invariants.test.js \
    test/ci/es2015-syntax-test262.test.js
  npx prettier --check \
    src/parser.js \
    src/evaluator/catch-binding.js \
    src/evaluator/statements.js \
    src/evaluator/generator-statement-frames.js \
    tools/test262/es2015-p1c.js \
    tools/test262/es2015-roadmap-promotions.js \
    tools/test262/promotion-report-features.js \
    tools/test262/upstream-run.js \
    tools/test262/upstream-select.js \
    tools/test262/es2015-audit.js \
    test/parser.test.js \
    test/catch-binding.test.js \
    test/node/es2015-p1c.test.js \
    test/node/upstream-select.test.js \
    test/node/es2015-taxonomy.test.js \
    test/node/es2015-provenance.test.js \
    test/node/repository-invariants.test.js \
    test/ci/es2015-syntax-test262.test.js \
    docs/architecture.md \
    docs/testing.md
  sha256sum tools/test262/es2015-p1c-paths.txt |
    grep -F \
      'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5'
  git diff --check
  ```

- [ ] **Step 3: Verify exact scope and no forbidden command history**

  Confirm:

  - no P1F/P1G/later syntax file or decision;
  - no `es5-selection.json` byte change;
  - no full local suite or broad Test262 invocation in task reports;
  - six P1C evidence files only;
  - P1C authority is applied once;
  - exact 81/161 promotion;
  - exact ledger hash;
  - no foreign taxonomy movement; and
  - no untracked non-ignored artifact.

- [ ] **Step 4: Obtain fresh whole-branch specification review**

  Require explicit approval of parser grammar, early errors, shared catch
  initialization, sync/generator parity, iterator/abrupt/Realm behavior,
  exact Test262 evidence, named promotion, authority lifecycle, protected
  outputs, and P1C-only scope.

- [ ] **Step 5: Obtain a different fresh whole-branch quality review**

  Require explicit approval of code clarity, module boundaries, JSDoc, test
  quality, portability, path safety, determinism, report ordering, authority
  containment, and absence of broad local execution.

- [ ] **Step 6: Fix findings and rerun exact checks**

  Make one focused commit per accepted finding with Copilot author/trailer.
  Repeat Steps 2, 4, and 5 until both whole-branch reviews approve the same
  HEAD.

- [ ] **Step 7: Open the consumer PR with the exact marker**

  Include:

  - P1C issue and parent #78;
  - design and plan paths;
  - exact 81/161 ledger/hash;
  - exact local focused evidence;
  - authority preparation merge SHA;
  - consumer marker;
  - no P1F/P1G/later work;
  - no broad/full local Test262 or full suites; and
  - required exact-head CI and CodeQL gates.

- [ ] **Step 8: Verify exact-head CI and CodeQL**

  Require all generated ordinary jobs, including full Node/browser/JSC,
  focused ES2015 release, broad pinned subset, taxonomy/audit/selection/
  exclusion gates, provenance guard, and CodeQL to pass at the reviewed head.
  Do not substitute local broad execution.

- [ ] **Step 9: Squash-merge and verify exact main**

  Record:

  ```text
  .superpowers/sdd/2026-08-23-p1c-catch-binding/task-9/pr.txt
  .superpowers/sdd/2026-08-23-p1c-catch-binding/task-9/merge-sha.txt
  .superpowers/sdd/2026-08-23-p1c-catch-binding/task-9/ci-run.txt
  .superpowers/sdd/2026-08-23-p1c-catch-binding/task-9/codeql-run.txt
  ```

  Verify `origin/main` contains the applied P1C authority and exact evidence.

- [ ] **Step 10: Publish issue evidence after merge**

  Update the P1C child, #78, #70, and #98 with:

  - source and promotion ledger identities;
  - 81/161 selected-passing movement;
  - exact merge SHA;
  - reviewed head;
  - CI and CodeQL identities;
  - zero exclusions;
  - complete include closure;
  - P1 remaining selector/count;
  - no P1F/P1G/later scope; and
  - closure evidence.

  Close P1C only after exact-main verification. Keep #78 open for its remaining
  children.

---

## Spec Coverage Matrix

| Design requirement                         | Plan task                        |
| ------------------------------------------ | -------------------------------- |
| Durable exact P1C ledger                   | Task 1                           |
| Exact P1C 81/161 ledger/hash               | Tasks 1, 5, 7-9                  |
| Catch parser pattern context               | Task 2                           |
| Source/custom/reusable AST parity          | Task 2                           |
| Duplicate/strict/body lexical early errors | Task 2                           |
| Shared catch parameter environment kernel  | Task 3                           |
| All bindings created before initialization | Task 3                           |
| Sync/generator parity                      | Tasks 3-4                        |
| Per-execution fresh environment            | Task 4                           |
| Iterator close and abrupt completion       | Task 4                           |
| Direct eval variable environment           | Task 4                           |
| Same-Agent cross-Realm value behavior      | Task 4                           |
| Evaluating-Realm errors                    | Task 4                           |
| Complete pinned include closure            | Tasks 5, 8                       |
| Zero exclusion inventory                   | Tasks 5-6, 8                     |
| Bounded runner and entry-point containment | Tasks 5-6                        |
| Fixed issue #116 / parent #78 verification | Tasks 5, 7-8                     |
| Focused CI constants                       | Task 8                           |
| Live-base taxonomy delta gates             | Task 8                           |
| Report feature/order preservation          | Tasks 6, 8                       |
| Generic named promotion v2                 | Tasks 5-6, 8                     |
| No BASE repair                             | Task 7                           |
| Separate authority preparation             | Task 7                           |
| Pending-to-applied consumer                | Task 8                           |
| Protected output balance                   | Task 8                           |
| No broad/full local commands               | Global constraints and Tasks 1-9 |
| Fresh worker/spec/quality reviews per task | Review protocol and Tasks 1-9    |
| Exact-head CI/CodeQL and issue evidence    | Task 9                           |
