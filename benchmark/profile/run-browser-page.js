import { monotonicNowFrom, runtimeEngine } from '../host.js';
import { createProfileTarget } from './target.js';

/**
 * @param {{
 *   workload: { name?: string, source: string, expectedChecksum: number },
 *   mode: 'cold' | 'steady',
 *   warmups: number,
 *   iterations: number,
 * }} options
 * @returns {{
 *   runtimeVersion: string,
 *   expectedChecksum: number,
 *   elapsedMilliseconds: number,
 *   result: { iterations: number, checksum: number },
 * }}
 */
export function runBrowserProfilePage({
  workload,
  mode,
  warmups,
  iterations,
}) {
  const rawNow =
    typeof globalThis.performance?.now === 'function'
      ? globalThis.performance.now.bind(globalThis.performance)
      : Date.now;
  const now = monotonicNowFrom(rawNow);
  const target = createProfileTarget({
    workload,
    mode,
    warmups,
    iterations,
    now,
    engine: runtimeEngine,
  });

  target.runWarmups();
  const startedAt = now();
  const result = target.runMeasured();
  const finishedAt = now();

  return Object.freeze({
    runtimeVersion: globalThis.navigator?.userAgent ?? 'chromium',
    expectedChecksum: target.expectedChecksum,
    elapsedMilliseconds: finishedAt - startedAt,
    result,
  });
}
