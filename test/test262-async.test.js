import { createThrowCompletion } from '../src/runtime/completion.js';
import { assertSame } from './harness/assert.js';
import { runTest262 } from '../tools/test262/runner.js';
import { createJsjsTest262Engine } from '../tools/test262/engine.js';

/**
 * @param {Record<string, string>} files
 * @param {Record<string, string>} [includes]
 * @returns {import('../tools/test262/runner.js').Test262Host}
 */
function inMemoryHost(files, includes = {}) {
  return {
    readTest(file) {
      if (!Object.prototype.hasOwnProperty.call(files, file)) {
        throw new Error(`missing test fixture: ${file}`);
      }
      return files[file];
    },
    readModule(file) {
      if (!Object.prototype.hasOwnProperty.call(files, file)) {
        throw new Error(`missing module fixture: ${file}`);
      }
      return files[file];
    },
    readInclude(name) {
      return includes[name] ?? '';
    },
  };
}

const ASYNC_SOURCE = `/*---
description: $DONE resolves through a Promise reaction
flags: [async]
---*/
Promise.resolve(42).then(function (value) {
  $DONE(value === 42 ? undefined : "wrong value");
});
`;

/**
 * @param {string} body
 * @param {string} [metadata]
 * @returns {string}
 */
function asyncFixture(body, metadata = '') {
  return `/*---
description: portable async fixture
flags: [async, noStrict]
${metadata}---*/
${body}
`;
}

/**
 * @param {readonly import('../tools/test262/report.js').Test262TestRecord[]} records
 * @returns {string}
 */
function outcomeReasons(records) {
  return records
    .map((record) => `${record.file}:${record.reason ?? ''}`)
    .join(',');
}

/**
 * @param {import('../tools/test262/runner.js').Test262Engine} engine
 * @returns {NonNullable<import('../tools/test262/runner.js').Test262Engine['runJobs']>}
 */
function requireRunJobs(engine) {
  if (typeof engine.runJobs !== 'function') {
    throw new Error('the portable engine must provide runJobs');
  }

  return engine.runJobs;
}

