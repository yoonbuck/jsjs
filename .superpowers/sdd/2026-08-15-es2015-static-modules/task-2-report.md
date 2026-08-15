# Task 2 Report — DONE

## Controller ruling

Same-identifier reentrant-load rejection is defined only over the synchronous
invocation extent of `host.load(identifier)`. Once `load` returns a
Promise/thenable, later same-identifier requests are ordinary concurrent
requests and await the in-flight work. This preserves portable
concurrent-root deduplication without host-specific async provenance.

## Portability amendment

Typed same-loader/same-canonical-id reentrant rejection is guaranteed only
during the synchronous dynamic extent of `load(identifier)` invocation. Once
`load` returns a `PromiseLike`, later same-id requests, including legitimate
concurrent roots, deduplicate onto the normal in-flight graph Promise and
receive identical record/namespace identity.

An async hook must not await or reenter the same loader for the identifier whose
source it is producing. This creates an undetectable host-Promise dependency
cycle and is a documented `ModuleHost` contract violation, not something the
engine portably diagnoses. Different-id reentrancy remains allowed and
deduplicated. Synchronous typed rejection does not corrupt error/retry cleanup.

Focused coverage:

- synchronous same-id rejection: `loader rejects synchronous same-identifier reentry without corrupting cache cleanup`
- async same-id concurrent-root deduplication and record identity: `loader deduplicates a concurrent request after async load returns its promise`
- different-id reentrancy: `loader permits different-identifier reentry from a load hook`
- cleanup after synchronous rejection: `loader rejects synchronous same-identifier reentry without corrupting cache cleanup`

The strengthened synchronous-rejection assertion requests `root` after the
nested rejection and outer success, then verifies cached-record identity and
one source load. It passed as contract characterization; no new RED was
fabricated. No hanging async self-await test is included.

## TDD evidence

The initial required RED was run before the implementation:

```text
$ node test/run-node.js test/module-loader.test.js
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/runtime/module-loader.js'
```

The controller-boundary test was added after the existing implementation and
passed immediately, so it is a characterization of the selected boundary, not
a new RED:

```text
loader deduplicates a concurrent request after async load returns its promise
status: passed
```

Review regressions were written and observed RED before their fixes:

```text
loader rejects an uninitialized Realm lookalike
Expected function to throw TypeError

loader keeps cyclic graphs pending through transitive failure and retry
Expected promise to reject

loader keeps concurrently acquired cyclic graphs pending through failure
Expected promise to reject

loader keeps overlapping cyclic graphs pending through failure
Expected promise to reject

loader permits different-identifier reentry that imports its active loader
Expected true to be the same value as false
```

## Final validation

```text
$ node test/run-node.js test/module-loader.test.js && node test/run-node.js test/module-parser.test.js
21 module-loader tests passed; 7 module-parser tests passed.

$ npm run typecheck && npm run lint
exit code 0

$ npm run test:node
exit code 0
```

## Delivered work

- Added portable canonical module source/graph loading with validation, typed
  boundary errors, ordered frozen resolved edges, retries, and cache isolation.
- Added synchronous-only same-identifier reentry handling and the portable
  post-thenable concurrent-deduplication characterization.
- Corrected Realm validation and cyclic graph completion/retry behavior for
  nested, concurrent, and overlapping cycles.
- Registered the portable loader suite and exported the Task 2 public API.

## Concerns

None.
