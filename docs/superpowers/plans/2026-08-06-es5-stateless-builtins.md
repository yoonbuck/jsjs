# ES5 Stateless Built-ins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement ES5 Math, JSON, numeric globals, URI functions, and Annex B escape functions.

**Architecture:** Build independent realm-owned Math/JSON/global modules using engine coercion and explicit parsing/encoding algorithms.

**Tech Stack:** Plain ES2020 JavaScript, strict JSDoc, portable harness, pinned Test262.

### Task 1: Math

Implement all constants and functions with signed-zero/NaN/infinity and coercion
tests.

### Task 2: Numeric globals

Implement `parseInt`, `parseFloat`, `isNaN`, and `isFinite` with ES5 lexical and
coercion behavior.

### Task 3: URI and Annex B globals

Implement four URI functions plus `escape`/`unescape`, including malformed
surrogate and percent-sequence errors.

### Task 4: JSON parser

Implement JSON grammar and reviver traversal without host JSON delegation.

### Task 5: JSON serializer

Implement `stringify`, replacer arrays/functions, `toJSON`, indentation, cycles,
property ordering, and abrupt completions.

### Task 6: Test262 and integration

Install realm intrinsics, pin upstream groups, update compact docs and coverage
artifacts, run portable CI contracts, review, and publish.
