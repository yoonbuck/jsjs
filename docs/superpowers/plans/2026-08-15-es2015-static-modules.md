# ES2015 Static Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ES2015 static modules with a portable, host-provided loader, transactional linking, strict synchronous evaluation, live bindings, namespace exotics, and focused portable Test262 coverage.

**Architecture:** Keep host policy at the `createModuleLoader(realm, host)` boundary: host Promises only sequence `resolve` and `load`; all parsed records, linking, evaluation, completions, and namespace objects remain Realm-owned engine state. Parse each module through the descriptor-safe parser validation pipeline, cache immutable parsed records by canonical identifier, then complete source-order graph loading before a deterministic DFS/SCC link transaction and synchronous SCC evaluation. Extend existing environment, `EngineObject`, declaration, and evaluator facilities narrowly; do not replace the evaluator.

**Tech Stack:** Plain ECMAScript modules, Acorn 8.18.0 at ES2015 grammar, strict JSDoc/TypeScript checking, existing portable test harness, Node, Chromium, JavaScriptCore, and pinned Test262 `b363f29d3c43c626dc852744ad64a0b48a003693`.

## Global Constraints

- Implement only Layer 3 in `docs/superpowers/specs/2026-08-14-async-runtime-and-modules-design.md` lines 471–634; do not perform Layer 4 integration work.
- Base all changes on `21e1c218a5a49288620a5c16c26a75c6485c59db` and preserve the already merged `createRealm`/`createAgent`, Agent job APIs in `src/runtime/agent.js` and `src/runtime/jobs.js`, and generator interfaces/machine.
- Keep `src/` plain JavaScript with strict JSDoc; add no dependencies and no host-specific module resolution, filesystem, URL, network, package, import-map, JSON, Wasm, CommonJS, or cache policy.
- Public loader construction is exactly `createModuleLoader(realm, { resolve, load })`; a loader is permanently bound to one Realm.
- `resolve(specifier, referrer)` returns a non-empty canonical identifier; root referrer is `null`; only canonical identifiers key loader identity.
- `load(identifier)` receives a canonical identifier and returns source text or an ordinary own-data-only `{ sourceText: string }`; reject accessors, inherited fields, extra fields, absent fields, and non-string source before parsing.
- Resolve and discover dependencies serially in source order. Deduplicate source work by canonical identifier; reject same-identifier load-hook reentrancy with a typed error; allow different-identifier reentrancy; clear failed resolve/load/parse in-flight work so retries work.
- Parsed `SourceTextModuleRecord` identity, AST, and entry lists are cached per loader/Realm/canonical identifier and never rewritten. Only its private link/evaluation state-machine slots may change. Preserve the parsed record after link rollback; cache evaluation success and exact abrupt guest value permanently.
- `parseModule` uses Acorn ES2015 `sourceType: 'module'`, the same snapshot/capability/descriptor-safe AST ownership checks as `parseScript`, and shape-level rejections for dynamic import, `import.meta`, top-level await, import assertions/attributes, and later grammar forms. Never mutate or loosely strip the AST.
- Load every source graph before linking. Link in deterministic source order with rollback of every tentative environment/status/DFS change on affected-stack failure; use module-and-export-name pairs for `ResolveExport`.
- `ResolveExport` distinguishes not found from ambiguous, excludes `default` from stars, gives explicit exports precedence, and makes unresolved or ambiguous imports link failures.
- Imports are immutable live indirect bindings, including cycles and TDZ; namespaces are cached Realm-owned null-prototype, non-extensible `EngineObject` exotics with lexicographic string exports and ES2015 internal-method behavior.
- Module execution is strict and synchronous after graph loading: top-level `this` is `undefined`; declarations never become global properties; direct eval remains strict and cannot leak declarations.
- `ModuleLoaderError` has phase `resolve`, `load`, `parse`, `link`, or `evaluate`, includes the identifier when known, carries original non-evaluation cause, and carries the exact guest value for evaluation. Do not stringify or replace guest failures.
- Host Promises are used only for loader orchestration, never guest jobs, parsing records, linking, binding reads, evaluation, or completion propagation.
- Fixture modules and their includes must run portably under Node, Chromium, and JSC. Run only targeted upstream module Test262 locally, always with `TZ=UTC`; broad Test262 remains exact-SHA CI work.
- Every behavior task is RED–GREEN–REFACTOR with a fresh implementer, then a fresh specification reviewer and a different fresh quality reviewer. Fix findings, rerun the named checks, and repeat both reviews until clean before committing. Implementers and reviewers use GPT-5.6-family models or Claude Opus 4.8 or lower; never Claude Opus 5.

## File and Interface Map

### Parser and immutable records

- Modify `src/parser.js`: export `parseModule(source, options = {})`; share descriptor-safe graph snapshotting and validation with `parseScript`, while accepting only ES2015 module AST shapes.
- Create `src/runtime/module-record.js`: `SourceTextModuleRecord`, frozen import/export entry records, module status/DFS state, source-order request list, and `ModuleLoaderError`.
- Create `src/runtime/module-loader.js`: host validation, canonical registry, serial source graph acquisition, in-flight tracking, retries, public `ModuleLoader`, and `createModuleLoader`.

### Link, evaluate, and namespace ownership

- Modify `src/runtime/environment.js`: add `ModuleEnvironmentRecord` with local bindings plus immutable indirect and namespace import bindings.
- Create `src/runtime/module-linker.js`: transactional source-order DFS/SCC linking, import resolution, pair-identity `ResolveExport`, and rollback.
- Create `src/evaluator/modules.js`: module declaration instantiation, module item evaluation, strict execution context, synthetic default binding handling, and synchronous SCC evaluation.
- Modify `src/evaluator/declarations.js`, `src/evaluator/statements.js`, and `src/evaluator/expressions.js`: expose narrow helpers/cases needed by module declaration and export forms without an evaluator-wide rewrite.
- Create `src/runtime/module-namespace.js`: cached `ModuleNamespaceObject` subclass of `EngineObject`.

### Public API, test infrastructure, and documentation

- Modify `src/api.js` and `src/index.js`: export `parseModule`, `createModuleLoader`, `ModuleLoader`, and `ModuleLoaderError`; preserve existing script APIs.
- Modify `tools/test262/runner.js`, `tools/test262/engine.js`, `tools/test262/adapters/node.js`, `tools/test262/adapters/browser.js`, `tools/test262/adapters/jsc.js`, `tools/test262/adapters/jsc-run.js`, and `test/harness/test262-host.js`: opt into module test execution and portable fixture source/include loading without host-specific policy.
- Modify `test/suites.js` and `test/run-ci-contract.js`: register portable module suites and the focused checkout-dependent module suite.
- Create `test/module-parser.test.js`, `test/module-loader.test.js`, `test/module-linker.test.js`, `test/module-evaluation.test.js`, `test/module-namespace.test.js`, `test/module-test262.test.js`, `test/ci/es2015-module-test262.test.js`, and module files below `test/fixtures/test262/`.
- Modify `docs/testing.md`, `docs/conformance.md`, `docs/limitations.md`, and `README.md`: publish loader contract, exact supported module boundary, test commands, and non-goals.

