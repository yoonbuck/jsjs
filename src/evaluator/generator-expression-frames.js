import {
  Reference,
  getValue,
  isEnvironmentRecord,
  putValue,
} from '../runtime/reference.js';
import { getSuperHomeObject, getThisBinding } from '../runtime/environment.js';
import { EngineObject } from '../runtime/object.js';
import { EngineArray } from '../runtime/array-object.js';
import { isCallable, isConstructor } from '../runtime/descriptors.js';
import {
  checkObjectCoercible,
  toBoolean,
  toInt32,
  toNumber,
  toObject,
  toPropertyKey,
  toString,
} from '../runtime/conversion.js';
import {
  abstractEqualityComparison,
  abstractRelationalComparison,
  add,
  bitwiseAND,
  bitwiseOR,
  bitwiseXOR,
  divide,
  leftShift,
  multiply,
  remainder,
  signedRightShift,
  strictEqualityComparison,
  subtract,
  typeOf,
  unsignedRightShift,
} from '../runtime/operators.js';
import {
  createUnsupportedNodeError,
  createUnsupportedOperationError,
  createUnsupportedOperatorError,
} from '../runtime/errors.js';
import { GuestErrorSignal } from '../runtime/completion.js';
import { SuperReferenceBase } from '../runtime/super-reference.js';
import { constructSuper } from '../runtime/function-object.js';
import { evaluateExpression, evaluateExpressionValue } from './expressions.js';
import { iterableToList } from './iteration.js';
import { performEval } from './eval.js';
import { propertyNameFromValue } from './property-name.js';
import {
  captureGeneratorOperation,
  generatorContainsYield,
  takeGeneratorInput,
  takeGeneratorOutput,
} from './generator-machine.js';

/**
 * @typedef {import('./index.js').EvaluationContext} EvaluationContext
 * @typedef {import('./generator-machine.js').GeneratorExecution}
 *   GeneratorExecution
 * @typedef {import('./generator-machine.js').GeneratorFrameAction}
 *   GeneratorFrameAction
 * @typedef {'value' | 'reference'} ExpressionResultMode
 *
 * @typedef {{
 *   kind: 'sync-expression',
 *   node: any,
 *   context: EvaluationContext,
 *   resultMode: ExpressionResultMode,
 * }} SyncExpressionFrame
 * @typedef {{
 *   kind: 'yield',
 *   node: any,
 *   context: EvaluationContext,
 *   resultMode: ExpressionResultMode,
 *   phase: 'start' | 'argument' | 'suspended',
 * }} YieldFrame
 * @typedef {{
 *   kind: 'binary',
 *   node: any,
 *   context: EvaluationContext,
 *   resultMode: ExpressionResultMode,
 *   phase: 'start' | 'left' | 'right',
 *   left: unknown,
 * }} BinaryFrame
 * @typedef {{
 *   kind: 'logical',
 *   node: any,
 *   context: EvaluationContext,
 *   resultMode: ExpressionResultMode,
 *   phase: 'start' | 'left' | 'right',
 *   left: unknown,
 * }} LogicalFrame
 * @typedef {{
 *   kind: 'conditional',
 *   node: any,
 *   context: EvaluationContext,
 *   resultMode: ExpressionResultMode,
 *   phase: 'start' | 'test' | 'branch',
 * }} ConditionalFrame
 * @typedef {{
 *   kind: 'sequence',
 *   node: any,
 *   context: EvaluationContext,
 *   resultMode: ExpressionResultMode,
 *   phase: 'next' | 'expression',
 *   index: number,
 *   value: unknown,
 * }} SequenceFrame
 * @typedef {{
 *   kind: 'member',
 *   node: any,
 *   context: EvaluationContext,
 *   resultMode: ExpressionResultMode,
 *   phase: 'start' | 'object' | 'property',
 *   base: unknown,
 *   property: unknown,
 *   homeObject: EngineObject | null,
 *   thisValue: unknown,
 * }} MemberFrame
 * @typedef {{
 *   kind: 'assignment',
 *   node: any,
 *   context: EvaluationContext,
 *   resultMode: ExpressionResultMode,
 *   phase: 'start' | 'left' | 'right',
 *   reference: Reference | null,
 *   leftValue: unknown,
 * }} AssignmentFrame
 * @typedef {{
 *   kind: 'unary',
 *   node: any,
 *   context: EvaluationContext,
 *   resultMode: ExpressionResultMode,
 *   phase: 'start' | 'argument',
 * }} UnaryFrame
 * @typedef {{
 *   kind: 'update',
 *   node: any,
 *   context: EvaluationContext,
 *   resultMode: ExpressionResultMode,
 *   phase: 'start' | 'argument',
 * }} UpdateFrame
 * @typedef {{
 *   kind: 'call',
 *   node: any,
 *   context: EvaluationContext,
 *   resultMode: ExpressionResultMode,
 *   phase: 'start' | 'callee' | 'argument' | 'invoke',
 *   calleeReference: Reference | null,
 *   callee: unknown,
 *   thisValue: unknown,
 *   args: unknown[],
 *   index: number,
 *   superCall: boolean,
 * }} CallFrame
 * @typedef {{
 *   kind: 'new',
 *   node: any,
 *   context: EvaluationContext,
 *   resultMode: ExpressionResultMode,
 *   phase: 'start' | 'callee' | 'argument' | 'construct',
 *   callee: unknown,
 *   args: unknown[],
 *   index: number,
 * }} NewFrame
 * @typedef {{
 *   kind: 'array-literal',
 *   node: any,
 *   context: EvaluationContext,
 *   resultMode: ExpressionResultMode,
 *   phase: 'next' | 'element',
 *   index: number,
 *   arrayIndex: number,
 *   array: EngineArray,
 * }} ArrayLiteralFrame
 * @typedef {{
 *   kind: 'template',
 *   node: any,
 *   context: EvaluationContext,
 *   resultMode: ExpressionResultMode,
 *   phase: 'start' | 'expression',
 *   index: number,
 *   value: string,
 * }} TemplateFrame
 * @typedef {{
 *   kind: 'tagged-template',
 *   node: any,
 *   context: EvaluationContext,
 *   resultMode: ExpressionResultMode,
 *   phase: 'start' | 'tag' | 'expression' | 'invoke',
 *   tagReference: Reference | null,
 *   tag: unknown,
 *   thisValue: unknown,
 *   args: unknown[],
 *   index: number,
 * }} TaggedTemplateFrame
 * @typedef {SyncExpressionFrame | YieldFrame | BinaryFrame | LogicalFrame
 *   | ConditionalFrame | SequenceFrame | MemberFrame | AssignmentFrame
 *   | UnaryFrame | UpdateFrame | CallFrame | NewFrame | ArrayLiteralFrame
 *   | TemplateFrame | TaggedTemplateFrame} GeneratorExpressionFrame
 */

