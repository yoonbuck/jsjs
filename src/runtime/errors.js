/**
 * @param {unknown} error
 * @returns {SyntaxError}
 */
export function normalizeSyntaxError(error) {
  const message =
    error instanceof Error
      ? error.message
      : error &&
          typeof error === 'object' &&
          typeof (/** @type {any} */ (error).message) === 'string'
        ? /** @type {any} */ (error).message
        : String(error);
  const normalized = new SyntaxError(message);

  if (error && typeof error === 'object') {
    /** @type {any} */ (normalized).pos = /** @type {any} */ (error).pos;
    /** @type {any} */ (normalized).index = /** @type {any} */ (error).pos;
    /** @type {any} */ (normalized).loc = /** @type {any} */ (error).loc;

    const loc = /** @type {{ line?: number, column?: number } | undefined} */ (
      /** @type {any} */ (error).loc
    );

    if (loc && typeof loc.line === 'number') {
      /** @type {any} */ (normalized).lineNumber = loc.line;
    }

    if (loc && typeof loc.column === 'number') {
      /** @type {any} */ (normalized).columnNumber = loc.column + 1;
    }
  }

  return normalized;
}

/**
 * @param {string} referenceName
 * @returns {ReferenceError}
 */
export function createUnresolvableReferenceError(referenceName) {
  const error = new ReferenceError(
    `Cannot resolve unresolvable reference ${referenceName}`,
  );
  /** @type {any} */ (error).referenceName = referenceName;
  return error;
}

/**
 * @param {string} bindingName
 * @returns {ReferenceError}
 */
export function createUninitializedBindingError(bindingName) {
  const error = new ReferenceError(
    `Cannot access uninitialized binding ${bindingName}`,
  );
  /** @type {any} */ (error).referenceName = bindingName;
  return error;
}

/**
 * Signals that the API's minimal AST dispatcher has not yet implemented
 * evaluation for a given node type. This is an engine-limitation error, not a
 * guest-visible completion, and is expected to disappear as the evaluator
 * (Task 5) grows support for more node types.
 */
export class UnsupportedNodeError extends Error {
  /**
   * @param {string} nodeType
   */
  constructor(nodeType) {
    super(`Unsupported AST node: ${nodeType}`);
    this.name = 'UnsupportedNodeError';
    /** @type {string} */
    this.nodeType = nodeType;
  }
}

/**
 * @param {{ type?: unknown } | null | undefined} node
 * @returns {UnsupportedNodeError}
 */
export function createUnsupportedNodeError(node) {
  const type =
    node && typeof node === 'object' && typeof node.type === 'string'
      ? node.type
      : String(node);
  return new UnsupportedNodeError(type);
}

/**
 * Signals that the evaluator recognizes a node (e.g. `UnaryExpression`,
 * `BinaryExpression`, `AssignmentExpression`) but not the specific operator
 * it carries (e.g. bitwise `&`, compound `+=`). This is an engine-limitation
 * error distinct from `UnsupportedNodeError`, which is reserved for AST node
 * types the evaluator does not dispatch at all.
 */
export class UnsupportedOperatorError extends Error {
  /**
   * @param {string} kind
   * @param {string} operator
   */
  constructor(kind, operator) {
    super(`Unsupported ${kind} operator: ${operator}`);
    this.name = 'UnsupportedOperatorError';
    /** @type {string} */
    this.kind = kind;
    /** @type {string} */
    this.operator = operator;
  }
}

/**
 * @param {string} kind
 * @param {string} operator
 * @returns {UnsupportedOperatorError}
 */
export function createUnsupportedOperatorError(kind, operator) {
  return new UnsupportedOperatorError(kind, operator);
}

/**
 * Signals that the engine recognizes an operation but cannot perform it
 * yet because a piece of the runtime it depends on does not exist. It is
 * used for `ToObject` on a primitive value, which ES5 answers with a
 * `String`/`Number`/`Boolean` wrapper object — none of which this
 * milestone provides. Like the unsupported-node/operator errors this is an
 * engine-limitation error, not a guest-visible completion.
 */
export class UnsupportedOperationError extends Error {
  /**
   * @param {string} operation
   */
  constructor(operation) {
    super(`Unsupported runtime operation: ${operation}`);
    this.name = 'UnsupportedOperationError';
    /** @type {string} */
    this.operation = operation;
  }
}

/**
 * @param {string} operation
 * @returns {UnsupportedOperationError}
 */
export function createUnsupportedOperationError(operation) {
  return new UnsupportedOperationError(operation);
}
