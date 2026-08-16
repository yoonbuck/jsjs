# Module Capability and Early-Error Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ordinary and custom `parseModule` ASTs enforce the same implemented-language capability and strict early-error boundary as scripts while preserving ES2015 static module syntax.

**Architecture:** Reuse the existing iterative capability/early-error traversal as the single validator, adding only an explicit module-aware syntax mode. Keep the existing descriptor-safe module-shape and ModuleItemList checks, then traverse the complete module AST as strict code; module declarations/specifiers are admitted only in their validated positions, while every ordinary descendant retains the existing checks.

**Tech Stack:** Plain ECMAScript modules, Acorn 8.18.0 at `ecmaVersion: 6`, strict JSDoc/TypeScript checking, portable custom test harness, Node, Chromium, JavaScriptCore, and pinned Test262 `b363f29d3c43c626dc852744ad64a0b48a003693`.

## Global Constraints

- Start from exact merged-main SHA `94bc89d2128df5875818759c8394290d6ed8b239`.
- Keep stable public interfaces unchanged: `parseModule(source, options?)`, `createModuleLoader(realm, host)`, and `ModuleLoaderError`.
- Preserve descriptor-safe custom AST snapshotting and never mutate, strip, or annotate the retained module AST.
- Modules are strict from the root; ordinary and custom ASTs must enforce one supported capability and early-error boundary.
- Admit only implemented ES2015 static module forms and prior implemented language forms.
- Do not implement dynamic import, `import.meta`, top-level await, async functions/generators, RegExp `u`/`y`, Unicode code-point escapes, class fields/private names, object rest/spread, issue #67, or #61 release-integration fixes.
- Every production behavior begins with a failing regression that proves the current incorrect acceptance.
- After each task, obtain separate fresh specification and quality reviews; fix findings and repeat both review gates until clean.
- Run focused pinned module Test262 locally only under `TZ=UTC`.

## File and Interface Map

- Modify `src/parser.js`: thread source/provenance into module validation and make the shared capability traversal module-aware.
- Modify `test/module-parser.test.js`: ordinary/custom RED cases and adjacent valid controls.
- Modify `test/module-loader.test.js`: prove dependency parsing preserves the loader's typed parse-phase boundary.
- Modify `test/ci/es2015-module-test262.test.js`: add exact pinned parse-negative module roots that exercise the repaired boundary, if the pinned checkout contains compatible tests.
- Modify `docs/conformance.md`: publish strict module validation parity.
- Modify `docs/limitations.md`: state that unsupported syntax/RegExp forms are rejected equally for script and module source.

---

### Task 1: Shared Module-Aware Capability Validation

**Files:**

- Modify: `test/module-parser.test.js`
- Modify: `src/parser.js`

**Interfaces:**

- Consumes: `parseModule(source, options = {})`, `checkStatementPositionFunctionDeclarations(root, source, rootStrict, allOwnKeys, sourceIndependentNodes, rootContext)`, existing module shape validation, and existing script capability/early-error helpers.
- Produces: unchanged `parseModule(source, options = {})` whose ordinary and custom results share strict module-aware capability validation.

- [ ] **Step 1: Add ordinary-module RED tests with valid controls**

Append focused cases to `test/module-parser.test.js`:

```js
{
  name: 'ordinary modules enforce the supported capability and strict early-error boundary',
  run() {
    for (const source of [
      'new.target;',
      'var pattern = /./u;',
      'function duplicate(a, a) {}',
      'var invalid = /]/;',
    ]) {
      assertThrows(() => parseModule(source), SyntaxError);
    }
  },
},
{
  name: 'ordinary module validation keeps adjacent implemented forms',
  run() {
    for (const source of [
      'import value from "dep"; export { value };',
      'function distinct(a, b) { return /a/gim.test(a + b); }',
      'export default function* values() { yield 1; }',
    ]) {
      assertSame(parseModule(source).sourceType, 'module');
    }
  },
},
```

- [ ] **Step 2: Run the focused RED and preserve its evidence**

Run:

