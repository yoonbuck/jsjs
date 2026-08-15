import {
  EMPTY,
  createNormalCompletion,
  createReturnCompletion,
  createThrowCompletion,
  updateEmpty,
} from '../runtime/completion.js';
import { getIdentifierReference } from '../runtime/environment.js';
import { createUnsupportedNodeError } from '../runtime/errors.js';
import { evaluateStatement } from './statements.js';
import {
  applyVariableDeclaratorValue,
  evaluateNamedExpression,
} from './declarations.js';
import { evaluateExpressionValue } from './expressions.js';
import {
  createGeneratorExpressionFrame,
  createGeneratorClassFrame,
  createGeneratorPatternFrame,
  createNamedGeneratorExpressionFrame,
} from './generator-expression-frames.js';
import { initializePatternIdentifier } from './patterns.js';
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
 *
 * @typedef {{
 *   kind: 'statement-list',
 *   statements: any[],
 *   context: EvaluationContext,
 *   index: number,
 *   phase: 'next' | 'statement',
 *   completion: { type: string, value: unknown, target?: string | undefined },
 * }} StatementListFrame
 * @typedef {{
 *   kind: 'sync-statement',
 *   node: any,
 *   context: EvaluationContext,
 * }} SyncStatementFrame
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
 *   kind: 'empty-statement',
 *   node: any,
 *   context: EvaluationContext,
 * }} EmptyStatementFrame
 * @typedef {StatementListFrame | SyncStatementFrame | ExpressionStatementFrame
 *   | VariableDeclarationFrame | ReturnStatementFrame | ThrowStatementFrame
 *   | ClassDeclarationFrame | EmptyStatementFrame} GeneratorStatementFrame
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
 * @returns {GeneratorStatementFrame}
 */
export function createGeneratorStatementFrame(node, context) {
  if (node.type === 'EmptyStatement') {
    return { kind: 'empty-statement', node, context };
  }

  if (!generatorContainsYield(node, context)) {
    return { kind: 'sync-statement', node, context };
  }

  switch (node.type) {
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
    case 'expression-statement':
    case 'variable-declaration':
    case 'return-statement':
    case 'throw-statement':
    case 'class-declaration':
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
    evaluateStatement(frame.node, frame.context),
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
 * @param {{ type: string, value: unknown }} completion
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
