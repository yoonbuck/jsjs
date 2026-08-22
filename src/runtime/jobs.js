/**
 * @typedef {import('./agent.js').Agent} Agent
 * @typedef {import('./realm.js').Realm} Realm
 *
 * @typedef {{
 *   scheduleMicrotask: (checkpoint: () => JobDrainReport) => void,
 *   reportJobError?: (failure: JobFailure) => void,
 *   promiseRejectionTracker?: (promise: unknown, operation: 'reject' | 'handle') => void,
 * }} JobHost
 *
 * @typedef {{
 *   realm: Realm | null,
 *   callback: (args: readonly unknown[]) => JobCompletion,
 *   arguments: readonly unknown[],
 *   kind: string,
 * }} JobRecord
 *
 * @typedef {{ type: 'normal' | 'throw', value: unknown }} JobCompletion
 *
 * @typedef {{
 *   job: JobRecord | null,
 *   category: 'job' | 'host-hook',
 *   error: unknown,
 * }} JobFailure
 *
 * @typedef {{
 *   job: null,
 *   category: 'overflow',
 *   error: undefined,
 *   dropped: number,
 * }} JobFailureOverflow
 *
 * @typedef {JobFailure | JobFailureOverflow} DurableJobFailure
 *
 * @typedef {{ processed: number, failures: readonly JobFailure[] }} JobDrainReport
 */

import { isRealm } from './realm.js';

const EMPTY_JOB_DRAIN_REPORT = Object.freeze({
  processed: 0,
  failures: Object.freeze([]),
});
const JOB_QUEUE_COMPACTION_THRESHOLD = 1024;
const DURABLE_JOB_FAILURE_DETAIL_LIMIT = 256;
const DURABLE_JOB_FAILURE_EDGE_SIZE = 128;

export class AgentJobQueue {
  /**
   * @param {JobHost | undefined} jobHost
   * @param {Agent} [agent]
   */
  constructor(jobHost, agent) {
    this.jobHost = validateJobHost(jobHost);
    this.agent = agent;
    /** @type {(JobRecord | undefined)[]} */
    this.jobs = [];
    this.jobHead = 0;
    /** @type {DurableJobFailure[]} */
    this.failures = [];
    this.failureOverflowCount = 0;
    /** @type {'idle' | 'scheduled' | 'draining'} */
    this.checkpointState = 'idle';
    /** @type {Realm | null} */
    this.jobRealm = null;
    this.nextGeneration = 0;
    /** @type {number | null} */
    this.scheduledGeneration = null;
  }

  /**
   * @param {JobRecord} job
   */
  enqueue(job) {
    const record = this.validateJob(job);
    this.jobs.push(record);

    if (this.jobHost !== null && this.checkpointState === 'idle') {
      this.scheduleCheckpoint();
    }
  }

  /**
   * @returns {JobDrainReport}
   */
  run() {
    if (this.checkpointState === 'draining') {
      throw new TypeError('Agent job checkpoint is already draining');
    }

    this.scheduledGeneration = null;
    this.checkpointState = 'draining';
    /** @type {JobFailure[]} */
    const drainFailures = [];
    let processed = 0;

    try {
      while (this.jobHead < this.jobs.length) {
        const job = /** @type {JobRecord} */ (this.jobs[this.jobHead]);
        this.jobs[this.jobHead] = undefined;
        this.jobHead += 1;
        this.compactConsumedJobs();
        processed += 1;
        const previousRealm = this.jobRealm;
        let failed = false;
        /** @type {unknown} */
        let error;

        try {
          this.jobRealm = job.realm;
          const runJob = () => job.callback(job.arguments);
          const completion =
            this.agent === undefined
              ? runJob()
              : job.realm === null
                ? this.agent.withNoActiveExecutionRealm(runJob)
                : this.agent.withActiveExecutionRealm(job.realm, runJob);

          if (!isJobCompletion(completion)) {
            throw new TypeError(
              'Agent job callback returned an invalid completion',
            );
          }

          if (completion.type === 'throw') {
            failed = true;
            error = completion.value;
          }
        } catch (caught) {
          failed = true;
          error = caught;
        } finally {
          this.jobRealm = previousRealm;
        }

        if (failed) {
          this.recordJobFailure(job, error, drainFailures);
        }
      }
    } finally {
      this.jobs = [];
      this.jobHead = 0;
      this.scheduledGeneration = null;
      this.checkpointState = 'idle';
      this.jobRealm = null;
    }

    return createDrainReport(processed, drainFailures);
  }

