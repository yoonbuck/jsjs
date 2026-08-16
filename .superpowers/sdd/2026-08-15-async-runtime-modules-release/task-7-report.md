# Task 7 Consolidated Fix-Wave Report

## Scope and boundary

- Review base: `0dd8e76d58e8c593cb9a638d4388c0d6e35053ad`
- Implementation head before this report:
  `6f0e29464c1060ee16562ff4a1235795e7de781a`
- Findings reviewed: 14
- Result: 14 VERIFIED, 0 REJECTED, 0 BLOCKED
- Explicitly excluded: #66 ordinary-module capability/early-error validation and
  #67 receiver-aware polymorphic prototype-chain exotic `[[Set]]`.
- No reset, rebase, amend, merge, push, PR creation, broad upstream Test262 run,
  full `ci:contract`, full browser run, or generated release-artifact rewrite
  was performed.

## Finding 1 — Concurrent cyclic module roots

**Status: VERIFIED**

**RED**

Command:

```sh
node test/run-node.js test/module-loader.test.js
```

Exact failing record:

```json
{"name":"loader settles concurrent roots across an overlapping source cycle","status":"failed","error":{"name":"Error","message":"Expected concurrent cyclic module roots to settle"}}
```

**Root cause**

For concurrent roots over `a -> {b,c}`, `b -> a`, `c -> b`, `b` could settle
its member graph before owner `a`. Its `finally` deleted the `b -> a` dependency
edge while `cycleOwners` still named `a`. Root `c` was already waiting for
owner `a`; when `a` later acquired `c`, the missing edge prevented detection of
`c -> b -> a`, so `a` awaited `c` and `c` awaited `a`.

**Fix**

Commit `5a6aad9e104237bd21735c25af946055901f5e5f` preserves SCC dependency
state while a cycle owner is pending. Successful owner completion marks every
member complete and removes all retained owner/dependency state together;
failure cleanup removes the same state transactionally.

**GREEN**

- `node test/run-node.js test/module-loader.test.js` — 27/27 passed.
- The final adjacent module/Promise/Job command passed as part of 153/153 tests.
- Existing delayed-root, failure/retry, overlapping-cycle, and reentrant-loader
  cases remained green.

**Artifacts**

None.

## Finding 2 — Imported re-export binding identity

**Status: VERIFIED**

**RED**

Command:

```sh
TZ=UTC node test/run-node.js test/ci/es2015-module-test262.test.js
```

Exact failing record:

```json
{"name":"focused ES2015 static-module Test262 roots all pass at the pinned revision","status":"failed","error":{"name":"Error","message":"Expected 1 to be the same value as 0: focused module records did not pass: [{\"type\":\"test\",\"file\":\"test/language/module-code/ambiguous-export-bindings/import-and-export-propagates-binding.js\",\"variant\":\"non-strict\",\"status\":\"failed\",\"reason\":\"unexpected-throw\",\"message\":\"guest object with message: The requested module 'test/language/module-code/ambiguous-export-bindings/import-and-export-propagates-binding.js' contains ambiguous exports for 'foo'\"}]"}}
```

**Root cause**

`SourceTextModuleRecord` classified every source-less `export { x }` as a local
export, even when `x` was an imported named binding. `ResolveExport` therefore
returned the importing module and local import name instead of the original
resolved module/binding pair, making two paths to the same binding appear
ambiguous.

**Fix**

Commit `5a6aad9e104237bd21735c25af946055901f5e5f` performs an import-entry
pre-pass, classifies named imported exports as indirect exports, and privately
associates each with its exact source-order import entry so duplicate raw
specifiers still use the correct resolved request occurrence.

**GREEN**

- Pinned `import-and-export-propagates-binding.js` passes.
- Focused module Test262: 12/12 records passed, 0 skipped.
- `test/module-parser.test.js` — 10/10 passed.
- `test/module-linker.test.js` — 11/11 passed.

**Artifacts**

The added root is focused-only and does not alter the broad selection.

## Finding 3 — Namespace membership reads TDZ bindings

**Status: VERIFIED**

