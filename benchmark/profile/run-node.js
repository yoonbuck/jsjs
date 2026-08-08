import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { monotonicNowFrom, runtimeEngine } from '../host.js';
import { resolveOutputDirectory } from '../output.js';
import { assertCleanSourceState } from '../source-state.js';
import { resolveBenchmarkConfig } from '../config.js';
import { captureProtocolProfiles } from './protocol.js';
import {
  summarizeAllocationProfile,
  summarizeCpuProfile,
} from './summarize.js';
import { createProfileTarget } from './target.js';
// @ts-expect-error Node ships this runtime module; the repo's TS config lacks its types.
import inspector from 'node:inspector';

const PROFILE_SCHEMA_VERSION = 2;
const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const BENCHMARK_RESULTS_URL = new URL(
  '.benchmark-results/',
  REPOSITORY_ROOT_URL,
);
let profileTransactionCounter = 0;

/**
 * @typedef {{
 *   connect: () => void,
 *   disconnect: () => void,
 *   post: (
 *     method: string,
 *     params: Record<string, unknown>,
 *     callback: (error: Error | null, result?: Record<string, unknown>) => void,
 *   ) => void,
 * }} InspectorSession
 *
 * @typedef {{
 *   createRealm: () => { globalObject: object },
 *   evaluateScript: (realm: any, source: string) => { type: string, value: unknown },
 * }} ProfileEngine
 */

/**
 * @param {{
 *   host: 'node',
 *   workload: string,
 *   mode: 'cold' | 'steady',
 *   metric: 'cpu' | 'allocation',
 *   runId: string,
 *   warmups: number,
 *   iterations: number,
 *   cpuSamplingIntervalMicroseconds: number,
 *   allocationSamplingIntervalBytes: number,
 *   outputDirectory: string,
 *   source: { gitCommit: string, gitDirty: false },
 * }} options
 * @param {{
 *   now?: () => number,
 *   engine?: ProfileEngine,
 *   captureProfiles?: typeof captureProtocolProfiles,
 *   runtimeVersion?: string,
 *   generatedAt?: string,
 *   createInspectorSession?: () => InspectorSession,
 * }} [dependencies]
 * @returns {Promise<ReturnType<typeof buildProfileSidecar>>}
 */
export async function runNodeProfile(options, dependencies = {}) {
  const generatedAt = dependencies.generatedAt ?? new Date().toISOString();
  const source = assertCleanSourceState(options.source);
  const workload = resolveProfileWorkload(options.workload);
  const now =
    dependencies.now ?? monotonicNowFrom(performance.now.bind(performance));
  const target = createProfileTarget({
    workload,
    mode: options.mode,
    warmups: options.warmups,
    iterations: options.iterations,
    now,
    engine: /** @type {Parameters<typeof createProfileTarget>[0]['engine']} */ (
      dependencies.engine ?? runtimeEngine
    ),
  });
  const captureProfiles =
    dependencies.captureProfiles ?? captureProtocolProfiles;
  const session =
    dependencies.createInspectorSession?.() ?? createInspectorSession();
  const post = inspectorPost(session);

  try {
    target.runWarmups();

    const capture = await captureProfiles({
      post,
      metric: options.metric,
      cpuSamplingIntervalMicroseconds: options.cpuSamplingIntervalMicroseconds,
      allocationSamplingIntervalBytes: options.allocationSamplingIntervalBytes,
      async run() {
        const startedAt = now();
        const result = target.runMeasured();
        const finishedAt = now();

        return Object.freeze({
          expectedChecksum: target.expectedChecksum,
          elapsedMilliseconds: finishedAt - startedAt,
          result,
        });
      },
    });
    const sidecar = buildProfileSidecar({
      host: 'node',
      runtime: Object.freeze({
        name: 'node',
        version: dependencies.runtimeVersion ?? process.version,
      }),
      source,
      generatedAt,
      captureOptions: options,
      captureResult: capture.result,
      cpuProfile: capture.cpuProfile,
      allocationProfile: capture.allocationProfile,
    });

    await writeProfileArtifactsAtomically(
      profileOutputDirectory(options.outputDirectory, 'node'),
      profileArtifactContents(
        sidecar,
        capture.cpuProfile,
        capture.allocationProfile,
      ),
    );

    return sidecar;
  } finally {
    session.disconnect();
  }
}