## Stable Layer-3 Interfaces

```js
/**
 * @typedef {{
 *   resolve: (
 *     specifier: string,
 *     referrer: string | null,
 *   ) => string | PromiseLike<string>,
 *   load: (
 *     identifier: string,
 *   ) => string | ModuleSourceRecord | PromiseLike<string | ModuleSourceRecord>,
 * }} ModuleHost
 *
 * @typedef {{ sourceText: string }} ModuleSourceRecord
 *
 * @typedef {'resolve' | 'load' | 'parse' | 'link' | 'evaluate'} ModuleLoaderPhase
 */

export class ModuleLoaderError extends Error {
  /** @param {{
   * phase: ModuleLoaderPhase,
   * identifier?: string,
   * cause?: unknown,
   * value?: unknown,
   * }} options */
  constructor(options) {}
  phase;
  identifier;
  cause; // Present for resolve/load/parse/link only.
  value; // Present for evaluate only; exact guest thrown value.
}

export class ModuleLoader {
  /** @param {string} specifier @param {string | null} [referrer] */
  loadAndEvaluate(specifier, referrer = null) {}
}

export function createModuleLoader(realm, host) {}
export function parseModule(source, options = {}) {}
```

`loadAndEvaluate` always returns a host Promise. It fulfills with the cached namespace or rejects with one `ModuleLoaderError`; a repeated request for a module whose evaluation threw rejects with the same error object and the same guest value object. `SourceTextModuleRecord` is internal except where the validated `load` result type is documented; module records, environments, namespace slots, link/evaluation statuses, and DFS indices are never mutable public API.

## Required Task Review Protocol

For **every task** below, including parser-only and documentation/API tasks:

1. Dispatch one **fresh implementer** that has this plan, the approved design, the current task, and current HEAD only. The model is GPT-5.6 family or Claude Opus 4.8 or lower.
2. Require the named **RED** command to fail for the stated missing behavior before production changes, then require the named **GREEN** command to pass after the minimal implementation and refactor.
3. Dispatch one **fresh specification reviewer**, distinct from the implementer, to check the task against lines 471–634. Resolve every finding, repeat RED when a behavior fix adds coverage, rerun GREEN, and obtain a fresh spec re-review.
4. Dispatch a separate **fresh quality reviewer**, distinct from both prior workers, to check ownership, rollback, JSDoc, portability, tests, and scope. Resolve every finding, rerun GREEN, and obtain a fresh quality re-review.
5. Run the listed commit command only after both reviewers approve. Never reuse a worker context or collapse review gates across tasks.

---

### Task 1: Descriptor-Safe Module Parsing and Immutable Static Entries

**Files:**

- Modify: `src/parser.js`
- Create: `src/runtime/module-record.js`
- Create: `test/module-parser.test.js`
- Modify: `test/suites.js`

**Interfaces:**

- Consumes: `parseScript`’s AST snapshot/validation functions and existing `UnsupportedNodeError`.
- Produces: `parseModule(source, options)`, `SourceTextModuleRecord`, and frozen entry shapes consumed by Tasks 2–5.

- [ ] **Step 1: Write parser and entry-extraction RED tests**

Create `test/module-parser.test.js` with checks that retain no parser-owned mutable references and classify static entries:

```js
import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/index.js';
import { parseModule } from '../src/parser.js';
import { SourceTextModuleRecord } from '../src/runtime/module-record.js';

export default [
  {
    name: 'parseModule validates ES2015 module AST and extracts ordered entries',
    run() {
      const ast = parseModule(
        'import d, { x as y } from "a"; export { y as z }; export * from "b";',
      );
      assertSame(ast.sourceType, 'module');
      const record = new SourceTextModuleRecord({
        realm: createRealm(),
        identifier: 'root',
        ast,
      });
      assertSame(record.requestedModules.join(','), 'a,b');
      assertSame(record.importEntries[0].importName, 'default');
      assertSame(record.importEntries[1].localName, 'y');
      assertSame(record.localExportEntries[0].exportName, 'z');
      assertSame(record.starExportEntries[0].moduleRequest, 'b');
      assertSame(Object.isFrozen(record.requestedModules), true);
      assertSame(Object.isFrozen(record.importEntries[0]), true);
    },
  },
  {
    name: 'parseModule rejects foreign accessors and later module syntax',
    run() {
      assertThrows(
        () =>
          parseModule('export const x = 1;', {
            parse() {
              return {
                type: 'Program',
                sourceType: 'module',
                body: [],
                get loc() {
                  return null;
                },
              };
            },
          }),
        SyntaxError,
      );
      assertThrows(() => parseModule('import("a")'), Error);
      assertThrows(() => parseModule('export * as ns from "a"'), Error);
    },
  },
];
```

- [ ] **Step 2: Run RED**

```bash
node test/run-node.js test/module-parser.test.js
```

Expected: FAIL because `parseModule` and `SourceTextModuleRecord` do not exist.

- [ ] **Step 3: Implement parser validation and record extraction**

In `src/parser.js`, parameterize only the existing parse/snapshot/validation path by expected `sourceType`; preserve all descriptor reads through existing safe helpers and produce a validated, owned `Program`. Add `parseModule` using:

```js
const MODULE_PARSER_OPTIONS = Object.freeze({
  ecmaVersion: 6,
  sourceType: 'module',
  locations: true,
  ranges: true,
});

export function parseModule(source, options = {}) {
  // Parse, snapshot custom output, validate own data descriptors and allowed
  // ES2015 module node shapes, then return the owned Program without mutation.
}
```

Extend the node validator for `ImportDeclaration`, `ImportDefaultSpecifier`, `ImportNamespaceSpecifier`, `ImportSpecifier`, `ExportNamedDeclaration`, `ExportDefaultDeclaration`, and `ExportAllDeclaration`. Reject `ImportExpression`, `MetaProperty` for `import.meta`, `await` at module top level, `ExportNamespaceSpecifier`, parser attributes/assertions, and any node unsupported by the current evaluator as a shape-level `UnsupportedNodeError`.

In `src/runtime/module-record.js`, extract entries by walking `ast.body` once in source order. Entry objects have exact own fields:

```js
// ImportEntry: { moduleRequest, importName, localName, kind: 'named' | 'namespace' }
// LocalExportEntry: { exportName, localName }
// IndirectExportEntry: { moduleRequest, importName, exportName }
// StarExportEntry: { moduleRequest }
```

