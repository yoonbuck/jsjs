# Test262 Coverage Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move verbose Test262 output out of README and report whole-suite attempt/pass percentages.

**Architecture:** Inventory the pinned Test262 tree, expand metadata into record counts without executing unselected tests, write deterministic report artifacts, and keep README limited to a compact generated summary.

**Tech Stack:** Plain ES2020 JavaScript, strict JSDoc, existing Test262 runner and CI contract.

## Global Constraints

- Use the entire pinned Test262 tree as coverage denominator.
- Report both source-file and expanded-record coverage.
- Keep detailed JSONL deterministic and outside README.
- Preserve portable runner output equivalence.

---

### Task 1: Whole-suite inventory and coverage model

Add failing fixture tests for total files, expanded records, malformed metadata,
selected/attempted/passed counts, and percentages. Implement a reusable inventory
and coverage summary module.

### Task 2: Report artifact and README compaction

Move the detailed generated report to `docs/test262-report.jsonl`; replace the
README report block with a compact generated table linking to the detailed file.
Update synchronization and drift tests.

### Task 3: CI integration and verification

Print the compact summary in CI, upload the detailed report, verify artifacts are
current, run all CI contracts, and document exact denominator semantics.
