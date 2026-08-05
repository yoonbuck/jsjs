/**
 * Sentinel marking a completion's [[value]] as spec-"empty" rather than the
 * guest value `undefined`. Statements whose evaluation produces no value
 * (`EmptyStatement`, `VariableStatement`, an untaken `if` branch, etc.) use
 * this so `updateEmpty` can thread the last real value through a statement
 * list or loop, matching ECMA-262's `UpdateEmpty` abstract operation.
 */
export const EMPTY = Symbol('empty');

/**
 * @param {unknown} value
 * @returns {{ type: 'normal', value: unknown }}
 */
export function createNormalCompletion(value) {
  return { type: 'normal', value };
}

/**
 * @param {string | undefined} target
 * @param {unknown} [value]
 * @returns {{ type: 'break', target: string | undefined, value: unknown }}
 */
export function createBreakCompletion(target, value) {
  return { type: 'break', target, value };
}

/**
 * @param {string | undefined} target
 * @param {unknown} [value]
 * @returns {{ type: 'continue', target: string | undefined, value: unknown }}
 */
export function createContinueCompletion(target, value) {
  return { type: 'continue', target, value };
}

/**
 * @param {unknown} value
 * @returns {{ type: 'return', value: unknown }}
 */
export function createReturnCompletion(value) {
  return { type: 'return', value };
}

/**
 * @param {unknown} value
 * @returns {{ type: 'throw', value: unknown }}
 */
export function createThrowCompletion(value) {
  return { type: 'throw', value };
}

/**
 * Implements ECMA-262's `UpdateEmpty(completionRecord, value)`: when the
 * completion's own value is the `EMPTY` sentinel, return an equivalent
 * completion carrying `value` instead; otherwise return the completion
 * unchanged. Used by statement lists and loops to thread the last
 * meaningful value through statements (`EmptyStatement`, `var`
 * declarations, untaken `if` branches, `break`/`continue`) that do not
 * themselves produce one.
 *
 * @template {{ type: string, value: unknown }} T
 * @param {T} completion
 * @param {unknown} value
 * @returns {T}
 */
export function updateEmpty(completion, value) {
  if (completion.value !== EMPTY) {
    return completion;
  }

  return { ...completion, value };
}