For `export default`, use the declared function/class name when a named declaration provides one, and use the exact synthetic local name `'*default*'` for anonymous function/class declarations and assignment expressions. Exported variable declarations create one local export entry per `boundNames` result. Freeze each entry and each list. Retain the engine-owned AST without freezing, stripping, or annotating it; initialize internal `environment`, `namespace`, status, and DFS fields on the Module Record, never on AST nodes. Define `getNamespace()` on the record now: it returns the cached namespace when non-null and otherwise throws an internal `TypeError`. Task 5 replaces the uninitialized branch with lazy namespace creation before namespace bindings can be evaluated.

- [ ] **Step 4: Complete focused parser coverage and run GREEN**

Add cases for default import, namespace import, exported declaration, `export default function () {}`, `export default class {}`, `export default 1`, and a custom parser object whose nested `body` array has an accessor. Confirm the AST object supplied by a custom parser remains unchanged after `parseModule`.

**GREEN:**

```bash
node test/run-node.js test/module-parser.test.js && node test/run-node.js test/parser.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Review, fix/re-review, and commit**

Apply the Required Task Review Protocol, then:

```bash
git add src/parser.js src/runtime/module-record.js test/module-parser.test.js test/suites.js
git commit -m "feat: parse ES2015 module records" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: Canonical Portable Loading, Deduplication, Reentrancy, and Failure Boundary

**Files:**

- Create: `src/runtime/module-loader.js`
- Modify: `src/runtime/module-record.js`
- Modify: `src/api.js`
- Modify: `src/index.js`
- Create: `test/module-loader.test.js`
- Modify: `test/suites.js`

**Interfaces:**

- Consumes: `parseModule` and `SourceTextModuleRecord` from Task 1.
- Produces: `createModuleLoader(realm, host)`, `ModuleLoader`, `ModuleLoaderError`, and internal `loadModuleGraph(loader, specifier, referrer)` parsed-record acquisition for Tasks 3–5. `loadAndEvaluate` delegates to that acquisition now and is completed by Tasks 3–5 without exposing the internal record.

- [ ] **Step 1: Write loader RED tests**

Create tests using deferred host Promises and an ordered hook log:

```js
import { assertSame, assertThrows } from './harness/assert.js';
import {
  createModuleLoader,
  createRealm,
  ModuleLoaderError,
} from '../src/index.js';
import { loadModuleGraph } from '../src/runtime/module-loader.js';

export default [
  {
    name: 'loader uses canonical identity, serial source order, and one source load',
    async run() {
      const calls = [];
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier, referrer) {
          calls.push(`resolve:${specifier}:${referrer}`);
          return specifier === 'alias' ? 'root' : specifier;
        },
        load(identifier) {
          calls.push(`load:${identifier}`);
          return identifier === 'root'
            ? 'import "a"; import "b"; export const root = 1;'
            : 'export const value = 1;';
        },
      });
      const [first, second] = await Promise.all([
        loadModuleGraph(loader, 'alias', null),
        loadModuleGraph(loader, 'root', null),
      ]);
      assertSame(first, second);
      assertSame(
        calls.join(','),
        'resolve:alias:null,resolve:root:null,load:root,resolve:a:root,load:a,resolve:b:root,load:b',
      );
    },
  },
  {
    name: 'loader rejects malformed source records and permits retry after parse failure',
    async run() {
      let loads = 0;
      const loader = createModuleLoader(createRealm(), {
        resolve() {
          return 'm';
        },
        load() {
          loads += 1;
          return loads === 1
            ? 'export {'
            : { sourceText: 'export const x = 1;' };
        },
      });
      let first;
      try {
        await loadModuleGraph(loader, 'm', null);
      } catch (error) {
        first = error;
      }
      assertSame(first instanceof ModuleLoaderError, true);
      assertSame(first.phase, 'parse');
      await loadModuleGraph(loader, 'm', null);
      assertSame(loads, 2);
      assertThrows(
        () => createModuleLoader(createRealm(), { resolve() {} }),
        TypeError,
      );
    },
  },
];
```

- [ ] **Step 2: Run RED**

```bash
node test/run-node.js test/module-loader.test.js
```

Expected: FAIL because no module loader public API exists.

- [ ] **Step 3: Implement host validation, canonical source acquisition, and typed errors**

Implement and export:

```js
export function createModuleLoader(realm, host) {
  return new ModuleLoader(realm, validateModuleHost(host));
}

export class ModuleLoader {
  async loadAndEvaluate(specifier, referrer = null) {
    // Validate and acquire the graph through loadModuleGraph. Tasks 3-5 add
    // linking, evaluation, and the namespace result at this single boundary.
  }
}

export function loadModuleGraph(loader, specifier, referrer = null) {
  // Internal orchestration API, imported from runtime/module-loader.js only.
}
```

Validate a Realm, exact callable `resolve`/`load`, string specifiers/referrers, resolve’s non-empty primitive string result, and load output before touching the parser. Use a canonical-record registry and separate resolve/load/graph in-flight maps. Call each dependency `resolve` then source acquisition serially in its parent `requestedModules` order. Enter the parsed record in the registry before recursively acquiring dependencies.

As each raw request resolves, append a frozen `{ specifier, identifier, module }` edge to `record.resolvedRequestedModules` in the same occurrence order as `record.requestedModules`; linking and evaluation consume these edges and never call a host hook. Duplicate raw requests may produce duplicate ordered edges but point to the same canonical Module Record. Concurrent requests for one canonical identifier await one acquisition promise; source aliases share it.

Track active load-hook identifiers. If a `load` hook calls `loadAndEvaluate` that resolves to its own active identifier before source exists, reject the nested call with `new ModuleLoaderError({ phase: 'load', identifier, cause })`; do not await itself. A reentry for another identifier follows the ordinary in-flight maps. On resolve/load/parse rejection, delete the matching in-flight/cache state but retain no failed record. Wrap host/parser failures as `ModuleLoaderError` with the original `cause`; leave typed errors intact.

- [ ] **Step 4: Add reentrancy, validation, identity, and retry tests; run GREEN**

Add focused cases for: accessor/unknown/inherited source-record fields; load receiving the canonical string only; failed resolve and load retry; different-loader and different-Realm nonsharing; same-id reentry; different-id reentry; source order when the first child’s Promise settles later; and `identifier` absent for an initial resolve failure but present after canonicalization.

**GREEN:**

```bash
node test/run-node.js test/module-loader.test.js && node test/run-node.js test/module-parser.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Review, fix/re-review, and commit**

Apply the Required Task Review Protocol, then:

```bash
git add src/runtime/module-loader.js src/runtime/module-record.js src/api.js src/index.js test/module-loader.test.js test/suites.js
git commit -m "feat: add canonical module loading" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: Module Environments, Pair-Identity ResolveExport, and Atomic SCC Linking