**RED**

Command:

```sh
node test/run-node.js test/module-namespace.test.js
```

Exact failing record:

```json
{"name":"namespace preserves a linked export TDZ until evaluation","status":"failed","error":{"name":"GuestErrorSignal","message":"Cannot access 'value' before initialization"}}
```

**Root cause**

Inherited `EngineObject#hasProperty` called `getProperty`, which invoked the
namespace's virtual descriptor creation and dereferenced the live export.
Membership should inspect the namespace export-name set and must not perform
`GetBindingValue`.

**Fix**

Commit `5a6aad9e104237bd21735c25af946055901f5e5f` overrides namespace
`hasProperty` to return string-export membership directly and delegates only
non-export keys to the ordinary object path.

**GREEN**

- `test/module-namespace.test.js` — 6/6 passed.
- TDZ value reads still throw until evaluation; missing names still return
  false.

**Artifacts**

None. The upstream `has-property-str-found-uninit.js` behavior is covered by the
portable namespace membership regression; its unrelated unsupported `Reflect`
feature remains outside the release claim.

## Finding 4 — Promise combinators close done-marked iterators

**Status: VERIFIED**

**RED**

Command:

```sh
TZ=UTC node test/run-node.js test/ci/es2015-promise-test262.test.js
```

Exact failing record:

```json
{"name":"focused ES2015 Promise upstream Test262 files all pass","status":"failed","error":{"name":"Error","message":"Expected 8 to be the same value as 0: Expected every focused Promise file to pass, got: [{\"type\":\"test\",\"file\":\"test/built-ins/Promise/all/iter-next-val-err-no-close.js\",\"variant\":\"non-strict\",\"status\":\"failed\",\"reason\":\"unexpected-throw\",\"message\":\"guest object with message: Expected SameValue(«1», «0») to be true\",\"features\":[\"Symbol.iterator\"]},{\"type\":\"test\",\"file\":\"test/built-ins/Promise/all/iter-next-val-err-no-close.js\",\"variant\":\"strict\",\"status\":\"failed\",\"reason\":\"unexpected-throw\",\"message\":\"guest object with message: Expected SameValue(«1», «0») to be true\",\"features\":[\"Symbol.iterator\"]},{\"type\":\"test\",\"file\":\"test/built-ins/Promise/all/iter-step-err-no-close.js\",\"variant\":\"non-strict\",\"status\":\"failed\",\"reason\":\"unexpected-throw\",\"message\":\"guest object with message: Expected SameValue(«1», «0») to be true\",\"features\":[\"Symbol.iterator\"]},{\"type\":\"test\",\"file\":\"test/built-ins/Promise/all/iter-step-err-no-close.js\",\"variant\":\"strict\",\"status\":\"failed\",\"reason\":\"unexpected-throw\",\"message\":\"guest object with message: Expected SameValue(«1», «0») to be true\",\"features\":[\"Symbol.iterator\"]},{\"type\":\"test\",\"file\":\"test/built-ins/Promise/race/iter-next-val-err-no-close.js\",\"variant\":\"non-strict\",\"status\":\"failed\",\"reason\":\"unexpected-throw\",\"message\":\"guest object with message: Expected SameValue(«1», «0») to be true\",\"features\":[\"Symbol.iterator\"]},{\"type\":\"test\",\"file\":\"test/built-ins/Promise/race/iter-next-val-err-no-close.js\",\"variant\":\"strict\",\"status\":\"failed\",\"reason\":\"unexpected-throw\",\"message\":\"guest object with message: Expected SameValue(«1», «0») to be true\",\"features\":[\"Symbol.iterator\"]},{\"type\":\"test\",\"file\":\"test/built-ins/Promise/race/iter-step-err-no-close.js\",\"variant\":\"non-strict\",\"status\":\"failed\",\"reason\":\"unexpected-throw\",\"message\":\"guest object with message: Expected SameValue(«1», «0») to be true\",\"features\":[\"Symbol.iterator\"]},{\"type\":\"test\",\"file\":\"test/built-ins/Promise/race/iter-step-err-no-close.js\",\"variant\":\"strict\",\"status\":\"failed\",\"reason\":\"unexpected-throw\",\"message\":\"guest object with message: Expected SameValue(«1», «0») to be true\",\"features\":[\"Symbol.iterator\"]}]"}}
```

