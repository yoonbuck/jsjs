# ES5 Primitive Built-ins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement complete ES5 String, Number, and Boolean built-in families.

**Architecture:** Stabilize shared primitive-wrapper receiver/value helpers, then implement each family independently in parallel. Integrate through realm-owned intrinsic installation and pinned Test262 groups.

**Tech Stack:** Plain ES2020 JavaScript, strict JSDoc typing, portable harness, pinned Test262.

## Global Constraints

- Use strict TDD for every behavior.
- Do not delegate guest semantics to host prototypes.
- Preserve ES5 coercion order, descriptors, code-unit behavior, and errors.
- Keep Node, JavaScriptCore, and browser reports equivalent.

---

### Task 1: Primitive wrapper integration

Add shared helpers for extracting primitive payloads from compatible primitive
or wrapper receivers, finalize constructor/prototype wiring, and test realm
isolation, class tags, descriptors, and autoboxing.

### Task 2: Boolean family

Implement Boolean call/construct behavior and prototype `toString`/`valueOf`.
Cover truthiness conversion, receiver validation, descriptors, and realm identity.

### Task 3: Number constructor, constants, and basic methods

Implement Number call/construct behavior, ES5 constants, `toString`,
`toLocaleString`, and `valueOf`, including radix validation, signed zero, NaN,
and infinities.

### Task 4: Number formatting methods

Implement `toFixed`, `toExponential`, and `toPrecision` with ES5 range checks,
rounding, exponent formatting, omitted arguments, and edge-case tests.

### Task 5: String constructor and fundamental methods

Implement String call/construct behavior, `fromCharCode`, `toString`, `valueOf`,
`charAt`, `charCodeAt`, `concat`, `slice`, `substring`, and `substr`.

### Task 6: String search and transformation methods

Implement `indexOf`, `lastIndexOf`, `localeCompare`, `toLowerCase`,
`toLocaleLowerCase`, `toUpperCase`, `toLocaleUpperCase`, and `trim`; implement
string-pattern `match`, `replace`, `search`, and `split` while explicitly
rejecting RegExp objects.

### Task 7: Test262 expansion and integration

Install all intrinsic families, pin representative upstream groups, update
README support tables, integrate parallel workstreams, and run all portable CI
contracts with zero unexpected failures or skips.
