import { monotonicNowFrom, runtimeEngine } from './host.js';
import { runHostBenchmark } from './run.js';

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
 * @param {{ generatedAt?: string, runId?: string, version?: string }} [options]
 */
export function runBrowserPageBenchmark(config, options = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const rawNow =
    typeof globalThis.performance?.now === 'function'
      ? globalThis.performance.now.bind(globalThis.performance)
      : Date.now;

  return runHostBenchmark({
    host: 'chromium',
    version:
      typeof options.version === 'string' && options.version.length > 0
        ? options.version
        : (globalThis.navigator?.userAgent ?? 'chromium'),
    now: monotonicNowFrom(rawNow),
    engine: runtimeEngine,
    config,
    generatedAt,
    runId: options.runId ?? `chromium-${generatedAt}`,
  });
}
