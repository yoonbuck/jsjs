import { workloadsForProfile } from '../workloads.js';

/** @type {readonly string[]} */
const VALID_HOSTS = Object.freeze(['node', 'chromium', 'jsc']);
/** @type {readonly string[]} */
const VALID_MODES = Object.freeze(['cold', 'steady']);
/** @type {readonly string[]} */
const VALID_METRICS = Object.freeze(['cpu', 'allocation']);

const PROFILE_OPTIONS = new Set([
  'host',
  'workload',
  'mode',
  'metric',
  'warmups',
  'iterations',
  'sampling-interval',
  'output',
]);

const DEFAULT_OUTPUT_DIRECTORY = '.benchmark-results';

/**
 * @param {readonly string[]} args
 * @returns {{
 *   host: string,
 *   workload: string,
 *   mode: 'cold' | 'steady',
 *   metrics: readonly string[],
 *   warmups: number,
 *   iterations: number,
 *   samplingInterval: number,
 *   outputDirectory: string,
 * }}
 */
export function parseProfileArguments(args) {
  /** @type {string | undefined} */
  let host;
  /** @type {string | undefined} */
  let workload;
  /** @type {string | undefined} */
  let mode;
  /** @type {string[]} */
  const metrics = [];
  /** @type {number | undefined} */
  let warmups;
  /** @type {number | undefined} */
  let iterations;
  let samplingInterval = 100;
  let outputDirectory = DEFAULT_OUTPUT_DIRECTORY;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith('--')) {
      throw new Error(`Unknown positional argument: ${arg}`);
    }

    const eqIndex = arg.indexOf('=');
    const optionName = eqIndex === -1 ? arg.slice(2) : arg.slice(2, eqIndex);
    const optionValue =
      eqIndex !== -1
        ? arg.slice(eqIndex + 1)
        : (() => {
            const next = args[index + 1];
            if (next === undefined || next.startsWith('--')) {
              throw new Error(`Missing value for --${optionName}`);
            }
            index += 1;
            return next;
          })();

    if (!PROFILE_OPTIONS.has(optionName)) {
      throw new Error(`Unknown option: --${optionName}`);
    }

    switch (optionName) {
      case 'host':
        host = optionValue;
        break;
      case 'workload':
        workload = optionValue;
        break;
      case 'mode':
        mode = optionValue;
        break;
      case 'metric':
        metrics.push(optionValue);
        break;
      case 'warmups':
        warmups = numericOptionValue(optionValue, 'warmups');
        break;
      case 'iterations':
        iterations = numericOptionValue(optionValue, 'iterations');
        break;
      case 'sampling-interval':
        samplingInterval = numericOptionValue(optionValue, 'sampling-interval');
        break;
      case 'output':
        outputDirectory = optionValue;
        break;
      default:
        throw new Error(`Unknown option: --${optionName}`);
    }
  }

  if (host === undefined) {
    throw new Error('--host is required');
  }

  if (!VALID_HOSTS.includes(host)) {
    throw new RangeError(
      `Unknown profile host: ${host} (expected one of: ${VALID_HOSTS.join(', ')})`,
    );
  }

  if (workload === undefined) {
    throw new Error('--workload is required');
  }

  validateWorkloadName(workload);

  if (mode === undefined) {
    throw new Error('--mode is required');
  }

  if (!VALID_MODES.includes(mode)) {
    throw new RangeError(
      `Unknown profile mode: ${mode} (expected one of: ${VALID_MODES.join(', ')})`,
    );
  }

  if (metrics.length === 0) {
    throw new Error('At least one --metric is required');
  }

  for (const metric of metrics) {
    if (!VALID_METRICS.includes(metric)) {
      throw new RangeError(
        `Unknown metric: ${metric} (expected one of: ${VALID_METRICS.join(', ')})`,
      );
    }
  }

  if (warmups === undefined) {
    throw new Error('--warmups is required');
  }

  if (iterations === undefined) {
    throw new Error('--iterations is required');
  }

  validateOutputDirectory(outputDirectory);

  return Object.freeze({
    host,
    workload,
    mode: /** @type {'cold' | 'steady'} */ (mode),
    metrics: Object.freeze(metrics),
    warmups,
    iterations,
    samplingInterval,
    outputDirectory,
  });
}

/**
 * @param {string} name
 * @returns {void}
 */
function validateWorkloadName(name) {
  const allWorkloads = workloadsForProfile('default');

  if (!allWorkloads.some((w) => w.name === name)) {
    throw new RangeError(
      `Unknown workload: ${name} (expected one of: ${allWorkloads.map((w) => w.name).join(', ')})`,
    );
  }
}

/**
 * @param {string} outputDirectory
 * @returns {void}
 */
function validateOutputDirectory(outputDirectory) {
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) {
    throw new TypeError('Profile output directory must be a non-empty string');
  }

  if (
    outputDirectory.startsWith('/') ||
    outputDirectory.startsWith('\\') ||
    /^[A-Za-z]:/.test(outputDirectory)
  ) {
    throw new RangeError(
      `Profile output directory must be repository-relative, not absolute: ${outputDirectory}`,
    );
  }

  const normalized = outputDirectory.replace(/\\/g, '/');

  if (normalized.split('/').some((part) => part === '..')) {
    throw new RangeError(
      `Profile output directory must not escape the repository: ${outputDirectory}`,
    );
  }
}

/**
 * @param {string} value
 * @param {string} name
 * @returns {number}
 */
function numericOptionValue(value, name) {
  const n = Number(value);

  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError(`--${name} must be a positive integer, got: ${value}`);
  }

  return n;
}