**Files:**

- Modify: `src/runtime/environment.js`
- Create: `src/runtime/module-linker.js`
- Modify: `src/runtime/module-record.js`
- Create: `src/evaluator/modules.js` (link-time declaration instantiation only)
- Modify: `src/evaluator/declarations.js`
- Create: `test/module-linker.test.js`
- Modify: `test/suites.js`

**Interfaces:**

- Consumes: cached parsed records and serially complete graphs from Task 2.
- Produces: `ModuleEnvironmentRecord`, `moduleDeclarationInstantiation(record)`, `linkModuleGraph(rootRecord)`, `resolveExport(record, name, resolveSet)`, resolved import targets, and complete linked SCC environments for Tasks 4–5.

- [ ] **Step 1: Write linking RED tests**

```js
import { assertSame } from './harness/assert.js';
import { createModuleLoader, createRealm } from '../src/index.js';
import { loadModuleGraph } from '../src/runtime/module-loader.js';
import {
  linkModuleGraph,
  resolveExport,
} from '../src/runtime/module-linker.js';

function loaderFor(sources) {
  return createModuleLoader(createRealm(), {
    resolve(specifier) {
      return specifier;
    },
    load(identifier) {
      return sources[identifier];
    },
  });
}

export default [
  {
    name: 'explicit export wins over star ambiguity and star excludes default',
    async run() {
      const loader = loaderFor({
        root: 'export { x } from "a"; export * from "a"; export * from "b";',
        a: 'export const x = 1; export default 2;',
        b: 'export const x = 3; export const y = 4;',
      });
      const root = await loadModuleGraph(loader, 'root', null);
      linkModuleGraph(root);
      const x = resolveExport(root, 'x', new Set());
      const y = resolveExport(root, 'y', new Set());
      assertSame(x.type, 'resolved');
      assertSame(x.bindingName, 'x');
      assertSame(y.type, 'resolved');
      assertSame(resolveExport(root, 'default', new Set()).type, 'not-found');
    },
  },
  {
    name: 'failed link rolls back environments without reloading parsed source',
    async run() {
      let loads = 0;
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier) {
          return specifier;
        },
        load(identifier) {
          loads += 1;
          return identifier === 'root'
            ? 'import { missing } from "dep"; export { missing };'
            : 'export const present = 1;';
        },
      });
      const root = await loadModuleGraph(loader, 'root', null);
      let first;
      let second;
      try {
        linkModuleGraph(root);
      } catch (error) {
        first = error;
      }
      try {
        linkModuleGraph(root);
      } catch (error) {
        second = error;
      }
      assertSame(first instanceof Error, true);
      assertSame(second instanceof Error, true);
      assertSame(root.environment, null);
      assertSame(root.status, 'unlinked');
      assertSame(loads, 2);
    },
  },
];
```

- [ ] **Step 2: Run RED**

```bash
node test/run-node.js test/module-linker.test.js
```

Expected: FAIL because source loading does not link imports or exports.

- [ ] **Step 3: Implement module bindings and link transaction**

Add `ModuleEnvironmentRecord extends DeclarativeEnvironmentRecord` with:

```js
createImportBinding(localName, targetModule, targetName) {}
createNamespaceImportBinding(localName, targetModule) {}
hasBinding(name) {}
getBindingValue(name, strict) {}
setMutableBinding(name, value, strict) {}
```

Construct each `ModuleEnvironmentRecord` with `record.realm.globalEnvironment` as its `outer`, so module code can resolve installed harness functions, built-ins, and existing global bindings without putting module declarations on the global object. Store import bindings outside ordinary local binding maps. Override `hasBinding` so identifier resolution sees either an import binding or an inherited local binding. `getBindingValue` dereferences `targetModule.environment.getBindingValue(targetName, true)` for every named-import read; namespace imports call the record’s `getNamespace()`, which Task 5 makes lazily productive before any namespace-import evaluation test runs. Reject any assignment to imports with the guest strict immutable-binding failure; never copy export values.

Create `src/evaluator/modules.js` with `moduleDeclarationInstantiation(record)`. During linking, after creating each `ModuleEnvironmentRecord` and before committing the SCC, instantiate every module-scoped `var`, function, lexical, class, import, and synthetic `'*default*'` binding. Initialize hoisted function declarations here, including anonymous `export default function () {}`: apply named evaluation with the exact name `'default'` and initialize `'*default*'` to that function. Leave lexical declarations, classes (including anonymous default classes), and default assignment expressions in TDZ. Reuse narrow exported helpers from `src/evaluator/declarations.js`; do not evaluate module statements.

Implement source-order DFS/SCC linking with records’ explicit `unlinked`/`linking`/`linked` status, DFS index, ancestor index, and stack membership. Keep a transaction journal of every created environment, local/import binding setup, status, import resolution, and DFS field. `linkModuleGraph` commits only after all root-stack records have complete environments and resolvable imports; on any host or guest link failure discard every journaled environment wholesale and clear status/DFS/import-resolution fields, preserving only parsed AST/entries/registry. Missing or ambiguous imported/exported bindings create one Realm-owned guest `SyntaxError` object as the exact internal link cause; `ModuleLoader` wraps that value in `ModuleLoaderError({ phase: 'link', identifier, cause })`, and the Test262 bridge later reuses it for `negative.phase: resolution`.

Define `resolveExport(module, exportName, resolveSet)` where `resolveSet` contains pair keys that preserve both record identity and export name. Check local and indirect explicit entries first; return `{ type: 'not-found' }`, `{ type: 'ambiguous' }`, or `{ type: 'resolved', module, bindingName }`; recurse star entries except when `exportName === 'default'`; collapse same target pairs and report different targets as ambiguous. Resolve every import before linking commits.

- [ ] **Step 4: Add cycle and rollback coverage; run GREEN**

Add tests for A↔B live-import setup before either evaluation, cycle termination when two modules re-export each other under the same name, ambiguous stars absent from resolution, missing named imports as link failures, a linked module environment whose `outer === record.realm.globalEnvironment`, and a repeated link attempt that starts from clean `unlinked`/null environment/cleared DFS state while reusing both cached parsed records without another `load` call.

**GREEN:**

```bash
node test/run-node.js test/module-linker.test.js && node test/run-node.js test/module-loader.test.js && node test/run-node.js test/environments.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Review, fix/re-review, and commit**

Apply the Required Task Review Protocol, then:

```bash
git add src/runtime/environment.js src/runtime/module-linker.js src/runtime/module-record.js src/evaluator/modules.js src/evaluator/declarations.js test/module-linker.test.js test/suites.js
git commit -m "feat: link module graphs atomically" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 4: Strict Synchronous Module Evaluation and Default Export Semantics

