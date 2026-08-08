import { readFile, readdir } from 'node:fs/promises';
import { writeOutputFile, resolveOutputDirectory } from './output.js';
import { REPORT_SCHEMA_VERSION, validateHostReport } from './report.js';
import { geometricMean } from './statistics.js';

/**
 * @typedef {ReturnType<typeof import('./run.js').runHostBenchmark>} HostReport
 * @typedef {HostReport['results'][number]} HostResult
 * @typedef {{
 *   runId: string,
 *   generatedAt: string,
 *   host: string,
 *   version: string,
 *   mode: 'cold' | 'steady',
 *   geometricMeanSlowdown: number,
 * }} AggregateRow
 * @typedef {{
 *   runId: string,
 *   generatedAt: string,
 *   host: string,
 *   version: string,
 *   mode: 'cold' | 'steady',
 *   workload: string,
 *   geometricMeanSlowdown: number,
 *   slowdown: number,
 *   checksum: number,
 *   nativeMedianMs: number,
 *   nativeP95Ms: number,
 *   nativeCoefficientOfVariation: number,
 *   nativeBatchSize: number,
 *   jsjsMedianMs: number,
 *   jsjsP95Ms: number,
 *   jsjsCoefficientOfVariation: number,
 *   jsjsBatchSize: number,
 *   boundary: string,
 * }} WorkloadRow
 * @typedef {keyof WorkloadRow} CsvColumn
 * @typedef {{
 *   schemaVersion: 2,
 *   runId: string,
 *   generatedAt: string,
 *   hosts: readonly string[],
 *   hostMetadata: readonly {
 *     host: string,
 *     version: string,
 *     generatedAt: string,
 *     runId: string,
 *   }[],
 *   config: HostReport['config'],
 *   methodology: readonly { mode: 'cold' | 'steady', boundary: string }[],
 *   aggregate: readonly AggregateRow[],
 *   workloads: readonly WorkloadRow[],
 * }} BenchmarkSummary
 */

/** @type {readonly CsvColumn[]} */
const CSV_COLUMNS = Object.freeze([
  'runId',
  'generatedAt',
  'host',
  'version',
  'mode',
  'workload',
  'geometricMeanSlowdown',
  'slowdown',
  'checksum',
  'nativeMedianMs',
  'nativeP95Ms',
  'nativeCoefficientOfVariation',
  'nativeBatchSize',
  'jsjsMedianMs',
  'jsjsP95Ms',
  'jsjsCoefficientOfVariation',
  'jsjsBatchSize',
  'boundary',
]);

/**
 * @param {readonly unknown[]} reports
 * @returns {BenchmarkSummary}
 */
export function summarizeReports(reports) {
  if (!Array.isArray(reports) || reports.length === 0) {
    throw new RangeError('Expected at least one benchmark report');
  }

  const reference = validateSummaryReport(reports[0]);
  const modeOrder = modesFor(reference, reference.host);
  const methodology = Object.freeze(
    modeOrder.map((mode) =>
      Object.freeze({
        mode,
        boundary: boundaryForMode(reference, mode, reference.host),
      }),
    ),
  );
  const validatedReports = [reference];
  const seenHosts = new Set([reference.host]);

  for (let index = 1; index < reports.length; index += 1) {
    const candidateHost = hostNameOf(reports[index], index);
    let candidate;

    try {
      candidate = validateSummaryReport(reports[index]);
    } catch (error) {
      throw compatibilityError(reference.host, candidateHost, error);
    }

    if (seenHosts.has(candidate.host)) {
      throw new Error(
        `Incompatible benchmark reports for ${reference.host} and ${candidate.host}: duplicate host ${candidate.host}`,
      );
    }

    assertCompatible(reference, candidate);
    seenHosts.add(candidate.host);
    validatedReports.push(candidate);
  }

  /** @type {AggregateRow[]} */
  const aggregate = [];
  /** @type {WorkloadRow[]} */
  const workloads = [];

  for (const report of validatedReports) {
    /** @type {Map<'cold' | 'steady', number>} */
    const aggregateByMode = new Map(
      modeOrder.map((mode) => [
        mode,
        geometricMean(
          report.results
            .filter((result) => result.mode === mode)
            .map((result) => result.slowdown),
        ),
      ]),
    );
    /** @type {Map<string, HostResult>} */
    const resultsByPair = new Map(
      report.results.map((result) => [
        `${result.workload}:${result.mode}`,
        result,
      ]),
    );

    for (const mode of modeOrder) {
      const geometricMeanSlowdown = aggregateValueForMode(
        aggregateByMode,
        mode,
        report.host,
      );
      aggregate.push(
        Object.freeze({
          runId: report.runId,
          generatedAt: report.generatedAt,
          host: report.host,
          version: report.version,
          mode,
          geometricMeanSlowdown,
        }),
      );
    }

    for (const workload of reference.config.workloads) {
      for (const mode of modeOrder) {
        const result = resultsByPair.get(`${workload.name}:${mode}`);

        if (result === undefined) {
          throw new Error(
            `Missing benchmark result for ${report.host} ${workload.name} ${mode}`,
          );
        }

        const geometricMeanSlowdown = aggregateValueForMode(
          aggregateByMode,
          mode,
          report.host,
        );

        workloads.push(
          Object.freeze({
            runId: report.runId,
            generatedAt: report.generatedAt,
            host: report.host,
            version: report.version,
            mode,
            workload: workload.name,
            geometricMeanSlowdown,
            slowdown: result.slowdown,
            checksum: result.checksum,
            nativeMedianMs: result.lanes.native.summary.median,
            nativeP95Ms: result.lanes.native.summary.p95,
            nativeCoefficientOfVariation:
              result.lanes.native.summary.coefficientOfVariation,
            nativeBatchSize: result.lanes.native.batchSize,
            jsjsMedianMs: result.lanes.jsjs.summary.median,
            jsjsP95Ms: result.lanes.jsjs.summary.p95,
            jsjsCoefficientOfVariation:
              result.lanes.jsjs.summary.coefficientOfVariation,
            jsjsBatchSize: result.lanes.jsjs.batchSize,
            boundary: result.boundary,
          }),
        );
      }
    }
  }

  return Object.freeze({
    schemaVersion: REPORT_SCHEMA_VERSION,
    runId: reference.runId,
    generatedAt: reference.generatedAt,
    hosts: Object.freeze(validatedReports.map((report) => report.host)),
    hostMetadata: Object.freeze(
      validatedReports.map((report) =>
        Object.freeze({
          host: report.host,
          version: report.version,
          generatedAt: report.generatedAt,
          runId: report.runId,
        }),
      ),
    ),
    config: reference.config,
    methodology,
    aggregate: Object.freeze(aggregate),
    workloads: Object.freeze(workloads),
  });
}

