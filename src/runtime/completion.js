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
