import {
  Reference,
  getValue,
  isEnvironmentRecord,
  putValue,
} from '../runtime/reference.js';
import {
  getIdentifierReference,
  getSuperHomeObject,
  getThisBinding,
} from '../runtime/environment.js';
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
import {
  createObjectLiteral,
  defineObjectLiteralProperty,
  evaluateExpression,
  evaluateExpressionValue,
} from './expressions.js';
import { iterableToList } from './iteration.js';
import { iteratorStep, iteratorValue } from '../runtime/iterator.js';
import { performEval } from './eval.js';
import {
  functionNameFromPropertyKey,
  propertyNameFromValue,
  toEvaluatedPropertyKey,
} from './property-name.js';
import {
  evaluateNamedExpression,
  isAnonymousClassExpression,
} from './declarations.js';
import {
  assignPreparedPatternTarget,
  closePatternIterator,
  createPatternIterator,
  initializePatternIdentifier,
  patternObjectValue,
} from './patterns.js';
import {
  applyClassHeritage,
  createClassDefinitionState,
  defineClassElement,
  finishClassDefinition,
} from './classes.js';
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
 * @typedef {import('../runtime/environment.js').EnvironmentRecordLike}
 *   EnvironmentRecordLike
 * @typedef {import('../runtime/iterator.js').IteratorRecord} IteratorRecord
 * @typedef {'value' | 'reference'} ExpressionResultMode
 *
 * @typedef {{
 *   kind: 'sync-expression',
 *   node: any,
 *   context: EvaluationContext,
 *   resultMode: ExpressionResultMode,
 * }} SyncExpressionFrame
 * @typedef {{
 *   kind: 'sync-named-expression',
 *   node: any,
 *   context: EvaluationContext,
 *   name: string,
 * }} SyncNamedExpressionFrame
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
 *   phase: 'start' | 'left' | 'right' | 'pattern-right' | 'pattern',
 *   reference: Reference | null,
 *   leftValue: unknown,
 *   rightValue: unknown,
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
 * @typedef {{
 *   kind: 'object-literal',
 *   node: any,
 *   context: EvaluationContext,
 *   resultMode: ExpressionResultMode,
 *   phase: 'next' | 'key' | 'value',
 *   object: EngineObject,
 *   index: number,
 *   key: string | symbol | null,
 * }} ObjectLiteralFrame
 * @typedef {{
 *   kind: 'class-definition',
 *   node: any,
 *   context: EvaluationContext,
 *   resultMode: ExpressionResultMode,
 *   bindingName: string,
 *   phase: 'start' | 'heritage' | 'elements' | 'key',
 *   state: ReturnType<typeof createClassDefinitionState> | null,
 *   index: number,
 * }} ClassDefinitionFrame
 * @typedef {
 *   | { kind: 'assignment' }
 *   | { kind: 'binding-initialization', env: EnvironmentRecordLike }
 *   | { kind: 'binding-assignment' }
 * } PatternTargetMode
 * @typedef {{
 *   kind: 'pattern-leaf',
 *   node: any,
 *   value: unknown,
 *   context: EvaluationContext,
 *   targetMode: PatternTargetMode,
 *   phase: 'start' | 'target',
 *   preparedTarget: unknown,
 *   hasPreparedTarget: boolean,
 * }} PatternLeafFrame
 * @typedef {{
 *   kind: 'pattern-default',
 *   node: any,
 *   value: unknown,
 *   context: EvaluationContext,
 *   targetMode: PatternTargetMode,
 *   phase: 'start' | 'target' | 'default' | 'pattern',
 *   preparedTarget: unknown,
 *   hasPreparedTarget: boolean,
 * }} PatternDefaultFrame
 * @typedef {{
 *   kind: 'pattern-rest',
 *   node: any,
 *   value: unknown,
 *   context: EvaluationContext,
 *   targetMode: PatternTargetMode,
 *   phase: 'start' | 'pattern',
 *   preparedTarget: unknown,
 *   hasPreparedTarget: boolean,
 * }} PatternRestFrame
 * @typedef {{
 *   kind: 'object-pattern',
 *   node: any,
 *   value: unknown,
 *   context: EvaluationContext,
 *   targetMode: PatternTargetMode,
 *   phase: 'start' | 'property',
 *   object: EngineObject | null,
 *   index: number,
 * }} ObjectPatternFrame
 * @typedef {{
 *   kind: 'object-pattern-property',
 *   node: any,
 *   object: EngineObject,
 *   receiver: unknown,
 *   context: EvaluationContext,
 *   targetMode: PatternTargetMode,
 *   phase: 'start' | 'key' | 'target' | 'pattern',
 *   key: string | symbol | null,
 *   preparedTarget: unknown,
 *   hasPreparedTarget: boolean,
 * }} ObjectPatternPropertyFrame
 * @typedef {{
 *   kind: 'array-pattern',
 *   node: any,
 *   value: unknown,
 *   context: EvaluationContext,
 *   targetMode: PatternTargetMode,
 *   phase: 'start' | 'next' | 'target' | 'pattern',
 *   record: IteratorRecord | null,
 *   done: boolean,
 *   index: number,
 *   preparedTarget: unknown,
 *   hasPreparedTarget: boolean,
 * }} ArrayPatternFrame
 * @typedef {{
 *   kind: 'pattern-target',
 *   node: any,
 *   context: EvaluationContext,
 *   targetMode: PatternTargetMode,
 *   phase: 'start' | 'identifier' | 'object' | 'property',
 *   base: unknown,
 *   property: unknown,
 *   homeObject: EngineObject | null,
 *   thisValue: unknown,
 * }} PatternTargetFrame
 * @typedef {PatternLeafFrame | PatternDefaultFrame | PatternRestFrame
 *   | ObjectPatternFrame | ObjectPatternPropertyFrame | ArrayPatternFrame}
 *   GeneratorPatternFrame
 * @typedef {SyncExpressionFrame | SyncNamedExpressionFrame
 *   | YieldFrame | BinaryFrame | LogicalFrame
 *   | ConditionalFrame | SequenceFrame | MemberFrame | AssignmentFrame
 *   | UnaryFrame | UpdateFrame | CallFrame | NewFrame | ArrayLiteralFrame
 *   | TemplateFrame | TaggedTemplateFrame | ObjectLiteralFrame
 *   | ClassDefinitionFrame | GeneratorPatternFrame | PatternTargetFrame}
 *   GeneratorExpressionFrame
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
        rightValue: undefined,
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
    case 'ObjectExpression':
      return {
        kind: 'object-literal',
        node,
        context,
        resultMode,
        phase: 'next',
        object: createObjectLiteral(context),
        index: 0,
        key: null,
      };
    case 'ClassExpression':
      return createGeneratorClassFrame(node, context, '', resultMode);
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
 * @param {any} node
 * @param {EvaluationContext} context
 * @param {string} name
 * @returns {GeneratorExpressionFrame}
 */
