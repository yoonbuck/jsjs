import { createJsjsExecutors } from '../executors.js';
export { parseProfileArguments } from './config.js';

/**
 * @param {() => number} execute
 * @param {number} expectedChecksum
 * @param {string} context
 * @returns {number}
 */
function invokeChecked(execute, expectedChecksum, context) {
  const checksum = execute();

  if (checksum !== expectedChecksum) {
    throw new Error(
      `${context} checksum mismatch: expected ${expectedChecksum}, got ${checksum}`,
    );
  }

  return checksum;
}

/**
 * @template {{ globalObject: object }} TRealm
 * @param {{
 *   workload: { name?: string, source: string, expectedChecksum: number },
 *   mode: 'cold' | 'steady',
 *   warmups: number,
 *   iterations: number,
 *   now: () => number,
 *   engine: {
 *     createRealm: () => TRealm,
 *     evaluateScript: (realm: TRealm, source: string) => { type: string, value: unknown },
 *   },
 * }} options
 * @returns {{
 *   runWarmups: () => void,
 *   runMeasured: () => { iterations: number, checksum: number },
 *   expectedChecksum: number,
 * }}
 */
export function createProfileTarget({
  workload,
  mode,
  warmups,
  iterations,
  now,
  engine,
}) {
  const executors = createJsjsExecutors(engine, workload);
  const execute = executors[mode];
  const workloadChecksum = workload.expectedChecksum;

  return Object.freeze({
    get expectedChecksum() {
      return workloadChecksum;
    },
    runWarmups() {
      for (let i = 0; i < warmups; i += 1) {
        invokeChecked(execute, workloadChecksum, `warmup ${i + 1}`);
      }
    },
    runMeasured() {
      let checksum = workloadChecksum;

      for (let i = 0; i < iterations; i += 1) {
        const start = now();
        checksum = invokeChecked(
          execute,
          workloadChecksum,
          `iteration ${i + 1}`,
        );
        const end = now();
        void start;
        void end;
      }

      return Object.freeze({ iterations, checksum });
    },
  });
}
