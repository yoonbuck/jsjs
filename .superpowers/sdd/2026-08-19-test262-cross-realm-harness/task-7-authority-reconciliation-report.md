# Task 7 Authority Reconciliation Report

## Status

Complete for the requested local recovery scope.

- Repaired exact BASE:
  `144f49f7bde1179d1b1d523f5048eca70c54a9de`
- Safe source head:
  `b524fc356868df50157193145a9f22a5821870fc`
- Final head:
  `c81bebab16eeeb7807db1281749e98c4f9738bd4`
- H0 authority state: `applied`
- Worktree: clean
- No push, PR, review agent, broad/full local suite, or issue update was
  performed.

The prior blocked report is superseded by this repaired-BASE result.

## Backup and rebase

Created before rewriting:

```text
refs/heads/recovery/issue-76-pre-repair-144f49f-b524fc3
  -> b524fc356868df50157193145a9f22a5821870fc
```

Rebased the 22-commit safe range with:

```text
git rebase --onto \
  144f49f7bde1179d1b1d523f5048eca70c54a9de \
  03a4ccadb2b07fa7d3c1ad0f599608b0a7c31efd
```

### Safe-to-repaired commit mapping

| Safe commit                                | Repaired commit                            | Subject                                             |
| ------------------------------------------ | ------------------------------------------ | --------------------------------------------------- |
| `a6413cb689a50d8cf6d4aa0121b5e2674943790c` | `4e75f81522019a5f918a39c301da4d77083d7e4e` | Design portable Test262 cross-Realm harness         |
| `9cbad31d634d550cf6211f62d631b637d247be0a` | `ec226a62b2b5b56acae1091a9db91b43d8e3544d` | Clarify raw Test262 host installation               |
| `a19c4e41203c4161386e7cfe636e30f8e0e2fa0e` | `1165b32cfafcab79ffeab05cd97f4cfe89b1759d` | Correct Test262 host binding design                 |
| `f1adcfe6596b535fd62ef7b9b791415de9a08450` | `efe100ad7aec1f8d13ddd452357fe5f37e5d6195` | Plan portable Test262 cross-Realm harness           |
| `706ea9cdcf00ccb564ff0af3ee3835cc61176a9c` | `0616c25ba18a981cc048479e416752d198611976` | Correct Test262 cross-Realm execution plan          |
| `b8d412b8b679f10d0749b7b977502a97ffacd643` | `0c6d3cc4acd444491efd19fd9aaf2fc80a3bf76f` | Add exact H0 cross-Realm RED corpus                 |
| `bd02fb1a3fc276a61f2669a54b28e939c167546b` | `3ed540b51f2fc29544e708fc25fc953ef1397269` | Require Test262 host binding preparation            |
| `46b99abc4d4e6be126d7b56ab7109ac72c5a8bc2` | `565c205a4ef4e10fa7a78deb332986095d12de0e` | Implement harness-only Test262 cross-Realm bindings |
| `7a37249b1cc30d42ea6f7b968f21f60b944cb497` | `e29ecfc57a362f008de98094775029131bf37fea` | Add Task 3 implementation report                    |
| `a092ace67221ae9c4b4afdaca39a9307da218a0e` | `4e46392985db1f3c7cad4202600592f8c2cd5ed4` | Amend H0 selector-zero plan                         |
| `39044533adbebe9a0a812064d642267dc8c6458d` | `45e24c6c59014b5aacc5611daf3dd7b2d6983db3` | Amend H0 disposition artifact plan                  |
| `c0bd0e546f5fcaf2669860f8c3bd5d4c5178ddca` | `7d978c27b4e39bedea62f282f017c23eba475115` | Add exact H0 Test262 dispositions                   |
| `eccc3bc0f41aeffee89125e1ad6694adf1598b19` | `2eed42ab4c611d8018c8c80420c547c5381b436f` | Fix H0 mixed-root disposition validation            |
| `60276ab75e2b6d8224dc1459f60a7e414167f53c` | `0142d8fa14d54a0d463c464ccb7ceba4d5cba721` | Reclassify exact cross-Realm Test262 roots          |
| `3e82a99a94a45c2308b1a8ace060061befc2b26e` | `4aeb346dabe1da8f1af38f65bb5e3b4c677c7641` | Strengthen H0 baseline audit proof                  |
| `acbb6bee6424f57ca7418863b9c44422f26a0bce` | `77a026afbc6754aedbd5fb9cada13c8e9002a2e5` | Normalize H0 audit output paths                     |
| `1590c8cd0bfc7524cc6d553996cef72cc27c075b` | `740c780ae7a6da70f9db0306e42652eba803219a` | Fix injected audit output roots                     |
| `e3f6604bf2398ef67b3088ba72d393d7687e7d0c` | `f653f47591655157e54d352fe520b4fd197e529f` | Fix Task 6 gate regressions                         |
| `b00a9721a67c1af11b983eb4ef3178b158e8b3d5` | `f72a931c79518815e36686f119a8089c0dc8734b` | Reconcile H0 evidence with moved main               |
| `b45f28bea543a95bc7ed32921ac11f82f777b0ee` | `4c10a793bc9edacbb00a420a785e44729808e34d` | Contain H0 audit output paths                       |
| `f3f86a7892970aa2cded3c6a04d46d970cf4c248` | `64da0ec93528c061a0dbfa9eb71c3851d7fe86a8` | Contain physical H0 audit outputs                   |
| `b524fc356868df50157193145a9f22a5821870fc` | `e213304d8a508acb08212d78c1ece25a9ba9ff45` | Preserve schema-v3 authority workflow               |

