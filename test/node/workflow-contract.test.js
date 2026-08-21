/**
 * Node-only, deterministic contract for the generated CI workflow and the two
 * checked-in Test262 manifests.
 *
 * This suite runs inside `npm run test:node`, so it must stay deterministic
 * and machine-independent: it never touches the network or runs the CI pipeline
 * it describes. Everything here is either structured data parsed from a real
 * file (the workflow YAML through a real YAML parser, `package.json`, the two
 * manifests), a bounded subprocess for the UTC diagnostic guard, or a real
 * execution of the engine against manifest-declared source. The commands
 * themselves are executed by `npm run ci:contract` (`test/ci/full-contract.test.js`),
 * which is deliberately *not* registered with the Node runner.
 *
 * The workflow is a generated artifact of `tools/ci/pipeline.js`, but a
 * byte comparison against its own generator proves only that nobody hand-edited
 * the file. So the claims that matter — least-privilege permissions, immutable
 * action pins, which command each job runs, the upstream Test262 revision, the
 * report artifact — are asserted against the *parsed committed YAML*, using an
 * expectation table written out here rather than imported from the generator.
 */

import { spawnSync } from 'node:child_process';
// @ts-expect-error node:fs's sync fixture helpers (mkdir/mkdtemp/rm/writeFile)
// are not declared in this repo's Node shim (types/host.d.ts only covers the
// async fs/promises surface plus existsSync/constants).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error js-yaml's dumper (`dump`) is not declared in this repo's
// Node shim, which only covers `load`.
import { load as parseYaml, dump as dumpYaml } from 'js-yaml';
import { assertSame, assertThrows } from '../harness/assert.js';
import { createRealm, evaluateScript } from '../../src/index.js';
import {
  UNSUPPORTED_FLAGS,
  decideSkip,
  runTest262Suite,
} from '../../tools/test262/runner.js';
import {
  expandVariants,
  parseTest262Metadata,
  resolveIncludes,
} from '../../tools/test262/metadata.js';
import {
  ES5_SELECTION_FILE,
  parseEs5Selection,
} from '../../tools/test262/es5-selection.js';
import {
  ACTION_PINS,
  TEST262_REPORT_FILE,
  WORKFLOW_FILE,
  loadCiPipeline,
  renderWorkflowYaml,
} from '../../tools/ci/pipeline.js';
import {
  FEATURES_MANIFEST_FILE,
  Test262FeatureManifestError,
  featureNames,
  featureProbeTestSource,
  parseFeatureManifest,
  resolveSupportedFeatures,
  runFeatureProbe,
} from '../../tools/test262/features.js';
import {
  UPSTREAM_SUBSET_FILE,
  Test262UpstreamSubsetError,
  formatUpstreamSummaryLines,
  parseUpstreamSubset,
  summarizeUpstreamRun,
  upstreamSubsetPaths,
} from '../../tools/test262/upstream.js';
import * as upstreamOperations from '../../tools/test262/upstream.js';
import {
  ASYNC_RUNTIME_RELEASE_MANIFEST,
  ASYNC_RUNTIME_RELEASE_MANIFEST_FILE,
} from '../../tools/test262/async-runtime-release-manifest.js';
import * as ciPipeline from '../../tools/ci/pipeline.js';

const { join } = nodePath;

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const GUARD_FIXTURE_ROOT = fileURLToPath(
  new URL(
    '../../.superpowers/workflow-contract-guard-fixtures/',
    import.meta.url,
  ),
);
const NON_UTC_UPSTREAM_DIAGNOSTIC_ENV = Object.freeze({ TZ: 'Etc/GMT+1' });
const UTC_GUARD_MODULE_URL = new URL(
  '../../tools/test262/upstream-run.js',
  import.meta.url,
).href;

/**
 * The command each CI job is supposed to run, spelled out here instead of
 * imported from `tools/ci/pipeline.js`: this table is the independent
 * expectation the committed workflow is checked against.
 */
const EXPECTED_JOB_COMMANDS = Object.freeze({
  'ci-drift': 'npm run ci:check',
  vendor: 'npm run vendor:check',
  format: 'npm run format',
  lint: 'npm run lint',
  typecheck: 'npm run typecheck',
  'test-node': 'npm run test:node',
  'test-browser': 'npm run test:browser',
  'test-jsc': 'npm run test:jsc',
  'test262-fixtures': 'npm run test262:fixtures',
  'test262-es2015-release': 'npm run test262:es2015-release',
  'test262-upstream': 'npm run test262:upstream',
  'benchmark-smoke': 'npm run benchmark:smoke',
});

/** The exact browser install command that docs/testing.md documents. */
const BROWSER_INSTALL_COMMAND =
  'npx playwright install --with-deps --only-shell chromium';

const JSC_INSTALL_COMMAND =
  'sudo apt-get update && sudo apt-get install --yes libjavascriptcoregtk-bin';
const JSC_EXECUTABLE_CHECK = 'test -x /usr/bin/jsc';

/**
 * Representative fixtures for each ES5 Date family the engine completed.
 *
 * These began as the exact contents of hand-curated `date-*` subset groups,
 * back when the pinned subset was a small curated selection. The subset is now
 * derived from upstream directories, so `built-ins/Date` is selected wholesale
 * and those curated group names no longer exist. The fixtures are still the
 * independent expectation: whatever the derivation rules become, the subset has
 * to keep covering every family listed here, so a selection change that quietly
 * dropped Date coverage still fails this contract.
 */
const DATE_GROUPS = Object.freeze({
  'date-accessors-mutators': Object.freeze([
    'test/built-ins/Date/prototype/getUTCFullYear/this-value-valid-date.js',
    'test/built-ins/Date/prototype/getUTCMilliseconds/this-value-valid-date.js',
    'test/built-ins/Date/prototype/setUTCHours/this-value-valid-date-ms.js',
    'test/built-ins/Date/prototype/setUTCMilliseconds/this-value-valid-date.js',
    'test/built-ins/Date/prototype/setUTCMonth/this-value-valid-date-month.js',
  ]),
  'date-construction-statics': Object.freeze([
    'test/built-ins/Date/15.9.1.15-1.js',
    'test/built-ins/Date/S15.9.2.1_A2.js',
    'test/built-ins/Date/S15.9.3.2_A3_T1.1.js',
    'test/built-ins/Date/UTC/fp-evaluation-order.js',
    'test/built-ins/Date/UTC/overflow-make-day.js',
    'test/built-ins/Date/UTC/time-clip.js',
  ]),
  'date-formatting-json': Object.freeze([
    'test/built-ins/Date/prototype/S15.9.5_A42_T1.js',
    'test/built-ins/Date/prototype/toISOString/15.9.5.43-0-3.js',
    'test/built-ins/Date/prototype/toJSON/non-finite.js',
    'test/built-ins/Date/prototype/valueOf/S9.4_A3_T1.js',
  ]),
});

/**
 * The drift check the Test262 job is supposed to run, spelled out rather than
 * imported for the same reason the command table above is: it is the
 * independent expectation. A path git does not track has no diff at all, so the
 * tracked-ness check in front of `git diff` is the part that makes this
 * meaningful.
 */
const EXPECTED_DRIFT_COMMAND =
  'git ls-files --error-unmatch docs/test262-report.jsonl docs/conformance.md > /dev/null && git diff --exit-code -- docs/test262-report.jsonl docs/conformance.md';
const EXPECTED_PROVENANCE_RANGE_COMMAND =
  'node tools/test262/es2015-provenance-check.js --check-range --base="$ES2015_PROVENANCE_BASE_SHA" --head="$ES2015_PROVENANCE_HEAD_SHA" --pr-body-env=ES2015_PROVENANCE_PR_BODY';
const EXPECTED_PROVENANCE_RANGE_ENV = Object.freeze({
  ES2015_PROVENANCE_BASE_SHA: '${{ github.event.pull_request.base.sha }}',
  ES2015_PROVENANCE_HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
  ES2015_PROVENANCE_PR_BODY: '${{ github.event.pull_request.body }}',
  TZ: 'UTC',
});

/**
 * The trusted provenance base guard, specified in
 * `docs/superpowers/specs/2026-08-20-provenance-foundation-maintenance-design.md`
 * ("Prerequisite Amendment: Trusted Provenance Base Guard"). Every constant
 * below is this suite's own independent expectation, hand-written here rather
 * than imported from `tools/ci/pipeline.js`, so that comparing it against the
 * parsed committed workflow proves the generated bytes match the design instead
 * of merely matching the generator. `tools/ci/pipeline.js` and
 * `.github/workflows/ci.yml` must reproduce these values exactly.
 */
const EXPECTED_PR_TARGET_TYPES = Object.freeze([
  'opened',
  'synchronize',
  'reopened',
  'edited',
]);

const GUARD_JOB_ID = 'provenance-base-guard';
const GUARD_ACTIVE_NAME = 'Provenance base guard';
const GUARD_INACTIVE_NAME = 'Provenance base guard (inactive)';
const GUARD_INACTIVE_STEP_NAME = 'Keep the inactive guard context distinct';
const GUARD_CONDITION = "github.event_name == 'pull_request_target'";
const EXISTING_JOB_PRIVILEGED_EXCLUSION =
  "github.event_name != 'pull_request_target'";
const GUARD_RUNNER = 'ubuntu-24.04';
const GUARD_TIMEOUT_MINUTES = 5;

const GUARD_PERMISSIONS = Object.freeze({
  contents: 'read',
  'pull-requests': 'read',
});

const GUARD_CONCURRENCY = Object.freeze({
  group:
    'provenance-base-guard-${{ github.event_name }}-${{ github.event.pull_request.number }}',
  'cancel-in-progress': true,
});

/**
 * Every job the pipeline already generates, keyed by job ID, with its current
 * ordinary-event display name. `EXPECTED_JOB_COMMANDS` above already carries
 * the same key set, but a second table with the human-readable name keeps this
 * table hand-derived and readable at the call site rather than piggybacking on
 * an unrelated table.
 */
const ORDINARY_JOB_NAMES = Object.freeze({
  'ci-drift': 'Workflow drift',
  vendor: 'Vendor integrity',
  format: 'Formatting',
  lint: 'Lint',
  typecheck: 'Type check',
  'test-node': 'Node tests',
  'test-browser': 'Browser tests',
  'test-jsc': 'JavaScriptCore tests',
  'test262-fixtures': 'Test262 fixtures',
  'test262-es2015-release': 'Pinned Test262 ES2015 focused suites',
  'test262-upstream': 'Pinned Test262 subset',
  'benchmark-smoke': 'Benchmark smoke',
});

/**
 * Builds the `${{ <condition> && '<whenTrue>' || '<whenFalse>' }}` job-name
 * expression the design requires: `job.name` supports the `github` context,
 * so the generator must select each display name with a
 * `github.event_name`-keyed ternary rather than a static string.
 *
 * @param {string} condition
 * @param {string} whenTrue
 * @param {string} whenFalse
 * @returns {string}
 */
function eventNameTernary(condition, whenTrue, whenFalse) {
  return `\${{ ${condition} && '${whenTrue}' || '${whenFalse}' }}`;
}

const GUARD_NAME_EXPRESSION = eventNameTernary(
  GUARD_CONDITION,
  GUARD_ACTIVE_NAME,
  GUARD_INACTIVE_NAME,
);

/**
 * @param {string} ordinaryName
 * @returns {string}
 */
function inactiveOnPullRequestTargetName(ordinaryName) {
  return eventNameTernary(
    EXISTING_JOB_PRIVILEGED_EXCLUSION,
    ordinaryName,
    `${ordinaryName} (inactive on pull_request_target)`,
  );
}

/**
 * The PR head SHA expression. Only ever legitimate as a data-only env value
 * (compared against a fetched/attested SHA) — never as an action `with`
 * input or interpolated directly into a `run` command.
 */
const GUARD_HEAD_SHA_EXPRESSION = '${{ github.event.pull_request.head.sha }}';

/** Per-step environment tables, exactly as the design's mapping table lists. */
const GUARD_VALIDATE_ENV = Object.freeze({
  BASE_REPOSITORY: '${{ github.event.pull_request.base.repo.full_name }}',
  WORKFLOW_REPOSITORY: '${{ github.repository }}',
  BASE_REF: '${{ github.event.pull_request.base.ref }}',
  BASE_SHA: '${{ github.event.pull_request.base.sha }}',
  HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
  PR_NUMBER: '${{ github.event.pull_request.number }}',
});
const GUARD_CHECKOUT_ATTEST_ENV = Object.freeze({
  BASE_SHA: '${{ github.event.pull_request.base.sha }}',
});
const GUARD_ATTEST_BASE_ENV = Object.freeze({
  BASE_SHA: '${{ github.event.pull_request.base.sha }}',
});
const GUARD_FETCH_ENV = Object.freeze({
  PR_NUMBER: '${{ github.event.pull_request.number }}',
});
const GUARD_FETCH_ATTEST_ENV = Object.freeze({
  PR_NUMBER: '${{ github.event.pull_request.number }}',
  HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
});
const GUARD_CHECKER_ENV = Object.freeze({
  BASE_SHA: '${{ github.event.pull_request.base.sha }}',
  HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
  PR_BODY: '${{ github.event.pull_request.body }}',
  TZ: 'UTC',
});

const GUARD_ACTIVE_STEP_NAMES = Object.freeze([
  'Validate the canonical guard target',
  'Check out the event base commit',
  'Attest the checked-out base commit',
  'Set up Node',
  'Fetch the current target branch',
  'Attest the live target branch',
  'Fetch the advertised pull request ref',
  'Attest the fetched head commit',
  'Check the trusted-base provenance range',
]);
const GUARD_STEP_NAMES = Object.freeze([
  ...GUARD_ACTIVE_STEP_NAMES,
  GUARD_INACTIVE_STEP_NAME,
]);

/**
 * The exact key surface the guard job may render. Anything outside this set
 * widens the guard: a job-level `env` would leak values into every step's
 * environment instead of the audited per-step tables, `continue-on-error`
 * would let a failed provenance check still report success, `strategy` would
 * fan the privileged job out across unreviewed matrix values, and
 * `container`/`services` would move execution into an unpinned image.
 */
const GUARD_JOB_KEYS = Object.freeze([
  'concurrency',
  'name',
  'permissions',
  'runs-on',
  'steps',
  'timeout-minutes',
]);

/** Job keys named explicitly so their absence fails with a specific message. */
const FORBIDDEN_GUARD_JOB_KEYS = Object.freeze([
  'if',
  'env',
  'continue-on-error',
  'strategy',
  'container',
  'services',
]);

/**
 * The exact key surface each guard step may render. A `run` step carries only
 * its name, event gate, command, and optional per-step environment; a `uses`
 * step carries only its name, event gate, pinned action, and inputs.
 */
const GUARD_RUN_STEP_KEYS = Object.freeze(['if', 'name', 'run']);
const GUARD_RUN_ENV_STEP_KEYS = Object.freeze(['env', 'if', 'name', 'run']);
const GUARD_USES_STEP_KEYS = Object.freeze(['if', 'name', 'uses', 'with']);

