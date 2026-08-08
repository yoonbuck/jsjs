import {
  Reference,
  getValue,
  putValue,
  isEnvironmentRecord,
} from '../runtime/reference.js';
import {
  getIdentifierReference,
  newDeclarativeEnvironment,
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
  createUnsupportedOperatorError,
} from '../runtime/errors.js';
import { GuestErrorSignal } from '../runtime/completion.js';
import { SuperReferenceBase } from '../runtime/super-reference.js';
import {
  createFunctionObject,
  isAnonymousFunctionExpression,
} from './declarations.js';
// Direct-eval interception (see isDirectEvalCall) calls into the eval
// implementation. This closes a loop through the pre-existing intra-evaluator
// cycle expressions <-> declarations <-> statements; performEval is a
// call-time function reference, so the ES module live binding is resolved
// before it is ever invoked. No cycle crosses the realm/builtins boundary:
// eval.js does reach a builtin transitively (eval.js -> statements.js /
// declarations.js -> this module -> builtins/regexp.js), but that edge is
// acyclic because builtins/regexp.js imports only runtime modules and
// nothing from the evaluator, and no module here reaches realm.js.
import { performEval } from './eval.js';
import { createRegExpFromPattern } from '../builtins/regexp.js';

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
  'UpdateExpression',
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
 * Every node walked into is one frame of the realm's stack budget
 * (`src/runtime/stack-guard.js`): the evaluator recurses on the host stack in
 * step with the expression tree, so a call nested deep inside an expression
 * costs more host stack than a bare one, and the budget only bounds the host
 * stack if it sees that.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {Reference | unknown}
 */
