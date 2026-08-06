# Documentation Reorganization Design

## Goal

Turn README into a concise setup and usage landing page, move stable technical
material into focused reference documents, and verify that documentation matches
the repository's commands and observable behavior.

## Documentation Structure

`README.md` is the entry point for users and contributors. It contains:

- project purpose and current status
- installation and development setup
- embedding and evaluation examples
- common test and validation commands
- a short conformance headline
- links to focused technical references

Four authoritative current-reference documents live under `docs/`:

- `architecture.md` describes parser, realm, runtime, evaluator, built-in, and
  host-adapter boundaries.
- `testing.md` documents local suites, Node/JSC/browser adapters, Test262
  commands, generated artifacts, and CI.
- `conformance.md` owns the supported ES5 surface, Test262 selection policy,
  whole-suite coverage methodology, and generated coverage summary.
- `limitations.md` owns known limitations and intentional deviations.

Historical files under `docs/superpowers/specs/` and
`docs/superpowers/plans/` remain project records, not current reference
documentation.

## Content Migration

README retains practical setup and usage detail but links to technical references
instead of embedding implementation internals, selection algorithms, adapter
contracts, long support matrices, limitations, or deviation rationales.

The existing detailed Test262 JSONL report remains
`docs/test262-report.jsonl`. Its compact generated summary moves from README to
`docs/conformance.md`. The report generator and drift checks update that document
directly.

Technical claims are checked against the implementation:

- npm commands and descriptions match `package.json`
- API examples match exported interfaces
- architecture descriptions match module dependencies
- supported APIs match installed realm intrinsics and tests
- limitations and deviations match current behavior and selection exclusions
- coverage figures match generated Test262 artifacts

## Maintenance and Validation

Repository contract tests verify:

- all README and reference-document links resolve
- documented npm commands exist
- generated coverage markers occur only in `docs/conformance.md`
- coverage regeneration leaves tracked artifacts clean
- README does not regain large generated reports or authoritative limitation and
  deviation tables
- current-reference documents identify historical specs and plans accurately

Documentation formatting remains covered by the existing Prettier check.

## Acceptance Criteria

- README primarily covers development setup and end-user usage.
- Stable technical detail lives in the four focused documents.
- README is substantially shorter and links clearly to every reference.
- Generated Test262 coverage is current in `docs/conformance.md`.
- Commands, support claims, limitations, and deviations agree with code and
  tests.
- All repository contracts and formatting checks pass.