/** Per-step key sets, positionally aligned with `GUARD_STEP_NAMES`. */
const GUARD_STEP_KEYS = Object.freeze([
  GUARD_RUN_ENV_STEP_KEYS,
  GUARD_USES_STEP_KEYS,
  GUARD_RUN_ENV_STEP_KEYS,
  GUARD_USES_STEP_KEYS,
  GUARD_RUN_STEP_KEYS,
  GUARD_RUN_ENV_STEP_KEYS,
  GUARD_RUN_ENV_STEP_KEYS,
  GUARD_RUN_ENV_STEP_KEYS,
  GUARD_RUN_ENV_STEP_KEYS,
  GUARD_RUN_STEP_KEYS,
]);

/**
 * Step keys named explicitly so their absence fails with a specific message:
 * `continue-on-error` would swallow an attestation or checker failure, `shell`
 * would move the fixed commands off the audited default shell, and
 * `working-directory` would run them somewhere other than the attested base
 * checkout.
 */
const FORBIDDEN_GUARD_STEP_KEYS = Object.freeze([
  'continue-on-error',
  'shell',
  'working-directory',
]);

/**
 * Fixed, colon-free, single-line `printf`/`grep -Eq` pipeline. Every check
 * must pass, in order, before the job reads any repository content: base
 * repository, workflow repository, base ref, base SHA, head SHA, PR number.
 */
const EXPECTED_GUARD_VALIDATE_COMMAND =
  "printf '%s' \"$BASE_REPOSITORY\" | grep -Eq '^yoonbuck/jsjs$' && printf '%s' \"$WORKFLOW_REPOSITORY\" | grep -Eq '^yoonbuck/jsjs$' && printf '%s' \"$BASE_REF\" | grep -Eq '^main$' && printf '%s' \"$BASE_SHA\" | grep -Eq '^[0-9a-f]{40}$' && printf '%s' \"$HEAD_SHA\" | grep -Eq '^[0-9a-f]{40}$' && printf '%s' \"$PR_NUMBER\" | grep -Eq '^[1-9][0-9]*$'";

/** Requires the checked-out worktree to be exactly the event's base commit. */
const EXPECTED_GUARD_CHECKOUT_ATTEST_COMMAND =
  'test "$(git rev-parse --verify \'HEAD^{commit}\')" = "$BASE_SHA"';

/** Verbatim from the design's live-main attestation step. */
const EXPECTED_GUARD_FETCH_BASE_COMMAND =
  'git fetch --no-tags --no-recurse-submodules origin +refs/heads/main:refs/remotes/origin/provenance-target-main';

/** Requires the live target ref and checked-out HEAD to both equal BASE_SHA. */
const EXPECTED_GUARD_ATTEST_BASE_COMMAND =
  'test "$(git rev-parse --verify \'refs/remotes/origin/provenance-target-main^{commit}\')" = "$BASE_SHA" && test "$(git rev-parse --verify \'HEAD^{commit}\')" = "$BASE_SHA"';

/** Verbatim from the design's step 5. */
const EXPECTED_GUARD_FETCH_COMMAND =
  'git fetch --no-tags --no-recurse-submodules origin "+refs/pull/${PR_NUMBER}/head:refs/remotes/pull/${PR_NUMBER}/head"';

/** Requires both the advertised ref and FETCH_HEAD to equal the event head SHA. */
const EXPECTED_GUARD_FETCH_ATTEST_COMMAND =
  'test "$(git rev-parse --verify "refs/remotes/pull/${PR_NUMBER}/head^{commit}")" = "$HEAD_SHA" && test "$(git rev-parse --verify \'FETCH_HEAD^{commit}\')" = "$HEAD_SHA"';

const EXPECTED_GUARD_CHECKER_COMMAND =
  'node tools/test262/es2015-provenance-check.js --check-range --base="$BASE_SHA" --head="$HEAD_SHA" --pr-body-env=PR_BODY';

const EXPECTED_GUARD_INACTIVE_COMMAND =
  'test "$GITHUB_EVENT_NAME" != pull_request_target';

/**
 * The YAML plain-scalar-indicator characters the design forbids as a first
 * character, so a hand-authored `run`/`name` value can never require quoting.
 */
