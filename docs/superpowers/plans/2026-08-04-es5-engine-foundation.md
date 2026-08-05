# ES5 Engine Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a portable, test-first ES5 interpreter foundation and Test262-compatible harness.

**Architecture:** Parse source to ESTree, evaluate it with explicit completion/reference/environment records, and keep every guest realm isolated from the host. A shared JSON-lines test protocol is driven by thin Node, JavaScriptCore, and browser adapters.

**Tech Stack:** Plain ES2020 JavaScript, JSDoc with TypeScript checking, Acorn, ESLint, Prettier, npm scripts, Playwright for browser validation.

## Global Constraints

- Production code and test infrastructure use plain JavaScript with JSDoc types.
- Engine code must not use `eval`, `Function`, dynamic import, Node-only modules, or host objects to implement guest behavior.
- The supported host runtime floor is ES2020.
- Test262 runs are pinned to an explicit upstream revision.
- New behavior follows red-green-refactor and receives focused local tests.

---

### Task 1: Portable project and test foundation

**Files:**
- Create: `package.json`, `jsconfig.json`, `eslint.config.js`, `.prettierrc.json`
- Create: `test/harness/assert.js`, `test/harness/runner.js`
- Create: `test/run-node.js`, `test/run-browser.html`, `test/run-browser.js`
- Create: `test/foundation.test.js`

**Interfaces:**
- Produces: `assertSame(actual, expected)`, `assertThrows(fn, ErrorType)`, and `runTests(tests, reporter)`.

- [ ] Write `test/foundation.test.js` with one passing assertion, one captured failure, and deterministic JSON result assertions.
- [ ] Run `node test/run-node.js test/foundation.test.js`; confirm it fails because harness modules do not exist.
- [ ] Add package metadata, strict JSDoc checking, formatting/lint rules, and the minimal shared harness.
- [ ] Run `npm test`, `npm run typecheck`, and `npm run lint`; confirm all pass.
- [ ] Commit with `chore: add portable test foundation`.

### Task 2: Parser and runtime records

**Files:**
- Create: `src/parser.js`
- Create: `src/runtime/completion.js`, `src/runtime/reference.js`, `src/runtime/errors.js`
- Create: `test/parser.test.js`, `test/runtime-records.test.js`

**Interfaces:**
- Produces: `parseScript(source, options)`, completion factories, `Reference`, `getValue(reference)`, and `putValue(reference, value)`.

- [ ] Add tests for valid scripts, normalized syntax errors, all completion kinds, resolvable references, and unresolvable-reference errors.
- [ ] Run targeted tests and verify missing-module failures.
- [ ] Install pinned Acorn, then implement only the parser adapter and runtime records required by the tests.
- [ ] Run targeted tests, type checking, and linting.
- [ ] Commit with `feat: add parser and runtime records`.

### Task 3: Objects, descriptors, and abstract operations

**Files:**
- Create: `src/runtime/object.js`, `src/runtime/descriptors.js`
- Create: `src/runtime/conversion.js`, `src/runtime/operators.js`
- Create: `test/objects.test.js`, `test/abstract-operations.test.js`

**Interfaces:**
- Consumes: runtime errors from Task 2.
- Produces: `EngineObject`, descriptor validation, `toPrimitive`, `toNumber`, `toString`, equality, arithmetic, and relational operations.

- [ ] Add descriptor, prototype lookup, mutation-attribute, conversion, equality, arithmetic, and edge-case tests.
- [ ] Verify the new tests fail for absent modules.
- [ ] Implement ordered own properties and named ES5 abstract operations without consulting host prototypes.
- [ ] Run all local tests and static checks.
- [ ] Commit with `feat: add object model and abstract operations`.

### Task 4: Environments, realms, and API shell

**Files:**
- Create: `src/runtime/environment.js`, `src/runtime/realm.js`
- Create: `src/builtins/fundamental.js`, `src/api.js`, `src/index.js`
- Create: `test/environments.test.js`, `test/realms.test.js`

