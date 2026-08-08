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
  const observations = pairMetricSidecars(sidecars);
  const reports = await readBaselineReports(
    baselineDirectory,
    observations,
    fileOperations,
  );
  validateCompatibleBaselineReports(reports);
  validateCompatibleSidecars(observations, reports);
  const correlation = createChecksumCorrelation(observations, reports);
  const analysis = createProfileAnalysis(observations);

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
 * @returns {Promise<readonly MetricSidecar[]>}
 */
async function discoverProfileSidecars(profileDirectory, operations) {
  /** @type {MetricSidecar[]} */
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
        sidecar.artifact,
        sidecar.capture.metric,
        filePath,
        operations.readFile,
      );

      sidecars.push(Object.freeze({ ...sidecar, cpuSampleCount }));
    }
  }

  sidecars.sort(compareSidecars);
  const seen = new Set();

  for (const sidecar of sidecars) {
    const key = metricSidecarKey(sidecar);

    if (seen.has(key)) {
      throw new Error(
        `duplicate ${sidecar.capture.metric} sidecar for ${sidecarKey(sidecar)}`,
      );
    }

    seen.add(key);
  }

  return Object.freeze(sidecars);
}

/**
 * @param {readonly MetricSidecar[]} sidecars
 * @returns {readonly ProfileObservation[]}
 */
function pairMetricSidecars(sidecars) {
  /** @type {Map<string, { cpu?: MetricSidecar, allocation?: MetricSidecar }>} */
  const byPair = new Map();

  for (const sidecar of sidecars) {
    const key = sidecarKey(sidecar);
    const pair = byPair.get(key) ?? {};

    if (pair[sidecar.capture.metric] !== undefined) {
      throw new Error(`duplicate ${sidecar.capture.metric} sidecar for ${key}`);
    }

    pair[sidecar.capture.metric] = sidecar;
    byPair.set(key, pair);
  }

  /** @type {ProfileObservation[]} */
  const observations = [];

  for (const [key, pair] of [...byPair.entries()].sort(([left], [right]) =>
    compareCodeUnits(left, right),
  )) {
    if (pair.cpu === undefined) {
      throw new Error(`missing cpu sidecar for ${key}`);
    }

    if (pair.allocation === undefined) {
      throw new Error(`missing allocation sidecar for ${key}`);
    }

    validatePairedMetadata(pair.cpu, pair.allocation);
    validatePairedInterpreterDenominators(pair.cpu, pair.allocation);
    observations.push(
      Object.freeze({
        host: pair.cpu.host,
        runtime: pair.cpu.runtime,
        source: pair.cpu.source,
        capture: pair.cpu.capture,
        cpu: pair.cpu,
        allocation: pair.allocation,
      }),
    );
  }

  return Object.freeze(observations);
}

/**
 * @param {MetricSidecar} cpu
 * @param {MetricSidecar} allocation
 * @returns {void}
 */
function validatePairedMetadata(cpu, allocation) {
  const key = sidecarKey(cpu);

  for (const [property, left, right] of [
    ['runtime.name', cpu.runtime.name, allocation.runtime.name],
    ['runtime.version', cpu.runtime.version, allocation.runtime.version],
    ['source.gitCommit', cpu.source.gitCommit, allocation.source.gitCommit],
    ['source.gitDirty', cpu.source.gitDirty, allocation.source.gitDirty],
    ['capture.runId', cpu.capture.runId, allocation.capture.runId],
    ['capture.warmups', cpu.capture.warmups, allocation.capture.warmups],
    [
      'capture.iterations',
      cpu.capture.iterations,
      allocation.capture.iterations,
    ],
    [
      'capture.cpuSamplingIntervalMicroseconds',
      cpu.capture.cpuSamplingIntervalMicroseconds,
      allocation.capture.cpuSamplingIntervalMicroseconds,
    ],
    [
      'capture.allocationSamplingIntervalBytes',
      cpu.capture.allocationSamplingIntervalBytes,
      allocation.capture.allocationSamplingIntervalBytes,
    ],
  ]) {
    if (left !== right) {
      throw new TypeError(`Incompatible paired ${property} for ${key}`);
    }
  }
}

