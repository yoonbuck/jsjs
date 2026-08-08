import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { assertSame, assertThrows } from '../harness/assert.js';
import {
  analyzeProfileArtifacts,
  parseProfileAnalysisArguments,
  writeProfileAnalysisOutputsAtomically,
} from '../../benchmark/profile/analyze.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const TEST_DIRECTORY = '.benchmark-results/test-profile-analysis';
const CHECKSUM = 12345;
/** @type {readonly string[]} */
const WORKLOADS = Object.freeze(['arithmetic-loops', 'calls-recursion']);
/** @type {readonly ('node' | 'chromium')[]} */
const HOSTS = Object.freeze(['node', 'chromium']);
/** @type {readonly ('cpu' | 'allocation')[]} */
const METRICS = Object.freeze(['cpu', 'allocation']);

/** @type {import('../harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'profile analysis pairs metric-specific sidecars and equal-weights interpreter shares',
    async run() {
      const fixture = await createFixture();

      try {
        const result = await analyzeProfileArtifacts(fixture);
        const aggregate = result.analysis.groups.all;
        const evaluator = aggregate.cpu.interpreter.categories.find(
          (entry) => entry.key === 'evaluator',
        );

        assertSame(result.correlation.profiles.length, 4);
        assertSame(result.correlation.allChecksumsMatch, true);
        assertSame(result.correlation.profiles[0].cpuSampleCount, 2);
        assertSame(
          result.correlation.profiles[0].cpuSamplingIntervalMicroseconds,
          100,
        );
        assertSame(
          result.correlation.profiles[0].allocationSamplingIntervalBytes,
          32768,
        );
        assertSame(
          result.correlation.profiles[0].cpuProfileElapsedMilliseconds,
          1,
        );
        assertSame(
          result.correlation.profiles[0].allocationProfileElapsedMilliseconds,
          50,
        );
        assertSame(result.analysis.weighting, 'equal-observation');
        assertSame(aggregate.profileCount, 4);
        assertSame(
          aggregate.cpu.diagnostics.interpreterTotalMicroseconds,
          2200,
        );
        assertSame(evaluator?.percentage, 50);
        assertSame(
          aggregate.cpu.interpreter.frames.some((entry) =>
            entry.key.startsWith('host|'),
          ),
          false,
        );
        assertSame(
          aggregate.cpu.overhead.frames.some(
            (entry) => entry.key === 'host|#(garbage collector)',
          ),
          true,
        );
        assertSame(
          aggregate.cpu.overhead.frames.some(
            (entry) => entry.key === 'host|#(idle)',
          ),
          true,
        );
        assertSame(
          aggregate.cpu.overhead.frames.some(
            (entry) => entry.key === 'host|#inspector',
          ),
          true,
        );
        assertSame(
          aggregate.cpu.overhead.frames.some(
            (entry) => entry.key === 'host|#runProfileHarness',
          ),
          true,
        );
        assertSame(
          JSON.parse(
            await readFile(
              new URL('profile-analysis.json', fixture.profileUrl),
              'utf8',
            ),
          ).weighting,
          'equal-observation',
        );
      } finally {
        await removeFixture();
      }
    },
  },
  {
    name: 'profile analysis normalizes interpreter shares over sample-bearing observations',
    async run() {
      const fixture = await createFixture();

      try {
        for (const host of HOSTS) {
          const sidecarUrl = new URL(
            `profiles/${host}/arithmetic-loops-cold-allocation.json`,
            fixture.profileUrl,
          );
          const sidecar = JSON.parse(await readFile(sidecarUrl, 'utf8'));
          sidecar.summaries.allocation = createSummary(
            [
              {
                category: 'host',
                url: '',
                functionName: '(idle)',
                selfSize: 100,
              },
            ],
            'selfSize',
          );
          await writeJson(sidecarUrl, sidecar);
        }

        const result = await analyzeProfileArtifacts(fixture);
        const group = result.analysis.groups.all;
        const aggregate = group.allocation;
        const evaluator = aggregate.interpreter.categories.find(
          (entry) => entry.key === 'evaluator',
        );
        const categoryTotal = aggregate.interpreter.categories.reduce(
          (total, entry) => total + (entry.percentage ?? 0),
          0,
        );

        assertSame(group.profileCount, 4);
        assertSame(aggregate.interpreter.observationCount, 2);
        assertSame(evaluator?.percentage, 10);
        assertSame(categoryTotal, 100);
      } finally {
        await removeFixture();
      }
    },
  },
  {
    name: 'profile analysis rejects missing and duplicate metric sidecars',
    async run() {
      const fixture = await createFixture();

      try {
        await rm(
          new URL(
            'profiles/node/arithmetic-loops-cold-allocation.json',
            fixture.profileUrl,
          ),
        );
        const missing = await captureRejection(() =>
          analyzeProfileArtifacts(fixture),
        );
        assertSame(
          missing.message.includes('missing allocation sidecar'),
          true,
        );

        await removeFixture();
        await createFixture();
        await writeFile(
          new URL(
            'profiles/node/arithmetic-loops-cold-cpu-copy.json',
            fixture.profileUrl,
          ),
          await readFile(
            new URL(
              'profiles/node/arithmetic-loops-cold-cpu.json',
              fixture.profileUrl,
            ),
            'utf8',
          ),
        );
        const duplicate = await captureRejection(() =>
          analyzeProfileArtifacts(fixture),
        );
        assertSame(duplicate.message.includes('duplicate cpu sidecar'), true);
      } finally {
        await removeFixture();
      }
    },
  },
  {
    name: 'profile analysis requires paired run, source, runtime, and interval metadata',
    async run() {
      /** @type {readonly {
       *   name: string,
       *   mutate: (sidecar: Record<string, any>) => void,
       *   message: string,
       * }[]} */
      const cases = [
        {
          name: 'run ID',
          mutate(sidecar) {
            sidecar.capture.runId = 'different-run';
          },
          message: 'runId',
        },
        {
          name: 'clean source commit',
          mutate(sidecar) {
            sidecar.source.gitCommit = 'different-commit';
          },
          message: 'gitCommit',
        },
        {
          name: 'clean source state',
          mutate(sidecar) {
            sidecar.source.gitDirty = true;
          },
          message: 'gitDirty',
        },
        {
          name: 'runtime',
          mutate(sidecar) {
            sidecar.runtime.version = 'different-runtime';
          },
          message: 'runtime.version',
        },
        {
          name: 'CPU interval',
          mutate(sidecar) {
            sidecar.capture.cpuSamplingIntervalMicroseconds = 200;
          },
          message: 'cpuSamplingIntervalMicroseconds',
        },
        {
          name: 'allocation interval',
          mutate(sidecar) {
            sidecar.capture.allocationSamplingIntervalBytes = 65536;
          },
          message: 'allocationSamplingIntervalBytes',
        },
      ];

      for (const testCase of cases) {
        const fixture = await createFixture();

        try {
          const sidecarUrl = new URL(
            'profiles/node/arithmetic-loops-cold-allocation.json',
            fixture.profileUrl,
          );
          const sidecar = JSON.parse(await readFile(sidecarUrl, 'utf8'));
          testCase.mutate(sidecar);
          await writeJson(sidecarUrl, sidecar);

          const error = await captureRejection(() =>
            analyzeProfileArtifacts(fixture),
          );
          assertSame(
            error.message.includes(testCase.message),
            true,
            `${testCase.name}: ${error.message}`,
          );
        } finally {
          await removeFixture();
        }
      }
    },
  },
  {
    name: 'profile analysis rejects checksum mismatch and missing baseline rows',
    async run() {
      const fixture = await createFixture();

      try {
        const sidecarUrl = new URL(
          'profiles/node/arithmetic-loops-cold-cpu.json',
          fixture.profileUrl,
        );
        const sidecar = JSON.parse(await readFile(sidecarUrl, 'utf8'));
        sidecar.result.checksum = CHECKSUM + 1;
        await writeJson(sidecarUrl, sidecar);
        const mismatch = await captureRejection(() =>
          analyzeProfileArtifacts(fixture),
        );
        assertSame(mismatch.message.includes('checksum mismatch'), true);
        assertSame(
          await fileExists(
            new URL('profile-analysis.json', fixture.profileUrl),
          ),
          false,
        );

        await removeFixture();
        await createFixture();
        for (const metric of METRICS) {
          const pairedUrl = new URL(
            `profiles/node/arithmetic-loops-cold-${metric}.json`,
            fixture.profileUrl,
          );
          const paired = JSON.parse(await readFile(pairedUrl, 'utf8'));
          paired.capture.workload = 'missing-workload';
          await writeJson(pairedUrl, paired);
        }
        const missingRow = await captureRejection(() =>
          analyzeProfileArtifacts(fixture),
        );
        assertSame(missingRow.message.includes('missing baseline'), true);
      } finally {
        await removeFixture();
      }
    },
  },
  {
    name: 'profile analysis rejects output roots outside benchmark results',
    run() {
      assertSame(
        assertThrows(
          () =>
            parseProfileAnalysisArguments([
              '--baseline=benchmark-results/baseline',
              '--profiles=.benchmark-results/profiles',
            ]),
          RangeError,
        ).message.includes('.benchmark-results'),
        true,
      );
      assertSame(
        assertThrows(
          () =>
            parseProfileAnalysisArguments([
              '--baseline=.benchmark-results/baseline',
              '--profiles=benchmark-results/profiles',
            ]),
          RangeError,
        ).message.includes('.benchmark-results'),
        true,
      );
    },
  },
  {
    name: 'profile analysis rejects percent-encoded path traversal in output roots',
    run() {
      for (const directory of [
        '.benchmark-results/%2e%2e/outside',
        '.benchmark-results/%2E%2e/outside',
        '.benchmark-results/%2e./outside',
        '.benchmark-results/.%2E/outside',
        '.benchmark-results/%2e%2e%2foutside',
        '.benchmark-results/%2e%2e%5Coutside',
      ]) {
        const error = assertThrows(
          () =>
            parseProfileAnalysisArguments([
              `--baseline=${directory}`,
              '--profiles=.benchmark-results/profiles',
            ]),
          RangeError,
        );
        assertSame(
          error.message.includes('must not escape the repository'),
          true,
          directory,
        );
      }
    },
  },
  {
    name: 'profile analysis atomically restores both outputs when promotion fails',
    async run() {
      const outputDirectory = `${TEST_DIRECTORY}/atomic`;
      const outputUrl = new URL(`${outputDirectory}/`, REPOSITORY_ROOT_URL);
      await rm(outputUrl, { recursive: true, force: true });
      await mkdir(outputUrl, { recursive: true });
      await writeFile(
        new URL('checksum-correlation.json', outputUrl),
        '{"old":"correlation"}\n',
        'utf8',
      );
      await writeFile(
        new URL('profile-analysis.json', outputUrl),
        '{"old":"analysis"}\n',
        'utf8',
      );

      try {
        const error = await captureRejection(() =>
          writeProfileAnalysisOutputsAtomically(
            outputDirectory,
            { profiles: [] },
            { weighting: 'equal-observation', groups: {} },
            {
              async rename(from, to) {
                if (
                  from instanceof URL &&
                  to instanceof URL &&
                  from.pathname.includes('/.staging-') &&
                  to.pathname.endsWith('/profile-analysis.json')
                ) {
                  throw new Error('promote failed');
                }

                await rename(from, to);
              },
            },
          ),
        );

        assertSame(error.message, 'promote failed');
        assertSame(
          await readFile(
            new URL('checksum-correlation.json', outputUrl),
            'utf8',
          ),
          '{"old":"correlation"}\n',
        );
        assertSame(
          await readFile(new URL('profile-analysis.json', outputUrl), 'utf8'),
          '{"old":"analysis"}\n',
        );
      } finally {
        await rm(outputUrl, { recursive: true, force: true });
      }
    },
  },
];

