/**
 * The project's CI pipeline, as data.
 *
 * `.github/workflows/ci.yml` is a generated artifact of this module, the same
 * way `vendor/` is a generated artifact of `tools/vendor/sync.js`: the workflow
 * file is never hand-authored YAML, it is the byte-for-byte output of
 * `renderWorkflowYaml`. That keeps "what CI runs" a single structured source any
 * test or reviewer can read, instead of two documents — a workflow file and a
 * description of it — that can drift apart.
 *
 * Three policies are encoded here rather than left to whoever edits the workflow
 * next:
 *
 * - **Least privilege.** The workflow grants `contents: read` at the top level.
 *   Every ordinary job inherits it unchanged, and the only job that declares its
 *   own permissions — the trusted provenance base guard — declares an explicit
 *   read-only set (`contents: read`, `pull-requests: read`), so a compromised
 *   action in any job cannot write to the repository.
 * - **Immutable actions.** Every `uses:` names a full commit SHA, because a tag
 *   like `v4` is a moving pointer the action's owner can repoint at any time.
 *   The human-readable version follows in a comment so the pin stays reviewable.
 * - **Event separation.** `pull_request_target` runs the workflow bytes and the
 *   default checkout of the base branch with the base repository's token, so no
 *   ordinary job — every one of which checks out, installs, and executes PR
 *   content — may run in it. Each ordinary job is excluded from that event and
 *   the trusted provenance base guard keeps its active steps gated to it.
 *   Because skipped jobs report success — and GitHub leaves an
 *   expression-valued job name raw when a job-level `if` skips the job — the
 *   display names are event-keyed too: a job skipped in the wrong event reports
 *   a distinct `(inactive...)` name that no required check context can match,
 *   and the guard job itself stays unconditional so that dynamic name is always
 *   evaluated.
 *
 * The upstream Test262 pin is not duplicated here: `loadCiPipeline` reads it
 * from `package.json`, so the workflow checks out exactly the revision the local
 * tooling pins, and moving the pin regenerates the workflow.
 *
 * Usage: `node tools/ci/pipeline.js` writes `.github/workflows/ci.yml` if it has
 * drifted from what this module renders; `node tools/ci/pipeline.js --check`
 * reports drift without writing. CI runs the latter in its own `ci-drift` job,
 * so a hand-edited workflow fails the build instead of quietly taking effect.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { COVERAGE_DOCUMENT_FILE } from '../test262/coverage.js';

/**
 * @typedef {{
 *   name: string,
 *   if?: string,
 *   uses?: string,
 *   with?: Readonly<Record<string, string>>,
 *   run?: string,
 *   env?: Readonly<Record<string, string>>,
 * }} WorkflowStep
 *
 * @typedef {{
 *   id: string,
 *   name: string,
 *   if?: string,
 *   runsOn?: string,
 *   timeoutMinutes?: number,
 *   permissions?: Readonly<Record<string, string>>,
 *   concurrency?: Readonly<{ group: string, cancelInProgress: boolean }>,
 *   needs: readonly string[],
 *   steps: readonly WorkflowStep[],
 * }} WorkflowJob
 *
 * @typedef {{ action: string, version: string, sha: string }} ActionPin
 *
 * @typedef {{
 *   repository: string,
 *   revision: string,
 *   checkoutPath: string,
 * }} Test262Pin
 */

const REPOSITORY_ROOT = new URL('../../', import.meta.url);

/** Repository-relative path to the generated workflow. */
export const WORKFLOW_FILE = '.github/workflows/ci.yml';

/** The Node version every job runs on. */
export const NODE_VERSION = '20';

/**
 * Where the upstream Test262 run writes its JSON-lines report. The file is
 * committed — it is the project's detailed conformance report, kept out of
 * docs/conformance.md so the conformance document can stay a summary — and CI
 * uploads this exact path as an artifact, including on failure, which is when
 * the per-test records matter most. The constant is shared rather than spelled
 * twice.
 */
export const TEST262_REPORT_FILE = 'docs/test262-report.jsonl';

export { COVERAGE_DOCUMENT_FILE };

/**
 * The exact process environment required by broad pinned Test262 runs.
 *
 * This is Node tooling policy, not engine/runtime policy: keeping it here lets
 * the generated workflow, local CI contract, and diagnostics share one value
 * without introducing host assumptions into portable engine modules.
 */
export const TEST262_UPSTREAM_ENVIRONMENT = Object.freeze({
  NODE_OPTIONS: '--max-old-space-size=4096',
  TZ: 'UTC',
});

/**
 * Preserves the full contract's UTC baseline for every script and adds the
 * authoritative heap allowance only for scripts that execute the broad run.
 *
 * @param {string} script
 * @param {Readonly<Record<string, string | undefined>>} environment
 * @returns {Readonly<Record<string, string | undefined>>}
 */
