import { Reference, getValue, putValue } from '../runtime/reference.js';
import {
  getIdentifierReference,
  newDeclarativeEnvironment,
} from '../runtime/environment.js';
import { EngineObject } from '../runtime/object.js';
import { EngineFunction } from '../runtime/function-object.js';
import { EngineArray } from '../runtime/array-object.js';
import {
  checkObjectCoercible,
  toBoolean,
  toNumber,
  toString,
} from '../runtime/conversion.js';
import {
  abstractEqualityComparison,
  abstractRelationalComparison,
  add,
  divide,
  multiply,
  remainder,
  strictEqualityComparison,
  subtract,
  typeOf,
} from '../runtime/operators.js';
import {
  createUnsupportedNodeError,
  createUnsupportedOperationError,
  createUnsupportedOperatorError,
} from '../runtime/errors.js';
import { createFunctionObject } from './declarations.js';

/**
 * @typedef {import('./index.js').EvaluationContext} EvaluationContext
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
]);

/**
 * Every node type `evaluateExpression` dispatches. Exported so the
 * evaluator's entry point can route nodes by an explicit, single source of
 * truth instead of treating anything it does not recognize as a statement
 * as an expression.
 */
export const EXPRESSION_TYPES = new Set([
  'Literal',
  'Identifier',
  'ThisExpression',
  'UnaryExpression',
  'BinaryExpression',
  'LogicalExpression',
  'ConditionalExpression',
  'AssignmentExpression',
  'CallExpression',
  'MemberExpression',
  'FunctionExpression',
  'ObjectExpression',
  'ArrayExpression',
  'NewExpression',
  'SequenceExpression',
]);

/**
 * Evaluates an expression node. Mirroring the specification, `Identifier`
 * nodes evaluate to a `Reference` (so assignment and `typeof` can inspect it
 * without triggering `GetValue`); every other supported expression
 * evaluates directly to its dereferenced runtime value. Callers that always
 * want a value should use `evaluateExpressionValue` instead.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {Reference | unknown}
 */
export function evaluateExpression(node, context) {
  switch (node.type) {
    case 'Literal':
      return evaluateLiteral(node);
    case 'Identifier':
      return getIdentifierReference(context.env, node.name, context.strict);
    case 'ThisExpression':
      return context.thisValue;
    case 'UnaryExpression':
      return evaluateUnaryExpression(node, context);
    case 'BinaryExpression':
      return evaluateBinaryExpression(node, context);
    case 'LogicalExpression':
      return evaluateLogicalExpression(node, context);
    case 'ConditionalExpression':
      return evaluateConditionalExpression(node, context);
    case 'AssignmentExpression':
      return evaluateAssignmentExpression(node, context);
    case 'CallExpression':
      return evaluateCallExpression(node, context);
    case 'MemberExpression':
      return evaluateMemberExpression(node, context);
    case 'FunctionExpression':
      return evaluateFunctionExpression(node, context);
    case 'ObjectExpression':
      return evaluateObjectExpression(node, context);
    case 'ArrayExpression':
      return evaluateArrayExpression(node, context);
    case 'NewExpression':
      return evaluateNewExpression(node, context);
    case 'SequenceExpression':
      return evaluateSequenceExpression(node, context);
    default:
      throw createUnsupportedNodeError(node);
  }
}

/**
 * Evaluates an expression node to its dereferenced runtime value, applying
 * `GetValue` when `evaluateExpression` returns a `Reference`.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
export function evaluateExpressionValue(node, context) {
  const result = evaluateExpression(node, context);
  return result instanceof Reference ? getValue(result) : result;
}

/**
 * @param {any} node
 * @returns {unknown}
 */
