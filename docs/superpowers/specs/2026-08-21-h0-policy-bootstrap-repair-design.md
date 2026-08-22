# H0 Policy Bootstrap Repair Design

## Status

Approved in-session on 2026-08-21 for a fresh branch from exact main
`03a4ccadb2b07fa7d3c1ad0f599608b0a7c31efd`.

This is a trust-root bootstrap repair. The current BASE guard is expected to
reject the repair PR because schema-v3 contains no operation that can authorize
changes to its own checker or transitive parser dependencies.

## Problem

Schema-v3 main records exact H0/#76 authority as `pending` and pins
`tools/test262/es2015-h0-promotion.json` at SHA-256
`a5ad87badd75c547f4f4e2fb0b5d0536b4969ea3bf97676333f970434e5cfa2c`.

The artifact uses the reviewed H0 promotion schema:

- `h0LedgerSha256`
- `h0RootCount`
- `h0VariantCount`
- `dispositionSha256`
- `promotedLedgerSha256`
- `promotedRootCount`
- `promotedVariantCount`

The immutable BASE projection validator reads that exact artifact but calls
BASE `parseEs2015Promotion()`, which accepts only the older T0 fields
`ledgerSha256`, `rootCount`, and `variantCount`. The exact H0 consumer therefore
fails with:

```text
Es2015PromotionError: tools/test262/es2015-promotion.json has unknown key h0LedgerSha256
```

The consumer cannot change the exact evidence, BASE checker, or BASE parser.
Schema-v3 also retired `foundation-maintenance` and provides no policy-maintenance
operation. Thus the trust root is both inconsistent and unmaintainable.

## Goals

1. Make the BASE checker accept and semantically validate all six exact
   authority-pinned H0 evidence schemas and their cross-artifact identities.
2. Preserve the existing T0 promotion schema and behavior byte-for-behavior.
3. Close the BASE checker's transitive executable dependency set so every future
   policy change requires an authoritative marker.
4. Make every trust-root dependency marker-owned so future changes cannot merge
   neutrally.
5. Keep manifests, authority records, decision fragments, semantic runtime code,
   evidence, and protected generated outputs unchanged in the bootstrap.
6. Keep P0 applied, H0 pending, all 15 profiles, and all 13 decision fragments
   unchanged.
7. Allow the reconciled #76 branch to consume H0 normally after this repair merges.

## Non-goals

- Consuming H0 in the bootstrap repair.
- Changing any H0/P0 evidence or generated output.
- Regenerating taxonomy, subset, report, conformance, or audit evidence.
- Changing the guest runtime, Test262 host implementation, or #76 semantics.
- Adding M0/#79 authority.
- Reopening broad `foundation-maintenance`.
- Running broad/full Test262 or `ci:contract` locally.

## Alternatives

### Parser-only bootstrap

This is the smallest immediate patch, but it leaves the same trust-root deadlock
for the next checker defect. Rejected because the system already required two
bootstrap exceptions in one day.

### Replace H0 authority or evidence

This would discard reviewed exact identities, require another manifest migration,
and still leave checker policy unmaintainable. Rejected.

### Recommended: complete H0 adapter bootstrap

Perform one explicitly reviewed bootstrap exception containing all pure H0
adapters and closure ownership required by #76. Future trust-root modifications
remain explicit bootstrap exceptions rather than using a generic self-service
maintenance mechanism.

## Bootstrap Exception

The repair PR begins from exact main
`03a4ccadb2b07fa7d3c1ad0f599608b0a7c31efd`.

The old BASE guard must fail because it sees changed gate-owner paths without a
recognized marker. This failure is expected evidence, not a check to bypass
silently.

The PR may merge only after:

- exact base/head identities are recorded;
- focused RED/GREEN tests pass;
- the exact old BASE guard failure is captured and matches the missing-maintenance
  limitation;
- independent provenance/security specification review is clean;
- independent whole-branch code/security review is clean;
- ordinary PR CI passes at the unchanged reviewed head;
- both CodeQL categories pass with zero results/errors/warnings;
- open code-scanning alerts are zero;
- an explicit administrator merge authorization is recorded;
- squash merge is used;
- exact-main CI and both CodeQL categories pass afterward.

No other failed check may be waived.

## Complete H0 Evidence Adapter Repair

The repair moves every pure H0 evidence parser and reconciliation rule required by
the BASE projection validator from the reviewed #76 tooling into BASE. It does not
move runtime host behavior or write generated evidence.

### H0 promotion

`tools/test262/es2015-promotion.js` keeps one public
`parseEs2015Promotion(text)` entry point. It parses JSON once, then dispatches by
exact discriminator:

- neither H0 discriminator: existing T0 parser unchanged;
- both `h0LedgerSha256` and `promotedLedgerSha256`: strict H0 parser;
- only one discriminator: reject mixed/ambiguous schema.