### New recovery commits

```text
15e04aca864dc5e29240efb010d284406f28e712 Reconcile H0 audit history
0830e3d160bd570594061c2e77182959c4f0d612 Apply repaired H0 roadmap authority
ea48117881df18ac6a8db4dcf3396f931029ccf9 Reconcile consumer validation fixtures
c81bebab16eeeb7807db1281749e98c4f9738bd4 Fix H0 audit type checks
```

All new commits use Copilot authorship and the required trailer.

## Conflict rulings

The repaired BASE already owns the H0 evidence adapters and their tests.
Conflicts in `tools/test262/es2015-promotion.js` and
`test/node/upstream-select.test.js` while replaying disposition, mixed-root,
reclassification, and baseline commits were resolved in favor of repaired BASE.

This removed duplicated consumer copies of the repaired promotion adapter while
preserving:

- the reviewed runtime/host implementation;
- portable runner/async/module tests;
- the exact six H0 evidence artifacts;
- generated taxonomy, report, conformance, and subset outputs;
- branch-only audit generation and physical output-containment logic.

Final consumer diff contains no changes to:

```text
.github/workflows/ci.yml
tools/ci/pipeline.js
tools/test262/es2015-promotion.js
tools/test262/es2015-provenance-check.js
tools/test262/es2015-provenance.js
```

Their HEAD bytes equal repaired BASE exactly.

## Audit history reconciliation

Added the required non-gate-owner behavior in
`tools/test262/es2015-audit.js`:

- `AuditDependencies` now injects
  `readGitFile(revision, path): Promise<string | null>`;
- the production dependency uses `git show REVISION:path` from the repository
  root with a 64 MiB output limit;
- default H0 `--check` parses `es2015-h0-baseline.json`;
- it reads the preserved taxonomy at
  `baseline.finalBaseCommit` (`99c439f2...`);
- it reads the current pre-H0 taxonomy at repaired BASE
  `144f49f7...`;
- it supplies preserved/current taxonomy text to repaired BASE
  `assertExactH0DispositionDelta`;
- missing commit/path fails explicitly with:

```text
tools/test262/es2015-taxonomy.json is unavailable at <revision>; full Git history is required for H0 audit reconciliation
```

Strict RED was observed before implementation because
`validateDefaultH0AuditReconciliation` did not exist.

Focused tests cover:

- valid production P0 movement;
- missing preserved Git history;
- arbitrary non-H0 provenance drift;
- legacy no-P0 synthetic compact-baseline behavior.

Consumer-facing provenance and upstream-selection tests were reconciled to use
the exact repaired BASE snapshots for BASE/bootstrap assertions while validating
both checked-in T0 and H0 generated subset groups.

## Exact BASE checker evidence

Detached checker worktree:

```text
BASE 144f49f7bde1179d1b1d523f5048eca70c54a9de
```

Exact marker:

```text
<!-- es2015-roadmap-authority-consume
parent:70
code:H0
issue:76
profile:roadmap-reclassification:H0
base:144f49f7bde1179d1b1d523f5048eca70c54a9de
source-path-sha256:3aeb254de8d996e0b5c3c383d0e5df56d651e4d32a2fb181bf2138040b4e3950
source-entry-sha256:null
protected-projection-sha256:8e16b33ffdbd8a2089567e9a8bdb1c654619b8bd00021c54ac74c0ab02f2c5fd
-->
```

