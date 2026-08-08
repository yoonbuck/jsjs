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
  const directoryUrl = resolveOutputDirectory(outputDirectory);
  const validatedReport = validate(report);
  const host = safeHostFileStem(validatedReport.host);
  const finalReportUrl = new URL(`${host}.json`, directoryUrl);
  const temporaryReportUrl = new URL(
    `${host}.json.tmp-${process.pid}-${nextTemporaryFileCounter()}`,
    directoryUrl,
  );

  await mkdir(directoryUrl, { recursive: true });

  try {
    await writeFile(
      temporaryReportUrl,
      `${JSON.stringify(validatedReport, null, 2)}\n`,
      'utf8',
    );
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
 * @param {URL} fileUrl
 * @returns {Promise<void>}
 */
async function cleanupTemporaryFile(fileUrl) {
  try {
    await rm(fileUrl, { force: true });
  } catch {}
}
