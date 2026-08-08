import { assertSame, assertThrows } from '../harness/assert.js';
import { resolveBenchmarkConfig } from '../../benchmark/config.js';
import * as benchmarkHost from '../../benchmark/host.js';
import { monotonicNowFrom } from '../../benchmark/host.js';
import {
  contentTypeOf,
  parseChromiumReport,
  resolveRepositoryPath,
} from '../../benchmark/run-browser.js';
import { runNodeBenchmark } from '../../benchmark/run-node.js';
import {
  createJscPrelude,
  discoverJscRuntimeIdentity,
  jscSetupError,
  parseJscReport,
  runJscBenchmark,
} from '../../benchmark/spawn-jsc.js';

const SOURCE = Object.freeze({
  gitCommit: '0123456789abcdef0123456789abcdef01234567',
  gitDirty: false,
});

/**
 * @param {{
 *   results: readonly {
 *     workload: string,
 *     mode: 'cold' | 'steady',
 *     checksum: number,
 *     lanes: {
 *       native: { samplesMs: readonly number[] },
 *       jsjs: { samplesMs: readonly number[] },
 *     },
 *   }[],
 * }} report
 * @param {'cold' | 'steady'} mode
 * @returns {{
 *   workload: string,
 *   mode: 'cold' | 'steady',
 *   checksum: number,
 *   lanes: {
 *     native: { samplesMs: readonly number[] },
 *     jsjs: { samplesMs: readonly number[] },
 *   },
 * }}
 */
function findResult(report, mode) {
  const result = report.results.find((entry) => entry.mode === mode);

  if (result === undefined) {
    throw new Error(`Missing benchmark result for mode ${mode}`);
  }

  return result;
}