const SUPPORTED_BINARY_OPERATORS = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '==',
  '!=',
  '===',
  '!==',
  '<',
  '<=',
  '>',
  '>=',
  '<<',
  '>>',
  '>>>',
  '&',
  '^',
  '|',
  'in',
  'instanceof',
]);

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @param {ExpressionResultMode} [resultMode='value']
 * @returns {GeneratorExpressionFrame}
 */
export function createGeneratorExpressionFrame(
  node,
  context,
  resultMode = 'value',
) {
  if (!generatorContainsYield(node, context)) {
    return { kind: 'sync-expression', node, context, resultMode };
  }

  switch (node.type) {
    case 'YieldExpression':
      return { kind: 'yield', node, context, resultMode, phase: 'start' };
    case 'BinaryExpression':
      return {
        kind: 'binary',
        node,
        context,
        resultMode,
        phase: 'start',
        left: undefined,
      };
    case 'LogicalExpression':
      return {
        kind: 'logical',
        node,
        context,
        resultMode,
        phase: 'start',
        left: undefined,
      };
    case 'ConditionalExpression':
      return {
        kind: 'conditional',
        node,
        context,
        resultMode,
        phase: 'start',
      };
    case 'SequenceExpression':
      return {
        kind: 'sequence',
        node,
        context,
        resultMode,
        phase: 'next',
        index: 0,
        value: undefined,
      };
    case 'MemberExpression':
      return {
        kind: 'member',
        node,
        context,
        resultMode,
        phase: 'start',
        base: undefined,
        property: undefined,
        homeObject: null,
        thisValue: undefined,
      };
    case 'AssignmentExpression':
      return {
        kind: 'assignment',
        node,
        context,
        resultMode,
        phase: 'start',
        reference: null,
        leftValue: undefined,
      };
    case 'UnaryExpression':
      return {
        kind: 'unary',
        node,
        context,
        resultMode,
        phase: 'start',
      };
    case 'UpdateExpression':
      return {
        kind: 'update',
        node,
        context,
        resultMode,
        phase: 'start',
      };
    case 'CallExpression':
      return {
        kind: 'call',
        node,
        context,
        resultMode,
        phase: 'start',
        calleeReference: null,
        callee: undefined,
        thisValue: undefined,
        args: [],
        index: 0,
        superCall: node.callee.type === 'Super',
      };
    case 'NewExpression':
      return {
        kind: 'new',
        node,
        context,
        resultMode,
        phase: 'start',
        callee: undefined,
        args: [],
        index: 0,
      };
    case 'ArrayExpression':
      return {
        kind: 'array-literal',
        node,
        context,
        resultMode,
        phase: 'next',
        index: 0,
        arrayIndex: 0,
        array: new EngineArray(context.realm.intrinsics.arrayPrototype),
      };
    case 'TemplateLiteral':
      return {
        kind: 'template',
        node,
        context,
        resultMode,
        phase: 'start',
        index: 0,
        value: '',
      };
    case 'TaggedTemplateExpression':
      return {
        kind: 'tagged-template',
        node,
        context,
        resultMode,
        phase: 'start',
        tagReference: null,
        tag: undefined,
        thisValue: undefined,
        args: [],
        index: 0,
      };
    default:
      throw createUnsupportedNodeError(node);
  }
}

/**
 * @param {GeneratorExecution} execution
 * @param {GeneratorExpressionFrame} frame
 * @returns {GeneratorFrameAction}
 */
