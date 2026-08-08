import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateHostReport } from './report.js';

const REPOSITORY_ROOT_URL = new URL('../', import.meta.url);
let temporaryFileCounter = 0;

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
 * @template T
 * @param {string} outputDirectory
 * @param {T} report
 * @param {{
 *   validate?: (value: T) => T,
 * }} [options]
 * @returns {Promise<URL>}
 */
export async function writeHostReport(outputDirectory, report, options = {}) {
  const validate = options.validate ?? validateHostReport;
  const validatedReport = validate(report);

  return writeOutputFile(
    outputDirectory,
    `${safeHostFileStem(validatedReport.host)}.json`,
    `${JSON.stringify(validatedReport, null, 2)}\n`,
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
  if (typeof fileName !== 'string' || !/^[a-z0-9-]+\.(json|csv)$/u.test(fileName)) {
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
