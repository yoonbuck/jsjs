import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { assertSame, assertThrows } from '../harness/assert.js';
import { parseBenchmarkArguments, main } from '../../benchmark/cli.js';
import {
  summarizeReports,
  summaryToCsv,
} from '../../benchmark/summarize.js';
import { validateHostReport } from '../../benchmark/report.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const SUMMARY_DIRECTORY = '.benchmark-results/test-node-summary';

const tests = [
  {
    name: 'benchmark summary parses summary arguments and rejects unsafe directories',
    run() {
      assertSame(
        JSON.stringify(
          parseBenchmarkArguments([
            'summary',
            '--input=.benchmark-results/in',
            '--output=.benchmark-results/out',
          ]),
        ),
        JSON.stringify({
          command: 'summary',
          inputDirectory: '.benchmark-results/in',
          outputDirectory: '.benchmark-results/out',
        }),
      );
      assertSame(
        assertThrows(
          () => parseBenchmarkArguments(['summary', '--input=../outside']),
          RangeError,
        ).message.includes('outside repository'),
        true,
      );
    },
  },
  {
    name: 'benchmark summary aggregates compatible reports and emits deterministic csv columns',
    run() {
      const nodeReport = createFixtureReport({ host: 'node' });
      const chromiumReport = createFixtureReport({ host: 'chromium' });
      const summary = summarizeReports([nodeReport, chromiumReport]);

      assertSame(summary.schemaVersion, 1);
      assertSame(summary.hosts.join(','), 'node,chromium');
      assertSame(summary.aggregate.length, 4);
      assertSame(
        summary.aggregate.every((row) => row.geometricMeanSlowdown > 0),
        true,
      );
      assertSame(
        summary.aggregate
          .map(
            ({ host, mode, geometricMeanSlowdown }) =>
              `${host}:${mode}:${geometricMeanSlowdown}`,
          )
          .join(','),
        'node:cold:6,node:steady:4,chromium:cold:6,chromium:steady:4',
      );
      assertSame(
        summary.workloads
          .map(({ host, workload, mode }) => `${host}:${workload}:${mode}`)
          .join(','),
        [
          'node:alpha:cold',
          'node:alpha:steady',
          'node:beta:cold',
          'node:beta:steady',
          'chromium:alpha:cold',
          'chromium:alpha:steady',
          'chromium:beta:cold',
          'chromium:beta:steady',
        ].join(','),
      );
      assertSame(
        summary.methodology
          .map(({ mode, boundary }) => `${mode}:${boundary}`)
          .join(','),
        'cold:Cold "compile", execute,steady:Steady, execute',
      );
      assertSame(
        summaryToCsv(summary),
        [
          'host,mode,workload,geometricMeanSlowdown,slowdown,checksum,nativeMedianMs,nativeP95Ms,nativeCoefficientOfVariation,nativeBatchSize,jsjsMedianMs,jsjsP95Ms,jsjsCoefficientOfVariation,jsjsBatchSize,boundary',
          '"node","cold","alpha",6,4,101,1,1,0,1,4,4,0,2,"Cold ""compile"", execute"',
          '"node","steady","alpha",4,1,101,1,1,0,1,1,1,0,2,"Steady, execute"',
          '"node","cold","beta",6,9,202,2,2,0,1,18,18,0,2,"Cold ""compile"", execute"',
          '"node","steady","beta",4,16,202,2,2,0,1,32,32,0,2,"Steady, execute"',
          '"chromium","cold","alpha",6,9,101,1,1,0,1,9,9,0,2,"Cold ""compile"", execute"',
          '"chromium","steady","alpha",4,16,101,1,1,0,1,16,16,0,2,"Steady, execute"',
          '"chromium","cold","beta",6,4,202,2,2,0,1,8,8,0,2,"Cold ""compile"", execute"',
          '"chromium","steady","beta",4,1,202,2,2,0,1,2,2,0,2,"Steady, execute"',
          '',
        ].join('\n'),
      );
    },
  },
  {
    name: 'benchmark summary rejects schema config workload order and checksum divergence with both host names',
    run() {
      const nodeReport = createFixtureReport({ host: 'node' });
      const chromiumReport = createFixtureReport({ host: 'chromium' });

      expectIncompatible(
        nodeReport,
        withChanges(chromiumReport, { schemaVersion: 2 }),
        'schemaVersion',
      );
      expectIncompatible(
        nodeReport,
        withChanges(chromiumReport, {
          config: { ...chromiumReport.config, profile: 'custom' },
        }),
        'config.profile',
      );
      expectIncompatible(
        nodeReport,
        withSampleCount(chromiumReport, 3),
        'config.samples',
      );
      expectIncompatible(
        nodeReport,
        reorderWorkloads(chromiumReport),
        'config.workloads[0].name',
      );
      expectIncompatible(
        nodeReport,
        withChecksum(chromiumReport, 'beta', 303),
        'expectedChecksum',
      );
    },
  },
  {
    name: 'benchmark summary command reads lexical json reports excludes summary json and writes artifacts',
    async run() {
      const directoryUrl = new URL(`${SUMMARY_DIRECTORY}/`, REPOSITORY_ROOT_URL);

      await rm(directoryUrl, { recursive: true, force: true });
      await mkdir(directoryUrl, { recursive: true });
      await writeJsonFile(
        new URL('b-node.json', directoryUrl),
        createFixtureReport({ host: 'node' }),
      );
      await writeJsonFile(
        new URL('a-chromium.json', directoryUrl),
        createFixtureReport({ host: 'chromium' }),
      );
      await writeFile(new URL('summary.json', directoryUrl), 'not json\n', 'utf8');

      const summary = await main([
        'summary',
        `--input=${SUMMARY_DIRECTORY}`,
        `--output=${SUMMARY_DIRECTORY}`,
      ]);
      const persistedSummary = JSON.parse(
        await readFile(new URL('summary.json', directoryUrl), 'utf8'),
      );
      const persistedCsv = await readFile(
        new URL('summary.csv', directoryUrl),
        'utf8',
      );

      assertSame(summary.hosts.join(','), 'chromium,node');
      assertSame(JSON.stringify(persistedSummary), JSON.stringify(summary));
      assertSame(persistedCsv, summaryToCsv(summary));

      await rm(directoryUrl, { recursive: true, force: true });
    },
  },
];

