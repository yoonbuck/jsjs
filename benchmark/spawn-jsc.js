import { spawn } from 'node:child_process';
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
 * }} [options]
 */
export function runJscBenchmark(config, options = {}) {
  const command = options.command ?? process.env.JSC ?? 'jsc';
  const spawnProcess = options.spawnProcess ?? spawn;
  const generatedAt = new Date().toISOString();
  const child = spawnProcess(
    command,
    [
      '-e',
      createJscPrelude(config, {
        generatedAt,
        version: options.version ?? 'jsc',
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
        const detail = stderr.trim() || stdout.trim();
        reject(
          new Error(
            detail.length > 0 ? detail : `jsc exited with status ${code}`,
          ),
        );
        return;
      }

      try {
        resolve(parseJscReport(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * @param {unknown} stdout
 * @param {(value: unknown) => unknown} [validate]
 */
export function parseJscReport(stdout, validate = validateHostReport) {
  const lines = String(stdout)
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0);

  if (lines.length !== 1) {
    throw new Error('jsc stdout must contain exactly one JSON report');
  }

  return validate(JSON.parse(lines[0]));
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
 * @param {{ generatedAt: string, version: string }} options
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
    `globalThis.__jsjsBenchmarkVersion = ${JSON.stringify(options.version)};`,
  ].join(' ');
}
