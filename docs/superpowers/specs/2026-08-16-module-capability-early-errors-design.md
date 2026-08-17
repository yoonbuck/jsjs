# Module Capability and Early-Error Validation Design

**Issue:** #66  
**Base:** `94bc89d2128df5875818759c8394290d6ed8b239`

## Context

The static-module implementation validates module declaration shapes, module
binding collisions, and custom-parser statement payloads. Ordinary Acorn module
output does not enter the complete capability and early-error walk used by
scripts and eval. As a result, module source can admit unsupported constructs
and invalid forms such as `new.target`, RegExp `u`, ES5-invalid RegExp patterns,
and invalid strict parameter lists.

The governing module design requires `parseModule` to admit only ES2015 static
module syntax plus language forms already implemented by prior layers. Modules
are always strict. Ordinary parser output and descriptor-safe custom AST output
must therefore reach the same supported-language and early-error boundary.

## Considered Approaches

1. **Add an explicit module-aware mode to the shared validation walk
   (selected).** The walk accepts the four implemented static module declaration
   node types only when module mode is active, while retaining all existing
   capability checks, strict-context propagation, RegExp validation, binding
   checks, and custom-AST defenses. This keeps one authoritative validator and
   covers declaration wrappers, import/export bindings, and nested code.
2. **Validate only each module declaration's statement or expression payload.**
   This is a smaller patch, but it leaves import/export specifiers outside the
   shared walk and duplicates module-context decisions at every wrapper.
3. **Translate module nodes into a synthetic script before validation.** This
   risks semantic drift in binding classification and strictness, and conflicts
   with the requirement not to mutate or loosely strip retained ASTs.

## Design

`parseModule` will pass the exact source text and parser provenance into
`validateModuleProgram`. That function will first retain its existing
descriptor-safe program and module-shape validation, then run the established
capability/early-error traversal once over the complete module `Program`.

The traversal gains a narrow module-mode flag. In module mode:

- the root is strict regardless of directives;
- `ImportDeclaration`, `ExportNamedDeclaration`,
  `ExportDefaultDeclaration`, and `ExportAllDeclaration` are admitted as
  wrappers after the existing module shape validator accepts them;
- unsupported neighboring forms remain rejected;
- all ordinary statement/expression descendants receive the same capability,
  scalar-shape, RegExp, strict-binding, parameter, class, generator, and
  statement-position checks as scripts;
- custom ASTs retain all-own-key traversal and descriptor-safe ownership checks;
  source-dependent checks do not trust custom AST ranges as a representation of
  the caller's source string.

Existing module declaration collision/export-name checks remain authoritative
for ModuleItemList semantics. The old per-payload custom validation helpers are
removed once the complete module-aware walk supersedes them.

## Error Boundary

Rejected source continues to throw normalized host `SyntaxError` from
`parseModule`. Module-loader dependency parsing continues to wrap that error as
`ModuleLoaderError` with phase `parse`, identifier, and original cause. No
loader, linker, evaluator, namespace, or public API shape changes.

## Tests

Strict RED-first regressions will prove current acceptance and required
rejection for ordinary modules:

- `new.target`;
- RegExp `u`;
- duplicate strict parameters;
- an ES5-invalid RegExp pattern already rejected by `parseScript`;
- adjacent valid static module, strict-function, and ES5 RegExp cases.

Custom AST regressions will cover the same capability/early-error families,
including module binding positions, without weakening descriptor defenses.
Loader coverage will prove invalid dependency source fails in phase `parse`.

Validation includes targeted parser/module suites and focused pinned module
Test262 under `TZ=UTC`, then portable Node/Chromium/JSC, repository gates,
benchmark smoke, scoped specification and quality reviews, maximum-capability
whole-branch review, and exact pushed-head CI.

## Non-Goals

No dynamic import, `import.meta`, top-level await, async functions or generators,
RegExp `u`/`y`, Unicode code-point escapes, class fields/private names, object
rest/spread, evaluator expansion, loader redesign, release integration work from
#61, or neighboring issue #67 work.