export default [
  {
    name: 'async Test262 mode installs $DONE and drains guest jobs',
    run: async () => {
      const result = await runTest262({
        engine: createJsjsTest262Engine(),
        host: inMemoryHost({ 'test/async.js': ASYNC_SOURCE }),
        paths: ['test/async.js'],
      });
      assertSame(result.summary.passed, 2);
      assertSame(result.summary.failed, 0);
    },
  },
  {
    name: 'async Test262 mode drains through guest jobs queued by other guest jobs',
    run: async () => {
      let drainCount = 0;
      const engine = createJsjsTest262Engine();
      const runJobs = requireRunJobs(engine);
      const result = await runTest262({
        engine: {
          ...engine,
          runJobs(realm) {
            drainCount += 1;
            return runJobs(realm);
          },
        },
        host: inMemoryHost({
          'test/chained.js': asyncFixture(
            `Promise.resolve(40)
  .then(function (value) { return value + 2; })
  .then(function (value) { $DONE(value === 42 ? undefined : 'wrong value'); });`,
          ),
        }),
        paths: ['test/chained.js'],
      });

      assertSame(result.summary.passed, 1);
      assertSame(drainCount, 1);
    },
  },
  {
    name: 'async Test262 mode classifies every completion outcome deterministically',
    run: async () => {
      const result = await runTest262({
        engine: createJsjsTest262Engine(),
        host: inMemoryHost({
          'test/done-error.js': asyncFixture(`$DONE('reported failure');`),
          'test/done-guest-error.js': asyncFixture(
            `$DONE(new Error('guest failure'));`,
          ),
          'test/duplicate.js': asyncFixture(`$DONE(); $DONE();`),
          'test/incomplete.js': asyncFixture(`var completed = true;`),
        }),
        paths: [
          'test/done-error.js',
          'test/done-guest-error.js',
          'test/duplicate.js',
          'test/incomplete.js',
        ],
      });

      assertSame(
        outcomeReasons(result.records),
        [
          'test/done-error.js:async-error',
          'test/done-guest-error.js:async-error',
          'test/duplicate.js:async-duplicate',
          'test/incomplete.js:async-incomplete',
        ].join(','),
      );
      assertSame(result.records[0].message, 'guest string: reported failure');
      assertSame(
        result.records[1].message,
        'guest object with message: guest failure',
      );
      const engine = createJsjsTest262Engine();
      const runJobs = requireRunJobs(engine);
      const jobResult = await runTest262({
        engine: {
          ...engine,
          runJobs(realm) {
            realm.agent.enqueueJob({
              realm,
              callback() {
                return createThrowCompletion(
                  realm.createGuestError('Error', 'job failure'),
                );
              },
              arguments: [],
              kind: 'test262-async-failure',
            });
            return runJobs(realm);
          },
        },
        host: inMemoryHost({
          'test/job-error.js': asyncFixture('$DONE();'),
        }),
        paths: ['test/job-error.js'],
      });

      assertSame(
        outcomeReasons(jobResult.records),
        'test/job-error.js:job-error',
      );
      assertSame(
        jobResult.records[0].message,
        'guest object with message: job failure',
      );
    },
  },
  {
    name: 'async Test262 mode installs $DONE before includes and preserves include failures',
    run: async () => {
      let drainCount = 0;
      const engine = createJsjsTest262Engine();
      const runJobs = requireRunJobs(engine);
      const result = await runTest262({
        engine: {
          ...engine,
          runJobs(realm) {
            drainCount += 1;
            return runJobs(realm);
          },
        },
        host: inMemoryHost(
          {
            'test/include-done.js': asyncFixture(
              'var completedAfterInclude = true;',
              'includes: [done.js]\n',
            ),
            'test/include-failure.js': asyncFixture(
              '$DONE();',
              'includes: [broken.js]\n',
            ),
          },
          {
            'done.js': '$DONE();',
            'broken.js': "throw new Error('include failure');",
          },
        ),
        paths: ['test/include-done.js', 'test/include-failure.js'],
      });

      assertSame(
        outcomeReasons(result.records),
        'test/include-done.js:,test/include-failure.js:harness-error',
      );
      assertSame(result.records[0].status, 'passed');
      assertSame(drainCount, 1);
    },
  },
  {
    name: 'async Test262 mode installs host bindings before async hooks, includes, test evaluation, and job drain',
    run: async () => {
      /** @type {string[]} */
      const calls = [];
      const realm = { name: 'async-root' };
      /** @type {((value: unknown) => void) | null} */
      let onDone = null;
      const result = await runTest262({
        engine: {
          createRealm() {
            calls.push('createRealm');
            return realm;
          },
          installHostBindings(installedRealm) {
            assertSame(installedRealm, realm);
            calls.push('installHostBindings');
          },
          installDone(installedRealm, nextOnDone) {
            assertSame(installedRealm, realm);
            onDone = nextOnDone;
            calls.push('installDone');
          },
          evaluateScript(currentRealm, source) {
            assertSame(currentRealm, realm);
            calls.push(
              source === 'TRACE_ASSERT'
                ? 'evaluateScript:assert.js'
                : source === 'TRACE_STA'
                  ? 'evaluateScript:sta.js'
                  : source === 'TRACE_DONE'
                    ? 'evaluateScript:done.js'
                    : 'evaluateScript:test',
            );
            return { type: 'normal', value: undefined };
          },
          runJobs(currentRealm) {
            assertSame(currentRealm, realm);
            calls.push('runJobs');
            onDone?.(undefined);
            return { processed: 1, failures: [] };
          },
        },
        host: inMemoryHost(
          {
            'test/trace-order.js': asyncFixture(
              'TRACE_ASYNC_BODY;',
              'includes: [done.js]\n',
            ),
          },
          {
            'assert.js': 'TRACE_ASSERT',
            'sta.js': 'TRACE_STA',
            'done.js': 'TRACE_DONE',
          },
        ),
        paths: ['test/trace-order.js'],
      });

      assertSame(result.records[0].status, 'passed');
      assertSame(
        JSON.stringify(calls),
        JSON.stringify([
          'createRealm',
          'installHostBindings',
          'installDone',
          'evaluateScript:assert.js',
          'evaluateScript:sta.js',
          'evaluateScript:done.js',
          'evaluateScript:test',
          'runJobs',
        ]),
      );
    },
  },
  {
    name: 'async Test262 negative expectations retain their existing path without a job drain',
    run: async () => {
      let drainCount = 0;
      const engine = createJsjsTest262Engine();
      const runJobs = requireRunJobs(engine);
      const result = await runTest262({
        engine: {
          ...engine,
          runJobs(realm) {
            drainCount += 1;
            return runJobs(realm);
          },
        },
        host: inMemoryHost({
          'test/parse-negative.js': asyncFixture(
            'var = ;',
            'negative:\n  phase: parse\n  type: SyntaxError\n',
          ),
          'test/runtime-negative.js': asyncFixture(
            "throw new Error('runtime failure');",
            'negative:\n  phase: runtime\n  type: Error\n',
          ),
        }),
        paths: ['test/parse-negative.js', 'test/runtime-negative.js'],
      });

      assertSame(result.summary.passed, 2);
      assertSame(result.summary.failed, 0);
      assertSame(drainCount, 0);
    },
  },
  {
    name: 'async Test262 mode reports an engine error when the portable hooks are absent',
    run: async () => {
      const engineWithoutAsyncHooks = {
        ...createJsjsTest262Engine(),
      };
      delete engineWithoutAsyncHooks.installDone;
      delete engineWithoutAsyncHooks.runJobs;
      const result = await runTest262({
        engine: engineWithoutAsyncHooks,
        host: inMemoryHost({
          'test/missing-hooks.js': asyncFixture('$DONE();'),
        }),
        paths: ['test/missing-hooks.js'],
      });

      assertSame(
        outcomeReasons(result.records),
        'test/missing-hooks.js:engine-error',
      );
    },
  },
  {
    name: 'non-async Test262 tests do not install $DONE or drain guest jobs',
    run: async () => {
      const engine = createJsjsTest262Engine();
      const result = await runTest262({
        engine: {
          ...engine,
          installDone() {
            throw new Error(
              '$DONE must not be installed for synchronous tests',
            );
          },
          runJobs() {
            throw new Error('jobs must not drain for synchronous tests');
          },
        },
        host: inMemoryHost({
          'test/sync.js': `/*---
description: synchronous tests retain the original runner path
---*/
if (typeof $DONE !== 'undefined') {
  throw new Error('$DONE leaked into a synchronous test');
}
Promise.resolve(0).then(function () {
  throw new Error('this guest job must stay pending');
});
`,
        }),
        paths: ['test/sync.js'],
      });

      assertSame(result.summary.passed, 2);
      assertSame(result.summary.failed, 0);
    },
  },
];
