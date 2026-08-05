# ECMAScript Engine Design

## Scope

The project will grow through independently testable milestones rather than attempting
the full language in one change. The first milestone is an ES5-oriented tree-walking
interpreter and host-neutral test harness. Later milestones will add newer syntax,
modules, jobs, proxies, typed arrays, internationalization hooks, and the remaining
Test262 feature groups.

Compliance means observable behavior agrees with the applicable ECMA-262 edition.
Passing Test262 is the primary external measure, supplemented by focused local
regression tests. Unsupported syntax and semantics must fail explicitly rather than
falling through to the host JavaScript engine.

## Portability and Language Constraints

Production and test infrastructure use plain JavaScript with JSDoc types. Engine
source may not use `eval`, `Function`, dynamic import, Node-only modules, or host
objects to implement guest-language behavior. The initial runtime floor is ES2020 so
the same source runs in current Node/V8, JavaScriptCore shells, and evergreen
browsers. Runtime-specific launchers are thin adapters around a shared harness.

The repository uses npm only for development tooling and a parser dependency. Guest
values remain native JavaScript primitives where their semantics coincide with
ECMAScript; guest objects, environments, references, completions, realms, and
intrinsics use explicit engine-owned records.

## Architecture

Source text enters a parser adapter that returns ESTree. The evaluator dispatches by
node type and returns explicit completion records. Expressions may produce references;
the runtime's `GetValue` and `PutValue` operations resolve those references against
declarative or object environment records. A realm owns its global environment and a
fresh intrinsic graph, preventing host-global leakage and test-to-test contamination.

The first milestone is divided into focused modules:

- `src/parser.js` validates parser output and normalizes parser errors.
- `src/runtime/` defines completions, references, property descriptors, engine
  objects, environment records, abstract operations, realms, and errors.
- `src/evaluator/` contains statement and expression dispatch plus declaration
  instantiation.
- `src/builtins/` creates intrinsic constructors, prototypes, and global functions.
- `src/api.js` exposes parse, realm creation, script evaluation, and value inspection.
- `test/harness/` loads local cases and Test262 metadata/includes through portable
  filesystem and browser adapters.

Dependencies flow inward: API to parser/evaluator, evaluator to runtime operations,
and built-ins to runtime objects. Runtime modules do not depend on evaluator modules.

## Execution Semantics

Every script is parsed before execution. Global declaration instantiation creates
bindings according to ES5 rules, then statement-list evaluation propagates normal,
break, continue, return, and throw completions. Functions capture their lexical
environment, create activation environments on call, bind `this` and arguments, and
execute through the same evaluator.

Property access always crosses engine abstract operations. Engine objects store
descriptors in ordered maps, implement prototype traversal, and enforce writable,
enumerable, and configurable attributes. Arrays and functions are specialized engine
objects. Conversion, equality, arithmetic, relational comparison, and property-key
logic live in named abstract-operation modules so specification behavior is reusable
and directly testable.

Host exceptions are reserved for engine defects and embedding failures. Guest syntax
and runtime failures become guest error objects carried by throw completions. The API
returns a structured execution result and provides an explicit method for converting
guest values into diagnostic host representations.

## Test Strategy

Local tests use a tiny dependency-free test protocol: each test exports a name and a
function, while launchers report a common JSON-lines result format. Unit suites cover
runtime records and abstract operations. Integration suites execute scripts in fresh
realms and assert guest-visible values or thrown error types. Each production behavior
is introduced test-first.

The Test262 runner reads frontmatter, applies strict/non-strict variants, loads only
the declared harness includes, observes negative parse/runtime expectations, supports
feature filters, and emits deterministic pass/fail/skip records. Runtime adapters
provide file discovery and text loading for Node, JavaScriptCore, and browsers without
changing test semantics. Browser execution uses a generated manifest and a static
runner page.

CI begins with Node and browser runs, with JavaScriptCore enabled where the runner
image provides `jsc`. It publishes local-test results and a Test262 progress report by
feature. A pinned Test262 revision makes results reproducible.

## Delivery and Project Tracking

GitHub issues represent compliance milestones and feature groups. Each issue records
the relevant specification clauses, Test262 feature filters, local regression tests,
and current pass counts. Work occurs on isolated branches/worktrees and lands in small
reviewable increments. Independent runtime, evaluator, built-in, and harness tasks may
run in parallel only after their shared interfaces are fixed.

The first implementation milestone delivers project tooling, the portable local
harness, parser integration, runtime records, a realm/global environment, literals
and basic expressions, variable declarations, control flow, functions, objects,
arrays, and an initial Test262 runner. It is complete when all local tests pass in
Node and a browser, the JavaScriptCore launcher passes when `jsc` is installed, and
the supported Test262 subset produces a reproducible report with no unexpected
failures.

