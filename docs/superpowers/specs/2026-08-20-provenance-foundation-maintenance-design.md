# ES2015 Provenance Foundation Maintenance Design

## Goal

Repair the deterministic U* issue-body contract and add one persistent,
fail-closed `foundation-maintenance` range profile without changing guest
runtime behavior, taxonomy classifications, selection data, or any provenance
decision.

The maintenance pull request uses this exact marker:

```text
<!-- es2015-provenance-pr parent:T1 parent-issue:75 profile:foundation-maintenance base-ledger-sha256:56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc -->
```

## Body Contract

The shared renderer emits this exact sentence in every U0, UA, UB, UL,
UL1-UL4, US, and US1-US7 initial and final body:

```text
History, age, path/directory, and source/text similarity may prioritize review but can never decide edition.
```

The sentence replaces the narrower history-only statement. The U0 scope value
does not carry terminal punctuation because the renderer owns the final period.
Tests render all sixteen codes both without and with the authoritative issue
map, require the exact sentence, and reject any doubled period.

## Range Authority

Range authorization must not come from a profile introduced or broadened by
the range head.

For this first bootstrap only, the checker accepts a base when both identities
are exact:

- U0 squash commit:
  `8d75b48af2ee7ab04e7c5006980417227ec34568`
- canonical U0 provenance-manifest SHA-256:
  `ad3e55a061f1156fc267655ac8cb977f6a54f934cc56a5efa5689c7fc620ae04`

That exact base receives a compiled bootstrap maintenance policy. The head
manifest must then contain the same approved `foundation-maintenance` profile.
No other base lacking that profile is accepted.

After this pull request merges, the checker parses the canonical manifest from
the trusted base tree, verifies the fixed jsjs taxonomy baseline and immutable
2,312-root / 4,054-variant ledger identities, and uses that base manifest's
`foundation-maintenance` profile to authorize the range. A changed head
profile can affect only a later pull request after review and merge.

The existing `foundation` profile and all thirteen `decision:<CODE>` profiles
remain byte-for-byte unchanged. Foundation creation still requires a base
without the initialized manifest. Decision ranges still require an unchanged
manifest and exactly one complete reviewed fragment. Unknown profiles are
rejected rather than resolved from the head manifest.

## Maintenance Profile

The schema version remains 2 because no manifest object shape changes. The new
profile has `baseFoundation: "present"`, no required individual path, no
deletions, no decision fragment, and all thirteen decision fragments in
`emptyDecisionFragments`.

Its exact allowed paths are:

- `.github/workflows/ci.yml`
- `docs/conformance.md`
- `docs/superpowers/plans/2026-08-19-unknown-edition-provenance.md`
- `docs/superpowers/plans/2026-08-20-provenance-foundation-maintenance.md`
- `docs/superpowers/specs/2026-08-19-unknown-edition-provenance-design.md`
- `docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md`
- `docs/testing.md`
- `test/node/es2015-provenance.test.js`
- `test/node/workflow-contract.test.js`
- `tools/ci/pipeline.js`
- `tools/test262/es2015-provenance-check.js`
- every existing `tools/test262/es2015-provenance-decisions/<CODE>.json`
- `tools/test262/es2015-provenance.js`
- `tools/test262/es2015-provenance.json`

This list permits provenance foundation tooling, schema, tests, canonical
generated artifacts, workflow contract, and directly related documentation
only. It excludes `src/**`, `tools/test262/features.json`,
`tools/test262/upstream-subset.json`, taxonomy classification output, audit
output, package configuration, unrelated documentation, and every other path.
All ranges reject renames, copies, deletions, unknown statuses, repeated paths,
and an empty diff. Content validation requires every decision fragment to
remain canonical and empty, including fragments that are not changed.

The generated workflow command remains unchanged. It supplies the actual
pull-request base SHA, head SHA, event name, and full body; the checker derives
the unique profile from the marker.

## Testing

TDD starts with failing tests for:

- all sixteen initial and final bodies carrying the exact full prohibition;
- every rendered body containing no doubled period;
- the exact maintenance profile and unchanged foundation/decision profiles;
- an allowed bootstrap maintenance range;
- an allowed post-bootstrap range authorized by the base profile;
- forbidden `src`, feature, upstream-selection, taxonomy-output, non-empty
  fragment, rename, copy, delete, unknown marker/profile, and foundation-profile
  reuse ranges;