export default tests;

/**
 * @returns {Promise<{
 *   baselineDirectory: string,
 *   profileDirectory: string,
 *   profileUrl: URL,
 * }>}
 */
async function createFixture() {
  await removeFixture();

  const rootUrl = new URL(`${TEST_DIRECTORY}/`, REPOSITORY_ROOT_URL);
  const baselineUrl = new URL('baseline/', rootUrl);
  const profileUrl = new URL('profile/', rootUrl);
  await mkdir(baselineUrl, { recursive: true });

  for (const host of HOSTS) {
    await mkdir(new URL(`profiles/${host}/`, profileUrl), { recursive: true });
    await writeJson(new URL(`${host}.json`, baselineUrl), createBaseline(host));

    for (const workload of WORKLOADS) {
      for (const metric of METRICS) {
        await writeSidecarArtifact(
          profileUrl,
          host,
          createMetricSidecar({ host, workload, metric }),
        );
      }
    }
  }

  return {
    baselineDirectory: `${TEST_DIRECTORY}/baseline`,
    profileDirectory: `${TEST_DIRECTORY}/profile`,
    profileUrl,
  };
}

/**
 * @param {'node' | 'chromium'} host
 * @returns {Record<string, unknown>}
 */
function createBaseline(host) {
  return {
    schemaVersion: 3,
    generatedAt: '2026-08-07T00:00:00.000Z',
    runId: 'fixture-baseline-run',
    host,
    version: `${host}-1.0.0`,
    source: { gitCommit: 'fixture-commit', gitDirty: false },
    config: {
      profile: 'default',
      warmups: 1,
      samples: 1,
      targetSampleMs: 1,
      maxBatchSize: 1,
      workloads: WORKLOADS.map((name) => ({
        name,
        source: `(function ${name.replace(/-/g, '_')}() { return 12345; }())`,
        expectedChecksum: CHECKSUM,
      })),
    },
    results: WORKLOADS.flatMap((workload) =>
      ['cold', 'steady'].map((mode) => ({
        workload,
        mode,
        boundary: `${mode} boundary`,
        checksum: CHECKSUM,
        slowdown: 1,
        lanes: {
          native: createLane(),
          jsjs: createLane(),
        },
      })),
    ),
  };
}