export function createNamedGeneratorExpressionFrame(node, context, name) {
  if (!generatorContainsYield(node, context)) {
    return { kind: 'sync-named-expression', node, context, name };
  }

  if (isAnonymousClassExpression(node)) {
    return createGeneratorClassFrame(node, context, name);
  }

  return createGeneratorExpressionFrame(node, context, 'value');
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @param {string} [bindingName='']
 * @param {ExpressionResultMode} [resultMode='value']
 * @returns {ClassDefinitionFrame}
 */
export function createGeneratorClassFrame(
  node,
  context,
  bindingName = '',
  resultMode = 'value',
) {
  return {
    kind: 'class-definition',
    node,
    context,
    resultMode,
    bindingName,
    phase: 'start',
    state: null,
    index: 0,
  };
}

/**
 * @param {any} pattern
 * @param {unknown} value
 * @param {EvaluationContext} context
 * @param {PatternTargetMode} targetMode
 * @param {unknown} [preparedTarget]
 * @param {boolean} [hasPreparedTarget=false]
 * @returns {GeneratorPatternFrame}
 */
export function createGeneratorPatternFrame(
  pattern,
  value,
  context,
  targetMode,
  preparedTarget,
  hasPreparedTarget = false,
) {
  switch (pattern.type) {
    case 'Identifier':
    case 'MemberExpression':
      return {
        kind: 'pattern-leaf',
        node: pattern,
        value,
        context,
        targetMode,
        phase: 'start',
        preparedTarget,
        hasPreparedTarget,
      };
    case 'AssignmentPattern':
      return {
        kind: 'pattern-default',
        node: pattern,
        value,
        context,
        targetMode,
        phase: 'start',
        preparedTarget,
        hasPreparedTarget,
      };
    case 'RestElement':
      return {
        kind: 'pattern-rest',
        node: pattern,
        value,
        context,
        targetMode,
        phase: 'start',
        preparedTarget,
        hasPreparedTarget,
      };
    case 'ObjectPattern':
      return {
        kind: 'object-pattern',
        node: pattern,
        value,
        context,
        targetMode,
        phase: 'start',
        object: null,
        index: 0,
      };
    case 'ArrayPattern':
      return {
        kind: 'array-pattern',
        node: pattern,
        value,
        context,
        targetMode,
        phase: 'start',
        record: null,
        done: false,
        index: 0,
        preparedTarget: undefined,
        hasPreparedTarget: false,
      };
    default:
      throw createUnsupportedNodeError(pattern);
  }
}

/**
 * @param {any} target
 * @param {EvaluationContext} context
 * @param {PatternTargetMode} targetMode
 * @returns {PatternTargetFrame}
 */
function createPatternTargetFrame(target, context, targetMode) {
  return {
    kind: 'pattern-target',
    node: target,
    context,
    targetMode,
    phase: 'start',
    base: undefined,
    property: undefined,
    homeObject: null,
    thisValue: undefined,
  };
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
    case 'sync-named-expression':
      return dispatchSyncNamedExpression(execution, frame);
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
    case 'object-literal':
      return dispatchObjectLiteral(execution, frame);
    case 'class-definition':
      return dispatchClassDefinition(execution, frame);
    case 'pattern-leaf':
      return dispatchPatternLeaf(execution, frame);
    case 'pattern-default':
      return dispatchPatternDefault(execution, frame);
    case 'pattern-rest':
      return dispatchPatternRest(execution, frame);
    case 'object-pattern':
      return dispatchObjectPattern(execution, frame);
    case 'object-pattern-property':
      return dispatchObjectPatternProperty(execution, frame);
    case 'array-pattern':
      return dispatchArrayPattern(execution, frame);
    case 'pattern-target':
      return dispatchPatternTarget(execution, frame);
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
 * @param {SyncNamedExpressionFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchSyncNamedExpression(execution, frame) {
  return {
    type: 'pop',
    result: captureGeneratorOperation(execution.realm, () =>
      evaluateNamedExpression(frame.node, frame.context, frame.name),
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
      frame.node.left.type === 'ObjectPattern' ||
      frame.node.left.type === 'ArrayPattern'
    ) {
      if (frame.node.operator !== '=') {
        throw createUnsupportedOperatorError('assignment', frame.node.operator);
      }

      frame.phase = 'pattern-right';
      return pushExpression(frame.node.right, frame.context, 'value');
    }

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

  if (frame.phase === 'pattern-right') {
    if (result.type !== 'value') {
      throw new TypeError('Destructuring assignment expected a right value');
    }

    frame.rightValue = result.value;
    frame.phase = 'pattern';
    return {
      type: 'push',
      frame: createGeneratorPatternFrame(
        frame.node.left,
        frame.rightValue,
        frame.context,
        { kind: 'assignment' },
      ),
    };
  }

  if (frame.phase === 'pattern') {
    if (result.type !== 'value') {
      throw new TypeError('Destructuring assignment pattern did not complete');
    }

    return finishValue(frame.rightValue);
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
    return {
      type: 'push',
      frame:
        frame.node.operator === '=' && frame.node.left.type === 'Identifier'
          ? createNamedGeneratorExpressionFrame(
              frame.node.right,
              frame.context,
              frame.node.left.name,
            )
          : createGeneratorExpressionFrame(
              frame.node.right,
              frame.context,
              'value',
            ),
    };
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
 * @param {PatternLeafFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchPatternLeaf(execution, frame) {
  if (frame.phase === 'start' && !frame.hasPreparedTarget) {
    frame.phase = 'target';
    return {
      type: 'push',
      frame: createPatternTargetFrame(
        frame.node,
        frame.context,
        frame.targetMode,
      ),
    };
  }

  if (frame.phase === 'target') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('Pattern target preparation expected a value');
    }

    frame.preparedTarget = result.value;
    frame.hasPreparedTarget = true;
  }

  return popOperation(execution, () => {
    applyPatternPreparedTarget(
      frame.preparedTarget,
      frame.value,
      frame.context,
    );
    return undefined;
  });
}

/**
 * @param {GeneratorExecution} execution
 * @param {PatternDefaultFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchPatternDefault(execution, frame) {
  if (frame.phase === 'start') {
    const target = simplePatternTarget(frame.node.left);

    if (!frame.hasPreparedTarget && target !== null) {
      frame.phase = 'target';
      return {
        type: 'push',
        frame: createPatternTargetFrame(
          target,
          frame.context,
          frame.targetMode,
        ),
      };
    }

    return beginPatternDefault(frame);
  }

  const result = takeGeneratorOutput(execution);

  if (result.type === 'completion') {
    return { type: 'pop', result };
  }

  if (result.type !== 'value') {
    throw new TypeError('Pattern default child expected a value');
  }

  if (frame.phase === 'target') {
    frame.preparedTarget = result.value;
    frame.hasPreparedTarget = true;
    return beginPatternDefault(frame);
  }

  if (frame.phase === 'default') {
    frame.value = result.value;
    frame.phase = 'pattern';
    return pushPattern(
      frame.node.left,
      frame.value,
      frame.context,
      frame.targetMode,
      frame.preparedTarget,
      frame.hasPreparedTarget,
    );
  }

  return finishValue(undefined);
}

/**
 * @param {PatternDefaultFrame} frame
 * @returns {GeneratorFrameAction}
 */
function beginPatternDefault(frame) {
  if (frame.value === undefined) {
    frame.phase = 'default';
    return {
      type: 'push',
      frame:
        frame.node.left.type === 'Identifier'
          ? createNamedGeneratorExpressionFrame(
              frame.node.right,
              frame.context,
              frame.node.left.name,
            )
          : createGeneratorExpressionFrame(
              frame.node.right,
              frame.context,
              'value',
            ),
    };
  }

  frame.phase = 'pattern';
  return pushPattern(
    frame.node.left,
    frame.value,
    frame.context,
    frame.targetMode,
    frame.preparedTarget,
    frame.hasPreparedTarget,
  );
}

/**
 * @param {GeneratorExecution} execution
 * @param {PatternRestFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchPatternRest(execution, frame) {
  if (frame.phase === 'start') {
    frame.phase = 'pattern';
    return pushPattern(
      frame.node.argument,
      frame.value,
      frame.context,
      frame.targetMode,
      frame.preparedTarget,
      frame.hasPreparedTarget,
    );
  }

  const result = takeGeneratorOutput(execution);

  return result.type === 'completion'
    ? { type: 'pop', result }
    : finishValue(undefined);
}

/**
 * @param {GeneratorExecution} execution
 * @param {ObjectPatternFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchObjectPattern(execution, frame) {
  if (frame.phase === 'start') {
    const object = captureGeneratorOperation(execution.realm, () =>
      patternObjectValue(execution.realm, frame.value),
    );

    if (object.type === 'completion') {
      return { type: 'pop', result: object };
    }

    if (object.type !== 'value' || !(object.value instanceof EngineObject)) {
      throw new TypeError('Object pattern coercion expected an object');
    }

    frame.object = object.value;
    frame.phase = 'property';
  } else {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('Object pattern property did not complete');
    }

    frame.index += 1;
  }

  if (frame.index >= frame.node.properties.length) {
    return finishValue(undefined);
  }

  const property = frame.node.properties[frame.index];

  if (property.type !== 'Property') {
    throw createUnsupportedNodeError(property);
  }

  if (frame.object === null) {
    throw new TypeError('Object pattern lost its coerced value');
  }

  return {
    type: 'push',
    frame: {
      kind: 'object-pattern-property',
      node: property,
      object: frame.object,
      receiver: frame.value,
      context: frame.context,
      targetMode: frame.targetMode,
      phase: 'start',
      key: null,
      preparedTarget: undefined,
      hasPreparedTarget: false,
    },
  };
}

/**
 * @param {GeneratorExecution} execution
 * @param {ObjectPatternPropertyFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchObjectPatternProperty(execution, frame) {
  if (frame.phase === 'start') {
    if (frame.node.computed) {
      frame.phase = 'key';
      return pushExpression(frame.node.key, frame.context, 'value');
    }

    const key = captureGeneratorOperation(execution.realm, () =>
      propertyNameFromValue(frame.node.key, false, undefined),
    );

    if (key.type === 'completion') {
      return { type: 'pop', result: key };
    }

    if (key.type !== 'value') {
      throw new TypeError('Object pattern property key expected a value');
    }

    frame.key = /** @type {string | symbol} */ (key.value);
    return prepareObjectPatternProperty(execution, frame);
  }

  const result = takeGeneratorOutput(execution);

  if (result.type === 'completion') {
    return { type: 'pop', result };
  }

  if (result.type !== 'value') {
    throw new TypeError('Object pattern property child expected a value');
  }

  if (frame.phase === 'key') {
    const key = captureGeneratorOperation(execution.realm, () =>
      propertyNameFromValue(frame.node.key, true, result.value),
    );

    if (key.type === 'completion') {
      return { type: 'pop', result: key };
    }

    if (key.type !== 'value') {
      throw new TypeError('Object pattern property key expected a value');
    }

    frame.key = /** @type {string | symbol} */ (key.value);
    return prepareObjectPatternProperty(execution, frame);
  }

  if (frame.phase === 'target') {
    frame.preparedTarget = result.value;
    frame.hasPreparedTarget = true;
    return readObjectPatternProperty(execution, frame);
  }

  return finishValue(undefined);
}

/**
 * @param {GeneratorExecution} execution
 * @param {ObjectPatternPropertyFrame} frame
 * @returns {GeneratorFrameAction}
 */
function prepareObjectPatternProperty(execution, frame) {
  const target = simplePatternTarget(frame.node.value);

  if (target !== null) {
    frame.phase = 'target';
    return {
      type: 'push',
      frame: createPatternTargetFrame(target, frame.context, frame.targetMode),
    };
  }

  return readObjectPatternProperty(execution, frame);
}

/**
 * @param {GeneratorExecution} execution
 * @param {ObjectPatternPropertyFrame} frame
 * @returns {GeneratorFrameAction}
 */
function readObjectPatternProperty(execution, frame) {
  const propertyValue = captureGeneratorOperation(execution.realm, () =>
    readPatternPropertyValue(frame),
  );

  if (propertyValue.type === 'completion') {
    return { type: 'pop', result: propertyValue };
  }

  if (propertyValue.type !== 'value') {
    throw new TypeError('Object pattern property read expected a value');
  }

  frame.phase = 'pattern';
  return pushPattern(
    frame.node.value,
    propertyValue.value,
    frame.context,
    frame.targetMode,
    frame.preparedTarget,
    frame.hasPreparedTarget,
  );
}

/**
 * @param {ObjectPatternPropertyFrame} frame
 * @returns {unknown}
 */
function readPatternPropertyValue(frame) {
  if (frame.key === null) {
    throw new TypeError('Object pattern property is missing its key');
  }

  return getValue(
    new Reference(
      frame.object,
      frame.key,
      frame.context.strict,
      frame.receiver,
    ),
  );
}

/**
 * @param {GeneratorExecution} execution
 * @param {ArrayPatternFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchArrayPattern(execution, frame) {
  if (frame.phase === 'start') {
    const iterator = captureGeneratorOperation(execution.realm, () =>
      createPatternIterator(execution.realm, frame.value),
    );

    if (iterator.type === 'completion') {
      return { type: 'pop', result: iterator };
    }

    if (iterator.type !== 'value') {
      throw new TypeError('Array pattern iterator expected a value');
    }

    frame.record = /** @type {IteratorRecord} */ (iterator.value);
    frame.phase = 'next';
  } else if (frame.phase === 'target') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return closeArrayPatternAbrupt(execution, frame, result.completion);
    }

    if (result.type !== 'value') {
      throw new TypeError('Array pattern target expected a value');
    }

    frame.preparedTarget = result.value;
    frame.hasPreparedTarget = true;
    frame.phase = 'next';
  } else if (frame.phase === 'pattern') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return closeArrayPatternAbrupt(execution, frame, result.completion);
    }

    if (result.type !== 'value') {
      throw new TypeError('Array pattern element did not complete');
    }

    frame.index += 1;
    frame.preparedTarget = undefined;
    frame.hasPreparedTarget = false;
    frame.phase = 'next';
  }

  for (;;) {
    if (frame.index >= frame.node.elements.length) {
      return finishArrayPattern(execution, frame);
    }

    const element = frame.node.elements[frame.index];

    if (element === null) {
      if (!frame.done) {
        const stepped = stepPatternIterator(execution, frame);

        if (stepped.type === 'completion') {
          return { type: 'pop', result: stepped };
        }

        if (stepped.type !== 'value') {
          throw new TypeError(
            'Array pattern elision expected an iterator step',
          );
        }

        if (stepped.value === false) {
          frame.done = true;
        }
      }

      frame.index += 1;
      continue;
    }

    if (!frame.hasPreparedTarget) {
      const target = simplePatternTarget(element);

      if (target !== null) {
        frame.phase = 'target';
        return {
          type: 'push',
          frame: createPatternTargetFrame(
            target,
            frame.context,
            frame.targetMode,
          ),
        };
      }
    }

    if (element.type === 'RestElement') {
      return collectArrayPatternRest(execution, frame, element);
    }

    let nextValue;
    if (!frame.done) {
      const stepped = stepPatternIterator(execution, frame);

      if (stepped.type === 'completion') {
        return { type: 'pop', result: stepped };
      }

      if (stepped.type !== 'value') {
        throw new TypeError('Array pattern expected an iterator step');
      }

      if (stepped.value === false) {
        frame.done = true;
      } else {
        const value = captureGeneratorOperation(execution.realm, () =>
          iteratorValue(
            /** @type {import('../runtime/object.js').EngineObject} */ (
              stepped.value
            ),
          ),
        );

        if (value.type === 'completion') {
          return { type: 'pop', result: value };
        }

        if (value.type !== 'value') {
          throw new TypeError('Array pattern iterator value expected a value');
        }

        nextValue = value.value;
      }
    }

    frame.phase = 'pattern';
    return pushPattern(
      element,
      nextValue,
      frame.context,
      frame.targetMode,
      frame.preparedTarget,
      frame.hasPreparedTarget,
    );
  }
}

