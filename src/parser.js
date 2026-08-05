import { parse as acornParse } from 'acorn';
import { normalizeSyntaxError } from './runtime/errors.js';

const PARSER_OPTIONS = Object.freeze({
  ecmaVersion: 5,
  sourceType: 'script',
  locations: true,
  ranges: true,
});

/**
 * @param {string} source
 * @param {Record<string, unknown>} [options]
 * @returns {any}
 */
export function parseScript(source, options = {}) {
  const { parse = acornParse, ...parserOptions } = options;

  if (typeof parse !== 'function') {
    throw new TypeError('Expected options.parse to be a function');
  }

  let program;

  try {
    program = parse(source, {
      ...parserOptions,
      ...PARSER_OPTIONS,
    });
  } catch (error) {
    if (isSyntaxErrorLike(error)) {
      throw normalizeSyntaxError(error);
    }

    throw error;
  }

  return validateScriptProgram(program);
}

/**
 * @param {unknown} program
 * @returns {any}
 */
function validateScriptProgram(program) {
  if (
    !program ||
    typeof program !== 'object' ||
    /** @type {any} */ (program).type !== 'Program' ||
    /** @type {any} */ (program).sourceType !== 'script' ||
    !Array.isArray(/** @type {any} */ (program).body)
  ) {
    throw new TypeError('Expected parser to return a script Program node');
  }

  return /** @type {any} */ (program);
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isSyntaxErrorLike(error) {
  return (
    error instanceof SyntaxError ||
    (!!error &&
      typeof error === 'object' &&
      typeof (/** @type {any} */ (error).message) === 'string' &&
      typeof (/** @type {any} */ (error).pos) === 'number' &&
      !!/** @type {any} */ (error).loc)
  );
}