/**
 * @returns {Record<string, unknown>}
 */
function createLane() {
  return {
    batchSize: 1,
    samplesMs: [1],
    normalizedSamplesMs: [1],
    summary: {
      median: 1,
      p95: 1,
      coefficientOfVariation: 0,
    },
  };
}

/**
 * @param {{
 *   host: 'node' | 'chromium',
 *   workload: string,
 *   metric: 'cpu' | 'allocation',
 * }} options
 * @returns {Record<string, unknown>}
 */
function createMetricSidecar(options) {
  const valueField = options.metric === 'cpu' ? 'selfTime' : 'selfSize';
  const frames = createFrames(options.workload, valueField);
  const summary = createSummary(frames, valueField);
  const stem = `${options.workload}-cold-${options.metric}`;

  return {
    schemaVersion: 2,
    generatedAt: '2026-08-07T00:01:00.000Z',
    host: options.host,
    runtime: {
      name: options.host,
      version: `${options.host}-1.0.0`,
    },
    source: { gitCommit: 'fixture-commit', gitDirty: false },
    capture: {
      workload: options.workload,
      mode: 'cold',
      metric: options.metric,
      runId: `${options.host}-${options.workload}-cold`,
      warmups: 1,
      iterations: 1,
      cpuSamplingIntervalMicroseconds: 100,
      allocationSamplingIntervalBytes: 32768,
    },
    result: {
      expectedChecksum: CHECKSUM,
      checksum: CHECKSUM,
      iterations: 1,
      elapsedMilliseconds:
        options.metric === 'cpu'
          ? options.workload === 'arithmetic-loops'
            ? 1
            : 100
          : options.workload === 'arithmetic-loops'
            ? 50
            : 500,
    },
    summaries: { [options.metric]: summary },
    artifacts: {
      [options.metric]: `${stem}.${options.metric === 'cpu' ? 'cpuprofile' : 'heapprofile'}`,
    },
  };
}

