# Cross-Agent generator chain boundary report

## Disposition

- Status: **DONE**
- Required starting HEAD:
  `406ca49485aa7fd055a1ab13ce22a63054941728`
- Scope: the two scoped cross-Agent generator-chain review blockers only
- Constraints honored: no amend, push, pull request, full CI, broad upstream
  Test262, reset, rebase, or unrelated change

## Root causes

### Suspended computed targets

Generator frames retained ordinary member bases, computed property values,
prepared destructuring targets, and `super` bases across a suspension. A new
`.next()` creates a new transient generator host chain, but the retained values
were consumed without first relinking their owning Agents. Deferred
`ToPropertyKey` could therefore call a foreign `Symbol.toPrimitive` on a
separate chain, and deferred `PutValue` could enter a foreign ordinary or
`super` base before that base joined the resumed chain.

### Ordinary calls before activation

The generator union counted frames entered after its first resume began.
Several Agents could already have hundreds of ordinary guarded frames active,
each below its own per-Realm limit, before the final call activated a recursive
`yield*` generator. Those pre-existing frames were invisible to the new union,
so the host could exhaust its stack before the union reached its budget.

## Strict RED evidence

The regressions were added before production changes and run with:

```text
node test/run-node.js test/stack-overflow.test.js
```

They failed for the intended reasons:

```text
deep ordinary cross-Agent calls seed the generator host chain
  RangeError: Maximum call stack size exceeded
cached computed assignment targets rejoin before PutValue
  Error: put did not rejoin the cached target chain
suspended computed keys rejoin their cached assignment bases
  Error: key did not rejoin the cached target chain
cached computed destructuring targets rejoin before ToPropertyKey
  Error: key did not rejoin the cached target chain
```

The first error was the raw host `RangeError` escaping the guest `try`/`catch`.
The other three were focused host-chain identity assertions, not parse or setup
errors.

## Implementation

- Ordinary and `super` member-reference construction now relinks cached bases,
  receivers, and property values immediately before property-key conversion.
- `PutValue` relinks ordinary property bases; `SuperReferenceBase` relinks its
  cached super base and receiver before delegating the write.
- The generator member, assignment-reference, and prepared-pattern target paths
  now converge on those relinking points. Array/object patterns, defaults, and
  rest elements all consume the same prepared-target application path.
- Each Agent now records a transient synchronous cross-Agent call union. It has
  no stack budget and cannot affect ordinary non-generator calls; it exists only
  to identify participating Agents if a generator chain starts before the calls
  unwind.
- Each Agent transiently registers only StackGuards with positive depth. When a
  generator chain starts or gains a participant, every uncharged active frame is
  adopted into the generator root with the strictest active Realm budget.
- Adopted frames receive the same per-frame chain tokens as later entries.
  Existing `StackGuard.exit()` processing therefore decrements each exactly once,
  including after union merges or an over-budget seed throws.
- Synchronous-call, StackGuard, and generator-frame underflow checks fail as host
  defects rather than silently making counters negative.

## Target-path and cleanup audit

| Retained path | Deferred operation | Relinking point |
| --- | --- | --- |
| ordinary/super `MemberFrame` base and key | `ToPropertyKey` | `finishMemberReference` |
| ordinary/super assignment `Reference` across RHS suspension | `PutValue` | `putValue` / `SuperReferenceBase` |
| ordinary/super `PatternTargetFrame` raw target | `ToPropertyKey`, then `PutValue` | ordinary/super member-reference constructors |
| nested object/array/default/rest patterns | prepared target application | shared `applyPreparedAssignmentTarget` path |

The regressions exercise ordinary and `super[...]` forms across two `.next()`
calls for cached RHS assignments, suspended computed keys, and destructuring
defaults. Foreign key/base callbacks assert a shared union root and the strictest
active budget. The eventual recursive write produces Realm B's guest
`RangeError`. After every normal and abrupt path, all Realm depths, adopted
depths, generator pointers, synchronous-call pointers, and active-guard sets are
zero/empty, and fresh finite generator resumes succeed.

The four-Agent default-budget regression first proves a finite ordinary ring is
unchanged. It then enters a 375-call ordinary ring before activating recursive
`yield*`; the guest catches a Realm `RangeError`, every transient field clears,
and each Agent subsequently completes a finite two-resume generator.

Union-find merges retain original frame/reference/resume tokens, sum child
depths once, and clear child counters. Adopted-depth calculation is
`StackGuard.depth - generatorHostChainDepth`, so repeated joins cannot double
charge a frame. Roots are released only when depth, resumes, and references are
all zero.

## GREEN verification

- Focused stack-overflow suite: **77 passed**, 0 failed.
- Expanded Node generator/stack/function/call/class/destructuring/with/iterator
  suites: **412 passed**, 0 failed.
- Full Node run: **2170 passed**, 0 failed.
- Full Chromium portable registry: **2027 passed**, 0 failed.
- Full JavaScriptCore portable registry: **2027 passed**, 0 failed.
- TypeScript JSDoc check: passed.
- ESLint: passed.
- Prettier check: passed.
- Repository invariants: **35 passed**, 0 failed.
- `git diff --check`: passed.

## Concerns

No correctness blocker remains known. The synchronous Agent union deliberately
retains Agent and active-StackGuard references only until the outermost
cross-Agent call exits; cleanup assertions cover ordinary return, guest
overflow, generator completion, and subsequent reuse. JavaScriptCore has no
targeted-suite selector, so its complete portable registry was used as the
stronger check.

The implementation and this report are committed together; the resulting commit
SHA is returned in the task result.
