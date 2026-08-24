import {
  EMPTY,
  createNormalCompletion,
  createReturnCompletion,
  createThrowCompletion,
  GuestErrorSignal,
  updateEmpty,
} from '../runtime/completion.js';
import { toBoolean, toObject } from '../runtime/conversion.js';
import {
  getIdentifierReference,
  newDeclarativeEnvironment,
  newObjectEnvironment,
} from '../runtime/environment.js';
import { createUnsupportedNodeError } from '../runtime/errors.js';
import {
  getIterator,
  getEnumerateIteratorRecord,
  iteratorClose,
  iteratorStep,
  iteratorValue,
} from '../runtime/iterator.js';
import { strictEqualityComparison } from '../runtime/operators.js';
import { evaluateStatement } from './statements.js';
import {
  applyVariableDeclaratorValue,
  blockDeclarationInstantiation,
  evaluateNamedExpression,
} from './declarations.js';
import { createCatchClauseContext } from './catch-binding.js';
import { evaluateExpressionValue } from './expressions.js';
import {
  createGeneratorExpressionFrame,
  createGeneratorClassFrame,
  createGeneratorPatternFrame,
  createNamedGeneratorExpressionFrame,
} from './generator-expression-frames.js';
import { initializePatternIdentifier } from './patterns.js';
import {
  boundNames,
  isConstantDeclaration,
  lexicallyScopedDeclarations,
} from './static-semantics.js';
import {
  captureGeneratorOperation,
  generatorContainsYield,
  takeGeneratorOutput,
} from './generator-machine.js';

/**
 * @typedef {import('./index.js').EvaluationContext} EvaluationContext
 * @typedef {import('../runtime/reference.js').Reference} Reference
 * @typedef {import('./generator-machine.js').GeneratorExecution}
 *   GeneratorExecution
 * @typedef {import('./generator-machine.js').GeneratorFrameAction}
 *   GeneratorFrameAction
 * @typedef {import('../runtime/object.js').EngineObject} EngineObject
 * @typedef {import('../runtime/iterator.js').IteratorRecord} IteratorRecord
 * @typedef {{
 *   type: string,
 *   value: unknown,
 *   target?: string | undefined,
 * }} Completion
 *
 * @typedef {{
 *   kind: 'statement-list',
 *   statements: any[],
 *   context: EvaluationContext,
 *   index: number,
 *   phase: 'next' | 'statement',
 *   completion: Completion,
 * }} StatementListFrame
 * @typedef {{
 *   kind: 'sync-statement',
 *   node: any,
 *   context: EvaluationContext,
 *   labelSet: string[],
 * }} SyncStatementFrame
 * @typedef {{
 *   kind: 'block',
 *   node: any,
 *   context: EvaluationContext,
 *   blockContext: EvaluationContext | null,
 *   phase: 'start' | 'body',
 * }} BlockFrame
 * @typedef {{
 *   kind: 'expression-statement',
 *   node: any,
 *   context: EvaluationContext,
 *   phase: 'start' | 'expression',
 * }} ExpressionStatementFrame
 * @typedef {{
 *   kind: 'variable-declaration',
 *   node: any,
 *   context: EvaluationContext,
 *   index: number,
 *   phase: 'next' | 'initializer' | 'pattern',
 *   reference: Reference | null,
 * }} VariableDeclarationFrame
 * @typedef {{
 *   kind: 'return-statement',
 *   node: any,
 *   context: EvaluationContext,
 *   phase: 'start' | 'argument',
 * }} ReturnStatementFrame
 * @typedef {{
 *   kind: 'throw-statement',
 *   node: any,
 *   context: EvaluationContext,
 *   phase: 'start' | 'argument',
 * }} ThrowStatementFrame
 * @typedef {{
 *   kind: 'class-declaration',
 *   node: any,
 *   context: EvaluationContext,
 *   phase: 'start' | 'definition',
 * }} ClassDeclarationFrame
 * @typedef {{
 *   kind: 'if',
 *   node: any,
 *   context: EvaluationContext,
 *   phase: 'test' | 'test-result' | 'branch',
 * }} IfFrame
 * @typedef {{
 *   kind: 'while',
 *   node: any,
 *   context: EvaluationContext,
 *   labelSet: string[],
 *   phase: 'test' | 'test-result' | 'body',
 *   value: unknown,
 * }} WhileFrame
 * @typedef {{
 *   kind: 'do-while',
 *   node: any,
 *   context: EvaluationContext,
 *   labelSet: string[],
 *   phase: 'body' | 'body-result' | 'test' | 'test-result',
 *   value: unknown,
 * }} DoWhileFrame
 * @typedef {{
 *   kind: 'for',
 *   node: any,
 *   outerContext: EvaluationContext,
 *   context: EvaluationContext,
 *   labelSet: string[],
 *   phase: 'start' | 'initializer' | 'test' | 'test-result'
 *     | 'body' | 'update' | 'update-result',
 *   value: unknown,
 *   lexical: boolean,
 *   initializerIsStatement: boolean,
 *   perIterationBindings: string[],
 * }} ForFrame
 * @typedef {{
 *   kind: 'for-in',
 *   node: any,
 *   context: EvaluationContext,
 *   rightContext: EvaluationContext,
 *   iterationContext: EvaluationContext,
 *   labelSet: string[],
 *   phase: 'start' | 'right' | 'next' | 'target' | 'body',
 *   value: unknown,
 *   record: IteratorRecord | null,
 *   lexical: boolean,
 *   constant: boolean,
 * }} ForInFrame
 * @typedef {{
 *   kind: 'for-of',
 *   node: any,
 *   context: EvaluationContext,
 *   rightContext: EvaluationContext,
 *   iterationContext: EvaluationContext,
 *   labelSet: string[],
 *   phase: 'start' | 'right' | 'next' | 'target' | 'body',
 *   value: unknown,
 *   record: IteratorRecord | null,
 *   nextValue: unknown,
 *   lexical: boolean,
 *   constant: boolean,
 * }} ForOfFrame
 * @typedef {{
 *   kind: 'switch',
 *   node: any,
 *   context: EvaluationContext,
 *   caseContext: EvaluationContext | null,
 *   labelSet: string[],
 *   phase: 'start' | 'discriminant' | 'scan' | 'case-test' | 'body',
 *   discriminant: unknown,
 *   defaultIndex: number,
 *   scanIndex: number,
 *   scanEnd: number,
 *   afterDefault: boolean,
 *   caseIndex: number,
 *   statementIndex: number,
 *   waiting: boolean,
 *   value: unknown,
 * }} SwitchFrame
 * @typedef {{
 *   kind: 'labelled',
 *   node: any,
 *   context: EvaluationContext,
 *   labelSet: string[],
 *   phase: 'start' | 'body',
 * }} LabelledFrame
 * @typedef {{
 *   kind: 'with',
 *   node: any,
 *   context: EvaluationContext,
 *   withContext: EvaluationContext | null,
 *   phase: 'start' | 'object' | 'body',
 * }} WithFrame
 * @typedef {{
 *   kind: 'try',
 *   node: any,
 *   context: EvaluationContext,
 *   phase: 'try' | 'catch' | 'finally' | 'resume-pending',
 *   pending: Completion | null,
 *   catchContext: EvaluationContext | null,
 *   waiting: boolean,
 * }} TryFrame
 * @typedef {{
 *   kind: 'empty-statement',
 *   node: any,
 *   context: EvaluationContext,
 * }} EmptyStatementFrame
 * @typedef {StatementListFrame | SyncStatementFrame | BlockFrame
 *   | ExpressionStatementFrame | VariableDeclarationFrame
 *   | ReturnStatementFrame | ThrowStatementFrame | ClassDeclarationFrame
 *   | IfFrame | WhileFrame | DoWhileFrame | ForFrame | ForInFrame | ForOfFrame
 *   | SwitchFrame | LabelledFrame | WithFrame | TryFrame
 *   | EmptyStatementFrame} GeneratorStatementFrame
 */