export function environmentForTest262NpmScript(script, environment) {
  const utcEnvironment = {
    ...environment,
    TZ: TEST262_UPSTREAM_ENVIRONMENT.TZ,
  };

  if (script !== 'test262:upstream' && script !== 'test262:upstream:check') {
    return utcEnvironment;
  }

  return { ...utcEnvironment, ...TEST262_UPSTREAM_ENVIRONMENT };
}

/**
 * Formats the copy-pasteable broad command used in diagnostics and docs.
 *
 * @param {string} [script]
 * @returns {string}
 */
export function formatTest262UpstreamCommand(script = 'test262:upstream') {
  return `${Object.entries(TEST262_UPSTREAM_ENVIRONMENT)
    .map(([name, value]) => `${name}=${value}`)
    .join(' ')} npm run ${script}`;
}

/**
 * The command that fails CI when the committed report or the coverage
 * document's generated block no longer matches what the run just produced. It
 * follows the run in the same job, so it compares a freshly written tree
 * against the commit rather than re-running a suite that has already run.
 *
 * `git diff` alone would not be enough: it compares the working tree against the
 * index and says nothing at all about a path git does not track, so a report
 * that was never committed — one the run itself had just written — would look
 * permanently clean. `ls-files --error-unmatch` fails on exactly that case.
 */
export const TEST262_REPORT_DRIFT_COMMAND = [
  `git ls-files --error-unmatch ${TEST262_REPORT_FILE} ${COVERAGE_DOCUMENT_FILE} > /dev/null`,
  `git diff --exit-code -- ${TEST262_REPORT_FILE} ${COVERAGE_DOCUMENT_FILE}`,
].join(' && ');

/**
 * The exact command CI uses to install a browser. Playwright's headless shell is
 * a separate download from full Chromium, so the flags matter: installing one
 * and launching the other is how a browser job ends up silently skipping.
 */
export const BROWSER_INSTALL_COMMAND =
  'npx playwright install --with-deps --only-shell chromium';

/**
 * Ubuntu Noble's JavaScriptCoreGTK shell package provides the unversioned
 * `/usr/bin/jsc` executable directly. Keep the package command and executable
 * check separate so the workflow proves the package's contract without
 * manufacturing a version-specific symlink.
 */
export const JSC_INSTALL_COMMAND =
  'sudo apt-get update && sudo apt-get install --yes libjavascriptcoregtk-bin';

/** The executable supplied by `JSC_INSTALL_COMMAND` on Ubuntu Noble. */
export const JSC_EXECUTABLE_CHECK = 'test -x /usr/bin/jsc';

/** The runner every ordinary job uses. */
export const DEFAULT_RUNNER = 'ubuntu-latest';

/**
 * The privileged event. It runs the base branch's workflow bytes with a token
 * scoped to the base repository, so only the trusted provenance base guard may
 * run in it — see the module comment's event-separation policy.
 */
export const PRIVILEGED_EVENT = 'pull_request_target';

/** Excludes an ordinary job from the privileged event. */
export const ORDINARY_EVENT_CONDITION = `github.event_name != '${PRIVILEGED_EVENT}'`;

/** Restricts the guard to the privileged event. */
export const GUARD_EVENT_CONDITION = `github.event_name == '${PRIVILEGED_EVENT}'`;

/** The guard's job id, and the check-run context branch protection selects. */
export const GUARD_JOB_ID = 'provenance-base-guard';
export const GUARD_ACTIVE_NAME = 'Provenance base guard';

/**
 * The canonical target the guard is authoritative for. A PR retargeted at
 * another base repository or branch fails these checks before the job reads any
 * repository content, so a fork or stacked branch can never obtain a passing
 * active guard for a range the guard did not actually validate.
 */
export const GUARD_CANONICAL_REPOSITORY = 'yoonbuck/jsjs';
export const GUARD_CANONICAL_BASE_REF = 'main';

/** Ubuntu Noble, pinned rather than `latest`, and a five-minute ceiling. */
export const GUARD_RUNNER = 'ubuntu-24.04';
export const GUARD_TIMEOUT_MINUTES = 5;

/**
 * The guard's own least-privilege grant. It reads repository content and pull
 * request metadata and writes nothing; no step may widen this.
 */
export const GUARD_PERMISSIONS = Object.freeze({
  contents: 'read',
  'pull-requests': 'read',
});

/**
 * A body edit or a new push must cancel the older guard, or a run started
 * against stale range/marker data could finish last and look like the current
 * result. The group is the fixed prefix plus the server-provided PR number.
 */
export const GUARD_CONCURRENCY = Object.freeze({
  group: `${GUARD_JOB_ID}-\${{ github.event.pull_request.number }}`,
  cancelInProgress: true,
});