/**
 * @param {GeneratorExecution} execution
 * @param {ArrayPatternFrame} frame
 * @param {any} element
 * @returns {GeneratorFrameAction}
 */
function collectArrayPatternRest(execution, frame, element) {
  const rest = new EngineArray(execution.realm.intrinsics.arrayPrototype);
  const collected = captureGeneratorOperation(execution.realm, () => {
    let index = 0;

    while (!frame.done) {
      const record = requirePatternIterator(frame);
      const step = iteratorStep(record);

      if (step === false) {
        frame.done = true;
        break;
      }

      defineArrayElement(rest, index, iteratorValue(step));
      index += 1;
    }

    return rest;
  });

  if (collected.type === 'completion') {
    return { type: 'pop', result: collected };
  }

  if (collected.type !== 'value') {
    throw new TypeError('Array pattern rest expected a value');
  }

  frame.phase = 'pattern';
  return pushPattern(
    element.argument,
    collected.value,
    frame.context,
    frame.targetMode,
    frame.preparedTarget,
    frame.hasPreparedTarget,
  );
}

/**
 * @param {GeneratorExecution} execution
 * @param {ArrayPatternFrame} frame
 * @returns {import('./generator-machine.js').FrameResult}
 */
function stepPatternIterator(execution, frame) {
  return captureGeneratorOperation(execution.realm, () =>
    iteratorStep(requirePatternIterator(frame)),
  );
}