const tests = [
  {
    name: 'node benchmark host returns validated smoke report for one workload',
    async run() {
      const config = resolveBenchmarkConfig({
        profile: 'smoke',
        workloads: ['arithmetic-loops'],
      });
      const report = await runNodeBenchmark(config, { source: SOURCE });
      const cold = findResult(report, 'cold');
      const steady = findResult(report, 'steady');

      assertSame(report.host, 'node');
      assertSame(report.version, process.version);
      assertSame(typeof report.runId, 'string');
      assertSame(report.runId.length > 0, true);
      assertSame(report.results.length, 2);
      assertSame(cold.workload, 'arithmetic-loops');
      assertSame(steady.workload, 'arithmetic-loops');
      assertSame(cold.checksum, config.workloads[0].expectedChecksum);
      assertSame(steady.checksum, config.workloads[0].expectedChecksum);
      assertSame(cold.lanes.native.samplesMs.length, 3);
      assertSame(cold.lanes.jsjs.samplesMs.length, 3);
      assertSame(steady.lanes.native.samplesMs.length, 3);
      assertSame(steady.lanes.jsjs.samplesMs.length, 3);
    },
  },
  {
    name: 'node benchmark rejects cold samples from a stalled performance clock',
    async run() {
      const config = resolveBenchmarkConfig({
        profile: 'smoke',
        warmups: 1,
        samples: 1,
        maxBatchSize: 1,
        workloads: ['arithmetic-loops'],
      });
      let error;

      try {
        await runNodeBenchmark(config, {
          generatedAt: '2026-08-07T00:00:00.000Z',
          runId: 'node-clock-fixture',
          now: () => 7,
          source: SOURCE,
        });
      } catch (caught) {
        error = caught;
      }

      assertSame(
        error instanceof RangeError &&
          error.message.includes('node') &&
          error.message.includes('cold') &&
          error.message.includes('arithmetic-loops') &&
          error.message.includes('clock'),
        true,
      );
    },
  },
  {
    name: 'browser adapter exposes content types guards traversal and validates page reports',
    run() {
      const report = { host: 'chromium' };
      let validated = 0;

      assertSame(
        contentTypeOf('benchmark/run-browser-page.js'),
        'text/javascript; charset=utf-8',
      );
      assertSame(
        assertThrows(
          () => resolveRepositoryPath('/../package.json'),
          Error,
        ).message.includes('..'),
        true,
      );
      assertSame(
        parseChromiumReport(report, (value) => {
          validated += 1;
          return { validated: value };
        }).validated,
        report,
      );
      assertSame(validated, 1);
    },
  },
  {
    name: 'host error formatting preserves messages when stacks omit them',
    run() {
      const error = new Error(
        'jsc cold native arithmetic-loops checksum mismatch',
      );
      error.stack = 'measureBatch@benchmark/run.js:299:20';
      const formatHostError = /** @type {(error: unknown) => string} */ (
        /** @type {any} */ (benchmarkHost).formatHostError
      );

      assertSame(typeof formatHostError, 'function');
      const formatted = formatHostError(error);
      assertSame(formatted.includes(error.message), true);
      assertSame(formatted.includes(error.stack), true);
    },
  },
  {
    name: 'host monotonic clock wrapper advances even when the raw clock stalls',
    run() {
      const values = [7, 7, 7];
      const now = monotonicNowFrom(() => values.shift() ?? 7);
      const syntheticClockTicksFrom =
        /** @type {(clock: () => number) => number} */ (
          /** @type {any} */ (benchmarkHost).syntheticClockTicksFrom
        );

      assertSame(typeof syntheticClockTicksFrom, 'function');
      assertSame(now(), 7);
      assertSame(syntheticClockTicksFrom(now), 0);
      assertSame(now() > 7, true);
      assertSame(syntheticClockTicksFrom(now), 1);
      assertSame(now() > 7, true);
      assertSame(syntheticClockTicksFrom(now), 2);
    },
  },
  {
    name: 'jsc runtime identity prefers a discovered version and falls back to binary metadata',
    async run() {
      assertSame(
        await discoverJscRuntimeIdentity('jsc', {
          readVersion: async () => 'JavaScriptCore 620.1.1',
          readFallback: async () => '/opt/jsc mtimeMs=123',
        }),
        'JavaScriptCore 620.1.1',
      );
      assertSame(
        await discoverJscRuntimeIdentity('/opt/jsc', {
          readVersion: async () => '',
          readFallback: async () => '/opt/jsc mtimeMs=123',
        }),
        '/opt/jsc mtimeMs=123',
      );
      assertSame(
        await discoverJscRuntimeIdentity('/opt/jsc', {
          readVersion: async () => 'ERROR: invalid option: --version',
          readFallback: async () => '/opt/jsc mtimeMs=123',
        }),
        '/opt/jsc mtimeMs=123',
      );
      assertSame(
        await discoverJscRuntimeIdentity('/opt/jsc', {
          readVersion: async () => 'undefined',
          readFallback: async () => '/opt/jsc mtimeMs=123',
        }),
        '/opt/jsc mtimeMs=123',
      );
    },
  },
  {
    name: 'jsc adapter surfaces stderr when a zero-exit child emits no report',
    async run() {
      const config = resolveBenchmarkConfig({
        profile: 'smoke',
        warmups: 1,
        samples: 1,
        workloads: ['arithmetic-loops'],
      });
      let error;

      try {
        await runJscBenchmark(config, {
          command: '/fake/jsc',
          source: SOURCE,
          version: 'fake-jsc',
          spawnProcess: createFakeJscProcess({
            stdout: '',
            stderr:
              'RangeError: jsc cold native arithmetic-loops clock did not advance measurably',
            code: 0,
          }),
        });
      } catch (caught) {
        error = caught;
      }

      assertSame(
        error instanceof Error &&
          error.message.includes('RangeError') &&
          error.message.includes('jsc') &&
          error.message.includes('cold') &&
          error.message.includes('native') &&
          error.message.includes('arithmetic-loops') &&
          error.message.includes('clock'),
        true,
      );
    },
  },
  {
    name: 'jsc adapter surfaces non-json stdout context from a zero-exit child',
    async run() {
      const config = resolveBenchmarkConfig({
        profile: 'smoke',
        warmups: 1,
        samples: 1,
        workloads: ['arithmetic-loops'],
      });
      let error;

      try {
        await runJscBenchmark(config, {
          command: '/fake/jsc',
          source: SOURCE,
          version: 'fake-jsc',
          spawnProcess: createFakeJscProcess({
            stdout: 'Error: jsc cold native arithmetic-loops checksum mismatch',
            stderr: '',
            code: 0,
          }),
        });
      } catch (caught) {
        error = caught;
      }

      assertSame(
        error instanceof Error &&
          error.message.includes('checksum mismatch') &&
          !error.message.includes('exactly one JSON report'),
        true,
      );
    },
  },
  {
    name: 'jsc adapter rejects malformed reports from a zero-exit child',
    async run() {
      const config = resolveBenchmarkConfig({
        profile: 'smoke',
        warmups: 1,
        samples: 1,
        workloads: ['arithmetic-loops'],
      });
      let error;

      try {
        await runJscBenchmark(config, {
          command: '/fake/jsc',
          source: SOURCE,
          version: 'fake-jsc',
          spawnProcess: createFakeJscProcess({
            stdout: '{"host":"jsc"}\n',
            stderr: '',
            code: 0,
          }),
        });
      } catch (caught) {
        error = caught;
      }

      assertSame(
        error instanceof TypeError && error.message.includes('schemaVersion'),
        true,
      );
    },
  },
  {
    name: 'jsc adapter rejects invalid stdout and validates parsed reports',
    run() {
      let validated = 0;

      assertSame(
        assertThrows(() => parseJscReport('not json\n'), Error).message,
        'jsc stdout: not json',
      );
      assertSame(
        assertThrows(
          () => parseJscReport('{"host":"jsc"}\nextra output\n'),
          Error,
        ).message.includes('stdout'),
        true,
      );
      assertSame(
        jscSetupError({ code: 'ENOENT' }).message.includes(
          '/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers',
        ),
        true,
      );
      assertSame(
        assertThrows(
          () =>
            createJscPrelude(
              {
                profile: 'smoke',
                warmups: 1,
                samples: 1,
                targetSampleMs: 1,
                maxBatchSize: 1,
                workloads: [],
                separator: '\u2028',
              },
              {
                generatedAt: '2026-08-07T00:00:00.000Z',
                runId: 'jsc-fixture',
                version: 'jsc',
              },
            ),
          RangeError,
        ).message.includes('U+2028'),
        true,
      );
      assertSame(
        parseJscReport('{"host":"jsc"}\n', (value) => {
          validated += 1;
          if (
            typeof value !== 'object' ||
            value === null ||
            !('host' in value) ||
            typeof value.host !== 'string'
          ) {
            throw new TypeError('Expected parsed jsc report host');
          }

          return { validated: { host: value.host } };
        }).validated.host,
        'jsc',
      );
      assertSame(validated, 1);
    },
  },
];