/**
 * @param {any[]} statements
 * @param {EvaluationContext} context
 * @returns {StatementListFrame}
 */
export function createStatementListFrame(statements, context) {
  return {
    kind: 'statement-list',
    statements,
    context,
    index: 0,
    phase: 'next',
    completion: createNormalCompletion(EMPTY),
  };
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @param {string[]} [labelSet]
 * @returns {GeneratorStatementFrame}
 */
export function createGeneratorStatementFrame(node, context, labelSet = []) {
  if (node.type === 'EmptyStatement') {
    return { kind: 'empty-statement', node, context };
  }

  if (!generatorContainsYield(node, context)) {
    return { kind: 'sync-statement', node, context, labelSet };
  }

  switch (node.type) {
    case 'BlockStatement':
      return {
        kind: 'block',
        node,
        context,
        blockContext: null,
        phase: 'start',
      };
    case 'ExpressionStatement':
      return {
        kind: 'expression-statement',
        node,
        context,
        phase: 'start',
      };
    case 'VariableDeclaration':
      return {
        kind: 'variable-declaration',
        node,
        context,
        index: 0,
        phase: 'next',
        reference: null,
      };
    case 'ReturnStatement':
      return { kind: 'return-statement', node, context, phase: 'start' };
    case 'ThrowStatement':
      return { kind: 'throw-statement', node, context, phase: 'start' };
    case 'ClassDeclaration':
      return { kind: 'class-declaration', node, context, phase: 'start' };
    case 'IfStatement':
      return { kind: 'if', node, context, phase: 'test' };
    case 'WhileStatement':
      return {
        kind: 'while',
        node,
        context,
        labelSet,
        phase: 'test',
        value: EMPTY,
      };
    case 'DoWhileStatement':
      return {
        kind: 'do-while',
        node,
        context,
        labelSet,
        phase: 'body',
        value: EMPTY,
      };
    case 'ForStatement': {
      const lexical =
        node.init !== null &&
        node.init.type === 'VariableDeclaration' &&
        node.init.kind !== 'var';
      return {
        kind: 'for',
        node,
        outerContext: context,
        context,
        labelSet,
        phase: 'start',
        value: EMPTY,
        lexical,
        initializerIsStatement:
          node.init !== null && node.init.type === 'VariableDeclaration',
        perIterationBindings: [],
      };
    }
    case 'ForInStatement': {
      const lexical =
        node.left.type === 'VariableDeclaration' && node.left.kind !== 'var';
      return {
        kind: 'for-in',
        node,
        context,
        rightContext: context,
        iterationContext: context,
        labelSet,
        phase: 'start',
        value: EMPTY,
        record: null,
        lexical,
        constant: lexical && isConstantDeclaration(node.left),
      };
    }
    case 'ForOfStatement': {
      const lexical =
        node.left.type === 'VariableDeclaration' && node.left.kind !== 'var';
      return {
        kind: 'for-of',
        node,
        context,
        rightContext: context,
        iterationContext: context,
        labelSet,
        phase: 'start',
        value: EMPTY,
        record: null,
        nextValue: undefined,
        lexical,
        constant: lexical && isConstantDeclaration(node.left),
      };
    }
    case 'SwitchStatement':
      return {
        kind: 'switch',
        node,
        context,
        caseContext: null,
        labelSet,
        phase: 'start',
        discriminant: undefined,
        defaultIndex: -1,
        scanIndex: 0,
        scanEnd: 0,
        afterDefault: false,
        caseIndex: -1,
        statementIndex: 0,
        waiting: false,
        value: EMPTY,
      };
    case 'LabeledStatement':
      return {
        kind: 'labelled',
        node,
        context,
        labelSet,
        phase: 'start',
      };
    case 'WithStatement':
      return {
        kind: 'with',
        node,
        context,
        withContext: null,
        phase: 'start',
      };
    case 'TryStatement':
      return {
        kind: 'try',
        node,
        context,
        phase: 'try',
        pending: null,
        catchContext: null,
        waiting: false,
      };
    default:
      throw createUnsupportedNodeError(node);
  }
}

/**
 * @param {GeneratorExecution} execution
 * @param {GeneratorStatementFrame} frame
 * @returns {GeneratorFrameAction}
 */
export function dispatchGeneratorStatementFrame(execution, frame) {
  switch (frame.kind) {
    case 'statement-list':
      return dispatchStatementList(execution, frame);
    case 'sync-statement':
      return dispatchSyncStatement(execution, frame);
    case 'block':
      return dispatchBlock(execution, frame);
    case 'expression-statement':
      return dispatchExpressionStatement(execution, frame);
    case 'variable-declaration':
      return dispatchVariableDeclaration(execution, frame);
    case 'return-statement':
      return dispatchReturnStatement(execution, frame);
    case 'throw-statement':
      return dispatchThrowStatement(execution, frame);
    case 'class-declaration':
      return dispatchClassDeclaration(execution, frame);
    case 'if':
      return dispatchIf(execution, frame);
    case 'while':
      return dispatchWhile(execution, frame);
    case 'do-while':
      return dispatchDoWhile(execution, frame);
    case 'for':
      return dispatchFor(execution, frame);
    case 'for-in':
      return dispatchForIn(execution, frame);
    case 'for-of':
      return dispatchForOf(execution, frame);
    case 'switch':
      return dispatchSwitch(execution, frame);
    case 'labelled':
      return dispatchLabelled(execution, frame);
    case 'with':
      return dispatchWith(execution, frame);
    case 'try':
      return dispatchTry(execution, frame);
    case 'empty-statement':
      return {
        type: 'pop',
        result: {
          type: 'completion',
          completion: createNormalCompletion(EMPTY),
        },
      };
  }
}

/**
 * @param {unknown} frame
 * @returns {frame is GeneratorStatementFrame}
 */
export function isGeneratorStatementFrame(frame) {
  if (!frame || typeof frame !== 'object' || !('kind' in frame)) {
    return false;
  }

  switch (/** @type {{ kind: string }} */ (frame).kind) {
    case 'statement-list':
    case 'sync-statement':
    case 'block':
    case 'expression-statement':
    case 'variable-declaration':
    case 'return-statement':
    case 'throw-statement':
    case 'class-declaration':
    case 'if':
    case 'while':
    case 'do-while':
    case 'for':
    case 'for-in':
    case 'for-of':
    case 'switch':
    case 'labelled':
    case 'with':
    case 'try':
    case 'empty-statement':
      return true;
    default:
      return false;
  }
}

/**
 * @param {GeneratorExecution} execution
 * @param {StatementListFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchStatementList(execution, frame) {
  if (frame.phase === 'statement') {
    const result = takeGeneratorOutput(execution);

    if (result.type !== 'completion') {
      throw new TypeError('Statement frame returned a non-completion result');
    }

    frame.completion = updateEmpty(result.completion, frame.completion.value);
    frame.index += 1;
    frame.phase = 'next';

    if (frame.completion.type !== 'normal') {
      return {
        type: 'pop',
        result: { ...result, completion: frame.completion },
      };
    }
  }

  if (frame.index >= frame.statements.length) {
    return {
      type: 'pop',
      result: { type: 'completion', completion: frame.completion },
    };
  }

  frame.phase = 'statement';
  return {
    type: 'push',
    frame: createGeneratorStatementFrame(
      frame.statements[frame.index],
      frame.context,
    ),
  };
}

/**
 * @param {GeneratorExecution} execution
 * @param {SyncStatementFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchSyncStatement(execution, frame) {
  const result = captureGeneratorOperation(execution.realm, () =>
    evaluateStatement(frame.node, frame.context, frame.labelSet),
  );

  if (result.type === 'completion') {
    return { type: 'pop', result };
  }

  if (result.type !== 'value' || !isCompletion(result.value)) {
    throw new TypeError('Synchronous statement returned an invalid completion');
  }

  return {
    type: 'pop',
    result: { type: 'completion', completion: result.value },
  };
}

/**
 * @param {GeneratorExecution} execution
 * @param {BlockFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchBlock(execution, frame) {
  if (frame.phase === 'start') {
    const declarations = lexicallyScopedDeclarations(frame.node.body);
    let blockContext = frame.context;

    if (declarations.length > 0) {
      const blockEnv = newDeclarativeEnvironment(frame.context.env);
      blockContext = { ...frame.context, env: blockEnv };
      const instantiated = captureGeneratorOperation(execution.realm, () => {
        blockDeclarationInstantiation(declarations, blockEnv, blockContext);
      });

      if (instantiated.type === 'completion') {
        return { type: 'pop', result: instantiated };
      }
    }

    frame.blockContext = blockContext;
    frame.phase = 'body';
    return {
      type: 'push',
      frame: createStatementListFrame(frame.node.body, blockContext),
    };
  }

  const result = takeGeneratorOutput(execution);

  if (result.type !== 'completion') {
    throw new TypeError('Block body returned a non-completion result');
  }

  return { type: 'pop', result };
}

/**
 * @param {GeneratorExecution} execution
 * @param {IfFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchIf(execution, frame) {
  if (frame.phase === 'branch') {
    const result = takeGeneratorOutput(execution);

    if (result.type !== 'completion') {
      throw new TypeError('If branch returned a non-completion result');
    }

    return { type: 'pop', result };
  }

  if (frame.phase === 'test') {
    frame.phase = 'test-result';
    return {
      type: 'push',
      frame: createGeneratorExpressionFrame(
        frame.node.test,
        frame.context,
        'value',
      ),
    };
  }

  const result = takeGeneratorOutput(execution);

  if (result.type === 'completion') {
    return { type: 'pop', result };
  }

  if (result.type !== 'value') {
    throw new TypeError('If test expected a value');
  }

  const branch = toBoolean(result.value)
    ? frame.node.consequent
    : frame.node.alternate;

  if (branch === null || branch === undefined) {
    return completionAction(createNormalCompletion(EMPTY));
  }

  frame.phase = 'branch';
  return {
    type: 'push',
    frame: createGeneratorStatementFrame(branch, frame.context),
  };
}

/**
 * @param {GeneratorExecution} execution
 * @param {WhileFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchWhile(execution, frame) {
  if (frame.phase === 'body') {
    const bodyResult = takeStatementCompletion(execution, 'While body');
    const outcome = applyLoopBodyCompletion(
      bodyResult,
      frame.value,
      frame.labelSet,
    );
    frame.value = outcome.completion.value;

    if (outcome.action === 'break') {
      return completionAction(createNormalCompletion(frame.value));
    }

    if (outcome.action === 'propagate') {
      return completionAction(outcome.completion);
    }

    frame.phase = 'test';
  }

  if (frame.phase === 'test') {
    frame.phase = 'test-result';
    return {
      type: 'push',
      frame: createGeneratorExpressionFrame(
        frame.node.test,
        frame.context,
        'value',
      ),
    };
  }

  const testResult = takeGeneratorOutput(execution);

  if (testResult.type === 'completion') {
    return { type: 'pop', result: testResult };
  }

  if (testResult.type !== 'value') {
    throw new TypeError('While test expected a value');
  }

  if (!toBoolean(testResult.value)) {
    return completionAction(createNormalCompletion(frame.value));
  }

  frame.phase = 'body';
  return {
    type: 'push',
    frame: createGeneratorStatementFrame(frame.node.body, frame.context),
  };
}

/**
 * @param {GeneratorExecution} execution
 * @param {DoWhileFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchDoWhile(execution, frame) {
  if (frame.phase === 'body') {
    frame.phase = 'body-result';
    return {
      type: 'push',
      frame: createGeneratorStatementFrame(frame.node.body, frame.context),
    };
  }

  if (frame.phase === 'body-result') {
    const bodyResult = takeStatementCompletion(execution, 'Do-while body');
    const outcome = applyLoopBodyCompletion(
      bodyResult,
      frame.value,
      frame.labelSet,
    );
    frame.value = outcome.completion.value;

    if (outcome.action === 'break') {
      return completionAction(createNormalCompletion(frame.value));
    }

    if (outcome.action === 'propagate') {
      return completionAction(outcome.completion);
    }

    frame.phase = 'test';
  }

  if (frame.phase === 'test') {
    frame.phase = 'test-result';
    return {
      type: 'push',
      frame: createGeneratorExpressionFrame(
        frame.node.test,
        frame.context,
        'value',
      ),
    };
  }

  const testResult = takeGeneratorOutput(execution);

  if (testResult.type === 'completion') {
    return { type: 'pop', result: testResult };
  }

  if (testResult.type !== 'value') {
    throw new TypeError('Do-while test expected a value');
  }

  if (!toBoolean(testResult.value)) {
    return completionAction(createNormalCompletion(frame.value));
  }

  frame.phase = 'body-result';
  return {
    type: 'push',
    frame: createGeneratorStatementFrame(frame.node.body, frame.context),
  };
}

/**
 * @param {GeneratorExecution} execution
 * @param {ForFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchFor(execution, frame) {
  if (frame.phase === 'start') {
    if (frame.lexical) {
      const loopEnv = newDeclarativeEnvironment(frame.outerContext.env);
      const names = boundNames(frame.node.init);
      const constant = isConstantDeclaration(frame.node.init);

      for (const name of names) {
        if (constant) {
          loopEnv.createImmutableBinding(name, true);
        } else {
          loopEnv.createMutableBinding(name, false);
        }
      }

      frame.context = { ...frame.outerContext, env: loopEnv };
      frame.perIterationBindings = constant ? [] : names;
    }

    if (frame.node.init === null) {
      return finishForInitializer(execution, frame);
    }

    frame.phase = 'initializer';
    return {
      type: 'push',
      frame: frame.initializerIsStatement
        ? createGeneratorStatementFrame(frame.node.init, frame.context)
        : createGeneratorExpressionFrame(
            frame.node.init,
            frame.context,
            'value',
          ),
    };
  }

  if (frame.phase === 'initializer') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      if (result.completion.type !== 'normal') {
        return { type: 'pop', result };
      }
    } else if (result.type !== 'value') {
      throw new TypeError('For initializer returned an invalid result');
    }

    return finishForInitializer(execution, frame);
  }

  if (frame.phase === 'body') {
    const bodyResult = takeStatementCompletion(execution, 'For body');
    const outcome = applyLoopBodyCompletion(
      bodyResult,
      frame.value,
      frame.labelSet,
    );
    frame.value = outcome.completion.value;

    if (outcome.action === 'break') {
      return completionAction(createNormalCompletion(frame.value));
    }

    if (outcome.action === 'propagate') {
      return completionAction(outcome.completion);
    }

    if (frame.lexical) {
      const nextContext = captureGeneratorOperation(execution.realm, () =>
        createPerIterationEnvironment(
          frame.perIterationBindings,
          frame.context,
        ),
      );

      if (nextContext.type === 'completion') {
        return { type: 'pop', result: nextContext };
      }

      if (nextContext.type !== 'value') {
        throw new TypeError('For loop expected an iteration context');
      }

      frame.context = /** @type {EvaluationContext} */ (nextContext.value);
    }

    frame.phase = 'update';
  }

  if (frame.phase === 'update') {
    if (frame.node.update === null) {
      return startForTest(frame);
    }

    frame.phase = 'update-result';
    return {
      type: 'push',
      frame: createGeneratorExpressionFrame(
        frame.node.update,
        frame.context,
        'value',
      ),
    };
  }

  if (frame.phase === 'update-result') {
    const updateResult = takeGeneratorOutput(execution);

    if (updateResult.type === 'completion') {
      return { type: 'pop', result: updateResult };
    }

    if (updateResult.type !== 'value') {
      throw new TypeError('For update expected a value');
    }

    return startForTest(frame);
  }

  if (frame.phase === 'test') {
    return startForTest(frame);
  }

  const testResult = takeGeneratorOutput(execution);

  if (testResult.type === 'completion') {
    return { type: 'pop', result: testResult };
  }

  if (testResult.type !== 'value') {
    throw new TypeError('For test expected a value');
  }

  if (!toBoolean(testResult.value)) {
    return completionAction(createNormalCompletion(frame.value));
  }

  return startForBody(frame);
}