/**
 * @param {ArrayPatternFrame} frame
 * @returns {IteratorRecord}
 */
function requirePatternIterator(frame) {
  if (frame.record === null) {
    throw new TypeError('Array pattern lost its iterator');
  }

  return frame.record;
}

/**
 * @param {GeneratorExecution} execution
 * @param {ArrayPatternFrame} frame
 * @returns {GeneratorFrameAction}
 */
function finishArrayPattern(execution, frame) {
  if (!frame.done) {
    const completion = { type: 'normal', value: undefined };
    const closed = captureGeneratorOperation(execution.realm, () =>
      closePatternIterator(
        execution.realm,
        requirePatternIterator(frame),
        completion,
      ),
    );

    if (closed.type === 'completion') {
      return { type: 'pop', result: closed };
    }

    frame.done = true;
  }

  return finishValue(undefined);
}

/**
 * @param {GeneratorExecution} execution
 * @param {ArrayPatternFrame} frame
 * @param {{ type: string, value: unknown, target?: string | undefined }} completion
 * @returns {GeneratorFrameAction}
 */
function closeArrayPatternAbrupt(execution, frame, completion) {
  if (!frame.done) {
    const closed = captureGeneratorOperation(execution.realm, () =>
      closePatternIterator(
        execution.realm,
        requirePatternIterator(frame),
        completion,
      ),
    );

    if (closed.type === 'completion') {
      return { type: 'pop', result: closed };
    }

    frame.done = true;
  }

  return {
    type: 'pop',
    result: { type: 'completion', completion },
  };
}

