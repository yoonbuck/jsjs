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