export function dispatchGeneratorExpressionFrame(execution, frame) {
  switch (frame.kind) {
    case 'sync-expression':
      return dispatchSyncExpression(execution, frame);
    case 'yield':
      return dispatchYield(execution, frame);
    case 'binary':
      return dispatchBinary(execution, frame);
    case 'logical':
      return dispatchLogical(execution, frame);
    case 'conditional':
      return dispatchConditional(execution, frame);
    case 'sequence':
      return dispatchSequence(execution, frame);
    case 'member':
      return dispatchMember(execution, frame);
    case 'assignment':
      return dispatchAssignment(execution, frame);
    case 'unary':
      return dispatchUnary(execution, frame);
    case 'update':
      return dispatchUpdate(execution, frame);
    case 'call':
      return dispatchCall(execution, frame);
    case 'new':
      return dispatchNew(execution, frame);
    case 'array-literal':
      return dispatchArrayLiteral(execution, frame);
    case 'template':
      return dispatchTemplate(execution, frame);
    case 'tagged-template':
      return dispatchTaggedTemplate(execution, frame);
  }
}

/**
 * @param {GeneratorExecution} execution
 * @param {SyncExpressionFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchSyncExpression(execution, frame) {
  return {
    type: 'pop',
    result: captureGeneratorOperation(execution.realm, () =>
      frame.resultMode === 'reference'
        ? evaluateExpression(frame.node, frame.context)
        : evaluateExpressionValue(frame.node, frame.context),
    ),
  };
}

/**
 * @param {GeneratorExecution} execution
 * @param {YieldFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchYield(execution, frame) {
  if (frame.node.delegate) {
    throw createUnsupportedOperationError('yield*');
  }

  if (frame.phase === 'start') {
    if (frame.node.argument === null || frame.node.argument === undefined) {
      frame.phase = 'suspended';
      return { type: 'yield', value: undefined };
    }

    frame.phase = 'argument';
    return pushExpression(frame.node.argument, frame.context, 'value');
  }

  if (frame.phase === 'argument') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('Yield argument expected a value');
    }

    frame.phase = 'suspended';
    return { type: 'yield', value: result.value };
  }

  const completion = takeGeneratorInput(execution);

  return completion.type === 'normal'
    ? finishValue(completion.value)
    : {
        type: 'pop',
        result: { type: 'completion', completion },
      };
}

/**
 * @param {GeneratorExecution} execution
 * @param {BinaryFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchBinary(execution, frame) {
  if (frame.phase === 'start') {
    if (!SUPPORTED_BINARY_OPERATORS.has(frame.node.operator)) {
      throw createUnsupportedOperatorError('binary', frame.node.operator);
    }

    frame.phase = 'left';
    return pushExpression(frame.node.left, frame.context, 'value');
  }

  const result = takeGeneratorOutput(execution);

  if (result.type === 'completion') {
    return { type: 'pop', result };
  }

  if (result.type !== 'value') {
    throw new TypeError('Binary operand expected a value');
  }

  if (frame.phase === 'left') {
    frame.left = result.value;
    frame.phase = 'right';
    return pushExpression(frame.node.right, frame.context, 'value');
  }

  return popOperation(execution, () =>
    applyBinaryOperator(frame.node.operator, frame.left, result.value),
  );
}

/**
 * @param {GeneratorExecution} execution
 * @param {LogicalFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchLogical(execution, frame) {
  if (frame.phase === 'start') {
    if (frame.node.operator !== '&&' && frame.node.operator !== '||') {
      throw createUnsupportedOperatorError('logical', frame.node.operator);
    }

    frame.phase = 'left';
    return pushExpression(frame.node.left, frame.context, 'value');
  }

  const result = takeGeneratorOutput(execution);

  if (result.type === 'completion') {
    return { type: 'pop', result };
  }

  if (result.type !== 'value') {
    throw new TypeError('Logical operand expected a value');
  }

  if (frame.phase === 'left') {
    frame.left = result.value;
    const truthy = toBoolean(frame.left);
    const evaluateRight = frame.node.operator === '&&' ? truthy : !truthy;

    if (!evaluateRight) {
      return finishValue(frame.left);
    }

    frame.phase = 'right';
    return pushExpression(frame.node.right, frame.context, 'value');
  }

  return finishValue(result.value);
}

/**
 * @param {GeneratorExecution} execution
 * @param {ConditionalFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchConditional(execution, frame) {
  if (frame.phase === 'start') {
    frame.phase = 'test';
    return pushExpression(frame.node.test, frame.context, 'value');
  }

  const result = takeGeneratorOutput(execution);

  if (result.type === 'completion') {
    return { type: 'pop', result };
  }

  if (result.type !== 'value') {
    throw new TypeError('Conditional operand expected a value');
  }

  if (frame.phase === 'test') {
    frame.phase = 'branch';
    return pushExpression(
      toBoolean(result.value) ? frame.node.consequent : frame.node.alternate,
      frame.context,
      'value',
    );
  }

  return finishValue(result.value);
}

/**
 * @param {GeneratorExecution} execution
 * @param {SequenceFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchSequence(execution, frame) {
  if (frame.phase === 'expression') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('Sequence operand expected a value');
    }

    frame.value = result.value;
    frame.index += 1;
    frame.phase = 'next';
  }

  if (frame.index >= frame.node.expressions.length) {
    return finishValue(frame.value);
  }

  frame.phase = 'expression';
  return pushExpression(
    frame.node.expressions[frame.index],
    frame.context,
    'value',
  );
}

/**
 * @param {GeneratorExecution} execution
 * @param {MemberFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchMember(execution, frame) {
  if (frame.phase === 'start') {
    if (frame.node.object.type === 'Super') {
      const state = captureGeneratorOperation(execution.realm, () => ({
        homeObject: getSuperHomeObject(frame.context.functionEnvironment),
        thisValue: getContextThisBinding(frame.context),
      }));

      if (state.type === 'completion') {
        return { type: 'pop', result: state };
      }

      if (state.type !== 'value') {
        throw new TypeError('Super member state expected a value');
      }

      const saved =
        /** @type {{ homeObject: EngineObject, thisValue: unknown }} */ (
          state.value
        );
      frame.homeObject = saved.homeObject;
      frame.thisValue = saved.thisValue;

      if (!frame.node.computed) {
        frame.property = frame.node.property.name;
        return finishMemberReference(execution, frame);
      }

      frame.phase = 'property';
      return pushExpression(frame.node.property, frame.context, 'value');
    }

    frame.phase = 'object';
    return pushExpression(frame.node.object, frame.context, 'value');
  }

  const result = takeGeneratorOutput(execution);

  if (result.type === 'completion') {
    return { type: 'pop', result };
  }

  if (result.type !== 'value') {
    throw new TypeError('Member operand expected a value');
  }

  if (frame.phase === 'object') {
    frame.base = result.value;

    if (!frame.node.computed) {
      frame.property = frame.node.property.name;
      return finishMemberReference(execution, frame);
    }

    frame.phase = 'property';
    return pushExpression(frame.node.property, frame.context, 'value');
  }

  frame.property = result.value;
  return finishMemberReference(execution, frame);
}

