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
 * Two policies are encoded here rather than left to whoever edits the workflow
 * next:
 *
 * - **Least privilege.** The workflow grants `contents: read` at the top level
 *   and no job widens it, so a compromised action in any job cannot write to
 *   the repository.
 * - **Immutable actions.** Every `uses:` names a full commit SHA, because a tag
 *   like `v4` is a moving pointer the action's owner can repoint at any time.
 *   The human-readable version follows in a comment so the pin stays reviewable.
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
 * @returns {WorkflowStep}
 */
function runStep(name, run, env) {
  return Object.freeze({
    name,
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
 * @param {string} id
 * @param {string} name
 * @param {readonly WorkflowStep[]} ownSteps
 * @param {readonly string[]} [needs]
 * @returns {WorkflowJob}
 */
function job(id, name, ownSteps, needs = []) {
  return Object.freeze({
    id,
    name,
    needs: Object.freeze([...needs]),
    steps: Object.freeze([...setupSteps(), ...ownSteps]),
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
 * The twelve checks CI runs as distinct jobs.
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
 * Promise, generator, and static module suites. It never runs broad selection or
 * writes broad report artifacts.
 * `test262-upstream` checks out the real `tc39/test262` tree at exactly the
 * pinned revision and runs the curated subset against it, which exercises the
 * engine — and uploads its report even on failure, because a red conformance run
 * is precisely when the per-test records are worth reading. That run also
 * rewrites the two generated artifacts it owns, so the job compares the working
 * tree against the commit afterwards: a stale committed report fails CI the same
 * way a hand-edited workflow does.
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
    Object.freeze({
      id: 'test262-es2015-release',
      name: 'Pinned Test262 ES2015 async runtime and modules',
      needs: Object.freeze(['vendor']),
      steps: Object.freeze([
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
          'Run focused ES2015 async runtime and module Test262',
          'npm run test262:es2015-release',
          {
            TZ: 'UTC',
          },
        ),
      ]),
    }),
    job(
      'benchmark-smoke',
      'Benchmark smoke',
      [runStep('Run benchmark correctness smoke', 'npm run benchmark:smoke')],
      ['vendor'],
    ),
    Object.freeze({
      id: 'test262-upstream',
      name: 'Pinned Test262 subset',
      needs: Object.freeze(['vendor']),
      steps: Object.freeze([
        usesStep('Check out the project', 'actions/checkout', {
          'persist-credentials': 'false',
        }),
        runStep(
          'Remove the committed Test262 report',
          `rm -f ${TEST262_REPORT_FILE}`,
        ),
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
          'Check the ES5 selection is current',
          'npm run test262:select:check',
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
      ]),
    }),
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
    '',
    '# Least privilege: no job in this workflow writes to the repository.',
    'permissions:',
    '  contents: read',
    '',
    'jobs:',
  ];

  jobs.forEach((workflowJob, index) => {
    lines.push(`  ${workflowJob.id}:`);
    lines.push(`    name: ${workflowJob.name}`);
    lines.push('    runs-on: ubuntu-latest');

    if (workflowJob.needs.length > 0) {
      lines.push(`    needs: [${workflowJob.needs.join(', ')}]`);
    }

    lines.push('    steps:');

    for (const workflowStep of workflowJob.steps) {
      lines.push(...renderStep(workflowStep));
    }

    if (index < jobs.length - 1) {
      lines.push('');
    }
  });

  return `${lines.join('\n')}\n`;
}

/**
 * @param {WorkflowStep} workflowStep
 * @returns {string[]}
 */
function renderStep(workflowStep) {
  const lines = [`      - name: ${workflowStep.name}`];

  if (workflowStep.if !== undefined) {
    lines.push(`        if: ${workflowStep.if}`);
  }

  if (workflowStep.uses !== undefined) {
    lines.push(`        uses: ${workflowStep.uses}`);
  }

  if (workflowStep.run !== undefined) {
    lines.push(`        run: ${workflowStep.run}`);
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
