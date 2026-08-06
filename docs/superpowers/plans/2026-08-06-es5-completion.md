# ES5 Completion and Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete remaining ES5 semantics and drive broad Test262 ES5 conformance.

### Task 1: Eval execution contexts

Implement direct and indirect eval, strictness, environment selection,
declaration instantiation, completion values, and errors test-first.

### Task 2: Dynamic Function constructor

Replace the unsupported stub with engine parsing/evaluation, parameter grammar,
global scope, strict body handling, and constructor descriptors.

### Task 3: Remaining globals/errors/Annex B

Implement remaining ES5/Annex B globals, error family behavior, and descriptor
details revealed by the upstream suite.

### Task 4: Broad ES5 Test262 campaign

Generate a candidate ES5 manifest from metadata/syntax, run it, classify modern
or host-dependent exclusions, and add local regressions for every real failure
cluster.

### Task 5: Conformance fixes and release report

Fix all unexpected failures, update coverage/support documentation, run portable
CI and JSC, review, and publish.
