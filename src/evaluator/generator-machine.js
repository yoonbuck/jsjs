import { Reference } from '../runtime/reference.js';
import {
  GuestErrorSignal,
  ThrowSignal,
  createThrowCompletion,
} from '../runtime/completion.js';
import {
  createStatementListFrame,
  dispatchGeneratorStatementFrame,
  isGeneratorStatementFrame,
} from './generator-statement-frames.js';
import { dispatchGeneratorExpressionFrame } from './generator-expression-frames.js';
import { createYieldClassification } from './static-semantics.js';

/**
 * @typedef {import('./index.js').EvaluationContext} EvaluationContext
 * @typedef {import('../runtime/function-object.js').EngineFunction} EngineFunction
 * @typedef {import('../runtime/generator-object.js').GeneratorResumeCompletion}
 *   GeneratorResumeCompletion
 * @typedef {import('../runtime/generator-object.js').GeneratorMachineResult}
 *   GeneratorMachineResult
 * @typedef {import('./generator-statement-frames.js').GeneratorStatementFrame}
 *   GeneratorStatementFrame
 * @typedef {import('./generator-expression-frames.js').GeneratorExpressionFrame}
 *   GeneratorExpressionFrame
 * @typedef {GeneratorStatementFrame | GeneratorExpressionFrame} GeneratorFrame
 *
 * @typedef {{ type: 'value', value: unknown }} GeneratorValueResult
 * @typedef {{ type: 'reference', reference: Reference }}
 *   GeneratorReferenceResult
 * @typedef {{
 *   type: 'completion',
 *   completion: {
 *     type: string,
 *     value: unknown,
 *     target?: string | undefined,
 *   },
 * }} GeneratorCompletionResult
 * @typedef {GeneratorValueResult | GeneratorReferenceResult
 *   | GeneratorCompletionResult} FrameResult
 *
 * @typedef {
 *   | { type: 'push', frame: GeneratorFrame }
 *   | { type: 'pop', result: FrameResult }
 *   | { type: 'yield', value: unknown }
 *   | { type: 'complete', completion: {
 *       type: 'normal' | 'return' | 'throw',
 *       value: unknown,
 *     } }
 * } GeneratorFrameAction
 */

/**
 * A generator activation represented entirely by heap records. Dispatching one
 * frame performs one finite step; suspension returns only after this loop and
 * every synchronous evaluator call below it have unwound.
 */
export class GeneratorExecution {
  /**
   * @param {{
   *   functionObject: EngineFunction,
   *   body: any[],
   *   context: EvaluationContext,
   * }} options
   */
  constructor({ functionObject, body, context }) {
    /** @type {EngineFunction} */
    this.functionObject = functionObject;
    /** @type {import('../runtime/realm.js').Realm} */
    this.realm = functionObject.realm;
    let yieldClassification = functionObject.generatorYieldClassification;

    if (yieldClassification === undefined) {
      yieldClassification = createYieldClassification(body);
      functionObject.generatorYieldClassification = yieldClassification;
    }

    /** @type {WeakMap<object, boolean>} */
    this.yieldClassification = yieldClassification;
    context.generatorYieldClassification = yieldClassification;
    /** @type {GeneratorFrame[]} */
    this.frames = [createStatementListFrame(body, context)];
    /** @type {GeneratorResumeCompletion | null} */
    this.input = null;
    /** @type {FrameResult | null} */
    this.output = null;
  }

  /**
   * @param {GeneratorResumeCompletion} completion
   * @returns {GeneratorMachineResult}
   */
  resume(completion) {
    this.input = completion;

    for (;;) {
      const frame = this.frames[this.frames.length - 1];

      if (frame === undefined) {
        return completeFromMachine(this.output);
      }

      const action = dispatchGeneratorFrame(this, frame);

      switch (action.type) {
        case 'push':
          if (this.output !== null) {
            throw new TypeError(
              'Generator pushed a frame before consuming its previous result',
            );
          }
          this.frames.push(action.frame);
          break;
        case 'pop':
          this.frames.pop();
          this.output = action.result;
          break;
        case 'yield':
          this.input = null;
          return action;
        case 'complete':
          this.frames.length = 0;
          this.output = null;
          this.input = null;
          return action;
      }
    }
  }
}

/**
 * @param {{
 *   functionObject: EngineFunction,
 *   body: any[],
 *   context: EvaluationContext,
 * }} options
 * @returns {GeneratorExecution}
 */
export function createGeneratorExecution(options) {
  return new GeneratorExecution(options);
}

/**
 * Reads the immutable classification snapshot installed when this generator
 * function first creates an execution.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {boolean}
 */
export function generatorContainsYield(node, context) {
  const classification = context.generatorYieldClassification;

  if (classification === undefined) {
    throw new TypeError(
      'Generator context is missing its yield classification',
    );
  }

  return (
    node !== null &&
    typeof node === 'object' &&
    classification.get(node) === true
  );
}

/**
 * Converts the two guest-abrupt host signals used by the synchronous evaluator
 * into the machine's completion channel. Host implementation errors remain host
 * errors.
 *
 * @param {import('../runtime/realm.js').Realm} realm
 * @param {() => unknown} operation
 * @returns {FrameResult}
 */
export function captureGeneratorOperation(realm, operation) {
  try {
    const result = operation();

    return result instanceof Reference
      ? { type: 'reference', reference: result }
      : { type: 'value', value: result };
  } catch (error) {
    if (error instanceof ThrowSignal) {
      return {
        type: 'completion',
        completion: createThrowCompletion(error.value),
      };
    }

    if (error instanceof GuestErrorSignal) {
      return {
        type: 'completion',
        completion: createThrowCompletion(
          realm.createGuestError(error.typeName, error.guestMessage),
        ),
      };
    }

    throw error;
  }
}

/**
 * @param {GeneratorExecution} execution
 * @returns {FrameResult}
 */
export function takeGeneratorOutput(execution) {
  const result = execution.output;

  if (result === null) {
    throw new TypeError('Generator frame expected a child result');
  }

  execution.output = null;
  return result;
}

/**
 * @param {GeneratorExecution} execution
 * @returns {GeneratorResumeCompletion}
 */
export function takeGeneratorInput(execution) {
  const completion = execution.input;

  if (completion === null) {
    throw new TypeError('Suspended yield has no resume completion');
  }

  execution.input = null;
  return completion;
}

/**
 * @param {GeneratorExecution} execution
 * @param {GeneratorFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchGeneratorFrame(execution, frame) {
  return isGeneratorStatementFrame(frame)
    ? dispatchGeneratorStatementFrame(execution, frame)
    : dispatchGeneratorExpressionFrame(execution, frame);
}

/**
 * @param {FrameResult | null} result
 * @returns {GeneratorMachineResult}
 */
function completeFromMachine(result) {
  if (result === null || result.type !== 'completion') {
    throw new TypeError('Generator machine ended without a completion');
  }

  const completion = result.completion;

  if (
    completion.type !== 'normal' &&
    completion.type !== 'return' &&
    completion.type !== 'throw'
  ) {
    throw new TypeError(
      `Unexpected ${completion.type} completion from a generator body`,
    );
  }

  return {
    type: 'complete',
    completion: {
      type: completion.type,
      value: completion.value,
    },
  };
}