/**
 * @param {MetricSidecar} cpu
 * @param {MetricSidecar} allocation
 * @returns {void}
 */
function validatePairedInterpreterDenominators(cpu, allocation) {
  for (const sidecar of [cpu, allocation]) {
    const valueField =
      sidecar.capture.metric === 'cpu' ? 'selfTime' : 'selfSize';
    const interpreterTotal = sidecar.summary.frames.reduce(
      (total, frame) =>
        frame.category === 'host' ? total : total + frame[valueField],
      0,
    );

    if (interpreterTotal === 0) {
      throw new Error(
        `Recapture required: ${sidecar.capture.metric} sidecar for ${sidecarKey(sidecar)} has no non-host interpreter samples`,
      );
    }
  }
}

/**
 * @param {string} baselineDirectory
 * @param {readonly ProfileObservation[]} observations
 * @param {ReturnType<typeof fileOperationsFrom>} operations
 * @returns {Promise<ReadonlyMap<string, Record<string, any>>>}
 */
async function readBaselineReports(
  baselineDirectory,
  observations,
  operations,
) {
  /** @type {Set<'node' | 'chromium'>} */
  const requiredHosts = new Set(
    observations.map((observation) => observation.host),
  );
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
      reference.source,
      report.source,
      'gitCommit',
      referenceHost,
      host,
    );
    compareMetadata(
      reference.source,
      report.source,
      'gitDirty',
      referenceHost,
      host,
    );
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
 * @param {readonly ProfileObservation[]} observations
 * @param {ReadonlyMap<string, Record<string, any>>} reports
 * @returns {void}
 */
function validateCompatibleSidecars(observations, reports) {
  for (const observation of observations) {
    const report = reports.get(observation.host);

    if (report === undefined) {
      throw new Error(`missing baseline report for ${observation.host}`);
    }

    if (observation.runtime.version !== report.version) {
      throw new TypeError(
        `Runtime version mismatch for ${sidecarKey(observation.cpu)}: ${observation.runtime.version} !== ${report.version}`,
      );
    }

    if (observation.source.gitCommit !== report.source.gitCommit) {
      throw new TypeError(
        `Source commit mismatch for ${sidecarKey(observation.cpu)}: ${observation.source.gitCommit} !== ${report.source.gitCommit}`,
      );
    }
  }
}

/**
 * @param {readonly ProfileObservation[]} observations
 * @param {ReadonlyMap<string, Record<string, any>>} reports
 * @returns {ChecksumCorrelation}
 */