**Root cause**

`PerformPromiseAll` and `PerformPromiseRace` sent `IteratorStep` and
`IteratorValue` abrupt completions through the same close-and-reject helper used
for later resolve/then setup failures. ES2015 marks the iterator done at the
step/value failure points, so the outer combinator must reject without
`IteratorClose`.

**Fix**

Commit `579098b274f7c9abd535c33d5cae9534d3c3c5c2` adds a no-close
capability-rejection path for step/value failures while retaining close
behavior for resolve and then setup failures.

**GREEN**

- All/race × step/value pinned roots pass in both variants.
- Focused Promise Test262: 30/30 records passed, 0 skipped.
- `test/promise-combinators.test.js` — 13/13 passed.
- Adjacent Promise core/reaction/combinator coverage remained green.

**Artifacts**

The four added roots are focused-only and do not alter broad selection.

## Finding 5 — Late Promise.all resolve-element throws

**Status: VERIFIED**

**RED**

Command:

```sh
node test/run-node.js test/promise-combinators.test.js
```

Exact failing record:

```json
{"name":"late Promise.all resolve element propagates an abrupt capability resolve","status":"failed","error":{"name":"Error","message":"Expected \"normal\" to be the same value as \"throw\""}}
```

**Root cause**

The resolve-element function reused the iterator-exhaustion helper, which
caught any throwing aggregate resolve and called aggregate reject. A later
resolve-element call is no longer inside `PerformPromiseAll`; its throw must
propagate to its caller and must not reject the still-pending aggregate.

**Fix**

Commit `579098b274f7c9abd535c33d5cae9534d3c3c5c2` calls the aggregate
resolve directly from resolve-element functions. Only the synchronous
iterator-exhaustion path retains abrupt-to-rejection conversion.

**GREEN**

- `test/promise-combinators.test.js` — 13/13 passed.
- The late call throws the exact guest value, reject count remains zero, and
  the aggregate remains pending.
- The existing empty-iteration abrupt resolve still rejects exactly once and
  does not close the completed iterator.

**Artifacts**

None.

## Finding 6 — Terminal generator result Realm

**Status: VERIFIED**

**RED**

Command:

```sh
node test/run-node.js test/generator-runtime.test.js
```

Exact failing record:

```json
{"name":"borrowed generator methods allocate terminal results in the method Realm","status":"failed","error":{"name":"Error","message":"Expected [object Object] to be the same value as [object Object]"}}
```

The mismatch was the terminal iterator-result prototype: Realm A was observed
where the borrowed method's Realm B prototype was required.

**Root cause**

`GeneratorObject#resume` had no method-Realm input and allocated every direct
iterator-result object from the generator's Realm.

**Fix**

Commit `b179efce8ba93e5241623124fff74942c5d3a8b9` passes each intrinsic
method's Realm into resume. `done: true` results use that Realm; direct yielded
`done: false` results continue to use the generator Realm, and delegated
results remain identity-preserved.

**GREEN**

- `test/generator-runtime.test.js` — 13/13 passed.
- Borrowed Realm-B `next`, `return`, and caught-`throw` terminal results use
  Realm B; yielded results use Realm A.
- Focused generator Test262: 22/22 records passed.

**Artifacts**

None.

## Finding 7 — Generator super base is recomputed after key coercion

**Status: VERIFIED**

**RED**

Command:

```sh
node test/run-node.js test/generator-yield.test.js
```

Exact failing record:

```json
{"name":"generator super reads capture their base before key coercion","status":"failed","error":{"name":"Error","message":"Expected \"key-ready:second:true\" to be the same value as \"key-ready:first:true\""}}
```

**Root cause**

