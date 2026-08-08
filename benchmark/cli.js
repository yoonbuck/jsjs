import { pathToFileURL } from 'node:url';
import { resolveBenchmarkConfig } from './config.js';
import { writeHostReport, resolveOutputDirectory } from './output.js';
import { runChromiumBenchmark } from './run-browser.js';
import { runJscBenchmark } from './spawn-jsc.js';
import { runNodeBenchmark } from './run-node.js';
import { summarizeReportDirectory } from './summarize.js';

/**
 * @typedef {'node' | 'chromium' | 'jsc'} BenchmarkHost
 */

const DEFAULT_OUTPUT_DIRECTORY = '.benchmark-results';
/** @type {readonly BenchmarkHost[]} */
const ALL_HOSTS = Object.freeze(['node', 'chromium', 'jsc']);
const RUN_OPTIONS = new Set([
  'host',
  'profile',
  'workload',
  'warmups',
  'samples',
  'target-sample-ms',
  'max-batch-size',
  'output',
]);
const SUMMARY_OPTIONS = new Set(['input', 'output']);

const DEFAULT_RUNNERS = Object.freeze({
  node: runNodeBenchmark,
  chromium: runChromiumBenchmark,
  jsc: runJscBenchmark,
});

if (isMain(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => {
    process.exitCode = 1;
    process.stdout.write(`${formatError(error)}\n`);
  });
}

/**
 * @param {readonly string[]} argv
 * @returns {{
 *   command: 'run',
 *   hosts: readonly BenchmarkHost[],
 *   outputDirectory: string,
 *   config: {
 *     profile?: string,
 *     workloads?: string[],
 *     warmups?: number,
 *     samples?: number,
 *     targetSampleMs?: number,
 *     maxBatchSize?: number,
 *   },
 * } | {
 *   command: 'summary',
 *   inputDirectory: string,
 *   outputDirectory: string,
 * }}
 */
export function parseBenchmarkArguments(argv) {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new Error('Missing benchmark command');
  }

  const [command, ...argumentsList] = argv;

  switch (command) {
    case 'run':
      return parseRunArguments(argumentsList);
    case 'summary':
      return parseSummaryArguments(argumentsList);
    default:
      throw new Error(`Unknown benchmark command: ${command}`);
  }
}

/**
 * @param {readonly string[]} argumentsList
 * @returns {{
 *   command: 'run',
 *   hosts: readonly ('node' | 'chromium' | 'jsc')[],
 *   outputDirectory: string,
 *   config: {
 *     profile?: string,
 *     workloads?: string[],
 *     warmups?: number,
 *     samples?: number,
 *     targetSampleMs?: number,
 *     maxBatchSize?: number,
 *   },
 * }}
 */
function parseRunArguments(argumentsList) {
  /** @type {(BenchmarkHost | 'all')[]} */
  const selectedHosts = [];
  /** @type {{
   *   profile?: string,
   *   workloads?: string[],
   *   warmups?: number,
   *   samples?: number,
   *   targetSampleMs?: number,
   *   maxBatchSize?: number,
   * }}
   */
  const config = {};
  let outputDirectory = DEFAULT_OUTPUT_DIRECTORY;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];

    if (!argument.startsWith('--')) {
      throw new Error(`Unknown positional argument: ${argument}`);
    }

    const optionName = optionNameOf(argument);

    if (!RUN_OPTIONS.has(optionName)) {
      throw new Error(`Unknown option: --${optionName}`);
    }

    const option = readOption(argumentsList, index);

    index = option.nextIndex;

    switch (option.name) {
      case 'host':
        addHost(selectedHosts, option.value);
        break;
      case 'profile':
        config.profile = option.value;
        break;
      case 'workload':
        if (config.workloads === undefined) {
          config.workloads = [];
        }

        config.workloads.push(option.value);
        break;
      case 'warmups':
        config.warmups = numericOptionValue(option.value, 'warmups');
        break;
      case 'samples':
        config.samples = numericOptionValue(option.value, 'samples');
        break;
      case 'target-sample-ms':
        config.targetSampleMs = numericOptionValue(
          option.value,
          'target-sample-ms',
        );
        break;
      case 'max-batch-size':
        config.maxBatchSize = numericOptionValue(
          option.value,
          'max-batch-size',
        );
        break;
      case 'output':
        outputDirectory = option.value;
        break;
      default:
        throw new Error(`Unknown option: --${option.name}`);
    }
  }

  if (selectedHosts.length === 0) {
    throw new Error('At least one --host option is required');
  }

  resolveOutputDirectory(outputDirectory);

  return {
    command: 'run',
    hosts: normalizeHosts(selectedHosts),
    outputDirectory,
    config,
  };
}

/**
 * @param {readonly string[]} argumentsList
 * @returns {{
 *   command: 'summary',
 *   inputDirectory: string,
 *   outputDirectory: string,
 * }}
 */
