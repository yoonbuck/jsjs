import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveOutputDirectory } from '../output.js';
import { validateHostReport } from '../report.js';

/** @type {readonly ('chromium' | 'node')[]} */
const PROFILE_HOSTS = Object.freeze(['chromium', 'node']);
const PROFILE_MODES = Object.freeze(['cold', 'steady']);
const ANALYSIS_FILES = Object.freeze([
  'checksum-correlation.json',
  'profile-analysis.json',
]);
let analysisTransactionCounter = 0;

if (isMain(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => {
    process.exitCode = 1;
    process.stderr.write(`${formatError(error)}\n`);
  });
}

/**
 * @param {readonly string[]} args
 * @returns {{ baselineDirectory: string, profileDirectory: string }}
 */
export function parseProfileAnalysisArguments(args) {
  /** @type {string | undefined} */
  let baselineDirectory;
  /** @type {string | undefined} */
  let profileDirectory;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith('--')) {
      throw new Error(`Unknown positional argument: ${arg}`);
    }

    const equalsIndex = arg.indexOf('=');
    const name = equalsIndex === -1 ? arg.slice(2) : arg.slice(2, equalsIndex);
    const value =
      equalsIndex === -1
        ? readOptionValue(args, index, name)
        : arg.slice(equalsIndex + 1);

    if (equalsIndex === -1) {
      index += 1;
    }

    if (name === 'baseline') {
      if (baselineDirectory !== undefined) {
        throw new Error('--baseline may be specified only once');
      }
      baselineDirectory = value;
      continue;
    }

    if (name === 'profiles') {
      if (profileDirectory !== undefined) {
        throw new Error('--profiles may be specified only once');
      }
      profileDirectory = value;
      continue;
    }

    throw new Error(`Unknown option: --${name}`);
  }

  if (baselineDirectory === undefined) {
    throw new Error('--baseline is required');
  }

  if (profileDirectory === undefined) {
    throw new Error('--profiles is required');
  }

  validateRepositoryRelativeDirectory(
    baselineDirectory,
    'Baseline report root',
  );
  validateRepositoryRelativeDirectory(
    profileDirectory,
    'Profile artifact root',
  );

  return Object.freeze({ baselineDirectory, profileDirectory });
}

/**
 * @param {readonly string[]} argv
 * @returns {Promise<ReturnType<typeof analyzeProfileArtifacts>>}
 */
export async function main(argv) {
  return analyzeProfileArtifacts(parseProfileAnalysisArguments(argv));
}

/**
 * @param {{
 *   baselineDirectory: string,
 *   profileDirectory: string,
 * }} options
 * @param {{
 *   mkdir?: typeof mkdir,
 *   readdir?: typeof readdir,
 *   readFile?: typeof readFile,
 *   rename?: typeof rename,
 *   rm?: typeof rm,
 *   stat?: typeof stat,
 *   writeFile?: typeof writeFile,
 * }} [operations]
 * @returns {Promise<{ correlation: ChecksumCorrelation, analysis: ProfileAnalysis }>}
 */
export async function analyzeProfileArtifacts(options, operations = {}) {
  const baselineDirectory = validateRepositoryRelativeDirectory(
    options?.baselineDirectory,
    'Baseline report root',
  );
  const profileDirectory = validateRepositoryRelativeDirectory(
    options?.profileDirectory,
    'Profile artifact root',
  );
  const fileOperations = fileOperationsFrom(operations);
  const sidecars = await discoverProfileSidecars(
    profileDirectory,
    fileOperations,
  );
  const reports = await readBaselineReports(
    baselineDirectory,
    sidecars,
    fileOperations,
  );
  validateCompatibleBaselineReports(reports);
  validateCompatibleSidecars(sidecars, reports);
  const correlation = createChecksumCorrelation(sidecars, reports);
  const analysis = createProfileAnalysis(sidecars);

  await writeProfileAnalysisOutputsAtomically(
    profileDirectory,
    correlation,
    analysis,
    fileOperations,
  );

  return Object.freeze({ correlation, analysis });
}

/**
 * @param {string} outputDirectory
 * @param {Record<string, unknown>} correlation
 * @param {Record<string, unknown>} analysis
 * @param {{
 *   mkdir?: typeof mkdir,
 *   rename?: typeof rename,
 *   rm?: typeof rm,
 *   stat?: typeof stat,
 *   writeFile?: typeof writeFile,
 * }} [operations]
 * @returns {Promise<void>}
 */