The H0 parser requires exact keys, exact SHA/count relationships, unique
code-unit-sorted entries, promoted counts equal to entry totals, and
`promotedLedgerSha256` equal to the exact promoted-path ledger.

The normalized H0 result retains all H0 provenance fields and exposes:

```text
groupName: es2015/h0-cross-realm-passed
ledgerSha256: promotedLedgerSha256
rootCount: promotedRootCount
variantCount: promotedVariantCount
```

Existing `promotionPaths()`, subset, and report logic then operate on either schema
without weakening T0 validation.

### H0 paths

The exact `es2015-h0-paths.json` object is parsed with strict keys, repository
pin, source taxonomy identity, 135/267 counts, sorted unique paths, and exact
ledger hash. BASE projection code consumes its normalized `paths`, never assumes
the file itself is a bare array.

### H0 baseline

The exact compact baseline object is parsed with its reviewed commit, taxonomy,
H0/non-H0 classification hashes, counts, and balanced summary.

The bootstrap installs reconciliation that:

1. resolves the preserved taxonomy from the exact baseline commit;
2. requires its full SHA-256 equal the baseline/pending-authority preserved
   identity;
3. requires its H0 selector equal 135 roots / 267 variants and the exact path
   ledger;
4. requires current BASE taxonomy equal the authority taxonomy identity;
5. requires current BASE H0 selector/classifications equal the preserved H0
   selector/classifications;
6. permits non-H0 differences only when current BASE bytes and balanced summaries
   are independently validated as reviewed movement;
7. never suppresses H0, count, path, partition, or balance checks.

This makes current P0 movement compatible without changing the exact H0 baseline
artifact.

### H0 disposition

The exact disposition object is parsed and cross-checked against paths, promotion,
owner map, and execution evidence:

- every H0 root appears exactly once;
- all required variants appear exactly once;
- 40 roots / 78 variants are complete-pass;
- 95 roots / 189 variants are reassigned;
- no missing, skipped, duplicate, malformed, or unexplained variant;
- mixed-root reassignment retains its passed evidence and exact owner proof.

### H0 owner map and owner deltas

The exact owner map is parsed as a reviewed closed allowlist of existing roadmap
owners. The exact owner-deltas object must equal the disposition-derived removal
from H0 plus the full per-owner additions. Unknown owner, path, count, or hash
fails.

### Cross-artifact validation

BASE loads all six artifacts once and validates:

- every authority-pinned byte hash;
- repository/revision agreement;
- source taxonomy and H0 ledger agreement;
- disposition hash agreement;
- promotion equals exactly complete-pass dispositions;
- owner deltas equal exactly reassigned dispositions;
- H0 paths equal the current/preserved selector;
- promoted subset group is exactly `es2015/h0-cross-realm-passed`;
- report/taxonomy/audit projections use the normalized H0 promotion and
  disposition facts.

No artifact is coerced into a legacy generic array/object shape.

## Transitive Gate-owner Closure

The guard executes BASE `tools/test262/es2015-provenance-check.js` and every module
it imports. The gate-owner set must include:

- `.github/workflows/ci.yml`
- `tools/ci/pipeline.js`
- `tools/test262/es2015-provenance-check.js`
- `tools/test262/es2015-provenance.js`
- `tools/test262/es2015-provenance.json`
- all `tools/test262/es2015-provenance-decisions/*.json`
- `tools/test262/coverage.js`
- `tools/test262/features.js`
- `tools/test262/es2015-promotion.js`
- `tools/test262/es5-selection.js`
- `tools/test262/report.js`
- `tools/test262/es2015-taxonomy.js`
- `tools/test262/upstream.js`
- `tools/test262/selection.js`
- `tools/test262/metadata.js`
- `tools/test262/module-paths.js`
- `tools/test262/features.json`

Tests recursively resolve every repository-local static import beginning at the
checker, including imports of imports, and require the complete executable closure
to equal the enforced gate-owner set. A new transitive import without an ownership
update fails.

Generated data such as taxonomy JSON remains protected by its existing closed
namespace/output rules; the executable taxonomy module is separately gate-owned.

Tests also enumerate every repository file read from HEAD by protected projection
logic. Each must be exactly one of:

- the active authority's evidence path;
- the active authority's protected output path; or
- an immutable marker-owned input whose BASE and HEAD bytes must be identical.

`tools/test262/features.json` is an immutable marker-owned input. This rule also
prevents a future projection validator from adding an unowned policy-data input.

Gate-owner modules must not contain dynamic `import()`, `createRequire`,
CommonJS `require`, computed module specifiers, `data:` module imports, or other
runtime module-loading mechanisms. Static literal relative imports are the only
repository-local dependency form.

## Future Trust-root Maintenance

The bootstrap intentionally installs no reusable self-service maintenance
operation. Generic enforcement-root maintenance cannot safely prove every future
execution or authorization-data dependency without an external immutable verifier
or a restrictive policy language.