/**
 * @param {GeneratorExecution} execution
 * @param {ForFrame} frame
 * @returns {GeneratorFrameAction}
 */
function finishForInitializer(execution, frame) {
  if (frame.lexical) {
    const nextContext = captureGeneratorOperation(execution.realm, () =>
      createPerIterationEnvironment(frame.perIterationBindings, frame.context),
    );

    if (nextContext.type === 'completion') {
      return { type: 'pop', result: nextContext };
    }

    if (nextContext.type !== 'value') {
      throw new TypeError('For loop expected an initial iteration context');
    }

    frame.context = /** @type {EvaluationContext} */ (nextContext.value);
  }

  return startForTest(frame);
}

/**
 * @param {ForFrame} frame
 * @returns {GeneratorFrameAction}
 */
function startForTest(frame) {
  if (frame.node.test === null) {
    return startForBody(frame);
  }

  frame.phase = 'test-result';
  return {
    type: 'push',
    frame: createGeneratorExpressionFrame(
      frame.node.test,
      frame.context,
      'value',
    ),
  };
}

/**
 * @param {ForFrame} frame
 * @returns {GeneratorFrameAction}
 */
function startForBody(frame) {
  frame.phase = 'body';
  return {
    type: 'push',
    frame: createGeneratorStatementFrame(frame.node.body, frame.context),
  };
}

