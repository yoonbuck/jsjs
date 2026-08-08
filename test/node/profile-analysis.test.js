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

/** @type {import('../harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'profile analysis correlates deterministic Node and Chromium sidecars and writes aggregate outputs',
    async run() {
      const fixture = await createFixture();

      try {
        const result = await analyzeProfileArtifacts(fixture);

        assertSame(result.correlation.profiles.length, 2);
        assertSame(result.correlation.allChecksumsMatch, true);
        assertSame(result.correlation.profiles[0].cpuSampleCount, 2);
        assertSame(
          result.correlation.profiles
            .map((row) => `${row.host}:${row.workload}:${row.mode}`)
            .join(','),
          'chromium:arithmetic-loops:cold,node:arithmetic-loops:cold',
        );
        assertSame(result.analysis.groups.all.profileCount, 2);
        assertSame(result.analysis.groups.all.cpu.totalMicroseconds, 30);
        assertSame(result.analysis.groups.all.allocation.totalBytes, 300);
        assertSame(
          result.analysis.groups.all.cpu.categories[0].key,
          'evaluator',
        );
        assertSame(
          result.analysis.groups.all.cpu.frames[0].key,
          'evaluator|src/evaluator/expressions.js#evaluateExpression',
        );
        assertSame(
          JSON.parse(
            await readFile(
              new URL('checksum-correlation.json', fixture.profileUrl),
              'utf8',
            ),
          ).profiles.length,
          2,
        );
        assertSame(
          JSON.parse(
            await readFile(
              new URL('profile-analysis.json', fixture.profileUrl),
              'utf8',
            ),
          ).groups.all.cpu.totalMicroseconds,
          30,
        );
      } finally {
        await removeFixture();
      }
    },
  },
  {
    name: 'profile analysis rejects checksum mismatches without writing success outputs',
    async run() {
      const fixture = await createFixture({
        nodeSidecar: { result: { checksum: CHECKSUM + 1 } },
      });

      try {
        const error = await captureRejection(() =>
          analyzeProfileArtifacts(fixture),
        );

        assertSame(error.message.includes('checksum mismatch'), true);
        assertSame(
          await fileExists(
            new URL('checksum-correlation.json', fixture.profileUrl),
          ),
          false,
        );
        assertSame(
          await fileExists(
            new URL('profile-analysis.json', fixture.profileUrl),
          ),
          false,
        );
      } finally {
        await removeFixture();
      }
    },
  },
  {
    name: 'profile analysis preserves empty host frame labels from sidecar summaries',
    async run() {
      const fixture = await createFixture();

      try {
        const sidecarUrl = new URL(
          'profiles/node/arithmetic-loops-cold.json',
          fixture.profileUrl,
        );
        const sidecar = JSON.parse(await readFile(sidecarUrl, 'utf8'));
        sidecar.summaries.cpu = {
          total: 10,
          frames: [
            {
              url: 'src/evaluator/expressions.js',
              functionName: 'evaluateExpression',
              selfTime: 9,
              percentage: 90,
              category: 'evaluator',
            },
            {
              url: '',
              functionName: '',
              selfTime: 1,
              percentage: 10,
              category: 'host',
            },
          ],
          categories: [
            { category: 'evaluator', selfTime: 9, percentage: 90 },
            { category: 'host', selfTime: 1, percentage: 10 },
          ],
        };
        await writeJson(sidecarUrl, sidecar);

        const result = await analyzeProfileArtifacts(fixture);
        assertSame(
          result.analysis.groups['node-cold'].cpu.frames.some(
            (frame) => frame.key === 'host|#',
          ),
          true,
        );
      } finally {
        await removeFixture();
      }
    },
  },
  {
    name: 'profile analysis rejects missing declared artifacts and baseline rows',
    async run() {
      const fixture = await createFixture();

      try {
        await rm(
          new URL(
            'profiles/node/arithmetic-loops-cold.cpuprofile',
            fixture.profileUrl,
          ),
        );
        const missingArtifact = await captureRejection(() =>
          analyzeProfileArtifacts(fixture),
        );
        assertSame(
          missingArtifact.message.includes('artifact'),
          true,
          missingArtifact.message,
        );

        await writeFile(
          new URL(
            'profiles/node/arithmetic-loops-cold.cpuprofile',
            fixture.profileUrl,
          ),
          '{"samples":[1,2]}\n',
          'utf8',
        );
        const missingRowSidecar = createSidecar({
          host: 'node',
          workload: 'missing-workload',
          mode: 'cold',
          cpuTotal: 10,
          allocationTotal: 100,
        });
        missingRowSidecar.artifacts = {
          cpu: 'arithmetic-loops-cold.cpuprofile',
          allocation: 'arithmetic-loops-cold.heapprofile',
        };
        await writeJson(
          new URL(
            'profiles/node/arithmetic-loops-cold.json',
            fixture.profileUrl,
          ),
          missingRowSidecar,
        );
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
    name: 'profile analysis rejects duplicate sidecars and unsafe root paths',
    async run() {
      const fixture = await createFixture();

      try {
        await writeJson(
          new URL('profiles/node/duplicate.json', fixture.profileUrl),
          createSidecar({
            host: 'node',
            workload: 'arithmetic-loops',
            mode: 'cold',
            cpuTotal: 10,
            allocationTotal: 100,
          }),
        );
        const duplicate = await captureRejection(() =>
          analyzeProfileArtifacts(fixture),
        );
        assertSame(duplicate.message.includes('duplicate sidecar'), true);
        assertSame(
          assertThrows(
            () =>
              parseProfileAnalysisArguments([
                '--baseline=../outside',
                '--profiles=.benchmark-results/profiles',
              ]),
            RangeError,
          ).message.includes('repository'),
          true,
        );
      } finally {
        await removeFixture();
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
            { groups: {} },
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
 * @param {{
 *   nodeSidecar?: Record<string, unknown>,
 *   chromiumSidecar?: Record<string, unknown>,
 * }} [overrides]
 * @returns {Promise<{
 *   baselineDirectory: string,
 *   profileDirectory: string,
 *   profileUrl: URL,
 * }>}
 */