/**
 * @param {BenchmarkSummary} summary
 * @returns {string}
 */
export function summaryToCsv(summary) {
  const rows = summary.workloads.map((row) =>
    CSV_COLUMNS.map((column) => formatCsvCell(csvCell(row, column))).join(','),
  );

  return `${CSV_COLUMNS.join(',')}\n${rows.join('\n')}\n`;
}

/**
 * @param {string} inputDirectory
 * @param {string} outputDirectory
 * @returns {Promise<ReturnType<typeof summarizeReports>>}
 */
export async function summarizeReportDirectory(
  inputDirectory,
  outputDirectory,
) {
  const inputDirectoryUrl = resolveOutputDirectory(inputDirectory);
  const fileNames = (await readdir(inputDirectoryUrl))
    .filter(
      (fileName) => fileName.endsWith('.json') && fileName !== 'summary.json',
    )
    .sort(compareCodeUnitLexically);

  if (fileNames.length === 0) {
    throw new Error(
      `No benchmark host reports found in ${inputDirectory} (expected *.json excluding summary.json)`,
    );
  }

  const reports = [];

  for (const fileName of fileNames) {
    const fileUrl = new URL(fileName, inputDirectoryUrl);
    reports.push(JSON.parse(await readFile(fileUrl, 'utf8')));
  }

  const summary = summarizeReports(reports);

  await writeOutputFile(
    outputDirectory,
    'summary.json',
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  await writeOutputFile(outputDirectory, 'summary.csv', summaryToCsv(summary));

  return summary;
}

/**
 * @param {HostReport} report
 * @param {string} host
 * @returns {readonly ('cold' | 'steady')[]}
 */
function modesFor(report, host) {
  const modes = [];
  const seenModes = new Set();

  for (const result of report.results) {
    if (!seenModes.has(result.mode)) {
      seenModes.add(result.mode);
      modes.push(result.mode);
    }
  }

  if (modes.length === 0) {
    throw new Error(`Benchmark report for ${host} has no result modes`);
  }

  return /** @type {readonly ('cold' | 'steady')[]} */ (Object.freeze(modes));
}

/**
 * @param {HostReport} report
 * @param {'cold' | 'steady'} mode
 * @param {string} host
 * @returns {string}
 */
function boundaryForMode(report, mode, host) {
  let boundary = null;

  for (const result of report.results) {
    if (result.mode !== mode) {
      continue;
    }

    if (boundary === null) {
      boundary = result.boundary;
      continue;
    }

    if (result.boundary !== boundary) {
      throw new Error(
        `Benchmark report for ${host} has inconsistent methodology for mode ${mode}`,
      );
    }
  }

  if (boundary === null) {
    throw new Error(`Benchmark report for ${host} is missing mode ${mode}`);
  }

  return boundary;
}

/**
 * @param {HostReport} reference
 * @param {HostReport} candidate
 * @returns {void}
 */
function assertCompatible(reference, candidate) {
  assertSameValue(
    reference.host,
    candidate.host,
    'runId',
    candidate.runId,
    reference.runId,
  );
  assertSameValue(
    reference.host,
    candidate.host,
    'generatedAt',
    candidate.generatedAt,
    reference.generatedAt,
  );
  assertSameValue(
    reference.host,
    candidate.host,
    'schemaVersion',
    candidate.schemaVersion,
    reference.schemaVersion,
  );
  assertSameValue(
    reference.host,
    candidate.host,
    'config.profile',
    candidate.config.profile,
    reference.config.profile,
  );
  assertSameValue(
    reference.host,
    candidate.host,
    'config.warmups',
    candidate.config.warmups,
    reference.config.warmups,
  );
  assertSameValue(
    reference.host,
    candidate.host,
    'config.samples',
    candidate.config.samples,
    reference.config.samples,
  );
  assertSameValue(
    reference.host,
    candidate.host,
    'config.targetSampleMs',
    candidate.config.targetSampleMs,
    reference.config.targetSampleMs,
  );
  assertSameValue(
    reference.host,
    candidate.host,
    'config.maxBatchSize',
    candidate.config.maxBatchSize,
    reference.config.maxBatchSize,
  );
  assertSameValue(
    reference.host,
    candidate.host,
    'config.workloads.length',
    candidate.config.workloads.length,
    reference.config.workloads.length,
  );
  assertSameValue(
    reference.host,
    candidate.host,
    'results.length',
    candidate.results.length,
    reference.results.length,
  );

  for (let index = 0; index < reference.config.workloads.length; index += 1) {
    const referenceWorkload = reference.config.workloads[index];
    const candidateWorkload = candidate.config.workloads[index];

    assertSameValue(
      reference.host,
      candidate.host,
      `config.workloads[${index}].name`,
      candidateWorkload.name,
      referenceWorkload.name,
    );
    assertSameValue(
      reference.host,
      candidate.host,
      `config.workloads[${index}].source`,
      candidateWorkload.source,
      referenceWorkload.source,
    );
    assertSameValue(
      reference.host,
      candidate.host,
      `config.workloads[${index}].expectedChecksum`,
      candidateWorkload.expectedChecksum,
      referenceWorkload.expectedChecksum,
    );
  }

  for (let index = 0; index < reference.results.length; index += 1) {
    const referenceResult = reference.results[index];
    const candidateResult = candidate.results[index];

    assertSameValue(
      reference.host,
      candidate.host,
      `results[${index}].workload`,
      candidateResult.workload,
      referenceResult.workload,
    );
    assertSameValue(
      reference.host,
      candidate.host,
      `results[${index}].mode`,
      candidateResult.mode,
      referenceResult.mode,
    );
    assertSameValue(
      reference.host,
      candidate.host,
      `results[${index}].boundary`,
      candidateResult.boundary,
      referenceResult.boundary,
    );
    assertSameValue(
      reference.host,
      candidate.host,
      `results[${index}].checksum`,
      candidateResult.checksum,
      referenceResult.checksum,
    );
  }
}

/**
 * @param {Map<'cold' | 'steady', number>} aggregateByMode
 * @param {'cold' | 'steady'} mode
 * @param {string} host
 * @returns {number}
 */
function aggregateValueForMode(aggregateByMode, mode, host) {
  const geometricMeanSlowdown = aggregateByMode.get(mode);

  if (geometricMeanSlowdown === undefined) {
    throw new Error(`Missing aggregate slowdown for ${host} mode ${mode}`);
  }

  return geometricMeanSlowdown;
}

/**
 * @param {string} referenceHost
 * @param {string} candidateHost
 * @param {unknown} error
 * @returns {Error}
 */
function compatibilityError(referenceHost, candidateHost, error) {
  const message = error instanceof Error ? error.message : String(error);

  return new Error(
    `Incompatible benchmark reports for ${referenceHost} and ${candidateHost}: ${message}`,
  );
}

/**
 * @param {unknown} report
 * @param {number} index
 * @returns {string}
 */
function hostNameOf(report, index) {
  if (
    typeof report === 'object' &&
    report !== null &&
    'host' in report &&
    typeof report.host === 'string' &&
    report.host.length > 0
  ) {
    return report.host;
  }

  return `report[${index}]`;
}

/**
 * @param {string} referenceHost
 * @param {string} candidateHost
 * @param {string} path
 * @param {unknown} actual
 * @param {unknown} expected
 * @returns {void}
 */
function assertSameValue(referenceHost, candidateHost, path, actual, expected) {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Incompatible benchmark reports for ${referenceHost} and ${candidateHost}: ${path} differs (${String(actual)} !== ${String(expected)})`,
    );
  }
}

/**
 * @param {WorkloadRow} row
 * @param {CsvColumn} column
 * @returns {string | number}
 */
function csvCell(row, column) {
  return row[column];
}

/**
 * @param {unknown} report
 * @returns {HostReport}
 */
function validateSummaryReport(report) {
  return /** @type {HostReport} */ (validateHostReport(report));
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
export function compareCodeUnitLexically(left, right) {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatCsvCell(value) {
  if (typeof value === 'string') {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return String(value);
}
