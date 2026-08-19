# Whole-milestone review fix report

## Disposition

- Status: **SECOND REVIEW FIX DONE; RE-REVIEW PENDING**
- Review base:
  `1a0f011f4e179bfcb83c99108a626b7f4806cc94`
- Fix commit:
  `193902bff5899d8a9752e0579ef4a43da4d85305`
- Scope: three Important and two Minor high-confidence findings from the first
  maximum-capability GPT-5.6-family whole-milestone review
- Constraints honored: strict RED-first; no amend, broad local Test262,
  `ci:contract`, push, pull request, or full CI

## Findings and fixes

### Polymorphic inherited `[[HasProperty]]`

Ordinary `EngineObject#hasProperty` used `getProperty`, so an ordinary object
whose prototype was a module namespace invoked the namespace's virtual export
descriptor and read a linked-but-uninitialized binding. The inherited `in`
operation therefore raised a TDZ `ReferenceError` instead of returning `true`.

The ordinary prototype walk now remains iterative across ordinary objects and
dispatches to an overridden exotic `hasProperty` at the boundary. This mirrors
the existing polymorphic `set` boundary without introducing one host frame per
ordinary prototype link.

RED: the linked namespace TDZ test failed with `GuestErrorSignal: Cannot access
'value' before initialization` when checking the inheritor.

GREEN: namespace and ordinary-object suites pass, including the inheritor
returning `true` before module evaluation.

### Candidate-produced Test262 CI artifacts

The broad Test262 job uploaded `docs/test262-report.jsonl` under `always()`.
Because the report is committed, a prerequisite failure before the broad run
could publish the checkout's stale green report.

The generated job now removes the committed report immediately after project
checkout, before the upstream checkout or any installation/selection step. The
artifact step runs under:

```text
always() && hashFiles('docs/test262-report.jsonl') != ''
```

A failing broad run still writes and publishes its diagnostic report. A
prerequisite failure leaves no report to publish.

RED: the workflow contract observed `if: always()` and no pre-prerequisite
scrub.

GREEN: the focused workflow contract and generated workflow drift check pass.

### Clean pinned Test262 checkout

`assertPinnedCheckout` verified only the detached `.git/HEAD`, allowing
modified, deleted, or untracked upstream files to influence conformance
results.

The guard now also runs:

```text
git status --porcelain=v1 --untracked-files=all
```

inside the pinned checkout and rejects any output. A real isolated temporary
Git repository proves the exact clean detached SHA passes while both a tracked
modification and an untracked JavaScript file fail.

RED: both dirty states were accepted.

GREEN: the new dirty-tree regression passes, as do the real focused pinned
Promise/generator/module suites against the clean pinned checkout.

### Cross-Agent inherited `@@iterator`

`getIterator` chose one physical `Symbol.iterator` key from the iterable's
Agent and used it for the entire prototype chain. A caller-owned object
inheriting its protocol method from a foreign-Agent prototype was incorrectly
reported as non-iterable.

Engine objects now use `EngineObject#getWellKnownSymbol('iterator')`, which
derives the physical key owned by each prototype while preserving semantic
well-known-symbol lookup.

RED: the inherited cross-Agent case raised `[object Object] is not iterable`.

GREEN: the inherited case yields the foreign iterator's value and retains its
owner Realm prototype; adjacent iterator and `for`-`of` suites pass.

### Portable Test262 module identifiers

The shared resolver accepted `%`, `?`, and `#`. Node and browser URL-based
hosts decode or interpret those characters while the JSC host reads them
literally, so one identifier could address different files across hosts.

The resolver now rejects URL-sensitive characters after retaining the more
specific encoded-separator and encoded-dot diagnostics. Focused coverage spans
literal and encoded percent signs, query delimiters, and fragment delimiters in
both specifiers and referrers.

RED: every URL-sensitive case was accepted.

GREEN: module-path and portable Test262 runner suites pass.

## Final verification

- Focused affected Node suites: all passed.
- Focused affected Chromium suites: all passed.
- Full portable JavaScriptCore registry: **2,097 passed**, 0 failed.
- Focused UTC Promise/generator/module Test262: **4 passed**, 0 failed.
- Portable Test262 fixtures: **17 passed**, 0 failed, 1 expected skip.
- Generated Test262 selection: **14,107 paths across 58 groups**, current.
- TypeScript JSDoc check, ESLint, Prettier, vendor drift, generated CI drift,
  Unicode drift, and `git diff --check`: passed.
- Clean-tree benchmark smoke: passed.

No broad upstream Test262 command was run locally. Broad pinned Test262 remains
authoritative in exact-head GitHub CI.

## Repeated-review parser fix

The scoped re-review of the five-finding wave returned no significant issues.
The repeated maximum-capability whole-milestone review closed all five prior
findings and found one new Important issue: Acorn reuses singleton empty arrays
for bare-import `specifiers` and parenthesis-less `new` expression `arguments`,
while the custom AST structural-tree guard rejected the second occurrence as a
DAG.

The parser now permits a repeated structural array only when its length is
zero. Shared nodes and non-empty structural arrays retain the existing
rejection, so the evaluator cannot expand a compact DAG.

RED:

- both `parseModule` custom entry points rejected an Acorn program containing
  two bare imports with `Custom AST must be a structural tree`;
- both `parseScript` custom entry points rejected an Acorn program containing
  two parenthesis-less `new` expressions with the same error.

GREEN:

- focused parser and module-parser Node suites passed;
- focused parser and module-parser Chromium suites passed;
- full portable JavaScriptCore registry: **2,099 passed**, 0 failed;
- focused UTC Promise/generator/module Test262: **4 passed**, 0 failed;
- portable Test262 fixtures: **17 passed**, 0 failed, 1 expected skip;
- type checking, lint, formatting, vendor/generated CI/Unicode drift,
  `git diff --check`, and clean-tree benchmark smoke passed.

The exact parser fix commit is
`dc4d814cfc3126f9e7b4f06b5093e13a9cce979f`. No broad upstream Test262
command was run locally.
