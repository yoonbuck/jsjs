# ES2015 Lexical Declarations and TDZ Design

## Goal

Add `let` and `const` to the engine: the ES2015 lexical declaration grammar and
its early errors, uninitialized bindings and the temporal dead zone, lexical
scope for blocks, `switch` case blocks, `catch` clauses, loops, function bodies,
`eval` code, and the global environment, plus per-iteration loop bindings. Every
ES5 behavior the engine already has must survive unchanged.

## Architecture

The engine keeps its ES5 shape — a vendored Acorn parse followed by AST-walking
early-error passes, then a recursive evaluator that threads an immutable
`EvaluationContext` carrying `env` (LexicalEnvironment) and `variableEnv`
(VariableEnvironment). Lexical declarations are layered onto that shape rather
than replacing it.

**Grammar.** `PARSER_OPTIONS.ecmaVersion` moves from `5` to `6`, which is the
only way the vendored parser will emit `VariableDeclaration` nodes of kind
`let`/`const` and run its lexical scope analysis. Raising the version also makes
Acorn accept the rest of ES2015, so a new parse-time early-error pass rejects
every ES2015 construct this milestone does not implement, keeping the accepted
grammar at exactly "ES5.1 plus lexical declarations". Acorn's own ES6 scope
analysis already raises every static redeclaration error the spec requires
(duplicate lexical names, lexical-versus-`var` collisions, `let` as a bound
name, `const` without an initializer, catch-parameter and formal-parameter
collisions), so the engine adds tests for that behavior rather than a second
implementation of it.

**Static semantics.** The ad-hoc hoisting walks in `src/evaluator/declarations.js`
become a dedicated `src/evaluator/static-semantics.js` module implementing the
spec's `BoundNames`, `VarDeclaredNames`, `VarScopedDeclarations`,
`LexicallyDeclaredNames`, `LexicallyScopedDeclarations`, their `TopLevel`
variants, and `IsConstantDeclaration`. Every walk stays iterative with an
explicit worklist, for the reason the existing walks are: hoisting runs outside
the realm's stack guard and must survive input the parser accepted.

**Bindings.** `DeclarativeEnvironmentRecord` already carries an `initialized`
flag and already throws a `ReferenceError` on reads and writes of an
uninitialized binding, which is the temporal dead zone. It gains the ES2015
`CreateImmutableBinding(N, S)` strict flag so `const` rejects assignment in
sloppy code too, where an ES5 immutable binding (a named function expression's
own name) stays silent. `GlobalEnvironmentRecord` gains the ES2015 lexical
queries — `HasLexicalDeclaration`, `HasVarDeclaration`,
`HasRestrictedGlobalProperty`, `CanDeclareGlobalVar`, `CanDeclareGlobalFunction`
— that global declaration instantiation needs to raise its runtime
`SyntaxError`s.

**Scoping.** Each construct that ES2015 gives a lexical scope creates a fresh
declarative environment and evaluates its body in a derived context, so every
exit path restores the previous environment with no `try`/`finally`, exactly as
`with` already does. Blocks, `switch` case blocks, and the three parts of a
`try` statement run `BlockDeclarationInstantiation`. Function bodies get a
lexical environment over the activation environment per §9.2.15. `for` and
`for-in` heads that declare lexically get a loop environment, and a `let` head
gets a fresh copy of its bindings per iteration so a closure captured in one
iteration observes that iteration's value. Every `eval` — direct or indirect,
strict or sloppy — gets a fresh lexical environment so its lexical declarations
never outlive the call, while a sloppy eval's `var`s still hoist to the caller's
variable environment.

**Web reality.** Block-level function declarations become lexically scoped, which
would silently break `{ function f(){} } f();`. Annex B.3.3 is implemented
alongside so sloppy code keeps the var-scoped alias, assigned when the
declaration is reached, giving both `{ function f(){} } f()` and
`if (false) { function f(){} } typeof f === 'undefined'`.

**Conformance.** The Test262 selection policy's "parses at ecmaVersion 5" filter
becomes "parses under the engine's supported grammar", which pulls the
`let`, `const`, and `block-scope` families into the pinned upstream subset
automatically. Exclusions that only existed because `let`/`const` were
unparsable become stale and are removed; the exclusions check enforces that.

## Scope

- `PARSER_OPTIONS.ecmaVersion` raised to 6 and a parse-time early-error pass
  rejecting every non-lexical ES2015 construct
- `src/evaluator/static-semantics.js` with the spec's declaration-name walks
- ES2015 `CreateImmutableBinding(N, S)` and the global lexical queries
- `BlockDeclarationInstantiation` for blocks, `switch` case blocks, and `try`
  block/handler/finalizer
- Annex B.3.3 block-level function declaration semantics in sloppy code
- loop scoping and per-iteration bindings for `for` and `for-in`
- function-body lexical environments per §9.2.15
- global lexical declarations and their runtime `SyntaxError`s
- `eval` lexical environments and `EvalDeclarationInstantiation` name checks
- Test262 selection policy, pinned subset, report, and coverage regeneration
- `docs/architecture.md`, `docs/conformance.md`, `docs/limitations.md` updates

Out of scope, and still rejected by the parser: Symbols, iterators, `for-of`,
destructuring, arrow functions, classes, generators, template literals,
computed and shorthand property keys, rest and spread, default parameters,
`new.target`, and `super`. Those belong to sibling issues #38, #43, #45, #47.

## Acceptance Criteria

`let`, `const`, block scope, and the temporal dead zone behave per ES2015 in
scripts, functions, blocks, `switch`, `catch`, loops, `eval`, and at global
scope; redeclaration and TDZ errors are spec-correct; per-iteration bindings
capture per iteration; every pre-existing ES5 behavior and test still passes;
the pinned Test262 `let`/`const`/`block-scope` families pass with no stale
exclusions; Node, Chromium, and JSC reports stay equivalent; and every CI
contract passes.
