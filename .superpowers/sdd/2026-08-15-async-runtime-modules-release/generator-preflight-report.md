# Generator method preflight fix report

## Disposition

- Status: **DONE**
- Required starting HEAD:
  `242f387e568549f1cf805da92f819d6ee6edb8f1`
- Scope: the Critical scoped-review finding for invalid borrowed generator
  `next`, `return`, and `throw` calls during an active generator host chain
- Constraints honored: strict RED-first; no amend, push, pull request, full CI,
  broad Test262 run, or generated-artifact change

## Root cause

`NativeFunction#callFunction` entered the cross-Agent synchronous call chain,
linked the caller and method Agents, linked object arguments, and entered the
method Realm's `StackGuard` before invoking the generator native body.
`requireGenerator` therefore ran too late.

With an active generator chain and a method Realm whose `maxStackDepth` was
tighter than the already-active chain, the method guard raised a
`GuestErrorSignal('RangeError')` before `requireGenerator`. That signal bypassed
the generator body's guest `try`/`catch`, completed the outer resume abruptly,
and materialized as the caller Realm's `RangeError`. The required result was a
catchable `TypeError` from the borrowed method's Realm.

## Strict RED evidence

The active-chain matrix and valid controls were added before production code.

```text
node test/run-node.js test/stack-overflow.test.js
```

Result: **92 passed, 12 failed**. Every failing case reported that completion
was `"throw"` rather than the expected guest-caught `"normal"` completion:

- shared-Agent and cross-Agent topologies;
- `next`, `return`, and `throw`;
- ordinary object and primitive invalid receivers.

All six valid-receiver controls passed during RED. They each entered the method
guard and added exactly one generator-chain reference and one resume.

## Implementation

- Added the closed internal NativeFunction option
  `callPreflight: 'generatorReceiver'`; it cannot run arbitrary callbacks.
- `NativeFunction#callFunction` executes that receiver check before synchronous
  Agent linking, value linking, or method-Realm stack entry.
- The check is only `thisValue instanceof GeneratorObject`, so neither primitive
  nor object rejection can invoke guest code.
- `runNativeBody` materializes a failing `GuestErrorSignal` in the native
  method's Realm and emits the normal public `ThrowSignal` without guarded
  execution.
- Only generator `next`, `return`, and `throw` opt in. Their native bodies keep
  the existing harmless `requireGenerator` check. Constructors, parser paths,
  and every other native function retain their existing behavior.

## Coverage

The 12 invalid-receiver cases run from inside an active outer generator with a
foreign method Realm limit of one. A caller-Realm `Function.prototype.call`
trampoline prevents the foreign `call` wrapper from obscuring the method under
test. Each case proves:

- the guest catch runs;
- the exact error is a method-Realm `TypeError` with the method-specific message;
- the invalid call adds zero generator references and zero resumes;
- the invalid call never enters the method Realm guard;
- no host exception escapes and all Realm/Agent accounting clears.

The six valid controls cover the same shared-/cross-Agent method matrix. Each
valid call still adds one reference, one resume, and one method guard entry,
returns the specified `next`/`return`/`throw` result, and clears all transient
accounting.

## GREEN verification

- Focused stack suite: **104 passed**, 0 failed.
- Focused generator/stack/function Node scope: **355 passed**, 0 failed.
- Focused generator/stack/function Chromium scope: **355 passed**, 0 failed.
- Full Node registry: **2199 passed**, 0 failed.
- Full Chromium portable registry: **2056 passed**, 0 failed.
- Full JavaScriptCore portable registry: **2056 passed**, 0 failed.
- Repository invariants: **35 passed**, 0 failed.
- TypeScript JSDoc check: passed.
- ESLint: passed.
- Prettier check: passed.
- `git diff --check`: passed.

The Node-only JSC launcher-contract probes recorded their documented skip
because `jsc` is not on the default `PATH`; the complete portable JSC registry
passed through the system JavaScriptCore executable directly.

## Concerns

No known correctness blocker remains. Full CI, push, and pull-request operations
were intentionally not run.
