# Documentation Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized README with a concise setup/usage guide and four accurate, drift-checked technical references.

**Architecture:** README becomes the navigation and quick-start layer. Architecture, testing, conformance, and limitations each receive one authoritative document; Test262 generation writes its compact summary to conformance.md and its detailed records to the existing JSONL artifact.

**Tech Stack:** GitHub-flavored Markdown, plain ES2020 JavaScript contract tests, Prettier, existing Test262 reporting tools.

## Global Constraints

- `README.md` primarily covers development setup and end-user usage.
- Current technical reference lives in `docs/architecture.md`, `docs/testing.md`, `docs/conformance.md`, and `docs/limitations.md`.
- Historical Superpowers specs and plans remain unchanged project records.
- Generated Test262 details remain deterministic and drift-checked.
- Every command, API, support, limitation, and deviation claim must agree with code or tests.

---

### Task 1: Documentation contract tests

**Files:**

- Modify: `test/node/repository-invariants.test.js`
- Modify: `test/ci/full-contract.test.js`

**Interfaces:**

- Consumes: repository Markdown files, `package.json`, coverage marker constants.
- Produces: contracts for reference links, npm commands, document ownership, and generated coverage placement.

- [ ] Add failing tests that require the four reference files, resolve every local Markdown link, verify every documented `npm run` command exists, reject Test262 report records in README, and require coverage markers only in `docs/conformance.md`.
- [ ] Run `node test/run-node.js test/node/repository-invariants.test.js test/ci/full-contract.test.js` and confirm failures name the missing reference files and misplaced markers.
- [ ] Add reusable Markdown-link and documented-command extraction helpers inside the test files, keeping filesystem code in Node-only suites.
- [ ] Re-run the targeted suites and confirm only content-migration requirements remain failing.
- [ ] Commit with `test: define documentation contracts`.

### Task 2: Architecture and testing references

**Files:**

- Create: `docs/architecture.md`
- Create: `docs/testing.md`
- Modify: `README.md`

**Interfaces:**

- Produces: authoritative architecture boundaries and testing/runbook documentation linked from README.

- [ ] Inventory exported API names from `src/index.js`/`src/api.js`, runtime boundaries from `src/runtime/realm.js`, suites from `test/suites.js`, and scripts from `package.json`.
- [ ] Write `docs/architecture.md` covering source flow, realms/intrinsics, values/objects/environments/references/completions, evaluator boundaries, host adapters, and embedding API without milestone-history prose.
- [ ] Write `docs/testing.md` covering setup, Node/JSC/browser commands, suite organization, Test262 fixture/upstream commands, generated artifacts, CI jobs, and troubleshooting missing pinned checkouts.
- [ ] Replace duplicated README architecture/testing detail with concise setup, usage examples, common commands, and links to both references.
- [ ] Run Markdown contracts and Prettier.
- [ ] Commit with `docs: split architecture and testing references`.

### Task 3: Conformance reference and report generation

**Files:**

- Create: `docs/conformance.md`
- Modify: `README.md`
- Modify: `tools/test262/coverage.js`
- Modify: `tools/test262/upstream-run.js`
- Modify: `test/test262-runner.test.js`
- Modify: `test/ci/full-contract.test.js`

**Interfaces:**

- Consumes: `docs/test262-report.jsonl`, Test262 inventory and coverage records.
- Produces: deterministic `<!-- test262-coverage:begin/end -->` summary in `docs/conformance.md`.

- [ ] Add failing tests asserting the renderer updates `docs/conformance.md`, leaves README marker-free, and produces current file/record counts and percentages.
- [ ] Run the targeted Test262 and contract suites and verify failures point to README as the old generated-summary target.
- [ ] Generalize the coverage document update code to target `docs/conformance.md`; retain the detailed JSONL path unchanged.
- [ ] Write `docs/conformance.md` with supported ES5 surface, selection/exclusion methodology, denominator semantics, generated summary markers, and links to detailed JSONL and policy artifacts.
- [ ] Remove the old README conformance internals and retain only a short current-status headline linked to the reference.
- [ ] Regenerate artifacts and run `npm run test262:upstream:check`.
- [ ] Commit with `docs: move conformance reporting out of readme`.

### Task 4: Limitations, deviations, and consistency audit

**Files:**

- Create: `docs/limitations.md`
- Modify: `README.md`
- Modify: `tools/test262/es5-selection.json`
- Modify: `test/es5-selection.test.js`
- Modify: `test/node/repository-invariants.test.js`

**Interfaces:**

- Consumes: current README limitation/deviation tables and `engine-deviation` exclusion reasons.
- Produces: one authoritative limitations/deviations reference whose headings are named by selection policy.

- [ ] Add failing tests requiring each `engine-deviation` exclusion to reference a heading in `docs/limitations.md` and rejecting authoritative deviation tables in README.
- [ ] Run targeted selection/invariant tests and confirm failures identify the absent document and old README ownership.
- [ ] Write `docs/limitations.md`, separating engine limitations from intentional ES5 deviations and preserving concrete observable examples/spec citations.
- [ ] Update selection reasons to name stable limitations-document anchors without changing classifications.
- [ ] Reduce README to a short limitations warning and link.
- [ ] Audit every documented limitation against local tests or current code; delete stale claims and add missing observable constraints only when verified.
- [ ] Run selection, invariant, Node, JSC, and browser suites.
- [ ] Commit with `docs: centralize limitations and deviations`.

### Task 5: Final documentation and behavior audit

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/testing.md`
- Modify: `docs/conformance.md`
- Modify: `docs/limitations.md`

**Interfaces:**

- Produces: final current-reference documentation set.

- [ ] Compare all README commands with `package.json`, all API examples with exports, all supported-family claims with realm installation, and coverage numbers with generated artifacts.
- [ ] Run `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test:node`, `npm run test:browser`, `npm run test:jsc`, `npm run test262:upstream:check`, and `npm run ci:contract`.
- [ ] Verify README is substantially shorter, contains no generated report block, and every reference link resolves.
- [ ] Request a whole-branch documentation/code consistency review and fix all Important findings.
- [ ] Commit with `docs: finalize project documentation`.