/**
 * @param {GeneratorExecution} execution
 * @param {MemberFrame} frame
 * @returns {GeneratorFrameAction}
 */
function finishMemberReference(execution, frame) {
  const result = captureGeneratorOperation(execution.realm, () => {
    if (frame.node.object.type === 'Super') {
      if (frame.homeObject === null) {
        throw new TypeError('Super member is missing its home object');
      }

      return new Reference(
        new SuperReferenceBase(frame.homeObject, frame.thisValue),
        propertyNameFromValue(
          frame.node.property,
          frame.node.computed,
          frame.property,
        ),
        frame.context.strict,
        frame.thisValue,
      );
    }

    checkObjectCoercible(frame.base);
    return new Reference(
      toObjectBase(frame.context.realm, frame.base),
      propertyNameFromValue(
        frame.node.property,
        frame.node.computed,
        frame.property,
      ),
      frame.context.strict,
      frame.base,
    );
  });

  if (result.type === 'completion') {
    return { type: 'pop', result };
  }

  if (result.type !== 'reference') {
    throw new TypeError('Member expression did not create a reference');
  }

  if (frame.resultMode === 'reference') {
    return { type: 'pop', result };
  }

  return popOperation(execution, () => getValue(result.reference));
}

/**
 * @param {GeneratorExecution} execution
 * @param {AssignmentFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchAssignment(execution, frame) {
  if (frame.phase === 'start') {
    if (
      frame.node.left.type !== 'Identifier' &&
      frame.node.left.type !== 'MemberExpression'
    ) {
      throw createUnsupportedNodeError(frame.node.left);
    }

    frame.phase = 'left';
    return pushExpression(frame.node.left, frame.context, 'reference');
  }

  const result = takeGeneratorOutput(execution);

  if (result.type === 'completion') {
    return { type: 'pop', result };
  }

  if (frame.phase === 'left') {
    if (result.type !== 'reference') {
      throw new TypeError('Assignment target did not produce a reference');
    }

    frame.reference = result.reference;

    if (frame.node.operator !== '=') {
      const binaryOperator = frame.node.operator.slice(0, -1);

      if (!SUPPORTED_BINARY_OPERATORS.has(binaryOperator)) {
        throw createUnsupportedOperatorError('assignment', frame.node.operator);
      }

      const oldValue = captureGeneratorOperation(execution.realm, () =>
        getValue(result.reference),
      );

      if (oldValue.type === 'completion') {
        return { type: 'pop', result: oldValue };
      }

      if (oldValue.type !== 'value') {
        throw new TypeError('Compound assignment expected an old value');
      }

      frame.leftValue = oldValue.value;
    }

    frame.phase = 'right';
    return pushExpression(frame.node.right, frame.context, 'value');
  }

  if (result.type !== 'value') {
    throw new TypeError('Assignment right-hand side expected a value');
  }

  const reference = frame.reference;

  if (reference === null) {
    throw new TypeError('Assignment frame lost its target reference');
  }

  return popOperation(execution, () => {
    const value =
      frame.node.operator === '='
        ? result.value
        : applyBinaryOperator(
            frame.node.operator.slice(0, -1),
            frame.leftValue,
            result.value,
          );
    putValue(reference, value);
    return value;
  });
}

/**
 * @param {GeneratorExecution} execution
 * @param {UnaryFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchUnary(execution, frame) {
  if (frame.phase === 'start') {
    frame.phase = 'argument';
    return pushExpression(
      frame.node.argument,
      frame.context,
      frame.node.operator === 'delete' || frame.node.operator === 'typeof'
        ? 'reference'
        : 'value',
    );
  }

  const result = takeGeneratorOutput(execution);

  if (result.type === 'completion') {
    return { type: 'pop', result };
  }

  return popOperation(execution, () =>
    applyUnaryOperator(frame.node.operator, result),
  );
}

/**
 * @param {GeneratorExecution} execution
 * @param {UpdateFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchUpdate(execution, frame) {
  if (frame.phase === 'start') {
    if (
      frame.node.argument.type !== 'Identifier' &&
      frame.node.argument.type !== 'MemberExpression'
    ) {
      throw createUnsupportedNodeError(frame.node.argument);
    }

    frame.phase = 'argument';
    return pushExpression(frame.node.argument, frame.context, 'reference');
  }

  const result = takeGeneratorOutput(execution);

  if (result.type === 'completion') {
    return { type: 'pop', result };
  }

  if (result.type !== 'reference') {
    throw new TypeError('Update target did not produce a reference');
  }

  return popOperation(execution, () => {
    const oldValue = toNumber(getValue(result.reference));
    const newValue = frame.node.operator === '++' ? oldValue + 1 : oldValue - 1;
    putValue(result.reference, newValue);
    return frame.node.prefix ? newValue : oldValue;
  });
}

/**
 * @param {GeneratorExecution} execution
 * @param {CallFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchCall(execution, frame) {
  if (frame.phase === 'start') {
    if (frame.superCall) {
      const state = captureGeneratorOperation(execution.realm, () => {
        const functionEnvironment = frame.context.functionEnvironment;

        if (
          functionEnvironment === undefined ||
          functionEnvironment.activeConstructor === undefined
        ) {
          throw new GuestErrorSignal(
            'ReferenceError',
            "'super' call is only valid in a derived constructor",
          );
        }

        return functionEnvironment;
      });

      if (state.type === 'completion') {
        return { type: 'pop', result: state };
      }

      frame.phase = 'invoke';
      return nextCallArgumentOrInvoke(execution, frame);
    }

    frame.phase = 'callee';
    return pushExpression(frame.node.callee, frame.context, 'reference');
  }

  if (frame.phase === 'callee') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type === 'reference') {
      frame.calleeReference = result.reference;
      const calleeState = captureGeneratorOperation(execution.realm, () => ({
        callee: getValue(result.reference),
        thisValue: referenceThisValue(result.reference),
      }));

      if (calleeState.type === 'completion') {
        return { type: 'pop', result: calleeState };
      }

      if (calleeState.type !== 'value') {
        throw new TypeError('Call callee state expected a value');
      }

      const saved = /** @type {{ callee: unknown, thisValue: unknown }} */ (
        calleeState.value
      );
      frame.callee = saved.callee;
      frame.thisValue = saved.thisValue;
    } else {
      frame.callee = result.value;
      frame.thisValue = undefined;
    }

    frame.phase = 'invoke';
    return nextCallArgumentOrInvoke(execution, frame);
  }

  if (frame.phase === 'argument') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('Call argument expected a value');
    }

    const argument = frame.node.arguments[frame.index];

    if (argument.type === 'SpreadElement') {
      const spread = captureGeneratorOperation(execution.realm, () =>
        iterableToList(execution.realm, result.value),
      );

      if (spread.type === 'completion') {
        return { type: 'pop', result: spread };
      }

      if (spread.type !== 'value' || !Array.isArray(spread.value)) {
        throw new TypeError('Spread argument did not produce a value list');
      }

      for (const value of spread.value) {
        frame.args.push(value);
      }
    } else {
      frame.args.push(result.value);
    }

    frame.index += 1;
    frame.phase = 'invoke';
    return nextCallArgumentOrInvoke(execution, frame);
  }

  return invokeCall(execution, frame);
}

