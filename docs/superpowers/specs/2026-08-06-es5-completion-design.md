# ES5 Completion and Conformance Design

## Goal

Close the remaining ES5 language, global, error, and Annex B gaps after Date,
then run a broad ES5 Test262 campaign to expose and fix conformance defects.

## Scope

- `eval` direct/indirect semantics and global/function declaration interaction
- dynamic `Function` construction through the engine parser, without host eval
- `EvalError`, URIError integration, and remaining Error prototype behavior
- ES5 global properties and descriptor attributes
- Annex B language/global behavior still required by the pinned ES5 suite
- broad automated Test262 ES5 selection, failure classification, and regression
  fixes

## Architecture

Dynamic source enters the existing parser/evaluator with explicit execution
contexts. Direct eval receives the caller's lexical/variable environment and
strictness; indirect eval uses the realm global environment. Function
construction parses generated parameter/body source through the engine.

The Test262 campaign is manifest-driven and records every attempted ES5 file,
classified unsupported modern tests, and stable failure clusters. Each real
failure becomes a local regression before a fix.

## Acceptance Criteria

All known ES5-capable Test262 files are attempted, unexpected failures are zero,
coverage artifacts are current, and Node/JSC/browser contracts pass.