export async function writeProfileAnalysisOutputsAtomically(
  outputDirectory,
  correlation,
  analysis,
  operations = {},
) {
  const safeOutputDirectory = validateRepositoryRelativeDirectory(
    outputDirectory,
    'Profile artifact root',
  );
  const fileOperations = fileOperationsFrom(operations);
  const outputUrl = resolveOutputDirectory(safeOutputDirectory);
  const transactionId = `${process.pid}-${nextAnalysisTransactionId()}`;
  const stagingUrl = resolveOutputDirectory(
    `${safeOutputDirectory}/.staging-${transactionId}`,
  );
  const backupUrl = resolveOutputDirectory(
    `${safeOutputDirectory}/.backup-${transactionId}`,
  );
  const contents = new Map([
    ['checksum-correlation.json', `${JSON.stringify(correlation, null, 2)}\n`],
    ['profile-analysis.json', `${JSON.stringify(analysis, null, 2)}\n`],
  ]);
  /** @type {string[]} */
  const backedUpFiles = [];
  /** @type {string[]} */
  const promotedFiles = [];

  await fileOperations.mkdir(outputUrl, { recursive: true });

  try {
    await fileOperations.mkdir(stagingUrl, { recursive: true });

    for (const fileName of ANALYSIS_FILES) {
      await fileOperations.writeFile(
        new URL(fileName, stagingUrl),
        /** @type {string} */ (contents.get(fileName)),
        'utf8',
      );
    }

    await fileOperations.mkdir(backupUrl, { recursive: true });

    for (const fileName of ANALYSIS_FILES) {
      const finalUrl = new URL(fileName, outputUrl);

      if (await fileExists(finalUrl, fileOperations.stat)) {
        await fileOperations.rename(finalUrl, new URL(fileName, backupUrl));
        backedUpFiles.push(fileName);
      }
    }

    for (const fileName of ANALYSIS_FILES) {
      await fileOperations.rename(
        new URL(fileName, stagingUrl),
        new URL(fileName, outputUrl),
      );
      promotedFiles.push(fileName);
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
 * @param {string} profileDirectory
 * @param {ReturnType<typeof fileOperationsFrom>} operations
 * @returns {Promise<readonly ProfileSidecar[]>}
 */
async function discoverProfileSidecars(profileDirectory, operations) {
  /** @type {ProfileSidecar[]} */
  const sidecars = [];

  for (const host of PROFILE_HOSTS) {
    const hostDirectory = `${profileDirectory}/profiles/${host}`;
    const hostUrl = resolveOutputDirectory(hostDirectory);
    let fileNames;

    try {
      fileNames = await operations.readdir(hostUrl);
    } catch (error) {
      throw new Error(
        `Missing profile sidecar directory for ${host}: ${formatCause(error)}`,
      );
    }

    const sidecarFiles = fileNames
      .filter((fileName) => fileName.endsWith('.json'))
      .sort(compareCodeUnits);

    if (sidecarFiles.length === 0) {
      throw new Error(`Missing profile sidecars for ${host}`);
    }

    for (const fileName of sidecarFiles) {
      const filePath = `profiles/${host}/${fileName}`;
      const sidecar = validateProfileSidecar(
        await readJsonFile(
          new URL(fileName, hostUrl),
          `profile sidecar ${filePath}`,
          operations.readFile,
        ),
        host,
        filePath,
      );

      const cpuSampleCount = await requireDeclaredArtifact(
        hostUrl,
        sidecar.artifacts.cpu,
        'cpu',
        filePath,
        operations.readFile,
      );

      await requireDeclaredArtifact(
        hostUrl,
        sidecar.artifacts.allocation,
        'allocation',
        filePath,
        operations.readFile,
      );

      sidecars.push(Object.freeze({ ...sidecar, cpuSampleCount }));
    }
  }

  sidecars.sort(compareSidecars);
  const seen = new Set();

  for (const sidecar of sidecars) {
    const key = sidecarKey(sidecar);

    if (seen.has(key)) {
      throw new Error(`duplicate sidecar for ${key}`);
    }

    seen.add(key);
  }

  return Object.freeze(sidecars);
}

/**
 * @param {string} baselineDirectory
 * @param {readonly ProfileSidecar[]} sidecars
 * @param {ReturnType<typeof fileOperationsFrom>} operations
 * @returns {Promise<ReadonlyMap<string, Record<string, any>>>}
 */
async function readBaselineReports(baselineDirectory, sidecars, operations) {
  /** @type {Set<'node' | 'chromium'>} */
  const requiredHosts = new Set(sidecars.map((sidecar) => sidecar.host));
  /** @type {Map<string, Record<string, any>>} */
  const reports = new Map();

  for (const host of [...requiredHosts].sort(compareCodeUnits)) {
    const fileName = `${host}.json`;
    const reportUrl = new URL(
      fileName,
      resolveOutputDirectory(baselineDirectory),
    );
    /** @type {Record<string, any>} */
    let report;

    try {
      report = /** @type {Record<string, any>} */ (
        await readJsonFile(
          reportUrl,
          `baseline report ${fileName}`,
          operations.readFile,
        )
      );
    } catch (error) {
      throw new Error(
        `Missing baseline report for ${host}: ${formatCause(error)}`,
      );
    }

    try {
      validateHostReport(report);
    } catch (error) {
      throw new TypeError(
        `Malformed baseline report ${fileName}: ${formatCause(error)}`,
      );
    }

    if (report.host !== host) {
      throw new TypeError(
        `Baseline report ${fileName} declares host ${String(report.host)}, expected ${host}`,
      );
    }

    reports.set(host, report);
  }

  return reports;
}

/**
 * @param {ReadonlyMap<string, Record<string, any>>} reports
 * @returns {void}
 */
function validateCompatibleBaselineReports(reports) {
  const sortedReports = [...reports.entries()].sort(([left], [right]) =>
    compareCodeUnits(left, right),
  );
  const [referenceHost, reference] = sortedReports[0] ?? [];

  if (referenceHost === undefined || reference === undefined) {
    throw new Error('No baseline reports matched discovered profile sidecars');
  }

  for (const [host, report] of sortedReports.slice(1)) {
    compareMetadata(reference, report, 'schemaVersion', referenceHost, host);
    compareMetadata(reference, report, 'runId', referenceHost, host);
    compareMetadata(reference, report, 'generatedAt', referenceHost, host);
    compareMetadata(
      reference.config,
      report.config,
      'profile',
      referenceHost,
      host,
    );
    compareMetadata(
      reference.config,
      report.config,
      'warmups',
      referenceHost,
      host,
    );
    compareMetadata(
      reference.config,
      report.config,
      'samples',
      referenceHost,
      host,
    );
    compareMetadata(
      reference.config,
      report.config,
      'targetSampleMs',
      referenceHost,
      host,
    );
    compareMetadata(
      reference.config,
      report.config,
      'maxBatchSize',
      referenceHost,
      host,
    );

    const referenceWorkloads = reference.config.workloads;
    const workloads = report.config.workloads;

    if (referenceWorkloads.length !== workloads.length) {
      throw new TypeError(
        `Incompatible baseline config.workloads length for ${referenceHost} and ${host}`,
      );
    }

    for (let index = 0; index < referenceWorkloads.length; index += 1) {
      for (const property of ['name', 'source', 'expectedChecksum']) {
        compareMetadata(
          referenceWorkloads[index],
          workloads[index],
          property,
          referenceHost,
          host,
        );
      }
    }
  }
}

/**
 * @param {readonly ProfileSidecar[]} sidecars
 * @param {ReadonlyMap<string, Record<string, any>>} reports
 * @returns {void}
 */
function validateCompatibleSidecars(sidecars, reports) {
  const reference = sidecars[0];

  for (const sidecar of sidecars) {
    const report = reports.get(sidecar.host);

    if (report === undefined) {
      throw new Error(`missing baseline report for ${sidecar.host}`);
    }

    if (sidecar.runtime.version !== report.version) {
      throw new TypeError(
        `Runtime version mismatch for ${sidecarKey(sidecar)}: ${sidecar.runtime.version} !== ${report.version}`,
      );
    }

    if (sidecar.gitCommit !== reference.gitCommit) {
      throw new TypeError(
        `Incompatible sidecar gitCommit for ${sidecarKey(sidecar)}: ${sidecar.gitCommit} !== ${reference.gitCommit}`,
      );
    }

    if (
      sidecar.capture.warmups !== reference.capture.warmups ||
      sidecar.capture.iterations !== reference.capture.iterations ||
      sidecar.capture.samplingInterval !== reference.capture.samplingInterval ||
      sidecar.capture.metrics.join(',') !== reference.capture.metrics.join(',')
    ) {
      throw new TypeError(
        `Incompatible capture metadata for ${sidecarKey(sidecar)}`,
      );
    }
  }
}

/**
 * @param {readonly ProfileSidecar[]} sidecars
 * @param {ReadonlyMap<string, Record<string, any>>} reports
 * @returns {ChecksumCorrelation}
 */
function createChecksumCorrelation(sidecars, reports) {
  const referenceReport = reports.values().next().value;

  if (referenceReport === undefined) {
    throw new Error('No baseline reports matched discovered profile sidecars');
  }
  /** @type {Record<string, { version: string, runId: string, generatedAt: string }>} */
  const hosts = {};

  for (const [host, report] of [...reports.entries()].sort(([left], [right]) =>
    compareCodeUnits(left, right),
  )) {
    hosts[host] = {
      version: report.version,
      runId: report.runId,
      generatedAt: report.generatedAt,
    };
  }

  const profiles = sidecars.map((sidecar) => {
    const report = /** @type {Record<string, any>} */ (
      reports.get(sidecar.host)
    );
    const workload = report.config.workloads.find(
      /** @param {any} candidate */
      (candidate) => candidate.name === sidecar.capture.workload,
    );

    if (workload === undefined) {
      throw new Error(
        `missing baseline workload for ${sidecarKey(sidecar)} in ${sidecar.host}.json`,
      );
    }

    const benchmarkResult = report.results.find(
      /** @param {any} candidate */
      (candidate) =>
        candidate.workload === sidecar.capture.workload &&
        candidate.mode === sidecar.capture.mode,
    );

    if (benchmarkResult === undefined) {
      throw new Error(
        `missing baseline row for ${sidecarKey(sidecar)} in ${sidecar.host}.json`,
      );
    }

    const checksums = [
      workload.expectedChecksum,
      benchmarkResult.checksum,
      sidecar.result.expectedChecksum,
      sidecar.result.checksum,
    ];

    if (!checksums.every((checksum) => checksum === checksums[0])) {
      throw new Error(
        `checksum mismatch for ${sidecarKey(sidecar)}: baseline expected=${workload.expectedChecksum}, baseline observed=${benchmarkResult.checksum}, sidecar expected=${sidecar.result.expectedChecksum}, sidecar observed=${sidecar.result.checksum}`,
      );
    }

    return Object.freeze({
      host: sidecar.host,
      workload: sidecar.capture.workload,
      mode: sidecar.capture.mode,
      sidecarExpectedChecksum: sidecar.result.expectedChecksum,
      sidecarChecksum: sidecar.result.checksum,
      benchmarkExpectedChecksum: workload.expectedChecksum,
      benchmarkChecksum: benchmarkResult.checksum,
      nativeMedianMs: benchmarkResult.lanes.native.summary.median,
      jsjsMedianMs: benchmarkResult.lanes.jsjs.summary.median,
      profileElapsedMilliseconds: sidecar.result.elapsedMilliseconds,
      profileIterations: sidecar.result.iterations,
      profileElapsedPerIterationMilliseconds:
        sidecar.result.elapsedMilliseconds / sidecar.result.iterations,
      cpuSampleTotalMicroseconds: sidecar.summaries.cpu.total,
      cpuSampleCount: sidecar.cpuSampleCount,
      allocationSampledBytes: sidecar.summaries.allocation.total,
      allocationFrameCount: sidecar.summaries.allocation.frames.length,
      valid: true,
    });
  });

  return Object.freeze({
    baseline: Object.freeze({
      runId: referenceReport.runId,
      generatedAt: referenceReport.generatedAt,
      hosts: Object.freeze(hosts),
    }),
    profiles: Object.freeze(profiles),
    allChecksumsMatch: true,
  });
}

/**
 * @param {readonly ProfileSidecar[]} sidecars
 * @returns {ProfileAnalysis}
 */
function createProfileAnalysis(sidecars) {
  /** @type {Map<string, ProfileSidecar[]>} */
  const groups = new Map([['all', [...sidecars]]]);

  for (const sidecar of sidecars) {
    const groupName = `${sidecar.host}-${sidecar.capture.mode}`;
    const group = groups.get(groupName) ?? [];
    group.push(sidecar);
    groups.set(groupName, group);
  }

  /** @type {Record<string, ProfileAggregate>} */
  const groupOutput = {};

  for (const groupName of [
    'all',
    ...PROFILE_HOSTS.flatMap((host) =>
      PROFILE_MODES.map((mode) => `${host}-${mode}`),
    ),
  ]) {
    const group = groups.get(groupName);

    if (group !== undefined && group.length > 0) {
      groupOutput[groupName] = summarizeSidecars(group);
    }
  }

  /** @type {Map<string, ProfileSidecar[]>} */
  const steadyByWorkload = new Map();

  for (const sidecar of sidecars) {
    if (sidecar.capture.mode !== 'steady') {
      continue;
    }

    const workload = sidecar.capture.workload;
    const group = steadyByWorkload.get(workload) ?? [];
    group.push(sidecar);
    steadyByWorkload.set(workload, group);
  }

  /** @type {Record<string, ProfileAggregate>} */
  const steadyOutput = {};

  for (const workload of [...steadyByWorkload.keys()].sort(compareCodeUnits)) {
    steadyOutput[workload] = summarizeSidecars(
      /** @type {ProfileSidecar[]} */ (steadyByWorkload.get(workload)),
    );
  }

  return Object.freeze({
    groups: Object.freeze(groupOutput),
    steadyByWorkload: Object.freeze(steadyOutput),
  });
}

/**
 * @param {readonly ProfileSidecar[]} sidecars
 * @returns {ProfileAggregate}
 */
function summarizeSidecars(sidecars) {
  /** @type {Map<string, number>} */
  const cpuCategories = new Map();
  /** @type {Map<string, number>} */
  const cpuFrames = new Map();
  /** @type {Map<string, number>} */
  const allocationCategories = new Map();
  /** @type {Map<string, number>} */
  const allocationFrames = new Map();
  let cpuTotal = 0;
  let allocationTotal = 0;

  for (const sidecar of sidecars) {
    cpuTotal += sidecar.summaries.cpu.total;
    allocationTotal += sidecar.summaries.allocation.total;
    addCategorySummaries(
      cpuCategories,
      sidecar.summaries.cpu.categories,
      'selfTime',
    );
    addFrameSummaries(cpuFrames, sidecar.summaries.cpu.frames, 'selfTime');
    addCategorySummaries(
      allocationCategories,
      sidecar.summaries.allocation.categories,
      'selfSize',
    );
    addFrameSummaries(
      allocationFrames,
      sidecar.summaries.allocation.frames,
      'selfSize',
    );
  }

  return Object.freeze({
    profileCount: sidecars.length,
    cpu: Object.freeze({
      totalMicroseconds: cpuTotal,
      categories: Object.freeze(
        summaryEntries(cpuCategories, cpuTotal, 'microseconds'),
      ),
      frames: Object.freeze(
        summaryEntries(cpuFrames, cpuTotal, 'microseconds'),
      ),
    }),
    allocation: Object.freeze({
      totalBytes: allocationTotal,
      categories: Object.freeze(
        summaryEntries(allocationCategories, allocationTotal, 'bytes'),
      ),
      frames: Object.freeze(
        summaryEntries(allocationFrames, allocationTotal, 'bytes'),
      ),
    }),
  });
}

/**
 * @param {Map<string, number>} destination
 * @param {readonly Record<string, any>[]} summaries
 * @param {'selfTime' | 'selfSize'} totalField
 * @returns {void}
 */
function addCategorySummaries(destination, summaries, totalField) {
  for (const summary of summaries) {
    addSummary(destination, summary.category, summary[totalField]);
  }
}

/**
 * @param {Map<string, number>} destination
 * @param {readonly Record<string, any>[]} summaries
 * @param {'selfTime' | 'selfSize'} totalField
 * @returns {void}
 */
function addFrameSummaries(destination, summaries, totalField) {
  for (const summary of summaries) {
    addSummary(
      destination,
      `${summary.category}|${summary.url}#${summary.functionName}`,
      summary[totalField],
    );
  }
}

/**
 * @param {Map<string, number>} destination
 * @param {string} key
 * @param {number} value
 * @returns {void}
 */
function addSummary(destination, key, value) {
  destination.set(key, (destination.get(key) ?? 0) + value);
}

/**
 * @param {Map<string, number>} totals
 * @param {number} total
 * @param {'microseconds' | 'bytes'} valueName
 * @returns {readonly AnalysisEntry[]}
 */
function summaryEntries(totals, total, valueName) {
  return /** @type {AnalysisEntry[]} */ (
    [...totals.entries()].map(([key, value]) =>
      Object.freeze({
        key,
        [valueName]: value,
        percentage: total === 0 ? 0 : (value / total) * 100,
      }),
    )
  ).sort((left, right) => {
    const leftValue = /** @type {number} */ (left[valueName]);
    const rightValue = /** @type {number} */ (right[valueName]);

    if (rightValue !== leftValue) {
      return rightValue - leftValue;
    }

    return compareCodeUnits(left.key, right.key);
  });
}

/**
 * @param {unknown} value
 * @param {'node' | 'chromium'} directoryHost
 * @param {string} filePath
 * @returns {ProfileSidecar}
 */
function validateProfileSidecar(value, directoryHost, filePath) {
  const sidecar = objectAt(value, `Profile sidecar ${filePath}`);
  exactNumberAt(sidecar.schemaVersion, `${filePath}.schemaVersion`, 1);
  exactStringAt(sidecar.host, `${filePath}.host`);

  if (sidecar.host !== directoryHost) {
    throw new TypeError(
      `${filePath}.host must match directory host ${directoryHost}`,
    );
  }

  const runtime = objectAt(sidecar.runtime, `${filePath}.runtime`);
  exactStringAt(runtime.name, `${filePath}.runtime.name`);
  exactStringAt(runtime.version, `${filePath}.runtime.version`);

  if (runtime.name !== directoryHost) {
    throw new TypeError(
      `${filePath}.runtime.name must match directory host ${directoryHost}`,
    );
  }

  exactStringAt(sidecar.gitCommit, `${filePath}.gitCommit`);
  const capture = objectAt(sidecar.capture, `${filePath}.capture`);
  exactStringAt(capture.workload, `${filePath}.capture.workload`);

  if (!/^[a-z0-9-]+$/u.test(capture.workload)) {
    throw new TypeError(`${filePath}.capture.workload must be a safe name`);
  }

  if (!PROFILE_MODES.includes(capture.mode)) {
    throw new TypeError(`${filePath}.capture.mode must be "cold" or "steady"`);
  }

  const metrics = stringArrayAt(capture.metrics, `${filePath}.capture.metrics`);

  if (
    metrics.length !== 2 ||
    metrics[0] !== 'cpu' ||
    metrics[1] !== 'allocation'
  ) {
    throw new TypeError(
      `${filePath}.capture.metrics must be exactly cpu,allocation`,
    );
  }

  positiveIntegerAt(capture.warmups, `${filePath}.capture.warmups`);
  positiveIntegerAt(capture.iterations, `${filePath}.capture.iterations`);
  positiveIntegerAt(
    capture.samplingInterval,
    `${filePath}.capture.samplingInterval`,
  );
  const result = objectAt(sidecar.result, `${filePath}.result`);
  integerAt(result.expectedChecksum, `${filePath}.result.expectedChecksum`);
  integerAt(result.checksum, `${filePath}.result.checksum`);
  positiveIntegerAt(result.iterations, `${filePath}.result.iterations`);

  if (result.iterations !== capture.iterations) {
    throw new TypeError(
      `${filePath}.result.iterations must match capture.iterations`,
    );
  }

  positiveFiniteAt(
    result.elapsedMilliseconds,
    `${filePath}.result.elapsedMilliseconds`,
  );
  const summaries = objectAt(sidecar.summaries, `${filePath}.summaries`);
  const cpu = validateProfileSummary(
    summaries.cpu,
    `${filePath}.summaries.cpu`,
    'selfTime',
  );
  const allocation = validateProfileSummary(
    summaries.allocation,
    `${filePath}.summaries.allocation`,
    'selfSize',
  );
  const artifacts = objectAt(sidecar.artifacts, `${filePath}.artifacts`);
  const cpuArtifact = safeArtifactName(
    artifacts.cpu,
    'cpuprofile',
    `${filePath}.artifacts.cpu`,
  );
  const allocationArtifact = safeArtifactName(
    artifacts.allocation,
    'heapprofile',
    `${filePath}.artifacts.allocation`,
  );

  return Object.freeze({
    host: directoryHost,
    runtime: Object.freeze({
      name: directoryHost,
      version: runtime.version,
    }),
    gitCommit: sidecar.gitCommit,
    capture: Object.freeze({
      workload: capture.workload,
      mode: /** @type {'cold' | 'steady'} */ (capture.mode),
      metrics: Object.freeze(metrics),
      warmups: capture.warmups,
      iterations: capture.iterations,
      samplingInterval: capture.samplingInterval,
    }),
    result: Object.freeze({
      expectedChecksum: result.expectedChecksum,
      checksum: result.checksum,
      iterations: result.iterations,
      elapsedMilliseconds: result.elapsedMilliseconds,
    }),
    summaries: Object.freeze({ cpu, allocation }),
    artifacts: Object.freeze({
      cpu: cpuArtifact,
      allocation: allocationArtifact,
    }),
    cpuSampleCount: 0,
  });
}

/**
 * @param {unknown} value
 * @param {string} valuePath
 * @param {'selfTime' | 'selfSize'} totalField
 * @returns {{
 *   total: number,
 *   frames: readonly Record<string, any>[],
 *   categories: readonly Record<string, any>[],
 * }}
 */
function validateProfileSummary(value, valuePath, totalField) {
  const summary = objectAt(value, valuePath);
  nonNegativeIntegerAt(summary.total, `${valuePath}.total`);
  const frames = arrayAt(summary.frames, `${valuePath}.frames`);
  const categories = arrayAt(summary.categories, `${valuePath}.categories`);
  /** @type {Map<string, number>} */
  const frameCategories = new Map();
  /** @type {Set<string>} */
  const frameKeys = new Set();
  let frameTotal = 0;

  for (const [index, entry] of frames.entries()) {
    const framePath = `${valuePath}.frames[${index}]`;
    const frame = objectAt(entry, framePath);
    stringAt(frame.url, `${framePath}.url`);
    stringAt(frame.functionName, `${framePath}.functionName`);
    exactStringAt(frame.category, `${framePath}.category`);
    nonNegativeIntegerAt(frame[totalField], `${framePath}.${totalField}`);
    const key = `${frame.category}|${frame.url}#${frame.functionName}`;

    if (frameKeys.has(key)) {
      throw new TypeError(`${framePath} duplicates frame ${key}`);
    }

    frameKeys.add(key);
    frameTotal += frame[totalField];
    addSummary(frameCategories, frame.category, frame[totalField]);
  }

  if (frameTotal !== summary.total) {
    throw new TypeError(`${valuePath}.frames must sum to ${valuePath}.total`);
  }

  /** @type {Map<string, number>} */
  const categoryTotals = new Map();

  for (const [index, entry] of categories.entries()) {
    const categoryPath = `${valuePath}.categories[${index}]`;
    const category = objectAt(entry, categoryPath);
    exactStringAt(category.category, `${categoryPath}.category`);
    nonNegativeIntegerAt(category[totalField], `${categoryPath}.${totalField}`);

    if (categoryTotals.has(category.category)) {
      throw new TypeError(
        `${categoryPath} duplicates category ${category.category}`,
      );
    }

    categoryTotals.set(category.category, category[totalField]);
  }

  let categoryTotal = 0;

  for (const [category, valueTotal] of categoryTotals) {
    categoryTotal += valueTotal;

    if (valueTotal !== (frameCategories.get(category) ?? 0)) {
      throw new TypeError(
        `${valuePath}.categories does not match frames for ${category}`,
      );
    }
  }

  for (const category of frameCategories.keys()) {
    if (!categoryTotals.has(category)) {
      throw new TypeError(`${valuePath}.categories is missing ${category}`);
    }
  }

  if (categoryTotal !== summary.total) {
    throw new TypeError(
      `${valuePath}.categories must sum to ${valuePath}.total`,
    );
  }

  return Object.freeze({
    total: summary.total,
    frames: Object.freeze(
      frames.map((frame) =>
        Object.freeze({
          url: frame.url,
          functionName: frame.functionName,
          category: frame.category,
          [totalField]: frame[totalField],
        }),
      ),
    ),
    categories: Object.freeze(
      categories.map((category) =>
        Object.freeze({
          category: category.category,
          [totalField]: category[totalField],
        }),
      ),
    ),
  });
}

/**
 * @param {URL} directoryUrl
 * @param {string} fileName
 * @param {'cpu' | 'allocation'} metric
 * @param {string} sidecarPath
 * @param {typeof readFile} readFileOperation
 * @returns {Promise<number>}
 */
async function requireDeclaredArtifact(
  directoryUrl,
  fileName,
  metric,
  sidecarPath,
  readFileOperation,
) {
  const artifactUrl = new URL(fileName, directoryUrl);
  let contents;

  try {
    contents = await readJsonFile(
      artifactUrl,
      `${metric} artifact ${fileName}`,
      readFileOperation,
    );
  } catch (error) {
    throw new Error(
      `${sidecarPath} declares missing ${metric} artifact ${fileName}: ${formatCause(error)}`,
    );
  }

  if (metric !== 'cpu') {
    objectAt(contents, `${metric} artifact ${fileName}`);
    return 0;
  }

  const profile = objectAt(contents, `${metric} artifact ${fileName}`);
  const samples = arrayAt(
    profile.samples,
    `${metric} artifact ${fileName}.samples`,
  );
  return samples.length;
}

/**
 * @param {unknown} value
 * @param {'cpuprofile' | 'heapprofile'} extension
 * @param {string} valuePath
 * @returns {string}
 */
function safeArtifactName(value, extension, valuePath) {
  if (
    typeof value !== 'string' ||
    !new RegExp(`^[a-z0-9-]+\\.${extension}$`, 'u').test(value)
  ) {
    throw new TypeError(`${valuePath} must be a safe .${extension} file name`);
  }

  return value;
}

/**
 * @param {URL} fileUrl
 * @param {string} label
 * @param {typeof readFile} readFileOperation
 * @returns {Promise<unknown>}
 */
async function readJsonFile(fileUrl, label, readFileOperation) {
  let contents;

  try {
    contents = await readFileOperation(fileUrl, 'utf8');
  } catch (error) {
    throw new Error(`Could not read ${label}: ${formatCause(error)}`);
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new TypeError(`Malformed ${label}: ${formatCause(error)}`);
  }
}

/**
 * @param {string} value
 * @param {string} label
 * @returns {string}
 */
function validateRepositoryRelativeDirectory(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(
      `${label} must be a non-empty repository-relative path`,
    );
  }

  if (
    path.isAbsolute(value) ||
    value.startsWith('\\') ||
    /^[A-Za-z]:/.test(value)
  ) {
    throw new RangeError(
      `${label} must be repository-relative, not absolute: ${value}`,
    );
  }

  if (
    value
      .replace(/\\/g, '/')
      .split('/')
      .some((part) => part === '..')
  ) {
    throw new RangeError(`${label} must not escape the repository: ${value}`);
  }

  resolveOutputDirectory(value);
  return value.replace(/\/+$/u, '');
}

/**
 * @param {readonly string[]} args
 * @param {number} index
 * @param {string} name
 * @returns {string}
 */
function readOptionValue(args, index, name) {
  const value = args[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for --${name}`);
  }

  return value;
}

/**
 * @param {{
 *   mkdir?: typeof mkdir,
 *   readdir?: typeof readdir,
 *   readFile?: typeof readFile,
 *   rename?: typeof rename,
 *   rm?: typeof rm,
 *   stat?: typeof stat,
 *   writeFile?: typeof writeFile,
 * }} operations
 * @returns {{
 *   mkdir: typeof mkdir,
 *   readdir: typeof readdir,
 *   readFile: typeof readFile,
 *   rename: typeof rename,
 *   rm: typeof rm,
 *   stat: typeof stat,
 *   writeFile: typeof writeFile,
 * }}
 */
function fileOperationsFrom(operations) {
  return {
    mkdir: operations.mkdir ?? mkdir,
    readdir: operations.readdir ?? readdir,
    readFile: operations.readFile ?? readFile,
    rename: operations.rename ?? rename,
    rm: operations.rm ?? rm,
    stat: operations.stat ?? stat,
    writeFile: operations.writeFile ?? writeFile,
  };
}

/**
 * @param {URL} fileUrl
 * @param {typeof stat} statOperation
 * @returns {Promise<boolean>}
 */
async function fileExists(fileUrl, statOperation) {
  try {
    await statOperation(fileUrl);
    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      if (error.code === 'ENOENT') {
        return false;
      }
    }

    throw new Error(`Could not stat analysis output ${fileUrl.href}`);
  }
}

/**
 * @param {Record<string, any>} left
 * @param {Record<string, any>} right
 * @param {string} property
 * @param {string} leftHost
 * @param {string} rightHost
 * @returns {void}
 */
function compareMetadata(left, right, property, leftHost, rightHost) {
  if (left[property] !== right[property]) {
    throw new TypeError(
      `Incompatible baseline ${property} for ${leftHost} and ${rightHost}`,
    );
  }
}

/**
 * @param {ProfileSidecar} sidecar
 * @returns {string}
 */
function sidecarKey(sidecar) {
  return `${sidecar.host}:${sidecar.capture.workload}:${sidecar.capture.mode}`;
}

/**
 * @param {ProfileSidecar} left
 * @param {ProfileSidecar} right
 * @returns {number}
 */
function compareSidecars(left, right) {
  return compareCodeUnits(sidecarKey(left), sidecarKey(right));
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
function compareCodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * @param {unknown} value
 * @param {string} valuePath
 * @returns {Record<string, any>}
 */
function objectAt(value, valuePath) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${valuePath} must be an object`);
  }

  return /** @type {Record<string, any>} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} valuePath
 * @returns {any[]}
 */
function arrayAt(value, valuePath) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${valuePath} must be an array`);
  }

  return value;
}

/**
 * @param {unknown} value
 * @param {string} valuePath
 * @returns {string[]}
 */
function stringArrayAt(value, valuePath) {
  return arrayAt(value, valuePath).map((entry, index) => {
    exactStringAt(entry, `${valuePath}[${index}]`);
    return entry;
  });
}

/**
 * @param {unknown} value
 * @param {string} valuePath
 * @returns {void}
 */
function exactStringAt(value, valuePath) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${valuePath} must be a non-empty string`);
  }
}

