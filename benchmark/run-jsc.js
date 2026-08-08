import { monotonicNowFrom, runtimeEngine } from './host.js';
import { runHostBenchmark } from './run.js';

const print = /** @type {(text: string) => void} */ (globalThis.print);
const quit = /** @type {((code?: number) => void) | undefined} */ (
  globalThis.quit
);

main().then(
  (report) => {
    print(JSON.stringify(report));
  },
  (error) => {
    print(String((error && error.stack) || error));

    if (typeof quit === 'function') {
      quit(1);
    }
  },
);

/**
 * @returns {Promise<unknown>}
 */
async function main() {
  const rawNow =
    typeof globalThis.performance?.now === 'function'
      ? globalThis.performance.now.bind(globalThis.performance)
      : Date.now;

  return runHostBenchmark({
    host: 'jsc',
    version:
      typeof globalThis.__jsjsBenchmarkVersion === 'string' &&
      globalThis.__jsjsBenchmarkVersion.length > 0
        ? globalThis.__jsjsBenchmarkVersion
        : 'jsc',
    now: monotonicNowFrom(rawNow),
    engine: runtimeEngine,
    config: globalThis.__jsjsBenchmarkConfig,
    generatedAt:
      typeof globalThis.__jsjsBenchmarkGeneratedAt === 'string' &&
      globalThis.__jsjsBenchmarkGeneratedAt.length > 0
        ? globalThis.__jsjsBenchmarkGeneratedAt
        : new Date().toISOString(),
  });
}