- bootstrap rejection for the wrong base commit or wrong U0 manifest bytes;
- proof that a broadened head profile cannot authorize a path absent from the
  trusted base profile; and
- unchanged workflow derivation from actual event base/head/body values.

Structural checks also retain zero decisions and the exact 2,312 / 4,054 path
and entry identities.

## Review and Release

Only the permitted focused Node suites and structural provenance/audit,
vendor, generated-CI, typecheck, lint, format, diff, and live
`foundation-maintenance` range checks run locally. Broad upstream, audit write,
`ci:contract`, browser, and JavaScriptCore commands remain prohibited locally.

Independent specification and quality/provenance reviews must clear all
Critical and Important findings. The pull request must pass the exact
`ci.yml` pull-request run and two clean pull-request CodeQL analyses at an
unchanged reviewed head. After squash merge, the exact main commit must pass
two clean CodeQL analyses with zero alerts, and origin/main bytes must match the
reviewed result.

---

## Prerequisite Amendment: Trusted Provenance Base Guard (Design Only)

### Status and boundary

This amendment designs, but does not implement, the prerequisite trusted-base
guard needed before the provenance schema-v3 correction. No workflow, checker,
test, generated manifest, taxonomy output, conformance output, or runtime byte
has been changed by this design phase.

The guard implementation must be authored against this exact trusted base:

- main commit:
  `1925873700c180fc38e7e020fc4b631c1866b082`
- schema-v2 provenance-manifest SHA-256:
  `f65f9a499acb92a933fedc5ee9197cc6a4c51ce30b5180cc741b23a93c9dfe92`
- range profile: the `foundation-maintenance` object parsed from that base
  manifest
- marker:

```text
<!-- es2015-provenance-pr parent:T1 parent-issue:75 profile:foundation-maintenance base-ledger-sha256:56a730c9db7732ac89c0bd455908f106e2a1c0205ec4fd707b8cb9be771175bc -->
```

Current main also contains `maintenance:issue77-lexical`, whose range authority
was introduced by the same HEAD it authorized. This guard prerequisite does
not remove, repair, use, or broaden that profile and does not change any
semantic or generated taxonomy output. The later schema-v3 correction owns
that work only after this guard is authoritative.

### Alternatives considered

1. **Recommended: one dedicated `pull_request_target` job in generated
   `ci.yml`.** GitHub loads the workflow from the base repository's default
   branch, the job explicitly checks out the event's full base SHA, fetches the
   full head SHA as inert Git objects, and executes only the base checker and
   its base local imports. This preserves one source of truth in
   `tools/ci/pipeline.js` and makes mutable HEAD incapable of replacing the
   authority used for the current range.
2. **Embed a second range checker in workflow shell or `github-script`.**
   Rejected because it duplicates the canonical checker, creates a second
   policy language, and can drift from manifest validation.
3. **Keep only `pull_request` and extract checker bytes from Git BASE.**
   Rejected because the workflow and job graph still come from mutable PR
   bytes. HEAD could remove, skip, rename, or weaken the gate before the base
   checker is reached.

The first approach is the only one that meets both trusted workflow-source and
single-checker requirements without a new workflow path.

### GitHub event and required-check semantics

The existing generated workflow adds:

```yaml
pull_request_target:
  types: [opened, synchronize, reopened, edited]
```

It must not add `paths`, `paths-ignore`, `branches`, or `branches-ignore`.
`edited` is mandatory because the authoritative marker lives in the PR body.
The lack of path filters ensures every PR reports the guard check, including a
neutral non-provenance range that the checker permits.

GitHub documents that `pull_request_target` loads workflow bytes and the
default checkout from the base repository's default branch and exposes the
default-branch commit through `GITHUB_SHA`. The job must therefore ignore
`GITHUB_SHA` for range identity and pass the explicit server-provided
`github.event.pull_request.base.sha` and
`github.event.pull_request.head.sha` to the checker.

GitHub associates the resulting check run with the PR head even though the job
executes in the default-branch context. The stable required job/check-run name
is:

```text
Provenance base guard
```

The expected Actions UI context is `CI / Provenance base guard`; repository
protection must select the exact context reported by the first live guard run
and, where supported, restrict it to the GitHub Actions app.

A skipped conditional job reports success. Therefore static names plus opposite
event conditions would be unsafe: a skipped guard in the ordinary
`pull_request` run could satisfy the guard requirement, and skipped build jobs
in the privileged run could satisfy ordinary CI requirements. The generator
must assign event-distinct display names:

- the guard is named `Provenance base guard` only on
  `pull_request_target`; on every other event its skipped name is
  `Provenance base guard (inactive)`;
- each existing job retains its current name on `push` and `pull_request`, but
  receives an `(inactive on pull_request_target)` suffix in the privileged
  event.

The guard also uses job-level concurrency keyed only by the server-provided PR
number, with `cancel-in-progress: true`. A body edit or synchronize event must
cancel an older guard before the older run can finish after newer range or
marker data and become the apparent current result.

Every existing job also receives the job-level condition
`github.event_name != 'pull_request_target'`. The guard receives
`github.event_name == 'pull_request_target'`. Thus no existing checkout,
dependency install, package hook, build, test, artifact action, or repository
script can run in the privileged event, while ordinary push and PR CI behavior
and names remain unchanged.

Relevant platform contracts:

- <https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target>
- <https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target>
- <https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks>

### Guard trust boundary and data flow

The dedicated job has no dependencies on other jobs and performs only these
operations:

1. Use the repository's existing full-SHA pin for `actions/checkout`, with
   `ref` set explicitly to `github.event.pull_request.base.sha`,
   `fetch-depth: 0`, `persist-credentials: false`, and `submodules: false`.
2. Use the existing full-SHA `actions/setup-node` pin for Node 20, without npm
   caching and without reading or installing project dependencies.
3. Pass the server-provided PR number and head SHA through step environment
   variables. A fixed shell command first requires the PR number to match
   `^[1-9][0-9]*$`, then fetches the base repository's advertised PR ref with:

   ```sh
   git fetch --no-tags --no-recurse-submodules origin \
     "+refs/pull/${PR_NUMBER}/head:refs/remotes/pull/${PR_NUMBER}/head"
   ```

   The command must then resolve both
   `refs/remotes/pull/${PR_NUMBER}/head^{commit}` and `FETCH_HEAD^{commit}` and
   require each result to equal the explicit event `HEAD_SHA`. Any invalid
   number, missing PR ref, or SHA mismatch fails the job before the checker.
   Raw `git fetch origin "$HEAD_SHA"` is forbidden because unadvertised
   object-ID fetch is not reliable for fork PRs. The workflow must never add,
   fetch from, or derive a remote URL from
   `github.event.pull_request.head.repo`; the only remote is the base checkout's
   fixed `origin`.
4. Keep the fetched head only in Git's object database. No checkout, reset,
   archive extraction, submodule operation, package operation, dynamic import,
   or command from that tree is permitted.
5. Run the checked-out base
   `tools/test262/es2015-provenance-check.js` with `--check-range`, explicit
   base and head environment variables, and `--pr-body-env`. Its imports,
   including `es2015-provenance.js` and `selection.js`, resolve from the base
   checkout only.

The checker may inspect HEAD solely through its existing inert Git interface:
full-SHA `rev-parse`, `merge-base`, NUL-delimited name/status `git diff`, and
`git show <sha>:<path>`. Existing behavior must continue to require two
different lowercase 40-hex SHAs, exact resolution of both identities, and the
base as merge-base ancestor of HEAD.

The PR body is untrusted data. Its Actions expression may appear only in an
`env` value, never in `run`, an action selector, a path, or a command-line
fragment. The fixed shell command references only quoted environment
variables. The PR number and head SHA are likewise data-only environment
values: the number is regex-validated before it enters the fixed refspec, and
the head SHA is used only for quoted equality checks and the checker's existing
full-SHA validation. The checker reads the full body from the named environment
variable and applies the exact one-marker parser. A neutral range with no
marker and no base-owned provenance path returns success; a provenance-owned
range without one authoritative marker fails closed.

### Permissions and privileged-event exclusions

The workflow retains top-level `contents: read`. The guard's explicit job
permissions are exactly:

```yaml
permissions:
  contents: read
  pull-requests: read
```

No permission is writable. The job references no repository, organization, or
environment secret and declares no environment. The ephemeral read-only
`GITHUB_TOKEN` is used only as required by the pinned trusted actions; checkout
does not persist credentials. The job performs no cache restore/save, artifact
download/upload, API write, comment, label, status write, or reusable workflow
call.

The implementation must never set checkout's `allow-unsafe-pr-checkout`, never
checkout `pull_request.head.sha`, and never execute a file or dependency from
the fetched head object. A later edit that adds any such behavior is a security
regression.