function createChecksumCorrelation(observations, reports) {
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

  const profiles = observations.map((observation) => {
    const report = /** @type {Record<string, any>} */ (
      reports.get(observation.host)
    );
    const workload = report.config.workloads.find(
      /** @param {any} candidate */
      (candidate) => candidate.name === observation.capture.workload,
    );

    if (workload === undefined) {
      throw new Error(
        `missing baseline workload for ${sidecarKey(observation.cpu)} in ${observation.host}.json`,
      );
    }

    const benchmarkResult = report.results.find(
      /** @param {any} candidate */
      (candidate) =>
        candidate.workload === observation.capture.workload &&
        candidate.mode === observation.capture.mode,
    );

    if (benchmarkResult === undefined) {
      throw new Error(
        `missing baseline row for ${sidecarKey(observation.cpu)} in ${observation.host}.json`,
      );
    }

    const checksums = [
      workload.expectedChecksum,
      benchmarkResult.checksum,
      observation.cpu.result.expectedChecksum,
      observation.cpu.result.checksum,
      observation.allocation.result.expectedChecksum,
      observation.allocation.result.checksum,
    ];

    if (!checksums.every((checksum) => checksum === checksums[0])) {
      throw new Error(
        `checksum mismatch for ${sidecarKey(observation.cpu)}: baseline expected=${workload.expectedChecksum}, baseline observed=${benchmarkResult.checksum}, cpu expected=${observation.cpu.result.expectedChecksum}, cpu observed=${observation.cpu.result.checksum}, allocation expected=${observation.allocation.result.expectedChecksum}, allocation observed=${observation.allocation.result.checksum}`,
      );
    }

    return Object.freeze({
      host: observation.host,
      workload: observation.capture.workload,
      mode: observation.capture.mode,
      profileRunId: observation.capture.runId,
      sourceGitCommit: observation.source.gitCommit,
      cpuSamplingIntervalMicroseconds:
        observation.capture.cpuSamplingIntervalMicroseconds,
      allocationSamplingIntervalBytes:
        observation.capture.allocationSamplingIntervalBytes,
      cpuExpectedChecksum: observation.cpu.result.expectedChecksum,
      cpuChecksum: observation.cpu.result.checksum,
      allocationExpectedChecksum:
        observation.allocation.result.expectedChecksum,
      allocationChecksum: observation.allocation.result.checksum,
      benchmarkExpectedChecksum: workload.expectedChecksum,
      benchmarkChecksum: benchmarkResult.checksum,
      nativeMedianMs: benchmarkResult.lanes.native.summary.median,
      jsjsMedianMs: benchmarkResult.lanes.jsjs.summary.median,
      cpuProfileElapsedMilliseconds: observation.cpu.result.elapsedMilliseconds,
      cpuProfileIterations: observation.cpu.result.iterations,
      cpuProfileElapsedPerIterationMilliseconds:
        observation.cpu.result.elapsedMilliseconds /
        observation.cpu.result.iterations,
      cpuSampleTotalMicroseconds: observation.cpu.summary.total,
      cpuSampleCount: observation.cpu.cpuSampleCount,
      allocationProfileElapsedMilliseconds:
        observation.allocation.result.elapsedMilliseconds,
      allocationProfileIterations: observation.allocation.result.iterations,
      allocationProfileElapsedPerIterationMilliseconds:
        observation.allocation.result.elapsedMilliseconds /
        observation.allocation.result.iterations,
      allocationSampledBytes: observation.allocation.summary.total,
      allocationFrameCount: observation.allocation.summary.frames.length,
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
 * @param {readonly ProfileObservation[]} observations
 * @returns {ProfileAnalysis}
 */
function createProfileAnalysis(observations) {
  /** @type {Map<string, ProfileObservation[]>} */
  const groups = new Map([['all', [...observations]]]);

  for (const observation of observations) {
    const groupName = `${observation.host}-${observation.capture.mode}`;
    const group = groups.get(groupName) ?? [];
    group.push(observation);
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

  /** @type {Map<string, ProfileObservation[]>} */
  const steadyByWorkload = new Map();

  for (const observation of observations) {
    if (observation.capture.mode !== 'steady') {
      continue;
    }

    const workload = observation.capture.workload;
    const group = steadyByWorkload.get(workload) ?? [];
    group.push(observation);
    steadyByWorkload.set(workload, group);
  }

  /** @type {Record<string, ProfileAggregate>} */
  const steadyOutput = {};

  for (const workload of [...steadyByWorkload.keys()].sort(compareCodeUnits)) {
    steadyOutput[workload] = summarizeSidecars(
      /** @type {ProfileObservation[]} */ (steadyByWorkload.get(workload)),
    );
  }

  return Object.freeze({
    weighting: 'equal-observation',
    groups: Object.freeze(groupOutput),
    steadyByWorkload: Object.freeze(steadyOutput),
  });
}

/**
 * @param {readonly ProfileObservation[]} observations
 * @returns {ProfileAggregate}
 */
function summarizeSidecars(observations) {
  return Object.freeze({
    profileCount: observations.length,
    cpu: summarizeMetricObservations(observations, 'cpu'),
    allocation: summarizeMetricObservations(observations, 'allocation'),
  });
}

/**
 * @param {readonly ProfileObservation[]} observations
 * @param {'cpu' | 'allocation'} metric
 * @returns {MetricAggregate}
 */
function summarizeMetricObservations(observations, metric) {
  const valueField = metric === 'cpu' ? 'selfTime' : 'selfSize';
  const valueName = metric === 'cpu' ? 'microseconds' : 'bytes';
  /** @type {Map<string, number>} */
  const interpreterCategoryShares = new Map();
  /** @type {Map<string, number>} */
  const interpreterFrameShares = new Map();
  /** @type {Map<string, number>} */
  const overheadCategories = new Map();
  /** @type {Map<string, number>} */
  const overheadFrames = new Map();
  let sampledTotal = 0;
  let interpreterTotal = 0;
  let overheadTotal = 0;

  for (const observation of observations) {
    const summary = observation[metric].summary;
    let observationInterpreterTotal = 0;

    sampledTotal += summary.total;

    for (const frame of summary.frames) {
      if (frame.category === 'host') {
        const key = `${frame.category}|${frame.url}#${frame.functionName}`;
        addSummary(overheadFrames, key, frame[valueField]);
        overheadTotal += frame[valueField];
      } else {
        observationInterpreterTotal += frame[valueField];
        interpreterTotal += frame[valueField];
      }
    }

    for (const category of summary.categories) {
      if (category.category === 'host') {
        addSummary(overheadCategories, category.category, category[valueField]);
      } else {
        addSummary(
          interpreterCategoryShares,
          category.category,
          (category[valueField] / observationInterpreterTotal) * 100,
        );
      }
    }

    for (const frame of summary.frames) {
      if (frame.category !== 'host') {
        const key = `${frame.category}|${frame.url}#${frame.functionName}`;
        addSummary(
          interpreterFrameShares,
          key,
          (frame[valueField] / observationInterpreterTotal) * 100,
        );
      }
    }
  }

  return Object.freeze({
    interpreter: Object.freeze({
      observationCount: observations.length,
      categories: Object.freeze(
        meanShareEntries(interpreterCategoryShares, observations.length),
      ),
      frames: Object.freeze(
        meanShareEntries(interpreterFrameShares, observations.length),
      ),
    }),
    overhead: Object.freeze({
      [`total${metric === 'cpu' ? 'Microseconds' : 'Bytes'}`]: overheadTotal,
      categories: Object.freeze(rawEntries(overheadCategories, valueName)),
      frames: Object.freeze(rawEntries(overheadFrames, valueName)),
    }),
    diagnostics: Object.freeze({
      [`sampledTotal${metric === 'cpu' ? 'Microseconds' : 'Bytes'}`]:
        sampledTotal,
      [`interpreterTotal${metric === 'cpu' ? 'Microseconds' : 'Bytes'}`]:
        interpreterTotal,
    }),
  });
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
 * @param {Map<string, number>} shares
 * @param {number} observationCount
 * @returns {readonly AnalysisEntry[]}
 */
function meanShareEntries(shares, observationCount) {
  return /** @type {AnalysisEntry[]} */ (
    [...shares.entries()].map(([key, share]) =>
      Object.freeze({
        key,
        percentage: observationCount === 0 ? 0 : share / observationCount,
      }),
    )
  ).sort(compareAnalysisEntries);
}

/**
 * @param {Map<string, number>} totals
 * @param {'microseconds' | 'bytes'} valueName
 * @returns {readonly AnalysisEntry[]}
 */
function rawEntries(totals, valueName) {
  return /** @type {AnalysisEntry[]} */ (
    [...totals.entries()].map(([key, value]) =>
      Object.freeze({
        key,
        [valueName]: value,
      }),
    )
  ).sort(compareAnalysisEntries);
}

/**
 * @param {AnalysisEntry} left
 * @param {AnalysisEntry} right
 * @returns {number}
 */
function compareAnalysisEntries(left, right) {
  const leftValue =
    left.percentage ??
    left.microseconds ??
    left.bytes ??
    Number.NEGATIVE_INFINITY;
  const rightValue =
    right.percentage ??
    right.microseconds ??
    right.bytes ??
    Number.NEGATIVE_INFINITY;

  if (rightValue !== leftValue) {
    return rightValue - leftValue;
  }

  return compareCodeUnits(left.key, right.key);
}

/**
 * @param {unknown} value
 * @param {'node' | 'chromium'} directoryHost
 * @param {string} filePath
 * @returns {MetricSidecar}
 */
function validateProfileSidecar(value, directoryHost, filePath) {
  const sidecar = objectAt(value, `Profile sidecar ${filePath}`);
  exactNumberAt(sidecar.schemaVersion, `${filePath}.schemaVersion`, 2);
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

  const source = objectAt(sidecar.source, `${filePath}.source`);
  exactStringAt(source.gitCommit, `${filePath}.source.gitCommit`);
  exactBooleanAt(source.gitDirty, `${filePath}.source.gitDirty`, false);
  const capture = objectAt(sidecar.capture, `${filePath}.capture`);
  exactStringAt(capture.workload, `${filePath}.capture.workload`);

  if (!/^[a-z0-9-]+$/u.test(capture.workload)) {
    throw new TypeError(`${filePath}.capture.workload must be a safe name`);
  }

  if (!PROFILE_MODES.includes(capture.mode)) {
    throw new TypeError(`${filePath}.capture.mode must be "cold" or "steady"`);
  }

  if (capture.metric !== 'cpu' && capture.metric !== 'allocation') {
    throw new TypeError(
      `${filePath}.capture.metric must be "cpu" or "allocation"`,
    );
  }

  exactStringAt(capture.runId, `${filePath}.capture.runId`);
  positiveIntegerAt(capture.warmups, `${filePath}.capture.warmups`);
  positiveIntegerAt(capture.iterations, `${filePath}.capture.iterations`);
  positiveIntegerAt(
    capture.cpuSamplingIntervalMicroseconds,
    `${filePath}.capture.cpuSamplingIntervalMicroseconds`,
  );
  positiveIntegerAt(
    capture.allocationSamplingIntervalBytes,
    `${filePath}.capture.allocationSamplingIntervalBytes`,
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
  const metric = /** @type {'cpu' | 'allocation'} */ (capture.metric);
  const otherMetric = metric === 'cpu' ? 'allocation' : 'cpu';
  const summary = validateProfileSummary(
    summaries[metric],
    `${filePath}.summaries.${metric}`,
    metric === 'cpu' ? 'selfTime' : 'selfSize',
  );

  if (summaries[otherMetric] !== undefined) {
    throw new TypeError(
      `${filePath}.summaries must contain only the ${metric} metric`,
    );
  }

  const artifacts = objectAt(sidecar.artifacts, `${filePath}.artifacts`);
  const artifact = safeArtifactName(
    artifacts[metric],
    metric === 'cpu' ? 'cpuprofile' : 'heapprofile',
    `${filePath}.artifacts.${metric}`,
  );

  if (artifacts[otherMetric] !== undefined) {
    throw new TypeError(
      `${filePath}.artifacts must contain only the ${metric} metric`,
    );
  }

  return Object.freeze({
    host: directoryHost,
    runtime: Object.freeze({
      name: directoryHost,
      version: runtime.version,
    }),
    source: Object.freeze({
      gitCommit: source.gitCommit,
      gitDirty: false,
    }),
    capture: Object.freeze({
      workload: capture.workload,
      mode: /** @type {'cold' | 'steady'} */ (capture.mode),
      metric,
      runId: capture.runId,
      warmups: capture.warmups,
      iterations: capture.iterations,
      cpuSamplingIntervalMicroseconds: capture.cpuSamplingIntervalMicroseconds,
      allocationSamplingIntervalBytes: capture.allocationSamplingIntervalBytes,
    }),
    result: Object.freeze({
      expectedChecksum: result.expectedChecksum,
      checksum: result.checksum,
      iterations: result.iterations,
      elapsedMilliseconds: result.elapsedMilliseconds,
    }),
    summary,
    artifact,
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

  const normalized = value.replace(/\\/g, '/').replace(/\/+$/u, '');
  const decodedParts = normalized.split('/').flatMap((part) => {
    let decoded;

    try {
      decoded = decodeURIComponent(part);
    } catch {
      throw new RangeError(`${label} contains invalid URL encoding: ${value}`);
    }

    return decoded.replace(/\\/g, '/').split('/');
  });

  if (decodedParts.some((part) => part === '.' || part === '..')) {
    throw new RangeError(`${label} must not escape the repository: ${value}`);
  }

  if (
    normalized !== '.benchmark-results' &&
    !normalized.startsWith('.benchmark-results/')
  ) {
    throw new RangeError(
      `${label} must stay under .benchmark-results/: ${value}`,
    );
  }

  const benchmarkResultsUrl = resolveOutputDirectory('.benchmark-results');
  const outputUrl = resolveOutputDirectory(normalized);

  if (!outputUrl.href.startsWith(benchmarkResultsUrl.href)) {
    throw new RangeError(
      `${label} must stay under .benchmark-results/: ${value}`,
    );
  }

  return normalized;
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
 * @param {MetricSidecar} sidecar
 * @returns {string}
 */
function sidecarKey(sidecar) {
  return `${sidecar.host}:${sidecar.capture.workload}:${sidecar.capture.mode}`;
}

/**
 * @param {MetricSidecar} sidecar
 * @returns {string}
 */
function metricSidecarKey(sidecar) {
  return `${sidecarKey(sidecar)}:${sidecar.capture.metric}`;
}

/**
 * @param {MetricSidecar} left
 * @param {MetricSidecar} right
 * @returns {number}
 */
function compareSidecars(left, right) {
  return compareCodeUnits(metricSidecarKey(left), metricSidecarKey(right));
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
 * @param {boolean} expected
 * @returns {void}
 */
function exactBooleanAt(value, valuePath, expected) {
  if (typeof value !== 'boolean' || value !== expected) {
    throw new TypeError(`${valuePath} must equal ${expected}`);
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
 *   percentage?: number,
 *   microseconds?: number,
 *   bytes?: number,
 * }} AnalysisEntry
 */

/**
 * @typedef {{
 *   interpreter: {
 *     observationCount: number,
 *     categories: readonly AnalysisEntry[],
 *     frames: readonly AnalysisEntry[],
 *   },
 *   overhead: {
 *     totalMicroseconds?: number,
 *     totalBytes?: number,
 *     categories: readonly AnalysisEntry[],
 *     frames: readonly AnalysisEntry[],
 *   },
 *   diagnostics: {
 *     sampledTotalMicroseconds?: number,
 *     sampledTotalBytes?: number,
 *     interpreterTotalMicroseconds?: number,
 *     interpreterTotalBytes?: number,
 *   },
 * }} MetricAggregate
 */

/**
 * @typedef {{
 *   profileCount: number,
 *   cpu: MetricAggregate,
 *   allocation: MetricAggregate,
 * }} ProfileAggregate
 */

/**
 * @typedef {{
 *   weighting: 'equal-observation',
 *   groups: Record<string, ProfileAggregate>,
 *   steadyByWorkload: Record<string, ProfileAggregate>,
 * }} ProfileAnalysis
 */

/**
 * @typedef {{
 *   host: 'node' | 'chromium',
 *   workload: string,
 *   mode: 'cold' | 'steady',
 *   profileRunId: string,
 *   sourceGitCommit: string,
 *   cpuSamplingIntervalMicroseconds: number,
 *   allocationSamplingIntervalBytes: number,
 *   cpuExpectedChecksum: number,
 *   cpuChecksum: number,
 *   allocationExpectedChecksum: number,
 *   allocationChecksum: number,
 *   benchmarkExpectedChecksum: number,
 *   benchmarkChecksum: number,
 *   nativeMedianMs: number,
 *   jsjsMedianMs: number,
 *   cpuProfileElapsedMilliseconds: number,
 *   cpuProfileIterations: number,
 *   cpuProfileElapsedPerIterationMilliseconds: number,
 *   cpuSampleTotalMicroseconds: number,
 *   cpuSampleCount: number,
 *   allocationProfileElapsedMilliseconds: number,
 *   allocationProfileIterations: number,
 *   allocationProfileElapsedPerIterationMilliseconds: number,
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
 *   summary: {
 *     total: number,
 *     frames: readonly Record<string, any>[],
 *     categories: readonly Record<string, any>[],
 *   },
 *   artifact: string,
 *   cpuSampleCount: number,
 * }} MetricSidecar
 */

/**
 * @typedef {{
 *   host: 'node' | 'chromium',
 *   runtime: { name: 'node' | 'chromium', version: string },
 *   source: { gitCommit: string, gitDirty: false },
 *   capture: MetricSidecar['capture'],
 *   cpu: MetricSidecar,
 *   allocation: MetricSidecar,
 * }} ProfileObservation
 */
