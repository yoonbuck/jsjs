# Task 2 Report — DONE

## Controller ruling

Same-identifier reentrant-load rejection is defined only over the synchronous
invocation extent of `host.load(identifier)`. Once `load` returns a
Promise/thenable, later same-identifier requests are ordinary concurrent
requests and await the in-flight work. This preserves portable
concurrent-root deduplication without host-specific async provenance.

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