/**
 * @param {string[]} names
 * @param {EvaluationContext} context
 * @returns {EvaluationContext}
 */
function createPerIterationEnvironment(names, context) {
  if (names.length === 0) {
    return context;
  }

  const previousEnv = context.env;
  const iterationEnv = newDeclarativeEnvironment(previousEnv.outer);

  for (const name of names) {
    iterationEnv.createMutableBinding(name, false);
    iterationEnv.initializeBinding(
      name,
      previousEnv.getBindingValue(name, true),
    );
  }

  return { ...context, env: iterationEnv };
}

/**
 * @param {Completion} completion
 * @param {unknown} value
 * @param {string[]} labelSet
 * @returns {{
 *   completion: Completion,
 *   action: 'break' | 'continue' | 'propagate',
 * }}
 */
function applyLoopBodyCompletion(completion, value, labelSet) {
  const updated = updateEmpty(completion, value);
  const owned =
    updated.target === undefined || labelSet.includes(updated.target);

  if (updated.type === 'break') {
    return {
      completion: updated,
      action: owned ? 'break' : 'propagate',
    };
  }

  if (updated.type === 'continue') {
    return {
      completion: updated,
      action: owned ? 'continue' : 'propagate',
    };
  }

  return {
    completion: updated,
    action: updated.type === 'normal' ? 'continue' : 'propagate',
  };
}

/**
 * @param {GeneratorExecution} execution
 * @param {ForInFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchForIn(execution, frame) {
  if (frame.phase === 'start') {
    frame.rightContext = createForInOfRightContext(
      frame.node.left,
      frame.context,
      frame.lexical,
    );
    frame.phase = 'right';
    return {
      type: 'push',
      frame: createGeneratorExpressionFrame(
        frame.node.right,
        frame.rightContext,
        'value',
      ),
    };
  }

  if (frame.phase === 'right') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('For-in right side expected a value');
    }

    if (result.value === null || result.value === undefined) {
      return completionAction(createNormalCompletion(EMPTY));
    }

    const prepared = captureGeneratorOperation(execution.realm, () => {
      const object = toObject(execution.realm, result.value);
      return getEnumerateIteratorRecord(execution.realm, object);
    });

    if (prepared.type === 'completion') {
      return { type: 'pop', result: prepared };
    }

    if (prepared.type !== 'value') {
      throw new TypeError('For-in right side expected an iterator record');
    }

    frame.record = /** @type {IteratorRecord} */ (prepared.value);
    frame.phase = 'next';
    return startForInIteration(execution, frame);
  }

  if (frame.phase === 'target') {
    const targetResult = takeGeneratorOutput(execution);

    if (targetResult.type === 'completion') {
      return closeForInWithCompletion(
        execution,
        frame,
        targetResult.completion,
      );
    }

    if (targetResult.type !== 'value') {
      throw new TypeError('For-in target did not complete');
    }

    frame.phase = 'body';
    return {
      type: 'push',
      frame: createGeneratorStatementFrame(
        frame.node.body,
        frame.iterationContext,
      ),
    };
  }

  if (frame.phase === 'body') {
    const bodyResult = takeStatementCompletion(execution, 'For-in body');
    const outcome = applyLoopBodyCompletion(
      bodyResult,
      frame.value,
      frame.labelSet,
    );
    frame.value = outcome.completion.value;

    if (outcome.action === 'break') {
      return closeForInWithCompletion(
        execution,
        frame,
        createNormalCompletion(frame.value),
      );
    }

    if (outcome.action === 'propagate') {
      return closeForInWithCompletion(execution, frame, outcome.completion);
    }

    frame.phase = 'next';
  }

  return startForInIteration(execution, frame);
}

