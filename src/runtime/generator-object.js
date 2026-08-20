import { EngineObject } from './object.js';
import { createIterResultObject } from './iterator.js';
import { GuestErrorSignal, ThrowSignal } from './completion.js';
import { linkValueToGeneratorHostChain } from './reference.js';

/**
 * @typedef {import('./realm.js').Realm} Realm
 *
 * @typedef {'suspendedStart' | 'suspendedYield' | 'executing' | 'completed'}
 *   GeneratorState
 *
 * @typedef {
 *   | { type: 'normal', value: unknown }
 *   | { type: 'throw', value: unknown }
 *   | { type: 'return', value: unknown }
 * } GeneratorResumeCompletion
 *
 * @typedef {
 *   | { type: 'yield', value: unknown }
 *   | { type: 'yield-result', result: EngineObject }
 *   | { type: 'complete', completion: {
 *       type: 'normal' | 'return' | 'throw',
 *       value: unknown,
 *     } }
 * } GeneratorMachineResult
 *
 * @typedef {{
 *   resume(completion: GeneratorResumeCompletion): GeneratorMachineResult,
 * }} GeneratorContinuation
 */

/**
 * The Realm-owned iterator returned from a generator call. Its continuation is
 * a heap value, so no active evaluator or StackGuard frame survives suspension.
 */
export class GeneratorObject extends EngineObject {
  /**
   * @param {Realm} realm
   * @param {EngineObject} prototype
   * @param {GeneratorContinuation} continuation
   */
  constructor(realm, prototype, continuation) {
    super(prototype, 'Object', realm.agent);

    /** @type {Realm} */
    this.realm = realm;
    /** @type {GeneratorState} */
    this.state = 'suspendedStart';
    /** @type {GeneratorContinuation | null} */
    this.continuation = continuation;
  }

  /**
   * @param {GeneratorResumeCompletion} completion
   * @param {Realm} [resultRealm=this.realm]
   * @returns {EngineObject}
   */
  resume(completion, resultRealm = this.realm) {
    return this.realm.agent.withActiveExecutionRealm(this.realm, () => {
      if (this.state === 'executing') {
        throw new GuestErrorSignal('TypeError', 'Generator is already running');
      }

      if (this.state === 'completed') {
        return this.resumeCompleted(completion, resultRealm);
      }

      if (this.state === 'suspendedStart' && completion.type !== 'normal') {
        this.complete();

        if (completion.type === 'throw') {
          throw new ThrowSignal(completion.value);
        }

        return createIterResultObject(resultRealm, completion.value, true);
      }

      const continuation = this.continuation;

      if (continuation === null) {
        this.complete();
        throw new TypeError('Generator has no continuation');
      }

      const starting = this.state === 'suspendedStart';
      const guard = this.realm.stackGuard;
      const agent = this.realm.agent;

      const hostChain = agent.enterGeneratorHostChain(guard.maxDepth);

      try {
        linkValueToGeneratorHostChain(this.realm, completion.value);
        guard.enter();
        this.state = 'executing';

        try {
          const result = continuation.resume(
            starting ? { type: 'normal', value: undefined } : completion,
          );

          if (result.type === 'yield') {
            this.state = 'suspendedYield';
            return createIterResultObject(this.realm, result.value, false);
          }

          if (result.type === 'yield-result') {
            if (!(result.result instanceof EngineObject)) {
              throw new TypeError(
                'Generator continuation returned an invalid yield result',
              );
            }

            this.state = 'suspendedYield';
            return result.result;
          }

          if (result.type !== 'complete') {
            throw new TypeError(
              'Generator continuation returned an invalid result',
            );
          }

          this.complete();

          switch (result.completion.type) {
            case 'normal':
              return createIterResultObject(resultRealm, undefined, true);
            case 'return':
              return createIterResultObject(
                resultRealm,
                result.completion.value,
                true,
              );
            case 'throw':
              throw new ThrowSignal(result.completion.value);
          }
        } catch (error) {
          this.complete();
          throw error;
        } finally {
          guard.exit();
        }
      } finally {
        agent.exitGeneratorHostChain(hostChain);
      }

      throw new TypeError(
        'Generator continuation returned an invalid completion',
      );
    });
  }

  /**
   * @param {GeneratorResumeCompletion} completion
   * @param {Realm} resultRealm
   * @returns {EngineObject}
   */
  resumeCompleted(completion, resultRealm) {
    if (completion.type === 'throw') {
      throw new ThrowSignal(completion.value);
    }

    return createIterResultObject(
      resultRealm,
      completion.type === 'return' ? completion.value : undefined,
      true,
    );
  }

  /**
   * @returns {void}
   */
  complete() {
    this.state = 'completed';
    this.continuation = null;
  }
}