/**
 * @param {{
 *   host: 'node' | 'chromium',
 *   runtime: { name: string, version: string, userAgent?: string },
 *   source: { gitCommit: string, gitDirty: false },
 *   generatedAt: string,
 *   captureOptions: {
 *     workload: string,
 *     mode: 'cold' | 'steady',
 *     metric: 'cpu' | 'allocation',
 *     runId: string,
 *     warmups: number,
 *     iterations: number,
 *     cpuSamplingIntervalMicroseconds: number,
 *     allocationSamplingIntervalBytes: number,
 *   },
 *   captureResult: {
 *     expectedChecksum: number,
 *     elapsedMilliseconds: number,
 *     result: { checksum: number, iterations: number },
 *   },
 *   cpuProfile?: unknown,
 *   allocationProfile?: unknown,
 * }} options
 * @returns {{
 *   schemaVersion: 2,
 *   generatedAt: string,
 *   host: 'node' | 'chromium',
 *   runtime: { name: string, version: string, userAgent?: string },
 *   source: { gitCommit: string, gitDirty: false },
 *   capture: {
 *     workload: string,
 *     mode: 'cold' | 'steady',
 *     metric: 'cpu' | 'allocation',
 *     runId: string,
 *     warmups: number,
 *     iterations: number,
 *     cpuSamplingIntervalMicroseconds: number,
 *     allocationSamplingIntervalBytes: number,
 *   },
 *   result: {
 *     expectedChecksum: number,
 *     checksum: number,
 *     iterations: number,
 *     elapsedMilliseconds: number,
 *   },
 *   summaries: {
 *     cpu?: ReturnType<typeof summarizeCpuProfile>,
 *     allocation?: ReturnType<typeof summarizeAllocationProfile>,
 *   },
 *   artifacts: {
 *     cpu?: string,
 *     allocation?: string,
 *   },
 * }}
 */
export function buildProfileSidecar({
  host,
  runtime,
  source,
  generatedAt,
  captureOptions,
  captureResult,
  cpuProfile,
  allocationProfile,
}) {
  const stem = safeProfileStem(
    captureOptions.workload,
    captureOptions.mode,
    captureOptions.metric,
  );

  return Object.freeze({
    schemaVersion: PROFILE_SCHEMA_VERSION,
    generatedAt,
    host,
    runtime,
    source,
    capture: Object.freeze({
      workload: captureOptions.workload,
      mode: captureOptions.mode,
      metric: captureOptions.metric,
      runId: captureOptions.runId,
      warmups: captureOptions.warmups,
      iterations: captureOptions.iterations,
      cpuSamplingIntervalMicroseconds:
        captureOptions.cpuSamplingIntervalMicroseconds,
      allocationSamplingIntervalBytes:
        captureOptions.allocationSamplingIntervalBytes,
    }),
    result: Object.freeze({
      expectedChecksum: captureResult.expectedChecksum,
      checksum: captureResult.result.checksum,
      iterations: captureResult.result.iterations,
      elapsedMilliseconds: captureResult.elapsedMilliseconds,
    }),
    summaries: Object.freeze({
      ...(captureOptions.metric !== 'cpu' || cpuProfile === undefined
        ? {}
        : {
            cpu: summarizeCpuProfile(
              /** @type {Parameters<typeof summarizeCpuProfile>[0]} */ (
                cpuProfile
              ),
            ),
          }),
      ...(captureOptions.metric !== 'allocation' ||
      allocationProfile === undefined
        ? {}
        : {
            allocation: summarizeAllocationProfile(
              /** @type {Parameters<typeof summarizeAllocationProfile>[0]} */ (
                allocationProfile
              ),
            ),
          }),
    }),
    artifacts: Object.freeze({
      ...(captureOptions.metric !== 'cpu' || cpuProfile === undefined
        ? {}
        : { cpu: `${stem}.cpuprofile` }),
      ...(captureOptions.metric !== 'allocation' ||
      allocationProfile === undefined
        ? {}
        : { allocation: `${stem}.heapprofile` }),
    }),
  });
}

/**
 * @param {string} workloadName
 * @returns {{ name: string, source: string, expectedChecksum: number }}
 */