/**
 * @param {GeneratorExecution} execution
 * @param {PatternTargetFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchPatternTarget(execution, frame) {
  if (frame.phase === 'start') {
    if (frame.targetMode.kind !== 'assignment') {
      if (frame.node.type !== 'Identifier') {
        throw createUnsupportedNodeError(frame.node);
      }

      if (frame.targetMode.kind === 'binding-initialization') {
        return {
          type: 'pop',
          result: captureGeneratorOperation(execution.realm, () => {
            const reference = getIdentifierReference(
              frame.targetMode.env,
              frame.node.name,
              frame.context.strict,
            );

            if (!isEnvironmentRecord(reference.base)) {
              throw new TypeError(
                'Binding initialization expected an environment reference',
              );
            }

            return {
              kind: 'binding-initialization',
              env: reference.base,
              name: /** @type {string} */ (reference.referencedName),
            };
          }),
        };
      }

      return finishValue({ kind: 'binding-assignment', name: frame.node.name });
    }

    if (frame.node.type === 'Identifier') {
      frame.phase = 'identifier';
      return pushExpression(frame.node, frame.context, 'reference');
    }

    if (frame.node.type !== 'MemberExpression') {
      throw createUnsupportedNodeError(frame.node);
    }

    if (frame.node.object.type === 'Super') {
      const state = captureGeneratorOperation(execution.realm, () => ({
        homeObject: getSuperHomeObject(frame.context.functionEnvironment),
        thisValue: getContextThisBinding(frame.context),
      }));

      if (state.type === 'completion') {
        return { type: 'pop', result: state };
      }

      if (state.type !== 'value') {
        throw new TypeError('Super pattern target expected state');
      }

      const saved =
        /** @type {{ homeObject: EngineObject, thisValue: unknown }} */ (
          state.value
        );
      frame.homeObject = saved.homeObject;
      frame.thisValue = saved.thisValue;
      return nextPatternTargetProperty(frame);
    }

    frame.phase = 'object';
    return pushExpression(frame.node.object, frame.context, 'value');
  }

  const result = takeGeneratorOutput(execution);

  if (result.type === 'completion') {
    return { type: 'pop', result };
  }

  if (frame.phase === 'identifier') {
    if (result.type !== 'reference') {
      throw new TypeError('Identifier pattern target expected a reference');
    }

    return finishValue({ kind: 'reference', reference: result.reference });
  }

  if (result.type !== 'value') {
    throw new TypeError('Member pattern target expected a value');
  }

  if (frame.phase === 'object') {
    frame.base = result.value;
    return nextPatternTargetProperty(frame);
  }

  frame.property = result.value;
  return finishPatternTarget(frame);
}

