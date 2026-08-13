/**
 * Repeated-run benchmark comparison gate.
 *
 * Every fixture here is a real schema-3 host report produced by
 * `benchmark/report.js`'s own validator and written to a real capture root, so
 * the gate is exercised through the same files a `benchmark/cli.js run`
 * capture produces. Nothing is stubbed: the CLI reads the manifest, reads the
 * roots, audits them, and writes both artifacts.
 *
 * The expectations are derived from the literal fixture medians, not from the
 * implementation: each pair's candidate median is a fixed multiple of its
 * baseline median, so the paired log ratio, the exact sign-test p-value, and
 * the empirical noise envelope are all closed-form.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { assertSame, assertThrows } from '../harness/assert.js';
import { main, parseBenchmarkArguments } from '../../benchmark/cli.js';
import { validateHostReport } from '../../benchmark/report.js';
import {
  exactSignTestPValue,
  summarizeSamples,
} from '../../benchmark/statistics.js';
import {
  COMPARISON_SCHEMA_VERSION,
  COMPARISON_MANIFEST_SCHEMA_VERSION,
  MINIMUM_NONZERO_PAIRS_FOR_EXACT_SIGNIFICANCE,
  compareManifestFile,
} from '../../benchmark/compare.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const COMPARE_DIRECTORY = '.benchmark-results/test-node-compare';

/**
 * @typedef {ReturnType<typeof import('../../benchmark/run.js').runHostBenchmark>} HostReport
 * @typedef {HostReport['results'][number]} HostResult
 * @typedef {HostResult['lanes']['native']} LaneResult
 * @typedef {'cold' | 'steady'} Mode
 * @typedef {{ workload: string, mode: Mode, medianMs: number }} CellMedian
 * @typedef {{
 *   host: string,
 *   runId: string,
 *   generatedAt: string,
 *   gitCommit: string,
 *   cells: readonly CellMedian[],
 *   samples?: number,
 * }} FixtureReportOptions
 * @typedef {{
 *   order: 'baseline-candidate' | 'candidate-baseline',
 *   baseline: string,
 *   candidate: string,
 *   round?: number,
 * }} ManifestPair
 */

/** @type {Record<string, number>} */
const WORKLOAD_CHECKSUMS = {
  'object-properties': 101,
  arrays: 202,
  'arithmetic-loops': 303,
};

/** @type {readonly Mode[]} */
const MODES = Object.freeze(['cold', 'steady']);

const BASE_COMMIT = '1111111111111111111111111111111111111111';
const CANDIDATE_COMMIT = '2222222222222222222222222222222222222222';

/**
 * Base jsjs medians in ms for one revision, before any round drift.
 * @type {Readonly<Record<string, number>>}
 */
const BASE_MEDIANS = Object.freeze({
  'object-properties:cold': 80,
  'object-properties:steady': 78,
  'arrays:cold': 60,
  'arrays:steady': 58,
  'arithmetic-loops:cold': 20,
  'arithmetic-loops:steady': 19.5,
});