**Files:**

- Modify: `src/evaluator/modules.js`
- Modify: `src/evaluator/declarations.js`
- Modify: `src/evaluator/statements.js`
- Modify: `src/evaluator/expressions.js`
- Modify: `src/runtime/module-loader.js`
- Modify: `src/runtime/module-record.js`
- Modify: `src/runtime/module-linker.js`
- Create: `test/module-evaluation.test.js`
- Modify: `test/suites.js`

**Interfaces:**

- Consumes: linked records and `ModuleEnvironmentRecord` from Task 3.
- Produces: `evaluateModuleGraph(rootRecord)`, cached normal/abrupt module completion, strict module contexts, default export bindings, and loader evaluation-error caching consumed by Task 5. Successful internal evaluation returns the root record until Task 5 installs the public namespace result; no intermediate record API is exported from `src/index.js`.

- [ ] **Step 1: Write evaluation RED tests**

```js
import { assertSame } from './harness/assert.js';
import { createModuleLoader, createRealm } from '../src/index.js';
import { loadModuleGraph } from '../src/runtime/module-loader.js';
import { linkModuleGraph } from '../src/runtime/module-linker.js';
import { evaluateModuleGraph } from '../src/evaluator/modules.js';

export default [
  {
    name: 'modules are strict, module scoped, live, and evaluate once',
    async run() {
      const realm = createRealm();
      const sources = {
        root: 'import { bump, value } from "a"; bump(); export { value }; export const top = this;',
        a: 'export let value = 0; export function bump() { value += 1; }',
      };
      const loader = createModuleLoader(realm, {
        resolve(specifier) {
          return specifier;
        },
        load(identifier) {
          return sources[identifier];
        },
      });
      const root = await loadModuleGraph(loader, 'root', null);
      linkModuleGraph(root);
      const first = evaluateModuleGraph(root);
      const second = evaluateModuleGraph(root);
      assertSame(first, second);
      assertSame(root.environment.getBindingValue('value', true), 1);
      assertSame(root.environment.getBindingValue('top', true), undefined);
      assertSame(realm.globalObject.hasProperty('value'), false);
    },
  },
  {
    name: 'evaluation rejection preserves one exact guest value',
    async run() {
      const thrown = {};
      const realm = createRealm();
      const loader = createModuleLoader(realm, {
        resolve() {
          return 'm';
        },
        load() {
          return 'throw marker;';
        },
      });
      realm.globalObject.defineOwnProperty('marker', {
        value: thrown,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      let first;
      let second;
      try {
        await loader.loadAndEvaluate('m');
      } catch (error) {
        first = error;
      }
      try {
        await loader.loadAndEvaluate('m');
      } catch (error) {
        second = error;
      }
      assertSame(first, second);
      assertSame(first.phase, 'evaluate');
      assertSame(first.value, thrown);
    },
  },
];
```

- [ ] **Step 2: Run RED**

```bash
node test/run-node.js test/module-evaluation.test.js
```

Expected: FAIL because a linked module has no evaluator.

- [ ] **Step 3: Implement narrow module declaration and evaluation paths**

Extend `src/evaluator/modules.js` with:

```js
// Existing from Task 3:
export function moduleDeclarationInstantiation(record) {}
export function evaluateModuleGraph(rootRecord) {}
export function evaluateModule(record) {}
```

Do not create bindings here: Task 3’s transactional `moduleDeclarationInstantiation` has already produced the complete environment and hoisted functions. Treat `ImportDeclaration`, `export { ... }`, `export *`, re-export declarations, and already-instantiated default function declarations as having no runtime evaluation step. Evaluate exported variable/class declarations and default expressions in source order, initializing the existing lexical/class/synthetic `'*default*'` bindings. Apply named evaluation with the exact inferred name `'default'` to anonymous default classes and anonymous function/class assignment expressions before initializing `'*default*'`; never reinitialize the anonymous default function binding created during linking.

Build the context as:

```js
{
  realm: record.realm,
  env: record.environment,
  variableEnv: record.environment,
  strict: true,
  thisValue: undefined,
  functionEnvironment: createFunctionExecutionEnvironment({
    thisStatus: 'initialized',
    thisValue: undefined,
  }),
}
```

Evaluate linked SCCs deterministically, each record once. Convert only `ThrowSignal`/`GuestErrorSignal` to exact guest abrupt completion, cache the completion on the record before surfacing it, and have the loader wrap it once in its cached `ModuleLoaderError({ phase: 'evaluate', identifier, value })`. Do not schedule Agent jobs or await inside module evaluation.

- [ ] **Step 4: Finish behavior tests and run GREEN**

Retain the real guest marker setup and exact repeated error assertions above. Add cases for top-level `var`/function/class not becoming global properties, imported assignment throwing, TDZ through an import, direct eval’s strict nonleaking declarations, mutually recursive exported functions, anonymous default function/class, default expression, and a dependency that ran once before a root failure.

**GREEN:**

```bash
node test/run-node.js test/module-evaluation.test.js && node test/run-node.js test/module-linker.test.js && node test/run-node.js test/eval.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Review, fix/re-review, and commit**

Apply the Required Task Review Protocol, then:

```bash
git add src/evaluator/modules.js src/evaluator/declarations.js src/evaluator/statements.js src/evaluator/expressions.js src/runtime/module-loader.js src/runtime/module-record.js src/runtime/module-linker.js test/module-evaluation.test.js test/suites.js
git commit -m "feat: evaluate static modules synchronously" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 5: Cached ES2015 Module Namespace Exotic

**Files:**

- Create: `src/runtime/module-namespace.js`
- Modify: `src/runtime/module-record.js`
- Modify: `src/runtime/module-loader.js`
- Create: `test/module-namespace.test.js`
- Modify: `test/suites.js`

**Interfaces:**

- Consumes: linked unambiguous exports and live environment bindings from Tasks 3–4.
- Produces: `SourceTextModuleRecord#getNamespace()` and a cached `ModuleNamespaceObject` for loader results and namespace imports.

- [ ] **Step 1: Write namespace RED tests**

```js
import { assertSame } from './harness/assert.js';
import { createModuleLoader, createRealm } from '../src/index.js';

export default [
  {
    name: 'namespace is cached, null-prototype, non-extensible, sorted, and live',
    async run() {
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier) {
          return specifier;
        },
        load(identifier) {
          return identifier === 'root'
            ? 'export { z } from "dep"; export { a } from "dep";'
            : 'export let a = 1; export let z = 2;';
        },
      });
      const namespace = await loader.loadAndEvaluate('root');
      assertSame(namespace.getPrototype(), null);
      assertSame(namespace.isExtensible(), false);
      assertSame(
        namespace.ownPropertyKeys().map(String).join(','),
        'a,z,Symbol(Symbol.toStringTag)',
      );
      assertSame(namespace.get('a'), 1);
      assertSame(namespace, await loader.loadAndEvaluate('root'));
    },
  },
];
```