```bash
node test/run-node.js test/module-parser.test.js
```

Expected: FAIL because at least `new.target`, `/./u`, duplicate strict parameters, and `/]/` are accepted by the ordinary module path. Record the failing test names and accepted sources before production changes.

- [ ] **Step 3: Add custom-AST parity RED tests**

Use Acorn-produced valid module ASTs, mutate only engine-owned snapshots, then inject them through `options.parse`:

```js
{
  name: 'custom modules enforce capability and strict binding early errors',
  run() {
    const meta = parseModule('function kept() { return 1; }');
    meta.body[0].body.body[0].argument = {
      type: 'MetaProperty',
      meta: { type: 'Identifier', name: 'new' },
      property: { type: 'Identifier', name: 'target' },
    };
    assertThrows(() => parseModule('', { parse: () => meta }), SyntaxError);

    const duplicate = parseModule('function kept(a, b) {}');
    duplicate.body[0].params[1].name = 'a';
    assertThrows(
      () => parseModule('', { parse: () => duplicate }),
      SyntaxError,
    );

    const imported = parseModule('import { value as local } from "dep";');
    imported.body[0].specifiers[0].local.name = 'eval';
    assertThrows(
      () => parseModule('', { parse: () => imported }),
      SyntaxError,
    );
  },
},
```

Also add a custom RegExp literal by starting from `parseModule('var pattern = /a/;')`, replacing its `regex.pattern`, `raw`, and reconstructed `value` consistently with an ES5-invalid `/]/`, and assert `SyntaxError`.

- [ ] **Step 4: Run the expanded RED**

Run:

```bash
node test/run-node.js test/module-parser.test.js
```

Expected: FAIL on the new parity cases. Existing descriptor, duplicate export, duplicate binding, and entry-classification cases must still run before the new failures.

- [ ] **Step 5: Thread module source and provenance into validation**

Change the `parseModule` return path and module validator signature:

```js
return validateModuleProgram(program, source, customAst);

function validateModuleProgram(program, source, customAst) {
  // Existing descriptor-safe module shape checks first.
  // Existing ModuleItemList declaration/export checks remain.
  // Then one strict, module-aware shared capability walk.
}
```

For a custom parser, prevent range-based identifier checks from treating the caller's `source` as the AST's trusted spelling. Follow the same source-independent principle used by reusable script AST snapshots.

- [ ] **Step 6: Add a narrow module-aware mode to the shared traversal**

Extend the traversal and unsupported-node helper with an explicit options record rather than positional booleans:

```js
const SCRIPT_VALIDATION_CONTEXT = Object.freeze({
  module: false,
  allOwnKeys: false,
});

const moduleValidationContext = {
  module: true,
  allOwnKeys: customAst,
};
```

The mode must:

- admit `ImportDeclaration`, `ExportNamedDeclaration`,
  `ExportDefaultDeclaration`, and `ExportAllDeclaration` only as direct
  `Program.body` children already accepted by `validateModuleItem`;
- admit `ImportDefaultSpecifier`, `ImportNamespaceSpecifier`,
  `ImportSpecifier`, and `ExportSpecifier` only below the corresponding
  validated declaration;
- admit module source literals, imported/exported identifiers, exported
  declarations, and default-export declarations/expressions only in their exact
  module positions;
- continue walking exported declarations/default expressions so all nested
  ordinary syntax receives existing capability and early-error checks;
- classify each import specifier's `local` child as a binding context, so custom
  `eval`/`arguments` bindings reject in strict module code;
- skip only the script-specific “module declarations are unsupported” message,
  not any other unsupported-node, scalar-shape, placement, strictness, RegExp,
  parameter, class, generator, or statement-position check.

Do not introduce a second recursive validator or transform module nodes into a synthetic script.

- [ ] **Step 7: Remove superseded per-payload custom validation**

Delete `validateCustomModuleStatement` and
`validateCustomModuleDefaultDeclaration` only after the complete module-aware
walk covers their responsibilities. Remove `customAst` branches from
`validateModuleItem`, `validateExportNamedDeclaration`, and
`validateExportDefaultDeclaration` that existed solely to call those helpers.