const tests = [
  {
    name: 'benchmark compare parses compare arguments and rejects unsafe manifest and output paths',
    run() {
      assertSame(
        JSON.stringify(
          parseBenchmarkArguments([
            'compare',
            '--manifest=.benchmark-results/c/manifest.json',
            '--output=.benchmark-results/c/comparison',
            '--seed=7',
            '--resamples=2000',
          ]),
        ),
        JSON.stringify({
          command: 'compare',
          manifestPath: '.benchmark-results/c/manifest.json',
          outputBase: '.benchmark-results/c/comparison',
          seed: 7,
          resamples: 2000,
        }),
      );
      assertSame(
        assertThrows(
          () => parseBenchmarkArguments(['compare', '--output=.x/y']),
          Error,
        ).message,
        'At least one --manifest option is required',
      );
      assertSame(
        assertThrows(
          () =>
            parseBenchmarkArguments([
              'compare',
              '--manifest=../outside/manifest.json',
              '--output=.benchmark-results/c/comparison',
            ]),
          RangeError,
        ).message.includes('outside repository'),
        true,
      );
      assertSame(
        assertThrows(
          () =>
            parseBenchmarkArguments([
              'compare',
              '--manifest=.benchmark-results/c/manifest.json',
              '--output=comparison',
            ]),
          RangeError,
        ).message.includes('directory'),
        true,
      );
    },
  },
  {
    name: 'benchmark statistics preserves representable exact sign-test tail probabilities',
    run() {
      assertSame(exactSignTestPValue(54, 0), 2 ** -53);
    },
  },
  {
    name: 'benchmark compare keeps its artifacts out of manifests and capture roots',
    async run() {
      const directory = `${COMPARE_DIRECTORY}-output-protection`;
      const pairs = await writeCapturePairs(directory, {
        hosts: ['node'],
        rounds: 2,
        baselineMedian: (cell) => BASE_MEDIANS[cell],
        candidateMedian: (cell) => BASE_MEDIANS[cell] * 0.9,
      });

      try {
        await runCompare(directory, {
          targets: [{ workload: 'arrays' }],
          pairs,
        });
        const manifestPath = `${directory}/manifest.json`;
        const manifestContents = await readFile(
          new URL(manifestPath, REPOSITORY_ROOT_URL),
          'utf8',
        );

        await expectComparisonOutputFailure(
          manifestPath,
          `${directory}/manifest`,
          'overwrite manifest',
        );
        assertSame(
          await readFile(new URL(manifestPath, REPOSITORY_ROOT_URL), 'utf8'),
          manifestContents,
        );

        const markdownManifestPath = `${directory}/manifest.md`;
        await writeFile(
          new URL(markdownManifestPath, REPOSITORY_ROOT_URL),
          manifestContents,
          'utf8',
        );
        const markdownManifestContents = manifestContents;

        await expectComparisonOutputFailure(
          markdownManifestPath,
          `${directory}/manifest`,
          'overwrite manifest',
        );
        assertSame(
          await readFile(
            new URL(markdownManifestPath, REPOSITORY_ROOT_URL),
            'utf8',
          ),
          markdownManifestContents,
        );
        await expectComparisonOutputFailure(
          manifestPath,
          `${directory}/baseline-1/comparison`,
          'capture root',
        );
        await expectComparisonOutputFailure(
          manifestPath,
          `${directory}/candidate-1/artifacts/comparison`,
          'descendant',
        );
      } finally {
        await rm(new URL(`${directory}/`, REPOSITORY_ROOT_URL), {
          recursive: true,
          force: true,
        });
      }
    },
  },
  {
    name: 'benchmark compare keeps an identical-engine control with one candidate spike within noise',
    async run() {
      // Six counterbalanced pairs. Both revisions share every round's drift
      // factor, so the paired ratios are the jitter series alone, except for a
      // single transient +15% candidate spike on arithmetic-loops/cold in
      // round 2 -- the exact shape that produced the false +11.41% claim.
      const drift = [1.0, 1.1, 0.98, 1.12, 1.0, 0.97];
      const jitter = [0.99, 1.0, 1.01, 0.995, 1.005, 0.99];
      const directory = `${COMPARE_DIRECTORY}-control`;
      const pairs = await writeCapturePairs(directory, {
        hosts: ['node'],
        rounds: drift.length,
        baselineCommit: BASE_COMMIT,
        candidateCommit: BASE_COMMIT,
        baselineMedian: (cell, round) => BASE_MEDIANS[cell] * drift[round],
        candidateMedian: (cell, round) =>
          BASE_MEDIANS[cell] *
          drift[round] *
          jitter[round] *
          (cell === 'arithmetic-loops:cold' && round === 1 ? 1.15 : 1),
      });
      const comparison = await runCompare(directory, {
        targets: [{ workload: 'object-properties' }, { workload: 'arrays' }],
        pairs,
      });
      const repeatedComparison = await runCompare(directory, {
        targets: [{ workload: 'object-properties' }, { workload: 'arrays' }],
        pairs,
      });

      assertSame(comparison.schemaVersion, COMPARISON_SCHEMA_VERSION);
      assertSame(comparison.audit.baselineCommit, BASE_COMMIT);
      assertSame(comparison.audit.candidateCommit, BASE_COMMIT);
      assertSame(
        comparison.cells.filter((cell) => cell.verdict === 'regression').length,
        0,
      );
      assertSame(
        comparison.cells.map((cell) => cell.verdict).join(','),
        new Array(6).fill('within-noise').join(','),
      );

      const spiked = cellOf(comparison, 'node', 'arithmetic-loops', 'cold');

      // Sorted paired ratios are 0.99, 0.99, 0.995, 1.005, 1.01, 1.15, so the
      // median paired log ratio is log(sqrt(0.995 * 1.005)).
      assertClose(
        spiked.pointEstimatePercent,
        (Math.sqrt(0.995 * 1.005) - 1) * 100,
        1e-9,
      );
      assertSame(spiked.signTest.nonzeroPairs, 6);
      assertSame(spiked.signTest.positivePairs, 3);
      assertSame(spiked.signTest.pValue, 1);
      assertSame(spiked.criteria.exceedsNoiseEnvelope, false);
      // The envelope is descriptive: the candidate's own repeated runs now
      // span the spike (25.3 ms) against its second-smallest run (19.796 ms),
      // and the 95th percentile of the 30 pooled self-differences is that
      // second-largest pairwise ratio.
      assertClose(spiked.noiseEnvelopePercent, (25.3 / 19.796 - 1) * 100, 1e-9);
      assertSame(spiked.noiseEnvelopeSamples, 30);
      assertSame(spiked.runs.length, 6);
      assertClose(spiked.runs[1].candidateMedianMs, 20 * 1.1 * 1.15, 1e-9);

      assertSame(comparison.acceptance.nonTargetRegressionCount, 0);
      assertSame(comparison.acceptance.targetVerdictsImprove, false);
      assertSame(comparison.acceptance.targetsMateriallyExceedNoise, false);
      assertSame(comparison.acceptance.gateReady, false);
      assertSame(comparison.acceptance.accepted, false);
      assertSame(
        comparison.warnings.some((warning) =>
          warning.includes('control comparison'),
        ),
        true,
      );
      assertSame(
        JSON.stringify(
          comparison.cells.map((cell) => [
            cell.ci95LowLogRatio,
            cell.ci95HighLogRatio,
          ]),
        ),
        JSON.stringify(
          repeatedComparison.cells.map((cell) => [
            cell.ci95LowLogRatio,
            cell.ci95HighLogRatio,
          ]),
        ),
      );

      await rm(new URL(`${directory}/`, REPOSITORY_ROOT_URL), {
        recursive: true,
        force: true,
      });
    },
  },
  {
    name: 'benchmark compare refuses gate readiness and acceptance for the same Git commit',
    async run() {
      const directory = `${COMPARE_DIRECTORY}-same-commit`;
      const pairs = await writeCapturePairs(directory, {
        hosts: ['node'],
        rounds: 6,
        baselineCommit: BASE_COMMIT,
        candidateCommit: BASE_COMMIT,
        baselineMedian: (cell) => BASE_MEDIANS[cell],
        candidateMedian: (cell) => BASE_MEDIANS[cell] * 0.8,
      });

      try {
        const comparison = await runCompare(directory, {
          targets: [
            { workload: 'object-properties' },
            { workload: 'arrays' },
            { workload: 'arithmetic-loops' },
          ],
          pairs,
        });

        assertSame(
          comparison.acceptance.gateReady,
          false,
          'same-commit controls must not be gate-ready',
        );
        assertSame(
          comparison.acceptance.accepted,
          false,
          'same-commit controls must not be accepted',
        );
        assertSame(
          comparison.warnings.some(
            (warning) =>
              warning.includes(`share commit ${BASE_COMMIT}`) &&
              warning.includes('control comparison') &&
              warning.includes('distinct') &&
              warning.includes('gate readiness'),
          ),
          true,
          'same-commit diagnostic must identify the commit, control status, and distinct-revision gate requirement',
        );
      } finally {
        await rm(new URL(`${directory}/`, REPOSITORY_ROOT_URL), {
          recursive: true,
          force: true,
        });
      }
    },
  },
  {
    name: 'benchmark compare reports three all-positive pairs as underpowered instead of regression',
    async run() {
      // Three pairs, every candidate exactly 10% slower. An exact two-sided
      // sign test over three nonzero deltas can never beat 0.25, so no amount
      // of consistency may be called a regression at this pair count.
      const drift = [1.0, 1.05, 0.975];
      const directory = `${COMPARE_DIRECTORY}-underpowered`;
      const pairs = await writeCapturePairs(directory, {
        hosts: ['node'],
        rounds: drift.length,
        orders: [
          'baseline-candidate',
          'candidate-baseline',
          'baseline-candidate',
        ],
        baselineMedian: (cell, round) => BASE_MEDIANS[cell] * drift[round],
        candidateMedian: (cell, round) =>
          BASE_MEDIANS[cell] * drift[round] * 1.1,
      });
      const comparison = await runCompare(directory, {
        targets: [{ workload: 'object-properties' }],
        pairs,
      });
      const cell = cellOf(comparison, 'node', 'arithmetic-loops', 'cold');

      assertSame(cell.verdict, 'underpowered');
      assertClose(cell.pointEstimatePercent, 10, 1e-9);
      assertSame(cell.ci95LowPercent > 0, true);
      assertSame(cell.signTest.nonzeroPairs, 3);
      assertSame(cell.signTest.pValue, 0.25);
      assertSame(cell.criteria.signTestSignificant, false);
      assertSame(cell.criteria.exactSignificancePossible, false);
      assertSame(cell.criteria.confidenceIntervalExcludesZero, true);
      // Pooled self-differences top out at 1.05/0.975 on both revisions.
      assertClose(cell.noiseEnvelopePercent, (1.05 / 0.975 - 1) * 100, 1e-9);
      assertSame(cell.criteria.exceedsNoiseEnvelope, true);
      assertSame(
        cell.unmetCriteria.includes('exact-significance-impossible'),
        true,
      );

      assertSame(
        comparison.cells.some((entry) => entry.verdict === 'regression'),
        false,
      );
      assertSame(
        comparison.cells.every((entry) => entry.verdict === 'underpowered'),
        true,
      );
      assertSame(comparison.acceptance.nonTargetRegressionCount, 0);
      assertSame(comparison.acceptance.gateReady, false);
      assertSame(comparison.acceptance.accepted, false);
      assertSame(
        comparison.warnings.some((warning) => warning.includes('underpowered')),
        true,
      );
      assertSame(
        comparison.warnings.some((warning) =>
          warning.includes(
            String(MINIMUM_NONZERO_PAIRS_FOR_EXACT_SIGNIFICANCE),
          ),
        ),
        true,
      );

      await rm(new URL(`${directory}/`, REPOSITORY_ROOT_URL), {
        recursive: true,
        force: true,
      });
    },
  },
  {
    name: 'benchmark compare measures reciprocal effects against the noise envelope in log space',
    async run() {
      const directory = `${COMPARE_DIRECTORY}-swap-symmetry`;
      const forwardDirectory = `${directory}/forward`;
      const reverseDirectory = `${directory}/reverse`;
      const variation = [1, 1, 1, 1, 1, 1.1];
      const effect = 1.105;
      const forwardPairs = await writeCapturePairs(forwardDirectory, {
        hosts: ['node'],
        rounds: variation.length,
        baselineMedian: (cell, round) => BASE_MEDIANS[cell] * variation[round],
        candidateMedian: (cell, round) =>
          BASE_MEDIANS[cell] * variation[round] * effect,
      });
      const reversePairs = await writeCapturePairs(reverseDirectory, {
        hosts: ['node'],
        rounds: variation.length,
        baselineMedian: (cell, round) =>
          BASE_MEDIANS[cell] * variation[round] * effect,
        candidateMedian: (cell, round) => BASE_MEDIANS[cell] * variation[round],
      });
      const forward = await runCompare(forwardDirectory, {
        targets: [{ workload: 'arrays' }],
        pairs: forwardPairs,
      });
      const reverse = await runCompare(reverseDirectory, {
        targets: [{ workload: 'arrays' }],
        pairs: reversePairs,
      });
      const forwardCell = cellOf(forward, 'node', 'arrays', 'cold');
      const reverseCell = cellOf(reverse, 'node', 'arrays', 'cold');

      assertSame(forwardCell.criteria.exceedsNoiseEnvelope, true);
      assertSame(reverseCell.criteria.exceedsNoiseEnvelope, true);
      assertClose(forwardCell.pointLogRatio, Math.log(effect), 1e-12);
      assertClose(reverseCell.pointLogRatio, -Math.log(effect), 1e-12);
      assertClose(forwardCell.noiseEnvelopeLogRatio, Math.log(1.1), 1e-12);
      assertClose(reverseCell.noiseEnvelopeLogRatio, Math.log(1.1), 1e-12);
      assertSame(
        Math.abs(reverseCell.pointEstimatePercent) <
          forwardCell.noiseEnvelopePercent,
        true,
      );

      await rm(new URL(`${directory}/`, REPOSITORY_ROOT_URL), {
        recursive: true,
        force: true,
      });
    },
  },
  {
    name: 'benchmark compare reports a consistent slowdown across six counterbalanced pairs as a regression',
    async run() {
      // Targets improve by 12%, the non-target regresses by 15%, and every
      // round carries a small candidate-side jitter so the paired deltas are
      // not identical. Six same-signed deltas reach the exact sign test's
      // floor of 2 * 2^-6 = 0.03125.
      const drift = [1.0, 1.02, 0.99, 1.03, 0.98, 1.01];
      const jitter = [1.0, 1.002, 0.998, 1.001, 0.999, 1.0005];
      /** @type {Record<string, number>} */
      const ratios = {
        'object-properties:cold': 0.88,
        'object-properties:steady': 0.88,
        'arrays:cold': 0.88,
        'arrays:steady': 0.88,
        'arithmetic-loops:cold': 1.15,
        'arithmetic-loops:steady': 1.15,
      };
      const directory = `${COMPARE_DIRECTORY}-regression`;
      const pairs = await writeCapturePairs(directory, {
        hosts: ['node'],
        rounds: drift.length,
        baselineMedian: (cell, round) => BASE_MEDIANS[cell] * drift[round],
        candidateMedian: (cell, round) =>
          BASE_MEDIANS[cell] * drift[round] * ratios[cell] * jitter[round],
      });
      const comparison = await runCompare(directory, {
        targets: [{ workload: 'object-properties' }, { workload: 'arrays' }],
        pairs,
      });
      const regressed = cellOf(comparison, 'node', 'arithmetic-loops', 'cold');
      // Sorted jitter is 0.998, 0.999, 1, 1.0005, 1.001, 1.002, so the median
      // paired ratio is ratio * sqrt(1 * 1.0005).
      const medianJitter = Math.sqrt(1.0 * 1.0005);

      assertSame(regressed.verdict, 'regression');
      assertClose(
        regressed.pointEstimatePercent,
        (1.15 * medianJitter - 1) * 100,
        1e-9,
      );
      assertSame(regressed.signTest.nonzeroPairs, 6);
      assertSame(regressed.signTest.positivePairs, 6);
      assertSame(regressed.signTest.pValue, 0.03125);
      assertSame(regressed.criteria.signTestSignificant, true);
      assertSame(regressed.criteria.confidenceIntervalExcludesZero, true);
      assertSame(regressed.criteria.exceedsNoiseEnvelope, true);
      assertSame(regressed.criteria.counterbalanced, true);
      assertSame(regressed.ci95LowPercent > 0, true);
      assertSame(
        regressed.noiseEnvelopePercent < 15 &&
          regressed.noiseEnvelopePercent > 0,
        true,
      );

      const improved = cellOf(comparison, 'node', 'arrays', 'cold');
      assertSame(improved.verdict, 'improvement');
      assertClose(
        improved.pointEstimatePercent,
        (0.88 * medianJitter - 1) * 100,
        1e-9,
      );
      assertSame(improved.ci95HighPercent < 0, true);

      assertSame(comparison.acceptance.nonTargetRegressionCount, 2);
      assertSame(
        comparison.nonTargetRegressions
          .map((entry) => `${entry.host}:${entry.workload}:${entry.mode}`)
          .join(','),
        'node:arithmetic-loops:cold,node:arithmetic-loops:steady',
      );
      assertSame(comparison.acceptance.accepted, false);
      assertSame(comparison.acceptance.exceptionalReview.required, true);
      // The 12% target gains do not exceed the 15% non-target regression.
      assertSame(
        conditionOf(comparison, 'target-gains-materially-larger').satisfied,
        false,
      );
      assertSame(conditionOf(comparison, 'conformance-green').satisfied, null);
      assertSame(
        conditionOf(comparison, 'final-review-approves').satisfied,
        null,
      );

      const markdown = await readFile(
        new URL(`${directory}/comparison.md`, REPOSITORY_ROOT_URL),
        'utf8',
      );
      assertSame(markdown.includes('Non-target regressions'), true);
      assertSame(markdown.includes('arithmetic-loops'), true);
      assertSame(markdown.includes('Exceptional-regression review'), true);

      await rm(new URL(`${directory}/`, REPOSITORY_ROOT_URL), {
        recursive: true,
        force: true,
      });
    },
  },
  {
    name: 'benchmark compare computes targeted improvements host geomeans and acceptance booleans',
    async run() {
      const drift = [1.0, 1.02, 0.99, 1.03, 0.98, 1.01];
      /** @type {Record<string, Record<string, number>>} */
      const ratios = {
        node: {
          'object-properties:cold': 0.88,
          'object-properties:steady': 0.83,
          'arrays:cold': 0.88,
          'arrays:steady': 0.89,
          'arithmetic-loops:cold': 1.004,
          'arithmetic-loops:steady': 0.998,
        },
        chromium: {
          'object-properties:cold': 0.9,
          'object-properties:steady': 0.86,
          'arrays:cold': 0.91,
          'arrays:steady': 0.92,
          'arithmetic-loops:cold': 1.002,
          'arithmetic-loops:steady': 1.001,
        },
      };
      const directory = `${COMPARE_DIRECTORY}-targets`;
      const pairs = await writeCapturePairs(directory, {
        hosts: ['node', 'chromium'],
        rounds: drift.length,
        baselineMedian: (cell, round) => BASE_MEDIANS[cell] * drift[round],
        candidateMedian: (cell, round, host) =>
          BASE_MEDIANS[cell] * drift[round] * ratios[host][cell],
      });
      const comparison = await runCompare(directory, {
        targets: [{ workload: 'object-properties' }, { workload: 'arrays' }],
        pairs,
      });

      assertSame(comparison.hosts.join(','), 'chromium,node');
      assertClose(
        cellOf(comparison, 'node', 'object-properties', 'steady')
          .pointEstimatePercent,
        -17,
        1e-9,
      );
      assertSame(
        cellOf(comparison, 'node', 'object-properties', 'steady').verdict,
        'improvement',
      );
      // A statistically consistent 0.4% move stays inside the measured
      // envelope of the same revision's own repeated runs.
      const flat = cellOf(comparison, 'node', 'arithmetic-loops', 'cold');
      assertClose(flat.pointEstimatePercent, 0.4, 1e-9);
      assertSame(flat.signTest.pValue, 0.03125);
      assertSame(flat.criteria.confidenceIntervalExcludesZero, true);
      assertSame(flat.criteria.exceedsNoiseEnvelope, false);
      assertSame(flat.verdict, 'within-noise');
      assertClose(flat.noiseEnvelopePercent, (1.03 / 0.98 - 1) * 100, 1e-9);

      const nodeAggregate = aggregateOf(comparison, 'node');
      assertClose(
        nodeAggregate.pointEstimatePercent,
        (geometricMeanOf(Object.values(ratios.node)) - 1) * 100,
        1e-9,
      );
      assertSame(nodeAggregate.verdict, 'improvement');
      assertClose(
        aggregateOf(comparison, 'chromium').pointEstimatePercent,
        (geometricMeanOf(Object.values(ratios.chromium)) - 1) * 100,
        1e-9,
      );
      assertClose(
        comparison.allHostAggregate.pointEstimatePercent,
        (geometricMeanOf([
          ...Object.values(ratios.node),
          ...Object.values(ratios.chromium),
        ]) -
          1) *
          100,
        1e-9,
      );

      assertSame(comparison.acceptance.nonTargetRegressionCount, 0);
      assertSame(
        comparison.acceptance.allHostGeomeanPointEstimatesImprove,
        true,
      );
      assertSame(
        comparison.acceptance.allHostGeomeanVerdictsImproveOrWithinNoise,
        true,
      );
      assertSame(comparison.acceptance.targetVerdictsImprove, true);
      assertSame(comparison.acceptance.targetsMateriallyExceedNoise, true);
      assertSame(comparison.acceptance.gateReady, true);
      assertSame(comparison.acceptance.accepted, true);
      assertSame(comparison.acceptance.exceptionalReview.required, false);

      const persisted = JSON.parse(
        await readFile(
          new URL(`${directory}/comparison.json`, REPOSITORY_ROOT_URL),
          'utf8',
        ),
      );
      assertSame(persisted.schemaVersion, COMPARISON_SCHEMA_VERSION);
      assertSame(persisted.manifest.schemaVersion, 1);
      assertSame(persisted.audit.pairCount, 6);
      assertSame(persisted.audit.baselineCommit, BASE_COMMIT);
      assertSame(persisted.audit.candidateCommit, CANDIDATE_COMMIT);
      assertSame(persisted.audit.cleanSource, true);
      assertSame(persisted.audit.uniqueRunIds, 12);
      assertSame(persisted.cells.length, 12);
      assertSame(persisted.methodology.resamples, 20000);

      const markdown = await readFile(
        new URL(`${directory}/comparison.md`, REPOSITORY_ROOT_URL),
        'utf8',
      );
      assertSame(markdown.includes('# Benchmark comparison'), true);
      assertSame(markdown.includes('## Methodology'), true);
      assertSame(markdown.includes('## Audit'), true);
      assertSame(markdown.includes('## Acceptance'), true);
      assertSame(markdown.includes('object-properties'), true);

      await rm(new URL(`${directory}/`, REPOSITORY_ROOT_URL), {
        recursive: true,
        force: true,
      });
    },
  },
  {
    name: 'benchmark compare does not accept a positive all-host aggregate',
    async run() {
      const directory = `${COMPARE_DIRECTORY}-positive-all-host`;
      const targetLogRatio = Math.log(0.7);
      /** @type {Record<string, readonly number[]>} */
      const hostAggregateLogRatios = {
        node: [-1, -0.05, -0.05, 0.04, 1, 1],
        chromium: [1.001, 0.1, 0.08, -0.1, -0.999, -0.999],
      };
      const pairs = await writeCapturePairs(directory, {
        hosts: ['node', 'chromium'],
        rounds: 6,
        baselineMedian: (cell) => BASE_MEDIANS[cell],
        candidateMedian: (cell, round, host) => {
          const logRatio = cell.startsWith('arrays:')
            ? targetLogRatio
            : (6 * hostAggregateLogRatios[host][round] - 2 * targetLogRatio) /
              4;

          return BASE_MEDIANS[cell] * Math.exp(logRatio);
        },
      });
      const comparison = await runCompare(directory, {
        targets: [{ workload: 'arrays' }],
        pairs,
      });

      assertSame(comparison.acceptance.nonTargetRegressionCount, 0);
      assertSame(
        comparison.acceptance.allHostGeomeanPointEstimatesImprove,
        true,
      );
      assertSame(
        comparison.acceptance.allHostGeomeanVerdictsImproveOrWithinNoise,
        true,
      );
      assertSame(comparison.acceptance.allHostAggregateImproves, false);
      assertSame(comparison.allHostAggregate.pointEstimatePercent > 0, true);
      assertSame(comparison.acceptance.targetVerdictsImprove, true);
      assertSame(comparison.acceptance.targetsMateriallyExceedNoise, true);
      assertSame(comparison.acceptance.gateReady, true);
      assertSame(comparison.acceptance.accepted, false);

      await rm(new URL(`${directory}/`, REPOSITORY_ROOT_URL), {
        recursive: true,
        force: true,
      });
    },
  },
  {
    name: 'benchmark compare does not accept a materially regressing target',
    async run() {
      const directory = `${COMPARE_DIRECTORY}-regressing-target`;
      const drift = [1.0, 1.02, 0.99, 1.03, 0.98, 1.01];
      /** @type {Record<string, number>} */
      const ratios = {
        'object-properties:cold': 0.7,
        'object-properties:steady': 0.7,
        'arrays:cold': 1.12,
        'arrays:steady': 1.12,
        'arithmetic-loops:cold': 0.7,
        'arithmetic-loops:steady': 0.7,
      };
      const pairs = await writeCapturePairs(directory, {
        hosts: ['node'],
        rounds: drift.length,
        baselineMedian: (cell, round) => BASE_MEDIANS[cell] * drift[round],
        candidateMedian: (cell, round) =>
          BASE_MEDIANS[cell] * drift[round] * ratios[cell],
      });
      const comparison = await runCompare(directory, {
        targets: [{ workload: 'arrays' }],
        pairs,
      });

      assertSame(comparison.acceptance.nonTargetRegressionCount, 0);
      assertSame(
        comparison.acceptance.allHostGeomeanPointEstimatesImprove,
        true,
      );
      assertSame(
        comparison.acceptance.allHostGeomeanVerdictsImproveOrWithinNoise,
        true,
      );
      assertSame(comparison.acceptance.allHostAggregateImproves, true);
      assertSame(comparison.acceptance.targetVerdictsImprove, false);
      assertSame(comparison.acceptance.targetsMateriallyExceedNoise, true);
      assertSame(comparison.acceptance.gateReady, true);
      assertSame(comparison.acceptance.accepted, false);

      await rm(new URL(`${directory}/`, REPOSITORY_ROOT_URL), {
        recursive: true,
        force: true,
      });
    },
  },
  {
    name: 'benchmark compare does not accept an immaterial target',
    async run() {
      const directory = `${COMPARE_DIRECTORY}-immaterial-target`;
      const drift = [1.0, 1.02, 0.99, 1.03, 0.98, 1.01];
      /** @type {Record<string, number>} */
      const ratios = {
        'object-properties:cold': 0.8,
        'object-properties:steady': 0.8,
        'arrays:cold': 1.004,
        'arrays:steady': 1.004,
        'arithmetic-loops:cold': 0.8,
        'arithmetic-loops:steady': 0.8,
      };
      const pairs = await writeCapturePairs(directory, {
        hosts: ['node'],
        rounds: drift.length,
        baselineMedian: (cell, round) => BASE_MEDIANS[cell] * drift[round],
        candidateMedian: (cell, round) =>
          BASE_MEDIANS[cell] * drift[round] * ratios[cell],
      });
      const comparison = await runCompare(directory, {
        targets: [{ workload: 'arrays' }],
        pairs,
      });

      assertSame(comparison.acceptance.nonTargetRegressionCount, 0);
      assertSame(
        comparison.acceptance.allHostGeomeanPointEstimatesImprove,
        true,
      );
      assertSame(
        comparison.acceptance.allHostGeomeanVerdictsImproveOrWithinNoise,
        true,
      );
      assertSame(comparison.acceptance.allHostAggregateImproves, true);
      assertSame(comparison.acceptance.targetVerdictsImprove, false);
      assertSame(comparison.acceptance.targetsMateriallyExceedNoise, false);
      assertSame(comparison.acceptance.gateReady, true);
      assertSame(comparison.acceptance.accepted, false);

      await rm(new URL(`${directory}/`, REPOSITORY_ROOT_URL), {
        recursive: true,
        force: true,
      });
    },
  },
  {
    name: 'benchmark compare rejects capture timestamps that contradict the declared order',
    async run() {
      const directory = `${COMPARE_DIRECTORY}-timestamp-order`;
      const pairs = await writeCapturePairs(directory, {
        hosts: ['node'],
        rounds: 2,
        baselineMedian: (cell) => BASE_MEDIANS[cell],
        candidateMedian: (cell) => BASE_MEDIANS[cell] * 0.9,
      });

      try {
        await expectCompareFailure(
          directory,
          pairs,
          'Capture order',
          `${directory}/candidate-1/node.json`,
          (report) => ({
            ...report,
            generatedAt: '2026-08-07T23:59:00.000Z',
          }),
        );
        await expectCompareFailure(
          directory,
          pairs,
          'invalid generatedAt',
          `${directory}/candidate-1/node.json`,
          (report) => ({ ...report, generatedAt: 'not-a-timestamp' }),
        );
        await expectCompareFailure(
          directory,
          pairs,
          'invalid generatedAt',
          `${directory}/candidate-1/node.json`,
          (report) => ({
            ...report,
            generatedAt: '2026-02-30T00:00:00.000Z',
          }),
        );
        await expectCompareFailure(
          directory,
          pairs,
          'timestamps must differ',
          `${directory}/candidate-1/node.json`,
          (report) => ({
            ...report,
            generatedAt: '2026-08-08T00:00:00.000Z',
          }),
        );
      } finally {
        await rm(new URL(`${directory}/`, REPOSITORY_ROOT_URL), {
          recursive: true,
          force: true,
        });
      }
    },
  },
  {
    name: 'benchmark compare requires capture orders to remain within one pair of each other',
    async run() {
      const directory = `${COMPARE_DIRECTORY}-skewed-orders`;
      const pairs = await writeCapturePairs(directory, {
        hosts: ['node'],
        rounds: 6,
        orders: [
          'baseline-candidate',
          'baseline-candidate',
          'baseline-candidate',
          'baseline-candidate',
          'baseline-candidate',
          'candidate-baseline',
        ],
        baselineMedian: (cell) => BASE_MEDIANS[cell],
        candidateMedian: (cell) => BASE_MEDIANS[cell] * 0.9,
      });
      const comparison = await runCompare(directory, {
        targets: [{ workload: 'arrays' }],
        pairs,
      });

      assertSame(comparison.audit.counterbalanced, false);
      assertSame(comparison.acceptance.gateReady, false);
      assertSame(
        comparison.warnings.some((warning) => warning.includes('within one')),
        true,
      );

      await rm(new URL(`${directory}/`, REPOSITORY_ROOT_URL), {
        recursive: true,
        force: true,
      });
    },
  },
  {
    name: 'benchmark compare rejects checksum source config and pairing mismatches across capture roots',
    async run() {
      const directory = `${COMPARE_DIRECTORY}-mismatch`;
      const drift = [1.0, 1.01];
      /** @type {(cell: string, round: number) => number} */
      const baselineMedian = (cell, round) => BASE_MEDIANS[cell] * drift[round];
      const pairs = await writeCapturePairs(directory, {
        hosts: ['node'],
        rounds: 2,
        baselineMedian,
        candidateMedian: (cell, round) => baselineMedian(cell, round) * 0.9,
      });

      await expectCompareFailure(
        directory,
        pairs,
        'expectedChecksum',
        `${directory}/candidate-1/node.json`,
        (report) => ({
          ...report,
          config: {
            ...report.config,
            workloads: report.config.workloads.map(
              (/** @type {any} */ workload) =>
                workload.name === 'arrays'
                  ? { ...workload, expectedChecksum: 999 }
                  : workload,
            ),
          },
          results: report.results.map((/** @type {any} */ result) =>
            result.workload === 'arrays'
              ? { ...result, checksum: 999 }
              : result,
          ),
        }),
      );
      await expectCompareFailure(
        directory,
        pairs,
        'gitCommit',
        `${directory}/baseline-2/node.json`,
        (report) => ({
          ...report,
          source: { ...report.source, gitCommit: CANDIDATE_COMMIT },
        }),
      );
      await expectCompareFailure(
        directory,
        pairs,
        'gitDirty',
        `${directory}/candidate-2/node.json`,
        (report) => ({
          ...report,
          source: { ...report.source, gitDirty: true },
        }),
      );
      await expectCompareFailure(
        directory,
        pairs,
        'config.samples',
        `${directory}/candidate-1/node.json`,
        (report) => ({
          ...report,
          config: { ...report.config, samples: 2 },
          results: report.results.map((/** @type {any} */ result) => ({
            ...result,
            lanes: {
              native: truncateLane(result.lanes.native, 2),
              jsjs: truncateLane(result.lanes.jsjs, 2),
            },
          })),
        }),
      );
      await expectCompareFailure(
        directory,
        pairs,
        'runId',
        `${directory}/candidate-2/node.json`,
        (report) => ({ ...report, runId: 'baseline-1' }),
      );
      await expectCompareFailure(
        directory,
        pairs,
        'profile',
        `${directory}/candidate-1/node.json`,
        (report) => ({
          ...report,
          config: { ...report.config, profile: 'smoke' },
        }),
      );

      // A single capture order is a design failure, not a data failure: it
      // must warn and refuse gate readiness rather than throw.
      const singleOrderDirectory = `${directory}-single-order`;
      const singleOrderPairs = await writeCapturePairs(singleOrderDirectory, {
        hosts: ['node'],
        rounds: 2,
        orders: ['baseline-candidate', 'baseline-candidate'],
        baselineMedian,
        candidateMedian: (cell, round) => baselineMedian(cell, round) * 0.9,
      });
      const singleOrder = await runCompare(singleOrderDirectory, {
        targets: [{ workload: 'arrays' }],
        pairs: singleOrderPairs,
      });
      assertSame(singleOrder.acceptance.gateReady, false);
      assertSame(
        singleOrder.warnings.some((warning) =>
          warning.includes('counterbalanc'),
        ),
        true,
      );
      assertSame(
        singleOrder.cells.some((cell) => cell.verdict === 'regression'),
        false,
      );

      await expectManifestFailure(
        directory,
        {
          schemaVersion: COMPARISON_MANIFEST_SCHEMA_VERSION,
          targets: [{ workload: 'arrays' }],
          pairs: [pairs[0]],
        },
        'at least 2',
      );
      await expectManifestFailure(
        directory,
        {
          schemaVersion: 99,
          targets: [{ workload: 'arrays' }],
          pairs,
        },
        'schemaVersion',
      );
      await expectManifestFailure(
        directory,
        {
          schemaVersion: COMPARISON_MANIFEST_SCHEMA_VERSION,
          targets: [{ workload: 'not-a-workload' }],
          pairs,
        },
        'not-a-workload',
      );
      await expectManifestFailure(
        directory,
        {
          schemaVersion: COMPARISON_MANIFEST_SCHEMA_VERSION,
          targets: [{ workload: 'arrays' }],
          pairs: [pairs[0], pairs[0]],
        },
        'duplicate',
      );

      await rm(new URL(`${directory}/`, REPOSITORY_ROOT_URL), {
        recursive: true,
        force: true,
      });
      await rm(new URL(`${singleOrderDirectory}/`, REPOSITORY_ROOT_URL), {
        recursive: true,
        force: true,
      });
    },
  },
];