- [ ] **Step 2: Run RED**

```bash
node test/run-node.js test/module-namespace.test.js
```

Expected: FAIL because a module result is not a namespace exotic.

- [ ] **Step 3: Implement the EngineObject subclass**

Implement `ModuleNamespaceObject extends EngineObject` and obtain all export names from linked `ResolveExport` results, filtering ambiguous results and sorting only string names lexicographically. Construct it as `super(null, 'Module', record.realm.agent)` so the null-prototype object retains Realm/Agent ownership, make it non-extensible, and cache one object on the record. Use `record.realm.agent.wellKnownSymbols.toStringTag`, never host `Symbol.toStringTag`. Override the intended paired `EngineObject` internal-method equivalents. The repository invariant requires `_peekOwnDescriptor` and `getOwnProperty` to be overridden together for virtual properties:

```js
_peekOwnDescriptor(key) {}
getOwnProperty(key) {}
setPrototypeOf(prototype) {}
defineOwnProperty(key, descriptor, throwOnError = false) {}
put(key, value, throwOnError = false) {}
delete(key, throwOnError = false) {}
ownPropertyKeys() {}
```

For export string keys, synthesize `{ value: liveValue, writable: true, enumerable: true, configurable: false }` descriptors whose reads dereference the resolved binding at access time and preserve TDZ throws. `setPrototypeOf` returns true only when the requested prototype is already null and rejects every non-null prototype; `put` always rejects for export names even though their descriptors report writable; `delete` rejects present string exports; `defineOwnProperty` accepts only compatible SameValue definitions. Return string export keys sorted before symbol keys and include a non-writable, non-enumerable, non-configurable `Symbol.toStringTag` data property with value `'Module'`. Avoid an ordinary copied property map for exports.

- [ ] **Step 4: Add complete exotic-operation coverage and run GREEN**

Add tests for live updates after an exported `let` changes, namespace import identity, re-export identity, TDZ read through namespace, ambiguous-star absence, descriptor flags, failed `set`/`delete`/incompatible `defineOwnProperty`, compatible descriptor redefinition, null prototype, and `@@toStringTag`.

**GREEN:**

```bash
node test/run-node.js test/module-namespace.test.js && node test/run-node.js test/module-evaluation.test.js && node test/run-node.js test/objects.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Review, fix/re-review, and commit**

Apply the Required Task Review Protocol, then:

```bash
git add src/runtime/module-namespace.js src/runtime/module-record.js src/runtime/module-loader.js test/module-namespace.test.js test/suites.js
git commit -m "feat: add module namespace exotic objects" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 6: Portable Module Test262 Fixtures and Focused Upstream Coverage

**Files:**

- Modify: `tools/test262/runner.js`
- Modify: `tools/test262/engine.js`
- Modify: `tools/test262/adapters/node.js`
- Modify: `tools/test262/adapters/browser.js`
- Modify: `tools/test262/adapters/jsc.js`
- Modify: `tools/test262/adapters/jsc-run.js`
- Create: `tools/test262/module-paths.js`
- Modify: `test/harness/test262-host.js`
- Modify: `test/test262-runner.test.js`
- Create: `test/module-test262.test.js`
- Create: `test/ci/es2015-module-test262.test.js`
- Create: `test/fixtures/test262/test/language/module-code/basic.js`
- Create: `test/fixtures/test262/test/language/module-code/basic_FIXTURE.js`
- Modify: `test/fixtures/test262/manifest.json`
- Modify: `test/suites.js`
- Modify: `test/run-ci-contract.js`

**Interfaces:**

- Consumes: module APIs from Tasks 1–5.
- Produces: an opt-in `evaluateModule` Test262 bridge operation and portable module fixture resolution independent of Node paths, browser URLs, and JSC shell behavior.

- [ ] **Step 1: Write portable Test262 runner RED tests**

In `test/module-test262.test.js`, exercise in-memory fixture reads and a module bridge:

```js
import { assertSame } from './harness/assert.js';
import { runTest262 } from '../tools/test262/runner.js';
import { createJsjsTest262Engine } from '../tools/test262/engine.js';

export default [
  {
    name: 'module flag loads fixture dependencies through the portable host',
    async run() {
      const files = new Map([
        [
          'test/language/module-code/basic.js',
          '/*---\nflags: [module]\n---*/\nimport { value } from "./basic_FIXTURE.js"; assert.sameValue(value, 42);',
        ],
        [
          'test/language/module-code/basic_FIXTURE.js',
          'export const value = 42;',
        ],
      ]);
      const { summary } = await runTest262({
        engine: createJsjsTest262Engine(),
        host: {
          readTest(path) {
            return files.get(path);
          },
          readInclude(name) {
            return name === 'assert.js'
              ? 'function assert() {} assert.sameValue = function (actual, expected) { if (actual !== expected) { throw new Error("not same"); } };'
              : 'function Test262Error(message) { this.message = message; }';
          },
          readModule(path) {
            return files.get(path);
          },
        },
        paths: ['test/language/module-code/basic.js'],
        supportedFeatures: [],
        skipFeatures: [],
      });
      assertSame(summary.passed, 1);
    },
  },
];
```

- [ ] **Step 2: Run RED**

```bash
node test/run-node.js test/module-test262.test.js
```

Expected: FAIL because the runner marks the `module` flag unsupported and the bridge exposes no module evaluation.

- [ ] **Step 3: Implement portable module fixture loading and bridge**

Extend the runner typedefs with:

```js
// Test262Host: readModule(file: string, referrer: string | null): string | Promise<string>
// ModuleTest262Outcome:
//   { phase: null }
//   | { phase: 'parse', error: Error }
//   | { phase: 'resolution' | 'runtime', value: unknown }
// Test262Engine: evaluateModule(realm: Realm, source: string, identifier: string,
//   host: { resolve(specifier, referrer): string; load(identifier): string })
//   => Promise<ModuleTest262Outcome>
```

When metadata contains `module`, remove only `'module'` from `UNSUPPORTED_FLAGS`, select exactly the single module variant, install normal harness includes as scripts first, and call `evaluateModule`; retain script behavior and every other unsupported flag. Feed the returned phase/value into the existing negative-expectation logic: parse uses the host `SyntaxError`, resolution uses the exact guest `SyntaxError` carried as the link cause, and runtime uses the exact cached evaluation value. A positive resolve/load engine-boundary failure remains `engine-error`, not a Test262 negative pass.