**Interfaces:**
- Consumes: `EngineObject` and runtime records.
- Produces: declarative/object/global environment records, `createRealm()`, and `evaluateScript(realm, source)`.

- [ ] Add tests for mutable/immutable bindings, environment chaining, fresh intrinsic identity, and host-global isolation.
- [ ] Verify targeted failures.
- [ ] Implement environment records, a minimal intrinsic graph, realm creation, and an API that initially rejects unsupported AST nodes explicitly.
- [ ] Run all checks.
- [ ] Commit with `feat: add isolated realms and environments`.

### Task 5: Expression and statement evaluation

**Files:**
- Create: `src/evaluator/index.js`, `src/evaluator/expressions.js`, `src/evaluator/statements.js`
- Create: `src/evaluator/declarations.js`
- Create: `test/evaluator-expressions.test.js`, `test/evaluator-statements.test.js`

**Interfaces:**
- Consumes: parser, realm, references, completions, and abstract operations.
- Produces: `evaluate(node, context)` with explicit completion propagation.

- [ ] Add script tests for literals, identifiers, unary/binary/logical/conditional expressions, assignment, variables, blocks, conditionals, and loops.
- [ ] Verify each behavior fails as unsupported before implementation.
- [ ] Implement AST dispatch and declaration instantiation in small red-green slices.
- [ ] Run all checks after each slice.
- [ ] Commit with `feat: evaluate core expressions and statements`.

### Task 6: Functions, objects, and arrays

**Files:**
- Create: `src/runtime/function-object.js`, `src/runtime/array-object.js`
- Modify: `src/evaluator/expressions.js`, `src/evaluator/declarations.js`
- Create: `test/functions.test.js`, `test/object-array-literals.test.js`

**Interfaces:**
- Produces: callable engine functions, activation environments, arguments binding, object literals, array literals, property access, and calls.

- [ ] Add tests for closures, recursion, `this`, arguments, return/throw, constructors, sparse arrays, accessors, and member calls.
- [ ] Confirm unsupported-node or missing-operation failures.
- [ ] Implement function and array specializations plus evaluator support incrementally.
- [ ] Run all checks.
- [ ] Commit with `feat: add functions objects and arrays`.

### Task 7: Initial Test262 runner and runtime adapters

**Files:**
- Create: `tools/test262/metadata.js`, `tools/test262/runner.js`, `tools/test262/report.js`
- Create: `tools/test262/adapters/node.js`, `tools/test262/adapters/jsc.js`, `tools/test262/adapters/browser.js`
- Create: `test/test262-runner.test.js`, `test/fixtures/test262/`
- Modify: `package.json`, `README.md`

**Interfaces:**
- Consumes: `createRealm()` and `evaluateScript()`.
- Produces: metadata parsing, strict/non-strict variants, include loading, negative-test handling, feature filtering, and deterministic JSON-lines reports.

- [ ] Add fixture tests for positive, parse-negative, runtime-negative, strict variant, include, feature-skip, and malformed metadata cases.
- [ ] Verify fixture tests fail because the runner is absent.
- [ ] Implement shared runner semantics and thin host adapters; pin the Test262 revision in package metadata.
- [ ] Run fixture tests in Node and browser; run JSC conditionally when available.
- [ ] Document commands, supported subset, and report interpretation.
- [ ] Commit with `test: add portable test262 runner`.

### Task 8: CI and milestone report

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `tools/test262/features.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: all test and static-check scripts.
- Produces: repeatable Node/browser CI and a checked-in supported-feature manifest.

- [ ] Add a local test that validates every declared npm/CI command and feature-manifest entry.
- [ ] Verify it fails before workflow and manifest creation.
- [ ] Add CI jobs for formatting, linting, type checking, Node tests, browser tests, and the pinned Test262 subset.
- [ ] Run every CI command locally and generate the initial Test262 report.
- [ ] Commit with `ci: verify es5 engine foundation`.

