import { performance } from 'node:perf_hooks';
import { monotonicNowFrom, runtimeEngine } from './host.js';
import { validateHostReport } from './report.js';
import { runHostBenchmark } from './run.js';
import { assertCleanSourceState } from './source-state.js';

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
 *   generatedAt?: string,
 *   runId?: string,
 *   now?: () => number,
 *   source?: { gitCommit: string, gitDirty: false },
 * }} [options]
 */
export async function runNodeBenchmark(config, options = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const source = assertCleanSourceState(options.source);
  const report = runHostBenchmark({
    host: 'node',
    version: process.version,
    now: monotonicNowFrom(options.now ?? performance.now.bind(performance)),
    engine: runtimeEngine,
    config,
    generatedAt,
    runId: options.runId ?? `node-${generatedAt}`,
    source,
  });

  return validateHostReport(report);
}