/**
 * @param {GeneratorExecution} execution
 * @param {CallFrame} frame
 * @returns {GeneratorFrameAction}
 */
function nextCallArgumentOrInvoke(execution, frame) {
  if (frame.index >= frame.node.arguments.length) {
    return invokeCall(execution, frame);
  }

  const argument = frame.node.arguments[frame.index];
  frame.phase = 'argument';
  return pushExpression(
    argument.type === 'SpreadElement' ? argument.argument : argument,
    frame.context,
    'value',
  );
}

/**
 * @param {GeneratorExecution} execution
 * @param {CallFrame} frame
 * @returns {GeneratorFrameAction}
 */
function invokeCall(execution, frame) {
  return popOperation(execution, () => {
    if (frame.superCall) {
      const functionEnvironment = frame.context.functionEnvironment;

      if (functionEnvironment === undefined) {
        throw new TypeError('Super call lost its function environment');
      }

      return constructSuper(frame.args, functionEnvironment);
    }

    if (!isCallable(frame.callee)) {
      throw new GuestErrorSignal(
        'TypeError',
        `${describeCallee(frame.node.callee)} is not a function`,
      );
    }

    if (
      isDirectEvalCall(
        frame.node.callee,
        frame.calleeReference,
        frame.callee,
        frame.context,
      )
    ) {
      return performEval(frame.args[0], frame.context);
    }

    return /** @type {import('../runtime/descriptors.js').CallableLike} */ (
      frame.callee
    ).callFunction(frame.thisValue, frame.args);
  });
}