/**
 * @param {string} directory
 * @param {{
 *   hosts: readonly string[],
 *   rounds: number,
 *   orders?: readonly ('baseline-candidate' | 'candidate-baseline')[],
 *   baselineCommit?: string,
 *   candidateCommit?: string,
 *   baselineMedian: (cell: string, round: number, host: string) => number,
 *   candidateMedian: (cell: string, round: number, host: string) => number,
 * }} options
 * @returns {Promise<ManifestPair[]>}
 */
async function writeCapturePairs(directory, options) {
  const directoryUrl = new URL(`${directory}/`, REPOSITORY_ROOT_URL);

  await rm(directoryUrl, { recursive: true, force: true });
  await mkdir(directoryUrl, { recursive: true });

  /** @type {ManifestPair[]} */
  const pairs = [];

  for (let round = 0; round < options.rounds; round += 1) {
    const order =
      options.orders?.[round] ??
      (round % 2 === 0 ? 'baseline-candidate' : 'candidate-baseline');

    const captureOrder =
      order === 'baseline-candidate'
        ? /** @type {const} */ (['baseline', 'candidate'])
        : /** @type {const} */ (['candidate', 'baseline']);

    for (
      let captureIndex = 0;
      captureIndex < captureOrder.length;
      captureIndex += 1
    ) {
      const side = captureOrder[captureIndex];
      const root = `${directory}/${side}-${round + 1}`;
      const generatedAt = new Date(
        Date.UTC(2026, 7, 8, 0, round * 2 + captureIndex),
      ).toISOString();

      await mkdir(new URL(`${root}/`, REPOSITORY_ROOT_URL), {
        recursive: true,
      });

      for (const host of options.hosts) {
        const medianOf =
          side === 'baseline'
            ? options.baselineMedian
            : options.candidateMedian;
        const report = createFixtureReport({
          host,
          runId: `${side}-${round + 1}`,
          generatedAt,
          gitCommit:
            side === 'baseline'
              ? (options.baselineCommit ?? BASE_COMMIT)
              : (options.candidateCommit ?? CANDIDATE_COMMIT),
          cells: Object.keys(BASE_MEDIANS).map((cell) => ({
            workload: cell.slice(0, cell.indexOf(':')),
            mode: /** @type {Mode} */ (cell.slice(cell.indexOf(':') + 1)),
            medianMs: medianOf(cell, round, host),
          })),
        });

        await writeFile(
          new URL(`${root}/${host}.json`, REPOSITORY_ROOT_URL),
          `${JSON.stringify(report, null, 2)}\n`,
          'utf8',
        );
      }
    }

    pairs.push({
      round: round + 1,
      order,
      baseline: `${directory}/baseline-${round + 1}`,
      candidate: `${directory}/candidate-${round + 1}`,
    });
  }

  return pairs;
}

