# Cross-Agent chain quality-fix report

## Disposition

- Status: **DONE**
- Required starting HEAD:
  `c3416edffe99d8c4db542a0e5ee0057e56c61c9e`
- Scope: the generator-chain activation blocker and the two suspended-reference
  relinking findings
- Constraints honored: strict RED-first; no amend, push, pull request, full CI,
  reset, rebase, or unrelated change

## Root causes

### Ordinary `call` and `apply` activated generator accounting

`Function.prototype.call` and `Function.prototype.apply` were marked
`generatorResumeTargetFromThis`. `NativeFunction#callFunction` interpreted that
wrapper metadata as a generator resume before the wrapper had validated or
called its target. It created a generator host-chain reference immediately, and
`Agent#ensureGeneratorHostChain` adopted every active guarded frame in the
transient synchronous participant chain.

Consequently, an ordinary foreign recursive function still used independent
per-Realm budgets when called directly or through a normal bound function, but
the same function called through `call` or `apply` was charged to a combined
generator budget. With caller and function Realms configured at 40 and 300
frames, respectively, ten levels of otherwise finite recursion incorrectly
raised the caller Realm's guest `RangeError`.

### Suspended object-environment writes omitted the binding object

`ObjectEnvironmentRecord#getBindingValue` relinked its foreign `bindingObject`
before lookup, but `setMutableBinding` delegated directly to
`bindingObject.put`. After a generator suspended inside `with`, its next resume
therefore reached a foreign setter with the executing and setter Agents linked
but the binding object's Agent absent.

### Cached super reads omitted lookup participants

`SuperReferenceBase#setReferencedValue` relinked both its cached `superBase` and
receiver before writing. `getReferencedValue` was asymmetric: it performed
descriptor lookup first and never relinked either cached value. A
`SuperReferenceBase` retained across generator suspension could therefore enter
a foreign base lookup and getter chain without the base and receiver Agents.

## Strict RED evidence

The regressions were added before production changes and run with:

```text
node test/run-node.js test/stack-overflow.test.js
```

The 85-test suite reported 81 passed and these four intended failures:

```text
call-wrapped ordinary cross-Agent recursion stays outside generator budgets
  Expected "RangeError" to be the same value as "done"
apply-wrapped ordinary cross-Agent recursion stays outside generator budgets
  Expected "RangeError" to be the same value as "done"
suspended with identifier writes rejoin the foreign setter chain
  Expected false to be the same value as true
cached runtime super reads relink targets after generator suspension
  Expected false to be the same value as true
```

The direct and bound ordinary controls already returned `"done"`. The new
generator recursion controls through both `call` and `apply` already produced a
guest `RangeError` and cleaned every transient field, proving that the failing
ordinary cases were wrapper activation defects rather than a missing generator
containment path.

## Implementation

- Removed `generatorResumeTargetFromThis` from native-function options and from
  `Function.prototype.call`/`apply`.
- Removed generator-resume propagation from `BoundFunction`. A bound or nested
  wrapper now remains an ordinary call until its actual target executes.
- Retained `_generatorResume` only on the confirmed generator `next`, `return`,
  and `throw` methods. Their target path creates the host-chain reference and
  links the generator receiver immediately before `GeneratorObject#resume`.
- Kept the unbudgeted synchronous Agent participant chain around every wrapper
  call. Thus, when the confirmed resume target starts a generator host chain,
  it still seeds all currently active caller and wrapper frames, including deep
  ordinary chains and the strictest active Realm limit.
- Relinked `ObjectEnvironmentRecord.bindingObject` before
  `setMutableBinding` delegates to `put`.
- Relinked `SuperReferenceBase.superBase` and its receiver before descriptor
  lookup, matching the existing write path.

## Boundary and cleanup audit

Ordinary direct, `call`, `apply`, and bound invocations no longer create
generator references or adopt guarded frames. They retain only Agent identities
and a synchronous call count. Both recursive generator wrapper tests prove that
the eventual confirmed resume target can recover those participants, contain
the recursion with a guest `RangeError`, and preserve the strictest active
limit.

The pre-existing deep ordinary ring still seeds its active frames when the
actual generator starts. Cached ordinary and super assignment targets,
computed keys, destructuring targets, resume values, iterator paths, and merged
chains remain covered and green.

The new `with` setter regression checks a shared root across the executing,
binding-object, and setter Agents after suspension. The cached super regression
checks the base and receiver before lookup, then all four Agents in the getter.
Both assert zero Realm depth, adopted depth, generator pointer, synchronous-call
pointer, and active-guard registrations after each suspension and completion.

## GREEN verification

- Focused stack-overflow suite: **85 passed**, 0 failed.
- Expanded Node stack/generator/function/with/super suites: **452 passed**, 0
  failed.
- Expanded Chromium stack/generator/function/with/super suites: **452 passed**,
  0 failed.
- Expanded JavaScriptCore scope: covered by the full portable run below because
  the JSC runner has no per-suite selector.
- Full Node registry: **2178 passed**, 0 failed.
- Full Chromium portable registry: **2035 passed**, 0 failed.
- Full JavaScriptCore portable registry: **2035 passed**, 0 failed (macOS
  system `jsc` executable).
- TypeScript JSDoc check: passed.
- ESLint: passed.
- Prettier check: passed.
- Repository invariants: **35 passed**, 0 failed.
- `git diff --check`: passed.

## Concerns

No correctness blocker remains known. The local `jsc` executable is installed
at the documented macOS framework path rather than on the default `PATH`; the
portable registry passed when invoked there. Full CI was intentionally not run.
