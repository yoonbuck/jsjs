/**
 * The full local CI contract.
 *
 * This suite executes every command the CI workflow declares, against the real
 * pinned upstream Test262 checkout and a real headless browser. It is
 * deliberately excluded from `npm test`/`npm run test:node`: those must stay
 * deterministic and machine-independent, and running the whole pipeline from
 * inside one of its own jobs would be recursive. `npm run ci:contract` runs
 * this file through `test/run-ci-contract.js`; the deterministic half of the
 * contract (workflow structure, manifests, feature probes) lives in
 * `test/node/workflow-contract.test.js` and runs with the ordinary Node
 * suites.
 *
 * Nothing here is conditional. A missing browser or a missing upstream
 * checkout fails with the exact command needed to fix it rather than skipping,
 * because a skip that looks like a pass is how a contract quietly stops being
 * one.
 */

import { readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertSame } from '../harness/assert.js';
import { createRealm, evaluateScript } from '../../src/index.js';
import { parseTest262Metadata } from '../../tools/test262/metadata.js';
import { runTest262File } from '../../tools/test262/runner.js';
import { TEST262_REPORT_FILE } from '../../tools/ci/pipeline.js';
import {
  ES5_SELECTION_FILE,
  matchExclusion,
  parseEs5Selection,
} from '../../tools/test262/es5-selection.js';
import {
  COVERAGE_MARKER_BEGIN,
  COVERAGE_MARKER_END,
  COVERAGE_DOCUMENT_FILE,
  README_FILE,
  readGeneratedBlock,
} from '../../tools/test262/upstream-run.js';
import {
  collectTest262Inventory,
  formatCount,
  formatCoverageLines,
  summarizeTest262Coverage,
  renderCoverageSummary,
} from '../../tools/test262/coverage.js';
import {
  FEATURES_MANIFEST_FILE,
  featureNames,
  parseFeatureManifest,
  runFeatureProbe,
} from '../../tools/test262/features.js';
import {
  UPSTREAM_SUBSET_FILE,
  formatUpstreamSummaryLines,
  parseUpstreamSubset,
  summarizeUpstreamRun,
  upstreamSubsetPaths,
} from '../../tools/test262/upstream.js';
import { createNodeTest262Host } from '../../tools/test262/adapters/node.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const REPOSITORY_ROOT_PATH = fileURLToPath(REPOSITORY_ROOT_URL);

const BROWSER_INSTALL_COMMAND =
  'npx playwright install --with-deps --only-shell chromium';

/**
 * One upstream test that really is tagged with a Test262 `features` name at
 * the pinned revision, so the manifest-to-upstream correspondence check below
 * is exercised even while the project's own manifest is empty.
 */
const TAGGED_UPSTREAM_EXAMPLE = Object.freeze({
  file: 'test/built-ins/Reflect/object-prototype.js',
  feature: 'Reflect',
});

const engine = { createRealm, evaluateScript };

const ES2015_SYNTAX_FEATURES = Object.freeze([
  'arrow-function',
  'class',
  'computed-property-names',
  'default-parameters',
  'destructuring-assignment',
  'destructuring-binding',
  'rest-parameters',
  'spread-syntax',
  'template',
]);

const SELECTION_SYNTAX_FEATURES = Object.freeze(
  ES2015_SYNTAX_FEATURES.filter(
    (feature) => feature !== 'spread-syntax' && feature !== 'template',
  ),
);

const UNSUPPORTED_NEIGHBOR_FEATURES = Object.freeze([
  'async-iteration',
  'async-functions',
  'class-fields-private',
  'class-fields-public',
  'class-methods-private',
  'class-static-block',
  'class-static-fields-private',
  'class-static-fields-public',
  'class-static-methods-private',
  'decorators',
  'generators',
  'new.target',
  'object-rest',
  'object-spread',
]);