/**
 * @param {FixtureReportOptions} options
 * @returns {HostReport}
 */
function createFixtureReport(options) {
  const samples = options.samples ?? 3;
  /** @type {string[]} */
  const workloadNames = [];

  for (const cell of options.cells) {
    if (!workloadNames.includes(cell.workload)) {
      workloadNames.push(cell.workload);
    }
  }

  /** @type {HostReport['config']} */
  const config = {
    profile: 'default',
    warmups: 3,
    samples,
    targetSampleMs: 100,
    maxBatchSize: 1000000,
    workloads: workloadNames.map((name) => ({
      name,
      source: `(function () { return ${JSON.stringify(name)}; }())`,
      expectedChecksum: WORKLOAD_CHECKSUMS[name],
    })),
  };
  /** @type {HostResult[]} */
  const results = [];

  for (const name of workloadNames) {
    for (const mode of MODES) {
      const cell = options.cells.find(
        (entry) => entry.workload === name && entry.mode === mode,
      );

      if (cell === undefined) {
        throw new Error(`Fixture is missing ${name}/${mode}`);
      }

      const native = createLane(2);
      const jsjs = createLane(cell.medianMs);

      results.push({
        workload: name,
        mode,
        boundary:
          mode === 'cold'
            ? 'Cold uses one unbatched invocation per sample.'
            : 'Steady invokes one pre-created guest function.',
        checksum: WORKLOAD_CHECKSUMS[name],
        slowdown: cell.medianMs / 2,
        lanes: { native, jsjs },
      });
    }
  }

  return /** @type {HostReport} */ (
    validateHostReport({
      schemaVersion: 3,
      generatedAt: options.generatedAt,
      runId: options.runId,
      host: options.host,
      version: `${options.host}-26.0.0`,
      source: { gitCommit: options.gitCommit, gitDirty: false },
      config,
      results,
    })
  );
}