async function createFixture(overrides = {}) {
  await removeFixture();

  const rootUrl = new URL(`${TEST_DIRECTORY}/`, REPOSITORY_ROOT_URL);
  const baselineUrl = new URL('baseline/', rootUrl);
  const profileUrl = new URL('profile/', rootUrl);
  await mkdir(baselineUrl, { recursive: true });
  await mkdir(new URL('profiles/node/', profileUrl), { recursive: true });
  await mkdir(new URL('profiles/chromium/', profileUrl), { recursive: true });
  await writeJson(new URL('node.json', baselineUrl), createBaseline('node'));
  await writeJson(
    new URL('chromium.json', baselineUrl),
    createBaseline('chromium'),
  );
  await writeSidecarArtifacts(
    profileUrl,
    'node',
    mergeSidecar(
      createSidecar({
        host: 'node',
        workload: 'arithmetic-loops',
        mode: 'cold',
        cpuTotal: 10,
        allocationTotal: 100,
      }),
      overrides.nodeSidecar,
    ),
  );
  await writeSidecarArtifacts(
    profileUrl,
    'chromium',
    mergeSidecar(
      createSidecar({
        host: 'chromium',
        workload: 'arithmetic-loops',
        mode: 'cold',
        cpuTotal: 20,
        allocationTotal: 200,
      }),
      overrides.chromiumSidecar,
    ),
  );

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
    schemaVersion: 2,
    generatedAt: '2026-08-07T00:00:00.000Z',
    runId: 'fixture-run',
    host,
    version: `${host}-1.0.0`,
    config: {
      profile: 'default',
      warmups: 1,
      samples: 1,
      targetSampleMs: 1,
      maxBatchSize: 1,
      workloads: [
        {
          name: 'arithmetic-loops',
          source: '(function () { return 12345; }())',
          expectedChecksum: CHECKSUM,
        },
      ],
    },
    results: ['cold', 'steady'].map((mode) => ({
      workload: 'arithmetic-loops',
      mode,
      boundary: `${mode} boundary`,
      checksum: CHECKSUM,
      slowdown: 1,
      lanes: {
        native: createLane(),
        jsjs: createLane(),
      },
    })),
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
 *   mode: 'cold' | 'steady',
 *   cpuTotal: number,
 *   allocationTotal: number,
 * }} options
 * @returns {Record<string, unknown>}
 */
function createSidecar(options) {
  const artifactStem = `${options.workload}-${options.mode}`;
  const runtimeVersion = `${options.host}-1.0.0`;

  return {
    schemaVersion: 1,
    generatedAt: '2026-08-07T00:01:00.000Z',
    host: options.host,
    runtime: {
      name: options.host,
      version: runtimeVersion,
    },
    gitCommit: 'fixture-commit',
    capture: {
      workload: options.workload,
      mode: options.mode,
      metrics: ['cpu', 'allocation'],
      warmups: 1,
      iterations: 1,
      samplingInterval: 100,
    },
    result: {
      expectedChecksum: CHECKSUM,
      checksum: CHECKSUM,
      iterations: 1,
      elapsedMilliseconds: 10,
    },
    summaries: {
      cpu: {
        total: options.cpuTotal,
        frames: [
          {
            url: 'src/evaluator/expressions.js',
            functionName: 'evaluateExpression',
            selfTime: options.cpuTotal,
            percentage: 100,
            category: 'evaluator',
          },
        ],
        categories: [
          {
            category: 'evaluator',
            selfTime: options.cpuTotal,
            percentage: 100,
          },
        ],
      },
      allocation: {
        total: options.allocationTotal,
        frames: [
          {
            url: 'src/evaluator/expressions.js',
            functionName: 'evaluateExpression',
            selfSize: options.allocationTotal,
            percentage: 100,
            category: 'evaluator',
          },
        ],
        categories: [
          {
            category: 'evaluator',
            selfSize: options.allocationTotal,
            percentage: 100,
          },
        ],
      },
    },
    artifacts: {
      cpu: `${artifactStem}.cpuprofile`,
      allocation: `${artifactStem}.heapprofile`,
    },
  };
}

/**
 * @param {URL} profileUrl
 * @param {'node' | 'chromium'} host
 * @param {Record<string, any>} sidecar
 * @returns {Promise<void>}
 */
async function writeSidecarArtifacts(profileUrl, host, sidecar) {
  const directoryUrl = new URL(`profiles/${host}/`, profileUrl);
  const stem = `${sidecar.capture.workload}-${sidecar.capture.mode}`;
  await writeJson(new URL(`${stem}.json`, directoryUrl), sidecar);
  await writeFile(
    new URL(sidecar.artifacts.cpu, directoryUrl),
    '{"samples":[1,2]}\n',
    'utf8',
  );
  await writeFile(
    new URL(sidecar.artifacts.allocation, directoryUrl),
    '{}\n',
    'utf8',
  );
}

/**
 * @param {Record<string, any>} sidecar
 * @param {Record<string, unknown> | undefined} overrides
 * @returns {Record<string, any>}
 */
function mergeSidecar(sidecar, overrides) {
  if (overrides === undefined) {
    return sidecar;
  }

  return {
    ...sidecar,
    ...overrides,
    capture: {
      ...sidecar.capture,
      ...(overrides.capture ?? {}),
    },
    result: {
      ...sidecar.result,
      ...(overrides.result ?? {}),
    },
  };
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
