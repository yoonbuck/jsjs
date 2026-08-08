import { execFileSync } from 'node:child_process';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { monotonicNowFrom, runtimeEngine } from '../host.js';
import { resolveOutputDirectory } from '../output.js';
import { resolveBenchmarkConfig } from '../config.js';
import { captureProtocolProfiles } from './protocol.js';
import { summarizeAllocationProfile, summarizeCpuProfile } from './summarize.js';
import { createProfileTarget } from './target.js';
// @ts-expect-error Node ships this runtime module; the repo's TS config lacks its types.
import inspector from 'node:inspector';

const PROFILE_SCHEMA_VERSION = 1;
const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const BENCHMARK_RESULTS_URL = new URL('.benchmark-results/', REPOSITORY_ROOT_URL);
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
 *   metrics: readonly string[],
 *   warmups: number,
 *   iterations: number,
 *   samplingInterval: number,
 *   outputDirectory: string,
 * }} options
 * @param {{
 *   now?: () => number,
 *   engine?: ProfileEngine,
 *   captureProfiles?: typeof captureProtocolProfiles,
 *   gitCommit?: () => Promise<string>,
 *   runtimeVersion?: string,
 *   generatedAt?: string,
 *   createInspectorSession?: () => InspectorSession,
 * }} [dependencies]
 * @returns {Promise<ReturnType<typeof buildProfileSidecar>>}
 */
export async function runNodeProfile(options, dependencies = {}) {
  const generatedAt = dependencies.generatedAt ?? new Date().toISOString();
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
  const captureProfiles = dependencies.captureProfiles ?? captureProtocolProfiles;
  const session =
    dependencies.createInspectorSession?.() ?? createInspectorSession();
  const post = inspectorPost(session);

  try {
    target.runWarmups();

    const capture = await captureProfiles({
      post,
      metrics: options.metrics,
      samplingInterval: options.samplingInterval,
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
      gitCommit: await (dependencies.gitCommit ?? readGitCommit)(),
      generatedAt,
      captureOptions: options,
      captureResult: capture.result,
      cpuProfile: capture.cpuProfile,
      allocationProfile: capture.allocationProfile,
    });

    await writeProfileArtifactsAtomically(
      profileOutputDirectory(options.outputDirectory, 'node'),
      profileArtifactContents(sidecar, capture.cpuProfile, capture.allocationProfile),
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
 *   gitCommit: string,
 *   generatedAt: string,
 *   captureOptions: {
 *     workload: string,
 *     mode: 'cold' | 'steady',
 *     metrics: readonly string[],
 *     warmups: number,
 *     iterations: number,
 *     samplingInterval: number,
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
 *   schemaVersion: 1,
 *   generatedAt: string,
 *   host: 'node' | 'chromium',
 *   runtime: { name: string, version: string, userAgent?: string },
 *   gitCommit: string,
 *   capture: {
 *     workload: string,
 *     mode: 'cold' | 'steady',
 *     metrics: readonly string[],
 *     warmups: number,
 *     iterations: number,
 *     samplingInterval: number,
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
  gitCommit,
  generatedAt,
  captureOptions,
  captureResult,
  cpuProfile,
  allocationProfile,
}) {
  const stem = safeProfileStem(captureOptions.workload, captureOptions.mode);

  return Object.freeze({
    schemaVersion: PROFILE_SCHEMA_VERSION,
    generatedAt,
    host,
    runtime,
    gitCommit,
    capture: Object.freeze({
      workload: captureOptions.workload,
      mode: captureOptions.mode,
      metrics: Object.freeze([...captureOptions.metrics]),
      warmups: captureOptions.warmups,
      iterations: captureOptions.iterations,
      samplingInterval: captureOptions.samplingInterval,
    }),
    result: Object.freeze({
      expectedChecksum: captureResult.expectedChecksum,
      checksum: captureResult.result.checksum,
      iterations: captureResult.result.iterations,
      elapsedMilliseconds: captureResult.elapsedMilliseconds,
    }),
    summaries: Object.freeze({
      ...(cpuProfile === undefined
        ? {}
        : {
            cpu: summarizeCpuProfile(
              /** @type {Parameters<typeof summarizeCpuProfile>[0]} */ (cpuProfile),
            ),
          }),
      ...(allocationProfile === undefined
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
      ...(cpuProfile === undefined ? {} : { cpu: `${stem}.cpuprofile` }),
      ...(allocationProfile === undefined
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
 *   capture: { workload: string, mode: 'cold' | 'steady' },
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
  const stem = safeProfileStem(sidecar.capture.workload, sidecar.capture.mode);

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
 * @returns {Promise<void>}
 */
export async function writeProfileArtifactsAtomically(outputDirectory, files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new RangeError('Expected at least one profile artifact to write');
  }

  const validatedFiles = files.map((file) => {
    if (typeof file.contents !== 'string') {
      throw new TypeError(`Profile artifact ${file.fileName} must be a string`);
    }

    return {
      fileName: safeProfileFileName(file.fileName),
      contents: file.contents,
    };
  });
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

  await mkdir(outputUrl, { recursive: true });

  try {
    await mkdir(stagingUrl, { recursive: true });

    for (const file of validatedFiles) {
      await writeFile(new URL(file.fileName, stagingUrl), file.contents, 'utf8');
    }

    await mkdir(backupUrl, { recursive: true });

    for (const file of validatedFiles) {
      const finalUrl = new URL(file.fileName, outputUrl);
      const backupFileUrl = new URL(file.fileName, backupUrl);

      if (await exists(finalUrl)) {
        await rename(finalUrl, backupFileUrl);
        backedUpFiles.push(file.fileName);
      }
    }

    for (const file of validatedFiles) {
      await rename(
        new URL(file.fileName, stagingUrl),
        new URL(file.fileName, outputUrl),
      );
      promotedFiles.push(file.fileName);
    }
  } catch (error) {
    for (const fileName of promotedFiles) {
      await rm(new URL(fileName, outputUrl), { force: true });
    }

    for (const fileName of backedUpFiles) {
      await rename(new URL(fileName, backupUrl), new URL(fileName, outputUrl));
    }

    throw error;
  } finally {
    await rm(stagingUrl, { recursive: true, force: true });
    await rm(backupUrl, { recursive: true, force: true });
  }
}

/**
 * @returns {Promise<string>}
 */
export async function readGitCommit() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: fileURLToPath(REPOSITORY_ROOT_URL),
    encoding: 'utf8',
  }).trim();
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
 * @returns {Promise<boolean>}
 */
async function exists(fileUrl) {
  try {
    await stat(fileUrl);
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
 * @param {string} workload
 * @param {'cold' | 'steady'} mode
 * @returns {string}
 */
function safeProfileStem(workload, mode) {
  if (!/^[a-z0-9-]+$/u.test(workload)) {
    throw new RangeError(`Unsafe profile workload name: ${workload}`);
  }

  if (mode !== 'cold' && mode !== 'steady') {
    throw new RangeError(`Unsafe profile mode: ${mode}`);
  }

  return `${workload}-${mode}`;
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