export function resolveProfileWorkload(workloadName) {
  const config = resolveBenchmarkConfig({
    profile: 'default',
    workloads: [workloadName],
  });

  return config.workloads[0];
}

/**
 * @param {string} outputDirectory
 * @param {'node' | 'chromium'} host
 * @returns {string}
 */
export function profileOutputDirectory(outputDirectory, host) {
  const hostDirectory = `${stripTrailingSlash(outputDirectory)}/profiles/${host}`;
  const directoryUrl = resolveOutputDirectory(hostDirectory);

  if (!directoryUrl.href.startsWith(BENCHMARK_RESULTS_URL.href)) {
    throw new RangeError(
      `Profile output directory must stay under .benchmark-results/: ${outputDirectory}`,
    );
  }

  return hostDirectory;
}

/**
 * @param {{
 *   artifacts: { cpu?: string, allocation?: string },
 *   capture: {
 *     workload: string,
 *     mode: 'cold' | 'steady',
 *     metric: 'cpu' | 'allocation',
 *   },
 * }} sidecar
 * @param {unknown} cpuProfile
 * @param {unknown} allocationProfile
 * @returns {readonly { fileName: string, contents: string }[]}
 */
export function profileArtifactContents(
  sidecar,
  cpuProfile,
  allocationProfile,
) {
  /** @type {{ fileName: string, contents: string }[]} */
  const files = [];
  const stem = safeProfileStem(
    sidecar.capture.workload,
    sidecar.capture.mode,
    sidecar.capture.metric,
  );

  if (sidecar.artifacts.cpu !== undefined && cpuProfile !== undefined) {
    files.push({
      fileName: sidecar.artifacts.cpu,
      contents: `${JSON.stringify(cpuProfile, null, 2)}\n`,
    });
  }

  if (
    sidecar.artifacts.allocation !== undefined &&
    allocationProfile !== undefined
  ) {
    files.push({
      fileName: sidecar.artifacts.allocation,
      contents: `${JSON.stringify(allocationProfile, null, 2)}\n`,
    });
  }

  files.push({
    fileName: `${stem}.json`,
    contents: `${JSON.stringify(sidecar, null, 2)}\n`,
  });

  return Object.freeze(files);
}

/**
 * @param {string} outputDirectory
 * @param {readonly { fileName: string, contents: string }[]} files
 * @param {{
 *   mkdir?: typeof mkdir,
 *   rename?: typeof rename,
 *   rm?: typeof rm,
 *   stat?: typeof stat,
 *   writeFile?: typeof writeFile,
 * }} [operations]
 * @returns {Promise<void>}
 */
export async function writeProfileArtifactsAtomically(
  outputDirectory,
  files,
  operations = {},
) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new RangeError('Expected at least one profile artifact to write');
  }

  const fileOperations = {
    mkdir: operations.mkdir ?? mkdir,
    rename: operations.rename ?? rename,
    rm: operations.rm ?? rm,
    stat: operations.stat ?? stat,
    writeFile: operations.writeFile ?? writeFile,
  };
  const validatedFiles = files.map((file) => {
    if (typeof file.contents !== 'string') {
      throw new TypeError(`Profile artifact ${file.fileName} must be a string`);
    }

    return {
      fileName: safeProfileFileName(file.fileName),
      contents: file.contents,
    };
  });
  const stem = uniqueProfileStem(validatedFiles);
  const reconciledFileNames = stemArtifactFileNames(stem);
  const outputUrl = resolveOutputDirectory(outputDirectory);
  const transactionId = `${process.pid}-${nextProfileTransactionId()}`;
  const stagingUrl = resolveOutputDirectory(
    `${outputDirectory}/.staging-${transactionId}`,
  );
  const backupUrl = resolveOutputDirectory(
    `${outputDirectory}/.backup-${transactionId}`,
  );
  /** @type {string[]} */
  const backedUpFiles = [];
  /** @type {string[]} */
  const promotedFiles = [];

  await fileOperations.mkdir(outputUrl, { recursive: true });

  try {
    await fileOperations.mkdir(stagingUrl, { recursive: true });

    for (const file of validatedFiles) {
      await fileOperations.writeFile(
        new URL(file.fileName, stagingUrl),
        file.contents,
        'utf8',
      );
    }

    await fileOperations.mkdir(backupUrl, { recursive: true });

    for (const fileName of reconciledFileNames) {
      const finalUrl = new URL(fileName, outputUrl);
      const backupFileUrl = new URL(fileName, backupUrl);

      if (await exists(finalUrl, fileOperations.stat)) {
        await fileOperations.rename(finalUrl, backupFileUrl);
        backedUpFiles.push(fileName);
      }
    }

    for (const file of validatedFiles) {
      await fileOperations.rename(
        new URL(file.fileName, stagingUrl),
        new URL(file.fileName, outputUrl),
      );
      promotedFiles.push(file.fileName);
    }
  } catch (error) {
    for (const fileName of promotedFiles) {
      await fileOperations.rm(new URL(fileName, outputUrl), { force: true });
    }

    for (const fileName of backedUpFiles) {
      await fileOperations.rename(
        new URL(fileName, backupUrl),
        new URL(fileName, outputUrl),
      );
    }

    throw error;
  } finally {
    await fileOperations.rm(stagingUrl, { recursive: true, force: true });
    await fileOperations.rm(backupUrl, { recursive: true, force: true });
  }
}