### RED

Pending head:

```text
15e04aca864dc5e29240efb010d284406f28e712
```

Result:

```text
Es2015ProvenanceCheckError: H0 roadmap authority must transition only from pending to applied
RED_EXIT=1
```

No parser, path, projection, or unrelated failure preceded the expected
transition failure.

### GREEN

Canonical repaired-BASE renderer changed exactly H0:

```text
"state": "pending" -> "state": "applied"
```

Final exact checker result:

```text
GREEN_EXIT=0
GREEN_HEAD=c81bebab16eeeb7807db1281749e98c4f9738bd4
```

## Regeneration evidence

Executed:

```text
TZ=UTC npm run test262:cross-realm
TZ=UTC node tools/test262/es2015-audit.js \
  --baseline-taxonomy=.superpowers/sdd/2026-08-19-test262-cross-realm-harness/preserved-taxonomy-99c439f.json \
  --paths-manifest=tools/test262/es2015-h0-paths.json \
  --owner-map=tools/test262/es2015-h0-owner-map.json \
  --write-disposition=tools/test262/es2015-h0-disposition.json
TZ=UTC node tools/test262/es2015-audit.js \
  --baseline-taxonomy=.superpowers/sdd/2026-08-19-test262-cross-realm-harness/preserved-taxonomy-99c439f.json \
  --paths-manifest=tools/test262/es2015-h0-paths.json \
  --disposition=tools/test262/es2015-h0-disposition.json \
  --promotion-file=tools/test262/es2015-h0-promotion.json \
  --write-promotion=tools/test262/es2015-h0-promotion.json \
  --write-owner-deltas=tools/test262/es2015-h0-owner-deltas.json
TZ=UTC npm run test262:select
TZ=UTC npm run test262:es2015:sync-promoted-report
TZ=UTC npm run test262:es2015:audit
```

The exact H0 evidence hashes were unchanged before/after regeneration:

| Path                                        | SHA-256                                                            |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `tools/test262/es2015-h0-baseline.json`     | `01c9f90704fe9ea6d892c4e758817fbe9bc30368486a58f12b47068e6b2080ec` |
| `tools/test262/es2015-h0-disposition.json`  | `a48db4417e1ad41298e0d24bb6e1ef1925d6a812ab59a1541ce14ec2a06df857` |
| `tools/test262/es2015-h0-owner-deltas.json` | `ddb0001ef1ba607e785ba63560305144b8cd39c95c76b85c2375c38562b1618b` |
| `tools/test262/es2015-h0-owner-map.json`    | `d50f58ed621eac896fceb325f54480d33c9680c0f6b264a6cbce5812c7f4f44b` |
| `tools/test262/es2015-h0-paths.json`        | `bf3c2ed9c9e259bb25d3c5289a57c4daa5576b6d68d868df74f73c7a95bef893` |
| `tools/test262/es2015-h0-promotion.json`    | `a5ad87badd75c547f4f4e2fb0b5d0536b4969ea3bf97676333f970434e5cfa2c` |

Protected projected-output hashes:

| Path                                 | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `docs/conformance.md`                | `b334793aba47b475dd0f8090e6da9f73c0b2b0c75964e5562995f6deb144a7c2` |
| `docs/test262-report.jsonl`          | `21db3f9e84a17c79389945b879a6359b8a661a35a8b06a947322f53e2b6440cd` |
| `tools/test262/es2015-taxonomy.json` | `6f60af3b4416b537257cc7c3d418ed918978b7e14b1e5fc6567db9e379dc5908` |
| `tools/test262/upstream-subset.json` | `f7840957b181a3497eb3bb0eac349f08e54b7dd075276088652295fba1778a2b` |

Selection remains 20,492 paths across 60 groups. H0 remains 135 roots / 267
variants, with 40 complete-pass roots / 78 promoted variants and 95 reassigned
roots / 189 variants.

## Final changed paths