  /**
   * @returns {readonly DurableJobFailure[]}
   */
  takeFailures() {
    const failures = Object.freeze([...this.failures]);
    this.failures = [];
    this.failureOverflowCount = 0;
    return failures;
  }

  /**
   * @param {unknown} error
   */
  recordHostHookFailure(error) {
    /** @type {JobFailure} */
    const failure = { job: null, category: 'host-hook', error };
    this.recordDurableFailure(Object.freeze(failure));
  }

  /**
   * @returns {'idle' | 'scheduled' | 'draining'}
   */
  get state() {
    return this.checkpointState;
  }

  /**
   * @returns {Realm | null}
   */
  get currentRealm() {
    return this.jobRealm;
  }

  compactConsumedJobs() {
    if (
      this.jobHead < JOB_QUEUE_COMPACTION_THRESHOLD ||
      this.jobHead * 2 < this.jobs.length
    ) {
      return;
    }

    /** @type {(JobRecord | undefined)[]} */
    const remainingJobs = [];
    for (let index = this.jobHead; index < this.jobs.length; index += 1) {
      remainingJobs.push(this.jobs[index]);
    }
    this.jobs = remainingJobs;
    this.jobHead = 0;
  }

  scheduleCheckpoint() {
    const token = ++this.nextGeneration;
    this.scheduledGeneration = token;
    this.checkpointState = 'scheduled';

    try {
      /** @type {JobHost} */ (this.jobHost).scheduleMicrotask(() => {
        if (
          this.checkpointState !== 'scheduled' ||
          this.scheduledGeneration !== token
        ) {
          return EMPTY_JOB_DRAIN_REPORT;
        }

        return this.run();
      });
    } catch (error) {
      this.scheduledGeneration = null;
      this.checkpointState = 'idle';
      throw error;
    }
  }

  /**
   * @param {JobRecord} job
   * @returns {JobRecord}
   */
  validateJob(job) {
    if (job === null || typeof job !== 'object') {
      throw new TypeError('Agent job must be an object');
    }

    const { realm, callback, arguments: argumentsList, kind } = job;
    if (
      realm !== null &&
      (this.agent === undefined ||
        !isRealm(realm) ||
        realm.agent !== this.agent ||
        !this.agent.ownsRealm(realm))
    ) {
      throw new TypeError(
        'Agent job realm must be owned by this Agent or null',
      );
    }
    if (typeof callback !== 'function') {
      throw new TypeError('Agent job callback must be callable');
    }
    if (!Array.isArray(argumentsList)) {
      throw new TypeError('Agent job arguments must be an array');
    }
    if (typeof kind !== 'string' || kind.length === 0) {
      throw new TypeError('Agent job kind must be a nonempty string');
    }

    return Object.freeze({
      realm,
      callback,
      arguments: Object.freeze([...argumentsList]),
      kind,
    });
  }

  /**
   * @param {JobRecord} job
   * @param {unknown} error
   * @param {JobFailure[]} drainFailures
   */
  recordJobFailure(job, error, drainFailures) {
    /** @type {JobFailure} */
    const failure = { job, category: 'job', error };
    const frozenFailure = Object.freeze(failure);
    this.recordDurableFailure(frozenFailure);
    drainFailures.push(frozenFailure);

    if (this.jobHost?.reportJobError === undefined) {
      return;
    }

    try {
      this.jobHost.reportJobError(frozenFailure);
    } catch (hookError) {
      /** @type {JobFailure} */
      const hookFailure = {
        job: null,
        category: 'host-hook',
        error: hookError,
      };
      const frozenHookFailure = Object.freeze(hookFailure);
      this.recordDurableFailure(frozenHookFailure);
      drainFailures.push(frozenHookFailure);
    }
  }