/**
 * @param {GeneratorExecution} execution
 * @param {NewFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchNew(execution, frame) {
  if (frame.phase === 'start') {
    frame.phase = 'callee';
    return pushExpression(frame.node.callee, frame.context, 'value');
  }

  if (frame.phase === 'callee') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('New callee expected a value');
    }

    frame.callee = result.value;
    frame.phase = 'construct';
    return nextNewArgumentOrConstruct(execution, frame);
  }

  if (frame.phase === 'argument') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('Constructor argument expected a value');
    }

    const argument = (frame.node.arguments ?? [])[frame.index];

    if (argument.type === 'SpreadElement') {
      const spread = captureGeneratorOperation(execution.realm, () =>
        iterableToList(execution.realm, result.value),
      );

      if (spread.type === 'completion') {
        return { type: 'pop', result: spread };
      }

      if (spread.type !== 'value' || !Array.isArray(spread.value)) {
        throw new TypeError('Spread argument did not produce a value list');
      }

      for (const value of spread.value) {
        frame.args.push(value);
      }
    } else {
      frame.args.push(result.value);
    }

    frame.index += 1;
    frame.phase = 'construct';
    return nextNewArgumentOrConstruct(execution, frame);
  }

  return constructNew(execution, frame);
}

/**
 * @param {GeneratorExecution} execution
 * @param {NewFrame} frame
 * @returns {GeneratorFrameAction}
 */
function nextNewArgumentOrConstruct(execution, frame) {
  const argumentsList = frame.node.arguments ?? [];

  if (frame.index >= argumentsList.length) {
    return constructNew(execution, frame);
  }

  const argument = argumentsList[frame.index];
  frame.phase = 'argument';
  return pushExpression(
    argument.type === 'SpreadElement' ? argument.argument : argument,
    frame.context,
    'value',
  );
}

/**
 * @param {GeneratorExecution} execution
 * @param {NewFrame} frame
 * @returns {GeneratorFrameAction}
 */
function constructNew(execution, frame) {
  return popOperation(execution, () => {
    if (!isConstructor(frame.callee)) {
      throw new GuestErrorSignal(
        'TypeError',
        `${describeCallee(frame.node.callee)} is not a constructor`,
      );
    }

    const constructed =
      /** @type {{
       *   constructFunction(args?: readonly unknown[]): unknown,
       * }} */ (frame.callee).constructFunction(frame.args);
    return constructed;
  });
}