function parseSummaryArguments(argumentsList) {
  /** @type {string | undefined} */
  let inputDirectory;
  /** @type {string | undefined} */
  let outputDirectory;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];

    if (!argument.startsWith('--')) {
      throw new Error(`Unknown positional argument: ${argument}`);
    }

    const optionName = optionNameOf(argument);

    if (!SUMMARY_OPTIONS.has(optionName)) {
      throw new Error(`Unknown option: --${optionName}`);
    }

    const option = readOption(argumentsList, index);

    index = option.nextIndex;

    switch (option.name) {
      case 'input':
        inputDirectory = option.value;
        break;
      case 'output':
        outputDirectory = option.value;
        break;
      default:
        throw new Error(`Unknown option: --${option.name}`);
    }
  }

  if (inputDirectory === undefined) {
    throw new Error('At least one --input option is required');
  }

  resolveOutputDirectory(inputDirectory);
  resolveOutputDirectory(outputDirectory ?? inputDirectory);

  return {
    command: 'summary',
    inputDirectory,
    outputDirectory: outputDirectory ?? inputDirectory,
  };
}

/**
 * @param {readonly string[]} argv
 * @param {{
 *   resolveConfig?: typeof resolveBenchmarkConfig,
 *   runners?: Readonly<Record<BenchmarkHost, (config: ReturnType<typeof resolveBenchmarkConfig>) => Promise<unknown>>>,
 *   writeReport?: typeof writeHostReport,
 *   summarizeDirectory?: typeof summarizeReportDirectory,
 * }} [options]
 * @returns {Promise<unknown[] | Awaited<ReturnType<typeof summarizeReportDirectory>>>}
 */
export async function main(argv, options = {}) {
  const parsed = parseBenchmarkArguments(argv);
  if (parsed.command === 'summary') {
    const summarizeDirectory =
      options.summarizeDirectory ?? summarizeReportDirectory;

    return summarizeDirectory(parsed.inputDirectory, parsed.outputDirectory);
  }

  const resolveConfig = options.resolveConfig ?? resolveBenchmarkConfig;
  const runners = options.runners ?? DEFAULT_RUNNERS;
  const writeReport = options.writeReport ?? writeHostReport;
  const config = resolveConfig(parsed.config);
  /** @type {unknown[]} */
  const reports = [];

  for (const host of parsed.hosts) {
    const runHost = runners[host];

    if (typeof runHost !== 'function') {
      throw new Error(`Missing benchmark host runner: ${host}`);
    }

    const report = await runHost(config);

    await writeReport(parsed.outputDirectory, report);
    reports.push(report);
  }

  return reports;
}

/**
 * @param {readonly string[]} argumentsList
 * @param {number} index
 * @returns {{ name: string, value: string, nextIndex: number }}
 */
function readOption(argumentsList, index) {
  const argument = argumentsList[index];
  const separatorIndex = argument.indexOf('=');

  if (separatorIndex >= 0) {
    const name = argument.slice(2, separatorIndex);
    const value = argument.slice(separatorIndex + 1);

    if (value.length === 0) {
      throw new Error(`Missing value for --${name}`);
    }

    return { name, value, nextIndex: index };
  }

  const name = argument.slice(2);
  const value = argumentsList[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for --${name}`);
  }

  return { name, value, nextIndex: index + 1 };
}

/**
 * @param {(BenchmarkHost | 'all')[]} selectedHosts
 * @param {string} value
 * @returns {void}
 */
function addHost(selectedHosts, value) {
  if (!isBenchmarkHost(value) && value !== 'all') {
    throw new RangeError(`Unknown benchmark host: ${value}`);
  }

  if (selectedHosts.includes(value)) {
    throw new RangeError(`Duplicate benchmark host: ${value}`);
  }

  if (value === 'all') {
    if (selectedHosts.length > 0) {
      throw new RangeError(`Duplicate benchmark host: ${value}`);
    }

    selectedHosts.push('all');
    return;
  }

  if (selectedHosts.includes('all')) {
    throw new RangeError(`Duplicate benchmark host: ${value}`);
  }

  selectedHosts.push(value);
}

/**
 * @param {(BenchmarkHost | 'all')[]} selectedHosts
 * @returns {readonly BenchmarkHost[]}
 */
function normalizeHosts(selectedHosts) {
  if (selectedHosts.length === 1 && selectedHosts[0] === 'all') {
    return ALL_HOSTS;
  }

  /** @type {BenchmarkHost[]} */
  const concreteHosts = [];

  for (const host of selectedHosts) {
    if (!isBenchmarkHost(host)) {
      throw new TypeError(`Expected a concrete benchmark host, got ${host}`);
    }

    concreteHosts.push(host);
  }

  return Object.freeze(concreteHosts);
}

/**
 * @param {string} value
 * @param {string} field
 * @returns {number}
 */
function numericOptionValue(value, field) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new RangeError(`${field} must be a finite number`);
  }

  return number;
}

/**
 * @param {string} argument
 * @returns {string}
 */
function optionNameOf(argument) {
  const separatorIndex = argument.indexOf('=');

  return separatorIndex >= 0
    ? argument.slice(2, separatorIndex)
    : argument.slice(2);
}

/**
 * @param {string} value
 * @returns {value is BenchmarkHost}
 */
function isBenchmarkHost(value) {
  return ALL_HOSTS.includes(/** @type {BenchmarkHost} */ (value));
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