/**
 * Every guard identity value the server provides, mapped to the step that
 * consumes it. Nothing is job-level: the untrusted PR body reaches only the
 * checker, and no PR-controlled string ever reaches an action input, a path, or
 * a command line.
 */
const GUARD_BASE_REPOSITORY_VALUE =
  '${{ github.event.pull_request.base.repo.full_name }}';
const GUARD_WORKFLOW_REPOSITORY_VALUE = '${{ github.repository }}';
const GUARD_BASE_REF_VALUE = '${{ github.event.pull_request.base.ref }}';
const GUARD_BASE_SHA_VALUE = '${{ github.event.pull_request.base.sha }}';
const GUARD_HEAD_SHA_VALUE = '${{ github.event.pull_request.head.sha }}';
const GUARD_PR_NUMBER_VALUE = '${{ github.event.pull_request.number }}';
const GUARD_PR_BODY_VALUE = '${{ github.event.pull_request.body }}';

/**
 * The fixed canonical-target check, run before any checkout or fetch. It is a
 * `printf`/`grep -Eq` pipeline rather than shell bracket syntax so the whole
 * command stays a YAML plain scalar the renderer can emit byte-for-byte.
 */
export const GUARD_VALIDATE_COMMAND = [
  `printf '%s' "$BASE_REPOSITORY" | grep -Eq '^${GUARD_CANONICAL_REPOSITORY}$'`,
  `printf '%s' "$WORKFLOW_REPOSITORY" | grep -Eq '^${GUARD_CANONICAL_REPOSITORY}$'`,
  `printf '%s' "$BASE_REF" | grep -Eq '^${GUARD_CANONICAL_BASE_REF}$'`,
  `printf '%s' "$BASE_SHA" | grep -Eq '^[0-9a-f]{40}$'`,
  `printf '%s' "$HEAD_SHA" | grep -Eq '^[0-9a-f]{40}$'`,
  `printf '%s' "$PR_NUMBER" | grep -Eq '^[1-9][0-9]*$'`,
].join(' && ');

/**
 * Proves the worktree holding the checker really is the server-declared base
 * commit, not an action fallback or some other ref, before Node is installed or
 * anything is fetched.
 */
export const GUARD_CHECKOUT_ATTEST_COMMAND =
  'test "$(git rev-parse --verify \'HEAD^{commit}\')" = "$BASE_SHA"';

/**
 * Fetches the live canonical target branch through the checked-out base
 * repository's own `origin`, into a dedicated remote-tracking ref. The guard
 * never checks out this ref; it remains inert data for attestation only.
 */
export const GUARD_FETCH_BASE_COMMAND =
  `git fetch --no-tags --no-recurse-submodules origin +refs/heads/${GUARD_CANONICAL_BASE_REF}:refs/remotes/origin/provenance-target-main`;

/**
 * Requires the live target branch and the checked-out base checkout to both
 * still equal the event BASE SHA. If main advanced after the event, or if the
 * checkout drifted off the event base commit, the guard fails and must rerun.
 */
export const GUARD_ATTEST_BASE_COMMAND = [
  'test "$(git rev-parse --verify \'refs/remotes/origin/provenance-target-main^{commit}\')" = "$BASE_SHA"',
  'test "$(git rev-parse --verify \'HEAD^{commit}\')" = "$BASE_SHA"',
].join(' && ');

/**
 * The only fetch the guard performs, through the base checkout's own `origin`.
 * An unadvertised object-id fetch (`git fetch origin "$HEAD_SHA"`) is not
 * reliable for fork PRs, and adding the head repository as a remote would hand
 * an attacker-controlled URL to the privileged job, so neither is permitted.
 */
export const GUARD_FETCH_COMMAND =
  'git fetch --no-tags --no-recurse-submodules origin "+refs/pull/${PR_NUMBER}/head:refs/remotes/pull/${PR_NUMBER}/head"';

/**
 * Requires the advertised ref and `FETCH_HEAD` to both resolve to the event's
 * head commit, so the objects the checker inspects are exactly the range the
 * server declared. The fetched head stays inert — never checked out, extracted,
 * or executed.
 */
export const GUARD_FETCH_ATTEST_COMMAND = [
  'test "$(git rev-parse --verify "refs/remotes/pull/${PR_NUMBER}/head^{commit}")" = "$HEAD_SHA"',
  'test "$(git rev-parse --verify \'FETCH_HEAD^{commit}\')" = "$HEAD_SHA"',
].join(' && ');

/**
 * The base checkout's own checker, with explicit event identities and the PR
 * body read from the environment rather than spliced into the command line.
 */
export const GUARD_CHECKER_COMMAND =
  'node tools/test262/es2015-provenance-check.js --check-range --base="$BASE_SHA" --head="$HEAD_SHA" --pr-body-env=PR_BODY';

