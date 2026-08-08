import { assertSame, assertThrows } from './harness/assert.js';
import {
  parseProfileArguments,
  createProfileTarget,
} from '../benchmark/profile/target.js';
import { workloadsForProfile } from '../benchmark/workloads.js';
import {
  summarizeCpuProfile,
  summarizeAllocationProfile,
  classifyProfileFrame,
} from '../benchmark/profile/summarize.js';

/**
 * Builds a minimal jsjs-shaped engine that records invocations in `calls`.
 *
 * Every call returns `checksumValue` so that checksum validation passes when
 * `createProfileTarget` is given a workload whose `expectedChecksum` equals
 * `checksumValue`.
 *
 * @param {unknown[]} calls
 * @param {number} checksumValue
 * @returns {{ createRealm: () => { globalObject: object }, evaluateScript: (realm: { globalObject: object }, source: string) => { type: string, value: unknown } }}
 */
function fixtureEngine(calls, checksumValue) {
  return {
    createRealm() {
      return {
        globalObject: {
          /** @param {string} name */
          get(name) {
            if (name === '__jsjsBenchmark') {
              return {
                /** @param {unknown} _thisValue @param {unknown[]} _args */
                callFunction(_thisValue, _args) {
                  calls.push('steady');
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
      calls.push('cold');
      return { type: 'normal', value: checksumValue };
    },
  };
}

/** @type {import('./harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'parseProfileArguments returns one metric with metric-specific intervals',
    run() {
      const options = parseProfileArguments([
        '--host=node',
        '--workload=object-properties',
        '--mode=steady',
        '--metric=cpu',
        '--run-id=profile-run',
        '--warmups=2',
        '--iterations=3',
      ]);
      assertSame(options.workload, 'object-properties');
      assertSame(options.mode, 'steady');
      assertSame(options.metric, 'cpu');
      assertSame(options.runId, 'profile-run');
      assertSame(options.cpuSamplingIntervalMicroseconds, 100);
      assertSame(options.allocationSamplingIntervalBytes, 32768);
      assertSame(options.warmups, 2);
      assertSame(options.iterations, 3);
      assertSame(options.host, 'node');
    },
  },
  {
    name: 'parseProfileArguments rejects unknown host',
    run() {
      assertThrows(
        () =>
          parseProfileArguments([
            '--host=unknown-host',
            '--workload=object-properties',
            '--mode=steady',
            '--metric=cpu',
            '--run-id=profile-run',
            '--warmups=2',
            '--iterations=3',
          ]),
        RangeError,
      );
    },
  },
  {
    name: 'parseProfileArguments rejects unknown workload',
    run() {
      assertThrows(
        () =>
          parseProfileArguments([
            '--host=node',
            '--workload=no-such-workload',
            '--mode=steady',
            '--metric=cpu',
            '--run-id=profile-run',
            '--warmups=2',
            '--iterations=3',
          ]),
        RangeError,
      );
    },
  },
  {
    name: 'parseProfileArguments rejects unknown mode',
    run() {
      assertThrows(
        () =>
          parseProfileArguments([
            '--host=node',
            '--workload=object-properties',
            '--mode=turbo',
            '--metric=cpu',
            '--run-id=profile-run',
            '--warmups=2',
            '--iterations=3',
          ]),
        RangeError,
      );
    },
  },
  {
    name: 'parseProfileArguments rejects non-positive warmups',
    run() {
      assertThrows(
        () =>
          parseProfileArguments([
            '--host=node',
            '--workload=object-properties',
            '--mode=steady',
            '--metric=cpu',
            '--run-id=profile-run',
            '--warmups=0',
            '--iterations=3',
          ]),
        RangeError,
      );
    },
  },
  {
    name: 'parseProfileArguments rejects non-positive iterations',
    run() {
      assertThrows(
        () =>
          parseProfileArguments([
            '--host=node',
            '--workload=object-properties',
            '--mode=steady',
            '--metric=cpu',
            '--run-id=profile-run',
            '--warmups=2',
            '--iterations=0',
          ]),
        RangeError,
      );
    },
  },
  {
    name: 'parseProfileArguments rejects combined metrics',
    run() {
      assertSame(
        assertThrows(
          () =>
            parseProfileArguments([
              '--host=node',
              '--workload=object-properties',
              '--mode=cold',
              '--metric=cpu',
              '--metric=allocation',
              '--run-id=profile-run',
              '--warmups=1',
              '--iterations=1',
            ]),
          Error,
        ).message,
        '--metric may be specified only once',
      );
    },
  },
  {
    name: 'parseProfileArguments uses allocation defaults and rejects the wrong interval option',
    run() {
      const allocation = parseProfileArguments([
        '--host=node',
        '--workload=object-properties',
        '--mode=steady',
        '--metric=allocation',
        '--run-id=allocation-run',
        '--warmups=1',
        '--iterations=1',
      ]);

      assertSame(allocation.allocationSamplingIntervalBytes, 32768);
      assertSame(
        assertThrows(
          () =>
            parseProfileArguments([
              '--host=node',
              '--workload=object-properties',
              '--mode=steady',
              '--metric=cpu',
              '--run-id=cpu-run',
              '--allocation-sampling-interval-bytes=4096',
              '--warmups=1',
              '--iterations=1',
            ]),
          Error,
        ).message,
        '--allocation-sampling-interval-bytes requires --metric=allocation',
      );
    },
  },
  {
    name: 'parseProfileArguments uses default output directory',
    run() {
      const options = parseProfileArguments([
        '--host=node',
        '--workload=object-properties',
        '--mode=steady',
        '--metric=cpu',
        '--run-id=profile-run',
        '--warmups=1',
        '--iterations=1',
      ]);
      assertSame(options.outputDirectory, '.benchmark-results');
    },
  },
  {
    name: 'parseProfileArguments accepts custom output directory',
    run() {
      const options = parseProfileArguments([
        '--host=node',
        '--workload=object-properties',
        '--mode=steady',
        '--metric=cpu',
        '--run-id=profile-run',
        '--warmups=1',
        '--iterations=1',
        '--output=.benchmark-results/profiles',
      ]);
      assertSame(options.outputDirectory, '.benchmark-results/profiles');
    },
  },
  {
    name: 'parseProfileArguments rejects absolute output directory',
    run() {
      assertThrows(
        () =>
          parseProfileArguments([
            '--host=node',
            '--workload=object-properties',
            '--mode=steady',
            '--metric=cpu',
            '--run-id=profile-run',
            '--warmups=1',
            '--iterations=1',
            '--output=/tmp/profiles',
          ]),
        RangeError,
      );
    },
  },
  {
    name: 'createProfileTarget counts warmup and measured invocations',
    run() {
      const workload = workloadsForProfile('smoke')[0];
      /** @type {string[]} */
      const calls = [];
      const target = createProfileTarget({
        workload,
        mode: 'steady',
        warmups: 2,
        iterations: 3,
        now: () => calls.length,
        engine: fixtureEngine(calls, workload.expectedChecksum),
      });
      target.runWarmups();
      const result = target.runMeasured();
      assertSame(calls.length, 5);
      assertSame(result.iterations, 3);
      assertSame(result.checksum, target.expectedChecksum);
    },
  },
  {
    name: 'createProfileTarget checksum mismatch throws',
    run() {
      const workload = workloadsForProfile('smoke')[0];
      /** @type {string[]} */
      const calls = [];
      // Engine returns the wrong checksum — invokeChecked must throw.
      const engine = fixtureEngine(calls, workload.expectedChecksum + 1);

      const target = createProfileTarget({
        workload,
        mode: 'cold',
        warmups: 1,
        iterations: 1,
        now: () => 0,
        engine,
      });
      assertThrows(() => {
        target.runWarmups();
        target.runMeasured();
      }, Error);
    },
  },
  {
    name: 'createProfileTarget cold mode creates realm per invocation',
    run() {
      const workload = workloadsForProfile('smoke')[0];
      /** @type {string[]} */
      const calls = [];
      const target = createProfileTarget({
        workload,
        mode: 'cold',
        warmups: 2,
        iterations: 2,
        now: () => calls.length,
        engine: fixtureEngine(calls, workload.expectedChecksum),
      });
      target.runWarmups();
      target.runMeasured();
      assertSame(calls.filter((c) => c === 'cold').length, 4);
    },
  },
  {
    name: 'classifyProfileFrame maps object.js to object-property',
    run() {
      assertSame(
        classifyProfileFrame({
          url: 'src/runtime/object.js',
          functionName: 'getProperty',
        }),
        'object-property',
      );
    },
  },
  {
    name: 'classifyProfileFrame maps array-object.js to arrays',
    run() {
      assertSame(
        classifyProfileFrame({
          url: 'src/runtime/array-object.js',
          functionName: 'push',
        }),
        'arrays',
      );
    },
  },
  {
    name: 'classifyProfileFrame maps environment.js to references-environments',
    run() {
      assertSame(
        classifyProfileFrame({
          url: 'src/runtime/environment.js',
          functionName: 'getBinding',
        }),
        'references-environments',
      );
    },
  },
  {
    name: 'classifyProfileFrame maps parser files to parser',
    run() {
      assertSame(
        classifyProfileFrame({
          url: 'src/parser/parser.js',
          functionName: 'parseStatement',
        }),
        'parser',
      );
    },
  },
  {
    name: 'classifyProfileFrame maps evaluator files to evaluator',
    run() {
      assertSame(
        classifyProfileFrame({
          url: 'src/evaluator/evaluator.js',
          functionName: 'evaluate',
        }),
        'evaluator',
      );
    },
  },
  {
    name: 'classifyProfileFrame maps realm setup to realm-setup',
    run() {
      assertSame(
        classifyProfileFrame({
          url: 'src/realm.js',
          functionName: 'createRealm',
        }),
        'realm-setup',
      );
    },
  },
  {
    name: 'classifyProfileFrame maps completions to completions',
    run() {
      assertSame(
        classifyProfileFrame({
          url: 'src/completion.js',
          functionName: 'normalCompletion',
        }),
        'completions',
      );
    },
  },
  {
    name: 'classifyProfileFrame maps arithmetic helpers to arithmetic',
    run() {
      assertSame(
        classifyProfileFrame({
          url: 'src/runtime/arithmetic.js',
          functionName: 'addValues',
        }),
        'arithmetic',
      );
    },
  },
  {
    name: 'classifyProfileFrame maps call helpers to calls',
    run() {
      assertSame(
        classifyProfileFrame({
          url: 'src/runtime/call.js',
          functionName: 'callFunction',
        }),
        'calls',
      );
    },
  },
  {
    name: 'classifyProfileFrame maps unknown src/ files to other-runtime',
    run() {
      assertSame(
        classifyProfileFrame({
          url: 'src/util/some-util.js',
          functionName: 'helper',
        }),
        'other-runtime',
      );
    },
  },
  {
    name: 'classifyProfileFrame maps non-src files to host',
    run() {
      assertSame(
        classifyProfileFrame({ url: 'benchmark/run.js', functionName: 'run' }),
        'host',
      );
    },
  },
  {
    name: 'summarizeCpuProfile computes self-time totals and categories',
    run() {
      const profile = {
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: '(root)',
              url: '',
              scriptId: '0',
              lineNumber: -1,
              columnNumber: -1,
            },
            children: [2, 3],
          },
          {
            id: 2,
            callFrame: {
              functionName: 'getProperty',
              url: 'src/runtime/object.js',
              scriptId: '1',
              lineNumber: 10,
              columnNumber: 0,
            },
          },
          {
            id: 3,
            callFrame: {
              functionName: 'getBinding',
              url: 'src/runtime/environment.js',
              scriptId: '2',
              lineNumber: 20,
              columnNumber: 0,
            },
          },
        ],
        samples: [2, 2, 3, 2],
        timeDeltas: [100, 200, 150, 50],
      };

      const result = summarizeCpuProfile(profile);

      assertSame(result.total, 500);
      assertSame(result.frames.length > 0, true);

      /** @type {import('../benchmark/profile/summarize.js').CpuFrameSummary | undefined} */
      const objectFrame = result.frames.find((f) =>
        f.url.includes('object.js'),
      );
      assertSame(objectFrame !== undefined, true);
      assertSame(
        /** @type {import('../benchmark/profile/summarize.js').CpuFrameSummary} */ (
          objectFrame
        ).selfTime,
        350,
      );

      /** @type {import('../benchmark/profile/summarize.js').CpuFrameSummary | undefined} */
      const envFrame = result.frames.find((f) =>
        f.url.includes('environment.js'),
      );
      assertSame(envFrame !== undefined, true);
      assertSame(
        /** @type {import('../benchmark/profile/summarize.js').CpuFrameSummary} */ (
          envFrame
        ).selfTime,
        150,
      );

      const categories = result.categories;
      /** @type {import('../benchmark/profile/summarize.js').CpuCategorySummary | undefined} */
      const objCat = categories.find((c) => c.category === 'object-property');
      assertSame(objCat !== undefined, true);
      assertSame(
        /** @type {import('../benchmark/profile/summarize.js').CpuCategorySummary} */ (
          objCat
        ).selfTime,
        350,
      );

      /** @type {import('../benchmark/profile/summarize.js').CpuCategorySummary | undefined} */
      const envCat = categories.find(
        (c) => c.category === 'references-environments',
      );
      assertSame(envCat !== undefined, true);
      assertSame(
        /** @type {import('../benchmark/profile/summarize.js').CpuCategorySummary} */ (
          envCat
        ).selfTime,
        150,
      );
    },
  },
  {
    name: 'summarizeCpuProfile sorts frames descending by selfTime',
    run() {
      const profile = {
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: '(root)',
              url: '',
              scriptId: '0',
              lineNumber: -1,
              columnNumber: -1,
            },
            children: [2, 3],
          },
          {
            id: 2,
            callFrame: {
              functionName: 'fast',
              url: 'src/runtime/object.js',
              scriptId: '1',
              lineNumber: 1,
              columnNumber: 0,
            },
          },
          {
            id: 3,
            callFrame: {
              functionName: 'slow',
              url: 'src/runtime/environment.js',
              scriptId: '2',
              lineNumber: 2,
              columnNumber: 0,
            },
          },
        ],
        samples: [3, 3, 3, 2],
        timeDeltas: [100, 100, 100, 50],
      };
      const result = summarizeCpuProfile(profile);
      assertSame(result.frames[0].selfTime >= result.frames[1].selfTime, true);
    },
  },
  {
    name: 'summarizeAllocationProfile computes selfSize totals and categories',
    run() {
      const profile = {
        head: {
          id: 1,
          callFrame: {
            functionName: '(root)',
            url: '',
            scriptId: '0',
            lineNumber: -1,
            columnNumber: -1,
          },
          selfSize: 0,
          children: [
            {
              id: 2,
              callFrame: {
                functionName: 'push',
                url: 'src/runtime/array-object.js',
                scriptId: '1',
                lineNumber: 5,
                columnNumber: 0,
              },
              selfSize: 1024,
              children: [],
            },
            {
              id: 3,
              callFrame: {
                functionName: 'getBinding',
                url: 'src/runtime/environment.js',
                scriptId: '2',
                lineNumber: 10,
                columnNumber: 0,
              },
              selfSize: 512,
              children: [],
            },
          ],
        },
      };

      const result = summarizeAllocationProfile(profile);

      assertSame(result.total, 1536);

      /** @type {import('../benchmark/profile/summarize.js').AllocationFrameSummary | undefined} */
      const arrayFrame = result.frames.find((f) =>
        f.url.includes('array-object.js'),
      );
      assertSame(arrayFrame !== undefined, true);
      assertSame(
        /** @type {import('../benchmark/profile/summarize.js').AllocationFrameSummary} */ (
          arrayFrame
        ).selfSize,
        1024,
      );

      const categories = result.categories;
      /** @type {import('../benchmark/profile/summarize.js').AllocationCategorySummary | undefined} */
      const arrayCat = categories.find((c) => c.category === 'arrays');
      assertSame(arrayCat !== undefined, true);
      assertSame(
        /** @type {import('../benchmark/profile/summarize.js').AllocationCategorySummary} */ (
          arrayCat
        ).selfSize,
        1024,
      );

      /** @type {import('../benchmark/profile/summarize.js').AllocationCategorySummary | undefined} */
      const envCat = categories.find(
        (c) => c.category === 'references-environments',
      );
      assertSame(envCat !== undefined, true);
      assertSame(
        /** @type {import('../benchmark/profile/summarize.js').AllocationCategorySummary} */ (
          envCat
        ).selfSize,
        512,
      );
    },
  },
  {
    name: 'summarizeAllocationProfile sorts frames descending by selfSize',
    run() {
      const profile = {
        head: {
          id: 1,
          callFrame: {
            functionName: '(root)',
            url: '',
            scriptId: '0',
            lineNumber: -1,
            columnNumber: -1,
          },
          selfSize: 0,
          children: [
            {
              id: 2,
              callFrame: {
                functionName: 'a',
                url: 'src/runtime/object.js',
                scriptId: '1',
                lineNumber: 1,
                columnNumber: 0,
              },
              selfSize: 100,
              children: [],
            },
            {
              id: 3,
              callFrame: {
                functionName: 'b',
                url: 'src/runtime/environment.js',
                scriptId: '2',
                lineNumber: 2,
                columnNumber: 0,
              },
              selfSize: 500,
              children: [],
            },
          ],
        },
      };
      const result = summarizeAllocationProfile(profile);
      assertSame(result.frames[0].selfSize >= result.frames[1].selfSize, true);
    },
  },
  {
    name: 'summarizeCpuProfile includes percentage for each frame',
    run() {
      const profile = {
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: '(root)',
              url: '',
              scriptId: '0',
              lineNumber: -1,
              columnNumber: -1,
            },
            children: [2],
          },
          {
            id: 2,
            callFrame: {
              functionName: 'doWork',
              url: 'src/runtime/object.js',
              scriptId: '1',
              lineNumber: 1,
              columnNumber: 0,
            },
          },
        ],
        samples: [2, 2],
        timeDeltas: [100, 100],
      };
      const result = summarizeCpuProfile(profile);
      /** @type {import('../benchmark/profile/summarize.js').CpuFrameSummary | undefined} */
      const frame = result.frames.find((f) => f.url.includes('object.js'));
      assertSame(frame !== undefined, true);
      assertSame(
        /** @type {import('../benchmark/profile/summarize.js').CpuFrameSummary} */ (
          frame
        ).percentage,
        100,
      );
    },
  },
  {
    name: 'summarizeAllocationProfile includes percentage for each frame',
    run() {
      const profile = {
        head: {
          id: 1,
          callFrame: {
            functionName: '(root)',
            url: '',
            scriptId: '0',
            lineNumber: -1,
            columnNumber: -1,
          },
          selfSize: 0,
          children: [
            {
              id: 2,
              callFrame: {
                functionName: 'a',
                url: 'src/runtime/array-object.js',
                scriptId: '1',
                lineNumber: 1,
                columnNumber: 0,
              },
              selfSize: 200,
              children: [],
            },
          ],
        },
      };
      const result = summarizeAllocationProfile(profile);
      /** @type {import('../benchmark/profile/summarize.js').AllocationFrameSummary | undefined} */
      const frame = result.frames.find((f) =>
        f.url.includes('array-object.js'),
      );
      assertSame(frame !== undefined, true);
      assertSame(
        /** @type {import('../benchmark/profile/summarize.js').AllocationFrameSummary} */ (
          frame
        ).percentage,
        100,
      );
    },
  },
];

export default tests;