/**
 * @param {GeneratorExecution} execution
 * @param {ArrayLiteralFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchArrayLiteral(execution, frame) {
  if (frame.phase === 'element') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('Array element expected a value');
    }

    const element = frame.node.elements[frame.index];

    if (element.type === 'SpreadElement') {
      const spread = captureGeneratorOperation(execution.realm, () =>
        iterableToList(execution.realm, result.value),
      );

      if (spread.type === 'completion') {
        return { type: 'pop', result: spread };
      }

      if (spread.type !== 'value' || !Array.isArray(spread.value)) {
        throw new TypeError('Spread element did not produce a value list');
      }

      for (const value of spread.value) {
        defineArrayElement(frame.array, frame.arrayIndex, value);
        frame.arrayIndex += 1;
      }
    } else {
      defineArrayElement(frame.array, frame.arrayIndex, result.value);
      frame.arrayIndex += 1;
    }

    frame.index += 1;
    frame.phase = 'next';
  }

  while (
    frame.index < frame.node.elements.length &&
    frame.node.elements[frame.index] === null
  ) {
    frame.index += 1;
    frame.arrayIndex += 1;
  }

  if (frame.index >= frame.node.elements.length) {
    frame.array.defineOwnProperty('length', { value: frame.arrayIndex });
    return finishValue(frame.array);
  }

  const element = frame.node.elements[frame.index];
  frame.phase = 'element';
  return pushExpression(
    element.type === 'SpreadElement' ? element.argument : element,
    frame.context,
    'value',
  );
}

/**
 * @param {GeneratorExecution} execution
 * @param {TemplateFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchTemplate(execution, frame) {
  if (frame.phase === 'start') {
    const initial = captureGeneratorOperation(execution.realm, () =>
      requiredCookedTemplateValue(frame.node.quasis[0]),
    );

    if (initial.type === 'completion') {
      return { type: 'pop', result: initial };
    }

    if (initial.type !== 'value' || typeof initial.value !== 'string') {
      throw new TypeError('Template head did not produce a string');
    }

    frame.value = initial.value;
    frame.phase = 'expression';

    if (frame.node.expressions.length === 0) {
      return finishValue(frame.value);
    }

    return pushExpression(
      frame.node.expressions[frame.index],
      frame.context,
      'value',
    );
  }

  const result = takeGeneratorOutput(execution);

  if (result.type === 'completion') {
    return { type: 'pop', result };
  }

  if (result.type !== 'value') {
    throw new TypeError('Template substitution expected a value');
  }

  const appended = captureGeneratorOperation(execution.realm, () => {
    frame.value += toString(result.value);
    frame.value += requiredCookedTemplateValue(
      frame.node.quasis[frame.index + 1],
    );
  });

  if (appended.type === 'completion') {
    return { type: 'pop', result: appended };
  }

  frame.index += 1;

  if (frame.index >= frame.node.expressions.length) {
    return finishValue(frame.value);
  }

  return pushExpression(
    frame.node.expressions[frame.index],
    frame.context,
    'value',
  );
}

/**
 * @param {GeneratorExecution} execution
 * @param {TaggedTemplateFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchTaggedTemplate(execution, frame) {
  if (frame.phase === 'start') {
    frame.phase = 'tag';
    return pushExpression(frame.node.tag, frame.context, 'reference');
  }

  if (frame.phase === 'tag') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type === 'reference') {
      frame.tagReference = result.reference;
      const tagState = captureGeneratorOperation(execution.realm, () => ({
        tag: getValue(result.reference),
        thisValue: referenceThisValue(result.reference),
      }));

      if (tagState.type === 'completion') {
        return { type: 'pop', result: tagState };
      }

      if (tagState.type !== 'value') {
        throw new TypeError('Tagged template state expected a value');
      }

      const saved = /** @type {{ tag: unknown, thisValue: unknown }} */ (
        tagState.value
      );
      frame.tag = saved.tag;
      frame.thisValue = saved.thisValue;
    } else {
      frame.tag = result.value;
      frame.thisValue = undefined;
    }

    const template = captureGeneratorOperation(execution.realm, () =>
      frame.context.realm.getTemplateObject(frame.node.quasi),
    );

    if (template.type === 'completion') {
      return { type: 'pop', result: template };
    }

    if (template.type !== 'value') {
      throw new TypeError('Template object expected a value');
    }

    frame.args.push(template.value);
    frame.phase = 'invoke';
    return nextTaggedSubstitutionOrInvoke(execution, frame);
  }

  if (frame.phase === 'expression') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('Tagged substitution expected a value');
    }

    frame.args.push(result.value);
    frame.index += 1;
    frame.phase = 'invoke';
    return nextTaggedSubstitutionOrInvoke(execution, frame);
  }

  return invokeTag(execution, frame);
}

/**
 * @param {GeneratorExecution} execution
 * @param {TaggedTemplateFrame} frame
 * @returns {GeneratorFrameAction}
 */
function nextTaggedSubstitutionOrInvoke(execution, frame) {
  if (frame.index >= frame.node.quasi.expressions.length) {
    return invokeTag(execution, frame);
  }

  frame.phase = 'expression';
  return pushExpression(
    frame.node.quasi.expressions[frame.index],
    frame.context,
    'value',
  );
}

/**
 * @param {GeneratorExecution} execution
 * @param {TaggedTemplateFrame} frame
 * @returns {GeneratorFrameAction}
 */