/**
 * The pinned Test262 metadata has no `spread-syntax` tag and assigns its sole
 * `template` tag to a test that also needs unsupported `new.target`. These exact
 * untagged tests are kept as semantic backing evidence; every other feature
 * test must carry its claimed tag.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
const UNTAGGED_FEATURE_BACKING_TESTS = Object.freeze({
  'spread-syntax': Object.freeze([
    'test/language/expressions/array/spread-mult-iter.js',
  ]),
  template: Object.freeze([
    'test/language/expressions/tagged-template/cache-same-site.js',
  ]),
});

const REQUIRED_UNSUPPORTED_SELECTION_CLASSIFICATIONS = Object.freeze([
  Object.freeze({
    path: 'test/built-ins/Array/prototype/flatMap/call-with-boolean.js',
    category: 'post-es5-builtin',
  }),
  Object.freeze({
    path: 'test/built-ins/Function/prototype/toString/line-terminator-normalisation-CR.js',
    category: 'post-es5-semantics',
  }),
  Object.freeze({
    path: 'test/harness/asyncHelpers-asyncTest-without-async-flag.js',
    category: 'post-es5-builtin',
  }),
  Object.freeze({
    path: 'test/language/eval-code/direct/arrow-fn-a-following-parameter-is-named-arguments-arrow-func-declare-arguments-assign.js',
    category: 'post-es5-builtin',
  }),
  Object.freeze({
    path: 'test/language/statements/async-function/cptn-decl.js',
    category: 'post-es5-syntax',
  }),
  Object.freeze({
    path: 'test/language/statements/class/subclass/builtin-objects/Map/regular-subclassing.js',
    category: 'post-es5-builtin',
  }),
  Object.freeze({
    path: 'test/staging/sm/Array/toSpliced.js',
    category: 'post-es5-builtin',
  }),
  Object.freeze({
    path: 'test/staging/sm/Map/iterable.js',
    category: 'post-es5-builtin',
  }),
  Object.freeze({
    path: 'test/staging/sm/Promise/bug-1288382.js',
    category: 'post-es5-builtin',
  }),
  Object.freeze({
    path: 'test/staging/sm/Proxy/ownkeys-linear.js',
    category: 'post-es5-builtin',
  }),
  Object.freeze({
    path: 'test/staging/sm/Reflect/set.js',
    category: 'post-es5-builtin',
  }),
  Object.freeze({
    path: 'test/staging/sm/Set/union.js',
    category: 'post-es5-builtin',
  }),
  Object.freeze({
    path: 'test/staging/sm/TypedArray/values.js',
    category: 'post-es5-builtin',
  }),
  Object.freeze({
    path: 'test/staging/sm/class/newTargetEval.js',
    category: 'post-es5-syntax',
  }),
  Object.freeze({
    path: 'test/staging/sm/object/hasOwn.js',
    category: 'post-es5-builtin',
  }),
]);

/**
 * @param {string} feature
 * @param {string} file
 * @returns {boolean}
 */
function isUntaggedFeatureBackingTest(feature, file) {
  return UNTAGGED_FEATURE_BACKING_TESTS[feature]?.includes(file) ?? false;
}

/**
 * @param {string} path Repository-relative.
 * @returns {Promise<string>}
 */
function readRepositoryFile(path) {
  return readFile(new URL(path, REPOSITORY_ROOT_URL), 'utf8');
}

/**
 * Runs a command for real and fails with its actual output when it does not
 * succeed, so a broken CI command cannot pass as a silent skip.
 *
 * @param {string} command
 * @param {readonly string[]} args
 * @param {string} [hint] Appended to the failure message.
 * @returns {string} stdout
 */
