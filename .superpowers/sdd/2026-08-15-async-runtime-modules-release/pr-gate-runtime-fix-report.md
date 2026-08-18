# PR-gate runtime fix report

## Disposition

- Status: **DONE**
- Required starting HEAD:
  `97b01b6f327729babbe567e3148d0eb019293bf6`
- Scope: the four PR-gate findings for generator receiver validation,
  generator-chain lifetime, cross-Agent Promise job routing, and Test262
  coverage documentation
- Constraints honored: strict RED-first; no amend, push, pull request, full CI,
  broad upstream Test262 run, or generated-artifact change

## Root causes

### Invalid generator receivers activated accounting before validation

The `generatorResume` metadata on the native `next`, `return`, and `throw`
functions made `NativeFunction#callFunction` create a generator-chain reference
before entering the native body. `requireGenerator` ran only inside that body.
A deep caller was therefore adopted into the chain under the foreign method
Realm's stricter limit before the receiver was checked, so a guest `RangeError`
could pre-empt the required foreign-Realm `TypeError`.

### Completed resumes retained adopted caller frames

`releaseGeneratorHostChain` required `depth`, `resumes`, and `references` all to
reach zero. When a resume returned to an ordinary caller, its resume and
reference counts were zero, but tokens adopted from still-active caller
`StackGuard`s kept `depth` positive. The chain pointer and old minimum
`maxDepth` therefore remained active and charged unrelated ordinary work until
the outermost call unwound.

### Promise jobs used a Realm and queue from different Agents

Promise reaction and thenable jobs correctly selected their execution Realm
from the handler or `then` callable, but all enqueue sites still used the
Promise's owning Agent. `AgentJobQueue` correctly rejects a non-null Realm owned
by another Agent, so cross-Agent registration or settlement escaped as a raw
host `TypeError` after work or Promise state had already been retained or
mutated.

### The README and its invariant described obsolete policy

The release policy already places `generators` in the global feature manifest
and admits exactly 11 reviewed generator roots to broad selection. README prose
still denied both facts, and the repository invariant enforced that denial.
Promise and module roots, unlike the approved generator roots, remain focused.

## Strict RED evidence

Regressions and the corrected documentation invariant were added before
production or README changes. The combined focused run reported **136 passed,
6 failed**:

```text
deep cross-Realm invalid generator receivers validate before chain activation
  Expected "throw" to be the same value as "normal"
deep cross-Agent invalid generator receivers validate before chain activation
  Expected "throw" to be the same value as "normal"
generator chains detach and re-adopt inside one outer caller
  stale root: resumes=0, references=0, depth=41, maxDepth=400
cross-Agent reactions run on the handler Agent and settle source-Agent children
  TypeError: Agent job realm must be owned by this Agent or null
cross-Agent thenable jobs run on the then Agent without losing settlement
  TypeError: Agent job realm must be owned by this Agent or null
published Agent Jobs, Promise, generator, and static-module documentation
preserves layer boundaries
  README must describe the exact generator broad-selection boundary
```

The tuned foreign-limit lifecycle reproduction then reported:

```text
Expected "yielded|false|RangeError|complete|true|RangeError"
to be "yielded|false|done|complete|true|done"
```

At both post-resume inspection points, the stale different-Agent root had
`resumes=0`, `references=0`, `depth=41`, and `maxDepth=130`. This proves the
ordinary recursion failure came from retained adopted depth and the old foreign
limit rather than either Realm's ordinary budget.

## Implementation

- Removed generic native-function generator-resume metadata.
- Each generator intrinsic now validates with `requireGenerator` first, then
  creates a short-lived reference, links the confirmed generator owner, resumes,
  and releases the reference in `finally`.
- The reference begins inside the already-guarded native method body. The
  synchronous participant chain therefore still seeds active caller, wrapper,
  method, and receiver-owner Agents, including their strictest limit.
- Added `StackGuard#detachGeneratorHostChain` to remove matching adopted tokens
  without changing ordinary Realm depth.
- When the final resume/reference ends, the Agent detaches tokens from every
  still-active participant guard and clears generator-chain pointers once any
  non-guard frames are gone. Later resumes can re-adopt the same outer frames
  through the still-active synchronous participant chain.
- Promise enqueue sites now use the selected non-null Job Realm's owning Agent;
  null-Realm jobs retain the Promise Agent fallback.
- Updated README and its invariant to state that the global manifest includes
  `generators`, exactly 11 approved generator roots enter broad selection, and
  Promise/module roots remain focused-only.

## Coverage and lifecycle audit

- Deep borrowed `next`, `return`, and `throw` invalid-receiver calls cover
  cross-Realm shared-Agent and different-Agent paths under a strict foreign
  limit. They assert the foreign guest `TypeError`, zero reference activations,
  and complete transient cleanup.
- Lifecycle coverage spans same Realm, separate Realms sharing an Agent, and
  different Agents; yield, normal completion, and abrupt completion; ordinary
  recursion after both suspension and termination; and two resumes within the
  same outer call. The two active roots are distinct, proving re-adoption.
- Cross-Agent Promise coverage exercises already-settled registration, pending
  settlement, rejected registration, handler allocation and guest error Realm,
  source-Agent derived settlement, automatic scheduler selection, rejection
  tracking, host-defect containment, and durable failure ownership.
- Cross-Agent thenable coverage exercises fulfillment, guest rejection, and a
  durable host failure on the selected `then` Agent. Existing null-Realm and
  same-Agent tests remain green.
- No Test262 manifest, selection policy, subset, report, vendor, or other
  generated artifact changed.

## GREEN verification

- Focused generator/stack/function Node scope: **175 passed**, 0 failed.
- Focused jobs/Promise/async Node scope: **65 passed**, 0 failed.
- Expanded runtime Node scope: **424 passed**, 0 failed.
- Expanded runtime Chromium scope: **424 passed**, 0 failed.
- Focused Promise and generator Test262 release suites: **2 passed**, 0 failed.
- Full Node registry: **2183 passed**, 0 failed.
- Full Chromium portable registry: **2040 passed**, 0 failed.
- Full JavaScriptCore portable registry: **2040 passed**, 0 failed.
- Repository invariants: **35 passed**, 0 failed.
- TypeScript JSDoc check: passed.
- ESLint: passed.
- Prettier check: passed.
- `git diff --check`: passed.

## Concerns

No correctness blocker remains known. The macOS JavaScriptCore executable is not
on the default `PATH`, so Node-only launcher-contract tests reported their
documented skip; the complete portable registry passed by invoking the system
executable directly. Full CI, broad upstream Test262, artifact regeneration,
push, and PR operations were intentionally not run.