/**
 * @param {{ host: string }} options
 * @returns {ReturnType<typeof validateHostReport>}
 */
function createFixtureReport({ host }) {
  const config = {
    profile: 'smoke',
    warmups: 1,
    samples: 2,
    targetSampleMs: 5,
    maxBatchSize: 10,
    workloads: [
      {
        name: 'alpha',
        source: 'alpha();',
        expectedChecksum: 101,
      },
      {
        name: 'beta',
        source: 'beta();',
        expectedChecksum: 202,
      },
    ],
  };
  const slowdowns =
    host === 'node'
      ? {
          alpha: { cold: 4, steady: 1 },
          beta: { cold: 9, steady: 16 },
        }
      : {
          alpha: { cold: 9, steady: 16 },
          beta: { cold: 4, steady: 1 },
        };
  /** @type {any[]} */
  const results = [];

  config.workloads.forEach((workload, workloadIndex) => {
    results.push(
      createResult({
        workload: workload.name,
        checksum: workload.expectedChecksum,
        mode: 'cold',
        boundary: 'Cold "compile", execute',
        slowdown: slowdowns[workload.name].cold,
        nativeMedianMs: workloadIndex + 1,
      }),
    );
    results.push(
      createResult({
        workload: workload.name,
        checksum: workload.expectedChecksum,
        mode: 'steady',
        boundary: 'Steady, execute',
        slowdown: slowdowns[workload.name].steady,
        nativeMedianMs: workloadIndex + 1,
      }),
    );
  });

  return validateHostReport({
    schemaVersion: 1,
    generatedAt: '2026-08-07T00:00:00.000Z',
    host,
    version: `${host}-1.0.0`,
    config,
    results,
  });
}