Generator frames saved `[[HomeObject]]`, then `ToPropertyKey` ran, and
`SuperReferenceBase` fetched the home object's current prototype only during
`GetValue`/`PutValue`. A coercion hook could replace that prototype and redirect
the already-started super reference.

**Fix**

Commit `b179efce8ba93e5241623124fff74942c5d3a8b9` captures the actual
super base before evaluating/coercing the computed key and stores that base in
the reference. The ordinary and destructuring super-reference paths use the
same corrected representation. The receiver-aware exotic-set work in #67 was
not changed.

**GREEN**

- `test/generator-yield.test.js` — 33/33 passed.
- Adjacent class, destructuring, enhanced-object-literal, and generator suites
  passed in the final 279/279 generator/parser group.

**Artifacts**

None.

## Finding 8 — Dependency syntax errors use the wrong Test262 phase

**Status: VERIFIED**

**RED**

Command:

```sh
TZ=UTC node test/run-node.js test/ci/es2015-module-test262.test.js
```

Exact failing record:

```json
{"name":"focused ES2015 static-module Test262 roots all pass at the pinned revision","status":"failed","error":{"name":"Error","message":"Expected 1 to be the same value as 0: focused module records did not pass: [{\"type\":\"test\",\"file\":\"test/language/module-code/instn-resolve-err-syntax-1.js\",\"variant\":\"non-strict\",\"status\":\"failed\",\"reason\":\"wrong-error-phase\",\"message\":\"expected a resolution-phase error, got a parse-phase error\"}]"}}
```

**Root cause**

The Test262 engine bridge mapped every loader `parse` error to Test262's parse
phase. Loader errors already carry the canonical failing identifier, so root
and dependency parsing were distinguishable but the bridge ignored it.

**Fix**

Commit `703bc44dfb6b77b783a646fc6a909f538226cd64` keeps root-identifier parse
failures in parse phase and maps dependency parse failures to resolution phase
with a Realm-owned guest `SyntaxError`.

**GREEN**

- Pinned `instn-resolve-err-syntax-1.js` passes.
- Focused module Test262: 12/12 records passed.
- `test/module-test262.test.js` — 8/8 passed, including the existing root parse
  negative.

**Artifacts**

The root is focused-only.

## Finding 9 — Literal backslashes bypass module-root containment

**Status: VERIFIED**

**RED**

Command:

```sh
node test/run-node.js test/module-paths.test.js
```

Exact failing record:

```json
{"name":"portable module paths reject literal backslashes before normalization","status":"failed","error":{"name":"Error","message":"Expected module path resolution to fail"}}
```

**Root cause**

