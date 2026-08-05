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
  try {
    return acornParse(source, {
      ...options,
      ...PARSER_OPTIONS,
    });
  } catch (error) {
    throw normalizeSyntaxError(error);
  }
}
