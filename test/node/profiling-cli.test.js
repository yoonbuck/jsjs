import { spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { assertSame } from '../harness/assert.js';
import { captureProtocolProfiles } from '../../benchmark/profile/protocol.js';
import { runNodeProfile } from '../../benchmark/profile/run-node.js';
import { runChromiumProfile } from '../../benchmark/profile/run-browser.js';
import { main as profileCliMain } from '../../benchmark/profile/cli.js';
import { workloadsForProfile } from '../../benchmark/workloads.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const TEST_OUTPUT_DIRECTORY = '.benchmark-results/test-profile-cli';
const CPU_PROFILE_FIXTURE = Object.freeze({
  nodes: [
    {
      id: 1,
      callFrame: { functionName: '(root)', url: '' },
      children: [2],
    },
    {
      id: 2,
      callFrame: {
        functionName: 'getProperty',
        url: 'src/runtime/object.js',
      },
    },
  ],
  samples: [2],
  timeDeltas: [7],
});
const ALLOCATION_PROFILE_FIXTURE = Object.freeze({
  head: {
    id: 1,
    callFrame: { functionName: '(root)', url: '' },
    selfSize: 0,
    children: [
      {
        id: 2,
        callFrame: {
          functionName: 'push',
          url: 'src/runtime/array-object.js',
        },
        selfSize: 32,
        children: [],
      },
    ],
  },
});

/** @type {import('../harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'captureProtocolProfiles starts requested metrics stops them and disables domains',
    async run() {
      /** @type {{ method: string, params: unknown }[]} */
      const calls = [];
      const cpuProfile = Object.freeze({ nodes: [], samples: [], timeDeltas: [] });
      const allocationProfile = Object.freeze({
        head: {
          id: 1,
          callFrame: { functionName: '(root)', url: '' },
          selfSize: 0,
          children: [],
        },
      });
      let runCalls = 0;

      const result = await captureProtocolProfiles({
        metrics: ['cpu', 'allocation'],
        samplingInterval: 100,
        async post(method, params) {
          calls.push({ method, params: params ?? null });

          if (method === 'Profiler.stop') {
            return { profile: cpuProfile };
          }

          if (method === 'HeapProfiler.stopSampling') {
            return { profile: allocationProfile };
          }

          return {};
        },
        async run() {
          runCalls += 1;
          return { checksum: 123 };
        },
      });

      assertSame(runCalls, 1);
      assertSame(
        JSON.stringify(calls),
        JSON.stringify([
          { method: 'Profiler.enable', params: null },
          { method: 'Profiler.setSamplingInterval', params: { interval: 100 } },
          { method: 'Profiler.start', params: null },
          { method: 'HeapProfiler.enable', params: null },
          { method: 'HeapProfiler.startSampling', params: { samplingInterval: 100 } },
          { method: 'HeapProfiler.stopSampling', params: null },
          { method: 'Profiler.stop', params: null },
          { method: 'HeapProfiler.disable', params: null },
          { method: 'Profiler.disable', params: null },
        ]),
      );
      assertSame(result.result.checksum, 123);
      assertSame(result.cpuProfile, cpuProfile);
      assertSame(result.allocationProfile, allocationProfile);
    },
  },
  {
    name: 'captureProtocolProfiles disables domains when the measured run throws',
    async run() {
      /** @type {{ method: string, params: unknown }[]} */
      const calls = [];
      let error;

      try {
        await captureProtocolProfiles({
          metrics: ['cpu'],
          samplingInterval: 250,
          async post(method, params) {
            calls.push({ method, params: params ?? null });

            if (method === 'Profiler.stop') {
              return {
                profile: { nodes: [], samples: [], timeDeltas: [] },
              };
            }

            return {};
          },
          async run() {
            throw new Error('run failed');
          },
        });
      } catch (caught) {
        error = caught;
      }

      assertSame(error instanceof Error, true);
      if (!(error instanceof Error)) {
        throw new Error('Expected Error from failed run capture');
      }
      assertSame(error.message, 'run failed');
      assertSame(
        JSON.stringify(calls),
        JSON.stringify([
          { method: 'Profiler.enable', params: null },
          { method: 'Profiler.setSamplingInterval', params: { interval: 250 } },
          { method: 'Profiler.start', params: null },
          { method: 'Profiler.stop', params: null },
          { method: 'Profiler.disable', params: null },
        ]),
      );
    },
  },
  {
    name: 'captureProtocolProfiles propagates stop failures after cleanup',
    async run() {
      /** @type {string[]} */
      const methods = [];
      let error;

      try {
        await captureProtocolProfiles({
          metrics: ['allocation'],
          samplingInterval: 64,
          async post(method) {
            methods.push(method);

            if (method === 'HeapProfiler.stopSampling') {
              throw new Error('stop failed');
            }

            return {};
          },
          async run() {
            return { checksum: 99 };
          },
        });
      } catch (caught) {
        error = caught;
      }

      assertSame(error instanceof Error, true);
      if (!(error instanceof Error)) {
        throw new Error('Expected Error from failed stop capture');
      }
      assertSame(error.message, 'stop failed');
      assertSame(
        methods.join(','),
        [
          'HeapProfiler.enable',
          'HeapProfiler.startSampling',
          'HeapProfiler.stopSampling',
          'HeapProfiler.disable',
        ].join(','),
      );
    },
  },
  {
    name: 'runNodeProfile writes raw artifacts and a sidecar with summaries',
    async run() {
      const outputUrl = new URL(`${TEST_OUTPUT_DIRECTORY}/`, REPOSITORY_ROOT_URL);
      await rm(outputUrl, { recursive: true, force: true });
      const workload = workloadsForProfile('default')[0];
      /** @type {{ metrics?: readonly string[], samplingInterval?: number }} */
      const captureOptions = {};

      const sidecar = await runNodeProfile(
        {
          host: 'node',
          workload: workload.name,
          mode: 'steady',
          metrics: ['cpu', 'allocation'],
          warmups: 1,
          iterations: 2,
          samplingInterval: 100,
          outputDirectory: TEST_OUTPUT_DIRECTORY,
        },
        {
          engine: fixtureEngine(workload.expectedChecksum),
          gitCommit: async () => 'abc123def456',
          async captureProfiles(options) {
            captureOptions.metrics = options.metrics;
            captureOptions.samplingInterval = options.samplingInterval;
            const result = await options.run();
            return {
              result,
              cpuProfile: CPU_PROFILE_FIXTURE,
              allocationProfile: ALLOCATION_PROFILE_FIXTURE,
            };
          },
        },
      );

      const profileDirectoryUrl = new URL('profiles/node/', outputUrl);
      const sidecarUrl = new URL(`${workload.name}-steady.json`, profileDirectoryUrl);
      const cpuUrl = new URL(`${workload.name}-steady.cpuprofile`, profileDirectoryUrl);
      const heapUrl = new URL(`${workload.name}-steady.heapprofile`, profileDirectoryUrl);
      const persisted = JSON.parse(await readFile(sidecarUrl, 'utf8'));

      assertSame(captureOptions.metrics?.join(','), 'cpu,allocation');
      assertSame(captureOptions.samplingInterval, 100);
      assertSame(sidecar.schemaVersion, 1);
      assertSame(sidecar.gitCommit, 'abc123def456');
      assertSame(sidecar.result.expectedChecksum, workload.expectedChecksum);
      assertSame(sidecar.result.checksum, workload.expectedChecksum);
      assertSame(sidecar.result.elapsedMilliseconds > 0, true);
      assertSame(persisted.artifacts.cpu, `${workload.name}-steady.cpuprofile`);
      assertSame(
        persisted.artifacts.allocation,
        `${workload.name}-steady.heapprofile`,
      );
      assertSame(persisted.summaries.cpu.total, 7);
      assertSame(persisted.summaries.allocation.total, 32);
      assertSame(
        JSON.parse(await readFile(cpuUrl, 'utf8')).samples.length,
        CPU_PROFILE_FIXTURE.samples.length,
      );
      assertSame(
        JSON.parse(await readFile(heapUrl, 'utf8')).head.children.length,
        1,
      );

      await rm(outputUrl, { recursive: true, force: true });
    },
  },
  {
    name: 'runChromiumProfile creates a CDP session routes the benchmark page and writes a sidecar',
    async run() {
      const outputUrl = new URL(`${TEST_OUTPUT_DIRECTORY}-browser/`, REPOSITORY_ROOT_URL);
      await rm(outputUrl, { recursive: true, force: true });
      const workload = workloadsForProfile('default')[0];
      /** @type {string[]} */
      const calls = [];
      /** @type {((route: unknown, request: unknown) => Promise<void>) | undefined} */
      let routeHandler;
      const page = /** @type {any} */ ({
        /**
         * @param {string} pattern
         * @param {(route: unknown, request: unknown) => Promise<void>} handler
         */
        async route(pattern, handler) {
          calls.push(`route:${pattern}`);
          routeHandler = handler;
        },
        /**
         * @param {string} url
         */
        async goto(url) {
          calls.push(`goto:${url}`);
        },
        /**
         * @param {unknown} _fn
         * @param {{ modulePath: string, workload: unknown, mode: string, warmups: number, iterations: number }} args
         */
        async evaluate(_fn, args) {
          calls.push(`evaluate:${args.modulePath}`);
          return {
            runtimeVersion: 'Browser UA',
            expectedChecksum: workload.expectedChecksum,
            elapsedMilliseconds: 11,
            result: {
              checksum: workload.expectedChecksum,
              iterations: args.iterations,
            },
          };
        },
      });
      const browser = /** @type {any} */ ({
        version() {
          return 'Chromium 1.2.3';
        },
        async newPage() {
          calls.push('newPage');
          return page;
        },
        async close() {
          calls.push('close');
        },
      });

      const sidecar = await runChromiumProfile(
        {
          host: 'chromium',
          workload: workload.name,
          mode: 'cold',
          metrics: ['cpu'],
          warmups: 2,
          iterations: 1,
          samplingInterval: 200,
          outputDirectory: `${TEST_OUTPUT_DIRECTORY}-browser`,
        },
        {
          launch: async () => browser,
          createCDPSession: async () => ({
            async send(method) {
              calls.push(`cdp:${method}`);

              if (method === 'Profiler.stop') {
                return { profile: CPU_PROFILE_FIXTURE };
              }

              return {};
            },
          }),
          gitCommit: async () => 'feedfacecafebeef',
        },
      );

      assertSame(
        calls.join(','),
        [
          'newPage',
          'route:http://jsjs.localhost/**/*',
          'goto:http://jsjs.localhost/benchmark/run-browser.html',
          'cdp:Profiler.enable',
          'cdp:Profiler.setSamplingInterval',
          'cdp:Profiler.start',
          'evaluate:/benchmark/profile/run-browser-page.js',
          'cdp:Profiler.stop',
          'cdp:Profiler.disable',
          'close',
        ].join(','),
      );
      assertSame(typeof routeHandler, 'function');
      assertSame(sidecar.runtime.version, 'Chromium 1.2.3');
      assertSame(sidecar.runtime.userAgent, 'Browser UA');
      assertSame(sidecar.gitCommit, 'feedfacecafebeef');
      assertSame(sidecar.capture.mode, 'cold');
      assertSame(sidecar.result.checksum, workload.expectedChecksum);
      assertSame(sidecar.artifacts.cpu, `${workload.name}-cold.cpuprofile`);

      await rm(outputUrl, { recursive: true, force: true });
    },
  },
  {
    name: 'profile CLI dispatches to the selected host runner',
    async run() {
      /** @type {string[]} */
      const calls = [];
      const result = await profileCliMain(
        [
          '--host=node',
          '--workload=arithmetic-loops',
          '--mode=steady',
          '--metric=cpu',
          '--warmups=1',
          '--iterations=1',
        ],
        {
          runners: {
            node: async (options) => {
              calls.push(`node:${options.workload}:${options.mode}`);
              return { host: 'node' };
            },
            chromium: async () => {
              throw new Error('unexpected chromium runner');
            },
          },
        },
      );

      assertSame(calls.join(','), 'node:arithmetic-loops:steady');
      assertSame((/** @type {{ host: string }} */ (result)).host, 'node');
    },
  },
  {
    name: 'profile smoke script writes a sidecar with checksum and CPU samples',
    async run() {
      const outputUrl = new URL('.benchmark-results/profile-smoke/', REPOSITORY_ROOT_URL);
      await rm(outputUrl, { recursive: true, force: true });

      const result = spawnSync('npm', ['run', 'profile:smoke'], {
        cwd: REPOSITORY_ROOT_URL.pathname,
        encoding: 'utf8',
      });

      assertSame(result.status, 0, result.stderr);
      const sidecar = JSON.parse(
        await readFile(
          new URL('profiles/node/arithmetic-loops-steady.json', outputUrl),
          'utf8',
        ),
      );
      const cpuProfile = JSON.parse(
        await readFile(
          new URL('profiles/node/arithmetic-loops-steady.cpuprofile', outputUrl),
          'utf8',
        ),
      );

      assertSame(sidecar.result.expectedChecksum, sidecar.result.checksum);
      assertSame(sidecar.result.elapsedMilliseconds > 0, true);
      assertSame(Array.isArray(cpuProfile.samples), true);
      assertSame(cpuProfile.samples.length > 0, true);

      await rm(outputUrl, { recursive: true, force: true });
    },
  },
  {
    name: 'node test runner accepts multiple explicit suite paths',
    run() {
      const result = spawnSync(
        process.argv[0],
        [
          'test/run-node.js',
          'test/profiling-core.test.js',
          'test/node/benchmark-summary.test.js',
        ],
        {
          cwd: REPOSITORY_ROOT_URL.pathname,
          encoding: 'utf8',
        },
      );

      assertSame(result.status, 0, result.stdout);
      assertSame(
        result.stdout.includes(
          '"name":"parseProfileArguments accepts valid arguments","status":"passed"',
        ),
        true,
      );
      assertSame(
        result.stdout.includes(
          '"name":"benchmark summary parses summary arguments and rejects unsafe directories","status":"passed"',
        ),
        true,
      );
    },
  },
];

export default tests;

/**
 * @param {number} checksumValue
 * @returns {{
 *   createRealm: () => { globalObject: { get: (name: string) => unknown } },
 *   evaluateScript: (realm: { globalObject: { get: (name: string) => unknown } }, source: string) => { type: string, value: unknown },
 * }}
 */
function fixtureEngine(checksumValue) {
  return {
    createRealm() {
      return {
        globalObject: {
          get(name) {
            if (name === '__jsjsBenchmark') {
              return {
                callFunction() {
                  return checksumValue;
                },
              };
            }

            return undefined;
          },
        },
      };
    },
    evaluateScript(_realm, source) {
      if (source.startsWith('function __jsjsBenchmark')) {
        return { type: 'normal', value: undefined };
      }

      return { type: 'normal', value: checksumValue };
    },
  };
}