export function evaluateExpression(node, context) {
  const guard = context.realm.stackGuard;

  guard.enter();

  try {
    switch (node.type) {
      case 'Literal':
        return evaluateLiteral(node, context);
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
      case 'UpdateExpression':
        return evaluateUpdateExpression(node, context);
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
  } finally {
    guard.exit();
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
 * ES5 15.10.4.1 makes each *evaluation* of a regular expression literal
 * produce a distinct new `RegExp` object — the ES3-to-ES5 change from a
 * single object shared across evaluations, so `function f() { return /a/; }
 * f() !== f()` holds. `node.regex.pattern`/`node.regex.flags` are Acorn's
 * ESTree extension carrying the literal's already-lexed pattern and flag
 * text; the pattern is re-validated and (re)compiled by
 * `createRegExpFromPattern` on every evaluation, exactly as a `new
 * RegExp(pattern, flags)` call would.
 *
 * Acorn (`ecmaVersion: 5`) rejects flags outside `g`/`i`/`m` and any pattern
 * its own regex dialect considers invalid, but its regex grammar is looser
 * than ES5.1 15.10.1's `Pattern` production: it accepts some patterns ES5
 * rejects, e.g. a bare `]` or `{` outside a character class. ES5.1 7.8.5
 * requires those to be *early* errors, so `checkRegularExpressionLiteral` in
 * `src/parser.js` re-validates every literal against 15.10.1 during parsing
 * and such a script never reaches evaluation at all.
 *
 * That makes the re-validation here redundant for the pattern text, and it is
 * kept anyway because this path still has to *construct* a fresh object per
 * 15.10.4.1 on every evaluation, and `createRegExpFromPattern` is the one
 * place that does it.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
function evaluateLiteral(node, context) {
  if (node.regex) {
    return createRegExpFromPattern(
      context.realm,
      node.regex.pattern,
      node.regex.flags,
    );
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
    case 'delete':
      return evaluateDeleteExpression(node.argument, context);
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
    case '~':
      // ECMA-262 5.1 §11.4.8: ~ applies the bitwise complement to the
      // operand's ToInt32 value, matching the binary bitwise operators.
      return ~toInt32(evaluateExpressionValue(node.argument, context));
    default:
      throw createUnsupportedOperatorError('unary', node.operator);
  }
}

/**
 * Implements ECMA-262 11.4.1 `delete` operator.
 *
 * Step 1: evaluate the argument as a Reference (not its value).
 * Step 2: non-Reference results (e.g. `delete (1+1)`) always return `true`.
 * Step 3: unresolvable references (base is `undefined`) return `true` — Acorn
 *         already rejects `delete <bareIdentifier>` in strict mode at parse
 *         time, so the strict SyntaxError branch of step 3.a is never reached
 *         at runtime.
 * Step 4/5: dispatch to `EngineObject#delete` (property reference) or
 *           `EnvironmentRecord#deleteBinding` (environment reference).
 *
 * @param {any} argument
 * @param {EvaluationContext} context
 * @returns {boolean}
 */
function evaluateDeleteExpression(argument, context) {
  const ref = evaluateExpression(argument, context);

  if (!(ref instanceof Reference)) {
    return true;
  }

  if (ref.base === undefined) {
    return true;
  }

  if (isEnvironmentRecord(ref.base)) {
    return ref.base.deleteBinding(ref.referencedName);
  }

  // Property reference: delegate to [[Delete]], which already throws a
  // GuestErrorSignal('TypeError') when strict is true and the property is
  // non-configurable.
  return /** @type {any} */ (ref.base).delete(ref.referencedName, ref.strict);
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
 * Applies a binary operator to two already-evaluated values (ECMA-262 §11.5–
 * §11.10). Extracted so `BinaryExpression` evaluation and compound assignment
 * can share a single dispatch site.
 *
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
    case 'in': {
      // ES5 11.8.7 step 5: check RHS type BEFORE any ToString(lval) call,
      // so a guest toString/valueOf on the LHS cannot run or override the
      // thrown error when the RHS is not an object.
      if (!(right instanceof EngineObject)) {
        throw new GuestErrorSignal(
          'TypeError',
          `Cannot use 'in' operator to search for key in ${right === null ? 'null' : typeof right}`,
        );
      }

      return right.hasProperty(toString(left));
    }
    case 'instanceof': {
      if (!(right instanceof EngineObject)) {
        throw new GuestErrorSignal(
          'TypeError',
          "Right-hand side of 'instanceof' is not an object",
        );
      }

      if (!isHasInstanceCallable(right)) {
        throw new GuestErrorSignal(
          'TypeError',
          "Right-hand side of 'instanceof' is not callable",
        );
      }

      return right.hasInstance(left);
    }
    default:
      // '|'
      return bitwiseOR(left, right);
  }
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

  return applyBinaryOperator(operator, left, right);
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
  if (
    node.left.type !== 'Identifier' &&
    node.left.type !== 'MemberExpression'
  ) {
    throw createUnsupportedNodeError(node.left);
  }

  const reference = /** @type {Reference} */ (
    evaluateExpression(node.left, context)
  );

  if (node.operator === '=') {
    const value =
      node.left.type === 'Identifier' &&
      isAnonymousFunctionExpression(node.right)
        ? createFunctionObject(node.right, context.env, context, {
            name: node.left.name,
          })
        : evaluateExpressionValue(node.right, context);
    putValue(reference, value);
    return value;
  }

  // Compound assignment: strip trailing '=' to get the binary operator.
  const binaryOperator = node.operator.slice(0, -1);

  if (!SUPPORTED_BINARY_OPERATORS.has(binaryOperator)) {
    throw createUnsupportedOperatorError('assignment', node.operator);
  }

  const leftValue = getValue(reference);
  const rightValue = evaluateExpressionValue(node.right, context);
  const result = applyBinaryOperator(binaryOperator, leftValue, rightValue);
  putValue(reference, result);
  return result;
}

/**
 * Implements prefix and postfix `++`/`--` (ECMA-262 §11.3, §11.4.4/11.4.5).
 * The argument is evaluated to a reference exactly once; `getValue` is called
 * once to obtain the old numeric value; `putValue` is called once with the
 * updated value; prefix forms return the new value, postfix return the old.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {number}
 */
function evaluateUpdateExpression(node, context) {
  if (
    node.argument.type !== 'Identifier' &&
    node.argument.type !== 'MemberExpression'
  ) {
    throw createUnsupportedNodeError(node.argument);
  }

  const reference = /** @type {Reference} */ (
    evaluateExpression(node.argument, context)
  );
  const oldValue = toNumber(getValue(reference));
  const newValue = node.operator === '++' ? oldValue + 1 : oldValue - 1;
  putValue(reference, newValue);
  return node.prefix ? newValue : oldValue;
}

/**
 * Evaluates a call expression (ECMA-262 11.2.3). The callee is evaluated to
 * a reference first so a property reference can supply the `this` value for
 * a method call, then the arguments are evaluated left to right, and only
 * then is the callee checked for callability — matching the specified
 * order, which is observable through argument side effects.
 *
 * A *direct* call to eval (15.1.2.1.1) is detected only after that same
 * order has run — callee reference, then arguments, then callability — and
 * routes into `performEval` with the *caller's* execution context so the
 * eval code shares this scope, `this`, and strictness. Every other call
 * form (including a call to the built-in eval that is not a bareword
 * `eval(...)`) goes through the ordinary call protocol, where the native
 * `eval` function performs an indirect eval in the realm's global scope.
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

  if (!isCallable(callee)) {
    throw new GuestErrorSignal(
      'TypeError',
      `${describeCallee(node.callee)} is not a function`,
    );
  }

  if (isDirectEvalCall(node.callee, calleeReference, callee, context)) {
    return performEval(args[0], context);
  }

  return /** @type {import('../runtime/descriptors.js').CallableLike} */ (
    callee
  ).callFunction(thisValue, args);
}

/**
 * Implements the direct-call determination of ECMA-262 15.1.2.1.1: a call is
 * a *direct* call to eval iff all of the following hold —
 *
 * 1. the callee AST node is an `Identifier` named `eval` (so `(0, eval)(x)`,
 *    `e = eval; e(x)`, `[eval][0](x)`, `eval.call(null, x)`, and `obj.eval(x)`
 *    are all indirect);
 * 2. evaluating it produced an environment-record `Reference` — not a
 *    property reference and not an unresolvable reference; and
 * 3. the resolved callee is *this realm's* own built-in `eval` function, so a
 *    call to another realm's eval is indirect even when it is a bareword
 *    `eval(...)`.
 *
 * @param {any} calleeNode
 * @param {Reference | unknown} calleeReference
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
 * Evaluates a `new` expression (ECMA-262 11.2.2), distinguishing callable
 * values from constructor values so built-ins can reject `new` without
 * affecting ordinary calls.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {unknown}
 */
function evaluateNewExpression(node, context) {
  const callee = evaluateExpressionValue(node.callee, context);
  const args = evaluateArguments(node.arguments ?? [], context);

  if (!isConstructor(callee)) {
    throw new GuestErrorSignal(
      'TypeError',
      `${describeCallee(node.callee)} is not a constructor`,
    );
  }

  return /** @type {any} */ (callee).constructFunction(args);
}

/**
 * Supplies a call's `this` value from the callee reference (ECMA-262
 * 11.2.3 step 7, `GetBase(ref)`): a property reference passes the base
 * value the reference was resolved against, while an environment-record
 * reference passes `undefined`, which non-strict functions then replace
 * with the global object.
 *
 * For a property reference on a primitive the base *value* is the
 * primitive itself; `evaluateMemberExpression` keeps it in the record's
 * `thisValue` while `base` holds the transient `ToObject` wrapper used to
 * resolve the lookup. Passing the primitive is what makes a strict method
 * see `this === "x"` rather than a wrapper it can never compare equal to;
 * a non-strict callee re-boxes it in `resolveThisValue` (10.4.3), so
 * non-strict receivers are unchanged. A reference carrying no base value —
 * one built directly rather than by a member expression — falls back to
 * the resolved object.
 *
 * @param {Reference | unknown} reference
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
  }

  // ECMA-262 5.1 §11.2.3 step 7 / §10.3.1: when the callee resolves through an
  // environment record, the `this` value comes from that record's
  // ImplicitThisValue. Only a `with` object record (provideThis) yields a
  // non-`undefined` value here; declarative and global records return
  // `undefined`.
  if (reference instanceof Reference && isEnvironmentRecord(reference.base)) {
    return reference.base.implicitThisValue();
  }

  return undefined;
}

/**
 * @param {unknown} value
 * @returns {value is import('../runtime/descriptors.js').CallableLike & {
 *   hasInstance: (argument: unknown) => boolean,
 * }}
 */
function isHasInstanceCallable(value) {
  return (
    isCallable(value) &&
    typeof (/** @type {any} */ (value).hasInstance) === 'function'
  );
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
  if (node.object.type === 'Super') {
    return evaluateSuperMemberExpression(node, context);
  }

  const baseValue = evaluateExpressionValue(node.object, context);
  const propertyKey = node.computed
    ? evaluateExpressionValue(node.property, context)
    : node.property.name;

  checkObjectCoercible(baseValue);

  return new Reference(
    toObjectBase(context.realm, baseValue),
    toString(propertyKey),
    context.strict,
    baseValue,
  );
}

/**
 * Evaluates a `super.prop`/`super[expr]` `MemberExpression` (ECMA-262
 * 12.3.5): resolves ES2015 `GetSuperBase` off the currently executing
 * method's `[[HomeObject]]` and builds a `SuperReferenceBase` so
 * `GetValue`/`PutValue` read and write through the home object's
 * *prototype* while keeping the method's own `this` as the receiver. A
 * missing `homeObject` (an ordinary function, reached only if some future
 * syntax addition parses `super` somewhere Acorn's own `allowSuper` check
 * should have already rejected) is defense in depth: it throws the same
 * guest `ReferenceError` a real engine's static early error would have
 * produced, documented as an intentional runtime fallback for what the
 * specification instead catches at parse time.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {Reference}
 */
function evaluateSuperMemberExpression(node, context) {
  const homeObject = context.homeObject;

  if (!(homeObject instanceof EngineObject)) {
    throw new GuestErrorSignal(
      'ReferenceError',
      "'super' keyword is only valid inside a method",
    );
  }

  const propertyKey = node.computed
    ? toString(evaluateExpressionValue(node.property, context))
    : node.property.name;

  return new Reference(
    new SuperReferenceBase(homeObject, context.thisValue),
    propertyKey,
    context.strict,
    context.thisValue,
  );
}

/**
 * Resolves the base of a property reference to an engine object.
 *
 * ES5 reaches a primitive's properties through `ToObject`, which boxes it
 * against the realm's `String`/`Number`/`Boolean` wrapper prototype
 * (ECMA-262 5.1 §11.2.1 step 6a). The property reference keeps the
 * original primitive as its base *value* (see `evaluateMemberExpression`),
 * so this wrapper only exists long enough to resolve the property lookup
 * and is discarded afterward. Nothing guest code can reach ever sees it:
 * `GetValue`/`PutValue` take 8.7.1/8.7.2's *special* `[[Get]]`/`[[Put]]`
 * for a primitive base — accessors receive the primitive, and a write that
 * would only create an own property on the wrapper is a strict `TypeError`
 * or a non-strict no-op — and a method call receives the primitive too.
 *
 * @param {import('../runtime/realm.js').Realm} realm
 * @param {unknown} baseValue
 * @returns {EngineObject}
 */
function toObjectBase(realm, baseValue) {
  if (baseValue instanceof EngineObject) {
    return baseValue;
  }

  return toObject(realm, baseValue);
}

/**
 * Evaluates a function expression. A *named* function expression gets its
 * own environment holding an immutable binding for the function name, so
 * the name resolves to the function inside its body without leaking into
 * the enclosing scope (ECMA-262 13).
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {import('../runtime/function-object.js').EngineFunction}
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
      const value = isAnonymousFunctionExpression(property.value)
        ? createFunctionObject(property.value, context.env, context, {
            name: key,
          })
        : evaluateExpressionValue(property.value, context);

      object.defineOwnProperty(key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      continue;
    }

    if (property.kind !== 'get' && property.kind !== 'set') {
      throw createUnsupportedNodeError(property);
    }

    const accessor = createFunctionObject(
      property.value,
      context.env,
      context,
      {
        name: `${property.kind} ${key}`,
        isMethod: true,
        homeObject: object,
      },
    );
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