/**
 * @param {string} workload
 * @param {'selfTime' | 'selfSize'} valueField
 * @returns {Record<string, unknown>[]}
 */
function createFrames(workload, valueField) {
  const interpreterFrames =
    workload === 'arithmetic-loops'
      ? [
          {
            category: 'evaluator',
            url: 'src/evaluator/expressions.js',
            functionName: 'evaluateExpression',
            value: 90,
          },
          {
            category: 'other-runtime',
            url: 'src/runtime/operators.js',
            functionName: 'applyBinaryOperator',
            value: 10,
          },
        ]
      : [
          {
            category: 'evaluator',
            url: 'src/evaluator/expressions.js',
            functionName: 'evaluateExpression',
            value: 100,
          },
          {
            category: 'other-runtime',
            url: 'src/runtime/operators.js',
            functionName: 'applyBinaryOperator',
            value: 900,
          },
        ];
  const overheadValues =
    workload === 'arithmetic-loops' ? [3, 3, 2, 2] : [25, 25, 25, 25];
  const overheadNames = [
    '(garbage collector)',
    '(idle)',
    'inspector',
    'runProfileHarness',
  ];

  return [
    ...interpreterFrames.map((frame) => ({
      category: frame.category,
      url: frame.url,
      functionName: frame.functionName,
      [valueField]: frame.value,
    })),
    ...overheadNames.map((functionName, index) => ({
      category: 'host',
      url: '',
      functionName,
      [valueField]: overheadValues[index],
    })),
  ];
}