In `tools/test262/module-paths.js`, normalize Test262-relative `./`/`../` module requests with string path segments, reject attempts to traverse above the Test262 root, and avoid host URL/filesystem semantics. Each adapter supplies `readModule` using its already injected `readTest` mechanism and repository-relative paths. The JSJS engine bridge constructs a `createModuleLoader` bound to the case Realm, serves the already-read root source without a second host read, and translates `ModuleLoaderError` as follows: `parse` → `{ phase: 'parse', error: cause }`; `link` with its exact guest `SyntaxError` cause → `{ phase: 'resolution', value: cause }`; `evaluate` → `{ phase: 'runtime', value }`; `resolve`/`load` remain rejected engine errors.

Add a focused CI suite with this exact lexicographically sorted root-file list (the host loads adjacent `_FIXTURE.js` dependencies on demand):

```js
const FOCUSED_PATHS = Object.freeze([
  'test/language/module-code/ambiguous-export-bindings/omitted-from-namespace.js',
  'test/language/module-code/eval-export-dflt-expr-fn-anon.js',
  'test/language/module-code/eval-gtbndng-indirect-update.js',
  'test/language/module-code/eval-gtbndng-local-bndng-let.js',
  'test/language/module-code/eval-this.js',
  'test/language/module-code/instn-iee-bndng-fun.js',
  'test/language/module-code/instn-iee-err-dflt-thru-star.js',
  'test/language/module-code/instn-iee-err-not-found.js',
  'test/language/module-code/instn-iee-iee-cycle.js',
  'test/language/module-code/namespace/Symbol.toStringTag.js',
]);
```

Before accepting the list, inspect each pinned file’s metadata and fixture dependencies and remove any root that requires an explicitly out-of-layer feature; replace it with another exact path in the same semantic category rather than adding a skip. In particular, do not restore `eval-rqstd-once.js`: it requires unsupported `export * as`. Assert the pinned checkout, run via `runTest262`, and fail on any supported record not passed. Do not invoke generated selection or a broad local Test262 command.

- [ ] **Step 4: Add adapter and fixture checks; run GREEN**

Add fixture cases for relative dependency resolution, nested dependencies, shared dependency deduplication, exported live binding, negative module parse, and negative module resolution. `_FIXTURE.js` files are load-only dependencies: exclude the suffix from adapter directory listings and selection inventories, and never emit a root test record for one. Update `test/test262-runner.test.js`’s hard-coded fixture test list, inventory list, record lines, reports, and module-flag skip expectations so the new root fixtures are counted while `_FIXTURE.js` files are not. Register portable tests in `test/suites.js`, the upstream suite in `test/run-ci-contract.js`, and confirm browser/JSC adapters satisfy the same host shape.

**GREEN:**

```bash
node test/run-node.js test/module-test262.test.js && node test/run-node.js test/test262-runner.test.js && TZ=UTC node test/run-node.js test/ci/es2015-module-test262.test.js
```

Expected: portable module fixtures and the focused pinned module subset pass; no generated selection is created.

- [ ] **Step 5: Review, fix/re-review, and commit**

Apply the Required Task Review Protocol, then:

```bash
git add tools/test262/runner.js tools/test262/engine.js tools/test262/module-paths.js tools/test262/adapters/node.js tools/test262/adapters/browser.js tools/test262/adapters/jsc.js tools/test262/adapters/jsc-run.js test/harness/test262-host.js test/test262-runner.test.js test/module-test262.test.js test/ci/es2015-module-test262.test.js test/fixtures/test262 test/suites.js test/run-ci-contract.js
git commit -m "test: add portable module Test262 coverage" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 7: Public API, Documentation, Policy, and End-to-End Contract

**Files:**

- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/testing.md`
- Modify: `docs/conformance.md`
- Modify: `docs/limitations.md`
- Modify: `tools/ci/pipeline.js`
- Modify: `.github/workflows/ci.yml` (generated only)
- Modify: `test/node/repository-invariants.test.js`
- Modify: `test/node/workflow-contract.test.js`
- Create: `test/module-api.test.js`
- Modify: `test/suites.js`

**Interfaces:**

- Consumes: all stable interfaces and portable tests from Tasks 1–6.
- Produces: documented supported Layer-3 API, explicit feature policy, a dedicated exact-pin module Test262 script/job, and repository/CI contract checks.

- [ ] **Step 1: Write API and CI policy RED tests**

```js
import { assertSame } from './harness/assert.js';
import {
  createModuleLoader,
  createRealm,
  ModuleLoaderError,
  parseModule,
} from '../src/index.js';

export default [
  {
    name: 'public module API composes through the documented loader boundary',
    async run() {
      const ast = parseModule('export const answer = 42;');
      assertSame(ast.sourceType, 'module');
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier) {
          return specifier;
        },
        load() {
          return 'export const answer = 42;';
        },
      });
      const namespace = await loader.loadAndEvaluate('answer');
      assertSame(namespace.get('answer'), 42);
      assertSame(typeof ModuleLoaderError, 'function');
    },
  },
];
```

In `test/node/workflow-contract.test.js`, add the independent expected job command:

```js
'test262-modules': 'npm run test262:modules',
```

and assert that job checks out `package.json#test262.revision`, runs with `TZ=UTC`, and does not run `test262:upstream` or rewrite `docs/test262-report.jsonl`.

- [ ] **Step 2: Run RED**

```bash
node test/run-node.js test/module-api.test.js && node test/run-node.js test/node/workflow-contract.test.js
```

Expected: the API composition assertion passes from Task 2, while the workflow contract fails because `test262-modules` and `npm run test262:modules` do not exist yet. This is the RED for the independently reviewable CI/policy deliverable.

- [ ] **Step 3: Publish exact API and policy**

Audit that Task 2 exported only `parseModule`, `createModuleLoader`, `ModuleLoader`, and `ModuleLoaderError` in addition to existing exports. Do not expose record registries, link status, DFS fields, environments, entry arrays, or namespace constructors as public API.

Document these exact guarantees: canonical identifier identity; serial source-order hooks; source reentry rule; retry boundaries; immutable parsed-record cache; graph-before-link transaction; strict synchronous execution; exact guest evaluation failure identity; namespace exotic constraints; and loader-only host Promise use. State explicit exclusions: dynamic import, `import.meta`, top-level await, assertions/attributes, Node/browser resolution policy, import maps, non-JS modules, and cross-loader/cross-Realm identity. Update `test/node/repository-invariants.test.js` to remove the stale assertions that modules remain unimplemented while retaining the async-function/async-generator/`await` and dynamic-import exclusions.