```text
.prettierignore
README.md
docs/conformance.md
docs/superpowers/plans/2026-08-19-test262-cross-realm-harness.md
docs/superpowers/specs/2026-08-19-test262-cross-realm-harness-design.md
docs/test262-report.jsonl
docs/testing.md
package.json
test/ci/es2015-cross-realm-test262.test.js
test/ci/es2015-object-function-test262.test.js
test/ci/es2015-syntax-test262.test.js
test/ci/full-contract.test.js
test/module-test262.test.js
test/node/es2015-provenance.test.js
test/node/es2015-taxonomy.test.js
test/node/repository-invariants.test.js
test/node/upstream-select.test.js
test/node/workflow-contract.test.js
test/suites.js
test/test262-async.test.js
test/test262-host-bindings.test.js
test/test262-runner.test.js
tools/test262/engine.js
tools/test262/es2015-audit.js
tools/test262/es2015-h0-baseline.json
tools/test262/es2015-h0-disposition.json
tools/test262/es2015-h0-owner-deltas.json
tools/test262/es2015-h0-owner-map.json
tools/test262/es2015-h0-paths.json
tools/test262/es2015-h0-promotion.json
tools/test262/es2015-provenance.json
tools/test262/es2015-taxonomy.json
tools/test262/runner.js
tools/test262/upstream-run.js
tools/test262/upstream-select.js
tools/test262/upstream-subset.json
types/host.d.ts
```

## Focused validation

Passed:

```text
TZ=UTC npm run test262:cross-realm
# 2 passed, 0 failed

TZ=UTC node test/run-node.js \
  test/test262-host-bindings.test.js \
  test/test262-runner.test.js \
  test/test262-async.test.js \
  test/module-test262.test.js \
  test/node/es2015-taxonomy.test.js \
  test/node/upstream-select.test.js \
  test/node/es2015-provenance.test.js \
  test/node/workflow-contract.test.js \
  test/node/repository-invariants.test.js
# 339 passed, 0 failed

npm run test:browser -- \
  test/test262-host-bindings.test.js \
  test/test262-runner.test.js \
  test/test262-async.test.js \
  test/module-test262.test.js

jsc -m -e '<targeted host/runner/async/module imports>'

TZ=UTC npm run test262:es2015:audit:check
TZ=UTC npm run test262:select:check
TZ=UTC npm run test262:es2015:provenance:check
npm run vendor:check
npm run ci:check
npm run typecheck
scoped ESLint
scoped Prettier
git diff --check
```

No broad/full Test262, `test262:upstream`, `test262:upstream:check`,
`ci:contract`, full Node, full Chromium, or full JSC suite was run.

## Concerns

No correctness concern remains in the requested local scope.

Operational constraint: default H0 audit checking now intentionally requires the
full Git history containing both `baseline.finalBaseCommit` (`99c439f2...`) and
the exact repaired consumer BASE (`144f49f7...`). Missing either taxonomy object
fails closed with an explicit diagnostic.

## PR #109 CI fix

The post-reconciliation CI failures had two accounting causes:

- the exclusion gate treated every passing exclusion as stale, even when its
  reviewed category was `host-dependent`;
- the focused syntax contract still counted the generated selection before the
  40 complete-pass H0 roots were added in
  `es2015/h0-cross-realm-passed`.

Strict RED was recorded first in `test/ci/exclusions-check.test.js`:

- a passing `host-dependent` fixture exited 1 instead of 0;
- the committed policy exposed exactly 18 passing `host-dependent` exclusions;
- the old committed-policy accounting expected 538 paths instead of 537.

The gate now retains passing `host-dependent` results in
`correctlyExcluded`. Passing results in each of `post-es5-semantics`,
`post-es5-builtin`, `post-es5-syntax`, and `engine-deviation` remain stale,
preserve deterministic result and stale-approval ordering, and force exit 1.
The committed policy is unchanged.

The focused syntax contract now records:

```text
12,434 baseline
+ 1,684 issue #25 expansion
+    11 generator roots
+    40 H0 complete-pass promotion roots
= 14,169 generated paths outside the T0 promotion group
```

It also asserts one exact `es2015/h0-cross-realm-passed` group containing 40
paths. The T0 promotion remains 6,323 roots, and the issue #25 and generator
counts are unchanged.

Focused GREEN validation:

```text
TZ=UTC node test/run-node.js test/ci/exclusions-check.test.js
# 15 passed, 0 failed

TZ=UTC npm run test262:exclusions:check
# 523 correctly excluded, 14 approved unverifiable, 0 unverifiable, 0 stale

TZ=UTC node test/run-node.js test/ci/es2015-syntax-test262.test.js
# 2 passed, 0 failed

TZ=UTC npm run test262:cross-realm
# 2 passed, 0 failed

TZ=UTC npm run test262:es2015:provenance:check
npm run typecheck
scoped ESLint
scoped Prettier
git diff --check
```

No broad/full Test262, full Node, browser, JSC, or `ci:contract` suite was run.