/**
 * @param {{ stdout: string, stderr: string, code: number }} result
 * @returns {typeof import('node:child_process').spawn}
 */
function createFakeJscProcess(result) {
  return /** @type {typeof import('node:child_process').spawn} */ (
    () => {
      /** @type {Record<string, ((...args: any[]) => void)[]>} */
      const childListeners = {};
      /** @type {Record<string, ((...args: any[]) => void)[]>} */
      const stdoutListeners = {};
      /** @type {Record<string, ((...args: any[]) => void)[]>} */
      const stderrListeners = {};
      /**
       * @param {Record<string, ((...args: any[]) => void)[]>} listeners
       */
      const stream = (listeners) => ({
        setEncoding() {},
        /**
         * @param {string} event
         * @param {(...args: any[]) => void} listener
         */
        on(event, listener) {
          if (listeners[event] === undefined) {
            listeners[event] = [];
          }
          listeners[event].push(listener);
          return this;
        },
      });
      const child = {
        stdout: stream(stdoutListeners),
        stderr: stream(stderrListeners),
        /**
         * @param {string} event
         * @param {(...args: any[]) => void} listener
         */
        on(event, listener) {
          if (childListeners[event] === undefined) {
            childListeners[event] = [];
          }
          childListeners[event].push(listener);
          if (event === 'close') {
            Promise.resolve().then(() => {
              for (const dataListener of stdoutListeners.data ?? []) {
                dataListener(result.stdout);
              }
              for (const dataListener of stderrListeners.data ?? []) {
                dataListener(result.stderr);
              }
              listener(result.code, null);
            });
          }
          return this;
        },
      };

      return child;
    }
  );
}

export default tests;
