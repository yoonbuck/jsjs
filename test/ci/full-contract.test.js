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
  COVERAGE_MARKER_BEGIN,
  COVERAGE_MARKER_END,
  README_FILE,
  readGeneratedBlock,
} from '../../tools/test262/upstream-run.js';
import {
  collectTest262Inventory,
  formatCoverageLines,
  summarizeTest262Coverage,
  renderCoverageSummary,
} from '../../tools/test262/coverage.js';
import {
  FEATURES_MANIFEST_FILE,
  featureNames,
  parseFeatureManifest,
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
 *   committedReadme: string,
 *   stdout: string,
 *   report: string,
 *   readme: string,
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
    const committedReadme = await readRepositoryFile(README_FILE);
    const stdout = npmRun('test262:upstream');

    upstreamRun = {
      committedReport,
      committedReadme,
      stdout,
      report: await readRepositoryFile(TEST262_REPORT_FILE),
      readme: await readRepositoryFile(README_FILE),
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
    name: 'the coverage summary in README.md is the real output of the pinned subset',
    run: async () => {
      const { committedReadme, readme, report, stdout } =
        await readUpstreamRun();

      assertSame(
        committedReadme,
        readme,
        `${README_FILE} is stale; run npm run test262:upstream`,
      );

      const block = readGeneratedBlock(readme);
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
      });

      assertSame(block, expected);
      assertSame(stdout, `${block}\n`, 'stdout is the same generated summary');
      assertSame(
        readme.includes(COVERAGE_MARKER_BEGIN) &&
          readme.includes(COVERAGE_MARKER_END),
        true,
        'README coverage markers',
      );
      assertSame(
        readme.includes(report),
        false,
        'the detailed report belongs in the artifact, not inlined in README.md',
      );
      assertSame(
        block.includes('"type":"test"'),
        false,
        'the generated block is a summary, not a dump of per-test records',
      );
    },
  },
  {
    name: 'every feature the manifest declares is backed by upstream tests tagged with it that really pass',
    run: async () => {
      const { checkoutPath } = await readTest262Pin();
      const manifest = parseFeatureManifest(
        await readRepositoryFile(FEATURES_MANIFEST_FILE),
      );
      const host = createNodeTest262Host({ root: checkoutPath });

      for (const feature of manifest.features) {
        for (const file of feature.tests) {
          const metadata = parseTest262Metadata(await host.readTest(file));

          assertSame(
            metadata.features.includes(feature.name),
            true,
            `${file} is not tagged with ${feature.name} upstream`,
          );

          const records = await runTest262File({
            engine,
            host,
            file,
            supportedFeatures: [feature.name],
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
];