/**
 * @param {GeneratorExecution} execution
 * @param {ForInFrame} frame
 * @returns {GeneratorFrameAction}
 */
function startForInIteration(execution, frame) {
  const record = frame.record;

  if (record === null) {
    throw new TypeError('For-in frame lost its iterator record');
  }

  const stepResult = captureGeneratorOperation(execution.realm, () =>
    iteratorStep(record),
  );

  if (stepResult.type === 'completion') {
    return { type: 'pop', result: stepResult };
  }

  if (stepResult.type !== 'value') {
    throw new TypeError('For-in iterator step returned an invalid result');
  }

  if (stepResult.value === false) {
    record.done = true;
    return completionAction(createNormalCompletion(frame.value));
  }

  const valueResult = captureGeneratorOperation(execution.realm, () => {
    const key = iteratorValue(
      /** @type {EngineObject} */ (stepResult.value),
      execution.realm,
    );

    if (typeof key !== 'string') {
      throw new GuestErrorSignal(
        'TypeError',
        'Enumerate iterator value is not a string',
      );
    }

    return key;
  });

  if (valueResult.type === 'completion') {
    return { type: 'pop', result: valueResult };
  }

  if (valueResult.type !== 'value') {
    throw new TypeError('For-in iterator value returned an invalid result');
  }

  const key = /** @type {string} */ (valueResult.value);

  frame.iterationContext = createForInOfIterationContext(
    frame.node.left,
    frame.context,
    frame.lexical,
    frame.constant,
  );
  const binding = iterationBinding(
    frame.node.left,
    frame.iterationContext,
    frame.lexical,
  );
  frame.phase = 'target';
  return {
    type: 'push',
    frame: createGeneratorPatternFrame(
      binding.pattern,
      key,
      frame.iterationContext,
      binding.targetMode,
    ),
  };
}

/**
 * @param {GeneratorExecution} execution
 * @param {ForInFrame} frame
 * @param {Completion} completion
 * @returns {GeneratorFrameAction}
 */
function closeForInWithCompletion(execution, frame, completion) {
  const record = requireForInIterator(frame);
  const closeResult = captureGeneratorOperation(execution.realm, () =>
    iteratorClose(execution.realm, record, completion.type === 'throw'),
  );

  if (closeResult.type === 'completion') {
    return { type: 'pop', result: closeResult };
  }

  return completionAction(completion);
}

/**
 * @param {ForInFrame} frame
 * @returns {IteratorRecord}
 */
function requireForInIterator(frame) {
  if (frame.record === null) {
    throw new TypeError('For-in frame lost its iterator record');
  }

  return frame.record;
}

/**
 * @param {GeneratorExecution} execution
 * @param {ForOfFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchForOf(execution, frame) {
  if (frame.phase === 'start') {
    frame.rightContext = createForInOfRightContext(
      frame.node.left,
      frame.context,
      frame.lexical,
    );
    frame.phase = 'right';
    return {
      type: 'push',
      frame: createGeneratorExpressionFrame(
        frame.node.right,
        frame.rightContext,
        'value',
      ),
    };
  }

  if (frame.phase === 'right') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('For-of right side expected a value');
    }

    const iteratorResult = captureGeneratorOperation(execution.realm, () =>
      getIterator(execution.realm, result.value),
    );

    if (iteratorResult.type === 'completion') {
      return { type: 'pop', result: iteratorResult };
    }

    if (iteratorResult.type !== 'value') {
      throw new TypeError('For-of right side expected an iterator record');
    }

    frame.record = /** @type {IteratorRecord} */ (iteratorResult.value);
    frame.phase = 'next';
    return startForOfIteration(execution, frame);
  }

  if (frame.phase === 'target') {
    const targetResult = takeGeneratorOutput(execution);

    if (targetResult.type === 'completion') {
      return closeForOfWithCompletion(
        execution,
        frame,
        targetResult.completion,
      );
    }

    if (targetResult.type !== 'value') {
      throw new TypeError('For-of target did not complete');
    }

    frame.phase = 'body';
    return {
      type: 'push',
      frame: createGeneratorStatementFrame(
        frame.node.body,
        frame.iterationContext,
      ),
    };
  }

  if (frame.phase === 'body') {
    const bodyResult = takeStatementCompletion(execution, 'For-of body');
    const outcome = applyLoopBodyCompletion(
      bodyResult,
      frame.value,
      frame.labelSet,
    );
    frame.value = outcome.completion.value;

    if (outcome.action === 'break') {
      return closeForOfWithCompletion(
        execution,
        frame,
        createNormalCompletion(frame.value),
      );
    }

    if (outcome.action === 'propagate') {
      return closeForOfWithCompletion(execution, frame, outcome.completion);
    }

    frame.phase = 'next';
  }

  return startForOfIteration(execution, frame);
}

/**
 * @param {GeneratorExecution} execution
 * @param {ForOfFrame} frame
 * @returns {GeneratorFrameAction}
 */
function startForOfIteration(execution, frame) {
  const record = requireForOfIterator(frame);
  const stepResult = captureGeneratorOperation(execution.realm, () =>
    iteratorStep(record),
  );

  if (stepResult.type === 'completion') {
    return { type: 'pop', result: stepResult };
  }

  if (stepResult.type !== 'value') {
    throw new TypeError('For-of iterator step returned an invalid result');
  }

  if (stepResult.value === false) {
    record.done = true;
    return completionAction(createNormalCompletion(frame.value));
  }

  const valueResult = captureGeneratorOperation(execution.realm, () =>
    iteratorValue(
      /** @type {import('../runtime/object.js').EngineObject} */ (
        stepResult.value
      ),
      execution.realm,
    ),
  );

  if (valueResult.type === 'completion') {
    return { type: 'pop', result: valueResult };
  }

  if (valueResult.type !== 'value') {
    throw new TypeError('For-of iterator value returned an invalid result');
  }

  frame.nextValue = valueResult.value;
  frame.iterationContext = createForInOfIterationContext(
    frame.node.left,
    frame.context,
    frame.lexical,
    frame.constant,
  );
  const binding = iterationBinding(
    frame.node.left,
    frame.iterationContext,
    frame.lexical,
  );
  frame.phase = 'target';
  return {
    type: 'push',
    frame: createGeneratorPatternFrame(
      binding.pattern,
      frame.nextValue,
      frame.iterationContext,
      binding.targetMode,
    ),
  };
}

