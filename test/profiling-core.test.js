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
  normalizeProfileUrl,
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

/**
 * @param {typeof globalThis.URL | undefined} value
 * @param {() => void} callback
 * @returns {void}
 */
function withTemporaryGlobalUrl(value, callback) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'URL');

  try {
    Object.defineProperty(globalThis, 'URL', {
      configurable: true,
      writable: true,
      value,
    });
    callback();
  } finally {
    if (descriptor === undefined) {
      delete (/** @type {{ URL?: typeof globalThis.URL }} */ (globalThis).URL);
    } else {
      Object.defineProperty(globalThis, 'URL', descriptor);
    }
  }
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
    name: 'normalizeProfileUrl only normalizes repository sources from the capture origin',
    run() {
      assertSame(
        normalizeProfileUrl('src/runtime/object.js'),
        'src/runtime/object.js',
      );
      assertSame(
        normalizeProfileUrl('file:///repo/src/runtime/object.js'),
        'src/runtime/object.js',
      );
      assertSame(
        normalizeProfileUrl('http://jsjs.localhost/src/builtins/object.js'),
        'src/builtins/object.js',
      );
      assertSame(
        normalizeProfileUrl('http://jsjs.localhost:80/src/runtime/object.js'),
        'src/runtime/object.js',
      );
      assertSame(
        normalizeProfileUrl(
          'file:///earlier/src/ignored/src/runtime/descriptors.js',
        ),
        'src/runtime/descriptors.js',
      );
      assertSame(
        normalizeProfileUrl('/node_modules/pkg/src/index.js'),
        '/node_modules/pkg/src/index.js',
      );
      assertSame(
        normalizeProfileUrl('http://example.test/src/runtime/object.js'),
        'http://example.test/src/runtime/object.js',
      );
      assertSame(
        normalizeProfileUrl('https://jsjs.localhost/src/runtime/object.js'),
        'https://jsjs.localhost/src/runtime/object.js',
      );
      assertSame(
        normalizeProfileUrl(
          'http://example.test/node_modules/pkg/src/index.js?source=/src/runtime/object.js',
        ),
        'http://example.test/node_modules/pkg/src/index.js?source=/src/runtime/object.js',
      );
      assertSame(
        normalizeProfileUrl(
          'http://jsjs.localhost/benchmark/run-browser.html?source=/src/runtime/object.js',
        ),
        'http://jsjs.localhost/benchmark/run-browser.html?source=/src/runtime/object.js',
      );
      assertSame(
        normalizeProfileUrl(
          'http://jsjs.localhost/node_modules/pkg/src/index.js',
        ),
        'http://jsjs.localhost/node_modules/pkg/src/index.js',
      );
    },
  },
  {
    name: 'normalizeProfileUrl treats mixed-case absolute schemes as absolute URLs',
    run() {
      assertSame(
        normalizeProfileUrl('HtTp://example.test/src/runtime/object.js'),
        'HtTp://example.test/src/runtime/object.js',
      );
      assertSame(
        normalizeProfileUrl('HtTpS://example.test/src/runtime/object.js'),
        'HtTpS://example.test/src/runtime/object.js',
      );
      assertSame(
        normalizeProfileUrl('HTtp://JSJS.LOCALHOST:80/src/runtime/object.js'),
        'src/runtime/object.js',
      );
      assertSame(
        normalizeProfileUrl('FiLe:///repo/src/runtime/object.js'),
        'src/runtime/object.js',
      );
    },
  },
  {
    // A profiler emits frames from code this repository does not own under
    // schemes the capture-origin gate knows nothing about: browser extensions,
    // bundler-synthesised sources, `blob:` workers, and Node's own builtins.
    // Their opaque paths often contain a `src/` segment, so lifting that
    // segment out would file host frames under `object-property` or `arrays`
    // and silently inflate every category the evidence rests on. An
    // unrecognised scheme is therefore returned byte for byte.
    name: 'normalizeProfileUrl leaves unknown absolute schemes unchanged',
    run() {
      assertSame(
        normalizeProfileUrl('chrome-extension://abcdef/src/runtime/object.js'),
        'chrome-extension://abcdef/src/runtime/object.js',
      );
      assertSame(
        normalizeProfileUrl('webpack://app/./src/runtime/object.js'),
        'webpack://app/./src/runtime/object.js',
      );
      assertSame(
        normalizeProfileUrl('blob:http://jsjs.localhost/src/x.js'),
        'blob:http://jsjs.localhost/src/x.js',
      );
      assertSame(
        normalizeProfileUrl('node:internal/modules/src/loader.js'),
        'node:internal/modules/src/loader.js',
      );
      assertSame(
        normalizeProfileUrl('WEBPACK://app/src/runtime/object.js'),
        'WEBPACK://app/src/runtime/object.js',
      );
      assertSame(
        normalizeProfileUrl('data:text/javascript,/src/runtime/object.js'),
        'data:text/javascript,/src/runtime/object.js',
      );
      assertSame(
        normalizeProfileUrl('http:/src/runtime/object.js'),
        'http:/src/runtime/object.js',
      );
    },
  },
  {
    // The counterpart to the rule above: anything without a scheme is a path,
    // and a path is the only shape a `src/` segment may be lifted out of. A
    // single-letter prefix is a Windows drive, not a scheme, so it stays a
    // path too.
    name: 'normalizeProfileUrl still normalizes scheme-less paths',
    run() {
      assertSame(
        normalizeProfileUrl('/repo/src/runtime/object.js'),
        'src/runtime/object.js',
      );
      assertSame(
        normalizeProfileUrl('../src/runtime/object.js'),
        'src/runtime/object.js',
      );
      assertSame(
        normalizeProfileUrl('./src/runtime/object.js'),
        'src/runtime/object.js',
      );
      assertSame(
        normalizeProfileUrl('benchmark/a:b/src/runtime/object.js'),
        'src/runtime/object.js',
      );
      assertSame(
        normalizeProfileUrl('C:/repo/src/runtime/object.js'),
        'src/runtime/object.js',
      );
    },
  },
  {
    name: 'classifyProfileFrame files unknown-scheme frames under host',
    run() {
      assertSame(
        classifyProfileFrame({
          url: 'chrome-extension://abcdef/src/runtime/object.js',
          functionName: 'defineOwnProperty',
        }),
        'host',
      );
      assertSame(
        classifyProfileFrame({
          url: 'node:internal/modules/src/loader.js',
          functionName: 'compile',
        }),
        'host',
      );
    },
  },
  {
    name: 'normalizeProfileUrl keeps the origin gate when host URL support is unavailable',
    run() {
      for (const missingUrl of [
        undefined,
        /** @type {typeof globalThis.URL | undefined} */ (
          /** @type {unknown} */ (
            function BrokenUrl() {
              throw new Error('host URL unavailable');
            }
          )
        ),
      ]) {
        withTemporaryGlobalUrl(missingUrl, () => {
          assertSame(
            normalizeProfileUrl('http://example.test/src/runtime/object.js'),
            'http://example.test/src/runtime/object.js',
          );
          assertSame(
            normalizeProfileUrl('http://jsjs.localhost/src/runtime/object.js'),
            'src/runtime/object.js',
          );
          assertSame(
            normalizeProfileUrl(
              'http://jsjs.localhost:80/src/runtime/object.js',
            ),
            'src/runtime/object.js',
          );
          assertSame(
            normalizeProfileUrl('file:///repo/src/runtime/object.js'),
            'src/runtime/object.js',
          );
        });
      }
    },
  },
  {
    name: 'classifyProfileFrame maps descriptor helpers to object-property',
    run() {
      assertSame(
        classifyProfileFrame({
          url: 'src/runtime/descriptors.js',
          functionName: 'copyDescriptorFields',
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
    name: 'classifyProfileFrame maps Object builtin helpers to object-property',
    run() {
      assertSame(
        classifyProfileFrame({
          url: 'src/builtins/object.js',
          functionName: 'createObjectIntrinsics',
        }),
        'object-property',
      );
    },
  },
  {
    name: 'classifyProfileFrame maps Array builtin helpers to arrays',
    run() {
      assertSame(
        classifyProfileFrame({
          url: 'src/builtins/array.js',
          functionName: 'createArrayIntrinsics',
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
          url: 'src/parser.js',
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
          url: 'src/evaluator/expressions.js',
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
          url: 'src/runtime/realm.js',
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
          url: 'src/runtime/completion.js',
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
          url: 'src/runtime/operators.js',
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
          url: 'src/runtime/function-object.js',
          functionName: 'callFunction',
        }),
        'calls',
      );
    },
  },
  {
    name: 'classifyProfileFrame keeps node module sources as host',
    run() {
      assertSame(
        classifyProfileFrame({
          url: '/node_modules/pkg/src/index.js',
          functionName: 'run',
        }),
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