/**
 * @param {PatternTargetFrame} frame
 * @returns {GeneratorFrameAction}
 */
function nextPatternTargetProperty(frame) {
  if (frame.node.computed) {
    frame.phase = 'property';
    return pushExpression(frame.node.property, frame.context, 'value');
  }

  frame.property = frame.node.property.name;
  return finishPatternTarget(frame);
}

/**
 * @param {PatternTargetFrame} frame
 * @returns {GeneratorFrameAction}
 */
function finishPatternTarget(frame) {
  if (frame.node.object.type === 'Super') {
    if (frame.homeObject === null) {
      throw new TypeError('Super pattern target lost its home object');
    }

    return finishValue({
      kind: 'superMember',
      homeObject: frame.homeObject,
      thisValue: frame.thisValue,
      propertyValue: frame.property,
    });
  }

  return finishValue({
    kind: 'member',
    baseValue: frame.base,
    propertyValue: frame.property,
  });
}

/**
 * @param {unknown} prepared
 * @param {unknown} value
 * @param {EvaluationContext} context
 * @returns {void}
 */
function applyPatternPreparedTarget(prepared, value, context) {
  if (!prepared || typeof prepared !== 'object' || !('kind' in prepared)) {
    throw new TypeError('Pattern is missing its prepared target');
  }

  const target = /** @type {any} */ (prepared);

  if (target.kind === 'binding-initialization') {
    initializePatternIdentifier(target.env, target.name, value);
    return;
  }

  if (target.kind === 'binding-assignment') {
    putValue(
      getIdentifierReference(context.env, target.name, context.strict),
      value,
    );
    return;
  }

  assignPreparedPatternTarget(target, value, context);
}