const GUARD_INACTIVE_STEP_NAME = 'Keep the inactive guard context distinct';
const GUARD_INACTIVE_COMMAND =
  'test "$GITHUB_EVENT_NAME" != pull_request_target';

/**
 * Every action the workflow uses, pinned to an immutable commit SHA. The
 * `version` is the release tag that SHA belongs to, kept so a reader can tell at
 * a glance what is pinned and a bump reviews as "v7.0.0 -> v7.0.1" rather than
 * as forty opaque characters.
 *
 * @type {readonly ActionPin[]}
 */
export const ACTION_PINS = Object.freeze([
  Object.freeze({
    action: 'actions/checkout',
    version: 'v7.0.1',
    sha: '3d3c42e5aac5ba805825da76410c181273ba90b1',
  }),
  Object.freeze({
    action: 'actions/setup-node',
    version: 'v7.0.0',
    sha: '820762786026740c76f36085b0efc47a31fe5020',
  }),
  Object.freeze({
    action: 'actions/upload-artifact',
    version: 'v7.0.1',
    sha: '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
  }),
]);

/**
 * @param {string} action
 * @returns {string}
 */
function pinned(action) {
  const pin = ACTION_PINS.find((candidate) => candidate.action === action);

  if (pin === undefined) {
    throw new Error(`${action} has no pinned commit SHA`);
  }

  return `${pin.action}@${pin.sha} # ${pin.version}`;
}

/**
 * @param {string} name
 * @param {string} run
 * @param {Readonly<Record<string, string>>} [env]
 * @param {string} [condition]
 * @returns {WorkflowStep}
 */
function runStep(name, run, env, condition) {
  return Object.freeze({
    name,
    ...(condition === undefined ? {} : { if: condition }),
    run,
    ...(env === undefined ? {} : { env: Object.freeze({ ...env }) }),
  });
}

/**
 * @param {string} name
 * @param {string} action
 * @param {Readonly<Record<string, string>>} [inputs]
 * @param {string} [condition]
 * @returns {WorkflowStep}
 */
function usesStep(name, action, inputs, condition) {
  return Object.freeze({
    name,
    ...(condition === undefined ? {} : { if: condition }),
    uses: pinned(action),
    ...(inputs === undefined ? {} : { with: Object.freeze({ ...inputs }) }),
  });
}

/**
 * The setup every job repeats before its own work.
 *
 * @returns {WorkflowStep[]}
 */
function setupSteps() {
  return [
    usesStep('Check out the project', 'actions/checkout', {
      'persist-credentials': 'false',
    }),
    usesStep('Set up Node', 'actions/setup-node', {
      'node-version': NODE_VERSION,
      cache: 'npm',
    }),
    runStep('Install dependencies', 'npm ci'),
  ];
}

/**
 * Builds the `${{ <condition> && '<active>' || '<inactive>' }}` display name a
 * job reports. `job.name` supports the `github` context, and a job skipped by
 * its own `if` still reports success, so a static name would let a skipped job
 * satisfy a required check it never ran. Selecting the name from
 * `github.event_name` — and nothing else — gives the skipped rendering a
 * distinct `(inactive...)` name no required context can match.
 *
 * @param {string} condition
 * @param {string} activeName
 * @param {string} inactiveName
 * @returns {string}
 */
function eventKeyedName(condition, activeName, inactiveName) {
  return `\${{ ${condition} && '${activeName}' || '${inactiveName}' }}`;
}

/**
 * @param {string} name
 * @returns {string}
 */
function ordinaryJobName(name) {
  return eventKeyedName(
    ORDINARY_EVENT_CONDITION,
    name,
    `${name} (inactive on ${PRIVILEGED_EVENT})`,
  );
}

/**
 * An ordinary push/pull_request job: it keeps its exact name, steps, and
 * dependencies on those events and is excluded from the privileged one.
 *
 * @param {string} id
 * @param {string} name
 * @param {readonly WorkflowStep[]} steps
 * @param {readonly string[]} [needs]
 * @returns {WorkflowJob}
 */
function ordinaryJob(id, name, steps, needs = []) {
  return Object.freeze({
    id,
    name: ordinaryJobName(name),
    if: ORDINARY_EVENT_CONDITION,
    needs: Object.freeze([...needs]),
    steps: Object.freeze([...steps]),
  });
}

/**
 * @param {string} id
 * @param {string} name
 * @param {readonly WorkflowStep[]} ownSteps
 * @param {readonly string[]} [needs]
 * @returns {WorkflowJob}
 */
function job(id, name, ownSteps, needs = []) {
  return ordinaryJob(id, name, [...setupSteps(), ...ownSteps], needs);
}

