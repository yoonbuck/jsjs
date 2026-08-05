/**
 * @param {unknown} error
 * @returns {SyntaxError}
 */
export function normalizeSyntaxError(error) {
  const message = error instanceof Error ? error.message : String(error);
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