/**
 * @returns {InspectorSession}
 */
function createInspectorSession() {
  const session = new inspector.Session();
  session.connect();
  return session;
}

/**
 * @param {InspectorSession} session
 * @returns {(method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>}
 */
function inspectorPost(session) {
  return (method, params) =>
    new Promise((resolve, reject) => {
      session.post(
        method,
        params ?? {},
        /** @param {Error | null} error @param {Record<string, unknown>} [result] */
        (error, result = {}) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(result);
        },
      );
    });
}

/**
 * @param {URL} fileUrl
 * @param {typeof stat} statOperation
 * @returns {Promise<boolean>}
 */
async function exists(fileUrl, statOperation) {
  try {
    await statOperation(fileUrl);
    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      if (error.code === 'ENOENT') {
        return false;
      }
    }
  }

  throw new Error(`Could not stat profile artifact: ${fileUrl.href}`);
}

/**
 * @param {readonly { fileName: string }[]} files
 * @returns {string}
 */
function uniqueProfileStem(files) {
  const stems = new Set(
    files.map((file) => profileStemFromFileName(file.fileName)),
  );

  if (stems.size !== 1) {
    throw new RangeError(
      'Expected profile artifacts to share a single workload stem',
    );
  }

  return /** @type {string} */ (stems.values().next().value);
}

/**
 * @param {string} fileName
 * @returns {string}
 */
function profileStemFromFileName(fileName) {
  return fileName.replace(/\.(cpuprofile|heapprofile|json)$/u, '');
}

/**
 * @param {string} stem
 * @returns {readonly string[]}
 */
function stemArtifactFileNames(stem) {
  return Object.freeze([
    `${stem}.cpuprofile`,
    `${stem}.heapprofile`,
    `${stem}.json`,
  ]);
}

/**
 * @param {string} workload
 * @param {'cold' | 'steady'} mode
 * @param {'cpu' | 'allocation'} metric
 * @returns {string}
 */
function safeProfileStem(workload, mode, metric) {
  if (!/^[a-z0-9-]+$/u.test(workload)) {
    throw new RangeError(`Unsafe profile workload name: ${workload}`);
  }

  if (mode !== 'cold' && mode !== 'steady') {
    throw new RangeError(`Unsafe profile mode: ${mode}`);
  }

  if (metric !== 'cpu' && metric !== 'allocation') {
    throw new RangeError(`Unsafe profile metric: ${metric}`);
  }

  return `${workload}-${mode}-${metric}`;
}

/**
 * @param {string} fileName
 * @returns {string}
 */
function safeProfileFileName(fileName) {
  if (
    typeof fileName !== 'string' ||
    !/^[a-z0-9-]+\.(cpuprofile|heapprofile|json)$/u.test(fileName)
  ) {
    throw new RangeError(`Unsafe profile artifact file name: ${fileName}`);
  }

  return fileName;
}

/**
 * @returns {number}
 */
function nextProfileTransactionId() {
  profileTransactionCounter += 1;
  return profileTransactionCounter;
}

/**
 * @param {string} value
 * @returns {string}
 */
function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