function invokeTag(execution, frame) {
  return popOperation(execution, () => {
    if (!isCallable(frame.tag)) {
      throw new GuestErrorSignal(
        'TypeError',
        `${describeCallee(frame.node.tag)} is not a function`,
      );
    }

    return /** @type {import('../runtime/descriptors.js').CallableLike} */ (
      frame.tag
    ).callFunction(frame.thisValue, frame.args);
  });
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @param {ExpressionResultMode} resultMode
 * @returns {GeneratorFrameAction}
 */
function pushExpression(node, context, resultMode) {
  return {
    type: 'push',
    frame: createGeneratorExpressionFrame(node, context, resultMode),
  };
}

/**
 * @param {unknown} value
 * @returns {GeneratorFrameAction}
 */
function finishValue(value) {
  return { type: 'pop', result: { type: 'value', value } };
}

/**
 * @param {GeneratorExecution} execution
 * @param {() => unknown} operation
 * @returns {GeneratorFrameAction}
 */
function popOperation(execution, operation) {
  return {
    type: 'pop',
    result: captureGeneratorOperation(execution.realm, operation),
  };
}

/**
 * @param {string} operator
 * @param {unknown} left
 * @param {unknown} right
 * @returns {unknown}
 */
function applyBinaryOperator(operator, left, right) {
  switch (operator) {
    case '+':
      return add(left, right);
    case '-':
      return subtract(left, right);
    case '*':
      return multiply(left, right);
    case '/':
      return divide(left, right);
    case '%':
      return remainder(left, right);
    case '==':
      return abstractEqualityComparison(left, right);
    case '!=':
      return !abstractEqualityComparison(left, right);
    case '===':
      return strictEqualityComparison(left, right);
    case '!==':
      return !strictEqualityComparison(left, right);
    case '<': {
      const result = abstractRelationalComparison(left, right, true);
      return result === undefined ? false : result;
    }
    case '>': {
      const result = abstractRelationalComparison(right, left, false);
      return result === undefined ? false : result;
    }
    case '<=': {
      const result = abstractRelationalComparison(right, left, false);
      return result === undefined || result === true ? false : true;
    }
    case '>=': {
      const result = abstractRelationalComparison(left, right, true);
      return result === undefined || result === true ? false : true;
    }
    case '<<':
      return leftShift(left, right);
    case '>>':
      return signedRightShift(left, right);
    case '>>>':
      return unsignedRightShift(left, right);
    case '&':
      return bitwiseAND(left, right);
    case '^':
      return bitwiseXOR(left, right);
    case 'in':
      if (!(right instanceof EngineObject)) {
        throwGuestTypeError(
          `Cannot use 'in' operator to search for key in ${
            right === null ? 'null' : typeof right
          }`,
        );
      }
      return right.hasProperty(toPropertyKey(left));
    case 'instanceof':
      if (!(right instanceof EngineObject)) {
        throwGuestTypeError("Right-hand side of 'instanceof' is not an object");
      }
      if (!isHasInstanceCallable(right)) {
        throwGuestTypeError("Right-hand side of 'instanceof' is not callable");
      }
      return right.hasInstance(left);
    default:
      return bitwiseOR(left, right);
  }
}

/**
 * @param {string} operator
 * @param {import('./generator-machine.js').FrameResult} result
 * @returns {unknown}
 */
function applyUnaryOperator(operator, result) {
  if (result.type === 'completion') {
    throw new TypeError('Unary operator received an abrupt completion');
  }

  if (operator === 'delete') {
    if (result.type !== 'reference') {
      return true;
    }

    if (result.reference.base === undefined) {
      return true;
    }

    if (isEnvironmentRecord(result.reference.base)) {
      return result.reference.base.deleteBinding(
        result.reference.referencedName,
      );
    }

    return /** @type {any} */ (result.reference.base).delete(
      result.reference.referencedName,
      result.reference.strict,
    );
  }

  if (operator === 'typeof') {
    if (result.type === 'reference' && result.reference.base === undefined) {
      return 'undefined';
    }

    return typeOf(
      result.type === 'reference' ? getValue(result.reference) : result.value,
    );
  }

  if (result.type !== 'value') {
    throw new TypeError(`Unary ${operator} expected a value`);
  }

  switch (operator) {
    case 'void':
      return undefined;
    case '!':
      return !toBoolean(result.value);
    case '-':
      return -toNumber(result.value);
    case '+':
      return toNumber(result.value);
    case '~':
      return ~toInt32(result.value);
    default:
      throw createUnsupportedOperatorError('unary', operator);
  }
}

/**
 * @param {import('../runtime/realm.js').Realm} realm
 * @param {unknown} value
 * @returns {EngineObject}
 */
function toObjectBase(realm, value) {
  return value instanceof EngineObject ? value : toObject(realm, value);
}

/**
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
function getContextThisBinding(context) {
  return context.functionEnvironment === undefined
    ? context.thisValue
    : getThisBinding(context.functionEnvironment);
}

/**
 * @param {Reference | null} reference
 * @returns {unknown}
 */
function referenceThisValue(reference) {
  if (reference instanceof Reference) {
    if (reference.thisValue !== undefined) {
      return reference.thisValue;
    }

    if (reference.base instanceof EngineObject) {
      return reference.base;
    }

    if (isEnvironmentRecord(reference.base)) {
      return reference.base.implicitThisValue();
    }
  }

  return undefined;
}

/**
 * @param {any} calleeNode
 * @param {Reference | null} calleeReference
 * @param {unknown} callee
 * @param {EvaluationContext} context
 * @returns {boolean}
 */
function isDirectEvalCall(calleeNode, calleeReference, callee, context) {
  return (
    calleeNode.type === 'Identifier' &&
    calleeNode.name === 'eval' &&
    calleeReference instanceof Reference &&
    isEnvironmentRecord(calleeReference.base) &&
    callee === context.realm.intrinsics.evalFunction
  );
}

/**
 * @param {unknown} value
 * @returns {value is import('../runtime/descriptors.js').CallableLike & {
 *   hasInstance(argument: unknown): boolean,
 * }}
 */
function isHasInstanceCallable(value) {
  return (
    isCallable(value) &&
    typeof (/** @type {any} */ (value).hasInstance) === 'function'
  );
}

/**
 * @param {any} node
 * @returns {string}
 */
function describeCallee(node) {
  return node.type === 'Identifier' ? node.name : 'expression';
}

/**
 * @param {EngineArray} array
 * @param {number} index
 * @param {unknown} value
 * @returns {void}
 */
function defineArrayElement(array, index, value) {
  array.defineOwnProperty(String(index), {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * @param {any} element
 * @returns {string}
 */
function requiredCookedTemplateValue(element) {
  const cooked = element?.value?.cooked;

  if (typeof cooked !== 'string') {
    throw new GuestErrorSignal(
      'SyntaxError',
      'Invalid cooked value in untagged template literal',
    );
  }

  return cooked;
}

/**
 * @param {string} message
 * @returns {never}
 */
function throwGuestTypeError(message) {
  throw new GuestErrorSignal('TypeError', message);
}
