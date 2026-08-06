# ES5 Primitive Built-ins Design

## Goal

Complete the public `String`, `Number`, and `Boolean` constructor/prototype
families, replacing internal-only primitive wrappers with fully specified,
realm-owned boxed primitives.

## Architecture

The existing `EnginePrimitiveObject` remains the shared representation for boxed
primitive values. Each realm installs dedicated constructors and prototypes with
the correct `[[Class]]`, immutable primitive payload, prototype graph, property
attributes, and call-versus-construct behavior. Methods validate compatible
receivers and use engine conversions rather than host prototypes.

String indexing remains lazy. String methods operate on code units and generic
receivers where ES5 requires it. Number formatting uses explicit validation and
portable algorithms; host numeric operations may be used only where their
observable ES5 semantics are proven equivalent. Boolean methods accept booleans
and Boolean wrappers only.

## Scope

- `String` call/construct behavior, `fromCharCode`, prototype identity, `length`,
  and all ES5 String prototype methods
- `Number` call/construct behavior, constants, `toString`, `toLocaleString`,
  `valueOf`, `toFixed`, `toExponential`, and `toPrecision`
- `Boolean` call/construct behavior, `toString`, and `valueOf`
- realm isolation, descriptors, compatible-receiver errors, and primitive
  autoboxing integration
- pinned Test262 expansion for all implemented APIs

`RegExp` integration for String pattern methods is deferred; this milestone
implements string-search methods for string patterns and explicitly rejects
guest RegExp objects until the RegExp milestone.

## Testing and Parallelization

Shared primitive-wrapper invariants land first. String, Number, and Boolean
families then proceed in parallel worktrees against that interface. Tests cover
coercion order, signed zero, NaN/infinities, numeric formatting boundaries,
surrogate code units, empty strings, omitted versus undefined arguments,
receiver errors, descriptors, and isolated realms.

The milestone is complete when all CI contracts pass, every newly pinned
Test262 record passes without skips, and portable reports remain equivalent.