/**
 * @param {any} pattern
 * @returns {any | null}
 */
function simplePatternTarget(pattern) {
  let target = pattern;

  while (target.type === 'AssignmentPattern' || target.type === 'RestElement') {
    target =
      target.type === 'AssignmentPattern' ? target.left : target.argument;
  }

  return target.type === 'Identifier' || target.type === 'MemberExpression'
    ? target
    : null;
}

/**
 * @param {any} pattern
 * @param {unknown} value
 * @param {EvaluationContext} context
 * @param {PatternTargetMode} targetMode
 * @param {unknown} preparedTarget
 * @param {boolean} hasPreparedTarget
 * @returns {GeneratorFrameAction}
 */
function pushPattern(
  pattern,
  value,
  context,
  targetMode,
  preparedTarget,
  hasPreparedTarget,
) {
  return {
    type: 'push',
    frame: createGeneratorPatternFrame(
      pattern,
      value,
      context,
      targetMode,
      preparedTarget,
      hasPreparedTarget,
    ),
  };
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
 * @param {ObjectLiteralFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchObjectLiteral(execution, frame) {
  if (frame.phase === 'key') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('Object literal key expected a value');
    }

    const key = captureGeneratorOperation(execution.realm, () =>
      toEvaluatedPropertyKey(result.value),
    );

    if (key.type === 'completion') {
      return { type: 'pop', result: key };
    }

    if (key.type !== 'value') {
      throw new TypeError('Object literal key conversion expected a value');
    }

    frame.key = /** @type {string | symbol} */ (key.value);
    frame.phase = 'next';
  } else if (frame.phase === 'value') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('Object literal property expected a value');
    }

    const defined = defineResumableObjectProperty(
      execution,
      frame,
      result.value,
    );

    if (defined !== null) {
      return defined;
    }

    frame.index += 1;
    frame.key = null;
    frame.phase = 'next';
  }

  for (;;) {
    if (frame.index >= frame.node.properties.length) {
      return finishValue(frame.object);
    }

    const property = frame.node.properties[frame.index];

    if (property.type !== 'Property') {
      throw createUnsupportedNodeError(property);
    }

    if (frame.key === null) {
      if (property.computed) {
        frame.phase = 'key';
        return pushExpression(property.key, frame.context, 'value');
      }

      const key = captureGeneratorOperation(execution.realm, () =>
        propertyNameFromValue(property.key, false, undefined),
      );

      if (key.type === 'completion') {
        return { type: 'pop', result: key };
      }

      if (key.type !== 'value') {
        throw new TypeError('Object literal key expected a value');
      }

      frame.key = /** @type {string | symbol} */ (key.value);
    }

    if (property.kind !== 'init' || property.method) {
      const defined = defineResumableObjectProperty(
        execution,
        frame,
        undefined,
      );

      if (defined !== null) {
        return defined;
      }

      frame.index += 1;
      frame.key = null;
      continue;
    }

    const key = frame.key;

    if (key === null) {
      throw new TypeError('Object literal property lost its key');
    }

    const prototypeSetter =
      !property.computed && !property.shorthand && key === '__proto__';
    frame.phase = 'value';
    return {
      type: 'push',
      frame: prototypeSetter
        ? createGeneratorExpressionFrame(property.value, frame.context, 'value')
        : createNamedGeneratorExpressionFrame(
            property.value,
            frame.context,
            functionNameFromPropertyKey(key),
          ),
    };
  }
}

