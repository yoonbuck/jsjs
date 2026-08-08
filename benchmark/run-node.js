import { performance } from 'node:perf_hooks';
import { runtimeEngine } from './host.js';
import { validateHostReport } from './report.js';
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
 */
export async function runNodeBenchmark(config) {
  const report = runHostBenchmark({
    host: 'node',
    version: process.version,
    now: performance.now.bind(performance),
    engine: runtimeEngine,
    config,
    generatedAt: new Date().toISOString(),
  });

  return validateHostReport(report);
}