/**
 * @param {number} medianMs
 * @returns {LaneResult}
 */
function createLane(medianMs) {
  const samplesMs = [medianMs * 0.98, medianMs, medianMs * 1.02];

  return {
    batchSize: 1,
    samplesMs,
    normalizedSamplesMs: samplesMs,
    summary: summarizeSamples(samplesMs),
  };
}

/**
 * @param {LaneResult} lane
 * @param {number} samples
 * @returns {LaneResult}
 */
function truncateLane(lane, samples) {
  const samplesMs = lane.samplesMs.slice(0, samples);

  return {
    batchSize: lane.batchSize,
    samplesMs,
    normalizedSamplesMs: lane.normalizedSamplesMs.slice(0, samples),
    summary: lane.summary,
  };
}

/**
 * @param {string} directory
 * @param {{
 *   targets: readonly { workload: string, mode?: Mode }[],
 *   pairs: readonly ManifestPair[],
 *   name?: string,
 * }} manifest
 * @returns {Promise<import('../../benchmark/compare.js').ComparisonReport>}
 */
async function runCompare(directory, manifest) {
  const manifestPath = `${directory}/${manifest.name ?? 'manifest'}.json`;

  await writeFile(
    new URL(manifestPath, REPOSITORY_ROOT_URL),
    `${JSON.stringify(
      {
        schemaVersion: COMPARISON_MANIFEST_SCHEMA_VERSION,
        label: 'fixture comparison',
        targets: manifest.targets,
        pairs: manifest.pairs,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  return /** @type {any} */ (
    await main([
      'compare',
      `--manifest=${manifestPath}`,
      `--output=${directory}/comparison`,
    ])
  );
}

/**
 * @param {string} manifestPath
 * @param {string} outputBase
 * @param {string} fragment
 * @returns {Promise<void>}
 */
async function expectComparisonOutputFailure(
  manifestPath,
  outputBase,
  fragment,
) {
  let error;

  try {
    await compareManifestFile(manifestPath, outputBase);
  } catch (caught) {
    error = caught;
  }

  assertSame(
    error instanceof Error,
    true,
    `expected an output failure for ${fragment}`,
  );
  assertSame(
    error instanceof Error && error.message.includes(fragment),
    true,
    `expected the output failure to name ${fragment}, got ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

/**
 * @param {string} directory
 * @param {readonly ManifestPair[]} pairs
 * @param {string} fragment
 * @param {string} reportPath
 * @param {(report: any) => any} mutate
 * @returns {Promise<void>}
 */
async function expectCompareFailure(
  directory,
  pairs,
  fragment,
  reportPath,
  mutate,
) {
  const fileUrl = new URL(reportPath, REPOSITORY_ROOT_URL);
  const original = await readFile(fileUrl, 'utf8');

  await writeFile(
    fileUrl,
    `${JSON.stringify(mutate(JSON.parse(original)), null, 2)}\n`,
    'utf8',
  );

  let error;
  try {
    await runCompare(directory, {
      targets: [{ workload: 'arrays' }],
      pairs,
      name: 'mismatch-manifest',
    });
  } catch (caught) {
    error = caught;
  } finally {
    await writeFile(fileUrl, original, 'utf8');
  }

  assertSame(
    error instanceof Error,
    true,
    `expected a failure for ${fragment}`,
  );
  assertSame(
    error instanceof Error && error.message.includes(fragment),
    true,
    `expected the failure to name ${fragment}, got ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

/**
 * @param {string} directory
 * @param {unknown} manifest
 * @param {string} fragment
 * @returns {Promise<void>}
 */
async function expectManifestFailure(directory, manifest, fragment) {
  const manifestPath = `${directory}/invalid-manifest.json`;

  await writeFile(
    new URL(manifestPath, REPOSITORY_ROOT_URL),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  let error;
  try {
    await main([
      'compare',
      `--manifest=${manifestPath}`,
      `--output=${directory}/comparison`,
    ]);
  } catch (caught) {
    error = caught;
  }

  assertSame(
    error instanceof Error,
    true,
    `expected a failure for ${fragment}`,
  );
  assertSame(
    error instanceof Error && error.message.includes(fragment),
    true,
    `expected the failure to name ${fragment}, got ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

/**
 * @param {any} comparison
 * @param {string} host
 * @param {string} workload
 * @param {Mode} mode
 * @returns {any}
 */
function cellOf(comparison, host, workload, mode) {
  const cell = comparison.cells.find(
    (/** @type {any} */ entry) =>
      entry.host === host && entry.workload === workload && entry.mode === mode,
  );

  if (cell === undefined) {
    throw new Error(`Missing comparison cell ${host}/${workload}/${mode}`);
  }

  return cell;
}

/**
 * @param {any} comparison
 * @param {string} host
 * @returns {any}
 */
function aggregateOf(comparison, host) {
  const aggregate = comparison.hostAggregates.find(
    (/** @type {any} */ entry) => entry.host === host,
  );

  if (aggregate === undefined) {
    throw new Error(`Missing host aggregate ${host}`);
  }

  return aggregate;
}

/**
 * @param {any} comparison
 * @param {string} id
 * @returns {any}
 */
function conditionOf(comparison, id) {
  const condition = comparison.acceptance.exceptionalReview.conditions.find(
    (/** @type {any} */ entry) => entry.id === id,
  );

  if (condition === undefined) {
    throw new Error(`Missing exceptional-review condition ${id}`);
  }

  return condition;
}

/**
 * @param {readonly number[]} values
 * @returns {number}
 */
function geometricMeanOf(values) {
  let total = 0;

  for (const value of values) {
    total += Math.log(value);
  }

  return Math.exp(total / values.length);
}

/**
 * @param {unknown} actual
 * @param {number} expected
 * @param {number} tolerance
 * @returns {void}
 */
function assertClose(actual, expected, tolerance) {
  if (typeof actual !== 'number' || !Number.isFinite(actual)) {
    throw new Error(`Expected a finite number, got ${String(actual)}`);
  }

  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `Expected ${actual} to be within ${tolerance} of ${expected}`,
    );
  }
}

export default tests;
