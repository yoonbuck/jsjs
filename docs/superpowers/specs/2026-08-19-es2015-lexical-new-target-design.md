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
Focused tests audit decoded escaped identifiers against their exact
IdentifierName and BindingIdentifier contexts rather than assuming every
decoded identifier is valid.

`MetaProperty` becomes a supported expression with exact ESTree validation:

- it has own data-property children `meta` and `property`;
- both children are identifiers;
- `meta.name` is exactly `new`;
- `property.name` is exactly `target`; and
- no unsupported scalar or child shape can reach evaluation.

The syntax capability is a lexical function-code property, distinct from the
runtime value. Entering ordinary, method, class-constructor, or generator
function code establishes the capability. A nested non-arrow function
establishes a new capability and runtime environment. Arrow functions inherit
both from the nearest enclosing function code. A script, module, or top-level
custom arrow does not have it. Direct eval inherits both capability and current
value from its caller; indirect eval remains script context. A direct eval in a
top-level arrow is invalid because that arrow has no enclosing function code.

The `FunctionExecutionEnvironment` carrying function-code capability and the
exact invocation's `newTarget` exists before ordinary, method, class-constructor,
or generator FunctionDeclarationInstantiation evaluates parameter defaults,
destructuring defaults, or computed parameter initializers. Ordinary, method,
and generator calls expose `undefined`; construction exposes the actual new
target. Arrow parameter defaults lexically resolve the retained enclosing
function environment record rather than a copied value. A direct eval invoked
from any parameter initializer inherits that same record. Focused tests cover
each of these initialization paths.

A function's syntactic capability begins at its parameter list and body, not at
expressions that create the function. Computed object and class method names,
class heritage, and every other definition-time expression are evaluated in the
surrounding execution context and do not gain the method or constructor body's
capability. They may contain `new.target` only when that surrounding context is
already function code. The method or constructor body itself, including its
parameter initializers, permits `new.target`. Source AST and custom/reused AST
tests pin both acceptance and rejection for computed method names and class
heritage.

This is not enforced by a generic walk flag alone. Tests pin exact acceptance
and rejection for:

- Acorn source ASTs;
- reusable Program snapshots; and
- hostile custom ASTs.

Every accepted `MetaProperty` has exact own data-property children
`meta: Identifier("new")` and `property: Identifier("target")`, no malformed or
extra evaluator-relevant child edge, a supported expression parent position,
and an acyclic AST edge graph. Inherited fields, accessors, wrong names, wrong
positions, and cycles produce a normalized parse-phase `SyntaxError`.

## Runtime Semantics

`FunctionExecutionEnvironment` remains the single execution-context carrier.
It records both:

- `newTargetStatus: "absent" | "present"`, where `present` means this record is
  function code even when its value is `undefined`; and
- the active `newTarget` value, which is `undefined` for ordinary calls and the
  actual constructor argument for construction.

This distinction prevents synthetic global records from accidentally
authorizing `new.target` while allowing ordinary called functions to evaluate
it to `undefined`.

All ordinary `[[Construct]]` execution, not only class construction, creates a
fresh function environment whose `newTarget` is the exact value passed to
`EngineFunction.constructFunction(args, newTarget)`. Ordinary calls and method
calls create a function-code record whose value is `undefined`. Class
construction continues using its existing slot. Generator calls instantiate
parameters in function code with `undefined`; generator resume frames retain
that same environment. Generator functions remain non-constructible, while
`new.target` in their bodies is permitted and evaluates to `undefined`.

Arrows retain the enclosing `FunctionExecutionEnvironment` record itself rather
than copying a value snapshot. Direct eval reuses the caller record. Dynamic
`Function("return new.target")` creates valid function code in the dynamic
constructor's Realm and global environment. The returned function yields
`undefined` when called and the actual new target when constructed; errors
remain owned by that Realm. The existing dynamic generator constructor receives
equivalent P0 coverage: its function code permits `new.target`, which evaluates
to `undefined` on normal generator invocation because generator functions are
non-constructible. Bound construction preserves its target correction
(`new bound()` exposes the bound target) and propagates an explicit alternate
new target. Base and derived `super` construction preserve the active value.
Cross-Realm calls link the exact value through the existing Agent boundary and
materialize failures in the owning Realm.

Strict direct eval may create a fresh lexical declaration environment, but it
retains the caller's `FunctionExecutionEnvironment`; neither strictness nor the
fresh lexical environment may discard `newTargetStatus` or its current value.

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
   The lexical matrix includes uppercase and lowercase prefixes, boundary code
   points, identifier-start versus identifier-continue positions, escaped
   reserved words, strict legacy octal preservation, string and template
   raw/cooked identity, out-of-range/surrogate/incomplete escapes, and
   source-location parity.
3. Prove `new.target` for ordinary call, `new`, Reflect-style alternate new
   targets through available engine APIs, bound construction, base and derived
   classes and `super`, methods, generators, arrows nested in function code and
   at top level, returned closures, direct versus indirect eval, dynamic
   functions and generators, member use, tagged-template use, and template
   substitutions. Include ordinary, method, generator, arrow, destructuring,
   and nested parameter defaults.
4. Prove cross-Realm value propagation and Realm-owned errors.
5. Prove parse-phase failures and exact source/reusable/hostile-custom AST
   parity for malformed shapes, child edges, cycles, wrong contexts, computed
   method names, class heritage, parameter initializers, and bodies.
6. Run only the exact 83-root focused Test262 ledger under `TZ=UTC`.
7. Regenerate and check the taxonomy, requiring the core P0 selector to reach
   zero without changing whole-tree edition denominators. Newly parseable roots
   may either pass or move through reviewed exact-path reassignment to an
   existing downstream semantic owner. Selector zero must not come from broad
   feature enabling or from expanding P0.

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