  /**
   * Retains the first and most recent failure details, with one marker accounting
   * for every omitted middle record. At most 256 records can keep a guest error,
   * callback, or Realm reachable from the Agent.
   *
   * @param {JobFailure} failure
   */
  recordDurableFailure(failure) {
    if (
      this.failureOverflowCount === 0 &&
      this.failures.length < DURABLE_JOB_FAILURE_DETAIL_LIMIT
    ) {
      this.failures.push(failure);
      return;
    }

    if (this.failureOverflowCount === 0) {
      this.failureOverflowCount = 1;
      /** @type {DurableJobFailure[]} */
      const retained = [];
      for (let index = 0; index < DURABLE_JOB_FAILURE_EDGE_SIZE; index += 1) {
        retained.push(this.failures[index]);
      }
      retained.push(createJobFailureOverflow(this.failureOverflowCount));
      for (
        let index = DURABLE_JOB_FAILURE_EDGE_SIZE + 1;
        index < this.failures.length;
        index += 1
      ) {
        retained.push(this.failures[index]);
      }
      retained.push(failure);
      this.failures = retained;
      return;
    }

    this.failureOverflowCount += 1;
    this.failures[DURABLE_JOB_FAILURE_EDGE_SIZE] = createJobFailureOverflow(
      this.failureOverflowCount,
    );
    this.failures.splice(DURABLE_JOB_FAILURE_EDGE_SIZE + 1, 1);
    this.failures.push(failure);
  }
}

/**
 * @param {unknown} jobHost
 * @returns {JobHost | null}
 */
export function validateJobHost(jobHost) {
  if (jobHost === undefined) {
    return null;
  }
  if (jobHost === null || typeof jobHost !== 'object') {
    throw new TypeError('jobHost must be an object');
  }

  const candidate = /** @type {Record<string, unknown>} */ (jobHost);
  const scheduleMicrotask = candidate.scheduleMicrotask;
  const reportJobError = candidate.reportJobError;
  const promiseRejectionTracker = candidate.promiseRejectionTracker;
  if (typeof scheduleMicrotask !== 'function') {
    throw new TypeError('jobHost.scheduleMicrotask must be callable');
  }
  if (reportJobError !== undefined && typeof reportJobError !== 'function') {
    throw new TypeError('jobHost.reportJobError must be callable when present');
  }
  if (
    promiseRejectionTracker !== undefined &&
    typeof promiseRejectionTracker !== 'function'
  ) {
    throw new TypeError(
      'jobHost.promiseRejectionTracker must be callable when present',
    );
  }

  return Object.freeze({
    scheduleMicrotask:
      /** @type {(checkpoint: () => JobDrainReport) => void} */ (
        scheduleMicrotask.bind(jobHost)
      ),
    ...(reportJobError === undefined
      ? {}
      : {
          reportJobError: /** @type {(failure: JobFailure) => void} */ (
            reportJobError.bind(jobHost)
          ),
        }),
    ...(promiseRejectionTracker === undefined
      ? {}
      : {
          promiseRejectionTracker:
            /** @type {(promise: unknown, operation: 'reject' | 'handle') => void} */ (
              promiseRejectionTracker.bind(jobHost)
            ),
        }),
  });
}

/**
 * @param {unknown} completion
 * @returns {completion is JobCompletion}
 */
function isJobCompletion(completion) {
  const candidate = /** @type {{ type?: unknown, value?: unknown }} */ (
    completion
  );
  return (
    completion !== null &&
    typeof completion === 'object' &&
    (candidate.type === 'normal' || candidate.type === 'throw') &&
    'value' in completion
  );
}

/**
 * @param {number} processed
 * @param {JobFailure[]} failures
 * @returns {JobDrainReport}
 */
function createDrainReport(processed, failures) {
  return Object.freeze({
    processed,
    failures: Object.freeze([...failures]),
  });
}

/**
 * @param {number} dropped
 * @returns {JobFailureOverflow}
 */
function createJobFailureOverflow(dropped) {
  return Object.freeze({
    job: null,
    category: 'overflow',
    error: undefined,
    dropped,
  });
}