- [ ] **Step 8: Run GREEN and script-regression coverage**

Run:

```bash
node test/run-node.js test/module-parser.test.js test/parser.test.js
```

Expected: PASS. The module tests must prove all new rejections and valid controls; the script suite must prove its established behavior is unchanged.

- [ ] **Step 9: Run static gates for the parser change**

Run:

```bash
npm run typecheck && npm run lint && npm run format
```

Expected: all commands exit 0.

- [ ] **Step 10: Complete fresh specification and quality review loops**

Specification review checks every requirement in issue #66 and
`docs/superpowers/specs/2026-08-16-module-capability-early-errors-design.md`.
Quality review checks traversal context propagation, descriptor safety,
strict binding positions, source-dependent checks, stack safety, error types,
JSDoc, and scope. For every finding, add a RED regression when behavior is
affected, fix, rerun Steps 8-9, and obtain fresh clean re-reviews.

- [ ] **Step 11: Commit the reviewed parser behavior**

```bash
git add src/parser.js test/module-parser.test.js
git commit -m "fix: validate module capability and early errors" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Loader Boundary, Pinned Coverage, and Published Contract

**Files:**

- Modify: `test/module-loader.test.js`
- Modify: `test/ci/es2015-module-test262.test.js` only when compatible pinned tests exist
- Modify: `docs/conformance.md`
- Modify: `docs/limitations.md`

**Interfaces:**

- Consumes: repaired `parseModule`, `createModuleLoader`, `loadModuleGraph`, and `ModuleLoaderError`.
- Produces: stable parse-phase loader behavior and documented module validation parity.

- [ ] **Step 1: Add a loader parse-phase RED regression before changing production code**

Add:

```js
{
  name: 'loader reports unsupported module capability as a parse-phase failure',
  async run() {
    const loader = createModuleLoader(createRealm(), {
      resolve(specifier) {
        return specifier;
      },
      load(identifier) {
        return identifier === 'root'
          ? 'import "invalid"; export const ok = 1;'
          : 'new.target;';
      },
    });
    const error = await rejected(loadModuleGraph(loader, 'root'));
    assertSame(error instanceof ModuleLoaderError, true);
    assertSame(error.phase, 'parse');
    assertSame(error.identifier, 'invalid');
    assertSame(error.cause instanceof SyntaxError, true);
  },
},
```

- [ ] **Step 2: Reproduce RED against the exact base behavior**

Before relying on Task 1's GREEN, run the new test against the original base in
a temporary non-editing comparison (`git show 94bc89d:...` or the preserved RED
record), proving the dependency source previously loaded. Do not reset or
overwrite the task branch. Record the evidence.

- [ ] **Step 3: Run loader GREEN on the repaired parser**

Run:

```bash
node test/run-node.js test/module-loader.test.js
```

Expected: PASS with the exact `parse` phase, child identifier, and original
`SyntaxError` cause.

- [ ] **Step 4: Audit the exact pinned module-negative tests**

Search only the pinned checkout `vendor/test262` for module parse-negative cases
covering duplicate formal parameters and invalid RegExp syntax/flags. Add
lexicographically sorted compatible paths to `FOCUSED_PATHS` only when they
exercise supported ES2015/module syntax and require no excluded neighboring
feature. Do not add an expected failure or broaden feature policy.

- [ ] **Step 5: Run focused module and pinned Test262 GREEN under UTC**

Run:

```bash
TZ=UTC node test/run-node.js test/module-test262.test.js
TZ=UTC npm run test262:modules
```

Expected: PASS at pinned revision
`b363f29d3c43c626dc852744ad64a0b48a003693`.

- [ ] **Step 6: Publish the stable behavior**

In `docs/conformance.md`, state that `parseModule` applies the same supported
language capability and early-error checks as `parseScript`, with module-root
strictness and static module declarations admitted.

In `docs/limitations.md`, state that both ordinary and custom module ASTs reject
unsupported syntax, RegExp flags, ES5-invalid RegExp patterns, and strict
binding/parameter errors during parsing, before loader linking/evaluation.

- [ ] **Step 7: Run focused documentation and repository checks**

Run:

```bash
node test/run-node.js test/module-parser.test.js test/module-loader.test.js test/module-test262.test.js
npm run typecheck && npm run lint && npm run format
```

Expected: all commands exit 0.

- [ ] **Step 8: Complete fresh specification and quality review loops**

Specification review checks the loader's exact typed parse boundary, pinned-test
scope, and published contract. Quality review checks test portability, no
feature-policy expansion, documentation accuracy, and no changes to loader
semantics. Fix findings, rerun Steps 5 and 7, and obtain clean re-reviews.

- [ ] **Step 9: Commit reviewed integration coverage and documentation**

```bash
git add test/module-loader.test.js test/ci/es2015-module-test262.test.js \
  docs/conformance.md docs/limitations.md
