import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateHostReport } from './report.js';

const REPOSITORY_ROOT_URL = new URL('../', import.meta.url);
let temporaryFileCounter = 0;

/**
 * @typedef {ReturnType<typeof import('./run.js').runHostBenchmark>} BenchmarkReport
 */

/**
 * @param {string} outputDirectory
 * @returns {URL}
 */
export function resolveOutputDirectory(outputDirectory) {
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) {
    throw new TypeError(
      'Benchmark output directory must be a non-empty string',
    );
  }

  if (path.isAbsolute(outputDirectory)) {
    throw new RangeError(
      `Benchmark output directory must be repository-relative, not absolute: ${outputDirectory}`,
    );
  }

  const directoryUrl = new URL(
    ensureTrailingSlash(outputDirectory),
    REPOSITORY_ROOT_URL,
  );

  if (
    !directoryUrl.href.startsWith(REPOSITORY_ROOT_URL.href) ||
    directoryUrl.href === REPOSITORY_ROOT_URL.href
  ) {
    throw new RangeError(
      `Benchmark output directory resolved outside repository: ${outputDirectory}`,
    );
  }

  return directoryUrl;
}

/**
 * @param {string} outputDirectory
 * @param {BenchmarkReport} report
 * @param {{
 *   validate?: (value: BenchmarkReport) => BenchmarkReport,
 * }} [options]
 * @returns {Promise<URL>}
 */
export async function writeHostReport(outputDirectory, report, options = {}) {
  const validate = options.validate ?? validateHostReport;
  const validatedReport = /** @type {BenchmarkReport} */ (validate(report));

  return writeOutputFile(
    outputDirectory,
    `${safeHostFileStem(validatedReport.host)}.json`,
    `${JSON.stringify(validatedReport, null, 2)}\n`,
  );
}

/**
 * Replaces the complete set of host-report JSON files only after every new
 * report has validated and reached a staging directory.
 *
 * @param {string} outputDirectory
 * @param {readonly BenchmarkReport[]} reports
 * @returns {Promise<readonly URL[]>}
 */
export async function writeHostReportsAtomically(outputDirectory, reports) {
  if (!Array.isArray(reports) || reports.length === 0) {
    throw new RangeError('Expected at least one benchmark host report');
  }

  const validatedReports = reports.map((report) => validateHostReport(report));
  const hostNames = validatedReports.map((report) => report.host);

  if (new Set(hostNames).size !== hostNames.length) {
    throw new RangeError('Benchmark host reports must have unique hosts');
  }

  const transactionId = `${process.pid}-${nextTemporaryFileCounter()}`;
  const stagingDirectory = `${outputDirectory}/.staging-${transactionId}`;
  const backupDirectory = `${outputDirectory}/.backup-${transactionId}`;
  const outputUrl = resolveOutputDirectory(outputDirectory);
  const stagingUrl = resolveOutputDirectory(stagingDirectory);
  const backupUrl = resolveOutputDirectory(backupDirectory);
  /** @type {string[]} */
  const backedUpFiles = [];
  /** @type {string[]} */
  const promotedFiles = [];

  await mkdir(outputUrl, { recursive: true });

  try {
    for (const report of validatedReports) {
      await writeHostReport(stagingDirectory, report);
    }

    await mkdir(backupUrl, { recursive: true });
    const existingHostFiles = (await readdir(outputUrl)).filter(
      (fileName) =>
        fileName !== 'summary.json' && /^[a-z0-9-]+\.json$/u.test(fileName),
    );

    for (const fileName of existingHostFiles) {
      await rename(new URL(fileName, outputUrl), new URL(fileName, backupUrl));
      backedUpFiles.push(fileName);
    }

    for (const report of validatedReports) {
      const fileName = `${safeHostFileStem(report.host)}.json`;
      await rename(new URL(fileName, stagingUrl), new URL(fileName, outputUrl));
      promotedFiles.push(fileName);
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

  return Object.freeze(
    validatedReports.map(
      (report) => new URL(`${safeHostFileStem(report.host)}.json`, outputUrl),
    ),
  );
}

/**
 * @param {string} outputDirectory
 * @param {string} fileName
 * @param {string} contents
 * @returns {Promise<URL>}
 */
export async function writeOutputFile(outputDirectory, fileName, contents) {
  const directoryUrl = resolveOutputDirectory(outputDirectory);
  const safeFileName = safeOutputFileName(fileName);
  const finalReportUrl = new URL(safeFileName, directoryUrl);
  const temporaryReportUrl = new URL(
    `${safeFileName}.tmp-${process.pid}-${nextTemporaryFileCounter()}`,
    directoryUrl,
  );

  if (typeof contents !== 'string') {
    throw new TypeError('Benchmark output contents must be a string');
  }

  await mkdir(directoryUrl, { recursive: true });

  try {
    await writeFile(temporaryReportUrl, contents, 'utf8');
    await rename(temporaryReportUrl, finalReportUrl);
  } catch (error) {
    await cleanupTemporaryFile(temporaryReportUrl);
    throw error;
  }

  return finalReportUrl;
}

/**
 * @param {string} value
 * @returns {string}
 */
function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

/**
 * @returns {number}
 */
function nextTemporaryFileCounter() {
  temporaryFileCounter += 1;
  return temporaryFileCounter;
}

/**
 * @param {string} host
 * @returns {string}
 */
function safeHostFileStem(host) {
  if (typeof host !== 'string' || !/^[a-z0-9-]+$/u.test(host)) {
    throw new RangeError(
      `Benchmark report host is not a safe file name: ${host}`,
    );
  }

  return host;
}

/**
 * @param {string} fileName
 * @returns {string}
 */
function safeOutputFileName(fileName) {
  if (
    typeof fileName !== 'string' ||
    !/^[a-z0-9-]+\.(json|csv)$/u.test(fileName)
  ) {
    throw new RangeError(`Benchmark output file name is not safe: ${fileName}`);
  }

  return fileName;
}

/**
 * @param {URL} fileUrl
 * @returns {Promise<void>}
 */
async function cleanupTemporaryFile(fileUrl) {
  try {
    await rm(fileUrl, { force: true });
  } catch {}
}
