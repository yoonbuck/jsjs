# ES5 Core Built-ins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement near-complete ES5 Object, Function, and Array built-in families.

**Architecture:** Land shared native-function and descriptor helpers first, then implement Object, Function, and Array as independently reviewable branches rebased onto that foundation. All guest behavior uses engine operations and realm-owned intrinsics.

**Tech Stack:** Plain ES2020 JavaScript, strict JSDoc typing, existing portable harness, pinned Test262.

## Global Constraints

- Use strict red-green-refactor for every behavior.
- Do not use host prototypes, evaluation, or built-ins to implement guest semantics.
- Preserve guest side effects, abrupt completion ordering, descriptors, and sparse-array holes.
- Keep Node, JavaScriptCore, and browser reports equivalent.

---

### Task 1: Shared native built-in infrastructure

Create a native-function factory, descriptor conversion helpers, list creation,
and reusable receiver/callability guards. Refactor existing error constructors
onto the factory without behavior changes. Cover realm identity, names, lengths,
call/construct distinction, and guest-error propagation.

### Task 2: Object constructor and prototype

Implement Object construction/coercion plus `constructor`, `toString`,
`toLocaleString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`, and
`propertyIsEnumerable`. Cover nullish construction, primitives, custom prototype
chains, accessors, and incompatible receivers.

### Task 3: Object reflection and integrity APIs

Implement descriptor queries/definitions, `getPrototypeOf`, `create`,
`getOwnPropertyNames`, `keys`, `preventExtensions`, `isExtensible`, `seal`,
`isSealed`, `freeze`, and `isFrozen`. Test partial failure ordering and all
descriptor invariants.

### Task 4: Function family and bound functions

Implement `Function.prototype`, `toString`, `apply`, `call`, and `bind`, plus
bound-function internal slots, construction, `instanceof`, and length semantics.
The dynamic Function constructor must throw the explicit unsupported guest error.

### Task 5: Array constructor and identity

Implement Array call/construct overloads, `Array.isArray`, prototype wiring,
length validation, sparse creation, and multiple-argument initialization.

### Task 6: Mutating Array algorithms

Implement `push`, `pop`, `shift`, `unshift`, `reverse`, `sort`, and `splice`.
Cover sparse/inherited indices, non-writable lengths/properties, callback throws,
stable observable ordering where ES5 specifies it, and partial mutation.

### Task 7: Non-mutating and iterative Array algorithms

Implement `concat`, `join`, `slice`, `indexOf`, `lastIndexOf`, `every`, `some`,
`forEach`, `map`, `filter`, `reduce`, and `reduceRight`. Prove generic receiver
behavior, hole handling, callback argument order, and abrupt completion.

### Task 8: Test262 expansion and integration

Pin representative upstream groups for each implemented API, update intrinsic
creation and README support tables, rebase parallel family branches onto the
shared foundation, and run all portable CI contracts with zero unexpected
failures.
