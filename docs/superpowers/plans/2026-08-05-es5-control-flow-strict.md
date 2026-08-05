# ES5 Control Flow and Strict Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ES5 exceptions, remaining control flow/operators, guest errors, and complete runtime strict semantics.

**Architecture:** Extend the existing completion-based evaluator and reference model without host control-flow shortcuts. Derive strictness from directive prologues and carry it through execution contexts, functions, references, and calls.

**Tech Stack:** Plain ES2020 JavaScript, strict JSDoc typing, Acorn ES5 parsing, existing portable harness, pinned Test262.

## Global Constraints

- Follow strict red-green-refactor for every behavior.
- Do not use host `eval`, `Function`, prototypes, or exceptions to implement guest semantics.
- Preserve equivalent reports across Node, JavaScriptCore, and browser adapters.
- Unsupported behavior must fail explicitly.

---

### Task 1: Guest error objects and throw normalization

Add engine-owned ES5 error constructors/prototypes and convert reachable runtime
failures into guest throw completions. Cover constructor calls, names, messages,
prototype identity, and negative Test262 type matching.

### Task 2: Try, catch, and finally

Implement catch environments and ES5 completion precedence for every combination
of normal, return, throw, break, and continue completions. Add nested-finally and
catch-shadowing tests.

### Task 3: Switch and labelled control flow

Implement switch clause selection/fallthrough and label-set propagation for
labelled statements, break, and continue. Cover nested loops, switch-in-loop,
invalid continue targets, and abrupt completion values.

### Task 4: Update and compound assignment

Implement prefix/postfix update and every ES5 compound assignment through
references. Prove base/key/value side effects occur once and in specification
order.

### Task 5: In and instanceof

Add engine `HasProperty` and function `HasInstance` operations, then evaluator
support for `in` and `instanceof`. Cover prototype chains, primitive RHS errors,
boundaries around callable/non-callable objects, and custom prototype values.

### Task 6: Runtime strict mode

Detect script/function directive prologues and propagate strictness. Implement
strict assignment, delete restrictions, `this` binding, arguments mapping,
duplicate parameter/restricted-name behavior, and strict function caller/
arguments restrictions.

### Task 7: Portable Test262 expansion

Pin representative upstream groups for all new features, update the supported
feature manifest and README, remove stale getter/setter limitations, and verify
byte-equivalent Node/JSC/browser reports with zero unexpected failures.