/**
 * @param {GeneratorExecution} execution
 * @param {ForOfFrame} frame
 * @param {Completion} completion
 * @returns {GeneratorFrameAction}
 */
function closeForOfWithCompletion(execution, frame, completion) {
  const record = requireForOfIterator(frame);
  const closeResult = captureGeneratorOperation(execution.realm, () =>
    iteratorClose(execution.realm, record, completion.type === 'throw'),
  );

  if (closeResult.type === 'completion') {
    return { type: 'pop', result: closeResult };
  }

  return completionAction(completion);
}

/**
 * @param {ForOfFrame} frame
 * @returns {IteratorRecord}
 */
function requireForOfIterator(frame) {
  if (frame.record === null) {
    throw new TypeError('For-of frame lost its iterator record');
  }

  return frame.record;
}

/**
 * @param {any} left
 * @param {EvaluationContext} context
 * @param {boolean} lexical
 * @returns {EvaluationContext}
 */
function createForInOfRightContext(left, context, lexical) {
  if (!lexical) {
    return context;
  }

  const tdzEnv = newDeclarativeEnvironment(context.env);
  for (const name of boundNames(left)) {
    tdzEnv.createMutableBinding(name, false);
  }

  return { ...context, env: tdzEnv };
}

/**
 * @param {any} left
 * @param {EvaluationContext} context
 * @param {boolean} lexical
 * @param {boolean} constant
 * @returns {EvaluationContext}
 */
function createForInOfIterationContext(left, context, lexical, constant) {
  if (!lexical) {
    return context;
  }

  const iterationEnv = newDeclarativeEnvironment(context.env);
  for (const name of boundNames(left)) {
    if (constant) {
      iterationEnv.createImmutableBinding(name, true);
    } else {
      iterationEnv.createMutableBinding(name, false);
    }
  }

  return { ...context, env: iterationEnv };
}

/**
 * @param {any} left
 * @param {EvaluationContext} context
 * @param {boolean} lexical
 * @returns {{ pattern: any, targetMode: any }}
 */
function iterationBinding(left, context, lexical) {
  if (left.type !== 'VariableDeclaration') {
    return { pattern: left, targetMode: { kind: 'assignment' } };
  }

  const pattern = left.declarations[0].id;
  return {
    pattern,
    targetMode: lexical
      ? { kind: 'binding-initialization', env: context.env }
      : { kind: 'binding-assignment' },
  };
}

/**
 * @param {GeneratorExecution} execution
 * @param {SwitchFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchSwitch(execution, frame) {
  if (frame.phase === 'start') {
    frame.phase = 'discriminant';
    return {
      type: 'push',
      frame: createGeneratorExpressionFrame(
        frame.node.discriminant,
        frame.context,
        'value',
      ),
    };
  }

  if (frame.phase === 'discriminant') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('Switch discriminant expected a value');
    }

    frame.discriminant = result.value;
    const initialized = initializeSwitchCaseBlock(execution, frame);

    if (initialized !== null) {
      return initialized;
    }

    frame.phase = 'scan';
    return startSwitchScan(frame);
  }

  if (frame.phase === 'case-test') {
    const testResult = takeGeneratorOutput(execution);

    if (testResult.type === 'completion') {
      return { type: 'pop', result: testResult };
    }

    if (testResult.type !== 'value') {
      throw new TypeError('Switch case test expected a value');
    }

    if (strictEqualityComparison(frame.discriminant, testResult.value)) {
      return startSwitchBody(frame, frame.scanIndex);
    }

    frame.scanIndex += 1;
    frame.phase = 'scan';
    return startSwitchScan(frame);
  }

  if (frame.phase === 'body') {
    return dispatchSwitchBody(execution, frame);
  }

  return startSwitchScan(frame);
}

/**
 * @param {GeneratorExecution} execution
 * @param {SwitchFrame} frame
 * @returns {GeneratorFrameAction | null}
 */
function initializeSwitchCaseBlock(execution, frame) {
  const statements = [];
  for (const switchCase of frame.node.cases) {
    for (const statement of switchCase.consequent) {
      statements.push(statement);
    }
  }

  const declarations = lexicallyScopedDeclarations(statements);
  let caseContext = frame.context;

  if (declarations.length > 0) {
    const caseEnv = newDeclarativeEnvironment(frame.context.env);
    caseContext = { ...frame.context, env: caseEnv };
    const instantiated = captureGeneratorOperation(execution.realm, () => {
      blockDeclarationInstantiation(declarations, caseEnv, caseContext);
    });

    if (instantiated.type === 'completion') {
      return { type: 'pop', result: instantiated };
    }
  }

  frame.caseContext = caseContext;
  frame.defaultIndex = frame.node.cases.findIndex(
    /** @param {any} switchCase */
    (switchCase) => switchCase.test === null,
  );
  frame.scanIndex = 0;
  frame.scanEnd =
    frame.defaultIndex === -1 ? frame.node.cases.length : frame.defaultIndex;
  frame.afterDefault = false;
  return null;
}

/**
 * @param {SwitchFrame} frame
 * @returns {GeneratorFrameAction}
 */
function startSwitchScan(frame) {
  if (frame.scanIndex >= frame.scanEnd) {
    if (frame.defaultIndex === -1) {
      return completionAction(createNormalCompletion(EMPTY));
    }

    if (!frame.afterDefault) {
      frame.afterDefault = true;
      frame.scanIndex = frame.defaultIndex + 1;
      frame.scanEnd = frame.node.cases.length;
      return startSwitchScan(frame);
    }

    return startSwitchBody(frame, frame.defaultIndex);
  }

  const switchCase = frame.node.cases[frame.scanIndex];

  if (switchCase.test === null) {
    throw new TypeError('Switch scan reached its default clause');
  }

  const caseContext = requireSwitchContext(frame);
  frame.phase = 'case-test';
  return {
    type: 'push',
    frame: createGeneratorExpressionFrame(
      switchCase.test,
      caseContext,
      'value',
    ),
  };
}

/**
 * @param {SwitchFrame} frame
 * @param {number} index
 * @returns {GeneratorFrameAction}
 */
function startSwitchBody(frame, index) {
  frame.phase = 'body';
  frame.caseIndex = index;
  frame.statementIndex = 0;
  frame.waiting = false;
  frame.value = EMPTY;
  return nextSwitchBodyStatement(frame);
}

/**
 * @param {GeneratorExecution} execution
 * @param {SwitchFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchSwitchBody(execution, frame) {
  if (frame.waiting) {
    const result = takeStatementCompletion(execution, 'Switch consequent');
    frame.waiting = false;
    const updated = updateEmpty(result, frame.value);
    frame.value = updated.value;
    frame.statementIndex += 1;

    if (updated.type !== 'normal') {
      if (
        updated.type === 'break' &&
        (updated.target === undefined ||
          frame.labelSet.includes(updated.target))
      ) {
        return completionAction(createNormalCompletion(frame.value));
      }

      return completionAction(updated);
    }
  }

  return nextSwitchBodyStatement(frame);
}

/**
 * @param {SwitchFrame} frame
 * @returns {GeneratorFrameAction}
 */