/**
 * The trusted provenance base guard: the only place the provenance range is
 * checked by code the PR cannot edit.
 *
 * `pull_request_target` runs the base branch's workflow bytes, so this job's
 * checker, its imports, and its command line all come from the base checkout.
 * The job stays unconditional so GitHub always evaluates its event-keyed name;
 * the active steps are gated individually to `pull_request_target`, and the
 * inactive path is one constant no-op step on other events. The live target
 * branch and the PR head are fetched only as inert Git objects through the base
 * checkout's own `origin`, and are never checked out, extracted, installed, or
 * executed. Every server value reaches a step as a quoted environment variable,
 * never as an action input or a command-line fragment, and the untrusted PR
 * body reaches only the checker.
 *
 * @returns {WorkflowJob}
 */
function createProvenanceBaseGuardJob() {
  return Object.freeze({
    id: GUARD_JOB_ID,
    name: eventKeyedName(
      GUARD_EVENT_CONDITION,
      GUARD_ACTIVE_NAME,
      `${GUARD_ACTIVE_NAME} (inactive)`,
    ),
    runsOn: GUARD_RUNNER,
    timeoutMinutes: GUARD_TIMEOUT_MINUTES,
    permissions: GUARD_PERMISSIONS,
    concurrency: GUARD_CONCURRENCY,
    needs: Object.freeze([]),
    steps: Object.freeze([
      runStep(
        'Validate the canonical guard target',
        GUARD_VALIDATE_COMMAND,
        {
          BASE_REPOSITORY: GUARD_BASE_REPOSITORY_VALUE,
          WORKFLOW_REPOSITORY: GUARD_WORKFLOW_REPOSITORY_VALUE,
          BASE_REF: GUARD_BASE_REF_VALUE,
          BASE_SHA: GUARD_BASE_SHA_VALUE,
          HEAD_SHA: GUARD_HEAD_SHA_VALUE,
          PR_NUMBER: GUARD_PR_NUMBER_VALUE,
        },
        GUARD_EVENT_CONDITION,
      ),
      usesStep('Check out the event base commit', 'actions/checkout', {
        ref: GUARD_BASE_SHA_VALUE,
        'fetch-depth': '0',
        'persist-credentials': 'false',
        submodules: 'false',
      }, GUARD_EVENT_CONDITION),
      runStep(
        'Attest the checked-out base commit',
        GUARD_CHECKOUT_ATTEST_COMMAND,
        { BASE_SHA: GUARD_BASE_SHA_VALUE },
        GUARD_EVENT_CONDITION,
      ),
      usesStep(
        'Set up Node',
        'actions/setup-node',
        {
          'node-version': NODE_VERSION,
        },
        GUARD_EVENT_CONDITION,
      ),
      runStep(
        'Fetch the current target branch',
        GUARD_FETCH_BASE_COMMAND,
        undefined,
        GUARD_EVENT_CONDITION,
      ),
      runStep(
        'Attest the live target branch',
        GUARD_ATTEST_BASE_COMMAND,
        { BASE_SHA: GUARD_BASE_SHA_VALUE },
        GUARD_EVENT_CONDITION,
      ),
      runStep(
        'Fetch the advertised pull request ref',
        GUARD_FETCH_COMMAND,
        {
          PR_NUMBER: GUARD_PR_NUMBER_VALUE,
        },
        GUARD_EVENT_CONDITION,
      ),
      runStep('Attest the fetched head commit', GUARD_FETCH_ATTEST_COMMAND, {
        PR_NUMBER: GUARD_PR_NUMBER_VALUE,
        HEAD_SHA: GUARD_HEAD_SHA_VALUE,
      }, GUARD_EVENT_CONDITION),
      runStep(
        'Check the trusted-base provenance range',
        GUARD_CHECKER_COMMAND,
        {
          BASE_SHA: GUARD_BASE_SHA_VALUE,
          HEAD_SHA: GUARD_HEAD_SHA_VALUE,
          PR_BODY: GUARD_PR_BODY_VALUE,
          TZ: 'UTC',
        },
        GUARD_EVENT_CONDITION,
      ),
      runStep(
        GUARD_INACTIVE_STEP_NAME,
        GUARD_INACTIVE_COMMAND,
        undefined,
        ORDINARY_EVENT_CONDITION,
      ),
    ]),
  });
}

/**
 * Turns a clone URL into the `owner/name` slug `actions/checkout` expects, so
 * the workflow and the local tooling can share one pinned repository value.
 *
 * @param {string} repository
 * @returns {string}
 */
export function toGithubSlug(repository) {
  const match = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/.exec(repository);

  if (match === null) {
    throw new Error(`Not a GitHub repository URL: ${repository}`);
  }

  return match[1];
}