/**
 * @param {readonly Record<string, any>[]} frames
 * @param {'selfTime' | 'selfSize'} valueField
 * @returns {Record<string, unknown>}
 */
function createSummary(frames, valueField) {
  const categoryTotals = new Map();
  let total = 0;

  for (const frame of frames) {
    total += frame[valueField];
    categoryTotals.set(
      frame.category,
      (categoryTotals.get(frame.category) ?? 0) + frame[valueField],
    );
  }

  return {
    total,
    frames,
    categories: [...categoryTotals.entries()].map(([category, value]) => ({
      category,
      [valueField]: value,
    })),
  };
}

/**
 * @param {URL} profileUrl
 * @param {'node' | 'chromium'} host
 * @param {Record<string, any>} sidecar
 * @returns {Promise<void>}
 */
async function writeSidecarArtifact(profileUrl, host, sidecar) {
  const directoryUrl = new URL(`profiles/${host}/`, profileUrl);
  const metric = sidecar.capture.metric;
  const stem = `${sidecar.capture.workload}-${sidecar.capture.mode}-${metric}`;
  await writeJson(new URL(`${stem}.json`, directoryUrl), sidecar);
  await writeFile(
    new URL(sidecar.artifacts[metric], directoryUrl),
    metric === 'cpu' ? '{"samples":[1,2]}\n' : '{}\n',
    'utf8',
  );
}

/**
 * @param {URL} fileUrl
 * @param {unknown} value
 * @returns {Promise<void>}
 */
async function writeJson(fileUrl, value) {
  await writeFile(fileUrl, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/**
 * @param {URL} fileUrl
 * @returns {Promise<boolean>}
 */
async function fileExists(fileUrl) {
  try {
    await access(fileUrl);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {() => Promise<unknown>} operation
 * @returns {Promise<Error>}
 */
async function captureRejection(operation) {
  try {
    await operation();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }

    throw new Error(`Expected Error rejection, got ${String(error)}`);
  }

  throw new Error('Expected operation to reject');
}

/**
 * @returns {Promise<void>}
 */
async function removeFixture() {
  await rm(new URL(`${TEST_DIRECTORY}/`, REPOSITORY_ROOT_URL), {
    recursive: true,
    force: true,
  });
}