The portable resolver rejected encoded separators but split only on `/`.
Literal `\` survived normalization and could be reinterpreted as a separator by
a later host path/URL layer.

**Fix**

Commit `703bc44dfb6b77b783a646fc6a909f538226cd64` rejects literal backslashes
in both specifier and referrer immediately after type validation, before
relative-path and structural normalization.

**GREEN**

- `test/module-paths.test.js` — 4/4 passed in Node and targeted Chromium.
- Targeted macOS JavaScriptCore module check printed `module-paths: passed`.
- `test/module-test262.test.js` — 8/8 passed.

**Artifacts**

None.

## Finding 10 — UTC guard accepts historically non-UTC zones

**Status: VERIFIED**

**RED**

Command:

```sh
node test/run-node.js test/node/workflow-contract.test.js
```

Exact failing record:

```json
{"name":"UTC guard requires the canonical TZ value rather than historical offsets","status":"failed","error":{"name":"Error","message":"Expected 0 to be the same value as 1"}}
```

**Root cause**

Two modern offset probes cannot distinguish canonical UTC from a zone such as
`Africa/Monrovia`, whose historical offset is nonzero but whose 2020 January and
July offsets are both zero.

**Fix**

Commit `c88c39ae8c11d23c5448530f5cdd0c2135dd9618` requires
`process.env.TZ === "UTC"` exactly and retains the existing exact remediation
diagnostic.

**GREEN**

- `test/node/workflow-contract.test.js` — 34/34 passed.
- `Africa/Monrovia` exits 1 and prints
  `NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream`.
- `UTC` exits 0 with no diagnostic.

**Artifacts**

None.

## Finding 11 — Broad Test262 exits green with skipped selections

**Status: VERIFIED**

**RED**

Command:

```sh
node test/run-node.js test/node/workflow-contract.test.js
```

Exact failing record:

```json
{"name":"broad Test262 result policy rejects skips and incomplete coverage","status":"failed","error":{"name":"Error","message":"Expected \"undefined\" to be the same value as \"function\""}}
```

**Root cause**

`upstream-run.js` returned failure only when `summary.failed > 0`; skips and
coverage holes could therefore produce exit code zero.

**Fix**

Commit `c88c39ae8c11d23c5448530f5cdd0c2135dd9618` adds a pure
`upstreamRunResultPasses` policy and uses it for the command exit. Success now
requires zero failures, zero skips, and equality of selected, attempted, and
passed counts for both file and record coverage scopes.

**GREEN**

- Pure policy cases pass inside `test/node/workflow-contract.test.js` — 34/34.
- Final Test262 policy group — 100/100 passed.
- No broad upstream execution was used to test this policy.

**Artifacts**

None directly.

## Finding 12 — Valid `module, raw` metadata is malformed

**Status: VERIFIED**

**RED**

Command:

```sh
node test/run-node.js test/test262-runner.test.js
```

Exact failing record:

```json
{"name":"variant expansion honours the strictness flags","status":"failed","error":{"name":"Test262MetadataError","message":"Conflicting frontmatter flags: raw and module"}}
```

**Root cause**

Metadata validation treated `module` as conflicting with `raw`, despite Test262
using the combination for a raw, single-record module. Variant expansion and
module execution already had the correct composition once metadata survived.

**Fix**

Commit `c88c39ae8c11d23c5448530f5cdd0c2135dd9618` permits `module, raw`,
expands it once as variant `raw`, supplies no harness includes, and routes the
unmodified source through module evaluation. `module, async` remains an
unsupported flag-combination skip; `raw, async` remains malformed.

**GREEN**

- `test/test262-runner.test.js` — 60/60 passed.
- Local fixture inventory: 14 files, 19 records, 2 malformed; the new raw
  module contributes exactly one record.
- Fixture execution: 18 emitted records, 17 passed, 1 expected unsupported
  feature skip, 0 failed.
- Targeted Chromium runner and JSC fixture adapter passed.
- Pinned metadata for
  `test/language/comments/hashbang/module.js` and
  `test/language/module-code/import-attributes/allow-nlt-before-with.js`
  parses as `["module","raw"]`, expands to `["raw"]`, has no includes, and is
  still honestly skipped for unsupported features.

**Artifacts**

This changes the broad inventory denominator: the two pinned `module, raw`
files now contribute one record each instead of being counted as malformed.
Files remain unchanged; record total should increase by 2 and malformed count
should decrease by 2. Per instruction, `upstream-subset.json`,
`docs/test262-report.jsonl`, and the generated `docs/conformance.md` coverage
block were not regenerated or hand-edited. Fresh UTC Task 5 artifact generation
is required after review.

## Finding 13 — Completed jobs remain retained during a checkpoint

**Status: VERIFIED**

**RED**

Command:

```sh
node test/run-node.js test/jobs.test.js
```

Exact failing record:

```json
{"name":"Agent queue releases consumed records and compacts during a checkpoint","status":"failed","error":{"name":"Error","message":"Expected true to be the same value as false"}}
```

**Root cause**

The queue advanced `jobHead` but left each completed `JobRecord` in its array
slot until the entire checkpoint finished. A long checkpoint therefore retained
callbacks, arguments, and Realms for all completed jobs.

**Fix**

Commit `6f0e29464c1060ee16562ff4a1235795e7de781a` clears each slot before
invoking its job and compacts consumed storage after a 1,024-slot threshold
once consumed storage is at least half the array. FIFO, enqueue-during-drain,
failure containment, and generation semantics are unchanged.

**GREEN**

- `test/jobs.test.js` — 17/17 passed.
- The deterministic test observes no consumed record in queue storage and at
  least one mid-checkpoint compaction; it does not depend on GC.
- Targeted Chromium Job Queue suite passed.
- Adjacent Promise and async-runtime/module integration suites passed.

**Artifacts**

None.

## Finding 14 — Custom generator ASTs bypass generator early errors

**Status: VERIFIED**

**RED**

Command:

```sh
node test/run-node.js test/parser.test.js
```

Exact failing record:

```json
{"name":"parser preserves generator early errors and rejects malformed custom yield syntax","status":"failed","error":{"name":"Error","message":"Expected function to throw SyntaxError"}}
```

The first newly required custom generator early error was accepted.

**Root cause**

The custom-AST parameter pass returned early for every sloppy simple parameter
list. It therefore never inspected generator parameters for a `yield` binding,
and it did not distinguish object generator methods, whose formal parameters
must be unique, from sloppy generator declarations/dynamic constructors, where
duplicate simple parameters remain valid.

**Fix**

Commit `b179efce8ba93e5241623124fff74942c5d3a8b9` always summarizes generator
parameter names, rejects a generator parameter binding named `yield`, and
rejects duplicate simple parameters for generator methods. It preserves valid
custom generator ASTs and valid sloppy duplicate parameters for generator
declarations and `%GeneratorFunction%`. No ordinary-module validation from #66
was imported.

**GREEN**

- `test/parser.test.js` — 137/137 passed.
- Custom `function* g(yield){}` and `({ *m(a,a){} })` reject.
- Valid custom generator ASTs and sloppy dynamic generator duplicates pass.
- Generator/parser adjacent group — 279/279 passed.

**Artifacts**

None.

## Final validation

Targeted validation only:

```text
153/153 module, Promise, Job Queue, and integration tests passed
279/279 generator, parser, class, destructuring, and object-method tests passed
100/100 Test262 runner/workflow/selection policy tests passed
Focused Test262: Promise 30/30, generator 22/22, module 12/12; 0 failed, 0 skipped
Pinned module raw metadata cases: 2/2 passed
Test262 fixture adapter: exit 0; 17 passed, 1 expected skip, 0 failed
Targeted Chromium: module paths, Job Queue, and Test262 runner passed
Targeted JavaScriptCore: literal-backslash check and Test262 fixture adapter passed
npm run typecheck: passed
npm run lint: passed
npm run format: passed
git diff --check 0dd8e76..implementation-head: passed
```

Deliberately not run: broad upstream Test262, upstream artifact check, full
`ci:contract`, full browser suite, full JSC suite, or exact-SHA CI.

## Commit list

1. `5a6aad9e104237bd21735c25af946055901f5e5f` — Fix module graph and export semantics
2. `579098b274f7c9abd535c33d5cae9534d3c3c5c2` — Fix Promise combinator abrupt completions
3. `b179efce8ba93e5241623124fff74942c5d3a8b9` — Fix generator Realm and early semantics
4. `703bc44dfb6b77b783a646fc6a909f538226cd64` — Fix Test262 module error classification
5. `c88c39ae8c11d23c5448530f5cdd0c2135dd9618` — Harden Test262 release result policy
6. `6f0e29464c1060ee16562ff4a1235795e7de781a` — Bound Job Queue record retention
7. Task 7 report — the commit containing this report.

Every commit uses the required trailer:

```text
Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
```

## Self-review and concerns

- Reviewed the complete `0dd8e76..6f0e294` fix-wave diff (32 files, 740
  insertions, 145 deletions before this report) and ran `git diff --check`.
- Confirmed #66 and #67 remain untouched.
- Confirmed Promise/module additions are focused-only release roots; no broad
  selection was widened by hand.
- Confirmed no generated report, selection, or conformance block was edited.
- The only remaining concern is intentional and externally sequenced: the
  module+raw inventory correction requires fresh UTC Task 5 artifact
  regeneration after review.
- `git status --short` was empty immediately before report generation. This
  report is committed as the final fix-wave commit; final cleanliness is
  verified after that commit.
