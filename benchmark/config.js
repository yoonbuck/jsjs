import { workloadsForProfile } from './workloads.js';

/**
 * @typedef {{
 *   warmups: number,
 *   samples: number,
 *   targetSampleMs: number,
 *   maxBatchSize: number,
 * }} BenchmarkProfile
 */

/** @type {Readonly<Record<string, Readonly<BenchmarkProfile>>>} */
export const PROFILES = Object.freeze({
  default: Object.freeze({
    warmups: 3,
    samples: 9,
    targetSampleMs: 100,
    maxBatchSize: 1000000,
  }),
  smoke: Object.freeze({
    warmups: 1,
    samples: 3,
    targetSampleMs: 5,
    maxBatchSize: 10000,
  }),
});

/**
 * @param {{
 *   profile?: string,
 *   warmups?: number,
 *   samples?: number,
 *   targetSampleMs?: number,
 *   maxBatchSize?: number,
 *   workloads?: readonly string[],
 * }} [options]
 * @returns {{
 *   profile: string,
 *   warmups: number,
 *   samples: number,
 *   targetSampleMs: number,
 *   maxBatchSize: number,
 *   workloads: readonly { name: string, source: string, expectedChecksum: number }[],
 * }}
 */
export function resolveBenchmarkConfig(options = {}) {
  const profileName = options.profile ?? 'default';
  const profile = PROFILES[profileName];

  if (profile === undefined) {
    throw new RangeError(`Unknown benchmark profile: ${profileName}`);
  }

  const profileWorkloads = workloadsForProfile(profileName);
  const selectedNames =
    options.workloads === undefined
      ? profileWorkloads.map(({ name }) => name)
      : options.workloads;

  if (!Array.isArray(selectedNames) || selectedNames.length === 0) {
    throw new RangeError('Benchmark workloads must contain at least one name');
  }

  if (new Set(selectedNames).size !== selectedNames.length) {
    throw new RangeError('Benchmark workloads must not contain duplicates');
  }

  /** @type {Map<string, { name: string, source: string, expectedChecksum: number }>} */
  const workloadMap = new Map(
    profileWorkloads.map((workload) => [workload.name, workload]),
  );

  const workloads = Object.freeze(
    selectedNames.map((name) => {
      const workload = workloadMap.get(name);

      if (workload === undefined) {
        throw new RangeError(`Unknown benchmark workload: ${name}`);
      }

      return workload;
    }),
  );

  return Object.freeze({
    profile: profileName,
    warmups: positiveInteger(options.warmups ?? profile.warmups, 'warmups'),
    samples: positiveInteger(options.samples ?? profile.samples, 'samples'),
    targetSampleMs: positiveFinite(
      options.targetSampleMs ?? profile.targetSampleMs,
      'targetSampleMs',
    ),
    maxBatchSize: positiveInteger(
      options.maxBatchSize ?? profile.maxBatchSize,
      'maxBatchSize',
    ),
    workloads,
  });
}

/**
 * @param {number} value
 * @param {string} field
 * @returns {number}
 */
function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${field} must be a positive integer`);
  }

  return value;
}

/**
 * @param {number} value
 * @param {string} field
 * @returns {number}
 */
function positiveFinite(value, field) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${field} must be a positive finite number`);
  }

  return value;
}
