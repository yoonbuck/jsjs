# ES5 Core Built-ins Design

## Goal

Implement the ES5 `Object`, `Function`, and `Array` constructor/prototype families
to near-complete conformance before broadening into boxed primitives. These
built-ins unlock reflection, generic invocation, array algorithms, and a large
Test262 surface while exercising the engine's descriptor and call machinery.

## Architecture

Each realm constructs a fresh intrinsic graph. Built-in functions use a shared
native-function factory that records `name`, `length`, realm, call behavior, and
optional construct behavior without consulting host prototypes. All coercion,
property access, descriptor conversion, enumeration, invocation, and errors route
through engine abstract operations.

`Object` methods operate on engine property descriptors and preserve ES5 property
ordering. `Function.prototype.call`, `apply`, and `bind` use engine call/
construction paths; bound functions receive explicit target, bound-this, and
bound-arguments slots. Array methods are generic over array-like engine objects
unless ES5 requires a true array, and preserve holes, mutation ordering, and
abrupt completions.

## Scope

- `Object`, `Object.prototype`, construction/coercion, and prototype methods
- `Object.getPrototypeOf`, descriptor APIs, object creation, property names,
  keys, extensibility, sealing, and freezing
- `Function`, `Function.prototype`, `call`, `apply`, and `bind`
- bound-function call, construction, `instanceof`, length, and prototype rules
- `Array`, `Array.prototype`, `isArray`, and ES5 array prototype algorithms
- shared native built-in creation helpers and reusable list/descriptor operations
- pinned Test262 groups for the implemented built-ins

The dynamic `Function` constructor is installed but explicitly throws an
unsupported-operation guest error because engine policy forbids host code
generation. `String`, `Number`, and `Boolean` constructors are deferred to the
next milestone.

## Errors and Edge Cases

Guest TypeErrors are produced for incompatible receivers, invalid descriptors,
non-callable callbacks, illegal array lengths, and forbidden mutations. Methods
must preserve partial mutations and callback side effects when an abrupt
completion occurs. Sparse arrays, inherited indexed properties, accessor
descriptors, non-extensible objects, and bound constructors receive focused tests.

## Testing and Parallelization

Work starts with the shared native-function and descriptor infrastructure. Once
those interfaces land, `Object`, `Function`, and `Array` families can proceed in
parallel isolated worktrees. Each family uses strict TDD and a pinned Test262
selection. Integration then rebases the branches onto the shared foundation,
resolves only interface-level conflicts, and runs byte-equivalent Node,
JavaScriptCore, and browser reports.

The milestone is complete when all repository CI contracts pass, all newly pinned
Test262 cases have zero unexpected failures, and a fresh realm owns an isolated,
internally consistent intrinsic graph.