/**
 * @param {{
 *   workload: string,
 *   checksum: number,
 *   mode: 'cold' | 'steady',
 *   boundary: string,
 *   slowdown: number,
 *   nativeMedianMs: number,
 * }} options
 * @returns {object}
 */
function createResult(options) {
  return {
    workload: options.workload,
    mode: options.mode,
    boundary: options.boundary,
    checksum: options.checksum,
    slowdown: options.slowdown,
    lanes: {
      native: createLane(1, options.nativeMedianMs),
      jsjs: createLane(2, options.nativeMedianMs * options.slowdown),
    },
  };
}

/**
 * @param {number} batchSize
 * @param {number} medianMs
 * @returns {object}
 */
function createLane(batchSize, medianMs) {
  return {
    batchSize,
    samplesMs: [medianMs, medianMs],
    normalizedSamplesMs: [medianMs, medianMs],
    summary: {
      median: medianMs,
      p95: medianMs,
      coefficientOfVariation: 0,
    },
  };
}

/**
 * @param {ReturnType<typeof createFixtureReport>} report
 * @param {ReturnType<typeof createFixtureReport>} incompatible
 * @param {string} fragment
 * @returns {void}
 */
function expectIncompatible(report, incompatible, fragment) {
  const error = assertThrows(
    () => summarizeReports([report, incompatible]),
    Error,
  );

  assertSame(error.message.includes(report.host), true);
  assertSame(error.message.includes(incompatible.host), true);
  assertSame(error.message.includes(fragment), true);
}

/**
 * @param {Record<string, any>} report
 * @param {Record<string, any>} changes
 * @returns {any}
 */
function withChanges(report, changes) {
  return {
    ...report,
    ...changes,
  };
}

/**
 * @param {ReturnType<typeof createFixtureReport>} report
 * @param {number} samples
 * @returns {ReturnType<typeof createFixtureReport>}
 */
function withSampleCount(report, samples) {
  return validateHostReport({
    ...report,
    config: {
      ...report.config,
      samples,
    },
    results: report.results.map((result) => ({
      ...result,
      lanes: {
        native: withLaneSamples(result.lanes.native, samples),
        jsjs: withLaneSamples(result.lanes.jsjs, samples),
      },
    })),
  });
}

/**
 * @param {{
 *   batchSize: number,
 *   normalizedSamplesMs: readonly number[],
 *   samplesMs: readonly number[],
 *   summary: { median: number, p95: number, coefficientOfVariation: number },
 * }} lane
 * @param {number} samples
 * @returns {object}
 */
function withLaneSamples(lane, samples) {
  return {
    ...lane,
    samplesMs: Array.from({ length: samples }, () => lane.samplesMs[0]),
    normalizedSamplesMs: Array.from(
      { length: samples },
      () => lane.normalizedSamplesMs[0],
    ),
  };
}

/**
 * @param {ReturnType<typeof createFixtureReport>} report
 * @returns {ReturnType<typeof createFixtureReport>}
 */
function reorderWorkloads(report) {
  const workloads = [...report.config.workloads].reverse();
  const results = workloads.flatMap((workload) =>
    report.results.filter((result) => result.workload === workload.name),
  );

  return validateHostReport({
    ...report,
    config: {
      ...report.config,
      workloads,
    },
    results,
  });
}

/**
 * @param {ReturnType<typeof createFixtureReport>} report
 * @param {string} workloadName
 * @param {number} expectedChecksum
 * @returns {ReturnType<typeof createFixtureReport>}
 */
function withChecksum(report, workloadName, expectedChecksum) {
  return validateHostReport({
    ...report,
    config: {
      ...report.config,
      workloads: report.config.workloads.map((workload) =>
        workload.name === workloadName
          ? { ...workload, expectedChecksum }
          : workload,
      ),
    },
    results: report.results.map((result) =>
      result.workload === workloadName
        ? { ...result, checksum: expectedChecksum }
        : result,
    ),
  });
}

/**
 * @param {URL} fileUrl
 * @param {unknown} value
 * @returns {Promise<void>}
 */
async function writeJsonFile(fileUrl, value) {
  await writeFile(fileUrl, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export default tests;