/**
 * @param {GeneratorExecution} execution
 * @param {ObjectLiteralFrame} frame
 * @param {unknown} value
 * @returns {GeneratorFrameAction | null}
 */
function defineResumableObjectProperty(execution, frame, value) {
  const key = frame.key;

  if (key === null) {
    throw new TypeError('Object literal property is missing its key');
  }

  const property = frame.node.properties[frame.index];
  const defined = captureGeneratorOperation(execution.realm, () => {
    defineObjectLiteralProperty(
      frame.object,
      property,
      key,
      value,
      frame.context,
    );
  });

  return defined.type === 'completion'
    ? { type: 'pop', result: defined }
    : null;
}

/**
 * @param {GeneratorExecution} execution
 * @param {ClassDefinitionFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchClassDefinition(execution, frame) {
  if (frame.phase === 'start') {
    const created = captureGeneratorOperation(execution.realm, () =>
      createClassDefinitionState(frame.node, frame.context, frame.bindingName),
    );

    if (created.type === 'completion') {
      return { type: 'pop', result: created };
    }

    if (created.type !== 'value') {
      throw new TypeError('Class definition state expected a value');
    }

    frame.state = /** @type {ReturnType<typeof createClassDefinitionState>} */ (
      created.value
    );

    if (frame.node.superClass !== null) {
      frame.phase = 'heritage';
      return pushExpression(
        frame.node.superClass,
        frame.state.classContext,
        'value',
      );
    }

    const applied = applyResumableClassHeritage(execution, frame, undefined);

    if (applied !== null) {
      return applied;
    }

    frame.phase = 'elements';
  } else if (frame.phase === 'heritage') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('Class heritage expected a value');
    }

    const applied = applyResumableClassHeritage(execution, frame, result.value);

    if (applied !== null) {
      return applied;
    }

    frame.phase = 'elements';
  } else if (frame.phase === 'key') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('Class element key expected a value');
    }

    const key = captureGeneratorOperation(execution.realm, () =>
      toEvaluatedPropertyKey(result.value),
    );

    if (key.type === 'completion') {
      return { type: 'pop', result: key };
    }

    if (key.type !== 'value') {
      throw new TypeError('Class element key conversion expected a value');
    }

    const defined = defineResumableClassElement(
      execution,
      frame,
      /** @type {string | symbol} */ (key.value),
    );

    if (defined !== null) {
      return defined;
    }

    frame.index += 1;
    frame.phase = 'elements';
  }

  const state = requireClassDefinitionState(frame);

  while (frame.index < frame.node.body.body.length) {
    const definition = frame.node.body.body[frame.index];

    if (definition === state.constructorDefinition) {
      frame.index += 1;
      continue;
    }

    if (definition.computed) {
      frame.phase = 'key';
      return pushExpression(definition.key, state.classContext, 'value');
    }

    const key = captureGeneratorOperation(execution.realm, () =>
      propertyNameFromValue(definition.key, false, undefined),
    );

    if (key.type === 'completion') {
      return { type: 'pop', result: key };
    }

    if (key.type !== 'value') {
      throw new TypeError('Class element key expected a value');
    }

    const defined = defineResumableClassElement(
      execution,
      frame,
      /** @type {string | symbol} */ (key.value),
    );

    if (defined !== null) {
      return defined;
    }

    frame.index += 1;
  }

  const finished = captureGeneratorOperation(execution.realm, () =>
    finishClassDefinition(state),
  );

  return { type: 'pop', result: finished };
}

/**
 * @param {GeneratorExecution} execution
 * @param {ClassDefinitionFrame} frame
 * @param {unknown} heritage
 * @returns {GeneratorFrameAction | null}
 */
function applyResumableClassHeritage(execution, frame, heritage) {
  const applied = captureGeneratorOperation(execution.realm, () => {
    applyClassHeritage(requireClassDefinitionState(frame), heritage);
  });

  return applied.type === 'completion'
    ? { type: 'pop', result: applied }
    : null;
}

/**
 * @param {GeneratorExecution} execution
 * @param {ClassDefinitionFrame} frame
 * @param {string | symbol} key
 * @returns {GeneratorFrameAction | null}
 */
function defineResumableClassElement(execution, frame, key) {
  const state = requireClassDefinitionState(frame);
  const definition = frame.node.body.body[frame.index];
  const defined = captureGeneratorOperation(execution.realm, () => {
    defineClassElement(state, definition, key);
  });

  return defined.type === 'completion'
    ? { type: 'pop', result: defined }
    : null;
}

/**
 * @param {ClassDefinitionFrame} frame
 * @returns {ReturnType<typeof createClassDefinitionState>}
 */
function requireClassDefinitionState(frame) {
  if (frame.state === null) {
    throw new TypeError('Class definition lost its state');
  }

  return frame.state;
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