/**
 * @param {unknown} value
 * @param {string} valuePath
 * @returns {void}
 */
function stringAt(value, valuePath) {
  if (typeof value !== 'string') {
    throw new TypeError(`${valuePath} must be a string`);
  }
}

/**
 * @param {unknown} value
 * @param {string} valuePath
 * @returns {void}
 */
function integerAt(value, valuePath) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TypeError(`${valuePath} must be an integer`);
  }
}

/**
 * @param {unknown} value
 * @param {string} valuePath
 * @returns {void}
 */
function nonNegativeIntegerAt(value, valuePath) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${valuePath} must be a non-negative integer`);
  }
}

/**
 * @param {unknown} value
 * @param {string} valuePath
 * @returns {void}
 */
function positiveIntegerAt(value, valuePath) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${valuePath} must be a positive integer`);
  }
}

/**
 * @param {unknown} value
 * @param {string} valuePath
 * @returns {void}
 */
function positiveFiniteAt(value, valuePath) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${valuePath} must be a positive finite number`);
  }
}

/**
 * @param {unknown} value
 * @param {string} valuePath
 * @param {number} expected
 * @returns {void}
 */
function exactNumberAt(value, valuePath, expected) {
  if (typeof value !== 'number' || !Object.is(value, expected)) {
    throw new TypeError(`${valuePath} must equal ${expected}`);
  }
}

/**
 * @returns {number}
 */
function nextAnalysisTransactionId() {
  analysisTransactionCounter += 1;
  return analysisTransactionCounter;
}

/**
 * @param {string | undefined} entry
 * @returns {boolean}
 */
function isMain(entry) {
  return entry !== undefined && pathToFileURL(entry).href === import.meta.url;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function formatError(error) {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function formatCause(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @typedef {{
 *   key: string,
 *   percentage: number,
 *   microseconds?: number,
 *   bytes?: number,
 * }} AnalysisEntry
 */

/**
 * @typedef {{
 *   totalMicroseconds: number,
 *   categories: readonly AnalysisEntry[],
 *   frames: readonly AnalysisEntry[],
 * }} CpuAggregate
 */

/**
 * @typedef {{
 *   totalBytes: number,
 *   categories: readonly AnalysisEntry[],
 *   frames: readonly AnalysisEntry[],
 * }} AllocationAggregate
 */

/**
 * @typedef {{
 *   profileCount: number,
 *   cpu: CpuAggregate,
 *   allocation: AllocationAggregate,
 * }} ProfileAggregate
 */

/**
 * @typedef {{
 *   groups: Record<string, ProfileAggregate>,
 *   steadyByWorkload: Record<string, ProfileAggregate>,
 * }} ProfileAnalysis
 */

/**
 * @typedef {{
 *   host: 'node' | 'chromium',
 *   workload: string,
 *   mode: 'cold' | 'steady',
 *   sidecarExpectedChecksum: number,
 *   sidecarChecksum: number,
 *   benchmarkExpectedChecksum: number,
 *   benchmarkChecksum: number,
 *   nativeMedianMs: number,
 *   jsjsMedianMs: number,
 *   profileElapsedMilliseconds: number,
 *   profileIterations: number,
 *   profileElapsedPerIterationMilliseconds: number,
 *   cpuSampleTotalMicroseconds: number,
 *   cpuSampleCount: number,
 *   allocationSampledBytes: number,
 *   allocationFrameCount: number,
 *   valid: true,
 * }} CorrelationRow
 */

/**
 * @typedef {{
 *   baseline: {
 *     runId: string,
 *     generatedAt: string,
 *     hosts: Record<string, {
 *       version: string,
 *       runId: string,
 *       generatedAt: string,
 *     }>,
 *   },
 *   profiles: readonly CorrelationRow[],
 *   allChecksumsMatch: true,
 * }} ChecksumCorrelation
 */

/**
 * @typedef {{
 *   host: 'node' | 'chromium',
 *   runtime: { name: 'node' | 'chromium', version: string },
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
 *     cpu: {
 *       total: number,
 *       frames: readonly Record<string, any>[],
 *       categories: readonly Record<string, any>[],
 *     },
 *     allocation: {
 *       total: number,
 *       frames: readonly Record<string, any>[],
 *       categories: readonly Record<string, any>[],
 *     },
 *   },
 *   artifacts: { cpu: string, allocation: string },
 *   cpuSampleCount: number,
 * }} ProfileSidecar
 */