function nextSwitchBodyStatement(frame) {
  while (frame.caseIndex < frame.node.cases.length) {
    const statements = frame.node.cases[frame.caseIndex].consequent;

    if (frame.statementIndex < statements.length) {
      frame.waiting = true;
      return {
        type: 'push',
        frame: createGeneratorStatementFrame(
          statements[frame.statementIndex],
          requireSwitchContext(frame),
        ),
      };
    }

    frame.caseIndex += 1;
    frame.statementIndex = 0;
  }

  return completionAction(createNormalCompletion(frame.value));
}

/**
 * @param {SwitchFrame} frame
 * @returns {EvaluationContext}
 */
function requireSwitchContext(frame) {
  if (frame.caseContext === null) {
    throw new TypeError('Switch frame lost its case context');
  }

  return frame.caseContext;
}

/**
 * @param {GeneratorExecution} execution
 * @param {LabelledFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchLabelled(execution, frame) {
  if (frame.phase === 'start') {
    frame.phase = 'body';
    return {
      type: 'push',
      frame: createGeneratorStatementFrame(frame.node.body, frame.context, [
        ...frame.labelSet,
        frame.node.label.name,
      ]),
    };
  }

  const result = takeStatementCompletion(execution, 'Labelled body');

  if (result.type === 'break' && result.target === frame.node.label.name) {
    return completionAction(createNormalCompletion(result.value));
  }

  return completionAction(result);
}

/**
 * @param {GeneratorExecution} execution
 * @param {WithFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchWith(execution, frame) {
  if (frame.phase === 'start') {
    frame.phase = 'object';
    return {
      type: 'push',
      frame: createGeneratorExpressionFrame(
        frame.node.object,
        frame.context,
        'value',
      ),
    };
  }

  if (frame.phase === 'object') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('With object expected a value');
    }

    const prepared = captureGeneratorOperation(execution.realm, () => {
      const object = toObject(execution.realm, result.value);
      const withEnv = newObjectEnvironment(object, frame.context.env, true);
      return { ...frame.context, env: withEnv };
    });

    if (prepared.type === 'completion') {
      return { type: 'pop', result: prepared };
    }

    if (prepared.type !== 'value') {
      throw new TypeError('With statement expected a derived context');
    }

    frame.withContext = /** @type {EvaluationContext} */ (prepared.value);
    frame.phase = 'body';
    return {
      type: 'push',
      frame: createGeneratorStatementFrame(frame.node.body, frame.withContext),
    };
  }

  const result = takeStatementCompletion(execution, 'With body');
  return completionAction(result);
}

/**
 * @param {GeneratorExecution} execution
 * @param {TryFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchTry(execution, frame) {
  if (!frame.waiting) {
    if (frame.phase === 'resume-pending') {
      return completionAction(requirePendingCompletion(frame));
    }

    frame.waiting = true;
    return {
      type: 'push',
      frame: createGeneratorStatementFrame(
        tryPhaseNode(frame),
        tryPhaseContext(frame),
      ),
    };
  }

  const completion = takeStatementCompletion(
    execution,
    `Try ${frame.phase} body`,
  );
  frame.waiting = false;

  if (frame.phase === 'try') {
    if (completion.type === 'throw' && frame.node.handler !== null) {
      const prepared = prepareCatchClause(execution, frame, completion.value);

      if (prepared !== null) {
        frame.pending = prepared;
        return startTryFinallyOrResume(frame);
      }

      frame.phase = 'catch';
      frame.waiting = true;
      return {
        type: 'push',
        frame: createGeneratorStatementFrame(
          frame.node.handler.body,
          requireCatchContext(frame),
        ),
      };
    }

    frame.pending = completion;
    return startTryFinallyOrResume(frame);
  }

  if (frame.phase === 'catch') {
    frame.pending = completion;
    return startTryFinallyOrResume(frame);
  }

  const pending = requirePendingCompletion(frame);
  frame.pending = completion.type === 'normal' ? pending : completion;
  frame.phase = 'resume-pending';
  return completionAction(frame.pending);
}

/**
 * @param {TryFrame} frame
 * @returns {any}
 */
function tryPhaseNode(frame) {
  if (frame.phase === 'try') {
    return frame.node.block;
  }

  if (frame.phase === 'catch') {
    return frame.node.handler.body;
  }

  if (frame.phase === 'finally') {
    return frame.node.finalizer;
  }

  throw new TypeError(`Try frame cannot evaluate phase ${frame.phase}`);
}

/**
 * @param {TryFrame} frame
 * @returns {EvaluationContext}
 */
function tryPhaseContext(frame) {
  return frame.phase === 'catch' ? requireCatchContext(frame) : frame.context;
}

/**
 * @param {GeneratorExecution} execution
 * @param {TryFrame} frame
 * @param {unknown} thrownValue
 * @returns {Completion | null}
 */
function prepareCatchClause(execution, frame, thrownValue) {
  const initialized = captureGeneratorOperation(execution.realm, () =>
    createCatchClauseContext(
      frame.node.handler.param,
      thrownValue,
      frame.context,
    ),
  );

  if (initialized.type === 'completion') {
    return initialized.completion;
  }
  if (initialized.type !== 'value') {
    throw new TypeError('Catch initialization must produce a context value');
  }

  frame.catchContext = /** @type {EvaluationContext} */ (initialized.value);
  return null;
}

/**
 * @param {TryFrame} frame
 * @returns {GeneratorFrameAction}
 */
function startTryFinallyOrResume(frame) {
  if (frame.node.finalizer !== null) {
    frame.phase = 'finally';
    frame.waiting = true;
    return {
      type: 'push',
      frame: createGeneratorStatementFrame(frame.node.finalizer, frame.context),
    };
  }

  frame.phase = 'resume-pending';
  return completionAction(requirePendingCompletion(frame));
}

/**
 * @param {TryFrame} frame
 * @returns {Completion}
 */
function requirePendingCompletion(frame) {
  if (frame.pending === null) {
    throw new TypeError('Try frame lost its pending completion');
  }

  return frame.pending;
}

/**
 * @param {TryFrame} frame
 * @returns {EvaluationContext}
 */
function requireCatchContext(frame) {
  if (frame.catchContext === null) {
    throw new TypeError('Try frame lost its catch context');
  }

  return frame.catchContext;
}

