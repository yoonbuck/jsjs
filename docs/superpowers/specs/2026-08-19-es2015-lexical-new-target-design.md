# ES2015 Lexical Grammar and `new.target` Design

## Goal

Complete issue #77 from exact baseline
`54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7` by admitting the ES2015 binary
and octal numeric literal forms, Unicode code-point escapes, and the exact
`new.target` grammar and runtime contexts owned by P0.

The authoritative core input is the sorted 83-root / 164-variant selector
`partition === "core" && status ===
"blocked:lexical-grammar-and-new-target"`. Its path-ledger SHA-256 is
`b2657db74331391b156f87e1e831665ef4ae3a738d48836e476c13828b1aeff4`.

## Scope

The change owns:

- `0b`/`0B` binary and `0o`/`0O` octal numeric literals;
- valid ES2015 `\u{...}` escapes in string literals, identifiers, and template
  elements;
- exact `new.target` parsing, static context, custom/reused AST validation, and
  evaluation in ordinary functions, methods, generators, class constructors,
  arrows, direct eval, dynamic functions, bound construction, and super
  construction; and
- deterministic reclassification of the exact P0 ledger.

The change does not own numeric separators, later lexical grammar, unrelated
parser widening, or downstream semantics exposed only after these forms parse.
Such failures move to their existing roadmap owner rather than expanding P0.
The one Annex B lexical blocker remains separately visible and non-blocking.

## Chosen Architecture

Use the pinned Acorn ES6 parser as the lexical authority and remove only the
engine capability gates that deliberately reject these already-parsed ES2015
forms. This preserves source locations, raw/cooked text, Acorn early errors,
and the single portable parser dependency boundary.

Source preprocessing is rejected because it would duplicate lexical grammar
and corrupt raw text and locations. An Acorn plugin or fork is rejected because
Acorn already parses all three owned grammar forms at `ecmaVersion: 6`.

The parser remains at `ecmaVersion: 6`. Numeric separators and every later
grammar form therefore remain parser errors rather than being admitted and
filtered after parsing.

## Parser and AST Capability Boundary

The capability pass stops rejecting:

- numeric `Literal.raw` beginning with `0b`, `0B`, `0o`, or `0O`;
- valid code-point escapes preserved in string `Literal.raw`;
- valid code-point escapes in identifier source spans; and
- valid code-point escapes in `TemplateElement.value.raw`.

Acorn remains responsible for decoding values and rejecting malformed,
surrogate, out-of-range, incomplete, escaped-reserved-word, and otherwise
invalid lexical forms at parse phase. The engine does not add a second decoder.

`MetaProperty` becomes a supported expression with exact ESTree validation:

- it has own data-property children `meta` and `property`;
- both children are identifiers;
- `meta.name` is exactly `new`;
- `property.name` is exactly `target`; and
- no unsupported scalar or child shape can reach evaluation.

The syntax walk carries a `newTargetAllowed` capability. Entering a non-arrow
function body enables it. Arrow functions inherit it. A script, module, or
top-level custom arrow does not have it. Direct eval receives it only from a
caller that is executing function code; indirect eval remains script context.
Invalid placement is a parse-phase `SyntaxError`, including custom and reused
AST entry points.

## Runtime Semantics

`FunctionExecutionEnvironment` remains the single execution-context carrier.
It records both:

- whether the current lexical function environment provides `new.target`; and
- the active `newTarget` value, which is `undefined` for ordinary calls and the
  actual constructor argument for construction.

This distinction prevents synthetic global records from accidentally
authorizing `new.target` while allowing ordinary called functions to evaluate
it to `undefined`.

Ordinary `[[Construct]]` executes the function body with a fresh function
environment whose `newTarget` is the value passed to `constructFunction`.
Class construction continues using its existing `newTarget` slot. Ordinary
calls, methods, and generator calls create a function-code record with an
`undefined` value. Arrows retain their enclosing function record. Direct eval
reuses the caller record. Dynamic `Function` construction uses the ordinary
constructor path. Bound and super construction retain their existing corrected
target/new-target propagation.

The synchronous evaluator and resumable generator evaluator both dispatch
`MetaProperty`. Evaluation reads the nearest authorized function environment's
`newTarget` without coercion or property lookup.

## Error Phases and Defensive Parity

Malformed source remains a parser `SyntaxError`. A well-formed but
wrong-context `new.target` is also rejected during parsing or the parser's
static validation pass, never during evaluation.

Custom `options.parse` trees and reusable `options.program` trees receive the
same shape and context checks as Acorn output. Malformed `MetaProperty` children,
wrong names, inherited syntax fields, accessors, unknown metadata AST nodes,
and invalid positions fail before evaluation. The trusted Acorn path and both
untrusted paths accept and reject the same semantic forms.

## Test Strategy

Implementation is strict RED-first:

1. Add focused portable tests that fail on the current explicit capability
   gates and missing runtime dispatch.
2. Prove exact binary/octal spellings and values, valid and invalid Unicode
   code-point escapes in all owned lexical positions, and explicit rejection
   of numeric separators.
3. Prove `new.target` call-versus-construct values, alternate new targets,
   classes and super, bound construction, methods, generators, arrows, returned
   closures, direct versus indirect eval, dynamic functions, member use, and
   tagged-template use.
4. Prove parse-phase failures and custom/reused AST parity for malformed or
   wrong-context `MetaProperty` trees.
5. Run only the exact 83-root focused Test262 ledger under `TZ=UTC`.
6. Regenerate and check the taxonomy, requiring the core P0 selector to reach
   zero without changing whole-tree edition denominators. Reclassify remaining
   failures to their existing semantic owners.

Portable suites run in Node, Chromium, and JavaScriptCore. The branch also runs
the repository static, invariant, benchmark-smoke, taxonomy-drift, typecheck,
lint, and formatting gates. Broad local Test262 execution is prohibited; its
authority remains exact-head CI.

## Delivery and Review

One focused PR owns the parser, evaluator, runtime, tests, taxonomy
reclassification, and directly related documentation. Fresh specification,
task-quality, and maximum-capability whole-branch reviews must be fixed before
delivery. The reviewed head must pass CI and CodeQL before squash merge. After
merge, issue #77 closes, #70 and native dependency state are updated with exact
counts, and newly unblocked issues are published.