const PLAIN_SCALAR_RESERVED_LEADING_CHARACTERS = new Set([
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
 * The byte-preserving plain-scalar contract, asserted here against the parsed
 * committed workflow rather than through any generator export, so the rule
 * stays an independent expectation of the emitted YAML. It rejects everything
 * the design lists: a line break, leading/trailing whitespace, a trailing
 * colon, a colon followed by a space, a space followed by `#`, and a reserved
 * leading indicator.
 *
 * @param {unknown} value
 * @param {string} description
 */
function assertPlainScalarSafe(value, description) {
  assertSame(
    typeof value === 'string' && value.length > 0,
    true,
    `${description} must be a non-empty string`,
  );
  const text = /** @type {string} */ (value);
  assertSame(
    /[\r\n]/.test(text),
    false,
    `${description} must not contain a line break: ${JSON.stringify(text)}`,
  );
  assertSame(
    text === text.trim(),
    true,
    `${description} must not have leading or trailing whitespace: ${JSON.stringify(text)}`,
  );
  assertSame(
    text.endsWith(':'),
    false,
    `${description} must not end with a colon: ${JSON.stringify(text)}`,
  );
  assertSame(
    text.includes(': '),
    false,
    `${description} must not contain a colon followed by a space: ${JSON.stringify(text)}`,
  );
  assertSame(
    text.includes(' #'),
    false,
    `${description} must not contain a space followed by #: ${JSON.stringify(text)}`,
  );
  assertSame(
    PLAIN_SCALAR_RESERVED_LEADING_CHARACTERS.has(text[0]),
    false,
    `${description} must not begin with a YAML plain-scalar indicator: ${JSON.stringify(text)}`,
  );
}

/**
 * Dumps `value` with the real `js-yaml` dumper and reloads it with the real
 * parser, so "plain-scalar-safe" is proven against the actual library rather
 * than only against the hand-written regex above.
 *
 * @param {string} value
 * @param {string} description
 */
function assertRoundTripsAsPlainScalar(value, description) {
  // `lineWidth: -1` disables js-yaml's line-wrapping, which otherwise folds
  // long single-line values (the guard's shell commands are well over 80
  // columns) into a `>-` folded block scalar. A folded/literal block scalar
  // still round-trips byte-for-byte for these particular values, so the
  // byte-round-trip check alone would not catch the style change — reject
  // the block indicators explicitly, independent of the round-trip check.
  /** @type {string} */
  const dumped = dumpYaml({ value }, { lineWidth: -1 });
  assertSame(
    /^value: ['"]/.test(dumped),
    false,
    `${description} must dump as an unquoted plain scalar, got: ${dumped}`,
  );
  assertSame(
    /^value: [|>]/.test(dumped),
    false,
    `${description} must not dump as a folded or literal block scalar, got: ${dumped}`,
  );
  const reloaded = /** @type {{ value: unknown }} */ (parseYaml(dumped)).value;
  assertSame(
    reloaded,
    value,
    `${description} must round-trip through the real YAML parser unchanged`,
  );
}

/**
 * @param {string} expression A job- or step-name value that may be a
 *   `${{ ... }}` expression.
 * @param {string} description
 */
function assertNameExpressionOnlyDependsOnEventName(expression, description) {
  if (!expression.startsWith('${{')) return;
  assertSame(
    expression.includes('secrets.'),
    false,
    `${description} must never depend on a secret`,
  );
  const dynamicReferences = expression.match(/github\.[A-Za-z_.]+/g) ?? [];
  for (const reference of dynamicReferences) {
    assertSame(
      reference,
      'github.event_name',
      `${description} must depend only on github.event_name, found ${reference}`,
    );
  }
}

/**
 * @param {string} expression
 * @param {string} eventName
 * @returns {string}
 */
function evaluateEventNameExpression(expression, eventName) {
  if (!expression.startsWith('${{')) return expression;

  const match =
    /^\$\{\{\s*github\.event_name\s*(==|!=)\s*'([^']+)' && '([^']+)' \|\| '([^']+)'\s*\}\}$/.exec(
      expression,
    );

  if (match === null) {
    throw new Error(`unsupported github.event_name expression: ${expression}`);
  }

  const [, operator, expectedEventName, whenTrue, whenFalse] = match;
  const condition =
    operator === '=='
      ? eventName === expectedEventName
      : eventName !== expectedEventName;

  return condition ? whenTrue : whenFalse;
}

/**
 * @param {string} group
 * @param {string} eventName
 * @param {string} pullRequestNumber
 * @returns {string}
 */
function renderGuardConcurrencyGroup(group, eventName, pullRequestNumber) {
  return group
    .replace('${{ github.event_name }}', eventName)
    .replace('${{ github.event.pull_request.number }}', pullRequestNumber);
}

/**
 * @param {string | undefined} condition
 * @param {string} eventName
 * @returns {boolean}
 */
function matchesEventNameCondition(condition, eventName) {
  if (condition === undefined) return true;
  if (condition === GUARD_CONDITION) {
    return eventName === 'pull_request_target';
  }
  if (condition === EXISTING_JOB_PRIVILEGED_EXCLUSION) {
    return eventName !== 'pull_request_target';
  }
  if (condition === "github.event_name == 'pull_request'") {
    return eventName === 'pull_request';
  }

  throw new Error(`unsupported github.event_name condition: ${condition}`);
}

function ensureGuardFixtureRoot() {
  mkdirSync(GUARD_FIXTURE_ROOT, { recursive: true });
  return GUARD_FIXTURE_ROOT;
}

/**
 * Isolates fixture Git repositories from the host's real Git configuration.
 * @param {Record<string, string>} extra
 */
function isolatedGitEnv(extra) {
  return Object.freeze({
    .../** @type {Record<string, string | undefined>} */ (process.env),
    GIT_CONFIG_GLOBAL: join(
      ensureGuardFixtureRoot(),
      'workflow-contract-guard-fixtures-missing-global-gitconfig',
    ),
    GIT_CONFIG_SYSTEM: join(
      ensureGuardFixtureRoot(),
      'workflow-contract-guard-fixtures-missing-system-gitconfig',
    ),
    ...extra,
  });
}

const GUARD_FIXTURE_IDENTITY = Object.freeze([
  '-c',
  'user.name=Provenance Guard Fixture',
  '-c',
  'user.email=provenance-guard-fixture@example.invalid',
]);

/**
 * @param {string} cwd
 * @param {readonly string[]} args
 * @param {Record<string, string> | undefined} [extra]
 */
function runGit(cwd, args, extra) {
  return spawnSync('git', [...args], {
    cwd,
    env: isolatedGitEnv(extra ?? {}),
    encoding: 'utf8',
  });
}

/** A deterministic, isolated Git fixture on an explicit `main` branch. */
function initGuardFixtureRepository() {
  const dir = mkdtempSync(
    join(ensureGuardFixtureRoot(), 'provenance-base-guard-'),
  );
  const init = runGit(dir, [
    ...GUARD_FIXTURE_IDENTITY,
    'init',
    '--quiet',
    '--initial-branch=main',
  ]);
  assertSame(init.status, 0, `fixture git init must succeed: ${init.stderr}`);
  return dir;
}

let guardFixtureCommitCounter = 0;

/**
 * @param {string} dir
 * @returns {string} the new commit's full SHA
 */
function commitGuardFixtureFile(dir) {
  guardFixtureCommitCounter += 1;
  const counter = guardFixtureCommitCounter;
  writeFileSync(
    join(dir, `file-${counter}.txt`),
    `fixture content ${counter}\n`,
    'utf8',
  );
  const add = runGit(dir, [...GUARD_FIXTURE_IDENTITY, 'add', '-A']);
  assertSame(add.status, 0, `fixture git add must succeed: ${add.stderr}`);
  const commit = runGit(dir, [
    ...GUARD_FIXTURE_IDENTITY,
    'commit',
    '--quiet',
    '-m',
    `fixture commit ${counter}`,
  ]);
  assertSame(
    commit.status,
    0,
    `fixture git commit must succeed: ${commit.stderr}`,
  );
  const rev = runGit(dir, ['rev-parse', 'HEAD']);
  assertSame(rev.status, 0, `fixture rev-parse must succeed: ${rev.stderr}`);
  return rev.stdout.trim();
}

/**
 * Runs one of the guard's fixed single-line shell commands exactly as the
 * workflow would, with the same isolated Git configuration.
 *
 * @param {string} command
 * @param {string} cwd
 * @param {Record<string, string>} env
 */
function runGuardShellCommand(command, cwd, env) {
  return spawnSync('bash', ['-c', command], {
    cwd,
    env: isolatedGitEnv(env),
    encoding: 'utf8',
  });
}

const engine = { createRealm, evaluateScript };

const GENERATOR_PROBE =
  "function* sequence() {\n  var input = yield 1;\n  return input + 1;\n}\nvar iterator = sequence();\nif (iterator[Symbol.iterator]() !== iterator) {\n  throw new Error('generator is not iterable');\n}\nvar first = iterator.next();\nvar second = iterator.next(2);\nif (first.value !== 1 || first.done || second.value !== 3 || !second.done) {\n  throw new Error('generator resume semantics failed');\n}";

/**
 * @param {string} path Repository-relative.
 * @returns {Promise<string>}
 */
function readRepositoryFile(path) {
  return readFile(new URL(path, REPOSITORY_ROOT_URL), 'utf8');
}

/**
 * @returns {Promise<any>}
 */
async function readPackageManifest() {
  return JSON.parse(await readRepositoryFile('package.json'));
}

/**
 * @returns {Promise<{ text: string, workflow: any }>}
 */
async function readWorkflow() {
  const text = await readRepositoryFile(WORKFLOW_FILE);

  return { text, workflow: parseYaml(text) };
}

/**
 * @param {any} workflow
 * @param {string} id
 * @returns {any}
 */
function requireJob(workflow, id) {
  const job = workflow.jobs?.[id];

  if (job === undefined) {
    throw new Error(`the committed workflow has no ${id} job`);
  }

  return job;
}

/**
 * @param {any} job
 * @returns {string[]}
 */
function runCommands(job) {
  return (job.steps ?? [])
    .filter((/** @type {any} */ step) => typeof step.run === 'string')
    .map((/** @type {any} */ step) => step.run);
}

/**
 * @param {any} job
 * @param {string} action
 * @returns {any[]}
 */
function usesSteps(job, action) {
  return (job.steps ?? []).filter(
    (/** @type {any} */ step) =>
      typeof step.uses === 'string' && step.uses.startsWith(`${action}@`),
  );
}

/**
 * @param {readonly any[]} steps
 * @param {readonly string[]} expectedNames
 */
export function assertAdjacentWorkflowSteps(steps, expectedNames) {
  const indexes = expectedNames.map((name) =>
    steps.findIndex((step) => step?.name === name),
  );

  for (let index = 0; index < expectedNames.length; index += 1) {
    const name = expectedNames[index];
    const occurrences = steps.filter((step) => step?.name === name).length;
    if (occurrences !== 1) {
      throw new Error(
        `workflow must contain exactly one step named "${name}"; found ${occurrences}`,
      );
    }
  }

  for (let index = 1; index < indexes.length; index += 1) {
    if (indexes[index] !== indexes[0] + index) {
      throw new Error(
        `workflow steps must be adjacent in this exact order: ${expectedNames.join(' -> ')}`,
      );
    }
  }
}

/**
 * Pins a parsed workflow object to an exact key set: every expected key must be
 * present and no other key may appear. Key order is irrelevant — both sides are
 * sorted — but membership is exact, so a newly rendered key that would widen
 * what a job or step executes, or how its failure is reported, fails here
 * instead of shipping unnoticed.
 *
 * @param {any} record
 * @param {readonly string[]} expectedKeys
 * @param {string} message
 */
function assertExactKeys(record, expectedKeys, message) {
  const actualKeys =
    typeof record === 'object' && record !== null
      ? Object.keys(record).sort()
      : [];
  const expected = [...expectedKeys].sort();

  if (JSON.stringify(actualKeys) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected exactly [${expected.join(', ')}], found [${actualKeys.join(', ')}]`,
    );
  }
}

/** @param {any} step */
function assertProvenanceRangeStep(step) {
  assertExactKeys(
    step,
    ['env', 'if', 'name', 'run'],
    'provenance range step must contain exact keys',
  );
  if (step.name !== 'Check provenance PR range') {
    throw new Error('provenance range step must retain its authoritative name');
  }
  if (step.if !== "github.event_name == 'pull_request'") {
    throw new Error('provenance range step must be limited to pull_request');
  }
  if (step.run !== EXPECTED_PROVENANCE_RANGE_COMMAND) {
    throw new Error(
      'provenance range step must pass actual base/head and derive profile from the PR marker',
    );
  }
  if (
    JSON.stringify(step.env) !== JSON.stringify(EXPECTED_PROVENANCE_RANGE_ENV)
  ) {
    throw new Error(
      'provenance range step must use trusted event identities and the full PR body',
    );
  }
}

function nonUtcUpstreamDiagnosticInvocation() {
  return {
    command: /** @type {{ execPath: string }} */ (
      /** @type {unknown} */ (process)
    ).execPath,
    args: ['tools/test262/upstream-run.js'],
    options: /** @type {{
      cwd: string,
      env: typeof NON_UTC_UPSTREAM_DIAGNOSTIC_ENV,
      encoding: 'utf8',
      maxBuffer: number,
    }} */ ({
      cwd: fileURLToPath(REPOSITORY_ROOT_URL),
      env: NON_UTC_UPSTREAM_DIAGNOSTIC_ENV,
      encoding: 'utf8',
      maxBuffer: 64 * 1024,
    }),
  };
}

/**
 * @param {string} zone
 */
function utcGuardInvocation(zone) {
  return {
    command: /** @type {{ execPath: string }} */ (
      /** @type {unknown} */ (process)
    ).execPath,
    args: [
      '--input-type=module',
      '--eval',
      [
        `import { assertUtcTimeZone } from ${JSON.stringify(UTC_GUARD_MODULE_URL)};`,
        'try {',
        '  assertUtcTimeZone();',
        '} catch (error) {',
        '  process.exitCode = 1;',
        '  process.stderr.write(`${error.message}\\n`);',
        '}',
      ].join('\n'),
    ],
    options: {
      cwd: fileURLToPath(REPOSITORY_ROOT_URL),
      env: { TZ: zone },
      encoding: /** @type {const} */ ('utf8'),
      maxBuffer: 64 * 1024,
    },
  };
}

/**
 * @param {{ stderr?: unknown }} result
 * @returns {string}
 */
function stderrText(result) {
  if (typeof result.stderr === 'string') {
    return result.stderr;
  }

  if (result.stderr instanceof Uint8Array) {
    return new globalThis.TextDecoder().decode(result.stderr);
  }

  return '';
}

/**
 * A synthetic manifest with a probe that only completes on an engine that
 * really evaluates arithmetic and loops, so the probe machinery is exercised
 * for real even while the project's own manifest is still empty.
 */
const SYNTHETIC_MANIFEST_TEXT = JSON.stringify({
  version: 1,
  features: [
    {
      name: 'jsjs-arithmetic-probe',
      probe: [
        'var total = 0;',
        'var index = 0;',
        'while (index < 4) {',
        '  total = total + index;',
        '  index = index + 1;',
        '}',
        'if (total !== 6) {',
        '  throw "arithmetic probe computed " + total;',
        '}',
      ].join('\n'),
      tests: ['test/language/expressions/addition/S11.6.1_A2.4_T1.js'],
    },
  ],
});

/**
 * @param {string} probe
 * @returns {{ name: string, probe: string, tests: readonly string[] }}
 */
function syntheticFeature(probe) {
  return {
    name: 'jsjs-synthetic-probe',
    probe,
    tests: ['test/language/types/undefined/S8.1_A1_T1.js'],
  };
}

export default [
  {
    name: 'the pull request workflow reruns provenance gates when the durable marker is edited',
    run: async () => {
      const { workflow } = await readWorkflow();
      assertSame(
        JSON.stringify(workflow.on?.pull_request?.types),
        JSON.stringify(['opened', 'synchronize', 'reopened', 'edited']),
      );
    },
  },
  {
    name: 'npm run ci:contract selects only safe local checks',
    run: async () => {
      const expectedNames = [
        'npm run vendor:check passes for real',
        'npm run format passes for real',
        'npm run format really checks engine sources, not only the tooling around them',
        'npm run lint passes for real',
        'npm run typecheck passes for real',
        'npm run ci:check passes for real, so the committed workflow is not stale',
        'npm run test:node passes for real and reports only passing suites',
        'npm run test262:fixtures passes for real against the local fixture tree',
        'npm run test:browser launches the configured headless browser for real',
      ];
      const contractRunner = await readRepositoryFile(
        'test/run-ci-contract.js',
      );
      const fullContract = await readRepositoryFile(
        'test/ci/full-contract.test.js',
      );
      const localTestList = fullContract.match(
        /const LOCAL_CI_CONTRACT_TEST_NAMES = Object\.freeze\(\[([\s\S]*?)\]\);/,
      );

      if (localTestList === null) {
        throw new Error(
          'the full contract must declare its safe local test list',
        );
      }

      const actualNames = [...localTestList[1].matchAll(/'([^']+)'/g)].map(
        (match) => match[1],
      );

      assertSame(JSON.stringify(actualNames), JSON.stringify(expectedNames));
      assertSame(
        actualNames.some((name) => name.includes('test262:upstream')),
        false,
        'the local contract must never select the broad upstream Test262 script',
      );
      assertSame(
        actualNames.some((name) => name.includes('test262:es2015')),
        false,
        'the local contract must exclude exact-pinned Test262 semantic execution',
      );
      assertSame(
        contractRunner.includes('tests: LOCAL_CI_CONTRACT_TESTS'),
        true,
        'npm run ci:contract must use the explicitly safe local test list',
      );
    },
  },
  {
    name: 'the committed workflow grants least-privilege permissions at the top level',
    run: async () => {
      const { workflow } = await readWorkflow();

      assertSame(JSON.stringify(workflow.permissions), '{"contents":"read"}');

      for (const id of Object.keys(EXPECTED_JOB_COMMANDS)) {
        const job = requireJob(workflow, id);

        assertSame(
          job.permissions === undefined,
          true,
          `${id} must inherit the workflow's read-only permissions`,
        );
      }

      // Amended for the trusted provenance base guard: unlike every other
      // job, the guard does not inherit the workflow's permissions. It
      // declares its own, and they must be exactly read-only contents plus
      // read-only pull-requests — no broader inherited or declared scope.
      const guardJob = requireJob(workflow, GUARD_JOB_ID);

      assertSame(
        JSON.stringify(guardJob.permissions),
        JSON.stringify(GUARD_PERMISSIONS),
        'the guard must declare exactly contents:read and pull-requests:read',
      );
    },
  },
  {
    name: 'every action the workflow uses is pinned to an immutable commit SHA with a version comment',
    run: async () => {
      const { text, workflow } = await readWorkflow();
      /** @type {string[]} */
      const referenced = [];

      for (const id of Object.keys(workflow.jobs)) {
        for (const step of workflow.jobs[id].steps ?? []) {
          if (typeof step.uses === 'string') {
            referenced.push(step.uses);
          }
        }
      }

      assertSame(referenced.length > 0, true, 'the workflow uses actions');

      const pins = new Map(ACTION_PINS.map((pin) => [pin.action, pin]));

      for (const reference of referenced) {
        const match = /^([^@]+)@([0-9a-f]{40})$/.exec(reference);

        assertSame(
          match !== null,
          true,
          `${reference} must be pinned to a full 40-character commit SHA`,
        );

        const pin = pins.get(/** @type {RegExpExecArray} */ (match)[1]);

        assertSame(
          pin !== undefined,
          true,
          `${reference} is not a declared action pin`,
        );
        assertSame(
          /** @type {RegExpExecArray} */ (match)[2],
          /** @type {{ sha: string }} */ (pin).sha,
        );
      }

      // The comment identifying the human-readable version lives in the raw
      // text; a YAML parser drops it, so it is checked separately.
      const usesLines = text
        .split('\n')
        .filter((line) => /^\s*(?:- )?uses:/.test(line));

      assertSame(usesLines.length, referenced.length);

      for (const line of usesLines) {
        const match =
          /^\s*(?:- )?uses: ([^@]+)@([0-9a-f]{40}) # (v[\w.]+)$/.exec(line);

        assertSame(
          match !== null,
          true,
          `${line.trim()} must name its version in a trailing comment`,
        );

        const pin = pins.get(/** @type {RegExpExecArray} */ (match)[1]);

        assertSame(
          /** @type {RegExpExecArray} */ (match)[3],
          /** @type {{ version: string }} */ (pin).version,
        );
      }
    },
  },
  {
    name: 'every required job exists and runs exactly the command it is supposed to run',
    run: async () => {
      const { workflow } = await readWorkflow();
      const packageManifest = await readPackageManifest();

      // Amended for the trusted provenance base guard: the job set now also
      // includes the guard, so the exact-set assumption widens to name it
      // explicitly rather than silently accepting an extra unexpected job.
      assertSame(
        Object.keys(workflow.jobs).sort().join(','),
        [...Object.keys(EXPECTED_JOB_COMMANDS), GUARD_JOB_ID].sort().join(','),
      );

      for (const [id, command] of Object.entries(EXPECTED_JOB_COMMANDS)) {
        const job = requireJob(workflow, id);
        const commands = runCommands(job);

        assertSame(
          commands.includes(command),
          true,
          `${id} must run ${command}, found: ${commands.join(' | ')}`,
        );

        const script = command.slice('npm run '.length);

        assertSame(
          Object.prototype.hasOwnProperty.call(packageManifest.scripts, script),
          true,
          `package.json must declare the ${script} script`,
        );
      }

      // Amended per-job npm-command assumption: unlike every other job, the
      // guard never runs npm at all (no install, no script) — its checker
      // invocation is a direct `node` call against the base checkout.
      const guardCommands = runCommands(requireJob(workflow, GUARD_JOB_ID));

      assertSame(
        guardCommands.some((command) => command.startsWith('npm')),
        false,
        'the guard must never run an npm command',
      );
    },
  },
  {
    name: 'the browser job installs exactly the headless browser command that docs/testing.md documents',
    run: async () => {
      const { workflow } = await readWorkflow();
      const testingDoc = await readRepositoryFile('docs/testing.md');
      const commands = runCommands(requireJob(workflow, 'test-browser'));

      assertSame(
        commands.includes(BROWSER_INSTALL_COMMAND),
        true,
        `test-browser must install browsers with ${BROWSER_INSTALL_COMMAND}`,
      );
      assertSame(
        commands.indexOf(BROWSER_INSTALL_COMMAND) <
          commands.indexOf('npm run test:browser'),
        true,
        'the install step must come before the browser suite runs',
      );
      assertSame(
        testingDoc.includes(BROWSER_INSTALL_COMMAND),
        true,
        'docs/testing.md must document the exact install command CI uses',
      );
    },
  },
  {
    name: 'the required JavaScriptCore job installs a shell and runs the portable suite',
    run: async () => {
      const { workflow } = await readWorkflow();
      const testingDoc = await readRepositoryFile('docs/testing.md');
      const job = requireJob(workflow, 'test-jsc');
      const commands = runCommands(job);

      // Amended for the trusted provenance base guard: every existing job's
      // static name becomes a github.event_name-keyed expression so a job
      // skipped on pull_request_target reports a distinct inactive name
      // rather than reusing the name a required ordinary-event check expects.
      assertSame(
        job.name,
        inactiveOnPullRequestTargetName('JavaScriptCore tests'),
      );
      assertSame(JSON.stringify(job.needs), JSON.stringify(['vendor']));
      assertSame(
        commands.includes(JSC_INSTALL_COMMAND),
        true,
        `test-jsc must install JavaScriptCore with ${JSC_INSTALL_COMMAND}`,
      );
      assertSame(
        commands.includes(JSC_EXECUTABLE_CHECK),
        true,
        `test-jsc must verify ${JSC_EXECUTABLE_CHECK}`,
      );
      assertSame(
        commands.indexOf(JSC_INSTALL_COMMAND) <
          commands.indexOf(JSC_EXECUTABLE_CHECK),
        true,
        'the JavaScriptCore shell must be verified after installation',
      );
      assertSame(
        commands.indexOf(JSC_EXECUTABLE_CHECK) <
          commands.indexOf('npm run test:jsc'),
        true,
        'the JavaScriptCore shell must be verified before the JSC suite runs',
      );
      assertSame(
        testingDoc.includes(JSC_INSTALL_COMMAND),
        true,
        'docs/testing.md must document the exact JavaScriptCore install command CI uses',
      );
      assertSame(
        testingDoc.includes('/usr/bin/jsc'),
        true,
        'docs/testing.md must document the JavaScriptCore executable CI verifies',
      );
    },
  },
  {
    name: 'the focused ES2015 Test262 release job checks out the pinned revision and runs every focused suite',
    run: async () => {
      const { workflow } = await readWorkflow();
      const packageManifest = await readPackageManifest();
      const job = requireJob(workflow, 'test262-es2015-release');
      const checkouts = usesSteps(job, 'actions/checkout');
      const upstream = checkouts.filter(
        (step) => step.with?.repository !== undefined,
      );

      assertSame(upstream.length, 1, 'exactly one upstream checkout step');
      assertSame(upstream[0].with.repository, 'tc39/test262');
      assertSame(upstream[0].with.ref, packageManifest.test262.revision);
      assertSame(upstream[0].with.path, packageManifest.test262.checkoutPath);
      assertSame(String(upstream[0].with['persist-credentials']), 'false');

      const commands = runCommands(job);
      const runStep = job.steps.find(
        (/** @type {any} */ step) =>
          step.run === 'npm run test262:es2015-release',
      );

      assertSame(
        packageManifest.scripts['test262:es2015-release'],
        'node test/run-node.js test/ci/es2015-promise-test262.test.js test/ci/es2015-generator-test262.test.js test/ci/es2015-module-test262.test.js test/ci/es2015-object-function-test262.test.js test/ci/es2015-syntax-test262.test.js',
        'the release script must run every focused ES2015 suite',
      );
      // Amended for the trusted provenance base guard: see the JavaScriptCore
      // job assertion above for why this is now an event-keyed expression.
      assertSame(
        job.name,
        inactiveOnPullRequestTargetName('Pinned Test262 ES2015 focused suites'),
      );
      assertSame(JSON.stringify(job.needs), JSON.stringify(['vendor']));
      assertSame(
        runStep?.env?.TZ,
        'UTC',
        'the focused release suites must run under TZ=UTC',
      );
      assertSame(
        commands.includes('npm run test262:upstream'),
        false,
        'the focused release job must not run the broad upstream suite',
      );
      assertSame(
        commands.some((command) => command.includes(TEST262_REPORT_FILE)),
        false,
        'the focused release job must not rewrite or check the broad report',
      );
    },
  },
  {
    name: 'only the broad Test262 execution step receives the exact required Node heap allowance',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, 'test262-upstream');
      const runStep = job.steps.find(
        (/** @type {any} */ step) => step.run === 'npm run test262:upstream',
      );

      assertSame(
        runStep !== undefined,
        true,
        'the broad Test262 execution step must exist',
      );
      assertSame(
        workflow.env === undefined,
        true,
        'the heap allowance must not be workflow-global',
      );
      assertSame(
        job.env === undefined,
        true,
        'the heap allowance must not be job-global',
      );
      assertSame(
        JSON.stringify(runStep.env),
        JSON.stringify(ciPipeline.TEST262_UPSTREAM_ENVIRONMENT),
        'the generated broad execution step must use the authoritative Test262 environment',
      );
      assertSame(
        runStep.env.NODE_OPTIONS,
        '--max-old-space-size=4096',
        'the broad execution step must use the proven 4096 MiB heap allowance',
      );
      assertSame(runStep.env.TZ, 'UTC');
    },
  },
  {
    name: 'the full contract environment helper keeps UTC global and scopes heap to broad npm scripts',
    run: () => {
      const base = Object.freeze({
        PATH: '/contract/bin',
        TZ: 'America/Los_Angeles',
      });
      const environmentForScript = ciPipeline.environmentForTest262NpmScript;

      assertSame(
        typeof environmentForScript,
        'function',
        'the full contract needs a testable broad-script environment helper',
      );

      for (const script of ['test262:upstream', 'test262:upstream:check']) {
        const environment = environmentForScript(script, base);

        assertSame(environment.PATH, base.PATH);
        assertSame(environment.NODE_OPTIONS, '--max-old-space-size=4096');
        assertSame(environment.TZ, 'UTC');
      }

      const unrelatedEnvironment = environmentForScript('format', base);

      assertSame(unrelatedEnvironment.PATH, base.PATH);
      assertSame(unrelatedEnvironment.TZ, 'UTC');
      assertSame(
        unrelatedEnvironment.NODE_OPTIONS,
        undefined,
        'unrelated commands must not receive the broad Test262 heap allowance',
      );
    },
  },
  {
    name: 'non-UTC upstream diagnostic prints the exact heap and UTC remediation command',
    run: async () => {
      const { command, args, options } = nonUtcUpstreamDiagnosticInvocation();
      const result = spawnSync(command, args, options);

      assertSame(result.error, undefined);
      assertSame(result.status, 1);
      assertSame(
        stderrText(result).includes(
          'NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream',
        ),
        true,
        `non-UTC remediation was:\n${stderrText(result)}`,
      );
    },
  },
  {
    name: 'UTC guard requires the canonical TZ value rather than historical offsets',
    run: () => {
      const historicalInvocation = utcGuardInvocation('Africa/Monrovia');
      const utcInvocation = utcGuardInvocation('UTC');
      const historical = spawnSync(
        historicalInvocation.command,
        historicalInvocation.args,
        historicalInvocation.options,
      );
      const utc = spawnSync(
        utcInvocation.command,
        utcInvocation.args,
        utcInvocation.options,
      );
      const diagnostic = stderrText(historical);

      assertSame(historical.error, undefined);
      assertSame(historical.status, 1);
      assertSame(
        diagnostic.includes('this process is running in Africa/Monrovia.'),
        true,
      );
      assertSame(
        diagnostic.includes(
          'NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream',
        ),
        true,
      );
      assertSame(utc.error, undefined);
      assertSame(utc.status, 0);
      assertSame(stderrText(utc), '');
    },
  },
  {
    name: 'non-UTC upstream diagnostic uses process.execPath and isolated TZ-only environment',
    run: () => {
      const invocation = nonUtcUpstreamDiagnosticInvocation();

      assertSame(
        invocation.command,
        /** @type {{ execPath: string }} */ (/** @type {unknown} */ (process))
          .execPath,
      );
      assertSame(
        JSON.stringify(invocation.args),
        JSON.stringify(['tools/test262/upstream-run.js']),
      );
      assertSame(
        JSON.stringify(invocation.options),
        JSON.stringify({
          cwd: fileURLToPath(REPOSITORY_ROOT_URL),
          env: NON_UTC_UPSTREAM_DIAGNOSTIC_ENV,
          encoding: 'utf8',
          maxBuffer: 64 * 1024,
        }),
      );
    },
  },
  {
    name: 'limitations document gives the exact heap and UTC broad Test262 command',
    run: async () => {
      const limitations = await readRepositoryFile('docs/limitations.md');
      const exact =
        'NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npm run test262:upstream';

      assertSame(limitations.includes(exact), true);
      assertSame(
        limitations.includes('`TZ=UTC npm run test262:upstream`'),
        false,
        'the documented broad remediation must not omit the heap allowance',
      );
    },
  },
  {
    name: 'the workflow adjacency contract rejects an intervening Test262 step',
    run: () => {
      const error = assertThrows(
        () =>
          assertAdjacentWorkflowSteps(
            [
              { name: 'Install dependencies' },
              { name: 'Check provenance PR range' },
              { name: 'Check unknown-edition provenance' },
              { name: 'Intervening mutant step' },
              { name: 'Check the ES2015 taxonomy and exact promotion' },
            ],
            [
              'Install dependencies',
              'Check provenance PR range',
              'Check unknown-edition provenance',
              'Check the ES2015 taxonomy and exact promotion',
            ],
          ),
        Error,
      );

      assertSame(
        error.message,
        'workflow steps must be adjacent in this exact order: Install dependencies -> Check provenance PR range -> Check unknown-edition provenance -> Check the ES2015 taxonomy and exact promotion',
      );
    },
  },
  {
    name: 'the provenance PR range step rejects event, marker, and ref mutants',
    run: () => {
      const valid = {
        name: 'Check provenance PR range',
        if: "github.event_name == 'pull_request'",
        run: EXPECTED_PROVENANCE_RANGE_COMMAND,
        env: EXPECTED_PROVENANCE_RANGE_ENV,
      };
      assertProvenanceRangeStep(valid);
      for (const mutant of [
        { ...valid, if: undefined },
        {
          ...valid,
          run: valid.run.replace(
            '$ES2015_PROVENANCE_BASE_SHA',
            '${{ github.sha }}',
          ),
        },
        {
          ...valid,
          run: `${valid.run} --profile=foundation`,
        },
        {
          ...valid,
          env: { ...valid.env, ES2015_PROVENANCE_PR_BODY: 'branch supplied' },
        },
        {
          ...valid,
          env: {
            ...valid.env,
            ES2015_PROVENANCE_HEAD_SHA: '${{ github.sha }}',
          },
        },
      ]) {
        assertThrows(() => assertProvenanceRangeStep(mutant), Error);
      }
    },
  },
  {
    name: 'the pinned Test262 job checks provenance immediately before taxonomy and broad execution',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, 'test262-upstream');
      const checkouts = usesSteps(job, 'actions/checkout');
      const upstream = checkouts.find(
        (step) => step.with?.repository === 'tc39/test262',
      );
      const install = job.steps.find(
        (/** @type {any} */ step) => step.name === 'Install dependencies',
      );
      const provenanceCheck = job.steps.find(
        (/** @type {any} */ step) =>
          step.name === 'Check unknown-edition provenance',
      );
      const rangeCheck = job.steps.find(
        (/** @type {any} */ step) => step.name === 'Check provenance PR range',
      );
      const taxonomyCheck = job.steps.find(
        (/** @type {any} */ step) =>
          step.name === 'Check the ES2015 taxonomy and exact promotion',
      );
      const broadRun = job.steps.find(
        (/** @type {any} */ step) => step.run === 'npm run test262:upstream',
      );

      assertAdjacentWorkflowSteps(job.steps, [
        'Install dependencies',
        'Check provenance PR range',
        'Check unknown-edition provenance',
        'Check the ES2015 taxonomy and exact promotion',
      ]);
      assertProvenanceRangeStep(rangeCheck);
      assertSame(
        job.steps.some(
          (/** @type {any} */ step) =>
            typeof step.run === 'string' && step.run.includes('--complete='),
        ),
        false,
        'the range step must derive the decision code and enforce completeness without a branch-controlled second command',
      );
      const projectCheckout = checkouts.find(
        (step) => step.with?.repository === undefined,
      );
      assertSame(projectCheckout?.with?.['fetch-depth'], '0');
      assertSame(
        provenanceCheck?.run,
        'npm run test262:es2015:provenance:check',
      );
      assertSame(provenanceCheck?.env?.TZ, 'UTC');
      assertSame(
        taxonomyCheck !== undefined,
        true,
        'the pinned Test262 job must check the ES2015 taxonomy and exact promotion',
      );
      assertSame(taxonomyCheck?.run, 'npm run test262:es2015:audit:check');
      assertSame(taxonomyCheck?.env?.TZ, 'UTC');
      assertSame(
        job.steps.indexOf(/** @type {any} */ (upstream)) <
          job.steps.indexOf(/** @type {any} */ (taxonomyCheck)),
        true,
        'the taxonomy check must follow the pinned Test262 checkout',
      );
      assertSame(
        install !== undefined,
        true,
        'the pinned Test262 job must install dependencies',
      );
      assertSame(
        job.steps.indexOf(/** @type {any} */ (taxonomyCheck)) <
          job.steps.indexOf(/** @type {any} */ (broadRun)),
        true,
        'the taxonomy check must precede broad pinned Test262 execution',
      );
    },
  },
  {
    name: 'the Test262 job publishes only a report produced by the candidate run',
    run: async () => {
      const { workflow } = await readWorkflow();
      const packageManifest = await readPackageManifest();
      const job = requireJob(workflow, 'test262-upstream');
      const checkouts = usesSteps(job, 'actions/checkout');
      const upstream = checkouts.filter(
        (step) => step.with?.repository !== undefined,
      );

      assertSame(upstream.length, 1, 'exactly one upstream checkout step');
      assertSame(upstream[0].with.repository, 'tc39/test262');
      assertSame(upstream[0].with.ref, packageManifest.test262.revision);
      assertSame(upstream[0].with.path, packageManifest.test262.checkoutPath);
      assertSame(String(upstream[0].with['persist-credentials']), 'false');
      assertSame(
        checkouts.indexOf(upstream[0]) > 0,
        true,
        'the upstream tree is checked out after the project checkout',
      );

      const uploads = usesSteps(job, 'actions/upload-artifact');

      assertSame(uploads.length, 1, 'exactly one artifact upload step');
      assertSame(
        uploads[0].if,
        "always() && hashFiles('docs/test262-report.jsonl') != ''",
      );
      assertSame(uploads[0].with.path, TEST262_REPORT_FILE);
      assertSame(uploads[0].with['if-no-files-found'], 'error');

      const commands = runCommands(job);
      const run = commands.indexOf('npm run test262:upstream');
      const drift = commands.indexOf(EXPECTED_DRIFT_COMMAND);
      const select = commands.indexOf('npm run test262:select:check');
      const scrub = commands.indexOf(`rm -f ${TEST262_REPORT_FILE}`);
      const taxonomy = commands.indexOf('npm run test262:es2015:audit:check');

      assertSame(
        scrub > taxonomy && scrub < run,
        true,
        'the committed report must remain available for the taxonomy audit and be removed before broad execution',
      );

      assertSame(
        select >= 0 && select < run,
        true,
        `the ES5 selection drift check must run before the pinned subset:\n${commands.join('\n')}`,
      );

      assertSame(
        drift > run && run >= 0,
        true,
        `the generated report and coverage document must be checked for drift after the run:\n${commands.join('\n')}`,
      );
      assertSame(
        job.steps.indexOf(uploads[0]) >
          job.steps.findIndex(
            (/** @type {any} */ step) =>
              step.run === 'npm run test262:upstream',
          ),
        true,
        'the upload publishes what the run just wrote',
      );

      const runStep = job.steps.find(
        (/** @type {any} */ step) => step.run === 'npm run test262:upstream',
      );

      assertSame(
        runStep?.env?.TZ,
        'UTC',
        'the pinned subset must run under TZ=UTC so the committed report and coverage are a pure function of the engine, not the runner time zone',
      );
    },
  },
  {
    name: 'the benchmark smoke job depends on vendor and performs correctness-only validation',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, 'benchmark-smoke');
      const commands = runCommands(job);

      assertSame(JSON.stringify(job.needs), JSON.stringify(['vendor']));
      assertSame(
        usesSteps(job, 'actions/upload-artifact').length,
        0,
        'benchmark-smoke must not upload artifacts',
      );
      assertSame(
        commands.includes('npm run benchmark:smoke'),
        true,
        `benchmark-smoke must run npm run benchmark:smoke, found: ${commands.join(' | ')}`,
      );

      for (const command of commands) {
        assertSame(
          /\b(threshold|baseline|regression)\b/i.test(command),
          false,
          `benchmark-smoke must stay correctness-only, found: ${command}`,
        );
      }
    },
  },
  {
    name: 'the workflow drift check is itself a CI job, not just a local script',
    run: async () => {
      const { workflow } = await readWorkflow();

      assertSame(
        runCommands(requireJob(workflow, 'ci-drift')).includes(
          'npm run ci:check',
        ),
        true,
      );
    },
  },
  {
    name: 'the committed workflow is exactly what the pipeline renders from the checked-in pin',
    run: async () => {
      const { jobs } = await loadCiPipeline();
      const committed = await readRepositoryFile(WORKFLOW_FILE);

      assertSame(committed, renderWorkflowYaml(jobs));
    },
  },
  {
    name: 'the supported-feature manifest parses and every feature it declares has its probe really executed',
    run: async () => {
      const manifest = parseFeatureManifest(
        await readRepositoryFile(FEATURES_MANIFEST_FILE),
      );
      const names = featureNames(manifest);

      assertSame(manifest.version, 1);
      assertSame(new Set(names).size, names.length);
      assertSame(names.join(','), [...names].sort().join(','));

      for (const feature of manifest.features) {
        const probe = runFeatureProbe({ engine, feature });

        assertSame(
          probe.outcome,
          'completed',
          `${feature.name}'s probe must run on this engine: ${probe.message}`,
        );

        const supported = await runTest262Suite({
          engine,
          host: probeHost(featureProbeTestSource(feature)),
          paths: ['probe.js'],
          supportedFeatures: [feature.name],
        });

        assertSame(supported.records[0].status, 'passed');

        const unsupported = await runTest262Suite({
          engine,
          host: probeHost(featureProbeTestSource(feature)),
          paths: ['probe.js'],
          supportedFeatures: [],
        });

        assertSame(unsupported.records[0].status, 'skipped');
        assertSame(unsupported.records[0].reason, 'unsupported-feature');
      }
    },
  },
  {
    name: 'the async runtime release manifest is host-neutral, immutable, and deterministic',
    run: async () => {
      const release = ASYNC_RUNTIME_RELEASE_MANIFEST;
      const suites = /** @type {const} */ (['generator', 'module', 'promise']);
      const expectedCounts = Object.freeze({
        generator: 11,
        module: 13,
        promise: 15,
      });
      const expectedSupportedFeatures = Object.freeze({
        generator: ['Symbol.iterator', 'Symbol.toStringTag', 'generators'],
        module: ['Symbol.toStringTag'],
        promise: ['Symbol.iterator', 'Symbol.species', 'Symbol.toStringTag'],
      });

      assertSame(
        await readRepositoryFile(ASYNC_RUNTIME_RELEASE_MANIFEST_FILE).then(
          (source) => source.includes('node:'),
        ),
        false,
        'the shared release manifest must stay host-neutral',
      );
      assertSame(Object.isFrozen(release), true);
      assertSame(JSON.stringify(Object.keys(release)), JSON.stringify(suites));

      const allPaths = [];

      for (const suite of suites) {
        const entry = release[suite];
        const paths = entry.records.map((record) => record.path);

        assertSame(Object.isFrozen(entry), true);
        assertSame(Object.isFrozen(entry.records), true);
        assertSame(Object.isFrozen(entry.supportedFeatures), true);
        assertSame(entry.records.length, expectedCounts[suite]);
        assertSame(JSON.stringify(paths), JSON.stringify([...paths].sort()));
        assertSame(
          JSON.stringify(entry.supportedFeatures),
          JSON.stringify(expectedSupportedFeatures[suite]),
        );

        for (const record of entry.records) {
          assertSame(Object.isFrozen(record), true);
          assertSame(Object.isFrozen(record.features), true);
          assertSame(Object.isFrozen(record.flags), true);
        }

        allPaths.push(...paths);
      }

      assertSame(new Set(allPaths).size, allPaths.length);
      assertSame(
        release.generator.records.every(
          (record) => JSON.stringify(record.flags) === '[]',
        ),
        true,
        'focused generator records must assert their exact empty flag lists',
      );
      assertSame(
        release.module.records.every(
          (record) => JSON.stringify(record.flags) === '["module"]',
        ),
        true,
      );
      assertSame(
        release.promise.records.some((record) =>
          record.flags.includes('async'),
        ),
        true,
      );
    },
  },
  {
    name: 'the focused async runtime release policy is explicit and deterministic',
    run: async () => {
      const manifest = parseFeatureManifest(
        await readRepositoryFile(FEATURES_MANIFEST_FILE),
      );
      const policy = parseEs5Selection(
        await readRepositoryFile(ES5_SELECTION_FILE),
      );
      const names = featureNames(manifest);
      const generator = manifest.features.find(
        (feature) => feature.name === 'generators',
      );

      assertSame(JSON.stringify(names), JSON.stringify([...names].sort()));
      assertSame(new Set(names).size, names.length);
      assertSame(generator?.probe, GENERATOR_PROBE);
      assertSame(
        JSON.stringify(generator?.tests),
        JSON.stringify(
          ASYNC_RUNTIME_RELEASE_MANIFEST.generator.records
            .filter((record) => record.features.includes('generators'))
            .map((record) => record.path),
        ),
        'generator probe evidence must be the nine focused roots tagged generators',
      );
      if (generator === undefined) {
        throw new Error('features.json must claim generators');
      }

      assertSame(
        runFeatureProbe({ engine, feature: generator }).outcome,
        'completed',
      );
      assertSame(
        JSON.stringify(
          names.filter((name) => ['Promise', 'async', 'module'].includes(name)),
        ),
        '[]',
        'Promise is untagged coverage and async/module are Test262 flags',
      );
      assertSame(
        JSON.stringify(UNSUPPORTED_FLAGS),
        JSON.stringify([
          'CanBlockIsFalse',
          'CanBlockIsTrue',
          'non-deterministic',
        ]),
      );
      assertSame(
        JSON.stringify(policy.excludedLanguageDirectories),
        JSON.stringify(['export', 'import', 'module-code']),
      );
      assertSame(policy.expansionFeatures.includes('generators'), true);

      for (const suite of /** @type {const} */ ([
        'generator',
        'module',
        'promise',
      ])) {
        const paths = ASYNC_RUNTIME_RELEASE_MANIFEST[suite].records.map(
          (record) => record.path,
        );
        const source = await readRepositoryFile(
          `test/ci/es2015-${suite}-test262.test.js`,
        );

        assertSame(JSON.stringify(paths), JSON.stringify([...paths].sort()));
        assertSame(
          source.includes('ASYNC_RUNTIME_RELEASE_MANIFEST'),
          true,
          `focused ${suite} suite must consume the shared release manifest`,
        );
      }

      const allFocusedPaths = Object.values(
        ASYNC_RUNTIME_RELEASE_MANIFEST,
      ).flatMap((suite) => suite.records.map((record) => record.path));

      assertSame(new Set(allFocusedPaths).size, allFocusedPaths.length);

      const generatorPaths =
        ASYNC_RUNTIME_RELEASE_MANIFEST.generator.records.map(
          (record) => record.path,
        );
      const generatorAreas = policy.featureAreas.filter((area) =>
        generatorPaths.includes(area.prefix),
      );

      assertSame(
        JSON.stringify(generatorAreas.map((area) => area.prefix)),
        JSON.stringify(generatorPaths),
      );
      for (const record of ASYNC_RUNTIME_RELEASE_MANIFEST.generator.records) {
        const area = generatorAreas.find(
          (candidate) => candidate.prefix === record.path,
        );

        assertSame(
          JSON.stringify(area?.features),
          JSON.stringify([...record.features].sort()),
          `${record.path} area features must equal its pinned metadata exactly`,
        );
        assertSame(
          area?.generatorSyntax,
          true,
          `${record.path} must carry exact-file generator syntax authorization`,
        );
      }
      assertSame(
        policy.featureAreas.some((area) =>
          [
            'test/built-ins/GeneratorFunction',
            'test/built-ins/GeneratorPrototype',
          ].includes(area.prefix),
        ),
        false,
        'generator admission must stay in exact-file structured policy',
      );

      const moduleMetadata = parseTest262Metadata(
        '/*---\ndescription: module\nflags: [module]\n---*/\n',
      );
      const asyncMetadata = parseTest262Metadata(
        '/*---\ndescription: async\nflags: [async]\n---*/\n',
      );
      const moduleAsyncMetadata = parseTest262Metadata(
        '/*---\ndescription: async module\nflags: [module, async]\n---*/\n',
      );
      const moduleRawMetadata = parseTest262Metadata(
        '/*---\ndescription: raw module\nflags: [module, raw]\n---*/\n',
      );

      assertSame(JSON.stringify(moduleMetadata.features), '[]');
      assertSame(JSON.stringify(asyncMetadata.features), '[]');
      assertSame(
        JSON.stringify(moduleAsyncMetadata.flags),
        '["module","async"]',
      );
      assertSame(
        JSON.stringify(decideSkip(moduleAsyncMetadata)),
        JSON.stringify({
          reason: 'unsupported-flag-combination',
          message: 'unsupported flag combination: module and async',
        }),
      );
      assertSame(
        JSON.stringify(expandVariants(moduleMetadata)),
        '["non-strict"]',
      );
      assertSame(
        JSON.stringify(expandVariants(asyncMetadata)),
        '["non-strict","strict"]',
      );
      assertSame(JSON.stringify(expandVariants(moduleRawMetadata)), '["raw"]');
      assertSame(JSON.stringify(resolveIncludes(moduleRawMetadata)), '[]');
      assertSame(
        JSON.stringify(
          expandVariants(
            parseTest262Metadata(
              '/*---\ndescription: strict\nflags: [onlyStrict]\n---*/\n',
            ),
          ),
        ),
        '["strict"]',
      );
      assertSame(
        JSON.stringify(
          expandVariants(
            parseTest262Metadata(
              '/*---\ndescription: sloppy\nflags: [noStrict]\n---*/\n',
            ),
          ),
        ),
        '["non-strict"]',
      );
      assertThrows(
        () =>
          parseTest262Metadata(
            '/*---\ndescription: raw async\nflags: [raw, async]\n---*/\n',
          ),
        Error,
      );
    },
  },
  {
    name: 'the Symbol.iterator probe rejects a realm missing the Array iterator protocol',
    run: async () => {
      const manifest = parseFeatureManifest(
        await readRepositoryFile(FEATURES_MANIFEST_FILE),
      );
      const feature = manifest.features.find(
        (candidate) => candidate.name === 'Symbol.iterator',
      );

      if (feature === undefined) {
        throw new Error('features.json must claim Symbol.iterator');
      }

      const probe = runFeatureProbe({
        engine: {
          createRealm() {
            const realm = createRealm();

            evaluateScript(realm, 'delete Array.prototype[Symbol.iterator];');

            return realm;
          },
          evaluateScript,
        },
        feature,
      });

      assertSame(
        probe.outcome === 'completed',
        false,
        'Symbol.iterator guards Array iterator feature areas and must probe Array.prototype[@@iterator]',
      );
    },
  },
  {
    name: 'the Symbol.iterator probe rejects a realm missing Array.prototype.keys',
    run: async () => {
      const manifest = parseFeatureManifest(
        await readRepositoryFile(FEATURES_MANIFEST_FILE),
      );
      const feature = manifest.features.find(
        (candidate) => candidate.name === 'Symbol.iterator',
      );

      if (feature === undefined) {
        throw new Error('features.json must claim Symbol.iterator');
      }

      const probe = runFeatureProbe({
        engine: {
          createRealm() {
            const realm = createRealm();

            evaluateScript(realm, 'delete Array.prototype.keys;');

            return realm;
          },
          evaluateScript,
        },
        feature,
      });

      assertSame(
        probe.outcome === 'completed',
        false,
        'Symbol.iterator guards Array.prototype.keys and must probe its iterator wiring',
      );
    },
  },
  {
    name: 'the Symbol.toStringTag probe rejects a realm missing the Array iterator tag',
    run: async () => {
      const manifest = parseFeatureManifest(
        await readRepositoryFile(FEATURES_MANIFEST_FILE),
      );
      const feature = manifest.features.find(
        (candidate) => candidate.name === 'Symbol.toStringTag',
      );

      if (feature === undefined) {
        throw new Error('features.json must claim Symbol.toStringTag');
      }

      const probe = runFeatureProbe({
        engine: {
          createRealm() {
            const realm = createRealm();

            evaluateScript(
              realm,
              'delete Object.getPrototypeOf([][Symbol.iterator]())[Symbol.toStringTag];',
            );

            return realm;
          },
          evaluateScript,
        },
        feature,
      });

      assertSame(
        probe.outcome === 'completed',
        false,
        'Symbol.toStringTag guards %ArrayIteratorPrototype% and must probe its @@toStringTag',
      );
    },
  },
  {
    name: 'the Symbol.toStringTag probe rejects a realm missing the String iterator tag',
    run: async () => {
      const manifest = parseFeatureManifest(
        await readRepositoryFile(FEATURES_MANIFEST_FILE),
      );
      const feature = manifest.features.find(
        (candidate) => candidate.name === 'Symbol.toStringTag',
      );

      if (feature === undefined) {
        throw new Error('features.json must claim Symbol.toStringTag');
      }

      const probe = runFeatureProbe({
        engine: {
          createRealm() {
            const realm = createRealm();

            evaluateScript(
              realm,
              "delete Object.getPrototypeOf(''[Symbol.iterator]())[Symbol.toStringTag];",
            );

            return realm;
          },
          evaluateScript,
        },
        feature,
      });

      assertSame(
        probe.outcome === 'completed',
        false,
        'Symbol.toStringTag guards %StringIteratorPrototype% and must probe its @@toStringTag',
      );
    },
  },
  {
    name: 'the feature manifest probes every supported runtime-foundation grammar feature',
    run: async () => {
      const manifest = parseFeatureManifest(
        await readRepositoryFile(FEATURES_MANIFEST_FILE),
      );

      for (const name of ['const', 'for-of', 'let']) {
        const feature = manifest.features.find(
          (candidate) => candidate.name === name,
        );

        assertSame(
          feature !== undefined,
          true,
          `${name} is implemented and must have an executable feature probe`,
        );

        if (feature !== undefined) {
          const probe = runFeatureProbe({ engine, feature });

          assertSame(
            probe.outcome,
            'completed',
            `${name}'s probe must exercise the implemented grammar: ${probe.message}`,
          );
        }
      }
    },
  },
  {
    name: 'the probe machinery is exercised by a synthetic feature, so an empty manifest is never a vacuous check',
    run: async () => {
      const manifest = parseFeatureManifest(SYNTHETIC_MANIFEST_TEXT);
      const [feature] = manifest.features;

      assertSame(runFeatureProbe({ engine, feature }).outcome, 'completed');

      const supported = await runTest262Suite({
        engine,
        host: probeHost(featureProbeTestSource(feature)),
        paths: ['probe.js'],
        supportedFeatures: [feature.name],
      });

      assertSame(supported.records[0].status, 'passed');
      assertSame(supported.records[0].variant, 'raw');

      const unsupported = await runTest262Suite({
        engine,
        host: probeHost(featureProbeTestSource(feature)),
        paths: ['probe.js'],
        supportedFeatures: [],
      });

      assertSame(unsupported.records[0].status, 'skipped');
      assertSame(unsupported.records[0].reason, 'unsupported-feature');
    },
  },
  {
    name: 'a probe that does not really run on this engine is reported, not silently accepted',
    run: () => {
      assertSame(
        runFeatureProbe({
          engine,
          feature: syntheticFeature('throw "probe failed";'),
        }).outcome,
        'threw',
      );
      assertSame(
        runFeatureProbe({
          engine,
          feature: syntheticFeature('var = ;'),
        }).outcome,
        'parse-error',
      );
      assertSame(
        runFeatureProbe({
          // Every ES5 construct now evaluates, so an engine limitation can no
          // longer be provoked from source (`with` used to be the example).
          // Model one directly: an engine whose `evaluateScript` throws a host
          // error that is not a SyntaxError must be reported as `engine-error`,
          // never silently accepted as `completed`.
          engine: {
            createRealm,
            evaluateScript() {
              throw new Error('synthetic engine limitation');
            },
          },
          feature: syntheticFeature('ENGINE_LIMITATION;'),
        }).outcome,
        'engine-error',
      );
      assertSame(
        runFeatureProbe({
          engine,
          feature: syntheticFeature('if (1 !== 1) { throw "unreachable"; }'),
        }).outcome,
        'completed',
      );
    },
  },
  {
    name: 'parseFeatureManifest rejects every malformed manifest shape',
    run: () => {
      const reject = (/** @type {string} */ text) =>
        assertThrows(
          () => parseFeatureManifest(text),
          Test262FeatureManifestError,
        );

      reject('not json');
      reject('[]');
      reject('{}');
      reject(JSON.stringify({ version: 2, features: [] }));
      reject(JSON.stringify({ version: 1 }));
      reject(JSON.stringify({ version: 1, features: [], extra: true }));
      reject(JSON.stringify({ version: 1, features: ['Proxy'] }));
      reject(JSON.stringify({ version: 1, features: [{ name: 'Proxy' }] }));
      reject(
        JSON.stringify({
          version: 1,
          features: [{ name: '', probe: 'var x;', tests: ['test/a.js'] }],
        }),
      );
      reject(
        JSON.stringify({
          version: 1,
          features: [{ name: 'Proxy', probe: '', tests: ['test/a.js'] }],
        }),
      );
      reject(
        JSON.stringify({
          version: 1,
          features: [{ name: 'Proxy', probe: 'var x;', tests: [] }],
        }),
      );
      reject(
        JSON.stringify({
          version: 1,
          features: [
            { name: 'Proxy', probe: 'var x;', tests: ['harness/assert.js'] },
          ],
        }),
      );
      reject(
        JSON.stringify({
          version: 1,
          features: [
            { name: 'Proxy', probe: 'var x;', tests: ['test/a.js'] },
            { name: 'Proxy', probe: 'var y;', tests: ['test/b.js'] },
          ],
        }),
      );
      reject(
        JSON.stringify({
          version: 1,
          features: [
            { name: 'Reflect', probe: 'var x;', tests: ['test/a.js'] },
            { name: 'Proxy', probe: 'var y;', tests: ['test/b.js'] },
          ],
        }),
      );
    },
  },
  {
    name: 'resolveSupportedFeatures lets an explicit list win and otherwise reads the manifest for real',
    run: () => {
      assertSame(
        resolveSupportedFeatures({
          cliFeatures: ['Zeta', 'Alpha'],
          manifestText: 'not json',
        }).join(','),
        'Alpha,Zeta',
      );
      assertSame(
        resolveSupportedFeatures({
          cliFeatures: undefined,
          manifestText: SYNTHETIC_MANIFEST_TEXT,
        }).join(','),
        'jsjs-arithmetic-probe',
      );
      assertThrows(
        () =>
          resolveSupportedFeatures({
            cliFeatures: undefined,
            manifestText: 'not json',
          }),
        Test262FeatureManifestError,
      );
    },
  },
  {
    name: 'the pinned upstream subset names the same revision package.json pins',
    run: async () => {
      const packageManifest = await readPackageManifest();
      const subset = parseUpstreamSubset(
        await readRepositoryFile(UPSTREAM_SUBSET_FILE),
      );
      const paths = upstreamSubsetPaths(subset);

      assertSame(subset.revision, packageManifest.test262.revision);
      assertSame(subset.repository, packageManifest.test262.repository);
      assertSame(paths.length > 0, true, 'the subset selects tests');
      assertSame(new Set(paths).size, paths.length);
      assertSame(paths.join('\n'), [...paths].sort().join('\n'));

      for (const path of paths) {
        assertSame(
          path.startsWith('test/') && path.endsWith('.js'),
          true,
          `${path} must be an upstream-relative test path`,
        );
      }
    },
  },
  {
    name: 'the pinned upstream subset covers the completed ES5 Date families with representative fixtures',
    run: async () => {
      const subset = parseUpstreamSubset(
        await readRepositoryFile(UPSTREAM_SUBSET_FILE),
      );
      const selected = new Set(upstreamSubsetPaths(subset));

      for (const [name, paths] of Object.entries(DATE_GROUPS)) {
        for (const path of paths) {
          assertSame(
            selected.has(path),
            true,
            `${name} coverage lost representative fixture ${path}`,
          );
        }
      }
    },
  },
  {
    name: 'the upstream subset summary is deterministic and reports the feature baseline',
    run: async () => {
      const subset = parseUpstreamSubset(
        await readRepositoryFile(UPSTREAM_SUBSET_FILE),
      );
      const paths = upstreamSubsetPaths(subset);
      const records = paths.map((file) => ({
        type: /** @type {const} */ ('test'),
        file,
        variant: /** @type {string | null} */ ('non-strict'),
        status: /** @type {const} */ ('passed'),
      }));
      const summary = summarizeUpstreamRun({
        subset,
        records,
        supportedFeatures: [],
      });
      const lines = formatUpstreamSummaryLines(summary);

      assertSame(
        lines.join('\n'),
        formatUpstreamSummaryLines(
          summarizeUpstreamRun({ subset, records, supportedFeatures: [] }),
        ).join('\n'),
        'the same inputs must summarize byte-identically',
      );
      assertSame(summary.groups.length, subset.groups.length);
      assertSame(
        summary.groups.map((group) => group.group).join(','),
        subset.groups.map((group) => group.name).join(','),
      );
      assertSame(
        summary.groups.reduce((total, group) => total + group.passed, 0),
        paths.length,
      );
      assertSame(summary.features.supported.join(','), '');
      assertSame(summary.features.tagged.join(','), '');
      assertSame(summary.features.untagged, paths.length);
      assertSame(lines[0].startsWith('{"type":"baseline"'), true);
      assertSame(
        lines[lines.length - 1].startsWith('{"type":"features"'),
        true,
      );
    },
  },
  {
    name: 'the upstream subset summary counts feature-tagged and skipped records honestly',
    run: async () => {
      const subset = parseUpstreamSubset(
        await readRepositoryFile(UPSTREAM_SUBSET_FILE),
      );
      const [path] = upstreamSubsetPaths(subset);
      const summary = summarizeUpstreamRun({
        subset,
        records: [
          {
            type: 'test',
            file: path,
            variant: null,
            status: 'skipped',
            reason: 'unsupported-feature',
            features: ['Proxy'],
          },
        ],
        supportedFeatures: ['Reflect'],
      });

      assertSame(summary.features.tagged.join(','), 'Proxy');
      assertSame(summary.features.supported.join(','), 'Reflect');
      assertSame(summary.features.untagged, 0);
      assertSame(
        summary.groups.reduce((total, group) => total + group.skipped, 0),
        1,
      );
    },
  },
  {
    name: 'broad Test262 result policy rejects skips and incomplete coverage',
    run: () => {
      const resultPasses = /** @type {any} */ (upstreamOperations)
        .upstreamRunResultPasses;
      assertSame(typeof resultPasses, 'function');

      const summary = { total: 2, passed: 2, failed: 0, skipped: 0 };
      const coverage = {
        files: { selected: 1, attempted: 1, passed: 1 },
        records: { selected: 2, attempted: 2, passed: 2 },
      };
      assertSame(resultPasses({ summary, coverage }), true);

      for (const incomplete of [
        {
          summary: { ...summary, passed: 1, skipped: 1 },
          coverage,
        },
        {
          summary,
          coverage: {
            ...coverage,
            files: { selected: 1, attempted: 0, passed: 0 },
          },
        },
        {
          summary,
          coverage: {
            ...coverage,
            records: { selected: 2, attempted: 2, passed: 1 },
          },
        },
      ]) {
        assertSame(resultPasses(incomplete), false);
      }
    },
  },
  {
    name: 'parseUpstreamSubset rejects every malformed subset shape',
    run: () => {
      const base = {
        version: 1,
        repository: 'https://github.com/tc39/test262.git',
        revision: 'b363f29d3c43c626dc852744ad64a0b48a003693',
        groups: [
          {
            name: 'types',
            summary: 'primitive types',
            paths: ['test/language/types/null/S8.2_A1_T1.js'],
          },
        ],
      };
      const reject = (/** @type {unknown} */ value) =>
        assertThrows(
          () => parseUpstreamSubset(JSON.stringify(value)),
          Test262UpstreamSubsetError,
        );

      assertThrows(
        () => parseUpstreamSubset('not json'),
        Test262UpstreamSubsetError,
      );
      reject([]);
      reject({ ...base, version: 2 });
      reject({ ...base, extra: true });
      reject({ ...base, revision: 'not-a-sha' });
      reject({ ...base, groups: [] });
      reject({ ...base, groups: [{ ...base.groups[0], name: '' }] });
      reject({ ...base, groups: [{ ...base.groups[0], paths: [] }] });
      reject({
        ...base,
        groups: [{ ...base.groups[0], paths: ['harness/assert.js'] }],
      });
      reject({
        ...base,
        groups: [{ ...base.groups[0], paths: ['test/b.js', 'test/a.js'] }],
      });
      reject({
        ...base,
        groups: [base.groups[0], { ...base.groups[0], name: 'statements' }],
      });
      reject({
        ...base,
        groups: [
          { ...base.groups[0], name: 'zzz' },
          { ...base.groups[0], name: 'aaa', paths: ['test/other.js'] },
        ],
      });
    },
  },

  // --- Trusted provenance base guard --------------------------------------
  //
  // The tests below pin the workflow contract for the guard specified in
  // "Prerequisite Amendment: Trusted Provenance Base Guard" — a dedicated
  // pull_request_target job that runs a base-authored checker against a
  // GitHub-declared base/head, never HEAD's own workflow or checkout. Every
  // expectation is written out independently above, not imported from the
  // generator, so any drift in `tools/ci/pipeline.js` or in the committed
  // `.github/workflows/ci.yml` fails here.

  {
    name: 'the committed workflow adds an unfiltered pull_request_target trigger with the exact rerun types',
    run: async () => {
      const { workflow } = await readWorkflow();

      assertSame(
        JSON.stringify(workflow.on?.pull_request_target?.types),
        JSON.stringify(EXPECTED_PR_TARGET_TYPES),
        'pull_request_target must rerun on opened, synchronize, reopened, and edited',
      );
      assertSame(
        JSON.stringify(Object.keys(workflow.on?.pull_request_target ?? {})),
        JSON.stringify(['types']),
        'pull_request_target must declare only types — no paths, paths-ignore, branches, or branches-ignore',
      );
      assertSame(
        JSON.stringify(Object.keys(workflow.on?.pull_request ?? {})),
        JSON.stringify(['types']),
        'the existing pull_request trigger must stay free of path or branch filters too',
      );
    },
  },
  {
    name: 'the unconditional provenance base guard job stays on its explicit runner with an event-qualified concurrency group, a five-minute timeout, and no dependencies',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, GUARD_JOB_ID);

      assertSame(
        job.if,
        undefined,
        'the guard must stay unconditional so GitHub evaluates its active/inactive job name on every event',
      );
      assertSame(job['runs-on'], GUARD_RUNNER);
      assertSame(job['timeout-minutes'], GUARD_TIMEOUT_MINUTES);
      assertSame(
        Object.prototype.hasOwnProperty.call(job, 'needs'),
        false,
        'the guard must not declare needs — it depends on no other job',
      );
      assertSame(
        JSON.stringify(job.concurrency),
        JSON.stringify(GUARD_CONCURRENCY),
        'the guard concurrency group must be keyed by github.event_name plus the server PR number with cancel-in-progress',
      );
      const pullRequestGroup = renderGuardConcurrencyGroup(
        job.concurrency.group,
        'pull_request',
        '106',
      );
      const pullRequestTargetGroup = renderGuardConcurrencyGroup(
        job.concurrency.group,
        'pull_request_target',
        '106',
      );
      const repeatedPullRequestTargetGroup = renderGuardConcurrencyGroup(
        job.concurrency.group,
        'pull_request_target',
        '106',
      );

      assertSame(
        pullRequestGroup === pullRequestTargetGroup,
        false,
        'pull_request and pull_request_target must use distinct concurrency groups for the same PR number',
      );
      assertSame(
        repeatedPullRequestTargetGroup,
        pullRequestTargetGroup,
        'repeated runs of the same event and PR number must keep the same concurrency group so stale runs are cancelled',
      );
    },
  },
  {
    name: 'the guard and every existing job select their display name only from github.event_name, and no other job is a passthrough for the guard requirement',
    run: async () => {
      const { workflow } = await readWorkflow();
      const guardJob = requireJob(workflow, GUARD_JOB_ID);

      assertSame(
        guardJob.if,
        undefined,
        'GitHub leaves an expression-valued skipped-job name raw, so the guard job itself must not have a job-level if',
      );
      assertSame(guardJob.name, GUARD_NAME_EXPRESSION);
      assertNameExpressionOnlyDependsOnEventName(
        guardJob.name,
        'the guard job name',
      );

      for (const [id, ordinaryName] of Object.entries(ORDINARY_JOB_NAMES)) {
        const job = requireJob(workflow, id);

        assertSame(
          job.if,
          EXISTING_JOB_PRIVILEGED_EXCLUSION,
          `${id} must be excluded from the privileged pull_request_target event`,
        );
        assertSame(
          job.name,
          inactiveOnPullRequestTargetName(ordinaryName),
          `${id} must keep its ordinary name and gain a distinct inactive name`,
        );
        assertNameExpressionOnlyDependsOnEventName(
          job.name,
          `the ${id} job name`,
        );
      }
    },
  },
  {
    name: 'the unconditional guard renders the exact active and inactive contexts, and only the mutually exclusive step set for each event',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, GUARD_JOB_ID);
      const render = (/** @type {string} */ eventName) => ({
        name: evaluateEventNameExpression(job.name, eventName),
        steps: (job.steps ?? [])
          .filter((/** @type {{ if?: string }} */ step) =>
            matchesEventNameCondition(step.if, eventName),
          )
          .map((/** @type {{ name: string }} */ step) => step.name),
      });

      const push = render('push');
      const pullRequest = render('pull_request');
      const pullRequestTarget = render('pull_request_target');

      assertSame(
        push.name,
        GUARD_INACTIVE_NAME,
        'push must render the distinct inactive informational context',
      );
      assertSame(
        pullRequest.name,
        GUARD_INACTIVE_NAME,
        'pull_request must render the distinct inactive informational context',
      );
      assertSame(
        pullRequestTarget.name,
        GUARD_ACTIVE_NAME,
        'pull_request_target must render the exact required guard context',
      );
      assertSame(
        JSON.stringify(push.steps),
        JSON.stringify([GUARD_INACTIVE_STEP_NAME]),
        'push must execute only the inactive no-op step',
      );
      assertSame(
        JSON.stringify(pullRequest.steps),
        JSON.stringify([GUARD_INACTIVE_STEP_NAME]),
        'pull_request must execute only the inactive no-op step',
      );
      assertSame(
        JSON.stringify(pullRequestTarget.steps),
        JSON.stringify(GUARD_ACTIVE_STEP_NAMES),
        'pull_request_target must execute every guard step and skip the inactive no-op',
      );
    },
  },
  {
    name: 'every rendered active and inactive display name is unique, so no name containing "(inactive" can ever satisfy the guard requirement or an ordinary required job context',
    run: () => {
      const activeNames = [
        GUARD_ACTIVE_NAME,
        ...Object.values(ORDINARY_JOB_NAMES),
      ];
      const inactiveNames = [
        GUARD_INACTIVE_NAME,
        ...Object.values(ORDINARY_JOB_NAMES).map(
          (name) => `${name} (inactive on pull_request_target)`,
        ),
      ];

      assertSame(
        new Set(activeNames).size,
        activeNames.length,
        'every active display name (the exact guard name plus every ordinary job name) must be unique',
      );
      assertSame(
        new Set(inactiveNames).size,
        inactiveNames.length,
        'every inactive display name must be unique',
      );

      for (const inactiveName of inactiveNames) {
        assertSame(
          inactiveName.includes('(inactive'),
          true,
          `${inactiveName} must be recognizable as an inactive rendering`,
        );
        assertSame(
          activeNames.includes(inactiveName),
          false,
          `an inactive rendering (${JSON.stringify(inactiveName)}) must never equal the exact guard name or an exact ordinary required job name`,
        );
      }
    },
  },
  {
    name: 'the guard job performs exactly the ten steps the design specifies, in order, with no others',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, GUARD_JOB_ID);

      assertSame(
        JSON.stringify((job.steps ?? []).map((/** @type {any} */ s) => s.name)),
        JSON.stringify(GUARD_STEP_NAMES),
        'the guard must contain exactly these steps, in this order, and no setup, install, or extra step',
      );
      assertAdjacentWorkflowSteps(job.steps, GUARD_STEP_NAMES);
    },
  },
  {
    name: 'the guard job and every guard step declare an exact key set, so no job-level env, continue-on-error, strategy, container, services, step-level shell, working-directory, or any other unexpected key can widen the guard',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, GUARD_JOB_ID);

      assertExactKeys(
        job,
        GUARD_JOB_KEYS,
        'the guard job must declare exactly these keys',
      );

      for (const key of FORBIDDEN_GUARD_JOB_KEYS) {
        assertSame(
          Object.prototype.hasOwnProperty.call(job, key),
          false,
          `the guard job must never declare ${key}`,
        );
      }

      const steps = /** @type {any[]} */ (job.steps ?? []);

      assertSame(
        JSON.stringify(steps.map((/** @type {any} */ step) => step.name)),
        JSON.stringify(GUARD_STEP_NAMES),
        'the exact ten-step sequence must be pinned before its per-step key sets are checked',
      );

      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        const stepName = GUARD_STEP_NAMES[index];

        assertExactKeys(
          step,
          GUARD_STEP_KEYS[index],
          `guard step "${stepName}" must declare exactly these keys`,
        );

        for (const key of FORBIDDEN_GUARD_STEP_KEYS) {
          assertSame(
            Object.prototype.hasOwnProperty.call(step, key),
            false,
            `guard step "${stepName}" must never declare ${key}`,
          );
        }
      }

      // The exact-key helper must be non-vacuous: every widening key rejected
      // above has to make it throw when spliced into an otherwise valid copy of
      // the real job or step, and a dropped required key has to throw too.
      for (const key of [...FORBIDDEN_GUARD_JOB_KEYS, 'defaults', 'outputs']) {
        assertThrows(
          () =>
            assertExactKeys(
              { ...job, [key]: 'widened' },
              GUARD_JOB_KEYS,
              'mutant guard job',
            ),
          Error,
        );
      }

      const jobWithoutConcurrency = Object.fromEntries(
        Object.entries(job).filter(([key]) => key !== 'concurrency'),
      );

      assertThrows(
        () =>
          assertExactKeys(
            jobWithoutConcurrency,
            GUARD_JOB_KEYS,
            'guard job missing concurrency',
          ),
        Error,
      );

      for (const key of [
        ...FORBIDDEN_GUARD_STEP_KEYS,
        'id',
        'timeout-minutes',
      ]) {
        assertThrows(
          () =>
            assertExactKeys(
              { ...steps[0], [key]: 'widened' },
              GUARD_RUN_ENV_STEP_KEYS,
              'mutant guard run+env step',
            ),
          Error,
        );
        assertThrows(
          () =>
            assertExactKeys(
              { ...steps[1], [key]: 'widened' },
              GUARD_USES_STEP_KEYS,
              'mutant guard uses step',
            ),
          Error,
        );
        assertThrows(
          () =>
            assertExactKeys(
              { ...steps[4], [key]: 'widened' },
              GUARD_RUN_STEP_KEYS,
              'mutant guard run step',
            ),
          Error,
        );
      }
    },
  },
  {
    name: 'the guard validation step runs the fixed printf/grep pipeline against every canonical-target identity, per-step only',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, GUARD_JOB_ID);
      const step = job.steps.find(
        (/** @type {any} */ s) => s.name === GUARD_STEP_NAMES[0],
      );

      assertSame(step.run, EXPECTED_GUARD_VALIDATE_COMMAND);
      assertSame(
        JSON.stringify(step.env),
        JSON.stringify(GUARD_VALIDATE_ENV),
        'the validation step must receive exactly the six identity variables it checks',
      );
      assertSame(
        step.if,
        GUARD_CONDITION,
        'validation must be event-gated at the step level',
      );
    },
  },
  {
    name: 'the guard checks out the event base SHA with full history and no persisted credentials or submodules',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, GUARD_JOB_ID);
      const checkouts = usesSteps(job, 'actions/checkout');

      assertSame(checkouts.length, 1, 'the guard must check out exactly once');

      const [checkout] = checkouts;

      assertSame(checkout.name, GUARD_STEP_NAMES[1]);
      assertSame(
        checkout.if,
        GUARD_CONDITION,
        'the base checkout must be event-gated at the step level',
      );
      assertSame(
        JSON.stringify(checkout.with),
        JSON.stringify({
          ref: '${{ github.event.pull_request.base.sha }}',
          'fetch-depth': '0',
          'persist-credentials': 'false',
          submodules: 'false',
        }),
      );
      assertSame(
        checkout.env,
        undefined,
        'the checkout action needs no step env — its ref is a direct input',
      );
    },
  },
  {
    name: 'the guard attests the checked-out worktree is exactly the event base commit before trusting it',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, GUARD_JOB_ID);
      const step = job.steps.find(
        (/** @type {any} */ s) => s.name === GUARD_STEP_NAMES[2],
      );

      assertSame(step.run, EXPECTED_GUARD_CHECKOUT_ATTEST_COMMAND);
      assertSame(
        step.if,
        GUARD_CONDITION,
        'the base checkout attestation must be event-gated at the step level',
      );
      assertSame(
        JSON.stringify(step.env),
        JSON.stringify(GUARD_CHECKOUT_ATTEST_ENV),
      );
    },
  },
  {
    name: 'the guard sets up Node 20 without any cache or dependency install',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, GUARD_JOB_ID);
      const setups = usesSteps(job, 'actions/setup-node');

      assertSame(setups.length, 1);
      assertSame(
        setups[0].if,
        GUARD_CONDITION,
        'setup-node must be event-gated at the step level',
      );
      assertSame(
        JSON.stringify(setups[0].with),
        JSON.stringify({ 'node-version': '20' }),
        'the guard setup-node step must not request npm caching',
      );
      assertSame(
        runCommands(job).some((command) => command.startsWith('npm')),
        false,
        'the guard must never run npm ci or any other npm command',
      );
    },
  },
  {
    name: 'the guard fetches the live main target ref and attests it against both BASE_SHA and the checked-out base checkout',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, GUARD_JOB_ID);
      const fetchStep = job.steps.find(
        (/** @type {any} */ s) => s.name === GUARD_STEP_NAMES[4],
      );
      const attestStep = job.steps.find(
        (/** @type {any} */ s) => s.name === GUARD_STEP_NAMES[5],
      );

      assertSame(fetchStep.run, EXPECTED_GUARD_FETCH_BASE_COMMAND);
      assertSame(
        fetchStep.if,
        GUARD_CONDITION,
        'the live target fetch must be event-gated at the step level',
      );
      assertSame(
        fetchStep.env,
        undefined,
        'the live target fetch is a fixed refs/heads/main fetch and must not take step env',
      );
      assertSame(attestStep.run, EXPECTED_GUARD_ATTEST_BASE_COMMAND);
      assertSame(
        attestStep.if,
        GUARD_CONDITION,
        'the live target attestation must be event-gated at the step level',
      );
      assertSame(
        JSON.stringify(attestStep.env),
        JSON.stringify(GUARD_ATTEST_BASE_ENV),
      );
      assertSame(
        usesSteps(job, 'actions/checkout').some((step) =>
          JSON.stringify(step.with ?? {}).includes('provenance-target-main'),
        ),
        false,
        'the fetched live target ref must never be checked out',
      );
    },
  },
  {
    name: 'the guard fetches only the base repository advertised PR ref and attests both the ref and FETCH_HEAD against the event head SHA',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, GUARD_JOB_ID);
      const fetchStep = job.steps.find(
        (/** @type {any} */ s) => s.name === GUARD_STEP_NAMES[6],
      );
      const attestStep = job.steps.find(
        (/** @type {any} */ s) => s.name === GUARD_STEP_NAMES[7],
      );

      assertSame(fetchStep.run, EXPECTED_GUARD_FETCH_COMMAND);
      assertSame(
        fetchStep.if,
        GUARD_CONDITION,
        'the PR-head fetch must be event-gated at the step level',
      );
      assertSame(
        JSON.stringify(fetchStep.env),
        JSON.stringify(GUARD_FETCH_ENV),
      );
      assertSame(attestStep.run, EXPECTED_GUARD_FETCH_ATTEST_COMMAND);
      assertSame(
        attestStep.if,
        GUARD_CONDITION,
        'the PR-head attestation must be event-gated at the step level',
      );
      assertSame(
        JSON.stringify(attestStep.env),
        JSON.stringify(GUARD_FETCH_ATTEST_ENV),
      );
    },
  },
  {
    name: 'the guard checker step is the only step carrying PR_BODY or TZ, and it receives exactly base/head/body/UTC',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, GUARD_JOB_ID);
      const checkerStep = job.steps.find(
        (/** @type {any} */ s) => s.name === GUARD_STEP_NAMES[8],
      );

      assertSame(checkerStep.run, EXPECTED_GUARD_CHECKER_COMMAND);
      assertSame(
        checkerStep.if,
        GUARD_CONDITION,
        'the checker must be event-gated at the step level',
      );
      assertSame(
        JSON.stringify(checkerStep.env),
        JSON.stringify(GUARD_CHECKER_ENV),
      );
      assertSame(
        Object.prototype.hasOwnProperty.call(checkerStep.env, 'PR_NUMBER'),
        false,
        'the PR number must not reach the checker step',
      );

      for (const step of job.steps) {
        if (step.name === GUARD_STEP_NAMES[8]) continue;
        const env = step.env ?? {};
        assertSame(
          Object.prototype.hasOwnProperty.call(env, 'PR_BODY'),
          false,
          `${step.name} must not receive PR_BODY`,
        );
        assertSame(
          Object.prototype.hasOwnProperty.call(env, 'TZ'),
          false,
          `${step.name} must not receive TZ — only the checker runs under fixed TZ: UTC`,
        );
      }
    },
  },
  {
    name: 'the guard ends with a distinct inactive no-op step for non-privileged events',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, GUARD_JOB_ID);
      const step = job.steps.find(
        (/** @type {any} */ s) => s.name === GUARD_INACTIVE_STEP_NAME,
      );

      assertSame(step.if, EXISTING_JOB_PRIVILEGED_EXCLUSION);
      assertSame(step.run, EXPECTED_GUARD_INACTIVE_COMMAND);
      assertSame(
        step.env,
        undefined,
        'the inactive no-op must not take any step env',
      );
    },
  },
  {
    name: 'a fork-shaped pull_request_target event cannot make the guard use the PR head repository as a remote or checkout input',
    run: async () => {
      const { workflow } = await readWorkflow();
      // `requireJob` fails loudly if the guard job ever leaves the committed
      // workflow; every assertion below then runs against the parsed job.
      const job = requireJob(workflow, GUARD_JOB_ID);

      // No step may take the PR head repository as an action `with` input
      // (e.g. a checkout `repository:`) under any of its possible names.
      const headRepositoryExpressions = [
        '${{ github.event.pull_request.head.repo.full_name }}',
        '${{ github.event.pull_request.head.repo.clone_url }}',
        '${{ github.event.pull_request.head.repo.html_url }}',
        '${{ github.event.pull_request.head.repo.ssh_url }}',
      ];
      for (const step of job.steps ?? []) {
        for (const [key, value] of Object.entries(step.with ?? {})) {
          assertSame(
            headRepositoryExpressions.includes(value),
            false,
            `${step.name}'s ${key} input must not source the PR head repository`,
          );
        }
      }

      // Executable proof, against the guard's own *parsed* fetch and
      // fetch-attestation commands (not the hand `EXPECTED_GUARD_*` literals):
      // a fork that advertises the same PR number with a *different* head
      // commit is never consulted, because it is never added as a remote —
      // there is no remote/URL input wired to `head.repo` anywhere for the
      // fetch to reach it through.
      const base = initGuardFixtureRepository();
      const fork = initGuardFixtureRepository();
      const clone = initGuardFixtureRepository();
      try {
        const baseHeadSha = commitGuardFixtureFile(base);
        const baseAdvertise = runGit(base, [
          'update-ref',
          'refs/pull/77/head',
          baseHeadSha,
        ]);
        assertSame(
          baseAdvertise.status,
          0,
          `the base fixture must advertise its PR ref: ${baseAdvertise.stderr}`,
        );

        // The fork advertises the *same* PR number under its own,
        // never-added-as-a-remote history, with a different head commit.
        const forkHeadSha = commitGuardFixtureFile(fork);
        const forkAdvertise = runGit(fork, [
          'update-ref',
          'refs/pull/77/head',
          forkHeadSha,
        ]);
        assertSame(
          forkAdvertise.status,
          0,
          `the fork fixture must advertise its own PR ref: ${forkAdvertise.stderr}`,
        );

        const remote = runGit(clone, [
          ...GUARD_FIXTURE_IDENTITY,
          'remote',
          'add',
          'origin',
          base,
        ]);
        assertSame(
          remote.status,
          0,
          `the clone must add only the base repository as origin: ${remote.stderr}`,
        );
        // The fork is deliberately never added as a remote anywhere.

        const fetchStep = job.steps.find(
          (/** @type {any} */ s) => s.name === GUARD_STEP_NAMES[6],
        );
        const attestStep = job.steps.find(
          (/** @type {any} */ s) => s.name === GUARD_STEP_NAMES[7],
        );

        const fetch = runGuardShellCommand(fetchStep.run, clone, {
          PR_NUMBER: '77',
        });
        assertSame(
          fetch.status,
          0,
          `fetching the advertised PR ref through the base origin must succeed: ${fetch.stderr}`,
        );

        const attestsBaseHead = runGuardShellCommand(attestStep.run, clone, {
          PR_NUMBER: '77',
          HEAD_SHA: baseHeadSha,
        });
        assertSame(
          attestsBaseHead.status,
          0,
          `the base repository's own head commit must attest: ${attestsBaseHead.stderr}`,
        );

        const attestsForkHead = runGuardShellCommand(attestStep.run, clone, {
          PR_NUMBER: '77',
          HEAD_SHA: forkHeadSha,
        });
        assertSame(
          attestsForkHead.status === 0,
          false,
          "a fork's head commit, never fetched because the fork was never added as a remote, must fail attestation — a different head repository cannot become a remote or URL input",
        );
      } finally {
        rmSync(base, { recursive: true, force: true });
        rmSync(fork, { recursive: true, force: true });
        rmSync(clone, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'the guard job never introduces an unsafe checkout, secret, write permission, cache, artifact, reusable workflow call, unpinned action, or command-line PR body interpolation',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, GUARD_JOB_ID);
      const serialized = JSON.stringify(job);

      assertSame(
        job.uses === undefined,
        true,
        'the guard must be an ordinary job, not a reusable workflow call',
      );
      for (const value of Object.values(job.permissions ?? {})) {
        assertSame(value, 'read', 'every guard permission must be read-only');
      }
      assertSame(
        serialized.includes('secrets.'),
        false,
        'the guard must never read a repository, organization, or environment secret',
      );
      assertSame(
        serialized.includes('allow-unsafe-pr-checkout'),
        false,
        'the guard must never opt out of safe checkout',
      );
      // Three of the required per-step env tables legitimately carry
      // `${{ github.event.pull_request.head.sha }}` as data (GUARD_VALIDATE_ENV,
      // GUARD_FETCH_ATTEST_ENV, GUARD_CHECKER_ENV all pass HEAD_SHA to a shell
      // variable for comparison, never for checkout) — so a blanket
      // "job JSON never contains this substring" assertion is wrong. What must
      // never happen is the PR head SHA reaching an action `with` input (e.g.
      // a checkout `ref`) or being executed/interpolated directly inside a
      // `run` command; a data-only env value is safe.
      for (const step of job.steps ?? []) {
        for (const [key, value] of Object.entries(step.with ?? {})) {
          assertSame(
            value !== GUARD_HEAD_SHA_EXPRESSION,
            true,
            `${step.name}'s ${key} input must not take the PR head SHA — only the base SHA may be checked out`,
          );
        }
        if (typeof step.run === 'string') {
          assertSame(
            step.run.includes('pull_request.head.sha'),
            false,
            `${step.name} must not execute the PR head SHA directly in run — HEAD_SHA may reach a step only as a data-only env variable`,
          );
        }
      }
      assertSame(
        EXPECTED_GUARD_CHECKER_COMMAND.includes('$PR_BODY'),
        false,
        'the PR body must reach the checker only via --pr-body-env, never spliced into the command line',
      );

      for (const step of job.steps ?? []) {
        if (typeof step.uses === 'string') {
          assertSame(
            /^[^@]+@[0-9a-f]{40}$/.test(step.uses),
            true,
            `${step.uses} must be pinned to a full commit SHA`,
          );
          assertSame(
            step.uses.includes('actions/cache'),
            false,
            'the guard must not restore or save a cache',
          );
          assertSame(
            step.uses.toLowerCase().includes('artifact'),
            false,
            'the guard must not upload or download an artifact',
          );
        }
      }
    },
  },
  {
    name: 'no job in the committed workflow embeds a live GitHub Actions expression directly in a run command',
    run: async () => {
      const { workflow } = await readWorkflow();

      for (const id of Object.keys(workflow.jobs)) {
        for (const step of workflow.jobs[id].steps ?? []) {
          if (typeof step.run === 'string') {
            assertSame(
              step.run.includes('${{'),
              false,
              `${id} step ${step.name} must pass event data through env, not interpolate it into run: ${step.run}`,
            );
          }
        }
      }
    },
  },
  {
    name: 'every generated job name, step name, and step run is a byte-preserving YAML plain scalar',
    run: async () => {
      const { workflow } = await readWorkflow();
      const expectedJobIds = [
        ...Object.keys(EXPECTED_JOB_COMMANDS),
        GUARD_JOB_ID,
      ];

      for (const id of expectedJobIds) {
        const job = requireJob(workflow, id);

        assertPlainScalarSafe(job.name, `job ${id} name`);
        assertRoundTripsAsPlainScalar(job.name, `job ${id} name`);

        for (const step of job.steps ?? []) {
          if (typeof step.name === 'string') {
            assertPlainScalarSafe(step.name, `${id} step name "${step.name}"`);
            assertRoundTripsAsPlainScalar(step.name, `${id} step name`);
          }
          if (typeof step.run === 'string') {
            assertPlainScalarSafe(step.run, `${id} step "${step.name}" run`);
            assertRoundTripsAsPlainScalar(
              step.run,
              `${id} step "${step.name}" run`,
            );
          }
        }
      }
    },
  },
  {
    name: 'the legacy ordinary-PR "Check provenance PR range" step stays byte-for-byte unchanged and defense-in-depth only',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, 'test262-upstream');
      const step = job.steps.find(
        (/** @type {any} */ s) => s.name === 'Check provenance PR range',
      );

      assertProvenanceRangeStep(step);
      assertSame(
        step.if,
        "github.event_name == 'pull_request'",
        'the legacy step must remain scoped to pull_request and never run under pull_request_target',
      );
    },
  },
  {
    name: 'the guard validation command accepts only the canonical base repository, workflow repository, main ref, full-hex SHAs, and a positive PR number',
    run: () => {
      const fixture = initGuardFixtureRepository();
      try {
        const validEnv = {
          BASE_REPOSITORY: 'yoonbuck/jsjs',
          WORKFLOW_REPOSITORY: 'yoonbuck/jsjs',
          BASE_REF: 'main',
          BASE_SHA: '1925873700c180fc38e7e020fc4b631c1866b082',
          HEAD_SHA: '996d23372d6c8c0c9ce3a562d59baea7132ef7d3',
          PR_NUMBER: '77',
        };
        const accepted = runGuardShellCommand(
          EXPECTED_GUARD_VALIDATE_COMMAND,
          fixture,
          validEnv,
        );

        assertSame(
          accepted.status,
          0,
          `the canonical target must validate: ${accepted.stderr}`,
        );

        const mutants = [
          { ...validEnv, BASE_REPOSITORY: 'attacker/jsjs' },
          { ...validEnv, WORKFLOW_REPOSITORY: 'attacker/jsjs' },
          { ...validEnv, BASE_REF: 'not-main' },
          { ...validEnv, BASE_REF: 'main-line' },
          { ...validEnv, BASE_SHA: 'not-a-sha' },
          { ...validEnv, BASE_SHA: validEnv.BASE_SHA.toUpperCase() },
          { ...validEnv, HEAD_SHA: 'not-a-sha' },
          { ...validEnv, PR_NUMBER: '0' },
          { ...validEnv, PR_NUMBER: '01' },
          { ...validEnv, PR_NUMBER: '12a' },
          { ...validEnv, PR_NUMBER: '' },
          { ...validEnv, PR_NUMBER: '-1' },
        ];

        for (const mutant of mutants) {
          const rejected = runGuardShellCommand(
            EXPECTED_GUARD_VALIDATE_COMMAND,
            fixture,
            mutant,
          );

          assertSame(
            rejected.status === 0,
            false,
            `mutant target must be rejected before checkout: ${JSON.stringify(mutant)}`,
          );
        }
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'the checkout-HEAD attestation command requires the checked-out worktree to equal the event base SHA',
    run: () => {
      const fixture = initGuardFixtureRepository();
      try {
        const headSha = commitGuardFixtureFile(fixture);
        const matching = runGuardShellCommand(
          EXPECTED_GUARD_CHECKOUT_ATTEST_COMMAND,
          fixture,
          { BASE_SHA: headSha },
        );

        assertSame(
          matching.status,
          0,
          `a checkout equal to the event base SHA must attest: ${matching.stderr}`,
        );

        const mismatched = runGuardShellCommand(
          EXPECTED_GUARD_CHECKOUT_ATTEST_COMMAND,
          fixture,
          { BASE_SHA: '0'.repeat(40) },
        );

        assertSame(
          mismatched.status === 0,
          false,
          'a checkout that differs from the event base SHA must fail attestation',
        );
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'the live-target attestation command requires the fetched live main ref and checked-out HEAD to both equal the event base SHA',
    run: () => {
      const upstream = initGuardFixtureRepository();
      const clone = initGuardFixtureRepository();
      try {
        const baseSha = commitGuardFixtureFile(upstream);
        const remote = runGit(clone, [
          ...GUARD_FIXTURE_IDENTITY,
          'remote',
          'add',
          'origin',
          upstream,
        ]);

        assertSame(
          remote.status,
          0,
          `the fixture clone must add its base origin remote: ${remote.stderr}`,
        );

        const seedFetch = runGit(clone, ['fetch', '--quiet', 'origin', 'main']);

        assertSame(
          seedFetch.status,
          0,
          `the fixture clone must fetch base main before checkout: ${seedFetch.stderr}`,
        );

        const checkoutBase = runGit(clone, [
          'checkout',
          '--quiet',
          '--detach',
          baseSha,
        ]);

        assertSame(
          checkoutBase.status,
          0,
          `the fixture clone must check out the event base SHA: ${checkoutBase.stderr}`,
        );

        const fetchLiveTarget = runGuardShellCommand(
          EXPECTED_GUARD_FETCH_BASE_COMMAND,
          clone,
          {},
        );

        assertSame(
          fetchLiveTarget.status,
          0,
          `the live main target ref must fetch through origin: ${fetchLiveTarget.stderr}`,
        );

        const matching = runGuardShellCommand(
          EXPECTED_GUARD_ATTEST_BASE_COMMAND,
          clone,
          { BASE_SHA: baseSha },
        );

        assertSame(
          matching.status,
          0,
          `a live main equal to the event BASE and the checked-out HEAD must attest: ${matching.stderr}`,
        );

        const deleteFetchedRef = runGit(clone, [
          'update-ref',
          '-d',
          'refs/remotes/origin/provenance-target-main',
        ]);

        assertSame(
          deleteFetchedRef.status,
          0,
          `the fixture clone must delete the fetched target ref for the missing-ref case: ${deleteFetchedRef.stderr}`,
        );

        const missingFetchedTargetRef = runGuardShellCommand(
          EXPECTED_GUARD_ATTEST_BASE_COMMAND,
          clone,
          { BASE_SHA: baseSha },
        );

        assertSame(
          missingFetchedTargetRef.status === 0,
          false,
          'a missing fetched target ref must fail live-target attestation',
        );

        const refetchLiveTarget = runGuardShellCommand(
          EXPECTED_GUARD_FETCH_BASE_COMMAND,
          clone,
          {},
        );

        assertSame(
          refetchLiveTarget.status,
          0,
          `the live main target ref must refetch through origin after deletion: ${refetchLiveTarget.stderr}`,
        );

        const advancedMainSha = commitGuardFixtureFile(upstream);
        const refetchAdvancedLiveTarget = runGuardShellCommand(
          EXPECTED_GUARD_FETCH_BASE_COMMAND,
          clone,
          {},
        );

        assertSame(
          refetchAdvancedLiveTarget.status,
          0,
          `the advanced live main target ref must refetch through origin: ${refetchAdvancedLiveTarget.stderr}`,
        );

        const liveMainAdvanced = runGuardShellCommand(
          EXPECTED_GUARD_ATTEST_BASE_COMMAND,
          clone,
          { BASE_SHA: baseSha },
        );

        assertSame(
          liveMainAdvanced.status === 0,
          false,
          'a live main that advanced after the event BASE must fail attestation',
        );

        const checkedOutBaseDiffers = runGuardShellCommand(
          EXPECTED_GUARD_ATTEST_BASE_COMMAND,
          clone,
          { BASE_SHA: advancedMainSha },
        );

        assertSame(
          checkedOutBaseDiffers.status === 0,
          false,
          'a checked-out base commit that differs from BASE_SHA must fail live-target attestation',
        );
      } finally {
        rmSync(upstream, { recursive: true, force: true });
        rmSync(clone, { recursive: true, force: true });
      }
    },
  },
  {
    name: "the fetch and fetched-HEAD attestation commands work only through the base checkout's origin remote and the advertised PR ref, and reject a retargeted or mismatched head",
    run: () => {
      const upstream = initGuardFixtureRepository();
      const clone = initGuardFixtureRepository();
      try {
        const headSha = commitGuardFixtureFile(upstream);
        const otherSha = commitGuardFixtureFile(upstream);
        const advertise = runGit(upstream, [
          'update-ref',
          'refs/pull/77/head',
          headSha,
        ]);

        assertSame(
          advertise.status,
          0,
          `the fixture must advertise a PR ref: ${advertise.stderr}`,
        );

        const remote = runGit(clone, [
          ...GUARD_FIXTURE_IDENTITY,
          'remote',
          'add',
          'origin',
          upstream,
        ]);

        assertSame(
          remote.status,
          0,
          `the fixture clone must add its base origin remote: ${remote.stderr}`,
        );

        const fetch = runGuardShellCommand(
          EXPECTED_GUARD_FETCH_COMMAND,
          clone,
          {
            PR_NUMBER: '77',
          },
        );

        assertSame(
          fetch.status,
          0,
          `the advertised PR ref must fetch through origin: ${fetch.stderr}`,
        );

        const matchingAttest = runGuardShellCommand(
          EXPECTED_GUARD_FETCH_ATTEST_COMMAND,
          clone,
          { PR_NUMBER: '77', HEAD_SHA: headSha },
        );

        assertSame(
          matchingAttest.status,
          0,
          `the fetched ref and FETCH_HEAD must attest against the event head SHA: ${matchingAttest.stderr}`,
        );

        const mismatchedAttest = runGuardShellCommand(
          EXPECTED_GUARD_FETCH_ATTEST_COMMAND,
          clone,
          { PR_NUMBER: '77', HEAD_SHA: otherSha },
        );

        assertSame(
          mismatchedAttest.status === 0,
          false,
          'a fetched head SHA that differs from the event head SHA must fail attestation',
        );

        const missingRefFetch = runGuardShellCommand(
          EXPECTED_GUARD_FETCH_COMMAND,
          clone,
          { PR_NUMBER: '404' },
        );

        assertSame(
          missingRefFetch.status === 0,
          false,
          'fetching a PR number the base repository never advertised must fail',
        );
      } finally {
        rmSync(upstream, { recursive: true, force: true });
        rmSync(clone, { recursive: true, force: true });
      }
    },
  },
];

/**
 * A host that serves one synthetic Test262 file, so a probe can be run through
 * the same runner CI uses without touching disk.
 *
 * @param {string} source
 * @returns {import('../../tools/test262/runner.js').Test262Host}
 */
function probeHost(source) {
  return {
    readTest() {
      return source;
    },
    readInclude(name) {
      throw new Error(`a raw probe must not load ${name}`);
    },
    readModule(file) {
      throw new Error(`a raw probe must not load module ${file}`);
    },
  };
}