All workflow, pipeline, checker, provenance, and transitive policy dependencies
remain marker-owned. Markerless changes fail. Any future trust-root modification
requires:

- an explicit bootstrap design and implementation plan;
- independent security review;
- ordinary exact-head CI and both CodeQL categories;
- an expected active-guard failure attributable only to the missing BASE
  authorization;
- explicit administrator merge authorization;
- exact-main CI/CodeQL verification.

This is operationally heavier but does not pretend the trust root can safely
authorize arbitrary changes to itself.

## Bootstrap Repair Scope

The initial bootstrap PR changes only:

- `tools/test262/es2015-promotion.js`
- `tools/test262/es2015-provenance.js`
- `tools/test262/es2015-provenance-check.js`
- focused tests for all H0 evidence adapters, ownership closure, and exact H0
  consumption projection
- directly related design/plan/testing documentation

`.github/workflows/ci.yml` and `tools/ci/pipeline.js` must remain byte-identical in
the bootstrap. The old guard failure therefore cannot be caused or hidden by a
workflow change.

The manifest, authorities, profiles, decision fragments, H0/P0 evidence, and all
protected outputs remain byte-identical.

## Error Handling

All failures identify:

- marker operation;
- BASE and HEAD commits;
- expected and actual hash/path/schema;
- whether the failure is marker, ownership closure, immutable data, path range, or
  promotion schema.

No fallback treats unknown promotion keys as T0, strips fields, accepts partial H0
schema, or converts a trust-root change into a neutral range.

## Testing

Strict RED-first tests cover:

### H0 evidence adapters

- all six exact authority-pinned artifacts accepted;
- all normalized counts/group/path/owner/disposition identities exact;
- all cross-artifact hashes and unions exact;
- T0 artifact remains accepted and byte-for-behavior unchanged;
- legacy array assumptions for H0 paths/baseline rejected;
- mixed schemas, missing/extra keys, bad hashes/counts/order/duplicates rejected;
- every exact evidence byte hash remains unchanged.

### BASE projection

- exact pending H0 consumer fixture advances beyond promotion parsing;
- wrong H0 evidence bytes still fail exact add-exact hash first;
- valid H0 promotion paths drive subset/report projections;
- exact paths, baseline, disposition, owner-map, and owner-delta objects drive
  taxonomy/audit/subset/report projection checks;
- P0/T0 projections remain unchanged.

### Ownership closure

- current local import graph equals the gate-owner executable set;
- a synthetic unowned import fails;
- dynamic `import()`, `require`, `createRequire`, computed specifier, and URL/data
  module loading fail;
- workflow and pipeline remain byte-identical;
- every projection HEAD-read path is evidence, protected output, or immutable
  BASE-equal marker-owned input;
- valid H0 projection plus modified `tools/test262/features.json` fails;
- markerless changes to every gate-owner path fail.

### Trust-root immutability

- markerless changes to every workflow/pipeline/checker/transitive dependency fail;
- no legacy or roadmap marker authorizes those changes on schema-v3 BASE;
- bootstrap workflow/pipeline/manifest/authority/fragment/evidence/protected-output
  bytes remain unchanged;
- the old BASE guard fails the bootstrap range for the expected missing
  authorization reason;
- the repaired HEAD checker accepts the exact pending H0 consumer fixture through
  all six evidence adapters.

### Validation commands

Local validation is limited to:

- focused provenance, promotion/upstream-select, workflow-contract, and repository
  invariant Node suites;
- direct exact H0 promotion parsing;
- `npm run typecheck`;
- scoped ESLint/Prettier;
- `npm run ci:check`;
- `git diff --check`;
- exact old BASE guard invocation, expected to fail only for the bootstrap marker
  limitation;
- isolated invocation of the repaired HEAD checker proving exact H0 projection.

Never run broad/full Test262, `test262:upstream`, `test262:upstream:check`,
`ci:contract`, full Node, full browser, or full JSC locally.

## Delivery and H0 Resume

1. Merge the bootstrap repair under the explicit exception gates above.
2. Verify exact-main CI/CodeQL and record new checker, provenance, and promotion
   hashes.
3. Rebase safe #76 head `b524fc356868df50157193145a9f22a5821870fc`
   onto the repair squash SHA.
4. Re-run H0 consumer RED before state change.
5. Resolve the rebase so every gate-owner/tooling change already installed by the
   bootstrap is absent from the final #76 consumer diff. The bootstrap's compact
   baseline reconciliation must accept current reviewed P0 non-H0 movement while
   retaining exact H0 selector/evidence.
6. Regenerate H0 protected outputs over the repaired BASE and change only H0
   `pending -> applied`.
7. Require repaired exact BASE checker GREEN, no gate-owner diff, focused reviews,
   exact-head active
   guard/CI/CodeQL, squash merge, and exact-main verification.
8. Update and close #76; update #70 and #75. Keep #75/#70 open until their broader
   scopes complete.
