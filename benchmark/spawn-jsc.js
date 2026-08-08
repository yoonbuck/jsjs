import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateHostReport } from './report.js';

const JSC_PATH_HINT =
  '/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers';

/**
 * @param {{
 *   profile: string,
 *   warmups: number,
 *   samples: number,
 *   targetSampleMs: number,
 *   maxBatchSize: number,
 *   workloads: readonly {
 *     name: string,
 *     source: string,
 *     expectedChecksum: number,
 *   }[],
 * }} config
 * @param {{
 *   command?: string,
 *   spawnProcess?: typeof spawn,
 *   version?: string,
 *   generatedAt?: string,
 *   runId?: string,
 *   discoverIdentity?: typeof discoverJscRuntimeIdentity,
 * }} [options]
 */
export async function runJscBenchmark(config, options = {}) {
  const command = options.command ?? process.env.JSC ?? 'jsc';
  const spawnProcess = options.spawnProcess ?? spawn;
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const runId = options.runId ?? `jsc-${generatedAt}`;
  const discoverIdentity =
    options.discoverIdentity ?? discoverJscRuntimeIdentity;
  const version = options.version ?? (await discoverIdentity(command));
  const child = spawnProcess(
    command,
    [
      '-e',
      createJscPrelude(config, {
        generatedAt,
        runId,
        version,
      }),
      '-m',
      fileURLToPath(new URL('./run-jsc.js', import.meta.url)),
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      reject(jscSetupError(error));
    });
    child.on('close', (code, signal) => {
      if (signal !== null) {
        reject(new Error(`jsc terminated with signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(
          jscProcessError(stdout, stderr, `jsc exited with status ${code}`),
        );
        return;
      }

      try {
        resolve(parseJscReport(stdout, undefined, stderr));
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * @param {string} command
 * @param {{
 *   readVersion?: (command: string) => Promise<string>,
 *   readFallback?: (command: string) => Promise<string>,
 * }} [options]
 * @returns {Promise<string>}
 */
export async function discoverJscRuntimeIdentity(command, options = {}) {
  const readVersion = options.readVersion ?? readJscVersion;
  const readFallback = options.readFallback ?? readJscBinaryIdentity;
  const version = (await readVersion(command)).trim();

  return version.length > 0 &&
    version !== 'undefined' &&
    !/invalid option:\s*--version/iu.test(version)
    ? version
    : readFallback(command);
}

/**
 * @template T
 * @param {unknown} stdout
 * @param {(value: unknown) => T} [validate]
 * @param {unknown} [stderr]
 * @returns {T}
 */
export function parseJscReport(stdout, validate, stderr = '') {
  const parse =
    validate ?? /** @type {(value: unknown) => T} */ (validateHostReport);
  const stdoutText = String(stdout);
  const stderrText = String(stderr);
  const lines = stdoutText
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0);

  if (stderrText.trim().length > 0) {
    throw jscProcessError(stdoutText, stderrText, 'jsc emitted stderr');
  }

  if (lines.length !== 1) {
    throw jscProcessError(
      stdoutText,
      stderrText,
      'jsc stdout must contain exactly one JSON report',
    );
  }

  let report;

  try {
    report = JSON.parse(lines[0]);
  } catch {
    throw jscProcessError(stdoutText, stderrText, 'jsc emitted invalid JSON');
  }

  return parse(report);
}

/**
 * @param {unknown} stdout
 * @param {unknown} stderr
 * @param {string} fallback
 * @returns {Error}
 */
function jscProcessError(stdout, stderr, fallback) {
  const details = [];
  const stderrText = String(stderr).trim();
  const stdoutText = String(stdout).trim();

  if (stderrText.length > 0) {
    details.push(`jsc stderr: ${stderrText}`);
  }

  if (stdoutText.length > 0) {
    details.push(`jsc stdout: ${stdoutText}`);
  }

  return new Error(details.length > 0 ? details.join('\n') : fallback);
}

/**
 * @param {unknown} error
 * @returns {Error}
 */
export function jscSetupError(error) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  ) {
    return new Error(
      `jsc is unavailable; on macOS add ${JSC_PATH_HINT} to PATH`,
    );
  }

  return error instanceof Error ? error : new Error(String(error));
}

/**
 * @param {unknown} config
 * @param {{ generatedAt: string, runId: string, version: string }} options
 * @returns {string}
 */
export function createJscPrelude(config, options) {
  const configJson = JSON.stringify(config);

  if (configJson.includes('\u2028')) {
    throw new RangeError('JSC prelude JSON must not contain U+2028');
  }

  if (configJson.includes('\u2029')) {
    throw new RangeError('JSC prelude JSON must not contain U+2029');
  }

  return [
    `globalThis.__jsjsBenchmarkConfig = ${configJson};`,
    `globalThis.__jsjsBenchmarkGeneratedAt = ${JSON.stringify(options.generatedAt)};`,
    `globalThis.__jsjsBenchmarkRunId = ${JSON.stringify(options.runId)};`,
    `globalThis.__jsjsBenchmarkVersion = ${JSON.stringify(options.version)};`,
  ].join(' ');
}

/**
 * @param {string} command
 * @returns {Promise<string>}
 */
function readJscVersion(command) {
  return new Promise((resolve) => {
    const child = spawn(command, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', () => {
      if (!settled) {
        settled = true;
        resolve('');
      }
    });
    child.on('close', (code, signal) => {
      if (settled) {
        return;
      }

      settled = true;
      if (code !== 0 || signal !== null) {
        resolve('');
        return;
      }

      resolve(firstNonEmptyLine(stdout) || firstNonEmptyLine(stderr));
    });
  });
}

/**
 * @param {string} command
 * @returns {Promise<string>}
 */
async function readJscBinaryIdentity(command) {
  let executablePath;

  try {
    executablePath = await resolveExecutablePath(command);
  } catch (error) {
    throw jscSetupError(error);
  }

  const metadata = await stat(executablePath);
  return `${executablePath} mtimeMs=${metadata.mtimeMs}`;
}

/**
 * @param {string} command
 * @returns {Promise<string>}
 */
async function resolveExecutablePath(command) {
  const candidates =
    path.isAbsolute(command) || command.includes(path.sep)
      ? [path.resolve(command)]
      : (process.env.PATH ?? '')
          .split(path.delimiter)
          .filter((entry) => entry.length > 0)
          .map((entry) => path.join(entry, command));

  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return realpath(candidate);
    } catch {}
  }

  const error = new Error(`Unable to resolve jsc executable: ${command}`);
  Object.defineProperty(error, 'code', { value: 'ENOENT' });
  throw error;
}

/**
 * @param {string} text
 * @returns {string}
 */
function firstNonEmptyLine(text) {
  return (
    text
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ''
  );
}
