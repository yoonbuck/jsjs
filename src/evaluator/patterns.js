import { EngineArray } from '../runtime/array-object.js';
import { toObject } from '../runtime/conversion.js';
import { getIdentifierReference } from '../runtime/environment.js';
import { createUnsupportedNodeError } from '../runtime/errors.js';
import {
  getIterator,
  iteratorClose,
  iteratorStep,
  iteratorValue,
} from '../runtime/iterator.js';
import { Reference, getValue, putValue } from '../runtime/reference.js';
import { evaluateNamedExpression } from './declarations.js';
import {
  applyPreparedAssignmentTarget,
  evaluateExpressionValue,
  prepareAssignmentTarget,
} from './expressions.js';
import { evaluatePropertyName } from './property-name.js';

/**
 * @typedef {import('./index.js').EvaluationContext} EvaluationContext
 * @typedef {import('../runtime/environment.js').EnvironmentRecordLike} EnvironmentRecordLike
 * @typedef {{
 *   prepare(target: any): unknown,
 *   apply(prepared: unknown, value: unknown): void,
 * }} PatternTargetOperations
 */

/**
 * @param {any} pattern
 * @param {unknown} value
 * @param {EnvironmentRecordLike} env
 * @param {EvaluationContext} context
 * @returns {void}
 */
export function initializeBindingPattern(pattern, value, env, context) {
  applyPattern(pattern, value, context, {
    prepare(target) {
      return getIdentifierReference(env, target.name, context.strict);
    },
    apply(prepared, nextValue) {
      const reference =
        /** @type {import('../runtime/reference.js').Reference} */ (prepared);
      const record =
        /** @type {{ initializeBinding(name: string, value: unknown): void }} */ (
          reference.base
        );
      record.initializeBinding(
        /** @type {string} */ (reference.referencedName),
        nextValue,
      );
    },
  });
}

/**
 * @param {any} pattern
 * @param {unknown} value
 * @param {EvaluationContext} context
 * @returns {void}
 */
export function assignPattern(pattern, value, context) {
  applyPattern(pattern, value, context, {
    prepare(target) {
      return prepareAssignmentTarget(target, context);
    },
    apply(prepared, nextValue) {
      applyPreparedAssignmentTarget(
        /** @type {any} */ (prepared),
        nextValue,
        context,
      );
    },
  });
}

/**
 * Assigns a `var` binding pattern, resolving each identifier only when its
 * value is ready to be written.
 *
 * @param {any} pattern
 * @param {unknown} value
 * @param {EvaluationContext} context
 * @returns {void}
 */
export function assignBindingPattern(pattern, value, context) {
  applyPattern(pattern, value, context, {
    prepare(target) {
      return target;
    },
    apply(prepared, nextValue) {
      const target = /** @type {any} */ (prepared);
      const reference = getIdentifierReference(
        context.env,
        target.name,
        context.strict,
      );
      putValue(reference, nextValue);
    },
  });
}

/**
 * @param {any} pattern
 * @param {unknown} value
 * @param {EvaluationContext} context
 * @param {PatternTargetOperations} targetOperations
 * @param {unknown} [preparedTarget]
 * @returns {void}
 */
function applyPattern(
  pattern,
  value,
  context,
  targetOperations,
  preparedTarget,
) {
  const guard = context.realm.stackGuard;
  guard.enter();

  try {
    switch (pattern.type) {
      case 'Identifier':
      case 'MemberExpression':
        targetOperations.apply(
          preparedTarget === undefined
            ? targetOperations.prepare(pattern)
            : preparedTarget,
          value,
        );
        return;
      case 'AssignmentPattern':
        applyPattern(
          pattern.left,
          value === undefined
            ? evaluatePatternDefault(pattern, context)
            : value,
          context,
          targetOperations,
          preparedTarget === undefined
            ? preparePatternTarget(pattern.left, targetOperations)
            : preparedTarget,
        );
        return;
      case 'ObjectPattern':
        applyObjectPattern(pattern, value, context, targetOperations);
        return;
      case 'ArrayPattern':
        applyArrayPattern(pattern, value, context, targetOperations);
        return;
      case 'RestElement':
        applyPattern(
          pattern.argument,
          value,
          context,
          targetOperations,
          preparedTarget,
        );
        return;
      default:
        throw createUnsupportedNodeError(pattern);
    }
  } finally {
    guard.exit();
  }
}