/**
 * The twelve ordinary checks CI runs as distinct jobs, plus the trusted
 * provenance base guard whose active steps run only in the privileged event.
 *
 * `ci-drift` runs `ci:check`, which is what makes this module the source of
 * truth rather than a convention: a hand-edited workflow fails CI. `vendor`
 * gates the test jobs because every `npm ci` already runs vendor sync through
 * the `prepare` lifecycle script, so a dedicated read-only `vendor:check` is
 * what actually verifies the vendored parser build before anything else spends
 * CI time.
 *
 * The three Test262 jobs are deliberately separate. `test262-fixtures` runs the
 * local hand-written fixture tree, which exercises the runner's semantics.
 * `test262-es2015-release` checks out the exact pinned tree for the focused
 * Promise, generator, static-module, object/function, and syntax suites. It
 * never runs broad selection or writes broad report artifacts.
 * `test262-upstream` checks out the real `tc39/test262` tree at exactly the
 * pinned revision and runs the curated subset against it, which exercises the
 * engine — and uploads its report even on failure, because a red conformance run
 * is precisely when the per-test records are worth reading. That run also
 * rewrites the two generated artifacts it owns, so the job compares the working
 * tree against the commit afterwards: a stale committed report fails CI the same
 * way a hand-edited workflow does.
 *
 * `test262-upstream`'s `Check provenance PR range` step stays exactly as it is,
 * scoped to `pull_request`: it is defense in depth against an accidental
 * omission, not a trust boundary, because in that event the checker it runs
 * comes from the PR's own tree. The authoritative range check is the guard.
 *
 * @param {Test262Pin} test262
 * @returns {readonly WorkflowJob[]}
 */
export function createCiJobs(test262) {
  const upstreamSlug = toGithubSlug(test262.repository);

  return Object.freeze([
    job('ci-drift', 'Workflow drift', [
      runStep('Check the generated workflow', 'npm run ci:check'),
    ]),
    job('vendor', 'Vendor integrity', [
      runStep('Check vendored dependencies', 'npm run vendor:check'),
    ]),
    job('format', 'Formatting', [
      runStep('Check formatting', 'npm run format'),
    ]),
    job('lint', 'Lint', [runStep('Lint', 'npm run lint')]),
    job('typecheck', 'Type check', [
      runStep('Type check', 'npm run typecheck'),
    ]),
    job(
      'test-node',
      'Node tests',
      [runStep('Run Node suites', 'npm run test:node')],
      ['vendor'],
    ),
    job(
      'test-browser',
      'Browser tests',
      [
        runStep('Install the headless browser', BROWSER_INSTALL_COMMAND),
        runStep('Run browser suites', 'npm run test:browser'),
      ],
      ['vendor'],
    ),
    job(
      'test-jsc',
      'JavaScriptCore tests',
      [
        runStep('Install the JavaScriptCore shell', JSC_INSTALL_COMMAND),
        runStep('Verify the JavaScriptCore shell', JSC_EXECUTABLE_CHECK),
        runStep('Run JavaScriptCore suites', 'npm run test:jsc'),
      ],
      ['vendor'],
    ),
    job(
      'test262-fixtures',
      'Test262 fixtures',
      [runStep('Run the local fixture suite', 'npm run test262:fixtures')],
      ['vendor'],
    ),
    ordinaryJob(
      'test262-es2015-release',
      'Pinned Test262 ES2015 focused suites',
      [
        usesStep('Check out the project', 'actions/checkout', {
          'persist-credentials': 'false',
        }),
        usesStep('Check out the pinned Test262 tree', 'actions/checkout', {
          repository: upstreamSlug,
          ref: test262.revision,
          path: test262.checkoutPath,
          'persist-credentials': 'false',
        }),
        usesStep('Set up Node', 'actions/setup-node', {
          'node-version': NODE_VERSION,
          cache: 'npm',
        }),
        runStep('Install dependencies', 'npm ci'),
        runStep(
          'Run focused ES2015 Test262 suites',
          'npm run test262:es2015-release',
          {
            TZ: 'UTC',
          },
        ),
      ],
      ['vendor'],
    ),
    job(
      'benchmark-smoke',
      'Benchmark smoke',
      [runStep('Run benchmark correctness smoke', 'npm run benchmark:smoke')],
      ['vendor'],
    ),
    ordinaryJob(
      'test262-upstream',
      'Pinned Test262 subset',
      [
        usesStep('Check out the project', 'actions/checkout', {
          'persist-credentials': 'false',
          'fetch-depth': '0',
        }),
        usesStep('Check out the pinned Test262 tree', 'actions/checkout', {
          repository: upstreamSlug,
          ref: test262.revision,
          path: test262.checkoutPath,
          'persist-credentials': 'false',
        }),
        usesStep('Set up Node', 'actions/setup-node', {
          'node-version': NODE_VERSION,
          cache: 'npm',
        }),
        runStep('Install dependencies', 'npm ci'),
        runStep(
          'Check provenance PR range',
          'node tools/test262/es2015-provenance-check.js --check-range --base="$ES2015_PROVENANCE_BASE_SHA" --head="$ES2015_PROVENANCE_HEAD_SHA" --pr-body-env=ES2015_PROVENANCE_PR_BODY',
          {
            ES2015_PROVENANCE_BASE_SHA:
              '${{ github.event.pull_request.base.sha }}',
            ES2015_PROVENANCE_HEAD_SHA:
              '${{ github.event.pull_request.head.sha }}',
            ES2015_PROVENANCE_PR_BODY: '${{ github.event.pull_request.body }}',
            TZ: 'UTC',
          },
          "github.event_name == 'pull_request'",
        ),
        runStep(
          'Check unknown-edition provenance',
          'npm run test262:es2015:provenance:check',
          {
            TZ: 'UTC',
          },
        ),
        runStep(
          'Check the ES2015 taxonomy and exact promotion',
          'npm run test262:es2015:audit:check',
          {
            TZ: 'UTC',
          },
        ),
        runStep(
          'Check the ES5 selection is current',
          'npm run test262:select:check',
        ),
        runStep(
          'Remove the committed Test262 report',
          `rm -f ${TEST262_REPORT_FILE}`,
        ),
        runStep(
          'Run the pinned Test262 subset',
          'npm run test262:upstream',
          TEST262_UPSTREAM_ENVIRONMENT,
        ),
        runStep(
          'Check for stale exclusions',
          'npm run test262:exclusions:check',
        ),
        runStep(
          'Check the generated report is current',
          TEST262_REPORT_DRIFT_COMMAND,
        ),
        usesStep(
          'Publish the Test262 report',
          'actions/upload-artifact',
          {
            name: 'test262-upstream-report',
            path: TEST262_REPORT_FILE,
            'if-no-files-found': 'error',
          },
          `always() && hashFiles('${TEST262_REPORT_FILE}') != ''`,
        ),
      ],
      ['vendor'],
    ),
    createProvenanceBaseGuardJob(),
  ]);
}