### Generated workflow and checker contracts

`tools/ci/pipeline.js` remains the only author of `.github/workflows/ci.yml`.
The data model and renderer may grow only enough to represent:

- job-level `if`;
- guard job concurrency;
- job-level permissions;
- event-distinct job display names;
- the custom no-install guard setup; and
- the `pull_request_target` trigger.

The committed workflow must remain byte-for-byte equal to
`renderWorkflowYaml(await loadCiPipeline())`. Existing jobs retain their current
steps, dependencies, action pins, commands, environments, and ordinary-event
names.

The base checker needs only the narrow event-contract extension that accepts
`GITHUB_EVENT_NAME` equal to `pull_request_target` in addition to
`pull_request` when `--pr-body-env` is used. It must continue rejecting every
other event name. No profile, allowlist, taxonomy identity, decision fragment,
or schema-v2 manifest byte changes for this guard.

`test/node/workflow-contract.test.js` must independently assert the committed
YAML, not merely the generator objects:

- both PR triggers have exactly
  `opened`, `synchronize`, `reopened`, and `edited`;
- neither PR trigger has path or branch filters;
- guard ID, stable active name, inactive name, event condition, runner,
  concurrency, permissions, pinned actions, explicit base ref, non-persisted
  credentials, disabled submodules, full-history checkout, no npm command,
  PR-number validation, advertised base-repository PR-ref fetch, fetched-ref and
  `FETCH_HEAD` equality with the event head SHA, checker command, and exact
  event-derived environment values;
- fork-shaped event identities in which the head repository differs from the
  base repository, proving the fetch still uses only the base checkout's
  `origin` and `refs/pull/<number>/head`;
- fail-closed behavior for a nonnumeric or zero PR number and for a fetched SHA
  that differs from the event head SHA;
- every existing job has its privileged-event exclusion and distinct inactive
  name while preserving its ordinary name and behavior;
- no guard step references secrets, HEAD checkout, unsafe checkout opt-out,
  npm, artifacts, caches, unpinned actions, a head-repository URL, or untrusted
  interpolation in `run`; and
- generated bytes still match the committed workflow.

Focused provenance-checker tests must cover accepted `pull_request` and
`pull_request_target` body-derived checks, rejection of all other event names,
full-SHA and ancestor failures, neutral unmarked ranges, provenance-owned
unmarked ranges, duplicate or malformed markers, and unchanged trusted-base
profile authorization. Broad Test262 remains prohibited.

### Exact BASE allowlist

The trusted base's schema-v2 `foundation-maintenance` profile permits all
expected implementation paths:

- `.github/workflows/ci.yml`
- `tools/ci/pipeline.js`
- `test/node/workflow-contract.test.js`
- `tools/test262/es2015-provenance-check.js`
- `test/node/es2015-provenance.test.js` only if the event-contract test belongs
  there
- this design
- its existing implementation plan
- the already allowlisted supporting conformance/testing documents only if
  directly necessary

No new path is needed. In particular, the guard must not touch `src/**`,
`package.json`, lockfiles, Test262 selections, taxonomy classifications, audit
evidence, reports, or any generated semantic output. HEAD must not add or
broaden an allowlist to authorize itself.

### Bootstrap, activation, and later v3 correction

This guard-creation PR cannot be protected by the new guard: the exact base
workflow does not yet contain the `pull_request_target` trigger. Its bootstrap
evidence is instead:

1. exact base commit and manifest identities above;
2. a clean live invocation of the exact BASE checker against the actual guard
   branch range and PR body;
3. independent Actions-security and provenance-spec review;
4. ordinary unprivileged PR CI and pull-request CodeQL; and
5. reviewed generated workflow bytes.

The guard becomes authoritative only after squash merge, byte verification on
the exact resulting main commit, and clean exact-main CodeQL. The first live
post-merge PR must prove that `Provenance base guard` is attached to its current
head, that the workflow source/default-branch SHA is the guard merge or a
reviewed descendant, and that the logged checker inputs equal the event base and
head SHAs without logging the PR body. Only then may repository protection
require the exact guard context.

The schema-v3 corrective PR must be re-authored from that guarded main commit.
It must show a fresh `pull_request_target` run sourced from BASE, pass the
required guard on its unchanged reviewed head, and retain ordinary PR
CI/CodeQL. No result from the guard-creation PR can substitute for that
post-merge evidence.