function run(command, args, hint) {
  const result = spawnSync(command, [...args], {
    cwd: REPOSITORY_ROOT_PATH,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    // Pin the time zone to UTC so the generated Test262 artifacts are a pure
    // function of the engine and the pinned tree, matching the CI environment
    // regardless of the contributor's local zone (see assertUtcTimeZone).
    env: { ...process.env, TZ: 'UTC' },
  });

  if (result.error !== undefined) {
    throw new Error(
      `${command} ${args.join(' ')} could not start: ${result.error.message}${
        hint === undefined ? '' : `\n${hint}`
      }`,
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited ${String(result.status)}\n${
        result.stdout
      }\n${result.stderr}${hint === undefined ? '' : `\n${hint}`}`,
    );
  }

  return result.stdout;
}

/**
 * @param {string} script
 * @param {string} [hint]
 * @returns {string}
 */
function npmRun(script, hint) {
  return run('npm', ['run', '--silent', script], hint);
}

/**
 * @typedef {{
 *   committedReport: string,
 *   committedCoverageDoc: string,
 *   stdout: string,
 *   report: string,
 *   coverageDoc: string,
 * }} UpstreamRun
 */

/** @type {UpstreamRun | undefined} */
let upstreamRun;

/**
 * Runs the upstream suite once and shares the result.
 *
 * It is the most expensive command in the contract — the pinned subset plus a
 * frontmatter pass over all fifty-odd thousand upstream files — and several
 * assertions below are about different properties of one run, not about
 * different runs. The committed bytes are captured *before* the command writes,
 * because the run regenerates its own artifacts: comparing them afterwards
 * would compare a file with itself and never catch a stale commit.
 *
 * @returns {Promise<UpstreamRun>}
 */
async function readUpstreamRun() {
  if (upstreamRun === undefined) {
    const committedReport = await readRepositoryFile(TEST262_REPORT_FILE);
    const committedCoverageDoc = await readRepositoryFile(
      COVERAGE_DOCUMENT_FILE,
    );
    const stdout = npmRun('test262:upstream');

    upstreamRun = {
      committedReport,
      committedCoverageDoc,
      stdout,
      report: await readRepositoryFile(TEST262_REPORT_FILE),
      coverageDoc: await readRepositoryFile(COVERAGE_DOCUMENT_FILE),
    };
  }

  return upstreamRun;
}

/**
 * @param {readonly Record<string, any>[]} records
 * @param {string} scope
 * @returns {Record<string, any>}
 */
function coverageRecord(records, scope) {
  const record = records.find(
    (candidate) => candidate.type === 'coverage' && candidate.scope === scope,
  );

  if (record === undefined) {
    throw new Error(`the report carries no coverage record for ${scope}`);
  }

  return record;
}

/**
 * Matches a number as a whole token, so `575` is not found inside `53,575` and
 * `112` is not found inside `1120` — while still finding a number that a JSON
 * example follows with a comma, as in `"files":53575,"records"`. Only a comma
 * that groups digits counts as part of a number.
 *
 * A letter on either side disqualifies a match too, because a published count
 * is never written flush against a word: without that guard a small live value
 * collides with ordinary prose (a `malformed` count of 4 matches the `v4` in a
 * sentence about version tags), and the check is only useful while every match
 * it reports is really a number someone pasted.
 *
 * @param {string} rendering
 * @returns {RegExp}
 */
function wholeNumberPattern(rendering) {
  const escaped = rendering.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

  return new RegExp(
    String.raw`(?<![\d.]|\d,|\p{L})${escaped}(?![\d.]|,\d|\p{L})`,
    'u',
  );
}

/**
 * Every way a count from the report could be spelled in prose: as digits, and
 * as the comma-grouped form the generated table uses.
 *
 * @param {number} value
 * @returns {string[]}
 */
function numberRenderings(value) {
  if (!Number.isInteger(value)) {
    return [String(value)];
  }

  return [...new Set([String(value), formatCount(value)])];
}

/**
 * Runs an npm script that is *expected* to fail and returns its output, so a
 * contract can assert on the failure itself instead of only on the happy path.
 * `stderr` is returned separately as well as combined: a command that prints a
 * summary on stdout and its diagnosis on stderr would otherwise let an
 * assertion about the diagnosis pass on the summary.
 *
 * @param {string} script
 * @returns {{ status: number | null, output: string, stderr: string }}
 */
function npmRunExpectingFailure(script) {
  const result = spawnSync('npm', ['run', '--silent', script], {
    cwd: REPOSITORY_ROOT_PATH,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, TZ: 'UTC' },
  });

  if (result.error !== undefined) {
    throw new Error(
      `npm run ${script} could not start: ${result.error.message}`,
    );
  }

  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    stderr: result.stderr,
  };
}

/**
 * @param {string} output
 * @returns {any[]}
 */
function parseJsonLines(output) {
  return output
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

/**
 * @returns {Promise<{ revision: string, checkoutPath: string }>}
 */
async function readTest262Pin() {
  const manifest = JSON.parse(await readRepositoryFile('package.json'));

  return manifest.test262;
}

/**
 * @returns {Promise<string>}
 */
async function readUpstreamHead() {
  const { revision, checkoutPath } = await readTest262Pin();
  const hint = [
    'Check the pinned upstream tree out first:',
    `  git clone --filter=blob:none https://github.com/tc39/test262.git ${checkoutPath}`,
    `  git -C ${checkoutPath} checkout ${revision}`,
  ].join('\n');
  /** @type {string} */
  let head;

  try {
    head = (await readRepositoryFile(`${checkoutPath}/.git/HEAD`)).trim();
  } catch {
    throw new Error(`${checkoutPath} is not a git checkout.\n${hint}`);
  }

  if (head !== revision) {
    throw new Error(
      `${checkoutPath} is at ${head}, but package.json pins ${revision}.\n${hint}`,
    );
  }

  return head;
}

export default [
  {
    name: 'the pinned upstream Test262 tree is checked out at exactly the revision package.json pins',
    run: async () => {
      const { revision } = await readTest262Pin();

      assertSame(await readUpstreamHead(), revision);
    },
  },
  {
    name: 'every feature area admits a tagged selected path from the pinned tree',
    run: async () => {
      await readUpstreamHead();

      const { checkoutPath } = await readTest262Pin();
      const host = createNodeTest262Host({ root: checkoutPath });
      const policy = parseEs5Selection(
        await readRepositoryFile(ES5_SELECTION_FILE),
      );
      const selected = upstreamSubsetPaths(
        parseUpstreamSubset(await readRepositoryFile(UPSTREAM_SUBSET_FILE)),
      );
      /** @type {string[]} */
      const dead = [];
      /** @type {string[]} */
      const neighbors = [];

      for (const area of policy.featureAreas) {
        const paths = selected.filter(
          (path) => path === area.prefix || path.startsWith(`${area.prefix}/`),
        );
        let admitsTaggedPath = false;

        for (const path of paths) {
          const metadata = parseTest262Metadata(await host.readTest(path));
          const mostSpecificArea = policy.featureAreas
            .filter(
              (candidate) =>
                path === candidate.prefix ||
                path.startsWith(`${candidate.prefix}/`),
            )
            .sort((left, right) => right.prefix.length - left.prefix.length)[0];

          if (
            metadata.features.length > 0 &&
            metadata.features.every((feature) =>
              area.features.includes(feature),
            )
          ) {
            admitsTaggedPath = true;
          }

          if (
            mostSpecificArea?.prefix === area.prefix &&
            metadata.features.some(
              (feature) => !area.features.includes(feature),
            )
          ) {
            neighbors.push(
              `${area.prefix}: ${path} -> ${metadata.features.join(', ')}`,
            );
          }
        }

        if (!admitsTaggedPath) {
          dead.push(area.prefix);
        }
      }

      assertSame(
        dead.join('\n'),
        '',
        `feature areas with no tagged selected path:\n${dead.join('\n')}`,
      );
      assertSame(
        neighbors.join('\n'),
        '',
        `a most-specific feature prefix admitted an unclaimed neighboring feature:\n${neighbors.join('\n')}`,
      );
    },
  },
  {
    name: 'the ES2015 syntax probes execute and their language areas exclude unsupported neighbors',
    run: async () => {
      const manifest = parseFeatureManifest(
        await readRepositoryFile(FEATURES_MANIFEST_FILE),
      );
      const syntaxFeatures = manifest.features.filter((feature) =>
        ES2015_SYNTAX_FEATURES.includes(feature.name),
      );
      const policy = parseEs5Selection(
        await readRepositoryFile(ES5_SELECTION_FILE),
      );
      const languageAreas = policy.featureAreas.filter((area) =>
        area.prefix.startsWith('test/language/'),
      );
      const syntaxAreas = policy.featureAreas.filter(
        (area) =>
          area.prefix.startsWith('test/language/') &&
          area.features.some((feature) =>
            ES2015_SYNTAX_FEATURES.includes(feature),
          ),
      );
      const claimedSyntaxFeatures = [
        ...new Set(
          languageAreas.flatMap((area) =>
            area.features.filter((feature) =>
              SELECTION_SYNTAX_FEATURES.includes(feature),
            ),
          ),
        ),
      ].sort();

      assertSame(
        JSON.stringify(syntaxFeatures.map((feature) => feature.name)),
        JSON.stringify(ES2015_SYNTAX_FEATURES),
        'the supported syntax probes must use the exact approved Test262 feature names',
      );
      assertSame(
        JSON.stringify(policy.excludedLanguageDirectories),
        JSON.stringify(['export', 'import', 'module-code']),
        `${ES5_SELECTION_FILE} must remove only the obsolete computed-property-names, destructuring, and rest-parameters directory exclusions`,
      );
      assertSame(
        JSON.stringify(claimedSyntaxFeatures),
        JSON.stringify(SELECTION_SYNTAX_FEATURES),
        `${ES5_SELECTION_FILE} must claim each selected ES2015 syntax tag exactly once through narrow language prefixes`,
      );
      assertSame(
        policy.featureAreas
          .find((area) => area.prefix === 'test/language')
          ?.features.some((feature) =>
            SELECTION_SYNTAX_FEATURES.includes(feature),
          ) ?? false,
        false,
        `${ES5_SELECTION_FILE} must not reopen all of test/language for the newly claimed ES2015 syntax`,
      );

      for (const feature of syntaxFeatures) {
        const result = runFeatureProbe({ engine, feature });

        assertSame(
          result.outcome,
          'completed',
          `${feature.name} must execute its semantic probe: ${result.message}`,
        );
      }

      for (const neighbor of UNSUPPORTED_NEIGHBOR_FEATURES) {
        assertSame(
          syntaxAreas.some((area) => area.features.includes(neighbor)),
          false,
          `a syntax feature area must not claim unsupported neighboring feature ${neighbor}`,
        );
      }
    },
  },
  {
    name: 'known unsupported untagged candidates have exact policy classifications',
    run: async () => {
      const policy = parseEs5Selection(
        await readRepositoryFile(ES5_SELECTION_FILE),
      );

      for (const {
        path,
        category,
      } of REQUIRED_UNSUPPORTED_SELECTION_CLASSIFICATIONS) {
        assertSame(
          matchExclusion(path, policy.exclusions)?.category,
          category,
          `${path} must remain classified as ${category}`,
        );
      }
    },
  },
  {
    name: 'npm run vendor:check passes for real',
    run: () => {
      npmRun('vendor:check');
    },
  },
  {
    name: 'npm run format passes for real',
    run: () => {
      npmRun('format');
    },
  },
  {
    name: 'npm run format really checks engine sources, not only the tooling around them',
    run: async () => {
      const probe = 'src/format-scope-probe.js';
      const probeUrl = new URL(probe, REPOSITORY_ROOT_URL);
      await writeFile(probeUrl, 'export const probe   =   1\n');

      try {
        const { status, output } = npmRunExpectingFailure('format');

        assertSame(
          status === 0,
          false,
          'a misformatted engine source must fail npm run format',
        );
        assertSame(
          output.includes(probe),
          true,
          `npm run format never looked at ${probe}:\n${output}`,
        );
      } finally {
        await rm(probeUrl, { force: true });
      }
    },
  },
  {
    name: 'npm run lint passes for real',
    run: () => {
      npmRun('lint');
    },
  },
  {
    name: 'npm run typecheck passes for real',
    run: () => {
      npmRun('typecheck');
    },
  },
  {
    name: 'npm run ci:check passes for real, so the committed workflow is not stale',
    run: () => {
      npmRun('ci:check');
    },
  },
  {
    name: 'npm run test:node passes for real and reports only passing suites',
    run: () => {
      const results = parseJsonLines(npmRun('test:node'));
      const failed = results.filter((result) => result.status !== 'passed');

      assertSame(failed.length, 0, JSON.stringify(failed.slice(0, 3)));
      assertSame(results.length > 100, true, 'the Node sweep really ran');
    },
  },
  {
    name: 'npm run test262:fixtures passes for real against the local fixture tree',
    run: () => {
      const records = parseJsonLines(npmRun('test262:fixtures'));
      const summary = records[records.length - 1];

      assertSame(summary.type, 'summary');
      assertSame(summary.failed, 0);
      assertSame(
        records.every(
          (record) =>
            record.type === 'summary' || record.file.startsWith('test/'),
        ),
        true,
      );
    },
  },
  {
    name: 'npm run test:browser launches the configured headless browser for real',
    run: () => {
      const results = parseJsonLines(
        npmRun(
          'test:browser',
          `Install the browser CI uses first:\n  ${BROWSER_INSTALL_COMMAND}`,
        ),
      );
      const failed = results.filter((result) => result.status !== 'passed');

      assertSame(failed.length, 0, JSON.stringify(failed.slice(0, 3)));
      assertSame(
        results.length > 100,
        true,
        'the browser sweep really ran the portable suites',
      );
    },
  },
  {
    name: 'npm run test262:upstream runs the pinned subset against the real upstream tree',
    run: async () => {
      await readUpstreamHead();

      const subset = parseUpstreamSubset(
        await readRepositoryFile(UPSTREAM_SUBSET_FILE),
      );
      const paths = upstreamSubsetPaths(subset);
      const { report } = await readUpstreamRun();
      const records = parseJsonLines(report);
      const tests = records.filter((record) => record.type === 'test');
      const summary = records[records.length - 1];

      assertSame(summary.type, 'summary');
      assertSame(summary.failed, 0, JSON.stringify(summary));
      assertSame(
        summary.skipped,
        0,
        'the ES5 baseline subset is intentionally untagged, so nothing may skip',
      );
      assertSame(summary.total, tests.length);
      assertSame(
        [...new Set(tests.map((record) => record.file))].sort().join('\n'),
        paths.join('\n'),
      );
    },
  },
  {
    name: 'the upstream run publishes the JSON-lines report CI uploads as an artifact',
    run: async () => {
      const { committedReport, report, stdout } = await readUpstreamRun();

      assertSame(
        committedReport,
        report,
        `${TEST262_REPORT_FILE} is stale; run npm run test262:upstream`,
      );
      assertSame(
        stdout.includes(TEST262_REPORT_FILE),
        true,
        'the compact summary must point at the full report',
      );

      npmRun('test262:upstream');

      assertSame(
        await readRepositoryFile(TEST262_REPORT_FILE),
        report,
        'two runs of the pinned subset must be byte-identical',
      );
    },
  },
  {
    name: 'npm run test262:upstream:check passes on the committed artifacts and fails on stale ones',
    run: async () => {
      await readUpstreamRun();
      npmRun('test262:upstream:check');

      const reportUrl = new URL(TEST262_REPORT_FILE, REPOSITORY_ROOT_URL);
      const report = await readFile(reportUrl, 'utf8');

      await writeFile(reportUrl, report.replace('{"type', '{"stale":1,"type'));

      try {
        const { status, stderr } = npmRunExpectingFailure(
          'test262:upstream:check',
        );

        assertSame(
          status === 0,
          false,
          'a stale report must fail npm run test262:upstream:check',
        );
        assertSame(
          stderr.includes(
            `${TEST262_REPORT_FILE}\n1 generated file(s) are stale`,
          ),
          true,
          `the failure must name the stale file on stderr:\n${stderr}`,
        );
      } finally {
        await writeFile(reportUrl, report);
      }
    },
  },
  {
    name: 'npm run test262:select:check passes on the committed subset and fails when it drifts',
    run: async () => {
      npmRun('test262:select:check');

      const subsetUrl = new URL(UPSTREAM_SUBSET_FILE, REPOSITORY_ROOT_URL);
      const subset = await readFile(subsetUrl, 'utf8');
      const drifted = JSON.parse(subset);
      drifted.groups[0].paths.push('test/built-ins/zzz-select-drift-probe.js');

      await writeFile(subsetUrl, `${JSON.stringify(drifted, null, 2)}\n`);

      try {
        const { status, stderr } = npmRunExpectingFailure(
          'test262:select:check',
        );

        assertSame(
          status === 0,
          false,
          'a drifted subset must fail npm run test262:select:check',
        );
        assertSame(
          stderr.includes(`${UPSTREAM_SUBSET_FILE} is stale`),
          true,
          `the failure must name the stale subset on stderr:\n${stderr}`,
        );
      } finally {
        await writeFile(subsetUrl, subset);
      }
    },
  },
  {
    name: 'the upstream report carries the deterministic per-group baseline summary',
    run: async () => {
      const subset = parseUpstreamSubset(
        await readRepositoryFile(UPSTREAM_SUBSET_FILE),
      );
      const manifest = parseFeatureManifest(
        await readRepositoryFile(FEATURES_MANIFEST_FILE),
      );
      const records = parseJsonLines((await readUpstreamRun()).report);
      const expected = formatUpstreamSummaryLines(
        summarizeUpstreamRun({
          subset,
          records: records.filter((record) => record.type === 'test'),
          supportedFeatures: featureNames(manifest),
        }),
      );
      const actual = records
        .filter(
          (record) => record.type === 'baseline' || record.type === 'features',
        )
        .map((record) => JSON.stringify(record));

      assertSame(actual.join('\n'), expected.join('\n'));
      assertSame(expected.length, subset.groups.length + 1);
    },
  },
  {
    name: 'the report measures the pinned subset against the whole upstream suite, not against itself',
    run: async () => {
      const { checkoutPath } = await readTest262Pin();
      const records = parseJsonLines((await readUpstreamRun()).report);
      const tests = records.filter((record) => record.type === 'test');
      const inventory = await collectTest262Inventory({
        host: createNodeTest262Host({ root: checkoutPath }),
      });
      const expected = summarizeTest262Coverage({
        inventory,
        records: tests,
        selected: upstreamSubsetPaths(
          parseUpstreamSubset(await readRepositoryFile(UPSTREAM_SUBSET_FILE)),
        ),
      });
      const reported = records
        .filter(
          (record) => record.type === 'inventory' || record.type === 'coverage',
        )
        .map((record) => JSON.stringify(record));

      assertSame(
        reported.join('\n'),
        formatCoverageLines(expected).join('\n'),
        'the published coverage must match an independent pass over the tree',
      );
      assertSame(
        coverageRecord(records, 'records').total > tests.length,
        true,
        'the whole-suite denominator must be larger than the subset that ran',
      );
      assertSame(
        coverageRecord(records, 'files').total,
        inventory.totals.files,
        'the file denominator is the whole pinned tree',
      );
    },
  },
  {
    name: 'the coverage summary in docs/conformance.md is the real output of the pinned subset',
    run: async () => {
      const { committedCoverageDoc, coverageDoc, report, stdout } =
        await readUpstreamRun();

      assertSame(
        committedCoverageDoc,
        coverageDoc,
        `${COVERAGE_DOCUMENT_FILE} is stale; run npm run test262:upstream`,
      );

      const block = readGeneratedBlock(coverageDoc);
      const records = parseJsonLines(report);
      const inventory = records.find((record) => record.type === 'inventory');
      const expected = renderCoverageSummary({
        coverage: {
          files: {
            .../** @type {any} */ (coverageRecord(records, 'files')),
            malformed: inventory.malformed,
          },
          records: /** @type {any} */ (coverageRecord(records, 'records')),
        },
        reportPath: TEST262_REPORT_FILE,
        reportLinkPath: 'test262-report.jsonl',
      });

      assertSame(block, expected);
      assertSame(stdout, `${block}\n`, 'stdout is the same generated summary');
      assertSame(
        coverageDoc.includes(COVERAGE_MARKER_BEGIN) &&
          coverageDoc.includes(COVERAGE_MARKER_END),
        true,
        'coverage document markers',
      );
      assertSame(
        coverageDoc.includes(report),
        false,
        'the detailed report belongs in the artifact, not inlined in the coverage document',
      );
      assertSame(
        block.includes('"type":"test"'),
        false,
        'the generated block is a summary, not a dump of per-test records',
      );
    },
  },
  {
    name: 'every live coverage number in docs/conformance.md is inside the generated block, where the drift check can reach it',
    run: async () => {
      const { coverageDoc, report } = await readUpstreamRun();
      const begin = coverageDoc.indexOf(COVERAGE_MARKER_BEGIN);
      const end =
        coverageDoc.indexOf(COVERAGE_MARKER_END) + COVERAGE_MARKER_END.length;
      const outside = `${coverageDoc.slice(0, begin)}${coverageDoc.slice(end)}`;
      /** @type {Set<number>} */
      const live = new Set();

      for (const record of parseJsonLines(report)) {
        if (record.type !== 'inventory' && record.type !== 'coverage') {
          continue;
        }

        for (const value of Object.values(record)) {
          if (typeof value === 'number') {
            live.add(value);
          }
        }
      }

      assertSame(
        live.size > 0,
        true,
        'the report must publish the numbers this check is about',
      );

      const lines = outside.split('\n');
      /** @type {string[]} */
      const offenders = [];

      for (const value of live) {
        for (const rendering of numberRenderings(value)) {
          const match = wholeNumberPattern(rendering).exec(outside);

          if (match === null) {
            continue;
          }

          const line = outside.slice(0, match.index).split('\n').length;

          offenders.push(`${rendering} -> ${lines[line - 1].trim()}`);
        }
      }

      assertSame(
        offenders.join('\n'),
        '',
        `these counts belong to the upstream run but sit outside ${COVERAGE_MARKER_BEGIN}, where nothing regenerates them and no drift check would ever notice them going stale. Prose that illustrates the schema must use synthetic values and leave the real ones to the generated block.`,
      );
    },
  },
  {
    name: 'every feature manifest claim has tagged or documented untagged upstream evidence that passes',
    run: async () => {
      const { checkoutPath } = await readTest262Pin();
      const manifest = parseFeatureManifest(
        await readRepositoryFile(FEATURES_MANIFEST_FILE),
      );
      const host = createNodeTest262Host({ root: checkoutPath });
      const supportedFeatures = featureNames(manifest);

      for (const feature of manifest.features) {
        for (const file of feature.tests) {
          const metadata = parseTest262Metadata(await host.readTest(file));

          assertSame(
            metadata.features.includes(feature.name) ||
              isUntaggedFeatureBackingTest(feature.name, file),
            true,
            `${file} is neither tagged with ${feature.name} nor an exact documented metadata exception`,
          );

          const records = await runTest262File({
            engine,
            host,
            file,
            // A backing test may declare another implemented prerequisite
            // (the pinned `for-of` example also needs `Symbol.iterator`).
            // The metadata assertion above still proves this test backs the
            // feature currently being checked. The two exact metadata exceptions
            // above are still run for their direct semantic coverage.
            supportedFeatures,
          });

          assertSame(
            records.every((record) => record.status === 'passed'),
            true,
            `${file} does not pass with ${feature.name} allowed`,
          );
        }
      }
    },
  },
  {
    name: 'the manifest-to-upstream correspondence check is real: a feature tag either is on the upstream test or it is not',
    run: async () => {
      const { checkoutPath } = await readTest262Pin();
      const host = createNodeTest262Host({ root: checkoutPath });
      const metadata = parseTest262Metadata(
        await host.readTest(TAGGED_UPSTREAM_EXAMPLE.file),
      );

      assertSame(
        metadata.features.includes(TAGGED_UPSTREAM_EXAMPLE.feature),
        true,
        `${TAGGED_UPSTREAM_EXAMPLE.file} should be tagged ${TAGGED_UPSTREAM_EXAMPLE.feature}`,
      );
      assertSame(
        metadata.features.includes('jsjs-not-a-real-feature'),
        false,
        'a feature name that is not on the upstream test must not match',
      );
    },
  },
  {
    // After the documentation reorganization the coverage markers must live in
    // docs/conformance.md, not README.md.  The precise check is the marker
    // strings themselves: if the markers are absent from README, nothing in the
    // drift-check pipeline will silently regenerate them there.  This test
    // fails until Task 3 moves the generated block to docs/conformance.md.
    name: 'README.md must not contain the generated coverage markers after documentation reorganization',
    run: async () => {
      const readme = await readRepositoryFile(README_FILE);

      assertSame(
        readme.includes(COVERAGE_MARKER_BEGIN),
        false,
        `${README_FILE} must not contain ${COVERAGE_MARKER_BEGIN}; the generated coverage block belongs in docs/conformance.md`,
      );
      assertSame(
        readme.includes(COVERAGE_MARKER_END),
        false,
        `${README_FILE} must not contain ${COVERAGE_MARKER_END}; the generated coverage block belongs in docs/conformance.md`,
      );
    },
  },
  {
    // The generated coverage block must be delimited by the standard markers
    // in docs/conformance.md so that the drift-check tool can locate and
    // regenerate it.  This test fails until Task 3 creates docs/conformance.md
    // with the markers in place.
    name: 'docs/conformance.md must contain the generated coverage markers',
    run: async () => {
      let conformance;
      try {
        conformance = await readRepositoryFile('docs/conformance.md');
      } catch {
        assertSame(
          'docs/conformance.md',
          'exists',
          'docs/conformance.md must exist and contain the generated coverage markers',
        );
        return;
      }

      assertSame(
        conformance.includes(COVERAGE_MARKER_BEGIN),
        true,
        `docs/conformance.md must contain ${COVERAGE_MARKER_BEGIN}`,
      );
      assertSame(
        conformance.includes(COVERAGE_MARKER_END),
        true,
        `docs/conformance.md must contain ${COVERAGE_MARKER_END}`,
      );
    },
  },
];