/**
 * Reads the checked-in upstream pin and builds the pipeline from it, so the
 * generated workflow can never name a revision `package.json` does not.
 *
 * @returns {Promise<{ jobs: readonly WorkflowJob[], test262: Test262Pin }>}
 */
export async function loadCiPipeline() {
  const manifest = JSON.parse(
    await readFile(new URL('package.json', REPOSITORY_ROOT), 'utf8'),
  );
  const test262 = manifest.test262;

  if (
    test262 === undefined ||
    typeof test262.repository !== 'string' ||
    typeof test262.revision !== 'string' ||
    typeof test262.checkoutPath !== 'string'
  ) {
    throw new Error('package.json must pin the upstream Test262 tree');
  }

  return { jobs: createCiJobs(test262), test262 };
}

/**
 * The YAML characters that are plain-scalar indicators in first position. A
 * value starting with one of them would need quoting, and quoting a shell
 * command or a `${{ }}` expression is exactly where a hand edit silently
 * changes what the runner executes.
 */
const PLAIN_SCALAR_INDICATORS = new Set([
  '-',
  '?',
  ':',
  ',',
  '[',
  ']',
  '{',
  '}',
  '#',
  '&',
  '*',
  '!',
  '|',
  '>',
  "'",
  '"',
  '%',
  '@',
  '`',
]);

/**
 * Rejects any value this renderer would emit unquoted that YAML would not read
 * back byte-for-byte. The renderer writes job names, step names, and `run`
 * commands as bare plain scalars, so "what the generator holds" and "what a
 * parser gives the runner" have to be the same string — a stray colon-space,
 * trailing colon, ` #`, line break, or leading indicator would silently retype
 * or truncate the value instead of failing the build.
 *
 * @param {string} value
 * @param {string} description
 * @returns {string}
 */
