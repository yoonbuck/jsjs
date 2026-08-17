import { createAgent, createRealm } from '../src/index.js';
import {
  createNormalCompletion,
  createThrowCompletion,
} from '../src/runtime/completion.js';
import { AgentJobQueue } from '../src/runtime/jobs.js';
import { assertSame, assertThrows } from './harness/assert.js';

/**
 * @param {import('../src/runtime/realm.js').Realm | null} realm
 * @param {string} kind
 * @param {(args: readonly unknown[]) => { type: 'normal' | 'throw', value: unknown }} callback
 * @param {readonly unknown[]} [argumentsList]
 */
function createJob(realm, kind, callback, argumentsList = []) {
  return { realm, callback, arguments: argumentsList, kind };
}

export default [
  {
    name: 'jobHost is validated once and cannot accompany an Agent',
    run: () => {
      assertThrows(
        () => createAgent(/** @type {any} */ ({ jobHost: {} })),
        TypeError,
      );
      assertThrows(
        () =>
          createAgent(
            /** @type {any} */ ({
              jobHost: { scheduleMicrotask() {}, reportJobError: 1 },
            }),
          ),
        TypeError,
      );
      assertThrows(
        () =>
          createAgent(
            /** @type {any} */ ({
              jobHost: {
                scheduleMicrotask() {},
                promiseRejectionTracker: null,
              },
            }),
          ),
        TypeError,
      );
      const agent = createAgent();
      assertThrows(
        () =>
          createRealm({
            agent,
            jobHost: { scheduleMicrotask() {} },
          }),
        TypeError,
      );
    },
  },
  {
    name: 'jobHost methods retain their host receiver',
    run: () => {
      /** @type {Array<() => unknown>} */
      const callbacks = [];
      /** @type {unknown[]} */
      const reported = [];
      const jobHost = {
        callbacks,
        reported,
        /** @param {() => unknown} callback */
        scheduleMicrotask(callback) {
          this.callbacks.push(callback);
        },
        /** @param {unknown} failure */
        reportJobError(failure) {
          this.reported.push(failure);
        },
      };
      const realm = createRealm({ jobHost });
      const error = new Error('job error');
      realm.agent.enqueueJob(
        createJob(realm, 'receiver', () => createThrowCompletion(error)),
      );

      assertSame(callbacks.length, 1);
      const report = realm.agent.runJobs();
      assertSame(reported.length, 1);
      assertSame(report.failures.length, 1);
      assertSame(report.failures[0].error, error);
    },
  },
  {
    name: 'jobHost fields are captured and validated once at Agent construction',
    run: () => {
      let scheduleMicrotaskReads = 0;
      /** @type {Array<() => unknown>} */
      const callbacks = [];
      const jobHost = {
        /** @returns {(callback: () => unknown) => void} */
        get scheduleMicrotask() {
          scheduleMicrotaskReads += 1;
          return (callback) => callbacks.push(callback);
        },
      };
      const realm = createRealm({ jobHost });

      assertSame(scheduleMicrotaskReads, 1);
      realm.agent.enqueueJob(
        createJob(realm, 'captured-scheduler', () =>
          createNormalCompletion(undefined),
        ),
      );
      assertSame(callbacks.length, 1);
    },
  },
  {
    name: 'manual Agent drains FIFO through jobs queued during the drain',
    run: () => {
      const realm = createRealm();
      /** @type {string[]} */
      const order = [];
      realm.agent.enqueueJob({
        realm,
        callback() {
          order.push('a');
          realm.agent.enqueueJob({
            realm,
            callback() {
              order.push('c');
              return createNormalCompletion(undefined);
            },
            arguments: [],
            kind: 'test-c',
          });
          return createNormalCompletion(undefined);
        },
        arguments: [],
        kind: 'test-a',
      });
      realm.agent.enqueueJob({
        realm,
        callback() {
          order.push('b');
          return createNormalCompletion(undefined);
        },
        arguments: [],
        kind: 'test-b',
      });

      assertSame(realm.agent.checkpointState, 'idle');
      assertSame(order.join(','), '');
      assertSame(realm.agent.runJobs().processed, 3);
      assertSame(order.join(','), 'a,b,c');
    },
  },
  {
    name: 'Agent queue drains a bounded FIFO without front removal',
    run: () => {
      const realm = createRealm();
      const queue = realm.agent._jobQueue;
      const originalShift = queue.jobs.shift;
      let shiftCalls = 0;
      queue.jobs.shift = function () {
        shiftCalls += 1;
        return originalShift.call(this);
      };
      /** @type {number[]} */
      const order = [];

      for (let index = 0; index < 2048; index += 1) {
        realm.agent.enqueueJob(
          createJob(realm, `bounded-${index}`, () => {
            order.push(index);
            return createNormalCompletion(undefined);
          }),
        );
      }

      assertSame(realm.agent.runJobs().processed, 2048);
      assertSame(order.length, 2048);
      assertSame(order[0], 0);
      assertSame(order[1023], 1023);
      assertSame(order[2047], 2047);
      assertSame(shiftCalls, 0);
      assertSame(queue.jobs.length, 0);

      realm.agent.enqueueJob(
        createJob(realm, 'after-bounded', () => {
          order.push(2048);
          return createNormalCompletion(undefined);
        }),
      );
      assertSame(realm.agent.runJobs().processed, 1);
      assertSame(order[2048], 2048);
    },
  },
  {
    name: 'JobQueue releases consumed records and bounds storage during a checkpoint',
    run: () => {
      const queue = new AgentJobQueue(undefined);
      const jobCount = 2048;
      let boundedStorageObserved = false;
      let retainedConsumedRecord = false;
      /** @type {number[]} */
      const order = [];

      for (let index = 0; index < jobCount; index += 1) {
        const kind = `retention-${index}`;
        queue.enqueue(
          createJob(null, kind, () => {
            order.push(index);
            if (queue.jobs.some((candidate) => candidate?.kind === kind)) {
              retainedConsumedRecord = true;
            }
            if (index < jobCount - 1 && queue.jobs.length <= jobCount / 2) {
              boundedStorageObserved = true;
            }
            return createNormalCompletion(undefined);
          }),
        );
      }

      const report = queue.run();
      assertSame(report.failures.length, 0);
      assertSame(retainedConsumedRecord, false);
      assertSame(boundedStorageObserved, true);
      assertSame(order.length, jobCount);
      assertSame(order[0], 0);
      assertSame(order[jobCount - 1], jobCount - 1);
      assertSame(queue.jobs.length, 0);
      assertSame(queue.jobHead, 0);
    },
  },
  {
    name: 'invalid Job Record fields leave the queue and checkpoint unchanged',
    run: () => {
      const realm = createRealm();
      const otherRealm = createRealm();
      const valid = () => createNormalCompletion(undefined);
      const invalidJobs = [
        {
          realm: otherRealm,
          callback: valid,
          arguments: [],
          kind: 'other-agent',
        },
        { realm, callback: null, arguments: [], kind: 'missing-callback' },
        { realm, callback: valid, arguments: null, kind: 'missing-arguments' },
        { realm, callback: valid, arguments: [], kind: '' },
      ];

      for (const job of invalidJobs) {
        assertThrows(
          () => realm.agent.enqueueJob(/** @type {any} */ (job)),
          TypeError,
        );
        assertSame(realm.agent.checkpointState, 'idle');
      }

      realm.agent.enqueueJob(createJob(realm, 'valid', valid));
      assertSame(realm.agent.runJobs().processed, 1);
    },
  },
  {
    name: 'only actual Realms owned by the Agent may be job realms',
    run: () => {
      const agent = createAgent();
      const fakeRealm = { agent };
      agent.registerRealm(fakeRealm);

      assertThrows(
        () =>
          agent.enqueueJob(
            /** @type {any} */ (
              createJob(/** @type {any} */ (fakeRealm), 'fake-realm', () =>
                createNormalCompletion(undefined),
              )
            ),
          ),
        TypeError,
      );
      assertSame(agent.checkpointState, 'idle');
    },
  },
  {
    name: 'enqueued Job Record arguments are copied and frozen',
    run: () => {
      const realm = createRealm();
      const argumentsList = ['first'];
      /** @type {readonly unknown[] | undefined} */
      let received;
      realm.agent.enqueueJob(
        createJob(
          realm,
          'arguments',
          (args) => {
            received = args;
            return createNormalCompletion(undefined);
          },
          argumentsList,
        ),
      );
      argumentsList[0] = 'changed';
      argumentsList.push('extra');

      realm.agent.runJobs();
      assertSame(received?.[0], 'first');
      assertSame(received?.length, 1);
      assertSame(Object.isFrozen(received), true);
    },
  },
  {
    name: 'scheduled checkpoints coalesce enqueues including jobs appended while draining',
    run: () => {
      /** @type {Array<() => unknown>} */
      const callbacks = [];
      const realm = createRealm({
        jobHost: {
          scheduleMicrotask(callback) {
            callbacks.push(callback);
          },
        },
      });
      /** @type {string[]} */
      const order = [];
      realm.agent.enqueueJob(
        createJob(realm, 'a', () => {
          order.push('a');
          realm.agent.enqueueJob(
            createJob(realm, 'c', () => {
              order.push('c');
              return createNormalCompletion(undefined);
            }),
          );
          assertSame(callbacks.length, 1);
          return createNormalCompletion(undefined);
        }),
      );
      realm.agent.enqueueJob(
        createJob(realm, 'b', () => {
          order.push('b');
          return createNormalCompletion(undefined);
        }),
      );

      assertSame(callbacks.length, 1);
      callbacks[0]();
      assertSame(order.join(','), 'a,b,c');
      assertSame(realm.agent.checkpointState, 'idle');
    },
  },
  {
    name: 'stale callback A cannot consume newly scheduled generation B',
    run: () => {
      /** @type {Array<() => unknown>} */
      const callbacks = [];
      const realm = createRealm({
        jobHost: {
          scheduleMicrotask(callback) {
            callbacks.push(callback);
          },
        },
      });
      /** @type {string[]} */
      const order = [];
      /** @param {string} label */
      const enqueue = (label) =>
        realm.agent.enqueueJob(
          createJob(realm, label, () => {
            order.push(label);
            return createNormalCompletion(undefined);
          }),
        );

      enqueue('A');
      assertSame(callbacks.length, 1);
      realm.agent.runJobs();
      enqueue('B');
      assertSame(callbacks.length, 2);
      callbacks[0]();
      assertSame(order.join(','), 'A');
      assertSame(realm.agent.checkpointState, 'scheduled');
      callbacks[1]();
      assertSame(order.join(','), 'A,B');
      assertSame(realm.agent.checkpointState, 'idle');
    },
  },
  {
    name: 'scheduler throw retains jobs and allows manual recovery',
    run: () => {
      const error = new Error('scheduler failed');
      const realm = createRealm({
        jobHost: {
          scheduleMicrotask() {
            throw error;
          },
        },
      });
      let ran = false;
      let caught;
      try {
        realm.agent.enqueueJob(
          createJob(realm, 'recover', () => {
            ran = true;
            return createNormalCompletion(undefined);
          }),
        );
      } catch (value) {
        caught = value;
      }
      assertSame(caught, error);
      assertSame(realm.agent.checkpointState, 'idle');
      assertSame(realm.agent.runJobs().processed, 1);
      assertSame(ran, true);
    },
  },
  {
    name: 'reentrant runJobs throws without interrupting the outer drain',
    run: () => {
      const realm = createRealm();
      let message;
      realm.agent.enqueueJob(
        createJob(realm, 'reentrant', () => {
          message = assertThrows(
            () => realm.agent.runJobs(),
            TypeError,
          ).message;
          return createNormalCompletion(undefined);
        }),
      );

      assertSame(realm.agent.runJobs().processed, 1);
      assertSame(message, 'Agent job checkpoint is already draining');
    },
  },
  {
    name: 'jobs expose their target Realm or null only while they execute',
    run: () => {
      const agent = createAgent();
      const firstRealm = createRealm({ agent });
      const secondRealm = createRealm({ agent });
      let firstContext;
      let nullContext;
      let secondContext;
      agent.enqueueJob(
        createJob(firstRealm, 'first-realm', () => {
          firstContext = agent.currentJobRealm;
          return createNormalCompletion(undefined);
        }),
      );
      agent.enqueueJob(
        createJob(null, 'null-realm', () => {
          nullContext = agent.currentJobRealm;
          return createNormalCompletion(undefined);
        }),
      );
      agent.enqueueJob(
        createJob(secondRealm, 'second-realm', () => {
          secondContext = agent.currentJobRealm;
          return createNormalCompletion(undefined);
        }),
      );

      assertSame(agent.runJobs().processed, 3);
      assertSame(firstContext, firstRealm);
      assertSame(nullContext, null);
      assertSame(secondContext, secondRealm);
      assertSame(agent.currentJobRealm, null);
    },
  },
  {
    name: 'abrupt jobs are reported and later jobs still run',
    run: () => {
      /** @type {unknown[]} */
      const reported = [];
      const realm = createRealm({
        jobHost: {
          scheduleMicrotask() {},
          reportJobError(failure) {
            reported.push(failure);
          },
        },
      });
      let laterRan = false;
      const abrupt = new Error('abrupt');
      realm.agent.enqueueJob(
        createJob(realm, 'abrupt', () => createThrowCompletion(abrupt)),
      );
      realm.agent.enqueueJob(
        createJob(realm, 'later', () => {
          laterRan = true;
          return createNormalCompletion(undefined);
        }),
      );

      const report = realm.agent.runJobs();
      assertSame(report.processed, 2);
      assertSame(report.failures.length, 1);
      assertSame(report.failures[0].error, abrupt);
      assertSame(report.failures[0].category, 'job');
      assertSame(reported.length, 1);
      assertSame(laterRan, true);
      assertSame(Object.isFrozen(report), true);
      assertSame(Object.isFrozen(report.failures), true);
      assertSame(realm.agent.takeJobFailures().length, 1);
      assertSame(realm.agent.takeJobFailures().length, 0);
    },
  },
  {
    name: 'malformed Job Completions are contained, reported, and do not stop later jobs',
    run: () => {
      /** @type {unknown[]} */
      const reported = [];
      const realm = createRealm({
        jobHost: {
          scheduleMicrotask() {},
          reportJobError(failure) {
            reported.push(failure);
          },
        },
      });
      let laterRan = false;
      realm.agent.enqueueJob(
        createJob(
          realm,
          'malformed-completion',
          () => /** @type {any} */ ({ type: 'invalid', value: undefined }),
        ),
      );
      realm.agent.enqueueJob(
        createJob(realm, 'later', () => {
          laterRan = true;
          return createNormalCompletion(undefined);
        }),
      );

      const report = realm.agent.runJobs();
      const failure = report.failures[0];
      assertSame(report.processed, 2);
      assertSame(laterRan, true);
      assertSame(report.failures.length, 1);
      assertSame(failure.job?.kind, 'malformed-completion');
      assertSame(failure.category, 'job');
      assertSame(failure.error instanceof TypeError, true);
      assertSame(reported.length, 1);
      assertSame(reported[0], failure);
      const durableFailures = realm.agent.takeJobFailures();
      assertSame(durableFailures.length, 1);
      assertSame(durableFailures[0], failure);
    },
  },
  {
    name: 'a reporting hook throw is retained without escaping or recursion',
    run: () => {
      const jobError = new Error('job failed');
      const hookError = new Error('reporter failed');
      const realm = createRealm({
        jobHost: {
          scheduleMicrotask() {},
          reportJobError() {
            throw hookError;
          },
        },
      });
      realm.agent.enqueueJob(
        createJob(realm, 'failed', () => createThrowCompletion(jobError)),
      );

      const report = realm.agent.runJobs();
      assertSame(report.failures.length, 2);
      assertSame(report.failures[0].error, jobError);
      assertSame(report.failures[1].error, hookError);
      assertSame(report.failures[1].job, null);
      assertSame(report.failures[1].category, 'host-hook');
    },
  },
  {
    name: 'automatic durable failures bound several waves without suppressing reports',
    run: () => {
      const hookError = new Error('reporter failed');
      const waveSizes = [44, 44, 45];
      let reportCalls = 0;
      /** @type {import('../src/runtime/jobs.js').JobFailure | undefined} */
      let reportedDroppedFailure;
      const agent = createAgent({
        jobHost: {
          scheduleMicrotask() {},
          reportJobError(failure) {
            reportCalls += 1;
            if (failure.job?.kind === 'failure-66') {
              reportedDroppedFailure = failure;
            }
            throw hookError;
          },
        },
      });
      const sharedRealm = createRealm({ agent });
      const droppedRealm = createRealm({ agent });
      /** @type {(() => { type: 'throw', value: unknown }) | undefined} */
      let droppedCallback;
      let ordinal = 0;

      for (const waveSize of waveSizes) {
        for (let offset = 0; offset < waveSize; offset += 1) {
          const current = ordinal;
          const callback = () => createThrowCompletion({ ordinal: current });
          if (current === 66) {
            droppedCallback = callback;
          }
          agent.enqueueJob(
            createJob(
              current === 66 ? droppedRealm : sharedRealm,
              `failure-${current}`,
              callback,
            ),
          );
          ordinal += 1;
        }

        const report = agent.runJobs();
        assertSame(report.failures.length, waveSize * 2);
      }

      const retained = agent._jobQueue.failures;
      assertSame(reportCalls, 133);
      assertSame(retained.length, 257);
      assertSame(retained[0].job?.kind, 'failure-0');
      assertSame(retained[1].category, 'host-hook');
      const overflow = retained[128];
      assertSame(overflow.category, 'overflow');
      if (overflow.category !== 'overflow') {
        throw new Error('Expected a durable failure overflow marker');
      }
      assertSame(overflow.job, null);
      assertSame(overflow.error, undefined);
      assertSame(overflow.dropped, 10);
      assertSame(Object.isFrozen(overflow), true);
      assertSame(retained[129].job?.kind, 'failure-69');
      assertSame(retained[256].category, 'host-hook');
      assertSame(
        retained.some((failure) => failure.job?.callback === droppedCallback),
        false,
      );
      assertSame(
        retained.some((failure) => failure.job?.realm === droppedRealm),
        false,
      );
      assertSame(reportedDroppedFailure?.job?.callback, droppedCallback);
      assertSame(reportedDroppedFailure?.job?.realm, droppedRealm);
    },
  },
  {
    name: 'manual durable overflow accounting is cleared by takeJobFailures',
    run: () => {
      const realm = createRealm();
      const waveSizes = [100, 100, 59];
      /** @type {(() => { type: 'throw', value: unknown }) | undefined} */
      let droppedCallback;
      let ordinal = 0;

      for (const waveSize of waveSizes) {
        for (let offset = 0; offset < waveSize; offset += 1) {
          const current = ordinal;
          const callback = () => createThrowCompletion({ ordinal: current });
          if (current === 129) {
            droppedCallback = callback;
          }
          realm.agent.enqueueJob(
            createJob(realm, `manual-${current}`, callback),
          );
          ordinal += 1;
        }

        assertSame(realm.agent.checkpointState, 'idle');
        assertSame(realm.agent.runJobs().failures.length, waveSize);
      }

      const retained = realm.agent.takeJobFailures();
      assertSame(retained.length, 257);
      assertSame(retained[0].job?.kind, 'manual-0');
      assertSame(retained[127].job?.kind, 'manual-127');
      const overflow = retained[128];
      assertSame(overflow.category, 'overflow');
      if (overflow.category !== 'overflow') {
        throw new Error('Expected a durable failure overflow marker');
      }
      assertSame(overflow.dropped, 3);
      assertSame(retained[129].job?.kind, 'manual-131');
      assertSame(retained[256].job?.kind, 'manual-258');
      assertSame(
        retained.some((failure) => failure.job?.callback === droppedCallback),
        false,
      );
      assertSame(realm.agent.takeJobFailures().length, 0);

      realm.agent.enqueueJob(
        createJob(realm, 'after-clear', () =>
          createThrowCompletion('after-clear'),
        ),
      );
      assertSame(realm.agent.runJobs().failures.length, 1);
      const afterClear = realm.agent.takeJobFailures();
      assertSame(afterClear.length, 1);
      assertSame(afterClear[0].category, 'job');
      assertSame(afterClear[0].job?.kind, 'after-clear');
    },
  },
];
