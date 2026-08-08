# ES2015 Iterators and `for`-`of` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the ES2015 iteration protocol — the §7.4 abstract
operations, `%IteratorPrototype%`, the Array and String iterators reached
through `@@iterator`, and the `for`-`of` statement with per-iteration lexical
bindings and full `IteratorClose` ordering.

**Architecture:** Abstract operations in `src/runtime/iterator.js`; iterator
intrinsics and built-ins in `src/runtime/iterator-object.js` and
`src/builtins/iterator.js`; parser/static-semantics/evaluator changes enable
`for`-`of`. `@@iterator` is the agent-owned well-known symbol; the intrinsics
are per-realm. See
`docs/superpowers/specs/2026-08-08-es2015-iterators-for-of-design.md`.

**Tech Stack:** Plain ES2020 JavaScript with JSDoc types, the portable test
harness in `test/harness/`, pinned Test262 at
`b363f29d3c43c626dc852744ad64a0b48a003693`.

## Global Constraints

- Nothing under `src/` may import a host module; guest behaviour may not lean on
  host `eval`, `Function`, or host iteration.
- The engine must not reuse the host's own `Symbol.iterator`; iteration uses the
  agent's minted well-known symbol, and protocol lookup follows the receiver's
  agent across boundaries.
- `%IteratorPrototype%` and the Array/String iterator prototypes are per-realm.
- ES5.1 behaviour must not change: `for`-`in`, `for`, and every existing loop
  and statement keep their semantics; only `ForOfStatement` is newly accepted.
- `Array.prototype[@@iterator]` must be the same function object as
  `Array.prototype.values`.
- Every new portable suite must be registered in `test/suites.js`.
- Run `npx prettier --write` on every file touched before committing.

---

### Task 1: Iterator abstract operations

**Files:**

- Create: `src/runtime/iterator.js`
- Create: `test/iterators.test.js`
- Modify: `test/suites.js`

**Produces:** `getMethod`, `createIterResultObject`, `getIterator`,
`iteratorNext`, `iteratorComplete`, `iteratorValue`, `iteratorStep`,
`iteratorClose`, with the Iterator Record shape `{ iterator, nextMethod, done }`.

- [x] **Step 1: Write tests.** Unit-test each operation, including
      `IteratorClose`'s throw-wins, non-object-`TypeError`, and absent-`return`
      cases, driving custom guest iterators.
- [x] **Step 2: Implement.** §7.4 operations raising `GuestErrorSignal` for
      guest-visible failures; `iteratorClose(realm, record, completionIsThrow)`.
- [x] **Step 3: Verify.** `node test/run-node.js test/iterators.test.js`.

---

### Task 2: Iterator intrinsics and built-in iterators

**Files:**

- Create: `src/runtime/iterator-object.js`
- Create: `src/builtins/iterator.js`
- Modify: `src/runtime/realm.js`
- Modify: `test/iterators.test.js`

**Produces:** `%IteratorPrototype%`, `%ArrayIteratorPrototype%`,
`%StringIteratorPrototype%`; `Array.prototype.values`/`keys`/`entries`/
`@@iterator`; `String.prototype[@@iterator]`; the array/string iterator `next`
closures.

- [x] **Step 1: Write tests.** Behavioural tests for array key/value/entry
      iteration, string code-point iteration with surrogate pairs, the
      `values`/`@@iterator` identity, and `@@toStringTag` tags.
- [x] **Step 2: Implement.** Iterator objects carrying internal slots; install
      after the date intrinsics in `realm.js`.
- [x] **Step 3: Verify.** `node test/run-node.js test/iterators.test.js`.

---

### Task 3: `for`-`of` parser and static semantics

**Files:**

- Modify: `src/parser.js`
- Modify: `src/evaluator/static-semantics.js`
- Modify: `test/parser.test.js`

**Produces:** `ForOfStatement` accepted by the grammar, rejected as an
iteration-body function-declaration host, and walked by both var-scope and
block-nested static-semantics passes.

- [x] **Step 1: Write tests.** `for`-`of` (var/let/const/assignment heads)
      parses; `for (x of []) function f(){}` is an early error.
- [x] **Step 2: Implement.** Remove the `ForOfStatement` rejection, add the
      body-parent label, add `case 'ForOfStatement'` next to `ForInStatement`.
- [x] **Step 3: Verify.** `node test/run-node.js test/parser.test.js`.

---

### Task 4: `for`-`of` evaluation

**Files:**

- Modify: `src/evaluator/statements.js`
- Modify: `test/for-of.test.js`
- Modify: `test/suites.js`

**Produces:** `evaluateForOfStatement` implementing §14.7.5.7
`ForIn/OfBodyEvaluation` for the `iterate` kind.

- [x] **Step 1: Write tests.** Arrays, strings, custom iterables, per-iteration
      `let` closures, `var` sharing, `const` assignment rejection, TDZ head,
      non-iterable `TypeError`, and `break`/`return`/`throw`/`continue`/labeled
      closing with the specified `IteratorClose` ordering and error precedence.
- [x] **Step 2: Implement.** TDZ head evaluation, `getIterator`, the step loop,
      per-iteration binding, and abrupt-completion closing.
- [x] **Step 3: Verify.** `node test/run-node.js` (full suite, no regressions).

---

### Task 5: Test262 pinning and documentation

**Files:**

- Modify: `tools/test262/es5-selection.json`
- Modify: `tools/test262/upstream-subset.json` (regenerated)
- Modify: `docs/conformance.md` (coverage regenerated), `docs/limitations.md`,
  `docs/architecture.md`
- Create: this plan and its design spec

**Produces:** `featureAreas` claims for the built-in iterator directories and the
`for`-`of` language tests (backed by the existing `Symbol.iterator`/
`Symbol.toStringTag` probes), the regenerated pinned subset, and refreshed docs.

- [x] **Step 1: Claim.** Add `featureAreas` entries; run `test262:select` to
      regenerate `upstream-subset.json`.
- [x] **Step 2: Measure.** Run `test262:upstream`; confirm every newly pinned
      record passes and regenerate the coverage block.
- [x] **Step 3: Document.** Update `limitations.md`/`architecture.md`; remove the
      "iterator protocol belongs to #47" deferral.

---

### Task 6: Validation and review

- [ ] Full `node test/run-node.js`, `test262:fixtures`, `lint`, `typecheck`,
      `format`, `ci:contract`.
- [ ] Cross-runtime parity (Node/Chromium/JSC) on the new records.
- [ ] Rubber-duck and code-review gates.
- [ ] Commit with the `Co-authored-by` trailer, push, open the PR, and report
      back to the coordinating session.