/**
 * @param {any} pattern
 * @param {PatternTargetOperations} targetOperations
 * @returns {unknown}
 */
function preparePatternTarget(pattern, targetOperations) {
  if (pattern.type === 'Identifier' || pattern.type === 'MemberExpression') {
    return targetOperations.prepare(pattern);
  }

  if (pattern.type === 'AssignmentPattern') {
    return preparePatternTarget(pattern.left, targetOperations);
  }

  if (pattern.type === 'RestElement') {
    return preparePatternTarget(pattern.argument, targetOperations);
  }

  return undefined;
}

/**
 * @param {any} pattern
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
function evaluatePatternDefault(pattern, context) {
  if (pattern.left.type === 'Identifier') {
    return evaluateNamedExpression(pattern.right, context, pattern.left.name);
  }

  return evaluateExpressionValue(pattern.right, context);
}

/**
 * @param {any} pattern
 * @param {unknown} value
 * @param {EvaluationContext} context
 * @param {PatternTargetOperations} targetOperations
 * @returns {void}
 */
function applyObjectPattern(pattern, value, context, targetOperations) {
  const object = toObject(context.realm, value);

  for (const property of pattern.properties) {
    if (property.type !== 'Property') {
      throw createUnsupportedNodeError(property);
    }

    const key = evaluatePropertyName(property.key, property.computed, context);
    const preparedTarget = preparePatternTarget(
      property.value,
      targetOperations,
    );
    const propertyValue = getValue(
      new Reference(object, key, context.strict, value),
    );
    applyPattern(
      property.value,
      propertyValue,
      context,
      targetOperations,
      preparedTarget,
    );
  }
}

/**
 * @param {any} pattern
 * @param {unknown} value
 * @param {EvaluationContext} context
 * @param {PatternTargetOperations} targetOperations
 * @returns {void}
 */
function applyArrayPattern(pattern, value, context, targetOperations) {
  const record = getIterator(context.realm, value);
  let done = false;

  for (const element of pattern.elements) {
    if (element && element.type === 'RestElement') {
      let preparedTarget;
      try {
        preparedTarget = preparePatternTarget(
          element.argument,
          targetOperations,
        );
      } catch (error) {
        if (!done) {
          iteratorClose(context.realm, record, true);
        }
        throw error;
      }
      const rest = new EngineArray(context.realm.intrinsics.arrayPrototype);
      let index = 0;

      while (!done) {
        const step = iteratorStep(record);
        if (step === false) {
          done = true;
          break;
        }

        const nextValue = iteratorValue(step);
        rest.defineOwnProperty(String(index), {
          value: nextValue,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        index += 1;
      }

      applyPattern(
        element.argument,
        rest,
        context,
        targetOperations,
        preparedTarget,
      );
      continue;
    }

    let preparedTarget;
    try {
      preparedTarget =
        element === null
          ? undefined
          : preparePatternTarget(element, targetOperations);
    } catch (error) {
      if (!done) {
        iteratorClose(context.realm, record, true);
      }
      throw error;
    }
    let nextValue;
    if (!done) {
      const step = iteratorStep(record);
      if (step === false) {
        done = true;
      } else if (element !== null) {
        nextValue = iteratorValue(step);
      }
    }

    if (element === null) {
      continue;
    }

    try {
      applyPattern(
        element,
        nextValue,
        context,
        targetOperations,
        preparedTarget,
      );
    } catch (error) {
      if (!done) {
        iteratorClose(context.realm, record, true);
      }
      throw error;
    }
  }

  if (!done) {
    iteratorClose(context.realm, record, false);
  }
}