/**
 * @param {GeneratorExecution} execution
 * @param {ExpressionStatementFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchExpressionStatement(execution, frame) {
  if (frame.phase === 'start') {
    frame.phase = 'expression';
    return {
      type: 'push',
      frame: createGeneratorExpressionFrame(
        frame.node.expression,
        frame.context,
        'value',
      ),
    };
  }

  const result = takeGeneratorOutput(execution);

  if (result.type === 'completion') {
    return { type: 'pop', result };
  }

  if (result.type !== 'value') {
    throw new TypeError('Expression statement expected a value');
  }

  return {
    type: 'pop',
    result: {
      type: 'completion',
      completion: createNormalCompletion(result.value),
    },
  };
}

/**
 * @param {GeneratorExecution} execution
 * @param {VariableDeclarationFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchVariableDeclaration(execution, frame) {
  if (frame.phase === 'initializer') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('Variable initializer expected a value');
    }

    const action = applyOrPushVariableDeclarator(
      execution,
      frame,
      result.value,
    );

    if (action !== null) {
      return action;
    }
  } else if (frame.phase === 'pattern') {
    const result = takeGeneratorOutput(execution);

    if (result.type === 'completion') {
      return { type: 'pop', result };
    }

    if (result.type !== 'value') {
      throw new TypeError('Variable binding pattern did not complete');
    }

    finishVariableDeclarator(frame);
  }

  while (frame.index < frame.node.declarations.length) {
    const declarator = frame.node.declarations[frame.index];

    if (declarator.init !== null && declarator.init !== undefined) {
      frame.reference =
        frame.node.kind === 'var' && declarator.id.type === 'Identifier'
          ? getIdentifierReference(
              frame.context.env,
              declarator.id.name,
              frame.context.strict,
            )
          : null;

      if (
        !generatorContainsYield(declarator.init, frame.context) &&
        !generatorContainsYield(declarator.id, frame.context)
      ) {
        const evaluated = captureGeneratorOperation(execution.realm, () =>
          declarator.id.type === 'Identifier'
            ? evaluateNamedExpression(
                declarator.init,
                frame.context,
                declarator.id.name,
              )
            : evaluateExpressionValue(declarator.init, frame.context),
        );

        if (evaluated.type === 'completion') {
          return { type: 'pop', result: evaluated };
        }

        if (evaluated.type !== 'value') {
          throw new TypeError('Variable initializer expected a value');
        }

        const action = applyOrPushVariableDeclarator(
          execution,
          frame,
          evaluated.value,
        );

        if (action !== null) {
          return action;
        }

        continue;
      }

      frame.phase = 'initializer';
      return {
        type: 'push',
        frame:
          declarator.id.type === 'Identifier'
            ? createNamedGeneratorExpressionFrame(
                declarator.init,
                frame.context,
                declarator.id.name,
              )
            : createGeneratorExpressionFrame(
                declarator.init,
                frame.context,
                'value',
              ),
      };
    }

    if (frame.node.kind !== 'var') {
      const applied = captureGeneratorOperation(execution.realm, () => {
        applyVariableDeclaratorValue(
          frame.node.kind,
          declarator,
          undefined,
          frame.context,
          null,
        );
      });

      if (applied.type === 'completion') {
        return { type: 'pop', result: applied };
      }
    }

    frame.index += 1;
  }

  return {
    type: 'pop',
    result: {
      type: 'completion',
      completion: createNormalCompletion(EMPTY),
    },
  };
}

/**
 * @param {GeneratorExecution} execution
 * @param {VariableDeclarationFrame} frame
 * @param {unknown} value
 * @returns {GeneratorFrameAction | null}
 */
function applyOrPushVariableDeclarator(execution, frame, value) {
  const declarator = frame.node.declarations[frame.index];

  if (
    declarator.id.type !== 'Identifier' &&
    generatorContainsYield(declarator.id, frame.context)
  ) {
    frame.phase = 'pattern';
    return {
      type: 'push',
      frame: createGeneratorPatternFrame(
        declarator.id,
        value,
        frame.context,
        frame.node.kind === 'var'
          ? { kind: 'binding-assignment' }
          : { kind: 'binding-initialization', env: frame.context.env },
      ),
    };
  }

  const applied = captureGeneratorOperation(execution.realm, () => {
    applyVariableDeclaratorValue(
      frame.node.kind,
      declarator,
      value,
      frame.context,
      frame.reference,
    );
  });

  if (applied.type === 'completion') {
    return { type: 'pop', result: applied };
  }

  finishVariableDeclarator(frame);
  return null;
}

/**
 * @param {VariableDeclarationFrame} frame
 * @returns {void}
 */
function finishVariableDeclarator(frame) {
  frame.index += 1;
  frame.phase = 'next';
  frame.reference = null;
}

/**
 * @param {GeneratorExecution} execution
 * @param {ClassDeclarationFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchClassDeclaration(execution, frame) {
  if (frame.phase === 'start') {
    frame.phase = 'definition';
    return {
      type: 'push',
      frame: createGeneratorClassFrame(
        frame.node,
        frame.context,
        frame.node.id.name,
      ),
    };
  }

  const result = takeGeneratorOutput(execution);

  if (result.type === 'completion') {
    return { type: 'pop', result };
  }

  if (result.type !== 'value') {
    throw new TypeError('Class declaration expected a constructor value');
  }

  const initialized = captureGeneratorOperation(execution.realm, () => {
    initializePatternIdentifier(
      frame.context.env,
      frame.node.id.name,
      result.value,
    );
  });

  if (initialized.type === 'completion') {
    return { type: 'pop', result: initialized };
  }

  return {
    type: 'pop',
    result: {
      type: 'completion',
      completion: createNormalCompletion(EMPTY),
    },
  };
}

/**
 * @param {GeneratorExecution} execution
 * @param {ReturnStatementFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchReturnStatement(execution, frame) {
  if (frame.phase === 'start') {
    if (frame.node.argument === null || frame.node.argument === undefined) {
      return completionAction(createReturnCompletion(undefined));
    }

    frame.phase = 'argument';
    return {
      type: 'push',
      frame: createGeneratorExpressionFrame(
        frame.node.argument,
        frame.context,
        'value',
      ),
    };
  }

  const result = takeGeneratorOutput(execution);

  if (result.type === 'completion') {
    return { type: 'pop', result };
  }

  if (result.type !== 'value') {
    throw new TypeError('Return statement expected a value');
  }

  return completionAction(createReturnCompletion(result.value));
}

/**
 * @param {GeneratorExecution} execution
 * @param {ThrowStatementFrame} frame
 * @returns {GeneratorFrameAction}
 */
function dispatchThrowStatement(execution, frame) {
  if (frame.phase === 'start') {
    frame.phase = 'argument';
    return {
      type: 'push',
      frame: createGeneratorExpressionFrame(
        frame.node.argument,
        frame.context,
        'value',
      ),
    };
  }

  const result = takeGeneratorOutput(execution);

  if (result.type === 'completion') {
    return { type: 'pop', result };
  }

  if (result.type !== 'value') {
    throw new TypeError('Throw statement expected a value');
  }

  return completionAction(createThrowCompletion(result.value));
}

/**
 * @param {GeneratorExecution} execution
 * @param {string} source
 * @returns {Completion}
 */
function takeStatementCompletion(execution, source) {
  const result = takeGeneratorOutput(execution);

  if (result.type !== 'completion') {
    throw new TypeError(`${source} returned a non-completion result`);
  }

  return result.completion;
}

/**
 * @param {Completion} completion
 * @returns {GeneratorFrameAction}
 */
function completionAction(completion) {
  return {
    type: 'pop',
    result: { type: 'completion', completion },
  };
}

/**
 * @param {unknown} value
 * @returns {value is {
 *   type: string,
 *   value: unknown,
 *   target?: string | undefined,
 * }}
 */
function isCompletion(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'value' in value
  );
}