function plainScalar(value, description) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${description} must be a non-empty string`);
  }

  /** @type {readonly [boolean, string][]} */
  const violations = [
    [/[\r\n]/.test(value), 'must not contain a line break'],
    [value !== value.trim(), 'must not have leading or trailing whitespace'],
    [value.endsWith(':'), 'must not end with a colon'],
    [value.includes(': '), 'must not contain a colon followed by a space'],
    [value.includes(' #'), 'must not contain a space followed by #'],
    [
      PLAIN_SCALAR_INDICATORS.has(value[0]),
      'must not begin with a YAML plain-scalar indicator',
    ],
  ];

  for (const [violated, requirement] of violations) {
    if (violated) {
      throw new Error(
        `${description} ${requirement}: ${JSON.stringify(value)}`,
      );
    }
  }

  return value;
}

/**
 * @param {readonly WorkflowJob[]} jobs
 * @returns {string}
 */
export function renderWorkflowYaml(jobs) {
  const lines = [
    '# Generated by tools/ci/pipeline.js — do not hand edit.',
    '# Regenerate with `npm run ci:generate`; verify with `npm run ci:check`.',
    'name: CI',
    '',
    'on:',
    '  push:',
    '    branches: [main]',
    '  pull_request:',
    '    types: [opened, synchronize, reopened, edited]',
    // Filter-free on purpose: every pull request must report the guard check,
    // including one whose range the checker neutrally permits, or a required
    // context would stay pending forever on the PRs it does not match.
    `  ${PRIVILEGED_EVENT}:`,
    '    types: [opened, synchronize, reopened, edited]',
    '',
    '# Least privilege: no job in this workflow writes to the repository.',
    'permissions:',
    '  contents: read',
    '',
    'jobs:',
  ];

  jobs.forEach((workflowJob, index) => {
    lines.push(`  ${workflowJob.id}:`);
    lines.push(
      `    name: ${plainScalar(workflowJob.name, `job ${workflowJob.id} name`)}`,
    );

    if (workflowJob.if !== undefined) {
      lines.push(`    if: ${workflowJob.if}`);
    }

    lines.push(`    runs-on: ${workflowJob.runsOn ?? DEFAULT_RUNNER}`);

    if (workflowJob.timeoutMinutes !== undefined) {
      lines.push(`    timeout-minutes: ${workflowJob.timeoutMinutes}`);
    }

    if (workflowJob.permissions !== undefined) {
      lines.push('    permissions:');

      for (const [scope, level] of Object.entries(workflowJob.permissions)) {
        lines.push(`      ${scope}: ${level}`);
      }
    }

    if (workflowJob.concurrency !== undefined) {
      lines.push('    concurrency:');
      lines.push(`      group: ${workflowJob.concurrency.group}`);
      lines.push(
        `      cancel-in-progress: ${workflowJob.concurrency.cancelInProgress}`,
      );
    }

    if (workflowJob.needs.length > 0) {
      lines.push(`    needs: [${workflowJob.needs.join(', ')}]`);
    }

    lines.push('    steps:');

    for (const workflowStep of workflowJob.steps) {
      lines.push(...renderStep(workflowJob.id, workflowStep));
    }

    if (index < jobs.length - 1) {
      lines.push('');
    }
  });

  return `${lines.join('\n')}\n`;
}

/**
 * @param {string} jobId
 * @param {WorkflowStep} workflowStep
 * @returns {string[]}
 */
function renderStep(jobId, workflowStep) {
  const stepName = plainScalar(
    workflowStep.name,
    `${jobId} step name "${workflowStep.name}"`,
  );
  const lines = [`      - name: ${stepName}`];

  if (workflowStep.if !== undefined) {
    lines.push(`        if: ${workflowStep.if}`);
  }

  if (workflowStep.uses !== undefined) {
    lines.push(`        uses: ${workflowStep.uses}`);
  }

  if (workflowStep.run !== undefined) {
    lines.push(
      `        run: ${plainScalar(workflowStep.run, `${jobId} step "${stepName}" run`)}`,
    );
  }

  if (workflowStep.with !== undefined) {
    lines.push('        with:');

    for (const [key, value] of Object.entries(workflowStep.with)) {
      lines.push(`          ${key}: '${value}'`);
    }
  }

  if (workflowStep.env !== undefined) {
    lines.push('        env:');

    for (const [key, value] of Object.entries(workflowStep.env)) {
      lines.push(`          ${key}: '${value}'`);
    }
  }

  return lines;
}

/**
 * @returns {Promise<string | null>}
 */
async function readWorkflowFile() {
  try {
    return await readFile(new URL(WORKFLOW_FILE, REPOSITORY_ROOT), 'utf8');
  } catch {
    return null;
  }
}

if (isDirectInvocation()) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.exitCode = 1;
      process.stdout.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
    },
  );
}

/**
 * @param {readonly string[]} argv
 * @returns {Promise<number>}
 */
async function main(argv) {
  for (const argument of argv) {
    if (argument !== '--check') {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  const { jobs } = await loadCiPipeline();
  const rendered = renderWorkflowYaml(jobs);
  const current = await readWorkflowFile();

  if (argv.includes('--check')) {
    if (current !== rendered) {
      process.stdout.write(
        `${WORKFLOW_FILE} is stale; run npm run ci:generate\n`,
      );
      return 1;
    }

    return 0;
  }

  if (current !== rendered) {
    await mkdir(new URL('.github/workflows/', REPOSITORY_ROOT), {
      recursive: true,
    });
    await writeFile(new URL(WORKFLOW_FILE, REPOSITORY_ROOT), rendered);
    process.stdout.write(`${WORKFLOW_FILE}\n`);
  }

  return 0;
}

/**
 * @returns {boolean}
 */
function isDirectInvocation() {
  const entry = process.argv[1];

  return (
    typeof entry === 'string' && pathToFileURL(entry).href === import.meta.url
  );
}