function evaluateLiteral(node) {
  if (node.regex) {
    // No guest RegExp object exists yet; reject explicitly instead of
    // leaking the host RegExp instance Acorn attaches as `node.value`.
    throw createUnsupportedNodeError({ type: 'RegExpLiteral' });
  }

  return node.value;
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
function evaluateUnaryExpression(node, context) {
  switch (node.operator) {
    case 'typeof':
      return evaluateTypeofExpression(node.argument, context);
    case 'void':
      evaluateExpressionValue(node.argument, context);
      return undefined;
    case '!':
      return !toBoolean(evaluateExpressionValue(node.argument, context));
    case '-':
      return -toNumber(evaluateExpressionValue(node.argument, context));
    case '+':
      return toNumber(evaluateExpressionValue(node.argument, context));
    default:
      throw createUnsupportedOperatorError('unary', node.operator);
  }
}

/**
 * `typeof` on an unresolvable identifier reference evaluates to
 * `'undefined'` instead of throwing a `ReferenceError` (ECMA-262 11.4.3),
 * so an unresolved `Identifier` argument needs special handling ahead of
 * the normal `GetValue` path every other unary operator uses.
 *
 * @param {any} argument
 * @param {EvaluationContext} context
 * @returns {string}
 */
function evaluateTypeofExpression(argument, context) {
  if (argument.type === 'Identifier') {
    const reference = getIdentifierReference(
      context.env,
      argument.name,
      context.strict,
    );

    if (reference.base === undefined) {
      return 'undefined';
    }

    return typeOf(getValue(reference));
  }

  return typeOf(evaluateExpressionValue(argument, context));
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
function evaluateBinaryExpression(node, context) {
  const operator = node.operator;

  if (!SUPPORTED_BINARY_OPERATORS.has(operator)) {
    throw createUnsupportedOperatorError('binary', operator);
  }

  const left = evaluateExpressionValue(node.left, context);
  const right = evaluateExpressionValue(node.right, context);

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
    default: {
      // '>='
      const result = abstractRelationalComparison(left, right, true);
      return result === undefined || result === true ? false : true;
    }
  }
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
function evaluateLogicalExpression(node, context) {
  const left = evaluateExpressionValue(node.left, context);

  if (node.operator === '&&') {
    return toBoolean(left)
      ? evaluateExpressionValue(node.right, context)
      : left;
  }

  if (node.operator === '||') {
    return toBoolean(left)
      ? left
      : evaluateExpressionValue(node.right, context);
  }

  throw createUnsupportedOperatorError('logical', node.operator);
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
function evaluateConditionalExpression(node, context) {
  const test = toBoolean(evaluateExpressionValue(node.test, context));

  return test
    ? evaluateExpressionValue(node.consequent, context)
    : evaluateExpressionValue(node.alternate, context);
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
function evaluateAssignmentExpression(node, context) {
  if (node.operator !== '=') {
    throw createUnsupportedOperatorError('assignment', node.operator);
  }

  if (
    node.left.type !== 'Identifier' &&
    node.left.type !== 'MemberExpression'
  ) {
    // Only identifier and property references are valid ES5 assignment
    // targets; reject anything else explicitly rather than guessing at
    // semantics.
    throw createUnsupportedNodeError(node.left);
  }

  const reference = evaluateExpression(node.left, context);
  const value = evaluateExpressionValue(node.right, context);
  putValue(/** @type {Reference} */ (reference), value);
  return value;
}

/**
 * Evaluates a call expression (ECMA-262 11.2.3). The callee is evaluated to
 * a reference first so a property reference can supply the `this` value for
 * a method call, then the arguments are evaluated left to right, and only
 * then is the callee checked for callability — matching the specified
 * order, which is observable through argument side effects.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
function evaluateCallExpression(node, context) {
  const calleeReference = evaluateExpression(node.callee, context);
  const callee =
    calleeReference instanceof Reference
      ? getValue(calleeReference)
      : calleeReference;
  const thisValue = referenceThisValue(calleeReference);
  const args = evaluateArguments(node.arguments, context);

  if (!(callee instanceof EngineFunction)) {
    throw new TypeError(`${describeCallee(node.callee)} is not a function`);
  }

  return callee.callFunction(thisValue, args);
}

/**
 * Evaluates a comma expression (ECMA-262 11.14): every operand is
 * evaluated for its side effects, and the last one supplies the value.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
function evaluateSequenceExpression(node, context) {
  /** @type {unknown} */
  let value;

  for (const expression of node.expressions) {
    value = evaluateExpressionValue(expression, context);
  }

  return value;
}

/**
 * Evaluates a `new` expression (ECMA-262 11.2.2). Every function object in
 * this milestone is also a constructor, so the constructability check and
 * the callability check coincide.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
function evaluateNewExpression(node, context) {
  const callee = evaluateExpressionValue(node.callee, context);
  const args = evaluateArguments(node.arguments ?? [], context);

  if (!(callee instanceof EngineFunction)) {
    throw new TypeError(`${describeCallee(node.callee)} is not a constructor`);
  }

  return callee.constructFunction(args);
}

/**
 * Supplies a call's `this` value from the callee reference: a property
 * reference passes its base object (method-call receiver binding), while an
 * environment-record reference passes `undefined`, which non-strict
 * functions then replace with the global object.
 *
 * @param {Reference | unknown} reference
 * @returns {unknown}
 */
function referenceThisValue(reference) {
  if (
    reference instanceof Reference &&
    reference.base instanceof EngineObject
  ) {
    return reference.base;
  }

  return undefined;
}

/**
 * @param {any[]} nodes
 * @param {EvaluationContext} context
 * @returns {unknown[]}
 */
function evaluateArguments(nodes, context) {
  /** @type {unknown[]} */
  const args = [];

  for (const argument of nodes) {
    args.push(evaluateExpressionValue(argument, context));
  }

  return args;
}

/**
 * Builds a short, source-like description of a callee for `TypeError`
 * messages without exposing engine internals or guest values.
 *
 * @param {any} node
 * @returns {string}
 */
function describeCallee(node) {
  if (node.type === 'Identifier') {
    return node.name;
  }

  return 'expression';
}

/**
 * Evaluates a member expression to a *property reference* (ECMA-262
 * 11.2.1) rather than to a value, so assignment targets, `delete`, and
 * method calls can all see the base object the reference was resolved
 * against. The specified evaluation order is preserved: the object
 * expression first, then the property expression, and only then the
 * object-coercible check and property-key conversion.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {Reference}
 */
function evaluateMemberExpression(node, context) {
  const baseValue = evaluateExpressionValue(node.object, context);
  const propertyKey = node.computed
    ? evaluateExpressionValue(node.property, context)
    : node.property.name;

  checkObjectCoercible(baseValue);

  return new Reference(
    toObjectBase(baseValue),
    toString(propertyKey),
    context.strict,
    baseValue,
  );
}

/**
 * Resolves the base of a property reference to an engine object.
 *
 * ES5 reaches a primitive's properties through `ToObject`, which builds a
 * `String`/`Number`/`Boolean` wrapper. No wrapper constructors exist in
 * this milestone, so a primitive base is rejected explicitly instead of
 * being silently treated as an object or leaking a host value.
 *
 * @param {unknown} baseValue
 * @returns {EngineObject}
 */
function toObjectBase(baseValue) {
  if (baseValue instanceof EngineObject) {
    return baseValue;
  }

  throw createUnsupportedOperationError(
    `ToObject on a ${typeof baseValue} value`,
  );
}

/**
 * Evaluates a function expression. A *named* function expression gets its
 * own environment holding an immutable binding for the function name, so
 * the name resolves to the function inside its body without leaking into
 * the enclosing scope (ECMA-262 13).
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {EngineFunction}
 */
function evaluateFunctionExpression(node, context) {
  if (!node.id) {
    return createFunctionObject(node, context.env, context);
  }

  const functionEnvironment = newDeclarativeEnvironment(context.env);
  functionEnvironment.createImmutableBinding(node.id.name);

  const functionObject = createFunctionObject(
    node,
    functionEnvironment,
    context,
  );
  functionEnvironment.initializeBinding(node.id.name, functionObject);

  return functionObject;
}

/**
 * Evaluates an object literal (ECMA-262 11.1.5). Each property is defined
 * with `[[DefineOwnProperty]]` rather than `[[Put]]`, so literal
 * properties are unaffected by inherited setters and accessor pairs for
 * one key merge into a single accessor property.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {EngineObject}
 */
function evaluateObjectExpression(node, context) {
  const object = new EngineObject(context.realm.intrinsics.objectPrototype);

  for (const property of node.properties) {
    if (property.type !== 'Property' || property.computed) {
      // ES5 object literals only have plain `Property` members with
      // literal keys; spread, shorthand methods, and computed keys are
      // later-edition forms.
      throw createUnsupportedNodeError(property);
    }

    const key = evaluatePropertyKey(property.key);

    if (property.kind === 'init') {
      object.defineOwnProperty(key, {
        value: evaluateExpressionValue(property.value, context),
        writable: true,
        enumerable: true,
        configurable: true,
      });
      continue;
    }

    if (property.kind !== 'get' && property.kind !== 'set') {
      throw createUnsupportedNodeError(property);
    }

    const accessor = createFunctionObject(property.value, context.env, context);
    object.defineOwnProperty(key, {
      ...(property.kind === 'get' ? { get: accessor } : { set: accessor }),
      enumerable: true,
      configurable: true,
    });
  }

  return object;
}

/**
 * Converts an object literal's property-name node to its string property
 * key: identifier names are used verbatim, and literal names go through
 * `ToString` so `{1: x}` and `{"1": x}` name the same property.
 *
 * @param {any} node
 * @returns {string}
 */
function evaluatePropertyKey(node) {
  if (node.type === 'Identifier') {
    return node.name;
  }

  if (node.type === 'Literal' && !node.regex) {
    return toString(node.value);
  }

  throw createUnsupportedNodeError(node);
}

/**
 * Evaluates an array literal (ECMA-262 11.1.4). Elisions define no
 * property — leaving a hole the array still counts in `length` — so the
 * literal's `length` is set from the element list after the present
 * elements have been defined.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {EngineArray}
 */
function evaluateArrayExpression(node, context) {
  const array = new EngineArray(context.realm.intrinsics.arrayPrototype);

  for (let index = 0; index < node.elements.length; index += 1) {
    const element = node.elements[index];

    if (element === null) {
      continue;
    }

    if (element.type === 'SpreadElement') {
      throw createUnsupportedNodeError(element);
    }

    array.defineOwnProperty(String(index), {
      value: evaluateExpressionValue(element, context),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  array.defineOwnProperty('length', { value: node.elements.length });

  return array;
}