Do not add a bare `module` feature probe: Test262 represents modules with the `module` flag, which Task 6 now executes. Reuse existing feature names in `tools/test262/features.json`; pass any module-only metadata requirements through the focused suite’s explicit allowlist rather than inventing a script-mode probe that cannot demonstrate module semantics.

Add `test262:modules` to `package.json` as exactly `node test/run-node.js test/ci/es2015-module-test262.test.js`. Extend `tools/ci/pipeline.js` with a `test262-modules` job that checks out the pinned Test262 tree exactly like `test262-upstream`, runs `npm run test262:modules` under `TZ=UTC`, and never regenerates broad reports. Regenerate `.github/workflows/ci.yml` with `npm run ci:generate`; never hand edit it. Node, Chromium, and JSC already run the portable module fixture through `test/suites.js`.

- [ ] **Step 4: Run full targeted integration GREEN checks**

Register the API test. Verify public API, parser/load/link/evaluate/namespace suites, portable hosts, focused upstream modules, and static project checks:

```bash
node test/run-node.js test/module-parser.test.js && node test/run-node.js test/module-loader.test.js && node test/run-node.js test/module-linker.test.js && node test/run-node.js test/module-evaluation.test.js && node test/run-node.js test/module-namespace.test.js && node test/run-node.js test/module-test262.test.js && node test/run-node.js test/module-api.test.js && TZ=UTC npm run test262:modules && npm run typecheck && npm run lint && npm run format && npm run ci:check
```

Expected: every named check passes. Then run portable hosts:

```bash
npm run test:browser && npm run test:jsc
```

Expected: all registered portable suites, including module fixtures, pass in Chromium and JSC.

- [ ] **Step 5: Review, fix/re-review, and commit**

Apply the Required Task Review Protocol. After task approval, conduct a fresh whole-branch specification review and a separate whole-branch quality review with maximum-effort GPT-5.6-family models; fix and re-review until both are clean. Then:

```bash
git add package.json README.md docs/architecture.md docs/testing.md docs/conformance.md docs/limitations.md tools/ci/pipeline.js .github/workflows/ci.yml test/node/repository-invariants.test.js test/node/workflow-contract.test.js test/module-api.test.js test/suites.js
git commit -m "docs: publish static module support" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

## Final Acceptance Checklist

- [ ] `createModuleLoader` obeys canonical loader/Realm identity, source-order acquisition, deduplication, both reentrancy cases, validation, typed phases, and retry/cache requirements.
- [ ] `parseModule` and module-record extraction keep an owned immutable validated AST and reject every out-of-layer module shape.
- [ ] Linking is graph-complete first, deterministic, pair-identity correct, transactional, cycle-safe, and leaves parsed source cached after failure.
- [ ] Imported bindings, defaults, cycles, strict module scope, synchronous evaluation, and exact cached guest failures meet the approved design.
- [ ] Namespace exotics meet null-prototype, non-extensible, key ordering, TDZ/live-read, descriptor, mutation, deletion, and `@@toStringTag` requirements.
- [ ] Node, Chromium, and JSC run the portable module fixtures; focused pinned upstream module tests run with `TZ=UTC`; no broad local Test262 command is introduced.
- [ ] API/docs/limitations/feature policy/CI contract describe exactly Layer 3 and preserve stable prior-layer interfaces.

## Whole-Layer Review, Exact-SHA CI, and Merge Protocol

After Task 7 is committed:

1. Dispatch a maximum-effort GPT-5.6-family whole-layer specification reviewer and a separate maximum-effort GPT-5.6-family quality reviewer over `origin/main...HEAD`. Fix every high-confidence finding with a RED regression where behavior changes, rerun the smallest affected GREEN commands, and repeat both reviews until clean.
2. Run the final local non-broad gate:

   ```bash
   npm run test:node && npm run test262:fixtures && TZ=UTC npm run test262:modules && npm run test:browser && npm run test:jsc && npm run typecheck && npm run lint && npm run format && npm run ci:check && npm run vendor:check && npm run benchmark:smoke
   ```

3. Push the reviewed HEAD, record its exact SHA, and open the PR:

   ```bash
   git push -u origin HEAD
   HEAD_SHA="$(git rev-parse HEAD)"
   gh pr create \
     --repo yoonbuck/jsjs \
     --base main \
     --head "$(git branch --show-current)" \
     --title "Implement ES2015 static modules and portable loading" \
     --body $'## Summary\n- add canonical portable ES2015 module loading\n- add transactional linking, live bindings, strict evaluation, and namespace exotica\n- add portable and focused pinned module Test262 coverage\n\n## Stable interfaces\n- `parseModule(source, options)`\n- `createModuleLoader(realm, { resolve, load })`\n- `ModuleLoader#loadAndEvaluate(specifier, referrer)`\n- `ModuleLoaderError`\n\nCloses #62'
   PR_NUMBER="$(gh pr view --repo yoonbuck/jsjs --json number --jq .number)"
   ```

   Before running the command, extend the body with the final focused Test262 and exact local evidence if the results add information beyond the summary. Keep `Closes #62`.

4. Resolve the workflow run by exact `$HEAD_SHA`, then synchronously watch that run:

   ```bash
   RUN_ID="$(gh run list --repo yoonbuck/jsjs --commit "$HEAD_SHA" --workflow CI --json databaseId,headSha --limit 10 --jq "map(select(.headSha == \"$HEAD_SHA\"))[0].databaseId")"
   test -n "$RUN_ID"
   gh run watch "$RUN_ID" --repo yoonbuck/jsjs --exit-status
   ```

   Run the watch through one `bash` shell session with a 600-second initial wait. If it backgrounds, call `read_bash` on that same shell with 600-second waits until completion. While it runs, update PR/issue text or perform review work that does not change the pushed SHA. Never accept a run for another commit.

5. Verify the PR head and all required checks still match `$HEAD_SHA`:

   ```bash
   gh pr view "$PR_NUMBER" --repo yoonbuck/jsjs --json headRefOid,mergeStateStatus,statusCheckRollup
   ```

   If a fix changes HEAD, repeat push, exact-SHA run resolution, synchronous watch, and verification.

6. Keep issue comments current at each dependency transition: #62 implementation/PR status, #28 Layer 3 status, #24 roadmap status, and #61 blocked/unblocked status. Do not close #28, #24, or #61 in this layer.
7. Only after task reviews, whole-layer reviews, and required exact-SHA CI are all green, squash-merge the PR and delete the branch:

   ```bash
   gh pr merge "$PR_NUMBER" --repo yoonbuck/jsjs --squash --delete-branch
   ```

8. Resolve the merge commit from `main`, verify it contains the PR, and publish that exact merge SHA plus the stable module/loader interfaces to #62 and #28. Update #24 to record Layer 3 completion and #61 to state that final integration/release is unblocked. Then report the merge SHA to the coordinator and go idle for archival.