git commit -m "test: cover module validation boundary" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

If the pinned audit finds no compatible new path, omit
`test/ci/es2015-module-test262.test.js` from the commit.

---

### Task 3: Whole-Branch Review, Portable Gates, and Exact-SHA Delivery

**Files:**

- Review all changes from merge-base `94bc89d2128df5875818759c8394290d6ed8b239`.
- No production changes unless a review or gate begins with a focused RED.

**Interfaces:**

- Consumes: reviewed commits from Tasks 1-2.
- Produces: focused PR, exact pushed-head CI, clean squash merge, and evidence on #66/#28/#61 plus coordinator sessions.

- [ ] **Step 1: Run all local repository gates**

```bash
TZ=UTC npm run test:node
TZ=UTC npm run test262:fixtures
TZ=UTC npm run test262:modules
npm run test:browser
npm run test:jsc
npm run typecheck
npm run lint
npm run format
npm run ci:check
npm run ci:contract
npm run vendor:check
npm run benchmark:smoke
```

Expected: every command exits 0.

- [ ] **Step 2: Obtain maximum-capability scoped whole-branch review**

Review the full branch diff against issue #66, the focused design, and the
approved umbrella module design. Require explicit checks for ordinary/custom
parity, module-aware placement, strictness propagation, RegExp and source-range
validation, descriptor safety, loader error wrapping, unsupported neighboring
features, and test sufficiency. Fix every finding with RED-first TDD, rerun
affected gates and Step 1, then obtain a clean maximum-capability re-review.

- [ ] **Step 3: Push and open a focused PR**

Push the current branch, open a PR whose body includes issue #66, exact base,
RED evidence, stable behavior, non-goals, review evidence, and local gate
commands. Record the exact pushed head:

```bash
git rev-parse HEAD
git ls-remote origin refs/heads/yoonbuck-module-capability-early-errors
```

- [ ] **Step 4: Watch exact-head CI synchronously**

Use `gh pr checks --watch` and `gh run watch --exit-status` for the CI run
associated with the exact pushed head. Verify every terminal check is
`SUCCESS`, the workflow `headSha` equals the pushed head, and the PR head OID is
unchanged.

- [ ] **Step 5: Resolve review feedback without stale evidence**

For any PR review or CI finding, add a focused RED regression, fix, rerun the
affected local gates and whole-branch re-review, push, and restart exact-head CI
verification. Never merge using checks from an earlier head.

- [ ] **Step 6: Squash-merge and delete the branch only when clean**

Verify required checks, review state, mergeability, and exact PR head one final
time. Squash-merge, delete the remote branch, and record the merge commit SHA.

- [ ] **Step 7: Publish exact evidence and dependency status**

Comment on #66 with RED evidence, reviewed head, PR URL, exact CI run URL,
terminal checks, stable parser/loader boundary, and merge SHA; then close #66 if
the merge did not auto-close it. Update #61 and #28 with the merge SHA and state
that the module validation blocker is cleared without absorbing release
integration or issue #67. Send the same merge milestone to creator/coordinator
sessions and go idle.
